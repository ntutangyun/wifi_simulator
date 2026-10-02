import type { Material, UwbMode } from '../model/scenario'
import type { Ns } from '../model/types'
import { mmsLayout, mmsLongestFragmentNs, MMS_SLOTS_PER_MS, type MmsPhy } from './mms'
import { NB_REPORT_BYTES, nbOtmPollBytes, nbPpduNs } from './nb'
import { chipsToNs, freeSpacePl0Db, UWB_CHIP_HZ, UWB_CHIP_NS, UWB_RX_SENS_DBM } from './units'

// --- Chip, RCTU, RSTU units -------------------------------------------------

// The units themselves, the free-space law and the receiver's floor live one module down, in
// the leaf `units.ts`, so that `mms.ts` and `nb.ts` can read them without importing this file
// (which imports them). They are re-exported here because every caller in the repository has
// always asked `phy.ts` for them, and `phy.ts` is still where a reader looks for the UWB PHY.
export {
  chipsToNs, freeSpacePl0Db, uwbPathLossDb, COUNTER_BITS, COUNTER_MOD, C_M_PER_NS, RCTU_NS,
  RCTU_PER_CHIP, RCTU_PS, UWB_CHIP_HZ, UWB_CHIP_NS, UWB_PL_EXP, UWB_RX_SENS_DBM,
} from './units'

export const RSTU_CHIPS = 416 // standard §10.29.1.5, Table 10-145
export const RSTU_NS = RSTU_CHIPS * UWB_CHIP_NS // standard §10.29.1.5: 833.333 ns

// --- SP1 BPRF PPDU structure -------------------------------------------------

export const PSYM_CHIPS = 508 // standard Table 16-5: code length 127, L = 4
export const SYNC_SYMBOLS = 64 // standard Table 16-31 set 3 (SYNC PSR 64)
export const SFD_SYMBOLS = 8 // standard Table 16-31 set 3 (SFD #2)
export const STS_ACTIVE_CHIPS = 64 * 512 // standard Table 16-17 BPRF: 64 × 512 chips
export const STS_GAP_CHIPS = 512 // standard §16.2.9.1
export const PHR_SYMBOLS = 19 // standard §16.2.7.1
export const PHR_SYMBOL_CHIPS = 512 // standard Table 16-4/16-14 (850 kb/s nominal)
export const DATA_SYMBOL_CHIPS = 64 // standard Table 16-4 (6.8 Mb/s)
export const RS_PARITY_BITS = 48 // standard §16.3.3.2
export const RS_BLOCK_BITS = 330 // standard §16.3.3.2 (55 × 6)
export const TAIL_SYMBOLS = 2 // standard Table 16-2

export const UWB_SHR_CHIPS = (SYNC_SYMBOLS + SFD_SYMBOLS) * PSYM_CHIPS // 36 576
export const UWB_RMARKER_CHIPS = UWB_SHR_CHIPS // standard §10.29.1.1: first chip after the SFD
export const UWB_RMARKER_NS = UWB_RMARKER_CHIPS * UWB_CHIP_NS // 73 269.23 ns, exact (float)
export const UWB_STS_CHIPS = STS_GAP_CHIPS + STS_ACTIVE_CHIPS + STS_GAP_CHIPS // 33 792
export const UWB_PHR_CHIPS = PHR_SYMBOLS * PHR_SYMBOL_CHIPS // 9 728

/** PSDU symbol count: 8·octets data bits, plus 48 parity bits per RS(63,55)
 * block (each block covers up to 330 data bits), plus a 2-symbol tail.
 * standard §16.3.3.2 */
export function psduSymbols(octets: number): number {
  const dataBits = 8 * octets
  const blocks = Math.ceil(dataBits / RS_BLOCK_BITS)
  return dataBits + RS_PARITY_BITS * blocks + TAIL_SYMBOLS
}

export function uwbPpduChips(octets: number): number {
  return UWB_SHR_CHIPS + UWB_STS_CHIPS + UWB_PHR_CHIPS + psduSymbols(octets) * DATA_SYMBOL_CHIPS
}

export function uwbPpduNs(octets: number): Ns {
  return chipsToNs(uwbPpduChips(octets))
}

// --- Channel / path loss -----------------------------------------------------

export type UwbChannelNo = 5 | 9
export const UWB_CHANNEL_MHZ: Record<UwbChannelNo, number> = { 5: 6489.6, 9: 7987.2 } // standard Table 11-9

/** Free-space path loss at 1 m on a UWB channel. standard Table 11-9 (frequencies) */
export function uwbPl0Db(ch: UwbChannelNo): number {
  return freeSpacePl0Db(UWB_CHANNEL_MHZ[ch])
}

export const UWB_TX_POWER_DBM = -14 // model default (−41.3 dBm/MHz mean EIRP over 499.2 MHz)
export const UWB_CAPTURE_DB = 6 // model
export const UWB_NLOS_NS: Record<Material, number> = { drywall: 0.5, brick: 2.0, glass: 0.2 } // model
export const UWB_PPM_MAX = 20 // standard §16.4.9: ±20 ppm

// --- 6 GHz coexistence: band edges and overlap arithmetic -----------------------

/**
 * Each UWB channel's occupied band: its centre ± half the 499.2 MHz channel width, derived from
 * the centres above rather than written out a second time, so a channel added there cannot be
 * given an edge that disagrees with it. standard Table 11-9
 *
 * The halving is snapped back to the 0.1 MHz the standard's table states: `6489.6 + 249.6` is
 * 6739.200000000001 in binary floating point, and these edges are compared against Wi-Fi channel
 * edges that are exact, so the snap keeps 6240.0 / 6739.2 / 7737.6 / 8236.8 exactly as before.
 */
const bandOf = (ch: UwbChannelNo): { lo: number; hi: number } => {
  const half = UWB_CHIP_HZ / 1e6 / 2
  const snap = (x: number): number => Math.round(x * 10) / 10
  return { lo: snap(UWB_CHANNEL_MHZ[ch] - half), hi: snap(UWB_CHANNEL_MHZ[ch] + half) }
}
export const UWB_BAND_MHZ: Record<UwbChannelNo, { lo: number; hi: number }> = {
  5: bandOf(5),
  9: bandOf(9),
}

/** Width, in MHz, of the Wi-Fi channel [centerMhz − widthMhz/2, centerMhz + widthMhz/2]
 * that falls inside UWB channel `ch`'s band. Always ≥ 0. */
export function uwbBandOverlapMhz(centerMhz: number, widthMhz: number, ch: UwbChannelNo): number {
  const lo = centerMhz - widthMhz / 2
  const hi = centerMhz + widthMhz / 2
  const band = UWB_BAND_MHZ[ch]
  return Math.max(0, Math.min(hi, band.hi) - Math.max(lo, band.lo))
}

/** Fraction (0…1) of the Wi-Fi channel that overlaps UWB channel `ch`'s band. */
export function uwbBandOverlap(centerMhz: number, widthMhz: number, ch: UwbChannelNo): number {
  return uwbBandOverlapMhz(centerMhz, widthMhz, ch) / widthMhz
}

// --- Timestamp precision against the link -------------------------------------

/**
 * The gain a leading-edge estimator has over the packet detector it shares an antenna with: it
 * accumulates the whole SYNC field — `SYNC_SYMBOLS` repetitions of one preamble symbol — before
 * it reads a first path, and coherent accumulation of N repetitions is 10·log10(N). It is
 * derived from the SHR this file already sizes rather than written out, so a different preamble
 * length moves the timestamp's noise floor with it. model
 */
export const UWB_TS_ACCUM_GAIN_DB = 10 * Math.log10(SYNC_SYMBOLS) // 18.1 dB

/**
 * The floor a reception's signal-to-noise ratio is measured against, for the purpose of timing
 * it: the receiver's sensitivity — the power at which a *packet* decodes — less the
 * accumulation gain above, because a timestamp is formed from the whole preamble and not from
 * one bit's worth of energy. A frame at sensitivity therefore times at `UWB_TS_ACCUM_GAIN_DB`,
 * not at 0 dB, which is what lets a link stay at its quoted precision well past the range a
 * thermal floor would allow. model
 */
export const UWB_NOISE_FLOOR_DBM = UWB_RX_SENS_DBM - UWB_TS_ACCUM_GAIN_DB

/** The SNR a session's `tsNoisePs` is quoted at. At or above it a receive timestamp is exactly
 * as good as the configuration says; below it the leading-edge estimator degrades. model */
export const TS_SNR_REF_DB = 20

/** The worst the estimator is allowed to get, as a multiple of `tsNoisePs`. The shape below
 * reaches it at 0 dB and holds it beneath: a receiver that far down does not produce a usable
 * leading edge at all, and without the cap one frame would carry kilometres of range. model */
export const TS_SIGMA_MAX = 10

/**
 * How much worse than its quoted 1-σ a receive timestamp taken at `snrDb` is:
 * `sqrt(SNR_ref / SNR)`, the Cramér-Rao shape of a leading-edge estimator — the variance of a
 * time-of-arrival estimate goes as 1/SNR, so its 1-σ goes as 1/√SNR — floored at 1 (a loud
 * link is no better than the receiver's own quoted precision) and capped at `TS_SIGMA_MAX`.
 * model
 */
export function tsNoiseScale(snrDb: number): number {
  const scale = Math.sqrt(10 ** ((TS_SNR_REF_DB - snrDb) / 10))
  return Math.min(TS_SIGMA_MAX, Math.max(1, scale))
}

/**
 * The SNR — SINR, when a Wi-Fi neighbour shares the band — one reception is stamped at: its
 * received power over the receiver's noise floor plus whatever foreign power the mediator
 * reported over it. With nothing foreign on the air (`-Infinity`) this is the plain SNR. model
 */
export function uwbSinrDb(rxDbm: number, foreignDbm: number): number {
  const noiseMw = 10 ** (UWB_NOISE_FLOOR_DBM / 10)
    + (Number.isFinite(foreignDbm) ? 10 ** (foreignDbm / 10) : 0)
  return rxDbm - 10 * Math.log10(noiseMw)
}

/** The 1-σ, in nanoseconds, of a receive timestamp taken at `snrDb` in a session that quotes
 * `tsNoisePs`. One definition: every mode's draw is scaled through this. model */
export function tsSigmaNs(tsNoisePs: number, snrDb: number): number {
  return (tsNoisePs / 1000) * tsNoiseScale(snrDb)
}

export const UWB_SIR_MIN_DB = -12 // model
export const UWB_MAX_INPUT_DBM_PER_MHZ = -45 // standard §16.4.10 (documented, not enforced)

/** EIRP of a UWB frame inside a Wi-Fi channel: −14 dBm spread over 499.2 MHz, times the
 * overlapping width. −Infinity when the channels do not overlap at all. */
export function uwbInBandDbm(txPowerDbm: number, overlapMhz: number): number {
  return txPowerDbm + 10 * Math.log10(overlapMhz / (UWB_CHIP_HZ / 1e6))
}

// --- Frame sizes --------------------------------------------------------------

// The MHR and the FCS are the standard's frame format; every IE's content width is a model
// choice made from the field lists of §10.29.8 and §10.32.9, so each one is written out as the
// sum of the fields it stands for, and the frame helpers below add those constants up rather
// than restating the arithmetic.

/**
 * Which of the standard's five two-way ranging procedures carries a reply time or round-trip
 * time, and how (standard §10.29.6.3–.7): `'embedded'` writes it into the very frame whose own
 * send time it measures, which only works when the hardware can pre-schedule that send time;
 * `'deferred'` sends that frame empty of it and reports it in a later one, once the sender has
 * read its own transmit timestamp back; `'fixed'` never puts it on the air at all — both ends
 * agree on it in advance, and the responder is trusted to transmit at exactly that offset. See
 * `docs/superpowers/specs/2026-09-29-reply-time-design.md` §2 for why a frame cannot carry a
 * number that measures itself. */
export type UwbReplyTime = 'embedded' | 'deferred' | 'fixed'

/** The largest PSDU the PHR's frame-length field can express. standard §16.2.7 */
export const UWB_MAX_PSDU_BYTES = 127

/** Frame Control 2 + Sequence Number 1 + destination PAN 2 + destination short address 2
 * + source short address 2. Short (16-bit) addressing throughout is the model's choice. */
export const UWB_MHR_BYTES = 9
/** The CRC-16 that closes every 802.15.4 frame. */
export const UWB_FCS_BYTES = 2
/** Element ID and length, in front of each payload IE. */
export const UWB_IE_HDR_BYTES = 2

/** ARC IE (§10.32.9.1): header + control 2 + block index 2 + round index 2 + slot index 2. */
export const ARC_IE_BYTES = UWB_IE_HDR_BYTES + 8
/** RRMC IE (§10.29.8.3): header + one control octet (what the round asks the responder for). */
export const RRMC_IE_BYTES = UWB_IE_HDR_BYTES + 1
/** RRTI IE (§10.29.8.1): header + one reply time of 4 octets. One IE holds one reply time. */
export const RRTI_IE_BYTES = UWB_IE_HDR_BYTES + 4
/** RCPS IE (§10.32.9.5): header + first slot 1 + last slot 1. standard §10.32.9.5; content sizing model */
export const RCPS_IE_BYTES = UWB_IE_HDR_BYTES + 2
/** RCMA IE (§10.32.9.6): header + max attempts 1. standard §10.32.9.6; content sizing model */
export const RCMA_IE_BYTES = UWB_IE_HDR_BYTES + 1
/** RDM IE (§10.32.9.8), fixed part: header + the device count. */
export const RDM_IE_FIXED_BYTES = UWB_IE_HDR_BYTES + 1
/** One RDM entry: the device's short address 2 + the slot index it is given 1. */
export const RDM_ENTRY_BYTES = 3
/** RMI IE (§10.29.8.4) in a Final, fixed part: header + the responder count. */
export const RMI_FINAL_FIXED_BYTES = UWB_IE_HDR_BYTES + 1
/** One RMI entry in an embedded Final: the responder's short address 2 + its round-trip time 4. */
export const RMI_FINAL_ENTRY_BYTES = 6
/** One RMI entry in a *deferred* Final: the responder's short address only. Ruling of design §5 —
 * `docs/superpowers/specs/2026-09-29-reply-time-design.md` — the deferred Final is not empty: an
 * anchor's `finalListedMe` (device.ts) reads this very list to decide whether it may report at
 * all, so the address stays. What goes is the 4-octet round-trip time this entry also carries when
 * embedded, and the whole RRTI IE that would need it before it exists (§10.29.6.6). */
export const RMI_FINAL_DEFERRED_ENTRY_BYTES = 2
/** RMI IE in a measurement report: header + control 1 + address 2 + reply time 4 + round-trip time 4. */
export const RMI_REPORT_IE_BYTES = UWB_IE_HDR_BYTES + 11

/** The Poll's RDM IE: one entry per anchor, 3 + 3N octets. */
export function rdmIeBytes(anchors: number): number {
  return RDM_IE_FIXED_BYTES + RDM_ENTRY_BYTES * anchors
}

/** The Final's RMI IE when embedded: one entry per responder, 3 + 6N octets. */
export function rmiFinalIeBytes(anchors: number): number {
  return RMI_FINAL_FIXED_BYTES + RMI_FINAL_ENTRY_BYTES * anchors
}

/** The Final's RMI IE when deferred: the same fixed part, an address-only entry per responder,
 * 3 + 2N octets. */
export function rmiFinalDeferredIeBytes(anchors: number): number {
  return RMI_FINAL_FIXED_BYTES + RMI_FINAL_DEFERRED_ENTRY_BYTES * anchors
}

/** MHR + ARC IE + RDM IE (3 + 3N) + RRMC IE + FCS = 27 + 3N (time-scheduled); a contention round's
 * Poll lists no per-anchor schedule (any anchor may answer), so RDM is replaced by the fixed-size
 * RCPS + RCMA IEs: MHR + ARC + RCPS (4) + RCMA (3) + RRMC + FCS = 31, independent of anchor count. */
export function uwbPollBytes(anchors: number, schedule: 'time' | 'contention' = 'time'): number {
  if (schedule === 'contention') {
    return UWB_MHR_BYTES + ARC_IE_BYTES + RCPS_IE_BYTES + RCMA_IE_BYTES + RRMC_IE_BYTES + UWB_FCS_BYTES
  }
  return UWB_MHR_BYTES + ARC_IE_BYTES + rdmIeBytes(anchors) + RRMC_IE_BYTES + UWB_FCS_BYTES
}

/** MHR + RRMC IE + FCS, plus the RRTI IE that carries the reply time — only when SS-TWR embeds
 * it in this very frame: 20 (SS embedded) / 14 (SS deferred or fixed, DS always). DS-TWR never
 * carries a reply time here at all: its Final does, or its report does (design §5). */
export function uwbRespBytes(method: 'ss' | 'ds', replyTime: UwbReplyTime = 'embedded'): number {
  const carriesRrti = method === 'ss' && replyTime === 'embedded'
  return UWB_MHR_BYTES + RRMC_IE_BYTES + (carriesRrti ? RRTI_IE_BYTES : 0) + UWB_FCS_BYTES
}

/** MHR + RMI IE + FCS: embedded is 3 + 6N per-anchor (address + round trip) plus N × RRTI IE 6
 * for treply2 = 14 + 12N; deferred drops both the round trip and the RRTI IEs and keeps only the
 * address list = 14 + 2N (ruling of design §5 — the deferred Final is not empty, see
 * `RMI_FINAL_DEFERRED_ENTRY_BYTES`). */
export function uwbFinalBytes(anchors: number, replyTime: UwbReplyTime = 'embedded'): number {
  if (replyTime === 'deferred') {
    return UWB_MHR_BYTES + rmiFinalDeferredIeBytes(anchors) + UWB_FCS_BYTES
  }
  return UWB_MHR_BYTES + rmiFinalIeBytes(anchors) + anchors * RRTI_IE_BYTES + UWB_FCS_BYTES
}

/** MHR + the report's RMI IE 13 + FCS. */
export const UWB_REPORT_BYTES = UWB_MHR_BYTES + RMI_REPORT_IE_BYTES + UWB_FCS_BYTES

/** The deferred reply-time message of SS-TWR (standard §10.29.6.3): an anchor whose Response
 * could not embed `Treply` — it did not know its own future send time — follows up, once it has
 * read that send timestamp back, with a frame carrying nothing else. MHR + RRTI IE + FCS = 17
 * octets (`makeSsDefer` in frames.ts). */
export const UWB_SS_DEFER_BYTES = UWB_MHR_BYTES + RRTI_IE_BYTES + UWB_FCS_BYTES

// --- RCM validity window, and the non-receipt exchange it makes possible ---------------
// standard §10.32.9.1 (ARC IE, "RCM Validity Rounds") and §10.34 (ranging message non-receipt).
// design docs/superpowers/specs/2026-10-01-rcm-validity-design.md

/** The initiation-only message a later round of a valid RCM carries (design §2): no ARC, no RDM —
 * the responder's slot table is still the one the still-valid RCM gave it (design §2.1), so this
 * message does not restate it (Ruling 3 of task 1: inventing a schedule field here would delete
 * the feature's entire saving). MHR + RRMC IE + FCS = 14 octets, independent of the anchor count.
 *
 * No anchor-count parameter at all (fix round 1): a function that does not take the argument
 * cannot depend on it, so independence from the anchor count is enforced by the type checker
 * rather than pinned by a test that has to go looking for it. Against the Poll's 27 + 3A
 * (`uwbPollBytes`), each round after the first saves 13 + 3A octets: exactly the ARC and RDM IEs
 * that bought the validity window. model */
export function uwbInitBytes(): number {
  return UWB_MHR_BYTES + RRMC_IE_BYTES + UWB_FCS_BYTES
}

/** RMNR IE (§10.34.2.1): "This IE is formatted without any Content field" — so its whole width is
 * the two-octet element header every IE in this file carries, and nothing more. standard §10.34.2.1 */
export const RMNR_IE_BYTES = UWB_IE_HDR_BYTES

/** The ranging message non-receipt frame (standard §10.34): a responder that holds a valid RCM but
 * missed this round's initiation message sends this instead of sitting silent in its slot.
 * MHR + RMNR IE + FCS = 13 octets. A zero-content IE is not an empty message (design §3): showing
 * up at all, in this responder's own slot, says both "I still hold the RCM" and "I did not hear
 * this round's initiation message" — nothing about either claim rides in the payload. */
export function uwbRmnrBytes(): number {
  return UWB_MHR_BYTES + RMNR_IE_BYTES + UWB_FCS_BYTES
}

// --- One-way ranging (TDoA) message content -------------------------------------

// Every ranging time below is 4 octets, exactly as the RRTI IE sizes one, and every IE
// carries this file's 2-octet element header (ID + length) like all the others — so a
// "+4 octet TX time" costs the frame 6 octets, not 4. The frames below are written as the
// sum of those constants, and uwb/frameFields.ts decodes one row per IE at the same widths.

/** Blink IE (model, §10.29.8-style): header + one octet of blink content (the tag's blink
 * sequence). The blink carries no times at all — the anchors take them on arrival. */
export const BLINK_IE_BYTES = UWB_IE_HDR_BYTES + 1
/** UL-TDoA blink: MHR 9 + blink IE 3 + FCS 2 = 14 octets (model). */
export const UWB_BLINK_BYTES = UWB_MHR_BYTES + BLINK_IE_BYTES + UWB_FCS_BYTES

/** TX-time IE (model; the RMI-style content of §10.29.8.4): header + the sender's own TX
 * counter, one 4-octet ranging time. Shared by DL-TDoA and many-to-many ranging (standard
 * §10.32.6/§10.32.7) — both put "my own transmit time" on the air the same way — which is why
 * this carries no `DL_` prefix: that prefix would be false on the many-to-many frame, which is
 * not one-way at all (`uwbM2mBytes` below). Renamed from `DL_TX_TIME_IE_BYTES`; DL-TDoA's own
 * callers (`dlExtraBytes` and its three frame-size functions) are unchanged in every other way. */
export const TX_TIME_IE_BYTES = UWB_IE_HDR_BYTES + 4
/** RX-times IE (model): header + one 4-octet RX counter per time carried. The times are listed
 * in the round's slot order, so no address rides along with them: a DL-TDoA message reads that
 * order from the Poll's RDM IE, and a many-to-many one from the round's own slot assignment
 * (design §5). Shared with `TX_TIME_IE_BYTES` for the same reason; renamed from
 * `dlRxTimesIeBytes`. Every caller of this file omits the whole IE, header included, when it
 * carries no times at all (see `dlExtraBytes`, used by both DL-TDoA and many-to-many below) — a
 * real frame does not spend two octets announcing an IE with nothing in it. */
export function rxTimesIeBytes(times: number): number {
  return UWB_IE_HDR_BYTES + 4 * times
}
/** DL-TDoA clock-offset IE (model): header + a 16-bit carrier frequency offset, the responder's
 * clock offset to anchor 0 that puts its reply time on anchor 0's timebase. Many-to-many carries
 * no such IE at all: the clock offset is measured on receive, not sent (design §4, consistent
 * with the existing SS-TWR path, whose `coffs` comes from `UwbRxInfo` rather than from a frame). */
export const DL_COFFS_IE_BYTES = UWB_IE_HDR_BYTES + 2

/** The ranging-time content a message adds to its two-way-ranging shape: the sender's TX time,
 * the RX times it holds (none on a DL-TDoA Poll, which opens the round; none on many-to-many's
 * opening participant, for the same reason) and, on a DL-TDoA Response, its clock offset. One
 * definition, used by DL-TDoA's three frame-size functions below and by many-to-many's
 * `uwbM2mBytes`, so no two of them can size the same "own TX time + RX times" content
 * differently. */
export function dlExtraBytes(rxTimes: number, coffs: boolean): number {
  return TX_TIME_IE_BYTES + (rxTimes > 0 ? rxTimesIeBytes(rxTimes) : 0) + (coffs ? DL_COFFS_IE_BYTES : 0)
}

// The three functions below are each frame's one definition: uwb/frames.ts builds at these sizes
// and the schema's slot rule measures them, so a DL message cannot grow in one place only. The
// content arguments default to the canonical round's — the Poll opens it with no RX times, the
// Response answers with one and its clock offset, the Final lists one RX time per responder —
// and the builders pass what their own `dl` payload actually holds.

/** DL-TDoA Poll (anchor 0): the time-scheduled Poll over the `responders` (anchors 1…N−1)
 * plus anchor 0's own TX time. 27 + 3R + 6 octets. */
export function uwbDlPollBytes(responders: number, rxTimes = 0, coffs = false): number {
  return uwbPollBytes(responders) + dlExtraBytes(rxTimes, coffs)
}

/** DL-TDoA Response (anchor i): the DS-TWR Response (no RRTI) plus the responder's TX time, its
 * RX time of the Poll and its clock offset. 14 + 6 + 6 + 4 = 30 octets. */
export function uwbDlRespBytes(rxTimes = 1, coffs = true): number {
  return uwbRespBytes('ds') + dlExtraBytes(rxTimes, coffs)
}

/** DL-TDoA Final (anchor 0): MHR + RRMC + anchor 0's TX time + its RX time of each response +
 * FCS. It carries no two-way times — a listening tag needs the instants, not the round trips —
 * so it does not grow the way the TWR Final does: 22 + 4R octets. */
export function uwbDlFinalBytes(responders: number, coffs = false): number {
  return UWB_MHR_BYTES + RRMC_IE_BYTES + UWB_FCS_BYTES + dlExtraBytes(responders, coffs)
}

// --- Many-to-many ranging (standard §10.32.6 SS / §10.32.7 DS) ------------------

/**
 * Participant i's one transmission in a many-to-many round: MHR + RRMC + its own TX time + the
 * RX times it holds for every participant that transmitted before it + FCS. The content is the
 * DL-TDoA Final's shape exactly — own TX time plus RX times, no clock offset (design §4) — so
 * this calls the very function DL-TDoA's Final does (`dlExtraBytes(rxTimes, false)`) rather than
 * writing a second copy of "how many octets does N arrival times cost": at `rxTimes = 0` that
 * function omits the RX-times IE outright, the same way a DL-TDoA Poll does, and `rxTimes = 0` is
 * not an edge case here — it is every many-to-many round's very first participant. 20 octets at
 * `rxTimes = 0`; 22 + 4·`rxTimes` from `rxTimes = 1` on. model
 */
export function uwbM2mBytes(rxTimes: number): number {
  return UWB_MHR_BYTES + RRMC_IE_BYTES + UWB_FCS_BYTES + dlExtraBytes(rxTimes, false)
}

/** The many-to-many frame shape one method's round actually sends, method by method. Both are
 * `uwbM2mBytes` today: DS-TWR's second pass (design §3) sends a frame of this very same shape a
 * second time — its own second transmit time plus the arrival times heard in that second pass —
 * not a running tally of both passes at once, so its longest frame never outgrows SS's. Kept as
 * its own function, rather than folded into `uwbMaxParticipants` below, so the day a control IE
 * rides only one method's round, that asymmetry has one place to land. */
function m2mFrameBytes(method: 'ss' | 'ds', rxTimes: number): number {
  return method === 'ss' ? uwbM2mBytes(rxTimes) : uwbM2mBytes(rxTimes)
}

/**
 * Participants one many-to-many round can carry: the largest N whose last participant — the one
 * that reports N−1 arrival times, and so sends the round's longest frame (design §4) — still fits
 * the 127-octet PSDU (standard §16.2.7). Searched against `m2mFrameBytes`, exactly as
 * `uwbMaxAnchors` searches `uwbLongestFrameBytes` for the two-way round it caps: no literal cap
 * here either, and the same `UWB_ANCHOR_SEARCH_CEILING` loop bound, for the same reason (nothing
 * about this frame's own arithmetic stops the search on its own if the ceiling were left out).
 */
export function uwbMaxParticipants(method: 'ss' | 'ds'): number {
  let cap = 0
  for (let n = 1; n <= UWB_ANCHOR_SEARCH_CEILING; n++) {
    if (m2mFrameBytes(method, n - 1) > UWB_MAX_PSDU_BYTES) break
    cap = n
  }
  return cap
}

// --- Multiple-message receipt confirmation (standard §10.36) -------------------

/**
 * RMMRC IE (§10.36.2.1), fixed part: header + one flags octet (bit 0 Address Present, bit 1
 * Address Size, bits 2-7 reserved) + one MMRC List Length octet. Neither flag bit ever varies
 * with content in this engine — see `RMMRC_ADDR_BYTES` — so the fixed part never grows.
 */
export const RMMRC_FIXED_BYTES = UWB_IE_HDR_BYTES + 2

/**
 * The address width every MMRC list entry carries. The standard's Address Size bit allows two
 * sizes; this engine always builds the shorter one, the same 2-octet short address every other
 * IE in this file addresses with, and never the long form. model
 */
export const RMMRC_ADDR_BYTES = 2

/**
 * Width, in octets, of one initiator's receipt bitmap: one bit per opener the current RCM
 * validity window carries (design §3.3), rounded up to a whole octet. The window is the one
 * `uwb/session.ts#blockCarriesRcm` already has both ends agreeing on, so covering exactly it
 * needs no new negotiation — a model choice, not a standard-mandated width. model
 */
export function rmmrcBitmapBytes(windowRounds: number): number {
  return Math.ceil(windowRounds / 8)
}

/** One MMRC list entry: the initiator's address plus its receipt bitmap. */
export function rmmrcEntryBytes(windowRounds: number): number {
  return RMMRC_ADDR_BYTES + rmmrcBitmapBytes(windowRounds)
}

/** The RMMRC IE's own width: the fixed part plus one entry per initiator the MMRCM lists. */
export function rmmrcIeBytes(initiators: number, windowRounds: number): number {
  return RMMRC_FIXED_BYTES + initiators * rmmrcEntryBytes(windowRounds)
}

/**
 * The MMRCM frame (standard §10.36, Figure 10-272 "Many-to-Many Messages"): MHR + RMMRC IE +
 * FCS. At a window of eight rounds or fewer the bitmap is one octet, so each initiator costs 3
 * octets and the whole frame is 15 + 3N (design §3.3); past eight rounds the bitmap — and so
 * every entry — widens by one octet each time the window crosses another multiple of 8.
 */
export function uwbMmrcmBytes(initiators: number, windowRounds: number): number {
  return UWB_MHR_BYTES + rmmrcIeBytes(initiators, windowRounds) + UWB_FCS_BYTES
}

/**
 * Initiators one MMRCM frame can list: the largest N whose frame still fits the 127-octet PSDU
 * (standard §16.2.7). Searched against `uwbMmrcmBytes`, exactly as `uwbMaxAnchors` and
 * `uwbMaxParticipants` search their own frame-size functions above — no literal cap here either,
 * and the same `UWB_ANCHOR_SEARCH_CEILING` loop bound, for the same reason (nothing about this
 * frame's own arithmetic stops the search on its own if the ceiling were left out).
 */
export function uwbMaxMmrcmInitiators(windowRounds: number): number {
  let cap = 0
  for (let n = 1; n <= UWB_ANCHOR_SEARCH_CEILING; n++) {
    if (uwbMmrcmBytes(n, windowRounds) > UWB_MAX_PSDU_BYTES) break
    cap = n
  }
  return cap
}

// --- Ranging schedule units ----------------------------------------------------

/** Ranging slot/block time units to nanoseconds: 1 RSTU = 416 chips at 499.2 Mchip/s
 * (standard §10.29.1.5, Table 10-145). Lives here, with the chip, so that the scenario
 * schema and the session scheduler measure a slot with one and the same function. */
export function rstuNs(rstu: number): Ns {
  return Math.round((rstu * RSTU_CHIPS * 1000) / 499.2)
}

/** A train shape plus the one session switch that decides how many responders a round holds.
 * `UwbMmsCfg` satisfies it; a bare `MmsPhy` does too, and reads as pairwise. */
export type MmsRoundShape = MmsPhy & { oneToMany?: boolean }

/** How many responders one MMS round holds: every anchor of the session in a one-to-many round
 * (4ab draft 15-22/0381r5 Table 1.6.3.1, POLL 0x10 `Number of Responders`), and one — the pair's
 * own anchor — otherwise. A session with no anchor at all still lays out a one-responder round:
 * the schema refuses that scenario, and a zero-responder layout has no slots to refuse it in. */
export function mmsResponders(mms: MmsRoundShape, anchors: number): number {
  return mms.oneToMany ? Math.max(1, anchors) : 1
}

/** Ranging slots one tag needs per round: poll + one response each (SS), plus final + one
 * report each (DS); a contention round (schedule mode 0, standard §10.32.2) instead reserves
 * poll + a fixed response-phase window of `contentionSlots` slots any anchor may answer in
 * (`contentionSlots` 8 is a model default, the RCPS IE's response-phase window). The schema's
 * block-fit rule and `roundPlan` share this one definition.
 *
 * `replyTime` only changes the SS branch, and only for `'deferred'`: embedded and fixed both stay
 * at `A + 1` (the reply time either rides the Response or never goes on the air at all), but a
 * deferred round adds one slot per anchor for the follow-up message that carries the reply time
 * on its own (standard §10.29.6.3) — `2A + 1` in total. DS-TWR's slot count never moves: deferred
 * there only relocates the Final's payload into the reports that already have a slot each (design
 * §4). A time-scheduled DS round with no reply-time carried at all (contention, or a mode this
 * function returns early for) never reaches the `replyTime` check, so `replyTime` is meaningless
 * to it and its default of `'embedded'` is never asked to mean anything.
 *
 * One-way ranging counts its slots differently, because the tag is not what the round is built
 * around: a DL-TDoA round is the anchors' own (Poll + N−1 Responses + Final = N + 1 slots) and
 * every tag in the scenario listens to that same round, while a UL-TDoA round is one blink slot
 * and belongs to one tag. An MMS round is pairwise by default — one tag and one anchor — and its
 * length is the train's, not the anchor count's: `mmsLayout` counts its slots, so a tag needs
 * that many per anchor (4ab draft 15-22/0381r5 §1.1). A one-to-many MMS round instead holds
 * every anchor at once, and grows by a slot per responder per millisecond and by a narrowband
 * window per responder at each end — `mmsResponders` is the one place that count is decided.
 *
 * A many-to-many round (`mode: 'm2m'`, standard §10.32.6 SS / §10.32.7 DS, design §3) has no tag
 * at all — every participant transmits once per pass — so its slot count is the plainest formula
 * here: N slots for SS (one transmission per participant answers everyone), 2N for DS (a second
 * pass, because `tround2`/`treply2` need the earlier participant to transmit again). `anchors` is
 * read as the participant count N in this branch, the same way it is read as the anchor count in
 * DL-TDoA's `anchors + 1` two lines below — one parameter, meaning whatever the mode's own "how
 * many others" count is.
 *
 * Ruling 4 of docs/superpowers/specs/2026-09-30-many-to-many-design.md: this function's own name
 * predates `'m2m'` and is false for it — there is no tag to count slots "per" — but 38 call sites
 * read `uwbSlotsPerTag`, and renaming it here would mix a mechanical sweep into this slice's
 * behavioural change. The rename is its own commit, later, when nothing else is moving; until
 * then, read "per tag" as "per round" for every mode this function already treats that way
 * (DL-TDoA's `anchors + 1`, a contention round's `1 + contentionSlots`) and now for `'m2m'` too. */
/**
 * MMRCM slots a window-closing block adds (standard §10.36, design §3.3): **one per responder**,
 * because a responder is what sends one.
 *
 * It lives here rather than in `session.ts` for the reason this file's own header gives: the
 * scenario schema reads `phy.ts` and cannot read `session.ts` without an import cycle, and the
 * schema's block-fit rule has to budget these slots. One definition both sides read — the lesson
 * slice 3 wrote down as a ruling after the m2m slot count ended up copied into the schema and the
 * two copies could drift.
 *
 * `peers` is the anchor count in a two-way round and the participant count in `'m2m'`; the caller
 * passes whichever its own mode means, because this function cannot see a plan.
 *
 * **Why per responder, when the IE counts initiators.** §10.36 has two counts and they belong to
 * different things: the IE carries one list entry per *initiator*, since one responder may have
 * heard several, while the slots are one per *responder*, since each responder sends its own frame.
 * The first draft of this feature said "one slot per initiator" in both places, which gave a
 * two-way round a single slot for all N anchors to answer from. In `'m2m'` the two counts coincide,
 * which is why the error was invisible in the mode this clause was reasoned about.
 */
export function uwbMmrcmSlots(mode: UwbMode, peers: number, mmrcr: boolean): number {
  if (!mmrcr) return 0
  // Refused outright for dl-tdoa, ul-tdoa and mms in the schema, so those never reach here with
  // `mmrcr` on; answering 0 rather than throwing keeps this usable from a caller that has not
  // checked the mode yet.
  if (mode !== 'twr' && mode !== 'm2m') return 0
  return peers
}

export function uwbSlotsPerTag(
  method: 'ss' | 'ds', anchors: number, schedule: 'time' | 'contention' = 'time', contentionSlots = 8,
  mode: UwbMode = 'twr', mms?: MmsRoundShape, slotsPerMs = MMS_SLOTS_PER_MS, replyTime: UwbReplyTime = 'embedded',
): number {
  if (mode === 'mms') {
    if (!mms) throw new Error("uwbSlotsPerTag: mode 'mms' needs the session's MMS parameters")
    // `slotsPerMs` has to be the session's own (`mmsSlotsPerMs`), not the draft-default 2: a
    // non-interleaved ranging phase is that many slots per millisecond of train, so a caller that
    // left it at the default would size the round for a slot the session does not use, and the
    // round `roundPlan` then lays out would run past the length the block was checked against.
    return mmsLayout(mms, mmsResponders(mms, anchors), slotsPerMs).slots
  }
  if (mode === 'm2m') return method === 'ss' ? anchors : 2 * anchors
  if (mode === 'ul-tdoa') return 1
  if (mode === 'dl-tdoa') return anchors + 1
  if (schedule === 'contention') return 1 + contentionSlots
  if (method === 'ss') return replyTime === 'deferred' ? 2 * anchors + 1 : anchors + 1
  return 2 * anchors + 2
}

/** Guard between the end of a slot's PPDU and the slot boundary: 200 ns is 60 m of flight (model). */
export const UWB_SLOT_GUARD_NS = 200

/** The round's longest frame, in octets: in a time-scheduled two-way round, the larger of the
 * Poll (which lists every anchor, 27 + 3N) and whichever frame the method and reply-time carry
 * their times in; the Poll or the SS Response in a contention round (which has no Final at all);
 * the longer of the Poll and the Final in DL-TDoA (the Poll's RDM IE grows by 3 per responder,
 * the Final's RX times by 4); and the blink — the only frame there is — in UL-TDoA.
 *
 * `method` and `replyTime` only matter to the time-scheduled two-way branch: SS-TWR has no Final
 * at all, so its longest frame is the Poll (or, embedded, its own Response, which never catches
 * the Poll); DS-TWR's embedded Final overtakes the Poll a few anchors in, but a deferred Final is
 * an address list (14 + 2N, design §5) that never does, so DS-deferred is Poll-bound too — the
 * same bug the pre-Ruling-3 constant had for every SS round, now fixed by asking rather than
 * assuming a Final exists.
 *
 * An MMS round has no such frame: its ranging phase carries fragments, which are sequences and
 * not PSDUs at all, and its control and report phases are narrowband messages sized in `nb.ts`.
 * Asking this function is a mistake, so it says so rather than returning a number that means
 * nothing — `uwbSlotFitNs` and `uwbNbSlotFitNs` measure an MMS slot instead. */
export function uwbLongestFrameBytes(
  anchors: number, mode: UwbMode = 'twr', schedule: 'time' | 'contention' = 'time',
  method: 'ss' | 'ds' = 'ds', replyTime: UwbReplyTime = 'embedded',
): number {
  if (mode === 'mms') {
    throw new Error('uwbLongestFrameBytes: an MMS round carries fragments and narrowband messages, not PSDUs')
  }
  if (mode === 'ul-tdoa') return UWB_BLINK_BYTES
  if (mode === 'dl-tdoa') {
    return Math.max(uwbDlPollBytes(anchors - 1), uwbDlRespBytes(), uwbDlFinalBytes(anchors - 1))
  }
  // A contention round is SS-TWR and ends at the Response: there is no Final to size it by, and
  // the Poll carries RCPS + RCMA instead of the anchor list, so it is 31 octets whatever the
  // anchor count. At one anchor that Poll is longer than the Final the round never sends.
  // Unlike the time-scheduled SS branch below, this one takes no `UWB_SS_DEFER_BYTES` term: it is
  // numerically inert (the 31-octet Poll always beats the 17-octet deferred message) and the
  // combination cannot legally occur besides — a contention responder draws its slot, and the
  // deferred message has no fixed slot of its own to answer in, so `contention` + `deferred` is
  // refused by the schema (design §3.1).
  if (schedule === 'contention') return Math.max(uwbPollBytes(anchors, 'contention'), uwbRespBytes('ss', replyTime))
  const pollBytes = uwbPollBytes(anchors)
  if (method === 'ss') {
    // No Final exists: the round ends at the Responses (and, deferred, the follow-up messages),
    // none of which grow with the anchor count — the Poll, which does, is what binds it.
    return Math.max(pollBytes, uwbRespBytes('ss', replyTime), replyTime === 'deferred' ? UWB_SS_DEFER_BYTES : 0)
  }
  return Math.max(pollBytes, uwbFinalBytes(anchors, replyTime))
}

/**
 * Anchors one ranging round can carry: the largest count whose longest frame (above) still fits
 * the 127-octet PSDU (standard §16.2.7). Searched, not written down — a round's longest frame
 * depends on the mode, the method and the reply-time shape, so no single number is "the" cap
 * (Ruling 3 of `docs/superpowers/specs/2026-09-29-reply-time-design.md` §5: the pre-existing
 * `UWB_MAX_ANCHORS = 9` was the embedded DS-TWR Final's own number, wrongly applied to every
 * shape — including SS-TWR, whose round has no Final to overrun at all).
 *
 * Two shapes have no frame that grows with the anchor count at all, so the search cannot
 * terminate on its own in either of them: UL-TDoA's only frame, the 14-octet blink
 * (`uwbLongestFrameBytes` always returns `UWB_BLINK_BYTES` for it), and a contention round's Poll
 * and Response, both fixed size (RCPS + RCMA stand in for the anchor list). Fix round 1 caught
 * that the first version of this function gave the two cases different answers by accident —
 * UL-TDoA got a chosen ceiling, contention fell through to `UWB_MAX_PSDU_BYTES` used as the loop
 * bound, which is a byte count standing in for an anchor count and returned 127 anchors with a
 * straight face. Both are the same situation and get the same answer: neither the PSDU nor
 * `uwbSlotsPerTag` (which gives UL-TDoA one slot, and a contention round `1 + contentionSlots`,
 * regardless of anchor count) bounds them, so the search is given a ceiling instead of a law
 * (`UWB_ANCHOR_SEARCH_CEILING`). What actually bounds each of them lives elsewhere: a contention
 * round's real limit is collision probability against `contentionSlots`, not a frame length; a
 * UL-TDoA round's is the block-fit rule (`src/model/scenario.ts`, which caps how many *tags* a
 * block holds); and DL-TDoA — which does not need the ceiling at all — bounds its own anchor
 * count structurally, one slot per anchor (`uwbSlotsPerTag`'s `anchors + 1`), before the PSDU
 * even gets a say.
 */
export function uwbMaxAnchors(
  mode: UwbMode, method: 'ss' | 'ds', replyTime: UwbReplyTime, schedule: 'time' | 'contention' = 'time',
): number {
  let cap = 0
  for (let a = 1; a <= UWB_ANCHOR_SEARCH_CEILING; a++) {
    if (uwbLongestFrameBytes(a, mode, schedule, method, replyTime) > UWB_MAX_PSDU_BYTES) break
    cap = a
  }
  return cap
}

/**
 * The ceiling `uwbMaxAnchors` searches up to, for every mode: for UL-TDoA and a contention round
 * this is the answer it returns outright (see `uwbMaxAnchors`), since nothing about either one's
 * frame or slot cost ever stops the search on its own; for every other shape it is just a loop
 * bound the real cap (9…33 for two-way, 27 for DL-TDoA — none of them close) is found well inside
 * of, since every frame that does grow with the anchor count grows by at least 1 octet/anchor and
 * so cannot cross the 127-octet PSDU past this many anchors either. Chosen, not derived: large
 * enough that no scenario this simulator's editor, tests or course corpus ever configures comes
 * close to it — the largest anchor count anywhere in this repository is nine, an order of
 * magnitude below — and small enough that a 64-iteration search costs nothing. model
 */
export const UWB_ANCHOR_SEARCH_CEILING = 64

/**
 * The shortest ranging slot a round with N anchors fits in: the round's longest PPDU plus the
 * flight guard. In a shorter slot the receiver's deadline fires before the frame lands, and the
 * round loses every anchor to UWB_TIMEOUT with nothing to say why.
 *
 * In MMS it is the longest fragment of the train plus the same guard: a 256-unit RIF is 262.6 µs
 * and does not fit the 250 µs a 300 RSTU slot gives it.
 *
 * `method` and `replyTime` are the round's own, for the same reason `uwbMaxAnchors` takes them
 * (design §5, Ruling 3): **which frame is the longest one moves with the shape.** Without them
 * this function sized every two-way slot for the embedded DS-TWR Final, which at nine anchors is
 * 122 octets — where an SS-TWR round's longest frame is the 54-octet Poll, and the Final it was
 * being measured against does not exist in that round at all. That was the identical inaccuracy
 * design §5 caught in the old `UWB_MAX_ANCHORS = 9`, in a second function; fixing one and leaving
 * its twin is the inconsistency, not the fix.
 *
 * Both default to the embedded DS-TWR round, which is the largest of the shapes and so exactly
 * what this function answered before they existed: a caller that passes neither gets the number it
 * always got, conservatively rather than silently differently.
 */
export function uwbSlotFitNs(
  anchors: number, mode: UwbMode = 'twr', schedule: 'time' | 'contention' = 'time', mms?: MmsRoundShape,
  method: 'ss' | 'ds' = 'ds', replyTime: UwbReplyTime = 'embedded',
): Ns {
  if (mode === 'mms') {
    if (!mms) throw new Error("uwbSlotFitNs: mode 'mms' needs the session's MMS parameters")
    return mmsLongestFragmentNs(mms) + UWB_SLOT_GUARD_NS
  }
  return uwbPpduNs(uwbLongestFrameBytes(anchors, mode, schedule, method, replyTime)) + UWB_SLOT_GUARD_NS
}

/**
 * The shortest ranging slot a many-to-many round of `participants` fits in: its longest frame —
 * the last participant's, which reports every earlier one's arrival time (design §4) — plus the
 * same flight guard every other mode's slot pays. In a shorter slot the receivers' deadlines fire
 * before that frame lands and the round loses its last slot entirely.
 *
 * It is `uwbSlotFitNs`'s job for this mode, in a function of its own rather than a branch inside
 * it, because `uwbLongestFrameBytes` has no many-to-many case: the cap and the slot rule here are
 * both sized off `uwbM2mBytes` directly (design §5), never off the two-way frame chooser. And it
 * is a function rather than an expression at each caller because it has **two** callers — the
 * scenario schema, which refuses such a scenario, and `UwbNetwork`, which refuses such a round in
 * the nanoseconds the scheduler actually runs in — and two copies of one rule is the drift Ruling 7
 * of this slice's ledger was written about.
 */
export function uwbM2mSlotFitNs(participants: number): Ns {
  return uwbPpduNs(uwbM2mBytes(Math.max(0, participants - 1))) + UWB_SLOT_GUARD_NS
}

/** The room an MMS round's longest narrowband message needs. They are far longer than any
 * fragment — 608 µs against 82 µs — and the draft gives each of them two slots (RcpPollSlot,
 * RcpResponseSlot, MrpFirstSlot, MrpSecondSlot are all 2), so this is what two slots together
 * have to hold. 4ab draft 15-22/0381r5 §1.1 */
export function uwbNbSlotFitNs(mms?: MmsRoundShape, responders = 1): Ns {
  // A one-to-many POLL names its responders — two content octets plus three per address — and
  // overtakes the REPORT as the round's longest narrowband message from four responders up. It is
  // the *mode* that decides whether that POLL is sent, never the responder count: a one-to-many
  // round with a single anchor still broadcasts a one-to-many POLL, and measuring that round
  // against the REPORT would let a 17-octet message outlive the window this guard defends.
  const octets = Math.max(NB_REPORT_BYTES, mms?.oneToMany ? nbOtmPollBytes(responders) : 0)
  return nbPpduNs(octets) + UWB_SLOT_GUARD_NS
}

// --- Figure of Merit -----------------------------------------------------------

export const FOM_LOS = 0x16 // model: 97 % within 1 ns × 0.5
export const FOM_NLOS = 0x7b // model: 75 % within 3 ns × 4.0

const FOM_LEVEL_PCT = [0, 20, 55, 75, 85, 92, 97, 99] // standard Table 10-146
const FOM_INTERVAL_NS = [0.1, 0.3, 1, 3] // standard Table 10-147
const FOM_SCALE = [0.5, 1, 2, 4] // standard Table 10-148

export function fomDecode(fom: number): { levelPct: number; intervalNs: number } {
  const level = fom & 0x7
  const interval = (fom >> 3) & 0x3
  const scale = (fom >> 5) & 0x3
  return { levelPct: FOM_LEVEL_PCT[level], intervalNs: FOM_INTERVAL_NS[interval] * FOM_SCALE[scale] }
}

export function fomText(fom: number): string {
  // An all-zero FoM byte is the standard's "not available" (standard §10.29.1.7),
  // not a claim that 0 % of the error lies within 0.05 ns.
  if (fom === 0) return 'no FoM'
  const { levelPct, intervalNs } = fomDecode(fom)
  return `${levelPct} % within ${intervalNs} ns`
}
