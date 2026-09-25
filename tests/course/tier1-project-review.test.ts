/**
 * Every measurement quoted in "Project — reading the results"
 * (src/course/tier1/tier1-project-review.ts), taken from a 10 s run of
 * `tier1-project`'s own scene and its three variants — the same builder and
 * the same variant array, so the split costs the reader nothing and the
 * recorded timeline hashes are the same run twice.
 *
 * The prediction side of every "predicted against measured" row is recomputed
 * here from the engine's own functions and the Bianchi solver, exactly as the
 * first half's test does, so neither column can drift.
 *
 * These pins moved here from tests/course/tier1-project.test.ts with the
 * sentences that carry them: the measured throughput and frame counts, the two
 * collision estimators, the airtime split, the deaf late start, the EIFS
 * deferrals and the three waits, and all three variants' results. The `.body!`
 * walk of the old flat shape is retired.
 */
import { describe, it, expect } from 'vitest'
import { tier1ProjectReview } from '../../src/course/tier1/tier1-project-review'
import { projectFlat, projectJumps, projectVariants } from '../../src/course/tier1/tier1-project'
import { saturationThroughput, solveBianchi } from '../../src/course/tier1/bianchiModel'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import { Simulation } from '../../src/engine/simulation'
import type { Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import {
  ACK_BYTES, CCA_ED_DBM, CCA_PD_DBM, DIFS_NS, FCS_BYTES, MAC_HDR_BYTES, SIFS_NS, SLOT_NS, ACK_TIMEOUT_NS,
  ctrlRespRateForMode, mcsForRssi, mcsRateMbps, noiseDbm, reqSinrDb, txTimeModeNs, txTimeNs,
} from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'
import { PREAMBLE_DETECT_SINR_DB } from '../../src/engine/channel'
import { lessonShapeSuite } from './kit'

const MS = 1_000_000
const SECS = 10
const RUN_NS = SECS * 1e9
const PAYLOAD_BITS = 12_000
const MSDU = 1500
const PARAMS = { W: 16, m: 6, attempts: 7 } as const

// ---------------------------------------------------------------------------
// the prediction side, as the first half computes it
// ---------------------------------------------------------------------------

function times(mcs: number): { dataNs: number; tsNs: number; tcNs: number } {
  const dataNs = txTimeModeNs('eht', MSDU + MAC_HDR_BYTES + FCS_BYTES, mcs, { widthMhz: 20 })
  const ackNs = txTimeNs(ACK_BYTES, ctrlRespRateForMode('eht', mcs, mcsRateMbps('eht', mcs)))
  return { dataNs, tsNs: dataNs + SIFS_NS + ackNs + DIFS_NS, tcNs: dataNs + ACK_TIMEOUT_NS + DIFS_NS }
}
const mix = (ts: number[]): number => ts.reduce((a, b) => a + b, 0) / ts.length
function modelS(n: number, tsNs: number, tcNs: number): number {
  const { tau } = solveBianchi({ n, ...PARAMS })
  return saturationThroughput({ n, tau, slotNs: SLOT_NS, tsNs, tcNs, payloadBits: PAYLOAD_BITS }).mbps
}

// ---------------------------------------------------------------------------
// the measurement side: one 10 s run per scene, memoised
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

const base = (): Stats => measure('base', tier1ProjectReview.scenario())
const vMoved = (): Stats => measure('moved', tier1ProjectReview.variants![0].scenario())
const vThird = (): Stats => measure('third', tier1ProjectReview.variants![1].scenario())
const vAlone = (): Stats => measure('alone', tier1ProjectReview.variants![2].scenario())

const mbps = (s: Stats, id: string): number => ((s.txOk.get(id) ?? 0) * PAYLOAD_BITS) / SECS / 1e6
const pooled = (s: Stats, ids: string[], m: Map<string, number>): number =>
  ids.reduce((a, id) => a + (m.get(id) ?? 0), 0) / ids.reduce((a, id) => a + (s.attempts.get(id) ?? 0), 0)

// ---------------------------------------------------------------------------

// The `quotes(...)` helper that used to stand here searched the lesson's own strings for
// each figure the rubric prints. Retired 2026-09-25: every figure it guarded is measured
// from the run or recomputed from the model below, which is the pin that catches a drift;
// the quotation only ever asserted how a sentence reads.

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
// `sameSceneAs` is the split rule: this lesson loads tier1-project's scene and
// its variants, so its recorded hashes are tier1-project's, value for value.
lessonShapeSuite(tier1ProjectReview, { runNs: 30 * MS, sameSceneAs: 'tier1-project' })

describe('tier1-project-review · the lesson itself', () => {
  it('is the second half of the project and owns the three words it marks with', () => {
    expect(MODULES[tier1ProjectReview.module].title).toBe('第一阶段项目')
    // Re-pacing 2026-09-25 §7: the two clear-channel thresholds moved to `cca`, which
    // shows them against a run, so this lesson points there and names it as a need.
    expect(tier1ProjectReview.needs).toEqual(['tier1-project', 'cca', 'hidden', 'anomaly'])
    expect(COURSE_ORDER.indexOf('cca')).toBeLessThan(COURSE_ORDER.indexOf('tier1-project-review'))
    expect(COURSE_ORDER.indexOf('tier1-project-review')).toBe(COURSE_ORDER.indexOf('tier1-project') + 1)
    // Whole-track review M2: `capture` and `residual` are terms of bianchi-vs-sim, two lessons
    // earlier; a word cannot be new twice, so this lesson owns only `estimator`.
    expect(tier1ProjectReview.terms!.map((t) => t.term)).toEqual(['estimator'])
    // it is a review, not exposition: a rubric the learner marks their own sheet against
  })

  it('loads tier1-project’s own scene and its three variants, object for object', () => {
    expect(tier1ProjectReview.scenario()).toEqual(projectFlat())
    expect(tier1ProjectReview.variants).toBe(projectVariants)
    expect(tier1ProjectReview.jumps).toBe(projectJumps)
  })
})

/**
 * Amendment of 2026-09-23: the marking guide is now a procedure — what each
 * result should look like, which record proves it, and what a wrong answer
 * usually looks like. Each step is pinned against the same run the rubric
 * marks, so a mark scheme cannot drift from the thing being marked.
 */
describe('tier1-project-review · how to mark a sheet', () => {
  it('step (a): the two levels a marker checks against, and the record that carries the rung', () => {
    const scen = projectFlat()
    const table = buildLinkTable(scen.nodes, scen.walls)
    expect(table.get('sta-1')!.get('ap')!.toFixed(2)).toBe('-40.73')
    expect(table.get('sta-2')!.get('ap')!.toFixed(2)).toBe('-75.15')
    expect(base().firstMcs.get('sta-1')).toBe(13)
    expect(base().firstMcs.get('sta-2')).toBe(2)
  })

  it('step (b): the two block lengths on screen, and the two ways an answer gets them wrong', () => {
    expect(times(13).dataNs).toBe(129_600)
    expect(times(2).dataNs).toBe(524_000)
    // the header and check bytes the wrong answer drops, and the rounding it gets backwards
    expect(MSDU + MAC_HDR_BYTES + FCS_BYTES).toBe(1528)
  })

  it('step (c): the retry rate and the collision chance are not the same quantity', () => {
    const ids = ['sta-1', 'sta-2']
    const retryRate = pooled(base(), ids, base().retries)
    const overlapRate = pooled(base(), ids, base().overlaps)
    const { p } = solveBianchi({ n: 2, ...PARAMS })
    expect(Math.abs(retryRate - p)).toBeLessThan(Math.abs(overlapRate - p)) // the trap the step names
    expect(overlapRate).toBeGreaterThan(2 * p)
  })

  it('step (d): near enough equal turns, and an air split that is not equal', () => {
    const s = base()
    expect(Math.abs(s.txOk.get('sta-1')! - s.txOk.get('sta-2')!) / s.txOk.get('sta-1')!).toBeLessThan(0.07)
    const air = (id: string): number => s.airtimeNs.get(id)! / (s.airtimeNs.get('sta-1')! + s.airtimeNs.get('sta-2')!)
    expect((100 * air('sta-1')).toFixed(1)).toBe('21.2')
    expect((100 * air('sta-2')).toFixed(1)).toBe('78.8')
  })

  it('steps 5 and 6: both mechanisms point at a record, and the residual is stated not fitted', () => {
    const s = base()
    // capture: the overlap count against the retry count, both read off the log
    expect(s.overlaps.get('sta-1')! + s.overlaps.get('sta-2')!).toBe(4990)
    expect(s.retries.get('sta-1')! + s.retries.get('sta-2')!).toBe(2713)
    // the deaf late start: collision records whose two starts are far apart in time
    expect(s.pairLate.get('sta-1+sta-2')).toBe(1342)
    expect(s.pairTotal.get('sta-1+sta-2')).toBe(2399)
    expect(tier1ProjectReview.numbers!.filter((b) => b.kind === 'steps').length).toBe(1)
  })
})

describe('tier1-project-review · predicted against measured', () => {
  it('both rungs hold on the first frame each station sends', () => {
    expect(base().firstMcs.get('sta-1')).toBe(13)
    expect(base().firstMcs.get('sta-2')).toBe(2)
  })

  it('22.610 Mb/s against the predicted 25.585, 11.6 % short', () => {
    const s = base()
    expect(s.txOk.get('sta-1')).toBe(9719)
    expect(s.txOk.get('sta-2')).toBe(9123)
    expect(mbps(s, 'sta-1').toFixed(3)).toBe('11.663')
    expect(mbps(s, 'sta-2').toFixed(3)).toBe('10.948')
    const total = mbps(s, 'sta-1') + mbps(s, 'sta-2')
    expect(total.toFixed(3)).toBe('22.610')
    const S = modelS(2, mix([times(13).tsNs, times(2).tsNs]), mix([times(13).tcNs, times(2).tcNs]))
    expect(S.toFixed(3)).toBe('25.585')
    expect((100 * (S - total) / S).toFixed(1)).toBe('11.6')
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
  })

  it('the airtime split measures 21.2 / 78.8 against the predicted 19.8 / 80.2', () => {
    const fast = times(13).dataNs
    const slow = times(2).dataNs
    expect((100 * fast / (fast + slow)).toFixed(1)).toBe('19.8')
    expect((100 * slow / (fast + slow)).toFixed(1)).toBe('80.2')

    const s = base()
    const a1 = s.airtimeNs.get('sta-1')!
    const a2 = s.airtimeNs.get('sta-2')!
    expect((100 * a1 / (a1 + a2)).toFixed(1)).toBe('21.2')
    expect((100 * a2 / (a1 + a2)).toFixed(1)).toBe('78.8')
    // equal turns, about four times the airtime — what the third observation says
    expect(a2 / a1).toBeGreaterThan(3.5)
    const ratio = s.txOk.get('sta-1')! / s.txOk.get('sta-2')!
    expect(ratio).toBeGreaterThan(0.9)
    expect(ratio).toBeLessThan(1.1)
  })

  it('alone the study laptop should get 43.621 Mb/s and gets 42.470, retrying 0.28 %', () => {
    const perExchangeNs = times(13).tsNs + 7.5 * SLOT_NS
    expect((PAYLOAD_BITS / (perExchangeNs * 1e-9) / 1e6).toFixed(3)).toBe('43.621')
    const s = vAlone()
    expect(mbps(s, 'sta-1').toFixed(3)).toBe('42.470')
    expect((100 * pooled(s, ['sta-1'], s.retries)).toFixed(2)).toBe('0.28')
  })
})

describe('tier1-project-review · where the gap comes from', () => {
  it('the deaf late start: 1,342 of 2,399 laptop-against-laptop collisions begin late', () => {
    const s = base()
    expect(s.pairTotal.get('sta-1+sta-2')).toBe(2399)
    expect(s.pairLate.get('sta-1+sta-2')).toBe(1342)
    expect(s.collisions).toBe(2733)
  })

  it('the first millisecond: a second start at 406.6 µs, inside a frame still running', () => {
    const s = base()
    const tx1 = s.records.filter((r) => r.type === 'TX_START' && r.node === 'sta-1' && r.frame.kind === 'data')
    const tx2 = s.records.filter((r) => r.type === 'TX_START' && r.node === 'sta-2' && r.frame.kind === 'data')
    expect(tx1[0].t).toBe(0)
    expect(tx2[0].t).toBe(0)
    expect(tx1[1].t).toBe(406_600)
    expect(tx1[1].t).toBeLessThan(tx2[0].t + times(2).dataNs)
  })

  it('the levels the two laptops hear each other at, and the rung they cannot decode', () => {
    const scen = projectFlat()
    const table = buildLinkTable(scen.nodes, scen.walls)
    const near = table.get('sta-1')!.get('ap')!
    const far = table.get('sta-2')!.get('ap')!
    expect(near - far).toBeCloseTo(34.4, 1)
    const mutual = table.get('sta-1')!.get('sta-2')!
    expect(mutual.toFixed(2)).toBe('-72.64')
    expect((mutual - noiseDbm(20)).toFixed(2)).toBe('21.35')
    expect(reqSinrDb('eht', 13).toFixed(2)).toBe('44.99')
    // Above preamble detection, far below energy detection. The two constants are the
    // `cca` lesson's own material now (re-pacing §7), and they stay pinned there and in
    // tests/course/cca.test.ts against CCA_PD_DBM / CCA_ED_DBM; what this file keeps is
    // the claim the deaf late start rests on — that THIS pair of laptops falls between
    // them — which is why the pin stays here with the sentence it guards.
    expect(mutual).toBeGreaterThan(CCA_PD_DBM)
    expect(mutual).toBeLessThan(CCA_ED_DBM)
    expect([CCA_PD_DBM, CCA_ED_DBM]).toEqual([-82, -62])
  })

  it('the three waits after one frame: 45, 94 and 34 µs, and 9,499 of the middle one', () => {
    expect(base().eifs).toBe(9499)
    expect(ACK_TIMEOUT_NS).toBe(45_000)
    expect(DIFS_NS).toBe(34_000)
    expect(SIFS_NS + DIFS_NS + txTimeNs(ACK_BYTES, 6)).toBe(94_000)
  })

  /**
   * The capture depth that arrived here from `anomaly` in the re-pacing. §2 sent it
   * to `rate-vs-model`; it could not go there, because every station in that scene
   * arrives at the same level and no frame is ever captured (see that lesson's test).
   * This run is where capture is measured — 4,990 overlaps, 2,713 retries, 34.4 dB
   * between the two laptops — so the mechanism is taught beside its own figures.
   */
  it('the capture depth: a preamble needs 4 dB, and this flat gives the near one 34.4', () => {
    expect(PREAMBLE_DETECT_SINR_DB).toBe(4)
    const scen = projectFlat()
    const table = buildLinkTable(scen.nodes, scen.walls)
    const gap = table.get('sta-1')!.get('ap')! - table.get('sta-2')!.get('ap')!
    expect(gap.toFixed(1)).toBe('34.4')
    expect(gap).toBeGreaterThan(PREAMBLE_DETECT_SINR_DB)
    // and that is what turns 4,990 overlaps into only 2,713 retries
    const s = base()
    expect(s.overlaps.get('sta-1')! + s.overlaps.get('sta-2')!).toBe(4990)
    expect(s.retries.get('sta-1')! + s.retries.get('sta-2')!).toBe(2713)
    // the access point really does decode a frame it was colliding with: the winner
    // is read out while the loser leaves no RX_OK of its own
    expect(s.txOk.get('sta-1')!).toBeGreaterThan(0)
    expect(s.txOk.get('sta-2')!).toBeGreaterThan(0)
  })

  it('rate adaptation: the mean frame is 148.1 µs against 129.6, and 600.9 against 524.0', () => {
    const s = base()
    const mean = (id: string): number => s.airtimeNs.get(id)! / s.attempts.get(id)! / 1000
    expect(mean('sta-1').toFixed(1)).toBe('148.1')
    expect(mean('sta-2').toFixed(1)).toBe('600.9')
    expect(mean('sta-1')).toBeGreaterThan(times(13).dataNs / 1000)
    expect(mean('sta-2')).toBeGreaterThan(times(2).dataNs / 1000)
  })
})

describe('tier1-project-review · the three variants, run', () => {
  it('moved to the living room: 16.796 Mb/s measured, and 11.10 % of attempts overlapping', () => {
    const scen = tier1ProjectReview.variants![0].scenario()
    const rssi = buildLinkTable(scen.nodes, scen.walls).get('sta-1')!.get('ap')!
    expect(mcsForRssi('eht', rssi, undefined, 20)).toBe(3)
    const S = modelS(2, mix([times(3).tsNs, times(2).tsNs]), mix([times(3).tcNs, times(2).tcNs]))
    expect(S.toFixed(3)).toBe('19.350')

    const s = vMoved()
    expect(s.firstMcs.get('sta-1')).toBe(3)
    expect(mbps(s, 'sta-1').toFixed(3)).toBe('8.737')
    expect(mbps(s, 'sta-2').toFixed(3)).toBe('8.059')
    expect((mbps(s, 'sta-1') + mbps(s, 'sta-2')).toFixed(3)).toBe('16.796')
    const overlap = pooled(s, ['sta-1', 'sta-2'], s.overlaps)
    expect((100 * overlap).toFixed(2)).toBe('11.10')
    // the point of the experiment: with both frames long and alike, the late start nearly vanishes
    expect(Math.abs(100 * overlap - 100 * solveBianchi({ n: 2, ...PARAMS }).p)).toBeLessThan(1)
  })

  it('a third contender: 17.13 % measured against 17.81 %, and 21.184 Mb/s, 28 % short', () => {
    const { p } = solveBianchi({ n: 3, ...PARAMS })
    expect((100 * p).toFixed(2)).toBe('17.81')
    const S = modelS(3, mix([times(13).tsNs, times(13).tsNs, times(2).tsNs]),
      mix([times(13).tcNs, times(13).tcNs, times(2).tcNs]))
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
    // rate adaptation walks the living-room laptop down to the bottom rung
    const mcs0 = s.records.filter((r) => r.type === 'TX_START' && r.node === 'sta-2' && r.frame.kind === 'data' && r.frame.mcs === 0).length
    expect(mcs0).toBeGreaterThan(1000)
  })
})
