import { describe, it, expect } from 'vitest'
import * as P from '../../src/uwb/phy'

describe('uwb phy · units', () => {
  it('chip 2.003 ns, RCTU 15.650 ps, RSTU 833.333 ns, 1 m = 3.3356 ns', () => {
    expect(P.UWB_CHIP_NS).toBeCloseTo(2.003205, 6)
    expect(P.RCTU_PS).toBeCloseTo(15.650, 3)
    expect(P.RSTU_NS).toBeCloseTo(833.333, 3)
    expect(1 / P.C_M_PER_NS).toBeCloseTo(3.3356, 4)
  })
  it('the counter wraps every 17.2 s', () => {
    expect(P.COUNTER_MOD * P.RCTU_NS / 1e9).toBeCloseTo(17.2, 1)
  })
})

describe('uwb phy · SP1 BPRF PPDU', () => {
  it('SHR 36 576 chips = 73.269 µs and that is the RMARKER', () => {
    expect(P.UWB_SHR_CHIPS).toBe(36_576)
    expect(P.chipsToNs(P.UWB_SHR_CHIPS)).toBe(73_269)
    expect(P.UWB_RMARKER_CHIPS).toBe(P.UWB_SHR_CHIPS)
  })
  it('STS 33 792 chips (gap, 64 × 512, gap) = 67.692 µs; PHR 9 728 chips = 19.487 µs', () => {
    expect(P.UWB_STS_CHIPS).toBe(33_792)
    expect(P.chipsToNs(P.UWB_STS_CHIPS)).toBe(67_692)
    expect(P.chipsToNs(P.UWB_PHR_CHIPS)).toBe(19_487)
  })
  it.each([
    // NOTE: the brief's original row was [60, 228_397]. 228_397 is inconsistent with the RS
    // block-count formula (task-1-report.md, "Deviations"), and 60 octets was itself wrong:
    // a Final is 14 + 12N, so four anchors make 62 (task-7 fix round 1).
    [14, 181_218], [20, 187_372], [24, 191_474], [30, 197_628], [39, 206_859], [62, 236_603],
  ])('%i octets → %i ns', (octets, ns) => {
    expect(P.uwbPpduNs(octets)).toBe(ns)
  })
  it('a PSDU of 8·N + 50 symbols for N ≤ 41 octets, 98 more parity bits for a second RS block', () => {
    expect(P.psduSymbols(30)).toBe(290)
    expect(P.psduSymbols(42)).toBe(8 * 42 + 96 + 2)
  })
})

describe('uwb phy · frames and links', () => {
  it('poll 27 + 3N, response 20 (SS) / 14 (DS), final 14 + 12N, report 24', () => {
    expect(P.uwbPollBytes(1)).toBe(30); expect(P.uwbPollBytes(4)).toBe(39)
    expect(P.uwbRespBytes('ss')).toBe(20); expect(P.uwbRespBytes('ds')).toBe(14)
    expect(P.uwbFinalBytes(4)).toBe(62); expect(P.UWB_REPORT_BYTES).toBe(24)
  })
  it('free-space loss at 1 m is 48.7 dB on channel 5 and 50.5 dB on channel 9', () => {
    expect(P.uwbPl0Db(5)).toBeCloseTo(48.69, 1)
    expect(P.uwbPl0Db(9)).toBeCloseTo(50.50, 1)
  })
  it('FoM bytes decode to 97 % within 0.5 ns (LOS) and 75 % within 12 ns (NLOS)', () => {
    expect(P.fomText(P.FOM_LOS)).toBe('97 % within 0.5 ns')
    expect(P.fomText(P.FOM_NLOS)).toBe('75 % within 12 ns')
  })
})
