/**
 * Every empirical claim in "Rate control — picking how fast to talk", measured
 * against the lesson's own scene.
 *
 * The lesson was 2 009 words and became two (plan ruling 2): this half owns the
 * ceiling, the three rungs the far station uses and the near station that never
 * has to choose; `rate-fallback` owns the loop itself and what it costs the
 * room. Neither half changes `rateScenario`, so the recorded hash is untouched.
 *
 * Re-paced on 2026-09-25 (§2 M9: the lesson stays whole and gives up its `steps`
 * block). §5.1.3 deletes the ARF rule from this lesson, so the pins that guarded
 * it — a lone failure moving nothing, the two failures in a row at attempts 192
 * and 193, and the ten answered frames that climb back — moved with the prose to
 * tests/course/rate-fallback.test.ts. What is pinned here instead is the
 * procedure this lesson does own: the five steps of the ceiling itself, from
 * `mcsForPeer` in src/engine/simulation.ts and `mcsForRssi` in
 * src/engine/phy.ts, including the capability cap that is step 3.
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
import { buildLinkTable } from '../../src/engine/propagation'
import { negotiated } from '../../src/model/caps'
import { RATE_MARGIN_DB, mcsForRssi, noiseDbm, reqSinrDb } from '../../src/engine/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
/** The three seconds every number in this lesson is measured over. */
const RUN_NS = 3_000 * MS
/** Long enough for all three jump targets; the shape suite asks for no more. */
const JUMP_NS = 200 * MS

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const data = (rs: TLRecord[], node: string): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && r.node === node && r.frame.kind === 'data')
const pct = (a: number, b: number): number => Math.round((a / b) * 1000) / 10

lessonShapeSuite(rate, { runNs: JUMP_NS })

describe('rate · the lesson’s own scene', () => {
  it('is the Tier 2 rate lesson, and names the lessons its words come from', () => {
    expect(MODULES[rate.module].title).toBe('容量旋钮与速率控制')
    // §6 of the re-pacing plan: the rung ladder and the alibi for the rate anomaly are
    // their own lessons now, so those are the ids this lesson's words come from.
    expect(rate.needs).toEqual(['mcs-ladder', 'retries-queues', 'rate-vs-model', 'width'])
    // MCS is mcs-ladder's word, ACK and ACK timeout come through retries-queues;
    // these two are this lesson's own.
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

  it('MCS 11 is where the agreed capabilities stop, not where the signal does', () => {
    // "That rung is not where its signal runs out — 58.7 dB would carry the top rung — but
    //  where the two ends' agreed capabilities stop: neither of them offered the two densest
    //  rungs on this scene, so the ceiling is capped below them."
    const sc = rate.scenario()
    for (const n of sc.nodes) expect(n.caps.features?.qam4k ?? false, n.id).toBeFalsy()
    expect(negotiated(sc.nodes.find((n) => n.id === 'sta-1')!, sc.nodes.find((n) => n.id === 'ap')!, 'qam4k')).toBe(false)
    const rssi = buildLinkTable(sc.nodes, sc.walls).get('sta-1')!.get('ap')!
    expect(Math.round((rssi - noiseDbm(20)) * 10) / 10).toBe(58.7)
    // the engine's own cap: `mcsForPeer` passes 11 when the pair has not negotiated 4096-QAM
    expect(mcsForRssi('eht', rssi, 11, 20)).toBe(11)
    expect(mcsForRssi('eht', rssi, 13, 20)).toBe(13)
  })
})

describe('rate · the ceiling, as the engine computes it', () => {
  const rs = runOf(rate, undefined, RUN_NS)
  const far = data(rs, 'sta-2')

  it('steps 1, 2 and 4: the ceiling of the far link is MCS 2, and the table’s arithmetic says why', () => {
    // "RSSI −75.46 dBm · less the noise floor, 20 MHz −93.99 · = SNR 18.53 dB · MCS 2 asks
    //  13.99 + 3 = 16.99 ✓ · MCS 3 asks 16.99 + 3 = 19.99 ✗ · so the ceiling is MCS 2"
    const sc = rate.scenario()
    const rssi = buildLinkTable(sc.nodes, sc.walls).get('sta-2')!.get('ap')!
    const r2 = (x: number) => Math.round(x * 100) / 100
    expect(r2(rssi)).toBe(-75.46)
    expect(r2(noiseDbm(20))).toBe(-93.99)
    expect(r2(rssi - noiseDbm(20))).toBe(18.53)
    expect(RATE_MARGIN_DB).toBe(3)
    expect([r2(reqSinrDb('eht', 2)), r2(reqSinrDb('eht', 3))]).toEqual([13.99, 16.99])
    expect(r2(reqSinrDb('eht', 2) + RATE_MARGIN_DB)).toBe(16.99)
    expect(r2(reqSinrDb('eht', 3) + RATE_MARGIN_DB)).toBe(19.99)
    expect(rssi - noiseDbm(20)).toBeGreaterThan(reqSinrDb('eht', 2) + RATE_MARGIN_DB)
    expect(rssi - noiseDbm(20)).toBeLessThan(reqSinrDb('eht', 3) + RATE_MARGIN_DB)
    expect(mcsForRssi('eht', rssi, 11, 20)).toBe(2)
  })

  it('step 3: the cap is a capability, not a signal — 4096-QAM is not negotiated here', () => {
    // "if the two ends have not both offered 4096-QAM the ceiling is capped at MCS 11 first,
    //  and this step looks at capabilities alone": the cap `mcsForPeer` passes to mcsForRssi.
    const sc = rate.scenario()
    const ap = sc.nodes.find((n) => n.id === 'ap')!
    for (const id of ['sta-1', 'sta-2']) {
      expect(negotiated(sc.nodes.find((n) => n.id === id)!, ap, 'qam4k'), id).toBe(false)
    }
    // the cap binds the near link (which has signal to spare) and not the far one, which the
    // signal stops two rungs lower — the table's own two rows
    const table = buildLinkTable(sc.nodes, sc.walls)
    expect(mcsForRssi('eht', table.get('sta-1')!.get('ap')!, 11, 20)).toBe(11)
    expect(mcsForRssi('eht', table.get('sta-2')!.get('ap')!, 11, 20)).toBe(2)
  })

  it('step 5: the working rung is pulled down to the ceiling, so the first frame goes out there', () => {
    // "the working rung is pulled down to the ceiling the moment it sits above it — the first
    //  frame ever": RateControl.mcsFor clamps on every read, and the run's first frame shows it.
    expect(far[0].frame.mcs).toBe(2)
    expect(Math.max(...far.map((r) => r.frame.mcs!))).toBe(2)
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
