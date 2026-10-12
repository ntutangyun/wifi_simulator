/**
 * Every empirical claim in "队列、生存期与队列溢出丢弃", the second half of
 * `retries-queues` (2026-09-25 re-pacing, §2 M5).
 *
 * The scene and both variants are `retries-queues`'s, so
 * `lessonShapeSuite(..., { sameSceneAs: 'retries-queues' })` proves the two ids
 * replay the same three timelines and that their fixture lines agree once the
 * controller has written them.
 *
 * Fifteen pins arrive here from tests/course/retries-queues.test.ts, asserted
 * against the same three runs they always were: the queue defaults, the
 * three-drop-reason table, the three-setting comparison, the waiting-time table,
 * the 2644 frames all three runs deliver, the 987 aged uploads, the queue-full
 * instant, the four frames that expire together, the queue-only procedure steps
 * and the head-of-line depth. Nothing was re-derived and nothing was relaxed.
 *
 * The engine truth this lesson exists to state is pinned in step 2: `purgeExpired`
 * throws out every queued frame past its lifetime, attempts included. 188 of the
 * 194 the access point throws out had never had a turn on the air — and the other
 * 6 HAD, which is why the lesson does not say "without ever sending it".
 *
 * §4 gives this lesson no diagram, so there is no geometry to check by hand; the
 * lesson is not registered in src/course/lessons.ts yet, so the terminology rule
 * is re-run here over this one lesson with readability.test.ts's own helpers.
 */
import { describe, it, expect } from 'vitest'
import { wanRtt } from '../../src/course/tier2/wan-rtt'
import { queues } from '../../src/course/tier1/queues'
import { retriesQueues } from '../../src/course/tier1/retries-queues'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { DEFAULT_MSDU_LIFETIME_NS, DEFAULT_QUEUE_LIMIT } from '../../src/engine/queues'
import { SHORT_RETRY_LIMIT } from '../../src/engine/phy'
import type { TLRecord } from '../../src/model/records'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fmtRecord } from '../../src/ui/format'
import { ROOT, zhNumeral } from './coverage'
import { lessonShapeSuite } from './kit'
import { MODULES, trackOf } from '../../src/course/curriculum'
import {
  ZH_TERMS, cellTexts, paragraphTexts, bracketedAtFirstZhUse, zhAkaViolations, zhTermFailure,
} from '../../src/course/readability'

const MS = 1_000_000
const RUN_NS = 3000 * MS

type Drop = Extract<TLRecord, { type: 'DROP' }>

const memo = new Map<string, TLRecord[]>()
/** Records of the base scenario (variant undefined) or a variant, memoised. */
function recs(variant?: number): TLRecord[] {
  const key = String(variant ?? 'base')
  if (!memo.has(key)) {
    const sc: Scenario = variant === undefined
      ? queues.scenario()
      : queues.variants![variant].scenario()
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

/** Queue-to-ACK delay (ms) of every frame the AP delivered, with its delivery time. */
function apDelays(rs: TLRecord[]): { atNs: number; ms: number }[] {
  const dropped = new Set(ofType(rs, 'DROP').map((r) => r.msduId))
  const enq = new Map<number, number>()
  const out: { atNs: number; ms: number }[] = []
  for (const r of rs) {
    if (r.type === 'ENQUEUE') enq.set(r.msduId, r.t)
    if (r.type === 'DEQUEUE' && r.node === 'ap' && !dropped.has(r.msduId) && enq.has(r.msduId)) {
      out.push({ atNs: r.t, ms: (r.t - enq.get(r.msduId)!) / MS })
    }
  }
  return out
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

lessonShapeSuite(queues, { sameSceneAs: 'retries-queues', runNs: RUN_NS })

describe('queues · the lesson’s own scene', () => {
  it('follows its first half, sits in the same module, and owns the queue and the clock', () => {
    expect(queues.id).toBe('queues')
    expect(MODULES[queues.module].title).toBe('听不见的邻居与损失')
    expect(queues.module).toBe(retriesQueues.module)
    expect(queues.needs).toEqual(['retries-queues'])
    expect(queues.terms!.map((t) => t.term)).toEqual(['queue', 'lifetime'])
  })

  it('the scene and both variants are the first half’s, scenario for scenario', () => {
    expect(() => ScenarioSchema.parse(queues.scenario())).not.toThrow()
    expect(queues.scenario()).toEqual(retriesQueues.scenario())
    expect(queues.variants!.map((v) => v.scenario()))
      .toEqual(retriesQueues.variants!.map((v) => v.scenario()))
    for (const v of queues.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('takes the three jumps the first half gave up, and each occurs in the run', () => {
    expect(queues.jumps.map((j) => j.label)).toEqual([
      '第一次因生存期丢帧（Hidden B）', '第一次因队列满丢帧（AP）', 'AP 第一次因生存期丢帧',
    ])
    for (const j of queues.jumps) expect(recs().some(j.find), j.label).toBe(true)
    // and the retry jumps stayed with the first half
    expect(retriesQueues.jumps.map((j) => j.label)).toEqual([
      '第一次重传', '第一次重发（Retry 位置位）', '第一次因重传上限丢帧',
    ])
  })

  it('the queue defaults are 500 MSDUs and a 500 ms MSDU lifetime', () => {
    // 「已经有 500 帧在等」 and 「超过生存期（这里 500 ms）」
    expect(DEFAULT_QUEUE_LIMIT).toBe(500)
    expect(DEFAULT_MSDU_LIFETIME_NS).toBe(500 * MS)
    expect(queues.scenario().queue).toEqual({ limit: DEFAULT_QUEUE_LIMIT, lifetimeMs: 500 })
    expect(queues.variants![0].scenario().queue).toEqual({ limit: 100, lifetimeMs: 500 })
    expect(queues.variants![1].scenario().queue).toEqual({ limit: 500, lifetimeMs: 100 })
  })
})

describe('queues · the procedure, step by step', () => {
  const rs = recs()

  it('step 1: a frame joins the queue while fewer than 500 wait; the 501st is turned away', () => {
    // steps 1: 「已经有 500 帧在等，它就入队失败、当场被丢弃，连队列都没进，所以永远不会有入队记录」
    for (const e of ofType(rs, 'ENQUEUE')) expect(e.depth).toBeLessThanOrEqual(DEFAULT_QUEUE_LIMIT)
    expect(Math.max(...ofType(rs, 'ENQUEUE').filter((r) => r.node === 'ap').map((r) => r.depth)))
      .toBe(DEFAULT_QUEUE_LIMIT)
    const enq = new Set(ofType(rs, 'ENQUEUE').map((r) => r.msduId))
    const refused = drops(rs, 'queueFull', 'ap')
    expect(refused.length).toBeGreaterThan(200)
    // the one turned away never joins the line: it has no ENQUEUE record anywhere in the run
    for (const d of refused) expect(enq.has(d.msduId)).toBe(false)
    // and the first refusal follows an ENQUEUE that had just taken the queue to 500
    expect(ofType(rs, 'ENQUEUE').filter((r) => r.node === 'ap' && r.t <= refused[0].t).pop()!.depth)
      .toBe(DEFAULT_QUEUE_LIMIT)
  })

  it('step 2: every frame dropped for lifetime had waited over 500 ms — 188 never flew, 6 had', () => {
    // steps 2: 「凡是入队至今超过生存期（这里 500 ms）的，统统扔掉——不管它已经试过几次。接入点
    //  扔掉的 194 帧里，有 188 帧连一次空口都没轮上过，另外 6 帧是试过、失败、又等到老的。」
    //
    // This is the claim the lesson exists to get right: `purgeExpired` does not care
    // whether a frame has flown, so "thrown away without ever being sent" is false for
    // 6 of the 194.
    const enq = new Map(ofType(rs, 'ENQUEUE').map((r) => [r.msduId, r.t]))
    const sent = new Set(ofType(rs, 'TX_START').map((r) => r.frame.msduId))
    const aged = drops(rs, 'lifetime', 'ap')
    expect(aged.length).toBe(194)
    for (const d of aged) expect(d.t - enq.get(d.msduId)!).toBeGreaterThan(DEFAULT_MSDU_LIFETIME_NS)
    expect(aged.filter((d) => !sent.has(d.msduId)).length).toBe(188)
    expect(aged.filter((d) => sent.has(d.msduId)).length).toBe(6)
  })

  it('step 3: the purge runs before the head is taken, and a lifetime drop leaves a DEQUEUE', () => {
    // steps 2 and 3: the purge is `transmitFor`'s first act, so an expiring frame is
    // dequeued without ever being claimed; a refused arrival is not dequeued at all,
    // because it was never in the queue.
    const deq = new Set(ofType(rs, 'DEQUEUE').map((r) => r.msduId))
    for (const d of drops(rs, 'lifetime')) expect(deq.has(d.msduId)).toBe(true)
    for (const d of drops(rs, 'queueFull')) expect(deq.has(d.msduId)).toBe(false)
  })

  it('step 4: a failed frame goes back to the FRONT, so the head never changes under it', () => {
    // steps 4: 「一次尝试失败，这些帧原样放回队首——不是队尾。」 `AcQueues.restore` unshifts,
    // so the same MSDU is the next thing that node transmits, every single time.
    const rs2 = recs()
    const retried = ofType(rs2, 'RETRY').filter((r) => r.node === 'sta-2')
    expect(retried.length).toBeGreaterThan(300)
    const tx = ofType(rs2, 'TX_START').filter((r) => r.node === 'sta-2' && r.frame.kind === 'data')
    let checked = 0
    let exceptions = 0
    for (const r of retried) {
      const next = tx.find((x) => x.t > r.t)
      if (!next) continue
      // unless the frame left the queue in between — the retry limit at this very failure,
      // or the purge of step 2 catching it before its next turn — the next transmission is
      // it again. THE ENGINE CONTRADICTED the unconditional form: 5 of the run's 596
      // retries are followed by a different frame, and every one of those 5 is a frame the
      // clock removed, which is the exception `deeper` is about.
      const gone = ofType(rs2, 'DROP').some((d) => d.msduId === r.msduId && d.t >= r.t && d.t <= next.t)
      if (gone) {
        exceptions++
        continue
      }
      expect(next.frame.msduId, `after retry #${r.msduId} @ ${r.t}`).toBe(r.msduId)
      checked++
    }
    expect(checked).toBeGreaterThan(300)
    expect(exceptions).toBeGreaterThan(0)
  })

  it('step 5: the four ways out of the queue are the only four the run ever uses', () => {
    // steps 5: 「被确认；走完七次尝试被放弃；在队列里超过生存期被清掉；到达时队列已满、根本没能入队。」
    const reasons = new Set(ofType(rs, 'DROP').map((r) => r.reason))
    expect([...reasons].sort()).toEqual(['lifetime', 'queueFull', 'retryLimit'])
    // and a retryLimit drop always used all seven attempts
    const attempts = new Map<number, number>()
    for (const r of ofType(rs, 'TX_START')) {
      if (r.frame.kind !== 'data' || r.frame.msduId === undefined) continue
      attempts.set(r.frame.msduId, (attempts.get(r.frame.msduId) ?? 0) + 1)
    }
    for (const d of drops(rs, 'retryLimit')) expect(attempts.get(d.msduId)).toBe(SHORT_RETRY_LIMIT)
  })
})

describe('queues · the three reasons, and the log that names them', () => {
  const rs = recs()

  it('the event log prints DROP lines that name the reason', () => {
    // the drop table's 「日志里写的」 column
    expect(fmtRecord(drops(rs, 'queueFull', 'ap')[0])).toMatch(/^ap DROP #\d+ \(queueFull\)$/)
    expect(fmtRecord(drops(rs, 'lifetime', 'ap')[0])).toMatch(/^ap DROP #\d+ \(lifetime\)$/)
    expect(fmtRecord(drops(rs, 'retryLimit')[0])).toMatch(/^sta-\d DROP #\d+ \(retryLimit\)$/)
  })

  it('after the first queue-full drop both reasons keep firing at the AP', () => {
    // the observation 「1 963 852 µs 第一次队列满丢帧后，两种损失交替出现」
    const t0 = drops(rs, 'queueFull', 'ap')[0].t
    expect(drops(rs, 'queueFull', 'ap').filter((r) => r.t > t0).length).toBeGreaterThan(100)
    expect(drops(rs, 'lifetime', 'ap').filter((r) => r.t > t0).length).toBeGreaterThan(100)
  })

  it('the queue fills at 1 963 852 µs and the lifetime bites at 2 182 806 µs, four frames at once', () => {
    // the observations 「1 963 852 µs 第一次队列满丢帧」 and 「2 182 806 µs 处 AP 一次丢掉
    //  四帧，年龄在 500.2 到 502.6 ms 之间」
    const qf = drops(rs, 'queueFull', 'ap')[0]
    expect(qf.t).toBe(1_963_851_557)
    expect(ofType(rs, 'ENQUEUE').filter((r) => r.node === 'ap' && r.t <= qf.t).pop()!.depth).toBe(500)
    const life = drops(rs, 'lifetime', 'ap')
    expect(life[0].t).toBe(2_182_806_360)
    const atOnce = life.filter((r) => r.t === life[0].t)
    expect(atOnce.length).toBe(4)
    const enq = new Map(ofType(rs, 'ENQUEUE').map((r) => [r.msduId, r.t]))
    const ages = atOnce.map((r) => Number(((r.t - enq.get(r.msduId)!) / MS).toFixed(1)))
    expect(Math.min(...ages)).toBe(500.2)
    expect(Math.max(...ages)).toBe(502.6)
  })

  it('the video offers the AP 3541 MSDUs of 1400 B (13.2 Mb/s) and 2644 are acknowledged (9.9 Mb/s)', () => {
    const offered = ofType(rs, 'ENQUEUE').filter((r) => r.node === 'ap').length + drops(rs, 'queueFull', 'ap').length
    expect(offered).toBe(3541)
    expect(ofType(rs, 'ENQUEUE').filter((r) => r.node === 'ap').every((r) => r.bytes === 1400)).toBe(true)
    expect(delivered(rs)['ap']).toBe(2644)
    expect(((offered * 1400 * 8) / 3 / 1e6).toFixed(1)).toBe('13.2')
    expect(((2644 * 1400 * 8) / 3 / 1e6).toFixed(1)).toBe('9.9')
  })
})

describe('queues · the waiting times', () => {
  it('the mean queue-to-ACK delay grows 19 → 149 → 228 → 324 → 472 → 472 ms', () => {
    // the 「送达的帧等了多久」 table
    const d = apDelays(recs())
    const windows = [0, 1, 2, 3, 4, 5].map((w) =>
      Math.round(mean(d.filter((x) => x.atNs >= w * 500 * MS && x.atNs < (w + 1) * 500 * MS).map((x) => x.ms))))
    expect(windows).toEqual([19, 149, 228, 324, 472, 472])
  })

  it('it stops growing because nothing older than 500 ms is ever sent', () => {
    // 「前两秒等待一路往上涨，之后卡在 472 ms 不动：到这时候，比 500 ms 更老的帧根本不会被发出去。」
    expect(Math.max(...apDelays(recs()).map((x) => x.ms))).toBeLessThan(501)
  })
})

describe('queues · the two knobs', () => {
  const base = recs(), q100 = recs(0), life100 = recs(1)

  /** One row of 「同样的三秒，三种设置」, read off a run. */
  const row = (rs: TLRecord[]) => [
    drops(rs, 'queueFull', 'ap').length,
    drops(rs, 'lifetime', 'ap').length,
    drops(rs, 'retryLimit', 'sta-1').length + drops(rs, 'retryLimit', 'sta-2').length,
    delivered(rs)['ap'],
  ]

  it('defaults: 213 turned away, 194 stale at the AP, 123 uploads given up, 2644 delivered', () => {
    expect(row(base)).toEqual([213, 194, 123, 2644])
  })

  it('short queue: 797 turned away, none stale at the AP, the same 123 and 2644', () => {
    expect(row(q100)).toEqual([797, 0, 123, 2644])
  })

  it('short lifetime: nothing turned away, 770 stale at the AP, only 40 uploads given up, still 2644', () => {
    expect(row(life100)).toEqual([0, 770, 40, 2644])
  })

  it('a 100-MSDU queue overflows at 529 728 µs and never drops for lifetime at the AP', () => {
    expect(drops(q100, 'queueFull', 'ap')[0].t).toBe(529_728_227)
    expect(drops(q100, 'lifetime', 'ap').length).toBe(0)
    expect(Math.max(...apDelays(q100).map((x) => x.ms))).toBeLessThan(213)
  })

  it('a 100 ms lifetime never fills the queue; drops start at 588 851 µs and no frame waits over 101 ms', () => {
    expect(drops(life100, 'queueFull').length).toBe(0)
    expect(drops(life100, 'lifetime', 'ap')[0].t).toBe(588_851_360)
    const max = Math.max(...apDelays(life100).map((x) => x.ms))
    expect(max).toBeGreaterThan(100)
    expect(max).toBeLessThan(101)
  })

  it('all three runs deliver 2644 frames, and the last second’s mean wait is 472 / 117 / 88 ms', () => {
    // 「三次运行里 AP 送达的都是同样的 2644 个视频帧：缓冲区变不出空口时间。」 and the quiz's
    // 「最后一秒的平均等待是 472 ms」
    const lastSecond = (rs: TLRecord[]) =>
      Math.round(mean(apDelays(rs).filter((x) => x.atNs >= 2000 * MS).map((x) => x.ms)))
    expect([lastSecond(base), lastSecond(q100), lastSecond(life100)]).toEqual([472, 117, 88])
    for (const rs of [base, q100, life100]) expect(delivered(rs)['ap']).toBe(2644)
  })

  it('under the short lifetime the two uploaders lose 987 frames to age that the defaults never lose', () => {
    // 「两台上传站点（STA）有 987 帧因生存期超时被丢掉」
    const aged = (rs: TLRecord[]) => drops(rs, 'lifetime', 'sta-1').length + drops(rs, 'lifetime', 'sta-2').length
    expect(aged(life100)).toBe(987)
    expect(aged(base)).toBeLessThan(20)
  })
})

describe('queues · head-of-line blocking in `deeper`', () => {
  it('the three frames that expired together had been queued since t = 0', () => {
    // `deeper`: 「那三帧从仿真的第一个瞬间起就在队列里……最后都是因为超过生存期被丢弃的，不是因为信道。」
    const rs = recs()
    const life = drops(rs, 'lifetime', 'sta-2').filter((r) => r.t === 504_465_360)
    expect(life.length).toBe(3)
    const enq = new Map(ofType(rs, 'ENQUEUE').map((r) => [r.msduId, r.t]))
    const sent = new Set(ofType(rs, 'TX_START').map((r) => r.frame.msduId))
    for (const d of life) expect(enq.get(d.msduId)).toBe(0)
    // THE ENGINE CONTRADICTED the parent's sentence 「一次都没发出去过」 about these three: the
    // head frame (sequence number 17) had burned five attempts of its own, and only the two
    // behind it never flew. Both halves of the corrected text are pinned.
    const attempts = new Map<number, number>()
    for (const r of ofType(rs, 'TX_START')) {
      if (r.frame.msduId === undefined) continue
      attempts.set(r.frame.msduId, (attempts.get(r.frame.msduId) ?? 0) + 1)
    }
    expect(life.filter((d) => !sent.has(d.msduId)).length).toBe(2)
    const head = life.find((d) => sent.has(d.msduId))!
    expect(attempts.get(head.msduId)).toBe(5)
    expect(ofType(rs, 'TX_START').find((r) => r.frame.msduId === head.msduId)!.frame.seqNo).toBe(17)
  })
})

/**
 * The terminology rule, re-run over this one unregistered lesson, with the text
 * and the order tests/course/readability.test.ts reads: `why`, `outcomes`,
 * `picture`, `numbers`, `observe`, `tryThis`, `quiz`, with `deeper` and `sources`
 * left out.
 */
describe('queues · every official term carries its English name', () => {
  const zh = [queues.why!, ...queues.outcomes!]
    .concat(paragraphTexts(queues.picture!), cellTexts(queues.picture!))
    .concat(paragraphTexts(queues.numbers!), cellTexts(queues.numbers!))
    .concat(queues.observe, queues.tryThis,
      queues.quiz.flatMap((q) => [q.q, ...q.options, q.explain]))
    .join(' ')
  const rows = ZH_TERMS.filter((t) => !t.track || t.track === trackOf(queues))

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
describe('queues · the axis behind its `until: wan-rtt`', () => {
  const scenesOf = (l: { scenario: () => Scenario; variants?: { scenario: () => Scenario }[] }): Scenario[] =>
    [l.scenario(), ...(l.variants ?? []).map((v) => v.scenario())]

  it('promises a lift it does not itself make: every scene here has no server at all', () => {
    const mine = scenesOf(queues)
    expect(mine.length).toBeGreaterThan(0)
    for (const s of mine) expect(s.servers, 'a scene of this lesson carries a server').toEqual([])
    const lim = queues.limits.find((x) => x.until === 'wan-rtt')
    expect(lim, 'the limit that carries the promise').toBeDefined()
    expect(lim!.kind, 'criterion A: only an out-of-scope limit may be lifted').toBe('out-of-scope')
  })

  it('and the lesson it points at really opens that section, measured on both sides', () => {
    expect(wanRtt.scenario().servers.length, 'wan-rtt ships exactly one cloud endpoint').toBe(1)
    const kinds = (s: Scenario): Set<string> => new Set([...new Simulation(s).runUntil(200 * 1_000_000).records]
      .filter((r) => r.type === 'WAN_TX' || r.type === 'WAN_RX').map((r) => r.type))
    expect([...kinds(wanRtt.scenario())].sort(), 'both WAN record types inside 200 ms')
      .toEqual(['WAN_RX', 'WAN_TX'])
    for (const s of scenesOf(queues)) expect(kinds(s).size, 'a WAN record in a scene with no server').toBe(0)
  })
})

/**
 * **Every figure the lesson prints, read back out of the lesson.**
 *
 * `scripts/figure-planting.ts` measured this lesson on 2026-10-12 and it came out the worst of
 * the course: **68 of 68 printed figures editable with this file green, in one run** — the whole
 * set planted at once and nothing reddened. Everything above measures the engine hard (the two
 * defaults, the 188 that never flew, the three-run table, the 2 644, the 472 ms), and every
 * figure in it is a literal on the test's own side.
 *
 * What the lesson prints and this now reads: the two defaults in six places between `picture`,
 * the steps, both tables, `limits` and `sources`; the three-setting table's twelve cells; the
 * two paragraphs that restate them; the 987-and-under-20 pair; the six-row wait table and the
 * 472 ms it stops at; `deeper`'s head-of-line frame with its five attempts; and `observe`'s two
 * instants, which are the only microsecond-precise figures a reader is asked to find by hand.
 */
describe('queues · every printed figure is read back out of the lesson', () => {
  const base = recs()
  const shortQ = recs(0)
  const shortLife = recs(1)

  const tableWith = (fragment: string): { heading: string; head: string[]; rows: string[][] } => {
    const b = queues.numbers!.find((x) => x.kind === 'table'
      && ((x as { heading?: string }).heading ?? '').includes(fragment))
    expect(b, `no table whose heading contains 「${fragment}」`).toBeDefined()
    return b as { heading: string; head: string[]; rows: string[][] }
  }
  const steps = (queues.numbers!.find((x) => x.kind === 'steps') as { items: string[] }).items
  const prose = (fragment: string): string => {
    const b = queues.numbers!.find((x) => (x as { heading?: string }).heading?.includes(fragment)) as
      { text?: string } | undefined
    expect(b?.text, `no paragraph headed 「${fragment}」`).toBeDefined()
    return b!.text!
  }
  const pictureText = (queues.picture! as { text?: string }[]).map((x) => x.text ?? '').join('\n')
  const deeperText = (queues.deeper! as { text?: string }[]).map((x) => x.text ?? '').join('\n')
  const limitText = queues.limits.map((x) => x.text).join('\n')
  const sourcesText = queues.sources!.join('\n')
  const quizText = queues.quiz.flatMap((q) => [q.q, ...q.options, q.explain ?? '']).join('\n')

  const raw = (text: string, re: RegExp, what: string): string[] => {
    const m = re.exec(text)
    expect(m, `${what}: 「${re.source}」 no longer matches what the lesson says`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] =>
    raw(text, re, what).map((x) => Number(x.replace(/[\s,]/g, '')))
  const zhCount = (s: string): number => {
    const n = zhNumeral(s.replace(/两/g, '二'))
    expect(n, `「${s}」 is not a number this reads`).not.toBeNull()
    return n!
  }
  const counted = (text: string, re: RegExp, what: string): number => zhCount(raw(text, re, what)[0])
  const ZH = '[〇一二三四五六七八九十两]+'
  /** 「半秒」 is half a second: the one figure this lesson prints as a word. */
  const half = (text: string): boolean => text.includes('半秒')

  it('`picture`: the lifetime as a word, and the queue that fills', () => {
    // 「从入队算起，它能在队列里停留的上限叫做生存期——这里是半秒」
    expect(half(pictureText), '`picture` no longer states the lifetime').toBe(true)
    expect(DEFAULT_MSDU_LIFETIME_NS, 'and half a second is what the engine defaults to')
      .toBe(500 * MS)
    expect(queues.scenario().queue?.lifetimeMs ?? DEFAULT_MSDU_LIFETIME_NS / MS,
      'which is what this scene runs with').toBe(DEFAULT_MSDU_LIFETIME_NS / MS)
    // 「三帧在同一瞬间被扔掉……其中两帧一次空口都没轮上过」
    const three = counted(pictureText, new RegExp(`(${ZH})帧在同一瞬间被扔掉`),
      '`picture` on the frames dropped together')
    const two = counted(pictureText, new RegExp(`其中(${ZH})帧一次空口都没轮上过`),
      '`picture` on how many never flew')
    const first = drops(base, 'lifetime', 'sta-2')[0]
    const together = drops(base, 'lifetime', 'sta-2').filter((r) => r.t === first.t)
    expect(together.length, 'the frames dropped in that instant').toBe(three)
    const flew = new Set(ofType(base, 'TX_START').flatMap((r) => r.frame.msduId === undefined
      ? (r.frame.ampdu?.msduIds ?? []) : [r.frame.msduId]))
    expect(together.filter((r) => !flew.has(r.msduId)).length, 'of them, the ones that never flew')
      .toBe(two)
  })

  it('the five steps: both defaults, and the 194 the access point throws out', () => {
    expect(steps, 'the lesson states exactly the steps this reads').toHaveLength(5)
    // step 1: 「已经有 500 帧在等，它就入队失败」
    const [limit] = figs(steps[0], /已经有 (\d+) 帧在等/, 'step 1’s queue limit')
    expect(limit).toBe(DEFAULT_QUEUE_LIMIT)
    // step 2: 「超过生存期（这里 500 ms）」 and 「扔掉的 194 帧里，有 188 帧连一次空口都没轮上
    //  过，另外 6 帧是试过、失败、又等到老的」
    const [lifeMs] = figs(steps[1], /超过生存期（这里 (\d+) ms）/, 'step 2’s lifetime')
    expect(lifeMs * MS).toBe(DEFAULT_MSDU_LIFETIME_NS)
    const [stale, never, had] = figs(steps[1],
      /扔掉的 (\d+) 帧里，有 (\d+) 帧连一次空口都没轮上过，另外 (\d+) 帧/,
      'step 2’s three counts')
    const apStale = drops(base, 'lifetime', 'ap')
    expect(apStale.length).toBe(stale)
    const flew = new Set(ofType(base, 'TX_START').flatMap((r) => r.frame.msduId === undefined
      ? (r.frame.ampdu?.msduIds ?? []) : [r.frame.msduId]))
    expect(apStale.filter((r) => !flew.has(r.msduId)).length, 'of them, never on the air')
      .toBe(never)
    expect(apStale.filter((r) => flew.has(r.msduId)).length, 'and the ones that had flown')
      .toBe(had)
    expect(never + had, 'the step’s own two parts against its own total').toBe(stale)
    // step 5: 「一帧离开队列只有四种方式」
    const ways = counted(steps[4], new RegExp(`只有(${ZH})种方式`), 'step 5’s ways out')
    const reasons = new Set(ofType(base, 'DROP').map((r) => r.reason))
    expect(reasons.size + 1, 'the reasons this run uses, plus being acknowledged').toBe(ways)
  })

  it('the three-reason table: the lifetime and the limit it names, and the reasons the log writes', () => {
    const rows = tableWith('一帧被放弃的三种原因').rows
    expect(rows, 'the table states exactly the three rows this reads').toHaveLength(3)
    const attempt = counted(rows[0][1], new RegExp(`第(${ZH})次尝试失败`),
      'the attempt the first row names')
    expect(attempt).toBe(SHORT_RETRY_LIMIT)
    const [lifeMs] = figs(rows[1][1], /等了超过 (\d+) ms/, 'the lifetime the second row names')
    expect(lifeMs * MS).toBe(DEFAULT_MSDU_LIFETIME_NS)
    const [limit] = figs(rows[2][1], /已有 (\d+) 帧在等/, 'the limit the third row names')
    expect(limit).toBe(DEFAULT_QUEUE_LIMIT)
    // and the three names in the first column are the three the engine writes
    expect(new Set(rows.map((r) => r[0])), 'the reasons the log can print')
      .toEqual(new Set(ofType(base, 'DROP').map((r) => r.reason)))
  })

  it('the three-setting table: twelve cells, and both knobs in its own row labels', () => {
    const rows = tableWith('同样的三秒，三种设置').rows
    expect(rows, 'the table states exactly the three rows this reads').toHaveLength(3)
    const runs = [base, shortQ, shortLife]
    const scenes = [queues.scenario(), ...queues.variants!.map((v) => v.scenario())]
    for (const [i, r] of rows.entries()) {
      // the row label states the setting that row ran with
      const nums = [...r[0].matchAll(/(\d+)/g)].map((m) => Number(m[1]))
      const q = scenes[i].queue
      expect(nums.length, `row ${i + 1} states at least one setting`).toBeGreaterThan(0)
      for (const n of nums) {
        expect([q?.limit ?? DEFAULT_QUEUE_LIMIT, q?.lifetimeMs ?? DEFAULT_MSDU_LIFETIME_NS / MS],
          `row ${i + 1}: 「${n}」 is not a setting that row ran with`).toContain(n)
      }
      // 入队失败 · AP 处过时 · 上传试满七次 · AP 送达
      expect(Number(r[1]), `row ${i + 1}: turned away`).toBe(drops(runs[i], 'queueFull').length)
      expect(Number(r[2]), `row ${i + 1}: stale at the access point`)
        .toBe(drops(runs[i], 'lifetime', 'ap').length)
      expect(Number(r[3]), `row ${i + 1}: uploads that used every attempt`)
        .toBe(drops(runs[i], 'retryLimit').filter((d) => d.node !== 'ap').length)
      expect(Number(r[4]), `row ${i + 1}: delivered by the access point`)
        .toBe(delivered(runs[i]).ap)
    }
    // and the heading's own 「三秒」 is the window all three were run for
    const seconds = counted(tableWith('同样的三秒，三种设置').heading,
      new RegExp(`同样的(${ZH})秒`), 'the window the table counts over')
    expect(seconds * 1_000 * MS).toBe(RUN_NS)
  })

  it('「旋钮做不到的事」 and 「旋钮能改的是在哪里放弃」: the same delivery, the losses that move', () => {
    const same = prose('旋钮做不到的事')
    const [delivered2] = figs(same, /都是同一个数：(\d+) 帧/, 'the delivery it says does not move')
    const runs = [base, shortQ, shortLife]
    const times = counted(same, new RegExp(`(${ZH})次运行里`), 'the runs it compares')
    expect(runs.length).toBe(times)
    for (const [i, r] of runs.entries()) {
      expect(delivered(r).ap, `run ${i + 1} delivers the same number`).toBe(delivered2)
    }
    const moves = prose('旋钮能改的是')
    const [fullFrom, fullTo] = figs(moves, /入队失败从 (\d+) 涨到 (\d+)/, 'the turned-away pair')
    const [staleFrom, staleTo] = figs(moves, /等到过时的从 (\d+) 变成 (\d+)/, 'the stale pair')
    expect([fullFrom, fullTo], 'turned away, defaults then short queue')
      .toEqual([drops(base, 'queueFull').length, drops(shortQ, 'queueFull').length])
    expect([staleFrom, staleTo], 'stale at the access point, defaults then short queue')
      .toEqual([drops(base, 'lifetime', 'ap').length, drops(shortQ, 'lifetime', 'ap').length])
    const [lifeStale] = figs(moves, /AP 处过时从 \d+ 涨到 (\d+)/, 'the stale count under a short lifetime')
    expect(lifeStale).toBe(drops(shortLife, 'lifetime', 'ap').length)
    const [also] = figs(moves, /同样的 (\d+) 帧/, 'the delivery it restates')
    expect(also).toBe(delivered2)
  })

  it('「还有一个表里看不到的连带后果」: the 987, the under-20, and the attempts that fall', () => {
    const text = prose('表里看不到的连带后果')
    const [lost] = figs(text, /有 (\d+) 帧因生存期超时被丢掉/, 'the frames the uploaders lose to age')
    const [under] = figs(text, /这个数不到 (\d+)/, 'and what it is by default')
    const [from, to] = figs(text, /从 (\d+) 降到 (\d+)/, 'the attempts that fall with it')
    const uploads = (rs: TLRecord[], reason: Drop['reason']): number =>
      drops(rs, reason).filter((d) => d.node !== 'ap').length
    expect(uploads(shortLife, 'lifetime')).toBe(lost)
    expect(uploads(base, 'lifetime'), '「不到 20」 is an upper bound, and a tight one')
      .toBeLessThan(under)
    expect(uploads(base, 'lifetime')).toBeGreaterThan(under / 2)
    expect([from, to], 'the uploads that used every attempt, defaults then short lifetime')
      .toEqual([uploads(base, 'retryLimit'), uploads(shortLife, 'retryLimit')])
    // 「换一个旋钮，有时会连带改掉另一种损失的数目」
    expect(to, 'and the short lifetime really does cut them').toBeLessThan(from)
  })

  it('the wait table: six windows, their six means, and the figure it stops at', () => {
    const t = tableWith('送达的帧等了多久')
    const rows = t.rows
    expect(rows, 'the table states exactly the six rows this reads').toHaveLength(6)
    const delays = apDelays(base)
    for (const r of rows) {
      const [from, to] = figs(r[0], /([\d.]+)–([\d.]+) s/, `the window 「${r[0]}」 names`)
      const [printed] = figs(r[1], /(\d+) ms/, `the mean 「${r[0]}」 states`)
      const mine = delays.filter((d) => d.atNs >= from * 1_000 * MS && d.atNs < to * 1_000 * MS)
      expect(mine.length, `frames delivered in ${from}–${to} s`).toBeGreaterThan(0)
      expect(Math.round(mean(mine.map((d) => d.ms))), `the mean wait in ${from}–${to} s`)
        .toBe(printed)
    }
    // 「前两秒等待一路往上涨，之后卡在 472 ms 不动」
    const why = prose('这张表为什么会停住')
    const seconds = counted(why, new RegExp(`前(${ZH})秒`), 'the stretch it says climbs')
    const [stuck] = figs(why, /卡在 (\d+) ms 不动/, 'the figure it stops at')
    const climbing = rows.filter((r) => figs(r[0], /([\d.]+)–/, 'row')[0] < seconds)
    expect(climbing.length, 'the rows inside that stretch').toBeGreaterThan(1)
    for (let i = 1; i < climbing.length; i++) {
      expect(figs(climbing[i][1], /(\d+) ms/, 'mean')[0], 'each one above the last')
        .toBeGreaterThan(figs(climbing[i - 1][1], /(\d+) ms/, 'mean')[0])
    }
    const tail = rows.filter((r) => figs(r[0], /([\d.]+)–/, 'row')[0] >= seconds)
    expect(new Set(tail.map((r) => figs(r[1], /(\d+) ms/, 'mean')[0])), 'and the tail does not move')
      .toEqual(new Set([stuck]))
    // 「比 500 ms 更老的帧根本不会被发出去」
    const [lifeMs] = figs(why, /比 (\d+) ms 更老的帧/, 'the lifetime it explains that with')
    expect(lifeMs * MS).toBe(DEFAULT_MSDU_LIFETIME_NS)
    // 「根本不会被发出去」 is about SENDING: the purge runs before the head is taken, so nothing
    // older than the lifetime ever goes on the air — while a frame already taken can be
    // acknowledged a fraction of a millisecond later, which is why the longest delivered wait
    // is 500.4 ms and not under 500. The claim is about the sending, and that is what is read.
    const flewAges: number[] = []
    const enqAt = new Map<number, number>()
    for (const r of base) {
      if (r.type === 'ENQUEUE') enqAt.set(r.msduId, r.t)
      if (r.type !== 'TX_START') continue
      const ids = r.frame.msduId === undefined ? (r.frame.ampdu?.msduIds ?? []) : [r.frame.msduId]
      for (const id of ids) {
        const q = enqAt.get(id)
        if (q !== undefined) flewAges.push((r.t - q) / MS)
      }
    }
    expect(flewAges.length, 'frames whose age on the air can be measured').toBeGreaterThan(100)
    expect(Math.max(...flewAges), 'the oldest frame this run ever puts on the air')
      .toBeLessThan(lifeMs)
    expect(Math.max(...delays.map((d) => d.ms)) - lifeMs, 'and a delivery overshoots by under a ms')
      .toBeLessThan(1)
  })

  it('`deeper`: the head-of-line frame, its sequence number and its five attempts', () => {
    const [seq] = figs(deeperText, /序列号 (\d+)/, '`deeper` on the frame at the head')
    const attempts = counted(deeperText, new RegExp(`自己用掉了(${ZH})次尝试`),
      '`deeper` on the attempts it used')
    const two = counted(deeperText, new RegExp(`后面(${ZH})帧一次都没轮上`),
      '`deeper` on the frames behind it')
    const first = drops(base, 'lifetime', 'sta-2')[0]
    const together = drops(base, 'lifetime', 'sta-2').filter((r) => r.t === first.t)
    const head = ofType(base, 'TX_START')
      .filter((r) => r.node === 'sta-2' && r.frame.seqNo === seq)
    expect(head.length, `the frame with sequence number ${seq} really is sent that often`)
      .toBe(attempts)
    expect(together.length - 1, 'and the frames behind it').toBe(two)
    // 「这三帧最后都是因为超过生存期被丢弃的，不是因为信道」
    for (const d of together) expect(d.reason, `the frame dropped at ${d.t}`).toBe('lifetime')
  })

  it('`limits` and `sources`: both defaults, the generator they come from, and the video source', () => {
    // 「500 帧的队列上限、500 ms 的生存期」, twice over
    for (const text of [limitText, sourcesText]) {
      const [limit] = figs(text, /(\d+) (?:帧的队列上限|个 MSDU 的队列上限)/, 'the queue limit it states')
      const [lifeMs] = figs(text, /(\d+) ms 的生存期/, 'the lifetime it states')
      expect(limit).toBe(DEFAULT_QUEUE_LIMIT)
      expect(lifeMs * MS).toBe(DEFAULT_MSDU_LIFETIME_NS)
    }
    // 「（queues.ts 的 DEFAULT_QUEUE_LIMIT 与 DEFAULT_MSDU_LIFETIME_NS）」: both names, in the
    // file the limit points at
    const cited = /（([a-z]+\.ts) 的 (\w+) 与 (\w+)）/.exec(limitText)
    expect(cited, '`limits` no longer cites where the two defaults live').not.toBeNull()
    const src = readFileSync(resolve(ROOT, `src/engine/${cited![1]}`), 'utf8')
    for (const name of [cited![2], cited![3]]) {
      expect(src, `${cited![1]} declares ${name}`).toContain(name)
    }
    // 「视频按自己的时钟每 747 µs 加 0–200 µs 抖动产生一个 1400 字节的帧」
    const [period, jitterLo, jitterHi, bytes] = figs(limitText,
      /每 (\d+) µs 加 (\d+)–(\d+) µs 抖动产生一个 (\d+) 字节的帧/, '`limits` on the video source')
    const arrivals = ofType(base, 'ARRIVAL').filter((r) => r.node === 'ap')
    expect(arrivals.length, 'the access point’s own arrivals').toBeGreaterThan(100)
    expect(new Set(arrivals.map((r) => r.bytes))).toEqual(new Set([bytes]))
    const gaps = arrivals.slice(1).map((r, i) => (r.t - arrivals[i].t) / 1_000)
    expect(Math.min(...gaps), 'the shortest gap between two of them').toBeGreaterThanOrEqual(period + jitterLo)
    expect(Math.max(...gaps), 'and the longest').toBeLessThanOrEqual(period + jitterHi)
    // 「13.2 Mb/s 的视频源」
    const [mbps] = figs(sourcesText, /([\d.]+) Mb\/s 的视频源/, '`sources` on the video’s rate')
    const span = arrivals[arrivals.length - 1].t - arrivals[0].t
    const offered = (8 * bytes * (arrivals.length - 1)) / (span / 1_000)
    expect(Number(offered.toFixed(1)), 'the rate those arrivals really offer').toBeCloseTo(mbps, 0)
  })

  it('`observe` and the quiz: two instants found by hand, and the delivery that does not move', () => {
    const obs = queues.observe.join('\n')
    // 「1 963 852 µs 第一次队列满丢帧」
    const [firstFull] = figs(obs, /([\d\s]+) µs 第一次队列满丢帧/, '`observe` on the first overflow')
    // to the microsecond the lesson prints it to: the record itself is 1 963 851.557 µs
    expect(Math.round(drops(base, 'queueFull', 'ap')[0].t / 1_000)).toBe(firstFull)
    // 「2 182 806 µs 处 AP 一次丢掉四帧，年龄在 500.2 到 502.6 ms 之间」
    const [at] = figs(obs, /([\d\s]+) µs 处 AP 一次丢掉/, '`observe` on the second instant')
    const four = counted(obs, new RegExp(`一次丢掉(${ZH})帧`), '`observe` on how many')
    const [ageLo, ageHi] = figs(obs, /年龄在 ([\d.]+) 到 ([\d.]+) ms 之间/, '`observe` on their ages')
    const batch = drops(base, 'lifetime', 'ap').filter((r) => Math.round(r.t / 1_000) === at)
    expect(batch.length, `frames dropped at ${at} µs`).toBe(four)
    const enq = new Map<number, number>()
    for (const r of ofType(base, 'ENQUEUE')) enq.set(r.msduId, r.t)
    const ages = batch.map((r) => (r.t - enq.get(r.msduId)!) / MS)
    expect(Math.min(...ages).toFixed(1), 'the youngest of them').toBe(ageLo.toFixed(1))
    expect(Math.max(...ages).toFixed(1), 'and the oldest').toBe(ageHi.toFixed(1))
    // the quiz: 「从 100 帧加大到 500 帧」, 「还是那 2644 帧」, 「最后一秒的平均等待是 472 ms」
    const [from, to] = figs(quizText, /从 (\d+) 帧加大到 (\d+) 帧/, 'the quiz on the two limits')
    expect([from, to]).toEqual([
      queues.variants![0].scenario().queue!.limit, DEFAULT_QUEUE_LIMIT,
    ])
    const [still] = figs(quizText, /还是那 (\d+) 帧/, 'the quiz on the delivery')
    expect(still).toBe(delivered(base).ap)
    const [lastSecond] = figs(quizText, /最后一秒的平均等待是 (\d+) ms/, 'the quiz on the last second')
    const tail = apDelays(base).filter((d) => d.atNs >= RUN_NS - 1_000 * MS)
    expect(Math.round(mean(tail.map((d) => d.ms))), 'the mean wait in the last second')
      .toBe(lastSecond)
  })

  /**
   * **Every restatement, which is where the remainder was.** The sweep that measured 68 of 68
   * came back with 14 after the read-back above, and thirteen of those fourteen are a figure
   * this lesson prints twice and the read-back reads once: 194 in the knob paragraph as well as
   * the table, 188 in `sources` as well as step 2, 987 and 472 and 2 644 and both defaults in
   * two or three places each, and both variant labels — which are the only place a reader sees
   * a variant's two settings at all. The fourteenth is the last window of the wait table, whose
   * 「2.5–3 s」 could be 「2.5–4 s」 and mean the same thing to this run; it is pinned to the run's
   * own end instead.
   */
  it('every figure this lesson prints twice, read at every site', () => {
    const everywhere = [
      queues.why ?? '', ...(queues.outcomes ?? []),
      ...(queues.picture ?? []).map((b) => JSON.stringify(b)),
      ...(queues.numbers ?? []).map((b) => JSON.stringify(b)),
      ...(queues.deeper ?? []).map((b) => JSON.stringify(b)),
      ...queues.limits.map((l) => l.text), ...(queues.sources ?? []),
      ...queues.observe, ...queues.tryThis,
      ...queues.quiz.flatMap((q) => [q.q, ...q.options, q.explain ?? '']),
    ].join('\n')
    const apStale = drops(base, 'lifetime', 'ap')
    const flew = new Set(ofType(base, 'TX_START').flatMap((r) => r.frame.msduId === undefined
      ? (r.frame.ampdu?.msduIds ?? []) : [r.frame.msduId]))
    const uploadsLife = (rs: TLRecord[]): number =>
      drops(rs, 'lifetime').filter((d) => d.node !== 'ap').length

    // every count of what the access point threw out for age, wherever it is stated
    const stales = [...everywhere.matchAll(/过时从 (\d+) 涨到|扔掉的 (\d+) 帧里|AP 处过时从 (\d+)/g)]
      .flatMap((m) => m.slice(1).filter(Boolean).map(Number))
    expect(stales.length, 'the lesson states that count more than once').toBeGreaterThan(1)
    for (const n of stales) expect(n, 'frames the access point threw out for age').toBe(apStale.length)
    // every count of the ones that never flew
    const nevers = [...everywhere.matchAll(/有 (\d+) 帧连一次空口都没轮上过|上面的 (\d+) 帧/g)]
      .flatMap((m) => m.slice(1).filter(Boolean).map(Number))
    expect(nevers.length, 'the lesson states that count more than once').toBeGreaterThan(1)
    for (const n of nevers) {
      expect(n, 'of them, the ones that never flew').toBe(apStale.filter((r) => !flew.has(r.msduId)).length)
    }
    // every count of what the uploaders lose to age under the short lifetime
    const lost = [...everywhere.matchAll(/有 (\d+) 帧因生存期超时被丢掉|和这 (\d+) 帧/g)]
      .flatMap((m) => m.slice(1).filter(Boolean).map(Number))
    expect(lost.length, 'the lesson states that count more than once').toBeGreaterThan(1)
    for (const n of lost) expect(n, 'the uploaders’ losses to age').toBe(uploadsLife(shortLife))
    // 「默认设置下这个数不到 20」: an upper bound, and 「不到」 makes it the next ten up
    const [under] = figs(everywhere, /默认设置下这个数不到 (\d+)/, 'the bound it gives for the defaults')
    expect(Math.ceil(uploadsLife(base) / 10) * 10, `${uploadsLife(base)} rounds up to that bound`)
      .toBe(under)
    expect(uploadsLife(base), 'and it really is under it').toBeLessThan(under)
    // every statement of the delivery that does not move
    const delivers = [...everywhere.matchAll(/都是同一个数：(\d+) 帧|同样的 (\d+) 帧|还是那 (\d+) 帧|送达的都是 (\d+) 帧/g)]
      .flatMap((m) => m.slice(1).filter(Boolean).map(Number))
    expect(delivers.length, 'the lesson states the delivery more than twice').toBeGreaterThan(2)
    for (const n of delivers) expect(n, 'frames the access point delivers').toBe(delivered(base).ap)
    // every statement of the wait the table stops at
    const stuck = [...everywhere.matchAll(/卡在 (\d+) ms 不动|那张 (\d+) ms 的等待表|平均等待是 (\d+) ms/g)]
      .flatMap((m) => m.slice(1).filter(Boolean).map(Number))
    expect(stuck.length, 'the lesson states that wait more than once').toBeGreaterThan(1)
    const lastSec = apDelays(base).filter((d) => d.atNs >= RUN_NS - 1_000 * MS)
    for (const n of stuck) {
      expect(n, 'the mean wait the table ends on').toBe(Math.round(mean(lastSec.map((d) => d.ms))))
    }
    // both variant labels: the only place a reader sees a variant's two settings
    for (const [i, v] of queues.variants!.entries()) {
      const m = /(\d+) 个 MSDU，生存期 (\d+) ms/.exec(v.label)
      expect(m, `variant ${i}’s label no longer states both settings`).not.toBeNull()
      const q = v.scenario().queue!
      expect([Number(m![1]), Number(m![2])], `variant ${i}: the settings it names`)
        .toEqual([q.limit, q.lifetimeMs])
    }
    // the video source, to the decimals `sources` prints it to
    const arrivals = ofType(base, 'ARRIVAL').filter((r) => r.node === 'ap')
    const span = arrivals[arrivals.length - 1].t - arrivals[0].t
    const offered = (8 * arrivals[0].bytes * (arrivals.length - 1)) / (span / 1_000)
    const printed = /([\d.]+) Mb\/s 的视频源/.exec(everywhere)![1]
    expect(Number(printed), `the rate those arrivals offer, to ${printed.split('.')[1].length} decimals`)
      .toBe(Number(offered.toFixed(printed.split('.')[1].length)))
    // the jitter window, tightly: the longest gap really is the period plus the whole jitter
    const [period, hi] = figs(everywhere, /每 (\d+) µs 加 0–(\d+) µs 抖动/, 'the video’s own clock')
    const gaps = arrivals.slice(1).map((r, i) => (r.t - arrivals[i].t) / 1_000)
    expect(Math.round(Math.max(...gaps)), 'the longest gap between two arrivals').toBe(period + hi)
    expect(Math.round(Math.min(...gaps)), 'and the shortest').toBe(period)
    // the wait table's last window ends where the run does
    const rows = tableWith('送达的帧等了多久').rows
    const [, end] = figs(rows[rows.length - 1][0], /([\d.]+)–([\d.]+) s/, 'the last window')
    expect(end * 1_000 * MS, 'the last window of the table ends where the run ends').toBe(RUN_NS)
    // and every statement of the two defaults, anywhere in the lesson
    const limits = [...everywhere.matchAll(/已经有 (\d+) 帧在等|已有 (\d+) 帧在等|(\d+) 帧的队列上限|(\d+) 个 MSDU 的队列上限/g)]
      .flatMap((m) => m.slice(1).filter(Boolean).map(Number))
    expect(limits.length, 'the lesson states the queue limit more than once').toBeGreaterThan(1)
    for (const n of limits) expect(n, 'the queue limit').toBe(DEFAULT_QUEUE_LIMIT)
    const lifes = [...everywhere.matchAll(/超过生存期（这里 (\d+) ms）|等了超过 (\d+) ms|(\d+) ms 的生存期|年龄逼近 (\d+) ms|比 (\d+) ms 更老/g)]
      .flatMap((m) => m.slice(1).filter(Boolean).map(Number))
    expect(lifes.length, 'the lesson states the lifetime more than twice').toBeGreaterThan(2)
    for (const n of lifes) expect(n * MS, 'the lifetime').toBe(DEFAULT_MSDU_LIFETIME_NS)
  })
})
