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
