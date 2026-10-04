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
import { lessonStrings } from '../../src/course/readability'
import { RU26_PER_20MHZ, selBinWidthMhz, selBins, selMemberBins, selEffSinrDb } from '../../src/engine/selectivity'
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

/** Every string a reader sees, `limits` included. */
const text = [...lessonStrings(lesson), lesson.title, ...lesson.limits.map((l) => l.text)].join('\n')
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
