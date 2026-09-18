# AMP Tier (802.11bp Active Tx) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Battery-free AMP tags on the 2.4 GHz link that answer only when the AP's AC_BK polling round solicits them, with the round, its slotted random access and its Acks visible in the timeline, inspector and frame detail, plus three Tier 2 lessons whose every number is pinned by tests.

**Architecture:** A pure `amp.ts` module holds the P802.11bp constants, airtimes and frame builders. The channel learns two things: a radio kind (Wi-Fi vs tag) that decides what it can detect, and AMP decode thresholds. A small `AmpStaMac` (the tag) and an `AmpApRound` (the AP's round, driven by `WifiMac` through four hooks) are the only new state machines. Records feed the existing view reducer, lanes and inspector; the editor gains a tag tool and an AMP section on the AP. Lessons live in `src/course/amp/`.

**Tech Stack:** TypeScript, Vite, React, Three.js, zod, vitest.

**Spec:** `docs/superpowers/specs/2026-09-18-amp-tier-design.md`, Part B. **Prerequisite:** the 2.4 GHz link plan (`docs/superpowers/plans/2026-09-18-link-2g.md`) is fully merged: `LinkId '2g'`, `PhyTiming`, `timingFor`, `ERP_2G`, `linkOfVirtual`, `BAND_LABEL` exist.

## Global Constraints

- Source tags on every AMP constant: **SFD** (11-24/1613r20 motion id), **PDT** (11-26/1519r5 or 11-26/1889r4 clause), or **model** (our choice). Lessons cite the documents and say the standard is a draft (D0.5, May 2026; D1.0 letter ballot Sep 2026).
- AMP SIFS = 10 µs (SFD PM-96). DL PPDU = 32 µs legacy preamble + 80 µs AMP-Sync + 2-octet AMP-SIG at the DL rate + data at the DL rate + 20 µs padding + the link's 6 µs signal extension. UL PPDU = 48 sync chips at the rate's chip duration (1 / 0.25 / 0.125 µs for 250 kb/s / 1 Mb/s / 4 Mb/s) + data at the UL rate, no preamble, no extension.
- Frame sizes: header 5 (FC 1, ID 2, TDC 2), FCS 2; Trigger body 6 + 2 per scheduled STA id; Ack 4 (FC 1, ID 2, CRC-8 1); response body 0 (id only) or 8 (reading).
- Worked airtimes (must hold exactly): trigger @250 kb/s 618 µs, @1 Mb/s 258 µs; Ack @250 kb/s 330 µs, @1 Mb/s 186 µs; response @250 kb/s 272 / 528 µs, @1 Mb/s 68 / 132 µs, @4 Mb/s 20 / 36 µs.
- Decoding (model): AP requires SINR 10 / 12 / 15 dB and RSSI ≥ noise(2 / 4 / 8 MHz) + that SINR (−94 / −89 / −83 dBm) for 250 kb/s / 1 Mb/s / 4 Mb/s; a tag requires RSSI ≥ its `dlSensDbm` (default −72) and SINR ≥ 8 dB for a DL PPDU; a Wi-Fi radio decodes a DL AMP PPDU as a 6 Mb/s frame (L-SIG) and cannot detect a UL AMP PPDU (energy detect only).
- The round runs on the AP's AC_BK EDCAF, is one exchange, and is protected by a 6 Mb/s CTS-to-self whose Duration covers the round when `protection: 'ctsSelf'`.
- Slot 1 starts AMP SIFS after the trigger's end; slot k ≥ 2 starts AMP SIFS after the end of Ack_{k−1}; every Ack PPDU has the same duration and uses the trigger's DL rate; Ack_k's ID is the tag heard in slot k or the AP's id.
- ABOC uniform in [0, ACW], ACW = 2^ACWE − 1; ABOC < N → slot ABOC + 1, else sit out.
- Existing scenarios keep their timeline hashes (`tests/engine/lesson-hashes.test.ts`).
- Every new UI string in both `en` and `zh`. Commit after every task with the session's attribution lines.

---

### Task 1: `amp.ts`: constants, airtimes, sizes, frame builders

**Files:**
- Create: `src/engine/amp.ts`
- Modify: `src/model/frames.ts` (add kinds and `AmpInfo`)
- Test: `tests/engine/amp-phy.test.ts`

**Interfaces (produced):**

```ts
// src/model/frames.ts
export type FrameKind = 'data' | 'ack' | 'rts' | 'cts' | 'ba' | 'trigger' | 'mba' | 'cfend' | 'ampTrigger' | 'ampAck' | 'ampResp'
/** P802.11bp fields of an AMP frame; present on the three AMP kinds only. */
export interface AmpInfo {
  dir: 'dl' | 'ul'
  /** Data rate of the AMP-Data field in kb/s (250 / 1000 DL; 250 / 1000 / 4000 UL). */
  kbps: number
  /** Triggers: the UL data rate the solicited responses must use (PDT 39.3.2.1 "UL data rate"). */
  ulKbps?: number
  /** Triggers: which access phase this round is. */
  phase?: 'random' | 'scheduled'
  /** Triggers: Number of Slots, Slot Duration, ACWE, Session ID, scheduled STA id list, and the round's total air after this PPDU. */
  slots?: number
  slotNs?: Ns
  acwe?: number
  sessionId?: number
  staIds?: string[]
  roundNs?: Ns
  /** Triggers: whether the solicited response carries a reading (frame body). */
  reading?: boolean
  /** Responses: the slot it was sent in and the ABOC that chose it (undefined when scheduled). */
  slot?: number
  aboc?: number
  /** Acks: the slot this Ack closes. */
  ackFor?: number
  /** DL PPDUs: the padding field length. */
  padNs?: Ns
}
// FrameDesc gains:  amp?: AmpInfo
```

```ts
// src/engine/amp.ts
export type AmpDlKbps = 250 | 1000
export type AmpUlKbps = 250 | 1000 | 4000
export const AMP_SIFS_NS: Ns = 10_000                     // SFD PM-96
export const AMP_LEGACY_PREAMBLE_NS: Ns = 32_000          // SFD PM-15: L-STF 8 + L-LTF 8 + L-SIG 4 + RL-SIG 4 + U-SIG 8
export const AMP_DL_SYNC_NS: Ns = 80_000                  // SFD PM-40/53/71: (32 + 8) chips × 2 µs
export const AMP_DL_SIG_BYTES = 2                         // SFD PM-105
export const AMP_PADDING_NS: Ns = 20_000                  // PDT 39.3.2.2 (unprotected trigger / Ack)
export const AMP_PADDING_PROTECTED_NS: Ns = 36_000        // PDT 39.3.2.2 (protected trigger; unused in this slice)
export const AMP_UL_SYNC_CHIPS = 48                       // SFD PM-51
export const AMP_UL_CHIP_NS: Record<AmpUlKbps, Ns>        // SFD PM-50/93: { 250: 1000, 1000: 250, 4000: 125 }
export const AMP_HDR_BYTES = 5                            // SFD FM-14/16/17/18: FC 1 + ID 2 + TDC 2 (widths: model where TBD)
export const AMP_FCS_BYTES = 2                            // SFD FM-20
export const AMP_ACK_BYTES = 4                            // SFD FM-33/FM-49: FC 1 + ID 2 + CRC-8 1
export const AMP_TRIGGER_BODY_BYTES = 6                   // model: Session ID 1, ACWE|Slots 1, Slot Duration 2, UL rate|seed|channel 1, Response type 1
export const AMP_STA_ID_BYTES = 2                         // SFD FM-17 (16-bit id)
export const AMP_READING_BYTES = 8                        // model: one sensor reading
export const AMP_DL_REQ_SINR_DB = 8                       // model
export const AMP_TAG_DL_SENS_DBM = -72                    // model (envelope detector)
export const AMP_UL_REQ_SINR_DB: Record<AmpUlKbps, number> // model: { 250: 10, 1000: 12, 4000: 15 }
export const AMP_UL_BW_MHZ: Record<AmpUlKbps, number>      // model: { 250: 2, 1000: 4, 4000: 8 }
export function ampUlSensDbm(kbps: AmpUlKbps): number       // noiseDbm(AMP_UL_BW_MHZ[kbps]) + AMP_UL_REQ_SINR_DB[kbps]
export function ampBitsNs(bits: number, kbps: number): Ns   // bits × 1e6 / kbps, rounded to integer ns
export function ampDlPpduNs(kbps: AmpDlKbps, bytes: number, signalExtNs: Ns, padNs = AMP_PADDING_NS): Ns
export function ampUlPpduNs(kbps: AmpUlKbps, bytes: number): Ns
export function ampTriggerBytes(scheduledIds: number): number
export function ampRespBytes(reading: boolean): number
export function ampId16(nodeId: string): number             // FNV-1a of the id, masked to 16 bits, never 0 or 0xffff
export interface AmpTriggerArgs { src: string; dlKbps: AmpDlKbps; ulKbps: AmpUlKbps; phase: 'random' | 'scheduled'; slots: number; slotNs: Ns; acwe: number; sessionId: number; staIds: string[]; reading: boolean; roundNs: Ns; signalExtNs: Ns }
export function ampTriggerFrame(a: AmpTriggerArgs): FrameDesc   // kind 'ampTrigger', dst '*amp', mbps = dlKbps / 1000, durationFieldNs 0
export function ampAckFrame(src: string, ackDst: string, dlKbps: AmpDlKbps, ackFor: number, signalExtNs: Ns): FrameDesc  // kind 'ampAck', dst = ackDst
export function ampRespFrame(src: string, dst: string, ulKbps: AmpUlKbps, slot: number, aboc: number | undefined, reading: boolean): FrameDesc // kind 'ampResp'
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/engine/amp-phy.test.ts
import { describe, it, expect } from 'vitest'
import {
  AMP_ACK_BYTES, AMP_SIFS_NS, ampAckFrame, ampDlPpduNs, ampId16, ampRespBytes, ampRespFrame, ampTriggerBytes, ampTriggerFrame, ampUlPpduNs, ampUlSensDbm,
} from '../../src/engine/amp'
import { noiseDbm } from '../../src/engine/phy'

describe('AMP PHY airtimes (SFD 11-24/1613r20, PDT 11-26/1519r5)', () => {
  it('AMP SIFS is 10 µs (PM-96)', () => expect(AMP_SIFS_NS).toBe(10_000))
  it('frame sizes', () => {
    expect(ampTriggerBytes(0)).toBe(13)
    expect(ampTriggerBytes(3)).toBe(19)
    expect(AMP_ACK_BYTES).toBe(4)
    expect(ampRespBytes(false)).toBe(7)
    expect(ampRespBytes(true)).toBe(15)
  })
  it('DL PPDU: 32 + 80 + SIG + data + 20 padding + 6 extension', () => {
    expect(ampDlPpduNs(250, 13, 6_000)).toBe(618_000)
    expect(ampDlPpduNs(1000, 13, 6_000)).toBe(258_000)
    expect(ampDlPpduNs(250, 4, 6_000)).toBe(330_000)
    expect(ampDlPpduNs(1000, 4, 6_000)).toBe(186_000)
    expect(ampDlPpduNs(250, 13, 0)).toBe(612_000)
  })
  it('UL PPDU: 48 sync chips + data, no preamble', () => {
    expect(ampUlPpduNs(250, 7)).toBe(272_000)
    expect(ampUlPpduNs(250, 15)).toBe(528_000)
    expect(ampUlPpduNs(1000, 7)).toBe(68_000)
    expect(ampUlPpduNs(1000, 15)).toBe(132_000)
    expect(ampUlPpduNs(4000, 7)).toBe(20_000)
    expect(ampUlPpduNs(4000, 15)).toBe(36_000)
  })
  it('AP sensitivity for UL OOK = noise in the OOK bandwidth + required SINR (model)', () => {
    expect(Math.round(ampUlSensDbm(250))).toBe(Math.round(noiseDbm(2) + 10))
    expect(Math.round(ampUlSensDbm(1000))).toBe(Math.round(noiseDbm(4) + 12))
    expect(Math.round(ampUlSensDbm(4000))).toBe(Math.round(noiseDbm(8) + 15))
    expect(ampUlSensDbm(250)).toBeCloseTo(-94, 0)
    expect(ampUlSensDbm(1000)).toBeCloseTo(-89, 0)
    expect(ampUlSensDbm(4000)).toBeCloseTo(-83, 0)
  })
  it('frame builders fill the FrameDesc consistently', () => {
    const tr = ampTriggerFrame({ src: 'ap', dlKbps: 250, ulKbps: 250, phase: 'random', slots: 4, slotNs: 272_000, acwe: 2, sessionId: 1, staIds: [], reading: false, roundNs: 1_000_000, signalExtNs: 6_000 })
    expect(tr).toMatchObject({ kind: 'ampTrigger', src: 'ap', dst: '*amp', bytes: 13, mbps: 0.25, txTimeNs: 618_000, durationFieldNs: 0 })
    expect(tr.amp).toMatchObject({ dir: 'dl', kbps: 250, phase: 'random', slots: 4, slotNs: 272_000, acwe: 2, padNs: 20_000 })
    const ack = ampAckFrame('ap', 'tag-1', 250, 2, 6_000)
    expect(ack).toMatchObject({ kind: 'ampAck', dst: 'tag-1', bytes: 4, txTimeNs: 330_000 })
    expect(ack.amp).toMatchObject({ dir: 'dl', ackFor: 2 })
    const resp = ampRespFrame('tag-1', 'ap', 250, 3, 2, true)
    expect(resp).toMatchObject({ kind: 'ampResp', src: 'tag-1', dst: 'ap', bytes: 15, mbps: 0.25, txTimeNs: 528_000 })
    expect(resp.amp).toMatchObject({ dir: 'ul', slot: 3, aboc: 2, reading: true })
  })
  it('16-bit ids are stable, non-zero and never the broadcast value', () => {
    expect(ampId16('tag-1')).toBe(ampId16('tag-1'))
    expect(ampId16('tag-1')).not.toBe(ampId16('tag-2'))
    for (const id of ['a', 'tag-1', 'tag-2', 'sensor-9']) {
      const v = ampId16(id)
      expect(v).toBeGreaterThan(0)
      expect(v).toBeLessThan(0xffff)
    }
  })
})
```

- [ ] **Step 2: Run to see it fail** — `npx vitest run tests/engine/amp-phy.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `src/model/frames.ts` additions and `src/engine/amp.ts`**

```ts
// src/engine/amp.ts
/**
 * IEEE P802.11bp Ambient Power (AMP), Active Tx mode in 2.4 GHz: constants,
 * airtimes and frame builders. Sources: TGbp Specification Framework
 * 11-24/1613r20 (SFD, motion ids), proposed draft text 11-26/1519r5 (PDT,
 * triggering procedure) and 11-26/1889r4 (PDT, UL channel access). Values the
 * draft leaves TBD or does not publish are marked "model".
 */
import { noiseDbm } from './phy'
import type { FrameDesc } from '../model/frames'
import type { Ns } from '../model/types'

export type AmpDlKbps = 250 | 1000
export type AmpUlKbps = 250 | 1000 | 4000

export const AMP_SIFS_NS: Ns = 10_000
export const AMP_LEGACY_PREAMBLE_NS: Ns = 32_000
export const AMP_DL_SYNC_NS: Ns = 80_000
export const AMP_DL_SIG_BYTES = 2
export const AMP_PADDING_NS: Ns = 20_000
export const AMP_PADDING_PROTECTED_NS: Ns = 36_000
export const AMP_UL_SYNC_CHIPS = 48
export const AMP_UL_CHIP_NS: Record<AmpUlKbps, Ns> = { 250: 1000, 1000: 250, 4000: 125 }
export const AMP_HDR_BYTES = 5
export const AMP_FCS_BYTES = 2
export const AMP_ACK_BYTES = 4
export const AMP_TRIGGER_BODY_BYTES = 6
export const AMP_STA_ID_BYTES = 2
export const AMP_READING_BYTES = 8
export const AMP_DL_REQ_SINR_DB = 8
export const AMP_TAG_DL_SENS_DBM = -72
export const AMP_UL_REQ_SINR_DB: Record<AmpUlKbps, number> = { 250: 10, 1000: 12, 4000: 15 }
export const AMP_UL_BW_MHZ: Record<AmpUlKbps, number> = { 250: 2, 1000: 4, 4000: 8 }
/** Broadcast destination of an AMP triggering frame. */
export const AMP_BROADCAST = '*amp'

export function ampUlSensDbm(kbps: AmpUlKbps): number {
  return noiseDbm(AMP_UL_BW_MHZ[kbps]) + AMP_UL_REQ_SINR_DB[kbps]
}

/** Airtime of `bits` Manchester-OOK bits at `kbps` (the rate already accounts for the two chips per bit). */
export function ampBitsNs(bits: number, kbps: number): Ns {
  return Math.round((bits * 1e6) / kbps)
}

export function ampDlPpduNs(kbps: AmpDlKbps, bytes: number, signalExtNs: Ns, padNs: Ns = AMP_PADDING_NS): Ns {
  return AMP_LEGACY_PREAMBLE_NS + AMP_DL_SYNC_NS + ampBitsNs(AMP_DL_SIG_BYTES * 8, kbps) + ampBitsNs(bytes * 8, kbps) + padNs + signalExtNs
}

export function ampUlPpduNs(kbps: AmpUlKbps, bytes: number): Ns {
  return AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[kbps] + ampBitsNs(bytes * 8, kbps)
}

export function ampTriggerBytes(scheduledIds: number): number {
  return AMP_HDR_BYTES + AMP_TRIGGER_BODY_BYTES + AMP_STA_ID_BYTES * scheduledIds + AMP_FCS_BYTES
}

export function ampRespBytes(reading: boolean): number {
  return AMP_HDR_BYTES + (reading ? AMP_READING_BYTES : 0) + AMP_FCS_BYTES
}

export function ampId16(nodeId: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < nodeId.length; i++) {
    h ^= nodeId.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  const v = (h >>> 0) & 0xffff
  return v === 0 || v === 0xffff ? 0x5a5a : v
}

export interface AmpTriggerArgs {
  src: string; dlKbps: AmpDlKbps; ulKbps: AmpUlKbps; phase: 'random' | 'scheduled'
  slots: number; slotNs: Ns; acwe: number; sessionId: number; staIds: string[]; reading: boolean; roundNs: Ns; signalExtNs: Ns
}

export function ampTriggerFrame(a: AmpTriggerArgs): FrameDesc {
  const bytes = ampTriggerBytes(a.phase === 'scheduled' ? a.staIds.length : 0)
  return {
    kind: 'ampTrigger', src: a.src, dst: AMP_BROADCAST, bytes, mbps: a.dlKbps / 1000,
    durationFieldNs: 0, txTimeNs: ampDlPpduNs(a.dlKbps, bytes, a.signalExtNs),
    amp: {
      dir: 'dl', kbps: a.dlKbps, ulKbps: a.ulKbps, phase: a.phase, slots: a.slots, slotNs: a.slotNs, acwe: a.acwe, sessionId: a.sessionId,
      staIds: a.staIds, reading: a.reading, roundNs: a.roundNs, padNs: AMP_PADDING_NS,
    },
  }
}

export function ampAckFrame(src: string, ackDst: string, dlKbps: AmpDlKbps, ackFor: number, signalExtNs: Ns): FrameDesc {
  return {
    kind: 'ampAck', src, dst: ackDst, bytes: AMP_ACK_BYTES, mbps: dlKbps / 1000,
    durationFieldNs: 0, txTimeNs: ampDlPpduNs(dlKbps, AMP_ACK_BYTES, signalExtNs),
    amp: { dir: 'dl', kbps: dlKbps, ackFor, padNs: AMP_PADDING_NS },
  }
}

export function ampRespFrame(src: string, dst: string, ulKbps: AmpUlKbps, slot: number, aboc: number | undefined, reading: boolean): FrameDesc {
  const bytes = ampRespBytes(reading)
  return {
    kind: 'ampResp', src, dst, bytes, mbps: ulKbps / 1000,
    durationFieldNs: 0, txTimeNs: ampUlPpduNs(ulKbps, bytes),
    amp: { dir: 'ul', kbps: ulKbps, slot, aboc, reading },
  }
}
```

Adding three values to `FrameKind` breaks exhaustive `Record<FrameKind, …>` tables and switches. Fix them in this task so `npx tsc -b` passes (content is refined in Task 7):
- `src/ui/i18n.ts` `frameDetail.kindName / whatIs / next` (both languages): `ampTrigger: 'AMP Trigger'` / `'AMP 触发帧'`, `ampAck: 'AMP Ack'` / `'AMP 确认帧'`, `ampResp: 'AMP response'` / `'AMP 应答帧'`; `whatIs` and `next` one sentence each (en: "The AP's ambient-power trigger: it names N uplink slots and the rules for choosing one." / "A tag that chose a slot answers there; the AP acknowledges every slot." etc.; zh translations alongside).
- `src/model/frameFields.ts` `SUBTYPE`: `ampTrigger: 'AMP Trigger', ampAck: 'AMP Ack', ampResp: 'AMP Response'` and `SUBTYPE_BITS` entries `'AMP Trigger': '—', 'AMP Ack': '—', 'AMP Response': '—'`; in `controlMpdu` add a temporary `case 'ampTrigger': case 'ampAck': case 'ampResp': fields = [{ key: 'body', bytes: f.bytes, value: 'AMP' }]; break` (replaced in Task 7).
- `src/scene/effects.ts` `frameColor`: `case 'ampTrigger': case 'ampAck': return 0x2dd4bf; case 'ampResp': return 0xa78bfa`.
- `tests/ui/i18n.test.ts` KINDS list: add the three kinds.

- [ ] **Step 4: Run** — `npx vitest run tests/engine/amp-phy.test.ts tests/ui/i18n.test.ts && npx tsc -b` → PASS.

- [ ] **Step 5: Commit** — `git add src/engine/amp.ts src/model/frames.ts src/ui/i18n.ts src/model/frameFields.ts src/scene/effects.ts tests/engine/amp-phy.test.ts tests/ui/i18n.test.ts && git commit -m "feat(amp): P802.11bp Active Tx constants, airtimes and frame builders"`

---

### Task 2: Model types: tags, AP AMP config, records, view state

**Files:**
- Modify: `src/model/types.ts` (`NodeKind`), `src/model/scenario.ts` (`NodeCfg`, schema, `AmpApCfg`, `AmpTagCfg`), `src/model/records.ts` (`MacStateName`, four records), `src/model/view.ts` (`NodeView.amp`, `NodeView.ampRound`, `initViewState`, `applyRecord`)
- Modify: exhaustive switches on `MacStateName`: `src/scene/nodes.ts` `haloColor` (add `case 'ampWait': return 0x0d9488`), `src/ui/laneLayout.ts` `STATE_SPAN` (add `ampWait: 'slot'` — requires the `SpanKind` change in Task 6; for now map `ampWait: 'sifs'` and change it in Task 6)
- Test: `tests/model/scenario.test.ts`, `tests/model/view.test.ts`

**Interfaces (produced):**

```ts
// types.ts
export type NodeKind = 'ap' | 'sta' | 'amp'
// scenario.ts
export interface AmpApCfg {
  pollIntervalMs: number; slots: number; acwe: number; dlKbps: 250 | 1000; ulKbps: 250 | 1000 | 4000
  protection: 'ctsSelf' | 'none'; readMode: 'inline' | 'twoPhase'
}
export const DEFAULT_AMP_AP: AmpApCfg = { pollIntervalMs: 100, slots: 4, acwe: 2, dlKbps: 250, ulKbps: 250, protection: 'ctsSelf', readMode: 'inline' }
export interface AmpTagCfg { id16?: number; dlSensDbm?: number }
// NodeCfg gains:  ampAp?: AmpApCfg   (AP, generation eht only)   ampTag?: AmpTagCfg   (kind 'amp' only)
// records.ts
export type MacStateName = ... | 'ampWait'
  | { type: 'AMP_ROUND'; node: string; phase: 'random' | 'scheduled'; slots: number; slotNs: Ns; acwe: number; dlKbps: number; ulKbps: number; untilNs: Ns }
  | { type: 'AMP_SLOT'; node: string; slot: number; untilNs: Ns }
  | { type: 'AMP_ABOC'; node: string; aboc: number; acw: number; slot: number | null }
  | { type: 'AMP_RESULT'; node: string; slot: number; sent: boolean; acked: boolean }
// view.ts
export interface AmpTagView { aboc: number | null; acw: number; slot: number | null; sent: number; acked: number; lost: number; roundsHeard: number; roundsSatOut: number }
export interface AmpRoundView { phase: 'random' | 'scheduled'; slot: number; slots: number; untilNs: Ns; received: string[] }
// NodeView gains:  amp?: AmpTagView   ampRound?: AmpRoundView | null
```

Schema rules: `kind: z.enum(['ap', 'sta', 'amp'])`; a node with `kind: 'amp'` must have `linkId` absent or `'2g'` (the plan forces 2g), `profiles` normalised to `['idle']`, and may carry `ampTag`; `ampAp` is allowed only on `kind: 'ap'` with `caps.generation === 'eht'` (superRefine messages: "AMP tags live on the 2.4 GHz link", "AMP polling needs a Wi-Fi 7 AP (the AMP DL PPDU carries U-SIG)"). `ampAp` fields: `pollIntervalMs` 10–10000, `slots` 1–16, `acwe` 0–4, enums as above.

- [ ] **Step 1: Write the failing tests**

`tests/model/scenario.test.ts`:
```ts
import { DEFAULT_AMP_AP, ScenarioSchema, defaultScenario } from '../../src/model/scenario'

describe('AMP nodes in the schema', () => {
  it('a tag is kind amp on 2.4 GHz; AMP polling needs a Wi-Fi 7 AP', () => {
    const sc = defaultScenario()
    sc.nodes[0].caps = { generation: 'eht', features: { edca: true } }
    sc.nodes[0].ampAp = { ...DEFAULT_AMP_AP }
    sc.nodes.push({ id: 'tag-1', kind: 'amp', name: 'Tag', pos: { x: 3, y: 3, z: 1 }, txPowerDbm: 0, profiles: ['idle'], caps: { generation: 'nonht', features: {} }, ampTag: { dlSensDbm: -70 } })
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    sc.nodes[3].linkId = '5g'
    expect(() => ScenarioSchema.parse(sc)).toThrow(/2\.4 GHz/)
    sc.nodes[3].linkId = '2g'
    sc.nodes[0].caps.generation = 'he'
    expect(() => ScenarioSchema.parse(sc)).toThrow(/Wi-Fi 7/)
  })
})
```

`tests/model/view.test.ts` (append; look at the file's existing helpers for building a `ViewState`, e.g. `initViewState(scenario)`):
```ts
describe('AMP records in the view', () => {
  it('tracks a tag through draw, slot, result and the AP through its round', () => {
    const sc = defaultScenario()
    sc.nodes[0].caps = { generation: 'eht', features: { edca: true } }
    sc.nodes[0].ampAp = { ...DEFAULT_AMP_AP }
    sc.nodes.push({ id: 'tag-1', kind: 'amp', name: 'Tag', pos: { x: 3, y: 3, z: 1 }, txPowerDbm: 0, profiles: ['idle'], caps: { generation: 'nonht', features: {} } })
    const vs = initViewState(sc)
    expect(vs.nodes['tag-1#2g'].amp).toEqual({ aboc: null, acw: 0, slot: null, sent: 0, acked: 0, lost: 0, roundsHeard: 0, roundsSatOut: 0 })
    expect(vs.nodes['ap#2g'].ampRound).toBeNull()
    let seq = 0
    const rec = (r: Omit<TLRecord, 'seq'>) => applyRecord(vs, { ...r, seq: seq++ } as TLRecord)
    rec({ t: 0, type: 'AMP_ROUND', node: 'ap#2g', phase: 'random', slots: 4, slotNs: 272_000, acwe: 2, dlKbps: 250, ulKbps: 250, untilNs: 3_000_000 })
    expect(vs.nodes['ap#2g'].ampRound).toEqual({ phase: 'random', slot: 0, slots: 4, untilNs: 3_000_000, received: [] })
    rec({ t: 618_000, type: 'AMP_ABOC', node: 'tag-1#2g', aboc: 1, acw: 3, slot: 2 })
    expect(vs.nodes['tag-1#2g'].amp).toMatchObject({ aboc: 1, acw: 3, slot: 2, roundsHeard: 1 })
    rec({ t: 628_000, type: 'AMP_SLOT', node: 'ap#2g', slot: 1, untilNs: 900_000 })
    expect(vs.nodes['ap#2g'].ampRound!.slot).toBe(1)
    rec({ t: 1_300_000, type: 'AMP_RESULT', node: 'tag-1#2g', slot: 2, sent: true, acked: true })
    expect(vs.nodes['tag-1#2g'].amp).toMatchObject({ aboc: null, slot: null, sent: 1, acked: 1, lost: 0 })
    rec({ t: 2_000_000, type: 'AMP_ABOC', node: 'tag-1#2g', aboc: 5, acw: 7, slot: null })
    expect(vs.nodes['tag-1#2g'].amp!.roundsSatOut).toBe(1)
    rec({ t: 2_500_000, type: 'AMP_RESULT', node: 'tag-1#2g', slot: 3, sent: true, acked: false })
    expect(vs.nodes['tag-1#2g'].amp!.lost).toBe(1)
  })
})
```

- [ ] **Step 2: Run to see them fail** — `npx vitest run tests/model/scenario.test.ts tests/model/view.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`scenario.ts`: types and defaults as in the interface block; schema entries:
```ts
    kind: z.enum(['ap', 'sta', 'amp']),
    ampAp: z.object({
      pollIntervalMs: z.number().min(10).max(10_000), slots: z.number().int().min(1).max(16), acwe: z.number().int().min(0).max(4),
      dlKbps: z.union([z.literal(250), z.literal(1000)]), ulKbps: z.union([z.literal(250), z.literal(1000), z.literal(4000)]),
      protection: z.enum(['ctsSelf', 'none']), readMode: z.enum(['inline', 'twoPhase']),
    }).optional(),
    ampTag: z.object({ id16: z.number().int().min(1).max(0xfffe).optional(), dlSensDbm: z.number().optional() }).optional(),
```
and in the node `superRefine`:
```ts
      if (n.kind === 'amp' && n.linkId !== undefined && n.linkId !== '2g') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'AMP tags live on the 2.4 GHz link' })
      if (n.ampAp && !(n.kind === 'ap' && n.caps.generation === 'eht')) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'AMP polling needs a Wi-Fi 7 AP (the AMP DL PPDU carries U-SIG)' })
```
`caps.ts` `nodeLinks`: `if (n.kind === 'amp') return ['2g']` as the first line.

`records.ts`: add `'ampWait'` and the four record variants.

`view.ts`: add the two interfaces; in `initViewState`, for `cfg.kind === 'amp'` set `amp: { aboc: null, acw: 0, slot: null, sent: 0, acked: 0, lost: 0, roundsHeard: 0, roundsSatOut: 0 }` and `acs: null`; for the AP set `ampRound: null` on every AP lane. In `applyRecord`:
```ts
    case 'AMP_ROUND': { const n = vs.nodes[r.node]; n.ampRound = { phase: r.phase, slot: 0, slots: r.slots, untilNs: r.untilNs, received: [] }; break }
    case 'AMP_SLOT': { const n = vs.nodes[r.node]; if (n.ampRound) n.ampRound.slot = r.slot; break }
    case 'AMP_ABOC': { const a = vs.nodes[r.node].amp; if (!a) break; a.aboc = r.aboc; a.acw = r.acw; a.slot = r.slot; a.roundsHeard++; if (r.slot === null) a.roundsSatOut++; break }
    case 'AMP_RESULT': { const a = vs.nodes[r.node].amp; if (!a) break; if (r.sent) a.sent++; if (r.acked) a.acked++; else a.lost++; a.aboc = null; a.slot = null; break }
```
In the existing `RX_OK` case, when `r.frame.kind === 'ampResp'` and the receiving node has `ampRound`, push `r.from` onto `ampRound.received`. When a `TX_START` of an `ampTrigger` arrives, leave `ampRound` as set by `AMP_ROUND`; when the round's last Ack `TX_END` arrives (`r.frame.kind === 'ampAck' && r.frame.amp?.ackFor === n.ampRound?.slots`), set `ampRound = null` only if `ampRound.phase === 'scheduled'` or the scenario's read mode is inline (the reducer does not know the config, so instead: keep `ampRound` until the next `AMP_ROUND` or a `MAC_STATE` record other than `tx`/`waitAck` on that node; implement the latter: in the `MAC_STATE` case, `if (r.state !== 'tx' && r.state !== 'waitAck') n.ampRound = null`).

- [ ] **Step 4: Run** — `npx vitest run tests/model && npx tsc -b` → PASS. Also `npx vitest run tests/engine/lesson-hashes.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(model): AMP tags, AP polling config, AMP records and view state"`

---

### Task 3: Channel: radio kinds, AMP detection and decode thresholds

**Files:**
- Modify: `src/engine/channel.ts` (`RadioState`, `register`, `applyOneTx`, `detectOrMiss`, `decodeThreshDb`, `captureWindowNs`, `othersMw`, `interferenceMw`, `updateAllCca`)
- Test: `tests/engine/amp-collision.test.ts`

**Interfaces (produced):**
```ts
export interface RadioOpts {
  /** 'wifi' (default) decodes 802.11 PPDUs and DL AMP PPDUs' legacy preamble; 'tag' decodes only DL AMP PPDUs. */
  kind?: 'wifi' | 'tag'
  /** Wi-Fi radio that can also decode UL AMP PPDUs (the AMP AP). */
  ampCapable?: boolean
  /** Tags: minimum RSSI to detect a DL AMP PPDU (default AMP_TAG_DL_SENS_DBM). */
  floorDbm?: number
  /** false: never emit CCA records nor call onCcaBusy/onCcaIdle (tags have no carrier sense). */
  cca?: boolean
}
register(nodeId: string, listener: PhyListener, opts?: RadioOpts): void
```

Rules (`private detectFloorDbm(r: RadioState, frame: FrameDesc): number | null`, null = undetectable):
- `frame.amp?.dir === 'ul'`: `r.ampCapable ? ampUlSensDbm(kbps) : null`.
- `frame.amp?.dir === 'dl'`: `r.kind === 'tag' ? r.floorDbm : CCA_PD_DBM`.
- Wi-Fi frame: `r.kind === 'tag' ? null : CCA_PD_DBM`.

`decodeThreshDb(frame, rid, r)`: UL AMP → `AMP_UL_REQ_SINR_DB[kbps]`; DL AMP → tag: `AMP_DL_REQ_SINR_DB`, Wi-Fi: `sinrThreshDb(6)`; otherwise unchanged. `captureWindowNs`: AMP DL → `AMP_LEGACY_PREAMBLE_NS + AMP_DL_SYNC_NS`; AMP UL → `AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[kbps]`. Noise bandwidth for AMP UL frames: `AMP_UL_BW_MHZ[kbps]` instead of `frame.widthMhz ?? 20` (in `detectOrMiss` and `interferenceMw`). `updateAllCca`: `anyPd` only counts frames whose `amp?.dir !== 'ul'`; radios with `cca === false` are skipped entirely.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/engine/amp-collision.test.ts
import { describe, it, expect } from 'vitest'
import { Channel, type PhyListener } from '../../src/engine/channel'
import { EventQueue } from '../../src/engine/events'
import { makeEmitter, type TLRecord } from '../../src/model/records'
import { ampAckFrame, ampRespFrame, ampTriggerFrame } from '../../src/engine/amp'
import type { FrameDesc } from '../../src/model/frames'

function world(links: Record<string, number>, radios: { id: string; opts?: Parameters<Channel['register']>[2] }[]) {
  const q = new EventQueue()
  let now = 0
  const ids = radios.map((r) => r.id)
  const table = new Map(ids.map((tx) => [tx, new Map(ids.filter((rx) => rx !== tx).map((rx) => [rx, links[`${tx}>${rx}`] ?? -200]))]))
  const records: TLRecord[] = []
  const ch = new Channel(q, () => now, table, makeEmitter((r) => records.push(r)))
  const heard: Record<string, string[]> = {}
  for (const r of radios) {
    heard[r.id] = []
    const l: PhyListener = { onCcaBusy() {}, onCcaIdle() {}, onRxStart() {}, onRxOk(_t, f, from) { heard[r.id].push(`${f.kind}:${from}`) }, onRxCorrupt() {} }
    ch.register(r.id, l, r.opts)
  }
  const run = (t: number) => { for (;;) { const pt = q.peekTime(); if (pt === null || pt > t) break; const e = q.pop()!; now = e.t; e.fn() } now = t }
  const at = (t: number, fn: () => void) => q.schedule(t, fn)
  return { ch, records, heard, run, at }
}
const trigger = (): FrameDesc => ampTriggerFrame({ src: 'ap', dlKbps: 250, ulKbps: 250, phase: 'random', slots: 4, slotNs: 272_000, acwe: 2, sessionId: 1, staIds: [], reading: false, roundNs: 0, signalExtNs: 6_000 })

describe('AMP frames on the channel', () => {
  it('a tag decodes a DL AMP PPDU above its floor and never a Wi-Fi frame', () => {
    const w = world({ 'ap>tag': -60, 'ap>sta': -60 }, [{ id: 'ap', opts: { ampCapable: true } }, { id: 'tag', opts: { kind: 'tag', cca: false } }, { id: 'sta' }])
    w.at(0, () => w.ch.startTx('ap', trigger()))
    w.run(1_000_000)
    expect(w.heard.tag).toEqual(['ampTrigger:ap'])
    expect(w.heard.sta).toEqual(['ampTrigger:ap']) // the legacy preamble + L-SIG decode
    const cts: FrameDesc = { kind: 'cts', src: 'ap', dst: 'ap', bytes: 14, mbps: 6, durationFieldNs: 0, txTimeNs: 50_000 }
    w.at(2_000_000, () => w.ch.startTx('ap', cts))
    w.run(3_000_000)
    expect(w.heard.tag).toEqual(['ampTrigger:ap'])
    expect(w.records.some((r) => r.type === 'CCA_BUSY' && r.node === 'tag')).toBe(false)
  })
  it('a tag below its DL floor never hears the trigger', () => {
    const w = world({ 'ap>tag': -75 }, [{ id: 'ap', opts: { ampCapable: true } }, { id: 'tag', opts: { kind: 'tag', cca: false, floorDbm: -72 } }])
    w.at(0, () => w.ch.startTx('ap', trigger()))
    w.run(1_000_000)
    expect(w.heard.tag).toEqual([])
  })
  it('the AP decodes a UL response down to −94 dBm at 250 kb/s; a plain Wi-Fi station cannot detect it', () => {
    const w = world({ 'tag>ap': -93, 'tag>sta': -30 }, [{ id: 'ap', opts: { ampCapable: true } }, { id: 'tag', opts: { kind: 'tag', cca: false } }, { id: 'sta' }])
    w.at(0, () => w.ch.startTx('tag', ampRespFrame('tag', 'ap', 250, 1, 0, false)))
    w.run(1_000_000)
    expect(w.heard.ap).toEqual(['ampResp:tag'])
    expect(w.heard.sta).toEqual([])
    expect(w.records.some((r) => r.type === 'CCA_BUSY' && r.node === 'sta' && r.cause === 'energy')).toBe(true)
    const w2 = world({ 'tag>ap': -96 }, [{ id: 'ap', opts: { ampCapable: true } }, { id: 'tag', opts: { kind: 'tag', cca: false } }])
    w2.at(0, () => w2.ch.startTx('tag', ampRespFrame('tag', 'ap', 250, 1, 0, false)))
    w2.run(1_000_000)
    expect(w2.heard.ap).toEqual([])
  })
  it('two tags in one slot collide at the AP; a 5 dB stronger one is captured', () => {
    const w = world({ 'a>ap': -60, 'b>ap': -60 }, [{ id: 'ap', opts: { ampCapable: true } }, { id: 'a', opts: { kind: 'tag', cca: false } }, { id: 'b', opts: { kind: 'tag', cca: false } }])
    w.at(0, () => { w.ch.startTx('a', ampRespFrame('a', 'ap', 250, 1, 0, false)); w.ch.startTx('b', ampRespFrame('b', 'ap', 250, 1, 0, false)) })
    w.run(1_000_000)
    expect(w.heard.ap).toEqual([])
    expect(w.records.some((r) => r.type === 'COLLISION' && r.nodes.includes('a') && r.nodes.includes('b'))).toBe(true)
    const w2 = world({ 'a>ap': -55, 'b>ap': -70 }, [{ id: 'ap', opts: { ampCapable: true } }, { id: 'a', opts: { kind: 'tag', cca: false } }, { id: 'b', opts: { kind: 'tag', cca: false } }])
    w2.at(0, () => { w2.ch.startTx('b', ampRespFrame('b', 'ap', 250, 1, 0, false)) })
    w2.at(10_000, () => { w2.ch.startTx('a', ampRespFrame('a', 'ap', 250, 1, 0, false)) }) // inside b's 48 µs sync: capture
    w2.run(1_000_000)
    expect(w2.heard.ap).toEqual(['ampResp:a'])
  })
  it('an Ack addressed to one tag is still decoded by every tag in range', () => {
    const w = world({ 'ap>a': -60, 'ap>b': -60 }, [{ id: 'ap', opts: { ampCapable: true } }, { id: 'a', opts: { kind: 'tag', cca: false } }, { id: 'b', opts: { kind: 'tag', cca: false } }])
    w.at(0, () => w.ch.startTx('ap', ampAckFrame('ap', 'a', 250, 1, 6_000)))
    w.run(1_000_000)
    expect(w.heard.a).toEqual(['ampAck:ap'])
    expect(w.heard.b).toEqual(['ampAck:ap'])
  })
})
```

- [ ] **Step 2: Run to see it fail** — `npx vitest run tests/engine/amp-collision.test.ts` → FAIL.

- [ ] **Step 3: Implement in `channel.ts`**

`RadioState` gains `kind: 'wifi' | 'tag'`, `ampCapable: boolean`, `floorDbm: number`, `cca: boolean`; `register(nodeId, listener, opts = {})` fills them (`kind: opts.kind ?? 'wifi'`, `ampCapable: opts.ampCapable ?? false`, `floorDbm: opts.floorDbm ?? AMP_TAG_DL_SENS_DBM`, `cca: opts.cca ?? true`). Add:

```ts
function ampNoiseBwMhz(frame: FrameDesc): number {
  return frame.amp?.dir === 'ul' ? AMP_UL_BW_MHZ[frame.amp.kbps as AmpUlKbps] : frame.widthMhz ?? 20
}

/** Lowest RSSI at which this radio can acquire this PPDU, or null when it cannot see it as a PPDU at all. */
function detectFloorDbm(r: RadioState, frame: FrameDesc): number | null {
  if (frame.amp?.dir === 'ul') return r.ampCapable ? ampUlSensDbm(frame.amp.kbps as AmpUlKbps) : null
  if (frame.amp?.dir === 'dl') return r.kind === 'tag' ? r.floorDbm : CCA_PD_DBM
  return r.kind === 'tag' ? null : CCA_PD_DBM
}
```

`decodeThreshDb(frame, rid, r)`: prepend
```ts
  if (frame.amp?.dir === 'ul') return AMP_UL_REQ_SINR_DB[frame.amp.kbps as AmpUlKbps]
  if (frame.amp?.dir === 'dl') return r.kind === 'tag' ? AMP_DL_REQ_SINR_DB : sinrThreshDb(6)
```
(pass the `RadioState` from `endTx`). `captureWindowNs(frame)`: prepend the two AMP cases. In `applyOneTx`, replace both `p >= CCA_PD_DBM` tests with `const floor = detectFloorDbm(r, tx.frame); … floor !== null && p >= floor`. In `detectOrMiss` and `interferenceMw`, replace `noiseDbm(tx.frame.widthMhz ?? 20)` / `noiseDbm(lock.frame.widthMhz ?? 20)` with `noiseDbm(ampNoiseBwMhz(frame))`. In `updateAllCca`: `if (!r.cca) continue` at the top of the loop, and `if (p >= CCA_PD_DBM && r.observed.has(a.txId) && a.frame.amp?.dir !== 'ul') anyPd = true`.

- [ ] **Step 4: Run** — `npx vitest run tests/engine` → PASS (including the hash fixture: Wi-Fi paths are unchanged).

- [ ] **Step 5: Commit** — `git commit -am "feat(channel): radio kinds and AMP OOK detection/decoding"`

---

### Task 4: `AmpStaMac`: the tag

**Files:**
- Create: `src/engine/ampSta.ts`
- Test: `tests/engine/amp-sta.test.ts`

**Interfaces (produced):**
```ts
export interface AmpStaCfg { apId: string; id16: number }
export class AmpStaMac implements PhyListener {
  constructor(nodeId: string, q: EventQueue, now: () => Ns, ch: Channel, rng: Rng, emit: EmitFn, cfg: AmpStaCfg)
  onCcaBusy(): void; onCcaIdle(): void   // no-ops
  onRxStart(t: Ns, frame: FrameDesc, from: string): void
  onRxOk(t: Ns, frame: FrameDesc, from: string): void
  onRxCorrupt(t: Ns): void
}
```

Behaviour (spec "The tag"):
- `onRxStart`: `setState('rx')` unless transmitting or waiting for a slot (`ampWait` stays; a reception during a wait does not change the label).
- `onRxOk` with `ampTrigger` from `cfg.apId`: cancel any open round; `phase === 'random'`: `acw = 2 ** acwe − 1`, `aboc = rng.int(acw)` (inclusive upper bound, like backoff), `slot = aboc < slots ? aboc + 1 : null`, emit `AMP_ABOC`; `phase === 'scheduled'`: `slot = staIds.indexOf(nodeId) + 1` or ignore if absent (emit `AMP_ABOC { aboc: 0, acw: 0, slot }` so the lane shows the assignment). With a slot: `round = { slot, ulKbps, reading, acksSeen: 0, sent: false, endHandle }`; if `slot === 1` schedule `transmitResponse()` at `t + AMP_SIFS_NS`, else `setState('ampWait')`; `endHandle = q.schedule(t + roundNs + 50_000, () => this.giveUp())` (a round that never closes: `AMP_RESULT { sent, acked: false }`).
- `onRxOk` with `ampAck` from the AP while a round is open: `if (!round.sent) { round.acksSeen++; if (round.acksSeen === round.slot − 1) schedule transmitResponse at t + AMP_SIFS_NS; else if (frame.amp.ackFor >= round.slot) giveUp() }` else if `frame.amp.ackFor === round.slot`: `acked = frame.dst === nodeId`; emit `AMP_RESULT { slot, sent: true, acked }`; close the round; `setState('idle')`.
- `onRxCorrupt`: if a round is open and not sent, the tag has lost the Ack it keys on → `giveUp()` (spec: a tag that fails to decode an Ack loses the round).
- `transmitResponse()`: `frame = ampRespFrame(nodeId, apId, ulKbps, slot, aboc, reading)`; `ch.startTx(nodeId, frame)`; `setState('tx')`; at `now + frame.txTimeNs` (phase 2) `round.sent = true; setState('ampWait')`.
- `setState` emits `MAC_STATE` on change, exactly as `WifiMac.setState`.

- [ ] **Step 1: Write the failing tests** — a harness with a scripted "AP" radio (a bare `PhyListener` that records what it hears) and the `world()` helper pattern of Task 3:

```ts
// tests/engine/amp-sta.test.ts
import { describe, it, expect } from 'vitest'
import { Channel, type PhyListener } from '../../src/engine/channel'
import { EventQueue } from '../../src/engine/events'
import { Rng } from '../../src/engine/rng'
import { AmpStaMac } from '../../src/engine/ampSta'
import { AMP_SIFS_NS, ampAckFrame, ampTriggerFrame } from '../../src/engine/amp'
import { makeEmitter, type TLRecord } from '../../src/model/records'
import type { FrameDesc } from '../../src/model/frames'

function bench(tagIds: string[], seed = 7, links: Record<string, number> = {}) {
  const q = new EventQueue()
  let now = 0
  const ids = ['ap', ...tagIds]
  const table = new Map(ids.map((tx) => [tx, new Map(ids.filter((rx) => rx !== tx).map((rx) => [rx, links[`${tx}>${rx}`] ?? -50]))]))
  const records: TLRecord[] = []
  const emit = makeEmitter((r) => records.push(r))
  const ch = new Channel(q, () => now, table, emit)
  const apHeard: { t: number; from: string; frame: FrameDesc }[] = []
  const ap: PhyListener = { onCcaBusy() {}, onCcaIdle() {}, onRxStart() {}, onRxOk(t, frame, from) { apHeard.push({ t, from, frame }) }, onRxCorrupt() {} }
  ch.register('ap', ap, { ampCapable: true })
  const root = new Rng(seed)
  const tags = tagIds.map((id, i) => { const m = new AmpStaMac(id, q, () => now, ch, root.fork(i + 1), emit, { apId: 'ap', id16: 100 + i }); ch.register(id, m, { kind: 'tag', cca: false }); return m })
  const run = (t: number) => { for (;;) { const pt = q.peekTime(); if (pt === null || pt > t) break; const e = q.pop()!; now = e.t; e.fn() } now = t }
  const at = (t: number, fn: () => void) => q.schedule(t, fn)
  const send = (t: number, f: FrameDesc) => at(t, () => ch.startTx('ap', f))
  const trig = (slots = 4, acwe = 2, phase: 'random' | 'scheduled' = 'random', staIds: string[] = []) =>
    ampTriggerFrame({ src: 'ap', dlKbps: 250, ulKbps: 250, phase, slots, slotNs: 272_000, acwe, sessionId: 1, staIds, reading: false, roundNs: 4 * (272_000 + 2 * AMP_SIFS_NS + 330_000), signalExtNs: 6_000 })
  const ack = (dst: string, slot: number) => ampAckFrame('ap', dst, 250, slot, 6_000)
  const recs = <K extends TLRecord['type']>(type: K, node?: string) => records.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type && (node === undefined || (r as { node?: string }).node === node))
  return { q, ch, records, apHeard, tags, run, at, send, trig, ack, recs }
}

describe('AmpStaMac (PDT 39.4 UL channel access)', () => {
  it('draws ABOC in [0, ACW], transmits in slot ABOC+1 or sits out', () => {
    const b = bench(['t1', 't2', 't3', 't4', 't5', 't6'])
    b.send(0, b.trig(4, 2))
    b.run(700_000)
    const draws = b.recs('AMP_ABOC')
    expect(draws.length).toBe(6)
    for (const d of draws) {
      expect(d.acw).toBe(3)
      expect(d.aboc).toBeGreaterThanOrEqual(0)
      expect(d.aboc).toBeLessThanOrEqual(3)
      expect(d.slot).toBe(d.aboc < 4 ? d.aboc + 1 : null)
    }
    const trigEnd = b.recs('TX_END', 'ap')[0].t
    const slot1 = draws.filter((d) => d.slot === 1)
    const tx1 = b.recs('TX_START').filter((r) => r.frame.kind === 'ampResp')
    expect(tx1.map((r) => r.node).sort()).toEqual(slot1.map((d) => d.node).sort())
    for (const r of tx1) expect(r.t).toBe(trigEnd + AMP_SIFS_NS)
    expect(draws.every((d) => d.aboc <= d.acw)).toBe(true)
  })
  it('is deterministic per seed', () => {
    const a = bench(['t1', 't2', 't3'], 11); a.send(0, a.trig()); a.run(700_000)
    const c = bench(['t1', 't2', 't3'], 11); c.send(0, c.trig()); c.run(700_000)
    expect(a.recs('AMP_ABOC').map((r) => r.aboc)).toEqual(c.recs('AMP_ABOC').map((r) => r.aboc))
  })
  it('sits out when ABOC ≥ N (ACWE 3, one slot)', () => {
    const b = bench(['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'])
    b.send(0, b.trig(1, 3))
    b.run(700_000)
    const draws = b.recs('AMP_ABOC')
    expect(draws.some((d) => d.slot === null)).toBe(true)
    for (const d of draws) if (d.slot === null) expect(d.aboc).toBeGreaterThanOrEqual(1)
  })
  it('slot k ≥ 2 is keyed to the Ack that closes slot k−1: AMP SIFS after its end', () => {
    // seed chosen so t1 draws slot 2: scan seeds until it does (documented in the test).
    let b = bench(['t1'], 1)
    let seed = 1
    for (; seed < 200; seed++) { b = bench(['t1'], seed); b.send(0, b.trig(4, 2)); b.run(700_000); if (b.recs('AMP_ABOC')[0].slot === 2) break }
    expect(b.recs('AMP_ABOC')[0].slot).toBe(2)
    const trigEnd = b.recs('TX_END', 'ap')[0].t
    expect(b.recs('MAC_STATE', 't1').some((r) => r.state === 'ampWait')).toBe(true)
    // the AP closes slot 1 (nobody was there) with an Ack addressed to itself
    const ackStart = trigEnd + AMP_SIFS_NS + 272_000 + AMP_SIFS_NS
    b.send(ackStart, b.ack('ap', 1))
    b.run(ackStart + 330_000 + AMP_SIFS_NS + 300_000)
    const tx = b.recs('TX_START', 't1').find((r) => r.frame.kind === 'ampResp')!
    expect(tx.t).toBe(ackStart + 330_000 + AMP_SIFS_NS)
    expect(tx.frame.amp).toMatchObject({ slot: 2 })
    // Ack for slot 2 addressed to t1 → acknowledged
    const ack2 = tx.t + 272_000 + AMP_SIFS_NS
    b.send(ack2, b.ack('t1', 2))
    b.run(ack2 + 400_000)
    expect(b.recs('AMP_RESULT', 't1')[0]).toMatchObject({ slot: 2, sent: true, acked: true })
    expect(b.recs('MAC_STATE', 't1').pop()!.state).toBe('idle')
  })
  it('an Ack for its slot addressed to someone else means the response was lost', () => {
    let b = bench(['t1'], 1)
    for (let seed = 1; seed < 200; seed++) { b = bench(['t1'], seed); b.send(0, b.trig(4, 2)); b.run(700_000); if (b.recs('AMP_ABOC')[0].slot === 1) break }
    const tx = b.recs('TX_START', 't1')[0]
    const ack1 = tx.t + 272_000 + AMP_SIFS_NS
    b.send(ack1, b.ack('ap', 1))
    b.run(ack1 + 400_000)
    expect(b.recs('AMP_RESULT', 't1')[0]).toMatchObject({ slot: 1, sent: true, acked: false })
  })
  it('a scheduled trigger assigns the slot by list position; an unlisted tag stays silent', () => {
    const b = bench(['t1', 't2', 't3'])
    b.send(0, b.trig(2, 0, 'scheduled', ['t2', 't1']))
    b.run(700_000)
    const trigEnd = b.recs('TX_END', 'ap')[0].t
    const tx = b.recs('TX_START').filter((r) => r.frame.kind === 'ampResp')
    expect(tx.map((r) => r.node)).toEqual(['t2'])
    expect(tx[0].t).toBe(trigEnd + AMP_SIFS_NS)
    expect(b.recs('AMP_ABOC', 't1')[0].slot).toBe(2)
    expect(b.recs('AMP_ABOC', 't3').length).toBe(0)
    expect(b.recs('TX_START', 't3').length).toBe(0)
  })
  it('a tag that cannot decode the Ack it keys on loses the round', () => {
    let b = bench(['t1'], 1, { 'ap>t1': -50 })
    let seed = 1
    for (; seed < 200; seed++) { b = bench(['t1'], seed); b.send(0, b.trig(4, 2)); b.run(700_000); if (b.recs('AMP_ABOC')[0].slot === 3) break }
    const trigEnd = b.recs('TX_END', 'ap')[0].t
    const ack1 = trigEnd + AMP_SIFS_NS + 272_000 + AMP_SIFS_NS
    b.send(ack1, b.ack('ap', 1))
    // the second Ack is never sent: the round's end timer fires
    b.run(ack1 + 6_000_000)
    expect(b.recs('AMP_RESULT', 't1')[0]).toMatchObject({ slot: 3, sent: false, acked: false })
    expect(b.recs('TX_START', 't1').length).toBe(0)
  })
  it('Wi-Fi frames never trigger a tag', () => {
    const b = bench(['t1'])
    const cts: FrameDesc = { kind: 'cts', src: 'ap', dst: 'ap', bytes: 14, mbps: 6, durationFieldNs: 0, txTimeNs: 50_000 }
    b.send(0, cts)
    b.run(500_000)
    expect(b.recs('AMP_ABOC').length).toBe(0)
    expect(b.recs('TX_START', 't1').length).toBe(0)
  })
})
```

- [ ] **Step 2: Run to see it fail** — `npx vitest run tests/engine/amp-sta.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/engine/ampSta.ts`**

```ts
/**
 * Active Tx non-AP AMP STA (P802.11bp, 2.4 GHz): a tag with no carrier sense
 * and no NAV that transmits only in a time slot an AMP triggering frame
 * allocates (PDT 11-26/1889r4 clause 39.4; 11-26/1519r5 clause 39.3).
 */
import { AMP_SIFS_NS, ampRespFrame, type AmpUlKbps } from './amp'
import type { Channel, PhyListener } from './channel'
import { EventQueue } from './events'
import { Rng } from './rng'
import type { FrameDesc } from '../model/frames'
import type { EmitFn, MacStateName } from '../model/records'
import type { Ns } from '../model/types'

export interface AmpStaCfg {
  apId: string
  id16: number
}

interface Round {
  slot: number
  aboc: number | undefined
  ulKbps: AmpUlKbps
  reading: boolean
  acksSeen: number
  sent: boolean
  endHandle: number
  txHandle: number
}

/** Grace after the announced round length before an unclosed round is abandoned. */
const ROUND_GRACE_NS: Ns = 50_000

export class AmpStaMac implements PhyListener {
  private state: MacStateName = 'idle'
  private round: Round | null = null

  constructor(
    private nodeId: string, private q: EventQueue, private now: () => Ns, private ch: Channel,
    private rng: Rng, private emit: EmitFn, private cfg: AmpStaCfg,
  ) {}

  onCcaBusy(): void {}
  onCcaIdle(): void {}

  onRxStart(_t: Ns, _frame: FrameDesc, _from: string): void {
    if (this.state === 'idle') this.setState('rx')
  }

  onRxOk(t: Ns, frame: FrameDesc, from: string): void {
    if (from !== this.cfg.apId || !frame.amp) { this.settle(); return }
    if (frame.kind === 'ampTrigger') this.onTrigger(t, frame)
    else if (frame.kind === 'ampAck') this.onAck(t, frame)
    else this.settle()
  }

  onRxCorrupt(_t: Ns): void {
    // The Ack this tag keys its slot on (or the one that would acknowledge it) did not decode: the round is lost.
    if (this.round) this.giveUp()
    else this.settle()
  }

  private onTrigger(t: Ns, frame: FrameDesc): void {
    const a = frame.amp!
    this.closeRound()
    let slot: number | null
    let aboc: number | undefined
    let acw = 0
    if (a.phase === 'scheduled') {
      const i = (a.staIds ?? []).indexOf(this.nodeId)
      if (i < 0) { this.settle(); return }
      slot = i + 1
    } else {
      acw = 2 ** (a.acwe ?? 0) - 1
      aboc = this.rng.int(acw)
      slot = aboc < (a.slots ?? 1) ? aboc + 1 : null
    }
    this.emit({ t, type: 'AMP_ABOC', node: this.nodeId, aboc: aboc ?? 0, acw, slot })
    if (slot === null) { this.settle(); return }
    const round: Round = { slot, aboc, ulKbps: this.ulRateOf(frame), reading: a.reading ?? false, acksSeen: 0, sent: false, endHandle: 0, txHandle: 0 }
    this.round = round
    round.endHandle = this.q.schedule(t + (a.roundNs ?? 0) + ROUND_GRACE_NS, () => this.giveUp())
    if (slot === 1) round.txHandle = this.q.schedule(t + AMP_SIFS_NS, () => this.transmitResponse())
    else this.setState('ampWait')
  }

  /** The UL rate the trigger dictates (PDT 39.3.2.1 "UL data rate"): carried in AmpInfo.ulKbps. */
  private ulRateOf(frame: FrameDesc): AmpUlKbps {
    return (frame.amp!.ulKbps ?? 250) as AmpUlKbps
  }

  private onAck(t: Ns, frame: FrameDesc): void {
    const r = this.round
    if (!r) { this.settle(); return }
    const ackFor = frame.amp!.ackFor ?? 0
    if (!r.sent) {
      r.acksSeen++
      if (r.acksSeen === r.slot - 1) {
        r.txHandle = this.q.schedule(t + AMP_SIFS_NS, () => this.transmitResponse())
      } else if (ackFor >= r.slot) {
        this.giveUp()
      }
      return
    }
    if (ackFor === r.slot) {
      const acked = frame.dst === this.nodeId
      this.emit({ t, type: 'AMP_RESULT', node: this.nodeId, slot: r.slot, sent: true, acked })
      this.closeRound()
      this.setState('idle')
    }
  }

  private transmitResponse(): void {
    const r = this.round
    if (!r) return
    r.txHandle = 0
    const frame = ampRespFrame(this.nodeId, this.cfg.apId, r.ulKbps, r.slot, r.aboc, r.reading)
    this.setState('tx')
    this.ch.startTx(this.nodeId, frame)
    this.q.schedule(this.now() + frame.txTimeNs, () => { r.sent = true; this.setState('ampWait') }, 2)
  }

  private giveUp(): void {
    const r = this.round
    if (!r) return
    this.emit({ t: this.now(), type: 'AMP_RESULT', node: this.nodeId, slot: r.slot, sent: r.sent, acked: false })
    this.closeRound()
    this.setState('idle')
  }

  private closeRound(): void {
    const r = this.round
    if (!r) return
    if (r.endHandle) this.q.cancel(r.endHandle)
    if (r.txHandle) this.q.cancel(r.txHandle)
    this.round = null
  }

  /** Back to the label a listening tag shows. */
  private settle(): void {
    if (this.state === 'rx') this.setState(this.round ? 'ampWait' : 'idle')
  }

  private setState(s: MacStateName): void {
    if (s === this.state) return
    this.state = s
    this.emit({ t: this.now(), type: 'MAC_STATE', node: this.nodeId, state: s })
  }
}
```

**Note on the UL rate:** the trigger carries the UL rate separately from the DL rate (`AmpInfo.ulKbps`, set by `ampTriggerFrame` in Task 1); the tag reads `frame.amp.ulKbps` through `ulRateOf`.

- [ ] **Step 4: Run** — `npx vitest run tests/engine/amp-sta.test.ts tests/engine/amp-phy.test.ts` → PASS. If the seed scan in the slot-2 / slot-3 tests never finds a hit within 200 seeds, widen to 2000; document the found seed in a comment.

- [ ] **Step 5: Commit** — `git add src/engine/ampSta.ts src/engine/amp.ts src/model/frames.ts tests/engine/amp-sta.test.ts tests/engine/amp-phy.test.ts && git commit -m "feat(amp): AmpStaMac, the triggered-only tag with ABOC slotted access"`

---

### Task 5: `AmpApRound` and the `WifiMac` hooks; simulation wiring

**Files:**
- Create: `src/engine/ampAp.ts`
- Modify: `src/engine/mac.ts` (`WifiMacCfg`, constructor, `inExchange`, `hasWork`, `hasFrame`, `transmitFor`, `onOwnTxEnd`, `onRxOk`, `onRxCorrupt`, `refreshState`)
- Modify: `src/engine/simulation.ts` (tags, AP AMP config, radio options, `tags` map)
- Test: `tests/engine/amp-ap.test.ts`

**Interfaces (produced):**
```ts
// ampAp.ts
export interface AmpApDeps {
  nodeId: string; q: EventQueue; now: () => Ns; emit: EmitFn; timing: PhyTiming
  /** Put a frame on the air through the MAC (no response expected by the MAC itself). */
  transmit(frame: FrameDesc): void
  /** The round is over: the MAC closes the exchange with a post-transmission backoff. */
  done(): void
}
export class AmpApRound {
  constructor(cfg: AmpApCfg, deps: AmpApDeps)
  readonly stats: { rounds: number; responses: number; failedSlots: number; readings: number; discovered: Set<string> }
  get active(): boolean
  /** Total air of one phase after its trigger PPDU: N × (slot + 2·AMP SIFS + Ack). */
  phaseAirNs(slots: number, reading: boolean): Ns
  /** Everything the CTS-to-self must cover: trigger + phase (+ a worst-case scheduled phase in twoPhase). */
  roundNs(): Ns
  start(): void
  onRxOk(frame: FrameDesc, from: string): void
  onRxFail(): void
}
// mac.ts
//   WifiMacCfg.ampAp?: AmpApCfg
//   WifiMac.ampRound: AmpApRound | null   (readonly, for tests)
// simulation.ts
//   Simulation.tags: Map<string, AmpStaMac>   (keyed by virtual id)
```

Round timeline (`start()`):
1. `t0 = now`. If `cfg.protection === 'ctsSelf'`: transmit `{ kind: 'cts', src: ap, dst: ap, bytes: CTS_BYTES, mbps: 6, durationFieldNs: roundNs() + timing.sifsNs, txTimeNs: txTimeNs(CTS_BYTES, 6) + timing.signalExtNs }`; schedule `sendTrigger('random')` at its end + `timing.sifsNs`. Else `sendTrigger('random')` now.
2. `sendTrigger(phase, staIds = [])`: `reading = phase === 'scheduled' || cfg.readMode === 'inline'`; `slots = phase === 'scheduled' ? staIds.length : cfg.slots`; `slotNs = ampUlPpduNs(cfg.ulKbps, ampRespBytes(reading))`; `frame = ampTriggerFrame({... roundNs: phaseAirNs(slots, reading) ...})`; emit `AMP_ROUND { untilNs: now + frame.txTimeNs + phaseAirNs }`; `stats.rounds++` (random only); `heard = []`, `received = new Map<number, string>()`; transmit; schedule `slotStart(1)` at `now + frame.txTimeNs + AMP_SIFS_NS`.
3. `slotStart(k)`: `current = k`; emit `AMP_SLOT { slot: k, untilNs: now + slotNs }`; schedule `sendAck(k)` at `now + slotNs + AMP_SIFS_NS`.
4. `sendAck(k)`: `dst = received.get(k) ?? nodeId`; transmit `ampAckFrame(nodeId, dst, cfg.dlKbps, k, timing.signalExtNs)`; at its end: `k < slots ? schedule slotStart(k+1) at end + AMP_SIFS_NS : phaseDone()`.
5. `phaseDone()`: if `phase === 'random' && cfg.readMode === 'twoPhase' && heard.length > 0` → schedule `sendTrigger('scheduled', heard)` at `now + AMP_SIFS_NS`; else `active = false; deps.done()`.
6. `onRxOk(frame, from)`: if `frame.kind === 'ampResp' && frame.amp?.slot === current && !received.has(current)`: `received.set(current, from)`, `heard.push(from)` (random phase), `stats.responses++`, `stats.discovered.add(from)`, `if (frame.amp.reading) stats.readings++`.
7. `onRxFail()`: `if (active && current > 0) stats.failedSlots++`.

`roundNs()` = trigger(random) air + phaseAirNs(cfg.slots, inline) + (twoPhase ? AMP_SIFS + trigger(scheduled, cfg.slots ids) air + phaseAirNs(cfg.slots, true) : 0).

`WifiMac` changes:
- cfg `ampAp?: AmpApCfg`; field `readonly ampRound: AmpApRound | null`; `private ampPending = false`. Constructor: if `cfg.ampAp` (only ever set on an AP MAC with EDCA), build the round with deps `{ transmit: (f) => this.transmitFrame(f, false), done: () => this.onAmpDone() }` and call `this.scheduleAmpPoll(0)`.
- `scheduleAmpPoll(at)`: `q.schedule(at, () => { this.ampPending = true; this.startAccessAc(this.edcafs[this.efIndex(0)]); this.scheduleAmpPoll(at + cfg.ampAp.pollIntervalMs * 1_000_000) })`.
- `inExchange()`: `|| (this.ampRound?.active ?? false)`.
- `hasWork(e)` and `hasFrame(idx)`: `|| (this.ampPending && idx === this.efIndex(0))`.
- `transmitFor(e, inTxopBurst)`: first statement after `purgeExpired`: `if (this.cfg.isAp && this.ampRound && this.ampPending && ei === this.efIndex(0) && !inTxopBurst) { this.ampPending = false; this.ampRound.start(); return }`.
- `onOwnTxEnd`: after the `muState` check: `if (this.ampRound?.active) { this.setState('waitAck'); return }`.
- `onRxOk`: before the `awaiting` check: `if (frame.kind === 'ampResp') { this.ampRound?.onRxOk(frame, from); return }`; and `if (frame.kind === 'ampTrigger' || frame.kind === 'ampAck') { this.corruptLast = false; return }` (a Wi-Fi station hearing AMP DL frames: nothing to do, no NAV).
- `onRxCorrupt`: `this.ampRound?.onRxFail()` first (an AP inside a round does not arm EIFS for a lost tag response: skip `corruptLast = true` when `this.ampRound?.active`).
- `onAmpDone()`: `const e = this.edcafs[this.efIndex(0)]; this.endTxop(); e.backoff = null; e.needDraw = true; this.resumeAll()`.
- `refreshState`: `else if (this.awaiting || this.staMuAwait || this.muState || this.ampRound?.active) s = 'waitAck'`.

`Simulation` changes (in the per-link loop):
- `members` includes tags (they are in `plan.members['2g']`). For `n.kind === 'amp'`: `const mac = new AmpStaMac(n.id, this.q, () => this.nowNs, ch, root.fork(hashStr(vid)), linkEmit, { apId: ap.id, id16: n.ampTag?.id16 ?? ampId16(n.id) }); ch.register(n.id, mac, { kind: 'tag', cca: false, floorDbm: n.ampTag?.dlSensDbm ?? AMP_TAG_DL_SENS_DBM }); this.tags.set(vid, mac); continue`.
- For Wi-Fi nodes: `ch.register(n.id, mac, { ampCapable: n.kind === 'ap' && link === '2g' && !!ap.ampAp })`; AP cfg on the 2g link: `ampAp: link === '2g' && members.some((m) => m.kind === 'amp') ? ap.ampAp : undefined`.
- `reachable: (peer) => memberSet.has(peer) && byId.get(peer)?.kind !== 'amp'`; `ulBacklog` filter `byId.get(id)!.kind === 'sta'`; `queuesOf` only for non-tags; traffic sources only for `'sta'` (already).
- `initViewState` already handles tags (Task 2).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/engine/amp-ap.test.ts
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { AMP_SIFS_NS } from '../../src/engine/amp'
import { DEFAULT_AMP_AP, type NodeCfg, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000
function tag(id: string, x: number, y: number): NodeCfg {
  return { id, kind: 'amp', name: id, pos: { x, y, z: 1 }, txPowerDbm: 0, profiles: ['idle'], caps: { generation: 'nonht', features: {} } }
}
function scenario(over: Partial<typeof DEFAULT_AMP_AP> = {}, extra: NodeCfg[] = []): Scenario {
  return {
    rooms: [{ x: 0, y: 0, w: 10, h: 8, name: 'Lab' }], walls: [], servers: [], seed: 7, rtsThresholdBytes: 3000, snapshotIntervalMs: 10,
    nodes: [
      { id: 'ap', kind: 'ap', name: 'AP', pos: { x: 5, y: 4, z: 2 }, txPowerDbm: 20, profiles: ['idle'], caps: { generation: 'eht', features: { edca: true, txop: true } }, ampAp: { ...DEFAULT_AMP_AP, ...over } },
      tag('tag-1', 4, 4), tag('tag-2', 6, 4),
      ...extra,
    ],
  }
}
const ofType = <K extends TLRecord['type']>(rs: TLRecord[], type: K, node?: string) =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type && (node === undefined || (r as { node?: string }).node === node))

describe('the AP’s AMP round', () => {
  it('runs on AC_BK, protected by a CTS-to-self whose Duration covers the round', () => {
    const rs = new Simulation(scenario()).runUntil(20 * MS).records
    const cts = ofType(rs, 'TX_START', 'ap#2g').find((r) => r.frame.kind === 'cts')!
    expect(cts.frame.dst).toBe('ap')
    expect(cts.frame.mbps).toBe(6)
    const trig = ofType(rs, 'TX_START', 'ap#2g').find((r) => r.frame.kind === 'ampTrigger')!
    expect(trig.t).toBe(cts.t + cts.frame.txTimeNs + 10_000) // 2.4 GHz SIFS
    const lastAck = ofType(rs, 'TX_END', 'ap#2g').filter((r) => r.frame.kind === 'ampAck' && r.frame.amp?.ackFor === 4).pop()!
    expect(cts.t + cts.frame.txTimeNs + cts.frame.durationFieldNs).toBeGreaterThanOrEqual(lastAck.t)
    expect(cts.t + cts.frame.txTimeNs + cts.frame.durationFieldNs - lastAck.t).toBeLessThan(20_000)
    const ifs = ofType(rs, 'IFS_START', 'ap#2g').find((r) => r.t <= cts.t)!
    expect(ifs.ac).toBe(0) // AC_BK
  })
  it('trigger → slot 1 after AMP SIFS → Ack after the slot → slot 2 after AMP SIFS, four slots, four Acks', () => {
    const rs = new Simulation(scenario()).runUntil(20 * MS).records
    const round = ofType(rs, 'AMP_ROUND', 'ap#2g')[0]
    expect(round).toMatchObject({ phase: 'random', slots: 4, slotNs: 272_000, acwe: 2, dlKbps: 250, ulKbps: 250 })
    const trigEnd = ofType(rs, 'TX_END', 'ap#2g').find((r) => r.frame.kind === 'ampTrigger')!
    const slots = ofType(rs, 'AMP_SLOT', 'ap#2g').filter((r) => r.t >= trigEnd.t).slice(0, 4)
    expect(slots.map((s) => s.slot)).toEqual([1, 2, 3, 4])
    expect(slots[0].t).toBe(trigEnd.t + AMP_SIFS_NS)
    const acks = ofType(rs, 'TX_START', 'ap#2g').filter((r) => r.frame.kind === 'ampAck').slice(0, 4)
    expect(acks.map((a) => a.frame.amp!.ackFor)).toEqual([1, 2, 3, 4])
    expect(acks[0].t).toBe(slots[0].t + 272_000 + AMP_SIFS_NS)
    expect(slots[1].t).toBe(acks[0].t + 330_000 + AMP_SIFS_NS)
    expect(new Set(acks.map((a) => a.frame.txTimeNs)).size).toBe(1)
  })
  it('Ack ids name the tag heard in that slot, or the AP when nobody was', () => {
    const rs = new Simulation(scenario()).runUntil(20 * MS).records
    const first = ofType(rs, 'AMP_ROUND', 'ap#2g')[0]
    const inRound = rs.filter((r) => r.t >= first.t && r.t <= first.untilNs)
    const acks = ofType(inRound, 'TX_START', 'ap#2g').filter((r) => r.frame.kind === 'ampAck')
    const heard = ofType(inRound, 'RX_OK', 'ap#2g').filter((r) => r.frame.kind === 'ampResp')
    for (const a of acks) {
      const h = heard.find((r) => r.frame.amp!.slot === a.frame.amp!.ackFor)
      expect(a.frame.dst).toBe(h ? h.from : 'ap')
    }
    expect(acks.some((a) => a.frame.dst !== 'ap')).toBe(true)
  })
  it('rounds repeat every pollIntervalMs and tags get acknowledged', () => {
    const rs = new Simulation(scenario({ pollIntervalMs: 50 })).runUntil(400 * MS).records
    const rounds = ofType(rs, 'AMP_ROUND', 'ap#2g').filter((r) => r.phase === 'random')
    expect(rounds.length).toBeGreaterThanOrEqual(7)
    for (let i = 1; i < rounds.length; i++) expect(rounds[i].t - rounds[i - 1].t).toBeGreaterThanOrEqual(50 * MS)
    expect(ofType(rs, 'AMP_RESULT', 'tag-1#2g').some((r) => r.acked)).toBe(true)
    expect(ofType(rs, 'AMP_RESULT', 'tag-2#2g').some((r) => r.acked)).toBe(true)
  })
  it('twoPhase: after the random phase, a scheduled trigger lists exactly the tags heard, in order', () => {
    const rs = new Simulation(scenario({ readMode: 'twoPhase' })).runUntil(30 * MS).records
    const rounds = ofType(rs, 'AMP_ROUND', 'ap#2g')
    const sched = rounds.find((r) => r.phase === 'scheduled')
    if (!sched) return // nobody answered in round one for this seed: covered by the lesson test with 30 rounds
    const random = rounds.filter((r) => r.phase === 'random' && r.t < sched.t).pop()!
    const heard = ofType(rs, 'RX_OK', 'ap#2g').filter((r) => r.frame.kind === 'ampResp' && r.t > random.t && r.t < sched.t).map((r) => r.from)
    const trig = ofType(rs, 'TX_START', 'ap#2g').find((r) => r.frame.kind === 'ampTrigger' && r.frame.amp?.phase === 'scheduled' && r.t >= sched.t)!
    expect(trig.frame.amp!.staIds).toEqual(heard)
    expect(trig.frame.amp!.reading).toBe(true)
    expect(sched.slots).toBe(heard.length)
  })
  it('protection none: a saturated 2.4 GHz station starts inside a slot and the response fails', () => {
    const cam: NodeCfg = { id: 'cam', kind: 'sta', name: 'Camera', pos: { x: 5, y: 2, z: 1 }, txPowerDbm: 15, profiles: ['saturated'], caps: { generation: 'he', features: { edca: true } }, linkId: '2g' }
    const rs = new Simulation(scenario({ protection: 'none' }, [cam])).runUntil(300 * MS).records
    const slots = ofType(rs, 'AMP_SLOT', 'ap#2g')
    const camTx = ofType(rs, 'TX_START', 'cam#2g').filter((r) => r.frame.kind === 'data')
    const inside = camTx.filter((c) => slots.some((s) => c.t > s.t && c.t < s.untilNs))
    expect(inside.length).toBeGreaterThan(0)
    expect(ofType(rs, 'NAV_SET', 'cam#2g').filter((r) => r.source.startsWith('cts')).length).toBe(0)
    const prot = new Simulation(scenario({ protection: 'ctsSelf' }, [cam])).runUntil(300 * MS).records
    expect(ofType(prot, 'NAV_SET', 'cam#2g').filter((r) => r.source.startsWith('cts')).length).toBeGreaterThan(0)
  })
  it('the live view and snapshot replay agree with AMP records', () => {
    const sim = new Simulation(scenario({ pollIntervalMs: 20 }))
    const batches = [50, 100, 150].map((ms) => sim.runUntil(ms * MS))
    const records = batches.flatMap((b) => b.records)
    const snapshots = batches.flatMap((b) => b.snapshots)
    const target = 120 * MS
    const snap = [...snapshots].reverse().find((s) => s.t <= target)!
    const { cloneView, applyRecord } = await import('../../src/model/view')
    const rebuilt = cloneView(snap.view)
    for (const r of records) if (r.t > snap.t && r.t <= target) applyRecord(rebuilt, r)
    const live = new Simulation(scenario({ pollIntervalMs: 20 }))
    live.runUntil(target)
    const lv = cloneView(live.view)
    lv.t = rebuilt.t
    expect(rebuilt).toEqual(lv)
  })
})
```
(Make the last test `async` and import `cloneView`/`applyRecord` at the top instead of the dynamic import.)

- [ ] **Step 2: Run to see it fail** — `npx vitest run tests/engine/amp-ap.test.ts` → FAIL.

- [ ] **Step 3: Implement `ampAp.ts`, the `mac.ts` hooks and the simulation wiring** as specified above. Keep `AmpApRound` free of MAC internals: it only calls `deps.transmit`, `deps.emit`, `deps.q.schedule` and `deps.done`.

- [ ] **Step 4: Run** — `npx vitest run tests/engine && npx tsc -b` → PASS, including `lesson-hashes.test.ts`.

- [ ] **Step 5: Commit** — `git add src/engine/ampAp.ts src/engine/mac.ts src/engine/simulation.ts tests/engine/amp-ap.test.ts && git commit -m "feat(amp): the AP's AC_BK polling round with CTS-to-self, Ack-keyed slots and two-phase reads"`

---

### Task 6: Timeline, event log, inspector, scene

**Files:**
- Modify: `src/ui/laneLayout.ts` (`SpanKind`, `STATE_SPAN`, `HIT_ORDER`, `spanTooltip`), `src/ui/TimelineStrip.tsx` (`SPAN_COLORS`, `txColor`, slot ticks next to the collision-tick drawing: search `COLLISION`), `src/ui/format.ts` (`fmtRecord` cases; `decodeFrame` AMP rows), `src/ui/Inspector.tsx` (`NodeSection`: AMP rows), `src/ui/i18n.ts` (`tooltips.ampTrigger`, `ampAck`, `ampResp`, `ampWait`, `ampWaitNote`; `inspector.amp*`; legend items), `src/scene/nodes.ts` (tag mesh; `haloColor` already), `src/scene/effects.ts` (association line for tags: dashed teal)
- Test: `tests/ui/laneLayout.test.ts`, `tests/ui/format.test.ts`

**Interfaces (produced):** `SpanKind` gains `'slot'`; `Strings.tooltips` gains `ampTrigger: string; ampAck: (dst: string) => string; ampResp: (slot: number) => string; ampWait: string; ampWaitNote: string`; `Strings.inspector` gains `ampTag: string; aboc: string; abocHint: string; slot: string; slotHint: string; ampCounts: string; ampCountsHint: string; ampRound: string; ampRoundHint: string; satOut: string`.

- [ ] **Step 1: Write the failing tests**

`tests/ui/laneLayout.test.ts` (append):
```ts
  it('an ampWait state opens a slot span and AMP frames get their tooltip names', () => {
    const recs: TLRecord[] = [
      { t: 0, seq: 0, type: 'MAC_STATE', node: 'tag-1#2g', state: 'ampWait' },
      { t: 100_000, seq: 1, type: 'MAC_STATE', node: 'tag-1#2g', state: 'tx' },
    ]
    const spans = recordsToSpans(recs, ['tag-1#2g'], 0, 200_000)
    expect(spans[0]).toMatchObject({ kind: 'slot', startNs: 0, endNs: 100_000 })
    const lines = spanTooltip(spans[0], STRINGS.en.tooltips)
    expect(lines[0]).toContain(STRINGS.en.tooltips.ampWait)
  })
```
`tests/ui/format.test.ts` (append):
```ts
  it('formats the four AMP records', () => {
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_ROUND', node: 'ap#2g', phase: 'random', slots: 4, slotNs: 272_000, acwe: 2, dlKbps: 250, ulKbps: 250, untilNs: 3_000_000 })).toBe('ap#2g AMP round (random): 4 slots × 272.0 µs, ACW 3, DL 250 kb/s, UL 250 kb/s')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_SLOT', node: 'ap#2g', slot: 2, untilNs: 1_000_000 })).toBe('ap#2g AMP slot 2 until 0.001 000 000')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_ABOC', node: 'tag-1#2g', aboc: 1, acw: 3, slot: 2 })).toBe('tag-1#2g ABOC 1 of [0, 3] → slot 2')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_ABOC', node: 'tag-1#2g', aboc: 3, acw: 3, slot: null })).toBe('tag-1#2g ABOC 3 of [0, 3] → sits out')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_RESULT', node: 'tag-1#2g', slot: 2, sent: true, acked: true })).toBe('tag-1#2g slot 2: acknowledged')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_RESULT', node: 'tag-1#2g', slot: 2, sent: true, acked: false })).toBe('tag-1#2g slot 2: not acknowledged')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_RESULT', node: 'tag-1#2g', slot: 3, sent: false, acked: false })).toBe('tag-1#2g slot 3: missed its cue')
  })
```

- [ ] **Step 2: Run to see them fail** — `npx vitest run tests/ui` → FAIL.

- [ ] **Step 3: Implement**

`laneLayout.ts`: `export type SpanKind = 'tx' | 'rx' | 'backoff' | 'defer' | 'nav' | 'sifs' | 'slot'`; `STATE_SPAN.ampWait = 'slot'`; `HIT_ORDER.slot = 2`; `spanTooltip`: `case 'slot': return [`${T.ampWait} · ${dur}`, T.ampWaitNote]`; in the `tx` case add before `f.kind === 'rts'`: `f.kind === 'ampTrigger' ? T.ampTrigger : f.kind === 'ampAck' ? T.ampAck(dst) : f.kind === 'ampResp' ? T.ampResp(f.amp?.slot ?? 0) :`; the rate line for AMP frames: `f.amp ? `${f.amp.kbps} kb/s OOK` : …`.

`TimelineStrip.tsx`: `SPAN_COLORS.slot = '#115e59'`; `txColor`: `ampTrigger`/`ampAck` → `'#2dd4bf'`, `ampResp` → `'#a78bfa'`. Slot ticks: where collision ticks are drawn from records of type `COLLISION`, also draw a 1 px `#2dd4bf` vertical tick at each `AMP_SLOT` record's `t` on that record's lane (the AP's 2g lane), full lane height, alpha 0.6.

`format.ts` `fmtRecord`:
```ts
    case 'AMP_ROUND': return `${r.node} AMP round (${r.phase}): ${r.slots} slots × ${fmtUs(r.slotNs)}, ACW ${2 ** r.acwe - 1}, DL ${r.dlKbps} kb/s, UL ${r.ulKbps} kb/s`
    case 'AMP_SLOT': return `${r.node} AMP slot ${r.slot} until ${fmtNs(r.untilNs)}`
    case 'AMP_ABOC': return `${r.node} ABOC ${r.aboc} of [0, ${r.acw}] → ${r.slot === null ? 'sits out' : `slot ${r.slot}`}`
    case 'AMP_RESULT': return `${r.node} slot ${r.slot}: ${!r.sent ? 'missed its cue' : r.acked ? 'acknowledged' : 'not acknowledged'}`
```
`decodeFrame` (the event-log table): for `f.amp` push rows `AMP rate: ${kbps} kb/s (Manchester OOK)`, and for triggers `Slots`, `Slot duration`, `ACWE`, `Phase`; for Acks `Acknowledges slot`; for responses `Slot`, `ABOC`.

`Inspector.tsx` `NodeSection`: when `nv.amp` render instead of the AC table:
```tsx
      <div style={row}><Lbl hint={L.abocHint}>{L.aboc}</Lbl><span>{nv.amp.aboc ?? '—'} / [0, {nv.amp.acw}]</span></div>
      <div style={row}><Lbl hint={L.slotHint}>{L.slot}</Lbl><span>{nv.amp.slot ?? '—'}</span></div>
      <div style={row}><Lbl hint={L.ampCountsHint}>{L.ampCounts}</Lbl><span>{nv.amp.sent} / {nv.amp.acked} / {nv.amp.lost}</span></div>
      <div style={row}><span style={dim}>{L.satOut}</span><span>{nv.amp.roundsSatOut} / {nv.amp.roundsHeard}</span></div>
```
and skip the queue/QSRC/NAV/IFS/CCA rows for tags. When `nv.ampRound` (AP): `<div style={row}><Lbl hint={L.ampRoundHint}>{L.ampRound}</Lbl><span>{nv.ampRound.phase} · slot {nv.ampRound.slot}/{nv.ampRound.slots} · {nv.ampRound.received.map(nameOf).join(', ') || '—'}</span></div>`. `StateBadge` colours: `ampWait: '#0d9488'`.

`i18n.ts` (both languages; zh in natural Simplified Chinese):
- tooltips: `ampTrigger: 'AMP Trigger — the AP opens uplink slots for ambient-power tags'`, `ampAck: (dst) => `AMP Ack → ${dst} — closes a slot and cues the next one``, `ampResp: (slot) => `AMP response in slot ${slot}``, `ampWait: 'waiting for its slot'`, `ampWaitNote: 'A tag has no carrier sense: it counts the AP’s Acks and transmits one AMP SIFS (10 µs) after the Ack that opens its slot.'`.
- inspector: `ampTag: 'AMP tag'`, `aboc: 'ABOC'`, `abocHint: 'AMP backoff counter drawn uniformly in [0, ACW] on each random-access trigger; ABOC < N picks slot ABOC + 1'`, `slot: 'slot'`, `slotHint: 'the uplink slot this tag will use in the current round'`, `ampCounts: 'sent / acked / lost'`, `ampCountsHint: 'responses transmitted, acknowledged by the following AMP Ack, and lost (collision, weak signal or a missed cue)'`, `ampRound: 'AMP round'`, `ampRoundHint: 'the polling round in progress on this link and who has answered so far'`, `satOut: 'sat out / heard'`.
- legend: `{ color: '#2dd4bf', label: 'AMP DL', hint: 'AMP Trigger or AMP Ack: a 2.4 GHz OOK PPDU behind a legacy preamble, addressed to ambient-power tags.' }`, `{ color: '#a78bfa', label: 'AMP UL', hint: 'A tag’s OOK response inside the slot it drew; no preamble Wi-Fi radios can see.' }`, `{ color: '#115e59', label: 'slot wait', hint: 'A tag armed for a later slot, counting the AP’s Acks.' }`.

`scene/nodes.ts` `buildNodeGroup`: for `n.kind === 'amp'` a flat disc `CylinderGeometry(0.12, 0.12, 0.02, 16)` in `0x2dd4bf`; `appLine` returns `''` for tags. `effects.ts`: draw the association line for tags too (`n.kind !== 'ap'`), colour `0x2dd4bf` opacity 0.12.

- [ ] **Step 4: Run** — `npx vitest run tests/ui && npx tsc -b && npm run build` → PASS.

- [ ] **Step 5: Look at it** — with the `run` skill or `npm run dev`, load a scenario with an AMP AP and two tags (Task 8 adds the editor; until then paste the JSON of `scenario()` from `tests/engine/amp-ap.test.ts` through Import). Check: teal trigger/Ack blocks on the AP's 2.4G lane, violet responses on tag lanes, slot ticks, the slot-wait span, the inspector rows.

- [ ] **Step 6: Commit** — `git commit -am "feat(ui): AMP frames, slots and tag state in the timeline, log, inspector and scene"`

---

### Task 7: Frame detail for AMP frames

**Files:**
- Modify: `src/model/frameFields.ts` (`FieldKey`, `PpduSegmentKey`, `controlMpdu`, `ppduLayout`), `src/ui/i18n.ts` (`frameDetail.fields.name`, `frameDetail.fields.segment`, `whatIs`/`next` final text), `src/ui/FrameDetail.tsx` (only if a segment or field needs special rendering; the generic tables should just work)
- Test: `tests/model/frameFields.test.ts`

**Interfaces:** `FieldKey` gains `'ampId' | 'ampTdc' | 'ampStaList'`; `PpduSegmentKey` gains `'usig' | 'ampSync' | 'ampSig' | 'ampData' | 'signalExt'`.

- [ ] **Step 1: Write the failing tests** (append to `tests/model/frameFields.test.ts`; build the three frames with the Task 1 builders):
```ts
describe('AMP frames decode to their P802.11bp fields and PPDU layout', () => {
  const ctx = { apId: 'ap', isEdca: true }
  it('trigger: FC 1, ID 2, TDC 2, body 6, FCS 2 = 13 octets; PPDU segments sum to TXTIME', () => {
    const f = ampTriggerFrame({ src: 'ap', dlKbps: 250, ulKbps: 250, phase: 'random', slots: 4, slotNs: 272_000, acwe: 2, sessionId: 1, staIds: [], reading: false, roundNs: 0, signalExtNs: 6_000 })
    const d = decodeFrame(f, ctx)
    const fields = d.users[0].subframes[0].mpdu.fields
    expect(fields.map((x) => [x.key, x.bytes])).toEqual([['fc', 1], ['ampId', 2], ['ampTdc', 2], ['body', 6], ['fcs', 2]])
    expect(d.bytes).toBe(13)
    expect(d.ppdu.map((s) => s.key)).toEqual(['legacyPreamble', 'signal', 'usig', 'ampSync', 'ampSig', 'ampData', 'padding', 'signalExt'])
    expect(d.ppdu.reduce((s, x) => s + x.durNs, 0)).toBe(f.txTimeNs)
    expect(d.ppdu.find((s) => s.key === 'ampSig')!.durNs).toBe(64_000)
  })
  it('scheduled trigger lists STA ids; Ack is 4 octets with an 8-bit CRC; response carries its reading', () => {
    const t = ampTriggerFrame({ src: 'ap', dlKbps: 1000, ulKbps: 1000, phase: 'scheduled', slots: 2, slotNs: 132_000, acwe: 0, sessionId: 1, staIds: ['tag-1', 'tag-2'], reading: true, roundNs: 0, signalExtNs: 6_000 })
    expect(decodeFrame(t, ctx).users[0].subframes[0].mpdu.fields.find((x) => x.key === 'ampStaList')).toMatchObject({ bytes: 4 })
    const a = decodeFrame(ampAckFrame('ap', 'tag-1', 250, 2, 6_000), ctx)
    expect(a.users[0].subframes[0].mpdu.fields.map((x) => [x.key, x.bytes])).toEqual([['fc', 1], ['ampId', 2], ['fcs', 1]])
    const r = decodeFrame(ampRespFrame('tag-1', 'ap', 250, 2, 1, true), ctx)
    expect(r.users[0].subframes[0].mpdu.fields.map((x) => [x.key, x.bytes])).toEqual([['fc', 1], ['ampId', 2], ['ampTdc', 2], ['body', 8], ['fcs', 2]])
    expect(r.ppdu.map((s) => s.key)).toEqual(['ampSync', 'ampData'])
    expect(r.ppdu[0].durNs).toBe(48_000)
  })
})
```

- [ ] **Step 2: Run to see it fail.**

- [ ] **Step 3: Implement** in `controlMpdu` (replace the Task 1 placeholder case):
```ts
    case 'ampTrigger': {
      const a = f.amp!
      const ids = a.phase === 'scheduled' ? a.staIds ?? [] : []
      fields = [
        { key: 'fc', bytes: 1, bits: [{ key: 'type', value: 'AMP Trigger' }, { key: 'protected', value: '0' }] },
        { key: 'ampId', bytes: 2, value: `AP ${ampId16(f.src).toString(16).padStart(4, '0')} (broadcast trigger)` },
        { key: 'ampTdc', bytes: 2, value: `${a.phase} · UL ${a.ulKbps ?? a.kbps} kb/s · seed 0` },
        { key: 'body', bytes: AMP_TRIGGER_BODY_BYTES, value: `Session ${a.sessionId} · ACWE ${a.acwe} (ACW ${2 ** (a.acwe ?? 0) - 1}) · ${a.slots} slots × ${usOf(a.slotNs ?? 0)} · ${a.reading ? 'reading' : 'id only'}` },
      ]
      if (ids.length) fields.push({ key: 'ampStaList', bytes: AMP_STA_ID_BYTES * ids.length, value: ids.map((id) => ampId16(id).toString(16).padStart(4, '0')).join(' ') })
      fields.push({ key: 'fcs', bytes: AMP_FCS_BYTES, value: 'CRC-16' })
      checkSize(fields, f.bytes)
      break
    }
    case 'ampAck':
      fields = [
        { key: 'fc', bytes: 1, bits: [{ key: 'type', value: 'AMP Ack' }, { key: 'protected', value: '0' }] },
        { key: 'ampId', bytes: 2, node: f.dst, value: f.dst === f.src ? 'AP id (nothing received)' : ampId16(f.dst).toString(16).padStart(4, '0') },
        { key: 'fcs', bytes: 1, value: 'CRC-8' },
      ]
      checkSize(fields, AMP_ACK_BYTES)
      break
    case 'ampResp': {
      const a = f.amp!
      fields = [
        { key: 'fc', bytes: 1, bits: [{ key: 'type', value: 'AMP Response' }, { key: 'protected', value: '0' }] },
        { key: 'ampId', bytes: 2, node: f.src, value: ampId16(f.src).toString(16).padStart(4, '0') },
        { key: 'ampTdc', bytes: 2, value: `slot ${a.slot}${a.aboc !== undefined ? ` · ABOC ${a.aboc}` : ''}` },
      ]
      if (a.reading) fields.push({ key: 'body', bytes: AMP_READING_BYTES, value: 'reading' })
      fields.push({ key: 'fcs', bytes: AMP_FCS_BYTES, value: 'CRC-16' })
      checkSize(fields, f.bytes)
      break
    }
```
`ppduLayout`: at the top, `if (f.amp) return ampPpduLayout(f)` with
```ts
function ampPpduLayout(f: FrameDesc): PpduSegment[] {
  const a = f.amp!
  if (a.dir === 'ul') {
    const sync = AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[a.kbps as AmpUlKbps]
    return [{ key: 'ampSync', durNs: sync }, { key: 'ampData', durNs: f.txTimeNs - sync }]
  }
  const sig = ampBitsNs(AMP_DL_SIG_BYTES * 8, a.kbps)
  const data = ampBitsNs(f.bytes * 8, a.kbps)
  const pad = a.padNs ?? AMP_PADDING_NS
  const ext = f.txTimeNs - (AMP_LEGACY_PREAMBLE_NS + AMP_DL_SYNC_NS + sig + data + pad)
  const segs: PpduSegment[] = [
    { key: 'legacyPreamble', durNs: 16_000 }, { key: 'signal', durNs: 4_000 }, { key: 'usig', durNs: 12_000 },
    { key: 'ampSync', durNs: AMP_DL_SYNC_NS }, { key: 'ampSig', durNs: sig }, { key: 'ampData', durNs: data }, { key: 'padding', durNs: pad },
  ]
  if (ext > 0) segs.push({ key: 'signalExt', durNs: ext })
  return segs
}
```
`i18n.ts` `fields.name`: `ampId: 'ID (16-bit AMP identifier)'`, `ampTdc: 'Type Dependent Control'`, `ampStaList: 'STA ID list'`; `fields.segment`: `usig: 'RL-SIG + U-SIG (12 µs)'`, `ampSync: 'AMP-Sync (OOK chips)'`, `ampSig: 'AMP-SIG (2 octets)'`, `ampData: 'AMP-Data (Manchester OOK)'`, `signalExt: 'signal extension (6 µs)'`; zh equivalents. Finalise `whatIs`/`next` for the three kinds (two sentences each, both languages, citing "P802.11bp draft").

- [ ] **Step 4: Run** — `npx vitest run tests/model tests/ui && npx tsc -b` → PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(frame-detail): field-level decode and PPDU layout of AMP frames"`

---

### Task 8: Editor: AMP tag tool and the AP's AMP polling section

**Files:**
- Modify: `src/editor/FloorPlanEditor.tsx` (tools row near line 294; node creation near 129; SVG node circle 390-394; object list 417-419; properties 521-660), `src/editor/planOps.ts` (`spawnRandomStas` untouched; add `newTag(scenario, pos)` helper), `src/ui/i18n.ts` (`editor.tools.tag`, `editor.amp*`), `src/editor/EditorGuide.tsx` (one paragraph on tags, both languages)
- Test: `tests/editor/planOps.test.ts`

**Interfaces:** `newTag(sc: Scenario, pos: { x: number; y: number }): { sc: Scenario; id: string }` returns the scenario with a node `{ id: 'tag-N', kind: 'amp', name: 'Tag N', pos: { …, z: 1 }, txPowerDbm: 0, profiles: ['idle'], caps: { generation: 'nonht', features: {} }, linkId: '2g', ampTag: {} }`.

- [ ] **Step 1: Write the failing test**
```ts
  it('newTag appends an AMP tag on 2.4 GHz with a fresh id', () => {
    const { sc, id } = newTag(defaultScenario(), { x: 3, y: 3 })
    const n = sc.nodes.find((x) => x.id === id)!
    expect(n).toMatchObject({ kind: 'amp', linkId: '2g', txPowerDbm: 0, profiles: ['idle'] })
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    const again = newTag(sc, { x: 4, y: 4 })
    expect(again.id).not.toBe(id)
  })
```

- [ ] **Step 2: Run to see it fail.**

- [ ] **Step 3: Implement**
- `planOps.ts`: `newTag` as specified (id = `tag-${k}` with the smallest free k).
- Editor tools row: a `🏷 AMP tag` button (`E.tools.tag`); clicking the canvas with that tool active calls `newTag` and selects the node (mirror the `sta` tool's code path at line 129).
- SVG: tag circle radius 0.2, fill `#2dd4bf`; object list dot `#2dd4bf`; the generation short label is replaced by `AMP` for tags.
- Properties for a tag: name, position, `E.txPower`, and `E.ampSens` (number input bound to `ampTag.dlSensDbm`, default −72, hint `E.ampSensHint`). Hide the Wi-Fi generation/features/traffic/link/tamper sections when `selNode.kind === 'amp'` (wrap those blocks in `selNode.kind !== 'amp' && (...)`).
- Properties for the AP when `caps.generation === 'eht'`: a section `E.amp` with a checkbox `E.ampEnable` that sets `ampAp: { ...DEFAULT_AMP_AP }` or `undefined`; when enabled: number inputs for `pollIntervalMs` (10–10000), `slots` (1–16), `acwe` (0–4), selects for `dlKbps` (250, 1000), `ulKbps` (250, 1000, 4000), `protection` (`E.ampProt.ctsSelf` / `.none`), `readMode` (`E.ampRead.inline` / `.twoPhase`); each with a one-line hint. If the AP is not EHT show `E.ampNeedsEht`.
- i18n (en, zh): `tools.tag: '🏷 AMP tag'`, `amp: 'AMP polling (802.11bp)'`, `ampEnable: 'poll ambient-power tags'`, `ampInterval: 'poll every'`, `ampIntervalHint: 'how often the AP contends (AC_BK) for an AMP round'`, `ampSlots: 'slots (N)'`, `ampAcwe: 'ACWE'`, `ampAcweHint: 'ACW = 2^ACWE − 1: the range a tag draws its slot counter from'`, `ampDl: 'DL rate'`, `ampUl: 'UL rate'`, `ampProt: { ctsSelf: 'CTS-to-self before the round', none: 'no protection' }`, `ampRead: { inline: 'reading in the random-access response', twoPhase: 'id first, then a scheduled read' }`, `ampNeedsEht: 'AMP polling needs a Wi-Fi 7 AP (the AMP DL PPDU carries U-SIG)'`, `ampSens: 'DL sensitivity'`, `ampSensHint: 'weakest AMP DL PPDU this tag’s envelope detector can decode (model default −72 dBm)'`.
- `EditorGuide.tsx`: a paragraph under the nodes section: what a tag is, that it lives on 2.4 GHz, that the AP needs Wi-Fi 7 and the AMP polling section.

- [ ] **Step 4: Run** — `npx vitest run tests/editor tests/ui && npx tsc -b && npm run build` → PASS. Then in the app: place two tags, enable AMP polling on the router, simulate, confirm the round appears.

- [ ] **Step 5: Commit** — `git commit -am "feat(editor): AMP tags and the AP's AMP polling settings"`

---

### Task 9: Curriculum module and lesson kit helpers

**Files:**
- Modify: `src/course/curriculum.ts` (`MODULES`, `COURSE_ORDER`), `src/course/lessonKit.ts` (helpers), `src/course/lessons.ts` (imports, once lessons exist)
- Test: `tests/course/lessons.test.ts` (module tier list)

**Interfaces (produced):**
```ts
// lessonKit.ts
export function tag(id: string, name: string, x: number, y: number, dlSensDbm?: number): NodeCfg
export function ampAp(id: string, name: string, x: number, y: number, amp: Partial<AmpApCfg> = {}, features?: Record<string, boolean>): NodeCfg  // eht AP with edca+txop and ampAp
export const firstAmpTrigger = txOf((r) => r.frame.kind === 'ampTrigger')
export const firstAmpResp = txOf((r) => r.frame.kind === 'ampResp')
export const firstAmpAck = txOf((r) => r.frame.kind === 'ampAck')
export const firstAmpAckToTag = txOf((r) => r.frame.kind === 'ampAck' && r.frame.dst !== r.frame.src)
export const firstAmpSatOut = (r: TLRecord) => r.type === 'AMP_ABOC' && r.slot === null
export const firstAmpLost = (r: TLRecord) => r.type === 'AMP_RESULT' && r.sent && !r.acked
export const firstScheduledTrigger = txOf((r) => r.frame.kind === 'ampTrigger' && r.frame.amp?.phase === 'scheduled')
```
`MODULES`: insert `{ tier: 1, title: { en: 'Ambient power IoT (802.11bp)', zh: '环境能量物联网（802.11bp）' } }` at index 7 (before "Real applications"); the capstone lesson's `module` becomes 8; Tier 3/4 modules shift to 9 and 10. `COURSE_ORDER`: after `'mlo'` insert `'amp-intro', 'amp-slots', 'amp-coexist'`.

- [ ] **Step 1: Update the test** in `tests/course/lessons.test.ts`: `expect(MODULES.map((m) => m.tier)).toEqual([0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 3])`; and in the tier test list add `'amp-intro'` among Tier 1 (index 1) ids once it exists.
- [ ] **Step 2: Run to see it fail.**
- [ ] **Step 3: Implement** `curriculum.ts`, the capstone `module: 8` in `src/course/lessons.ts` (search `id: 'capstone'`), and the `lessonKit.ts` helpers:
```ts
export function tag(id: string, name: string, x: number, y: number, dlSensDbm?: number): NodeCfg {
  return { id, kind: 'amp', name, pos: { x, y, z: 1 }, txPowerDbm: 0, profiles: ['idle'], caps: { generation: 'nonht', features: {} }, linkId: '2g', ampTag: dlSensDbm === undefined ? {} : { dlSensDbm } }
}
export function ampAp(id: string, name: string, x: number, y: number, amp: Partial<AmpApCfg> = {}, features?: Record<string, boolean>): NodeCfg {
  const n = node(id, name, 'ap', x, y, 'eht', 'idle', features ?? { edca: true, txop: true, ampdu: true })
  return { ...n, ampAp: { ...DEFAULT_AMP_AP, ...amp } }
}
```
- [ ] **Step 4: Run** — `npx vitest run tests/course/lessons.test.ts tests/course/lesson-claims.test.ts` → PASS (no AMP lesson yet; `COURSE_ORDER` ids without a lesson are skipped).
- [ ] **Step 5: Commit** — `git commit -am "feat(course): ambient-power module slot and AMP lesson-kit helpers"`

---

### Task 10: Lesson `amp-intro`: a station that never contends

**Files:**
- Create: `src/course/amp/amp-intro.ts`, `tests/course/amp-intro.test.ts`
- Modify: `src/course/lessons.ts` (import and include in the authored list)

**Scenario:** `oneRoom()`; `ampAp('ap', 'Router', 'ap', 5, 4, {})` (defaults: 100 ms, 4 slots, ACWE 2, 250/250, ctsSelf, inline); tags `tag('tag-1', 'Fridge tag', 3, 4)`, `tag('tag-2', 'Door tag', 8, 6)`; no Wi-Fi stations. Variant: `{ dlKbps: 1000, ulKbps: 1000 }` "1 Mb/s both ways".

**Claims to pin (the test measures them from the base run over 1 s, then the prose quotes the measured numbers exactly; every number in the lesson must appear in the test):**
1. Standard constants: AMP SIFS 10 µs; padding 20 µs; trigger PPDU 618 µs and Ack PPDU 330 µs at 250 kb/s; response 528 µs (inline reading, 15 octets); at 1 Mb/s: 258 / 186 / 132 µs.
2. The CTS-to-self precedes the trigger by one SIFS (10 µs) and its Duration ends within 20 µs of the last Ack's end.
3. Slot 1 starts exactly 10 µs after the trigger ends; slot 2 starts 10 µs after Ack₁ ends.
4. The round's total air at 250 kb/s (CTS + SIFS + trigger + 4 × (10 + 528 + 10 + 330)) in µs and its share of each 100 ms; the same for the 1 Mb/s variant.
5. Over 1 s: number of rounds (10), how many responses each tag got acknowledged, and how many rounds each sat out (measured).
6. Tags never emit CCA, NAV or backoff records.

**Jumps:** first CTS-to-self on the AP's 2.4G lane, first AMP Trigger, first tag response, first Ack addressed to a tag, first sit-out.
**Observe (3):** the 10 µs gaps in the strip at slot scale; the Ack's ID in frame detail naming the tag; a tag's ABOC in the inspector.
**Try this (2):** switch to the 1 Mb/s variant and compare round length; move Door tag behind the far wall until its RSSI is below −72 dBm (link-budget widget) and watch it stop answering.
**Quiz (3):** why a tag cannot run CSMA; what the padding is for; why every Ack PPDU is as long as it is.

- [ ] **Step 1: Write the test first**, modelled on `tests/course/tier1-retries-queues.test.ts`: a `recs()` memo per variant over 1 s, one `it` per claim above with the sentence it guards quoted in a comment. Use `expect(x).toBe(<value you measured>)` with the measured value filled in after the first run (run the test once with `console.log`, then pin).
- [ ] **Step 2: Write the lesson** (`Lesson` object, EN + ZH, blocks: p / list / table / formula as in `retries-queues.ts`), quoting only pinned numbers. Say in the first block that P802.11bp is a draft and cite 11-24/1613r20, 11-26/1519r5, 11-26/1889r4 and which values are model choices (tag sensitivity −72 dBm, OOK SINR thresholds, frame field widths).
- [ ] **Step 3: Register** in `lessons.ts` and run `npx vitest run tests/course` → PASS (study time 15–25 min per the formula; adjust prose length if not).
- [ ] **Step 4: Commit** — `git add src/course/amp/amp-intro.ts tests/course/amp-intro.test.ts src/course/lessons.ts && git commit -m "feat(course): AMP lesson 1, a station that never contends"`

---

### Task 11: Lesson `amp-slots`: ABOC, ACW and collisions

**Files:** `src/course/amp/amp-slots.ts`, `tests/course/amp-slots.test.ts`, `src/course/lessons.ts`

**Scenario:** `oneRoom()`, `ampAp` with `{ pollIntervalMs: 20, slots: 4, acwe: 2, readMode: 'inline' }`, six tags in a ring 2 m from the AP (all at the same RSSI so nothing is captured). Variants: ACWE 1 (ACW 1), ACWE 3 (ACW 7), and `readMode: 'twoPhase'` with ACWE 2.

**Claims to pin:**
1. ABOC ∈ [0, ACW] for every draw; slot = ABOC + 1 or sit-out; counts of draws per round equal the tags that decoded the trigger.
2. The analytic slot model: with M tags and ACW, a tag transmits with p = min(N, ACW+1)/(ACW+1); a slot is empty with (1 − 1/(ACW+1))^M, successful with M·(1/(ACW+1))·(1 − 1/(ACW+1))^(M−1), otherwise a collision. Over 30 rounds, the measured fractions of empty / success / collision slots are each within 0.12 of the formula (state the tolerance in the prose).
3. In a collision slot the AP's Ack names the AP (nothing received) unless capture; with equal RSSI there is no capture in this scenario (assert no `RX_FAIL reason capture` at the AP).
4. ACWE 1: more collisions, fewer sit-outs; ACWE 3: fewer collisions, more sit-outs; the measured acknowledged-per-round mean for the three ACWE values.
5. twoPhase: the scheduled trigger lists the tags heard; its slots use 528 µs (reading) while the random phase's use 272 µs (id only); total air of a two-phase round vs an inline round for the same number of tags heard (measured for the first round with ≥1 heard).
6. A lost response is retried next round with a fresh draw (the tag's next AMP_ABOC differs in at least one round; and every tag is eventually acknowledged within 30 rounds).

**Jumps:** first collision in a slot, first sit-out, first Ack to the AP itself, first scheduled trigger (twoPhase variant), first lost response.
**Observe (3), try this (2: change ACWE in the editor; add a seventh tag), quiz (3).**

- [ ] Steps as in Task 10. Commit: `feat(course): AMP lesson 2, slotted random access`.

---

### Task 12: Lesson `amp-coexist`: AMP and Wi-Fi share 2.4 GHz

**Files:** `src/course/amp/amp-coexist.ts`, `tests/course/amp-coexist.test.ts`, `src/course/lessons.ts`

**Scenario:** `longApartment()`; `ampAp` at (3, 4) with defaults (100 ms); tags at (2, 2) and (4, 6); a camera `node('cam', 'Camera', 'sta', 6, 4, 'he', 'backup')` with `linkId: '2g'` (saturated-ish upload at AC_BE); a phone `node('phone', 'Phone', 'sta', 12, 4, 'eht', 'video')` on 5 GHz (to show the 5 GHz lane is untouched). Variants: `protection: 'none'`; `pollIntervalMs: 20` (heavier polling).

**Claims to pin (over 2 s):**
1. With `ctsSelf`: the camera sets NAV from the CTS at every round (NAV_SET source `cts:ap` count = rounds); no camera data frame starts inside any slot; every tag response in a slot is acknowledged unless two tags collided.
2. The AP's BK EDCAF waits AIFS = 10 + 7·9 = 73 µs versus the camera's BE 10 + 3·9 = 37 µs; the measured mean delay from a round becoming due to its CTS start (µs) and its max.
3. Airtime: the round's air per second (µs) and the camera's throughput with and without polling (compare against a run with `ampAp` removed: throughput drop in %).
4. With `none`: camera frames start inside slots (count), tag responses that fail in those slots (count), and the tags' acknowledged share drops from X% to Y%.
5. The 5 GHz phone's throughput is identical in all variants (the bands are independent).
6. With `pollIntervalMs: 20` the round's airtime share and the camera's throughput drop (measured).

**Jumps:** first CTS-to-self, first camera NAV from it, first camera frame inside a slot (none variant), first failed tag response (none variant), first 5 GHz data.
**Observe (3), try this (2: set protection none in the editor; move the camera next to a tag), quiz (3).**

- [ ] Steps as in Task 10. Commit: `feat(course): AMP lesson 3, sharing 2.4 GHz with Wi-Fi`.

---

### Task 13: Glossary, Guide, README, memory note

**Files:**
- Modify: `src/ui/glossary.ts` (new group `amp`: AMP, AMP AP, Active Tx non-AP AMP STA, backscatter (future), energizer (future), AMP Trigger, AMP Ack, ABOC, ACW, AMP SIFS, AMP-Sync/AMP-SIG, Manchester OOK; each with a value the engine uses), `src/ui/Guide.tsx` (a "7 · Ambient power (802.11bp)" section, EN and ZH), `README.md` (feature bullet, conformance rows tagged draft, known simplifications), the memory index (`C:\Users\t00965210\.claude\projects\D--wifi-sim\memory\wifi-sim-project.md`: one paragraph on the AMP slice and the 2g link)
- Test: existing `tests/ui/i18n.test.ts` / glossary tests if any

- [ ] **Step 1: Write the entries** (both languages).
- [ ] **Step 2: Full run** — `npx vitest run && npx tsc -b && npm run build` → all green, `lesson-hashes.test.ts` included.
- [ ] **Step 3: Commit** — `git commit -am "docs: AMP glossary, guide section, README and roadmap note"`.

---

## Self-review notes

- Spec coverage: Part A → the link plan; Part B roles/nodes → Tasks 2, 5, 8; round → Task 5; tag → Task 4; PHY/decoding → Tasks 1, 3; records/view → Task 2; UI → Tasks 6, 7, 8; course → Tasks 9–12; testing list → each task's test file; glossary/guide → Task 13.
- Type consistency: `AmpInfo.ulKbps` is added in Task 4's note and must be present from Task 1 onward (add it in Task 1 directly: `ulKbps?: number` set by `ampTriggerFrame`). `AmpStaCfg.id16` is carried for frame detail only; the engine addresses tags by node id.
- Out of scope (next slices): mono-static backscatter, energy model, bistatic + energizer, sub-1 GHz.
