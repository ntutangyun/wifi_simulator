/**
 * Every empirical claim in "队列、生存期与门口丢帧", the second half of
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
import { queues } from '../../src/course/tier1/queues'
import { retriesQueues } from '../../src/course/tier1/retries-queues'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { DEFAULT_MSDU_LIFETIME_NS, DEFAULT_QUEUE_LIMIT } from '../../src/engine/queues'
import { SHORT_RETRY_LIMIT } from '../../src/engine/phy'
import type { TLRecord } from '../../src/model/records'
import { fmtRecord } from '../../src/ui/format'
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
    // steps 1: 「已经有 500 帧在等，它就在门口被挡回去，连队都没进，所以永远不会有入队记录」
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
    // steps 5: 「被确认；走完七次尝试被放弃；被那只钟清掉；压根没进门。」
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
    // 「两台上传站点因此有 987 帧老死在队列里」
    const aged = (rs: TLRecord[]) => drops(rs, 'lifetime', 'sta-1').length + drops(rs, 'lifetime', 'sta-2').length
    expect(aged(life100)).toBe(987)
    expect(aged(base)).toBeLessThan(20)
  })
})

describe('queues · head-of-line blocking in `deeper`', () => {
  it('the three frames that expired together had been queued since t = 0', () => {
    // `deeper`: 「那三个老帧从仿真的第一个瞬间起就在队列里了……年龄上限先找到了它们，而不是信道。」
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
