/**
 * Every empirical claim in "Fragments, budgets and the 12 dB", the second half of the
 * old `uwb-mms`: the millisecond's energy budget, what a fragment costs of it, what a
 * train of them combines to, the three decibels between four fragments and eight, the
 * clock ratio a train measures, and the honest share of the 19.57 dB it beats a 4z poll
 * by. It loads exactly the scene `uwb-mms` loads — the same builder, the same three
 * variants — so the split costs the reader nothing and the recorded hashes of the two
 * ids are equal, which the kit's `sameSceneAs` check asserts here and the controller's
 * fixtures record once the lesson is registered.
 *
 * The scene itself — the hall, the anchors, the session, the round — is pinned next
 * door, in tests/course/uwb-mms.test.ts, which is where the builder lives. Everything
 * below is arithmetic, checked twice wherever it can be: once as a closed form from the
 * engine's own constants and once against the trains the devices actually reported.
 *
 * The lesson is not in COURSE_ORDER until the controller registers it, so the shared
 * readability suite does not see it yet; the word rules it would apply to the picture
 * and the numbers are asserted here in the meantime.
 */
import { describe, it, expect } from 'vitest'
import { uwbMmsNumbers } from '../../src/course/uwb/uwb-mms-numbers'
import { MMS_ANCHORS, TAG_POS, ANCHOR_Z, TAG_Z, uwbMms, uwbMmsScenario, type UwbMmsVariant } from '../../src/course/uwb/uwb-mms'
import { DEFAULT_UWB_SESSION } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block } from '../../src/course/lessonKit'
import {
  BUDGETS, CITATION, enWords, lessonBudget, lessonStrings, numericQuantities, paragraphTexts, zhChars,
} from '../../src/course/readability'
import { fmtRecord } from '../../src/ui/format'
import {
  C_M_PER_NS, RCTU_NS, UWB_NLOS_NS, UWB_PL_EXP, UWB_PPM_MAX, UWB_RX_SENS_DBM, UWB_TX_POWER_DBM,
  uwbPl0Db, uwbPollBytes, uwbPpduNs,
} from '../../src/uwb/phy'
import { WALL_LOSS_DB } from '../../src/engine/propagation'
import {
  MMS_SETS, UWB_MS_BUDGET_NJ, combineGainDb, mmsFragmentDbm, mmsSet, ratioSigma, rsfChips, rsfNs,
} from '../../src/uwb/mms'
import { NB_REPORT_BYTES, nbPpduNs } from '../../src/uwb/nb'
import { rangeSigmaM } from '../../src/uwb/position'
import { rctuToMetres } from '../../src/uwb/ranging'
import { roundPlan } from '../../src/uwb/session'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 1300 * MS
const BLOCKS = 7
const TAG = 'tag-1'
const ANCHORS = MMS_ANCHORS.map((a) => a.id)
/** Indices into the variant list, which is `uwb-mms`'s twice over. */
const V: Record<Exclude<UwbMmsVariant, 'base'>, number> = { four: 0, rsf1: 1, twr: 2, pairwise: 3 }

const recs = (v: UwbMmsVariant): TLRecord[] =>
  runOf(uwbMmsNumbers, v === 'base' ? undefined : V[v], RUN_NS)
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length

/** The trains this node made of its peers' fragments, in the order they were reported. */
const trainsAt = (v: UwbMmsVariant, node: string): Extract<TLRecord, { type: 'UWB_MMS_TRAIN' }>[] =>
  ofType(recs(v), 'UWB_MMS_TRAIN').filter((t) => t.node === node)
/** One train per peer, the first of the run — the numbers the tables quote. */
const firstTrains = (v: UwbMmsVariant): Extract<TLRecord, { type: 'UWB_MMS_TRAIN' }>[] =>
  ANCHORS.map((p) => trainsAt(v, TAG).find((t) => t.peer === p)!)

/** 3-D distance from an anchor to the tag, as the scene places them. */
const distTo = (a: { x: number; y: number }): number =>
  Math.hypot(a.x - TAG_POS.x, a.y - TAG_POS.y, ANCHOR_Z - TAG_Z)
/** The closed form the link-budget table is: a fragment's EIRP, free space on channel 9, two walls. */
const rxDbmOf = (fragNs: number, d: number): number =>
  mmsFragmentDbm(fragNs) - (uwbPl0Db(9) + 10 * UWB_PL_EXP * Math.log10(d) + 2 * WALL_LOSS_DB.brick)

/** Everything a learner reads of this lesson, joined — `deeper` and `sources` included. */
const prose = (): string => lessonStrings(uwbMmsNumbers).map((s) => s.en).join('\n')

/** The lesson's nth table of `numbers`: 0 the fragment, 1 the three trains, 2 the ratio, 3 the gain. */
const table = (n: number): Extract<Block, { kind: 'table' }> =>
  uwbMmsNumbers.numbers!.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[n]
const cell = (n: number, row: number, col: number): string => table(n).rows[row][col].en
const formulas = (): Extract<Block, { kind: 'formula' }>[] =>
  uwbMmsNumbers.numbers!.filter((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')
/** The procedure the lesson closes on: "The whole sum, symbol by symbol". */
/** The worked example under the procedure (table 4): line `row`, run on this scene. */
const worked = (row: number): string => cell(4, row, 1)
const steps = (): string[] => {
  const b = uwbMmsNumbers.numbers!
    .filter((x): x is Extract<Block, { kind: 'steps' }> => x.kind === 'steps')
  expect(b).toHaveLength(1)
  return b[0].items.map((i) => i.en)
}

// The contract every migrated lesson owes, plus the split rule: this lesson loads
// uwb-mms's own scene, so its recorded timeline hashes are uwb-mms's, value for value.
// The window is what `lessonBudget` reports below.
lessonShapeSuite(uwbMmsNumbers, { proseMax: 1200, sameSceneAs: 'uwb-mms', runNs: RUN_NS })

describe('uwb-mms-numbers · the second half of the split', () => {
  it('follows uwb-mms in module 15 and loads its scene, variant for variant', () => {
    expect(uwbMmsNumbers.id).toBe('uwb-mms-numbers')
    expect(uwbMmsNumbers.module).toBe(15)
    expect(uwbMmsNumbers.module).toBe(uwbMms.module)
    expect(uwbMmsNumbers.needs).toEqual(['uwb-mms'])
    expect(uwbMmsNumbers.terms!.map((t) => t.term)).toEqual(['combining gain', 'clock ratio', 'parameter set'])
    // the same builder, the same three arguments: no new scenario, so no new recorded run
    expect(uwbMmsNumbers.scenario()).toEqual(uwbMmsScenario('base'))
    expect(uwbMmsNumbers.variants!.map((v) => v.scenario()))
      .toEqual([uwbMmsScenario('four'), uwbMmsScenario('rsf1'), uwbMmsScenario('twr'), uwbMmsScenario('pairwise')])
    expect(uwbMmsNumbers.variants!.map((v) => v.label)).toEqual(uwbMms.variants!.map((v) => v.label))
    expect(uwbMmsNumbers.jumps).toHaveLength(4)
    expect(uwbMmsNumbers.observe).toHaveLength(2)
    expect(uwbMmsNumbers.tryThis).toHaveLength(2)
    expect(uwbMmsNumbers.quiz).toHaveLength(3)
    for (const q of uwbMmsNumbers.quiz) expect(q.options[q.answer]).toBeDefined()
  })

  it('obeys the word rules the shared suite will apply once it is registered', () => {
    // the amendment's budget line (BUDGETS in src/course/readability.ts), which this batch
    // reports as picture 563, numbers 548, practice 389, total 1500
    const b = lessonBudget(uwbMmsNumbers)
    expect(b.picture).toBeLessThanOrEqual(BUDGETS.picture)
    expect(b.numbers).toBeLessThanOrEqual(BUDGETS.numbers)
    expect(b.practice).toBeLessThanOrEqual(BUDGETS.practice)
    expect(b.total).toBeLessThanOrEqual(BUDGETS.totalMax)
    for (const s of [uwbMmsNumbers.why!, ...uwbMmsNumbers.outcomes!]) {
      expect(numericQuantities(s.en), s.en).toBe(0)
      expect(CITATION.test(s.en) || CITATION.test(s.zh), s.en).toBe(false)
    }
    for (const p of paragraphTexts(uwbMmsNumbers.picture!)) {
      expect(enWords(p.en), p.en).toBeLessThanOrEqual(90)
      expect(zhChars(p.zh), p.en).toBeLessThanOrEqual(170)
      expect(numericQuantities(p.en), p.en).toBeLessThanOrEqual(2)
      expect(numericQuantities(p.zh), p.en).toBeLessThanOrEqual(2)
      expect(CITATION.test(p.en) || CITATION.test(p.zh), p.en).toBe(false)
    }
    for (const p of paragraphTexts(uwbMmsNumbers.numbers!)) {
      expect(enWords(p.en), p.en).toBeLessThanOrEqual(90)
      expect(numericQuantities(p.en), p.en).toBeLessThanOrEqual(4)
      expect(numericQuantities(p.zh), p.en).toBeLessThanOrEqual(4)
      expect(CITATION.test(p.en) || CITATION.test(p.zh), p.en).toBe(false)
    }
    for (const s of [...uwbMmsNumbers.observe, ...uwbMmsNumbers.tryThis]) {
      expect(enWords(s.en), s.en).toBeLessThanOrEqual(60)
      expect(numericQuantities(s.en), s.en).toBeLessThanOrEqual(6)
      expect(numericQuantities(s.zh), s.en).toBeLessThanOrEqual(6)
    }
    // the picture never says "draft": the provenance is in `sources`, and nowhere else
    for (const b2 of uwbMmsNumbers.picture!) {
      const t = (b2 as Extract<Block, { kind?: 'p' }>).text
      expect(t.en, t.en.slice(0, 40)).not.toContain('draft')
      expect(t.zh, t.en.slice(0, 40)).not.toContain('草案')
    }
  })

  it('owns the regulation, the draft and the model in `sources`', () => {
    const src = uwbMmsNumbers.sources!.map((s) => s.en).join('\n')
    expect(src).toContain('−41.3 dBm/MHz mean EIRP averaged over a millisecond')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).toContain('P802.15.4ab')
    expect(src).toContain('D5.0')
    expect(src).toContain('The balloted draft may differ')
    for (const doc of ['15-22/0381r5', '15-23/0100r2', '15-23/0502r3', '15-22/0205r0']) {
      expect(src, doc).toContain(doc)
    }
    expect(src).toContain('§16.4.9')
    const zh = uwbMmsNumbers.sources!.map((s) => s.zh).join('\n')
    expect(zh).toContain('P802.15.4ab')
    expect(zh).toContain('D5.0')
    expect(zh).toContain('15-22/0205r0')
  })
})

describe('uwb-mms-numbers · what a millisecond buys', () => {
  it('"−41.3 dBm/MHz × 499.2 MHz = −14.3 dBm … 37 nJ"', () => {
    const dbm = -41.3 + 10 * Math.log10(499.2)
    expect(dbm.toFixed(1)).toBe('-14.3')
    // −14.3 dBm held for 1 ms: mW × ms = µJ, so 10^(−1.43) µJ = 37 nJ
    expect((10 ** (dbm / 10) * 1000).toFixed(0)).toBe(String(UWB_MS_BUDGET_NJ))
    expect(UWB_MS_BUDGET_NJ).toBe(37)
    // the line moved into the worked example under the procedure when the formula block that
    // held it became a duplicate of step 1 and of this row
    expect(worked(0)).toBe('−41.3 dBm/MHz × 499.2 MHz = −14.3 dBm → 37 nJ')
    expect(cell(0, 0, 1)).toBe('37 nJ')
  })

  it('"36 octets, 203.782 µs, 8.11 nJ" is what an ordinary poll spends of it', () => {
    expect(uwbPollBytes(ANCHORS.length)).toBe(36)
    expect(uwbPpduNs(uwbPollBytes(ANCHORS.length))).toBe(203_782)
    const nJ = 10 ** (UWB_TX_POWER_DBM / 10) * (uwbPpduNs(uwbPollBytes(ANCHORS.length)) / 1000)
    expect(nJ.toFixed(2)).toBe('8.11')
    expect(UWB_TX_POWER_DBM).toBe(-14)
    expect(cell(0, 1, 1)).toBe('36 octets, 203.782 µs, 8.11 nJ')
    // and the run's own 4z poll is that frame
    const poll = ofType(recs('twr'), 'TX_START').find((r) => r.frame.kind === 'uwbPoll')!
    expect(poll.frame.bytes).toBe(36)
    expect(poll.frame.txTimeNs).toBe(203_782)
    expect(uwbMmsNumbers.quiz[1].options[1].en).toContain('a transmitter that spends 8.11 nJ of its 37')
  })

  it('"40 × 4 × (128 + 2 × 64) = 40 960 chips, 82.051 µs, −3.46 dBm", and rsf-1’s shorter one', () => {
    expect(40 * 4 * (128 + 2 * 64)).toBe(40_960)
    expect(rsfChips(40, 64)).toBe(40_960)
    expect(rsfNs(40, 64)).toBe(82_051)
    expect(mmsFragmentDbm(rsfNs(40, 64)).toFixed(2)).toBe('-3.46')
    expect(cell(0, 2, 1)).toBe('40 × 4 × (128 + 2 × 64) = 40 960 chips, 82.051 µs, −3.46 dBm')
    // set rsf-1's shorter fragment, and the 1.20 dB it buys
    expect(mmsSet('rsf-1')).toEqual({ rsfs: 16, rifs: 0, nMsr: 40, gap: 33, stsLen: 64, gapMs: 1 })
    expect(rsfNs(MMS_SETS['rsf-1'].nMsr, MMS_SETS['rsf-1'].gap)).toBe(62_179)
    expect(mmsFragmentDbm(62_179).toFixed(2)).toBe('-2.25')
    expect((mmsFragmentDbm(62_179) - mmsFragmentDbm(82_051)).toFixed(2)).toBe('1.20')
    expect(cell(0, 3, 1)).toBe('62.179 µs, −2.25 dBm, +1.20 dB')
    // "Going deeper": the same set, and what it costs in slots
    expect(Object.keys(MMS_SETS)).toHaveLength(17)
    expect(prose()).toContain('one of the seventeen mandatory sets')
    const rsf1 = roundPlan(uwbMmsScenario('rsf1').uwb!, ANCHORS.length)
    expect(rsf1.slots).toBe(40)
    expect(rsf1.roundNs).toBe(20 * MS)
    expect(3 * rsf1.roundNs).toBe(60 * MS)
    // rsf-1 is a pair round, so the 14 ms it is measured against is the pairwise variant's
    expect(3 * roundPlan(uwbMmsScenario('pairwise').uwb!, ANCHORS.length).roundNs).toBe(42 * MS)
    expect(prose()).toContain('the ranging phase grows from 20 slots to 32 and a pair round from 14 ms to 20, so the three of them take 60 ms of the block instead of 42')
  })

  it('"−93 dBm" is what the receiver needs, and no fragment ever gets there alone', () => {
    expect(UWB_RX_SENS_DBM).toBe(-93)
    expect(cell(0, 4, 1)).toBe('−93 dBm')
    for (const t of trainsAt('base', TAG)) expect(t.rxDbm, t.peer).toBeLessThan(UWB_RX_SENS_DBM)
    expect(prose()).toContain('Every fragment in this room arrives under the threshold on its own, so the whole margin is the train’s doing')
  })
})

describe('uwb-mms-numbers · what a train adds up to', () => {
  const margins = (v: UwbMmsVariant): string[] =>
    firstTrains(v).map((t) => `${t.marginDb >= 0 ? '+' : ''}${t.marginDb.toFixed(2)}`)

  it('the gain column is 10·log10(X): 6.02, 9.03 and 12.04 dB', () => {
    expect([4, 8, 16].map((n) => combineGainDb(n).toFixed(2))).toEqual(['6.02', '9.03', '12.04'])
    expect([0, 1, 2].map((r) => cell(1, r, 2))).toEqual(['+6.02 dB', '+9.03 dB', '+12.04 dB'])
    expect([0, 1, 2].map((r) => cell(1, r, 0)))
      .toEqual(['4 × 82.051 µs', '8 × 82.051 µs', '16 × 62.179 µs'])
    expect([0, 1, 2].map((r) => cell(1, r, 4))).toEqual(['lost', 'detected', 'detected'])
    expect([0, 1, 2].map((r) => table(1).rows[r][4].zh)).toEqual(['丢失', '检出', '检出'])
    expect(table(1).head.map((h) => h.en)).toEqual(['Train', 'Per fragment', 'Gain', 'Margin', 'Verdict'])
    expect(formulas()[0].text.en).toBe('gain = 10·log10(X)      margin = rx + gain − (−93 dBm)')
  })

  it('X = 8: every fragment at −100.26 / −100.07 dBm, +1.77 / +1.96 dB of margin, every pair ranges', () => {
    expect(firstTrains('base').map((t) => t.rxDbm.toFixed(2))).toEqual(['-100.26', '-100.26', '-100.07'])
    expect(MMS_ANCHORS.map((a) => rxDbmOf(rsfNs(40, 64), distTo(a)).toFixed(2)))
      .toEqual(['-100.26', '-100.26', '-100.07'])
    expect(cell(1, 1, 1)).toBe('−100.26 / −100.07 dBm')
    expect(margins('base')).toEqual(['+1.77', '+1.77', '+1.96'])
    expect(cell(1, 1, 3)).toBe('+1.77 / +1.96 dB')
    for (const t of trainsAt('base', TAG)) {
      expect(t.heard, t.peer).toBe(8)
      expect(t.fragments, t.peer).toBe(8)
      expect(t.detected, t.peer).toBe(true)
      expect(t.gainDb, t.peer).toBeCloseTo(combineGainDb(8), 9)
      expect(t.marginDb, t.peer).toBeCloseTo(t.rxDbm + t.gainDb - UWB_RX_SENS_DBM, 9)
    }
    expect(ofType(recs('base'), 'UWB_RANGE').map((r) => r.node))
      .toEqual(Array.from({ length: BLOCKS * ANCHORS.length }, () => TAG))
    expect(ofType(recs('base'), 'UWB_TIMEOUT')).toEqual([])
  })

  it('X = 4: the same fragments, 3.01 dB less, and all 21 ranges gone', () => {
    expect(margins('four')).toEqual(['-1.24', '-1.24', '-1.05'])
    expect(cell(1, 0, 3)).toBe('−1.24 / −1.05 dB')
    expect(cell(1, 0, 1)).toBe('−100.26 / −100.07 dBm')
    // the ruling the scene was built for: every one of the three fails at X = 4 by a decibel
    // or more, and every one succeeds at X = 8 by a decibel or more
    for (const t of trainsAt('four', TAG)) {
      expect(t.heard, t.peer).toBe(4)
      expect(t.fragments, t.peer).toBe(4)
      expect(t.rxDbm.toFixed(2), t.peer)
        .toBe(firstTrains('base').find((b) => b.peer === t.peer)!.rxDbm.toFixed(2))
      expect(t.detected, t.peer).toBe(false)
      expect(t.marginDb, t.peer).toBeLessThanOrEqual(-1)
      expect(t.ratioPpm, t.peer).toBeNull()
    }
    for (const t of firstTrains('base')) expect(t.marginDb, t.peer).toBeGreaterThanOrEqual(1)
    // "a verdict that flips on 3.01 dB of arithmetic": exactly a halved train, nothing else
    for (const t of firstTrains('four')) {
      const eight = firstTrains('base').find((b) => b.peer === t.peer)!
      expect(eight.marginDb - t.marginDb, t.peer).toBeCloseTo(10 * Math.log10(2), 9)
    }
    expect((10 * Math.log10(2)).toFixed(2)).toBe('3.01')
    // both sides lose the other's train, so nobody reports and the tag times out instead
    for (const a of ANCHORS) expect(trainsAt('four', a).every((t) => !t.detected), a).toBe(true)
    expect(ofType(recs('four'), 'UWB_RANGE')).toEqual([])
    expect(ofType(recs('four'), 'UWB_POSITION')).toEqual([])
    const outs = ofType(recs('four'), 'UWB_TIMEOUT')
    expect(outs).toHaveLength(21)
    expect(outs).toHaveLength(BLOCKS * ANCHORS.length)
    expect(new Set(outs.map((o) => `${o.node} ${o.expected} ${o.slot} ${o.peer}`)))
      .toEqual(new Set(ANCHORS.map((a) => `${TAG} nbReport 24 ${a}`)))
    const en = prose()
    expect(en).toContain('a verdict that flips on 3.01 dB of arithmetic — costing the run all 21 of its ranges')
    expect(uwbMmsNumbers.tryThis[0].en).toContain('the sum now falls a decibel short')
  })

  it('"The same line, two trains": the verdict line, at eight fragments and at four', () => {
    expect(fmtRecord(trainsAt('base', 'anchor-1')[0]))
      .toBe('anchor-1 RSF train ← tag-1: 8/8 heard, -100.3 dBm + 9.0 dB = margin 1.8 dB → detected, ratio -39.997 ppm · responders: anchor-1, anchor-2, anchor-3')
    expect(fmtRecord(trainsAt('four', 'anchor-1')[0]))
      .toBe('anchor-1 RSF train ← tag-1: 4/4 heard, -100.3 dBm + 6.0 dB = margin -1.2 dB → lost')
    const deeper = (uwbMmsNumbers.deeper ?? []).map((b) => (b as Extract<Block, { kind?: 'p' }>).text)
    const both = deeper.find((t) => t.en.includes('8/8 heard'))!
    expect(both.en).toContain(fmtRecord(trainsAt('base', 'anchor-1')[0]))
    expect(both.en).toContain(fmtRecord(trainsAt('four', 'anchor-1')[0]))
    // the UWB log lines are language-neutral: the same string is what a ZH reader sees
    expect(both.zh).toContain(fmtRecord(trainsAt('base', 'anchor-1')[0]))
    expect(both.zh).toContain(fmtRecord(trainsAt('four', 'anchor-1')[0]))
    // "the second line has no ratio at all"
    expect(trainsAt('four', 'anchor-1')[0].ratioPpm).toBeNull()
    expect(uwbMmsNumbers.observe[0].en).toContain('once the margin is positive, the clock ratio, which the two ends report with opposite signs')
  })

  it('X = 16 on set rsf-1: −99.05 / −98.86 dBm per fragment, +5.99 / +6.18 dB', () => {
    expect(firstTrains('rsf1').map((t) => t.rxDbm.toFixed(2))).toEqual(['-99.05', '-99.05', '-98.86'])
    expect(margins('rsf1')).toEqual(['+5.99', '+5.99', '+6.18'])
    expect(MMS_ANCHORS.map((a) => rxDbmOf(rsfNs(40, 33), distTo(a)).toFixed(2)))
      .toEqual(['-99.05', '-99.05', '-98.86'])
    expect(cell(1, 2, 0)).toBe('16 × 62.179 µs')
    expect(cell(1, 2, 1)).toBe('−99.05 / −98.86 dBm')
    expect(cell(1, 2, 3)).toBe('+5.99 / +6.18 dB')
    for (const t of trainsAt('rsf1', TAG)) {
      expect(t.heard, t.peer).toBe(16)
      expect(t.detected, t.peer).toBe(true)
    }
    expect(ofType(recs('rsf1'), 'UWB_RANGE')).toHaveLength(BLOCKS * ANCHORS.length)
    expect(ofType(recs('rsf1'), 'UWB_TIMEOUT')).toEqual([])
    expect(prose()).toContain('takes the margin from +1.8 dB to +6.0')
  })
})

describe('uwb-mms-numbers · the ruler a millisecond long', () => {
  /** True ratio at the tag: its own ppm minus the peer's. */
  const trueRatio = (peer: string): number =>
    TAG_POS.ppm - MMS_ANCHORS.find((a) => a.id === peer)!.ppm
  const sigmaPpm = (): number => ratioSigma(DEFAULT_UWB_SESSION.tsNoisePs, 7) * 1e6

  it('"σ_ratio = 0.0202 ppm" over the train’s 7 ms', () => {
    expect(sigmaPpm().toFixed(4)).toBe('0.0202')
    expect(DEFAULT_UWB_SESSION.tsNoisePs).toBe(100)
    expect(formulas()[1].text.en)
      .toBe('ratio = span_measured / ((j − i) × 1 ms)      σ_ratio = √2 · σ_ts / ((j − i) ms)')
    expect(prose()).toContain('100 ps stamps give σ_ratio = 0.0202 ppm')
    // "Going deeper": the same two stamps across one 82 µs fragment would be about 1.7 ppm
    const overOneFragment = ratioSigma(DEFAULT_UWB_SESSION.tsNoisePs, rsfNs(40, 64) / MS) * 1e6
    expect(overOneFragment.toFixed(1)).toBe('1.7')
    expect(overOneFragment).toBeGreaterThan(Math.abs(trueRatio('anchor-3')) / 10)
    expect(prose()).toContain('would give about 1.7 ppm')
  })

  it('"round 0 measures 39.985, 19.996, 9.984 ppm" against a true 40, 20 and 10', () => {
    expect(ANCHORS.map(trueRatio)).toEqual([40, 20, 10])
    expect(firstTrains('base').map((t) => t.ratioPpm!.toFixed(3)))
      .toEqual(['39.985', '19.996', '9.984'])
    expect(cell(2, 0, 0)).toBe('Round 0 measures, against a true 40 / 20 / 10 ppm')
    expect(cell(2, 0, 1)).toBe('39.985, 19.996, 9.984 ppm')
    for (const t of trainsAt('base', TAG)) {
      expect(Math.abs(t.ratioPpm! - trueRatio(t.peer)), t.peer).toBeLessThan(4 * sigmaPpm())
    }
    // "the two ends report with opposite signs"
    const atAnchor = trainsAt('base', 'anchor-1')[0]
    expect(atAnchor.ratioPpm!.toFixed(3)).toBe('-39.997')
    expect(Math.sign(atAnchor.ratioPpm!)).toBe(-Math.sign(firstTrains('base')[0].ratioPpm!))
  })

  it('the correction table: 3.00 m, 1.5 m, 1.5 cm, 1.5 mm, over a 2.10 cm floor', () => {
    // the reply is one slot, 0.5 ms, and the raw range minus the corrected one is
    // ½ · T_reply · 40 ppm · c = 3.00 m
    const reply = ofType(recs('base'), 'TX_START')
      .map((r) => r.frame.uwb?.nb?.replyRctu).find((x) => x !== undefined)!
    expect((reply * RCTU_NS / MS).toFixed(3)).toBe('0.500')
    const halfReplyS = 0.5 * 0.5e-3
    const cMs = C_M_PER_NS * 1e9
    const closed = halfReplyS * 40e-6 * cMs
    expect(closed.toFixed(2)).toBe('3.00')
    expect(cell(2, 1, 1)).toBe('3.00 m')
    const gaps = ofType(recs('base'), 'UWB_RANGE').filter((r) => r.peer === 'anchor-1')
      .map((r) => rctuToMetres(r.tofRawRctu!) - r.distM)
    expect(mean(gaps)).toBeCloseTo(closed, 2)
    // one crystal at the §16.4.9 limit, the carrier estimate, and the train's own residual
    expect((halfReplyS * UWB_PPM_MAX * 1e-6 * cMs).toFixed(1)).toBe('1.5')
    expect(UWB_PPM_MAX).toBe(20)
    expect(cell(2, 2, 1)).toBe('1.5 m')
    expect((halfReplyS * DEFAULT_UWB_SESSION.cfoNoisePpm * 1e-6 * cMs * 100).toFixed(1)).toBe('1.5')
    expect(DEFAULT_UWB_SESSION.cfoNoisePpm).toBe(0.2)
    expect(cell(2, 3, 1)).toBe('1.5 cm')
    expect((halfReplyS * sigmaPpm() * 1e-6 * cMs * 1000).toFixed(1)).toBe('1.5')
    expect(cell(2, 4, 1)).toBe('1.5 mm')
    // the floor underneath: two receive stamps are 2.1 cm, and 21 ranges scatter by 2.10 cm — the
    // train combines to 19.8-20.0 dB, a shade under the 20 dB the timestamp noise is quoted at
    expect((rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs) * 100).toFixed(1)).toBe('2.1')
    const biasM = 2 * UWB_NLOS_NS.brick * C_M_PER_NS
    const errs = ofType(recs('base'), 'UWB_RANGE').map((r) => r.distM - r.trueDistM - biasM)
    expect(errs).toHaveLength(BLOCKS * ANCHORS.length)
    expect(errs).toHaveLength(21)
    const rms = Math.sqrt(mean(errs.map((e) => e * e)))
    expect((rms * 100).toFixed(2)).toBe('2.10')
    // the cell is a bare value and its label carries the count, so the one string the table
    // renders to both readers is language-neutral in fact and not only in type
    expect(cell(2, 5, 0)).toBe('The noise floor under all of them, over 21 ranges')
    expect(cell(2, 5, 1)).toBe('2.10 cm')
    // the 1.5 mm is invisible under it: adding it in quadrature moves nothing a reader sees
    const floor = rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs)
    expect(rms).toBeLessThan(1.2 * floor)
    expect((Math.hypot(floor, 0.0015) * 100).toFixed(1)).toBe((floor * 100).toFixed(1))
    expect(prose()).toContain('two receive stamps alone are worth 2.1 cm, so the train’s millimetre of clock leftover is invisible')
  })

  it('observe 2: the range line prints the corrected range and the raw one', () => {
    const first = ofType(recs('base'), 'UWB_RANGE')[0]
    expect(fmtRecord(first)).toBe('tag-1 range → anchor-1 (SS): 14.26 m (true 13.04 m, raw 17.25 m)')
    // the first report of a one-to-many round lands in slot 40, at 20 ms
    expect(first.t).toBe(20 * MS + nbPpduNs(NB_REPORT_BYTES) + 44)
    expect(rctuToMetres(first.tofRawRctu!) - first.distM).toBeGreaterThan(2.9)
    expect(uwbMmsNumbers.observe[1].en).toContain('the raw range it would have been if the clock ratio had never been measured')
  })
})

describe('uwb-mms-numbers · being honest about the gain', () => {
  it('19.57 dB over a 4z poll, and only 9.03 of it is the train', () => {
    const d = distTo(MMS_ANCHORS[0])
    const pathDb = uwbPl0Db(9) + 10 * UWB_PL_EXP * Math.log10(d) + 2 * WALL_LOSS_DB.brick
    const poll = UWB_TX_POWER_DBM - pathDb
    expect(poll.toFixed(2)).toBe('-110.80')
    const train = firstTrains('base')[0].rxDbm + firstTrains('base')[0].gainDb
    expect(train.toFixed(2)).toBe('-91.23')
    expect((train - poll).toFixed(2)).toBe('19.57')
    expect(cell(3, 3, 1)).toBe('−110.80 dBm, −91.23 dBm')
    // the split: the train, the shorter fragment, and the budget the 4z transmitter never spends
    const pollNs = uwbPpduNs(uwbPollBytes(ANCHORS.length))
    const burstDb = 10 * Math.log10(UWB_MS_BUDGET_NJ / (10 ** (UWB_TX_POWER_DBM / 10) * (pollNs / 1000)))
    const shorterDb = mmsFragmentDbm(rsfNs(40, 64)) - mmsFragmentDbm(pollNs)
    expect(combineGainDb(8).toFixed(2)).toBe('9.03')
    expect(shorterDb.toFixed(2)).toBe('3.95')
    expect(burstDb.toFixed(2)).toBe('6.59')
    expect(burstDb + shorterDb + combineGainDb(8)).toBeCloseTo(train - poll, 6)
    expect([cell(3, 0, 1), cell(3, 1, 1), cell(3, 2, 1)]).toEqual(['9.03 dB', '3.95 dB', '6.59 dB'])
    // "together 10.54 dB, and an older burst-mode radio could hold −7.41 dBm and be as legal"
    expect((burstDb + shorterDb).toFixed(2)).toBe('10.54')
    expect(mmsFragmentDbm(pollNs).toFixed(2)).toBe('-7.41')
    const en = prose()
    expect(en).toContain('together 10.54 dB, and an older burst-mode radio could hold −7.41 dBm and be as legal')
    expect(en).toContain('The honest claim is the 9.03 dB')
    expect(uwbMmsNumbers.quiz[1].options[1].en).toContain('9.03 dB; the other 10.54 is transmit power')
  })

  it('"Going deeper": the ordinary radio fails completely, at −110.80 dBm and 42 timeouts', () => {
    const rs = recs('twr')
    expect(ofType(rs, 'UWB_RANGE')).toEqual([])
    const outs = ofType(rs, 'UWB_TIMEOUT')
    expect(outs).toHaveLength(42)
    const byKind: Record<string, number> = {}
    for (const o of outs) byKind[o.expected] = (byKind[o.expected] ?? 0) + 1
    expect(byKind).toEqual({ uwbPoll: BLOCKS * ANCHORS.length, uwbResp: BLOCKS * ANCHORS.length })
    // "nearly eighteen decibels under the receiver"
    const d = distTo(MMS_ANCHORS[0])
    const poll = UWB_TX_POWER_DBM - (uwbPl0Db(9) + 10 * UWB_PL_EXP * Math.log10(d) + 2 * WALL_LOSS_DB.brick)
    expect((UWB_RX_SENS_DBM - poll).toFixed(1)).toBe('17.8')
    expect(prose()).toContain('there is not one range in 1.3 seconds: 42 timeouts')
    expect(prose()).toContain('nearly eighteen decibels under the receiver')
    expect(RUN_NS / MS / 1000).toBe(1.3)
  })
})

/**
 * The six lines of arithmetic the lesson closes on, each against the function that does it in
 * the engine. Every symbol the steps name — E, t, P, rx, G, S — is checked here at the size the
 * step gives it, and the last step is run twice over, at X = 8 and at X = 4, because the whole
 * lesson is the verdict flipping between them.
 */
describe('uwb-mms-numbers · the whole sum, symbol by symbol', () => {
  const fragNs = rsfNs(40, 64)
  const d = distTo(MMS_ANCHORS[0])
  const loss = uwbPl0Db(9) + 10 * UWB_PL_EXP * Math.log10(d) + 2 * WALL_LOSS_DB.brick

  it('step 1 — E: −41.3 dBm/MHz over 499.2 MHz is −14.3 dBm, and 1 ms of it is 37 nJ', () => {
    expect(steps()[0]).toContain('The cap is a mean power per megahertz')
    expect(steps()[0]).toContain('multiply it by the channel’s width and hold it for one millisecond')
    expect(worked(0)).toBe('−41.3 dBm/MHz × 499.2 MHz = −14.3 dBm → 37 nJ')
    expect((-41.3 + 10 * Math.log10(499.2)).toFixed(1)).toBe('-14.3')
    expect(UWB_MS_BUDGET_NJ).toBe(37)
  })

  it('step 2 — t: 40 × 4 × (128 + 2 × 64) = 40 960 chips, 82.051 µs', () => {
    expect(steps()[1]).toContain('the spreading factor times the sequence length plus its two gaps')
    expect(steps()[1]).toContain('repeat that symbol as many times as the parameter set says and divide by the chip rate')
    expect(worked(1)).toBe('40 × 4 × (128 + 2 × 64) = 40 960 chips → 82.051 µs')
    expect(rsfChips(40, 64)).toBe(40_960)
    expect(fragNs).toBe(82_051)
    expect(MMS_SETS['rsf-1'].nMsr).toBe(40)
  })

  it('step 3 — P: the whole of E inside t is −3.46 dBm', () => {
    expect(steps()[2]).toContain('spends all of E inside t, so P = 10·log10(E / t)')
    expect(steps()[2]).toContain('the shorter the fragment, the louder it is')
    expect(worked(2)).toBe('10·log10(37 / 82.051) = −3.46 dBm')
    expect(mmsFragmentDbm(fragNs).toFixed(2)).toBe('-3.46')
  })

  it('step 4 — rx: 96.80 dB of room leaves −100.26 dBm at the far anchor', () => {
    expect(steps()[3]).toContain('the loss at one metre, the distance term at the engine’s own path-loss exponent')
    expect(steps()[3]).toContain('a fixed charge for each wall the ray crosses')
    expect(worked(3)).toBe('−3.46 − (50.50 + 22.30 + 24) = −100.26 dBm')
    expect(uwbPl0Db(9).toFixed(2)).toBe('50.50')
    expect(d.toFixed(2)).toBe('13.04')
    // the UWB engine's own exponent, which is free space — not the 3 the Wi-Fi indoor law uses
    expect(UWB_PL_EXP).toBe(2)
    expect((10 * UWB_PL_EXP * Math.log10(d)).toFixed(2)).toBe('22.30')
    expect(WALL_LOSS_DB.brick).toBe(12)
    expect(loss.toFixed(2)).toBe('96.80')
    expect(rxDbmOf(fragNs, d).toFixed(2)).toBe('-100.26')
    expect(firstTrains('base')[0].rxDbm.toFixed(2)).toBe('-100.26')
  })

  it('step 5 — G: 10·log10(X) is 9.03 dB at eight fragments and 6.02 at four', () => {
    expect(steps()[4]).toContain('equal things added give G = 10·log10(X)')
    expect(worked(4)).toBe('+9.03 dB · +6.02 dB')
    expect(combineGainDb(8).toFixed(2)).toBe('9.03')
    expect(combineGainDb(4).toFixed(2)).toBe('6.02')
    expect(firstTrains('base')[0].heard).toBe(8)
    expect(firstTrains('four')[0].heard).toBe(4)
  })

  it('step 6 — the margin: +1.77 dB at eight fragments, −1.24 at four, and the verdict flips', () => {
    expect(steps()[5]).toContain('Take the receiver’s sensitivity S off the sum: margin = rx + G − S')
    expect(steps()[5]).toContain('Zero or more is a detection; below zero the train is lost')
    expect(worked(5)).toBe('+1.77 dB · −1.24 dB')
    expect(UWB_RX_SENS_DBM).toBe(-93)
    const margin = (heard: number): string =>
      (rxDbmOf(fragNs, d) + combineGainDb(heard) - UWB_RX_SENS_DBM).toFixed(2)
    expect(margin(8)).toBe('1.77')
    expect(margin(4)).toBe('-1.24')
    // and the run agrees with the closed form on both sides of the threshold
    expect(firstTrains('base').every((t) => t.detected)).toBe(true)
    expect(ofType(recs('four'), 'UWB_MMS_TRAIN').every((t) => !t.detected)).toBe(true)
    // the steps say the same thing the three-train table does, row for row
    expect(cell(1, 0, 2)).toBe('+6.02 dB')
    expect(cell(1, 1, 2)).toBe('+9.03 dB')
  })
})
