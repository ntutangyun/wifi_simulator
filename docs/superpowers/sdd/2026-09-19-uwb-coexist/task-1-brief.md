### Task 1: Bands, overlap and the 6 GHz channel setting

**Files:** modify `src/uwb/phy.ts`, `src/model/scenario.ts`, `src/editor/FloorPlanEditor.tsx`, `src/ui/i18n.ts`; test `tests/uwb/coexist-bands.test.ts`, `tests/model/uwb-scenario.test.ts` (+2), `tests/editor/*` (+1).

**Interfaces:**

```ts
// src/uwb/phy.ts
export const UWB_BAND_MHZ: Record<UwbChannelNo, { lo: number; hi: number }> = { 5: { lo: 6240.0, hi: 6739.2 }, 9: { lo: 7737.6, hi: 8236.8 } }  // standard Table 11-9 centre ± 249.6 MHz
export function uwbBandOverlapMhz(centerMhz: number, widthMhz: number, ch: UwbChannelNo): number   // width of [c−w/2, c+w/2] ∩ band, ≥ 0
export function uwbBandOverlap(centerMhz: number, widthMhz: number, ch: UwbChannelNo): number      // fraction of the Wi-Fi channel inside the UWB band, 0…1
export const UWB_SIR_MIN_DB = -12                                                                  // model
export const UWB_MAX_INPUT_DBM_PER_MHZ = -45                                                       // standard §16.4.10 (documented, not enforced)
/** EIRP of a UWB frame inside a Wi-Fi channel: −14 dBm spread over 499.2 MHz, times the overlapping width. */
export function uwbInBandDbm(txPowerDbm: number, overlapMhz: number): number                       // txPowerDbm + 10·log10(overlapMhz / 499.2), −Infinity at 0
// src/model/scenario.ts
export const DEFAULT_SIX_GHZ_CENTER_MHZ = 5985                                                     // 802.11ax 6 GHz channel 7 (80 MHz), model default
export function sixGhzChannelNo(centerMhz: number): number                                         // (centerMhz − 5950) / 5
// Scenario.sixGhzCenterMhz?: number — schema: int, 5955 ≤ v ≤ 7115, v % 5 === 0; the engine reads sc.sixGhzCenterMhz ?? DEFAULT_SIX_GHZ_CENTER_MHZ
```

Editor: a "6 GHz channel" number input in the plan settings (where seed / RTS threshold live), showing `ch ${sixGhzChannelNo}` and, when the plan has a channel-5 UWB session, "overlaps UWB channel 5: N %" — EN/ZH.

- [ ] Tests: `uwbBandOverlap(6305, 80, 5) === 1`; `(5985, 80, 5) === 0`; `(6260, 80, 5)` = 60/80 = 0.75; `(6305, 80, 9) === 0`; `uwbInBandDbm(−14, 80)` ≈ −21.95; `uwbInBandDbm(−14, 0) === −Infinity`; `sixGhzChannelNo(6305) === 71`, `(5985) === 7`; schema accepts 6305, rejects 6303 and 5950; a scenario without the field parses (default applies). Editor: the input clamps to the schema.
- [ ] Implement, run, commit `feat(uwb): UWB band edges, 6 GHz overlap arithmetic and the sixGhzCenterMhz setting`.

---

