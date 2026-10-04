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
import { FADING_DEFAULTS, RICIAN_K_DEFAULT_DB } from '../../src/engine/fading'
import { fadingToggle } from '../../src/editor/planOps'
import { Simulation } from '../../src/engine/simulation'
import type { FadingCfg } from '../../src/engine/fading'
import type { Scenario } from '../../src/model/scenario'
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
    expect(Math.min(...ray.map((r) => r.dropPct))).toBeCloseTo(1.11, 1)
    expect(Math.max(...ray.map((r) => r.dropPct))).toBeCloseTo(4.73, 1)
    expect(Math.min(...ric.map((r) => r.dropPct))).toBeCloseTo(9.98, 1)
    expect(Math.max(...ric.map((r) => r.dropPct))).toBeCloseTo(12.09, 1)
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
 * **The slow layer has still never produced a non-zero value in a shipped scene, and this is a
 * census that says so out loud rather than a claim that it now has.**
 *
 * The design note for this slice expected this lesson to be the first scene to run the slow
 * layer; the decision in its §4.1 — three variants, shadow as a `tryThis` — means it is not.
 * Both statements can be true and only one of them can be in a test, so here is the measured
 * one: **every shipped scene that writes a `fading` section sets `shadowSigmaDb: 0`**, and
 * `shadowDb` returns before it has read `coherenceMs`. So `coherenceMs: 100` and
 * `RICIAN_K_DEFAULT_DB` remain fields that are written and never read in the shipped course,
 * with this lesson's `tryThis` and the gates above as the only places the slow layer runs at all.
 *
 * Taken off `LESSONS`, never off the file text: the count is what a reader of the panel would
 * find. When it changes, somebody has to read this message.
 */
describe('fading · the census of every shipped scene that turns fading on', () => {
  const faded = LESSONS.flatMap((l) => [
    { id: l.id, sc: l.scenario() },
    ...(l.variants ?? []).map((v, i) => ({ id: `${l.id}#${i}`, sc: v.scenario() })),
  ]).filter((x) => x.sc.fading !== undefined)

  it('is exactly these twelve scenes', () => {
    expect(faded.map((x) => x.id).sort()).toEqual([
      'fading', 'fading#1', 'fading#2',
      'ru-diversity', 'ru-diversity#0', 'ru-diversity#1',
      'selectivity', 'selectivity#0', 'selectivity#1', 'selectivity#2', 'selectivity#3', 'selectivity#4',
    ])
  })

  it('and not one of them gives the slow layer a sigma to draw with', () => {
    for (const { id, sc } of faded) {
      expect(sc.fading!.shadowSigmaDb, `${id} now runs the slow layer — read this test's docblock`).toBe(0)
    }
  })

  it('so `coherenceMs` and the default K factor are shipped fields nothing reads', () => {
    // `coherenceMs` is read only inside `shadowDb`, past the `sigma === 0` return; the K factor
    // is read only for `smallScale: 'rician'`, which exactly one of the twelve is.
    expect(new Set(faded.map((x) => x.sc.fading!.coherenceMs))).toEqual(new Set([100]))
    const rician = faded.filter((x) => x.sc.fading!.smallScale === 'rician')
    expect(rician.map((x) => x.id)).toEqual(['fading#2'])
    expect(rician[0].sc.fading!.ricianKdB).toBe(RICIAN_K_DEFAULT_DB)
    // and `FADING_DEFAULTS` — the editor's checkbox — is used by no shipped scene at all
    expect(FADING_DEFAULTS.shadowSigmaDb).toBe(4)
    expect(faded.filter((x) => x.sc.fading!.shadowSigmaDb === FADING_DEFAULTS.shadowSigmaDb)).toEqual([])
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
