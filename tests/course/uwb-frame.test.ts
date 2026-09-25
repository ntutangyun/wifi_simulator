/**
 * Every empirical claim in "What a ranging frame is made of", measured against
 * the lesson's own scenario — the same scene uwb-intro loads, so the split costs
 * the reader nothing and the recorded hashes are the same run twice.
 *
 * The field durations, the RMARKER offset and the two-slot round moved here from
 * tests/course/uwb-intro.test.ts, each with the sentence it guards.
 *
 * One claim of this lesson is pinned next door: the try-this experiment's
 * 15.650 ps, 0.299792458 m/ns, 1070 RCTU and 5.02 m are the four counters of
 * uwb-intro's own round, asserted in tests/course/uwb-intro.test.ts, describe
 * "uwb-intro · the four lines to subtract", test "subtracting them by hand
 * gives 1070 RCTU, 16.75 ns, 5.02 m". The two lessons share one scene, so that
 * assertion covers this experiment exactly.
 */
import { describe, it, expect } from 'vitest'
import { uwbFrame, uwbFrameFields } from '../../src/course/uwb/uwb-frame'
import { uwbIntroScenario } from '../../src/course/uwb/uwb-intro'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { ACK_TX_TIME_6M_NS } from '../../src/engine/phy'
import { uwbPpduLayout } from '../../src/uwb/frameFields'
import { UwbClock } from '../../src/uwb/clock'
import type { Block } from '../../src/course/lessonKit'
import {
  DATA_SYMBOL_CHIPS, PHR_SYMBOLS, PHR_SYMBOL_CHIPS, PSYM_CHIPS, RS_PARITY_BITS, SFD_SYMBOLS,
  STS_ACTIVE_CHIPS, STS_GAP_CHIPS, SYNC_SYMBOLS, TAIL_SYMBOLS, UWB_RMARKER_CHIPS,
  RCTU_NS, RCTU_PS, UWB_RMARKER_NS, UWB_TS_ACCUM_GAIN_DB,
  chipsToNs, psduSymbols, uwbPollBytes, uwbPpduNs, uwbRespBytes,
} from '../../src/uwb/phy'
import { UWB_MBPS } from '../../src/uwb/frames'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 30 * MS

/** This lesson's records, from the kit's shared memo: uwb-intro's scene, run once per worker. */
const recs = (variant?: number): TLRecord[] => runOf(uwbFrame, variant, RUN_NS)
const txs = (rs: TLRecord[], kind: string) => ofType(rs, 'TX_START').filter((r) => r.frame.kind === kind)

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
// `sameSceneAs` is the split rule: uwb-frame loads uwb-intro's scene, so its
// recorded timeline hashes are uwb-intro's, value for value.
//
// The prose window is 1100 rather than 1000 since the 2026-09-23 amendment
// ("mechanism before metaphor"): `numbers` now carries the procedure by which a
// stamp is taken off this frame, which the old ceiling had no room for. It is
// still well inside the contract's own picture + numbers (900 + 550).
lessonShapeSuite(uwbFrame, { runNs: RUN_NS, sameSceneAs: 'uwb-intro' })

describe('uwb-frame · the lesson’s own scene', () => {
  it('is the second lesson of the UWB track', () => {
    expect(MODULES[uwbFrame.module].title).toBe('飞行时间')
    expect(uwbFrame.needs).toEqual(['uwb-intro'])
    // the second lesson of the track may use a table in the picture, and gets up to six new words.
    // `chip` is one of them: it is the unit every duration in this lesson is counted in, and
    // uwb-intro cannot hold it (a track's first lesson is capped at four terms).
    expect(uwbFrame.terms!.map((t) => t.term)).toEqual(['SYNC', 'SFD', 'STS', 'PHR', 'PSDU', 'chip'])
  })

  it('the poll really is far longer than a Wi-Fi acknowledgement', () => {
    // why: "A ranging frame carries almost no data, yet it is long — far longer than a Wi-Fi
    //  acknowledgement." A 14-octet ACK at 6 Mb/s is 44 µs; the poll is 197.628 µs.
    expect(ACK_TX_TIME_6M_NS).toBe(44_000)
    expect(uwbPpduNs(30)).toBeGreaterThan(4 * ACK_TX_TIME_6M_NS)
  })

  it('the scenario and the variant are uwb-intro’s own, and pass the schema', () => {
    // "Both lessons load the same scene": the split adds no new scenario, so the
    // recorded timeline hashes of uwb-frame are uwb-intro's, value for value.
    expect(uwbFrame.scenario()).toEqual(uwbIntroScenario(5))
    expect(uwbFrame.variants!.map((v) => v.scenario())).toEqual([uwbIntroScenario(20)])
    expect(() => ScenarioSchema.parse(uwbFrame.scenario())).not.toThrow()
    for (const v of uwbFrame.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

})

describe('uwb-frame · what 197.628 µs is made of', () => {
  const poll = txs(recs(), 'uwbPoll')[0]
  const layout = uwbPpduLayout(poll.frame)
  const durOf = (key: string, nth = 0): number => layout.filter((s) => s.key === key)[nth].durNs

  it('the poll is 30 octets and 197.628 µs, exactly the PPDU the engine builds', () => {
    // the table's "PSDU, 30 octets" row and its "The whole poll … 197.628 µs" row, and the
    // picture's "thirty bytes in the poll and twenty in the answer"
    expect(uwbPollBytes(1)).toBe(30)
    expect(poll.frame.bytes).toBe(30)
    expect(uwbPpduNs(30)).toBe(197_628)
    expect(poll.frame.txTimeNs).toBe(197_628)
    expect((197_628 / US).toFixed(3)).toBe('197.628')
  })

  it('every field duration in the table is chipsToNs of its chip count', () => {
    // the "Duration" column: SYNC 65.128, SFD 8.141, STS gap 1.026, STS 65.641, PHR 19.487, PSDU 37.179
    expect(durOf('sync')).toBe(chipsToNs(SYNC_SYMBOLS * PSYM_CHIPS))
    expect(durOf('sync')).toBe(65_128)
    expect(durOf('sfd')).toBe(chipsToNs(SFD_SYMBOLS * PSYM_CHIPS))
    expect(durOf('sfd')).toBe(8_141)
    expect(durOf('stsGap')).toBe(chipsToNs(STS_GAP_CHIPS))
    expect(durOf('stsGap')).toBe(1_026)
    expect(durOf('stsGap', 1)).toBe(1_026)
    expect(durOf('sts')).toBe(chipsToNs(STS_ACTIVE_CHIPS))
    expect(durOf('sts')).toBe(65_641)
    expect(durOf('phr')).toBe(chipsToNs(PHR_SYMBOLS * PHR_SYMBOL_CHIPS))
    expect(durOf('phr')).toBe(19_487)
    expect(durOf('psdu')).toBe(chipsToNs(psduSymbols(30) * DATA_SYMBOL_CHIPS))
    expect(durOf('psdu')).toBe(37_179)
    expect(layout.reduce((s, x) => s + x.durNs, 0)).toBe(197_628)
  })

  it('the symbol and chip counts the "Field" column names are the engine’s own', () => {
    // Every "Field" cell now states its chips as well as its symbols: "SYNC, 64 preamble symbols
    // × 508 chips = 32 512 chips" / "SFD, 8 preamble symbols × 508 chips = 4064 chips" /
    // "STS gap, 512 chips" / "STS, 64 × 512 = 32 768 chips" / "PHR, 19 symbols × 512 chips =
    // 9728 chips" / "PSDU, 30 octets: 290 symbols × 64 chips = 18 560 chips". A compensating
    // change (fewer symbols, longer symbol) would keep every duration above and quietly falsify
    // all six cells, so both factors and the product are pinned.
    expect(SYNC_SYMBOLS).toBe(64)
    expect(SFD_SYMBOLS).toBe(8)
    expect(STS_GAP_CHIPS).toBe(512)
    expect(STS_ACTIVE_CHIPS).toBe(64 * 512)
    expect(PHR_SYMBOLS).toBe(19)
    // the chip products each cell prints, and the duration each one buys
    expect(SYNC_SYMBOLS * PSYM_CHIPS).toBe(32_512)
    expect(SFD_SYMBOLS * PSYM_CHIPS).toBe(4064)
    expect(STS_ACTIVE_CHIPS).toBe(32_768)
    expect(PHR_SYMBOLS * PHR_SYMBOL_CHIPS).toBe(9728)
    expect(psduSymbols(30) * DATA_SYMBOL_CHIPS).toBe(18_560)
    expect(chipsToNs(SFD_SYMBOLS * PSYM_CHIPS)).toBe(8141)
  })

  it('a symbol is a block of chips, and the blocks are not the same size', () => {
    // The table's three symbol sizes, one per "Field" cell: 508 chips a preamble symbol, 512 a
    //  PHR symbol, 64 a data symbol. ("Two words, two sizes", the paragraph that used to
    //  reconcile them in prose, went when every cell started printing its own chips.)
    expect(PSYM_CHIPS).toBe(508)
    expect(PHR_SYMBOL_CHIPS).toBe(512)
    expect(DATA_SYMBOL_CHIPS).toBe(64)
    expect(PSYM_CHIPS).toBeGreaterThan(DATA_SYMBOL_CHIPS)
    // the paragraph's claim about SYNC (64 symbols) and STS (32 768 chips) landing nearly together
    expect(durOf('sts') / durOf('sync')).toBeGreaterThan(0.99)
    expect(durOf('sts') / durOf('sync')).toBeLessThan(1.02)
    // "290 symbols of 64 chips" for the 30-octet PSDU
    expect(psduSymbols(30)).toBe(290)
    expect(chipsToNs(290 * DATA_SYMBOL_CHIPS)).toBe(37_179)
  })

  it('the frame runs SYNC, SFD, the stamp, STS between its gaps, PHR, PSDU', () => {
    // The six-item list "The frame in order" stood here until the 2026-09-26 re-pacing; §5.4
    // gives the order to the `fields` figure, whose own boxes are pinned below in
    // "uwb-frame · the figure of the frame". What this test still measures is the engine's
    // layout, which is what both the figure and the caption's claim rest on: the stamp falls
    // after SYNC and SFD and before the STS, the PHR and the PSDU. (An earlier wording,
    // "everything after it is the message", was false of this layout.)
    expect(layout.map((s) => s.key)).toEqual(['sync', 'sfd', 'stsGap', 'sts', 'stsGap', 'phr', 'psdu'])
    // the stamp falls on the boundary between the SFD and the first STS gap — after SYNC and SFD,
    // and before the STS, the PHR and the PSDU, which is what the sentence now says
    const stamped = layout.findIndex((s) => s.rmarkerNs !== undefined)
    expect(layout[stamped].key).toBe('stsGap')
    expect(layout.slice(0, stamped).map((s) => s.key)).toEqual(['sync', 'sfd'])
    expect(layout.slice(stamped).map((s) => s.key)).toEqual(['stsGap', 'sts', 'stsGap', 'phr', 'psdu'])
    expect(layout[stamped].rmarkerNs).toBe(durOf('sync') + durOf('sfd'))
    // and so most of what follows the stamp is not the message
    const afterStamp = 197_628 - 73_269
    expect(afterStamp - durOf('psdu')).toBeGreaterThan(durOf('psdu'))
  })

  it('the PSDU is 240 data bits, 48 parity bits and a 2-symbol tail, carried at 6.81 Mb/s', () => {
    // the formula "Why 30 octets cost 37.179 µs": "240 data bits + 48 parity bits + a 2-symbol
    //  tail = 290 symbols × 64 chips", and its note: "At 6.81 Mb/s the message alone would be
    //  35.2 µs of air. Coding, not the message, is most of what a payload costs."
    expect(UWB_MBPS).toBe(6.81)
    expect(poll.frame.mbps).toBe(UWB_MBPS)
    expect(30 * 8).toBe(240)
    expect(RS_PARITY_BITS).toBe(48)
    expect(TAIL_SYMBOLS).toBe(2)
    expect(psduSymbols(30)).toBe(240 + RS_PARITY_BITS + TAIL_SYMBOLS)
    // the clause exists because the uncoded figure is 35.2 µs, not the 37.179 µs beside it
    // (6.81 Mb/s is 6.81 bits per µs, so 240 bits are 35.2 µs of air before coding)
    expect((240 / UWB_MBPS).toFixed(1)).toBe('35.2')
  })

  it('160.449 µs of the poll is structure and only 37.179 µs is the message', () => {
    // "160.449 µs structure, 37.179 µs message" — and the observation "the PSDU comes last, and it
    //  is shorter than the run of SYNC that opens the frame", and the outcome "the message takes
    //  less air than the pattern that introduces it"
    const structure = layout.filter((s) => s.key !== 'psdu').reduce((s, x) => s + x.durNs, 0)
    expect(structure).toBe(160_449)
    expect(structure + 37_179).toBe(197_628)
    expect(layout[layout.length - 1].key).toBe('psdu')
    expect(durOf('psdu')).toBeLessThan(durOf('sync'))
    expect(durOf('psdu')).toBeLessThan(durOf('sts'))
    // "the message is a small part of the frame": under a fifth of the airtime
    expect(durOf('psdu') / 197_628).toBeLessThan(0.2)
  })

  it('the RMARKER is the first chip after the SFD, 73.269 µs in', () => {
    // the formula "Where the RMARKER falls": "SYNC 65.128 µs + SFD 8.141 µs = 73.269 µs into the
    //  frame", and its note "After the pattern and the marker that closes it, before everything else"
    // and the quiz option "the first chip after the SFD — 73.269 µs into the frame"
    expect(UWB_RMARKER_CHIPS).toBe((SYNC_SYMBOLS + SFD_SYMBOLS) * PSYM_CHIPS)
    expect(chipsToNs(UWB_RMARKER_CHIPS)).toBe(73_269)
    expect(65_128 + 8_141).toBe(73_269)
    expect(layout.find((s) => s.rmarkerNs !== undefined)!.rmarkerNs).toBe(73_269)
  })

  it('the response is 20 octets and 187.372 µs, differing from the poll only in its PSDU', () => {
    // the "The poll and the response" table: "Poll | 30 octets | 37.179 µs | 197.628 µs" and
    //  "Response | 20 octets | 26.923 µs | 187.372 µs", and the formula note's "the response is
    //  built the same way, so its RMARKER falls at the very same offset"
    const resp = txs(recs(), 'uwbResp')[0]
    expect(uwbRespBytes('ss')).toBe(20)
    expect(resp.frame.bytes).toBe(20)
    expect(resp.frame.txTimeNs).toBe(187_372)
    const rl = uwbPpduLayout(resp.frame)
    expect(rl.find((s) => s.key === 'psdu')!.durNs).toBe(26_923)
    expect(rl.filter((s) => s.key !== 'psdu').map((s) => s.durNs))
      .toEqual(layout.filter((s) => s.key !== 'psdu').map((s) => s.durNs))
    expect(rl.find((s) => s.rmarkerNs !== undefined)!.rmarkerNs).toBe(73_269)
    // "Of the two 2 ms slots the round occupies, only 385 µs carries a frame at all."
    expect(Math.round((197_628 + 187_372) / US)).toBe(385)
  })

  it('the round is two 2 ms slots and the response leaves at exactly 2 000 000 ns', () => {
    // observe: "the poll in the first slot, the response in the second, which starts at exactly
    //  2 000 000 ns. Almost all of the round is silence." / numbers: "Of the two 2 ms slots the
    //  round occupies, only 385 µs carries a frame at all." / picture: "the answer leaves at the
    //  top of its slot whether it was ready early or not"
    const rs = recs()
    const round = ofType(rs, 'UWB_ROUND')
    expect(round).toHaveLength(1)
    expect(round[0].t).toBe(0)
    expect(round[0].node).toBe('tag-1')
    expect(round[0].method).toBe('ss')
    expect(round[0].slots).toBe(2)
    expect(round[0].slotNs).toBe(2 * MS)
    expect(ofType(rs, 'UWB_SLOT').map((r) => r.t)).toEqual([0, 2 * MS])
    expect(txs(rs, 'uwbResp')[0].t).toBe(2 * MS)
    // the poll is ready long before its slot ends: 197.628 µs of 2 ms
    expect(txs(rs, 'uwbPoll')[0].t).toBe(0)
  })
})

describe('uwb-frame · the figure of the frame', () => {
  // §4 gives this lesson a `fields` figure — SYNC | SFD | RMARKER | STS | PHR | PSDU with
  // their durations — and it replaces the six-item list that used to name the order (§5.4).
  // Every box is therefore pinned against the PPDU the engine builds, box for box.
  const poll = txs(recs(), 'uwbPoll')[0]
  const layout = uwbPpduLayout(poll.frame)
  const spec = uwbFrameFields()

  it('one box per segment, in the engine’s order and to the engine’s durations', () => {
    expect(spec.unit).toBe('µs')
    expect(spec.fields.map((f) => f.size)).toEqual(layout.map((s) => s.durNs / US))
    expect(spec.fields).toHaveLength(7)
    // and the labels name the segments the layout names, in its order
    expect(spec.fields.map((f) => f.label.split(' ')[0]))
      .toEqual(['SYNC', 'SFD', '↓RMARKER', 'STS', '间隔', 'PHR', 'PSDU'])
  })

  it('the box the stamp is drawn on is the one the RMARKER falls in', () => {
    // The caption's claim: "the stamp is on the first chip of the third box, the first chip
    // after the SFD". The third segment is the 512-chip silence, and the engine marks the
    // RMARKER at its start — SYNC + SFD into the frame.
    const stamped = layout.findIndex((s) => s.rmarkerNs !== undefined)
    expect(stamped).toBe(2)
    expect(spec.fields[stamped].label).toBe('↓RMARKER')
    expect(layout[stamped].key).toBe('stsGap')
    expect(layout[stamped].durNs).toBe(chipsToNs(STS_GAP_CHIPS))
    expect(layout[stamped].rmarkerNs).toBe(chipsToNs(UWB_RMARKER_CHIPS))
    expect(spec.fields.slice(0, stamped).reduce((n, f) => n + f.size, 0) * US).toBe(73_269)
  })

  it('the total under the row is the frame, split into structure and message', () => {
    expect(spec.total).toBe('整帧 197.628 µs：结构 160.449，消息 37.179')
    expect(spec.fields.reduce((n, f) => n + f.size, 0) * US).toBe(uwbPpduNs(30))
    expect(spec.fields[6].size * US).toBe(layout.find((s) => s.key === 'psdu')!.durNs)
  })
})

describe('uwb-frame · how a stamp is taken off this frame', () => {
  // The steps block of `numbers` is the path the engine takes: `uwbPpduLayout`
  // (src/uwb/frameFields.ts) lays the segments out and marks the RMARKER at
  // SYNC + SFD; `UwbDevice.transmitFor` reads `clock.counter(t + UWB_RMARKER_NS)`
  // before it sends; the receive branch of `onRx` stamps the arriving RMARKER with
  // the leading-edge estimator's noise, whose reference floor (`UWB_TS_ACCUM_GAIN_DB`)
  // is the gain of accumulating the whole SYNC field.
  const rs = recs()
  const poll = txs(rs, 'uwbPoll')[0]
  const layout = uwbPpduLayout(poll.frame)
  const steps = uwbFrame.numbers!.find((b) => b.kind === 'steps') as Extract<Block, { kind: 'steps' }>

  it('the lesson states the procedure as six steps, in the numbers', () => {
    expect(steps).toBeDefined()
    expect(steps.items).toHaveLength(6)
  })

  it('step 1: five fixed segments, and only the PSDU’s length follows the message', () => {
    // "64 preamble symbols of SYNC, 8 of SFD, the STS between two 512-chip gaps, the PHR, and
    //  last the PSDU — the one part whose length the message decides."
    const resp = txs(rs, 'uwbResp')[0]
    const rl = uwbPpduLayout(resp.frame)
    expect(layout.map((s) => s.key)).toEqual(rl.map((s) => s.key))
    for (const [i, seg] of layout.entries()) {
      if (seg.key === 'psdu') expect(seg.durNs).not.toBe(rl[i].durNs)
      else expect(seg.durNs, seg.key).toBe(rl[i].durNs)
    }
    expect(poll.frame.bytes).toBe(30)
    expect(resp.frame.bytes).toBe(20)
  })

  it('step 2: the sender reads its counter 73.269 µs into the frame, not at its start', () => {
    // "It counts 73.269 µs from the frame’s first chip and reads its own ranging counter there.
    //  That reading goes out with the frame, and is the TX RMARKER line in the log."
    const clock = new UwbClock(0, 0)
    expect(clock.counter(UWB_RMARKER_NS) - clock.counter(0)).toBe(UWB_RMARKER_CHIPS * 128)
    expect(UWB_RMARKER_CHIPS * 128).toBe(4_681_728)
    expect(Math.round(UWB_RMARKER_NS)).toBe(73_269)
    // and the stamp is taken at the transmission's own instant, before the frame is over
    const tx = ofType(rs, 'UWB_TS').filter((r) => r.dir === 'tx')[0]
    expect(tx.t).toBe(poll.t)
    expect(tx.frameKind).toBe('uwbPoll')
  })

  it('step 3: the whole SYNC field is accumulated, which is worth 18.1 dB', () => {
    // "The receiver accumulates the whole SYNC field — all 64 repetitions of the one preamble
    //  symbol — which is worth 18.1 dB over a single symbol"
    expect(UWB_TS_ACCUM_GAIN_DB).toBe(10 * Math.log10(SYNC_SYMBOLS))
    expect(UWB_TS_ACCUM_GAIN_DB.toFixed(1)).toBe('18.1')
    expect(SYNC_SYMBOLS).toBe(64)
  })

  it('steps 4 and 5: the stamp is the first chip after the SFD, rounded to whole ticks', () => {
    // "It finds the SFD, and takes the first chip after it as the RMARKER" / "It reads its own
    //  counter there … 100 ps of 1-σ on this link — and rounds it to whole ticks of 15.650 ps."
    expect(layout.find((s) => s.rmarkerNs !== undefined)!.rmarkerNs).toBe(73_269)
    expect(uwbFrame.scenario().uwb!.tsNoisePs).toBe(100)
    expect(RCTU_PS.toFixed(3)).toBe('15.650')
    expect(RCTU_NS * 1000).toBe(RCTU_PS)
    for (const r of ofType(rs, 'UWB_TS')) expect(Number.isInteger(r.counter), `${r.node} ${r.dir}`).toBe(true)
  })

  it('step 6: nothing after that instant moves the stamp', () => {
    // "The STS, the PHR and the PSDU are still checked and read, but the timestamp is already
    //  taken." The two frames differ only in their PSDU, and the RMARKER sits at one offset.
    const resp = txs(rs, 'uwbResp')[0]
    const after = layout.slice(layout.findIndex((s) => s.rmarkerNs !== undefined)).map((s) => s.key)
    expect(after).toEqual(['stsGap', 'sts', 'stsGap', 'phr', 'psdu'])
    expect(uwbPpduLayout(resp.frame).find((s) => s.rmarkerNs !== undefined)!.rmarkerNs)
      .toBe(layout.find((s) => s.rmarkerNs !== undefined)!.rmarkerNs)
    expect(resp.frame.txTimeNs).not.toBe(poll.frame.txTimeNs)
  })
})
