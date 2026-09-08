import * as THREE from 'three'
import type { MacStateName } from '../model/records'
import type { NodeCfg, ProfileId, Scenario } from '../model/scenario'
import type { NodeView } from '../model/view'
import { STRINGS, type Lang } from '../ui/i18n'

/** Icon per app for the label line under a station's name. */
const APP_ICON: Record<ProfileId, string> = {
  video: '📺', voice: '📞', gaming: '🎮', p2pvideo: '📲', backup: '💾', browsing: '🌐', iot: '📡', saturated: '⬆', idle: '',
}

/** "🎮 game · 📺 video" for a station; empty for the AP and idle stations. */
export function appLine(n: NodeCfg, lang: Lang): string {
  if (n.kind !== 'sta') return ''
  const names = STRINGS[lang].appShort
  return n.profiles.filter((p) => p !== 'idle').map((p) => `${APP_ICON[p]} ${names[p]}`).join(' · ')
}

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

/**
 * A one- or two-line text sprite. `sub` is drawn smaller and dimmer under the
 * main text (the station's apps under its name).
 */
export function makeTextSprite(text: string, color = '#e5e9f0', px = 48, sub = ''): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.textAlign = 'center'
  ctx.fillStyle = color
  if (sub) {
    ctx.font = `${Math.round(px * 0.9)}px 'Segoe UI', sans-serif`
    ctx.fillText(text, 256, 62)
    ctx.font = `${Math.round(px * 0.62)}px 'Segoe UI', sans-serif`
    ctx.fillStyle = '#a5aebc'
    ctx.fillText(sub, 256, 110)
  } else {
    ctx.font = `${px}px 'Segoe UI', sans-serif`
    ctx.fillText(text, 256, 80)
  }
  const tex = new THREE.CanvasTexture(canvas)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }))
  sprite.scale.set(2.4, 0.6, 1)
  return sprite
}

/** Colour of the second label line (the TXOP countdown). */
const TXOP_COLOR = '#22d3ee'

/**
 * Redraw the status sprite. A newline splits the text into two stacked lines:
 * the MAC state on top, the TXOP countdown (in TXOP_COLOR) underneath.
 */
function updateSpriteText(sprite: THREE.Sprite, text: string, color = '#e5e9f0'): void {
  if (sprite.userData.text === text) return
  sprite.userData.text = text
  const tex = (sprite.material as THREE.SpriteMaterial).map as THREE.CanvasTexture
  const canvas = tex.image as HTMLCanvasElement
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.textAlign = 'center'
  const lines = text.split('\n')
  if (lines.length === 1) {
    ctx.font = `48px 'Segoe UI', sans-serif`
    ctx.fillStyle = color
    ctx.fillText(lines[0], 256, 80)
  } else {
    ctx.font = `44px 'Segoe UI', sans-serif`
    ctx.fillStyle = color
    ctx.fillText(lines[0], 256, 50)
    ctx.font = `38px 'Segoe UI', sans-serif`
    ctx.fillStyle = TXOP_COLOR
    ctx.fillText(lines[1], 256, 108)
  }
  tex.needsUpdate = true
}

export function buildNodeGroup(n: NodeCfg, lang: Lang = 'en'): THREE.Group {
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

  const label = makeTextSprite(n.name, '#e5e9f0', 48, appLine(n, lang))
  label.name = 'label'
  label.position.set(0, 0.55, 0)
  g.add(label)

  const status = makeTextSprite('', '#fbbf24')
  status.name = 'status'
  status.position.set(0, 0.95, 0)
  g.add(status)

  return g
}

export function buildNodeMeshes(sc: Scenario, lang: Lang = 'en'): Map<string, THREE.Group> {
  const map = new Map<string, THREE.Group>()
  for (const n of sc.nodes) map.set(n.id, buildNodeGroup(n, lang))
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

const AC_SHORT = ['BK', 'BE', 'VI', 'VO']

/** "TXOP VI 1500µs" while the node holds a transmit opportunity, else ''. */
export function txopText(nv: NodeView, tNs: number): string {
  if (nv.txopUntilNs <= tNs) return ''
  return `TXOP ${AC_SHORT[nv.txopAc] ?? '?'} ${((nv.txopUntilNs - tNs) / 1000).toFixed(0)}µs`
}

/** Full label above a node: MAC state on line one, TXOP countdown on line two. */
export function labelText(nv: NodeView, tNs: number): string {
  const txop = txopText(nv, tNs)
  // the TXOP line always sits on line two so it keeps its own colour even when line one is empty
  return txop ? statusText(nv, tNs) + '\n' + txop : statusText(nv, tNs)
}

export function updateNodeVisual(g: THREE.Group, nv: NodeView, tNs: number): void {
  const halo = g.getObjectByName('halo') as THREE.Mesh
  const navActive = nv.navUntilNs > tNs
  ;(halo.material as THREE.MeshBasicMaterial).color.setHex(haloColor(nv.state, navActive))
  const status = g.getObjectByName('status') as THREE.Sprite
  updateSpriteText(status, labelText(nv, tNs), '#fbbf24')
}
