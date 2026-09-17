/**
 * Pins the Bianchi lesson: the solver against an independently derived fixed
 * point, every number quoted in the prose against the model and against the
 * simulator, the stated model-vs-simulator tolerance, the `minutes` estimate
 * and the jump targets.
 */
import { describe, it, expect } from 'vitest'
import { bianchi } from '../../src/course/tier1/bianchi'
import { dcfTimes, saturationThroughput, solveBianchi, tauOf } from '../../src/course/tier1/bianchiModel'
import { Simulation } from '../../src/engine/simulation'
import { WifiMac } from '../../src/engine/mac'
import { TAMPER_PRESETS, type Scenario } from '../../src/model/scenario'
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

const base = () => measure('n5', bianchi.scenario())
const variant = (i: number, key: string) => measure(key, bianchi.variants![i].scenario())

/** Every English (and Chinese) string in the lesson, concatenated. */
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
  })

  it('degenerates as the lesson claims: W = 1 with no doubling gives τ = 1, p = 1, S = 0', () => {
    // The "CW = 0" cheat pins cwMin = cwMax = 0, i.e. W = 1 and m = 0.
    const { tau, p } = solveBianchi({ n: 5, W: 1, m: 0 })
    expect(tau).toBeCloseTo(1, 9)
    expect(p).toBeCloseTo(1, 9)
    const t = dcfTimes(1500, 6)
    const S = saturationThroughput({ n: 5, tau, slotNs: SLOT_NS, tsNs: t.tsNs, tcNs: t.tcNs, payloadBits: PAYLOAD_BITS })
    expect(S.mbps).toBeCloseTo(0, 9)
    quotes('τ = 1, p = 1, S = 0')
  })

  it('a single station at τ = 1 delivers one MSDU per T_s: 5.561 Mb/s', () => {
    const t = dcfTimes(1500, 6)
    const S = saturationThroughput({ n: 1, tau: 1, slotNs: SLOT_NS, tsNs: t.tsNs, tcNs: t.tcNs, payloadBits: PAYLOAD_BITS })
    expect(S.mbps.toFixed(3)).toBe('5.561')
    quotes('5.561 Mb/s')
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
    expect(t.tcNs).toBeLessThan(t.tsNs) // "a collision is 15 µs cheaper than a success"
    expect((t.tsNs - t.tcNs) / 1000).toBe(15)
    quotes('T_s = 2064 + SIFS 16 + ACK 44 + DIFS 34 = 2158 µs', 'T_c = 2064 + ACKTimeout 45 + DIFS 34 = 2143 µs', '1528 octets', '511 OFDM symbols')
  })

  it('54 Mb/s: 248 µs data, 28 µs ACK at 24 Mb/s, T_s = 326 µs, T_c = 327 µs', () => {
    const t = dcfTimes(1500, 54)
    expect(t.dataNs).toBe(248_000)
    expect(t.ackNs).toBe(28_000)
    expect(t.tsNs).toBe(326_000)
    expect(t.tcNs).toBe(327_000)
    quotes('the data frame is 248 µs and the ACK 28 µs at 24 Mb/s, the two are 326 µs and 327 µs')
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
    quotes('−81.7 dBm', '12.3 dB above the 20 MHz noise floor of −94.0 dBm', '0.7 dB short of the 13 dB that 9 Mb/s needs')
  })

  it('the close-in variant has a 54 Mb/s ceiling and 57.8 dB of SNR', () => {
    const scen = bianchi.variants![3].scenario()
    const table = buildLinkTable(scen.nodes, scen.walls)
    const level = table.get('sta-1')!.get('ap')!
    expect(dataRateFor(level)).toBe(54)
    expect(level - noiseDbm(20)).toBeCloseTo(57.8, 1)
    quotes('57.8 dB')
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
    [2, '0.1046', '10.46 %', '31.28 Mb/s', '5.169 Mb/s'],
    [5, '0.0763', '27.22 %', '29.52 Mb/s', '4.679 Mb/s'],
    [10, '0.0533', '38.92 %', '27.36 Mb/s', '4.275 Mb/s'],
    [20, '0.0354', '49.59 %', '24.91 Mb/s', '3.857 Mb/s'],
  ]

  for (const [n, tau, p, s54, s6] of rows) {
    it(`n = ${n}: τ = ${tau}, p = ${p}, S = ${s54} / ${s6}`, () => {
      const sol = solveBianchi({ n, ...PARAMS })
      expect(sol.tau.toFixed(4)).toBe(tau)
      expect(pct(sol.p)).toBe(p)
      expect(`${S(sol.tau, n, t54).toFixed(2)} Mb/s`).toBe(s54)
      expect(`${S(sol.tau, n, t6).toFixed(3)} Mb/s`).toBe(s6)
      quotes(tau, p, s54.replace(' Mb/s', ''), s6.replace(' Mb/s', ''))
    })
  }

  it('n = 5: P_tr and P_s, and the contention loss quoted between n = 2 and n = 20', () => {
    const two = S(solveBianchi({ n: 2, ...PARAMS }).tau, 2, t54)
    const twenty = S(solveBianchi({ n: 20, ...PARAMS }).tau, 20, t54)
    expect((two - twenty) / two).toBeCloseTo(0.204, 3) // "only 20%"
    expect(two / 54).toBeGreaterThan(0.5) // "roughly half the nominal rate at best"
    expect(two / 54).toBeLessThan(0.6)
  })

  it('the finite-retry correction at n = 20: p 48.09 % → 49.59 %, S 3.920 → 3.857 Mb/s', () => {
    const inf = solveBianchi({ n: 20, W: 16, m: 6 })
    const fin = solveBianchi({ n: 20, ...PARAMS })
    expect(pct(inf.p)).toBe('48.09 %')
    expect(S(inf.tau, 20, t6).toFixed(3)).toBe('3.920')
    expect(pct(fin.p)).toBe('49.59 %')
    expect(S(fin.tau, 20, t6).toFixed(3)).toBe('3.857')
    // "at n = 20 it costs 1.6 % of S"
    expect((S(inf.tau, 20, t6) - S(fin.tau, 20, t6)) / S(inf.tau, 20, t6)).toBeCloseTo(0.016, 3)
    quotes('48.09%', '49.59%', '3.920', '3.857')
  })
})

// ---------------------------------------------------------------------------
// the simulator, and the stated tolerance
// ---------------------------------------------------------------------------

describe('model vs simulator', () => {
  const t6 = dcfTimes(1500, 6)
  const cases: { n: number; key: string; stats: () => Stats; attempts: number; collided: number; acks: number }[] = [
    { n: 2, key: 'n2', stats: () => variant(0, 'n2'), attempts: 4821, collided: 540, acks: 4280 },
    { n: 5, key: 'n5', stats: base, attempts: 5302, collided: 1370, acks: 3931 },
    { n: 10, key: 'n10', stats: () => variant(1, 'n10'), attempts: 5678, collided: 1992, acks: 3684 },
    { n: 20, key: 'n20', stats: () => variant(2, 'n20'), attempts: 6197, collided: 2840, acks: 3356 },
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
      // "every collision probability is within 10 % of the prediction and every throughput within 5 %"
      expect(Math.abs(s.p - sol.p) / sol.p).toBeLessThan(0.10)
      expect(Math.abs(s.mbps - model.mbps) / model.mbps).toBeLessThan(0.05)
    })
  }

  it('the comparison table’s simulator column is what the runs produce', () => {
    const quoted: [string, () => Stats, string, string, string][] = [
      ['2', () => variant(0, 'n2'), '11.20 %', '5.136', '−0.6 %'],
      ['5', base, '25.84 %', '4.717', '+0.8 %'],
      ['10', () => variant(1, 'n10'), '35.08 %', '4.421', '+3.4 %'],
      ['20', () => variant(2, 'n20'), '45.83 %', '4.027', '+4.4 %'],
    ]
    for (const [n, stats, p, mbps, deltaS] of quoted) {
      const s = stats()
      expect(pct(s.p)).toBe(p)
      expect(s.mbps.toFixed(3)).toBe(mbps)
      const sol = solveBianchi({ n: Number(n), ...PARAMS })
      const model = saturationThroughput({ n: Number(n), tau: sol.tau, slotNs: SLOT_NS, tsNs: t6.tsNs, tcNs: t6.tcNs, payloadBits: PAYLOAD_BITS })
      const dS = (s.mbps - model.mbps) / model.mbps
      expect(`${dS >= 0 ? '+' : '−'}${Math.abs(100 * dS).toFixed(1)} %`).toBe(deltaS)
      quotes(p, mbps, deltaS)
    }
  })

  it('the deltas quoted for p keep their signs and sizes', () => {
    const expected: [number, () => Stats, string][] = [
      [2, () => variant(0, 'n2'), '+7.1 %'],
      [5, base, '−5.1 %'],
      [10, () => variant(1, 'n10'), '−9.9 %'],
      [20, () => variant(2, 'n20'), '−7.6 %'],
    ]
    for (const [n, stats, delta] of expected) {
      const sol = solveBianchi({ n, ...PARAMS })
      const d = (stats().p - sol.p) / sol.p
      expect(`${d >= 0 ? '+' : '−'}${Math.abs(100 * d).toFixed(1)} %`).toBe(delta)
    }
  })

  it('n = 5 carries 1,029 EIFS deferrals the model has no place for', () => {
    expect(base().eifs).toBe(1029)
    quotes('1,029 EIFS')
  })

  it('n = 20 per-station collision rates spread from 42.9 % to 52.1 %', () => {
    const s = variant(2, 'n20')
    expect(Math.min(...s.perStationP)).toBeCloseTo(0.429, 3)
    expect(Math.max(...s.perStationP)).toBeCloseTo(0.521, 3)
    quotes('42.9%', '52.1%')
  })

  it('the run opens with an n-way collision at t = 0 that clears at 2.064 ms', () => {
    for (const [key, scen, n] of [['n5', bianchi.scenario(), 5], ['n20', bianchi.variants![2].scenario(), 20]] as const) {
      const s = measure(key, scen)
      const first = s.records.find((r) => r.type === 'COLLISION')!
      expect(first.type).toBe('COLLISION')
      expect((first as Extract<TLRecord, { type: 'COLLISION' }>).nodes.length).toBe(n)
      expect(first.t).toBe(2_064_000)
      const starts = s.records.filter((r) => r.type === 'TX_START' && r.t === 0)
      expect(starts.length).toBe(n) // nobody draws a backoff first
    }
    quotes('t = 2.064 ms')
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
    const again = [...new Simulation(bianchi.scenario()).runUntil(RUN_NS).records]
    expect(again.length).toBe(base().records.length)
    quotes('25.84%、25.53%、25.71%')
  })
})

describe('the close-in variant: rate adaptation, not the MAC, is what breaks', () => {
  it('67.7 % of frames leave at 6 Mb/s, 1.1 % at 54, and S is 5.53 Mb/s against the model’s 29.52', () => {
    const s = variant(3, 'near')
    expect(s.attempts).toBe(6248)
    expect((s.rateMix.get(6)! / s.attempts).toFixed(3)).toBe('0.677')
    expect((s.rateMix.get(54)! / s.attempts).toFixed(3)).toBe('0.011')
    expect(s.mbps.toFixed(3)).toBe('5.534')
    expect(s.mbps.toFixed(2)).toBe('5.53')
    const sol = solveBianchi({ n: 5, ...PARAMS })
    const t54 = dcfTimes(1500, 54)
    const model = saturationThroughput({ n: 5, tau: sol.tau, slotNs: SLOT_NS, tsNs: t54.tsNs, tcNs: t54.tcNs, payloadBits: PAYLOAD_BITS })
    expect(model.mbps.toFixed(2)).toBe('29.52')
    expect(model.mbps / s.mbps).toBeGreaterThan(5)
    quotes('6,248 data frames', '67.7%', '1.1%')
  })

  it('collision probability barely notices the rate: 26.17 % close in against 25.84 % on the arc', () => {
    expect(pct(variant(3, 'near').p)).toBe('26.17 %')
    expect(pct(base().p)).toBe('25.84 %')
    expect(Math.abs(variant(3, 'near').p - base().p)).toBeLessThan(0.005)
    quotes('26.17%', '25.84%')
  })
})

describe('try this: breaking the model on purpose', () => {
  const cheated = (count: number): Scenario => {
    const scen = bianchi.scenario()
    let left = count
    for (const n of scen.nodes) {
      if (n.kind === 'sta' && left-- > 0) n.tamper = { ...TAMPER_PRESETS.cw }
    }
    return scen
  }

  it('all five with CW = 0: 23,335 attempts, 23,330 collided, no ACK at all', () => {
    const s = measure('cheat5', cheated(5))
    expect(s.attempts).toBe(23_335)
    expect(s.collided).toBe(23_330)
    expect(pct(s.p)).toBe('99.98 %')
    expect(s.acks).toBe(0)
    expect(s.mbps).toBe(0)
    expect(s.drops.retryLimit).toBe(3330)
    quotes('23,335', '23,330', '99.98%', '3,330')
  })

  it('one cheat: it takes 4,634 of 4,639 attempts and the channel runs at the single-station limit', () => {
    const s = measure('cheat1', cheated(1))
    expect(s.attempts).toBe(4639)
    expect(s.attemptsBy.get('sta-1')).toBe(4634)
    expect(s.attempts - s.attemptsBy.get('sta-1')!).toBe(5) // the four obedient stations, together
    expect(s.acks).toBe(4631)
    expect(s.mbps.toFixed(3)).toBe('5.557')
    quotes('4,634', '4,639', '5.557 Mb/s')
  })
})

describe('the slot-clock probe quoted in "Reading the gaps"', () => {
  /**
   * Bianchi's chain treats a busy period as one slot on everybody's counter;
   * the standard freezes instead. This patches the DCF to decrement across a
   * busy period (Bianchi's convention) and re-measures n = 20 — the claim is
   * that it recovers about half of the remaining gap. The patch mirrors
   * onIfsEndAc in mac.ts for the legacy (non-EDCA) path only.
   */
  it('decrementing across each busy period lifts n = 20 from 45.8 % to ≈ 47.9 %', () => {
    const proto = WifiMac.prototype as unknown as Record<string, unknown>
    const original = proto.onIfsEndAc
    proto.onIfsEndAc = function patched(this: Record<string, any>, e: Record<string, any>): void {
      const t = this.now()
      this.emit({ t, type: 'IFS_END', node: this.nodeId })
      if (e.backoff === null) {
        if (!e.needDraw) { this.markReady(e); return }
        e.backoff = this.rng.int(e.cw)
        this.emit({ t, type: 'BACKOFF_DRAW', node: this.nodeId, value: e.backoff, cw: e.cw })
      } else {
        e.backoff -= 1 // Bianchi: the busy period itself was a slot
      }
      if (e.backoff === 0) { this.markReady(e); return }
      this.scheduleTick(e)
    }
    try {
      const s = measure('busydec-n20', bianchi.variants![2].scenario())
      expect(s.p).toBeGreaterThan(0.47)
      expect(s.p).toBeLessThan(0.49)
      expect(s.p).toBeGreaterThan(variant(2, 'n20').p) // the unpatched run, 45.8 %
    } finally {
      proto.onIfsEndAc = original
      memo.delete('busydec-n20')
    }
    quotes('47.9%')
  })
})

// ---------------------------------------------------------------------------
// lesson contract
// ---------------------------------------------------------------------------

describe('lesson contract', () => {
  it('minutes = round-to-5 of words/150 + 5 per observe + 5 per try-this', () => {
    const words = bianchi.body.flatMap((b: Block) => {
      const out: string[] = []
      if (b.heading) out.push(b.heading.en)
      if ('text' in b) out.push(b.text.en)
      if (b.kind === 'formula' && b.note) out.push(b.note.en)
      if (b.kind === 'list' || b.kind === 'steps') out.push(...b.items.map((i) => i.en))
      if (b.kind === 'table') { out.push(...b.head.map((h) => h.en)); out.push(...b.rows.flat().map((c) => c.en)) }
      return out
    }).join(' ').trim().split(/\s+/).length
    const raw = words / 150 + 5 * bianchi.observe.length + 5 * bianchi.tryThis.length
    expect(bianchi.minutes).toBe(Math.round(raw / 5) * 5)
  })

  it('is bilingual everywhere and structured as the contract requires', () => {
    expect(bianchi.id).toBe('bianchi')
    expect(bianchi.title.en).not.toMatch(/^\d/) // no hard-coded lesson number
    expect(bianchi.observe.length).toBeGreaterThanOrEqual(3)
    expect(bianchi.tryThis.length).toBe(2)
    expect(bianchi.quiz.length).toBeGreaterThanOrEqual(2)
    for (const q of bianchi.quiz) {
      expect(q.answer).toBeGreaterThanOrEqual(0)
      expect(q.answer).toBeLessThan(q.options.length)
      expect(q.explain.zh.length).toBeGreaterThan(20)
    }
    expect(bianchi.variants!.length).toBe(4)
    for (const v of bianchi.variants!) expect(v.label.zh.length).toBeGreaterThan(3)
  })

  it('every jump target occurs in the base scenario', () => {
    const records = base().records
    for (const j of bianchi.jumps) {
      expect(records.some(j.find), j.label.en).toBe(true)
    }
  })
})
