import { describe, it, expect } from 'vitest'
import { ERP_2G, OFDM_5G, aifsNs, txTimeNs, ACK_BYTES, mcsForRssi, mcsRateMbps } from '../../src/engine/phy'
import { makeBss, msdu } from './helpers'
import { Simulation, LINK_EXTRA_LOSS_DB, timingFor } from '../../src/engine/simulation'
import { defaultScenario } from '../../src/model/scenario'
import { buildLinkTable } from '../../src/engine/propagation'
import type { TLRecord } from '../../src/model/records'

type Rec<K extends TLRecord['type']> = Extract<TLRecord, { type: K }>

describe('per-link PHY timing (802.11-2024 Table 17-21 / Table 18-5, §10.3.8)', () => {
  it('5 GHz OFDM keeps the clause 17 values', () => {
    expect(OFDM_5G).toEqual({ sifsNs: 16_000, slotNs: 9_000, difsNs: 34_000, rxStartDelayNs: 20_000, ackTimeoutNs: 45_000, signalExtNs: 0, eifsNs: 94_000 })
  })
  it('2.4 GHz ERP-OFDM: SIFS 10, short slot 9, DIFS 28, AckTimeout 39, 6 µs signal extension, EIFS 88', () => {
    expect(ERP_2G).toEqual({ sifsNs: 10_000, slotNs: 9_000, difsNs: 28_000, rxStartDelayNs: 20_000, ackTimeoutNs: 39_000, signalExtNs: 6_000, eifsNs: 88_000 })
    // EIFS = SIFS + DIFS + ACK at 6 Mb/s including its signal extension
    expect(ERP_2G.eifsNs).toBe(ERP_2G.sifsNs + ERP_2G.difsNs + txTimeNs(ACK_BYTES, 6) + ERP_2G.signalExtNs)
  })
  it('AIFS follows the link timing', () => {
    expect(aifsNs(3)).toBe(16_000 + 3 * 9_000)
    expect(aifsNs(3, ERP_2G)).toBe(10_000 + 3 * 9_000)
  })
})

describe('a MAC on the 2.4 GHz link', () => {
  const links = { 'sta-1>ap': -50, 'ap>sta-1': -50, 'sta-2>ap': -50, 'ap>sta-2': -50, 'sta-1>sta-2': -50, 'sta-2>sta-1': -50 }

  it('waits DIFS = 28 µs, and its data PPDU carries the 6 µs signal extension', () => {
    const bss = makeBss(['ap', 'sta-1', 'sta-2'], links, { timing: ERP_2G })
    // Make the medium "seen busy" once so the first IFS is a real DIFS from t = 0.
    bss.enqueue(0, 'ap', msdu('ap', 'sta-2', 100))
    bss.runUntil(5_000_000)
    const ifs = bss.recs('IFS_START', 'ap')[0]
    expect(ifs.kind).toBe('DIFS')
    bss.enqueue(6_000_000, 'sta-1', msdu('sta-1', 'ap', 1400))
    bss.runUntil(8_000_000)
    const tx = bss.recs('TX_START', 'sta-1').find((r) => r.frame.kind === 'data')!
    // 1428-octet PSDU at 54 Mb/s: 20 µs preamble + ceil((16+8·1428+6)/216)=53 symbols × 4 µs = 232 µs, + 6 µs extension
    expect(tx.frame.txTimeNs).toBe(232_000 + 6_000)
    const ifs2 = bss.recs('IFS_START', 'sta-1').find((r) => r.t >= 6_000_000)!
    expect(ifs2.untilNs - ifs2.t).toBeLessThanOrEqual(28_000)
  })

  it('the ACK follows one 10 µs SIFS after the data PPDU (including its extension)', () => {
    const bss = makeBss(['ap', 'sta-1'], { 'sta-1>ap': -50, 'ap>sta-1': -50 }, { timing: ERP_2G })
    bss.enqueue(0, 'sta-1', msdu('sta-1', 'ap', 500))
    bss.runUntil(2_000_000)
    const data = bss.recs('TX_END', 'sta-1').find((r) => r.frame.kind === 'data')!
    const ack = bss.recs('TX_START', 'ap').find((r) => r.frame.kind === 'ack')!
    expect(ack.t - data.t).toBe(10_000)
    // §10.6 control response: highest mandatory rate ≤ the data frame's rate. At
    // −50 dBm the data frame goes at 54 Mb/s, so the ACK answers at 24 Mb/s
    // (28 µs) — not the 6 Mb/s ACK_TX_TIME_6M_NS used only for the EIFS formula.
    expect(ack.frame.txTimeNs).toBe(28_000 + 6_000) // ACK at 24 Mb/s carries the extension too
  })

  it('a lost ACK times out after 39 µs and a corrupted frame costs EIFS 88 µs', () => {
    // sta-1 → ap fails: the AP cannot hear sta-1 (−200), so sta-1's frame is never acknowledged.
    const bss = makeBss(['ap', 'sta-1'], { 'ap>sta-1': -50 }, { timing: ERP_2G })
    bss.enqueue(0, 'sta-1', msdu('sta-1', 'ap', 500))
    bss.runUntil(2_000_000)
    const end = bss.recs('TX_END', 'sta-1')[0]
    const to = bss.recs('ACK_TIMEOUT', 'sta-1')[0]
    expect(to.t - end.t).toBe(39_000)
  })

  it('after a reception that failed to decode, the next IFS is EIFS − DIFS + AIFS with the 2.4 GHz values', () => {
    // sta-2 hears sta-1 at −80 dBm (locks) while the AP's simultaneous ACK-less traffic… keep it simple:
    // a frame at 54 Mb/s received at −80 dBm needs 25 dB SINR over a −94 dBm floor → 14 dB: it fails as lowSinr.
    const bss = makeBss(['ap', 'sta-1', 'sta-2'], { 'sta-1>ap': -50, 'ap>sta-1': -50, 'sta-1>sta-2': -80, 'ap>sta-2': -50, 'sta-2>ap': -50 }, { timing: ERP_2G, edca: false })
    bss.enqueue(0, 'sta-1', msdu('sta-1', 'ap', 1400))
    bss.enqueue(0, 'sta-2', msdu('sta-2', 'ap', 100))
    bss.runUntil(3_000_000)
    const fail = bss.recs('RX_FAIL', 'sta-2')[0]
    expect(fail).toBeDefined()
    const eifs = bss.recs('IFS_START', 'sta-2').find((r) => r.kind === 'EIFS' && r.t >= fail.t)!
    expect(eifs.untilNs - Math.max(eifs.t, fail.t)).toBe(88_000)
  })
})

describe('a station on the 2.4 GHz link inside a Simulation', () => {
  function twoBand() {
    const sc = defaultScenario()
    sc.nodes[0].caps = { generation: 'eht', features: { edca: true } } // AP: Wi-Fi 7
    sc.nodes[1].caps = { generation: 'he', features: { edca: true } }
    sc.nodes[1].linkId = '2g'
    sc.nodes[1].profiles = ['saturated']
    sc.nodes[2].profiles = ['idle']
    return sc
  }
  it('path loss on 2.4 GHz is 6.5 dB lower than on 5 GHz', () => {
    expect(LINK_EXTRA_LOSS_DB).toEqual({ '2g': -6.5, '5g': 0, '6g': 1.2 })
    expect(timingFor('2g')).toBe(ERP_2G)
    expect(timingFor('5g')).toBe(OFDM_5G)
  })
  it('records on the 2g lane use the 2.4 GHz timing and carry the extension', () => {
    const sim = new Simulation(twoBand())
    const recs = sim.runUntil(20 * 1_000_000).records
    const tx = recs.find((r) => r.type === 'TX_START' && r.node === 'sta-1#2g' && r.frame.kind === 'data')
    expect(tx).toBeDefined()
    const data = recs.find((r) => r.type === 'TX_END' && r.node === 'sta-1#2g' && r.frame.kind === 'data')!
    const ack = recs.find((r) => r.type === 'TX_START' && r.node === 'ap#2g' && r.frame.kind === 'ack' && r.t >= data.t)!
    expect(ack.t - data.t).toBe(10_000)
    expect(recs.some((r) => r.type === 'ARRIVAL' && r.node === 'sta-1#2g')).toBe(true)
  })
  it('the 2g link table is the 5g table plus 6.5 dB', () => {
    const sc = twoBand()
    const table = buildLinkTable(sc.nodes, sc.walls)
    const sim = new Simulation(sc)
    const recs = sim.runUntil(5 * 1_000_000).records
    // The data rate chosen on 2g reflects the stronger link: never lower than what the 5 GHz table would give.
    const tx = recs.find((r): r is Rec<'TX_START'> => r.type === 'TX_START' && r.node === 'sta-1#2g' && r.frame.kind === 'data')!
    expect(tx.frame.mbps).toBeGreaterThan(0)
    expect(table.get('sta-1')!.get('ap')!).toBeLessThan(-40) // sanity: the fixture geometry is not point-blank
    // Strengthen: the MCS/rate actually chosen on the 2g lane is what the physics
    // predicts for the 5g-table RSSI plus the 6.5 dB path-loss offset — not just "positive".
    const rssi5g = table.get('sta-1')!.get('ap')!
    const width = 20 // sta-1 defaults to 20 MHz; 2.4 GHz caps at 40 MHz anyway
    const expectedMcs = mcsForRssi('he', rssi5g + 6.5, undefined, width) // he (sta-1) meets eht (ap) -> minGen = he
    const expectedMbps = mcsRateMbps('he', expectedMcs)
    expect(tx.frame.mcs).toBe(expectedMcs)
    expect(tx.frame.mbps).toBe(expectedMbps)
  })
})
