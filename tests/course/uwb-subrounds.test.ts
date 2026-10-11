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
