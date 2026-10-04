/**
 * Shared-medium model: tracks active transmissions, drives per-node CCA
 * (physical carrier sense, §17.3.10.6) and resolves receptions with an
 * SINR-based capture model. Virtual carrier sense (NAV) lives in the MAC.
 *
 * v2: frames may declare an `orthogonalGroup` (OFDMA RU allocation): frames in
 * the same group do not interfere with each other, and a receiver may hold
 * multiple simultaneous locks on same-group frames (e.g. an AP receiving a
 * triggered UL MU transmission, or the simultaneous BAs after a DL MU PPDU).
 *
 * v3 (AMP backscatter): a PPDU may radiate two powers over its own length, some links are
 * measured under the free-space law instead of the link table, and a reader may hear — inside
 * the PPDU it is itself transmitting, and only there — a tag reflecting that PPDU back at it.
 */
import type { FrameDesc } from '../model/frames'
import type { EmitFn } from '../model/records'
import type { Wall } from '../model/scenario'
import type { Ns, Vec3 } from '../model/types'
import { EventQueue } from './events'
import { fadingDb, shadowDb, smallScaleDb, type FadingCfg } from './fading'
import { byCodeUnit } from './hash'
import { CCA_ED_DBM, CCA_PD_DBM, noiseDbm, preambleNsFor, reqSinrDb, sinrThreshDb } from './phy'
import { wallLossDb } from './propagation'
import { selBinStart, selBinnableGen, selBins, selEffSinrDb, selMemberBins } from './selectivity'
import { wifiToUwbPathLossDb, type Emission, type Spectrum } from './spectrum'
import {
  AMP_DL_REQ_SINR_DB,
  AMP_DL_SYNC_NS,
  AMP_LEGACY_PREAMBLE_NS,
  AMP_TAG_DL_SENS_DBM,
  AMP_UL_BW_MHZ,
  AMP_UL_CHIP_NS,
  AMP_UL_REQ_SINR_DB,
  AMP_UL_SYNC_CHIPS,
  ampUlSensDbm,
  type AmpUlKbps,
} from './amp'
import {
  AMP_BS_ACTIVATION_DBM,
  AMP_BS_LOSS_DB,
  AMP_BS_REQ_SNR_DB,
  AMP_BS_UL_CHIP_NS,
  AMP_BS_UL_SYNC_CHIPS,
  FREQ_24G_MHZ,
  ampBsDataEndNs,
  ampBsSyncEndNs,
  bsPathLossDb,
  monoLeakDbm,
  readerFloorDbm,
  type AmpBsUlKbps,
} from './ampBs'

export interface PhyListener {
  onCcaBusy(t: Ns): void
  onCcaIdle(t: Ns): void
  /** PHY-RXSTART.indication: receiver locked a preamble (§10.3.2.9 timeout semantics). */
  onRxStart(t: Ns, frame: FrameDesc, from: string): void
  onRxOk(t: Ns, frame: FrameDesc, from: string): void
  /** Energy that looked like a frame ended without being decodable → EIFS at the MAC. */
  onRxCorrupt(t: Ns): void
}

interface ActiveTx {
  txId: string
  frame: FrameDesc
  endNs: Ns
  /** When this PPDU went on the air — the instant its shadowing is sampled at. */
  startNs: Ns
  /**
   * What identifies this PPDU to the fading sampler: a counter, taken once here.
   *
   * It has to be **stable across one frame's life and different between frames**, because
   * `linkDbm` is asked for this frame's level several times over that life — carrier sense
   * when it starts, the capture decision, and every SINR recomputation — and a key that
   * moved between those asks would deliver one frame to one receiver at several levels,
   * with which level answered which question decided by event-queue ordering.
   *
   * A counter is the one thing here that is exactly per-transmission. The frame *object*
   * cannot be it: `FrameDesc` carries no identity of its own, a retransmission is a fresh
   * object with the same fields, and a MAC may reuse one. Nor can the instant: two PPDUs
   * from different transmitters share it, and the same PPDU is asked about at many instants
   * after it. The counter is taken in `startTx` and never re-read, so every ask about this
   * transmission — from any caller, in any order — hashes the same key.
   */
  fadeKey: string
  /** The emission registered with the Spectrum, kept so `endTx` retires the same object. */
  emission?: Emission
}

/**
 * Time-varying fading on this link's levels, passed only when the scenario asked for it.
 *
 * Absent — every scenario that existed before this slice — and `linkDbm` hands back the link
 * table's own number, reached without entering the fading branch at all rather than by adding
 * a zero to it. That is what keeps both hash fixtures still.
 */
export interface ChannelFading {
  cfg: FadingCfg
  /**
   * The seed a draw is a pure function of, alongside the two node ids and the key. It is the
   * scenario seed mixed with the link id, so an MLO station does not fade identically on
   * 2.4 and 5 GHz — two bands that far apart scatter independently. model
   */
  seed: number
  /**
   * Frequency selectivity: draw the fast layer **once per 26-tone-RU bin** and let the decode
   * decision read the capacity-combined result instead of one link-wide value
   * (`selectivity.ts`, design doc 2026-10-03-selectivity §3).
   *
   * It rides on this object rather than on one of its own because it has nothing of its own to
   * carry: the per-bin deviation's distribution and K factor are `cfg`'s, and the scenario
   * schema refuses `selectivity` without a `fading` section whose `smallScale` is not `none`
   * precisely because this feature is that sampler at a finer granularity, not a second one.
   * Absent is off, which is every scenario that predates it — and off is reached without
   * computing a single bin (see `selCombine`), not by combining deviations that are all zero.
   */
  selective?: boolean
}

/**
 * Cross-technology coupling, passed only for a link that shares its band with
 * another technology (today: the 6 GHz link under a UWB channel-5 session).
 * Without it the channel behaves exactly as before — no foreign term is ever
 * added to a power sum, so every existing timeline replays bit-for-bit.
 */
export interface ChannelSpectrum {
  s: Spectrum
  /** Where a node of this link stands, for the foreign emission's path loss. */
  posOf: (id: string) => Vec3
  /** A node's transmit power (dBm EIRP), carried on every PPDU it puts on the air. */
  txPowerOf: (id: string) => number
  /** Centre frequency of the link's operating channel, in MHz. */
  centerMhz: number
  /** The link's widest operating width, in MHz: the bandwidth energy detection listens over. */
  widthMhz: number
}

/**
 * Where the nodes of this link stand, for the links that do not obey the Wi-Fi law.
 *
 * A backscatter round is a tens-of-centimetres affair, and below a metre the engine's indoor
 * log-distance law extrapolates to *less* than free-space loss. So every power a tag or a
 * reflection is measured at goes through `bsPathLossDb` — Friis at the carrier plus the same
 * wall table — computed from the geometry rather than read out of the link table. Absent when
 * the link has no backscatter radios on it, which is every link that existed before this slice.
 */
export interface BsGeometry {
  posOf: (id: string) => Vec3
  walls: Wall[]
  /**
   * A node's own transmit power (dBm EIRP) — the one the link table was built from.
   *
   * A downlink RFID PPDU is the one thing on this link that does not radiate it, so a receiver
   * that *does* read the link table (every Wi-Fi radio in the room) has to be told the
   * difference. It sits here because the backscatter tier is the only thing that needs it on a
   * 2.4 GHz link; it belongs with `spectrum` in one options object, which is the channel's own
   * carry.
   */
  txPowerOf: (id: string) => number
}

/** A PPDU a node has on the air right now, and where in it we are. */
export interface InFlightTx {
  frame: FrameDesc
  startNs: Ns
  endNs: Ns
}

/**
 * Where AMP-Data ends inside a downlink RFID PPDU — the instant the command is complete, the
 * BST-Excitation starts and a tag's answer becomes due (T1 later).
 *
 * The composition is `ampBsDataEndNs`'s, the same one `ampBsDlPpduNs` builds the airtime out of,
 * so the frame's `txTimeNs` and this offset into it cannot drift apart when the PPDU gains a
 * field. Measured forward from the start, so it needs no knowledge of the link's signal
 * extension. null for every frame that is not an `ampRfid`.
 */
export function bsDataEndNs(frame: FrameDesc): Ns | null {
  const r = frame.kind === 'ampRfid' ? frame.amp?.rfid : undefined
  return r === undefined ? null : ampBsDataEndNs(r.cmd, r.wupNs)
}

/**
 * The EIRP a PPDU radiates `offsetNs` into its own transmission.
 *
 * Only a downlink RFID PPDU has one: it charges the tags at `chargeDbm` through its preamble,
 * its WUP-Excitation and the command, then drops to `bsDbm` for the BST-Excitation it expects
 * to hear a reflection inside — and stays there through the signal extension that trails it
 * (model). Every other PPDU radiates its node's one EIRP throughout and does not carry it, so
 * this returns null and the caller uses what it already knows.
 */
export function txDbmAt(frame: FrameDesc, offsetNs: Ns): number | null {
  const r = frame.kind === 'ampRfid' ? frame.amp?.rfid : undefined
  if (r === undefined) return null
  return offsetNs < bsDataEndNs(frame)! ? r.chargeDbm : r.bsDbm
}

interface Lock {
  from: string
  frame: FrameDesc
  rxDbm: number
  /**
   * The transmission's `fadeKey`, carried over from the `ActiveTx` that was locked onto.
   *
   * `rxDbm` is the level with this PPDU's *flat* fade already in it, and the per-bin decode
   * decision needs to re-take that same draw to replace it with per-bin ones — which it can
   * only do from the key the level was drawn with. The transmission itself is gone by then:
   * `endTx` removes it from `active` before resolving the receptions locked onto it.
   */
  fadeKey: string
  /** When the preamble was acquired — bounds the capture window. */
  startNs: Ns
  /** Worst-case (max) interference+noise in mW seen during the lock. */
  maxInterfMw: number
  /** True if any meaningful foreign signal overlapped the locked frame. */
  overlapped: boolean
  /**
   * Every transmitter that meaningfully overlapped this lock, accumulated as
   * they appear — the COLLISION record must name interferers even when they
   * ended before the locked frame did.
   */
  contributors: Set<string>
}

interface RadioState {
  listener: PhyListener
  ccaBusy: boolean
  /** Receptions in progress. >1 only for RU-orthogonal (same orthogonalGroup) frames. */
  locks: Lock[]
  transmitting: boolean
  /**
   * Transmissions whose preamble arrived while this radio was listening. A
   * signal that started while the radio was transmitting was never seen as a
   * PPDU, so it can only hold CCA busy through energy detection (§17.3.10.6).
   */
  observed: Set<string>
  /** Preambles this radio could not detect because of interference, resolved as collisions when they end. */
  misses: { from: string; startNs: Ns; contributors: Set<string> }[]
  /**
   * 'wifi' (default) decodes 802.11 PPDUs and DL AMP PPDUs' legacy preamble; 'tag' (Active Tx)
   * decodes only DL AMP PPDUs; 'bsTag' (backscatter) decodes only DL RFID PPDUs, under the
   * backscatter law, and has no transmitter of its own at all.
   */
  kind: 'wifi' | 'tag' | 'bsTag'
  /** Wi-Fi radio that can also decode UL AMP PPDUs (the AMP AP). */
  ampCapable: boolean
  /** Tags: minimum RSSI to detect a DL AMP PPDU (a backscatter tag: to be powered at all). */
  floorDbm: number
  /** false: never emit CCA records nor call onCcaBusy/onCcaIdle (tags have no carrier sense). */
  cca: boolean
}

export interface RadioOpts {
  /** 'wifi' (default) decodes 802.11 PPDUs and DL AMP PPDUs' legacy preamble; 'tag' decodes only
   * DL AMP PPDUs; 'bsTag' only DL RFID PPDUs, under the backscatter law. */
  kind?: 'wifi' | 'tag' | 'bsTag'
  /** Wi-Fi radio that can also decode UL AMP PPDUs (the AMP AP). */
  ampCapable?: boolean
  /** Tags: minimum RSSI to detect a DL AMP PPDU (default AMP_TAG_DL_SENS_DBM, or, for a
   * backscatter tag, the AMP_BS_ACTIVATION_DBM it needs to be powered at all). */
  floorDbm?: number
  /** false: never emit CCA records nor call onCcaBusy/onCcaIdle (tags have no carrier sense). */
  cca?: boolean
}

/** Minimum SINR at which a preamble is detected (ns-3 ThresholdPreambleDetectionModel default). */
export const PREAMBLE_DETECT_SINR_DB = 4

const mw = (dbm: number): number => Math.pow(10, dbm / 10)
const dbm = (mwv: number): number => 10 * Math.log10(mwv)
/** Interferers at/above this level count as "overlap" for collision labeling. */
const OVERLAP_MIN_DBM = -92
/**
 * Frame capture (message-in-message). How much stronger a second preamble must
 * be before the receiver abandons the reception in progress and re-syncs to it.
 * ns-3's SimpleFrameCaptureModel default; typical of real chipsets' restart mode.
 */
const CAPTURE_MARGIN_DB = 5

/**
 * How long a reception stays re-syncable: its preamble, during which the radio
 * is still doing AGC and timing acquisition. Once into the payload it is
 * committed, and a stronger signal can only corrupt it.
 *
 * **The Wi-Fi exit reads the frame's own guard interval**, not `PHY_MODES[mode].preambleNs`.
 * This was the seventh caller of "how long is the preamble" and it is not on either task's file
 * list: at the quadruple guard interval the 4x LTF makes the real preamble 52.8 µs rather than
 * 44, and reading the stored constant would have declared the last 8.8 µs of a preamble to be
 * committed payload. `preambleNsFor(mode, undefined)` is `PHY_MODES[mode].preambleNs` by
 * construction, so every scene without the section is unaffected to the nanosecond.
 */
const captureWindowNs = (frame: FrameDesc): Ns => {
  // A backscatter DL PPDU syncs on 8 chips after its WUP-Excitation, not on the Active Tx tier's
  // 40; a reply on [S, S, S] rather than 48 chips. Same arithmetic, different fields.
  if (frame.kind === 'ampRfid') return ampBsSyncEndNs(frame.amp!.rfid!.wupNs)
  if (frame.kind === 'ampBsReply') {
    return AMP_BS_UL_SYNC_CHIPS * AMP_BS_UL_CHIP_NS[bsUlKbps(frame)]
  }
  if (frame.amp?.dir === 'dl') return AMP_LEGACY_PREAMBLE_NS + AMP_DL_SYNC_NS
  if (frame.amp?.dir === 'ul') return AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[frame.amp.kbps as AmpUlKbps]
  return preambleNsFor(frame.mode ?? 'nonht', frame.giNs)
}

/**
 * The uplink rate of a backscattered reply, narrowed rather than asserted.
 *
 * `amp.kbps` is a plain number and the Active Tx union admits 4000, which a backscatter tag
 * cannot produce: left as a cast, such a frame would index both the SNR table and the chip table
 * with a missing key and be silently undetectable (undefined compares false) with a NaN capture
 * window. `ampBsReplyFrame`'s signature makes that unreachable, so this is a loud floor under a
 * programming error, not a runtime case.
 */
function bsUlKbps(frame: FrameDesc): AmpBsUlKbps {
  const kbps = frame.amp?.kbps
  if (kbps !== 250 && kbps !== 1000) {
    throw new Error(`channel: ${kbps} kb/s is not a backscatter uplink rate`)
  }
  return kbps
}

const sameGroup = (a: FrameDesc, b: FrameDesc): boolean =>
  a.orthogonalGroup !== undefined && a.orthogonalGroup === b.orthogonalGroup

/**
 * Noise bandwidth for a PPDU: an AMP UL PPDU uses its OOK-rate-dependent width; everything else
 * the PPDU's width.
 *
 * A backscattered reply takes the Active Tx widths too, although its chip rate is half the
 * Active Tx one at 250 kb/s (`AMP_BS_UL_CHIP_NS` 2 µs against `AMP_UL_CHIP_NS` 1 µs). It costs
 * nothing here — a mono-static reader hears every reply against its own leakage floor, not
 * against thermal noise, so this width never enters the answer — and it is deliberate rather
 * than overlooked, because a narrower width would be a new model number with no source behind
 * it. **A bistatic receiver (A4) falls back to thermal, and would inherit a ~3 dB optimism from
 * this line: give a reply its own width there.**
 */
function ampNoiseBwMhz(frame: FrameDesc): number {
  return frame.amp?.dir === 'ul' ? AMP_UL_BW_MHZ[frame.amp.kbps as AmpUlKbps] : frame.widthMhz ?? 20
}

/**
 * How far above the noise a preamble has to stand to be acquired at all.
 *
 * A Wi-Fi receiver is hunting for a preamble it had no warning of, hence ns-3's 4 dB. A
 * mono-static reader is not hunting: it opened the excitation itself and knows to the
 * microsecond when the reflection is due, so acquiring one is not gated any harder than
 * decoding it — which is what keeps the channel's reach exactly the `monoReachM` the lesson
 * quotes (3 dB at 250 kb/s), instead of quietly pulling it in to the 4 dB of a blind search.
 */
const detectThreshDb = (frame: FrameDesc): number =>
  frame.kind === 'ampBsReply' ? AMP_BS_REQ_SNR_DB[bsUlKbps(frame)] : PREAMBLE_DETECT_SINR_DB

/**
 * Does the frequency-selective decode path apply to this PPDU at all? — the carve-out of the
 * design doc §6 item 1, and it is not optional.
 *
 * `resolveLock` serves three kinds of reception, and only one of them is OFDM. A backscattered
 * reply and an `amp.dir === 'ul'` AMP PPDU are OOK, chip by chip, so a 26-tone resource unit is
 * not a subdivision of anything they occupy; a downlink AMP PPDU carries its AMP-Data as OOK
 * too, behind a legacy preamble. And a reply's floor is not thermal noise but the reader's own
 * leakage (`readerFloorDbm`), which no per-bin signal-to-noise ratio of an OFDM channel
 * describes. All three therefore keep the scalar path, which is also what keeps the two AMP
 * tiers' recorded timelines still — the way this feature would otherwise move them is silently.
 *
 * The test is the `amp` field rather than the five AMP frame kinds, because that field is what
 * every AMP-side decision in this file already branches on (`decodeThreshDb`, `detectThreshDb`,
 * `ampNoiseBwMhz`), and a kind list here would be a second copy of `FRAME_KINDS` to keep in
 * step.
 *
 * **Being OFDM is not the same as being divisible into 26-tone RUs**, and this guard used to
 * stop at the first test with "non-HT is clause 17 OFDM" as its reason. That sentence is true
 * and beside the point: the 26-tone resource unit is a clause 27 / 36 construct, defined at the
 * 78.125 kHz subcarrier spacing HE and EHT use, while clause 17 and clause 21 are spaced
 * 312.5 kHz — four times coarser. `selBinnableGen` in selectivity.ts holds that two-entry list
 * and the evidence for it, and it is the same predicate `ScenarioSchema`'s third selectivity
 * refusal reads; the difference is only what each asks it about.
 *
 * **`frame.mode === undefined` counts as non-HT and is refused with it**, because that is what
 * it means: `FrameDesc.mode`'s own default is non-HT, so every control response this engine
 * sends — ACK, BlockAck, RTS, CTS — is a 312.5 kHz PPDU however modern the two radios
 * exchanging it are. There is no version of this rule that holds for a VHT data PPDU and not
 * for a non-HT ACK: the spacing is the same in both, and the 26-tone RU is absent from both.
 * Excluding the control frames moved the `selectivity` lesson's recorded timelines and the drop
 * rates measured off them; those were re-measured against this rule rather than the rule bent
 * to preserve them, because the lesson's figures are measurements *of* this engine.
 *
 * **Why the schema cannot be the only gate, even now that it asks about links.** The refusal
 * requires *a* binnable link — AP and at least one station both HE or better — and `Simulation`'s
 * constructor parses before it builds anything (simulation.ts), so even the worker's
 * unvalidated-looking `new Simulation(m.scenario)` surfaces that refusal as a banner
 * (sim.worker.ts). What it cannot require is that *every* link be binnable, and it must not:
 * `defaultScenario()` is an EHT AP with an HE station and a VHT one, and the HE link in it is
 * perfectly binnable while the VHT station's PPDUs are not. Per-PPDU is the only level at which
 * that distinction exists, so it is made here.
 */
const isOfdmWifiPpdu = (frame: FrameDesc): boolean =>
  frame.amp === undefined && selBinnableGen(frame.mode)

/** The width a PPDU that does not name one occupies — a 20 MHz non-HT PPDU. */
const DEFAULT_WIDTH_MHZ = 20

/** What the per-bin decode decision produced, and what `WIFI_SEL` reports of it. */
interface SelCombined {
  meanSinrDb: number
  effSinrDb: number
  lossDb: number
  /** How many bins **this** decision read — the member's resource unit, not the channel. */
  bins: number
  /** Which bin that run started at; 0 whenever the whole channel was read. */
  binStart: number
  /** The share of the PPDU this receiver holds; absent when it read the whole channel. */
  ruFraction?: number
  /**
   * The PPDU's own width, MHz — the denominator of the three fields above.
   *
   * Always present, including on a whole-channel row. **Not because the width would otherwise
   * be unrecoverable**, which is what this comment used to claim and is false: within any one
   * reachable share the five legal widths give five distinct bin counts (at 1/2 they are
   * 4/9/18/36/72, at 1/3 3/6/12/24/48, at 1/4 2/4/9/18/36), so `bins` and `ruFraction` do pin
   * the width down. They pin it down by **inverting a truncation**, and that is the real reason
   * this field is here: `bins / ruFraction` gives 8 rather than 9 for a two-member 20 MHz PPDU,
   * because the truncation dropped the bin nobody holds, so recovering the channel's own count
   * means knowing that and working backwards. Nobody reading an event log should be asked to
   * undo a floor, and a width carries the physical scale with it rather than only a count. It
   * is required rather than member-only because the scene this slice's lesson is built on has
   * two members and may contain no whole-channel row to read a denominator off (design §7.3).
   */
  widthMhz: number
  worstBinDb: number
}

/**
 * This receiver's own share of the PPDU it is decoding, and the bin that share starts at — or
 * `undefined` when it is reading the whole channel. `standard §27.3.2.2` for the resource unit;
 * the share itself is `model` (`mac.ts` divides evenly).
 *
 * Three receivers legitimately read the whole channel, and none of them is an omission:
 *
 *   - a **single-user** PPDU has no `muParts` at all;
 *   - a **MU-MIMO** member has no `ruFraction` — `mac.ts`'s `frac = mumimo ? 1 : 1 / n` gives
 *     it the full width at its own stream count, which is also what the standard says of a
 *     PPDU whose RU spans the whole bandwidth. This is why slice 4b needs no `muKind` branch
 *     anywhere and changes no MU-MIMO number (design 2026-10-04 §4.5.4, §8 item 1);
 *   - a station **overhearing** a PPDU it is not addressed in is decoding the preamble, which
 *     spans the whole bandwidth — the same thing `decodeThreshDb` says of it by holding it to
 *     the robust header's threshold rather than to any member's MCS.
 *
 * The share is read from `ruFraction`, never counted off `muParts.length` (design §4.5.4): the
 * member count and the share are two different facts the moment anything allocates unevenly,
 * and only one of them is on the member.
 *
 * **Uplink comes in through the other branch, and it is not a fourth whole-channel case.** A
 * trigger-based PPDU is the station's own single-user frame with no `muParts` at all, so its
 * resource unit is on the frame itself (`FrameDesc.ru`, written by `respondToTrigger` out of
 * the Trigger's per-user RU Allocation and Common Info UL BW, standard §9.3.1.22.1). The share
 * and its position arrive as **one object**, so this branch has no default to apply. As two
 * independent optional fields they allowed a share with no position, and reading that as
 * "starts at bin 0" put every such station on the same bins — which the gate in `selCombine`
 * cannot catch, because both runs stay inside the channel. Three different fields mean a share
 * and they are not interchangeable — `MuPart.ruFraction` (a downlink member's share inside one
 * wide PPDU), `FrameDesc.ru.fraction` (a TB PPDU's own share of the solicited width) and
 * `WIFI_SEL.ruFraction` (what this function returned, written to the record).
 *
 * **`rid` is deliberately not consulted on the uplink branch**, so a station overhearing
 * someone else's TB PPDU reads that PPDU's resource unit rather than the whole channel — the
 * opposite of the downlink overhearer above, and for a reason that is in the standard rather
 * than in this engine. An HE MU PPDU's pre-HE fields span the whole bandwidth, which is what
 * the overhearer carve-out above rests on; of a TB PPDU, standard §27.3.4 says the pre-HE
 * modulated fields "are sent only on the 20 MHz channels where the STA's HE modulated fields
 * are located". A TB PPDU is narrow for everybody, addressee or not. It also keeps this
 * function consistent with `decodeThreshDb`, which already holds an overhearer of a
 * single-user frame to that frame's own MCS rather than to a preamble threshold. (The engine
 * can build this: an idle third station overhears every answer of a two-uploader round.)
 */
interface MemberShare { ruFraction: number; binStart: number }

function muMemberShare(frame: FrameDesc, rid: string, widthMhz: number): MemberShare | undefined {
  // Only a *data* PPDU is split per resource unit — the same rule `decodeThreshDb` applies just
  // below: a Trigger or an M-BA carries per-user scheduling information but is itself one
  // non-HT frame, and `isOfdmWifiPpdu` has already refused those.
  if (frame.kind !== 'data') return undefined
  if (frame.muParts === undefined) {
    const ru = frame.ru
    if (ru === undefined) return undefined
    // Every answer of one triggered round holds the same share, because `transmitTrigger`
    // computes a single `frac = 1 / users.length` for the whole round and gives every user the
    // same target duration (mac.ts) — so the runs ahead of this one are each the size of this
    // one, which is what this uniform list says. That is a fact about this engine's scheduler,
    // not about the standard, and it is the one line to change if an uneven uplink allocation
    // is ever built: `selCombine`'s overflow gate catches a start that runs *off* the channel,
    // but it would not catch one that is merely in the wrong place.
    const fractions = new Array<number>(ru.partIdx).fill(ru.fraction)
    return { ruFraction: ru.fraction, binStart: selBinStart(widthMhz, fractions, ru.partIdx) }
  }
  const idx = frame.muParts.findIndex((p) => p.dst === rid)
  if (idx < 0) return undefined
  const ruFraction = frame.muParts[idx].ruFraction
  if (ruFraction === undefined) return undefined
  // `?? 1` is `MuPart.ruFraction`'s own documented meaning ("absent means the whole width"),
  // not a fallback: a PPDU mixing members that hold a share with members that hold the whole
  // width is MU-MIMO within OFDMA, which this engine cannot build (`buildMuParts` takes a
  // boolean, so `muKind` is one or the other). Reading the shareless ones as the whole width is
  // what makes such a PPDU overflow the channel and trip the gate in `selCombine`, instead of
  // silently overlapping two members' runs.
  return { ruFraction, binStart: selBinStart(widthMhz, frame.muParts.map((p) => p.ruFraction ?? 1), idx) }
}

/** Decode SINR threshold for a frame as seen by receiver rid. */
function decodeThreshDb(frame: FrameDesc, rid: string, r: RadioState): number {
  if (frame.kind === 'ampBsReply') return AMP_BS_REQ_SNR_DB[bsUlKbps(frame)]
  if (frame.amp?.dir === 'ul') return AMP_UL_REQ_SINR_DB[frame.amp.kbps as AmpUlKbps]
  if (frame.amp?.dir === 'dl') return r.kind !== 'wifi' ? AMP_DL_REQ_SINR_DB : sinrThreshDb(6)
  // Only a multi-user data PPDU is decoded per user; a Trigger or M-BA carries
  // per-user scheduling information but is itself one non-HT frame.
  if (frame.muParts && frame.kind === 'data') {
    const part = frame.muParts.find((p) => p.dst === rid)
    const mode = frame.mode ?? 'he'
    // addressed: own part's MCS; overhearers only need the (robust) preamble/header
    return reqSinrDb(mode, part ? part.mcs : 0)
  }
  if (frame.mode && frame.mode !== 'nonht' && frame.mcs !== undefined) {
    return reqSinrDb(frame.mode, frame.mcs)
  }
  return sinrThreshDb(frame.mbps)
}

export class Channel {
  private radios = new Map<string, RadioState>()
  private active: ActiveTx[] = []
  private emittedCollisions = new Set<string>()
  /** Same-instant TX starts, applied as one batch so power decides, not order. */
  private pendingStarts: ActiveTx[] = []
  /** Memoised free-space losses between node pairs; nodes do not move during a run. */
  private bsLoss = new Map<string, number>()
  /** Transmissions started so far, which is what names a frame to the fading sampler. */
  private txSeq = 0

  constructor(
    private q: EventQueue,
    private now: () => Ns,
    private linkTable: Map<string, Map<string, number>>,
    private emit: EmitFn,
    private spectrum?: ChannelSpectrum,
    private bsGeometry?: BsGeometry,
    private fading?: ChannelFading,
  ) {
    // The other technology's power can change between our own events, so every
    // open lock re-takes its max-over-time and carrier sense is re-evaluated.
    spectrum?.s.onChange('wifi', (t) => this.onForeignChange(t))
  }

  /**
   * The band a PPDU occupies on this link: the operating centre, the PPDU's own width.
   *
   * `ampNoiseBwMhz` is a *receiver's* noise bandwidth, and it is exactly right for the two
   * receive-side queries, which integrate the foreign term over the same band as the thermal term
   * beside it. Used for the emission it is a deliberate simplification: a frame with no
   * `widthMhz` - an ACK, a BlockAck, RTS/CTS, a Trigger - goes on the air as 20 MHz at the
   * channel centre rather than as a non-HT duplicate across the operating channel. Total EIRP is
   * preserved and nothing shipped straddles a UWB band edge, but at 320 MHz on 6305 MHz a data
   * PPDU would put 70 % of its power into UWB channel 5 while the 20 MHz ACK answering it puts
   * 100 %. Centring the emission on `sp.widthMhz` for such frames is the fix, when it matters.
   */
  private ppduBand(frame: FrameDesc, sp: ChannelSpectrum): [number, number] {
    const w = ampNoiseBwMhz(frame)
    return [sp.centerMhz - w / 2, sp.centerMhz + w / 2]
  }

  private onForeignChange(t: Ns): void {
    for (const [rid, r] of this.radios) {
      for (const lock of r.locks) {
        lock.maxInterfMw = Math.max(lock.maxInterfMw, this.interferenceMw(rid, lock))
      }
    }
    this.updateAllCca(t)
  }

  register(nodeId: string, listener: PhyListener, opts: RadioOpts = {}): void {
    const kind = opts.kind ?? 'wifi'
    this.radios.set(nodeId, {
      listener, ccaBusy: false, locks: [], transmitting: false, observed: new Set(), misses: [],
      kind, ampCapable: opts.ampCapable ?? false,
      floorDbm: opts.floorDbm ?? (kind === 'bsTag' ? AMP_BS_ACTIVATION_DBM : AMP_TAG_DL_SENS_DBM),
      cca: opts.cca ?? true,
    })
  }

  isCcaBusy(nodeId: string): boolean {
    return this.radios.get(nodeId)!.ccaBusy
  }

  isTransmitting(nodeId: string): boolean {
    return this.radios.get(nodeId)!.transmitting
  }

  /** The PPDU `nodeId` has on the air at this instant, with the instant it started, or null. */
  currentTx(nodeId: string): InFlightTx | null {
    const tx = this.active.find((a) => a.txId === nodeId)
    return tx === undefined
      ? null
      : { frame: tx.frame, startNs: tx.startNs, endNs: tx.endNs }
  }

  /**
   * Is `nodeId` holding a BST-Excitation on the air at `t`? — the window in which a mono-static
   * reader can hear a reflection at all, which is also the window a tag may answer in. The MAC
   * asks the medium rather than telling it: only the medium knows what is actually radiating.
   */
  bstOpenAt(nodeId: string, t: Ns): boolean {
    const tx = this.currentTx(nodeId)
    if (tx === null) return false
    const dataEnd = bsDataEndNs(tx.frame)
    if (dataEnd === null) return false
    const offsetNs = t - tx.startNs
    return offsetNs >= dataEnd && offsetNs < dataEnd + tx.frame.amp!.rfid!.bstNs
  }

  /** What a transmission of `txDbm` at `txId` delivers at `rxId` under the backscatter law:
   * what a tag is powered by, and what a reflection of it arrives at. */
  bsRxDbm(txId: string, rxId: string, txDbm: number): number {
    return txDbm - this.bsLossDb(txId, rxId)
  }

  /**
   * What the link delivers from `tx`'s transmitter to `rxId`: the table's static level, plus
   * this PPDU's fade when the scenario turned fading on.
   *
   * It takes the transmission rather than a bare id precisely so that no caller can ask
   * without saying *which* frame it is asking about — the fade is a property of a frame on a
   * link, not of the link, and a caller that lost the frame would silently get a new draw.
   * Both layers are keyed off the transmission and nothing else: the shadow off the instant it
   * started (not "now", which would move the level under a frame that straddles a coherence
   * boundary), the small-scale fade off its `fadeKey`.
   */
  private linkDbm(tx: ActiveTx, rxId: string): number {
    const v = this.linkTable.get(tx.txId)?.get(rxId)
    // Not a level but a sentinel for "these two cannot hear each other at all"; fading a
    // sentinel would mean nothing, and it is 100 dB below any receiver's floor either way.
    if (v === undefined) return -200
    const f = this.fading
    // Fading off is the common case and has to stay bit-for-bit: hand back the table's own
    // number, untouched, rather than adding a zero to it.
    if (f === undefined) return v
    return v + fadingDb(f.cfg, f.seed, tx.txId, rxId, tx.startNs, tx.fadeKey)
  }

  /**
   * The two fading layers this reception's level was drawn through, for `RX_START` to carry —
   * or nothing at all, which is the common case.
   *
   * **Reported separately, never summed** (`records.ts` says why): the rhythms differ, and the
   * sum has no rhythm in it.
   *
   * **It answers `undefined` for exactly the receptions whose level did not come from
   * `linkDbm`**, mirroring `rxDbmOf`'s own dispatch rather than restating a guess about it: a
   * backscatter reply and a downlink RFID PPDU at a tag travel the Friis path in `bsLossDb` and
   * are immune to fading altogether, so a draw printed beside them would be a number nothing
   * read. An RFID PPDU heard by a *Wi-Fi* radio does go through `linkDbm` (shifted by the
   * charge-power difference) and so does carry both. The sentinel case carries neither either:
   * two nodes that cannot hear each other at all have no level to fade.
   *
   * The draws repeat `linkDbm`'s, deliberately — both layers are pure functions of
   * `(seed, txId, rxId, key)`, so asking twice is the same number by construction, and that is
   * the property the file header exists to protect. `tests/course/fading.test.ts` pins the
   * equality against `WIFI_SEL`'s own flat draw so the two paths cannot drift into two draws.
   */
  private fadeOf(tx: ActiveTx, rxId: string): { shadowDb: number; fastDb: number } | undefined {
    const f = this.fading
    if (f === undefined) return undefined
    const frame = tx.frame
    if (frame.kind === 'ampBsReply') return undefined
    if (frame.kind === 'ampRfid' && this.radios.get(rxId)?.kind === 'bsTag') return undefined
    if (this.linkTable.get(tx.txId)?.get(rxId) === undefined) return undefined
    return {
      shadowDb: shadowDb(f.cfg, f.seed, tx.txId, rxId, tx.startNs),
      fastDb: smallScaleDb(f.cfg, f.seed, tx.txId, rxId, tx.fadeKey),
    }
  }

  /** Free space at 2.44 GHz between two nodes of this link, plus the walls in the way. */
  private bsLossDb(txId: string, rxId: string): number {
    const key = `${txId}>${rxId}`
    const hit = this.bsLoss.get(key)
    if (hit !== undefined) return hit
    const g = this.bsGeometry
    if (g === undefined) throw new Error(`channel: ${key} needs backscatter geometry`)
    const a = g.posOf(txId)
    const b = g.posOf(rxId)
    const dM = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    const lossDb = bsPathLossDb(FREQ_24G_MHZ, dM, wallLossDb(a, b, g.walls))
    this.bsLoss.set(key, lossDb)
    return lossDb
  }

  /**
   * What a PPDU on the air delivers at `rxId`.
   *
   * The link table answers for everything that obeys the Wi-Fi law, which is everything that
   * existed before this slice. Two things do not: what a downlink RFID PPDU delivers at a
   * backscatter tag (Friis, at the charge power the PPDU itself carries), and a backscattered
   * reply, which has no transmitter — it is the excitation that reached the tag, `AMP_BS_LOSS_DB`
   * down for the modulation, travelling the same path back.
   *
   * A Wi-Fi radio hearing that same RFID PPDU is a third case, and only half of it. The law is
   * the link table's, because metres across a room are what that law is for; the *power* is not,
   * because the table holds the node's own EIRP and this PPDU radiates the charge power instead.
   * So the table's answer is shifted by the difference, which at the default 10 dBm charge from
   * a 20 dBm AP is 10 dB. One power for the whole PPDU, the loudest it reaches — the excitation
   * behind the command is quieter still, and taking the maximum is the conservative reading for
   * carrier sense and for deferral.
   */
  private rxDbmOf(tx: ActiveTx, rxId: string): number {
    const frame = tx.frame
    if (frame.kind === 'ampBsReply') {
      const incidentDbm = frame.amp?.bs?.incidentDbm
      // Nothing radiating on it, nothing reflected off it.
      if (incidentDbm === undefined) return -200
      return incidentDbm - AMP_BS_LOSS_DB - this.bsLossDb(tx.txId, rxId)
    }
    if (frame.kind === 'ampRfid') {
      const ppduDbm = txDbmAt(frame, 0)!
      if (this.radios.get(rxId)?.kind === 'bsTag') {
        return ppduDbm - this.bsLossDb(tx.txId, rxId)
      }
      // The geometry is present wherever a reader is (an inventory round exists only on a link
      // that has a backscatter tag on it); without it there is nothing to shift against.
      const g = this.bsGeometry
      if (g !== undefined) return this.linkDbm(tx, rxId) - (g.txPowerOf(tx.txId) - ppduDbm)
    }
    return this.linkDbm(tx, rxId)
  }

  /**
   * What a mono-static reader hears a reflection against: the excitation it is radiating at this
   * instant, leaking `AMP_BS_ISOLATION_DB` into its own receiver and sitting
   * `AMP_BS_READER_DR_DB` below that after digital leakage removal.
   *
   * This is the lesson in one expression — the floor rises with the excitation, so turning the
   * reader up buys no reach. With no excitation of its own on the air the reader is back to
   * thermal noise (nothing in this slice does that; a bistatic reader will).
   */
  private bsFloorDbm(rid: string, frame: FrameDesc): number {
    const tx = this.currentTx(rid)
    const excitationDbm = tx === null ? null : txDbmAt(tx.frame, this.now() - tx.startNs)
    return excitationDbm === null
      ? noiseDbm(ampNoiseBwMhz(frame))
      : readerFloorDbm(monoLeakDbm(excitationDbm))
  }

  /** The noise a reception stands against: thermal in the PPDU's bandwidth, except at a reader
   * listening for a reflection, where its own leakage is tens of dB above thermal and is the floor. */
  private noiseFloorMw(rid: string, frame: FrameDesc): number {
    return frame.kind === 'ampBsReply'
      ? mw(this.bsFloorDbm(rid, frame))
      : mw(noiseDbm(ampNoiseBwMhz(frame)))
  }

  /** Lowest RSSI at which this radio can acquire this PPDU, or null when it cannot see it as a PPDU at all. */
  private detectFloorDbm(t: Ns, rid: string, r: RadioState, frame: FrameDesc): number | null {
    // A backscatter tag has an envelope detector and no oscillator: the reader's commands are
    // the only thing it can see, and it must be powered by them to see them at all.
    if (r.kind === 'bsTag') return frame.kind === 'ampRfid' ? r.floorDbm : null
    // An Active Tx tag syncs on 40 chips and an AMP-SIG; a mono-static command has neither, so
    // it cannot see one even though both are downlink AMP PPDUs.
    if (r.kind === 'tag' && frame.kind === 'ampRfid') return null
    // A reflection exists only while the reader's own excitation is on the air. The window is
    // the gate, not half-duplex: an idle reader has nothing being reflected off anything, and
    // must not decode a reply against thermal noise.
    if (frame.kind === 'ampBsReply') {
      return r.ampCapable && this.bstOpenAt(rid, t) ? this.bsFloorDbm(rid, frame) : null
    }
    if (frame.amp?.dir === 'ul') return r.ampCapable ? ampUlSensDbm(frame.amp.kbps as AmpUlKbps) : null
    if (frame.amp?.dir === 'dl') return r.kind === 'tag' ? r.floorDbm : CCA_PD_DBM
    return r.kind === 'tag' ? null : CCA_PD_DBM
  }

  /**
   * Can this radio hear anything at all right now? Half-duplex says no while it transmits — with
   * one exception, the mono-static reader. A backscattered reply *is* the reader's own excitation
   * coming back off a tag, so it necessarily arrives inside the PPDU the reader is transmitting.
   *
   * Whether an excitation is actually radiating at that instant is `detectFloorDbm`'s question,
   * not this one: it asks it of an idle reader too, so the BST window is one positive gate
   * rather than a half-duplex side effect that stops applying the moment the reader stops
   * transmitting.
   */
  private listening(r: RadioState, frame: FrameDesc): boolean {
    return !r.transmitting || frame.kind === 'ampBsReply'
  }

  startTx(nodeId: string, frame: FrameDesc): void {
    const t = this.now()
    const me = this.radios.get(nodeId)!
    if (me.transmitting) throw new Error(`${nodeId} startTx while transmitting`)
    me.transmitting = true
    // The medium writes on the frame it is handed: a backscattered reply has its incident power
    // filled in here, before TX_START carries the frame into the records. Hand a fresh frame per
    // transmission — a reused one would keep the previous round's `incidentDbm`.
    this.fillIncidentDbm(t, nodeId, frame)

    // Half-duplex: transmitting kills any reception in progress.
    for (const lock of me.locks) {
      this.emit({ t, type: 'RX_FAIL', node: nodeId, from: lock.from, reason: 'txDuringRx' })
    }
    me.locks = []

    const tx: ActiveTx = {
      txId: nodeId, frame, startNs: t, endNs: t + frame.txTimeNs, fadeKey: `${this.txSeq++}`,
    }
    this.active.push(tx)
    const sp = this.spectrum
    if (sp) {
      // The other technology sees this PPDU as an EIRP spread over its band.
      const [lo, hi] = this.ppduBand(frame, sp)
      // The emission carries the Wi-Fi link's own path-loss law, so the mediator applies it
      // without having to work out which technology built the band.
      tx.emission = {
        txId: nodeId, eirpDbm: sp.txPowerOf(nodeId), bandLoMhz: lo, bandHiMhz: hi, pos: sp.posOf(nodeId),
        lossDb: wifiToUwbPathLossDb,
      }
      sp.s.emit('wifi', tx.emission)
    }
    this.emit({ t, type: 'TX_START', node: nodeId, frame })

    // Propagation effects land in phase 1: a MAC deciding at this same instant
    // cannot yet sense this transmission (CCA detect time, §17.3.10.6). Starts
    // sharing the instant are buffered and applied as ONE batch, strongest
    // signal first per receiver — otherwise which doomed frame held a lock in a
    // 3-way pileup would depend on the order transmitters were evaluated in.
    if (this.pendingStarts.length === 0) {
      this.q.schedule(t, () => this.applyPendingStarts(t), 1)
    }
    this.pendingStarts.push(tx)
    const dataEndNs = bsDataEndNs(frame)
    if (dataEndNs !== null) this.q.schedule(t + dataEndNs, () => this.endAmpData(tx), 1)
    this.q.schedule(tx.endNs, () => this.endTx(tx), 1)
  }

  /**
   * A backscattered reply carries no power of its own: what it puts on the air is the reader's
   * excitation as it reaches the tag, reflected. The tag cannot know that better than the medium
   * does, so unless the reply already states its incident power the channel reads it off the
   * reader's PPDU in flight and writes it onto the frame — where the reader, the records and the
   * frame detail all read it back out.
   */
  private fillIncidentDbm(t: Ns, nodeId: string, frame: FrameDesc): void {
    const bs = frame.kind === 'ampBsReply' ? frame.amp?.bs : undefined
    if (bs === undefined || bs.incidentDbm !== undefined) return
    const reader = this.currentTx(frame.dst)
    const excitationDbm = reader === null ? null : txDbmAt(reader.frame, t - reader.startNs)
    if (excitationDbm !== null) bs.incidentDbm = this.bsRxDbm(frame.dst, nodeId, excitationDbm)
  }

  private applyPendingStarts(t: Ns): void {
    const starts = this.pendingStarts
    this.pendingStarts = []
    for (const [rid, r] of this.radios) {
      const arrivals = starts
        .filter((tx) => tx.txId !== rid)
        .map((tx) => ({ tx, p: this.rxDbmOf(tx, rid) }))
        .sort((x, y) => y.p - x.p || byCodeUnit(x.tx.txId, y.tx.txId))
      for (const { tx, p } of arrivals) {
        if (!r.transmitting) r.observed.add(tx.txId)
        this.applyOneTx(t, rid, r, tx, p)
      }
    }
    this.updateAllCca(t)
  }

  private applyOneTx(t: Ns, rid: string, r: RadioState, tx: ActiveTx, p: number): void {
    const floor = this.detectFloorDbm(t, rid, r, tx.frame)
    const listening = this.listening(r, tx.frame)
    const canCoexist = r.locks.every((l) => sameGroup(l.frame, tx.frame))
    if (r.locks.length > 0 && !canCoexist) {
      if (listening && floor !== null && p >= floor && this.canCapture(t, r, p)) {
        // Capture: abandon the weak reception and re-sync to this preamble.
        // The dropped frame never reaches PHY-RXEND, so no error is indicated
        // and no EIFS is armed — the new lock's outcome decides the deferral.
        for (const lost of r.locks) {
          this.emit({ t, type: 'RX_FAIL', node: rid, from: lost.from, reason: 'capture' })
        }
        r.locks = []
        // The captured-to preamble still has to be detected: ns-3 restarts the
        // detection period after a capture (phy-entity.cc CaptureNewFrame).
        this.detectOrMiss(t, rid, r, tx, p)
      } else {
        // New signal is interference for the existing lock(s).
        for (const lock of r.locks) {
          if (p >= OVERLAP_MIN_DBM) {
            lock.overlapped = true
            lock.contributors.add(tx.txId)
          }
          lock.maxInterfMw = Math.max(lock.maxInterfMw, this.interferenceMw(rid, lock))
        }
      }
    } else if (listening && floor !== null && p >= floor) {
      // Preamble detection needs `detectThreshDb` against everything else on
      // the air; a preamble buried in interference is never detected — no
      // PHY-RXSTART, no reception to fail, no EIFS.
      this.detectOrMiss(t, rid, r, tx, p)
    }
  }

  /**
   * Message-in-message capture. 802.11 leaves receiver behaviour on a second
   * preamble undefined (§17.3.10.6 specifies only detection), but real radios
   * abandon a weak reception and re-sync to a markedly stronger preamble that
   * arrives while they are still acquiring. Modelling it keeps the outcome of a
   * simultaneous start a function of signal strength rather than of the order
   * the transmitters happen to be evaluated in.
   */
  private canCapture(t: Ns, r: RadioState, p: number): boolean {
    return r.locks.every(
      (l) => p >= l.rxDbm + CAPTURE_MARGIN_DB && t - l.startNs < captureWindowNs(l.frame),
    )
  }

  private acquireLock(t: Ns, rid: string, r: RadioState, tx: ActiveTx, p: number): void {
    const lock: Lock = {
      from: tx.txId, frame: tx.frame, rxDbm: p, fadeKey: tx.fadeKey, startNs: t,
      maxInterfMw: 0, overlapped: false, contributors: new Set(),
    }
    r.locks.push(lock)
    lock.maxInterfMw = this.interferenceMw(rid, lock)
    for (const id of this.overlappersOf(rid, lock)) lock.contributors.add(id)
    lock.overlapped = lock.contributors.size > 0
    this.emit({ t, type: 'RX_START', node: rid, from: tx.txId, frame: tx.frame, ...this.fadeOf(tx, rid) })
    r.listener.onRxStart(t, tx.frame, tx.txId)
  }

  private endTx(tx: ActiveTx): void {
    const t = this.now()
    this.active = this.active.filter((a) => a !== tx)
    if (this.spectrum && tx.emission) this.spectrum.s.retire('wifi', tx.emission)
    this.emit({ t, type: 'TX_END', node: tx.txId, frame: tx.frame })
    this.radios.get(tx.txId)!.transmitting = false

    // Resolve receptions locked onto this frame.
    for (const [rid, r] of this.radios) {
      r.observed.delete(tx.txId)
      const missIdx = r.misses.findIndex((m) => m.from === tx.txId)
      if (missIdx >= 0) {
        // An undetected preamble leaves no reception, but when it was buried
        // by another transmission that is still a collision to draw.
        const miss = r.misses.splice(missIdx, 1)[0]
        // Frames that buried each other's preambles at one instant are one
        // collision, keyed on that instant rather than on each frame's end.
        if (miss.contributors.size > 0) this.emitCollision(t, tx.txId, miss.contributors, -miss.startNs - 1)
      }
      this.resolveLock(t, rid, r, tx.txId)
    }
    this.updateAllCca(t)
  }

  /**
   * The end of AMP-Data in a downlink RFID PPDU, where a backscatter tag's reception ends: what
   * follows is carrier, not information, and the tag has to reflect its answer T1 into that same
   * carrier. Resolving the tag's lock here is what lets one PPDU be both the question and the
   * power to answer it — and it is why the tag's own transmission never cuts a reception short.
   * Wi-Fi radios decode the L-SIG and defer for the whole length, so theirs resolve at the end.
   */
  private endAmpData(tx: ActiveTx): void {
    if (!this.active.includes(tx)) return
    const t = this.now()
    // Nothing started or ended on the air, so no radio's carrier sense can have changed.
    for (const [rid, r] of this.radios) {
      if (r.kind === 'bsTag') this.resolveLock(t, rid, r, tx.txId)
    }
  }

  /**
   * The frequency-selective decode decision for this lock, or null when it does not apply —
   * the only place in this engine where a reception is judged on more than one level.
   *
   * Null is returned **before any bin is computed**, which is the point of the two guards'
   * order: a scenario with no `selectivity` section reaches the scalar arithmetic below
   * untouched, rather than combining a channel whose deviations all happen to be zero. That
   * second route would be a different floating-point expression for the same physics, and the
   * recorded timeline hashes would move under every existing lesson (design doc §8.1, and the
   * same rule `linkDbm` states for fading a few hundred lines up).
   *
   * What it computes (design doc §3.1 to §3.3):
   *
   * - **the bins** — how many this decision reads, and *which* ones. The channel's own count
   *   comes from the PPDU's width by the standard's own arithmetic (`selBins` = 9 per 20 MHz,
   *   standard be §9.4.1.75): 9 for a 20 MHz PPDU, 72 for a 160 MHz one. An **OFDMA member
   *   reads only its own resource unit** — `selMemberBins` of its own `ruFraction`, beginning
   *   at `selBinStart` — because that is the only part of the channel its data is carried in.
   *   Until slice 4b every member was credited with the whole channel's diversity, i.e.
   *   over-counted by exactly the member count (design 2026-10-04 §6.2). `WIFI_SEL.ruFraction`
   *   is what tells a reader which of the two a given `bins` is, and `muMemberShare` above
   *   lists the three receivers that still read the whole channel on purpose.
   * - **the mean** by taking this frame's flat fast fade back *out* of the level the lock was
   *   acquired at. `rxDbm` carries it (via `linkDbm`), and the per-bin draws replace it rather
   *   than stack on it: a frequency-selective channel's per-bin deviations are the fast layer,
   *   so adding both would fade this frame twice and would make `lossDb` a mix of the two.
   *   What remains — path loss, walls, and the slow shadow, which stays flat across the
   *   channel because a shadow is the whole channel together (§3.2) — is the mean the standard's
   *   own field is defined relative to, and it is what `WIFI_SEL.meanSinrDb` reports.
   * - **the per-bin deviations** from the *existing* sampler at the *existing* distribution and
   *   K factor, keyed by bin (`smallScaleDb`'s bin argument, Task 1). No new `model` number.
   * - **one effective SINR** by capacity, not by the worst bin and not by EESM — see
   *   `selEffSinrDb`, which carries that argument and its honest cost.
   *
   * Not handled here, deliberately: the interference term stays flat. `maxInterfMw` is the
   * worst *instant* of noise plus every overlapping transmitter, summed over the PPDU's whole
   * width, and it enters each bin's SINR as the same number. Thermal noise genuinely is flat
   * across the channel, so this is exact for the common case of a lone reception; an
   * *interferer* is as frequency-selective as the signal, and that part is a simplification
   * this slice does not model, in the direction of making a collision slightly more uniform
   * than it is. The other four Wi-Fi decisions — carrier sense, preamble detection, capture
   * and rate selection — keep reading one scalar level too (design §2.3's table).
   */
  private selCombine(rid: string, lock: Lock): SelCombined | null {
    const f = this.fading
    if (f === undefined || f.selective !== true) return null
    if (!isOfdmWifiPpdu(lock.frame)) return null
    const widthMhz = lock.frame.widthMhz ?? DEFAULT_WIDTH_MHZ
    const full = selBins(widthMhz)
    const share = muMemberShare(lock.frame, rid, widthMhz)
    const bins = share === undefined ? full : selMemberBins(widthMhz, share.ruFraction)
    const start = share === undefined ? 0 : share.binStart
    if (!Number.isInteger(bins) || bins < 1) {
      // A loud floor under a programming error, not a runtime case: `widthMhz` comes from
      // `ChannelWidth` (20/40/80/160/320), every one of which divides into a whole number of
      // *reportable* 26-tone RUs (design 2026-10-04 §0.3 — reportable, not HE's physical
      // count, which is 37 rather than 36 at 80 MHz), and `selMemberBins` returns a whole
      // number of them by construction. Left alone, a fractional count would silently truncate
      // the bin loop and record a non-integer `bins`.
      throw new Error(
        `channel: ${bins} is not a whole number of reportable 26-tone RUs `
        + `(${widthMhz} MHz, share ${share === undefined ? 'whole channel' : share.ruFraction})`,
      )
    }
    if (start + bins > full) {
      // This is slice 4b's real new gate: resource units are laid down as consecutive runs, so
      // the last run passing the channel edge is the only way a PPDU can claim more of the
      // channel than the channel has.
      //
      // **Two different causes reach it, and the message must not diagnose one as the other.**
      //
      //   1. *The shares really do sum past 1.* Under MU-MIMO within OFDMA several members
      //      share one resource unit and every one of their shares is correct (design §4.5.2,
      //      §4.5.6) — so even then this is not "these shares are wrong". It is an overlay this
      //      engine does not build: `buildMuParts` takes a boolean, so `muKind` is one or the
      //      other, and that exclusivity is the premise the gate holds under.
      //   2. *The shares fit and the one-bin floor does not.* `selMemberBins` floors at one bin
      //      (a 26-tone RU is the smallest thing anyone can hold), so n members claim at least
      //      n bins however thin their shares are, and an **exactly equal, entirely legal**
      //      split overflows the channel as soon as n passes the channel's bin count. Reporting
      //      that as an overlay would send the next reader hunting for something that was never
      //      built.
      //
      // The sum printed below is what tells them apart: at or below 1, the floor overflowed and
      // the shares did not.
      //
      // **And what keeps this gate unreachable today is the group-size cap, not the even
      // division.** `mac.ts` caps a group at four — `muDsts.slice(0, 4)` downlink and
      // `users.slice(0, 4)` for a Trigger's users — while the narrowest channel has nine bins,
      // so four floors of one can never reach ten. Raise that cap past `selBins(20) = 9` and
      // cause 2 fires on an allocation with nothing wrong with it.
      // `tests/engine/selectivity.test.ts` pins that arithmetic, so the cap and this gate
      // cannot drift apart without a test saying so.
      //
      // A trigger-based PPDU reaches this gate too, and there the shares to print are not a
      // member list: the frame carries its own one share and its own index, and not the round's
      // user count, so no sum can be formed from one answer.
      const shares = lock.frame.muParts?.map((p) => p.ruFraction ?? 1)
      const where = shares === undefined
        ? `trigger-based PPDU, own share ${lock.frame.ru?.fraction} at user slot `
          + `${lock.frame.ru?.partIdx}; one answer per PPDU, so this frame carries no user `
          + `count and no sum`
        : `muKind ${lock.frame.muKind}, ${shares.length} members, ruFraction `
          + `[${lock.frame.muParts!.map((p) => p.ruFraction ?? 'absent, read as 1').join(', ')}]`
          + `, summing to ${shares.reduce((s, v) => s + v, 0)}`
      throw new Error(
        `channel: ${rid} <- ${lock.from}: bins ${start}..${start + bins - 1} leave the ${full} `
        + `bins of this ${widthMhz} MHz PPDU. Either the shares of this transmission sum past `
        + `the whole channel — MU-MIMO within OFDMA, which this engine does not model — or they `
        + `fit and the one-bin floor does not, which is a legal equal split among more members `
        + `than the channel has bins. The sum says which: at or below 1 it is the floor, not `
        + `the shares (${where})`,
      )
    }
    const flatFadeDb = smallScaleDb(f.cfg, f.seed, lock.from, rid, lock.fadeKey)
    const devsDb: number[] = []
    for (let bin = start; bin < start + bins; bin++) {
      devsDb.push(smallScaleDb(f.cfg, f.seed, lock.from, rid, lock.fadeKey, bin))
    }
    const meanSinrDb = lock.rxDbm - flatFadeDb - dbm(lock.maxInterfMw)
    const effSinrDb = selEffSinrDb(meanSinrDb, devsDb)
    return {
      meanSinrDb, effSinrDb, lossDb: meanSinrDb - effSinrDb, bins, binStart: start, widthMhz,
      worstBinDb: Math.min(...devsDb),
      // Absent, not zero or one, when the whole channel was read: the record's own way of
      // saying "this `bins` is the channel's count", which is what `bins` alone used to mean.
      ...(share === undefined ? {} : { ruFraction: share.ruFraction }),
    }
  }

  /** Decode a reception against the worst SINR it saw, or fail it. */
  private resolveLock(t: Ns, rid: string, r: RadioState, from: string): void {
    const lockIdx = r.locks.findIndex((l) => l.from === from)
    if (lockIdx < 0) return
    const lock = r.locks[lockIdx]
    r.locks.splice(lockIdx, 1)
    const threshDb = decodeThreshDb(lock.frame, rid, r)
    const sel = this.selCombine(rid, lock)
    // Frequency selectivity on, and on an OFDM PPDU: the decision is the combined effective
    // SINR. Otherwise the scalar expression this engine has always used, character for
    // character, so no existing timeline can move.
    const sinrDb = sel === null ? lock.rxDbm - dbm(lock.maxInterfMw) : sel.effSinrDb
    if (sel !== null) {
      // Before the outcome, so a reader sees what the decision was made on and then what it
      // was: this is the only record in the Wi-Fi stream that carries a level at all.
      this.emit({ t, type: 'WIFI_SEL', node: rid, from, threshDb, ...sel })
    }
    if (sinrDb >= threshDb) {
      this.emit({ t, type: 'RX_OK', node: rid, from, frame: lock.frame })
      r.listener.onRxOk(t, lock.frame, from)
    } else {
      const reason = lock.overlapped ? 'collision' : 'lowSinr'
      this.emit({ t, type: 'RX_FAIL', node: rid, from, reason })
      if (reason === 'collision') this.emitCollision(t, from, lock.contributors)
      r.listener.onRxCorrupt(t)
    }
  }

  private emitCollision(t: Ns, failedTxId: string, contributors: Set<string>, keyNs: Ns = t): void {
    // The lock accumulated its overlappers as they appeared — an interferer
    // that already ended still belongs in the record.
    const nodes = [failedTxId, ...contributors].sort()
    const key = `${nodes.join(',')}@${keyNs}`
    if (this.emittedCollisions.has(key)) return
    this.emittedCollisions.add(key)
    this.emit({ t, type: 'COLLISION', nodes })
  }

  /**
   * Preamble detection: a PPDU at or above its receiver's floor is acquired
   * only if its SINR against everything else on the air clears
   * `detectThreshDb` — 4 dB for a blind Wi-Fi search; otherwise it is recorded
   * as missed — no reception, so no EIFS.
   */
  private detectOrMiss(t: Ns, rid: string, r: RadioState, tx: ActiveTx, p: number): void {
    const others = this.othersMw(rid, tx)
    const sinr = p - dbm(this.noiseFloorMw(rid, tx.frame) + others.mw)
    if (sinr >= detectThreshDb(tx.frame)) {
      // Receiver acquires the preamble (possibly alongside RU-orthogonal peers).
      this.acquireLock(t, rid, r, tx, p)
      return
    }
    this.emit({ t, type: 'RX_MISS', node: rid, from: tx.txId, reason: 'preambleSinr', frame: tx.frame })
    r.misses.push({ from: tx.txId, startNs: t, contributors: others.overlappers })
  }

  /** Sum of every other active signal at rid (excluding tx and its RU-orthogonal peers), and who overlaps meaningfully. */
  private othersMw(rid: string, tx: ActiveTx): { mw: number; overlappers: Set<string> } {
    let sum = 0
    const overlappers = new Set<string>()
    for (const a of this.active) {
      if (a.txId === rid || a === tx || sameGroup(a.frame, tx.frame)) continue
      const p = this.rxDbmOf(a, rid)
      sum += mw(p)
      if (p >= OVERLAP_MIN_DBM) overlappers.add(a.txId)
    }
    const sp = this.spectrum
    if (sp) {
      // Foreign power raises the noise a preamble has to stand out from; it has
      // no transmitter on this link, so it never names a collision.
      const [lo, hi] = this.ppduBand(tx.frame, sp)
      sum += sp.s.foreignMw('wifi', sp.posOf(rid), lo, hi)
    }
    return { mw: sum, overlappers }
  }

  /** Interference+noise in mW at rid for a given lock (excludes its own tx and RU-orthogonal peers). */
  private interferenceMw(rid: string, lock: Lock): number {
    // thermal noise in the width of the PPDU being received — or, for a reflection, the
    // reader's own leakage, which sits far above it
    let sum = this.noiseFloorMw(rid, lock.frame)
    for (const a of this.active) {
      if (a.txId === rid || a.txId === lock.from) continue
      if (sameGroup(a.frame, lock.frame)) continue
      sum += mw(this.rxDbmOf(a, rid))
    }
    const sp = this.spectrum
    if (sp) {
      const [lo, hi] = this.ppduBand(lock.frame, sp)
      sum += sp.s.foreignMw('wifi', sp.posOf(rid), lo, hi)
    }
    return sum
  }

  /** Transmitters currently overlapping a lock meaningfully (≥ OVERLAP_MIN). */
  private overlappersOf(rid: string, lock: Lock): string[] {
    return this.active
      .filter(
        (a) =>
          a.txId !== rid && a.txId !== lock.from &&
          !sameGroup(a.frame, lock.frame) &&
          this.rxDbmOf(a, rid) >= OVERLAP_MIN_DBM,
      )
      .map((a) => a.txId)
  }

  private updateAllCca(t: Ns): void {
    for (const [rid, r] of this.radios) {
      if (!r.cca) continue
      let busy: boolean
      let cause: 'energy' | 'preamble' = 'energy'
      if (r.transmitting) {
        busy = true
      } else {
        let sum = 0
        let anyPd = false
        for (const a of this.active) {
          if (a.txId === rid) continue
          const p = this.rxDbmOf(a, rid)
          sum += mw(p)
          // −82 dBm applies to a PPDU whose preamble this radio could see;
          // one that began during our own transmission counts only as energy.
          // An AMP UL PPDU is below Wi-Fi's preamble-detect floor, so it can
          // only ever hold CCA busy through raw energy, never as 'preamble'.
          if (p >= CCA_PD_DBM && r.observed.has(a.txId) && a.frame.amp?.dir !== 'ul') anyPd = true
        }
        const sp = this.spectrum
        if (sp) {
          // Energy detection listens over the whole operating channel, whatever
          // width the PPDU on it happens to use. A foreign signal is never a
          // detectable preamble, so it can only ever hold CCA busy as energy.
          sum += sp.s.foreignMw(
            'wifi', sp.posOf(rid), sp.centerMhz - sp.widthMhz / 2, sp.centerMhz + sp.widthMhz / 2,
          )
        }
        busy = anyPd || sum >= mw(CCA_ED_DBM) || r.locks.length > 0
        cause = anyPd || r.locks.length > 0 ? 'preamble' : 'energy'
      }
      if (busy !== r.ccaBusy) {
        r.ccaBusy = busy
        if (busy) {
          this.emit({ t, type: 'CCA_BUSY', node: rid, cause })
          r.listener.onCcaBusy(t)
        } else {
          this.emit({ t, type: 'CCA_IDLE', node: rid })
          r.listener.onCcaIdle(t)
        }
      }
    }
  }
}
