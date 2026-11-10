/**
 * `@ampdu`, in the standard-first shape (2026-11-11).
 *
 * ① cites IEEE Std 802.11-2024 for the A-MPDU format, the delimiter, the length limits and the block
 * ack; ② is pinned against the engine — including the rows where it departs from the standard (one
 * decision for the whole aggregate, an unpadded final subframe in a VHT PPDU). ③'s figures are read
 * back out of the lesson text and compared with 200 ms runs of the scene and its variant.
 */
import { describe, it, expect } from 'vitest'
import { ampdu, ampduSubframeFields } from '../../src/course/tier2/ampdu'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { AMPDU_DELIMITER_BYTES, BA_BYTES, EDCA_PARAMS, FCS_BYTES, MAX_AMPDU_MPDUS, MAX_PPDU_NS, OFDM_5G, QOS_HDR_BYTES, txTimeModeNs } from '../../src/engine/phy'
import { ampduPsduBytes, ampduSubframeBytes } from '../../src/model/frames'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 200 * MS
const STA = 'sta-1'

const agg = (): TLRecord[] => runOf(ampdu, undefined, RUN_NS)
const plain = (): TLRecord[] => runOf(ampdu, 0, RUN_NS)
const thousands = (n: number): string => n.toLocaleString('en-US').replace(/,/g, ' ')

const lab = (heading: string): Lab => {
  const l = ampdu.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (blocks: Block[], heading: string): Extract<Block, { kind: 'table' }> => {
  const t = blocks.find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = ampdu.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => ampdu.standard!.map((b) =>
  `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

/** The run's totals: TXOPs won, frames delivered, and all airtime the exchange put on the medium. */
const totals = (rs: TLRecord[]) => {
  const txops = ofType(rs, 'TXOP_START').filter((r) => r.node === STA).length
  const delivered = ofType(rs, 'DEQUEUE').filter((r) => r.node === STA).length
  const air = ofType(rs, 'TX_START').reduce((a, r) => a + r.frame.txTimeNs, 0)
  return { txops, delivered, air, retries: ofType(rs, 'RETRY').length }
}

lessonShapeSuite(ampdu, { runNs: RUN_NS })

describe('ampdu · the lesson', () => {
  it('is in the standard-first shape, in the QoS module', () => {
    expect(isStandardFirst(ampdu)).toBe(true)
    expect(MODULES[ampdu.module].title).toBe('QoS 与效率')
    expect(ampdu.needs).toEqual(['small-frames', 'frame-qos-fcs', 'retries-queues'])
    expect(ampdu.terms!.map((t) => t.term)).toEqual(['A-MPDU', 'subframe', 'BlockAck'])
    expect(ampdu.limits).toEqual([])
    expect(ampdu.observe).toEqual([])
    expect(ampdu.tryThis).toEqual([])
  })

  it('keeps its scene and its one variant, which differs only in aggregation', () => {
    expect(() => ScenarioSchema.parse(ampdu.scenario())).not.toThrow()
    expect(ampdu.variants).toHaveLength(1)
    const f = ampdu.variants![0].scenario().nodes.find((n) => n.id === STA)!.caps.features
    expect(f).toEqual({ edca: true, txop: true })
    expect(ampdu.scenario().nodes.find((n) => n.id === STA)!.caps.generation).toBe('vht')
  })

  it('cites each clause it teaches in ①', () => {
    const std = stdText()
    for (const c of ['§9.7.1', '§9.7.2', '§9.7.3', '§10.12.2', '§10.12.6', '§10.13', '§10.23.2.8', '§10.25.1', '§9.3.1.8', '§9.3.1.8.2', '§10.25.6.7.1', '表 21-28', '表 9-659']) {
      expect(std, c).toContain(c)
    }
    expect(std).toContain(`VHT PPDU 为 ${MAX_PPDU_NS / MS} ms`)
  })
})

describe('ampdu · ② says what the engine does, and the engine does it', () => {
  it('a subframe is 4 + 26 + payload + 4, padded to four octets; the last one is not padded', () => {
    expect([AMPDU_DELIMITER_BYTES, QOS_HDR_BYTES, FCS_BYTES]).toEqual([4, 26, 4])
    expect(ampduSubframeBytes(1500)).toBe(1536)
    expect(implRow('子帧的组成').sim).toContain('4 + 26（QoS 帧头）+ 1500 + 4 = 1534 字节，补齐到 1536')
    expect(ampduPsduBytes(Array(14).fill(1500))).toBe(13 * 1536 + 1534)
    expect(implRow('最后一个子帧与 EOF 填充').kind).toBe('differs')
  })

  it('the cap is the engine\'s 64, and the BlockAck is 32 octets — a compressed BlockAck\'s size', () => {
    expect(MAX_AMPDU_MPDUS).toBe(64)
    expect(implRow('一批最多几帧').sim).toContain(`固定为 ${MAX_AMPDU_MPDUS} 帧`)
    // FC 2 + Duration 2 + RA 6 + TA 6 + BA Control 2 + SSC 2 + bitmap 8 + FCS 4
    expect(BA_BYTES).toBe(2 + 2 + 6 + 6 + 2 + 2 + 8 + 4)
    expect(implRow('逐帧确认').sim).toContain(`长度是 ${BA_BYTES} 字节`)
  })

  it('RTS threshold 3000 octets: every batch is preceded by RTS/CTS', () => {
    expect(ampdu.scenario().rtsThresholdBytes).toBe(3000)
    const tx = ofType(agg(), 'TX_START').filter((r) => r.node === STA)
    const data = tx.filter((r) => r.frame.kind === 'data')
    expect(tx.filter((r) => r.frame.kind === 'rts')).toHaveLength(data.length)
  })
})

describe('ampdu · ③ every figure the labs print is the run', () => {
  it('lab 1: the first batch, added up', () => {
    const rs = agg()
    const l = lab('打开第一批')
    const fig = l.blocks!.find((b) => b.kind === 'diagram')!
    expect(fig.kind === 'diagram' && fig.spec).toEqual(ampduSubframeFields())
    const rows = tableOf(l.blocks!, '第一批，逐项累加').rows
    const tx = ofType(rs, 'TX_START')
    const rts = tx.find((r) => r.frame.kind === 'rts')!
    const cts = tx.find((r) => r.frame.kind === 'cts')!
    const batch = tx.find((r) => r.frame.kind === 'data')!
    const ba = tx.find((r) => r.frame.kind === 'ba')!
    const t0 = ofType(rs, 'TXOP_START').find((r) => r.node === STA)!
    const n = batch.frame.ampdu!.mpduCount
    const end = ba.t + ba.frame.txTimeNs
    expect(rows[0][1]).toBe(String(n))
    expect(rows[0][0]).toContain(String(MAX_AMPDU_MPDUS))
    expect(rows[1][1]).toBe(`${thousands(ampduSubframeBytes(1500))} B`)
    expect(rows[2][1]).toBe(`${thousands(AMPDU_DELIMITER_BYTES + QOS_HDR_BYTES + 1500 + FCS_BYTES)} B`)
    expect(rows[3][0]).toBe(`${n - 1} × 1 536 + 1 534`)
    expect(rows[3][1]).toBe(`${thousands(batch.frame.bytes)} B`)
    expect(rows[4][1]).toBe(`${thousands(batch.frame.txTimeNs / US)} µs`)
    expect(rows[5][1]).toBe(`${thousands((end - t0.t) / US)} µs`)
    expect(end - t0.t).toBe(rts.frame.txTimeNs + cts.frame.txTimeNs + batch.frame.txTimeNs + ba.frame.txTimeNs + 3 * OFDM_5G.sifsNs)
    expect(rows[6][1]).toBe(`${thousands((t0.untilNs - t0.t) / US)} µs`)
    expect(t0.untilNs - t0.t).toBe(EDCA_PARAMS.find((p) => p.name === 'BE')!.txopLimitNs)
    // the fifteenth subframe would lengthen the batch by more than what is left
    const f = batch.frame
    const air = (k: number): number => txTimeModeNs(f.mode!, ampduPsduBytes(Array(k).fill(1500)), f.mcs!, { widthMhz: f.widthMhz })
    expect(air(n)).toBe(f.txTimeNs) // the same PHY parameters the batch was timed with
    const longer = air(n + 1) - f.txTimeNs
    const left = t0.untilNs - end
    expect(rows[7][1]).toBe(`${left / US} µs；${longer / US} µs`)
    expect(longer).toBeGreaterThan(left)
    expect(l.expect).toContain(`${rts.t / US} µs 发出 RTS，${cts.t / US} µs 收到 CTS，${batch.t / US} µs 起发出一个 ${thousands(f.bytes)} 字节、${n} 帧的 A-MPDU，时长 ${thousands(f.txTimeNs / US)} µs`)
    expect(l.expect).toContain(`这一批长 ${longer / US} µs，超出 TXOP 剩下的 ${left / US} µs，所以停在 ${n} 帧`)
    expect(new Set(ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'data').map((r) => r.frame.ampdu?.mpduCount))).toEqual(new Set([n]))
  })

  it('lab 2: one BlockAck, a SIFS after the batch', () => {
    const rs = agg()
    const l = lab('一个块确认覆盖整批')
    const batch = ofType(rs, 'TX_START').find((r) => r.frame.kind === 'data')!
    const ba = ofType(rs, 'TX_START').find((r) => r.frame.kind === 'ba')!
    const bEnd = batch.t + batch.frame.txTimeNs
    expect(ba.t - bEnd).toBe(OFDM_5G.sifsNs)
    expect(l.expect).toContain(`那一批在 ${thousands(bEnd / US)} µs 结束，${OFDM_5G.sifsNs / US} µs 之后接入点（access point, AP）发出块确认，${ba.frame.bytes} 字节、${ba.frame.txTimeNs / US} µs`)
    expect(ba.node).toBe('ap')
  })

  it('lab 3: the per-exchange formula and the 200 ms table', () => {
    const l = lab('聚合与不聚合')
    const a = totals(agg())
    const p = totals(plain())
    const rs = agg()
    const tx = ofType(rs, 'TX_START')
    const [rts, cts, batch, ba] = ['rts', 'cts', 'data', 'ba'].map((k) => tx.find((r) => r.frame.kind === k)!)
    const ptx = ofType(plain(), 'TX_START')
    const pData = ptx.find((r) => r.frame.kind === 'data')!
    const pAck = ptx.find((r) => r.frame.kind === 'ack')!
    const n = batch.frame.ampdu!.mpduCount
    const f = l.blocks!.find((b) => b.kind === 'formula')!
    const perAgg = (rts.frame.txTimeNs + cts.frame.txTimeNs + batch.frame.txTimeNs + ba.frame.txTimeNs) / n / US
    const perPlain = (pData.frame.txTimeNs + pAck.frame.txTimeNs) / US
    expect(f.kind === 'formula' && f.text).toContain(`(${rts.frame.txTimeNs / US} + ${cts.frame.txTimeNs / US} + ${thousands(batch.frame.txTimeNs / US)} + ${ba.frame.txTimeNs / US}) µs ÷ ${n} 帧 = ${perAgg.toFixed(1)} µs`)
    expect(f.kind === 'formula' && f.text).toContain(`(${pData.frame.txTimeNs / US} + ${pAck.frame.txTimeNs / US}) µs ÷ 1 帧        = ${perPlain.toFixed(1)} µs`)

    const rows = tableOf(l.blocks!, '200 ms 里的两种方式').rows
    const cell = (label: string) => rows.find((r) => r[0] === label)!
    expect(cell('赢得的 TXOP').slice(1)).toEqual([String(a.txops), String(p.txops)])
    expect(cell('每个 TXOP 送达的帧数').slice(1)).toEqual([(a.delivered / a.txops).toFixed(1), (p.delivered / p.txops).toFixed(1)])
    expect(cell('送达的帧数').slice(1)).toEqual([thousands(a.delivered), thousands(p.delivered)])
    expect(cell('每送达一帧占用的空口时间').slice(1)).toEqual([`${(a.air / a.delivered / US).toFixed(1)} µs`, `${(p.air / p.delivered / US).toFixed(1)} µs`])
    expect(cell('重传').slice(1)).toEqual([String(a.retries), String(p.retries)])
    expect(a.retries + p.retries).toBe(0)
    expect(l.expect).toContain(`聚合时送达 ${thousands(a.delivered)} 帧，不聚合时 ${p.delivered} 帧，约为 ${(a.delivered / p.delivered).toFixed(1)} 倍`)
    // "最后一批已经发出、还没有送达"
    const sent = ofType(rs, 'TX_START').filter((r) => r.node === STA && r.frame.kind === 'data').length
    expect(sent * n - a.delivered).toBe(n)
    // the figures `why` repeats
    expect(ampdu.why).toContain(`从 ${(p.air / p.delivered / US).toFixed(1)} µs 降到 ${(a.air / a.delivered / US).toFixed(1)} µs`)
    expect(ampdu.why).toContain(`一批 ${n} 帧`)
  })
})
