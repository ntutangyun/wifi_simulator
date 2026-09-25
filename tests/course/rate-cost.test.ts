/**
 * Every empirical claim in "跌落的账单——谁替这段慢帧买单" — the second half of
 * `rate-fallback`, split on 2026-09-25 (§2 M9 of the re-pacing plan).
 *
 * It borrows the parent's scene (which is `rate`'s) rather than declaring one of
 * its own, so `lessonShapeSuite(..., { sameSceneAs: 'rate-fallback' })` proves the
 * two ids replay the same timeline and its recorded hash is a copy rather than a
 * new run. Neither half has a variant, so the fixture cost is one line.
 *
 * What moved here with the prose (§6: "~7 of `rate-fallback`'s go to
 * `rate-cost`"): the 20.2 %/29.7 % arithmetic, the 530.3/318.1/212.2 ms figures
 * and the 7.1 % of the run, the three lengths the near station's backoff is held
 * for and the 964.0 µs between them, and the ten-frame trip at 14.8 ms against
 * 5.2 ms at the ceiling. The freeze rule's own pin — every freeze comes back at
 * the value it went in at — stays in tests/course/rate-fallback.test.ts, where the
 * `deeper` paragraph that states it lives; step 3 of this lesson's procedure states
 * it too, so it is asserted here as well, beside the lengths it explains.
 *
 * The lesson is not registered in src/course/lessons.ts yet — the controller does
 * that when the batch lands — so the contract tests that walk LESSONS cannot see
 * it. The terminology rule is therefore re-run here over this one lesson, with
 * the same helpers tests/course/readability.test.ts uses.
 */
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { rateCost } from '../../src/course/tier2/rate-cost'
import { rateFallback } from '../../src/course/tier2/rate-fallback'
import { rateScenario } from '../../src/course/wifiScenes'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES, trackOf } from '../../src/course/curriculum'
import {
  ZH_TERMS, cellTexts, paragraphTexts, bracketedAtFirstZhUse, zhAkaViolations, zhTermFailure,
} from '../../src/course/readability'

const MS = 1_000_000
/** The three seconds every figure in this lesson is measured over — the parent's own window. */
const RUN_NS = 3_000 * MS
/** Long enough for all three jump targets; the shape suite asks for no more. */
const JUMP_NS = 200 * MS
/** The far station's ceiling on this scene. */
const CEILING = 2

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const data = (rs: TLRecord[], node: string): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && r.node === node && r.frame.kind === 'data')
const round1 = (x: number): number => Math.round(x * 10) / 10
const pct = (a: number, b: number): number => round1((a / b) * 100)
const air = (xs: Tx[]): number => xs.reduce((a, r) => a + r.frame.txTimeNs, 0)

/** The shared run: the same key both halves ask for, so it is simulated once. */
const rs = runOf(rateCost, undefined, RUN_NS)
const far = data(rs, 'sta-2')
const near = data(rs, 'sta-1')
const below = far.filter((r) => r.frame.mcs! < CEILING)
const atCeiling = far.find((r) => r.frame.mcs === CEILING)!.frame.txTimeNs

/** One freeze of the near station: when it started, how long it lasted, and whether it resumed at the same value. */
interface Hold { t: number; dur: number; same: boolean }
const holds: Hold[] = (() => {
  type Bo = Extract<TLRecord, { type: 'BACKOFF_FREEZE' | 'BACKOFF_RESUME' }>
  const evs = rs.filter((r): r is Bo =>
    (r.type === 'BACKOFF_FREEZE' || r.type === 'BACKOFF_RESUME') && r.node === 'sta-1')
  const out: Hold[] = []
  for (let i = 0; i + 1 < evs.length; i++) {
    if (evs[i].type === 'BACKOFF_FREEZE' && evs[i + 1].type === 'BACKOFF_RESUME')
      out.push({ t: evs[i].t, dur: evs[i + 1].t - evs[i].t, same: evs[i].value === evs[i + 1].value })
  }
  return out
})()

/** How long a freeze that starts inside one of the far station's frames at `mcs` lasts. */
const holdBehind = (mcs: number): number => {
  const spans = far.filter((r) => r.frame.mcs === mcs).map((r) => [r.t, r.t + r.frame.txTimeNs] as const)
  const hs = holds.filter((h) => spans.some(([a, b]) => h.t >= a && h.t <= b))
  expect(hs.length, `holds behind MCS ${mcs}`).toBeGreaterThan(50)
  expect(new Set(hs.map((h) => h.dur)).size, `one hold length behind MCS ${mcs}`).toBe(1)
  return hs[0].dur
}

lessonShapeSuite(rateCost, { sameSceneAs: 'rate-fallback', runNs: JUMP_NS })

describe('rate-cost · the lesson’s own scene', () => {
  it('follows its parent in the capacity module and names the two words it adds', () => {
    expect(MODULES[rateCost.module].title).toBe('容量旋钮与速率控制')
    expect(MODULES[rateCost.module].title).toBe(MODULES[rateFallback.module].title)
    expect(trackOf(rateCost)).toBe('wifi')
    expect(rateCost.needs).toEqual(['rate-fallback'])
    expect(rateCost.terms!.map((t) => t.term)).toEqual(['airtime tax', 'backoff freeze'])
  })

  it('is the parent’s scene, undivided, and has no variant of its own', () => {
    const sc = rateCost.scenario()
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    expect(sc).toEqual(rateFallback.scenario())
    expect(sc).toEqual(rateScenario())
    expect(rateCost.variants).toBeUndefined()
    expect(rateFallback.variants).toBeUndefined()
  })
})

describe('rate-cost · how the bill reaches the neighbour', () => {
  it('step 1: the same 1530 octets, at 524.0, 768.8 and 1,476.0 µs', () => {
    const airAt = (mcs: number): number => far.find((r) => r.frame.mcs === mcs)!.frame.txTimeNs
    for (const r of far) expect(r.frame.bytes).toBe(1_530)
    expect([airAt(2), airAt(1), airAt(0)]).toEqual([524_000, 768_800, 1_476_000])
  })

  it('steps 2 and 3: the counter stops when the medium goes busy and resumes at the same value', () => {
    // §10.23.2.4, and the engine's `onCcaBusy`: a FREEZE carries the value, and the RESUME
    // that ends the hold carries the same one — "one count fewer, never one count more".
    expect(holds.length).toBeGreaterThan(2_000)
    expect(holds.every((h) => h.same)).toBe(true)
    // every hold begins inside somebody else's transmission, which is what makes it a freeze
    expect(ofType(rs, 'BACKOFF_FREEZE').filter((r) => r.node === 'sta-1').length)
      .toBeGreaterThanOrEqual(holds.length)
  })

  it('step 4: the hold is longer than the frame — 615.0 µs behind a 524.0 µs frame', () => {
    expect(holdBehind(CEILING)).toBe(615_000)
    expect(holdBehind(CEILING)).toBeGreaterThan(atCeiling)
    expect(holdBehind(0)).toBe(1_579_000)
    expect(holdBehind(0)).toBeGreaterThan(1_476_000)
  })
})

describe('rate-cost · the bill', () => {
  it('607 frames: 20.2% of the frames, 29.7% of the air, 530.3 against 318.1 ms', () => {
    expect(far.length).toBe(3_003)
    expect(below.length).toBe(607)
    expect(pct(below.length, far.length)).toBe(20.2)
    expect(pct(air(below), air(far))).toBe(29.7)
    expect(round1(air(below) / MS)).toBe(530.3)
    expect(round1((below.length * atCeiling) / MS)).toBe(318.1)
  })

  it('so 212.2 ms more, 7.1% of the whole run, carrying nothing at all', () => {
    const extra = air(below) - below.length * atCeiling
    expect(round1(extra / MS)).toBe(212.2)
    expect(pct(extra, RUN_NS)).toBe(7.1)
    // "the frames, the payload and what arrived are identical": every frame below the ceiling
    // carries the same 1530 octets as every frame at it, so the extra time buys no bits
    expect(new Set(far.map((r) => r.frame.bytes))).toEqual(new Set([1_530]))
  })

  it('the last row: ten frames at the bottom rung cost 14.8 ms, and 5.2 at the ceiling', () => {
    expect(round1((10 * 1_476_000) / MS)).toBe(14.8)
    expect(round1((10 * atCeiling) / MS)).toBe(5.2)
  })

  it('the second table: 615.0, 859.8 and 1,579.0 µs — 964.0 µs more at the bottom', () => {
    expect([holdBehind(2), holdBehind(1), holdBehind(0)]).toEqual([615_000, 859_800, 1_579_000])
    expect(holdBehind(0) - holdBehind(2)).toBe(964_000)
  })

  it('observe: the near station loses nothing and never changes rung, yet waits longer', () => {
    // "it has not lost a frame and its own rung has not moved, but what it waits is decided
    //  by its neighbour's luck"
    expect(near.length).toBe(4_010)
    expect(new Set(near.map((r) => r.frame.mcs))).toEqual(new Set([11]))
    expect(ofType(rs, 'ACK_TIMEOUT').filter((r) => r.node === 'sta-1')).toHaveLength(0)
    // a fifth of the frames, getting on for three tenths of the air
    expect(pct(below.length, far.length)).toBeLessThan(21)
    expect(pct(air(below), air(far))).toBeGreaterThan(29)
  })
})

describe('rate-cost · deeper: why it is 1.67 times and not three', () => {
  it('517 frames one rung down at +47%, 90 at the bottom at +182%, 1.67 times in all', () => {
    const atRung = (mcs: number): number => far.filter((r) => r.frame.mcs === mcs).length
    expect([atRung(1), atRung(0)]).toEqual([517, 90])
    expect(atRung(1) + atRung(0)).toBe(below.length)
    const over = (ns: number): number => Math.round((ns / atCeiling - 1) * 100)
    expect([over(768_800), over(1_476_000)]).toEqual([47, 182])
    expect(round1(air(below) / (below.length * atCeiling))).toBe(1.7)
    expect(Math.round((air(below) / (below.length * atCeiling)) * 100) / 100).toBe(1.67)
    // "the one reason the bill is not worse": most excursions are one rung deep
    expect(atRung(1)).toBeGreaterThan(5 * atRung(0))
    expect(Math.round((1_476_000 / atCeiling) * 10) / 10).toBe(2.8)
  })
})

describe('rate-cost · the two experiments', () => {
  /** The lesson's own scene with one thing changed, run for the same three seconds. */
  const changed = (mut: (sc: ReturnType<typeof rateScenario>) => void) => {
    const sc = rateCost.scenario()
    mut(sc)
    const recs = [...new Simulation(sc).runUntil(RUN_NS).records]
    const xs = data(recs, 'sta-2')
    const ceiling = Math.max(...xs.map((r) => r.frame.mcs!))
    const lower = xs.filter((r) => r.frame.mcs! < ceiling)
    const base = xs.find((r) => r.frame.mcs === ceiling)!.frame.txTimeNs
    const extra = air(lower) - lower.length * base
    return {
      frames: xs.length,
      ceiling,
      below: lower.length,
      extraMs: round1(extra / MS),
      extraPct: pct(extra, RUN_NS),
      timeouts: recs.filter((r) => r.type === 'ACK_TIMEOUT' && r.node === 'sta-2').length,
    }
  }

  it('an idle near station: 4,395 frames, every one at the ceiling, and no bill at all', () => {
    const quiet = changed((sc) => { sc.nodes.find((n) => n.id === 'sta-1')!.profiles = ['idle'] })
    expect(quiet.frames).toBe(4_395)
    expect(quiet.ceiling).toBe(CEILING)
    expect(quiet.below).toBe(0)
    expect(quiet.timeouts).toBe(0)
    expect(quiet.extraMs).toBe(0)
    // and the far station really did fail 337 times with the neighbour there
    expect([...ofType(rs, 'RETRY'), ...ofType(rs, 'DROP')].filter((r) => r.node === 'sta-2'))
      .toHaveLength(337)
  })

  it('two metres closer: the ceiling rises, 3,712 frames, and the tax falls to 96.9 ms', () => {
    const sc0 = rateCost.scenario()
    const ap = sc0.nodes.find((n) => n.id === 'ap')!.pos
    const far0 = sc0.nodes.find((n) => n.id === 'sta-2')!.pos
    const dx = ap.x - far0.x, dy = ap.y - far0.y, len = Math.hypot(dx, dy)
    const closer = changed((sc) => {
      const n = sc.nodes.find((x) => x.id === 'sta-2')!
      n.pos = { x: far0.x + (dx / len) * 2, y: far0.y + (dy / len) * 2, z: n.pos.z }
    })
    expect(closer.ceiling).toBe(3)
    expect([far.length, closer.frames]).toEqual([3_003, 3_712])
    expect(closer.extraMs).toBe(96.9)
    expect(closer.extraPct).toBe(3.2)
    // "the bill shrinks but does not go away": there are still excursions there
    expect(closer.below).toBeGreaterThan(0)
  })
})

/**
 * The terminology rule, re-run over this one unregistered lesson: every official
 * term carries its standard English name, and its abbreviation where the standard
 * has one, at its first Chinese use. The text and its order are exactly what
 * tests/course/readability.test.ts reads — `why`, `outcomes`, `picture`,
 * `numbers`, `observe`, `tryThis`, `quiz` — with `deeper` and `sources` left out.
 */
describe('rate-cost · every official term carries its English name', () => {
  const zh = [rateCost.why!, ...rateCost.outcomes!]
    .concat(paragraphTexts(rateCost.picture!), cellTexts(rateCost.picture!))
    .concat(paragraphTexts(rateCost.numbers!), cellTexts(rateCost.numbers!))
    .concat(rateCost.observe, rateCost.tryThis, rateCost.quiz.flatMap((q) => [q.q, ...q.options, q.explain]))
    .join(' ')
  const rows = ZH_TERMS.filter((t) => !t.track || t.track === trackOf(rateCost))

  it('brackets every official term at its first Chinese use', () => {
    const out: string[] = []
    for (const t of rows) {
      const why = zhTermFailure(zh, t)
      if (why) out.push(why)
      out.push(...zhAkaViolations(zh, t))
    }
    expect(out).toEqual([])
  })

  it('had its terminology actually graded', () => {
    expect(rows.filter((t) => bracketedAtFirstZhUse(zh, t) !== null).length).toBeGreaterThanOrEqual(2)
  })
})
