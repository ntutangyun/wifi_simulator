/**
 * The `selectivity` lesson against its own scene.
 *
 * Division of labour with the three engine files, because this lesson quotes figures from all
 * of them and the point of the split is that a reader can tell which instrument each came off:
 *
 *  - **tests/engine/selectivity.test.ts** — the 12.05 / 24.09 dB deepest-bin means and the
 *    2.30 / 2.36 dB median losses, over 40 000 draws. The 9-bin median loss is re-measured
 *    here at a smaller N (the lesson prints it, so it gets a pin in the lesson's own file);
 *    the two deepest-bin means are not, because 40 000 trials is that file's own runtime.
 *  - **tests/engine/selectivity-inert.test.ts** — the five pooled drop rates
 *    (14.66 … 0.75 %) and the 3.62 dB margin they share, over 45 runs at nine power offsets.
 *    Not re-measured here; this file checks that the lesson prints them as *rates*, says the
 *    margin was held comparable, and keeps that group's sentence apart from its own scene's.
 *  - **this file** — everything the lesson says about *its own five variants*: the bin counts,
 *    the deepest bin a single round shows, the loss that barely moves, the margin the rate loop
 *    settles each width at, all five of its own drop rates, the ACK half that gets no bins at
 *    all, and the rate-ladder claim its first `tryThis` makes.
 *
 * **Why the scene needs its own pins at all.** The lesson's scene is the round sweep, not the
 * pooled group: here 20 MHz settles a whole rate step higher (6.62 dB against 3.62) and is
 * therefore *not* the width that drops the most — while in the pooled group at equal margin it
 * is. Both statements are true of their own data set and the slice's review found a draft that
 * mixed them inside one sentence (finding 1, HIGH). So the lesson states each with its
 * instrument named, and both halves are asserted below: the quoted 14.66 % stays attached to
 * 「这一组」, and the scene's own margins and rates are measured rather than assumed.
 *
 * **Every figure here moved once, on `9604fbc`**, which stopped handing bins to non-HT PPDUs:
 * the 26-tone RU is defined at the HE/EHT subcarrier spacing and clause 17's is four times
 * wider, so the 167–638 ACKs of each round were being split by the wrong ruler. Taking them
 * out moved the pooled column from 14.39 / 12.71 / 9.48 / 5.09 / 0.52 % and the end-to-end
 * multiple from 27.7 to 19.5. The ACK half had no assertion of its own before that fix, which
 * is why the engine could change under the lesson without a test going red; it has one now.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LESSONS } from '../../src/course/lessons'
import { COURSE_ORDER } from '../../src/course/curriculum'
import { lessonStrings, readerTexts } from '../../src/course/readability'
import {
  DF_EHT_KHZ, RU26_PER_20MHZ, RU26_TONES,
  selBinWidthMhz, selBins, selMemberBins, selEffSinrDb,
} from '../../src/engine/selectivity'
import { smallScaleDb, type FadingCfg } from '../../src/engine/fading'
import { noiseDbm } from '../../src/engine/phy'
import { Simulation } from '../../src/engine/simulation'
import type { Block } from '../../src/course/lessonKit'
import type { Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** The fixture's own run length, so what a reader sees first is what is measured here. */
const RUN_NS = 150 * MS
const WIDTHS = [20, 40, 80, 160, 320] as const

const lesson = LESSONS.find((l) => l.id === 'selectivity')!
const variant = (i: number): Scenario => lesson.variants![i].scenario()

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
  /** `WIFI_SEL` records for anything the AP sent back — the ACK half. */
  downSels: number
  acks: number
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
  const rs = runOf(lesson, i, RUN_NS)
  const sels = ofType(rs, 'WIFI_SEL')
  const up = sels.filter((s) => s.from === 'sta-1')
  expect(up.length, `${WIDTHS[i]} MHz: no uplink reception to read`).toBeGreaterThan(50)
  const fails = ofType(rs, 'RX_FAIL').filter((r) => r.reason === 'lowSinr').length
  const ppdus = ofType(rs, 'TX_START')
    .filter((r) => r.frame.kind === 'data' && r.frame.src === 'sta-1').length
  return {
    w: WIDTHS[i],
    bins: up[0].bins,
    marginDb: median(up.map((s) => s.meanSinrDb - s.threshDb)),
    medWorstDb: median(up.map((s) => s.worstBinDb)),
    medLossDb: median(up.map((s) => s.lossDb)),
    fails, ppdus, dropRate: fails / ppdus,
    downSels: sels.length - up.length,
    acks: ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'ack').length,
    mcs: mcsUsed(rs),
  }
}

/**
 * Every string a reader sees. `readerTexts` is the one walk since 2026-10-05, so this now
 * also reaches the variant labels and the jump labels, which the hand-rolled list did not.
 * The ten `not.toContain` needles below were checked against the eight labels that widening
 * adds (`20 MHz` … `第一次没解出来的接收`): not one of them occurs there.
 */
const text = readerTexts(lesson).join('\n')
/** The main path only: what the figures are printed in. */
const mainText = lessonStrings(lesson).join('\n')

lessonShapeSuite(lesson, { runNs: RUN_NS })

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
    // a `fading` section, a distribution that is not `none`, and an he/eht link. The schema
    // itself is run over every lesson scenario by tests/course/lessons.test.ts.
    for (const sc of [lesson.scenario(), ...WIDTHS.map((_w, i) => variant(i))]) {
      expect(sc.selectivity).toEqual({})
      expect(sc.fading?.smallScale).toBe('rayleigh')
      expect(sc.nodes.some((n) => n.caps.generation === 'eht')).toBe(true)
    }
    expect(lesson.variants!.map((v) => v.label)).toEqual(WIDTHS.map((w) => `${w} MHz`))
    // 320 MHz is in the list although `width` stops at 160: the lesson prints 24.09 dB and
    // 0.75 % at 144 bins, and a figure the scene cannot reach is a figure taken on trust.
    expect(lesson.variants!.map((v) => v.scenario().nodes[0].caps.widthMhz)).toEqual([...WIDTHS])
  })

  it('prints a bin table computed from the engine, not typed into the prose', () => {
    const tables = lesson.numbers!
      .filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
    const geometry = tables.find((b) => b.heading?.includes('格宽与格数'))!
    expect(geometry.rows.map((r) => r[0])).toEqual(WIDTHS.map(String))
    expect(geometry.rows.map((r) => r[1])).toEqual(WIDTHS.map((w) => String(selBins(w))))
    for (const r of geometry.rows) expect(r[2]).toBe(selBinWidthMhz().toString())
    // …and so is the bin column of the drop-rate table, and the two ends of the heads above it
    const rates = tables.find((b) => b.heading?.includes('掉帧率'))!
    expect(rates.rows.map((r) => r[0])).toEqual(WIDTHS.map(String))
    expect(rates.rows.map((r) => r[1])).toEqual(WIDTHS.map((w) => String(selBins(w))))
    const ends = tables.find((b) => b.heading?.includes('两端的两个量'))!
    expect(ends.head).toEqual(['量', `20 MHz（${selBins(20)} 格）`, `320 MHz（${selBins(320)} 格）`])
    // And the width is the standard's arithmetic rather than a decorated literal.
    expect(selBinWidthMhz()).toBeCloseTo(2.03125, 5)
    expect(mainText).toContain('2.03125')
  })

  /**
   * The three bin counts the PROSE spells out in Chinese words rather than printing: 「每 20 MHz
   * 就是九块」, 「从九格到一百四十四格」. A numeral in words cannot be built from a constant, so
   * what is pinned instead is the constant those words are the spelling of — if the standard's
   * own figure ever moved, this is the test that says the prose has to be re-read.
   */
  it('pins the constant the prose spells out in words', () => {
    expect(RU26_PER_20MHZ).toBe(9)
    expect(selBins(20)).toBe(9)
    expect(selBins(320)).toBe(144)
  })

  /**
   * **The one main-path paragraph about a multi-user member, re-written when slice 4b gave a
   * member its own bins.** Before 4b it said the simulator keys the bin count off the whole
   * frame's width, so a member holding a third of the channel was credited with three times the
   * bins it should have, and it owed the fix to a later step. All three of those clauses are now
   * false and are pinned as absent — over `text`, which includes `limits`, because the lesson
   * said it twice: once here and once in the last sentence of `out-of-scope`.
   *
   * **Instrument for the two figures it prints:** `selBins(20)` and `selMemberBins(20, 1/2)`,
   * the engine's own functions, interpolated into the prose and asserted here against the same
   * calls — arithmetic, not a measurement, so there is no run length to quote. That the engine
   * really serves a member those bins is measured in the two OFDMA lessons' files, on their own
   * scenes; all five variants of this lesson are single-user.
   */
  it('says a member reads its own share’s bins, with both figures off the engine', () => {
    expect(selMemberBins(20, 1 / 2)).toBe(4)
    expect(mainText).toContain(`20 MHz 上两个成员各读 ${selBins(20)} 格里的 ${selMemberBins(20, 1 / 2)} 格`)
    expect(mainText).toContain('格数乘以份额、截到整数格')
    expect(mainText).toContain('与标准那张音调表吻合')
    expect(mainText).toContain('位置不起作用：各格彼此独立')
    // 4a's claims, retired in both places the lesson made them
    expect(text).not.toContain('三倍于应得')
    expect(text).not.toContain('按整帧的带宽给格数')
    expect(text).not.toContain('整帧带宽的格数')
    expect(text).not.toContain('高估')
  })
})

describe('selectivity · the figures the lesson reads off its own five rounds', () => {
  /**
   * One sweep for the file; `runOf` memoises each 150 ms round across every suite here.
   *
   * Measured 2026-10-03 after `9604fbc`. Margins 6.62 / 3.62 / 3.62 / 3.62 / 3.62 dB; deepest
   * bin's median −10.2926 / −13.7475 / −16.9552 / −19.9136 / −23.3380 dB; median loss 2.0291 /
   * 2.2717 / 2.3465 / 2.3475 / 2.3566 dB; drop rates 5.61 / 9.17 / 7.77 / 4.15 / 0.92 %
   * (12/214, 31/338, 37/476, 24/578, 6/651). Every one of those is an assertion below rather
   * than only a line of this comment: the four rates used to be an ordering and nothing else,
   * so the figures in a doc comment like this one could drift away from the engine in silence.
   */
  let rows: Row[] = []
  const sweep = (): Row[] => {
    if (rows.length === 0) rows = WIDTHS.map((_w, i) => rowOf(i))
    return rows
  }

  it('splits every width into the standard\'s own number of bins', () => {
    expect(sweep().map((r) => r.bins)).toEqual(WIDTHS.map(selBins))
  })

  /**
   * **The ACK half, which had no assertion until `9604fbc` needed one.** A non-HT PPDU gets no
   * bins at all now, and the only thing coming back the other way in this scene is the AP's
   * ACKs — so the number of `WIFI_SEL` records for anything the AP sent is zero, against
   * hundreds of ACKs actually on the air. Both halves are asserted: without the ACK count this
   * would pass on a run where the AP never answered at all.
   */
  it('gives the non-HT ACKs no bins, which is what the steps block now says', () => {
    for (const r of sweep()) {
      expect(r.acks, `${r.w} MHz: no ACKs to speak of`).toBeGreaterThan(100)
      expect(r.downSels, `${r.w} MHz: an ACK was binned`).toBe(0)
    }
    expect(mainText).toContain('回程的确认帧是传统帧，它整帧只有一个电平，一格也不分')
    // and the reader is told in the watch call-out, before the steps, why only one side logs it
    expect(mainText).toContain('回程那些确认帧（acknowledgement, ACK）不分格')
    expect(mainText).toContain('只有 Wi-Fi 6 与 Wi-Fi 7 的 PPDU（PHY protocol data unit）分格')
    // and the old, now false, sentence is gone
    expect(text).not.toContain('所以它永远只有九格')
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

  it('shows the 10.29 dB the lesson warns a round will show, against the table\'s 12.05 dB', () => {
    // The gap the lesson spends a paragraph on: the table is a mean over 40 000 draws
    // (tests/engine/selectivity.test.ts), one 150 ms round of this scene is ~1.8 dB shallower,
    // and a reader must find that explained rather than discover it in the event log.
    //
    // **10.29, not 10.21.** The engine sweep in tests/engine/selectivity-round.test.ts runs
    // 200 ms of the same scene and reads −10.2098; more draws, a deeper deepest bin. The lesson
    // quotes the figure its own reader will see, so it quotes this file's.
    expect(sweep()[0].medWorstDb).toBeCloseTo(-10.2926, 2)
    expect(mainText).toContain('10.29 dB')
    expect(mainText).toContain('12.05 dB')
    expect(mainText).toContain('四万次抽样下的均值')
    // and the figure the engine's own 200 ms sweep reads must not appear as if it were this one
    expect(mainText).not.toContain('10.21')
    expect(mainText).not.toContain('10.08')
  })

  it('holds the loss near 2 dB across the whole span, which is the second observe line', () => {
    const rs = sweep()
    expect(rs[0].medLossDb).toBeCloseTo(2.03, 2)
    expect(rs[4].medLossDb).toBeCloseTo(2.36, 2)
    // The pair is the argument: the deepest bin falls 13 dB while the loss rises a third of one.
    expect(Math.max(...rs.map((r) => r.medLossDb)) - Math.min(...rs.map((r) => r.medLossDb)))
      .toBeLessThan(1)
    expect(mainText).toContain('2.03 dB')
    expect(mainText).toContain('2.36 dB')
  })

  /**
   * **The wrinkle 2.36 makes, and the sentence that resolves it.**
   *
   * 2.36 dB is the 320 MHz figure of BOTH instruments: the 40 000-draw block's and this
   * lesson's own 150 ms round's. So a reader meets 2.3 against 2.03 at 20 MHz and one single
   * 2.36 at 320 MHz, with nothing to say that the table column and the observe line are two
   * different rulers — the 320 MHz agreement is a coincidence and reads like identity. The
   * table's heading now names its ruler and the paragraph under it gives this round's pair, so
   * the coincidence is stated as one; both halves are asserted here, and so is the 0.27 dB the
   * two rulers differ by at the narrow end.
   */
  it('says which ruler the two-ended table came off, and that 2.36 twice is a coincidence', () => {
    const ends = lesson.numbers!
      .filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
      .find((b) => b.heading?.includes('两端的两个量'))!
    expect(ends.heading).toContain('四万次抽样')
    expect(mainText).toContain('最窄一档 2.03 dB，最宽一档 2.36 dB')
    expect(mainText).toContain('宽的那一头两把尺碰巧给出同一个数')
    // the gap the sentence names, measured: this round's 20 MHz median against the block's 2.30
    const rs = sweep()
    expect(2.3 - rs[0].medLossDb).toBeCloseTo(0.27, 2)
    // …and at the wide end the two rulers really do land on the same two decimals
    expect(rs[4].medLossDb.toFixed(2)).toBe('2.36')
  })

  /**
   * The 9-bin median loss the two-ended table prints beside 2.36 dB. It is the 40 000-draw
   * instrument's figure, not this scene's, so it is measured the way that file measures it —
   * at 4000 trials rather than 40 000, which is enough for a median and keeps this file's
   * runtime in the same order as its five rounds. tests/engine/selectivity.test.ts holds the
   * converged version (`narrow.medianLoss` ≈ 2.30, asserted to ±0.05).
   */
  it('prints the 9-bin median loss, measured on the instrument the table names', () => {
    const RAYLEIGH: FadingCfg = { shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'rayleigh' }
    const MEAN_SINR_DB = 20
    const losses: number[] = []
    for (let i = 0; i < 4000; i++) {
      const devs: number[] = []
      for (let bin = 0; bin < selBins(20); bin++) {
        devs.push(smallScaleDb(RAYLEIGH, 7, 'ap', 'sta', `f${i}`, bin))
      }
      losses.push(MEAN_SINR_DB - selEffSinrDb(MEAN_SINR_DB, devs))
    }
    expect(median(losses)).toBeCloseTo(2.3, 1)
    expect(mainText).toContain('2.3 dB')
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
    // Non-vacuous at both ends: frames are actually lost at 40 MHz and some still at 320.
    expect(matched[0].dropRate).toBeGreaterThan(0.05)
    expect(matched[matched.length - 1].dropRate).toBeGreaterThan(0)
  })

  /**
   * **余量 carries a premise in this lesson's `why`, and the course spells it three ways.**
   *
   * A reader of the course asked, on this lesson, what 余量 meant here. It is load-bearing —
   * 「在余量可比的前提下」 is the condition the whole result hangs on, and the `outcomes` line
   * repeats it — and it was not glossed anywhere a reader of THIS lesson could reach:
   * `ZH_TERMS_EXCLUDED` (src/course/readability.ts) carries 余量 with the reason 「three
   * different simulator quantities under one word」, so the first-use bracket rule is switched
   * off for it by design, and nothing replaced that rule with a gloss. The only gloss the
   * `needs` closure offered was `decode-thresholds`' 速率余量 — a DIFFERENT quantity (the
   * transmitter's fixed 3 dB, chosen before the frame exists) with a DIFFERENT number from this
   * lesson's 3.62 dB. 「闭包里有」 was true by concept and false by word form and by value.
   *
   * So the lesson glosses it itself, and this pins the gloss rather than its presence:
   *  - it must separate the two quantities by NAME (速率余量) and by NUMBER (3 dB), because
   *    naming one of the two without the other is how the reader lands back on 3 dB;
   *  - the figure inside the gloss, the figure in the table's own heading and the margin
   *    `sweep()` measures are compared here. They were two typed strings; a third typed copy
   *    with nothing comparing them is this repository's standing defect, so the test reads all
   *    three. `sweep()` is memoised above, so this costs no engine events.
   */
  it('glosses 余量 itself, with the other quantity named, and the figure read from the run', () => {
    const row = lesson.terms!.find((t) => t.plain.startsWith('余量：'))
    expect(row, '「余量」 carries a premise in `why`; this lesson owes the gloss').toBeDefined()
    // the other quantity, by name and by value — the one the closure would otherwise supply
    expect(row!.plain).toContain('速率余量')
    expect(row!.plain).toContain('3 dB')
    const dbs = (s: string): number[] => [...s.matchAll(/(\d+\.\d+) dB/g)].map((m) => Number(m[1]))
    const table = lesson.numbers!.find(
      (b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table' && !!b.heading?.includes('掉帧率'),
    )
    expect(table, 'the pooled drop-rate table').toBeDefined()
    /*
     * **The gloss names TWO margins, and that is the 2026-10-13 correction.** It used to say
     * 「本课五档各 3.62 dB」, which this lesson's own five rounds contradict: the four wider ones
     * settle at the pooled figure and the narrowest sits a whole rung higher, at 6.62 dB — which
     * the lesson says itself two screens later and the quiz's own explanation rests on. So the
     * gloss now names the table's margin as the table's, and the narrow round's beside it.
     */
    expect(dbs(row!.plain), 'the table’s margin first, then this lesson’s narrowest round’s')
      .toEqual([dbs(table!.heading!)[0], Number(sweep()[0].marginDb.toFixed(2))])
    expect(dbs(row!.plain)[0], 'and the first of them is what the four wider rounds measure')
      .toBeCloseTo(sweep()[1].marginDb, 1)
  })

  /**
   * All five of this scene's own rates and counts, exactly — they are integers over integers in
   * a deterministic run, so there is nothing to round. This is what the doc comment above used
   * to be and an ordering cannot replace: the engine change that moved them (`9604fbc`) moved
   * every one of these by a per cent or more, and an ordering survived it unchanged.
   */
  it('measures its own five drop rates to the hundredth of a per cent', () => {
    expect(sweep().map((r) => `${r.fails}/${r.ppdus}`))
      .toEqual(['12/214', '31/338', '37/476', '24/578', '6/651'])
    expect(sweep().map((r) => (r.dropRate * 100).toFixed(2)))
      .toEqual(['5.61', '9.17', '7.77', '4.15', '0.92'])
  })

  /**
   * The first `tryThis`'s warning, measured: unticking the box does not merely remove a loss.
   * A flat draw fades the whole PPDU at once, so a deep one kills it outright and the rate loop
   * answers by stepping down — in the flat run every width visits the ladder's lowest rung, in
   * the per-bin run none of them does. So the two runs cannot be compared by drop count, which
   * is what the lesson tells the reader before they try it.
   */
  it('sends every width to the lowest rung with the section off, and none with it on', () => {
    for (let i = 0; i < WIDTHS.length; i++) {
      const on = sweep()[i].mcs
      const flat = mcsUsed([...new Simulation(flatOf(variant(i))).runUntil(RUN_NS).records])
      expect(flat, `${WIDTHS[i]} MHz flat`).toContain(0)
      expect(on[0], `${WIDTHS[i]} MHz per-bin`).toBeGreaterThan(0)
    }
  })
})

describe('selectivity · the three sentences this slice may not write', () => {
  it('prints drop RATES, at a margin it says is comparable, from the group that has five widths', () => {
    for (const r of ['14.66 %', '13.10 %', '9.81 %', '5.61 %', '0.75 %']) expect(mainText).toContain(r)
    expect(mainText).toContain('3.62 dB')
    expect(mainText).toContain('掉帧率而不是掉帧数')
    // the mechanism, in the words the `width` entry used to carry: a count conflates airtime
    // with decoding, and the sentence has to say so rather than merely name airtime
    expect(mainText).toContain('按个数比会把空口时间（airtime）混进来')
    // 「余量可比」 itself, in the `why` as well as beside the table: the direction is false
    // without it, and this lesson's own scene is the counter-example
    expect(mainText).toContain('余量可比')
    expect(lesson.why).toContain('余量可比')
  })

  it('never prints a count from the other data set', () => {
    // 14/44/47/23/4 failures and 252/871 PPDUs are the four-width round sweep's; the rates above
    // are the pooled five-width group's. One sentence, one data set (review finding 4d). The
    // 「并不单调」 phrasing travelled with them and must not reappear either.
    for (const n of ['14、44', '44、47', '871', '252', '并不单调']) expect(text).not.toContain(n)
  })

  /**
   * **The open-loop pair, over the FILE and not only over the lesson object** (review of
   * 2026-10-03, HIGH). The hard constraint is zero hits in `src/`, and the earlier version of
   * this guard read `lessonStrings`, which cannot see a comment — so it reported success while
   * `selectivity.ts`'s own header comment quoted both figures. Reading the source text is the
   * same technique tests/ui/uwb-guide.test.ts uses on a `.tsx`.
   */
  it('never prints the open-loop figures, comment included, in either lesson file', () => {
    const files = ['selectivity.ts', 'width.ts']
      .map((f) => [f, readFileSync(new URL(`../../src/course/tier2/${f}`, import.meta.url), 'utf8')] as const)
    for (const [name, src] of files) {
      for (const n of ['34.43', '7.14']) {
        expect(src.includes(n), `${name} still quotes ${n}`).toBe(false)
      }
    }
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

  it('does not say frequency selectivity costs a strong link extra frames', () => {
    // On a margin-rich link the per-bin path REPLACES the flat draw rather than stacking on it,
    // and it removes that draw's consequence (tests/engine/selectivity-inert.test.ts). The
    // lesson states the replacement and never the opposite.
    expect(mainText).toContain('替换那一次平坦抽样')
    expect(text).not.toContain('多掉帧')
  })

  /**
   * The guard that moved here with the figure (it was tests/course/width.test.ts's until the
   * `width` entry was shortened): 12.04 dB is what 20 → 320 MHz ADDS to the floor, and the floor
   * itself is in dBm — "a 12.04 dB noise floor" would contradict `width`'s own table. Computed
   * from the engine rather than typed, so the sentence cannot drift away from `noiseDbm`.
   *
   * `deeper` prints the same 12.04 for a different reason — 24.09 − 12.05, the gap between the
   * two deepest-bin means — and says there, in so many words, that the two have nothing to do
   * with each other. That collision is the exact misreading this pin exists for, so the
   * disclaimer is asserted rather than trusted.
   */
  it('names the 12.04 dB as the RAISE in the floor, and defuses the other 12.04', () => {
    expect(mainText).toContain(`从 20 到 320 MHz 抬高了 ${(noiseDbm(320) - noiseDbm(20)).toFixed(2)} dB`)
    expect(text).not.toContain('12.04 dB 的噪声地板')
    const deeper = lessonStrings({ deeper: lesson.deeper }).join('\n')
    expect(deeper).toContain('数值相同、物理上毫无关系')
  })
})

/**
 * **The CQI clause numbers, each with the document it is in** (Task 6 of slice 4b).
 *
 * `sources` used to say 「出自 IEEE Std 802.11 的信道质量指示字段（§9.4.1.65 与 §9.4.1.75）」,
 * putting both clause numbers under one document. Measured over the corpus: `9.4.1.65` occurs
 * 6 times in IEEE Std 802.11-2024 and 0 times in 802.11be-2024; `9.4.1.75` occurs 0 times in
 * the base standard and 6 in 802.11be-2024, where it is the **EHT CQI Report field**. The base
 * standard's 9.4.1 runs to §9.4.1.71, so §9.4.1.75 is not one of its subclauses at all — the
 * same correction `engine/selectivity.ts`'s header records for the constants keyed to it. The
 * two clause numbers must not be moved together: §9.4.1.65 (HE CQI Report field) really is the
 * base standard's.
 */
describe('selectivity · the two CQI clauses live in two documents', () => {
  const src = lesson.sources!.join(' | ')

  it('attributes each clause to its own document and says the base standard lacks the other', () => {
    expect(src).toContain('IEEE Std 802.11-2024 的 §9.4.1.65')
    expect(src).toContain('IEEE Std 802.11be-2024 的 §9.4.1.75')
    expect(src).toContain('§9.4.1.71')
    // The pairing that was the error.
    expect(src).not.toContain('§9.4.1.65 与 §9.4.1.75')
    expect(src).not.toContain('IEEE Std 802.11 的信道质量指示字段')
  })

  it('credits the nine-per-20-MHz count to the clause that states it', () => {
    // `RU26_PER_20MHZ`'s own comment reads it off 802.11be §9.4.1.75 (Ncqi = 9 x bits set).
    expect(selBins(20)).toBe(9)
    expect(src).toContain('每 20 MHz 九块是后面那一条给的')
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

  it('threshold: capacity is an upper bound, so every loss here is a lower bound — and β by name', () => {
    expect(byKind.get('threshold')).toContain('下界')
    expect(byKind.get('threshold')).toContain('容量')
    // The number this slice declined to invent, named rather than alluded to.
    expect(byKind.get('threshold')).toContain('EESM')
    expect(byKind.get('threshold')).toContain('β')
  })

  /**
   * **It stays `out-of-scope` after slice 4b** (Task 6's judgement call, design §7.4 left the
   * `kind` open). Its subject is still three scenario classes this model is not valid for — the
   * four steps that read the flat draw, a `vht` or legacy link in a mixed scene, and an uneven
   * resource-unit allocation — and only the last sentence changed in 6a, from a claim about
   * over-counted diversity to "a member reads its own truncated share; what is still out of
   * scope is the uneven split". That last clause is a scenario the model should not be asked
   * about, not a chosen constant, so `model-value` would be wrong; and this lesson keeps one
   * entry of each of the four kinds, so flipping it would collapse `byKind` below.
   *
   * `out-of-scope` carries the two things a reader of a MIXED scene is never told anywhere else.
   * The editor deliberately shows no hint for either (a prompt that is not a schema refusal is
   * where a second wording comes from), so the lesson is the only place it is said: a `vht` or
   * legacy link in the same scene is not binned, and a multi-user member is handed the whole
   * channel's bins.
   */
  /**
   * **Rate selection is not the fourth reader of the flat draw, and this lesson said it twice.**
   * `picture`'s 「只有解调这一步读合成值」 and this entry both enumerated 「载波侦听、前导检测、
   * 捕获效应与选级读的仍然是那一次平坦抽样」, and `picture` went on to call them 「那四步」.
   * The first three go through `Channel.linkDbm` — the table level plus both fading layers — and
   * rate selection does not: `buildLinkTable` runs once per link while `Simulation` builds it
   * and is never written again, so `mcsForPeer` reads a static level with neither the per-frame
   * fade nor the slow shadow in it. `src/course/tier2/ru-diversity.ts` and
   * `src/course/tier1/mcs-ladder.ts` already said exactly that, so a reader going through
   * `COURSE_ORDER` met the two readings one lesson apart.
   */
  it('splits rate selection out of the flat-draw list, in both places it is enumerated', () => {
    for (const where of [mainText, byKind.get('out-of-scope')!]) {
      for (const claim of [
        '捕获效应与选级读的仍然是那一次平坦抽样',
        '以及发送端选哪一级速率，读的仍然是整条信道那一次平坦抽样',
        '以及发送端选哪一级速率，读的全都还是整条信道那一次平坦抽样',
        '那四步读平坦抽样',
      ]) {
        expect(where, `the lesson still counts rate selection as a flat-draw reader: ${claim}`)
          .not.toContain(claim)
      }
      // Not just removed — replaced by what it does read, in the words `ru-diversity` uses.
      expect(where, 'the lesson drops 选级 without saying what it reads instead')
        .toContain('mcsForPeer')
      expect(where, 'the lesson does not say the rate ceiling is a static link-table level')
        .toContain('静态的均值电平')
      expect(where, 'the lesson does not say the shadow is absent from that level too')
        .toContain('连慢的那层阴影都不含')
    }
    // `picture` counted the readers; after the split there are three of them.
    expect(mainText).toContain('前三步读平坦抽样之后的电平')
  })

  it('out-of-scope: the other four decisions, the vht links, and the split this engine cannot build', () => {
    const t = byKind.get('out-of-scope')!
    for (const s of ['resolveLock', '载波侦听', '前导检测', '捕获效应', '资源单元']) expect(t).toContain(s)
    expect(t).toContain('vht')
    expect(t).toContain('312.5 kHz')
    expect(t).toContain('至少有一条')
    // The last sentence after slice 4b: a member DOES read its own truncated share, and what
    // remains out of scope is the uneven allocation this engine cannot build.
    expect(t).toContain('多用户成员读的是它自己那一份截到整数格之后的格数')
    expect(t).toContain('不等分的分配')
  })
})

/**
 * **Every figure the prose prints, read back out of it.**
 *
 * This file already measured most of what the lesson claims, and several of its assertions do
 * read the prose — but with `expect(mainText).toContain('10.29 dB')`, which is a figure typed
 * here beside a figure typed there. The sampling sweep of 2026-10-12 scored this lesson 6 of 6:
 * all six figures it planted went unnoticed, and the ones it happened to pick were in the
 * sections no assertion reaches at all — `terms`, `sources`, `limits`, `deeper`.
 *
 * **The reads worth naming:**
 *
 *  - **the bin width is computed from its own two factors.** 「每格宽度 = 26 根音调 × 78.125 kHz,
 *    也就是 2.03125 MHz」 has all three parsed out, and the product of the first two has to be
 *    the third and has to be what the engine answers.
 *  - **the two tone counts are read out of `phy.ts`**, because the sentence names that table:
 *    「234 正是本仿真器算 20 MHz 的……那个音调数（phy.ts 的 TONES_HE）」. A reader who goes there
 *    has to find the same number, and the 80 MHz pair (980 against 36 bins' 936) is the same
 *    read one width up.
 *  - **the pooled drop rates are read against the engine test that owns them.** `sources` says
 *    they come from `tests/engine/selectivity-inert.test.ts`, so the five printed cells are
 *    compared with the five that file asserts — the only honest instrument for a figure this
 *    lesson's own five rounds do not produce.
 *  - **the four-bit deviation field is read as arithmetic and as a measurement**: −8 to +7 is
 *    sixteen values, which is what four bits hold, and the 96.7 % / 15.33 % inside and outside
 *    that window are re-drawn from the engine's own sampler.
 *  - **the 312.5 kHz of `limits` is read against the spacing this lesson is about**: it is four
 *    times 78.125 kHz, which is why a 26-tone RU does not exist on it.
 *
 * **One correction came out of writing this**, and it is in the commit beside this one: the
 * `margin` gloss said 「本课五档各 3.62 dB」, and this lesson's own five rounds measure
 * 6.62 / 3.62 / 3.62 / 3.62 / 3.62 — the narrowest sits a whole rung higher, which the lesson
 * says itself two screens later (「它五轮的余量并不齐」) and which the test below measures.
 */
describe('selectivity · every figure the prose prints, read back out of it', () => {
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
  const TERMS = blockText(lesson.terms)
  const PIC = blockText(lesson.picture)
  const NUMS = blockText(lesson.numbers)
  const DEEP = blockText(lesson.deeper)
  const SRC = blockText(lesson.sources)
  const LIM = blockText(lesson.limits)
  const OBS = blockText(lesson.observe)
  const TRY = blockText(lesson.tryThis)
  const QUIZ = blockText(lesson.quiz)
  const ALL = [TERMS, PIC, NUMS, DEEP, SRC, LIM, OBS, TRY, QUIZ].join('\n')

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const every = (text: string, re: RegExp, what: string, want: number): string[][] => {
    const ms = [...text.matchAll(re)]
    expect(ms.length, `${what}: the lesson prints this ${ms.length} times, not ${want}`).toBe(want)
    return ms.map((mm) => mm.slice(1))
  }
  /** A figure READ off the lesson against a measurement, at the precision it was printed to. */
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const occ = (text: string, needle: string): number => text.split(needle).length - 1
  const PHY = readFileSync(new URL('../../src/engine/phy.ts', import.meta.url), 'utf8')
  const INERT = readFileSync(new URL('../engine/selectivity-inert.test.ts', import.meta.url), 'utf8')

  it('reads the tones of one bin, every printing of them', () => {
    // 「26 根相邻音调」 / 「26 音调资源单元就是 26 个连号的子载波」 / 「26 根音调 ×」 / …
    // Four shapes name the bin's own tone count, and one names an RU of any size.
    for (const [text, re, n] of [
      [ALL, /(\d+) 根相邻音调/g, 2],
      [ALL, /(\d+) 个连号的子载波/g, 1],
      [ALL, /(\d+) 根音调/g, 2],
      [ALL, /九块各 (\d+) 根/g, 1],
    ] as [string, RegExp, number][]) {
      for (const [tones] of every(text, re, 'the tones of one bin', n)) {
        same(tones!, RU26_TONES, 'the tones one bin is made of')
      }
    }
    /*
     * **「N 音调资源单元」 is printed at two sizes**, and both are read the same way: a tone
     * count folds onto the bins this engine splits a channel into. 26 is one bin; 106 is the
     * two-member share this lesson's last paragraph is about.
     */
    for (const [tones] of every(ALL, /(\d+) 音调资源单元/g, 'every N-tone RU', 5)) {
      const bins = Math.floor(val(tones!) / RU26_TONES)
      expect([1, selMemberBins(20, 1 / 2)], `「${tones} 音调资源单元」 covers`).toContain(bins)
      if (bins === 1) same(tones!, RU26_TONES, 'the smallest RU there is')
    }
  })

  it('reads the bin width out of its own two factors', () => {
    const [tones, khz, mhz] = figs(NUMS,
      /每格宽度 = (\d+) 根音调 × ([\d.]+) kHz，也就是 ([\d.]+) MHz/, '`numbers` on the bin width')
    expect(tones, 'the tones').toBe(RU26_TONES)
    expect(khz, 'the subcarrier spacing').toBe(DF_EHT_KHZ)
    same(String(mhz), (tones! * khz!) / 1000, 'the bin width, from the two factors beside it')
    same(String(mhz), selBinWidthMhz(), 'and the width the engine computes')
    // 「每 20 MHz 就是九块，所以九乘以带宽再除以 20 就是格数」
    const [per, div] = figs(NUMS, /每 (\d+) MHz 就是九块，所以九乘以带宽再除以 (\d+) 就是格数/,
      '`numbers` on the bin count')
    expect(per, 'the width the standard reports nine blocks for').toBe(div)
    expect(RU26_PER_20MHZ * 320 / per!, 'nine blocks of that width, scaled to the widest channel')
      .toBe(selBins(320))
    // The subcarrier spacing, printed a second time in the same paragraph and again in `sources`.
    for (const [khz2] of every(ALL, /([\d.]+) kHz (?:是 Wi-Fi 7 的子载波间隔|的子载波间隔出)/g,
      'the subcarrier spacing, named twice more', 2)) {
      expect(val(khz2!), 'the spacing this lesson’s bins are built on').toBe(DF_EHT_KHZ)
    }
  })

  it('reads the two tone counts out of the table `phy.ts` holds', () => {
    const TONES = (w: number): number => {
      const m = new RegExp(`TONES_HE[^=]*= \\{[^}]*\\b${w}: (\\d+)`).exec(PHY)
      expect(m, `phy.ts no longer holds a tone count for ${w} MHz`).not.toBeNull()
      return Number(m![1])
    }
    // 「九块各 26 根，一共 234 根子载波，而 234 正是……那个音调数」
    const [tones20a, tones20b] = figs(NUMS, /一共 (\d+) 根子载波，而 (\d+) 正是/,
      '`numbers` on the 20 MHz tone count')
    expect(tones20a, 'the tones nine blocks of 26 hold').toBe(RU26_PER_20MHZ * RU26_TONES)
    expect(tones20b, 'and the same figure again, as the engine’s own').toBe(TONES_20())
    function TONES_20(): number { return TONES(20) }
    // 「80 MHz 的音调数是 980，而三十六块只合 936」
    const [w, tones80, binTones] = figs(NUMS, /(\d+) MHz 的音调数是 (\d+)，而三十六块只合 (\d+)/,
      '`numbers` on the 80 MHz pair')
    expect(tones80, 'the tones that width carries').toBe(TONES(w!))
    expect(binTones, 'and what its bins cover').toBe(selBins(w!) * RU26_TONES)
    expect(selBins(w!), 'which really is thirty-six of them').toBe(36)
    expect(tones80, 'the grid leaves some of them out').toBeGreaterThan(binTones!)
  })

  it('reads the capacity formula’s own structure', () => {
    const f = lesson.numbers!.find((b) => b.kind === 'formula') as { text: string }
    const [ten, log10, two, log2, one, ten2, ten3, one2] = figs(f.text,
      /有效信噪比 = (\d+)·log(\d+)\( (\d+)\^\( 各格 log(\d+)\((\d+) \+ (\d+)\^\(\(均值 \+ 该格偏差\)\/(\d+)\)\) 的平均 \) − (\d+) \)/,
      'the capacity formula')
    expect([ten, log10, ten2, ten3], 'the decibel conversions are all base ten')
      .toEqual([10, 10, 10, 10])
    expect([two, log2], 'the capacity is base two, both ways round').toEqual([2, 2])
    expect([one, one2], 'and the 1 + x inside it comes back out again').toEqual([1, 1])
    // The formula is the engine's own function: one bin at a known deviation reproduces it.
    const mean = 20
    const devs = [3, -4, 1]
    const byHand = 10 * Math.log10(2 ** (devs
      .map((d) => Math.log2(1 + 10 ** ((mean + d) / 10)))
      .reduce((a, b) => a + b, 0) / devs.length) - 1)
    expect(selEffSinrDb(mean, devs), 'the engine computes what the line prints').toBeCloseTo(byHand, 9)
  })

  it('reads the two-ended table and the paragraph that reads it the other way', () => {
    const ends = lesson.numbers!
      .filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
      .find((b) => b.heading?.includes('两端的两个量'))!
    const worst = ends.rows.find((r) => r[0]!.includes('最深那一格'))!
    const loss = ends.rows.find((r) => r[0]!.includes('损失中位数'))!
    const [narrowWorst, wideWorst] = [worst[1]!, worst[2]!].map((c) => val(raw(c, /^([\d.]+) dB$/, 'a worst-bin cell')[0]!))
    const [narrowLoss, wideLoss] = [loss[1]!, loss[2]!].map((c) => val(raw(c, /^([\d.]+) dB$/, 'a loss cell')[0]!))
    // 「上面一行每翻一倍深约 3 dB」, over the four doublings the table spans.
    const [perDouble] = figs(NUMS, /上面一行每翻一倍深约 (\d+) dB/, '`numbers` on the deepening')
    const doublings = Math.log2(320 / 20)
    expect((wideWorst - narrowWorst) / doublings, 'the deepening a doubling buys, as the prose rounds it')
      .toBeCloseTo(perDouble!, 0)
    // 「只多了 0.06 dB」 — the two loss cells' own difference.
    same(raw(NUMS, /只多了 ([\d.]+) dB/, '`numbers` on the loss’s own rise')[0]!,
      wideLoss - narrowLoss, 'the rise between the table’s two loss cells')
    // 「在 320 MHz 上前者是后者的十倍」
    const [wideW] = figs(NUMS, /在 (\d+) MHz 上前者是后者的十倍/, '`numbers` on the ratio')
    expect(wideW, 'the width that comparison is about').toBe(320)
    expect(Math.round(wideWorst / wideLoss), 'and the ratio, to the ten the prose names').toBe(10)
    // The 40 000-draw instrument, re-measured at 4000 the way the test above does it.
    const RAYLEIGH: FadingCfg = { shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'rayleigh' }
    const drawLoss = (bins: number): number => {
      const xs: number[] = []
      for (let i = 0; i < 4000; i++) {
        const devs: number[] = []
        for (let b = 0; b < bins; b++) devs.push(smallScaleDb(RAYLEIGH, 7, 'ap', 'sta', `f${i}`, b))
        xs.push(20 - selEffSinrDb(20, devs))
      }
      return median(xs)
    }
    expect(drawLoss(selBins(20)), 'the narrow loss cell, on the instrument the heading names')
      .toBeCloseTo(narrowLoss, 1)
    expect(drawLoss(selBins(320)), 'and the wide one').toBeCloseTo(wideLoss, 1)
    // 「这一课自己跑一轮量到的是另一对数——最窄一档 2.03 dB，最宽一档 2.36 dB」 and the 0.27 between.
    const rs = WIDTHS.map((_w, i) => rowOf(i))
    const [ownNarrow, ownWide] = raw(NUMS, /最窄一档 ([\d.]+) dB，最宽一档 ([\d.]+) dB/,
      '`numbers` on this round’s own pair')
    same(ownNarrow!, rs[0]!.medLossDb, 'this round’s narrow loss')
    same(ownWide!, rs[4]!.medLossDb, 'and its wide one')
    same(raw(NUMS, /窄的那一头差了 ([\d.]+) dB/, '`numbers` on the gap between rulers')[0]!,
      narrowLoss - rs[0]!.medLossDb, 'the gap between the two rulers at the narrow end')
    expect(val(ownWide!), 'while at the wide end they agree to the printed decimals')
      .toBe(wideLoss)
  })

  it('reads the paragraph that warns a round will be shallower', () => {
    const rs = WIDTHS.map((_w, i) => rowOf(i))
    const ends = lesson.numbers!
      .filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
      .find((b) => b.heading?.includes('两端的两个量'))!
    const tableNarrow = val(raw(ends.rows[0]![1]!, /^([\d.]+) dB$/, 'the table’s narrow cell')[0]!)
    const [w, own, shallower] = figs(NUMS,
      /这一课的 (\d+) MHz 变体跑下来，最深那一格的中位数是比均值低 ([\d.]+) dB，比表里那一格浅了约 ([\d.]+) dB/,
      '`numbers` on the round against the table')
    expect(w, 'the variant it is about').toBe(WIDTHS[0])
    same(String(own), -rs[0]!.medWorstDb, 'the deepest bin this round’s median shows')
    expect(tableNarrow - own!, 'how much shallower it is, as the prose rounds it')
      .toBeCloseTo(shallower!, 1)
    // The same two figures again at the head of the paragraph above it.
    const [a, b] = figs(NUMS, /([\d.]+) dB 与 ([\d.]+) dB 是四万次抽样下的均值/,
      '`numbers` on the table’s two cells')
    expect([a, b], 'the table’s own two cells, named again')
      .toEqual([tableNarrow, val(raw(ends.rows[0]![2]!, /^([\d.]+) dB$/, 'the wide cell')[0]!)])
  })

  it('reads every bandwidth the prose names outside a table', () => {
    /*
     * **Six of the fifteen the sweep of 2026-10-13 found were bandwidths in prose.** A width is
     * a figure: it says which of this lesson's five variants a sentence is about, and this
     * engine only answers for a width that splits into whole bins. Every printing is read, and
     * the ones that name a variant are read against that variant's own bin count.
     */
    // The lookbehind matters: 「每格 2.03125 MHz」 ends in a run of digits that reads as a
    // bandwidth to a pattern without one.
    for (const [w] of every(ALL, /(?<![\d.])(\d+) MHz/g, 'every bandwidth the lesson prints', 16)) {
      const width = val(w!)
      expect(Number.isInteger(selBins(width)), `${width} MHz must split into whole bins`).toBe(true)
      expect([...WIDTHS] as number[], `${width} MHz is one of the five this lesson runs`)
        .toContain(width)
    }
    // 「234 正是本仿真器算 20 MHz 的 Wi-Fi 6／7 每符号比特数时用的那个音调数」
    const [w20] = figs(NUMS, /正是本仿真器算 (\d+) MHz 的/, '`numbers` on the tone table’s width')
    expect(w20, 'the width that tone count belongs to').toBe(WIDTHS[0])
    expect(occ(ALL, 'Wi-Fi 6／7'), 'the two generations the grid applies to, named once').toBe(1)
    // 「落在「每 20 MHz 九块」这张网格之外」 and 「在 320 MHz 上看到两个 2.36」
    const [gridW] = figs(NUMS, /落在「每 (\d+) MHz 九块」这张网格之外/, '`numbers` on the grid')
    expect(RU26_PER_20MHZ, 'nine blocks of that width').toBe(selBins(gridW!))
    const [coincW, coincDb] = figs(NUMS, /在 (\d+) MHz 上看到两个 ([\d.]+)/, '`numbers` on the coincidence')
    expect(coincW, 'the width the two rulers agree at').toBe(WIDTHS[4])
    const rs = WIDTHS.map((_w, i) => rowOf(i))
    same(String(coincDb), rs[4]!.medLossDb, 'the figure they agree on')
    // 「320 MHz 的链路比 20 MHz 的链路差十几个分贝」
    const [deepWide, deepNarrow] = figs(DEEP, /(\d+) MHz 的链路比 (\d+) MHz 的链路差十几个分贝/,
      '`deeper` on the two links')
    expect([deepWide, deepNarrow], 'the widest and the narrowest').toEqual([WIDTHS[4], WIDTHS[0]])
  })

  it('reads the capacity sentence in prose, and the provenance `sources` gives every figure', () => {
    // 「每一格算一个 log2(1 + 信噪比)」 — the prose's own printing of the formula's two figures.
    const [base, plus] = figs(NUMS, /每一格算一个 log(\d+)\((\d+) \+ 信噪比\)/,
      '`numbers` on the capacity in prose')
    expect(base, 'capacity is base two').toBe(2)
    expect(plus, 'and the 1 + x inside it').toBe(1)
    const f = lesson.numbers!.find((b) => b.kind === 'formula') as { text: string }
    expect(f.text, 'the same two in the formula block').toContain(`log${base}(${plus} + `)
    /*
     * **`sources` names every instrument, and the figures beside the names are figures.** Four
     * of the fifteen the sweep found were here: the two loss medians, the round's own deepest
     * bin, and the two run lengths that make the engine's sweep and this lesson's disagree.
     */
    const ends = lesson.numbers!
      .filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
      .find((b) => b.heading?.includes('两端的两个量'))!
    const [a, b] = figs(SRC, /([\d.]+)／([\d.]+) dB 两个损失中位数/, '`sources` on the two medians')
    expect([a, b], 'the table’s own two loss cells')
      .toEqual([ends.rows[1]![1]!, ends.rows[1]![2]!].map((c) => val(raw(c, /^([\d.]+) dB$/, 'a cell')[0]!)))
    const rs = WIDTHS.map((_w, i) => rowOf(i))
    const [own, w, ms] = figs(SRC, /([\d.]+) dB 是这一课 (\d+) MHz 变体自己那 (\d+) ms 跑出来的/,
      '`sources` on this round’s own figure')
    same(String(own), -rs[0]!.medWorstDb, 'the deepest bin this round shows')
    expect(w, 'the variant it is about').toBe(WIDTHS[0])
    expect(ms * MS, 'and the length this file runs it for').toBe(RUN_NS)
    const [engineMs] = figs(SRC, /引擎那边同一个场景跑 (\d+) ms 读到的是另一个数/,
      '`sources` on the engine’s own length')
    expect(engineMs, 'the length the engine sweep runs, which is longer').toBeGreaterThan(ms!)
    const ROUND = readFileSync(new URL('../engine/selectivity-round.test.ts', import.meta.url), 'utf8')
    expect(ROUND, 'and that file really does run it for that long')
      .toContain(`${engineMs}`)
  })

  it('reads the five pooled drop rates against the engine test that owns them', () => {
    const table = lesson.numbers!
      .filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
      .find((b) => b.heading?.includes('掉帧率'))!
    const printed = table.rows.map((r) => raw(r[2]!, /^([\d.]+) %$/, `the rate of ${r[0]} MHz`)[0]!)
    // The engine test asserts the same five as one array; `sources` names that file.
    const asserted = raw(INERT, /toEqual\(\['([\d.]+)', '([\d.]+)', '([\d.]+)', '([\d.]+)', '([\d.]+)'\]\)/,
      'the five rates `selectivity-inert.test.ts` asserts')
    expect(printed, 'the five cells, against the five that file pins').toEqual(asserted)
    expect(SRC, 'and `sources` names that file').toContain('selectivity-inert.test.ts')
    // The widths and bin counts beside them are the engine's own.
    expect(table.rows.map((r) => val(r[0]!)), 'the five widths').toEqual([...WIDTHS])
    expect(table.rows.map((r) => val(r[1]!)), 'and their bin counts').toEqual(WIDTHS.map(selBins))
    // 「14.66 % 到 0.75 %，端到端十九倍」
    const [from, to] = figs(NUMS, /([\d.]+) % 到 ([\d.]+) %，端到端十九倍/, '`numbers` on the span')
    expect([String(from), String(to)], 'the two ends of the span').toEqual([printed[0], printed[4]])
    // 「十九倍」 is a floor — the ratio is 19.55, and the sentence says nineteen times over.
    expect(from! / to!, 'the ratio the prose names in characters').toBeGreaterThan(19)
    expect(from! / to!, 'and under the next whole one').toBeLessThan(20)
  })

  it('reads the margin the table rests on, and the gloss that used to overclaim it', () => {
    const rs = WIDTHS.map((_w, i) => rowOf(i))
    const table = lesson.numbers!
      .filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
      .find((b) => b.heading?.includes('掉帧率'))!
    const [pooled] = figs(table.heading!, /余量都是 ([\d.]+) dB/, 'the table’s own heading')
    /*
     * **The margin is the table's, not this lesson's five rounds'** — the correction this
     * read-back produced. Four of the five rounds settle at the pooled figure and the narrowest
     * settles a whole rung higher, which is the lesson's own later point and the quiz's answer.
     */
    const [glossPooled, glossOwn] = figs(TERMS, /五档各 ([\d.]+) dB（本课自己那五轮并不这样齐，最窄一档停在 ([\d.]+) dB）/,
      'the `margin` gloss')
    expect(glossPooled, 'the gloss names the table’s margin').toBe(pooled)
    for (const r of rs.slice(1)) {
      same(String(pooled), r.marginDb, `the margin of this lesson’s own ${r.w} MHz round`)
    }
    same(String(glossOwn), rs[0]!.marginDb, 'and the narrowest round’s own margin')
    expect(rs[0]!.marginDb, 'which really is a rung higher').toBeGreaterThan(pooled! + 2)
    // The same margin again in the paragraph under the table and in the quiz.
    for (const groups of every([NUMS, QUIZ].join('\n'),
      /余量都是 ([\d.]+) dB|前提是五档余量都是 ([\d.]+) dB/g,
      'the pooled margin, named three times', 3)) {
      expect(val(groups.find((x) => x !== undefined)!), 'the margin the table rests on').toBe(pooled)
    }
    // 「不是速率余量固定留的 3 dB」: the margin the rate picker leaves, out of `phy.ts`.
    const [rateMargin] = figs(TERMS, /速率余量固定留的 (\d+) dB/, 'the `margin` gloss on the rate margin')
    expect(rateMargin, 'the margin `dataRateFor` adds to every sensitivity')
      .toBe(figs(PHY, /rssiDbm >= r\.sensDbm \+ (\d+)/, 'the margin in `phy.ts`')[0])
  })

  it('reads the noise floor the table had to cancel, and the deeper subtraction', () => {
    const [from, to, rise] = figs(NUMS,
      /噪声地板（noise floor）从 (\d+) 到 (\d+) MHz 抬高了 ([\d.]+) dB/, '`numbers` on the noise floor')
    expect([from, to], 'the two widths').toEqual([WIDTHS[0], WIDTHS[4]])
    same(String(rise), noiseDbm(to!) - noiseDbm(from!), 'the noise floor’s own rise')
    // Printed again in the next sentence, and again in `deeper` as a coincidence to warn about.
    for (const groups of every([NUMS, DEEP].join('\n'),
      /这 ([\d.]+) dB 抵掉了|与噪声地板那一节的 ([\d.]+) dB 数值相同/g,
      'the same rise, twice more', 2)) {
      expect(val(groups.find((x) => x !== undefined)!), 'the rise the two sentences name').toBe(rise)
    }
    // 「24.09 − 12.05 = 12.04 dB」: the subtraction `deeper` warns is a coincidence.
    const [wide, narrow, diff] = figs(DEEP, /（([\d.]+) − ([\d.]+) = ([\d.]+) dB/, '`deeper` on the subtraction')
    expect(wide! - narrow!, 'the arithmetic it shows').toBeCloseTo(diff!, 9)
    expect(diff, 'which happens to equal the noise floor’s rise').toBe(rise)
    const ends = lesson.numbers!
      .filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
      .find((b) => b.heading?.includes('两端的两个量'))!
    expect([narrow, wide], 'and both terms are the table’s own two cells')
      .toEqual([ends.rows[0]![1]!, ends.rows[0]![2]!].map((c) => val(raw(c, /^([\d.]+) dB$/, 'a cell')[0]!)))
    // 「最深那一格平均低 24.09 dB，而容量合成的损失中位数是 2.36 dB」
    const [deepWorst, deepLoss] = figs(DEEP, /最深那一格平均低 ([\d.]+) dB，而容量合成的损失中位数是 ([\d.]+) dB/,
      '`deeper` on the two quantities')
    expect([deepWorst, deepLoss], 'the same two figures the table prints for the widest channel')
      .toEqual([wide, val(raw(ends.rows[1]![2]!, /^([\d.]+) dB$/, 'the wide loss cell')[0]!)])
  })

  it('reads the four-bit deviation field, as arithmetic and as a measurement', () => {
    const [lo, hi] = figs(ALL, /四个比特，−(\d+) 到 \+(\d+) dB/, '`numbers` on the deviation field')
    expect(lo! + hi! + 1, 'the values four bits hold').toBe(2 ** 4)
    // `sources` prints the same window and the same width the other way round.
    const [srcLo, srcHi] = figs(SRC, /−(\d+) 到 \+(\d+) dB、四个比特/, '`sources` on the same field')
    expect([srcLo, srcHi], 'the same window').toEqual([lo, hi])
    // The two shares inside and outside it, re-drawn from the engine's own sampler.
    const inside = (cfg: FadingCfg): number => {
      let n = 0
      const N = 20_000
      for (let i = 0; i < N; i++) {
        const d = smallScaleDb(cfg, 7, 'ap', 'sta', `w${i}`, i % 9)
        if (d >= -lo! && d <= hi!) n++
      }
      return (100 * n) / N
    }
    const [k, ricePct] = figs(ALL, /K = (\d+) dB）?抽逐格偏差，([\d.]+) % 落在这个窗口里/,
      '`numbers` on the Rician share')
    const rice = inside({ shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'rician', ricianKdB: k })
    expect(Math.round(rice * 10) / 10, 'the share of Rician draws inside the window')
      .toBeCloseTo(ricePct!, 0)
    const [rayPct] = figs(NUMS, /才有 ([\d.]+) % 落在窗口外被夹住/, '`numbers` on the Rayleigh share')
    const ray = 100 - inside({ shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'rayleigh' })
    expect(Math.round(ray * 10) / 10, 'and the share of Rayleigh draws outside it')
      .toBeCloseTo(rayPct!, 0)
    // `sources` prints both shares again, and `limits` the K a third time.
    const [srcK, srcRice, srcRay] = figs(SRC, /莱斯 K = (\d+) dB 下 ([\d.]+) %，瑞利下 ([\d.]+) %/,
      '`sources` on the two shares')
    expect([srcK, srcRice, srcRay], 'the same three figures').toEqual([k, ricePct, rayPct])
    for (const groups of every([SRC, LIM].join('\n'), /K 默认 (\d+) dB|默认 (\d+) dB 的 K/g,
      'the default K, named twice more', 2)) {
      expect(val(groups.find((x) => x !== undefined)!), 'the K this engine defaults to').toBe(k)
    }
  })

  it('reads the member’s share, the legacy spacing and the rest of `limits`', () => {
    // 「20 MHz 上两个成员各读 9 格里的 4 格」 is interpolated; the 106-tone claim beside it is not.
    expect(PIC.length + NUMS.length, 'the lesson still has the sections this reads').toBeGreaterThan(0)
    const [tones] = figs(NUMS, /两个 (\d+) 音调资源单元正好各覆盖/, '`numbers` on the 106-tone RU')
    expect(Math.floor(tones! / RU26_TONES), 'what that RU covers in bins').toBe(selMemberBins(20, 1 / 2))
    // 「312.5 kHz 的子载波间隔上不存在 26 音调资源单元」: four times the spacing this lesson uses.
    const [legacyKhz] = figs(LIM, /([\d.]+) kHz 的子载波间隔上不存在/, '`limits` on the legacy spacing')
    expect(legacyKhz! / DF_EHT_KHZ, 'the legacy spacing, in units of this one').toBe(4)
    // 「2.36 dB 是最小的那个数」: the loss the threshold entry calls a lower bound.
    const ends = lesson.numbers!
      .filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
      .find((b) => b.heading?.includes('两端的两个量'))!
    const wideLoss = val(raw(ends.rows[1]![2]!, /^([\d.]+) dB$/, 'the wide loss cell')[0]!)
    same(raw(LIM, /([\d.]+) dB 是最小的那个数/, '`limits` on the lower bound')[0]!, wideLoss,
      'the figure the threshold entry calls the smallest')
  })

  it('reads both observe lines and the two quiz figures', () => {
    const rs = WIDTHS.map((_w, i) => rowOf(i))
    // 「worst bin 从约 10 dB 深到约 23 dB——每翻一倍约 3 dB」
    const [shallow, deep, perDouble] = figs(OBS,
      /worst bin 从约 (\d+) dB 深到约 (\d+) dB——每翻一倍约 (\d+) dB/, 'the first observe line')
    expect(Math.round(-rs[0]!.medWorstDb), 'the narrow end, as the line rounds it').toBe(shallow)
    expect(Math.round(-rs[4]!.medWorstDb), 'and the wide end').toBe(deep)
    expect((deep! - shallow!) / Math.log2(320 / 20), 'the deepening a doubling buys')
      .toBeCloseTo(perDouble!, 0)
    // 「一直在 2 dB 上下（这一课最窄一档的中位数 2.03 dB，最宽一档 2.36 dB）」
    const [about, narrow, wide] = figs(OBS,
      /一直在 (\d+) dB 上下（这一课最窄一档的中位数 ([\d.]+) dB，最宽一档 ([\d.]+) dB）/,
      'the second observe line')
    expect(Math.round(rs[0]!.medLossDb), 'the loss, to the decibel the line names').toBe(about)
    same(String(narrow), rs[0]!.medLossDb, 'this round’s narrow loss, in `observe`')
    same(String(wide), rs[4]!.medLossDb, 'and its wide one')
    // The quiz: the widest channel, its deepest bin and the loss that answers it.
    const [quizW, quizWorst] = figs(QUIZ, /(\d+) MHz 的信道有一百四十四格，最深那一格平均比均值低 ([\d.]+) dB/,
      'the quiz’s own question')
    expect(quizW, 'the width it asks about').toBe(WIDTHS[4])
    expect(selBins(quizW!), 'which has the bins the question counts in characters').toBe(144)
    const ends = lesson.numbers!
      .filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
      .find((b) => b.heading?.includes('两端的两个量'))!
    expect(quizWorst, 'the deepest bin, as the table prints it')
      .toBe(val(raw(ends.rows[0]![2]!, /^([\d.]+) dB$/, 'the wide worst cell')[0]!))
    const [quizAgain] = figs(QUIZ, /要因此减掉 ([\d.]+) dB 吗/, 'the quiz’s own second printing')
    expect(quizAgain, 'printed twice in one question').toBe(quizWorst)
    const [quizLoss] = figs(QUIZ, /实际损失的中位数是 ([\d.]+) dB/, 'the quiz’s own answer')
    expect(quizLoss, 'the loss the right option gives')
      .toBe(val(raw(ends.rows[1]![2]!, /^([\d.]+) dB$/, 'the wide loss cell')[0]!))
  })
})
