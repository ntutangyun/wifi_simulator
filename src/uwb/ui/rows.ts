/**
 * The numbers the UWB inspector puts on screen, formatted. Pure and free of
 * React so the panel's contents can be asserted directly: every row a learner
 * reads is a value this module produced from the view state.
 */
import { fomDecode } from '../phy'
import type { UwbFixMethod } from '../records'
import type { UwbNodeView, UwbPositionView } from '../view'
import { aoaSigmaDeg } from '../aoa'

/** The two phrases the confidence column needs, as the i18n table (Strings['uwb']) supplies them.
 * The event log keeps the engine's English `fomText`, like every other log line; the inspector
 * is chrome and follows the reader's language. */
export interface UwbFomStrings {
  fomWithin: (pct: number, intervalNs: number) => string
  noFom: string
}

/** The Figure of Merit byte as a phrase in the reader's language. An all-zero byte is the
 * standard's "not available" (standard §10.29.1.7), not 0 % within 0.05 ns. */
export function uwbFomText(fom: number, S: UwbFomStrings): string {
  if (fom === 0) return S.noFom
  const { levelPct, intervalNs } = fomDecode(fom)
  return S.fomWithin(levelPct, intervalNs)
}

/** The two phrases an anchor's contention draw reads as, in the reader's language. */
export interface UwbContendStrings {
  contendDraw: (slot: number, attempt: number) => string
  contendSitOut: string
}

/**
 * An anchor's latest contention draw, as one line: the slot it answered in and which attempt
 * that was, or that it sat the round out. Null in a time-scheduled session, where nothing is
 * ever drawn and the inspector shows no row at all.
 */
export function uwbContendText(u: UwbNodeView, S: UwbContendStrings): string | null {
  const c = u.contend
  if (!c) return null
  return c.slot === null ? S.contendSitOut : S.contendDraw(c.slot, c.attempt)
}

const m = (v: number) => `${v.toFixed(2)} m`
const cm = (v: number) => `${(v * 100).toFixed(1)} cm`
const ns = (v: number) => `${v.toFixed(2)} ns`
const deg = (v: number) => `${v.toFixed(1)}°`

/** One measured range: the peer id (the caller turns it into a display name) and its figures. */
export interface UwbRangeRow {
  peer: string
  measured: string
  trueDist: string
  /** Signed: a range long by 2 cm reads "2.0 cm", one short by 2 cm "-2.0 cm". */
  error: string
  /** Per row — two peers in one table can have very different first-path quality. */
  fom: string
  rounds: string
  /** 'SS-TWR' / 'DS-TWR', for the row's title. */
  method: string
}

export function uwbRangeRows(u: UwbNodeView, S: UwbFomStrings): UwbRangeRow[] {
  return Object.entries(u.ranges).map(([peer, r]) => ({
    peer,
    measured: m(r.distM),
    trueDist: m(r.trueDistM),
    error: cm(r.distM - r.trueDistM),
    fom: uwbFomText(r.fom, S),
    rounds: String(r.n),
    method: `${r.method.toUpperCase()}-TWR`,
  }))
}

/** One measured time difference: how much later this peer's message arrived than the reference
 * anchor's, and how much later it should have. */
export interface UwbTdoaRow {
  peer: string
  measured: string
  trueDt: string
  /** Signed, in nanoseconds — a difference 0.4 ns long reads "0.40 ns", one short "-0.40 ns". */
  error: string
  rounds: string
}

export function uwbTdoaRows(u: UwbNodeView): UwbTdoaRow[] {
  return Object.entries(u.tdoa).map(([peer, d]) => ({
    peer,
    measured: ns(d.dtNs),
    trueDt: ns(d.trueDtNs),
    error: ns(d.dtNs - d.trueDtNs),
    rounds: String(d.n),
  }))
}

/** One measured bearing: how far off its own boresight the anchor saw this peer, and how far
 * off it really was. */
export interface UwbAoaRow {
  peer: string
  measured: string
  trueTheta: string
  /** Signed: a bearing 2° to the left of the truth reads "2.0°", one to the right "-2.0°". */
  error: string
  /** The 1-σ this bearing carries at the angle it was measured at — it grows towards the edge
   * of the field of view, so it belongs on the row and not in a header. */
  sigma: string
  rounds: string
}

export function uwbAoaRows(u: UwbNodeView): UwbAoaRow[] {
  return Object.entries(u.aoa).map(([peer, a]) => ({
    peer,
    measured: deg(a.thetaDeg),
    trueTheta: deg(a.trueThetaDeg),
    error: deg(a.thetaDeg - a.trueThetaDeg),
    sigma: `± ${deg(aoaSigmaDeg(a.thetaDeg))}`,
    rounds: String(a.n),
  }))
}

/** How a fix was solved, in the reader's language (Strings['uwb'] supplies the map). */
export interface UwbMethodStrings {
  method: Record<UwbFixMethod, string>
}

/** A tag's latest fix, against the truth the scenario placed it at. */
export interface UwbFixRow {
  estimate: string
  truth: string
  error: string
  gdop: string
  ellipse: string
  /** What produced it: two-way ranges, one-way time differences, or an angle. */
  method: string
}

export function uwbFixRow(p: UwbPositionView, S: UwbMethodStrings): UwbFixRow {
  return {
    estimate: `(${p.x.toFixed(2)}, ${p.y.toFixed(2)}) m`,
    truth: `(${p.trueX.toFixed(2)}, ${p.trueY.toFixed(2)}) m`,
    error: cm(Math.hypot(p.x - p.trueX, p.y - p.trueY)),
    gdop: p.gdop.toFixed(2),
    ellipse: `${(p.ellipse.a * 100).toFixed(1)} × ${(p.ellipse.b * 100).toFixed(1)} cm`,
    method: S.method[p.method],
  }
}
