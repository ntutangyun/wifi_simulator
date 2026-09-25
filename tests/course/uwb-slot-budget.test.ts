/**
 * Every empirical claim of "时隙该多长" (src/course/uwb/uwb-slot-budget.ts),
 * measured against the scene it shares with `uwb-blocks`.
 *
 * This is the SECOND half of the old `uwb-blocks`
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md §2 · M15), so
 * the slot-fit rule, the 300 RSTU floor, the radio-cost figures, the whole
 * 0.5 ms variant and the editor's clamp arrive here from
 * tests/course/uwb-blocks.test.ts with the sentences that carry them. No pin was
 * dropped in the move; what moved with the prose is which file it sits in.
 *
 * The lesson is not registered in `src/course/lessons.ts` yet — the controller
 * does that when the batch lands — so the readability contract is applied here
 * by importing the lesson directly: `lessonShapeSuite` for the shape and the
 * minutes, `ZH_TERMS` for the terminology rule, and `layoutDiagram` for the
 * figure geometry that tests/course/diagram.test.ts will check course-wide the
 * moment the lesson is in `LESSONS`.
 */
import { describe, it, expect } from 'vitest'
import { FIG, uwbSlotBudget, uwbSlotBudgetTiming } from '../../src/course/uwb/uwb-slot-budget'
import { FIG as GRID, uwbBlocks, uwbBlocksScenario } from '../../src/course/uwb/uwb-blocks'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { uwbTag, type Block, type Lesson } from '../../src/course/lessonKit'
import { layoutDiagram, textBox, type Shape, type TimingSpec } from '../../src/course/diagram'
import {
  ZH_TERMS, cellTexts, paragraphTexts, zhAkaViolations, zhTermFailure,
} from '../../src/course/readability'
import { MODULES, trackOf } from '../../src/course/curriculum'
import { clampField } from '../../src/editor/planOps'
import { fmtRecord } from '../../src/ui/format'
import { roundPlan } from '../../src/uwb/session'
import {
  UWB_MAX_ANCHORS, UWB_SLOT_GUARD_NS, RSTU_CHIPS, rstuNs, uwbFinalBytes, uwbPpduNs, uwbSlotFitNs,
  uwbSlotsPerTag,
} from '../../src/uwb/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** Two blocks and a little more, exactly as the parent runs it, so the memo is shared. */
const RUN_NS = 300 * MS
const ANCHORS = 4
const TAGS = ['uwb-1', 'uwb-2', 'uwb-3']

const SESSION = uwbSlotBudget.scenario().uwb!
const PLAN = roundPlan(SESSION, ANCHORS)

const recs = (variant?: number): TLRecord[] => runOf(uwbSlotBudget, variant, RUN_NS)

// The contract every migrated lesson owes. `sameSceneAs` is the split rule: this lesson loads
// uwb-blocks' scene AND its one variant, so its recorded hashes are that lesson's, value for
// value, and the fixture lines the controller adds are copies.
lessonShapeSuite(uwbSlotBudget, { runNs: RUN_NS, sameSceneAs: 'uwb-blocks' })

/**
 * Nanoseconds a node's radio spends out of `idle` inside [fromNs, untilNs) — the
 * uwbWait + rx + tx of the MAC_STATE lane, which is what the lesson calls the
 * radio share. Same helper as the parent's, because it is the same measurement.
 */
function radioOnNs(rs: TLRecord[], node: string, untilNs: number, fromNs = 0): number {
  let state: string = 'idle'
  let since = fromNs
  let on = 0
  for (const r of ofType(rs, 'MAC_STATE')) {
    if (r.node !== node || r.t >= untilNs || r.t < fromNs) continue
    if (state !== 'idle') on += r.t - since
    state = r.state
    since = r.t
  }
  if (state !== 'idle') on += untilNs - since
  return on
}

const table = (n: number): Extract<Block, { kind: 'table' }> =>
  uwbSlotBudget.numbers!.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[n]
const cell = (n: number, row: number, col: number): string => table(n).rows[row][col]
const formulas = (): Extract<Block, { kind: 'formula' }>[] =>
  uwbSlotBudget.numbers!.filter((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')
const steps = (): Extract<Block, { kind: 'steps' }> =>
  uwbSlotBudget.numbers!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!
const deeperProse = (): string => paragraphTexts(uwbSlotBudget.deeper!).join('\n')

/** What the scenario schema says about this scene, optionally with extra tags in it. */
function schemaIssues(slotRstu: number, extraTags = 0): string[] {
  const base = uwbBlocksScenario(slotRstu)
  const nodes = [
    ...base.nodes,
    ...Array.from({ length: extraTags }, (_, i) => uwbTag(`uwb-${TAGS.length + i + 1}`, `Phone ${TAGS.length + i + 1}`, 5, 4, 1.0)),
  ]
  const parsed = ScenarioSchema.safeParse({ ...base, nodes })
  return parsed.success ? [] : parsed.error.issues.map((i) => i.message)
}

/** The reader's own order over the main path, as tests/course/readability.test.ts walks it. */
const zhMain = (l: Lesson): string => [l.why!, ...(l.outcomes ?? [])]
  .concat(paragraphTexts(l.picture ?? []), cellTexts(l.picture ?? []))
  .concat(paragraphTexts(l.numbers ?? []), cellTexts(l.numbers ?? []))
  .concat(l.observe, l.tryThis, l.quiz.flatMap((q) => [q.q, ...q.options, q.explain]))
  .join(' ')

function termFailures(l: Lesson): string[] {
  const zh = zhMain(l)
  const out: string[] = []
  for (const t of ZH_TERMS.filter((x) => !x.track || x.track === trackOf(l))) {
    const why = zhTermFailure(zh, t)
    if (why) out.push(`${l.id}: ${why}`)
    out.push(...zhAkaViolations(zh, t).map((a) => `${l.id}: ${a}`))
  }
  return out
}

describe('uwb-slot-budget · the lesson itself', () => {
  it('is the second lesson of the sessions module and needs the first', () => {
    expect(MODULES[uwbSlotBudget.module].title).toBe('会话网格')
    expect(uwbSlotBudget.module).toBe(uwbBlocks.module)
    expect(uwbSlotBudget.id).toBe('uwb-slot-budget')
    expect(uwbSlotBudget.needs).toEqual(['uwb-blocks'])
    // `margin` arrives from the parent with the slot-length material; `airtime` is what the
    // radio bill is denominated in; RSTU is re-introduced because a reader may open this cold.
    expect(uwbSlotBudget.terms!.map((t) => t.term)).toEqual(['margin', 'airtime', 'RSTU'])
    expect(trackOf(uwbSlotBudget)).toBe('uwb')
  })

  it('carries three jumps, one observation, both experiments and both questions', () => {
    // §2: "uwb-slot-budget keeps the 0.5 ms variant, both experiments, both quizzes". The jumps
    // are the parent's, reordered so the first is the frame this lesson measures against its
    // slot (§6 allows a per-half reordering and forbids a new predicate).
    expect(uwbSlotBudget.jumps).toHaveLength(3)
    expect(uwbSlotBudget.jumps.map((j) => j.label))
      .toEqual(uwbSlotBudget.jumps.map((j) => j.label).filter((l) => uwbBlocks.jumps.some((p) => p.label === l)))
    expect(uwbSlotBudget.observe).toHaveLength(1)
    expect(uwbSlotBudget.tryThis).toHaveLength(2)
    expect(uwbSlotBudget.quiz).toHaveLength(2)
    for (const q of uwbSlotBudget.quiz) expect(q.options[q.answer]).toBeDefined()
    // the two questions are the parent's own, which is what §2 asked for
    expect(uwbSlotBudget.quiz.map((q) => q.answer)).toEqual([1, 2])
  })

  it('brackets every official term at its first Chinese use', () => {
    expect(termFailures(uwbSlotBudget)).toEqual([])
  })

  it('loads uwb-blocks’ scene and its one variant, unchanged', () => {
    expect(uwbSlotBudget.scenario()).toEqual(uwbBlocks.scenario())
    expect(uwbSlotBudget.scenario()).toEqual(uwbBlocksScenario(2400))
    expect(uwbSlotBudget.variants).toHaveLength(1)
    expect(uwbSlotBudget.variants![0].label).toBe(uwbBlocks.variants![0].label)
    expect(uwbSlotBudget.variants![0].scenario()).toEqual(uwbBlocksScenario(600))
    expect(() => ScenarioSchema.parse(uwbSlotBudget.scenario())).not.toThrow()
    expect(() => ScenarioSchema.parse(uwbSlotBudget.variants![0].scenario())).not.toThrow()
  })

  it('names its clauses and declares the two model numbers in `sources`', () => {
    const src = uwbSlotBudget.sources!.join('\n')
    for (const s of ['IEEE Std 802.15.4-2024', '§10.32.2', '§10.29.1.5', 'FiRa']) {
      expect(src, s).toContain(s)
    }
    // "fix the RSTU at 416 chips, which is 833.333 ns at 499.2 Mchip/s"
    expect(RSTU_CHIPS).toBe(416)
    expect((RSTU_CHIPS * 1000 / 499.2).toFixed(3)).toBe('833.333')
    // the 200 ns guard and the 300 RSTU floor are declared as model, here, where they are taught
    for (const s of ['200 ns', '300 RSTU']) expect(src, s).toContain(s)
    expect(UWB_SLOT_GUARD_NS).toBe(200)
    // and the floor is stated as the GENERAL one: the multiple-of-300 and fragment-fit rules are
    // the multi-millisecond path's, which the last source line points forward to instead of
    // claiming here. That distinction is load-bearing (src/model/scenario.ts: `min(300)` on any
    // slot, `% 300` only under `sc.uwb.mms`).
    expect(src).not.toContain('300 的整数倍')
    expect(src).toContain('多毫秒')
  })
})

describe('uwb-slot-budget · the slot-fit rule', () => {
  it('the printed rule is the engine’s uwbSlotFitNs, term for term', () => {
    // "slot ≥ PPDU(Final, N anchors) + 200 ns = 236 603 + 200 = 236 803 ns at N = 4"
    expect(formulas()).toHaveLength(1)
    expect(formulas()[0].text)
      .toBe('slot ≥ PPDU(Final, N anchors) + 200 ns = 236 603 + 200 = 236 803 ns at N = 4')
    expect(uwbFinalBytes(ANCHORS)).toBe(62)
    expect(uwbPpduNs(uwbFinalBytes(ANCHORS))).toBe(236_603)
    expect(uwbSlotFitNs(ANCHORS)).toBe(236_603 + UWB_SLOT_GUARD_NS)
    expect(uwbSlotFitNs(ANCHORS)).toBe(236_803)
    // "a 200 ns flight guard, which is 60 m of air"
    expect((UWB_SLOT_GUARD_NS * 0.299792458).toFixed(0)).toBe('60')
  })

  it('a 2 ms slot leaves the Final on 11.8 % of it, and 20 ppm over a block is 4 µs', () => {
    expect((uwbPpduNs(uwbFinalBytes(ANCHORS)) / PLAN.slotNs * 100).toFixed(1)).toBe('11.8')
    expect(formulas()[0].note!).toContain('11.8 %')
    expect((PLAN.blockNs * 20e-6 / 1000).toFixed(0)).toBe('4')
    expect(deeperProse()).toContain('4 µs')
    // "nearly nine tenths silence": the Final is under a seventh of its slot
    expect(uwbPpduNs(uwbFinalBytes(ANCHORS)) / PLAN.slotNs).toBeLessThan(0.15)
    // "here a slot boundary is exact": the schedule is laid out in true time, so a slot start
    // never drifts, whatever each device's own crystal does (which the model does draw)
    for (const r of ofType(recs(), 'TX_START')) expect(r.t % PLAN.slotNs, `${r.node}@${r.t}`).toBe(0)
  })

  it('the schema refuses 282 twice, refuses 285 on the floor alone, and takes 300', () => {
    // step 3: "场景 schema 另外给任何时隙设了 300 RSTU 的下限，即 250.0 µs，比上一步还宽 13.2 µs"
    const floor = 'Number must be greater than or equal to 300'
    expect(rstuNs(282)).toBe(235_000)
    expect(rstuNs(285)).toBe(237_500)
    expect(rstuNs(300)).toBe(250_000)
    const at282 = schemaIssues(282)
    expect(at282).toHaveLength(2)
    expect(at282).toContain(floor)
    expect(at282.some((m) => m.includes('235.0 µs') && m.includes('236.8 µs'))).toBe(true)
    expect(rstuNs(282)).toBeLessThan(uwbSlotFitNs(ANCHORS))
    const at285 = schemaIssues(285)
    expect(at285).toEqual([floor])
    expect(rstuNs(285) - uwbSlotFitNs(ANCHORS)).toBe(697)
    expect(schemaIssues(300)).toEqual([])
    expect(schemaIssues(297)).toContain(floor)
    // step 4: 285 and 282 are both whole numbers of 3-RSTU units, so that rule is not what
    // refuses them — which is exactly what the step says.
    expect(285 % 3).toBe(0)
    expect(282 % 3).toBe(0)
    expect(steps().items[3]).toContain('3 RSTU 的整数倍')
    // and the 13.2 µs the step quotes is the gap between the two rules
    expect(((rstuNs(300) - uwbSlotFitNs(ANCHORS)) / 1000).toFixed(1)).toBe('13.2')
  })

  it('the capacity rule only overtakes the floor once the Final grows', () => {
    // deeper: "六个锚点时 Final 要 267 572 ns，即 324 RSTU"
    expect(uwbSlotFitNs(6)).toBe(267_572)
    expect(rstuNs(324)).toBeGreaterThanOrEqual(uwbSlotFitNs(6))
    expect(rstuNs(321)).toBeLessThan(uwbSlotFitNs(6))
    expect(rstuNs(324)).toBeGreaterThan(rstuNs(300))
    for (const n of [1, 2, 3, 4, 5]) expect(uwbSlotFitNs(n), `fit ${n}`).toBeLessThanOrEqual(rstuNs(300))
    for (const s of ['267 572', '324 RSTU']) expect(deeperProse(), s).toContain(s)
    // and the nine-anchor cap is arithmetic, not a choice: 14 + 12N at ten anchors overruns the
    // 127-octet payload, which is where src/uwb/phy.ts derives UWB_MAX_ANCHORS from.
    expect(UWB_MAX_ANCHORS).toBe(9)
    expect(14 + 12 * 10).toBe(134)
    expect(14 + 12 * UWB_MAX_ANCHORS).toBeLessThanOrEqual(127)
    expect(14 + 12 * (UWB_MAX_ANCHORS + 1)).toBeGreaterThan(127)
    for (const s of ['134 字节', '127 字节']) expect(deeperProse(), s).toContain(s)
  })

  it('typing 285 into the editor’s slot field really does snap to 300', () => {
    // the second experiment, and step 5. The field is an RstuInput with lo = 300 that clamps on
    // blur and rounds to a whole 3-RSTU unit (src/uwb/ui/UwbSessionFields.tsx).
    const to3 = (rstu: number): number => Math.max(3, Math.round(rstu / 3) * 3)
    expect(to3(clampField('285', 300, 60_000, true))).toBe(300)
    expect(to3(clampField('282', 300, 60_000, true))).toBe(300)
    expect(uwbSlotBudget.tryThis[1]).toContain('285')
    expect(uwbSlotBudget.tryThis[1]).toContain('300')
    expect(steps().items[4]).toContain('285')
  })
})

describe('uwb-slot-budget · what the radio costs', () => {
  it('the schedule share is one round in ten for a phone and three for an anchor', () => {
    expect((PLAN.roundNs / PLAN.blockNs * 100).toFixed(0)).toBe('10')
    expect((TAGS.length * PLAN.roundNs / PLAN.blockNs * 100).toFixed(0)).toBe('30')
    expect(cell(0, 0, 1)).toBe('1 of 10')
    expect(cell(0, 1, 1)).toBe('3 of 10')
  })

  it('the two shares differ tenfold and more: 10.3× on the phone, 24.5× on the anchor', () => {
    const tagRatio = PLAN.roundNs / radioOnNs(recs(), 'uwb-1', PLAN.blockNs)
    const ancRatio = TAGS.length * PLAN.roundNs / radioOnNs(recs(), 'anchor-1', PLAN.blockNs)
    expect(tagRatio.toFixed(1)).toBe('10.3')
    expect(ancRatio.toFixed(1)).toBe('24.5')
    for (const r of [tagRatio, ancRatio]) expect(r).toBeGreaterThanOrEqual(10)
    expect(ancRatio).toBeGreaterThan(tagRatio)
  })

  it('the radio-on share of the block is 0.97 % for the phone and 1.22 % for the anchor', () => {
    const tag = radioOnNs(recs(), 'uwb-1', PLAN.blockNs)
    const anc = radioOnNs(recs(), 'anchor-1', PLAN.blockNs)
    expect(tag).toBe(1_934_334)
    expect(anc).toBe(2_448_546)
    expect(tag).toBe(FIG.radioOnNs)
    expect((tag / PLAN.blockNs * 100).toFixed(2)).toBe('0.97')
    expect((anc / PLAN.blockNs * 100).toFixed(2)).toBe('1.22')
    const rows: [string, string, string, string, string][] = [
      ['uwb-1', '1 of 10', '10 of 10', '1 934 334 ns', '0.97 %'],
      ['anchor-1', '3 of 10', '4 of 10 × 3', '2 448 546 ns', '1.22 %'],
    ]
    rows.forEach((row, i) => row.forEach((v, j) => expect(cell(0, i, j), `${row[0]} ${j}`).toBe(v)))
    expect(Number(rows[0][3].replace(/[\sn]|s$/g, ''))).toBe(tag)
    expect(Number(rows[1][3].replace(/[\sn]|s$/g, ''))).toBe(anc)
    // "barely one part in a hundred of the block", the picture's claim for the anchor
    expect(anc / PLAN.blockNs).toBeLessThan(0.013)
    // the other two tags pay the same to the nanosecond-or-so, and every anchor pays the same
    for (const t of TAGS) expect(Math.abs(radioOnNs(recs(), t, PLAN.blockNs) - tag), t).toBeLessThan(100)
    for (let i = 1; i <= ANCHORS; i++) {
      expect(Math.abs(radioOnNs(recs(), `anchor-${i}`, PLAN.blockNs) - anc), `anchor-${i}`).toBeLessThan(100)
    }
  })

  it('the phone’s radio time is its round’s airtime plus 13 ns of flight per reception', () => {
    // deeper: "它的 1 934 334 ns 恰好是这一轮的空口时间 1 934 230 ns，再加上它接收的八帧、
    //  每帧 13 ns 的飞行时间"
    const airtime = ofType(recs(), 'TX_START')
      .filter((r) => r.t < PLAN.roundNs)
      .reduce((sum, r) => sum + r.frame.txTimeNs, 0)
    expect(airtime).toBe(1_934_230)
    const rxCount = ofType(recs(), 'UWB_TS').filter((r) => r.node === 'uwb-1' && r.dir === 'rx' && r.t < PLAN.roundNs)
    expect(rxCount).toHaveLength(8)
    expect(radioOnNs(recs(), 'uwb-1', PLAN.blockNs)).toBe(airtime + 8 * 13)
    for (const s of ['1 934 230', '八帧', '13 ns']) expect(deeperProse(), s).toContain(s)
  })

  it('the anchor wakes four times in a ten-slot round: 816 180 ns in the first, 2 448 546 over three', () => {
    expect(radioOnNs(recs(), 'anchor-1', PLAN.roundNs)).toBe(816_180)
    const states = ofType(recs(), 'MAC_STATE').filter((r) => r.node === 'anchor-1' && r.t < PLAN.roundNs)
    expect(states.map((r) => `${r.t}:${r.state}`)).toEqual([
      '0:uwbWait', '13:rx', '206872:idle',
      '2000000:tx', '2181218:idle',
      '10000000:uwbWait', '10000013:rx', '10236616:idle',
      '12000000:tx', '12191474:idle',
    ])
    // deaf in the other anchors' slots: it never leaves idle there
    expect(states.filter((r) => r.state !== 'idle').map((r) => Math.floor(r.t / PLAN.slotNs)))
      .toEqual([0, 0, 1, 5, 5, 6])
    // the three rounds are not equal: the flight to each tag rounds differently, so the total is
    // the measured sum and not three times the first round. The prose says exactly that.
    const perRound = [0, 1, 2].map((k) =>
      radioOnNs(recs(), 'anchor-1', (k + 1) * PLAN.roundNs, k * PLAN.roundNs))
    expect(perRound).toEqual([816_180, 816_194, 816_172])
    expect(perRound.reduce((a, b) => a + b, 0)).toBe(2_448_546)
    expect(Math.max(...perRound) - Math.min(...perRound)).toBeLessThan(100)
    expect(perRound.some((v) => v !== perRound[0])).toBe(true)
    expect(deeperProse()).toContain('816 180 ns')
  })

  it('the observation is the phone’s own lane, in the figures the lane shows', () => {
    // "整轮二十毫秒里，它只在十个时隙的开头各醒一次，每次不到 0.24 ms；这些深色段加起来是
    //  1.93 ms，也就是整块 200 ms 的 0.97 %"
    const wakes = ofType(recs(), 'MAC_STATE')
      .filter((r) => r.node === 'uwb-1' && r.t < PLAN.roundNs && r.state !== 'idle')
    // ten slots, one wake-up each: the tag is either receiving or transmitting in every one
    expect(new Set(wakes.map((r) => Math.floor(r.t / PLAN.slotNs))).size).toBe(PLAN.slots)
    const longest = ofType(recs(), 'TX_START')
      .filter((r) => r.t < PLAN.roundNs)
      .reduce((m, r) => Math.max(m, r.frame.txTimeNs), 0)
    expect(longest / MS).toBeLessThan(0.24)
    expect((radioOnNs(recs(), 'uwb-1', PLAN.blockNs) / MS).toFixed(2)).toBe('1.93')
    expect(uwbSlotBudget.observe[0]).toContain('1.93 ms')
    expect(uwbSlotBudget.observe[0]).toContain('0.97 %')
  })
})

describe('uwb-slot-budget · the 0.5 ms variant', () => {
  it('the round falls to 5.0 ms, 40 rounds fit the block, and the fixes come at 5, 10 and 15 ms', () => {
    const vplan = roundPlan(uwbSlotBudget.variants![0].scenario().uwb!, ANCHORS)
    expect(vplan.slotNs).toBe(500_000)
    expect(vplan.roundNs).toBe(5 * MS)
    expect(vplan.slots).toBe(PLAN.slots)
    expect(vplan.blockNs).toBe(PLAN.blockNs)
    expect(vplan.roundsPerBlock).toBe(40)
    const vrows: [string, string, string, string, string][] = [
      ['2 400 RSTU · 2 ms', '20.0 ms', '10', '60 ms', '1 934 334 ns'],
      ['600 RSTU · 0.5 ms', '5.0 ms', '40', '15 ms', '1 934 334 ns'],
    ]
    vrows.forEach((row, i) => row.forEach((v, j) => expect(cell(1, i, j), `${row[0]} ${j}`).toBe(v)))
    expect(ofType(recs(0), 'UWB_ROUND_END').slice(0, 3).map((r) => `${r.node}@${r.t / MS}`))
      .toEqual(['uwb-1@5', 'uwb-2@10', 'uwb-3@15'])
    expect(ofType(recs(0), 'UWB_POSITION').filter((f) => f.block === 0).map((f) => `${f.node}@${f.t / MS}`))
      .toEqual(['uwb-1@5', 'uwb-2@10', 'uwb-3@15'])
    expect(ofType(recs(0), 'UWB_TIMEOUT')).toHaveLength(0)
    expect(fmtRecord(ofType(recs(0), 'UWB_ROUND')[0]))
      .toBe('uwb-1 UWB round 0 of block 0 (DS-TWR): 10 slots × 500.0 µs')
    // "The same ten frames, four times closer together"
    expect(ofType(recs(0), 'TX_START').filter((r) => r.t < vplan.roundNs).map((r) => `${r.node}/${r.frame.kind}`))
      .toEqual(ofType(recs(), 'TX_START').filter((r) => r.t < PLAN.roundNs).map((r) => `${r.node}/${r.frame.kind}`))
    expect(PLAN.slotNs / vplan.slotNs).toBe(4)
    expect(uwbSlotBudget.tryThis[0]).toContain('40 轮')
  })

  it('the radio-on total does not move: 1 934 334 ns, 0.97 %, on both scenes', () => {
    expect(radioOnNs(recs(0), 'uwb-1', PLAN.blockNs)).toBe(1_934_334)
    expect((radioOnNs(recs(0), 'uwb-1', PLAN.blockNs) / PLAN.blockNs * 100).toFixed(2)).toBe('0.97')
    expect(cell(1, 0, 4)).toBe(cell(1, 1, 4))
    for (const t of TAGS) {
      expect(radioOnNs(recs(0), t, PLAN.blockNs), t).toBe(radioOnNs(recs(), t, PLAN.blockNs))
      expect(Math.abs(radioOnNs(recs(0), t, PLAN.blockNs) - 1_934_334), t).toBeLessThan(100)
    }
    // the round's own share of the block is what moved: 10 % to 2.5 %
    const vplan = roundPlan(uwbSlotBudget.variants![0].scenario().uwb!, ANCHORS)
    expect((vplan.roundNs / vplan.blockNs * 100).toFixed(1)).toBe('2.5')
    // and the airtime of a round is identical, frame for frame
    const air = (rs: TLRecord[], until: number): number =>
      ofType(rs, 'TX_START').filter((r) => r.t < until).reduce((s, r) => s + r.frame.txTimeNs, 0)
    expect(air(recs(0), vplan.roundNs)).toBe(air(recs(), PLAN.roundNs))
  })
})

/**
 * The procedure §2 asks this half to carry: the minimum-slot rule, which is
 * engine-enforced and was prose in the parent. Each step is checked against the
 * function or the rule it names — `uwbFinalBytes`/`uwbPpduNs`, `uwbSlotFitNs`
 * with `UWB_SLOT_GUARD_NS`, the scenario schema's `min(300)` and multiple-of-3,
 * `clampField`, and `roundPlan`.
 */
describe('uwb-slot-budget · the procedure, step by step', () => {
  it('is a steps block on the main path, not in `deeper`, and in the order a slot is clamped', () => {
    expect(uwbSlotBudget.numbers!.filter((b) => b.kind === 'steps')).toHaveLength(1)
    expect((uwbSlotBudget.deeper ?? []).filter((b) => b.kind === 'steps')).toHaveLength(0)
    expect(steps().items).toHaveLength(6)
    for (const s of steps().items) expect(s.trim().length).toBeGreaterThan(0)
  })

  it('step 1: the longest frame of a DS round is the Final, 14 + 12N octets', () => {
    expect(uwbFinalBytes(ANCHORS)).toBe(14 + 12 * ANCHORS)
    expect(uwbFinalBytes(ANCHORS)).toBe(62)
    expect(uwbPpduNs(62)).toBe(236_603)
    // it really is the longest frame of this round, measured rather than asserted
    const longest = ofType(recs(), 'TX_START')
      .filter((r) => r.t < PLAN.roundNs)
      .reduce((m, r) => (r.frame.bytes > m.frame.bytes ? r : m))
    expect(longest.frame.kind).toBe('uwbFinal')
    expect(longest.frame.bytes).toBe(62)
    for (const s of ['14 + 12N', '62 字节', '236 603 ns']) expect(steps().items[0], s).toContain(s)
  })

  it('step 2: the capacity floor is that frame plus the 200 ns guard', () => {
    expect(uwbSlotFitNs(ANCHORS)).toBe(uwbPpduNs(uwbFinalBytes(ANCHORS)) + UWB_SLOT_GUARD_NS)
    expect(uwbSlotFitNs(ANCHORS)).toBe(236_803)
    // "合 285 RSTU 还多一点": 285 RSTU is 237 500 ns, which clears it by 697 ns
    expect(rstuNs(285)).toBeGreaterThan(uwbSlotFitNs(ANCHORS))
    expect(rstuNs(282)).toBeLessThan(uwbSlotFitNs(ANCHORS))
    for (const s of ['200 ns', '236 803 ns', '285 个 RSTU']) expect(steps().items[1], s).toContain(s)
  })

  it('step 6: the block length does not move, so the rounds per block do', () => {
    // round = slots × slot, rounds per block = block ÷ round (src/uwb/session.ts)
    const vplan = roundPlan(uwbSlotBudget.variants![0].scenario().uwb!, ANCHORS)
    expect(PLAN.slots).toBe(uwbSlotsPerTag(SESSION.method, ANCHORS))
    expect(PLAN.roundNs).toBe(PLAN.slots * PLAN.slotNs)
    expect(vplan.roundNs).toBe(vplan.slots * vplan.slotNs)
    expect(PLAN.roundsPerBlock).toBe(PLAN.blockNs / PLAN.roundNs)
    expect(vplan.blockNs).toBe(PLAN.blockNs)
    expect(vplan.roundsPerBlock).toBe(4 * PLAN.roundsPerBlock)
    expect(steps().items[5]).toContain('十轮变四十轮')
  })
})

/**
 * The `timing` figure §4 asks of this lesson (2 ms 与 0.5 ms 两种时隙；分到手 vs
 * 射频真开着). Until the controller registers the lesson, diagram.test.ts cannot
 * see it, so its geometry is checked here by the same two rules that file uses.
 */
describe('uwb-slot-budget · the figure', () => {
  const fig = (): TimingSpec => {
    const b = uwbSlotBudget.picture!.find((x): x is Extract<Block, { kind: 'diagram' }> => x.kind === 'diagram')!
    expect(b.spec.kind).toBe('timing')
    return b.spec as TimingSpec
  }

  it('is one figure, on the main path, after the paragraph about the radio bill', () => {
    expect(uwbSlotBudget.picture!.filter((b) => b.kind === 'diagram')).toHaveLength(1)
    expect((uwbSlotBudget.numbers ?? []).filter((b) => b.kind === 'diagram')).toHaveLength(0)
    const at = uwbSlotBudget.picture!.findIndex((b) => b.kind === 'diagram')
    expect(at).toBe(uwbSlotBudget.picture!.length - 1)
    // 空口时间（airtime）is named in the paragraph above it, because a figure's labels and its
    // caption are graded prose and come after it in the reader's order
    expect(uwbSlotBudget.picture![at - 1])
      .toMatchObject({ text: expect.stringContaining('空口时间（airtime）') })
  })

  it('both rows are the same ten frames, at the two slot lengths, to scale', () => {
    const lanes = fig().lanes
    expect(lanes.map((l) => l.label)).toEqual(['2 ms 时隙', '0.5 ms 时隙'])
    expect(FIG.slotUs * 1000).toBe(PLAN.slotNs)
    expect(FIG.shortSlotUs * 1000).toBe(roundPlan(uwbSlotBudget.variants![0].scenario().uwb!, ANCHORS).slotNs)
    const tx = ofType(recs(), 'TX_START').filter((r) => r.t < PLAN.roundNs)
    expect(tx).toHaveLength(GRID.frames.length)
    for (const [lane, slotUs] of [[lanes[0], FIG.slotUs], [lanes[1], FIG.shortSlotUs]] as const) {
      // two spans a frame: the pale slot box, then the dark frame on top of it
      expect(lane.spans).toHaveLength(2 * tx.length)
      tx.forEach((r, i) => {
        const box = lane.spans[2 * i]
        const frame = lane.spans[2 * i + 1]
        expect((box.toUs - box.fromUs), `${lane.label} box ${i}`).toBe(slotUs)
        expect(box.fromUs, `${lane.label} box ${i}`).toBe(i * slotUs)
        expect(box.tone, `${lane.label} box ${i}`).toBeUndefined()
        expect(frame.fromUs, `${lane.label} frame ${i}`).toBe(i * slotUs)
        expect(Math.abs((frame.toUs - frame.fromUs) * 1000 - r.frame.txTimeNs), `${lane.label} frame ${i}`)
          .toBeLessThan(1)
        expect(frame.tone).toBe('accent')
      })
    }
    // the dark part of the two rows is the same total, which is the caption's own claim
    const dark = (lane: TimingSpec['lanes'][number]): number =>
      lane.spans.filter((s) => s.tone === 'accent').reduce((n, s) => n + (s.toUs - s.fromUs), 0)
    expect(dark(lanes[1])).toBeCloseTo(dark(lanes[0]), 9)
    expect(Math.round(dark(lanes[0]) * 1000)).toBe(1_934_230)
    expect(fig().axis).toEqual({ fromUs: 0, toUs: FIG.windowUs, ticks: [0, 10_000, 20_000], unit: 'µs' })
    expect(FIG.windowUs * 1000).toBe(PLAN.roundNs)
  })

  it('the caption quotes the radio-on total, and it is the run’s own', () => {
    const cap = uwbSlotBudget.picture!
      .find((b): b is Extract<Block, { kind: 'diagram' }> => b.kind === 'diagram')!.caption!
    expect(cap).toContain('1 934 334 ns')
    expect(radioOnNs(recs(), 'uwb-1', PLAN.blockNs)).toBe(1_934_334)
    expect(cap).toContain('0.5 ms')
    expect(cap).toContain('5 ms')
  })

  it('lays out inside the viewBox with no two labels touching', () => {
    const { width, height, shapes } = layoutDiagram(uwbSlotBudgetTiming())
    expect(width).toBe(240)
    expect(height).toBeGreaterThan(20)
    const ts = shapes.filter((s): s is Extract<Shape, { s: 'text' }> => s.s === 'text')
    for (const t of ts) {
      const b = textBox(t)
      expect(b.x0, t.text).toBeGreaterThanOrEqual(0)
      expect(b.x1, t.text).toBeLessThanOrEqual(width)
      expect(b.y0, t.text).toBeGreaterThanOrEqual(0)
      expect(b.y1, t.text).toBeLessThanOrEqual(height)
      // the legibility floor diagram.test.ts pins: 9.5 viewBox units at the narrow end
      expect(t.size * (200 / 240), t.text).toBeGreaterThanOrEqual(7.9)
    }
    for (let i = 0; i < ts.length; i++) {
      for (let j = i + 1; j < ts.length; j++) {
        const a = textBox(ts[i])
        const b = textBox(ts[j])
        const hit = a.x0 + 0.5 < b.x1 && b.x0 + 0.5 < a.x1 && a.y0 + 0.5 < b.y1 && b.y0 + 0.5 < a.y1
        expect(hit, `"${ts[i].text}" overlaps "${ts[j].text}"`).toBe(false)
      }
    }
  })
})
