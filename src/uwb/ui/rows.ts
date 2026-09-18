/**
 * The numbers the UWB inspector puts on screen, formatted. Pure and free of
 * React so the panel's contents can be asserted directly: every row a learner
 * reads is a value this module produced from the view state.
 */
import { fomText } from '../phy'
import type { UwbNodeView, UwbPositionView } from '../view'

const m = (v: number) => `${v.toFixed(2)} m`
const cm = (v: number) => `${(v * 100).toFixed(1)} cm`

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

export function uwbRangeRows(u: UwbNodeView): UwbRangeRow[] {
  return Object.entries(u.ranges).map(([peer, r]) => ({
    peer,
    measured: m(r.distM),
    trueDist: m(r.trueDistM),
    error: cm(r.distM - r.trueDistM),
    fom: fomText(r.fom),
    rounds: String(r.n),
    method: `${r.method.toUpperCase()}-TWR`,
  }))
}

/** A tag's latest fix, against the truth the scenario placed it at. */
export interface UwbFixRow {
  estimate: string
  truth: string
  error: string
  gdop: string
  ellipse: string
}

export function uwbFixRow(p: UwbPositionView): UwbFixRow {
  return {
    estimate: `(${p.x.toFixed(2)}, ${p.y.toFixed(2)}) m`,
    truth: `(${p.trueX.toFixed(2)}, ${p.trueY.toFixed(2)}) m`,
    error: cm(Math.hypot(p.x - p.trueX, p.y - p.trueY)),
    gdop: p.gdop.toFixed(2),
    ellipse: `${(p.ellipse.a * 100).toFixed(1)} × ${(p.ellipse.b * 100).toFixed(1)} cm`,
  }
}
