/**
 * The 3-D overlay the UWB ranging engine draws on the floor: one range ring
 * per (tag, anchor) pair, the tag's position fix as a cross, and the 1-σ error
 * ellipse around it. three.js runs headless here — no renderer is created, the
 * assertions read the scene graph the overlay builds.
 *
 * The fixture is lesson 3's scenario ("Two round trips cancel the clock"):
 * four anchors on a 3.50 m ring around a phone in a 10 × 8 m lab, DS-TWR,
 * 10 slots of 2 ms per round, a 200 ms block. Its round 0 ends at 20 ms, so a
 * run to 25 ms holds four fresh ranges and one fix.
 */
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { uwbDstwr } from '../../src/course/uwb/uwb-dstwr'
import { Simulation } from '../../src/engine/simulation'
import { cloneView, type ViewState } from '../../src/model/view'
import { roundPlan } from '../../src/uwb/session'
import { ELLIPSE_DRAW_SCALE, UWB_ELLIPSE_COLOR, UWB_FIX_COLOR, UWB_RING_COLOR, UwbOverlay } from '../../src/uwb/scene'

const MS = 1_000_000
const ANCHORS = ['anchor-1', 'anchor-2', 'anchor-3', 'anchor-4']

const sc = uwbDstwr.scenario()
const plan = roundPlan(sc.uwb!, ANCHORS.length)

function viewAt(ms: number): ViewState {
  const sim = new Simulation(uwbDstwr.scenario())
  sim.runUntil(ms * MS)
  return sim.view
}

/** The same view, replayed at another wall-clock instant (only ring opacity depends on it). */
function at(vs: ViewState, t: number): ViewState {
  const copy = cloneView(vs)
  copy.t = t
  return copy
}

const names = (o: THREE.Object3D): string[] => o.children.map((c) => c.name).sort()
const opacityOf = (o: THREE.Object3D): number => {
  const line = o as THREE.Line
  return (line.material as THREE.LineBasicMaterial).opacity
}

describe('UwbOverlay', () => {
  it('draws one ring per (tag, anchor) range plus the fix and its ellipse', () => {
    const overlay = new UwbOverlay(sc)
    overlay.update(viewAt(25))
    expect(overlay.group.name).toBe('uwb-overlay')
    expect(names(overlay.group)).toEqual([
      'ellipse:tag-1', 'fix:tag-1',
      ...ANCHORS.map((a) => `ring:tag-1:${a}`),
    ].sort())
    overlay.dispose()
  })

  it('gives each ring the measured range as its radius, centred on its anchor', () => {
    const view = viewAt(25)
    const overlay = new UwbOverlay(sc)
    overlay.update(view)
    const ranges = view.nodes['tag-1'].uwb!.ranges
    for (const id of ANCHORS) {
      const ring = overlay.group.getObjectByName(`ring:tag-1:${id}`)!
      const anchor = sc.nodes.find((n) => n.id === id)!
      expect(ring.scale.x).toBeCloseTo(ranges[id].distM, 9)
      expect(ring.scale.z).toBeCloseTo(ranges[id].distM, 9)
      // scene axes: three.x = pos.x, three.z = pos.y, and floor drawings sit just above y = 0
      expect(ring.position.x).toBeCloseTo(anchor.pos.x, 9)
      expect(ring.position.z).toBeCloseTo(anchor.pos.y, 9)
      expect(ring.position.y).toBeGreaterThan(0)
      expect(ring.position.y).toBeLessThan(0.1)
      expect((ring as THREE.Line).isLine).toBe(true)
      expect(((ring as THREE.Line).material as THREE.LineBasicMaterial).color.getHex()).toBe(UWB_RING_COLOR)
      expect(ring.type).toBe('LineLoop')
      expect((ring as THREE.Line).geometry.getAttribute('position').count).toBe(64)
    }
    overlay.dispose()
  })

  it('fades a ring from 0.45 at its round end to nothing one block later', () => {
    const view = viewAt(25)
    const u = view.nodes['tag-1'].uwb!
    const roundEnd = u.ranges['anchor-1'].block * plan.blockNs + (u.round + 1) * plan.roundNs
    expect(roundEnd).toBe(20 * MS)

    const overlay = new UwbOverlay(sc)
    overlay.update(at(view, roundEnd))
    expect(opacityOf(overlay.group.getObjectByName('ring:tag-1:anchor-1')!)).toBeCloseTo(0.45, 9)

    overlay.update(at(view, roundEnd + plan.blockNs / 2))
    expect(opacityOf(overlay.group.getObjectByName('ring:tag-1:anchor-1')!)).toBeCloseTo(0.225, 9)

    overlay.update(at(view, roundEnd + plan.blockNs))
    expect(opacityOf(overlay.group.getObjectByName('ring:tag-1:anchor-1')!)).toBeCloseTo(0, 9)
    overlay.dispose()
  })

  it('never draws a ring stronger than 0.45, however early in its round it is read', () => {
    const view = viewAt(25)
    const u = view.nodes['tag-1'].uwb!
    const roundEnd = u.ranges['anchor-1'].block * plan.blockNs + (u.round + 1) * plan.roundNs
    const overlay = new UwbOverlay(sc)
    // A range lands in its report slot, before the round is over: the age is
    // negative there, and an unclamped 0.45 · (1 - age) would overshoot.
    overlay.update(at(view, roundEnd - plan.roundNs))
    expect(opacityOf(overlay.group.getObjectByName('ring:tag-1:anchor-1')!)).toBeCloseTo(0.45, 9)
    overlay.dispose()
  })

  it('fades the fix and its ellipse on the ring rule, by the block the fix was solved in', () => {
    const view = viewAt(25)
    const u = view.nodes['tag-1'].uwb!
    const roundEnd = u.position!.block * plan.blockNs + (u.round + 1) * plan.roundNs
    const overlay = new UwbOverlay(sc)

    overlay.update(at(view, roundEnd))
    expect(opacityOf(overlay.group.getObjectByName('fix:tag-1')!)).toBeCloseTo(1, 9)
    expect(opacityOf(overlay.group.getObjectByName('ellipse:tag-1')!)).toBeCloseTo(0.8, 9)

    overlay.update(at(view, roundEnd + plan.blockNs / 2))
    expect(opacityOf(overlay.group.getObjectByName('fix:tag-1')!)).toBeCloseTo(0.5, 9)
    expect(opacityOf(overlay.group.getObjectByName('ellipse:tag-1')!)).toBeCloseTo(0.4, 9)

    overlay.update(at(view, roundEnd + plan.blockNs))
    expect(opacityOf(overlay.group.getObjectByName('fix:tag-1')!)).toBeCloseTo(0, 9)
    expect(opacityOf(overlay.group.getObjectByName('ellipse:tag-1')!)).toBeCloseTo(0, 9)
    overlay.dispose()
  })

  it('draws nothing before the first range lands', () => {
    const overlay = new UwbOverlay(sc)
    overlay.update(viewAt(5))
    expect(overlay.group.children).toHaveLength(0)
    overlay.dispose()
  })

  it('draws the fix as a cross and the ellipse at 10× its semi-axes, in amber', () => {
    const view = viewAt(25)
    const overlay = new UwbOverlay(sc)
    overlay.update(view)
    const fix = view.nodes['tag-1'].uwb!.position!
    const cross = overlay.group.getObjectByName('fix:tag-1') as THREE.LineSegments
    expect(cross.position.x).toBeCloseTo(fix.x, 9)
    expect(cross.position.z).toBeCloseTo(fix.y, 9)
    expect((cross.material as THREE.LineBasicMaterial).color.getHex()).toBe(UWB_FIX_COLOR)
    // two 0.3 m lines: four endpoints, spanning 0.3 m in x and in z
    const pos = cross.geometry.getAttribute('position')
    expect(pos.count).toBe(4)
    const xs = [...Array(pos.count).keys()].map((i) => pos.getX(i))
    const zs = [...Array(pos.count).keys()].map((i) => pos.getZ(i))
    // the geometry stores float32, so the span is exact only to about seven digits
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.3, 6)
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(0.3, 6)

    const ell = overlay.group.getObjectByName('ellipse:tag-1') as THREE.Line
    expect(ELLIPSE_DRAW_SCALE).toBe(10)
    expect(ell.scale.x).toBeCloseTo(fix.ellipse.a * ELLIPSE_DRAW_SCALE, 9)
    expect(ell.scale.z).toBeCloseTo(fix.ellipse.b * ELLIPSE_DRAW_SCALE, 9)
    expect(ell.rotation.y).toBeCloseTo(-fix.ellipse.thetaRad, 9)
    expect(ell.position.x).toBeCloseTo(fix.x, 9)
    expect(ell.position.z).toBeCloseTo(fix.y, 9)
    expect((ell.material as THREE.LineBasicMaterial).color.getHex()).toBe(UWB_ELLIPSE_COLOR)
    overlay.dispose()
  })

  it('drops the cross and the ellipse when the lane has no fix, keeping the rings', () => {
    const view = viewAt(25)
    const overlay = new UwbOverlay(sc)
    overlay.update(view)
    const blind = cloneView(view)
    blind.nodes['tag-1'].uwb!.position = null
    overlay.update(blind)
    expect(overlay.group.getObjectByName('fix:tag-1')).toBeUndefined()
    expect(overlay.group.getObjectByName('ellipse:tag-1')).toBeUndefined()
    expect(names(overlay.group)).toEqual(ANCHORS.map((a) => `ring:tag-1:${a}`))
    overlay.dispose()
  })

  it('drops a ring whose block has fallen two blocks behind, keeping a current fix', () => {
    const view = viewAt(25)
    const overlay = new UwbOverlay(sc)
    overlay.update(view)
    const stale = cloneView(view)
    const u = stale.nodes['tag-1'].uwb!
    u.block = u.position!.block
    for (const r of Object.values(u.ranges)) r.block = u.block - 2
    overlay.update(stale)
    expect(names(overlay.group)).toEqual(['ellipse:tag-1', 'fix:tag-1'])
    overlay.dispose()
  })

  it('drops a fix two blocks behind, keeping the current rings', () => {
    const view = viewAt(25)
    const overlay = new UwbOverlay(sc)
    overlay.update(view)
    const stale = cloneView(view)
    const u = stale.nodes['tag-1'].uwb!
    u.block = u.ranges['anchor-1'].block
    u.position!.block = u.block - 2
    overlay.update(stale)
    expect(names(overlay.group)).toEqual(ANCHORS.map((a) => `ring:tag-1:${a}`))
    overlay.dispose()
  })

  it('refuses to draw for a scenario with no ranging session', () => {
    expect(() => new UwbOverlay({ ...sc, uwb: undefined })).toThrow(/ranging session/)
  })

  it('reuses the same objects across updates and empties the group on dispose', () => {
    const view = viewAt(25)
    const overlay = new UwbOverlay(sc)
    overlay.update(view)
    const ring = overlay.group.getObjectByName('ring:tag-1:anchor-1')!
    const geo = (ring as THREE.Line).geometry
    overlay.update(at(view, view.t + MS))
    expect(overlay.group.getObjectByName('ring:tag-1:anchor-1')).toBe(ring)
    expect((overlay.group.getObjectByName('ring:tag-1:anchor-1') as THREE.Line).geometry).toBe(geo)
    overlay.dispose()
    expect(overlay.group.children).toHaveLength(0)
  })
})
