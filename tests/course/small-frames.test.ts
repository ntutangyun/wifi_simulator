/**
 * `@small-frames`, in the standard-first shape (2026-11-10).
 *
 * ① is IEEE Std 802.11-2024 on the control frame formats (§9.3.1), the A-MPDU and its delimiter
 * (§9.7.1, table 9-659), the Duration settings of an RTS-protected burst (§9.2.5.2, §9.2.5.6), the
 * RTS threshold (§10.3.5) and the control frame rates (§10.6.6). ② says row by row what this
 * simulator does, and each row is checked against the engine here. ③ is three runs, and every
 * figure they print is read back out of the lesson and compared with a run. The last block sweeps
 * every figure in every string a reader reads.
 */
import { describe, it, expect } from 'vitest'
import {
  smallFrames, burstSequence, BURST_MPDUS, BURST_BYTES, RTS_AT, BURST_AT, BA_AT,
} from '../../src/course/tier1/small-frames'
import {
  frameAnatomyScenario, firstRtsFrame, firstAmpduFrame, firstBlockAck,
} from '../../src/course/tier1/frame-anatomy'
import { Simulation } from '../../src/engine/simulation'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { readerTexts } from '../../src/course/readability'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { decodeFrame } from '../../src/model/frameFields'
import { ampduPsduBytes, ampduSubframeBytes } from '../../src/model/frames'
import { hasFeature } from '../../src/model/caps'
import type { TLRecord } from '../../src/model/records'
import {
  ACK_BYTES, AMPDU_DELIMITER_BYTES, BA_BYTES, CTS_BYTES, FCS_BYTES, MAX_AMPDU_MPDUS, MAX_PPDU_NS,
  QOS_HDR_BYTES, RTS_BYTES, SIFS_NS, txTimeNs,
} from '../../src/engine/phy'
import { MODULES } from '../../src/course/curriculum'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 30 * MS
type Tx = Extract<TLRecord, { type: 'TX_START' }>

const records = runOf(smallFrames, undefined, RUN_NS)
const txs = ofType(records, 'TX_START')
const rts = records.find(firstRtsFrame) as Tx
const agg = records.find(firstAmpduFrame) as Tx
const ba = records.find(firstBlockAck) as Tx
const cts = txs.find((r) => r.frame.kind === 'cts' && r.t > rts.t)!
const ms3 = (ns: number): string => `${(ns / MS).toFixed(3)} ms`
const grouped = (n: number): string => (n >= 10_000 ? n.toLocaleString('en-US').replace(/,/g, ' ') : String(n))
function decode(f: Tx['frame'], sc = frameAnatomyScenario()) {
  const ap = sc.nodes.find((n) => n.kind === 'ap')!
  const src = sc.nodes.find((n) => n.id === f.src) ?? ap
  return decodeFrame(f, { apId: ap.id, isEdca: hasFeature(src, 'edca') && hasFeature(ap, 'edca') })
}

/** Lab 3's edit, as its first step describes it. */
const RAISED = 30_000
function raisedThreshold(): Scenario {
  const sc = frameAnatomyScenario()
  sc.rtsThresholdBytes = RAISED
  return sc
}

const lab = (heading: string): Lab => {
  const l = smallFrames.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (blocks: Block[], heading: string): Extract<Block, { kind: 'table' }> => {
  const t = blocks.find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = smallFrames.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => smallFrames.standard!.map((b) => JSON.stringify(b)).join(' ')

lessonShapeSuite(smallFrames, { runNs: RUN_NS, sameSceneAs: 'frame-anatomy-bytes' })

describe('small-frames · the lesson', () => {
  it('is in the standard-first shape, fourth in the frames module', () => {
    expect(isStandardFirst(smallFrames)).toBe(true)
    expect(MODULES[smallFrames.module].title).toBe('帧与空口时间')
    expect(smallFrames.needs).toEqual(['frame-anatomy-bytes'])
    expect(smallFrames.terms!.map((t) => t.term)).toEqual(['A-MPDU', 'BlockAck'])
    expect(smallFrames.limits).toEqual([])
    expect(smallFrames.observe).toEqual([])
    expect(smallFrames.tryThis).toEqual([])
    expect(smallFrames.scenario()).toEqual(frameAnatomyScenario())
    expect(smallFrames.variants).toBeUndefined()
    expect(() => ScenarioSchema.parse(smallFrames.scenario())).not.toThrow()
    for (const q of smallFrames.quiz) expect(q.answer).toBeLessThan(q.options.length)
  })

  it('cites each clause it teaches in ①, and only the standard is there', () => {
    const std = stdText()
    for (const c of ['§9.3.1.2', '§9.3.1.4', '§9.3.1.8.2', '§9.3.1.8.1', '§9.7.1', '表 9-659', '图 9-1329', '§9.7.2',
      '§10.12.6', '§9.2.5.2', '§9.2.5.6', '§10.3.5', '§10.6.6.2', '§10.6.6.5.2', '表 17-23', '§10.25', '表 9-13']) {
      expect(std, c).toContain(c)
    }
    expect(std).not.toContain('本仿真器')
  })

  it('① control frame table: each row\'s fields add up to its total, and the engine agrees', () => {
    const t = tableOf(smallFrames.standard!, '控制帧的字段（§9.3.1.2–§9.3.1.4，§9.3.1.8.2，图 9-41 至图 9-43，图 9-52，图 9-54）')
    const engine: Record<string, number> = { Ack: ACK_BYTES, CTS: CTS_BYTES, RTS: RTS_BYTES }
    for (const [name, fields, total] of t.rows) {
      const sum = (fields.match(/\d+/g) ?? []).map(Number).reduce((a, b) => a + b, 0)
      expect(`${sum} B`, name).toBe(total)
      const key = name.startsWith('Compressed') ? 'BA' : name
      expect(sum, name).toBe(key === 'BA' ? BA_BYTES : engine[key])
    }
    // 「64 帧的位图」 is the 8-octet bitmap
    expect(8 * 8).toBe(64)
    expect(MAX_AMPDU_MPDUS).toBe(64)
  })

  it('① delimiter table: five subfields, thirty-two bits, the engine\'s four octets', () => {
    const t = tableOf(smallFrames.standard!, 'MPDU 定界符（图 9-1329，表 9-659）')
    expect(t.rows.reduce((s, r) => s + Number(r[1]), 0)).toBe(AMPDU_DELIMITER_BYTES * 8)
    expect(t.rows.find((r) => r[0] === 'CRC')![2]).toBe(`对前面 ${t.rows.slice(0, 3).reduce((s, r) => s + Number(r[1]), 0)} 位的校验`)
    // 「强制速率是 6、12 与 24 Mb/s」 and the control frames of this run use the highest of them
    expect(stdText()).toContain('6、12 与 24 Mb/s')
  })
})

describe('small-frames · ② says what the engine does, and the engine does it', () => {
  it('control frame sizes and the subframe layout are the standard\'s', () => {
    expect(implRow('控制帧的长度').kind).toBe('faithful')
    expect([rts.frame.bytes, cts.frame.bytes, ba.frame.bytes]).toEqual([RTS_BYTES, CTS_BYTES, BA_BYTES])
    expect(implRow('子帧的排列').kind).toBe('faithful')
    const msdu = 1500
    expect(ampduSubframeBytes(msdu)).toBe(AMPDU_DELIMITER_BYTES + Math.ceil((QOS_HDR_BYTES + msdu + FCS_BYTES) / 4) * 4)
    const sf = decode(agg.frame).users[0].subframes
    expect(sf.every((s) => s.delimiterBytes === AMPDU_DELIMITER_BYTES)).toBe(true)
    expect(sf.slice(0, -1).every((s) => (s.delimiterBytes + s.mpdu.bytes + s.padBytes) % 4 === 0)).toBe(true)
    expect(sf.at(-1)!.padBytes).toBe(0)
  })

  it('no padding on a VHT A-MPDU\'s last subframe, and no EOF padding', () => {
    expect(implRow('VHT 中最后一个子帧的填充').kind).toBe('differs')
    expect(agg.frame.mode).toBe('vht')
    expect(agg.frame.bytes).toBe(ampduPsduBytes(Array(BURST_MPDUS).fill(1500)))
  })

  it('the delimiter is a length, and the whole PSDU is one decision', () => {
    expect(implRow('定界符的内容').kind).toBe('differs')
    expect(implRow('逐帧校验与位图').kind).toBe('differs')
    // the BlockAck of the run acknowledges every MPDU of the burst it answers
    const acked = ofType(records, 'DEQUEUE').filter((r) => r.node === 'sta-3' && r.t === ba.t + ba.frame.txTimeNs)
    expect(acked).toHaveLength(BURST_MPDUS)
  })

  it('durations are §9.2.5.2 / §9.2.5.6, kept in nanoseconds', () => {
    expect(implRow('持续时间').kind).toBe('faithful')
    expect(rts.frame.durationFieldNs).toBe(cts.frame.txTimeNs + agg.frame.txTimeNs + ba.frame.txTimeNs + 3 * SIFS_NS)
    expect(cts.frame.durationFieldNs).toBe(rts.frame.durationFieldNs - SIFS_NS - cts.frame.txTimeNs)
    expect(agg.frame.durationFieldNs).toBe(SIFS_NS + ba.frame.txTimeNs)
    expect(ba.frame.durationFieldNs).toBe(Math.max(0, agg.frame.durationFieldNs - SIFS_NS - ba.frame.txTimeNs))
  })

  it('the RTS threshold is the scene\'s 2000 B', () => {
    expect(implRow('RTS 门限').kind).toBe('value')
    expect(implRow('RTS 门限').sim).toContain(`${frameAnatomyScenario().rtsThresholdBytes} B`)
    expect(agg.frame.bytes).toBeGreaterThan(frameAnatomyScenario().rtsThresholdBytes!)
  })

  it('control frames at 24 Mb/s; a burst of at most 64 subframes and 5.484 ms', () => {
    expect(implRow('控制帧的速率').kind).toBe('value')
    expect(implRow('控制帧的速率').sim).toContain('24 Mb/s')
    for (const f of [rts, cts, ba]) expect(f.frame.mbps).toBe(24)
    expect(implRow('A-MPDU 的长度').kind).toBe('value')
    expect(implRow('A-MPDU 的长度').sim).toContain(`最多 ${MAX_AMPDU_MPDUS} 个子帧、最长 ${MAX_PPDU_NS / MS} ms`)
    expect(implRow('A-MPDU 的长度').standard).toContain(`${MAX_PPDU_NS / MS} ms`)
    expect(implRow('块确认协议').kind).toBe('absent')
    expect(txs.every((r) => ['data', 'ack', 'rts', 'cts', 'ba'].includes(r.frame.kind))).toBe(true)
  })
})

describe('small-frames · ③ every figure the labs print is the run', () => {
  it('lab 1: the four frames, cell by cell', () => {
    const rows = tableOf(lab('一次受保护的 A-MPDU 交换').blocks!, '四个帧').rows
    const frames = [rts, cts, agg, ba]
    rows.forEach((row, i) => {
      const f = frames[i]
      expect(row.slice(1), row[0]).toEqual([
        ms3(f.t), `${grouped(f.frame.bytes)} B`, `${f.frame.txTimeNs / US} µs`, `${f.frame.durationFieldNs / US} µs`,
      ])
    })
    expect(rows[2][0]).toBe(`A-MPDU（${agg.frame.ampdu!.mpduCount} 帧）`)
    expect(cts.t).toBe(rts.t + rts.frame.txTimeNs + SIFS_NS)
    expect(agg.t).toBe(cts.t + cts.frame.txTimeNs + SIFS_NS)
    expect(ba.t).toBe(agg.t + agg.frame.txTimeNs + SIFS_NS)
  })

  it('lab 1: the figure is the run, and the expect line adds up', () => {
    const d = lab('一次受保护的 A-MPDU 交换').blocks!.find((b): b is Extract<Block, { kind: 'diagram' }> => b.kind === 'diagram')!
    expect(d.spec).toEqual(burstSequence())
    expect([RTS_AT, BURST_AT, BA_AT]).toEqual([ms3(rts.t), ms3(agg.t), ms3(ba.t)])
    const labels = burstSequence().messages.map((m) => m.label)
    expect(labels).toEqual([`RTS ${rts.frame.bytes} B`, `CTS ${cts.frame.bytes} B`, `${agg.frame.ampdu!.mpduCount} 帧组成的 A-MPDU`, `BlockAck ${ba.frame.bytes} B`])
    const ex = lab('一次受保护的 A-MPDU 交换').expect
    const u = (ns: number): number => ns / US
    expect(ex).toContain(`RTS 的 ${u(rts.frame.durationFieldNs)} µs 等于 ${u(cts.frame.txTimeNs)} + ${u(agg.frame.txTimeNs)} + ${u(ba.frame.txTimeNs)} + 3 × ${u(SIFS_NS)}`)
    expect(ex).toContain(`CTS 的 ${u(cts.frame.durationFieldNs)} µs 是它减去 ${u(SIFS_NS)} µs 的 SIFS 与 ${u(cts.frame.txTimeNs)} µs 的 CTS`)
    expect(ex).toContain(`A-MPDU 中的帧写 ${u(agg.frame.durationFieldNs)} µs`)
    expect(ex).toContain(`BlockAck 写 ${u(ba.frame.durationFieldNs)}`)
    expect(ex).toContain(`RTS 与 CTS 合计 ${u(rts.frame.txTimeNs + cts.frame.txTimeNs)} µs，不到 A-MPDU 时长的百分之三`)
    expect((rts.frame.txTimeNs + cts.frame.txTimeNs) / agg.frame.txTimeNs).toBeLessThan(0.03)
    expect(lab('一次受保护的 A-MPDU 交换').meaning).toContain(`${rts.frame.mbps} Mb/s`)
  })

  it('lab 2: one subframe, then fourteen', () => {
    const rows = tableOf(lab('十四帧怎样排在一个前导码后面').blocks!, '一个子帧，以及十四个子帧').rows
    const sf = decode(agg.frame).users[0].subframes
    const m = sf[0].mpdu
    const body = m.fields.find((x) => x.key === 'body')!.bytes
    const padded = Math.ceil(m.bytes / 4) * 4
    const place = AMPDU_DELIMITER_BYTES + padded
    const last = AMPDU_DELIMITER_BYTES + m.bytes
    const n = agg.frame.ampdu!.mpduCount
    expect(rows.map((r) => r[1])).toEqual([
      `${QOS_HDR_BYTES} + ${body} + ${FCS_BYTES} = ${m.bytes} B`, `${padded} B`, `${place} B`,
      `${n - 1} × ${place} + ${last} = ${grouped(agg.frame.bytes)} B`,
    ])
    expect(rows[2][0]).toContain(`${AMPDU_DELIMITER_BYTES} B`)
    expect((n - 1) * place + last).toBe(agg.frame.bytes)
    expect(agg.frame.bytes).toBe(BURST_BYTES)
    expect(n).toBe(BURST_MPDUS)
    expect(sf).toHaveLength(n)
    const ex = lab('十四帧怎样排在一个前导码后面').expect
    expect(ex).toBe(`整串 ${grouped(agg.frame.bytes)} B，以 VHT 的调制与编码方式（modulation and coding scheme, MCS）${agg.frame.mcs} 发送，空口时间 ${agg.frame.txTimeNs / US} µs；路由器以一个 ${ba.frame.bytes} B 的 BlockAck 确认全部 ${n} 帧。`)
    expect(agg.frame.mode).toBe('vht')
  })

  it('lab 3: with the threshold raised the bursts go out with nothing in front', () => {
    const l = lab('提高 RTS 门限')
    expect(l.steps[0]).toContain(`${grouped(RAISED)} B`)
    const rs = [...new Simulation(raisedThreshold()).runUntil(RUN_NS).records]
    const a = rs.find((r): r is Tx => r.type === 'TX_START' && r.frame.ampdu !== undefined)!
    expect(rs.some((r) => r.type === 'TX_START' && (r.frame.kind === 'rts' || r.frame.kind === 'cts'))).toBe(false)
    expect(a.frame.bytes).toBeLessThan(RAISED)
    expect(l.expect).toBe(`A-MPDU 前不再有 RTS 与 CTS：第一个 A-MPDU 在 ${ms3(a.t)} 直接发出，含 ${a.frame.ampdu!.mpduCount} 帧、${grouped(a.frame.bytes)} B，仍小于新的门限；整个运行中没有一个 RTS。`)
  })

  it('the quiz: a 14 B ACK is two symbols of 24 Mb/s, a 7 B one is one', () => {
    const ack = txs.find((r) => r.frame.kind === 'ack')!
    expect(ack.frame.bytes).toBe(ACK_BYTES)
    const q = smallFrames.quiz[1]
    expect(q.q).toContain(`一个 ${ACK_BYTES} B 的确认帧占 ${ack.frame.txTimeNs / US} µs，其中 20 µs 是前导码与 SIGNAL`)
    expect(q.q).toContain('缩减为 7 个字节')
    const saved = (txTimeNs(ACK_BYTES, 24) - txTimeNs(7, 24)) / US
    expect(q.options[1]).toContain(`最多 ${saved} µs`)
    expect(q.options[0]).toContain(`${ack.frame.txTimeNs / US / 2} µs`)
    expect(q.explain).toContain(`${ACK_BYTES} B 在 ${ack.frame.mbps} Mb/s 下需要两个符号，7 B 只需要一个，节省的就是那一个 ${saved} µs 的符号`)
    expect(smallFrames.quiz[0].explain).toContain(`${grouped(agg.frame.bytes)} B`)
  })
})

describe('small-frames · every figure the lesson prints is one this file measured', () => {
  const strip = (s: string): string => s
    .replace(/§[\d.]+(–§[\d.]+)?/g, '').replace(/[表图] \d+-\d+/g, '')
    .replace(/IEEE( Std)? 802\.11-\d{4}/g, '').replace(/802\.11[a-z]*(-\d{4})?/g, '')
    .replace(/src\/[\w/.]+/g, '').replace(/dot11\w+/g, '').replace(/0x4E/g, '').replace(/CRC-8/g, '')

  it('sweeps every string a reader reads: no figure without a measurement behind it', () => {
    const rs3 = [...new Simulation(raisedThreshold()).runUntil(RUN_NS).records]
    const a3 = rs3.find((r): r is Tx => r.type === 'TX_START' && r.frame.ampdu !== undefined)!
    const allowed = new Set<string>([
      // control frame fields and totals; the delimiter's bits
      '2', '6', '4', '8', String(ACK_BYTES), String(RTS_BYTES), String(BA_BYTES), '64', '1', '14', '16', '0', '3',
      // the run's four frames
      ...[rts, cts, agg, ba].flatMap((f) => [(f.t / MS).toFixed(3), String(f.frame.txTimeNs / US), String(f.frame.durationFieldNs / US)]),
      ...grouped(agg.frame.bytes).split(' '), String(SIFS_NS / US), String((rts.frame.txTimeNs + cts.frame.txTimeNs) / US),
      // the subframe arithmetic
      String(QOS_HDR_BYTES), '1500', '1530', '1532', '1536', '1534', '13', String(agg.frame.mcs),
      // lab 3's threshold and burst; the scene's threshold
      '30', '000', String(a3.frame.ampdu!.mpduCount), ...grouped(a3.frame.bytes).split(' '), '2000',
      // rates, limits, and the quiz's halved ACK
      '12', '24', String(MAX_PPDU_NS / MS), '20', '7',
    ])
    const stray: string[] = []
    for (const s of readerTexts(smallFrames)) {
      for (const n of strip(s).match(/\d+(?:\.\d+)?/g) ?? []) if (!allowed.has(n)) stray.push(`${n} in 「${s.slice(0, 40)}」`)
    }
    expect(stray).toEqual([])
  })
})
