### Task 1: HRP UWB PHY constants, frame sizes and airtime

**Files:**
- Create: `src/uwb/phy.ts`
- Test: `tests/uwb/phy.test.ts`

**Interfaces:**
- Produces (all exported from `src/uwb/phy.ts`):

```ts
import type { Material } from '../model/scenario'
import type { Ns } from '../model/types'

export const UWB_CHIP_HZ = 499.2e6                              // standard §16.2.4 peak PRF
export const UWB_CHIP_NS = 1000 / 499.2                         // 2.003205 ns
export const RCTU_NS = UWB_CHIP_NS / 128                        // standard §10.29.1.4: 2^-7 chip ≈ 15.650 ps
export const RCTU_PS = RCTU_NS * 1000
export const RSTU_CHIPS = 416                                   // standard §10.29.1.5, Table 10-145
export const RSTU_NS = RSTU_CHIPS * UWB_CHIP_NS                 // 833.333 ns
export const C_M_PER_NS = 0.299792458                           // physics
export const COUNTER_BITS = 40                                  // model (standard: "at minimum 32-bit")
export const COUNTER_MOD = 2 ** COUNTER_BITS
export const PSYM_CHIPS = 508                                   // standard Table 16-5: code length 127, L = 4
export const SYNC_SYMBOLS = 64                                  // standard Table 16-31 set 3 (SYNC PSR 64)
export const SFD_SYMBOLS = 8                                    // standard Table 16-31 set 3 (SFD #2)
export const STS_ACTIVE_CHIPS = 64 * 512                        // standard Table 16-17 BPRF: 64 × 512 chips
export const STS_GAP_CHIPS = 512                                // standard §16.2.9.1
export const PHR_SYMBOLS = 19                                   // standard §16.2.7.1
export const PHR_SYMBOL_CHIPS = 512                             // standard Table 16-4/16-14 (850 kb/s nominal)
export const DATA_SYMBOL_CHIPS = 64                             // standard Table 16-4 (6.8 Mb/s)
export const RS_PARITY_BITS = 48                                // standard §16.3.3.2
export const RS_BLOCK_BITS = 330                                // standard §16.3.3.2 (55 × 6)
export const TAIL_SYMBOLS = 2                                   // standard Table 16-2
export const UWB_SHR_CHIPS = (SYNC_SYMBOLS + SFD_SYMBOLS) * PSYM_CHIPS   // 36 576
export const UWB_RMARKER_CHIPS = UWB_SHR_CHIPS                  // standard §10.29.1.1: first chip after the SFD
export const UWB_RMARKER_NS = UWB_RMARKER_CHIPS * UWB_CHIP_NS   // 73 269.23 ns, exact (float)
export const UWB_STS_CHIPS = STS_GAP_CHIPS + STS_ACTIVE_CHIPS + STS_GAP_CHIPS  // 33 792
export const UWB_PHR_CHIPS = PHR_SYMBOLS * PHR_SYMBOL_CHIPS     // 9 728

export function psduSymbols(octets: number): number            // 8·octets + 48·ceil(8·octets / 330) + 2
export function uwbPpduChips(octets: number): number           // SHR + STS + PHR + psduSymbols·64
export function chipsToNs(chips: number): Ns                   // Math.round(chips * 1000 / 499.2)
export function uwbPpduNs(octets: number): Ns                  // chipsToNs(uwbPpduChips(octets))

export type UwbChannelNo = 5 | 9
export const UWB_CHANNEL_MHZ: Record<UwbChannelNo, number> = { 5: 6489.6, 9: 7987.2 }   // standard Table 11-9
export function uwbPl0Db(ch: UwbChannelNo): number             // 20·log10(4π·f/c): 48.69 (5), 50.50 (9)
export const UWB_PL_EXP = 2.0                                   // model: indoor LOS
export const UWB_TX_POWER_DBM = -14                             // model default (−41.3 dBm/MHz mean EIRP over 499.2 MHz)
export const UWB_RX_SENS_DBM = -93                              // model
export const UWB_CAPTURE_DB = 6                                 // model
export const UWB_NLOS_NS: Record<Material, number> = { drywall: 0.5, brick: 2.0, glass: 0.2 }  // model
export const UWB_PPM_MAX = 20                                   // standard §16.4.9: ±20 ppm

export const UWB_MHR_BYTES = 9, UWB_FCS_BYTES = 2, UWB_IE_HDR_BYTES = 2   // standard frame format; short addressing (model)
export const ARC_IE_BYTES = 10, RRMC_IE_BYTES = 3, RRTI_IE_BYTES = 6       // model sizing from the IE field lists
export const RMI_FINAL_ENTRY_BYTES = 6, RMI_REPORT_IE_BYTES = 13
export function rdmIeBytes(anchors: number): number            // 3 + 3·anchors
export function rmiFinalIeBytes(anchors: number): number       // 3 + 6·anchors
export function uwbPollBytes(anchors: number): number          // 27 + 3·anchors
export function uwbRespBytes(method: 'ss' | 'ds'): number      // 20 | 14
export function uwbFinalBytes(anchors: number): number         // 14 + 12·anchors
export const UWB_REPORT_BYTES = 24

export const FOM_LOS = 0x16                                     // model: 97 % within 1 ns × 0.5
export const FOM_NLOS = 0x7b                                    // model: 75 % within 3 ns × 4.0
export function fomDecode(fom: number): { levelPct: number; intervalNs: number }   // standard Tables 10-146…148
export function fomText(fom: number): string                   // `${levelPct} % within ${intervalNs} ns`
```

`fomDecode`: level = bits 0–2 → [0, 20, 55, 75, 85, 92, 97, 99] %; interval = bits 3–4 → [0.1, 0.3, 1, 3] ns; scaling = bits 5–6 → [0.5, 1, 2, 4]; `intervalNs = interval × scaling`. `fomText(0x16)` = `97 % within 0.5 ns`; `fomText(0x7b)` = `75 % within 12 ns`.

- [ ] **Step 1: Write the failing tests** in `tests/uwb/phy.test.ts`:

```ts
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
```

- [ ] **Step 2: Run** `npx vitest run tests/uwb/phy.test.ts` — expect failure (module not found).
- [ ] **Step 3: Implement** `src/uwb/phy.ts` exactly per the interface block; every constant with its source tag.
- [ ] **Step 4: Run** the test file — expect PASS; run `npx tsc -b`.
- [ ] **Step 5: Commit** `feat(uwb): HRP UWB PHY constants, frame sizes and SP1 airtime`.

---

