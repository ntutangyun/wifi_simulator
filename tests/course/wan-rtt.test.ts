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
import { DEFAULT_RUN_NS, lessonShapeSuite, ofType, runOf } from './kit'
import type { TLRecord } from '../../src/model/records'
import { EDCA_PARAMS } from '../../src/engine/phy'

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

/**
 * **The five-row table, read back out of the lesson.**
 *
 * This file measured the phone's two latency accumulators and compared them to literals written
 * HERE — `toBeCloseTo(44.483, 3)` and friends — which catches an engine change and misses a prose
 * change. `@wan-rtt` was one of the eighteen lessons whose test never touched its own prose
 * (`tests/course/prose-readback.test.ts`), and two of the table's cells (129.324 and 13.057) had
 * no numerically-equal literal anywhere in tests/.
 *
 * All twenty cells were exact; this is wiring. What it buys is that the lesson's own copy of each
 * figure is now the thing under test — including the last row, whose two round-trip cells say
 * 「量不出来」 and 「—」 rather than a number, and that claim is checked as a claim: with no server
 * in the scene there is no application round trip to measure.
 */
describe('wan-rtt · the five-row table is read back out of the lesson', () => {
  /** Each row label against the variant it names; `undefined` is the lesson's own scene. */
  const BY_LABEL: readonly (readonly [string, number | undefined])[] = [
    ['只有手机（本课）', undefined],
    ['加两台笔记本上传', BUSY],
    ['同上 + 游戏模式', ACCEL],
    ['海外服务器', OVERSEAS],
    ['没有服务器', NO_SERVERS],
  ]

  const rows = (): string[][] => {
    const b = wanRtt.numbers!.find((x) => x.kind === 'table' && (x.heading ?? '').includes('五种配置'))
    expect(b, 'the five-configuration table is gone from `numbers`').toBeDefined()
    return (b as Extract<typeof b, { kind: 'table' }>).rows
  }
  /** 「44.483 ms」 → 44.483. */
  const ms = (cell: string): number => Number(cell.replace(/\s*ms$/, ''))

  it('has one row per variant, in the order the lesson prints them', () => {
    expect(rows().map((r) => r[0]), 'the row labels the lesson prints')
      .toEqual(BY_LABEL.map(([label]) => label))
    // the five configurations are the scene plus its four variants, and no more
    expect(wanRtt.variants, 'four variants behind the four non-base rows').toHaveLength(4)
  })

  it('every numeric cell is the measured one, to the three decimals the lesson prints', () => {
    const table = rows()
    for (const [i, [label, variant]] of BY_LABEL.entries()) {
      const s = phoneStats(variant)
      const row = table[i]
      expect(row[0], `row ${i} is ${label}`).toBe(label)
      if (label !== '没有服务器') {
        expect(ms(row[1]), `${label}: mean application round trip`)
          .toBe(Number(meanMs(s.appRtt).toFixed(3)))
        expect(ms(row[2]), `${label}: worst application round trip`)
          .toBe(Number(maxMs(s.appRtt).toFixed(3)))
      }
      expect(ms(row[3]), `${label}: mean enqueue-to-ack`).toBe(Number(meanMs(s.txLatency).toFixed(3)))
      expect(ms(row[4]), `${label}: worst enqueue-to-ack`).toBe(Number(maxMs(s.txLatency).toFixed(3)))
    }
  })

  it('the last row says 「量不出来」, and that is a claim about the scene, not a gap', () => {
    const row = rows()[4]
    expect([row[1], row[2]], 'the two round-trip cells of the server-less row')
      .toEqual(['量不出来', '—'])
    // there is nothing to measure: no server, so no reply to tie a round trip to
    expect(phoneStats(NO_SERVERS).appRtt.n, 'application round trips recorded with no server')
      .toBe(0)
    // while the air half of the row IS measurable, which is why those two cells carry figures
    expect(phoneStats(NO_SERVERS).txLatency.n).toBeGreaterThan(0)
  })

  it('the hand-check under the table adds up, and its two measured numbers are the table’s', () => {
    const f = wanRtt.numbers!.find((x) => x.kind === 'formula'
      && (x.heading ?? '').includes('可以当场验算')) as { text: string; note?: string } | undefined
    expect(f, 'the verify-it-yourself formula is gone from `numbers`').toBeDefined()
    const sum = /(\d+)（广域网往返）\+ (\d+)（服务器处理）\+ ([\d.]+)（抖动的期望[^）]*）= ([\d.]+) ms/.exec(f!.text)
    expect(sum, 'the formula no longer states its three terms and their total').not.toBeNull()
    expect(Number(sum![1]) + Number(sum![2]) + Number(sum![3]), 'the arithmetic the lesson shows')
      .toBeCloseTo(Number(sum![4]), 6)
    const note = /实测 ([\d.]+) 毫秒，比算出来的多 ([\d.]+)[^]*?= (\d+)，实测 ([\d.]+)/.exec(f!.note ?? '')
    expect(note, 'the note no longer states the two measurements in the shape this reads').not.toBeNull()
    const base = Number(meanMs(phoneStats(undefined).appRtt).toFixed(3))
    const overseas = Number(meanMs(phoneStats(OVERSEAS).appRtt).toFixed(3))
    expect(Number(note![1]), 'the measured base round trip the note quotes').toBe(base)
    expect(Number(note![4]), 'the measured overseas round trip the note quotes').toBe(overseas)
    // 「比算出来的多 0.188」 — the gap the note names, against its own two numbers
    expect(Number(note![2]), 'the gap between hand-check and measurement')
      .toBeCloseTo(base - Number(sum![4]), 3)
    // and both quoted measurements are the same figures the table prints
    expect(ms(rows()[0][1]), 'the base row of the table').toBe(base)
    expect(ms(rows()[3][1]), 'the overseas row of the table').toBe(overseas)
  })
})

/**
 * **Every other figure the prose prints, read back out of it.**
 *
 * The describe above converted this lesson's table and its hand-check — twenty cells and the
 * arithmetic under them. This converts the sixty-odd that are left: the three legs in `picture`,
 * the six steps, the game-mode pair, the four default endpoints in `sources`, the measurement
 * `limits` quotes, all three `observe` lines, both `tryThis` paragraphs and the two quiz
 * explanations. `@wan-rtt` was planted by hand when it was written and the instrument has never
 * walked it figure by figure.
 *
 * **The reads worth naming:**
 *
 *  - **a variant's own label carries figures**, and this is the first lesson in the programme
 *    whose read-back reaches one: 「海外服务器 80/20/2」 is three numbers in a string a reader
 *    picks from a menu, and all three are that server's own fields.
 *  - **the 64-byte probe is identified by what it is, not by its size.** The lesson prints the
 *    size, so reading the size off the records by filtering on it would be circular. What marks
 *    it instead is that it exists only when there is a server to answer it: the uplink sizes of
 *    the base scene minus those of the server-less variant are exactly that one figure.
 *  - **「不到千分之四」 is read strictly from both sides**, like every bound this programme has
 *    found a defect in: the ratio has to be under the printed thousandth and over the one below
 *    it, so only the measured value passes.
 *  - **the two CWmins are the engine's own table**, so 「视频那一类是 7，而尽力而为那一类是 15」
 *    is read against `EDCA_PARAMS` rather than against a copy of the standard's numbers.
 *
 * **One figure is exempt, class (a):** 「腾讯服务器……散布约 20 毫秒」. That spread is from an
 * outside measurement this repository holds no record of, and nothing in the engine can answer
 * it. What the sentence uses the measurement for IS checked — that the median it reports falls
 * strictly between the two presets the engine ships, which is the whole of its support for them.
 */
describe('wan-rtt · every other figure the prose prints, read back out of it', () => {
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
  const PIC = blockText(wanRtt.picture)
  const NUMS = blockText(wanRtt.numbers)
  const SRC = blockText(wanRtt.sources)
  const LIM = blockText(wanRtt.limits)
  const OBS = blockText(wanRtt.observe)
  const TRY = blockText(wanRtt.tryThis)
  const QUIZ = blockText(wanRtt.quiz)

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const m = re.exec(text)
    expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const every = (text: string, re: RegExp, what: string, want: number): string[][] => {
    const ms = [...text.matchAll(re)]
    expect(ms.length, `${what}: the lesson prints this ${ms.length} times, not ${want}`).toBe(want)
    return ms.map((m) => m.slice(1))
  }
  /** A figure READ off the lesson against a measurement, at the precision it was printed to. */
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  /**
   * A Chinese numeral, including the hundreds `zhNumeral` stops short of — this lesson prints
   * 「二百一十帧」 and 「涨了一百倍」, and both are figures a reader sees.
   */
  const zh = (x: string): number => {
    let total = 0
    let cur = 0
    for (const ch of x.replace(/两/g, '二')) {
      const d = '零一二三四五六七八九'.indexOf(ch)
      if (d >= 0) { cur = d; continue }
      const unit = { 十: 10, 百: 100, 千: 1000 }[ch]
      expect(unit, `「${x}」 is not a numeral this test can read`).toBeDefined()
      total += (cur || 1) * unit!
      cur = 0
    }
    return total + cur
  }
  /** The game endpoint the base scene ships, which is what every WAN figure is about. */
  const game = wanRtt.scenario().servers.find((x) => x.kind === 'game')!
  const overseas = wanRtt.variants![OVERSEAS]!.scenario().servers.find((x) => x.kind === 'game')!
  const recs = (v?: number): TLRecord[] => runOf(wanRtt, v, RUN_NS)
  /** The phone's own uplink MSDUs, as the queue sees them. */
  const uplink = (v?: number) => ofType(recs(v), 'ENQUEUE').filter((r) => r.node === 'sta-1')
  /** Mean gap between consecutive arrivals, in milliseconds. */
  const meanGapMs = (ts: number[]): number => (ts[ts.length - 1]! - ts[0]!) / (ts.length - 1) / MS

  it('reads the three legs of one round trip: the air, the WAN and the server', () => {
    /*
     * **The one-way leg is printed three times**, and the sweep of 2026-10-13 found the third:
     * `picture` says 「建成单向」, the steps say 「走单向」 on the way out and 「答复再走一次」 on
     * the way back. The first pattern written here matched two of the three and the count
     * assertion agreed with it, because an `every(..., n)` counts what the pattern reaches and
     * not what the lesson prints — the ledger's own note on this now.
     */
    for (const [oneWay] of every([PIC, NUMS].join('\n'),
      /(?:建成单向|走单向|答复再走一次) ([\d.]+) 毫秒/g,
      'the one-way WAN delay, printed three times', 3)) {
      same(oneWay!, game.rttMs / 2, 'the one-way WAN delay, which is half the endpoint’s round trip')
    }
    // 「服务器自己算答案的 2 毫秒」 and the same figure in the steps.
    for (const [proc] of every([PIC, NUMS].join('\n'), /(?:算答案的|等) (\d+) 毫秒(?:。|处理)/g,
      'the server’s processing time, printed twice', 2)) {
      same(proc!, game.processMs, 'the server’s own processing time')
    }
    // 「海外那一档是 40 毫秒」: the other endpoint's one-way leg.
    same(raw(NUMS, /海外那一档是 (\d+) 毫秒/, 'the overseas one-way leg')[0]!, overseas.rttMs / 2,
      'the overseas endpoint’s one-way delay')
    // 「每隔大约 30 毫秒」: the game stream's own mean gap, to the ten it is printed at.
    const ticks = uplink().filter((r) => r.bytes !== 64).map((r) => r.t)
    const [gap] = figs(PIC, /每隔大约 (\d+) 毫秒向服务器送一个状态包/, '`picture` on the tick rate')
    expect(gap, 'the mean gap between two state packets, to the nearest ten milliseconds')
      .toBe(Math.round(meanGapMs(ticks) / 10) * 10)
    expect(meanGapMs(ticks), `the measured mean gap is ${meanGapMs(ticks).toFixed(1)} ms`)
      .toBeGreaterThan(gap! - 5)
    expect(meanGapMs(ticks), 'and inside the ten it is printed at').toBeLessThan(gap! + 5)
  })

  it('reads the quiet room’s two figures and the ratio between them, strictly', () => {
    const s = phoneStats(undefined)
    const air = Number(meanMs(s.txLatency).toFixed(3))
    const trip = Number(meanMs(s.appRtt).toFixed(3))
    // 「花的都是 0.106 毫秒，二百一十帧一帧不差」: one value, and how many frames carry it.
    const [printed, frames] = raw(PIC, /花的都是 ([\d.]+) 毫秒，(.+?)帧一帧不差/,
      '`picture` on the quiet room’s air')
    same(printed!, air, 'the enqueue-to-ack of the quiet room')
    expect(s.txLatency.n, 'the frames that all took exactly that long').toBe(zh(frames!))
    expect(s.txLatency.maxNs, 'and 「一帧不差」 means the worst is the mean')
      .toBe(Math.round(s.txLatency.sumNs / s.txLatency.n))
    // The mean round trip, and the ratio the lesson divides out of the two.
    same(raw(PIC, /应用往返的均值是 ([\d.]+) 毫秒/, '`picture` on the round trip')[0]!, trip,
      'the mean application round trip')
    const [ratio] = figs(PIC, /两个数相除是 ([\d.]+)/, '`picture` on the ratio')
    same(String(ratio), air / trip, 'the ratio between the air and the whole round trip')
    /*
     * **「不到千分之四」 is an inequality, so it is read from both sides.** The ratio has to be
     * under the printed thousandth and over the one below it, which leaves exactly one figure
     * that passes — the discipline that caught both of `@edca-tamper`'s bounds.
     */
    const [perMille] = every([PIC, QUIZ].join('\n'), /不到千分之(.)/g, 'the bound, printed twice', 2)
      .map(([x]) => zh(x!))
    expect(air / trip, 'under the bound the lesson prints').toBeLessThan(perMille! / 1000)
    expect(air / trip, 'and over the thousandth below it').toBeGreaterThan((perMille! - 1) / 1000)
  })

  it('reads the busy room’s rise, and the hundredfold it is printed as', () => {
    const quiet = phoneStats(undefined)
    const busy = phoneStats(BUSY)
    const [from, to] = raw(PIC, /立刻从 ([\d.]+) 毫秒涨到 ([\d.]+) 毫秒/, '`picture` on the air')
    same(from!, meanMs(quiet.txLatency), 'the air in the quiet room')
    same(to!, meanMs(busy.txLatency), 'and in the busy one')
    const times = zh(raw(PIC, /涨了(.+?)倍/, '`picture` on the factor')[0]!)
    expect(Math.round(meanMs(busy.txLatency) / meanMs(quiet.txLatency) / 100) * 100,
      'the factor, to the hundred it is printed at').toBe(times)
    // And the round trip, which moves by half rather than by a hundred.
    const [tFrom, tTo] = raw(PIC, /应用往返只从 ([\d.]+) 涨到 ([\d.]+) 毫秒/,
      '`picture` on the round trip’s rise')
    same(tFrom!, meanMs(quiet.appRtt), 'the round trip in the quiet room')
    same(tTo!, meanMs(busy.appRtt), 'and in the busy one')
    expect(meanMs(busy.appRtt) / meanMs(quiet.appRtt), 'which is nowhere near a hundredfold')
      .toBeLessThan(2)
    // 「因为广域网那 25 毫秒一点没变」, printed in `picture` and again in `observe`.
    for (const [ms] of every([PIC, OBS].join('\n'), /广域网那 (\d+) 毫秒(?:一点没变|一动不动)/g,
      'the WAN that does not move, printed twice', 2)) {
      same(ms!, game.rttMs, 'the endpoint’s own round trip')
    }
  })

  it('reads the table heading’s three endpoint fields, and the overseas variant’s label', () => {
    const t = wanRtt.numbers!.find((b) => b.kind === 'table') as { heading: string }
    const [rtt, jitter, proc] = figs(t.heading, /一台 (\d+)\/(\d+)\/(\d+) 的游戏服务器/,
      'the table heading on the endpoint')
    expect([rtt, jitter, proc], 'the game endpoint’s own three fields')
      .toEqual([game.rttMs, game.jitterMs, game.processMs])
    /*
     * **A variant's label is reader-visible text with figures in it** — the first time this
     * programme's read-back reaches one. 「海外服务器 80/20/2」 is what a reader picks from a
     * menu, and all three figures are that scene's own endpoint.
     */
    const [oRtt, oJitter, oProc] = figs(wanRtt.variants![OVERSEAS]!.label,
      /(\d+)\/(\d+)\/(\d+)/, 'the overseas variant’s own label')
    expect([oRtt, oJitter, oProc], 'the overseas endpoint’s three fields')
      .toEqual([overseas.rttMs, overseas.jitterMs, overseas.processMs])
  })

  it('reads the jitter the hand-check adds, out of the endpoint’s own field', () => {
    const f = wanRtt.numbers!.find((b) => b.kind === 'formula') as { text: string; note: string }
    const [lo, hi, expected] = figs(f.text, /两个方向各从 (\d+) 到 ([\d.]+) 毫秒均匀抽，合起来期望 ([\d.]+)/,
      'the formula on the jitter')
    expect(lo, 'the draw starts at zero').toBe(0)
    same(String(hi), game.jitterMs / 2, 'one direction’s jitter, which is half the endpoint’s field')
    expect(expected, 'and two draws of that have half the endpoint’s jitter as their expectation')
      .toBe(2 * ((lo! + hi!) / 2))
    expect(expected, 'which is where the figure comes from').toBe(game.jitterMs / 2)
    // The overseas hand-check, whose three terms the note prints too.
    const [oRtt, oProc, oJitter, oSum] = figs(f.note, /(\d+) \+ (\d+) \+ (\d+) = (\d+)，实测/,
      'the note on the overseas arithmetic')
    expect(oRtt, 'the overseas round trip').toBe(overseas.rttMs)
    expect(oProc, 'its processing time').toBe(overseas.processMs)
    expect(oJitter, 'and the expectation of its two jitter draws, which is half its field')
      .toBe(overseas.jitterMs / 2)
    expect(oRtt! + oProc! + oJitter!, 'the sum the note prints').toBe(oSum)
  })

  it('reads the probe that makes a round trip measurable, by what distinguishes it', () => {
    /*
     * **The probe is identified by its existence, not by its size.** The lesson prints
     * 「每 250 毫秒的那个 64 字节小包」, so filtering the records on 64 bytes would be reading the
     * figure back against itself. What marks the probe is that it is there only when a server is:
     * the uplink sizes of the base scene minus those of the server-less variant are exactly it.
     */
    const sizes = (v?: number): Set<number> => new Set(uplink(v).map((r) => r.bytes))
    const withServer = sizes(undefined)
    const without = sizes(NO_SERVERS)
    const extra = [...withServer].filter((b) => !without.has(b))
    const [period, bytes] = figs(NUMS, /每 (\d+) 毫秒的那个 (\d+) 字节小包/, 'the steps on the probe')
    expect(extra, 'the one uplink size that exists only when there is a server to answer').toEqual([bytes])
    /*
     * **Its period is read through the envelope the engine draws inside, not off the sample
     * mean.** Each probe is scheduled at the period times a factor drawn in [0.9, 1.1], so
     * nineteen gaps have a mean of 242 ms — four per cent under the nominal 250, which no
     * rounding of the mean recovers. What the period IS, exactly, is the number whose tenth
     * contains every gap: the widest gap measured is 271.1 ms, so the period is at least
     * 246.4 ms, and the narrowest is 225.4, so it is at most 250.5. One multiple of ten is left.
     */
    const ts = uplink().filter((r) => r.bytes === bytes).map((r) => r.t)
    const gaps = ts.slice(1).map((t, i) => (t - ts[i]!) / MS)
    expect(Math.min(...gaps), `the narrowest of ${gaps.length} gaps`)
      .toBeGreaterThanOrEqual(0.9 * period!)
    expect(Math.max(...gaps), 'and the widest').toBeLessThanOrEqual(1.1 * period!)
    expect(period! % 10, 'the period is printed as a round number of milliseconds').toBe(0)
    // 「五秒钟得二十个样本」: the samples the mean is taken over, and the window they come from.
    const [secs, samples] = raw(NUMS, /([一-龥]{1,3})秒钟得([一-龥]{1,3})个样本/,
      'the steps on the samples')
    expect(zh(secs!) * 1000 * MS, 'the window every figure is measured over').toBe(RUN_NS)
    expect(phoneStats(undefined).appRtt.n, 'the round-trip samples it holds').toBe(zh(samples!))
    // `sources` prints the pair a second time.
    const [srcPeriod, srcBytes] = figs(SRC, /每 (\d+) 毫秒一个 (\d+) 字节小包/, '`sources` on the probe')
    expect([srcPeriod, srcBytes], 'the same two figures').toEqual([period, bytes])
  })

  it('reads the one field the game mode moves, and the two it moves it between', () => {
    // 「类别从 1 变成 2」, in `numbers` and in the quiz, against the categories the records carry.
    for (const [was, now] of every([NUMS, QUIZ].join('\n'), /类别从 (\d+) 变成 (\d+)/g,
      'the category the game mode moves, printed twice', 2)) {
      expect(acsOf(recs(BUSY)), 'the category the phone’s frames sit in without it').toEqual([val(was!)])
      expect(acsOf(recs(ACCEL)), 'and with it').toEqual([val(now!)])
    }
    // The two figures it moves, mean and worst.
    const busy = phoneStats(BUSY)
    const accel = phoneStats(ACCEL)
    const [qFrom, qTo] = raw(NUMS, /把忙起来时的排队从 ([\d.]+) 毫秒压到 ([\d.]+) 毫秒/,
      '`numbers` on the queueing')
    same(qFrom!, meanMs(busy.txLatency), 'the queueing without the game mode')
    same(qTo!, meanMs(accel.txLatency), 'and with it')
    const [mFrom, mTo] = raw(NUMS, /最大值从 ([\d.]+) 毫秒压到 ([\d.]+) 毫秒/, '`numbers` on the worst')
    same(mFrom!, maxMs(busy.txLatency), 'the worst without it')
    same(mTo!, maxMs(accel.txLatency), 'and with it')
    // The paragraph's own claim: the tail comes down harder than the mean.
    expect(maxMs(busy.txLatency) / maxMs(accel.txLatency), 'the tail’s factor')
      .toBeGreaterThan(meanMs(busy.txLatency) / meanMs(accel.txLatency))
  })

  it('reads the quiet room where the same switch does nothing', () => {
    const quiet = ScenarioSchema.parse({ ...wanRtt.scenario() })
    const accelQuiet = ScenarioSchema.parse({
      ...quiet, nodes: quiet.nodes.map((n) => (n.kind === 'ap' ? { ...n, gameAccel: true } : n)),
    })
    const txOk = (sc: Scenario): number => {
      const vs = initViewState(sc)
      for (const r of [...new Simulation(sc).runUntil(RUN_NS).records]) applyRecord(vs, r)
      return vs.nodes['sta-1'].stats.txOk
    }
    const [frames] = figs(NUMS, /收到的帧数两边都是 (\d+)，一帧不差/, '`numbers` on the quiet room')
    expect([txOk(quiet), txOk(accelQuiet)], 'the frames each side gets out').toEqual([frames, frames])
    /*
     * **The records that differ are the countdowns, not the draws** — the correction this
     * read-back produced. The paragraph used to say 「只有退避的抽签记录少了一些」, and the draw
     * records are the one thing that does NOT move: 210 of them either way, because the phone
     * still contends once per frame. What halves is `BACKOFF_DEC`, since a window of 7 has
     * fewer slots to count down than one of 15. The figure printed with it is also the figure
     * 「一帧不差」 is about, and it was 254 — a number this scene does not produce anywhere.
     */
    const decs = (sc: Scenario): number => [...new Simulation(sc).runUntil(RUN_NS).records]
      .filter((r) => r.type === 'BACKOFF_DEC' && r.node === 'sta-1').length
    const draws = (sc: Scenario): number => [...new Simulation(sc).runUntil(RUN_NS).records]
      .filter((r) => r.type === 'BACKOFF_DRAW' && r.node === 'sta-1').length
    const [was, now] = figs(NUMS, /倒数记录从 ([\d ]+) 条降到 ([\d ]+) 条/,
      '`numbers` on the countdown records')
    expect([decs(quiet), decs(accelQuiet)], 'the countdown records, either way').toEqual([was, now])
    expect(draws(quiet), 'while the draws themselves do not move').toBe(draws(accelQuiet))
    expect(Math.round((10 * now!) / was!) / 10, 'and what is left is about half, as 「少了一半」 claims')
      .toBe(0.5)
    // The two windows the switch draws from, out of the engine's own parameter table.
    const [be, vi] = figs(NUMS, /CWmin）(\d+) 变成了视频那一类的 (\d+)/,
      '`numbers` on the two windows')
    expect(vi, 'the video category’s minimum window').toBe(EDCA_PARAMS.find((p) => p.name === 'VI')!.cwMin)
    expect(be, 'and best effort’s').toBe(EDCA_PARAMS.find((p) => p.name === 'BE')!.cwMin)
    // The quiz prints the same pair the other way round.
    const [qBe, qVi] = figs(QUIZ, /抽签范围从 (\d+) 变成 (\d+)/, 'the quiz on the two windows')
    expect([qBe, qVi], 'the same two windows, in the order the switch moves between them')
      .toEqual([be, vi])
  })

  it('reads `sources` on the four default endpoints, and `limits` on the three chosen figures', () => {
    const four = figs(SRC, /四台默认服务器的 (\d+)\/(\d+)\/(\d+)\/(\d+) 毫秒/,
      '`sources` on the four endpoints')
    expect(four, 'the round trip of every endpoint the engine ships, in order')
      .toEqual(DEFAULT_SERVERS.map((x) => x.rttMs))
    // 「25 毫秒、3 毫秒抖动、2 毫秒处理这三个数是本仿真器选的」
    const [rtt, jitter, proc] = figs(LIM, /(\d+) 毫秒、(\d+) 毫秒抖动、(\d+) 毫秒处理/,
      '`limits` on the three chosen figures')
    expect([rtt, jitter, proc], 'the game endpoint’s own three fields')
      .toEqual([game.rttMs, game.jitterMs, game.processMs])
    /*
     * **The outside measurement is exempt in both its figures, class (a).** 「腾讯服务器中位往返
     * 49 毫秒、散布约 20 毫秒」 is one measurement taken outside this repository, which holds no
     * record of either half and whose engine can answer neither. The sweep of 2026-10-13 walked
     * through the 49 as well as the 20, and tightening it is not possible: any median between the
     * two presets supports them exactly as well, which is all the sentence claims. So what is
     * checked is that claim — the median falls strictly between the two presets the engine ships,
     * and those two presets are read off the engine rather than off the sentence.
     */
    const [median] = figs(LIM, /中位往返 (\d+) 毫秒/, '`limits` on the measured median')
    const [domestic, abroad] = figs(LIM, /落在 (\d+) 毫秒的国内预设与 (\d+) 毫秒的海外预设之间/,
      '`limits` on the two presets')
    expect(domestic, 'the domestic preset is the endpoint this lesson ships').toBe(game.rttMs)
    expect(abroad, 'and the overseas one is its variant’s').toBe(overseas.rttMs)
    expect(median, 'the measured median really does fall between them').toBeGreaterThan(domestic!)
    expect(median, 'strictly, from both sides').toBeLessThan(abroad!)
    expect(LIM, 'and the exempt spread is still presented as an outside measurement')
      .toContain('散布约 20 毫秒')
    // 「海外那一档的 80/20 同样是选的」: that endpoint's own two fields.
    const [oRtt, oJitter] = figs(LIM, /海外那一档的 (\d+)\/(\d+) 同样是选的/, '`limits` on the overseas pair')
    expect([oRtt, oJitter], 'the overseas endpoint’s round trip and jitter')
      .toEqual([overseas.rttMs, overseas.jitterMs])
    // The round trip the first `limits` entry quotes, which is the busy room's own.
    same(raw(LIM, /所以这里的 ([\d.]+) 毫秒是一个被动等出来的数/, '`limits` on the busy round trip')[0]!,
      meanMs(phoneStats(BUSY).appRtt), 'the busy room’s mean round trip')
  })

  it('reads the traffic `limits` describes, off the records it describes', () => {
    /*
     * **Measured over thirty seconds, on the variant with no probe in the way.** Both figures
     * are properties of the histogram `traffic.ts` draws from rather than of this round: the
     * gap distribution has a tail (one draw in a hundred lands past 200 ms), so a five-second
     * sample of it means 35 ms and a thirty-second one 31. The lesson prints the histogram's
     * own figure, and thirty seconds is where the sample reaches it.
     */
    const ul = ofType([...new Simulation(wanRtt.variants![NO_SERVERS]!.scenario())
      .runUntil(30_000 * MS).records], 'ENQUEUE').filter((r) => r.node === 'sta-1')
    const bytes = ul.map((r) => r.bytes)
    const [gap, lo, hi] = figs(LIM, /上行平均每 (\d+) 毫秒一个 (\d+) 到 (\d+) 字节的包/,
      '`limits` on the uplink stream')
    expect([Math.min(...bytes), Math.max(...bytes)], 'the sizes the game stream sends')
      .toEqual([lo, hi])
    const gapMs = meanGapMs(ul.map((r) => r.t))
    expect(Math.round(gapMs / 10) * 10, 'the mean gap, to the ten it is printed at').toBe(gap)
    expect(Math.abs(gapMs - gap!) / gap!, `the measured mean gap is ${gapMs.toFixed(1)} ms`)
      .toBeLessThan(0.15)
    // The downlink: the server's own state tick, which is the other half of the same sentence.
    const dl = ofType(recs(), 'ENQUEUE').filter((r) => r.node === 'ap' && r.bytes > 100)
    same(raw(LIM, /下行 (\d+) 毫秒一个状态帧/, '`limits` on the downlink tick')[0]!,
      Math.round(meanGapMs(dl.map((r) => r.t)) / 5) * 5, 'the state tick, to the five it is printed at')
  })

  it('reads all three observe lines and both tryThis paragraphs', () => {
    const s = phoneStats(undefined)
    const [trip, air, ratio] = raw(OBS, /「应用往返」读 ([\d.]+) 毫秒，「入队到确认」读 ([\d.]+) 毫秒。把两个数相除：([\d.]+)/,
      'the first observe line')
    same(trip!, meanMs(s.appRtt), 'the round trip a reader reads off the panel')
    same(air!, meanMs(s.txLatency), 'and the air under it')
    same(ratio!, meanMs(s.txLatency) / meanMs(s.appRtt), 'the ratio of the two')
    // The server-less variant: the air is still measurable, and it is a different figure.
    same(raw(OBS, /入队到确认仍然是 ([\d.]+) 毫秒/, 'the second observe line')[0]!,
      meanMs(phoneStats(NO_SERVERS).txLatency), 'the air with no server in the room')
    // The busy variant, printed a third time here.
    const [busyAir, busyTrip] = raw(OBS, /入队到确认涨到 ([\d.]+) 毫秒，应用往返涨到 ([\d.]+) 毫秒/,
      'the third observe line')
    same(busyAir!, meanMs(phoneStats(BUSY).txLatency), 'the busy room’s air, in `observe`')
    same(busyTrip!, meanMs(phoneStats(BUSY).appRtt), 'and its round trip')
    // `tryThis`: the two worst round trips, and the two reductions the paragraph names.
    const [worstBusy, worstAccel] = raw(TRY, /([\d.]+) 毫秒对 ([\d.]+) 毫秒/, '`tryThis` on the two maxima')
    same(worstBusy!, maxMs(phoneStats(BUSY).appRtt), 'the worst round trip without the game mode')
    same(worstAccel!, maxMs(phoneStats(ACCEL).appRtt), 'and with it')
    const meanCut = 1 - meanMs(phoneStats(ACCEL).appRtt) / meanMs(phoneStats(BUSY).appRtt)
    const maxCut = 1 - maxMs(phoneStats(ACCEL).appRtt) / maxMs(phoneStats(BUSY).appRtt)
    /*
     * **Both fractions are read as the nearest one of their own kind**, which is the only thing
     * a fraction printed in characters can mean: 「降了 N 分之一」 has to be the unit fraction
     * closest to the measured fall, and 「降了 N 成」 the closest tenth. Anything looser admits
     * two neighbouring characters at once, which is how 「三分之一」 stood here against a fall of
     * 25.6 % until this read-back was written.
     */
    const [denom, one] = raw(TRY, /均值降了(.)分之(.)/, '`tryThis` on the mean’s fall')
    expect(zh(one!), 'a unit fraction').toBe(1)
    expect(Math.round(1 / meanCut), `the mean falls by ${(100 * meanCut).toFixed(1)} %`).toBe(zh(denom!))
    const tenths = zh(raw(TRY, /最大值降了(.)成/, '`tryThis` on the maximum’s fall')[0]!)
    expect(Math.round(10 * maxCut), `the maximum falls by ${(100 * maxCut).toFixed(1)} %`).toBe(tenths)
    // And the paragraph's claim: the tail gives way harder than the mean.
    expect(maxCut, 'the tail falls further than the mean').toBeGreaterThan(meanCut)
    /*
     * **The figure a reader is told to type is the schema's own floor**, and that is what pins
     * it: 「把服务器的往返改成 0」 works as an experiment because zero is the smallest round trip
     * a server may carry, so the scene it builds is the extreme case rather than one case among
     * many. One millisecond less is refused. The sweep of 2026-10-13 walked through this figure
     * while the test only built the scene and checked it still had a server — which any value
     * satisfies.
     */
    const [zero] = figs(TRY, /把服务器的往返改成 (\d+) 再载入/, '`tryThis` on the zero-latency server')
    expect(ScenarioSchema.safeParse({
      ...wanRtt.scenario(),
      servers: wanRtt.scenario().servers.map((x) => ({ ...x, rttMs: zero! - 1 })),
    }).success, 'one less than the printed figure is refused by the schema').toBe(false)
    expect(TRY, 'and the paragraph names it in characters too').toContain('零时延的服务器')
    const zeroSc = ScenarioSchema.parse({
      ...wanRtt.scenario(),
      servers: wanRtt.scenario().servers.map((x) => ({ ...x, rttMs: zero! })),
    })
    const vs = initViewState(zeroSc)
    const zrecs = [...new Simulation(zeroSc).runUntil(RUN_NS).records]
    for (const r of zrecs) applyRecord(vs, r)
    expect(vs.nodes['sta-1'].stats.appRtt.n, 'a zero-latency server is still a server')
      .toBeGreaterThan(0)
    expect(ofType(zrecs, 'WAN_TX').length, 'and the WAN records are still there').toBeGreaterThan(0)
  })

  it('reads both quiz explanations, which are the hand-check in words', () => {
    const s = phoneStats(undefined)
    same(raw(QUIZ, /这台手机的应用往返是 ([\d.]+) 毫秒/, 'the first quiz question')[0]!,
      meanMs(s.appRtt), 'the round trip the question asks about')
    const [rtt, proc, jitter] = figs(QUIZ, /(\d+) 毫秒是广域网来回，(\d+) 毫秒是服务器算答案，([\d.]+) 毫秒是抖动的期望/,
      'the first quiz explanation')
    expect([rtt, proc, jitter], 'the three terms, which are the endpoint’s own fields')
      .toEqual([game.rttMs, game.processMs, game.jitterMs / 2])
    const [left] = figs(QUIZ, /剩下给空口的只有 ([\d.]+) 毫秒/, 'the quiz on what is left for the air')
    same(String(left), meanMs(s.appRtt) - (rtt! + proc! + jitter!), 'what is left over for the air')
    // …and of that, the enqueue-to-ack is the figure the answer gives — printed twice in the quiz,
    // once as the option a reader picks and once in the explanation under it.
    same(raw(QUIZ, /([\d.]+) 毫秒，不到千分之/, 'the quiz option a reader picks')[0]!,
      meanMs(s.txLatency), 'the enqueue-to-ack the right option names')
    same(raw(QUIZ, /入队到确认那一段是 ([\d.]+) 毫秒/, 'the quiz explanation')[0]!,
      meanMs(s.txLatency), 'and the same figure in the explanation')
  })
})
