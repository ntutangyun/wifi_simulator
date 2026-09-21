/**
 * Every empirical claim in "Rate control — picking how fast to talk", measured
 * against the lesson's own scene.
 *
 * The lesson was 2 009 words and became two (plan ruling 2): this half owns the
 * ceiling, the three rungs the far station uses and the near station that never
 * has to choose; `rate-fallback` owns the loop itself and what it costs the
 * room. Neither half changes `rateScenario`, so the recorded hash is untouched.
 *
 * The old lesson had no test file of its own: its pins lived in
 * tests/course/quoted-timestamps.test.ts (the airtimes, the excursions, the
 * loss rates, the freezes, the two experiments) and one shape check in
 * tests/course/lessons.test.ts. Those files are untouched and stay green — they
 * read `l.scenario()` only, never prose. What is pinned here is what this
 * half's own sentences say. There was never a `.body!` site to retire.
 */
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { rate } from '../../src/course/tier2/rate'
import { rateScenario } from '../../src/course/wifiScenes'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** The three seconds every number in this lesson is measured over. */
const RUN_NS = 3_000 * MS
/** Long enough for all three jump targets; the shape suite asks for no more. */
const JUMP_NS = 200 * MS

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const data = (rs: TLRecord[], node: string): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && r.node === node && r.frame.kind === 'data')
const pct = (a: number, b: number): number => Math.round((a / b) * 1000) / 10

lessonShapeSuite(rate, { proseMax: 700, runNs: JUMP_NS })

describe('rate · the lesson’s own scene', () => {
  it('is the Tier 2 rate lesson, and names the lessons its words come from', () => {
    expect(rate.module).toBe(3)
    expect(rate.needs).toEqual(['decode-thresholds', 'retries-queues', 'bianchi-vs-sim', 'width'])
    // MCS is decode-thresholds' word, ACK and ACK timeout come through retries-queues;
    // these three are this lesson's own.
    expect(rate.terms!.map((t) => t.term)).toEqual(['ceiling', 'attempt'])
  })

  it('keeps the scenario builder untouched, and has no variants', () => {
    expect(rate.scenario()).toEqual(rateScenario())
    expect(rate.variants).toBeUndefined()
    expect(() => ScenarioSchema.parse(rate.scenario())).not.toThrow()
  })

  it('"two stations upload flat out": one beside the router, one behind a brick wall', () => {
    const sc = rate.scenario()
    const near = sc.nodes.find((n) => n.id === 'sta-1')!
    const far = sc.nodes.find((n) => n.id === 'sta-2')!
    const ap = sc.nodes.find((n) => n.id === 'ap')!
    expect([near.profiles, far.profiles]).toEqual([['saturated'], ['saturated']])
    // "a metre from the router" / "in the far corner"
    expect(Math.round(Math.hypot(near.pos.x - ap.pos.x, near.pos.y - ap.pos.y))).toBe(1)
    expect(Math.hypot(far.pos.x - ap.pos.x, far.pos.y - ap.pos.y)).toBeGreaterThan(10)
    expect(sc.walls.length).toBeGreaterThan(0)
  })
})

describe('rate · the far station’s three rungs', () => {
  const far = data(runOf(rate, undefined, RUN_NS), 'sta-2')
  const atRung = (mcs: number): Tx => far.find((r) => r.frame.mcs === mcs)!
  const share = (mcs: number): number => pct(far.filter((r) => r.frame.mcs === mcs).length, far.length)

  it('the table is that run: 524.0, 768.8 and 1,476.0 µs at 25.8, 17.2 and 8.6 Mb/s', () => {
    expect(far.length).toBe(3_003)
    for (const r of far) expect(r.frame.bytes).toBe(1_530)
    expect([atRung(2).frame.txTimeNs, atRung(1).frame.txTimeNs, atRung(0).frame.txTimeNs])
      .toEqual([524_000, 768_800, 1_476_000])
    expect([atRung(2).frame.mbps, atRung(1).frame.mbps, atRung(0).frame.mbps])
      .toEqual([25.8, 17.2, 8.6])
    // the "Share of its frames" column
    expect([share(2), share(1), share(0)]).toEqual([79.8, 17.2, 3.0])
    expect(new Set(far.map((r) => r.frame.mcs))).toEqual(new Set([0, 1, 2]))
  })

  it('"almost three times the air at the bottom rung", and each step down halves the bits', () => {
    expect(Math.round((1_476_000 / 524_000) * 10) / 10).toBe(2.8)
    // "each step down halves, or nearly halves, the bits every chunk of signal carries":
    // the airtime of a fixed payload is inversely proportional to that, less the preamble.
    const payload = (ns: number): number => ns - 48_000
    expect(payload(768_800) / payload(524_000)).toBeGreaterThan(1.4)
    expect(payload(1_476_000) / payload(768_800)).toBeGreaterThan(1.9)
  })

  it('"the ceiling itself never moves: it does not send above MCS 2 once"', () => {
    expect(Math.max(...far.map((r) => r.frame.mcs!))).toBe(2)
  })
})

describe('rate · the station that never has to choose', () => {
  const rs = runOf(rate, undefined, RUN_NS)
  const near = data(rs, 'sta-1')

  it('4,010 frames in three seconds, every one at MCS 11, and not one goes unanswered', () => {
    expect(near.length).toBe(4_010)
    expect(new Set(near.map((r) => r.frame.mcs))).toEqual(new Set([11]))
    expect(ofType(rs, 'ACK_TIMEOUT').filter((r) => r.node === 'sta-1')).toHaveLength(0)
  })
})

describe('rate · the two experiments', () => {
  const base = rate.scenario()
  const ap = base.nodes.find((n) => n.id === 'ap')!.pos
  const far0 = base.nodes.find((n) => n.id === 'sta-2')!.pos
  const dx = ap.x - far0.x, dy = ap.y - far0.y, len = Math.hypot(dx, dy)

  /** The far station's frames after moving it `d` metres straight towards the router. */
  const closer = (d: number) => {
    const sc = rate.scenario()
    const n = sc.nodes.find((x) => x.id === 'sta-2')!
    n.pos = { x: far0.x + (dx / len) * d, y: far0.y + (dy / len) * d, z: n.pos.z }
    const recs = [...new Simulation(sc).runUntil(RUN_NS).records]
    const far = data(recs, 'sta-2')
    return {
      frames: far.length,
      ceiling: Math.max(...far.map((r) => r.frame.mcs!)),
      zero: far.filter((r) => r.frame.mcs === 0).length,
      trace: JSON.stringify(recs.map((r) => (r.type === 'TX_START'
        ? [r.t, r.node, r.frame.mcs, r.frame.txTimeNs] : null)).filter(Boolean)),
    }
  }

  it('half a metre changes nothing; two metres raises the ceiling to MCS 3', () => {
    const d0 = closer(0), dHalf = closer(0.5), d2 = closer(2)
    // "it crosses no threshold, and the run comes back frame for frame identical"
    expect(dHalf.trace).toBe(d0.trace)
    // "the ceiling rises from MCS 2 to MCS 3 — 3,712 frames instead of 3,003"
    expect([d0.ceiling, d2.ceiling]).toEqual([2, 3])
    expect([d0.frames, d2.frames]).toEqual([3_003, 3_712])
  })

  it('five metres closer and the bottom rung never occurs at all', () => {
    expect(closer(5).zero).toBe(0)
    expect(closer(0).zero).toBeGreaterThan(0)
  })
})
