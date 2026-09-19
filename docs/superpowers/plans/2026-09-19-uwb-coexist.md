# UWB Slice 3 — 6 GHz Coexistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Wi-Fi 6 GHz link and UWB channel 5 hear each other: a Wi-Fi PPDU is in-band interference for a UWB reception, a UWB frame raises the noise term of a Wi-Fi reception; plus the lesson "Sharing 6 GHz".

**Architecture:** A core `Spectrum` mediator (`src/engine/spectrum.ts`) receives live emissions from both channels and answers "foreign power at this receiver inside this band". The Wi-Fi `Channel` and the `UwbChannel` each gain an optional spectrum hook; `Simulation` creates the spectrum only when a scenario has a 6 GHz Wi-Fi link and a channel-5 UWB session whose bands overlap. Everything else (records, view, UI, course) follows the established seams.

**Tech Stack:** TypeScript, Vite, React, zod, vitest (existing). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-19-uwb-slices-design.md` (Slice 3, Records and view, Testing).

## Global Constraints

- No record of any existing scenario changes: `tests/engine/lesson-hashes.test.ts` passes without regeneration in Tasks 1–4; Task 5 adds keys only.
- The coupling is inert unless `sixGhzCenterMhz`'s channel overlaps UWB channel 5 AND both engines exist; the default `sixGhzCenterMhz` is 5 985 (overlap 0).
- Every constant tagged `standard § / FiRa / model` in its comment; `UWB_SIR_MIN_DB = −12` is model; `−45 dBm/MHz` (§16.4.10) is standard.
- Determinism: spectrum notifications are scheduled at phase 1 through the shared `EventQueue`; no Map-iteration-order dependence.
- EN + ZH for every user-visible string; lesson contract as before (`lessonMinutes` 15–25, every claim pinned, 4σ or pinned values for noise claims).
- `npx tsc -b`, `npx vite build`, `npx vitest run` green after every task; no `any`, `@ts-ignore`, `as unknown as`; commit per task by explicit pathspec with the two trailer lines `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_016HUme5YXCB8DTeScyfn7pL`.
- Worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`, branch `feat/uwb-ranging`, plain single git commands.

---

## File structure

| File | Responsibility |
|---|---|
| `src/uwb/phy.ts` | `UWB_BAND_MHZ` per channel, `uwbBandOverlap(centerMhz, widthMhz, ch)`, `UWB_SIR_MIN_DB`, `uwbInBandDbm(widthOverlapMhz)`. |
| `src/model/scenario.ts` | `Scenario.sixGhzCenterMhz` (default 5985, schema 5955–7115 step 5), `sixGhzChannelNo(centerMhz)`. |
| `src/engine/spectrum.ts` | `Spectrum`, `Emission`, foreign-power arithmetic. |
| `src/engine/channel.ts` | Optional spectrum hook: register 6 GHz emissions, add foreign power to interference/CCA, re-evaluate on change. |
| `src/uwb/channel.ts` | Register UWB emissions; per-reception max foreign power; `UWB_INTERFERED`; `UwbRxInfo.foreignDbm`. |
| `src/engine/simulation.ts` | Create the spectrum when both sides exist and overlap > 0; pass positions/walls. |
| `src/uwb/records.ts`, `view.ts`, `format.ts`, `ui/UwbInspector.tsx`, `ui/rows.ts` | The new record, counter, log line, inspector row. |
| `src/editor/FloorPlanEditor.tsx` (+ i18n) | Plan setting "6 GHz channel" (centre MHz with the 6E channel number and overlap note). |
| `src/course/curriculum.ts`, `lessonKit.ts`, `course/uwb/uwb-coexist.ts`, `lessons.ts` | Tier 5, modules 13/14, lesson 6. |
| `src/ui/Guide.tsx`, `glossary.ts`, `README.md` | Coexistence paragraph, three glossary terms, README rows. |

---

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

### Task 2: The `Spectrum` mediator

**Files:** create `src/engine/spectrum.ts`; test `tests/engine/spectrum.test.ts`.

**Interfaces:**

```ts
import type { Vec3 } from '../model/types'; import type { Wall } from '../model/scenario'; import type { Ns } from '../model/types'
export type SpectrumSide = 'wifi' | 'uwb'
export interface Emission { txId: string; eirpDbm: number; bandLoMhz: number; bandHiMhz: number; pos: Vec3 }
export class Spectrum {
  constructor(walls: Wall[], q: EventQueue, now: () => Ns)
  /** Register a live emission of one side; schedules a phase-1 change notification for the other side at `now`. */
  emit(side: SpectrumSide, e: Emission): void
  retire(side: SpectrumSide, e: Emission): void
  onChange(target: SpectrumSide, fn: (t: Ns) => void): void
  /** Sum (mW) of the OTHER side's live emissions at rxPos inside [loMhz, hiMhz]. */
  foreignMw(target: SpectrumSide, rxPos: Vec3, loMhz: number, hiMhz: number): number
  foreignDbm(target: SpectrumSide, rxPos: Vec3, loMhz: number, hiMhz: number): number   // −Infinity when none
}
/** Path loss of a foreign emission uses the transmitter's law (documented model choice). */
export function wifiToUwbPathLossDb(dM: number, wallsDb: number): number   // 46.7 + 30·log10(max(d, 0.1)) + wallsDb + 1.2 (LINK_EXTRA_LOSS_DB['6g'])
export function uwbToWifiPathLossDb(dM: number, wallsDb: number, ch: UwbChannelNo): number  // uwbPl0Db(ch) + 20·log10(max(d, 0.1)) + wallsDb
```

Overlap of an emission with a query band: `overlapMhz = max(0, min(hi) − max(lo))`; the emission's power inside the query band is `eirpDbm + 10·log10(overlapMhz / (bandHi − bandLo))` (uniform spectral density within the emission's band, model). Wall loss via `wallLossDb` from `src/engine/propagation.ts`.

- [ ] Tests: a Wi-Fi emission (20 dBm, 6265–6345) at 3 m from a UWB receiver querying 6240–6739.2 → 20 − 62.2 = −42.2 dBm (within 0.1); the same emission queried on channel 9's band → −Infinity; a UWB emission (−14 dBm, 6240–6739.2) queried in 6265–6345 at 4 m → −14 + 10·log10(80/499.2) − (48.69 + 12.04) = −82.7 dBm (within 0.1); two emissions sum in mW; `retire` removes; `onChange` listeners for the other side fire once per emit/retire at phase 1 (use a real `EventQueue` and pop); a wall between adds its loss.
- [ ] Implement, run, commit `feat(engine): Spectrum mediator for cross-technology interference`.

---

### Task 3: Wi-Fi side of the coupling

**Files:** modify `src/engine/channel.ts`, `src/engine/simulation.ts`; test `tests/engine/channel-spectrum.test.ts`.

Changes to `Channel`:
- New optional constructor argument `spectrum?: { s: Spectrum; posOf: (id: string) => Vec3; centerMhz: number }` (only passed for the 6 GHz link). On `startTx` of a frame it calls `s.emit('wifi', { txId, eirpDbm: txPowerDbm of the node (from the scenario; pass `txPowerOf(id)` in the same argument), bandLo/Hi: centre ± width/2 })`, on `endTx` it retires.
- `interferenceMw(rid, lock)` adds `s.foreignMw('wifi', posOf(rid), lo, hi)` for the lock's PPDU band; `othersMw` (preamble detection) likewise; `updateAllCca` adds foreign mW to the energy sum.
- `s.onChange('wifi', t => { for every radio, for every open lock: lock.maxInterfMw = max(…, interferenceMw) ; updateAllCca(t) })`.
- `Simulation`: for the `'6g'` link, when `sc.uwb?.channel === 5`, UWB nodes exist and `uwbBandOverlap(center, widthMax, 5) > 0` (widthMax = the widest negotiated width on the link — compute from `negotiatedWidth` over members, or simply 160), construct the `Spectrum` once and pass it to that link's `Channel` and (Task 4) to the `UwbNetwork`.

- [ ] Tests: build a Wi-Fi channel with a spectrum stub (or a real Spectrum with a hand-registered UWB emission): a lock's `maxInterfMw` includes the foreign term; RX_OK flips to RX_FAIL lowSinr when the foreign power is raised enough; CCA_BUSY 'energy' appears when a foreign emission above −62 dBm exists; without a spectrum nothing changes (the existing `tests/engine/channel.test.ts` suite still green; `lesson-hashes` unchanged).
- [ ] Implement, run, commit `feat(engine): Wi-Fi channel hears foreign in-band power through the Spectrum`.

---

### Task 4: UWB side, record, view, log, inspector, Simulation wiring

**Files:** modify `src/uwb/channel.ts`, `src/uwb/network.ts` (pass-through), `src/engine/simulation.ts`, `src/uwb/records.ts`, `src/uwb/view.ts`, `src/uwb/format.ts`, `src/uwb/ui/rows.ts`, `src/uwb/ui/UwbInspector.tsx`, `src/ui/i18n.ts`; tests `tests/uwb/channel-coexist.test.ts`, `tests/uwb/network.test.ts` (+2), `tests/uwb/view.test.ts` (+1), `tests/ui/uwb-format.test.ts` (+1).

- `UwbChannel` gains optional `spectrum?: Spectrum`: on `transmit` it emits `{ txId, eirpDbm: txPowerDbm, band: UWB_BAND_MHZ[ch] }` and retires at TX end; each open reception tracks `maxForeignMw` (initialised at arrival, raised on every `onChange('uwb')` notification); at the reception's end, after the collision check, `sirDb = rssiDbm − dbm(maxForeignMw)`; if `sirDb < UWB_SIR_MIN_DB` → `RX_FAIL { reason: 'lowSinr' }` + `UWB_INTERFERED { node, from, foreignDbm, sirDb }` + `onRxFail`. `UwbRxInfo.foreignDbm` (−Infinity when none).
- `UwbRecord` gains `{ type: 'UWB_INTERFERED'; node; from; foreignDbm; sirDb }`; `UwbNodeView.interfered: number`; `fmtUwbRecord`: `${node} UWB frame from ${from} lost to Wi-Fi: SIR ${sirDb.toFixed(1)} dB (foreign ${foreignDbm.toFixed(1)} dBm)`; inspector row "lost to Wi-Fi" EN/ZH.
- `Simulation` passes the spectrum into `UwbNetwork` → `UwbChannel`.

- [ ] Tests: a UWB reception with a hand-registered Wi-Fi emission at −42 dBm vs rssi −76.7 → RX_FAIL lowSinr + UWB_INTERFERED with sirDb ≈ −34.7; with the Wi-Fi emission 20 dB weaker than the UWB signal → RX_OK; a Wi-Fi emission that starts mid-reception still counts (max over the reception); with overlap 0 (channel 9) no spectrum is built and records equal the no-Wi-Fi run for the UWB subsequence; a mixed lesson-5-style scenario with `sixGhzCenterMhz: 6305` and a saturated 6 GHz laptop loses UWB frames (count > 0) while the same with 5985 loses none.
- [ ] Implement, run (`lesson-hashes` unchanged), commit `feat(uwb): UWB receptions fail under in-band Wi-Fi; UWB_INTERFERED record and inspector row`.

---

### Task 5: Course tier 2 seam and lesson "Sharing 6 GHz"

**Files:** modify `src/course/curriculum.ts` (TIERS[5], MODULES 13/14, COURSE_ORDER five ids), `src/course/lessonKit.ts` (a `wifi6g(id, name, x, y, profile)` builder: eht, `linkId: '6g'`, `widthMhz: 80`, features incl. edca/ampdu/txop), `src/course/lessons.ts`; create `src/course/uwb/uwb-coexist.ts`; test `tests/course/uwb-coexist.test.ts`; fixture additions only.

Lesson `uwb-coexist` ("Sharing 6 GHz" / 共享 6 GHz, module 13): the lesson-5 corner anchors and tag (DS, **channel 5**, nlos on) plus `node('ap', 'Router', 5, 0.7, 'eht', 'idle', …)` at 6 GHz 80 MHz and a laptop at (7, 5) with the `browsing` profile on 6 GHz (`linkId: '6g'`), `sixGhzCenterMhz: 6305`, UWB nodes listed last. Variants: "UWB on channel 9" / UWB 使用 9 号信道; "Wi-Fi on channel 7 (5 985 MHz)" / Wi-Fi 使用 7 号信道; "Saturated download" / 饱和下载 (laptop `saturated`). Body: source sentence (§16.4.10 max input is standard; SIR −12 dB, the path-loss laws and the spectral-density assumption are model; 6E channel numbering is 802.11ax); the two bands and the overlap fraction; the asymmetry (20 dBm vs −14 dBm, 30 dB of path-loss exponent difference); what the tag sees from the AP at its distance (compute and pin); what the laptop sees from a UWB frame (noise rise in dB, 1 % of the time); CCA never trips; the per-second counts. Pinned per the spec's list; measure first.

- [ ] Steps as in earlier lesson tasks; commit `feat(course): UWB tier 2 and lesson "Sharing 6 GHz"`.

---

### Task 6: Guide, glossary, README, editor guide

**Files:** `src/ui/Guide.tsx` (a paragraph in section 11 on coexistence, EN/ZH), `src/ui/glossary.ts` (terms: in-band interference, SIR (signal-to-interference ratio), noise rise / channel 5 vs 9), `README.md` (rows: coupling model, SIR −12 dB model, §16.4.10), `src/editor/EditorGuide.tsx` (the 6 GHz channel setting), tests `tests/ui/uwb-guide.test.ts` (+3).

- [ ] Commit `docs(uwb): coexistence in the guide, glossary and README`.

## Self-review

Spec Slice 3 → Tasks 1–4 (engine), 5 (lesson), 6 (docs); records/view additions → Task 4; editor setting → Task 1; determinism rule → Task 2 (phase-1 notifications). Type names consistent: `Spectrum`, `Emission`, `SpectrumSide`, `uwbBandOverlap`, `UWB_SIR_MIN_DB`, `UWB_INTERFERED`.
