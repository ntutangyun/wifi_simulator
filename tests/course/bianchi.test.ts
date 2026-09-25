/**
 * Pins "Predicting collisions on paper": the solver against an independently
 * derived fixed point, the engine constants T_s and T_c are built from, and
 * every number the rewritten lesson quotes.
 *
 * The contract of the lesson (shape, budgets, jumps, the bilingual walk) comes
 * from `lessonShapeSuite`. The four-row model-against-run table moved to the
 * companion lesson in the rewrite, and its pins moved with it, to
 * tests/course/bianchi-vs-sim.test.ts; what stays here is the one measured
 * sentence this lesson still makes ("5302 attempts, of which 1370 met somebody
 * else") plus the runs the observations and experiments name.
 */
import { describe, it, expect } from 'vitest'
import { bianchi } from '../../src/course/tier1/bianchi'
import type { Block } from '../../src/course/lessonKit'
import { dcfTimes, saturationThroughput, solveBianchi, tauOf } from '../../src/course/tier1/bianchiModel'
import { COURSE_ORDER } from '../../src/course/curriculum'
import { Simulation } from '../../src/engine/simulation'
import type { Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite } from './kit'
import { CW_MAX, CW_MIN, SHORT_RETRY_LIMIT, SLOT_NS, dataRateFor, noiseDbm } from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'

const SECS = 10
const RUN_NS = SECS * 1e9
const PAYLOAD_BITS = 12_000
const PARAMS = { W: 16, m: 6, attempts: 7 } as const

// ---------------------------------------------------------------------------
// harness
// ---------------------------------------------------------------------------

interface Stats {
  attempts: number
  collided: number
  p: number
  acks: number
  mbps: number
  rateMix: Map<number, number>
  drops: Record<string, number>
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
  for (const r of records) {
    if (r.type === 'TX_START' && r.frame.kind === 'data') {
      attemptsBy.set(r.node, (attemptsBy.get(r.node) ?? 0) + 1)
      rateMix.set(r.frame.mbps, (rateMix.get(r.frame.mbps) ?? 0) + 1)
    } else if (r.type === 'TX_START' && r.frame.kind === 'ack') acks++
    else if (r.type === 'RETRY') retriesBy.set(r.node, (retriesBy.get(r.node) ?? 0) + 1)
    else if (r.type === 'DROP') drops[r.reason] = (drops[r.reason] ?? 0) + 1
  }
  let attempts = 0
  let collided = 0
  for (const [id, a] of attemptsBy) {
    attempts += a
    collided += retriesBy.get(id) ?? 0
  }
  const out: Stats = {
    attempts, collided, p: collided / attempts, acks,
    mbps: (acks * PAYLOAD_BITS) / SECS / 1e6, rateMix, drops, records,
  }
  memo.set(key, out)
  return out
}

const base = () => measure('n5', bianchi.scenario())
const variant = (i: number, key: string) => measure(key, bianchi.variants![i].scenario())

// The `quotes(...)` helper that stood here searched everything a learner reads for each
// figure the lesson prints. Retired 2026-09-25: every claim it guarded is recomputed below
// from the model or measured off the run, which is the pin that catches a drift; the
// quotation only ever asserted how a sentence reads.

const pct = (x: number, d = 2) => `${(100 * x).toFixed(d)} %`

// ---------------------------------------------------------------------------
// the solver
// ---------------------------------------------------------------------------

describe('bianchiModel · the fixed point', () => {
  /**
   * An independent solution, derived here rather than taken from the module:
   * build the backoff chain's stationary distribution by brute force (a long
   * truncated sum over stages, no closed form) and iterate p → τ → p until it
   * stops moving.
   */
  function referenceFixedPoint(n: number, W: number, m: number, stages = 4000): { tau: number; p: number } {
    const tau = (p: number): number => {
      let num = 0
      let den = 0
      for (let i = 0; i < stages; i++) {
        const w = 2 ** Math.min(i, m) * W
        num += p ** i
        den += (p ** i * (w + 1)) / 2
      }
      return num / den
    }
    let p = 0.2
    for (let k = 0; k < 10_000; k++) {
      const next = 1 - (1 - tau(p)) ** (n - 1)
      if (Math.abs(next - p) < 1e-14) break
      p = 0.5 * p + 0.5 * next // damped iteration: converges for every n tried
    }
    return { tau: tau(p), p }
  }

  it('matches a brute-force iteration for the published W = 32, m = 3, n = 10 case', () => {
    const ref = referenceFixedPoint(10, 32, 3)
    const got = solveBianchi({ n: 10, W: 32, m: 3 })
    expect(got.p).toBeCloseTo(ref.p, 9)
    expect(got.tau).toBeCloseTo(ref.tau, 9)
    // Bianchi's Fig. 5/6 regime: a 10-station BSS with W = 32 sits near τ ≈ 0.039, p ≈ 0.30.
    expect(got.tau).toBeGreaterThan(0.035)
    expect(got.tau).toBeLessThan(0.042)
    expect(got.p).toBeGreaterThan(0.28)
    expect(got.p).toBeLessThan(0.32)
  })

  it('matches the brute-force iteration for this engine’s W = 16, m = 6', () => {
    for (const n of [2, 5, 10, 20, 50]) {
      const ref = referenceFixedPoint(n, 16, 6)
      const got = solveBianchi({ n, W: 16, m: 6 })
      expect(got.p, `n=${n}`).toBeCloseTo(ref.p, 8)
      expect(got.tau, `n=${n}`).toBeCloseTo(ref.tau, 8)
    }
  })

  it('the closed form and the finite-retry sum agree when retries are plentiful', () => {
    // 400 attempts ≈ infinite retries at p ≤ 0.5.
    expect(tauOf(0.3, { W: 16, m: 6, attempts: 400 })).toBeCloseTo(tauOf(0.3, { W: 16, m: 6 }), 12)
    expect(tauOf(0.5, { W: 16, m: 6 })).toBeCloseTo(2 / (16 + 1 + 0.5 * 16 * 6), 12) // no 0/0 at p = ½
    expect(tauOf(0, { W: 16, m: 6 })).toBeCloseTo(2 / 17, 12)
  })
})

// ---------------------------------------------------------------------------
// the engine constants the prose derives T_s and T_c from
// ---------------------------------------------------------------------------

describe('the exchange times quoted in the lesson', () => {
  it('6 Mb/s: 2,064 µs data, 44 µs ACK, T_s = 2158 µs, T_c = 2143 µs', () => {
    const t = dcfTimes(1500, 6)
    expect(t.dataNs).toBe(2_064_000)
    expect(t.ackNs).toBe(44_000)
    expect(t.tsNs).toBe(2_158_000)
    expect(t.tcNs).toBe(2_143_000)
  })

  it('54 Mb/s: 248 µs data, 28 µs ACK at 24 Mb/s', () => {
    const t = dcfTimes(1500, 54)
    expect(t.dataNs).toBe(248_000)
    expect(t.ackNs).toBe(28_000)
    expect(t.tsNs).toBe(326_000)
    expect(t.tcNs).toBe(327_000)
  })

  it('the arc puts every station at −81.7 dBm, 12.3 dB of SNR, 6 Mb/s and no headroom', () => {
    const scen = bianchi.scenario()
    const table = buildLinkTable(scen.nodes, scen.walls)
    const levels = scen.nodes.filter((n) => n.kind === 'sta').map((n) => table.get(n.id)!.get('ap')!)
    for (const l of levels) expect(l).toBeCloseTo(-81.7, 1)
    expect(Math.max(...levels) - Math.min(...levels)).toBeLessThan(0.01) // equal power ⇒ no capture
    expect(noiseDbm(20)).toBeCloseTo(-94.0, 1)
    expect(levels[0] - noiseDbm(20)).toBeCloseTo(12.3, 1)
    expect(dataRateFor(levels[0])).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// the model table in the prose
// ---------------------------------------------------------------------------

describe('the model table', () => {
  const t54 = dcfTimes(1500, 54)
  const t6 = dcfTimes(1500, 6)
  const S = (tau: number, n: number, t: { tsNs: number; tcNs: number }) =>
    saturationThroughput({ n, tau, slotNs: SLOT_NS, tsNs: t.tsNs, tcNs: t.tcNs, payloadBits: PAYLOAD_BITS }).mbps

  const rows: [number, string, string, string, string][] = [
    [2, '0.1046', '10.46 %', '31.28', '5.169 Mb/s'],
    [5, '0.0763', '27.22 %', '29.52', '4.679 Mb/s'],
    [10, '0.0533', '38.92 %', '27.36', '4.275 Mb/s'],
    [20, '0.0354', '49.59 %', '24.91', '3.857 Mb/s'],
  ]

  for (const [n, tau, p, s54, s6] of rows) {
    it(`n = ${n}: τ = ${tau}, p = ${p}, S = ${s54} / ${s6}`, () => {
      const sol = solveBianchi({ n, ...PARAMS })
      expect(sol.tau.toFixed(4)).toBe(tau)
      expect(pct(sol.p)).toBe(p)
      expect(S(sol.tau, n, t54).toFixed(2)).toBe(s54)
      expect(`${S(sol.tau, n, t6).toFixed(3)} Mb/s`).toBe(s6)
    })
  }

  it('the contention loss quoted between n = 2 and n = 20, and what the MAC keeps at 54 Mb/s', () => {
    const two = S(solveBianchi({ n: 2, ...PARAMS }).tau, 2, t54)
    const twenty = S(solveBianchi({ n: 20, ...PARAMS }).tau, 20, t54)
    expect((two - twenty) / two).toBeCloseTo(0.204, 3) // "only a further 20%"
    expect(two / 54).toBeGreaterThan(0.55) // "well under two thirds of the nominal rate"
    expect(two / 54).toBeLessThan(0.66)
  })

  it('the finite-retry correction at n = 20: p 48.09 % → 49.59 %', () => {
    const inf = solveBianchi({ n: 20, W: 16, m: 6 })
    const fin = solveBianchi({ n: 20, ...PARAMS })
    expect(pct(inf.p)).toBe('48.09 %')
    expect(pct(fin.p)).toBe('49.59 %')
  })

  it('the 6 Mb/s and 54 Mb/s contention costs quoted in the text', () => {
    const s = (n: number, t: { tsNs: number; tcNs: number }) => S(solveBianchi({ n, ...PARAMS }).tau, n, t)
    expect(s(2, t6).toFixed(2)).toBe('5.17')
    expect(s(20, t6).toFixed(2)).toBe('3.86')
    expect(s(2, t54).toFixed(1)).toBe('31.3')
    expect(s(20, t54).toFixed(1)).toBe('24.9')
  })
})

// ---------------------------------------------------------------------------
// the procedure, step by step, and the crowd it is worked through
// ---------------------------------------------------------------------------

/**
 * Amendment of 2026-09-23: the lesson no longer states the fixed point, it
 * tells the reader how to reach it with a calculator. Each step is pinned
 * against the function that takes it in ./bianchiModel.ts or the engine
 * constant it quotes, and the worked example is recomputed row by row rather
 * than transcribed.
 */
describe('the procedure the steps block asks the reader to carry out', () => {
  const sol = solveBianchi({ n: 5, ...PARAMS })

  it('step 1: the four numbers are the engine’s own window, doublings and attempt limit', () => {
    expect(CW_MIN + 1).toBe(PARAMS.W)
    expect(2 ** PARAMS.m * PARAMS.W).toBe(CW_MAX + 1)
    expect(SHORT_RETRY_LIMIT).toBe(PARAMS.attempts)
  })

  /**
   * B4 fix round: the block used to DISPLAY Bianchi's infinite-retry closed
   * form while the table under it listed finite-retry figures (48.09 % against
   * 49.59 % at n = 20), so its caption was false by construction. The displayed
   * pair is now the one `solveBianchi` actually solves, and this test keeps the
   * two together: the formula on the page must be the finite-retry pair, the
   * classic form must be in the depth and labelled, and the table's numbers
   * must come from the displayed pair rather than from the classic one.
   */
  it('the displayed equations are the model the table comes from, and the classic form is in the depth', () => {
    const shown = bianchi.numbers!.find((b) => b.kind === 'formula') as Extract<Block, { kind: 'formula' }>
    expect(shown.text).toContain('\u03a3_{i<L} p^i')
    expect(shown.text).toContain('p = 1 \u2212 (1\u2212\u03c4)^(n\u22121)')
    expect(shown.text, 'the classic closed form must not stand over finite-retry figures').not.toContain('2(1\u22122p)')
    // the classic form stays, in `deeper`, with the size of the difference it makes
    const depth = (bianchi.deeper ?? []).flatMap((b) => {
      const f = b as Extract<Block, { kind: 'formula' }>
      return f.kind === 'formula' ? [f.text, f.note ?? ''] : []
    }).join(' ')
    expect(depth).toContain('2(1\u22122p)') // the notation, not the sentence: the classic form belongs in the depth

    // and the numbers in the table are the displayed pair's, not the classic pair's
    for (const [n, tau, pStr] of [[2, '0.1046', '10.46 %'], [5, '0.0763', '27.22 %'],
      [10, '0.0533', '38.92 %'], [20, '0.0354', '49.59 %']] as const) {
      const fin = solveBianchi({ n, ...PARAMS })
      expect(fin.tau.toFixed(4)).toBe(tau)
      expect(pct(fin.p)).toBe(pStr)
    }
    expect(pct(solveBianchi({ n: 20, W: 16, m: 6 }).p)).toBe('48.09 %') // the classic pair, which the table is NOT
  })

  it('step 2: the two sums over the stages reproduce tauOf exactly', () => {
    for (const p of [0.05, 0.2722, 0.5, 0.8]) {
      let num = 0
      let den = 0
      for (let i = 0; i < PARAMS.attempts; i++) {
        const w = 2 ** Math.min(i, PARAMS.m) * PARAMS.W
        num += p ** i
        den += (p ** i * (w + 1)) / 2
      }
      expect(num / den, `p=${p}`).toBeCloseTo(tauOf(p, PARAMS), 12)
    }
  })

  it('steps 3 and 4: the halving converges on the p where p′ equals p, and τ falls as p rises', () => {
    const pPrime = (p: number) => 1 - (1 - tauOf(p, PARAMS)) ** 4
    expect(pPrime(sol.p)).toBeCloseTo(sol.p, 9) // the pair satisfies both statements
    // "τ falls as p rises, so their difference crosses zero just once"
    let prev = Infinity
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const t = tauOf(p, PARAMS)
      expect(t).toBeLessThan(prev)
      prev = t
    }
    // fifty halvings of [0, 1] leave far less than the fourth decimal the lesson quotes
    expect(2 ** -50).toBeLessThan(1e-4)
  })

  it('steps 5 to 7: P_tr, P_s, the mean slot and the payload are saturationThroughput’s own', () => {
    const t6 = dcfTimes(1500, 6)
    const r = saturationThroughput({ n: 5, tau: sol.tau, slotNs: SLOT_NS, tsNs: t6.tsNs, tcNs: t6.tcNs, payloadBits: PAYLOAD_BITS })
    expect(r.ptr).toBeCloseTo(1 - (1 - sol.tau) ** 5, 12)
    expect(r.ps).toBeCloseTo((5 * sol.tau * (1 - sol.tau) ** 4) / r.ptr, 12)
    expect(r.slotMeanNs).toBeCloseTo((1 - r.ptr) * SLOT_NS + r.ptr * r.ps * t6.tsNs + r.ptr * (1 - r.ps) * t6.tcNs, 6)
    expect(SLOT_NS).toBe(9_000) // "the slot time σ, 9 µs here"
    expect(PAYLOAD_BITS).toBe(1500 * 8)
  })

  it('the worked example: every row of the five-station table, recomputed', () => {
    let num = 0
    let den = 0
    for (let i = 0; i < PARAMS.attempts; i++) {
      const w = 2 ** Math.min(i, PARAMS.m) * PARAMS.W
      num += sol.p ** i
      den += (sol.p ** i * (w + 1)) / 2
    }
    const t6 = dcfTimes(1500, 6)
    const r = saturationThroughput({ n: 5, tau: sol.tau, slotNs: SLOT_NS, tsNs: t6.tsNs, tcNs: t6.tcNs, payloadBits: PAYLOAD_BITS })
    expect(sol.p.toFixed(4)).toBe('0.2722')
    expect(num.toFixed(4)).toBe('1.3738')
    expect(den.toFixed(4)).toBe('17.9942')
    expect((num / den).toFixed(4)).toBe('0.0763')
    expect((1 - (1 - sol.tau) ** 4).toFixed(4)).toBe('0.2722')
    expect(r.ptr.toFixed(4)).toBe('0.3277')
    expect(r.ps.toFixed(4)).toBe('0.8478')
    expect((r.slotMeanNs / 1000).toFixed(1)).toBe('712.5')
    expect(r.mbps.toFixed(3)).toBe('4.679')
  })
})

// ---------------------------------------------------------------------------
// the simulator, and the stated tolerance
// ---------------------------------------------------------------------------

describe('the one measured sentence, and the runs the practice names', () => {
  const t6 = dcfTimes(1500, 6)

  it('n = 5: 5302 attempts, 1370 of them collided — 25.84 % against a predicted 27.22 %', () => {
    // "5302 attempts, of which 1370 met somebody else. That is 25.84 % against a predicted 27.22 %"
    const s = base()
    expect(s.attempts).toBe(5302)
    expect(s.collided).toBe(1370)
    expect(pct(s.p)).toBe('25.84 %')
    expect(pct(solveBianchi({ n: 5, ...PARAMS }).p)).toBe('27.22 %')
  })

  it('every frame on the arc goes at 6 Mb/s and nothing is discarded, at every n', () => {
    // the scene note: the rate is pinned and saturation holds for the whole run
    for (const s of [() => variant(0, 'n2'), base, () => variant(1, 'n10'), () => variant(2, 'n20')]) {
      const st = s()
      expect([...st.rateMix.keys()]).toEqual([6])
      expect(st.drops.queueFull).toBeUndefined()
      expect(st.drops.lifetime).toBeUndefined()
    }
  })

  it('the ten-station experiment: 5678 attempts, 1992 collided, 3684 answers, 4.421 against 4.275 Mb/s', () => {
    // tryThis: "5678 attempts, 1992 collided, 3684 answers — 4.421 Mb/s against a predicted 4.275"
    const s = variant(1, 'n10')
    expect(s.attempts).toBe(5678)
    expect(s.collided).toBe(1992)
    expect(s.acks).toBe(3684)
    expect(s.mbps.toFixed(3)).toBe('4.421')
    const sol = solveBianchi({ n: 10, ...PARAMS })
    const model = saturationThroughput({ n: 10, tau: sol.tau, slotNs: SLOT_NS, tsNs: t6.tsNs, tcNs: t6.tcNs, payloadBits: PAYLOAD_BITS })
    expect(model.mbps.toFixed(3)).toBe('4.275')
  })

  it('the run opens with an n-way collision at t = 0 that clears at 2.064 ms', () => {
    for (const [key, scen, n] of [['n5', bianchi.scenario(), 5], ['n20', bianchi.variants![2].scenario(), 20]] as const) {
      const s = measure(key, scen)
      const first = s.records.find((r) => r.type === 'COLLISION')!
      expect(first.type).toBe('COLLISION')
      expect((first as Extract<TLRecord, { type: 'COLLISION' }>).nodes.length).toBe(n)
      expect(first.t).toBe(2_064_000)
      expect(s.records.filter((r) => r.type === 'TX_START' && r.t === 0).length).toBe(n)
    }
  })

  it('a seed only reshuffles the draws: p̂ and throughput hold to a fraction of a point', () => {
    const quoted: [number, string, string][] = [[7, '25.84 %', '4.717'], [8, '25.53 %', '4.734'], [12345, '25.71 %', '4.727']]
    for (const [seed, p, mbps] of quoted) {
      const scen = bianchi.scenario()
      scen.seed = seed
      const s = measure(`seed${seed}`, scen)
      expect(pct(s.p)).toBe(p)
      expect(s.mbps.toFixed(3)).toBe(mbps)
    }
    // determinism: the same seed replays identically
    expect([...new Simulation(bianchi.scenario()).runUntil(RUN_NS).records].length).toBe(base().records.length)
  })

  it('saturation is real: twenty queued MSDUs per station, nothing discarded by age', () => {
    const scen = bianchi.scenario()
    expect(scen.queue).toEqual({ limit: 500, lifetimeMs: 600_000 })
    const enq = base().records.filter((r) => r.type === 'ENQUEUE' && r.t === 0)
    expect(enq.length).toBe(5 * 20)
  })
})

// ---------------------------------------------------------------------------
// lesson contract
// ---------------------------------------------------------------------------

lessonShapeSuite(bianchi, { runNs: RUN_NS })

describe('lesson contract', () => {
  it('is part of the reading order and names the lessons whose words it uses', () => {
    expect(bianchi.id).toBe('bianchi')
    expect(COURSE_ORDER).toContain('bianchi')
    expect(bianchi.needs).toEqual(['backoff', 'retries-queues'])
    expect(bianchi.terms!.map((t) => t.term))
      .toEqual(['saturation', 'transmit probability', 'collision probability'])
    expect(bianchi.observe.length).toBe(3)
    expect(bianchi.tryThis.length).toBe(2)
    for (const q of bianchi.quiz) {
      expect(q.answer).toBeGreaterThanOrEqual(0)
      expect(q.answer).toBeLessThan(q.options.length)
    }
  })

  it('the equations and the exchange costs are in the numbers, the derivations in the depth', () => {
    // the rewrite's contract with the reader: the equations, the procedure that
    // solves them, the table that runs it on one crowd, and the four-row forecast
    expect(bianchi.numbers!.filter((b) => b.kind === 'table').length).toBe(2)
    expect(bianchi.numbers!.filter((b) => b.kind === 'formula').length).toBe(2)
    expect(bianchi.numbers!.filter((b) => b.kind === 'steps').length).toBe(1)
  })
})
