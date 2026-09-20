### Task 1: MMS and narrowband models, configuration and schema

**Files:** create `src/uwb/mms.ts`, `src/uwb/nb.ts`, `tests/uwb/mms.test.ts`, `tests/uwb/nb.test.ts`; modify
`src/model/scenario.ts` (types, defaults, schema), `src/uwb/phy.ts` (`uwbSlotsPerTag`, `uwbLongestFrameBytes`,
`uwbSlotFitNs` learn `'mms'`), `src/uwb/ui/UwbSessionFields.tsx` (`uwbModePatch('mms')` only — the fields come in
Task 4), `tests/model/scenario*.test.ts` (schema rules), `tests/editor/uwb-planOps.test.ts` (+1).

**Interfaces (Produces):**

```ts
// src/uwb/mms.ts — all chips at UWB_CHIP_HZ; tags per spec
export const MS_CHIPS = 499_200                       // 4ab draft 15-23/0100r2 §2.3.2: 1 ms
export const MS_RSTU = 1200                           // 4ab draft 15-22/0381r5 §1.1.3
export const MMRS_LEN = 128                           // 4ab draft 0100r2 §2.3.2
export const MMS_SPREAD = 4                           // L = 4
export const N_MSR_SET = [32, 40, 48, 64, 128, 256] as const
export const RSF_COUNT_SET = [0, 1, 2, 4, 8, 16] as const
export const RIF_COUNT_SET = [0, 1, 2, 4, 8] as const
export const STS_LEN_SET = [32, 64, 128, 256] as const
export type NMsr = (typeof N_MSR_SET)[number]; export type RsfCount = …; export type RifCount = …; export type StsLen = …
export function mmrsSymbolChips(gap: number): number          // 4·(128 + 2·gap)
export function rsfChips(nMsr: number, gap: number): number    // nMsr · mmrsSymbolChips(gap)
export function rifChips(stsLen: number): number               // stsLen · 512
export function rsfNs(nMsr: number, gap: number): Ns           // chipsToNs, rounded like uwbPpduNs
export function rifNs(stsLen: number): Ns
export const UWB_MS_BUDGET_NJ = 37                    // regulation (−41.3 dBm/MHz over 1 ms × 499.2 MHz; via 15-22/0205r0)
export function mmsFragmentDbm(fragNs: Ns): number    // 10·log10(37 / (fragNs / 1000)) — model
export const MMS_COMBINE_MAX_DB = 10 * Math.log10(16) // model: the largest train's gain, the channel's delivery floor
export function combineGainDb(heard: number): number  // heard > 0 ? 10·log10(heard) : 0
export function trainDetected(rxDbm: number, heard: number): boolean // rxDbm + combineGainDb(heard) ≥ UWB_RX_SENS_DBM
/** 1-σ of the train-derived clock ratio for a span of `spanMs` between the first and last heard fragment. */
export function ratioSigma(tsNoisePs: number, spanMs: number): number // √2·σ_ts / spanMs (as a fraction)
export interface MmsPhy { rsfs: RsfCount; rifs: RifCount; nMsr: NMsr; gap: number; stsLen: StsLen; gapMs: 1 | 2 }
export type MmsSetId = `rsf-${1|2|…|10}` | `mixed-${1|…|7}`
export const MMS_SETS: Record<MmsSetId, MmsPhy>       // 4ab draft 15-23/0502r3 tables (X = 16 / Y = 0 for rsf-*, gapMs 1)
/** Slot layout of one pair round (spec table "The ranging cycle"). */
export interface MmsLayout {
  controlSlots: 4; rpSlots: number; reportSlots: 4; slots: number
  /** Ranging-phase slot index (0-based within the round) of fragment `index` of `kind` for `side`. */
  fragmentSlot(side: 'initiator' | 'responder', kind: 'rsf' | 'rif', index: number): number
  reportSlot(side: 'initiator' | 'responder'): number   // 4 + rp (responder), 4 + rp + 2 (initiator)
}
export function mmsLayout(phy: MmsPhy): MmsLayout     // rp = max(20, 2·(X + (Y > 0 ? Z − 1 + Y : 0)))
export function mmsLongestFragmentNs(phy: MmsPhy): Ns

// src/uwb/nb.ts
export const NB_CHIP_US = 0.5; export const NB_SYMBOL_CHIPS = 32; export const NB_SYMBOL_US = 16   // standard Clause 12
export const NB_SHR_SYMBOLS = 10; export const NB_PHR_SYMBOLS = 2                                    // 4ab draft 0100r2 §2.3.1 config #1
export function nbPpduNs(octets: number): Ns          // (12 + 2·octets) · 16 µs
export const NB_POLL_BYTES = 12; export const NB_RESP_BYTES = 12; export const NB_REPORT_BYTES = 13 // 4ab draft 0381r5 Table 1.6.3.1
export const NB_MSG_ID = { poll: 0x04, resp: 0x05, reportInitiator: 0x06, reportResponder: 0x07 } as const
export const NB_CHANNELS = 250; export const NB_CHANNEL_MHZ = 2.5
export function nbCenterMhz(n: number): number        // n < 50 ? 5726.25 + 2.5n : 5926.25 + 2.5(n − 50) — reconstructed (model)
export function nbBand(n: number): { lo: number; hi: number }  // ±1.25 MHz
export const NB_TX_DBM = 10; export const NB_RX_SENS_DBM = -100; export const NB_SIR_MIN_DB = 0    // model
export function nbPl0Db(n: number): number            // free space at nbCenterMhz(n), like uwbPl0Db
export const NB_LBT_EDT_DBM_PER_MHZ = -75; export const NB_LBT_CCA_US = 9                          // 4ab draft 0381r5 §1.4.2
export const NB_LBT_THRESHOLD_DBM = NB_LBT_EDT_DBM_PER_MHZ + 10 * Math.log10(NB_CHANNEL_MHZ)        // −71.02
export function nbLbtRequired(channel: number, lbt: NbLbt): boolean  // 'on' | ('auto' && channel ≥ 50)
export function nbChannelForBlock(list: number[], seed: number, block: number): number  // list[hashStr(`${seed}:${block}`) mod len] — model
export const NB_DEFAULT_INIT_CHANNEL = 2; export const NB_DEFAULT_CHANNELS = [3]                    // 4ab draft 0381r5 Table 1.2.3.1

// scenario.ts
export type UwbMode = 'twr' | 'dl-tdoa' | 'ul-tdoa' | 'mms'
export type NbLbt = 'auto' | 'on' | 'off'; export type NbReportMode = 'responder' | 'initiator' | 'bi'
export interface UwbMmsCfg extends MmsPhy { nbChannels: number[]; nbLbt: NbLbt; report: NbReportMode }
// UwbSessionCfg.mms: UwbMmsCfg; DEFAULT_UWB_SESSION.mms = { rsfs: 8, rifs: 0, nMsr: 40, gap: 64, stsLen: 64, gapMs: 1, nbChannels: [3], nbLbt: 'auto', report: 'bi' }
// schema: z.object for mms with .default(DEFAULT_UWB_SESSION.mms) so old scenarios parse; rules per spec "Configuration and schema", all path ['uwb'],
//   messages: 'an MMS train needs at least one fragment (rsfs + rifs > 0)'; 'MMRS gap must be an integer 0…64';
//   'the narrowband allow list needs 1…250 distinct channels 0…249'; 'an MMS ranging slot must be a multiple of 300 RSTU (P802.15.4ab draft)';
//   'a ${slotRstu} RSTU slot is …µs, but the longest MMS fragment needs …µs plus flight'; 'two ${slotRstu} RSTU slots are …µs, but a narrowband message needs …µs plus flight';
//   the block rule reuses the existing message with slots = mmsLayout(...).slots and tags·anchors as the count.
// phy.ts: uwbSlotsPerTag(..., mode: 'mms', mms?: MmsPhy) → mmsLayout(mms).slots (pass the session's mms from both call sites);
//   uwbLongestFrameBytes('mms') is not meaningful → uwbSlotFitNs(anchors, 'mms', schedule, mms) returns mmsLongestFragmentNs(mms) + UWB_SLOT_GUARD_NS,
//   and a new uwbNbSlotFitNs() returns nbPpduNs(NB_REPORT_BYTES) + UWB_SLOT_GUARD_NS for the two-slot rule.
// UwbSessionFields.tsx: uwbModePatch('mms') → { mode, schedule: 'time', aoa: false }.
```

- [ ] Tests (`mms.test.ts`): the four published lengths (62.18 / 65.64 / 91.28 / 65.64 µs, to 0.01 µs); every rsf-*
  set is 62.2 ± 0.05 … 65.6 ± 0.05 µs as the 0502r3 table lists them (62.2, 64.7, 66.0, 68.6, 69.9, 57.9, 62.0, 63.1,
  64.1, 65.6); `mmsFragmentDbm` −3.46 / −2.25 / −2.49 (±0.01); `combineGainDb(16) = MMS_COMBINE_MAX_DB`;
  `trainDetected(−100.2, 8)` true and `(−100.2, 4)` false; `ratioSigma(100, 7) ≈ 2.02e-8`; layout: default (8,0,1)
  → rp 20, slots 28, initiator RSF-m at 4 + 2m, responder at 5 + 2m, report slots 24 / 26; (16,0,1) → rp 32, slots
  40; mixed (8,8,1) → rp 32, RIF-0 initiator at slot 4 + 16 = 20; (8,8,2) → rp 34, RIF-0 at 22; (0,1,1) → rp 20,
  RIF-0 at slot 4. `nb.test.ts`: the four channel centres; 576 / 608 µs; −71.02; `nbLbtRequired` table;
  `nbChannelForBlock` deterministic and within the list. Schema tests: each rule's message; an old scenario without
  `mms` parses to the default; `uwbModePatch('mms')`. Reach closed forms (26.6 / 89.6 / 253.4 / 16.0 m) computed from
  the exported constants, in `mms.test.ts`.
- [ ] Commit `feat(uwb): P802.15.4ab MMS and narrowband models, session config and schema`.

---

