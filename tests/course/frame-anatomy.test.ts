/**
 * `@frame-anatomy`, in the standard-first shape (2026-11-10).
 *
 * ① is IEEE Std 802.11-2024 §9.2: the general frame format of figure 9-2, Frame Control bit by
 * bit (figure 9-3, table 9-1), Duration/ID (table 9-9, §9.2.5.2), the address table 9-60, the
 * sequence number spaces of table 10-5 and duplicate detection (§10.3.2.14). ② says row by row what
 * this simulator does, and each row is checked against the decoder or the engine here. ③ is three
 * runs on the old laptop's frames, and every figure they print is read back out of the lesson and
 * compared with a run. The last block sweeps every figure in every string a reader reads.
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  frameAnatomy, frameAnatomyScenario, frameAnatomyHeaderFields, frameAnatomyStack,
  firstLegacyData, firstLegacyRetry, FA_FRAME_BYTES, FA_PAYLOAD_BYTES, FA_PPDU_US,
} from '../../src/course/tier1/frame-anatomy'
import { Simulation } from '../../src/engine/simulation'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import type { FieldsSpec, StackSpec } from '../../src/course/diagram'
import { readerTexts } from '../../src/course/readability'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { decodeFrame, type Mpdu } from '../../src/model/frameFields'
import { hasFeature } from '../../src/model/caps'
import type { TLRecord } from '../../src/model/records'
import { ACK_BYTES, FCS_BYTES, MAC_HDR_BYTES, QOS_HDR_BYTES, SIFS_NS, txTimeNs } from '../../src/engine/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 30 * MS
type Tx = Extract<TLRecord, { type: 'TX_START' }>

const records = runOf(frameAnatomy, undefined, RUN_NS)
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
const field = (m: Mpdu, key: string) => m.fields.find((x) => x.key === key)!
const bitOf = (m: Mpdu, key: string) => field(m, 'fc').bits!.find((b) => b.key === key)!.value
const ms3 = (ns: number): string => `${(ns / MS).toFixed(3)} ms`

const legacy = find(firstLegacyData)
const retry = find(firstLegacyRetry)
const orig = txs.find((r) => r.frame.src === 'sta-1' && r.frame.seqNo === retry.frame.seqNo && !r.frame.retryFlag)!
const ack = txs.find((r) => r.frame.kind === 'ack' && r.frame.dst === 'sta-1')!

const lab = (heading: string): Lab => {
  const l = frameAnatomy.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (blocks: Block[], heading: string): Extract<Block, { kind: 'table' }> => {
  const t = blocks.find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = frameAnatomy.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => frameAnatomy.standard!.map((b) => JSON.stringify(b)).join(' ')

/** Lab 3's edit, exactly as its first step describes it. */
function swappedScene(): Scenario {
  const sc = frameAnatomyScenario()
  const ap = sc.nodes.find((n) => n.id === 'ap')!
  const old = sc.nodes.find((n) => n.id === 'sta-1')!
  const p = ap.pos
  ap.pos = old.pos
  old.pos = p
  return sc
}

lessonShapeSuite(frameAnatomy, { runNs: RUN_NS })

describe('frame-anatomy · the lesson', () => {
  it('is in the standard-first shape, opening the module about frames', () => {
    expect(isStandardFirst(frameAnatomy)).toBe(true)
    expect(MODULES[frameAnatomy.module].title).toBe('帧与空口时间')
    expect(frameAnatomy.needs).toEqual(['roles-stack'])
    expect(frameAnatomy.terms!.map((t) => t.term)).toEqual(['MSDU', 'MPDU', 'PPDU', 'FCS', 'CRC'])
    expect(frameAnatomy.limits).toEqual([])
    expect(frameAnatomy.observe).toEqual([])
    expect(frameAnatomy.tryThis).toEqual([])
    expect(() => ScenarioSchema.parse(frameAnatomy.scenario())).not.toThrow()
    for (const q of frameAnatomy.quiz) expect(q.answer).toBeLessThan(q.options.length)
  })

  it('cites each clause it teaches in ①, and only the standard is there', () => {
    const std = stdText()
    for (const c of ['§9.2.3', '图 9-2', '§9.2.4.1', '图 9-3', '表 9-1', '§9.2.4.2', '表 9-9', '§9.2.5.1', '§9.2.5.2',
      '§9.2.4.3', '§9.3.2.1', '表 9-60', '表 9-3', '§9.3.3.1', '§9.2.4.4', '§10.3.2.14.2', '表 10-5', '§10.3.2.14.3',
      '§9.2.4.4.3', '§9.2.4.1.6', '第 3 章']) expect(std, c).toContain(c)
    expect(std).not.toContain('本仿真器')
  })

  it('① draws figure 9-2\'s header with the decoder\'s own octets', () => {
    const d = frameAnatomy.standard!.find((b): b is Extract<Block, { kind: 'diagram' }> => b.kind === 'diagram')!
    expect(d.spec).toEqual(frameAnatomyHeaderFields())
    const spec = d.spec as FieldsSpec
    const header = firstMpdu(legacy.frame).fields.filter((f) => !['body', 'fcs'].includes(f.key))
    expect(spec.fields.map((f) => f.size)).toEqual(header.map((f) => f.bytes))
    expect(spec.fields.map((f) => f.size)).toEqual([2, 2, 6, 6, 6, 2]) // figure 9-2
    expect(spec.total).toContain(`${MAC_HDR_BYTES} B`)
    expect(spec.total).toContain(`${QOS_HDR_BYTES} B`)
    expect(d.caption).toContain(`${QOS_HDR_BYTES - MAC_HDR_BYTES} 个八位组`)
  })

  it('① covers all sixteen Frame Control bits, in the decoder\'s order, and the codes it prints', () => {
    const t = tableOf(frameAnatomy.standard!, '帧控制字段，逐位（§9.2.4.1，图 9-3，表 9-1）')
    const covered: number[] = []
    for (const [bits] of t.rows) {
      const [a, b] = (bits.match(/B(\d+)(?:–B(\d+))?/) ?? []).slice(1).map((x) => (x === undefined ? undefined : Number(x)))
      for (let i = a!; i <= (b ?? a!); i++) covered.push(i)
    }
    expect(covered).toEqual(Array.from({ length: 16 }, (_, i) => i))
    expect(t.rows.length).toBe(firstMpdu(legacy.frame).fields[0].bits!.length)
    const subtypes = t.rows[2][2]
    for (const [name, code] of [['Data', '0000'], ['QoS Data', '1000'], ['RTS', '1011'], ['CTS', '1100'], ['Ack', '1101'], ['Block Ack', '1001']]) {
      expect(subtypes).toContain(`${name} ${code}`)
    }
    // the two the engine builds read the same off the decoder
    expect(bitOf(firstMpdu(legacy.frame), 'subtype')).toBe('0000 (Data)')
    expect(bitOf(firstMpdu(ack.frame), 'subtype')).toBe('1101 (Ack)')
    expect(t.rows[1][2]).toContain('10 数据帧')
    expect(bitOf(firstMpdu(legacy.frame), 'type')).toBe('10 (Data)')
  })

  it('① prints table 9-60 for all four direction pairs', () => {
    expect(tableOf(frameAnatomy.standard!, '数据帧的地址字段（§9.2.4.3.1，§9.3.2.1 表 9-60）').rows).toEqual([
      ['0 / 0', 'RA = DA', 'TA = SA', 'BSSID', '无'],
      ['0 / 1', 'RA = DA', 'TA = BSSID', 'SA', '无'],
      ['1 / 0', 'RA = BSSID', 'TA = SA', 'DA', '无'],
      ['1 / 1', 'RA', 'TA', 'DA', 'SA'],
    ])
    // 「取值 0 到 32 767」 is a 15-bit field; 「模 4096」 a 12-bit counter beside a 4-bit fragment number
    expect(stdText()).toContain('32 767')
    expect(2 ** 15 - 1).toBe(32_767)
    expect(stdText()).toContain('模 4096')
    expect(stdText()).toContain('4 位分片号')
    expect(stdText()).toContain('12 位序号')
    expect(2 ** 12).toBe(4096)
  })
})

describe('frame-anatomy · ② says what the engine does, and the engine does it', () => {
  it('field order and widths are figure 9-2', () => {
    expect(implRow('字段顺序与长度').kind).toBe('faithful')
    const m = firstMpdu(legacy.frame)
    expect(m.fields.map((x) => x.key)).toEqual(['fc', 'duration', 'addr1', 'addr2', 'addr3', 'seqCtl', 'body', 'fcs'])
    expect(implRow('字段顺序与长度').sim).toBe(`普通数据帧的帧头 ${MAC_HDR_BYTES} B、QoS 数据帧的帧头 ${QOS_HDR_BYTES} B、FCS ${FCS_BYTES} B，字段顺序与图 9-2 相同。`)
  })

  it('no real octets: the addresses are node ids, the body only a count', () => {
    expect(implRow('真实的比特').kind).toBe('differs')
    const m = firstMpdu(legacy.frame)
    expect(field(m, 'addr1').node).toBe('ap')
    expect(field(m, 'body').value).toBe(`${FA_PAYLOAD_BYTES} B`)
  })

  it('five Frame Control subfields are always 0', () => {
    expect(implRow('帧控制中的五个子字段').kind).toBe('absent')
    for (const r of txs.filter((x) => x.frame.kind === 'data')) {
      const m = firstMpdu(r.frame)
      for (const k of ['moreFrag', 'pwrMgt', 'moreData', 'protected', 'htc']) expect(bitOf(m, k), k).toBe('0')
    }
  })

  it('Duration: SIFS + one ACK, kept in nanoseconds', () => {
    expect(implRow('持续时间的取值').kind).toBe('faithful')
    expect(implRow('持续时间的编码').kind).toBe('differs')
    const [sifs, a, total] = (implRow('持续时间的取值').sim.match(/\d+(?= µs)/g) ?? []).map(Number)
    expect(sifs * US).toBe(SIFS_NS)
    expect(a * US).toBe(ack.frame.txTimeNs)
    expect(total * US).toBe(legacy.frame.durationFieldNs)
    expect(implRow('持续时间的取值').sim).toContain(`${ack.frame.mbps} Mb/s`)
    expect(txTimeNs(ACK_BYTES, 24)).toBe(ack.frame.txTimeNs)
    expect(Number.isInteger(legacy.frame.durationFieldNs)).toBe(true)
  })

  // 2026-11-11 (W7a): this pinned an Address 3 that was always the AP. It now pins Table 9-60:
  // the DA when To DS is 1, the SA when From DS is 1 (§9.3.2.1).
  it('Address 3 is Table 9-60\'s: the DA going up, the SA coming down', () => {
    expect(implRow('地址 3').kind).toBe('faithful')
    let n = 0
    for (const r of txs.filter((x) => x.frame.kind === 'data')) {
      for (const [i, sf] of decode(r.frame).users[0].subframes.entries()) {
        const h = r.frame.mpdus?.[i]
        const a3 = field(sf.mpdu, 'addr3')
        if (r.frame.dst === 'ap') expect([a3.node, a3.roles]).toEqual([h?.da ?? 'ap', ['DA']])
        else expect([a3.node, a3.roles]).toEqual([h?.sa ?? 'ap', ['SA']])
        n++
      }
    }
    expect(n).toBeGreaterThan(100)
    // the old laptop's traffic ends at the AP, so on this frame Address 3 is the router
    expect(legacy.frame.dst).toBe('ap')
    expect(field(firstMpdu(legacy.frame), 'addr3').node).toBe('ap')
  })

  it('no fourth address and no management frame', () => {
    expect(implRow('地址 4').kind).toBe('absent')
    expect(implRow('管理帧').kind).toBe('absent')
    expect(frameAnatomyScenario().nodes.filter((n) => n.kind === 'ap')).toHaveLength(1)
    for (const r of txs) expect(['data', 'ack', 'rts', 'cts', 'ba']).toContain(r.frame.kind)
  })

  // 2026-11-11 (W7a): this pinned one counter per peer and access category. It now pins Table 10-5:
  // one modulo-4096 counter per <Address 1, TID> for QoS Data, one baseline counter for the rest.
  it('sequence numbers: one counter per <Address 1, TID> for QoS Data, one baseline counter otherwise', () => {
    expect(implRow('序号计数器').kind).toBe('faithful')
    const src = readFileSync(new URL('../../src/engine/queues.ts', import.meta.url), 'utf8')
    expect(src).toContain("const key = tid === null ? 'baseline' : `${dst}|${tid}`")
    expect(src).toContain('(n + 1) % 4096')
    // the old laptop sends plain Data: its first transmissions number 0, 1, 2 … off the one counter
    const firsts = txs.filter((r) => r.frame.kind === 'data' && r.frame.src === 'sta-1' && !r.frame.retryFlag).map((r) => r.frame.seqNo)
    expect(firsts.length).toBeGreaterThan(5)
    expect(firsts).toEqual(firsts.map((_, i) => i))
  })

  // 2026-11-11 (W7a): this pinned duplicate filtering by the engine's own MSDU id. It now pins
  // §10.3.2.14.3: a cache by <TA, TID, SN>, consulted when the Retry bit is 1.
  it('a retransmission keeps its number and sets the Retry bit; duplicates are filtered by <TA, TID, SN>', () => {
    expect(implRow('重发时的序号').kind).toBe('faithful')
    expect(implRow('重复帧的识别').kind).toBe('faithful')
    expect(retry.frame.seqNo).toBe(orig.frame.seqNo)
    expect(bitOf(firstMpdu(retry.frame), 'retry')).toBe('1')
    const q = readFileSync(new URL('../../src/engine/queues.ts', import.meta.url), 'utf8')
    expect(q).toContain('rxDuplicate(ta: string, tid: number | null, sn: number, retry: boolean): boolean')
    expect(q).toContain('if (retry && seen.includes(sn)) return true')
    const [keep] = (implRow('重复帧的识别').sim.match(/保留最近 (\d+) 个序号/) ?? []).slice(1).map(Number)
    expect(q).toContain(`if (seen.length > ${keep}) seen.shift()`)
    const mac = readFileSync(new URL('../../src/engine/mac.ts', import.meta.url), 'utf8')
    expect(mac).toContain('this.queues.rxDuplicate(from, tid, h.sn, h.retry)')
  })
})

describe('frame-anatomy · ③ every figure the labs print is the run', () => {
  it('lab 1: the field table is the decoded first frame, field by field', () => {
    const l = lab('旧笔记本的第一帧')
    expect(legacy.t).toBe(0)
    expect(l.steps[0]).toContain(`${legacy.t / US} µs`)
    const m = firstMpdu(legacy.frame)
    const rows = tableOf(l.blocks!, '旧笔记本第一帧的字段').rows
    const keys = ['fc', 'duration', 'addr1', 'addr2', 'addr3', 'seqCtl', 'body', 'fcs']
    expect(rows.map((r) => r[1])).toEqual(keys.map((k) => String(field(m, k).bytes)))
    const fc = rows[0][2]
    expect(fc).toContain(`类型 ${bitOf(m, 'type').slice(0, 2)}`)
    expect(fc).toContain(`子类型 ${bitOf(m, 'subtype').slice(0, 4)}`)
    expect(fc).toContain(`To DS ${bitOf(m, 'toDs')}，From DS ${bitOf(m, 'fromDs')}，重发比特 ${bitOf(m, 'retry')}`)
    expect(rows[1][2]).toBe(field(m, 'duration').value)
    const name: Record<string, string> = { ap: '路由器', 'sta-1': '旧笔记本' }
    expect(rows.slice(2, 5).map((r) => r[2])).toEqual(['addr1', 'addr2', 'addr3'].map((k) => name[field(m, k).node!]))
    expect(field(m, 'seqCtl').value).toBe(`SN ${legacy.frame.seqNo} · FN 0`)
    expect(rows[5][2]).toBe(`序号 ${legacy.frame.seqNo}，分片号 0`)
  })

  it('lab 1: the stack figure and the expect line are the run', () => {
    const l = lab('旧笔记本的第一帧')
    const d = l.blocks!.find((b): b is Extract<Block, { kind: 'diagram' }> => b.kind === 'diagram')!
    expect(d.spec).toEqual(frameAnatomyStack())
    const stack = d.spec as StackSpec
    expect(stack.layers[1].bytes).toBe(legacy.frame.bytes)
    expect(FA_FRAME_BYTES).toBe(legacy.frame.bytes)
    expect(FA_PPDU_US * US).toBe(legacy.frame.txTimeNs)
    expect(stack.layers[0].note).toContain(`${legacy.frame.mbps} Mb/s`)
    expect(stack.total).toContain(`${MAC_HDR_BYTES + FCS_BYTES} B`)
    expect(stack.total).toContain(`${(((MAC_HDR_BYTES + FCS_BYTES) / FA_PAYLOAD_BYTES) * 100).toFixed(1)} %`)
    expect(d.caption).toBe(`${FA_PAYLOAD_BYTES} B 的载荷，外面 ${MAC_HDR_BYTES} B 的帧头与 ${FCS_BYTES} B 的 FCS，共 ${legacy.frame.bytes} B。最外层的前导码增加的是时间，而不是字节，在《一帧在空口上占用多长时间》里计算。`)
    // every payload of the old laptop is 1500 B
    const arrivals = ofType(records, 'ARRIVAL').filter((r) => r.node === 'sta-1')
    expect(arrivals.length).toBeGreaterThan(5)
    expect(arrivals.every((r) => r.bytes === FA_PAYLOAD_BYTES)).toBe(true)
    const ex = l.expect
    const b = (ex.match(/(\d+) B/g) ?? []).map((s) => Number(s.replace(' B', '')))
    expect(b).toEqual([MAC_HDR_BYTES, FA_PAYLOAD_BYTES, FCS_BYTES, legacy.frame.bytes])
    expect(ex).toContain(`以 ${legacy.frame.mbps} Mb/s 发送，空口时间（airtime）${legacy.frame.txTimeNs / US} µs`)
    expect(ex).toContain(`持续时间 ${legacy.frame.durationFieldNs / US} µs，正是 ${SIFS_NS / US} µs 的 SIFS 加上 ${ack.frame.mbps} Mb/s 下 ${ack.frame.txTimeNs / US} µs 的确认帧`)
    // the why's 「不到载荷的百分之二」
    expect((MAC_HDR_BYTES + FCS_BYTES) / FA_PAYLOAD_BYTES).toBeLessThan(0.02)
  })

  it('lab 2: the two sends of one payload, and the collision between them', () => {
    const l = lab('一次重发')
    const rows = tableOf(l.blocks!, '同一份载荷的两次发送').rows
    expect(rows[0].slice(0, 3)).toEqual([ms3(orig.t), String(orig.frame.seqNo), bitOf(firstMpdu(orig.frame), 'retry')])
    expect(rows[1].slice(0, 3)).toEqual([ms3(retry.t), String(retry.frame.seqNo), bitOf(firstMpdu(retry.frame), 'retry')])
    expect(l.steps[0]).toContain(ms3(retry.t))
    expect(l.steps[1]).toContain(ms3(orig.t))
    // 「发生碰撞，没有确认帧」, and the retry is answered
    // the laptop's RTS starts in the same nanosecond; the router locks onto neither
    const rts = txs.find((r) => r.frame.kind === 'rts' && r.t === orig.t)
    expect(rts?.frame.src).toBe('sta-3')
    expect(ofType(records, 'RX_MISS').filter((r) => r.node === 'ap' && r.t === orig.t).map((r) => r.from).sort()).toEqual(['sta-1', 'sta-3'])
    expect(ofType(records, 'RX_OK').some((r) => r.node === 'ap' && r.t > orig.t && r.t <= orig.t + orig.frame.txTimeNs)).toBe(false)
    expect(ofType(records, 'COLLISION').some((r) => r.nodes.includes('sta-1') && r.t > orig.t && r.t < retry.t)).toBe(true)
    expect(ofType(records, 'ACK_TIMEOUT').some((r) => r.node === 'sta-1' && r.t > orig.t && r.t < retry.t)).toBe(true)
    expect(txs.filter((r) => r.frame.kind === 'ack' && r.frame.dst === 'sta-1' && r.t > orig.t && r.t < retry.t)).toEqual([])
    const ackRetry = txs.find((r) => r.frame.kind === 'ack' && r.frame.dst === 'sta-1' && r.t > retry.t)!
    expect(ackRetry.t - (retry.t + retry.frame.txTimeNs)).toBe(SIFS_NS)
    expect(l.expect).toContain(`沿用序号 ${retry.frame.seqNo}`)
  })

  it('lab 3: swapped positions, same addresses, same Duration, same octets', () => {
    const l = lab('地址表示角色，而不是位置')
    const sc = swappedScene()
    const [ax, ay, ox, oy] = (l.steps[0].match(/路由器移到 \((\d+), (\d+)\)、旧笔记本移到 \((\d+), (\d+)\)/) ?? []).slice(1).map(Number)
    const ap = sc.nodes.find((n) => n.id === 'ap')!
    const old = sc.nodes.find((n) => n.id === 'sta-1')!
    expect([ap.pos.x, ap.pos.y, old.pos.x, old.pos.y]).toEqual([ax, ay, ox, oy])
    const rs = runEdited(sc, RUN_NS)
    const d = rs.find((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.src === 'sta-1')!
    const m = firstMpdu(d.frame, sc)
    expect(field(m, 'addr1').node).toBe('ap')
    expect(field(m, 'addr2').node).toBe('sta-1')
    expect(l.expect).toBe(`地址 1 仍是路由器，地址 2 仍是旧笔记本，持续时间仍是 ${d.frame.durationFieldNs / US} µs，整帧仍是 ${d.frame.bytes} B。`)
  })

  it('the quiz prints the Duration the run writes', () => {
    expect(frameAnatomy.quiz[1].q).toContain(`${legacy.frame.durationFieldNs / US} µs`)
  })
})

describe('frame-anatomy · every figure the lesson prints is one this file measured', () => {
  const strip = (s: string): string => s
    .replace(/§[\d.]+/g, '').replace(/[表图] \d+-\d+/g, '').replace(/第 \d+ 章/g, '')
    .replace(/IEEE( Std)? 802\.11-\d{4}/g, '').replace(/802\.11[a-z]*(-\d{4})?/g, '')
    .replace(/B\d+(–B\d+)?/g, '').replace(/src\/[\w/.]+/g, '')

  it('sweeps every string a reader reads: no figure without a measurement behind it', () => {
    const allowed = new Set<string>([
      // octets: field widths, headers, payload, check, frame, overhead and its share
      '2', '6', String(MAC_HDR_BYTES), String(QOS_HDR_BYTES), String(FCS_BYTES), String(FA_PAYLOAD_BYTES),
      String(legacy.frame.bytes), String(MAC_HDR_BYTES + FCS_BYTES), (((MAC_HDR_BYTES + FCS_BYTES) / FA_PAYLOAD_BYTES) * 100).toFixed(1),
      // times and rates of the run
      String(legacy.t), String(legacy.frame.durationFieldNs / US), String(SIFS_NS / US), String(ack.frame.txTimeNs / US),
      String(ack.frame.mbps), String(legacy.frame.mbps), String(legacy.frame.txTimeNs / US),
      ...[orig.t, retry.t].map((t) => (t / MS).toFixed(3)), String(retry.frame.seqNo),
      // the standard's own figures: bit values, codes, widths, ranges
      '0', '1', '00', '01', '10', '11', '0000', '1000', '1011', '1100', '1101', '1001', '4', '12', '4096', '32', '767', '48',
      // the address numbers, and lab 3's coordinates
      '3', '5',
      // the duplicate cache's depth, read back out of src/engine/queues.ts in ②'s test
      '64',
    ])
    const stray: string[] = []
    for (const s of readerTexts(frameAnatomy)) {
      for (const n of strip(s).match(/\d+(?:\.\d+)?/g) ?? []) if (!allowed.has(n)) stray.push(`${n} in 「${s.slice(0, 40)}」`)
    }
    expect(stray).toEqual([])
  })
})
