/** Pure helpers turning timeline records into per-node lane spans. */
import type { FrameDesc, FrameKind } from '../model/frames'
import type { TLRecord } from '../model/records'
import type { Ns } from '../model/types'
import type { Strings } from './i18n'

export type SpanKind = 'tx' | 'rx' | 'backoff' | 'defer' | 'nav' | 'sifs'

export interface LaneSpan {
  nodeId: string
  kind: SpanKind
  frameKind?: FrameKind
  frameSrc?: string
  frame?: FrameDesc
  ac?: number
  ifsKind?: string
  startNs: Ns
  endNs: Ns
}

const STATE_SPAN: Record<string, SpanKind | null> = {
  idle: null, tx: null, rx: null,
  defer: 'defer', backoff: 'backoff',
  waitAck: 'sifs', waitCts: 'sifs', sifsResp: 'sifs',
}

interface OpenSpan {
  kind: SpanKind
  start: Ns
  frameKind?: FrameKind
  frameSrc?: string
  frame?: FrameDesc
  ac?: number
  ifsKind?: string
}

/**
 * Fold records into per-node interval spans clipped to [a,b].
 * Feed records from before `a` (e.g. 50 ms of margin) so spans already open at
 * `a` are captured; open spans extend to `b`.
 */
export function recordsToSpans(records: TLRecord[], nodeIds: string[], a: Ns, b: Ns): LaneSpan[] {
  const out: LaneSpan[] = []
  const open: Record<string, Partial<Record<'state' | 'tx' | 'rx' | 'nav', OpenSpan>>> = {}
  for (const id of nodeIds) open[id] = {}

  const close = (nodeId: string, slot: 'state' | 'tx' | 'rx' | 'nav', end: Ns) => {
    const o = open[nodeId]?.[slot]
    if (!o) return
    delete open[nodeId][slot]
    if (end <= a || o.start >= b) return
    out.push({
      nodeId, kind: o.kind, frameKind: o.frameKind, frameSrc: o.frameSrc, frame: o.frame,
      ac: o.ac, ifsKind: o.ifsKind,
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
      case 'IFS_START':
        if (open[id].state) {
          open[id].state.ifsKind = r.kind
          open[id].state.ac = r.ac
        }
        break
      case 'BACKOFF_DRAW':
      case 'BACKOFF_DEC':
      case 'BACKOFF_RESUME':
        if (open[id].state) open[id].state.ac = r.ac
        break
      case 'TX_START':
        open[id].tx = { kind: 'tx', start: r.t, frameKind: r.frame.kind, frameSrc: r.frame.src, frame: r.frame, ac: r.frame.ac }
        break
      case 'TX_END':
        close(id, 'tx', r.t)
        break
      case 'RX_START':
        open[id].rx = { kind: 'rx', start: r.t, frameKind: r.frame.kind, frameSrc: r.from, frame: r.frame }
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

const AC_NAME = ['BK', 'BE', 'VI', 'VO']

/** Tooltip lines for a span: what it is + what it teaches. */
export function spanTooltip(s: LaneSpan, T: Strings['tooltips']): string[] {
  const dur = `${((s.endNs - s.startNs) / 1000).toFixed(1)} µs`
  const ac = s.ac !== undefined ? ` · AC_${AC_NAME[s.ac]}` : ''
  switch (s.kind) {
    case 'tx': {
      const f = s.frame
      if (!f) return [`${T.transmitting} · ${dur}`]
      const what =
        f.kind === 'data' && f.muParts ? T.dlMu(f.muParts.length) :
        f.kind === 'data' && f.ampdu ? T.ampdu(f.ampdu.mpduCount, f.dst) :
        f.kind === 'data' ? T.data(f.dst) :
        f.kind === 'ack' ? T.ack(f.dst) :
        f.kind === 'ba' ? T.ba(f.dst) :
        f.kind === 'mba' ? T.mba :
        f.kind === 'trigger' ? T.trigger :
        f.kind === 'rts' ? T.rts(f.dst) : T.cts(f.dst)
      const rate = f.mcs !== undefined ? `${f.mode?.toUpperCase()} MCS${f.mcs} · ${f.mbps} Mbps` : `${f.mbps} Mbps (${T.nonHt})`
      const lines = [`${what}${ac}`, `${f.bytes} B · ${rate} · ${dur}`]
      if (f.kind === 'ack' || f.kind === 'ba' || f.kind === 'cts' || f.kind === 'mba') {
        lines.push(T.sifsNote)
      }
      if (f.retryFlag) lines.push(T.retryNote)
      if (f.orthogonalGroup) lines.push(T.ruNote)
      return lines
    }
    case 'rx':
      return [`${T.receiving(s.frameKind?.toUpperCase() ?? '', s.frameSrc ?? '')}${ac}`, dur]
    case 'backoff':
      return [`${T.backoffTitle}${ac} · ${dur}`, T.backoffL1, T.backoffL2]
    case 'defer':
      return [
        `${T.deferTitle(s.ifsKind ?? '')}${ac} · ${dur}`,
        s.ifsKind === 'EIFS' ? T.eifsNote : T.deferNote,
      ]
    case 'nav':
      return [`${T.navTitle} · ${dur}`, T.navNote]
    case 'sifs':
      return [`${T.sifsWait} · ${dur}`]
  }
}
