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

const ROUND = rec({ type: 'UWB_ROUND', node: 'tag-1', block: 3, round: 0, slots: 10, slotNs: 2_000_000, method: 'ds', untilNs: 20_000_000 })
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

  it('reports a fix with its error against the truth, its GDOP and its anchor count', () => {
    expect(fmtUwbRecord(POSITION)).toBe('tag-1 position (0.03, -0.04) m, true (0.00, 0.00), error 0.05 m, GDOP 1.41, 4 anchors')
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
    ROUND, SLOT, TS_TX, TS_RX, RANGE, RANGE_NO_RAW, POSITION, TIMEOUT, INTERFERED,
    CONTEND, SIT_OUT, CONTEND_COLLISION,
  ])('$type', (r) => {
    expect(fmtRecord(r)).toBe(fmtUwbRecord(r))
  })
})

describe('the event log expands a UWB frame in 802.15.4 vocabulary', () => {
  const poll = makePoll('tag-1', ['anc-1', 'anc-2'], 'ds', 1, 0)
  /** Concepts an 802.15.4 ranging frame simply does not have. */
  const WIFI_ONLY = ['RA / Address 1', 'TA / Address 2', 'Retry flag', 'Duration/ID']

  it.each(['en', 'zh'] as const)('%s names the MHR fields and the ranging IEs', (lang) => {
    const S = STRINGS[lang].frameDetail.fields
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
