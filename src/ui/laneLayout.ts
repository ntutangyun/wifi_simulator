/** Pure helpers turning timeline records into per-node lane spans. */
import type { FrameDesc, FrameKind } from '../model/frames'
import type { TLRecord } from '../model/records'
import type { Ns } from '../model/types'
import type { Strings } from './i18n'

export type SpanKind = 'tx' | 'rx' | 'backoff' | 'defer' | 'nav' | 'sifs'

export interface IfsSegment {
  kind: string
  startNs: Ns
  ac?: number
}

export interface LaneSpan {
  nodeId: string
  kind: SpanKind
  frameKind?: FrameKind
  frameSrc?: string
  frame?: FrameDesc
  ac?: number
  /**
   * Every IFS armed during this span, in order. A single defer block can hold
   * more than one: an EIFS is cut short and replaced by a DIFS as soon as a
   * frame is received correctly (§10.3.2.3.7), so the block's label depends on
   * *when* inside it you look.
   */
  ifs: IfsSegment[]
  /** Clipped to the visible window — use for drawing. */
  startNs: Ns
  endNs: Ns
  /** Unclipped — use for durations shown to the user. */
  fullStartNs: Ns
  fullEndNs: Ns
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
  ifs: IfsSegment[]
}

/**
 * Fold records into per-node interval spans clipped to [a,b].
 * Feed records from before `a` (e.g. 50 ms of margin) so spans already open at
 * `a` are captured; open spans extend to `b`.
 */
export function recordsToSpans(records: TLRecord[], nodeIds: string[], a: Ns, b: Ns): LaneSpan[] {
  const out: LaneSpan[] = []
  const open: Record<string, Partial<Record<'state' | 'tx' | 'rx' | 'nav', OpenSpan>>> = {}
  const pendingIfs: Record<string, IfsSegment | null> = {}
  for (const id of nodeIds) {
    open[id] = {}
    pendingIfs[id] = null
  }

  const close = (nodeId: string, slot: 'state' | 'tx' | 'rx' | 'nav', end: Ns) => {
    const o = open[nodeId]?.[slot]
    if (!o) return
    delete open[nodeId][slot]
    if (end <= a || o.start >= b) return
    out.push({
      nodeId, kind: o.kind, frameKind: o.frameKind, frameSrc: o.frameSrc, frame: o.frame,
      ac: o.ac, ifs: o.ifs,
      startNs: Math.max(a, o.start), endNs: Math.min(b, end),
      fullStartNs: o.start, fullEndNs: end,
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
        if (kind) {
          const span: OpenSpan = { kind, start: r.t, ifs: [] }
          // An idle→defer transition emits IFS_START just *before* the state
          // record, so the IFS that opens the block arrives with nothing open.
          const p = pendingIfs[id]
          if (kind === 'defer' && p && p.startNs === r.t) {
            span.ifs.push(p)
            span.ac = p.ac
          }
          open[id].state = span
        }
        pendingIfs[id] = null
        break
      }
      case 'IFS_START': {
        const seg: IfsSegment = { kind: r.kind, startNs: r.t, ac: r.ac }
        const st = open[id].state
        if (st) {
          st.ifs.push(seg)
          st.ac = r.ac
        } else {
          pendingIfs[id] = seg
        }
        break
      }
      case 'BACKOFF_DRAW':
      case 'BACKOFF_DEC':
      case 'BACKOFF_RESUME':
        if (open[id].state) open[id].state.ac = r.ac
        break
      case 'TX_START':
        open[id].tx = { kind: 'tx', start: r.t, frameKind: r.frame.kind, frameSrc: r.frame.src, frame: r.frame, ac: r.frame.ac, ifs: [] }
        break
      case 'TX_END':
        close(id, 'tx', r.t)
        break
      case 'RX_START':
        open[id].rx = { kind: 'rx', start: r.t, frameKind: r.frame.kind, frameSrc: r.from, frame: r.frame, ifs: [] }
        break
      case 'RX_OK':
      case 'RX_FAIL':
        close(id, 'rx', r.t)
        break
      case 'NAV_SET':
        if (!open[id].nav) open[id].nav = { kind: 'nav', start: r.t, ifs: [] }
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

const HIT_ORDER: Record<SpanKind, number> = { tx: 0, rx: 1, backoff: 2, defer: 2, sifs: 2, nav: 3 }

/** Topmost span (tx > rx > states > nav) covering time t on a lane, or null. */
export function topSpanAt(spans: LaneSpan[], nodeId: string, t: Ns): LaneSpan | null {
  let best: LaneSpan | null = null
  for (const s of spans) {
    if (s.nodeId !== nodeId || t < s.startNs || t > s.endNs) continue
    if (!best || HIT_ORDER[s.kind] < HIT_ORDER[best.kind]) best = s
  }
  return best
}

/** The IFS in effect at time t inside a span: the last one armed at or before t. */
export function ifsAt(s: LaneSpan, t: Ns): IfsSegment | null {
  let best: IfsSegment | null = null
  for (const seg of s.ifs) {
    if (seg.startNs <= t && (best === null || seg.startNs > best.startNs)) best = seg
  }
  return best
}

const AC_NAME = ['BK', 'BE', 'VI', 'VO']

/**
 * Tooltip lines for a span: what it is + what it teaches. `t` is the time under
 * the cursor — a defer block can hold several IFS periods, and the label must
 * name the one actually armed there, matching what the 3D view reports.
 */
export function spanTooltip(s: LaneSpan, T: Strings['tooltips'], t?: Ns): string[] {
  const dur = `${((s.fullEndNs - s.fullStartNs) / 1000).toFixed(1)} µs`
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
    case 'defer': {
      const here = t !== undefined ? ifsAt(s, t) : s.ifs[s.ifs.length - 1] ?? null
      const kind = here?.kind ?? ''
      const lines = [
        `${T.deferTitle(kind)}${ac} · ${dur}`,
        kind === 'EIFS' ? T.eifsNote : T.deferNote,
      ]
      if (s.ifs.length > 1) lines.push(T.ifsChain(s.ifs.map((x) => x.kind).join(' → ')))
      return lines
    }
    case 'nav':
      return [`${T.navTitle} · ${dur}`, T.navNote]
    case 'sifs':
      return [`${T.sifsWait} · ${dur}`]
  }
}
