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

export const AMP_SIFS_NS: Ns = 10_000 // SFD PM-96
export const AMP_LEGACY_PREAMBLE_NS: Ns = 32_000 // SFD PM-15: L-STF 8 + L-LTF 8 + L-SIG 4 + RL-SIG 4 + U-SIG 8
export const AMP_DL_SYNC_NS: Ns = 80_000 // SFD PM-40/53/71: (32 + 8) chips × 2 µs
export const AMP_DL_SIG_BYTES = 2 // SFD PM-105
export const AMP_PADDING_NS: Ns = 20_000 // PDT 39.3.2.2 (unprotected trigger / Ack)
export const AMP_PADDING_PROTECTED_NS: Ns = 36_000 // PDT 39.3.2.2 (protected trigger; unused in this slice)
export const AMP_UL_SYNC_CHIPS = 48 // SFD PM-51
export const AMP_UL_CHIP_NS: Record<AmpUlKbps, Ns> = { 250: 1000, 1000: 250, 4000: 125 } // SFD PM-50/93
export const AMP_HDR_BYTES = 5 // SFD FM-14/16/17/18: FC 1 + ID 2 + TDC 2 (widths: model where TBD)
export const AMP_FCS_BYTES = 2 // SFD FM-20
export const AMP_ACK_BYTES = 4 // SFD FM-33/FM-49: FC 1 + ID 2 + CRC-8 1
export const AMP_TRIGGER_BODY_BYTES = 6 // model: Session ID 1, ACWE|Slots 1, Slot Duration 2, UL rate|seed|channel 1, Response type 1
export const AMP_STA_ID_BYTES = 2 // SFD FM-17 (16-bit id)
export const AMP_READING_BYTES = 8 // model: one sensor reading
export const AMP_DL_REQ_SINR_DB = 8 // model
export const AMP_TAG_DL_SENS_DBM = -72 // model (envelope detector)
export const AMP_UL_REQ_SINR_DB: Record<AmpUlKbps, number> = { 250: 10, 1000: 12, 4000: 15 } // model
export const AMP_UL_BW_MHZ: Record<AmpUlKbps, number> = { 250: 2, 1000: 4, 4000: 8 } // model
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
