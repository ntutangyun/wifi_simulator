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
  RCTU_NS, RCTU_PS, RS_BLOCK_BITS, UWB_RMARKER_NS, UWB_RX_SENS_DBM, UWB_TS_ACCUM_GAIN_DB,
  chipsToNs, psduSymbols, uwbPollBytes, uwbPpduNs, uwbRespBytes,
} from '../../src/uwb/phy'
import { UWB_MBPS } from '../../src/uwb/frames'
import { rctuToMetres } from '../../src/uwb/ranging'
import { readFileSync } from 'node:fs'
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
    /*
     * **And `observe`'s own sentence, read.** 「Poll 在第一个时隙，Response 在第二个，而第二个
     * 时隙恰好从 2 000 000 ns 开始」 — uncovered by the 「第」 rule change of 2026-10-14, and
     * the one figure of this lesson with **no equal literal anywhere under `tests/`**: every
     * assertion above writes the instant as `2 * MS`. The two ordinals are figures too: they say
     * which slot each frame goes out in, and the answer waits for the top of its own slot.
     */
    const cn = (s: string): number => '零一二三四五六七八九'.indexOf(s.replace(/两/g, '二'))
    const o = /Poll 在第(.)个时隙，Response 在第(.)个，而第(.)个时隙恰好从 ([\d ]+) ns 开始/
      .exec(uwbFrame.observe.join(' '))
    expect(o, '`observe` no longer says which slot each frame leaves in').not.toBeNull()
    const slotTs = ofType(rs, 'UWB_SLOT').map((r) => r.t)
    expect(slotTs[cn(o![1]!) - 1], 'the slot the poll leaves in').toBe(txs(rs, 'uwbPoll')[0].t)
    expect(slotTs[cn(o![2]!) - 1], 'and the one the response leaves in')
      .toBe(txs(rs, 'uwbResp')[0].t)
    expect(cn(o![3]!), 'the sentence names that same slot twice').toBe(cn(o![2]!))
    expect(Number(o![4]!.replace(/ /g, '')), 'where that slot really starts')
      .toBe(slotTs[cn(o![3]!) - 1])
  })

  it('reads the RMARKER offset at both places it is printed, and the poll’s thirty octets', () => {
    /*
     * **Two more printings the 「第」 rule change of 2026-10-14 uncovered.** The formula and a
     * quiz option both give the offset (「距帧首 73.269 µs」, 「帧内 73.269 µs」) and the three
     * figures of the formula are the two segments and their sum — all measurable off this
     * frame's own layout. The quiz explanation's 「30 个字节就够了」 is the poll's own size, and
     * the wrong option beside it says the standard caps a ranging payload at thirty octets:
     * **that one is a claim about the standard and this repository has no corpus of it**, so
     * what is read is that the figure in the explanation is the frame the engine really builds.
     */
    const rs = recs()
    const poll = txs(rs, 'uwbPoll')[0]!
    const lay = uwbPpduLayout(poll.frame)
    const quiz = uwbFrame.quiz.map((q) => `${q.q}\u000a${q.options.join('\u000a')}\u000a${q.explain}`)
      .join('\u000a')
    const form = /SYNC ([\d.]+) µs \+ SFD ([\d.]+) µs = 帧内 ([\d.]+) µs/
      .exec(uwbFrame.numbers!.map((b) => (b as { text?: string }).text ?? '').join(' '))
    expect(form, 'the formula no longer adds the two segments up').not.toBeNull()
    const [sync, sfd, sum] = form!.slice(1).map(Number)
    expect(sync! * US, 'the SYNC this frame really carries')
      .toBe(lay.find((s) => s.key === 'sync')!.durNs)
    expect(sfd! * US, 'and the SFD after it').toBe(lay.find((s) => s.key === 'sfd')!.durNs)
    expect(sum! * US, 'the two of them together, which is where the RMARKER falls')
      .toBe(lay.find((s) => s.rmarkerNs !== undefined)!.rmarkerNs)
    expect(Number((sync! + sfd!).toFixed(3)), 'and the sentence’s own addition').toBe(sum)
    const q = /距帧首 ([\d.]+) µs/.exec(quiz)
    expect(q, 'the quiz option no longer gives the offset').not.toBeNull()
    expect(Number(q![1]), 'the same offset the formula gives').toBe(sum)
    const bytes = /(\d+) 个字节就够了/.exec(quiz)
    expect(bytes, 'the explanation no longer says how little the poll has to carry').not.toBeNull()
    expect(Number(bytes![1]), 'the octets the poll really carries').toBe(poll.frame.bytes)
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

/**
 * **Every figure the prose prints, read back out of it.**
 *
 * This file measures the whole PPDU, field by field and chip by chip — against figures typed on
 * **this** side, with the lesson's own cell quoted in a comment above each one. The sampling
 * sweep of 2026-10-12 scored the lesson 6 of 6: every figure it planted went unnoticed, because
 * no assertion here reads the lesson at all.
 *
 * **The reads worth naming:**
 *
 *  - **every cell of the field table is read as its own arithmetic.** 「SYNC，64 个前导符号 ×
 *    508 码片 = 32 512 码片」 has all three figures parsed out, the product has to be the third,
 *    and the third has to be the chips the engine's layout gives that field — so a compensating
 *    edit (fewer symbols, longer symbol) that keeps the duration right still fails.
 *  - **the PSDU's bit budget is read as a sum.** 「240 个数据比特 + 48 个校验比特 + 2 个符号的尾
 *    = 290 个符号」 is checked against `psduSymbols` and against the parity the engine adds.
 *  - **the RMARKER is read as the sum of the two fields in front of it**, both of which are read
 *    off the layout, and the quiz's three printings of the same three figures are read too.
 *  - **the 0.299792458 m/ns of `tryThis` is read as the speed of light** — the one figure in this
 *    lesson that is a constant of nature rather than of the engine.
 */
describe('uwb-frame · every figure the prose prints, read back out of it', () => {
  const poll = txs(recs(), 'uwbPoll')[0]!
  const resp = txs(recs(), 'uwbResp')[0]!
  const layout = uwbPpduLayout(poll.frame)
  const seg = (key: string, nth = 0) => layout.filter((x) => x.key === key)[nth]!
  const blockText = (b: unknown): string => {
    const out: string[] = []
    const walk = (v: unknown): void => {
      if (typeof v === 'string') out.push(v)
      else if (Array.isArray(v)) for (const x of v) walk(x)
      else if (v !== null && typeof v === 'object') for (const x of Object.values(v)) walk(x)
    }
    walk(b)
    return out.join('\n')
  }
  const NUMS = blockText(uwbFrame.numbers)
  const SRC = blockText(uwbFrame.sources)
  const LIM = blockText(uwbFrame.limits)
  const TRY = blockText(uwbFrame.tryThis)
  const QUIZ = blockText(uwbFrame.quiz)

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  /** A figure READ off the lesson against a measurement, at the precision it was printed to. */
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const tableOf = (n: number): Extract<Block, { kind: 'table' }> => uwbFrame.numbers!
    .filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[n]!

  it('reads the field table: both factors, the product, and the duration each one buys', () => {
    const rows = tableOf(0).rows
    /** Which layout key each row of the table is about, by the name the row opens with. */
    const KEY: Record<string, string> = {
      SYNC: 'sync', SFD: 'sfd', STS: 'sts', PHR: 'phr', PSDU: 'psdu',
    }
    let seen = 0
    for (const row of rows) {
      const name = /^([A-Z]+)/.exec(row[0]!)?.[1]
      // 「STS 间隔」 and 「STS」 both open with the same three letters, and they are two fields:
      // the gap states one factor, the active segment a product.
      const key = row[0]!.startsWith('STS 间隔') ? 'stsGap'
        : name === undefined ? undefined : KEY[name]
      if (key === undefined) continue
      if (key === 'stsGap') {
        same(raw(row[0]!, /STS 间隔，([\d ]+) 码片/, 'the gap row’s own chips')[0]!, STS_GAP_CHIPS,
          'the chips of one STS gap')
        same(raw(row[1]!, /^([\d.]+) µs$/, 'the gap’s duration')[0]!, seg('stsGap').durNs / US,
          'the duration of one STS gap')
        seen++
        continue
      }
      seen++
      const chips = seg(key).durNs
      // Every row that states a product states both of its factors.
      // The factor is the one immediately in front of the ×, not the first number of the cell:
      // the PSDU row opens with its octet count, and reading that as a factor gives 30 × 64.
      const prod = /(\d+) 个(?:前导)?符号 × ([\d ]+) 码片 = ([\d ]+) 码片/.exec(row[0]!)
        ?? /(\d+) × ([\d ]+) = ([\d ]+) 码片/.exec(row[0]!)
      expect(prod, `the 「${name}」 row no longer states its chips as a product`).not.toBeNull()
      const [a, b, total] = prod!.slice(1).map(val)
      expect(a! * b!, `the 「${name}」 row’s own arithmetic`).toBe(total)
      expect(chipsToNs(total!), `and the chips of 「${name}」 buy its duration`).toBe(chips)
      // …and the duration cell beside it, to the three decimals the lesson prints.
      same(raw(row[1]!, /^([\d.]+) µs$/, `the duration of 「${name}」`)[0]!, chips / US,
        `the duration of 「${name}」`)
    }
    expect(seen, 'the seven rows of the table that name a field of the frame').toBe(7)
    // The symbol counts the rows state are the engine's own.
    expect(figs(rows[0]![0]!, /SYNC，(\d+) 个前导符号/, 'the SYNC row')[0], 'the SYNC symbols')
      .toBe(SYNC_SYMBOLS)
    expect(figs(rows[1]![0]!, /SFD，(\d+) 个前导符号/, 'the SFD row')[0], 'the SFD symbols')
      .toBe(SFD_SYMBOLS)
    expect(figs(rows[0]![0]!, /× ([\d ]+) 码片/, 'the preamble symbol')[0], 'a preamble symbol’s chips')
      .toBe(PSYM_CHIPS)
    const phr = rows.find((r) => r[0]!.startsWith('PHR'))!
    expect(figs(phr[0]!, /PHR，(\d+) 个符号 × ([\d ]+) 码片/, 'the PHR row'),
      'the PHR’s symbols and its symbol length').toEqual([PHR_SYMBOLS, PHR_SYMBOL_CHIPS])
    const psdu = rows.find((r) => r[0]!.startsWith('PSDU'))!
    const [octets, symbols, chipsPer] = figs(psdu[0]!,
      /PSDU，(\d+) 个字节：(\d+) 个符号 × (\d+) 码片/, 'the PSDU row')
    expect(octets, 'the octets this poll carries').toBe(poll.frame.bytes)
    expect(symbols, 'the symbols they become').toBe(psduSymbols(octets!))
    expect(chipsPer, 'and a data symbol’s chips').toBe(DATA_SYMBOL_CHIPS)
    // The STS row's two factors, and the gap row if it states one.
    const sts = rows.find((r) => r[0]!.startsWith('STS，'))!
    const [reps, unit] = figs(sts[0]!, /STS，(\d+) × ([\d ]+) =/, 'the STS row')
    expect(reps! * unit!, 'the STS chips the engine uses').toBe(STS_ACTIVE_CHIPS)
    expect(unit, 'in units the gap between its halves is one of').toBe(STS_GAP_CHIPS)
    // The whole frame, in the heading above the table and in the last row.
    same(raw(NUMS, /^([\d.]+) µs 由什么组成/m, 'the heading above the table')[0]!,
      poll.frame.txTimeNs / US, 'the whole poll')
    expect(uwbPpduNs(poll.frame.bytes), 'which the engine computes from its octets')
      .toBe(poll.frame.txTimeNs)
  })

  it('reads the structure-and-message split, both figures and their sum', () => {
    const [structure, message] = figs(NUMS, /结构 ([\d.]+) µs，消息 ([\d.]+) µs/,
      'the row that splits the frame')
    const structNs = layout.filter((x) => x.key !== 'psdu').reduce((a, x) => a + x.durNs, 0)
    same(String(structure), structNs / US, 'the structure of the frame')
    same(String(message), seg('psdu').durNs / US, 'and its message')
    expect(structure! + message!, 'which together are the frame')
      .toBeCloseTo(poll.frame.txTimeNs / US, 3)
    // 「这一轮占用的两个 2 ms 时隙里，真正有帧在传的只有 385 µs」
    const [slots, slotMs, onAir] = figs(NUMS,
      /这一轮占用的两个 (\d+) ms 时隙里，真正有帧在传的只有 (\d+) µs/, 'the round’s own silence')
      .slice(0, 3)
    const round = ofType(recs(), 'UWB_ROUND')[0]!
    expect(slots, 'the slot length the round runs on').toBe(round.slotNs / MS)
    expect(round.slots, 'and the slots it has').toBe(2)
    expect(slotMs, 'the air both frames take, in whole microseconds')
      .toBe(Math.round((poll.frame.txTimeNs + resp.frame.txTimeNs) / US))
    expect(onAir, 'the third figure of that sentence is the same one read twice').toBe(undefined)
  })

  it('reads the RMARKER formula and the quiz that repeats it', () => {
    const f = uwbFrame.numbers!.find((b) => b.kind === 'formula') as { text: string }
    const [sync, sfd, total] = figs(f.text, /SYNC ([\d.]+) µs \+ SFD ([\d.]+) µs = 帧内 ([\d.]+) µs/,
      'the RMARKER formula')
    same(String(sync), seg('sync').durNs / US, 'the SYNC field')
    same(String(sfd), seg('sfd').durNs / US, 'the SFD')
    expect(sync! + sfd!, 'their sum, as the line adds them').toBeCloseTo(total!, 3)
    same(String(total), UWB_RMARKER_NS / US, 'and where the RMARKER falls')
    // `chipsToNs` rounds to the nanosecond; the constant keeps the fraction.
    expect(chipsToNs(UWB_RMARKER_CHIPS), 'which the engine computes from its chips')
      .toBe(Math.round(UWB_RMARKER_NS))
    // The quiz prints all three again.
    const [qSync, qSfd] = figs(QUIZ, /经过 ([\d.]+) µs 的 SYNC 与 ([\d.]+) µs 的 SFD/, 'the quiz’s own pair')
    expect([qSync, qSfd], 'the same two fields').toEqual([sync, sfd])
    same(raw(QUIZ, /比它早 ([\d.]+) µs/, 'the quiz on the offset')[0]!, UWB_RMARKER_NS / US,
      'the offset the quiz asks about')
    // The figure prints the SFD's duration a third time, in a box label.
    expect(JSON.stringify(uwbFrameFields()), 'the figure still carries the SFD’s own duration')
      .toContain(`SFD ${(seg('sfd').durNs / US).toFixed(3)} µs`)
  })

  it('reads the PSDU’s bit budget and the rate it goes out at', () => {
    const f = uwbFrame.numbers!.filter((b) => b.kind === 'formula')[1] as { text: string }
    const [data, parity, tail, symbols, chips] = figs(f.text,
      /(\d+) 个数据比特 \+ (\d+) 个校验比特 \+ (\d+) 个符号的尾 = (\d+) 个符号 × (\d+) 码片/,
      'the PSDU formula')
    expect(data, 'the data bits thirty octets hold').toBe(8 * poll.frame.bytes)
    expect(parity, 'the parity the engine adds').toBe(RS_PARITY_BITS)
    expect(tail, 'the tail symbols').toBe(TAIL_SYMBOLS)
    expect(symbols, 'the symbols they come to').toBe(psduSymbols(poll.frame.bytes))
    expect(chips, 'and a data symbol’s chips').toBe(DATA_SYMBOL_CHIPS)
    expect(chipsToNs(symbols! * chips!), 'which buy the PSDU its duration').toBe(seg('psdu').durNs)
    // 「为什么 30 个字节要花 37.179 µs」 — the heading of that formula.
    const [octets, us] = figs(NUMS, /为什么 (\d+) 个字节要花 ([\d.]+) µs/, 'the heading of the formula')
    expect(octets, 'the octets').toBe(poll.frame.bytes)
    same(String(us), seg('psdu').durNs / US, 'and the duration they take')
    // 「按 6.81 Mb/s 算，光是消息本身只要 35.2 µs」
    const [mbps, bare] = figs(NUMS, /按 ([\d.]+) Mb\/s 算，光是消息本身只要 ([\d.]+) µs/,
      'the rate and the bare message')
    expect(mbps, 'the rate the PSDU goes out at').toBe(UWB_MBPS)
    same(String(bare), (8 * poll.frame.bytes) / mbps! / 1000 * 1000, 'the message at that rate')
    expect(bare, 'which is less than the PSDU field itself takes').toBeLessThan(seg('psdu').durNs / US)
  })

  it('reads the poll-and-response table, and what differs between them', () => {
    const rows = tableOf(1).rows
    for (const [row, tx] of [[rows[0]!, poll], [rows[1]!, resp]] as const) {
      const [octets] = figs(row[1]!, /^(\d+) octets$/, `the octets of 「${row[0]}」`)
      expect(octets, `the octets of 「${row[0]}」`).toBe(tx.frame.bytes)
      const l = uwbPpduLayout(tx.frame)
      same(raw(row[2]!, /^([\d.]+) µs$/, `the PSDU of 「${row[0]}」`)[0]!,
        l.find((x) => x.key === 'psdu')!.durNs / US, `the PSDU of 「${row[0]}」`)
      same(raw(row[3]!, /^([\d.]+) µs$/, `the frame of 「${row[0]}」`)[0]!, tx.frame.txTimeNs / US,
        `the whole frame of 「${row[0]}」`)
    }
    expect(uwbRespBytes('ss'), 'the response’s own octet count').toBe(resp.frame.bytes)
    // `sources`: the response's octet count is this simulator's own choice, named as one.
    const [srcOctets] = figs(SRC, /与 (\d+) 字节的应答是本仿真器对/, '`sources` on the response')
    expect(srcOctets, 'the same octet count').toBe(resp.frame.bytes)
    const [srcSlot] = figs(SRC, /(\d+) ms 的测距时隙来自/, '`sources` on the slot')
    expect(srcSlot, 'the slot length').toBe(ofType(recs(), 'UWB_ROUND')[0]!.slotNs / MS)
  })

  it('reads the six steps: the counts, the gain, the jitter and the tick', () => {
    const [sync, sfd, gap] = figs(NUMS,
      /(\d+) 个 SYNC 前导符号[^]*?(\d+) 个 SFD 符号（symbol）、夹在两段 (\d+) 码片间隔中间的 STS/,
      'the steps on the frame’s own five segments')
    expect([sync, sfd], 'the two preamble fields’ symbol counts').toEqual([SYNC_SYMBOLS, SFD_SYMBOLS])
    expect(gap, 'the gap on each side of the STS').toBe(STS_GAP_CHIPS)
    expect(layout.filter((x) => x.key === 'stsGap').length, 'and there really are two of them').toBe(2)
    // 「同一个前导符号重复的那 64 遍——相比只用一个符号，这一步值 18.1 dB」
    const [reps, gainDb] = figs(NUMS, /重复的那 (\d+) 遍[^]*?这一步值 ([\d.]+) dB/, 'the steps on the gain')
    expect(reps, 'the repetitions the accumulation gets').toBe(SYNC_SYMBOLS)
    same(String(gainDb), UWB_TS_ACCUM_GAIN_DB, 'the gain they are worth')
    expect(Number((10 * Math.log10(reps!)).toFixed(1)), 'which is ten log ten of them')
      .toBe(val(String(gainDb)))
    // `limits` prints the same gain again, and the same two symbol counts.
    same(raw(LIM, /于是那 ([\d.]+) dB 的前导累积增益/, '`limits` on the gain')[0]!, UWB_TS_ACCUM_GAIN_DB,
      'the gain, in `limits`')
    const [limSync, limSts, limUnit, limMbps] = figs(LIM,
      /(\d+) 个 SYNC 前导符号、SFD #2、(\d+) × (\d+) 码片的 STS、([\d.]+) Mb\/s 的 PSDU/,
      '`limits` on the one PPDU shape')
    expect(limSync, 'the SYNC symbols').toBe(SYNC_SYMBOLS)
    expect(limSts! * limUnit!, 'the STS chips').toBe(STS_ACTIVE_CHIPS)
    expect(limMbps, 'and the PSDU’s rate').toBe(UWB_MBPS)
    // 「1σ 是 100 ps」 and 「一格是 15.650 ps」
    const [sigma, ps] = figs(NUMS, /(\d+)σ 是 (\d+) ps/, 'the steps on the jitter')
    expect(sigma, 'one standard deviation').toBe(1)
    expect(ps, 'the jitter this session quotes its stamps at')
      .toBe(uwbFrame.scenario().uwb!.tsNoisePs)
    same(raw(NUMS, /一格是 ([\d.]+) ps/, 'the steps on the tick')[0]!, RCTU_PS, 'one tick of the counter')
    expect(RCTU_NS * 1000, 'which is the same tick in nanoseconds').toBeCloseTo(RCTU_PS, 6)
  })

  it('reads the experiment’s four figures, one of which is a constant of nature', () => {
    const [ps, mPerNs] = figs(TRY, /再乘以 ([\d.]+) ps、乘以 ([\d.]+) m\/ns/, '`tryThis` on the two factors')
    same(String(ps), RCTU_PS, 'the tick the experiment multiplies by')
    expect(mPerNs, 'the speed of light, in metres a nanosecond').toBe(0.299792458)
    expect(mPerNs! * 1e9, 'which is the figure physics gives it, in metres a second').toBe(299_792_458)
    const [rctu, metres] = figs(TRY, /你应该得到 (\d+) RCTU 与 ([\d.]+) m/, '`tryThis` on the answer')
    // The round's own two stamps: the answer the reader is told they should get.
    same(String(metres), (rctu! * RCTU_PS * mPerNs!) / 1000, 'the distance those ticks come to')
    expect(rctu, 'and the ticks are a whole number of them').toBe(Math.round(rctu!))
    /*
     * **「测距行里的那个数」 is the range line's RAW figure.** That line prints three: the
     * corrected distance (4.95 m), the truth (5.00 m) and the raw time-of-flight converted
     * straight to metres (5.02 m) — and the hand computation the reader is walked through is
     * the third, because nothing in it corrects the clock.
     */
    const range = ofType(recs(), 'UWB_RANGE')[0]!
    expect(rctu, 'the ticks the round’s own record carries').toBe(range.tofRawRctu)
    same(String(metres), rctuToMetres(range.tofRawRctu!), 'the raw figure the range line prints')
    expect(range.distM, 'while the corrected distance it also prints is a different number')
      .not.toBe(rctuToMetres(range.tofRawRctu!))
  })

  it('reads `limits` and the variant label', () => {
    /*
     * **The three figures of `limits` are the engine's own constants** — the sweep of 2026-10-13
     * walked through all three, because what stood here were bounds (「bigger than the parity」,
     * 「below −80 dBm」, 「slower than the PSDU's rate」) and a bound admits its neighbour.
     */
    const [block] = figs(LIM, /每 (\d+) 比特一块的 RS 校验/, '`limits` on the RS block')
    expect(block, 'the block the parity is computed over').toBe(RS_BLOCK_BITS)
    const [floor] = figs(LIM, /只问到达电平有没有达到 −(\d+) dBm/, '`limits` on the receiver floor')
    expect(-floor!, 'the floor the engine checks every reception against').toBe(UWB_RX_SENS_DBM)
    /*
     * **The 850 kb/s is the nominal rate the PHR's own symbol length is defined at** — this
     * engine never carries a PSDU at it, but it is in the engine all the same, as the comment
     * beside `PHR_SYMBOL_CHIPS` records: that constant is Table 16-4/16-14's 850 kb/s figure.
     * So the sentence's 「850 kb/s 换更省的码片」 is read against the source that holds it.
     */
    const [other] = figs(LIM, /「([\d ]+) kb\/s 换更省的码片/, '`limits` on the rate it does not build')
    const PHY = readFileSync(new URL('../../src/uwb/phy.ts', import.meta.url), 'utf8')
    expect(figs(PHY, /PHR_SYMBOL_CHIPS = \d+ \/\/ standard Table [\d/-]+ \((\d+) kb\/s nominal\)/,
      'the rate `phy.ts` defines the PHR symbol at')[0], 'the rate the engine names').toBe(other)
    expect(other! / 1000, 'and this engine’s own PSDU does not run at it').not.toBe(UWB_MBPS)
    // The variant's label, which is reader-visible text with a figure in it.
    const [metres] = figs(uwbFrame.variants![0]!.label, /相距 (\d+) m/, 'the variant’s own label')
    const sc = uwbFrame.variants![0]!.scenario()
    const [a, b] = sc.nodes.filter((n) => n.uwb !== undefined)
    expect(Math.round(Math.hypot(a!.pos.x - b!.pos.x, a!.pos.y - b!.pos.y)),
      'the distance that variant really puts between them').toBe(metres)
  })
})
