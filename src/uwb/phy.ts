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

// --- Frame sizes --------------------------------------------------------------

export const UWB_MHR_BYTES = 9 // standard frame format; short addressing (model)
export const UWB_FCS_BYTES = 2 // standard frame format; short addressing (model)
export const UWB_IE_HDR_BYTES = 2 // standard frame format; short addressing (model)
export const ARC_IE_BYTES = 10 // model sizing from the IE field lists
export const RRMC_IE_BYTES = 3 // model sizing from the IE field lists
export const RRTI_IE_BYTES = 6 // model sizing from the IE field lists
export const RMI_FINAL_ENTRY_BYTES = 6 // model
export const RMI_REPORT_IE_BYTES = 13 // model

export function rdmIeBytes(anchors: number): number {
  return 3 + 3 * anchors
}

export function rmiFinalIeBytes(anchors: number): number {
  return 3 + 6 * anchors
}

export function uwbPollBytes(anchors: number): number {
  return 27 + 3 * anchors
}

export function uwbRespBytes(method: 'ss' | 'ds'): number {
  return method === 'ss' ? 20 : 14
}

/** MHR 9 + RMI IE (3 + 6N) + N × RRTI IE 6 + FCS 2 = 14 + 12N. */
export function uwbFinalBytes(anchors: number): number {
  return 14 + 12 * anchors
}

export const UWB_REPORT_BYTES = 24

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
  const { levelPct, intervalNs } = fomDecode(fom)
  return `${levelPct} % within ${intervalNs} ns`
}
