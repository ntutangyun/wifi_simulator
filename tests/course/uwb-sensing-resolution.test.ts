/**
 * Every empirical claim in "贴着连线站的人看不见", measured against the lesson's own scene
 * and its two variants.
 *
 * The claim the whole slice exists for is one sentence — *the invisible echo is the louder
 * of the two* — and it is checked from both ends: the near-line record is the one with
 * `resolvable: false` **and** the one with the higher `rssiDbm`, in the same run, a few
 * nanoseconds apart. If an engine change ever made the quiet echo the invisible one, the
 * lesson's headline would be false and this file says so.
 *
 * The other half is the flip. `ECHO_FLIP_OFFSET_M` is the condition inverted rather than
 * searched for, so it is pinned twice: against the arithmetic (an object at exactly that
 * offset has an excess of exactly c × 1/B) and against the two variant runs that straddle
 * it ten centimetres apart.
 *
 * Every quoted figure comes from `src/ui/echoFacts.ts`; every assertion compares it against
 * a record the simulation emitted, never against another derivation of the same formula.
 */
import { describe, it, expect } from 'vitest'
import {
  uwbResolutionScenario, uwbSensingResolution, type UwbResolutionVariant,
} from '../../src/course/uwb/uwb-sensing-resolution'
import { PAIR_SPAN_M, sensingObject, uwbSensing } from '../../src/course/uwb/uwb-sensing'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import type { Block } from '../../src/course/lessonKit'
import type { TimingSpec } from '../../src/course/diagram'
import { echoExcessM } from '../../src/engine/scatter'
import type { TLRecord } from '../../src/model/records'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { C_M_PER_NS, UWB_CHIP_NS } from '../../src/uwb/phy'
import {
  ECHO_FLIP_OFFSET_M, ECHO_FLIP_OVER, ECHO_FLIP_UNDER, ECHO_NEAR_LINE, ECHO_OFF_LINE,
  ECHO_RESOLUTION_M,
} from '../../src/ui/echoFacts'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 1300 * MS
const BLOCKS = 7
/** Indices into `uwbSensingResolution.variants`. */
const V: Record<Exclude<UwbResolutionVariant, 'pair'>, number> = { under: 0, over: 1 }

const scenarioOf = (v: UwbResolutionVariant): Scenario =>
  v === 'pair' ? uwbSensingResolution.scenario() : uwbSensingResolution.variants![V[v]].scenario()
const recs = (v: UwbResolutionVariant): TLRecord[] =>
  runOf(uwbSensingResolution, v === 'pair' ? undefined : V[v], RUN_NS)

type Echo = Extract<TLRecord, { type: 'UWB_ECHO' }>
const echoes = (v: UwbResolutionVariant): Echo[] => ofType(recs(v), 'UWB_ECHO')
/** Every echo off one object, in the order the run emitted them. */
const off = (v: UwbResolutionVariant, id: string): Echo[] => echoes(v).filter((e) => e.scattererId === id)

const table = (n: number): Extract<Block, { kind: 'table' }> =>
  uwbSensingResolution.numbers!.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[n]
/** The lesson's one figure, already narrowed to the timing spec it declares. */
const timing = (): TimingSpec => {
  const b = uwbSensingResolution.picture!
    .find((x): x is Extract<Block, { kind: 'diagram' }> => x.kind === 'diagram')!
  if (b.spec.kind !== 'timing') throw new Error(`expected a timing figure, got ${b.spec.kind}`)
  return b.spec
}

const rangeLine = (r: Extract<TLRecord, { type: 'UWB_RANGE' }>): string =>
  [r.t, r.node, r.peer, r.distM, r.trueDistM, r.method, r.fom, r.block, r.round].join('|')

/** One echo, as the four columns of the lesson's table print it. */
const row = (e: Echo, offM: string): string[] => [
  `${offM} m`, `${e.pathM.toFixed(2)} m`, `${e.excessM.toFixed(2)} m`,
  e.resolvable ? '分得开' : '分不开', `${e.rssiDbm.toFixed(1).replace('-', '−')} dBm`,
]

lessonShapeSuite(uwbSensingResolution, { runNs: RUN_NS })

describe('uwb-sensing-resolution · the lesson', () => {
  it('follows the sensing lesson in the same module, and still precedes the multi-millisecond tier', () => {
    expect(uwbSensingResolution.id).toBe('uwb-sensing-resolution')
    expect(uwbSensingResolution.module).toBe(uwbSensing.module)
    expect(MODULES[uwbSensingResolution.module].title).toBe('感知')
    expect(COURSE_ORDER.indexOf('uwb-sensing')).toBeLessThan(COURSE_ORDER.indexOf('uwb-sensing-resolution'))
    expect(COURSE_ORDER.indexOf('uwb-sensing-resolution')).toBeLessThan(COURSE_ORDER.indexOf('uwb-mms'))
  })

  it('needs the sensing lesson and the frame lesson, and names three new words', () => {
    expect(uwbSensingResolution.needs).toEqual(['uwb-sensing', 'uwb-frame'])
    expect(uwbSensingResolution.terms!.map((t) => t.term)).toEqual(['resolution', 'correlation peak', 'chip'])
    expect(uwbSensingResolution.jumps).toHaveLength(4)
    expect(uwbSensingResolution.observe).toHaveLength(2)
    expect(uwbSensingResolution.tryThis).toHaveLength(2)
    expect(uwbSensingResolution.quiz).toHaveLength(3)
  })

  it('leans on the chip rate alone, and owns the boolean verdict as its own choice', () => {
    const src = uwbSensingResolution.sources!.join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).toContain('§16.2.4')
    expect(src).not.toContain('802.15.4ab')
    expect(src).toMatch(/取舍|模型取值/)
  })

  it('every jump target occurs in the base run, and they lead to the two verdicts in turn', () => {
    const rs = recs('pair')
    const idx = uwbSensingResolution.jumps.map((j) => rs.findIndex(j.find))
    for (const [i, j] of uwbSensingResolution.jumps.entries()) expect(idx[i], j.label).toBeGreaterThanOrEqual(0)
    // the first echo IS the merged one — the near-line object is closer, so its echo is first
    expect(idx[0]).toBe(idx[1])
    expect(rs[idx[1]].t).toBe(7)
    expect(rs[idx[2]].t).toBe(10)
  })
})

describe('uwb-sensing-resolution · the scene', () => {
  it('is the measured pair, and one object either side of the turn', () => {
    for (const v of ['pair', 'under', 'over'] as UwbResolutionVariant[]) {
      expect(() => ScenarioSchema.parse(scenarioOf(v)), v).not.toThrow()
    }
    expect(uwbResolutionScenario('pair')).toEqual(uwbSensingResolution.scenario())
    expect(uwbResolutionScenario('under')).toEqual(uwbSensingResolution.variants![V.under].scenario())
    expect(uwbResolutionScenario('over')).toEqual(uwbSensingResolution.variants![V.over].scenario())
    expect(scenarioOf('pair').scatterers)
      .toEqual([sensingObject('poster', 0.2), sensingObject('wardrobe', 1)])
    expect(scenarioOf('under').scatterers).toEqual([sensingObject('poster', 0.8)])
    expect(scenarioOf('over').scatterers).toEqual([sensingObject('poster', 0.9)])
  })

  it("reuses the sensing lesson's pair exactly, so the two lessons measure one geometry", () => {
    const nodesOf = (sc: Scenario) => sc.nodes
    expect(nodesOf(scenarioOf('pair'))).toEqual(nodesOf(uwbSensing.scenario()))
    expect(scenarioOf('pair').uwb).toEqual(uwbSensing.scenario().uwb)
    // the far object of the pair IS the sensing lesson's one object
    expect(scenarioOf('pair').scatterers![1]).toEqual(uwbSensing.scenario().scatterers![0])
  })
})

describe('uwb-sensing-resolution · the invisible echo is the loud one', () => {
  it('lays both records down for every transmission, three nanoseconds apart', () => {
    expect(echoes('pair')).toHaveLength(2 * 4 * BLOCKS)
    expect(off('pair', 'poster')).toHaveLength(4 * BLOCKS)
    expect(off('pair', 'wardrobe')).toHaveLength(4 * BLOCKS)
    // "每一次发送后面跟着两条回波，相差三纳秒"
    const near = off('pair', 'poster')
    const far = off('pair', 'wardrobe')
    for (let i = 0; i < near.length; i++) expect(far[i].t - near[i].t).toBe(3)
  })

  it('the near one cannot be separated and is the LOUDER of the two — the sentence the lesson turns on', () => {
    for (const e of off('pair', 'poster')) {
      expect(e.resolvable).toBe(false)
      expect(e.excessM.toFixed(2)).toBe(ECHO_NEAR_LINE.excessM)
      expect(e.rssiDbm.toFixed(1).replace('-', '−')).toBe(ECHO_NEAR_LINE.dbm)
    }
    for (const e of off('pair', 'wardrobe')) {
      expect(e.resolvable).toBe(true)
      expect(e.excessM.toFixed(2)).toBe(ECHO_OFF_LINE.excessM)
      expect(e.rssiDbm.toFixed(1).replace('-', '−')).toBe(ECHO_OFF_LINE.dbm)
    }
    // the whole claim in one line: louder, and invisible
    expect(off('pair', 'poster')[0].rssiDbm).toBeGreaterThan(off('pair', 'wardrobe')[0].rssiDbm)
    expect(off('pair', 'poster')[0].resolvable).toBe(false)
    expect(off('pair', 'wardrobe')[0].resolvable).toBe(true)
    // and the gap the prose calls "5.7 dB quieter for the privilege"
    expect((off('pair', 'poster')[0].rssiDbm - off('pair', 'wardrobe')[0].rssiDbm).toFixed(1)).toBe('5.7')
  })

  it('compares against the same threshold every time: c × one chip, in metres', () => {
    for (const e of echoes('pair')) {
      expect(e.resolutionM).toBeCloseTo(C_M_PER_NS * UWB_CHIP_NS, 12)
      expect(e.resolutionM.toFixed(2)).toBe(ECHO_RESOLUTION_M)
      // the verdict is that comparison and nothing else — never the level
      expect(e.resolvable).toBe(e.excessM > e.resolutionM)
    }
  })
})

describe('uwb-sensing-resolution · the verdict flips over ten centimetres', () => {
  it("0.8 m is still merged, 0.9 m is a separate arrival, and the figures are the table's", () => {
    for (const e of echoes('under')) {
      expect(e.resolvable).toBe(false)
      expect(e.excessM.toFixed(2)).toBe(ECHO_FLIP_UNDER.excessM)
      expect(e.rssiDbm.toFixed(1).replace('-', '−')).toBe(ECHO_FLIP_UNDER.dbm)
    }
    for (const e of echoes('over')) {
      expect(e.resolvable).toBe(true)
      expect(e.excessM.toFixed(2)).toBe(ECHO_FLIP_OVER.excessM)
      expect(e.rssiDbm.toFixed(1).replace('-', '−')).toBe(ECHO_FLIP_OVER.dbm)
    }
    // the level falls monotonically outwards while the verdict turns the other way
    const level = (v: UwbResolutionVariant, id: string) => off(v, id)[0].rssiDbm
    expect(level('pair', 'poster')).toBeGreaterThan(level('under', 'poster'))
    expect(level('under', 'poster')).toBeGreaterThan(level('over', 'poster'))
    expect(level('over', 'poster')).toBeGreaterThan(level('pair', 'wardrobe'))
  })

  it('the turning offset is the condition inverted, and the two variants straddle it', () => {
    const d = Number(ECHO_FLIP_OFFSET_M)
    expect(Number(ECHO_FLIP_UNDER.offM)).toBeLessThan(d)
    expect(Number(ECHO_FLIP_OVER.offM)).toBeGreaterThan(d)
    // an object at exactly that offset has an excess of exactly c × 1/B, to the rounding of
    // the two-decimal figure the prose prints
    const s = sensingObject('x', d)
    const a = { x: s.pos.x - PAIR_SPAN_M / 2, y: s.pos.y - d, z: s.pos.z }
    const b = { x: s.pos.x + PAIR_SPAN_M / 2, y: a.y, z: s.pos.z }
    expect(echoExcessM(a, s.pos, b)).toBeCloseTo(C_M_PER_NS * UWB_CHIP_NS, 2)
  })

  it('and the four rows of the table are those four runs', () => {
    const t = table(0)
    expect(t.rows[0]).toEqual(row(off('pair', 'poster')[0], ECHO_NEAR_LINE.offM))
    expect(t.rows[1]).toEqual(row(echoes('under')[0], ECHO_FLIP_UNDER.offM))
    expect(t.rows[2]).toEqual(row(echoes('over')[0], ECHO_FLIP_OVER.offM))
    expect(t.rows[3]).toEqual(row(off('pair', 'wardrobe')[0], ECHO_OFF_LINE.offM))
  })
})

describe('uwb-sensing-resolution · the figure is the records', () => {
  it('draws each arrival one chip wide, at the flight time the run reports', () => {
    const spec = timing()
    expect(spec.lanes).toHaveLength(3)
    for (const lane of spec.lanes) {
      expect(lane.spans).toHaveLength(1)
      // one chip wide: that is what a correlation peak is, and the whole of the threshold
      expect(lane.spans[0].toUs - lane.spans[0].fromUs).toBeCloseTo(UWB_CHIP_NS, 12)
    }
    // the second and third lanes start where the two echoes actually arrived
    expect(spec.lanes[1].spans[0].fromUs.toFixed(2)).toBe(off('pair', 'poster')[0].propNs.toFixed(2))
    expect(spec.lanes[2].spans[0].fromUs.toFixed(2)).toBe(off('pair', 'wardrobe')[0].propNs.toFixed(2))
    // the near echo's peak overlaps the direct one's; the far echo's starts after it ends
    const [direct, near, far] = spec.lanes.map((l) => l.spans[0])
    expect(near.fromUs).toBeLessThan(direct.toUs)
    expect(far.fromUs).toBeGreaterThan(direct.toUs)
  })
})

describe('uwb-sensing-resolution · ranging is untouched either way', () => {
  it('reports the same ranges as the scene with nothing in the room at all', () => {
    const bare = ofType(runOf(uwbSensing, 1, RUN_NS), 'UWB_RANGE').map(rangeLine)
    expect(bare).toHaveLength(2 * BLOCKS)
    for (const v of ['pair', 'under', 'over'] as UwbResolutionVariant[]) {
      expect(ofType(recs(v), 'UWB_RANGE').map(rangeLine), v).toEqual(bare)
    }
  })
})

/**
 * The experiment the lesson asks the reader to run in the editor: pull the two devices apart
 * and the turning offset moves outwards. It is the `deeper` section's claim as well — the
 * blind spot along the line is not a fixed size — so it is measured rather than asserted.
 */
describe('uwb-sensing-resolution · the blind spot widens with the baseline', () => {
  /** The turning offset for a baseline of `spanM`, the same inversion `echoFacts` performs. */
  const flipM = (spanM: number): number =>
    Math.sqrt(((C_M_PER_NS * UWB_CHIP_NS + spanM) / 2) ** 2 - (spanM / 2) ** 2)

  it('reproduces the lesson’s own 2 m figure, and grows from there', () => {
    expect(flipM(PAIR_SPAN_M).toFixed(2)).toBe(ECHO_FLIP_OFFSET_M)
    // "再把两台设备拉到四米远，重做一次——翻转的位置会往外跑"
    expect(flipM(4)).toBeGreaterThan(flipM(PAIR_SPAN_M))
    expect(flipM(10)).toBeGreaterThan(flipM(4))
    // "十米的连线上，物体要偏出将近一米八才分得开"
    expect(flipM(10).toFixed(1)).toBe('1.8')
    expect(flipM(10)).toBeGreaterThan(1.7)
  })

  it('and the offset it names really is where the excess crosses the threshold', () => {
    for (const span of [PAIR_SPAN_M, 4, 10]) {
      const d = flipM(span)
      const a = { x: 0, y: 0, z: 1 }
      const b = { x: span, y: 0, z: 1 }
      expect(echoExcessM(a, { x: span / 2, y: d, z: 1 }, b)).toBeCloseTo(C_M_PER_NS * UWB_CHIP_NS, 9)
      // one centimetre inside it is still merged, one centimetre outside is not
      expect(echoExcessM(a, { x: span / 2, y: d - 0.01, z: 1 }, b)).toBeLessThan(C_M_PER_NS * UWB_CHIP_NS)
      expect(echoExcessM(a, { x: span / 2, y: d + 0.01, z: 1 }, b)).toBeGreaterThan(C_M_PER_NS * UWB_CHIP_NS)
    }
  })
})
