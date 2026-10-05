/**
 * Pure floor-plan operations: rooms → deduplicated walls, hit testing,
 * openings, random STA spawning, scenario (de)serialization.
 */
import { DEFAULT_UWB_SESSION, ScenarioSchema, SIX_GHZ_GATE_MIN_WIDTH_MHZ, guardIntervalRefusals, selectivityRefusals, type GuardIntervalCfg, type NodeCfg, type Opening, type Room, type Scenario, type SelectivityCfg, type UwbNodeCfg, type Wall } from '../model/scenario'
import { FADING_DEFAULTS, RICIAN_K_DEFAULT_DB, type FadingCfg } from '../engine/fading'
import type { ScattererCfg } from '../engine/scatter'
import { GEN_FEATURES, defaultFeatures, type FeatureFlag } from '../model/caps'
import type { Generation } from '../model/types'
import { STATION_PRESETS, presetNode } from '../model/presets'
import { nbListOverlapsSixGhz } from '../uwb/nb'
import { UWB_TX_POWER_DBM, uwbBandOverlap } from '../uwb/phy'
import { clampField } from '../ui/inputs'
import { ZodError } from 'zod'

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
 * Whether the amp node `id` is a backscatter tag with no AP running the RFID inventory — the
 * editor's own read of the schema's cross-node rule (`scenario.ts`'s `superRefine`, "a backscatter
 * tag needs an AP with the RFID inventory on"), so the plan the schema would reject is visible
 * under the Mode select before Save or Run ever reaches it, the same way `uwbSessionIssue` surfaces
 * its own cross-node rule. `false` for a missing node, a non-backscatter tag, and once any AP on
 * the plan runs `ampAp.backscatter`.
 */
export function ampTagIssue(sc: Scenario, id: string): boolean {
  const n = sc.nodes.find((x) => x.id === id)
  if (!n || n.kind !== 'amp' || (n.ampTag?.mode ?? 'active') !== 'backscatter') return false
  return !sc.nodes.some((x) => x.kind === 'ap' && x.ampAp?.backscatter !== undefined)
}

/**
 * Clamping a number field lives in the leaf `src/ui/inputs.ts` so the technology
 * panels under `src/uwb/ui/` can reach it without importing the core editor;
 * it is re-exported here because the editor's own fields have always used it
 * from this module.
 */
export { clampField } from '../ui/inputs'

// ---------------------------------------------------------------------------
// the fading section's fields
//
// Every function below mirrors one rule of `FadingSchema` (src/model/scenario.ts), so the
// panel can only ever hand the store a section that schema accepts. Nothing validates on the
// way up — `setScenario` stores whatever it is given, and the parse happens in
// `Simulation` — so a control that commits an illegal section would hand the user a plan
// that fails on Run with the fix several fields away.
// ---------------------------------------------------------------------------

/**
 * Which fading fields the panel leaves live, given the plan's section (`undefined` = off).
 *
 * Two separate decisions, and they nest. The section's own presence is what the switch
 * controls, and with it off there is nothing for any field to edit. `ricianKdB` is narrower
 * still: the schema refuses a K factor beside any distribution but rician (a ratio of
 * line-of-sight power to scattered power means nothing where there is no line-of-sight
 * component), so the field is live only there.
 */
export function fadingFieldsLive(f: FadingCfg | undefined): { fields: boolean; ricianKdB: boolean } {
  return { fields: f !== undefined, ricianKdB: f?.smallScale === 'rician' }
}

/**
 * The section the switch writes: `undefined` for off — the absence the engine reads as "do
 * not enter the fading branch", which is what keeps every plan that never touched this panel
 * returning the very same link levels — and the four defaults for on.
 *
 * `FADING_DEFAULTS` cannot go up as it stands: it carries a `ricianKdB` for the sake of
 * callers that need a number whatever the config left out, while its own `smallScale` is
 * `rayleigh`, and the schema refuses that pair. So the "on" case goes through
 * `fadingSmallScalePatch`, the one place that decides whether the K factor belongs.
 */
export function fadingToggle(on: boolean): FadingCfg | undefined {
  return on ? fadingSmallScalePatch(FADING_DEFAULTS, FADING_DEFAULTS.smallScale) : undefined
}

/**
 * The section with a different small-scale distribution — and, the whole point, with
 * `ricianKdB` present exactly when that distribution is rician.
 *
 * Switching away from rician drops the K factor rather than leaving it behind, for the reason
 * `generationPatch` drops a 6 GHz link off a node that can no longer reach 6 GHz: a setting
 * the engine will not read must not sit in the saved plan looking as though it does. Switching
 * *to* rician has to add one, because `FadingCfg.ricianKdB` is absent in every other
 * distribution and the field needs a number to show.
 */
export function fadingSmallScalePatch(f: FadingCfg, smallScale: FadingCfg['smallScale']): FadingCfg {
  const { ricianKdB, ...rest } = f
  return smallScale === 'rician'
    ? { ...rest, smallScale, ricianKdB: ricianKdB ?? RICIAN_K_DEFAULT_DB }
    : { ...rest, smallScale }
}

/**
 * The plan carrying this fading section — and, for `undefined`, carrying **no `fading` key at
 * all** rather than one holding `undefined`.
 *
 * `{ ...sc, fading: undefined }` would leave the key in place, and while the engine reads the
 * two alike (it switches on the value, not on `in`), a plan whose switch has been turned off
 * again ought to be indistinguishable from one that was never here: `'fading' in sc` is the
 * shape the design's byte-identical guarantee is stated in, and the schema's output keeps an
 * explicitly-undefined key it is handed.
 *
 * It also carries the one cross-section consequence a fading change can have: `selectivity`
 * borrows `fading.smallScale` for its per-bin deviation, so turning fading off — or turning the
 * distribution to `none` — leaves a `selectivity` the schema refuses. Dropping it here is the
 * same rule `removeNode` applies to the ranging session when the last UWB device goes: this
 * panel must not commit a plan whose fix is in another section, because nothing validates on the
 * way up and the user would meet it on Run instead. The guard keeps the byte-identical
 * guarantee intact for every plan that never had the section.
 *
 * **Only a refusal this edit is responsible for authorises the deletion.** The third refusal —
 * no he/eht link — is a *node* edit's doing, and dropping `selectivity` is not its repair.
 * Testing the refusals as one list let an unrelated reason authorise the removal: a plan
 * already showing the red "no he/eht link" line, whose owner nudges the shadow sigma from 4 dB
 * to 5 dB, had its whole `selectivity` section silently deleted for a reason with nothing to do
 * with the field they touched — and the red line went with it, so the plan read as repaired
 * rather than emptied.
 *
 * `fadingCausedRefusals` separates them by *running the rules twice* rather than by matching
 * their text: once on the plan as edited, once on the same nodes with a known-good fading
 * section. What only the first run says is what this edit owns. No second copy of any wording
 * lives here — which is the property `selectivityRefusals` was lifted into scenario.ts for —
 * and a fourth rule added later lands on the correct side of the split with no change here.
 */
export function withFading(sc: Scenario, f: FadingCfg | undefined): Scenario {
  let next: Scenario
  if (f !== undefined) {
    next = { ...sc, fading: f }
  } else {
    const { fading: _off, ...rest } = sc
    next = rest
  }
  if (next.selectivity === undefined) return next
  if (fadingCausedRefusals(next).length === 0) return next
  return withSelectivity(next, undefined)
}

/**
 * The refusals this plan's `fading` section is responsible for: the ones that go away when the
 * very same nodes are given a fading section the schema is happy with (`fadingToggle(true)`,
 * the panel's own "on" value), and only those.
 */
export function fadingCausedRefusals(sc: Scenario): string[] {
  const withGoodFading = new Set(
    selectivityRefusals({ fading: fadingToggle(true), nodes: sc.nodes }),
  )
  return selectivityRefusals(sc).filter((m) => !withGoodFading.has(m))
}

// ---- the frequency-selectivity switch ------------------------------------------------------

/**
 * Everything the selectivity checkbox needs, decided here rather than in the component: whether
 * it is ticked, whether it can be touched, and — when this plan would refuse the section — the
 * schema's own reasons why, verbatim (`selectivityRefusals`, src/model/scenario.ts). The panel
 * renders these three and judges nothing further.
 *
 * `live` is not simply "no refusals". A plan can be carrying the section *and* have grown a
 * refusal since — either end of its last he/eht link downgraded, which is a node edit this
 * section never sees — and a checkbox greyed in that state would be a trap: the plan is already
 * invalid and the one control that could rescue it is the one that stopped responding. So the
 * box stays operable while it is on, and the refusals show in red beside it either way. Grey is
 * only ever about **turning it on**, which is the case the brief's precedent (`fadingOffHint`)
 * covers: a schema refusal the user has to run into is a refusal the panel failed to say first.
 *
 * **Why that downgrade is not auto-repaired** — neither by deleting `selectivity` nor by putting
 * the generation back. Not because other cross-section hints in this file do it that way: the
 * one hint of the same shape, `ampTagIssue`/`ampBsNeedsReader`, is itself a second Chinese
 * wording of a schema rule, which is the very defect `selectivityRefusals` was lifted into
 * scenario.ts to remove, so it endorses nothing. The reason is that **the mistake cannot stay
 * silent**: the refusal appears, in red, beside a checkbox that still works.
 *
 * **That promise was false when it was first written, and `hasBinnableLink` is what made it
 * true.** The refusal used to count *devices*, so on the commonest plan there is — one AP, one
 * station, both `eht`, the box ticked — downgrading the **access point** to `nonht` left
 * `selectivityRefusals` empty, because the station was still `eht`. No red line, box still
 * ticked, schema still accepting, and the feature byte-for-byte off. Now that the rule asks
 * about the link (`minGen` of both ends), downgrading *either* end raises exactly one refusal,
 * and `Simulation`'s constructor parses before it builds anything
 * (`src/engine/simulation.ts`), so even the worker's `new Simulation(m.scenario)` surfaces it as
 * a banner rather than a run (`src/worker/sim.worker.ts`). In a *mixed* scene, which the schema
 * still accepts on purpose, the downgraded station's own PPDUs stop being binned at the PPDU
 * gate instead (`isOfdmWifiPpdu`, src/engine/channel.ts).
 *
 * So what is left of the mistake is an inert section the user can **see**, which is a fair
 * thing to leave them holding; an inert section with nothing on screen was not.
 */
export function selectivitySwitch(sc: Scenario): { on: boolean; live: boolean; refusals: string[] } {
  const refusals = selectivityRefusals(sc)
  const on = sc.selectivity !== undefined
  return { on, live: on || refusals.length === 0, refusals }
}

/**
 * The section the switch writes: `{}` for on, `undefined` for off.
 *
 * There is nothing inside it, and that is the design (`SelectivityCfg`): the bin count comes
 * from the standard and the per-bin distribution is `fading`'s. So unlike `fadingToggle` this
 * has no defaults to assemble — it exists so the component names the same thing the test does,
 * and so the empty object has exactly one source.
 */
export function selectivityToggle(on: boolean): SelectivityCfg | undefined {
  return on ? {} : undefined
}

/**
 * The plan carrying this selectivity section — and, for `undefined`, carrying **no
 * `selectivity` key at all**, for the reason `withFading` gives: the design's byte-identical
 * guarantee is stated as "a plan that was never here", and an explicitly-undefined key survives
 * the schema's output while `'selectivity' in sc` does not.
 */
export function withSelectivity(sc: Scenario, s: SelectivityCfg | undefined): Scenario {
  if (s !== undefined) return { ...sc, selectivity: s }
  const { selectivity: _off, ...rest } = sc
  return rest
}

// ---- the data field's guard interval -------------------------------------------------------

/**
 * What the guard-interval control shows: which tier the plan is on, whether the control may be
 * touched at all, and the refusals to print under it when it may not.
 *
 * **`live` is not "there are no refusals".** It is "the plan is already on a non-base tier, OR
 * there are no refusals" — the same shape and the same reason as `selectivitySwitch` above: a
 * plan can be edited into an invalid state (downgrade the station and the eht/he link is gone),
 * and if the one control that could undo it went dead the reader would be stuck holding a plan
 * the schema refuses with nothing on screen able to fix it. So the tier that is already on stays
 * switchable off.
 *
 * `refusals` comes from `guardIntervalRefusals` (src/model/scenario.ts) rather than from a
 * paraphrase, so the greyed control and the schema's refusal cannot explain one rule two ways.
 */
export function guardIntervalSwitch(sc: Scenario): { gi: 'base' | 'double' | 'quad'; live: boolean; refusals: string[] } {
  const refusals = guardIntervalRefusals(sc)
  const gi = sc.guardInterval?.gi ?? 'base'
  return { gi, live: gi !== 'base' || refusals.length === 0, refusals }
}

/**
 * The section the control writes: `undefined` for the base tier, `{ gi }` for the other two.
 *
 * `'base'` maps to `undefined` rather than to `{ gi: 'base' }` because the schema has no such
 * value (`GuardIntervalCfg`) — the absence of the section IS the base guard interval.
 */
export function guardIntervalToggle(gi: 'base' | 'double' | 'quad'): GuardIntervalCfg | undefined {
  return gi === 'base' ? undefined : { gi }
}

/** The three radio buttons the guard-interval control draws, as the panel needs them. */
export type GuardIntervalTier = 'base' | 'double' | 'quad'

/**
 * What each of the three tiers looks like for this plan: selectable, and selected.
 *
 * **It is not `fadingFieldsLive`'s shape, and the difference is the control's shape.** The
 * fading panel is a switch over fields and the selectivity panel is one checkbox, so for both
 * "live" is a single boolean and nothing has to say which option is showing. This is a choice
 * among three in which the base tier is the ABSENCE of the section — so "off" is one of the
 * three options rather than a separate gesture, and two questions have to be answered per tier
 * rather than one. Both live here so the panel reads them instead of re-deriving either: a
 * greyed radio nothing holds down is half a control, and so is a radio group that could show
 * two selections or none.
 *
 * `base` is always live, and that asymmetry is the promise `selectivitySwitch` makes in prose:
 * a reader who edits a station down to `vht` must not be left holding an invalid plan with the
 * only control that could undo it greyed out. A checkbox keeps that promise by staying live on
 * the state already chosen; this control keeps it by always being able to name the way back.
 *
 * **Exactly one tier is `checked`, for every plan**, including one the schema would refuse —
 * `guardIntervalSwitch` reads an absent section as `base`, so there is no fourth state for the
 * group to fall into.
 */
export function guardIntervalTiers(sc: Scenario): Record<GuardIntervalTier, { live: boolean; checked: boolean }> {
  const { gi, live } = guardIntervalSwitch(sc)
  return {
    base: { live: true, checked: gi === 'base' },
    double: { live, checked: gi === 'double' },
    quad: { live, checked: gi === 'quad' },
  }
}

/**
 * The plan carrying this guard-interval section — and, for `undefined`, carrying **no
 * `guardInterval` key at all**, for the reason `withFading` gives: the byte-identical guarantee
 * is stated as "a plan that was never here", and an explicitly-undefined key survives the
 * schema's output while `'guardInterval' in sc` does not.
 *
 * No `withFading`-style interlock: the guard interval depends on no other section.
 */
export function withGuardInterval(sc: Scenario, g: GuardIntervalCfg | undefined): Scenario {
  if (g !== undefined) return { ...sc, guardInterval: g }
  const { guardInterval: _off, ...rest } = sc
  return rest
}

// ---- reflecting objects (the scatterers section) -------------------------------------------

/**
 * What the 🪞 tool writes into a freshly placed object's `extraLossDb`, dB: a wardrobe.
 *
 * It is not 0 dB, and that is the whole point of naming it. 0 dB means "a perfect one square
 * metre" (`apertureCorrectionDb`, src/engine/scatter.ts), and such an object is **inaudible at
 * ordinary indoor distances**: halfway along a 10 m line it lands some ten dB under
 * `UWB_RX_SENS_DBM` and `deliverEcho` never hands it over, so a tool that wrote 0 dB would
 * place objects that reflect nothing anyone can hear and look broken. −10 dB is the wardrobe
 * the engine's own scene tests and the acceptance runs use (design §5.1's consequence, measured
 * in tasks 3 and 4), and it is what makes a first placement produce a record. model
 */
export const NEW_SCATTERER_EXTRA_LOSS_DB = -10 // model

/** How high a freshly placed object's reflecting centre sits, metres — the same height a
 * carried tag is placed at, since a piece of furniture reflects from about there. model */
export const NEW_SCATTERER_Z_M = 1.0 // model

/**
 * The plan carrying this list of reflecting objects — and, for an **empty** list, carrying no
 * `scatterers` key at all.
 *
 * The empty case is the whole reason this function exists, and it is not the same rule
 * `withFading` follows even though the shape is. An empty `scatterers` is legal and means
 * something: "this plan has the section and nothing to reflect off yet". But the editor has no
 * switch for the section — the objects *are* the section — so within the editor there is no way
 * to express that statement and no way to tell it from "no echoes", while a plan left holding
 * `scatterers: []` would put every run into the echo branch to loop over nothing. So removing
 * the last object removes the key, and a plan whose objects have all been deleted is once again
 * the same object as a plan that never had any (`'scatterers' in sc` is false, the shape the
 * design's byte-identical guarantee is stated in). An imported plan that deliberately carries
 * an empty list keeps it until the panel touches it.
 */
export function withScatterers(sc: Scenario, list: ScattererCfg[]): Scenario {
  if (list.length > 0) return { ...sc, scatterers: list }
  const { scatterers: _none, ...rest } = sc
  return rest
}

/**
 * Append a reflecting object at `pos`; returns the new scenario and its id.
 *
 * Ids are unique **within the section**, which is the only thing the schema asks and the only
 * thing a `UWB_ECHO` record needs — `scattererId` names a reflector, never a node, so an object
 * called `obj-1` beside a node called `obj-1` is not a collision. The numbering counts the
 * objects rather than the whole plan for the reason `newUwbNode` numbers anchors inside their
 * own role: it is how a room gets described. The loop afterwards is what actually keeps it
 * unique, since deleting from the middle would otherwise hand out a name twice.
 */
export function newScatterer(sc: Scenario, pos: { x: number; y: number }): { sc: Scenario; id: string } {
  const list = sc.scatterers ?? []
  const used = new Set(list.map((s) => s.id))
  let k = list.length + 1
  let id = `obj-${k}`
  while (used.has(id)) id = `obj-${++k}`
  const s: ScattererCfg = {
    id,
    pos: { x: snap(pos.x), y: snap(pos.y), z: NEW_SCATTERER_Z_M },
    // Stated, never left to a default: `ScattererSchema` requires this figure precisely because
    // 0 dB is a claim about the object rather than a neutral value.
    extraLossDb: NEW_SCATTERER_EXTRA_LOSS_DB,
  }
  return { sc: withScatterers(sc, [...list, s]), id }
}

/** This object with `patch` applied. A patch that names no object leaves the plan alone. */
export function updateScatterer(sc: Scenario, id: string, patch: Partial<ScattererCfg>): Scenario {
  const list = sc.scatterers ?? []
  return withScatterers(sc, list.map((s) => (s.id === id ? { ...s, ...patch } : s)))
}

/** Drag-to-move, on the same 0.1 m grid every other placement snaps to. The height is left
 * where it was: dragging on a plan view moves an object across the floor, not up a wall. */
export function moveScatterer(sc: Scenario, id: string, pos: { x: number; y: number }): Scenario {
  const s = (sc.scatterers ?? []).find((x) => x.id === id)
  if (!s) return sc
  return updateScatterer(sc, id, { pos: { ...s.pos, x: snap(pos.x), y: snap(pos.y) } })
}

/** Delete this object — and, with the last of them, the whole section (`withScatterers`). */
export function removeScatterer(sc: Scenario, id: string): Scenario {
  return withScatterers(sc, (sc.scatterers ?? []).filter((s) => s.id !== id))
}

/** Which object the pointer is over, or null. The same shape as `hitTestNode`, and asked after
 * it by the canvas: a device under the cursor wins over a piece of furniture under it. */
export function hitTestScatterer(
  list: ScattererCfg[] | undefined, p: { x: number; y: number }, tolM: number,
): string | null {
  let best: string | null = null
  let bestD = tolM
  for (const s of list ?? []) {
    const d = Math.hypot(s.pos.x - p.x, s.pos.y - p.y)
    if (d <= bestD) {
      bestD = d
      best = s.id
    }
  }
  return best
}

/**
 * A reflecting object's number fields — `extraLossDb` and the height — or `null` when the
 * schema would refuse the text. Only text that is not a finite number is refused, because
 * `ScattererSchema` bounds neither field and deliberately so: `extraLossDb` is a reflectivity
 * where 0 dB is one square metre, so half a square metre is +3.01 dB and a wardrobe is
 * legitimately negative (a `min(0)` would be a bound the physics does not have), and a
 * coordinate outside the drawn rooms is a legitimate place to stand an object. What the schema
 * does refuse is a non-finite coordinate or level, since an infinity anywhere makes the echo's
 * delay and its level NaN and a NaN level compares false against every threshold — the echo
 * would not be rejected, it would silently disappear.
 */
export function parseScattererNumber(raw: string): number | null {
  return parseNumberField(raw, () => true)
}

/**
 * A number field's text, or `null` when the schema would refuse it — treated exactly
 * like `parseEpc` and `parseIntList`: the field keeps the last value that worked, the typed
 * text stays on screen because it is what the user has to fix, and a red line says what was
 * wanted. Clamping instead (the `clampField` route the 6 GHz centre takes) would commit the
 * lower bound the moment the field was cleared, which for a sigma means silently turning the
 * shadowing off under the cursor.
 *
 * `Number` is lenient where this must not be: `Number('')` is 0 and `Number(' ')` is 0, so a
 * blank field would commit a figure the user never typed.
 */
function parseNumberField(raw: string, ok: (n: number) => boolean): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && ok(n) ? n : null
}

/** The shadowing sigma field. The schema's own bound: dB, and a standard deviation is never
 * negative — 0 is the legal way to ask for no shadowing at all. */
export function parseShadowSigmaDb(raw: string): number | null {
  return parseNumberField(raw, (n) => n >= 0)
}

/** The coherence-time field. The schema's own bound: strictly positive, since the shadow holds
 * one value per interval and a zero-length interval would redraw it every nanosecond. */
export function parseCoherenceMs(raw: string): number | null {
  return parseNumberField(raw, (n) => n > 0)
}

/** The Rician K factor field. The schema bounds it at neither end — K is a ratio in dB, and a
 * negative one is the legitimate case of a line-of-sight component weaker than the scatter —
 * so the only thing refused here is text that is not a number. */
export function parseRicianKdB(raw: string): number | null {
  return parseNumberField(raw, () => true)
}

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

/**
 * A failed load or import, as lines a person can read — one line per reason.
 *
 * **Why this exists.** The two handlers used to render `String(err)`, and `String(ZodError)` is
 * the issue array serialised as JSON: every sentence arrives wrapped in
 * `[{"code":"custom","path":["nodes"],"message":"…"}]`. That was survivable while the schema's
 * messages were short. The tampered-driver rules of 2026-10-05 made them long — the longest is
 * over 200 characters and names three fields and two remedies — so the same renderer now emits
 * something nobody reads, on a phone least of all.
 *
 * **The split, and what each half protects.**
 *  - A `custom` issue is one this repository wrote, in Chinese, as a whole sentence that already
 *    says which node and which field it is about (`driverRefusalsFor`, `selectivityRefusals`,
 *    `guardIntervalRefusals`, every ranging rule). Its `path` is a tag for the editor to route
 *    by — `['nodes']`, `['uwb']` — and printing it would add noise to a sentence that is already
 *    complete. So: the message alone.
 *  - Every other issue is zod's own, generated from a type or a bound, and its text
 *    ("Expected number, received string") is useless without knowing WHERE. So: `path: message`,
 *    with array indices written `nodes[0].caps.generation` the way a person would say it.
 * A path-less non-custom issue (a refinement on the root object) keeps the message alone rather
 * than growing an empty prefix.
 *
 * Anything that is not a `ZodError` — a malformed file, most often — comes back as one line too,
 * so the caller renders one list in one way.
 */
export function scenarioLoadIssues(err: unknown): string[] {
  if (err instanceof ZodError) {
    return err.issues.map((i) => {
      const where = i.path.reduce<string>((acc, k) => (typeof k === 'number' ? `${acc}[${k}]` : acc ? `${acc}.${k}` : String(k)), '')
      return i.code === 'custom' || where === '' ? i.message : `${where}：${i.message}`
    })
  }
  if (err instanceof SyntaxError) return [`这个文件不是合法的 JSON，没有解析出一个场景来：${err.message}`]
  return [String(err)]
}
