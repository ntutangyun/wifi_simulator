/**
 * UWB timeline records. They join the Wi-Fi ones in TLRecord, so the player,
 * the event log and the view reducer replay one single ordered stream.
 */
import type { Ns } from '../model/types'
import type { UwbFrameKind } from './frames'

export type UwbRecord =
  /** A ranging round opened by a tag's Poll: the round's shape and the deadline of its last slot. */
  | { type: 'UWB_ROUND'; node: string; block: number; round: number; slots: number; slotNs: Ns; method: 'ss' | 'ds'; untilNs: Ns }
  /** The round has moved to this ranging slot. */
  | { type: 'UWB_SLOT'; node: string; slot: number; untilNs: Ns }
  /** A ranging counter reading: the RMARKER of a transmitted or received frame. */
  | { type: 'UWB_TS'; node: string; dir: 'tx' | 'rx'; peer: string; frameKind: UwbFrameKind; counter: number; fom?: number }
  /** One finished range to a peer, with the geometric truth beside it. */
  | { type: 'UWB_RANGE'; node: string; peer: string; method: 'ss' | 'ds'; tofRctu: number; tofRawRctu?: number; distM: number; trueDistM: number; fom: number; block: number; round: number }
  /** A 2-D fix solved from this block's ranges. */
  | { type: 'UWB_POSITION'; node: string; x: number; y: number; trueX: number; trueY: number; gdop: number; ellipse: { a: number; b: number; thetaRad: number }; anchors: string[]; block: number }
  /** A slot passed with no answer from the peer it was scheduled for. */
  | { type: 'UWB_TIMEOUT'; node: string; slot: number; peer: string; expected: UwbFrameKind }
  /** The tag's round is over (emitted after any UWB_POSITION it produced): the radio goes
   * off until the next block, and the view's `slot` returns to null. */
  | { type: 'UWB_ROUND_END'; node: string; block: number; round: number }
