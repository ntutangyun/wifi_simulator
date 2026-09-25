import { describe, it, expect } from 'vitest'
import { decodeFrame, fmtRecord } from '../../src/ui/format'
import { STRINGS } from '../../src/ui/i18n'
import { makePoll } from '../../src/uwb/frames'
import type { FrameDesc } from '../../src/model/frames'
import { fmtUwbRecord, type UwbTLRecord } from '../../src/uwb/format'
import { FOM_LOS } from '../../src/uwb/phy'
import { rctuToMetres } from '../../src/uwb/ranging'

/** Stamp a bare UWB record with the timeline fields every TLRecord carries. */
type Bare<T> = T extends unknown ? Omit<T, 't' | 'seq'> : never
const rec = (r: Bare<UwbTLRecord>): UwbTLRecord => ({ t: 0, seq: 0, ...r } as UwbTLRecord)

const ROUND = rec({ type: 'UWB_ROUND', node: 'tag-1', block: 3, round: 0, slots: 10, slotNs: 2_000_000, method: 'ds', mode: 'twr', untilNs: 20_000_000 })
const DL_ROUND = rec({ type: 'UWB_ROUND', node: 'tag-1', block: 3, round: 0, slots: 5, slotNs: 2_000_000, method: 'ds', mode: 'dl-tdoa', untilNs: 10_000_000 })
const SLOT = rec({ type: 'UWB_SLOT', node: 'tag-1', slot: 2, untilNs: 4_000_000 })
const TS_TX = rec({ type: 'UWB_TS', node: 'tag-1', dir: 'tx', peer: 'anc-1', frameKind: 'uwbPoll', counter: 1_234_567 })
const TS_RX = rec({ type: 'UWB_TS', node: 'tag-1', dir: 'rx', peer: 'anc-1', frameKind: 'uwbResp', counter: 999, fom: FOM_LOS })
const RANGE = rec({
  type: 'UWB_RANGE', node: 'tag-1', peer: 'anc-1', method: 'ds',
  tofRctu: 1066, tofRawRctu: 1088, distM: 5.02, trueDistM: 5, fom: FOM_LOS, block: 3, round: 0,
})
const RANGE_NO_RAW = rec({
  type: 'UWB_RANGE', node: 'tag-1', peer: 'anc-1', method: 'ss',
  tofRctu: 1066, distM: 5.02, trueDistM: 5, fom: FOM_LOS, block: 3, round: 0,
})
const POSITION = rec({
  type: 'UWB_POSITION', node: 'tag-1', x: 0.03, y: -0.04, trueX: 0, trueY: 0, gdop: 1.41,
  ellipse: { a: 0.06, b: 0.04, thetaRad: 0.5 }, anchors: ['anc-1', 'anc-2', 'anc-3', 'anc-4'], block: 3,
  method: 'twr',
})
const DL_POSITION = rec({
  type: 'UWB_POSITION', node: 'tag-1', x: 0.03, y: -0.04, trueX: 0, trueY: 0, gdop: 0.87,
  ellipse: { a: 0.03, b: 0.02, thetaRad: 0.5 }, anchors: ['anc-1', 'anc-2', 'anc-3', 'anc-4'], block: 3,
  method: 'dl-tdoa',
})
const TDOA = rec({
  type: 'UWB_TDOA', node: 'tag-1', ref: 'anc-1', peer: 'anc-3', dtNs: -8.237, trueDtNs: -8.019, block: 3, round: 0,
})
/** UL-TDoA: the infrastructure's own records, about a tag that only blinked (`of`). */
const UL_TDOA = rec({
  type: 'UWB_TDOA', node: 'anc-1', ref: 'anc-1', peer: 'anc-3', dtNs: -8.237, trueDtNs: -8.019,
  block: 3, round: 0, of: 'tag-1',
})
const UL_POSITION = rec({
  type: 'UWB_POSITION', node: 'anc-1', x: 0.03, y: -0.04, trueX: 0, trueY: 0, gdop: 0.87,
  ellipse: { a: 0.03, b: 0.02, thetaRad: 0.5 }, anchors: ['anc-1', 'anc-2', 'anc-3', 'anc-4'], block: 3,
  method: 'ul-tdoa', of: 'tag-1',
})
const AOA = rec({
  type: 'UWB_AOA', node: 'anc-1', peer: 'tag-1', thetaDeg: 44.98764, trueThetaDeg: 45, block: 3, round: 0,
})
/** A tag behind the anchor: the bearing is mirrored into the field of view, and the line
 * shows both numbers so a reader can see that it was. */
const AOA_BEHIND = rec({
  type: 'UWB_AOA', node: 'anc-1', peer: 'tag-1', thetaDeg: 41.62365, trueThetaDeg: 135, block: 3, round: 0,
})
/** One anchor, one range, one bearing: the fix names a single anchor and is about the tag. */
const AOA_POSITION = rec({
  type: 'UWB_POSITION', node: 'anc-1', x: 2.15, y: 3.35, trueX: 2.17, trueY: 3.33, gdop: 1,
  ellipse: { a: 0.27, b: 0.02, thetaRad: 3.93 }, anchors: ['anc-1'], block: 3, method: 'aoa', of: 'tag-1',
})
const TIMEOUT = rec({ type: 'UWB_TIMEOUT', node: 'tag-1', slot: 5, peer: 'anc-2', expected: 'uwbResp' })
const INTERFERED = rec({ type: 'UWB_INTERFERED', node: 'anc-1', from: 'tag-1', foreignDbm: -42.214, sirDb: -34.459 })
const CONTEND = rec({ type: 'UWB_CONTEND', node: 'anc-2', slot: 5, attempt: 2 })
const SIT_OUT = rec({ type: 'UWB_CONTEND', node: 'anc-2', slot: null, attempt: 0 })
const CONTEND_COLLISION = rec({ type: 'UWB_CONTEND_COLLISION', node: 'tag-1', slot: 5 })

describe('fmtUwbRecord', () => {
  it('names the round, its method and its slot shape', () => {
    expect(fmtUwbRecord(ROUND)).toBe('tag-1 UWB round 0 of block 3 (DS-TWR): 10 slots × 2000.0 µs')
  })

  it('gives a slot its deadline', () => {
    expect(fmtUwbRecord(SLOT)).toBe('tag-1 UWB slot 2 until 0.004 000 000')
  })

  it('reads a transmitted RMARKER off the ranging counter', () => {
    expect(fmtUwbRecord(TS_TX)).toBe('tag-1 TX RMARKER → anc-1 poll: counter 1234567')
  })

  it('adds the figure of merit to a received RMARKER', () => {
    expect(fmtUwbRecord(TS_RX)).toBe('tag-1 RX RMARKER ← anc-1 resp: counter 999 (97 % within 0.5 ns)')
  })

  it('puts the geometric truth and the uncorrected range beside a measurement', () => {
    expect(fmtUwbRecord(RANGE)).toBe(`tag-1 range → anc-1 (DS): 5.02 m (true 5.00 m, raw ${rctuToMetres(1088).toFixed(2)} m)`)
  })

  it('omits the raw range when the record carries none', () => {
    expect(fmtUwbRecord(RANGE_NO_RAW)).toBe('tag-1 range → anc-1 (SS): 5.02 m (true 5.00 m)')
  })

  it('names a one-way round by its direction, not by a TWR method it does not have', () => {
    expect(fmtUwbRecord(DL_ROUND)).toBe('tag-1 UWB round 0 of block 3 (DL-TDoA): 5 slots × 2000.0 µs')
  })

  it('puts a time difference beside the geometry it should have measured', () => {
    expect(fmtUwbRecord(TDOA)).toBe('tag-1 TDoA anc-3 − anc-1: -8.24 ns (true -8.02 ns)')
  })

  it('reports a fix with its error against the truth, its GDOP and its anchor count', () => {
    expect(fmtUwbRecord(POSITION)).toBe('tag-1 position (0.03, -0.04) m, true (0.00, 0.00), error 0.05 m, GDOP 1.41, 4 anchors')
  })

  it('names the method of a fix that two-way ranging did not solve', () => {
    // Two-way ranging is the line's unmarked case: it is what the lessons quote word for word.
    expect(fmtUwbRecord(DL_POSITION))
      .toBe('tag-1 position (0.03, -0.04) m, true (0.00, 0.00), error 0.05 m, GDOP 0.87, 4 anchors (DL-TDoA)')
  })

  it('says whose measurement it is when the node did not make it about itself', () => {
    // UL-TDoA: the reference anchor prints both lines, and both are about a tag that blinked
    // once. Without the "of" the position line would read as the anchor's own.
    expect(fmtUwbRecord(UL_TDOA)).toBe('anc-1 TDoA of tag-1 anc-3 − anc-1: -8.24 ns (true -8.02 ns)')
    expect(fmtUwbRecord(UL_POSITION))
      .toBe('anc-1 position of tag-1 (0.03, -0.04) m, true (0.00, 0.00), error 0.05 m, GDOP 0.87, 4 anchors (UL-TDoA)')
  })

  it('prints a bearing with the truth beside it, mirror and all', () => {
    expect(fmtUwbRecord(AOA)).toBe('anc-1 AoA ← tag-1: 45.0° (true 45.0°)')
    expect(fmtUwbRecord(AOA_BEHIND)).toBe('anc-1 AoA ← tag-1: 41.6° (true 135.0°)')
    // The fix it feeds says whose it is and that one anchor solved it.
    expect(fmtUwbRecord(AOA_POSITION))
      .toBe('anc-1 position of tag-1 (2.15, 3.35) m, true (2.17, 3.33), error 0.03 m, GDOP 1.00, 1 anchors (AoA)')
  })

  it('names what a silent slot was waiting for', () => {
    expect(fmtUwbRecord(TIMEOUT)).toBe('tag-1 UWB slot 5: no resp from anc-2')
  })

  it('reports a frame lost to Wi-Fi with its ratio and the foreign power', () => {
    expect(fmtUwbRecord(INTERFERED))
      .toBe('anc-1 UWB frame from tag-1 lost to Wi-Fi: SIR -34.5 dB (foreign -42.2 dBm)')
  })

  it('names the slot an anchor drew and which attempt it was', () => {
    expect(fmtUwbRecord(CONTEND)).toBe('anc-2 contends: slot 5 (attempt 2)')
  })

  it('says an anchor out of attempts sits the round out, with no slot to name', () => {
    expect(fmtUwbRecord(SIT_OUT)).toBe('anc-2 sits out this round')
  })

  it('names the response slot the tag lost to overlapping answers', () => {
    expect(fmtUwbRecord(CONTEND_COLLISION)).toBe('tag-1 contention collision in slot 5')
  })
})

describe('fmtRecord delegates every UWB record', () => {
  it.each([
    ROUND, DL_ROUND, SLOT, TS_TX, TS_RX, RANGE, RANGE_NO_RAW, TDOA, POSITION, DL_POSITION,
    UL_TDOA, UL_POSITION, AOA, AOA_POSITION, TIMEOUT, INTERFERED, CONTEND, SIT_OUT, CONTEND_COLLISION,
  ])('$type', (r) => {
    expect(fmtRecord(r)).toBe(fmtUwbRecord(r))
  })
})

describe('the event log expands a UWB frame in 802.15.4 vocabulary', () => {
  const poll = makePoll('tag-1', ['anc-1', 'anc-2'], 'ds', 1, 0)
  /** Concepts an 802.15.4 ranging frame simply does not have. */
  const WIFI_ONLY = ['RA / Address 1', 'TA / Address 2', 'Retry flag', 'Duration/ID']

  it('names the MHR fields and the ranging IEs', () => {
    const S = STRINGS.frameDetail.fields
    const rows = decodeFrame(poll, S)
    const labels = rows.map((r) => r.field)
    expect(labels).toContain(S.name.srcAddr16)
    expect(labels).toContain(S.name.dstAddr16)
    expect(labels).toContain(S.name.ieArc)
    expect(labels).toContain(S.name.ieRdm)
    for (const wrong of WIFI_ONLY) expect(labels).not.toContain(wrong)
    expect(rows.find((r) => r.field === S.name.ieRdm)!.value).toContain('anc-1 slot 1')
    expect(rows.find((r) => r.field === S.name.dstAddr16)!.value).toContain(S.broadcast)
  })

  it('leaves a Wi-Fi frame on the 802.11 rows it has always had', () => {
    const data: FrameDesc = { kind: 'data', src: 'ap', dst: 'sta-1', bytes: 1428, mbps: 54, durationFieldNs: 60_000, txTimeNs: 232_000 }
    expect(decodeFrame(data).map((r) => r.field)).toContain('RA / Address 1')
  })
})

// --- P802.15.4ab -------------------------------------------------------------------

const NB_LBT = rec({
  type: 'UWB_NB_LBT', node: 'tag-1', channel: 3, foreignDbm: -41.96, thresholdDbm: -71.02,
  block: 0, round: 0,
})
const TRAIN = rec({
  type: 'UWB_MMS_TRAIN', node: 'tag-1', peer: 'anc-1', kind: 'rsf', fragments: 8, heard: 8,
  rxDbm: -100.26, gainDb: 9.03, marginDb: 1.77, detected: true, ratioPpm: -20.0298, block: 0, round: 0,
})
const TRAIN_LOST = rec({
  type: 'UWB_MMS_TRAIN', node: 'tag-1', peer: 'anc-1', kind: 'rif', fragments: 2, heard: 0,
  rxDbm: -999, gainDb: 0, marginDb: -999, detected: false, ratioPpm: null, block: 0, round: 0,
})

describe('the MMS log lines', () => {
  it('says what a busy listen-before-talk check cost', () => {
    expect(fmtUwbRecord(NB_LBT))
      .toBe('tag-1 NB LBT busy on ch 3: -42.0 dBm ≥ -71.0 — skipping the block')
  })

  it('says what a train came to, in one line', () => {
    expect(fmtUwbRecord(TRAIN)).toBe(
      'tag-1 RSF train ← anc-1: 8/8 heard, -100.3 dBm + 9.0 dB = margin 1.8 dB → detected, '
      + 'ratio -20.030 ppm',
    )
  })

  it('quotes no power at all for a train nothing was heard of', () => {
    const line = fmtUwbRecord(TRAIN_LOST)
    expect(line).toBe('tag-1 RIF train ← anc-1: 0/2 heard → lost')
    // The sentinel never reaches the reader.
    expect(line).not.toContain('-999')
  })

  it('is what fmtRecord hands back for both of them', () => {
    for (const r of [NB_LBT, TRAIN, TRAIN_LOST]) {
      expect(fmtRecord(r)).toBe(fmtUwbRecord(r))
    }
  })

  it('names the five new frame kinds in a timestamp and a timeout', () => {
    const ts = rec({ type: 'UWB_TS', node: 'anc-1', dir: 'rx', peer: 'tag-1', frameKind: 'uwbRsf', counter: 77, fom: FOM_LOS })
    expect(fmtUwbRecord(ts)).toContain('RSF')
    const to = rec({ type: 'UWB_TIMEOUT', node: 'anc-1', slot: 0, peer: 'tag-1', expected: 'nbPoll' })
    expect(fmtUwbRecord(to)).toBe('anc-1 UWB slot 0: no nb-poll from tag-1')
  })
})
