/**
 * Indoor RF propagation: log-distance path loss + per-wall attenuation along
 * the direct 2D ray, with door/window openings exempting their wall.
 */
import type { Material, NodeCfg, Wall } from '../model/scenario'
import type { Vec3 } from '../model/types'

export const WALL_LOSS_DB: Record<Material, number> = {
  drywall: 5,
  brick: 12,
  glass: 3,
}

/** Free-space loss at 1 m for 5.2 GHz ≈ 46.7 dB; path-loss exponent 3.0 (indoor). */
const PL0_DB = 46.7
const PL_EXP = 3.0

/**
 * Intersection of ray a→b with segment c→d.
 * Returns the parameter u ∈ [0,1] along c→d at the crossing, or null.
 */
export function segIntersectT(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): number | null {
  const r1x = bx - ax
  const r1y = by - ay
  const r2x = dx - cx
  const r2y = dy - cy
  const denom = r1x * r2y - r1y * r2x
  if (Math.abs(denom) < 1e-12) return null // parallel
  const t = ((cx - ax) * r2y - (cy - ay) * r2x) / denom
  const u = ((cx - ax) * r1y - (cy - ay) * r1x) / denom
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return u
}

export function wallLossDb(a: Vec3, b: Vec3, walls: Wall[]): number {
  let loss = 0
  for (const w of walls) {
    const u = segIntersectT(a.x, a.y, b.x, b.y, w.x1, w.y1, w.x2, w.y2)
    if (u === null) continue
    const wallLen = Math.hypot(w.x2 - w.x1, w.y2 - w.y1)
    const atM = u * wallLen
    const throughOpening = w.openings.some((o) => atM >= o.from && atM <= o.to)
    if (!throughOpening) loss += WALL_LOSS_DB[w.material]
  }
  return loss
}

export function pathLossDb(dM: number): number {
  return PL0_DB + 10 * PL_EXP * Math.log10(Math.max(dM, 0.1))
}

export function rxPowerDbm(txDbm: number, a: Vec3, b: Vec3, walls: Wall[]): number {
  const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  return txDbm - pathLossDb(d) - wallLossDb(a, b, walls)
}

/** linkTable.get(txId)!.get(rxId)! = received power in dBm. */
export function buildLinkTable(nodes: NodeCfg[], walls: Wall[]): Map<string, Map<string, number>> {
  const table = new Map<string, Map<string, number>>()
  for (const tx of nodes) {
    const row = new Map<string, number>()
    for (const rx of nodes) {
      if (rx.id === tx.id) continue
      row.set(rx.id, rxPowerDbm(tx.txPowerDbm, tx.pos, rx.pos, walls))
    }
    table.set(tx.id, row)
  }
  return table
}
