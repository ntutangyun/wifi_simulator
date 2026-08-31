import * as THREE from 'three'
import type { MacStateName } from '../model/records'
import type { NodeCfg, Scenario } from '../model/scenario'
import type { NodeView } from '../model/view'

/** MAC state → halo ring color. NAV override wins. */
export function haloColor(state: MacStateName, navActive: boolean): number {
  if (navActive && state !== 'tx' && state !== 'sifsResp') return 0x9333ea
  switch (state) {
    case 'idle': return 0x555555
    case 'defer': return 0xeab308
    case 'backoff': return 0xf59e0b
    case 'tx': return 0x3b82f6
    case 'rx': return 0x8b5cf6
    case 'waitAck':
    case 'waitCts':
    case 'sifsResp': return 0x06b6d4
  }
}

export function makeTextSprite(text: string, color = '#e5e9f0', px = 48): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.font = `${px}px 'Segoe UI', sans-serif`
  ctx.textAlign = 'center'
  ctx.fillStyle = color
  ctx.fillText(text, 256, 80)
  const tex = new THREE.CanvasTexture(canvas)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }))
  sprite.scale.set(2.4, 0.6, 1)
  return sprite
}

function updateSpriteText(sprite: THREE.Sprite, text: string, color = '#e5e9f0'): void {
  if (sprite.userData.text === text) return
  sprite.userData.text = text
  const tex = (sprite.material as THREE.SpriteMaterial).map as THREE.CanvasTexture
  const canvas = tex.image as HTMLCanvasElement
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = `48px 'Segoe UI', sans-serif`
  ctx.textAlign = 'center'
  ctx.fillStyle = color
  ctx.fillText(text, 256, 80)
  tex.needsUpdate = true
}

export function buildNodeGroup(n: NodeCfg): THREE.Group {
  const g = new THREE.Group()
  g.name = `node:${n.id}`
  g.position.set(n.pos.x, n.pos.z, n.pos.y)

  let body: THREE.Mesh
  if (n.kind === 'ap') {
    body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.26, 0.12, 24),
      new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.4 }),
    )
    for (const dx of [-0.12, 0.12]) {
      const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6),
        new THREE.MeshStandardMaterial({ color: 0x222222 }),
      )
      ant.position.set(dx, 0.2, 0)
      g.add(ant)
    }
  } else {
    body = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.32, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.5 }),
    )
  }
  body.name = 'body'
  body.userData.nodeId = n.id
  g.add(body)

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.44, 32),
    new THREE.MeshBasicMaterial({ color: 0x555555, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
  )
  halo.name = 'halo'
  halo.rotation.x = -Math.PI / 2
  halo.position.y = -n.pos.z + 0.02 // ring sits on the floor
  g.add(halo)

  const label = makeTextSprite(n.name)
  label.name = 'label'
  label.position.set(0, 0.55, 0)
  g.add(label)

  const status = makeTextSprite('', '#fbbf24')
  status.name = 'status'
  status.position.set(0, 0.95, 0)
  g.add(status)

  return g
}

export function buildNodeMeshes(sc: Scenario): Map<string, THREE.Group> {
  const map = new Map<string, THREE.Group>()
  for (const n of sc.nodes) map.set(n.id, buildNodeGroup(n))
  return map
}

/** Short live annotation above a node: backoff count, IFS kind, NAV. */
export function statusText(nv: NodeView, tNs: number): string {
  if (nv.state === 'backoff' && nv.backoff !== null) return `bo:${nv.backoff}`
  if (nv.ifs) return `${nv.ifs.kind} ${(Math.max(0, nv.ifs.untilNs - tNs) / 1000).toFixed(0)}µs`
  if (nv.navUntilNs > tNs) return `NAV ${((nv.navUntilNs - tNs) / 1000).toFixed(0)}µs`
  if (nv.state === 'waitAck') return 'wait ACK'
  if (nv.state === 'waitCts') return 'wait CTS'
  if (nv.backoff !== null && nv.backoff > 0) return `bo:${nv.backoff}`
  return ''
}

export function updateNodeVisual(g: THREE.Group, nv: NodeView, tNs: number): void {
  const halo = g.getObjectByName('halo') as THREE.Mesh
  const navActive = nv.navUntilNs > tNs
  ;(halo.material as THREE.MeshBasicMaterial).color.setHex(haloColor(nv.state, navActive))
  const status = g.getObjectByName('status') as THREE.Sprite
  updateSpriteText(status, statusText(nv, tNs), '#fbbf24')
}
