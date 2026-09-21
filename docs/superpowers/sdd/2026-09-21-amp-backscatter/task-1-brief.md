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

