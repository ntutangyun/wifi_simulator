/**
 * Every empirical claim in "A-MPDU — pay contention once", measured against the
 * lesson's own scenario and its aggregation-off variant.
 *
 * The lesson had no test file of its own before the readability rewrite: the
 * 14 MPDUs per win, the RTS/CTS that opens the burst and the ~1.5× goodput are
 * pinned in tests/course/lesson-claims.test.ts ("lesson 8 · A-MPDU"), which
 * still holds them and still passes. What this file adds is everything the
 * grown lesson now states — the two tables, the worked airtime per delivered
 * frame, and the three observations. There was never a `.body!` site to retire.
 */
import { describe, it, expect } from 'vitest'
import { ampdu } from '../../src/course/tier2/ampdu'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { AMPDU_DELIMITER_BYTES, BA_BYTES, FCS_BYTES, MAX_AMPDU_MPDUS, MAX_PPDU_NS, OFDM_5G, QOS_HDR_BYTES } from '../../src/engine/phy'
import { ampduPsduBytes, ampduSubframeBytes } from '../../src/model/frames'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 200 * MS

/** The batched run, and the same device with aggregation switched off. */
const agg = (): TLRecord[] => runOf(ampdu, undefined, RUN_NS)
const plain = (): TLRecord[] => runOf(ampdu, 0, RUN_NS)
const txs = (rs: TLRecord[], kind?: string) =>
  ofType(rs, 'TX_START').filter((r) => kind === undefined || r.frame.kind === kind)
const delivered = (rs: TLRecord[]) => ofType(rs, 'DEQUEUE').filter((r) => r.node === 'sta-1').length
const busyAirNs = (rs: TLRecord[]) => txs(rs).reduce((a, r) => a + r.frame.txTimeNs, 0)

lessonShapeSuite(ampdu, { runNs: RUN_NS })

describe('ampdu · the lesson’s own scene', () => {
  it('sits in Tier 2 and leans on the airtime and frame lessons', () => {
    expect(ampdu.module).toBe(2)
    expect(ampdu.needs).toEqual(['airtime', 'frame-anatomy', 'retries-queues'])
    expect(ampdu.terms!.map((t) => t.term)).toEqual(['A-MPDU', 'subframe', 'BlockAck'])
  })

  it('the scene is one uploader, and the variant is the same device with aggregation off', () => {
    const base = ampdu.scenario()
    const off = ampdu.variants![0].scenario()
    expect(() => ScenarioSchema.parse(base)).not.toThrow()
    expect(() => ScenarioSchema.parse(off)).not.toThrow()
    // "the same device, the same coding": only the aggregation feature differs
    expect(base.nodes.map((n) => n.id)).toEqual(off.nodes.map((n) => n.id))
    const feat = (sc: ReturnType<typeof ampdu.scenario>) => sc.nodes.find((n) => n.id === 'sta-1')!.caps.features
    expect(feat(base).ampdu).toBe(true)
    expect(feat(off).ampdu).toBeUndefined()
    expect(feat(off).edca).toBe(true)
    expect(feat(off).txop).toBe(true)
  })
})

describe('ampdu · one turn, both ways', () => {
  it('batched: 14 frames, 21 502 bytes, 2 248 µs, opened by RTS + CTS and closed by a BlockAck', () => {
    // the "One turn, both ways" table, batched column, and the first two observations
    const rs = agg()
    const data = txs(rs, 'data')
    expect(data.length).toBeGreaterThan(50)
    for (const d of data) expect(d.frame.ampdu?.mpduCount).toBe(14)
    expect(data[0].frame.bytes).toBe(21_502)
    expect(data[0].frame.txTimeNs).toBe(2_248 * US)
    // "Opened by: RTS + CTS · 28 µs each"
    expect(txs(rs).filter((r) => r.t < data[0].t).map((r) => r.frame.kind)).toEqual(['rts', 'cts'])
    expect(new Set(txs(rs, 'rts').map((r) => r.frame.txTimeNs))).toEqual(new Set([28 * US]))
    expect(new Set(txs(rs, 'cts').map((r) => r.frame.txTimeNs))).toEqual(new Set([28 * US]))
    // "One lilac BlockAck of 32 bytes, 32 µs long"
    const ba = txs(rs, 'ba')
    expect(ba.length).toBeGreaterThan(50)
    expect(ba[0].frame.bytes).toBe(BA_BYTES)
    expect(BA_BYTES).toBe(32)
    expect(ba[0].frame.txTimeNs).toBe(32 * US)
    // nothing else is on the air in this scene
    expect(new Set(txs(rs).map((r) => r.frame.kind))).toEqual(new Set(['rts', 'cts', 'data', 'ba']))
  })

  it('one at a time: 1 530-byte frames of 200 µs, each with its own 28 µs answer', () => {
    // the table's right-hand column and the third observation
    const rs = plain()
    const data = txs(rs, 'data')
    expect(data.every((r) => r.frame.ampdu === undefined)).toBe(true)
    expect(new Set(data.map((r) => r.frame.bytes))).toEqual(new Set([1_530]))
    expect(new Set(data.map((r) => r.frame.txTimeNs))).toEqual(new Set([200 * US]))
    const ack = txs(rs, 'ack')
    expect(ack[0].frame.bytes).toBe(14)
    expect(new Set(ack.map((r) => r.frame.txTimeNs))).toEqual(new Set([28 * US]))
    expect(new Set(txs(rs).map((r) => r.frame.kind))).toEqual(new Set(['data', 'ack']))
  })

  it('the coding is the same on both sides, so none of the gain hides in the rate', () => {
    // "Same coding, same bytes, same room" and the quiz's first explanation
    expect(new Set([...txs(agg(), 'data'), ...txs(plain(), 'data')].map((r) => r.frame.mcs)))
      .toEqual(new Set([8]))
  })

  it('the formula: 166.9 µs a frame batched against 228.0 µs one at a time', () => {
    // "(28 + 28 + 2 248 + 32) µs ÷ 14 frames = 166.9 µs" / "(200 + 28) µs ÷ 1 frame = 228.0 µs"
    expect(((28 + 28 + 2_248 + 32) / 14).toFixed(1)).toBe('166.9')
    expect((200 + 28).toFixed(1)).toBe('228.0')
  })
})

describe('ampdu · how a batch is built and answered', () => {
  it('step 3: the subframe layout is the engine’s own arithmetic, 13 × 1 536 + 1 534', () => {
    // "a 4-byte delimiter carrying the length, then that frame's own QoS header, its payload
    // and its check, padded up to a four-byte boundary. The last subframe is not padded."
    expect(AMPDU_DELIMITER_BYTES).toBe(4)
    expect(QOS_HDR_BYTES).toBe(26)
    expect(FCS_BYTES).toBe(4)
    expect(ampduSubframeBytes(1_500)).toBe(1_536)
    expect(AMPDU_DELIMITER_BYTES + QOS_HDR_BYTES + 1_500 + FCS_BYTES).toBe(1_534)
    expect(ampduPsduBytes(Array(14).fill(1_500))).toBe(13 * 1_536 + 1_534)
    expect(ampduPsduBytes(Array(14).fill(1_500))).toBe(21_502)
    expect(txs(agg(), 'data')[0].frame.bytes).toBe(ampduPsduBytes(Array(14).fill(1_500)))
  })

  it('step 2: of the three bounds it is the turn that binds, at 2 384 µs of 2 528 µs', () => {
    const rs = agg()
    const t0 = ofType(rs, 'TXOP_START')[0]
    const data = txs(rs, 'data')[0]
    const ba = txs(rs, 'ba').find((r) => r.t > data.t)!
    expect(MAX_AMPDU_MPDUS).toBe(64)
    expect(MAX_PPDU_NS).toBe(5_484 * US)
    expect(data.frame.ampdu!.mpduCount).toBe(14)
    // neither the 64-frame ceiling nor the longest PPDU is anywhere near
    expect(data.frame.txTimeNs).toBeLessThan(MAX_PPDU_NS)
    // "the whole exchange: question, answer, three pauses, batch, BlockAck" = 2 384 µs
    const endNs = ba.t + ba.frame.txTimeNs
    expect((endNs - t0.t) / US).toBe(2_384)
    expect((t0.untilNs - t0.t) / US).toBe(2_528)
    // "left over, where a fifteenth subframe costs about 160 µs" = 144 µs
    expect((t0.untilNs - endNs) / US).toBe(144)
    expect(data.frame.txTimeNs / 14 / US).toBeGreaterThan(144)
    // and the queue had more than 14 frames in it: the clock bound the batch, not the queue
    expect(ofType(rs, 'ENQUEUE').filter((r) => r.t <= t0.t).length).toBeGreaterThan(14)
  })

  it('steps 5 and 6: one BlockAck one SIFS later, and the batch is settled whole', () => {
    const rs = agg()
    const data = txs(rs, 'data')[0]
    const ba = txs(rs, 'ba').find((r) => r.t > data.t)!
    expect(ba.t - (data.t + data.frame.txTimeNs)).toBe(OFDM_5G.sifsNs)
    expect(ba.frame.bytes).toBe(BA_BYTES)
    // no per-subframe bitmap in this engine: all fourteen leave the queue at one instant
    const deq = ofType(rs, 'DEQUEUE').filter((r) => r.node === 'sta-1' && r.t <= ba.t + ba.frame.txTimeNs)
    expect(deq).toHaveLength(14)
    expect(new Set(deq.map((r) => r.t)).size).toBe(1)
  })
})

describe('ampdu · the whole 200 ms run, both ways', () => {
  it('81 turns and 1 120 frames batched; 83 turns and 738 frames one at a time', () => {
    // the "The whole run, both ways" table, and "Almost the same number of turns is won either way"
    expect(ofType(agg(), 'TXOP_START').length).toBe(81)
    expect(ofType(plain(), 'TXOP_START').length).toBe(83)
    expect(delivered(agg())).toBe(1_120)
    expect(delivered(plain())).toBe(738)
  })

  it('air per delivered frame measures 168.9 µs batched against 228.3 µs', () => {
    // the last row of both tables: measured over the run, "a little above the worked ones"
    const perFrame = (rs: TLRecord[]) => (busyAirNs(rs) / delivered(rs) / US).toFixed(1)
    expect(perFrame(agg())).toBe('168.9')
    expect(perFrame(plain())).toBe('228.3')
    expect(busyAirNs(agg()) / delivered(agg())).toBeGreaterThan((28 + 28 + 2_248 + 32) / 14 * US)
  })

  it('about 1.5 times the delivered frames, at the same coding', () => {
    // the second experiment; the same ratio lesson-claims.test.ts pins
    expect(Math.round((delivered(agg()) / delivered(plain())) * 10) / 10).toBe(1.5)
  })

  it('fourteen is the clock’s ceiling, not aggregation’s, which is 64', () => {
    // the first experiment: "Fourteen is what fits in the time one win may last — it is not the
    // aggregation ceiling, which is 64 frames."
    expect(MAX_AMPDU_MPDUS).toBe(64)
    const t0 = ofType(agg(), 'TXOP_START')[0]
    const end = ofType(agg(), 'TXOP_END').find((r) => r.t > t0.t)!
    expect(t0.untilNs - t0.t).toBe(2_528 * US)
    // the whole turn — RTS, CTS, the batch and the BlockAck — fits inside that lease
    expect(end.t - t0.t).toBeLessThanOrEqual(t0.untilNs - t0.t)
    expect(txs(agg(), 'data')[0].frame.ampdu!.mpduCount).toBeLessThan(MAX_AMPDU_MPDUS)
  })

  it('every jump target occurs in the batched run', () => {
    for (const j of ampdu.jumps) expect(agg().some(j.find), j.label).toBe(true)
  })
})
