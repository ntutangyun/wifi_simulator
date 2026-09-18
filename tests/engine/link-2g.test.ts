import { describe, it, expect } from 'vitest'
import { ERP_2G, OFDM_5G, aifsNs, txTimeNs, ACK_BYTES } from '../../src/engine/phy'

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
