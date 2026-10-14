/**
 * Every empirical claim in "一帧的七次尝试", the first half of the old
 * `retries-queues` (2026-09-25 re-pacing, §2 M5), measured against the lesson's
 * own scenario. Each assertion quotes the sentence it guards; standard constants
 * are checked against the engine's exports.
 *
 * Fifteen pins left this file for tests/course/queues.test.ts with the material
 * they guard: the queue defaults, the three-drop-reason table, the three-setting
 * comparison, the waiting times, the 2644 frames all three runs deliver, the 987
 * aged uploads, the queue-full and lifetime instants, the two queue procedure
 * steps, and the head-of-line depth. Nothing was deleted — every one of them is
 * asserted next door against the same three runs — and both variants stay
 * declared here, because the kit requires both halves of a split to carry the
 * same variant list.
 *
 * The scene and both variants are unchanged, so the recorded timeline hashes are
 * the ones already in tests/fixtures/lesson-hashes.json.
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { retriesQueues, retryFanTiming } from '../../src/course/tier1/retries-queues'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import {
  ACK_TIMEOUT_NS, CW_MAX, CW_MIN, RX_START_DELAY_NS, SHORT_RETRY_LIMIT, SIFS_NS, SLOT_NS,
} from '../../src/engine/phy'
import type { TLRecord } from '../../src/model/records'
import { decodeFrame, fmtRecord } from '../../src/ui/format'
import { lessonShapeSuite } from './kit'
import { MODULES } from '../../src/course/curriculum'
import { STRINGS } from '../../src/ui/i18n'
import { wanRtt } from '../../src/course/tier2/wan-rtt'

const MS = 1_000_000
const RUN_NS = 3000 * MS

type Drop = Extract<TLRecord, { type: 'DROP' }>
type Retry = Extract<TLRecord, { type: 'RETRY' }>

const memo = new Map<string, TLRecord[]>()
/** Records of the base scenario (variant undefined) or a variant, memoised. */
function recs(variant?: number): TLRecord[] {
  const key = String(variant ?? 'base')
  if (!memo.has(key)) {
    const sc: Scenario = variant === undefined
      ? retriesQueues.scenario()
      : retriesQueues.variants![variant].scenario()
    memo.set(key, [...new Simulation(sc).runUntil(RUN_NS).records])
  }
  return memo.get(key)!
}
const ofType = <K extends TLRecord['type']>(rs: TLRecord[], type: K) =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type)
const drops = (rs: TLRecord[], reason: Drop['reason'], node?: string): Drop[] =>
  ofType(rs, 'DROP').filter((r) => r.reason === reason && (node === undefined || r.node === node))

/** MSDUs removed from a queue without being dropped — i.e. acknowledged. */
function delivered(rs: TLRecord[]): Record<string, number> {
  const dropped = new Set(ofType(rs, 'DROP').map((r) => r.msduId))
  const out: Record<string, number> = {}
  for (const r of ofType(rs, 'DEQUEUE')) if (!dropped.has(r.msduId)) out[r.node] = (out[r.node] ?? 0) + 1
  return out
}

lessonShapeSuite(retriesQueues, { runNs: RUN_NS })

describe('retries-queues · the scene', () => {
  it('scenario and variants pass the scenario schema', () => {
    expect(() => ScenarioSchema.parse(retriesQueues.scenario())).not.toThrow()
    for (const v of retriesQueues.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
    expect(retriesQueues.variants!.length).toBe(2)
  })

  it('names the lessons whose words it uses', () => {
    expect(MODULES[retriesQueues.module].title).toBe('听不见的邻居与损失')
    // §6 of the re-pacing plan: the deadline and the doubling this lesson leans on are
    // `collisions-cw`'s, not `backoff`'s, after the split of M4.
    expect(retriesQueues.needs).toEqual(['airtime', 'collisions-cw'])
    // `queue` and `lifetime` went to `queues` with the line and the clock they name.
    expect(retriesQueues.terms!.map((t) => t.term)).toEqual(['retry', 'retry limit'])
  })

  it('keeps the three jumps about one frame, and each occurs in the run', () => {
    expect(retriesQueues.jumps.map((j) => j.label)).toEqual([
      '第一次重传', '第一次重发（Retry 位置位）', '第一次因重传上限丢帧',
    ])
    for (const j of retriesQueues.jumps) expect(recs().some(j.find), j.label).toBe(true)
  })

  it('Hidden A and Hidden B never hear each other', () => {
    // the scene is the corridor house: two uploaders in rooms that cannot hear each other
    const rs = recs()
    const hears = (rx: string, tx: string) => rs.some((r) => r.type === 'RX_START' && r.node === rx && r.from === tx)
    expect(hears('sta-1', 'sta-2')).toBe(false)
    expect(hears('sta-2', 'sta-1')).toBe(false)
  })
})

describe('retries-queues · standard constants', () => {
  it('dot11ShortRetryLimit is 7', () => {
    expect(SHORT_RETRY_LIMIT).toBe(7)
  })

  it('the CW ladder is 15 → 31 → … → 1023, then back to 15 at the limit', () => {
    // the table's "之后的 CW" column: 15 → 31 → 63 → 127 → 255 → 511 → 1023, then back to 15
    const ladder: number[] = []
    let cw = CW_MIN
    for (let k = 1; k <= SHORT_RETRY_LIMIT; k++) {
      cw = k === SHORT_RETRY_LIMIT ? CW_MIN : Math.min(2 * cw + 1, CW_MAX)
      ladder.push(cw)
    }
    expect([CW_MIN, ...ladder]).toEqual([15, 31, 63, 127, 255, 511, 1023, 15])
  })
})

describe('retries-queues · the retry model', () => {
  const rs = recs()
  const firstRl = drops(rs, 'retryLimit')[0]

  it("Hidden B's first frame is dropped at the retry limit at 27 689 µs after seven attempts", () => {
    expect(firstRl.node).toBe('sta-2')
    expect(firstRl.t).toBe(27_689_118)
    const attempts = ofType(rs, 'TX_START').filter((r) => r.frame.msduId === firstRl.msduId)
    expect(attempts.length).toBe(SHORT_RETRY_LIMIT)
    // the table's 发送于 / 速率 / 重发比特 columns
    expect(attempts.map((a) => [Math.round(a.t / 1000), a.frame.mbps, a.frame.retryFlag ? 1 : 0])).toEqual([
      [0, 48, 0], [526, 48, 1], [1683, 36, 1], [4544, 36, 1], [6999, 24, 1], [13_632, 24, 1], [26_940, 18, 1],
    ])
    // 「七次尝试的序列号都是同一个。」
    expect(new Set(attempts.map((a) => a.frame.seqNo))).toEqual(new Set([0]))
    // 「第一次尝试占 276 µs 空口时间，第七次要 704 µs。」
    expect(attempts[0].frame.txTimeNs).toBe(276_000)
    expect(attempts[6].frame.txTimeNs).toBe(704_000)
  })

  it('its RETRY records count 1…7 in both counters, and CW walks the ladder before resetting', () => {
    // the table's 记录失败 and 之后的 CW columns
    const retries = ofType(rs, 'RETRY').filter((r) => r.msduId === firstRl.msduId)
    expect(retries.map((r) => [Math.round(r.t / 1000), r.retries, r.qsrc])).toEqual([
      [321, 1, 1], [847, 2, 2], [2092, 3, 3], [4953, 4, 4], [7576, 5, 5], [14_209, 6, 6], [27_689, 7, 7],
    ])
    const cw = ofType(rs, 'CW_CHANGE').filter((r) => r.node === 'sta-2' && r.t <= firstRl.t)
    expect(cw.map((r) => r.cw)).toEqual([31, 63, 127, 255, 511, 1023, 15])
    expect(cw[cw.length - 1].t).toBe(firstRl.t)
  })

  it('the next frame leaves at 27 741 µs with sequence number 1 and the Retry bit clear', () => {
    // the observation 「它的下一帧序列号是 1，重发比特清零」, and the figure's 下一帧 lane
    const next = ofType(rs, 'TX_START').find((r) => r.node === 'sta-2' && r.t > firstRl.t)!
    expect(Math.round(next.t / 1000)).toBe(27_741)
    expect(next.frame.seqNo).toBe(1)
    expect(next.frame.retryFlag).toBe(false)
  })

  it('a retransmission keeps its sequence number and sets the Retry bit', () => {
    // steps 3: 「序列号照旧，只是带上了重发比特——所以每一次尝试都是同一帧」
    const seqOf = new Map<number, number>()
    let checked = 0
    for (const r of ofType(rs, 'TX_START')) {
      if (r.frame.kind !== 'data' || r.frame.msduId === undefined || r.frame.seqNo === undefined) continue
      const known = seqOf.get(r.frame.msduId)
      if (known === undefined) {
        seqOf.set(r.frame.msduId, r.frame.seqNo)
        expect(r.frame.retryFlag).toBe(false)
      } else {
        expect(r.frame.seqNo).toBe(known)
        expect(r.frame.retryFlag).toBe(true)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(500)
  })

  it('over 3 s Hidden A delivers 76 frames and loses 62 at the retry limit; Hidden B, 69 and 61', () => {
    // 「三秒里 Hidden A 送达 76 帧、在重传上限上丢掉 62 帧，Hidden B 是 69 与 61」
    expect(delivered(rs)['sta-1']).toBe(76)
    expect(delivered(rs)['sta-2']).toBe(69)
    expect(drops(rs, 'retryLimit', 'sta-1').length).toBe(62)
    expect(drops(rs, 'retryLimit', 'sta-2').length).toBe(61)
  })

  it('at 504 465 µs three of Hidden B’s frames expire at once and the two counters come apart', () => {
    // `deeper`: 「504 465 µs 处 Hidden B 一次丢掉三个老帧，紧接着那一帧第一次失败时读数是
    //  retries = 1，而队列计数器已经是 6；第二次是 2 对 7——到这里窗口弹回 15」
    const life = drops(rs, 'lifetime', 'sta-2')
    expect(life[0].t).toBe(504_465_360)
    expect(life.filter((r) => r.t === life[0].t).length).toBe(3)
    const head = life[0].msduId
    const headRetries = ofType(rs, 'RETRY').filter((r) => r.msduId === head)
    expect(headRetries[headRetries.length - 1].qsrc).toBe(5)
    expect(headRetries.length).toBe(5)
    const headTx = ofType(rs, 'TX_START').find((r) => r.frame.msduId === head)!
    expect(headTx.frame.seqNo).toBe(17)
    const next = ofType(rs, 'TX_START').find((r) => r.node === 'sta-2' && r.t >= life[0].t)!
    expect(next.frame.seqNo).toBe(18)
    const nextRetries = ofType(rs, 'RETRY').filter((r) => r.msduId === next.frame.msduId).slice(0, 3)
    expect(nextRetries.map((r: Retry) => [r.retries, r.qsrc])).toEqual([[1, 6], [2, 7], [3, 1]])
    const cwAfter = (t: number) => ofType(rs, 'CW_CHANGE').find((r) => r.node === 'sta-2' && r.t === t)!.cw
    expect(cwAfter(nextRetries[0].t)).toBe(1023)
    expect(cwAfter(nextRetries[1].t)).toBe(15)
  })
})

describe('retries-queues · what the UI shows', () => {
  const rs = recs()

  it('the event log prints the retry and drop lines the lesson quotes', () => {
    // the observation 「最后一次失败写作 “retry #id (retries=7 QSRC=7)”，紧跟着一行
    //  “DROP #id (retryLimit)”」
    const rl = drops(rs, 'retryLimit')[0]
    const last = ofType(rs, 'RETRY').filter((r) => r.msduId === rl.msduId).pop()!
    expect(fmtRecord(last)).toBe(`sta-2 retry #${rl.msduId} (retries=7 QSRC=7)`)
    expect(fmtRecord(rl)).toBe(`sta-2 DROP #${rl.msduId} (retryLimit)`)
  })

  it('the frame detail of a data frame has a sequence-number row and a retry-flag row', () => {
    // tryThis: 「序列号那一行和重发比特那一行，是分辨“同一帧又来了”与“新的一帧”的唯一依据」
    const R = STRINGS.frameDetail.fields.row
    const retryTx = ofType(rs, 'TX_START').find((r) => r.frame.kind === 'data' && r.frame.retryFlag)!
    const fields = decodeFrame(retryTx.frame)
    expect(fields.find((f) => f.field === R.seqNo)!.value).toBe(String(retryTx.frame.seqNo))
    expect(fields.find((f) => f.field === R.retryFlag)!.value).toBe('1')
  })
})

describe('retries-queues · the procedure, step by step', () => {
  const rs = recs()

  it('step 1: the answer’s deadline is 45 µs after the frame ends — SIFS + one slot + the start delay', () => {
    expect(ACK_TIMEOUT_NS).toBe(SIFS_NS + SLOT_NS + RX_START_DELAY_NS)
    expect([SIFS_NS, SLOT_NS, RX_START_DELAY_NS, ACK_TIMEOUT_NS]).toEqual([16_000, 9_000, 20_000, 45_000])
    // proved across the whole run rather than asserted for one frame: every timeout lands
    // exactly 45 µs after the end of that node's own last transmission
    const lastTxEnd = new Map<string, number>()
    let checked = 0
    for (const r of rs) {
      if (r.type === 'TX_START') lastTxEnd.set(r.node, r.t + r.frame.txTimeNs)
      if (r.type === 'ACK_TIMEOUT') {
        expect(r.t - lastTxEnd.get(r.node)!, `${r.node} @ ${r.t}`).toBe(ACK_TIMEOUT_NS)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(500)
  })

  it('steps 2 and 3: a failure moves both counters by one and the window to 2·CW + 1, and the frame comes back', () => {
    const retries = ofType(rs, 'RETRY').filter((r) => r.node === 'sta-2')
    expect(retries.length).toBeGreaterThan(300)
    const seen = new Map<number, number>()
    for (const r of retries) {
      const prev = seen.get(r.msduId) ?? 0
      expect(r.retries, `#${r.msduId} @ ${r.t}`).toBe(prev + 1)
      seen.set(r.msduId, r.retries)
      expect(r.retries).toBeLessThanOrEqual(SHORT_RETRY_LIMIT)
    }
    // the window the engine writes after each failure is exactly min(2·CW + 1, CWmax), reset at the limit
    const cws = ofType(rs, 'CW_CHANGE').filter((r) => r.node === 'sta-2')
    let cw = CW_MIN
    let checked = 0
    for (const c of cws) {
      const expected = c.qsrc === 0 ? CW_MIN : Math.min(2 * cw + 1, CW_MAX)
      expect(c.cw, `@ ${c.t}`).toBe(expected)
      cw = c.cw
      checked++
    }
    expect(checked).toBeGreaterThan(300)
  })

  it('step 4: the rate steps down as the attempts pile up, so the same frame costs more air', () => {
    // steps 4: 「失败累积到一定次数，下一次尝试就换一档更慢更结实的发法，于是同一帧占的空口
    //  时间反而更长。」 Proved on the run's first seven-attempt frame.
    const rl = drops(rs, 'retryLimit')[0]
    const attempts = ofType(rs, 'TX_START').filter((r) => r.frame.msduId === rl.msduId)
    const rates = attempts.map((a) => a.frame.mbps!)
    const times = attempts.map((a) => a.frame.txTimeNs)
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i], `attempt ${i + 1}`).toBeLessThanOrEqual(rates[i - 1])
      expect(times[i], `attempt ${i + 1}`).toBeGreaterThanOrEqual(times[i - 1])
    }
    expect(rates[0]).toBe(48)
    expect(rates[rates.length - 1]).toBe(18)
  })

  it('step 5: the seventh attempt is the last, and the frame behind it takes the head', () => {
    const attempts = new Map<number, number>()
    for (const r of ofType(rs, 'TX_START')) {
      if (r.frame.kind !== 'data' || r.frame.msduId === undefined) continue
      attempts.set(r.frame.msduId, (attempts.get(r.frame.msduId) ?? 0) + 1)
    }
    for (const n of attempts.values()) expect(n).toBeLessThanOrEqual(SHORT_RETRY_LIMIT)
    const given = drops(rs, 'retryLimit')
    expect(given.length).toBeGreaterThan(100)
    for (const d of given) expect(attempts.get(d.msduId)).toBe(SHORT_RETRY_LIMIT)
  })
})

describe('retries-queues · the timing figure is the run', () => {
  it('seven spans, each one an attempt of the same frame, and the next frame behind them', () => {
    const sp = retryFanTiming()
    expect(sp.lanes.map((l) => l.label)).toEqual(['同一帧', '下一帧'])
    const rs = recs()
    const rl = drops(rs, 'retryLimit')[0]
    const attempts = ofType(rs, 'TX_START').filter((r) => r.frame.msduId === rl.msduId)
    expect(sp.lanes[0].spans.length).toBe(SHORT_RETRY_LIMIT)
    expect(attempts.length).toBe(SHORT_RETRY_LIMIT)
    sp.lanes[0].spans.forEach((span, i) => {
      expect(span.fromUs, `attempt ${i + 1}`).toBe(Math.round(attempts[i].t / 1000))
      expect(span.toUs, `attempt ${i + 1}`)
        .toBe(Math.round((attempts[i].t + attempts[i].frame.txTimeNs) / 1000))
    })
    // the two labelled spans are the figures the caption prints
    expect(sp.lanes[0].spans[0].label).toBe('第一次 276 µs')
    expect(sp.lanes[0].spans[0].toUs - sp.lanes[0].spans[0].fromUs).toBe(276)
    expect(sp.lanes[0].spans[6].label).toBe('第七次 704 µs')
    expect(sp.lanes[0].spans[6].toUs - sp.lanes[0].spans[6].fromUs).toBe(704)
    // the second lane is the frame behind it, at 27 741 µs
    const next = ofType(rs, 'TX_START').find((r) => r.node === 'sta-2' && r.t > rl.t)!
    const behind = sp.lanes[1].spans[0]
    expect(behind.fromUs).toBe(Math.round(next.t / 1000))
    expect(behind.toUs).toBe(Math.round((next.t + next.frame.txTimeNs) / 1000))
    // 「间隔总体在拉大——但不是每次都拉大」. THE ENGINE CONTRADICTED THE FIRST DRAFT of
    // this caption, which said the gaps grow every time: the backoff is a draw from a
    // widening window, not a ramp, so gap 4 is SHORTER than gap 3. Both halves of the
    // corrected sentence are pinned.
    const gaps = sp.lanes[0].spans.slice(1).map((s, i) => s.fromUs - sp.lanes[0].spans[i].toUs)
    expect(gaps).toEqual([250, 881, 2497, 2091, 6101, 12_776])
    expect(gaps[gaps.length - 1]).toBeGreaterThan(20 * gaps[0])
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(mean(gaps.slice(3))).toBeGreaterThan(mean(gaps.slice(0, 3)))
    // the one exception the caption names, so a change to it turns this red
    expect(gaps[3]).toBeLessThan(gaps[2])
    // and every span is inside the axis the figure declares
    for (const lane of sp.lanes) {
      for (const s of lane.spans) {
        expect(s.fromUs).toBeGreaterThanOrEqual(sp.axis.fromUs)
        expect(s.toUs).toBeLessThanOrEqual(sp.axis.toUs)
      }
    }
  })
})

/**
 * **The ruler for this lesson's `until: 'wan-rtt'` (criterion B, tests/course/limits.test.ts).**
 *
 * The limit used to claim 「引擎之上什么都没有」, an absolute statement about the ENGINE, and it
 * was false from the day the cloud-server layer landed. It was narrowed to a statement about
 * THIS lesson's scenes, which is what makes `out-of-scope` the honest kind, and the promise
 * then needs an axis: the top-level `servers` section.
 *
 * So this measures both ends of that axis rather than asserting that somebody thought about it.
 * Here: every scene this lesson ships has an empty `servers`, so no WAN record can exist.
 * There: `wan-rtt`'s own scene carries exactly one server and emits both WAN record types
 * inside 200 ms. The promise is 「那一课把这一层打开」, and these are the two numbers that say
 * it is kept.
 */
describe('retries-queues · the axis behind its `until: wan-rtt`', () => {
  const scenesOf = (l: { scenario: () => Scenario; variants?: { scenario: () => Scenario }[] }): Scenario[] =>
    [l.scenario(), ...(l.variants ?? []).map((v) => v.scenario())]

  it('promises a lift it does not itself make: every scene here has no server at all', () => {
    const mine = scenesOf(retriesQueues)
    expect(mine.length).toBeGreaterThan(0)
    for (const s of mine) expect(s.servers, 'a scene of this lesson carries a server').toEqual([])
    const lim = retriesQueues.limits.find((x) => x.until === 'wan-rtt')
    expect(lim, 'the limit that carries the promise').toBeDefined()
    expect(lim!.kind, 'criterion A: only an out-of-scope limit may be lifted').toBe('out-of-scope')
  })

  it('and the lesson it points at really opens that section, measured on both sides', () => {
    expect(wanRtt.scenario().servers.length, 'wan-rtt ships exactly one cloud endpoint').toBe(1)
    const kinds = (s: Scenario): Set<string> => new Set([...new Simulation(s).runUntil(200 * 1_000_000).records]
      .filter((r) => r.type === 'WAN_TX' || r.type === 'WAN_RX').map((r) => r.type))
    expect([...kinds(wanRtt.scenario())].sort(), 'both WAN record types inside 200 ms')
      .toEqual(['WAN_RX', 'WAN_TX'])
    for (const s of scenesOf(retriesQueues)) expect(kinds(s).size, 'a WAN record in a scene with no server').toBe(0)
  })
})
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * Everything above measures the right thing and compares it with a figure typed on **this** side
 * — `expect(firstRl.t).toBe(27_689_118)`, with the lesson's sentence in a comment beside it. So
 * the engine is pinned and the prose is not: the sampling sweep of 2026-10-12 planted six of this
 * lesson's figures and **all six went unnoticed**. Here every figure is parsed out of the shipped
 * string and compared with the same measurement.
 *
 * **The reads worth naming:**
 *
 *  - **the seven-attempt table is read as one frame's history.** Every row's attempt number, its
 *    instant, its rate, its retry bit, the instant its failure was recorded and the window after
 *    it are read against the records of the **one** MSDU the run drops at the retry limit — so a
 *    digit moved in any cell lands on the attempt it belongs to.
 *  - **the 45 µs deadline is read as the sum the steps spell out**: a short interframe space, one
 *    slot, and what the radio takes to report a reception — three engine constants, and the
 *    sentence prints all three beside the total.
 *  - **the window ladder is read in both directions**: `2·CW + 1` up to `CW_MAX`, and the reset
 *    to `CW_MIN` at the limit, which the lesson prints in four separate places (the steps, the
 *    table's last cell, `observe` and `limits`) — each one read against the engine's constant.
 *  - **the two counters coming apart is read as the pair of readings it is.** 「retries = 1，而
 *    队列计数器已经是 6；第二次是 2 对 7」 is four figures from two `RETRY` records of one frame,
 *    and the 「弹回 15」 that follows has to be the window change at that very instant.
 *  - **the two figures from the lesson next door are read against that lesson itself**: 「28.688
 *    ms 的往返里只有 0.106 ms 属于空口」 belongs to `@wan-rtt`, so they are read out of its own
 *    prose — the same figure in two lessons has to be the same figure.
 */
describe('retries-queues · every figure the prose prints, read back out of it', () => {
  const rs = recs()
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
  const NUMS = blockText(retriesQueues.numbers)
  const DEEP = blockText(retriesQueues.deeper)
  const LIM = blockText(retriesQueues.limits)
  const SRC = blockText(retriesQueues.sources)
  const OBS = blockText(retriesQueues.observe)
  const QUIZ = blockText(retriesQueues.quiz)
  const LABELS = retriesQueues.variants!.map((v) => v.label).join('\n')

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const table = (): { heading?: string; rows: string[][] } =>
    retriesQueues.numbers!.find((b) => b.kind === 'table') as unknown as
      { heading?: string; rows: string[][] }
  const caption = (): string =>
    (retriesQueues.numbers!.find((b) => b.kind === 'diagram') as unknown as { caption: string }).caption

  /** The one frame this run drops at the retry limit first, and everything the records say of it. */
  const firstDrop = drops(rs, 'retryLimit')[0]!
  const attempts = ofType(rs, 'TX_START').filter((r) => r.frame.msduId === firstDrop.msduId)
  const failures = ofType(rs, 'RETRY').filter((r) => r.msduId === firstDrop.msduId)
  const cwAfter = ofType(rs, 'CW_CHANGE').filter((r) => r.node === firstDrop.node && r.t <= firstDrop.t)

  it('reads the seven-attempt table as one frame’s own history', () => {
    const t = table()
    const [attemptsCn] = raw(t.heading!, /一帧，(.)次尝试/, 'the table’s own heading')
    const cn = (s: string): number => '零一二三四五六七八九'.indexOf(s)
    expect(cn(attemptsCn!), 'the attempts a frame gets').toBe(SHORT_RETRY_LIMIT)
    expect(t.rows, 'one row per attempt').toHaveLength(SHORT_RETRY_LIMIT)
    expect(attempts, 'which is what the run really gives this frame').toHaveLength(SHORT_RETRY_LIMIT)
    t.rows.forEach((row, i) => {
      const [nth] = figs(row[0]!, /^(\d+)$/, `row ${i}’s own number`)
      expect(nth, 'the rows being numbered in order').toBe(i + 1)
      const [at] = figs(row[1]!, /^([\d ]+) µs$/, `attempt ${nth} goes out`)
      expect(at, `when attempt ${nth} goes out`).toBe(Math.round(attempts[i]!.t / 1000))
      const [mbps] = figs(row[2]!, /^(\d+) Mb\/s$/, `attempt ${nth}’s rate`)
      expect(mbps, `the rate attempt ${nth} runs at`).toBe(attempts[i]!.frame.mbps)
      const [bit] = figs(row[3]!, /^([01])$/, `attempt ${nth}’s retry bit`)
      expect(bit === 1, `the retry bit of attempt ${nth}`).toBe(attempts[i]!.frame.retryFlag === true)
      const [failed] = figs(row[4]!, /^([\d ]+) µs/, `attempt ${nth}’s failure`)
      expect(failed, `when attempt ${nth} is recorded as failed`).toBe(Math.round(failures[i]!.t / 1000))
      const [cw] = figs(row[5]!, /^(\d+)$/, `the window after attempt ${nth}`)
      expect(cw, `the window after attempt ${nth}`).toBe(cwAfter[i]!.cw)
    })
    // the last cell says 「放弃」, and that is the drop this whole read is about
    expect(t.rows[SHORT_RETRY_LIMIT - 1]![4], 'the last failure being the one that gives up')
      .toContain('放弃')
    expect(Math.round(firstDrop.t / 1000), 'at the instant the last row prints')
      .toBe(val(raw(t.rows[SHORT_RETRY_LIMIT - 1]![4]!, /^([\d ]+) µs/, 'the last row’s instant')[0]!))
    // 「七次尝试的序列号都是同一个」
    expect(new Set(attempts.map((a) => a.frame.seqNo)).size, 'one sequence number for all seven').toBe(1)
  })

  it('reads the caption of the fan: the seventh attempt, two gaps, and the frame behind it', () => {
    const cap = caption()
    // 「同一个序列号，七个色块：前三次挤在最左边，第七次已经到了 26 940 µs」
    const [blocksCn] = raw(cap, /同一个序列号，(.)个色块/, 'the caption’s own block count')
    const cn = (s: string): number => '零一二三四五六七八九'.indexOf(s)
    expect(cn(blocksCn!), 'one block per attempt').toBe(attempts.length)
    const [seventh] = figs(cap, /第七次已经到了 ([\d ]+) µs/, 'the caption on the last attempt')
    expect(seventh, 'when the seventh attempt goes out')
      .toBe(Math.round(attempts[6]!.t / 1000))
    // 「第三到第四次之间隔了 2497 µs，第四到第五次只隔 2091 µs」
    const [gap34, gap45] = figs(cap,
      /第三到第四次之间隔了 ([\d ]+) µs，第四到第五次只隔 ([\d ]+) µs/, 'the caption on the two gaps')
    /*
     * **The caption measures the silence, not the period**: the figure draws each attempt as a
     * span, and 「隔了」 is from the end of one span to the start of the next — which is what a
     * reader looking at the picture sees between the blocks.
     */
    const silence = (i: number): number =>
      Math.round((attempts[i + 1]!.t - (attempts[i]!.t + attempts[i]!.frame.txTimeNs)) / 1000)
    expect(gap34, 'the silence between the third attempt and the fourth').toBe(silence(2))
    expect(gap45, 'and between the fourth and the fifth').toBe(silence(3))
    expect(gap45, 'the later gap being the shorter of the two — 「不是每次都拉大」')
      .toBeLessThan(gap34!)
    // 「排在它后面那一帧，要等到 27 741 µs 才轮得上」
    const [nextAt] = figs(cap, /要等到 ([\d ]+) µs 才轮得上/, 'the caption on the frame behind')
    const next = ofType(rs, 'TX_START').find((r) => r.node === firstDrop.node && r.t > firstDrop.t)!
    expect(nextAt, 'when the frame behind it finally goes out').toBe(Math.round(next.t / 1000))
    expect(next.frame.retryFlag, 'and it is a new frame, not another attempt').toBe(false)
  })

  it('reads the deadline the steps add up, and the ladder they climb', () => {
    // 「回答必须在这一帧结束后的 45 µs 之内开始——16 µs 的间隔、一个 9 µs 的时隙，再加…20 µs」
    const [total, sifs, slot, start] = figs(NUMS,
      /的 (\d+) µs 之内开始——(\d+) µs 的间隔、一个 (\d+) µs 的时隙（slot time），再加电台报出“开始收了”所需的 (\d+) µs/,
      'the steps on the answer’s deadline')
    expect(sifs! * 1000, 'the short interframe space').toBe(SIFS_NS)
    expect(slot! * 1000, 'one slot').toBe(SLOT_NS)
    expect(start! * 1000, 'and what the radio takes to report a reception').toBe(RX_START_DELAY_NS)
    expect(sifs! + slot! + start!, 'the sum the sentence states').toBe(total)
    expect(total! * 1000, 'which is the timeout the engine applies').toBe(ACK_TIMEOUT_NS)
    // 「竞争窗口则加宽成自己的两倍再加一，最多到 1023」
    const [twice, plus, cwMax] = figs(NUMS, /加宽成自己的(.)倍再加(.)，最多到 (\d+)/,
      'the steps on the window')
      .map((x, i) => (i < 2 ? x : x))
    // 「两」 is the counting form of 「二」, which is what these two sentences use
    const cnOf = (s: string): number =>
      '零一二三四五六七八九'.indexOf(s === '两' ? '二' : s)
    const [twiceCn, plusCn] = raw(NUMS, /加宽成自己的(.)倍再加(.)，/, 'the steps’ two Chinese numerals')
    expect(cwMax, 'the widest window the engine allows').toBe(CW_MAX)
    let cw = CW_MIN
    for (let k = 1; k < SHORT_RETRY_LIMIT; k++) {
      cw = Math.min(cnOf(twiceCn!) * cw + cnOf(plusCn!), CW_MAX)
      expect(cw, `the window after failure ${k}`).toBe(cwAfter[k - 1]!.cw)
    }
    expect(cw, 'and the ladder ends at the widest').toBe(cwMax)
    expect([twice, plus], 'both written as Chinese numerals, so unreachable by a planter')
      .toEqual([NaN, NaN])
    // 「当一帧的尝试次数达到重传上限七次，它就被丢弃…而窗口弹回 15」
    const [limitCn] = raw(NUMS, /达到重传上限(.)次/, 'the steps on the limit')
    expect(cnOf(limitCn!), 'the attempts a frame gets').toBe(SHORT_RETRY_LIMIT)
    const [back] = figs(NUMS, /而窗口弹回 (\d+)，靠的是队列自己的失败次数/, 'the steps on the reset')
    expect(back, 'the window the engine falls back to').toBe(CW_MIN)
    expect(cwAfter[cwAfter.length - 1]!.cw, 'which is what the run really does at the limit').toBe(back)
  })

  it('reads the table’s reading note: the air one attempt costs, and the four counts', () => {
    // 「第一次尝试占 276 µs 空口时间，第七次要 704 µs」
    const [first, seventh] = figs(NUMS,
      /第一次尝试占 (\d+) µs 空口时间，第七次要 (\d+) µs/, '`numbers` on the two airtimes')
    expect(first! * 1000, 'the air the first attempt takes').toBe(attempts[0]!.frame.txTimeNs)
    expect(seventh! * 1000, 'and the seventh').toBe(attempts[6]!.frame.txTimeNs)
    expect(seventh, 'the slower attempt taking longer for the same payload').toBeGreaterThan(first!)
    expect(attempts[6]!.frame.bytes, 'while the payload never changed').toBe(attempts[0]!.frame.bytes)
    // 「速率每失败两次降一档」 — the rates of the seven attempts really do step every second failure
    const [everyCn] = raw(NUMS, /速率每失败(.)次降一档/, '`numbers` on the rate rule')
    const cn = (s: string): number =>
      '零一二三四五六七八九'.indexOf(s === '两' ? '二' : s)
    const rates = attempts.map((a) => a.frame.mbps)
    for (let i = 0; i < rates.length; i++) {
      const stepped = i > 0 && rates[i]! < rates[i - 1]!
      expect(stepped, `attempt ${i + 1} ${stepped ? 'steps down' : 'keeps the rate'}`)
        .toBe(i > 0 && i % cn(everyCn!) === 0)
    }
    // 「三秒里 Hidden A 送达 76 帧、在重传上限上丢掉 62 帧，Hidden B 是 69 与 61」
    const [aOk, aLost, bOk, bLost] = figs(NUMS,
      /三秒里 Hidden A 送达 (\d+) 帧、在重传上限上丢掉 (\d+) 帧，Hidden B 是 (\d+) 与 (\d+)/,
      '`numbers` on the two stations')
    expect(aOk, 'what Hidden A delivers').toBe(delivered(rs)['sta-1'])
    expect(bOk, 'what Hidden B delivers').toBe(delivered(rs)['sta-2'])
    expect(aLost, 'what Hidden A loses at the limit').toBe(drops(rs, 'retryLimit', 'sta-1').length)
    expect(bLost, 'and what Hidden B loses').toBe(drops(rs, 'retryLimit', 'sta-2').length)
  })

  it('reads the two counters coming apart, instant for instant', () => {
    // 「504 465 µs 处 Hidden B 一次丢掉三个老帧，紧接着那一帧第一次失败时读数是 retries = 1，
    //   而队列计数器已经是 6；第二次是 2 对 7——到这里窗口弹回 15」
    const [at, oldCn] = raw(DEEP, /([\d ]+) µs 处 Hidden B 一次丢掉(.)个老帧/,
      '`deeper` on the expiry instant')
    const cn = (s: string): number => '零一二三四五六七八九'.indexOf(s)
    const life = drops(rs, 'lifetime', 'sta-2')
    expect(val(at!), 'the instant the old frames expire').toBe(Math.round(life[0]!.t / 1000))
    expect(cn(oldCn!), 'how many go at once').toBe(life.filter((r) => r.t === life[0]!.t).length)
    const [r1, q1, r2, q2, back] = figs(DEEP,
      /读数是 retries = (\d+)，而队列计数器已经是 (\d+)；第二次是 (\d+) 对 (\d+)——到这里窗口弹回 (\d+)/,
      '`deeper` on the two counters')
    const next = ofType(rs, 'TX_START').find((r) => r.node === 'sta-2' && r.t >= life[0]!.t)!
    const nextFails = ofType(rs, 'RETRY').filter((r) => r.msduId === next.frame.msduId)
    expect([r1, q1], 'the first failure of the frame behind them')
      .toEqual([nextFails[0]!.retries, nextFails[0]!.qsrc])
    expect([r2, q2], 'and the second').toEqual([nextFails[1]!.retries, nextFails[1]!.qsrc])
    expect(back, 'the window the second failure falls back to')
      .toBe(ofType(rs, 'CW_CHANGE').find((r) => r.node === 'sta-2' && r.t === nextFails[1]!.t)!.cw)
    expect(q2, 'the queue’s counter reaching the limit while the frame’s has not')
      .toBe(SHORT_RETRY_LIMIT)
    expect(r2, 'which is the whole point of the paragraph').toBeLessThan(q2!)
  })

  it('reads `observe` and the quiz on the same reset, and the log lines they quote', () => {
    // 「27 689 µs 放弃那一帧时，Hidden B 同一瞬间记下丢弃与窗口复位为 15；它的下一帧序列号是 1」
    const [at, back, seq] = figs(OBS,
      /([\d ]+) µs 放弃那一帧时[^]*?窗口复位为 (\d+)；它的下一帧序列号是 (\d+)/,
      '`observe` on the drop')
    expect(at, 'the instant the frame is given up').toBe(Math.round(firstDrop.t / 1000))
    expect(back, 'the window at that same instant').toBe(CW_MIN)
    expect(cwAfter[cwAfter.length - 1]!.t, 'recorded at the very instant of the drop').toBe(firstDrop.t)
    const next = ofType(rs, 'TX_START').find((r) => r.node === firstDrop.node && r.t > firstDrop.t)!
    expect(seq, 'the sequence number of the frame behind it').toBe(next.frame.seqNo)
    // 「最后一次失败写作 “retry #id (retries=7 QSRC=7)”」
    const [retries, qsrc] = figs(OBS, /\(retries=(\d+) QSRC=(\d+)\)/, '`observe` on the log line')
    const last = failures[failures.length - 1]!
    expect([retries, qsrc], 'the two counters the last failure prints').toEqual([last.retries, last.qsrc])
    expect(fmtRecord(last), 'and the line the log really prints')
      .toContain(`(retries=${retries} QSRC=${qsrc})`)
    // 「窗口从 15 一路涨到 1023」
    const [from, to] = figs(QUIZ, /窗口从 (\d+) 一路涨到 (\d+)/, 'the quiz on the ladder')
    expect([from, to], 'the two ends of the engine’s ladder').toEqual([CW_MIN, CW_MAX])
    /*
     * 「第七次尝试为什么发生在 26 940 µs，而不是紧挨着第六次？」 — the question's own instant,
     * which the figure's caption also prints and which the 「第」 rule change of 2026-10-14
     * uncovered here: this was the one figure in this lesson no literal under `tests/` matched at
     * all. The ordinal is read with it, because 「第七次」 is which attempt the question is about.
     */
    const q7 = raw(QUIZ, /第(.)次尝试为什么发生在 ([\d ]+) µs/, 'the quiz on the last attempt')
    expect('零一二三四五六七八九'.indexOf(q7[0]!), 'the attempt the question asks about')
      .toBe(attempts.length)
    expect(val(q7[1]!), 'and when that attempt really goes out')
      .toBe(Math.round(attempts[attempts.length - 1]!.t / 1000))
  })

  it('reads `sources`, `limits` and both variant labels', () => {
    // 「dot11ShortRetryLimit = 7 决定每个 MSDU 何时被丢弃，而…QSRC 驱动 CW = min(2·CW + 1, CWmax)」
    const [limit, twice, plus] = figs(SRC,
      /dot11ShortRetryLimit = (\d+) 决定每个 MSDU 何时被丢弃[^]*?CW = min\((\d+)·CW \+ (\d+), CWmax\)/,
      '`sources` on the two management variables')
    expect(limit, 'the retry limit the engine uses').toBe(SHORT_RETRY_LIMIT)
    let cw = CW_MIN
    for (let k = 1; k < SHORT_RETRY_LIMIT; k++) {
      cw = Math.min(twice! * cw + plus!, CW_MAX)
      expect(cw, `that formula’s window after failure ${k}`).toBe(cwAfter[k - 1]!.cw)
    }
    /*
     * **Exempt, class (a): the 4 of 「dot11LongRetryLimit = 4」.** It is a management variable of
     * a withdrawn edition — 802.11-2020 deleted it, which the same sentence says — and this
     * engine has no long-retry limit at all, so there is nothing here to read it against. What is
     * read is the claim around it: the engine really keeps only the short one, and the figure is
     * under it. (Sweep of 2026-10-14; a `< 7` read alone would have accepted a 5.)
     */
    const [long] = figs(SRC, /dot11LongRetryLimit = (\d+)/, '`sources` on the long limit')
    expect(long, 'a limit for long frames, which this engine does not keep')
      .toBeLessThan(SHORT_RETRY_LIMIT)
    expect(readFileSync(new URL('../../src/engine/phy.ts', import.meta.url), 'utf8'),
      'and `phy.ts` exports no such limit').not.toContain('LONG_RETRY')
    expect(SRC, 'while the sentence says which edition removed it').toContain('已删除')
    const [retryBit] = figs(SRC, /Retry = (\d+)）见/, '`sources` on the duplicate-detection bit')
    expect(retryBit === 1, 'the bit a retransmission really sets')
      .toBe(attempts[1]!.frame.retryFlag === true)
    // 「500 个 MSDU 的队列上限、500 ms 的生存期」 and 「13.2 Mb/s 的视频源」
    const [depth, lifeMs] = figs(SRC, /(\d+) 个 MSDU 的队列上限、(\d+) ms 的生存期/,
      '`sources` on the queue defaults')
    const q = retriesQueues.scenario().queue!
    expect([depth, lifeMs], 'the two the scene really sets').toEqual([q.limit, q.lifetimeMs])
    /*
     * **The video source's rate is the generator's own arithmetic**: `scheduleVideo` emits one
     * payload every 747 µs plus a uniform draw up to 200 µs, so the mean rate is that payload
     * over the mean period — which is what 「13.2 Mb/s」 is, and what the run's own television
     * really enqueues. (Sweep of 2026-10-14; a `> 0` read is no read at all.)
     */
    const [mbps] = figs(SRC, /与 ([\d.]+) Mb\/s 的视频源/, '`sources` on the source rate')
    const TRAFFIC = readFileSync(new URL('../../src/engine/traffic.ts', import.meta.url), 'utf8')
    const [bytes] = figs(TRAFFIC, /~15 Mbps DL: ([\d,]+) B every/, 'the generator’s own payload')
    const [base, span] = figs(TRAFFIC,
      /const next = t \+ (\d+) \* US \+ Math\.floor\(this\.rng\.next\(\) \* (\d+) \* US\)/,
      'the generator’s own period')
    const meanUs = base! + span! / 2
    expect(Number(((bytes! * 8) / meanUs).toFixed(1)), 'the mean rate those constants give')
      .toBe(mbps)
    /*
     * …and the run really carries that stream — **at the access point**, because a video
     * profile is a downlink: the television is the destination, so every one of those payloads
     * is enqueued by the router. The run's own rate is a little under the nominal one, since the
     * window closes mid-stream, so this half is read to a tenth.
     */
    const stream = ofType(rs, 'ENQUEUE').filter((r) => r.node === 'ap')
    expect(stream.length, 'the router really carries the video stream').toBeGreaterThan(0)
    const runMbps = (stream.length * bytes! * 8) / (RUN_NS / 1000)
    expect(runMbps / mbps!, 'within a tenth of the rate those constants promise')
      .toBeGreaterThan(0.9)
    expect(runMbps / mbps!, 'and never over it').toBeLessThanOrEqual(1)
    // 「决定队列的失败计数何时把窗口弹回 15」 — `limits` prints the reset a fourth time
    const [limBack] = figs(LIM, /把窗口弹回 (\d+)/, '`limits` on the same reset')
    expect(limBack, 'the same floor, a fourth time').toBe(CW_MIN)
    /*
     * **The two figures from the lesson next door.** 「28.688 ms 的往返里只有 0.106 ms 属于
     * 空口」 is `@wan-rtt`'s own measurement, quoted here; so it is read against that lesson's
     * prose rather than re-measured, because the same figure in two lessons has to be one figure.
     */
    const [rtt, air] = figs(LIM, /那里 ([\d.]+) ms 的往返里只有 ([\d.]+) ms 属于空口/,
      '`limits` on the lesson next door')
    const wan = blockText(wanRtt.numbers) + '\n' + blockText(wanRtt.picture)
    expect(wan, 'the round trip that lesson measures').toContain(String(rtt))
    expect(wan, 'and the part of it that is air').toContain(String(air))
    expect(air, 'which is the smaller of the two').toBeLessThan(rtt!)
    // the two variant labels, each against the scene it builds
    for (const [i, v] of retriesQueues.variants!.entries()) {
      const [msdus, ms] = figs(v.label, /(\d+) 个 MSDU，生存期 (\d+) ms/, `variant ${i}’s own label`)
      const qv = v.scenario().queue!
      expect([msdus, ms], `what variant ${i} really sets`).toEqual([qv.limit, qv.lifetimeMs])
    }
    expect(LABELS, 'and the shorter queue is the one that says so').toContain('短队列')
  })
})
