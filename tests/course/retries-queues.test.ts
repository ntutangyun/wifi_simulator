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
