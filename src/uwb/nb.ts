/**
 * The narrowband radio of IEEE P802.15.4ab: the second radio an NBA-UWB device carries.
 *
 * The UWB side of an MMS session measures; it never negotiates. Everything around the
 * measurement — who polls whom, whether the responder heard the poll, and the reply times the
 * range is computed from — travels on a plain O-QPSK narrowband link in the same 5–6 GHz
 * neighbourhood. That radio is slow (250 kb/s: a 12-octet message takes 576 µs, longer than
 * the whole UWB ranging phase's worth of fragments) but it reaches far and costs almost nothing,
 * which is why the draft puts the control plane there.
 *
 * It shares the UNII-3 and UNII-5 bands with Wi-Fi, so it also brings a listen-before-talk rule
 * with it. The numbers below are paraphrased from the TG4ab contributions named in each tag.
 */
import type { NbLbt } from '../model/scenario'
import type { Ns } from '../model/types'
import { hashStr } from '../engine/hash'
import { freeSpacePl0Db } from './phy'

// --- The PHY -------------------------------------------------------------------

export const NB_CHIP_US = 0.5 // standard Clause 12: 2 Mchip/s O-QPSK
export const NB_SYMBOL_CHIPS = 32 // standard Clause 12: 32 chips per symbol, 4 bits each
export const NB_SYMBOL_US = 16 // standard Clause 12: 32 × 0.5 µs, i.e. 250 kb/s
/** 8 preamble symbols + 2 SFD symbols. 4ab draft 15-23/0100r2 §2.3.1, PHY configuration #1 */
export const NB_SHR_SYMBOLS = 10
/** The PHY header. 4ab draft 15-23/0100r2 §2.3.1, PHY configuration #1 */
export const NB_PHR_SYMBOLS = 2

/** A narrowband PPDU: header symbols plus two symbols an octet (4 bits per symbol), no FEC. derived */
export function nbPpduNs(octets: number): Ns {
  return (NB_SHR_SYMBOLS + NB_PHR_SYMBOLS + 2 * octets) * NB_SYMBOL_US * 1000
}

// --- The control messages --------------------------------------------------------

// Each is a compressed PSDU: a one-octet message ID, the fields the draft's table lists, and
// the CRC-16 — not the full 802.15.4 MHR the UWB frames of phy.ts carry.

/** POLL: the initiator opens the round. 4ab draft 15-22/0381r5 Table 1.6.3.1 */
export const NB_POLL_BYTES = 12
/** RESP: the responder says it heard the POLL. 4ab draft 15-22/0381r5 Table 1.6.3.1 */
export const NB_RESP_BYTES = 12
/** REPORT: a 5-octet time (the responder's ReplyTime, the initiator's TurnAroundTime) and,
 * on the responder's, a payload-length octet with no payload behind it.
 * 4ab draft 15-22/0381r5 Table 1.6.3.1 */
export const NB_REPORT_BYTES = 13

/** The message-ID octet each compressed PSDU opens with. 4ab draft 15-22/0381r5 Table 1.6.3.1 */
export const NB_MSG_ID = { poll: 0x04, resp: 0x05, reportInitiator: 0x06, reportResponder: 0x07 } as const

/** The message-ID octet itself. 4ab draft 15-22/0381r5 Table 1.6.3.1 */
export const NB_MSG_ID_BYTES = 1
/** The CRC-16 a compressed PSDU closes with. 4ab draft 15-22/0381r5 Table 1.6.3.1 */
export const NB_CRC_BYTES = 2
/** A REPORT's one time field: the responder's ReplyTime or the initiator's TurnAroundTime.
 * 4ab draft 15-22/0381r5 Table 1.6.3.2 */
export const NB_REPORT_TIME_BYTES = 5

// --- The channel plan --------------------------------------------------------------

/** 50 channels in UNII-3 (5725–5850 MHz) and 200 in UNII-5 (5925–6425 MHz), numbered 0…249.
 * 4ab draft 15-22/0381r5 §1.4.1 / 15-23/0100r2 §2.3.1 */
export const NB_CHANNELS = 250
export const NB_CHANNEL_MHZ = 2.5 // 4ab draft 15-22/0381r5 §1.4.1

/** Centre frequency of narrowband channel `n`. The two bands are laid out 2.5 MHz apart from
 * 1.25 MHz inside each band edge; the draft gives the counts and the edges in text and the
 * numbering only as a figure, so this formula is **reconstructed** from them (model). */
export function nbCenterMhz(n: number): number {
  // Outside the plan there is no centre to give: a band edge invented for channel 250 would be
  // carried silently into a path loss, an emission band and an LBT reading.
  if (!Number.isInteger(n) || n < 0 || n >= NB_CHANNELS) {
    throw new Error(`nbCenterMhz: the narrowband plan has ${NB_CHANNELS} channels (0…${NB_CHANNELS - 1}), asked for ${n}`)
  }
  return n < 50 ? 5726.25 + NB_CHANNEL_MHZ * n : 5926.25 + NB_CHANNEL_MHZ * (n - 50)
}

/** The band a narrowband transmission occupies: its centre ± half a channel. model (the draft
 * states an occupied bandwidth under 2.5 MHz, 15-22/0381r5 §1.4.1) */
export function nbBand(n: number): { lo: number; hi: number } {
  const half = NB_CHANNEL_MHZ / 2
  return { lo: nbCenterMhz(n) - half, hi: nbCenterMhz(n) + half }
}

/** Initialization channel, and the control/report allow list a session defaults to — both in
 * UNII-3, where listen-before-talk is optional. 4ab draft 15-22/0381r5 Table 1.2.3.1 */
export const NB_DEFAULT_INIT_CHANNEL = 2
export const NB_DEFAULT_CHANNELS = [3]

// --- Link budget ------------------------------------------------------------------

export const NB_TX_DBM = 10 // model: a small module; both bands allow considerably more
export const NB_RX_SENS_DBM = -100 // model: a typical 250 kb/s O-QPSK receiver (standard §12.3.4 floor: −85)
export const NB_SIR_MIN_DB = 0 // model: an NB frame is lost when in-band foreign power reaches its own

/** Free-space loss at 1 m on narrowband channel `n`, the same law `uwbPl0Db` uses at the UWB
 * centres. The rest of the path is the UWB engine's own: exponent `UWB_PL_EXP` plus walls. model */
export function nbPl0Db(n: number): number {
  return freeSpacePl0Db(nbCenterMhz(n))
}

// --- Listen before talk ---------------------------------------------------------------

/** Energy-detection threshold, per MHz, and the shortest clear-channel assessment before a
 * transmission. 4ab draft 15-22/0381r5 §1.4.2 (citing the ETSI EN 303 687 frame-based rules) */
export const NB_LBT_EDT_DBM_PER_MHZ = -75
export const NB_LBT_CCA_US = 9

/** The same threshold over the whole 2.5 MHz channel: −71.02 dBm. model (the draft states the
 * threshold per MHz; spreading it over the occupied bandwidth is this engine's reading) */
export const NB_LBT_THRESHOLD_DBM = NB_LBT_EDT_DBM_PER_MHZ + 10 * Math.log10(NB_CHANNEL_MHZ)

/** Whether a transmission on `channel` has to listen first. The draft makes it mandatory in
 * UNII-5 and optional in UNII-3, which is what `'auto'` follows; `'on'` and `'off'` are the
 * scenario's override (model). 4ab draft 15-22/0381r5 §1.4.2 */
export function nbLbtRequired(channel: number, lbt: NbLbt): boolean {
  if (lbt === 'on') return true
  if (lbt === 'off') return false
  return channel >= 50
}

/** The channel block `block` of the session uses, drawn from the allow list. The draft hops with
 * AES-128-CTR keyed by the session's PRNG seed over the block index; the simulator's own string
 * hash stands in for it, so a replay picks the same channels and no `Math.random` is involved
 * (model). 4ab draft 15-22/0381r5 §1.5.3 */
export function nbChannelForBlock(list: number[], seed: number, block: number): number {
  return list[hashStr(`${seed}:${block}`) % list.length]
}
