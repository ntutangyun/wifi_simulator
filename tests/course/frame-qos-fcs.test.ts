/**
 * `@frame-qos-fcs`, in the standard-first shape (2026-11-10).
 *
 * ① is IEEE Std 802.11-2024 on the QoS Control field (table 9-10), the TID as a user priority
 * (table 9-12) and its access category (table 10-1), the ack policy (table 9-13), the FCS
 * (§9.2.4.9) and what reception and acknowledgement mean (§9.2.2, §10.3.2.11, §10.23.2.12.1).
 * ② says row by row what this simulator does, and each row is checked against the engine here.
 * ③ is three runs, and every figure they print is read back out of the lesson and compared with a
 * run. The last block sweeps every figure in every string a reader reads.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { frameQosFcs } from '../../src/course/tier1/frame-qos-fcs'
import {
  frameAnatomyScenario, firstLegacyData, firstQosSingle, firstAmpduFrame, firstLegacyRetry,
} from '../../src/course/tier1/frame-anatomy'
import { Simulation } from '../../src/engine/simulation'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { readerTexts } from '../../src/course/readability'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { decodeFrame, TID_FOR_AC, type Mpdu } from '../../src/model/frameFields'
import { hasFeature } from '../../src/model/caps'
import type { RxFailReason, TLRecord } from '../../src/model/records'
import { AMPDU_DELIMITER_BYTES, EDCA_PARAMS, FCS_BYTES, MAC_HDR_BYTES, QOS_HDR_BYTES, SIFS_NS } from '../../src/engine/phy'
import { MODULES } from '../../src/course/curriculum'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 30 * MS
type Tx = Extract<TLRecord, { type: 'TX_START' }>

const records = runOf(frameQosFcs, undefined, RUN_NS)
const txs = ofType(records, 'TX_START')
const find = (pred: (r: TLRecord) => boolean): Tx => {
  const r = records.find(pred)
  expect(r, 'jump target not reached').toBeDefined()
  return r as Tx
}
function decode(f: Tx['frame'], sc = frameAnatomyScenario()) {
  const ap = sc.nodes.find((n) => n.kind === 'ap')!
  const src = sc.nodes.find((n) => n.id === f.src) ?? ap
  return decodeFrame(f, { apId: ap.id, isEdca: hasFeature(src, 'edca') && hasFeature(ap, 'edca') })
}
const firstMpdu = (f: Tx['frame'], sc?: Scenario): Mpdu => decode(f, sc ?? frameAnatomyScenario()).users[0].subframes[0].mpdu
const runEdited = (sc: Scenario, ns: number): TLRecord[] => [...new Simulation(sc).runUntil(ns).records]
const field = (m: Mpdu, key: string) => m.fields.find((x) => x.key === key)
const bitOf = (m: Mpdu, key: string) => field(m, 'fc')!.bits!.find((b) => b.key === key)!.value
const ms3 = (ns: number): string => `${(ns / MS).toFixed(3)} ms`
const hdrBytes = (m: Mpdu): number => (field(m, 'qos') ? QOS_HDR_BYTES : MAC_HDR_BYTES)

const qos = find(firstQosSingle)
const legacy = find(firstLegacyData)
const agg = find(firstAmpduFrame)
const retry = find(firstLegacyRetry)
const orig = txs.find((r) => r.frame.src === 'sta-1' && r.frame.seqNo === retry.frame.seqNo && !r.frame.retryFlag)!

/** The two edits lab 2 makes, as its steps describe them. */
function oldAsWifi5(): Scenario {
  const sc = frameAnatomyScenario()
  const old = sc.nodes.find((n) => n.id === 'sta-1')!
  old.caps.generation = 'vht'
  old.caps.features = { edca: true, ampdu: true, txop: true }
  return sc
}
function phoneNoEdca(): Scenario {
  const sc = frameAnatomyScenario()
  sc.nodes.find((n) => n.id === 'sta-2')!.caps.features = {}
  return sc
}
const firstDataOf = (rs: TLRecord[], src: string): Tx =>
  rs.find((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.src === src)!

const lab = (heading: string): Lab => {
  const l = frameQosFcs.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (blocks: Block[], heading: string): Extract<Block, { kind: 'table' }> => {
  const t = blocks.find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = frameQosFcs.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => frameQosFcs.standard!.map((b) => JSON.stringify(b)).join(' ')
/** The engine's access-category order: EDCA_PARAMS' index is what TID_FOR_AC is indexed by. */
const AC_ZH = ['背景', '尽力而为', '视频', '语音']

lessonShapeSuite(frameQosFcs, { runNs: RUN_NS, sameSceneAs: 'frame-anatomy' })

describe('frame-qos-fcs · the lesson', () => {
  it('is in the standard-first shape, second in the frames module', () => {
    expect(isStandardFirst(frameQosFcs)).toBe(true)
    expect(MODULES[frameQosFcs.module].title).toBe('帧与空口时间')
    expect(frameQosFcs.needs).toEqual(['frame-anatomy'])
    expect(frameQosFcs.terms!.map((t) => t.term)).toEqual(['QOS', 'TID'])
    expect(frameQosFcs.limits).toEqual([])
    expect(frameQosFcs.observe).toEqual([])
    expect(frameQosFcs.tryThis).toEqual([])
    expect(frameQosFcs.scenario()).toEqual(frameAnatomyScenario())
    expect(frameQosFcs.variants).toBeUndefined()
    expect(() => ScenarioSchema.parse(frameQosFcs.scenario())).not.toThrow()
    for (const q of frameQosFcs.quiz) expect(q.answer).toBeLessThan(q.options.length)
  })

  it('cites each clause it teaches in ①, and only the standard is there', () => {
    const std = stdText()
    for (const c of ['§9.2.4.5.1', '表 9-10', '§9.2.4.5.2', '表 9-12', '§10.2.3.2', '表 10-1', '§9.2.4.5.4', '表 9-13',
      '§9.2.4.9', '§9.2.2', '§10.3.2.11', '§10.23.2.12.1', '§9.2.4.4.3']) expect(std, c).toContain(c)
    expect(std).not.toContain('本仿真器')
  })

  it('① table 10-1: the four categories cover the eight user priorities once each', () => {
    const t = tableOf(frameQosFcs.standard!, '用户优先级到接入类别的映射（§10.2.3.2，表 10-1）')
    const ups = t.rows.flatMap((r) => r[1].split(', ').map(Number))
    expect([...ups].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    // the engine's own mark for each category is one of that category's priorities
    t.rows.forEach((r, ac) => {
      expect(r[2]).toBe(AC_ZH[ac])
      expect(r[1].split(', ').map(Number)).toContain(TID_FOR_AC[ac])
    })
    expect(EDCA_PARAMS).toHaveLength(4)
    // 「1、2、0、3、4、5、6、7」 is that same table read in priority order
    expect(stdText()).toContain(t.rows.flatMap((r) => r[1].split(', ')).join('、'))
  })

  it('① table 9-10: the five subfields cover sixteen bits, and the TID is four of them', () => {
    const t = tableOf(frameQosFcs.standard!, '非接入点站点发送的 QoS Data 帧：QoS 控制字段（表 9-10）')
    const covered: number[] = []
    for (const [bits] of t.rows) {
      const [a, b] = bits.split('–').map(Number)
      for (let i = a; i <= (b ?? a); i++) covered.push(i)
    }
    expect(covered).toEqual(Array.from({ length: 16 }, (_, i) => i))
    expect((QOS_HDR_BYTES - MAC_HDR_BYTES) * 8).toBe(16)
    expect(frameQosFcs.terms![1].plain).toContain('4 位编号')
    // the generator polynomial is of degree 32, and FCS is 32 bits = the engine's 4 octets
    expect(FCS_BYTES * 8).toBe(32)
    expect(stdText()).toContain('G(x) = x^32 + ')
  })
})

describe('frame-qos-fcs · ② says what the engine does, and the engine does it', () => {
  it('a QoS Data frame when both ends run EDCA, 26 B of header; a Data frame otherwise, 24 B', () => {
    expect(implRow('QoS 控制字段的出现').kind).toBe('faithful')
    for (const r of txs.filter((x) => x.frame.kind === 'data' && !x.frame.ampdu)) {
      const m = firstMpdu(r.frame)
      // 2026-11-11 (W7a): on an HE link the lone MPDU is an S-MPDU (§10.12.7) — `frame.bytes` is then
      // the PSDU after EOF padding (§10.12.6) and the MPDU is APEP_LENGTH less the 4-octet delimiter.
      const mpdu = r.frame.smpdu ? r.frame.apepBytes! - AMPDU_DELIMITER_BYTES : r.frame.bytes
      expect(hdrBytes(m) + field(m, 'body')!.bytes + FCS_BYTES).toBe(mpdu)
      expect(m.bytes).toBe(mpdu)
      expect(m.subtypeName).toBe(field(m, 'qos') ? 'QoS Data' : 'Data')
    }
    expect(implRow('QoS 控制字段的出现').sim).toContain(`${QOS_HDR_BYTES} B`)
    expect(implRow('QoS 控制字段的出现').sim).toContain(`${MAC_HDR_BYTES} B`)
  })

  it('one fixed TID per access category, and the row prints the engine\'s four', () => {
    expect(implRow('TID 的取值').kind).toBe('choice')
    const pairs = [...implRow('TID 的取值').sim.matchAll(/(背景|尽力而为|视频|语音) (\d)/g)].map((m) => [m[1], Number(m[2])])
    expect(pairs).toEqual(AC_ZH.map((zh, ac) => [zh, TID_FOR_AC[ac]]))
  })

  it('Normal Ack alone, Implicit BAR in an aggregate', () => {
    expect(implRow('确认策略').kind).toBe('faithful')
    expect(field(firstMpdu(qos.frame), 'qos')!.value).toContain('Normal Ack')
    for (const sf of decode(agg.frame).users[0].subframes) expect(field(sf.mpdu, 'qos')!.value).toContain('Implicit BAR')
    // and the answers really are an ACK and a BlockAck, a SIFS after
    const ackQ = txs.find((r) => r.t > qos.t && r.frame.dst === qos.frame.src)!
    expect(ackQ.frame.kind).toBe('ack')
    expect(ackQ.t - (qos.t + qos.frame.txTimeNs)).toBe(SIFS_NS)
    const ba = txs.find((r) => r.t > agg.t && r.frame.dst === agg.frame.src)!
    expect(ba.frame.kind).toBe('ba')
    expect(ba.t - (agg.t + agg.frame.txTimeNs)).toBe(SIFS_NS)
  })

  it('the other QoS subfields are not modelled: the field view shows the TID and the policy only', () => {
    expect(implRow('QoS 控制的其他子字段').kind).toBe('absent')
    expect(field(firstMpdu(qos.frame), 'qos')!.value).toMatch(/^TID \d · (Normal Ack|Implicit BAR)$/)
  })

  it('no file of src/engine computes a CRC; FCS is a byte count', () => {
    expect(implRow('FCS 的计算').kind).toBe('differs')
    expect(implRow('FCS 的计算').sim).toContain(`${FCS_BYTES} B`)
    const dir = new URL('../../src/engine/', import.meta.url)
    for (const f of readdirSync(dir)) {
      // ampBs.ts carries crc16Epc for AMP tag ids, which is not an 802.11 MPDU check.
      if (!f.endsWith('.ts') || f === 'ampBs.ts') continue
      const src = readFileSync(new URL(f, dir), 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')
      expect(src.match(/crc/gi), `${f} computes a CRC`).toBeNull()
    }
  })

  it('reception is a SINR decision, and its failures are the four reasons the row names', () => {
    expect(implRow('接收的判定').kind).toBe('differs')
    // RxFailReason minus 'undetected', which its own doc comment keeps off RX_FAIL
    const reasons: Exclude<RxFailReason, 'undetected'>[] = ['collision', 'lowSinr', 'txDuringRx', 'capture']
    expect(implRow('接收的判定').sim).toContain('四种')
    for (const r of ofType(records, 'RX_FAIL')) expect(reasons).toContain(r.reason)
  })

  it('no ACK → back off and retry with the same number and the Retry bit', () => {
    expect(implRow('没有收到确认帧之后').kind).toBe('faithful')
    expect(retry.frame.seqNo).toBe(orig.frame.seqNo)
    expect(bitOf(firstMpdu(retry.frame), 'retry')).toBe('1')
    expect(ofType(records, 'ACK_TIMEOUT').some((r) => r.node === 'sta-1' && r.t > orig.t && r.t < retry.t)).toBe(true)
    expect(ofType(records, 'BACKOFF_DRAW').some((r) => r.node === 'sta-1' && r.t > orig.t && r.t < retry.t)).toBe(true)
  })
})

describe('frame-qos-fcs · ③ every figure the labs print is the run', () => {
  it('lab 1: the two headers, cell by cell', () => {
    const rows = tableOf(lab('一个带业务标记的数据帧').blocks!, '两帧的帧头').rows
    const mq = firstMpdu(qos.frame)
    const ml = firstMpdu(legacy.frame)
    expect(rows[0].slice(1)).toEqual([ms3(qos.t), `${legacy.t / US} µs`])
    expect(rows[1].slice(1)).toEqual([`QoS Data（${bitOf(mq, 'subtype').slice(0, 4)}）`, `Data（${bitOf(ml, 'subtype').slice(0, 4)}）`])
    expect(rows[2].slice(1)).toEqual([`${hdrBytes(mq)} B`, `${hdrBytes(ml)} B`])
    expect(rows[3][1]).toBe(field(mq, 'qos')!.value!.replace(' · ', '，'))
    expect(field(ml, 'qos')).toBeUndefined()
    expect(rows[4].slice(1)).toEqual([`${qos.frame.durationFieldNs / US} µs`, `${legacy.frame.durationFieldNs / US} µs`])
    // the expect line: both uplink, same roles, 44 µs, and the two bytes
    expect([bitOf(mq, 'toDs'), bitOf(ml, 'toDs')]).toEqual(['1', '1'])
    const ex = lab('一个带业务标记的数据帧').expect
    expect(ex).toContain(`持续时间（Duration/ID）都是 ${qos.frame.durationFieldNs / US} µs`)
    expect(ex).toContain(`${QOS_HDR_BYTES - MAC_HDR_BYTES} 个字节`)
  })

  it('lab 2: the marks each device writes, in the scene and in the two edits', () => {
    const rows = tableOf(lab('这个房间里写的是哪些 TID').blocks!, '各设备写入的 QoS 控制字段').rows
    const cell = (m: Mpdu | undefined, ac: number | undefined): string[] => {
      const q = m && field(m, 'qos')
      if (!q) return ['无', '不带 QoS 控制字段', '无']
      const [, tid, policy] = q.value!.match(/^TID (\d) · (.+)$/)!
      return [AC_ZH[ac!], tid, policy]
    }
    expect(rows[0].slice(1)).toEqual(cell(firstMpdu(qos.frame), qos.frame.ac))
    expect(rows[1].slice(1)).toEqual(cell(decode(agg.frame).users[0].subframes[0].mpdu, agg.frame.ac))
    expect(agg.frame.src).toBe('sta-3')
    expect(rows[2].slice(1)).toEqual(cell(firstMpdu(legacy.frame), legacy.frame.ac))
    const w5 = oldAsWifi5()
    const f5 = firstDataOf(runEdited(w5, 40 * MS), 'sta-1')
    expect(f5.frame.ampdu).toBeDefined()
    expect(rows[3].slice(1)).toEqual(cell(decode(f5.frame, w5).users[0].subframes[0].mpdu, f5.frame.ac))
    const ne = phoneNoEdca()
    const fn = firstDataOf(runEdited(ne, 40 * MS), 'sta-2')
    expect(firstMpdu(fn.frame, ne).subtypeName).toBe('Data')
    expect(rows[4].slice(1)).toEqual(cell(firstMpdu(fn.frame, ne), fn.frame.ac))
    // the expect line's three marks
    const ex = lab('这个房间里写的是哪些 TID').expect
    expect([...ex.matchAll(/(语音|背景|尽力而为)写 (\d)/g)].map((m) => [m[1], Number(m[2])]))
      .toEqual([['语音', TID_FOR_AC[3]], ['背景', TID_FOR_AC[0]], ['尽力而为', TID_FOR_AC[1]]])
  })

  it('lab 3: the frame that was not received, and the reasons of thirty milliseconds', () => {
    const l = lab('一帧没有被接收')
    expect(l.steps[0]).toContain(ms3(retry.t))
    expect(l.steps[0]).toContain(ms3(orig.t))
    expect(ofType(records, 'RX_OK').some((r) => r.node === 'ap' && r.t > orig.t && r.t <= orig.t + orig.frame.txTimeNs)).toBe(false)
    expect(txs.filter((r) => r.frame.kind === 'ack' && r.frame.dst === 'sta-1' && r.t > orig.t && r.t < retry.t)).toEqual([])
    expect(txs.find((r) => r.frame.kind === 'rts' && r.t === orig.t)?.frame.src).toBe('sta-3')
    const [runMs] = (l.steps[2].match(/(\d+) ms/) ?? []).slice(1).map(Number)
    expect(runMs * MS).toBe(RUN_NS)
    const rows = tableOf(l.blocks!, '30 ms 内的接收失败记录').rows
    const fails = ofType(records, 'RX_FAIL')
    for (const [label, n] of rows) {
      const reason = label.match(/（(\w+)）/)![1]
      expect(String(fails.filter((r) => r.reason === reason).length), reason).toBe(n)
    }
    expect(rows.reduce((s, r) => s + Number(r[1]), 0)).toBe(fails.length)
    expect(l.expect).toContain(`在 ${ms3(retry.t)} 以序号 ${retry.frame.seqNo}、重发比特 ${bitOf(firstMpdu(retry.frame), 'retry')} 重发`)
    expect(l.expect).toContain(`${RUN_NS / MS} ms 内的 ${fails.length} 次接收失败都是碰撞`)
    expect(fails.every((r) => r.reason === 'collision')).toBe(true)
  })
})

describe('frame-qos-fcs · every figure the lesson prints is one this file measured', () => {
  const strip = (s: string): string => s
    .replace(/§[\d.]+/g, '').replace(/[表图] \d+-\d+/g, '')
    .replace(/IEEE( Std)? 802\.11-\d{4}/g, '').replace(/802\.11[a-z]*(-\d{4})?/g, '')
    .replace(/G\(x\) = [^。]+/g, '').replace(/src\/[\w/.]+/g, '').replace(/Wi-Fi 5/g, '')

  it('sweeps every string a reader reads: no figure without a measurement behind it', () => {
    const allowed = new Set<string>([
      String(MAC_HDR_BYTES), String(QOS_HDR_BYTES), String(QOS_HDR_BYTES - MAC_HDR_BYTES), String(FCS_BYTES), '32',
      // user priorities and TIDs, the TID range, and the bit positions of table 9-10
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '15', '1000', '0000',
      // the run: instants, durations, counts and the run length
      ms3(qos.t).replace(' ms', ''), String(legacy.t), String(qos.frame.durationFieldNs / US),
      ...[orig.t, retry.t].map((t) => (t / MS).toFixed(3)), String(retry.frame.seqNo), String(RUN_NS / MS),
    ])
    const stray: string[] = []
    for (const s of readerTexts(frameQosFcs)) {
      for (const n of strip(s).match(/\d+(?:\.\d+)?/g) ?? []) if (!allowed.has(n)) stray.push(`${n} in 「${s.slice(0, 40)}」`)
    }
    expect(stray).toEqual([])
  })
})
