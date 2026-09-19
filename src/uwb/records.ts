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

export type UwbRecord =
  /** A ranging round: the round's shape, what it measures and the deadline of its last slot.
   * Opened by the tag's Poll in two-way ranging, by anchor 0's Poll in DL-TDoA (where every
   * listening tag emits one of these for the one round the anchors run). */
  | { type: 'UWB_ROUND'; node: string; block: number; round: number; slots: number; slotNs: Ns; method: 'ss' | 'ds'; mode: UwbMode; untilNs: Ns }
  /** The round has moved to this ranging slot. */
  | { type: 'UWB_SLOT'; node: string; slot: number; untilNs: Ns }
  /** A ranging counter reading: the RMARKER of a transmitted or received frame. */
  | { type: 'UWB_TS'; node: string; dir: 'tx' | 'rx'; peer: string; frameKind: UwbFrameKind; counter: number; fom?: number }
  /** One finished range to a peer, with the geometric truth beside it. */
  | { type: 'UWB_RANGE'; node: string; peer: string; method: 'ss' | 'ds'; tofRctu: number; tofRawRctu?: number; distM: number; trueDistM: number; fom: number; block: number; round: number }
  /** One time difference of arrival: how much later the peer's message arrived than the
   * reference's, with the geometric truth beside it. `dtNs` is the measurement after every
   * correction the mode applies. In DL-TDoA the listening tag measures it and `trueDtNs` is
   * (d(node, peer) − d(node, ref)) / c; in UL-TDoA the infrastructure measures a *tag's* blink,
   * so `node` is the reference anchor, `of` names the tag, and the truth is about the tag:
   * (d(of, peer) − d(of, ref)) / c. */
  | { type: 'UWB_TDOA'; node: string; ref: string; peer: string; dtNs: number; trueDtNs: number; block: number; round: number; of?: string }
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
  /** A reception that nothing else on the UWB medium spoiled was still lost, to in-band
   * Wi-Fi power: the worst signal-to-interference ratio over the frame fell below
   * `UWB_SIR_MIN_DB`. Emitted at the receiver, straight after that frame's RX_FAIL, so
   * the coexistence lesson can count what the 6 GHz link costs the ranging session. */
  | { type: 'UWB_INTERFERED'; node: string; from: string; foreignDbm: number; sirDb: number }
