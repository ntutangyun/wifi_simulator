/**
 * Pins "Predicting collisions on paper": the solver against an independently
 * derived fixed point, the engine constants T_s and T_c are built from, and
 * every number the rewritten lesson quotes.
 *
 * The contract of the lesson (shape, jumps, the first watch) comes
 * from `lessonShapeSuite`. The four-row model-against-run table moved to the
 * companion lesson in the rewrite, and its pins moved with it, to
 * tests/course/bianchi-vs-sim.test.ts; what stays here is the one measured
 * sentence this lesson still makes ("5302 attempts, of which 1370 met somebody
 * else") plus the runs the observations and experiments name.
 */
import { describe, it, expect } from 'vitest'
import { bianchi, bianchiSlotTiming } from '../../src/course/tier1/bianchi'
import type { TimingLane } from '../../src/course/diagram'
import type { Block } from '../../src/course/lessonKit'
import { dcfTimes, saturationThroughput, solveBianchi, tauOf } from '../../src/course/tier1/bianchiModel'
import { COURSE_ORDER } from '../../src/course/curriculum'
import { LESSONS } from '../../src/course/lessons'
import { Simulation } from '../../src/engine/simulation'
import type { Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite } from './kit'
import {
  ACK_TIMEOUT_NS, CW_MAX, CW_MIN, DIFS_NS, FCS_BYTES, MAC_HDR_BYTES, RATES, SHORT_RETRY_LIMIT,
  SIFS_NS, SLOT_NS, dataRateFor, noiseDbm,
} from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'
import { lessonTexts } from '../../src/course/readability'
import { readFileSync } from 'node:fs'

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
    // Re-pacing 2026-09-25 §6, in full now that batch 4 has landed: the deadline and the
    // doubled window are `collisions-cw`'s, and the deep queue that keeps a station
    // saturated is `queues`', which itself needs `retries-queues` (where L = 7 lives).
    expect(bianchi.needs).toEqual(['collisions-cw', 'queues'])
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
    // §8 rejected the split, so this lesson owns the pricing too — and therefore
    // ONE procedure, not two: solve the fixed point, then price a slot with it.
    expect(bianchi.numbers!.filter((b) => b.kind === 'steps').length).toBe(1)
    expect(bianchi.numbers!.filter((b) => b.kind === 'diagram').length).toBe(1)
  })
})

/**
 * The timing figure the 2026-09-25 re-pacing added (§8: a whole `bianchi` "loses
 * padding and gains a diagram"; §4 assigns exactly this figure — the three kinds
 * of slot and what each is worth — to the pricing material, which is now this
 * lesson's). It replaced the three-sentence enumeration of the slot kinds in
 * 「从一个概率，到一个比特数」.
 *
 * What is pinned is that the picture is the engine: every boundary in it comes
 * from `dcfTimes` and `SLOT_NS`, not from a typed-in number, so the figure cannot
 * drift from the formula above it. The geometry (viewBox, collisions, legibility)
 * is checked course-wide by tests/course/diagram.test.ts.
 */
describe('the three kinds of slot, as a figure', () => {
  const t = dcfTimes(1500, 6)
  const lane = (label: string): TimingLane => bianchiSlotTiming().lanes.find((l) => l.label === label)!

  it('draws σ, T_s and T_c from the engine, to scale on one axis', () => {
    const spec = bianchiSlotTiming()
    expect(spec.lanes.map((l) => l.label)).toEqual(['空的', '成功的', '碰撞的'])

    // the empty slot is the slot time itself
    expect(lane('空的').spans).toEqual([{ label: '9 µs', fromUs: 0, toUs: SLOT_NS / 1000 }])
    expect(SLOT_NS / 1000).toBe(9)

    // a successful slot: the frame, then everything the frame does not pay for
    const ok = lane('成功的').spans
    expect(ok[0].toUs).toBe(t.dataNs / 1000)
    expect(ok[1].toUs).toBe(t.tsNs / 1000)
    expect(ok[1].toUs - ok[1].fromUs).toBe((t.tsNs - t.dataNs) / 1000)
    expect(ok[1].label).toBe('回答与等待 94 µs')

    // a collided slot ends 15 µs earlier, which is the lesson's own T_c − T_s
    const bad = lane('碰撞的').spans
    expect(bad[0].toUs).toBe(t.dataNs / 1000)
    expect(bad[1].toUs).toBe(t.tcNs / 1000)
    expect(bad[1].label).toBe('期限与等待 79 µs')
    expect(t.tsNs - t.tcNs).toBe(15_000)

    // the axis holds every span, so nothing in the figure is clipped by its own scale
    const spec2 = bianchiSlotTiming()
    for (const l of spec2.lanes) for (const s of l.spans) expect(s.toUs).toBeLessThanOrEqual(spec2.axis.toUs)
  })

  it('the caption is true of the figure: the empty slot is under 1 % of a successful one', () => {
    // 「空的那一条几乎看不见，而碰撞的那一条几乎和成功的一样长」
    expect(SLOT_NS / t.tsNs).toBeLessThan(0.01)
    expect(t.tcNs / t.tsNs).toBeGreaterThan(0.99)
  })
})

/**
 * **The ruler for this lesson's `until: 'fading'` (added 2026-10-05 by slice 4e's fix 2).**
 *
 * `until` renders as 「（这一条在《…》里会被解除）」 — a promise that the named lesson REMOVES
 * the simplification — and `tests/course/limits.test.ts` now requires that the source lesson's
 * own test file say something about its target, because the half of criterion B that asked for
 * a ruler in prose had already been missed three times on the day it was written. This file was
 * one of the three: it mentioned `fading` nowhere, in any spelling.
 *
 * The promise itself is sound, and its `kind` was corrected to `out-of-scope` when the `fading`
 * lesson landed. That correction is the point worth keeping: 「固定速率」 is not a thing the
 * engine lacks — both fading layers have existed since the selectivity slice — it is a thing
 * THIS scene declines to switch on, which the limit's own words already say
 * (「不是引擎里的一个开关，而是布置出来的」). An `unmodelled` version of this limit could not
 * have been lifted by any lesson, since every lesson runs the same engine.
 */
describe('bianchi · the fixed-rate premise, and the lesson that takes it away', () => {
  const lim = bianchi.limits.find((l) => l.until === 'fading')

  it('promises a lift, on the kind that a lift is coherent about', () => {
    expect(lim, 'the fixed-rate limit no longer points at `fading`').toBeDefined()
    expect(lim!.kind).toBe('out-of-scope')
    expect(lim!.seeAlso, 'a lift and a deeper read are different promises').toBeUndefined()
    // the limit says the premise is arranged rather than absent, which is why it is a scenario class
    expect(lim!.text).toContain('不是引擎里的一个开关，而是布置出来的')
    expect(lim!.text).toContain('本课那两张表立刻不再适用')
  })

  it('and the axis is a top-level scenario section, absent here and written there', () => {
    const own = [bianchi.scenario(), ...(bianchi.variants ?? []).map((v) => v.scenario())]
    expect(own.length).toBeGreaterThan(1)
    for (const [i, sc] of own.entries()) {
      expect(sc.fading, `bianchi scene ${i} writes a fading section`).toBeUndefined()
    }
    const target = LESSONS.find((l) => l.id === 'fading')!
    const theirs = [target.scenario(), ...(target.variants ?? []).map((v) => v.scenario())]
    // not every variant: that lesson keeps one deliberate control with no section at all
    expect(theirs.filter((sc) => sc.fading !== undefined).length).toBeGreaterThan(1)
    expect(COURSE_ORDER.indexOf('fading')).toBeGreaterThan(COURSE_ORDER.indexOf('bianchi'))
  })
})

// --- every figure the lesson prints ------------------------------------------------------------

/**
 * **The `quotes(...)` helper above was retired on 2026-09-25 for a good reason, and nothing took
 * its place.** It searched everything a learner reads for each figure the lesson prints, so any
 * occurrence anywhere satisfied it — which is not a pin. Every claim it had guarded was then
 * recomputed from the model or measured off the run, and the figures were retyped on this side:
 * `rows`, `quoted`, `expect(s.attempts).toBe(5302)`. That pins the model and frees the prose.
 * `scripts/figure-planting.ts` measured the result on 2026-10-12: six figures planted in the
 * lesson's own tables, six plantings unnoticed, 129 plantable figures in the lesson.
 *
 * So the figures below are read back out of the lesson. Three kinds of reading, and the middle one
 * is what this lesson needs more than any other:
 *
 *  - **a value** — the four model rows, the worked example, the two measured runs: read the cell,
 *    recompute it, compare to the cell's own decimals.
 *  - **an equation** — 「Σ_{i<L} p^i (W_i + 1)/2」, 「p = 1 − (1−τ)^(n−1)」, 「P_s = n·τ·(1 − τ)^(n−1)
 *    ÷ P_tr」, and Bianchi's own closed form. Half of this lesson's figures are the 1s and 2s
 *    INSIDE the algebra, where 「the right value」 is not a number but the identity the formula
 *    asserts. Each is read out of the printed formula and fed back into the computation it
 *    describes: if the printed offset or exponent is edited, the recomputation stops matching
 *    `tauOf` or `saturationThroughput`.
 *  - **a citation** — §10.3.4.3, Table 17-29, INFOCOM 2002: no corpus here, counted and skipped.
 */
describe('bianchi · every figure the lesson prints, read back out of its own prose', () => {
  const EVERYWHERE = lessonTexts(bianchi).map((t) => t.text).join('\n')
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
  type Tbl = { kind: 'table'; heading?: string; head: string[]; rows: string[][] }
  const tableOf = (heading: string): Tbl => {
    const t = (bianchi.numbers ?? []).filter((b): b is Tbl => b.kind === 'table')
      .find((b) => (b.heading ?? '').startsWith(heading))
    expect(t, `the table 「${heading}」 is gone`).toBeDefined()
    return t!
  }
  const rowOf = (heading: string, starts: string): string[] => {
    const r = tableOf(heading).rows.find((x) => x[0].startsWith(starts))
    expect(r, `the row 「${starts}」 is gone from 「${heading}」`).toBeDefined()
    return r!
  }
  const formulas = (bianchi.numbers ?? []).filter(
    (b): b is { kind: 'formula'; heading?: string; text: string; note?: string } =>
      b.kind === 'formula')
  const formulaWith = (needle: string) => {
    const f = formulas.find((x) => x.text.includes(needle))
    expect(f, `no formula prints 「${needle}」 any more`).toBeDefined()
    return f!
  }
  const steps = (bianchi.numbers ?? []).find(
    (b): b is { kind: 'steps'; heading?: string; items: string[] } => b.kind === 'steps')!
  const STEPS = steps.items.join('\n')
  const MS = 1_000_000
  /**
   * The frame and the rate the whole lesson is worked at, read out of its own `sources` rather
   * than retyped: every airtime below is `dcfTimes` of these two, so editing either figure in the
   * lesson moves every µs it prints, and this file recomputes them.
   */
  const MSDU_BYTES = Number(/(\d+) 字节的载荷在空口上是/.exec(EVERYWHERE)![1])
  const SLOW_MBPS = Number(/在 (\d+) Mb\/s 下为/.exec(EVERYWHERE)![1])

  /** The window of attempt i, exactly as the lesson's own 「W_i = 2^min(i,m)·W」 reads it. */
  const stageW = (i: number, W: number, m: number, base: number): number =>
    base ** Math.min(i, m) * W

  it('the pair of equations, and the four numbers its note names', () => {
    const f = formulaWith('τ = Σ')
    // 「τ = Σ_{i<L} p^i / Σ_{i<L} p^i (W_i + 1)/2」: the offset and the halving are the algebra,
    // so they are read out of the formula and put back into it — the identity is the pin.
    const [offset, half] = figs(f.text, /p\^i \(W_i \+ (\d+)\)\/(\d+)/, 'the denominator of τ')
    const [attempts, pow, W, m] = figs(f.note!,
      /L = (\d+) 是一帧拿到的尝试次数，W_i = (\d+)\^min\(i,m\)·W 是第 i 次尝试时的窗口，其中 W = (\d+)、m = (\d+)/,
      'the four numbers the note names')
    expect([W, m, attempts], 'the window, the doublings and the attempts this MAC gives a frame')
      .toEqual([CW_MIN + 1, Math.log2((CW_MAX + 1) / (CW_MIN + 1)), SHORT_RETRY_LIMIT])
    expect(pow, 'and the window doubles').toBe(2)
    // the two sums, written with the lesson's own constants, are `tauOf`
    const p = solveBianchi({ n: 5, W, m, attempts }).p
    let num = 0
    let den = 0
    for (let i = 0; i < attempts; i++) {
      num += p ** i
      den += (p ** i * (stageW(i, W, m, pow) + offset)) / half
    }
    expect(num / den, 'the lesson’s own two sums are the solver’s τ')
      .toBeCloseTo(tauOf(p, { W, m, attempts }), 12)
    // 「p = 1 − (1−τ)^(n−1)」: the same reading, on the definition of a collision
    const [one, oneB, less] = figs(f.text, /p = (\d+) − \((\d+)−τ\)\^\(n−(\d+)\)/, 'the definition of p')
    const n = 5
    const tau = tauOf(p, { W, m, attempts })
    expect(one - (oneB - tau) ** (n - less), 'the lesson’s own definition is the solver’s p')
      .toBeCloseTo(p, 12)
  })

  it('the model table: four rows, each one the solver and the throughput formula', () => {
    const t = tableOf('这两个方程预测出什么')
    const [fastMbps, slowMbps] = [t.head[3], t.head[4]].map((h) =>
      val(raw(h, /(\d+) Mb\/s 下的吞吐/, 'the rate this column is quoted at')[0]))
    for (const mbps of [fastMbps, slowMbps]) {
      expect(RATES.map((r) => r.mbps), `${mbps} Mb/s is a rate this engine has`).toContain(mbps)
    }
    const fastT = dcfTimes(MSDU_BYTES, fastMbps)
    const slowT = dcfTimes(MSDU_BYTES, slowMbps)
    expect(t.rows, 'the table still has its four crowds').toHaveLength(4)
    for (const r of t.rows) {
      const n = val(r[0])
      const sol = solveBianchi({ n, ...PARAMS })
      same(r[1], sol.tau, `n = ${n}: the per-slot transmit probability`)
      same(r[2].replace(' %', ''), 100 * sol.p, `n = ${n}: the collision probability`)
      const S = (times: { tsNs: number; tcNs: number }): number => saturationThroughput({
        n, tau: sol.tau, slotNs: SLOT_NS, tsNs: times.tsNs, tcNs: times.tcNs,
        payloadBits: PAYLOAD_BITS,
      }).mbps
      same(r[3], S(fastT), `n = ${n}: what it delivers at ${fastMbps} Mb/s`)
      same(r[4].replace(' Mb/s', ''), S(slowT), `n = ${n}: and at ${slowMbps} Mb/s`)
    }
  })

  it('the cost of a success and of a collision, term by term', () => {
    const f = formulaWith('T_s =')
    const [msdu, dataUs] = figs(f.note!, /(\d+) 字节的帧在慢速率上占 (\d+) µs 空口时间/,
      'the frame the note sizes')
    const t = dcfTimes(msdu, SLOW_MBPS)
    same(String(dataUs), t.dataNs / 1000, 'the data frame on the air')
    const [d1, sifs, ack, difs, ts] = figs(f.text,
      /T_s = (\d+) \+ (\d+) \+ (\d+) \+ (\d+) = (\d+) µs/, 'the four terms of a success')
    expect(d1, 'the same frame').toBe(dataUs)
    expect([sifs * 1000, difs * 1000], 'the two waits this engine keeps')
      .toEqual([SIFS_NS, DIFS_NS])
    same(String(ack), t.ackNs / 1000, 'the answer, at the control-response rate')
    same(String(ts), t.tsNs / 1000, 'and what the four come to')
    const [d2, timeout, difs2, tc] = figs(f.text,
      /T_c = (\d+) \+ (\d+) \+ (\d+) = (\d+) µs/, 'the three terms of a collision')
    expect(d2, 'the same frame again').toBe(dataUs)
    expect([timeout * 1000, difs2 * 1000], 'the timeout and the wait after it')
      .toEqual([ACK_TIMEOUT_NS, DIFS_NS])
    same(String(tc), t.tcNs / 1000, 'and what a collision costs')
    // the ACK's own duration is restated in `numbers` and in `sources`
    for (const v of everyFig(/一个确认帧（ACK）——这里 (\d+) µs|控制响应速率发送，(\d+) µs/g,
      'the answer’s duration', 2)) {
      same(v, t.ackNs / 1000, 'the ACK, wherever the lesson gives its length')
    }
  })

  it('the seven steps: the four numbers, the bracket, the slot, and the payload', () => {
    const [W, m, attempts] = figs(STEPS,
      /W = (\d+)，最小的窗口；m = (\d+)，窗口最多还能翻几倍；L = (\d+)/, 'the four numbers of step 1')
    expect([W, m, attempts], 'the engine’s own window, doublings and attempts')
      .toEqual([CW_MIN + 1, Math.log2((CW_MAX + 1) / (CW_MIN + 1)), SHORT_RETRY_LIMIT])
    // step 2 restates the stage window and the two sums
    const [pow] = figs(STEPS, /W_i = (\d+)\^min\(i,m\)·W/, 'step 2 on the stage window')
    const [offset, half] = figs(STEPS, /p\^i\(W_i \+ (\d+)\)\/(\d+) 加起来作分母/,
      'step 2 on the denominator')
    expect([pow, offset, half], 'the same algebra the formula prints').toEqual([2, 1, 2])
    // step 3: 「(1 − τ) 的 n − 1 次方」
    const [oneA, lessA] = figs(STEPS, /概率是 \((\d+) − τ\) 的 n − (\d+) 次方/, 'step 3')
    expect([oneA, lessA], 'one minus τ, over the other stations').toEqual([1, 1])
    // step 4: the bracket the solver really bisects
    const [lo, hi] = figs(STEPS, /把 (\d+) 到 (\d+) 二分/, 'the bracket step 4 halves')
    for (const n of [2, 5, 10, 20]) {
      const { p } = solveBianchi({ n, ...PARAMS })
      expect(p, `n = ${n}: the root is inside the bracket`).toBeGreaterThan(lo)
      expect(p, `n = ${n}: and below its top`).toBeLessThan(hi)
    }
    // steps 5 and 6: P_tr, P_s and the weighted mean, read off the step and recomputed
    const [ptrOne] = figs(STEPS, /P_tr = (\d+) − \(1 − τ\)\^n/, 'step 5 on P_tr')
    const [psOne, psLess] = figs(STEPS, /P_s = n·τ·\((\d+) − τ\)\^\(n−(\d+)\) ÷ P_tr/, 'step 5 on P_s')
    const [wOne] = figs(STEPS, /那三种情形：\((\d+) − P_tr\)σ/, 'step 6 on the empty slot')
    const [wOneB] = figs(STEPS, /P_tr\((\d+) − P_s\)T_c/, 'step 6 on the collision')
    const [slotUs] = figs(STEPS, /σ 是时隙长度，这里 (\d+) µs/, 'the slot step 6 weights with')
    expect(slotUs * 1000, 'the slot this engine counts in').toBe(SLOT_NS)
    const n = 5
    const sol = solveBianchi({ n, ...PARAMS })
    const t6 = dcfTimes(MSDU_BYTES, SLOW_MBPS)
    const model = saturationThroughput({
      n, tau: sol.tau, slotNs: SLOT_NS, tsNs: t6.tsNs, tcNs: t6.tcNs, payloadBits: PAYLOAD_BITS,
    })
    expect(ptrOne - (1 - sol.tau) ** n, 'step 5’s own P_tr').toBeCloseTo(model.ptr, 12)
    expect((n * sol.tau * (psOne - sol.tau) ** (n - psLess)) / model.ptr, 'and its own P_s')
      .toBeCloseTo(model.ps, 12)
    expect((wOne - model.ptr) * SLOT_NS + model.ptr * model.ps * t6.tsNs
      + model.ptr * (wOneB - model.ps) * t6.tcNs, 'and step 6’s own weighted mean')
      .toBeCloseTo(model.slotMeanNs, 6)
    // step 7: the payload a success carries
    const [bits] = figs(STEPS, /E\[P\] = ([\d,]+) 比特/, 'the payload of step 7')
    expect(bits, 'eight bits for every byte of the MSDU').toBe(8 * MSDU_BYTES)
    expect(bits, 'which is what the throughput is computed with').toBe(PAYLOAD_BITS)
  })

  it('the worked example: every row of the five-station table', () => {
    const [n, W, m, attempts] = figs(rowOf('五台站点', 'n、W、m、L')[1],
      /(\d+), (\d+), (\d+), (\d+)/, 'the crowd and the three MAC numbers')
    expect([W, m, attempts], 'the engine’s own three')
      .toEqual([CW_MIN + 1, Math.log2((CW_MAX + 1) / (CW_MIN + 1)), SHORT_RETRY_LIMIT])
    expect(n, 'and the crowd this lesson’s own scene has')
      .toBe(bianchi.scenario().nodes.filter((x) => x.profiles.includes('saturated')).length)
    const sol = solveBianchi({ n, W, m, attempts })
    same(rowOf('五台站点', '同时满足两句话的 p')[1], sol.p, 'the p that satisfies both sentences')
    /*
     * The two sums are computed at the SOLVED p, not at the four-decimal p the row above prints:
     * Σ p^i at 0.2722 is 1.3739 and at the p the solver holds it is 1.3738, which is the figure
     * the lesson prints. That is the right way round — a worked example whose intermediate
     * values were themselves rounded would end somewhere the model does not — and it is the
     * same trap as the −2.858 of `@uwb-acquisition`, seen from the other side.
     */
    let num = 0
    let den = 0
    for (let i = 0; i < attempts; i++) {
      num += sol.p ** i
      den += (sol.p ** i * (stageW(i, W, m, 2) + 1)) / 2
    }
    same(rowOf('五台站点', '分子')[1], num, 'the numerator')
    same(rowOf('五台站点', '分母')[1], den, 'the denominator')
    same(rowOf('五台站点', '= τ')[1], sol.tau, 'and the τ they give')
    // 「1 − (1 − τ)^4」 = 「0.2722 ✓」: the exponent is n − 1, and the value closes the loop
    const [, , exp] = figs(rowOf('五台站点', '1 − (1 − τ)')[0], /(\d+) − \((\d+) − τ\)\^(\d+)/,
      'the exponent the row raises to')
    expect(exp, 'one fewer than the crowd').toBe(n - 1)
    const back = rowOf('五台站点', '1 − (1 − τ)')[1]
    expect(back.endsWith('✓'), 'the row claims the loop closes').toBe(true)
    same(back.replace(' ✓', ''), 1 - (1 - sol.tau) ** exp, 'and it does')
    const t6 = dcfTimes(MSDU_BYTES, SLOW_MBPS)
    const model = saturationThroughput({
      n, tau: sol.tau, slotNs: SLOT_NS, tsNs: t6.tsNs, tcNs: t6.tcNs, payloadBits: PAYLOAD_BITS,
    })
    same(rowOf('五台站点', 'P_tr')[1], model.ptr, 'P_tr')
    same(rowOf('五台站点', 'P_s')[1], model.ps, 'P_s')
    same(rowOf('五台站点', '平均时隙')[1].replace(' µs', ''), model.slotMeanNs / 1000,
      'the mean slot')
    same(rowOf('五台站点', '吞吐')[1].replace(' Mb/s', ''), model.mbps, 'and the throughput')
  })

  it('the measured sentences: the five-station run, the ten-station run and the three seeds', () => {
    const five = base()
    const [attempts, collided, measured, predicted] = raw(EVERYWHERE,
      /跑十秒：([\d,]+) 次尝试，其中 ([\d,]+) 次撞上了别人，也就是 ([\d.]+)%，而预测是 ([\d.]+)%/,
      'the one measured sentence')
    expect(val(attempts), 'the attempts the run really made').toBe(five.attempts)
    expect(val(collided), 'and how many of them met somebody else').toBe(five.collided)
    same(measured, 100 * five.p, 'the share that collided')
    same(predicted, 100 * solveBianchi({ n: 5, ...PARAMS }).p, 'against the prediction')
    // `tryThis`: the ten-station experiment
    const ten = variant(1, 'n10')
    const [a10, c10, acks, got, want] = raw(bianchi.tryThis.join('\n'),
      /([\d,]+) 次尝试、([\d,]+) 次碰撞、([\d,]+) 个回答——([\d.]+) Mb\/s，预测是 ([\d.]+)/,
      'the ten-station experiment')
    expect([val(a10), val(c10), val(acks)], 'what the ten-station run really did')
      .toEqual([ten.attempts, ten.collided, ten.acks])
    same(got, ten.mbps, 'what it delivered')
    const t6 = dcfTimes(MSDU_BYTES, SLOW_MBPS)
    const sol10 = solveBianchi({ n: 10, ...PARAMS })
    same(want, saturationThroughput({
      n: 10, tau: sol10.tau, slotNs: SLOT_NS, tsNs: t6.tsNs, tcNs: t6.tcNs,
      payloadBits: PAYLOAD_BITS,
    }).mbps, 'against what the model predicts for ten')
    // the three seeds, and the three percentages they give
    const seeds = figs(bianchi.tryThis.join('\n'), /种子 ([\d,]+)、([\d,]+)、([\d,]+) 给出/,
      'the three seeds')
    const shares = raw(bianchi.tryThis.join('\n'),
      /给出 ([\d.]+)%、([\d.]+)%、([\d.]+)%/, 'the three shares they give')
    expect(seeds[0], 'the first of them is the scene’s own seed').toBe(bianchi.scenario().seed)
    for (const [i, seed] of seeds.entries()) {
      const scen = bianchi.scenario()
      scen.seed = seed
      same(shares[i], 100 * measure(`seed${seed}`, scen).p, `seed ${seed}: the share that collided`)
    }
  })

  it('`deeper`: the textbook formula, evaluated, and what finite retries move', () => {
    const deep = (bianchi.deeper ?? [])
      .map((b) => `${b.heading ?? ''}\n${'text' in b ? b.text : ''}\n${'note' in b ? b.note ?? '' : ''}`)
      .join('\n')
    const closed = (bianchi.deeper ?? []).find(
      (b): b is { kind: 'formula'; text: string; note?: string } =>
        b.kind === 'formula' && b.text.includes('τ ='))
    expect(closed, 'Bianchi’s own formula is gone from `deeper`').toBeDefined()
    // 「τ = 2(1−2p) / [(1−2p)(W+1) + pW(1−(2p)^m)]」 — every constant inside it, put back into it
    const c = figs(closed!.text,
      /τ = (\d)\((\d)−(\d)p\) \/ \[\((\d)−(\d)p\)\(W\+(\d)\) \+ pW\((\d)−\((\d)p\)\^m\)\]/,
      'the textbook closed form')
    const W = CW_MIN + 1
    const m = Math.log2((CW_MAX + 1) / (CW_MIN + 1))
    const inf = solveBianchi({ n: 20, W, m })
    const p = inf.p
    const printed = (c[0] * (c[1] - c[2] * p))
      / ((c[3] - c[4] * p) * (W + c[5]) + p * W * (c[6] - (c[7] * p) ** m))
    expect(printed, 'the printed formula is the infinite-retry τ this model solves')
      .toBeCloseTo(inf.tau, 10)
    // 「把 (1 − (2p)^m)/(1 − 2p) 按 Σ_{k<m}(2p)^k 这个和来算，p = ½ 就只是一个普通点」
    const [sumTwo] = figs(deep, /按 Σ_\{k<m\}\((\d)p\)\^k 这个和来算/, 'the sum it is rewritten as')
    let geo = 0
    for (let k = 0; k < m; k++) geo += (sumTwo * 0.5) ** k
    expect(Number.isFinite(2 / (W + 1 + 0.5 * W * geo)),
      'the sum form really is finite at p = ½, where the quotient is 0/0').toBe(true)
    expect(figs(deep, /而不是 (\d)\/(\d)/, 'the quotient it avoids'), 'zero over zero')
      .toEqual([0, 0])
    // 「从 48.09% 抬到 49.59%」: the two solvers at twenty stations
    const [without, with_] = raw(deep, /碰撞概率从 ([\d.]+)% 抬到 ([\d.]+)%/,
      'what the finite chain moves')
    same(without, 100 * inf.p, 'the infinite chain’s own collision probability')
    same(with_, 100 * solveBianchi({ n: 20, ...PARAMS }).p, 'and the finite one’s')
    const twenty = tableOf('这两个方程预测出什么').rows.find((r) => val(r[0]) === 20)!
    same(with_, 100 * solveBianchi({ n: val(twenty[0]), ...PARAMS }).p,
      'which is the figure the table prints, as `deeper` says it is')
    // 「n − 1 枚同样的硬币」 and the exponents of the second equation, wherever `deeper` writes them
    for (const v of everyFig(/n − (\d+) 台站点|n − (\d+) 枚同样的硬币|\^\(n−(\d+)\)/g,
      'one fewer than the crowd', 4)) {
      expect(val(v), 'the other stations are all but this one').toBe(1)
    }
  })

  it('`limits`, `sources` and `observe`: the arrangement, the clauses’ own values, and the run', () => {
    const lim = bianchi.limits.map((x) => x.text).join('\n')
    const src = (bianchi.sources ?? []).join('\n')
    const scen = bianchi.scenario()
    // 「−20 dBm 的发射功率、种子 7」 — in `limits` AND in `sources`
    for (const where of [lim, src]) {
      const [dbm, seed] = figs(where, /−(\d+) dBm 的发射功率、种子 (\d+)/,
        'the transmit power and the seed the arrangement uses')
      expect(-dbm, 'what every station whispers at')
        .toBe(scen.nodes.find((x) => x.id === 'sta-1')!.txPowerDbm)
      expect(seed, 'and the seed').toBe(scen.seed)
    }
    // 「channel.ts 的 CAPTURE_MARGIN_DB = 5 dB」 and 「mac.ts 按精确的 9 µs」
    // `CAPTURE_MARGIN_DB` is file-local, and the claim is about the constant by name: so it is
    // read where the sentence says it is, in the file the sentence names.
    const [capture] = figs(lim, /CAPTURE_MARGIN_DB = (\d+) dB/, 'the capture margin it names')
    expect(readFileSync('src/engine/channel.ts', 'utf8'),
      '`channel.ts` really defines it at that value').toContain(`CAPTURE_MARGIN_DB = ${capture}`)
    expect(figs(lim, /按精确的 (\d+) µs 排下一次递减/, 'the slot it decrements on')[0] * 1000)
      .toBe(SLOT_NS)
    // 「aCWmin 15 与 aCWmax 1023 … 于是 W = 16、m = 6」
    const [cwMin, cwMax] = figs(src, /aCWmin (\d+) 与 aCWmax (\d+)/, 'the two the clause fixes')
    expect([cwMin, cwMax], 'the engine’s own window bounds').toEqual([CW_MIN, CW_MAX])
    const [wAgain, mAgain] = figs(src, /于是 W = (\d+)、m = (\d+)/, 'what they come to')
    expect(wAgain, 'the first window is one more than aCWmin').toBe(cwMin + 1)
    expect(2 ** mAgain * (cwMin + 1), 'and the doublings take it to aCWmax').toBe(cwMax + 1)
    // 「1500 字节的载荷在空口上是 1528 字节 … 为 2064 µs」
    const [msdu, onAir] = figs(src, /(\d+) 字节的载荷在空口上是 (\d+) 字节/, 'the frame on the air')
    expect(msdu + MAC_HDR_BYTES + FCS_BYTES, 'the header and the check this engine adds')
      .toBe(onAir)
    expect(msdu, 'and it is the payload the model carries').toBe(MSDU_BYTES)
    same(raw(src, /下为 (\d+) µs/, 'the airtime that frame takes')[0],
      dcfTimes(msdu, SLOW_MBPS).dataNs / 1000, 'the data frame')
    // `observe`: the opening collision, and every statement of the frame's own length
    const first = base().records.find((r) => r.type === 'COLLISION')!
    const [t0] = figs(bianchi.observe.join('\n'), /在 t = (\d+) 同时发送/, 'when they all start')
    expect(base().records.filter((r) => r.type === 'TX_START' && r.t === t0 * MS).length,
      'every station starts in that instant')
      .toBe(scen.nodes.filter((x) => x.profiles.includes('saturated')).length)
    same(raw(bianchi.observe.join('\n'), /这堆叠加直到 ([\d.]+) ms 才结束/,
      'when the pile-up clears')[0], first.t / MS, 'the end of the opening collision')
    for (const v of everyFig(/都是 (\d+) µs，每个回答|在慢速率上占 (\d+) µs|= (\d+) \+ \d+ \+ \d+ \+ \d+ =|_c = (\d+) \+/g,
      'the data frame’s own airtime', 4)) {
      same(v, dcfTimes(MSDU_BYTES, SLOW_MBPS).dataNs / 1000,
        'the frame, wherever the lesson gives its length')
    }
  })

  /**
   * **What the first pass still left unread, and why each one is interesting.** The sweep's list
   * is short, and every entry on it is a different way for a read to look like a pin:
   *
   *  - **a figure the model is insensitive to.** 「1500 字节的帧在慢速率上占 2064 µs」 — editing
   *    it to 1501 changes no airtime at all, because 1529 octets and 1528 need the same 511
   *    symbols. The airtime cannot catch it; the sentence in `sources` can, since 1501 + 28 is
   *    not 1528. So every statement of the payload is read against the one that is checkable.
   *  - **an inequality where the lesson states a value.** 「把 0 到 1 二分五十次」 was read as
   *    「the root is inside the bracket」, and a bracket of [0, 2] contains it just as well. The
   *    bracket is the unit interval because p is a probability, and it is the interval
   *    `solveBianchi` itself bisects — so the claim is read where it is made, in that file.
   *  - **algebra outside the formula.** 「p^i(W_i + 1)/2」 is printed four times: in the formula,
   *    in step 2, in a row LABEL of the worked table (found by its prefix, so the 1 and the 2
   *    inside it were never read), and in `deeper`. Now every occurrence is read against the
   *    formula's own, which is in turn fed back into `tauOf` by the first test of this block.
   */
  it('the figures a read can look like a pin for: the payload, the bracket, the four denominators', () => {
    const deep0 = (bianchi.deeper ?? [])
      .map((b) => [b.heading ?? '', 'text' in b ? b.text : '',
        'note' in b ? b.note ?? '' : ''].join('\n')).join('\n')
    const [sumTwo] = figs(deep0, /按 Σ_\{k<m\}\((\d)p\)\^k/, 'the sum it is rewritten as')
    // every statement of the payload is the same payload, and that one is 1528 octets on the air
    for (const v of everyFig(/(\d+) 字节的帧在慢速率上占|(\d+) 字节的载荷在空口上是/g,
      'the payload the model carries', 2)) {
      expect(val(v), 'the same payload wherever the lesson names it').toBe(MSDU_BYTES)
    }
    expect(MSDU_BYTES + MAC_HDR_BYTES + FCS_BYTES,
      'and that payload is the frame `sources` says goes on the air')
      .toBe(Number(/字节的载荷在空口上是 (\d+) 字节/.exec(EVERYWHERE)![1]))
    // the bracket of step 4 is the unit interval `solveBianchi` bisects
    const [lo, hi] = figs(STEPS, /把 (\d+) 到 (\d+) 二分/, 'the bracket step 4 halves')
    const solver = readFileSync('src/course/tier1/bianchiModel.ts', 'utf8')
    expect(solver, `\`solveBianchi\` starts its bisection at ${lo}`).toContain(`let lo = ${lo}`)
    expect(solver, `and ends it at ${hi}`).toContain(`let hi = ${hi}`)
    // 「p^i(W_i + 1)/2」 at every one of its four sites
    const f = formulaWith('τ = Σ')
    const [offset, half] = figs(f.text, /p\^i \(W_i \+ (\d+)\)\/(\d+)/, 'the denominator of τ')
    const sites = [...EVERYWHERE.matchAll(/p\^i ?\(W_i \+ (\d+)\)\/(\d+)/g)]
      .map((m) => [val(m[1]), val(m[2])])
    expect(sites.length, 'the lesson writes that denominator more than three times')
      .toBeGreaterThan(3)
    for (const pair of sites) {
      expect(pair, 'the same algebra wherever it is written').toEqual([offset, half])
    }
    // and the second equation, wherever it is written: the formula and `deeper` both state it
    const defs = [...EVERYWHERE.matchAll(/(\d+) − \((\d+)−τ\)\^\(n−(\d+)\)/g)]
      .map((m) => m.slice(1).map(val))
    expect(defs.length, 'the lesson states the definition of p more than once')
      .toBeGreaterThan(1)
    // 「把 (1 − (2p)^m)/(1 − 2p) 按 Σ_{k<m}(2p)^k 这个和来算」 — the identity it asserts, at a p
    // where both sides are defined (the sentence's whole point is that only the right-hand side
    // is defined at p = ½).
    const [qa, qb, qc, qd] = figs(deep0,
      /把 \((\d) − \((\d)p\)\^m\)\/\((\d) − (\d)p\) 按/, 'the quotient `deeper` rewrites')
    const m0 = Math.log2((CW_MAX + 1) / (CW_MIN + 1))
    const p0 = 0.3
    let geo0 = 0
    for (let k = 0; k < m0; k++) geo0 += (sumTwo * p0) ** k
    expect((qa - (qb * p0) ** m0) / (qc - qd * p0), 'the quotient and the sum are the same thing')
      .toBeCloseTo(geo0, 9)
    const sol = solveBianchi({ n: 5, ...PARAMS })
    for (const [a, b, c] of defs) {
      expect(a - (b - sol.tau) ** (5 - c), 'every statement of it is the solver’s own p')
        .toBeCloseTo(sol.p, 12)
    }
  })
})
