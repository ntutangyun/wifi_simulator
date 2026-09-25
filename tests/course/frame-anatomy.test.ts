/**
 * Every empirical claim of "What a frame says before it says anything"
 * (src/course/tier1/frame-anatomy.ts), measured by decoding this scenario's own
 * frames with decodeFrame / ppduLayout.
 *
 * This is the FIRST half of the old `frame-anatomy`: the header, the addresses
 * and what each field is for. The byte budget, the preamble table and the
 * airtime arithmetic are `frame-anatomy-bytes`'; after the re-pacing of
 * 2026-09-25 the traffic mark, the four-category table, the check at the end
 * and both experiments are `frame-qos-fcs`', pinned there with the sentences
 * that carry them — no pin was dropped in the move.
 *
 * What arrived instead: the nested stack figure, from `roles-stack`, where it
 * pre-taught this lesson's own opening (§5.1 item 2). It is rebuilt on THIS
 * lesson's frame, so its octets are this run's octets, and the fields figure
 * beside it is pinned against the decoder field by field.
 *
 * The scenario builder is unchanged, so `lesson-hashes.json` keeps this
 * lesson's recorded hash; the split's other halves are copies of that line.
 */
import { describe, it, expect } from 'vitest'
import {
  frameAnatomy, frameAnatomyScenario, frameAnatomyHeaderFields, frameAnatomyStack,
  firstLegacyData, firstLegacyRetry, FA_FRAME_BYTES, FA_PAYLOAD_BYTES, FA_PPDU_US,
} from '../../src/course/tier1/frame-anatomy'
import { Simulation } from '../../src/engine/simulation'
import type { Block } from '../../src/course/lessonKit'
import type { FieldsSpec, StackSpec } from '../../src/course/diagram'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { decodeFrame, type Mpdu } from '../../src/model/frameFields'
import { hasFeature } from '../../src/model/caps'
import type { TLRecord } from '../../src/model/records'
import {
  ACK_BYTES, FCS_BYTES, MAC_HDR_BYTES, QOS_HDR_BYTES, SIFS_NS, txTimeNs,
} from '../../src/engine/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
const RUN_NS = 30 * MS
type Tx = Extract<TLRecord, { type: 'TX_START' }>

/** This lesson's records, from the kit's shared memo. */
const records = runOf(frameAnatomy, undefined, RUN_NS)
const txs = ofType(records, 'TX_START')
const find = (pred: (r: TLRecord) => boolean): Tx => {
  const r = records.find(pred)
  expect(r, 'jump target not reached').toBeDefined()
  return r as Tx
}

/** Decode as the UI does: QoS when both the sender and the AP run EDCA. */
function decode(f: Tx['frame'], sc = frameAnatomyScenario()) {
  const ap = sc.nodes.find((n) => n.kind === 'ap')!
  const src = sc.nodes.find((n) => n.id === f.src) ?? ap
  return decodeFrame(f, { apId: ap.id, isEdca: hasFeature(src, 'edca') && hasFeature(ap, 'edca') })
}
const firstMpdu = (f: Tx['frame'], sc?: Scenario): Mpdu => decode(f, sc ?? frameAnatomyScenario()).users[0].subframes[0].mpdu
/** An edited scenario is not the lesson's, so it runs on its own rather than through the memo. */
const runEdited = (sc: Scenario, ns: number): TLRecord[] => [...new Simulation(sc).runUntil(ns).records]
const field = (m: Mpdu, key: string) => m.fields.find((x) => x.key === key)!
const bitOf = (m: Mpdu, key: string) => field(m, 'fc').bits!.find((b) => b.key === key)!.value

const legacy = find(firstLegacyData)
const retry = find(firstLegacyRetry)

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
lessonShapeSuite(frameAnatomy, { runNs: RUN_NS })

describe('frame-anatomy · the lesson itself', () => {
  it('opens the module about frames and owns the five frame words', () => {
    expect(MODULES[frameAnatomy.module].title).toBe('帧与空口时间')
    expect(frameAnatomy.needs).toEqual(['roles-stack'])
    // the baseline owner table of the readability programme, minus QOS: the traffic mark is
    // `frame-qos-fcs`'s to own now. RA/TA/SA/DA are glossed where they are used instead.
    expect(frameAnatomy.terms!.map((t) => t.term)).toEqual(['MSDU', 'MPDU', 'PPDU', 'FCS', 'CRC'])
  })

  it('the scenario passes the schema and every quiz answer is in range', () => {
    expect(() => ScenarioSchema.parse(frameAnatomy.scenario())).not.toThrow()
    expect(frameAnatomy.variants).toBeUndefined()
    for (const q of frameAnatomy.quiz) expect(q.answer).toBeLessThan(q.options.length)
  })

  it('the two jump targets are the ones this half’s text uses, in order', () => {
    // §2 · M3: this half keeps jumps 0 and 2 — the legacy frame and the first retry. The QoS
    // frame is the jump of `frame-qos-fcs`, whose topic it is. The bar is pinned by what each
    // predicate selects out of the run, not by how its button reads.
    expect(frameAnatomy.jumps.length).toBe(2)
    expect(frameAnatomy.jumps.map((j) => records.find(j.find))).toEqual([legacy, retry])
    expect(firstMpdu(legacy.frame).fields.some((f) => f.key === 'qos')).toBe(false)
    expect(bitOf(firstMpdu(retry.frame), 'retry')).toBe('1')
    expect(bitOf(firstMpdu(legacy.frame), 'retry')).toBe('0')
  })

  it('no management frame is transmitted — the deeper note says so', () => {
    // "仿真器目前还不发送管理帧：这里每个站点一开始就已关联"
    expect(new Set(txs.map((r) => r.frame.kind))).toEqual(new Set(['data', 'ack', 'rts', 'cts', 'ba']))
  })
})

describe('frame-anatomy · the first legacy data frame', () => {
  const m = firstMpdu(legacy.frame)

  it('is at 0 µs and is a plain Data frame going uphill, with no QoS Control', () => {
    // observation 1: "跳到旧笔记本的第一帧（0 µs）… 方向比特是 1 和 0、重发比特是 0 …
    //  末尾四个字节的校验——整帧 1528 B"
    expect(legacy.t).toBe(0)
    expect(m.subtypeName).toBe('Data')
    expect(bitOf(m, 'type')).toBe('10 (Data)')
    expect(bitOf(m, 'subtype')).toBe('0000 (Data)')
    expect(bitOf(m, 'toDs')).toBe('1')
    expect(bitOf(m, 'fromDs')).toBe('0')
    expect(bitOf(m, 'retry')).toBe('0')
    expect(m.fields.some((x) => x.key === 'qos')).toBe(false)
    expect(legacy.frame.bytes).toBe(1528)
    // the "帧头，逐个字段" table, in the order it lists them
    expect(m.fields.map((x) => x.key)).toEqual(['fc', 'duration', 'addr1', 'addr2', 'addr3', 'seqCtl', 'body', 'fcs'])
    expect(field(m, 'seqCtl').value).toBe('SN 0 · FN 0')
  })

  it('the address table: Address 1 the Router, Address 2 the Old laptop, Address 3 the far end', () => {
    // "站点 → 接入点：RA = BSSID · TA = SA · DA", and the picture's "必须接住并作答的那台射频,
    //  和发出它的那台 … 第三个是这份载荷自己那段路程的终点"
    expect(field(m, 'addr1').node).toBe('ap')
    expect(field(m, 'addr1').roles).toEqual(['RA', 'BSSID'])
    expect(field(m, 'addr2').node).toBe('sta-1')
    expect(field(m, 'addr2').roles).toEqual(['TA', 'SA'])
    expect(field(m, 'addr3').roles).toEqual(['DA'])
    for (const k of ['addr1', 'addr2', 'addr3'] as const) expect(field(m, k).bytes).toBe(6)
    expect(m.fields.some((x) => x.key === 'addr4' as never)).toBe(false)
  })

  it('the field sizes the table quotes: 2, 2, 6, 6, 6, 2 and 4 bytes', () => {
    expect(field(m, 'fc').bytes).toBe(2)
    expect(field(m, 'duration').bytes).toBe(2)
    expect(field(m, 'seqCtl').bytes).toBe(2)
    expect(field(m, 'fcs').bytes).toBe(FCS_BYTES)
    expect(FCS_BYTES).toBe(4)
    expect(MAC_HDR_BYTES).toBe(24)
    expect(QOS_HDR_BYTES - MAC_HDR_BYTES).toBe(2)
  })

  it('Duration is 44 µs = 16 µs of silence + a 28 µs answer, and the answer really is that', () => {
    // the formula "16 µs 的静默 + 28 µs 的回复 = 44 µs"
    expect(legacy.frame.durationFieldNs).toBe(44_000)
    expect(SIFS_NS + txTimeNs(ACK_BYTES, 24)).toBe(44_000)
    expect(field(m, 'duration').value).toBe('44 µs')
    const ack = txs.find((r) => r.frame.kind === 'ack' && r.frame.dst === 'sta-1')!
    expect(ack.frame.txTimeNs).toBe(28_000)
    expect(ack.frame.durationFieldNs).toBe(0)
    const am = firstMpdu(ack.frame)
    expect(am.fields.map((x) => x.key)).toEqual(['fc', 'duration', 'addr1', 'fcs'])
    expect(field(am, 'addr1').roles).toEqual(['RA'])
  })
})

/**
 * The two figures, pinned against the same run as the prose. A diagram in this
 * course is derived from the run wherever the figures exist
 * (docs/superpowers/specs/2026-09-25-course-pace-and-diagrams.md): the numbers
 * are read back OUT of the spec the panel paints and compared with the decoder
 * and the engine, so a figure that drifts fails here rather than misleading a
 * reader.
 */
describe('frame-anatomy · the two figures are the run', () => {
  const isDiagram = (b: Block): b is Extract<Block, { kind: 'diagram' }> => b.kind === 'diagram'
  const diagrams = [...frameAnatomy.picture!, ...frameAnatomy.numbers!].filter(isDiagram)

  it('draws the two figures §4 gives this lesson, and no others', () => {
    expect(diagrams.map((b) => b.spec.kind)).toEqual(['stack', 'fields'])
  })

  it('the fields figure is the decoder’s own header, field by field and octet by octet', () => {
    const spec = diagrams.find((b) => b.spec.kind === 'fields')!.spec as FieldsSpec
    expect(spec).toEqual(frameAnatomyHeaderFields())
    const m = firstMpdu(legacy.frame)
    // the figure draws the header only: the six fields in front of the body, in the
    // decoder's own order, each box sized by the octets the decoder reports
    const header = m.fields.filter((f) => !['body', 'fcs'].includes(f.key))
    expect(spec.fields.length).toBe(header.length)
    expect(spec.fields.map((f) => f.size)).toEqual(header.map((f) => f.bytes))
    expect(spec.fields.map((f) => f.size).reduce((a, b) => a + b, 0)).toBe(MAC_HDR_BYTES)
    expect(spec.unit).toBe('B')
    // the total says both widths, and both are the engine's constants
    expect(spec.total).toContain(`${MAC_HDR_BYTES} B`)
    expect(spec.total).toContain(`${QOS_HDR_BYTES} B`)
  })

  it('the stack figure carries the octets the engine builds and the airtime the run measures', () => {
    const stack = diagrams.find((b) => b.spec.kind === 'stack')!.spec as StackSpec
    expect(stack).toEqual(frameAnatomyStack())
    const [air, frame, payload] = stack.layers
    // the boxes are sized by these, so a wrong number is a wrong picture
    expect(frame.bytes).toBe(legacy.frame.bytes)
    expect(air.bytes).toBe(legacy.frame.bytes)
    expect(payload.bytes).toBe(legacy.frame.bytes - MAC_HDR_BYTES - FCS_BYTES)
    expect(FA_FRAME_BYTES).toBe(legacy.frame.bytes)
    expect(FA_PAYLOAD_BYTES).toBe(payload.bytes)
    expect(FA_PAYLOAD_BYTES).toBe(field(firstMpdu(legacy.frame), 'body').bytes)
    // every one of the old laptop's payloads really is 1500 B, not just the first
    const arrivals = records.filter((r): r is Extract<TLRecord, { type: 'ARRIVAL' }> =>
      r.type === 'ARRIVAL' && r.node === 'sta-1')
    expect(arrivals.length).toBeGreaterThan(5)
    expect(arrivals.every((r) => r.bytes === payload.bytes)).toBe(true)
    // the notes and the total quote the same figures back
    expect(frame.note).toBe(`${MAC_HDR_BYTES} B 头 + ${payload.bytes} B 载荷 + ${FCS_BYTES} B 校验`)
    expect(FA_PPDU_US * 1000).toBe(legacy.frame.txTimeNs)
    expect(air.note).toContain(`${legacy.frame.txTimeNs / 1000} µs`)
    expect(air.note).toContain(`${legacy.frame.mbps} Mb/s`)
    expect(stack.total).toContain(`${MAC_HDR_BYTES + FCS_BYTES} B`)
    expect(stack.total).toContain('1.9 %')
  })
})

describe('frame-anatomy · building one frame, step by step', () => {
  it('the six steps are the order the MAC and the decoder take, with the old laptop’s own values', () => {
    // "造出一帧，一步一步来" and the table beside it, "旧笔记本的第一帧，就是这么造出来的".
    // The steps follow buildDataFrame (src/engine/mac.ts) and dataMpdu
    // (src/model/frameFields.ts): kind, direction bits, Duration, addresses, sequence, then
    // the QoS bytes, the body and the FCS.
    const steps = frameAnatomy.numbers!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!
    expect(steps.items.length).toBe(6)
    const m = firstMpdu(legacy.frame)
    // 1. "普通 Data 帧；两端都给业务打标记时，则是 QoS Data 帧"
    expect(m.subtypeName).toBe('Data')
    expect(hasFeature(frameAnatomyScenario().nodes.find((n) => n.id === 'sta-1')!, 'edca')).toBe(false)
    // 2. "上行发往接入点是 1 和 0"
    expect([bitOf(m, 'toDs'), bitOf(m, 'fromDs')]).toEqual(['1', '0'])
    // 3. "那段静默加上那个回复，16 + 28 = 44 µs"
    expect(SIFS_NS / 1000 + txTimeNs(ACK_BYTES, 24) / 1000).toBe(44)
    expect(field(m, 'duration').value).toBe('44 µs')
    // 4. "地址 1 是接入点（RA），地址 2 是发出这一帧的射频（TA），地址 3 是这段路程的远端（DA）"
    expect(field(m, 'addr1').node).toBe('ap')
    expect(field(m, 'addr2').node).toBe('sta-1')
    expect(field(m, 'addr3').node).toBe('ap')
    expect([field(m, 'addr1'), field(m, 'addr2'), field(m, 'addr3')].map((x) => x.roles![0])).toEqual(['RA', 'TA', 'DA'])
    // 5. "只在第一次发送时取下一个值": the first frame is 0
    expect(legacy.frame.seqNo).toBe(0)
    expect(field(m, 'seqCtl').value).toBe('SN 0 · FN 0')
    expect(bitOf(m, 'retry')).toBe('0')
    // 6. "然后是载荷，最后是对它前面所有内容算出的 FCS：24 + 1500 + 4 = 1528 B"
    expect(m.fields.map((x) => x.key).slice(-2)).toEqual(['body', 'fcs'])
    expect(field(m, 'body').bytes).toBe(1500)
    expect(MAC_HDR_BYTES + field(m, 'body').bytes + FCS_BYTES).toBe(1528)
    expect(legacy.frame.bytes).toBe(1528)
  })

  it('step 2 holds in the other direction too, and step 6 on a marked frame', () => {
    // Proving the two steps rather than the one row: every data frame of the run reads its
    // direction bits off who sent it, and a marked frame is exactly two bytes longer.
    for (const r of txs.filter((x) => x.frame.kind === 'data' && x.frame.ampdu === undefined)) {
      const m = firstMpdu(r.frame)
      const up = r.frame.src !== 'ap'
      expect([bitOf(m, 'toDs'), bitOf(m, 'fromDs')]).toEqual(up ? ['1', '0'] : ['0', '1'])
      const hdr = m.fields.some((x) => x.key === 'qos') ? QOS_HDR_BYTES : MAC_HDR_BYTES
      expect(hdr + field(m, 'body').bytes + FCS_BYTES).toBe(r.frame.bytes)
    }
    expect(QOS_HDR_BYTES - MAC_HDR_BYTES).toBe(2)
  })
})

describe('frame-anatomy · the repeat bit and the counter', () => {
  it('the retransmission at 12.013 ms repeats the counter value of the frame that collided', () => {
    // observation 2, and the fields caption's "重发沿用原号——重复帧正是这样被认出来的"
    expect(retry.t).toBe(12_013_000)
    expect(retry.frame.src).toBe('sta-1')
    expect(retry.frame.seqNo).toBe(11)
    const m = firstMpdu(retry.frame)
    expect(bitOf(m, 'retry')).toBe('1')
    expect(field(m, 'seqCtl').value).toBe('SN 11 · FN 0')
    expect(field(m, 'seqCtl').bytes).toBe(2)
    const orig = txs.find((r) => r.frame.src === 'sta-1' && r.frame.seqNo === 11 && !r.frame.retryFlag)!
    expect(orig.t).toBe(11_650_000)
    expect(records.some((r) => r.type === 'COLLISION' && r.t > orig.t && r.t < retry.t)).toBe(true)
    expect(bitOf(firstMpdu(orig.frame), 'retry')).toBe('0')
  })

  it('a 12-bit counter: the numbers the table promises, 0–4095', () => {
    const seqs = txs.filter((r) => r.frame.kind === 'data' && r.frame.seqNo !== undefined)
      .map((r) => r.frame.seqNo!)
    expect(seqs.length).toBeGreaterThan(10)
    for (const s of seqs) {
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(4095)
    }
  })
})

describe('frame-anatomy · the experiment', () => {
  it('swap the router and the old laptop: the addresses are roles, not positions', () => {
    // tryThis: "把路由器和旧笔记本的位置对调再载入 … 地址 1 仍是路由器、地址 2 仍是旧笔记本，
    //  整帧仍是 1528 B"
    const sc = frameAnatomyScenario()
    const ap = sc.nodes.find((n) => n.id === 'ap')!
    const old = sc.nodes.find((n) => n.id === 'sta-1')!
    const p = ap.pos
    ap.pos = old.pos
    old.pos = p
    const rs = runEdited(sc, RUN_NS)
    const d = rs.find((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.src === 'sta-1')!
    const m = firstMpdu(d.frame, sc)
    expect(field(m, 'addr1').node).toBe('ap')
    expect(field(m, 'addr2').node).toBe('sta-1')
    expect(field(m, 'addr1').roles).toEqual(['RA', 'BSSID'])
    expect(d.frame.bytes).toBe(1528)
    expect(d.frame.durationFieldNs).toBe(44_000)
  })
})
