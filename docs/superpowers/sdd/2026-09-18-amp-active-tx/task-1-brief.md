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

