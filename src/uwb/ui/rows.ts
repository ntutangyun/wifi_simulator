/**
 * The numbers the UWB inspector puts on screen, formatted. Pure and free of
 * React so the panel's contents can be asserted directly: every row a learner
 * reads is a value this module produced from the view state.
 */
import { nbCenterMhz } from '../nb'
import { fomDecode } from '../phy'
import { NOTHING_HEARD_DBM, type UwbFixMethod } from '../records'
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
  /** P802.15.4ab with an integrity train: whether that train vouched for this range, as a
   * phrase for the row's title. Absent in every other session. */
  integrity?: string
}

export function uwbRangeRows(u: UwbNodeView, S: UwbFomStrings & UwbIntegrityStrings): UwbRangeRow[] {
  return Object.entries(u.ranges).map(([peer, r]) => ({
    peer,
    measured: m(r.distM),
    trueDist: m(r.trueDistM),
    error: cm(r.distM - r.trueDistM),
    fom: uwbFomText(r.fom, S),
    rounds: String(r.n),
    method: `${r.method.toUpperCase()}-TWR`,
    // Only a session with an integrity train has anything to say here.
    ...(r.integrity !== undefined ? { integrity: r.integrity ? S.integrityOk : S.integrityBad } : {}),
  }))
}

/** The two phrases an integrity flag reads as, in the reader's language. */
export interface UwbIntegrityStrings {
  integrityOk: string
  integrityBad: string
}

/** The phrases the fragment-train table needs. */
export interface UwbTrainStrings {
  trainKind: (kind: 'rsf' | 'rif', fragments: number) => string
  trainYes: string
  trainNo: string
  trainNothing: string
}

/** One peer's latest fragment train: what it held, how much of it arrived, and what the
 * combined train came to. */
export interface UwbTrainRow {
  peer: string
  /** "8 × RSF". */
  kind: string
  /** "6 / 8". */
  heard: string
  /** Signed, in dB — how far the combined train cleared the receiver's sensitivity. A dash
   * when nothing was heard at all: there is no received power to take a margin from. */
  margin: string
  detected: string
  /** The clock ratio the train measured, minus one; a dash under two fragments heard, where
   * the range falls back to the narrowband carrier estimate instead. */
  ratio: string
}

/** One row per peer *and* kind, in the order the trains closed: a mixed set shows the RSF
 * train the range was made on above the RIF train that vouched for it. */
export function uwbTrainRows(u: UwbNodeView, S: UwbTrainStrings): UwbTrainRow[] {
  return Object.values(u.mms.trains).map((t) => ({
    peer: t.peer,
    kind: S.trainKind(t.kind, t.fragments),
    heard: `${t.heard} / ${t.fragments}`,
    margin: t.marginDb === NOTHING_HEARD_DBM ? S.trainNothing : `${t.marginDb >= 0 ? '+' : ''}${t.marginDb.toFixed(1)} dB`,
    detected: t.detected ? S.trainYes : S.trainNo,
    ratio: t.ratioPpm === null ? S.trainNothing : `${t.ratioPpm.toFixed(3)} ppm`,
  }))
}

/** The phrase the one-to-many line needs: the round's responders, in slot order. */
export interface UwbRespondersStrings {
  respondersOf: (ids: string[]) => string
}

/**
 * P802.15.4ab, one-to-many round: who this node's last fragment train was shared with, in slot
 * order — the `responders` list of `UWB_MMS_TRAIN`, which a pair round does not carry at all.
 * Null in a pair round and in every other mode, so the inspector shows the line only where it
 * means something.
 *
 * One line rather than a column: every train of one round carries the same list, and a seventh
 * column repeating it on every row would say the same thing R times.
 */
export function uwbRespondersText(u: UwbNodeView, S: UwbRespondersStrings, name: (id: string) => string = (id) => id): string | null {
  for (const t of Object.values(u.mms.trains)) {
    if (t.responders && t.responders.length > 0) return S.respondersOf(t.responders.map(name))
  }
  return null
}

/** The two phrases the narrowband control rows need. */
export interface UwbNbStrings {
  nbChannelAt: (channel: number, centerMhz: number) => string
  lbtBusyCount: (checks: number, blocks: number) => string
}

/** The narrowband control radio, as two lines: the channel this node's last control message
 * went out on (with its centre frequency), and what listen before talk has cost it. Both null
 * outside an MMS session, where nothing narrowband ever happens. */
export function uwbNbChannelText(u: UwbNodeView, S: UwbNbStrings): string | null {
  const ch = u.mms.nbChannel
  return ch === null ? null : S.nbChannelAt(ch, nbCenterMhz(ch))
}

export function uwbLbtText(u: UwbNodeView, S: UwbNbStrings): string | null {
  return u.mms.lbtBusy === 0 ? null : S.lbtBusyCount(u.mms.lbtBusy, u.mms.skippedBlocks)
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
