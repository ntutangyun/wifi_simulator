/**
 * Pins the Tier 1 project, "Predict a flat, then measure it": every link
 * budget, airtime, fixed point and share quoted as a *prediction* is recomputed
 * from the engine's own functions and the Bianchi solver, and every number
 * quoted as a *measurement* comes from a 10 s run of the lesson's own
 * scenarios. The worked example in the prose therefore cannot drift from
 * either side.
 *
 * Probes used while authoring (session scratchpad, run with npx tsx):
 * <scratchpad>/lesson-project/probe1..4.mts.
 */
import { describe, it, expect } from 'vitest'
import { tier1Project, projectFlat } from '../../src/course/tier1/tier1-project'
import { dcfTimes, saturationThroughput, solveBianchi } from '../../src/course/tier1/bianchiModel'
import { COURSE_ORDER, OBSERVE_MINUTES, TRY_MINUTES, lessonMinutes, lessonWords } from '../../src/course/curriculum'
import { Simulation } from '../../src/engine/simulation'
import type { Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block, L10n } from '../../src/course/lessonKit'
import {
  ACK_BYTES, DIFS_NS, FCS_BYTES, MAC_HDR_BYTES, SIFS_NS, SLOT_NS, ACK_TIMEOUT_NS,
  ctrlRespRateForMode, mcsForRssi, mcsRateMbps, noiseDbm, reqSinrDb, txTimeModeNs, txTimeNs,
} from '../../src/engine/phy'
import { buildLinkTable, pathLossDb } from '../../src/engine/propagation'

const SECS = 10
const RUN_NS = SECS * 1e9
const PAYLOAD_BITS = 12_000
const MSDU = 1500
const PARAMS = { W: 16, m: 6, attempts: 7 } as const

// ---------------------------------------------------------------------------
// the prediction side: one place that assembles T_s / T_c, checked against
// bianchiModel's own assembly so the two cannot drift apart
// ---------------------------------------------------------------------------

function times(mcs: number): { dataNs: number; ackNs: number; respRate: number; tsNs: number; tcNs: number } {
  const dataNs = txTimeModeNs('eht', MSDU + MAC_HDR_BYTES + FCS_BYTES, mcs, { widthMhz: 20 })
  const respRate = ctrlRespRateForMode('eht', mcs, mcsRateMbps('eht', mcs))
  const ackNs = txTimeNs(ACK_BYTES, respRate)
  return { dataNs, ackNs, respRate, tsNs: dataNs + SIFS_NS + ackNs + DIFS_NS, tcNs: dataNs + ACK_TIMEOUT_NS + DIFS_NS }
}

const mix = (ts: number[]): number => ts.reduce((a, b) => a + b, 0) / ts.length

function modelS(n: number, tsNs: number, tcNs: number): number {
  const { tau } = solveBianchi({ n, ...PARAMS })
  return saturationThroughput({ n, tau, slotNs: SLOT_NS, tsNs, tcNs, payloadBits: PAYLOAD_BITS }).mbps
}

// ---------------------------------------------------------------------------
// the measurement side
// ---------------------------------------------------------------------------

interface Stats {
  records: TLRecord[]
  attempts: Map<string, number>
  retries: Map<string, number>
  overlaps: Map<string, number>
  txOk: Map<string, number>
  airtimeNs: Map<string, number>
  firstMcs: Map<string, number>
  eifs: number
  collisions: number
  /** Per unordered pair of colliding nodes: total, and those where one started late. */
  pairTotal: Map<string, number>
  pairLate: Map<string, number>
}

const memo = new Map<string, Stats>()

function measure(key: string, scenario: Scenario): Stats {
  const hit = memo.get(key)
  if (hit) return hit
  const sim = new Simulation(scenario)
  const records = [...sim.runUntil(RUN_NS).records]
  const attempts = new Map<string, number>()
  const retries = new Map<string, number>()
  const overlaps = new Map<string, number>()
  const firstMcs = new Map<string, number>()
  const pairTotal = new Map<string, number>()
  const pairLate = new Map<string, number>()
  const lastStart = new Map<string, number>()
  let eifs = 0
  let collisions = 0
  const bump = (m: Map<string, number>, k: string): void => { m.set(k, (m.get(k) ?? 0) + 1) }
  for (const r of records) {
    if (r.type === 'TX_START') {
      lastStart.set(r.node, r.t)
      if (r.frame.kind === 'data') {
        bump(attempts, r.node)
        if (!firstMcs.has(r.node)) firstMcs.set(r.node, r.frame.mcs ?? -1)
      }
    } else if (r.type === 'RETRY') bump(retries, r.node)
    else if (r.type === 'IFS_START' && r.kind === 'EIFS') eifs++
    else if (r.type === 'COLLISION') {
      collisions++
      for (const n of r.nodes) bump(overlaps, n)
      if (r.nodes.length === 2) {
        const ns = [...r.nodes].sort()
        const key2 = ns.join('+')
        bump(pairTotal, key2)
        if (Math.abs((lastStart.get(ns[0]) ?? 0) - (lastStart.get(ns[1]) ?? 0)) > 1000) bump(pairLate, key2)
      }
    }
  }
  const txOk = new Map<string, number>()
  const airtimeNs = new Map<string, number>()
  for (const [id, n] of Object.entries(sim.view.nodes)) {
    txOk.set(id, n.stats.txOk)
    airtimeNs.set(id, n.stats.airtimeNs)
  }
  const out: Stats = { records, attempts, retries, overlaps, txOk, airtimeNs, firstMcs, eifs, collisions, pairTotal, pairLate }
  memo.set(key, out)
  return out
}

const base = (): Stats => measure('base', tier1Project.scenario())
const vMoved = (): Stats => measure('moved', tier1Project.variants![0].scenario())
const vThird = (): Stats => measure('third', tier1Project.variants![1].scenario())
const vAlone = (): Stats => measure('alone', tier1Project.variants![2].scenario())

const mbps = (s: Stats, id: string): number => ((s.txOk.get(id) ?? 0) * PAYLOAD_BITS) / SECS / 1e6
const pooled = (s: Stats, ids: string[], m: Map<string, number>): number =>
  ids.reduce((a, id) => a + (m.get(id) ?? 0), 0) / ids.reduce((a, id) => a + (s.attempts.get(id) ?? 0), 0)

// ---------------------------------------------------------------------------
// prose
// ---------------------------------------------------------------------------

function allText(): string {
  const parts: string[] = []
  const push = (l?: L10n): void => { if (l) parts.push(l.en, l.zh) }
  for (const b of tier1Project.body as Block[]) {
    push(b.heading)
    if ('text' in b) push(b.text)
    if (b.kind === 'formula') push(b.note)
    if (b.kind === 'list' || b.kind === 'steps') b.items.forEach(push)
    if (b.kind === 'table') { b.head.forEach(push); b.rows.forEach((row) => row.forEach(push)) }
  }
  tier1Project.observe.forEach(push)
  tier1Project.tryThis.forEach(push)
  for (const q of tier1Project.quiz) { push(q.q); q.options.forEach(push); push(q.explain) }
  tier1Project.variants!.forEach((v) => push(v.label))
  return parts.join(' ')
}
const prose = allText()
const quotes = (...needles: string[]): void => {
  for (const s of needles) expect(prose, `prose is missing "${s}"`).toContain(s)
}

// ---------------------------------------------------------------------------

describe('(a) the link budget the learner must predict', () => {
  it('the two uploaders land where the prose says, and the ladder picks their ceilings', () => {
    const scen = tier1Project.scenario()
    const table = buildLinkTable(scen.nodes, scen.walls)
    const noise = noiseDbm(20)
    expect(noise.toFixed(2)).toBe('-93.99')

    // study laptop: 2 m, no wall
    expect(pathLossDb(2).toFixed(2)).toBe('55.73')
    const near = table.get('sta-1')!.get('ap')!
    expect(near.toFixed(2)).toBe('-40.73')
    expect((near - noise).toFixed(2)).toBe('53.26')
    expect(mcsForRssi('eht', near, undefined, 20)).toBe(13)
    expect(mcsRateMbps('eht', 13)).toBe(172.1)

    // living-room laptop: 11.180 m plus one brick wall
    expect(Math.hypot(11, 2).toFixed(3)).toBe('11.180')
    expect(pathLossDb(Math.hypot(11, 2)).toFixed(2)).toBe('78.15')
    const far = table.get('sta-2')!.get('ap')!
    expect(far).toBeCloseTo(15 - 78.15 - 12, 1)
    expect(far.toFixed(2)).toBe('-75.15')
    expect((far - noise).toFixed(2)).toBe('18.84')
    expect(mcsForRssi('eht', far, undefined, 20)).toBe(2)
    expect(mcsRateMbps('eht', 2)).toBe(25.8)

    // the rungs the worked example names, and the 3 dB margin that excludes MCS 3
    expect(reqSinrDb('eht', 2).toFixed(2)).toBe('13.99')
    expect(reqSinrDb('eht', 3).toFixed(2)).toBe('16.99')
    expect(far - noise).toBeGreaterThan(reqSinrDb('eht', 2) + 3)
    expect(far - noise).toBeLessThan(reqSinrDb('eht', 3) + 3)

    quotes('−40.73 dBm / 53.26 dB / 13', '−75.15 dBm / 18.84 dB / 2', '11.180 m', '78.15 dB',
      '13.99 + 3 = 16.99 dB', '16.99 + 3 = 19.99 dB', '55.73 dB', '172.1 Mb/s', '25.8 Mb/s', '−93.99')
  })

  it('the 34 dB spread between the two uploaders, and the −72.64 dBm they hear each other at', () => {
    const scen = tier1Project.scenario()
    const table = buildLinkTable(scen.nodes, scen.walls)
    const near = table.get('sta-1')!.get('ap')!
    const far = table.get('sta-2')!.get('ap')!
    expect(near - far).toBeCloseTo(34.4, 1)
    const mutual = table.get('sta-1')!.get('sta-2')!
    expect(mutual.toFixed(2)).toBe('-72.64')
    expect((mutual - noiseDbm(20)).toFixed(2)).toBe('21.35')
    expect(reqSinrDb('eht', 13).toFixed(2)).toBe('44.99')
    // above preamble detection, far below energy detection
    expect(mutual).toBeGreaterThan(-82)
    expect(mutual).toBeLessThan(-62)
    quotes('34 dB', '−72.64 dBm', '21.35 dB', '44.99 dB', '−82 dBm', '−62 dBm')
  })

  it('the run confirms both ceilings on the first frame each station sends', () => {
    expect(base().firstMcs.get('sta-1')).toBe(13)
    expect(base().firstMcs.get('sta-2')).toBe(2)
  })
})

describe('(b) the airtime of a frame and of its exchange', () => {
  it('the symbol arithmetic and the two exchange times', () => {
    expect(MSDU + MAC_HDR_BYTES + FCS_BYTES).toBe(1528)
    expect(16 + 8 * 1528 + 6).toBe(12_246)
    expect(Math.ceil(12_246 / 351)).toBe(35)
    expect(Math.ceil(12_246 / 2340)).toBe(6)

    const fast = times(13)
    const slow = times(2)
    expect(fast.dataNs).toBe(129_600)
    expect(slow.dataNs).toBe(524_000)
    expect(fast.respRate).toBe(24)
    expect(slow.respRate).toBe(12)
    expect(fast.ackNs).toBe(28_000)
    expect(slow.ackNs).toBe(32_000)
    expect(fast.tsNs).toBe(207_600)
    expect(slow.tsNs).toBe(606_000)
    expect(fast.tcNs).toBe(208_600)
    expect(slow.tcNs).toBe(603_000)

    quotes('⌈12246 / 351⌉ = 35 symbols', '⌈12246 / 2340⌉ = 6 symbols', '129.6 µs', '524.0 µs', '207.6 µs', '606.0 µs', '208.6', '603.0',
      '24 Mb/s (28 µs)', '12 Mb/s (32 µs)', '1528 octets')
  })

  it('the T_s / T_c assembly is bianchiModel’s own, so the worked example cannot drift', () => {
    // same four terms, checked against dcfTimes on a legacy link where both apply
    const legacy = dcfTimes(MSDU, 6)
    const byHand = {
      tsNs: legacy.dataNs + SIFS_NS + legacy.ackNs + DIFS_NS,
      tcNs: legacy.dataNs + ACK_TIMEOUT_NS + DIFS_NS,
    }
    expect(byHand.tsNs).toBe(legacy.tsNs)
    expect(byHand.tcNs).toBe(legacy.tcNs)
  })
})

describe('(c) the fixed point and the saturation throughput', () => {
  it('n = 2 gives τ = 0.1046 and p = 10.46 %, and the generic slot gives 25.585 Mb/s', () => {
    const { tau, p } = solveBianchi({ n: 2, ...PARAMS })
    expect(tau.toFixed(4)).toBe('0.1046')
    expect((100 * p).toFixed(2)).toBe('10.46')
    const ts = mix([times(13).tsNs, times(2).tsNs])
    const tc = mix([times(13).tcNs, times(2).tcNs])
    expect((ts / 1000).toFixed(1)).toBe('406.8')
    const S = modelS(2, ts, tc)
    expect(S.toFixed(3)).toBe('25.585')
    expect((S / 2).toFixed(3)).toBe('12.793')
    quotes('τ = 0.1046', 'p = 10.46%', '406.8 µs', '25.585 Mb/s', '12.793 Mb/s')
  })

  it('the measured run: 22.610 Mb/s against the predicted 25.585, 11.6 % short', () => {
    const s = base()
    expect(s.txOk.get('sta-1')).toBe(9719)
    expect(s.txOk.get('sta-2')).toBe(9123)
    expect(mbps(s, 'sta-1').toFixed(3)).toBe('11.663')
    expect(mbps(s, 'sta-2').toFixed(3)).toBe('10.948')
    const total = mbps(s, 'sta-1') + mbps(s, 'sta-2')
    expect(total.toFixed(3)).toBe('22.610')
    const S = modelS(2, mix([times(13).tsNs, times(2).tsNs]), mix([times(13).tcNs, times(2).tcNs]))
    expect((100 * (S - total) / S).toFixed(1)).toBe('11.6')
    quotes('22.610 Mb/s', '9,719 / 9,123', '11.6%')
  })

  it('the two estimators: 23.15 % of attempts overlap, 12.59 % end in a retry', () => {
    const s = base()
    const ids = ['sta-1', 'sta-2']
    expect((100 * pooled(s, ids, s.retries)).toFixed(2)).toBe('12.59')
    expect((100 * pooled(s, ids, s.overlaps)).toFixed(2)).toBe('23.15')
    const overlapped = ids.reduce((a, id) => a + s.overlaps.get(id)!, 0)
    const retried = ids.reduce((a, id) => a + s.retries.get(id)!, 0)
    expect(overlapped).toBe(4990)
    expect(retried).toBe(2713)
    expect((100 * (overlapped - retried) / overlapped).toFixed(0)).toBe('46')
    quotes('23.15 %', '12.59 %', '4,990', '2,713', '46%')
  })
})

describe('(d) the share and the anomaly', () => {
  it('the predicted 19.8 / 80.2 split and the measured 21.2 / 78.8', () => {
    const fast = times(13).dataNs
    const slow = times(2).dataNs
    expect((100 * fast / (fast + slow)).toFixed(1)).toBe('19.8')
    expect((100 * slow / (fast + slow)).toFixed(1)).toBe('80.2')

    const s = base()
    const a1 = s.airtimeNs.get('sta-1')!
    const a2 = s.airtimeNs.get('sta-2')!
    expect((100 * a1 / RUN_NS).toFixed(2)).toBe('16.66')
    expect((100 * a2 / RUN_NS).toFixed(2)).toBe('61.94')
    expect((100 * a1 / (a1 + a2)).toFixed(1)).toBe('21.2')
    expect((100 * a2 / (a1 + a2)).toFixed(1)).toBe('78.8')
    // equal opportunities, four times the airtime
    expect(a2 / a1).toBeGreaterThan(3.5)
    const ratio = s.txOk.get('sta-1')! / s.txOk.get('sta-2')!
    expect(ratio).toBeGreaterThan(0.9)
    expect(ratio).toBeLessThan(1.1)
    quotes('19.8 % / 80.2 %', '21.2 % / 78.8 %', '19.8% against 80.2%', 'four times')
  })

  it('alone the study laptop should get 43.621 Mb/s and gets 42.470', () => {
    const t = times(13)
    const perExchangeNs = t.tsNs + 7.5 * SLOT_NS
    expect((perExchangeNs / 1000).toFixed(1)).toBe('275.1')
    expect((PAYLOAD_BITS / (perExchangeNs * 1e-9) / 1e6).toFixed(3)).toBe('43.621')
    const s = vAlone()
    expect(mbps(s, 'sta-1').toFixed(3)).toBe('42.470')
    expect((100 * pooled(s, ['sta-1'], s.retries)).toFixed(2)).toBe('0.28')
    quotes('275.1 µs', '43.621 Mb/s', '42.470', '0.28%')
  })
})

describe('reading the gaps', () => {
  it('the deaf late start: 1,342 of 2,399 laptop-vs-laptop collisions begin late', () => {
    const s = base()
    expect(s.pairTotal.get('sta-1+sta-2')).toBe(2399)
    expect(s.pairLate.get('sta-1+sta-2')).toBe(1342)
    expect(s.collisions).toBe(2733)
    quotes('2,399', '1,342')
  })

  it('the restart-time split: 9,499 EIFS deferrals, and 45 / 94 / 34 µs', () => {
    expect(base().eifs).toBe(9499)
    expect(ACK_TIMEOUT_NS).toBe(45_000)
    expect(DIFS_NS).toBe(34_000)
    expect(SIFS_NS + DIFS_NS + txTimeNs(ACK_BYTES, 6)).toBe(94_000)
    quotes('9,499 EIFS', 'EIFS (94 µs)', 'DIFS (34 µs)', '45 µs for the colliders')
  })

  it('ARF: the mean PPDU is 148.1 µs against 129.6, and 600.9 against 524.0', () => {
    const s = base()
    const mean = (id: string): number => s.airtimeNs.get(id)! / s.attempts.get(id)! / 1000
    expect(mean('sta-1').toFixed(1)).toBe('148.1')
    expect(mean('sta-2').toFixed(1)).toBe('600.9')
    expect(mean('sta-1')).toBeGreaterThan(times(13).dataNs / 1000)
    expect(mean('sta-2')).toBeGreaterThan(times(2).dataNs / 1000)
    quotes('148.1 µs against a predicted 129.6, and 600.9 against 524.0')
  })

  it('the first millisecond the observe item describes', () => {
    const s = base()
    const tx1 = s.records.filter((r) => r.type === 'TX_START' && r.node === 'sta-1' && r.frame.kind === 'data')
    const tx2 = s.records.filter((r) => r.type === 'TX_START' && r.node === 'sta-2' && r.frame.kind === 'data')
    expect(tx1[0].t).toBe(0)
    expect(tx2[0].t).toBe(0)
    expect(tx1[1].t).toBe(406_600)
    // …and it lands inside the living-room laptop's 524 µs frame
    expect(tx1[1].t).toBeLessThan(tx2[0].t + times(2).dataNs)
    quotes('406.6 µs')
  })
})

describe('the variants the learner predicts next', () => {
  it('moved to the living room: MCS 3, S = 19.350 predicted, 16.796 measured, overlap 11.10 %', () => {
    const scen = tier1Project.variants![0].scenario()
    const table = buildLinkTable(scen.nodes, scen.walls)
    const rssi = table.get('sta-1')!.get('ap')!
    expect(pathLossDb(9).toFixed(2)).toBe('75.33')
    expect(rssi.toFixed(2)).toBe('-72.33')
    expect((rssi - noiseDbm(20)).toFixed(2)).toBe('21.66')
    expect(mcsForRssi('eht', rssi, undefined, 20)).toBe(3)
    expect(times(3).dataNs).toBe(415_200)
    expect(times(3).tsNs).toBe(493_200)
    const S = modelS(2, mix([times(3).tsNs, times(2).tsNs]), mix([times(3).tcNs, times(2).tcNs]))
    expect(S.toFixed(3)).toBe('19.350')
    expect((S / 2).toFixed(3)).toBe('9.675')

    const s = vMoved()
    expect(s.firstMcs.get('sta-1')).toBe(3)
    expect(mbps(s, 'sta-1').toFixed(3)).toBe('8.737')
    expect(mbps(s, 'sta-2').toFixed(3)).toBe('8.059')
    expect((mbps(s, 'sta-1') + mbps(s, 'sta-2')).toFixed(3)).toBe('16.796')
    const overlap = pooled(s, ['sta-1', 'sta-2'], s.overlaps)
    expect((100 * overlap).toFixed(2)).toBe('11.10')
    // the point of the experiment: the symmetric flat lands within a point of the model
    expect(Math.abs(100 * overlap - 100 * solveBianchi({ n: 2, ...PARAMS }).p)).toBeLessThan(1)
    quotes('9.000 m', '−72.33 dBm', '21.66 dB', '415.2 µs', '493.2 µs', '19.350 Mb/s', '9.675',
      '16.796 Mb/s', '8.737', '8.059', '11.10%')
  })

  it('a third contender: p = 17.81 % predicted / 17.13 % measured, S 29.574 against 21.184', () => {
    const { p } = solveBianchi({ n: 3, ...PARAMS })
    expect((100 * p).toFixed(2)).toBe('17.81')
    const ts = mix([times(13).tsNs, times(13).tsNs, times(2).tsNs])
    const tc = mix([times(13).tcNs, times(13).tcNs, times(2).tcNs])
    const S = modelS(3, ts, tc)
    expect(S.toFixed(3)).toBe('29.574')

    const s = vThird()
    const ids = ['sta-1', 'sta-2', 'sta-4']
    expect((100 * pooled(s, ids, s.retries)).toFixed(2)).toBe('17.13')
    expect(mbps(s, 'sta-1').toFixed(3)).toBe('7.734')
    expect(mbps(s, 'sta-2').toFixed(3)).toBe('5.852')
    expect(mbps(s, 'sta-4').toFixed(3)).toBe('7.597')
    const total = ids.reduce((a, id) => a + mbps(s, id), 0)
    expect(total.toFixed(3)).toBe('21.184')
    expect((100 * (S - total) / S).toFixed(0)).toBe('28')
    // ARF walks the living-room laptop down to MCS 0
    const mcs0 = s.records.filter((r) => r.type === 'TX_START' && r.node === 'sta-2' && r.frame.kind === 'data' && r.frame.mcs === 0).length
    expect(mcs0).toBeGreaterThan(1000)
    quotes('17.81%', '17.13%', '29.574 Mb/s', '21.184 Mb/s', '7.734, 5.852, 7.597', '28%', 'MCS 0')
  })
})

describe('the quiz’s 160 MHz claim', () => {
  it('the noise floor rises 9 dB and the living-room link falls under MCS 0 with margin', () => {
    expect(noiseDbm(160).toFixed(2)).toBe('-84.96')
    const scen = tier1Project.scenario()
    const far = buildLinkTable(scen.nodes, scen.walls).get('sta-2')!.get('ap')!
    expect((far - noiseDbm(160)).toFixed(2)).toBe('9.81')
    expect(reqSinrDb('eht', 0).toFixed(2)).toBe('8.99')
    expect(far - noiseDbm(160)).toBeLessThan(reqSinrDb('eht', 0) + 3)
    // the requirement itself is width-independent
    expect(reqSinrDb('eht', 0)).toBe(reqSinrDb('eht', 0))
    quotes('−84.96 dBm', '9.81 dB', '−93.99 to −84.96')
  })
})

describe('lesson contract', () => {
  it('study time follows the curriculum formula and lands inside the 15–25 minute band', () => {
    const raw = lessonWords(tier1Project) / 150
      + OBSERVE_MINUTES * tier1Project.observe.length
      + TRY_MINUTES * tier1Project.tryThis.length
    expect(lessonMinutes(tier1Project)).toBe(Math.max(5, Math.round(raw / 5) * 5))
    expect(lessonMinutes(tier1Project)).toBeGreaterThanOrEqual(15)
    expect(lessonMinutes(tier1Project)).toBeLessThanOrEqual(25)
  })

  it('is the last lesson of Tier 1, bilingual, with 3 observe items and 2 experiments', () => {
    expect(tier1Project.id).toBe('tier1-project')
    expect(tier1Project.module).toBe(1)
    expect(COURSE_ORDER.indexOf('tier1-project')).toBe(COURSE_ORDER.indexOf('bianchi-vs-sim') + 1)
    expect(tier1Project.title.en).not.toMatch(/^\d+\s*[·.]/)
    expect(tier1Project.observe.length).toBe(3)
    expect(tier1Project.tryThis.length).toBe(2)
    expect(tier1Project.quiz.length).toBeGreaterThanOrEqual(2)
    expect(tier1Project.variants!.length).toBeGreaterThanOrEqual(2)
    for (const q of tier1Project.quiz) {
      expect(q.answer).toBeGreaterThanOrEqual(0)
      expect(q.answer).toBeLessThan(q.options.length)
      expect(q.explain.zh.length).toBeGreaterThan(20)
    }
    for (const v of tier1Project.variants!) expect(v.label.zh.length).toBeGreaterThan(3)
    // it is a project: instructions and a rubric, not exposition
    quotes('Self-check rubric', '自评标准', 'A good answer', 'Predicted', 'Measured',
      'Do not open the run until the four predictions are written down')
  })

  it('every jump target occurs in the base scenario', () => {
    for (const j of tier1Project.jumps) expect(base().records.some(j.find), j.label.en).toBe(true)
  })

  it('the scenario is small, deterministic and plain DCF', () => {
    const scen = projectFlat()
    expect(scen.seed).toBe(7)
    expect(scen.nodes.length).toBe(4)
    expect(scen.rtsThresholdBytes).toBeGreaterThan(MSDU)
    for (const n of scen.nodes) {
      expect(n.caps.widthMhz).toBe(20)
      expect(n.caps.features.edca ?? false).toBe(false)
      expect(n.caps.features.ampdu ?? false).toBe(false)
      expect(n.caps.features.txop ?? false).toBe(false)
    }
    expect(projectFlat({ third: true }).nodes.length).toBe(5)
    expect(projectFlat({ noFar: true }).nodes.length).toBe(3)
  })
})
