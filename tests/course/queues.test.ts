/**
 * `@queues`, in the standard-first shape (2026-11-11).
 *
 * ① was checked against IEEE Std 802.11-2024: §10.23.2.1 (one transmit queue per access category),
 * §10.3.4.5 and §10.7 (which MSDU goes next is the implementation's, within the no-reordering rule),
 * §10.4 and §10.23.2.12.1 (the two lifetimes, and the NOTE that their clocks start at different
 * times), Annex C (512 TU and 500 TU). ② says what the engine does with each. The row the check
 * turned up — every node here is non-QoS, yet the engine started the lifetime clock at enqueue, so
 * 188 frames expired without ever being sent — was fixed in the engine.
 *
 * 2026-11-11 (W7b): the engine now starts a DCF station's clock at the first attempt (§10.4), so the
 * row is `faithful`, the default run has no lifetime drop, and the short-lifetime variant is 20 ms
 * (100 ms became byte-identical to the default). Lab 1 and the jumps moved off the lifetime drops.
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
import { DEFAULT_MAX_TRANSMIT_MSDU_LIFETIME_NS, DEFAULT_MSDU_LIFETIME_NS, DEFAULT_QUEUE_LIMIT } from '../../src/engine/queues'
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
      '第一次因重传上限丢帧（Hidden B）', '第一次因队列满丢帧（AP）',
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

  it('the lifetime clock starts at the first attempt (§10.4): a frame never sent never expires', () => {
    // 2026-11-11 (W7b): was `differs` (clock from enqueue; 188 never-sent frames expired at the AP).
    expect(implRow('生存期从何时起算').kind).toBe('faithful')
    expect(DEFAULT_MSDU_LIFETIME_NS).toBe(500 * 1_024_000)
    expect(DEFAULT_MAX_TRANSMIT_MSDU_LIFETIME_NS).toBe(512 * 1_024_000)
    expect(drops(rs, 'lifetime')).toEqual([])
    const short = recs(1)
    const firstTx = new Map<number, number>()
    for (const r of ofType(short, 'TX_START')) if (r.frame.msduId !== undefined && !firstTx.has(r.frame.msduId)) firstTx.set(r.frame.msduId, r.t)
    const aged = drops(short, 'lifetime')
    expect(aged.length).toBeGreaterThan(100)
    for (const d of aged) expect(d.t - firstTx.get(d.msduId)!).toBeGreaterThan(20 * MS)
    // a lifetime drop is dequeued, a refused arrival never was
    const deq = new Set(ofType(short, 'DEQUEUE').map((r) => r.msduId))
    for (const d of aged) expect(deq.has(d.msduId)).toBe(true)
    for (const d of drops(short, 'queueFull')) expect(deq.has(d.msduId)).toBe(false)
  })

  it('only three ways to be given up, and a retry-limit drop always used all seven attempts', () => {
    // the default run gives up only two ways; the 20 ms variant adds the third
    expect([...new Set(ofType(rs, 'DROP').map((r) => r.reason))].sort()).toEqual(['queueFull', 'retryLimit'])
    expect([...new Set(ofType(recs(1), 'DROP').map((r) => r.reason))].sort()).toEqual(['lifetime', 'queueFull', 'retryLimit'])
    const attempts = new Map<number, number>()
    for (const r of ofType(rs, 'TX_START')) {
      if (r.frame.kind !== 'data' || r.frame.msduId === undefined) continue
      attempts.set(r.frame.msduId, (attempts.get(r.frame.msduId) ?? 0) + 1)
    }
    for (const d of drops(rs, 'retryLimit')) expect(attempts.get(d.msduId)).toBe(SHORT_RETRY_LIMIT)
  })

  it('the log names each reason', () => {
    expect(fmtRecord(drops(rs, 'queueFull', 'ap')[0])).toMatch(/^ap DROP #\d+ \(queueFull\)$/)
    expect(fmtRecord(drops(recs(1), 'lifetime', 'ap')[0])).toMatch(/^ap DROP #\d+ \(lifetime\)$/)
    expect(fmtRecord(drops(rs, 'retryLimit')[0])).toMatch(/^sta-\d DROP #\d+ \(retryLimit\)$/)
  })

  it('not every row is faithful', () => {
    expect(queues.implementation!.some((x) => x.kind === 'faithful')).toBe(true)
    expect(queues.implementation!.some((x) => x.kind !== 'faithful')).toBe(true)
  })
})

describe('queues · ③ every figure the labs print is the run', () => {
  /** First transmission instant of every MSDU of a run. */
  const firstTxOf = (rs: TLRecord[]): Map<number, number> => {
    const m = new Map<number, number>()
    for (const r of ofType(rs, 'TX_START')) if (r.frame.msduId !== undefined && !m.has(r.frame.msduId)) m.set(r.frame.msduId, r.t)
    return m
  }

  it('lab 1: Hidden B\'s first frame, first sent at 0 µs and given up seven attempts later; nothing expires', () => {
    const rs = recs()
    const e = lab('生存期从第一次发送起算').expect
    const rl = drops(rs, 'retryLimit', 'sta-2')[0]
    const ft = firstTxOf(rs)
    expect(e).toContain(`在 ${us(ft.get(rl.msduId)!)} µs 第一次发送，${grouped(us(rl.t))} µs 发满七次被丢弃`)
    const hidden = [...drops(rs, 'retryLimit', 'sta-1'), ...drops(rs, 'retryLimit', 'sta-2')]
    expect(e).toContain(`两台上传站点共有 ${hidden.length} 帧发满七次被丢弃`)
    expect(e).toContain(`最长只用 ${Math.round(Math.max(...hidden.map((d) => d.t - ft.get(d.msduId)!)) / MS)} ms`)
    let apMax = 0
    for (const r of ofType(rs, 'DEQUEUE')) if (r.node === 'ap' && ft.has(r.msduId)) apMax = Math.max(apMax, r.t - ft.get(r.msduId)!)
    expect(e).toContain(`接入点的帧从第一次发送到离开队列最长 ${Math.round(apMax / MS)} ms`)
    expect(drops(rs, 'lifetime')).toEqual([])
  })

  it('lab 2: the video offered and delivered, the instant the queue fills, and the worst wait', () => {
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
    expect(e).toContain(`三秒内一共拒绝 ${drops(rs, 'queueFull', 'ap').length} 帧`)
    expect(e).toContain(`等待最久的一帧等了 ${Math.round(Math.max(...apDelays(rs).map((x) => x.ms)))} ms`)
  })

  it('lab 2: the waiting-time table, window by window, rising to the last', () => {
    const d = apDelays(recs())
    const rows = tableOf(lab('接入点的队列被填满'), '送达帧的等待时间').rows
    expect(rows).toHaveLength(6)
    rows.forEach(([win, ms], w) => {
      expect(win).toBe(`${w * 0.5}–${(w + 1) * 0.5} s`)
      const m = Math.round(mean(d.filter((x) => x.atNs >= w * 500 * MS && x.atNs < (w + 1) * 500 * MS).map((x) => x.ms)))
      expect(ms, win).toBe(`${m} ms`)
    })
    expect(lab('接入点的队列被填满').expect).toContain(`最后半秒达到 ${rows[5][1]}`)
    // 2026-11-11: the wait used to settle just under the 500 ms lifetime; with the DCF clock
    // started at the first attempt (§10.4) it is bounded by the queue only, and keeps rising.
    const vals = rows.map((r) => Number(r[1].replace(' ms', '')))
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1])
  })

  it('lab 3: three runs, twelve cells, and the counts the expectation adds', () => {
    const runs = [recs(), recs(0), recs(1)]
    expect(queues.variants![0].scenario().queue).toEqual({ limit: 100, lifetimeMs: 500 })
    expect(queues.variants![1].scenario().queue).toEqual({ limit: 500, lifetimeMs: 20 })
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
    expect(e).toContain(`入队失败从 ${rows[0][1]} 增加到 ${rows[1][1]}，AP 处过时丢弃仍为 ${rows[1][2]}`)
    expect(e).toContain(`AP 处过时丢弃增加到 ${rows[2][2]}，入队失败为 ${rows[2][1]}`)
    const aged = (rs: TLRecord[]) => [...drops(rs, 'lifetime', 'sta-1'), ...drops(rs, 'lifetime', 'sta-2')]
    expect(aged(runs[0])).toEqual([])
    expect(e).toContain(`两台上传站点有 ${aged(runs[2]).length} 帧因生存期被丢弃，每一帧都已发送过，默认设置下为 0`)
    const ft = firstTxOf(runs[2])
    for (const d of aged(runs[2])) expect(ft.has(d.msduId)).toBe(true)
    expect(e).toContain(`发满七次的帧从 ${rows[0][3]} 降到 ${rows[2][3]}`)
    const lastSecond = (rs: TLRecord[]) => Math.round(mean(apDelays(rs).filter((x) => x.atNs >= 2000 * MS).map((x) => x.ms)))
    expect(e).toContain(`依次是 ${runs.map((rs) => `${lastSecond(rs)} ms`).join('、')}`)
    // the quiz quotes the default's last second and the short queue's
    expect(queues.quiz[2].explain).toContain(`最后一秒的平均等待是 ${lastSecond(runs[0])} ms；100 帧的队列下是 ${lastSecond(runs[1])} ms`)
    expect(queues.quiz[2].options[1]).toContain(`那 ${rows[0][4]} 帧`)
  })
})
