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
import { lessonStrings, readerTexts } from '../../src/course/readability'
import {
  DF_EHT_KHZ, RU26_PER_20MHZ, RU26_TONES,
  selBinWidthMhz, selBins, selEffSinrDb, selMemberBins,
} from '../../src/engine/selectivity'
import { WALL_LOSS_DB, buildLinkTable } from '../../src/engine/propagation'
import { smallScaleDb, type FadingCfg } from '../../src/engine/fading'
import { Simulation } from '../../src/engine/simulation'
import { fmtNs, fmtRecord } from '../../src/ui/format'
import { node } from '../../src/course/lessonKit'
import { ruDiversityScenario } from '../../src/course/wifiScenes'
import { selRowDecoded, selRows } from '../engine/selectivity-pairing'
import type { Block } from '../../src/course/lessonKit'
import type { Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { zhNumeral } from './coverage'

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
const text = readerTexts(lesson).join('\n')
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
    /*
     * 「按 muParts 的次序给一段连着的格号，而不是让每个成员都从第 0 格开始」 — `deeper` on what
     * the model does instead, and the 「第」 rule change of 2026-10-14 uncovered its figure. It
     * is the bin the numbering starts at, which the lesson also states as 「格号从 0 数起」 and
     * which the records answer: one member of every pair really does begin there, and the other
     * does not, so 「不是每个成员都从第 0 格开始」 is a measured fact about this very run.
     */
    const deep = lesson.deeper!.map((b) => (b as { text?: string }).text ?? '').join(' ')
    const zero = /都从第 (\d+) 格开始/.exec(deep)
    expect(zero, '`deeper` no longer says what it does NOT do').not.toBeNull()
    const first = Number(zero![1])
    expect(Math.min(...members.map((x) => x.sel.binStart)), 'the bin the numbering starts at')
      .toBe(first)
    expect(new Set(members.map((x) => x.sel.binStart)).size,
      'and not every member starts there, which is the whole sentence').toBeGreaterThan(1)
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
    /*
     * **And the row does not BEGIN with `selectivity`** (Task 6, review finding 6). The watch
     * call-out said 「看 selectivity 开头那一行」; `EventLog.tsx` renders a timestamp span of its
     * own before `fmtRecord`, and `fmtRecord` itself opens with the two node ids - so the word
     * sits a long way in. This was the one claim about the log's wording that no `fmtRecord`
     * guard held, which is exactly the misplacement class this lesson had just fixed
     * elsewhere.
     */
    expect(fmtRecord(member).startsWith('selectivity')).toBe(false)
    // 「sta-1 ⇠ ap 」 first, and `EventLog.tsx` puts a 13-character timestamp span and two
    // paddings in front of all of it — so the word is nowhere near the start of the row.
    expect(fmtRecord(member).indexOf('selectivity')).toBe('sta-1 ⇠ ap '.length)
    expect(fmtNs(member.t)).toHaveLength(13)
    expect(mainText).not.toContain('selectivity 开头那一行')
    expect(mainText).toContain('行首是时间戳，这个词在两个节点名之后')
    /*
     * **C9, and the correction Task 6c made to it: there is no narrow-screen warning any more,
     * because the row no longer runs off any screen.**
     *
     * The geometry below is still the row's and is still pinned: 131 characters of record text,
     * `(loss` opening at index 75 and `over bins` at index 88, which in Consolas at the log's
     * own 11.5 px is ~832 px of text behind a 13-character timestamp column.
     *
     * What C9 got wrong was whose problem that is. It read as a folded-phone defect and the
     * lesson grew three 「窄屏上要把这一行往右拉」 sentences to cover it. Measured in the browser
     * at Task 6c, the event log's own client width is **344 px as a desktop column** (1440 x 900,
     * `mainColumns`'s `minmax(320px, 400px)`), **404 px** as the drawer on an unfolded foldable
     * and **398 px** folded - so the row was clipped at every size and worst on the biggest
     * screen. `EventLog.tsx` now lets the record text wrap instead (the timestamp keeps its
     * `nowrap` and a shrink guard), both fragments are on screen at 470 x 511 and 939 x 511 with
     * no horizontal drag, and the three sentences are gone: an instruction that no longer
     * describes the screen is worse than no instruction.
     */
    expect(fmtRecord(member).length).toBe(131)
    expect(fmtRecord(member).indexOf('(loss')).toBe(75)
    expect(fmtRecord(member).indexOf('over bins')).toBe(88)
    for (const gone of ['窄屏', '往右拉', '后半截']) {
      expect(mainText, `the lesson still tells the reader to drag the row: ${gone}`).not.toContain(gone)
    }
    // The two observe lines still quote the fragments themselves - only the drag instruction left.
    expect(lesson.observe[0]).toContain('over bins 0–3 of 9, its 1/2 of the channel')
    expect(lesson.observe[1]).toContain('loss')
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
    /*
     * **Both legs' denominators are a whole round, and the prose now says so for both** (Task
     * 6, review finding 7). The grouping paragraph gave the member leg's 283-of-292 and left
     * the whole-channel leg with only the group size 138, so a reader could not tell whether
     * 138 was the round or a selection from it. It is 138 of 140.
     */
    const offAll = dlRows(runOf(lesson, WHOLE, GATE_NS))
    expect(offAll.length).toBe(140)
    expect(whole.length).toBe(138)
    expect(mainText).toContain('140 条里的 138 条')
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
    /*
     * **The prose states the window as what was measured, which is a bracket and not an edge**
     * (Task 6, review finding 3). It used to say 「通过这道窗口的大致范围是余量 3 到 15 dB，而本课
     * 这个工作点离它的下边缘只有约一个分贝」 - and those two clauses point at two different
     * distances: 3.547 - 3 is 0.55 dB, while 「约一个分贝」 is the distance to the measured
     * reversal at 2.381 (1.166 dB). Neither 「3」 nor 「约一个分贝」 had an instrument; the
     * bracket [2.381, 3.547] is what the sweep above actually establishes. The failure mode is
     * concrete: someone reads 「3」 as a measured edge, builds a 3.1 dB scene expecting the
     * forward direction, and the engine flips somewhere inside the bracket.
     *
     * The wide end keeps its own instruments, which are the two this test and the one above it
     * provide: 15 dB as a pure-function tie (the table's last row says so in those words), and
     * `ofdma-dl`'s measured 15.4 dB median.
     */
    expect(mainText).toContain('这道窗口的下边缘没有量到一个数，量到的是一个区间')
    expect(mainText).toContain('3.547 dB 上方向是正的，2.381 dB 上已经反了')
    // The bracket's own width, as the prose rounds it: 3.547 - 2.381 = 1.166 dB.
    expect(legs().key - 2.381).toBeLessThan(1.2)
    expect(mainText).toContain('离它不到 1.2 dB')
    // The two unanchored figures are gone, and the pure-function tie keeps its label.
    expect(mainText).not.toContain('余量 3 到 15 dB')
    expect(mainText).not.toContain('约一个分贝')
    expect(mainText).toContain('十五个分贝以上')
    expect(mainText).toContain('纯函数抽样，不是一轮仿真')
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

/**
 * **What a finite coherence bandwidth would do to this lesson's two figures - the instrument
 * behind the split `unmodelled` entry, and the measurement that refuted the account the fix was
 * queued with.**
 *
 * The entry used to end 「格间独立是频率分集偏多的那一边，所以本课量到的代价比真实信道里的更小」,
 * unconditionally, and the review that queued the fix described the condition as "true for a
 * coherence length L of about 7 bins or less, reversed from L >= 9, where both legs collapse to
 * one effective sample and the gap goes to zero". The first half of that is right - the gap does
 * go to zero - and everything it concludes from it is not:
 *
 *  - **the gap between the two legs is largest at independence and shrinks monotonically**, so
 *    it is over-stated at EVERY correlation, from L = 2 upward, not under-stated up to 7;
 *  - **each leg's own absolute cost rises monotonically with L**, so the member's own cost is
 *    under-stated at every correlation, with no reversal anywhere;
 *  - there is therefore **no threshold at all**, and the sentence was not missing a condition.
 *    It was carrying two readings of 「代价」 that run opposite ways, which is why the lesson now
 *    states both halves and prints no number for either.
 *
 * **Instrument.** A counterfactual over the engine's OWN sampler, exactly as the reversal test
 * above is: bins inside one coherence length share a draw (`Math.floor(b / L)` as the sampler's
 * bin key), the scene's own Rayleigh config, its measured mean SINR and its measured margin.
 * L = 1 is then literally this engine, which is what makes the sweep non-vacuous. It is a model
 * and not a round - the engine has no coherence length, slice 4a having recorded that as having
 * no value to give it - so only the DIRECTIONS are asserted, and the lesson prints none of these
 * numbers.
 */
describe('ru-diversity · the direction a finite coherence bandwidth would move both figures', () => {
  const DRAWS = 6000
  const LS = [1, 2, 4, 6, 9] as const

  /** Drop rate of a `bins`-bin leg when every `L` adjacent bins share one draw. */
  const rate = (bins: number, L: number, meanDb: number, marginDb: number): number => {
    let below = 0
    for (let i = 0; i < DRAWS; i++) {
      const devs: number[] = []
      for (let b = 0; b < bins; b++) {
        devs.push(smallScaleDb(RAYLEIGH, 1, 'edge', `c${i}`, 'd', Math.floor(b / L)))
      }
      if (selEffSinrDb(meanDb, devs) < meanDb - marginDb) below++
    }
    return below / DRAWS
  }

  it('shrinks the gap monotonically to zero, and raises both legs — with no threshold', () => {
    const meanDb = legs().on[0]!.meanSinrDb
    const marginDb = legs().key
    const full = selBins(20)
    const part = selMemberBins(20, 1 / 2)
    const sweep = LS.map((L) => {
      const nine = rate(full, L, meanDb, marginDb)
      const four = rate(part, L, meanDb, marginDb)
      return { L, nine, four, gap: four - nine }
    })

    // Non-vacuity: L = 1 is this engine, so it has to reproduce the gate's own direction.
    expect(sweep[0]!.gap).toBeGreaterThan(0.05)
    expect(sweep[0]!.four).toBeGreaterThan(sweep[0]!.nine)

    // (1) The gap is largest at independence and never exceeds it anywhere in the sweep —
    // which is the claim that replaces "reversed from L >= 9".
    for (const row of sweep.slice(1)) {
      expect(row.gap, `gap at L=${row.L}`).toBeLessThan(sweep[0]!.gap)
    }
    // …and it shrinks all the way down, rather than turning round at some length.
    const gaps = sweep.map((r) => r.gap)
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i]!, `gap at L=${LS[i]} against L=${LS[i - 1]}`).toBeLessThan(gaps[i - 1]! + 0.01)
    }
    // One coherence length over the channel collapses both legs onto one effective sample.
    expect(sweep.at(-1)!.L).toBe(full)
    expect(sweep.at(-1)!.gap).toBeLessThan(0.01)
    expect(sweep.at(-1)!.four).toBeCloseTo(sweep.at(-1)!.nine, 10)

    // (2) Each leg's own cost rises with L, so the member's absolute cost is under-stated —
    // the other half of the entry, and the half with no reversal in it either.
    for (const key of ['nine', 'four'] as const) {
      expect(sweep.at(-1)![key], `${key} at L=${full}`).toBeGreaterThan(sweep[0]![key])
    }

    // What the lesson says about all of this, and the one number it is allowed: none.
    expect(limitsText).toContain('两腿都塌成一个有效样本、差距归零')
    expect(limitsText).toContain('真实住宅信道落在差距还明显存在的那一端')
    for (const n of ['7 格', '9 格', 'L ≥']) expect(limitsText, n).not.toContain(n)
  }, 300_000)
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

/**
 * **Selected by what each entry SAYS, not by where it sits** - the practice
 * `tests/course/ofdma-dl.test.ts` adopted after the 2026-10-03 review's finding 5. Task 6 added
 * two entries in the middle of this array (the capacity bound, and the rate-selection
 * asymmetry), and index lookups would have started grading the wrong entries silently.
 */
describe('ru-diversity · the eight limits are each about this engine', () => {
  /** The one entry whose text contains `needle`, or a failure naming what it found instead. */
  const only = (needle: string): string => {
    const hits = lesson.limits.filter((l) => l.text.includes(needle))
    expect(hits.map((h) => h.kind), `limits matching ${needle}`).toHaveLength(1)
    return hits[0]!.text
  }
  const kindOf = (needle: string): string =>
    lesson.limits.find((l) => l.text.includes(needle))!.kind

  it('names the kinds it uses, with no two entries repeating themselves', () => {
    // Six when the lesson shipped; eight after Task 6 added design §10.1's rate-selection
    // asymmetry (which §10.1 names as owed to this lesson, and the lesson had missed) and
    // §10.2's capacity direction. The whole column is asserted in reading order, so an
    // insertion shows up here rather than being absorbed.
    expect(lesson.limits.length).toBe(8)
    expect(lesson.limits.map((l) => l.kind)).toEqual([
      'model-value', 'unmodelled', 'unmodelled', 'threshold',
      'model-value', 'out-of-scope', 'out-of-scope', 'out-of-scope',
    ])
    expect(new Set(lesson.limits.map((l) => `${l.kind}:${l.text}`)).size).toBe(8)
    /*
     * **Still no `until`, and Task 6 decided it stays that way.** Design §7.4 asked for
     * `until: 'ru-diversity'` on two entries of the two neighbouring lessons rather than here,
     * and both were declined with the reason recorded in those files' tests; nothing in THIS
     * lesson promises a later one either, because nothing here is lifted later in the course.
     */
    expect(lesson.limits.filter((l) => l.until !== undefined)).toEqual([])
  })

  it('model-value: the truncation, with the lost bins split by bandwidth', () => {
    const t = only('selMemberBins')
    expect(kindOf('selMemberBins')).toBe('model-value')
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

  /**
   * **Position is exactly inert - and what bin independence does to the figures is two
   * statements that run OPPOSITE ways**, which is the Task 6 correction of this entry.
   *
   * The sentence used to end 「格间独立是频率分集偏多的那一边，所以本课量到的代价比真实信道里的
   * 更小」, and the review that queued the fix read that as true below a coherence length of
   * about 7 bins and reversed from 9. Measured (the sweep further down this file): **there is
   * no such threshold, and neither half of that account is what happens.** The gap between the
   * two legs is LARGEST at independence and shrinks monotonically as the coherence length
   * grows, reaching zero once one coherence length covers the channel - so the table's gap is
   * over-stated at every correlation, not under-stated up to 7 bins. The member's own absolute
   * cost runs the other way and is under-stated at every correlation. One reading of 「代价」
   * made the old sentence true and the other made it backwards, which is why the fix is to
   * split it rather than to add a condition to it.
   */
  it('unmodelled: position is exactly inert, and independence cuts both ways by name', () => {
    const t = only('位置完全不起作用')
    expect(kindOf('位置完全不起作用')).toBe('unmodelled')
    expect(t).toContain('真实差距精确为零')
    expect(t).toContain('不是一个效应')
    expect(t).toContain('格间独立是频率分集偏多的那一边')
    // The two halves, each with its own direction, and the admission that neither has a figure.
    expect(t).toContain('两半相反')
    expect(t).toContain('成员自己那一份付的代价被低估了')
    expect(t).toContain('这个差被高估了')
    expect(t).toContain('差距归零')
    expect(t).toContain('这张表的方向站得住；它的大小站不住')
    expect(t).toContain('只有方向，没有数')
    // ...and the unconditional sentence it replaces is gone.
    expect(t).not.toContain('所以本课量到的代价比真实信道里的更小')
  })

  it('unmodelled: the decode threshold has no length term, and that flatters this table', () => {
    const t = only('decodeThreshDb 只读速率，不读字节数')
    expect(kindOf('decodeThreshDb 只读速率，不读字节数')).toBe('unmodelled')
    expect(t).toContain('decodeThreshDb 只读速率，不读字节数')
    expect(t).toContain('8 个百分点')
    expect(t).toContain('真实接收机的长帧误包率更高')
    // The gap the sentence is about, measured: 26.24 − 18.12 is a little over 8 points.
    const gap = (dropRate(legs().half) - dropRate(legs().whole)) * 100
    expect(gap).toBeGreaterThan(8)
    expect(gap).toBeLessThan(8.2)
  })

  /**
   * **The capacity bound, with the direction design §10.2 asks for and `sources` never gave.**
   *
   * §10.2 requires this kept apart from the inter-bin entry above - one is a number this model
   * does not need (position really is inert here), the other is a number it has a mechanism for
   * and refuses to invent (EESM's β, which the standard never gives). The direction is the part
   * that matters to this lesson, and it is the one that STRENGTHENS it: a real code sits
   * further below capacity the fewer independent fades it spans, so the thinner the share the
   * looser the bound, so the real tail cost exceeds the measured one. No figure is printed for
   * it and the entry says in so many words that none was measured - the discipline
   * `ofdma-dl`'s reseed entry already uses for a direction without a number.
   */
  it('threshold: the loss is a lower bound, and a thinner share makes it a looser one', () => {
    const t = only('EESM')
    expect(kindOf('EESM')).toBe('threshold')
    expect(t).toContain('下界')
    expect(t).toContain('容量')
    expect(t).toContain('β')
    expect(t).toContain('标准从未给过 β')
    // The direction, and which way it pushes the table against the other two mechanisms.
    expect(t).toContain('成员那一份越薄')
    expect(t).toContain('这个下界离真实越远')
    expect(t).toContain('真实的尾部代价比本课量到的更大')
    expect(t).toContain('往大处推')
    expect(t).toContain('都只能是方向，不是数')
    // Kept apart from the inter-bin entry, by §10.2's own requirement.
    expect(t).toContain('两件事要分开记')
  })

  /**
   * **The asymmetry design §10.1 names as owed to this lesson, and the lesson had missed.**
   *
   * §10.1: 「这一刀让它再多一层：成员的解调读 4 格，而它的选级读整条信道的那一个平坦值。这一句要进
   * 新课的 `limits`。」 It was absent - 选级 / 载波侦听 / 前导 / 捕获 / 平坦 all scored zero hits
   * in the lesson file. The failure mode is specific: a reader finishes the table and asks why
   * the rate loop does not drop a rung to recover the member, and the only answer the lesson
   * gave was scene-local (「速率已经钉在最低一级」), which is the wrong intuition anywhere the
   * link is not pinned at MCS 0.
   *
   * §10.1's own wording is loose in one place, and the entry is written to the engine instead:
   * rate selection does not read "the whole channel's flat draw", it reads the link table's
   * STATIC mean level (`mcsForPeer`, whose own comment gives the reason), so not even this
   * frame's flat draw reaches it. What does respond is `RateControl`'s loss feedback - two
   * consecutive failures, one rung, floored at 0 - which is reactive and per-link, and that is
   * the half the entry has to state or the reader keeps the wrong answer.
   */
  it('out-of-scope: the decode reads the share, the rate selection reads the link table mean', () => {
    const t = only('mcsForPeer，')
    expect(kindOf('mcsForPeer，')).toBe('out-of-scope')
    for (const str of ['resolveLock', '载波侦听', '前导检测', '捕获效应（capture effect）',
      '成员的解调读它那一片的格，而它的选级读整条信道的那一个值',
      '速率环为什么不降一档把它补回来', '那只在这个场景上成立',
      '连续两次失败', '先掉两帧再降一档', '分不出「这一片薄」与「这条链路差」']) {
      expect(t, str).toContain(str)
    }
  })

  it('model-value: one resource-unit size, and why a scheduler is out of scope', () => {
    const t = only('成员数的倒数')
    expect(kindOf('成员数的倒数')).toBe('model-value')
    expect(t).toContain('成员数的倒数')
    expect(t).toContain('26、52、106、242、484、996')
    expect(t).toContain('标准不规定调度器')
  })

  it('out-of-scope: the orthogonal group, and bins belonging to a resource unit', () => {
    const t = only('orthogonalGroup')
    expect(kindOf('orthogonalGroup')).toBe('out-of-scope')
    expect(t).toContain('orthogonalGroup')
    expect(t).toContain('干扰与噪声在每一格里是同一个数')
    expect(t).toContain('格号区间属于那一片资源单元，不属于某一台设备')
    expect(t).toContain('mumimo-choose')
  })

  it('out-of-scope: the uplink loop that never closed, named as not this slice’s doing', () => {
    const t = only('cfg.mcsForPeer')
    expect(kindOf('cfg.mcsForPeer')).toBe('out-of-scope')
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

describe('ru-diversity · the scene comment’s own nine figures', () => {
  /*
   * **Why this block exists.** `src/course/wifiScenes.ts`'s `ruDiversityScenario` comment
   * justifies the scene's ONE tuned quantity — where the televisions stand — with a position
   * sweep and three rejected alternatives, and prints nine figures doing it. The sweep above
   * pinned x = 12.5 / 13.5 / 14.5. Nothing pinned the x = 11.5 leg or a single figure from any
   * of the three alternatives, and those are exactly the ones the next person to re-tune this
   * scene will copy. This branch has already had to correct one of them: the comment used to
   * say the power knob reaches this rung at 13 dB, which lands at 2.547 dB — inside the
   * non-monotone region, where the gate is not even stably signed.
   *
   * **The builders are the comment's own words, so a reader can check the mapping:**
   *   - "moving the pair inside this room" → `movedX`;
   *   - "deleting the x = 11 partition" → `oneWall` (the plan's second interior brick);
   *   - "the televisions moved into the living room at x = 8.5" → `movedX(8.5)`, which crosses
   *     only the x = 6 partition and so is a one-wall plan without deleting anything;
   *   - "turning the router down" → `quieter`, the AP's own `txPowerDbm`.
   *
   * **Instrument, stated once:** 1000 ms unless a case says otherwise, seed 7, addressed
   * downlink receptions, grouped by raw float margin, largest group — `dlRows` and
   * `largestMarginGroup`, the same two the gate uses.
   */
  const movedX = (sc: Scenario, x: number): Scenario =>
    ({ ...sc, nodes: sc.nodes.map((n) => (n.id.startsWith('sta') ? { ...n, pos: { ...n.pos, x } } : n)) })
  /** Delete the x = 11 partition, the only brick between the living room and the bedroom. */
  const oneWall = (sc: Scenario): Scenario =>
    ({ ...sc, walls: sc.walls.filter((w) => !(w.x1 === 11 && w.x2 === 11)) })
  const quieter = (sc: Scenario, db: number): Scenario =>
    ({ ...sc, nodes: sc.nodes.map((n) => (n.id === 'ap' ? { ...n, txPowerDbm: n.txPowerDbm - db } : n)) })

  /** The comment's own two-leg reading: the largest margin group's members against the control. */
  const twoLegs = (key: string, build: (on: boolean) => Scenario, ns = GATE_NS) => {
    const on = dlRows(runScene(`${key}|on`, build(true), ns))
    const off = dlRows(runScene(`${key}|off`, build(false), ns))
    const group = largestMarginGroup(on)
    const margin = group[0]!.margin
    return {
      margin,
      half: group.filter((r) => r.ruFraction !== undefined),
      whole: off.filter((r) => r.margin === margin),
    }
  }

  const SCENE = readFileSync(new URL('../../src/course/wifiScenes.ts', import.meta.url), 'utf8')

  it('pins the x = 11.5 leg of the sweep, the one the sweep above left out', () => {
    const l = twoLegs('x11.5', (on) => movedX(ruDiversityScenario(on), 11.5))
    expect(Number(l.margin.toFixed(3))).toBe(6.24)
    expect(l.half.length).toBe(429)
    expect(l.whole.length).toBe(201)
    expect(dropRate(l.half)).toBeCloseTo(0.0676, 4)
    expect(dropRate(l.whole)).toBeCloseTo(0.0149, 4)
    // Still the right direction, two metres in from the shipped point.
    expect(dropRate(l.half)).toBeGreaterThan(dropRate(l.whole))
    for (const t of ['6.240', '6.76 % against', '1.49 % at x = 11.5']) expect(SCENE).toContain(t)
  }, 600_000)

  it('pins the first rejected alternative, and which grouping its 628 is a count under', () => {
    // One wall, televisions where they are: the margin goes useless, which is `ofdma-dl`'s own
    // problem and the reason this lesson is not taught there.
    //
    // **"On that rung" is the MCS decode threshold, not the float margin and not `mcs`.**
    // Grouped by `threshDb` the rung holds 628 of the 666 addressed receptions; grouped by
    // exact float margin the same rows give 588, because the two televisions' mean levels
    // differ in their last bits. A third reading — by the member's own `mcs` — gives 621, so
    // the figure means nothing without the grouping printed beside it.
    const rows = dlRows(runScene('oneWall|on', oneWall(ruDiversityScenario(true))))
    expect(rows.length).toBe(666)
    expect(q(rows.map((r) => r.margin), 0.5)).toBeCloseTo(15.547, 3)
    const byThresh = new Map<number, number>()
    for (const r of rows) byThresh.set(r.threshDb, (byThresh.get(r.threshDb) ?? 0) + 1)
    expect(Math.max(...byThresh.values())).toBe(628)
    expect(largestMarginGroup(rows).length).toBe(588)
    for (const t of ['15.547', '628 of 666', 'give 588']) expect(SCENE).toContain(t)
  }, 600_000)

  it('pins the second rejected alternative as multi-valued, which is the disqualifier', () => {
    // Televisions in the living room at x = 8.5: one wall crossed, and the margin is no longer
    // one number — four MCS rungs at once, which is the confound the scene exists to avoid.
    const rows = dlRows(runScene('x8.5|on', movedX(ruDiversityScenario(true), 8.5)))
    expect(q(rows.map((r) => r.margin), 0.5)).toBeCloseTo(5.672, 3)
    expect([...new Set(rows.map((r) => r.threshDb))].length).toBe(4)
    for (const t of ['5.672 dB at the median over four rungs, MCS 4 to 7']) expect(SCENE).toContain(t)
  }, 600_000)

  it('pins the power knob at 12 dB, not 13 — and 13 dB inside the non-monotone region', () => {
    // The brick's own 12 dB, reached by measurement rather than inferred from `WALL_LOSS_DB`.
    const margins = [11, 12, 13].map((db) => {
      const rows = dlRows(runScene(`pwr-${db}|on`, quieter(oneWall(ruDiversityScenario(true)), db)))
      return Number(largestMarginGroup(rows)[0]!.margin.toFixed(3))
    })
    expect(margins).toEqual([4.547, 3.547, 2.547])
    // 12 dB is the one that reproduces the shipped scene's rung; 13 dB lands in the region
    // design §7.3.1 (b) says is not monotone.
    expect(margins[1]).toBe(Number(legs().key.toFixed(3)))
    for (const t of ['4.547 / 3.547 / 2.547 dB', 'lands on 2.547 dB']) expect(SCENE).toContain(t)
  }, 900_000)

  it('pins the two rounds the power knob and the wall give, counted the same way', () => {
    // **The correction this test exists for.** The comment read 「291 member receptions at
    // 26.12 % here against 284 at 29.93 % there」, and the two halves were not the same
    // population: 291 is the shipped round's MEMBER receptions, while 284 was the power-knob
    // round's 283 members PLUS its one whole-channel reception — divided into the members' own
    // 85 failures, so 29.93 % described neither population. Members only, on both sides.
    const members = (rows: Row[]): Row[] => rows.filter((r) => r.ruFraction !== undefined)
    const ship = members(legs().on)
    const knob = members(dlRows(runScene('pwr-12|on', quieter(oneWall(ruDiversityScenario(true)), 12))))
    expect(ship.length).toBe(291)
    expect(knob.length).toBe(283)
    expect(dropRate(ship)).toBeCloseTo(0.2612, 4)
    expect(dropRate(knob)).toBeCloseTo(0.3004, 4)
    // The point of the sentence: the power knob only moves the downlink, so at the same rung it
    // is a harder round than the wall.
    expect(dropRate(knob)).toBeGreaterThan(dropRate(ship))
    expect(SCENE).toContain('291 member receptions at 26.12 % here against 283 at 30.04 % there')
    expect(SCENE, 'the mixed-instrument pair is back').not.toContain('284 at 29.93 % there')
  }, 600_000)

  it('pins the 13 dB configuration flipping sign between 1000 and 2000 ms', () => {
    // Why 13 dB is disqualified rather than merely worse: at 2.547 dB the gate is not stably
    // signed, so a reader who followed the comment's old sentence would have built the one
    // configuration that disproves it.
    const build = (on: boolean): Scenario => quieter(oneWall(ruDiversityScenario(on)), 13)
    const one = twoLegs('pwr-13', build, GATE_NS)
    expect(Number(one.margin.toFixed(3))).toBe(2.547)
    expect(dropRate(one.half)).toBeCloseTo(0.4194, 4)
    expect(dropRate(one.whole)).toBeCloseTo(0.3945, 4)
    expect(dropRate(one.half)).toBeGreaterThan(dropRate(one.whole))
    const two = twoLegs('pwr-13|2s', build, 2000 * MS)
    expect(Number(two.margin.toFixed(3))).toBe(2.547)
    expect(dropRate(two.half)).toBeCloseTo(0.3858, 4)
    expect(dropRate(two.whole)).toBeCloseTo(0.3991, 4)
    // Same configuration, same rung, opposite sign: twice the run length is enough to turn it.
    expect(dropRate(two.half)).toBeLessThan(dropRate(two.whole))
    for (const t of ['41.94 % against 39.45 %', '38.58 % against 39.91 %']) expect(SCENE).toContain(t)
  }, 1_200_000)
})

/**
 * **Every figure the prose prints, read back out of it.**
 *
 * Everything above measures this lesson's claims, and most of its figures were already watched
 * — but watched in the shape this programme calls the eighth: the figure typed on **this** side
 * as `toBeCloseTo(2.098, 3)`, with an `expect(mainText).toContain('九格 2.098 dB，四格 2.068 dB')`
 * beside it. That pair does redden when the prose moves, so the sweep of 2026-10-13 found most
 * of this lesson pinned. What it cannot do is survive a re-measurement: if the scene ever
 * changes, both sides have to be edited by hand, and the test says nothing about whether the
 * printed figure is still the measured one. Here the figure is **parsed out of the lesson** and
 * compared with the measurement, at the precision it was printed to.
 *
 * Nothing new is measured. Every assertion calls the same `legs`, `runScene`, `runOf`, `dlRows`,
 * `largestMarginGroup`, `dropRate`, `q`, `mean` and the same engine functions the tests above
 * call — the memoised runs are the ones they already paid for.
 *
 * **Two instruments are new, and both are the standard's own arithmetic rather than a literal:**
 *
 *  - **the tone counts come off the ranges `engine/selectivity.ts` records.** 106 is not typed
 *    here: it is `[-122:-17]` counted out, from the docblock that justifies the truncation. The
 *    26 is `[-16:-4, 4:16]` counted the same way, and 52 likewise, so 「106 音调资源单元」 is read
 *    against a span rather than against a second copy of itself. The engine's docblock also
 *    names RU 5, RU 14 and Table 27-8's NOTE 2, which are three more figures the lesson prints.
 *  - **the four excluded 26-tone RUs are read against each other and `RU26_PER_20MHZ`.** 「RU 19、
 *    56、93、130」 is an arithmetic progression whose step is the 26-tone RUs of one 80 MHz block
 *    (4 × 9 + 1 = 37, the +1 being that block's own middle RU) and whose first term is that
 *    block's middle (19 = (37 + 1) / 2). Move any one of the four and the progression breaks.
 *
 * **One figure is exempt, class (a), and it is argued rather than waved:** the 996 of 「26、52、
 * 106、242、484、996……」. That list is the standard's discrete tone table and this repository
 * holds no corpus of it, so the five figures that can be anchored are (26 and 52 against the
 * engine's ranges, 106 against them too, 242 against the 484 printed next to it, since 484 is
 * exactly twice it), and the sixth cannot: 996 is neither twice 484 nor a whole number of
 * 26-tone RUs. What the sentence uses the list for — that the sizes are discrete and uneven, so
 * a scheduler picks from a table rather than dividing — is checked on the five.
 */
describe('ru-diversity · the two figures `observe` prints with the window they belong to', () => {
  /*
   * **A figure typed into a built string was invisible until 2026-10-14**, and this lesson's
   * `observe` has two: 「本课默认载入的 150 ms 里，接入点发出的合成记录一共 45 条，其中 1 条是
   * 整条信道」 sits in a template, so the sweep that swept this lesson whole never planted them.
   * The sentence names its own window, which is what makes the count readable at all.
   */
  it('reads the window and the count of synthesis records in it', () => {
    const text = (lesson.observe ?? []).join('\n')
    const m = /本课默认载入的 (\d+) ms 里，接入点发出的合成记录一共 (\d+) 条，其中 (\d+) 条是整条信道/
      .exec(text)
    expect(m, '`observe` no longer prints this in the shape this test reads').not.toBeNull()
    const [ms, total, whole] = m!.slice(1).map(Number)
    expect(ms! * MS, 'the window this lesson loads by default').toBe(RUN_NS)
    const sels = ofType(runOf(lesson, SPLIT, ms! * MS), 'WIFI_SEL')
    expect(sels.length, 'the synthesis records this window really holds').toBe(total)
    expect(sels.filter((r) => r.ruFraction === undefined).length,
      'of which the ones that were not grouped').toBe(whole)
  })
})

describe('ru-diversity · every figure the prose prints, read back out of it', () => {
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
  const NUMS = blockText(lesson.numbers)
  const DEEP = blockText(lesson.deeper)
  const SRC = blockText(lesson.sources)
  const LIM = blockText(lesson.limits)
  const OBS = blockText(lesson.observe)
  const TRY = blockText(lesson.tryThis)
  const ALL = [
    lesson.why, blockText(lesson.outcomes), blockText(lesson.terms), blockText(lesson.picture),
    NUMS, DEEP, SRC, LIM, OBS, TRY, blockText(lesson.quiz),
  ].join('\n')

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (s: string, re: RegExp, what: string): string[] => {
    const m = re.exec(s)
    expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (s: string, re: RegExp, what: string): number[] => raw(s, re, what).map(val)
  /** Every occurrence, with the count asserted so a new printing cannot slip in unread. */
  const every = (s: string, re: RegExp, what: string, want: number): string[][] => {
    const ms = [...s.matchAll(re)]
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
  const occ = (s: string, needle: string): number => s.split(needle).length - 1
  const zh = (x: string): number => {
    const n = /^\d+$/.test(x) ? Number(x) : zhNumeral(x.replace(/两/g, '二'))
    expect(n, `「${x}」 is not a number this test can read`).not.toBeNull()
    return n!
  }
  const tableBy = (needle: string): Extract<Block, { kind: 'table' }> => lesson.numbers!
    .filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
    .find((b) => b.heading!.includes(needle))!

  /**
   * The engine's own docblock for `selMemberBins`, which carries the standard's tone ranges —
   * the instrument behind every tone count this lesson prints.
   */
  const SEL = readFileSync(new URL('../../src/engine/selectivity.ts', import.meta.url), 'utf8')
  /** Every `[lo:hi]` range that docblock quotes, counted out into tones. */
  const SPANS = [...SEL.matchAll(/`\[(-?\d+):(-?\d+)\]`/g)].map(([, a, b]) => val(b!) - val(a!) + 1)
  /** The middle 26-tone RU, whose range comes in two halves around DC. */
  const SPLIT_SPAN = ((): number => {
    const [a, b, c, d] = figs(SEL, /`\[(-?\d+):(-?\d+), (-?\d+):(-?\d+)\]`/, 'the middle RU’s range')
    return (b! - a! + 1) + (d! - c! + 1)
  })()
  /** The two tone counts those ranges give, which three `it`s below read figures against. */
  const RU52 = [...new Set(SPANS)].find((x) => x > RU26_TONES && x < 100)!
  const RU106 = [...new Set(SPANS)].find((x) => x > 100)!

  it('counts the tones of one bin out of the standard’s own range, three printings of it', () => {
    // The 26 the lesson prints is the middle 26-tone RU's own two half-ranges, counted.
    expect(SPLIT_SPAN, 'the middle RU of Table 27-8, counted out of its range').toBe(RU26_TONES)
    for (const [tones] of every(ALL, /(\d+) 根(?:相邻)?音调/g, 'the tones of one bin', 3)) {
      same(tones!, RU26_TONES, 'the tones in one bin')
    }
    // And the bin width is that count times the subcarrier spacing, both read off the sentence.
    const [mhz, tones, khz] = raw(SRC, /每格 ([\d.]+) MHz 由 (\d+) 根音调与 ([\d.]+) kHz/,
      '`sources` on where the bin width comes from')
    same(tones!, RU26_TONES, 'the tones the bin width is computed from')
    same(khz!, DF_EHT_KHZ, 'the subcarrier spacing')
    same(mhz!, (val(tones!) * val(khz!)) / 1000, 'the bin width, from the two figures beside it')
    same(mhz!, selBinWidthMhz(), 'the bin width the engine computes')
    // The one interpolated printing, which a planter cannot reach but a reader can see.
    same(raw(ALL, /按 ([\d.]+) MHz 一格/, 'the picture’s bin width')[0]!, selBinWidthMhz(),
      'the bin width in `picture`')
  })

  it('reads every N-tone resource unit against a span the engine records', () => {
    expect(SPANS.filter((x) => x === 106).length, 'the six 106-tone RUs of Tables 27-8 and 27-9').toBe(6)
    expect(SPANS.filter((x) => x === 52).length, 'the four 52-tone RUs of Table 27-8').toBe(4)
    // 242 is anchored by the 484 printed beside it — the standard's table doubles there.
    const tones = figs(LIM, /（(\d+)、(\d+)、(\d+)、(\d+)、(\d+)、(\d+)……）/,
      '`limits` on the standard’s discrete tone table')
    same(String(tones[0]), RU26_TONES, 'the smallest RU of the table')
    same(String(tones[1]), 2 * RU26_TONES, 'the 52-tone RU, two bins’ worth')
    same(String(tones[1]), RU52, 'the 52-tone RU against Table 27-8’s range')
    same(String(tones[2]), RU106, 'the 106-tone RU against Table 27-8’s range')
    same(String(tones[4]), 2 * tones[3]!, 'the 484-tone RU, twice the 242 printed before it')
    for (let i = 1; i < tones.length; i++) {
      expect(tones[i]!, `the table is increasing at ${tones[i]}`).toBeGreaterThan(tones[i - 1]!)
    }
    const RU242 = tones[3]!
    /*
     * **Exempt, class (a): the 996.** Argued in this describe's header — the one entry of the
     * six that neither doubles its neighbour nor counts out of a range this repository holds.
     */
    expect(tones[5]!, 'and the exempt entry is the last one, which is what the argument covers')
      .toBeGreaterThan(tones[4]!)

    // Now every printing of a tone count in the lesson, against those four anchored values.
    const seen = new Map<number, number>()
    for (const [n] of every(ALL, /(\d+) 音调/g, 'every N-tone resource unit the lesson prints', 21)) {
      const v = val(n!)
      seen.set(v, (seen.get(v) ?? 0) + 1)
      expect([RU26_TONES, RU52, RU106, RU242], `「${n} 音调」`).toContain(v)
    }
    expect([...seen.entries()].sort((a, b) => a[0] - b[0]))
      .toEqual([[RU26_TONES, 11], [RU52, 2], [RU106, 6], [RU242, 2]])
    // What the two floors fold to in bins, which is the clause the sentence draws from them.
    const [he, eht] = figs(LIM, /HE 不小于 (\d+) 音调、EHT 不小于 (\d+) 音调/, '`limits` on the two floors')
    expect(Math.floor(he! / RU26_TONES), 'the HE floor in bins').toBe(selMemberBins(20, 1 / 2))
    expect(Math.floor(eht! / RU26_TONES), 'the EHT floor in bins').toBe(selBins(20))
    expect(LIM, 'and the lesson says those two folds in words').toContain('最少四格与九格')
  })

  it('reads the four excluded 26-tone RUs as the progression they are', () => {
    const rus = figs(SRC, /RU (\d+)、(\d+)、(\d+)、(\d+)/, '`sources` on the RUs the CQI report excludes')
    // One 80 MHz block holds 4 x 9 + 1 26-tone RUs, the +1 being its own middle one.
    const step = 4 * RU26_PER_20MHZ + 1
    expect(rus.map((x, i) => (i === 0 ? x : x - rus[i - 1]!)).slice(1), 'the step of the progression')
      .toEqual([step, step, step])
    same(String(rus[0]), (step + 1) / 2, 'the first of them: the middle RU of the first 80 MHz block')
    // And the nine blocks per 20 MHz the same sentence gives, in Chinese.
    const [mhz, blocks] = raw(SRC, /每 (\d+) MHz ([一二三四五六七八九十]+)块/, '`sources` on the CQI blocks')
    expect(Number.isInteger(selBins(val(mhz!))), `${mhz} MHz splits into whole bins`).toBe(true)
    expect(zh(blocks!), 'the reportable bins of one 20 MHz').toBe(RU26_PER_20MHZ)
    expect(zh(blocks!), 'which is this engine’s own bin count').toBe(selBins(val(mhz!)))
  })

  it('reads every (bandwidth, member count) the prose prints against the engine’s own split', () => {
    for (const [w, n] of every(ALL, /(\d+) MHz(?:，| )(?:上|)?(两|三|四|\d+) ?个成员/g,
      'every (bandwidth, member count) pair', 13)) {
      const width = val(w!)
      expect(Number.isInteger(selBins(width)), `${width} MHz must split into whole bins`).toBe(true)
      expect([2, 3, 4], `${width} MHz with ${n} members`).toContain(zh(n!))
    }
    // The 40 MHz claims, each read back: 18 bins, no middle one, and the two RUs left out.
    for (const [even] of every(ALL, /(\d+) 是偶数/g, 'the bins of 40 MHz, twice', 2)) {
      same(even!, selBins(40), 'the bins of 40 MHz')
      expect(selBins(40) % 2, 'which is what 「是偶数」 claims about it').toBe(0)
    }
    for (const [lo, hi] of every(ALL, /直流落在 RU (\d+) 与 RU (\d+) 之间/g, 'the two RUs DC falls between', 2)) {
      same(lo!, selBins(40) / 2, 'the RU below DC at 40 MHz')
      same(hi!, selBins(40) / 2 + 1, 'and the one above it')
    }
    // RU 5 and RU 14 are the engine docblock's own pair, and they are symmetric about the centre.
    const [five, fourteen] = figs(SEL, /26-tone RUs (\d+)[\s*]+and (\d+)/, 'the engine on the two RUs left out')
    const [evenW, evenBins] = figs(SEL, /\((\d+) MHz has no middle RU — (\d+) is even\)/,
      'the engine on 40 MHz having no middle RU')
    expect(evenW, 'the width that docblock is talking about').toBe(40)
    expect(evenBins, 'and its bin count').toBe(selBins(40))
    expect(five! + fourteen!, 'the two left-out RUs are symmetric about the channel centre')
      .toBe(selBins(40) + 1)
    expect(five!, 'and the lower one sits just past the first member’s run')
      .toBe(selMemberBins(40, 1 / 4) + 1)
    for (const [a, b] of every(ALL, /26 音调 RU (\d+) 与 RU (\d+)/g, 'the lesson on the two RUs left out', 2)) {
      same(a!, five!, 'the lower RU the 40 MHz split leaves out')
      same(b!, fourteen!, 'and the upper one')
    }
  })

  it('reads the two bandwidths that appear without a member count', () => {
    /*
     * **The sweep of 2026-10-13 walked through both of these**, and they are the same shape:
     * 「40 MHz 没有「中间那一格」」 in the share table's last column and 「而 40 MHz 根本没有中间
     * 那一格」 in `limits` name a bandwidth with no member count after it, so the (bandwidth,
     * member count) read above does not reach them. What makes the figure checkable is the
     * clause itself: a channel has a middle bin only when its bin count is odd, and this engine
     * answers for a width only when that count is a whole number.
     */
    for (const [w] of every(ALL, /(\d+) MHz (?:没有|根本没有中间)/g,
      'the bandwidth with no middle bin, printed twice', 2)) {
      const width = val(w!)
      expect(Number.isInteger(selBins(width)), `${width} MHz must split into whole bins`).toBe(true)
      expect(selBins(width) % 2, `${width} MHz has no middle bin, so its bin count is even`).toBe(0)
      expect(selBins(width) / 2 + 1, 'and the bin above DC is the one the same clause names')
        .toBe(figs(ALL, /直流落在 RU \d+ 与 RU (\d+) 之间/, 'the RU above DC')[0])
    }
  })

  it('reads the multi-resource-unit allocation, all three printings of it', () => {
    /*
     * **The other six the sweep walked through**: 「52+26 这样的多资源单元」, printed in
     * `numbers`, in `sources` and in `limits`. Neither figure carries 「音调」 after it, so the
     * read of every N-tone resource unit above does not reach them either — and that is exactly
     * the shape this programme keeps finding, a figure whose unit is implied by its neighbours.
     * Both halves are anchored: the 52 against Table 27-8's four 52-tone ranges, the 26 against
     * the middle RU's own two half-ranges, and the sum against what the sentence uses it for —
     * absorbing the bin the truncation drops, which is one bin on top of the two the 52 covers.
     */
    for (const [a, b] of every(ALL, /(\d+)\+(\d+) 这(?:样的|类)多资源单元/g,
      'the multi-RU allocation, printed three times', 3)) {
      expect(val(a!), 'the first half, against Table 27-8’s 52-tone range').toBe(RU52)
      expect(val(b!), 'the second, against the middle RU’s own range').toBe(RU26_TONES)
      expect(Math.floor(val(a!) / RU26_TONES) + Math.floor(val(b!) / RU26_TONES),
        'and the two together are the member’s two bins plus the one nobody holds')
        .toBe(selMemberBins(20, 1 / 4) + (selBins(20) - 2 * selMemberBins(20, 1 / 2)))
    }
  })

  it('reads the share table’s own cells out of the cells, label column included', () => {
    const t = tableBy('谁也没拿的那几格')
    expect(t.rows.length, 'the rows of the share table').toBe(6)
    for (const row of t.rows) {
      const [w, n] = figs(row[0]!, /(\d+) MHz，(\d+) 个成员/, `the label of 「${row[0]}」`)
      same(row[1]!, selBins(w!), `the channel’s bins on row 「${row[0]}」`)
      same(row[2]!, selBins(w!) / n!, `the even split on row 「${row[0]}」`)
      same(row[3]!, selMemberBins(w!, 1 / n!), `the truncated bins on row 「${row[0]}」`)
      const left = selBins(w!) - n! * selMemberBins(w!, 1 / n!)
      if (left === 0) expect(row[4], `row 「${row[0]}」 leaves nothing over`).toBe('没有')
      else same(raw(row[4]!, /^(\d+) 格/, `the leftover count on row 「${row[0]}」`)[0]!, left,
        `the leftover bins on row 「${row[0]}」`)
    }
    // The heading of the other table is a figure too: the length every figure below it is measured over.
    same(raw(tableBy('同一个实测余量组里的两腿').heading!, /（(\d+) ms/, 'the gate table’s heading')[0]!,
      GATE_NS / MS, 'the round length the two legs are measured over')
  })

  it('reads the arrival level and the lowest rung off the link table', () => {
    const sc = lesson.scenario()
    const links = buildLinkTable(sc.nodes, sc.walls)
    const level = links.get('ap')!.get('sta-1')!
    same(raw(ALL, /约 −(\d+) dBm/, 'the picture on the arrival level')[0]!, -Math.round(level),
      'the arrival level, as the prose rounds it')
    // The 20 MHz the outcomes name is the channel every node in this scene is on.
    const [w] = figs(blockText(lesson.outcomes), /(\d+) MHz 上两个成员/, 'the outcomes on the bandwidth')
    expect(new Set(sc.nodes.map((n) => n.caps.widthMhz)), 'every node is on that channel').toEqual(new Set([w]))
    expect(Number.isInteger(selBins(w!)), 'which splits into whole bins').toBe(true)
  })

  it('reads the gate table and its two denominators out of the prose', () => {
    const { on, group, key, half, whole } = legs()
    const t = tableBy('同一个实测余量组里的两腿')
    for (const [i, leg] of [half, whole].entries()) {
      const [all, bad] = figs(t.rows[i]![3]!, /(\d+) 条里 (\d+) 条/, `the counts of leg ${i}`)
      expect(all, `the receptions of leg ${i}`).toBe(leg.length)
      expect(bad, `the failures of leg ${i}`).toBe(leg.filter((x) => x.failed).length)
      same(raw(t.rows[i]![4]!, /([\d.]+) %/, `the drop rate of leg ${i}`)[0]!,
        100 * dropRate(leg), `the drop rate of leg ${i}`)
      // The bin count the row claims, which is the whole subject of the comparison.
      same(t.rows[i]![2]!, leg[0]!.bins, `the bins of leg ${i}`)
    }
    // The grouping paragraph: the group, the round it came out of, and the strays.
    const [dl, inGroup] = figs(NUMS, /装下了这一轮 (\d+) 条下行（downlink, DL）接收里的 (\d+) 条/,
      'the grouping paragraph on its own denominator')
    expect(dl, 'the member leg’s whole round').toBe(on.length)
    expect(inGroup, 'and the group inside it').toBe(group.length)
    same(raw(NUMS, /掉出组外的那 (\d+) 条/, 'the strays')[0]!, on.length - group.length, 'the strays')
    const [wAll, wIn] = figs(NUMS, /按同一条规则是 (\d+) 条里的 (\d+) 条/,
      'the whole-channel leg’s denominator')
    expect(wAll, 'the whole-channel leg’s own round').toBe(dlRows(runOf(lesson, WHOLE, GATE_NS)).length)
    expect(wIn, 'and the group inside it').toBe(whole.length)
    // The margin itself, printed three times: the paragraph, the gate table of the window, the quiz.
    same(raw(NUMS, /这一组的余量是 ([\d.]+) dB/, 'the group’s margin')[0]!, key, 'the group’s margin')
    same(raw(NUMS, /本课的 ([\d.]+) dB/, 'the gate table’s own row')[0]!, key, 'the margin in the gate table')
  })

  it('reads the tail paragraph’s eight figures off the two populations', () => {
    const { half, whole } = legs()
    const h = half.map((r) => r.lossDb)
    const w = whole.map((r) => r.lossDb)
    const [nine, four, less] = raw(NUMS, /九格 ([\d.]+) dB，四格 ([\d.]+) dB，四格还低了 ([\d.]+) dB/,
      'the two mean losses')
    same(nine!, mean(w), 'the nine-bin leg’s mean loss')
    same(four!, mean(h), 'the four-bin leg’s mean loss')
    same(less!, mean(w) - mean(h), 'and the difference the prose draws from them')
    const [mw, mh] = raw(NUMS, /([\d.]+) dB 降到 ([\d.]+) dB/, 'the two medians')
    same(mw!, q(w, 0.5), 'the nine-bin median')
    same(mh!, q(h, 0.5), 'the four-bin median')
    const [pw, ph] = raw(NUMS, /([\d.]+) dB 涨到 ([\d.]+) dB/, 'the two ninetieth percentiles')
    same(pw!, q(w, 0.9), 'the nine-bin p90')
    same(ph!, q(h, 0.9), 'the four-bin p90')
    const [dw, dh] = raw(NUMS, /从 ([\d.]+) dB 走到 ([\d.]+) dB/, 'the two deepest receptions')
    same(dw!, Math.max(...w), 'the deepest nine-bin reception')
    same(dh!, Math.max(...h), 'the deepest four-bin reception')
    // Both directions the paragraph claims, so the figures are not merely equal to themselves.
    expect(val(mh!), 'the median moves down').toBeLessThan(val(mw!))
    expect(val(ph!), 'and p90 moves up').toBeGreaterThan(val(pw!))
    // The better-than-mean counts, and the percentages computed from them.
    const [nw, cw, nh, ch] = figs(NUMS, /九格里 (\d+) 条有 (\d+) 条，四格里 (\d+) 条有 (\d+) 条/,
      'the better-than-mean counts')
    expect(nw, 'the nine-bin population').toBe(whole.length)
    expect(nh, 'the four-bin population').toBe(half.length)
    expect(cw, 'the nine-bin receptions better than their own mean').toBe(w.filter((x) => x <= 0).length)
    expect(ch, 'the four-bin ones').toBe(h.filter((x) => x <= 0).length)
    const [pctW, pctH] = raw(NUMS, /占比从 ([\d.]+) % 涨到 ([\d.]+) %/, 'the two shares')
    same(pctW!, (100 * cw!) / nw!, 'the nine-bin share, from the counts beside it')
    same(pctH!, (100 * ch!) / nh!, 'and the four-bin share')
    // The deepest bin, which runs the other way — the misreading the paragraph exists to block.
    const [bw, bh] = raw(NUMS, /比均值低 ([\d.]+) dB，四格那一腿只有 ([\d.]+) dB/, 'the two deepest bins')
    same(bw!, -q(whole.map((r) => r.worstBinDb), 0.5), 'the nine-bin leg’s median worst bin')
    same(bh!, -q(half.map((r) => r.worstBinDb), 0.5), 'the four-bin leg’s')
    expect(val(bh!), 'shallower on the leg that drops more').toBeLessThan(val(bw!))
  })

  it('reads the window’s three margins and four drop rates off the sweep', () => {
    const at = (x: number, on: boolean): Scenario => {
      const sc = ruDiversityScenario(on)
      return { ...sc, nodes: sc.nodes.map((n) => (n.id.startsWith('sta') ? { ...n, pos: { ...n.pos, x } } : n)) }
    }
    /** The same three positions the sweep above ran, off the same memo. */
    const leg = (x: number) => {
      const on = dlRows(runScene(`x${x}|on`, at(x, true)))
      const off = dlRows(runScene(`x${x}|off`, at(x, false)))
      const group = largestMarginGroup(on)
      const key = group[0]!.margin
      return {
        key,
        half: dropRate(group.filter((r) => r.ruFraction !== undefined)),
        whole: dropRate(off.filter((r) => r.margin === key)),
      }
    }
    const inward = leg(12.5)
    const here = leg(13.5)
    const outward = leg(14.5)
    // One metre out: the margin the prose prints, and the pair that runs backwards.
    same(raw(NUMS, /余量掉到 ([\d.]+) dB/, 'the margin one metre out')[0]!, outward.key, 'the margin one metre out')
    const [revW, revH] = raw(NUMS, /整条九格 ([\d.]+) %，成员四格 ([\d.]+) %/, 'the reversed pair')
    same(revW!, 100 * outward.whole, 'the nine-bin drop rate one metre out')
    same(revH!, 100 * outward.half, 'the four-bin one')
    expect(val(revH!), 'and out there the four-bin leg drops LESS').toBeLessThan(val(revW!))
    // One metre in: still forward.
    same(raw(NUMS, /往里挪一米，余量 ([\d.]+) dB/, 'the margin one metre in')[0]!, inward.key,
      'the margin one metre in')
    const [fwdH, fwdW] = raw(NUMS, /（([\d.]+) % 对 ([\d.]+) %）/, 'the forward pair')
    same(fwdH!, 100 * inward.half, 'the four-bin drop rate one metre in')
    same(fwdW!, 100 * inward.whole, 'the nine-bin one')
    expect(val(fwdH!), 'and in there it drops MORE').toBeGreaterThan(val(fwdW!))
    // The bracket, and how the prose rounds the distance to its lower edge.
    const [above, below] = raw(NUMS, /([\d.]+) dB 上方向是正的，([\d.]+) dB 上已经反了/, 'the bracket')
    same(above!, here.key, 'the margin the direction still holds at')
    same(below!, outward.key, 'and the one it has reversed at')
    const gap = val(above!) - val(below!)
    same(raw(NUMS, /离它不到 ([\d.]+) dB/, 'the distance to the lower edge')[0]!,
      Math.ceil(gap * 10) / 10, 'the bracket’s width, rounded up to the tenth the prose prints')
    expect(gap, 'and it really is under that').toBeLessThan(val(raw(NUMS, /离它不到 ([\d.]+) dB/, 'x')[0]!))
  }, 600_000)

  it('reads the 15.4 dB of the scene this lesson is not taught on, both printings', () => {
    const base = LESSONS.find((l) => l.id === 'ofdma-dl')!.scenario()
    const rs = runScene('ofdma-dl|sel', { ...base, fading: RAYLEIGH, selectivity: {} }, 150 * MS)
    const margins = ofType(rs, 'WIFI_SEL').map((s) => s.meanSinrDb - s.threshDb)
    const median = q(margins, 0.5)
    for (const [dB] of every(ALL, /余量中位数是 ([\d.]+) dB/g, 'the other scene’s margin, twice', 2)) {
      same(dB!, median, 'the median margin of `ofdma-dl`’s scene')
    }
    // Both printings are the same figure, and the quiz's is the one a reader is asked about.
    expect(occ(NUMS, '15.4 dB') + occ(blockText(lesson.quiz), '15.4 dB'),
      'the two printings of it').toBe(2)
  })

  it('reads `deeper` and `tryThis` off their own rounds', () => {
    const delivered = (v: number | undefined): number =>
      ofType(runOf(lesson, v, GATE_NS), 'RX_OK').filter((r) => r.frame.kind === 'data' && r.from === 'ap').length
    const [split, whole, ns] = figs(DEEP, /开着分片 (\d+) 帧，关掉 (\d+) 帧（(\d+) ms/,
      '`deeper` on the frames delivered')
    expect(split, 'the frames delivered with the split on').toBe(delivered(SPLIT))
    expect(whole, 'and with it off').toBe(delivered(WHOLE))
    expect(ns, 'over the round it names').toBe(GATE_NS / MS)
    // The third television, printed once in `deeper` and once in `tryThis`.
    const feats = { edca: true, ampdu: true, txop: true, ofdma: true }
    const base = ruDiversityScenario(true)
    const tv3 = node('sta-3', 'TV 3', 'sta', 13.5, 7, 'eht', 'video', feats)
    tv3.caps.widthMhz = 20
    tv3.caps.nss = 1
    const three = ofType(runScene('three', { ...base, nodes: [...base.nodes, tv3] }), 'TX_START')
      .filter((r) => r.frame.kind === 'data' && r.frame.src === 'ap')
    for (const [ms, sends] of every(ALL, /(\d+) ms 里 (\d+) 次下行发送/g, 'the third television’s round', 2)) {
      expect(val(ms!), 'the round the third television is measured over').toBe(GATE_NS / MS)
      expect(val(sends!), 'the downlink sends it makes').toBe(three.length)
    }
    expect(three.filter((r) => r.frame.muParts !== undefined).length, 'and not one of them grouped').toBe(0)
    // The two legs' bin counts, as `tryThis` names them.
    const [four, nine] = figs(TRY, /每次接收读 (\d+) 格还是读 (\d+) 格/, '`tryThis` on the two legs')
    expect(four, 'the member leg’s bins').toBe(selMemberBins(20, 1 / 2))
    expect(nine, 'the whole-channel leg’s').toBe(selBins(20))
    // The margin agreement `tryThis` counts, read off the whole-channel leg.
    const { key } = legs()
    const off = dlRows(runOf(lesson, WHOLE, GATE_NS))
    const [all, agree, differ] = figs(TRY, /(\d+) 条里有 (\d+) 条是，剩下 (\d+) 条不是/,
      '`tryThis` on the margins that agree')
    expect(all, 'the whole-channel leg’s round').toBe(off.length)
    expect(agree, 'the receptions at the same margin').toBe(off.filter((r) => r.margin === key).length)
    expect(differ, 'and the ones that are not').toBe(off.length - off.filter((r) => r.margin === key).length)
    // The drop rates `tryThis` quotes, which are the gate table's two cells read a second time.
    const [lo, hi] = raw(TRY, /比例从 ([\d.]+) % 涨到 ([\d.]+) %/, '`tryThis` on the two drop rates')
    same(lo!, 100 * dropRate(legs().whole), 'the nine-bin drop rate')
    same(hi!, 100 * dropRate(legs().half), 'the four-bin one')
  })

  it('reads the payload asymmetry and the percentage points it flatters', () => {
    const big = (v: number | undefined) => ofType(runOf(lesson, v, GATE_NS), 'TX_START')
      .filter((r) => r.frame.kind === 'data' && r.frame.src === 'ap' && r.frame.bytes > 2000)
    const [whole, split] = figs(LIM, /(\d+) 字节，而成员那一腿每个成员只扛 (\d+) 字节/,
      '`limits` on the two payloads')
    expect(new Set(big(WHOLE).map((r) => r.frame.bytes)), 'the whole-channel leg’s payload').toEqual(new Set([whole]))
    expect(new Set(big(SPLIT).flatMap((r) => r.frame.muParts!.map((p) => p.bytes))), 'each member’s')
      .toEqual(new Set([split]))
    expect(whole, 'and the one really is twice the other, which is the entry’s point')
      .toBe(2 * split! + 2)
    const [aWhole, aSplit] = raw(LIM, /（([\d.]+) 对 ([\d.]+) ms）/, '`limits` on the two airtimes')
    same(aWhole!, [...new Set(big(WHOLE).map((r) => r.frame.txTimeNs))][0]! / MS, 'the whole-channel airtime')
    same(aSplit!, [...new Set(big(SPLIT).map((r) => r.frame.txTimeNs))][0]! / MS, 'the split airtime')
    // The gap in percentage points, computed from the two drop rates the table prints.
    same(raw(LIM, /表里那 (\d+) 个百分点/, '`limits` on the gap')[0]!,
      100 * (dropRate(legs().half) - dropRate(legs().whole)), 'the gap in points, as the prose rounds it')
    // And the one-over-n share, whose numerator is the figure printed.
    const members = selRows(runOf(lesson, SPLIT, GATE_NS)).filter((x) => x.sel.ruFraction !== undefined)
    const frac = [...new Set(members.map((x) => x.sel.ruFraction!))]
    expect(frac.length, 'one share, on this scene').toBe(1)
    same(raw(LIM, /frac = (\d+) \/ 成员数/, '`limits` on the share’s numerator')[0]!,
      frac[0]! * 2, 'the numerator of a two-member share')
  })

  it('reads the uplink entry’s five figures, four of them off a published scene', () => {
    const base = LESSONS.find((l) => l.id === 'ofdma-ul')!.scenario()
    const rs = runScene('ofdma-ul|sel', { ...base, fading: RAYLEIGH, selectivity: {} })
    const up = selRows(rs).filter((x) => x.sel.from !== 'ap' && x.sel.ruFraction !== undefined)
    const [dB, n] = raw(LIM, /上行成员的余量是 ([\d.]+) dB，(\d+) 条接收一条也没掉/,
      '`limits` on the uplink margin')
    expect(new Set(up.map((x) => (x.sel.meanSinrDb - x.sel.threshDb).toFixed(3))), 'one margin, to three decimals')
      .toEqual(new Set([val(dB!).toFixed(3)]))
    expect(val(n!), 'the uplink receptions').toBe(up.length)
    expect(up.filter((x) => !selRowDecoded(rs, x)).length, 'and not one of them failed').toBe(0)
    same(raw(LIM, /selectivity 两节，(\d+) ms/, '`limits` on the uplink round')[0]!, GATE_NS / MS,
      'the round the uplink figure is measured over')
    // The two transmit powers, and the asymmetry the entry computes from them.
    const sc = lesson.scenario()
    const [apDbm, staDbm] = figs(LIM, /接入点发 (\d+) dBm、站点发 (\d+) dBm/, '`limits` on the two powers')
    expect(apDbm, 'the access point’s transmit power').toBe(sc.nodes.find((x) => x.id === 'ap')!.txPowerDbm)
    expect(staDbm, 'the station’s').toBe(sc.nodes.find((x) => x.id === 'sta-1')!.txPowerDbm)
    const links = buildLinkTable(sc.nodes, sc.walls)
    same(raw(LIM, /比它高 (\d+) dB 的那条路/, '`limits` on the asymmetry')[0]!,
      links.get('ap')!.get('sta-1')! - links.get('sta-1')!.get('ap')!, 'the asymmetry, from the two powers')
    expect(apDbm! - staDbm!, 'which is the difference of the two figures beside it')
      .toBe(val(raw(LIM, /比它高 (\d+) dB 的那条路/, 'x')[0]!))
  })

  it('reads the loss the observe line promises, and the two citations that carry a figure', () => {
    // 「loss 多半在 2 dB 上下」: the median of the leg a reader loads first, to the decibel.
    same(raw(OBS, /loss 多半在 (\d+) dB 上下/, '`observe` on the loss')[0]!,
      q(legs().half.map((r) => r.lossDb), 0.5), 'the member leg’s median loss, to the decibel')
    expect(legs().half.some((r) => r.lossDb <= 0), 'and 「偶尔是负的」 happens').toBe(true)
    /*
     * **Table 27-8's NOTE 2 is read against the engine's own citation of it.** The note number
     * is a figure with no corpus here, but it is printed twice in this repository — the lesson's
     * `numbers` and `selectivity.ts`'s docblock — and the two have to agree, which is what a
     * reader following the lesson into the engine depends on.
     */
    const [lessonNote] = figs(ALL, /NOTE (\d+)/, 'the lesson on Table 27-8’s note')
    const [engineNote] = figs(SEL, /NOTE (\d+) calls/, 'the engine on the same note')
    expect(lessonNote, 'the note the lesson cites is the one the engine cites').toBe(engineNote)
    expect(occ(ALL, `NOTE ${lessonNote}`), 'and it is cited once').toBe(1)
    /*
     * **The slice number in `limits` is read against the slice ledger.** 「4a 记过一次这样的不
     * 对称」 points at a row of `docs/uwb-modellable-backlog.md`, and that row has to be the
     * frequency-selectivity slice for the sentence to mean anything.
     */
    const [slice] = raw(LIM, /(\d[a-z]) 记过一次/, '`limits` on the slice that recorded the asymmetry')
    const ledger = readFileSync(new URL('../../docs/uwb-modellable-backlog.md', import.meta.url), 'utf8')
    const row = ledger.split('\n').find((l) => l.startsWith(`| ${slice} |`))
    expect(row, `the ledger has no row for slice ${slice}`).toBeDefined()
    expect(row, `slice ${slice} is the frequency-selectivity slice`).toContain('频率选择性')
  })
})
