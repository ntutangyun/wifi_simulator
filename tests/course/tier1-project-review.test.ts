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
 * collision estimators, the airtime split, the late start into a frame in the air, the EIFS
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
  EIFS_NS,
} from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'
import { PREAMBLE_DETECT_SINR_DB } from '../../src/engine/channel'
import { lessonShapeSuite } from './kit'
import { readFileSync } from 'node:fs'

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
    // the late start into a frame already in the air: collision records whose two starts are far apart
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
  it('the late start into a frame in the air: 1,342 of 2,399 laptop-against-laptop collisions begin late', () => {
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
    // the claim the late start rests on — that THIS pair of laptops falls between
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

/**
 * **Every figure the prose prints, read back out of it.**
 *
 * This file has a comment where this describe should always have been. It says, of a helper
 * retired on 2026-09-25 that used to search the lesson's own strings for each figure of the
 * rubric:
 *
 *   > every figure it guarded is measured from the run or recomputed from the model below, which
 *   > is the pin that catches a drift; the quotation only ever asserted how a sentence reads.
 *
 * **That is the claim this programme has since measured, and it is false.** Measuring the engine
 * pins the engine; it says nothing about what the lesson prints. The sampling sweep of
 * 2026-10-12 planted six of this lesson's figures and every one went unnoticed — 6 of 6 — which
 * is what the retired helper would have caught and what nothing else in this file can.
 *
 * So the quotation comes back, in the form this programme settled on: not `toContain`, but the
 * figure parsed **out of the lesson** and compared with the same measurement the assertions
 * above make. Nothing new is measured: the same `base`, `vMoved`, `vThird`, `vAlone`, `mbps`,
 * `pooled`, `times`, `modelS` and the same engine constants.
 */
describe('tier1-project-review · every figure the prose prints, read back out of it', () => {
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
  const NUMS = blockText(tier1ProjectReview.numbers)
  const DEEP = blockText(tier1ProjectReview.deeper)
  const SRC = blockText(tier1ProjectReview.sources)
  const LIM = blockText(tier1ProjectReview.limits)
  const OBS = blockText(tier1ProjectReview.observe)
  const QUIZ = blockText(tier1ProjectReview.quiz)
  const ALL = [NUMS, DEEP, SRC, LIM, OBS, QUIZ].join('\n')

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const every = (text: string, re: RegExp, what: string, want: number): string[][] => {
    const ms = [...text.matchAll(re)]
    expect(ms.length, `${what}: the lesson prints this ${ms.length} times, not ${want}`).toBe(want)
    return ms.map((mm) => mm.slice(1))
  }
  /** A figure READ off the lesson against a measurement, at the precision it was printed to. */
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const tableOf = (needle: string): string[][] => {
    const b = tier1ProjectReview.numbers!.find((x) => x.kind === 'table'
      && (x as { heading?: string }).heading?.includes(needle))
    expect(b, `no table whose heading contains 「${needle}」`).toBeDefined()
    return (b as { rows: string[][] }).rows
  }
  const rowOf = (needle: string, label: string): string[] => {
    const hit = tableOf(needle).find((x) => x[0]!.startsWith(label))
    expect(hit, `no row 「${label}」 in the 「${needle}」 table`).toBeDefined()
    return hit!
  }
  const occ = (text: string, needle: string): number => text.split(needle).length - 1
  const STUDY = 'sta-1'
  const LIVING = 'sta-2'

  it('reads the headline table: the two frames, the two estimators and the throughput', () => {
    const s = base()
    // 「数据帧 | 129.6 / 524.0 µs | 全程均值 148.1 / 600.9 µs」
    const frames = rowOf('预测对实测', '数据帧')
    const [predShort, predLong] = figs(frames[1]!, /^([\d.]+) \/ ([\d.]+) µs$/, 'the predicted frame lengths')
    const [gotShort, gotLong] = figs(frames[2]!, /全程均值 ([\d.]+) \/ ([\d.]+) µs/, 'the measured means')
    const firstRung = (id: string): number => s.firstMcs.get(id)!
    same(String(predShort), times(firstRung(STUDY)).dataNs / 1000, 'the study laptop’s frame at its rung')
    same(String(predLong), times(firstRung(LIVING)).dataNs / 1000, 'and the living-room laptop’s')
    const meanFrameUs = (id: string): number => {
      const ds = s.records.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> =>
        r.type === 'TX_START' && r.node === id && r.frame.kind === 'data')
      return ds.reduce((a, r) => a + r.frame.txTimeNs, 0) / ds.length / 1000
    }
    same(String(gotShort), meanFrameUs(STUDY), 'the study laptop’s measured mean frame')
    same(String(gotLong), meanFrameUs(LIVING), 'and the living-room laptop’s')
    expect(gotShort, 'which is longer than predicted, because the rung falls').toBeGreaterThan(predShort!)
    // 「碰撞概率 | 10.46 % | 23.15 % 的尝试重叠；12.59 % 以重传收场」
    const coll = rowOf('预测对实测', '碰撞概率')
    const [predPct] = figs(coll[1]!, /^([\d.]+) %$/, 'the predicted collision chance')
    const [overlapPct, retryPct] = figs(coll[2]!, /([\d.]+) % 的尝试重叠；([\d.]+) % 以重传收场/,
      'the two measured estimators')
    const ids = [STUDY, LIVING]
    same(String(overlapPct), 100 * pooled(s, ids, s.overlaps), 'the attempts that overlap')
    same(String(retryPct), 100 * pooled(s, ids, s.retries), 'and the attempts that end in a retry')
    const { tau } = solveBianchi({ n: 2, ...PARAMS })
    same(String(predPct), 100 * (1 - (1 - tau) ** (2 - 1)), 'the chance the model predicts')
    expect(overlapPct, 'the overlap rate is the larger of the two measurements').toBeGreaterThan(retryPct!)
    // 「合计交付 | 25.585 Mb/s | 22.610 Mb/s」
    const total = rowOf('预测对实测', '合计交付')
    const [predMbps] = figs(total[1]!, /^([\d.]+) Mb\/s$/, 'the predicted throughput')
    const [gotMbps] = figs(total[2]!, /^([\d.]+) Mb\/s$/, 'the measured throughput')
    same(String(gotMbps), ids.reduce((a, id) => a + mbps(s, id), 0), 'what the two laptops deliver')
    same(String(predMbps), modelS(2, mix(ids.map((id) => times(firstRung(id)).tsNs)),
      mix(ids.map((id) => times(firstRung(id)).tcNs))), 'what the model says they should')
    // 「各自帧数 | 相同 | 9,719 / 9,123」
    const counts = rowOf('预测对实测', '各自帧数')
    const [cShort, cLong] = figs(counts[2]!, /^([\d,]+) \/ ([\d,]+)$/, 'the two frame counts')
    expect([cShort, cLong], 'the frames each laptop gets out')
      .toEqual(ids.map((id) => s.txOk.get(id)!))
    expect(counts[1], 'which the plan expected to be the same').toBe('相同')
    // 「空口占比 | 19.8 % / 80.2 % | 21.2 % / 78.8 %」
    const air = rowOf('预测对实测', '空口占比')
    const [gotA, gotB] = figs(air[2]!, /^([\d.]+) % \/ ([\d.]+) %$/, 'the measured airtime split')
    const totalAir = ids.reduce((a, id) => a + s.airtimeNs.get(id)!, 0)
    same(String(gotA), (100 * s.airtimeNs.get(STUDY)!) / totalAir, 'the study laptop’s share of the air')
    same(String(gotB), (100 * s.airtimeNs.get(LIVING)!) / totalAir, 'and the living-room laptop’s')
    expect(gotA! + gotB!, 'which together are the whole air').toBeCloseTo(100, 1)
    const [predA, predB] = figs(air[1]!, /^([\d.]+) % \/ ([\d.]+) %$/, 'the predicted split')
    const predFrames = ids.map((id) => times(firstRung(id)).dataNs)
    same(String(predA), (100 * predFrames[0]!) / (predFrames[0]! + predFrames[1]!),
      'the share the two frame lengths predict')
    expect(predA! + predB!, 'and that pair adds up too').toBeCloseTo(100, 1)
  })

  it('reads the three variants’ rows, including the sums inside them', () => {
    /*
     * **The third contender is `sta-4`** — the tablet the variant adds, not a third laptop.
     * And the percentage column mixes its two estimators row by row: the moved variant prints
     * the overlap rate, the other two print the retry rate. That is worth knowing rather than
     * worth hiding, so the read below requires the printed figure to be ONE of the two this
     * run measures, and the two are far enough apart that a planted digit matches neither.
     */
    const cases: [string, () => Stats, string[]][] = [
      ['书房笔记本搬到客厅', vMoved, [STUDY, LIVING]],
      ['多一台平板', vThird, [STUDY, LIVING, 'sta-4']],
      ['客厅笔记本离线', vAlone, [STUDY]],
    ]
    for (const [label, get, ids] of cases) {
      const row = rowOf('三个变体', label)
      const st = get()
      // The measured cell: a total, sometimes written as the sum of its parts, and a percentage.
      const parts = [...row[2]!.matchAll(/([\d.]+)/g)].map((mm) => Number(mm[1]))
      const [measured] = parts
      same(String(measured), ids.reduce((a, id) => a + mbps(st, id), 0),
        `the throughput of 「${label}」`)
      if (/=/.test(row[2]!)) {
        const sum = row[2]!.split('=')[1]!.split('Mb/s')[0]!
        const terms = [...sum.matchAll(/([\d.]+)/g)].map((mm) => Number(mm[1]))
        expect(terms.length, `the terms of 「${label}」`).toBe(ids.length)
        terms.forEach((x, i) => same(String(x), mbps(st, ids[i]!), `${ids[i]}’s own share`))
        expect(terms.reduce((a, b) => a + b, 0), 'and the terms add up to the total it prints')
          .toBeCloseTo(measured!, 2)
      }
      const pct = /· ([\d.]+) %/.exec(row[2]!)
      if (pct !== null) {
        const dp = (pct[1]!.split('.')[1] ?? '').length
        const both = [st.overlaps, st.retries]
          .map((m) => Number((100 * pooled(st, ids, m)).toFixed(dp)))
        expect(both, `the percentage of 「${label}」 is one of its two estimators`)
          .toContain(Number(pct[1]))
        expect(both[0], 'and the two estimators really are different numbers').not.toBe(both[1])
      }
      // The predicted cell: the model at that many contenders, and — where it prints one —
      // the collision chance the same model gives, which the sweep of 2026-10-13 found unread.
      const predMbps = /^([\d.]+) Mb\/s/.exec(row[1]!)
      expect(predMbps, `the predicted cell of 「${label}」`).not.toBeNull()
      same(predMbps![1]!, modelS(ids.length, mix(ids.map((id) => times(st.firstMcs.get(id)!).tsNs)),
        mix(ids.map((id) => times(st.firstMcs.get(id)!).tcNs))), `what the model says for 「${label}」`)
      const predPct = /· ([\d.]+) %/.exec(row[1]!)
      if (predPct !== null) {
        const { p } = solveBianchi({ n: ids.length, ...PARAMS })
        same(predPct[1]!, 100 * p, `the collision chance the model gives 「${label}」`)
      }
    }
    // 「少了 28 %：客厅笔记本被压到调制与编码方式（MCS）0」
    const third = rowOf('三个变体', '多一台平板')
    const [shortBy, rung] = figs(third[3]!, /少了 (\d+) %：客厅笔记本被压到调制与编码方式（MCS）(\d+)/,
      'the third variant’s own cause')
    const st = vThird()
    const ids = [STUDY, LIVING, 'sta-4']
    const got = ids.reduce((a, id) => a + mbps(st, id), 0)
    const pred = modelS(3, mix(ids.map((id) => times(st.firstMcs.get(id)!).tsNs)),
      mix(ids.map((id) => times(st.firstMcs.get(id)!).tcNs)))
    expect(Math.round(100 * (1 - got / pred)), 'how far short it falls, as the cell rounds it')
      .toBe(shortBy)
    const rungs = [...st.records
      .filter((r): r is Extract<TLRecord, { type: 'TX_START' }> => r.type === 'TX_START'
        && r.node === LIVING && r.frame.kind === 'data')
      .reduce((s2, r) => s2.add(r.frame.mcs!), new Set<number>())]
    // 「被压到」 is the bottom it reaches, not one rung among the several it walks through —
    // which is how the sweep of 2026-10-13 walked through this figure.
    expect(Math.min(...rungs), 'the rung the living-room laptop is pushed down to').toBe(rung)
    expect(rungs.length, 'and it really does walk down a ladder to get there').toBeGreaterThan(1)
  })

  it('reads the gap table: the capture counts, the late starts and the lengthening', () => {
    const s = base()
    // 「4,990 次重叠 → 2,713 次重传」 and 「约 46 % 的重叠帧仍被收下；两台相差 34 dB」
    const cap = rowOf('差距出在哪里', '捕获效应')
    const [overlaps, retries] = figs(cap[1]!, /^([\d,]+) 次重叠 → ([\d,]+) 次重传$/, 'the capture counts')
    expect(overlaps, 'the overlapping attempts of the round')
      .toBe([STUDY, LIVING].reduce((a, id) => a + (s.overlaps.get(id) ?? 0), 0))
    expect(retries, 'and the ones that became retries')
      .toBe([STUDY, LIVING].reduce((a, id) => a + (s.retries.get(id) ?? 0), 0))
    const [kept, apart] = figs(cap[2]!, /约 (\d+) % 的重叠帧仍被收下；两台相差 (\d+) dB/, 'the capture share')
    expect(Math.round(100 * (1 - retries! / overlaps!)), 'the share capture keeps, as the cell rounds it')
      .toBe(kept)
    const sc = tier1ProjectReview.scenario()
    const links = buildLinkTable(sc.nodes, sc.walls)
    const gap = Math.abs(links.get(STUDY)!.get('ap')! - links.get(LIVING)!.get('ap')!)
    expect(Math.round(gap), 'how far apart the two arrive at the router').toBe(apart)
    // 「2,399 次笔记本互撞中有 1,342 次」 and 「10.46 % → 23.15 %」
    const late = rowOf('差距出在哪里', '前导码未检出')
    const [pairTotal, pairLate] = figs(late[1]!, /^([\d,]+) 次笔记本互撞中有 ([\d,]+) 次$/, 'the late starts')
    const key = [STUDY, LIVING].sort().join('+')
    expect(pairTotal, 'the collisions between the two laptops').toBe(s.pairTotal.get(key))
    expect(pairLate, 'and the ones that began late').toBe(s.pairLate.get(key))
    const [from, to] = figs(late[2]!, /^([\d.]+) % → ([\d.]+) %$/, 'the estimator it moves')
    const { tau } = solveBianchi({ n: 2, ...PARAMS })
    same(String(from), 100 * (1 - (1 - tau) ** (2 - 1)), 'the model’s own figure')
    same(String(to), 100 * pooled(s, [STUDY, LIVING], s.overlaps), 'and the measured overlap rate')
    // 「148.1 vs 129.6 µs · 600.9 vs 524.0 µs」 and 「吞吐少掉的 11.6 % 的大部分」
    const longer = rowOf('差距出在哪里', '帧在速率控制下变长')
    const [gotShort, predShort, gotLong, predLong] = figs(longer[1]!,
      /^([\d.]+) vs ([\d.]+) µs · ([\d.]+) vs ([\d.]+) µs$/, 'the four frame lengths')
    const frames = rowOf('预测对实测', '数据帧')
    expect([predShort, predLong], 'the two predicted lengths, as the first table prints them')
      .toEqual(figs(frames[1]!, /^([\d.]+) \/ ([\d.]+) µs$/, 'the predicted pair'))
    expect([gotShort, gotLong], 'and the two measured means')
      .toEqual(figs(frames[2]!, /全程均值 ([\d.]+) \/ ([\d.]+) µs/, 'the measured pair'))
    const [shortfall] = figs(longer[2]!, /吞吐少掉的 ([\d.]+) %/, 'the shortfall it explains')
    const ids = [STUDY, LIVING]
    const pred = modelS(2, mix(ids.map((id) => times(s.firstMcs.get(id)!).tsNs)),
      mix(ids.map((id) => times(s.firstMcs.get(id)!).tcNs)))
    const got = ids.reduce((a, id) => a + mbps(s, id), 0)
    same(String(shortfall), 100 * (1 - got / pred), 'the throughput the round falls short by')
  })

  it('reads the three waits and the level that decides between them', () => {
    const s = base()
    // 「碰撞的一方 | 回答没有来 | 45 µs」
    const [ackTo] = figs(rowOf('同一帧之后', '碰撞的一方')[2]!, /^(\d+) µs$/, 'the ACK timeout')
    expect(ackTo! * 1000, 'the timeout a station waits when no answer comes').toBe(ACK_TIMEOUT_NS)
    // 「客厅笔记本 | 21.35 dB，而这一帧要求 44.99 dB | EIFS，94 µs——共 9,499 次」
    const eifsRow = rowOf('同一帧之后', '客厅笔记本')
    const [got, need] = figs(eifsRow[1]!, /^([\d.]+) dB，而这一帧要求 ([\d.]+) dB$/, 'the two SINRs')
    const sc = tier1ProjectReview.scenario()
    const links = buildLinkTable(sc.nodes, sc.walls)
    const level = links.get(STUDY)!.get(LIVING)!
    same(String(got), level - noiseDbm(20), 'what the living-room laptop can make of it')
    same(String(need), reqSinrDb('eht', s.firstMcs.get(STUDY)!), 'and what that rung asks for')
    expect(got, 'which it cannot meet').toBeLessThan(need!)
    const [eifsUs, eifsCount] = figs(eifsRow[2]!, /EIFS，(\d+) µs——共 ([\d,]+) 次/, 'the EIFS and its count')
    expect(eifsUs! * 1000, 'the extended interframe space').toBe(EIFS_NS)
    expect(eifsCount, 'and how many times this round waits one').toBe(s.eifs)
    // 「什么都没检出的 | 完全没有前导码 | DIFS, 34 µs」
    const [difsUs] = figs(rowOf('同一帧之后', '什么都没检出的')[2]!, /DIFS, (\d+) µs/, 'the DIFS')
    expect(difsUs! * 1000, 'the shortest of the three waits').toBe(DIFS_NS)
    expect(ackTo, 'and the three really are three different lengths').not.toBe(difsUs)
    /*
     * **Every 「−N dBm」 the lesson prints is one of two levels**: the one the two laptops hear
     * each other at (three printings) and the further laptop's arrival at the router, which the
     * marking rubric names (one). Both are measured, so the read needs no literal — and the
     * count keeps a new printing from slipping in unread.
     */
    const arrivals = [STUDY, LIVING].map((id) => links.get(id)!.get('ap')!)
    const levels = every(ALL, /−([\d.]+) dBm/g, 'every level the lesson prints', 4)
      .map(([dbm]) => Number(`-${dbm}`))
    expect(levels.filter((x) => x === Number(level.toFixed(2))).length,
      'the level the two laptops hear each other at, printed three times').toBe(3)
    expect(levels.filter((x) => arrivals.some((a) => x === Number(a.toFixed(2)))).length,
      'and one arrival level at the router').toBe(1)
    expect(level, 'above the preamble-detect threshold').toBeGreaterThan(CCA_PD_DBM)
    expect(level, 'and below the energy-detect one').toBeLessThan(CCA_ED_DBM)
  })

  it('reads `deeper` and `limits` on capture, and the two decibels behind the share', () => {
    const s = base()
    // 「一个前导码只有比空中其他一切高出至少 4 dB 才会被检测到」 — three printings of the same figure.
    for (const [db] of every(ALL, /高出(?:至少|空中其余一切) (\d+) dB|那 (\d+) dB 也是模型取值/g,
      'the preamble-detect margin', 3).map((g) => [g.find((x) => x !== undefined)!])) {
      expect(val(db!), 'the margin a preamble needs').toBe(PREAMBLE_DETECT_SINR_DB)
    }
    // 「这户人家的两台笔记本到达路由器的电平相差 34.4 dB」
    const sc = tier1ProjectReview.scenario()
    const links = buildLinkTable(sc.nodes, sc.walls)
    same(raw(DEEP, /到达路由器的电平相差 ([\d.]+) dB/, '`deeper` on the gap at the router')[0]!,
      Math.abs(links.get(STUDY)!.get('ap')! - links.get(LIVING)!.get('ap')!),
      'how far apart the two arrive at the router')
    // 「那 4,990 次重叠里只有 2,713 次变成重传」 — the same pair as the table.
    const [ov, rt] = figs(DEEP, /那 ([\d,]+) 次重叠里只有 ([\d,]+) 次变成重传/, '`deeper` on the pair')
    expect([ov, rt], 'the overlaps and the retries, printed again')
      .toEqual([STUDY, LIVING].map((_id, i) => [s.overlaps, s.retries][i]!)
        .map((m) => [STUDY, LIVING].reduce((a, id) => a + (m.get(id) ?? 0), 0)))
    // 「捕获随后又让其中约 46 % 根本没有进入重传计数」 and the same share in `limits` and the quiz.
    for (const [pct] of every(ALL, /约 (\d+) % (?:根本没有进入重传计数|的重叠帧仍被收下)|其中约 (\d+) % 因捕获/g,
      'the share capture keeps', 4).map((g) => [g.find((x) => x !== undefined)!])) {
      expect(Math.round(100 * (1 - rt! / ov!)), 'the share capture keeps').toBe(val(pct!))
    }
    // 「捕获要求新前导码比手上那一帧强 5 dB」 and 「换成 3 dB 或 8 dB，这个比例就变了」
    /*
     * **The capture margin is a constant of `channel.ts`**, and the entry names that file — so a
     * reader who goes there has to find the same number. It is read out of the source, which is
     * the only instrument there is: the margin is not configurable, so no run can measure it.
     */
    const [captureDb] = figs(LIM, /捕获要求新前导码比手上那一帧强 (\d+) dB/, '`limits` on the capture margin')
    const CH = readFileSync(new URL('../../src/engine/channel.ts', import.meta.url), 'utf8')
    expect(captureDb, 'the margin `channel.ts` really requires')
      .toBe(figs(CH, /CAPTURE_MARGIN_DB = (\d+)/, 'the margin in `channel.ts`')[0])
    /*
     * **Exempt, class (c): the two counterfactual margins.** 「换成 3 dB 或 8 dB，这个比例就变了」
     * claims only that the share moves with the margin, and any value either side of the
     * engine's own would say it equally — the sweep of 2026-10-13 walked through both. The
     * margin is not configurable, so neither can be measured; what IS checkable is the claim's
     * own shape, that one sits below the engine's margin and the other above it.
     */
    const [lo, hi] = figs(LIM, /换成 (\d+) dB 或 (\d+) dB/, '`limits` on the two counterfactuals')
    expect(lo, 'one below the engine’s own margin').toBeLessThan(captureDb!)
    expect(hi, 'and one above it').toBeGreaterThan(captureDb!)
    // 「那 2399 次笔记本互撞之所以能逐次判定」
    const key = [STUDY, LIVING].sort().join('+')
    expect(figs(LIM, /那 (\d+) 次笔记本互撞/, '`limits` on the pair’s collisions')[0],
      'the collisions between the two laptops').toBe(s.pairTotal.get(key))
    /*
     * **「一台发完 415 µs 的帧」 is the frame at the rung that variant starts on**, not the longest
     * frame of its round: rate control walks a station down after failures, so the round holds
     * frames of several lengths and the longest is not what the sentence is about.
     */
    const moved = vMoved()
    same(raw(DEEP, /一台发完 (\d+) µs 的帧/, '`deeper` on the moved variant’s frame')[0]!,
      times(moved.firstMcs.get(STUDY)!).dataNs / 1000, 'the frame that variant starts on')
  })

  it('reads both observe lines and the quiz’s own four figures', () => {
    const s = base()
    // 「书房笔记本 129.6 µs 的色块结束，然后在 406.6 µs 又发了一次——落在客厅笔记本那个仍在进行的 524.0 µs 帧里」
    const [first, again, long] = figs(OBS,
      /书房笔记本 ([\d.]+) µs 的色块结束，然后在 ([\d.]+) µs 又发了一次——落在客厅笔记本那个仍在进行的 ([\d.]+) µs 帧里/,
      'the first observe line')
    const starts = s.records.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> =>
      r.type === 'TX_START' && r.frame.kind === 'data')
    const studyFirst = starts.find((r) => r.node === STUDY)!
    const livingFirst = starts.find((r) => r.node === LIVING)!
    same(String(first), studyFirst.frame.txTimeNs / 1000, 'the study laptop’s first frame')
    same(String(long), livingFirst.frame.txTimeNs / 1000, 'and the living-room laptop’s')
    const studySecond = starts.filter((r) => r.node === STUDY)[1]!
    same(String(again), studySecond.t / 1000, 'when the study laptop starts again')
    expect(studySecond.t, 'which is inside the frame still in the air')
      .toBeLessThan(livingFirst.t + livingFirst.frame.txTimeNs)
    // 「上面写的是 94 µs，而不是 34」
    const [eifsUs, difsUs] = figs(OBS, /上面写的是 (\d+) µs，而不是 (\d+)/, 'the second observe line')
    expect(eifsUs! * 1000, 'the wait it shows').toBe(EIFS_NS)
    expect(difsUs! * 1000, 'and the one a reader expects').toBe(DIFS_NS)
    // 「成功交付 9,719 对 9,123」
    const [a, b] = figs(OBS, /成功交付 ([\d,]+) 对 ([\d,]+)/, 'the third observe line')
    expect([a, b], 'the frames each laptop gets out')
      .toEqual([STUDY, LIVING].map((id) => s.txOk.get(id)!))
    // The quiz: the predicted chance, the measured retry rate twice, and the overlap rate.
    const { tau } = solveBianchi({ n: 2, ...PARAMS })
    const [pred, retryPct] = figs(QUIZ, /你预测的碰撞概率是 ([\d.]+) %，实跑中 ([\d.]+) %/, 'the quiz’s question')
    same(String(pred), 100 * (1 - (1 - tau) ** (2 - 1)), 'the chance the model predicts')
    same(String(retryPct), 100 * pooled(s, [STUDY, LIVING], s.retries), 'the retry rate the run shows')
    expect(occ(QUIZ, `${retryPct} %`), 'the retry rate, printed twice in the quiz').toBe(2)
    same(raw(QUIZ, /实际有 ([\d.]+) % 的尝试重叠/, 'the quiz on the overlap rate')[0]!,
      100 * pooled(s, [STUDY, LIVING], s.overlaps), 'the overlap rate the run shows')
    const [apart] = figs(QUIZ, /两台笔记本之间差着 (\d+) dB/, 'the quiz on the gap between them')
    const sc = tier1ProjectReview.scenario()
    const links = buildLinkTable(sc.nodes, sc.walls)
    expect(Math.round(Math.abs(links.get(STUDY)!.get('ap')! - links.get(LIVING)!.get('ap')!)),
      'how far apart they arrive').toBe(apart)
  })

  it('reads the marking rubric, which prints the figures a marker compares against', () => {
    const sc = tier1ProjectReview.scenario()
    const links = buildLinkTable(sc.nodes, sc.walls)
    // 「两个到达电平都应落在 −40.73 与 −75.15 dBm 的一个分贝之内」
    const [near, far] = figs(NUMS, /都应落在 −([\d.]+) 与 −([\d.]+) dBm 的一个分贝之内/,
      'the rubric on the two arrival levels')
    const arrivals = [STUDY, LIVING].map((id) => links.get(id)!.get('ap')!).sort((a, b) => b - a)
    same(`-${near}`, arrivals[0]!, 'the nearer laptop’s arrival level')
    same(`-${far}`, arrivals[1]!, 'and the further one’s')
    // 「屏幕上是 129.6 与 524.0 µs」
    const [shortUs, longUs] = figs(NUMS, /屏幕上是 ([\d.]+) 与 ([\d.]+) µs/, 'the rubric on the two frames')
    const frames = rowOf('预测对实测', '数据帧')
    expect([shortUs, longUs], 'the two frames the first table predicts')
      .toEqual(figs(frames[1]!, /^([\d.]+) \/ ([\d.]+) µs$/, 'the predicted pair'))
    // 「占空口却是 21.2% 与 78.8%」
    const [airA, airB] = figs(NUMS, /占空口却是 ([\d.]+)% 与 ([\d.]+)%/, 'the rubric on the airtime split')
    const air = rowOf('预测对实测', '空口占比')
    expect([airA, airB], 'the measured split, as the first table prints it')
      .toEqual(figs(air[2]!, /^([\d.]+) % \/ ([\d.]+) %$/, 'the measured split'))
  })
})
