/**
 * The `ru-diversity` lesson against its own scene.
 *
 * **Every figure the lesson prints is measured here**, and the division of labour with the
 * engine files is the same one `selectivity.test.ts` sets out — a reader has to be able to tell
 * which instrument each number came off:
 *
 *  - **tests/engine/selectivity-round.test.ts** holds this slice's publication gate: the
 *    3.547 dB margin group, the 282/74 and 138/25 legs, and the counterfactual chain over the
 *    two shares the scene cannot build. Those three are re-measured here, because the lesson
 *    prints them and a lesson's figures get a pin in the lesson's own file.
 *  - **tests/engine/selectivity.test.ts** holds the scale-free form of "position buys nothing"
 *    (the spread of the six four-bin windows against the standard error of the means it is a
 *    spread of). The lesson states that claim without a number, and the claim is re-checked
 *    here at a smaller N — which is the whole point of a scale-free bound.
 *  - **this file** holds everything else: the scene (MCS 0, two equal links, 346 of 347 sends
 *    split in two), the loss distribution the lesson's central paragraph reads, the deepest-bin
 *    pair that runs the other way, the position sweep that locates the window's lower edge, the
 *    payload asymmetry behind the new `unmodelled` entry, and the uplink figure in `limits`.
 *
 * **Three sets of numbers this lesson may not print**, each one a finding of this slice rather
 * than a style rule, and each pinned as absent below:
 *
 *  - **the design doc's own 「九格 2.31 dB、四格 2.20 dB」 and 「p90 从 4.70 涨到 5.85」**
 *    (§7.2). They are `ofdma-dl`'s scene, not this one, and they are false here: measured on
 *    the gate's own population this scene gives 2.167 → 1.804 dB at the median and
 *    4.439 → 5.420 dB at p90. The lesson prints its own.
 *  - **「相差 0.02 dB」 about position** (§3.2.1). The true spread is exactly zero and every
 *    reported value is Monte-Carlo noise — 0.0207 dB at 20 000 draws, 0.0296 at 50 000, 0.0070
 *    at 100 000, not even monotone. Printing any of them would publish an artifact.
 *  - **the uplink's −0.383 dB and 82–86 %, and the scene comment's 13 dB and 15.5 dB.** None of
 *    the four is pinned anywhere in this repository, and the first two are a scene this lesson
 *    does not ship. The lesson states the uplink *mechanism* and prints only the uplink figure
 *    measured here, on a published scene.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LESSONS } from '../../src/course/lessons'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import { lessonStrings } from '../../src/course/readability'
import {
  DF_EHT_KHZ, RU26_PER_20MHZ, RU26_TONES,
  selBinWidthMhz, selBins, selEffSinrDb, selMemberBins,
} from '../../src/engine/selectivity'
import { WALL_LOSS_DB, buildLinkTable } from '../../src/engine/propagation'
import { smallScaleDb, type FadingCfg } from '../../src/engine/fading'
import { Simulation } from '../../src/engine/simulation'
import { fmtRecord } from '../../src/ui/format'
import { node } from '../../src/course/lessonKit'
import { ruDiversityScenario } from '../../src/course/wifiScenes'
import { selRowDecoded, selRows } from '../engine/selectivity-pairing'
import type { Block } from '../../src/course/lessonKit'
import type { Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** The lesson's own reading length, and the one the hash fixture records. */
const RUN_NS = 150 * MS
/** The length every figure in the lesson is measured over, stated in the prose beside them. */
const GATE_NS = 1000 * MS

const lesson = LESSONS.find((l) => l.id === 'ru-diversity')!
/** The base scene is variant 0; the 9-bin leg is variant 1. */
const SPLIT = undefined
const WHOLE = 1

const RAYLEIGH: FadingCfg = { shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'rayleigh' }

const q = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!
}
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length

const runs = new Map<string, TLRecord[]>()
const runScene = (key: string, sc: Scenario, ns = GATE_NS): TLRecord[] => {
  const hit = runs.get(key)
  if (hit) return hit
  const rs = [...new Simulation(sc).runUntil(ns).records]
  runs.set(key, rs)
  return rs
}

/** One downlink reception a television was addressed in — the gate's own population. */
interface Row {
  margin: number
  meanSinrDb: number
  threshDb: number
  lossDb: number
  worstBinDb: number
  bins: number
  ruFraction: number | undefined
  failed: boolean
}

/**
 * Addressed receptions only, exactly as the gate reads them: an overhearer reads the whole
 * channel off the preamble, so pooling it with the members would put two populations under one
 * bin count. Copied in shape from `tests/engine/selectivity-round.test.ts`'s `dlRows`, and the
 * pairing itself is imported rather than re-rolled — `selectivity-pairing.ts`'s own header
 * records what two independent pairings cost this programme.
 */
const dlRows = (rs: TLRecord[]): Row[] => selRows(rs)
  .filter((x) => x.frame.kind === 'data' && x.sel.from === 'ap'
    && (x.part !== undefined || x.frame.dst === x.sel.node))
  .map((x) => ({
    margin: x.sel.meanSinrDb - x.sel.threshDb,
    meanSinrDb: x.sel.meanSinrDb,
    threshDb: x.sel.threshDb,
    lossDb: x.sel.lossDb,
    worstBinDb: x.sel.worstBinDb,
    bins: x.sel.bins,
    ruFraction: x.sel.ruFraction,
    failed: !selRowDecoded(rs, x),
  }))

/** The grouping rule, fixed before any rate below is read: by raw margin, largest group, name nothing. */
const largestMarginGroup = (rows: Row[]): Row[] => {
  const groups = new Map<number, Row[]>()
  for (const r of rows) groups.set(r.margin, [...(groups.get(r.margin) ?? []), r])
  return [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? []
}

const dropRate = (xs: Row[]): number => xs.filter((x) => x.failed).length / xs.length

/** Both legs of the gate, on the lesson's own two variants. */
interface Legs { group: Row[]; key: number; half: Row[]; whole: Row[]; on: Row[] }
let legsMemo: Legs | undefined
const legs = (): Legs => {
  if (legsMemo) return legsMemo
  const on = dlRows(runOf(lesson, SPLIT, GATE_NS))
  const off = dlRows(runOf(lesson, WHOLE, GATE_NS))
  const group = largestMarginGroup(on)
  const key = group[0]!.margin
  legsMemo = {
    on, group, key,
    half: group.filter((r) => r.ruFraction !== undefined),
    whole: off.filter((r) => r.margin === key),
  }
  return legsMemo
}

/** Every string a reader sees, `limits`, title and labels included. */
const text = [
  ...lessonStrings(lesson), lesson.title,
  ...lesson.limits.map((l) => l.text),
  ...(lesson.variants ?? []).map((v) => v.label), ...lesson.jumps.map((j) => j.label),
].join('\n')
/** The main path only: what the figures are printed in. */
const mainText = lessonStrings({
  why: lesson.why, outcomes: lesson.outcomes, terms: lesson.terms,
  picture: lesson.picture, numbers: lesson.numbers,
  observe: lesson.observe, tryThis: lesson.tryThis, quiz: lesson.quiz,
}).join('\n')
const deeperText = lessonStrings({ deeper: lesson.deeper }).join('\n')
const limitsText = lesson.limits.map((l) => l.text).join('\n')

lessonShapeSuite(lesson, { runNs: RUN_NS })

describe('ru-diversity · where it sits and what it ships', () => {
  it('follows `ofdma-dl` and precedes `ofdma-ul`, with both prerequisites behind it', () => {
    expect(COURSE_ORDER.indexOf('ru-diversity')).toBe(COURSE_ORDER.indexOf('ofdma-dl') + 1)
    expect(COURSE_ORDER.indexOf('ofdma-ul')).toBe(COURSE_ORDER.indexOf('ru-diversity') + 1)
    expect(lesson.needs).toEqual(['ofdma-dl', 'selectivity'])
    // Both are hard dependencies: without the first the reader does not know what is being
    // split, without the second they do not know what a bin is. Both have to precede it.
    for (const id of lesson.needs!) {
      expect(COURSE_ORDER.indexOf(id)).toBeLessThan(COURSE_ORDER.indexOf('ru-diversity'))
    }
    expect(MODULES[lesson.module].title).toBe('被调度的 Wi-Fi 6/7')
    expect(lesson.module).toBe(LESSONS.find((l) => l.id === 'ofdma-dl')!.module)
  })

  it('ships the two legs as its own variants, and the schema accepts both', () => {
    expect(lesson.variants!.map((v) => v.label)).toEqual(['两个成员（各四格）', '分片关掉（整条九格）'])
    // Variant 0 is the base scene, so a reader flipping the switch flips one capability and
    // nothing else; the fixture records both and they have to be the same run.
    expect(lesson.variants![0]!.scenario()).toEqual(lesson.scenario())
    for (const sc of [lesson.scenario(), ...lesson.variants!.map((v) => v.scenario())]) {
      // The three properties `ScenarioSchema`'s selectivity refusals ask for, as shipped.
      expect(sc.selectivity).toEqual({})
      expect(sc.fading).toEqual(RAYLEIGH)
      expect(sc.nodes.every((n) => n.caps.generation === 'eht')).toBe(true)
      // This slice touches the OFDMA path only, so the scene may not be able to negotiate the
      // other one: absent from `features`, not merely false.
      for (const n of sc.nodes) expect('mumimo' in (n.caps.features ?? {}), n.id).toBe(false)
      expect(new Set(sc.nodes.map((n) => n.caps.widthMhz))).toEqual(new Set([20]))
      expect(new Set(sc.nodes.map((n) => n.caps.nss))).toEqual(new Set([1]))
    }
    const [a, b] = lesson.variants!.map((v) => v.scenario())
    expect(a!.nodes.map((n) => n.caps.features?.ofdma)).toEqual(a!.nodes.map(() => true))
    expect(b!.nodes.map((n) => n.caps.features?.ofdma)).toEqual(b!.nodes.map(() => false))
  })
})

describe('ru-diversity · the arithmetic the prose interpolates', () => {
  it('prints the bin geometry off the engine, never as a literal', () => {
    expect(selBins(20)).toBe(9)
    expect(selMemberBins(20, 1 / 2)).toBe(4)
    expect(selBins(20) / 2).toBe(4.5)
    expect(selBinWidthMhz()).toBeCloseTo(2.03125, 5)
    expect(mainText).toContain('2.03125')
    // The two figures the watch call-out and the observe line both read off a record.
    expect(mainText).toContain(`over bins 0–${selMemberBins(20, 1 / 2) - 1} of ${selBins(20)}`)
    expect(mainText).toContain('第 8 格（格号从 0 数起）两台都没拿')
    expect(selBins(20) - 1).toBe(8)
    // …and the standard's two constants the `sources` quote.
    expect(RU26_TONES).toBe(26)
    expect(DF_EHT_KHZ).toBe(78.125)
    expect(RU26_PER_20MHZ).toBe(9)
  })

  /**
   * The share table, cell by cell, against the engine's own two functions — and the claim the
   * formula's note makes about it: of the fifteen (bandwidth, member count) combinations this
   * engine can build, exactly three do not divide into whole bins.
   */
  it('builds every cell of the share table from selBins and selMemberBins', () => {
    const table = lesson.numbers!
      .filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
      .find((b) => b.heading?.includes('谁也没拿的那几格'))!
    expect(table.rows.length).toBe(6)
    const want = ([w, n]: readonly [number, number]): string[] => [
      `${w} MHz，${n} 个成员`,
      String(selBins(w)),
      String(selBins(w) / n),
      String(selMemberBins(w, 1 / n)),
    ]
    const cases = [[20, 2], [20, 3], [20, 4], [40, 2], [40, 3], [40, 4]] as const
    expect(table.rows.map((r) => r.slice(0, 4))).toEqual(cases.map(want))
    // The last column is the one thing that is not arithmetic, so it is checked against the
    // arithmetic: a row may only claim leftover bins when the engine leaves that many over.
    for (const [i, [w, n]] of cases.entries()) {
      const left = selBins(w) - n * selMemberBins(w, 1 / n)
      const cell = table.rows[i]![4]!
      if (left === 0) expect(cell, `${w}/${n}`).toBe('没有')
      else expect(cell, `${w}/${n}`).toContain(`${left} 格`)
    }
    expect(cases.map(([w, n]) => selBins(w) - n * selMemberBins(w, 1 / n))).toEqual([1, 0, 1, 0, 0, 2])
    // 40 MHz loses TWO bins and has no middle one — the clause the design doc's 2026-10-04
    // correction says a lesson gets caught on if it says 「那一格」 in general.
    expect(table.rows[5]![4]).toContain('RU 5 与 RU 14')
    expect(table.rows[5]![4]).toContain('18 是偶数')
    expect(selBins(40) % 2).toBe(0)
  })

  it('pins the "three of fifteen" claim the formula note makes', () => {
    const widths = [20, 40, 80, 160, 320]
    const counts = [2, 3, 4]
    const combos = widths.flatMap((w) => counts.map((n) => selBins(w) / n))
    expect(combos.length).toBe(15)
    expect(combos.filter((x) => !Number.isInteger(x)).length).toBe(3)
    expect(mainText).toContain('十五种（带宽，成员数）组合里只有三种等分不出整数格')
  })

  /** The MU-MIMO-within-OFDMA floors `limits` and `sources` both quote, folded into bins. */
  it('folds the two tone floors into the four and nine bins the limits quote', () => {
    expect(Math.floor(106 / RU26_TONES)).toBe(4)
    expect(Math.floor(242 / RU26_TONES)).toBe(9)
    // 242 tones IS the whole 20 MHz channel, which is why EHT has no such case at 20 MHz.
    expect(Math.floor(242 / RU26_TONES)).toBe(selBins(20))
    expect(limitsText).toContain('HE 不小于 106 音调、EHT 不小于 242 音调')
    expect(limitsText).toContain('最少四格与九格')
  })
})

describe('ru-diversity · the scene, before any of it is read as evidence', () => {
  /**
   * The three physical facts the picture section states, and a reader meets on the first screen.
   *
   * **Instrument**: the shipped scene on the builder's own seed 7, over `GATE_NS` (1000 ms).
   */
  it('runs every downlink frame at the lowest rung, on two links that are equal to the bit', () => {
    const rs = runOf(lesson, SPLIT, GATE_NS)
    const dl = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'data' && r.frame.src === 'ap')
    expect(dl.length).toBe(347)
    expect(new Set(dl.map((r) => r.frame.mcs))).toEqual(new Set([0]))
    expect(mainText).toContain('每一帧都走最低一级的调制与编码方式')

    const sc = lesson.scenario()
    const links = buildLinkTable(sc.nodes, sc.walls)
    const toTv1 = links.get('ap')!.get('sta-1')!
    const toTv2 = links.get('ap')!.get('sta-2')!
    // Equal to the last bit, which is what lets the gate compare two legs at one margin.
    expect(toTv1).toBe(toTv2)
    expect(toTv1).toBeCloseTo(-81.45, 2)
    expect(mainText).toContain('只剩约 −81 dBm')
  })

  it('puts two brick walls between the router and the televisions, 12 dB each', () => {
    expect(WALL_LOSS_DB.brick).toBe(12)
    const sc = lesson.scenario()
    const inner = (w: { x1: number; x2: number }): boolean => w.x1 === w.x2 && (w.x1 === 6 || w.x1 === 11)
    expect(sc.walls.filter(inner).length).toBe(2)
    const bare = buildLinkTable(sc.nodes, sc.walls.filter((w) => !inner(w)))
    const walled = buildLinkTable(sc.nodes, sc.walls)
    // The whole difference between this scene and a one-room one is the two partitions, and
    // it is exactly 2 x 12 dB — the engine's own material constant, never a number chosen here.
    expect(bare.get('ap')!.get('sta-1')! - walled.get('ap')!.get('sta-1')!)
      .toBeCloseTo(2 * WALL_LOSS_DB.brick, 6)
    expect(mainText).toContain('两道砖墙各吃掉十二个分贝')
  })

  it('splits all but one of its downlink sends in two, on the OFDMA path only', () => {
    const rs = runOf(lesson, SPLIT, GATE_NS)
    const dl = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'data' && r.frame.src === 'ap')
    const mu = dl.filter((r) => r.frame.muParts !== undefined)
    expect(mu.length).toBe(346)
    expect(new Set(mu.map((r) => r.frame.muParts!.length))).toEqual(new Set([2]))
    expect(new Set(mu.map((r) => r.frame.muKind))).toEqual(new Set(['ofdma']))
    const members = selRows(rs).filter((x) => x.sel.ruFraction !== undefined)
    expect(new Set(members.map((x) => x.sel.ruFraction))).toEqual(new Set([1 / 2]))
    expect(new Set(members.map((x) => x.sel.bins))).toEqual(new Set([selMemberBins(20, 1 / 2)]))
    // Both starts occur, which is the observe line's 「哪台电视拿前一段并不固定」.
    expect(new Set(members.map((x) => x.sel.binStart))).toEqual(new Set([0, selMemberBins(20, 1 / 2)]))
    const starts = new Map<string, Set<number>>()
    for (const m of members) starts.set(m.sel.node, new Set([...(starts.get(m.sel.node) ?? []), m.sel.binStart]))
    for (const [id, s] of starts) expect(s.size, `${id} always took the same run`).toBe(2)
  })

  /**
   * **The event-log line the watch call-out and the first observe line quote, character for
   * character.** The lesson used to describe the pre-4b wording (`over 9`, a `start` field),
   * which the log has never printed since Task 3 gave a member row its own span — a lesson that
   * names a field by the wrong name sends the reader looking for something that is not there.
   * So the two strings are taken off `fmtRecord` rather than from memory.
   */
  it('quotes the event log’s own words for a member row and for a whole-channel one', () => {
    const rs = runOf(lesson, SPLIT, GATE_NS)
    const sels = ofType(rs, 'WIFI_SEL')
    const member = sels.find((r) => r.ruFraction !== undefined)!
    const whole = sels.find((r) => r.ruFraction === undefined)!
    // Exactly one send of the whole round was not grouped, which is what the observe line says.
    expect(sels.filter((r) => r.ruFraction === undefined).length).toBe(1)
    expect(sels.length).toBe(292)
    const spans = new Set(sels.filter((r) => r.ruFraction !== undefined).map((r) => {
      const m = /\(loss [^)]*over (.*)\)$/.exec(fmtRecord(r))
      return m![1]!
    }))
    expect(spans).toEqual(new Set([
      'bins 0–3 of 9, its 1/2 of the channel',
      'bins 4–7 of 9, its 1/2 of the channel',
    ]))
    expect(fmtRecord(whole)).toContain('over 9 bins')
    expect(fmtRecord(member)).toMatch(/^sta-\d ⇠ ap selectivity: mean 12\.5 dB, worst bin /)
    expect(fmtRecord(member)).toContain('effective ')
    // Every phrase the lesson puts in front of the reader has to be one of those.
    for (const q of ['over bins 0–3 of 9, its 1/2 of the channel', 'bins 4–7 of 9',
      `over ${selBins(20)} bins`, 'mean、worst bin 与 effective']) {
      expect(mainText, q).toContain(q)
    }
    // …and the field names the lesson no longer claims the log prints.
    expect(mainText).not.toContain('start 是')
    expect(mainText).not.toContain('门限 8.99')
    expect(fmtRecord(member)).not.toContain('start')
    expect(fmtRecord(member)).not.toContain('thresh')
  })

  it('shows what a reader sees at the lesson’s own 150 ms, so every jump exists there', () => {
    const rs = runOf(lesson, SPLIT, RUN_NS)
    expect(ofType(rs, 'TX_START').filter((r) => r.frame.muParts !== undefined).length).toBe(52)
    expect(selRows(rs).filter((x) => x.sel.ruFraction !== undefined).length).toBe(44)
    expect(ofType(rs, 'RX_FAIL').filter((r) => r.reason === 'lowSinr').length).toBe(10)
  })
})

describe('ru-diversity · the two legs, at one measured margin', () => {
  /**
   * The gate's headline pair, re-measured here because the lesson's table prints it.
   *
   * **Instrument**: both variants over `GATE_NS` (1000 ms), seed 7, downlink data receptions a
   * television was addressed in, grouped by raw measured margin, largest group — and the rule
   * is fixed above, before any rate here is read.
   */
  it('measures 26.24 % on four bins against 18.12 % on nine, strictly', () => {
    const { on, group, key, half, whole } = legs()
    expect(on.length).toBe(292)
    expect(group.length).toBe(283)
    expect(key).toBeCloseTo(3.547, 3)
    expect(group.length / on.length).toBeGreaterThan(0.9)
    expect(half.length).toBe(282)
    expect(whole.length).toBe(138)
    expect(new Set(half.map((r) => r.bins))).toEqual(new Set([selMemberBins(20, 1 / 2)]))
    expect(new Set(whole.map((r) => r.bins))).toEqual(new Set([selBins(20)]))
    // Non-vacuous: the nine-bin leg has to lose frames too, or the pair says nothing.
    expect(dropRate(whole)).toBeGreaterThan(0)
    expect(dropRate(half)).toBeGreaterThan(dropRate(whole))
    expect(half.filter((x) => x.failed).length).toBe(74)
    expect(whole.filter((x) => x.failed).length).toBe(25)
    expect(dropRate(half)).toBeCloseTo(0.2624, 4)
    expect(dropRate(whole)).toBeCloseTo(0.1812, 4)
    // What the table prints, to the cell.
    const table = lesson.numbers!
      .filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
      .find((b) => b.heading?.includes('同一个实测余量组里的两腿'))!
    expect(table.rows.map((r) => [r[3], r[4]])).toEqual([
      ['282 条里 74 条', '26.24 %'],
      ['138 条里 25 条', '18.12 %'],
    ])
    expect(table.heading).toContain('1000 ms')
  })

  /**
   * The nine receptions that fall out of the group — and what they are NOT.
   *
   * The engine test next door reads them as "receptions a stray collision moved". They are
   * nothing of the sort: all three distinct keys agree to the thirteenth decimal and differ in
   * the fourteenth, so they are one physical margin seen through floating-point accumulation.
   * The lesson says that, and this is the measurement it says it from.
   */
  it('reports the nine excluded receptions as float noise, not a second working point', () => {
    const { on, key } = legs()
    const distinct = [...new Set(on.map((r) => r.margin))]
    expect(distinct.length).toBe(3)
    expect(on.length - on.filter((r) => r.margin === key).length).toBe(9)
    for (const m of distinct) expect(Math.abs(m - key), String(m)).toBeLessThan(1e-13)
    // And they are the same physical margin: the mean SINR and the threshold are one value each
    // to any precision a reader could see.
    expect(new Set(on.map((r) => r.threshDb)).size).toBe(1)
    expect(new Set(on.map((r) => r.meanSinrDb.toFixed(9))).size).toBe(1)
    expect(mainText).toContain('只差小数第十四位')
    expect(mainText).toContain('是浮点数自己的噪声')
    // The observe line's two readings off the same record.
    expect(on[0]!.meanSinrDb).toBeCloseTo(12.54, 2)
    expect(on[0]!.threshDb).toBeCloseTo(8.99, 2)
    // The margin is the difference of those two, and it is what the lesson prints — the log
    // itself prints neither the threshold nor a margin, which is why no observe line claims it.
    expect(on[0]!.meanSinrDb - on[0]!.threshDb).toBeCloseTo(3.547, 3)
    expect(mainText).toContain('这一组的余量是 3.547 dB')
  })

  /**
   * **The lesson's central paragraph**: what changes between the two legs is the tail, not the
   * average. Measured on the gate's own two populations (282 member receptions, 138
   * whole-channel ones), so every figure here shares its instrument with the table above.
   *
   * These are the figures that replace the design doc's §7.2 pair — that pair is `ofdma-dl`'s
   * scene and is false here, which is why the absence of it is pinned further down.
   */
  it('moves the tail and leaves the average alone, to three decimals', () => {
    const { half, whole } = legs()
    const h = half.map((r) => r.lossDb)
    const w = whole.map((r) => r.lossDb)
    expect(mean(w)).toBeCloseTo(2.098, 3)
    expect(mean(h)).toBeCloseTo(2.068, 3)
    // The average moves by less than a thirtieth of a decibel, and DOWNWARD.
    expect(mean(w) - mean(h)).toBeCloseTo(0.03, 2)
    expect(mean(h)).toBeLessThan(mean(w))
    // The median moves the same way, further.
    expect(q(w, 0.5)).toBeCloseTo(2.167, 3)
    expect(q(h, 0.5)).toBeCloseTo(1.804, 3)
    // p90 and the deepest reception move the other way — the whole of the lesson's claim.
    expect(q(w, 0.9)).toBeCloseTo(4.439, 3)
    expect(q(h, 0.9)).toBeCloseTo(5.420, 3)
    expect(Math.max(...w)).toBeCloseTo(7.007, 3)
    expect(Math.max(...h)).toBeCloseTo(12.006, 3)
    // Both tails open, which is what fewer terms in a mean does — so the gains open too.
    // The observe line's 「偶尔深到十个分贝以上」, on the leg a reader loads first.
    expect(h.filter((x) => x > 10).length).toBeGreaterThan(0)
    expect(w.filter((x) => x <= 0).length).toBe(12)
    expect(h.filter((x) => x <= 0).length).toBe(59)
    expect((12 / whole.length * 100)).toBeCloseTo(8.7, 1)
    expect((59 / half.length * 100)).toBeCloseTo(20.9, 1)
    for (const s of ['九格 2.098 dB，四格 2.068 dB', '2.167 dB 降到 1.804 dB',
      '4.439 dB 涨到 5.420 dB', '7.007 dB 走到 12.006 dB',
      '138 条有 12 条，四格里 282 条有 59 条', '8.7 % 涨到 20.9 %']) {
      expect(mainText, s).toContain(s)
    }
  })

  /** The pair that runs the other way, and the misreading it exists to block. */
  it('shows the deepest bin shallower on the leg that drops more', () => {
    const { half, whole } = legs()
    const dh = q(half.map((r) => r.worstBinDb), 0.5)
    const dw = q(whole.map((r) => r.worstBinDb), 0.5)
    expect(dw).toBeCloseTo(-11.917, 3)
    expect(dh).toBeCloseTo(-7.547, 3)
    // Shallower, on the leg with the higher drop rate: the two orderings really are opposite.
    expect(dh).toBeGreaterThan(dw)
    expect(dropRate(half)).toBeGreaterThan(dropRate(whole))
    expect(mainText).toContain('比均值低 11.917 dB')
    expect(mainText).toContain('只有 7.547 dB')
  })

  /**
   * The payload asymmetry behind the new `unmodelled` entry.
   *
   * `decodeThreshDb` reads the frame's rate and nothing else — no byte count, no MPDU count —
   * so a reception is all-or-nothing whatever it carries. On these two legs that is not neutral:
   * the whole-channel leg carries a two-MPDU A-MPDU of 2870 B per reception while a member
   * carries one MPDU of 1434 B, for all but four microseconds of the same airtime. So the
   * nine-bin leg hauls twice the payload at the same risk, and the measured gap is flattered.
   */
  it('hauls twice the payload on the nine-bin leg for the same airtime', () => {
    const big = (v: number | undefined): Extract<TLRecord, { type: 'TX_START' }>[] =>
      ofType(runOf(lesson, v, GATE_NS), 'TX_START')
        .filter((r) => r.frame.kind === 'data' && r.frame.src === 'ap' && r.frame.bytes > 2000)
    const split = big(SPLIT)
    const whole = big(WHOLE)
    expect(split.length).toBe(346)
    expect(whole.length).toBe(348)
    // Each member of a split send: one MPDU, 1434 B.
    expect(new Set(split.flatMap((r) => r.frame.muParts!.map((p) => p.bytes)))).toEqual(new Set([1434]))
    expect(new Set(split.flatMap((r) => r.frame.muParts!.map((p) => p.mpduCount)))).toEqual(new Set([1]))
    // Each whole-channel send: two MPDUs, 2870 B, to one television.
    expect(new Set(whole.map((r) => r.frame.ampdu?.mpduCount))).toEqual(new Set([2]))
    expect(new Set(whole.map((r) => r.frame.bytes))).toEqual(new Set([2870]))
    // …and the two take the same airtime to four microseconds.
    expect(new Set(split.map((r) => r.frame.txTimeNs))).toEqual(new Set([2731200]))
    expect(new Set(whole.map((r) => r.frame.txTimeNs))).toEqual(new Set([2727200]))
    expect(2731200 / MS).toBeCloseTo(2.731, 3)
    expect(2727200 / MS).toBeCloseTo(2.727, 3)
    expect(limitsText).toContain('2870 字节')
    expect(limitsText).toContain('1434 字节')
    expect(limitsText).toContain('2.727 对 2.731 ms')
  })
})

describe('ru-diversity · the window this claim lives in', () => {
  /**
   * **The lower edge, and how close the shipped scene sits to it.**
   *
   * The scene's only tuned quantity is where the televisions stand, so the sweep is over that:
   * the same plan with both televisions moved one metre along the same line, in each direction.
   * One metre out and the gate passes BACKWARDS. That is not a defect in the scene — it is the
   * shape of the intuition the lesson teaches, and it is the lesson's own sentence.
   *
   * **Instrument**: the shipped scene with `sta-1`/`sta-2`'s x moved, both capabilities, 1000 ms,
   * seed 7, the same grouping rule as the gate.
   */
  it('passes at 4.826 and 3.547 dB and reverses at 2.381, one metre apart', () => {
    const at = (x: number, on: boolean): Scenario => {
      const sc = ruDiversityScenario(on)
      return { ...sc, nodes: sc.nodes.map((n) => (n.id.startsWith('sta') ? { ...n, pos: { ...n.pos, x } } : n)) }
    }
    const sweep = [12.5, 13.5, 14.5].map((x) => {
      const on = dlRows(runScene(`x${x}|on`, at(x, true)))
      const off = dlRows(runScene(`x${x}|off`, at(x, false)))
      const group = largestMarginGroup(on)
      const key = group[0]!.margin
      const half = group.filter((r) => r.ruFraction !== undefined)
      const whole = off.filter((r) => r.margin === key)
      expect(half.length, `x=${x} half`).toBeGreaterThan(100)
      expect(whole.length, `x=${x} whole`).toBeGreaterThan(100)
      return { x, key, half: dropRate(half), whole: dropRate(whole) }
    })
    expect(sweep.map((s) => Number(s.key.toFixed(3)))).toEqual([4.826, 3.547, 2.381])
    // The shipped scene is the middle one.
    expect(sweep[1]!.x).toBe(lesson.scenario().nodes.find((n) => n.id === 'sta-1')!.pos.x)
    // One metre in: the gate still passes. One metre out: it passes backwards.
    expect(sweep[0]!.half).toBeGreaterThan(sweep[0]!.whole)
    expect(sweep[1]!.half).toBeGreaterThan(sweep[1]!.whole)
    expect(sweep[2]!.half).toBeLessThan(sweep[2]!.whole)
    expect(sweep[2]!.half).toBeCloseTo(0.3767, 4)
    expect(sweep[2]!.whole).toBeCloseTo(0.3925, 4)
    expect(sweep[0]!.half).toBeCloseTo(0.1844, 4)
    expect(sweep[0]!.whole).toBeCloseTo(0.0656, 4)
    for (const s of ['余量掉到 2.381 dB', '整条九格 39.25 %，成员四格 37.67 %',
      '余量 4.826 dB', '18.44 % 对 6.56 %']) {
      expect(mainText, s).toContain(s)
    }
  }, 300_000)

  /**
   * The other edge: `ofdma-dl`'s own scene, where this lesson's effect is provably inert — and
   * the second reason this is a lesson of its own rather than a paragraph there (design §7.1).
   *
   * **Instrument** (the one §7.6 item 1 says the design doc never wrote down): `ofdma-dl`'s
   * scenario plus the two sections this feature needs, 150 ms, every `WIFI_SEL` of the run.
   */
  it('names 15.4 dB as the margin of the scene this lesson is NOT taught on', () => {
    const base = LESSONS.find((l) => l.id === 'ofdma-dl')!.scenario()
    const rs = runScene('ofdma-dl|sel', { ...base, fading: RAYLEIGH, selectivity: {} }, 150 * MS)
    const sels = ofType(rs, 'WIFI_SEL')
    // 1524 is the figure §7.1 quotes with no instrument; this is the instrument.
    expect(sels.length).toBe(1524)
    const margins = sels.map((s) => s.meanSinrDb - s.threshDb)
    expect(q(margins, 0.5)).toBeCloseTo(15.395, 3)
    // Every reception of that scene has more room than the shipped scene's whole margin.
    expect(Math.min(...margins)).toBeGreaterThan(legs().key * 4)
    expect(mainText).toContain('15.4 dB')
  })

  /**
   * The reversal, as a pure function rather than as a round — which is the only way to reach a
   * negative margin at all, since the rate loop will not settle a link there.
   *
   * The draws come from the engine's own sampler on the scene's own Rayleigh config, keyed so
   * the figure reproduces. What is asserted is the DIRECTION at two margins, not a percentage:
   * these are sampling means, and this branch has published one of those once already.
   */
  it('reverses the direction at zero margin and keeps it at the scene’s own', () => {
    const DRAWS = 4000
    const rate = (meanDb: number, marginDb: number, bins: number): number => {
      let below = 0
      for (let i = 0; i < DRAWS; i++) {
        const devs: number[] = []
        for (let b = 0; b < bins; b++) devs.push(smallScaleDb(RAYLEIGH, 1, 'edge', `i${i}`, 'd', b))
        if (selEffSinrDb(meanDb, devs) < meanDb - marginDb) below++
      }
      return below / DRAWS
    }
    const meanDb = legs().on[0]!.meanSinrDb
    // At zero margin the nine-bin leg loses MORE: fewer bins means more spread, and spread is
    // the only thing that can carry a frame over a threshold it sits below on average.
    const zero = [selBins(20), selMemberBins(20, 1 / 2)].map((b) => rate(meanDb, 0, b))
    expect(zero[0]!).toBeGreaterThan(zero[1]! + 0.05)
    // At the scene's own margin it runs the other way, which is the gate.
    const here = [selBins(20), selMemberBins(20, 1 / 2)].map((b) => rate(meanDb, legs().key, b))
    expect(here[0]!).toBeLessThan(here[1]! - 0.05)
    // And wide open, both legs are a tie at zero — the 「并列的零」 the table's last row names.
    const wide = [selBins(20), selMemberBins(20, 1 / 2)].map((b) => rate(meanDb, 15, b))
    for (const r of wide) expect(r).toBeLessThan(0.01)
    expect(mainText).toContain('余量 3 到 15 dB')
  }, 300_000)

  /**
   * "Position buys nothing", in the scale-free form — the only form that means anything, since
   * the true spread between the six four-bin windows of a nine-bin channel is exactly zero and
   * any measured value is noise that shrinks as 1/√N.
   *
   * tests/engine/selectivity.test.ts holds the converged version at 20 000 draws (spread 0.0207
   * against a standard error of 0.0187, ratio 1.11, with the sensitivity measured beside it).
   * This runs the same claim at 4000, which a scale-free bound has to survive — and it is the
   * reason the lesson's `unmodelled` entry says 「落在抽样标准误的量级里」 and prints no number.
   */
  it('keeps the six four-bin windows inside the noise of their own means', () => {
    const DRAWS = 4000
    const full = selBins(20)
    const span = selMemberBins(20, 1 / 2)
    const starts = [...Array(full - span + 1).keys()]
    expect(starts.length).toBe(6)
    const sum = starts.map(() => 0)
    const sumSq = starts.map(() => 0)
    for (let i = 0; i < DRAWS; i++) {
      const devs: number[] = []
      for (let b = 0; b < full; b++) devs.push(smallScaleDb(RAYLEIGH, 1, 'ap', 'sta-1', `f${i}`, b))
      starts.forEach((start, k) => {
        const eff = selEffSinrDb(20, devs.slice(start, start + span))
        sum[k]! += eff
        sumSq[k]! += eff * eff
      })
    }
    const means = sum.map((t) => t / DRAWS)
    const stdErrs = sumSq.map((s, k) => Math.sqrt(s / DRAWS - means[k]! ** 2) / Math.sqrt(DRAWS))
    expect(Math.max(...means) - Math.min(...means)).toBeLessThan(4 * Math.max(...stdErrs))
    // Non-vacuity: the windows are genuinely fading, so the smallness is about position.
    for (const m of means) expect(m).toBeLessThan(18)
    expect(limitsText).toContain('真实差距精确为零')
    expect(limitsText).toContain('落在它自己的抽样标准误的量级里')
  })
})

describe('ru-diversity · what `deeper` and `tryThis` promise the reader', () => {
  /**
   * The third television, which is both the second `tryThis` and the reason the 1/3 and 1/4
   * shares are a model: `buildMuParts` skips a member whose head MSDU does not fit the PPDU
   * duration cap, and a narrower resource unit makes that airtime longer.
   *
   * **Instrument**: the shipped plan with a third identical television in the bedroom, 1000 ms.
   */
  it('falls back to one station at a time as soon as a third television joins', () => {
    const feats = { edca: true, ampdu: true, txop: true, ofdma: true }
    const base = ruDiversityScenario(true)
    const tv3 = node('sta-3', 'TV 3', 'sta', 13.5, 7, 'eht', 'video', feats)
    tv3.caps.widthMhz = 20
    tv3.caps.nss = 1
    const rs = runScene('three', { ...base, nodes: [...base.nodes, tv3] })
    const dl = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'data' && r.frame.src === 'ap')
    expect(dl.length).toBe(349)
    // Not one group, ever — the `tryThis` says 「一次也没装两个成员」 and means it.
    expect(dl.filter((r) => r.frame.muParts !== undefined).length).toBe(0)
    expect(selRows(rs).filter((x) => x.sel.ruFraction !== undefined).length).toBe(0)
    expect(mainText).toContain('1000 ms 里 349 次下行发送一次也没装两个成员')
    expect(deeperText).toContain('349 次下行发送一次也没有编成组')
  })

  /**
   * The count `deeper` prints and then refuses to use as evidence. Both legs are measured, and
   * the reason they are not comparable is measured too: the split leg answers with two
   * BlockAcks where the whole-channel leg answers with one, and both runs drop over eighteen
   * hundred MSDUs, so this link is nowhere near able to feed two televisions either way.
   */
  it('delivers 216 frames split and 224 whole, and says why that is not the gate', () => {
    const delivered = (v: number | undefined): number =>
      ofType(runOf(lesson, v, GATE_NS), 'RX_OK')
        .filter((r) => r.frame.kind === 'data' && r.from === 'ap').length
    expect(delivered(SPLIT)).toBe(216)
    expect(delivered(WHOLE)).toBe(224)
    expect(deeperText).toContain('开着分片 216 帧，关掉 224 帧')
    for (const v of [SPLIT, WHOLE]) {
      expect(ofType(runOf(lesson, v, GATE_NS), 'DROP').length, String(v)).toBeGreaterThan(1800)
    }
    expect(deeperText).toContain('两轮都丢掉一千八百多个 MSDU')
    const bas = (v: number | undefined): number =>
      ofType(runOf(lesson, v, GATE_NS), 'TX_START').filter((r) => r.frame.kind === 'ba').length
    expect(bas(SPLIT)).toBeGreaterThan(1.7 * bas(WHOLE))
    expect(deeperText).toContain('开着分片时每次发送要回两个确认，关掉时只回一个')
  })

  /**
   * The chain past 1/2, which the engine cannot build — a model, and only the chain is stated.
   *
   * Each reception keeps its own measured mean and threshold and is decided again on freshly
   * drawn deviations: legitimate because the bins are drawn independently of one another and of
   * the mean, and a model all the same. What is asserted is the chain and its calibration
   * against the one share the round does build; the four percentages are sampling means and the
   * lesson prints none of them.
   */
  it('extends the chain by a model the round calibrates, and prints no figure from it', () => {
    const REPS = 200
    const { half } = legs()
    const cf = (bins: number): number => {
      let below = 0
      for (let i = 0; i < half.length; i++) {
        for (let rep = 0; rep < REPS; rep++) {
          const devs: number[] = []
          for (let b = 0; b < bins; b++) devs.push(smallScaleDb(RAYLEIGH, 1, 'cf', `row${i}|rep${rep}`, 'draw', b))
          if (selEffSinrDb(half[i]!.meanSinrDb, devs) < half[i]!.threshDb) below++
        }
      }
      return below / (half.length * REPS)
    }
    const bins = [selBins(20), selMemberBins(20, 1 / 2), selMemberBins(20, 1 / 3), selMemberBins(20, 1 / 4)]
    expect(bins).toEqual([9, 4, 3, 2])
    const rates = bins.map(cf)
    expect(rates[0]!).toBeGreaterThan(0.05)
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]!, `${bins[i]} bins against ${bins[i - 1]} bins`).toBeGreaterThan(rates[i - 1]!)
    }
    // The calibration the lesson quotes, and the only reason the modelled legs are mentionable.
    expect(Math.abs(rates[1]! - dropRate(half))).toBeLessThan(0.02)
    expect(deeperText).toContain('两者吻合在两个百分点以内')
    // And the four modelled percentages appear nowhere a reader can see.
    for (const n of ['29.39', '32.89', '26.82', '17.57']) expect(text, n).not.toContain(n)
  }, 300_000)

  /**
   * The uplink `limits` entry. Two halves, and both are measured here: the engine fact (no rate
   * loop closes on a triggered response, so its MCS comes off the AP's downlink ceiling, which
   * is 5 dB of transmit power better than the path the response takes) and the one figure the
   * entry prints — `ofdma-ul`'s own uplink member margin, which sits in the inert end.
   */
  it('measures the uplink figure it quotes, on a published scene', () => {
    const base = LESSONS.find((l) => l.id === 'ofdma-ul')!.scenario()
    const rs = runScene('ofdma-ul|sel', { ...base, fading: RAYLEIGH, selectivity: {} })
    const up = selRows(rs).filter((x) => x.sel.from !== 'ap' && x.sel.ruFraction !== undefined)
    expect(up.length).toBe(80)
    const margins = up.map((x) => x.sel.meanSinrDb - x.sel.threshDb)
    expect(new Set(margins.map((m) => m.toFixed(3)))).toEqual(new Set(['12.195']))
    expect(up.filter((x) => !selRowDecoded(rs, x)).length).toBe(0)
    expect(limitsText).toContain('12.195 dB')
    expect(limitsText).toContain('80 条接收一条也没掉')

    // The 5 dB the entry names: an AP at 20 dBm against a station at 15 dBm on one path loss.
    const sc = lesson.scenario()
    const links = buildLinkTable(sc.nodes, sc.walls)
    expect(links.get('ap')!.get('sta-1')! - links.get('sta-1')!.get('ap')!).toBeCloseTo(5, 9)
    expect(limitsText).toContain('接入点发 20 dBm、站点发 15 dBm')
    expect(limitsText).toContain('比它高 5 dB 的那条路')
  })
})

describe('ru-diversity · the six limits are each about this engine', () => {
  it('names the kinds it uses, with no two entries repeating themselves', () => {
    expect(lesson.limits.length).toBe(6)
    expect(lesson.limits.map((l) => l.kind)).toEqual([
      'model-value', 'unmodelled', 'unmodelled', 'model-value', 'out-of-scope', 'out-of-scope',
    ])
    expect(new Set(lesson.limits.map((l) => `${l.kind}:${l.text}`)).size).toBe(6)
    // `until` is Task 6's business, not this lesson's: nothing here promises a later lesson.
    expect(lesson.limits.filter((l) => l.until !== undefined)).toEqual([])
  })

  it('model-value: the truncation, with the lost bins split by bandwidth', () => {
    const t = lesson.limits[0]!.text
    expect(t).toContain('selMemberBins')
    for (const s of ['两个 106 音调资源单元', '四个 52 音调资源单元', '四个 106 音调资源单元']) {
      expect(t, s).toContain(s)
    }
    // The 2026-10-04 correction, in the only form that survives a 40 MHz example.
    expect(t).toContain('20 MHz 两个成员丢一格')
    expect(t).toContain('40 MHz 四个成员丢两格')
    expect(t).toContain('40 MHz 根本没有中间那一格')
    expect(t).toContain('52+26')
  })

  it('unmodelled: position is exactly inert, and independence is the generous side', () => {
    const t = lesson.limits[1]!.text
    expect(t).toContain('位置完全不起作用')
    expect(t).toContain('真实差距精确为零')
    expect(t).toContain('不是一个效应')
    expect(t).toContain('格间独立是频率分集偏多的那一边')
  })

  it('unmodelled: the decode threshold has no length term, and that flatters this table', () => {
    const t = lesson.limits[2]!.text
    expect(t).toContain('decodeThreshDb 只读速率，不读字节数')
    expect(t).toContain('8 个百分点')
    expect(t).toContain('真实接收机的长帧误包率更高')
    // The gap the sentence is about, measured: 26.24 − 18.12 is a little over 8 points.
    const gap = (dropRate(legs().half) - dropRate(legs().whole)) * 100
    expect(gap).toBeGreaterThan(8)
    expect(gap).toBeLessThan(8.2)
  })

  it('model-value: one resource-unit size, and why a scheduler is out of scope', () => {
    const t = lesson.limits[3]!.text
    expect(t).toContain('成员数的倒数')
    expect(t).toContain('26、52、106、242、484、996')
    expect(t).toContain('标准不规定调度器')
  })

  it('out-of-scope: the orthogonal group, and bins belonging to a resource unit', () => {
    const t = lesson.limits[4]!.text
    expect(t).toContain('orthogonalGroup')
    expect(t).toContain('干扰与噪声在每一格里是同一个数')
    expect(t).toContain('格号区间属于那一片资源单元，不属于某一台设备')
    expect(t).toContain('mumimo-choose')
  })

  it('out-of-scope: the uplink loop that never closed, named as not this slice’s doing', () => {
    const t = lesson.limits[5]!.text
    expect(t).toContain('cfg.mcsForPeer')
    expect(t).toContain('closeTbPpdu 一次也不调 onTxOutcome')
    expect(t).toContain('从来没有闭合过')
    expect(t).toContain('不要拿本课的结论去读上行多用户的掉帧')
  })
})

describe('ru-diversity · the numbers this lesson may not print', () => {
  it('never prints the design doc’s §7.2 pair, which belongs to another scene', () => {
    // 九格 2.31 / 四格 2.20 dB median and p90 4.70 → 5.85 are `ofdma-dl`'s figures. On the gate's
    // own population this scene gives 2.167 → 1.804 and 4.439 → 5.420, asserted above.
    for (const n of ['2.31', '2.20', '4.70', '5.85', '2.540', '2.628']) {
      expect(text, `§7.2's ${n}`).not.toContain(n)
    }
  })

  it('never prints the position figure that was only a sampling error', () => {
    // design §3.2.1: the true spread is zero, so 0.02 dB and every value on that ladder is an
    // artifact. The claim is printed; none of the numbers is.
    for (const n of ['0.02 dB', '0.0207', '0.0296', '0.0070', '0.021 dB', '1.11']) {
      expect(text, n).not.toContain(n)
    }
  })

  it('never prints a figure this repository does not pin', () => {
    // The uplink pair of design §7.3.1 (c) (another scene, no assertion anywhere) and the two
    // errors in the scene builder's own comment, which the lesson is told not to repeat.
    for (const n of ['−0.383', '-0.383', '82 %', '86 %', '13 dB', '15.5 dB']) {
      expect(text, n).not.toContain(n)
    }
  })

  /**
   * **Over the FILE, comments included** (design §9 item 6, and the same technique
   * tests/course/selectivity.test.ts already uses on its own two lesson files). The hard
   * constraint is zero hits in `src/`, and reading the lesson OBJECT cannot see a comment — which
   * is how `selectivity.ts`'s own header came to quote both of 4a's open-loop figures after the
   * object had been cleaned.
   */
  it('keeps slice 4a’s three open-loop figures out of the new lesson file, comments included', () => {
    const src = readFileSync(new URL('../../src/course/tier2/ru-diversity.ts', import.meta.url), 'utf8')
    for (const n of ['7.14', '15.36', '39.48', '34.43']) {
      expect(src.includes(n), `ru-diversity.ts quotes ${n}`).toBe(false)
      expect(text, n).not.toContain(n)
    }
    // Non-vacuity: the guard has to be reading a file with this lesson's own prose in it.
    expect(src).toContain('成员那一片的格数')
    expect(src.length).toBeGreaterThan(10_000)
  })

  it('never says a drop COUNT is the comparison, having printed one', () => {
    // `deeper` prints 216 and 224 and then disqualifies them; the main path compares ratios.
    expect(mainText).not.toContain('216')
    expect(mainText).not.toContain('224')
    expect(deeperText).toContain('这个差不能当成这一课的证据')
    expect(deeperText).toContain('比的是比例，不是条数')
  })
})
