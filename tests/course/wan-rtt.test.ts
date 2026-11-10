/**
 * `@wan-rtt`, in the standard-first shape (2026-11-11), measured against the lesson's own five
 * scenes at 5000 ms, seed 7.
 *
 * ① cites what IEEE Std 802.11-2024 says that bears on a game's round trip — the UP-to-AC mapping
 * (§10.2.3.2, Table 10-1), the default EDCA parameters (§9.4.2.27, Table 9-194), per-category
 * contention (§10.23.2.4) and MSCS (§11.25.3) — and that everything past the access point is
 * outside 802.11. ② says what the engine does; the router's game-mode boolean is the row marked
 * `differs`, and the assertions below show what it moves: the phone's own uplink AND the access
 * point's downlink to it, from AC_BE to AC_VI.
 *
 * The engine pins carried over from the old file (the silent first 30 ms, the ratio, the rise at
 * the two ends, the overseas arithmetic) stay as they were; every figure ③ prints is read back out
 * of the lesson text at the end. `runOf` memoises per (lesson, variant, length), so the five
 * 5000 ms runs happen once each.
 */
import { describe, it, expect } from 'vitest'
import { wanRtt } from '../../src/course/tier2/wan-rtt'
import { Simulation } from '../../src/engine/simulation'
import { DEFAULT_SERVERS, ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { applyRecord, initViewState, type LatencyStats } from '../../src/model/view'
import { MODULES } from '../../src/course/curriculum'
import { DEFAULT_RUN_NS, lessonShapeSuite, ofType, runOf } from './kit'
import type { TLRecord } from '../../src/model/records'
import { EDCA_PARAMS } from '../../src/engine/phy'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'

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

/**
 * **Why `lessonShapeSuite` is given a `runNs`, said out loud so a future red lands on the right
 * sentence.**
 *
 * The base scene is one gaming phone and one access point. A game's uplink tick is scheduled
 * from `scheduleGaming`'s own interval histogram, and on seed 7 the first one falls at
 * 37.259 ms — after `kit.ts`'s `DEFAULT_RUN_NS` of 30 ms. So in the default window this scene
 * emits NOTHING AT ALL, and the shape suite's jump-target check would fail with 「第一条广域网
 * 发送」, which reads as "the predicate is wrong" and is not.
 *
 * This asserts the real cause instead: the scene is silent for the first 30 ms, its first record
 * is at 37.259 ms, and it is awake well inside the window the suite is actually given. Delete
 * the `runNs` above and this is the test that says why.
 */
describe('wan-rtt · the run length the shape suite is given is not a default', () => {
  it('is silent for the whole default window, and awake long before the one it gets', () => {
    const sc = wanRtt.scenario()
    expect([...new Simulation(sc).runUntil(DEFAULT_RUN_NS).records],
      'nothing happens in the first 30 ms, which is why `runNs` is passed').toEqual([])
    const first = [...new Simulation(sc).runUntil(100 * MS).records][0]
    expect(first, 'the scene does wake up').toBeDefined()
    expect(first.t / 1e6).toBeCloseTo(37.259, 3)
    expect(first.t).toBeGreaterThan(DEFAULT_RUN_NS)
    expect(first.t).toBeLessThan(RUN_NS)
  })
})

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

/**
 * **① and ②: the clauses ① cites, and each ② row against the engine.** The router's boolean is
 * the row marked `differs`: it moves the phone's OWN uplink into AC_VI without any frame exchange,
 * which MSCS (§11.25.3, downlink only and set up by the station) does not do.
 */
describe('wan-rtt · ① cites what it teaches, ② is what the engine does', () => {
  const std = wanRtt.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
  const implRow = (topic: string) => {
    const row = wanRtt.implementation!.find((x) => x.topic === topic)
    expect(row, `implementation row 「${topic}」`).toBeDefined()
    return row!
  }
  const game = wanRtt.scenario().servers[0]
  const overseas = wanRtt.variants![OVERSEAS].scenario().servers[0]

  it('is in the standard-first shape, with nothing left in the old sections', () => {
    expect(isStandardFirst(wanRtt)).toBe(true)
    expect(wanRtt.limits).toEqual([])
    expect(wanRtt.observe).toEqual([])
    expect(wanRtt.tryThis).toEqual([])
    expect(wanRtt.labs!.length).toBe(4)
  })

  it('① cites each clause and keeps the simulator’s game mode out of it', () => {
    for (const clause of ['§10.2.3.2', '表 10-1', '§9.4.2.27', '表 9-194', '§10.23.2.4', '§11.25.3', '§10.3.2.11'])
      expect(std, clause).toContain(clause)
    expect(std).not.toContain('游戏模式')
    // 「aCWmin 为 15 时，两类的 CWmin 分别是 15 与 7」 — Table 9-194's formulas at aCWmin 15
    const [aCWmin, be, vi] = /aCWmin 为 (\d+) 时，两类的 CWmin 分别是 (\d+) 与 (\d+)/.exec(std)!.slice(1).map(Number)
    expect(be).toBe(aCWmin)
    expect(vi).toBe((aCWmin + 1) / 2 - 1)
  })

  it('② is not all faithful, and the game mode is the row that differs', () => {
    const kinds = new Set(wanRtt.implementation!.map((r) => r.kind))
    expect(kinds.has('faithful') && kinds.has('differs') && kinds.has('value') && kinds.has('choice')).toBe(true)
    expect(implRow('路由器游戏模式').kind).toBe('differs')
  })

  it('EDCA 参数: the engine’s table is Table 9-194’s', () => {
    const [beMin, beMax, beA, viMin, viMax, viA] = /AC_BE 的 CWmin、CWmax、AIFSN 为 (\d+)、(\d+)、(\d+)，AC_VI 为 (\d+)、(\d+)、(\d+)/
      .exec(implRow('EDCA 参数').sim)!.slice(1).map(Number)
    const be = EDCA_PARAMS.find((p) => p.name === 'BE')!
    const vi = EDCA_PARAMS.find((p) => p.name === 'VI')!
    expect([be.cwMin, be.cwMax, be.aifsn]).toEqual([beMin, beMax, beA])
    expect([vi.cwMin, vi.cwMax, vi.aifsn]).toEqual([viMin, viMax, viA])
  })

  it('用户优先级 and 路由器游戏模式: the phone’s uplink AND the access point’s downlink to it move to 2', () => {
    const dlAcs = (v: number): number[] => [...new Set(ofType(runOf(wanRtt, v, RUN_NS), 'ENQUEUE')
      .filter((r) => r.node === 'ap' && r.dst === 'sta-1').map((r) => r.ac))].filter((a): a is number => a !== undefined).sort()
    expect(acsOf(runOf(wanRtt, BUSY, RUN_NS))).toEqual([1])
    expect(acsOf(runOf(wanRtt, ACCEL, RUN_NS))).toEqual([2])
    expect(dlAcs(BUSY)).toEqual([1])
    expect(dlAcs(ACCEL)).toEqual([2])
    // the laptops' saturated uploads are best effort either way
    for (const v of [BUSY, ACCEL]) {
      const laptops = new Set(ofType(runOf(wanRtt, v, RUN_NS), 'ENQUEUE').filter((r) => r.node === 'sta-2' || r.node === 'sta-3').map((r) => r.ac))
      expect([...laptops]).toEqual([1])
    }
  })

  it('广域网与服务器: the endpoint’s own fields, and the one-way leg they give', () => {
    const sim = implRow('广域网与服务器').sim
    const [rtt, jitter, oneWay, jitterHalf, proc, oRtt, oJitter] =
      /游戏服务器往返 (\d+) 毫秒、抖动 (\d+) 毫秒，即单向 ([\d.]+) 毫秒加 0 到 ([\d.]+) 毫秒；服务器处理 (\d+) 毫秒。海外那一档往返 (\d+) 毫秒、抖动 (\d+) 毫秒/
        .exec(sim)!.slice(1).map(Number)
    expect([rtt, jitter, proc]).toEqual([game.rttMs, game.jitterMs, game.processMs])
    expect(oneWay).toBe(game.rttMs / 2)
    expect(jitterHalf).toBe(game.jitterMs / 2)
    expect([oRtt, oJitter]).toEqual([overseas.rttMs, overseas.jitterMs])
  })

  it('应用往返怎样测量: the 64-byte probe exists only when there is a server, every 250 ms or so', () => {
    const uplink = (v?: number) => ofType(runOf(wanRtt, v, RUN_NS), 'ENQUEUE').filter((r) => r.node === 'sta-1')
    const [period, bytes] = /每 (\d+) 毫秒发一个 (\d+) 字节的测量包/.exec(implRow('应用往返怎样测量').sim)!.slice(1).map(Number)
    const without = new Set(uplink(NO_SERVERS).map((r) => r.bytes))
    const extra = [...new Set(uplink().map((r) => r.bytes))].filter((b) => !without.has(b))
    expect(extra).toEqual([bytes])
    const ts = uplink().filter((r) => r.bytes === bytes).map((r) => r.t)
    const gaps = ts.slice(1).map((t, i) => (t - ts[i]) / MS)
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(0.9 * period)
    expect(Math.max(...gaps)).toBeLessThanOrEqual(1.1 * period)
  })

  it('游戏业务: the uplink sizes and mean gap, and the downlink tick, off the records', () => {
    const [gap, lo, hi, dlTick] = /上行平均每 (\d+) 毫秒一个 (\d+) 到 (\d+) 字节的包，下行 (\d+) 毫秒一个状态帧/
      .exec(implRow('游戏业务').sim)!.slice(1).map(Number)
    // thirty seconds on the probe-free variant: the histogram's own mean is reached there
    const ul = ofType([...new Simulation(wanRtt.variants![NO_SERVERS].scenario()).runUntil(30_000 * MS).records], 'ENQUEUE')
      .filter((r) => r.node === 'sta-1')
    const bytes = ul.map((r) => r.bytes)
    expect([Math.min(...bytes), Math.max(...bytes)]).toEqual([lo, hi])
    const meanGapMs = (ts: number[]): number => (ts[ts.length - 1] - ts[0]) / (ts.length - 1) / MS
    expect(Math.round(meanGapMs(ul.map((r) => r.t)) / 10) * 10).toBe(gap)
    const dl = ofType(runOf(wanRtt, undefined, RUN_NS), 'ENQUEUE').filter((r) => r.node === 'ap' && r.bytes > 100)
    expect(Math.round(meanGapMs(dl.map((r) => r.t)) / 5) * 5).toBe(dlTick)
  })
})

/** **③: every figure the labs print, read back out of the lesson.** */
describe('wan-rtt · ③ every figure the labs print is the run', () => {
  const lab = (heading: string): Lab => {
    const l = wanRtt.labs!.find((x) => x.heading === heading)
    expect(l, `lab 「${heading}」`).toBeDefined()
    return l!
  }
  const val = (x: string): number => Number(x.replace(/[\s,]/g, ''))
  const grab = (text: string, re: RegExp, what: string): string[] => {
    const m = re.exec(text)
    expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return m!.slice(1)
  }
  /** A printed figure against a measurement, at the precision it was printed to. */
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals)`).toBe(Number(measured.toFixed(dp)))
  }
  const game = wanRtt.scenario().servers[0]
  const overseas = wanRtt.variants![OVERSEAS].scenario().servers[0]

  it('lab 1: the quiet room’s 210 frames, its round trip and the ratio', () => {
    const s = phoneStats()
    const [n, air, trip, ratio] = grab(lab('广域网那一段').expect,
      /它的 (\d+) 帧从入队到被确认都是 ([\d.]+) 毫秒；同一轮里应用往返的均值是 ([\d.]+) 毫秒，两者之比是 ([\d.]+)，不到千分之四/,
      'lab 1 「你应该看到」')
    expect(val(n)).toBe(s.txLatency.n)
    expect(s.txLatency.maxNs).toBe(Math.round(s.txLatency.sumNs / s.txLatency.n))
    same(air, meanMs(s.txLatency), 'the quiet enqueue-to-ack')
    same(trip, meanMs(s.appRtt), 'the quiet round trip')
    same(ratio, meanMs(s.txLatency) / meanMs(s.appRtt), 'the ratio')
    expect(meanMs(s.txLatency) / meanMs(s.appRtt)).toBeLessThan(0.004)
    expect(meanMs(s.txLatency) / meanMs(s.appRtt)).toBeGreaterThan(0.003)
  })

  it('lab 1: the hand-check adds up, and its two measurements are the runs', () => {
    const f = lab('广域网那一段').blocks!.find((b) => b.kind === 'formula') as Extract<Block, { kind: 'formula' }>
    const [w, p, j, total] = grab(f.text, /(\d+)（广域网往返）\+ (\d+)（服务器处理）\+ ([\d.]+)（抖动的期望[^）]*）= ([\d.]+) ms/, 'the formula').map(Number)
    expect([w, p, j]).toEqual([game.rttMs, game.processMs, game.jitterMs / 2])
    expect(w + p + j).toBeCloseTo(total, 6)
    const [m, gap, ow, op, oj, osum, om] = grab(f.note!, /实测 ([\d.]+) 毫秒，比计算值多 ([\d.]+)[^]*?(\d+) \+ (\d+) \+ (\d+) = (\d+)，实测 ([\d.]+)/, 'the note')
    same(m, meanMs(phoneStats().appRtt), 'the base round trip')
    same(gap, meanMs(phoneStats().appRtt) - total, 'the gap')
    expect([Number(ow), Number(op), Number(oj)]).toEqual([overseas.rttMs, overseas.processMs, overseas.jitterMs / 2])
    expect(Number(ow) + Number(op) + Number(oj)).toBe(Number(osum))
    same(om, meanMs(phoneStats(OVERSEAS).appRtt), 'the overseas round trip')
  })

  it('lab 2: the five-row table, every numeric cell', () => {
    const t = lab('五种配置').blocks!.find((b) => b.kind === 'table') as Extract<Block, { kind: 'table' }>
    const BY_LABEL: readonly (readonly [string, number | undefined])[] = [
      ['只有手机（本课）', undefined], ['加两台笔记本上传', BUSY], ['同上 + 游戏模式', ACCEL],
      ['海外服务器', OVERSEAS], ['没有服务器', NO_SERVERS],
    ]
    expect(t.rows.map((r) => r[0])).toEqual(BY_LABEL.map(([l]) => l))
    const ms = (cell: string): number => Number(cell.replace(/\s*ms$/, ''))
    for (const [i, [label, variant]] of BY_LABEL.entries()) {
      const s = phoneStats(variant)
      const row = t.rows[i]
      if (variant !== NO_SERVERS) {
        expect(ms(row[1]), `${label}: mean round trip`).toBe(Number(meanMs(s.appRtt).toFixed(3)))
        expect(ms(row[2]), `${label}: worst round trip`).toBe(Number(maxMs(s.appRtt).toFixed(3)))
      } else {
        expect([row[1], row[2]]).toEqual(['无法测量', '—'])
        expect(s.appRtt.n).toBe(0)
      }
      expect(ms(row[3]), `${label}: mean enqueue-to-ack`).toBe(Number(meanMs(s.txLatency).toFixed(3)))
      expect(ms(row[4]), `${label}: worst enqueue-to-ack`).toBe(Number(maxMs(s.txLatency).toFixed(3)))
    }
    const [a, b, c] = grab(t.heading!, /一台 (\d+)\/(\d+)\/(\d+) 的游戏服务器/, 'the heading').map(Number)
    expect([a, b, c]).toEqual([game.rttMs, game.jitterMs, game.processMs])
    expect(wanRtt.variants![OVERSEAS].label).toBe(`海外服务器 ${overseas.rttMs}/${overseas.jitterMs}/${overseas.processMs}`)
  })

  it('lab 2: 「你应该看到」', () => {
    const e = lab('五种配置').expect
    const quiet = phoneStats(), busy = phoneStats(BUSY), over = phoneStats(OVERSEAS), none = phoneStats(NO_SERVERS)
    const [q, b, tq, tb, wan] = grab(e, /手机那一段从 ([\d.]+) 毫秒增加到 ([\d.]+) 毫秒，是原来的一百倍；应用往返只从 ([\d.]+) 增加到 ([\d.]+) 毫秒，因为广域网那 (\d+) 毫秒保持不变/, 'lab 2 on the busy room')
    same(q, meanMs(quiet.txLatency), 'quiet air')
    same(b, meanMs(busy.txLatency), 'busy air')
    expect(Math.round(meanMs(busy.txLatency) / meanMs(quiet.txLatency) / 100) * 100).toBe(100)
    same(tq, meanMs(quiet.appRtt), 'quiet round trip')
    same(tb, meanMs(busy.appRtt), 'busy round trip')
    expect(Number(wan)).toBe(game.rttMs)
    const [ot, oa] = grab(e, /海外服务器把往返增加到 ([\d.]+) 毫秒，空口那一段仍是 ([\d.]+) 毫秒/, 'lab 2 on overseas')
    same(ot, meanMs(over.appRtt), 'overseas round trip')
    same(oa, meanMs(over.txLatency), 'overseas air')
    const [na] = grab(e, /入队到确认仍是 ([\d.]+) 毫秒/, 'lab 2 on no server')
    same(na, meanMs(none.txLatency), 'no-server air')
  })

  it('lab 3: one field, and the mean and the tail it moves', () => {
    const e = lab('游戏模式改的是一个字段').expect
    const [was, now] = grab(e, /类别从 (\d+) 变成 (\d+)/, 'lab 3 on the category').map(Number)
    expect(acsOf(runOf(wanRtt, BUSY, RUN_NS))).toEqual([was])
    expect(acsOf(runOf(wanRtt, ACCEL, RUN_NS))).toEqual([now])
    const busy = phoneStats(BUSY), accel = phoneStats(ACCEL)
    const [m0, m1, x0, x1, r0, r1] = grab(e, /均值从 ([\d.]+) 毫秒降到 ([\d.]+) 毫秒，最大值从 ([\d.]+) 毫秒降到 ([\d.]+) 毫秒；应用往返的最大值从 ([\d.]+) 毫秒降到 ([\d.]+) 毫秒/, 'lab 3 on the figures')
    same(m0, meanMs(busy.txLatency), 'busy mean')
    same(m1, meanMs(accel.txLatency), 'accel mean')
    same(x0, maxMs(busy.txLatency), 'busy worst')
    same(x1, maxMs(accel.txLatency), 'accel worst')
    same(r0, maxMs(busy.appRtt), 'busy worst round trip')
    same(r1, maxMs(accel.appRtt), 'accel worst round trip')
    // 「尾部降得比均值多」
    expect(maxMs(busy.txLatency) / maxMs(accel.txLatency)).toBeGreaterThan(meanMs(busy.txLatency) / meanMs(accel.txLatency))
  })

  it('lab 4: the quiet room where the same switch changes the countdown and nothing else', () => {
    const quiet = ScenarioSchema.parse({ ...wanRtt.scenario() })
    const accelQuiet = ScenarioSchema.parse({ ...quiet, nodes: quiet.nodes.map((n) => (n.kind === 'ap' ? { ...n, gameAccel: true } : n)) })
    const recsOf = (sc: Scenario): TLRecord[] => [...new Simulation(sc).runUntil(RUN_NS).records]
    const rq = recsOf(quiet), ra = recsOf(accelQuiet)
    const txOk = (sc: Scenario, rs: TLRecord[]): number => {
      const vs = initViewState(sc)
      for (const r of rs) applyRecord(vs, r)
      return vs.nodes['sta-1'].stats.txOk
    }
    const count = (rs: TLRecord[], type: string): number => rs.filter((r) => r.type === type && (r as { node?: string }).node === 'sta-1').length
    const e = lab('安静的房间里打开游戏模式').expect
    const [frames] = grab(e, /收到的帧数两边都是 (\d+)，完全相同/, 'lab 4 on frames').map(Number)
    expect([txOk(quiet, rq), txOk(accelQuiet, ra)]).toEqual([frames, frames])
    expect(count(rq, 'BACKOFF_DRAW')).toBe(count(ra, 'BACKOFF_DRAW'))
    const [was, now, be, vi] = grab(e, /从 ([\d,]+) 条降到 ([\d,]+) 条，因为随机选取的范围从尽力而为那一类的 CWmin (\d+) 变成了视频那一类的 (\d+)/, 'lab 4 on the countdown').map(val)
    expect([count(rq, 'BACKOFF_DEC'), count(ra, 'BACKOFF_DEC')]).toEqual([was, now])
    expect(be).toBe(EDCA_PARAMS.find((p) => p.name === 'BE')!.cwMin)
    expect(vi).toBe(EDCA_PARAMS.find((p) => p.name === 'VI')!.cwMin)
    const [qBe, qVi] = grab(wanRtt.quiz[1].explain, /选取范围从 (\d+) 变成 (\d+)/, 'quiz 2').map(Number)
    expect([qBe, qVi]).toEqual([be, vi])
  })

  it('the quiz’s figures are lab 1’s', () => {
    const s = phoneStats()
    same(grab(wanRtt.quiz[0].q, /应用往返是 ([\d.]+) 毫秒/, 'quiz 1')[0], meanMs(s.appRtt), 'round trip')
    same(grab(wanRtt.quiz[0].options[1], /^([\d.]+) 毫秒/, 'quiz 1 b')[0], meanMs(s.txLatency), 'air')
    const [w, p, j, rest, air] = grab(wanRtt.quiz[0].explain, /(\d+) 毫秒是广域网来回，(\d+) 毫秒是服务器处理，([\d.]+) 毫秒是抖动的期望。剩下属于空口的只有 ([\d.]+) 毫秒，而其中入队到确认那一段是 ([\d.]+) 毫秒/, 'quiz 1 explain')
    expect([Number(w), Number(p), Number(j)]).toEqual([game.rttMs, game.processMs, game.jitterMs / 2])
    same(rest, meanMs(s.appRtt) - (game.rttMs + game.processMs + game.jitterMs / 2), 'what is left')
    same(air, meanMs(s.txLatency), 'air')
  })
})
