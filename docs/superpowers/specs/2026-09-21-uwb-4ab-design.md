# UWB slice 7: IEEE P802.15.4ab narrowband-assisted multi-millisecond ranging — design

Date: 2026-09-21
Status: continuation of `2026-09-19-uwb-slices-design.md` ("Out of scope" item 1). Everything in this slice that is
not already in IEEE Std 802.15.4-2024 comes from **P802.15.4ab draft material**, and is tagged so.

## Purpose

802.15.4z ranging spends one packet's worth of energy on one measurement, and the UWB energy budget is a hard
regulatory ceiling per millisecond. P802.15.4ab (in Sponsor-ballot recirculation at D5.0, September 2026) adds two
things this slice teaches:

1. **Multi-millisecond (MMS) UWB packets.** One ranging "packet" is a train of short fragments, one per millisecond,
   that the receiver combines coherently: X fragments buy 10·log10(X) dB of link budget. The fragments carry no
   preamble, no SFD, no PHR and no data — only a ranging sequence (RSF) or an STS segment (RIF).
2. **Narrowband assistance (NBA-UWB).** A 2.5 MHz O-QPSK radio in the 5.7–6.4 GHz UNII bands carries the control
   exchange (poll / response), the acquisition the UWB fragments no longer carry, and the measurement report. That
   radio shares 6 GHz with Wi-Fi 6E and has a listen-before-talk rule of its own.

Both ship as one new session mode, `mode: 'mms'`, plus two lessons in a third UWB tier. Sensing (NBA-sensing,
multi-static) and the 4ab high-rate data modes are out of scope.

### Sources and honesty tags

The balloted draft text is members-only; this slice is built from the TG4ab contributions in the local mentor corpus
(`…/references/uwb_tg4ab/`, 1 127 documents), read via `scripts/read_pages.py`. Every constant below carries one of:

- **standard §…** — IEEE Std 802.15.4-2024 (unchanged clauses: RSTU, RCTU, block/round/slot, O-QPSK PHY of Clause 12,
  STS of §16.2.9).
- **4ab draft (doc)** — text in a TG4ab contribution, cited by mentor number: 15-22/0381r5 "NBA-UWB MMS ranging text
  proposal" (ranging cycle, phases, slot/round/block defaults, LBT, channel lists, compressed PSDU formats),
  15-23/0100r2 "NBA-UWB Technical Framework" (RSF/RIF/MMRS definitions, N_MSR set, fragment spacing, NB PPDU configs,
  NB channel counts), 15-23/0502r3 "Group Consensus on Operating Parameter Sets" (the mandatory MMS parameter sets,
  proposed as 16.2.11.4), 15-22/0205r0 (Qorvo: the 37 nJ per millisecond budget and why fragments). The balloted
  D5.0 may differ in numbering and detail; the lesson prose and the Guide say so once, up front.
- **regulation** — the UWB mean-EIRP limit (−41.3 dBm/MHz averaged over 1 ms, i.e. ≈ 37 nJ per millisecond per
  500 MHz; FCC Part 15.519 / ETSI EN 302 065, quoted through 15-22/0205r0).
- **model** — our choice, stated where it is made and in the lesson.

Never copy standard or draft text into the repo; paraphrase, and quote only numbers and field names.

### Course placement

`TIERS[6] = { track: 'uwb', en: 'UWB Tier 3 · What comes next: 802.15.4ab', zh: 'UWB 第三阶段 · 下一步：802.15.4ab' }`;
one module `{ tier: 6, title: { en: 'Narrowband-assisted multi-millisecond UWB', zh: '窄带辅助的多毫秒 UWB' } }`
(index 15). `COURSE_ORDER` appends `uwb-mms`, `uwb-nba` after `uwb-aoa`.

## The MMS packet (PHY model, `src/uwb/mms.ts`)

All in chips at 499.2 Mchip/s (standard §16.2.4); 1 ms = 499 200 chips = 1 200 RSTU (4ab draft 15-23/0100r2 §2.3.2).

| Quantity | Definition | Tag |
|---|---|---|
| MMRS symbol | one length-128 complementary-set sequence split [A, G, B, G] with a gap G of 0…64 zeros, spread by L = 4: `4·(128 + 2·gap)` chips | 4ab draft 0100r2 §2.3.2 |
| RSF | `N_MSR` repetitions of one MMRS symbol: `rsfChips(nMsr, gap) = nMsr · 4 · (128 + 2·gap)`; N_MSR ∈ {32, 40, 48, 64, 128, 256} | 4ab draft 0100r2 §2.3.2 |
| RIF | one STS segment, spreading L = 4, length `stsLen` ∈ {32, 64, 128, 256} in units of 512 chips: `rifChips(stsLen) = stsLen · 512` | 4ab draft 0100r2 §2.3.2; STS standard §16.2.9 |
| Fragment spacing | start-to-start 1 ms between consecutive fragments of one device's train | 4ab draft 0100r2 §2.3.2, 0381r5 §1.1.3 ("regular intervals of 1200 RSTUs") |
| Train shape | X RSFs then Y RIFs; RIF-y starts `(X + Z − 1 + (y − 1))` ms after RSF-1, Z ∈ {1, 2} (Z = 2 adds one idle millisecond for processing). X ∈ {0, 1, 2, 4, 8, 16}, Y ∈ {0, 1, 2, 4, 8}, not both 0 | 4ab draft 0100r2 §2.3.2 (figures), 0381r5 Table 1.6.3.2 "UWB MAC Config" |
| RSF-RMARKER | the peak of the first pulse of the first RSF (the first RIF when X = 0): the ranging timestamp has **no** SHR offset | 4ab draft 0100r2 §2.3.2 |
| Fragment length check | the published lengths reproduce: N_MSR 40 / gap 33 → 31 040 chips = 62.18 µs ("62.2"); N_MSR 32 / gap 64 → 65.64 µs ("65.6"); N_MSR 64 / gap 25 → 91.28 µs ("< 92"); RIF 64 → 65.64 µs ("65.6") | test |

**Mandatory parameter sets** (4ab draft 15-23/0502r3, proposed 16.2.11.4) are shipped as a table
`MMS_SETS: { id: 'rsf-1'…'rsf-10' \| 'mixed-1'…'mixed-7'; x; y; nMsr; gap; stsLen }`: RSF-only sets 1–10 (X = 16,
Y = 0; N_MSR 40 with gaps 33/37/39/43/45, N_MSR 32 with gaps 49/57/59/61/64) and mixed sets 1–7 (N_MSR 64, gap 25,
STS 64; (X, Y) = (1,1), (1,2), (1,4), (1,8), (2,2), (4,4), (8,8)). The UWB-only sets (SHR + one RIF) are not
modelled (they are 4z SP3 in all but name). The session's **default** is the draft's cycle default, not a set:
X = 8, Y = 0, N_MSR = 40, gap = 64 (MMRS "complementary set zeros" default 64), STS 64, Z = 1 — 4ab draft 0381r5
Table 1.2.3.3 — giving an 82.05 µs RSF.

### Energy and reach (model, from the regulation)

- `UWB_MS_BUDGET_NJ = 37` (regulation): −41.3 dBm/MHz × 499.2 MHz = −14.3 dBm, over 1 ms. The engine's existing 4z
  transmitter is `UWB_TX_POWER_DBM = −14` held constant, so a 4z Poll of ~190 µs spends about 7.5 nJ of its
  millisecond. That model is **not changed**.
- A fragment spends the whole millisecond's budget in its own length: `mmsFragmentDbm(fragNs) = 10·log10(37 nJ /
  fragNs µs)` — −3.46 dBm for the 82.05 µs default RSF, −2.25 dBm for set rsf-1's 62.18 µs RSF, −2.49 dBm for a
  65.64 µs RIF. **Model**: the peak-power limit is not reached (−29 dBm/MHz instantaneous PSD is 12 dB under the
  0 dBm / 50 MHz peak rule), and the lesson says plainly that a burst-mode 4z transmitter may spend the same 37 nJ in
  one frame — the simulator's does not, so of the total gain it shows, `10·log10(37 / 7.5) ≈ 6.9 dB` is burst power
  and only `10·log10(X)` is the multi-millisecond idea.
- **Reception of a train** (model, the receiver is primed by the NB exchange and accumulates blind): every fragment
  whose received power is at least `UWB_RX_SENS_DBM − MMS_COMBINE_MAX_DB` (−93 − 12.04 = −105.04 dBm,
  `MMS_COMBINE_MAX_DB = 10·log10(16)`) is delivered to the device by the channel, subject to the same capture and
  SIR rules as any UWB frame. At the end of the train the device counts the fragments it heard, `n`, and the train is
  **detected** iff `rxDbm + 10·log10(n) ≥ UWB_RX_SENS_DBM` (coherent combining of equal-power fragments). RSF and RIF
  trains are judged separately (an RIF train's fragments combine likewise — the receiver knows the STS it expects).
  A range needs the RSF train (or the RIF train when X = 0); the RIF train, when Y > 0, decides the range's
  `integrity` flag (STS verified) and nothing else.
- Timestamp noise stays `tsNoisePs` per stamp (model): the SNR-dependent precision the draft's "ToF accuracy
  improvement" rests on is **not** modelled, and the Guide's Known simplifications say so.
- Reach in the model, line of sight on channel 9 (PL0 50.50 dB, exponent 2): 4z Poll 26.6 m; a train at the default
  RSF: X = 1 → 89.6 m, 2 → 126.7 m, 4 → 179.2 m, 8 → 253.4 m, 16 → 358.4 m. Behind two brick walls (24 dB): 4z
  1.7 m; X = 4 → 11.3 m, X = 8 → 16.0 m, X = 16 (set rsf-1) → 26.0 m. The first lesson lives in that second row.

### The clock ratio from the train (model)

A receiver that hears fragments `i` and `j` of one train, `(j − i)` ms apart on the transmitter's clock, measures
their spacing on its own counter and so measures the clock ratio directly: `ratio = spanMeasured / ((j − i) ·
1 ms)`, with σ_ratio = √2 · σ_ts / ((j − i) ms) — 0.0202 ppm for X = 8 (7 ms span, 100 ps stamps), 0.0094 ppm for
X = 16. The corrected SS-TWR of the core spec (`ssTwrCorrected`) then leaves ½ · T_reply · σ_ratio: **1.5 mm** at
the 0.5 ms reply of the default layout (X = 8), against 1.5 cm from the NB carrier estimate alone (`cfoNoisePpm` 0.2)
and 1.5 m uncorrected (20 ppm). A device that heard one fragment only (X = 1, or losses) falls back to the NB
carrier-offset estimate drawn as today (`cfoNoisePpm`). This is why the slice needs no DS-TWR: with a train, single-
sided ranging is already at the timestamp floor. Draws per train, in order: RMARKER stamp noise, last-heard-fragment
stamp noise (both from the receiver's stream; the second only when two or more fragments were heard), then the NB
carrier-offset residual only when the fallback is used. No draw per fragment.

If the first fragment of a train was lost, the RMARKER stamp is the first heard fragment's arrival minus its index ×
1 ms on the receiver's counter (the train's structure is known from the control exchange) — model.

## The narrowband side (`src/uwb/nb.ts`)

| Quantity | Value | Tag |
|---|---|---|
| PHY | O-QPSK 250 kb/s, config #1: 8 preamble + 2 SFD + 2 PHR symbols, 32 chips/symbol at 0.5 µs/chip (16 µs/symbol), 4 bits/symbol, no FEC | standard Clause 12; config table 4ab draft 0100r2 §2.3.1 |
| `nbPpduNs(octets)` | `(12 + 2·octets) · 16 µs` | derived |
| Messages (compressed PSDU: 1-octet Msg ID + fields + CRC16) | POLL 12 octets (576 µs); RESP 12 (576 µs); REPORT from responder 13 (608 µs: ReplyTime 5 octets, PTDataLength 1, no PTData); REPORT from initiator 13 (608 µs: TurnAroundTime 5) | 4ab draft 0381r5 Table 1.6.3.1 / 1.6.3.2 |
| Channels | 50 in UNII-3 (5725–5850 MHz) + 200 in UNII-5 (5925–6425 MHz), 2.5 MHz apart, numbered 0…249: `nbCenterMhz(n) = n < 50 ? 5726.25 + 2.5·n : 5926.25 + 2.5·(n − 50)` | 4ab draft 0381r5 §1.4.1 / 0100r2 §2.3.1 give the counts and band edges; the centre formula is an image in the corpus and is **reconstructed** from them (model) |
| Emission band | `[f − 1.25, f + 1.25]` MHz | model (occupied bandwidth "< 2.5 MHz", 0381r5 §1.4.1) |
| `NB_TX_DBM = 10` | | model (a small UNII-band module; the bands allow far more) |
| `NB_RX_SENS_DBM = −100` | | model (typical 250 kb/s O-QPSK receiver; the standard's floor is −85 dBm, §12.3.4) |
| `NB_SIR_MIN_DB = 0` | an NB frame is lost when in-band foreign power reaches its own | model |
| Path loss | free space at the channel centre + walls, the UWB engine's own law (`uwbPl0Db`-style with f_NB, exponent `UWB_PL_EXP`) | model |
| Defaults | initialization channel 2; control/report allow list `[3]` (UNII-3, 5733.75 MHz) | 4ab draft 0381r5 Table 1.2.3.1 |
| LBT (channels 50–249 always; 0–49 optional) | CCA of at least 9 µs before a transmission; energy-detection threshold −75 dBm/MHz; clear → transmit within 16 µs; busy → **no NB transmission for the rest of the current ranging block** | 4ab draft 0381r5 §1.4.2 (citing ETSI EN 303 687 FBE rules) |
| LBT in the model | at each NB slot start the transmitter samples the Spectrum's foreign power over its 2.5 MHz band (one instantaneous reading stands for the 9 µs window); busy iff `foreignDbm ≥ −75 + 10·log10(2.5) = −71.02 dBm`; on busy the device sets `nbSkipBlock = block`, transmits nothing on NB until the next block, and emits `UWB_NB_LBT { busy: true }`; a clear check emits nothing (no record spam) | model reading of the draft rule; `nbLbt: 'auto' \| 'on' \| 'off'` with 'auto' = on for channels ≥ 50 |
| Channel switching | `nbChannels: number[]` (the allow list); block b uses `nbChannels[hashStr(seed:b) mod length]` | 4ab draft 0381r5 §1.5.3 defines AES-128-CTR keyed by `NbaUwbPrngSeed` over the block index; the simulator's hash stands in (model) |
| Report mode | `'responder' \| 'initiator' \| 'bi'`, default `'bi'` (responder reports in the first report slot, initiator in the second, independently) | 4ab draft 0381r5 Table 1.1.4.1 / 1.2.3.3 |

The initialization / setup handshake (ADV-POLL / ADV-RESP / SOR), public advertising, acquisition packets and short-
term parameter negotiation are out of scope: the session is configured by the scenario, as every session here is.

## The ranging cycle (`src/uwb/session.ts`, `network.ts`, `device.ts`)

An MMS session is **pairwise**: one ranging round holds one initiator (a tag) and one responder (an anchor) — the
peer-to-peer cycle of 4ab draft 0381r5 §1.1 (its one-to-many POLL variants exist in the draft and are not modelled).
Tag t and anchor k own round `t·A + k` of every block; the schema requires `tags · anchors ≤ roundsPerBlock`. Slot
default 600 RSTU (0.5 ms), a multiple of 300 RSTU as the draft requires (§1.1.1). A round is:

| Slots (0.5 ms each) | Phase | Who | What |
|---|---|---|---|
| 0–1 | control | initiator | LBT, then NB POLL (RcpPollSlot = 2) |
| 2–3 | control | responder | LBT, then NB RESP (RcpResponseSlot = 2); only if the POLL was received |
| 4 + 2m, m = 0…X−1 | ranging | initiator | RSF-m (RpRsfOffset 0) |
| 5 + 2m | ranging | responder | RSF-m (model: responder offset one slot, so the two trains interleave inside each millisecond) |
| 4 + 2·(X + Z − 1 + y), y = 0…Y−1 | ranging | initiator | RIF-y |
| the slot after each | ranging | responder | RIF-y |
| … up to 4 + rp | | | `rp = max(20, 2·(X + (Y > 0 ? Z − 1 + Y : 0)))` slots — the draft's RpDuration default 20 as a floor, grown to fit the train (model) |
| 4 + rp, +1 | report | responder | NB REPORT (MrpFirstSlot 2) — unless report mode is 'initiator' |
| 4 + rp + 2, +1 | report | initiator | NB REPORT (MrpSecondSlot 2) — unless report mode is 'responder' |

So the default round is 28 slots = 14 ms, exactly the draft's example round duration (Table 1.2.3.2); the default
block there is 1 008 ms, but a lesson may use the simulator's 200 ms block — a block is a block. Discontinuation
follows the draft: an initiator whose LBT is busy or whose expected RESP does not arrive, and a responder that
received no POLL or whose LBT is busy, does nothing more in the cycle (no fragments, no report; the initiator that
stops is not listening in the ranging phase, so a responder's train that is sent anyway falls on deaf ears — the
draft's "shall continue the cycle" for a responder whose RESP was in fact lost).

Device behaviour, per pair round:
- Control: the initiator transmits POLL; the responder that hears it transmits RESP; both then mark the round
  *primed*. The NB frames are plain frames on the shared UWB medium (see coupling), with NB path loss and NB
  sensitivity; a device not primed does not listen to fragments.
- Ranging: each device transmits its fragments on schedule; a primed receiver collects per-fragment arrivals (power,
  index). At the end of the peer's RSF train (the slot after its last RSF) it evaluates detection, emits
  `UWB_MMS_TRAIN`, and, if detected, `UWB_TS { dir: 'rx', frameKind: 'uwbRsf', counter }` at the RMARKER. The
  transmitter emits `UWB_TS { dir: 'tx', frameKind: 'uwbRsf' }` at its first fragment. RIF trains likewise with
  `'uwbRif'`; their `UWB_TS` is emitted only for the log's benefit (no time is taken from them).
- Report: the responder's REPORT carries `ReplyTime` = (its RSF-1 TX counter − its RMARKER RX counter of the
  initiator's train), a 40-bit RCTU count exactly as our counters are; the initiator's REPORT carries the round trip
  (`TurnAroundTime` in the draft's field name — model reading: the initiator's RX RMARKER of the responder's train −
  its own TX RMARKER). Each side that holds a round trip, a reply time and a ratio computes
  `ssTwrCorrected(round, reply, ratio)`, emits `UWB_RANGE { method: 'ss', … , integrity }` on its own lane, and the
  tag keeps the range for its block fix.
- Block fix (tag): after the tag's last pair round of the block (`round = t·A + A − 1` ends), if it holds three or
  more ranges from this block it solves and emits `UWB_POSITION { method: 'twr', block }` (an MMS range is a two-way
  range; `UWB_ROUND.mode` says how it was made). The `UWB_ROUND_END` of that round follows the fix.

## Coupling with Wi-Fi 6E (`src/engine/spectrum.ts`, `simulation.ts`)

- **`Emission` carries its own law** (the carry item from the slices review): `{ txId, eirpDbm, bandLoMhz,
  bandHiMhz, pos, lossDb: (dM, wallsDb) => number }`. The Wi-Fi channel passes `wifiToUwbPathLossDb`; the UWB
  channel passes, per frame, `uwbToWifiPathLossDb(·, ·, ch)` for 4z frames and fragments (bound to the session
  channel) and the NB law for NB frames. `uwbChannelOf` and its nearest-centre heuristic are deleted; the numbers
  every existing coupled scenario produces are unchanged (same functions, same arguments), which the lesson-hash
  fixture and the coexistence lesson tests prove.
- **When the mediator exists**: as today (6 GHz link × UWB channel 5 with overlap > 0), **or** the session is `mms`
  and any channel of `nbChannels` has a band overlapping the plan's 6 GHz Wi-Fi channel (centre `sixGhzCenterMhz`,
  width the link's widest, ≥ 160 MHz as the existing gate does). A UNII-3 allow list never couples; the default
  session therefore stays byte-identical whether or not a 6 GHz link exists.
- Per-frame UWB emissions: 4z frames as today; fragments with `eirpDbm = mmsFragmentDbm(fragNs)` over the UWB band;
  NB frames with `NB_TX_DBM` over their 2.5 MHz band. The Wi-Fi side needs nothing new: its energy detection sums
  whatever lands in its band (a 10 dBm NB frame inside the 80 MHz channel is −62 dBm at ≈ 15 m: the AP defers to it),
  and its lock's interference term rises the same way.
- Per-frame UWB sensitivity and SIR: `sensFor(frame)` = NB → `NB_RX_SENS_DBM`, fragment → `UWB_RX_SENS_DBM −
  MMS_COMBINE_MAX_DB`, else `UWB_RX_SENS_DBM`; `sirMinFor(frame)` = NB → `NB_SIR_MIN_DB`, else `UWB_SIR_MIN_DB`.
  The receiver's foreign-power query for an NB frame uses the NB band, not the UWB band.
- LBT reads `spectrum.foreignDbm('uwb', pos, nbLo, nbHi)`; without a mediator it is always clear.
- Wi-Fi at the NB receiver: an 80 MHz PPDU at 20 dBm puts 4.95 dBm into 2.5 MHz; under the Wi-Fi law (46.7 +
  30·log10 d + 1.2 dB) it is −71.0 dBm at ≈ 8.6 m — inside that radius of a transmitting 6E AP, the NB check is busy
  (pin the crossing).

## Configuration and schema

```ts
// scenario.ts
export type UwbMode = 'twr' | 'dl-tdoa' | 'ul-tdoa' | 'mms'
export type NbLbt = 'auto' | 'on' | 'off'
export type NbReportMode = 'responder' | 'initiator' | 'bi'
export interface UwbMmsCfg {
  rsfs: 0 | 1 | 2 | 4 | 8 | 16          // X — 4ab draft 0100r2 §2.3.2
  rifs: 0 | 1 | 2 | 4 | 8               // Y
  nMsr: 32 | 40 | 48 | 64 | 128 | 256   // MMRS repetitions per RSF
  gap: number                           // 0…64 MMRS zeros
  stsLen: 32 | 64 | 128 | 256           // RIF STS segment, ×512 chips
  gapMs: 1 | 2                          // Z
  nbChannels: number[]                  // allow list, 1…250 entries of 0…249 (4ab draft 0381r5 §1.5.2)
  nbLbt: NbLbt
  report: NbReportMode
}
// UwbSessionCfg gains `mms: UwbMmsCfg`; DEFAULT_UWB_SESSION.mms =
//   { rsfs: 8, rifs: 0, nMsr: 40, gap: 64, stsLen: 64, gapMs: 1, nbChannels: [3], nbLbt: 'auto', report: 'bi' }
// mms.ts: export function mmsSet(id: MmsSetId): the PHY part of a UwbMmsCfg; MMS_SETS table with the 17 mandatory sets.
```

Schema rules (all `path: ['uwb']`): `mode: 'mms'` requires `schedule: 'time'` (the existing rule) and `aoa: false`
(the existing rule, extended); `rsfs + rifs > 0`; `gap` integer 0…64; `nbChannels` non-empty, distinct, each integer
0…249; `slotRstu % 300 === 0` in MMS (4ab draft 0381r5 §1.1.1); the longest fragment plus `UWB_SLOT_GUARD_NS` fits
one slot (a 256 × 512-chip RIF is 262.6 µs and does not fit a 300 RSTU slot); the longest NB PPDU (608 µs) plus guard
fits two slots; `tags · anchors ≤ floor(blockRstu / (slots · slotRstu))` where `slots = 8 + rp`. `uwbSlotsPerTag`,
`uwbLongestFrameBytes` / `uwbSlotFitNs` learn the mode (`uwbSlotFitNs` returns the fragment/NB rule for 'mms').
`UWB_MAX_ANCHORS` does not apply to MMS (nothing grows with the anchor count); the block rule bounds it instead.
The editor's `uwbModePatch('mms')` sets `schedule: 'time', aoa: false` like the one-way modes.

## Records, view, UI

| Record | Emitted by | Fields |
|---|---|---|
| `UWB_ROUND` | as before, `mode: 'mms'`, `slots` = 8 + rp | |
| `UWB_NB_LBT` | the transmitter, on a **busy** check only | node, channel, foreignDbm, thresholdDbm, block, round |
| `UWB_MMS_TRAIN` | each receiver, at the end of a peer's train | node, peer, kind: 'rsf' \| 'rif', fragments (X or Y), heard, rxDbm (per fragment), gainDb = 10·log10(heard) (0 when heard = 0), marginDb = rxDbm + gainDb − UWB_RX_SENS_DBM, detected, ratioPpm: number \| null (the train-derived clock ratio − 1, in ppm; null when < 2 fragments heard), block, round |
| `UWB_TS` | as before; `frameKind` gains 'uwbRsf' \| 'uwbRif' | |
| `UWB_RANGE` | tag and/or anchor per report mode | as before + `integrity?: boolean` (present when Y > 0) |
| `UWB_TIMEOUT` | as before; `expected` gains the NB kinds | |
| `UWB_POSITION` | tag, at its last pair round of the block | `method: 'twr'` |

`UwbFrameKind` gains `'uwbRsf' | 'uwbRif' | 'nbPoll' | 'nbResp' | 'nbReport'`. `UwbInfo` gains
`mms?: { kind: 'rsf' | 'rif'; index: number; of: number; nMsr?: number; gap?: number; stsLen?: number; txDbm: number }`
and `nb?: { channel: number; centerMhz: number; msgId: number; replyRctu?: number; roundTripRctu?: number }`. NB
frames have `mbps: 0.25`, `bytes` = the compressed PSDU length; fragments have `bytes: 0` and `mbps: 0`. The frame
decoder (`frameFields.ts`) prints a fragment's index/length/power and an NB message's id, channel, centre and times.

`UwbNodeView` gains `mms: { trains: Record<peer, { kind; heard; fragments; marginDb; detected; ratioPpm }>;
nbChannel: number | null; lbtBusy: number (count this run); skippedBlocks: number }`. Inspector rows: the train
table (peer, heard / X, margin, detected, ratio), the NB channel and centre, LBT busy count; the range row shows the
integrity flag when present. Event log (`format.ts`): one line each for `UWB_NB_LBT` and `UWB_MMS_TRAIN`. Timeline:
the NB frames and fragments are ordinary frames on the node lanes (`lanes.ts` / `caps.ts` know the five kinds and
give fragments a distinct colour). Scene overlay: nothing new (rings and fix as for TWR).

Editor (`UwbSessionFields.tsx`): the mode select gains "narrowband-assisted MMS (802.15.4ab draft)"; in MMS mode a
section with a **parameter-set select** (the 17 mandatory sets by id plus "custom"), the five PHY fields, Z, the NB
allow list (comma-separated channel numbers, validated), LBT and report mode selects; the DS/SS method select is
disabled with the hint that MMS ranges single-sided with a train-derived clock ratio. `UwbNodeFields`: unchanged.
`i18n.ts`: EN + ZH for every new label, hint and mode name; the "draft" qualifier appears in the mode name and once
in the section hint.

## Lessons

### `uwb-mms` — "Sixteen milliseconds of energy" / 十六毫秒的能量 (module 15)

Scene: `rangingLab()` (22 × 8 m) with two full-height brick partitions at x = 5 and x = 10 (no openings), three
anchors in the first bay — (0.5, 0.5), (0.5, 7.5), (4.5, 4.0) at 2.2 m — and one tag at (13.0, 4.0), 1.0 m, behind
both walls; session `mode: 'mms'` with the draft defaults (X = 8, 82.05 µs RSF), channel 9, block 200 ms, slot
600 RSTU, `report: 'responder'` (the tag computes; the narrowband report lesson uses 'bi'). Variants: "Four
fragments" (X = 4: every train below −93 dBm, no range), "Set rsf-1" (X = 16, N_MSR 40 / gap 33), "4z for
comparison" (`mode: 'twr'`, SS, the same room: every Response is below sensitivity — UWB_TIMEOUT on every slot).
Body: the draft disclaimer; the 37 nJ millisecond and what a 4z frame spends of it; the fragment (what an RSF is,
its length arithmetic, the RMARKER with no preamble); the train and 10·log10(X); the two-wall link budget table
(per-fragment −100.x dBm, margin at X = 4 / 8 / 16, pinned); what the narrowband radio carries instead (POLL / RESP /
REPORT with their octets and microseconds); the clock ratio from the train (the 1.5 mm / 1.5 cm / 1.5 m ladder,
pinned against the run's range errors); the burst-power honesty paragraph. 4 observe, 2 tryThis (X = 4 → no
range; set rsf-1 → margin), 3 quiz. ≤ 25 min.

### `uwb-nba` — "The narrowband radio shares 6 GHz too" / 窄带电台也共享 6 GHz (module 15)

Scene: the coexistence lesson's room and Wi-Fi: `oneRoom()`, a Wi-Fi 7 router at (5, 4) on 6 GHz channel 71
(`sixGhzCenterMhz: 6305`, 80 MHz: 6 265–6 345 MHz), a saturated 6 GHz laptop at (7, 5); four corner anchors at
2.2 m and one tag at (4, 3.5), 1.0 m; `mode: 'mms'` defaults, `report: 'bi'`, block 200 ms. Base: `nbChannels:
[200]` (6 301.25 MHz, inside the router's channel; LBT auto → on). Variants: "Outside the router's channel"
(`nbChannels: [100]`, 6 051.25 MHz), "Hop over four channels" (`[100, 150, 200, 210]` — two inside, two outside),
"No LBT" (`[200]`, `nbLbt: 'off'`: the NB frames collide with Wi-Fi instead of yielding to it). Body: the draft
disclaimer; the 250 NB channels and where they sit against Wi-Fi 6E's 20 MHz grid (one 20 MHz channel = eight NB
channels); the LBT rule (9 µs, −75 dBm/MHz, −71 dBm over 2.5 MHz, the 8.6 m radius of a 20 dBm 80 MHz AP, pinned);
the block-skip consequence (how many of the run's blocks each scene loses, pinned; the tag's fixes per scene);
blockwise channel switching over the allow list (which block landed where, pinned by replaying the hash); what the
NB costs Wi-Fi (the −62 dBm energy-detection radius of a 10 dBm 2.5 MHz emission ≈ 15 m; the router's deferrals
during NB frames, pinned as a count or a busy-time share); the No-LBT variant's NB losses (`RX_FAIL lowSinr` on NB
frames, pinned). 4 observe, 2 tryThis, 3 quiz. ≤ 25 min.

Both lessons state the standard / draft / model split in their first paragraph, quote no number a test does not pin,
and keep `lessonMinutes ≤ 25` (`lessonWords ≤ 1724`).

## Docs

Guide §12 (EN + ZH) "802.15.4ab: narrowband-assisted multi-millisecond UWB (draft)"; glossary: MMS, RSF, RIF, MMRS,
N_MSR, NBA-UWB, NB control channel, LBT / frame-based equipment, the millisecond energy budget, coherent combining,
train-derived clock ratio (EN + ZH, `alt` lists free of CJK in `alt.en`); README: a "Draft status" paragraph and
conformance rows for every item above with its tag; EditorGuide: the MMS section. Known simplifications list gains:
no SNR-dependent timestamp precision; no one-to-many cycle; no initialization handshake / acquisition packets; NB
path loss is free space; LBT is one instantaneous reading; the NB channel formula is reconstructed; hash in place of
AES-CTR for channel switching.

## Determinism guard

`tests/fixtures/uwb-record-hashes.json` (new; the slices review's carry item): for every UWB lesson scene (base and
variants), the hash of its `UWB_*` records (type, node and every numeric field to 6 decimals) over the lesson's run
window, regenerated with `UPDATE_HASHES=1` like the timeline fixture. This catches reception-side regressions the
air-only timeline hash cannot. Adding it is additive: the timeline fixture is untouched except for the two new
lessons' entries.

## Testing

- `mms.ts`: fragment lengths reproduce the published table; `mmsFragmentDbm`; the 17 sets; train layout (slot
  indices for (X, Y, Z) cases); reach closed forms (26.6 m, 89.6 m, 253.4 m, 16.0 m behind two brick walls).
- `nb.ts`: `nbCenterMhz(0) = 5726.25`, `(49) = 5848.75`, `(50) = 5926.25`, `(249) = 6423.75`; PPDU durations 576 /
  608 µs; the LBT threshold −71.02 dBm; the 8.6 m crossing under the Wi-Fi law; the −62 dBm radius ≈ 15 m.
- Schema: every rule above, with the exact messages; `uwbModePatch('mms')`.
- Spectrum: `Emission.lossDb` refactor leaves the coexistence lesson's every number and hash unchanged; the mediator
  is built for an NB channel inside the 6 GHz channel and not for UNII-3.
- Channel: per-frame sensitivity and SIR; fragments below −105.04 dBm are not delivered, between −105.04 and −93 are.
- Device / network end to end: the pair-round layout; a two-wall scene ranges at X = 8 and not at X = 4; the RMARKER
  counter has no SHR offset (tx stamp = first fragment's TX instant on the counter); the train-derived ratio within
  4σ of the true ratio and the corrected range error consistent with 1.5 mm + timestamp noise; X = 1 falls back to
  the NB CFO draw (exactly one extra draw); a lost first fragment still yields the same RMARKER (± noise); RIF
  integrity flag; report modes give ranges to the right lanes; block fix after the last pair round; LBT busy skips
  the block and the responder times out on the POLL; hopping lands the blocks where the hash says; Wi-Fi defers to
  an NB frame; `mode: 'twr'` scenes byte-identical (fixture).
- View / format / rows / frameFields / lanes: one test each for the new records and kinds.
- Lessons: every quoted number, as always.

## Out of scope (after this slice)

One-to-many MMS cycles; the initialization handshake and acquisition packets; NBA-sensing; the 4ab HPRF data rates
(1.95–62.4 Mb/s) and streaming; SNR-dependent timestamp precision; AES-CTR channel switching; UWB-only MMS sets
(SHR + RIF); hyperbola drawing; round hopping; LRP UWB.
