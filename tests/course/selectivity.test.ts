/**
 * The `selectivity` lesson against its own scene.
 *
 * Division of labour with the three engine files, because this lesson quotes figures from all
 * of them and the point of the split is that a reader can tell which instrument each came off:
 *
 *  - **tests/engine/selectivity.test.ts** — the 12.05 / 24.09 dB deepest-bin means and the
 *    2.36 dB median loss, over 40 000 draws. Not re-measured here.
 *  - **tests/engine/selectivity-inert.test.ts** — the five pooled drop rates (14.39 … 0.52 %)
 *    and the 3.62 dB margin they share, over 45 runs at nine power offsets. Not re-measured
 *    here; this file only checks that the lesson prints them as *rates*, says the margin was
 *    held comparable, and keeps that group's sentence apart from its own scene's.
 *  - **this file** — everything the lesson says about *its own five variants*: the bin counts,
 *    the deepest bin a single round shows, the loss that barely moves, the margin the rate loop
 *    settles each width at, and the rate-ladder claim its second `tryThis` makes.
 *
 * **Why the scene needs its own pins at all.** The lesson's scene is the round sweep, not the
 * pooled group: here 20 MHz settles a whole rate step higher (6.62 dB against 3.62) and is
 * therefore *not* the width that drops the most — while in the pooled group at equal margin it
 * is. Both statements are true of their own data set and the slice's review found a draft that
 * mixed them inside one sentence (finding 1, HIGH). So the lesson states each with its
 * instrument named, and both halves are asserted below: the quoted 14.39 % stays attached to
 * 「这一组」, and the scene's own margins are measured rather than assumed.
 */
import { describe, it, expect } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { COURSE_ORDER } from '../../src/course/curriculum'
import { lessonStrings } from '../../src/course/readability'
import { Simulation } from '../../src/engine/simulation'
import { selBinWidthMhz, selBins } from '../../src/engine/selectivity'
import { noiseDbm } from '../../src/engine/phy'
import type { Block } from '../../src/course/lessonKit'
import type { Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000
/** The fixture's own run length, so what a reader sees first is what is measured here. */
const RUN_NS = 150 * MS
const WIDTHS = [20, 40, 80, 160, 320] as const

const lesson = LESSONS.find((l) => l.id === 'selectivity')!
const variant = (i: number): Scenario => lesson.variants![i].scenario()

const run = (sc: Scenario, ns: number): TLRecord[] => [...new Simulation(sc).runUntil(ns).records]
const ofType = <K extends TLRecord['type']>(rs: TLRecord[], t: K): Extract<TLRecord, { type: K }>[] =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === t)
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length / 2))]
}

/** One variant's round, read back out of the records the way the lesson reads it. */
interface Row {
  w: number
  bins: number
  /** Median of `meanSinrDb − threshDb`: the room the rate loop settled this width at. */
  marginDb: number
  medWorstDb: number
  medLossDb: number
  fails: number
  ppdus: number
  dropRate: number
  /** Every rung the uplink's data PPDUs used, lowest first. */
  mcs: number[]
}

/** The same width with the `selectivity` section removed: the same fading, flat across the channel. */
const flatOf = (sc: Scenario): Scenario => {
  const { selectivity: _off, ...rest } = sc
  return rest
}

const mcsUsed = (rs: TLRecord[]): number[] => [...new Set(
  ofType(rs, 'TX_START')
    .filter((r) => r.frame.kind === 'data' && r.frame.src === 'sta-1' && r.frame.mcs !== undefined)
    .map((r) => r.frame.mcs!),
)].sort((a, b) => a - b)

const rowOf = (i: number): Row => {
  const sc = variant(i)
  const rs = run(sc, RUN_NS)
  const sels = ofType(rs, 'WIFI_SEL').filter((s) => s.from === 'sta-1')
  expect(sels.length, `${WIDTHS[i]} MHz: no uplink reception to read`).toBeGreaterThan(50)
  const fails = ofType(rs, 'RX_FAIL').filter((r) => r.reason === 'lowSinr').length
  const ppdus = ofType(rs, 'TX_START')
    .filter((r) => r.frame.kind === 'data' && r.frame.src === 'sta-1').length
  return {
    w: WIDTHS[i],
    bins: sels[0].bins,
    marginDb: median(sels.map((s) => s.meanSinrDb - s.threshDb)),
    medWorstDb: median(sels.map((s) => s.worstBinDb)),
    medLossDb: median(sels.map((s) => s.lossDb)),
    fails, ppdus, dropRate: fails / ppdus,
    mcs: mcsUsed(rs),
  }
}

/** Every string a reader sees, `limits` included. */
const text = [...lessonStrings(lesson), lesson.title, ...lesson.limits.map((l) => l.text)].join('\n')
/** The main path only: what the five figures are printed in. */
const mainText = lessonStrings(lesson).join('\n')

describe('selectivity · where it sits and what it ships', () => {
  it('follows `width` and precedes `streams`, which is the whole reason it exists there', () => {
    expect(COURSE_ORDER.indexOf('selectivity')).toBe(COURSE_ORDER.indexOf('width') + 1)
    expect(COURSE_ORDER.indexOf('streams')).toBe(COURSE_ORDER.indexOf('selectivity') + 1)
    // `width` is the lesson this one unfolds, so it has to be a prerequisite rather than a
    // neighbour by accident.
    expect(lesson.needs).toContain('width')
  })

  it('carries a scene the schema can only accept with both sections, at all five widths', () => {
    // The three refusals of `ScenarioSchema`'s superRefine, as properties of the shipped scene:
    // a `fading` section, a distribution that is not `none`, and an OFDM link. The schema itself
    // is run over every lesson scenario by tests/course/lessons.test.ts.
    for (const sc of [lesson.scenario(), ...WIDTHS.map((_w, i) => variant(i))]) {
      expect(sc.selectivity).toEqual({})
      expect(sc.fading?.smallScale).toBe('rayleigh')
      expect(sc.nodes.some((n) => n.caps.generation === 'eht')).toBe(true)
    }
    expect(lesson.variants!.map((v) => v.label)).toEqual(WIDTHS.map((w) => `${w} MHz`))
    // 320 MHz is in the list although `width` stops at 160: the lesson prints 24.09 dB and
    // 0.52 % at 144 bins, and a figure the scene cannot reach is a figure taken on trust.
    expect(lesson.variants!.map((v) => v.scenario().nodes[0].caps.widthMhz)).toEqual([...WIDTHS])
  })

  it('prints a bin table computed from the engine, not typed into the prose', () => {
    const table = lesson.numbers!
      .filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
      .find((b) => b.heading?.includes('格宽与格数'))!
    expect(table.rows.map((r) => r[0])).toEqual(WIDTHS.map(String))
    expect(table.rows.map((r) => r[1])).toEqual(WIDTHS.map((w) => String(selBins(w))))
    for (const r of table.rows) expect(r[2]).toBe(selBinWidthMhz().toString())
    // And the width is the standard's arithmetic rather than a decorated literal.
    expect(selBinWidthMhz()).toBeCloseTo(2.03125, 5)
    expect(mainText).toContain('2.03125')
  })

  it('resolves all three of its jump targets in the scene it loads', () => {
    const rs = run(lesson.scenario(), RUN_NS)
    for (const j of lesson.jumps) expect(rs.some(j.find), j.label).toBe(true)
  })
})

describe('selectivity · the figures the lesson reads off its own five rounds', () => {
  /**
   * One sweep for the file: five 150 ms rounds plus their five flat controls.
   *
   * Measured 2026-10-03. Margins 6.62 / 3.62 / 3.62 / 3.62 / 3.62 dB; deepest bin's median
   * −10.08 / −13.77 / −16.96 / −19.91 / −23.21 dB; median loss 2.02 / 2.27 / 2.35 / 2.34 /
   * 2.36 dB; drop rates 6.48 / 9.38 / 7.53 / 3.09 / 0.46 %.
   */
  let rows: Row[] = []
  const sweep = (): Row[] => {
    if (rows.length === 0) rows = WIDTHS.map((_w, i) => rowOf(i))
    return rows
  }

  it('splits every width into the standard\'s own number of bins', () => {
    expect(sweep().map((r) => r.bins)).toEqual(WIDTHS.map(selBins))
  })

  it('deepens the worst bin by about 3 dB a doubling — the observe line\'s 10 dB to 23 dB', () => {
    const rs = sweep()
    // The two ends the observe line names, as ranges rather than exact figures because that is
    // how it names them ("约 10 dB" … "约 23 dB").
    expect(Math.abs(rs[0].medWorstDb)).toBeGreaterThan(9.5)
    expect(Math.abs(rs[0].medWorstDb)).toBeLessThan(10.5)
    expect(Math.abs(rs[4].medWorstDb)).toBeGreaterThan(22.5)
    expect(Math.abs(rs[4].medWorstDb)).toBeLessThan(23.5)
    for (let i = 1; i < rs.length; i++) {
      const deepening = rs[i - 1].medWorstDb - rs[i].medWorstDb
      expect(deepening, `${rs[i].w} MHz against ${rs[i - 1].w} MHz`).toBeGreaterThan(2)
      expect(deepening, `${rs[i].w} MHz against ${rs[i - 1].w} MHz`).toBeLessThan(4.5)
    }
  })

  it('shows the 10.08 dB the lesson warns a round will show, against the table\'s 12.05 dB', () => {
    // The gap the lesson spends a paragraph on: the table is a mean over 40 000 draws
    // (tests/engine/selectivity.test.ts), one round of this scene is ~2 dB shallower, and a
    // reader must find that explained rather than discover it in the event log.
    expect(sweep()[0].medWorstDb).toBeCloseTo(-10.08, 1)
    expect(mainText).toContain('10.08 dB')
    expect(mainText).toContain('12.05 dB')
    expect(mainText).toContain('四万次抽样下的均值')
  })

  it('holds the loss near 2 dB across the whole span, which is the second observe line', () => {
    const rs = sweep()
    expect(rs[0].medLossDb).toBeCloseTo(2.02, 1)
    expect(rs[4].medLossDb).toBeCloseTo(2.36, 1)
    // The pair is the argument: the deepest bin falls 13 dB while the loss rises a third of one.
    expect(Math.max(...rs.map((r) => r.medLossDb)) - Math.min(...rs.map((r) => r.medLossDb)))
      .toBeLessThan(1)
    expect(mainText).toContain('2.02 dB')
    expect(mainText).toContain('2.36 dB')
  })

  /**
   * **The one claim that keeps the two data sets apart**, and the reason this file exists.
   *
   * In this scene the rate loop settles 20 MHz a whole step higher than the other four, so its
   * drop rate is NOT the highest — which is exactly what the lesson's own quiz explanation says
   * about its own scene, and the opposite of what the pooled group at equal margin says. If this
   * ever stops holding, the quiz is wrong and the sentence has to move with the measurement.
   */
  it('settles 20 MHz a step higher, so its own scene is NOT the pooled group', () => {
    const rs = sweep()
    expect(rs[0].marginDb).toBeCloseTo(6.62, 1)
    for (const r of rs.slice(1)) expect(r.marginDb, `${r.w} MHz`).toBeCloseTo(3.62, 1)
    // …and therefore the narrowest width is not the one that drops most here.
    expect(rs[0].dropRate).toBeLessThan(Math.max(...rs.map((r) => r.dropRate)))
    // Among the four that DO share a margin, the direction the lesson teaches holds in the scene
    // too — strictly, with no pooling.
    const matched = rs.slice(1)
    for (let i = 1; i < matched.length; i++) {
      expect(matched[i].dropRate, `${matched[i].w} against ${matched[i - 1].w} MHz`)
        .toBeLessThan(matched[i - 1].dropRate)
    }
    // Non-vacuous at both ends: frames are actually lost at 40 MHz and nearly none at 320.
    expect(matched[0].dropRate).toBeGreaterThan(0.05)
    expect(matched[matched.length - 1].dropRate).toBeGreaterThan(0)
  })

  /**
   * The second `tryThis`'s warning, measured: unticking the box does not merely remove a loss.
   * A flat draw fades the whole PPDU at once, so a deep one kills it outright and the rate loop
   * answers by stepping down — in the flat run every width visits the ladder's lowest rung, in
   * the per-bin run none of them does. So the two runs cannot be compared by drop count, which
   * is what the lesson tells the reader before they try it.
   */
  it('sends every width to the lowest rung with the section off, and none with it on', () => {
    for (let i = 0; i < WIDTHS.length; i++) {
      const on = mcsUsed(run(variant(i), RUN_NS))
      const flat = mcsUsed(run(flatOf(variant(i)), RUN_NS))
      expect(flat, `${WIDTHS[i]} MHz flat`).toContain(0)
      expect(on[0], `${WIDTHS[i]} MHz per-bin`).toBeGreaterThan(0)
    }
  })
})

describe('selectivity · the three sentences this slice may not write', () => {
  it('prints drop RATES, at a margin it says is comparable, from the group that has five widths', () => {
    for (const r of ['14.39 %', '12.71 %', '9.48 %', '5.09 %', '0.52 %']) expect(mainText).toContain(r)
    expect(mainText).toContain('3.62 dB')
    expect(mainText).toContain('掉帧率而不是掉帧数')
    expect(mainText).toContain('空口时间')
  })

  it('never prints a count from the other data set', () => {
    // 14/44/47/23/4 failures and 252/871 PPDUs are the four-width round sweep's; the rates above
    // are the pooled five-width group's. One sentence, one data set (review finding 4d).
    for (const n of ['14、44', '44、47', '871', '252']) expect(text).not.toContain(n)
  })

  it('never prints the open-loop figures, which no lesson run produces', () => {
    expect(text).not.toContain('34.43')
    expect(text).not.toContain('7.14')
  })

  it('says "20 MHz is the worst" only of the pooled group, and names its own scene separately', () => {
    // The sentence about the group carries 「这一组」; the sentence about the scene carries
    // 「这一课的场景」. Neither claim is allowed to float free of its instrument.
    expect(mainText).toContain('在这一组里，最窄那一档正是掉帧最多的那一个')
    expect(mainText).toContain('这一课的场景只有五轮，余量并不这样齐')
    expect(mainText).toContain('这一课的场景正是例子')
  })

  /**
   * The guard that moved here with the figure (it was tests/course/width.test.ts's until Task 7
   * shortened that entry): 12.04 dB is what 20 → 320 MHz ADDS to the floor, and the floor itself
   * is in dBm — "a 12.04 dB noise floor" would contradict `width`'s own table. Computed from the
   * engine rather than typed, so the sentence cannot drift away from `noiseDbm`.
   */
  it('names the 12.04 dB as the RAISE in the floor, computed from the engine', () => {
    expect(mainText).toContain(`从 20 到 320 MHz 抬高了 ${(noiseDbm(320) - noiseDbm(20)).toFixed(2)} dB`)
    expect(text).not.toContain('12.04 dB 的噪声地板')
  })

  it('does not say frequency selectivity costs a strong link extra frames', () => {
    // On a margin-rich link the per-bin path REPLACES the flat draw rather than stacking on it,
    // and it removes that draw's consequence (tests/engine/selectivity-inert.test.ts). The
    // lesson states the replacement and never the opposite.
    expect(mainText).toContain('替换那一次平坦抽样')
    expect(text).not.toContain('多掉帧')
  })
})

describe('selectivity · the four limits are each about this engine', () => {
  const byKind = new Map(lesson.limits.map((l) => [l.kind, l.text]))

  it('names all four kinds, once each', () => {
    expect([...byKind.keys()].sort()).toEqual(['model-value', 'out-of-scope', 'threshold', 'unmodelled'])
    expect(lesson.limits.length).toBe(4)
  })

  it('model-value: the distribution and the K factor come from `fading`, not from the standard', () => {
    expect(byKind.get('model-value')).toContain('fading')
    expect(byKind.get('model-value')).toContain('6 dB')
  })

  it('unmodelled: the bins are independent, which is the side with too much diversity', () => {
    expect(byKind.get('unmodelled')).toContain('格间相关')
    expect(byKind.get('unmodelled')).toContain('独立是分集偏多的那一边')
  })

  it('threshold: capacity is an upper bound, so every loss here is a lower bound', () => {
    expect(byKind.get('threshold')).toContain('下界')
    expect(byKind.get('threshold')).toContain('容量')
  })

  it('out-of-scope: the other four decisions, and the multi-user bin count slice 4b owes', () => {
    const t = byKind.get('out-of-scope')!
    for (const s of ['resolveLock', '载波侦听', '前导检测', '捕获效应', '资源单元']) expect(t).toContain(s)
  })
})
