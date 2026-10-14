/**
 * Every empirical claim in "轮流发，还是穿插发": the two round shapes and what each one costs, the
 * fragment gap inside one column, what the fixed reply time removes and what it brings forward, and
 * that a reversed round ranges this room rather than orbit.
 *
 * The layout figures come from `mmsLayout` itself and the schedule figures are read off runs of the
 * lesson's own four scenes. The 65.9 km of the reversed order's previous life is deliberately NOT
 * asserted here — it cannot be reproduced any more, which is the point — and `deeper` says so;
 * tests/uwb/mms-reversed.test.ts is where that history is recorded.
 */
import { describe, it, expect } from 'vitest'
import {
  SUBROUND_ANCHORS, SUBROUND_RESPONDERS, SUBROUND_SLOT_RSTU, SUBROUND_TAG_X, SUBROUND_Z,
  uwbSubrounds, uwbSubroundsScenario, uwbSubroundsTiming,
} from '../../src/course/uwb/uwb-subrounds'
import { ScenarioSchema, UwbMmsSchema, type Scenario } from '../../src/model/scenario'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import {
  MMS_FIXED_REPLY_RSTU_DEFAULT, MMS_FIXED_REPLY_RSTU_MAX, MMS_FIXED_REPLY_RSTU_MIN,
  MMS_REVERSED_OFFSET_RSTU, MS_RSTU, rsfNs,
} from '../../src/uwb/mms'
import { roundPlan, rstuNs } from '../../src/uwb/session'
import { rctuToMetres } from '../../src/uwb/ranging'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { zhNumeral } from './coverage'
import { rsfChips } from '../../src/uwb/mms'
import { fmtRecord } from '../../src/ui/format'

const MS = 1_000_000
/** One 200 ms ranging block: long enough for a 43 ms non-interleaved round and its report phase. */
const BLOCK_NS = 200 * MS

lessonShapeSuite(uwbSubrounds, { runNs: 60 * MS })

const INTERLEAVED = 0
const FIXED = 1
const REVERSED = 2

/** The round plan of one of the lesson's own scenes, for the three anchors it holds. */
const planOf = (variant: Parameters<typeof uwbSubroundsScenario>[0]) =>
  roundPlan(uwbSubroundsScenario(variant).uwb!, SUBROUND_RESPONDERS)

describe('uwb-subrounds · where it sits, and what its scenes are', () => {
  it('closes the UWB-driven trio and needs the first of it', () => {
    expect(MODULES[uwbSubrounds.module].title).toBe('另一种控制面与子轮')
    expect(COURSE_ORDER.indexOf('uwb-subrounds')).toBe(COURSE_ORDER.indexOf('uwb-acquisition') + 1)
    expect(COURSE_ORDER.indexOf('uwb-subrounds')).toBeLessThan(COURSE_ORDER.indexOf('uwb-capstone'))
    expect(uwbSubrounds.needs).toEqual(['uwb-uwbd', 'uwb-slot-budget'])
  })

  it('has four legal scenes, all on Config 1 with no control phase', () => {
    const all: Scenario[] = [uwbSubrounds.scenario(), ...uwbSubrounds.variants!.map((v) => v.scenario())]
    expect(all).toHaveLength(4)
    for (const sc of all) {
      expect(() => ScenarioSchema.parse(sc)).not.toThrow()
      expect([sc.uwb!.mms.control, sc.uwb!.mms.uwbdControl]).toEqual(['uwbd', 'none'])
      expect(sc.uwb!.slotRstu).toBe(SUBROUND_SLOT_RSTU)
    }
    expect(uwbSubroundsScenario('base').uwb!.mms.nonInterleaved).toBe(true)
    expect(uwbSubroundsScenario('interleaved').uwb!.mms.nonInterleaved).toBe(false)
    expect(uwbSubroundsScenario('reversed').uwb!.mms.reversedOrder).toBe(true)
    expect(uwbSubroundsScenario('fixed').uwb!.mms.fixedReplyRstu).toBe(MMS_FIXED_REPLY_RSTU_DEFAULT)
  })

  it('makes the fixed-reply scene pairwise, because the schema refuses it one-to-many', () => {
    const fixed = uwbSubroundsScenario('fixed').uwb!.mms
    expect(fixed.oneToMany).toBe(false)
    expect(UwbMmsSchema.safeParse({ ...fixed, oneToMany: true }).success).toBe(false)
    expect(UwbMmsSchema.safeParse({ ...fixed, reversedOrder: true }).success).toBe(false)
    expect(UwbMmsSchema.safeParse({ ...fixed, nonInterleaved: false }).success).toBe(false)
    // The bounds the deeper section quotes.
    expect([MMS_FIXED_REPLY_RSTU_MIN, MMS_FIXED_REPLY_RSTU_MAX]).toEqual([300, 612_000])
    expect(MMS_FIXED_REPLY_RSTU_DEFAULT).toBe(600)
    expect(MMS_REVERSED_OFFSET_RSTU).toBe(600)
  })

  it('lines the three anchors up 3 m apart on the tag’s own line', () => {
    const sc = uwbSubroundsScenario('base')
    const tag = sc.nodes.find((n) => n.id === 'tag-1')!
    for (const a of SUBROUND_ANCHORS) {
      const n = sc.nodes.find((x) => x.id === a.id)!
      expect([n.pos.y, n.pos.z]).toEqual([tag.pos.y, SUBROUND_Z])
    }
    expect(SUBROUND_ANCHORS.map((a) => a.x - SUBROUND_TAG_X)).toEqual([3, 6, 9])
  })
})

// --- the table of the two shapes ----------------------------------------------------------------

describe('uwb-subrounds · the two shapes, slot for slot', () => {
  it('is 1 sub-round of 32 slots against 4 of 20, and 38 slots against 86', () => {
    const inter = planOf('interleaved').mms!.layout
    const non = planOf('base').mms!.layout
    expect([inter.subRounds, inter.rpSlots, inter.reportSlots, inter.slots]).toEqual([1, 32, 6, 38])
    expect([non.subRounds, non.rpSlots, non.reportSlots, non.slots]).toEqual([4, 20, 6, 86])
    expect(planOf('interleaved').slots).toBe(38)
    expect(planOf('base').slots).toBe(86)
    // …which at 600 RSTU is 19 ms against 43 ms.
    expect(38 * rstuNs(SUBROUND_SLOT_RSTU)).toBe(19 * MS)
    expect(86 * rstuNs(SUBROUND_SLOT_RSTU)).toBe(43 * MS)
  })

  it('holds the fragment gap at one millisecond, where interleaved stretches it to two', () => {
    const inter = planOf('interleaved').mms!.layout
    const non = planOf('base').mms!.layout
    expect(inter.fragGapSlots).toBe(SUBROUND_RESPONDERS + 1)
    expect(non.fragGapSlots).toBe(Math.ceil(MS_RSTU / SUBROUND_SLOT_RSTU))
    expect(inter.fragGapSlots * rstuNs(SUBROUND_SLOT_RSTU)).toBe(2 * MS)
    expect(non.fragGapSlots * rstuNs(SUBROUND_SLOT_RSTU)).toBe(1 * MS)
    // The formula block: the interleaved gap counts devices, the non-interleaved one milliseconds.
    expect(MS_RSTU).toBe(1200)
  })

  it('spaces the tag’s own fragments accordingly on the air', () => {
    const gaps = (variant?: number): number[] => {
      const ts = runOf(uwbSubrounds, variant, BLOCK_NS)
        .filter((r) => r.type === 'TX_START' && r.frame.kind === 'uwbRsf' && r.node === 'tag-1')
        .map((r) => r.t)
        .slice(0, 8)
      return ts.slice(1).map((t, i) => t - ts[i])
    }
    expect(gaps()).toEqual(Array.from({ length: 7 }, () => 1 * MS))
    expect(gaps(INTERLEAVED)).toEqual(Array.from({ length: 7 }, () => 2 * MS))
    // …so one column of eight spans 7 ms against 14 ms.
    expect(gaps().reduce((a, b) => a + b, 0)).toBe(7 * MS)
    expect(gaps(INTERLEAVED).reduce((a, b) => a + b, 0)).toBe(14 * MS)
  })

  it('still gives six distances a block in either shape, and ranges the room it is in', () => {
    for (const v of [undefined, INTERLEAVED, REVERSED]) {
      const ranges = ofType(runOf(uwbSubrounds, v, BLOCK_NS), 'UWB_RANGE')
      expect(ranges, String(v)).toHaveLength(6)
      for (const r of ranges) {
        expect(Math.abs(r.distM - r.trueDistM), `${String(v)} ${r.node}→${r.peer}`).toBeLessThan(0.5)
      }
      expect([...new Set(ranges.map((r) => r.trueDistM.toFixed(0)))].sort()).toEqual(['3', '6', '9'])
    }
  })
})

// --- what the fixed reply time removes ----------------------------------------------------------

describe('uwb-subrounds · the fixed reply time', () => {
  const sp0Of = (variant?: number) => runOf(uwbSubrounds, variant, BLOCK_NS)
    .filter((r) => r.type === 'TX_START' && r.frame.kind === 'uwbSp0')

  it('drops the responder’s REPORT, so a round carries one control packet instead of two', () => {
    // The pairwise non-interleaved round is the comparison — the fixed-reply scene's own shape
    // with the option off — and both run three rounds in the block.
    const plain = uwbSubroundsScenario('fixed')
    const off = ScenarioSchema.parse({
      ...plain,
      uwb: { ...plain.uwb!, mms: { ...plain.uwb!.mms, fixedReplyRstu: null } },
    })
    const offSp0 = [...new Simulation(off).runUntil(BLOCK_NS).records]
      .filter((r) => r.type === 'TX_START' && r.frame.kind === 'uwbSp0')
    expect(offSp0).toHaveLength(6)
    expect(sp0Of(FIXED)).toHaveLength(3)
    // Only the initiator's REPORT is left, and it is the one the responder ranges off.
    expect(new Set(sp0Of(FIXED).map((r) => (r.type === 'TX_START' ? r.node : '')))).toEqual(new Set(['tag-1']))
  })

  it('brings the initiator’s range forward, out of the report phase entirely', () => {
    const mine = ofType(runOf(uwbSubrounds, FIXED, BLOCK_NS), 'UWB_RANGE')
      .filter((r) => r.node === 'tag-1' && r.peer === 'anchor-1')
    expect(mine).toHaveLength(1)
    expect(mine[0].t).toBe(17_500_000)
    // The report phase of that round opens at slot 40 — 20 ms — so the range beat it by 2.5 ms.
    const l = planOf('fixed').mms!.layout
    expect(l.reportSlot('responder', 0) * rstuNs(SUBROUND_SLOT_RSTU)).toBe(20 * MS)
    // …and the window the responder no longer answers in is still opened, harmlessly.
    expect(ofType(runOf(uwbSubrounds, FIXED, BLOCK_NS), 'UWB_TIMEOUT')
      .some((r) => r.node === 'tag-1' && r.peer === 'anchor-1' && r.t === 20_500_000)).toBe(true)
  })

  it('shortens the turnaround, so the uncorrected figure falls from 19.89 m to 3.96 m', () => {
    const fixed = ofType(runOf(uwbSubrounds, FIXED, BLOCK_NS), 'UWB_RANGE')
      .find((r) => r.node === 'tag-1' && r.peer === 'anchor-1')!
    expect(rctuToMetres(fixed.tofRawRctu!)).toBeCloseTo(3.96, 2)
    expect(fixed.distM).toBeCloseTo(3.12, 2)
    expect(fixed.trueDistM).toBeCloseTo(3, 6)
    // Both ends still range, which is the whole point of the option.
    const ends = new Set(ofType(runOf(uwbSubrounds, FIXED, BLOCK_NS), 'UWB_RANGE')
      .filter((r) => r.peer === 'anchor-1' || r.node === 'anchor-1').map((r) => r.node))
    expect([...ends].sort()).toEqual(['anchor-1', 'tag-1'])
  })
})

// --- the figure ---------------------------------------------------------------------------------

describe('uwb-subrounds · the figure is the layout', () => {
  it('draws four lanes, one fragment a span, at the slots mmsLayout names', () => {
    const spec = uwbSubroundsTiming()
    const fragUs = rsfNs(40, 64) / 1000
    expect(spec.lanes).toHaveLength(4)
    // the tag's column in each shape, then all three anchors' in each
    expect(spec.lanes.map((l) => l.spans.length)).toEqual([8, 24, 8, 24])
    for (const l of spec.lanes) for (const s of l.spans) expect(s.toUs - s.fromUs).toBeCloseTo(fragUs, 6)
    // The interleaved tag column is 2 ms apart, the non-interleaved one 1 ms.
    const starts = (i: number) => spec.lanes[i].spans.map((s) => s.fromUs)
    expect(starts(0)).toEqual([0, 2000, 4000, 6000, 8000, 10_000, 12_000, 14_000])
    expect(starts(2)).toEqual([0, 1000, 2000, 3000, 4000, 5000, 6000, 7000])
    // …and the axis reaches the end of the longer of the two rounds' last fragment.
    const last = Math.max(...spec.lanes.flatMap((l) => l.spans.map((s) => s.toUs)))
    expect(spec.axis.toUs).toBeGreaterThanOrEqual(last)
    expect(spec.axis.fromUs).toBe(0)
  })
})

/**
 * **The lesson's two comparison tables, read back out of the lesson.**
 *
 * Everything above compares the engine with a literal written here, the lesson's row quoted in a
 * comment. `@uwb-subrounds` prints 43 hand-typed figures into its graded prose and was on the list
 * of lessons whose test never touched it (`tests/course/prose-readback.test.ts`). The figures were
 * all exact; this is the other half of each assertion.
 *
 * Two cells here are not numbers at all — 「都测得出」 twice in the last row of the second table —
 * and that is a claim about both ends ranging, which the option exists to preserve. It is read as
 * one rather than skipped, the same way `@amp-slots`' collided slot states no closing time.
 */
describe('uwb-subrounds · the two comparison tables are read back out of the lesson', () => {
  const rowsOf = (fragment: string): string[][] => {
    const b = uwbSubrounds.numbers!.find((x) => x.kind === 'table'
      && (x.heading ?? '').includes(fragment))
    expect(b, `no table whose heading contains 「${fragment}」`).toBeDefined()
    return (b as Extract<typeof b, { kind: 'table' }>).rows
  }
  const byLabel = (fragment: string, label: string): string[] => {
    const row = rowsOf(fragment).find((r) => r[0] === label)
    expect(row, `no row labelled 「${label}」 in the 「${fragment}」 table`).toBeDefined()
    return row!
  }
  const slotNs = rstuNs(SUBROUND_SLOT_RSTU)

  it('the two-shapes table: sub-rounds, both phases, the round, the gap and the span', () => {
    const inter = planOf('interleaved').mms!.layout
    const non = planOf('base').mms!.layout
    // column 1 is the interleaved shape, column 2 the non-interleaved one
    expect(Number(byLabel('两种排法', '子轮数')[1]), 'interleaved sub-rounds').toBe(inter.subRounds)
    expect(Number(byLabel('两种排法', '子轮数')[2]), 'non-interleaved sub-rounds').toBe(non.subRounds)

    const rp = byLabel('两种排法', '测距阶段')
    expect(Number(/^(\d+) 时隙$/.exec(rp[1])![1]), 'the interleaved ranging phase').toBe(inter.rpSlots)
    expect(Number(/^每子轮 (\d+) 时隙$/.exec(rp[2])![1]), 'and the non-interleaved one, per sub-round')
      .toBe(non.rpSlots)

    const rep = byLabel('两种排法', '报告阶段')
    expect([Number(/^(\d+)/.exec(rep[1])![1]), Number(/^(\d+)/.exec(rep[2])![1])],
      'the report phase, which the shape does not change').toEqual([inter.reportSlots, non.reportSlots])

    // 「38 时隙 · 19 ms」: both halves, and the second really is the first in milliseconds
    for (const [j, l] of [inter, non].entries()) {
      const cell = byLabel('两种排法', '一轮')[1 + j]
      const m = /^(\d+) 时隙 · (\d+) ms$/.exec(cell)
      expect(m, `the round cell 「${cell}」 is not 「n 时隙 · m ms」`).not.toBeNull()
      expect(Number(m![1]), 'the round in slots').toBe(l.slots)
      expect(Number(m![2]) * MS, 'and the same round in nanoseconds').toBe(l.slots * slotNs)
    }

    for (const [j, l] of [inter, non].entries()) {
      const cell = byLabel('两种排法', '相邻片段的间隔')[1 + j]
      const m = /^(\d+) 时隙 · (\d+) ms$/.exec(cell)
      expect(m, `the gap cell 「${cell}」 is not 「n 时隙 · m ms」`).not.toBeNull()
      expect(Number(m![1]), 'the fragment gap in slots').toBe(l.fragGapSlots)
      expect(Number(m![2]) * MS, 'and in nanoseconds').toBe(l.fragGapSlots * slotNs)
    }

    // the span of one column of eight, measured on the air rather than from the layout
    const gaps = (variant?: number): number[] => {
      const ts = runOf(uwbSubrounds, variant, BLOCK_NS)
        .filter((r) => r.type === 'TX_START' && r.frame.kind === 'uwbRsf' && r.node === 'tag-1')
        .map((r) => r.t).slice(0, 8)
      return ts.slice(1).map((t, i) => t - ts[i])
    }
    const span = byLabel('两种排法', '一列八个片段的跨度')
    expect(Number(/^(\d+) ms$/.exec(span[1])![1]) * MS, 'the interleaved span of eight')
      .toBe(gaps(INTERLEAVED).reduce((a, b) => a + b, 0))
    expect(Number(/^(\d+) ms$/.exec(span[2])![1]) * MS, 'and the non-interleaved one')
      .toBe(gaps().reduce((a, b) => a + b, 0))
    // the table's point: interleaving doubles the gap and doubles the span
    expect(Number(/^(\d+)/.exec(span[1])![1]), 'interleaved spans twice as long')
      .toBe(2 * Number(/^(\d+)/.exec(span[2])![1]))
  })

  it('the fixed-reply table: the RSTU it names, both ranges, and both corrected figures', () => {
    const head = (uwbSubrounds.numbers!.find((x) => x.kind === 'table'
      && (x.heading ?? '').includes('固定回复时间')) as { head: string[] }).head
    const rstu = /（(\d+) RSTU）/.exec(head[2])
    expect(rstu, 'the on-column heading no longer names the fixed reply time').not.toBeNull()
    const sc = uwbSubroundsScenario('fixed')
    expect(Number(rstu![1]), 'the RSTU the heading names, against the scene that sets it')
      .toBe(sc.uwb!.mms!.fixedReplyRstu)

    // **The 「off」 column is NOT the lesson's own scene.** It is this same pairwise scene with the
    // option switched off — four sub-rounds in the base scene would put the initiator's range at
    // 40.118 ms, not the 20.118 the table prints — so the comparison is built the way the
    // assertions above build it, from `fixed` with `fixedReplyRstu: null`.
    const offRecs = (): TLRecord[] => {
      const off = ScenarioSchema.parse({
        ...sc, uwb: { ...sc.uwb!, mms: { ...sc.uwb!.mms, fixedReplyRstu: null } },
      })
      return [...new Simulation(off).runUntil(BLOCK_NS).records]
    }
    const onRecs = (): TLRecord[] => runOf(uwbSubrounds, FIXED, BLOCK_NS)
    const sp0In = (rs: TLRecord[]): number =>
      rs.filter((r) => r.type === 'TX_START' && r.frame.kind === 'uwbSp0').length
    const perRound = byLabel('固定回复时间', '一轮里的 SP0 包')
    const rounds = 3
    expect(Number(/^(\d+)/.exec(perRound[1])![1]) * rounds, 'SP0 packets with the option off')
      .toBe(sp0In(offRecs()))
    expect(Number(/^(\d+)/.exec(perRound[2])![1]) * rounds, 'and with it on').toBe(sp0In(onRecs()))

    const when = byLabel('固定回复时间', '发起方何时得出距离')
    const mine = (rs: TLRecord[]) => ofType(rs, 'UWB_RANGE')
      .filter((r) => r.node === 'tag-1' && r.peer === 'anchor-1')[0]
    const off0 = mine(offRecs())
    const on0 = mine(onRecs())
    // three decimals of a millisecond, which is what the lesson prints
    const asMs = (t: number): number => Number((t / MS).toFixed(3))
    expect(Number(/^([\d.]+) ms$/.exec(when[1])![1]), 'when the initiator ranges with it off')
      .toBe(asMs(off0.t))
    expect(Number(/^([\d.]+) ms$/.exec(when[2])![1]), 'and with it on').toBe(asMs(on0.t))
    // the option's point: the range comes out earlier
    expect(on0.t, 'earlier with the option on').toBeLessThan(off0.t)

    const raw = byLabel('固定回复时间', '没修正过的那个距离')
    expect(Number(/^([\d.]+) m$/.exec(raw[1])![1]), 'the uncorrected figure with it off')
      .toBe(Number(rctuToMetres(off0.tofRawRctu!).toFixed(2)))
    expect(Number(/^([\d.]+) m$/.exec(raw[2])![1]), 'and with it on')
      .toBe(Number(rctuToMetres(on0.tofRawRctu!).toFixed(2)))

    const fixedRow = rowsOf('固定回复时间').find((r) => r[0].startsWith('修正后的距离'))!
    const truth = /真值 ([\d.]+) m/.exec(fixedRow[0])
    expect(truth, 'the corrected row no longer names the true distance in its label').not.toBeNull()
    expect(Number(truth![1]), 'the true distance the label names').toBe(off0.trueDistM)
    expect(Number(/^([\d.]+) m$/.exec(fixedRow[1])![1]), 'the corrected figure with it off')
      .toBe(Number(off0.distM.toFixed(2)))
    expect(Number(/^([\d.]+) m$/.exec(fixedRow[2])![1]), 'and with it on')
      .toBe(Number(on0.distM.toFixed(2)))

    // the last row is two words, not two numbers, and it is the claim the option rests on
    const both = byLabel('固定回复时间', '两端都测得出吗')
    expect([both[1], both[2]], 'the lesson says both ends range either way')
      .toEqual(['都测得出', '都测得出'])
    for (const [name, rs] of [['off', offRecs()], ['on', onRecs()]] as [string, TLRecord[]][]) {
      const ends = new Set(ofType(rs, 'UWB_RANGE')
        .filter((r) => r.peer === 'anchor-1' || r.node === 'anchor-1').map((r) => r.node))
      expect([...ends].sort(), `both ends really do range with the option ${name}`)
        .toEqual(['anchor-1', 'tag-1'])
    }
  })
})

/**
 * **Every other figure the prose prints, read back out of it.**
 *
 * The describe above converted the lesson's two comparison tables. This converts the rest — the
 * `picture` instants, the interval formula, the six-step table with its chip arithmetic, the
 * ranges `deeper` quotes for the fixed reply time, the three `observe` lines and the `tryThis`
 * pair. `@uwb-subrounds` was on the list of lessons an earlier sweep never reached: it was
 * planted by hand when it was written and the instrument has never walked it figure by figure.
 *
 * **The reads worth naming:**
 *
 *  - **three different constants in this lesson are all 600 RSTU**, and the prose prints each of
 *    them twice or more: the slot length every figure is counted in, the reversed-order offset,
 *    and the default fixed reply time. Each printing is read against its own constant, so a
 *    change to one of the three cannot be absorbed by the other two.
 *  - **the chip arithmetic is checked as arithmetic.** 「40 × 4 × (128 + 2 × 64) = 40 960 chips」
 *    has all six figures parsed out of the cell: the product has to equal what `rsfChips` gives
 *    for the session's own train, and the two it names (`nMsr`, `gap`) have to be that session's.
 *  - **「1 ns 的飞行时间误差约合 30 cm」 is read as physics**, not as a quotation: the two figures
 *    are parsed out and one has to give the other at the speed of light.
 *  - **the two log lines are taken off `fmtRecord`**, so the words a reader searches the event
 *    log for are the words the engine prints.
 *
 * **Two figures are exempt, class (a), and the lesson itself is the argument**: the 65 877.04 m
 * and 65 898.41 m in `deeper` are readings from before a fix, and the prose says so in the same
 * breath (「这两个数是修好之前读下来的，今天的仿真里跑不出来」). What is measured instead is the
 * thing that sentence exists to contrast them with — that the same scene ranges correctly today,
 * and that the record whose `trueDistM` it quotes still says 3.
 */
describe('uwb-subrounds · every other figure the prose prints, read back out of it', () => {
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
  const TERMS = blockText(uwbSubrounds.terms)
  const PIC = blockText(uwbSubrounds.picture)
  const NUMS = blockText(uwbSubrounds.numbers)
  const DEEP = blockText(uwbSubrounds.deeper)
  const SRC = blockText(uwbSubrounds.sources)
  const LIM = blockText(uwbSubrounds.limits)
  const OBS = blockText(uwbSubrounds.observe)
  const TRY = blockText(uwbSubrounds.tryThis)
  const QUIZ = blockText(uwbSubrounds.quiz)
  const ALL = [TERMS, PIC, NUMS, DEEP, SRC, LIM, OBS, TRY, QUIZ].join('\n')

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const m = re.exec(text)
    expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const every = (text: string, re: RegExp, what: string, want: number): string[][] => {
    const ms = [...text.matchAll(re)]
    expect(ms.length, `${what}: the lesson prints this ${ms.length} times, not ${want}`).toBe(want)
    return ms.map((m) => m.slice(1))
  }
  /** A figure READ off the lesson against a measurement, at the precision it was printed to. */
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const occ = (text: string, needle: string): number => text.split(needle).length - 1
  const zh = (x: string): number => {
    const n = zhNumeral(x.replace(/两/g, '二'))
    expect(n, `「${x}」 is not a Chinese numeral this test can read`).not.toBeNull()
    return n!
  }
  const slotNs = rstuNs(SUBROUND_SLOT_RSTU)
  /** The lesson's own scene, by variant, over one block. */
  const recs = (v?: number): TLRecord[] => runOf(uwbSubrounds, v, BLOCK_NS)
  /**
   * The tag's own first column of fragments, in order — `rsfs` of them, which is what both the
   * watch call-out and the caption are talking about. A 200 ms block holds the next round's
   * opening fragments too, and taking the whole run would measure the block instead of a column.
   */
  const tagColumn = (v?: number): number[] => ofType(recs(v), 'TX_START')
    .filter((r) => r.frame.kind === 'uwbRsf' && r.node === 'tag-1')
    .map((r) => r.t)
    .slice(0, uwbSubroundsScenario('base').uwb!.mms!.rsfs)
  const mms = uwbSubroundsScenario('base').uwb!.mms!
  /** The uncorrected figure a range record carries, in metres. */
  const rctoM = (r: Extract<TLRecord, { type: 'UWB_RANGE' }>): number => rctuToMetres(r.tofRawRctu!)

  it('reads each printing of 600 RSTU against the constant that printing means', () => {
    // The slot every figure in the lesson is counted in.
    for (const [rstu] of every(PIC, /(\d+) RSTU(?:（ranging slot time unit）的时隙上| 上就是)/g,
      'the slot length, printed twice in `picture`', 2)) {
      same(rstu!, SUBROUND_SLOT_RSTU, 'the slot length the lesson counts in')
    }
    expect(uwbSubroundsScenario('base').uwb!.slotRstu, 'which is the scene’s own slot')
      .toBe(SUBROUND_SLOT_RSTU)
    // The reversed-order offset: the term, `deeper` and `sources`.
    for (const [rstu] of every(ALL, /(?:发起方(?:自进入测距阶段起)?隔 |它那 )(\d+) RSTU(?: 再发| 的偏移)/g,
      'the reversed-order offset, printed three times', 3)) {
      same(rstu!, MMS_REVERSED_OFFSET_RSTU, 'the offset the reversed order puts between the two')
    }
    // The default fixed reply time: once in `deeper`, once in `sources`.
    same(raw(DEEP, /默认 (\d+) RSTU/, '`deeper` on the default')[0]!,
      MMS_FIXED_REPLY_RSTU_DEFAULT, 'the default fixed reply time')
    same(raw(SRC, /与 (\d+) RSTU 的默认值/, '`sources` on the same default')[0]!,
      MMS_FIXED_REPLY_RSTU_DEFAULT, 'the default fixed reply time, in `sources`')
    // And the three really are three constants, not one printed six times.
    expect(new Set([SUBROUND_SLOT_RSTU, MMS_REVERSED_OFFSET_RSTU, MMS_FIXED_REPLY_RSTU_DEFAULT]).size,
      'they all happen to be 600, which is why each site is read against its own').toBe(1)
  })

  it('reads the two bit positions as the claim they are part of: one octet, two bits', () => {
    /*
     * **The 「第」 rule change of 2026-10-14 uncovered these four sites, and they are a draft
     * figure with no corpus — but the SENTENCE around them is arithmetic.** 「草案把这两位放在
     * 同一个八位组里（…的第 6 位与第 7 位），并没有禁止同时置位」 claims exactly two things a
     * test can check: the two positions are different (or 「两位」 is one bit written twice), and
     * they fall in the same octet (or 「同一个八位组」 is false). The planter moves the last
     * digit, so 6 → 7 collapses them and 7 → 8 moves one into the next octet: both halves of the
     * sentence are load-bearing, and both are now read. The pair is also printed in `sources`,
     * and the two printings are read together, so one cannot be corrected alone.
     */
    const pairs = every(ALL, /第 (\d+) 位与第 (\d+) 位/g,
      'the two bit positions, printed in `deeper` and in `sources`', 2)
    for (const [a, b] of pairs) {
      const [lo, hi] = [Number(a), Number(b)]
      expect(hi, `「第 ${a} 位与第 ${b} 位」: 「两位」 means two different bits`).not.toBe(lo)
      expect(Math.floor(hi / 8), `「第 ${a} 位与第 ${b} 位」: and 「同一个八位组」 means one octet`)
        .toBe(Math.floor(lo / 8))
    }
    expect(pairs[0], 'the same pair in both places, in the same order').toEqual(pairs[1])
  })

  it('reads the tag’s column and the first anchor’s off the air', () => {
    const ts = tagColumn()
    const [from, to] = figs(PIC, /标签的八个片段在 (\d+) 到 (\d+) ms 之间发完/,
      'the watch call-out on the tag’s column')
    expect(ts.length, 'the fragments of one column').toBe(mms.rsfs)
    same(String(from), ts[0]! / MS, 'where the tag’s column starts')
    same(String(to), ts[ts.length - 1]! / MS, 'and where its last fragment goes out')
    // The sub-round boundary: the first fragment an anchor sends.
    const first = recs().find((r) => r.type === 'TX_START' && r.frame.kind === 'uwbRsf'
      && r.node !== 'tag-1')!
    same(raw(PIC, /([\d.]+) ms 第一个锚点才开始发/, 'the first anchor’s own start')[0]!, first.t / MS,
      'when the second sub-round opens')
    // 「整整两毫秒没有人发送」, in characters, against the gap the two instants leave.
    const quiet = zh(raw(PIC, /然后整整(.+?)毫秒没有人发送/, 'the silence between the two columns')[0]!)
    /*
     * **Counted in fragment positions, which is what the sentence means.** The tag's last
     * fragment goes out at 7 ms and the first anchor's at 10, so the wall-clock silence is 2.92 ms
     * — and 「整整两毫秒没有人发送」 is the two millisecond positions, 8 and 9, in which no
     * fragment is sent at all. Both readings are asserted: the empty positions exactly, and the
     * silence as the inequality the adverb 「整整」 makes of it.
     */
    const gapNs = planOf('base').mms!.layout.fragGapSlots * slotNs
    expect((first.t - ts[ts.length - 1]!) / gapNs - 1, 'the millisecond positions nobody sends in')
      .toBe(quiet)
    expect(first.t - ts[ts.length - 1]! - rsfNs(mms.nMsr, mms.gap), 'and the air really is free that long')
      .toBeGreaterThan(quiet * gapNs)
  })

  it('reads the diagram caption’s four figures, which are written in characters', () => {
    const cap = (uwbSubrounds.picture!.find((b) => b.kind === 'diagram') as { caption: string }).caption
    const inter = planOf('interleaved').mms!.layout
    const non = planOf('base').mms!.layout
    const [gap, interSpan, nonSpan, round] = raw(cap,
      /相邻两个片段隔(.+?)毫秒，一列拉到(.+?)毫秒；非交织时紧成一毫秒一个，一列只占(.+?)毫秒，代价是四列排成一队，整轮(.+?)毫秒/,
      'the caption on the four figures it compares')
    expect(zh(gap!) * MS, 'the interleaved fragment gap, in the caption').toBe(inter.fragGapSlots * slotNs)
    const span = (v?: number): number => {
      const ts = tagColumn(v)
      return ts[ts.length - 1]! - ts[0]!
    }
    expect(zh(interSpan!) * MS, 'the interleaved span of one column').toBe(span(INTERLEAVED))
    expect(zh(nonSpan!) * MS, 'and the non-interleaved one').toBe(span())
    expect(zh(round!) * MS, 'the whole non-interleaved round').toBe(non.slots * slotNs)
    // The caption's own claim: the队 is four columns, one per device of the round.
    expect(SUBROUND_RESPONDERS + 1, 'the four columns the caption counts').toBe(non.subRounds)
  })

  it('reads the row the table read-back above leaves: the block in its label, and the six distances', () => {
    const row = (uwbSubrounds.numbers!.filter((b) => b.kind === 'table')[0] as { rows: string[][] })
      .rows.find((r) => r[0]!.includes('一块的距离数'))!
    same(raw(row[0]!, /每 (\d+) ms 一块/, 'the block length in the row’s own label')[0]!, BLOCK_NS / MS,
      'the block every figure of this lesson is measured in')
    // Both columns, measured: one round to a block, and six ranges out of it either way.
    for (const [j, v] of [INTERLEAVED, undefined].entries()) {
      const ranges = ofType(recs(v), 'UWB_RANGE').filter((r) => r.t < BLOCK_NS)
      expect(val(row[1 + j]!), `the distances a block gives in column ${j + 1}`).toBe(ranges.length)
    }
  })

  it('reads the row of the fixed-reply table the other read-back leaves', () => {
    /*
     * **The sweep of 2026-10-13 walked through this cell.** The describe above reads the
     * fixed-reply table row by row — but by the labels whose cells are numbers, and this row's
     * cells are sentences with a number inside them: 「自己子轮的边界，第 20 个时隙」 against
     * 「收完对方整个包之后 600 RSTU」. Both are figures, and both have an instrument.
     */
    const row = (uwbSubrounds.numbers!.filter((b) => b.kind === 'table')[1] as { rows: string[][] })
      .rows.find((r) => r[0]!.includes('从哪里起算'))!
    const non = planOf('base').mms!.layout
    expect(figs(row[1]!, /第 (\d+) 个时隙/, 'where the responder starts without the option')[0],
      'the slot its own sub-round opens in').toBe(non.rpSlots)
    same(raw(row[2]!, /收完对方整个包之后 (\d+) RSTU/,
      'where it starts with the option')[0]!, MMS_FIXED_REPLY_RSTU_DEFAULT,
      'the constant it waits out instead')
    expect(uwbSubroundsScenario('fixed').uwb!.mms!.fixedReplyRstu,
      'which is the one the scene sets').toBe(MMS_FIXED_REPLY_RSTU_DEFAULT)
  })

  it('reads the interval formula, both lines, out of the layout and the millisecond itself', () => {
    const f = uwbSubrounds.numbers!.find((b) => b.kind === 'formula') as { text: string; note: string }
    const inter = planOf('interleaved').mms!.layout
    const non = planOf('base').mms!.layout
    // 「交错：间隔 = (应答方数 + 1) × 时隙 = 4 × 500 µs = 2 000 µs」
    const [plus, slots, slotUs, totalUs] = figs(f.text,
      /交错：间隔 = \(应答方数 \+ (\d+)\) × 时隙 = (\d+) × ([\d ]+) µs = ([\d ]+) µs/,
      'the interleaved interval')
    expect(SUBROUND_RESPONDERS + plus!, 'the slots a millisecond is shared between').toBe(slots)
    expect(slots, 'which is the gap the layout gives').toBe(inter.fragGapSlots)
    same(String(slotUs), slotNs / 1000, 'the slot, in microseconds')
    expect(totalUs, 'and the product the line prints').toBe(slots! * slotUs!)
    // 「非交织：间隔 = ⌈1 200 RSTU / 时隙⌉ × 时隙 = 2 × 500 µs = 1 000 µs」
    const [msRstu, nonSlots, nonSlotUs, nonTotal] = figs(f.text,
      /非交织：间隔 = ⌈([\d ]+) RSTU \/ 时隙⌉ × 时隙 = (\d+) × ([\d ]+) µs = ([\d ]+) µs/,
      'the non-interleaved interval')
    expect(msRstu, 'the millisecond, in RSTU').toBe(MS_RSTU)
    expect(Math.ceil(msRstu! / SUBROUND_SLOT_RSTU), 'the slots that millisecond is').toBe(nonSlots)
    expect(nonSlots, 'which is the gap the layout gives').toBe(non.fragGapSlots)
    expect(nonTotal, 'and the product').toBe(nonSlots! * nonSlotUs!)
    // The whole point of the pair: the first depends on the room, the second does not.
    expect(inter.fragGapSlots, 'interleaved is the wider of the two').toBeGreaterThan(non.fragGapSlots)
  })

  it('reads the six-step table: the slots, the chips, the SP0 and the three distances', () => {
    const rows = (uwbSubrounds.numbers!.filter((b) => b.kind === 'table')[2] as { rows: string[][] }).rows
    /**
     * The second column of the row labelled `label` — **exact match first**. 「一个片段」 is a
     * suffix of 「发起方的第一个片段」, so an `includes` lookup reads the wrong row, and the
     * failure it gives is a regex that no longer matches rather than a wrong number.
     */
    const cell = (label: string): string =>
      (rows.find((r) => r[0] === label) ?? rows.find((r) => r[0]!.includes(label))!)[1]!
    const non = planOf('base').mms!.layout
    const ts = tagColumn()
    // 「第 0 个时隙 · 0.000 ms」
    const [slot0, ms0] = raw(cell('第一个片段'), /第 (\d+) 个时隙 · ([\d.]+) ms/, 'the first fragment’s slot')
    expect(val(slot0!), 'the slot the initiator starts in').toBe(0)
    same(ms0!, ts[0]! / MS, 'and the instant it starts at')
    // 「40 × 4 × (128 + 2 × 64) = 40 960 chips · 82.051 µs」
    const [nMsr, spread, len, two, gap, chips, us] = figs(cell('一个片段'),
      /(\d+) × (\d+) × \((\d+) \+ (\d+) × (\d+)\) = ([\d ]+) chips · ([\d.]+) µs/,
      'the chip arithmetic of one fragment')
    expect(nMsr! * spread! * (len! + two! * gap!), 'the arithmetic the cell prints').toBe(chips)
    expect(chips, 'against what the engine makes of this session’s own train')
      .toBe(rsfChips(mms.nMsr, mms.gap))
    expect(nMsr, 'the repetitions are this session’s').toBe(mms.nMsr)
    expect(gap, 'and so is the gap').toBe(mms.gap)
    expect(two, 'which the symbol carries on both sides of B').toBe(2)
    same(String(us), rsfNs(mms.nMsr, mms.gap) / 1000, 'the fragment’s own length')
    // 「第 20 个时隙 · 10.000 ms」 and 「第 80 个时隙 · 40.000 ms」
    const first = recs().find((r) => r.type === 'TX_START' && r.frame.kind === 'uwbRsf'
      && r.node !== 'tag-1')!
    const [slot20, ms20] = raw(cell('第一个应答方的子轮起点'), /第 (\d+) 个时隙 · ([\d.]+) ms/,
      'the first responder’s sub-round')
    expect(val(slot20!), 'the slot its sub-round opens in').toBe(non.rpSlots)
    same(ms20!, first.t / MS, 'and the instant it opens at')
    const [slot80, ms80] = raw(cell('四个子轮之后'), /第 (\d+) 个时隙 · ([\d.]+) ms/,
      'the end of the fourth sub-round')
    expect(val(slot80!), 'the slot the ranging phase ends in').toBe(non.subRounds * non.rpSlots)
    same(ms80!, (val(slot80!) * slotNs) / MS, 'and the instant that is')
    // 「6 时隙 · 每个 SP0 包 117.6 µs」
    const [repSlots, sp0Us] = raw(cell('报告阶段'), /(\d+) 时隙 · 每个 SP0 包 ([\d.]+) µs/,
      'the report phase')
    expect(val(repSlots!), 'the report slots').toBe(non.reportSlots)
    const sp0 = ofType(recs(), 'TX_START').find((r) => r.frame.kind === 'uwbSp0')!
    same(sp0Us!, sp0.frame.txTimeNs / 1000, 'the airtime of one SP0 packet')
    // 「3.01 / 6.01 / 8.91 m，真值 3 / 6 / 9 m」
    const got = raw(cell('三个距离与它们的真值'),
      /([\d.]+) \/ ([\d.]+) \/ ([\d.]+) m，真值 ([\d.]+) \/ ([\d.]+) \/ ([\d.]+) m/,
      'the three distances and their truths')
    const mine = SUBROUND_ANCHORS.map((a) => ofType(recs(), 'UWB_RANGE')
      .find((r) => r.node === 'tag-1' && r.peer === a.id)!)
    mine.forEach((r, i) => {
      same(got[i]!, r.distM, `the distance to ${SUBROUND_ANCHORS[i]!.id}`)
      same(got[3 + i]!, r.trueDistM, `and its true distance`)
      expect(r.trueDistM, 'which is the anchor’s own offset down the line')
        .toBe(SUBROUND_ANCHORS[i]!.x - SUBROUND_TAG_X)
    })
  })

  it('reads the harmless timeout as the event log prints it, both printings', () => {
    const timeout = ofType(recs(FIXED), 'UWB_TIMEOUT').find((r) => r.node === 'tag-1')!
    const line = fmtRecord(timeout)
    for (const [quoted] of every(ALL, /[“「](tag-1 UWB slot \d+: no sp0 from anchor-1)[”」]/g,
      'the timeout line, quoted twice', 2)) {
      expect(line, 'the line the engine prints, word for word').toBe(quoted)
    }
    // 「距离早在 17.500 ms 就出来了」, twice, against the range that record cannot affect.
    const range = ofType(recs(FIXED), 'UWB_RANGE')
      .find((r) => r.node === 'tag-1' && r.peer === 'anchor-1')!
    for (const [ms] of every(ALL, /距离早在 ([\d.]+) ms 就出来了/g, 'when the range came out, twice', 2)) {
      same(ms!, range.t / MS, 'when the initiator’s range came out')
    }
    expect(range.t, 'which really is before the window the engine kept open').toBeLessThan(timeout.t)
  })

  it('reads the fixed reply time’s own range, in RSTU and in milliseconds', () => {
    const [lo, hi] = figs(DEEP, /那个常量写在 (\d+) 到 ([\d ]+) RSTU 之间/, '`deeper` on the range')
    expect([lo, hi], 'the two bounds the engine enforces')
      .toEqual([MMS_FIXED_REPLY_RSTU_MIN, MMS_FIXED_REPLY_RSTU_MAX])
    const [loMs, hiMs] = raw(DEEP, /约合 ([\d.]+) 到 (\d+) ms/, '`deeper` on the same range in milliseconds')
    same(loMs!, rstuNs(lo!) / MS, 'the lower bound, in milliseconds')
    same(hiMs!, rstuNs(hi!) / MS, 'and the upper one')
    // `sources` prints the pair a second time.
    const [srcLo, srcHi] = figs(SRC, /它 (\d+)…([\d ]+) RSTU 的取值范围/, '`sources` on the range')
    expect([srcLo, srcHi], 'the same two bounds').toEqual([lo, hi])
    // The schema really does refuse one past each end, which is what makes them bounds.
    const sc = uwbSubroundsScenario('fixed')
    for (const bad of [lo! - 1, hi! + 1]) {
      expect(UwbMmsSchema.safeParse({ ...sc.uwb!.mms, fixedReplyRstu: bad }).success,
        `${bad} RSTU is outside the range the lesson prints`).toBe(false)
    }
    expect(UwbMmsSchema.safeParse({ ...sc.uwb!.mms, fixedReplyRstu: lo }).success,
      'and the lower bound itself is inside it').toBe(true)
  })

  it('reads what `deeper` says about the two historical figures, and what still holds', () => {
    /*
     * **Exempt, class (a), twice — and the lesson is the argument.** 65 877.04 m and 65 898.41 m
     * are readings from before the fix, and the sentence that prints them says so: 「这两个数是
     * 修好之前读下来的，今天的仿真里跑不出来」. There is no run in this repository that produces
     * them, by design. What the sentence contrasts them with is measured here instead.
     */
    const [modulus] = figs(DEEP, /自己整个 (\d+)⁴⁰ 的模数/, '`deeper` on the counter’s modulus')
    expect(modulus, 'the counter is binary, so its modulus is a power of two').toBe(2)
    const [truth] = figs(DEEP, /trueDistM 写着 (\d+)/, '`deeper` on the record’s own true distance')
    const rev = ofType(recs(REVERSED), 'UWB_RANGE')
      .find((r) => r.node === 'tag-1' && r.peer === 'anchor-1')!
    expect(rev.trueDistM, 'the true distance that record still carries').toBe(truth)
    // And the claim the history is told to contrast with: it ranges correctly today.
    expect(Math.abs(rev.distM - rev.trueDistM), 'the reversed order is within centimetres today')
      .toBeLessThan(0.2)
    for (const quoted of ['65 877.04', '65 898.41']) {
      expect(DEEP, `the exempt figure ${quoted} is still presented as history`).toContain(quoted)
    }
    expect(DEEP, 'with the sentence that is this exemption’s argument').toContain('今天的仿真里跑不出来')
  })

  it('reads `limits`: the draft’s name, the vote, and the nanosecond that is thirty centimetres', () => {
    // The draft's short name, which carries a figure: counted rather than measured.
    expect(occ(LIM, '4ab'), 'the draft’s name, printed twice in `limits`').toBe(2)
    expect(occ(ALL, '4ab'), 'and four times in the lesson, the two in `sources` included').toBe(4)
    /*
     * **The vote tally is pinned by occurrence, which is the only instrument a minute has.**
     * 「以 12/13/1 被否决」 is three figures out of `15-26/0425r0`, and this repository holds no
     * corpus of the minutes — so there is nothing to measure them against. What is still
     * checkable is that the string occurs exactly as often as the lesson means it to, and the
     * needle is written out here rather than built from the parsed figures: building it from
     * them would make the assertion true of whatever the lesson prints, which is how the sweep
     * of 2026-10-13 walked through two of the three. The semantic half is measured too — a
     * motion is rejected when the noes outnumber the ayes, which pins the first figure against
     * the second whatever the minute says.
     */
    expect(occ(LIM, '12/13/1 被否决'), 'the tally, cited exactly once').toBe(1)
    const [yes, no] = figs(LIM, /以 (\d+)\/(\d+)\/\d+ 被否决/, '`limits` on the vote')
    expect(no, 'a motion is rejected when the noes have it').toBeGreaterThan(yes!)
    // 「1 ns 的飞行时间误差约合 30 cm」: physics, read out of the sentence.
    const [ns, cm] = figs(LIM, /「(\d+) ns 的飞行时间误差约合 (\d+) cm」/, '`limits` on the draft’s own notice')
    expect(Math.round(ns! * 29.9792458), 'one nanosecond of flight, in centimetres').toBe(cm)
    // The interval rule the same entry names, in RSTU.
    const [msRstu] = figs(LIM, /一毫秒等于 ⌈([\d ]+) RSTU \/ 时隙⌉/, '`limits` on the interval rule')
    expect(msRstu, 'the millisecond, in RSTU').toBe(MS_RSTU)
  })

  it('reads the three observe lines off the log and the records', () => {
    // The round line, word for word, and the slot count the other shape puts there.
    const round = recs().find((r) => r.type === 'UWB_ROUND')!
    const [at, quoted] = raw(OBS, /([\d.]+) ms 那一行写着 “(.+?)”/, '`observe` on the round line')
    same(at!, round.t / MS, 'when the round line is printed')
    expect(fmtRecord(round), 'the round line, as the engine prints it').toBe(quoted)
    const interRound = recs(INTERLEAVED).find((r) => r.type === 'UWB_ROUND')!
    same(raw(OBS, /同一位置是 (\d+) 个时隙/, '`observe` on the interleaved round')[0]!,
      planOf('interleaved').mms!.layout.slots, 'the slots of the interleaved round')
    expect(fmtRecord(interRound), 'which is the number that line prints')
      .toContain(`${planOf('interleaved').mms!.layout.slots} slots`)
    // The three anchors' own evaluations, all at one instant.
    const trains = ofType(recs(), 'UWB_MMS_TRAIN').filter((r) => r.node !== 'tag-1')
    expect(new Set(trains.map((r) => r.t)).size, 'the three anchors decide together').toBe(1)
    same(raw(OBS, /三个锚点的判定都落在 ([\d.]+) ms/, '`observe` on the anchors’ evaluation')[0]!,
      trains[0]!.t / MS, 'when the three anchors decide')
    // The tag's own three, ten milliseconds apart.
    const own = ofType(recs(), 'UWB_MMS_TRAIN').filter((r) => r.node === 'tag-1')
    const [a, b, c] = raw(OBS, /分别在 ([\d.]+)、([\d.]+)、([\d.]+) ms/, '`observe` on the tag’s three')
    expect(own.length, 'one evaluation per anchor').toBe(SUBROUND_RESPONDERS)
    ;[a, b, c].forEach((printed, i) => same(printed!, own[i]!.t / MS, `the tag’s evaluation ${i + 1}`))
    const apart = zh(raw(OBS, /一个隔(.+?)毫秒/, '`observe` on the spacing between them')[0]!)
    expect(own[1]!.t - own[0]!.t, 'the spacing the line names').toBe(apart * MS)
    // The six ranges, all inside the report phase.
    const ranges = ofType(recs(), 'UWB_RANGE').filter((r) => r.t < BLOCK_NS)
    const [lo, hi] = raw(OBS, /六个距离全落在 ([\d.]+) 到 ([\d.]+) ms 之间/, '`observe` on the ranges')
    same(lo!, Math.min(...ranges.map((r) => r.t)) / MS, 'the first of the six')
    same(hi!, Math.max(...ranges.map((r) => r.t)) / MS, 'and the last')
    expect(ranges.length, 'six of them').toBe(2 * SUBROUND_RESPONDERS)
    // The three distances and their truths, printed a second time here.
    const got = raw(OBS, /三个距离依次是 ([\d.]+)、([\d.]+) 与 ([\d.]+) m，真值 (\d+)、(\d+)、(\d+) m/,
      '`observe` on the three distances')
    SUBROUND_ANCHORS.forEach((anc, i) => {
      const r = ofType(recs(), 'UWB_RANGE').find((x) => x.node === 'tag-1' && x.peer === anc.id)!
      same(got[i]!, r.distM, `the distance to ${anc.id}, in \`observe\``)
      same(got[3 + i]!, r.trueDistM, `and its truth`)
    })
  })

  it('reads the `tryThis` pair and the quiz’s two figures', () => {
    const off = ScenarioSchema.parse({
      ...uwbSubroundsScenario('fixed'),
      uwb: {
        ...uwbSubroundsScenario('fixed').uwb!,
        mms: { ...uwbSubroundsScenario('fixed').uwb!.mms, fixedReplyRstu: null },
      },
    })
    const offRange = ofType([...new Simulation(off).runUntil(BLOCK_NS).records], 'UWB_RANGE')
      .find((r) => r.node === 'tag-1' && r.peer === 'anchor-1')!
    const onRange = ofType(recs(FIXED), 'UWB_RANGE')
      .find((r) => r.node === 'tag-1' && r.peer === 'anchor-1')!
    const [was, now] = raw(TRY, /从 ([\d.]+) ms 提前到 ([\d.]+) ms/, '`tryThis` on the two instants')
    same(was!, offRange.t / MS, 'when the range came out with the option off')
    same(now!, onRange.t / MS, 'and with it on')
    expect(onRange.t, 'earlier, which is what 「提前」 claims').toBeLessThan(offRange.t)
    const [rawWas, rawNow] = raw(TRY, /([\d.]+) m 变成 ([\d.]+) m/, '`tryThis` on the uncorrected pair')
    same(rawWas!, rctoM(offRange), 'the uncorrected figure with the option off')
    same(rawNow!, rctoM(onRange), 'and with it on')
    // The quiz repeats both halves of the interval formula.
    const [plus] = figs(QUIZ, /交错是 \(应答方数 \+ (\d+)\) × 时隙/, 'the quiz on the interleaved interval')
    expect(SUBROUND_RESPONDERS + plus!, 'the slots a millisecond is shared between')
      .toBe(planOf('interleaved').mms!.layout.fragGapSlots)
    const [msRstu] = figs(QUIZ, /非交织是 ⌈([\d ]+) RSTU \/ 时隙⌉/, 'the quiz on the other one')
    expect(msRstu, 'the millisecond, in RSTU').toBe(MS_RSTU)
  })
})
