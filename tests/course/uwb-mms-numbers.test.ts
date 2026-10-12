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
import { LESSONS } from '../../src/course/lessons'
import { MMS_ANCHORS, TAG_POS, ANCHOR_Z, TAG_Z, uwbMms, uwbMmsScenario, type UwbMmsVariant } from '../../src/course/uwb/uwb-mms'
import { DEFAULT_UWB_SESSION } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block } from '../../src/course/lessonKit'
import { lessonTexts, paragraphTexts } from '../../src/course/readability'
import { fmtRecord } from '../../src/ui/format'
import {
  C_M_PER_NS, RCTU_NS, STS_ACTIVE_CHIPS, STS_GAP_CHIPS, UWB_NLOS_NS, UWB_PL_EXP, UWB_PPM_MAX,
  UWB_RX_SENS_DBM, UWB_TX_POWER_DBM, uwbPl0Db, uwbPollBytes, uwbPpduNs,
} from '../../src/uwb/phy'
import { chipsToNs } from '../../src/uwb/units'
import { WALL_LOSS_DB } from '../../src/engine/propagation'
import {
  MMS_DRAFT_DEFAULTS, MMS_SETS, UWB_MS_BUDGET_NJ, combineGainDb,
  mmsFragmentDbm, mmsSet, ratioSigma, rsfChips, rsfNs,
} from '../../src/uwb/mms'
import { NB_REPORT_BYTES, nbPpduNs } from '../../src/uwb/nb'
import { rangeSigmaM } from '../../src/uwb/position'
import { rctuToMetres } from '../../src/uwb/ranging'
import { roundPlan } from '../../src/uwb/session'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'

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

/** The lesson's nth table of `numbers`: 0 the fragment, 1 the three trains, 2 the ratio, 3 the gain. */
const table = (n: number): Extract<Block, { kind: 'table' }> =>
  uwbMmsNumbers.numbers!.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[n]
const cell = (n: number, row: number, col: number): string => table(n).rows[row][col]
/** The worked example under the procedure (table 4): line `row`, run on this scene. */
const worked = (row: number): string => cell(4, row, 1)
const steps = (): string[] => {
  const b = uwbMmsNumbers.numbers!
    .filter((x): x is Extract<Block, { kind: 'steps' }> => x.kind === 'steps')
  expect(b).toHaveLength(1)
  return b[0].items.map((i) => i)
}

// The contract every migrated lesson owes, plus the split rule: this lesson loads
// uwb-mms's own scene, so its recorded timeline hashes are uwb-mms's, value for value.
lessonShapeSuite(uwbMmsNumbers, { sameSceneAs: 'uwb-mms', runNs: RUN_NS })

describe('uwb-mms-numbers · the second half of the split', () => {
  it('follows uwb-mms in module 15 and loads its scene, variant for variant', () => {
    expect(uwbMmsNumbers.id).toBe('uwb-mms-numbers')
    expect(MODULES[uwbMmsNumbers.module].title).toBe('多毫秒片段')
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

  /**
   * **突发 is live on both tracks, and it means opposite shapes on each.**
   *
   * On the Wi-Fi track a 突发 is a TXOP burst: several frames sent back to back, which is read
   * out of `@txop-protect`'s own title below rather than asserted from memory. Here it is the
   * other shape entirely — ONE transmission with a millisecond's energy squeezed into a short
   * time, which is why its power goes UP. A reader who came down the Wi-Fi track first meets
   * the word in this lesson's very first `picture` block, before 片段 has been used for the
   * thing, and reads 「把它倒进一小段突发里」 as a string of frames — the opposite of the point.
   *
   * Nothing in the wording nets reaches this: 突发 is not a `ZH_TERMS` entry, so no bracket
   * rule applies, and the cross-track collision is not a property any per-lesson rule can see.
   * The qualification uses only words already in this lesson (片段 is glossed in `why`) and in
   * that same sentence (帧, from 一帧长帧).
   */
  it('qualifies 突发 where a reader first meets it, against the Wi-Fi track that owns the word', () => {
    const wifiBurst = LESSONS.find((l) => l.id === 'txop-protect')!
    expect(wifiBurst.title, 'the Wi-Fi track still carries the same word for frames in a row')
      .toContain('突发')
    const first = uwbMmsNumbers.picture![0]
    expect('text' in first && first.text, 'the first block the reader reads').toBeTruthy()
    const text = ('text' in first ? first.text : '') as string
    expect(text, 'this is the block that introduces the word').toContain('突发')
    expect(text, 'and it says which shape of 突发 this is — one short fragment')
      .toContain('短片段')
    expect(text, 'and which one it is not — the Wi-Fi track\'s string of frames')
      .toContain('不是一串帧')
  })

  it('cites every document its numbers come from, by identifier', () => {
    // Provenance is data, not prose: the standard, the draft revision and the
    // contribution numbers the lesson's figures are taken from.
    const src = uwbMmsNumbers.sources!.join('\n')
    for (const doc of [
      'IEEE Std 802.15.4-2024', 'P802.15.4ab', '草案', '§16.4.9',
      '15-22/0381r5', '15-23/0100r2', '15-23/0502r3', '15-22/0205r0',
    ]) {
      expect(src, doc).toContain(doc)
    }
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
  })

  it('"40 × 4 × (128 + 2 × 64) = 40 960 chips, 82.051 µs, −3.46 dBm", and rsf-1’s shorter one', () => {
    expect(40 * 4 * (128 + 2 * 64)).toBe(40_960)
    expect(rsfChips(40, 64)).toBe(40_960)
    expect(rsfNs(40, 64)).toBe(82_051)
    expect(mmsFragmentDbm(rsfNs(40, 64)).toFixed(2)).toBe('-3.46')
    expect(cell(0, 2, 1)).toBe('40 × 4 × (128 + 2 × 64) = 40 960 chips, 82.051 µs, −3.46 dBm')
    // set rsf-1's shorter fragment, and the 1.20 dB it buys
    expect(mmsSet('rsf-1'))
      .toEqual({ rsfs: 16, rifs: 0, nMsr: 40, gap: 33, stsLen: 64, gapMs: 1, ...MMS_DRAFT_DEFAULTS })
    expect(rsfNs(MMS_SETS['rsf-1'].nMsr, MMS_SETS['rsf-1'].gap)).toBe(62_179)
    expect(mmsFragmentDbm(62_179).toFixed(2)).toBe('-2.25')
    expect((mmsFragmentDbm(62_179) - mmsFragmentDbm(82_051)).toFixed(2)).toBe('1.20')
    expect(cell(0, 3, 1)).toBe('62.179 µs, −2.25 dBm, +1.20 dB')
    // "Going deeper": the same set, and what it costs in slots
    expect(Object.keys(MMS_SETS)).toHaveLength(17)
    const rsf1 = roundPlan(uwbMmsScenario('rsf1').uwb!, ANCHORS.length)
    expect(rsf1.slots).toBe(40)
    expect(rsf1.roundNs).toBe(20 * MS)
    expect(3 * rsf1.roundNs).toBe(60 * MS)
    // rsf-1 is a pair round, so the 14 ms it is measured against is the pairwise variant's
    expect(3 * roundPlan(uwbMmsScenario('pairwise').uwb!, ANCHORS.length).roundNs).toBe(42 * MS)
    // M12: the scene's own train is NOT one of the seventeen — the ranging cycle's defaults
    const own = uwbMmsScenario('base').uwb!.mms
    expect([own.rsfs, own.rifs, own.nMsr, own.gap]).toEqual([8, 0, 40, 64])
    expect(Object.values(MMS_SETS).some((m) =>
      m.rsfs === own.rsfs && m.rifs === own.rifs && m.nMsr === own.nMsr && m.gap === own.gap)).toBe(false)
  })

  it('"−93 dBm" is what the receiver needs, and no fragment ever gets there alone', () => {
    expect(UWB_RX_SENS_DBM).toBe(-93)
    expect(cell(0, 4, 1)).toBe('−93 dBm')
    for (const t of trainsAt('base', TAG)) expect(t.rxDbm, t.peer).toBeLessThan(UWB_RX_SENS_DBM)
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
  })

  it('"The same line, two trains": the verdict line, at eight fragments and at four', () => {
    expect(fmtRecord(trainsAt('base', 'anchor-1')[0]))
      .toBe('anchor-1 RSF train ← tag-1: 8/8 heard, -100.3 dBm + 9.0 dB = margin 1.8 dB → detected, ratio -39.997 ppm · responders: anchor-1, anchor-2, anchor-3')
    expect(fmtRecord(trainsAt('four', 'anchor-1')[0]))
      .toBe('anchor-1 RSF train ← tag-1: 4/4 heard, -100.3 dBm + 6.0 dB = margin -1.2 dB → lost')
    const deeper = (uwbMmsNumbers.deeper ?? []).map((b) => (b as Extract<Block, { kind?: 'p' }>).text)
    const both = deeper.find((t) => t.includes('8/8 heard'))!
    expect(both).toContain(fmtRecord(trainsAt('base', 'anchor-1')[0]))
    expect(both).toContain(fmtRecord(trainsAt('four', 'anchor-1')[0]))
    // the UWB log lines are still English, so this is the string the reader sees too
    expect(both).toContain(fmtRecord(trainsAt('base', 'anchor-1')[0]))
    expect(both).toContain(fmtRecord(trainsAt('four', 'anchor-1')[0]))
    // "the second line has no ratio at all"
    expect(trainsAt('four', 'anchor-1')[0].ratioPpm).toBeNull()
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
  })
})

describe('uwb-mms-numbers · the ruler fourteen milliseconds long', () => {
  /** True ratio at the tag: its own ppm minus the peer's. */
  const trueRatio = (peer: string): number =>
    TAG_POS.ppm - MMS_ANCHORS.find((a) => a.id === peer)!.ppm
  /**
   * The span the train measures the ratio over, DERIVED: `(responders + 1) × slot × (X − 1)`,
   * which is 14 ms here and not the 7 the lesson used to claim. It was a typed literal until
   * the UWB track review (I1) found that the pin was arithmetic about the number 7 and could
   * not see the scene at all.
   */
  const plan = roundPlan(uwbMmsScenario('base').uwb!, ANCHORS.length)
  const spanMs = ((plan.mms!.phy.rsfs - 1) * plan.mms!.fragGapNs) / MS
  const sigmaPpm = (): number => ratioSigma(DEFAULT_UWB_SESSION.tsNoisePs, spanMs) * 1e6

  it('the gap is the round’s own, so the span is 14 ms and σ_ratio = 0.0101 ppm', () => {
    // the gap is one slot per responder plus one — two milliseconds, not one
    expect(plan.mms!.fragGapNs).toBe((ANCHORS.length + 1) * plan.slotNs)
    expect(plan.mms!.fragGapNs).toBe(2 * MS)
    expect(plan.mms!.phy.rsfs).toBe(8)
    expect(spanMs).toBe(14)
    // …and it is a true millisecond only in the pairwise round, where the lesson's old
    // sentence would have been right
    expect(roundPlan(uwbMmsScenario('pairwise').uwb!, ANCHORS.length).mms!.fragGapNs).toBe(1 * MS)
    expect(sigmaPpm().toFixed(4)).toBe('0.0101')
    expect(DEFAULT_UWB_SESSION.tsNoisePs).toBe(100)
    // "Going deeper": the same two stamps across one 82 µs fragment would be about 1.7 ppm
    const overOneFragment = ratioSigma(DEFAULT_UWB_SESSION.tsNoisePs, rsfNs(40, 64) / MS) * 1e6
    expect(overOneFragment.toFixed(1)).toBe('1.7')
    expect(overOneFragment).toBeGreaterThan(Math.abs(trueRatio('anchor-3')) / 10)
  })

  it('the same curve runs inside one packet: 66.667 µs of STS gives 2.1 ppm', () => {
    // The cross-reference added on 2026-10-03 (leftovers design §1): §10.29.1.1 puts the same
    // arithmetic on the two additional STS markers of one packet. SRMARKER0 is the RMARKER and
    // SRMARKER1 sits a gap plus a segment later, so the span comes out of the engine's own STS
    // constants — another point on this curve, not another method, and the reason the engine
    // does not read those markers at all.
    const span = chipsToNs(STS_GAP_CHIPS + STS_ACTIVE_CHIPS)
    expect(span).toBe(66_667)
    const inPacket = ratioSigma(DEFAULT_UWB_SESSION.tsNoisePs, span / MS) * 1e6
    expect(inPacket.toFixed(1)).toBe('2.1')
    // It is the SHORTEST lever of the three and therefore the worst σ: 66.667 µs is shorter than
    // the 82 µs fragment the lesson already compares against, and 210 times shorter than the train.
    const overOneFragment = ratioSigma(DEFAULT_UWB_SESSION.tsNoisePs, rsfNs(40, 64) / MS) * 1e6
    expect(inPacket).toBeGreaterThan(overOneFragment)
    expect(inPacket).toBeGreaterThan(sigmaPpm())
    const deeper = paragraphTexts(uwbMmsNumbers.deeper!).find((t) => t.includes('§10.29.1.1'))!
    expect(deeper).toContain(`${inPacket.toFixed(1)} ppm`)
    expect(deeper).toContain('66.667 µs')
  })

  it('"round 0 measures 39.985, 19.996, 9.984 ppm" against a true 40, 20 and 10', () => {
    expect(ANCHORS.map(trueRatio)).toEqual([40, 20, 10])
    expect(firstTrains('base').map((t) => t.ratioPpm!.toFixed(3)))
      .toEqual(['39.985', '19.996', '9.984'])
    expect(cell(2, 0, 1)).toBe('39.985, 19.996, 9.984 ppm')
    for (const t of trainsAt('base', TAG)) {
      expect(Math.abs(t.ratioPpm! - trueRatio(t.peer)), t.peer).toBeLessThan(4 * sigmaPpm())
    }
    // "the two ends report with opposite signs"
    const atAnchor = trainsAt('base', 'anchor-1')[0]
    expect(atAnchor.ratioPpm!.toFixed(3)).toBe('-39.997')
    expect(Math.sign(atAnchor.ratioPpm!)).toBe(-Math.sign(firstTrains('base')[0].ratioPpm!))
  })

  it('the correction table: 3.00 m, 1.5 m, 1.5 cm, 0.76 mm, over a 2.10 cm floor', () => {
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
    expect((halfReplyS * sigmaPpm() * 1e-6 * cMs * 1000).toFixed(2)).toBe('0.76')
    expect(cell(2, 4, 1)).toBe('0.76 mm')
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
    // renders is a value and not a sentence — in fact and not only in type
    expect(cell(2, 5, 1)).toBe('2.10 cm')
    // the 1.5 mm is invisible under it: adding it in quadrature moves nothing a reader sees
    const floor = rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs)
    expect(rms).toBeLessThan(1.2 * floor)
    expect((Math.hypot(floor, 0.0015) * 100).toFixed(1)).toBe((floor * 100).toFixed(1))
  })

  it('observe 2: the range line prints the corrected range and the raw one', () => {
    const first = ofType(recs('base'), 'UWB_RANGE')[0]
    expect(fmtRecord(first)).toBe('tag-1 range → anchor-1 (SS): 14.26 m (true 13.04 m, raw 17.25 m)')
    // the first report of a one-to-many round lands in slot 40, at 20 ms
    expect(first.t).toBe(20 * MS + nbPpduNs(NB_REPORT_BYTES) + 44)
    expect(rctuToMetres(first.tofRawRctu!) - first.distM).toBeGreaterThan(2.9)
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

  it('carries the sum as a procedure the reader can re-run: six steps, none empty', () => {
    // The one content rule that survives the prose cull: a lesson that states a rule
    // carries it as a procedure. The wording is the author’s; the shape is the test’s.
    expect(steps()).toHaveLength(6)
    for (const s of steps()) expect(s.trim().length).toBeGreaterThan(0)
  })

  it('step 1 — E: −41.3 dBm/MHz over 499.2 MHz is −14.3 dBm, and 1 ms of it is 37 nJ', () => {
    expect(worked(0)).toBe('−41.3 dBm/MHz × 499.2 MHz = −14.3 dBm → 37 nJ')
    expect((-41.3 + 10 * Math.log10(499.2)).toFixed(1)).toBe('-14.3')
    expect(UWB_MS_BUDGET_NJ).toBe(37)
  })

  it('step 2 — t: 40 × 4 × (128 + 2 × 64) = 40 960 chips, 82.051 µs', () => {
    expect(worked(1)).toBe('40 × 4 × (128 + 2 × 64) = 40 960 chips → 82.051 µs')
    expect(rsfChips(40, 64)).toBe(40_960)
    expect(fragNs).toBe(82_051)
    expect(MMS_SETS['rsf-1'].nMsr).toBe(40)
  })

  it('step 3 — P: the whole of E inside t is −3.46 dBm', () => {
    expect(worked(2)).toBe('10·log10(37 / 82.051) = −3.46 dBm')
    expect(mmsFragmentDbm(fragNs).toFixed(2)).toBe('-3.46')
  })

  it('step 4 — rx: 96.80 dB of room leaves −100.26 dBm at the far anchor', () => {
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
    expect(worked(4)).toBe('+9.03 dB · +6.02 dB')
    expect(combineGainDb(8).toFixed(2)).toBe('9.03')
    expect(combineGainDb(4).toFixed(2)).toBe('6.02')
    expect(firstTrains('base')[0].heard).toBe(8)
    expect(firstTrains('four')[0].heard).toBe(4)
  })

  it('step 6 — the margin: +1.77 dB at eight fragments, −1.24 at four, and the verdict flips', () => {
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

// --- every figure the PROSE prints ------------------------------------------------------------

/**
 * **The tables are read out of the lesson above; the prose around them is not.** The sweep of
 * 2026-10-13 plants one edit per printed figure and runs this file: of the 150 figures this
 * lesson prints, **77** could be edited with the suite green. The tables came off well — the
 * assertions above compare whole cells against strings typed here, so an edit to a cell does
 * redden them — and what was free was everything else: the title, the formula bodies, the
 * paragraphs under the tables, the left column of the correction table, all four `deeper`
 * sections, `limits`, `sources` and the quiz.
 *
 * Nothing new is measured below. Every assertion calls the same `recs`, `firstTrains`,
 * `combineGainDb`, `mmsFragmentDbm`, `ratioSigma`, `roundPlan` the tests above call, and the
 * figure comes out of the prose. Where a figure is printed in four places — 9.03 dB is in two
 * tables, in `limits` and twice in the quiz — every occurrence is read.
 */
describe('uwb-mms-numbers · every figure the prose prints, read back out of it', () => {
  const EVERYWHERE = lessonTexts(uwbMmsNumbers).map((t) => t.text).join('\n')
  const val = (s: string): number => Number(s.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (s: string, re: RegExp, what: string): string[] => {
    const m = re.exec(s)
    expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (s: string, re: RegExp, what: string): number[] => raw(s, re, what).map(val)
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const everyFig = (re: RegExp, what: string, least: number): string[] => {
    const out = [...EVERYWHERE.matchAll(re)].flatMap((m) => m.slice(1).filter((x) => x !== undefined))
    expect(out.length, `${what}: fewer occurrences than this test was written for`)
      .toBeGreaterThanOrEqual(least)
    return out
  }
  const blockText = (b: unknown): string => {
    const o = b as { heading?: string; text?: string; items?: string[]; note?: string; caption?: string }
    return [o.heading ?? '', o.text ?? '', (o.items ?? []).join('\n'), o.note ?? '', o.caption ?? '']
      .join('\n')
  }
  const nums = (uwbMmsNumbers.numbers ?? []).map(blockText).join('\n')
  const deep = (uwbMmsNumbers.deeper ?? []).map(blockText).join('\n')
  const limitsText = (uwbMmsNumbers.limits ?? []).map((l) => l.text).join('\n')
  const srcText = (uwbMmsNumbers.sources ?? []).join('\n')
  const quizText = uwbMmsNumbers.quiz!.map((q) => [q.q, ...q.options, q.explain].join('\n')).join('\n')

  const FRAG_NS = rsfNs(40, 64)
  const D = distTo(MMS_ANCHORS[0]!)
  const PLAN = roundPlan(uwbMmsScenario('base').uwb!, ANCHORS.length)
  const SPAN_MS = ((PLAN.mms!.phy.rsfs - 1) * PLAN.mms!.fragGapNs) / MS
  const SIGMA_PPM = ratioSigma(DEFAULT_UWB_SESSION.tsNoisePs, SPAN_MS) * 1e6
  const RANGES = ofType(recs('base'), 'UWB_RANGE').length
  const REPLY_MS = (() => {
    const r = ofType(recs('base'), 'TX_START')
      .map((x) => x.frame.uwb?.nb?.replyRctu).find((x) => x !== undefined)!
    return (r * RCTU_NS) / MS
  })()
  /** True ratio at the tag against one peer, in ppm. */
  const trueRatio = (peer: string): number =>
    TAG_POS.ppm - MMS_ANCHORS.find((a) => a.id === peer)!.ppm

  it('every logarithm the lesson writes out, and the threshold it subtracts', () => {
    /*
     * 「gain = 10·log10(X)」, 「P = 10·log10(E / t)」, 「G = 10·log10(X)」 and the same in
     * `sources` — the decibel convention, written out four times. Each is fed back: the
     * multiplier and the base the lesson prints have to reproduce the engine's own gain.
     */
    const logs = [...EVERYWHERE.matchAll(/(\d+)·log(\d+)\(/g)].map((m) => [val(m[1]!), val(m[2]!)])
    expect(logs.length, 'the lesson writes a logarithm out four times')
      .toBeGreaterThanOrEqual(4)
    for (const [mult, base] of logs) {
      for (const x of [4, 8, 16]) {
        expect(mult! * (Math.log(x) / Math.log(base!)), `${mult}·log${base}(${x})`)
          .toBeCloseTo(combineGainDb(x), 9)
      }
    }
    // 「margin = rx + gain − (−93 dBm)」 and 「余量，S = −93 dBm」 and `sources`' own −93
    for (const v of everyFig(/− \(−(\d+) dBm\)|S = −(\d+) dBm|−(\d+) dBm 的接收机/g,
      'the sensitivity the margin subtracts', 3)) {
      expect(-val(v), 'the threshold `phy.ts` gives this receiver').toBe(UWB_RX_SENS_DBM)
    }
    // 「σ_ratio = √2 · σ_ts / ((j − i) × gap)」 — the 2 under the root, fed back
    const [root] = figs(nums, /σ_ratio = √(\d) · σ_ts/, 'the formula for σ_ratio')
    expect((Math.sqrt(root!) * DEFAULT_UWB_SESSION.tsNoisePs * 1e-12) / (SPAN_MS * 1e-3) * 1e6,
      'the σ_ratio the lesson’s own formula gives').toBeCloseTo(SIGMA_PPM, 12)
  })

  it('the three paragraphs under the tables, and the title’s own decibels', () => {
    // 「判定在 3.01 dB 的算术上翻了面——代价是整段运行的 21 次测距全部落空」
    const [flip, lost] = raw(nums,
      /判定在 ([\d.]+) dB 的算术上翻了面——代价是整段运行的 (\d+) 次测距全部落空/,
      '`numbers` on the three decibels between the two trains')
    same(flip!, combineGainDb(8) - combineGainDb(4), 'the difference the two trains combine to')
    expect(val(lost!), 'the ranges the shipped run makes, all of which the four-fragment run loses')
      .toBe(RANGES)
    expect(ofType(recs('four'), 'UWB_RANGE'), 'and that run makes none').toHaveLength(0)
    // 「这一轮的间隔是 2 ms，所以从一串的第一个片段到第八个是 14 ms；100 ps 的时间戳在这段跨度
    //  上给出 σ_ratio = 0.0101 ppm」
    const [gapMs, spanMs, psNoise, sigma] = raw(nums,
      /这一轮的间隔是 (\d) ms，所以从一串的第一个片段到第八个是 (\d+) ms；(\d+) ps 的时间戳在这段跨度上给出 σ_ratio = ([\d.]+) /,
      '`numbers` on the ruler')
    expect(val(gapMs!) * MS, 'the gap between two fragments of this round')
      .toBe(PLAN.mms!.fragGapNs)
    expect(val(spanMs!), 'the span the whole train covers').toBe(SPAN_MS)
    expect(val(psNoise!), 'the timestamp noise this session runs with')
      .toBe(DEFAULT_UWB_SESSION.tsNoisePs)
    same(sigma!, SIGMA_PPM, 'and the σ_ratio those two give')
    // 「这个比值，作用在 0.5 ms 的回复上」
    const [replyMs] = raw(nums, /作用在 ([\d.]+) ms 的回复上/, '`numbers` on the reply it acts on')
    same(replyMs!, REPLY_MS, 'the reply this round really leaves')
    // 「光是两个接收时间戳就有 2.1 cm」
    const [floorCm] = raw(nums, /光是两个接收时间戳就有 ([\d.]+) cm/,
      '`numbers` on the floor underneath')
    same(floorCm!, rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs) * 100, 'the floor two stamps give')
    // 「其中两项谈的是发射机……合起来 10.54 dB，而老式的突发发射机本可保持 −7.41 dBm」
    const [together, couldHold, honest] = raw(nums,
      /合起来 ([\d.]+) dB，而老式的突发发射机本可保持 −([\d.]+) dBm，一样合规。诚实的说法是那 ([\d.]+) dB/,
      '`numbers` on which part of the gain is the idea')
    const gainTable = table(3)
    const shorter = val(/([\d.]+)/.exec(gainTable.rows[1]![1]!)![1]!)
    const unspent = val(/([\d.]+)/.exec(gainTable.rows[2]![1]!)![1]!)
    same(together!, shorter + unspent, 'the two transmitter terms of its own table')
    same(honest!, combineGainDb(PLAN.mms!.phy.rsfs), 'and the combining gain, which is the idea')
    // 「本可保持 −7.41 dBm」: the same millisecond's energy spread over an ordinary poll
    const pollNs = uwbPpduNs(uwbPollBytes(ANCHORS.length))
    same(`-${couldHold!}`, mmsFragmentDbm(pollNs),
      'what an ordinary poll could have held, if it spent the whole budget')
    // 「那 19.57 dB 从哪来」 — the heading, and the same figure in `limits` and the quiz
    for (const v of everyFig(/那 ([\d.]+) dB 从哪来|那 ([\d.]+) dB 的分解里|poll 好 ([\d.]+) dB/g,
      'the whole of the gain over a 4z poll', 3)) {
      same(v, shorter + unspent + combineGainDb(PLAN.mms!.phy.rsfs),
        'which is its own table’s three rows added up')
    }
    // 「片段、预算，和那 12 dB」 — the title names the largest combining gain of its own table
    const [titleDb] = figs(uwbMmsNumbers.title, /那 (\d+) dB/, 'the title’s own decibels')
    expect(titleDb, 'the gain the biggest train of the three-sequence table combines to')
      .toBe(Math.floor(combineGainDb(16)))
  })

  it('the correction table’s left column: the three crystals, the limit and the count', () => {
    const t = table(2)
    // 「第 0 轮量得，真值为 40 / 20 / 10 ppm」
    const [round, a, b, c] = figs(t.rows[0]![0]!, /第 (\d) 轮量得，真值为 (\d+) \/ (\d+) \/ (\d+) ppm/,
      'the first row’s own label')
    expect(round, 'the block the measured ratios are taken from').toBe(0)
    expect([a, b, c], 'the three true ratios the scene sets')
      .toEqual(ANCHORS.map((p) => Math.abs(trueRatio(p))))
    // 「不修正，相差 40 ppm」
    const [uncorrected] = figs(t.rows[1]![0]!, /不修正，相差 (\d+) ppm/, 'the second row’s label')
    expect(uncorrected, 'the widest of the three, which is the one it prices')
      .toBe(Math.max(...ANCHORS.map((p) => Math.abs(trueRatio(p)))))
    // 「这一串的 0.0101 ppm」
    const [residual] = raw(t.rows[4]![0]!, /这一串的 ([\d.]+) ppm/, 'the fifth row’s label')
    same(residual!, SIGMA_PPM, 'the residual the train leaves')
    // 「两个接收时间戳给任何测距带来的下限，取 21 次」
    const [count] = figs(t.rows[5]![0]!, /取 (\d+) 次/, 'the last row’s label')
    expect(count, 'the ranges the run makes').toBe(RANGES)
  })

  it('`deeper`: what the larger parameter set costs, term by term', () => {
    const set = MMS_SETS['rsf-1']
    // 「X = 16，重复次数仍是 40，但间隔是 33 个零而不是 64」
    const [x, nMsr, gap, wasGap] = figs(deep,
      /X = (\d+)，重复次数仍是 (\d+)，但间隔是 (\d+) 个零而不是 (\d+)/,
      '`deeper` on the parameters of rsf-1')
    expect([x, nMsr, gap], 'the set `mms.ts` publishes under that name')
      .toEqual([set.rsfs, set.nMsr, set.gap])
    expect(wasGap, 'and the gap this scene’s own train uses').toBe(PLAN.mms!.phy.gap)
    // 「于是片段从 82.051 µs 缩到 62.179 µs，同样一毫秒的能量装进去就响了 1.20 dB」
    const [wasNs, nowNs, louder] = raw(deep,
      /于是片段从 ([\d.]+) µs 缩到 ([\d.]+) µs，同样一毫秒的能量装进去就响了 ([\d.]+) dB/,
      '`deeper` on what the shorter fragment buys')
    same(wasNs!, FRAG_NS / 1000, 'the fragment this scene sends')
    same(nowNs!, rsfNs(set.nMsr, set.gap) / 1000, 'and the one rsf-1 sends')
    same(louder!, mmsFragmentDbm(rsfNs(set.nMsr, set.gap)) - mmsFragmentDbm(FRAG_NS),
      'and how much louder the same energy is in the shorter one')
    // 「十二个分贝的合成再加这 1.20，把余量从 +1.8 dB 抬到 +6.0」
    const [plus, from, to] = raw(deep, /的合成再加这 ([\d.]+)，把余量从 \+([\d.]+) dB 抬到 \+([\d.]+)/,
      '`deeper` on the margin it lifts')
    expect(val(plus!), 'the same 1.20 dB, restated in the same sentence').toBe(val(louder!))
    const marginOf = (fragNs: number, heard: number): number =>
      rxDbmOf(fragNs, D) + combineGainDb(heard) - UWB_RX_SENS_DBM
    same(from!, marginOf(FRAG_NS, PLAN.mms!.phy.rsfs), 'the margin this scene has')
    same(to!, marginOf(rsfNs(set.nMsr, set.gap), set.rsfs), 'and the margin rsf-1 has')
    // 「测距阶段从 20 个时隙涨到 32 个，一轮成对测距从 14 ms 涨到 20 ms，于是三轮要占掉块里的
    //  60 ms，而不是 42 ms」
    const [wasSlots, nowSlots, wasMs, nowMs, nowBlock, wasBlock] = figs(deep,
      /测距阶段从 (\d+) 个时隙涨到 (\d+) 个，一轮成对测距从 (\d+) ms 涨到 (\d+) ms，于是三轮要占掉块里的 (\d+) ms，而不是 (\d+) ms/,
      '`deeper` on what it costs in slots and in milliseconds')
    /*
     * The pairwise round with each train in turn — which is the round 「一轮成对测距」 names, and
     * the only one whose cost the sentence is about. `roundPlan` carries the layout that placed
     * the fragments, so the ranging phase in slots is read off it rather than counted again.
     */
    const base = uwbMmsScenario('pairwise').uwb!
    const plan = (phy: Partial<typeof set>): ReturnType<typeof roundPlan> =>
      roundPlan({ ...base, mms: { ...base.mms, ...phy } }, 1)
    const ours = plan(PLAN.mms!.phy)
    const theirs = plan(set)
    expect(wasSlots, 'the ranging phase this scene’s own train lays out')
      .toBe(ours.mms!.layout.rpSlots)
    expect(nowSlots, 'and the one rsf-1 lays out').toBe(theirs.mms!.layout.rpSlots)
    expect(wasMs! * MS, 'the pairwise round this train makes').toBe(ours.roundNs)
    expect(nowMs! * MS, 'and the one rsf-1 makes').toBe(theirs.roundNs)
    // 「三轮」 is one pairwise round per anchor, which is what this scene's block spends
    expect(wasBlock! * MS, 'one round per anchor, at this train’s length')
      .toBe(ANCHORS.length * ours.roundNs)
    expect(nowBlock! * MS, 'and at rsf-1’s').toBe(ANCHORS.length * theirs.roundNs)
    expect(ANCHORS, 'three anchors, so three rounds').toHaveLength(3)
    // 「本场景自己那一串……X = 8、重复 40 次、间隔 64 个零，对不上任何一个有名字的参数集」
    const [mine, reps, zeros] = figs(deep, /X = (\d+)、重复 (\d+) 次、间隔 (\d+) 个零/,
      '`deeper` on this scene’s own train')
    expect([mine, reps, zeros], 'the train the ranging cycle’s defaults give')
      .toEqual([PLAN.mms!.phy.rsfs, PLAN.mms!.phy.nMsr, PLAN.mms!.phy.gap])
    for (const id of Object.keys(MMS_SETS) as (keyof typeof MMS_SETS)[]) {
      const s = MMS_SETS[id]
      expect(s.rsfs === mine && s.nMsr === reps && s.gap === zeros,
        `and it is not ${id}`).toBe(false)
    }
  })

  it('`deeper`: the ordinary radio’s failure, and the same curve at three spans', () => {
    // 「1.3 秒内一次测距也没有：42 次超时」
    const [secs, timeouts] = raw(deep, /([\d.]+) 秒内一次测距也没有：(\d+) 次超时/,
      '`deeper` on the 4z comparison')
    expect(val(secs!) * 1000 * MS, 'the window this file runs every variant over').toBe(RUN_NS)
    expect(ofType(recs('twr'), 'UWB_RANGE'), 'that run makes no range at all').toHaveLength(0)
    expect(ofType(recs('twr'), 'UWB_TIMEOUT'), 'and times out that many times')
      .toHaveLength(val(timeouts!))
    // 「那帧 poll 到达时是 −110.80 dBm」
    const [pollRx] = raw(deep, /那帧 poll 到达时是 −([\d.]+) dBm/, '`deeper` on what the poll arrives at')
    const pollDbm = UWB_TX_POWER_DBM
      - (uwbPl0Db(9) + 10 * UWB_PL_EXP * Math.log10(D) + 2 * WALL_LOSS_DB.brick)
    same(`-${pollRx!}`, pollDbm, 'the level an ordinary poll arrives at, out there')
    expect(pollDbm, 'which is below the threshold, and nothing in that mode adds up')
      .toBeLessThan(UWB_RX_SENS_DBM)
    // 「两个带 100 ps 噪声的时间戳，相隔 14 ms 取得，给出 0.0101 ppm；而同样两个时间戳若取在一个
    //  82 µs 的片段两端，大约是 1.7 ppm」
    const [ps, span, over, fragUs, worse] = raw(deep,
      /两个带 (\d+) ps 噪声的时间戳，相隔 (\d+) ms 取得，给出 ([\d.]+) ppm；而同样两个时间戳若取在一个 (\d+) µs 的片段两端，大约是 ([\d.]+) ppm/,
      '`deeper` on why the ratio is measured over the train')
    expect(val(ps!), 'the timestamp noise').toBe(DEFAULT_UWB_SESSION.tsNoisePs)
    expect(val(span!), 'the span of the train').toBe(SPAN_MS)
    same(over!, SIGMA_PPM, 'and the σ it gives')
    expect(val(fragUs!), 'the fragment, to the microsecond this sentence rounds it to')
      .toBe(Math.round(FRAG_NS / 1000))
    same(worse!, ratioSigma(DEFAULT_UWB_SESSION.tsNoisePs, FRAG_NS / MS) * 1e6,
      'and the σ the same two stamps would give across one fragment')
    expect(val(worse!), 'which is worse than the crystal it is trying to measure')
      .toBeGreaterThan(Math.abs(trueRatio('anchor-3')) / 10)
    // 「跨度 66.667 µs、落在 2.1 ppm」 — the same arithmetic inside one packet
    const [stsUs, stsPpm] = raw(deep, /跨度 ([\d.]+) µs、落在 ([\d.]+) ppm/,
      '`deeper` on the span one packet gives')
    const stsNs = chipsToNs(STS_GAP_CHIPS + STS_ACTIVE_CHIPS)
    same(stsUs!, stsNs / 1000, 'the span the engine’s own STS markers are apart')
    same(stsPpm!, ratioSigma(DEFAULT_UWB_SESSION.tsNoisePs, stsNs / MS) * 1e6,
      'and the σ that span gives — the same curve, another point')
  })

  it('`limits` and `sources`: every constant each one owns', () => {
    /*
     * 「真实法规还压着一条峰值限（量级是每 50 MHz 0 dBm）」 is **exempt**: there is no peak limit
     * anywhere in this engine to read it against — which is exactly what the sentence says. What
     * is checked is the claim it is there to make: with the repetitions at their smallest, a
     * fragment's modelled power really does run away, past anything that figure could be.
     */
    const [perMhz, peakDbm] = figs(limitsText, /量级是每 (\d+) MHz (\d+) dBm/,
      '`limits` on the peak limit it does not model')
    // a microsecond-long fragment — shorter than anything this scene sends, and the engine
    // charges it the whole millisecond's energy all the same, with nothing to clamp it
    expect(mmsFragmentDbm(1000), 'a 1 µs fragment is louder than that limit by over ten decibels')
      .toBeGreaterThan(peakDbm! + 10)
    expect(perMhz, 'and the limit is quoted per that many megahertz, which this engine has no rule for')
      .toBeGreaterThan(0)
    // 「mmsFragmentDbm 把 37 nJ 除以片段长度」
    for (const v of everyFig(/把 (\d+) nJ 除以片段长度|(\d+) nJ 里只花掉/g,
      'the millisecond’s energy', 2)) {
      expect(val(v), 'the budget `mms.ts` divides').toBe(UWB_MS_BUDGET_NJ)
    }
    // 「「从没花完的预算」那 6.59 dB 来自 phy.ts 的 UWB_TX_POWER_DBM = −14」
    const [unspent, txPower] = figs(limitsText,
      /那 ([\d.]+) dB 来自 phy\.ts 的 UWB_TX_POWER_DBM = −(\d+)/,
      '`limits` on which term rests on a constant')
    expect(-txPower!, 'the transmit power `phy.ts` exports').toBe(UWB_TX_POWER_DBM)
    const pollNs = uwbPpduNs(uwbPollBytes(ANCHORS.length))
    same(String(unspent), mmsFragmentDbm(pollNs) - UWB_TX_POWER_DBM,
      'and the term it decides: what that poll could have held over what it does')
    // 「唯一与器件无关的是那 9.03 dB」
    const [idea] = raw(limitsText, /唯一与器件无关的是那 ([\d.]+) dB/, '`limits` on the one honest term')
    same(idea!, combineGainDb(PLAN.mms!.phy.rsfs), 'the combining gain of this scene’s train')
    // 「按毫秒平均的 −41.3 dBm/MHz」 — the regulation figure, and the budget it makes
    const [eirp] = raw(srcText, /按毫秒平均的 −([\d.]+) dBm\/MHz/, '`sources` on the regulation')
    // the bandwidth is in a table CELL, so it is read off the whole walk and not off a block's text
    const [band] = figs(EVERYWHERE, /× ([\d.]+) MHz/, 'the bandwidth the budget is taken over')
    const dbm = -val(eirp!) + 10 * Math.log10(band!)
    expect(Number((10 ** (dbm / 10) * 1e-3 * 1e-3 * 1e9).toFixed(0)),
      'that EIRP over that bandwidth for a millisecond is the budget').toBe(UWB_MS_BUDGET_NJ)
    // 「每道砖墙 2.0 ns 的额外时延」 and 「代入 σ_ratio 的 100 ps 时间戳噪声」
    const [wallNs] = raw(srcText, /每道砖墙 ([\d.]+) ns 的额外时延/, '`sources` on the wall')
    same(wallNs!, UWB_NLOS_NS.brick, 'the delay a brick wall adds')
    for (const v of everyFig(/(\d+) ps 时间戳噪声|(\d+) ps 噪声|(\d+) ps 的时间戳/g,
      'the timestamp noise', 3)) {
      expect(val(v), 'the noise this session runs with').toBe(DEFAULT_UWB_SESSION.tsNoisePs)
    }
    // 「晶振允许的 ±20 ppm 是标准的」
    const [ppmMax] = figs(srcText, /晶振允许的 ±(\d+) ppm/, '`sources` on the crystal limit')
    expect(ppmMax, 'the limit `phy.ts` exports').toBe(UWB_PPM_MAX)
  })

  it('the quiz: the two gains, the honest share, and the two lengths it compares', () => {
    // 「不同的只是加起来是多少：6.02 dB 对 9.03 dB」
    const [four, eight] = raw(quizText, /不同的只是加起来是多少：([\d.]+) dB 对 ([\d.]+) dB/,
      'the quiz on what changed')
    same(four!, combineGainDb(4), 'what four fragments combine to')
    same(eight!, combineGainDb(PLAN.mms!.phy.rsfs), 'and what eight do')
    // 「9.03 dB；另外 10.54 dB 是发射功率——片段更短，加上一台在 37 nJ 里只花掉 8.11 nJ 的发射机」
    const [idea, rest, budget, spent] = raw(quizText,
      /([\d.]+) dB；另外 ([\d.]+) dB 是发射功率——片段更短，加上一台在 (\d+) nJ 里只花掉 ([\d.]+) nJ 的发射机/,
      'the quiz on the honest share')
    same(idea!, combineGainDb(PLAN.mms!.phy.rsfs), 'the combining gain')
    const gainTable = table(3)
    const shorter = val(/([\d.]+)/.exec(gainTable.rows[1]![1]!)![1]!)
    const unspent = val(/([\d.]+)/.exec(gainTable.rows[2]![1]!)![1]!)
    same(rest!, shorter + unspent, 'and the two transmitter terms of the same table')
    expect(val(budget!), 'the budget a millisecond is').toBe(UWB_MS_BUDGET_NJ)
    const pollNs = uwbPpduNs(uwbPollBytes(ANCHORS.length))
    const pollNj = 10 ** (UWB_TX_POWER_DBM / 10) * 1e-3 * (pollNs * 1e-9) * 1e9
    same(spent!, pollNj, 'and what an ordinary poll really spends of it')
    // 「12.04 dB，表里最大的那个合成增益」 — the distractor names the largest gain of the table
    const [largest] = raw(quizText, /([\d.]+) dB，表里最大的那个合成增益/,
      'the distractor that names the largest gain')
    const gains = table(1).rows.map((r) => val(/([\d.]+)/.exec(r[2]!)![1]!))
    same(largest!, Math.max(...gains), 'which is the largest the three-sequence table prints')
    // 「本轮是两毫秒，于是整串用 14 ms 的跨度比较了两块晶振」
    const [span] = figs(quizText, /整串用 (\d+) ms 的跨度/, 'the quiz on the span')
    expect(span, 'the span the train covers').toBe(SPAN_MS)
    // 「这段跨度在半毫秒的回复上只留下 0.76 mm——远小于两个接收时间戳本身就要花掉的 2.1 cm」
    const [mm, cm] = raw(quizText, /只留下 ([\d.]+) mm——远小于两个接收时间戳本身就要花掉的 ([\d.]+) cm/,
      'the quiz on what the residual is worth')
    same(mm!, 0.5 * REPLY_MS * 1e-3 * SIGMA_PPM * 1e-6 * C_M_PER_NS * 1e9 * 1000,
      'the residual over half the reply')
    same(cm!, rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs) * 100, 'and the floor under it')
    expect(val(mm!) / 10, 'which is far smaller, as the sentence says').toBeLessThan(val(cm!))
  })
})
