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
  // 2026-11-10: Table 16-2 sends 21 symbols at the PHR rate (H0–H18 plus D0, D1), not 19 (audit #7).
  it('STS 33 792 chips (gap, 64 × 512, gap) = 67.692 µs; PHR 21 × 512 = 10 752 chips = 21.538 µs', () => {
    expect(P.UWB_STS_CHIPS).toBe(33_792)
    expect(P.chipsToNs(P.UWB_STS_CHIPS)).toBe(67_692)
    expect(P.PHR_SYMBOLS).toBe(21)
    expect(P.chipsToNs(P.UWB_PHR_CHIPS)).toBe(21_538)
  })
  it.each([
    // NOTE: the brief's original row was [60, 228_397]. 228_397 is inconsistent with the RS
    // block-count formula (task-1-report.md, "Deviations"), and 60 octets was itself wrong:
    // a Final is 14 + 12N, so four anchors make 62 (task-7 fix round 1).
    // 2026-11-10: every PPDU is 896 chips (2 × (512 − 64)) longer than before — Table 16-2's two PSDU
    // bits at the PHR rate (audit #7).
    [14, 183_013], [20, 189_167], [24, 193_269], [30, 199_423], [39, 208_654], [62, 238_397],
  ])('%i octets → %i ns', (octets, ns) => {
    expect(P.uwbPpduNs(octets)).toBe(ns)
  })
  // 2026-11-10: Table 16-2 — D0, D1 go out at the PHR rate, so the data-rate symbols are N + 20 − 20:
  // the coded bits less the two at the PHR rate plus the two tail symbols (audit #7).
  it('a PSDU of 8·N + 48 data-rate symbols for N ≤ 41 octets, 48 more parity bits for a second RS block', () => {
    expect(P.psduSymbols(30)).toBe(288)
    expect(P.psduSymbols(42)).toBe(8 * 42 + 96 - 2 + 2)
  })
})

describe('uwb phy · frames and links', () => {
  // Poll was 27 + 3N until 2026-11-10: its ARC IE carried a block, round and slot index the
  // standard's ARC IE does not have (audit #9). It is now ARC (control 2 + Content Control 1) plus the
  // RR IE that carries the block and round indices (§10.32.9.1, §10.32.9.3): 30 + 3N.
  // 2026-11-10: RRTI has a 1-octet content header (§10.29.8.1) → SS Response 21; the Final carries one
  // RMI (2-octet content header, §10.29.8.4) and one RRTI listing every responder → 18 + 12N; the
  // responder's unicast report is RMI 2 + 8 → 23 (audit #8).
  it('poll 30 + 3N, response 21 (SS) / 14 (DS), final 18 + 12N, report 23', () => {
    expect(P.uwbPollBytes(1)).toBe(33); expect(P.uwbPollBytes(4)).toBe(42)
    expect(P.ARC_IE_BYTES).toBe(2 + 3); expect(P.RR_IE_BYTES).toBe(2 + 6)
    // RCPS: CP Table Length 1 + one 2-octet CP Table Element (§10.32.9.5), so a contention Poll is 35.
    expect(P.RCPS_IE_BYTES).toBe(2 + 1 + 2); expect(P.uwbPollBytes(4, 'contention')).toBe(35)
    expect(P.uwbRespBytes('ss')).toBe(21); expect(P.uwbRespBytes('ds')).toBe(14)
    expect(P.uwbFinalBytes(4)).toBe(66); expect(P.UWB_REPORT_BYTES).toBe(23)
    expect(P.RRTI_IE_BYTES).toBe(2 + 1 + 4); expect(P.RMI_FIXED_BYTES).toBe(2 + 2)
    // Deferred DS (§10.29.6.6, Figure 10-237): a bare Final and the initiator's deferred report.
    expect(P.uwbFinalBytes(4, 'deferred')).toBe(11); expect(P.uwbDsDeferredReportBytes(4)).toBe(15 + 40)
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
