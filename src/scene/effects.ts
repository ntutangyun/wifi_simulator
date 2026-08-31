import * as THREE from 'three'
import { physicalId } from '../model/caps'
import type { FrameDesc } from '../model/frames'
import type { Scenario } from '../model/scenario'
import type { Ns } from '../model/types'
import type { FlightView, ViewState } from '../model/view'

export const MAX_WAVE_RADIUS = 10

export function flightProgress(t: Ns, f: FlightView): number {
  const d = f.endNs - f.startNs
  if (d <= 0) return 1
  return Math.max(0, Math.min(1, (t - f.startNs) / d))
}

export function frameColor(frame: FrameDesc, apId: string): number {
  switch (frame.kind) {
    case 'data': return frame.src === apId ? 0x3b82f6 : 0x22c55e
    case 'ack': return 0xffffff
    case 'ba':
    case 'mba': return 0xd8b4fe
    case 'trigger': return 0xfacc15
    case 'rts':
    case 'cts': return 0xf97316
  }
}

/** Keeps expanding wavefront spheres in sync with vs.inFlight. */
export class EffectsLayer {
  group = new THREE.Group()
  private waves = new Map<string, THREE.Mesh>()
  private apId: string
  private positions = new Map<string, { x: number; y: number; z: number }>()

  constructor(sc: Scenario) {
    this.group.name = 'effects'
    this.apId = sc.nodes.find((n) => n.kind === 'ap')!.id
    for (const n of sc.nodes) this.positions.set(n.id, { x: n.pos.x, y: n.pos.z, z: n.pos.y })

    // faint association lines AP ↔ STA
    const ap = this.positions.get(this.apId)!
    for (const n of sc.nodes) {
      if (n.kind !== 'sta') continue
      const p = this.positions.get(n.id)!
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(ap.x, ap.y, ap.z),
        new THREE.Vector3(p.x, p.y, p.z),
      ])
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.18 }))
      this.group.add(line)
    }
  }

  update(vs: ViewState): void {
    const alive = new Set<string>()
    for (const f of vs.inFlight) {
      const key = `${f.from}:${f.startNs}`
      alive.add(key)
      let mesh = this.waves.get(key)
      if (!mesh) {
        const is6g = f.from.includes('#6g')
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(1, 24, 16),
          new THREE.MeshBasicMaterial({
            color: frameColor(f.frame, this.apId),
            transparent: true,
            opacity: 0.22,
            depthWrite: false,
            side: THREE.DoubleSide,
            wireframe: is6g, // 6 GHz link waves render as wireframe
          }),
        )
        const p = this.positions.get(physicalId(f.from))
        if (p) mesh.position.set(p.x, p.y, p.z)
        this.waves.set(key, mesh)
        this.group.add(mesh)
      }
      const prog = flightProgress(vs.t, f)
      const r = 0.05 + prog * MAX_WAVE_RADIUS
      mesh.scale.setScalar(r)
      ;(mesh.material as THREE.MeshBasicMaterial).opacity = 0.05 + 0.25 * (1 - prog)
    }
    for (const [key, mesh] of this.waves) {
      if (!alive.has(key)) {
        this.group.remove(mesh)
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
        this.waves.delete(key)
      }
    }
  }
}
