/**
 * ViewState: everything the UI shows at one instant. Maintained live by the
 * engine (applying every record as it is emitted) and reconstructed by the
 * player from (snapshot ≤ t) + record replay — the reducer is the single
 * source of truth for both, which guarantees snapshot/replay equivalence.
 */
import { initUwbNodeView, applyUwbRecord, type UwbNodeView } from '../uwb/view'
import { hasFeature, physicalId, virtualId, LINK_ORDER } from './caps'
import type { FrameDesc } from './frames'
import { laneIds } from './lanes'
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
  /** Forwarded phone-to-phone frame: birth time at the originating station. */
  relayFromNs?: Ns
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
  /** Phone-to-phone video delivered to this station: birth at the sender → delivery here (two Wi-Fi hops). */
  relayLatency: LatencyStats
}

function addLatency(l: LatencyStats, dtNs: Ns): void {
  l.n += 1
  l.sumNs += dtNs
  if (dtNs > l.maxNs) l.maxNs = dtNs
}

/**
 * A backscatter tag's live state: where it is in the reader's inventory, and how well the
 * reader can hear it. Present only on a tag whose scenario says `mode: 'backscatter'`.
 */
export interface AmpBsTagView {
  /** Gen2 slot counter: how many more slots before this tag answers. null = not in a round. */
  counter: number | null
  /** Read in this session, and silent for the rest of it (Gen2's A/B flag). */
  inventoried: boolean
  /** Reflections this tag has put on the air. */
  replies: number
  /** …and how many of them shared a slot with another tag's answer (from the COLLISION record:
   * the tag itself has no receiver and cannot know). */
  collisions: number
  /** The margin the last reflection had over the reader's own leakage floor, in dB. */
  lastSnrDb: number | null
}

/** A tag's live AMP state: its drawn backoff and this round's tally. */
export interface AmpTagView {
  aboc: number | null
  acw: number
  slot: number | null
  sent: number
  acked: number
  lost: number
  /** Rounds this tag heard the AP's Trigger for (an AMP_ABOC record arrived). */
  roundsHeard: number
  /** Rounds where the tag sat out (no slot: it deferred or lost random contention). */
  roundsSatOut: number
  /** Backscatter tags only: the inventory state an Active Tx tag has no equivalent of. */
  bs?: AmpBsTagView
}

/** The reader's live inventory, on the AP lane, beside the Active Tx round's own fields. */
export interface AmpInventoryView {
  session: number
  /** The slot the reader is offering, 1-based within the session. */
  slot: number
  /**
   * EPCs read, slots the reader heard two answers in, and slots with no answer it could hear —
   * **this TXOP**, and filled in at its end, because `AMP_INVENTORY` is the only record that
   * carries the reader's own energy judgement. The row therefore reads 0 / 0 / 0 while a TXOP is
   * running and lands complete when it closes; `slot` is what moves live. Deriving `read` early
   * from the ACK commands would fill one column of three and leave the other two at zero, which
   * reads as a result rather than as "not yet".
   *
   * Which is why the closed tally is also kept on the lane as `ampInventoryLast`: the reader
   * reports it and goes back to deferring in the same instant, and the defer clears the round.
   */
  read: number
  collisions: number
  empties: number
}

/** The AP lane's live AMP round: the poll's shape and which tags have replied so far. */
export interface AmpRoundView {
  phase: 'random' | 'scheduled'
  slot: number
  slots: number
  untilNs: Ns
  /** Tag ids (physical) whose AMP response has been received this round. */
  received: string[]
  /** Set instead of the slotted fields when the round is an EPC Gen2 inventory. */
  inventory?: AmpInventoryView
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
  /** Live QSRC: consecutive failed attempts of the access category that last changed its contention window. */
  qsrc: number
  /** MSDUs discarded but not yet dequeued — their DEQUEUE is a discard, not a delivery. */
  droppedIds: number[]
  navUntilNs: Ns
  ifs: { kind: 'DIFS' | 'EIFS' | 'SIFS' | 'AIFS'; untilNs: Ns; ac?: number } | null
  queue: QueuedMsduView[]
  currentTx: FrameDesc | null
  currentRx: { frame: FrameDesc; from: string } | null
  /**
   * Last accepted data seqNo per sender (duplicate detection, §10.3.2.11): a
   * retransmission after a lost ACK arrives twice and must be counted once.
   */
  /** Per sender, the most recent MSDU ids received (duplicate detection, §10.3.2.14). */
  rxSeen: Record<string, number[]>
  stats: NodeStats
  /** Per-AC contention detail (EDCA nodes). Index 0..3 = BK,BE,VI,VO. */
  acs: AcView[] | null
  txopUntilNs: Ns
  txopAc: number
  /** AMP tag lanes only: this tag's live poll state. */
  amp?: AmpTagView
  /** AMP AP lanes only: the round in progress, or null between rounds. */
  ampRound?: AmpRoundView | null
  /**
   * Reader lanes only: the last inventory TXOP's tally, which outlives the round it belongs to.
   * The reader emits `AMP_INVENTORY` and defers in the same instant, so `ampRound` is null by
   * the time anything could read the three columns off it; this is where they stay legible
   * until the next inventory replaces them.
   */
  ampInventoryLast?: AmpInventoryView
  /** UWB lanes only: this anchor's or tag's live ranging state. */
  uwb?: UwbNodeView
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
  for (const vid of laneIds(sc.nodes)) {
    const cfg = sc.nodes.find((n) => n.id === physicalId(vid))!
    const edca = cfg.kind !== 'uwb' && hasFeature(cfg, 'edca')
    nodes[vid] = {
      state: 'idle', ccaBusy: false, backoff: null, cw: 15, qsrc: 0, droppedIds: [],
      navUntilNs: 0, ifs: null, queue: [], currentTx: null, currentRx: null, rxSeen: {},
      stats: {
        txOk: 0, txFail: 0, retries: 0, drops: 0, bytesDelivered: 0, airtimeNs: 0, collisions: 0,
        txLatency: { n: 0, sumNs: 0, maxNs: 0 }, rxLatency: { n: 0, sumNs: 0, maxNs: 0 },
        appRtt: { n: 0, sumNs: 0, maxNs: 0 }, relayLatency: { n: 0, sumNs: 0, maxNs: 0 },
      },
      acs: edca ? [0, 1, 2, 3].map(() => ({ backoff: null, cw: 15, queueLen: 0, ifs: null })) : null,
      txopUntilNs: 0, txopAc: -1,
    }
    if (cfg.kind === 'amp') {
      nodes[vid].amp = { aboc: null, acw: 0, slot: null, sent: 0, acked: 0, lost: 0, roundsHeard: 0, roundsSatOut: 0 }
      // A backscatter tag never draws an ABOC and never sits in a slot; it gets the inventory
      // fields instead. An Active Tx tag keeps exactly the shape it had before this slice.
      if (cfg.ampTag?.mode === 'backscatter') {
        nodes[vid].amp!.bs = { counter: null, inventoried: false, replies: 0, collisions: 0, lastSnrDb: null }
      }
    }
    if (cfg.kind === 'ap') {
      nodes[vid].ampRound = null
    }
    if (cfg.kind === 'uwb') {
      nodes[vid].uwb = initUwbNodeView(cfg.uwb!)
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

/**
 * Every other lane of the same physical node. All of a node's lanes share one
 * `AcQueues` in the engine, so any of them may claim an MSDU the primary lane
 * enqueued — an MLO device (5 + 6 GHz) as much as an AP that also serves a
 * 2.4 GHz station.
 */
function siblingIds(vs: ViewState, vid: string): string[] {
  const phys = physicalId(vid)
  return Object.keys(vs.nodes).filter((v) => v !== vid && physicalId(v) === phys)
}

/**
 * The lane whose `queue` list holds a virtual node's MSDUs: itself, or — for a
 * lane that only claims from the shared queue — whichever sibling lane holds it.
 */
function queueHolder(vs: ViewState, vid: string): NodeView {
  const n = vs.nodes[vid]
  if (n.queue.length > 0) return n
  for (const sib of siblingIds(vs, vid)) {
    if (vs.nodes[sib].queue.length > 0) return vs.nodes[sib]
  }
  return n
}

/**
 * The lane that carries a physical node's stats: its first link in LINK_ORDER
 * (the bare id when it has a 5 GHz lane, else `id#6g`, else `id#2g`). Records
 * name peers by physical id, so every per-peer lookup has to resolve one.
 */
export function primaryLaneOf(vs: ViewState, physId: string): NodeView | undefined {
  for (const l of LINK_ORDER) {
    const n = vs.nodes[virtualId(physId, l)]
    if (n) return n
  }
  return undefined
}

/**
 * Per-AC counts are derived from the queue list, never from the engine's
 * `depth` field: the engine's depth omits a claimed (in-flight) MSDU while the
 * list keeps it until DEQUEUE, and the two must agree on screen. Every lane of
 * the node mirrors the shared list.
 */
function syncQueueLen(vs: ViewState, vid: string): void {
  const holder = queueHolder(vs, vid)
  const counts = [0, 0, 0, 0]
  for (const m of holder.queue) if (m.ac !== undefined) counts[m.ac]++
  for (const id of [vid, ...siblingIds(vs, vid)]) {
    const acs = vs.nodes[id].acs
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
  // The UWB records belong to the ranging reducer; nothing below knows them.
  if (applyUwbRecord(vs, r)) return
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
      n.queue.push({ id: r.msduId, bytes: r.bytes, dst: r.dst, bornNs: r.t, ac: r.ac, inFlight: false, server: r.server, rttFromNs: r.rttFromNs, relayFromNs: r.relayFromNs })
      syncQueueLen(vs, r.node)
      break
    }
    case 'DEQUEUE': {
      // The claiming lane may differ from the enqueuing (primary) lane: MLO's
      // second link, or the AP's 2.4 GHz lane draining a downlink queued on 5 GHz.
      let q = vs.nodes[r.node].queue
      let i = q.findIndex((m) => m.id === r.msduId)
      if (i < 0) {
        for (const sib of siblingIds(vs, r.node)) {
          const sq = vs.nodes[sib].queue
          const j = sq.findIndex((m) => m.id === r.msduId)
          if (j >= 0) { q = sq; i = j; break }
        }
      }
      if (i >= 0) {
        const [m] = q.splice(i, 1)
        const dropped = vs.nodes[r.node].droppedIds.indexOf(r.msduId)
        if (dropped >= 0) {
          // discarded (retry limit or lifetime), not delivered: no latency sample
          vs.nodes[r.node].droppedIds.splice(dropped, 1)
          syncQueueLen(vs, r.node)
          break
        }
        // The delivering lane is credited, as txOk is; the receiver is the
        // physical destination (its primary lane holds the stats).
        addLatency(vs.nodes[r.node].stats.txLatency, r.t - m.bornNs)
        const rx = primaryLaneOf(vs, m.dst)
        if (rx) {
          addLatency(rx.stats.rxLatency, r.t - m.bornNs)
          if (m.rttFromNs !== undefined) {
            addLatency(rx.stats.appRtt, r.t - m.rttFromNs)
            rx.stats.appRttServer = m.server
          }
          if (m.relayFromNs !== undefined) addLatency(rx.stats.relayLatency, r.t - m.relayFromNs)
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
        let ids: number[] = []
        let sizes: number[] | undefined
        let fallback = 0
        if (r.frame.dst === phys) {
          ids = r.frame.ampdu?.msduIds ?? (r.frame.msduId !== undefined ? [r.frame.msduId] : [])
          sizes = r.frame.msduBytes
          fallback = r.frame.ampdu ? r.frame.bytes / r.frame.ampdu.mpduCount - 34 : r.frame.bytes - 28
        } else if (myPart) {
          ids = myPart.msduIds
          sizes = myPart.msduBytes
          fallback = myPart.bytes / Math.max(1, myPart.mpduCount) - 34
        }
        // Duplicate detection per MSDU: a frame seen before from this sender is
        // the retransmission after a lost acknowledgement — count it once.
        const seen = (n.rxSeen[r.from] ??= [])
        let fresh = 0
        ids.forEach((id, i) => {
          if (seen.includes(id)) return
          seen.push(id)
          if (seen.length > 512) seen.shift()
          fresh++
          n.stats.bytesDelivered += Math.max(0, sizes?.[i] ?? fallback)
        })
        const sender = primaryLaneOf(vs, r.from)
        if (sender) sender.stats.txOk += fresh
      }
      if (r.frame.kind === 'ampResp' && n.ampRound) {
        // The same rule the AP's round applies (AmpApRound.onRxOk): only a
        // response in the slot the round is actually in counts, and only the
        // first one from a tag — so the lane's list matches the round's tally.
        const slot = r.frame.amp?.slot
        if (slot !== undefined && slot === n.ampRound.slot && !n.ampRound.received.includes(r.from)) {
          n.ampRound.received.push(r.from)
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
      if (r.qsrc !== undefined) n.qsrc = r.qsrc
      if (r.ac !== undefined && n.acs) n.acs[r.ac].cw = r.cw
      break
    }
    case 'RETRY': {
      const n = vs.nodes[r.node]
      n.stats.retries += 1
      n.stats.txFail += 1
      // the failed set went back to the front of its queue (AcQueues.restore)
      for (const m of queueHolder(vs, r.node).queue) m.inFlight = false
      break
    }
    case 'DROP':
      vs.nodes[r.node].stats.drops += 1
      // The DEQUEUE that follows a discard must not be timed as a delivery. A
      // queueFull drop never reaches a queue, so it never gets a DEQUEUE and
      // must not be remembered here.
      if (r.reason !== 'queueFull') {
        vs.nodes[r.node].droppedIds.push(r.msduId)
        if (vs.nodes[r.node].droppedIds.length > 256) vs.nodes[r.node].droppedIds.shift()
      }
      break
    case 'ACK_TIMEOUT':
    case 'CTS_TIMEOUT':
      break
    case 'MAC_STATE': {
      const n = vs.nodes[r.node]
      n.state = r.state
      // The reducer does not know the AP's read mode, so it keeps the round
      // alive through the AP's own tx/waitAck (trigger, ack) and clears it on
      // any other state — the next round starts a fresh one either way.
      // Only a lane that can hold a round (an AP's) is cleared; a STA or tag
      // lane keeps `ampRound` undefined rather than acquiring a null field.
      if (n.ampRound !== undefined && r.state !== 'tx' && r.state !== 'waitAck') n.ampRound = null
      break
    }
    case 'COLLISION':
      for (const id of r.nodes) {
        const n = vs.nodes[id]
        if (!n) continue
        n.stats.collisions += 1
        // A backscatter tag learns nothing itself — it has no receiver for its own reflection —
        // but the lane can say how often this tag's answer was one of two in a slot.
        if (n.amp?.bs) n.amp.bs.collisions += 1
      }
      break
    case 'AMP_ROUND': {
      const n = vs.nodes[r.node]
      n.ampRound = { phase: r.phase, slot: 0, slots: r.slots, untilNs: r.untilNs, received: [] }
      break
    }
    case 'AMP_SLOT': {
      const n = vs.nodes[r.node]
      if (n.ampRound) n.ampRound.slot = r.slot
      break
    }
    case 'AMP_ABOC': {
      const a = vs.nodes[r.node].amp
      if (!a) break
      a.aboc = r.aboc
      a.acw = r.acw
      a.slot = r.slot
      a.roundsHeard++
      if (r.slot === null) a.roundsSatOut++
      break
    }
    case 'AMP_RESULT': {
      const a = vs.nodes[r.node].amp
      if (!a) break
      if (r.sent) a.sent++
      if (r.acked) a.acked++
      else a.lost++
      a.aboc = null
      a.slot = null
      break
    }
    case 'AMP_RFID': {
      const n = vs.nodes[r.node]
      // Only a lane that can hold a round (an AP's) has the field at all.
      if (n.ampRound === undefined) break
      const prev = n.ampRound?.inventory
      if (n.ampRound !== null && prev !== undefined && prev.session === r.session) {
        prev.slot = r.slot
        n.ampRound.slot = r.slot
        n.ampRound.untilNs = r.untilNs
        // Only a Query announces Q; a QueryRep resuming a session keeps what it announced.
        if (r.q !== undefined) n.ampRound.slots = 2 ** r.q
      } else {
        n.ampRound = {
          phase: 'random', slot: r.slot, slots: r.q === undefined ? 0 : 2 ** r.q,
          untilNs: r.untilNs, received: [],
          inventory: { session: r.session, slot: r.slot, read: 0, collisions: 0, empties: 0 },
        }
      }
      break
    }
    case 'AMP_INVENTORY': {
      const n = vs.nodes[r.node]
      const inv = n.ampRound?.inventory
      if (inv && inv.session === r.session) {
        inv.read = r.read.length
        inv.collisions = r.collisions
        inv.empties = r.empties
      }
      // Kept beside the round, because the reader's own defer clears the round at this instant.
      // The slot is where the session had got to: a TXOP that ran out of air stops short of 2^Q.
      n.ampInventoryLast = {
        session: r.session, slot: inv?.slot ?? r.slotsOffered,
        read: r.read.length, collisions: r.collisions, empties: r.empties,
      }
      break
    }
    case 'AMP_BS_COUNTER': {
      const bs = vs.nodes[r.node].amp?.bs
      if (!bs) break
      bs.counter = r.counter
      bs.inventoried = false
      break
    }
    case 'AMP_BS_REPLY': {
      const bs = vs.nodes[r.node].amp?.bs
      if (!bs) break
      bs.replies++
      bs.lastSnrDb = r.snrDb
      // The EPC is what gets a tag inventoried; after it the tag is silent for the session.
      if (r.kind === 'epc') bs.inventoried = true
      // Answering uses the slot up, whether or not the reader could read it.
      if (r.kind === 'rn16') bs.counter = null
      break
    }
    case 'AMP_BS_BOOT': {
      const bs = vs.nodes[r.node].amp?.bs
      // An unpowered tag is out of the round: it holds no counter it can act on.
      if (bs && !r.powered) bs.counter = null
      break
    }
  }
}
