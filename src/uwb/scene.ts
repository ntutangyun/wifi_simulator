/**
 * What UWB ranging looks like on the floor of the 3-D scene.
 *
 * A range is a distance without a direction, so the honest picture of one is a
 * circle: every point at `distM` from the anchor that measured it. Four rings
 * that cross in one place are what a fix is made of, and the overlay draws
 * exactly that — one ring per (tag, anchor) pair, the solved position as a
 * small cross, and the 1-σ confidence ellipse of the solver around it.
 *
 * One-way ranging (DL-TDoA, UL-TDoA) measures no distances, so there is no ring
 * to draw: those lanes get the cross and the ellipse alone. In UL-TDoA the fix
 * is not even the tag's own — the infrastructure solved it and the view routed
 * it to the tag's lane (`of`), which is what puts the cross under the tag here.
 *
 * An angle-of-arrival fix gets a ring *and* a ray: the anchor measured a distance
 * and a direction, and the honest picture of that pair is the circle of the range
 * crossed by the bearing line. The line runs from the anchor to the fix — which is
 * exactly the bearing, at exactly the horizontal range the fix was built from — so
 * nothing here needs to know the anchor's yaw. The ring is the *slant* range, as
 * every ring on this floor is, so an anchor mounted above the tag draws its cross a
 * little inside its own ring: that gap is the height difference, seen from above.
 *
 * Everything fades with age rather than blinking out: a drawing is at full
 * strength when its round ends and has faded to nothing one ranging block later,
 * so the eye sees the measurement's freshness. A ring, cross or ellipse more
 * than one block behind the tag's current block is not drawn at all — it is
 * history, not an estimate. The cross and the ellipse age by the block their fix
 * was solved in, exactly as a ring ages by the block it was measured in.
 *
 * Scene axes follow src/scene/effects.ts: three.x = pos.x, three.y = pos.z (up),
 * three.z = pos.y, and floor drawings sit just above the floor plane so they do
 * not z-fight with it.
 */
import * as THREE from 'three'
import { ELLIPSE_DRAW_SCALE } from './view'
import { physicalId } from '../model/caps'
import type { Scenario } from '../model/scenario'
import type { Ns } from '../model/types'
import type { ViewState } from '../model/view'
import { blockSlots, roundPlan, type RoundPlan } from './session'

export const UWB_RING_COLOR = 0xfbbf24
export const UWB_FIX_COLOR = 0xf59e0b
export const UWB_ELLIPSE_COLOR = 0xf59e0b
export const UWB_BEARING_COLOR = 0xfbbf24

export { ELLIPSE_DRAW_SCALE } from './view'

/** Height of every floor drawing, as in the effects layer. */
const FLOOR_Y = 0.01
const RING_SEGMENTS = 64
const RING_MAX_OPACITY = 0.45
const FIX_MAX_OPACITY = 1
const ELLIPSE_MAX_OPACITY = 0.8
const BEARING_MAX_OPACITY = 0.55
/** The fix cross is two lines of this length, crossed at the estimate. */
const CROSS_LEN_M = 0.3

/** A unit circle in the horizontal plane, ready to be scaled into a ring or an ellipse. */
function circleGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < RING_SEGMENTS; i++) {
    const a = (i / RING_SEGMENTS) * Math.PI * 2
    pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)))
  }
  return new THREE.BufferGeometry().setFromPoints(pts)
}

/** A unit segment from the origin along +x, ready to be turned to a bearing and scaled to a range. */
function rayGeometry(): THREE.BufferGeometry {
  return new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)])
}

function crossGeometry(): THREE.BufferGeometry {
  const h = CROSS_LEN_M / 2
  return new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-h, 0, 0), new THREE.Vector3(h, 0, 0),
    new THREE.Vector3(0, 0, -h), new THREE.Vector3(0, 0, h),
  ])
}

function disposeLine(line: THREE.Line): void {
  line.geometry.dispose()
  ;(line.material as THREE.Material).dispose()
}

export class UwbOverlay {
  readonly group = new THREE.Group()
  /** Scene-axis (x, z) of every UWB device, by physical id. */
  private positions = new Map<string, { x: number; z: number }>()
  private blockNs: Ns
  /**
   * The round plan this overlay ages its drawings by. **It is kept whole rather than reduced to
   * `plan.roundNs`, and that is a fix rather than a refactor** (slice 3d, design §4.2 site 10).
   *
   * `roundNs` is `plan.slots` slots long and has no block index in it, while the round a block
   * actually runs is `blockSlots(plan, block)` slots — §10.36's receipt confirmation and §10.35's
   * ancillary message each append slots to particular blocks. Measured on the shipped
   * `uwb-ancillary` hall: `roundNs` is 10 ms and the round that runs is 18 ms, so every ring faded
   * from 8 ms too early — 4 % of a block, on every block, since the ancillary slice landed. Slice
   * 3d did not cause that and would have made it worse: with a granted request the round's length
   * moves from block to block, so one wrong constant would have become several.
   */
  private plan: RoundPlan
  /** `mode: 'm2m'` (design §5): every UWB node ranges, and `uwb.role` decides only how it is
   * drawn elsewhere (the node icon) — not whether this overlay draws its rings. Read once here,
   * from the same scenario the constructor already takes, rather than threaded through `update`. */
  private readonly m2m: boolean
  /** Live objects, keyed by their own name: 'ring:<tag>:<anchor>', 'fix:<tag>', 'ellipse:<tag>',
   * 'bearing:<tag>'. In `'m2m'` mode "tag" is whichever participant holds the range — there is no
   * tag — so the name is a map key here, never a claim about the role. */
  private objects = new Map<string, THREE.Line>()

  constructor(sc: Scenario) {
    this.group.name = 'uwb-overlay'
    for (const n of sc.nodes) {
      if (n.kind === 'uwb') this.positions.set(n.id, { x: n.pos.x, z: n.pos.y })
    }
    // An overlay is only ever built for a scenario that ranges, and the schema
    // makes a session mandatory as soon as one UWB node exists: without it there
    // is no block to age a drawing by, and a substituted one would fade at a rate
    // the engine is not running.
    if (!sc.uwb) throw new Error('UwbOverlay: a scenario with UWB nodes has no ranging session (scenario.uwb)')
    this.m2m = sc.uwb.mode === 'm2m'
    // Many-to-many has no anchor/tag split to count by (design §5): every UWB node is a
    // participant, and `roundPlan` reads that count under the name `anchors` regardless of mode
    // (`RoundPlan.participants`'s own docblock). Reading the role-filtered count here for `'m2m'`
    // would plan a shorter round than the one that actually runs whenever the scene mixes roles,
    // the same drift `UwbSessionFields`'s plan line had before this task fixed it.
    const uwbNodes = sc.nodes.filter((n) => n.kind === 'uwb')
    const anchors = this.m2m ? uwbNodes.length : uwbNodes.filter((n) => n.uwb?.role === 'anchor').length
    const plan = roundPlan(sc.uwb, anchors)
    this.blockNs = plan.blockNs
    this.plan = plan
  }

  /**
   * The instant the tag's round of this block was over: when a drawing is freshest.
   *
   * `granted` is the ancillary width the controller has handed out (standard §10.35.2.1; slice 3d),
   * read off the tag's own view state — `null` in every session that never asks, which restores
   * `blockSlots`' own default. It is 「the width in force now」 rather than 「the width in force in
   * block `block`」, and the difference is at most one block, the block a grant first changes the
   * round's length in; a drawing never outlives one block, so the residual is one ring's opacity on
   * one block per change of grant. The alternative — a per-block history in the view state — would
   * cost more than a ring's opacity is worth, and this comment is here so the next reader does not
   * mistake the residual for exactness.
   */
  private roundEndNs(block: number, round: number, granted: number | null): Ns {
    return block * this.blockNs
      + (round + 1) * blockSlots(this.plan, block, granted) * this.plan.slotNs
  }

  /**
   * How much of a drawing's strength is left: 1 from the measurement until its
   * round ends, then down to 0 one ranging block later. Clamped at both ends —
   * a range lands in its report slot, before the round is over, so the age is
   * briefly negative and would otherwise draw the ring stronger than intended.
   */
  private fade(vs: ViewState, block: number, round: number, granted: number | null): number {
    const age = (vs.t - this.roundEndNs(block, round, granted)) / this.blockNs
    return Math.max(0, Math.min(1, 1 - age))
  }

  private ensure(name: string, make: () => THREE.Line): THREE.Line {
    let obj = this.objects.get(name)
    if (!obj) {
      obj = make()
      obj.name = name
      this.objects.set(name, obj)
      this.group.add(obj)
    }
    return obj
  }

  update(vs: ViewState): void {
    const alive = new Set<string>()
    for (const [vid, nv] of Object.entries(vs.nodes)) {
      const u = nv.uwb
      // Every mode but many-to-many keeps ranges on the tag's lane alone (an anchor's own lane
      // never gets a `UWB_RANGE` there). Many-to-many has no tag to single out — up to N−1 of its
      // participants hold ranges regardless of `uwb.role` (design §2/§5) — so the gate that draws
      // a sensible picture in every other mode would silently drop every ring belonging to a
      // participant drawn as an anchor here.
      if (!u || (!this.m2m && u.role !== 'tag')) continue
      // A UWB device never runs MLO, so its lane id is its physical id; take it
      // through physicalId all the same, so the names never grow a lane suffix.
      const tag = physicalId(vid)

      // One-way ranging measures no distances at all: a time difference is a hyperbola, not a
      // circle, and hyperbolae are not drawn here. So a TDoA lane shows the fix and its ellipse
      // and nothing else — which is also the honest picture of what that tag's round produced.
      // Two-way ranging keeps every ring it ever had.
      // …and an angle fix keeps its ring too: the ring and the bearing line are the two halves
      // of what one anchor measured, and where they cross is the whole of the lesson.
      const rings = u.position === null || u.position.method === 'twr' || u.position.method === 'aoa'
      const ringsToDraw = rings ? Object.entries(u.ranges) : []
      for (const [id, r] of ringsToDraw) {
        const peer = physicalId(id)
        const anchor = this.positions.get(peer)
        if (!anchor || r.block < u.block - 1) continue
        const key = `ring:${tag}:${peer}`
        alive.add(key)
        const ring = this.ensure(key, () => new THREE.LineLoop(
          circleGeometry(),
          new THREE.LineBasicMaterial({ color: UWB_RING_COLOR, transparent: true, opacity: RING_MAX_OPACITY }),
        ))
        ring.position.set(anchor.x, FLOOR_Y, anchor.z)
        ring.scale.set(r.distM, 1, r.distM)
        ;(ring.material as THREE.LineBasicMaterial).opacity = RING_MAX_OPACITY * this.fade(vs, r.block, u.round, u.ancillaryGranted)
      }

      // The fix ages on the ring rule: a position is never cleared by the
      // reducer, so without this a tag whose rounds start timing out would keep
      // an opaque cross and a crisp ellipse on the floor long after the rings
      // that produced them had faded — the scene asserting a confidence the
      // engine no longer has.
      const fix = u.position
      if (!fix || fix.block < u.block - 1) continue
      const fade = this.fade(vs, fix.block, u.round, u.ancillaryGranted)

      const cross = this.ensure(`fix:${tag}`, () => new THREE.LineSegments(
        crossGeometry(), new THREE.LineBasicMaterial({ color: UWB_FIX_COLOR, transparent: true, opacity: FIX_MAX_OPACITY }),
      ))
      cross.position.set(fix.x, FLOOR_Y, fix.y)
      ;(cross.material as THREE.LineBasicMaterial).opacity = FIX_MAX_OPACITY * fade
      alive.add(`fix:${tag}`)

      const ell = this.ensure(`ellipse:${tag}`, () => new THREE.LineLoop(
        circleGeometry(),
        new THREE.LineBasicMaterial({ color: UWB_ELLIPSE_COLOR, transparent: true, opacity: ELLIPSE_MAX_OPACITY }),
      ))
      ell.position.set(fix.x, FLOOR_Y, fix.y)
      ;(ell.material as THREE.LineBasicMaterial).opacity = ELLIPSE_MAX_OPACITY * fade
      ell.scale.set(fix.ellipse.a * ELLIPSE_DRAW_SCALE, 1, fix.ellipse.b * ELLIPSE_DRAW_SCALE)
      // The solver's θ turns the major axis in the model's (x, y) plane; scene y
      // is up, so the same turn is a negative rotation about it.
      ell.rotation.y = -fix.ellipse.thetaRad
      alive.add(`ellipse:${tag}`)

      // The measured bearing, drawn from the anchor that measured it to the fix it produced.
      // Its length needs no record field: the fix was placed at the horizontal range along
      // this bearing, so the distance from the anchor to the fix is that range.
      const src = fix.method === 'aoa' ? this.positions.get(physicalId(fix.anchors[0])) : undefined
      if (!src) continue
      const ray = this.ensure(`bearing:${tag}`, () => new THREE.Line(
        rayGeometry(), new THREE.LineBasicMaterial({ color: UWB_BEARING_COLOR, transparent: true, opacity: BEARING_MAX_OPACITY }),
      ))
      ray.position.set(src.x, FLOOR_Y, src.z)
      // Scene z is model y, so a bearing counter-clockwise in the model turns clockwise here —
      // the same sign the ellipse's major axis takes two lines above.
      ray.rotation.y = -Math.atan2(fix.y - src.z, fix.x - src.x)
      ray.scale.x = Math.hypot(fix.x - src.x, fix.y - src.z)
      ;(ray.material as THREE.LineBasicMaterial).opacity = BEARING_MAX_OPACITY * fade
      alive.add(`bearing:${tag}`)
    }

    for (const [key, obj] of this.objects) {
      if (alive.has(key)) continue
      this.group.remove(obj)
      disposeLine(obj)
      this.objects.delete(key)
    }
  }

  dispose(): void {
    for (const obj of this.objects.values()) {
      this.group.remove(obj)
      disposeLine(obj)
    }
    this.objects.clear()
  }
}
