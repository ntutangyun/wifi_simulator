/**
 * The narrowband radio of IEEE P802.15.4ab: the second radio an NBA-UWB device carries.
 *
 * The UWB side of an MMS session measures; it never negotiates. Everything around the
 * measurement — who polls whom, whether the responder heard the poll, and the reply times the
 * range is computed from — travels on a plain O-QPSK narrowband link in the same 5–6 GHz
 * neighbourhood. That radio is slow (250 kb/s: a 12-octet message takes 576 µs, longer than any
 * one fragment it sets up, for every mandatory parameter set) but it reaches far and costs almost nothing, which
 * is why the draft puts the control plane there.
 *
 * It shares the UNII-3 and UNII-5 bands with Wi-Fi, so it also brings a listen-before-talk rule
 * with it. The numbers below are paraphrased from the TG4ab contributions named in each tag.
 */
import type { NbLbt } from '../model/scenario'
import type { Ns } from '../model/types'
import { aes128Encrypt, u128be } from './aes128'
import { freeSpacePl0Db } from './units'

// --- The PHY -------------------------------------------------------------------

export const NB_CHIP_US = 0.5 // standard Clause 13: 2 Mchip/s O-QPSK
export const NB_SYMBOL_CHIPS = 32 // standard Clause 13: 32 chips per symbol, 4 bits each
export const NB_SYMBOL_US = 16 // standard Clause 13: 32 × 0.5 µs, i.e. 250 kb/s
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

/** The message-ID octet each compressed PSDU opens with — the pairwise cycle's four messages and
 * the four the draft gives one-to-many ranging. 4ab draft 15-22/0381r5 Table 1.6.3.1 */
export const NB_MSG_ID = {
  poll: 0x04, resp: 0x05, reportInitiator: 0x06, reportResponder: 0x07,
  pollOtm: 0x10, respOtm: 0x11, reportResponderOtm: 0x12, reportInitiatorOtm: 0x13,
} as const

/** The message-ID octet itself. 4ab draft 15-22/0381r5 Table 1.6.3.1 */
export const NB_MSG_ID_BYTES = 1
/** The CRC-16 a compressed PSDU closes with. 4ab draft 15-22/0381r5 Table 1.6.3.1 */
export const NB_CRC_BYTES = 2
/** A REPORT's one time field: the responder's ReplyTime or the initiator's TurnAroundTime.
 * 4ab draft 15-22/0381r5 Table 1.6.3.2 */
export const NB_REPORT_TIME_BYTES = 5

/** One device address inside a one-to-many message's content: the draft's Responder Address.
 * 4ab draft 15-22/0381r5 Table 1.6.3.1 */
export const NB_ADDR_BYTES = 3
/** The one-to-many POLL's own content at Message Control 1, beyond the address list: Number of
 * Responders and Slots Per Responder, one octet each. It **replaces** the pairwise POLL's
 * two-octet content ({0x00, 0x00}); it is not added to it. 4ab draft 15-22/0381r5 Table 1.6.3.1
 * (message 0x10 at MessageControl 0x10, or 0x30/0x40 where both ends report); the draft's own One-to-many
 * Poll Compact frame keeps the same three fields, "with three octets per address" (quoted in
 * comment resolution 15-24/0687r4, Figure 90, and again in 15-26/0364r1). */
export const NB_OTM_POLL_BYTES = 2
/** The pairwise POLL's two content octets ({0x00, 0x00}) — also the content of a one-to-many POLL
 * at Message Control 0, the POLL of every sub-round after the first. 4ab draft 15-22/0381r5
 * Table 1.6.3.1; 15-24/0687r4 Figure 89 */
export const NB_POLL_CONTENT_BYTES = 2

/**
 * A one-to-many POLL at Message Control 1 — message ID 1 + RPA_hash 3 + RPA_prand 3 + Message
 * Control 1 + content (2 + 3N) + CRC 2 = **12 + 3N** octets.
 *
 * 2026-11-11: this was `NB_POLL_BYTES + 2 + 3N` = 14 + 3N, which kept the pairwise POLL's two zero
 * content octets and put the one-to-many content on top of them.
 */
export function nbOtmPollBytes(responders: number): number {
  return NB_POLL_BYTES - NB_POLL_CONTENT_BYTES + NB_OTM_POLL_BYTES + NB_ADDR_BYTES * responders
}

/** The Predicted Reply Time a One-to-one / One-to-many Response Compact frame carries at Message
 * Control 2: five octets in place of Message Control 0's five zero octets, so the RESP stays
 * `NB_RESP_BYTES` long. Resolution 15-25/0681r1 (no objection, minutes 15-26/0006r0), Figures X1/X2;
 * the time unit is §10.29.1.4's. */
export const NB_PREDICTED_REPLY_BYTES = 5


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

/**
 * Whether any channel of an MMS session's allow list has a band overlapping the Wi-Fi channel
 * [centerMhz ± widthMhz/2] — i.e. whether that session's control plane and that Wi-Fi link
 * share spectrum at all.
 *
 * One definition, because two places ask it: the simulation builds its cross-technology
 * mediator on this answer, and the editor's plan note warns on it. A UNII-3 allow list (the
 * session default) never overlaps a 6 GHz channel, so the default session couples with nothing.
 * The band arithmetic is `bandOverlapMhz`'s, written out rather than imported: `spectrum.ts`
 * reaches this module through `phy.ts`, and the edge must not run back the other way.
 */
export function nbListOverlapsSixGhz(nbChannels: number[], centerMhz: number, widthMhz: number): boolean {
  const lo = centerMhz - widthMhz / 2
  const hi = centerMhz + widthMhz / 2
  return nbChannels.some((n) => {
    const b = nbBand(n)
    return Math.max(0, Math.min(b.hi, hi) - Math.max(b.lo, lo)) > 0
  })
}

/** Initialization channel, and the control/report allow list a session defaults to — both in
 * UNII-3, where listen-before-talk is optional. 4ab draft 15-22/0381r5 Table 1.2.3.1 */
export const NB_DEFAULT_INIT_CHANNEL = 2
export const NB_DEFAULT_CHANNELS = [3]

// --- Link budget ------------------------------------------------------------------

export const NB_TX_DBM = 10 // model: a small module; both bands allow considerably more
export const NB_RX_SENS_DBM = -100 // model: a typical 250 kb/s O-QPSK receiver (standard §13.3.4 floor: −85)
export const NB_SIR_MIN_DB = 0 // model: an NB frame is lost when in-band foreign power reaches its own

/** Free-space loss at 1 m on narrowband channel `n`, the same law `uwbPl0Db` uses at the UWB
 * centres. The rest of the path is the UWB engine's own: exponent `UWB_PL_EXP` plus walls. model */
export function nbPl0Db(n: number): number {
  return freeSpacePl0Db(nbCenterMhz(n))
}

// --- Listen before talk ---------------------------------------------------------------

/** Energy-detection threshold, per MHz. 4ab draft 15-22/0381r5 §1.4.2 (citing the ETSI EN 303 687
 * frame-based rules). The draft's §10.39.8.3 gives no threshold, so this stays the proposal's
 * figure — a value, not a rule of the draft. */
export const NB_LBT_EDT_DBM_PER_MHZ = -75
/** The ETSI minimum assessment time the proposal quoted, µs. Kept for the course's comparison:
 * no CCA in the engine is this short (`NB_PHY_CCA_DURATION_US`). 4ab draft 15-22/0381r5 §1.4.2 */
export const NB_LBT_CCA_US = 9

/**
 * phyCcaDuration of the narrowband PHY: **8 symbol periods = 128 µs**.
 *
 * IEEE Std 802.15.4-2024 Table 12-2: "If a recommended phyCcaDuration is not specified by the PHY
 * clause then a phyCcaDuration of 8 symbol periods is recommended"; §11.2.8 b): "The CCA detection
 * time shall be equal to phyCcaDuration". The draft's narrowband PHY gives no other value (a D04
 * comment asking for a minimum sensing time was not accepted, 15-26/0244r1, 15-26/0348r1), and SSBD
 * reads the same attribute (CID 490/495). It satisfies ETSI's ≥ 9 µs as well.
 *
 * 2026-11-11 (audit #20): every narrowband CCA now averages the foreign power over this long
 * (`UwbChannel.ccaMeasure`) instead of taking one instantaneous reading.
 */
export const NB_PHY_CCA_DURATION_US = 8 * NB_SYMBOL_US

/** aTurnaroundTime: 12 symbol periods for this PHY. standard Table 12-1 */
export const NB_TURNAROUND_SYMBOLS = 12
/** macUnitBackoffPeriod = aTurnaroundTime + phyCcaDuration in symbols: 12 + 8 = 20 symbol periods,
 * 320 µs. standard Table 8-37 */
export const NB_UNIT_BACKOFF_US = NB_TURNAROUND_SYMBOLS * NB_SYMBOL_US + NB_PHY_CCA_DURATION_US

/**
 * The CSMA-CA PIB values a narrowband transmission uses when the session has not chosen SSBD
 * (standard §6.3.2.1, Figure 6-2; ranges and defaults in Table 8-36).
 *
 * `minBe` is **0**, the one value here this simulator chooses (range 0…macMaxBe; the setting is the
 * next higher layer's). At the default 3 the first backoff alone may be 7 × 320 µs, and the draft
 * gives a narrowband message a two-slot window (1 ms at 600 RSTU): a POLL's 424 µs of slack would
 * hold a zero backoff only one draw in eight even on an idle channel. The standard's own NOTE says
 * what 0 costs — collision avoidance is off for the first iteration only. `maxBe` and
 * `maxBackoffs` are the standard's defaults.
 */
export const NB_CSMA = { minBe: 0, maxBe: 5, maxBackoffs: 4 } as const

/** The same threshold over the whole 2.5 MHz channel: −71.02 dBm. model (the draft states the
 * threshold per MHz; spreading it over the occupied bandwidth is this engine's reading) */
export const NB_LBT_THRESHOLD_DBM = NB_LBT_EDT_DBM_PER_MHZ + 10 * Math.log10(NB_CHANNEL_MHZ)

/**
 * Whether a transmission on `channel` runs channel access first.
 *
 * The draft's §10.39.8.3 (as rewritten by 15-25/0307r1 and 15-25/0427r4) asks for it **where
 * regulation requires it** and otherwise permits it for coexistence. Which regulation governs is the
 * deployment's, not the standard's, so `'auto'` is this simulator's model of it: the reading
 * 15-22/0381r5 §1.4.2 states — channels 50–249 (UNII-5) are under a regulatory constraint, 0–49
 * (UNII-3) are not. `'on'` is a session that elects channel access everywhere (permitted for
 * coexistence), `'off'` one that never does.
 *
 * What a busy channel costs is decided elsewhere: per transmission slot, by CSMA-CA or SSBD
 * (`device.mms.ts#nbAccess`). 2026-11-11, audit #19: the engine used to silence the radio for the
 * rest of the block.
 */
export function nbLbtRequired(channel: number, lbt: NbLbt): boolean {
  if (lbt === 'on') return true
  if (lbt === 'off') return false
  return channel >= 50
}

/** The range of the draft's PRNG seed: one octet (the SOR's NB Channel Seed, 15-22/0381r5;
 * 15-26/0408r2 replaces the draft's worked example with a legal one-octet seed). */
export const NB_PRNG_SEED_MOD = 256

/**
 * The draft's `NbaPrng(mmsPrngSeed, RangingBlockIndex)`: the AES-128 block cipher keyed by the seed,
 * encrypting the block index, both MSB zero-padded 128-bit unsigned integers; PrngValue is bits 0…31
 * of the output — its last four octets, big-endian. 4ab draft §10.39.8.4.3 as fixed by 15-24/0223r1
 * (the AES-128 block operation of Annex B.2.2) and 15-24/0658r1 (bits 0 to 31, zero padding); test
 * vectors in 15-26/0215r2 and 15-26/0408r2, pinned in tests/uwb/nb-prng.test.ts.
 */
export function nbaPrngValue(seed: number, blockIndex: number): number {
  const out = aes128Encrypt(u128be(seed), u128be(blockIndex))
  return out[12] * 0x1000000 + out[13] * 0x10000 + out[14] * 0x100 + out[15]
}

/**
 * The narrowband channel block `block` of the session uses: SelectedChannel =
 * allowList[PrngValue mod n] (4ab draft §10.39.8.4.3).
 *
 * `seed` is the scenario's seed, reduced to the draft's one-octet mmsPrngSeed (`seed mod 256`): the
 * draft has the seed agreed at setup and leaves its value to the higher layer.
 *
 * 2026-11-11: replaces the simulator's own string hash, which stood in for the proposal's AES-CTR.
 */
export function nbChannelForBlock(list: number[], seed: number, block: number): number {
  const s = ((Math.trunc(seed) % NB_PRNG_SEED_MOD) + NB_PRNG_SEED_MOD) % NB_PRNG_SEED_MOD
  return list[nbaPrngValue(s, block) % list.length]
}
