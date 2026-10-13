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
import { COURSE_ORDER, MODULES, trackOf } from '../../src/course/curriculum'
import { LESSONS } from '../../src/course/lessons'
import { readerTexts } from '../../src/course/readability'
import type { Block, Lesson } from '../../src/course/lessonKit'
import { PHY_MODES } from '../../src/engine/phy'
import type { TimingSpec } from '../../src/course/diagram'
import { echoExcessM } from '../../src/engine/scatter'
import type { TLRecord } from '../../src/model/records'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { C_M_PER_NS, UWB_CHIP_HZ, UWB_CHIP_NS } from '../../src/uwb/phy'
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
describe('uwb-sensing-resolution · the multipath entry quotes a Wi-Fi sentence that exists', () => {
  /** The sentence the entry hands the reader to go and find. */
  const WIFI_QUOTE = '仍然没有的是时延扩展本身与多普勒'
  const entry = (): string => uwbSensingResolution.limits.map((l) => l.text).join(' ')
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
    // and the length it does name is the sensing length, printed from `echoFacts`
    expect(entry()).toContain(`${ECHO_RESOLUTION_M} 米也是感知的长度`)
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
 * Every figure of the table, the caption and the variant labels is interpolated from
 * `src/ui/echoFacts.ts`, and the file above measures those against runs. What is typed into the
 * sentences is a different set, and it is the lesson's whole argument: 「1/B」 six times, the
 * chip rate twice, the chip itself, the 0.60 m it becomes, the two excesses the model flips
 * between, and a quiz option's half chip.
 *
 * **The reads worth naming:**
 *
 *  - **「1/B」 is read as the length it becomes.** The numerator is parsed at all six printings
 *    and multiplied by the chip rate the lesson quotes: one over 499.2 Mchip/s, times c, is the
 *    0.60 m the same lesson prints twice and the `resolutionM` every echo record carries.
 *  - **the flip is read as a straddle.** 「0.56 米与 0.69 米之间并没有一道墙」 names the two
 *    excesses of the two variants, and what makes them that pair is that the threshold lies
 *    between them — which is read, not assumed.
 *  - **「将近一米八」 is solved, not quoted**: the flip offset at a ten-metre baseline comes out
 *    of the same inversion the lesson prints, and the Chinese numeral is read as 1.8.
 *  - **the two chip fractions of `deeper` are exempt (class (a))** — they describe real
 *    receivers and this repo has no corpus for them — but their order is the claim, and that is
 *    read: both are inside one chip, and the closer pair is the worse one.
 */
describe('uwb-sensing-resolution · every figure the prose prints, read back out of it', () => {
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
  const PIC = blockText(uwbSensingResolution.picture)
  const NUMS = blockText(uwbSensingResolution.numbers)
  const DEEP = blockText(uwbSensingResolution.deeper)
  const LIM = blockText(uwbSensingResolution.limits)
  const SRC = blockText(uwbSensingResolution.sources)
  const TRY = blockText(uwbSensingResolution.tryThis)
  const QUIZ = blockText(uwbSensingResolution.quiz)
  const ALL = [PIC, NUMS, DEEP, LIM, SRC, TRY, QUIZ].join('\n')

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
  /** The exact threshold, which is what the engine compares against. */
  const EXACT_M = C_M_PER_NS * UWB_CHIP_NS

  it('reads 「1/B」 at every printing, the chip rate behind it and the length it becomes', () => {
    // 「1/B」 — the picture, the formula line, two steps, two paragraphs of `deeper`, `sources`
    /*
     * Counted over the sections joined together, so a block whose text and whose note both carry
     * it counts twice — the claim being read is not how many times it is written but that every
     * writing has the same numerator, and that the numerator is the one the length comes from.
     */
    const ones = [...ALL.matchAll(/(\d)\/B/g)].map((m) => val(m[1]!))
    expect(ones.length, 'the lesson leans on it throughout').toBeGreaterThanOrEqual(6)
    expect(new Set(ones).size, 'and always with the same numerator').toBe(1)
    // 「499.2 Mchip/s」 — in `deeper` and in `sources`
    const rates = [...ALL.matchAll(/([\d.]+) Mchip\/s/g)].map((m) => val(m[1]!))
    expect(rates.length, 'the chip rate, printed more than once').toBeGreaterThanOrEqual(2)
    expect(new Set(rates).size, 'and the same rate both times').toBe(1)
    expect(rates[0]! * 1e6, 'the chip rate this engine runs').toBe(UWB_CHIP_HZ)
    // 「一个码片 2.003205 ns」
    const [chipNs] = figs(SRC, /一个码片 ([\d.]+) ns/, '`sources` on the chip')
    same(String(chipNs), UWB_CHIP_NS, 'the chip itself')
    same(String(chipNs), (ones[0]! / rates[0]!) * 1000, 'which is one over that rate')
    // 「折成路程约 0.60 米」 in `picture`, and 「乘以光速得到的 0.60 米」 in `sources`
    const lengths = [...ALL.matchAll(/([\d.]+) 米(?:是几何|。所以「分得开」)/g)].map((m) => m[1]!)
    expect(lengths.length, 'the resolution, printed as a length twice').toBe(2)
    for (const printed of lengths) {
      expect(printed, 'the length one chip of flight comes to').toBe(ECHO_RESOLUTION_M)
    }
    expect(Number(ECHO_RESOLUTION_M), 'and that is c times one chip')
      .toBe(Number(((ones[0]! / (rates[0]! * 1e6)) * 1e9 * C_M_PER_NS).toFixed(2)))
    // every echo record carries the same threshold, unrounded
    for (const v of ['pair', 'under', 'over'] as UwbResolutionVariant[]) {
      for (const e of echoes(v)) {
        expect(e.resolutionM, `${v}: the record’s own threshold`).toBeCloseTo(EXACT_M, 12)
      }
    }
  })

  it('reads the straddle: the two excesses the flip lies between', () => {
    /*
     * 「所以表里 0.56 米与 0.69 米之间并没有一道墙」 — in `deeper` and again in `limits`. The two
     * figures are the two variants' own excesses, and what makes them this pair is that the
     * threshold falls between them: that is read here, and it is what the sentence is about.
     */
    for (const [text, what] of [[DEEP, '`deeper`'], [LIM, '`limits`']] as [string, string][]) {
      const [under, over] = figs(text, /([\d.]+) 米与 ([\d.]+) 米之间(?:并)?没有一道墙/,
        `${what} on the two sides of the flip`)
      expect(String(under), `${what}: the excess of the station that cannot be separated`)
        .toBe(ECHO_FLIP_UNDER.excessM)
      expect(String(over), `${what}: and of the one that can`).toBe(ECHO_FLIP_OVER.excessM)
      expect(under, `${what}: the threshold falls between them`).toBeLessThan(EXACT_M)
      expect(over, `${what}: on both sides`).toBeGreaterThan(EXACT_M)
      const u = off('under', 'obj-near')[0] ?? echoes('under')[0]!
      const o = off('over', 'obj-near')[0] ?? echoes('over')[0]!
      expect(u.resolvable, 'and the run agrees about the nearer one').toBe(false)
      expect(o.resolvable, 'and about the further one').toBe(true)
    }
  })

  it('reads `deeper`’s two chip fractions, and the baselines it solves the flip at', () => {
    /*
     * 「差 0.9 个码片时两个峰还能看出是个双峰、只是位置有偏；差 0.3 个码片时它就是一个被拉宽、
     * 拉偏的峰」 — and the paragraph goes on to name the two table rows, so the first fraction is
     * the table's own 「分不开」 station measured in chips: 0.56 m of excess is 0.93 of one, which
     * is why a real receiver would still see two peaks where this engine reports one.
     *
     * **Exempt, class (a): the 0.3.** It is the other end of the same sentence about real
     * correlators — any fraction well inside one chip would make it — and no corpus ships with
     * this repo. What is read is its claim: it is inside one chip, and it is the closer, worse
     * case of the two.
     */
    const fractions = [...DEEP.matchAll(/差 ([\d.]+) 个码片/g)].map((m) => val(m[1]!))
    expect(fractions.length, 'two fractions of a chip').toBe(2)
    for (const f of fractions) expect(f, `${f} chips is inside one chip`).toBeLessThan(1)
    expect(fractions[0], 'and the first is the wider pair').toBeGreaterThan(fractions[1]!)
    expect(fractions[0], 'the first is the table’s own unresolvable station, in chips')
      .toBe(Number((Number(ECHO_FLIP_UNDER.excessM) / EXACT_M).toFixed(1)))
    /*
     * 「2·√((s/2)² + d²) − s = c × 1/B…对 d 解一次就得到 0.87 米（s = 2 米时）。…十米的连线上，
     * 物体要偏出将近一米八才分得开」 — the inversion the lesson prints, read at both baselines.
     */
    const flipAt = (s: number): number => Math.sqrt(((EXACT_M + s) / 2) ** 2 - (s / 2) ** 2)
    const [spanCn] = raw(DEEP, /（s = (\d) 米时）/, '`deeper` on the baseline it solves at')
    expect(val(spanCn!), 'the span this lesson’s own pair is').toBe(PAIR_SPAN_M)
    expect(flipAt(val(spanCn!)).toFixed(2), 'the offset the inversion really gives there')
      .toBe(ECHO_FLIP_OFFSET_M)
    const [tenCn, oneCn, eightCn] = raw(DEEP,
      /(.)米的连线上，物体要偏出将近(.)米(.)才分得开/, '`deeper` on the long baseline')
    const cn = (s: string): number => '零一二三四五六七八九十'.indexOf(s)
    const far = cn(tenCn!)
    const want = cn(oneCn!) + cn(eightCn!) / 10
    expect(Number(flipAt(far).toFixed(1)), 'the offset a ten-metre line really needs').toBe(want)
    expect(flipAt(far), 'which is further out than this lesson’s own').toBeGreaterThan(flipAt(PAIR_SPAN_M))
    // 「再把两台设备拉到四米远…翻转的位置会往外跑」
    const [fourCn] = raw(TRY, /把两台设备拉到(.)米远/, '`tryThis` on the wider pair')
    expect(flipAt(cn(fourCn!)), 'and four metres apart it is further out too')
      .toBeGreaterThan(flipAt(PAIR_SPAN_M))
  })

  it('reads the quiz’s half chip, and the table cell the variant names', () => {
    // 「半个码片，也就是约 0.30 米」 — a wrong option, and its arithmetic is the lesson's own
    const [halfM] = figs(QUIZ, /半个码片，也就是约 ([\d.]+) 米/, 'the quiz’s wrong option')
    same(String(halfM), EXACT_M / 2, 'half a chip, in metres of flight')
    expect(halfM, 'which is less than the offset the right answer gives')
      .toBeLessThan(Number(ECHO_FLIP_OFFSET_M))
    /*
     * 「0.9 m」 — one cell of the four-station table, typed into a string the module builds, and
     * invisible to every sweep before 2026-10-14. It is the offset of the variant whose label
     * the lesson writes with the same figure, and the object really stands there.
     */
    const tb = table(0)
    const offsets = tb.rows.map((r) => val(raw(r[0]!, /^([\d.]+) m$/, 'a station of the table')[0]!))
    expect(offsets, 'the four stations, outward').toEqual([...offsets].sort((a, b) => a - b))
    expect(offsets.includes(Number(ECHO_FLIP_OVER.offM)), 'and one of them is the flip-over one')
      .toBe(true)
    const sc = scenarioOf('over')
    const objs = sc.scatterers ?? []
    expect(objs.length, 'the variant has one object').toBe(1)
    // the offset is measured from the line the two ends stand on, not from the room's origin
    const lineY = sc.nodes.find((n) => n.uwb !== undefined)!.pos.y
    expect(Math.abs(objs[0]!.pos.y - lineY), 'standing exactly that far off the line')
      .toBeCloseTo(Number(ECHO_FLIP_OVER.offM), 9)
  })
})
