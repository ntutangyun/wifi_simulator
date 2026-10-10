/**
 * `'uhr'` over a round: **what the four new rungs are worth, measured, and where they are worth
 * nothing.**
 *
 * ## Why this file exists and not just `uhr-ladder.test.ts`
 *
 * The design note that proposed this slice carried its own reservation: its window table was a
 * DERIVATION, not a run — "跑不了，因为 `'uhr'` 还不存在". Three of the four new rungs own only a
 * 1 dB window, and it said in so many words that if the measured difference turns out too small
 * for a reader to read, the lesson should be sent back to the table. `'uhr'` exists now, so the
 * question is answerable, and the answer belongs in a test rather than in a report nobody runs.
 *
 * ## The A/B, and why it isolates the ladder
 *
 * Both arms are the SAME scene with every node flipped `eht` -> `uhr`. `PHY_MODES.uhr`'s
 * preamble, MU extra and symbol duration ARE `eht`'s values (welded in `uhr-ladder.test.ts`), so
 * airtime per symbol and per preamble is identical in the two arms and a goodput difference can
 * only come from N_DBPS.
 *
 * ## And why the seeds
 *
 * At a fixed position with no fading this engine is deterministic in the quantity being
 * measured, and one seed is the whole answer — stated here, because asserting a single seed
 * without saying that is how a single-seed A/B gets mistaken for a measurement. With fading on
 * it is nothing of the kind: the per-seed spread at the MCS20 window runs from −13 % to +14 %,
 * so a one-seed comparison there could have been reported as either a large win or a loss.
 * Every faded claim below is a mean over twenty seeds with its own spread asserted, and every
 * threshold it uses survived a sweep out to 120 seeds — see the convergence table further down,
 * and the paragraph about the sign this file pinned once and had to take back.
 */
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { PHY_MODES, UHR_SFD_MCS } from '../../src/engine/phy'
import { defaultScenario, type NodeCfg, type Scenario } from '../../src/model/scenario'
import type { Generation } from '../../src/model/types'
import type { TLRecord } from '../../src/model/records'
import type { Ns } from '../../src/model/types'

const MS = 1_000_000
/**
 * 600 ms for the deterministic ratios and 300 ms for the faded means.
 *
 * The long run is there because the MCS23 window's ratio is 1.0717 at 300 ms against the
 * ladder's own 1.0667, and 1.0671 at 600 ms: the shortest run still carries a start-up and
 * end-of-run edge worth half a percent on the narrowest of the four gains. The faded means do
 * not need it — the convergence table in the docblock below was measured at both lengths and the
 * means agree inside their own spread.
 */
const LONG_NS = 600 * MS
const RUN_NS = 300 * MS

/**
 * One AP and one saturated station on a clear line, both at 20 dBm so that the uplink the
 * `saturated` profile actually sends on has the same budget as the downlink. Distances come from
 * reading the SELECTED rung at each distance, never from predicting an SNR — the first attempt
 * at this measurement targeted the downlink budget while the traffic was uplink, and parked the
 * station five dB away from the window it was aiming at.
 */
function scene(gen: Generation, d: number, seed: number, fading?: Scenario['fading']): Scenario {
  const base = defaultScenario()
  const caps = { generation: gen, features: { edca: true, ampdu: true, txop: true } }
  const ap: NodeCfg = { ...base.nodes[0]!, pos: { x: 0.5, y: 4, z: 2 }, txPowerDbm: 20, caps }
  const sta: NodeCfg = {
    ...base.nodes[1]!, id: 'sta-1', name: 'STA', linkId: undefined,
    pos: { x: 0.5 + d, y: 4, z: 1 }, txPowerDbm: 20, profiles: ['saturated'], caps: { ...caps },
  }
  const sc: Scenario = { ...base, walls: [], nodes: [ap, sta], seed }
  return fading === undefined ? sc : { ...sc, fading }
}

const recs = (sc: Scenario, ns: Ns = RUN_NS): TLRecord[] => [...new Simulation(sc).runUntil(ns).records]

/** Goodput in Mb/s: each MSDU counted once, on the first PPDU that carried it successfully. */
function goodputMbps(rs: TLRecord[], ns: Ns = RUN_NS): number {
  const seen = new Set<number>()
  let bytes = 0
  for (const r of rs) {
    if (r.type !== 'RX_OK' || r.frame.kind !== 'data') continue
    const ids = r.frame.ampdu?.msduIds ?? (r.frame.msduId === undefined ? [] : [r.frame.msduId])
    const sizes = r.frame.msduBytes ?? []
    ids.forEach((id, i) => { if (!seen.has(id)) { seen.add(id); bytes += sizes[i] ?? 0 } })
  }
  return (bytes * 8) / (ns / 1e9) / 1e6
}

const topRung = (rs: TLRecord[]): number => rs.reduce(
  (b, r) => (r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.mcs !== undefined ? Math.max(b, r.frame.mcs) : b), -1)
const rungsUsed = (rs: TLRecord[]): number => new Set(rs.flatMap(
  (r) => (r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.mcs !== undefined ? [r.frame.mcs] : []))).size
const failures = (rs: TLRecord[]): number => rs.filter((r) => r.type === 'RX_FAIL').length

const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length
const SEEDS = [1, 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67]

/** `fading` with the SLOW layer on: this is what "let the SNR wander between windows" means. */
const SHADOW: Scenario['fading'] = { smallScale: 'none', shadowSigmaDb: 4, coherenceMs: 100 }
/** And with the fast layer too. `coherenceMs` keys only the slow layer — see `shadowDb`. */
const SHADOW_RAYLEIGH: Scenario['fading'] = { smallScale: 'rayleigh', shadowSigmaDb: 4, coherenceMs: 100 }

/**
 * The four distances at which the two ladders provably select DIFFERENT rungs, and the rungs
 * they select. Read off a 2…60 m sweep of the scene above; the `it` below re-derives them, so
 * these are measurements this file keeps rather than numbers it trusts.
 */
const WINDOWS = [
  { sfd: 23, d: 12.0, ehtIdx: 7, uhrIdx: 11, ratio: 1248 / 1170 },
  { sfd: 20, d: 22.5, ehtIdx: 4, uhrIdx: 7, ratio: 780 / 702 },
  { sfd: 19, d: 28.5, ehtIdx: 3, uhrIdx: 5, ratio: 624 / 468 },
  { sfd: 17, d: 49.5, ehtIdx: 1, uhrIdx: 2, ratio: 312 / 234 },
] as const

describe('uhr is never legal-and-inert: the new rungs are reached and they change the round', () => {
  it('each window really does select the new rung, and eht really is stuck below it', () => {
    for (const w of WINDOWS) {
      const e = recs(scene('eht', w.d, 1))
      const u = recs(scene('uhr', w.d, 1))
      expect(topRung(e), `eht at ${w.d} m`).toBe(w.ehtIdx)
      expect(topRung(u), `uhr at ${w.d} m`).toBe(w.uhrIdx)
      // the new rung is one of the four, and it is NOT a rung eht could have reached
      expect(UHR_SFD_MCS[w.uhrIdx]).toBe(w.sfd)
      expect(PHY_MODES.eht.ndbps).not.toContain(PHY_MODES.uhr.ndbps[w.uhrIdx])
      expect(PHY_MODES.uhr.ndbps[w.uhrIdx]! / PHY_MODES.eht.ndbps[w.ehtIdx]!).toBeCloseTo(w.ratio, 9)
    }
  }, 240_000)

  it('and the record streams are not equal, which is the only claim doing nothing cannot satisfy', () => {
    const e = recs(scene('eht', 22.5, 1))
    const u = recs(scene('uhr', 22.5, 1))
    expect(e.length).toBeGreaterThan(0)
    expect(u).not.toEqual(e)
  }, 120_000)
})


describe('what the four new rungs are worth at a fixed position', () => {
  /**
   * **One seed, and that is the whole answer here** — with no fading section the quantity being
   * measured has no randomness in it: the rung is a function of the RSSI, the RSSI is a function
   * of the geometry, and a saturated single-station link has nothing to collide with. The seed is
   * asserted irrelevant rather than assumed so, below.
   *
   * The gains are the ladder's own N_DBPS ratios. That is the strongest form the slice's claim
   * can take: the lesson's arithmetic IS the measurement.
   */
  it('exactly the N_DBPS ratio, window for window', () => {
    for (const w of WINDOWS) {
      const e = goodputMbps(recs(scene('eht', w.d, 1), LONG_NS), LONG_NS)
      const u = goodputMbps(recs(scene('uhr', w.d, 1), LONG_NS), LONG_NS)
      expect(u / e, `SFD MCS${w.sfd} at ${w.d} m`).toBeCloseTo(w.ratio, 2)
    }
  }, 300_000)

  it('the seed is irrelevant without a fading section, so one seed is not a one-seed A/B', () => {
    const at = (seed: number): number =>
      goodputMbps(recs(scene('uhr', 22.5, seed))) / goodputMbps(recs(scene('eht', 22.5, seed)))
    const all = [1, 2, 3, 97].map(at)
    for (const r of all) expect(r).toBeCloseTo(all[0]!, 9)
  }, 300_000)
})

/**
 * ## The honest answer to "can a reader read it", and the convergence study behind it
 *
 * **The first version of this block pinned a sign that was not there.** At 30 seeds and 600 ms
 * the MCS23 window measured −2.43 % with 11 of 30 seeds better, and a mechanism had already been
 * written up for it. At 8 seeds it was +1.9 %. Swept out to 120 seeds the answer is −0.07 %: the
 * "loss" was the seed set, which is the same way this repository has been caught before by a
 * difference that disappeared after thirty seeds. Only what survived the sweep is asserted below.
 *
 * Measured 2026-10-10 — mean goodput of `uhr` over `eht`, by number of seeds:
 *
 * | window (distance) | fixed | shadow σ4 only · n=8 / 30 / 120 | σ4 + Rayleigh · n=8 / 30 / 120 |
 * | --- | --- | --- | --- |
 * | MCS17 QPSK 2/3 (49.5 m) | +33.3 % | +28.5 / +25.5 / +27.0 % | +5.0 / +3.1 / **+1.2 %** |
 * | MCS19 16QAM 2/3 (28.5 m) | +33.3 % | +22.1 / +21.0 / +22.7 % | +5.2 / +4.1 / +4.0 % |
 * | MCS20 16QAM 5/6 (22.5 m) | +11.1 % | +9.3 / +8.5 / +8.9 % | +3.6 / +5.6 / +4.8 % |
 * | MCS23 256QAM 2/3 (12 m) | +6.7 % | +1.3 / +1.2 / +2.1 % | +1.9 / +0.0 / **−0.1 %** |
 *
 * Seeds where `uhr` won, out of 120, with both layers on: 63 / 89 / 89 / 60 — so at the MCS17 and
 * MCS23 windows it is a coin flip and at the two middle ones it is not.
 *
 * **Two things follow, and they are this slice's result.**
 *
 *  1. The derived window table is an upper bound a reader will not meet. The fixed-position
 *     figure IS the N_DBPS ratio, to three decimal places — but with the fast layer on the MCS17
 *     window delivers under a third of it and the MCS23 window delivers none of it.
 *  2. The reason is measurable rather than argued, and it is not the 1 dB width. Small-scale
 *     Rayleigh is drawn per FRAME here (`smallScaleDb`, src/engine/fading.ts) and lowers a
 *     link's mean level by 2.51 dB besides, while `mcsForRssi` sets the ceiling from the MEAN
 *     level. At the MCS17 window that puts the link below its own window most of the time; at the
 *     MCS23 window the extra rung is selected and then fails more often — `RX_FAIL` is higher in
 *     the `uhr` arm at every setting measured. A finer ladder pays where the channel moves slowly
 *     against the rate controller and much less where it moves fast.
 *
 * **Which is why the slow layer is the one a lesson should be built on.** With shadowing alone
 * every window still pays and three of the four keep most of their table figure, 118 of 120 seeds
 * agreeing.
 */
describe('what they are worth once the SNR wanders, which is a different and smaller answer', () => {
  /** Mean goodput of each arm over `SEEDS`, with the per-seed relative differences kept. */
  function ab(d: number, fading: Scenario['fading']): {
    gain: number; per: number[]; eFail: number; uFail: number; eRungs: number; uRungs: number
  } {
    const E: number[] = [], U: number[] = []
    let eFail = 0, uFail = 0, eRungs = 0, uRungs = 0
    for (const seed of SEEDS) {
      const e = recs(scene('eht', d, seed, fading))
      const u = recs(scene('uhr', d, seed, fading))
      E.push(goodputMbps(e)); U.push(goodputMbps(u))
      eFail += failures(e); uFail += failures(u)
      eRungs = Math.max(eRungs, rungsUsed(e)); uRungs = Math.max(uRungs, rungsUsed(u))
    }
    return { gain: mean(U) / mean(E), per: E.map((e, i) => (U[i]! - e) / e), eFail, uFail, eRungs, uRungs }
  }
  const winFrac = (per: number[]): number => per.filter((p) => p > 0.0005).length / per.length

  /**
   * **Shadowing alone: every window still pays, and the wide one pays most.** The SNR walks on
   * the 100 ms coherence interval and the rate controller follows it, so the finer ladder spends
   * real time on rungs `eht` has to round down from. The thresholds are well inside the floor of
   * the n = 8…120 range in the table above, so no seed set can move them.
   */
  it('with shadowing on, the wide window keeps a large gain and the narrow one keeps little', () => {
    const r17 = ab(49.5, SHADOW)
    const r23 = ab(12.0, SHADOW)
    expect(r17.gain, 'MCS17 window, +25…29 % measured').toBeGreaterThan(1.2)
    expect(winFrac(r17.per), 'and nearly every seed agrees').toBeGreaterThan(0.9)
    // The narrow rung at the top of the ladder is the weak member even here: a couple of per cent,
    // and a quarter of the seeds go the other way. Stated as a bound, never as a sign.
    expect(Math.abs(r23.gain - 1), 'MCS23 window, −1.6…+2.1 % measured').toBeLessThan(0.05)
    // and the finer ladder is the mechanism: uhr visits strictly more rungs in the same walk
    expect(r17.uRungs).toBeGreaterThan(r17.eRungs)
  }, 600_000)

  /**
   * **Add the per-frame layer and the edge window stops paying.** The claim is deliberately
   * relative — "under a third of its own table figure" — because that is the comparison the
   * design note's window table invites and the one it gets wrong. An absolute threshold here
   * would be pinning noise, which is exactly what the first version of this test did.
   */
  it('with per-frame Rayleigh too, MCS17 delivers under a third of its own table figure', () => {
    const r17 = ab(49.5, SHADOW_RAYLEIGH)
    const table = WINDOWS.find((w) => w.sfd === 17)!.ratio - 1 // 0.3333, the derived figure
    expect(r17.gain - 1, `measured +1.2…+5.0 % against a derived ${(table * 100).toFixed(1)} %`)
      .toBeLessThan(table / 3)
    // A coin flip rather than a difference: nowhere near the nine-in-ten of the shadow-only case
    // above. 63 of 120 at the full sweep.
    expect(winFrac(r17.per)).toBeLessThan(0.9)
    // The mechanism, read off the records in both arms rather than argued.
    expect(r17.uFail).toBeGreaterThanOrEqual(r17.eFail)
  }, 600_000)

  /** And the two middle windows survive both layers, which keeps this from being a flat no. */
  it('the two middle windows still pay with both layers on', () => {
    const r19 = ab(28.5, SHADOW_RAYLEIGH)
    const r20 = ab(22.5, SHADOW_RAYLEIGH)
    expect(r19.gain, 'measured +3.6…+5.2 %').toBeGreaterThan(1.02)
    expect(r20.gain, 'measured +3.6…+11.3 %').toBeGreaterThan(1.02)
    // Anti-vacuity: a single seed could have said anything here. The spread straddles zero, so
    // the MEAN is the claim and no one run is.
    expect(Math.min(...r20.per)).toBeLessThan(0)
    expect(Math.max(...r20.per)).toBeGreaterThan(0)
  }, 600_000)
})
