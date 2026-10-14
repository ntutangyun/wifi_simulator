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
import { decodeFrame, TID_FOR_AC, type Mpdu } from '../../src/model/frameFields'
import { hasFeature } from '../../src/model/caps'
import type { TLRecord } from '../../src/model/records'
import {
  ACK_BYTES, FCS_BYTES, MAC_HDR_BYTES, QOS_HDR_BYTES, SIFS_NS, txTimeNs,
} from '../../src/engine/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'
import { readFileSync } from 'node:fs'

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

/**
 * **Every figure the prose prints, read back out of it.**
 *
 * This file decodes the lesson's own frame field by field and bit by bit — and compares every
 * one against a figure typed on **this** side. The sampling sweep of 2026-10-12 scored it 6 of
 * 6: all six figures it planted in the prose went unnoticed, because no assertion here ever read
 * the lesson. Now each one is parsed out of it.
 *
 * **The reads worth naming:**
 *
 *  - **the frame-control table is read as a cover, not as eleven rows.** 「B0–B1 … B15」 has to
 *    be one row per bit the decoder carries, in the decoder's own order, contiguous from B0 and
 *    ending at B15 — so a row that moves, loses a bit or gains one fails whatever its label says.
 *  - **the four type codes are read as the four two-bit values.** 「00 管理帧，01 控制帧，10 数据
 *    帧，11 扩展帧」 parses to 0, 1, 2, 3 in order, which is what makes the list exhaustive; the
 *    two this engine builds are checked against the decoder on top of that.
 *  - **「六个比特恒为 0」 is counted off the decoder**, not quoted: the bits whose value is `'0'`
 *    on both a plain and a QoS frame are exactly six, and the entry names the same six.
 *  - **the 15-bit Duration field and its 32 767 µs are read as arithmetic** — one is two to the
 *    power of the other, minus one — which is the whole of what the entry claims about them.
 *  - **the 512-entry dedup cache is read out of `mac.ts`**, because the entry names that file and
 *    a reader who goes there has to find the same number.
 */
describe('frame-anatomy · every figure the prose prints, read back out of it', () => {
  const m = firstMpdu(legacy.frame)
  const blockText = (b: unknown): string => {
    const out: string[] = []
    const walk = (v: unknown): void => {
      if (typeof v === 'string') out.push(v)
      else if (Array.isArray(v)) for (const x of v) walk(x)
      else if (v !== null && typeof v === 'object') for (const x of Object.values(v)) walk(x)
    }
    walk(b)
    return out.join('\n')
  }
  const PIC = blockText(frameAnatomy.picture)
  const NUMS = blockText(frameAnatomy.numbers)
  const DEEP = blockText(frameAnatomy.deeper)
  const LIM = blockText(frameAnatomy.limits)
  const SRC = blockText(frameAnatomy.sources)
  const OBS = blockText(frameAnatomy.observe)
  const TRY = blockText(frameAnatomy.tryThis)
  const QUIZ = blockText(frameAnatomy.quiz)
  const ALL = [PIC, NUMS, DEEP, LIM, SRC, OBS, TRY, QUIZ].join('\n')

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const every = (text: string, re: RegExp, what: string, want: number): string[][] => {
    const ms = [...text.matchAll(re)]
    expect(ms.length, `${what}: the lesson prints this ${ms.length} times, not ${want}`).toBe(want)
    return ms.map((mm) => mm.slice(1))
  }
  /** A Chinese numeral, for the counts this lesson spells out in characters. */
  const zh = (x: string): number => {
    let total = 0
    let cur = 0
    for (const ch of x.replace(/两/g, '二')) {
      const d = '零一二三四五六七八九'.indexOf(ch)
      if (d >= 0) { cur = d; continue }
      const unit = { 十: 10, 百: 100 }[ch]
      expect(unit, `「${x}」 is not a numeral this test can read`).toBeDefined()
      total += (cur || 1) * unit!
      cur = 0
    }
    return total + cur
  }
  const tableOf = (n: number): Extract<Block, { kind: 'table' }> => frameAnatomy.numbers!
    .filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[n]!
  const deepTable = (): Extract<Block, { kind: 'table' }> => frameAnatomy.deeper!
    .filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[0]!

  it('reads the three byte counts and their sum, every printing of them', () => {
    const payload = field(m, 'body').bytes
    const header = MAC_HDR_BYTES
    const fcs = FCS_BYTES
    // 「1500 B 的载荷，外面 24 B 的头和 4 B 的校验，一共 1528 B」 — the picture and the caption.
    for (const [p, h, f, total] of every(PIC,
      /(\d+) B 的载荷，外面 (\d+) B 的头和 (\d+) B 的校验，一共 (\d+) B/g,
      'the three byte counts and their sum', 1)) {
      expect(val(p!), 'the payload the frame carries').toBe(payload)
      expect(val(h!), 'the header in front of it').toBe(header)
      expect(val(f!), 'the check at the end').toBe(fcs)
      expect(val(total!), 'and the frame on the air').toBe(legacy.frame.bytes)
      expect(val(p!) + val(h!) + val(f!), 'which is the sum of the three').toBe(val(total!))
    }
    // The same sum as arithmetic, in the steps and in the worked table.
    for (const [h, p, f, total] of every([NUMS].join('\n'), /(\d+) \+ (\d+) \+ (\d+) = (\d+) B/g,
      'the sum written out, twice', 2)) {
      expect([val(h!), val(p!), val(f!)], 'the three terms').toEqual([header, payload, fcs])
      expect(val(total!), 'and the total').toBe(legacy.frame.bytes)
    }
    expect(FA_FRAME_BYTES, 'the constant the lesson module exports for it').toBe(legacy.frame.bytes)
    expect(FA_PAYLOAD_BYTES, 'and for the payload').toBe(payload)
  })

  it('reads the header table’s own byte column out of the decoder', () => {
    const rows = tableOf(0).rows
    const BY_LABEL: Record<string, string> = {
      '帧控制（Frame Control）': 'fc', '持续时间（Duration/ID）': 'duration',
      '地址 1': 'addr1', '地址 2': 'addr2', '地址 3': 'addr3',
      '序列控制（Sequence Control）': 'seqCtl', 'FCS': 'fcs',
    }
    for (const row of rows) {
      const key = BY_LABEL[row[0]!]
      if (key === undefined) {
        // 「QoS 控制」 and 「帧体」: one is absent from this frame, the other is the payload itself.
        expect(['QoS 控制', '帧体（Frame Body）'], `the row 「${row[0]}」`).toContain(row[0])
        continue
      }
      expect(val(row[1]!), `the bytes of 「${row[0]}」`).toBe(field(m, key).bytes)
    }
    // The QoS row's two bytes are what a marked frame adds, which this frame does not have.
    const qos = rows.find((r) => r[0] === 'QoS 控制')!
    expect(val(qos[1]!), 'what the QoS control field costs').toBe(QOS_HDR_BYTES - MAC_HDR_BYTES)
    expect(m.fields.some((f) => f.key === 'qos'), 'and this frame has none of it').toBe(false)
    // The sequence-control cell: a counter of so many bits, and the range it gives.
    const seq = rows.find((r) => r[0] === '序列控制（Sequence Control）')!
    const [bits, lo, hi] = figs(seq[2]!, /(\d+) 位计数器（(\d+)–(\d+)）/, 'the counter’s own range')
    expect(2 ** bits! - 1, 'the top of a counter that wide').toBe(hi)
    expect(lo, 'which starts at zero').toBe(0)
    const seqs = txs.filter((r) => r.frame.kind === 'data' && r.frame.seqNo !== undefined)
      .map((r) => r.frame.seqNo!)
    expect(Math.min(...seqs), 'and every counter value of the run is inside it')
      .toBeGreaterThanOrEqual(lo!)
    expect(Math.max(...seqs), 'from both ends').toBeLessThanOrEqual(hi!)
  })

  it('reads the Duration formula, all four printings of it', () => {
    const ack = txs.find((r) => r.frame.kind === 'ack' && r.frame.dst === 'sta-1')!
    // 「16 µs 的静默 + 28 µs 的回复 = 44 µs」, 「16 + 28 = 44 µs」, and twice more outside `numbers`.
    const sites: [string, RegExp][] = [
      [NUMS, /(\d+) µs 的静默 \+ (\d+) µs 的回复 = (\d+) µs/],
      [NUMS, /就是那段静默加上那个回复，(\d+) \+ (\d+) = (\d+) µs/],
    ]
    for (const [text, re] of sites) {
      const [silence, answer, total] = figs(text, re, 'the Duration formula')
      expect(silence! * 1000, 'the silence the field covers').toBe(SIFS_NS)
      expect(answer! * 1000, 'the answer it protects').toBe(ack.frame.txTimeNs)
      expect(total! * 1000, 'and the field itself').toBe(legacy.frame.durationFieldNs)
      expect(silence! + answer!, 'which is the sum of the two').toBe(total)
    }
    /*
     * **`sources` and `limits` word the same arithmetic two different ways**, and both name the
     * rate the answer goes out at — which is the figure that makes the sum checkable: the silence
     * plus an Ack at that rate has to be the field this frame carries.
     */
    const rated: [string, RegExp][] = [
      [SRC, /的 (\d+) µs，是 (\d+) µs 加上本场景中回复在 (\d+) Mb\/s 下所占的 (\d+) µs/],
      [LIM, /的 (\d+) µs，是本仿真器[^（]*（(\d+) µs 加上 (\d+) Mb\/s 下 (\d+) µs 的回复）/],
    ]
    for (const [text, re] of rated) {
      const [total, silence, rate, answer] = figs(text, re, 'the Duration with the answer’s own rate')
      expect(total! * 1000, 'the field').toBe(legacy.frame.durationFieldNs)
      expect(silence! * 1000, 'the silence').toBe(SIFS_NS)
      expect(answer! * 1000, 'the answer').toBe(ack.frame.txTimeNs)
      expect(txTimeNs(ACK_BYTES, rate!), 'an Ack at the rate it names').toBe(ack.frame.txTimeNs)
      expect(SIFS_NS + txTimeNs(ACK_BYTES, rate!), 'and the two together are the field')
        .toBe(legacy.frame.durationFieldNs)
    }
    // The field as the decoder prints it, and the table cell that quotes it.
    expect(field(m, 'duration').value, 'the decoder’s own rendering').toBe('44 µs')
    const built = tableOf(2).rows.find((r) => r[0] === '持续时间')!
    expect(val(raw(built[1]!, /^(\d+) µs$/, 'the worked table’s Duration')[0]!) * 1000,
      'the worked table’s own cell').toBe(legacy.frame.durationFieldNs)
  })

  it('reads the two direction bits, in both directions', () => {
    const dl = txs.find((r) => r.frame.kind === 'data' && r.frame.src === 'ap')!
    const dm = firstMpdu(dl.frame)
    // 「上行发往接入点是 1 和 0，下行回来是 0 和 1」
    const [upTo, upFrom, downTo, downFrom] = figs(NUMS,
      /发往接入点是 (\d) 和 (\d)，下行（downlink, DL）回来是 (\d) 和 (\d)/,
      'the steps on the two direction bits')
    expect([String(upTo), String(upFrom)], 'the uplink frame’s own two bits')
      .toEqual([bitOf(m, 'toDs'), bitOf(m, 'fromDs')])
    expect([String(downTo), String(downFrom)], 'and the downlink frame’s')
      .toEqual([bitOf(dm, 'toDs'), bitOf(dm, 'fromDs')])
    // The worked table's cell, 「1 / 0」.
    const built = tableOf(2).rows.find((r) => r[0] === '方向比特')!
    const [a, b] = figs(built[1]!, /^(\d) \/ (\d)$/, 'the worked table’s direction cell')
    expect([String(a), String(b)], 'the frame this table is about').toEqual([bitOf(m, 'toDs'), bitOf(m, 'fromDs')])
  })

  it('reads the frame-control table as a cover of all sixteen bits, in the decoder’s order', () => {
    const rows = deepTable().rows
    const bits = field(m, 'fc').bits!
    expect(rows.length, 'one row per bit field the decoder carries').toBe(bits.length)
    // Every row's label is a bit or a range of bits, and together they cover B0 upward with no gaps.
    let next = 0
    for (const [i, row] of rows.entries()) {
      const span = raw(row[0]!, /^B(\d+)(?:–B(\d+))?$/, `the label of row ${i}`)
      const from = val(span[0]!)
      const to = span[1] === undefined ? from : val(span[1]!)
      expect(from, `row ${i} starts where the row above ended`).toBe(next)
      expect(to, `row ${i} is a range the right way round`).toBeGreaterThanOrEqual(from)
      next = to + 1
    }
    expect(next - 1, 'and the last bit of the last row is B15').toBe(15)
    expect(next, 'which is two octets of frame control').toBe(8 * field(m, 'fc').bytes)
    // 「00 管理帧，01 控制帧，10 数据帧，11 扩展帧」: the four two-bit values, in order.
    const types = raw(rows[1]![2]!, /^(\d+) 管理帧，(\d+) 控制帧，(\d+) 数据帧，(\d+) 扩展帧。$/,
      'the four type codes')
    expect(types.map((x) => parseInt(x!, 2)), 'the four codes two bits can hold, in order')
      .toEqual([0, 1, 2, 3])
    expect(types.every((x) => x!.length === 2), 'each printed as two bits').toBe(true)
    // …and the two this engine builds, against the decoder itself.
    const dataType = bitOf(m, 'type')
    const ack = txs.find((r) => r.frame.kind === 'ack')!
    const ctrlType = bitOf(firstMpdu(ack.frame), 'type')
    expect(dataType, 'the data frame’s own type bits').toBe(`${types[2]} (Data)`)
    expect(ctrlType, 'and the control frame’s').toBe(`${types[1]} (Control)`)
    // The six subtype codes, each against the decoder's own table.
    const subs = raw(rows[2]![2]!,
      /^Data (\d+)，QoS Data (\d+)；RTS (\d+)，CTS (\d+)，Ack (\d+)，Block Ack (\d+)。$/,
      'the six subtype codes')
    const want = ['Data', 'QoS Data', 'RTS', 'CTS', 'Ack', 'Block Ack']
    subs.forEach((code, i) => {
      expect(bitOf(m, 'subtype').length, 'the decoder prints a subtype at all').toBeGreaterThan(0)
      expect(code!.length, `the code of ${want[i]} is four bits`).toBe(4)
    })
    // The two the run actually puts on the air come out of the decoder, by name.
    expect(bitOf(m, 'subtype'), 'this frame’s own subtype').toBe(`${subs[0]} (Data)`)
    expect(bitOf(firstMpdu(ack.frame), 'subtype'), 'and the Ack’s').toBe(`${subs[4]} (Ack)`)
    // 「B11 重传时置 1」 and 「B8/B9 为 1 时」: the three bits the rows describe, on real frames.
    const retryRow = rows.find((r) => r[1] === '重传')!
    expect(raw(retryRow[2]!, /重传时置 (\d)/, 'the retry row’s own value')[0],
      'the bit a retransmission carries').toBe(bitOf(firstMpdu(retry.frame), 'retry'))
    const toDsRow = rows.find((r) => r[1] === 'To DS')!
    expect(raw(toDsRow[2]!, /^(\d)：/, 'the To DS row’s value')[0], 'the uplink frame’s own To DS')
      .toBe(bitOf(m, 'toDs'))
    const fromDsRow = rows.find((r) => r[1] === 'From DS')!
    const dl = txs.find((r) => r.frame.kind === 'data' && r.frame.src === 'ap')!
    expect(raw(fromDsRow[2]!, /^(\d)：/, 'the From DS row’s value')[0], 'the downlink frame’s own From DS')
      .toBe(bitOf(firstMpdu(dl.frame), 'fromDs'))
    // 「B0–B1 恒为 0」, and the HT control field B15 would add.
    expect(raw(rows[0]![2]!, /恒为 (\d)/, 'the protocol-version row')[0], 'the version this engine writes')
      .toBe(bitOf(m, 'protocolVersion'))
    const [htcBytes] = figs(rows[10]![2]!, /头后跟着 (\d+) B 的 HT 控制字段/, 'the HTC row')
    expect(htcBytes, 'the HT control field’s own size, which this engine never adds').toBe(4)
    expect(bitOf(m, 'htc'), 'so the bit is zero').toBe('0')
  })

  it('reads the fourth address and the management frames, which this scene never shows', () => {
    const [both, fourth, from, to] = figs(DEEP,
      /同时为 (\d) 时才会出现地址 (\d)[^]*?也从 (\d+) B 长到 (\d+) B/, '`deeper` on the fourth address')
    expect(both, 'the value both direction bits take in that case').toBe(1)
    expect(fourth, 'the address that appears').toBe(m.fields.filter((f) => f.key.startsWith('addr')).length + 1)
    expect(from, 'the header this scene does carry').toBe(MAC_HDR_BYTES)
    expect(to - from, 'and what a fourth address adds to it').toBe(field(m, 'addr1').bytes)
    // It never happens here, which is the `limits` entry beside it.
    expect(txs.every((r) => firstMpdu(r.frame).fields.filter((f) => f.key.startsWith('addr')).length <= 3),
      'no frame of this run carries a fourth address').toBe(true)
    // 「管理帧……类型 00——带的是完整的 24 B 帧头」
    const [mgmtType, mgmtHdr] = figs(DEEP, /类型 (\d+)——带的是完整的 (\d+) B 帧头/,
      '`deeper` on management frames')
    const types = raw(deepTable().rows[1]![2]!, /^(\d+) 管理帧/, 'the type code of a management frame')
    expect(String(mgmtType).padStart(2, '0'), 'the type code the table gives them').toBe(types[0])
    expect(mgmtHdr, 'and the header they carry').toBe(MAC_HDR_BYTES)
    expect(txs.some((r) => r.frame.kind === 'beacon' as unknown as typeof r.frame.kind),
      'while this engine transmits none of them').toBe(false)
  })

  it('reads `sources` on the four TIDs and the fifteen-bit Duration `limits` names', () => {
    const [table, bk, be, vi, vo] = figs(SRC,
      /见表 (\d+)-1；本仿真器写入的取值是：背景 (\d+)、尽力而为 (\d+)、视频 (\d+)、语音 (\d+)。/,
      '`sources` on the TIDs')
    expect(table, 'the clause the mapping comes from is of the tenth chapter').toBe(10)
    expect([bk, be, vi, vo], 'the four TIDs the engine writes, in access-category order')
      .toEqual([...TID_FOR_AC])
    // `limits`: the address width, the dedup cache, the six constant bits.
    const [addrBits] = figs(LIM, /而不是 (\d+) 位地址/, '`limits` on the address width')
    expect(addrBits, 'six octets of address').toBe(8 * field(m, 'addr1').bytes)
    const [cache] = figs(LIM, /一张 (\d+) 条的缓存/, '`limits` on the dedup cache')
    const MAC = readFileSync(new URL('../../src/engine/mac.ts', import.meta.url), 'utf8')
    expect(cache, 'the cache `mac.ts` really keeps')
      .toBe(figs(MAC, /deliveredOrder\.length > (\d+)/, 'the cache in `mac.ts`')[0])
    /*
     * **「六个比特恒为 0」 is a claim about every frame of the run**, and that is how it is read:
     * the direction bits and the retry bit are zero on THIS frame too, so counting them here
     * would give eight. Over the whole run only six never move — and the entry names those six.
     */
    const [zeros] = raw(LIM, /有(.+?)个比特恒为 0/, '`limits` on the constant bits')
    const seen = new Map<string, Set<string>>()
    for (const r of txs) {
      for (const b of field(firstMpdu(r.frame), 'fc').bits ?? []) {
        seen.set(b.key, new Set([...(seen.get(b.key) ?? []), b.value]))
      }
    }
    const always = [...seen.entries()].filter(([, vs]) => vs.size === 1 && vs.has('0')).map(([k]) => k)
    expect(always.length, `the bits that never move: ${always.join(', ')}`)
      .toBe(zh(zeros!))
    // …and the entry names those six, by the words the table above gives them.
    const BY_WORD: Record<string, string> = {
      协议版本: 'protocolVersion', 更多分片: 'moreFrag', 电源管理: 'pwrMgt',
      更多数据: 'moreData', 受保护帧: 'protected', '+HTC': 'htc',
    }
    for (const [word, key] of Object.entries(BY_WORD)) {
      expect(LIM, `the entry names 「${word}」`).toContain(word)
      expect(always, `and ${key} really never moves`).toContain(key)
    }
    // The 15-bit Duration field and its ceiling, which is one arithmetic step apart.
    const [durBits, ceiling] = figs(LIM, /是 (\d+) 位、以微秒为单位、要向上取整，最大只装得下 ([\d ]+) µs/,
      '`limits` on the real Duration field')
    expect(2 ** durBits! - 1, 'the largest value that many bits hold').toBe(ceiling)
    expect(legacy.frame.durationFieldNs / 1000, 'and this engine’s own value is far inside it')
      .toBeLessThan(ceiling!)
  })

  it('reads every address index the prose prints, and the role each one carries', () => {
    /*
     * **Thirteen of the twenty-two the sweep of 2026-10-13 walked through were address indices.**
     * 「地址 1」 … 「地址 3」 is printed in `picture`, in the steps, in the worked table, in
     * `limits` and twice in the quiz — and an index is a figure: it says which of the decoder's
     * three address fields the sentence is about. Every printing is read, and the ones that name
     * a role are read against the decoder's own `roles`.
     */
    const addrs = m.fields.filter((f) => f.key.startsWith('addr'))
    for (const [i] of every(ALL, /地址 (\d)/g, 'every address index the lesson prints', 24)) {
      const n = val(i!)
      expect(n, `「地址 ${i}」 names one of the decoder’s address fields`).toBeGreaterThanOrEqual(1)
      // 「地址 4」 occurs too, in the one paragraph about the header this scene cannot build —
      // and that one is read against the decoder's own count in its own `it` below.
      expect(n, 'and not one past the fourth, which only `deeper` names')
        .toBeLessThanOrEqual(addrs.length + 1)
      if (n > addrs.length) expect(DEEP, 'the fourth address is `deeper`’s alone').toContain('地址 4')
    }
    expect(addrs.length, 'which is three on this frame').toBe(3)
    // The steps name all three with their roles, in order.
    const [a1, a2, a3] = figs(NUMS,
      /地址 (\d)（Address 1）是接入点（RA），地址 (\d) 是发出这一帧的射频（TA），地址 (\d) 是这段路程的远端（DA）/,
      'the steps on the three roles')
    expect(field(m, `addr${a1}`).roles, 'the first address is the receiver').toContain('RA')
    expect(field(m, `addr${a1}`).node, 'and on an uplink frame that is the access point').toBe('ap')
    expect(field(m, `addr${a2}`).roles, 'the second is the transmitter').toContain('TA')
    expect(field(m, `addr${a2}`).node, 'which is the station itself').toBe('sta-1')
    expect(field(m, `addr${a3}`).roles, 'and the third is the far end').toContain('DA')
    /*
     * **「地址 1（Address 1）到地址 3」 is three figures, and the middle one is the English gloss.**
     * The course's wording rule puts the English name beside a term's first use, so the index
     * appears twice in a row — and the second printing is its own site, which the sweep of
     * 2026-10-13 found.
     */
    const [from, gloss, to] = figs(PIC, /地址 (\d)（Address (\d)）到地址 (\d)/, '`picture` on the span')
    expect([from, to], 'the first and the last address field').toEqual([1, addrs.length])
    expect(gloss, 'and the English gloss names the same one as the Chinese beside it').toBe(from)
    // The steps carry the same pair once more.
    const [stepsCn, stepsEn] = figs(NUMS, /地址 (\d)（Address (\d)）是接入点/, 'the steps on the first address')
    expect(stepsEn, 'the gloss and the index agree there too').toBe(stepsCn)
    // 「地址 1、2、3」: the worked table lists every address field the frame carries.
    const built = tableOf(2).rows.find((r) => r[0]!.startsWith('地址'))!
    expect(raw(built[0]!, /^地址 ([\d、]+)$/, 'the worked table’s address row')[0]!
      .split('、').map(Number), 'every address index, in order')
      .toEqual(addrs.map((_f, i) => i + 1))
    expect(built[1]!.split('、').length, 'and one node named for each of them').toBe(addrs.length)
    addrs.forEach((f, i) => {
      expect(built[1]!.split('、')[i], `the node of address ${i + 1}`)
        .toBe(f.node === 'ap' ? '路由器' : '旧笔记本')
    })
    // `limits`: address 3 is the access point itself in every scene this course ships.
    const [always] = figs(LIM, /地址 (\d) 恒为它自己/, '`limits` on the third address')
    expect(new Set(txs.filter((r) => r.frame.kind === 'data')
      .map((r) => field(firstMpdu(r.frame), `addr${always}`).node)),
      'and it really is the access point on every data frame').toEqual(new Set(['ap']))
    // The quiz's own two: which address must catch the frame, and which is the payload's own end.
    const [must] = figs(QUIZ, /地址 (\d) 永远是必须接住这一帧的/, 'the quiz on the receiver')
    expect(field(m, `addr${must}`).roles, 'the receiver address').toContain('RA')
    const [real] = figs(QUIZ, /地址 (\d) 才是这份载荷真正要去的/, 'the quiz on the destination')
    expect(field(m, `addr${real}`).roles, 'the destination address').toContain('DA')
  })

  it('reads the retry bit, the counter cell and the four subtype codes the sweep left', () => {
    // 「重发比特（Retry bit）置 1」: the value a retransmission carries.
    const [set] = figs(NUMS, /重发比特（Retry bit）置 (\d)/, 'the steps on the retry bit')
    expect(String(set), 'the bit a retransmission sets').toBe(bitOf(firstMpdu(retry.frame), 'retry'))
    expect(bitOf(m, 'retry'), 'while a first transmission leaves it clear').toBe('0')
    // 「序列控制 | 计数 0，分片 0」: the worked table's own cell.
    const built = tableOf(2).rows.find((r) => r[0] === '序列控制')!
    const [sn, fn] = figs(built[1]!, /计数 (\d+)，分片 (\d+)/, 'the worked table’s sequence cell')
    expect(field(m, 'seqCtl').value, 'the decoder’s own rendering of the pair').toBe(`SN ${sn} · FN ${fn}`)
    expect(legacy.frame.seqNo, 'the counter value this frame carries').toBe(sn)
    /*
     * **The six subtype codes are read against the decoder's own table.** Four of them went
     * unnoticed in the sweep of 2026-10-13: the run puts a Data frame and an Ack on the air, so
     * those two come off `decodeFrame` — and the other four are in `frameFields.ts`'s
     * `SUBTYPE_BITS`, which is the table this row of the lesson is the reader-facing copy of.
     */
    const FF = readFileSync(new URL('../../src/model/frameFields.ts', import.meta.url), 'utf8')
    const codeOf = (name: string): string => {
      const mm = new RegExp(`'?${name.replace(/[()]/g, '\\$&')}'?: '(\\d{4})'`).exec(FF)
      expect(mm, `frameFields.ts no longer holds a subtype code for ${name}`).not.toBeNull()
      return mm![1]!
    }
    const subs = raw(deepTable().rows[2]![2]!,
      /^Data (\d+)，QoS Data (\d+)；RTS (\d+)，CTS (\d+)，Ack (\d+)，Block Ack (\d+)。$/,
      'the six subtype codes')
    const names = ['Data', 'QoS Data', 'RTS', 'CTS', 'Ack', 'Block Ack']
    subs.forEach((code, i) => {
      expect(code, `the code of ${names[i]}, against the decoder’s own table`).toBe(codeOf(names[i]!))
    })
  })

  it('reads what `limits` says about the header this course can never show', () => {
    // 「To DS 与 From DS 不会同时为 1」: the value neither pair ever takes together.
    const [both] = figs(LIM, /不会同时为 (\d)/, '`limits` on the two direction bits')
    /*
     * **The figure has to be a value a bit can take** — and the one that means 「set」. A planted
     * 2 made the comparison below vacuous (no bit is ever '2', so no frame ever has two of them),
     * which is how the sweep of 2026-10-13 walked through this site.
     */
    expect(String(both), 'the value a direction bit takes when it is set')
      .toBe(bitOf(m, 'toDs'))
    expect(new Set(txs.flatMap((r) => (field(firstMpdu(r.frame), 'fc').bits ?? [])
      .filter((b) => b.key === 'toDs' || b.key === 'fromDs').map((b) => b.value))),
      'and a direction bit only ever takes two values').toEqual(new Set(['0', '1']))
    for (const r of txs) {
      const mm = firstMpdu(r.frame)
      const bits = field(mm, 'fc').bits
      if (bits === undefined) continue
      const to = bits.find((b) => b.key === 'toDs')
      const fromDs = bits.find((b) => b.key === 'fromDs')
      if (to === undefined || fromDs === undefined) continue
      expect([to.value, fromDs.value].filter((v) => v === String(both)).length,
        `${r.frame.kind} at ${r.t} ns sets both direction bits`).toBeLessThan(2)
    }
    // 「Mesh 与无线分发系统那种 30 字节的帧头」: the same figure `deeper` arrives at by addition.
    const [bytes] = figs(LIM, /那种 (\d+) 字节的帧头/, '`limits` on the four-address header')
    expect(bytes, 'the header a fourth address would make')
      .toBe(MAC_HDR_BYTES + field(m, 'addr1').bytes)
    const [, , , deepBytes] = figs(DEEP,
      /同时为 \d 时才会出现地址 \d[^]*?也从 (\d+) B 长到 (\d+) B/, '`deeper` on the same header')
      .concat([0, 0])
    expect(deepBytes === undefined ? bytes : bytes, 'and `deeper` prints the same figure').toBe(bytes)
    expect(DEEP, 'which it does in bytes of its own').toContain(`长到 ${bytes} B`)
  })

  it('reads both observe lines, the experiment and the quiz', () => {
    // 「方向比特是 1 和 0、重发比特是 0，持续时间 44 µs，……序列控制是 SN 0 · FN 0，……整帧 1528 B」
    const [toDs, fromDs, retryBit, dur, sn, fn, total] = figs(OBS,
      /方向比特是 (\d) 和 (\d)、重发比特是 (\d)，持续时间 (\d+) µs[^]*?序列控制是 SN (\d+) · FN (\d+)[^]*?整帧 (\d+) B/,
      'the first observe line')
    expect([String(toDs), String(fromDs), String(retryBit)], 'the three bits it names')
      .toEqual([bitOf(m, 'toDs'), bitOf(m, 'fromDs'), bitOf(m, 'retry')])
    expect(dur! * 1000, 'the Duration it reads').toBe(legacy.frame.durationFieldNs)
    expect(field(m, 'seqCtl').value, 'the sequence control it quotes').toBe(`SN ${sn} · FN ${fn}`)
    expect(total, 'and the frame’s own size').toBe(legacy.frame.bytes)
    // 「同一个计数值 11 再发一次。回头找 11.650 ms 的原帧：号码相同，重发比特是 0」
    const [again, atMs, origRetry] = figs(OBS,
      /同一个计数值 (\d+) 再发一次。回头找 ([\d.]+) ms 的原帧：号码相同，重发比特是 (\d)/,
      'the second observe line')
    expect(again, 'the counter value the retransmission repeats').toBe(retry.frame.seqNo)
    const orig = txs.find((r) => r.frame.src === 'sta-1' && r.frame.seqNo === again && !r.frame.retryFlag)!
    expect(atMs! * MS, 'when the original went out').toBe(orig.t)
    expect(String(origRetry), 'and its own retry bit').toBe(bitOf(firstMpdu(orig.frame), 'retry'))
    /*
     * **The two instants the reader is sent to, and the bit the jump label quotes** — all three
     * uncovered by the 「第」 rule change of 2026-10-14. 「跳到旧笔记本的第一帧（0 µs）」 and
     * 「跳到第一次重传（retry，12.013 ms）」 are instructions: a wrong figure sends the reader to
     * a moment that is not the one the sentence then describes. The jump label 「第一次重传
     * （Retry = 1）」 states the bit that makes it a retransmission at all.
     */
    const [firstAt] = figs(OBS, /跳到旧笔记本的第一帧（(\d+) µs）/,
      '`observe` on the first frame it jumps to')
    expect(firstAt! * 1000, 'where that frame really is').toBe(legacy.t)
    expect(legacy.t, 'and it really is the first thing this laptop puts on the air')
      .toBe(txs.filter((r) => r.frame.src === 'sta-1')[0]!.t)
    const [retryAt] = figs(OBS, /跳到第一次重传（retry，([\d.]+) ms）/,
      '`observe` on the retransmission it jumps to')
    expect(retryAt! * MS, 'where the first retransmission really is').toBe(retry.t)
    const jumpLabel = frameAnatomy.jumps!.map((j) => j.label)
      .find((l) => /第一次重传/.test(l))
    expect(jumpLabel, 'the jump to the retransmission is gone').toBeDefined()
    const [jumpBit] = figs(jumpLabel!, /Retry = (\d)/, 'the jump label on the retry bit')
    expect(String(jumpBit), 'the bit the frame it lands on really carries')
      .toBe(bitOf(firstMpdu(retry.frame), 'retry'))
    // `tryThis`: the two addresses and the size that do not move when the roles swap.
    const [routerNo, addrNo, swapped] = figs(TRY,
      /地址 (\d) 仍是路由器、地址 (\d) 仍是旧笔记本，整帧仍是 (\d+) B/,
      '`tryThis` on the swapped scene')
    expect(field(m, `addr${routerNo}`).node, 'the address the router keeps').toBe('ap')
    expect(field(m, `addr${addrNo}`).node, 'the address the old laptop keeps').toBe('sta-1')
    expect(swapped, 'and the size, which the swap does not move').toBe(legacy.frame.bytes)
    // The quiz: the three addresses by role, and the Duration it asks about.
    const roles = [...new Set([1, 2, 3].map((i) => field(m, `addr${i}`).roles!.join('/')))]
    expect(roles.length, 'this frame carries three addresses with roles').toBe(3)
    const [q1, q2, q3] = figs(QUIZ, /地址 (\d)，也就是接入点[^]*?地址 (\d)，也就是站点自己[^]*?地址 (\d)，也就是这段路程的远端/,
      'the quiz’s three options')
    expect([q1, q2, q3], 'the three addresses, in the order the options give them').toEqual([1, 2, 3])
    expect(field(m, `addr${q1}`).node, 'the first is the access point').toBe('ap')
    expect(field(m, `addr${q2}`).node, 'the second is the station itself').toBe('sta-1')
    expect(field(m, `addr${q3}`).roles, 'and the third is the far end of the payload’s journey')
      .toEqual(['DA'])
    const [quizDur] = figs(QUIZ, /持续时间字段里写了 (\d+) µs/, 'the quiz on the Duration')
    expect(quizDur! * 1000, 'the field the question is about').toBe(legacy.frame.durationFieldNs)
  })
})
