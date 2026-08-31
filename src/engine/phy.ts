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
