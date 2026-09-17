/**
 * Pins "Where the model and the simulator part company": the rate-adaptation
 * artefact, the T_c convention, the EIFS restart times, the per-station
 * spread, the CW = 0 corner, the computed study time and the jump targets.
 *
 * The busy-slot experiment the lesson quotes (n = 20 rising from 45.83 % to
 * ≈ 47.9 % when the backoff is decremented across a busy period) is a one-off
 * probe against a patched MAC, not engine behaviour, so it is deliberately not
 * pinned here — see the probe path in the lesson file's header comment.
 */
import { describe, it, expect } from 'vitest'
import { bianchiVsSim } from '../../src/course/tier1/bianchi-vs-sim'
import { bianchi } from '../../src/course/tier1/bianchi'
import { dcfTimes, saturationThroughput, solveBianchi } from '../../src/course/tier1/bianchiModel'
import { COURSE_ORDER, OBSERVE_MINUTES, TRY_MINUTES, lessonMinutes, lessonWords } from '../../src/course/curriculum'
import { Simulation } from '../../src/engine/simulation'
import { TAMPER_PRESETS, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block, L10n } from '../../src/course/lessonKit'
import { SLOT_NS, dataRateFor, noiseDbm } from '../../src/engine/phy'
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

function allText(): string {
  const parts: string[] = []
  const push = (l?: L10n) => { if (l) parts.push(l.en, l.zh) }
  for (const b of bianchiVsSim.body as Block[]) {
    push(b.heading)
    if ('text' in b) push(b.text)
    if (b.kind === 'formula') push(b.note)
    if (b.kind === 'list' || b.kind === 'steps') b.items.forEach(push)
    if (b.kind === 'table') { b.head.forEach(push); b.rows.forEach((row) => row.forEach(push)) }
  }
  bianchiVsSim.observe.forEach(push)
  bianchiVsSim.tryThis.forEach(push)
  for (const q of bianchiVsSim.quiz) { push(q.q); q.options.forEach(push); push(q.explain) }
  return parts.join(' ')
}

const prose = allText()
const quotes = (...needles: string[]) => {
  for (const s of needles) expect(prose, `prose is missing "${s}"`).toContain(s)
}
const pct = (x: number, d = 2) => `${(100 * x).toFixed(d)} %`

// ---------------------------------------------------------------------------

describe('1 · the rate-adaptation artefact', () => {
  it('the close-in link has a 54 Mb/s ceiling and 57.8 dB of SNR', () => {
    const scen = bianchiVsSim.scenario()
    const table = buildLinkTable(scen.nodes, scen.walls)
    const level = table.get('sta-1')!.get('ap')!
    expect(dataRateFor(level)).toBe(54)
    expect(level - noiseDbm(20)).toBeCloseTo(57.8, 1)
    quotes('57.8 dB')
  })

  it('67.7 % of frames leave at 6 Mb/s, 1.1 % at 54, and S is 5.53 against the model’s 29.52', () => {
    const s = near()
    expect(s.attempts).toBe(6248)
    expect((s.rateMix.get(6)! / s.attempts).toFixed(3)).toBe('0.677')
    expect((s.rateMix.get(54)! / s.attempts).toFixed(3)).toBe('0.011')
    expect(s.mbps.toFixed(3)).toBe('5.534')
    expect(s.mbps.toFixed(2)).toBe('5.53')
    const t54 = dcfTimes(1500, 54)
    const sol = solveBianchi({ n: 5, ...PARAMS })
    const model = saturationThroughput({ n: 5, tau: sol.tau, slotNs: SLOT_NS, tsNs: t54.tsNs, tcNs: t54.tcNs, payloadBits: PAYLOAD_BITS })
    expect(model.mbps.toFixed(2)).toBe('29.52')
    expect(model.mbps / s.mbps).toBeGreaterThan(5) // "disagree by a factor of five"
    quotes('6,248 data frames', '67.7%', '1.1%', '29.52 Mb/s', '5.53')
  })

  it('the MAC is innocent: 26.17 % close in against 25.84 % on the arc, both near the model’s 27.22 %', () => {
    expect(pct(near().p)).toBe('26.17 %')
    expect(pct(arc5().p)).toBe('25.84 %')
    expect(pct(solveBianchi({ n: 5, ...PARAMS }).p)).toBe('27.22 %')
    for (const p of [near().p, arc5().p]) expect(Math.abs(p - solveBianchi({ n: 5, ...PARAMS }).p)).toBeLessThan(0.015)
    quotes('26.17%', '25.84%', '27.22%')
  })

  it('the arc pins the rate; the close-in run spreads over the whole ladder', () => {
    expect([...arc5().rateMix.keys()]).toEqual([6])
    expect(near().rateMix.size).toBeGreaterThan(5)
    // the block lengths the "observe" item quotes
    expect(dcfTimes(1500, 54).dataNs).toBe(248_000)
    expect(dcfTimes(1500, 6).dataNs).toBe(2_064_000)
    quotes('248 µs at 54 Mb/s, 2,064 µs at 6 Mb/s')
  })

  it('the try-this numbers: 5.534 against 4.717 Mb/s, model 29.52 against 4.679', () => {
    expect(near().mbps.toFixed(3)).toBe('5.534')
    expect(arc5().mbps.toFixed(3)).toBe('4.717')
    const t6 = dcfTimes(1500, 6)
    const sol = solveBianchi({ n: 5, ...PARAMS })
    expect(saturationThroughput({ n: 5, tau: sol.tau, slotNs: SLOT_NS, tsNs: t6.tsNs, tcNs: t6.tcNs, payloadBits: PAYLOAD_BITS }).mbps.toFixed(3)).toBe('4.679')
    quotes('5.534', '4.717', '4.679')
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
    quotes('2143 µs', '2158 µs', '0.7%', '0.2% of throughput', '2098 µs', '0.6%')
  })
})

describe('3–6 · restart times, small n and fairness', () => {
  it('the n = 5 arc run logs 1,029 EIFS deferrals; the colliders wait 45 µs and the deaf wait 34', () => {
    expect(arc5().eifs).toBe(1029)
    expect(94 - 34).toBe(60) // "60 µs longer than its neighbours"
    quotes('1,029 EIFS deferrals', 'EIFS = 94 µs', 'DIFS = 34 µs', '45 µs ACK timeout')
  })

  it('n = 2 is the sign flip: 11.20 % measured against 10.46 % predicted', () => {
    const s = measure('n2', bianchi.variants![0].scenario())
    expect(pct(s.p)).toBe('11.20 %')
    expect(pct(solveBianchi({ n: 2, ...PARAMS }).p)).toBe('10.46 %')
    expect(s.p).toBeGreaterThan(solveBianchi({ n: 2, ...PARAMS }).p)
    quotes('11.20%', '10.46%')
  })

  it('n = 20 per-station collision rates spread from 42.9 % to 52.1 % around the pooled 45.83 %', () => {
    const s = arc20()
    expect(Math.min(...s.perStationP)).toBeCloseTo(0.429, 3)
    expect(Math.max(...s.perStationP)).toBeCloseTo(0.521, 3)
    expect(pct(s.p)).toBe('45.83 %')
    quotes('42.9%', '52.1%', '45.83%')
  })

  it('the finite-retry direction quoted in the quiz: the retry limit pushes p up', () => {
    const inf = solveBianchi({ n: 20, W: 16, m: 6 })
    const fin = solveBianchi({ n: 20, ...PARAMS })
    expect(fin.p).toBeGreaterThan(inf.p)
    expect(`${pct(inf.p, 2)} → ${pct(fin.p, 2)}`.replace(/ %/g, '%')).toBe('48.09% → 49.59%')
    quotes('48.09% → 49.59%')
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
    quotes('23,335', '23,330', '3,330')
  })

  it('one cheat: 4,634 of 4,639 attempts, five frames for the rest, 5.557 Mb/s — the single-station limit', () => {
    const s = measure('cheat1', cheated(1))
    expect(s.attempts).toBe(4639)
    expect(s.attemptsBy.get('sta-1')).toBe(4634)
    expect(s.attempts - s.attemptsBy.get('sta-1')!).toBe(5)
    expect(s.mbps.toFixed(3)).toBe('5.557')
    const t = dcfTimes(1500, 6)
    expect((PAYLOAD_BITS / (t.tsNs * 1e-9) / 1e6).toFixed(3)).toBe('5.561') // 12,000 bits / T_s
    quotes('4,634', '4,639', '5.557 Mb/s', '12,000 bits / T_s')
  })
})

describe('lesson contract', () => {
  it('study time follows the curriculum formula and lands inside the 15–25 minute band', () => {
    const raw = lessonWords(bianchiVsSim) / 150 + OBSERVE_MINUTES * bianchiVsSim.observe.length + TRY_MINUTES * bianchiVsSim.tryThis.length
    expect(lessonMinutes(bianchiVsSim)).toBe(Math.max(5, Math.round(raw / 5) * 5))
    expect(lessonMinutes(bianchiVsSim)).toBeGreaterThanOrEqual(15)
    expect(lessonMinutes(bianchiVsSim)).toBeLessThanOrEqual(25)
  })

  it('is bilingual, numbered by position, and follows the model lesson in the reading order', () => {
    expect(bianchiVsSim.id).toBe('bianchi-vs-sim')
    expect(COURSE_ORDER.indexOf('bianchi-vs-sim')).toBe(COURSE_ORDER.indexOf('bianchi') + 1)
    expect(bianchiVsSim.title.en).not.toMatch(/^\d+\s*·/)
    expect(bianchiVsSim.observe.length).toBe(3)
    expect(bianchiVsSim.tryThis.length).toBe(2)
    expect(bianchiVsSim.quiz.length).toBeGreaterThanOrEqual(2)
    for (const q of bianchiVsSim.quiz) {
      expect(q.answer).toBeGreaterThanOrEqual(0)
      expect(q.answer).toBeLessThan(q.options.length)
      expect(q.explain.zh.length).toBeGreaterThan(20)
    }
    for (const v of bianchiVsSim.variants!) expect(v.label.zh.length).toBeGreaterThan(3)
    // it says out loud what it is teaching
    quotes('reading a disagreement between an analysis and a measurement')
  })

  it('every jump target occurs in the base scenario', () => {
    const records = near().records
    for (const j of bianchiVsSim.jumps) expect(records.some(j.find), j.label.en).toBe(true)
  })
})
