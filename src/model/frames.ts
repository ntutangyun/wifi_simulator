import {
  ACK_BYTES, AMPDU_DELIMITER_BYTES, BA_BYTES, FCS_BYTES, MAC_HDR_BYTES, QOS_HDR_BYTES,
  type PhyMode,
} from '../engine/phy'
import type { AmpBsUlKbps, BsCmd, BsReply } from '../engine/ampBs'
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
  // A ranging control message on its own (standard §10.32.2): the RCM of the ancillary-information
  // round (ARC Ranging Round Usage = 3, §10.35), which has no ranging initiation to fuse with.
  'uwbRcm',
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
  /**
   * Active Tx triggers (§39.3.2.1, §39.3.2.2): Channel Indication — the channel number of the AP's
   * primary 20 MHz channel in 2.4 GHz; the UL frequency shift in MHz (+5, −5 or 0) applied to a
   * 250 kb/s response; the scrambling seed index (0…3) that selects SCRAMBLER_INITIAL_VALUE
   * (Table 39-1).
   */
  channel?: number
  ulShiftMhz?: number
  seedIdx?: number
  /** Responses: the slot it was sent in and the ABOC that chose it (undefined when scheduled). */
  slot?: number
  aboc?: number
  /** Acks: the slot this Ack closes. */
  ackFor?: number
  /** DL PPDUs: the padding field length. */
  padNs?: Ns
  /**
   * Mono-static downlink (`ampRfid`): which frame this PPDU carries — a broadcast AMP Trigger
   * (`cmd: 'trigger'`, with the Session ID and ACWE of §39.3.3) or an AMP RFID frame carrying the
   * UHF Read command (`cmd: 'read'`) — the inventory it belongs to, and the two excitation fields
   * wrapped around it: the WUP that boots the tags (0 after the first PPDU of a TXOP) and the BST
   * the reply is reflected inside. `chargeDbm` is the power up to the end of AMP-Data, `bsDbm` the
   * power during the BST-Excitation. `epc` is the addressed tag's own EPC when the scenario
   * configured one, which is what the ID field decodes to (SFD FM-25); absent on a broadcast
   * trigger. `slot` numbers the triggers of the inventory (each allocates one slot, §39.3.3).
   * SFD FM-44/FM-45, PM-72…PM-74; PDT 11-26/1519r5, 11-26/1520r3
   */
  rfid?: {
    cmd: BsCmd
    session: number
    acwe?: number
    epc?: string
    slot: number
    wupNs: Ns
    bstNs: Ns
    chargeDbm: number
    bsDbm: number
    ulKbps: AmpBsUlKbps
  }
  /**
   * Backscatter uplink (`ampBsReply`): what the tag reflected — an AMP Response carrying its ID
   * (`id`) or an AMP RFID frame carrying the Read reply (`read`, with the EPC) — and for which
   * trigger. `incidentDbm` is the excitation power that reached the tag, which only the medium
   * knows — the builder leaves it unset. SFD PM-24, FM-35
   */
  bs?: {
    reply: BsReply
    slot: number
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
  /** Spatial streams this member is sent with (MU-MIMO, or an OFDMA member with more than one); absent means 1. */
  nss?: number
  /** Share of the channel this member occupies (OFDMA); absent means the whole width. */
  ruFraction?: number
  /** Payload octets of each MSDU carried, in msduIds order. */
  msduBytes?: number[]
  /** This member's MPDUs are a retransmission (§9.2.4.1.6). */
  retryFlag?: boolean
  /** Each MPDU's sequence number, Retry bit and Table 9-60 end-to-end address, in msduIds order. */
  mpdus?: MpduHdr[]
  /**
   * DL MU PPDU only: the TRS Control subfield every MPDU of this member's A-MPDU carries in its
   * HT Control field (§9.2.4.7.1) — the HE/EHT TB PPDU this member answers in: its data symbol
   * count (UL Data Symbols + 1), its resource unit (this member's place and share) and its
   * HE-MCS 0–3. Without it the member does not answer (§10.3.2.13.2).
   */
  trs?: { ulDataSymbols: number; mcs: number; ruFraction: number; partIdx: number }
  /** DL MU PPDU only: this member's APEP_LENGTH (its A-MPDU before EOF padding; `bytes` is PSDU_LENGTH). */
  apepBytes?: number
  /** Multi-STA BlockAck only: the sequence numbers acknowledged for this STA (Per AID TID Info bitmap). */
  ba?: BaInfo
}

/**
 * The block ack starting sequence number and the sequence numbers the bitmap marks received
 * (§9.3.1.8.2, compressed BlockAck). Kept as the list of set bits rather than as the bitmap words.
 */
export interface BaInfo {
  ssn: number
  acked: number[]
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
  /**
   * TXVECTOR's GI_TYPE for the data field, ns — **absent when the base guard interval is in
   * use**, rather than written as 800. standard §27.2 Table 27-1 / standard be §36.2 Table 36-1
   *
   * Two reasons the absence is the encoding rather than a default value:
   *
   *  - `ppduLayout` (src/model/frameFields.ts) has nothing but a `FrameDesc` in hand — no
   *    scenario and no MAC — so the absence has to be readable as "take the old path and hand
   *    the same segments back". `linkDbm` (`private linkDbm` in src/engine/channel.ts) and
   *    `resolveLock` already establish that spelling. (No line number here on purpose: a
   *    citation that drifts with every slice is a direction that will be false sooner or later.)
   *  - It keeps the record stream and the UI character-for-character unchanged across every
   *    published lesson, because the timeline hash eats only `t`, `seq` and `type`, and none of
   *    the 233 shipped scenes writes a guard interval.
   *
   * Never set on a pre-HE PPDU: clause 19's and clause 21's GI_TYPE is the LONG_GI / SHORT_GI
   * enumeration, which is not these values at all.
   */
  giNs?: Ns
  /**
   * Spatial streams of an SU PPDU, absent when 1. The LTF field grows with it (N_HE-LTF /
   * N_EHT-LTF, Table 21-13 / Table 36-43), so the PPDU layout needs it to split the preamble.
   */
  nss?: number
  ac?: number // 0..3 EDCA access category of the exchange
  /** A-MPDU aggregation info (single-user). */
  ampdu?: { mpduCount: number; msduIds: number[] }
  /** The PSDU is an S-MPDU: one MPDU in an A-MPDU subframe with EOF = 1 (§10.12.7), answered by an Ack. */
  smpdu?: boolean
  /**
   * VHT/HE/EHT PPDUs: the A-MPDU pre-EOF padding length (APEP_LENGTH, §10.12.6) the duration was
   * computed from. `bytes` is then PSDU_LENGTH, and the difference is the EOF padding. Per member
   * of a MU PPDU the same pair is `MuPart.bytes` against this PPDU's symbol count.
   */
  apepBytes?: number
  /** Each MPDU's sequence number, Retry bit and Table 9-60 end-to-end address, in msdu order. */
  mpdus?: MpduHdr[]
  /** BlockAck frames: the starting sequence number and the acknowledged sequence numbers. */
  ba?: BaInfo
  /** OFDMA MU PPDU parts (DL MU data, or per-user context of triggers/M-BA). */
  muParts?: MuPart[]
  /** Frames sharing a group are RU-orthogonal: no mutual interference. */
  orthogonalGroup?: string
  /** Trigger frames only: the PPDU format the solicited TB PPDUs must use (the Trigger itself is non-HT). */
  ulMode?: PhyMode
  /** Trigger frames only: the channel width the solicited TB PPDUs must use (Common Info UL BW, §9.3.1.22.1). */
  ulWidthMhz?: number
  /**
   * Trigger-based PPDUs only: the resource unit this one station answers in — the share of the
   * solicited bandwidth it occupies, and its place in the Trigger's user list.
   * standard §9.3.1.22.1
   *
   * **Why on the frame and not in `muParts`.** A TB PPDU is one station's own single-user frame
   * — it carries no `muParts`, because the other invited stations' answers are separate PPDUs
   * sent at the same instant (`orthogonalGroup`). The Trigger is what assigns the unit, and it
   * does so **per user**: the allocation lives in the User Info field's RU Allocation subfield,
   * whose size and location are read against the Common Info field's UL BW subfield. Both
   * subfields are defined in §9.3.1.22.1, whose title is *General* rather than "Common Info
   * field" — worth saying because the obvious reading puts RU Allocation in Common Info, and
   * only UL BW is there. What the air carries afterwards is one narrow PPDU per station, so
   * that is what the share sits on. `respondToTrigger` (mac.ts) is the only writer.
   *
   * **Why one object rather than two optional fields.** As `ruFraction?` plus `ruIndex?` the
   * type admitted a share without a position, and the reader of it had to invent one; a default
   * of bin 0 put two stations on the same bins, and `selCombine`'s overflow gate cannot see
   * that — both runs stay inside the channel. Paired here, that state cannot be constructed.
   *
   * **`partIdx` is not the standard's RU index**, and the two are easy to confuse because at
   * 20 MHz with two users they agree numerically: it is the **0-based** index into the
   * Trigger's `muParts`, whereas the standard's RU index is **1-based** and counted in units of
   * the allocated RU size (Table 9-53 against Table 27-8, so RU 1 of two 106-tone RUs is four
   * 26-tone RUs wide). `selectivity.ts` already uses the standard's convention in prose, which
   * is why this one does not borrow the word. Downlink takes a member's position from the order
   * of `muParts`; a TB PPDU has no such list to be positioned in, which is the only reason the
   * index is written down at all (design 2026-10-04 §4).
   *
   * `fraction` is a **third** field meaning a share, and the three are not interchangeable:
   * `MuPart.ruFraction` is a downlink member's share inside one wide PPDU, `WIFI_SEL.ruFraction`
   * is what a receiver's decode decision was taken over, and this one describes the whole PPDU
   * it sits on. The pair is read only by `selCombine` (channel.ts) and enters no airtime, so no
   * recorded timeline moves.
   */
  ru?: { fraction: number; partIdx: number }
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

/**
 * Table 10-1 (UP-to-AC mappings): user priority 0…7 → AC index (0 BK, 1 BE, 2 VI, 3 VO).
 * UP 1, 2 → AC_BK; 0, 3 → AC_BE; 4, 5 → AC_VI; 6, 7 → AC_VO. Under EDCA a frame's TID is its UP
 * (§10.2.3.2), and the AC it is queued in follows from the UP by this table.
 */
export const AC_FOR_UP = [1, 0, 0, 1, 2, 2, 3, 3] as const

/** Table 10-1: the AC a user priority maps to. */
export function acForUp(up: number): number {
  return AC_FOR_UP[Math.max(0, Math.min(7, Math.trunc(up)))]
}

/**
 * Fallback only, for an MSDU built without a user priority (tests construct such MSDUs): a UP in
 * each AC (Table 10-1). Every MSDU the traffic sources emit carries its own UP, and its TID is that.
 */
export const TID_FOR_AC = [1, 0, 5, 6] as const

/**
 * The HT Control field (§9.2.4.6): 4 octets, present when the frame's +HTC bit is 1. This engine
 * puts one in a QoS Data frame only to carry a TRS Control subfield (§9.2.4.7.1) — the HE variant
 * of the field, whose A-Control holds the triggered-response scheduling for the HE/EHT TB PPDU
 * that acknowledges a DL MU PPDU (§10.3.2.13.2).
 */
export const HT_CONTROL_BYTES = 4

/**
 * One MPDU's own header fields that differ between the MPDUs of an A-MPDU: its sequence number,
 * its Retry bit (§9.2.4.1.6, set on a retransmission of that MPDU) and the end-to-end addresses
 * Table 9-60 puts in Address 3 — the DA when To DS is 1, the SA when From DS is 1. `da`/`sa` are
 * absent when the MSDU starts or ends at the transmitter or receiver itself.
 */
export interface MpduHdr {
  sn: number
  retry: boolean
  /** QoS Data only: the TID in the QoS Control field — the MSDU's user priority (§9.2.4.5.2). */
  tid?: number
  da?: string
  sa?: string
}

/** QoS Data / Data MPDU size: header (+ HT Control) + body + FCS. */
export function mpduBytes(msduBytes: number, qos: boolean, htc = false): number {
  return (qos ? QOS_HDR_BYTES : MAC_HDR_BYTES) + (htc ? HT_CONTROL_BYTES : 0) + msduBytes + FCS_BYTES
}

/** A-MPDU subframe: delimiter + QoS data MPDU, padded to 4 octets. */
export function ampduSubframeBytes(msduBytes: number, htc = false): number {
  return AMPDU_DELIMITER_BYTES + Math.ceil(mpduBytes(msduBytes, true, htc) / 4) * 4
}

/**
 * A-MPDU pre-EOF padding (§10.12.2): every subframe but the last is padded to a 4-octet boundary;
 * the last subframe's Padding subfield is added only by the EOF padding step (§10.12.6), so it is
 * not part of the length the PPDU's duration is computed from (APEP_LENGTH).
 */
export function ampduPsduBytes(msduBytesList: number[], htc = false, qos = true): number {
  return msduBytesList.reduce((s, b, i) => i === msduBytesList.length - 1
    ? s + AMPDU_DELIMITER_BYTES + mpduBytes(b, qos, htc)
    : s + AMPDU_DELIMITER_BYTES + Math.ceil(mpduBytes(b, qos, htc) / 4) * 4, 0)
}

/**
 * Where each MPDU sits in an A-MPDU: octet offset of its delimiter and the subframe's length up to
 * the end of the MPDU (delimiter + MPDU, without the trailing padding). Used by the receiver to
 * find which part of the data field carried which MPDU.
 */
export function ampduLayout(msduBytesList: number[], qos = true, htc = false): { off: number; len: number }[] {
  let off = 0
  return msduBytesList.map((b) => {
    const mpdu = mpduBytes(b, qos, htc)
    const at = { off, len: AMPDU_DELIMITER_BYTES + mpdu }
    off += AMPDU_DELIMITER_BYTES + Math.ceil(mpdu / 4) * 4
    return at
  })
}

/** What a run of claimed MSDUs costs as one PSDU, and what frame answers it. */
export interface PsduPlan {
  /**
   * Octets the PHY's duration is computed from: the PSDU of a non-HT PPDU, or the A-MPDU pre-EOF
   * padding — APEP_LENGTH — of a VHT/HE/EHT one (§10.12.6). The EOF padding that fills the last
   * symbol is added afterwards (`psduLengthFor`) and costs no airtime.
   */
  psduBytes: number
  /** True when this PSDU is an A-MPDU of more than one MPDU — the same bit that picks a BlockAck. */
  aggregate: boolean
  /**
   * True when the PSDU is an A-MPDU holding one MPDU with EOF = 1, an S-MPDU (§10.12.7). Every
   * VHT/HE/EHT PSDU is an A-MPDU (§9.7.3, §10.12.5); an S-MPDU follows the non-A-MPDU rules
   * (§10.12.8) and solicits an Ack.
   */
  smpdu: boolean
  /** The response this PPDU solicits: a compressed BlockAck, or an ACK. */
  respBytes: number
}

/**
 * The two shapes a transmit path can be in when it asks for a plan.
 *
 * The union exists so the MU/TB path cannot pass arguments that are then ignored: a legal
 * argument that provably changes nothing is how a refactor hides a second decision inside the
 * first one. `{ mu: true }` takes no `qos`, no `ampdu` and no `mode` because it reads none.
 */
export type PsduOpts =
  /** Single-user path: an A-MPDU of several MPDUs only if the link can aggregate AND there is more than one MSDU. */
  | { mu?: undefined; qos: boolean; ampdu: boolean; mode: PhyMode }
  /**
   * DL MU and trigger-based UL: the PSDU of an HE/EHT MU or TB PPDU is an A-MPDU whatever the
   * MSDU count (§9.7.3). `trs` puts an HT Control field carrying a TRS Control subfield in every
   * MPDU — the DL MU PPDU's way of soliciting its acknowledgement (§10.3.2.13.2).
   */
  | { mu: true; trs?: boolean }

/**
 * How claimed MSDUs become one PSDU: aggregate or not, how many octets, and which response.
 *
 * **This is one decision that used to be written out five times** — `transmitFor`,
 * `exchangeNs`, `planBurstNs`, `buildMuParts` and `respondToTrigger` in `engine/mac.ts`
 * (design 2026-10-07-amsdu §2.2).
 *
 * 2026-11-11 (W7a): a VHT/HE/EHT PSDU is always an A-MPDU (§9.7.3, §10.12.5), so one MSDU on
 * such a link goes out as an S-MPDU — 4 octets of delimiter dearer than the bare MPDU this used to
 * price it at — and is still answered by an Ack (§10.12.8). Only a non-HT PPDU carries a bare MPDU.
 */
export function psduPlan(msduBytes: number[], opts: PsduOpts): PsduPlan {
  if (opts.mu) {
    return { psduBytes: ampduPsduBytes(msduBytes, opts.trs === true), aggregate: true, smpdu: false, respBytes: BA_BYTES }
  }
  if (opts.mode !== 'nonht' && opts.ampdu && msduBytes.length > 1) {
    // An A-MPDU answered by a BlockAck carries QoS Data (implicit BAR ack policy lives in the QoS
    // Control field, §9.2.4.5.4, §10.25), so its MPDUs have the 26-octet header whatever `qos` says.
    return { psduBytes: ampduPsduBytes(msduBytes), aggregate: true, smpdu: false, respBytes: BA_BYTES }
  }
  const mpdu = mpduBytes(msduBytes[0], opts.qos)
  if (opts.mode !== 'nonht') {
    return { psduBytes: AMPDU_DELIMITER_BYTES + mpdu, aggregate: false, smpdu: true, respBytes: ACK_BYTES }
  }
  return { psduBytes: mpdu, aggregate: false, smpdu: false, respBytes: ACK_BYTES }
}

/**
 * PSDU_LENGTH of a VHT/HE/EHT PPDU whose A-MPDU pre-EOF padding is `apepBytes` octets: the octets
 * the data symbols hold once the MAC has padded the A-MPDU to fill them (§10.12.6 — the final
 * subframe's Padding subfield, then 4-octet EOF padding subframes, then EOF padding octets). It is
 * the inverse of the symbol count `txTimeModeNs` takes from the same length: the service field and
 * tail are taken out of N_SYM × N_DBPS and what is left, in whole octets, is the PSDU.
 */
export function psduLengthFor(apepBytes: number, ndbps: number): number {
  const nsym = Math.ceil((16 + 8 * apepBytes + 6) / ndbps)
  return Math.max(apepBytes, Math.floor((nsym * ndbps - 16 - 6) / 8))
}

/**
 * The EOF padding §10.12.6 adds to an A-MPDU of `apepBytes` to make it `psduLength` octets:
 * first the final subframe's Padding subfield up to a 4-octet boundary, then EOF padding
 * subframes (4-octet delimiters with MPDU Length 0 and EOF 1), then EOF padding octets.
 */
export function eofPadding(apepBytes: number, psduLength: number): { finalPad: number; eofSubframes: number; eofOctets: number } {
  let len = apepBytes
  let finalPad = 0
  while (len < psduLength && len % 4 !== 0) { finalPad++; len++ }
  let eofSubframes = 0
  while (len + AMPDU_DELIMITER_BYTES <= psduLength) { eofSubframes++; len += AMPDU_DELIMITER_BYTES }
  return { finalPad, eofSubframes, eofOctets: psduLength - len }
}
