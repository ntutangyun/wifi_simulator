/**
 * The UWB half of the view reducer. It owns every UWB_* record so that
 * model/view.ts stays the Wi-Fi reducer it already is, and so the same
 * snapshot/replay equivalence holds for ranging state.
 */
import type { TLRecord } from '../model/records'
import type { UwbNodeCfg } from '../model/scenario'
import type { ViewState } from '../model/view'
import type { UwbFixMethod } from './records'

/** The latest range to one peer, with the geometric truth and how many have landed. */
export interface UwbRangeView {
  distM: number
  trueDistM: number
  method: 'ss' | 'ds'
  fom: number
  /** Ranging block this measurement came from: what the scene overlay ages its ring by. */
  block: number
  n: number
}

/** The latest time difference of arrival against one peer, with the truth beside it. */
export interface UwbTdoaView {
  /** Peer arrival minus reference arrival, in nanoseconds, after the mode's corrections. */
  dtNs: number
  trueDtNs: number
  n: number
}

/** The latest bearing to one peer, with the geometric truth beside it. Degrees from the
 * measuring anchor's own boresight, positive to its left. */
export interface UwbAoaView {
  thetaDeg: number
  trueThetaDeg: number
  n: number
}

/** The latest position fix, with the truth beside it and how many have landed. */
export interface UwbPositionView {
  x: number
  y: number
  trueX: number
  trueY: number
  gdop: number
  ellipse: { a: number; b: number; thetaRad: number }
  /** What solved it: two-way ranges, one-way time differences, or an angle. */
  method: UwbFixMethod
  /** The anchors it was solved from, in the order the record listed them. An angle fix names
   * exactly one — the anchor that measured both the range and the bearing — which is what lets
   * the overlay draw that bearing from the right place on the floor. */
  anchors: string[]
  /** Ranging block this fix was solved in: what the scene overlay ages the cross and ellipse by. */
  block: number
  n: number
}

export interface UwbNodeView {
  role: 'anchor' | 'tag'
  block: number
  round: number
  /** Ranging slot the round is in, or null between rounds. */
  slot: number | null
  rounds: number
  timeouts: number
  /** Receptions lost to in-band Wi-Fi power (UWB_INTERFERED), counted at the receiver. */
  interfered: number
  /** Contention round, anchor: its latest draw — `slot` null while it sits a round out. It is
   * the last one made, not one cleared between rounds: an anchor sees no UWB_ROUND_END. */
  contend: { slot: number | null; attempt: number } | null
  /** Contention round, tag: response slots lost to overlapping answers (UWB_CONTEND_COLLISION). */
  contendCollisions: number
  /** Per peer id. */
  ranges: Record<string, UwbRangeView>
  /** One-way ranging: the latest time difference per peer, all against the same reference
   * anchor (the round's anchor 0), which is why the reference itself never has a row. */
  tdoa: Record<string, UwbTdoaView>
  /** The anchor every one of those differences is taken against, or null before the first one
   * lands. It is constant per node, so it sits beside the map rather than on every row - and
   * without it a reader of "anc-2 -8.24 ns" has no way to tell what it is -8.24 ns later than. */
  tdoaRef: string | null
  /** Angle-of-arrival sessions, anchor: the latest bearing it measured to each tag. It sits on
   * the *anchor's* lane, unlike the fix that bearing helps solve — the bearing is the anchor's
   * own measurement, and two anchors watching one tag each have their own. */
  aoa: Record<string, UwbAoaView>
  position: UwbPositionView | null
}

export function initUwbNodeView(cfg: UwbNodeCfg): UwbNodeView {
  return {
    role: cfg.role, block: 0, round: 0, slot: null, rounds: 0, timeouts: 0, interfered: 0,
    contend: null, contendCollisions: 0, ranges: {}, tdoa: {}, tdoaRef: null, aoa: {}, position: null,
  }
}

/**
 * The lane a measurement belongs on: the node the record is *about*, which is the node that
 * emitted it in every mode but UL-TDoA. There the infrastructure measures a tag that never
 * transmits again and names it in `of` — and the tag's own lane is where a reader (and the 3-D
 * overlay, which draws at the lane it finds a fix on) goes looking for the tag's position.
 */
function subject(vs: ViewState, r: { node: string; of?: string }): UwbNodeView | undefined {
  return vs.nodes[r.of ?? r.node]?.uwb
}

/** Applies one UWB_* record; returns true when it handled it. */
export function applyUwbRecord(vs: ViewState, r: TLRecord): boolean {
  switch (r.type) {
    case 'UWB_ROUND': {
      const u = vs.nodes[r.node]?.uwb
      if (u) {
        u.block = r.block
        u.round = r.round
        u.slot = 0
        u.rounds += 1
      }
      return true
    }
    case 'UWB_SLOT': {
      const u = vs.nodes[r.node]?.uwb
      if (u) u.slot = r.slot
      return true
    }
    case 'UWB_TS':
      // Timestamps are event-log detail: they change no lane state.
      return true
    case 'UWB_RANGE': {
      const u = vs.nodes[r.node]?.uwb
      if (u) {
        const prev = u.ranges[r.peer]
        u.ranges[r.peer] = {
          distM: r.distM, trueDistM: r.trueDistM, method: r.method, fom: r.fom, block: r.block, n: (prev?.n ?? 0) + 1,
        }
        // An anchor never sees UWB_ROUND / UWB_SLOT (those are the tag's own records),
        // so its block and round come from the ranges it computes. A tag takes them
        // from its own UWB_ROUND / UWB_ROUND_END instead.
        if (u.role === 'anchor') {
          u.block = r.block
          u.round = r.round
        }
      }
      return true
    }
    case 'UWB_AOA': {
      const u = vs.nodes[r.node]?.uwb
      if (u) {
        const prev = u.aoa[r.peer]
        u.aoa[r.peer] = { thetaDeg: r.thetaDeg, trueThetaDeg: r.trueThetaDeg, n: (prev?.n ?? 0) + 1 }
        // As with a range: an anchor sees none of the tag's round records, so the bearings it
        // measures are what move its block and round. In an SS round they are the only thing
        // that can — the anchor computes no range there at all.
        if (u.role === 'anchor') {
          u.block = r.block
          u.round = r.round
        }
      }
      return true
    }
    case 'UWB_TDOA': {
      const u = subject(vs, r)
      if (u) {
        const prev = u.tdoa[r.peer]
        u.tdoa[r.peer] = { dtNs: r.dtNs, trueDtNs: r.trueDtNs, n: (prev?.n ?? 0) + 1 }
        u.tdoaRef = r.ref
      }
      return true
    }
    case 'UWB_POSITION': {
      const u = subject(vs, r)
      if (u) {
        u.position = {
          x: r.x, y: r.y, trueX: r.trueX, trueY: r.trueY, gdop: r.gdop,
          ellipse: { ...r.ellipse }, method: r.method, anchors: [...r.anchors],
          block: r.block, n: (u.position?.n ?? 0) + 1,
        }
      }
      return true
    }
    case 'UWB_TIMEOUT': {
      const u = vs.nodes[r.node]?.uwb
      if (u) u.timeouts += 1
      return true
    }
    case 'UWB_INTERFERED': {
      const u = vs.nodes[r.node]?.uwb
      if (u) u.interfered += 1
      return true
    }
    case 'UWB_CONTEND': {
      const u = vs.nodes[r.node]?.uwb
      if (u) u.contend = { slot: r.slot, attempt: r.attempt }
      return true
    }
    case 'UWB_CONTEND_COLLISION': {
      const u = vs.nodes[r.node]?.uwb
      if (u) u.contendCollisions += 1
      return true
    }
    case 'UWB_ROUND_END': {
      const u = vs.nodes[r.node]?.uwb
      if (u) {
        u.block = r.block
        u.round = r.round
        u.slot = null
      }
      return true
    }
    default:
      return false
  }
}

/**
 * The 1-σ ellipse of a good fix is a couple of centimetres across — invisible
 * beside a 3.5 m ring — so the scene draws it at 10×; the inspector shows the
 * true axes. Every tooltip that quotes the ellipse must quote this factor with
 * it. It lives here, not in scene.ts, so lessons and the Guide can import it
 * without pulling three.js in.
 */
export const ELLIPSE_DRAW_SCALE = 10
