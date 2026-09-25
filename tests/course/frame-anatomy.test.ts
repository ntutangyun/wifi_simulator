/**
 * Every empirical claim of "What a frame says before it says anything"
 * (src/course/tier1/frame-anatomy.ts), measured by decoding this scenario's own
 * frames with decodeFrame / ppduLayout.
 *
 * This is the FIRST half of the old `frame-anatomy`: the header, the addresses
 * and what each field is for. The byte budget, the preamble table, the control
 * frame sizes and the aggregation hooks moved next door with the sentences that
 * carried them — tests/course/frame-anatomy-bytes.test.ts pins those.
 *
 * The scenario builder is unchanged, so `lesson-hashes.json` keeps this
 * lesson's recorded hash; the split's second half is a copy of that line. The
 * `.body!` word-count walk of the old test is retired: `lessonShapeSuite`
 * counts the sections instead.
 */
import { describe, it, expect } from 'vitest'
import {
  frameAnatomy, frameAnatomyScenario, firstLegacyData, firstQosSingle, firstLegacyRetry,
} from '../../src/course/tier1/frame-anatomy'
import { Simulation } from '../../src/engine/simulation'
import type { Block } from '../../src/course/lessonKit'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { decodeFrame, TID_FOR_AC, type Mpdu } from '../../src/model/frameFields'
import { hasFeature } from '../../src/model/caps'
import type { TLRecord } from '../../src/model/records'
import {
  ACK_BYTES, FCS_BYTES, MAC_HDR_BYTES, QOS_HDR_BYTES, SIFS_NS, txTimeNs,
} from '../../src/engine/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { readFileSync, readdirSync } from 'node:fs'
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
const qos = find(firstQosSingle)
const retry = find(firstLegacyRetry)

// The contract every migrated lesson owes, written once in tests/course/kit.ts. The prose
// window is 1200, as decode-thresholds' is: the 2026-09-23 amendment put a six-step procedure
// and its worked frame into `numbers`, and a mechanism is never compressed back out to fit.
lessonShapeSuite(frameAnatomy, { runNs: RUN_NS })

describe('frame-anatomy · the lesson itself', () => {
  it('is the fourth lesson of Wi-Fi Tier 1 and owns the six frame words', () => {
    expect(MODULES[frameAnatomy.module].title).toBe('帧与空口时间')
    expect(frameAnatomy.needs).toEqual(['roles-stack'])
    // the baseline owner table of the readability programme, exactly: six words, so the
    // lesson introduces no other. RA/TA/SA/DA are glossed where they are used instead.
    expect(frameAnatomy.terms!.map((t) => t.term)).toEqual(['MSDU', 'MPDU', 'PPDU', 'FCS', 'CRC', 'QOS'])
  })

  it('the scenario passes the schema and every quiz answer is in range', () => {
    expect(() => ScenarioSchema.parse(frameAnatomy.scenario())).not.toThrow()
    expect(frameAnatomy.variants).toBeUndefined()
    for (const q of frameAnatomy.quiz) expect(q.answer).toBeLessThan(q.options.length)
  })

  it('the three jump targets are the ones this half’s text uses, in order', () => {
    // Step review, Minor: the RTS / A-MPDU / BlockAck buttons are frame-anatomy-bytes'
    // — three acronyms of later lessons on the jump bar of lesson 4. This half keeps
    // only the frames its own text walks the reader through, so the bar is pinned by
    // what each predicate selects out of the run, not by how its button reads.
    expect(frameAnatomy.jumps.length).toBe(3)
    expect(frameAnatomy.jumps.map((j) => records.find(j.find))).toEqual([legacy, qos, retry])
    // and the three really are a legacy data frame, a QoS data frame and a retry
    expect(firstMpdu(legacy.frame).fields.some((f) => f.key === 'qos')).toBe(false)
    expect(firstMpdu(qos.frame).fields.some((f) => f.key === 'qos')).toBe(true)
    expect(bitOf(firstMpdu(retry.frame), 'retry')).toBe('1')
    expect(bitOf(firstMpdu(legacy.frame), 'retry')).toBe('0')
  })

  it('no management frame is transmitted — the deeper note says so', () => {
    // "The simulator does not send them yet: every station here starts associated."
    expect(new Set(txs.map((r) => r.frame.kind))).toEqual(new Set(['data', 'ack', 'rts', 'cts', 'ba']))
  })
})

describe('frame-anatomy · the first legacy data frame', () => {
  const m = firstMpdu(legacy.frame)

  it('is at 0 µs and is a plain Data frame going uphill, with no QoS Control', () => {
    // observation 1: "at 0 µs … a plain Data frame going uphill, with no QoS Control field at all"
    expect(legacy.t).toBe(0)
    expect(m.subtypeName).toBe('Data')
    expect(bitOf(m, 'type')).toBe('10 (Data)')
    expect(bitOf(m, 'subtype')).toBe('0000 (Data)')
    expect(bitOf(m, 'toDs')).toBe('1')
    expect(bitOf(m, 'fromDs')).toBe('0')
    expect(bitOf(m, 'retry')).toBe('0')
    expect(m.fields.some((x) => x.key === 'qos')).toBe(false)
    // the "header, field by field" table, in the order it lists them
    expect(m.fields.map((x) => x.key)).toEqual(['fc', 'duration', 'addr1', 'addr2', 'addr3', 'seqCtl', 'body', 'fcs'])
  })

  it('the address table: Address 1 the Router, Address 2 the Old laptop, Address 3 the far end', () => {
    // "Station → access point: RA = BSSID · TA = SA · DA", and the picture's "the radio that
    // must catch this frame and answer it, the radio that sent it, and the far end"
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
    // the formula "16 µs of silence + a 28 µs answer = 44 µs"
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

describe('frame-anatomy · building one frame, step by step', () => {
  it('the six steps are the order the MAC and the decoder take, with the old laptop’s own values', () => {
    // "Building one frame, step by step" and the table beside it, "The old laptop's first frame,
    //  built that way". The steps follow buildDataFrame (src/engine/mac.ts) and dataMpdu
    //  (src/model/frameFields.ts): kind, direction bits, Duration, addresses, sequence, then
    //  the QoS bytes, the body and the FCS.
    const steps = frameAnatomy.numbers!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!
    expect(steps.items.length).toBe(6)
    const m = firstMpdu(legacy.frame)
    // 1. "a plain Data frame, or QoS Data when both ends mark their traffic"
    expect(m.subtypeName).toBe('Data')
    expect(hasFeature(frameAnatomyScenario().nodes.find((n) => n.id === 'sta-1')!, 'edca')).toBe(false)
    // 2. "going up to the access point they read 1 and 0"
    expect([bitOf(m, 'toDs'), bitOf(m, 'fromDs')]).toEqual(['1', '0'])
    // 3. "the silence and the answer, 16 + 28 = 44 µs"
    expect(SIFS_NS / 1000 + txTimeNs(ACK_BYTES, 24) / 1000).toBe(44)
    expect(field(m, 'duration').value).toBe('44 µs')
    // 4. "Address 1 is the access point (RA), Address 2 the radio that sent it (TA), Address 3
    //     the far end of the journey (DA)" — the Router, the Old laptop and the Router
    expect(field(m, 'addr1').node).toBe('ap')
    expect(field(m, 'addr2').node).toBe('sta-1')
    expect(field(m, 'addr3').node).toBe('ap')
    expect([field(m, 'addr1'), field(m, 'addr2'), field(m, 'addr3')].map((x) => x.roles![0])).toEqual(['RA', 'TA', 'DA'])
    // 5. "a counter … gives out the next value on the first attempt only": the first frame is 0
    expect(legacy.frame.seqNo).toBe(0)
    expect(field(m, 'seqCtl').value).toBe('SN 0 · FN 0')
    expect(bitOf(m, 'retry')).toBe('0')
    // 6. "Then the payload, and last the FCS … 24 + 1500 + 4 = 1528 B"
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

describe('frame-anatomy · the first QoS data frame and the reply', () => {
  const m = firstMpdu(qos.frame)

  it('is the phone\'s uplink at 20.452 ms, with a QoS Control field reading TID 6', () => {
    // observation 1: "then to the first QoS data frame, at 20.452 ms … Duration 44 µs — but the
    //  second has a QoS Control field whose traffic identifier (TID) reads 6."
    expect(qos.t).toBe(20_452_000)
    expect(qos.frame.src).toBe('sta-2')
    expect(m.subtypeName).toBe('QoS Data')
    expect(bitOf(m, 'subtype')).toBe('1000 (QoS Data)')
    expect(bitOf(m, 'toDs')).toBe('1')
    expect(bitOf(m, 'fromDs')).toBe('0')
    expect(field(m, 'qos').bytes).toBe(QOS_HDR_BYTES - MAC_HDR_BYTES)
    expect(field(m, 'qos').value).toBe('TID 6 · Normal Ack')
    expect(qos.frame.durationFieldNs).toBe(44_000)
    // and the same two addresses in the same roles as the plain frame
    expect(field(m, 'addr1').roles).toEqual(['RA', 'BSSID'])
    expect(field(m, 'addr2').roles).toEqual(['TA', 'SA'])
  })

  it('the four kinds of traffic and the mark each one is written with', () => {
    // the table "Four kinds of traffic, four marks": background 1, best effort 0, video 5, voice 6
    expect([...TID_FOR_AC]).toEqual([1, 0, 5, 6])
    // "The phone in this room is on a call, so its frames are marked 6."
    expect(TID_FOR_AC[3]).toBe(6)
  })

  it('the router\'s reply is the "Access point → station" row of the address table', () => {
    const i = txs.indexOf(qos)
    expect(txs[i + 1].frame.kind).toBe('ack')
    const dl = txs[i + 2]
    expect(dl.t).toBe(20_596_600)
    expect(dl.frame.src).toBe('ap')
    expect(dl.frame.dst).toBe('sta-2')
    const d = firstMpdu(dl.frame)
    expect(bitOf(d, 'toDs')).toBe('0')
    expect(bitOf(d, 'fromDs')).toBe('1')
    expect(field(d, 'addr1').node).toBe('sta-2')
    expect(field(d, 'addr1').roles).toEqual(['RA', 'DA'])
    expect(field(d, 'addr2').node).toBe('ap')
    expect(field(d, 'addr2').roles).toEqual(['TA', 'BSSID'])
    expect(field(d, 'addr3').roles).toEqual(['SA'])
  })
})

describe('frame-anatomy · the repeat bit and the counter', () => {
  it('the retransmission at 12.013 ms repeats the counter value of the frame that collided', () => {
    // observation 2, and the picture's "the other numbers each payload, and a repeat keeps its
    //  number, which is how a duplicate is recognised"
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

describe('frame-anatomy · the experiments', () => {
  it('with the phone\'s marking off its frames are plain Data, with no QoS Control', () => {
    const sc = frameAnatomyScenario()
    sc.nodes.find((n) => n.id === 'sta-2')!.caps.features = {}
    const rs = runEdited(sc, 40 * MS)
    const f = rs.find((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.src === 'sta-2')!
    const m = firstMpdu(f.frame, sc)
    expect(m.subtypeName).toBe('Data')
    expect(m.fields.some((x) => x.key === 'qos')).toBe(false)
  })

  it('as a Wi-Fi 5 device the old laptop marks its uploads 0 — best effort', () => {
    const sc = frameAnatomyScenario()
    const old = sc.nodes.find((n) => n.id === 'sta-1')!
    old.caps.generation = 'vht'
    old.caps.features = { edca: true, ampdu: true, txop: true }
    const rs = runEdited(sc, 40 * MS)
    const agg = rs.find((r): r is Tx => r.type === 'TX_START' && r.frame.src === 'sta-1' && r.frame.ampdu !== undefined)!
    const m = decode(agg.frame, sc).users[0].subframes[0].mpdu
    expect(m.subtypeName).toBe('QoS Data')
    expect(field(m, 'qos').value).toContain('TID 0')
    expect(TID_FOR_AC[1]).toBe(0)
  })
})

describe('frame-anatomy · the FCS is a field, not a test this engine runs', () => {
  // Whole-track review I2: the picture used to say "the receiver does the same and compares",
  // and quiz 2 asked what the receiver does when "the arithmetic does not match" — an event
  // this simulator cannot produce. Nothing in the engine computes a CRC over an MPDU;
  // channel.ts decides a reception by its worst SINR against the rung's requirement, and the
  // only failure reasons a reader can ever see are the ones that ratio produces.
  it('no engine file computes a CRC, and FCS_BYTES is only a byte count', () => {
    const dir = new URL('../../src/engine/', import.meta.url)
    for (const f of readdirSync(dir)) {
      // ampBs.ts carries crc16Epc for AMP tag ids, which is not an 802.11 MPDU check.
      if (!f.endsWith('.ts') || f === 'ampBs.ts') continue
      // Comments stripped: amp.ts names a CRC-8 when it counts the bytes of an AMP-ACK,
      // which is a byte count in a note, not arithmetic this engine ever runs.
      const src = readFileSync(new URL(f, dir), 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')
      expect(src.match(/crc/gi), `${f} computes a CRC`).toBeNull()
    }
    expect(FCS_BYTES).toBe(4)
  })

  it('every reception that fails in this run failed on the ratio, not on a check', () => {
    const reasons = new Set(ofType(records, 'RX_FAIL').map((r) => r.reason))
    for (const r of reasons) expect(['collision', 'lowSinr', 'txDuringRx', 'capture']).toContain(r)
  })
})
