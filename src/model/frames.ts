import { AMPDU_DELIMITER_BYTES, FCS_BYTES, MAC_HDR_BYTES, QOS_HDR_BYTES, type PhyMode } from '../engine/phy'
import type { AmpBsUlKbps, Gen2Cmd, Gen2Reply } from '../engine/ampBs'
import type { UwbInfo } from '../uwb/frames'
import type { Ns } from './types'

/**
 * Every frame kind this engine can put on the air, as a value rather than only a type.
 *
 * `FrameKind` is derived from it, so the list cannot fall behind the union: a kind added to the
 * type has to be added here, and anything that walks the list — `tests/ui/i18n.test.ts` checks
 * that each one has a non-empty name, description and follow-on — covers it
 * from the moment it exists. A hand-written copy of this array had gone six kinds stale.
 */
export const FRAME_KINDS = [
  'data', 'ack', 'rts', 'cts', 'ba', 'trigger', 'mba', 'cfend',
  'ampTrigger', 'ampAck', 'ampResp', 'ampRfid', 'ampBsReply',
  'uwbPoll', 'uwbResp', 'uwbFinal', 'uwbReport', 'uwbBlink',
  // SS-TWR's deferred reply-time message (standard §10.29.6.3): a slot of its own, distinct from
  // 'uwbResp' — Ruling 4 of task-3, `docs/superpowers/specs/2026-09-29-reply-time-design.md` §4 —
  // because it is a second message a round can put on the air, not a variant of the first.
  'uwbSsDefer',
  // The initiation-only message a later round of a valid RCM carries (standard §10.32.9.1's ARC
  // IE, "RCM Validity Rounds"). Its own kind, not a reuse of 'uwbPoll' (fix round 1 of task 1): the
  // standard's own figure (§10.34) draws the control message and the ranging initiation message as
  // two separate frames; this engine fuses them only in a validity window's first round, so a
  // later round's message is the one of those two standard messages that remains — not a lighter
  // Poll. docs/superpowers/specs/2026-10-01-rcm-validity-design.md §2
  'uwbInit',
  // Many-to-many ranging (standard §10.32.6 SS / §10.32.7 DS): one participant's transmission,
  // a question to everyone after it and an answer to everyone before it — neither a Poll nor a
  // Response. `docs/superpowers/specs/2026-09-30-many-to-many-design.md` §4.
  'uwbM2m',
  // The ranging message non-receipt exchange (standard §10.34): a responder that holds a valid
  // RCM but missed this round's initiation message sends this instead of sitting silent in its
  // slot. Its own kind, not a second use of 'uwbResp': the whole point of the lesson is that this
  // frame appears where a response should have been, and labelling it "UWB Response" would erase
  // exactly that. docs/superpowers/specs/2026-10-01-rcm-validity-design.md §3
  'uwbRmnr',
  'uwbRsf', 'uwbRif', 'nbPoll', 'nbResp', 'nbReport', 'uwbSp0',
  // The answer to a many-to-many receipt-confirmation request (standard §10.36): its own kind,
  // not a reuse of 'uwbReport' or 'uwbRmnr' — the lesson's point is that this frame is an answer
  // to a request, not a measurement, and a timeline that labelled it anything else would erase
  // exactly that. docs/superpowers/specs/2026-10-02-receipt-confirmation-design.md §3.2
  'uwbMmrcm',
  // The SP3 ranging marker (standard §10.32.8.2): SYNC + SFD + STS, no PHR, no PSDU. Its own kind,
  // not a reuse of 'uwbResp'/'uwbBlink' — the lesson this slice teaches is that it is the physically
  // shortest ranging frame the standard has, and a timeline that filed it under an SP1 kind would
  // hide exactly the thing that makes it short (no PHR to decode, no PSDU to size).
  // docs/superpowers/specs/2026-10-02-sp3-design.md §3.1
  'uwbSp3',
  // One fragment of a ranging ancillary information message (standard §10.35, Request = 0 half):
  // a RAICT IE whose length is decided by its own two presence bits, this engine's first
  // information unit shaped that way. Its own kind, not a reuse of 'uwbReport' or 'uwbRmnr': this
  // frame answers no request and times nothing — it only carries a slice of a message too large
  // for one frame. docs/superpowers/specs/2026-10-02-ancillary-design.md §4.1/§4.2
  'uwbAncillary',
] as const

export type FrameKind = typeof FRAME_KINDS[number]

/** P802.11bp fields of an AMP frame; present on the five AMP kinds only. */
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
  /**
   * Backscatter downlink (`ampRfid`): the EPC Gen2 command this AMP RFID frame tunnels, the
   * inventory round it belongs to, and the two excitation fields wrapped around it — the WUP
   * that boots the tags (0 after the first PPDU of a TXOP) and the BST the reply is reflected
   * inside. `chargeDbm` is the power up to the end of AMP-Data, `bsDbm` the power during the
   * BST-Excitation. `epc` is the addressed tag's own EPC when the scenario configured one, which
   * is what the id field decodes to (SFD FM-25); absent on a broadcast command, and absent when
   * the tag takes the EPC derived from its node id. SFD FM-44/FM-45, PM-72…PM-74
   */
  rfid?: {
    cmd: Gen2Cmd
    session: number
    q?: number
    rn16?: number
    epc?: string
    slot: number
    wupNs: Ns
    bstNs: Ns
    chargeDbm: number
    bsDbm: number
    ulKbps: AmpBsUlKbps
  }
  /**
   * Backscatter uplink (`ampBsReply`): which Gen2 reply the tag reflected, in which slot of the
   * round, and what it carried. `incidentDbm` is the excitation power that reached the tag,
   * which only the medium knows — the builder leaves it unset. SFD PM-24, FM-35
   */
  bs?: {
    reply: Gen2Reply
    slot: number
    rn16?: number
    epc?: string
    incidentDbm?: number
  }
}

/** One user's share of a DL/UL MU (OFDMA) PPDU. */
export interface MuPart {
  dst: string
  src: string
  bytes: number
  mcs: number
  mbps: number
  msduIds: number[]
  mpduCount: number
  /** Trigger frames: access category and target TB-PPDU duration for this user. */
  ac?: number
  durNs?: Ns
  /** Spatial streams this member is sent with (MU-MIMO); absent means 1. */
  nss?: number
  /** Share of the channel this member occupies (OFDMA); absent means the whole width. */
  ruFraction?: number
  /** Payload octets of each MSDU carried, in msduIds order. */
  msduBytes?: number[]
  /** This member's MPDUs are a retransmission (§9.2.4.1.6). */
  retryFlag?: boolean
}

export interface FrameDesc {
  kind: FrameKind
  src: string
  dst: string
  /** Full PSDU octets including MAC header + FCS (aggregate for A-MPDU/MU). */
  bytes: number
  mbps: number
  /** MAC Duration/ID field expressed as time (protects the rest of the exchange). */
  durationFieldNs: Ns
  txTimeNs: Ns
  seqNo?: number
  retryFlag?: boolean
  /** Data frames: QoS Data (26-byte header) rather than plain Data — both ends must be QoS stations. */
  qos?: boolean
  msduId?: number
  /** Payload octets of each MSDU carried, in the order of ampdu.msduIds (or [msduId]). */
  msduBytes?: number[]
  // v2
  mode?: PhyMode // PPDU format (default nonht)
  mcs?: number
  /** Operating channel width in MHz this PPDU was sent at (default 20). */
  widthMhz?: number
  ac?: number // 0..3 EDCA access category of the exchange
  /** A-MPDU aggregation info (single-user). */
  ampdu?: { mpduCount: number; msduIds: number[] }
  /** OFDMA MU PPDU parts (DL MU data, or per-user context of triggers/M-BA). */
  muParts?: MuPart[]
  /** Frames sharing a group are RU-orthogonal: no mutual interference. */
  orthogonalGroup?: string
  /** Trigger frames only: the PPDU format the solicited TB PPDUs must use (the Trigger itself is non-HT). */
  ulMode?: PhyMode
  /** Trigger frames only: the channel width the solicited TB PPDUs must use (Common Info UL BW, §9.3.1.22.1). */
  ulWidthMhz?: number
  /** How a multi-user PPDU is split: by frequency (OFDMA) or by space (MU-MIMO). */
  muKind?: 'ofdma' | 'mumimo'
  /** P802.11bp Ambient Power fields; present on the five AMP frame kinds only. */
  amp?: AmpInfo
  /** HRP UWB ranging fields; present on the four UWB frame kinds only. */
  uwb?: UwbInfo
}

export function dataPsduBytes(msduBytes: number): number {
  return MAC_HDR_BYTES + msduBytes + FCS_BYTES
}

/** A-MPDU subframe: delimiter + QoS data MPDU, padded to 4 octets. */
export function ampduSubframeBytes(msduBytes: number): number {
  const mpdu = QOS_HDR_BYTES + msduBytes + FCS_BYTES
  return AMPDU_DELIMITER_BYTES + Math.ceil(mpdu / 4) * 4
}

/** A-MPDU PSDU: every subframe but the last is padded to a 4-octet boundary. */
export function ampduPsduBytes(msduBytesList: number[]): number {
  return msduBytesList.reduce((s, b, i) => i === msduBytesList.length - 1
    ? s + AMPDU_DELIMITER_BYTES + QOS_HDR_BYTES + b + FCS_BYTES
    : s + ampduSubframeBytes(b), 0)
}
