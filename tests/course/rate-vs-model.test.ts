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
import { COURSE_ORDER, MODULES, trackOf } from '../../src/course/curriculum'
import { LESSONS } from '../../src/course/lessons'
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

/**
 * **The ruler for this lesson's `until: 'fading'` (added 2026-10-05 by slice 4e's fix 2).**
 *
 * One of the three sites whose source test file mentioned its target nowhere when
 * `tests/course/limits.test.ts` started requiring it. The check is weak by design — it cannot
 * tell a ruler from a passing mention — but the requirement had been prose until then, and
 * prose had already been missed three times in a day.
 *
 * This lesson is on BOTH sides of the field, which is worth stating in one place: two other
 * limits here point at it with `seeAlso` (`anomaly`'s two, `mcs-ladder`'s engine half), because
 * this lesson goes deeper into the two-counter controller without removing it; and its own
 * single-cause limit points at `fading` with `until`, because that one really is lifted. The
 * difference is exactly criterion A's: what another lesson can change is the scene, never the
 * engine.
 */
describe('rate-vs-model · the single-cause limit, and the lesson that adds the other cause', () => {
  const lim = rateVsModel.limits.find((l) => l.until === 'fading')

  it('promises a lift, on the kind that a lift is coherent about', () => {
    expect(lim, 'the single-cause limit no longer points at `fading`').toBeDefined()
    expect(lim!.kind).toBe('out-of-scope')
    expect(lim!.seeAlso).toBeUndefined()
    // the claim being qualified: every downshift here is caused by collision, by construction
    expect(lim!.text).toContain('这正是本课要的干净实验')
    expect(lim!.text).toContain('那时这张速率直方图就不再是单一成因的了')
  })

  it('and the axis is a top-level scenario section, absent here and written there', () => {
    const own = [rateVsModel.scenario(), ...(rateVsModel.variants ?? []).map((v) => v.scenario())]
    expect(own.length).toBeGreaterThan(1)
    for (const [i, sc] of own.entries()) {
      expect(sc.fading, `rate-vs-model scene ${i} writes a fading section`).toBeUndefined()
    }
    const target = LESSONS.find((l) => l.id === 'fading')!
    const theirs = [target.scenario(), ...(target.variants ?? []).map((v) => v.scenario())]
    expect(theirs.filter((sc) => sc.fading !== undefined).length).toBeGreaterThan(1)
    expect(COURSE_ORDER.indexOf('fading')).toBeGreaterThan(COURSE_ORDER.indexOf('rate-vs-model'))
  })

  it('and this lesson is also the target of three `seeAlso`s, which it restates rather than lifts', () => {
    const pointers = LESSONS.flatMap((l) => l.limits
      .filter((x) => x.seeAlso === 'rate-vs-model').map(() => l.id))
    expect(pointers.sort()).toEqual(['anomaly', 'anomaly', 'mcs-ladder'])
    // and it makes no onward promise of its own beyond the `fading` one
    expect(rateVsModel.limits.filter((l) => l.seeAlso)).toHaveLength(0)
    expect(rateVsModel.limits.filter((l) => l.until)).toHaveLength(1)
  })
})
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * The two tables above are already read out of the lesson — `cell()` is what this file compares
 * its counts against — so what the sampling sweep of 2026-10-12 found unread was the **prose**:
 * five of the six figures it planted went unnoticed, and every one of them was in a sentence
 * rather than in a cell. Here each of those is parsed out of the shipped string and compared with
 * the same measurement the cells are compared with.
 *
 * **The reads worth naming:**
 *
 *  - **the same quantity is read at every precision the lesson prints it to.** 「29.5」 in `why`,
 *    「29.52」 in `picture` and in `tryThis` are one number at two roundings, and the read uses the
 *    decimals each sentence shows rather than one canonical form.
 *  - **the replaced input is read as the replacement**: the measured mean airtime goes into
 *    `dcfTimes`' two times, the fixed point is solved again, and the result has to be the figure
 *    the lesson prints — which is what makes 「这不是调参数」 checkable rather than rhetorical.
 *  - **「三分之二」 and 「五分之一」 are read as the ratios they name**, so the words carry the
 *    same weight as the digits beside them.
 */
describe('rate-vs-model · every figure the prose prints, read back out of it', () => {
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
  const WHY = [rateVsModel.why!, ...rateVsModel.outcomes!].join('\n')
  const PIC = blockText(rateVsModel.picture)
  const NUMS = blockText(rateVsModel.numbers)
  const DEEP = blockText(rateVsModel.deeper)
  const LIM = blockText(rateVsModel.limits)
  const SRC = blockText(rateVsModel.sources)
  const OBS = blockText(rateVsModel.observe)
  const TRY = blockText(rateVsModel.tryThis)
  const QUIZ = blockText(rateVsModel.quiz)

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  /** A printed figure against a measurement, at the precision the lesson prints it to. */
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  /** The model's own prediction at the top rung, which is the figure the lesson opens with. */
  const paperMbps = (): number => {
    const t54 = dcfTimes(1500, 54)
    const { tau } = solveBianchi({ n: 5, ...PARAMS })
    return saturationThroughput({
      n: 5, tau, slotNs: SLOT_NS, tsNs: t54.tsNs, tcNs: t54.tcNs, payloadBits: PAYLOAD_BITS,
    }).mbps
  }
  /**
   * The same fixed point with the run's own mean airtime in place of the assumed one — built the
   * way the lesson's own step says: only the frame changes, and the other three terms are the
   * arc's own (the acknowledgement goes at the slowest rung, as the control-response rule has it).
   */
  const replacedMbps = (): number => {
    const { tau } = solveBianchi({ n: 5, ...PARAMS })
    const measuredNs = near().meanDataNs
    const ackNs = dcfTimes(1500, 6).ackNs
    return saturationThroughput({
      n: 5, tau, slotNs: SLOT_NS, payloadBits: PAYLOAD_BITS,
      tsNs: measuredNs + SIFS_NS + ackNs + DIFS_NS,
      tcNs: measuredNs + ACK_TIMEOUT_NS + DIFS_NS,
    }).mbps
  }
  const snrDb = (): number => {
    const scen = rateVsModel.scenario()
    const level = buildLinkTable(scen.nodes, scen.walls).get('sta-1')!.get('ap')!
    return level - noiseDbm(20)
  }

  it('reads the five-fold miss at both precisions the lesson prints it to', () => {
    // 「纸上的答案说吞吐该有 29.5 Mb/s。实跑只给了 5.5」 (`why`)
    const [paperWhy, runWhy] = figs(WHY, /吞吐该有 ([\d.]+) Mb\/s。实跑只给了 ([\d.]+)/,
      '`why` on the two figures')
    same(String(paperWhy), paperMbps(), '`why`: the model’s own prediction')
    same(String(runWhy), near().mbps, '`why`: and what the run gives')
    // 「模型说 29.52 Mb/s，实跑给出 5.53」 (`picture`) — the same pair, one decimal further
    const [paperPic, runPic] = figs(PIC, /模型说 ([\d.]+) Mb\/s，实跑给出 ([\d.]+)/,
      '`picture` on the same pair')
    same(String(paperPic), paperMbps(), '`picture`: the model’s own prediction')
    same(String(runPic), near().mbps, '`picture`: and what the run gives')
    // 「分歧不是几个百分点，是五倍」 and `why`’s 「快了九倍」
    const [foldCn] = raw(PIC, /是(.)倍——这么大的分歧/, '`picture` on the size of the gap')
    const cn = (s: string): number => '零一二三四五六七八九十'.indexOf(s)
    expect(paperMbps() / near().mbps, 'the ratio the word names')
      .toBeGreaterThanOrEqual(cn(foldCn!))
    // 「近处实跑只交付了预测的约五分之一」 — the quiz says the same thing as a fraction
    const [overCn, underCn] = raw(QUIZ, /只交付了预测的约(.)分之(.)/, 'the quiz on the fraction')
    expect(near().mbps / paperMbps(), 'the fraction the quiz names')
      .toBeCloseTo(cn(underCn!) / cn(overCn!), 1)
  })

  it('reads the alibi, the link and the rungs the colours walk through', () => {
    // 「这个数实测是 26.17%，预测是 27.22%」
    const [measured, predicted] = figs(PIC, /这个数实测是 ([\d.]+)%，预测是 ([\d.]+)%/,
      '`picture` on the alibi')
    same(String(measured), 100 * near().p, 'the collision rate this run really has')
    same(String(predicted), 100 * solveBianchi({ n: 5, ...PARAMS }).p, 'and the model’s own')
    // 「这条链路有 57.8 dB 的信噪比」 — in `numbers` and again in `limits`
    for (const [text, re, what] of [
      [NUMS, /这条链路有 ([\d.]+) dB 的信噪比/, '`numbers` on the link'],
      [LIM, /这条链路有 ([\d.]+) dB 的信噪比/, '`limits` on the same link'],
    ] as [string, RegExp, string][]) {
      same(String(figs(text, re, what)[0]), snrDb(), what)
    }
    // 「五台站点到达接入点的电平完全相同（−36.215 dBm）」
    const [level] = figs(LIM, /电平完全相同（(−[\d.]+) dBm）/, '`limits` on the level')
    const scen = rateVsModel.scenario()
    const table = buildLinkTable(scen.nodes, scen.walls)
    const levels = scen.nodes.filter((n) => n.kind === 'sta')
      .map((n) => table.get(n.id)!.get('ap')!)
    /*
     * 「完全相同」 at the precision the figure is printed to: the five stations sit on one circle
     * and their levels differ in the fourth decimal, so the figure is one of them exactly and
     * the spread between them is read as the width of 「完全相同」.
     */
    /*
     * Against the first station's own level, not against 「any of the five」: they differ in the
     * fourth decimal, so a planted digit would find a station to match if the read were loose.
     */
    same(String(level), table.get('sta-1')!.get('ap')!, 'the level the lesson prints')
    expect(Math.max(...levels) - Math.min(...levels), 'and they really are the same level')
      .toBeLessThan(0.002)
    // 「248 µs、704 µs、2064 µs」 — three rungs' airtimes, in `picture` and two in `observe`
    const three = figs(PIC, /跟着变：(\d+) µs、(\d+) µs、(\d+) µs/, '`picture` on the three lengths')
    const rungOf = (us: number): number => [...near().rateMix.keys()]
      .find((mbps) => dcfTimes(1500, mbps).dataNs / 1000 === us)!
    for (const us of three) {
      expect(rungOf(us), `${us} µs is a rung this run really used`).toBeGreaterThan(0)
    }
    const [fastUs, slowUs] = figs(OBS, /最快那一级 (\d+) µs，最慢那一级 (\d+) µs/,
      '`observe` on the two ends')
    const rungs = [...near().rateMix.keys()].sort((a, b) => a - b)
    expect(dcfTimes(1500, rungs.at(-1)!).dataNs / 1000, 'the fastest rung’s own airtime').toBe(fastUs)
    expect(dcfTimes(1500, rungs[0]!).dataNs / 1000, 'and the slowest').toBe(slowUs)
    // 「第 7.661 ms 上出现第一帧降了档的」
    const [firstMs] = figs(OBS, /第 ([\d.]+) ms 上出现第一帧降了档的/, '`observe` on the first drop')
    const data = near().records.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> =>
      r.type === 'TX_START' && r.frame.kind === 'data')
    const first = data.find((r) => r.frame.mbps < rungs.at(-1)!)!
    same(String(firstMs), first.t / 1e6, 'when the first frame really drops a rung')
  })

  it('reads the replaced input, and the residual it leaves', () => {
    // 「模型给一次成功算的开销，是一帧在最快那一级上的 248 µs。实跑里…平均要占 1723.7 µs」
    const [assumedUs] = figs(PIC, /是一帧在最快那一级上的 (\d+) µs/, '`picture` on the assumption')
    const [meanUs] = figs(PIC, /平均要占 ([\d.]+) µs/, '`picture` on the measurement')
    expect(dcfTimes(1500, 54).dataNs / 1000, 'the airtime the model assumes').toBe(assumedUs)
    same(String(meanUs), near().meanDataNs / 1000, 'and the mean this run really has')
    // the same pair again in `numbers`, and once more in a step
    const [numsAssumed, numsMean] = figs(NUMS, /模型假设的 (\d+) µs，在实跑里是 ([\d.]+) µs/,
      '`numbers` on the same pair')
    expect([numsAssumed, numsMean], 'the same two figures, a second time')
      .toEqual([assumedUs, meanUs])
    const [stepMean, stepAssumed] = figs(NUMS, /这十秒里是 ([\d.]+) µs，而模型假设的是 (\d+)/,
      'the step on the same pair')
    expect([stepMean, stepAssumed], 'and a third time').toEqual([meanUs, assumedUs])
    // 「竞争没变，一帧的空口时间变了七倍」
    const [foldCn] = raw(NUMS, /一帧的空口时间变了(.)倍/, '`numbers` on the growth')
    const cn = (s: string): number => '零一二三四五六七八九十'.indexOf(s)
    expect(Math.round(near().meanDataNs / dcfTimes(1500, 54).dataNs), 'how much longer a frame got')
      .toBe(cn(foldCn!))
    /*
     * 「只把 T_s 里那个帧长换成实测的平均帧长，其余三项照旧，方程给出 5.547 Mb/s，而实测是
     * 5.534——差 0.24%」 — the replacement is performed here, and the three figures are read
     * against it.
     */
    const [replaced, measured, residual] = figs(PIC,
      /方程给出 ([\d.]+) Mb\/s，而实测是 ([\d.]+)——差 ([\d.]+)%/, '`picture` on the replacement')
    same(String(replaced), replacedMbps(), 'the fixed point with the measured airtime in it')
    same(String(measured), near().mbps, 'what the run gives')
    same(String(residual), 100 * Math.abs(replacedMbps() - near().mbps) / near().mbps,
      'and the residual between them')
    // the step and the quiz print the pair again
    const [stepReplaced, stepMeasured] = figs(NUMS, /把新的预测和实测放在一起：([\d.]+) 对 ([\d.]+) Mb\/s/,
      'the step on the comparison')
    expect([stepReplaced, stepMeasured], 'the same two, a second time').toEqual([replaced, measured])
    const [quizReplaced] = figs(QUIZ, /预测就落到 ([\d.]+) Mb\/s/, 'the quiz on the replacement')
    expect(quizReplaced, 'and a third time').toBe(replaced)
    const residuals = [...QUIZ.matchAll(/([\d.]+)% 才是(?:真正的)?残差|还剩 ([\d.]+)%/g)]
      .map((m) => val(m[1] ?? m[2]!))
    expect(residuals.length, 'the quiz names the residual twice').toBeGreaterThanOrEqual(2)
    for (const r of residuals) expect(r, 'and it is the same residual').toBe(residual)
    const [deepResidual] = figs(DEEP, /剩下的 ([\d.]+)% 才是真正的残差/, '`deeper` on the residual')
    expect(deepResidual, 'as is `deeper`’s').toBe(residual)
  })

  it('reads the histogram’s two shares wherever the prose quotes them', () => {
    const s = near()
    const rungs = [...s.rateMix.keys()].sort((a, b) => a - b)
    const topShare = 100 * s.rateMix.get(rungs.at(-1)!)! / s.attempts
    const bottomShare = 100 * s.rateMix.get(rungs[0]!)! / s.attempts
    // 「可只有 1.1% 的帧用上了它；三分之二的帧掉到了最慢的一级」
    const [top] = figs(NUMS, /可只有 ([\d.]+)% 的帧用上了它/, '`numbers` on the top rung’s share')
    same(String(top), topShare, 'the share of frames on the ceiling')
    const [overCn, underCn] = raw(NUMS, /(.)分之(.)的帧掉到了最慢的一级/,
      '`numbers` on the bottom rung’s share')
    const cn = (s2: string): number => '零一二三四五六七八九十'.indexOf(s2)
    expect(bottomShare / 100, 'the fraction the words name')
      .toBeGreaterThanOrEqual(cn(underCn!) / cn(overCn!))
    // 「为什么 1.1% 比 67.7% 更能说明问题」 — `deeper`'s heading names both shares
    const [deepTop, deepBottom] = figs(DEEP, /为什么 ([\d.]+)% 比 ([\d.]+)% 更能说明问题/,
      '`deeper` on the two shares')
    same(String(deepTop), topShare, '`deeper`: the ceiling’s share')
    same(String(deepBottom), bottomShare, '`deeper`: and the floor’s')
    // the quiz quotes the ceiling's share too
    const [quizTop] = figs(QUIZ, /只有 ([\d.]+)% 的帧用上了链路的上限/, 'the quiz on the same share')
    expect(quizTop, 'the same share again').toBe(top)
    // 「这十秒里，6248 帧各走了哪一级」 — the heading's own count
    const heading = (rateVsModel.numbers!.filter((b) => b.kind === 'table')[1] as unknown as
      { heading: string }).heading
    const [frames] = figs(heading, /这十秒里，([\d,]+) 帧各走了哪一级/, 'the table’s own heading')
    expect(frames, 'the frames this run really sends').toBe(s.attempts)
  })

  it('reads the first table’s own two shares, and every rung of the histogram’s first column', () => {
    /*
     * **Thirteen figures got past the reads above** (sweep of 2026-10-14), and ten of them were
     * cells the file already read — in the columns it did not read. The histogram's first column
     * is the ladder itself, and the alibi table's last row is the share the mechanism is read
     * from, so both are read here.
     */
    const s = near()
    // 「以最慢速率发出的帧：67.7 %」 against 「100 %」 on the arc
    const [nearShare] = figs(cell('同样五台站点，挪到近处', 3, 0), /：([\d.]+) %/,
      'the close-in share of the slowest rung')
    const [arcShare] = figs(cell('同样五台站点，挪到近处', 3, 1), /^([\d.]+) %$/,
      'and the arc’s')
    const bottomOf = (x: Stats): number => {
      const rungs = [...x.rateMix.keys()].sort((a, b) => a - b)
      return (100 * x.rateMix.get(rungs[0]!)!) / x.attempts
    }
    same(String(nearShare), bottomOf(s), 'the frames this run sends at its slowest rung')
    same(String(arcShare), bottomOf(arc5()), 'and the arc, which has only that rung')
    expect([...arc5().rateMix.keys()], 'because the arc really allows one rung only')
      .toHaveLength(1)
    /*
     * The histogram's first column: every rung the run used, fastest first, each printed with the
     * engine's own rate — and the two it labels are the ceiling and the floor.
     */
    const histogram = rateVsModel.numbers!.filter((b) => b.kind === 'table')[1] as unknown as
      { rows: string[][] }
    const rungs = [...s.rateMix.keys()].sort((a, b) => b - a)
    expect(histogram.rows.length, 'a row per rung the run used').toBe(rungs.length)
    for (const [i, row] of histogram.rows.entries()) {
      const [mbps] = figs(row[0]!, /^(\d+) Mb\/s/, `row ${i}: its own rate`)
      expect(mbps, `row ${i}: the rung the run used there`).toBe(rungs[i])
      expect(s.rateMix.get(mbps!), `row ${i}: and it really sent frames at it`).toBeGreaterThan(0)
    }
    expect(histogram.rows[0]![0], 'the first row is labelled the link’s ceiling').toContain('上限')
    expect(histogram.rows.at(-1)![0], 'and the last the slowest rung').toContain('最慢')
    expect(rungs[0], 'which is the rate this link can carry')
      .toBe(dataRateFor(buildLinkTable(rateVsModel.scenario().nodes, rateVsModel.scenario().walls)
        .get('sta-1')!.get('ap')!))
    // and the quiz prints the measured mean one more time
    const [quizMean] = figs(QUIZ, /把 T_s 里的帧长换成实测的 ([\d.]+) µs/, 'the quiz on the mean')
    same(String(quizMean), s.meanDataNs / 1000, 'the mean this run really has')
  })

  it('reads the alibi table whole: three columns, four rows', () => {
    /*
     * The first table's heading names its three columns — 「近处实测」, 「圆弧上」, 「预测」 — so
     * every cell is read against the run or the model that column is about. The file above read
     * the first column; these are the other two.
     */
    const tb = rateVsModel.numbers!.filter((b) => b.kind === 'table')[0] as unknown as
      { head: string[]; rows: string[][] }
    expect(tb.head, 'the three columns this table compares')
      .toEqual(['近处实测', '圆弧上', '预测'])
    const { tau, p } = solveBianchi({ n: 5, ...PARAMS })
    const t54 = dcfTimes(1500, 54)
    const modelMbps = saturationThroughput({
      n: 5, tau, slotNs: SLOT_NS, tsNs: t54.tsNs, tcNs: t54.tcNs, payloadBits: PAYLOAD_BITS,
    }).mbps
    const rowOf = (needle: string): string[] => tb.rows.find((r) => r[0]!.includes(needle))!
    // 「碰撞：26.17 %」 | 「25.84 %」 | 「27.22 %」
    const collide = rowOf('碰撞')
    same(raw(collide[0]!, /：([\d.]+) %/, 'the close-in collision rate')[0]!, 100 * near().p,
      'the collision rate close in')
    same(raw(collide[1]!, /^([\d.]+) %$/, 'the arc’s')[0]!, 100 * arc5().p, 'the arc’s own')
    same(raw(collide[2]!, /^([\d.]+) %$/, 'the model’s')[0]!, 100 * p, 'and the model’s')
    // 「吞吐：5.534 Mb/s」 | 「4.717 Mb/s」 | 「29.52 Mb/s」
    const thru = rowOf('吞吐')
    same(raw(thru[0]!, /：([\d.]+) Mb\/s/, 'the close-in throughput')[0]!, near().mbps,
      'the throughput close in')
    same(raw(thru[1]!, /^([\d.]+) Mb\/s$/, 'the arc’s')[0]!, arc5().mbps, 'the arc’s own')
    same(raw(thru[2]!, /^([\d.]+) Mb\/s$/, 'the model’s')[0]!, modelMbps, 'and the model’s')
    // 「平均帧长：1723.7 µs」 | 「2064 µs」 | 「按假设 248 µs」
    const frame = rowOf('平均帧长')
    same(raw(frame[0]!, /：([\d.]+) µs/, 'the close-in mean')[0]!, near().meanDataNs / 1000,
      'the mean frame close in')
    same(raw(frame[1]!, /^([\d.]+) µs$/, 'the arc’s')[0]!, arc5().meanDataNs / 1000,
      'the arc’s own, which is one rung only')
    same(raw(frame[2]!, /按假设 ([\d.]+) µs/, 'the model’s')[0]!, t54.dataNs / 1000,
      'and the one the model assumes')
    // 「以最慢速率发出的帧：67.7 %」 | 「100 %」 | 「按假设为零」
    const slowest = rowOf('以最慢速率发出的帧')
    expect(slowest[2], 'the model assumes none at all').toContain('零')
    // 「同样五台站点，挪到近处」 and 「n = 5 在圆弧上」: the stations each scene really has
    const cnOf = (ch: string): number => '零一二三四五六七八九十'.indexOf(ch)
    const stations = (sc: Scenario): number => sc.nodes.filter((n) => n.kind === 'sta').length
    const [countCn] = raw((rateVsModel.numbers!.filter((b) => b.kind === 'table')[0] as unknown as
      { heading: string }).heading, /同样(.)台站点/, 'the table’s own heading')
    expect(cnOf(countCn!), 'the stations this scene has').toBe(stations(rateVsModel.scenario()))
    const [arcN] = figs(PIC, /「n = (\d) 在圆弧上」/, '`picture` on the variant')
    expect(arcN, 'and the variant the sentence names')
      .toBe(stations(rateVsModel.variants![0]!.scenario()))
  })

  it('reads both experiments in `tryThis`, and the scene `sources` names', () => {
    // 「碰撞 26.17% 对 25.84%，吞吐 5.534 对 4.717 Mb/s」
    const [nearP, arcP, nearMbps, arcMbps] = figs(TRY,
      /碰撞 ([\d.]+)% 对 ([\d.]+)%，吞吐 ([\d.]+) 对 ([\d.]+) Mb\/s/, '`tryThis` on the four figures')
    same(String(nearP), 100 * near().p, 'the close-in collision rate')
    same(String(arcP), 100 * arc5().p, 'the arc’s')
    same(String(nearMbps), near().mbps, 'the close-in throughput')
    same(String(arcMbps), arc5().mbps, 'and the arc’s')
    // 「把基础场景和「n = 5 在圆弧上」各跑十秒」
    const [n, secsCn] = raw(TRY, /「n = (\d) 在圆弧上」各跑(.)秒/, '`tryThis` on the two runs')
    expect(rateVsModel.scenario().nodes.filter((x) => x.kind === 'sta').length,
      'the stations this scene has').toBe(val(n!))
    const cn = (s2: string): number => '零一二三四五六七八九十'.indexOf(s2)
    expect(cn(secsCn!), 'the seconds each run covers').toBe(SECS)
    // 「算出 1723.7 µs，把它代进 T_s 与 T_c，再解一次不动点。你应该得到 5.547 Mb/s，而不是 29.52」
    const [meanUs, replaced, paper] = figs(TRY,
      /算出 ([\d.]+) µs，把它代进 T_s[\s\S]*?你应该得到 ([\d.]+) Mb\/s，而不是 ([\d.]+)/,
      '`tryThis` on the replacement')
    same(String(meanUs), near().meanDataNs / 1000, 'the mean airtime the reader is to compute')
    same(String(replaced), replacedMbps(), 'the fixed point it gives')
    same(String(paper), paperMbps(), 'and the one it replaces')
    // 「15 dBm 的近处场景、种子 7、十秒采样窗口」
    const [dbm, seed] = figs(SRC, /(\d+) dBm 的近处场景、种子 (\d+)/, '`sources` on the scene')
    const scen = rateVsModel.scenario()
    for (const st of scen.nodes.filter((x) => x.kind === 'sta')) {
      expect(st.txPowerDbm, 'every station’s own power').toBe(dbm)
    }
    expect(scen.seed, 'and the seed this lesson quotes').toBe(seed)
    const [winCn] = raw(SRC, /(.)秒采样窗口/, '`sources` on the window')
    expect(cn(winCn!), 'the window every figure is measured over').toBe(SECS)
  })
})
