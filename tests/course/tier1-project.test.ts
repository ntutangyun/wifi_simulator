/**
 * Pins the first half of the Tier 1 project, "The brief and the plan": every
 * number it quotes is a PREDICTION, and every one of them is recomputed here
 * from the engine's own functions and the Bianchi solver, so the worked
 * example cannot drift from the model it claims to apply.
 *
 * What the simulator actually does with this flat — and the two mechanisms
 * that explain the difference — is pinned next door, in
 * tests/course/tier1-project-review.test.ts, against a 10 s run. The only
 * measurements asserted here are the three the lesson's own `observe` items
 * send the reader to read off the first millisecond of the timeline.
 *
 * The `.body!` walk of the old flat shape is retired: the prose is now walked
 * with `lessonStrings`, the contract's own reader.
 */
import { describe, it, expect } from 'vitest'
import { projectFlat, projectJumps, projectVariants, tier1Project } from '../../src/course/tier1/tier1-project'
import { dcfTimes, saturationThroughput, solveBianchi } from '../../src/course/tier1/bianchiModel'
import { COURSE_ORDER } from '../../src/course/curriculum'
import { ScenarioSchema } from '../../src/model/scenario'
import { Simulation } from '../../src/engine/simulation'
import { lessonStrings } from '../../src/course/readability'
import {
  ACK_BYTES, DIFS_NS, FCS_BYTES, MAC_HDR_BYTES, SIFS_NS, SLOT_NS, ACK_TIMEOUT_NS,
  ctrlRespRateForMode, mcsForRssi, mcsRateMbps, noiseDbm, reqSinrDb, txTimeModeNs, txTimeNs,
} from '../../src/engine/phy'
import { buildLinkTable, pathLossDb } from '../../src/engine/propagation'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 30 * MS
const PAYLOAD_BITS = 12_000
const MSDU = 1500
const PARAMS = { W: 16, m: 6, attempts: 7 } as const

// ---------------------------------------------------------------------------
// the prediction side: one place that assembles the exchange times, checked
// against bianchiModel's own assembly so the two cannot drift apart
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
// the prose: `lessonStrings` is the contract's own walk over everything a
// learner reads, so a quoted value cannot hide in a section this test forgot.
// ---------------------------------------------------------------------------

const prose = [...lessonStrings(tier1Project), tier1Project.title,
  ...projectVariants.map((v) => v.label), ...projectJumps.map((j) => j.label)]
  .flatMap((s) => [s.en, s.zh]).join(' ')
const quotes = (...needles: string[]): void => {
  for (const s of needles) expect(prose, `prose is missing "${s}"`).toContain(s)
}

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
lessonShapeSuite(tier1Project, { proseMax: 1200, runNs: RUN_NS })

describe('tier1-project · the lesson itself', () => {
  it('is the tier’s project, module 1, with the second half right behind it', () => {
    expect(tier1Project.module).toBe(1)
    expect(COURSE_ORDER.indexOf('tier1-project')).toBe(COURSE_ORDER.indexOf('bianchi-vs-sim') + 1)
    expect(COURSE_ORDER.indexOf('tier1-project-review')).toBe(COURSE_ORDER.indexOf('tier1-project') + 1)
    expect(tier1Project.terms!.map((t) => t.term)).toEqual(['brief', 'link budget', 'margin', 'DCF', 'saturated'])
    // it is a brief, not exposition: the four questions and the discipline that goes with them
    quotes('(a) How strong each laptop arrives', '(b) How long one data frame', '(c) How often two saturated senders',
      '(d) How the air divides', 'once you have read a result you can no longer honestly predict it')
  })

  it('the scenario is small, deterministic and plain take-turns access', () => {
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
    expect(() => ScenarioSchema.parse(scen)).not.toThrow()
    for (const v of tier1Project.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('the brief table places the four devices where the scene does', () => {
    const at = (id: string) => projectFlat().nodes.find((n) => n.id === id)!
    expect([at('ap').pos.x, at('ap').pos.y, at('ap').txPowerDbm]).toEqual([3, 4, 20])
    expect([at('sta-1').pos.x, at('sta-1').pos.y, at('sta-1').txPowerDbm]).toEqual([5, 4, 15])
    expect([at('sta-2').pos.x, at('sta-2').pos.y]).toEqual([14, 6])
    expect([at('sta-3').pos.x, at('sta-3').pos.y]).toEqual([4, 6])
    quotes('(3, 4), 20 dBm', '(5, 4), 15 dBm', '(14, 6), 15 dBm', '(4, 6), 15 dBm')
  })
})

describe('tier1-project · (a) the link budget the learner predicts', () => {
  it('the two uploaders land where the table says, and the ladder picks their rungs', () => {
    const scen = projectFlat()
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

    // the rungs the table names, and the 3 dB margin that excludes the next one up
    expect(reqSinrDb('eht', 2).toFixed(2)).toBe('13.99')
    expect(reqSinrDb('eht', 3).toFixed(2)).toBe('16.99')
    expect(far - noise).toBeGreaterThan(reqSinrDb('eht', 2) + 3)
    expect(far - noise).toBeLessThan(reqSinrDb('eht', 3) + 3)

    quotes('2.000 m, no wall', '55.73 dB', '−40.73 dBm', '53.26 dB', 'MCS 13, 172.1 Mb/s',
      '11.180 m, one brick wall', '78.15 dB', '−75.15 dBm', '18.84 dB', 'MCS 2, 25.8 Mb/s',
      '13.99 + 3 = 16.99 dB ✓ · 16.99 + 3 = 19.99 dB ✗', '−93.99 dBm')
  })

  it('the deeper note: a channel eight times as wide takes the far link off the ladder', () => {
    expect(noiseDbm(160).toFixed(2)).toBe('-84.96')
    const scen = projectFlat()
    const far = buildLinkTable(scen.nodes, scen.walls).get('sta-2')!.get('ap')!
    expect((far - noiseDbm(160)).toFixed(2)).toBe('9.81')
    expect(reqSinrDb('eht', 0).toFixed(2)).toBe('8.99')
    expect(far - noiseDbm(160)).toBeLessThan(reqSinrDb('eht', 0) + 3)
    expect(noiseDbm(160) - noiseDbm(20)).toBeCloseTo(9.03, 2)
    quotes('−93.99 to −84.96 dBm', '9.81 dB', '8.99 dB')
  })
})

describe('tier1-project · (b) the airtime the learner predicts', () => {
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

    quotes('1528 bytes', '⌈12246 / 2340⌉ = 6', '⌈12246 / 351⌉ = 35',
      '48 + 81.6 = 129.6 µs', '48 + 476 = 524.0 µs', '24 Mb/s, 28 µs', '12 Mb/s, 32 µs',
      '129.6 + 16 + 28 + 34 = 207.6 µs', '524.0 + 16 + 32 + 34 = 606.0 µs', '208.6 µs', '603.0 µs')
  })

  it('the exchange is assembled exactly as bianchiModel assembles it', () => {
    // same four terms, checked against dcfTimes on a legacy link where both apply
    const legacy = dcfTimes(MSDU, 6)
    expect(legacy.dataNs + SIFS_NS + legacy.ackNs + DIFS_NS).toBe(legacy.tsNs)
    expect(legacy.dataNs + ACK_TIMEOUT_NS + DIFS_NS).toBe(legacy.tcNs)
  })
})

describe('tier1-project · (c) the fixed point the learner predicts', () => {
  it('n = 2 gives τ = 0.1046 and p = 10.46 %, and the generic exchange gives 25.585 Mb/s', () => {
    const { tau, p } = solveBianchi({ n: 2, ...PARAMS })
    expect(tau.toFixed(4)).toBe('0.1046')
    expect((100 * p).toFixed(2)).toBe('10.46')
    const ts = mix([times(13).tsNs, times(2).tsNs])
    const tc = mix([times(13).tcNs, times(2).tcNs])
    expect((ts / 1000).toFixed(1)).toBe('406.8')
    const S = modelS(2, ts, tc)
    expect(S.toFixed(3)).toBe('25.585')
    expect((S / 2).toFixed(3)).toBe('12.793')
    quotes('16, 6, 7', 'τ = 0.1046', 'p = 10.46 %', '(207.6 + 606.0) / 2 = 406.8 µs', '25.585 Mb/s', '12.793 Mb/s')
  })
})

describe('tier1-project · (d) the share the learner predicts', () => {
  it('19.8 / 80.2 from the two frame durations, and 43.621 Mb/s with the flat to itself', () => {
    const fast = times(13).dataNs
    const slow = times(2).dataNs
    expect((100 * fast / (fast + slow)).toFixed(1)).toBe('19.8')
    expect((100 * slow / (fast + slow)).toFixed(1)).toBe('80.2')

    const perExchangeNs = times(13).tsNs + 7.5 * SLOT_NS
    expect((perExchangeNs / 1000).toFixed(1)).toBe('275.1')
    expect((PAYLOAD_BITS / (perExchangeNs * 1e-9) / 1e6).toFixed(3)).toBe('43.621')
    quotes('19.8 % / 80.2 %', '12,000 bits / 275.1 µs = 43.621 Mb/s', '7.5')
  })
})

describe('tier1-project · the three variants, predicted', () => {
  it('moved to the living room: 9.000 m, MCS 3, and S = 19.350 Mb/s', () => {
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
    quotes('9.000 m → −72.33 dBm, 21.66 dB, MCS 3', '415.2 / 493.2 µs', '19.350 → 9.675 + 9.675 Mb/s')
  })

  it('a third contender: p = 17.81 % and S = 29.574 Mb/s; alone, 43.621 Mb/s', () => {
    const { p } = solveBianchi({ n: 3, ...PARAMS })
    expect((100 * p).toFixed(2)).toBe('17.81')
    const ts = mix([times(13).tsNs, times(13).tsNs, times(2).tsNs])
    const tc = mix([times(13).tcNs, times(13).tcNs, times(2).tcNs])
    expect(modelS(3, ts, tc).toFixed(3)).toBe('29.574')
    quotes('17.81 %', '29.574 Mb/s', '43.621 Mb/s', '129.6 / 207.6 µs')
  })
})

/**
 * Amendment of 2026-09-23: the brief now carries the plan itself as steps —
 * what is already set up, what to work out in which order, when to run, which
 * records to read each figure off, and what to write down. Every reading the
 * plan sends the learner to has to exist in the run they are told to make.
 */
describe('tier1-project · the plan, step by step', () => {
  const records = runOf(tier1Project, undefined, RUN_NS)

  it('step 1: the scene already is the brief — nothing for the learner to set up', () => {
    const scen = projectFlat()
    for (const n of scen.nodes) {
      expect(n.caps.widthMhz).toBe(20)
      expect(n.caps.nss ?? 1).toBe(1)
      expect(n.caps.features.edca ?? false).toBe(false)
      expect(n.caps.features.ampdu ?? false).toBe(false)
      expect(n.caps.features.txop ?? false).toBe(false)
    }
    quotes('Set nothing up', '20 MHz, one stream, no priority classes, no bundling, no reserved turns')
  })

  it('steps 2 to 4: the order is the order the predictions depend on each other in', () => {
    // (a) fixes the rung; (b) prices the exchange from that rung; (c) and (d) take
    // the two exchange times as their only input — so no step can be taken early.
    const scen = projectFlat()
    const rssi = buildLinkTable(scen.nodes, scen.walls).get('sta-1')!.get('ap')!
    const mcs = mcsForRssi('eht', rssi, undefined, 20)
    expect(times(mcs).dataNs).toBe(129_600)
    expect(mix([times(13).tsNs, times(2).tsNs]) / 1000).toBeCloseTo(406.8, 1)
    expect(MSDU + MAC_HDR_BYTES + FCS_BYTES).toBe(1528)
    quotes('the symbols 1528 bytes need', 'the fixed point for two contenders')
  })

  it('step 5: every reading the plan names is in the run — rung, block length, retries, counters', () => {
    const firstData = ofType(records, 'TX_START').find((r) => r.node === 'sta-1' && r.frame.kind === 'data')!
    expect(firstData.frame.mcs).toBe(13)
    expect(firstData.frame.txTimeNs).toBe(129_600)
    expect(ofType(records, 'RETRY').length).toBeGreaterThan(0)
    const sim = new Simulation(projectFlat())
    sim.runUntil(RUN_NS)
    for (const id of ['sta-1', 'sta-2']) {
      expect(sim.view.nodes[id].stats.txOk).toBeGreaterThan(0)
      expect(sim.view.nodes[id].stats.airtimeNs).toBeGreaterThan(0)
    }
    quotes('off the retry records', 'off its own counters')
  })

  it('step 6: the four lines are the four questions, and they are written before the run', () => {
    quotes('quantity, units, value', 'once you have read a result you can no longer honestly predict it')
    expect(tier1Project.numbers!.filter((b) => b.kind === 'steps').length).toBe(1)
    expect(tier1Project.picture!.filter((b) => b.kind === 'steps').length).toBe(1)
  })
})

describe('tier1-project · what the three observations send the reader to read', () => {
  const records = runOf(tier1Project, undefined, RUN_NS)

  it('both stations pick their rung on the very first frame they send', () => {
    const first = (id: string): number => {
      const r = ofType(records, 'TX_START').find((x) => x.node === id && x.frame.kind === 'data')!
      expect(r, id).toBeDefined()
      return r.frame.mcs!
    }
    expect(first('sta-1')).toBe(13)
    expect(first('sta-2')).toBe(2)
    expect(ofType(records, 'TX_START').find((x) => x.node === 'sta-1' && x.frame.kind === 'data')!.frame.txTimeNs)
      .toBe(129_600)
    expect(ofType(records, 'TX_START').find((x) => x.node === 'sta-2' && x.frame.kind === 'data')!.frame.txTimeNs)
      .toBe(524_000)
  })

  it('a 16 µs gap, a 28 µs answer and a 34 µs wait, as the second observation says', () => {
    const ends = ofType(records, 'TX_END').filter((r) => r.frame.kind === 'data' && r.node === 'sta-1')
    const ack = ofType(records, 'TX_START').find((r) => r.frame.kind === 'ack' && ends.some((e) => r.t - e.t === SIFS_NS))
    expect(ack, 'an ACK one SIFS after a study-laptop frame').toBeDefined()
    expect(SIFS_NS).toBe(16_000)
    expect(ack!.frame.txTimeNs).toBe(28_000)
    expect(DIFS_NS).toBe(34_000)
    quotes('the gap is 16 µs, one SIFS, and the answer is 28 µs')
  })

  it('the first backoff draw is a whole number of slots, already from a doubled window', () => {
    // the two opening frames collide at t = 0, so the first draw in this scene is taken
    // from 32 values, not from the first window of 16 — which is what the observation says
    const draw = ofType(records, 'BACKOFF_DRAW')[0]
    expect(draw, 'a backoff draw').toBeDefined()
    expect(['sta-1', 'sta-2']).toContain(draw.node)
    expect(draw.cw).toBe(31)
    expect(Number.isInteger(draw.value)).toBe(true)
    expect(draw.value).toBeLessThanOrEqual(draw.cw)
    const opens = ofType(records, 'TX_START').filter((r) => r.frame.kind === 'data' && r.t === 0)
    expect(opens.map((r) => r.node).sort()).toEqual(['sta-1', 'sta-2'])
    expect(ofType(records, 'COLLISION')[0].nodes.slice().sort()).toEqual(['sta-1', 'sta-2'])
    quotes('already from a doubled window')
  })
})
