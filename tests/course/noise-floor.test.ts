/**
 * Every empirical claim in "The noise floor of this much bandwidth", measured
 * against the scene it shares with `radio-primer` — same builder, same four
 * variants, so the two lessons are one walk through the flat and the split
 * costs the reader nothing.
 *
 * The pins here did not appear with the lesson: the kTB formula, the width
 * table, the mW-by-mW interference sum, the `linkBudget` widget and the two
 * quiz questions were all pinned in `radio-primer.test.ts` before the
 * 2026-09-25 re-pacing, and each moved with the sentence it guards.
 *
 * The lesson is not registered yet — `src/course/lessons.ts` and `COURSE_ORDER`
 * are the controller's to edit when this batch lands — so it is imported
 * directly here, and the terminology rule `tests/course/readability.test.ts`
 * applies course-wide is re-run over it below rather than waited for.
 */
import { describe, it, expect } from 'vitest'
import { noiseFloor } from '../../src/course/tier1/noise-floor'
import { radioPrimer } from '../../src/course/tier1/radio-primer'
import { PRIMER_DISTANCES } from '../../src/course/tier1/radioLink'
import { MODULES } from '../../src/course/curriculum'
import type { Block } from '../../src/course/lessonKit'
import {
  ZH_TERMS, cellTexts, paragraphTexts, zhAkaViolations, zhTermFailure,
} from '../../src/course/readability'
import { linkBudget } from '../../src/course/widgetModel'
import { NOISE_FIGURE_DB, noiseDbm } from '../../src/engine/phy'
import { WALL_LOSS_DB, buildLinkTable, pathLossDb } from '../../src/engine/propagation'
import type { TLRecord } from '../../src/model/records'
import { ScenarioSchema } from '../../src/model/scenario'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { lessonTexts } from '../../src/course/readability'
import { mcsRateMbps } from '../../src/engine/phy'
import { selBinWidthMhz } from '../../src/engine/selectivity'

const MS = 1_000_000
/** The same run length radio-primer uses, so the four M1 lessons share one memo. */
const RUN_NS = 100 * MS
const mw = (dbm: number) => Math.pow(10, dbm / 10)
const dbm = (m: number) => 10 * Math.log10(m)

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (recs: TLRecord[], node: string, kind: string): Tx[] =>
  recs.filter((r): r is Tx => r.type === 'TX_START' && r.node === node && r.frame.kind === kind)
const variantRecs = (i: number): TLRecord[] => runOf(noiseFloor, i, RUN_NS)

const wallsFor = (d: number) => (d > 5.5 ? (['brick'] as const) : ([] as const))
/**
 * The 「一个地板，四个位置」 table: the RSSI, the floor, and the SNR between them — **read out of
 * the lesson** rather than transcribed.
 *
 * It was transcribed until 2026-10-12, which made every assertion below it a pin on
 * `linkBudget` and none on the four rows a reader sees: they could be edited a digit at a time
 * with the suite green (six figures planted in this lesson, six unnoticed). Reading them instead
 * turned all of it into a read-back without changing a line of the assertions.
 */
const TABLE = ((): { rssi: string; snr: string }[] => {
  const t = (noiseFloor.numbers ?? []).find(
    (b): b is Extract<Block, { kind: 'table' }> =>
      b.kind === 'table' && (b.heading ?? '').includes('四个位置'))
  if (!t) throw new Error('the 「四个位置」 table is gone from `numbers`')
  return t.rows.map((r) => ({
    rssi: r[1].replace('−', '-').replace(' dBm', ''),
    snr: r[3].replace(' dB', ''),
  }))
})()

lessonShapeSuite(noiseFloor, { sameSceneAs: 'radio-primer', runNs: RUN_NS })

describe('noise-floor · the second lesson of the Wi-Fi track', () => {
  it('sits in M1, follows radio-primer, and owns the two words it takes over', () => {
    expect(noiseFloor.id).toBe('noise-floor')
    expect(MODULES[noiseFloor.module].title).toBe('信号与链路')
    expect(noiseFloor.module).toBe(radioPrimer.module)
    expect(noiseFloor.needs).toEqual(['radio-primer'])
    // §6 of the plan: RSSI and SNR stay with the budget, the floor and SINR come here
    expect(noiseFloor.terms!.map((t) => t.term)).toEqual(['noise floor', 'SINR'])
  })

  it('loads radio-primer’s own scene, variant for variant', () => {
    // the split is scene-preserving by construction, so the recorded hash of every one of
    // these five scenarios is the value the fixture already holds under the parent's id
    expect(noiseFloor.scenario()).toEqual(radioPrimer.scenario())
    expect(noiseFloor.variants!.map((v) => v.scenario()))
      .toEqual(radioPrimer.variants!.map((v) => v.scenario()))
    expect(() => ScenarioSchema.parse(noiseFloor.scenario())).not.toThrow()
    for (const v of noiseFloor.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  /**
   * The one content rule readability.test.ts still enforces course-wide. It
   * cannot see an unregistered lesson, so the same two arms run here: every
   * official term carries its English name (and its abbreviation where the
   * standard has one) at its first Chinese use, and no `aka` spelling appears.
   */
  it('brackets every official term at its first Chinese use', () => {
    const zh = [noiseFloor.why!, ...noiseFloor.outcomes!]
      .concat(paragraphTexts(noiseFloor.picture!), cellTexts(noiseFloor.picture!))
      .concat(paragraphTexts(noiseFloor.numbers!), cellTexts(noiseFloor.numbers!))
      .concat(noiseFloor.observe, noiseFloor.tryThis,
        noiseFloor.quiz.flatMap((q) => [q.q, ...q.options, q.explain]))
      .join(' ')
    const wifi = ZH_TERMS.filter((t) => !t.track || t.track === 'wifi')
    const fails = wifi.flatMap((t) => [zhTermFailure(zh, t), ...zhAkaViolations(zh, t)].filter(Boolean))
    expect(fails).toEqual([])
    // the anti-vacuity guard: the rule really did grade this lesson
    expect(wifi.filter((t) => zhTermFailure(zh, t) === null && zh.includes(t.zh ?? t.abbr!)).length)
      .toBeGreaterThanOrEqual(2)
  })
})

describe('noise-floor · the floor of the room', () => {
  it('the formula is kTB plus the simulator’s noise figure', () => {
    // "N(W) = −174 dBm/Hz + 10·log10(W) + 7 dB → N(20 MHz) = −93.99 dBm"
    expect(NOISE_FIGURE_DB).toBe(7)
    expect((noiseDbm(20) - NOISE_FIGURE_DB).toFixed(2)).toBe('-100.99')
    expect(noiseDbm(20).toFixed(2)).toBe('-93.99')
  })

  it('each doubling of the channel adds 3.01 dB, and the width table is the engine’s', () => {
    // the note "each doubling of the channel takes in twice the noise, 3.01 dB more", and the
    //  table "the noise floor at every width"
    expect([20, 40, 80, 160, 320].map((w) => noiseDbm(w).toFixed(2)))
      .toEqual(['-93.99', '-90.98', '-87.97', '-84.96', '-81.95'])
    expect((noiseDbm(40) - noiseDbm(20)).toFixed(2)).toBe('3.01')
    expect(noiseDbm(160).toFixed(2)).toBe('-84.96')
    // the scene runs at 20 MHz, and the quiz and the first experiment both move it to 160
    expect((noiseDbm(160) - noiseDbm(20)).toFixed(2)).toBe('9.03')
  })

  it('the four-place table: the RSSI moves, the floor does not, and the SNR is the difference', () => {
    // "One floor, four places": −31.7/−52.7/−72.3/−78.1 dBm over the same −93.99 dBm,
    //  giving 62.3/41.3/21.7/15.9 dB — the four figures the `watch` block reads.
    PRIMER_DISTANCES.forEach((d, i) => {
      const s = noiseFloor.variants![i].scenario()
      const lb = linkBudget({ txDbm: 15, distanceM: d, walls: [...wallsFor(d)], widthMhz: 20, mode: 'eht' })
      expect(lb.rssiDbm).toBeCloseTo(buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')!, 9)
      expect(lb.rssiDbm.toFixed(1)).toBe(TABLE[i].rssi)
      expect(lb.noiseDbm.toFixed(2)).toBe('-93.99')
      expect(lb.snrDb.toFixed(1)).toBe(TABLE[i].snr)
      expect((lb.rssiDbm - noiseDbm(20)).toFixed(1)).toBe(TABLE[i].snr)
    })
  })

  it('the widget is preset to the living room, and lands on the table’s own row', () => {
    // the caption "the four steps of the last lesson plus the two of this one, preset to the
    //  living-room laptop"
    const w = noiseFloor.numbers!.find((b): b is Extract<Block, { kind: 'widget' }> => b.kind === 'widget')!
    expect(w.widget).toBe('linkBudget')
    const p = w.params!
    const walls = (['drywall', 'brick', 'glass'] as const).flatMap((m) => Array(Number(p[m])).fill(m))
    expect(walls).toEqual(['brick'])
    expect(Number(p.txDbm)).toBe(15)
    expect(Number(p.distanceM)).toBe(9)
    const lb = linkBudget({
      txDbm: Number(p.txDbm), distanceM: Number(p.distanceM), walls,
      widthMhz: Number(p.widthMhz), mode: p.mode as 'eht',
    })
    expect(lb.pathLossDb.toFixed(1)).toBe('75.3')
    expect(lb.wallLossDb).toBe(WALL_LOSS_DB.brick)
    expect(lb.rssiDbm.toFixed(1)).toBe(TABLE[2].rssi)
    expect(lb.noiseDbm.toFixed(1)).toBe('-94.0')
    expect(lb.snrDb.toFixed(1)).toBe(TABLE[2].snr)
  })
})

describe('noise-floor · and when the neighbour joins in', () => {
  it('the four steps are the engine’s own order, and they end on 12.16 dB', () => {
    // "From the received level to the SINR, step by step": the floor at this width, the RSSI
    //  minus it, the neighbour added AS POWER, and the ratio over the raised floor.
    const steps = noiseFloor.numbers!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!
    expect(steps.items.length).toBe(4)
    // 1. "the floor at 20 MHz is −93.99 dBm"
    const n = noiseDbm(20)
    expect(n.toFixed(2)).toBe('-93.99')
    // 2. "the living-room laptop: −72.33 − (−93.99) = 21.66 dB"
    const sig = linkBudget({ txDbm: 15, distanceM: 9, walls: ['brick'], widthMhz: 20, mode: 'eht' }).rssiDbm
    expect(sig.toFixed(2)).toBe('-72.33')
    expect((sig - n).toFixed(2)).toBe('21.66')
    // 3. "3.99 × 10⁻¹⁰ mW plus 3.16 × 10⁻⁹ mW is 3.56 × 10⁻⁹ mW, or −84.48 dBm"
    expect(mw(n).toExponential(2)).toBe('3.99e-10')
    expect(mw(-85).toExponential(2)).toBe('3.16e-9')
    const sum = mw(n) + mw(-85)
    expect(sum.toExponential(2)).toBe('3.56e-9')
    expect(dbm(sum).toFixed(2)).toBe('-84.48')
    // 4. "−72.33 − (−84.48) = 12.16 dB, 9.5 dB less than the SNR"
    expect((sig - dbm(sum)).toFixed(2)).toBe('12.16')
    expect(((sig - n) - (sig - dbm(sum))).toFixed(1)).toBe('9.5')
    // and quiz 1's own wording: the neighbour dominates the sum
    expect((dbm(sum) + 85).toFixed(2)).toBe('0.52')
  })

  it('deeper: two equal neighbours are +3.01 dB, −81.99 dBm, and never −170', () => {
    // "Two neighbours both at −85 dBm are twice the power, +3.01 dB: −81.99 dBm, not −170."
    expect(dbm(2 * mw(-85)).toFixed(2)).toBe('-81.99')
    expect(dbm(2).toFixed(2)).toBe('3.01')
  })
})

describe('noise-floor · what the run shows', () => {
  it('the living room’s first exchange: 415.2 µs of data, SIFS, then the ACK to 459.2 µs', () => {
    // observe 2: "the data frame runs from 0 to 415.2 µs, the router's ACK starts 16 µs later
    //  and ends at 459.2 µs. Nobody else is on the air for any of it — so here the SINR IS the SNR."
    const rs = runOf(noiseFloor, 2, RUN_NS)
    const data = txs(rs, 'sta-1', 'data')[0]
    const ack = txs(rs, 'ap', 'ack')[0]
    expect(data.t).toBe(0)
    expect(data.frame.txTimeNs).toBe(415_200)
    expect(ack.t - (data.t + data.frame.txTimeNs)).toBe(16_000)
    expect(ack.t + ack.frame.txTimeNs).toBe(459_200)
    // "nobody else is on the air": the scene has exactly two nodes, and only one of them sends data
    expect(noiseFloor.scenario().nodes.map((x) => x.id)).toEqual(['ap', 'sta-1'])
    expect(txs(rs, 'ap', 'data')).toHaveLength(0)
  })

  it('no variant loses a frame, so the floor is the only thing to clear', () => {
    // observe 2 of the lesson's own pair: "not one failed reception and not one retry in any
    //  of the four" — the claim that makes the −85 dBm neighbour arithmetic rather than a reading
    for (const i of PRIMER_DISTANCES.keys()) {
      const rs = variantRecs(i)
      expect(ofType(rs, 'RX_FAIL'), `variant ${i}`).toHaveLength(0)
      expect(ofType(rs, 'RETRY'), `variant ${i}`).toHaveLength(0)
      expect(ofType(rs, 'RX_MISS'), `variant ${i}`).toHaveLength(0)
    }
    // "12.16 dB is lower than the 15.9 dB the far wall has to itself": one neighbour costs
    // more than five metres and a brick wall
    const living = linkBudget({ txDbm: 15, distanceM: 9, walls: ['brick'], widthMhz: 20, mode: 'eht' })
    const far = linkBudget({ txDbm: 15, distanceM: 14, walls: ['brick'], widthMhz: 20, mode: 'eht' })
    const sinr = living.rssiDbm - dbm(mw(noiseDbm(20)) + mw(-85))
    expect(sinr.toFixed(2)).toBe('12.16')
    expect(far.snrDb.toFixed(1)).toBe('15.9')
    expect(sinr).toBeLessThan(far.snrDb)
    expect((living.snrDb - far.snrDb).toFixed(2)).toBe('5.76')
  })
})

describe('noise-floor · try this', () => {
  it('20 → 160 MHz at 9 m: the level does not move, the floor rises 9.03 dB', () => {
    // "the received level does not budge from −72.3 dBm, the floor goes from −93.99 to
    //  −84.96 dBm, and the SNR loses exactly 9.03 dB: 21.7 down to 12.6."
    const narrow = linkBudget({ txDbm: 15, distanceM: 9, walls: ['brick'], widthMhz: 20, mode: 'eht' })
    const wide = linkBudget({ txDbm: 15, distanceM: 9, walls: ['brick'], widthMhz: 160, mode: 'eht' })
    expect(wide.rssiDbm).toBeCloseTo(narrow.rssiDbm, 12)
    expect(wide.rssiDbm.toFixed(1)).toBe('-72.3')
    expect(narrow.noiseDbm.toFixed(2)).toBe('-93.99')
    expect(wide.noiseDbm.toFixed(2)).toBe('-84.96')
    expect((narrow.snrDb - wide.snrDb).toFixed(2)).toBe('9.03')
    expect(narrow.snrDb.toFixed(1)).toBe('21.7')
    expect(wide.snrDb.toFixed(1)).toBe('12.6')
    // deeper, "why a wide channel reaches less far": the rung falls with it
    expect(narrow.mcs).toBe(3)
    expect(wide.mcs).toBe(0)
  })

  it('9 → 14 m at 20 MHz: the level falls, the floor does not move at all', () => {
    // "the received level falls to −78.1 dBm, the floor does not move, the SNR is 15.9 dB.
    //  The floor follows the width and nothing else."
    const near = linkBudget({ txDbm: 15, distanceM: 9, walls: ['brick'], widthMhz: 20, mode: 'eht' })
    const far = linkBudget({ txDbm: 15, distanceM: 14, walls: ['brick'], widthMhz: 20, mode: 'eht' })
    expect(far.rssiDbm.toFixed(1)).toBe('-78.1')
    expect(far.noiseDbm).toBe(near.noiseDbm)
    expect(far.snrDb.toFixed(1)).toBe('15.9')
    // the level fell by exactly the extra path loss; no wall was added or removed
    expect((near.rssiDbm - far.rssiDbm).toFixed(2)).toBe((pathLossDb(14) - pathLossDb(9)).toFixed(2))
    expect(near.wallLossDb).toBe(far.wallLossDb)
  })

  it('quiz 2: the width changes the floor and not the received level', () => {
    // "The received level is unchanged; the floor rises about 9 dB, to −84.96 dBm."
    const narrow = linkBudget({ txDbm: 15, distanceM: 14, walls: ['brick'], widthMhz: 20, mode: 'eht' })
    const wide = linkBudget({ txDbm: 15, distanceM: 14, walls: ['brick'], widthMhz: 160, mode: 'eht' })
    expect(wide.rssiDbm).toBeCloseTo(narrow.rssiDbm, 12)
    expect((wide.noiseDbm - narrow.noiseDbm).toFixed(2)).toBe('9.03')
    expect((narrow.snrDb - wide.snrDb).toFixed(2)).toBe('9.03')
    expect(wide.noiseDbm.toFixed(2)).toBe('-84.96')
  })
})

/**
 * Slice 4a built frequency selectivity, and this lesson's subject is the ratio: the denominator
 * (the floor) still only follows the width and is the same in every bin, while the numerator is
 * what became per-bin. The limit says so, and it says the one simplification the slice left in the
 * denominator — the interference term enters every bin as the same number, which is exact for
 * thermal noise and a simplification for an interferer (`selCombine` in channel.ts).
 */
describe('noise-floor · the ratio after frequency selectivity', () => {
  const text = noiseFloor.limits.map((l) => l.text).join('\n')

  it('says the floor stays flat per bin and the numerator goes per bin', () => {
    expect(text).toContain(`${selBinWidthMhz()} MHz 一格`)
    expect(text).toContain('分母一格一格都一样')
    expect(text).toContain('按容量合成的那一个')
  })

  it('names the flat interference term as the simplification it is, and keeps Doppler absent', () => {
    expect(text).toContain('对热噪声是精确的，对一个干扰者是一处简化')
    expect(text).toContain('多普勒仍然没有')
  })

  it('no longer says the fading is one value across the whole channel width', () => {
    expect(text).not.toContain('而且那份衰落对整个信道带宽是同一个值')
    expect(text).not.toContain('不建模时延扩展、频率选择性与多普勒')
  })

  it('「衰落默认关闭」 holds for both sections, in every scene this lesson runs', () => {
    // Both sections, every variant (review finding 7): the limit's first clause — the ratio is a
    // constant here — is false if any of these scenes carries fading.
    const scenes = [noiseFloor.scenario(), ...(noiseFloor.variants ?? []).map((v) => v.scenario())]
    expect(scenes.length).toBeGreaterThan(1)
    for (const [i, sc] of scenes.entries()) {
      expect(sc.selectivity, `scene ${i}`).toBeUndefined()
      expect(sc.fading, `scene ${i}`).toBeUndefined()
    }
  })
})

// --- every figure the lesson prints ------------------------------------------------------------

/**
 * **`TABLE` above was this lesson's own table, transcribed, and it is now read out of it** — the
 * same one-line change that turned `@radio-primer`'s assertions into read-backs, for the same
 * reason: four rows typed on this side pin `linkBudget` and leave the four rows in the lesson
 * free to drift a digit at a time. `scripts/figure-planting.ts` measured 6 of 6 sampled figures
 * unnoticed on 2026-10-12, over 99 plantable figures.
 *
 * Everything else this lesson prints is one of five quantities restated: the floor at this width
 * (eight sites), the formula that produces it, the five widths and their five floors, the
 * neighbour's own level (five sites), and the milliwatt arithmetic that adds it to the floor. So
 * each is read at every site, and the arithmetic is read by feeding the printed mantissas and
 * exponents back into the sum.
 */
describe('noise-floor · every figure the lesson prints, read back out of its own prose', () => {
  const EVERYWHERE = lessonTexts(noiseFloor).map((t) => t.text).join('\n')
  const val = (s: string): number => Number(s.replace(/[\s,]/g, '').replace(/−/g, '-'))
  const raw = (s: string, re: RegExp, what: string): string[] => {
    const m = re.exec(s)
    expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (s: string, re: RegExp, what: string): number[] => raw(s, re, what).map(val)
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/−/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const everyFig = (re: RegExp, what: string, least: number): string[] => {
    const out = [...EVERYWHERE.matchAll(re)].flatMap((m) => m.slice(1).filter((x) => x !== undefined))
    expect(out.length, `${what}: fewer occurrences than this test was written for`)
      .toBeGreaterThanOrEqual(least)
    return out
  }
  const WIDTH = 20
  const budgetAt = (d: number, widthMhz = WIDTH) => linkBudget({
    txDbm: 15, distanceM: d, walls: [...wallsFor(d)], widthMhz, mode: 'eht',
  })
  /** The neighbour's own arrival level, read off the lesson: it is a figure, not a constant. */
  const NEIGHBOUR_DBM = -Number(/邻居以 −(\d+) dBm 到达/.exec(EVERYWHERE)![1])

  it('the formula: thermal noise, the bandwidth term and this simulator’s noise figure', () => {
    const f = noiseFloor.numbers!.find(
      (b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')
    expect(f, 'the formula is gone from `numbers`').toBeDefined()
    const [perHz, ten, base, nf, width, floorDbm] = figs(f!.text,
      /N\(W\) = −(\d+) dBm\/Hz \+ (\d+)·log(\d+)\(W\) \+ (\d+) dB\s+→\s+N\((\d+) MHz\) = −([\d.]+) dBm/,
      'the floor, term by term')
    expect(nf, 'the noise figure this simulator takes').toBe(NOISE_FIGURE_DB)
    expect([ten, base], 'ten times the base-ten logarithm').toEqual([10, 10])
    same(`-${floorDbm}`, noiseDbm(width), `the floor at ${width} MHz`)
    // −174 dBm/Hz is thermal noise at room temperature: what the engine holds is the floor, so
    // the term is read by removing the other two from it.
    expect(-perHz, 'the per-hertz term the rest is built on')
      .toBeCloseTo(noiseDbm(width) - nf - ten * Math.log10(width * 1e6), 2)
    // 「每赫兹 −174 dBm」 and 「本仿真器取 7 dB」, where `sources` says them again
    for (const v of everyFig(/每赫兹 −(\d+) dBm/g, 'the per-hertz term', 1)) {
      expect(val(v), 'the same term').toBe(perHz)
    }
    for (const v of everyFig(/本仿真器取 (\d+) dB|噪声系数取 (\d+) dB/g, 'the noise figure', 2)) {
      expect(val(v), 'the engine’s own noise figure').toBe(NOISE_FIGURE_DB)
    }
    // 「标准自己的灵敏度表假设的是 10 dB」: a figure about the standard, and what is checkable
    // here is the comparison it is made for — this simulator is the quieter receiver.
    const [std] = figs(EVERYWHERE, /灵敏度表假设的是 (\d+) dB/, 'what the standard assumes')
    expect(NOISE_FIGURE_DB, 'and this engine assumes less than that').toBeLessThan(std)
  })

  it('the five widths, their five floors, and the doubling between them', () => {
    // The table is transposed: the widths are its head, and its one row is the floors.
    const t = noiseFloor.numbers!.find(
      (b): b is Extract<Block, { kind: 'table' }> =>
        b.kind === 'table' && (b.heading ?? '').includes('各种带宽'))
    expect(t, 'the width table is gone from `numbers`').toBeDefined()
    const widths = t!.head.slice(1).map((h) => figs(h, /(\d+) MHz/, 'a width of the head')[0])
    const floors = t!.rows[0].slice(1)
    expect(floors, 'a floor for every width in the head').toHaveLength(widths.length)
    widths.forEach((w, i) => {
      same(floors[i].replace(' dBm', ''), noiseDbm(w), `the floor at ${w} MHz`)
    })
    expect(widths.slice(1).map((w, i) => w / widths[i]),
      'every column is twice the width of the one before it').toEqual(widths.slice(1).map(() => 2))
    // 「收进来的噪声就多一倍，也就是多 3.01 dB」
    same(raw(EVERYWHERE, /也就是多 ([\d.]+) dB/, 'what a doubling adds')[0],
      noiseDbm(2 * widths[0]) - noiseDbm(widths[0]), 'the cost of one doubling')
    // 「接收 160 MHz 就收进 20 MHz 的八倍」, and the 9.03 dB that costs
    const [wide, narrow] = figs(EVERYWHERE, /接收 (\d+) MHz 就收进 (\d+) MHz 的八倍/,
      'the two widths `picture` compares')
    expect(wide / narrow, 'eight times the bandwidth').toBe(8)
    for (const v of everyFig(/正好少 ([\d.]+) dB|八倍——([\d.]+) dB，SNR 正好掉这/g,
      'what eight times the bandwidth costs', 2)) {
      same(v, noiseDbm(wide) - noiseDbm(narrow), 'the cost of going that wide')
    }
  })

  it('the four places: the level, the one floor under all of them, and the ratio', () => {
    const t = noiseFloor.numbers!.find(
      (b): b is Extract<Block, { kind: 'table' }> =>
        b.kind === 'table' && (b.heading ?? '').includes('四个位置'))
    expect(t, 'the four-place table is gone').toBeDefined()
    expect(t!.rows, 'it still has its four places').toHaveLength(PRIMER_DISTANCES.length)
    t!.rows.forEach((r, i) => {
      const d = PRIMER_DISTANCES[i]
      expect(figs(r[0], /，(\d+) m/, `row ${i + 1}: the distance`)[0],
        `row ${i + 1}: the distance this variant puts the laptop at`).toBe(d)
      expect(/砖墙/.test(r[0]), `row ${i + 1}: 「砖墙」 exactly when the ray crosses one`)
        .toBe(wallsFor(d).length > 0)
      const lb = budgetAt(d)
      same(r[1].replace(' dBm', ''), lb.rssiDbm, `row ${i + 1}: what arrives`)
      same(r[2].replace(' dBm', ''), lb.noiseDbm, `row ${i + 1}: the floor under it`)
      same(r[3].replace(' dB', ''), lb.snrDb, `row ${i + 1}: and the ratio between them`)
    })
    // 「信号高出地板的那一截，依次是 62.3、41.3、21.7、15.9 dB」 — `picture` restates all four
    const four = raw(EVERYWHERE,
      /依次是 ([\d.]+)、([\d.]+)、([\d.]+)、([\d.]+) dB/, '`picture` restating the four ratios')
    PRIMER_DISTANCES.forEach((d, i) => same(four[i], budgetAt(d).snrDb, `${d} m: the ratio`))
    // 「四个变体的信道始终是 20 MHz，所以地板自始至终没动过」
    for (const v of everyFig(/信道始终是 (\d+) MHz/g, 'the width every scene runs at', 1)) {
      for (const s of noiseFloor.variants!.map((x) => x.scenario())) {
        for (const nd of s.nodes) expect(nd.caps.widthMhz, 'every radio at that width').toBe(val(v))
      }
    }
  })

  it('the neighbour: added as power, not as decibels, mantissa for mantissa', () => {
    const steps = noiseFloor.numbers!.find(
      (b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!
    const floor = noiseDbm(WIDTH)
    const sig = budgetAt(9).rssiDbm
    // step 1 and 2: the floor at this width, and the ratio over it
    const [w1, f1] = figs(steps.items.join('\n'), /(\d+) MHz 下是 −([\d.]+) dBm/,
      'the floor the steps start from')
    same(`-${f1}`, noiseDbm(w1), 'that floor')
    const [lvl, f2, snr] = raw(steps.items.join('\n'),
      /是 −([\d.]+) − \(−([\d.]+)\) = ([\d.]+) dB/, 'the ratio the second step takes')
    same(`-${lvl}`, sig, 'the level the living-room laptop arrives at')
    same(`-${f2}`, floor, 'over the floor')
    same(snr, sig - floor, 'and the ratio between them')
    // step 3: the two powers in milliwatts and their sum — the mantissas and the base of each
    const [m1, t1, m2, t2, m3, t3, raised] = raw(EVERYWHERE,
      /([\d.]+) × (\d+)⁻¹⁰ mW 加 ([\d.]+) × (\d+)⁻⁹ mW 是 ([\d.]+) × (\d+)⁻⁹ mW，也就是 −([\d.]+) dBm/,
      'the sum, in milliwatts')
    expect([val(t1), val(t2), val(t3)], 'all three written as powers of ten')
      .toEqual([10, 10, 10])
    same(m1, mw(floor) * 1e10, 'the floor in units of 10⁻¹⁰ mW')
    same(m2, mw(NEIGHBOUR_DBM) * 1e9, 'the neighbour in units of 10⁻⁹ mW')
    same(m3, (mw(floor) + mw(NEIGHBOUR_DBM)) * 1e9, 'and their sum')
    same(`-${raised}`, dbm(mw(floor) + mw(NEIGHBOUR_DBM)), 'which is the raised floor')
    // step 4: the ratio over the raised floor, and how much it costs
    const [lvl2, raised2, sinr] = raw(EVERYWHERE,
      /就是 SINR：−([\d.]+) − \(−([\d.]+)\) = ([\d.]+) dB/, 'the SINR the fourth step takes')
    same(`-${lvl2}`, sig, 'the same level')
    same(`-${raised2}`, dbm(mw(floor) + mw(NEIGHBOUR_DBM)), 'over the raised floor')
    same(sinr, sig - dbm(mw(floor) + mw(NEIGHBOUR_DBM)), 'and the ratio')
    for (const v of everyFig(/比刚才少 ([\d.]+) dB|一次就拿走 ([\d.]+) dB/g,
      'what one neighbour costs', 2)) {
      same(v, (sig - floor) - (sig - dbm(mw(floor) + mw(NEIGHBOUR_DBM))), 'the loss it causes')
    }
    // every 「−85 dBm」 is that same neighbour
    for (const v of everyFig(/邻居以 −(\d+) dBm|−(\d+) dBm 的邻居|邻居 −(\d+) dBm|SINR。−(\d+) dBm/g,
      'the neighbour’s level', 4)) {
      expect(-val(v), 'the neighbour this lesson adds').toBe(NEIGHBOUR_DBM)
    }
    expect(NEIGHBOUR_DBM, 'and it is louder than the floor, which is why it dominates')
      .toBeGreaterThan(floor)
  })

  it('`deeper`: two equal neighbours, and the decibels that must not be added', () => {
    // Two of these sentences are `items` of a list block, not the `text` of a paragraph.
    const deep = (noiseFloor.deeper ?? [])
      .map((b) => [b.heading ?? '', 'text' in b ? b.text : '',
        'items' in b ? b.items.join('\n') : ''].join('\n')).join('\n')
    const floor = noiseDbm(WIDTH)
    // 「噪声 −93.99 dBm = 3.99 × 10⁻¹⁰ mW，邻居 −85 dBm = 3.16 × 10⁻⁹ mW，和是 3.56 × 10⁻⁹ mW
    //  = −84.48 dBm。较强的那一项占主导，噪声只让它多了 0.52 dB」
    const [f, fm, nb, nm, sum, sm] = raw(deep,
      /噪声 −([\d.]+) dBm = ([\d.]+) × 10⁻¹⁰ mW，邻居 −(\d+) dBm = ([\d.]+) × 10⁻⁹ mW，和是 ([\d.]+) × 10⁻⁹ mW = −([\d.]+) dBm/,
      '`deeper` on the same sum')
    same(`-${f}`, floor, 'the floor')
    same(fm, mw(floor) * 1e10, 'in milliwatts')
    expect(-val(nb), 'the neighbour').toBe(NEIGHBOUR_DBM)
    same(nm, mw(NEIGHBOUR_DBM) * 1e9, 'in milliwatts')
    same(sum, (mw(floor) + mw(NEIGHBOUR_DBM)) * 1e9, 'their sum')
    same(`-${sm}`, dbm(mw(floor) + mw(NEIGHBOUR_DBM)), 'and the sum in dBm')
    same(raw(deep, /噪声只让它多了 ([\d.]+) dB/, 'what the noise adds to the louder term')[0],
      dbm(mw(floor) + mw(NEIGHBOUR_DBM)) - NEIGHBOUR_DBM, 'the little the floor adds')
    // 「两个同为 −85 dBm 的邻居是两倍功率，即 +3.01 dB：−81.99 dBm，而不是 −170」
    const [two, plus, both, never] = figs(deep,
      /两个同为 −(\d+) dBm 的邻居是两倍功率，即 \+([\d.]+) dB：−([\d.]+) dBm，而不是 −(\d+)/,
      '`deeper` on two equal neighbours')
    expect(-two, 'two of the same neighbour').toBe(NEIGHBOUR_DBM)
    same(String(plus), dbm(2 * mw(NEIGHBOUR_DBM)) - NEIGHBOUR_DBM, 'twice the power')
    same(`-${both}`, dbm(2 * mw(NEIGHBOUR_DBM)), 'and where that lands')
    expect(never, 'while adding the decibels would land nowhere real').toBe(2 * -NEIGHBOUR_DBM)
    // 「20 MHz 上还能用第 3 级，换到 160 MHz 只剩 12.6 dB」
    const [narrow, mcs, wide, left] = figs(deep,
      /(\d+) MHz 上还能用第 (\d+) 级[^]*?换到 (\d+) MHz 只剩 ([\d.]+) dB/,
      '`deeper` on what the wider channel costs')
    same(String(left), budgetAt(9, wide).snrDb, `the ratio at ${wide} MHz`)
    expect(budgetAt(9, narrow).mbps, `the rung at ${narrow} MHz`)
      .toBe(mcsRateMbps('eht', mcs))
  })

  it('`observe`, `tryThis` and the quiz: the exchange, the two experiments, the two answers', () => {
    const obs = noiseFloor.observe.join('\n')
    const floor = noiseDbm(WIDTH)
    // 「从 0 走到 415.2 µs，16 µs 后路由器的确认帧开始，到 459.2 µs 结束」
    const [sifs, end] = figs(obs, /(\d+) µs 后路由器的确认帧（ACK）开始，到 ([\d.]+) µs 结束/,
      '`observe` on the first exchange')
    const recs = variantRecs(2)
    const data = txs(recs, 'sta-1', 'data')[0]
    const ack = txs(recs, 'ap', 'ack')[0]
    expect(sifs * 1000, 'the gap before the answer').toBe(ack.t - (data.t + data.frame.txTimeNs))
    same(String(end), (ack.t + ack.frame.txTimeNs) / 1000, 'and when the answer ends')
    // 「四个变体各跑 100 ms」
    expect(figs(obs, /各跑 (\d+) ms/, 'the window every variant runs for')[0] * MS,
      'the window this file runs them for').toBe(RUN_NS)
    // 「客厅只剩 12.16 dB——比远端墙边独享空口的 15.9 dB 还低」
    const [withNeighbour, farWall] = raw(obs,
      /客厅只剩 ([\d.]+) dB——比远端墙边独享空口的 ([\d.]+) dB 还低/, 'the comparison it draws')
    same(withNeighbour, budgetAt(9).rssiDbm - dbm(mw(floor) + mw(NEIGHBOUR_DBM)),
      'the living room with a neighbour')
    same(farWall, budgetAt(PRIMER_DISTANCES[3]).snrDb, 'against the far wall with none')
    expect(val(withNeighbour), 'and it really is lower').toBeLessThan(val(farWall))
    // `tryThis` 1: the width moves the floor and not the level
    const try1 = noiseFloor.tryThis[0]
    const [from, to] = figs(try1, /把带宽从 (\d+) MHz 换到 (\d+) MHz/, 'the two widths')
    same(`-${raw(try1, /停在 −([\d.]+) dBm/, 'the level that does not move')[0]}`,
      budgetAt(9).rssiDbm, 'the level')
    const [was, now] = raw(try1, /地板却从 −([\d.]+) 抬到 −([\d.]+) dBm/, 'the floor that does')
    same(`-${was}`, noiseDbm(from), `the floor at ${from} MHz`)
    same(`-${now}`, noiseDbm(to), `and at ${to} MHz`)
    const [cost, before, after] = raw(try1,
      /SNR 正好少 ([\d.]+) dB：([\d.]+) 掉到 ([\d.]+)。/, 'what that costs the ratio')
    same(cost, noiseDbm(to) - noiseDbm(from), 'the cost')
    same(before, budgetAt(9, from).snrDb, 'the ratio before')
    same(after, budgetAt(9, to).snrDb, 'and after')
    // `tryThis` 2: the distance moves the level and not the floor
    const try2 = noiseFloor.tryThis[1]
    const [at20, from2, to2] = figs(try2, /把带宽调回 (\d+) MHz，再把距离从 (\d+) m 拉到 (\d+) m/,
      'the width it goes back to, and the two distances')
    expect(at20, 'the width the scene runs at').toBe(WIDTH)
    same(`-${raw(try2, /接收电平掉到 −([\d.]+) dBm/, 'where the level lands')[0]}`,
      budgetAt(to2).rssiDbm, 'the level at the far wall')
    same(raw(try2, /SNR ([\d.]+) dB：地板只跟带宽走/, 'the ratio that is left')[0],
      budgetAt(to2).snrDb, 'the ratio')
    expect(noiseDbm(WIDTH), '「地板一点没动」').toBe(budgetAt(from2).noiseDbm)
    // the quiz: the level, the neighbour, both answers, and the width question
    const quiz = noiseFloor.quiz.map((q) => [q.q, ...q.options, q.explain].join('\n')).join('\n')
    same(`-${raw(quiz, /笔记本（−([\d.]+) dBm）/, 'the level the quiz starts from')[0]}`,
      budgetAt(9).rssiDbm, 'the level')
    same(raw(quiz, /还是 ([\d.]+) dB：别人的帧是信号/, 'the wrong answer’s own figure')[0],
      budgetAt(9).snrDb, 'the ratio without the neighbour')
    same(raw(quiz, /约 ([\d.]+) dB：邻居叠到了噪声地/, 'the right answer’s')[0],
      budgetAt(9).rssiDbm - dbm(mw(floor) + mw(NEIGHBOUR_DBM)), 'and with it')
    const [qNarrow, qWide] = figs(quiz, /信道从 (\d+) MHz 换成 (\d+) MHz/, 'the quiz’s two widths')
    for (const v of everyFig(/升高约 (\d+) dB/g, 'how far the floor rises', 2)) {
      expect(val(v), 'to the decibel').toBe(Math.round(noiseDbm(qWide) - noiseDbm(qNarrow)))
    }
    same(`-${raw(quiz, /dB 到 −([\d.]+) dBm/, 'where it rises to')[0]}`, noiseDbm(qWide),
      `the floor at ${qWide} MHz`)
  })

  /**
   * **The first pass left six sites unread, and four of them were the same two mistakes.**
   *
   *  - **a width the engine will answer about anyway.** 「20 MHz 上还能用第 3 级」 and the quiz's
   *    own 「信道从 20 MHz 换成 160 MHz」 were read by handing the figure to `noiseDbm`, which
   *    answers for 21 MHz as readily as for 20 — the floor moves a little, the rung does not, and
   *    the planting passes. A width is one of five values in this engine, and the lesson prints
   *    that list itself, so every 「N MHz」 is read against it.
   *  - **a distance where the claim is that nothing moved.** 「再把距离从 9 m 拉到 14 m，地板一点
   *    没动」 — the floor is the same at every distance, so the figure could be anything. What
   *    makes 9 the right one is that it is one of this lesson's four places.
   *  - the quiz's own floor and its own nine decibels, which the reads above take from `numbers`
   *    and `tryThis` but not from the quiz.
   *
   * 「标准自己的灵敏度表假设的是 10 dB」 stays unread: it is the standard's assumption, this
   * repository has no corpus for it, and what the sentence is FOR is the comparison — this
   * simulator's receiver is the quieter one — which is what the assertion above checks.
   */
  it('the five widths, the floor and the nine decibels, at every one of their sites', () => {
    const t = noiseFloor.numbers!.find(
      (b): b is Extract<Block, { kind: 'table' }> =>
        b.kind === 'table' && (b.heading ?? '').includes('各种带宽'))!
    const legal = t.head.slice(1).map((h) => figs(h, /(\d+) MHz/, 'a width of the head')[0])
    // the lookbehind keeps 「2.03125 MHz」 (the selectivity bin, pinned above) out of this
    for (const v of everyFig(/(?<![\d.])(\d+) MHz/g, 'a channel width', 8)) {
      expect(legal, `${v} MHz is one of the widths this engine has a floor for`)
        .toContain(val(v))
    }
    // 「再把距离从 9 m 拉到 14 m」: both are places this lesson has a variant for
    const [, from, to] = figs(noiseFloor.tryThis[1],
      /把带宽调回 (\d+) MHz，再把距离从 (\d+) m 拉到 (\d+) m/, 'the two distances')
    for (const d of [from, to]) {
      expect([...PRIMER_DISTANCES], `${d} m is one of this lesson’s four places`).toContain(d)
    }
    expect(budgetAt(from).rssiDbm, 'and the level really falls between them')
      .toBeGreaterThan(budgetAt(to).rssiDbm)
    // the quiz's own floor, and its own nine decibels (the wrong answer moves them the other way)
    for (const v of everyFig(/远高于 −([\d.]+) dBm 的地板/g, 'the floor the quiz compares with', 1)) {
      same(`-${v}`, noiseDbm(WIDTH), 'the floor')
    }
    const [narrow, wide] = figs(
      noiseFloor.quiz.map((q) => [q.q, ...q.options, q.explain].join('\n')).join('\n'),
      /信道从 (\d+) MHz 换成 (\d+) MHz/, 'the two widths the quiz moves between')
    for (const v of everyFig(/下降约 (\d+) dB，地板不变/g, 'the wrong answer’s own figure', 1)) {
      expect(val(v), 'the same nine decibels, moved onto the wrong quantity')
        .toBe(Math.round(noiseDbm(wide) - noiseDbm(narrow)))
    }
  })
})
