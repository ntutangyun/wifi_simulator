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
import { uwbFrame } from '../../src/course/uwb/uwb-frame'
import { uwbIntroScenario } from '../../src/course/uwb/uwb-intro'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { isMigrated, type L10n } from '../../src/course/lessonKit'
import { lessonBlocks, lessonMinutes, lessonWords } from '../../src/course/curriculum'
import { lessonStrings } from '../../src/course/readability'
import { ACK_TX_TIME_6M_NS } from '../../src/engine/phy'
import { uwbPpduLayout } from '../../src/uwb/frameFields'
import {
  DATA_SYMBOL_CHIPS, PHR_SYMBOLS, PHR_SYMBOL_CHIPS, PSYM_CHIPS, RS_PARITY_BITS, SFD_SYMBOLS,
  STS_ACTIVE_CHIPS, STS_GAP_CHIPS, SYNC_SYMBOLS, TAIL_SYMBOLS, UWB_RMARKER_CHIPS,
  chipsToNs, psduSymbols, uwbPollBytes, uwbPpduNs, uwbRespBytes,
} from '../../src/uwb/phy'
import { UWB_MBPS } from '../../src/uwb/frames'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 30 * MS

const memo = new Map<string, TLRecord[]>()
/** Records of the base scenario (variant undefined) or a variant, memoised. */
function recs(variant?: number): TLRecord[] {
  const key = String(variant ?? 'base')
  if (!memo.has(key)) {
    const s: Scenario = variant === undefined ? uwbFrame.scenario() : uwbFrame.variants![variant].scenario()
    memo.set(key, [...new Simulation(s).runUntil(RUN_NS).records])
  }
  return memo.get(key)!
}
const ofType = <K extends TLRecord['type']>(rs: TLRecord[], type: K) =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type)
const txs = (rs: TLRecord[], kind: string) => ofType(rs, 'TX_START').filter((r) => r.frame.kind === kind)

describe('uwb-frame · lesson shape', () => {
  it('is written to the zero-to-hero contract', () => {
    expect(isMigrated(uwbFrame)).toBe(true)
    expect(uwbFrame.module).toBe(11)
    expect(uwbFrame.needs).toEqual(['uwb-intro'])
    // the second lesson of the track may use a table in the picture, and gets up to six new words.
    // `chip` is one of them: it is the unit every duration in this lesson is counted in, and
    // uwb-intro cannot hold it (a track's first lesson is capped at four terms).
    expect(uwbFrame.terms!.map((t) => t.term)).toEqual(['SYNC', 'SFD', 'STS', 'PHR', 'PSDU', 'chip'])
    // the reader is sent to the simulator before the mechanism is finished
    const firstWatch = uwbFrame.picture!.findIndex((b) => b.kind === 'watch')
    expect(firstWatch).toBeGreaterThanOrEqual(0)
    expect(firstWatch).toBeLessThan(3)
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

  it('fits one sitting: the spec’s bounds, plus the split’s prose window', () => {
    // The spec's bounds: 500–1300 main-path words, at most 20 minutes
    // (…/2026-09-21-course-readability-design.md, "Length and pace"). The three
    // section budgets that sum to it are asserted for every migrated lesson in
    // tests/course/readability.test.ts, and printed by
    // `npx tsx scripts/lesson-dump.ts uwb-frame en`.
    expect(lessonWords(uwbFrame)).toBeGreaterThanOrEqual(500)
    expect(lessonWords(uwbFrame)).toBeLessThanOrEqual(1300)
    expect(lessonMinutes(uwbFrame)).toBeLessThanOrEqual(20)
    // the content contract's window is for the PROSE count: what the reader reads
    // before the simulator — why, outcomes, terms, picture and numbers.
    const prose = lessonWords({ ...uwbFrame, observe: [], tryThis: [], quiz: [] })
    expect(prose).toBeLessThanOrEqual(1000)
    expect(lessonBlocks(uwbFrame).length).toBe(uwbFrame.picture!.length + uwbFrame.numbers!.length)
  })

  it('every jump target occurs in the base run', () => {
    const rs = recs()
    for (const j of uwbFrame.jumps) expect(rs.some(j.find), j.label.en).toBe(true)
    for (const b of uwbFrame.picture!) {
      if (b.kind === 'watch' && b.jump !== undefined) expect(uwbFrame.jumps[b.jump]).toBeDefined()
    }
  })

  it('every string a learner reads exists in both languages', () => {
    // One walk for every lesson test: src/course/readability.ts. `title`, the variant
    // labels and the jump labels are the chrome around a lesson, so they are added here.
    const seen: L10n[] = [
      ...lessonStrings(uwbFrame), uwbFrame.title,
      ...uwbFrame.variants!.map((v) => v.label), ...uwbFrame.jumps.map((j) => j.label),
    ]
    // a structural floor rather than a smoke bound: one string per outcome, term, block,
    // source, observation, experiment and (question + options + explanation) of a quiz,
    // plus why, the title, every variant label and every jump label.
    const floor = 2 + uwbFrame.outcomes!.length + uwbFrame.terms!.length + uwbFrame.picture!.length
      + uwbFrame.numbers!.length + (uwbFrame.deeper?.length ?? 0) + uwbFrame.sources!.length
      + uwbFrame.observe.length + uwbFrame.tryThis.length + 3 * uwbFrame.quiz.length
      + uwbFrame.variants!.length + uwbFrame.jumps.length
    expect(seen.length).toBeGreaterThanOrEqual(floor)
    for (const l of seen) {
      expect(l.en.trim().length, l.en).toBeGreaterThan(0)
      expect(l.zh.trim().length, l.en).toBeGreaterThan(0)
      if (/[a-z]{3,}\s+[a-z]{3,}/.test(l.en)) expect(l.zh, l.en).not.toBe(l.en)
    }
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
    // the steps block "The frame in order": "SYNC, the long known pattern" / "SFD, the short
    //  marker that ends it" / "the RMARKER: the first chip after the SFD" / "the STS, between two
    //  short gaps" / "the PHR" / "the PSDU". (An earlier wording, "everything after it is the
    //  message", was false of this layout.)
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
