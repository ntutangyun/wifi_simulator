/**
 * Pins the Bianchi lesson: the solver against an independently derived fixed
 * point, the engine constants T_s and T_c are built from, every number quoted
 * in the prose, the stated model-vs-simulator tolerance, the computed study
 * time and the jump targets. The companion lesson's numbers (where model and
 * simulator part company) are pinned in tier1-bianchi-vs-sim.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { bianchi } from '../../src/course/tier1/bianchi'
import { dcfTimes, saturationThroughput, solveBianchi, tauOf } from '../../src/course/tier1/bianchiModel'
import { COURSE_ORDER, OBSERVE_MINUTES, TRY_MINUTES, lessonMinutes, lessonWords } from '../../src/course/curriculum'
import { Simulation } from '../../src/engine/simulation'
import type { Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block, L10n } from '../../src/course/lessonKit'
import { SLOT_NS, dataRateFor, noiseDbm } from '../../src/engine/phy'
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

/** Every string a learner reads in this lesson, concatenated. */
function allText(): string {
  const parts: string[] = []
  const push = (l?: L10n) => { if (l) parts.push(l.en, l.zh) }
  for (const b of bianchi.body as Block[]) {
    push(b.heading)
    if ('text' in b) push(b.text)
    if (b.kind === 'formula') push(b.note)
    if (b.kind === 'list' || b.kind === 'steps') b.items.forEach(push)
    if (b.kind === 'table') { b.head.forEach(push); b.rows.forEach((row) => row.forEach(push)) }
  }
  bianchi.observe.forEach(push)
  bianchi.tryThis.forEach(push)
  for (const q of bianchi.quiz) { push(q.q); q.options.forEach(push); push(q.explain) }
  return parts.join(' ')
}

const prose = allText()
const quotes = (...needles: string[]) => {
  for (const s of needles) expect(prose, `prose is missing "${s}"`).toContain(s)
}
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
    quotes('Σ_{k<m}(2p)^k')
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
    quotes('T_s = 2064 + SIFS 16 + ACK 44 + DIFS 34 = 2158 µs', 'T_c = 2064 + ACKTimeout 45 + DIFS 34 = 2143 µs', '1528 octets')
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
    quotes('−81.7 dBm', '12.3 dB of SNR')
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
      quotes(tau, p, s54, s6.replace(' Mb/s', ''))
    })
  }

  it('the contention loss quoted between n = 2 and n = 20, and what the MAC keeps at 54 Mb/s', () => {
    const two = S(solveBianchi({ n: 2, ...PARAMS }).tau, 2, t54)
    const twenty = S(solveBianchi({ n: 20, ...PARAMS }).tau, 20, t54)
    expect((two - twenty) / two).toBeCloseTo(0.204, 3) // "only a further 20%"
    expect(two / 54).toBeGreaterThan(0.55) // "well under two thirds of the nominal rate"
    expect(two / 54).toBeLessThan(0.66)
    quotes('31.3 Mb/s', '20%')
  })

  it('the finite-retry correction at n = 20: p 48.09 % → 49.59 %', () => {
    const inf = solveBianchi({ n: 20, W: 16, m: 6 })
    const fin = solveBianchi({ n: 20, ...PARAMS })
    expect(pct(inf.p)).toBe('48.09 %')
    expect(pct(fin.p)).toBe('49.59 %')
    quotes('48.09%', '49.59%')
  })

  it('the 6 Mb/s and 54 Mb/s contention costs quoted in the text', () => {
    const s = (n: number, t: { tsNs: number; tcNs: number }) => S(solveBianchi({ n, ...PARAMS }).tau, n, t)
    expect(s(2, t6).toFixed(2)).toBe('5.17')
    expect(s(20, t6).toFixed(2)).toBe('3.86')
    expect(s(2, t54).toFixed(1)).toBe('31.3')
    expect(s(20, t54).toFixed(1)).toBe('24.9')
    quotes('5.17 → 3.86 Mb/s', '31.3 → 24.9')
  })
})

// ---------------------------------------------------------------------------
// the simulator, and the stated tolerance
// ---------------------------------------------------------------------------

describe('model vs simulator', () => {
  const t6 = dcfTimes(1500, 6)
  const cases: { n: number; stats: () => Stats; attempts: number; collided: number; acks: number }[] = [
    { n: 2, stats: () => variant(0, 'n2'), attempts: 4821, collided: 540, acks: 4280 },
    { n: 5, stats: base, attempts: 5302, collided: 1370, acks: 3931 },
    { n: 10, stats: () => variant(1, 'n10'), attempts: 5678, collided: 1992, acks: 3684 },
    { n: 20, stats: () => variant(2, 'n20'), attempts: 6197, collided: 2840, acks: 3356 },
  ]

  for (const c of cases) {
    it(`n = ${c.n}: ${c.attempts} attempts, ${c.collided} collided, ${c.acks} ACKs — within the stated tolerance`, () => {
      const s = c.stats()
      expect(s.attempts).toBe(c.attempts)
      expect(s.collided).toBe(c.collided)
      expect(s.acks).toBe(c.acks)
      // every frame goes at 6 Mb/s: the rate is pinned, as the lesson says
      expect([...s.rateMix.keys()]).toEqual([6])
      expect(s.drops.queueFull).toBeUndefined()
      expect(s.drops.lifetime).toBeUndefined()

      const sol = solveBianchi({ n: c.n, ...PARAMS })
      const model = saturationThroughput({ n: c.n, tau: sol.tau, slotNs: SLOT_NS, tsNs: t6.tsNs, tcNs: t6.tcNs, payloadBits: PAYLOAD_BITS })
      // "every p within 10% of the prediction and every throughput within 5%"
      expect(Math.abs(s.p - sol.p) / sol.p).toBeLessThan(0.10)
      expect(Math.abs(s.mbps - model.mbps) / model.mbps).toBeLessThan(0.05)
    })
  }

  it('the comparison table’s simulator column is what the runs produce', () => {
    const quoted: [string, () => Stats, string, string, string, string][] = [
      ['2', () => variant(0, 'n2'), '11.20 %', '5.136', '+7.1 %', '−0.6 %'],
      ['5', base, '25.84 %', '4.717', '−5.1 %', '+0.8 %'],
      ['10', () => variant(1, 'n10'), '35.08 %', '4.421', '−9.9 %', '+3.4 %'],
      ['20', () => variant(2, 'n20'), '45.83 %', '4.027', '−7.6 %', '+4.4 %'],
    ]
    const signed = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(100 * x).toFixed(1)} %`
    for (const [n, stats, p, mbps, deltaP, deltaS] of quoted) {
      const s = stats()
      expect(pct(s.p)).toBe(p)
      expect(s.mbps.toFixed(3)).toBe(mbps)
      const sol = solveBianchi({ n: Number(n), ...PARAMS })
      const model = saturationThroughput({ n: Number(n), tau: sol.tau, slotNs: SLOT_NS, tsNs: t6.tsNs, tcNs: t6.tcNs, payloadBits: PAYLOAD_BITS })
      expect(signed((s.p - sol.p) / sol.p)).toBe(deltaP)
      expect(signed((s.mbps - model.mbps) / model.mbps)).toBe(deltaS)
      quotes(p, mbps, deltaP, deltaS)
    }
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
    quotes('2.064 ms')
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
    quotes('25.84%、25.53%、25.71%')
  })

  it('saturation is real: twenty queued MSDUs per station, nothing discarded by age', () => {
    const scen = bianchi.scenario()
    expect(scen.queue).toEqual({ limit: 500, lifetimeMs: 600_000 })
    const enq = base().records.filter((r) => r.type === 'ENQUEUE' && r.t === 0)
    expect(enq.length).toBe(5 * 20)
    quotes('twenty queued MSDUs', 'ten minutes')
  })
})

// ---------------------------------------------------------------------------
// lesson contract
// ---------------------------------------------------------------------------

describe('lesson contract', () => {
  it('study time follows the curriculum formula and lands inside the 15–25 minute band', () => {
    const raw = lessonWords(bianchi) / 150 + OBSERVE_MINUTES * bianchi.observe.length + TRY_MINUTES * bianchi.tryThis.length
    expect(lessonMinutes(bianchi)).toBe(Math.max(5, Math.round(raw / 5) * 5))
    expect(lessonMinutes(bianchi)).toBeGreaterThanOrEqual(15)
    expect(lessonMinutes(bianchi)).toBeLessThanOrEqual(25)
  })

  it('is bilingual, numbered by position, and part of the reading order', () => {
    expect(bianchi.id).toBe('bianchi')
    expect(COURSE_ORDER).toContain('bianchi')
    expect(bianchi.title.en).not.toMatch(/^\d+\s*·/)
    expect(bianchi.title.zh).not.toMatch(/^\d+\s*·/)
    expect(bianchi.observe.length).toBe(3)
    expect(bianchi.tryThis.length).toBe(2)
    expect(bianchi.quiz.length).toBeGreaterThanOrEqual(2)
    for (const q of bianchi.quiz) {
      expect(q.answer).toBeGreaterThanOrEqual(0)
      expect(q.answer).toBeLessThan(q.options.length)
      expect(q.explain.zh.length).toBeGreaterThan(20)
    }
    for (const v of bianchi.variants!) expect(v.label.zh.length).toBeGreaterThan(3)
  })

  it('every jump target occurs in the base scenario', () => {
    const records = base().records
    for (const j of bianchi.jumps) expect(records.some(j.find), j.label.en).toBe(true)
  })
})
