/**
 * Every empirical claim in "Close in: what collapses is the rate" — the second
 * half of `bianchi-vs-sim`, added by the 2026-09-25 re-pacing.
 *
 * It loads its parent's scene and its two variants rather than declaring any of
 * its own, so `lessonShapeSuite(..., { sameSceneAs: 'bianchi-vs-sim' })` proves
 * the two ids replay the same timeline and the fixture lines it needs are copies
 * rather than new runs.
 *
 * These pins moved here from tests/course/bianchi-vs-sim.test.ts with the
 * sentences that carry them: the 54 Mb/s ceiling and 57.8 dB of SNR, the rate
 * histogram, the alibi table, and 5.534 against the model's 29.52. What is new is
 * the lesson's last step, which is its whole argument as arithmetic: reprice T_s
 * and T_c with the run's own mean data time and the model lands 0.24 % from the
 * measurement, with no free parameter introduced.
 *
 * The lesson is not registered in src/course/lessons.ts yet — the controller does
 * that when the batch lands — so the contract tests that walk LESSONS cannot see
 * it. The terminology rule is therefore re-run here over this one lesson, with the
 * same helpers tests/course/readability.test.ts uses.
 */
import { describe, it, expect } from 'vitest'
import { rateVsModel } from '../../src/course/tier1/rate-vs-model'
import { bianchiVsSim, bianchiVsSimJumps, bianchiVsSimVariants } from '../../src/course/tier1/bianchi-vs-sim'
import { dcfTimes, saturationThroughput, solveBianchi } from '../../src/course/tier1/bianchiModel'
import { MODULES, trackOf } from '../../src/course/curriculum'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import type { Scenario } from '../../src/model/scenario'
import {
  ACK_TIMEOUT_NS, DIFS_NS, SIFS_NS, SLOT_NS, dataRateFor, noiseDbm,
} from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'
import { lessonShapeSuite } from './kit'
import type { Block } from '../../src/course/lessonKit'
import {
  ZH_TERMS, cellTexts, paragraphTexts, bracketedAtFirstZhUse, zhAkaViolations, zhTermFailure,
} from '../../src/course/readability'

const SECS = 10
const RUN_NS = SECS * 1e9
const PAYLOAD_BITS = 12_000
const PARAMS = { W: 16, m: 6, attempts: 7 } as const

interface Stats {
  records: TLRecord[]
  attempts: number
  collided: number
  p: number
  acks: number
  mbps: number
  dataAirNs: number
  meanDataNs: number
  rateMix: Map<number, number>
}

const memo = new Map<string, Stats>()

function measure(key: string, scenario: Scenario): Stats {
  const hit = memo.get(key)
  if (hit) return hit
  const records = [...new Simulation(scenario).runUntil(RUN_NS).records]
  const rateMix = new Map<number, number>()
  let attempts = 0
  let collided = 0
  let acks = 0
  let dataAirNs = 0
  for (const r of records) {
    if (r.type === 'TX_START' && r.frame.kind === 'data') {
      attempts++
      dataAirNs += r.frame.txTimeNs
      rateMix.set(r.frame.mbps, (rateMix.get(r.frame.mbps) ?? 0) + 1)
    } else if (r.type === 'TX_START' && r.frame.kind === 'ack') acks++
    else if (r.type === 'RETRY') collided++
  }
  const out: Stats = {
    records, attempts, collided, p: collided / attempts, acks,
    mbps: (acks * PAYLOAD_BITS) / SECS / 1e6,
    dataAirNs, meanDataNs: dataAirNs / attempts, rateMix,
  }
  memo.set(key, out)
  return out
}

/** The lesson's own base scene (close in) and its first variant (the arc at n = 5). */
const near = (): Stats => measure('near', rateVsModel.scenario())
const arc5 = (): Stats => measure('arc5', rateVsModel.variants![0].scenario())

const pct = (x: number, d = 2): string => `${(100 * x).toFixed(d)} %`
const cell = (heading: string, row: number, col: number): string => {
  const t = rateVsModel.numbers!.find(
    (b) => b.kind === 'table' && b.heading === heading,
  ) as Extract<Block, { kind: 'table' }>
  return t.rows[row][col]
}

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
lessonShapeSuite(rateVsModel, { sameSceneAs: 'bianchi-vs-sim', runNs: RUN_NS })

describe('rate-vs-model · the lesson itself', () => {
  it('is the second half of the comparison, in the model module, behind its own first half', () => {
    expect(rateVsModel.id).toBe('rate-vs-model')
    expect(MODULES[rateVsModel.module].title).toBe('在纸上预测 DCF')
    expect(rateVsModel.needs).toEqual(['bianchi-vs-sim', 'anomaly'])
    // `capture` and `residual` stay with the first half; `rate control` is named again
    // here because a reader may open this lesson cold, and CARA is the pointer §2 asks for.
    expect(rateVsModel.terms!.map((t) => t.term)).toEqual(['rate control', 'CARA'])
    expect(rateVsModel.observe.length).toBe(2)
    expect(rateVsModel.tryThis.length).toBe(2)
    for (const q of rateVsModel.quiz) {
      expect(q.answer).toBeGreaterThanOrEqual(0)
      expect(q.answer).toBeLessThan(q.options.length)
    }
  })

  it('loads bianchi-vs-sim’s own scene, variant array and jumps, object for object', () => {
    expect(() => ScenarioSchema.parse(rateVsModel.scenario())).not.toThrow()
    expect(rateVsModel.scenario()).toEqual(bianchiVsSim.scenario())
    expect(rateVsModel.variants).toBe(bianchiVsSimVariants)
    expect(rateVsModel.jumps).toBe(bianchiVsSimJumps)
    // the scene cannot be divided, so both halves list the same two variants
    expect(rateVsModel.variants!.length).toBe(2)
  })

  // §4 gives this lesson no figure: 「不在场证明是一张三列表」. The two tables are the lesson.
  it('carries no diagram and exactly one procedure', () => {
    const blocks = [...rateVsModel.picture!, ...rateVsModel.numbers!]
    expect(blocks.filter((b) => b.kind === 'diagram').length).toBe(0)
    expect(blocks.filter((b) => b.kind === 'steps').length).toBe(1)
    expect(rateVsModel.numbers!.filter((b) => b.kind === 'table').length).toBe(2)
  })
})

describe('rate-vs-model · the close-in link, and the five-fold miss', () => {
  it('the link carries the top rung: −36.215 dBm, 57.8 dB of SNR, a 54 Mb/s ceiling', () => {
    const scen = rateVsModel.scenario()
    const table = buildLinkTable(scen.nodes, scen.walls)
    const level = table.get('sta-1')!.get('ap')!
    expect(level.toFixed(3)).toBe('-36.215')
    expect(level - noiseDbm(20)).toBeCloseTo(57.8, 1)
    expect(dataRateFor(level)).toBe(54)
  })

  it('29.52 Mb/s on paper against 5.534 measured — a factor of five', () => {
    // 「模型说 29.52 Mb/s，实跑给出 5.53」 and the alibi table's second row
    const t54 = dcfTimes(1500, 54)
    const { tau } = solveBianchi({ n: 5, ...PARAMS })
    const model = saturationThroughput({ n: 5, tau, slotNs: SLOT_NS, tsNs: t54.tsNs, tcNs: t54.tcNs, payloadBits: PAYLOAD_BITS })
    expect(model.mbps.toFixed(2)).toBe('29.52')
    expect(near().mbps.toFixed(3)).toBe('5.534')
    expect(model.mbps / near().mbps).toBeGreaterThan(5)
    expect(cell('同样五台站点，挪到近处', 1, 0)).toBe('吞吐：5.534 Mb/s')
    expect(cell('同样五台站点，挪到近处', 1, 2)).toBe('29.52 Mb/s')
  })

  it('the alibi: 26.17 % close in, 25.84 % on the arc, both near the model’s 27.22 %', () => {
    expect(pct(near().p)).toBe('26.17 %')
    expect(pct(arc5().p)).toBe('25.84 %')
    expect(pct(solveBianchi({ n: 5, ...PARAMS }).p)).toBe('27.22 %')
    for (const p of [near().p, arc5().p]) {
      expect(Math.abs(p - solveBianchi({ n: 5, ...PARAMS }).p)).toBeLessThan(0.015)
    }
    expect(cell('同样五台站点，挪到近处', 0, 0)).toBe('碰撞：26.17 %')
  })

  /**
   * Step 2 of the procedure, and the pin that decided where `anomaly`'s capture
   * material could go. Batch 4 parked three capture pins in
   * tests/course/anomaly.test.ts for this file to take (§7 sends the material here);
   * they stayed there, because they are measured off `anomaly`'s 40 dB near/far pair
   * and this scene has no capture in it to measure. The mechanism went to
   * `tier1-project-review`, whose flat spans 34.4 dB and whose run rescues 46 % of
   * the losers; this test is the counter-fact that made that the right home.
   */
  it('and the retry rate really is the collision rate here: no frame is ever captured', () => {
    // Every station sits on the same 1 m circle, so the access point locks nothing
    // during an overlap and every destroyed frame comes back.
    const misses = near().records.filter((r) => r.type === 'RX_MISS' && r.node === 'ap').length
    expect([misses, near().collided]).toEqual([1635, 1635])
    expect(near().records.some((r) => r.type === 'RX_FAIL' && r.node === 'ap')).toBe(false)
  })
})

describe('rate-vs-model · the histogram is the mechanism', () => {
  const ROWS: [number, number, string, number][] = [
    [54, 69, '1.1 %', 248],
    [48, 96, '1.5 %', 276],
    [36, 163, '2.6 %', 364],
    [24, 136, '2.2 %', 532],
    [18, 165, '2.6 %', 704],
    [12, 518, '8.3 %', 1044],
    [9, 869, '13.9 %', 1384],
    [6, 4232, '67.7 %', 2064],
  ]

  it('all 6,248 frames of the run are in the table, row for row', () => {
    const s = near()
    expect(s.attempts).toBe(6248)
    expect(s.rateMix.size).toBe(ROWS.length)
    let sum = 0
    for (const [i, [mbps, count, share, dataUs]] of ROWS.entries()) {
      expect(s.rateMix.get(mbps), `${mbps} Mb/s`).toBe(count)
      expect(`${(100 * count / s.attempts).toFixed(1)} %`, `${mbps} Mb/s share`).toBe(share)
      expect(dcfTimes(1500, mbps).dataNs / 1000, `${mbps} Mb/s airtime`).toBe(dataUs)
      // the table prints the same three figures, in the same order
      expect(cell('这十秒里，6248 帧各走了哪一级', i, 1)).toBe(String(count))
      expect(cell('这十秒里，6248 帧各走了哪一级', i, 2)).toBe(share)
      expect(cell('这十秒里，6248 帧各走了哪一级', i, 3)).toBe(`${dataUs} µs`)
      sum += count
    }
    expect(sum).toBe(s.attempts)
  })

  it('two thirds of the frames sit on the bottom rung and 1.1 % on the ceiling', () => {
    // 「三分之二的帧掉到了最慢的一级」 and 「只有 1.1% 的帧用上了它」
    const s = near()
    expect(s.rateMix.get(6)! / s.attempts).toBeGreaterThan(2 / 3)
    expect(s.rateMix.get(54)! / s.attempts).toBeLessThan(0.02)
    // while the arc allows exactly one rate, which is what pins its frame length
    expect([...arc5().rateMix.keys()]).toEqual([6])
    expect(arc5().meanDataNs).toBe(dcfTimes(1500, 6).dataNs)
  })

  it('the first excursion is at 7.661 ms, as the observation says', () => {
    const data = near().records.filter((r) => r.type === 'TX_START' && r.frame.kind === 'data')
    const first = data.find((r) => r.type === 'TX_START' && r.frame.mbps < 54)!
    expect(first.t).toBe(7_661_000)
    // and the run opens on the ceiling: the ladder is walked down, not started low
    expect(data.slice(0, 5).every((r) => r.type === 'TX_START' && r.frame.mbps === 54)).toBe(true)
  })
})

/**
 * The lesson's payoff, and the reason the split earns its keep: the model is not
 * wrong about contention, it was handed a wrong price. Replacing ONE input — the
 * frame's airtime — with the run's own mean puts the prediction within a quarter
 * of a per cent, and nothing else is touched.
 */
describe('rate-vs-model · repricing is not fitting', () => {
  it('the mean data frame is 1723.7 µs against the assumed 248', () => {
    expect((near().meanDataNs / 1000).toFixed(1)).toBe('1723.7')
    expect(dcfTimes(1500, 54).dataNs / 1000).toBe(248)
    expect(cell('同样五台站点，挪到近处', 2, 0)).toBe('平均帧长：1723.7 µs')
    expect(cell('同样五台站点，挪到近处', 2, 2)).toBe('按假设 248 µs')
  })

  it('repriced with it, the model gives 5.547 against a measured 5.534 — 0.24 % apart', () => {
    const s = near()
    const { tau } = solveBianchi({ n: 5, ...PARAMS })
    // only the frame changes: the SIFS, the ACK and the DIFS are the arc's own three terms
    const ackNs = dcfTimes(1500, 6).ackNs
    const tsNs = s.meanDataNs + SIFS_NS + ackNs + DIFS_NS
    const tcNs = s.meanDataNs + ACK_TIMEOUT_NS + DIFS_NS
    const repriced = saturationThroughput({ n: 5, tau, slotNs: SLOT_NS, tsNs, tcNs, payloadBits: PAYLOAD_BITS })
    expect(repriced.mbps.toFixed(3)).toBe('5.547')
    expect((100 * Math.abs(repriced.mbps - s.mbps) / s.mbps).toFixed(2)).toBe('0.24')
    // no free parameter: τ is the SAME fixed point the first half solved, untouched
    expect(tau.toFixed(4)).toBe('0.0763')
  })

  it('the experiment’s two-scene comparison: 5.534 close in against 4.717 on the arc', () => {
    expect(near().mbps.toFixed(3)).toBe('5.534')
    expect(arc5().mbps.toFixed(3)).toBe('4.717')
    // nine times the link rate buys 17 % more throughput, which is the line to write down
    expect(near().mbps / arc5().mbps).toBeLessThan(1.2)
    expect(dcfTimes(1500, 6).dataNs / dcfTimes(1500, 54).dataNs).toBeGreaterThan(8)
  })
})

/**
 * The terminology rule, re-run over this one unregistered lesson: every official
 * term carries its standard English name, and its abbreviation where the standard
 * has one, at its first Chinese use. The text and its order are exactly what
 * tests/course/readability.test.ts reads — `why`, `outcomes`, `picture`,
 * `numbers`, `observe`, `tryThis`, `quiz` — with `deeper` and `sources` left out.
 */
describe('rate-vs-model · every official term carries its English name', () => {
  const zh = [rateVsModel.why!, ...rateVsModel.outcomes!]
    .concat(paragraphTexts(rateVsModel.picture!), cellTexts(rateVsModel.picture!))
    .concat(paragraphTexts(rateVsModel.numbers!), cellTexts(rateVsModel.numbers!))
    .concat(rateVsModel.observe, rateVsModel.tryThis, rateVsModel.quiz.flatMap((q) => [q.q, ...q.options, q.explain]))
    .join(' ')
  const rows = ZH_TERMS.filter((t) => !t.track || t.track === trackOf(rateVsModel))

  it('brackets every official term at its first Chinese use', () => {
    const out: string[] = []
    for (const t of rows) {
      const why = zhTermFailure(zh, t)
      if (why) out.push(why)
      out.push(...zhAkaViolations(zh, t))
    }
    expect(out).toEqual([])
  })

  it('had its terminology actually graded', () => {
    expect(rows.filter((t) => bracketedAtFirstZhUse(zh, t) !== null).length).toBeGreaterThanOrEqual(2)
  })
})
