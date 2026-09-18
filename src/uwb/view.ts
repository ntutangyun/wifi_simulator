/**
 * The UWB half of the view reducer. It owns every UWB_* record so that
 * model/view.ts stays the Wi-Fi reducer it already is, and so the same
 * snapshot/replay equivalence holds for ranging state.
 */
import type { TLRecord } from '../model/records'
import type { UwbNodeCfg } from '../model/scenario'
import type { ViewState } from '../model/view'

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

/** The latest position fix, with the truth beside it and how many have landed. */
export interface UwbPositionView {
  x: number
  y: number
  trueX: number
  trueY: number
  gdop: number
  ellipse: { a: number; b: number; thetaRad: number }
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
  /** Per peer id. */
  ranges: Record<string, UwbRangeView>
  position: UwbPositionView | null
}

export function initUwbNodeView(cfg: UwbNodeCfg): UwbNodeView {
  return { role: cfg.role, block: 0, round: 0, slot: null, rounds: 0, timeouts: 0, ranges: {}, position: null }
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
    case 'UWB_POSITION': {
      const u = vs.nodes[r.node]?.uwb
      if (u) {
        u.position = {
          x: r.x, y: r.y, trueX: r.trueX, trueY: r.trueY, gdop: r.gdop,
          ellipse: { ...r.ellipse }, block: r.block, n: (u.position?.n ?? 0) + 1,
        }
      }
      return true
    }
    case 'UWB_TIMEOUT': {
      const u = vs.nodes[r.node]?.uwb
      if (u) u.timeouts += 1
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
