/**
 * `@retries-queues`, in the standard-first shape (2026-11-11).
 *
 * ① was checked clause by clause against IEEE Std 802.11-2024 (§10.3.2.11, §10.3.3, §10.3.4.3,
 * §10.3.4.4, §10.3.2.14, §10.4, §10.6.5.8, §17.4.4 Table 17-24, Annex C). ② says, row by row, what
 * the engine does with each rule, and the rows that make a claim about engine behaviour are checked
 * against a run here. ③'s figures are read back out of the lesson text and compared with the run,
 * so editing a number in the lesson without the engine agreeing turns this red, and so does an
 * engine change that moves a number the lesson still prints.
 *
 * The lesson's old `limits` entry promising `wan-rtt` left with the `limits` section (the
 * standard-first shape has none); its ledger row in tests/course/limits.test.ts went with it.
 */
import { describe, it, expect } from 'vitest'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { retriesQueues, retryFanTiming } from '../../src/course/tier1/retries-queues'
import { ScenarioSchema } from '../../src/model/scenario'
import {
  ACK_TIMEOUT_NS, CW_MAX, CW_MIN, RX_START_DELAY_NS, SHORT_RETRY_LIMIT, SIFS_NS, SLOT_NS,
} from '../../src/engine/phy'
import { DEFAULT_MAX_TRANSMIT_MSDU_LIFETIME_NS } from '../../src/engine/queues'
import type { TLRecord } from '../../src/model/records'
import { fmtRecord } from '../../src/ui/format'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'

const MS = 1_000_000
const RUN_NS = 3000 * MS

type Drop = Extract<TLRecord, { type: 'DROP' }>

const recs = (): TLRecord[] => runOf(retriesQueues, undefined, RUN_NS)
const drops = (rs: TLRecord[], reason: Drop['reason'], node?: string): Drop[] =>
  ofType(rs, 'DROP').filter((r) => r.reason === reason && (node === undefined || r.node === node))

/** MSDUs removed from a queue without being dropped — i.e. acknowledged. */
function delivered(rs: TLRecord[]): Record<string, number> {
  const dropped = new Set(ofType(rs, 'DROP').map((r) => r.msduId))
  const out: Record<string, number> = {}
  for (const r of ofType(rs, 'DEQUEUE')) if (!dropped.has(r.msduId)) out[r.node] = (out[r.node] ?? 0) + 1
  return out
}
/** 12 345 678 → 「12 345 678」: the lesson's thousands grouping for figures of five digits or more. */
const grouped = (n: number): string => (n >= 10_000 ? n.toLocaleString('en-US').replace(/,/g, ' ') : String(n))
const us = (ns: number): number => Math.round(ns / 1000)

const lab = (heading: string): Lab => {
  const l = retriesQueues.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = retriesQueues.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => retriesQueues.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

/** Hidden B's first frame: the one dropped at the retry limit first. */
const firstRl = () => drops(recs(), 'retryLimit')[0]
const attemptsOf = (msduId: number) => ofType(recs(), 'TX_START').filter((r) => r.frame.msduId === msduId)

lessonShapeSuite(retriesQueues, { runNs: RUN_NS })

describe('retries-queues · the lesson', () => {
  it('is in the standard-first shape, in the module it always sat in', () => {
    expect(isStandardFirst(retriesQueues)).toBe(true)
    expect(MODULES[retriesQueues.module].title).toBe('隐藏节点与帧丢失')
    expect(retriesQueues.needs).toEqual(['airtime', 'collisions-cw'])
    expect(retriesQueues.terms!.map((t) => t.term)).toEqual(['retry', 'retry limit'])
    expect(retriesQueues.limits).toEqual([])
    expect(retriesQueues.observe).toEqual([])
    expect(retriesQueues.tryThis).toEqual([])
  })

  it('keeps its scene and both variants, which `queues` loads as its own', () => {
    expect(() => ScenarioSchema.parse(retriesQueues.scenario())).not.toThrow()
    for (const v of retriesQueues.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
    expect(retriesQueues.variants!.map((v) => v.scenario().queue)).toEqual([
      { limit: 100, lifetimeMs: 500 }, { limit: 500, lifetimeMs: 20 }, // 2026-11-11: 100 ms was inert once the DCF clock starts at the first attempt
    ])
    expect(retriesQueues.jumps.map((j) => j.label)).toEqual([
      '第一次重传', '第一次重发（Retry 位置位）', '第一次因重传上限丢帧',
    ])
  })

  it('cites in ① each clause it teaches, and the scene is all non-QoS stations so ① is DCF', () => {
    for (const c of ['§10.3.2.11', '§10.3.3', '§10.3.4.3', '§10.3.4.4', '§10.3.2.14', '§10.4', '§10.6.5.8', '§17.4.4', '附录 C']) {
      expect(stdText(), c).toContain(c)
    }
    // DCF: none of the four nodes negotiates EDCA, so §10.23 is ②'s business, not ①'s
    for (const n of retriesQueues.scenario().nodes) expect(n.caps.generation).toBe('nonht')
    expect(stdText()).not.toContain('§10.23')
  })

  it('Hidden A and Hidden B never hear each other', () => {
    const rs = recs()
    const hears = (rx: string, tx: string) => rs.some((r) => r.type === 'RX_START' && r.node === rx && r.from === tx)
    expect(hears('sta-1', 'sta-2')).toBe(false)
    expect(hears('sta-2', 'sta-1')).toBe(false)
  })
})

describe('retries-queues · ② says what the engine does, and the engine does it', () => {
  const rs = recs()

  it('ACK timeout: 16 + 9 + 20 = 45 µs, after the end of the node’s own transmission, every time', () => {
    expect(ACK_TIMEOUT_NS).toBe(SIFS_NS + SLOT_NS + RX_START_DELAY_NS)
    expect([SIFS_NS, SLOT_NS, RX_START_DELAY_NS, ACK_TIMEOUT_NS]).toEqual([16_000, 9_000, 20_000, 45_000])
    expect(implRow('ACK 超时').sim).toContain('16 + 9 + 20 = 45 µs')
    expect(stdText()).toContain('16 µs、9 µs、20 µs，合计 45 µs')
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

  it('the per-MSDU count climbs by one per failure; the station count clears on success and at the limit', () => {
    for (const node of ['sta-1', 'sta-2']) {
      const seen = new Map<number, number>()
      for (const r of ofType(rs, 'RETRY').filter((x) => x.node === node)) {
        expect(r.retries, `#${r.msduId} @ ${r.t}`).toBe((seen.get(r.msduId) ?? 0) + 1)
        seen.set(r.msduId, r.retries)
        expect(r.retries).toBeLessThanOrEqual(SHORT_RETRY_LIMIT)
      }
    }
    // the reset at the limit (② 「SSRC 达到上限时」, kind choice): QSRC 0 and CW back to 15
    // on the very record that reaches 7
    const atLimit = ofType(rs, 'CW_CHANGE').filter((r) => r.node === 'sta-2' && r.t === firstRl().t)
    expect(atLimit.map((r) => [r.cw, r.qsrc])).toEqual([[CW_MIN, 0]])
    expect(implRow('SSRC 达到上限时').kind).toBe('choice')
    expect(implRow('SSRC 达到上限时').sim).toContain('计数清零、CW 恢复为 15')
  })

  it('CW after each failure is min(2·CW + 1, 1023), which is the series 15, 31, …, 1023', () => {
    expect([CW_MIN, CW_MAX]).toEqual([15, 1023])
    const series: number[] = [CW_MIN]
    while (series[series.length - 1] < CW_MAX) series.push(Math.min(2 * series[series.length - 1] + 1, CW_MAX))
    expect(implRow('竞争窗口的序列').sim).toContain(series.join('、'))
    for (const s of series) expect(Math.log2(s + 1) % 1).toBe(0) // 2^k − 1, as §10.3.3 says
    let cw = CW_MIN
    let checked = 0
    for (const c of ofType(rs, 'CW_CHANGE').filter((r) => r.node === 'sta-2')) {
      expect(c.cw, `@ ${c.t}`).toBe(c.qsrc === 0 ? CW_MIN : Math.min(2 * cw + 1, CW_MAX))
      cw = c.cw
      checked++
    }
    expect(checked).toBeGreaterThan(300)
  })

  it('a retransmission keeps its sequence number and sets the Retry bit; a first transmission clears it', () => {
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

  it('the limit is a fixed 7, and every frame dropped for it used exactly seven attempts', () => {
    expect(SHORT_RETRY_LIMIT).toBe(7)
    expect(implRow('重传上限的取值').kind).toBe('value')
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

  it('no long retry count is needed here: the RTS threshold is 3000 B and no frame exceeds it', () => {
    expect(implRow('长帧的计数').kind).toBe('absent')
    expect(retriesQueues.scenario().rtsThresholdBytes).toBe(3000)
    expect(implRow('长帧的计数').sim).toContain('RTS 门限（RTS threshold）是 3000 字节')
    const data = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'data')
    expect(Math.max(...data.map((r) => r.frame.bytes))).toBeLessThan(3000)
    expect(ofType(rs, 'TX_START').some((r) => r.frame.kind === 'rts')).toBe(false)
  })

  it('the lifetime clock starts at the first attempt (§10.4): no frame that never flew expires', () => {
    // 2026-11-11 (W7b): was `differs` — the engine started every clock at enqueue, so frames that
    // never flew expired. A DCF station's clock now starts at the first transmission attempt.
    expect(implRow('生存期从何时起算').kind).toBe('faithful')
    expect(DEFAULT_MAX_TRANSMIT_MSDU_LIFETIME_NS).toBe(512 * 1_024_000)
    // the default run (500 ms): nothing expires — a frame reaches the retry limit long before
    expect(drops(rs, 'lifetime')).toEqual([])
    // the 20 ms variant: every frame that expires had flown, 20 ms or more after its first attempt
    const short = runOf(retriesQueues, 1, RUN_NS)
    const firstTx = new Map<number, number>()
    for (const r of ofType(short, 'TX_START')) if (r.frame.msduId !== undefined && !firstTx.has(r.frame.msduId)) firstTx.set(r.frame.msduId, r.t)
    const aged = drops(short, 'lifetime')
    expect(aged.length).toBeGreaterThan(100)
    for (const d of aged) {
      expect(firstTx.has(d.msduId)).toBe(true)
      expect(d.t - firstTx.get(d.msduId)!).toBeGreaterThan(20 * MS)
    }
  })

  it('not every row is faithful', () => {
    const kinds = new Set(retriesQueues.implementation!.map((x) => x.kind))
    expect(kinds.has('faithful')).toBe(true)
    expect([...kinds].some((k) => k !== 'faithful')).toBe(true)
  })
})

describe('retries-queues · ③ every figure the labs print is the run', () => {
  it('lab 1: the seven attempts of one frame, cell for cell, and the figure drawn from them', () => {
    const rl = firstRl()
    expect(rl.node).toBe('sta-2')
    const attempts = attemptsOf(rl.msduId)
    const retries = ofType(recs(), 'RETRY').filter((r) => r.msduId === rl.msduId)
    const cws = ofType(recs(), 'CW_CHANGE').filter((r) => r.node === 'sta-2' && r.t <= rl.t)
    const rows = tableOf(lab('同一帧的七次尝试'), '一帧的七次尝试').rows
    expect(rows).toHaveLength(SHORT_RETRY_LIMIT)
    expect(attempts).toHaveLength(SHORT_RETRY_LIMIT)
    rows.forEach(([k, at, rate, bit, fail, cw], i) => {
      expect(k).toBe(String(i + 1))
      expect(at, `attempt ${k}`).toBe(`${grouped(us(attempts[i].t))} µs`)
      expect(rate, `attempt ${k}`).toBe(`${attempts[i].frame.mbps} Mb/s`)
      expect(bit, `attempt ${k}`).toBe(attempts[i].frame.retryFlag ? '1' : '0')
      expect(fail, `attempt ${k}`).toBe(`${grouped(us(retries[i].t))} µs`)
      expect(cw, `attempt ${k}`).toBe(String(cws[i].cw))
    })
    // the figure: seven spans, each one an attempt, and the next frame behind them
    const sp = retryFanTiming()
    sp.lanes[0].spans.forEach((span, i) => {
      expect(span.fromUs).toBe(us(attempts[i].t))
      expect(span.toUs).toBe(us(attempts[i].t + attempts[i].frame.txTimeNs))
    })
    const next = ofType(recs(), 'TX_START').find((r) => r.node === 'sta-2' && r.t > rl.t)!
    expect(sp.lanes[1].spans[0].fromUs).toBe(us(next.t))
    expect(sp.lanes[1].spans[0].toUs).toBe(us(next.t + next.frame.txTimeNs))
    const block = lab('同一帧的七次尝试').blocks!.find((b) => b.kind === 'diagram')!
    expect(block.kind === 'diagram' && block.caption).toContain(`第七次在 ${grouped(us(attempts[6].t))} µs`)
    expect(block.kind === 'diagram' && block.caption).toContain(`到 ${grouped(us(next.t))} µs 才开始发送`)
  })

  it('lab 1: the expectation — one sequence number, the gaps that do not always grow, the air', () => {
    const attempts = attemptsOf(firstRl().msduId)
    const e = lab('同一帧的七次尝试').expect
    expect(new Set(attempts.map((a) => a.frame.seqNo))).toEqual(new Set([0]))
    expect(e).toContain('序列号都是 0')
    const gaps = attempts.slice(1).map((a, i) => us(a.t) - us(attempts[i].t + attempts[i].frame.txTimeNs))
    expect(gaps[3]).toBeLessThan(gaps[2])
    expect(e).toContain(`第三次与第四次之间相隔 ${gaps[2]} µs，第四次与第五次之间只隔 ${gaps[3]} µs`)
    expect(e).toContain(`第一次占用 ${us(attempts[0].frame.txTimeNs)} µs，第七次占用 ${us(attempts[6].frame.txTimeNs)} µs`)
    // 「速率每失败两次降一档」: the rate changes after attempts 2, 4 and 6, never between
    const rates = attempts.map((a) => a.frame.mbps)
    expect(rates).toEqual([rates[0], rates[0], rates[2], rates[2], rates[4], rates[4], rates[6]])
    expect(new Set(rates).size).toBe(4)
    // the why's 「两倍多」
    expect(attempts[6].frame.txTimeNs / attempts[0].frame.txTimeNs).toBeGreaterThan(2)
    expect(retriesQueues.why).toContain('两倍多')
  })

  it('lab 2: the drop, the reset, the next frame, and the three-second counts', () => {
    const rs = recs()
    const rl = firstRl()
    const e = lab('第七次之后').expect
    const last = ofType(rs, 'RETRY').filter((r) => r.msduId === rl.msduId).pop()!
    expect(fmtRecord(last)).toBe(`sta-2 retry #${rl.msduId} (retries=7 QSRC=7)`)
    expect(fmtRecord(rl)).toBe(`sta-2 DROP #${rl.msduId} (retryLimit)`)
    expect(e).toContain(`${grouped(us(rl.t))} µs 处最后一次失败记作 “retry #id (retries=7 QSRC=7)”，紧接着一行 “DROP #id (retryLimit)”`)
    expect(ofType(rs, 'CW_CHANGE').find((r) => r.node === 'sta-2' && r.t === rl.t)!.cw).toBe(15)
    expect(e).toContain('同一时刻 CW 恢复为 15')
    const next = ofType(rs, 'TX_START').find((r) => r.node === 'sta-2' && r.t > rl.t)!
    expect(e).toContain(`下一帧在 ${grouped(us(next.t))} µs 发出，序列号为 ${next.frame.seqNo}，重发比特为 ${next.frame.retryFlag ? 1 : 0}`)
    const d = delivered(rs)
    expect(e).toContain(`Hidden A 送达 ${d['sta-1']} 帧、因重传上限丢弃 ${drops(rs, 'retryLimit', 'sta-1').length} 帧`)
    expect(e).toContain(`Hidden B 分别是 ${d['sta-2']} 帧与 ${drops(rs, 'retryLimit', 'sta-2').length} 帧`)
  })

  it('lab 3: the two counts come apart once a frame expires (the 20 ms variant)', () => {
    // 2026-11-11 (W7b): the default run has no lifetime drop any more (§10.4: the clock starts at
    // the first attempt), so the lab moved to the 20 ms variant; its first expiry is Hidden B's
    // first frame, at what would have been its seventh attempt.
    const rs = runOf(retriesQueues, 1, RUN_NS)
    const l = lab('两个计数不再一致')
    expect(l.variant).toBe(1)
    expect(retriesQueues.variants![1].scenario().queue).toEqual({ limit: 500, lifetimeMs: 20 })
    const life = drops(rs, 'lifetime', 'sta-2')
    const t0 = life[0].t
    expect(l.steps[0]).toContain(`${grouped(us(t0))} µs`)
    expect(l.steps[0]).toContain(`丢弃${['', '一', '两', '三', '四'][life.filter((r) => r.t === t0).length]}帧`)
    const head = life[0]
    const headAttempts = ofType(rs, 'TX_START').filter((r) => r.frame.msduId === head.msduId)
    const headRetries = ofType(rs, 'RETRY').filter((r) => r.msduId === head.msduId)
    const headSeq = headAttempts[0].frame.seqNo
    expect(l.expect).toContain(`（序列号 ${headSeq}）：它从 ${us(headAttempts[0].t)} µs 第一次发送起已失败 ${headRetries.length} 次`)
    expect(l.expect).toContain(`站点的计数停在 ${headRetries[headRetries.length - 1].qsrc}`)
    const next = ofType(rs, 'TX_START').find((r) => r.node === 'sta-2' && r.t >= t0)!
    expect(l.expect).toContain(`下一帧（序列号 ${next.frame.seqNo}）`)
    const nextRetries = ofType(rs, 'RETRY').filter((r) => r.msduId === next.frame.msduId).slice(0, 3)
    const cwAt = (t: number) => ofType(rs, 'CW_CHANGE').find((r) => r.node === 'sta-2' && r.t === t)!.cw
    const rows = tableOf(l, '26 940 µs 之后那一帧的前三次失败').rows
    expect(tableOf(l, '26 940 µs 之后那一帧的前三次失败').heading).toContain(grouped(us(t0)))
    rows.forEach(([k, retries, qsrc, cw], i) => {
      expect(k).toBe(String(i + 1))
      expect(retries).toBe(String(nextRetries[i].retries))
      expect(qsrc).toBe(String(nextRetries[i].qsrc))
      expect(cw).toBe(String(cwAt(nextRetries[i].t)))
    })
    expect(l.expect).toContain(`第一次失败时读数是 ${nextRetries[0].retries} 对 ${nextRetries[0].qsrc}`)
    expect(l.expect).toContain(`CW 恢复为 ${cwAt(nextRetries[0].t)}`)
    expect(l.expect).toContain(`第二次是 ${nextRetries[1].retries} 对 ${nextRetries[1].qsrc}`)
    // 「默认设置（500 ms）下三秒里一次也没有发生这种情况：……最长只用 65 ms」
    const base = recs()
    expect(drops(base, 'lifetime')).toEqual([])
    const firstTx = new Map<number, number>()
    for (const r of ofType(base, 'TX_START')) if (r.frame.msduId !== undefined && !firstTx.has(r.frame.msduId)) firstTx.set(r.frame.msduId, r.t)
    const spans = drops(base, 'retryLimit').map((d) => d.t - firstTx.get(d.msduId)!)
    expect(l.expect).toContain(`最长只用 ${Math.round(Math.max(...spans) / MS)} ms`)
  })
})
