/**
 * Pure floor-plan operations: rooms → deduplicated walls, hit testing,
 * openings, random STA spawning, scenario (de)serialization.
 */
import { ScenarioSchema, nonht, type NodeCfg, type Opening, type Room, type Scenario, type Wall } from '../model/scenario'

const SNAP = 0.1
export const snap = (v: number): number => Math.round(v / SNAP) * SNAP

interface Span { from: number; to: number }

/** Merge covered elementary intervals into maximal runs. */
function mergeSpans(spans: Span[]): Span[] {
  if (!spans.length) return []
  const pts = [...new Set(spans.flatMap((s) => [s.from, s.to]))].sort((a, b) => a - b)
  const covered: Span[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const mid = (a + b) / 2
    if (spans.some((s) => s.from <= mid && mid <= s.to)) covered.push({ from: a, to: b })
  }
  const out: Span[] = []
  for (const c of covered) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.to - c.from) < 1e-9) last.to = c.to
    else out.push({ ...c })
  }
  return out
}

/**
 * Derive walls from room rectangles: collinear overlapping edges collapse into
 * one wall. Material and openings of geometrically-matching `existing` walls
 * are preserved.
 */
export function roomsToWalls(rooms: Room[], existing: Wall[] = []): Wall[] {
  const vertical = new Map<number, Span[]>() // x → y-spans
  const horizontal = new Map<number, Span[]>() // y → x-spans
  for (const r of rooms) {
    const x1 = snap(r.x)
    const y1 = snap(r.y)
    const x2 = snap(r.x + r.w)
    const y2 = snap(r.y + r.h)
    push(vertical, x1, { from: y1, to: y2 })
    push(vertical, x2, { from: y1, to: y2 })
    push(horizontal, y1, { from: x1, to: x2 })
    push(horizontal, y2, { from: x1, to: x2 })
  }
  const walls: Wall[] = []
  for (const [x, spans] of [...vertical.entries()].sort((a, b) => a[0] - b[0])) {
    for (const s of mergeSpans(spans)) {
      walls.push(withPreserved({ x1: x, y1: s.from, x2: x, y2: s.to, material: 'drywall', openings: [] }, existing))
    }
  }
  for (const [y, spans] of [...horizontal.entries()].sort((a, b) => a[0] - b[0])) {
    for (const s of mergeSpans(spans)) {
      walls.push(withPreserved({ x1: s.from, y1: y, x2: s.to, y2: y, material: 'drywall', openings: [] }, existing))
    }
  }
  return walls
}

function push(map: Map<number, Span[]>, key: number, span: Span): void {
  const k = Math.round(key * 10) / 10
  if (!map.has(k)) map.set(k, [])
  map.get(k)!.push(span)
}

function withPreserved(w: Wall, existing: Wall[]): Wall {
  const isV = w.x1 === w.x2
  for (const e of existing) {
    const eIsV = e.x1 === e.x2
    if (isV !== eIsV) continue
    if (isV && (e.x1 !== w.x1 || Math.max(e.y1, e.y2) <= w.y1 || Math.min(e.y1, e.y2) >= w.y2)) continue
    if (!isV && (e.y1 !== w.y1 || Math.max(e.x1, e.x2) <= w.x1 || Math.min(e.x1, e.x2) >= w.x2)) continue
    // same line and overlapping span → inherit
    const eStart = isV ? Math.min(e.y1, e.y2) : Math.min(e.x1, e.x2)
    const wStart = isV ? w.y1 : w.x1
    const wLen = isV ? w.y2 - w.y1 : w.x2 - w.x1
    const openings = e.openings
      .map((o) => ({ from: o.from + eStart - wStart, to: o.to + eStart - wStart }))
      .filter((o) => o.to > 0 && o.from < wLen)
      .map((o) => ({ from: Math.max(0, o.from), to: Math.min(wLen, o.to) }))
    return { ...w, material: e.material, openings }
  }
  return w
}

export function wallLength(w: Wall): number {
  return Math.hypot(w.x2 - w.x1, w.y2 - w.y1)
}

function distToSegment(px: number, py: number, w: Wall): number {
  const dx = w.x2 - w.x1
  const dy = w.y2 - w.y1
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - w.x1) * dx + (py - w.y1) * dy) / len2))
  return Math.hypot(px - (w.x1 + t * dx), py - (w.y1 + t * dy))
}

export function hitTestWall(walls: Wall[], p: { x: number; y: number }, tolM: number): number | null {
  let best: number | null = null
  let bestD = tolM
  walls.forEach((w, i) => {
    const d = distToSegment(p.x, p.y, w)
    if (d <= bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

export function hitTestNode(nodes: NodeCfg[], p: { x: number; y: number }, tolM: number): string | null {
  let best: string | null = null
  let bestD = tolM
  for (const n of nodes) {
    const d = Math.hypot(n.pos.x - p.x, n.pos.y - p.y)
    if (d <= bestD) {
      bestD = d
      best = n.id
    }
  }
  return best
}

/** Position along the wall (meters from its start) of the projection of p. */
export function alongWall(w: Wall, p: { x: number; y: number }): number {
  const dx = w.x2 - w.x1
  const dy = w.y2 - w.y1
  const len = Math.hypot(dx, dy)
  if (len === 0) return 0
  const t = Math.max(0, Math.min(1, ((p.x - w.x1) * dx + (p.y - w.y1) * dy) / (len * len)))
  return t * len
}

/** Add an opening centered at atM; clamped to the wall, rejected if overlapping. */
export function addOpening(w: Wall, atM: number, widthM: number): Wall {
  const len = wallLength(w)
  let from = Math.max(0, Math.min(len - widthM, atM - widthM / 2))
  from = Math.round(from * 10) / 10
  const to = Math.min(len, from + widthM)
  if (to - from < 0.05) return w
  const overlaps = w.openings.some((o) => o.from < to && from < o.to)
  if (overlaps) return w
  const openings: Opening[] = [...w.openings, { from, to }].sort((a, b) => a.from - b.from)
  return { ...w, openings }
}

const SPAWN_PROFILES = ['video', 'backup', 'browsing', 'iot', 'saturated'] as const

export function spawnRandomStas(sc: Scenario, n: number, rng: () => number): Scenario {
  if (!sc.rooms.length) return sc
  const nodes = [...sc.nodes]
  let next = nodes.length
  const usedIds = new Set(nodes.map((x) => x.id))
  for (let i = 0; i < n; i++) {
    let id = `sta-${next}`
    while (usedIds.has(id)) id = `sta-${++next}`
    usedIds.add(id)
    const room = sc.rooms[Math.floor(rng() * sc.rooms.length)]
    const margin = 0.5
    const x = snap(room.x + margin + rng() * Math.max(0.1, room.w - 2 * margin))
    const y = snap(room.y + margin + rng() * Math.max(0.1, room.h - 2 * margin))
    const profile = SPAWN_PROFILES[Math.floor(rng() * SPAWN_PROFILES.length)]
    nodes.push({
      id, kind: 'sta', name: `STA-${next}`, pos: { x, y, z: 1.0 },
      txPowerDbm: 15, profile, caps: nonht,
    })
    next++
  }
  return { ...sc, nodes }
}

export function scenarioToJson(sc: Scenario): string {
  return JSON.stringify(sc, null, 2)
}

export function scenarioFromJson(s: string): Scenario {
  return ScenarioSchema.parse(JSON.parse(s))
}
