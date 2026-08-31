/**
 * Clause 17 (OFDM PHY, 20 MHz, 5 GHz) timing and MAC constants.
 * All values verified against IEEE Std 802.11-2024:
 *  - §17.4.4 PHY characteristics: aSlotTime 9 µs, aSIFSTime 16 µs,
 *    aRxPHYStartDelay 20 µs, aCWmin 15, aCWmax 1023.
 *  - §10.3.2.3.5 DIFS = SIFS + 2·slot; §10.3.2.3.7 EIFS = SIFS + DIFS + ACKTxTime(lowest mandatory).
 *  - §10.3.2.9 AckTimeout = SIFS + slot + aRxPHYStartDelay.
 *  - §17.4.3 TXTIME = T_PREAMBLE(16) + T_SIGNAL(4) + T_SYM(4)·⌈(16 + 8·LENGTH + 6)/N_DBPS⌉.
 *  - Table 17-21 receiver minimum input level sensitivity (20 MHz).
 *  - §17.3.10.6 CCA: preamble detect −82 dBm, energy detect −62 dBm.
 */
import type { Ns } from '../model/types'

export const SLOT_NS: Ns = 9_000
export const SIFS_NS: Ns = 16_000
export const DIFS_NS: Ns = SIFS_NS + 2 * SLOT_NS // 34_000
export const RX_START_DELAY_NS: Ns = 20_000
export const ACK_TIMEOUT_NS: Ns = SIFS_NS + SLOT_NS + RX_START_DELAY_NS // 45_000
export const CTS_TIMEOUT_NS: Ns = ACK_TIMEOUT_NS

export const CW_MIN = 15
export const CW_MAX = 1023
export const SHORT_RETRY_LIMIT = 7 // dot11ShortRetryLimit
export const LONG_RETRY_LIMIT = 4 // dot11LongRetryLimit

export const CCA_ED_DBM = -62
export const CCA_PD_DBM = -82
export const NOISE_DBM = -95

export const MAC_HDR_BYTES = 24
export const FCS_BYTES = 4
export const ACK_BYTES = 14
export const RTS_BYTES = 20
export const CTS_BYTES = 14

const PREAMBLE_NS: Ns = 16_000
const SIGNAL_NS: Ns = 4_000
const SYM_NS: Ns = 4_000

export interface RateInfo {
  mbps: number
  ndbps: number
  sensDbm: number
}

/** Table 17-21 (20 MHz channel spacing). */
export const RATES: RateInfo[] = [
  { mbps: 6, ndbps: 24, sensDbm: -82 },
  { mbps: 9, ndbps: 36, sensDbm: -81 },
  { mbps: 12, ndbps: 48, sensDbm: -79 },
  { mbps: 18, ndbps: 72, sensDbm: -77 },
  { mbps: 24, ndbps: 96, sensDbm: -74 },
  { mbps: 36, ndbps: 144, sensDbm: -70 },
  { mbps: 48, ndbps: 192, sensDbm: -66 },
  { mbps: 54, ndbps: 216, sensDbm: -65 },
]

export const MANDATORY_MBPS = [6, 12, 24]

function rateInfo(mbps: number): RateInfo {
  const r = RATES.find((x) => x.mbps === mbps)
  if (!r) throw new Error(`unknown OFDM rate ${mbps} Mbps`)
  return r
}

/** Eq. 17-29 / 17-11: PPDU airtime for a PSDU of lengthBytes at an OFDM rate. */
export function txTimeNs(lengthBytes: number, mbps: number): Ns {
  const { ndbps } = rateInfo(mbps)
  const nsym = Math.ceil((16 + 8 * lengthBytes + 6) / ndbps)
  return PREAMBLE_NS + SIGNAL_NS + SYM_NS * nsym
}

export const ACK_TX_TIME_6M_NS: Ns = txTimeNs(ACK_BYTES, 6) // 44_000
export const EIFS_NS: Ns = SIFS_NS + DIFS_NS + ACK_TX_TIME_6M_NS // 94_000

/** Highest rate whose Table 17-21 sensitivity + 3 dB margin is met; floor 6 Mbps. */
export function dataRateFor(rssiDbm: number): number {
  let best = 6
  for (const r of RATES) {
    if (rssiDbm >= r.sensDbm + 3) best = r.mbps
  }
  return best
}

/** §10.6: control response at highest mandatory rate ≤ the eliciting frame's rate. */
export function ctrlRespRateFor(dataMbps: number): number {
  let best = MANDATORY_MBPS[0]
  for (const m of MANDATORY_MBPS) {
    if (m <= dataMbps) best = m
  }
  return best
}

/** Self-consistent SINR decode threshold: sensitivity referred to the −95 dBm noise floor. */
export function sinrThreshDb(mbps: number): number {
  return rateInfo(mbps).sensDbm - NOISE_DBM
}

// ---------------------------------------------------------------------------
// Multi-generation PHY modes (20 MHz, Nss = 1)
// nonht: clause 17 · vht: clause 21 (Wi-Fi 5) · he: clause 27 (Wi-Fi 6) ·
// eht: clause 36 via 802.11be-2024 (Wi-Fi 7, adds 4096-QAM MCS 12/13).
// Preambles are representative SU values; HE/EHT packet extension ignored.
// ---------------------------------------------------------------------------

export type PhyMode = 'nonht' | 'vht' | 'he' | 'eht'

export interface PhyModeInfo {
  preambleNs: Ns
  muExtraPreambleNs: Ns // HE-SIG-B / EHT-SIG extra for MU PPDUs
  symNs: Ns
  /** data bits per symbol per MCS index */
  ndbps: number[]
  /** minimum sensitivity per MCS index (dBm, 20 MHz) */
  sensDbm: number[]
  mbps: number[]
}

const VHT_NDBPS = [26, 52, 78, 104, 156, 208, 234, 260, 312]
const HE_NDBPS = [117, 234, 351, 468, 702, 936, 1053, 1170, 1404, 1560, 1755, 1950]
const EHT_NDBPS = [...HE_NDBPS, 2106, 2340]
const VHT_SENS = [-82, -79, -77, -74, -70, -66, -65, -64, -59]
const HE_SENS = [-82, -79, -77, -74, -70, -66, -65, -64, -59, -57, -54, -52]
const EHT_SENS = [...HE_SENS, -49, -46]

export const PHY_MODES: Record<PhyMode, PhyModeInfo> = {
  nonht: {
    preambleNs: 20_000, muExtraPreambleNs: 0, symNs: 4_000,
    ndbps: RATES.map((r) => r.ndbps),
    sensDbm: RATES.map((r) => r.sensDbm),
    mbps: RATES.map((r) => r.mbps),
  },
  vht: {
    preambleNs: 40_000, muExtraPreambleNs: 0, symNs: 4_000,
    ndbps: VHT_NDBPS, sensDbm: VHT_SENS,
    mbps: VHT_NDBPS.map((n) => n / 4), // 6.5 … 78
  },
  he: {
    preambleNs: 44_000, muExtraPreambleNs: 4_000, symNs: 13_600,
    ndbps: HE_NDBPS, sensDbm: HE_SENS,
    mbps: HE_NDBPS.map((n) => Math.round((n / 13.6) * 10) / 10), // 8.6 … 143.4
  },
  eht: {
    preambleNs: 48_000, muExtraPreambleNs: 4_000, symNs: 13_600,
    ndbps: EHT_NDBPS, sensDbm: EHT_SENS,
    mbps: EHT_NDBPS.map((n) => Math.round((n / 13.6) * 10) / 10), // … 172.1
  },
}

export interface TxTimeOpts {
  mu?: boolean
  /** RU fraction of the 20 MHz channel (1 = full, 0.5 ≈ half RU …). */
  ruFraction?: number
}

/** PPDU airtime for any PHY mode/MCS; symbol count uses RU-scaled N_DBPS. */
export function txTimeModeNs(mode: PhyMode, lengthBytes: number, mcs: number, opts: TxTimeOpts = {}): Ns {
  const m = PHY_MODES[mode]
  const ndbps = m.ndbps[mcs] * (opts.ruFraction ?? 1)
  if (!ndbps) throw new Error(`invalid MCS ${mcs} for ${mode}`)
  const nsym = Math.ceil((16 + 8 * lengthBytes + 6) / ndbps)
  return m.preambleNs + (opts.mu ? m.muExtraPreambleNs : 0) + m.symNs * nsym
}

/** Best MCS index whose sensitivity + 3 dB margin is met (floor: 0). */
export function mcsForRssi(mode: PhyMode, rssiDbm: number, maxMcs?: number): number {
  const m = PHY_MODES[mode]
  const cap = maxMcs !== undefined ? Math.min(maxMcs, m.sensDbm.length - 1) : m.sensDbm.length - 1
  let best = 0
  for (let i = 0; i <= cap; i++) {
    if (rssiDbm >= m.sensDbm[i] + 3) best = i
  }
  return best
}

export function mcsRateMbps(mode: PhyMode, mcs: number): number {
  return PHY_MODES[mode].mbps[mcs]
}

export function sinrThreshModeDb(mode: PhyMode, mcs: number): number {
  return PHY_MODES[mode].sensDbm[mcs] - NOISE_DBM
}

// EDCA defaults — 802.11-2024 Table 9-194, clause-17/19/21/27 PHY column.
export type AcIndex = 0 | 1 | 2 | 3 // BK, BE, VI, VO
export interface AcParams {
  ac: AcIndex
  name: 'BK' | 'BE' | 'VI' | 'VO'
  aifsn: number
  cwMin: number
  cwMax: number
  txopLimitNs: Ns
}
export const EDCA_PARAMS: AcParams[] = [
  { ac: 0, name: 'BK', aifsn: 7, cwMin: 15, cwMax: 1023, txopLimitNs: 2_528_000 },
  { ac: 1, name: 'BE', aifsn: 3, cwMin: 15, cwMax: 1023, txopLimitNs: 2_528_000 },
  { ac: 2, name: 'VI', aifsn: 2, cwMin: 7, cwMax: 15, txopLimitNs: 4_096_000 },
  { ac: 3, name: 'VO', aifsn: 2, cwMin: 3, cwMax: 7, txopLimitNs: 2_080_000 },
]
/** Legacy DCF modeled as a single pseudo-AC (AIFSN 2 ⇒ DIFS, no TXOP). */
export const DCF_PARAMS: AcParams = { ac: 1, name: 'BE', aifsn: 2, cwMin: CW_MIN, cwMax: CW_MAX, txopLimitNs: 0 }

export function aifsNs(aifsn: number): Ns {
  return SIFS_NS + aifsn * SLOT_NS
}

// Control/management frame sizes for v2 exchanges
export const BA_BYTES = 32 // compressed BlockAck
export function triggerBytes(nUsers: number): number {
  return 28 + 6 * nUsers // basic Trigger: hdr+common info + per-user info
}
export function multiStaBaBytes(nUsers: number): number {
  return 32 + 8 * Math.max(0, nUsers - 1)
}
export const AMPDU_DELIMITER_BYTES = 4
export const QOS_HDR_BYTES = 26
export const MAX_AMPDU_MPDUS = 64
export const MAX_PPDU_NS = 4_000_000 // aggregation duration cap (≈ aPPDUMaxTime)
