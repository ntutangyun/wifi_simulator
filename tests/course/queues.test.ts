/**
 * `@queues`, in the standard-first shape (2026-11-11).
 *
 * ① was checked against IEEE Std 802.11-2024: §10.23.2.1 (one transmit queue per access category),
 * §10.3.4.5 and §10.7 (which MSDU goes next is the implementation's, within the no-reordering rule),
 * §10.4 and §10.23.2.12.1 (the two lifetimes, and the NOTE that their clocks start at different
 * times), Annex C (512 TU and 500 TU). ② says what the engine does with each, and the row the check
 * turned up — every node here is non-QoS, yet the engine starts the lifetime clock at enqueue — is
 * `differs`, pinned below against the 188 frames that expire without ever being sent.
 *
 * `lessonShapeSuite(..., { sameSceneAs: 'retries-queues' })` proves the two ids load one scene.
 * ③'s figures are read back out of the lesson text and compared with the three runs.
 *
 * The old `limits` entry promising `wan-rtt` left with the `limits` section; its ledger row in
 * tests/course/limits.test.ts went with it.
 */
import { describe, it, expect } from 'vitest'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { queues } from '../../src/course/tier1/queues'
import { retriesQueues } from '../../src/course/tier1/retries-queues'
import { ScenarioSchema } from '../../src/model/scenario'
import { DEFAULT_MSDU_LIFETIME_NS, DEFAULT_QUEUE_LIMIT } from '../../src/engine/queues'
import { SHORT_RETRY_LIMIT } from '../../src/engine/phy'
import type { TLRecord } from '../../src/model/records'
import { fmtRecord } from '../../src/ui/format'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'

const MS = 1_000_000
const RUN_NS = 3000 * MS

type Drop = Extract<TLRecord, { type: 'DROP' }>

const recs = (variant?: number): TLRecord[] => runOf(queues, variant, RUN_NS)
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
const grouped = (n: number): string => (n >= 10_000 ? n.toLocaleString('en-US').replace(/,/g, ' ') : String(n))
const us = (ns: number): number => Math.round(ns / 1000)
const ZH_COUNT = ['零', '一', '两', '三', '四', '五']

const lab = (heading: string): Lab => {
  const l = queues.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = queues.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => queues.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

lessonShapeSuite(queues, { sameSceneAs: 'retries-queues', runNs: RUN_NS })

describe('queues · the lesson', () => {
  it('is in the standard-first shape, right after its first half, in the same module', () => {
    expect(isStandardFirst(queues)).toBe(true)
    expect(MODULES[queues.module].title).toBe('隐藏节点与帧丢失')
    expect(queues.module).toBe(retriesQueues.module)
    expect(queues.needs).toEqual(['retries-queues'])
    expect(queues.terms!.map((t) => t.term)).toEqual(['queue', 'lifetime'])
    expect(queues.limits).toEqual([])
    expect(queues.observe).toEqual([])
    expect(queues.tryThis).toEqual([])
  })

  it('loads the first half’s scene and variants, and keeps the three jumps about the queue', () => {
    expect(() => ScenarioSchema.parse(queues.scenario())).not.toThrow()
    expect(queues.scenario()).toEqual(retriesQueues.scenario())
    expect(queues.variants!.map((v) => v.label)).toEqual(retriesQueues.variants!.map((v) => v.label))
    expect(queues.jumps.map((j) => j.label)).toEqual([
      '第一次因生存期丢帧（Hidden B）', '第一次因队列满丢帧（AP）', 'AP 第一次因生存期丢帧',
    ])
  })

  it('cites in ① each clause it teaches, both lifetimes and their two starting instants', () => {
    for (const c of ['§10.23.2.1', '§10.3.4.5', '§10.7', '§10.4', '§10.3.4.4', '§10.23.2.12.1', '附录 C']) {
      expect(stdText(), c).toContain(c)
    }
    expect(stdText()).toContain('从第一次尝试发送这个 MSDU 时开始计时')
    expect(stdText()).toContain('从这个 MSDU 交给 MAC 时开始计时')
    expect(stdText()).toContain('缺省 512 TU；1 TU = 1024 µs')
    // 500 TU, the EDCA default ② quotes as 512 ms
    expect(500 * 1024 / 1000).toBe(512)
    expect(implRow('生存期的取值').standard).toContain('500 TU，即 512 ms')
  })
})

describe('queues · ② says what the engine does, and the engine does it', () => {
  const rs = recs()

  it('one queue per non-QoS node: every record of this scene is AC-less', () => {
    for (const n of queues.scenario().nodes) expect(n.caps.generation).toBe('nonht')
    expect(ofType(rs, 'ENQUEUE').every((r) => r.ac === undefined)).toBe(true)
    expect(implRow('队列数目').sim).toContain('本课四台设备都是非 QoS 站点，每台一条队列')
  })

  it('the queue holds 500, and the 501st arrival is refused with no ENQUEUE record', () => {
    expect(DEFAULT_QUEUE_LIMIT).toBe(500)
    expect(queues.scenario().queue).toEqual({ limit: DEFAULT_QUEUE_LIMIT, lifetimeMs: 500 })
    expect(implRow('队列长度').sim).toContain(`最多 ${DEFAULT_QUEUE_LIMIT} 个 MSDU`)
    for (const e of ofType(rs, 'ENQUEUE')) expect(e.depth).toBeLessThanOrEqual(DEFAULT_QUEUE_LIMIT)
    const enq = new Set(ofType(rs, 'ENQUEUE').map((r) => r.msduId))
    const refused = drops(rs, 'queueFull', 'ap')
    expect(refused.length).toBeGreaterThan(200)
    for (const d of refused) expect(enq.has(d.msduId)).toBe(false)
  })

  it('a failed frame goes back to the front, so the next transmission is it again unless it was dropped', () => {
    const retried = ofType(rs, 'RETRY').filter((r) => r.node === 'sta-2')
    const tx = ofType(rs, 'TX_START').filter((r) => r.node === 'sta-2' && r.frame.kind === 'data')
    let checked = 0
    for (const r of retried) {
      const next = tx.find((x) => x.t > r.t)
      if (!next) continue
      const gone = ofType(rs, 'DROP').some((d) => d.msduId === r.msduId && d.t >= r.t && d.t <= next.t)
      if (gone) continue
      expect(next.frame.msduId, `after retry #${r.msduId} @ ${r.t}`).toBe(r.msduId)
      checked++
    }
    expect(checked).toBeGreaterThan(300)
  })

  it('the lifetime clock starts at enqueue (differs), and the check runs over the whole queue', () => {
    expect(implRow('生存期从何时起算').kind).toBe('differs')
    expect(DEFAULT_MSDU_LIFETIME_NS).toBe(500 * MS)
    const enq = new Map(ofType(rs, 'ENQUEUE').map((r) => [r.msduId, r.t]))
    const sent = new Set(ofType(rs, 'TX_START').map((r) => r.frame.msduId))
    const aged = drops(rs, 'lifetime', 'ap')
    for (const d of aged) expect(d.t - enq.get(d.msduId)!).toBeGreaterThan(DEFAULT_MSDU_LIFETIME_NS)
    // under §10.4 a frame never sent has no running timer; here most of them expire
    expect(aged.filter((d) => !sent.has(d.msduId)).length).toBeGreaterThan(aged.length / 2)
    // and a lifetime drop is dequeued, a refused arrival never was
    const deq = new Set(ofType(rs, 'DEQUEUE').map((r) => r.msduId))
    for (const d of drops(rs, 'lifetime')) expect(deq.has(d.msduId)).toBe(true)
    for (const d of drops(rs, 'queueFull')) expect(deq.has(d.msduId)).toBe(false)
  })

  it('only three ways to be given up, and a retry-limit drop always used all seven attempts', () => {
    expect([...new Set(ofType(rs, 'DROP').map((r) => r.reason))].sort()).toEqual(['lifetime', 'queueFull', 'retryLimit'])
    const attempts = new Map<number, number>()
    for (const r of ofType(rs, 'TX_START')) {
      if (r.frame.kind !== 'data' || r.frame.msduId === undefined) continue
      attempts.set(r.frame.msduId, (attempts.get(r.frame.msduId) ?? 0) + 1)
    }
    for (const d of drops(rs, 'retryLimit')) expect(attempts.get(d.msduId)).toBe(SHORT_RETRY_LIMIT)
  })

  it('the log names each reason', () => {
    expect(fmtRecord(drops(rs, 'queueFull', 'ap')[0])).toMatch(/^ap DROP #\d+ \(queueFull\)$/)
    expect(fmtRecord(drops(rs, 'lifetime', 'ap')[0])).toMatch(/^ap DROP #\d+ \(lifetime\)$/)
    expect(fmtRecord(drops(rs, 'retryLimit')[0])).toMatch(/^sta-\d DROP #\d+ \(retryLimit\)$/)
  })

  it('not every row is faithful', () => {
    expect(queues.implementation!.some((x) => x.kind === 'faithful')).toBe(true)
    expect(queues.implementation!.some((x) => x.kind !== 'faithful')).toBe(true)
  })
})

describe('queues · ③ every figure the labs print is the run', () => {
  it('lab 1: three frames expire together, all queued at 0 µs; the head flew five times, the others never', () => {
    const rs = recs()
    const life = drops(rs, 'lifetime', 'sta-2')
    const t0 = life[0].t
    const together = life.filter((r) => r.t === t0)
    const enq = new Map(ofType(rs, 'ENQUEUE').map((r) => [r.msduId, r.t]))
    const attempts = new Map<number, number>()
    for (const r of ofType(rs, 'TX_START')) {
      if (r.frame.msduId === undefined) continue
      attempts.set(r.frame.msduId, (attempts.get(r.frame.msduId) ?? 0) + 1)
    }
    const flew = together.filter((d) => attempts.has(d.msduId))
    expect(flew).toHaveLength(1)
    const head = flew[0]
    const headSeq = ofType(rs, 'TX_START').find((r) => r.frame.msduId === head.msduId)!.frame.seqNo
    const e = lab('三帧同时因生存期被丢弃').expect
    expect(e).toContain(`${grouped(us(t0))} µs 处 Hidden B 一次丢弃${ZH_COUNT[together.length]}帧`)
    for (const d of together) expect(enq.get(d.msduId)).toBe(0)
    expect(e).toContain('三帧都是在 0 µs 入队的')
    expect(e).toContain(`（序列号 ${headSeq}）发送过 ${attempts.get(head.msduId)} 次，后面${ZH_COUNT[together.length - 1]}帧一次也没有发送过`)
  })

  it('lab 2: the video offered and delivered, the instants the queue fills and the clock bites', () => {
    const rs = recs()
    const e = lab('接入点的队列被填满').expect
    const offered = ofType(rs, 'ENQUEUE').filter((r) => r.node === 'ap').length + drops(rs, 'queueFull', 'ap').length
    expect(ofType(rs, 'ENQUEUE').filter((r) => r.node === 'ap').every((r) => r.bytes === 1400)).toBe(true)
    expect(e).toContain(`向 AP 下发 ${offered} 个 1400 字节的帧（${(offered * 1400 * 8 / 3 / 1e6).toFixed(1)} Mb/s）`)
    const d = delivered(rs)['ap']
    expect(e).toContain(`送达 ${d} 帧（${(d * 1400 * 8 / 3 / 1e6).toFixed(1)} Mb/s）`)
    const qf = drops(rs, 'queueFull', 'ap')[0]
    expect(ofType(rs, 'ENQUEUE').filter((r) => r.node === 'ap' && r.t <= qf.t).pop()!.depth).toBe(DEFAULT_QUEUE_LIMIT)
    expect(e).toContain(`${grouped(us(qf.t))} µs 时队列已有 ${DEFAULT_QUEUE_LIMIT} 帧`)
    const life = drops(rs, 'lifetime', 'ap')
    const atOnce = life.filter((r) => r.t === life[0].t)
    const enq = new Map(ofType(rs, 'ENQUEUE').map((r) => [r.msduId, r.t]))
    const ages = atOnce.map((r) => (r.t - enq.get(r.msduId)!) / MS)
    expect(e).toContain(`${grouped(us(life[0].t))} µs 处 AP 一次丢弃${ZH_COUNT[atOnce.length]}帧，已排队 ${Math.min(...ages).toFixed(1)} 到 ${Math.max(...ages).toFixed(1)} ms`)
    const sent = new Set(ofType(rs, 'TX_START').map((r) => r.frame.msduId))
    expect(e).toContain(`AP 因生存期丢弃 ${life.length} 帧，其中 ${life.filter((x) => !sent.has(x.msduId)).length} 帧一次也没有发送过，${life.filter((x) => sent.has(x.msduId)).length} 帧发送过`)
  })

  it('lab 2: the waiting-time table, window by window, and where it stops', () => {
    const d = apDelays(recs())
    const rows = tableOf(lab('接入点的队列被填满'), '送达帧的等待时间').rows
    expect(rows).toHaveLength(6)
    rows.forEach(([win, ms], w) => {
      expect(win).toBe(`${w * 0.5}–${(w + 1) * 0.5} s`)
      const m = Math.round(mean(d.filter((x) => x.atNs >= w * 500 * MS && x.atNs < (w + 1) * 500 * MS).map((x) => x.ms)))
      expect(ms, win).toBe(`${m} ms`)
    })
    expect(lab('接入点的队列被填满').expect).toContain(`之后稳定在 ${rows[5][1]}`)
    expect(Math.max(...d.map((x) => x.ms))).toBeLessThan(501)
  })

  it('lab 3: three runs, twelve cells, and the counts the expectation adds', () => {
    const runs = [recs(), recs(0), recs(1)]
    expect(queues.variants![0].scenario().queue).toEqual({ limit: 100, lifetimeMs: 500 })
    expect(queues.variants![1].scenario().queue).toEqual({ limit: 500, lifetimeMs: 100 })
    const rows = tableOf(lab('两个参数，三次运行'), '同样的三秒，三种设置').rows
    rows.forEach((row, i) => {
      const rs = runs[i]
      expect(row.slice(1), row[0]).toEqual([
        String(drops(rs, 'queueFull', 'ap').length),
        String(drops(rs, 'lifetime', 'ap').length),
        String(drops(rs, 'retryLimit', 'sta-1').length + drops(rs, 'retryLimit', 'sta-2').length),
        String(delivered(rs)['ap']),
      ])
    })
    const e = lab('两个参数，三次运行').expect
    expect(new Set(runs.map((rs) => delivered(rs)['ap'])).size).toBe(1)
    expect(e).toContain(`AP 送达的都是 ${rows[0][4]} 帧`)
    expect(e).toContain(`入队失败从 ${rows[0][1]} 增加到 ${rows[1][1]}，AP 处过时丢弃降为 ${rows[1][2]}`)
    expect(e).toContain(`AP 处过时丢弃增加到 ${rows[2][2]}`)
    const aged = (rs: TLRecord[]) => drops(rs, 'lifetime', 'sta-1').length + drops(rs, 'lifetime', 'sta-2').length
    expect(aged(runs[0])).toBeLessThan(20)
    expect(e).toContain(`两台上传站点有 ${aged(runs[2])} 帧因生存期被丢弃，默认设置下不到 20 帧`)
    expect(e).toContain(`发满七次的帧反而从 ${rows[0][3]} 降到 ${rows[2][3]}`)
    const lastSecond = (rs: TLRecord[]) => Math.round(mean(apDelays(rs).filter((x) => x.atNs >= 2000 * MS).map((x) => x.ms)))
    expect(e).toContain(`依次是 ${runs.map((rs) => `${lastSecond(rs)} ms`).join('、')}`)
    // the quiz quotes the default's last second
    expect(queues.quiz[2].explain).toContain(`最后一秒的平均等待是 ${lastSecond(runs[0])} ms`)
    expect(queues.quiz[2].options[1]).toContain(`那 ${rows[0][4]} 帧`)
  })
})
