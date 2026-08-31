/**
 * ViewState: everything the UI shows at one instant. Maintained live by the
 * engine (applying every record as it is emitted) and reconstructed by the
 * player from (snapshot ≤ t) + record replay — the reducer is the single
 * source of truth for both, which guarantees snapshot/replay equivalence.
 */
import type { FrameDesc } from './frames'
import type { MacStateName, TLRecord } from './records'
import type { Scenario } from './scenario'
import type { Ns } from './types'

export interface QueuedMsduView {
  id: number
  bytes: number
  dst: string
  bornNs: Ns
}

export interface NodeStats {
  txOk: number
  txFail: number
  retries: number
  drops: number
  bytesDelivered: number
  airtimeNs: Ns
  collisions: number
}

export interface NodeView {
  state: MacStateName
  ccaBusy: boolean
  backoff: number | null
  cw: number
  ssrc: number
  slrc: number
  navUntilNs: Ns
  ifs: { kind: 'DIFS' | 'EIFS' | 'SIFS'; untilNs: Ns } | null
  queue: QueuedMsduView[]
  currentTx: FrameDesc | null
  currentRx: { frame: FrameDesc; from: string } | null
  stats: NodeStats
}

export interface FlightView {
  from: string
  frame: FrameDesc
  startNs: Ns
  endNs: Ns
}

export interface ViewState {
  t: Ns
  nodes: Record<string, NodeView>
  inFlight: FlightView[]
}

export interface Snapshot {
  t: Ns
  view: ViewState
}

export function initViewState(sc: Scenario): ViewState {
  const nodes: Record<string, NodeView> = {}
  for (const n of sc.nodes) {
    nodes[n.id] = {
      state: 'idle', ccaBusy: false, backoff: null, cw: 15, ssrc: 0, slrc: 0,
      navUntilNs: 0, ifs: null, queue: [], currentTx: null, currentRx: null,
      stats: { txOk: 0, txFail: 0, retries: 0, drops: 0, bytesDelivered: 0, airtimeNs: 0, collisions: 0 },
    }
  }
  return { t: 0, nodes, inFlight: [] }
}

export function cloneView(vs: ViewState): ViewState {
  return structuredClone(vs)
}

export function applyRecord(vs: ViewState, r: TLRecord): void {
  vs.t = r.t
  switch (r.type) {
    case 'ARRIVAL':
      break
    case 'ENQUEUE':
      vs.nodes[r.node].queue.push({ id: r.msduId, bytes: r.bytes, dst: r.dst, bornNs: r.t })
      break
    case 'DEQUEUE': {
      const q = vs.nodes[r.node].queue
      const i = q.findIndex((m) => m.id === r.msduId)
      if (i >= 0) q.splice(i, 1)
      break
    }
    case 'CCA_BUSY':
      vs.nodes[r.node].ccaBusy = true
      break
    case 'CCA_IDLE':
      vs.nodes[r.node].ccaBusy = false
      break
    case 'IFS_START':
      vs.nodes[r.node].ifs = { kind: r.kind, untilNs: r.untilNs }
      break
    case 'IFS_END':
      vs.nodes[r.node].ifs = null
      break
    case 'BACKOFF_DRAW':
    case 'BACKOFF_DEC':
    case 'BACKOFF_FREEZE':
    case 'BACKOFF_RESUME':
      vs.nodes[r.node].backoff = r.value
      break
    case 'TX_START':
      vs.nodes[r.node].currentTx = r.frame
      if (r.node === r.frame.src && (r.frame.kind === 'data' || r.frame.kind === 'rts')) {
        // clear consumed backoff display
        vs.nodes[r.node].backoff = null
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
      if (r.frame.kind === 'data' && r.frame.dst === r.node) {
        n.stats.bytesDelivered += Math.max(0, r.frame.bytes - 28)
        // sender's success accounting
        const sender = vs.nodes[r.from]
        if (sender) sender.stats.txOk += 1
      }
      break
    }
    case 'RX_FAIL':
      vs.nodes[r.node].currentRx = null
      break
    case 'NAV_SET':
      vs.nodes[r.node].navUntilNs = r.untilNs
      break
    case 'NAV_CLEAR':
      vs.nodes[r.node].navUntilNs = 0
      break
    case 'CW_CHANGE':
      vs.nodes[r.node].cw = r.cw
      break
    case 'RETRY': {
      const n = vs.nodes[r.node]
      n.stats.retries += 1
      n.stats.txFail += 1
      n.ssrc = r.ssrc
      n.slrc = r.slrc
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
