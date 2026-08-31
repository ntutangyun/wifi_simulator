import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useUi } from '../ui/store'
import { buildHouse } from './house'
import { buildNodeMeshes, updateNodeVisual } from './nodes'
import { EffectsLayer } from './effects'

export function Viewport() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x111318)
    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const sun = new THREE.DirectionalLight(0xffffff, 1.2)
    sun.position.set(8, 14, 6)
    scene.add(sun)

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200)
    const controls = new OrbitControls(camera, renderer.domElement)

    // static scene content for the current scenario
    const sc = useUi.getState().scenario
    scene.add(buildHouse(sc))
    const nodeMeshes = buildNodeMeshes(sc)
    for (const g of nodeMeshes.values()) scene.add(g)
    const effects = new EffectsLayer(sc)
    scene.add(effects.group)

    // frame the house
    const cx = sc.rooms.length ? sc.rooms.reduce((s, r) => s + r.x + r.w / 2, 0) / sc.rooms.length : 5
    const cy = sc.rooms.length ? sc.rooms.reduce((s, r) => s + r.y + r.h / 2, 0) / sc.rooms.length : 4
    camera.position.set(cx + 6, 9, cy + 9)
    controls.target.set(cx, 0.8, cy)
    controls.update()

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
          const nv = view.nodes[id]
          if (nv) updateNodeVisual(g, nv, playheadNs)
          const halo = g.getObjectByName('halo') as THREE.Mesh
          halo.scale.setScalar(id === selectedNodeId ? 1.35 : 1)
        }
        effects.update(view)
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
      controls.dispose()
      renderer.dispose()
      host.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
}
