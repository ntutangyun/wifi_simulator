import * as THREE from 'three'
import { physicalId } from '../model/caps'
import type { FrameDesc } from '../model/frames'
import type { Scenario } from '../model/scenario'
import type { Ns } from '../model/types'
import type { FlightView, ViewState, WanFlight } from '../model/view'
import { makeTextSprite } from './nodes'

export const MAX_WAVE_RADIUS = 10
/** Cloud strip: this far beyond the house's north wall, this high up. */
const CLOUD_OFFSET_M = 3.5
const CLOUD_HEIGHT_M = 3.2
const SERVER_COLORS: Record<string, number> = { video: 0xef4444, web: 0x3b82f6, call: 0x22c55e, game: 0xa855f7 }

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
    case 'cfend': return 0xfb7185
    case 'rts':
    case 'cts': return 0xf97316
  }
}

/** Keeps expanding wavefront spheres in sync with vs.inFlight. */
const wanKey = (f: WanFlight): string => `${f.server}:${f.dir}:${f.peer}:${f.startNs}`

export class EffectsLayer {
  group = new THREE.Group()
  private waves = new Map<string, THREE.Mesh>()
  private apId: string
  private positions = new Map<string, { x: number; y: number; z: number }>()
  /** Cloud anchor per server id (scene coordinates) and the WAN dots in flight. */
  private clouds = new Map<string, { pos: THREE.Vector3; color: number }>()
  private dots = new Map<string, THREE.Mesh>()

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

    // cloud servers on a strip beyond the north wall, each tied to the AP
    if (sc.servers.length) {
      const xs = sc.rooms.flatMap((r) => [r.x, r.x + r.w])
      const ys = sc.rooms.flatMap((r) => [r.y, r.y + r.h])
      const minX = xs.length ? Math.min(...xs) : 0
      const maxX = xs.length ? Math.max(...xs) : 10
      const north = (ys.length ? Math.min(...ys) : 0) - CLOUD_OFFSET_M
      const n = sc.servers.length
      sc.servers.forEach((s, i) => {
        const x = minX + ((i + 0.5) / n) * (maxX - minX)
        const pos = new THREE.Vector3(x, CLOUD_HEIGHT_M, north)
        const color = SERVER_COLORS[s.kind] ?? 0x94a3b8
        this.clouds.set(s.id, { pos, color })
        const cloud = new THREE.Group()
        const mat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.9, transparent: true, opacity: 0.85 })
        for (const [dx, dy, r] of [[0, 0, 0.55], [-0.5, -0.1, 0.4], [0.5, -0.08, 0.42], [0.05, 0.3, 0.38]] as const) {
          const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat)
          puff.position.set(dx, dy, 0)
          cloud.add(puff)
        }
        const badge = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color }))
        badge.position.set(0, -0.55, 0.3)
        cloud.add(badge)
        const label = makeTextSprite(s.name)
        label.position.set(0, 1.0, 0)
        cloud.add(label)
        cloud.position.copy(pos)
        this.group.add(cloud)
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ap.x, ap.y, ap.z), pos])
        this.group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.25 })))
      })
    }
  }

  /** One small sphere per frame crossing the WAN, sliding along the AP–cloud line. */
  private updateWan(vs: ViewState): void {
    const alive = new Set<string>()
    const ap = this.positions.get(this.apId)!
    const apV = new THREE.Vector3(ap.x, ap.y, ap.z)
    for (const f of vs.wan) {
      const cloud = this.clouds.get(f.server)
      if (!cloud) continue
      const key = wanKey(f)
      alive.add(key)
      let dot = this.dots.get(key)
      if (!dot) {
        dot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: cloud.color }))
        this.dots.set(key, dot)
        this.group.add(dot)
      }
      const span = Math.max(1, f.endNs - f.startNs)
      const prog = Math.min(1, Math.max(0, (vs.t - f.startNs) / span))
      const [from, to] = f.dir === 'up' ? [apV, cloud.pos] : [cloud.pos, apV]
      dot.position.lerpVectors(from, to, prog)
    }
    for (const [key, dot] of this.dots) {
      if (!alive.has(key)) {
        this.group.remove(dot)
        dot.geometry.dispose()
        ;(dot.material as THREE.Material).dispose()
        this.dots.delete(key)
      }
    }
  }

  update(vs: ViewState): void {
    this.updateWan(vs)
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
