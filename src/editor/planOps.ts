/**
 * Pure floor-plan operations: rooms → deduplicated walls, hit testing,
 * openings, random STA spawning, scenario (de)serialization.
 */
import { DEFAULT_UWB_SESSION, ScenarioSchema, SIX_GHZ_GATE_MIN_WIDTH_MHZ, type NodeCfg, type Opening, type Room, type Scenario, type UwbNodeCfg, type Wall } from '../model/scenario'
import { GEN_FEATURES, defaultFeatures, type FeatureFlag } from '../model/caps'
import type { Generation } from '../model/types'
import { STATION_PRESETS, presetNode } from '../model/presets'
import { nbListOverlapsSixGhz } from '../uwb/nb'
import { UWB_TX_POWER_DBM, uwbBandOverlap } from '../uwb/phy'
import { clampField } from '../ui/inputs'

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
    // A random phone from the presets; a repeated model gets a numbered name.
    const preset = STATION_PRESETS[Math.floor(rng() * STATION_PRESETS.length)]
    const node = presetNode(preset, id, { x, y, z: 1.0 })
    const taken = new Set(nodes.map((n) => n.name))
    if (taken.has(node.name)) {
      let k = 2
      while (taken.has(`${preset.model} (${k})`)) k++
      node.name = `${preset.model} (${k})`
    }
    nodes.push(node)
    next++
  }
  return { ...sc, nodes }
}

/** Append a fresh ambient-power (AMP) tag node at `pos`; returns the new scenario and its id. */
export function newTag(sc: Scenario, pos: { x: number; y: number }): { sc: Scenario; id: string } {
  const used = new Set(sc.nodes.map((n) => n.id))
  let k = sc.nodes.length
  let id = `tag-${k}`
  while (used.has(id)) id = `tag-${++k}`
  const node: NodeCfg = {
    id, kind: 'amp', name: `Tag ${k}`, pos: { x: snap(pos.x), y: snap(pos.y), z: 1.0 },
    txPowerDbm: 0, profiles: ['idle'], caps: { generation: 'nonht', features: {} },
    // A fresh tag states its mode rather than leaning on the schema's default, so a plan the
    // editor just built and a plan reloaded from JSON are the same object.
    linkId: '2g', ampTag: { mode: 'active' },
  }
  return { sc: { ...sc, nodes: [...sc.nodes, node] }, id }
}

/** Does the plan have its AP? A station or an AMP tag without one is a scenario the schema rejects. */
export function hasAp(sc: Scenario): boolean {
  return sc.nodes.some((n) => n.kind === 'ap')
}

/**
 * Place the plan's one AP at `pos`: a Wi-Fi 7 router with everything its
 * generation allows turned on. A UWB-only plan is allowed to have no AP, so
 * deleting the AP has to be undoable without throwing away the rooms, walls and
 * devices already drawn — this is the way back. A second AP is refused, because
 * the schema allows exactly one.
 */
export function newAp(sc: Scenario, pos: { x: number; y: number }): { sc: Scenario; id: string } {
  const existing = sc.nodes.find((n) => n.kind === 'ap')
  if (existing) return { sc, id: existing.id }
  const used = new Set(sc.nodes.map((n) => n.id))
  let k = 1
  let id = 'ap'
  while (used.has(id)) id = `ap-${++k}`
  const features: Record<string, boolean> = {}
  for (const [flag, on] of Object.entries(defaultFeatures('eht'))) features[flag] = on === true
  const node: NodeCfg = {
    id, kind: 'ap', name: 'AP', pos: { x: snap(pos.x), y: snap(pos.y), z: 2.0 },
    txPowerDbm: 20, profiles: ['idle'], caps: { generation: 'eht', features },
  }
  return { sc: { ...sc, nodes: [...sc.nodes, node] }, id }
}

/**
 * Append a UWB ranging device at `pos`, opening the scenario's ranging session
 * if this is the first one. Anchors and tags are numbered inside their own
 * role — "Anchor 1" next to "UWB tag 1" — because that is how a deployment is
 * described; the loop afterwards is what actually keeps the id unique.
 */
function newUwbNode(sc: Scenario, pos: { x: number; y: number }, role: UwbNodeCfg['role']): { sc: Scenario; id: string } {
  const used = new Set(sc.nodes.map((n) => n.id))
  const prefix = role === 'anchor' ? 'anchor' : 'uwb'
  let k = sc.nodes.filter((n) => n.uwb?.role === role).length + 1
  let id = `${prefix}-${k}`
  while (used.has(id)) id = `${prefix}-${++k}`
  const node: NodeCfg = {
    id,
    kind: 'uwb',
    name: role === 'anchor' ? `Anchor ${k}` : `UWB tag ${k}`,
    // An anchor is screwed to the wall near the ceiling, a tag is carried.
    pos: { x: snap(pos.x), y: snap(pos.y), z: role === 'anchor' ? 2.2 : 1.0 },
    txPowerDbm: UWB_TX_POWER_DBM,
    profiles: ['idle'],
    caps: { generation: 'nonht', features: {} },
    uwb: { role },
  }
  return { sc: { ...sc, nodes: [...sc.nodes, node], uwb: sc.uwb ?? { ...DEFAULT_UWB_SESSION } }, id }
}

/** Append a UWB anchor (a device at a known place that answers polls). */
export function newAnchor(sc: Scenario, pos: { x: number; y: number }): { sc: Scenario; id: string } {
  return newUwbNode(sc, pos, 'anchor')
}

/** Append a UWB tag (the device that ranges to every anchor and solves its own position). */
export function newUwbTag(sc: Scenario, pos: { x: number; y: number }): { sc: Scenario; id: string } {
  return newUwbNode(sc, pos, 'tag')
}

/**
 * May this node be deleted? Everything but the AP always may. The AP may go
 * only once nothing needs a BSS: a plan that is nothing but UWB devices has no
 * Wi-Fi at all, and forcing an unused AP on it would only add a beaconing
 * radio the ranging never hears.
 */
export function canDeleteNode(sc: Scenario, id: string): boolean {
  const n = sc.nodes.find((x) => x.id === id)
  if (!n) return false
  if (n.kind !== 'ap') return true
  return !sc.nodes.some((x) => x.kind === 'sta' || x.kind === 'amp')
}

/**
 * Remove a node, closing the ranging session with the last UWB device so the
 * scenario never carries a session nothing takes part in. Refused (scenario
 * returned untouched) when `canDeleteNode` says no.
 */
export function removeNode(sc: Scenario, id: string): Scenario {
  if (!canDeleteNode(sc, id)) return sc
  const nodes = sc.nodes.filter((n) => n.id !== id)
  return { ...sc, nodes, uwb: nodes.some((n) => n.kind === 'uwb') ? sc.uwb : undefined }
}

/**
 * The first thing the schema objects to about the ranging session — a slot too
 * short for the round's longest frame, more tags than the block holds, more
 * anchors than a round can carry — or null when it is happy. The rules live in
 * the schema alone; this only runs it and picks the issue that belongs to UWB,
 * so the editor can show it under the session section instead of failing on run.
 *
 * An issue is claimed by its `path`, never by its wording: everything the schema
 * says about the session is rooted at `uwb` (the field and the superRefine rules
 * alike), and a field issue on a ranging device is rooted at that node. A rule
 * that merely mentions UWB on some other path — a coexistence rule on a Wi-Fi
 * link, say — belongs to whatever the editor shows there, not to this section.
 */
export function uwbSessionIssue(sc: Scenario): string | null {
  const parsed = ScenarioSchema.safeParse(sc)
  if (parsed.success) return null
  for (const issue of parsed.error.issues) {
    if (issue.path[0] === 'uwb') return issue.message
    const i = issue.path[1]
    if (issue.path[0] === 'nodes' && typeof i === 'number' && sc.nodes[i]?.kind === 'uwb') return issue.message
  }
  return null
}

/**
 * Clamping a number field lives in the leaf `src/ui/inputs.ts` so the technology
 * panels under `src/uwb/ui/` can reach it without importing the core editor;
 * it is re-exported here because the editor's own fields have always used it
 * from this module.
 */
export { clampField } from '../ui/inputs'

/** The 6 GHz channel field: clamp to the schema's [5955, 7115] range, then snap to the
 * nearest 5 MHz step the schema also demands. */
export function clampSixGhzCenterMhz(raw: string): number {
  const clamped = clampField(raw, 5955, 7115, true)
  return Math.round(clamped / 5) * 5
}

/** The overlap note's number: the percentage of the plan's 6 GHz channel that falls inside
 * UWB channel 5's band, or null when there is nothing to warn about — either the UWB session
 * is not on channel 5, or the plan has no UWB node to range on it. */
export function sixGhzOverlapPct(sc: Scenario, centerMhz: number): number | null {
  if (sc.uwb?.channel !== 5) return null
  if (!sc.nodes.some((n) => n.kind === 'uwb')) return null
  return Math.round(uwbBandOverlap(centerMhz, 80, 5) * 100)
}

/**
 * The other half of the same note: an MMS session's narrowband control plane shares 6 GHz too,
 * whatever UWB channel the ranging itself is on — channels 50…249 of the allow list sit in
 * UNII-5, beside the plan's own Wi-Fi.
 *
 * It asks `nbListOverlapsSixGhz`, the very predicate the simulation gates its mediator on, at
 * the gate's own narrowest width; so whenever this note appears the run really does couple the
 * two engines. A wider link couples on more, which the note does not claim to enumerate. */
export function sixGhzNbOverlaps(sc: Scenario, centerMhz: number): boolean {
  if (sc.uwb?.mode !== 'mms') return false
  if (!sc.nodes.some((n) => n.kind === 'uwb')) return false
  return nbListOverlapsSixGhz(sc.uwb.mms.nbChannels, centerMhz, SIX_GHZ_GATE_MIN_WIDTH_MHZ)
}

/**
 * The node patch that switching `n` to Wi-Fi generation `gen` produces.
 *
 * Besides the capability flags, this drops whatever the new generation cannot
 * carry, so the editor can never build a node the schema rejects on run or on
 * reload: the link (VHT is 5 GHz only, 802.11a/g has no 6 GHz) and the AMP
 * polling config (an AMP DL PPDU carries U-SIG, so only an EHT AP may poll).
 */
export function generationPatch(n: NodeCfg, gen: Generation): Partial<NodeCfg> {
  const features: Partial<Record<FeatureFlag, boolean>> = {}
  for (const f of GEN_FEATURES[gen]) features[f] = n.caps.features[f] ?? true
  const keepsLink = gen !== 'vht' && !(gen === 'nonht' && n.linkId === '6g')
  return {
    caps: { generation: gen, features: features as Record<string, boolean> },
    linkId: keepsLink ? n.linkId : undefined,
    ampAp: gen === 'eht' ? n.ampAp : undefined,
  }
}

export function scenarioToJson(sc: Scenario): string {
  return JSON.stringify(sc, null, 2)
}

export function scenarioFromJson(s: string): Scenario {
  return ScenarioSchema.parse(JSON.parse(s))
}
