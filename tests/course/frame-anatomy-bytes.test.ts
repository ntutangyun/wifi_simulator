/**
 * Every empirical claim of "What a frame costs on the air"
 * (src/course/tier1/frame-anatomy-bytes.ts), measured against the lesson's own
 * scenario — the same scene `frame-anatomy` loads, so the split costs the
 * reader nothing and the recorded hashes are the same run twice.
 *
 * The preamble table, the airtime formula, the byte sums, the control-frame
 * sizes, the aggregate and the reservation durations moved here from
 * tests/course/frame-anatomy.test.ts, each with the sentence it guards.
 */
import { describe, it, expect } from 'vitest'
import { frameAnatomyBytes } from '../../src/course/tier1/frame-anatomy-bytes'
import {
  frameAnatomyScenario, firstLegacyData, firstQosSingle, firstRtsFrame, firstAmpduFrame,
  firstBlockAck,
} from '../../src/course/tier1/frame-anatomy'
import { Simulation } from '../../src/engine/simulation'
import type { Block } from '../../src/course/lessonKit'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { decodeFrame, ppduLayout, type Mpdu } from '../../src/model/frameFields'
import { hasFeature } from '../../src/model/caps'
import type { TLRecord } from '../../src/model/records'
import {
  ACK_BYTES, BA_BYTES, CTS_BYTES, FCS_BYTES, MAC_HDR_BYTES, PHY_MODES, QOS_HDR_BYTES,
  RTS_BYTES, SIFS_NS, txTimeNs,
} from '../../src/engine/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
const RUN_NS = 30 * MS
type Tx = Extract<TLRecord, { type: 'TX_START' }>

/** This lesson's records, from the kit's shared memo: frame-anatomy's scene. */
const records = runOf(frameAnatomyBytes, undefined, RUN_NS)
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

const legacy = find(firstLegacyData)
const qos = find(firstQosSingle)
const rts = find(firstRtsFrame)
const ampdu = find(firstAmpduFrame)
const ba = find(firstBlockAck)
const cts = txs.find((r) => r.frame.kind === 'cts')!

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
// `sameSceneAs` is the split rule: this lesson loads frame-anatomy's scene, so
// its recorded timeline hash is frame-anatomy's, value for value.
lessonShapeSuite(frameAnatomyBytes, { runNs: RUN_NS, sameSceneAs: 'frame-anatomy' })

describe('frame-anatomy-bytes · the lesson itself', () => {
  it('is the second half of frame-anatomy and owns the four preamble words', () => {
    expect(MODULES[frameAnatomyBytes.module].title).toBe('帧与空口时间')
    expect(frameAnatomyBytes.needs).toEqual(['frame-anatomy'])
    // the baseline owner table of the readability programme: the preamble fields, taught as
    // "the part every radio can read".
    // Whole-track review I5: one name for the fixed head of a frame, owned by the lesson
    // that counts its microseconds. `preamble` was a term of airtime and is now here.
    expect(frameAnatomyBytes.terms!.map((t) => t.term)).toEqual(['L-STF', 'L-LTF', 'L-SIG', 'preamble', 'U-SIG'])
  })

  it('loads frame-anatomy\'s own scene, with no variant of its own', () => {
    expect(frameAnatomyBytes.scenario()).toEqual(frameAnatomyScenario())
    expect(frameAnatomyBytes.variants).toBeUndefined()
    expect(() => ScenarioSchema.parse(frameAnatomyBytes.scenario())).not.toThrow()
    for (const q of frameAnatomyBytes.quiz) expect(q.answer).toBeLessThan(q.options.length)
  })
})

describe('frame-anatomy-bytes · what goes in front', () => {
  it('802.11a: 16 µs of L-STF and L-LTF, then 4 µs of L-SIG, then 4 µs symbols', () => {
    // the table's first row, and the picture's "a short repeating pattern … then the L-LTF …
    //  The L-SIG tells it two things"
    expect(PHY_MODES.nonht.preambleNs).toBe(20_000)
    expect(PHY_MODES.nonht.symNs).toBe(4_000)
    const segs = ppduLayout(legacy.frame)
    expect(segs.map((s) => [s.key, s.durNs])).toEqual([
      ['legacyPreamble', 16_000], ['signal', 4_000], ['data', 228_000],
    ])
    expect(segs[2].symbols).toBe(57)
  })

  it('the newer rows: 40, 44 and 48 µs, and a 13.6 µs symbol from Wi-Fi 6 on', () => {
    expect(PHY_MODES.vht.preambleNs).toBe(40_000)
    expect(PHY_MODES.he.preambleNs).toBe(44_000)
    expect(PHY_MODES.eht.preambleNs).toBe(48_000)
    // "and 4 µs more in a frame shared by several devices"
    expect(PHY_MODES.he.muExtraPreambleNs).toBe(4_000)
    expect(PHY_MODES.eht.muExtraPreambleNs).toBe(4_000)
    expect(PHY_MODES.he.symNs).toBe(13_600)
    expect(PHY_MODES.eht.symNs).toBe(13_600)
  })

  it('the phone\'s Wi-Fi 6 frame really is a 44 µs front and one 13.6 µs symbol', () => {
    // observation 1: "the phone's Wi-Fi 6 frame is a 44 µs front and one 13.6 µs symbol"
    expect(qos.frame.mode).toBe('he')
    const segs = ppduLayout(qos.frame)
    expect(segs.map((s) => [s.key, s.durNs])).toEqual([['preamble', 44_000], ['data', 13_600]])
    expect(segs[1].symbols).toBe(1)
    expect(qos.frame.txTimeNs).toBe(57_600)
  })
})

describe('frame-anatomy-bytes · counting the bytes', () => {
  it('24 + 1500 + 4 = 1528 B, and 26 + 1500 + 4 = 1530 B with the mark', () => {
    expect(MAC_HDR_BYTES + 1500 + FCS_BYTES).toBe(1528)
    expect(QOS_HDR_BYTES + 1500 + FCS_BYTES).toBe(1530)
    expect(legacy.frame.bytes).toBe(1528)
    expect(firstMpdu(legacy.frame).bytes).toBe(1528)
    expect(legacy.frame.mbps).toBe(54)
  })

  it('both fill 57 symbols at 54 Mb/s and both take 248 µs', () => {
    // the formula note, and the deeper derivation ⌈(16 + 12 224 + 6) ÷ 216⌉ = 57
    expect(txTimeNs(1528, 54)).toBe(248_000)
    expect(txTimeNs(1530, 54)).toBe(248_000)
    expect(Math.ceil((16 + 8 * 1528 + 6) / 216)).toBe(57)
    expect(8 * 1528).toBe(12_224)
    expect(20_000 + 57 * 4_000).toBe(248_000)
    expect(legacy.frame.txTimeNs).toBe(248_000)
  })

  it('a 14 B answer at 24 Mb/s fills two symbols: 28 µs, of which 20 µs is front', () => {
    expect(ACK_BYTES).toBe(14)
    expect(Math.ceil((16 + 8 * ACK_BYTES + 6) / 96)).toBe(2)
    expect(txTimeNs(ACK_BYTES, 24)).toBe(28_000)
    expect(20_000 + 2 * 4_000).toBe(28_000)
  })
})

describe('frame-anatomy-bytes · from bytes to microseconds', () => {
  it('the six steps are txTimeModeNs itself, with the old laptop’s frame in them', () => {
    // "From bytes to microseconds, step by step" and the table beside it. The steps are the
    // body of txTimeModeNs (src/engine/phy.ts): bytes → bits + 16 + 6 → ÷ N_DBPS, rounded up
    // → preamble + symbols × symNs.
    const steps = frameAnatomyBytes.numbers!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!
    expect(steps.items.length).toBe(6)
    // 1. "24 + 1500 + 4 = 1528 B for the old laptop"
    const bytes = MAC_HDR_BYTES + 1500 + FCS_BYTES
    expect(bytes).toBe(1528)
    expect(legacy.frame.bytes).toBe(bytes)
    // 2. "16 + 8 × 1528 + 6 bits" — the table's 12 246
    const bits = 16 + 8 * bytes + 6
    expect(bits).toBe(12_246)
    // 3. "216 bits at 54 Mb/s … 57 symbols"
    expect(PHY_MODES.nonht.ndbps[PHY_MODES.nonht.mbps.indexOf(54)]).toBe(216)
    expect(Math.ceil(bits / 216)).toBe(57)
    // 4. "20 µs, then 57 × 4 µs, which is 248 µs"
    expect(PHY_MODES.nonht.preambleNs + 57 * PHY_MODES.nonht.symNs).toBe(248_000)
    expect(legacy.frame.txTimeNs).toBe(248_000)
    // 5. "a 44 or 48 µs front, and a symbol of 13.6 µs"
    expect([PHY_MODES.he.preambleNs, PHY_MODES.eht.preambleNs]).toEqual([44_000, 48_000])
    expect(PHY_MODES.he.symNs).toBe(13_600)
    // 6. "1530 B, and step 3 still rounds up to 57 symbols"
    expect(QOS_HDR_BYTES + 1500 + FCS_BYTES).toBe(1530)
    expect(Math.ceil((16 + 8 * 1530 + 6) / 216)).toBe(57)
    expect(txTimeNs(1530, 54)).toBe(248_000)
  })

  it('the procedure reproduces the airtime of every frame the run puts on the air', () => {
    // Proving the steps rather than the one row: run 1 to 4 by hand for each PPDU, in the mode
    // and at the MCS it was sent with, and land on the txTimeNs the engine recorded.
    const seen = new Set<string>()
    for (const r of txs) {
      const f = r.frame
      const mode = f.mode ?? 'nonht'
      const m = PHY_MODES[mode]
      const mcs = f.mcs ?? m.mbps.indexOf(f.mbps)
      const nsym = Math.ceil((16 + 8 * f.bytes + 6) / m.ndbps[mcs])
      expect(m.preambleNs + nsym * m.symNs, `${f.kind} ${f.bytes} B at ${f.mbps} Mb/s`).toBe(f.txTimeNs)
      seen.add(mode)
    }
    expect([...seen].sort()).toEqual(['he', 'nonht', 'vht'])
  })
})

describe('frame-anatomy-bytes · the small frames', () => {
  it('an answer and a go-ahead are 14 B and carry no sender address', () => {
    const am = firstMpdu(txs.find((r) => r.frame.kind === 'ack')!.frame)
    expect(am.fields.map((x) => x.key)).toEqual(['fc', 'duration', 'addr1', 'fcs'])
    expect(am.bytes).toBe(ACK_BYTES)
    expect(cts.frame.bytes).toBe(CTS_BYTES)
    expect(CTS_BYTES).toBe(14)
    const cm = firstMpdu(cts.frame)
    expect(cm.fields.map((x) => x.key)).toEqual(['fc', 'duration', 'addr1', 'fcs'])
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
})

describe('frame-anatomy-bytes · many frames behind one front', () => {
  it('fourteen frames: 13 × 1536 + 1534 = 21 502 B, one 4 B delimiter each, padding but the last', () => {
    expect(ampdu.frame.retryFlag).toBeFalsy()
    expect(ampdu.frame.ampdu!.mpduCount).toBe(14)
    expect(ampdu.frame.bytes).toBe(21_502)
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

  it('the reservation table: 2356, 2312, 48 and 0 µs, each covering what it says', () => {
    // "the go-ahead, the burst, the reply and three gaps" · "the same reservation, less one gap
    //  and itself" · "one gap and the reply that follows it" · "nothing follows it"
    expect(rts.t).toBe(2_298_000)
    expect(rts.frame.durationFieldNs).toBe(2_356_000)
    expect(28_000 + ampdu.frame.txTimeNs + 32_000 + 3 * SIFS_NS).toBe(2_356_000)
    expect(cts.frame.durationFieldNs).toBe(2_312_000)
    expect(rts.frame.durationFieldNs - SIFS_NS - cts.frame.txTimeNs).toBe(2_312_000)
    expect(cts.frame.txTimeNs).toBe(28_000)
    expect(ampdu.frame.durationFieldNs).toBe(48_000)
    expect(SIFS_NS + 32_000).toBe(48_000)
    expect(ba.t).toBe(4_650_000)
    expect(ba.frame.durationFieldNs).toBe(0)
    expect(ba.frame.txTimeNs).toBe(32_000)
  })

  it('the deeper note: inside an aggregate the same two bits mean Implicit BAR', () => {
    const m = decode(ampdu.frame).users[0].subframes[0].mpdu
    expect(field(m, 'qos').value).toBe('TID 1 · Implicit BAR')
    // against 'Normal Ack' on a lone frame, pinned next door on the phone's QoS Data
    expect(field(firstMpdu(qos.frame), 'qos').value).toContain('Normal Ack')
  })
})

describe('frame-anatomy-bytes · the experiments', () => {
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
