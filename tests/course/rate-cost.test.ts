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
import { ACK_TIMEOUT_NS } from '../../src/engine/phy'
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

/**
 * The lesson's own scene with one thing changed, run for the same three seconds — **memoised by
 * the name of the change**, because the read-back at the end of this file asks for the same two
 * scenes and the suite's simulated work is bounded (tests/simCost.ts).
 */
const changedRuns = new Map<string, ReturnType<typeof changeScene>>()
const changedOf = (key: string, mut: (sc: ReturnType<typeof rateScenario>) => void) => {
  const hit = changedRuns.get(key)
  if (hit) return hit
  const made = changeScene(mut)
  changedRuns.set(key, made)
  return made
}

function changeScene(mut: (sc: ReturnType<typeof rateScenario>) => void) {
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

/** Two metres of the far station's distance towards the access point, as both halves move it. */
const twoMetresCloser = (sc: ReturnType<typeof rateScenario>): void => {
  const ap = rateCost.scenario().nodes.find((n) => n.id === 'ap')!.pos
  const far0 = rateCost.scenario().nodes.find((n) => n.id === 'sta-2')!.pos
  const dx = ap.x - far0.x
  const dy = ap.y - far0.y
  const len = Math.hypot(dx, dy)
  const n = sc.nodes.find((x) => x.id === 'sta-2')!
  n.pos = { x: far0.x + (dx / len) * 2, y: far0.y + (dy / len) * 2, z: n.pos.z }
}

describe('rate-cost · the two experiments', () => {
  it('an idle near station: 4,395 frames, every one at the ceiling, and no bill at all', () => {
    const quiet = changedOf('quiet', (sc) => { sc.nodes.find((n) => n.id === 'sta-1')!.profiles = ['idle'] })
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
    const closer = changedOf('closer', twoMetresCloser)
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
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * Everything above measures the right thing and compares it with a figure typed on **this** side
 * — `expect(below.length).toBe(607)`, with the lesson's sentence in the `it` name. So the engine
 * is pinned and the prose is not: the sampling sweep of 2026-10-12 planted six of this lesson's
 * figures and **all six went unnoticed**. Here each figure is parsed out of the shipped string.
 *
 * **The reads worth naming:**
 *
 *  - **the three rungs are read as one ladder, three times over.** 「524.0 / 768.8 / 1 476.0 µs」
 *    appear in the steps, 「615.0 / 859.8 / 1 579.0 µs」 in the second table and in `observe`, and
 *    the quiz prints one of each to make its point. Every one of them is read against the rung it
 *    names — the frame's own airtime, or the freeze the neighbour serves behind it — so a figure
 *    cannot be right in one place and wrong in another.
 *  - **the bill is read as the subtraction it is**: what those frames took, what they would have
 *    taken at the ceiling, and the difference as a share of the window — with the lesson's own
 *    「什么也没有」 checked too, since every frame of the run carries the same payload.
 *  - **the two percentages over the ceiling are read as ratios of airtime**, not as rungs: 「每帧
 *    多 47%」 and 「多 182%」 are the rung's airtime over the ceiling's, which is also what
 *    `sources` says they are.
 *  - **「只占五分之一，却占掉将近三成」 is read as the Chinese fractions it writes**, against the
 *    two percentages the table prints.
 */
describe('rate-cost · every figure the prose prints, read back out of it', () => {
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
  const PIC = blockText(rateCost.picture)
  const DEEP = blockText(rateCost.deeper)
  const LIM = blockText(rateCost.limits)
  const SRC = blockText(rateCost.sources)
  const OBS = blockText(rateCost.observe)
  const TRY = blockText(rateCost.tryThis)
  const QUIZ = blockText(rateCost.quiz)

  const val = (x: string): number => Number(x.replace(/[\s,%]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,%]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const cn = (s: string): number => '零一二三四五六七八九十'.indexOf(s)
  const tables = (): { heading?: string; rows: string[][] }[] =>
    rateCost.numbers!.filter((b) => b.kind === 'table') as unknown as
      { heading?: string; rows: string[][] }[]
  /** The airtime of a frame the far station really sent at that rung. */
  const airAt = (mcs: number): number => {
    const hit = far.find((r) => r.frame.mcs === mcs)
    expect(hit, `the far station really sends at MCS ${mcs}`).toBeDefined()
    return hit!.frame.txTimeNs
  }

  it('reads the three rungs of the steps, and the frame that does not change', () => {
    // 「同样的 1530 字节，只是这一帧更长——上限上 524.0 µs，降一级 768.8 µs，最底一级 1 476.0 µs」
    const [bytes, top, one, bottom] = figs(PIC,
      /同样的 (\d+) 字节，只是这一帧更长——上限上 ([\d.]+) µs，降一级 ([\d. ]+) µs，最底一级 ([\d. ]+) µs/,
      'the steps on the three rungs')
    expect(new Set(far.map((r) => r.frame.bytes)), 'the payload every frame of the run carries')
      .toEqual(new Set([bytes]))
    same(String(top), airAt(CEILING) / 1000, 'the frame at the ceiling')
    same(String(one), airAt(CEILING - 1) / 1000, 'one rung down')
    same(String(bottom), airAt(0) / 1000, 'and at the bottom rung')
    expect(bottom! > one! && one! > top!, 'and they really do get longer').toBe(true)
    // 「所以这台邻居被挡住的…上限上 615.0 µs，最底一级 1 579.0 µs」
    const [holdTop, holdBottom] = figs(PIC, /上限上 ([\d.]+) µs，最底一级 ([\d. ]+) µs。/,
      'the steps on the two freezes')
    same(String(holdTop), holdBehind(CEILING) / 1000, 'the freeze behind a ceiling frame')
    same(String(holdBottom), holdBehind(0) / 1000, 'and behind a bottom-rung one')
    expect(holdTop, 'each of which is longer than the frame itself').toBeGreaterThan(top!)
    expect(holdBottom, 'at either rung').toBeGreaterThan(bottom!)
  })

  it('reads the bill table row by row, as the subtraction it is', () => {
    const t = tables()[0]!
    const row = (needle: string): string[] => {
      const hit = t.rows.find((r) => r[0]!.includes(needle))
      expect(hit, `no row 「${needle}」`).toBeDefined()
      return hit!
    }
    const [frames] = figs(row('跑在上限之下的帧数')[1]!, /^(\d+)$/, 'the frames below the ceiling')
    expect(frames, 'the frames the far station sends under its ceiling').toBe(below.length)
    const [framePct] = figs(row('占它三秒里发出的帧数')[1]!, /^([\d.]+)%$/, 'their share of its frames')
    expect(framePct, 'of everything it sent').toBe(pct(below.length, far.length))
    const [airPct] = figs(row('占它三秒里的空口时间')[1]!, /^([\d.]+)%$/, 'their share of its air')
    expect(airPct, 'of the air it took').toBe(pct(air(below), air(far)))
    expect(airPct, 'which is the larger of the two shares — the whole point').toBeGreaterThan(framePct!)
    const [spent] = figs(row('这些帧实际花掉的空口时间')[1]!, /^([\d.]+) ms$/, 'what they really took')
    same(String(spent), air(below) / MS, 'the air those frames took')
    const [would] = figs(row('同样这些帧若跑在上限上')[1]!, /^([\d.]+) ms$/, 'what they would have taken')
    same(String(would), (below.length * airAt(CEILING)) / MS, 'the same frames at the ceiling')
    const [extra] = figs(row('于是多占用')[1]!, /^([\d.]+) ms$/, 'the difference')
    same(String(extra), (air(below) - below.length * airAt(CEILING)) / MS, 'what the fallback costs')
    expect(Math.round((spent! - would!) * 10) / 10, 'which is the subtraction the two rows above make')
      .toBe(extra)
    const [ofRun] = figs(row('占整段三秒仿真')[1]!, /^([\d.]+)%$/, 'its share of the run')
    expect(ofRun, 'of the window every figure is measured over')
      .toBe(pct(air(below) - below.length * airAt(CEILING), RUN_NS))
    // 「本次最短的一趟：最底一级上的十帧 | 14.8 ms，而在上限上只要 5.2 ms」
    const tripRow = row('最短的一趟')
    const [tenCn] = raw(tripRow[0]!, /最底一级上的(.)帧/, 'the trip’s own frame count')
    const [cost, atTop] = figs(tripRow[1]!, /^([\d.]+) ms，而在上限上只要 ([\d.]+) ms$/,
      'the trip’s two costs')
    same(String(cost), (cn(tenCn!) * airAt(0)) / MS, 'ten frames at the bottom rung')
    same(String(atTop), (cn(tenCn!) * airAt(CEILING)) / MS, 'and the same ten at the ceiling')
  })

  it('reads the freeze table, and the same three lengths wherever they are printed', () => {
    const t = tables()[1]!
    const byRung = new Map<number, number>()
    for (const r of t.rows.slice(0, 3)) {
      const [mcs] = figs(r[0]!, /^MCS (\d+)/, 'the row’s own rung')
      const [us] = figs(r[1]!, /^([\d,.]+) µs$/, `the freeze behind MCS ${mcs}`)
      same(String(us), holdBehind(mcs!) / 1000, `what MCS ${mcs} holds the neighbour for`)
      byRung.set(mcs!, us!)
    }
    expect([...byRung.keys()].sort(), 'the three rungs the far station uses').toEqual([0, 1, 2])
    // 「从上限到最底一级：每帧多等 | 964.0 µs」
    const [more] = figs(t.rows[3]![1]!, /^([\d.]+) µs$/, 'the difference between the two ends')
    same(String(more), (holdBehind(0) - holdBehind(CEILING)) / 1000, 'how much more the bottom rung holds')
    expect(Math.round((byRung.get(0)! - byRung.get(CEILING)!) * 10) / 10,
      'which is the subtraction of the two rows above').toBe(more)
    // 「615.0、859.8、1,579.0 µs」 in `observe`, and the pair the quiz prints
    const obs = figs(OBS, /就更长——([\d.]+)、([\d.]+)、([\d,.]+) µs/, '`observe` on the same three')
    expect(obs, 'the same three, in the same order').toEqual([byRung.get(2), byRung.get(1), byRung.get(0)])
    const [qFrame, qHold] = figs(QUIZ,
      /([\d,.]+) µs——就是那一帧的空口时间[^]*?([\d,.]+) µs——从冻住那一刻/,
      'the question’s wrong answer and its right one')
    same(String(qFrame), airAt(0) / 1000, 'the frame’s own airtime, which is the wrong answer')
    same(String(qHold), holdBehind(0) / 1000, 'and the freeze, which is the right one')
    const [qTop] = figs(QUIZ, /在上限上的那些帧后面只等 ([\d.]+) µs/, 'the explanation’s other end')
    expect(qTop, 'the freeze behind a ceiling frame').toBe(byRung.get(CEILING))
    // 「615.0、859.8、1 579.0 µs 这三个冻结时长是本仿真器几个时间常数的产物」, and the 45 µs
    const lim = figs(LIM, /([\d.]+)、([\d.]+)、([\d. ]+) µs 这三个冻结时长/, '`limits` on the same three')
    expect(lim, 'the same three a third time').toEqual([byRung.get(2), byRung.get(1), byRung.get(0)])
    const [timeoutUs] = figs(LIM, /用的是引擎自己定的 (\d+) µs 超时/, '`limits` on the timeout')
    expect(timeoutUs! * 1000, 'the timeout the engine applies').toBe(ACK_TIMEOUT_NS)
    const timeouts = ofType(rs, 'ACK_TIMEOUT').filter((r) => r.node === 'sta-2')
    expect(timeouts.length, 'and the run really times out on it').toBeGreaterThan(0)
    // 「多等 964 µs」 — `limits` prints the difference again, without its decimal
    const [limMore] = figs(LIM, /「多等 (\d+) µs」/, '`limits` on the difference')
    expect(limMore, 'the same difference, to the microsecond')
      .toBe(Math.round((holdBehind(0) - holdBehind(CEILING)) / 1000))
  })

  it('reads why it is 1.67 times and not three', () => {
    // 「最底一级的一帧几乎是上限上的三倍长（1 476.0 对 524.0 µs），可这 607 帧总共只花了 1.67 倍」
    const [bottom, top, frames, times] = figs(DEEP,
      /（([\d. ]+) 对 ([\d.]+) µs），可这 (\d+) 帧总共只花了 ([\d.]+) 倍的时间/,
      '`deeper` on the ratio')
    same(String(bottom), airAt(0) / 1000, 'the bottom rung’s frame')
    same(String(top), airAt(CEILING) / 1000, 'against the ceiling’s')
    expect(frames, 'the frames below the ceiling').toBe(below.length)
    same(String(times), air(below) / (below.length * airAt(CEILING)),
      'what they cost against the same frames at the ceiling')
    const [nearlyCn] = raw(DEEP, /几乎是上限上的(.)倍长/, '`deeper` on the per-frame ratio')
    expect(Math.round(airAt(0) / airAt(CEILING)), 'the per-frame ratio, to the nearest whole')
      .toBe(cn(nearlyCn!))
    expect(times, 'while the bill’s ratio is smaller than that').toBeLessThan(cn(nearlyCn!))
    // 「607 帧里有 517 帧在 MCS 1 上，每帧多 47%；只有 90 帧掉到了最底一级，那里每帧多 182%」
    const [all, oneDown, rung, overOne, atBottom, overBottom] = figs(DEEP,
      /(\d+) 帧里有 (\d+) 帧在 MCS (\d+) 上，每帧多 (\d+)%；只有 (\d+) 帧掉到了最底一级，那里每帧多 (\d+)%/,
      '`deeper` on where the frames went')
    expect(all, 'the frames below the ceiling again').toBe(below.length)
    expect(oneDown, `the frames at MCS ${rung}`).toBe(far.filter((r) => r.frame.mcs === rung).length)
    expect(atBottom, 'and the frames at the bottom').toBe(far.filter((r) => r.frame.mcs === 0).length)
    expect(oneDown! + atBottom!, 'which is all of them').toBe(all)
    const over = (ns: number): number => Math.round((ns / airAt(CEILING) - 1) * 100)
    expect(overOne, `what a frame at MCS ${rung} costs over the ceiling`).toBe(over(airAt(rung!)))
    expect(overBottom, 'and one at the bottom').toBe(over(airAt(0)))
    expect(oneDown, 'most excursions being one rung deep').toBeGreaterThan(atBottom!)
    // `sources` says those two percentages are ratios of the three airtimes, and nothing else
    for (const [pctStr] of [...SRC.matchAll(/“多 (\d+)%”/g)].map((m) => m.slice(1))) {
      expect([over(airAt(rung!)), over(airAt(0))], `「多 ${pctStr}%」 is one of the two ratios`)
        .toContain(val(pctStr!))
    }
  })

  it('reads `observe`’s two fractions and the near station it is about', () => {
    // 「远端站点跑在上限之下的帧只占五分之一，却占掉将近三成的空口时间」
    const [fifth] = raw(OBS, /只占(.)分之一/, '`observe` on the share of frames')
    const [tenths] = raw(OBS, /却占掉将近(.)成的空口时间/, '`observe` on the share of air')
    expect(Math.round(100 / cn(fifth!)), 'a fifth of the frames, to the nearest point')
      .toBe(Math.round(pct(below.length, far.length)))
    expect(cn(tenths!) * 10, 'and getting on for three tenths of the air')
      .toBeGreaterThan(pct(air(below), air(far)))
    expect((cn(tenths!) - 1) * 10, 'but past two tenths of it')
      .toBeLessThan(pct(air(below), air(far)))
    // 「它自己一帧未丢、级别一动不动」
    expect(ofType(rs, 'ACK_TIMEOUT').filter((r) => r.node === 'sta-1'), 'the near station loses nothing')
      .toHaveLength(0)
    expect(new Set(near.map((r) => r.frame.mcs)).size, 'and never changes rung').toBe(1)
    // 「一次跌落至少要十帧才爬得回来」
    const [climbCn] = raw(OBS, /一次跌落至少要(.)帧才爬得回来/, '`observe` on the climb')
    expect(cn(climbCn!), 'the frames a rung takes to win back').toBeGreaterThan(0)
  })

  it('reads both experiments, and the saturation window `limits` names', () => {
    // 「337 次失败一次也不剩：它三秒里发 4,395 帧，帧帧都在上限上」
    const [fails, quietFrames] = figs(TRY,
      /([\d,]+) 次失败一次也不剩：它三秒里发 ([\d,]+) 帧/, '`tryThis` on the quiet neighbour')
    expect(fails, 'the failures the far station has with a neighbour there')
      .toBe([...ofType(rs, 'RETRY'), ...ofType(rs, 'DROP')].filter((r) => r.node === 'sta-2').length)
    const quiet = changedOf('quiet', (sc) => { sc.nodes.find((n) => n.id === 'sta-1')!.profiles = ['idle'] })
    expect(quietFrames, 'what it sends once the neighbour goes quiet').toBe(quiet.frames)
    expect([quiet.below, quiet.timeouts, quiet.extraMs], 'and the bill goes to nothing')
      .toEqual([0, 0, 0])
    // 「上限抬到 MCS 3，三秒交付的帧数从 3,003 变成 3,712，而多占用的时间从 212.2 ms 降到
    //   96.9 ms——占仿真的 3.2%」
    const [ceil, was, now, wasMs, nowMs, nowPct] = figs(TRY,
      /上限抬到 MCS (\d+)，三秒交付的帧数从 ([\d,]+) 变成 ([\d,]+)，而多占用的时间从 ([\d.]+) ms 降到 ([\d.]+) ms——占仿真的 ([\d.]+)%/,
      '`tryThis` on the two metres')
    const closer = changedOf('closer', twoMetresCloser)
    expect(ceil, 'the ceiling two metres buys').toBe(closer.ceiling)
    expect(was, 'the frames from where it stands').toBe(far.length)
    expect(now, 'and from two metres closer').toBe(closer.frames)
    same(String(wasMs), (air(below) - below.length * airAt(CEILING)) / MS, 'the bill where it stands')
    expect(nowMs, 'and the bill two metres closer').toBe(closer.extraMs)
    expect(nowPct, 'as a share of the run').toBe(closer.extraPct)
    expect(closer.below, 'while the bill does not go away').toBeGreaterThan(0)
    // 「饱和档位维持的是一个恒定 20 帧在手的窗口」
    /*
     * **「恒定 20 帧在手」 is a constant, so it is read as one**: once the profile has filled the
     * queue, every enqueue of the run finds it at exactly that depth — which is what makes it a
     * window rather than a bound, and what a `<=` read would have missed (sweep of 2026-10-14).
     */
    const [window] = figs(LIM, /维持的是一个恒定 (\d+) 帧在手的窗口/, '`limits` on the saturated window')
    const depth = ofType(rs, 'ENQUEUE').filter((r) => r.node === 'sta-2').map((r) => r.depth)
    expect(Math.max(...depth), 'the deepest the far station’s queue gets').toBe(window)
    const settled = depth.slice(depth.indexOf(window!))
    expect(new Set(settled).size, 'and from the first time it is full it never moves').toBe(1)
    expect(settled.length, 'which is nearly every enqueue of the run')
      .toBeGreaterThan(depth.length - window!)
  })

  it('reads both questions, where nine of this lesson’s figures are printed a second time', () => {
    /*
     * **The quiz was the whole of what the sweep of 2026-10-14 found**: nine of eleven unnoticed
     * figures are in these two questions, each of them a second printing of a figure the tables
     * above state. So every one is read against the same measurement its table cell is.
     */
    // 「跌落中的帧只占远端站点帧数的 20.2%，为什么吃掉 29.7% 的空口时间？」
    const [framePct, airPct] = figs(QUIZ,
      /跌落中的帧只占远端站点帧数的 ([\d.]+)%，为什么吃掉 ([\d.]+)% 的空口时间/,
      'the second question’s two shares')
    expect(framePct, 'the share of frames below the ceiling').toBe(pct(below.length, far.length))
    expect(airPct, 'and their share of the air').toBe(pct(air(below), air(far)))
    expect(airPct, 'the air share being the larger — which is the question').toBeGreaterThan(framePct!)
    // 「517 帧每帧多 47%，90 帧每帧多 182%」
    const [oneDown, overOne, atBottom, overBottom] = figs(QUIZ,
      /([\d,]+) 帧每帧多 (\d+)%，([\d,]+) 帧每帧多 (\d+)%/, 'the explanation’s four figures')
    const over = (ns: number): number => Math.round((ns / airAt(CEILING) - 1) * 100)
    expect(oneDown, 'the frames one rung down').toBe(far.filter((r) => r.frame.mcs === CEILING - 1).length)
    expect(atBottom, 'and the frames at the bottom').toBe(far.filter((r) => r.frame.mcs === 0).length)
    expect(overOne, 'what one rung down costs over the ceiling').toBe(over(airAt(CEILING - 1)))
    expect(overBottom, 'and what the bottom rung costs').toBe(over(airAt(0)))
    // 「加起来这 607 帧花了 530.3 ms，而它们若都在上限上只要 318.1 ms」
    const [all, spent, would] = figs(QUIZ,
      /加起来这 ([\d,]+) 帧花了 ([\d.]+) ms，而它们若都在上限上只要 ([\d.]+) ms/,
      'the explanation’s three totals')
    expect(all, 'the frames below the ceiling, all of them').toBe(below.length)
    expect(all, 'which is the two rungs added up').toBe(oneDown! + atBottom!)
    same(String(spent), air(below) / MS, 'the air they really took')
    same(String(would), (below.length * airAt(CEILING)) / MS, 'and the air they would have taken')
    // …and both of them are the figures the bill table states, so the two places cannot drift
    const t = tables()[0]!
    const cellOf = (needle: string): string => t.rows.find((r) => r[0]!.includes(needle))![1]!
    expect(`${spent} ms`, 'the same air the bill table prints').toBe(cellOf('实际花掉的空口时间'))
    expect(`${would} ms`, 'and the same ceiling figure').toBe(cellOf('若跑在上限上'))
  })

  it('reads `deeper`’s pointer back to the rule that keeps the bill down', () => {
    // 「上一课数过，25 次跌落里只有 6 次深到最底一级」
    const [drops, deep] = figs(DEEP, /(\d+) 次跌落里只有 (\d+) 次深到最底一级/,
      '`deeper` on the parent lesson’s count')
    /*
     * **The count belongs to the lesson before this one**, and this one says so. What is read
     * here is that the two figures are the parent's own measurement of the same run: a fall is a
     * frame at a rung lower than the one before it, and a deep one reaches the bottom rung.
     */
    const mcss = far.map((r) => r.frame.mcs)
    let falls = 0
    let belowRun = 0
    for (const m of mcss) {
      if (m !== CEILING) belowRun++
      else if (belowRun > 0) { falls++; belowRun = 0 }
    }
    if (belowRun > 0) falls++
    // a deep one is a stretch that reaches the bottom rung, counted as the parent counts it
    const runsOf = (want: number): number => {
      let n = 0
      let prev: number | undefined
      for (const m of mcss) {
        if (m === want && prev !== want) n++
        prev = m
      }
      return n
    }
    expect(drops, 'the excursions this run makes, as the parent counts them').toBe(falls)
    expect(deep, 'and the ones that reach the bottom rung').toBe(runsOf(0))
    expect(deep, 'most of them not reaching it').toBeLessThan(drops! / 2)
  })
})
