/**
 * Every empirical claim in "不回话的物体留下的回波", measured against the lesson's own scene
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
import { COURSE_ORDER, MODULES, TIERS, trackOf } from '../../src/course/curriculum'
import { LESSONS } from '../../src/course/lessons'
import { readerTexts } from '../../src/course/readability'
import type { Block, Lesson } from '../../src/course/lessonKit'
import { PHY_MODES } from '../../src/engine/phy'
import { EventQueue } from '../../src/engine/events'
import { apertureCorrectionDb, directDelayNs, echoLossDb, echoPathM } from '../../src/engine/scatter'
import { wallsCrossed } from '../../src/engine/propagation'
import { NEW_SCATTERER_EXTRA_LOSS_DB } from '../../src/editor/planOps'
import { makeEmitter } from '../../src/model/records'
import type { TLRecord } from '../../src/model/records'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { Ns } from '../../src/model/types'
import { UwbChannel } from '../../src/uwb/channel'
import {
  C_M_PER_NS, UWB_BAND_MHZ, UWB_CHIP_HZ, UWB_CHIP_NS, UWB_RX_SENS_DBM, UWB_TX_POWER_DBM,
  freeSpacePl0Db, uwbPathLossDb,
} from '../../src/uwb/phy'
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

/**
 * The cross-track quote, pinned both ways — the one bad reference the UWB read-through
 * found (docs/superpowers/specs/2026-10-03-multipath-design.md §2.2 and §9).
 *
 * This entry used to end 「所以 Wi-Fi 那边的课里写着「没有建模多径」，现在仍然是真的」.
 * **No Wi-Fi lesson has ever written that.** `selectivity` teaches multipath as the
 * mechanism it is, and `radio-primer`'s own `limits` say what is actually still missing —
 * so a reader who had just finished the Wi-Fi half was sent looking for a sentence that
 * does not exist. The entry now quotes the sentence that does, and gives §2.2's reason
 * instead of 「只接了一侧」, which named the cause as workload.
 *
 * The third test is the one with teeth: it reads the Wi-Fi lesson OBJECTS, so the quote
 * cannot drift on either side of the track boundary, and nothing in this repo was
 * watching that before.
 */
describe('uwb-sensing · the multipath entry quotes a Wi-Fi sentence that exists', () => {
  /** The sentence the entry hands the reader to go and find. */
  const WIFI_QUOTE = '仍然没有的是时延扩展本身与多普勒'
  const entry = (): string => uwbSensing.limits.map((l) => l.text).join(' ')
  /** Everything a reader meets in one lesson, `limits` and title included. */
  // `readerTexts` is the one walk since 2026-10-05; it adds the labels this list left out,
  // and no Wi-Fi lesson's labels carry the needle below (measured before the widening).
  const readerText = (l: Lesson): string[] => readerTexts(l)
  const wifi = (): Lesson[] => LESSONS.filter((l) => trackOf(l) === 'wifi')

  it('no longer attributes 「没有建模多径」 to the Wi-Fi track', () => {
    expect(entry()).not.toContain('没有建模多径」，现在仍然是真的')
    expect(entry()).not.toContain('现在仍然是真的')
  })

  it('gives the reason instead: the verdict is a sensing threshold, not a demodulation one', () => {
    expect(entry()).toContain('感知原语')
    expect(entry()).toContain('不是一个多径原语')
    expect(entry()).toContain('保护间隔')
    // the engine fact the sentence rests on: there is no guard-interval number to compare
    // against, because `symNs` is one constant per generation
    expect(entry()).toContain('symNs 是每代一个常数')
    for (const m of Object.values(PHY_MODES)) expect(typeof m.symNs).toBe('number')
    expect(new Set(Object.values(PHY_MODES).map((m) => m.symNs)).size).toBeLessThanOrEqual(2)
    expect(entry()).toContain(WIFI_QUOTE)
  })

  it('and the sentence it quotes really is in a Wi-Fi lesson, not in a string constant', () => {
    const holders = wifi().filter((l) => readerText(l).some((t) => t.includes(WIFI_QUOTE)))
    expect(holders.map((l) => l.id), 'the quoted Wi-Fi sentence has moved or been reworded')
      .toContain('radio-primer')
    // the other claim the entry makes about that track: frequency selectivity is a lesson
    expect(wifi().some((l) => l.title.includes('频率选择性'))).toBe(true)
    // …and the sentence it used to claim is there is in fact nowhere in the Wi-Fi track
    for (const l of wifi()) {
      for (const t of readerText(l)) expect(t, l.id).not.toContain('没有建模多径')
    }
    // a floor, so this cannot pass by grading an empty track
    expect(wifi().length).toBeGreaterThanOrEqual(40)
  })
})
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * This lesson quotes almost nothing it typed: the table, the caption and the two levels are
 * interpolated from `src/ui/echoFacts.ts`, and the file above measures those against runs. What
 * is typed, and was therefore read by nobody, is the rest — the aperture correction written out
 * three times in `deeper`, the reflectivity convention in `sources` and `limits`, the chip and
 * the 1/B it comes from, and the two instants the watch line sends a reader to look at.
 * (Those two were invisible to the sweep until 2026-10-14: 「第 10 纳秒」 counted as a name.)
 *
 * **The reads worth naming:**
 *
 *  - **the aperture correction is evaluated with the figures the sentence prints**, at the
 *    wavelength this channel really has: 「10·log10(4π/λ²)」 appears three times and the σ form
 *    once, and each is fed to `apertureCorrectionDb` as its own three figures.
 *  - **「比一平方米还强十个分贝」 is measured, not restated**: the same object is priced at the
 *    reflectivity the 🪞 tool writes and at 0 dB, and the difference is the ten decibels.
 *  - **the nine-metre pair in `tryThis` is read against the floor**: at that baseline the ideal
 *    square metre falls under `UWB_RX_SENS_DBM` and the wardrobe stays over it, which is the
 *    whole point of 「回波的作用距离，就是这么短」.
 *  - **「一次 0.5 米」 is exempt (class (e))** — any step would show the same thing — but the
 *    claim beside it is not: the bistatic distance rises and the level falls at every step.
 */
describe('uwb-sensing · every figure the prose prints, read back out of it', () => {
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
  const PIC = blockText(uwbSensing.picture)
  const NUMS = blockText(uwbSensing.numbers)
  const DEEP = blockText(uwbSensing.deeper)
  const LIM = blockText(uwbSensing.limits)
  const SRC = blockText(uwbSensing.sources)
  const TRY = blockText(uwbSensing.tryThis)

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const cn = (s: string): number => '零一二三四五六七八九十'.indexOf(s === '两' ? '二' : s)

  /** This scene's own channel, and the two arithmetic pieces every level below is built from. */
  const CH = scenarioOf('base').uwb!.channel
  const CENTRE_MHZ = (UWB_BAND_MHZ[CH].lo + UWB_BAND_MHZ[CH].hi) / 2
  const LAMBDA_M = (C_M_PER_NS * 1e9) / (CENTRE_MHZ * 1e6)
  const law = (dM: number): number => uwbPathLossDb(freeSpacePl0Db(CENTRE_MHZ), dM, 0)
  /** What a receiver on this channel hears from one object, dBm — `UwbChannel`'s own arithmetic. */
  const echoDbmAt = (span: number, offM: number, reflDb: number): number => UWB_TX_POWER_DBM
    - echoLossDb({ x: 0, y: 0, z: 1 }, { x: span / 2, y: offM, z: 1 }, { x: span, y: 0, z: 1 },
      law, LAMBDA_M, reflDb)
  const bistaticAt = (span: number, offM: number): number =>
    echoPathM({ x: 0, y: 0, z: 1 }, { x: span / 2, y: offM, z: 1 }, { x: span, y: 0, z: 1 })

  it('reads the two instants the watch line sends a reader to', () => {
    // 「它落在第 10 纳秒，而同一次发送的直达路径落在第 7 纳秒」
    const [echoNs, directNsFig] = figs(PIC,
      /它落在第 (\d+) 纳秒，而同一次发送的直达路径落在第 (\d+) 纳秒/, '`picture` on the two arrivals')
    const e = echoes('base')[0]!
    expect(e.t, 'when the first echo record really lands').toBe(echoNs)
    same(String(directNsFig), directNs(scenarioOf('base')), 'and the direct ray’s own flight')
    expect(echoNs, 'later, always — and this is the sentence that shows it')
      .toBeGreaterThan(directNsFig!)
    expect(e.propNs, 'the echo’s own propagation, from the record').toBeGreaterThan(directNsFig!)
  })

  it('reads the aperture correction everywhere `deeper` writes it out', () => {
    /*
     * 「正好是 10·log10(4π/λ²)」, 「那个 10·log10(4π/λ²) 是从哪里来的」 and 「两段和 − 雷达 =
     * 10·log10(σ · 4π / λ²)」 — three printings of one expression, each fed to the engine's own
     * `apertureCorrectionDb` as the three figures it prints. With σ = 1 (a square metre, which
     * `sources` says is what 0 dB means) the third is the same number as the other two.
     */
    const writings = [...DEEP.matchAll(/(\d+)·log(\d+)\((?:σ · )?(\d)π ?\/ ?λ²\)/g)]
    expect(writings.length, 'the expression is written three times').toBe(3)
    for (const m of writings) {
      const [mul, base, four] = m.slice(1).map(val)
      expect(mul! * (Math.log(four! * Math.PI / (LAMBDA_M * LAMBDA_M)) / Math.log(base!)),
        `「${m[0]}」 against the engine’s own aperture correction`)
        .toBeCloseTo(apertureCorrectionDb(LAMBDA_M), 9)
    }
    // 「不退的话，回波会比该有的弱三十多分贝」 — and that is the size of the correction itself
    const [tensCn] = raw(DEEP, /回波会比该有的弱(.)十多分贝/, '`deeper` on what forgetting it costs')
    expect(Math.abs(apertureCorrectionDb(LAMBDA_M)), 'the correction this channel really carries')
      .toBeGreaterThan(cn(tensCn!) * 10)
    expect(Math.abs(apertureCorrectionDb(LAMBDA_M)), 'and it is in that decade')
      .toBeLessThan((cn(tensCn!) + 1) * 10)
  })

  it('reads the reflectivity convention, and the wardrobe’s ten decibels', () => {
    // 「0 dB 定义为一面理想的一平方米反射面，半平方米是 +3.01 dB」 — in `sources` and in `limits`
    const [zeroDb, halfDb] = figs(SRC, /：(\d) dB 定义为一面理想的一平方米反射面，半平方米是 \+([\d.]+) dB/,
      '`sources` on the convention')
    expect(zeroDb, 'a square metre is the zero of this scale').toBe(0)
    same(String(halfDb), 10 * Math.log10(2), 'and half of one costs that much more loss')
    const [limZero] = figs(LIM, /(\d) dB 是一平方米/, '`limits` on the same zero')
    expect(limZero, 'the same zero, a second time').toBe(zeroDb)
    // 「🪞 工具放置时写 −10 dB（一个衣柜）」, and `limits` says it again
    for (const [text, re, what] of [
      [SRC, /工具放置时写 −(\d+) dB（一个衣柜）/, '`sources` on the tool’s own object'],
      [LIM, /−(\d+) dB 是 🪞 工具默认的衣柜/, '`limits` on the same object'],
    ] as [string, RegExp, string][]) {
      expect(-figs(text, re, what)[0]!, 'the reflectivity the tool really writes')
        .toBe(NEW_SCATTERER_EXTRA_LOSS_DB)
    }
    /*
     * 「再加上 🪞 工具写的 −10 dB 比一平方米还强十个分贝」 — the field is a LOSS, so the tool's
     * object is louder than a square metre by exactly that much. Measured on the same geometry
     * at the two reflectivities rather than argued from the sign.
     */
    const [toolDb, overCn] = raw(DEEP, /工具写的 −(\d+) dB 比一平方米还强(.)个分贝/,
      '`deeper` on the tool’s object')
    const wardrobe = echoDbmAt(PAIR_SPAN_M, 0.2, -val(toolDb!))
    const ideal = echoDbmAt(PAIR_SPAN_M, 0.2, 0)
    expect(Number((wardrobe - ideal).toFixed(6)), 'how much louder it really is').toBe(cn(overCn!))
    expect(val(toolDb!), 'and the figure the tool writes is that many decibels')
      .toBe(cn(overCn!))
    // 「本课两点之间没有墙，所以它就是 2 米上的自由空间那一项」
    const [spanM] = figs(SRC, /它就是 (\d+) 米上的自由空间那一项/, '`sources` on the direct ray')
    expect(spanM, 'the span this lesson’s two ends really are apart').toBe(PAIR_SPAN_M)
    // 「本课两点之间没有墙」 — the room has four of them; none is in the way
    const sc = scenarioOf('base')
    const pos = (id: string) => sc.nodes.find((n) => n.id === id)!.pos
    expect(wallsCrossed(pos(TAG), pos(ANC), sc.walls), 'and no wall between them').toEqual([])
    same(String(spanM), bistaticAt(PAIR_SPAN_M, 0),
      'and an object standing on the line adds nothing to it')
  })

  it('reads the chip, the 0.60 m it becomes and the 1/B it comes from', () => {
    // 「一个码片 2.003205 ns，乘以光速约 0.60 米」
    const [chipNs, resM] = figs(SRC, /一个码片 ([\d.]+) ns，乘以光速约 ([\d.]+) 米/,
      '`sources` on the chip')
    same(String(chipNs), UWB_CHIP_NS, 'the chip this receiver really counts in')
    expect(String(resM.toFixed(2)), 'and what it is worth in metres').toBe(ECHO_RESOLUTION_M)
    // 「这里只先记住那个数：0.60 米」 — `numbers` prints it again
    const [numsRes] = figs(NUMS, /这里只先记住那个数：([\d.]+) 米/, '`numbers` on the same figure')
    expect(numsRes!.toFixed(2), 'the same resolution, a second time').toBe(ECHO_RESOLUTION_M)
    expect(echoes('base')[0]!.resolutionM.toFixed(2), 'and the record’s own figure for it')
      .toBe(ECHO_RESOLUTION_M)
    /*
     * 「「分得开」比的是 1/B」, twice — the numerator is the figure, and what it buys is the
     * resolution above: one over the chip rate, times the speed of light.
     */
    const ones = [...LIM.matchAll(/(\d)\/B/g)].map((m) => val(m[1]!))
    expect(ones.length, '「1/B」, printed twice').toBe(2)
    expect(new Set(ones).size, 'and the same numerator both times').toBe(1)
    const [chipHzFig] = figs(SRC, /§16\.2\.4 的 ([\d.]+) Mchip\/s/, '`sources` on the chip rate')
    expect(chipHzFig! * 1e6, 'the chip rate this engine runs').toBe(UWB_CHIP_HZ)
    expect(((ones[0]! / (chipHzFig! * 1e6)) * 1e9 * C_M_PER_NS).toFixed(2),
      '1/B, in metres of flight').toBe(ECHO_RESOLUTION_M)
  })

  it('reads both experiments: the walk away from the line, and the nine-metre pair', () => {
    /*
     * **Exempt, class (e): the 0.5 m step.** 「用 🪞 把衣柜沿着垂直于连线的方向往外拖，一次 0.5
     * 米」 is an instruction, and 0.4 or 0.6 would teach the same thing. What is read is the
     * claim beside it — 「看双站距离怎么涨，看电平怎么降」 — at the steps it names.
     */
    const [stepM] = figs(TRY, /往外拖，一次 ([\d.]+) 米/, '`tryThis` on the drag step')
    let lastPath = bistaticAt(PAIR_SPAN_M, 0)
    let lastDbm = echoDbmAt(PAIR_SPAN_M, 0, NEW_SCATTERER_EXTRA_LOSS_DB)
    for (let k = 1; k <= 4; k++) {
      const off = k * stepM!
      const path = bistaticAt(PAIR_SPAN_M, off)
      const dbm = echoDbmAt(PAIR_SPAN_M, off, NEW_SCATTERER_EXTRA_LOSS_DB)
      expect(path, `at ${off} m off the line the bistatic distance rises`).toBeGreaterThan(lastPath)
      expect(dbm, `and the level falls`).toBeLessThan(lastDbm)
      lastPath = path
      lastDbm = dbm
    }
    /*
     * 「把衣柜的反射损耗从 −10 dB 改成 0 dB…回波弱了整整 10 dB，但仍然听得见。再把两台设备拖到
     * 房间两端、相距九米左右：0 dB 的物体一条回波都不剩，而 −10 dB 的衣柜刚好卡在门限上还能
     * 进来」 — four figures, and all four are the floor this engine really gates on.
     */
    const [fromDb, toDb, weakerDb] = figs(TRY,
      /把衣柜的反射损耗从 −(\d+) dB 改成 (\d) dB.*?回波弱了整整 (\d+) dB，但仍然听得见/s,
      '`tryThis` on the ideal reflector')
    expect(-fromDb!, 'the reflectivity it starts from').toBe(NEW_SCATTERER_EXTRA_LOSS_DB)
    expect(toDb, 'and the one it is changed to').toBe(0)
    const atSpan = (span: number, refl: number): number => echoDbmAt(span, 0.2, refl)
    expect(Number((atSpan(PAIR_SPAN_M, -fromDb!) - atSpan(PAIR_SPAN_M, toDb!)).toFixed(6)),
      'how much weaker the ideal one really is').toBe(weakerDb)
    expect(atSpan(PAIR_SPAN_M, toDb!), 'and it is still over the floor')
      .toBeGreaterThan(UWB_RX_SENS_DBM)
    const [farCn] = raw(TRY, /相距(.)米左右/, '`tryThis` on the long baseline')
    const [goneDb, leftDb] = figs(TRY, /：(\d) dB 的物体一条回波都不剩，而 −(\d+) dB 的衣柜刚好卡在门限上/,
      '`tryThis` on what survives at that baseline')
    const far = cn(farCn!)
    /*
     * **Both reflectivities are read as the two the lesson has already defined**, not as any
     * figure that would clear or miss the floor: the one that disappears is the convention's own
     * zero (a square metre, from `sources`) and the one that survives is the object the 🪞 tool
     * writes. A neighbouring decibel would pass the floor comparisons on its own.
     */
    expect(goneDb, 'the one that disappears is the convention’s zero')
      .toBe(figs(SRC, /：(\d) dB 定义为一面理想的一平方米反射面/, '`sources` on the zero')[0])
    expect(-leftDb!, 'and the one that survives is the tool’s own object')
      .toBe(NEW_SCATTERER_EXTRA_LOSS_DB)
    expect(echoDbmAt(far, 0, goneDb!), 'at that baseline the square metre is under the floor')
      .toBeLessThan(UWB_RX_SENS_DBM)
    expect(echoDbmAt(far, 0, -leftDb!), 'while the wardrobe is still over it')
      .toBeGreaterThan(UWB_RX_SENS_DBM)
    expect(echoDbmAt(far, 0, -leftDb!) - UWB_RX_SENS_DBM, '「刚好卡在门限上」: by very little')
      .toBeLessThan(leftDb!)
  })
})
