/**
 * UWB timeline records. They join the Wi-Fi ones in TLRecord, so the player,
 * the event log and the view reducer replay one single ordered stream.
 */
import type { UwbMode } from '../model/scenario'
import type { Ns } from '../model/types'
import type { UwbFrameKind } from './frames'

/** How a fix was solved: from two-way ranges, from downlink or uplink time differences, or
 * from an angle. The record carries it so one overlay, one log line and one inspector row can
 * say which of the four produced the position they are showing. */
export type UwbFixMethod = 'twr' | 'dl-tdoa' | 'ul-tdoa' | 'aoa'

/** What a `UWB_MMS_TRAIN` carries for `rxDbm` and `marginDb` when nothing of the train was
 * heard: a received power no receiver could ever report, in place of the −Infinity the
 * arithmetic would give and JSON cannot carry. model */
export const NOTHING_HEARD_DBM = -999

export type UwbRecord =
  /** A ranging round: the round's shape, what it measures and the deadline of its last slot.
   * Opened by the tag's Poll in two-way ranging, by anchor 0's Poll in DL-TDoA (where every
   * listening tag emits one of these for the one round the anchors run). */
  | { type: 'UWB_ROUND'; node: string; block: number; round: number; slots: number; slotNs: Ns; method: 'ss' | 'ds'; mode: UwbMode; untilNs: Ns }
  /** The round has moved to this ranging slot. */
  | { type: 'UWB_SLOT'; node: string; slot: number; untilNs: Ns }
  /** A ranging counter reading: the RMARKER of a transmitted or received frame. */
  | { type: 'UWB_TS'; node: string; dir: 'tx' | 'rx'; peer: string; frameKind: UwbFrameKind; counter: number; fom?: number }
  /** One finished range to a peer, with the geometric truth beside it. `integrity` is present
   * only in an MMS round that carries an integrity train (Y > 0): it says whether that train
   * was detected, i.e. whether the scrambled-timestamp segments vouched for the range. */
  | { type: 'UWB_RANGE'; node: string; peer: string; method: 'ss' | 'ds'; tofRctu: number; tofRawRctu?: number; distM: number; trueDistM: number; fom: number; block: number; round: number; integrity?: boolean }
  /** One time difference of arrival: how much later the peer's message arrived than the
   * reference's, with the geometric truth beside it. `dtNs` is the measurement after every
   * correction the mode applies. In DL-TDoA the listening tag measures it and `trueDtNs` is
   * (d(node, peer) − d(node, ref)) / c; in UL-TDoA the infrastructure measures a *tag's* blink,
   * so `node` is the reference anchor, `of` names the tag, and the truth is about the tag:
   * (d(of, peer) − d(of, ref)) / c. */
  | { type: 'UWB_TDOA'; node: string; ref: string; peer: string; dtNs: number; trueDtNs: number; block: number; round: number; of?: string }
  /** One bearing: the azimuth an anchor measured to a tag from the phase difference between
   * its two antennas, in degrees from its own boresight (positive to its left), with the
   * geometric truth beside it. Emitted at the anchor, once per frame it received from the tag
   * in the round — and, behind the anchor, mirrored into the front half by the physics of a
   * two-element array (src/uwb/aoa.ts), which is exactly what `trueThetaDeg` is there to show. */
  | { type: 'UWB_AOA'; node: string; peer: string; thetaDeg: number; trueThetaDeg: number; block: number; round: number }
  /** A 2-D fix solved from this block's ranges or time differences. `method` says which, and
   * `of` names the node the fix is *about* when that is not `node` itself (UL-TDoA, where the
   * infrastructure solves a tag's position). */
  | { type: 'UWB_POSITION'; node: string; x: number; y: number; trueX: number; trueY: number; gdop: number; ellipse: { a: number; b: number; thetaRad: number }; anchors: string[]; block: number; method: UwbFixMethod; of?: string }
  /** A slot passed with no answer from the peer it was scheduled for. */
  | { type: 'UWB_TIMEOUT'; node: string; slot: number; peer: string; expected: UwbFrameKind }
  /** Contention round (standard §10.32.2 schedule mode 0): an anchor that decoded the Poll drew
   * the response slot it will answer in — `slot` null when its retry budget ran out and it sits
   * this round out, and `attempt` counts from 1 (0 while sitting out). */
  | { type: 'UWB_CONTEND'; node: string; slot: number | null; attempt: number }
  /** Contention round: the tag lost the response slot to overlapping answers. Emitted once per
   * slot, at the tag, whenever a response in it failed under the medium's capture rule — so a
   * slot where one anchor was captured 6 dB above another is counted too: a response was lost. */
  | { type: 'UWB_CONTEND_COLLISION'; node: string; slot: number }
  /** The tag's round is over (emitted after any UWB_POSITION it produced): the radio goes
   * off until the next block, and the view's `slot` returns to null. */
  | { type: 'UWB_ROUND_END'; node: string; block: number; round: number }
  /** P802.15.4ab: a narrowband transmission that never happened. The device sampled the
   * channel's foreign power before transmitting (the draft's listen-before-talk) and found it
   * at or above the energy-detection threshold, so it transmits nothing on narrowband for the
   * rest of the block. Emitted on a **busy** check only — a clear one is the ordinary case and
   * says nothing. */
  | { type: 'UWB_NB_LBT'; node: string; channel: number; foreignDbm: number; thresholdDbm: number; block: number; round: number }
  /**
   * P802.15.4ab: what one receiver made of one peer's fragment train, at the slot after that
   * train's last fragment. `fragments` is how many the train held (X for an RSF train, Y for an
   * RIF one) and `heard` how many arrived; `gainDb` is what those combine to (10·log10(heard)),
   * and `marginDb` how far the combined train clears the receiver's sensitivity — the number
   * the whole multi-millisecond idea is about. `marginDb = rxDbm + gainDb − UWB_RX_SENS_DBM`
   * holds whenever anything was heard at all, and only then: a train nothing was heard of
   * carries the sentinel below in both `rxDbm` and `marginDb`, and the identity says nothing
   * about it.
   *
   * `rxDbm` is one fragment's received power (they are equal in a static scene, so the first
   * heard one stands for the train). **Sentinel**: a train nothing was heard of has no received
   * power and no margin at all, and both fields carry `NOTHING_HEARD_DBM` (−999 dBm) rather than
   * −Infinity or null — every timeline record is serialised to JSON for the view and the
   * fixtures, and neither of those survives a round trip.
   *
   * `ratioPpm` is the clock ratio the train measured against this receiver's own crystal, minus
   * one, in ppm — null when fewer than two fragments were heard, which is the case the range
   * falls back to the narrowband carrier estimate in.
   *
   * That ratio is also what the train's `UWB_TS` is walked back with when the leading fragments
   * were lost: the RMARKER is `index` of the *peer's* milliseconds before the first fragment
   * that did arrive, and this receiver counts its own (`rmarkerFromFragment`, src/uwb/mms.ts).
   * With no ratio to scale by, the nominal millisecond leaves `index` × 1 ms × the offset
   * between the two crystals — 3.0 m of range per lost leading fragment at 20 ppm.
   */
  | { type: 'UWB_MMS_TRAIN'; node: string; peer: string; kind: 'rsf' | 'rif'; fragments: number; heard: number; rxDbm: number; gainDb: number; marginDb: number; detected: boolean; ratioPpm: number | null; block: number; round: number }
  /** A reception that nothing else on the UWB medium spoiled was still lost, to in-band
   * Wi-Fi power: the worst signal-to-interference ratio over the frame fell below
   * `UWB_SIR_MIN_DB`. Emitted at the receiver, straight after that frame's RX_FAIL, so
   * the coexistence lesson can count what the 6 GHz link costs the ranging session. */
  | { type: 'UWB_INTERFERED'; node: string; from: string; foreignDbm: number; sirDb: number }
