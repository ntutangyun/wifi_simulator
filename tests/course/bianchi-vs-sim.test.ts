/**
 * Pins "The prediction against the run": the four-row model-against-run table
 * (which moved here from the Bianchi lesson in the rewrite, with its pins), the
 * cost of a pile-up, the restart times, the per-station spread and the no-window
 * corner.
 *
 * The contract of the lesson (shape, jumps, the first watch) comes from
 * `lessonShapeSuite`.
 *
 * Re-paced 2026-09-25: the rate-adaptation artefact — the close-in run, the rate
 * histogram, the alibi table and the 5.53-against-29.52 factor of five — moved to
 * the second half with its prose, and its pins moved with it, to
 * tests/course/rate-vs-model.test.ts. What arrived in exchange is the pin the old
 * lesson needed and never had: on this scene the access point's RX_MISS count and
 * the RETRY count are the SAME number, so nothing is ever captured and the
 * measured retry rate really is the collision rate the model defines. The prose
 * it replaces claimed the opposite for the close-in run.
 *
 * The busy-slot experiment the lesson quotes (n = 20 rising from 45.83 % to
 * ≈ 47.9 % when the backoff is decremented across a busy period) is a one-off
 * probe against a patched MAC, not engine behaviour, so it is deliberately not
 * pinned here — see the probe path in the lesson file's header comment.
 */
import { describe, it, expect } from 'vitest'
import { bianchiVsSim, bianchiVsSimJumps, bianchiVsSimVariants } from '../../src/course/tier1/bianchi-vs-sim'
import { bianchi } from '../../src/course/tier1/bianchi'
import { dcfTimes, saturationThroughput, solveBianchi } from '../../src/course/tier1/bianchiModel'
import { COURSE_ORDER } from '../../src/course/curriculum'
import { Simulation } from '../../src/engine/simulation'
import { TAMPER_PRESETS, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite } from './kit'
import { CW_MAX, CW_MIN, SHORT_RETRY_LIMIT, SLOT_NS, dataRateFor, noiseDbm } from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'

const SECS = 10
const RUN_NS = SECS * 1e9
const PAYLOAD_BITS = 12_000
const PARAMS = { W: 16, m: 6, attempts: 7 } as const

interface Stats {
  attempts: number
  collided: number
  p: number
  acks: number
  mbps: number
  eifs: number
  perStationP: number[]
  rateMix: Map<number, number>
  drops: Record<string, number>
  attemptsBy: Map<string, number>
  records: TLRecord[]
}

const memo = new Map<string, Stats>()

function measure(key: string, scenario: Scenario): Stats {
  const hit = memo.get(key)
  if (hit) return hit
  const records = [...new Simulation(scenario).runUntil(RUN_NS).records]
  const attemptsBy = new Map<string, number>()
  const retriesBy = new Map<string, number>()
  const rateMix = new Map<number, number>()
  const drops: Record<string, number> = {}
  let acks = 0
  let eifs = 0
  for (const r of records) {
    if (r.type === 'TX_START' && r.frame.kind === 'data') {
      attemptsBy.set(r.node, (attemptsBy.get(r.node) ?? 0) + 1)
      rateMix.set(r.frame.mbps, (rateMix.get(r.frame.mbps) ?? 0) + 1)
    } else if (r.type === 'TX_START' && r.frame.kind === 'ack') acks++
    else if (r.type === 'RETRY') retriesBy.set(r.node, (retriesBy.get(r.node) ?? 0) + 1)
    else if (r.type === 'DROP') drops[r.reason] = (drops[r.reason] ?? 0) + 1
    else if (r.type === 'IFS_START' && r.kind === 'EIFS') eifs++
  }
  let attempts = 0
  let collided = 0
  const perStationP: number[] = []
  for (const [id, a] of attemptsBy) {
    attempts += a
    collided += retriesBy.get(id) ?? 0
    perStationP.push((retriesBy.get(id) ?? 0) / a)
  }
  const out: Stats = {
    attempts, collided, p: collided / attempts, acks,
    mbps: (acks * PAYLOAD_BITS) / SECS / 1e6,
    eifs, perStationP, rateMix, drops, attemptsBy, records,
  }
  memo.set(key, out)
  return out
}

/** The lesson's own scenarios: close in (base), the arc, and the arc at n = 20. */
const near = () => measure('near', bianchiVsSim.scenario())
const arc5 = () => measure('arc5', bianchiVsSim.variants![0].scenario())
const arc20 = () => measure('arc20', bianchiVsSim.variants![1].scenario())

// The `quotes(...)` helper that stood here searched everything a learner reads for each
// figure the lesson prints. Retired 2026-09-25: every claim it guarded is recomputed below
// from the model or measured off the run, which is the pin that catches a drift; the
// quotation only ever asserted how a sentence reads.

const pct = (x: number, d = 2) => `${(100 * x).toFixed(d)} %`

// ---------------------------------------------------------------------------

/**
 * Amendment of 2026-09-23: the lesson now writes the comparison out as a
 * method — which run, which records, over what window, and where the model's
 * inputs come from. Each step is pinned against the harness above, which
 * counts exactly what the step tells the reader to count.
 */
describe('0 · the method the steps block sets out', () => {
  it('step 1: one scene, its own seed, ten seconds of simulated time', () => {
    expect(RUN_NS).toBe(10e9)
    expect(bianchiVsSim.variants![0].scenario().seed).toBe(7)
  })

  it('step 2: an attempt is a data TX_START, a meeting is a RETRY, and their quotient is the measured rate', () => {
    const s = arc5()
    const txData = s.records.filter((r) => r.type === 'TX_START' && r.frame.kind === 'data').length
    const retries = s.records.filter((r) => r.type === 'RETRY').length
    expect(txData).toBe(s.attempts)
    expect(retries).toBe(s.collided)
    expect(s.collided / s.attempts).toBeCloseTo(s.p, 12)
  })

  it('step 3: a delivery is an acknowledgement, and throughput is deliveries × 12,000 bits ÷ ten seconds', () => {
    const s = arc5()
    const acks = s.records.filter((r) => r.type === 'TX_START' && r.frame.kind === 'ack').length
    expect(acks).toBe(s.acks)
    expect(PAYLOAD_BITS).toBe(12_000)
    expect((acks * PAYLOAD_BITS) / SECS / 1e6).toBeCloseTo(s.mbps, 12)
  })

  it('step 4: the model’s inputs are the scene’s and the engine’s, never the measurement’s', () => {
    const scen = bianchiVsSim.variants![0].scenario()
    expect(scen.nodes.filter((n) => n.kind === 'sta').length).toBe(5)
    expect(CW_MIN + 1).toBe(PARAMS.W)
    expect(2 ** PARAMS.m * PARAMS.W).toBe(CW_MAX + 1)
    expect(SHORT_RETRY_LIMIT).toBe(PARAMS.attempts)
    expect([...arc5().rateMix.keys()]).toEqual([6]) // the one rate the arc allows
  })

  it('step 6: a seed moves the measured rate by tenths of a point, and no further', () => {
    const scen = bianchiVsSim.variants![0].scenario()
    scen.seed = 8
    const other = measure('arc5-seed8', scen)
    expect(pct(other.p)).toBe('25.53 %')
    expect(Math.abs(100 * (other.p - arc5().p))).toBeLessThan(1)
  })
})

/**
 * The claim the picture block 「这里没有捕获，于是两个计数是同一个数」 and step 2 of the
 * method now rest on, and the one the old lesson got backwards. Both scenes put
 * every station at the SAME distance from the access point — the arc at 3 m, the
 * close-in variant on a 1 m circle — so no frame is ever louder than another, the
 * access point locks nothing during an overlap, and every destroyed frame is
 * retried. The equality below is exact, not approximate, which is what makes the
 * measured column comparable with the model's p at all.
 */
describe('1 · no capture anywhere on this scene', () => {
  const misses = (s: Stats): number => s.records.filter((r) => r.type === 'RX_MISS' && r.node === 'ap').length
  const rxOk = (s: Stats): number => s.records.filter((r) => r.type === 'RX_OK' && r.node === 'ap').length

  it('every station arrives at the access point at the same level, close in and on the arc', () => {
    for (const [name, scen] of [
      ['arc', bianchiVsSim.variants![0].scenario()], ['close in', bianchiVsSim.scenario()],
    ] as const) {
      const table = buildLinkTable(scen.nodes, scen.walls)
      const levels = scen.nodes.filter((n) => n.kind === 'sta').map((n) => table.get(n.id)!.get('ap')!)
      expect(Math.max(...levels) - Math.min(...levels), name).toBeLessThan(0.01)
    }
    // and close in that level is 36 dB above the arc's, with the top rung in reach
    const near5 = buildLinkTable(bianchiVsSim.scenario().nodes, bianchiVsSim.scenario().walls)
    const level = near5.get('sta-1')!.get('ap')!
    expect(level.toFixed(3)).toBe('-36.215')
    expect(dataRateFor(level)).toBe(54)
    expect(level - noiseDbm(20)).toBeCloseTo(57.8, 1)
  })

  it('the access point’s missed receptions and the retries are the same number, exactly', () => {
    // the observation 「十秒里 1370 次错失，恰好对应 1370 次重传」, and its n = 20 twin
    expect([misses(arc5()), arc5().collided]).toEqual([1370, 1370])
    expect([misses(arc20()), arc20().collided]).toEqual([2840, 2840])
    expect([misses(near()), near().collided]).toEqual([1635, 1635])
    // a miss is not a failed decode: the access point never started a reception it lost
    expect(arc5().records.some((r) => r.type === 'RX_FAIL' && r.node === 'ap')).toBe(false)
    // and its good receptions are exactly the answers it sent
    expect(rxOk(arc5())).toBe(arc5().acks)
  })

  it('so the measured retry rate IS the model’s collision rate here: 25.84 % against 27.22 %', () => {
    expect(pct(arc5().p)).toBe('25.84 %')
    expect(pct(solveBianchi({ n: 5, ...PARAMS }).p)).toBe('27.22 %')
    expect(Math.abs(arc5().p - solveBianchi({ n: 5, ...PARAMS }).p)).toBeLessThan(0.015)
    // the arc pins the rate, which is the other half of what makes it comparable
    expect([...arc5().rateMix.keys()]).toEqual([6])
    expect(dcfTimes(1500, 6).dataNs).toBe(2_064_000)
  })
})

describe('2 · the T_c convention', () => {
  it('T_c is 15 µs under T_s, 0.7 % of a slot, 0.2 % of throughput at n = 20', () => {
    const t = dcfTimes(1500, 6)
    expect(t.tsNs - t.tcNs).toBe(15_000)
    expect(((t.tsNs - t.tcNs) / t.tsNs).toFixed(3)).toBe('0.007')
    const { tau } = solveBianchi({ n: 20, ...PARAMS })
    const S = (tcNs: number) => saturationThroughput({ n: 20, tau, slotNs: SLOT_NS, tsNs: t.tsNs, tcNs, payloadBits: PAYLOAD_BITS }).mbps
    expect(((S(t.tcNs) - S(t.tsNs)) / S(t.tsNs) * 100).toFixed(1)).toBe('0.2')
    // the paper's own basic-access collision: frame + DIFS
    const paperTc = t.dataNs + 34_000
    expect(paperTc).toBe(2_098_000)
    expect(((S(t.tcNs) - S(paperTc)) / S(paperTc) * 100).toFixed(1)).toBe('-0.6')
  })
})

describe('3–6 · restart times, small n and fairness', () => {
  it('the n = 5 arc run logs 1,029 EIFS deferrals; the colliders wait 45 µs and the deaf wait 34', () => {
    expect(arc5().eifs).toBe(1029)
    expect(94 - 34).toBe(60) // "60 µs longer than its neighbours"
  })

  it('n = 2 is the sign flip: 11.20 % measured against 10.46 % predicted', () => {
    const s = measure('n2', bianchi.variants![0].scenario())
    expect(pct(s.p)).toBe('11.20 %')
    expect(pct(solveBianchi({ n: 2, ...PARAMS }).p)).toBe('10.46 %')
    expect(s.p).toBeGreaterThan(solveBianchi({ n: 2, ...PARAMS }).p)
  })

  it('n = 20 per-station collision rates spread from 42.9 % to 52.1 % around the pooled 45.83 %', () => {
    const s = arc20()
    expect(Math.min(...s.perStationP)).toBeCloseTo(0.429, 3)
    expect(Math.max(...s.perStationP)).toBeCloseTo(0.521, 3)
    expect(pct(s.p)).toBe('45.83 %')
  })

  it('the finite-retry direction quoted in the quiz: the retry limit pushes p up', () => {
    const inf = solveBianchi({ n: 20, W: 16, m: 6 })
    const fin = solveBianchi({ n: 20, ...PARAMS })
    expect(fin.p).toBeGreaterThan(inf.p)
    expect(`${pct(inf.p, 2)} → ${pct(fin.p, 2)}`.replace(/ %/g, '%')).toBe('48.09% → 49.59%')
  })
})

describe('try this · the CW = 0 corner', () => {
  const cheated = (count: number): Scenario => {
    const scen = bianchiVsSim.variants![0].scenario() // the arc, rate pinned
    let left = count
    for (const n of scen.nodes) if (n.kind === 'sta' && left-- > 0) n.tamper = { ...TAMPER_PRESETS.cw }
    return scen
  }

  it('all five: τ = 1, p = 1, S = 0 in the model and 23,335/23,330 in the run', () => {
    const { tau, p } = solveBianchi({ n: 5, W: 1, m: 0 }) // cwMin = cwMax = 0
    expect(tau).toBeCloseTo(1, 9)
    expect(p).toBeCloseTo(1, 9)
    const t = dcfTimes(1500, 6)
    expect(saturationThroughput({ n: 5, tau, slotNs: SLOT_NS, tsNs: t.tsNs, tcNs: t.tcNs, payloadBits: PAYLOAD_BITS }).mbps).toBeCloseTo(0, 9)

    const s = measure('cheat5', cheated(5))
    expect(s.attempts).toBe(23_335)
    expect(s.collided).toBe(23_330)
    expect(s.acks).toBe(0)
    expect(s.mbps).toBe(0)
    expect(s.drops.retryLimit).toBe(3330)
  })

  it('one cheat: 4,634 of 4,639 attempts, five frames for the rest, 5.557 Mb/s — the single-station limit', () => {
    const s = measure('cheat1', cheated(1))
    expect(s.attempts).toBe(4639)
    expect(s.attemptsBy.get('sta-1')).toBe(4634)
    expect(s.attempts - s.attemptsBy.get('sta-1')!).toBe(5)
    expect(s.mbps.toFixed(3)).toBe('5.557')
    const t = dcfTimes(1500, 6)
    expect((PAYLOAD_BITS / (t.tsNs * 1e-9) / 1e6).toFixed(3)).toBe('5.561') // 12,000 bits / T_s
  })
})

lessonShapeSuite(bianchiVsSim, { runNs: RUN_NS })

describe('lesson contract', () => {
  it('follows the model lesson in the reading order and names it as its one prerequisite', () => {
    expect(bianchiVsSim.id).toBe('bianchi-vs-sim')
    expect(COURSE_ORDER.indexOf('bianchi-vs-sim')).toBe(COURSE_ORDER.indexOf('bianchi') + 1)
    // Whole-track review M3: the picture leans on the rate loop `anomaly` names, so anomaly
    // joins `needs` and `rate` inherits it through this lesson.
    expect(bianchiVsSim.needs).toEqual(['bianchi', 'anomaly'])
    // Whole-track review M3: `rate control` is anomaly's term; this lesson points back to it
    // rather than introducing the same word again.
    expect(bianchiVsSim.terms!.map((t) => t.term)).toEqual(['capture', 'residual'])
    // Re-pacing 2026-09-25: the third observation went with the close-in prose to
    // `rate-vs-model`, which loads this same scene and these same variants.
    expect(bianchiVsSim.observe.length).toBe(2)
    expect(bianchiVsSim.tryThis.length).toBe(2)
    expect(bianchiVsSim.variants).toBe(bianchiVsSimVariants)
    expect(bianchiVsSim.jumps).toBe(bianchiVsSimJumps)
    for (const q of bianchiVsSim.quiz) {
      expect(q.answer).toBeGreaterThanOrEqual(0)
      expect(q.answer).toBeLessThan(q.options.length)
    }
  })
})

describe('the model-against-run table (moved here from the Bianchi lesson)', () => {
  const t6 = dcfTimes(1500, 6)
  const arcN = (n: number): Stats => n === 5
    ? arc5()
    : n === 20
      ? arc20()
      : measure(`n${n}`, bianchi.variants![n === 2 ? 0 : 1].scenario())

  /** One row: n, predicted collide, measured collide, predicted S, measured S. */
  const rows: [number, string, string, string, string, number, number, number][] = [
    [2, '10.46 %', '11.20 %', '5.169', '5.136', 4821, 540, 4280],
    [5, '27.22 %', '25.84 %', '4.679', '4.717', 5302, 1370, 3931],
    [10, '38.92 %', '35.08 %', '4.275', '4.421', 5678, 1992, 3684],
    [20, '49.59 %', '45.83 %', '3.857', '4.027', 6197, 2840, 3356],
  ]

  for (const [n, p, pHat, sModel, sHat, attempts, collided, acks] of rows) {
    it(`n = ${n}: ${p} against ${pHat}, ${sModel} against ${sHat} Mb/s`, () => {
      const s = arcN(n)
      expect(s.attempts, 'attempts').toBe(attempts)
      expect(s.collided, 'collided').toBe(collided)
      expect(s.acks, 'answers').toBe(acks)
      expect(pct(s.p)).toBe(pHat)
      expect(s.mbps.toFixed(3)).toBe(sHat)
      const sol = solveBianchi({ n, ...PARAMS })
      const model = saturationThroughput({ n, tau: sol.tau, slotNs: SLOT_NS, tsNs: t6.tsNs, tcNs: t6.tcNs, payloadBits: PAYLOAD_BITS })
      expect(pct(sol.p)).toBe(p)
      expect(model.mbps.toFixed(3)).toBe(sModel)
      // "Every collision figure lands within 10 % of the prediction and every throughput within 5 %"
      expect(Math.abs(s.p - sol.p) / sol.p, 'collide within 10 %').toBeLessThan(0.10)
      expect(Math.abs(s.mbps - model.mbps) / model.mbps, 'throughput within 5 %').toBeLessThan(0.05)
    })
  }

  it('from five stations upward the run always collides less than predicted; two flips the sign', () => {
    // "from five stations upward the run always collides less than predicted, and only the
    //  two-station row flips sign"
    for (const n of [5, 10, 20]) expect(arcN(n).p, `n=${n}`).toBeLessThan(solveBianchi({ n, ...PARAMS }).p)
    expect(arcN(2).p).toBeGreaterThan(solveBianchi({ n: 2, ...PARAMS }).p)
  })
})
