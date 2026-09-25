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
/** The "One floor, four places" table: RSSI, the floor, and the SNR between them. */
const TABLE = [
  { rssi: '-31.7', snr: '62.3' },
  { rssi: '-52.7', snr: '41.3' },
  { rssi: '-72.3', snr: '21.7' },
  { rssi: '-78.1', snr: '15.9' },
]

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
