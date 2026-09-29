/**
 * Every empirical claim in "听见没有人回答的东西", measured against the lesson's own scene
 * and its two variants.
 *
 * The lesson quotes no number it typed: each figure comes from `src/ui/echoFacts.ts`, which
 * computes it the way `UwbChannel` computes an arrival. So what this file is actually for is
 * the other half of that promise — that the figures `echoFacts` derives are the figures a
 * **run** produces. Every assertion below therefore compares a formatted fact against a
 * record the simulation emitted, never one arithmetic against another.
 *
 * Three claims get more than a value check, because they are the lesson:
 *
 *  - **Later, always.** Checked over every echo in every scene, against the direct flight
 *    time recomputed from the scenario's own coordinates.
 *  - **Weaker is a bill, not a theorem.** The base scene's echo is `underDirectDb` under the
 *    direct ray, and the near-line variant's is *above* it — both against `UwbChannel.rssiDbm`
 *    itself rather than against a re-typed level. That counterexample is printed in the prose,
 *    so it is pinned here: if the engine ever made "weaker" true again, the lesson would be
 *    wrong and this test says so.
 *  - **Ranging cannot see any of it.** The range records of the base scene are field-for-field
 *    the range records of the scene with no objects in it.
 */
import { describe, it, expect } from 'vitest'
import {
  PAIR_SPAN_M, PAIR_X, PAIR_Y, PAIR_Z, sensingObject, uwbSensing, uwbSensingScenario,
  type UwbSensingVariant,
} from '../../src/course/uwb/uwb-sensing'
import { COURSE_ORDER, MODULES, TIERS } from '../../src/course/curriculum'
import { LESSONS } from '../../src/course/lessons'
import type { Block } from '../../src/course/lessonKit'
import { EventQueue } from '../../src/engine/events'
import { directDelayNs } from '../../src/engine/scatter'
import { makeEmitter } from '../../src/model/records'
import type { TLRecord } from '../../src/model/records'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { Ns } from '../../src/model/types'
import { UwbChannel } from '../../src/uwb/channel'
import { UWB_RX_SENS_DBM } from '../../src/uwb/phy'
import { Simulation } from '../../src/engine/simulation'
import { anchor, oneRoom, uwbSc, uwbTag } from '../../src/course/lessonKit'
import {
  DIRECT_2M, ECHO_NEAR_LINE, ECHO_OFF_LINE, ECHO_RESOLUTION_M,
} from '../../src/ui/echoFacts'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** Seven 200 ms blocks, the window every UWB lesson measures over. */
const RUN_NS = 1300 * MS
const BLOCKS = 7
const ANC = 'anc-1'
const TAG = 'tag-1'
/** Indices into `uwbSensing.variants`. */
const V: Record<Exclude<UwbSensingVariant, 'base'>, number> = { nearLine: 0, empty: 1 }

const scenarioOf = (v: UwbSensingVariant): Scenario =>
  v === 'base' ? uwbSensing.scenario() : uwbSensing.variants![V[v]].scenario()
const recs = (v: UwbSensingVariant): TLRecord[] =>
  runOf(uwbSensing, v === 'base' ? undefined : V[v], RUN_NS)

type Echo = Extract<TLRecord, { type: 'UWB_ECHO' }>
const echoes = (v: UwbSensingVariant): Echo[] => ofType(recs(v), 'UWB_ECHO')

/**
 * The direct ray's level on this scene, from the engine's own `rssiDbm` — not from a
 * re-derivation of it. A bare channel is enough: nothing is transmitted, the question is
 * about geometry, and the session's own radio is what `rssiDbm` answers for with no frame.
 */
function directDbm(sc: Scenario): number {
  const q = new EventQueue()
  const now = (): Ns => 0 as Ns
  const ch = new UwbChannel(q, now, sc.nodes, sc.walls, sc.uwb!, () => 0, makeEmitter(() => {}), null, undefined)
  return ch.rssiDbm(TAG, ANC)
}

/** The straight-line flight time of this scene, recomputed from its own node coordinates. */
function directNs(sc: Scenario): number {
  const pos = (id: string) => sc.nodes.find((n) => n.id === id)!.pos
  return directDelayNs(pos(TAG), pos(ANC))
}

const table = (n: number): Extract<Block, { kind: 'table' }> =>
  uwbSensing.numbers!.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[n]

/** One range record, as the field-for-field comparison of the design's §7 reads it. */
const rangeLine = (r: Extract<TLRecord, { type: 'UWB_RANGE' }>): string =>
  [r.t, r.node, r.peer, r.distM, r.trueDistM, r.method, r.fom, r.block, r.round].join('|')

lessonShapeSuite(uwbSensing, { runNs: RUN_NS })

describe('uwb-sensing · the lesson', () => {
  it('opens the sensing module of UWB Tier 2, after the angle lesson', () => {
    expect(uwbSensing.id).toBe('uwb-sensing')
    expect(MODULES[uwbSensing.module].title).toBe('感知')
    expect(MODULES[uwbSensing.module].tier).toBe(5)
    expect(TIERS[5].track).toBe('uwb')
    // A published-standard module: the only clause behind it is the chip rate, and nothing
    // here moves between 4ab drafts. `tests/course/basis.test.ts` holds the other end.
    expect(MODULES[uwbSensing.module].basis).toBeUndefined()
    expect(COURSE_ORDER.indexOf('uwb-aoa')).toBeLessThan(COURSE_ORDER.indexOf('uwb-sensing'))
    expect(COURSE_ORDER.indexOf('uwb-sensing')).toBeLessThan(COURSE_ORDER.indexOf('uwb-sensing-resolution'))
    expect(COURSE_ORDER.indexOf('uwb-sensing-resolution')).toBeLessThan(COURSE_ORDER.indexOf('uwb-mms'))
  })

  it('needs the double-sided round and the geometry lesson, and names four new words', () => {
    expect(uwbSensing.needs).toEqual(['uwb-dstwr', 'uwb-geometry'])
    expect(uwbSensing.terms!.map((t) => t.term)).toEqual(['scatterer', 'echo', 'bistatic range', 'sensing'])
    expect(uwbSensing.jumps).toHaveLength(4)
    expect(uwbSensing.observe).toHaveLength(2)
    expect(uwbSensing.tryThis).toHaveLength(2)
    expect(uwbSensing.quiz).toHaveLength(3)
    expect(LESSONS.some((l) => l.id === 'uwb-sensing')).toBe(true)
  })

  it('leans on one clause, and owns the reflectivity as a model value', () => {
    const src = uwbSensing.sources!.join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).toContain('§16.2.4')
    // No draft, in a module that declares none: the geometry needs no standard at all.
    expect(src).not.toContain('802.15.4ab')
    expect(src).toMatch(/模型取值/)
  })

  it('every jump target occurs in the base run, in the order the list gives them', () => {
    const rs = recs('base')
    const idx = uwbSensing.jumps.map((j) => rs.findIndex(j.find))
    for (const [i, j] of uwbSensing.jumps.entries()) expect(idx[i], j.label).toBeGreaterThanOrEqual(0)
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
    // the Poll opens the round at t = 0; the echo of that very Poll is 10 ns later
    expect(rs[idx[0]].t).toBe(0)
    expect(rs[idx[1]].t).toBe(10)
  })
})

describe('uwb-sensing · the scene', () => {
  it('is a two-metre pair, all three things at one metre, and it parses', () => {
    for (const v of ['base', 'nearLine', 'empty'] as UwbSensingVariant[]) {
      const sc = scenarioOf(v)
      expect(() => ScenarioSchema.parse(sc), v).not.toThrow()
      const pos = (id: string) => sc.nodes.find((n) => n.id === id)!.pos
      expect(pos(ANC)).toEqual({ x: PAIR_X, y: PAIR_Y, z: PAIR_Z })
      expect(pos(TAG)).toEqual({ x: PAIR_X + PAIR_SPAN_M, y: PAIR_Y, z: PAIR_Z })
      expect(directDelayNs(pos(TAG), pos(ANC)) * 0.299792458).toBeCloseTo(PAIR_SPAN_M, 9)
    }
  })

  it('is wired to its own builder, variant for variant', () => {
    expect(uwbSensingScenario('base')).toEqual(uwbSensing.scenario())
    expect(uwbSensingScenario('nearLine')).toEqual(uwbSensing.variants![V.nearLine].scenario())
    expect(uwbSensingScenario('empty')).toEqual(uwbSensing.variants![V.empty].scenario())
  })

  it('holds one object in the base scene, one hugging the line in the first variant, and no section at all in the second', () => {
    expect(scenarioOf('base').scatterers).toEqual([sensingObject('wardrobe', 1)])
    expect(scenarioOf('nearLine').scatterers).toEqual([sensingObject('poster', 0.2)])
    // absence, not an empty list: that is what makes the run the run it was before echoes existed
    expect('scatterers' in scenarioOf('empty')).toBe(false)
  })

  it('places every object at the midpoint of the line, at the wardrobe reflectivity the tool writes', () => {
    const s = sensingObject('x', 0.4)
    expect(s.pos).toEqual({ x: PAIR_X + PAIR_SPAN_M / 2, y: PAIR_Y + 0.4, z: PAIR_Z })
    expect(s.extraLossDb).toBe(-10)
  })
})

describe('uwb-sensing · the echo the lesson quotes', () => {
  it('is one record per transmission per receiver: four a round, twenty-eight over seven blocks', () => {
    // A double-sided round is Poll, Resp, Final, Report — four PPDUs, one object, and the
    // transmitter never hears its own reflection, so exactly four echoes a round.
    expect(echoes('base')).toHaveLength(4 * BLOCKS)
    expect(echoes('nearLine')).toHaveLength(4 * BLOCKS)
    expect(echoes('empty')).toHaveLength(0)
  })

  it('reports the bistatic geometry the prose and the diagram print, to the last digit', () => {
    for (const e of echoes('base')) {
      expect(e.scattererId).toBe('wardrobe')
      expect(e.pathM.toFixed(2)).toBe(ECHO_OFF_LINE.pathM)
      expect(e.propNs.toFixed(2)).toBe(ECHO_OFF_LINE.propNs)
      expect(e.excessM.toFixed(2)).toBe(ECHO_OFF_LINE.excessM)
      expect(e.resolutionM.toFixed(2)).toBe(ECHO_RESOLUTION_M)
      expect(e.rssiDbm.toFixed(1).replace('-', '−')).toBe(ECHO_OFF_LINE.dbm)
      expect(e.resolvable).toBe(true)
    }
  })

  it('and the table of `numbers` is those very figures', () => {
    const t = table(0)
    expect(t.rows[0].slice(1)).toEqual([`${DIRECT_2M.pathM} m`, `${DIRECT_2M.propNs} ns`, `${DIRECT_2M.dbm} dBm`])
    expect(t.rows[1].slice(1)).toEqual([`${ECHO_OFF_LINE.pathM} m`, `${ECHO_OFF_LINE.propNs} ns`, `${ECHO_OFF_LINE.dbm} dBm`])
    expect(t.rows[2][1]).toBe(`${ECHO_OFF_LINE.excessM} m`)
    // the difference row really is the difference of the two above it
    const e = echoes('base')[0]
    const sc = scenarioOf('base')
    expect((e.pathM - PAIR_SPAN_M).toFixed(2)).toBe(ECHO_OFF_LINE.excessM)
    expect((e.propNs - directNs(sc)).toFixed(2)).toBe(t.rows[2][2].replace(' ns', ''))
  })

  it('is later than the direct ray in every scene that has one — the triangle inequality, over every record', () => {
    for (const v of ['base', 'nearLine'] as UwbSensingVariant[]) {
      const d = directNs(scenarioOf(v))
      for (const e of echoes(v)) {
        expect(e.propNs, v).toBeGreaterThan(d)
        expect(e.excessM, v).toBeGreaterThan(0)
        // the instant it was delivered at is the ceiling of that flight time, as the direct
        // path's is: the event queue runs on whole nanoseconds
        expect(e.t % 2_000_000).toBe(Math.ceil(e.propNs))
      }
    }
  })

  it('is 1.0 dB under the direct ray here — and 4.7 dB OVER it once the object hugs the line', () => {
    // The lesson states "later" as a theorem and "weaker" as a bill that can fail to add up,
    // and prints the counterexample. Both halves against `UwbChannel.rssiDbm` itself.
    const direct = directDbm(scenarioOf('base'))
    expect(direct.toFixed(1).replace('-', '−')).toBe(DIRECT_2M.dbm)
    expect(directDbm(scenarioOf('nearLine'))).toBe(direct)

    const far = echoes('base')[0].rssiDbm
    expect((direct - far).toFixed(1)).toBe(ECHO_OFF_LINE.underDirectDb)
    expect(far).toBeLessThan(direct)

    const near = echoes('nearLine')[0].rssiDbm
    expect(near).toBeGreaterThan(direct)
    expect((near - direct).toFixed(1)).toBe((-Number(ECHO_NEAR_LINE.underDirectDb)).toFixed(1))
    expect((-Number(ECHO_NEAR_LINE.underDirectDb)).toFixed(1)).toBe('4.7')
    // …and the invisible one is the louder one, which is the next lesson's whole point
    expect(near).toBeGreaterThan(far)
    expect(echoes('nearLine')[0].resolvable).toBe(false)
    expect(echoes('nearLine')[0].excessM.toFixed(2)).toBe(ECHO_NEAR_LINE.excessM)
  })
})

describe('uwb-sensing · ranging cannot see any of it', () => {
  it('reports the same ranges, field for field, with the object and without it', () => {
    const withObj = ofType(recs('base'), 'UWB_RANGE').map(rangeLine)
    const without = ofType(recs('empty'), 'UWB_RANGE').map(rangeLine)
    expect(withObj.length).toBe(2 * BLOCKS)
    expect(withObj).toEqual(without)
    // and the near-line object, whose echo is the loudest thing in the room, changes nothing either
    expect(ofType(recs('nearLine'), 'UWB_RANGE').map(rangeLine)).toEqual(without)
  })

  it('never lets an echo become a reception: no RX_START or RX_OK is added by the object', () => {
    const rxOf = (v: UwbSensingVariant) =>
      recs(v).filter((r) => r.type === 'RX_START' || r.type === 'RX_OK').length
    expect(rxOf('base')).toBe(rxOf('empty'))
    expect(rxOf('nearLine')).toBe(rxOf('empty'))
  })
})

/**
 * The two experiments the lesson asks the reader to run in the editor. They are the only
 * claims in it that no variant covers, so they are built and run here — the same discipline
 * `tests/course/uwb-aoa.test.ts` applies to the scenes a reader assembles by hand.
 */
describe('uwb-sensing · the experiments hold', () => {
  const extra = new Map<string, TLRecord[]>()
  const run = (key: string, build: () => Scenario): TLRecord[] => {
    if (!extra.has(key)) extra.set(key, [...new Simulation(build()).runUntil(400 * MS).records])
    return extra.get(key)!
  }
  /** The lesson's own pair, `spanM` apart about the room's middle, with one object `offM` out. */
  const scene = (spanM: number, offM: number, lossDb: number): Scenario =>
    uwbSc(
      oneRoom(),
      [
        anchor(ANC, 'Anchor', 5 - spanM / 2, PAIR_Y, PAIR_Z),
        uwbTag(TAG, 'Badge', 5 + spanM / 2, PAIR_Y, PAIR_Z),
      ],
      { method: 'ds', mode: 'twr', channel: 9, nlos: false },
      { scatterers: [{ id: 'w', pos: { x: 5, y: PAIR_Y + offM, z: PAIR_Z }, extraLossDb: lossDb }] },
    )
  const echoesOf = (key: string, sc: () => Scenario) => ofType(run(key, sc), 'UWB_ECHO')

  it('drag it onto the line and its echo arrives in the same nanosecond as the direct ray', () => {
    // "再把它拖到连线上去，看时延如何贴上直达路径"
    const es = echoesOf('onLine', () => scene(PAIR_SPAN_M, 0, -10))
    expect(es.length).toBeGreaterThan(0)
    for (const e of es) {
      expect(e.excessM).toBe(0)
      expect(e.propNs).toBeCloseTo(directNs(scene(PAIR_SPAN_M, 0, -10)), 9)
      expect(e.resolvable).toBe(false)
    }
  })

  it('walk it outwards and the path grows while the level falls, every step', () => {
    // "看双站距离怎么涨，看电平怎么掉"
    const steps = [0.5, 1, 1.5, 2].map((d) => echoesOf(`out${d}`, () => scene(PAIR_SPAN_M, d, -10))[0])
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].pathM).toBeGreaterThan(steps[i - 1].pathM)
      expect(steps[i].rssiDbm).toBeLessThan(steps[i - 1].rssiDbm)
    }
  })

  it('0 dB costs exactly ten decibels and is still audible at two metres', () => {
    // "回波弱了整整 10 dB，但仍然听得见"
    const wardrobe = echoesOf('w2', () => scene(PAIR_SPAN_M, 1, -10))[0]
    const ideal = echoesOf('i2', () => scene(PAIR_SPAN_M, 1, 0))
    expect(ideal.length).toBeGreaterThan(0)
    expect((wardrobe.rssiDbm - ideal[0].rssiDbm).toFixed(6)).toBe('10.000000')
  })

  it('nine metres apart, the square metre is gone and the wardrobe only just arrives', () => {
    // "0 dB 的物体一条回波都不剩，而 −10 dB 的衣柜刚好卡在门限上还能进来"
    expect(echoesOf('i9', () => scene(9, 1, 0))).toHaveLength(0)
    const w = echoesOf('w9', () => scene(9, 1, -10))
    expect(w.length).toBeGreaterThan(0)
    // inside the floor, and by less than a decibel: "刚好卡在门限上"
    expect(w[0].rssiDbm).toBeGreaterThanOrEqual(UWB_RX_SENS_DBM)
    expect(w[0].rssiDbm - UWB_RX_SENS_DBM).toBeLessThan(1)
  })
})
