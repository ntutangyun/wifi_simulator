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

/**
 * Interframe timing of one link's PHY. 5/6 GHz run the clause 17 OFDM values
 * (the module constants above); 2.4 GHz runs clause 18 ERP-OFDM (Table 18-5):
 * aSIFSTime 10 µs, short slot 9 µs, and a 6 µs signal extension appended to
 * every PPDU (§10.3.8) so that clause 16 stations compute the NAV correctly.
 */
export interface PhyTiming {
  sifsNs: Ns
  slotNs: Ns
  difsNs: Ns
  rxStartDelayNs: Ns
  ackTimeoutNs: Ns
  /** aSignalExtension: no-transmission period counted in every PPDU's TXTIME (0 on 5/6 GHz). */
  signalExtNs: Ns
  eifsNs: Ns
}

export const CW_MIN = 15
export const CW_MAX = 1023
/** 802.11-2020 removed dot11LongRetryLimit: one per-MSDU retry limit applies to every frame. */
export const SHORT_RETRY_LIMIT = 7 // dot11ShortRetryLimit

export const CCA_ED_DBM = -62
export const CCA_PD_DBM = -82

/**
 * Receiver noise figure. The standard's minimum-sensitivity tables assume a
 * 10 dB noise figure plus a 5 dB implementation margin (§17.3.10.2 and the
 * clause 21/27/36 counterparts); a modern radio does better. 7 dB is ns-3's
 * WifiPhy RxNoiseFigure default.
 */
export const NOISE_FIGURE_DB = 7
/** Noise figure the standard's sensitivity tables are derived with. */
const STANDARD_NF_DB = 10
const KTB_DBM_PER_HZ = -174

/** Thermal noise in the received PPDU's bandwidth plus the receiver noise figure. */
export function noiseDbm(widthMhz = 20, nfDb = NOISE_FIGURE_DB): number {
  return KTB_DBM_PER_HZ + 10 * Math.log10(widthMhz * 1e6) + nfDb
}

/** The noise floor of a 20 MHz reception: −93.99 dBm. */
export const NOISE_DBM = noiseDbm(20)

export const MAC_HDR_BYTES = 24
export const FCS_BYTES = 4
export const ACK_BYTES = 14
export const RTS_BYTES = 20
export const CTS_BYTES = 14
export const CF_END_BYTES = 20 // FC + Duration + RA + BSSID + FCS

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

export const OFDM_5G: PhyTiming = {
  sifsNs: SIFS_NS, slotNs: SLOT_NS, difsNs: DIFS_NS, rxStartDelayNs: RX_START_DELAY_NS,
  ackTimeoutNs: ACK_TIMEOUT_NS, signalExtNs: 0, eifsNs: EIFS_NS,
}

const ERP_SIFS_NS: Ns = 10_000
const ERP_SIGNAL_EXT_NS: Ns = 6_000
const ERP_DIFS_NS: Ns = ERP_SIFS_NS + 2 * SLOT_NS // 28_000
export const ERP_2G: PhyTiming = {
  sifsNs: ERP_SIFS_NS, slotNs: SLOT_NS, difsNs: ERP_DIFS_NS,
  rxStartDelayNs: RX_START_DELAY_NS,
  ackTimeoutNs: ERP_SIFS_NS + SLOT_NS + RX_START_DELAY_NS,
  signalExtNs: ERP_SIGNAL_EXT_NS,
  eifsNs: ERP_SIFS_NS + ERP_DIFS_NS + ACK_TX_TIME_6M_NS + ERP_SIGNAL_EXT_NS,
}

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

/**
 * SINR a receiver needs to decode a clause-17 rate: the minimum sensitivity
 * with the standard's own noise assumption removed. What remains is the SNR
 * requirement plus the 5 dB implementation margin, which — being a receiver
 * impairment — applies to interference as much as to noise.
 */
export function sinrThreshDb(mbps: number): number {
  return rateInfo(mbps).sensDbm - noiseDbm(20, STANDARD_NF_DB)
}

// ---------------------------------------------------------------------------
// Multi-generation PHY modes (20 MHz, Nss = 1)
// nonht: clause 17 · vht: clause 21 (Wi-Fi 5) · he: clause 27 (Wi-Fi 6) ·
// eht: clause 36 via 802.11be-2024 (Wi-Fi 7, adds 4096-QAM MCS 12/13).
// Preambles are representative SU values; HE/EHT packet extension ignored.
// `symNs` is NOT a representative value — see its own comment on each entry.
// ---------------------------------------------------------------------------

export type PhyMode = 'nonht' | 'vht' | 'he' | 'eht'

export interface PhyModeInfo {
  /**
   * The whole preamble ahead of the data field, ns, at the 2x-LTF-and-base-GI tier.
   *
   * **For HE and EHT that tier is part of the value**, which nothing said until the guard
   * interval went in: adding Table 27-13's fields up gives 8 (L-STF) + 8 (L-LTF) + 4 (L-SIG)
   * + 4 (RL-SIG) + 8 (HE-SIG-A) + 4 (HE-STF) + 7.2 (one 2x HE-LTF) = 43.2 µs, and EHT trades
   * HE-SIG-A for U-SIG 8 + EHT-SIG 4 to reach 47.2 µs. The stored 44 / 48 are those sums
   * rounded up, so the relation is "≈" and not "="; `preambleNsFor(mode, TGI_NS.quad)` is
   * therefore the stored 44 plus `ltfExtraNs`'s 8.8 µs difference, not a figure Table 27-13
   * hands over directly.
   */
  preambleNs: Ns
  muExtraPreambleNs: Ns // HE-SIG-B / EHT-SIG extra for MU PPDUs
  /** One data OFDM symbol at the base guard interval; see each mode's entry for its table. */
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
    // symNs: T_DFT,Pre (3.2 µs) + the 800 ns long GI. standard §19.5 Table 19-6.
    // The 400 ns short GI is deliberately NOT built: §19.3.5 and Table 19-27's NOTE each say
    // in so many words that support for it is optional on transmit AND on receive, while all
    // three HE/EHT guard intervals are mandatory (§27.1.1 / §36.1.1). This slice builds only
    // the mandatory set — writing the clause down is not the same as building the feature.
    preambleNs: 20_000, muExtraPreambleNs: 0, symNs: 4_000,
    ndbps: RATES.map((r) => r.ndbps),
    sensDbm: RATES.map((r) => r.sensDbm),
    mbps: RATES.map((r) => r.mbps),
  },
  vht: {
    // symNs: T_DFT,Pre (3.2 µs) + the 800 ns long GI. standard §21.3.6 Table 21-5. Same note
    // about the optional 400 ns short GI as `nonht` above.
    preambleNs: 40_000, muExtraPreambleNs: 0, symNs: 4_000,
    ndbps: VHT_NDBPS, sensDbm: VHT_SENS,
    mbps: VHT_NDBPS.map((n) => n / 4), // 6.5 … 78
  },
  he: {
    // symNs: T_SYM1 of Table 27-13 — T_DFT,HE + T_GI1,Data = 12.8 + 0.8 µs, which is a sum the
    // table publishes and not a representative value this simulator picked. `symNsFor` makes
    // that explicit; this literal stays because six call sites read it (two of them inside
    // lesson builders that have no scenario in hand) and 47 test assertions name it.
    preambleNs: 44_000, muExtraPreambleNs: 4_000, symNs: 13_600,
    ndbps: HE_NDBPS, sensDbm: HE_SENS,
    // This is Table 27-86's FIRST rate column (0.8 µs GI); the table has three. See
    // `mcsRateMbps`, which serves the other two.
    mbps: HE_NDBPS.map((n) => Math.round((n / 13.6) * 10) / 10), // 8.6 … 143.4
  },
  eht: {
    // symNs: T_SYM1 of Table 36-18, the same sum as `he` above (12.8 + 0.8 µs).
    preambleNs: 48_000, muExtraPreambleNs: 4_000, symNs: 13_600,
    ndbps: EHT_NDBPS, sensDbm: EHT_SENS,
    // Table 36-76's first rate column (0.8 µs GI), as above.
    mbps: EHT_NDBPS.map((n) => Math.round((n / 13.6) * 10) / 10), // … 172.1
  },
}

// ---------------------------------------------------------------------------
// The data field's guard interval (design doc 2026-10-05-guard-interval §1, §3.1, §3.2)
//
// Six constants, every one of them with a table number and not one of them a `model` value.
// They exist because `PHY_MODES[*].symNs` stores only the SUM 13.6 µs, and turning the guard
// interval into a choice means having both addends.
// ---------------------------------------------------------------------------

/**
 * Data-field IDFT/DFT period of the HE and EHT PHYs (T_DFT,HE / T_DFT,EHT).
 * standard §27.3.9 Table 27-13 / standard be §36.3.10 Table 36-18
 */
export const TDFT_EHT_NS: Ns = 12_800

/**
 * The three data-field guard intervals TXVECTOR's GI_TYPE selects — T_GI1,Data, T_GI2,Data and
 * T_GI4,Data. Same tables. The enumeration itself (`0u8s_GI` / `1u6s_GI` / `3u2s_GI`) is in
 * standard §27.2 Table 27-1 / standard be §36.2 Table 36-1, and all three are mandatory to
 * support (§27.1.1 / §36.1.1), which is why this slice builds these and not clause 19's
 * optional 400 ns short GI.
 */
export const TGI_NS = { base: 800, double: 1_600, quad: 3_200 } as const

/** One 2x HE-LTF / EHT-LTF symbol, GI excluded. Same tables. */
export const TLTF_2X_NS: Ns = 6_400
/** One 4x HE-LTF / EHT-LTF symbol, GI excluded. Same tables. */
export const TLTF_4X_NS: Ns = 12_800

/**
 * The PPDU formats GI_TYPE is a TXVECTOR parameter of: FORMAT in
 * `HE_SU` / `HE_MU` / `HE_ER_SU` / `HE_TB` / `EHT_MU` / `EHT_TB`.
 * standard §27.2 Table 27-1 / standard be §36.2 Table 36-1
 *
 * **Why this is a second list rather than a reuse of `selBinnableGen`.** The two read the same
 * two entries today and answer different questions. `selBinnableGen`
 * (src/engine/selectivity.ts) asks about the SUBCARRIER SPACING — only 78.125 kHz resolves a
 * 26-tone RU. This asks whether the TXVECTOR even carries a `GI_TYPE` parameter. Folding them
 * into one list would tell the next person that changing one place is enough, and it is not:
 * either question could move without the other.
 */
export const GI_MODES: readonly PhyMode[] = ['he', 'eht']

/**
 * One data OFDM symbol at this mode and guard interval, ns: T_DFT + T_GI.
 *
 * **At the base GI this is exactly `PHY_MODES[mode].symNs`**, which is the point — that
 * literal becomes an ALIAS of this function rather than an independent fact, and
 * tests/engine/guard-interval.test.ts welds the two for all four modes. `symNs` stays a
 * literal because six places in `src/` read it, two of them lesson builders with no scenario
 * in hand (design §3.1).
 *
 * `nonht` and `vht` return their 4 µs unconditionally: clause 19's and clause 21's `GI_TYPE`
 * is the `LONG_GI` / `SHORT_GI` enumeration, not these three values at all.
 */
export function symNsFor(mode: PhyMode, giNs: Ns = TGI_NS.base): Ns {
  if (!GI_MODES.includes(mode)) return PHY_MODES[mode].symNs
  return TDFT_EHT_NS + giNs
}

/**
 * Extra preamble the 4x LTF costs, ns — 8 800, and **computed rather than measured**.
 *
 * §1.4 of the design: the mandatory-support lists of §27.1.1 / §36.1.1 and the sounding-NDP
 * rules of §26.7.5 / §35.7.5 pair the 2x LTF with the 0.8 and 1.6 µs guard intervals and the
 * 4x LTF with the 3.2 µs one. So choosing the quadruple GI also changes the LTF, and the one
 * training symbol grows from 6.4 + 0.8 to 12.8 + 3.2 µs. The engine therefore never emits
 * "3.2 µs GI with a 2x LTF" — that row exists only as arithmetic.
 */
export function ltfExtraNs(giNs: Ns = TGI_NS.base): Ns {
  if (giNs !== TGI_NS.quad) return 0
  return (TLTF_4X_NS + TGI_NS.quad) - (TLTF_2X_NS + TGI_NS.base)
}

/**
 * The preamble ahead of the data field at this mode and guard interval, ns.
 *
 * Only HE and EHT ever pay `ltfExtraNs`: the older two generations have no 4x LTF to switch
 * to. Note what this does NOT touch — `muExtraPreambleNs`. HE-SIG-B / EHT-SIG sit in the
 * legacy part of the preamble, whose GI is T_GI,Pre-HE / T_GI,Pre-EHT = 0.8 µs, fixed and
 * unrelated to the data field's (§1.1's closing paragraph).
 */
export function preambleNsFor(mode: PhyMode, giNs: Ns = TGI_NS.base): Ns {
  const extra = GI_MODES.includes(mode) ? ltfExtraNs(giNs) : 0
  return PHY_MODES[mode].preambleNs + extra
}

/**
 * Data subcarriers per channel width, from the standard. Airtime scales with
 * these, not with the width in MHz: 80 MHz carries slightly more than four
 * times a 20 MHz channel because the guard bands are not repeated.
 */
const TONES_HE: Record<number, number> = { 20: 234, 40: 468, 80: 980, 160: 1960, 320: 3920 }
const TONES_VHT: Record<number, number> = { 20: 52, 40: 108, 80: 234, 160: 468 }

/** Bits-per-symbol multiplier for a width, relative to that mode at 20 MHz. */
export function toneRatio(mode: PhyMode, widthMhz: number): number {
  if (mode === 'nonht') return 1
  const table = mode === 'vht' ? TONES_VHT : TONES_HE
  const tones = table[widthMhz]
  if (!tones) return 1
  return tones / table[20]
}


export interface TxTimeOpts {
  mu?: boolean
  /** RU fraction of the operating channel (1 = full, 0.5 ≈ half RU …). */
  ruFraction?: number
  /** Operating channel width in MHz (default 20). */
  widthMhz?: number
  /** Spatial streams (default 1). */
  nss?: number
  /** Data-field guard interval, ns (default `TGI_NS.base`, which reproduces today's figure). */
  giNs?: Ns
}

/** PPDU airtime for any PHY mode/MCS; symbol count uses width-, stream- and RU-scaled N_DBPS. */
export function txTimeModeNs(mode: PhyMode, lengthBytes: number, mcs: number, opts: TxTimeOpts = {}): Ns {
  const m = PHY_MODES[mode]
  const base = m.ndbps[mcs]
  if (!base) throw new Error(`invalid MCS ${mcs} for ${mode}`)
  const ndbps = base * toneRatio(mode, opts.widthMhz ?? 20) * (opts.nss ?? 1) * (opts.ruFraction ?? 1)
  const giNs = opts.giNs ?? TGI_NS.base
  const nsym = Math.ceil((16 + 8 * lengthBytes + 6) / ndbps)
  // The MU extra is neither scaled nor re-paid at a longer GI: see `preambleNsFor`.
  return preambleNsFor(mode, giNs) + (opts.mu ? m.muExtraPreambleNs : 0) + symNsFor(mode, giNs) * nsym
}

/** Link margin a rate ceiling keeps above the required SINR. */
export const RATE_MARGIN_DB = 3

/** Best MCS whose required SINR + margin fits the SNR at this width (floor: 0). */
export function mcsForRssi(mode: PhyMode, rssiDbm: number, maxMcs?: number, widthMhz = 20): number {
  const m = PHY_MODES[mode]
  const snr = rssiDbm - noiseDbm(widthMhz)
  const cap = maxMcs !== undefined ? Math.min(maxMcs, m.sensDbm.length - 1) : m.sensDbm.length - 1
  let best = 0
  for (let i = 0; i <= cap; i++) {
    if (snr >= reqSinrDb(mode, i) + RATE_MARGIN_DB) best = i
  }
  return best
}

function modeEntry(arr: number[], mode: PhyMode, mcs: number): number {
  const v = arr[mcs]
  if (v === undefined) throw new Error(`invalid MCS ${mcs} for ${mode}`)
  return v
}

/**
 * Data rate of this mode/MCS at this guard interval, Mb/s.
 *
 * **The standard publishes three rate columns, not one** — Table 27-86 (HE-MCSs for a 242-tone
 * RU, N_SS = 1) and Table 36-76 (the EHT equivalent) each carry `0.8 µs GI | 1.6 µs GI |
 * 3.2 µs GI`, and a 242-tone RU is 20 MHz at one stream, which is exactly what `PHY_MODES`
 * stores. So this is a lookup into a three-column table, not a question of whether to compute
 * the rate from `symNs`.
 * standard §27.5 Table 27-86 / standard be §36.5.6 Table 36-76
 *
 * **The base GI goes through the stored array rather than the formula, on purpose.** The two
 * have been measured to agree item for item for all four modes — including `nonht`'s literal
 * rate table and `vht`'s `n / 4` — but the lookup *guarantees* that a published lesson's rate
 * column does not move, instead of leaning on one float comparison holding. Do not simplify
 * this to the one-line expression.
 *
 * `Math.round(x * 10) / 10` is not this repo's convention either: §19.5 states in so many
 * words that Table 19-27's data rates are rounded to one decimal place.
 */
export function mcsRateMbps(mode: PhyMode, mcs: number, giNs: Ns = TGI_NS.base): number {
  if (giNs === TGI_NS.base) return modeEntry(PHY_MODES[mode].mbps, mode, mcs)
  const ndbps = modeEntry(PHY_MODES[mode].ndbps, mode, mcs)
  return Math.round((ndbps / (symNsFor(mode, giNs) / 1000)) * 10) / 10
}

/**
 * SINR required to decode mode/MCS, independent of channel width: a wider
 * channel costs range through noiseDbm(W), never extra margin over an
 * interferer. Minimum sensitivity (20 MHz) − kTB(20 MHz) − the standard's 10 dB NF.
 */
export function reqSinrDb(mode: PhyMode, mcs: number): number {
  return modeEntry(PHY_MODES[mode].sensDbm, mode, mcs) - noiseDbm(20, STANDARD_NF_DB)
}


/**
 * Non-HT reference rate per VHT/HE/EHT MCS: the clause-17 rate with the same
 * constellation and code rate; 64-QAM 5/6 and every denser constellation map
 * to 54 Mbps. Same mapping as ns-3's Ht/Vht/HePhy::CalculateNonHtReferenceRate.
 */
export const NONHT_REF_MBPS = [6, 12, 18, 24, 36, 48, 54, 54, 54, 54, 54, 54, 54, 54]

/** Control response rate: highest mandatory rate ≤ the eliciting PPDU's non-HT reference rate. */
export function ctrlRespRateForMode(mode: PhyMode, mcs: number, mbps: number): number {
  return ctrlRespRateFor(mode === 'nonht' ? mbps : modeEntry(NONHT_REF_MBPS, mode, mcs))
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

export function aifsNs(aifsn: number, T: PhyTiming = OFDM_5G): Ns {
  return T.sifsNs + aifsn * T.slotNs
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
export const MAX_PPDU_NS = 5_484_000 // aPPDUMaxTime (HT-MF/VHT/HE/EHT)
