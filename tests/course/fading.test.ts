/**
 * `fading` — the lesson's claims, each with the ruler it was measured on.
 *
 * **The acceptance gate was written down before the drop rates were read**, which is this
 * programme's hard rule (slice 4b §7.6): same geometry, same width, same duration, same
 * denominator definition, five fixed seeds, all five listed. The gate is
 *
 *     min over seeds of the Rician K = 6 dB drop rate  >  max over seeds of the Rayleigh one
 *
 * and if it does not hold the lesson does not ship. **Changing a seed, a duration or the
 * station's position to make it hold is picking data, not measuring**, and the whole reason the
 * criterion is a sentence in a test file rather than a judgement at the end is so the next author
 * cannot do that quietly. The claim is fragile in one specific way and it is worth saying which:
 * it is a comparison ACROSS two distributions whose rate control settles on different rungs
 * (Rayleigh at the bottom, Rician near the top), so moving this scene's geometry or width moves
 * the rungs and the comparison really can invert.
 *
 * **One instrument, stated once and used by every drop rate below**: `fadingScenario(...)`, a
 * single saturated uplink, 1000 ms, seeds 7 / 11 / 23 / 101 / 999; the denominator is `sta-1`'s
 * `TX_START` records whose frame `kind` is `data`, the numerator is the `RX_FAIL` records at
 * `ap` whose `from` is `sta-1`. Throughput is delivered PSDU octets — `RX_OK.frame.bytes`, which
 * is 1530 to the MSDU's 1500 — over the run length. Where a figure comes from one seed it says
 * seed 7, and where it comes from one configuration it names it.
 *
 * **The run length is 1000 ms and not the 150 ms of `lesson-hashes.test.ts`, and that is a
 * measured requirement rather than caution.** The slow layer's coherence time is 100 ms, so a
 * 150 ms window draws at most two shadow values; at sigma 4 dB both of them land above the
 * decode threshold and a shadowed run hashes **identically** to an unshadowed one (`ba2dfb4c`
 * for both). A ruler whose window is the same order as the period it is measuring cannot see
 * that period at all. That is why the shadow layer is a `tryThis` and not a fourth variant, and
 * why its gate lives here at 1000 ms.
 */
import { describe, expect, it } from 'vitest'
import { lessonShapeSuite, ofType } from './kit'
import { fading } from '../../src/course/tier2/fading'
import { LESSONS } from '../../src/course/lessons'
import { COURSE_ORDER, MODULES, lessonChars, lessonMinutes } from '../../src/course/curriculum'
import { fadingScenario, selectivityScenario, widthScenario } from '../../src/course/wifiScenes'
import {
  FADING_DEFAULTS, RICIAN_K_DEFAULT_DB, shadowDb, smallScaleDb,
} from '../../src/engine/fading'
import { fadingToggle } from '../../src/editor/planOps'
import { Simulation } from '../../src/engine/simulation'
import type { FadingCfg } from '../../src/engine/fading'
import type { Scenario } from '../../src/model/scenario'
import type { Block } from '../../src/course/lessonKit'
import { PHY_MODES } from '../../src/engine/phy'
import { zhNumeral } from './coverage'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000
const RUN_NS = 1000 * MS
const SEEDS = [7, 11, 23, 101, 999]

const RAYLEIGH: FadingCfg = { shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'rayleigh' }
const RICIAN: FadingCfg = { shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'rician', ricianKdB: RICIAN_K_DEFAULT_DB }
const SHADOW4: FadingCfg = { shadowSigmaDb: 4, coherenceMs: 100, smallScale: 'none' }

interface Run { recs: TLRecord[]; hash: string }

const runs = new Map<string, Run>()
function run(sc: Scenario, ns: number = RUN_NS): Run {
  const key = `${JSON.stringify(sc)}|${ns}`
  const hit = runs.get(key)
  if (hit) return hit
  const sim = new Simulation(sc)
  const out: Run = { recs: [...sim.runUntil(ns).records], hash: sim.timelineHash() }
  runs.set(key, out)
  return out
}

const scene = (f: FadingCfg | undefined, seed = 7): Scenario => ({ ...fadingScenario(f), seed })

/** The lesson's own denominator and numerator, read off one run. */
function rates(recs: TLRecord[]): { sent: number; failed: number; dropPct: number; mbps: number } {
  const sent = ofType(recs, 'TX_START').filter((r) => r.node === 'sta-1' && r.frame.kind === 'data').length
  const failed = ofType(recs, 'RX_FAIL').filter((r) => r.node === 'ap' && r.from === 'sta-1').length
  const bytes = ofType(recs, 'RX_OK')
    .filter((r) => r.node === 'ap' && r.from === 'sta-1' && r.frame.kind === 'data')
    .reduce((n, r) => n + r.frame.bytes, 0)
  return { sent, failed, dropPct: (100 * failed) / sent, mbps: (bytes * 8) / (RUN_NS / 1000) }
}

const perSeed = (f: FadingCfg | undefined) => SEEDS.map((seed) => rates(run(scene(f, seed)).recs))
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length

lessonShapeSuite(fading)

describe('fading · where it sits and what it assumes', () => {
  it('is the seventh lesson of tier 2’s M8, right after `rate-cost`', () => {
    expect(fading.module).toBe(8)
    expect(MODULES[8].tier).toBe(1)
    expect(MODULES[8].title).toBe('容量旋钮与速率控制')
    const i = COURSE_ORDER.indexOf('fading')
    expect(COURSE_ORDER[i - 1]).toBe('rate-cost')
    // The cost of this placement, written down: M8 goes from six lessons to seven, which makes
    // it the largest Wi-Fi module. M9 already has seven, so seven has a precedent.
    expect(LESSONS.filter((l) => l.module === 8).length).toBe(7)
  })

  it('needs both halves of the rate pair, because its conclusion is their product', () => {
    // `rate-fallback` owns the two-failures rule; `rate-cost` owns what a rung below the ceiling
    // costs in airtime. This lesson's claim is 「the gentler channel drops more AND goes faster」,
    // which cannot be read without both.
    expect(fading.needs).toEqual(['rate-fallback', 'rate-cost'])
    for (const id of fading.needs!) expect(COURSE_ORDER.indexOf(id)).toBeLessThan(COURSE_ORDER.indexOf('fading'))
  })

  it('is one sitting, and the stated minutes are the formula’s', () => {
    expect(lessonMinutes(fading)).toBe(25)
    expect(lessonChars(fading)).toBeLessThanOrEqual(2900)
    expect([fading.observe.length, fading.tryThis.length]).toEqual([2, 2])
  })

  it('does not reach for the two-station scene’s figures, which belong to another lesson', () => {
    // 514 collisions and 623 ACK timeouts are what `FADING_DEFAULTS` does to `rateScenario`
    // (design §5.3). They are the evidence for 《听不见的邻居是时有时无的》, a tier 1 M4 lesson
    // this one deliberately does not write — and quoting them here would attach a two-station
    // result to a single-link scene.
    const text = [
      fading.why!, ...fading.outcomes!, ...fading.observe, ...fading.tryThis,
      ...fading.limits.map((l) => l.text), ...fading.sources!,
      JSON.stringify(fading.picture), JSON.stringify(fading.numbers), JSON.stringify(fading.deeper),
    ].join(' ')
    for (const n of ['514', '623', '450']) expect(text, `${n} is the other lesson's figure`).not.toContain(n)
  })
})

describe('fading · the scene is `selectivity`’s geometry with the frequency axis left off', () => {
  /**
   * Verified rather than inferred, and it is what lets this lesson quote the margin the
   * `selectivity` and `ru-diversity` slices already measured on this link instead of building a
   * second ruler. Four configurations, hash for hash.
   */
  it('matches `selectivityScenario(20)` minus its `selectivity` section, hash for hash', () => {
    const expected = ['310a660', 'bb43aa57', 'eddfc731', '63a71c47']
    const cfgs = [undefined, SHADOW4, RAYLEIGH, RICIAN]
    cfgs.forEach((f, i) => {
      const stripped = { ...selectivityScenario(20) } as Scenario & { selectivity?: unknown }
      delete stripped.selectivity
      if (f === undefined) delete (stripped as { fading?: unknown }).fading
      else stripped.fading = f
      expect(run(scene(f)).hash, `config ${i}`).toBe(expected[i])
      expect(run(stripped).hash, `config ${i} via selectivityScenario`).toBe(expected[i])
    })
  })

  it('writes no `fading` key at all when none is asked for', () => {
    expect('fading' in fadingScenario()).toBe(false)
    expect(fadingScenario(RAYLEIGH).fading).toEqual(RAYLEIGH)
    // One link, 20 MHz, no power lift: the lift `selectivityScenario` applies is
    // `noiseDbm(w) − noiseDbm(20)`, exactly 0 dB at one width, so the nodes are `widthScenario`'s.
    const base = widthScenario(20, 1)
    expect(fadingScenario().nodes.map((n) => n.txPowerDbm)).toEqual(base.nodes.map((n) => n.txPowerDbm))
    expect(fadingScenario().nodes.find((n) => n.id === 'sta-1')!.pos).toEqual({ x: 12.5, y: 6, z: 1 })
  })

  it('carries no second device, so every failure can only come from the link', () => {
    // The sixth is what the editor's own checkbox produces. Note that `FADING_DEFAULTS` itself
    // is NOT a parseable section — it carries `ricianKdB` beside `rayleigh`, which the schema
    // refuses — so the editor hands it through `fadingSmallScalePatch`, and that is the value.
    for (const f of [undefined, SHADOW4, RAYLEIGH, RICIAN, { ...RAYLEIGH, shadowSigmaDb: 4 }, fadingToggle(true)!]) {
      for (const seed of SEEDS) {
        const recs = run(scene(f, seed)).recs
        expect(ofType(recs, 'COLLISION').length, `collisions, seed ${seed}`).toBe(0)
        const reasons = new Set(ofType(recs, 'RX_FAIL').map((r) => r.reason))
        expect([...reasons].filter((x) => x !== 'lowSinr'), `failure reasons, seed ${seed}`).toEqual([])
      }
    }
  })
})

describe('fading · the gate: the gentler channel drops more, on every seed', () => {
  const off = perSeed(undefined)
  const ray = perSeed(RAYLEIGH)
  const ric = perSeed(RICIAN)

  it('off is an exact zero on all five seeds, over 1748 to 1760 frames', () => {
    expect(off.map((r) => r.dropPct)).toEqual([0, 0, 0, 0, 0])
    expect(Math.min(...off.map((r) => r.sent))).toBe(1748)
    expect(Math.max(...off.map((r) => r.sent))).toBe(1760)
    // and the rate control never moves: one rung, no step down, no step up
    const mcs = new Set(ofType(run(scene(undefined)).recs, 'TX_START')
      .filter((r) => r.node === 'sta-1' && r.frame.kind === 'data').map((r) => r.frame.mcs))
    expect([...mcs]).toEqual([3])
  })

  it('Rayleigh drops 1.11 % to 4.73 %, Rician K = 6 dB drops 9.98 % to 12.09 %', () => {
    // Two decimals, exactly, because that is what the lesson prints and because the engine is
    // deterministic: `toBeCloseTo(x, 1)` stood here and admitted anything within 0.05, which is
    // half an order of magnitude looser than the figure it was guarding. A tolerance is for a
    // quantity that can wobble; a seeded run cannot. Measured: 1.1125 / 4.7348 / 9.9814 / 12.0893
    // — and 4.7348 sat 0.0048 from 4.73, so even a two-decimal `toBeCloseTo` would have been one
    // rounding away from brittle.
    const to2 = (x: number): number => Number(x.toFixed(2))
    expect(to2(Math.min(...ray.map((r) => r.dropPct)))).toBe(1.11)
    expect(to2(Math.max(...ray.map((r) => r.dropPct)))).toBe(4.73)
    expect(to2(Math.min(...ric.map((r) => r.dropPct)))).toBe(9.98)
    expect(to2(Math.max(...ric.map((r) => r.dropPct)))).toBe(12.09)
  })

  it('the two figures `observe` puts in front of the reader are the measured ones', () => {
    // **The lesson's whole counterintuitive claim is carried by this pair**, and until 2026-10-12
    // nothing in the repository compared them: the ranges above are over five seeds, while
    // `observe[0]` names the seed-7 pair. 「2.71」 and 「10.31」 appeared nowhere in tests/.
    // Read out of the lesson rather than retyped, so there is no figure on this side to drift.
    const text = fading.observe[0]
    const m = /掉帧率反而从 ([\d.]+)% 涨到 ([\d.]+)%（种子 (\d+)）/.exec(text)
    expect(m, 'observe[0] no longer names the two drop rates in the shape this reads').not.toBeNull()
    const seed = Number(m![3])
    const to2 = (x: number): number => Number(x.toFixed(2))
    expect(Number(m![1]), `the lesson says Rayleigh drops ${m![1]} % at seed ${seed}`)
      .toBe(to2(rates(run(scene(RAYLEIGH, seed)).recs).dropPct))
    expect(Number(m![2]), `the lesson says Rician drops ${m![2]} % at seed ${seed}`)
      .toBe(to2(rates(run(scene(RICIAN, seed)).recs).dropPct))
    // and the direction the sentence is built on — gentler channel, more loss — on that one seed
    expect(Number(m![2]), 'the sentence says 「反而」; if this flips, the lesson is wrong')
      .toBeGreaterThan(Number(m![1]))
  })

  it('THE GATE: every Rician seed is strictly above every Rayleigh seed', () => {
    // The criterion as stated at the top of this file. 2.5x at the tightest pair
    // (9.98 against 4.73) and 10.9x at the widest (12.09 against 1.11).
    expect(Math.min(...ric.map((r) => r.dropPct))).toBeGreaterThan(Math.max(...ray.map((r) => r.dropPct)))
    expect(Math.min(...ric.map((r) => r.dropPct)) / Math.max(...ray.map((r) => r.dropPct))).toBeCloseTo(2.11, 1)
  })

  it('and the gentler channel is also the faster one, which is why both columns are printed', () => {
    // 「drops more yet goes faster」 needs two columns to be sayable at all.
    expect(mean(off.map((r) => r.mbps))).toBeCloseTo(21.47, 1)
    expect(mean(ray.map((r) => r.mbps))).toBeCloseTo(9.58, 1)
    expect(mean(ric.map((r) => r.mbps))).toBeCloseTo(17.07, 1)
    expect(mean(ric.map((r) => r.mbps)) / mean(ray.map((r) => r.mbps))).toBeCloseTo(1.78, 1)
  })

  it('the mechanism: Rayleigh is parked at the bottom rung, Rician sits at the top one', () => {
    const rungs = (f: FadingCfg | undefined): Record<number, number> => {
      const out: Record<number, number> = {}
      for (const r of ofType(run(scene(f)).recs, 'TX_START')) {
        if (r.node !== 'sta-1' || r.frame.kind !== 'data') continue
        out[r.frame.mcs!] = (out[r.frame.mcs!] ?? 0) + 1
      }
      return out
    }
    // seed 7, 1000 ms, this scene. Rayleigh uses all four rungs and spends 345 of 848 frames on
    // the lowest, where the margin is ten-odd dB and nothing fails. Rician never reaches the
    // lowest at all and spends 1090 of 1600 frames on the highest, whose margin is 3.62 dB.
    expect(rungs(RAYLEIGH)).toEqual({ 0: 345, 1: 313, 2: 139, 3: 51 })
    expect(rungs(RICIAN)).toEqual({ 1: 40, 2: 470, 3: 1090 })
    const airtime = (f: FadingCfg | undefined): number => {
      const tx = ofType(run(scene(f)).recs, 'TX_START').filter((r) => r.node === 'sta-1' && r.frame.kind === 'data')
      return tx.reduce((n, r) => n + r.frame.txTimeNs, 0) / tx.length / 1000
    }
    expect(airtime(undefined)).toBeCloseTo(415, 0)
    expect(airtime(RAYLEIGH)).toBeCloseTo(995, 0)
    expect(airtime(RICIAN)).toBeCloseTo(456, 0)
  })

  it('and the denominator moves, which is why no failure COUNT is printed', () => {
    // 1748–1760 frames unfaded against 809–1056 under Rayleigh: the counts are not comparable
    // between configurations, only the rates are. Slice 4a's lesson, inherited.
    expect(Math.min(...ray.map((r) => r.sent))).toBe(809)
    expect(Math.max(...ray.map((r) => r.sent))).toBe(1056)
    const text = [JSON.stringify(fading.numbers), JSON.stringify(fading.picture)].join(' ')
    for (const n of ['845', '848 条', '条失败']) expect(text).not.toContain(n)
  })

  it('the shadow layer alone is the weakest leg, and the lesson does not lean on it', () => {
    // sigma 4 dB with the fast layer off gives 0.00 % on two of the five seeds, so it cannot
    // carry a drop-rate claim. Its own showing is the clustering below, not a rate.
    const sh = perSeed(SHADOW4).map((r) => r.dropPct)
    expect(sh.filter((v) => v === 0).length).toBe(2)
    expect(Math.max(...sh)).toBeCloseTo(6.76, 1)
  })
})

describe('fading · coherence time is the width of the clump, and 150 ms cannot see it', () => {
  const windows = (coherenceMs: number): number[] => {
    const recs = run(scene({ ...SHADOW4, coherenceMs })).recs
    const w = new Array<number>(10).fill(0)
    for (const r of ofType(recs, 'RX_FAIL')) {
      if (r.node !== 'ap' || r.from !== 'sta-1') continue
      w[Math.min(9, Math.floor(r.t / (100 * MS)))]++
    }
    return w
  }

  it('spreads at 10 ms, pairs at 50 ms and clumps into two windows at 100 ms', () => {
    expect(windows(10)).toEqual([6, 8, 15, 1, 0, 4, 4, 0, 8, 4])
    expect(windows(10).filter((v) => v > 0).length).toBeGreaterThanOrEqual(6)
    expect(windows(50)).toEqual([0, 0, 0, 13, 13, 0, 0, 0, 13, 12])
    expect(windows(100)).toEqual([0, 0, 0, 0, 0, 0, 0, 26, 24, 0])
    expect(windows(100).filter((v) => v > 0).length).toBeLessThanOrEqual(3)
  })

  it('and at 500 ms there is no failure at all in a 1000 ms round', () => {
    expect(windows(500)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })

  /**
   * **The ruler this slice found broken, pinned so the finding cannot be lost.**
   *
   * `tests/engine/lesson-hashes.test.ts` runs every shipped scene for `RUN_NS = 150 * MS`.
   * The shadow's coherence time is 100 ms, so that window draws at most two shadow values —
   * and at sigma 4 dB on this link both of them clear the decode threshold, because every
   * failure of that configuration falls between 700 and 900 ms (the 100 ms row above). So a
   * fixture row for 「shadow on」 would record the same hash as 「shadow off」: not a guard, an
   * ornament. This is why the lesson ships three variants and not four.
   */
  it('a shadowed 150 ms run hashes identically to an unshadowed one', () => {
    expect(run(scene(SHADOW4), 150 * MS).hash).toBe(run(scene(undefined), 150 * MS).hash)
    // while both small-scale variants do differ at 150 ms, which is what makes them fixture rows
    expect(run(scene(RAYLEIGH), 150 * MS).hash).not.toBe(run(scene(undefined), 150 * MS).hash)
    expect(run(scene(RICIAN), 150 * MS).hash).not.toBe(run(scene(undefined), 150 * MS).hash)
    expect(run(scene(RAYLEIGH), 150 * MS).hash).not.toBe(run(scene(RICIAN), 150 * MS).hash)
  })
})

describe('fading · the two new `RX_START` fields are the lesson on the screen', () => {
  const rx = (f: FadingCfg | undefined, sc: Scenario = scene(f)) =>
    ofType(run(sc).recs, 'RX_START').filter((r) => r.node === 'ap' && r.from === 'sta-1')

  it('are absent, not zero, in a scene with no `fading` section', () => {
    const rows = rx(undefined)
    expect(rows.length).toBeGreaterThan(1000)
    expect(rows.filter((r) => r.shadowDb !== undefined)).toEqual([])
    expect(rows.filter((r) => r.fastDb !== undefined)).toEqual([])
  })

  it('carry both layers at their own rhythms: the shadow repeats, the fast draw never does', () => {
    // sigma 4 at 100 ms over a 1000 ms round: ten intervals, ten shadow values, and the fast
    // layer switched off so the second field is a flat zero rather than noise.
    const slow = rx(SHADOW4)
    expect(new Set(slow.map((r) => r.shadowDb)).size).toBe(10)
    expect(new Set(slow.map((r) => r.fastDb))).toEqual(new Set([0]))
    // the same run grouped by coherence interval: one value each, and it is the START instant's
    const byInterval = new Map<number, Set<number>>()
    for (const r of slow) {
      const i = Math.floor(r.t / (100 * MS))
      if (!byInterval.has(i)) byInterval.set(i, new Set())
      byInterval.get(i)!.add(r.shadowDb!)
    }
    for (const [i, vals] of byInterval) expect(vals.size, `interval ${i}`).toBe(1)
    // and the fast layer, on its own, is a fresh draw per frame with no repeats at all
    const fastRows = rx(RAYLEIGH)
    expect(new Set(fastRows.map((r) => r.fastDb)).size).toBe(fastRows.length)
    expect(new Set(fastRows.map((r) => r.shadowDb))).toEqual(new Set([0]))
  })

  it('and a frame straddling a coherence boundary keeps the shadow of its start', () => {
    // The key is `floor(tx.startNs / coherenceNs)` and not 「now」 (engine/fading.ts), so the
    // level does not move under a frame halfway through. Without a straddling frame in the run
    // this assertion would be vacuous, so the count is checked first.
    const rows = rx(SHADOW4)
    const coherenceNs = 100 * MS
    const straddling = rows.filter((r) => (r.t % coherenceNs) + r.frame.txTimeNs > coherenceNs)
    expect(straddling.length).toBeGreaterThan(0)
    for (const r of straddling) {
      const startInterval = Math.floor(r.t / coherenceNs)
      const neighbour = rows.find((x) => x !== r && Math.floor(x.t / coherenceNs) === startInterval)
      expect(neighbour, `a second frame in interval ${startInterval}`).toBeDefined()
      expect(r.shadowDb, `straddling frame at ${r.t}`).toBe(neighbour!.shadowDb)
      const next = rows.find((x) => Math.floor(x.t / coherenceNs) === startInterval + 1)
      if (next) expect(r.shadowDb).not.toBe(next.shadowDb)
    }
  })

  it('report the published `selectivity` scene as the slow layer never having run', () => {
    // `selectivityScenario` writes `shadowSigmaDb: 0`, so its rows prove two things at once:
    // the fields are wired up (the fast one moves) and the slow layer is flat zero there.
    const rows = ofType(run(selectivityScenario(20)).recs, 'RX_START')
      .filter((r) => r.node === 'ap' && r.from === 'sta-1')
    expect(rows.length).toBeGreaterThan(100)
    expect(new Set(rows.map((r) => r.shadowDb))).toEqual(new Set([0]))
    expect(new Set(rows.map((r) => r.fastDb)).size).toBe(rows.length)
  })

  /**
   * **The three-sided check: the shadow, the flat fast draw and the per-bin draws must not eat
   * one another.** With `fading` and `selectivity` both in the scene, `WIFI_SEL.meanSinrDb` is
   * `rxDbm − flatFadeDb − interference`, and `rxDbm` is `table + shadowDb + fastDb`. On a scene
   * with one link the interference term is thermal noise, a constant — so
   * `meanSinrDb − shadowDb` is a CONSTANT if and only if the flat deviation `selCombine`
   * subtracts is the very same draw `linkDbm` added. **Two independent draws of the same
   * distribution would leave that difference scattered**, which is exactly the defect this
   * assertion exists to catch, and no count of records would show it.
   */
  it('the fast draw subtracted by `WIFI_SEL` is the one `linkDbm` added, not a second one', () => {
    const sc = { ...scene({ shadowSigmaDb: 4, coherenceMs: 100, smallScale: 'rayleigh' }), selectivity: {} } as Scenario
    const recs = run(sc).recs
    const rows = ofType(recs, 'RX_START').filter((r) => r.node === 'ap' && r.from === 'sta-1')
    const sel = ofType(recs, 'WIFI_SEL').filter((r) => r.node === 'ap' && r.from === 'sta-1')
    expect(rows.length).toBe(sel.length)
    expect(rows.length).toBeGreaterThan(500)
    const diffs = new Set(sel.map((r, i) => (r.meanSinrDb - rows[i].shadowDb!).toFixed(6)))
    expect(diffs.size, 'one mean level, so one draw').toBe(1)
    // and all three layers really are moving in that same run
    expect(new Set(rows.map((r) => r.shadowDb)).size).toBe(10)
    expect(new Set(rows.map((r) => r.fastDb)).size).toBe(rows.length)
    expect(new Set(sel.map((r) => r.lossDb.toFixed(6))).size).toBeGreaterThan(100)
  })
})

describe('fading · legal and provably inert: four configurations that change nothing', () => {
  /**
   * Each of these is a four-field `fading` section the schema accepts, that computes real draws,
   * and that leaves the timeline bit-identical to no `fading` section at all. **Both halves are
   * asserted together on purpose**: the hash says the timeline did not move, and the non-zero
   * field says that is not because nothing was computed. Either half alone is the shape in which
   * a feature looks finished while doing nothing.
   */
  const offHash = run(scene(undefined)).hash

  it('the hash to beat is `310a660`, measured once', () => {
    expect(offHash).toBe('310a660')
  })

  it('sigma 1 and sigma 2 with no small-scale layer: the margin eats them whole', () => {
    // The highest rung on this link has 3.62 dB over its threshold, and a 2 dB shadow's 5th
    // percentile only reaches −3.29 dB, so no frame is ever turned over.
    for (const shadowSigmaDb of [1, 2]) {
      const sc = scene({ shadowSigmaDb, coherenceMs: 100, smallScale: 'none' })
      expect(run(sc).hash, `sigma ${shadowSigmaDb}`).toBe(offHash)
      const rows = ofType(run(sc).recs, 'RX_START').filter((r) => r.node === 'ap' && r.from === 'sta-1')
      expect(rows.filter((r) => r.shadowDb !== 0).length, `sigma ${shadowSigmaDb} drew nothing`).toBeGreaterThan(1000)
      expect(new Set(rows.map((r) => r.shadowDb)).size, `sigma ${shadowSigmaDb}`).toBe(10)
      expect(rates(run(sc).recs)).toMatchObject({ sent: 1758, failed: 0 })
    }
  })

  it('sigma 4 at a 500 ms coherence time: a whole round that samples twice', () => {
    // The one worth teaching, and the reason it is a `tryThis`. The configuration is not weaker
    // than the 100 ms one — the distribution is identical — it is sampled twice instead of ten
    // times, and both samples happen to clear the threshold. Same failure as the 150 ms ruler.
    const slowSc = scene({ ...SHADOW4, coherenceMs: 500 })
    expect(run(slowSc).hash).toBe(offHash)
    const slowRows = ofType(run(slowSc).recs, 'RX_START').filter((r) => r.node === 'ap' && r.from === 'sta-1')
    expect(new Set(slowRows.map((r) => r.shadowDb)).size).toBeLessThanOrEqual(3)
    expect(slowRows.filter((r) => r.shadowDb !== 0).length).toBeGreaterThan(1000)
    expect(rates(run(slowSc).recs).failed).toBe(0)
    // against the same sigma at 100 ms, which draws ten values and does fail
    const fastSc = scene(SHADOW4)
    expect(new Set(ofType(run(fastSc).recs, 'RX_START').map((r) => r.shadowDb)).size).toBeGreaterThanOrEqual(8)
    expect(rates(run(fastSc).recs).failed).toBeGreaterThan(0)
  })

  it('any sigma at all, back on the study desk, where the link has margin to spare', () => {
    // The schema cannot refuse this one: the geometry is allowed to be whatever it is, and
    // whether a shadow matters is a property of the margin, not of the configuration. This is
    // why no 「sigma > 0 and smallScale none is refused」 rule was added.
    const desk = (f: FadingCfg): Scenario => ({ ...widthScenario(20, 1), fading: f })
    const bare = run(widthScenario(20, 1)).hash
    const faded = desk({ shadowSigmaDb: 8, coherenceMs: 100, smallScale: 'none' })
    expect(run(faded).hash).toBe(bare)
    const rows = ofType(run(faded).recs, 'RX_START').filter((r) => r.node === 'ap' && r.from === 'sta-1')
    expect(rows.filter((r) => r.shadowDb !== 0).length).toBe(rows.length)
    expect(ofType(run(faded).recs, 'RX_FAIL').length).toBe(0)
    // and the same sigma WITH the fast layer does bite even there, so it is the slow layer the
    // margin absorbs rather than fading in general
    expect(ofType(run(desk({ shadowSigmaDb: 8, coherenceMs: 100, smallScale: 'rayleigh' })).recs, 'RX_FAIL').length)
      .toBeGreaterThan(100)
  })
})

/**
 * **The slow layer runs in a shipped scene for the first time since 2026-10-10, and this census
 * is the record of which claim that retired.**
 *
 * It used to read: 「every shipped scene that writes a `fading` section sets `shadowSigmaDb: 0`,
 * so `coherenceMs: 100` and `RICIAN_K_DEFAULT_DB` are fields written and never read in the
 * shipped course」. The first half of that is now false. Slice W12b's `@uhr-rate-ladder` ships
 * four faded variants at `shadowSigmaDb: 4, coherenceMs: 100` — two with the fast layer off and
 * two with it on — because the thing that lesson measures only exists when the level WANDERS:
 * a finer rate ladder wins exactly its N_DBPS ratio at a fixed position, keeps most of it under
 * shadowing alone, and keeps none of it at its narrowest window once per-frame Rayleigh is added
 * too. `coherenceMs` is read inside `shadowDb` past the `sigma === 0` return, so those four
 * scenes are the first shipped scenes in which that field decides anything.
 *
 * **Two more sentences moved with it, and they moved in opposite directions.** `FADING_DEFAULTS`
 * — what the editor's fading checkbox writes — was matched by no shipped scene at all; two of
 * W12b's four match all three of its graded fields, so ticking that box in the editor now
 * configures something a lesson also ships. What is STILL inert is the Rician K factor: exactly
 * one shipped scene asks for `smallScale: 'rician'` and it takes the default rather than naming
 * a value, so `RICIAN_K_DEFAULT_DB` remains a number nothing shipped chooses.
 *
 * Taken off `LESSONS`, never off the file text: the count is what a reader of the panel would
 * find. When it changes, somebody has to read this message.
 */
describe('fading · the census of every shipped scene that turns fading on', () => {
  const faded = LESSONS.flatMap((l) => [
    { id: l.id, sc: l.scenario() },
    ...(l.variants ?? []).map((v, i) => ({ id: `${l.id}#${i}`, sc: v.scenario() })),
  ]).filter((x) => x.sc.fading !== undefined)

  it('is exactly these twenty-four scenes', () => {
    // Sixteen until slice W13, which added `@claim-to-contribution` — a base scene and seven
    // faded variants, all of them `uhrLadderScenario` at the 'far' spot. Six of the eight give
    // the slow layer a sigma; the last two are the sigma-0 PAIR that lesson ships on purpose, and
    // the partition below is where that pair is pinned.
    expect(faded.map((x) => x.id).sort()).toEqual([
      'claim-to-contribution', 'claim-to-contribution#0', 'claim-to-contribution#1',
      'claim-to-contribution#2', 'claim-to-contribution#3', 'claim-to-contribution#4',
      'claim-to-contribution#5', 'claim-to-contribution#6',
      'fading', 'fading#1', 'fading#2',
      'ru-diversity', 'ru-diversity#0', 'ru-diversity#1',
      'selectivity', 'selectivity#0', 'selectivity#1', 'selectivity#2', 'selectivity#3', 'selectivity#4',
      'uhr-rate-ladder#10', 'uhr-rate-ladder#7', 'uhr-rate-ladder#8', 'uhr-rate-ladder#9',
    ])
  })

  it('and exactly ten of them give the slow layer a sigma to draw with', () => {
    // The partition, by id, so that a new scene cannot join either side silently. The fourteen
    // fast-layer-only scenes still set sigma 0 and `shadowDb` still returns before it reads
    // `coherenceMs` for them; W12b's four are the ones that changed the sentence above, and
    // W13's six joined them.
    const slow = faded.filter((x) => x.sc.fading!.shadowSigmaDb > 0)
    expect(slow.map((x) => x.id).sort()).toEqual([
      'claim-to-contribution', 'claim-to-contribution#0', 'claim-to-contribution#1',
      'claim-to-contribution#2', 'claim-to-contribution#3', 'claim-to-contribution#4',
      'uhr-rate-ladder#10', 'uhr-rate-ladder#7', 'uhr-rate-ladder#8', 'uhr-rate-ladder#9',
    ])
    for (const { id, sc } of slow) {
      expect(sc.fading!.shadowSigmaDb, `${id}`).toBe(4)
      expect(sc.fading!.coherenceMs, `${id}`).toBe(100)
    }
    // W12b's four are two with the fast layer off and two with it on: that pairing IS what
    // `@uhr-rate-ladder` compares. W13's six are all `'both'` — that lesson's subject is the
    // two-layer figure, so the one-layer arm is a column of its table rather than a variant.
    expect(slow.filter((x) => x.sc.fading!.smallScale === 'none').map((x) => x.id).sort())
      .toEqual(['uhr-rate-ladder#7', 'uhr-rate-ladder#8'])
    expect(slow.filter((x) => x.sc.fading!.smallScale === 'rayleigh').length).toBe(8)
    for (const { id, sc } of faded.filter((x) => !slow.includes(x))) {
      expect(sc.fading!.shadowSigmaDb, `${id} now runs the slow layer — read this test's docblock`).toBe(0)
    }
  })

  it('so `coherenceMs` is read at last — and one lesson ships the pair where it is not', () => {
    // `coherenceMs` is read only inside `shadowDb`, past the `sigma === 0` return — which ten of
    // the twenty-four now get past, all of them at 100 ms.
    //
    // **The other two values exist because a lesson teaches that they change nothing.** W13's
    // `@claim-to-contribution` ships `#5` and `#6`, identical but for `coherenceMs` 5 against 500,
    // at sigma 0 — so the field is written, reached by the engine and unobservable. That is the
    // 「pin it」case of `docs/inert-config-contract.md` §1 step 2 on both of its grounds (the
    // configuration is a lesson's teaching aid, AND its doing nothing is the fact being taught),
    // and the pin has two halves: the partition here, and `tests/fixtures/lesson-hashes.json`
    // recording ONE hash for the two, which `tests/course/claim-to-contribution.test.ts` asserts
    // off the fixture file itself.
    expect(new Set(faded.map((x) => x.sc.fading!.coherenceMs))).toEqual(new Set([100, 5, 500]))
    const offDefault = faded.filter((x) => x.sc.fading!.coherenceMs !== 100)
    expect(offDefault.map((x) => `${x.id}:${x.sc.fading!.coherenceMs}`).sort())
      .toEqual(['claim-to-contribution#5:5', 'claim-to-contribution#6:500'])
    for (const { id, sc } of offDefault) {
      expect(sc.fading!.shadowSigmaDb, `${id} would make coherenceMs observable`).toBe(0)
    }
    // **`FADING_DEFAULTS` — what the editor's fading checkbox writes — used to be matched by no
    // shipped scene at all.** Eight scenes match all three of its graded fields now, so a reader
    // who ticks that box in the editor is configuring something two lessons also ship.
    expect(FADING_DEFAULTS.shadowSigmaDb).toBe(4)
    const exact = faded.filter((x) => x.sc.fading!.shadowSigmaDb === FADING_DEFAULTS.shadowSigmaDb
      && x.sc.fading!.coherenceMs === FADING_DEFAULTS.coherenceMs
      && x.sc.fading!.smallScale === FADING_DEFAULTS.smallScale)
    expect(exact.map((x) => x.id).sort()).toEqual([
      'claim-to-contribution', 'claim-to-contribution#0', 'claim-to-contribution#1',
      'claim-to-contribution#2', 'claim-to-contribution#3', 'claim-to-contribution#4',
      'uhr-rate-ladder#10', 'uhr-rate-ladder#9',
    ])
    // The one field of it still nothing shipped chooses: the K factor. It is read only for
    // `smallScale: 'rician'`, exactly one of the sixteen is that, and that one takes the default
    // rather than naming a value — so `RICIAN_K_DEFAULT_DB` is the inert half that remains.
    const rician = faded.filter((x) => x.sc.fading!.smallScale === 'rician')
    expect(rician.map((x) => x.id)).toEqual(['fading#2'])
    expect(rician[0].sc.fading!.ricianKdB).toBe(RICIAN_K_DEFAULT_DB)
    expect(faded.filter((x) => x.sc.fading!.ricianKdB !== undefined).map((x) => x.id)).toEqual(['fading#2'])
  })
})

describe('fading · the five limits this lesson lifts, and the eleven it does not', () => {
  const lifted = LESSONS.filter((l) => l.limits.some((x) => x.until === 'fading')).map((l) => l.id)

  it('is exactly the five the design judged, each on an `out-of-scope` limit', () => {
    expect([...lifted].sort()).toEqual(['bianchi', 'mcs-ladder', 'radio-primer', 'rate-fallback', 'rate-vs-model'])
    for (const id of lifted) {
      const lim = LESSONS.find((l) => l.id === id)!.limits.find((x) => x.until === 'fading')!
      expect(lim.kind, `${id} → fading`).toBe('out-of-scope')
      expect(COURSE_ORDER.indexOf(id)).toBeLessThan(COURSE_ORDER.indexOf('fading'))
    }
  })

  it('and it lifts none of the four that need two stations, nor the five about the engine', () => {
    // Carrier sense, the hidden relation, RTS/CTS's 1.4 dB and the time-varying hidden relation
    // all need two stations that cannot hear each other, and this scene has one station. They
    // are lifted by 《听不见的邻居是时有时无的》 (design §5.3), not by this lesson.
    for (const id of ['cca', 'hidden', 'rts-cts', 'txop-protect']) {
      const l = LESSONS.find((x) => x.id === id)!
      expect(l.limits.filter((x) => x.until === 'fading'), `${id} must not be lifted here`).toEqual([])
    }
    // These five each say something this lesson does not change: a ratio's numerator, the same
    // rung-to-rung wording `mcs-ladder` already owns, a scene checklist, seven exact instants,
    // and a project's deliverable.
    for (const id of ['noise-floor', 'decode-thresholds', 'anomaly', 'retries-queues', 'tier1-project']) {
      const l = LESSONS.find((x) => x.id === id)!
      expect(l.limits.filter((x) => x.until === 'fading'), `${id} must not be lifted here`).toEqual([])
    }
  })

  it('`capstone`’s coherence-time limit gains the standard’s own scale and no promise', () => {
    const l = LESSONS.find((x) => x.id === 'capstone')!
    const lim = l.limits.find((x) => x.text.includes('相干时间是一个配置值'))!
    expect(lim.until, 'this lesson strengthens that limit rather than lifting it').toBeUndefined()
    // 10 or 20 symbols of 13.6 µs, and the simulator's slow layer holds 100 ms: 735 times longer.
    expect(lim.text).toContain('136')
    expect(lim.text).toContain('272')
    expect(lim.text).toContain('735')
    expect((100 * MS) / (13_600 * 10)).toBeCloseTo(735.3, 1)
  })

  it('its own four limits name one of each kind, and the model values say who chose them', () => {
    expect(fading.limits.map((x) => x.kind).sort())
      .toEqual(['model-value', 'out-of-scope', 'threshold', 'unmodelled'])
    const byKind = new Map(fading.limits.map((x) => [x.kind, x.text]))
    // the four model values, and that they are this simulator's and not a measurement campaign's
    for (const needle of ['4 dB', '100 ms', '瑞利', 'K = 6 dB', '不是任何一次测量活动的结果']) {
      expect(byKind.get('model-value'), needle).toContain(needle)
    }
    // the dB-vs-power asymmetry, which is the docblock error this slice corrected
    expect(byKind.get('threshold')).toContain('−50 dB')
    expect(byKind.get('unmodelled')).toContain('没有多普勒')
    // and the one the whole conclusion rests on
    expect(byKind.get('out-of-scope')).toContain('mcsForPeer')
  })
})

/**
 * **Every figure the prose prints, read back out of it.**
 *
 * One pair above was already a read-back — `observe[0]`'s 2.71 / 10.31, parsed out of the
 * sentence because nothing in the repository had ever compared them. Everything else was pinned
 * against a figure typed on this side, and several of those tolerances were looser than the
 * printed precision: `toBeCloseTo(21.47, 1)` admits anything within 0.05 of a figure the lesson
 * prints to two decimals.
 *
 * Nothing new is measured here. Every assertion calls the same `run`, `scene`, `rates`,
 * `perSeed`, `mean`, `ofType` and the engine's own `shadowDb` / `smallScaleDb` the tests above
 * call — the figure is parsed **out of the lesson** instead of being written down beside it.
 */
describe('fading · every figure the prose prints, read back out of it', () => {
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
  const TERMS = blockText(fading.terms)
  const PIC = blockText(fading.picture)
  const NUMS = blockText(fading.numbers)
  const DEEP = blockText(fading.deeper)
  const LIMITS = blockText(fading.limits)
  const SRC = blockText(fading.sources)
  const OBS = blockText(fading.observe)
  const TRY = blockText(fading.tryThis)
  const QUIZ = blockText(fading.quiz)

  const val = (s: string): number => Number(s.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (s: string, re: RegExp, what: string): string[] => {
    const m = re.exec(s)
    expect(m, `${what}: the lesson no longer prints this in the shape this test reads`)
      .not.toBeNull()
    return m!.slice(1)
  }
  const figs = (s: string, re: RegExp, what: string): number[] => raw(s, re, what).map(val)
  /** A figure READ off the lesson against a measurement, at the precision it was printed to. */
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  /** The Euler-Mascheroni constant: the closed form `deeper` prints is -10γ/ln10. physics */
  const EULER_GAMMA = 0.5772156649015329

  /** The lesson's nth table of `numbers`. */
  const table = (n: number): Extract<Block, { kind: 'table' }> =>
    fading.numbers!.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[n]!
  const cell = (n: number, row: number, col: number): string => table(n).rows[row]![col]!
  const CONFIGS: (FadingCfg | undefined)[] = [undefined, RAYLEIGH, RICIAN]

  /** Rungs the rate control used, seed 7, by MCS. */
  const rungs = (f: FadingCfg | undefined): Record<number, number> => {
    const out: Record<number, number> = {}
    for (const r of ofType(run(scene(f)).recs, 'TX_START')) {
      if (r.node !== 'sta-1' || r.frame.kind !== 'data') continue
      out[r.frame.mcs!] = (out[r.frame.mcs!] ?? 0) + 1
    }
    return out
  }
  /** Mean airtime of a data frame, µs, seed 7. */
  const airtimeUs = (f: FadingCfg | undefined): number => {
    const tx = ofType(run(scene(f)).recs, 'TX_START')
      .filter((r) => r.node === 'sta-1' && r.frame.kind === 'data')
    return tx.reduce((n, r) => n + r.frame.txTimeNs, 0) / tx.length / 1000
  }
  /** How many of ten 100 ms windows hold a failure, for one config and one seed. */
  const failWindows = (f: FadingCfg | undefined, seed: number, widthMs = 100): number => {
    const w = new Set<number>()
    for (const r of ofType(run(scene(f, seed)).recs, 'RX_FAIL')) {
      if (r.node !== 'ap' || r.from !== 'sta-1') continue
      w.add(Math.floor(r.t / (widthMs * MS)))
    }
    return w.size
  }
  /** The fast layer's own draws, 200 000 of them, memoised: the deeper figures are these. */
  const DRAWS = new Map<string, number[]>()
  const draws = (f: FadingCfg): number[] => {
    const key = `${f.smallScale}|${f.ricianKdB ?? ''}`
    if (!DRAWS.has(key)) {
      DRAWS.set(key, Array.from({ length: 200_000 }, (_x, i) =>
        smallScaleDb(f, SEEDS[0]!, 'ap', 'sta-1', `f${i}`)))
    }
    return DRAWS.get(key)!
  }
  const shadowDraws = (sigma: number): number[] => {
    const key = `shadow|${sigma}`
    if (!DRAWS.has(key)) {
      DRAWS.set(key, Array.from({ length: 200_000 }, (_x, i) =>
        shadowDb({ shadowSigmaDb: sigma, coherenceMs: FADING_DEFAULTS.coherenceMs, smallScale: 'none' },
          SEEDS[0]!, 'ap', 'sta-1', i * FADING_DEFAULTS.coherenceMs * MS)))
    }
    return DRAWS.get(key)!
  }
  const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
  const sd = (xs: number[]): number => {
    const m = avg(xs)
    return Math.sqrt(avg(xs.map((x) => (x - m) * (x - m))))
  }

  it('the coherence time, and the shadow that never moves while it is switched off', () => {
    for (const [text, re, what] of [
      [TERMS, /本仿真器取 (\d+) ms/, '`terms`'],
      [PIC, /而 (\d+) ms 这个相干时间是本仿真器选的/, '`picture`'],
      [LIMITS, /相干时间 (\d+) ms、瑞利/, '`limits`'],
    ] as const) {
      expect(val(raw(text, re, what)[0]!), `${what}: the coherence time this simulator picks`)
        .toBe(FADING_DEFAULTS.coherenceMs)
    }
    // 「shadow 一直是 +0.0」 — the base scene runs Rayleigh at sigma 0, so the slow layer is off
    const rows = ofType(run(scene(RAYLEIGH)).recs, 'RX_START')
      .filter((r) => r.node === 'ap' && r.from === 'sta-1')
    expect(rows.length, 'the base run does report receptions').toBeGreaterThan(100)
    for (const [text, re, what] of [
      [PIC, /shadow 一直是 \+([\d.]+)/, '`picture`'],
      [OBS, /所以那个值是 \+([\d.]+)/, '`observe`'],
    ] as const) {
      const [flat] = raw(text, re, `${what} on the shadow`)
      expect(new Set(rows.map((r) => r.shadowDb)), `${what}: the shadow of every reception`)
        .toEqual(new Set([val(flat!)]))
    }
    expect(new Set(rows.map((r) => r.fastDb)).size, 'while the fast one never repeats')
      .toBe(rows.length)
  })

  it('the three-config table: its heading’s seeds and duration, and every cell of every row', () => {
    const heading = table(0).heading!
    const seeds = figs(heading, /五个种子（(\d+) \/ (\d+) \/ (\d+) \/ (\d+) \/ (\d+)）/,
      'the table’s own list of seeds')
    expect(seeds, 'the seeds this file measures on').toEqual(SEEDS)
    same(raw(heading, /各跑 (\d+) ms/, 'the table’s own duration')[0]!, RUN_NS / MS,
      'the window every figure of this table is measured over')
    // the bucket width is in the table's HEAD, which is its own site
    same(raw(blockText(table(0).head), /有失败的 (\d+) ms 窗口/,
      'the table’s last column header')[0]!,
    FADING_DEFAULTS.coherenceMs, 'the window the failures are bucketed into')
    CONFIGS.forEach((f, i) => {
      const per = perSeed(f)
      // the drop-rate cell: either one figure on all five seeds, or a range over them
      const spread = /([\d.]+)% ～ ([\d.]+)%/.exec(cell(0, i, 1))
      if (spread !== null) {
        same(spread[1]!, Math.min(...per.map((r) => r.dropPct)), `row ${i}: the lowest drop rate`)
        same(spread[2]!, Math.max(...per.map((r) => r.dropPct)), `row ${i}: and the highest`)
      } else {
        const [one] = raw(cell(0, i, 1), /([\d.]+)%，五个种子一个样/, `row ${i}: the drop rate`)
        for (const r of per) same(one!, r.dropPct, `row ${i}: the drop rate on every seed`)
      }
      // the rungs cell: either one rung or a span of them
      const used = Object.keys(rungs(f)).map(Number).sort((a, b) => a - b)
      const span = /MCS (\d) 到 (\d)/.exec(cell(0, i, 2))
      if (span !== null) {
        expect([val(span[1]!), val(span[2]!)], `row ${i}: the rungs this config reaches`)
          .toEqual([used[0], used[used.length - 1]!])
      } else {
        const [only] = raw(cell(0, i, 2), /只有 MCS (\d)/, `row ${i}: the only rung`)
        expect(used, `row ${i}: the one rung it uses`).toEqual([val(only!)])
      }
      same(raw(cell(0, i, 3), /([\d.]+) Mb\/s/, `row ${i}: the throughput`)[0]!,
        mean(per.map((r) => r.mbps)), `row ${i}: the mean throughput over the five seeds`)
      // the windows cell: "0 / 10", "4 ～ 9 of 10" or "10 / 10"
      const windows = SEEDS.map((s) => failWindows(f, s))
      const wSpan = /(\d+) ～ (\d+) of (\d+)/.exec(cell(0, i, 4))
      if (wSpan !== null) {
        expect(Math.min(...windows), `row ${i}: the fewest windows with a failure`)
          .toBe(val(wSpan[1]!))
        expect(Math.max(...windows), `row ${i}: the most`).toBe(val(wSpan[2]!))
        expect(RUN_NS / MS / FADING_DEFAULTS.coherenceMs, `row ${i}: out of that many windows`)
          .toBe(val(wSpan[3]!))
      } else {
        const [n, of] = figs(cell(0, i, 4), /(\d+) \/ (\d+)/, `row ${i}: the windows cell`)
        expect(new Set(windows), `row ${i}: the same count on every seed`).toEqual(new Set([n]))
        expect(RUN_NS / MS / FADING_DEFAULTS.coherenceMs, `row ${i}: out of that many`).toBe(of)
      }
    })
    // the Rician label carries the engine's own K factor, in the table and in the quiz
    for (const [text, re, what] of [
      [NUMS, /莱斯 K = (\d) dB 的信道比瑞利温和得多/, '`numbers`'],
      [QUIZ, /莱斯 K = (\d) dB 的信道比瑞利温和，为什么/, 'the first question'],
      [LIMITS, /瑞利、K = (\d) dB。标准里没有信道模型表/, '`limits`'],
    ] as const) {
      expect(val(raw(text, re, what)[0]!), `${what}: the K factor fading.ts defaults to`)
        .toBe(RICIAN_K_DEFAULT_DB)
    }
  })

  it('the baseline paragraph, and the ratios the conclusion is stated as', () => {
    const [about] = figs(NUMS, /这条链路发出约 (\d+) 个数据帧/, '`numbers` on the baseline')
    const sent = perSeed(undefined).map((r) => r.sent)
    expect(Math.round(mean(sent) / 50) * 50, 'the frames it sends, to the nearest fifty')
      .toBe(about)
    expect(Math.min(...sent), 'and every seed is near it').toBeGreaterThan(about! - 50)
    expect(Math.max(...sent), 'from both sides').toBeLessThan(about! + 50)
    // 「掉帧率却是瑞利的 2.5 到 4 倍，而吞吐高出 78%」
    /*
     * **A prose defect, found by writing this read-back on 2026-10-13.** The lesson printed
     * 「2.5 到 4 倍」, and the five per-seed ratios are 2.539 / 2.553 / 2.934 / 3.802 / **9.488** —
     * four of the five land in that band and seed 23 is nowhere near it. The sentence puts the
     * band immediately before 「五个种子逐个成立」, so a reader takes the band as the thing that
     * holds per seed, and it does not. The band now reads 2.5 to 9.5, which the five seeds do
     * satisfy, and this assertion is what says so.
     */
    const [loTimes, hiTimes, faster] = figs(NUMS,
      /掉帧率却是瑞利的 ([\d.]+) 到 ([\d.]+) 倍，而吞吐高出 (\d+)%/, '`numbers` on the conclusion')
    const ray = perSeed(RAYLEIGH)
    const ric = perSeed(RICIAN)
    const ratios = SEEDS.map((_s, i) => ric[i]!.dropPct / ray[i]!.dropPct)
    expect(Math.min(...ratios), 'the smallest ratio of the five seeds')
      .toBeGreaterThanOrEqual(loTimes!)
    expect(Math.max(...ratios), 'and the largest').toBeLessThanOrEqual(hiTimes!)
    expect(Math.round(100 * (mean(ric.map((r) => r.mbps)) / mean(ray.map((r) => r.mbps)) - 1)),
      'and how much faster the gentler channel is').toBe(faster)
  })

  it('the mechanism table, seed 7, cell by cell', () => {
    const heading = table(1).heading!
    expect(val(raw(heading, /都在种子 (\d+) 上量过/, 'the table’s own seed')[0]!),
      'the seed every cell of it is measured on').toBe(SEEDS[0])
    const [deepDb] = figs(cell(1, 0, 0), /抽到的值低于 −(\d+) dB 的比例/,
      'the first row’s own threshold')
    const share = (f: FadingCfg): number =>
      (100 * draws(f).filter((v) => v < -deepDb!).length) / draws(f).length
    same(raw(cell(1, 0, 1), /([\d.]+)%/, 'Rayleigh’s deep-fade share')[0]!, share(RAYLEIGH),
      'how often Rayleigh draws deeper than that')
    same(raw(cell(1, 0, 2), /([\d.]+)%/, 'Rician’s deep-fade share')[0]!, share(RICIAN),
      'and how often Rician does')
    same(raw(cell(1, 1, 0), /(\d+) ms 里发出的数据帧/, 'the second row’s own window')[0]!,
      RUN_NS / MS, 'the window the counts are over')
    expect(val(cell(1, 1, 1)), 'the frames Rayleigh sends')
      .toBe(rates(run(scene(RAYLEIGH)).recs).sent)
    expect(val(cell(1, 1, 2)), 'and the frames Rician sends')
      .toBe(rates(run(scene(RICIAN)).recs).sent)
    const lowest = Math.min(...Object.keys(rungs(RAYLEIGH)).map(Number))
    const highest = Math.max(...Object.keys(rungs(RAYLEIGH)).map(Number))
    expect(val(cell(1, 2, 1)), 'the Rayleigh frames on the lowest rung')
      .toBe(rungs(RAYLEIGH)[lowest])
    expect(val(cell(1, 2, 2)), 'and the Rician ones, of which there are none')
      .toBe(rungs(RICIAN)[lowest] ?? 0)
    expect(val(cell(1, 3, 1)), 'the Rayleigh frames on the highest rung')
      .toBe(rungs(RAYLEIGH)[highest])
    expect(val(cell(1, 3, 2)), 'and the Rician ones').toBe(rungs(RICIAN)[highest])
    same(raw(cell(1, 4, 1), /(\d+) µs/, 'Rayleigh’s airtime')[0]!, airtimeUs(RAYLEIGH),
      'what a Rayleigh frame costs the air')
    same(raw(cell(1, 4, 2), /(\d+) µs/, 'Rician’s airtime')[0]!, airtimeUs(RICIAN),
      'and what a Rician one costs')
    // the margin the top rung has, wherever the lesson names it
    const topMargin = (): number => {
      const [p5] = figs(DEEP, /余量的第 5 百分位 ([\d.]+) dB/, '`deeper` on the margin ladder')
      return p5!
    }
    for (const [text, re, what] of [
      [NUMS, /而那一级只剩 ([\d.]+) dB 的信噪比/, '`numbers`'],
      [DEEP, /最小的 ([\d.]+) dB 对应最高那一级/, '`deeper`'],
      [OBS, /一直坐在只剩 ([\d.]+) dB 余量的那一级上/, '`observe`'],
      [TRY, /而最高一级之上还有 ([\d.]+) dB/, '`tryThis`'],
      [QUIZ, /坐在只剩 ([\d.]+) dB 余量的那一级上/, 'the first answer'],
    ] as const) {
      expect(val(raw(text, re, what)[0]!), `${what}: the margin the top rung has`)
        .toBe(topMargin())
    }
  })

  it('`deeper`: the margin ladder, the moving denominator and the two layers’ means', () => {
    const sc = { ...scene(RAYLEIGH), selectivity: {} } as Scenario
    const sel = ofType(run(sc).recs, 'WIFI_SEL').filter((r) => r.node === 'ap' && r.from === 'sta-1')
    const [count, p5, mid, p95, values] = raw(DEEP,
      /量过 (\d+) 次接收：余量的第 5 百分位 ([\d.]+) dB、中位 ([\d.]+) dB、第 95 百分位 ([\d.]+) dB，而全部取值只有(.)个/,
      '`deeper` on the margin ladder')
    expect(sel.length, 'the receptions that run reports').toBe(val(count!))
    /*
     * The margin is `meanSinrDb − threshDb`, which is what makes it a LADDER: the mean level is
     * a constant while the shadow is off, so the difference can only take one value per rung
     * — four of them. `effSinrDb` is the per-bin effective SINR and takes 808 distinct values
     * over these 809 rows, which is the opposite of the paragraph's point.
     */
    const margins = sel.map((r) => r.meanSinrDb - r.threshDb).sort((a, b) => a - b)
    const at = (q: number): number => margins[Math.floor(q * (margins.length - 1))]!
    same(p5!, at(0.05), 'the 5th percentile of the margin')
    same(mid!, at(0.5), 'the median')
    same(p95!, at(0.95), 'and the 95th percentile')
    expect(new Set(margins.map((m) => m.toFixed(4))).size, 'and how many values it can take')
      .toBe(zhNumeral(values!.replace(/两/g, '二')))
    const [smallest, largest] = raw(DEEP,
      /最小的 ([\d.]+) dB 对应最高那一级，最大的 ([\d.]+) dB 对应最低那一级/,
      '`deeper` on the two ends of the ladder')
    same(smallest!, margins[0]!, 'the smallest margin')
    same(largest!, margins[margins.length - 1]!, 'and the largest')
    // "down-shifting makes frames longer, so fewer go out: 1758 unfaded against 848 Rayleigh"
    const [unfaded, rayFrames] = figs(DEEP, /不开起伏 (\d+) 帧，瑞利只有 (\d+) 帧/,
      '`deeper` on the moving denominator')
    expect(unfaded, 'the frames the unfaded run sends at seed 7')
      .toBe(rates(run(scene(undefined)).recs).sent)
    expect(rayFrames, 'and the frames Rayleigh sends')
      .toBe(rates(run(scene(RAYLEIGH)).recs).sent)
    expect(rayFrames, 'which is the smaller denominator the paragraph is about')
      .toBeLessThan(unfaded!)
    // the two layers' asymmetry, over the engine's own samplers
    const [draws200k, shadowMean, shadowSd] = raw(DEEP,
      /（(\d+) 万次抽取量到 \+([\d.]+) dB，标准差 ([\d.]+)）/, '`deeper` on the slow layer')
    // 「20 万」 — the count is in digits and only the unit is a Chinese word
    const n = val(draws200k!) * 10_000
    expect(shadowDraws(FADING_DEFAULTS.shadowSigmaDb).length, 'the draws this read is over')
      .toBe(n)
    same(shadowMean!, avg(shadowDraws(FADING_DEFAULTS.shadowSigmaDb)),
      'the slow layer really is zero-mean in dB')
    same(shadowSd!, sd(shadowDraws(FADING_DEFAULTS.shadowSigmaDb)),
      'and its standard deviation is the sigma it was given')
    const [rayMean, ricK, ricMean] = raw(DEEP,
      /瑞利平均 −([\d.]+) dB，莱斯 K = (\d) dB 平均 −([\d.]+) dB/, '`deeper` on the fast layer')
    same(rayMean!, -avg(draws(RAYLEIGH)), 'what Rayleigh averages in dB')
    expect(val(ricK!), 'the K factor beside it').toBe(RICIAN_K_DEFAULT_DB)
    same(ricMean!, -avg(draws(RICIAN)), 'and what Rician averages')
    const [mult, base, closed] = raw(DEEP, /正好是 −(\d+)γ\/ln(\d+) = −([\d.]+) dB/,
      '`deeper` on the closed form')
    same(closed!, (val(mult!) * EULER_GAMMA) / Math.log(val(base!)),
      'the closed form those two give')
    expect(Math.abs(val(closed!) - -avg(draws(RAYLEIGH))),
      'and the 200 000 draws land near it').toBeLessThan(0.02)
    same(raw(DEEP, /它把平均电平压低了 ([\d.]+) dB/, '`deeper` on what Rayleigh costs')[0]!,
      -avg(draws(RAYLEIGH)), 'the level Rayleigh takes off the link')
  })

  it('the 150 ms ruler, and the coherence table it is the reason for', () => {
    const [listWindow, coherence] = figs(NUMS,
      /那份清单的窗口是 (\d+) ms，而阴影的相干时间是 (\d+) ms/, '`numbers` on the broken ruler')
    expect(coherence, 'the coherence time the shadow holds a value for')
      .toBe(FADING_DEFAULTS.coherenceMs)
    expect(listWindow, 'and the window the fixture list runs').toBeLessThan(2 * coherence!)
    // the claim itself: at that window a shadowed run hashes like an unshadowed one
    expect(run(scene(SHADOW4), listWindow! * MS).hash,
      'which is why a shadowed row would record the same hash')
      .toBe(run(scene(undefined), listWindow! * MS).hash)
    same(raw(NUMS, /跑满 (\d+) ms 才量得出来/, '`numbers` on what it takes instead')[0]!,
      RUN_NS / MS, 'the window this file measures over')
    // the coherence table's heading, and every row of it
    const heading = table(2).heading!
    const [sigma, seed, width] = figs(heading,
      /阴影 σ (\d+) dB、关掉快层、种子 (\d+)，把失败按 (\d+) ms 分到十个窗口里/,
      'the coherence table’s own heading')
    expect(sigma, 'the sigma that table runs').toBe(SHADOW4.shadowSigmaDb)
    expect(seed, 'the seed it runs').toBe(SEEDS[0])
    expect(width, 'and the window it buckets into').toBe(FADING_DEFAULTS.coherenceMs)
    const bucketed = (coherenceMs: number): number[] => {
      const w = new Array<number>(RUN_NS / MS / width!).fill(0)
      for (const r of ofType(run(scene({ ...SHADOW4, coherenceMs })).recs, 'RX_FAIL')) {
        if (r.node !== 'ap' || r.from !== 'sta-1') continue
        w[Math.min(w.length - 1, Math.floor(r.t / (width! * MS)))]++
      }
      return w
    }
    table(2).rows.forEach((row, i) => {
      const [ms] = figs(row[0]!, /(\d+) ms/, `row ${i}: the coherence time it names`)
      const got = bucketed(ms!)
      const listed = /^([\d, ]+) ——/.exec(row[1]!)
      if (listed !== null) {
        expect(listed[1]!.split(', ').map(Number), `row ${i}: the ten counts it prints`)
          .toEqual(got)
      } else {
        const [values] = figs(row[1]!, /整轮只抽到 (\d+) 个阴影值/, `row ${i}: the last row`)
        expect(got.reduce((a, b) => a + b, 0), `row ${i}: no failure at all`).toBe(0)
        expect(Math.ceil(RUN_NS / MS / ms!), `row ${i}: the shadow values a round draws`)
          .toBe(values)
      }
    })
  })

  it('`sources` and `limits`: the in-frame scale, the reported ranges and the clamp', () => {
    // the midamble period: a Doppler subfield of 1, then 10 or 20 symbols at 13.6 µs
    const [dopplerOn] = figs(SRC, /Doppler 子字段为 (\d) 时/, '`sources` on the subfield')
    expect(dopplerOn, 'the value that turns the midamble on').toBe(1)
    const [shortSym, longSym] = figs(SRC, /周期只有两档——(\d+) 个符号或 (\d+) 个符号/,
      '`sources` on the two periods')
    const [symUs, shortUs, longUs] = figs(SRC,
      /符号长度 ([\d.]+) µs：(\d+) µs 与 (\d+) µs/, '`sources` on the symbol length')
    expect(symUs, 'the symbol length the engine already has').toBe(PHY_MODES.he.symNs / 1000)
    expect(shortUs, 'the shorter period those symbols give').toBe(shortSym! * symUs!)
    expect(longUs, 'and the longer one').toBe(longSym! * symUs!)
    const [lShort, lLong] = figs(LIMITS, /中段训练字段的 (\d+) 或 (\d+) 个符号/,
      '`limits` on the same two periods')
    expect([lShort, lLong], '`limits` names the same two').toEqual([shortSym, longSym])
    const [lShortUs, lLongUs] = figs(LIMITS, /折成 (\d+) µs 与 (\d+) µs/,
      '`limits` on what they come to')
    expect([lShortUs, lLongUs], 'and the same two durations').toEqual([shortUs, longUs])
    const [coherence, ratio] = figs(LIMITS, /比这里的 (\d+) ms 小 (\d+) 倍/,
      '`limits` on the two scales')
    expect(coherence, 'the coherence time').toBe(FADING_DEFAULTS.coherenceMs)
    expect(Math.round((coherence! * 1000) / shortUs!), 'and how many times smaller the other is')
      .toBe(ratio)
    // the four model values, and the ranges they were picked from the middle of
    const [sigmaPick] = figs(LIMITS, /阴影标准差 (\d+) dB、相干时间/, '`limits` on the sigma')
    expect(sigmaPick, 'the sigma fading.ts defaults to').toBe(FADING_DEFAULTS.shadowSigmaDb)
/*
     * **Exempt, class (a), three times over — and the fourth is not.** 「阴影标准差常报 3 到
     * 8 dB、K 常报 3 到 10 dB」 is a fact about the indoor-measurement literature, and this
     * repository holds no corpus of it: there is no constant, no record and no run behind any
     * of the four bounds. The lesson says as much in the same breath (「不是任何一次测量
     * 活动的结果」). What IS checkable is the only thing the sentence uses them for — that
     * each picked value sits in the INTERIOR of its range — and making that strict rather than
     * inclusive catches one of the four: the sigma this engine picks is 4, so a planted lower
     * bound of 4 is no longer strictly below it. The other three the sweep of 2026-10-13
     * walked through, and they stay, with this argument beside them.
     */
    const [sLo, sHi, kLo, kHi] = figs(LIMITS,
      /阴影标准差常报 (\d+) 到 (\d+) dB、K 常报 (\d+) 到 (\d+) dB/,
      '`limits` on the reported ranges')
    expect(sigmaPick, 'the sigma sits strictly inside the reported range').toBeGreaterThan(sLo!)
    expect(sigmaPick, 'from both sides').toBeLessThan(sHi!)
    expect(RICIAN_K_DEFAULT_DB, 'as does the K factor').toBeGreaterThan(kLo!)
    expect(RICIAN_K_DEFAULT_DB, 'from both sides').toBeLessThan(kHi!)
    expect(sLo, 'and each range really is a range').toBeLessThan(sHi!)
    expect(kLo, 'both of them').toBeLessThan(kHi!)
    // the clamp: measured as the floor 200 000 draws actually hit
    const [floor] = raw(LIMITS, /它不许深过 −(\d+) dB/, '`limits` on the clamp')
    // `Math.min(...xs)` with 200 000 arguments overflows the call stack
    expect(draws(RAYLEIGH).reduce((a, b) => Math.min(a, b), Infinity),
      'the deepest fade the sampler ever returns').toBe(-val(floor!))
    const [clampN, hits] = raw(LIMITS, /(\d+) 万次抽取里撞到约(.)次/, '`limits` on how often')
    expect(draws(RAYLEIGH).length, 'the draws that count is over')
      .toBe(val(clampN!) * 10_000)
    expect(draws(RAYLEIGH).filter((v) => v === -val(floor!)).length,
      'and how many of them hit the floor')
      .toBeLessThanOrEqual(2 * zhNumeral(hits!.replace(/两/g, '二'))!)
    const [powerMean] = figs(LIMITS, /E\[\|h\|²\] = (\d) 说的是功率域平均为一/,
      '`limits` on the two domains')
    const power = draws(RAYLEIGH).map((v) => 10 ** (v / 10))
    expect(avg(power), 'the power-domain mean the sampler is scaled to')
      .toBeCloseTo(powerMean!, 2)
    expect(avg(draws(RAYLEIGH)), 'while the dB-domain mean is below it').toBeLessThan(0)
  })

  it('`observe`, `tryThis` and the quiz: the inert configuration and the two rate stories', () => {
    // `tryThis` 1: sigma 2 dB with no fast layer hashes like no fading at all
    const [trySigma, tryCoherence, frames, drops, rung] = figs(TRY,
      /阴影标准差填 (\d) dB，相干时间留 (\d+) ms。[\s\S]*?逐哈希相同：(\d+) 帧、(\d) 掉帧、级别恒为 (\d)/,
      '`tryThis` on the inert configuration')
    expect(tryCoherence, 'the coherence time it leaves alone').toBe(FADING_DEFAULTS.coherenceMs)
    const inert: FadingCfg = { shadowSigmaDb: trySigma!, coherenceMs: tryCoherence!, smallScale: 'none' }
    expect(run(scene(inert)).hash, 'that configuration really does hash like no fading at all')
      .toBe(run(scene(undefined)).hash)
    const base = rates(run(scene(undefined)).recs)
    expect(frames, '`tryThis`: the frames it sends').toBe(base.sent)
    expect(drops, 'and the frames it drops').toBe(base.failed)
    expect(Object.keys(rungs(undefined)).map(Number), 'on that one rung').toEqual([rung])
    const [smallSigma] = figs(TRY, /([\d.]+) dB 的阴影一帧都翻不动/, '`tryThis` on why')
    expect(smallSigma, 'the sigma that cannot move a frame').toBe(trySigma)
    // `tryThis` 2 and the second question: sigma 4, coherence 500 ms, 1000 ms, no failure
    const [bigSigma, from, to] = figs(TRY,
      /把阴影标准差调回 (\d) dB[\s\S]*?再把相干时间从 (\d+) ms 改成 (\d+) ms/,
      '`tryThis` on the long coherence time')
    expect(bigSigma, 'the sigma it goes back to').toBe(SHADOW4.shadowSigmaDb)
    expect(from, 'the coherence time it starts from').toBe(FADING_DEFAULTS.coherenceMs)
    const long: FadingCfg = { ...SHADOW4, coherenceMs: to! }
    expect(rates(run(scene(long)).recs).failed, 'and at that one there is no failure at all')
      .toBe(0)
    const [qSigma, qCoherence, qRun] = figs(QUIZ,
      /阴影标准差 (\d) dB、相干时间 (\d+) ms，跑 (\d+) ms 一次失败也没有/, 'the second question')
    expect([qSigma, qCoherence], 'the quiz names the same two').toEqual([bigSigma, to])
    expect(qRun, 'over the same window').toBe(RUN_NS / MS)
    const [qLong] = figs(QUIZ, /([\d.]+) ms 时阴影已经接近常数/, 'the second question’s first option')
    expect(qLong, 'the same coherence time, in the option that is wrong about why').toBe(to)
    const [qStill] = figs(QUIZ, /相干时间超过 (\d+) ms 之后引擎就不再抽阴影/,
      'the second question’s third option')
    expect(qStill, 'and in the other wrong option').toBe(FADING_DEFAULTS.coherenceMs)
    const [qList] = figs(QUIZ, /那份哈希清单的 (\d+) ms 窗口/, 'the second explanation')
    expect(qList, 'the fixture window, again')
      .toBe(figs(NUMS, /那份清单的窗口是 (\d+) ms/, '`numbers`')[0])
/*
     * **Exempt, class (c): the content of this figure is an inequality.** 「把仿真跑到 10 秒，
     * 失败就回来了」 claims a window long enough, not a particular one — eleven seconds works
     * too, which is why the sweep of 2026-10-13 walked through it. What is measured instead is
     * the contrast the sentence is built on, both halves of it: at that length the failures are
     * back, and at the lesson's own round length there are none. The first failure's own
     * instant is measured too, so the claim is a fact about where it falls rather than about
     * the number printed.
     */
    const [tenSec] = figs(TRY, /把仿真跑到 (\d+) 秒，失败就回来了/, '`tryThis` on the longer run')
    const longRun = run(scene(long), tenSec! * 1000 * MS).recs
    const firstFail = ofType(longRun, 'RX_FAIL')
      .filter((r) => r.node === 'ap' && r.from === 'sta-1')[0]
    expect(firstFail, 'over that window the failures come back').toBeDefined()
    expect(firstFail!.t, 'and the first of them falls inside it')
      .toBeLessThanOrEqual(tenSec! * 1000 * MS)
    expect(firstFail!.t, 'while falling outside the lesson’s own round, which has none')
      .toBeGreaterThan(RUN_NS)
    expect(rates(run(scene(long)).recs).failed, 'as that round indeed has none').toBe(0)
    // the first explanation's own four figures
    const [eRay, eK, eRic] = raw(QUIZ,
      /瑞利在分贝域平均 −([\d.]+) dB，莱斯 K = (\d) dB 只有 −([\d.]+) dB/, 'the first explanation')
    same(eRay!, -avg(draws(RAYLEIGH)), 'the quiz: what Rayleigh averages')
    expect(val(eK!), 'the quiz: the K factor').toBe(RICIAN_K_DEFAULT_DB)
    same(eRic!, -avg(draws(RICIAN)), 'the quiz: and what Rician averages')
    const [collisions] = figs(QUIZ, /而碰撞在这个单链路场景里恒为 (\d)/, 'the first explanation')
    expect(ofType(run(scene(RAYLEIGH)).recs, 'COLLISION').length,
      'the quiz: the collisions this single-link scene can have').toBe(collisions)
    const [rayUs, rayMbps, ricUs, ricMbps] = raw(QUIZ,
      /瑞利每帧平均 (\d+) µs、吞吐 ([\d.]+) Mb\/s，莱斯每帧 (\d+) µs、吞吐 ([\d.]+) Mb\/s/,
      'the first explanation on the two rate stories')
    same(rayUs!, airtimeUs(RAYLEIGH), 'the quiz: Rayleigh’s airtime')
    same(ricUs!, airtimeUs(RICIAN), 'the quiz: and Rician’s')
    same(rayMbps!, mean(perSeed(RAYLEIGH).map((r) => r.mbps)), 'the quiz: Rayleigh’s throughput')
    same(ricMbps!, mean(perSeed(RICIAN).map((r) => r.mbps)), 'the quiz: and Rician’s')
    // `observe`'s own window width, and the span of windows the three configs fill
    same(raw(OBS, /数一数失败落在哪些 (\d+) ms 窗口里/, '`observe` on the buckets')[0]!,
      FADING_DEFAULTS.coherenceMs, 'the window `observe` buckets into')
    const [offW, rayLo, rayHi] = raw(OBS,
      /不开起伏时(.)个窗口全空，瑞利时(.)到(.)个窗口有失败，莱斯时十个窗口全都有/,
      '`observe` on the three spans')
    const of10 = RUN_NS / MS / FADING_DEFAULTS.coherenceMs
    expect(zhNumeral(offW!.replace(/两/g, '二')), 'the windows the unfaded run leaves empty')
      .toBe(of10)
    expect(Math.min(...SEEDS.map((s) => failWindows(RAYLEIGH, s))), 'Rayleigh’s fewest')
      .toBe(zhNumeral(rayLo!.replace(/两/g, '二')))
    expect(Math.max(...SEEDS.map((s) => failWindows(RAYLEIGH, s))), 'and its most')
      .toBe(zhNumeral(rayHi!.replace(/两/g, '二')))
    expect(new Set(SEEDS.map((s) => failWindows(RICIAN, s))), 'while Rician fills every one')
      .toEqual(new Set([of10]))
  })
})
