# AMP Slice 2 — Mono-static Backscatter in 2.4 GHz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A backscatter tag mode and an RFID-reader mode on the AMP AP: the AP radiates a DL PPDU with WUP- and
BST-Excitation fields, runs an EPC Gen2-style inventory in AMP RFID frames inside a protected TXOP, and decodes the
tags' backscattered replies against its own self-leakage; plus the lesson "A tag with no radio".

**Architecture:** A pure model module `src/engine/ampBs.ts` (free-space backscatter law, reader floor, PPDU and
reply airtimes, Gen2 command/reply sizes, BST formulas); per-frame power and per-radio floors in `src/engine/channel.ts`
(a DL PPDU that changes power at its BST-Excitation, a 'bsTag' radio kind with the −20 dBm floor, a reader floor for
replies); an `AmpInventoryRound` in `src/engine/ampReader.ts` driven by the same MAC hook as `AmpApRound`; a
`AmpBsStaMac` in `src/engine/ampBsSta.ts`; records, view, log, inspector, decoder, editor, docs, lesson along the seams
slice 1 cut.

**Tech Stack:** existing.

**Spec:** `docs/superpowers/specs/2026-09-21-amp-backscatter-energy-design.md` (Common ground + Slice A2). Read the
"Reader model" and "The inventory round" sections before Task 1; every constant's tag is there.

## Global Constraints

- `mode: 'active'` is the default and every existing scenario replays **byte-identically**: `tests/fixtures/lesson-hashes.json`
  changes only by the new lesson's entries (Task 5), regenerated with `UPDATE_HASHES=1 npx vitest run tests/engine/lesson-hashes.test.ts`;
  `tests/fixtures/uwb-record-hashes.json` unchanged.
- Every constant tagged at its definition exactly as the spec tags it: `// SFD PM-nn`, `// PDT 11-26/1798r1`,
  `// TGbp 11-25/0307r0 (contribution)`, `// EPC Gen2`, `// regulation`, `// model`. Paraphrase; quote only numbers and field names.
- Determinism: the Gen2 slot counter is the only new draw (one `rng.int(2^Q − 1)` per tag per Query, from the tag's
  existing stream, after nothing else); no `Date`, `Math.random`, `localeCompare`, `toLocale*`.
- EN + ZH for every user-visible string; `alt.en` glossary lists free of CJK.
- Lesson contract: every quoted number pinned by `tests/course/amp-backscatter.test.ts` against the lesson's own
  scenario; `lessonMinutes ≤ 25` (`lessonWords ≤ 1724`); 4 observe + 2 tryThis + 3 quiz; the first paragraph states the
  SFD / PDT / contribution / Gen2 / model split and names the documents.
- Gates before every commit: `npx tsc -b`, `npx vite build`, `npx vitest run` green; no `any`, `@ts-ignore`, `as unknown as`.
- Commit per task by pathspec with the two trailer lines `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
  and `Claude-Session: https://claude.ai/code/session_016HUme5YXCB8DTeScyfn7pL`.
- Worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`, branch `feat/uwb-ranging` (the platform branch; main is fast-forwarded from it), plain single git commands.

---

### Task 1: Backscatter model, frames, configuration and schema

**Files:** create `src/engine/ampBs.ts`, `tests/engine/amp-bs-model.test.ts`; modify `src/model/scenario.ts`
(`AmpTagCfg.mode/epc`, `AmpApCfg.backscatter`, schema), `src/model/frames.ts` (`AmpInfo` fields, two frame kinds),
`src/model/caps.ts` / `src/model/lanes.ts` / `src/ui/i18n.ts` (`kindName/whatIs/next` for the two kinds — the exhaustive
records force it; EN + ZH), `tests/model/*scenario*.test.ts` (+schema cases).

**Interfaces (Produces):**

```ts
// src/engine/ampBs.ts
export const AMP_BS_LOSS_DB = 6                    // TGbp 11-24/0537r0, 11-23/2038r1 (contribution)
export const AMP_BS_ISOLATION_DB = 20              // TGbp 11-25/0058r1, 11-24/0537r0 (contribution)
export const AMP_BS_READER_DR_DB = 50              // TGbp 11-25/0307r0 (contribution)
export const AMP_BS_REQ_SNR_DB: Record<AmpBsUlKbps, number> = { 250: 3, 1000: 9 } // model
export const AMP_BS_ACTIVATION_DBM = -20           // TGbp 11-24/0537r0; PDT 11-26/1581r1 (S1G DL sensitivity)
export const AMP_BS_TAG_PPM = 100_000              // SFD PM-28
export const AMP_BS_T1_NS = 16_000                 // SFD PM-75 immediate response time
export const AMP_BS_T2_NS = 16_000                 // TGbp 11-26/0120r0 AP turnaround (contribution)
export const AMP_BS_WRITE_T3_NS = 2_000_000        // TGbp 11-26/0120r0 (contribution): Write ≥ 2 ms
export const AMP_BS_WUP_MIN_NS = 1_000_000         // SFD PM-73
export const AMP_BS_BST_MIN_NS = 16_000            // SFD PM-74
export const AMP_BS_DL_SYNC_NS = 16_000            // SFD PM-63: 8 chips × 2 µs (PM-10)
export const AMP_BS_DL_KBPS = 250                  // TGbp 11-25/0061r0: single DL rate for backscatter (contribution)
export const AMP_BS_UL_SYNC_CHIPS = 24             // SFD PM-57: [S,S,S], S = 8 chips
export type AmpBsUlKbps = 250 | 1000               // SFD PM-17
export const AMP_BS_UL_CHIP_NS: Record<AmpBsUlKbps, Ns> = { 250: 2000, 1000: 500 } // model reading of PM-35 (Manchester, no FEC)
export const FREQ_24G_MHZ = 2440                   // model: mid-band
export function freeSpacePl0Db(fMhz: number): number   // 20·log10(4π·f/c); reuse src/uwb/units.ts's helper if importable without a cycle (it is a leaf): import it, do not copy
export function bsPathLossDb(fMhz: number, dM: number, wallsDb: number): number // pl0 + 20·log10(max(d, 0.05)) + wallsDb — model (Friis)
export function readerFloorDbm(leakDbm: number): number // leakDbm − AMP_BS_READER_DR_DB
export function monoLeakDbm(bsDbm: number): number     // bsDbm − AMP_BS_ISOLATION_DB
export function bsReplyDbm(bsDbm: number, plDb: number): number // bsDbm − 2·plDb − AMP_BS_LOSS_DB (mono-static round trip)
export function bsDecodes(replyDbm: number, floorDbm: number, kbps: AmpBsUlKbps): boolean // replyDbm − floorDbm ≥ req
/** Reach closed forms for the lesson: the largest d at which bsDecodes holds / the tag activates. */
export function monoReachM(bsDbm: number, kbps: AmpBsUlKbps, wallsDb?: number): number  // 0.328 m at 250 kb/s, 0.232 at 1 Mb/s, for ANY bsDbm
export function activationReachM(chargeDbm: number, wallsDb?: number): number             // 0.309 m at 10 dBm, 0.978 m at 20 dBm
// Gen2 frames (EPC Gen2 → octets, model rounding): DL body octets and UL reply octets
export type Gen2Cmd = 'query' | 'queryRep' | 'ack' | 'read' | 'write' | 'select'
export const GEN2_CMD_BYTES: Record<Gen2Cmd, number> = { query: 3, queryRep: 1, ack: 3, read: 8, write: 8, select: 18 }
export type Gen2Reply = 'rn16' | 'epc' | 'read' | 'write'
export const GEN2_REPLY_BYTES: Record<Gen2Reply, number> = { rn16: 2, epc: 16, read: 13, write: 5 }
export const AMP_RFID_HDR_BYTES = 5; export const AMP_RFID_FCS_BYTES = 2      // SFD FM-15/FM-20 (widths model as slice 1)
export function ampRfidBytes(cmd: Gen2Cmd): number                             // 5 + body + 2
export function bsReplyNs(reply: Gen2Reply, kbps: AmpBsUlKbps): Ns            // sync 24 chips + octets·8·(Manchester bit = 2 chips)
export function bstNs(reply: Gen2Reply | null, kbps: AmpBsUlKbps, delayedT3Ns?: Ns): Ns
//   immediate: max(AMP_BS_BST_MIN_NS, 1.2·T1 + 1.1·T4); delayed: 1.1·T3 + 1 µs + 1.1·T4; null reply (no response expected): 1.2·T1  — SFD PM-74, PM-87, PM-88
export function ampBsDlPpduNs(cmd: Gen2Cmd, wupNs: Ns, bstNs: Ns, signalExtNs: Ns): Ns
//   32 µs preamble + wupNs + AMP_BS_DL_SYNC_NS + ampRfidBytes(cmd)·8·4 µs + bstNs + signalExtNs  (no AMP-SIG: SFD PM-65 note; no padding field)
export function ampRfidFrame(a: { src: string; dst: string; cmd: Gen2Cmd; session: number; q?: number; rn16?: number; slot: number;
  ulKbps: AmpBsUlKbps; wupNs: Ns; bstNs: Ns; chargeDbm: number; bsDbm: number; signalExtNs: Ns }): FrameDesc   // kind 'ampRfid', dir 'dl', kbps 250
export function ampBsReplyFrame(a: { src: string; dst: string; reply: Gen2Reply; kbps: AmpBsUlKbps; slot: number; rn16?: number; epc?: string }): FrameDesc // kind 'ampBsReply', dir 'ul'
export function epcOf(nodeId: string): string      // 24 hex chars derived from hashStr, deterministic
export function crc16Epc(epc: string): number       // SFD FM-25: the tag's 16-bit id is CRC-16 of the EPC — use the existing 802.11ba CRC-16 if the repo has one, else CRC-16-CCITT (model), never 0 or 0xffff

// frames.ts: FrameKind gains 'ampRfid' | 'ampBsReply'; AmpInfo gains
//   rfid?: { cmd: Gen2Cmd; session: number; q?: number; rn16?: number; slot: number; wupNs: Ns; bstNs: Ns; chargeDbm: number; bsDbm: number; ulKbps: AmpBsUlKbps }
//   bs?: { reply: Gen2Reply; slot: number; rn16?: number; epc?: string }
// scenario.ts: AmpTagCfg.mode?: 'active' | 'backscatter' (default 'active'); AmpTagCfg.epc?: string (24 hex);
//   AmpApCfg.backscatter?: { q: number; ulKbps: 250 | 1000; wupMs: number; chargeDbm: number; bsDbm: number; txopMs: number; read: boolean; write: boolean }
//   DEFAULT_AMP_BS = { q: 2, ulKbps: 250, wupMs: 1, chargeDbm: 10, bsDbm: 0, txopMs: 4, read: true, write: false }
//   schema: q 0…8 (EPC Gen2 Q range 0–15; the model caps at 8 = 256 slots); ulKbps ∈ {250, 1000}; wupMs ≥ 1 (PM-73); txopMs 1…10 (model);
//     chargeDbm/bsDbm −10…30; epc exactly 24 hex chars; a backscatter tag needs its AP to have `backscatter` ("a backscatter tag needs an AP with the RFID inventory on");
//     backscatter tags are 2g only (as all tags); the AP's `backscatter` and Active Tx `slots` polling coexist: the AP alternates rounds (Task 3) — no schema rule.
```

- [ ] Tests: `freeSpacePl0Db(2440) ≈ 40.196`; `bsPathLossDb(2440, 0.1, 0) ≈ 20.20`; reach closed forms (0.328 / 0.232 m
  at bsDbm 0 **and** 10; activation 0.309 / 0.978 m); the 0307 table at L = 6 (PRX −46.4 / −58.4 / −70.5 dBm at 0.1 /
  0.2 / 0.4 m, SNR 23.6 / 11.6 / −0.5 dB against the −70 dBm floor); airtimes: RN16 112 µs → BST 142.4 µs; EPC 560 µs →
  BST 635.2 µs; Read reply 464 µs → BST 529.6; Query PPDU with 1 ms WUP 1 516.4 µs; QueryRep 452.4; ACK 1 009.2; Read
  1 063.6; Write 2 963.8 µs (T3 2 ms); at 1 Mb/s 1 424.0 / 360.0 / 547.2 / 680.8 / 2 792.2 µs; `crc16Epc` never 0 /
  0xffff and stable; schema rules and messages; old scenarios parse with `mode` absent.
- [ ] Commit `feat(amp): backscatter model — free-space law, reader floor, Gen2 frames and excitation timings; tag mode and RFID config`.

---

### Task 2: Channel physics for excitation PPDUs and backscattered replies

**Files:** modify `src/engine/channel.ts` (`RadioOpts.kind` gains `'bsTag'`; per-frame TX power over time; reader
floor for `ampBsReply`), `src/engine/phy.ts` only if a helper belongs there; tests `tests/engine/amp-bs-channel.test.ts`.

**Behaviour (model per spec "Reader model", "Tag behaviour", "Coexistence"):**

- A DL `ampRfid` PPDU radiates `chargeDbm` from its start through AMP-Data and `bsDbm` during its BST-Excitation
  (the last `bstNs` before the signal extension). The channel needs a per-frame, per-instant EIRP: add
  `txDbmAt(frame, offsetNs)` used by (a) the received power of the reply path, (b) Wi-Fi nodes' energy detection over
  the PPDU (max over the PPDU as today is acceptable: a Wi-Fi node defers for the whole L-SIG length regardless), (c)
  the Spectrum emission if one exists (2.4 GHz has none: no change).
- Wi-Fi radios receive an `ampRfid` PPDU exactly as a slice-1 DL AMP PPDU (legacy preamble at CCA_PD, L-SIG SINR,
  busy for `txTimeNs`): no change in code path; assert it.
- `'bsTag'` radios: receive `ampRfid` PPDUs only; RSSI computed with `bsPathLossDb(2440, d, walls)` at `chargeDbm`;
  floor `AMP_BS_ACTIVATION_DBM`; required SINR `AMP_DL_REQ_SINR_DB` against Wi-Fi interference as for tags today.
  They emit no CCA, cannot receive anything else.
- `ampBsReply` PPDUs: transmitted by a bsTag with a *virtual* power: the channel computes the AP's received power as
  `bsReplyDbm(frame.amp.rfidBsDbm ?? the last DL PPDU's bsDbm, bsPathLossDb(2440, d, walls))` — implement by giving the
  reply frame `amp.bs.incidentDbm` (the DL power the tag is reflecting, set by the tag from the PPDU it decoded) so
  `rxDbm = incidentDbm − AMP_BS_LOSS_DB − bsPathLossDb(tag→AP)`. Only the AP (`ampCapable`) receives it; its floor is
  `readerFloorDbm(monoLeakDbm(bsDbm))` and the required SINR `AMP_BS_REQ_SNR_DB[kbps]` against that floor plus Wi-Fi
  interference in band. Other Wi-Fi radios see the reply only as energy (never above −62 dBm: assert the geometry).
- Capture between two replies in one slot: the existing rule (5 dB within the sync).
- Receiving window: the AP accepts a reply only while its own BST-Excitation is on the air (the reply lands inside the
  PPDU the AP is transmitting — the one place the engine lets a node receive while transmitting: gate it on
  `frame.kind === 'ampBsReply'` and the AP's current DL PPDU being an `ampRfid` in its BST window).

- [ ] Tests: per-instant power (charge then BS); a bsTag at 0.3 m decodes the Query at 10 dBm and one at 0.35 m does
  not (activation 0.309 m); the AP decodes an RN16 from 0.3 m and not from 0.35 m at 250 kb/s (reach 0.328 m) and the
  boundary moves to 0.232 m at 1 Mb/s; the same boundaries at bsDbm 10 (floor rises with the excitation); two tags
  at equal distance collide, a 6 dB closer tag captures; a Wi-Fi station's CCA is busy for the whole PPDU incl. the
  excitation; a reply is never above −62 dBm at a station 1 m from the tag; an Active Tx scene's records unchanged.
- [ ] Commit `feat(amp): the channel radiates excitation at two powers and hears backscatter against the reader's own leakage`.

---

### Task 3: The inventory round, the backscatter tag, records, view, log, inspector, decoder

**Files:** create `src/engine/ampReader.ts` (`AmpInventoryRound`), `src/engine/ampBsSta.ts` (`AmpBsStaMac`); modify
`src/engine/mac.ts` (the AMP hook alternates: when `cfg.ampAp.backscatter` is set the poll starts an inventory round;
if both `slots` polling tags and backscatter tags exist, alternate rounds — model), `src/engine/simulation.ts` (register
bsTag radios, construct `AmpBsStaMac` for `mode: 'backscatter'` tags), `src/model/records.ts` (`AMP_RFID`,
`AMP_BS_COUNTER`, `AMP_BS_REPLY`, `AMP_INVENTORY`, `AMP_BS_BOOT`; `MacStateName` gains `'bsWait'`), `src/model/view.ts`
(+ `NodeView.amp.bs`, `ampRound.inventory`), `src/ui/format.ts` (log lines), `src/ui/Inspector.tsx` / rows
(inspector rows), `src/ui/FrameDetail.tsx` + `src/model/frameFields.ts` (RFID frame + PPDU layout with both excitations;
byte and segment sums), `src/ui/laneLayout.ts` (labels for the two kinds, `bsWait` label), `src/scene/effects.ts`
(colours), `src/ui/i18n.ts`; tests `tests/engine/amp-reader.test.ts`, `tests/engine/amp-bs-sta.test.ts`, view/format/
frameFields/lanes (+1 each).

**Behaviour (spec "The inventory round", "Tag behaviour"):**

```ts
// ampReader.ts
export class AmpInventoryRound {  // same deps shape as AmpApRound: { nodeId, q, now, emit, timing, transmit, done }
  constructor(cfg: AmpApCfg & { backscatter: NonNullable<AmpApCfg['backscatter']> }, deps)
  get active(): boolean
  start(): void        // CTS-to-self (Duration = txopMs), SIFS, then the command sequence; sessions persist across TXOPs:
                       //   session number increments once per pollIntervalMs (a new inventory); a TXOP that ends mid-round leaves `remainingSlots`
                       //   and the tags' counters/flags in place, and the next start() with the same session resumes with QueryRep
  onRxOk(frame, from): void   // RN16 (unique in this slot → ACK next), EPC (record read → Read next if cfg.read → Write if cfg.write), Read/Write replies
  onRxFail(reason): void      // collision in a slot → count, proceed after the BST ends
}
// Per command: emit AMP_RFID at TX start; the next command begins AMP_BS_T2_NS after the previous PPDU ends (incl. the BST window);
// the TXOP budget check happens before each command: if now + nextPpduNs > txopStart + txopMs, end the TXOP (emit AMP_INVENTORY with complete: false).
// AMP_INVENTORY { node, session, slotsOffered, read: epcs, collisions, empties, txopNs, complete } at every TXOP end.
// ampBsSta.ts
export class AmpBsStaMac implements PhyListener {
  // state: powered (booted this TXOP), counter: number | null, inventoried: boolean (session flag), rn16, lastIncidentDbm
  // onRxOk(ampRfid): if not powered: powered iff the PPDU had a WUP (wupNs ≥ AMP_BS_WUP_MIN_NS) and rssi ≥ AMP_BS_ACTIVATION_DBM → emit AMP_BS_BOOT; else ignore
  //   query(session): if session changed → inventoried = false; if inventoried → ignore; counter = rng.int(2^q − 1) → emit AMP_BS_COUNTER; if 0 → reply RN16 at T1 after AMP-Data ends
  //   queryRep: if counter > 0 → counter−−; if 0 → RN16
  //   ack(rn16): if rn16 matches mine and I replied RN16 in this slot → reply EPC → inventoried = true
  //   read / write (addressed by my 16-bit id): reply after T1 / T3
  // Replies go through ch.startTx with kind 'ampBsReply' and amp.bs.incidentDbm = the DL PPDU's bsDbm as received (chargeDbm − PL is what the tag sees during data; the reflected carrier is the BST-Excitation at bsDbm − PL: incidentDbm = bsDbm − PL(AP→tag))
  // powered resets when the TXOP's CTS-to-self Duration ends (the tag has no clock: model — it is unpowered the instant the carrier stops; implement as "unpowered at the end of every DL PPDU unless the next arrives within AMP_BS_T2_NS + 8 µs").
  // MAC states: idle / rx / bsWait (counter > 0 within a TXOP) / tx
}
```

- [ ] Tests (end to end with `Simulation` on small scenes, `oneRoom()`): the opening TXOP: CTS-to-self, Query with WUP,
  RN16 at exactly AMP-Data end + 16 µs, ACK, EPC, Read; `AMP_INVENTORY.read` lists the tag; Q = 2 with four tags at
  0.1–0.3 m: counters drawn once each (replay from the tags' RNG streams as the AMP slots tests do), collisions counted
  when two draw 0; Q = 0 with two tags: every round collides, nothing read; a TXOP of 4 ms stops before the command that
  would overrun (pin the count of commands) and the next TXOP resumes with QueryRep and the same session; a new session
  every `pollIntervalMs` clears the inventoried flags; Write's 2 ms T3; a tag at 0.35 m never boots (`AMP_BS_BOOT
  powered: false` or no record — decide and document); a Wi-Fi station on 2.4 GHz defers for every RFID PPDU;
  `protection: 'none'` with a saturated station: at least one reply lost to interference (pin); view/format/rows/
  frameFields (sums equal `bytes`/`txTimeNs` for both kinds)/lanes; Active Tx scenes byte-identical (fixture).
- [ ] Commit `feat(amp): mono-static backscatter — RFID inventory round, backscatter tag, records, inspector and decoder`.

---

### Task 4: Editor, i18n, Guide, glossary, README, EditorGuide

**Files:** `src/editor/FloorPlanEditor.tsx` (tag mode + EPC; AP **RFID inventory** section), `src/editor/planOps.ts`
(issue routing if needed), `src/ui/i18n.ts`, `src/ui/Guide.tsx` (AMP section gains "Backscatter (mono-static)"),
`src/ui/glossary.ts` (backscatter, mono-static, WUP-/BST-Excitation, EPC Gen2, Q / slot counter, RN16, EPC, reader
dynamic range, self-leakage), `README.md` (conformance rows + Known simplifications: nominal T1, no Q-adaptation,
Friis below 1 m, two powers in one PPDU as model), `src/editor/EditorGuide.tsx`; tests `tests/editor/*` (+2),
`tests/ui/*guide*` (+2).

- [ ] Commit `docs(amp): mono-static backscatter in the editor, Guide, glossary and README`.

---

### Task 5: Lesson "A tag with no radio"

**Files:** create `src/course/amp/amp-backscatter.ts`, `tests/course/amp-backscatter.test.ts`; modify
`src/course/lessons.ts`, `src/course/curriculum.ts` (`COURSE_ORDER` after `amp-coexist`), `src/course/lessonKit.ts`
(`bsTag()` builder, `firstAmpRfid`, `firstBsReply`, `firstInventory`); fixture additions only; neighbour tests that pin
the tail of module 7 or `COURSE_ORDER`.

- [ ] Lesson per spec "Lesson amp-backscatter" (scene, four variants, body, 4 / 2 / 3, ≤ 25 min): pin the reach
  independence of `bsDbm`, the activation limits, every airtime, the counters and collisions of the first rounds, the
  TXOP budget, the L-SIG deferral, the `none` variant's losses; inspector/log strings copied from i18n/format and pinned
  EN + ZH.
- [ ] Commit `feat(course): AMP lesson "A tag with no radio"`.

## Self-review

Spec A2 coverage: model/frames/config → T1; channel → T2; round/tag/records/UI → T3; editor/docs → T4; lesson → T5.
Names: `ampBs.ts`, `bsPathLossDb`, `readerFloorDbm`, `monoLeakDbm`, `bsReplyDbm`, `bsDecodes`, `monoReachM`,
`activationReachM`, `Gen2Cmd`, `Gen2Reply`, `ampRfidFrame`, `ampBsReplyFrame`, `AmpInventoryRound`, `AmpBsStaMac`,
records `AMP_RFID` / `AMP_BS_COUNTER` / `AMP_BS_REPLY` / `AMP_INVENTORY` / `AMP_BS_BOOT`, state `bsWait`, radio kind `bsTag`.
