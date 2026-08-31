/** Pure helpers turning timeline records into per-node lane spans. */
import type { FrameKind } from '../model/frames'
import type { TLRecord } from '../model/records'
import type { Ns } from '../model/types'

export type SpanKind = 'tx' | 'rx' | 'backoff' | 'defer' | 'nav' | 'sifs'

export interface LaneSpan {
  nodeId: string
  kind: SpanKind
  frameKind?: FrameKind
  frameSrc?: string
  startNs: Ns
  endNs: Ns
}

const STATE_SPAN: Record<string, SpanKind | null> = {
  idle: null, tx: null, rx: null,
  defer: 'defer', backoff: 'backoff',
  waitAck: 'sifs', waitCts: 'sifs', sifsResp: 'sifs',
}

/**
 * Fold records into per-node interval spans clipped to [a,b].
 * Feed records from before `a` (e.g. 50 ms of margin) so spans already open at
 * `a` are captured; open spans extend to `b`.
 */
export function recordsToSpans(records: TLRecord[], nodeIds: string[], a: Ns, b: Ns): LaneSpan[] {
  const out: LaneSpan[] = []
  const open: Record<string, Partial<Record<'state' | 'tx' | 'rx' | 'nav', { kind: SpanKind; start: Ns; frameKind?: FrameKind; frameSrc?: string }>>> = {}
  for (const id of nodeIds) open[id] = {}

  const close = (nodeId: string, slot: 'state' | 'tx' | 'rx' | 'nav', end: Ns) => {
    const o = open[nodeId]?.[slot]
    if (!o) return
    delete open[nodeId][slot]
    if (end <= a || o.start >= b) return
    out.push({
      nodeId, kind: o.kind, frameKind: o.frameKind, frameSrc: o.frameSrc,
      startNs: Math.max(a, o.start), endNs: Math.min(b, end),
    })
  }

  for (const r of records) {
    if (r.t > b) break
    if (!('node' in r) || r.node === null || !(r.node in open)) {
      continue
    }
    const id = r.node
    switch (r.type) {
      case 'MAC_STATE': {
        close(id, 'state', r.t)
        const kind = STATE_SPAN[r.state]
        if (kind) open[id].state = { kind, start: r.t }
        break
      }
      case 'TX_START':
        open[id].tx = { kind: 'tx', start: r.t, frameKind: r.frame.kind, frameSrc: r.frame.src }
        break
      case 'TX_END':
        close(id, 'tx', r.t)
        break
      case 'RX_START':
        open[id].rx = { kind: 'rx', start: r.t, frameKind: r.frame.kind, frameSrc: r.from }
        break
      case 'RX_OK':
      case 'RX_FAIL':
        close(id, 'rx', r.t)
        break
      case 'NAV_SET':
        if (!open[id].nav) open[id].nav = { kind: 'nav', start: r.t }
        break
      case 'NAV_CLEAR':
        close(id, 'nav', r.t)
        break
    }
  }
  for (const id of nodeIds) {
    close(id, 'state', b)
    close(id, 'tx', b)
    close(id, 'rx', b)
    close(id, 'nav', b)
  }
  return out
}

export function xForT(t: Ns, a: Ns, b: Ns, widthPx: number): number {
  return ((t - a) / (b - a)) * widthPx
}
