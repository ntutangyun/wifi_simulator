import type { Material, UwbMode } from '../model/scenario'
import type { Ns } from '../model/types'
import { mmsLayout, mmsLongestFragmentNs, MMS_SLOTS_PER_MS, NB_WINDOW_SLOTS, type MmsPhy } from './mms'
import { NB_LBT_CCA_US, NB_REPORT_BYTES, nbOtmPollBytes, nbPpduNs } from './nb'
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
/**
 * Symbols sent at the PHR symbol rate (standard Table 16-2/16-3, "21 symbols of PHY header at the PHR
 * symbol rate"): the 19 PHR bits H0–H18 plus two more — with Viterbi rate 0.5 the PSDU's first two
 * bits D0, D1 (symbols 19–20). Until 2026-11-10 this was 19 and those two bits were counted at the
 * data rate, which made every PPDU 2 × (512 − 64) = 896 chips (about 1.8 µs) short (audit #7).
 */
export const PHR_SYMBOLS = 21
/** The PHR's own bits, H0–H18 (standard §16.2.7.1). */
export const PHR_BITS = 19
/** PSDU bits that ride the PHR-rate symbols 19–20 (standard Table 16-2: D0, D1). */
export const PSDU_BITS_AT_PHR_RATE = PHR_SYMBOLS - PHR_BITS
export const PHR_SYMBOL_CHIPS = 512 // standard Table 16-4/16-14 (850 kb/s nominal)
export const DATA_SYMBOL_CHIPS = 64 // standard Table 16-4 (6.8 Mb/s)
export const RS_PARITY_BITS = 48 // standard §16.3.3.2
export const RS_BLOCK_BITS = 330 // standard §16.3.3.2 (55 × 6)
export const TAIL_SYMBOLS = 2 // standard Table 16-2

export const UWB_SHR_CHIPS = (SYNC_SYMBOLS + SFD_SYMBOLS) * PSYM_CHIPS // 36 576
export const UWB_RMARKER_CHIPS = UWB_SHR_CHIPS // standard §10.29.1.1: first chip after the SFD
export const UWB_RMARKER_NS = UWB_RMARKER_CHIPS * UWB_CHIP_NS // 73 269.23 ns, exact (float)
export const UWB_STS_CHIPS = STS_GAP_CHIPS + STS_ACTIVE_CHIPS + STS_GAP_CHIPS // 33 792
export const UWB_PHR_CHIPS = PHR_SYMBOLS * PHR_SYMBOL_CHIPS // 10 752

/**
 * An SP3 packet (standard §10.32.8.2): SYNC + SFD + STS and nothing else — no PHR, no PSDU. It is
 * the physically shortest ranging frame the standard has, and precisely because it has no PSDU it
 * cannot carry a timestamp: the time this marker measures has to come back later, in a data report
 * phase (design §2, `docs/superpowers/specs/2026-10-02-sp3-design.md`) — the same deferred
 * reply-time path `uwbRespBytes`/`UWB_SS_DEFER_BYTES` already built for SS-TWR (standard §10.29.6.3).
 * standard §10.32.8.2
 */
export function uwbSp3Chips(): number {
  return UWB_SHR_CHIPS + UWB_STS_CHIPS
}

/** `uwbSp3Chips()` in nanoseconds — about 141 µs, against the ~181 µs of the shortest SP1 frame. */
export function uwbSp3Ns(): Ns {
  return chipsToNs(uwbSp3Chips())
}

/** PSDU symbols sent at the **data** rate: 8·octets data bits plus 48 parity bits per RS(63,55)
 * block (each block covers up to 330 data bits), less the two bits D0, D1 that already went out at
 * the PHR rate (`PSDU_BITS_AT_PHR_RATE`), plus the 2-symbol tail T0, T1. Table 16-2 numbers these
 * symbols 21 … N + 20: N symbols for N coded bits. standard §16.3.3.2, Table 16-2 */
export function psduSymbols(octets: number): number {
  const dataBits = 8 * octets
  const blocks = Math.ceil(dataBits / RS_BLOCK_BITS)
  return dataBits + RS_PARITY_BITS * blocks - PSDU_BITS_AT_PHR_RATE + TAIL_SYMBOLS
}

/**
 * An HRP PPDU's length in chips. `sts` true (the default) is STS packet configuration 1 — SHR, STS,
 * PHR, PSDU (standard Table 16-1); false is configuration 0, the packet with no STS field at all
 * (Table 16-1, and the ARC IE's STS Packet Config value 0, Table 10-165: "No STS field included in
 * the PPDU") — SHR, PHR, PSDU, 33 792 chips (about 67.7 µs) shorter. 2026-11-11 (W2b): until then a
 * session with its sequence switched off still sent configuration-1 frames.
 */
export function uwbPpduChips(octets: number, sts = true): number {
  return UWB_SHR_CHIPS + (sts ? UWB_STS_CHIPS : 0) + UWB_PHR_CHIPS + psduSymbols(octets) * DATA_SYMBOL_CHIPS
}

export function uwbPpduNs(octets: number, sts = true): Ns {
  return chipsToNs(uwbPpduChips(octets, sts))
}

/**
 * aTurnaroundTime for the HRP UWB PHY: 12 symbol periods (standard Table 12-1, "The value is 12 for
 * all other PHYs"), where MAC timing counts in **preamble** symbols, Tpsym (§16.1: "For the HRP UWB
 * PHY, where MAC timing is specified in symbols, the duration of a preamble symbol (Tpsym) is used")
 * — 12 × 508 chips = 6 096 chips, about 12.21 µs at the code length this engine uses (Table 16-5).
 * Both turnarounds are bounded by it (§11.2.2, §11.2.3, §16.4.7/.8). A device that receives in one
 * slot and transmits at the start of the next needs at least this long between the two, so a slot
 * has to hold its frame, the flight and this (`uwbSlotFitNs`). 2026-11-11 (W2b): until then the slot
 * rule left it out and a 300 RSTU floor of this simulator's own stood in for every margin.
 */
export const UWB_TURNAROUND_CHIPS = 12 * PSYM_CHIPS
export const UWB_TURNAROUND_NS: Ns = chipsToNs(UWB_TURNAROUND_CHIPS)

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

// The MHR and the FCS are the standard's frame format, and every IE's content is written out as the
// sum of the fields its content-field figure in §10.29.8 / §10.32.9 / §10.34–§10.36 gives (field
// widths verified against IEEE Std 802.15.4-2024 on 2026-11-10); the frame helpers below add those
// constants up rather than restating the arithmetic. Where a figure leaves a choice open (address
// size, which optional fields are carried) the choice is stated beside the constant.

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

/**
 * ARC IE (standard §10.32.9.1, Figure 10-244): header + the 2-octet control bits (Multi-node Mode,
 * Ranging Round Usage, STS Packet Config, Schedule Mode, Deferred Mode, Time Structure Indicator,
 * RCM Validity Rounds, MMRCR) + the 1-octet Content Control. The four optional fields that Content
 * Control can switch on — Ranging Block Duration 3, Ranging Round Duration 1, Ranging Slot Duration
 * 2, Session ID 4 — are never carried: the block structure is set by the next higher layer (the
 * scenario's own session config), which §10.32.3.3 allows instead of signalling it, and the session
 * is set up out of band. So RBDP/RRDP/RSDP/SIP are all zero and the content is 3 octets.
 *
 * Block and round **indices** are not ARC IE fields at all: they ride the RR IE below (§10.32.9.3).
 * Until 2026-11-10 this constant was header + 8 — control 2 plus a block, round and slot index of 2
 * octets each — three fields the standard's ARC IE does not have (audit #9).
 */
export const ARC_IE_BYTES = UWB_IE_HDR_BYTES + 2 + 1
/**
 * RR IE (standard §10.32.9.3, Figure 10-248): header + Ranging Block Index 2 + Hopping Mode (1 bit)
 * and Round Index (15 bits) 2 + Transmission Offset 2. Carried in every RCM of a block-based session
 * (§10.32.3.3: the controller configures the allocated round with the ARC IE and the RR IE). This
 * engine never hops and never offsets, so Hopping Mode and Transmission Offset are both 0 — but the
 * octets are on the air whatever their value.
 */
export const RR_IE_BYTES = UWB_IE_HDR_BYTES + 2 + 2 + 2
/** RRMC IE (§10.29.8.3): header + one control octet (what the round asks the responder for). */
export const RRMC_IE_BYTES = UWB_IE_HDR_BYTES + 1
/**
 * RRTI IE (standard §10.29.8.1, Figures 10-208/10-209): header + a 1-octet content header (Address
 * Size Specifier 2 bits, RRTI List Length 6 bits) + one list element per reply time: RX-to-TX Reply
 * Time 4 octets, plus a 0/2/8-octet Address. One IE carries the whole list.
 * Until 2026-11-10 this engine priced it as header + 4 with no content header, and a broadcast Final
 * carried one such IE per responder (audit #8).
 */
export const RRTI_CONTENT_HDR_BYTES = 1
/** One RRTI List element's reply time (Figure 10-209). */
export const RRTI_REPLY_BYTES = 4
/** The short (16-bit) address every addressed list element in this engine carries (Table 10-149
 * value 2). Short addressing throughout is the model's choice, as in the MHR. */
export const UWB_SHORT_ADDR_BYTES = 2
/** The RRTI IE's width for `elements` reply times, with or without the per-element address.
 * §10.29.8.1: unicast omits the address (the MHR's destination says who); a broadcast list with
 * several responders carries it — the standard allows omitting it when the order is pre-negotiated,
 * and this engine does not use that option. */
export function rrtiIeBytes(elements: number, addressed: boolean): number {
  return UWB_IE_HDR_BYTES + RRTI_CONTENT_HDR_BYTES
    + elements * (RRTI_REPLY_BYTES + (addressed ? UWB_SHORT_ADDR_BYTES : 0))
}
/** The RRTI IE an embedded SS-TWR Response carries: unicast to the initiator, one reply time, no
 * address — 2 + 1 + 4 = 7 octets. */
export const RRTI_IE_BYTES = rrtiIeBytes(1, false)
/** One CP Table Element of the RCPS IE (standard §10.32.9.5, Figure 10-251): Phase Indicator 2 bits
 * + Ranging Slot Index to Start 7 bits + Ranging Slot Index to End 7 bits = 2 octets. */
export const RCPS_CP_ELEMENT_BYTES = 2
/** The largest slot index a CP Table Element can name: its start and end fields are 7 bits wide. */
export const RCPS_MAX_SLOT_INDEX = 127
/** RCPS IE (standard §10.32.9.5, Figure 10-250): header + CP Table Length 1 + one CP Table Element per
 * contention phase. A contention round in this engine has exactly one contention phase — the
 * responders' (Phase Indicator 1), slots 1…S after the Poll in slot 0 — so the IE is 2 + 1 + 2.
 * (Until 2026-11-10 this was header + a 1-octet first and a 1-octet last slot, no table length and no
 * phase indicator: audit #13.) */
export function rcpsIeBytes(phases: number): number {
  return UWB_IE_HDR_BYTES + 1 + RCPS_CP_ELEMENT_BYTES * phases
}
/** The RCPS IE of this engine's contention round: one phase. */
export const RCPS_IE_BYTES = rcpsIeBytes(1)
/** RCMA IE (§10.32.9.6): header + max attempts 1. standard §10.32.9.6; content sizing model */
export const RCMA_IE_BYTES = UWB_IE_HDR_BYTES + 1
/**
 * SRRR IE (standard §10.32.9.9, Figure 10-255): header + one control octet (Requester Address Size
 * Specifier 2 bits, Provider Address Size Specifier 2 bits, RAOA, RRT, RRTT, RTOF) + the Requester
 * Address (0/2/8) + the Provider Address (0/2/8). One IE names one requester–provider pair.
 *
 * In this engine's SP3 round the controller is the initiator, and §10.32.9.9 lets an RCM from a
 * controller that is also the initiator omit the requester's address ("responders implicitly know
 * that requests are from the controller"), so each IE is the pair (initiator, responder k): the
 * control octet plus the responder's 2-octet short address — 5 octets.
 * Until 2026-11-10 this was header + one octet with no address at all (audit #14).
 */
export const SRRR_IE_BYTES = UWB_IE_HDR_BYTES + 1 + UWB_SHORT_ADDR_BYTES
/** The RCM's SRRR content: one SRRR IE per responder (one pair each) — 5A octets. A request is not
 * free, the mirror image of §10.36's MMRCR bit, which rides in a control octet the RCM carries
 * regardless and so costs nothing extra. */
export function srrrIeBytes(responders: number): number {
  return SRRR_IE_BYTES * responders
}

/** The AOA Azimuth field of one RMI List element (standard §10.29.8.4, Figure 10-213): a signed
 * 2-octet integer in units of 2π/(2^16 − 1), 0 rad straight ahead of the sending device. What a
 * responder's report gains when the SRRR IE's RAOA bit (§10.32.9.9) or the RRMC IE's AOA Azimuth
 * Request bit (§10.29.8.3) asked for a bearing — the same RMI IE with AOA Azimuth Present = 1, not a
 * second IE. The AOA Azimuth FOM (1 octet) and the elevation fields are not carried (AOA FOM Present
 * = 0, AOA Elevation Present = 0). 2026-11-11 (W4): until then the bearing rode an IE of its own
 * ("RAOA", header + 2) that the standard does not define. */
export const RMI_AOA_AZIMUTH_BYTES = 2

/** RDM IE (§10.32.9.8), fixed part: header + the device count. */
export const RDM_IE_FIXED_BYTES = UWB_IE_HDR_BYTES + 1
/** One RDM entry: the device's short address 2 + the slot index it is given 1. */
export const RDM_ENTRY_BYTES = 3
/**
 * RMI IE (standard §10.29.8.4, Figures 10-212/10-213), fixed part: header + the 2-octet content
 * header (Reply Time / Round-trip Time / TOF / AOA Azimuth / AOA Elevation / AOA FOM Present bits,
 * Address Size Specifier, Deferred Mode, RMI List Length 7 bits). Until 2026-11-10 the content header
 * was priced at 1 octet (audit #8).
 */
export const RMI_FIXED_BYTES = UWB_IE_HDR_BYTES + 2
/** One RMI list element's ranging time — RX-to-TX Reply Time, TX-to-RX Round-trip Time or TOF are
 * each 4 octets (Figure 10-213). */
export const RMI_TIME_BYTES = 4
/** The RMI IE's width: the fixed part plus `elements` list elements, each carrying `times` 4-octet
 * times and — in a broadcast frame, where §10.29.8.4 requires it — the 2-octet short address. A
 * unicast frame carries exactly one element with no address (the MHR's destination names the device).
 * §10.29.8.4: "At least one measurement shall be present", so `times` is never 0. */
export function rmiIeBytes(elements: number, times: number, addressed: boolean): number {
  if (times < 1) throw new Error('rmiIeBytes: an RMI IE carries at least one measurement')
  return RMI_FIXED_BYTES + elements * (times * RMI_TIME_BYTES + (addressed ? UWB_SHORT_ADDR_BYTES : 0))
}
/** One RMI entry in an embedded Final: the responder's short address 2 + its round-trip time 4. */
export const RMI_FINAL_ENTRY_BYTES = UWB_SHORT_ADDR_BYTES + RMI_TIME_BYTES
/** RMI IE in a responder's measurement report to the initiator (unicast): the fixed part + one
 * element of one measurement — Tround2 (embedded DS, Figure 10-238) or the TOF (deferred DS, Figure
 * 10-206) — no address: 4 + 4 = 8 octets. 2026-11-11 (W2b): 12 until then (reply time and round trip). */
export const RMI_REPORT_IE_BYTES = rmiIeBytes(1, 1, false)

/** The Poll's RDM IE: one entry per anchor, 3 + 3N octets. */
export function rdmIeBytes(anchors: number): number {
  return RDM_IE_FIXED_BYTES + RDM_ENTRY_BYTES * anchors
}

/** The Final's RMI IE when embedded (broadcast): one round-trip time and address per responder,
 * 4 + 6N octets. */
export function rmiFinalIeBytes(anchors: number): number {
  return rmiIeBytes(anchors, 1, true)
}

/** MHR + ARC IE (5) + RR IE (8) + RDM IE (3 + 3N) + RRMC IE + FCS = 30 + 3N (time-scheduled); a
 * contention round's Poll lists no per-anchor schedule (any anchor may answer), so RDM is replaced by
 * the fixed-size RCPS + RCMA IEs: MHR + ARC + RR + RCPS (5) + RCMA (3) + RRMC + FCS = 35, independent
 * of anchor count. The Poll is the RCM fused with the ranging initiation message (§10.32.2 allows the
 * merge when the controller is the initiator), so it carries both the RCM's ARC + RR IEs
 * (§10.32.3.3) and the initiation's RRMC IE. */
export function uwbPollBytes(anchors: number, schedule: 'time' | 'contention' = 'time'): number {
  if (schedule === 'contention') {
    return UWB_MHR_BYTES + ARC_IE_BYTES + RR_IE_BYTES + RCPS_IE_BYTES + RCMA_IE_BYTES + RRMC_IE_BYTES + UWB_FCS_BYTES
  }
  return UWB_MHR_BYTES + ARC_IE_BYTES + RR_IE_BYTES + rdmIeBytes(anchors) + RRMC_IE_BYTES + UWB_FCS_BYTES
}

/** A Response that carries no reply time: MHR + RRMC IE + FCS = 14 octets. */
export const UWB_BARE_RESP_BYTES = UWB_MHR_BYTES + RRMC_IE_BYTES + UWB_FCS_BYTES

/**
 * MHR + RRMC IE + FCS, plus the RRTI IE that carries the responder's reply time whenever the round
 * embeds it in this very frame: 21 octets embedded, 14 deferred or fixed.
 *
 * - SS-TWR embedded: the one-to-many Response is `{Ranging, RRTI IE & RRMC IE}` (standard §10.32.4,
 *   Figure 10-235 — the RRMC IE (1) rides the Response in the one-to-many procedure; the single-pair
 *   Figure 10-204 has the RRTI alone).
 * - DS-TWR embedded: when the initiator's RRMC IE (2) requests the first reply time and the second
 *   round-trip time, the responder's Response is `{Ranging, RRMC IE and RRTI IE}` — Treply1 goes back
 *   here, and only Tround2 is left for the responder's later report (§10.32.5, Figure 10-238).
 *   2026-11-11 (W2b): until then the DS Response carried no RRTI and the report carried both times.
 * - Deferred (ARC Deferred Mode 1, §10.32.9.1; Figures 10-206, 10-237) and fixed: no reply time here.
 */
export function uwbRespBytes(method: 'ss' | 'ds', replyTime: UwbReplyTime = 'embedded'): number {
  void method
  return UWB_BARE_RESP_BYTES + (replyTime === 'embedded' ? RRTI_IE_BYTES : 0)
}

/**
 * The DS-TWR Final (broadcast). Embedded (standard §10.32.5, Figure 10-236): MHR + an RMI IE with
 * each responder's round-trip time and address (4 + 6N) + one RRTI IE listing each responder's reply
 * time and address (3 + 6N) + FCS = 18 + 12N.
 *
 * Deferred (§10.29.6.6, §10.32.5 Figure 10-237): the Final is a bare ranging frame — `{Ranging}` in
 * the figure, no IE at all — so MHR + FCS = 11 octets. Its two times go out afterwards in the
 * initiator's deferred report (`uwbDsDeferredReportBytes`). Until 2026-11-10 the deferred Final
 * carried an address-only RMI list, which §10.29.8.4 forbids ("At least one measurement shall be
 * present"; audit #3).
 */
export function uwbFinalBytes(anchors: number, replyTime: UwbReplyTime = 'embedded'): number {
  if (replyTime === 'deferred') return UWB_MHR_BYTES + UWB_FCS_BYTES
  return UWB_MHR_BYTES + rmiFinalIeBytes(anchors) + rrtiIeBytes(anchors, true) + UWB_FCS_BYTES
}

/**
 * The initiator's deferred Data frame of a deferred DS-TWR round (standard §10.29.6.6, §10.32.5
 * Figure 10-237): broadcast in the measurement report phase, one RMI IE (Deferred Mode = 1) whose
 * list element per responder carries the first round-trip time, the second reply time and the
 * responder's address. MHR + (4 + 10N) + FCS = 15 + 10N. With it each responder holds all four
 * times and computes its own range (§10.29.6.6: "the responder ... has sufficient information to
 * calculate the TOF").
 */
export function uwbDsDeferredReportBytes(anchors: number): number {
  return UWB_MHR_BYTES + rmiIeBytes(anchors, 2, true) + UWB_FCS_BYTES
}

/**
 * A responder's measurement report of an SP1 DS-TWR round, unicast to the initiator: MHR + an RMI IE
 * with **one** measurement, no address (4 + 4) + FCS = 19 octets.
 *
 * - Embedded (standard §10.32.5, Figure 10-238): the second round-trip time Tround2 — the first reply
 *   time already went back in the Response's RRTI IE.
 * - Deferred (§10.29.6.6, Figure 10-206; §10.32.5, Figure 10-239): the TOF the responder computed,
 *   requested by the TOF Request field of the initiating RRMC IE ("The subsequent reporting of the
 *   ranging result to the initiating end, using the RMI IE, depends on the value of the TOF Request
 *   field").
 *
 * - SP3 DS-TWR is always the deferred shape (its markers carry no payload); the TOF report there is
 *   requested by the SRRR IE's RTOF bit (§10.32.9.9), which the initiator sets in such a round.
 *
 * 2026-11-11 (W2b): until then every shape sent Treply1 and Tround2 (23 octets).
 */
export const UWB_REPORT_BYTES = UWB_MHR_BYTES + RMI_REPORT_IE_BYTES + UWB_FCS_BYTES

/** The deferred reply-time message of SS-TWR (standard §10.29.6.3, Figure 10-203): an anchor whose
 * Response could not embed `Treply` — it did not know its own future send time — follows up, once it
 * has read that send timestamp back, with "the RMI IE ... carried by a subsequent message":
 * MHR + an RMI IE with one reply time, unicast (no address; 4 + 4) + FCS = 19 octets
 * (`makeSsDefer` in frames.ts). Until 2026-11-10 this message carried an RRTI IE (audit #4). */
export const UWB_SS_DEFER_BYTES = UWB_MHR_BYTES + rmiIeBytes(1, 1, false) + UWB_FCS_BYTES

/**
 * The RCM of an SP3 grouped round (standard §10.32.8.1's first phase): today's Poll plus one SRRR
 * IE per responder (§10.32.9.9) — the responders' own requests for what the data report phase
 * should give back.
 *
 * **A request is not free here**, and that is the point the lesson pairs against §10.36's MMRCR
 * bit, which rides a control octet the RCM carries regardless and costs nothing extra: this one
 * costs 5 octets a responder (`SRRR_IE_BYTES`). A function rather than a term folded into `uwbPollBytes` so that no
 * existing caller's number moves — every scenario with `sp3` off asks the same question it always
 * did and gets the same answer.
 */
export function uwbSp3PollBytes(anchors: number): number {
  return uwbPollBytes(anchors) + srrrIeBytes(anchors)
}

/**
 * The **initiator's** own frame in the data report phase (§10.32.8.1's third phase, the one
 * Figure 10-242 draws going the other way): MHR + an RMI IE (§10.29.8.4) carrying one entry per
 * responder — that responder's short address and the round-trip time the initiator measured for it
 * — + FCS. 14 + 6A octets.
 *
 * The entry is `RMI_FINAL_ENTRY_BYTES`, reused rather than redefined, because it is literally the
 * same two fields the embedded Final's RMI entry carries (address 2 + round trip 4). What differs
 * is which frame they ride in and in which direction.
 *
 * Sent **only** when some responder's SRRR IE set the RRTT bit (§10.32.9.9). A round whose
 * responders asked for nothing has nothing for this frame to carry, so it does not send an empty
 * one — and `uwbSlotsPerTag` does not budget a slot for it either.
 */
export function uwbSp3InitReportBytes(responders: number): number {
  return UWB_MHR_BYTES + rmiFinalIeBytes(responders) + UWB_FCS_BYTES
}

/**
 * One responder's frame in the data report phase (§10.32.8.1's third phase): the deferred
 * reply-time message SS-TWR already has (`UWB_SS_DEFER_BYTES`, §10.29.6.3), plus the bearing when
 * the SRRR IE's RAOA bit asked for one.
 *
 * The reply time is there whatever SRRR says — a deferred round has no other route for it, and
 * without it the initiator never learns `Treply` at all — so only the requested extra is gated.
 * That is the measurable half of §10.32.9.9: **RAOA off makes this frame shorter, by exactly one
 * bearing item.**
 */
export function uwbSp3ReportBytes(raoa: boolean): number {
  return UWB_SS_DEFER_BYTES + (raoa ? RMI_AOA_AZIMUTH_BYTES : 0)
}

/**
 * The initiator's measurement report of an SP1 one-to-many SS-TWR round whose responders asked for
 * the result (standard §10.32.4, Figure 10-235: a responder sets the TOF Request field of the RRMC IE
 * (1) in its Response; "The final message broadcast by the initiator conveys one or more RMI IE(s) …
 * where the Address field of the RMI IE distinguishes to which node the reported measurements
 * relate"; §10.29.8.3 "In SS-TWR, the initiator typically calculates the TOF … the responder can
 * request the resultant TOF"). MHR + one RMI IE (TOF Present, broadcast, so each element carries the
 * responder's short address: 4 + 6N) + FCS = 15 + 6N octets. 2026-11-11 (W4, audit #16).
 */
export function uwbSsTofReportBytes(responders: number): number {
  return UWB_MHR_BYTES + rmiIeBytes(responders, 1, true) + UWB_FCS_BYTES
}

// --- RCM validity window, and the non-receipt exchange it makes possible ---------------
// standard §10.32.9.1 (ARC IE, "RCM Validity Rounds") and §10.34 (ranging message non-receipt).
// design docs/superpowers/specs/2026-10-01-rcm-validity-design.md

/** The initiation-only message a later round of a ranging round set carries (design §2): no ARC, no RR, no RDM —
 * the responder's slot table is still the one the still-valid RCM gave it (design §2.1), so this
 * message does not restate it (Ruling 3 of task 1: inventing a schedule field here would delete
 * the feature's entire saving). MHR + RRMC IE + FCS = 14 octets, independent of the anchor count.
 *
 * No anchor-count parameter at all (fix round 1): a function that does not take the argument
 * cannot depend on it, so independence from the anchor count is enforced by the type checker
 * rather than pinned by a test that has to go looking for it. Against the Poll's 30 + 3A
 * (`uwbPollBytes`), each round after the first saves 16 + 3A octets: exactly the ARC, RR and RDM IEs
 * of the RCM that opened the round set. */
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

// --- One-way ranging (OWR, standard §10.29.1.2.5) ---------------------------------
// 2026-11-11 (W4, audit #15): the TDoA frames are the standard's own. Until then the DL-TDoA frames
// carried a transmit-time, a receive-times and a clock-offset IE and the blink a blink IE — four IEs
// IEEE Std 802.15.4-2024 does not define.

/**
 * The blink of the first TDOA case (standard §10.29.1.2.5): "RFID devices typically use the shortest
 * blink message possible, (e.g., a multipurpose frame) … A multipurpose frame can be as short as 12
 * octets; consisting of a Short Frame Control field, the Sequence Number field, no Destination Address
 * field, an extended source address and an FCS." MP Short Frame Control 1 (§7.3.5.3) + Sequence Number
 * 1 + extended source address 8 + FCS 2 = 12 octets. No IE: the frame carries no times — the fixed
 * nodes take them on arrival.
 */
export const UWB_MP_SHORT_FC_BYTES = 1
export const UWB_SEQ_BYTES = 1
export const UWB_EXT_ADDR_BYTES = 8
export const UWB_BLINK_BYTES = UWB_MP_SHORT_FC_BYTES + UWB_SEQ_BYTES + UWB_EXT_ADDR_BYTES + UWB_FCS_BYTES

/**
 * The RCM of a one-way ranging round (standard §10.32.2, Figure 10-225 "<OWR>": the controller's RCM in
 * slot 0, then the responders' ranging messages R1 … RN): MHR + ARC IE (Ranging Round Usage = 0, OWR,
 * Table 10-164) + RR IE + an RDM IE (SIU = 1, §10.32.9.8) assigning each fixed node its slot + FCS —
 * the same frame shape as `uwbAncillaryRcmBytes('time', N)`. 25 + 3N octets. It carries no RRMC IE:
 * nothing in an OWR round is a request.
 */
export function uwbOwrRcmBytes(nodes: number): number {
  return UWB_MHR_BYTES + ARC_IE_BYTES + RR_IE_BYTES + rdmIeBytes(nodes) + UWB_FCS_BYTES
}

/**
 * One fixed node's ranging message in a one-way ranging round (Figure 10-225's R1 … RN): an RFRAME
 * with an empty payload — MHR + FCS = 11 octets. It needs no IE in the second TDOA case of §10.29.1.2.5,
 * where the nodes are synchronized and transmit "with known transmission time offsets with respect to
 * each other": the listening device already knows when each was sent (its slot), so the frame carries
 * no transmit time.
 */
export const UWB_OWR_MSG_BYTES = UWB_MHR_BYTES + UWB_FCS_BYTES

// --- Many-to-many ranging (standard §10.32.6 SS / §10.32.7 DS) ------------------
//
// 2026-11-11 (W3, audit #2): the round is the standard's. The controller (this engine: the first
// initiator) sends the RCM fused with its own ranging initiation message — ARC (Multi-node Mode 2,
// Table 10-163) + RR + an RDM IE giving every other device its role and slot (§10.32.9.8) + RRMC.
// The other M − 1 initiators send a ranging initiation message (RRMC only). SS (§10.32.6, Figure
// 10-240): each of the N responders answers with one RRTI IE listing a reply time per initiator.
// DS (§10.32.7, Figure 10-241): each responder answers with RRMC (3) only, and each initiator then
// sends a final frame with an RRTI IE (the second reply time per responder) and an RMI IE (the first
// round-trip time per responder) — the one-to-many embedded Final's shape, `uwbFinalBytes(N)`.
// Until 2026-11-11 every device was initiator and responder at once and its frame carried two IEs the
// standard does not define (TXT, RXT).

/** The controller's RCM fused with its ranging initiation message: the time-scheduled Poll whose RDM
 * IE lists every **other** device of the round (M − 1 initiators and N responders), 30 + 3(M − 1 + N)
 * octets. The controller does not list itself: it is the device that sent the RCM (§10.32.9.8, "used by
 * the controller to control the devices participating"). */
export function uwbM2mRcmBytes(initiators: number, responders: number): number {
  return uwbPollBytes(initiators - 1 + responders)
}

/**
 * A responder's ranging response in a many-to-many round.
 *
 * - SS (§10.32.6, Figure 10-240 `{Ranging, RRTI IEs}`): MHR + one RRTI IE whose list carries a reply
 *   time and the initiator's short address per initiator (Figure 10-208/10-209; the address is kept,
 *   §10.29.8.1 allows omitting it only for a pre-negotiated order) + FCS = 14 + 6M octets. No RRMC IE:
 *   the figure has none, unlike the one-to-many Figure 10-235.
 * - DS (§10.32.7, Figure 10-241 `{Ranging, RRMC IE}`): RRMC (3) alone — the responder computes, so it
 *   sends no reply time — 14 octets.
 */
export function uwbM2mRespBytes(method: 'ss' | 'ds', initiators: number): number {
  if (method === 'ds') return UWB_BARE_RESP_BYTES
  return UWB_MHR_BYTES + rrtiIeBytes(initiators, true) + UWB_FCS_BYTES
}

/** The longest frame of a many-to-many round of `initiators` (M) and `responders` (N): the controller's
 * RCM, an SS response (grows with M) or a DS final (grows with N, `uwbFinalBytes`). The other
 * initiators' initiation messages are `uwbInitBytes()`, never the longest. */
export function uwbM2mLongestBytes(method: 'ss' | 'ds', initiators: number, responders: number): number {
  return Math.max(
    uwbM2mRcmBytes(initiators, responders),
    uwbInitBytes(),
    uwbM2mRespBytes(method, initiators),
    method === 'ds' ? uwbFinalBytes(responders) : 0,
  )
}

/**
 * Why a many-to-many round of M initiators and N responders cannot be sent, or null when it can: every
 * frame within the 127-octet PSDU (standard §16.2.7) and the controller's RDM IE within its 6-bit RDM
 * List Length (§10.32.9.8, at most 63 elements). Read by the scenario schema and by `UwbNetwork`, so
 * the two cannot disagree.
 */
export function uwbM2mOverflow(
  method: 'ss' | 'ds', initiators: number, responders: number,
): { frame: 'rcm' | 'resp' | 'final' | 'rdm'; bytes: number } | null {
  if (initiators - 1 + responders > 63) return { frame: 'rdm', bytes: initiators - 1 + responders }
  const rcm = uwbM2mRcmBytes(initiators, responders)
  if (rcm > UWB_MAX_PSDU_BYTES) return { frame: 'rcm', bytes: rcm }
  const resp = uwbM2mRespBytes(method, initiators)
  if (resp > UWB_MAX_PSDU_BYTES) return { frame: 'resp', bytes: resp }
  if (method === 'ds') {
    const fin = uwbFinalBytes(responders)
    if (fin > UWB_MAX_PSDU_BYTES) return { frame: 'final', bytes: fin }
  }
  return null
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
 * The MMRC Bitmap Length field (standard §10.36.2.1, Figure 10-274): one octet in every list
 * element, giving the bitmap's own length in octets. Until 2026-11-10 this engine left it out
 * (audit #24).
 */
export const RMMRC_BITMAP_LEN_BYTES = 1

/**
 * Width, in octets, of one initiator's receipt bitmap: standard §10.36.2.1 — "ceiling of ((Number of
 * slots being acknowledged)/8)", **one bit per slot**, the first bit the first slot. The slots
 * acknowledged are every slot of the ranging round set before the receipt confirmations themselves
 * (`uwb/session.ts#mmrcmAckSlots`). Until 2026-11-10 this was one bit per *round* (audit #11).
 */
export function rmmrcBitmapBytes(slots: number): number {
  return Math.ceil(slots / 8)
}

/** One MMRC list element (Figure 10-274): the initiator's address, the bitmap length octet, the
 * bitmap. */
export function rmmrcEntryBytes(slots: number): number {
  return RMMRC_ADDR_BYTES + RMMRC_BITMAP_LEN_BYTES + rmmrcBitmapBytes(slots)
}

/** The RMMRC IE's own width: the fixed part plus one entry per initiator the MMRCM lists. */
export function rmmrcIeBytes(initiators: number, slots: number): number {
  return RMMRC_FIXED_BYTES + initiators * rmmrcEntryBytes(slots)
}

/**
 * The MMRCM frame (standard §10.36, Figure 10-272 "Many-to-Many Messages"): MHR + RMMRC IE +
 * FCS = 15 + N × (3 + ⌈slots / 8⌉), one bit per acknowledged slot.
 */
export function uwbMmrcmBytes(initiators: number, slots: number): number {
  return UWB_MHR_BYTES + rmmrcIeBytes(initiators, slots) + UWB_FCS_BYTES
}

/**
 * Initiators one MMRCM frame can list: the largest N whose frame still fits the 127-octet PSDU
 * (standard §16.2.7). Searched against `uwbMmrcmBytes`, exactly as `uwbMaxAnchors` searches its own
 * frame-size function — no literal cap here either,
 * and the same `UWB_ANCHOR_SEARCH_CEILING` loop bound, for the same reason (nothing about this
 * frame's own arithmetic stops the search on its own if the ceiling were left out).
 */
export function uwbMaxMmrcmInitiators(slots: number): number {
  let cap = 0
  for (let n = 1; n <= UWB_ANCHOR_SEARCH_CEILING; n++) {
    if (uwbMmrcmBytes(n, slots) > UWB_MAX_PSDU_BYTES) break
    cap = n
  }
  return cap
}

// --- Ranging ancillary information (standard §10.35) ---------------------------------------

/**
 * RAICT IE (§10.35.2.1, Figure 10-271), smallest possible content: the one control octet alone
 * (Request, the Ranging Or Ancillary Message Number Present bit, 6 reserved bits), with neither
 * optional octet present. standard §10.35.2.1
 */
export const RAICT_IE_MIN_BYTES = UWB_IE_HDR_BYTES + 1

/**
 * The RAICT IE's own width (§10.35.2.1): the one control octet, plus the Ranging Or Ancillary Message
 * Number octet when the control octet's one presence bit says it is there, plus the Frames Remaining
 * octet when the IE carries it. **Frames Remaining has no presence bit** (Figure 10-271: Request bit,
 * Message Number Present bit, reserved): whether it is there is read from the IE's length in its
 * header. Until 2026-11-10 this engine's documentation described a second, "frames remaining present"
 * bit, which the standard does not have (audit #12). standard §10.35.2.1
 */
export function raictIeBytes(numberPresent: boolean, framesRemainingPresent: boolean): number {
  return RAICT_IE_MIN_BYTES + (numberPresent ? 1 : 0) + (framesRemainingPresent ? 1 : 0)
}

/**
 * One ancillary-information frame (standard §10.35): MHR + RAICT IE + FCS. One frame carries one
 * fragment of a larger ancillary message (or, with Request = 1, the request for the next exchange's
 * slots).
 */
export function uwbAncillaryBytes(numberPresent: boolean, framesRemainingPresent: boolean): number {
  return UWB_MHR_BYTES + raictIeBytes(numberPresent, framesRemainingPresent) + UWB_FCS_BYTES
}

/**
 * The RCM of the ancillary-information round (standard §10.35.1, ARC Ranging Round Usage = 3): MHR +
 * ARC IE + RR IE + either an RDM IE assigning `assigned` slots (time schedule, SIU = 1, §10.32.9.8:
 * 3 + 3·assigned) or an RCPS IE with one contention phase (§10.32.9.5: 5) + FCS. It carries no RRMC IE:
 * this round starts no ranging exchange.
 */
export function uwbAncillaryRcmBytes(schedule: 'time' | 'contention', assigned: number): number {
  const slotsIe = schedule === 'time' ? rdmIeBytes(assigned) : rcpsIeBytes(1)
  return UWB_MHR_BYTES + ARC_IE_BYTES + RR_IE_BYTES + slotsIe + UWB_FCS_BYTES
}

/**
 * The ancillary round's window — the slots after its RCM the exchange may use (standard §10.35.1) —
 * **the one definition**, read by the scenario schema, the editor and `session.ts`. It lives here
 * rather than in `session.ts` because the schema cannot import `session.ts` without an import cycle.
 *
 * **The two schedules answer differently** (§10.35.1 allows the exchange to be scheduling-based or
 * contention-based):
 *
 * - `'time'` — exactly one slot per fragment, plus the request frame's: the RCM's RDM IE assigns
 *   each of them to the sender (§10.32.9.8).
 * - `'contention'` — at least the session's own contention window (§10.32.2 schedule mode 0): the
 *   RCM's RCPS IE opens an initiators' contention phase (Phase Indicator 0, §10.32.9.5) that wide, and
 *   the sender draws where its run of fragments starts. `Math.max`, because a message longer than the
 *   draw window is legal; there the window is the message and the draw has a single position.
 *
 * 0 whenever the exchange is off, and 0 in every mode the schema refuses it for.
 */
export function uwbAncillarySlots(
  mode: UwbMode, schedule: 'time' | 'contention', contentionSlots: number,
  ancillary: boolean, ancillaryFrames: number,
  /**
   * Request = 1 (standard §10.35.2.1; slice 3d): one more frame, in one more slot, carrying a
   * RAICT IE that asks the controller for the next exchange's slots rather than reporting this
   * message's own progress. The clause lists the two uses as *different* uses of one IE — the
   * Frames Remaining field means a different quantity in each — so one frame cannot do both, and
   * the request needs a slot of its own.
   *
   * **Default `false`, so every expression above is restored word for word** when nobody asks: an
   * existing session is laid out slot for slot as it was, which is what makes the identity
   * structural rather than measured (design §5.1).
   */
  requestSlot: boolean = false,
): number {
  if (!ancillary) return 0
  // Refused outright for dl-tdoa, ul-tdoa, mms and m2m in the schema, so none of them reaches here
  // with `ancillary` on; answering 0 rather than throwing keeps this usable from a caller that has
  // not checked the mode yet, exactly as `uwbMmrcmSlots` does.
  if (mode !== 'twr') return 0
  const frames = ancillaryFrames + (requestSlot ? 1 : 0)
  if (schedule === 'time') return frames
  // `frames`, not `ancillaryFrames`, inside the `Math.max`: the sender's run has to hold the
  // request frame too, so a draw window narrower than run-plus-request would leave the request
  // nowhere to sit. Below `contentionSlots` the window does not move at all, which is the interval
  // the inert census pins rather than refuses (design §6.3.1).
  return Math.max(frames, contentionSlots)
}

/**
 * The fixed length, in slots, of every round of a session (standard §10.32.3.3: in block-based mode
 * "the number of ranging slots in a ranging round" is one value, round duration / slot duration, for
 * every round of the block). It has to hold the longest round the session runs:
 *
 * - a ranging round: its ranging slots, plus — when `mmrcr` is on — one receipt-confirmation slot per
 *   responder (§10.36), spent in the round that closes a ranging round set and left idle in the
 *   others; and
 * - when the ancillary exchange is on, the ancillary-information round (ARC Ranging Round Usage = 3,
 *   §10.35, Table 10-164): its RCM in slot 0 plus the message's window (`uwbAncillarySlots`).
 *
 * Until 2026-11-10 rounds were not one length: the MMRCM slots and the ancillary window were appended
 * to particular ranging rounds, which a block-based structure (one round duration) does not allow.
 * **The one definition** the scenario schema, the editor and `session.ts#roundPlan` read.
 */
export function uwbRoundSlotCount(rangingSlots: number, mmrcmSlots: number, ancillaryWindow: number): number {
  return Math.max(rangingSlots + mmrcmSlots, ancillaryWindow > 0 ? 1 + ancillaryWindow : 0)
}

/**
 * How many slots one initiator's rounds take out of a block (standard §10.32.2, §10.32.3.3):
 * `initiatorRounds` ranging rounds, plus the ancillary-information round when the exchange is on —
 * every one of them `roundSlots` (`uwbRoundSlotCount`) long. **The one definition** the scenario
 * schema's block-fit rule, the editor and `UwbNetwork`'s nanosecond guard budget with.
 */
export function uwbInitiatorBlockSlots(roundSlots: number, initiatorRounds: number, ancillaryRound: boolean): number {
  return (initiatorRounds + (ancillaryRound ? 1 : 0)) * roundSlots
}

/**
 * The round duration, in slots, a block-based session actually runs (standard §10.32.2: "Each ranging
 * block consists of a whole number of ranging rounds"; §10.32.3.3: number of rounds = block duration ÷
 * round duration). `needed` is the slots the round's exchange takes (`uwbRoundSlotCount`); the block
 * and slot durations are the session's. The answer is the **smallest whole divisor of the block's slot
 * count that is at least `needed`**: the round is "a period of sufficient duration to complete one
 * entire range-measurement cycle" (§10.32.2), so it may be longer than its exchange, and the slots
 * past the exchange are idle. The round duration is the controller's next higher layer's choice
 * (ARC IE Ranging Round Duration, §10.32.9.1); taking the smallest legal one is this simulator's.
 *
 * Returns `needed` unchanged when the block is not a whole number of slots (the schema refuses that,
 * `uwbBlockWholeSlots`) or when no round fits the block at all (the block-fit rule refuses that).
 *
 * Not applied to `mode: 'mms'`: the P802.15.4ab ranging cycle has its own slot layout, and aligning it
 * is the 4ab-draft workstream's (W5). 2026-11-11 (W2b): until then the block's remainder after
 * ⌊block ÷ round⌋ rounds was simply left unused — e.g. 200 ms blocks of 16 ms rounds, 8 ms over.
 */
export function uwbWholeRoundSlots(needed: number, blockRstu: number, slotRstu: number, mode: UwbMode): number {
  if (mode === 'mms') return needed
  if (!uwbBlockWholeSlots(blockRstu, slotRstu)) return needed
  const blockSlots = blockRstu / slotRstu
  for (let m = Math.max(1, needed); m <= blockSlots; m++) if (blockSlots % m === 0) return m
  return needed
}

/** Whether a block is a whole number of slots — which it has to be, being a whole number of rounds of
 * a whole number of slots each (standard §10.32.2). */
export function uwbBlockWholeSlots(blockRstu: number, slotRstu: number): boolean {
  return slotRstu > 0 && blockRstu % slotRstu === 0
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
 * around: a DL-TDoA round is the anchors' own (the controller's RCM + one ranging message per anchor
 * = N + 1 slots, standard Figure 10-225 "<OWR>") and
 * every tag in the scenario listens to that same round, while a UL-TDoA round is one blink slot
 * and belongs to one tag. An MMS round is pairwise by default — one tag and one anchor — and its
 * length is the train's, not the anchor count's: `mmsLayout` counts its slots, so a tag needs
 * that many per anchor (4ab draft 15-22/0381r5 §1.1). A one-to-many MMS round instead holds
 * every anchor at once, and grows by a slot per responder per millisecond and by a narrowband
 * window per responder at each end — `mmsResponders` is the one place that count is decided.
 *
 * A many-to-many round (`mode: 'm2m'`, standard §10.32.6 SS / §10.32.7 DS) is M initiators and N
 * responders (`anchors` is N, `initiators` is M): the M ranging initiation messages (the first of them
 * fused with the controller's RCM), then the N responses — M + N slots for SS — and for DS one final
 * frame per initiator after them, 2M + N. 2026-11-11 (W3): until then every device was both, and the
 * round was N or 2N slots. */
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
 * `peers` is the responder count: the anchors of a two-way round, the responders of an `'m2m'` one
 * (standard §10.36.1: the recipients of the initiators' messages confirm them).
 *
 * **Why per responder, when the IE counts initiators.** §10.36 has two counts and they belong to
 * different things: the IE carries one list entry per *initiator*, since one responder may have
 * heard several, while the slots are one per *responder*, since each responder sends its own frame.
 * The first draft of this feature said "one slot per initiator" in both places, which gave a
 * two-way round a single slot for all N anchors to answer from.
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
  /**
   * SP3 grouped ranging (standard §10.32.8.1's three phases, §10.32.8.2's Figure 10-242), and the
   * one SRRR request bit that changes the round's **shape** rather than a frame's length.
   *
   * Undefined — the default — is every round written before this slice, which asks the question it
   * always asked. An object rather than a boolean because `rrtt` belongs here: the initiator's own
   * measurement report (the frame that answers that bit) needs a slot of its own, and a round whose
   * responders asked for nothing has no such frame to give one to (design §4.1).
   */
  sp3?: { rrtt: boolean },
  /** `mode: 'm2m'` only: the initiator count M (standard §10.32.6/§10.32.7); `anchors` is then the
   * responder count N. */
  initiators = 1,
  /** SP1 SS-TWR whose responders request the TOF (standard §10.32.4, Figure 10-235): one more slot at
   * the end of the round for the initiator's broadcast RMI report. 2026-11-11 (W4). */
  ssTof = false,
): number {
  if (mode === 'mms') {
    if (!mms) throw new Error("uwbSlotsPerTag: mode 'mms' needs the session's MMS parameters")
    // `slotsPerMs` has to be the session's own (`mmsSlotsPerMs`), not the draft-default 2: a
    // non-interleaved ranging phase is that many slots per millisecond of train, so a caller that
    // left it at the default would size the round for a slot the session does not use, and the
    // round `roundPlan` then lays out would run past the length the block was checked against.
    return mmsLayout(mms, mmsResponders(mms, anchors), slotsPerMs).slots
  }
  if (mode === 'm2m') return method === 'ss' ? initiators + anchors : 2 * initiators + anchors
  if (mode === 'ul-tdoa') return 1
  if (mode === 'dl-tdoa') return anchors + 1
  if (schedule === 'contention') return 1 + contentionSlots
  // SP3's round is Figure 10-242's three phases, and it costs **two** slots an SP1 round does not
  // have, both of them the initiator's own (design §4.1):
  //
  //   slot 0          the RCM (ARC + RDM + RRMC + the responders' SRRR IEs). It carries payload, so
  //                   it cannot itself be an SP3 packet, which is why the marker below is a frame of
  //                   its own rather than the same slot doing both jobs.
  //   slot 1          the initiator's own SP3 marker — the ranging initiation of the figure. SP1 has
  //                   no such frame: there the Poll is the control message and the initiation at
  //                   once.
  //   slots 2…A+1     one marker per responder.
  //   then            the data report phase: the initiator's own measurement report **only when
  //                   some responder asked for the round-trip time** (the SRRR IE's RRTT bit), then
  //                   one report per responder.
  //
  // So a deferred SS round is `2A + 2` with no RRTT request and `2A + 3` with one, against the SP1
  // deferred round's `2A + 1`. The slice's own design doc quotes 2A + 2, which is this function's
  // answer for the default session (both request bits off); the "A + 1 report frames" it also
  // quotes is the RRTT-on shape. Both are right, for different SRRR settings, and the pair of them
  // is why this count has to be asked rather than written down.
  //
  // A DS round is one slot longer again, because its report phase opens with the initiator's Final:
  // SP3 replaces the ranging frames and adds the initiator's two, it does not redesign the
  // double-sided exchange. The schema refuses both SRRR request bits outside SS, so the `rrtt` term
  // and the `ds` term never both fire.
  if (sp3 !== undefined) {
    // DS: the Final, then (SP3 is always deferred) the initiator's deferred report — two slots.
    return 2 * anchors + 2 + (method === 'ds' ? 2 : 0) + (sp3.rrtt ? 1 : 0)
  }
  if (method === 'ss') return (replyTime === 'deferred' ? 2 * anchors + 1 : anchors + 1) + (ssTof ? 1 : 0)
  // DS-TWR: Poll, A Responses, the Final, then A reports — and, deferred, the initiator's own deferred
  // report between the Final and the responders' reports (standard §10.29.6.6, §10.32.5 Figure
  // 10-237), one slot more.
  return 2 * anchors + 2 + (replyTime === 'deferred' ? 1 : 0)
}

/** Guard between the end of a slot's PPDU and the slot boundary: 200 ns is 60 m of flight (model). */
export const UWB_SLOT_GUARD_NS = 200

/** The round's longest frame, in octets: in a time-scheduled two-way round, the larger of the
 * Poll (which lists every anchor, 30 + 3N) and whichever frame the method and reply-time carry
 * their times in; the Poll or the SS Response in a contention round (which has no Final at all);
 * the controller's RCM in DL-TDoA (its RDM IE grows by 3 per anchor; the ranging messages are a
 * fixed 11); and the blink — the only frame there is — in UL-TDoA.
 *
 * `method` and `replyTime` only matter to the time-scheduled two-way branch: SS-TWR has no Final
 * at all, so its longest frame is the Poll (or, embedded, its own Response, which never catches
 * the Poll); DS-TWR's embedded Final overtakes the Poll a few anchors in, but a deferred Final is
 * bare 11 octets; a deferred round's growing frame is the initiator's deferred report (15 + 10N) — the
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
  /** SP3 grouped ranging (standard §10.32.8): the responders' ranging frames become markers, which
   * are not PSDUs at all and so cannot be the longest *frame* — but the RCM grows by one SRRR IE a
   * responder (§10.32.9.9) and the report frame by one bearing item, and both of those are PSDUs.
   * Defaults false, so every caller written before this slice asks the question it always asked. */
  sp3 = false,
  /** SP1 SS-TWR whose responders request the TOF (RRMC TOF Request, standard §10.29.8.3, §10.32.4
   * Figure 10-235): the initiator's broadcast measurement report (`uwbSsTofReportBytes`, 15 + 6N)
   * joins the round and grows with the anchor count. 2026-11-11 (W4). */
  ssTof = false,
): number {
  if (mode === 'mms') {
    throw new Error('uwbLongestFrameBytes: an MMS round carries fragments and narrowband messages, not PSDUs')
  }
  if (mode === 'ul-tdoa') return UWB_BLINK_BYTES
  // One-way ranging (standard §10.29.1.2.5, Figure 10-225 "<OWR>"): the controller's RCM, whose RDM IE
  // lists every fixed node, and the nodes' bare 11-octet ranging messages. 2026-11-11 (W4).
  if (mode === 'dl-tdoa') return Math.max(uwbOwrRcmBytes(anchors), UWB_OWR_MSG_BYTES)
  // A contention round is SS-TWR and ends at the Response: there is no Final to size it by, and
  // the Poll carries RCPS + RCMA instead of the anchor list, so it is 35 octets whatever the
  // anchor count. At one anchor that Poll is longer than the Final the round never sends.
  // Unlike the time-scheduled SS branch below, this one takes no `UWB_SS_DEFER_BYTES` term: it is
  // numerically inert (the 35-octet Poll always beats the 19-octet deferred message) and the
  // combination cannot legally occur besides — a contention responder draws its slot, and the
  // deferred message has no fixed slot of its own to answer in, so `contention` + `deferred` is
  // refused by the schema (design §3.1).
  if (schedule === 'contention') return Math.max(uwbPollBytes(anchors, 'contention'), uwbRespBytes('ss', replyTime))
  // SP3's RCM carries the responders' SRRR IEs, so it grows twice as fast with the anchor count as
  // an ordinary Poll (30 + 8A rather than 30 + 3A). The schema refuses `sp3` outside a
  // time-scheduled two-way round, which is why the contention branch above needs no term for it.
  const pollBytes = sp3 ? uwbSp3PollBytes(anchors) : uwbPollBytes(anchors)
  if (method === 'ss') {
    // No Final exists: the round ends at the Responses (and, deferred, the follow-up messages),
    // none of which grow with the anchor count — the Poll, which does, is what binds it.
    // An SP3 round's report frame is the deferred message plus a bearing item at most; it is taken
    // at its longest here rather than asked about the RAOA bit, because a slot that fits the round
    // must fit it with the request on.
    const deferBytes = replyTime === 'deferred' ? (sp3 ? uwbSp3ReportBytes(true) : UWB_SS_DEFER_BYTES) : 0
    const tofBytes = ssTof && !sp3 ? uwbSsTofReportBytes(anchors) : 0
    return Math.max(pollBytes, uwbRespBytes('ss', replyTime), deferBytes, tofBytes)
  }
  // DS deferred: the Final is bare, and the initiator's deferred report (15 + 10N) is the frame that
  // grows; the responders' reports are a fixed 19.
  if (replyTime === 'deferred') {
    return Math.max(pollBytes, uwbFinalBytes(anchors, replyTime), uwbDsDeferredReportBytes(anchors), UWB_REPORT_BYTES)
  }
  return Math.max(pollBytes, uwbFinalBytes(anchors, replyTime), UWB_REPORT_BYTES)
}

/**
 * The window a fixed reply time has to land in, in whole RSTU, for a time-scheduled two-way
 * round — **the only reply-time shape whose Response is not slot-aligned** (standard §10.29.6.3,
 * design §6/§6.1 of `docs/superpowers/specs/2026-09-29-reply-time-design.md`). Anchor k transmits
 * at `rxPollEnd + F + k·S` and has to land inside its own slot k+1: not before it opens, and not
 * so late that it is still transmitting when it shuts. `k·S` cancels, which is what "one Final
 * serves every responder" buys, leaving a two-sided bound on `F` alone:
 *
 *     S − Ap   ≤   F   ≤   2S − Ap − Ar − guard
 *
 * with S the slot, Ap the Poll's airtime and Ar the Response's. `scenario.ts`'s `superRefine`
 * checks the same two bounds **tightened by flight time** — the lower by the nearest anchor's
 * ToF, the upper by the furthest — and only it can, because only it can see where the nodes are.
 * This function is deliberately **geometry-free**, and that makes it the conservative reading of
 * the same rule in both directions: flight only ever *loosens* the lower bound and only ever
 * *tightens* the upper, so a value inside this window and near its floor is legal at any
 * geometry whose Response fits its own slot at all.
 *
 * It exists so that an editor can offer a legal value rather than let the schema refuse one it
 * had no way to avoid. Two sources for one rule is a thing this branch has a commit about, so
 * `tests/editor/uwb-planOps.test.ts` referees this window against the schema's own refusals at
 * every slot size it accepts, rather than against a second copy of the arithmetic.
 *
 * **Moved here from `uwb/ui/UwbSessionFields.tsx` (task 4 of
 * `docs/superpowers/specs/2026-10-02-ancillary-design.md`)**, where it had lived only because
 * another session held this file when it first landed — a rename, nothing else. `scenario.ts`
 * still computes its own, flight-tightened version of the same two bounds rather than importing
 * this one (its `pollNs`/`respNs`/`lowerNeededNs`/`upperAllowedNs` locals mirror this function's
 * `pollNs`/`respNs`/`loRstu`/`hiRstu` before the flight-time term is applied); retiring that
 * second copy would mean rounding its nanosecond bounds to whole RSTU *before* the flight-time
 * tightening instead of after, which can move the exact boundary a value is refused at — a
 * behaviour change this task did not make.
 *
 * `loRstu > hiRstu` means no fixed reply time is legal at all: the slot cannot hold the Poll, the
 * Response and the guard together, which the slot-fit rule refuses for its own reasons first.
 */
export function uwbFixedReplyWindowRstu(
  slotRstu: number, anchors: number, schedule: 'time' | 'contention', method: 'ss' | 'ds',
): { loRstu: number; hiRstu: number } {
  void anchors
  void schedule
  const slotNs = rstuNs(slotRstu)
  const respNs = uwbPpduNs(uwbRespBytes(method, 'fixed'))
  // Rounded inwards on both sides: the window is in nanoseconds and the field is in whole RSTU,
  // so ceil the floor and floor the ceiling, or the rounding itself would leave the window.
  //
  // 2026-11-10 (audit #5): FRT1 is measured RMARKER to RMARKER (standard §10.32.2, Figure 10-226),
  // so the Poll's own length drops out of both bounds — responder k's Response starts FRT1 + (k−1)·S
  // after the Poll started, and has to start inside slot k and end, with the guard, before slot k+1.
  return {
    loRstu: Math.ceil(slotNs / RSTU_NS),
    hiRstu: Math.floor((2 * slotNs - respNs - UWB_SLOT_GUARD_NS) / RSTU_NS),
  }
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
  /** SP1 SS-TWR with the TOF report (see `uwbLongestFrameBytes`'s `ssTof`). */
  ssTof = false,
): number {
  let cap = 0
  for (let a = 1; a <= UWB_ANCHOR_SEARCH_CEILING; a++) {
    if (uwbLongestFrameBytes(a, mode, schedule, method, replyTime, false, ssTof) > UWB_MAX_PSDU_BYTES) break
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
 * flight guard plus aTurnaroundTime (`UWB_TURNAROUND_NS`, standard Table 12-1, §11.2.3: a device that
 * receives in this slot may transmit at the start of the next). In a shorter slot the receiver's
 * deadline fires before the frame lands, and the round loses every anchor to UWB_TIMEOUT with
 * nothing to say why. 2026-11-11 (W2b): the turnaround term is new, and it replaced the 300 RSTU
 * floor the schema used to add on top of this rule (the standard has no such floor, §10.32.2 asks
 * only that a slot hold at least one frame). An MMS slot is the draft's own and is left as it was.
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
  /** The round's `sp3` switch, handed straight to `uwbLongestFrameBytes` — SP3's RCM is 3 octets a
   * responder longer than an ordinary Poll, which is a slot-fit question and not only a PSDU-cap
   * one. Both callers of this function pass it: the scenario schema and `UwbNetwork`. */
  sp3 = false,
  /** SP1 SS-TWR with the TOF report (see `uwbLongestFrameBytes`'s `ssTof`). */
  ssTof = false,
): Ns {
  if (mode === 'mms') {
    if (!mms) throw new Error("uwbSlotFitNs: mode 'mms' needs the session's MMS parameters")
    return mmsLongestFragmentNs(mms) + UWB_SLOT_GUARD_NS
  }
  return uwbPpduNs(uwbLongestFrameBytes(anchors, mode, schedule, method, replyTime, sp3, ssTof)) + UWB_SLOT_GUARD_NS
    + UWB_TURNAROUND_NS
}

/**
 * The shortest ranging slot a many-to-many round of `initiators` (M) and `responders` (N) fits in: its
 * longest frame (`uwbM2mLongestBytes`) plus the flight guard and aTurnaroundTime every other mode's
 * slot pays. Read by the scenario schema, the editor and `UwbNetwork`, so the three cannot disagree.
 */
export function uwbM2mSlotFitNs(method: 'ss' | 'ds', initiators: number, responders: number): Ns {
  return uwbPpduNs(uwbM2mLongestBytes(method, Math.max(1, initiators), Math.max(1, responders)))
    + UWB_SLOT_GUARD_NS + UWB_TURNAROUND_NS
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

// --- Spectrum sensing based deferral (standard §10.45 — a P802.15.4ab **draft** clause; it does
// not exist in the published IEEE Std 802.15.4-2024, see the design doc's §0.1) -----------------

/** standard §10.45: the backoff factor's own upper bound (`minBf`, `maxBf`) **and** the backoff
 * unit's own upper bound (`unitBackoffUs`) — CID 489 widened both from 1…31 to 1…63 in the same
 * edit, so the scenario schema reuses one constant for both rather than naming the same CID's
 * number twice under two different field names. */
export const SSBD_BF_UNIT_MAX = 63
/** standard §10.45: NB's own range — how many busy CCAs the algorithm counts, within one attempt,
 * before `maxBackoffs` can end it. */
export const SSBD_MAX_BACKOFFS_MAX = 255

/**
 * `ssbdBoundNs`'s own inputs: the four PIB-style quantities §10.45 names (`docs/superpowers/specs/
 * 2026-10-03-ssbd-design.md` §4.1's five fields, minus `txOnEnd`, which this bound does not read —
 * it answers "how long can the algorithm run before it ends", and the ending it reaches at that
 * length is the same whichever way `txOnEnd` resolves it).
 *
 * `backoffMultiplier` and `ccaUs` are not configuration a session can set: they exist only so this
 * one function can also reproduce the TFD appendix's two stale examples under the premises CID 489/
 * 493 and CID 490/495 later overturned (`2 × BF` and a 1 µs CCA), as the contrast that shows why
 * they expired. A live `UwbMmsCfg.ssbd` never sets either.
 */
export interface SsbdBoundCfg {
  /** standard §10.45: backoff factor lower bound. */
  minBf: number
  /** standard §10.45: backoff factor upper bound (1…63, CID 489 widened it from 1…31). */
  maxBf: number
  /** standard §10.45: NB's own upper bound — how many busy CCAs the algorithm tolerates before
   * its end action fires. */
  maxBackoffs: number
  /** standard §10.45: one backoff unit, in microseconds (1…63). */
  unitBackoffUs: number
  /** The overturned `2 × BF` draw (CID 489/493 replaced it with `random(BF)`, i.e. a multiplier
   * of 1). Defaults to 1 — the current text — never 2. */
  backoffMultiplier?: 1 | 2
  /** The CCA duration, in microseconds. Defaults to the engine's own `NB_LBT_CCA_US` (CID 490/495
   * deleted the SSBD-specific `macSsbdCcaDuration` in favour of the PHY's `phyCcaDuration`, which
   * this engine already reads as `NB_LBT_CCA_US` for every other narrowband LBT check). */
  ccaUs?: number
}

/**
 * The algorithm's own worst-case latency (§1.2 of the design doc): every one of `maxBackoffs + 1`
 * CCA attempts goes busy, each one preceded by the longest backoff that attempt could possibly
 * draw. BF only ever grows (by 1 a busy check, clamped at `maxBf`), so attempt *i*'s longest
 * possible wait is `min(minBf + i, maxBf) × unitBackoffUs`, plus that attempt's own CCA.
 *
 * **Why this has to be computed rather than read off the standard's own appendix**: the TFD's two
 * published examples (46 µs at the defaults, 2.088 ms tuned) are stale. They reproduce only under
 * `backoffMultiplier: 2` and `ccaUs: 1` — the two premises CID 489/493 and CID 490/495
 * subsequently overturned — and under the text this engine actually implements (`random(BF)`, CCA
 * = `NB_LBT_CCA_US`) the default bound is 74 µs, not 46. Both numbers are this same function
 * called with different `cfg`, never two formulas.
 */
export function ssbdBoundNs(cfg: SsbdBoundCfg): Ns {
  const mult = cfg.backoffMultiplier ?? 1
  const ccaUs = cfg.ccaUs ?? NB_LBT_CCA_US
  let totalUs = 0
  for (let i = 0; i <= cfg.maxBackoffs; i++) {
    totalUs += mult * Math.min(cfg.minBf + i, cfg.maxBf) * cfg.unitBackoffUs + ccaUs
  }
  return totalUs * 1000
}

/**
 * The room one narrowband window (§10.45's CCA-and-backoff has to run inside, between two
 * narrowband messages) leaves once the message itself is paid for: `NB_WINDOW_SLOTS` slots of
 * `slotNs` each, less the PPDU the window actually carries.
 *
 * **The `max(0, …)` is a real configuration's answer, not a defensive floor.** `NB_WINDOW_SLOTS`
 * is a fixed 2 (`mms.ts`) and does not grow with the message a window carries, so a one-to-many
 * POLL at enough responders already overruns its own 1 ms window before any backoff is drawn at
 * all — the unclamped value is negative, and `ssbd`'s own caller has to know that rather than see
 * a silent 0 that looks the same as "no room left after a very long backoff".
 */
export function nbSlotSlackNs(slotNs: Ns, bytes: number): Ns {
  return Math.max(0, NB_WINDOW_SLOTS * slotNs - nbPpduNs(bytes))
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
