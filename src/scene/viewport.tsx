import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useStrings } from '../ui/i18n'
import { useUi } from '../ui/store'
import { buildHouse } from './house'
import { buildNodeMeshes, updateNodeVisual } from './nodes'
import { EffectsLayer } from './effects'
import { UwbOverlay } from '../uwb/scene'
import { primaryLaneOf } from '../model/view'

export function Viewport() {
  const L = useStrings()
  const hostRef = useRef<HTMLDivElement>(null)
  /** The camera controls, so the on-screen buttons can drive the same object a
   *  finger or a mouse drives. Set once the scene is built. */
  const controlsRef = useRef<OrbitControls | null>(null)
  /** Where the camera started, for the button that undoes an hour of orbiting. */
  const homeRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null)

  useEffect(() => {
    const host = hostRef.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    // OrbitControls has handled touch since long before this app existed — one
    // finger orbits, two pinch and pan — but the browser claims those gestures
    // for page scroll and page zoom first unless the element opts out. Without
    // this line the 3-D view simply does not respond to a finger.
    renderer.domElement.style.touchAction = 'none'
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x111318)
    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const sun = new THREE.DirectionalLight(0xffffff, 1.2)
    sun.position.set(8, 14, 6)
    scene.add(sun)

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200)
    const controls = new OrbitControls(camera, renderer.domElement)
    controlsRef.current = controls

    // static scene content for the current scenario
    const sc = useUi.getState().scenario
    scene.add(buildHouse(sc))
    const nodeMeshes = buildNodeMeshes(sc)
    for (const g of nodeMeshes.values()) scene.add(g)
    const effects = new EffectsLayer(sc)
    scene.add(effects.group)
    // Range rings, fix and error ellipse: only a scenario that ranges gets them.
    const uwb = sc.uwb && sc.nodes.some((n) => n.kind === 'uwb') ? new UwbOverlay(sc) : null
    if (uwb) scene.add(uwb.group)

    // frame the house
    const cx = sc.rooms.length ? sc.rooms.reduce((s, r) => s + r.x + r.w / 2, 0) / sc.rooms.length : 5
    const cy = sc.rooms.length ? sc.rooms.reduce((s, r) => s + r.y + r.h / 2, 0) / sc.rooms.length : 4
    camera.position.set(cx + 6, 9, cy + 9)
    controls.target.set(cx, 0.8, cy)
    controls.update()
    homeRef.current = { pos: camera.position.clone(), target: controls.target.clone() }

    const resize = () => {
      const w = host.clientWidth
      const h = host.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    // click → select node
    const ray = new THREE.Raycaster()
    const onClick = (e: MouseEvent) => {
      const r = renderer.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      )
      ray.setFromCamera(ndc, camera)
      const bodies = [...nodeMeshes.values()].map((g) => g.getObjectByName('body')!)
      const hit = ray.intersectObjects(bodies, false)[0]
      useUi.getState().select(hit ? (hit.object.userData.nodeId as string) : null)
    }
    renderer.domElement.addEventListener('click', onClick)

    let raf = 0
    const render = () => {
      const { view, playheadNs, selectedNodeId } = useUi.getState()
      if (view) {
        for (const [id, g] of nodeMeshes) {
          // nodeMeshes are keyed by physical id; a 2.4 GHz- or 6 GHz-only node has no bare lane.
          const nv = primaryLaneOf(view, id)
          if (nv) updateNodeVisual(g, nv, playheadNs)
          const halo = g.getObjectByName('halo') as THREE.Mesh
          halo.scale.setScalar(id === selectedNodeId ? 1.35 : 1)
        }
        effects.update(view)
        uwb?.update(view)
      }
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener('click', onClick)
      uwb?.dispose()
      controls.dispose()
      controlsRef.current = null
      renderer.dispose()
      host.removeChild(renderer.domElement)
    }
  }, [])

  /**
   * Move the camera the way a drag would, without a drag.
   *
   * `dolly` multiplies the distance to the target; `pan` slides the target and
   * the camera together across the ground, in units of the current distance so a
   * tap moves the same fraction of the view however far out you are.
   */
  const nudge = (dolly: number, panX = 0, panZ = 0): void => {
    const c = controlsRef.current
    if (!c) return
    const cam = c.object as THREE.PerspectiveCamera
    if (panX || panZ) {
      // Pan along the camera's own right and forward, not the world axes, or the
      // buttons would push in directions unrelated to what is on screen.
      const dist = cam.position.distanceTo(c.target)
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 0).setY(0).normalize()
      const fwd = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), right).normalize()
      const step = dist * 0.15
      const move = right.multiplyScalar(panX * step).add(fwd.multiplyScalar(panZ * step))
      cam.position.add(move)
      c.target.add(move)
    }
    if (dolly !== 1) {
      const offset = cam.position.clone().sub(c.target).multiplyScalar(dolly)
      // Keep the camera out of the target and off the far plane.
      const len = offset.length()
      if (len > 1.5 && len < 120) cam.position.copy(c.target).add(offset)
    }
    c.update()
  }

  const home = (): void => {
    const c = controlsRef.current
    const h = homeRef.current
    if (!c || !h) return
    c.object.position.copy(h.pos)
    c.target.copy(h.target)
    c.update()
  }

  const btn: React.CSSProperties = {
    width: 32, minHeight: 32, padding: 0, fontSize: 14, lineHeight: 1,
    background: 'rgba(20,22,28,0.82)',
  }

  return (
    <div ref={hostRef} style={{ position: 'absolute', inset: 0 }}>
      {/* A finger can orbit and pinch this view directly, now that the canvas
          stops the browser taking those gestures. These are for the times that is
          awkward: precise zoom, a nudge sideways, and a way back. */}
      <div style={{
        position: 'absolute', right: 8, bottom: 8, zIndex: 4,
        display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 4, justifyItems: 'center',
      }}>
        <span />
        <button style={btn} title={L.view.panUp} onClick={() => nudge(1, 0, 1)}>▲</button>
        <span />
        <button style={btn} title={L.view.panLeft} onClick={() => nudge(1, -1, 0)}>◀</button>
        <button style={btn} title={L.view.home} onClick={home}>⌂</button>
        <button style={btn} title={L.view.panRight} onClick={() => nudge(1, 1, 0)}>▶</button>
        <button style={btn} title={L.view.zoomOut} onClick={() => nudge(1.25)}>−</button>
        <button style={btn} title={L.view.panDown} onClick={() => nudge(1, 0, -1)}>▼</button>
        <button style={btn} title={L.view.zoomIn} onClick={() => nudge(0.8)}>＋</button>
      </div>
    </div>
  )
}
