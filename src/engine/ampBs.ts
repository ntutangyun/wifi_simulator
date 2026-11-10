/**
 * IEEE P802.11bp Ambient Power (AMP), **backscatter** mode in 2.4 GHz: the propagation law a
 * reflected signal travels, the reader's own noise floor, the mono-static frames (AMP Trigger,
 * AMP RFID carrying UHF commands), and the two excitation fields that keep a tag alive while it answers.
 *
 * This is slice A2's model half; `amp.ts` next door is the Active Tx tier, where the tag makes
 * its own carrier. The two share the legacy preamble and the Manchester-OOK bit timing and
 * nothing else: a backscatter tag has no oscillator, so its uplink is the reader's own carrier
 * switched on and off, 6 dB down and attenuated twice over.
 *
 * Sources. P802.11bp is at letter ballot and its drafts are members-only, so every number here
 * carries the tag of what it came from: `SFD PM-/FM-/MM-nn` is an adopted motion of the TGbp
 * Specification Framework 11-24/1613r20, `PDT nn-nn/nnnn` is proposed draft text, `TGbp
 * nn-nn/nnnn (contribution)` is a presentation the group discussed but did not adopt — used only
 * where the framework leaves a value TBD — `EPC Gen2` is ISO/IEC 18000-63, which the framework
 * adopts by reference (MM-10, MM-29, FM-44), and `model` is our own choice.
 *
 * Nothing of the draft's text is reproduced: field names and numbers only.
 */
import { AMP_FCS_BYTES, AMP_HDR_BYTES, AMP_LEGACY_PREAMBLE_NS, AMP_TRIGGER_BODY_BYTES, ampBitsNs } from './amp'
import { hashStr } from './hash'
import { freeSpacePl0Db } from '../uwb/units'
import type { FrameDesc } from '../model/frames'
import type { Ns } from '../model/types'

/** The free-space first metre, from the leaf of the UWB stack — one definition of the law for
 * every carrier this engine measures a first metre on, rather than a second copy here. physics */
export { freeSpacePl0Db }

// --- The reader and the tag ------------------------------------------------------

export const AMP_BS_LOSS_DB = 6 // TGbp 11-24/0537r0, 11-23/2038r1 (contribution)
export const AMP_BS_ISOLATION_DB = 20 // TGbp 11-25/0058r1, 11-24/0537r0 (contribution)
export const AMP_BS_READER_DR_DB = 50 // TGbp 11-25/0307r0 (contribution)
export const AMP_BS_ACTIVATION_DBM = -20 // TGbp 11-24/0537r0; PDT 11-26/1581r1 (S1G DL sensitivity)
export const AMP_BS_TAG_PPM = 100_000 // SFD PM-28
export const FREQ_24G_MHZ = 2440 // model: mid-band

/** The two uplink rates a backscatter tag may be told to answer at. SFD PM-17 */
export type AmpBsUlKbps = 250 | 1000

export const AMP_BS_REQ_SNR_DB: Record<AmpBsUlKbps, number> = { 250: 3, 1000: 9 } // model

// --- Excitation and PPDU timing --------------------------------------------------

export const AMP_BS_T1_NS: Ns = 16_000 // SFD PM-75 immediate response time
export const AMP_BS_T2_NS: Ns = 16_000 // TGbp 11-26/0120r0 AP turnaround (contribution)
/** A Write's processing time: ≥ 2 ms. Not sent by this reader — 1.1 × 2 ms of BST-Excitation alone
 * is longer than the AC_BK TXOP limit (2.528 ms, Table 9-194) less the PPDU around it. */
export const AMP_BS_WRITE_T3_NS: Ns = 2_000_000 // TGbp 11-26/0120r0 (contribution)
export const AMP_BS_WUP_MIN_NS: Ns = 1_000_000 // SFD PM-73
export const AMP_BS_BST_MIN_NS: Ns = 16_000 // SFD PM-74
export const AMP_BS_DL_SYNC_NS: Ns = 16_000 // SFD PM-63: 8 chips × 2 µs (PM-10)
export const AMP_BS_DL_KBPS = 250 // SFD: 250 kb/s DL (#16); one DL rate for mono-static (model)
export const AMP_BS_UL_SYNC_CHIPS = 24 // SFD PM-57: [S,S,S], S = 8 chips
export const AMP_BS_UL_CHIP_NS: Record<AmpBsUlKbps, Ns> = { 250: 2000, 1000: 500 } // model reading of PM-35 (Manchester, no FEC)
/**
 * The excitation is stretched by 20 % over T1 and by 10 % over T3 and the reply itself, so a tag
 * whose clock is nowhere near the reader's cannot walk its answer out of the carrier.
 *
 * Those two percentages are the draft's own response-window margins, not a conversion of the tag
 * clock: `AMP_BS_TAG_PPM` = 100 000 ppm is ±10 %, and the framework states the ±20 % window on T1
 * separately. The model applies the framework's numbers, 1.2 and 1.1, and does not re-derive them
 * from the ppm figure.
 *
 * The framework attributes the BST-Excitation *formula* to a group of motions rather than each
 * margin to one of them, so the collective tag is the honest one. SFD PM-74, PM-75, PM-86…PM-88
 */
const BST_T1_MARGIN = 1.2 // SFD PM-74, PM-75, PM-86…PM-88 (collective)
const BST_REPLY_MARGIN = 1.1 // SFD PM-74, PM-75, PM-86…PM-88 (collective)
/** The 1 µs the delayed form adds on top of the stretched T3. SFD PM-74, PM-75, PM-86…PM-88 (collective) */
const BST_DELAYED_SLACK_NS: Ns = 1000

// --- Propagation -----------------------------------------------------------------

/**
 * Free space at the carrier, 20 dB a decade of distance, plus whatever the walls charge.
 *
 * Not the Wi-Fi link's indoor law (46.7 + 30·log10 d, referenced at a metre): below a metre that
 * one extrapolates to *less* than free-space loss, which is not physics, and every backscatter
 * budget in the corpus is Friis — and a backscatter link is a tens-of-centimetres affair. The
 * clamp at 5 cm keeps a tag sitting on the antenna loud rather than infinite. model (Friis)
 */
export function bsPathLossDb(fMhz: number, dM: number, wallsDb: number): number {
  return freeSpacePl0Db(fMhz) + 20 * Math.log10(Math.max(dM, 0.05)) + wallsDb
}

/** What the reader's own transmission leaks into its receiver in mono-static operation: one
 * device, two antennas, `AMP_BS_ISOLATION_DB` of isolation between them. */
export function monoLeakDbm(bsDbm: number): number {
  return bsDbm - AMP_BS_ISOLATION_DB
}

/** The effective noise floor left after digital leakage removal: the leakage, `AMP_BS_READER_DR_DB`
 * down. The lesson's point in one line — in mono-static the floor rises with the excitation, so
 * turning the reader up buys no reach at all. */
export function readerFloorDbm(leakDbm: number): number {
  return leakDbm - AMP_BS_READER_DR_DB
}

/** A mono-static round trip: out through the path loss, reflected `AMP_BS_LOSS_DB` down, back
 * through the same path loss. */
export function bsReplyDbm(bsDbm: number, plDb: number): number {
  return bsDbm - 2 * plDb - AMP_BS_LOSS_DB
}

export function bsDecodes(replyDbm: number, floorDbm: number, kbps: AmpBsUlKbps): boolean {
  return replyDbm - floorDbm >= AMP_BS_REQ_SNR_DB[kbps]
}

/**
 * The largest distance at which `bsDecodes` still holds, in closed form — the number the lesson
 * quotes and the scene places tags either side of.
 *
 * It is `bsReplyDbm(bsDbm, PL) − readerFloorDbm(monoLeakDbm(bsDbm)) = reqSnr` solved for PL, and
 * the excitation cancels out of that equation — the reply is `bsDbm − 2·PL − LOSS`, the floor is
 * `bsDbm − ISOLATION − DR`, so the margin is `ISOLATION + DR − LOSS − 2·PL` = 64 − 2·PL dB
 * whatever `bsDbm` is. It is written out with `bsDbm` in it rather than pre-cancelled, so that
 * the cancellation is something the code does rather than something a comment claims.
 */
export function monoReachM(bsDbm: number, kbps: AmpBsUlKbps, wallsDb = 0): number {
  const budgetDb = bsDbm - AMP_BS_LOSS_DB - readerFloorDbm(monoLeakDbm(bsDbm)) - AMP_BS_REQ_SNR_DB[kbps]
  return 10 ** ((budgetDb / 2 - freeSpacePl0Db(FREQ_24G_MHZ) - wallsDb) / 20)
}

/** The largest distance at which a tag still receives `AMP_BS_ACTIVATION_DBM` and boots. Unlike
 * `monoReachM` this one *does* grow with the power: a reader turned up wakes tags it cannot hear. */
export function activationReachM(chargeDbm: number, wallsDb = 0): number {
  const maxPlDb = chargeDbm - AMP_BS_ACTIVATION_DBM
  return 10 ** ((maxPlDb - freeSpacePl0Db(FREQ_24G_MHZ) - wallsDb) / 20)
}

// --- Mono-static frames ----------------------------------------------------------

/**
 * The downlink frames a mono-static reader sends (PDT 11-26/1519r5 §39.3.3; PDT 11-26/1520r3).
 *
 *  - `trigger`: a broadcast **AMP Trigger** frame for random access — ID 0xFFFF, one slot, UL data
 *    rate, slot duration, Session ID and ACWE (§39.3.3). The tags it solicits answer with an AMP
 *    Response frame carrying their 16-bit identifier.
 *  - `read`: an individually addressed **AMP RFID** frame (Motion #239) whose frame body carries
 *    the UHF Read command (ISO/IEC 18000-63, MM-29); the tag answers with an AMP RFID frame
 *    carrying the Read reply. This reader reads the EPC memory bank, which is how it learns a
 *    tag's EPC (the global identifier, Motion #241).
 *
 * Until 2026-11-11 the reader tunnelled EPC Gen2's own inventory — Query, QueryRep, ACK and the
 * 2^Q slot counter — after proposal 11-25/0061r0, which TGbp never adopted. Select, Write and
 * Authenticate (MM-29) are not sent: see `ampReader.ts`.
 */
export type BsCmd = 'trigger' | 'read'
/** Frame body octets: the AMP Trigger body as the Active Tx trigger's (`AMP_TRIGGER_BODY_BYTES`,
 * model — the draft gives the fields, not their widths); the Read command's Gen2 bits (8-bit
 * code, MemBank, WordPtr, WordCount, RN, CRC-16: 58 bits) rounded up to octets (model rounding). */
export const BS_CMD_BODY_BYTES: Record<BsCmd, number> = { trigger: AMP_TRIGGER_BODY_BYTES, read: 8 }
export const BS_CMD_NAME: Record<BsCmd, string> = { trigger: 'AMP Trigger', read: 'Read' }

/**
 * The uplink a tag reflects. `id`: an AMP Response frame (Table 9-742 type 3, PDT 11-25/1678r2)
 * with no frame body — the answer to a random-access trigger is the tag's identifier (§39.3.3).
 * `read`: an AMP RFID frame whose body is the Gen2 Read reply for the EPC bank — header bit,
 * six 16-bit EPC words, the RN and a CRC-16, 129 bits rounded up to 17 octets (model rounding).
 */
export type BsReply = 'id' | 'read'
export const BS_REPLY_BODY_BYTES: Record<BsReply, number> = { id: 0, read: 17 }
export const BS_REPLY_NAME: Record<BsReply, string> = { id: 'AMP Response', read: 'Read reply' }

/** AMP RFID frame: MAC header 32 bits (Frame Control 8, ID 16, Type Dependent Control 8) and a
 * 16-bit FCS. PDT 11-26/1520r3 Figure 9-155x1/x2 */
export const AMP_RFID_HDR_BYTES = 4
export const AMP_RFID_FCS_BYTES = 2

/** Octets of a downlink frame: an AMP Trigger in the Active Tx trigger's layout, an AMP RFID frame in its own. */
export function bsCmdBytes(cmd: BsCmd): number {
  return cmd === 'trigger'
    ? AMP_HDR_BYTES + BS_CMD_BODY_BYTES.trigger + AMP_FCS_BYTES
    : AMP_RFID_HDR_BYTES + BS_CMD_BODY_BYTES.read + AMP_RFID_FCS_BYTES
}

/** Octets of a reflected frame: an AMP Response in the Active Tx layout (id only), an AMP RFID frame in its own. */
export function bsReplyBytes(reply: BsReply): number {
  return reply === 'id'
    ? AMP_HDR_BYTES + AMP_FCS_BYTES
    : AMP_RFID_HDR_BYTES + BS_REPLY_BODY_BYTES.read + AMP_RFID_FCS_BYTES
}

/**
 * How long a tag's reflected answer occupies the air: the [S, S, S] sync of
 * `AMP_BS_UL_SYNC_CHIPS` chips, then Manchester-OOK data with no FEC — two chips to a bit, so
 * 4 µs a bit at 250 kb/s and 1 µs at 1 Mb/s. SFD PM-57, PM-35, PM-20
 */
export function bsReplyNs(reply: BsReply, kbps: AmpBsUlKbps): Ns {
  const chipNs = AMP_BS_UL_CHIP_NS[kbps]
  return AMP_BS_UL_SYNC_CHIPS * chipNs + bsReplyBytes(reply) * 8 * 2 * chipNs
}

/**
 * The BST-Excitation: the carrier the reader keeps on after its command so the tag has something
 * to reflect and something to think with.
 *
 * Three cases. An immediate response is stretched over `1.2·T1 + 1.1·T4`, T4 being the reply's
 * own airtime; a delayed one — a command whose processing time T3 the upper layer gives the MAC
 * (PDT 11-26/1798r1) — over `1.1·T3 + 1 µs + 1.1·T4`; and a command expecting nothing back still
 * holds the carrier for the stretched T1. The first and third never drop below
 * `AMP_BS_BST_MIN_NS`. SFD PM-74, PM-75, PM-86…PM-88. This reader sends no delayed command
 * (`ampReader.ts`), so the second case is kept for the formula's sake only.
 */
export function bstNs(reply: BsReply | null, kbps: AmpBsUlKbps, delayedT3Ns?: Ns): Ns {
  if (reply === null) return Math.max(AMP_BS_BST_MIN_NS, Math.round(BST_T1_MARGIN * AMP_BS_T1_NS))
  const replyNs = bsReplyNs(reply, kbps)
  if (delayedT3Ns !== undefined) {
    return Math.round(BST_REPLY_MARGIN * delayedT3Ns + BST_DELAYED_SLACK_NS + BST_REPLY_MARGIN * replyNs)
  }
  return Math.max(AMP_BS_BST_MIN_NS, Math.round(BST_T1_MARGIN * AMP_BS_T1_NS + BST_REPLY_MARGIN * replyNs))
}

/**
 * Where the AMP-Sync of a downlink PPDU ends and the command begins: the legacy preamble +
 * U-SIG, then the WUP-Excitation that boots the tags — a millisecond at minimum, and only on the
 * first PPDU of a TXOP, so `wupNs` is 0 afterwards — then the mono-static AMP-Sync.
 * SFD PM-38, PM-63, PM-72, PM-73
 */
export function ampBsSyncEndNs(wupNs: Ns): Ns {
  return AMP_LEGACY_PREAMBLE_NS + wupNs + AMP_BS_DL_SYNC_NS
}

/**
 * Where AMP-Data ends: the sync, then the frame at 250 kb/s Manchester OOK. There is no
 * AMP-SIG in mono-static and no padding field.
 *
 * This is the instant the BST-Excitation starts, the tag's answer becomes due (T1 later) and the
 * radiated power drops from `chargeDbm` to `bsDbm` — so the medium needs it as much as the
 * airtime does, and both take it from here rather than each composing the prefix for itself.
 * SFD PM-65 note; 11-25/0061r0 (single DL rate)
 */
export function ampBsDataEndNs(cmd: BsCmd, wupNs: Ns): Ns {
  return ampBsSyncEndNs(wupNs) + ampBitsNs(bsCmdBytes(cmd) * 8, AMP_BS_DL_KBPS)
}

/**
 * The whole downlink PPDU, excitations included: everything up to the end of AMP-Data (whose
 * L-SIG LENGTH covers all of this, so Wi-Fi defers for the lot), the BST-Excitation and the
 * signal extension. SFD PM-38, PM-63, PM-65 note, PM-72, PM-73
 */
export function ampBsDlPpduNs(cmd: BsCmd, wupNs: Ns, bstNs: Ns, signalExtNs: Ns): Ns {
  return ampBsDataEndNs(cmd, wupNs) + bstNs + signalExtNs
}

export interface AmpRfidArgs {
  src: string; dst: string; cmd: BsCmd; session: number; acwe?: number; slot: number
  ulKbps: AmpBsUlKbps; wupNs: Ns; bstNs: Ns; chargeDbm: number; bsDbm: number; signalExtNs: Ns
  /** The addressed tag's EPC, when the scenario configured one. Left out for a broadcast command
   * and for a tag that takes the EPC `epcOf` derives from its node id. */
  epc?: string
}

/** A mono-static downlink PPDU — an AMP Trigger or an AMP RFID frame — with its two excitations.
 * SFD FM-44, FM-45, FM-24; PDT 11-26/1519r5 §39.3.3, 11-26/1520r3 */
export function ampRfidFrame(a: AmpRfidArgs): FrameDesc {
  const bytes = bsCmdBytes(a.cmd)
  return {
    kind: 'ampRfid', src: a.src, dst: a.dst, bytes, mbps: AMP_BS_DL_KBPS / 1000,
    durationFieldNs: 0, txTimeNs: ampBsDlPpduNs(a.cmd, a.wupNs, a.bstNs, a.signalExtNs),
    amp: {
      dir: 'dl', kbps: AMP_BS_DL_KBPS,
      rfid: {
        cmd: a.cmd, session: a.session, acwe: a.acwe, epc: a.epc, slot: a.slot,
        wupNs: a.wupNs, bstNs: a.bstNs, chargeDbm: a.chargeDbm, bsDbm: a.bsDbm, ulKbps: a.ulKbps,
      },
    },
  }
}

export interface AmpBsReplyArgs {
  src: string; dst: string; reply: BsReply; kbps: AmpBsUlKbps; slot: number; epc?: string
}

/** A tag's backscattered answer. It carries no power of its own: `amp.bs.incidentDbm` is filled
 * in by whoever knows the geometry, and the medium reads it back out. SFD PM-24, FM-35 */
export function ampBsReplyFrame(a: AmpBsReplyArgs): FrameDesc {
  return {
    kind: 'ampBsReply', src: a.src, dst: a.dst, bytes: bsReplyBytes(a.reply), mbps: a.kbps / 1000,
    durationFieldNs: 0, txTimeNs: bsReplyNs(a.reply, a.kbps),
    amp: { dir: 'ul', kbps: a.kbps, bs: { reply: a.reply, slot: a.slot, epc: a.epc } },
  }
}

// --- Identity --------------------------------------------------------------------

/** The tag's 96-bit EPC as 24 hex characters, derived from the node id so that adding a tag to a
 * scenario cannot renumber the others. model (the derivation; the width is EPC Gen2's) */
export function epcOf(nodeId: string): string {
  let out = ''
  for (let i = 0; i < 3; i++) out += hashStr(`${nodeId}#epc${i}`).toString(16).padStart(8, '0')
  return out
}

/**
 * The tag's 16-bit AMP id: a CRC-16 over the twelve octets of its EPC, as `ampId16` does for the
 * Active Tx tier — 0 and 0xffff are reserved, so both fold to 0x5a5a.
 *
 * model (SFD FM-25 names CRC-16 of the global identifier; the 802.11ba engine's polynomial is not
 * in this repo), so: CRC-16-CCITT, polynomial 0x1021, initial value 0xFFFF.
 */
export function crc16Epc(epc: string): number {
  let crc = 0xffff
  for (let i = 0; i + 1 < epc.length; i += 2) {
    const byte = Number.parseInt(epc.slice(i, i + 2), 16)
    crc ^= (byte & 0xff) << 8
    for (let bit = 0; bit < 8; bit++) crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc === 0 || crc === 0xffff ? 0x5a5a : crc
}
