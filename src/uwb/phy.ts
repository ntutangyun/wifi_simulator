import type { Material, UwbMode } from '../model/scenario'
import type { Ns } from '../model/types'

// --- Chip, RCTU, RSTU units -------------------------------------------------

export const UWB_CHIP_HZ = 499.2e6 // standard §16.2.4 peak PRF
export const UWB_CHIP_NS = 1000 / 499.2 // standard §16.2.4: 2.003205 ns
export const RCTU_NS = UWB_CHIP_NS / 128 // standard §10.29.1.4: 2^-7 chip ≈ 15.650 ps
export const RCTU_PS = RCTU_NS * 1000 // standard §10.29.1.4
export const RSTU_CHIPS = 416 // standard §10.29.1.5, Table 10-145
export const RSTU_NS = RSTU_CHIPS * UWB_CHIP_NS // standard §10.29.1.5: 833.333 ns
export const C_M_PER_NS = 0.299792458 // physics
export const COUNTER_BITS = 40 // model (standard: "at minimum 32-bit")
export const COUNTER_MOD = 2 ** COUNTER_BITS // model

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

export function chipsToNs(chips: number): Ns {
  return Math.round((chips * 1000) / 499.2)
}

export function uwbPpduNs(octets: number): Ns {
  return chipsToNs(uwbPpduChips(octets))
}

// --- Channel / path loss -----------------------------------------------------

export type UwbChannelNo = 5 | 9
export const UWB_CHANNEL_MHZ: Record<UwbChannelNo, number> = { 5: 6489.6, 9: 7987.2 } // standard Table 11-9

/** Free-space path loss at 1 m: 20·log10(4π·f/c). standard Table 11-9 (frequencies) */
export function uwbPl0Db(ch: UwbChannelNo): number {
  const fHz = UWB_CHANNEL_MHZ[ch] * 1e6
  return 20 * Math.log10((4 * Math.PI * fHz) / (C_M_PER_NS * 1e9))
}

export const UWB_PL_EXP = 2.0 // model: indoor LOS
export const UWB_TX_POWER_DBM = -14 // model default (−41.3 dBm/MHz mean EIRP over 499.2 MHz)
export const UWB_RX_SENS_DBM = -93 // model
export const UWB_CAPTURE_DB = 6 // model
export const UWB_NLOS_NS: Record<Material, number> = { drywall: 0.5, brick: 2.0, glass: 0.2 } // model
export const UWB_PPM_MAX = 20 // standard §16.4.9: ±20 ppm

// --- 6 GHz coexistence: band edges and overlap arithmetic -----------------------

/** Each UWB channel's occupied band: centre ± 249.6 MHz (half of the 499.2 MHz channel
 * width). standard Table 11-9 */
export const UWB_BAND_MHZ: Record<UwbChannelNo, { lo: number; hi: number }> = {
  5: { lo: 6240.0, hi: 6739.2 },
  9: { lo: 7737.6, hi: 8236.8 },
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
/** One RMI entry in a Final: the responder's short address 2 + its round-trip time 4. */
export const RMI_FINAL_ENTRY_BYTES = 6
/** RMI IE in a measurement report: header + control 1 + address 2 + reply time 4 + round-trip time 4. */
export const RMI_REPORT_IE_BYTES = UWB_IE_HDR_BYTES + 11

/** The Poll's RDM IE: one entry per anchor, 3 + 3N octets. */
export function rdmIeBytes(anchors: number): number {
  return RDM_IE_FIXED_BYTES + RDM_ENTRY_BYTES * anchors
}

/** The Final's RMI IE: one entry per responder, 3 + 6N octets. */
export function rmiFinalIeBytes(anchors: number): number {
  return RMI_FINAL_FIXED_BYTES + RMI_FINAL_ENTRY_BYTES * anchors
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

/** MHR + RRMC IE + FCS, plus the RRTI IE that carries the reply time in SS-TWR: 20 (SS) / 14 (DS). */
export function uwbRespBytes(method: 'ss' | 'ds'): number {
  return UWB_MHR_BYTES + RRMC_IE_BYTES + (method === 'ss' ? RRTI_IE_BYTES : 0) + UWB_FCS_BYTES
}

/** MHR + RMI IE (3 + 6N) + N × RRTI IE 6 + FCS = 14 + 12N. */
export function uwbFinalBytes(anchors: number): number {
  return UWB_MHR_BYTES + rmiFinalIeBytes(anchors) + anchors * RRTI_IE_BYTES + UWB_FCS_BYTES
}

/** MHR + the report's RMI IE 13 + FCS. */
export const UWB_REPORT_BYTES = UWB_MHR_BYTES + RMI_REPORT_IE_BYTES + UWB_FCS_BYTES

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

/** DL-TDoA TX-time IE (model; the RMI-style content of §10.29.8.4): header + the sender's own
 * TX counter, one 4-octet ranging time. */
export const DL_TX_TIME_IE_BYTES = UWB_IE_HDR_BYTES + 4
/** DL-TDoA RX-times IE (model): header + one 4-octet RX counter per time carried. The times are
 * listed in the round's slot order — the Poll's RDM IE already says who sits in which slot — so
 * no address rides along with them. */
export function dlRxTimesIeBytes(times: number): number {
  return UWB_IE_HDR_BYTES + 4 * times
}
/** DL-TDoA clock-offset IE (model): header + a 16-bit carrier frequency offset, the responder's
 * clock offset to anchor 0 that puts its reply time on anchor 0's timebase. */
export const DL_COFFS_IE_BYTES = UWB_IE_HDR_BYTES + 2

/** The DL-TDoA content a message adds to its two-way-ranging shape: the sender's TX time, the
 * RX times it holds (none on the Poll: it opens the round) and, on a Response, its clock offset.
 * One definition, so the builders and the decoder cannot size the same frame differently. */
export function dlExtraBytes(rxTimes: number, coffs: boolean): number {
  return DL_TX_TIME_IE_BYTES + (rxTimes > 0 ? dlRxTimesIeBytes(rxTimes) : 0) + (coffs ? DL_COFFS_IE_BYTES : 0)
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

/** Anchors one ranging round can carry. In two-way ranging the Final is the round's longest
 * frame and grows by 12 octets per anchor; at 9 anchors it is 122 octets and at 10 it is 134,
 * past the 127-octet PSDU the PHR's frame-length field can express (standard §16.2.7). The
 * one-way modes are bounded by the same number, which is conservative for them: their longest
 * frame is the DL-TDoA Poll at 33 + 3R octets (57 at nine anchors), less than half the limit. */
export const UWB_MAX_ANCHORS = 9

// --- Ranging schedule units ----------------------------------------------------

/** Ranging slot/block time units to nanoseconds: 1 RSTU = 416 chips at 499.2 Mchip/s
 * (standard §10.29.1.5, Table 10-145). Lives here, with the chip, so that the scenario
 * schema and the session scheduler measure a slot with one and the same function. */
export function rstuNs(rstu: number): Ns {
  return Math.round((rstu * RSTU_CHIPS * 1000) / 499.2)
}

/** Ranging slots one tag needs per round: poll + one response each (SS), plus final + one
 * report each (DS); a contention round (schedule mode 0, standard §10.32.2) instead reserves
 * poll + a fixed response-phase window of `contentionSlots` slots any anchor may answer in
 * (`contentionSlots` 8 is a model default, the RCPS IE's response-phase window). The schema's
 * block-fit rule and `roundPlan` share this one definition.
 *
 * One-way ranging counts its slots differently, because the tag is not what the round is built
 * around: a DL-TDoA round is the anchors' own (Poll + N−1 Responses + Final = N + 1 slots) and
 * every tag in the scenario listens to that same round, while a UL-TDoA round is one blink slot
 * and belongs to one tag. */
export function uwbSlotsPerTag(
  method: 'ss' | 'ds', anchors: number, schedule: 'time' | 'contention' = 'time', contentionSlots = 8,
  mode: UwbMode = 'twr',
): number {
  if (mode === 'ul-tdoa') return 1
  if (mode === 'dl-tdoa') return anchors + 1
  if (schedule === 'contention') return 1 + contentionSlots
  return method === 'ss' ? anchors + 1 : 2 * anchors + 2
}

/** Guard between the end of a slot's PPDU and the slot boundary: 200 ns is 60 m of flight (model). */
export const UWB_SLOT_GUARD_NS = 200

/** The round's longest frame, in octets: the Final in two-way ranging, the longer of the
 * Poll and the Final in DL-TDoA (the Poll's RDM IE grows by 3 per responder, the Final's RX
 * times by 4), and the blink — the only frame there is — in UL-TDoA. */
export function uwbLongestFrameBytes(anchors: number, mode: UwbMode = 'twr'): number {
  if (mode === 'ul-tdoa') return UWB_BLINK_BYTES
  if (mode === 'dl-tdoa') {
    return Math.max(uwbDlPollBytes(anchors - 1), uwbDlRespBytes(), uwbDlFinalBytes(anchors - 1))
  }
  return uwbFinalBytes(anchors)
}

/** The shortest ranging slot a round with N anchors fits in: the round's longest PPDU plus the
 * flight guard. In a shorter slot the receiver's deadline fires before the frame lands, and the
 * round loses every anchor to UWB_TIMEOUT with nothing to say why. */
export function uwbSlotFitNs(anchors: number, mode: UwbMode = 'twr'): Ns {
  return uwbPpduNs(uwbLongestFrameBytes(anchors, mode)) + UWB_SLOT_GUARD_NS
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
