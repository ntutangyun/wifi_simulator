/**
 * What UWB ranging looks like on the floor of the 3-D scene.
 *
 * A range is a distance without a direction, so the honest picture of one is a
 * circle: every point at `distM` from the anchor that measured it. Four rings
 * that cross in one place are what a fix is made of, and the overlay draws
 * exactly that — one ring per (tag, anchor) pair, the solved position as a
 * small cross, and the 1-σ confidence ellipse of the solver around it.
 *
 * Rings fade with age rather than blinking out: a ring is at full strength when
 * its round ends and has faded to nothing one ranging block later, so the eye
 * sees the measurement's freshness. A ring more than one block behind the tag's
 * current block is not drawn at all — it is history, not an estimate.
 *
 * Scene axes follow src/scene/effects.ts: three.x = pos.x, three.y = pos.z (up),
 * three.z = pos.y, and floor drawings sit just above the floor plane so they do
 * not z-fight with it.
 */
import * as THREE from 'three'
import { physicalId } from '../model/caps'
import { DEFAULT_UWB_SESSION, type Scenario } from '../model/scenario'
import type { Ns } from '../model/types'
import type { ViewState } from '../model/view'
import { roundPlan } from './session'

export const UWB_RING_COLOR = 0xfbbf24
export const UWB_FIX_COLOR = 0xf59e0b
export const UWB_ELLIPSE_COLOR = 0xf59e0b

/**
 * The 1-σ ellipse of a good fix is a couple of centimetres across — invisible
 * beside a 3.5 m ring — so it is drawn at 10× so it is visible; the inspector
 * shows the true axes. Every tooltip that quotes the ellipse must quote this
 * factor with it.
 */
export const ELLIPSE_DRAW_SCALE = 10

/** Height of every floor drawing, as in the effects layer. */
const FLOOR_Y = 0.01
const RING_SEGMENTS = 64
const RING_MAX_OPACITY = 0.45
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
  private roundNs: Ns
  /** Live objects, keyed 'tag:anchor' (ring), 'tag:fix' (cross) and 'tag:ellipse'. */
  private objects = new Map<string, THREE.Line>()

  constructor(sc: Scenario) {
    this.group.name = 'uwb-overlay'
    for (const n of sc.nodes) {
      if (n.kind === 'uwb') this.positions.set(n.id, { x: n.pos.x, z: n.pos.y })
    }
    const anchors = sc.nodes.filter((n) => n.kind === 'uwb' && n.uwb?.role === 'anchor').length
    const plan = roundPlan(sc.uwb ?? DEFAULT_UWB_SESSION, anchors)
    this.blockNs = plan.blockNs
    this.roundNs = plan.roundNs
  }

  /** The instant the tag's round of this block was over: when a ring is freshest. */
  private roundEndNs(block: number, round: number): Ns {
    return block * this.blockNs + (round + 1) * this.roundNs
  }

  private ensure(key: string, name: string, make: () => THREE.Line): THREE.Line {
    let obj = this.objects.get(key)
    if (!obj) {
      obj = make()
      obj.name = name
      this.objects.set(key, obj)
      this.group.add(obj)
    }
    return obj
  }

  update(vs: ViewState): void {
    const alive = new Set<string>()
    for (const [vid, nv] of Object.entries(vs.nodes)) {
      const u = nv.uwb
      if (!u || u.role !== 'tag') continue
      // A UWB device never runs MLO, so its lane id is its physical id; take it
      // through physicalId all the same, so the names never grow a lane suffix.
      const tag = physicalId(vid)

      for (const [peer, r] of Object.entries(u.ranges)) {
        const anchor = this.positions.get(peer)
        if (!anchor || r.block < u.block - 1) continue
        const age = (vs.t - this.roundEndNs(r.block, u.round)) / this.blockNs
        const opacity = RING_MAX_OPACITY * Math.max(0, 1 - age)
        const key = `${tag}:${peer}`
        alive.add(key)
        const ring = this.ensure(key, `ring:${tag}:${peer}`, () => new THREE.LineLoop(
          circleGeometry(),
          new THREE.LineBasicMaterial({ color: UWB_RING_COLOR, transparent: true, opacity: RING_MAX_OPACITY }),
        ))
        ring.position.set(anchor.x, FLOOR_Y, anchor.z)
        ring.scale.set(r.distM, 1, r.distM)
        ;(ring.material as THREE.LineBasicMaterial).opacity = opacity
      }

      const fix = u.position
      if (!fix) continue
      const cross = this.ensure(`${tag}:fix`, `fix:${tag}`, () => new THREE.LineSegments(
        crossGeometry(), new THREE.LineBasicMaterial({ color: UWB_FIX_COLOR }),
      ))
      cross.position.set(fix.x, FLOOR_Y, fix.y)
      alive.add(`${tag}:fix`)

      const ell = this.ensure(`${tag}:ellipse`, `ellipse:${tag}`, () => new THREE.LineLoop(
        circleGeometry(),
        new THREE.LineBasicMaterial({ color: UWB_ELLIPSE_COLOR, transparent: true, opacity: 0.8 }),
      ))
      ell.position.set(fix.x, FLOOR_Y, fix.y)
      ell.scale.set(fix.ellipse.a * ELLIPSE_DRAW_SCALE, 1, fix.ellipse.b * ELLIPSE_DRAW_SCALE)
      // The solver's θ turns the major axis in the model's (x, y) plane; scene y
      // is up, so the same turn is a negative rotation about it.
      ell.rotation.y = -fix.ellipse.thetaRad
      alive.add(`${tag}:ellipse`)
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
