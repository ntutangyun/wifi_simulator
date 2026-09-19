import type { Material } from '../model/scenario'
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

/** Anchors one ranging round can carry. The Final is the round's longest frame and grows by
 * 12 octets per anchor; at 9 anchors it is 122 octets and at 10 it is 134, past the 127-octet
 * PSDU the PHR's frame-length field can express (standard §16.2.7). */
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
 * block-fit rule and `roundPlan` share this one definition. */
export function uwbSlotsPerTag(method: 'ss' | 'ds', anchors: number, schedule: 'time' | 'contention' = 'time', contentionSlots = 8): number {
  if (schedule === 'contention') return 1 + contentionSlots
  return method === 'ss' ? anchors + 1 : 2 * anchors + 2
}

/** Guard between the end of a slot's PPDU and the slot boundary: 200 ns is 60 m of flight (model). */
export const UWB_SLOT_GUARD_NS = 200

/** The shortest ranging slot a round with N anchors fits in: the round's longest PPDU (the
 * DS-TWR Final) plus the flight guard. In a shorter slot the receiver's deadline fires before
 * the frame lands, and the round loses every anchor to UWB_TIMEOUT with nothing to say why. */
export function uwbSlotFitNs(anchors: number): Ns {
  return uwbPpduNs(uwbFinalBytes(anchors)) + UWB_SLOT_GUARD_NS
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
