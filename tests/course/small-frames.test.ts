/**
 * Every empirical claim of "What a small frame costs, and what one preamble
 * buys" (src/course/tier1/small-frames.ts), measured against the scene it
 * shares with `frame-anatomy-bytes`.
 *
 * This is the SECOND half of `frame-anatomy-bytes`, so the control-frame sizes,
 * the aggregation formula, the reservation durations, the burst observation and
 * both experiments arrive here from tests/course/frame-anatomy-bytes.test.ts
 * with the sentences that carry them: no pin was dropped in the move.
 *
 * The lesson is not registered in `src/course/lessons.ts` yet — the controller
 * does that when the batch lands — so the readability contract is applied here
 * by importing the lesson directly: `lessonShapeSuite` for the shape and the
 * minutes, and the terminology rule over `ZH_TERMS` for the English names.
 */
import { describe, it, expect } from 'vitest'
import {
  smallFrames, burstSequence, BURST_BYTES, BURST_MPDUS, RTS_AT, BURST_AT, BA_AT,
} from '../../src/course/tier1/small-frames'
import {
  frameAnatomyScenario, firstRtsFrame, firstAmpduFrame, firstBlockAck,
} from '../../src/course/tier1/frame-anatomy'
import { Simulation } from '../../src/engine/simulation'
import type { Block, Lesson } from '../../src/course/lessonKit'
import type { SequenceSpec } from '../../src/course/diagram'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { decodeFrame, type Mpdu } from '../../src/model/frameFields'
import { hasFeature } from '../../src/model/caps'
import type { TLRecord } from '../../src/model/records'
import {
  ACK_BYTES, BA_BYTES, CTS_BYTES, RTS_BYTES, SIFS_NS, txTimeNs,
} from '../../src/engine/phy'
import {
  ZH_TERMS, cellTexts, paragraphTexts, zhAkaViolations, zhTermFailure,
} from '../../src/course/readability'
import { MODULES, trackOf } from '../../src/course/curriculum'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 30 * MS
type Tx = Extract<TLRecord, { type: 'TX_START' }>

const records = runOf(smallFrames, undefined, RUN_NS)
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
const field = (m: Mpdu, key: string) => m.fields.find((x) => x.key === key)!
const runEdited = (sc: Scenario, ns: number): TLRecord[] => [...new Simulation(sc).runUntil(ns).records]
/** The instant as the lesson prints it: "2.298 ms". */
const asMs = (ns: number): string => `${(ns / MS).toFixed(3)} ms`

/** The reader's own order over the main path, as tests/course/readability.test.ts walks it. */
const zhMain = (l: Lesson): string => [l.why!, ...(l.outcomes ?? [])]
  .concat(paragraphTexts(l.picture ?? []), cellTexts(l.picture ?? []))
  .concat(paragraphTexts(l.numbers ?? []), cellTexts(l.numbers ?? []))
  .concat(l.observe, l.tryThis, l.quiz.flatMap((q) => [q.q, ...q.options, q.explain]))
  .join(' ')

function termFailures(l: Lesson): string[] {
  const zh = zhMain(l)
  const out: string[] = []
  for (const t of ZH_TERMS.filter((x) => !x.track || x.track === trackOf(l))) {
    const why = zhTermFailure(zh, t)
    if (why) out.push(`${l.id}: ${why}`)
    out.push(...zhAkaViolations(zh, t).map((a) => `${l.id}: ${a}`))
  }
  return out
}

const rts = find(firstRtsFrame)
const ampdu = find(firstAmpduFrame)
const ba = find(firstBlockAck)
const cts = txs.find((r) => r.frame.kind === 'cts')!
const ack = txs.find((r) => r.frame.kind === 'ack')!

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
// `sameSceneAs` is the split rule: this lesson loads its parent's scene, which is
// `frame-anatomy`'s builder, so all three recorded hashes are the same run.
lessonShapeSuite(smallFrames, { runNs: RUN_NS, sameSceneAs: 'frame-anatomy-bytes' })

describe('small-frames · the lesson itself', () => {
  it('is the fourth lesson of the frames module and needs the byte count', () => {
    expect(MODULES[smallFrames.module].title).toBe('帧与空口时间')
    expect(smallFrames.needs).toEqual(['frame-anatomy-bytes'])
    expect(smallFrames.terms!.map((t) => t.term)).toEqual(['A-MPDU', 'BlockAck'])
  })

  it('loads its parent’s own scene, with no variant of its own', () => {
    expect(smallFrames.scenario()).toEqual(frameAnatomyScenario())
    expect(smallFrames.variants).toBeUndefined()
    expect(() => ScenarioSchema.parse(smallFrames.scenario())).not.toThrow()
    for (const q of smallFrames.quiz) expect(q.answer).toBeLessThan(q.options.length)
  })

  it('brackets every official term at its first Chinese use', () => {
    expect(termFailures(smallFrames)).toEqual([])
  })
})

describe('small-frames · the small frames', () => {
  it('an answer and a go-ahead are 14 B and carry no sender address', () => {
    const am = firstMpdu(ack.frame)
    expect(am.fields.map((x) => x.key)).toEqual(['fc', 'duration', 'addr1', 'fcs'])
    expect(am.bytes).toBe(ACK_BYTES)
    expect(ACK_BYTES).toBe(14)
    expect(cts.frame.bytes).toBe(CTS_BYTES)
    expect(CTS_BYTES).toBe(14)
    const cm = firstMpdu(cts.frame)
    expect(cm.fields.map((x) => x.key)).toEqual(['fc', 'duration', 'addr1', 'fcs'])
  })

  it('a 14 B answer costs 28 µs, of which 20 µs is the front', () => {
    // the picture's "它在空口上要占 28 µs，其中 20 µs 是前导码"
    expect(txTimeNs(ACK_BYTES, 24)).toBe(28_000)
    expect(ack.frame.txTimeNs).toBe(28_000)
    expect(Math.ceil((16 + 8 * ACK_BYTES + 6) / 96)).toBe(2)
    expect(20_000 + 2 * 4_000).toBe(28_000)
    // the quiz: half the bytes saves one symbol, not half the time
    expect(Math.ceil((16 + 8 * 7 + 6) / 96)).toBe(1)
    expect(txTimeNs(7, 24)).toBe(24_000)
    expect(28_000 - txTimeNs(7, 24)).toBe(4_000)
  })

  it('a reservation is 20 B and does carry one, because the answer must find it', () => {
    expect(rts.frame.bytes).toBe(RTS_BYTES)
    expect(RTS_BYTES).toBe(20)
    const m = firstMpdu(rts.frame)
    expect(m.subtypeName).toBe('RTS')
    expect(m.fields.map((x) => x.key)).toEqual(['fc', 'duration', 'addr1', 'addr2', 'fcs'])
    expect(field(m, 'addr1').roles).toEqual(['RA'])
    expect(field(m, 'addr2').roles).toEqual(['TA'])
    expect(m.bytes).toBe(20)
  })

  it('the one reply covering a burst is 32 B: both addresses, a starting number and a 64-bit map', () => {
    expect(ba.frame.bytes).toBe(BA_BYTES)
    expect(BA_BYTES).toBe(32)
    const m = firstMpdu(ba.frame)
    expect(m.fields.map((x) => x.key)).toEqual(['fc', 'duration', 'addr1', 'addr2', 'baControl', 'baInfo', 'fcs'])
    expect(field(m, 'baControl').bytes).toBe(2)
    expect(field(m, 'baInfo').bytes).toBe(10) // a 2 B starting sequence number + an 8 B (64-bit) bitmap
    expect(field(m, 'baControl').value).toBe('Compressed')
    expect(m.bytes).toBe(32)
  })

  it('the two small frames together are under three per cent of the burst', () => {
    // observation 2: "RTS 20 B、CTS 14 B，各占 28 µs，而且两个都是 24 Mb/s。
    //  它们加起来还不到那个突发的百分之三"
    expect(rts.frame.txTimeNs).toBe(28_000)
    expect(cts.frame.txTimeNs).toBe(28_000)
    expect(rts.frame.mbps).toBe(24)
    expect(cts.frame.mbps).toBe(24)
    expect((rts.frame.txTimeNs + cts.frame.txTimeNs) / ampdu.frame.txTimeNs).toBeLessThan(0.03)
  })
})

describe('small-frames · many frames behind one front', () => {
  it('fourteen frames: 13 × 1536 + 1534 = 21 502 B, one 4 B delimiter each, padding but the last', () => {
    expect(ampdu.frame.retryFlag).toBeFalsy()
    expect(ampdu.frame.ampdu!.mpduCount).toBe(BURST_MPDUS)
    expect(BURST_MPDUS).toBe(14)
    expect(ampdu.frame.bytes).toBe(BURST_BYTES)
    expect(BURST_BYTES).toBe(21_502)
    expect(13 * 1536 + 1534).toBe(21_502)
    const u = decode(ampdu.frame).users[0]
    expect(u.subframes.length).toBe(14)
    expect(u.bytes).toBe(21_502)
    for (const [i, sf] of u.subframes.entries()) {
      expect(sf.delimiterBytes).toBe(4)
      expect(sf.mpdu.bytes).toBe(1530)
      expect(sf.padBytes).toBe(i === 13 ? 0 : 2)
    }
    expect(ampdu.frame.txTimeNs).toBe(2_248_000)
  })

  it('the steps block: the queue, the threshold, the three durations and the one reply', () => {
    const steps = smallFrames.numbers!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!
    expect(steps.items.length).toBe(5)
    // 1. "每帧 1530 B，前面 4 B 的分隔符，再补齐到 4 的倍数——十四个之后是 21 502 B"
    expect(decode(ampdu.frame).users[0].subframes.every((sf) => sf.mpdu.bytes === 1530)).toBe(true)
    expect(ampdu.frame.bytes).toBe(21_502)
    // 2. "超过了本场景的预约门限 2000 B"
    expect(frameAnatomyScenario().rtsThresholdBytes).toBe(2000)
    expect(ampdu.frame.bytes).toBeGreaterThan(2000)
    expect(rts.t).toBe(2_298_000)
    expect(rts.frame.durationFieldNs).toBe(2_356_000)
    expect(28_000 + ampdu.frame.txTimeNs + 32_000 + 3 * SIFS_NS).toBe(2_356_000)
    // 3. "同一个预约，减去一个间隔和它自己"
    expect(cts.frame.durationFieldNs).toBe(2_312_000)
    expect(rts.frame.durationFieldNs - SIFS_NS - cts.frame.txTimeNs).toBe(2_312_000)
    // 4. "占 2248 µs 空口；它自己的持续时间只写 48 µs"
    expect(ampdu.frame.durationFieldNs).toBe(48_000)
    expect(SIFS_NS + 32_000).toBe(48_000)
    // 5. "4.650 ms，一个 32 B 的 BlockAck 一次回答十四帧，持续时间写 0"
    expect(ba.t).toBe(4_650_000)
    expect(ba.frame.durationFieldNs).toBe(0)
    expect(ba.frame.txTimeNs).toBe(32_000)
  })

  it('the deeper note: inside an aggregate the same two bits mean Implicit BAR', () => {
    const m = decode(ampdu.frame).users[0].subframes[0].mpdu
    expect(field(m, 'qos').value).toBe('TID 1 · Implicit BAR')
  })
})

describe('small-frames · the figure is the run', () => {
  const isDiagram = (b: Block): b is Extract<Block, { kind: 'diagram' }> => b.kind === 'diagram'
  const diagrams = [...smallFrames.picture!, ...smallFrames.numbers!].filter(isDiagram)

  it('draws the one figure §4 gives this lesson, and no others', () => {
    expect(diagrams.map((b) => b.spec.kind)).toEqual(['sequence'])
  })

  it('the four messages are the four transmissions of the run, at their own instants', () => {
    const seq = diagrams[0].spec as SequenceSpec
    expect(seq).toEqual(burstSequence())
    const sc = frameAnatomyScenario()
    for (const c of seq.columns) expect(sc.nodes.some((n) => n.id === c.id), c.id).toBe(true)
    // the burst is the laptop's, and the two small frames are its reservation
    expect(ampdu.frame.src).toBe('sta-3')
    expect(rts.frame.src).toBe('sta-3')
    expect(cts.frame.src).toBe('ap')
    expect(ba.frame.src).toBe('ap')
    expect(seq.messages.map((m) => [m.from, m.to])).toEqual([
      ['sta-3', 'ap'], ['ap', 'sta-3'], ['sta-3', 'ap'], ['ap', 'sta-3'],
    ])
    // every size in a label, and every instant in the gutter, is the run's own
    expect(seq.messages[0].label).toContain(`${rts.frame.bytes} B`)
    expect(seq.messages[1].label).toContain(`${cts.frame.bytes} B`)
    expect(seq.messages[2].label).toContain(String(ampdu.frame.ampdu!.mpduCount))
    expect(seq.messages[3].label).toContain(`${ba.frame.bytes} B`)
    expect([RTS_AT, BURST_AT, BA_AT]).toEqual([asMs(rts.t), asMs(ampdu.t), asMs(ba.t)])
    expect(seq.messages.flatMap((m) => (m.at ? [m.at] : []))).toEqual([asMs(rts.t), asMs(ampdu.t), asMs(ba.t)])
  })
})

describe('small-frames · the experiments', () => {
  it('with the reservation threshold above 21 502 B the bursts go out with nothing in front', () => {
    const sc = frameAnatomyScenario()
    sc.rtsThresholdBytes = 30_000
    const rs = runEdited(sc, RUN_NS)
    const agg = rs.find((r): r is Tx => r.type === 'TX_START' && r.frame.ampdu !== undefined)!
    expect(agg.frame.bytes).toBeGreaterThan(21_000)
    expect(agg.frame.bytes).toBeLessThan(sc.rtsThresholdBytes!)
    expect(rs.some((r) => r.type === 'TX_START' && r.frame.kind === 'rts')).toBe(false)
    expect(rs.some((r) => r.type === 'TX_START' && r.frame.kind === 'cts')).toBe(false)
  })

  it('as a Wi-Fi 5 device the old laptop\'s lone frames become bursts opened by a reservation', () => {
    const sc = frameAnatomyScenario()
    const old = sc.nodes.find((n) => n.id === 'sta-1')!
    old.caps.generation = 'vht'
    old.caps.features = { edca: true, ampdu: true, txop: true }
    const rs = runEdited(sc, 40 * MS)
    const agg = rs.find((r): r is Tx => r.type === 'TX_START' && r.frame.src === 'sta-1' && r.frame.ampdu !== undefined)!
    expect(agg.frame.ampdu!.mpduCount).toBeGreaterThan(1)
    expect(agg.frame.bytes).toBeGreaterThan(sc.rtsThresholdBytes!)
    const before = rs.filter((r): r is Tx => r.type === 'TX_START' && r.t < agg.t && r.frame.src === 'sta-1')
    expect(before[before.length - 1].frame.kind).toBe('rts')
  })
})
