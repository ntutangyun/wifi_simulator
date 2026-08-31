import * as THREE from 'three'
import type { Scenario, Wall } from '../model/scenario'

export const WALL_HEIGHT = 2.6
const WALL_THICKNESS = 0.12

const MATERIAL_COLORS: Record<Wall['material'], number> = {
  drywall: 0xd8d2c8,
  brick: 0x8d5b4c,
  glass: 0x9fc8e8,
}

/** Solid spans of a wall (the parts between openings), in meters from its start. */
export function wallSolidSpans(w: Wall): { a: number; b: number }[] {
  const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1)
  const spans: { a: number; b: number }[] = []
  let cur = 0
  for (const o of [...w.openings].sort((x, y) => x.from - y.from)) {
    if (o.from > cur) spans.push({ a: cur, b: o.from })
    cur = Math.max(cur, o.to)
  }
  if (cur < len) spans.push({ a: cur, b: len })
  return spans
}

export function buildHouse(sc: Scenario): THREE.Group {
  const g = new THREE.Group()
  g.name = 'house'

  for (const r of sc.rooms) {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(r.w, r.h),
      new THREE.MeshStandardMaterial({ color: 0x262b35, roughness: 0.9 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.set(r.x + r.w / 2, 0, r.y + r.h / 2)
    g.add(floor)
  }

  for (const w of sc.walls) {
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1)
    if (len < 1e-6) continue
    const ux = (w.x2 - w.x1) / len
    const uy = (w.y2 - w.y1) / len
    const angle = Math.atan2(uy, ux)
    const mat = new THREE.MeshStandardMaterial({
      color: MATERIAL_COLORS[w.material],
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    })
    for (const s of wallSolidSpans(w)) {
      const segLen = s.b - s.a
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(segLen, WALL_HEIGHT, WALL_THICKNESS), mat)
      const cx = w.x1 + ux * (s.a + segLen / 2)
      const cy = w.y1 + uy * (s.a + segLen / 2)
      mesh.position.set(cx, WALL_HEIGHT / 2, cy)
      mesh.rotation.y = -angle
      g.add(mesh)
    }
  }
  return g
}
