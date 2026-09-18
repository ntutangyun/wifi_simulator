import { describe, it, expect } from 'vitest'
import { UwbClock, counterDiff } from '../../src/uwb/clock'
import { dsTwr, metresToNs, rctuToMetres, ssTwrCorrected, ssTwrRaw } from '../../src/uwb/ranging'
import { RCTU_NS } from '../../src/uwb/phy'

/** A (initiator) polls at 0, B replies replyNs after receiving, A finals finalNs after receiving the reply. */
function exchange(dM: number, ppmA: number, ppmB: number, replyNs: number, finalNs: number) {
  const A = new UwbClock(ppmA, 12345), B = new UwbClock(ppmB, 987654321)
  const tp = metresToNs(dM)
  const txPoll = 0, rxPoll = tp, txResp = tp + replyNs, rxResp = txResp + tp, txFinal = rxResp + finalNs, rxFinal = txFinal + tp
  return {
    tround1: counterDiff(A.counter(rxResp), A.counter(txPoll)),
    treply1: counterDiff(B.counter(txResp), B.counter(rxPoll)),
    tround2: counterDiff(B.counter(rxFinal), B.counter(txResp)),
    treply2: counterDiff(A.counter(txFinal), A.counter(rxResp)),
    coffs: (ppmB - ppmA) * 1e-6,
  }
}

describe('SS-TWR', () => {
  it('is exact with perfect clocks', () => {
    const e = exchange(5, 0, 0, 2_000_000, 2_000_000)
    // Residual is pure RCTU quantisation (15.65 ps ticks, ≈4.69 mm): the reply
    // delay is an exact multiple of RCTU_NS so its rounding cancels between A
    // and B, leaving only the rxResp rounding (≤0.5 RCTU/2 ≈ 1.17 mm here).
    expect(rctuToMetres(ssTwrRaw(e.tround1, e.treply1))).toBeCloseTo(5, 2)
  })
  it('a 2 ms reply and 20 ppm between the crystals reads 6.0 m long', () => {
    const e = exchange(5, 10, -10, 2_000_000, 2_000_000)
    const err = rctuToMetres(ssTwrRaw(e.tround1, e.treply1)) - 5
    // ½·Treply·(eA − eB) = 0.5 · 2 ms · 20e-6 = 20 ns = 5.996 m
    expect(err).toBeCloseTo(0.5 * 2_000_000 * 20e-6 * 0.299792458, 2)
  })
  it('the corrected formula removes the clock term', () => {
    const e = exchange(5, 10, -10, 2_000_000, 2_000_000)
    expect(rctuToMetres(ssTwrCorrected(e.tround1, e.treply1, e.coffs))).toBeCloseTo(5, 2)
  })
})

describe('DS-TWR', () => {
  it('cancels 20 ppm of clock error with asymmetric reply times to within 1 mm', () => {
    const e = exchange(12.5, 20, -20, 2_000_000, 6_000_000)
    // Same RCTU quantisation floor as above (~1 mm residual); toBeCloseTo(_, 3)
    // demands 0.5 mm, tighter than the model's 4.69 mm tick admits.
    expect(rctuToMetres(dsTwr(e.tround1, e.treply1, e.tround2, e.treply2))).toBeCloseTo(12.5, 2)
  })
  it('one RCTU is 4.69 mm', () => {
    expect(rctuToMetres(1)).toBeCloseTo(RCTU_NS * 0.299792458, 9)
    expect(rctuToMetres(1) * 1000).toBeCloseTo(4.69, 2)
  })
})
