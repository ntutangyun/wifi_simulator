/**
 * Every number the "Frame anatomy" lesson quotes, pinned against the engine:
 * the scenario is run, the jump-target frames are decoded with decodeFrame /
 * ppduLayout, and the field values, byte sums, airtimes and address roles the
 * prose names are asserted. Also the stated duration and the jump targets.
 */
import { describe, it, expect } from 'vitest'
import {
  frameAnatomy, frameAnatomyScenario, firstLegacyData, firstQosSingle, firstRtsFrame,
  firstAmpduFrame, firstBlockAck, firstLegacyRetry,
} from '../../src/course/tier1/frame-anatomy'
import type { Block, L10n } from '../../src/course/lessonKit'
import { Simulation } from '../../src/engine/simulation'
import { decodeFrame, ppduLayout, TID_FOR_AC, type Mpdu } from '../../src/model/frameFields'
import { hasFeature } from '../../src/model/caps'
import type { Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import {
  ACK_BYTES, BA_BYTES, CTS_BYTES, FCS_BYTES, MAC_HDR_BYTES, PHY_MODES, QOS_HDR_BYTES,
  RTS_BYTES, SIFS_NS, txTimeNs,
} from '../../src/engine/phy'

const MS = 1_000_000
type Tx = Extract<TLRecord, { type: 'TX_START' }>

function run(sc: Scenario, ns: number): TLRecord[] {
  return [...new Simulation(sc).runUntil(ns).records]
}
const records = run(frameAnatomyScenario(), 21 * MS)
const txs = records.filter((r): r is Tx => r.type === 'TX_START')
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
const field = (m: Mpdu, key: string) => m.fields.find((x) => x.key === key)!
const bitOf = (m: Mpdu, key: string) => field(m, 'fc').bits!.find((b) => b.key === key)!.value

const legacy = find(firstLegacyData)
const qos = find(firstQosSingle)
const rts = find(firstRtsFrame)
const ampdu = find(firstAmpduFrame)
const ba = find(firstBlockAck)
const retry = find(firstLegacyRetry)
const cts = txs.find((r) => r.frame.kind === 'cts')!

describe('lesson shape', () => {
  it('every jump target occurs within the first 21 ms', () => {
    for (const j of frameAnatomy.jumps) expect(records.some(j.find), j.label.en).toBe(true)
    expect(frameAnatomy.jumps.map((j) => j.label.en)).toEqual([
      'first legacy data frame', 'first QoS data frame', 'first RTS',
      'first A-MPDU', 'first BlockAck', 'first retransmission (Retry = 1)',
    ])
  })

  it('minutes = round-to-5 of EN words ÷ 150 + 5 per observe + 5 per try-this', () => {
    const texts: string[] = [frameAnatomy.title.en]
    const push = (x?: L10n) => { if (x) texts.push(x.en) }
    for (const b of frameAnatomy.body as Block[]) {
      push(b.heading)
      if (b.kind === 'table') { for (const h of b.head) push(h); for (const row of b.rows) for (const c of row) push(c) }
      else if (b.kind === 'list' || b.kind === 'steps') for (const i of b.items) push(i)
      else if (b.kind === 'widget') push(b.caption)
      else { push(b.text); if (b.kind === 'formula') push(b.note) }
    }
    for (const o of frameAnatomy.observe) push(o)
    for (const t of frameAnatomy.tryThis) push(t)
    for (const q of frameAnatomy.quiz) { push(q.q); for (const o of q.options) push(o); push(q.explain) }
    const words = texts.join(' ').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length
    const raw = words / 150 + 5 * frameAnatomy.observe.length + 5 * frameAnatomy.tryThis.length
    expect(frameAnatomy.minutes).toBe(Math.round(raw / 5) * 5)
  })

  it('no management frame is transmitted — the lesson says so', () => {
    expect(new Set(txs.map((r) => r.frame.kind))).toEqual(new Set(['data', 'ack', 'rts', 'cts', 'ba']))
  })
})

describe('PHY layer values quoted in the prose', () => {
  it('the non-HT preamble is 16 µs + a 4 µs SIGNAL, and symbols are 4 µs', () => {
    expect(PHY_MODES.nonht.preambleNs).toBe(20_000)
    expect(PHY_MODES.nonht.symNs).toBe(4_000)
    const segs = ppduLayout(legacy.frame)
    expect(segs.map((s) => [s.key, s.durNs])).toEqual([
      ['legacyPreamble', 16_000], ['signal', 4_000], ['data', 228_000],
    ])
    expect(segs[2].symbols).toBe(57)
  })

  it('the newer preambles are the values the table quotes', () => {
    expect(PHY_MODES.vht.preambleNs).toBe(40_000)
    expect(PHY_MODES.he.preambleNs).toBe(44_000)
    expect(PHY_MODES.he.muExtraPreambleNs).toBe(4_000)
    expect(PHY_MODES.eht.preambleNs).toBe(48_000)
    expect(PHY_MODES.eht.muExtraPreambleNs).toBe(4_000)
    expect(PHY_MODES.he.symNs).toBe(13_600)
    expect(PHY_MODES.eht.symNs).toBe(13_600)
  })

  it('the Wi-Fi 6 phone’s frame is a 44 µs preamble plus one 13.6 µs symbol', () => {
    expect(qos.frame.mode).toBe('he')
    const segs = ppduLayout(qos.frame)
    expect(segs.map((s) => [s.key, s.durNs])).toEqual([['preamble', 44_000], ['data', 13_600]])
    expect(segs[1].symbols).toBe(1)
    expect(qos.frame.txTimeNs).toBe(57_600)
  })

  it('TXTIME: 1528 B and 1530 B both take 57 symbols at 54 Mb/s; a 14 B ACK takes 2 at 24 Mb/s', () => {
    expect(txTimeNs(1528, 54)).toBe(248_000)
    expect(txTimeNs(1530, 54)).toBe(248_000)
    expect(Math.ceil((16 + 8 * 1528 + 6) / 216)).toBe(57)
    expect(txTimeNs(ACK_BYTES, 24)).toBe(28_000)
    expect(Math.ceil((16 + 8 * ACK_BYTES + 6) / 96)).toBe(2)
  })
})

describe('the first legacy data frame (jump 1)', () => {
  const m = firstMpdu(legacy.frame)

  it('is at 0 µs, 1528 B = 24 + 1500 + 4, 248 µs at 54 Mb/s', () => {
    expect(legacy.t).toBe(0)
    expect(legacy.frame.bytes).toBe(1528)
    expect(MAC_HDR_BYTES + 1500 + FCS_BYTES).toBe(1528)
    expect(m.bytes).toBe(1528)
    expect(legacy.frame.mbps).toBe(54)
    expect(legacy.frame.txTimeNs).toBe(248_000)
  })

  it('is Data (0000) with To DS 1, From DS 0 and no QoS Control', () => {
    expect(m.subtypeName).toBe('Data')
    expect(bitOf(m, 'type')).toBe('10 (Data)')
    expect(bitOf(m, 'subtype')).toBe('0000 (Data)')
    expect(bitOf(m, 'toDs')).toBe('1')
    expect(bitOf(m, 'fromDs')).toBe('0')
    expect(bitOf(m, 'retry')).toBe('0')
    expect(m.fields.some((x) => x.key === 'qos')).toBe(false)
    expect(m.fields.map((x) => x.key)).toEqual(['fc', 'duration', 'addr1', 'addr2', 'addr3', 'seqCtl', 'body', 'fcs'])
  })

  it('uplink address roles: A1 Router RA = BSSID, A2 Old laptop TA = SA, A3 DA', () => {
    expect(field(m, 'addr1').node).toBe('ap')
    expect(field(m, 'addr1').roles).toEqual(['RA', 'BSSID'])
    expect(field(m, 'addr2').node).toBe('sta-1')
    expect(field(m, 'addr2').roles).toEqual(['TA', 'SA'])
    expect(field(m, 'addr3').roles).toEqual(['DA'])
    for (const k of ['addr1', 'addr2', 'addr3'] as const) expect(field(m, k).bytes).toBe(6)
    expect(m.fields.some((x) => x.key === 'addr4' as never)).toBe(false)
  })

  it('carries Duration 44 µs = SIFS + the 28 µs ACK, and is answered by a 14 B ACK', () => {
    expect(legacy.frame.durationFieldNs).toBe(44_000)
    expect(SIFS_NS + txTimeNs(ACK_BYTES, 24)).toBe(44_000)
    expect(field(m, 'duration').value).toBe('44 µs')
    const ack = txs.find((r) => r.frame.kind === 'ack' && r.frame.dst === 'sta-1')!
    expect(ack.frame.bytes).toBe(ACK_BYTES)
    expect(ack.frame.txTimeNs).toBe(28_000)
    expect(ack.frame.durationFieldNs).toBe(0)
    const am = firstMpdu(ack.frame)
    expect(am.fields.map((x) => x.key)).toEqual(['fc', 'duration', 'addr1', 'fcs'])
    expect(field(am, 'addr1').roles).toEqual(['RA'])
  })
})

describe('the first QoS data frame (jump 2)', () => {
  const m = firstMpdu(qos.frame)

  it('is the phone’s uplink at 20.452 ms: QoS Data (1000), 230 B = 26 + 200 + 4, TID 6, Duration 44 µs', () => {
    expect(qos.t).toBe(20_452_000)
    expect(qos.frame.src).toBe('sta-2')
    expect(qos.frame.bytes).toBe(230)
    expect(QOS_HDR_BYTES + 200 + FCS_BYTES).toBe(230)
    expect(m.subtypeName).toBe('QoS Data')
    expect(bitOf(m, 'subtype')).toBe('1000 (QoS Data)')
    expect(bitOf(m, 'toDs')).toBe('1')
    expect(bitOf(m, 'fromDs')).toBe('0')
    expect(field(m, 'qos').bytes).toBe(QOS_HDR_BYTES - MAC_HDR_BYTES)
    expect(field(m, 'qos').value).toBe('TID 6 · Normal Ack')
    expect(TID_FOR_AC[3]).toBe(6)
    expect(qos.frame.durationFieldNs).toBe(44_000)
  })

  it('the TID table matches Table 10-1 as the simulator writes it', () => {
    expect([...TID_FOR_AC]).toEqual([1, 0, 5, 6])
  })

  it('two frames later the router answers with From DS 1 and the reversed roles', () => {
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

describe('RTS, CTS, A-MPDU and BlockAck (jumps 3–5)', () => {
  it('the first RTS is at 2.298 ms, 20 B, Duration 2356 µs = CTS + A-MPDU + BlockAck + 3 SIFS', () => {
    expect(rts.t).toBe(2_298_000)
    expect(rts.frame.bytes).toBe(RTS_BYTES)
    expect(RTS_BYTES).toBe(20)
    expect(rts.frame.durationFieldNs).toBe(2_356_000)
    expect(28_000 + ampdu.frame.txTimeNs + 32_000 + 3 * SIFS_NS).toBe(2_356_000)
    const m = firstMpdu(rts.frame)
    expect(m.subtypeName).toBe('RTS')
    expect(bitOf(m, 'subtype')).toBe('1011 (RTS)')
    expect(m.fields.map((x) => x.key)).toEqual(['fc', 'duration', 'addr1', 'addr2', 'fcs'])
    expect(field(m, 'addr1').roles).toEqual(['RA'])
    expect(field(m, 'addr2').roles).toEqual(['TA'])
    expect(m.bytes).toBe(20)
  })

  it('the CTS is 14 B and carries 2312 µs — the RTS reservation minus SIFS and its own airtime', () => {
    expect(cts.frame.bytes).toBe(CTS_BYTES)
    expect(cts.frame.durationFieldNs).toBe(2_312_000)
    expect(rts.frame.durationFieldNs - SIFS_NS - cts.frame.txTimeNs).toBe(2_312_000)
    expect(cts.frame.txTimeNs).toBe(28_000)
    const m = firstMpdu(cts.frame)
    expect(m.fields.map((x) => x.key)).toEqual(['fc', 'duration', 'addr1', 'fcs'])
    expect(bitOf(m, 'subtype')).toBe('1100 (CTS)')
  })

  it('the first A-MPDU is a first transmission: 14 subframes, 21 502 B, TID 1, Implicit BAR, Duration 48 µs', () => {
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
      expect(QOS_HDR_BYTES + 1500 + FCS_BYTES).toBe(1530)
      expect(sf.padBytes).toBe(i === 13 ? 0 : 2)
    }
    const m = u.subframes[0].mpdu
    expect(field(m, 'qos').value).toBe('TID 1 · Implicit BAR')
    expect(TID_FOR_AC[0]).toBe(1)
    expect(ampdu.frame.durationFieldNs).toBe(48_000)
    expect(SIFS_NS + 32_000).toBe(48_000)
    expect(ampdu.frame.txTimeNs).toBe(2_248_000)
  })

  it('the first BlockAck is at 4.650 ms, 32 B of compressed bitmap, Duration 0', () => {
    expect(ba.t).toBe(4_650_000)
    expect(ba.frame.bytes).toBe(BA_BYTES)
    expect(BA_BYTES).toBe(32)
    expect(ba.frame.durationFieldNs).toBe(0)
    expect(ba.frame.txTimeNs).toBe(32_000)
    const m = firstMpdu(ba.frame)
    expect(m.fields.map((x) => x.key)).toEqual(['fc', 'duration', 'addr1', 'addr2', 'baControl', 'baInfo', 'fcs'])
    expect(field(m, 'baControl').bytes).toBe(2)
    expect(field(m, 'baInfo').bytes).toBe(10) // 2 B starting sequence number + an 8 B (64-bit) bitmap
    expect(field(m, 'baControl').value).toBe('Compressed')
    expect(m.bytes).toBe(32)
  })
})

describe('the first retransmission (jump 6)', () => {
  it('is at 12.013 ms with Retry = 1 and the sequence number of the frame that collided', () => {
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
})

describe('try this', () => {
  it('with EDCA off the phone sends plain Data frames of 228 B, with no QoS Control', () => {
    const sc = frameAnatomyScenario()
    const phone = sc.nodes.find((n) => n.id === 'sta-2')!
    phone.caps.features = {}
    const rs = run(sc, 40 * MS)
    const f = rs.find((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.src === 'sta-2')!
    expect(f.frame.bytes).toBe(228)
    expect(MAC_HDR_BYTES + 200 + FCS_BYTES).toBe(228)
    const m = firstMpdu(f.frame, sc)
    expect(m.subtypeName).toBe('Data')
    expect(m.fields.some((x) => x.key === 'qos')).toBe(false)
  })

  it('as a Wi-Fi 5 device the old laptop uploads RTS-protected A-MPDUs with TID 0', () => {
    const sc = frameAnatomyScenario()
    const old = sc.nodes.find((n) => n.id === 'sta-1')!
    old.caps.generation = 'vht'
    old.caps.features = { edca: true, ampdu: true, txop: true }
    const rs = run(sc, 40 * MS)
    const agg = rs.find((r): r is Tx => r.type === 'TX_START' && r.frame.src === 'sta-1' && r.frame.ampdu !== undefined)!
    expect(agg.frame.bytes).toBeGreaterThan(sc.rtsThresholdBytes)
    const m = decode(agg.frame, sc).users[0].subframes[0].mpdu
    expect(m.subtypeName).toBe('QoS Data')
    expect(field(m, 'qos').value).toContain('TID 0')
    const before = rs.filter((r): r is Tx => r.type === 'TX_START' && r.t < agg.t && r.frame.src === 'sta-1')
    expect(before[before.length - 1].frame.kind).toBe('rts')
  })
})
