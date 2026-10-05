/**
 * Every empirical claim in 「云端往返」, measured against the lesson's own five scenes.
 *
 * The lesson's whole argument is a RATIO rather than two numbers, and the assertions are
 * written that way on purpose: the design document printed 28.688 ms and 0.106 ms as
 * three-decimal constants, and a constant is the thing that goes stale when a scene moves by
 * one node. What has to hold is that the application round trip is two orders of magnitude
 * larger than the air under it, that the air appears only when something competes for it, and
 * that the difference between the two servers is the difference between their own `rttMs` plus
 * their own jitter. The printed figures are pinned too, but as the lesson's own table rather
 * than as the claim.
 *
 * `runOf` memoises per (lesson, variant, length), so the five 5000 ms runs below happen once
 * each however many assertions read them. 5000 ms is not a round number chosen for comfort: a
 * ping goes out every 250 ms, and the lesson quotes a mean over twenty of them.
 */
import { describe, it, expect } from 'vitest'
import { wanRtt } from '../../src/course/tier2/wan-rtt'
import { Simulation } from '../../src/engine/simulation'
import { DEFAULT_SERVERS, ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { applyRecord, initViewState, type LatencyStats } from '../../src/model/view'
import { MODULES } from '../../src/course/curriculum'
import { lessonShapeSuite, ofType, runOf } from './kit'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000
const RUN_NS = 5000 * MS

/** The variant indices, named, so an assertion says which scene it is about. */
const BUSY = 0
const ACCEL = 1
const OVERSEAS = 2
const NO_SERVERS = 3

lessonShapeSuite(wanRtt, { runNs: RUN_NS })

/** The phone's own two latency accumulators, replayed through the view model. */
function phoneStats(variant?: number): { appRtt: LatencyStats; txLatency: LatencyStats; txOk: number } {
  const sc: Scenario = variant === undefined ? wanRtt.scenario() : wanRtt.variants![variant].scenario()
  const vs = initViewState(sc)
  for (const r of runOf(wanRtt, variant, RUN_NS)) applyRecord(vs, r)
  const s = vs.nodes['sta-1'].stats
  return { appRtt: s.appRtt, txLatency: s.txLatency, txOk: s.txOk }
}

const meanMs = (l: LatencyStats): number => l.sumNs / l.n / 1e6
const maxMs = (l: LatencyStats): number => l.maxNs / 1e6
const acsOf = (rs: TLRecord[]): number[] =>
  [...new Set(ofType(rs, 'ENQUEUE').filter((r) => r.node === 'sta-1').map((r) => r.ac))]
    .filter((a): a is number => a !== undefined).sort()

describe('wan-rtt · the lesson as data', () => {
  it('sits in the real-applications module, before the capstone', () => {
    expect(wanRtt.module).toBe(11)
    expect(MODULES[wanRtt.module].title).toBe('真实应用')
    expect(wanRtt.needs).toEqual(['edca', 'edca-cost', 'queues'])
  })

  it('declares five scenes the schema accepts, and only the first four carry a server', () => {
    const scenes = [wanRtt.scenario(), ...wanRtt.variants!.map((v) => v.scenario())]
    expect(scenes.length).toBe(5)
    for (const s of scenes) expect(() => ScenarioSchema.parse(s)).not.toThrow()
    expect(scenes[NO_SERVERS + 1].servers).toEqual([])
    for (const s of [scenes[0], scenes[BUSY + 1], scenes[ACCEL + 1], scenes[OVERSEAS + 1]]) {
      expect(s.servers.length).toBe(1)
      expect(s.servers[0].kind).toBe('game')
    }
  })

  /**
   * The one server and not `DEFAULT_SERVERS`, asserted rather than asserted-in-a-comment. The
   * three other default endpoints are reached through `serverKindFor`, which answers `null` for
   * `saturated` and `game` for `gaming`, so adding them cannot change anything — and a scene
   * carrying three entries that provably do nothing is the shape this repository keeps
   * shipping. `tests/engine/tamper-inert.test.ts` holds the byte-identity; here we only check
   * that the lesson did not take the easy list.
   */
  it('ships exactly the game endpoint, at the default 25 / 3 / 2', () => {
    const mine = wanRtt.scenario().servers[0]
    const def = DEFAULT_SERVERS.find((s) => s.kind === 'game')!
    expect(mine).toEqual(def)
    const overseas = wanRtt.variants![OVERSEAS].scenario().servers[0]
    expect(overseas.rttMs).toBe(80)
    expect(overseas.jitterMs).toBe(20)
    expect(overseas.processMs).toBe(def.processMs)
  })
})

describe('wan-rtt · the application round trip exists, and in one scene it does not', () => {
  it('collects twenty ping echoes on the base scene', () => {
    const base = phoneStats()
    expect(base.appRtt.n, 'four pings a second over five seconds').toBeGreaterThanOrEqual(15)
    expect(base.appRtt.n).toBe(20)
  })

  /**
   * The lesson's second argument, and the whole reason the fourth variant exists: with
   * `servers: []` the engine cannot answer 「用户等了多久」 at all. Not a smaller number — no
   * number. That is the state every other lesson in this course is in.
   */
  it('and exactly none on the no-server variant, while the MAC number is unchanged', () => {
    const none = phoneStats(NO_SERVERS)
    expect(none.appRtt.n, 'an application round trip with no application endpoint').toBe(0)
    expect(none.appRtt.sumNs).toBe(0)
    expect(ofType(runOf(wanRtt, NO_SERVERS, RUN_NS), 'WAN_TX').length).toBe(0)
    // the air is still measured, and it is the same air: 0.108 ms against the base's 0.106
    expect(meanMs(none.txLatency)).toBeCloseTo(0.108, 3)
  })
})

describe('wan-rtt · the ratio, which is the lesson', () => {
  it('puts the air two orders of magnitude under what the player waits', () => {
    const base = phoneStats()
    expect(meanMs(base.txLatency), 'the MAC queue-to-ack mean').toBeLessThan(0.2)
    expect(meanMs(base.appRtt) / meanMs(base.txLatency),
      'the claim is a ratio, not two decimals').toBeGreaterThan(100)
    // 0.106 / 28.688 = 0.0037, which is the 千分之四 of the title
    expect(meanMs(base.txLatency) / meanMs(base.appRtt)).toBeLessThan(0.004)
  })

  it('prints the figures the lesson prints', () => {
    const base = phoneStats()
    expect(meanMs(base.appRtt)).toBeCloseTo(28.688, 3)
    expect(maxMs(base.appRtt)).toBeCloseTo(29.964, 3)
    // every one of the 210 frames took the same 0.106 ms: an empty room has no variance
    expect(meanMs(base.txLatency)).toBeCloseTo(0.106, 3)
    expect(maxMs(base.txLatency)).toBeCloseTo(0.106, 3)
    expect(base.txLatency.n).toBe(210)
  })

  /**
   * The arithmetic the lesson invites the reader to do: 25 ms of WAN, 2 ms of server, and the
   * expected half of 3 ms of jitter. `traffic.ts` draws each packet's one-way delay as
   * `(rttMs + U[0, jitterMs]) / 2`, so a round trip's expectation is `rttMs + jitterMs / 2`.
   */
  it('agrees with 25 + 2 + 1.5 to a fifth of a millisecond', () => {
    const srv = wanRtt.scenario().servers[0]
    const predicted = srv.rttMs + srv.processMs + srv.jitterMs / 2
    expect(predicted).toBe(28.5)
    expect(meanMs(phoneStats().appRtt) - predicted).toBeLessThan(0.25)
  })
})

describe('wan-rtt · the air appears only when something competes for it', () => {
  it('multiplies the MAC latency by a hundred and the round trip by half', () => {
    const quiet = phoneStats()
    const busy = phoneStats(BUSY)
    expect(meanMs(busy.txLatency), 'the design document asked for 20×; it is 101×')
      .toBeGreaterThan(20 * meanMs(quiet.txLatency))
    expect(meanMs(busy.appRtt)).toBeGreaterThan(meanMs(quiet.appRtt))
    // and the printed pair
    expect(meanMs(busy.txLatency)).toBeCloseTo(10.717, 3)
    expect(meanMs(busy.appRtt)).toBeCloseTo(44.483, 3)
    expect(maxMs(busy.appRtt)).toBeCloseTo(94.223, 3)
  })

  /**
   * The WAN constant contributed nothing to the rise, and this is how that is shown rather
   * than asserted: a round trip crosses the air TWICE — the phone's uplink and the access
   * point's answer — so the 15.795 ms the round trip gained has to be the phone's own 10.611
   * plus the access point's 5.775, and it is, to within 0.6 ms. The first draft of this
   * assertion compared the rise against the phone's end alone and was red by 5.2 ms, which is
   * the access point's downlink queue: a number the phone's own counter cannot see.
   */
  it('and the whole of that rise is the air at the two ends, not the WAN', () => {
    const ap = (variant?: number): number => {
      const sc: Scenario = variant === undefined ? wanRtt.scenario() : wanRtt.variants![variant].scenario()
      const vs = initViewState(sc)
      for (const r of runOf(wanRtt, variant, RUN_NS)) applyRecord(vs, r)
      return meanMs(vs.nodes['ap'].stats.txLatency)
    }
    const quiet = phoneStats()
    const busy = phoneStats(BUSY)
    const rise = meanMs(busy.appRtt) - meanMs(quiet.appRtt)
    const bothEnds = (meanMs(busy.txLatency) - meanMs(quiet.txLatency)) + (ap(BUSY) - ap())
    expect(Math.abs(rise - bothEnds), 'the two ends account for the rise').toBeLessThan(1.5)
  })
})

describe('wan-rtt · the router’s boolean is one field, and it moves the tail hardest', () => {
  it('marks the game flow into AC_VI and nothing else', () => {
    expect(acsOf(runOf(wanRtt, BUSY, RUN_NS)), 'best effort without the switch').toEqual([1])
    expect(acsOf(runOf(wanRtt, ACCEL, RUN_NS)), 'video with it').toEqual([2])
    expect(wanRtt.variants![ACCEL].scenario().nodes[0].gameAccel).toBe(true)
    expect(wanRtt.variants![BUSY].scenario().nodes[0].gameAccel).toBeUndefined()
  })

  it('cuts the queueing to a quarter and the worst round trip to under half', () => {
    const busy = phoneStats(BUSY)
    const accel = phoneStats(ACCEL)
    expect(meanMs(accel.txLatency)).toBeLessThan(meanMs(busy.txLatency))
    expect(meanMs(accel.txLatency)).toBeCloseTo(2.339, 3)
    expect(meanMs(accel.appRtt)).toBeCloseTo(33.114, 3)
    expect(maxMs(accel.appRtt)).toBeCloseTo(39.976, 3)
    // 「尾巴收得比均值狠得多」: the mean falls by 26 %, the maximum by 58 %
    const meanDrop = 1 - meanMs(accel.appRtt) / meanMs(busy.appRtt)
    const maxDrop = 1 - maxMs(accel.appRtt) / maxMs(busy.appRtt)
    expect(maxDrop).toBeGreaterThan(2 * meanDrop)
  })
})

describe('wan-rtt · the overseas endpoint turns a config value into arithmetic', () => {
  /**
   * The design document asked for the difference to land in `(80 − 25) ± 5`. It does not, and
   * the document was wrong rather than the engine: it forgot the jitter, which is 20 ms there
   * against 3 ms here and contributes half of itself to a round trip. The prediction is
   * `(80 − 25) + (20 − 3) / 2 = 63.5`, and the measurement is 65.1.
   */
  it('differs from the domestic one by its own RTT plus its own jitter', () => {
    const near = wanRtt.scenario().servers[0]
    const far = wanRtt.variants![OVERSEAS].scenario().servers[0]
    const predicted = (far.rttMs - near.rttMs) + (far.jitterMs - near.jitterMs) / 2
    expect(predicted).toBe(63.5)
    const gap = meanMs(phoneStats(OVERSEAS).appRtt) - meanMs(phoneStats().appRtt)
    expect(gap).toBeGreaterThan(predicted - 5)
    expect(gap).toBeLessThan(predicted + 5)
  })

  it('leaves the air exactly where it was, because the air never moved', () => {
    const over = phoneStats(OVERSEAS)
    expect(meanMs(over.appRtt)).toBeCloseTo(93.783, 3)
    expect(meanMs(over.txLatency)).toBeCloseTo(0.106, 3)
    expect(maxMs(over.txLatency)).toBeCloseTo(0.106, 3)
  })
})

describe('wan-rtt · what the reader is told to try', () => {
  /**
   * 「零时延的服务器不是没有服务器」 — the second `tryThis`. A reader who sets `rttMs: 0`
   * expects the baseline back and does not get it: the downlink still crosses the WAN, so the
   * record stream differs from `servers: []` and the application number still exists.
   */
  it('a zero-latency server is still a server', () => {
    const zero: Scenario = {
      ...wanRtt.scenario(),
      servers: [{ ...wanRtt.scenario().servers[0], rttMs: 0, jitterMs: 0, processMs: 0 }],
    }
    const recs = [...new Simulation(zero).runUntil(2000 * MS).records]
    expect(ofType(recs, 'WAN_TX').length, 'a zero-delay crossing is still a crossing').toBeGreaterThan(0)
    const none = [...new Simulation(wanRtt.variants![NO_SERVERS].scenario()).runUntil(2000 * MS).records]
    expect(recs.length).not.toBe(none.length)
    const vs = initViewState(zero)
    for (const r of recs) applyRecord(vs, r)
    expect(vs.nodes['sta-1'].stats.appRtt.n).toBeGreaterThan(0)
  })
})
