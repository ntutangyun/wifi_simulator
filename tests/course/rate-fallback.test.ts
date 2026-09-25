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
import { MODULES } from '../../src/course/curriculum'
import { W, layoutDiagram, textBox, type Shape } from '../../src/course/diagram'

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

lessonShapeSuite(rateFallback, { runNs: JUMP_NS, sameSceneAs: 'rate' })

describe('rate-fallback · the lesson’s own scene', () => {
  it('is the second half of the rate lesson and says so in `needs`', () => {
    expect(MODULES[rateFallback.module].title).toBe('容量旋钮与速率控制')
    expect(rateFallback.needs).toEqual(['rate', 'anomaly'])
    expect(rateFallback.terms!.map((t) => t.term)).toEqual(['ARF', 'excursion'])
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
  const withThird = (x: number, y: number): number => {
    const sc = rateFallback.scenario()
    const tpl = sc.nodes.find((n) => n.id === 'sta-1')!
    const c = JSON.parse(JSON.stringify(tpl)) as typeof tpl
    c.id = 'sta-3'
    c.name = 'Third uploader'
    c.pos = { x, y, z: 1 }
    sc.nodes.push(c)
    const xs = data([...new Simulation(sc).runUntil(RUN_NS).records], 'sta-2')
    return pct(xs.filter((r) => r.frame.mcs === 0).length, xs.length)
  }

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
