import { useEffect, useRef, useState } from 'react'
import { Rng } from '../engine/rng'
import { FEATURE_LABEL, GEN_FEATURES, GEN_LABEL, type FeatureFlag } from '../model/caps'
import type { Material, NodeCfg, ProfileId, Scenario } from '../model/scenario'
import { nonht } from '../model/scenario'
import type { Generation } from '../model/types'
import { Guide } from '../ui/Guide'
import { useUi } from '../ui/store'
import {
  addOpening, alongWall, hitTestNode, hitTestWall, roomsToWalls,
  scenarioFromJson, scenarioToJson, snap, spawnRandomStas,
} from './planOps'

type Tool = 'select' | 'room' | 'door' | 'window' | 'sta'
type Tab = 'props' | 'objects' | 'guide'
type Sel =
  | { kind: 'node'; id: string }
  | { kind: 'wall'; index: number }
  | { kind: 'room'; index: number }
  | null

const LS_KEY = 'wifi-sim.scenario'
const MATERIAL_COLORS: Record<Material, string> = { drywall: '#c8c2b6', brick: '#a05b48', glass: '#7fb8e0' }
const PROFILES: ProfileId[] = ['video', 'voice', 'backup', 'browsing', 'iot', 'saturated', 'idle']

interface ViewT {
  cx: number
  cy: number
  scale: number // px per meter
}

function fitView(sc: Scenario, wPx: number, hPx: number): ViewT {
  const xs = sc.rooms.length ? sc.rooms : [{ x: 0, y: 0, w: 10, h: 8 }]
  const minX = Math.min(...xs.map((r) => r.x)) - 1
  const maxX = Math.max(...xs.map((r) => r.x + r.w)) + 1
  const minY = Math.min(...xs.map((r) => r.y)) - 1
  const maxY = Math.max(...xs.map((r) => r.y + r.h)) + 1
  const scale = Math.min(wPx / (maxX - minX), hPx / (maxY - minY))
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, scale: Math.max(10, Math.min(200, scale)) }
}

export function FloorPlanEditor() {
  const { scenario, setScenario } = useUi()
  const [tool, setTool] = useState<Tool>('select')
  const [tab, setTab] = useState<Tab>('props')
  const [sel, setSel] = useState<Sel>(null)
  const [dragRect, setDragRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [dragNode, setDragNode] = useState<string | null>(null)
  const [spawnN, setSpawnN] = useState(3)
  const [ioMsg, setIoMsg] = useState('')
  const [view, setView] = useState<ViewT | null>(null)
  const panRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!view && hostRef.current) {
      const r = hostRef.current.getBoundingClientRect()
      setView(fitView(scenario, r.width, r.height))
    }
  }, [view, scenario])

  const resetView = () => {
    const r = hostRef.current!.getBoundingClientRect()
    setView(fitView(scenario, r.width, r.height))
  }

  if (!view) return <div ref={hostRef} style={{ height: '100%' }} />

  const rect = () => hostRef.current!.getBoundingClientRect()
  const vw = () => rect().width / view.scale
  const vh = () => rect().height / view.scale
  const viewBox = `${view.cx - vw() / 2} ${view.cy - vh() / 2} ${vw()} ${vh()}`
  const px = (n: number) => n / view.scale // n pixels in meters

  const toWorld = (e: { clientX: number; clientY: number }) => {
    const r = rect()
    return {
      x: view.cx - vw() / 2 + (e.clientX - r.left) / view.scale,
      y: view.cy - vh() / 2 + (e.clientY - r.top) / view.scale,
    }
  }

  const commit = (sc: Scenario) => setScenario(sc)

  const selectAndShow = (s: Sel) => {
    setSel(s)
    if (s) setTab('props')
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || e.button === 2) {
      // middle/right drag = pan
      panRef.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy }
      ;(e.target as Element).setPointerCapture(e.pointerId)
      return
    }
    const p = toWorld(e)
    if (tool === 'room') {
      setDragRect({ x0: snap(p.x), y0: snap(p.y), x1: snap(p.x), y1: snap(p.y) })
    } else if (tool === 'select') {
      const nid = hitTestNode(scenario.nodes, p, px(14))
      if (nid) {
        selectAndShow({ kind: 'node', id: nid })
        setDragNode(nid)
        return
      }
      const wi = hitTestWall(scenario.walls, p, px(8))
      if (wi !== null) {
        selectAndShow({ kind: 'wall', index: wi })
        return
      }
      const ri = scenario.rooms.findIndex((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)
      selectAndShow(ri >= 0 ? { kind: 'room', index: ri } : null)
    } else if (tool === 'door' || tool === 'window') {
      const wi = hitTestWall(scenario.walls, p, px(10))
      if (wi !== null) {
        const walls = [...scenario.walls]
        walls[wi] = addOpening(walls[wi], alongWall(walls[wi], p), tool === 'door' ? 0.9 : 1.2)
        commit({ ...scenario, walls })
      }
    } else if (tool === 'sta') {
      const used = new Set(scenario.nodes.map((x) => x.id))
      let k = scenario.nodes.length
      let id = `sta-${k}`
      while (used.has(id)) id = `sta-${++k}`
      const node: NodeCfg = {
        id, kind: 'sta', name: id.toUpperCase(), pos: { x: snap(p.x), y: snap(p.y), z: 1.0 },
        txPowerDbm: 15, profile: 'browsing', caps: { ...nonht },
      }
      commit({ ...scenario, nodes: [...scenario.nodes, node] })
      setTool('select')
      selectAndShow({ kind: 'node', id })
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (panRef.current) {
      const p = panRef.current
      setView({ ...view, cx: p.cx - (e.clientX - p.x) / view.scale, cy: p.cy - (e.clientY - p.y) / view.scale })
      return
    }
    const p = toWorld(e)
    if (dragRect) setDragRect({ ...dragRect, x1: snap(p.x), y1: snap(p.y) })
    else if (dragNode) {
      const nodes = scenario.nodes.map((n) =>
        n.id === dragNode ? { ...n, pos: { ...n.pos, x: snap(p.x), y: snap(p.y) } } : n,
      )
      commit({ ...scenario, nodes })
    }
  }

  const onPointerUp = () => {
    panRef.current = null
    if (dragRect) {
      const x = Math.min(dragRect.x0, dragRect.x1)
      const y = Math.min(dragRect.y0, dragRect.y1)
      const w = Math.abs(dragRect.x1 - dragRect.x0)
      const h = Math.abs(dragRect.y1 - dragRect.y0)
      if (w >= 1 && h >= 1) {
        const rooms = [...scenario.rooms, { x, y, w, h, name: `Room ${scenario.rooms.length + 1}` }]
        commit({ ...scenario, rooms, walls: roomsToWalls(rooms, scenario.walls) })
      }
      setDragRect(null)
    }
    setDragNode(null)
  }

  const onWheel = (e: React.WheelEvent) => {
    const f = e.deltaY > 0 ? 1 / 1.15 : 1.15
    const p = toWorld(e)
    const scale = Math.max(8, Math.min(300, view.scale * f))
    // keep the cursor's world point fixed
    const r = rect()
    const mx = (e.clientX - r.left) / scale
    const my = (e.clientY - r.top) / scale
    setView({ scale, cx: p.x - mx + r.width / scale / 2, cy: p.y - my + r.height / scale / 2 })
  }

  const deleteRoom = (index: number) => {
    const rooms = scenario.rooms.filter((_, i) => i !== index)
    commit({ ...scenario, rooms, walls: roomsToWalls(rooms, scenario.walls) })
    setSel(null)
  }

  const deleteNode = (id: string) => {
    const n = scenario.nodes.find((x) => x.id === id)
    if (!n || n.kind === 'ap') return
    commit({ ...scenario, nodes: scenario.nodes.filter((x) => x.id !== id) })
    setSel(null)
  }

  const moveNode = (id: string, dir: -1 | 1) => {
    const i = scenario.nodes.findIndex((n) => n.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= scenario.nodes.length) return
    const nodes = [...scenario.nodes]
    ;[nodes[i], nodes[j]] = [nodes[j], nodes[i]]
    commit({ ...scenario, nodes })
  }

  const updateNode = (id: string, patch: Partial<NodeCfg>) => {
    commit({ ...scenario, nodes: scenario.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) })
  }

  const setGeneration = (n: NodeCfg, gen: Generation) => {
    const features: Partial<Record<FeatureFlag, boolean>> = {}
    for (const f of GEN_FEATURES[gen]) features[f] = n.caps.features[f] ?? true
    updateNode(n.id, { caps: { generation: gen, features: features as Record<string, boolean> }, linkId: gen === 'he' || gen === 'eht' ? n.linkId : undefined })
  }

  const gridLines = () => {
    const x0 = Math.floor(view.cx - vw() / 2)
    const x1 = Math.ceil(view.cx + vw() / 2)
    const y0 = Math.floor(view.cy - vh() / 2)
    const y1 = Math.ceil(view.cy + vh() / 2)
    const lines: React.ReactElement[] = []
    for (let x = x0; x <= x1; x++) {
      lines.push(<line key={`v${x}`} x1={x} y1={y0} x2={x} y2={y1}
        stroke={x % 5 === 0 ? '#2c3240' : '#1d212b'} strokeWidth={px(x % 5 === 0 ? 1.4 : 1)} />)
    }
    for (let y = y0; y <= y1; y++) {
      lines.push(<line key={`h${y}`} x1={x0} y1={y} x2={x1} y2={y}
        stroke={y % 5 === 0 ? '#2c3240' : '#1d212b'} strokeWidth={px(y % 5 === 0 ? 1.4 : 1)} />)
    }
    return lines
  }

  const selNode = sel?.kind === 'node' ? scenario.nodes.find((n) => n.id === sel.id) : undefined
  const selWall = sel?.kind === 'wall' ? scenario.walls[sel.index] : undefined
  const scaleBarM = view.scale > 40 ? 1 : 5

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', height: '100%' }}>
      <div ref={hostRef} style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 2, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(['select', 'room', 'door', 'window', 'sta'] as Tool[]).map((t) => (
            <button key={t} className={tool === t ? 'active' : ''} onClick={() => setTool(t)}>
              {{ select: '☝ select', room: '▭ room', door: '🚪 door', window: '🪟 window', sta: '📱 STA' }[t]}
            </button>
          ))}
          <button title="reset view (fit house)" onClick={resetView}>⌂ fit</button>
        </div>
        {/* scale bar */}
        <div style={{ position: 'absolute', left: 10, bottom: 8, zIndex: 2, color: 'var(--dim)', fontSize: 10 }}>
          <div style={{ width: scaleBarM * view.scale, height: 3, background: '#8a93a3', marginBottom: 2 }} />
          {scaleBarM} m · grid 1 m (bold 5 m) · wheel zoom · middle/right-drag pan
        </div>
        <svg
          ref={svgRef}
          viewBox={viewBox}
          style={{ width: '100%', height: '100%', display: 'block', background: '#14161c', touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
          onContextMenu={(e) => e.preventDefault()}
        >
          {gridLines()}
          {scenario.rooms.map((r, i) => (
            <g key={i}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h}
                fill={sel?.kind === 'room' && sel.index === i ? '#2a3550' : '#1c212c'} stroke="none" />
              <text x={r.x + 0.2} y={r.y + 0.55} fontSize={0.42} fill="#8a93a3">{r.name}</text>
            </g>
          ))}
          {scenario.walls.map((w, i) => {
            const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1)
            if (len < 1e-9) return null
            const ux = (w.x2 - w.x1) / len
            const uy = (w.y2 - w.y1) / len
            const segs: { a: number; b: number }[] = []
            let cur = 0
            for (const o of [...w.openings].sort((a, b) => a.from - b.from)) {
              if (o.from > cur) segs.push({ a: cur, b: o.from })
              cur = Math.max(cur, o.to)
            }
            if (cur < len) segs.push({ a: cur, b: len })
            const selHere = sel?.kind === 'wall' && sel.index === i
            return (
              <g key={`w${i}`}>
                {segs.map((s, j) => (
                  <line key={j}
                    x1={w.x1 + ux * s.a} y1={w.y1 + uy * s.a}
                    x2={w.x1 + ux * s.b} y2={w.y1 + uy * s.b}
                    stroke={selHere ? '#3b82f6' : MATERIAL_COLORS[w.material]}
                    strokeWidth={selHere ? 0.16 : 0.12} strokeLinecap="butt" />
                ))}
                {w.openings.map((o, j) => (
                  <line key={`o${j}`}
                    x1={w.x1 + ux * o.from} y1={w.y1 + uy * o.from}
                    x2={w.x1 + ux * o.to} y2={w.y1 + uy * o.to}
                    stroke="#3d4351" strokeWidth={0.06} strokeDasharray="0.15 0.1" />
                ))}
              </g>
            )
          })}
          {dragRect && (
            <rect
              x={Math.min(dragRect.x0, dragRect.x1)} y={Math.min(dragRect.y0, dragRect.y1)}
              width={Math.abs(dragRect.x1 - dragRect.x0)} height={Math.abs(dragRect.y1 - dragRect.y0)}
              fill="rgba(59,130,246,0.15)" stroke="#3b82f6" strokeWidth={0.05} strokeDasharray="0.2 0.1" />
          )}
          {scenario.nodes.map((n) => (
            <g key={n.id} style={{ cursor: 'pointer' }}>
              <circle cx={n.pos.x} cy={n.pos.y} r={n.kind === 'ap' ? 0.35 : 0.28}
                fill={n.kind === 'ap' ? '#3b82f6' : '#22c55e'}
                stroke={sel?.kind === 'node' && sel.id === n.id ? '#fff' : 'none'} strokeWidth={0.06} />
              <text x={n.pos.x + 0.4} y={n.pos.y + 0.12} fontSize={0.36} fill="#d5dae3">
                {n.name} <tspan fill="#8a93a3" fontSize={0.28}>{genShort(n.caps.generation)}</tspan>
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* side panel */}
      <div style={{ borderLeft: '1px solid var(--border)', background: 'var(--panel)', display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: 0 }}>
        <div style={{ display: 'flex', gap: 4, padding: 6, borderBottom: '1px solid var(--border)' }}>
          {(['props', 'objects', 'guide'] as Tab[]).map((tb) => (
            <button key={tb} className={tab === tb ? 'active' : ''} onClick={() => setTab(tb)}>
              {{ props: '⚙ Props', objects: '🗂 Objects', guide: '📖 Guide' }[tb]}
            </button>
          ))}
        </div>

        <div style={{ overflowY: 'auto', minHeight: 0 }}>
          {tab === 'guide' && <Guide />}

          {tab === 'objects' && (
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
              <div>
                <div style={{ color: 'var(--dim)', marginBottom: 4 }}>Nodes (order = timeline lanes)</div>
                {scenario.nodes.map((n, i) => (
                  <div key={n.id}
                    onClick={() => selectAndShow({ kind: 'node', id: n.id })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px', cursor: 'pointer',
                      background: sel?.kind === 'node' && sel.id === n.id ? '#2a3550' : undefined, borderRadius: 3,
                    }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: n.kind === 'ap' ? '#3b82f6' : '#22c55e' }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.name} <span style={{ color: 'var(--dim)' }}>{genShort(n.caps.generation)}</span>
                    </span>
                    <button style={{ padding: '0 4px' }} disabled={i === 0} onClick={(e) => { e.stopPropagation(); moveNode(n.id, -1) }}>▲</button>
                    <button style={{ padding: '0 4px' }} disabled={i === scenario.nodes.length - 1} onClick={(e) => { e.stopPropagation(); moveNode(n.id, 1) }}>▼</button>
                    <button style={{ padding: '0 4px' }} disabled={n.kind === 'ap'} title={n.kind === 'ap' ? 'the AP cannot be deleted' : 'delete'}
                      onClick={(e) => { e.stopPropagation(); deleteNode(n.id) }}>🗑</button>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ color: 'var(--dim)', marginBottom: 4 }}>Rooms</div>
                {scenario.rooms.map((r, i) => (
                  <div key={i}
                    onClick={() => selectAndShow({ kind: 'room', index: i })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px', cursor: 'pointer',
                      background: sel?.kind === 'room' && sel.index === i ? '#2a3550' : undefined, borderRadius: 3,
                    }}>
                    <span style={{ flex: 1 }}>{r.name} <span style={{ color: 'var(--dim)' }}>{r.w}×{r.h} m</span></span>
                    <button style={{ padding: '0 4px' }} onClick={(e) => { e.stopPropagation(); deleteRoom(i) }}>🗑</button>
                  </div>
                ))}
                {!scenario.rooms.length && <div style={{ color: 'var(--dim)' }}>none — draw one with ▭</div>}
              </div>
              <div>
                <div style={{ color: 'var(--dim)', marginBottom: 4 }}>Walls</div>
                {scenario.walls.map((w, i) => (
                  <div key={i}
                    onClick={() => selectAndShow({ kind: 'wall', index: i })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '1px 4px', cursor: 'pointer',
                      background: sel?.kind === 'wall' && sel.index === i ? '#2a3550' : undefined, borderRadius: 3,
                    }}>
                    <span style={{ width: 8, height: 8, background: MATERIAL_COLORS[w.material], borderRadius: 2 }} />
                    <span style={{ flex: 1, color: '#aeb6c2' }}>
                      ({w.x1},{w.y1})→({w.x2},{w.y2}) {w.material}{w.openings.length ? ` · ${w.openings.length} opening(s)` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'props' && (
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ color: 'var(--dim)', marginBottom: 4 }}>Scenario</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <button onClick={() => { localStorage.setItem(LS_KEY, scenarioToJson(scenario)); setIoMsg('saved') }}>💾 Save</button>
                  <button onClick={() => {
                    const s = localStorage.getItem(LS_KEY)
                    if (!s) return setIoMsg('nothing saved')
                    try { commit(scenarioFromJson(s)); setIoMsg('loaded') } catch (err) { setIoMsg(String(err)) }
                  }}>📂 Load</button>
                  <button onClick={() => {
                    const blob = new Blob([scenarioToJson(scenario)], { type: 'application/json' })
                    const a = document.createElement('a')
                    a.href = URL.createObjectURL(blob)
                    a.download = 'wifi-scenario.json'
                    a.click()
                  }}>⬇ Export</button>
                  <button onClick={() => fileRef.current?.click()}>⬆ Import</button>
                  <input ref={fileRef} type="file" accept=".json" hidden onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    try { commit(scenarioFromJson(await f.text())); setIoMsg('imported') } catch (err) { setIoMsg(`invalid: ${err instanceof Error ? err.message : err}`) }
                    e.target.value = ''
                  }} />
                </div>
                {ioMsg && <div style={{ color: 'var(--dim)', fontSize: 11, marginTop: 4 }}>{ioMsg}</div>}
              </div>

              <div>
                <div style={{ color: 'var(--dim)', marginBottom: 4 }}>Stations</div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input type="number" min={1} max={20} value={spawnN} style={{ width: 48 }}
                    onChange={(e) => setSpawnN(Number(e.target.value))} />
                  <button onClick={() => {
                    const rng = new Rng((Math.random() * 2 ** 31) >>> 0)
                    commit(spawnRandomStas(scenario, spawnN, () => rng.next()))
                  }}>🎲 Spawn random STAs</button>
                </div>
              </div>

              <div>
                <div style={{ color: 'var(--dim)', marginBottom: 4 }}>Simulation</div>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }} title="dot11RTSThreshold: frames larger than this use RTS/CTS protection">
                  RTS threshold
                  <input type="number" step={100} value={scenario.rtsThresholdBytes} style={{ width: 70 }}
                    onChange={(e) => commit({ ...scenario, rtsThresholdBytes: Number(e.target.value) })} /> B
                </label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }} title="random seed — identical seed reproduces the exact same run">
                  Seed
                  <input type="number" value={scenario.seed} style={{ width: 90 }}
                    onChange={(e) => commit({ ...scenario, seed: Number(e.target.value) })} />
                </label>
              </div>

              {selNode && (
                <div>
                  <div style={{ color: 'var(--dim)', marginBottom: 4 }}>Node: {selNode.name}</div>
                  <label style={{ display: 'block', marginBottom: 4 }}>
                    Name <input value={selNode.name} onChange={(e) => updateNode(selNode.id, { name: e.target.value })} style={{ width: 130 }} />
                  </label>
                  <label style={{ display: 'block', marginBottom: 4 }}>
                    Wi-Fi{' '}
                    <select value={selNode.caps.generation} onChange={(e) => setGeneration(selNode, e.target.value as Generation)}>
                      {(Object.keys(GEN_LABEL) as Generation[]).map((g) => (
                        <option key={g} value={g}>{GEN_LABEL[g]}</option>
                      ))}
                    </select>
                  </label>
                  {GEN_FEATURES[selNode.caps.generation].length > 0 && (
                    <div style={{ margin: '4px 0 6px', paddingLeft: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {GEN_FEATURES[selNode.caps.generation].map((f) => (
                        <label key={f} style={{ fontSize: 11.5, display: 'flex', gap: 5, alignItems: 'center' }} title={FEATURE_LABEL[f]}>
                          <input type="checkbox" checked={selNode.caps.features[f] === true}
                            onChange={(e) => updateNode(selNode.id, {
                              caps: { ...selNode.caps, features: { ...selNode.caps.features, [f]: e.target.checked } },
                            })} />
                          {FEATURE_LABEL[f]}
                        </label>
                      ))}
                    </div>
                  )}
                  {(selNode.caps.generation === 'he' || selNode.caps.generation === 'eht') && selNode.caps.features.mlo !== true && (
                    <label style={{ display: 'block', marginBottom: 4 }} title="operating band for non-MLO Wi-Fi 6/7 devices">
                      Link{' '}
                      <select value={selNode.linkId ?? '5g'} onChange={(e) => updateNode(selNode.id, { linkId: e.target.value as '5g' | '6g' })}>
                        <option value="5g">5 GHz</option>
                        <option value="6g">6 GHz</option>
                      </select>
                    </label>
                  )}
                  {selNode.kind === 'sta' && (
                    <label style={{ display: 'block', marginBottom: 4 }}>
                      Traffic{' '}
                      <select value={selNode.profile} onChange={(e) => updateNode(selNode.id, { profile: e.target.value as ProfileId })}>
                        {PROFILES.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </label>
                  )}
                  <label style={{ display: 'block', marginBottom: 4 }}>
                    Tx power{' '}
                    <input type="number" value={selNode.txPowerDbm} style={{ width: 56 }}
                      onChange={(e) => updateNode(selNode.id, { txPowerDbm: Number(e.target.value) })} /> dBm
                  </label>
                  <label style={{ display: 'block', marginBottom: 4 }}>
                    Height{' '}
                    <input type="number" step={0.1} value={selNode.pos.z} style={{ width: 56 }}
                      onChange={(e) => updateNode(selNode.id, { pos: { ...selNode.pos, z: Number(e.target.value) } })} /> m
                  </label>
                  {selNode.kind === 'sta' && <button onClick={() => deleteNode(selNode.id)}>🗑 Delete node</button>}
                </div>
              )}

              {selWall && sel?.kind === 'wall' && (
                <div>
                  <div style={{ color: 'var(--dim)', marginBottom: 4 }}>Wall</div>
                  <label title="RF attenuation: drywall 5 dB · brick 12 dB · glass 3 dB per crossing">
                    Material{' '}
                    <select value={selWall.material} onChange={(e) => {
                      const walls = [...scenario.walls]
                      walls[sel.index] = { ...walls[sel.index], material: e.target.value as Material }
                      commit({ ...scenario, walls })
                    }}>
                      {(['drywall', 'brick', 'glass'] as Material[]).map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </label>
                  {selWall.openings.length > 0 && (
                    <button style={{ marginTop: 6, display: 'block' }} onClick={() => {
                      const walls = [...scenario.walls]
                      walls[sel.index] = { ...walls[sel.index], openings: [] }
                      commit({ ...scenario, walls })
                    }}>Remove openings</button>
                  )}
                </div>
              )}

              {sel?.kind === 'room' && (
                <div>
                  <div style={{ color: 'var(--dim)', marginBottom: 4 }}>Room: {scenario.rooms[sel.index]?.name}</div>
                  <label style={{ display: 'block', marginBottom: 4 }}>
                    Name <input value={scenario.rooms[sel.index]?.name ?? ''} onChange={(e) => {
                      const rooms = [...scenario.rooms]
                      rooms[sel.index] = { ...rooms[sel.index], name: e.target.value }
                      commit({ ...scenario, rooms })
                    }} style={{ width: 130 }} />
                  </label>
                  <button onClick={() => deleteRoom(sel.index)}>🗑 Delete room</button>
                </div>
              )}

              {!sel && (
                <div style={{ color: 'var(--dim)', fontSize: 11 }}>
                  Draw rooms with ▭, punch doors/windows into walls, drop STAs, set each node's Wi-Fi
                  generation and features, then hit ▶ Simulate. Select anything to edit it here.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function genShort(g: Generation): string {
  return { nonht: '11a', vht: 'WF5', he: 'WF6', eht: 'WF7' }[g]
}
