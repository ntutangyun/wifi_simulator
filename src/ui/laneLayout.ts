/** Pure helpers turning timeline records into per-node lane spans. */
import type { FrameDesc, FrameKind } from '../model/frames'
import type { TLRecord } from '../model/records'
import type { Ns } from '../model/types'

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
export function spanTooltip(s: LaneSpan): string[] {
  const dur = `${((s.endNs - s.startNs) / 1000).toFixed(1)} µs`
  const ac = s.ac !== undefined ? ` · AC_${AC_NAME[s.ac]}` : ''
  switch (s.kind) {
    case 'tx': {
      const f = s.frame
      if (!f) return [`transmitting · ${dur}`]
      const what =
        f.kind === 'data' && f.muParts ? `DL MU PPDU → ${f.muParts.length} stations (OFDMA)` :
        f.kind === 'data' && f.ampdu ? `A-MPDU (${f.ampdu.mpduCount} MPDUs) → ${f.dst}` :
        f.kind === 'data' ? `Data frame → ${f.dst}` :
        f.kind === 'ack' ? `ACK → ${f.dst}` :
        f.kind === 'ba' ? `BlockAck → ${f.dst}` :
        f.kind === 'mba' ? `Multi-STA BlockAck (OFDMA)` :
        f.kind === 'trigger' ? `Trigger frame — schedules UL OFDMA` :
        f.kind === 'rts' ? `RTS → ${f.dst} (reserves the medium)` : `CTS → ${f.dst}`
      const rate = f.mcs !== undefined ? `${f.mode?.toUpperCase()} MCS${f.mcs} · ${f.mbps} Mbps` : `${f.mbps} Mbps (non-HT)`
      const lines = [`${what}${ac}`, `${f.bytes} B · ${rate} · ${dur}`]
      if (f.kind === 'ack' || f.kind === 'ba' || f.kind === 'cts' || f.kind === 'mba') {
        lines.push('sent a SIFS (16 µs) after the frame — responses never contend')
      }
      if (f.retryFlag) lines.push('retransmission (Retry bit set)')
      if (f.orthogonalGroup) lines.push('RU-orthogonal: simultaneous with other same-group frames')
      return lines
    }
    case 'rx':
      return [`receiving ${s.frameKind?.toUpperCase() ?? ''} from ${s.frameSrc}${ac}`, dur]
    case 'backoff':
      return [
        `random backoff countdown${ac} · ${dur}`,
        'counter −1 per idle 9 µs slot; frozen while the medium is busy (§10.3.3)',
        'transmits when it reaches 0 — this is how stations avoid colliding',
      ]
    case 'defer':
      return [
        `deferring${s.ifsKind ? ` (${s.ifsKind})` : ''}${ac} · ${dur}`,
        s.ifsKind === 'EIFS'
          ? 'EIFS: extra-long wait after a corrupted reception (§10.3.2.3.7)'
          : 'waiting for the medium to stay idle for one IFS before backoff can run',
      ]
    case 'nav':
      return [
        `NAV set · ${dur}`,
        'virtual carrier sense: an overheard Duration field reserved the medium (§10.3.2.4)',
      ]
    case 'sifs':
      return [`in-exchange wait (SIFS turnaround / response pending) · ${dur}`]
  }
}
