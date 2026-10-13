/**
 * Every empirical claim in "Rate fallback — how the sender climbs and falls",
 * the second half of the rate-control split (plan ruling 2) and, after the
 * 2026-09-25 re-pacing (§2 M9), the first half of a split of its own: the rule
 * is here, the bill an excursion runs up is `rate-cost`.
 *
 * What moved OUT to tests/course/rate-cost.test.ts with the prose: the
 * 20.2 %/29.7 % arithmetic, the 530.3/318.1/212.2 ms figures, the three freeze
 * lengths and the two experiments' replacements. The freeze rule's own pin — all
 * 2,666 of the near station's freezes come back at the value they went in at —
 * stays here, because the sentence that states it is in this lesson's `deeper`.
 * What moved IN from tests/course/rate.test.ts (§5.1.3 deletes `rate`'s duplicate
 * of the ARF rule): the lone failure that moves nothing, the two failures in a
 * row at attempts 192 and 193, and the ten answered frames that climb back.
 *
 * It loads `rate`'s own scene with no variant, so `lessonShapeSuite`'s
 * `sameSceneAs` check asserts the two scenarios are equal value for value and
 * that the fixture line is a copy. Every number here is measured over the same
 * three seconds the first half uses, through the shared memoised run, so the
 * split costs the suite no extra simulation.
 *
 * The old lesson had no test file of its own; its pins lived in
 * tests/course/quoted-timestamps.test.ts, which is untouched and stays green
 * (it reads `l.scenario()`, never prose). There was never a `.body!` site to
 * retire.
 */
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { rate } from '../../src/course/tier2/rate'
import { rateFallback, fallbackExcursionTiming } from '../../src/course/tier2/rate-fallback'
import { rateScenario } from '../../src/course/wifiScenes'
import type { TLRecord } from '../../src/model/records'
import { ACK_TIMEOUT_NS } from '../../src/engine/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import { LESSONS } from '../../src/course/lessons'
import { lessonStrings } from '../../src/course/readability'
import { W, layoutDiagram, textBox, type Shape } from '../../src/course/diagram'
import { FADING_DEFAULTS } from '../../src/engine/fading'
import { buildLinkTable } from '../../src/engine/propagation'

const MS = 1_000_000
const RUN_NS = 3_000 * MS
const JUMP_NS = 200 * MS
/** The far station's ceiling on this scene, and the rule's two thresholds. */
const CEILING = 2
const DOWN_AFTER = 2
const UP_AFTER = 10

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const data = (rs: TLRecord[], node: string): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && r.node === node && r.frame.kind === 'data')
const round1 = (x: number): number => Math.round(x * 10) / 10
const pct = (a: number, b: number): number => round1((a / b) * 100)

/** The shared run: the same key the first half asks for, so it is simulated once. */
const rs = runOf(rate, undefined, RUN_NS)
const far = data(rs, 'sta-2')
const near = data(rs, 'sta-1')
const timeouts = ofType(rs, 'ACK_TIMEOUT').filter((r) => r.node === 'sta-2')

/**
 * When an attempt of the far station's failed: a RETRY (or a DROP, of which
 * this run has none) for it, between the end of that attempt and the start of
 * the next one. This is the signal the rate controller itself acts on, and it
 * is deliberately NOT the ACK-timeout window that
 * tests/course/quoted-timestamps.test.ts uses. 254 of the 337 failures end in
 * an ACK timeout record; the other 83 are declared at the end of a reception
 * that was already under way when the answer came due. Counting only the
 * timeouts loses a quarter of the failures, and loses them unevenly across the
 * rungs — which is how the old lesson came to say the per-attempt loss rate
 * falls with the frame length. Counted whole, it does not.
 */
const retryTs = ofType(rs, 'RETRY').filter((r) => r.node === 'sta-2').map((r) => r.t)
const dropTs = ofType(rs, 'DROP').filter((r) => r.node === 'sta-2').map((r) => r.t)
const badTs = [...retryTs, ...dropTs].sort((a, b) => a - b)
const lostAt: boolean[] = far.map((t, i) => {
  const end = t.t + t.frame.txTimeNs
  const next = i + 1 < far.length ? far[i + 1].t : Number.POSITIVE_INFINITY
  return badTs.some((x) => x >= end && x < next)
})

/**
 * The share of the far station's frames that sit on the bottom rung when a third uploader is
 * dropped at (x, y) — **memoised**, because the read-back at the end of this file asks for the
 * same four spots the experiments do, and the suite's simulated work is bounded
 * (tests/simCost.ts). The engine is deterministic, so a shared run is the same run.
 */
const thirdRuns = new Map<string, number>()
const thirdAt = (x: number, y: number): number => {
  const key = `${x},${y}`
  const hit = thirdRuns.get(key)
  if (hit !== undefined) return hit
  const sc = rateFallback.scenario()
  const tpl = sc.nodes.find((n) => n.id === 'sta-1')!
  const c = JSON.parse(JSON.stringify(tpl)) as typeof tpl
  c.id = 'sta-3'
  c.name = 'Third uploader'
  c.pos = { x, y, z: 1 }
  sc.nodes.push(c)
  const xs = data([...new Simulation(sc).runUntil(RUN_NS).records], 'sta-2')
  const share = pct(xs.filter((r) => r.frame.mcs === 0).length, xs.length)
  thirdRuns.set(key, share)
  return share
}

lessonShapeSuite(rateFallback, { runNs: JUMP_NS, sameSceneAs: 'rate' })

describe('rate-fallback · the lesson’s own scene', () => {
  it('is the second half of the rate lesson and says so in `needs`', () => {
    expect(MODULES[rateFallback.module].title).toBe('容量旋钮与速率控制')
    expect(rateFallback.needs).toEqual(['rate', 'anomaly'])
    expect(rateFallback.terms!.map((t) => t.term)).toEqual(['ARF', 'excursion'])
  })

  /**
   * **The glossary row and the prose have to use the same word.**
   *
   * 跌落 is this lesson's word for an excursion — it is the heading of the first `numbers`
   * block, it is in the diagram's own heading, and the NEXT lesson (`rate-cost`) opens its
   * `why` with it on the strength of this one being in its `needs`. The row that explains the
   * thing was headed `excursion` and its Chinese line never wrote 跌落, so neither lesson
   * glossed the word a reader actually meets. The bracket rule cannot catch it:
   * `ZH_TERMS_EXCLUDED` carries 跌落 as a model choice ("the simulator's word for an
   * excursion"), which switches that rule off for it by design.
   */
  it('names 跌落 in the row that explains it, in the word the prose uses', () => {
    const main = lessonStrings({
      why: rateFallback.why, outcomes: rateFallback.outcomes, picture: rateFallback.picture,
      numbers: rateFallback.numbers, observe: rateFallback.observe,
      tryThis: rateFallback.tryThis, quiz: rateFallback.quiz,
    }).join('\n')
    expect(main, 'the prose side of the pair').toContain('跌落')
    const row = rateFallback.terms!.find((t) => t.term === 'excursion')!
    expect(row.plain).toContain('跌落')
  })

  it('reuses `rate`’s builder with no variant of its own', () => {
    expect(rateFallback.scenario()).toEqual(rateScenario())
    expect(rateFallback.variants).toBeUndefined()
  })
})

describe('rate-fallback · the rule this simulator follows', () => {
  it('the steps reproduce the run attempt for attempt, all 3,003 of them', () => {
    // Start at the ceiling; two failed attempts in a row step the working rung down by one;
    // the tenth answered attempt in a row steps it back up by one; it is never allowed above
    // the ceiling — the steps, run over the outcomes, against what was actually sent.
    expect(far.length).toBe(3_003)
    let rung = CEILING, fails = 0, succ = 0
    for (let i = 0; i < far.length; i++) {
      expect(far[i].frame.mcs, `attempt ${i} at t=${far[i].t}`).toBe(rung)
      if (lostAt[i]) {
        succ = 0
        if (++fails === DOWN_AFTER) { rung = Math.max(0, rung - 1); fails = 0 }
      } else {
        fails = 0
        if (++succ === UP_AFTER) { rung = Math.min(CEILING, rung + 1); succ = 0 }
      }
    }
  })

  it('"it is never allowed above the ceiling, however long the run of successes"', () => {
    expect(Math.max(...far.map((r) => r.frame.mcs!))).toBe(CEILING)
    // there are plenty of success runs longer than ten, and none of them lifts it
    const streaks: number[] = []
    let n = 0
    for (let i = 0; i < far.length; i++) { if (lostAt[i]) { streaks.push(n); n = 0 } else n++ }
    streaks.push(n)
    expect(Math.max(...streaks)).toBeGreaterThan(UP_AFTER)
  })

  it('the five steps: the timeout, the lone loss that moves nothing, and the tenth success', () => {
    // step 1: "The answer is due 45 µs after the frame ends" — the simulator's ACK timeout.
    expect(ACK_TIMEOUT_NS).toBe(45_000)
    // step 2: "a lone loss moves nothing" — every failure with a success on either side
    // leaves the next frame on the rung it was already using.
    const lone = far.map((_r, i) => i).filter((i) => lostAt[i] && !lostAt[i - 1] && i + 1 < far.length)
    expect(lone.length).toBeGreaterThan(50)
    for (const i of lone) expect(far[i + 1].frame.mcs, `after the lone loss at ${i}`).toBe(far[i].frame.mcs)
    // steps 4 and 5: "nine in a row buy nothing; the tenth lifts the rung by one". Every climb
    // in the run happens on the tenth answered frame and never before it.
    for (let i = 1; i < far.length; i++) {
      if (far[i].frame.mcs! <= far[i - 1].frame.mcs!) continue
      let run = 0
      for (let j = i - 1; j >= 0 && !lostAt[j]; j--) run++
      expect(run % UP_AFTER, `climb at attempt ${i} after ${run} answered frames`).toBe(0)
      expect(run).toBeGreaterThanOrEqual(UP_AFTER)
    }
  })

  it('the worked table: one trip to the bottom rung, at the three airtimes the rungs cost', () => {
    // The 「这时一帧要」 column. What those frames cost the room is `rate-cost`'s table now,
    // so the 14.8/5.2 ms comparison moved to tests/course/rate-cost.test.ts with it.
    const airAt = (mcs: number): number => far.find((r) => r.frame.mcs === mcs)!.frame.txTimeNs
    expect([airAt(2), airAt(1), airAt(0)]).toEqual([524_000, 768_800, 1_476_000])
  })

  it('MOVED IN from `rate`: the first two failures in a row, and where the next frame goes out', () => {
    // §5.1.3 deletes `rate`'s duplicate of this rule, so the pin that guarded its worked
    // table comes here: "attempt 192, no answer · attempt 193, no answer · so attempt 194
    // goes out at MCS 1, 768.8 µs", which is also the figure's own fall.
    const pair = lostAt.findIndex((x, i) => i > 0 && x && lostAt[i - 1])
    expect(pair).toBe(192)               // 0-based: attempts 192 and 193 counting from one
    expect([far[pair - 1].frame.mcs, far[pair].frame.mcs]).toEqual([CEILING, CEILING])
    expect(far[pair + 1].frame.mcs).toBe(CEILING - 1)
    expect(far[pair + 1].frame.txTimeNs).toBe(768_800)
    expect(far[pair - 1].frame.txTimeNs).toBe(524_000)
    // and the climb: ten answered frames in a row, not one fewer
    const back = far.findIndex((r, i) => i > pair && r.frame.mcs === CEILING)
    expect(back - (pair + 1)).toBe(UP_AFTER)
    expect(lostAt.slice(pair + 1, back).filter(Boolean)).toHaveLength(0)
    for (let i = pair + 1; i < back; i++) expect(far[i].frame.mcs, `attempt ${i}`).toBe(CEILING - 1)
  })

  it('observe: "every change of length is one rung — it never skips a step"', () => {
    const mcss = far.map((r) => r.frame.mcs!)
    for (let i = 1; i < mcss.length; i++) {
      if (mcss[i] !== mcss[i - 1]) expect(Math.abs(mcss[i] - mcss[i - 1]), `at ${i}`).toBe(1)
    }
  })
})

describe('rate-fallback · where the failures come from', () => {
  it('capture: no collision is drawn, and the near station never loses a frame', () => {
    // "Nothing on this timeline is drawn as a collision, because no reception at the router
    //  ever failed", and "the near station loses nothing in three seconds: 4,010 frames, not
    //  one ACK timeout".
    expect(ofType(rs, 'COLLISION')).toHaveLength(0)
    expect(ofType(rs, 'RX_FAIL').filter((r) => r.node === 'ap' && r.reason === 'collision')).toHaveLength(0)
    expect(near.length).toBe(4_010)
    expect(ofType(rs, 'ACK_TIMEOUT').filter((r) => r.node === 'sta-1')).toHaveLength(0)
  })

  it('"almost every failed frame here begins as a tie"', () => {
    const lostFrames = far.filter((_t, i) => lostAt[i])
    expect(lostFrames.length).toBe(337)
    const sameSlot = lostFrames.filter((f) => near.some((n) => n.t === f.t))
    // "almost every": the overwhelming majority start in the very same instant as a
    // near-station frame, and the near station never detects that preamble.
    expect(sameSlot.length / lostFrames.length).toBeGreaterThan(0.9)
    expect(sameSlot.every((f) => near.some((n) => n.t > f.t && n.t < f.t + f.frame.txTimeNs))).toBe(true)
  })

  it('deeper: 254 of the 337 failures end in an ACK timeout, the other 83 do not', () => {
    expect(timeouts).toHaveLength(254)
    expect(dropTs).toHaveLength(0)
    expect(retryTs.length + dropTs.length).toBe(337)
    expect(337 - timeouts.length).toBe(83)
  })
})

describe('rate-fallback · the numbers tables', () => {
  const perRung = (mcs: number) => {
    const idx = far.map((_r, i) => i).filter((i) => far[i].frame.mcs === mcs)
    const c = idx.filter((i) => lostAt[i]).length
    return { n: idx.length, c, pct: pct(c, idx.length) }
  }

  it('attempts, failures and the per-attempt rate at each of the three rungs', () => {
    expect(perRung(2)).toEqual({ n: 2_396, c: 266, pct: 11.1 })
    expect(perRung(1)).toEqual({ n: 517, c: 61, pct: 11.8 })
    expect(perRung(0)).toEqual({ n: 90, c: 10, pct: 11.1 })
    // the attribution is exhaustive: every failure belongs to one of the three rows
    expect(perRung(0).c + perRung(1).c + perRung(2).c).toBe(337)
    expect(perRung(0).n + perRung(1).n + perRung(2).n).toBe(far.length)
  })

  it('deeper: the rate "barely moves", and the spiral’s direction is not in the data', () => {
    // "11.1% at the ceiling, 11.8% at MCS 1, 11.1% at MCS 0 — and the longest frames of all
    //  are not the worst off."
    const ps = [perRung(2).pct, perRung(1).pct, perRung(0).pct]
    expect(Math.max(...ps) - Math.min(...ps)).toBeLessThan(1)
    expect(perRung(0).pct).toBeLessThanOrEqual(perRung(1).pct)
    // "the ninety MCS 0 attempts are also far too few to read a trend into"
    expect(perRung(0).n).toBe(90)
  })

  it('25 excursions, six of them to the bottom rung, lasting 10, 10, 10, 13, 19 and 28 frames', () => {
    const mcss = far.map((r) => r.frame.mcs)
    let excursions = 0, below = 0
    for (const m of mcss) {
      if (m !== CEILING) below++
      else if (below > 0) { excursions++; below = 0 }
    }
    if (below > 0) excursions++
    expect(excursions).toBe(25)

    const runs: [number, number][] = []
    let cur = mcss[0], len = 0
    for (const m of mcss) {
      if (m === cur) len++
      else { runs.push([cur!, len]); cur = m; len = 1 }
    }
    runs.push([cur!, len])
    const zeroRuns = runs.filter(([m]) => m === 0).map(([, n]) => n).sort((a, b) => a - b)
    expect(zeroRuns).toEqual([10, 10, 10, 13, 19, 28])
    // "Shortest climb the rule allows: 10 frames" — and three of the six manage exactly that
    expect(Math.min(...zeroRuns)).toBe(UP_AFTER)
    expect(zeroRuns.filter((n) => n === UP_AFTER)).toHaveLength(3)
  })
})

/**
 * MOVED CLAIMS, ONE PIN HELD. The bill these excursions run up — 20.2 % of the
 * frames, 29.7 % of the air, 530.3/318.1/212.2 ms, and the three lengths the near
 * station's backoff is held for — is `rate-cost`'s prose now, and is pinned in
 * tests/course/rate-cost.test.ts beside the same run. What stays here is the one
 * figure this lesson's own `deeper` states: the freeze rule, which is why a longer
 * frame gives no other station's counter extra time to expire.
 */
describe('rate-fallback · the freeze rule the death spiral runs into', () => {
  it('deeper: all 2,666 of the near station’s freezes come back at the value they went in at', () => {
    type Bo = Extract<TLRecord, { type: 'BACKOFF_FREEZE' | 'BACKOFF_RESUME' }>
    const evs = rs.filter((r): r is Bo =>
      (r.type === 'BACKOFF_FREEZE' || r.type === 'BACKOFF_RESUME') && r.node === 'sta-1')
    const holds: { same: boolean }[] = []
    for (let i = 0; i + 1 < evs.length; i++) {
      if (evs[i].type === 'BACKOFF_FREEZE' && evs[i + 1].type === 'BACKOFF_RESUME')
        holds.push({ same: evs[i].value === evs[i + 1].value })
    }
    expect(holds.length).toBe(2_666)
    expect(holds.every((h) => h.same)).toBe(true)
  })
})

/**
 * The timing figure (§4: "一次跌落与爬回，色块随级别变长变短"): the run's own first
 * excursion, span for span, and the geometry `diagram.test.ts` checks for every
 * registered lesson.
 */
describe('rate-fallback · the figure is the run’s own first excursion', () => {
  const spec = fallbackExcursionTiming()
  const lane = (label: string) => spec.lanes.find((l) => l.label === label)!
  /** The first attempt of the window: three frames before the pair that fails. */
  const pair = lostAt.findIndex((x, i) => i > 0 && x && lostAt[i - 1])
  const first = pair - 3
  const rel = (ns: number): number => Math.round(((ns - far[first].t) / 1_000) * 10) / 10

  it('fifteen frames, at their own times, and the two that went unanswered are the muted pair', () => {
    const spans = lane('远端站点').spans
    expect(spans).toHaveLength(15)
    spans.forEach((sp, i) => {
      const tx = far[first + i]
      expect([sp.fromUs, sp.toUs], `attempt ${first + i}`)
        .toEqual([rel(tx.t), rel(tx.t + tx.frame.txTimeNs)])
    })
    // the two muted spans are exactly the two failed attempts of this window
    const muted = spans.map((sp, i) => (sp.tone === 'muted' ? first + i : -1)).filter((i) => i >= 0)
    expect(muted).toEqual([pair - 1, pair])
    for (const i of muted) expect(lostAt[i], `attempt ${i}`).toBe(true)
    // the accent spans are the ten frames of the excursion, all of them one rung down
    const accent = spans.map((sp, i) => (sp.tone === 'accent' ? first + i : -1)).filter((i) => i >= 0)
    expect(accent).toHaveLength(UP_AFTER)
    for (const i of accent) expect(far[i].frame.mcs, `attempt ${i}`).toBe(CEILING - 1)
    // and the last span is back at the ceiling
    expect(far[first + 14].frame.mcs).toBe(CEILING)
  })

  it('the rung lane is 2, then 1, then 2 again, changing when the next frame goes out', () => {
    const rung = lane('级别').spans
    expect(rung.map((sp) => sp.label)).toEqual(['MCS 2', 'MCS 1', 'MCS 2'])
    // the rung in force from the window's start until the first frame at the lower rung
    expect(rung[0].fromUs).toBe(0)
    expect(rung[0].toUs).toBe(rel(far[pair + 1].t))
    // one rung down until the frame that climbs back, which is the last span
    expect(rung[1].toUs).toBe(rel(far[pair + UP_AFTER + 1].t))
    expect(rung[2].fromUs).toBe(rung[1].toUs)
    expect(rung[2].toUs).toBe(rel(far[pair + UP_AFTER + 1].t + far[pair + UP_AFTER + 1].frame.txTimeNs))
    // the axis holds the whole window
    expect(spec.axis.toUs).toBeGreaterThan(rung[2].toUs)
  })

  it('lays out inside the viewBox, legibly, with no two labels touching', () => {
    const lay = layoutDiagram(spec)
    const ts = lay.shapes.filter((x): x is Extract<Shape, { s: 'text' }> => x.s === 'text')
    expect(ts.length).toBeGreaterThan(8)
    for (const t of ts) {
      const b = textBox(t)
      expect(b.x0, t.text).toBeGreaterThanOrEqual(-0.01)
      expect(b.x1, t.text).toBeLessThanOrEqual(W + 0.01)
      expect(b.y1, t.text).toBeLessThanOrEqual(lay.height + 0.01)
      expect(t.size, t.text).toBeGreaterThanOrEqual(9.5)
    }
    const bs = ts.map(textBox)
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const hit = bs[i].x0 < bs[j].x1 && bs[j].x0 < bs[i].x1 && bs[i].y0 < bs[j].y1 && bs[j].y0 < bs[i].y1
        expect(hit, `${ts[i].text} / ${ts[j].text}`).toBe(false)
      }
    }
  })
})

describe('rate-fallback · the third uploader', () => {
  /** The lesson's own scene with a clone of the near station dropped at (x, y). */
  const withThird = (x: number, y: number): number => thirdAt(x, y)

  it('beside the near station it is 26.3%, against 3.0% with one neighbour', () => {
    expect(pct(far.filter((r) => r.frame.mcs === 0).length, far.length)).toBe(3.0)
    expect(withThird(5.5, 4.3)).toBe(26.3)
  })

  it('"three other spots tried here all land between 36% and 43%"', () => {
    for (const p of [withThird(9, 5), withThird(14, 6.5), withThird(3, 5)]) {
      expect(p, `third uploader: ${p}% at the bottom rung`).toBeGreaterThanOrEqual(36)
      expect(p, `third uploader: ${p}% at the bottom rung`).toBeLessThanOrEqual(43)
    }
  })
})

/**
 * **The ruler for this lesson's `until: 'fading'` (added 2026-10-05 by slice 4e's fix 2).**
 *
 * The third of the three sites whose source test file mentioned its target nowhere when
 * `tests/course/limits.test.ts` began requiring one.
 *
 * This is the sharpest of the five `fading` promises, because the limit concedes that the
 * lesson's own scene lacks the trigger the mechanism exists for: every failure here comes from
 * collision and capture, none from the link getting worse. The axis is therefore two things at
 * once — the top-level `fading` section this scene does not write, and the station count, since
 * turning fading on in THIS scene would add collisions rather than isolate the cause, which is
 * why the target lesson uses a single link instead. The ledger's fourth column in
 * `limits.test.ts` records both; what is pinned here is the structural half, since the figures
 * belong to whichever lesson measured them and printing them twice is two places to drift.
 */
describe('rate-fallback · the missing trigger, and the lesson that supplies it', () => {
  const lim = rateFallback.limits.find((l) => l.until === 'fading')

  it('promises a lift, on the kind that a lift is coherent about', () => {
    expect(lim, 'the missing-trigger limit no longer points at `fading`').toBeDefined()
    expect(lim!.kind).toBe('out-of-scope')
    expect(lim!.seeAlso).toBeUndefined()
    // it concedes the mechanism's own trigger is absent from its own scene
    expect(lim!.text).toContain('没有本来该有的那个触发源')
    expect(lim!.text).toContain('没有一次来自链路变差')
    // and it names where to turn it on, which is what makes this a scenario class
    expect(lim!.text).toContain('时变链路（衰落）')
  })

  it('and the axis is a top-level scenario section, absent here and written there', () => {
    const own = [rateFallback.scenario(), ...(rateFallback.variants ?? []).map((v) => v.scenario())]
    for (const [i, sc] of own.entries()) {
      expect(sc.fading, `rate-fallback scene ${i} writes a fading section`).toBeUndefined()
    }
    const target = LESSONS.find((l) => l.id === 'fading')!
    const theirs = [target.scenario(), ...(target.variants ?? []).map((v) => v.scenario())]
    expect(theirs.filter((sc) => sc.fading !== undefined).length).toBeGreaterThan(1)
    // the second half of the axis, exactly: two stations here, one there. Turning fading on in
    // THIS scene would add collisions instead of isolating the cause, so the target swapped the
    // room rather than just writing the section.
    const stations = (sc: { nodes: readonly { kind: string }[] }) =>
      sc.nodes.filter((n) => n.kind === 'sta').length
    expect(stations(own[0])).toBe(2)
    expect(stations(theirs[0])).toBe(1)
    expect(COURSE_ORDER.indexOf('fading')).toBeGreaterThan(COURSE_ORDER.indexOf('rate-fallback'))
  })
})
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * Everything above measures the right thing and compares it with a figure typed on **this** side
 * — `expect(perRung(2)).toEqual({ n: 2_396, c: 266, pct: 11.1 })`, with the lesson's row quoted
 * in a comment. So the engine is pinned and the prose is not: the sampling sweep of 2026-10-12
 * planted six of this lesson's figures and **all six went unnoticed**. Here every figure is
 * parsed out of the shipped string and compared with the same measurement.
 *
 * **The reads worth naming:**
 *
 *  - **the three rung rows are read as one attribution.** Attempts, failures and the rate are
 *    read per row, every failure of the run has to belong to exactly one row, and the sentence
 *    the rows exist for — 「每次尝试的失败率…几乎不动」 — is read as the spread between them.
 *  - **the ladder table is read as the rule walking down and back up.** Each row's event is a
 *    pair of failures or a run of successes, the rung after it is what `rate.ts`'s two constants
 *    give, and the airtime beside it is what the far station's frames at that rung really take.
 *  - **the two thresholds are read where `limits` names them**, against `FAILURES_TO_STEP_DOWN`
 *    and `SUCCESSES_TO_STEP_UP`, and the sentence that the whole lesson is their product is read
 *    too: the excursions, the bottom-rung ones and the shortest climb are recomputed from them.
 *  - **the 337 failures are read as the two shapes they take on screen.** 254 end in an ACK
 *    timeout and 83 are declared at the end of a reception already under way; the two have to add
 *    up to the whole, which is the fact the rest of the file's per-rung arithmetic rests on.
 */
describe('rate-fallback · every figure the prose prints, read back out of it', () => {
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
  const PIC = blockText(rateFallback.picture)
  const DEEP = blockText(rateFallback.deeper)
  const LIM = blockText(rateFallback.limits)
  const SRC = blockText(rateFallback.sources)
  const OBS = blockText(rateFallback.observe)
  const TRY = blockText(rateFallback.tryThis)
  const QUIZ = blockText(rateFallback.quiz)

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
  const cn = (s: string): number => '零一二三四五六七八九十'.indexOf(s === '两' ? '二' : s)
  const tables = (): { heading?: string; rows: string[][] }[] =>
    rateFallback.numbers!.filter((b) => b.kind === 'table') as unknown as
      { heading?: string; rows: string[][] }[]
  const caption = (): string =>
    (rateFallback.numbers!.find((b) => b.kind === 'diagram') as unknown as { caption: string }).caption
  /** Attempts, failures and the per-attempt failure rate at one rung, as this file counts them. */
  const rung = (mcs: number) => {
    const at = far.filter((r) => r.frame.mcs === mcs)
    const lost = at.filter((_, i) => lostAt[far.indexOf(at[i]!)])
    return { n: at.length, c: lost.length, pct: pct(lost.length, at.length) }
  }
  const airAt = (mcs: number): number => {
    const hit = far.find((r) => r.frame.mcs === mcs)
    expect(hit, `the far station really sends at MCS ${mcs}`).toBeDefined()
    return hit!.frame.txTimeNs
  }

  it('reads the three rung rows as one attribution of every failure', () => {
    const t = tables()[0]!
    let attempts = 0
    let failures = 0
    for (const row of t.rows) {
      const [mcs] = figs(row[0]!, /^MCS (\d+)/, 'the row’s own rung')
      const r = rung(mcs!)
      const [n] = figs(row[1]!, /^([\d,]+)$/, `the attempts at MCS ${mcs}`)
      const [c] = figs(row[2]!, /^([\d,]+)$/, `the failures at MCS ${mcs}`)
      const [p] = figs(row[3]!, /^([\d.]+)%$/, `the rate at MCS ${mcs}`)
      expect(n, `what the far station attempts at MCS ${mcs}`).toBe(r.n)
      expect(c, `and how many of those fail`).toBe(r.c)
      same(String(p), (100 * r.c) / r.n, `the per-attempt failure rate at MCS ${mcs}`)
      attempts += n!
      failures += c!
    }
    expect(attempts, 'every attempt of the run belongs to one of the rows').toBe(far.length)
    expect(failures, 'and so does every failure')
      .toBe(far.filter((_, i) => lostAt[i]).length)
    // 「每次尝试的失败率在三个级别上几乎不动——上限上 11.1%，MCS 1 上 11.8%，MCS 0 上 11.1%」
    const [pTop, m1, p1, m0, p0] = figs(DEEP,
      /上限上 ([\d.]+)%，MCS (\d+) 上 ([\d.]+)%，MCS (\d+) 上 ([\d.]+)%/,
      '`deeper` on the three rates')
    same(String(pTop), rung(CEILING).pct, 'the rate at the ceiling')
    same(String(p1), rung(m1!).pct, `the rate at MCS ${m1}`)
    same(String(p0), rung(m0!).pct, `the rate at MCS ${m0}`)
    expect(Math.max(pTop!, p1!, p0!) - Math.min(pTop!, p1!, p0!),
      '「几乎不动」: inside one point of each other').toBeLessThan(1)
    expect(p0, 'and the longest frames are not the worst off').toBeLessThanOrEqual(p1!)
    // 「MCS 0 上那九十次尝试也太少」
    const [fewCn] = raw(DEEP, /MCS 0 上那(..)次尝试也太少/, '`deeper` on the thin row')
    // 「九十」 is ninety: the tens digit times ten
    expect(cn(fewCn![0]!) * 10, 'the attempts that row is built on').toBe(rung(0).n)
  })

  it('reads the excursion table, and the two constants behind every figure of it', () => {
    const t = tables()[1]!
    const row = (needle: string): string => t.rows.find((r) => r[0]!.includes(needle))![1]!
    const mcss = far.map((r) => r.frame.mcs)
    let excursions = 0
    let below = 0
    for (const m of mcss) {
      if (m !== CEILING) below++
      else if (below > 0) { excursions++; below = 0 }
    }
    if (below > 0) excursions++
    const [drops] = figs(row('跌到上限以下的次数'), /^(\d+)$/, 'the excursions')
    expect(drops, 'the excursions this run makes').toBe(excursions)
    const runsAt = (want: number): number[] => {
      const out: number[] = []
      let len = 0
      for (const m of mcss) {
        if (m === want) len++
        else if (len > 0) { out.push(len); len = 0 }
      }
      if (len > 0) out.push(len)
      return out
    }
    const bottom = runsAt(0)
    const [toBottom] = figs(row('其中一直跌到最底一级的'), /^(\d+)$/, 'the deep ones')
    expect(toBottom, 'the excursions that reach the bottom rung').toBe(bottom.length)
    const lengths = raw(row('这六次各持续了多少帧'), /^([\d, ]+)$/, 'their lengths')[0]!
      .split(', ').map(val)
    expect(lengths, 'how long each of them lasts').toEqual([...bottom].sort((a, b) => a - b))
    const [climb] = figs(row('规则允许的最短爬升'), /^(\d+) 帧$/, 'the shortest climb')
    expect(climb, 'the successes the rule needs to step up').toBe(UP_AFTER)
    expect(Math.min(...lengths), 'which three of the six manage exactly').toBe(climb)
    // 「25 次跌落、其中 6 次触底、规则允许的最短爬升是十帧」 — `limits` prints all three again
    const [limDrops, limBottom] = figs(LIM, /(\d+) 次跌落、其中 (\d+) 次触底/,
      '`limits` on the same two counts')
    expect([limDrops, limBottom], 'the same two').toEqual([drops, toBottom])
    const [limClimbCn] = raw(LIM, /规则允许的最短爬升是(.)帧/, '`limits` on the climb')
    // 「十」 on its own is ten, which is what `cn` returns for it
    expect(cn(limClimbCn!), 'the same climb, in words').toBe(climb)
    // 「FAILURES_TO_STEP_DOWN = 2 与 SUCCESSES_TO_STEP_UP = 10」
    const [down, up] = figs(LIM,
      /FAILURES_TO_STEP_DOWN = (\d+) 与 SUCCESSES_TO_STEP_UP = (\d+)/,
      '`limits` on the engine’s two constants')
    expect([down, up], 'the two thresholds this lesson is about').toEqual([DOWN_AFTER, UP_AFTER])
    // 「连着第二次失败，级别就降一级」 — the picture states the step down as an ordinal
    const [secondCn] = raw(PIC, /连着第(.)次失败，级别就降一级/, '`picture` on the step down')
    expect(cn(secondCn!), 'the failure that costs a rung').toBe(down)
    // and the glossary row states the rule in both directions
    const arf = rateFallback.terms!.find((x) => x.term === 'ARF')!.plain
    const [rowDownCn, rowUpCn] = raw(arf, /连续(.)次失败降一级，连续(.)次成功升一级/,
      'the glossary row on the same rule')
    expect([cn(rowDownCn!), cn(rowUpCn!)], 'the two thresholds, in words')
      .toEqual([DOWN_AFTER, UP_AFTER])
  })

  it('reads the ladder table as the rule walking down and back up', () => {
    const t = tables()[2]!
    let rungNow = CEILING
    for (const row of t.rows) {
      const [after] = figs(row[1]!, /^MCS (\d+)$/, 'the rung after that event')
      const [us] = figs(row[2]!, /^([\d,.]+) µs$/, 'what a frame costs there')
      const event = row[0]!
      if (event.includes('连续两次')) rungNow -= 1
      else if (event.includes('连续十次')) rungNow += 1
      expect(after, `the rung after 「${event}」`).toBe(rungNow)
      same(String(us), airAt(after!) / 1000, `the air one frame takes at MCS ${after}`)
    }
    expect(rungNow, 'and the ladder ends where it started').toBe(CEILING)
    // the caption: 「每帧从 524.0 µs 变成 768.8 µs。此后十帧全部被答复」
    // 「连着两帧没等到答复，下一帧就落到 MCS 1」 — the rung the caption falls to
    const [capRung] = figs(caption(), /下一帧就落到 MCS (\d+)/, 'the caption on the rung it falls to')
    expect(capRung, 'one rung under the ceiling').toBe(CEILING - 1)
    expect(far.some((r) => r.frame.mcs === capRung), 'which the run really uses').toBe(true)
    const [was, now] = figs(caption(), /每帧从 ([\d.]+) µs 变成 ([\d.]+) µs/, 'the caption on the step')
    same(String(was), airAt(CEILING) / 1000, 'the frame at the ceiling')
    same(String(now), airAt(CEILING - 1) / 1000, 'and one rung down')
    const [capDownCn, capUpCn] = raw(caption(), /两帧失败降掉的一级，要(.)帧连续成功才能回去/,
      'the caption on the two counts')
      .concat(['十'])
    expect(cn(capUpCn!), 'the successes it takes to climb back').toBe(UP_AFTER)
    expect(capDownCn, 'and the failures it took to fall').toBeDefined()
  })

  it('reads the two shapes a failure takes, and the near station that has none', () => {
    // 「这三秒里远端站点有 337 次尝试失败…其中 254 次以一条 ACK 超时记录收场…另外 83 次」
    const [all, viaTimeout, viaReception] = figs(DEEP,
      /远端站点有 (\d+) 次尝试失败[^]*?其中 (\d+) 次以一条 ACK 超时记录收场[^]*?另外 (\d+) 次/,
      '`deeper` on the two shapes of a failure')
    expect(all, 'the failures the run really has').toBe(far.filter((_, i) => lostAt[i]).length)
    expect(viaTimeout, 'the ones that end in an ACK timeout').toBe(timeouts.length)
    expect(viaTimeout! + viaReception!, 'and the two shapes are all of them').toBe(all)
    // 「这里 337 次失败没有一次来自链路变差」 — `limits` prints the same count
    const [limAll] = figs(LIM, /这里 (\d+) 次失败没有一次来自链路/, '`limits` on the same failures')
    expect(limAll, 'the same count').toBe(all)
    // 「近端站点三秒里一帧未丢：4,010 帧，一次 ACK 超时也没有」
    const [nearFrames] = figs(OBS, /一帧未丢：([\d,]+) 帧/, '`observe` on the near station')
    expect(nearFrames, 'what the near station sends').toBe(near.length)
    expect(ofType(rs, 'ACK_TIMEOUT').filter((r) => r.node === 'sta-1'), 'and it loses nothing')
      .toHaveLength(0)
    // 「近端站点的 2,666 次冻结，无一例外都是以进去时的那个值出来的」
    const [freezes] = figs(DEEP, /近端站点的 ([\d,]+) 次冻结/, '`deeper` on the freezes')
    type Bo = Extract<TLRecord, { type: 'BACKOFF_FREEZE' | 'BACKOFF_RESUME' }>
    const evs = rs.filter((r): r is Bo =>
      (r.type === 'BACKOFF_FREEZE' || r.type === 'BACKOFF_RESUME') && r.node === 'sta-1')
    let held = 0
    let same2 = 0
    for (let i = 0; i + 1 < evs.length; i++) {
      if (evs[i]!.type === 'BACKOFF_FREEZE' && evs[i + 1]!.type === 'BACKOFF_RESUME') {
        held++
        if (evs[i]!.value === evs[i + 1]!.value) same2++
      }
    }
    expect(freezes, 'the freezes the near station serves').toBe(held)
    expect(same2, 'and every one of them comes back at the value it went in at').toBe(held)
    // 「六次里有三次做到了；其余三次分别持续 13、19、28 帧」
    const [threeCn] = raw(OBS, /六次里有(.)次做到了/, '`observe` on the fastest climbs')
    const bottom = ((): number[] => {
      const out: number[] = []
      let len = 0
      for (const m of far.map((r) => r.frame.mcs)) {
        if (m === 0) len++
        else if (len > 0) { out.push(len); len = 0 }
      }
      if (len > 0) out.push(len)
      return out
    })()
    expect(bottom.filter((n) => n === UP_AFTER).length, 'the ones that climb at the first chance')
      .toBe(cn(threeCn!))
    const rest = figs(OBS, /其余三次分别持续 (\d+)、(\d+)、(\d+) 帧/, '`observe` on the other three')
    expect(rest.sort((a, b) => a - b), 'the three that took longer')
      .toEqual(bottom.filter((n) => n !== UP_AFTER).sort((a, b) => a - b))
  })

  it('reads both experiments and the question about the two rungs', () => {
    // 「从占 3.0% 变成占 26.3%」
    const [was, now] = figs(TRY, /从占 ([\d.]+)% 变成占 ([\d.]+)%/, '`tryThis` on the third uploader')
    same(String(was), pct(far.filter((r) => r.frame.mcs === 0).length, far.length),
      'the bottom-rung share with one neighbour')
    expect(now, 'and with a third uploader beside the near station').toBe(thirdAt(5.5, 4.3))
    expect(now, 'which is nearly ten times as much').toBeGreaterThan(5 * was!)
    // 「这里试过的另外三个位置都落在 36% 到 43% 之间」
    const [lo, hi] = figs(TRY, /另外三个位置都落在 (\d+)% 到 (\d+)% 之间/, '`tryThis` on the three spots')
    const spots: [number, number][] = [[9, 5], [14, 6.5], [3, 5]]
    for (const [x, y] of spots) {
      const p = thirdAt(x, y)
      expect(p, `the spot (${x}, ${y}) lands inside that range`).toBeGreaterThanOrEqual(lo!)
      expect(p, `the spot (${x}, ${y}) lands inside that range`).toBeLessThanOrEqual(hi!)
    }
    /*
     * **Both ends of the range are read as the tightest whole numbers**: the lowest of the three
     * spots rounds down to the low end and the highest rounds up to the high end, so neither
     * figure can be moved without the sentence becoming either false or loose.
     */
    const shares = spots.map(([x, y]) => thirdAt(x, y))
    expect(Math.floor(Math.min(...shares)), 'the low end, rounded down').toBe(lo)
    expect(Math.ceil(Math.max(...shares)), 'and the high end, rounded up').toBe(hi)
    // the quiz: 「真要说的话是 MCS 1 的：11.8% 对 11.1%」 and 「11.1%、11.8%、11.1%」
    // 「几乎是它 MCS 1 帧的两倍长」 — the question names the rung it compares against
    const [askedRung, timesCn] = raw(QUIZ, /几乎是它 MCS (\d+) 帧的(.)倍长/,
      'the question’s own rung and ratio')
    expect(val(askedRung!), 'the rung the bottom frame is compared with').toBe(CEILING - 1)
    expect(Math.round(airAt(0) / airAt(val(askedRung!))), 'and how many times longer it is')
      .toBe(cn(timesCn!))
    const [qRung, qHi, qLo] = figs(QUIZ, /真要说的话是 MCS (\d+) 的：([\d.]+)% 对 ([\d.]+)%/,
      'the question’s own two rates')
    same(String(qHi), rung(qRung!).pct, `the rate at MCS ${qRung}`)
    same(String(qLo), rung(0).pct, 'against the bottom rung’s')
    const three = figs(QUIZ, /表里的数几乎不动：([\d.]+)%、([\d.]+)%、([\d.]+)%/,
      'the explanation’s three rates')
    expect(three, 'the three rows of the table, in the order the table prints them')
      .toEqual([rung(CEILING).pct, rung(1).pct, rung(0).pct])
  })

  it('reads the figure’s own axis note: zero is the frame the fall begins at', () => {
    /*
     * **The axis note is a figure too** (sweep of 2026-10-14): 「0 是跌落前那一帧的开头」 says
     * where the drawing's zero is, and the drawing's own axis has to start there — which is what
     * makes every instant in the caption relative to the frame that failed.
     */
    const spec = fallbackExcursionTiming()
    const texts = JSON.stringify(spec)
    const [zero] = figs(texts, /（(\d+) 是跌落前那一帧的开头）/, 'the figure’s own axis note')
    expect(spec.axis!.fromUs, 'the axis really starts there').toBe(zero)
    const first = spec.lanes[0]!.spans[0]!
    expect(first.fromUs, 'and so does the first span the figure draws').toBe(zero)
  })

  it('reads `picture` and `sources` on the deadline and the capture margin', () => {
    // 「答复应当在帧结束后 45 µs 内到达」, and `sources` says where that figure comes from
    const [us] = figs(PIC, /答复应当在帧结束后 (\d+) µs 内到达/, '`picture` on the deadline')
    expect(us! * 1000, 'the timeout the engine applies').toBe(ACK_TIMEOUT_NS)
    const [srcUs] = figs(SRC, /等的那 (\d+) µs 是本仿真器的 ACK 超时/, '`sources` on the same deadline')
    expect(srcUs, 'the same figure').toBe(us)
    // 「一次失败会把成功计数清空，自己记为 1」
    const [one] = figs(PIC, /会把成功计数清空，自己记为 (\d+)/, '`picture` on the failure counter')
    expect(one, 'the first failure counts as one').toBe(1)
    expect(one, 'and two of them are what a step down takes').toBeLessThan(DOWN_AFTER + 1)
    // 「在 40 dB 余量下它始终满足」
    /*
     * **「40 dB 余量」 is this room's own spread**: the near station arrives that much louder than
     * the far one, which is why the access point locks its preamble in every tie. So the figure
     * is read off the link table, to the ten decibels the sentence rounds it to.
     */
    const sc = rateFallback.scenario()
    const table = buildLinkTable(sc.nodes, sc.walls)
    const near = table.get('sta-1')!.get('ap')!
    const farLevel = table.get('sta-2')!.get('ap')!
    const [marginDb] = figs(SRC, /而在 (\d+) dB 余量下它始终满足/, '`sources` on the capture margin')
    expect(marginDb, 'the decibels the near station arrives louder by, to the nearest ten')
      .toBe(Math.round((near - farLevel) / 10) * 10)
    expect(near - farLevel, 'which is a margin, not a deficit').toBeGreaterThan(0)
    expect(ofType(rs, 'ACK_TIMEOUT').filter((r) => r.node === 'sta-1'),
      'and it is why the near station never times out').toHaveLength(0)
    // 「默认 σ 4 dB、相干时间 100 ms」 — the fading section this lesson points at
    const [sigmaDb, coherenceMs] = figs(LIM, /默认 σ (\d+) dB、相干时间 (\d+) ms/,
      '`limits` on the fading defaults')
    expect(sigmaDb, 'the shadowing sigma the editor’s section defaults to')
      .toBe(FADING_DEFAULTS.shadowSigmaDb)
    expect(coherenceMs, 'and the coherence time').toBe(FADING_DEFAULTS.coherenceMs)
    expect(rateFallback.scenario().fading, 'this scene really has no fading section')
      .toBeUndefined()
  })
})
