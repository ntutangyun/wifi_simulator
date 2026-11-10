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
/** aRxPHYStartDelay of the clause 17 OFDM PHY (Table 17-21's companion, §17.4.4). */
export const RX_START_DELAY_NS: Ns = 20_000
/** AckTimeout of a clause 17 STA: aSIFSTime + aSlotTime + aRxPHYStartDelay (§10.3.2.11). */
export const ACK_TIMEOUT_NS: Ns = SIFS_NS + SLOT_NS + RX_START_DELAY_NS // 45_000
export const CTS_TIMEOUT_NS: Ns = ACK_TIMEOUT_NS

/**
 * aRxPHYStartDelay of the HT, VHT and HE PHYs: 24 µs.
 * standard Table 19-25 (HT) / Table 21-28 (VHT) / Table 27-61 (HE)
 */
export const RX_START_DELAY_HT_NS: Ns = 24_000
/**
 * aRxPHYStartDelay of an EHT TB PPDU: 32 µs. An EHT MU PPDU's is 32 + 4 × N_EHT-SIG µs.
 * standard be Table 36-70
 */
export const RX_START_DELAY_EHT_TB_NS: Ns = 32_000

/**
 * Interframe timing of one STA's PHY on one link. 5/6 GHz run the clause 17 OFDM values
 * (the module constants above); 2.4 GHz runs clause 18 ERP-OFDM (Table 18-5):
 * aSIFSTime 10 µs, short slot 9 µs, and a 6 µs signal extension appended to
 * every PPDU (§10.3.8) so that clause 16 stations compute the NAV correctly.
 *
 * **aRxPHYStartDelay is the STA's, not the link's** (2026-11-11). §6.7.4.4: "The MAC determines
 * aRxPHYStartDelay by excluding values of aRxPHYStartDelay for each supported PHY clause that are
 * not allowed in the current context, then setting aRxPHYStartDelay to the maximum of the
 * remaining values." So it depends on which PHY clauses the STA supports (its generation) and on
 * which PPDU formats the awaited PPDU may legally arrive in (the context) — see `timingForGen`.
 */
export interface PhyTiming {
  sifsNs: Ns
  slotNs: Ns
  difsNs: Ns
  /**
   * aRxPHYStartDelay while awaiting a control response (Ack, BlockAck, CTS, Multi-STA BlockAck):
   * the response is a non-HT (duplicate) PPDU (§10.6), so the clause 36 values, which Table 36-70
   * lists only for EHT MU and EHT TB PPDUs, are excluded and the maximum of the rest remains.
   */
  rxStartDelayNs: Ns
  /** AckTimeout = CTSTimeout = aSIFSTime + aSlotTime + `rxStartDelayNs` (§10.3.2.9, §10.3.2.11). */
  ackTimeoutNs: Ns
  /**
   * aRxPHYStartDelay when the awaited PPDU may be any format this STA supports — the data PPDU
   * the NAV-reset rule of §10.3.2.4 waits for after an RTS. For an EHT STA that admits the EHT MU
   * PPDU's 32 + 4 × N_EHT-SIG µs (Table 36-70) with this engine's N_EHT-SIG (`EHT_SIG_SYMBOLS_SU`).
   */
  rxStartDelayAnyNs: Ns
  /**
   * aRxPHYStartDelay while an AP awaits EHT TB PPDUs after a Trigger frame: max(24, 32) µs for an
   * EHT AP (Table 36-70), the HE value for an HE AP. Only an AP of generation `eht`/`uhr` differs.
   */
  rxStartDelayTbNs: Ns
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
/**
 * EIFS on 5/6 GHz: aSIFSTime + AckTxTime + DIFS (Eq 10-7), AckTxTime at the lowest PHY mandatory
 * rate — 6 Mb/s for clause 17 and for every later PHY in the 5/6 GHz bands.
 */
export const EIFS_NS: Ns = SIFS_NS + DIFS_NS + ACK_TX_TIME_6M_NS // 94_000

/**
 * An Ack frame at 1 Mb/s DSSS with the long PLCP preamble: 192 µs of preamble and header
 * (aRxPHYStartDelay of Table 15-4 / Table 18-5) plus 14 octets × 8 µs. Table 10-8 lists the same
 * 304 µs for a 1 Mb/s Ack. Every 2.4 GHz STA here is an ERP STA, for which 1 Mb/s DSSS is the
 * lowest mandatory rate (clause 18), so Eq 10-7's AckTxTime is this figure on 2.4 GHz.
 */
export const ACK_TX_TIME_1M_DSSS_NS: Ns = 192_000 + ACK_BYTES * 8 * 1_000 // 304_000

export const OFDM_5G: PhyTiming = {
  sifsNs: SIFS_NS, slotNs: SLOT_NS, difsNs: DIFS_NS, rxStartDelayNs: RX_START_DELAY_NS,
  ackTimeoutNs: ACK_TIMEOUT_NS, rxStartDelayAnyNs: RX_START_DELAY_NS, rxStartDelayTbNs: RX_START_DELAY_NS,
  signalExtNs: 0, eifsNs: EIFS_NS,
}

const ERP_SIFS_NS: Ns = 10_000
const ERP_SIGNAL_EXT_NS: Ns = 6_000
const ERP_DIFS_NS: Ns = ERP_SIFS_NS + 2 * SLOT_NS // 28_000
export const ERP_2G: PhyTiming = {
  sifsNs: ERP_SIFS_NS, slotNs: SLOT_NS, difsNs: ERP_DIFS_NS,
  // ERP-OFDM's 20 µs (Table 18-5): the response to an ERP-OFDM PPDU is an ERP-OFDM PPDU (§10.6),
  // so the DSSS/CCK values (192 / 96 µs) are not allowed in this context.
  rxStartDelayNs: RX_START_DELAY_NS,
  ackTimeoutNs: ERP_SIFS_NS + SLOT_NS + RX_START_DELAY_NS,
  rxStartDelayAnyNs: RX_START_DELAY_NS, rxStartDelayTbNs: RX_START_DELAY_NS,
  signalExtNs: ERP_SIGNAL_EXT_NS,
  // 2026-11-11: Eq 10-7 at the lowest mandatory rate of the ERP PHY, 1 Mb/s DSSS — 10 + 304 + 28 =
  // 342 µs. It used to price the Ack at 6 Mb/s ERP-OFDM (88 µs), which is not the lowest rate.
  eifsNs: ERP_SIFS_NS + ERP_DIFS_NS + ACK_TX_TIME_1M_DSSS_NS,
}

/**
 * A STA's interframe timing on a link: the band's constants plus aRxPHYStartDelay for the PHY
 * clauses that STA supports (§6.7.4.4).
 *
 *  - `nonht` supports clause 17 (or clause 18 ERP on 2.4 GHz) only: 20 µs everywhere.
 *  - `vht` / `he` also support clause 19 (an HT PHY is mandatory for both), whose 24 µs
 *    (Table 19-25) is the maximum in every context — Table 21-28 and Table 27-61 say 24 µs too.
 *  - `eht` adds Table 36-70, which lists aRxPHYStartDelay only for EHT MU PPDUs
 *    (32 + 4 × N_EHT-SIG µs) and EHT TB PPDUs (32 µs). Neither format is allowed while a non-HT
 *    control response is awaited, so the Ack context stays 24 µs; awaiting EHT TB PPDUs it is
 *    32 µs; awaiting any PPDU it is 32 + 4 × `EHT_SIG_SYMBOLS_SU` = 40 µs.
 *  - `uhr` is a draft (P802.11bn) with no PHY characteristics table: EHT's values, reused.
 */
export function timingForGen(base: PhyTiming, gen: PhyMode): PhyTiming {
  if (gen === 'nonht') return base
  const ack = RX_START_DELAY_HT_NS
  const eht = gen === 'eht' || gen === 'uhr'
  return {
    ...base,
    rxStartDelayNs: ack,
    ackTimeoutNs: base.sifsNs + base.slotNs + ack,
    rxStartDelayAnyNs: eht ? RX_START_DELAY_EHT_TB_NS + EHT_SIG_SYMBOLS_SU * EHT_SIG_SYM_NS : ack,
    rxStartDelayTbNs: eht ? RX_START_DELAY_EHT_TB_NS : ack,
  }
}

/** Largest Duration value, in microseconds, the Duration/ID field carries (§9.2.4.2, Table 9-9). */
export const DURATION_MAX_US = 32_767

/**
 * The Duration field as transmitted, ns: whole microseconds, a fractional microsecond rounded up
 * to the next integer — the frame-format clauses say it each time, e.g. §9.3.1.2 (RTS) and
 * §9.3.2.1 (Data): "If the calculated duration includes a fractional microsecond, that value is
 * rounded up to the next higher integer" — and never above 32 767 µs (Table 9-9). 0 stays 0.
 */
export function durationFieldValueNs(ns: Ns): Ns {
  if (ns <= 0) return 0
  return Math.min(DURATION_MAX_US, Math.ceil(ns / 1000 - 1e-9)) * 1000
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
// eht: clause 36 via 802.11be-2024 (Wi-Fi 7, adds 4096-QAM MCS 12/13) ·
// uhr: P802.11bn SFD r19 (Wi-Fi 8, DRAFT — see `UHR_*` below).
// Preambles and TXTIME are computed from the standard's fields: see `ppduTiming`.
// `symNs` is NOT a representative value — see its own comment on each entry.
// ---------------------------------------------------------------------------

export type PhyMode = 'nonht' | 'vht' | 'he' | 'eht' | 'uhr'

export interface PhyModeInfo {
  /**
   * The whole preamble ahead of the data field, ns, of a one-stream PPDU at the base GI — exactly
   * `preambleNsFor(mode)`, which computes it field by field (2026-11-11; it used to be 44 / 48
   * µs, sums rounded up). HE: 8 (L-STF) + 8 (L-LTF) + 4 (L-SIG) + 4 (RL-SIG) + 8 (HE-SIG-A)
   * + 4 (HE-STF) + 7.2 (one 2x HE-LTF at 0.8 µs GI) = 43.2 µs, standard Table 27-13 / Eq 27-121.
   * EHT: the same with U-SIG 8 and two EHT-SIG symbols of 4 µs in place of HE-SIG-A = 51.2 µs,
   * standard be Table 36-18 / Eq 36-97. VHT: 36 + 4 µs per VHT-LTF = 40 µs (Table 21-5).
   */
  preambleNs: Ns
  /**
   * Extra signalling a DL MU PPDU carries over the SU one, ns: one HE-SIG-B symbol / one more
   * EHT-SIG symbol (4 µs, T_HE-SIG-B / T_EHT-SIG). The standard's N_HE-SIG-B / N_EHT-SIG follows
   * from the RU Allocation subfields and User fields of the round (§27.3.11.8, §36.3.12.8); this
   * engine's even RU split has no RU Allocation subfield to count, so the MU extra stays one symbol.
   */
  muExtraPreambleNs: Ns
  /** One data OFDM symbol at the base guard interval; see each mode's entry for its table. */
  symNs: Ns
  /** data bits per symbol per MCS index */
  ndbps: number[]
  /** minimum sensitivity per MCS index (dBm, 20 MHz) */
  sensDbm: number[]
  mbps: number[]
  /**
   * Lowest MCS index of this mode that is 4096-QAM, or `undefined` if the mode has none.
   *
   * It exists because the `qam4k` capability flag is negotiated per link and the ceiling it
   * imposes is "everything below 4096-QAM" — an index, and NOT the same index in every mode:
   * 12 in `eht`, 16 in `uhr`, because `uhr` interleaves four new rungs below them. The literal
   * 11 that used to live in `src/engine/simulation.ts` was that index minus one, written once
   * for the only mode that then had a 4096-QAM rung.
   */
  qam4kFromMcs?: number
  /**
   * Clause-17 reference rate per MCS index, Mb/s — the column `ctrlRespRateForMode` reads.
   *
   * Per mode rather than one shared array because `uhr`'s indices do not mean what the other
   * modes' indices mean: `uhr` index 3 is QPSK 3/4 where `he` index 3 is 16-QAM 1/2.
   */
  nonhtRefMbps: number[]
}

const VHT_NDBPS = [26, 52, 78, 104, 156, 208, 234, 260, 312]
const HE_NDBPS = [117, 234, 351, 468, 702, 936, 1053, 1170, 1404, 1560, 1755, 1950]
const EHT_NDBPS = [...HE_NDBPS, 2106, 2340]
const VHT_SENS = [-82, -79, -77, -74, -70, -66, -65, -64, -59]
const HE_SENS = [-82, -79, -77, -74, -70, -66, -65, -64, -59, -57, -54, -52]
const EHT_SENS = [...HE_SENS, -49, -46]

// ---------------------------------------------------------------------------
// UHR (P802.11bn / Wi-Fi 8) — **a draft, and the only four numbers this mode
// claims from it are the four new rungs' sensitivities.**
//
// TGbn SFD r19, document `11-24/0209r19`:
//  - Motion #42 adds the modulation/code-rate combinations {QPSK, 16-QAM,
//    256-QAM} at R = 2/3 and 16-QAM at R = 5/6; Motion #216 makes those four
//    mandatory to support (with 256-QAM 2/3 OPTIONAL on a 20 MHz-only device,
//    which this 20 MHz engine therefore models as the optimistic end).
//  - Motion #417 publishes the receiver minimum input sensitivity column for
//    them: SFD MCS 17 / 19 / 20 / 23 at −78 / −71 / −69 / −60 dBm for a 20 MHz
//    PPDU. That is the SAME column `sensDbm` already stores, and its seven rows
//    for existing MCSs (1, 2, 3, 4, 5, 7, 8 at −79 / −77 / −74 / −70 / −66 /
//    −64 / −59) agree with `HE_SENS` and `EHT_SENS` row for row, 7 of 7.
//  - N_DBPS is not read out of the draft at all: it is 234 data tones × bits
//    per tone × code rate, an identity that holds for all fourteen existing
//    rungs (14/14, pinned in tests/engine/uhr-ladder.test.ts), so the four new
//    ones are 312 / 624 / 780 / 1248 — integers, nothing rounded.
//
// **Everything else about this mode is EHT's published value, reused and said
// so.** SFD r19 publishes no UHR preamble field lengths, no UHR T_DFT and no
// UHR guard-interval enumeration, so `preambleNs`, `muExtraPreambleNs` and
// `symNs` below are EHT's 51 200 / 4 000 / 13 600 by reuse — not a Wi-Fi 8
// figure, and not a figure this slice made up. The consequence is the point:
// a `uhr` link and an `eht` link differ in their RATE LADDER AND IN NOTHING
// ELSE, which is what makes an A/B between them a measurement of the ladder.
//
// **Why the ladder is interleaved and not appended.** `mcsForRssi` returns the
// HIGHEST INDEX whose required SINR fits, so the array has to rise in
// sensitivity with the index or that loop silently picks a slower rung. Sorted
// by sensitivity, the merged eighteen rungs rise STRICTLY in sensitivity AND
// strictly in N_DBPS — no inversion anywhere — which is what makes the
// interleave safe. The price is that a `uhr` index is not the SFD's MCS number:
// `UHR_SFD_MCS` below is that translation, and it is data, never arithmetic.
// ---------------------------------------------------------------------------

/** SFD r19's own MCS number per `uhr` index. Draft numbering; see the block above. */
export const UHR_SFD_MCS = [0, 1, 17, 2, 3, 19, 4, 20, 5, 6, 7, 23, 8, 9, 10, 11, 12, 13]
const UHR_NDBPS = [117, 234, 312, 351, 468, 624, 702, 780, 936, 1053, 1170, 1248, 1404, 1560, 1755, 1950, 2106, 2340]
const UHR_SENS = [-82, -79, -78, -77, -74, -71, -70, -69, -66, -65, -64, -60, -59, -57, -54, -52, -49, -46]

/**
 * Non-HT reference rate per VHT/HE/EHT MCS: the clause-17 rate with the same
 * constellation and code rate; 64-QAM 5/6 and every denser constellation map
 * to 54 Mbps. Same mapping as ns-3's Ht/Vht/HePhy::CalculateNonHtReferenceRate.
 */
export const NONHT_REF_MBPS = [6, 12, 18, 24, 36, 48, 54, 54, 54, 54, 54, 54, 54, 54]

/**
 * The same column for `uhr`'s eighteen interleaved indices.
 *
 * **SFD r19 publishes no non-HT reference rate for the four new MCSs, and this slice invents
 * none.** The rule above is restated once, unchanged, and applied: *the clause-17 rate using the
 * same constellation whose code rate does not exceed this rung's*. QPSK 2/3 → 12 (QPSK 1/2),
 * 16-QAM 2/3 → 24 (16-QAM 1/2), 16-QAM 5/6 → 36 (16-QAM 3/4), 256-QAM 2/3 → 54 (denser than
 * clause 17 goes). That rule reproduces all fourteen existing entries of `NONHT_REF_MBPS` item
 * for item, so it is the repo's own rule and not a second one.
 *
 * **And the choice is not observable anyway, which is the reason this is allowed to be a
 * derivation at all.** The only consumer is `ctrlRespRateForMode`, which floors the value onto
 * `MANDATORY_MBPS = [6, 12, 24]`. Each new rung's plausible bracket — 12…18 for QPSK 2/3,
 * 24…36 for 16-QAM 2/3, 36…48 for 16-QAM 5/6 — floors to one and the same control-response rate
 * at BOTH ends. tests/engine/uhr-ladder.test.ts walks every candidate in every bracket and
 * pins that the answer never moves, so no number here is doing load-bearing work.
 */
const UHR_NONHT_REF_MBPS = [6, 12, 12, 18, 24, 24, 36, 36, 48, 54, 54, 54, 54, 54, 54, 54, 54, 54]

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
    // A clause-17 rate IS its own non-HT reference rate; `ctrlRespRateForMode` short-circuits
    // this mode and reads the frame's own `mbps` instead, so this column is the identity.
    nonhtRefMbps: RATES.map((r) => r.mbps),
  },
  vht: {
    // symNs: T_DFT,Pre (3.2 µs) + the 800 ns long GI. standard §21.3.6 Table 21-5. Same note
    // about the optional 400 ns short GI as `nonht` above.
    preambleNs: 40_000, muExtraPreambleNs: 0, symNs: 4_000,
    ndbps: VHT_NDBPS, sensDbm: VHT_SENS,
    mbps: VHT_NDBPS.map((n) => n / 4), // 6.5 … 78
    nonhtRefMbps: NONHT_REF_MBPS,
  },
  he: {
    // symNs: T_SYM1 of Table 27-13 — T_DFT,HE + T_GI1,Data = 12.8 + 0.8 µs, which is a sum the
    // table publishes and not a representative value this simulator picked. `symNsFor` makes
    // that explicit; this literal stays because six call sites read it (two of them inside
    // lesson builders that have no scenario in hand) and 47 test assertions name it.
    preambleNs: 43_200, muExtraPreambleNs: 4_000, symNs: 13_600,
    ndbps: HE_NDBPS, sensDbm: HE_SENS,
    // This is Table 27-86's FIRST rate column (0.8 µs GI); the table has three. See
    // `mcsRateMbps`, which serves the other two.
    mbps: HE_NDBPS.map((n) => Math.round((n / 13.6) * 10) / 10), // 8.6 … 143.4
    nonhtRefMbps: NONHT_REF_MBPS,
  },
  eht: {
    // symNs: T_SYM1 of Table 36-18, the same sum as `he` above (12.8 + 0.8 µs).
    preambleNs: 51_200, muExtraPreambleNs: 4_000, symNs: 13_600,
    ndbps: EHT_NDBPS, sensDbm: EHT_SENS,
    // Table 36-76's first rate column (0.8 µs GI), as above.
    mbps: EHT_NDBPS.map((n) => Math.round((n / 13.6) * 10) / 10), // … 172.1
    nonhtRefMbps: NONHT_REF_MBPS, qam4kFromMcs: 12,
  },
  uhr: {
    // **Draft mode.** preambleNs / muExtraPreambleNs / symNs are EHT's figures REUSED, because
    // SFD r19 publishes no UHR preamble field lengths and no UHR T_DFT — see the UHR_* block
    // above. Reusing a published number and saying so is not the same as inventing one, and
    // tests/engine/uhr-ladder.test.ts welds these three to `eht`'s so they cannot drift into
    // looking like Wi-Fi 8 measurements.
    preambleNs: 51_200, muExtraPreambleNs: 4_000, symNs: 13_600,
    ndbps: UHR_NDBPS, sensDbm: UHR_SENS,
    // Same arithmetic as `he` / `eht`'s first rate column: N_DBPS over the 13.6 µs symbol.
    mbps: UHR_NDBPS.map((n) => Math.round((n / 13.6) * 10) / 10), // 8.6 … 172.1
    nonhtRefMbps: UHR_NONHT_REF_MBPS, qam4kFromMcs: 16,
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
 *
 * **`'uhr'` is deliberately NOT here, and that is criterion 2 and not an oversight.** These six
 * constants each carry a table number; TGbn SFD r19 publishes no UHR guard-interval enumeration,
 * no UHR T_DFT and no statement that the UHR data field reuses EHT's numerology. Putting `uhr`
 * in this list would mean asserting T_DFT,UHR = 12.8 µs from nothing, which is exactly the kind
 * of constant `docs/wifi-course-backlog.md` keeps out of the engine. So a `uhr`-only scene that
 * sets `guardInterval` is refused — see `guardIntervalRefusals` (src/model/scenario.ts), whose
 * message names this reason rather than pretending `uhr` is too old to have one.
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
 * is the `LONG_GI` / `SHORT_GI` enumeration, not these three values at all. `uhr` returns its
 * stored 13.6 µs unconditionally too, for the opposite reason — no published UHR enumeration to
 * read; see `GI_MODES`.
 */
export function symNsFor(mode: PhyMode, giNs: Ns = TGI_NS.base): Ns {
  if (!GI_MODES.includes(mode)) return PHY_MODES[mode].symNs
  return TDFT_EHT_NS + giNs
}

/**
 * One HE-LTF / EHT-LTF symbol including its GI, ns: T_HE-LTF-SYM = T_HE-LTF + T_GI,HE-LTF, where
 * T_GI,HE-LTF is the data field's GI ("same as T_GI,Data").
 * standard Table 27-13 / standard be Table 36-18
 *
 * The LTF type follows the GI the way Table 27-32 / Table 36-44 pair them and this engine builds:
 * 2x LTF with the 0.8 µs and 1.6 µs GIs (7.2 / 8.0 µs), 4x LTF with the 3.2 µs GI (16.0 µs).
 */
export function ltfSymNs(giNs: Ns = TGI_NS.base): Ns {
  return (giNs === TGI_NS.quad ? TLTF_4X_NS : TLTF_2X_NS) + giNs
}

/**
 * How much longer one LTF symbol is at this GI than at the base GI, ns: 0 / 800 / 8 800.
 *
 * 2026-11-11: the 1.6 µs GI used to cost nothing here. Table 27-13 says T_GI,HE-LTF equals the
 * data GI, so a 2x LTF at 1.6 µs is 6.4 + 1.6 = 8.0 µs, not 7.2.
 */
export function ltfExtraNs(giNs: Ns = TGI_NS.base): Ns {
  return ltfSymNs(giNs) - ltfSymNs(TGI_NS.base)
}

/**
 * N_HE-LTF / N_EHT-LTF / N_VHT-LTF for this many space-time streams: 1, 2, 4, 4, 6, 6, 8, 8.
 * standard Table 21-13 (VHT, and HE via §27.3.11.10) / standard be Table 36-43 (EHT)
 */
export function ltfCount(nss: number): number {
  const n = Math.max(1, Math.min(8, Math.round(nss)))
  return [1, 2, 4, 4, 6, 6, 8, 8][n - 1]!
}

/** One HE-SIG-B / EHT-SIG / VHT-SIG-B OFDM symbol, ns (T_SYML). Table 27-13 / Table 36-18. */
export const EHT_SIG_SYM_NS: Ns = 4_000

/**
 * EHT-SIG symbols of an EHT SU transmission, N_EHT-SIG = 2.
 *
 * The EHT-SIG of an SU transmission is one common encoding block: the 20-bit Common field, the
 * 22-bit User field, CRC 4 and Tail 6 = 52 bits (standard be Table 36-38), BCC rate 1/2 on 52
 * data tones per symbol (§36.3.12.8.6). U-SIG's EHT-SIG MCS field picks EHT-MCS 0, 1, 3 or 15
 * for it (§36.3.9) and the standard leaves the choice to the transmitter; this engine sends
 * EHT-MCS 0 (BPSK 1/2, 26 bits per symbol, the most robust), so ⌈52 / 26⌉ = 2 symbols.
 * EHT-SIG MCS 0 is the simulator's choice.
 */
export const EHT_SIG_SYMBOLS_SU = 2

/** Options of a PPDU's TXTIME. */
export interface TxTimeOpts {
  /** A DL MU PPDU: adds `muExtraPreambleNs`. */
  mu?: boolean
  /**
   * A trigger-based PPDU (HE TB / EHT TB): HE-STF / EHT-STF is 8 µs (T_HE-STF-T) and there is no
   * HE-SIG-B / EHT-SIG. Table 27-13 / Table 36-18.
   */
  tb?: boolean
  /** RU fraction of the operating channel (1 = full, 0.5 ≈ half RU …). */
  ruFraction?: number
  /** Operating channel width in MHz (default 20). */
  widthMhz?: number
  /** Spatial streams of this user (default 1). */
  nss?: number
  /**
   * Streams the LTF count is sized for, when that is not this user's own `nss`: the total over a
   * MU-MIMO group (N_STS,total), or the largest over the RUs of an OFDMA PPDU (§27.3.11.10).
   */
  ltfNss?: number
  /** Data-field guard interval, ns (default `TGI_NS.base`). */
  giNs?: Ns
}

/**
 * The preamble ahead of the data field, ns — every field from L-STF to the last LTF, computed.
 *
 *  - `nonht`: 16 (L-STF + L-LTF) + 4 (SIGNAL) = 20 µs. Eq 17-29.
 *  - `vht`: 8 + 8 + 4 (L-SIG) + 8 (VHT-SIG-A) + 4 (VHT-STF) + 4 per VHT-LTF + 4 (VHT-SIG-B).
 *    Table 21-5, Eq 21-105.
 *  - `he`: 20 + 4 (RL-SIG) + 8 (HE-SIG-A) + 4 (HE-STF; 8 in a TB PPDU) + N_HE-LTF × T_HE-LTF-SYM.
 *    Table 27-13, Eq 27-121 / Eq 27-149's "20 + T_HE-PREAMBLE".
 *  - `eht` (and draft `uhr`, reused): 20 + 4 (RL-SIG) + 8 (U-SIG) + N_EHT-SIG × 4 + 4 (EHT-STF;
 *    8 and no EHT-SIG in a TB PPDU) + N_EHT-LTF × T_EHT-LTF-SYM. Table 36-18, Eq 36-97 / 36-110.
 *
 * `muExtraPreambleNs` is NOT included; `ppduTiming` adds it for a DL MU PPDU.
 */
export function preambleNsFor(mode: PhyMode, giNs: Ns = TGI_NS.base, opts: { nss?: number; tb?: boolean } = {}): Ns {
  const nLtf = ltfCount(opts.nss ?? 1)
  switch (mode) {
    case 'nonht': return 20_000
    case 'vht': return 36_000 + 4_000 * nLtf
    case 'he': return 20_000 + 4_000 + 8_000 + (opts.tb ? 8_000 : 4_000) + nLtf * ltfSymNs(giNs)
    case 'eht':
    case 'uhr':
      return 20_000 + 4_000 + 8_000 + (opts.tb ? 8_000 : EHT_SIG_SYMBOLS_SU * EHT_SIG_SYM_NS + 4_000) + nLtf * ltfSymNs(giNs)
  }
}

/**
 * Data subcarriers per channel width, from the standard. Airtime scales with
 * these, not with the width in MHz: 80 MHz carries slightly more than four
 * times a 20 MHz channel because the guard bands are not repeated.
 */
const TONES_HE: Record<number, number> = { 20: 234, 40: 468, 80: 980, 160: 1960, 320: 3920 }
const TONES_VHT: Record<number, number> = { 20: 52, 40: 108, 80: 234, 160: 468 }

/**
 * N_SD,short of a non-OFDMA HE/EHT PPDU per width (242-, 484-, 996-, 2×996-, 4×996-tone RU):
 * the data tones of one of the four symbol segments of the last OFDM symbol.
 * standard Table 27-34 / standard be Table 36-46
 */
const NSD_SHORT: Record<number, number> = { 20: 60, 40: 120, 80: 240, 160: 492, 320: 984 }

/** Bits-per-symbol multiplier for a width, relative to that mode at 20 MHz. */
export function toneRatio(mode: PhyMode, widthMhz: number): number {
  if (mode === 'nonht') return 1
  const table = mode === 'vht' ? TONES_VHT : TONES_HE
  const tones = table[widthMhz]
  if (!tones) return 1
  return tones / table[20]
}

/** [N_BPSCS, R] per MCS index: Table 21-30ff (VHT), Table 27-86ff (HE), Table 36-76ff (EHT). */
const HE_MOD: readonly (readonly [number, number])[] = [
  [1, 1 / 2], [2, 1 / 2], [2, 3 / 4], [4, 1 / 2], [4, 3 / 4], [6, 2 / 3],
  [6, 3 / 4], [6, 5 / 6], [8, 3 / 4], [8, 5 / 6], [10, 3 / 4], [10, 5 / 6],
]
const EHT_MOD = [...HE_MOD, [12, 3 / 4], [12, 5 / 6]] as const
/** `uhr`'s interleaved ladder (see `UHR_SFD_MCS`): Motion #42's four new rungs at 2/3 and 5/6. */
const UHR_MOD: readonly (readonly [number, number])[] = [
  [1, 1 / 2], [2, 1 / 2], [2, 2 / 3], [2, 3 / 4], [4, 1 / 2], [4, 2 / 3], [4, 3 / 4], [4, 5 / 6], [6, 2 / 3],
  [6, 3 / 4], [6, 5 / 6], [8, 2 / 3], [8, 3 / 4], [8, 5 / 6], [10, 3 / 4], [10, 5 / 6], [12, 3 / 4], [12, 5 / 6],
]
const MOD: Record<PhyMode, readonly (readonly [number, number])[]> = {
  nonht: [[1, 1 / 2], [1, 3 / 4], [2, 1 / 2], [2, 3 / 4], [4, 1 / 2], [4, 3 / 4], [6, 2 / 3], [6, 3 / 4]],
  vht: HE_MOD.slice(0, 9), he: HE_MOD, eht: EHT_MOD, uhr: UHR_MOD,
}

/** Constellation bits per subcarrier and code rate of this mode/MCS. */
export function modulationOf(mode: PhyMode, mcs: number): { bpscs: number; rate: number } {
  const m = MOD[mode][mcs]
  if (!m) throw new Error(`invalid MCS ${mcs} for ${mode}`)
  return { bpscs: m[0], rate: m[1] }
}

/** FEC of a HE/EHT data field. */
export type Coding = 'bcc' | 'ldpc'

/**
 * Which FEC the engine's transmitter uses for this HE/EHT data field.
 *
 * BCC is permitted only for RUs of at most 242 tones, at most four spatial streams and MCS 0–9
 * (constellations up to 256-QAM); LDPC is the only FEC otherwise — for 484-tone and wider RUs,
 * for HE-MCS 10/11 and for EHT-MCS 10–13. standard §27.3.12.5 / standard be §36.3.13.3.2–3
 *
 * Where both are permitted the standard leaves the choice to the transmitter (the Coding field of
 * HE-SIG-A / EHT-SIG), and this engine sends BCC — the FEC every HE/EHT receiver must support
 * for those RUs (LDPC support is optional for a 20 MHz-only STA below MCS 10). BCC where permitted
 * is the simulator's choice; LDPC where mandatory is the standard's rule.
 */
export function codingFor(mode: PhyMode, mcs: number, widthMhz = 20, nss = 1, ruFraction = 1): Coding {
  if (mode === 'nonht' || mode === 'vht') return 'bcc'
  const { bpscs } = modulationOf(mode, mcs)
  const ruMhz = widthMhz * ruFraction
  return bpscs <= 8 && nss <= 4 && ruMhz <= 20 + 1e-9 ? 'bcc' : 'ldpc'
}

/**
 * Nominal packet padding every HE/EHT receiver of this engine advertises, ns: 16 µs.
 *
 * NOMINAL_PACKET_PADDING comes from the receiver's capabilities — the PPE Thresholds Present and
 * Nominal Packet Padding subfields of its HE Capabilities element, and Common Nominal Packet
 * Padding in its EHT Capabilities element (§26.12, §35.13.2). This engine has no capability
 * exchange, so it states one capability for every receiver: PPE thresholds absent, nominal packet
 * padding 16 µs (Nominal Packet Padding = 2 / Common Nominal Packet Padding = 2). The value is
 * the simulator's; the rule applied to it (Table 27-47 / Table 36-61) is the standard's.
 */
export const NOMINAL_PACKET_PADDING_NS: Ns = 16_000

/**
 * T_PE,nominal for pre-FEC padding factor a at 16 µs nominal packet padding: 4 / 8 / 12 / 16 µs
 * for a = 1 / 2 / 3 / 4. The transmitter sends T_PE = T_PE,nominal ("should be equal to
 * T_PE,nominal to minimize the packet extension overhead").
 * standard §27.3.13 Table 27-47 / standard be §36.3.14 Table 36-61
 */
export function peNsFor(a: number): Ns {
  return (NOMINAL_PACKET_PADDING_NS / 4) * a
}

/** A PPDU's TXTIME, field by field. Every figure in ns. */
export interface PpduTiming {
  /** L-STF … last LTF (`preambleNsFor`). */
  preambleNs: Ns
  /** The DL MU extra signalling (`muExtraPreambleNs`), 0 otherwise. */
  muSigNs: Ns
  /** N_LTF the preamble was sized with. */
  nLtf: number
  symNs: Ns
  nsym: number
  /** Packet extension (HE/EHT only, else 0). */
  peNs: Ns
  /** Pre-FEC padding factor a (HE/EHT only, else 4). */
  a: number
  coding: Coding
  /** §6.7.6.2: the rounding-up to a whole microsecond the TXTIME of a non-HE format gets. */
  roundNs: Ns
  /** TXTIME without the signal extension, which the MAC adds per band. */
  totalNs: Ns
}

/** x mod n for a possibly non-integer n (the RU fractions of this engine's even split). */
function fmod(x: number, n: number): number {
  return x - Math.floor(x / n + 1e-9) * n
}

/**
 * N_CW and L_LDPC for N_avbits / N_pld / R. standard §19.3.11.7.5 Table 19-16
 */
function ldpcCodewords(avbits: number, pld: number, r: number): { ncw: number; l: number } {
  if (avbits <= 648) return { ncw: 1, l: avbits >= pld + 912 * (1 - r) ? 1296 : 648 }
  if (avbits <= 1296) return { ncw: 1, l: avbits >= pld + 1464 * (1 - r) ? 1944 : 1296 }
  if (avbits <= 1944) return { ncw: 1, l: 1944 }
  if (avbits <= 2592) return { ncw: 2, l: avbits >= pld + 2916 * (1 - r) ? 1944 : 1296 }
  return { ncw: Math.ceil(pld / (1944 * r)), l: 1944 }
}

/**
 * N_SYM and the pre-FEC padding factor a of an HE/EHT data field (single user, no STBC).
 *
 *  - BCC: N_Excess = (8·L + N_tail + N_service) mod N_DBPS; a_init = 4 if N_Excess = 0, else
 *    min(⌈N_Excess / N_DBPS,short⌉, 4); N_SYM = N_SYM,init = ⌈(8·L + N_tail + N_service) / N_DBPS⌉;
 *    a = a_init. standard Eq 27-60…27-67 / standard be Eq 36-47…36-49
 *  - LDPC (N_tail = 0): N_pld and N_avbits from N_SYM,init and a_init (Eq 27-68 / 27-69), N_CW and
 *    L_LDPC from Table 19-16, N_shrt and N_punc from Eq 19-37 / 19-38; if
 *    (N_punc > 0.1·N_CW·L_LDPC·(1−R) and N_shrt < 1.2·N_punc·R/(1−R)) or
 *    N_punc > 0.3·N_CW·L_LDPC·(1−R), the LDPC extra symbol segment is added: N_SYM + 1 and a = 1
 *    if a_init = 4, else a = a_init + 1 (Eq 27-70 / 27-71); otherwise as BCC (Eq 27-72).
 *    standard §27.3.12.5.2 / standard be §36.3.13.3.5
 */
function heDataSymbols(
  lengthBytes: number, ndbps: number, ndbpsShort: number, rate: number, coding: Coding,
): { nsym: number; a: number } {
  const ntail = coding === 'bcc' ? 6 : 0
  const bits = 8 * lengthBytes + ntail + 16
  const excess = fmod(bits, ndbps)
  const aInit = excess < 1e-9 ? 4 : Math.min(Math.ceil(excess / ndbpsShort - 1e-9), 4)
  const nsymInit = Math.ceil(bits / ndbps - 1e-9)
  if (coding === 'bcc') return { nsym: nsymInit, a: aInit }
  const ncbps = ndbps / rate
  const ncbpsShort = ndbpsShort / rate
  const lastD = aInit < 4 ? aInit * ndbpsShort : ndbps
  const lastC = aInit < 4 ? aInit * ncbpsShort : ncbps
  const pld = (nsymInit - 1) * ndbps + lastD
  const avbits = (nsymInit - 1) * ncbps + lastC
  const { ncw, l } = ldpcCodewords(avbits, pld, rate)
  const shrt = Math.max(0, ncw * l * rate - pld)
  const punc = Math.max(0, ncw * l - avbits - shrt)
  const extra = (punc > 0.1 * ncw * l * (1 - rate) && shrt < 1.2 * punc * (rate / (1 - rate)))
    || punc > 0.3 * ncw * l * (1 - rate)
  if (!extra) return { nsym: nsymInit, a: aInit }
  return aInit === 4 ? { nsym: nsymInit + 1, a: 1 } : { nsym: nsymInit, a: aInit + 1 }
}

/**
 * N_ES of a VHT BCC data field: the encoders that keep each at or below 600 Mb/s at the 400 ns
 * GI, ⌈N_DBPS / (3.6 µs × 600 Mb/s)⌉ = ⌈N_DBPS / 2160⌉. This reproduces the N_ES column of the
 * VHT-MCS tables for N_SS ≤ 4 (Table 21-30 … Table 21-61; e.g. 80 MHz N_SS = 2 MCS 7: 2340 → 2).
 */
function vhtEncoders(ndbps: number): number {
  return Math.max(1, Math.ceil(ndbps / 2160 - 1e-9))
}

/**
 * A PPDU's TXTIME, field by field, from the standard's formulas (2026-11-11).
 *
 *  - `nonht`: 20 + 4 × ⌈(16 + 8·L + 6) / N_DBPS⌉ µs. Eq 17-29.
 *  - `vht`: preamble + 4 × ⌈(8·L + 16 + 6·N_ES) / N_DBPS⌉ µs, BCC. Eq 21-105 / Eq 21-61.
 *  - `he`: 20 + T_HE-PREAMBLE + N_SYM × T_SYM + T_PE. Eq 27-149 (no midambles: N_MA = 0).
 *  - `eht`: 20 + T_EHT-PREAMBLE + N_SYM × T_SYM + T_PE, rounded up to a whole microsecond — 6.7.6.2
 *    exempts only the HE formats from that rounding and IEEE Std 802.11be-2024 does not amend it.
 *    Eq 36-110. `uhr` (draft) reuses all of EHT's.
 *
 * L is the PSDU length the MAC hands over (APEP_LENGTH). N_SYM and a for HE/EHT come from
 * `heDataSymbols` with the FEC of `codingFor`; T_PE from `peNsFor`. The signal extension of the
 * 2.4 GHz band is not here: the MAC adds it per link.
 */
export function ppduTiming(mode: PhyMode, lengthBytes: number, mcs: number, opts: TxTimeOpts = {}): PpduTiming {
  const m = PHY_MODES[mode]
  const base = m.ndbps[mcs]
  if (!base) throw new Error(`invalid MCS ${mcs} for ${mode}`)
  const width = opts.widthMhz ?? 20
  const nss = opts.nss ?? 1
  const frac = opts.ruFraction ?? 1
  const giNs = opts.giNs ?? TGI_NS.base
  const ndbps = base * toneRatio(mode, width) * nss * frac
  const symNs = symNsFor(mode, giNs)
  if (mode === 'nonht') {
    const nsym = Math.ceil((16 + 8 * lengthBytes + 6) / ndbps)
    const preambleNs = preambleNsFor(mode)
    return {
      preambleNs, muSigNs: 0, nLtf: 0, symNs, nsym, peNs: 0, a: 4, coding: 'bcc', roundNs: 0,
      totalNs: preambleNs + symNs * nsym,
    }
  }
  const ltfNss = opts.ltfNss ?? nss
  const preambleNs = preambleNsFor(mode, giNs, { nss: ltfNss, tb: opts.tb })
  const muSigNs = opts.mu && !opts.tb ? m.muExtraPreambleNs : 0
  if (mode === 'vht') {
    const nsym = Math.ceil((8 * lengthBytes + 16 + 6 * vhtEncoders(ndbps)) / ndbps - 1e-9)
    return {
      preambleNs, muSigNs, nLtf: ltfCount(ltfNss), symNs, nsym, peNs: 0, a: 4, coding: 'bcc', roundNs: 0,
      totalNs: preambleNs + muSigNs + symNs * nsym,
    }
  }
  const { rate } = modulationOf(mode, mcs)
  const coding = codingFor(mode, mcs, width, nss, frac)
  const nsdShort = (NSD_SHORT[width] ?? NSD_SHORT[20]!) * frac
  const ndbpsShort = ndbps * (nsdShort / ((TONES_HE[width] ?? TONES_HE[20]!) * frac))
  const { nsym, a } = heDataSymbols(lengthBytes, ndbps, ndbpsShort, rate, coding)
  const peNs = peNsFor(a)
  const raw = preambleNs + muSigNs + symNs * nsym + peNs
  const total = mode === 'he' ? raw : Math.ceil(raw / 1000 - 1e-9) * 1000
  return {
    preambleNs, muSigNs, nLtf: ltfCount(ltfNss), symNs, nsym, peNs, a, coding, roundNs: total - raw,
    totalNs: total,
  }
}

/** PPDU airtime (TXTIME without signal extension) for any PHY mode/MCS. See `ppduTiming`. */
export function txTimeModeNs(mode: PhyMode, lengthBytes: number, mcs: number, opts: TxTimeOpts = {}): Ns {
  return ppduTiming(mode, lengthBytes, mcs, opts).totalNs
}

/**
 * The largest PSDU, octets, whose PPDU fits `durNs` at this mode/MCS/options — the inverse of
 * `txTimeModeNs`, by bisection (TXTIME is non-decreasing in the length).
 */
export function maxPsduBytesForDur(mode: PhyMode, mcs: number, durNs: Ns, opts: TxTimeOpts = {}): number {
  if (txTimeModeNs(mode, 0, mcs, opts) > durNs) return 0
  let lo = 0
  let hi = 1
  while (txTimeModeNs(mode, hi, mcs, opts) <= durNs) {
    lo = hi
    hi *= 2
    if (hi > 1 << 26) break
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (txTimeModeNs(mode, mid, mcs, opts) <= durNs) lo = mid
    else hi = mid
  }
  return lo
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
 * Control response rate: highest mandatory rate ≤ the eliciting PPDU's non-HT reference rate.
 *
 * The column is per mode (`PhyModeInfo.nonhtRefMbps`) and not one shared array, because `uhr`'s
 * indices do not mean what the other modes' indices mean — see `UHR_NONHT_REF_MBPS`.
 */
export function ctrlRespRateForMode(mode: PhyMode, mcs: number, mbps: number): number {
  return ctrlRespRateFor(mode === 'nonht' ? mbps : modeEntry(PHY_MODES[mode].nonhtRefMbps, mode, mcs))
}

/**
 * Every PHY mode, oldest first. `PhyMode` and `Generation` are deliberately two unions with the
 * same members (see `PhyMode` above), so this is the PHY-side counterpart of `GENERATIONS`
 * (src/model/caps.ts) and `tests/engine/uhr-ladder.test.ts` welds it to `PHY_MODES`' own keys.
 */
export const PHY_MODE_ORDER: readonly PhyMode[] = ['nonht', 'vht', 'he', 'eht', 'uhr']

/**
 * The oldest of these modes — the one format a multi-user round can run for all of them.
 *
 * It replaces `every(m => m === 'eht') ? 'eht' : 'he'`, which answered the same question while
 * only two modes could be in the set, and which would have quietly served an all-Wi-Fi-8 round
 * as an HE MU PPDU with every member's rate clamped to 11: legal, lit, and with the four new
 * rungs unreachable. For any set of `he` / `eht` members this returns exactly what the old
 * expression did (pinned in tests/engine/uhr-ladder.test.ts), which is why nothing recorded moves.
 */
export function lowestMode(modes: readonly PhyMode[]): PhyMode {
  let best = modes[0]!
  for (const m of modes) if (PHY_MODE_ORDER.indexOf(m) < PHY_MODE_ORDER.indexOf(best)) best = m
  return best
}

/**
 * The rung of `to` that asks no more of the link than `from`/`mcs` does.
 *
 * **Why a translation and not a clamp.** A DL MU PPDU or a triggered round runs ONE format for
 * every member (`buildMuParts` / the Trigger path in src/engine/mac.ts), so a member whose own
 * link format is denser has to be re-expressed in the PPDU's format. `Math.min(11, mcs)` did
 * that for the only case that existed — an `eht` member inside an `he` MU PPDU — and it worked
 * because `eht` indices 0…11 ARE `he` indices 0…11. That coincidence does not survive `uhr`,
 * whose index 11 is 256-QAM 2/3 while `eht`'s index 11 is 1024-QAM 5/6: clamping would hand the
 * member a rung four steps above what its RSSI supports.
 *
 * So the rule is stated on the thing that actually constrains it, the required SINR, and the
 * old literal falls out of it: for every `eht` index this returns exactly `Math.min(11, mcs)`
 * (pinned in tests/engine/uhr-ladder.test.ts), which is why no recorded lesson moves.
 */
export function mcsInMode(from: PhyMode, mcs: number, to: PhyMode): number {
  if (from === to) return mcs
  const want = modeEntry(PHY_MODES[from].sensDbm, from, mcs)
  const sens = PHY_MODES[to].sensDbm
  let best = 0
  for (let i = 0; i < sens.length; i++) if (sens[i]! <= want) best = i
  return best
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
