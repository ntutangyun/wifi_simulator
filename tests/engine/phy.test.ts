import { describe, it, expect } from 'vitest'
import {
  ACK_TIMEOUT_NS, DIFS_NS, EIFS_NS, SIFS_NS, SLOT_NS,
  ctrlRespRateFor, dataRateFor, sinrThreshDb, txTimeNs,
} from '../../src/engine/phy'
import { dataPsduBytes } from '../../src/model/frames'

describe('clause 17 PHY', () => {
  it('computes TXTIME per Eq. 17-29', () => {
    expect(txTimeNs(14, 6)).toBe(44_000) // ACK @6M: ceil(134/24)=6 syms
    expect(txTimeNs(14, 24)).toBe(28_000) // ceil(134/96)=2
    expect(txTimeNs(20, 6)).toBe(52_000) // RTS @6M: ceil(182/24)=8 syms → 20+32 µs
    expect(txTimeNs(1428, 54)).toBe(20_000 + 4_000 * Math.ceil((16 + 8 * 1428 + 6) / 216)) // 232_000
  })

  it('derives IFS values per §10.3.2.3', () => {
    expect(DIFS_NS).toBe(SIFS_NS + 2 * SLOT_NS)
    expect(EIFS_NS).toBe(94_000)
    expect(ACK_TIMEOUT_NS).toBe(45_000)
  })

  it('selects data rate from RSSI with 3 dB margin', () => {
    expect(dataRateFor(-60)).toBe(54)
    expect(dataRateFor(-72)).toBe(18) // 24M needs ≥ −71 (−74+3), 18M needs ≥ −74
    expect(dataRateFor(-68)).toBe(24)
    expect(dataRateFor(-90)).toBe(6) // floor
  })

  it('selects control response rate per §10.6', () => {
    expect(ctrlRespRateFor(54)).toBe(24)
    expect(ctrlRespRateFor(9)).toBe(6)
    expect(ctrlRespRateFor(12)).toBe(12)
  })

  it('SINR thresholds are sensitivity above noise floor', () => {
    expect(sinrThreshDb(6)).toBe(13)
    expect(sinrThreshDb(54)).toBe(30)
  })

  it('computes data PSDU size', () => {
    expect(dataPsduBytes(1400)).toBe(1428)
  })
})
