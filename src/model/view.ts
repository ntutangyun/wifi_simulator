/**
 * ViewState: everything the UI shows at one instant. Maintained live by the
 * engine (applying every record as it is emitted) and reconstructed by the
 * player from (snapshot ≤ t) + record replay — the reducer is the single
 * source of truth for both, which guarantees snapshot/replay equivalence.
 */
import { hasFeature, linkPlanFor, physicalId } from './caps'
import type { FrameDesc } from './frames'
import type { MacStateName, TLRecord } from './records'
import type { Scenario } from './scenario'
import type { Ns } from './types'

export interface QueuedMsduView {
  id: number
  bytes: number
  dst: string
  bornNs: Ns
  /** EDCA access category it was queued in (undefined on legacy DCF nodes). */
  ac?: number
  /** Cloud server this frame belongs to, and (replies only) the request it answers. */
  server?: string
  rttFromNs?: Ns
  /**
   * Handed to the PHY and not yet acknowledged. The MAC takes an MSDU off its
   * AC queue at TX start and gives it back on failure (§10.23.2.2 retry), so
   * the frame still belongs to the queue until the ACK/BA removes it.
   */
  inFlight: boolean
}

/**
 * Delivery latency accumulator: queue arrival (ENQUEUE) to the acknowledgement
 * that removes the MSDU (DEQUEUE). Covers queueing, AIFS, backoff and every
 * retry; dropped frames are not timed. Mean = sumNs / n.
 */
export interface LatencyStats {
  n: number
  sumNs: Ns
  maxNs: Ns
}

export interface NodeStats {
  txOk: number
  txFail: number
  retries: number
  drops: number
  bytesDelivered: number
  airtimeNs: Ns
  collisions: number
  /** Frames this node queued and got acknowledged (a station's uplink; the AP's downlink as a whole). */
  txLatency: LatencyStats
  /** Frames delivered to this node (a station's downlink). */
  rxLatency: LatencyStats
  /**
   * Application round trip seen by this station: an uplink request's birth to
   * the delivery of the server's reply (Wi-Fi up, WAN, server, WAN, Wi-Fi down).
   */
  appRtt: LatencyStats
  /** Server the app RTT was measured against (the last reply's). */
  appRttServer?: string
}

function addLatency(l: LatencyStats, dtNs: Ns): void {
  l.n += 1
  l.sumNs += dtNs
  if (dtNs > l.maxNs) l.maxNs = dtNs
}

export interface AcView {
  backoff: number | null
  cw: number
  queueLen: number
  /** This AC's own interframe wait — several ACs can be mid-IFS at once. */
  ifs: { kind: 'DIFS' | 'EIFS' | 'SIFS' | 'AIFS'; untilNs: Ns } | null
}

export interface NodeView {
  state: MacStateName
  ccaBusy: boolean
  backoff: number | null
  cw: number
  ssrc: number
  slrc: number
  navUntilNs: Ns
  ifs: { kind: 'DIFS' | 'EIFS' | 'SIFS' | 'AIFS'; untilNs: Ns; ac?: number } | null
  queue: QueuedMsduView[]
  currentTx: FrameDesc | null
  currentRx: { frame: FrameDesc; from: string } | null
  /**
   * Last accepted data seqNo per sender (duplicate detection, §10.3.2.11): a
   * retransmission after a lost ACK arrives twice and must be counted once.
   */
  rxSeq: Record<string, number>
  stats: NodeStats
  /** Per-AC contention detail (EDCA nodes). Index 0..3 = BK,BE,VI,VO. */
  acs: AcView[] | null
  txopUntilNs: Ns
  txopAc: number
}

export interface FlightView {
  from: string
  frame: FrameDesc
  startNs: Ns
  endNs: Ns
}

/** A frame crossing the WAN between the AP and a cloud server. */
export interface WanFlight {
  server: string
  dir: 'up' | 'down'
  /** The station the frame is from (up) or for (down). */
  peer: string
  startNs: Ns
  endNs: Ns
}

export interface ServerView {
  bytesUp: number
  bytesDown: number
}

export interface ViewState {
  t: Ns
  nodes: Record<string, NodeView>
  inFlight: FlightView[]
  /** Frames currently crossing the WAN (pruned as time passes their arrival). */
  wan: WanFlight[]
  servers: Record<string, ServerView>
}

export interface Snapshot {
  t: Ns
  view: ViewState
}

export function initViewState(sc: Scenario): ViewState {
  const nodes: Record<string, NodeView> = {}
  const plan = linkPlanFor(sc.nodes)
  for (const vid of plan.virtualIds) {
    const cfg = sc.nodes.find((n) => n.id === physicalId(vid))!
    const edca = hasFeature(cfg, 'edca')
    nodes[vid] = {
      state: 'idle', ccaBusy: false, backoff: null, cw: 15, ssrc: 0, slrc: 0,
      navUntilNs: 0, ifs: null, queue: [], currentTx: null, currentRx: null, rxSeq: {},
      stats: {
        txOk: 0, txFail: 0, retries: 0, drops: 0, bytesDelivered: 0, airtimeNs: 0, collisions: 0,
        txLatency: { n: 0, sumNs: 0, maxNs: 0 }, rxLatency: { n: 0, sumNs: 0, maxNs: 0 },
        appRtt: { n: 0, sumNs: 0, maxNs: 0 },
      },
      acs: edca ? [0, 1, 2, 3].map(() => ({ backoff: null, cw: 15, queueLen: 0, ifs: null })) : null,
      txopUntilNs: 0, txopAc: -1,
    }
  }
  const servers: Record<string, ServerView> = {}
  for (const s of sc.servers) servers[s.id] = { bytesUp: 0, bytesDown: 0 }
  return { t: 0, nodes, inFlight: [], wan: [], servers }
}

/**
 * Node-level IFS summary for EDCA nodes: the earliest-expiring of the ACs'
 * concurrent IFS periods. Each AC keeps its own in AcView — a single slot here
 * would be last-write-wins and lie whenever two ACs contend at once.
 */
function summarizeIfs(n: NodeView): void {
  if (!n.acs) return
  let best: NodeView['ifs'] = null
  n.acs.forEach((a, i) => {
    if (a.ifs && (!best || a.ifs.untilNs < best.untilNs)) best = { ...a.ifs, ac: i }
  })
  n.ifs = best
}

/**
 * Drop every pending IFS on a node. The MAC cancels its IFS timers when CCA
 * goes busy or a NAV is set (§10.3.4.2: the wait becomes a deferral) and emits
 * no IFS_END for a cancelled wait — only a completed one — so the view must
 * mirror the cancel itself, or the label keeps showing an expired "AIFS 0 µs"
 * while the node is in fact held by CCA or NAV.
 */
function cancelIfs(n: NodeView): void {
  if (n.acs) for (const a of n.acs) a.ifs = null
  n.ifs = null
}

/** The sibling virtual node (other MLO link) sharing a physical queue, if present. */
function siblingId(vs: ViewState, vid: string): string | null {
  const other = vid.includes('#6g') ? physicalId(vid) : `${vid}#6g`
  return other in vs.nodes ? other : null
}

/**
 * The node whose `queue` list holds a virtual node's MSDUs: itself, or — for
 * the MLO link that only claims from the shared MLD queue — its sibling.
 */
function queueHolder(vs: ViewState, vid: string): NodeView {
  const n = vs.nodes[vid]
  if (n.queue.length > 0) return n
  const sib = siblingId(vs, vid)
  return sib && vs.nodes[sib].queue.length > 0 ? vs.nodes[sib] : n
}

/**
 * Per-AC counts are derived from the queue list, never from the engine's
 * `depth` field: the engine's depth omits a claimed (in-flight) MSDU while the
 * list keeps it until DEQUEUE, and the two must agree on screen. Both MLO
 * links mirror the shared list.
 */
function syncQueueLen(vs: ViewState, vid: string): void {
  const holder = queueHolder(vs, vid)
  const counts = [0, 0, 0, 0]
  for (const m of holder.queue) if (m.ac !== undefined) counts[m.ac]++
  for (const id of [vid, siblingId(vs, vid)]) {
    const acs = id ? vs.nodes[id].acs : null
    if (acs) acs.forEach((a, i) => { a.queueLen = counts[i] })
  }
}

/** MSDU ids a data PPDU carries (single MPDU, A-MPDU, or every MU part). */
function carriedMsduIds(frame: FrameDesc): number[] {
  if (frame.muParts) return frame.muParts.flatMap((p) => p.msduIds)
  if (frame.ampdu) return frame.ampdu.msduIds
  return frame.msduId !== undefined ? [frame.msduId] : []
}

export function cloneView(vs: ViewState): ViewState {
  return structuredClone(vs)
}

export function applyRecord(vs: ViewState, r: TLRecord): void {
  vs.t = r.t
  if (vs.wan.length && vs.wan[0].endNs <= r.t) vs.wan = vs.wan.filter((f) => f.endNs > r.t)
  switch (r.type) {
    case 'ARRIVAL':
      break
    case 'WAN_TX': {
      vs.wan.push({ server: r.server, dir: 'down', peer: r.to, startNs: r.t, endNs: r.arriveNs })
      const s = vs.servers[r.server]
      if (s) s.bytesDown += r.bytes
      break
    }
    case 'WAN_RX': {
      vs.wan.push({ server: r.server, dir: 'up', peer: r.from, startNs: r.sentNs, endNs: r.t })
      const s = vs.servers[r.server]
      if (s) s.bytesUp += r.bytes
      break
    }
    case 'ENQUEUE': {
      const n = vs.nodes[r.node]
      n.queue.push({ id: r.msduId, bytes: r.bytes, dst: r.dst, bornNs: r.t, ac: r.ac, inFlight: false, server: r.server, rttFromNs: r.rttFromNs })
      syncQueueLen(vs, r.node)
      break
    }
    case 'DEQUEUE': {
      // MLO: the claiming link may differ from the enqueuing (primary) link.
      let q = vs.nodes[r.node].queue
      let i = q.findIndex((m) => m.id === r.msduId)
      if (i < 0) {
        const sib = siblingId(vs, r.node)
        if (sib) {
          q = vs.nodes[sib].queue
          i = q.findIndex((m) => m.id === r.msduId)
        }
      }
      if (i >= 0) {
        const [m] = q.splice(i, 1)
        // MLO credits the delivering link, as txOk does; the receiver is the
        // physical destination (its primary link holds the stats).
        addLatency(vs.nodes[r.node].stats.txLatency, r.t - m.bornNs)
        const rx = vs.nodes[m.dst]
        if (rx) {
          addLatency(rx.stats.rxLatency, r.t - m.bornNs)
          if (m.rttFromNs !== undefined) {
            addLatency(rx.stats.appRtt, r.t - m.rttFromNs)
            rx.stats.appRttServer = m.server
          }
        }
      }
      syncQueueLen(vs, r.node)
      break
    }
    case 'CCA_BUSY':
      vs.nodes[r.node].ccaBusy = true
      cancelIfs(vs.nodes[r.node])
      break
    case 'CCA_IDLE':
      vs.nodes[r.node].ccaBusy = false
      break
    case 'IFS_START': {
      const n = vs.nodes[r.node]
      if (r.ac !== undefined && n.acs) {
        n.acs[r.ac].ifs = { kind: r.kind, untilNs: r.untilNs }
        summarizeIfs(n)
      } else {
        n.ifs = { kind: r.kind, untilNs: r.untilNs, ac: r.ac }
      }
      break
    }
    case 'IFS_END': {
      const n = vs.nodes[r.node]
      if (r.ac !== undefined && n.acs) {
        n.acs[r.ac].ifs = null
        summarizeIfs(n)
      } else {
        n.ifs = null
      }
      break
    }
    case 'BACKOFF_DRAW':
    case 'BACKOFF_DEC':
    case 'BACKOFF_FREEZE':
    case 'BACKOFF_RESUME': {
      const n = vs.nodes[r.node]
      n.backoff = r.value
      if (r.ac !== undefined && n.acs) {
        n.acs[r.ac].backoff = r.value
        if (r.type === 'BACKOFF_DRAW') n.acs[r.ac].cw = r.cw
      }
      break
    }
    case 'INTERNAL_COLLISION':
      break
    case 'TXOP_START':
      vs.nodes[r.node].txopUntilNs = r.untilNs
      vs.nodes[r.node].txopAc = r.ac
      break
    case 'TXOP_END':
      vs.nodes[r.node].txopUntilNs = 0
      vs.nodes[r.node].txopAc = -1
      break
    case 'TX_START':
      vs.nodes[r.node].currentTx = r.frame
      if (r.node === r.frame.src && (r.frame.kind === 'data' || r.frame.kind === 'rts')) {
        // clear consumed backoff display — the per-AC row too, or the EDCA
        // table keeps showing a stale bo:0 for the whole transmission
        const n = vs.nodes[r.node]
        n.backoff = null
        if (r.frame.ac !== undefined && n.acs) n.acs[r.frame.ac].backoff = null
      }
      if (r.node === r.frame.src && r.frame.kind === 'data') {
        const ids = new Set(carriedMsduIds(r.frame))
        for (const m of queueHolder(vs, r.node).queue) if (ids.has(m.id)) m.inFlight = true
      }
      vs.inFlight.push({ from: r.node, frame: r.frame, startNs: r.t, endNs: r.t + r.frame.txTimeNs })
      break
    case 'TX_END': {
      const n = vs.nodes[r.node]
      n.currentTx = null
      n.stats.airtimeNs += r.frame.txTimeNs
      vs.inFlight = vs.inFlight.filter((f) => !(f.from === r.node && f.startNs + f.frame.txTimeNs === r.t))
      break
    }
    case 'RX_START':
      vs.nodes[r.node].currentRx = { frame: r.frame, from: r.from }
      break
    case 'RX_OK': {
      const n = vs.nodes[r.node]
      n.currentRx = null
      const phys = physicalId(r.node)
      if (r.frame.kind === 'data') {
        const myPart = r.frame.muParts?.find((p) => p.dst === phys)
        if (r.frame.dst === phys) {
          // Duplicate detection: same seqNo from the same sender means the ACK
          // was lost and this is the retransmission of an already-counted frame.
          if (r.frame.seqNo !== undefined) {
            if (n.rxSeq[r.from] === r.frame.seqNo) break
            n.rxSeq[r.from] = r.frame.seqNo
          }
          const overhead = r.frame.ampdu ? 34 * r.frame.ampdu.mpduCount : 28
          n.stats.bytesDelivered += Math.max(0, r.frame.bytes - overhead)
          const sender = vs.nodes[r.from]
          if (sender) sender.stats.txOk += r.frame.ampdu?.mpduCount ?? 1
        } else if (myPart) {
          n.stats.bytesDelivered += Math.max(0, myPart.bytes - 34 * myPart.mpduCount)
          const sender = vs.nodes[r.from]
          if (sender) sender.stats.txOk += myPart.mpduCount
        }
      }
      break
    }
    case 'RX_FAIL':
      vs.nodes[r.node].currentRx = null
      break
    case 'NAV_SET':
      vs.nodes[r.node].navUntilNs = r.untilNs
      cancelIfs(vs.nodes[r.node])
      break
    case 'NAV_CLEAR':
      vs.nodes[r.node].navUntilNs = 0
      break
    case 'CW_CHANGE': {
      const n = vs.nodes[r.node]
      n.cw = r.cw
      if (r.ac !== undefined && n.acs) n.acs[r.ac].cw = r.cw
      break
    }
    case 'RETRY': {
      const n = vs.nodes[r.node]
      n.stats.retries += 1
      n.stats.txFail += 1
      n.ssrc = r.ssrc
      n.slrc = r.slrc
      // the failed set went back to the front of its queue (AcQueues.restore)
      for (const m of queueHolder(vs, r.node).queue) m.inFlight = false
      break
    }
    case 'DROP':
      vs.nodes[r.node].stats.drops += 1
      break
    case 'ACK_TIMEOUT':
    case 'CTS_TIMEOUT':
      break
    case 'MAC_STATE':
      vs.nodes[r.node].state = r.state
      break
    case 'COLLISION':
      for (const id of r.nodes) {
        const n = vs.nodes[id]
        if (n) n.stats.collisions += 1
      }
      break
  }
}
