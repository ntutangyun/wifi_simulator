/** Pure helpers turning timeline records into per-node lane spans. */
import type { FrameDesc, FrameKind } from '../model/frames'
import type { TLRecord } from '../model/records'
import type { Ns } from '../model/types'
import type { ViewState } from '../model/view'
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
  /** True when the span's start was never observed (it predates the fetched records). */
  openStart: boolean
  /** True when the span's end was never observed (still running at the data horizon). */
  openEnded: boolean
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
  /** Set when records of more than one AC touched this span — no single AC owns it. */
  acMixed?: boolean
  openStart?: boolean
  ifs: IfsSegment[]
}

/**
 * Fold records into per-node interval spans clipped to [a,b] for drawing.
 * Feed records from before `a` (e.g. 50 ms of margin) so spans already open at
 * `a` are captured, and past `b` up to `horizon` so a span crossing the right
 * window edge still learns its true end (fullEndNs). Spans with no closing
 * record by `horizon` are marked openEnded — their real end is unknown.
 */
export function recordsToSpans(
  records: TLRecord[], nodeIds: string[], a: Ns, b: Ns, horizon: Ns = b,
  seed?: { view: ViewState; t: Ns },
): LaneSpan[] {
  const out: LaneSpan[] = []
  const open: Record<string, Partial<Record<'state' | 'tx' | 'nav', OpenSpan>>> = {}
  const openRx: Record<string, Map<string, OpenSpan>> = {}
  const pendingIfs: Record<string, IfsSegment | null> = {}
  for (const id of nodeIds) {
    open[id] = {}
    openRx[id] = new Map()
    pendingIfs[id] = null
  }

  // Seed from a snapshot at the fetch start: a state/NAV/TX/RX that began
  // before the fetched records would otherwise be invisible however long it is.
  if (seed) {
    for (const id of nodeIds) {
      const nv = seed.view.nodes[id]
      if (!nv) continue
      const kind = STATE_SPAN[nv.state]
      if (kind) open[id].state = { kind, start: seed.t, ifs: [], openStart: true }
      if (nv.navUntilNs > seed.t) open[id].nav = { kind: 'nav', start: seed.t, ifs: [], openStart: true }
      if (nv.currentTx) {
        const inF = seed.view.inFlight.find((f) => f.from === id)
        open[id].tx = {
          kind: 'tx', start: inF?.startNs ?? seed.t, openStart: !inF, ifs: [],
          frameKind: nv.currentTx.kind, frameSrc: nv.currentTx.src, frame: nv.currentTx, ac: nv.currentTx.ac,
        }
      }
      if (nv.currentRx) {
        openRx[id].set(nv.currentRx.from, {
          kind: 'rx', start: seed.t, openStart: true, ifs: [],
          frameKind: nv.currentRx.frame.kind, frameSrc: nv.currentRx.from, frame: nv.currentRx.frame,
        })
      }
    }
  }

  const emit = (nodeId: string, o: OpenSpan, end: Ns, openEnded: boolean) => {
    if (end <= a || o.start >= b) return
    out.push({
      nodeId, kind: o.kind, frameKind: o.frameKind, frameSrc: o.frameSrc, frame: o.frame,
      ac: o.acMixed ? undefined : o.ac, ifs: o.ifs, openStart: o.openStart ?? false, openEnded,
      startNs: Math.max(a, o.start), endNs: Math.min(b, end),
      fullStartNs: o.start, fullEndNs: end,
    })
  }

  const close = (nodeId: string, slot: 'state' | 'tx' | 'nav', end: Ns, openEnded = false) => {
    const o = open[nodeId]?.[slot]
    if (!o) return
    delete open[nodeId][slot]
    emit(nodeId, o, end, openEnded)
  }

  const setAc = (o: OpenSpan, ac: number | undefined) => {
    if (o.ac !== undefined && ac !== undefined && o.ac !== ac) o.acMixed = true
    o.ac = ac
  }

  for (const r of records) {
    if (r.t > horizon) break
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
          setAc(st, r.ac)
        } else {
          pendingIfs[id] = seg
        }
        break
      }
      case 'BACKOFF_DRAW':
      case 'BACKOFF_DEC':
      case 'BACKOFF_RESUME':
        if (open[id].state) setAc(open[id].state!, r.ac)
        break
      case 'TX_START':
        open[id].tx = { kind: 'tx', start: r.t, frameKind: r.frame.kind, frameSrc: r.frame.src, frame: r.frame, ac: r.frame.ac, ifs: [] }
        break
      case 'TX_END':
        close(id, 'tx', r.t)
        break
      case 'RX_START':
        // Keyed by sender: the AP can hold several simultaneous receptions (UL OFDMA).
        openRx[id].set(r.from, { kind: 'rx', start: r.t, frameKind: r.frame.kind, frameSrc: r.from, frame: r.frame, ifs: [] })
        break
      case 'RX_OK':
      case 'RX_FAIL': {
        // RX_FAIL with an unknown source ends every reception in progress.
        const froms = r.from !== null ? [r.from] : [...openRx[id].keys()]
        for (const from of froms) {
          const o = openRx[id].get(from)
          if (o) {
            openRx[id].delete(from)
            emit(id, o, r.t, false)
          }
        }
        break
      }
      case 'NAV_SET':
        if (!open[id].nav) open[id].nav = { kind: 'nav', start: r.t, ifs: [] }
        break
      case 'NAV_CLEAR':
        close(id, 'nav', r.t)
        break
    }
  }
  for (const id of nodeIds) {
    close(id, 'state', horizon, true)
    close(id, 'tx', horizon, true)
    close(id, 'nav', horizon, true)
    for (const o of openRx[id].values()) emit(id, o, horizon, true)
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
  const dur = `${s.openStart || s.openEnded ? '≥ ' : ''}${((s.fullEndNs - s.fullStartNs) / 1000).toFixed(1)} µs`
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
      // The segment under the cursor knows its own AC even when the block as a
      // whole was shared by several ACs (s.ac dropped as mixed).
      const acHere = here?.ac !== undefined ? ` · AC_${AC_NAME[here.ac]}` : ac
      const lines = [
        `${T.deferTitle(kind)}${acHere} · ${dur}`,
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
