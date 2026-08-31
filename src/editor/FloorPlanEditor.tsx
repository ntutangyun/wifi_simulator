import { useRef, useState } from 'react'
import { Rng } from '../engine/rng'
import type { Material, NodeCfg, ProfileId, Scenario } from '../model/scenario'
import { nonht } from '../model/scenario'
import { useUi } from '../ui/store'
import {
  addOpening, alongWall, hitTestNode, hitTestWall, roomsToWalls,
  scenarioFromJson, scenarioToJson, snap, spawnRandomStas,
} from './planOps'

type Tool = 'select' | 'room' | 'door' | 'window' | 'sta'

const WORLD_W = 20
const WORLD_H = 14
const LS_KEY = 'wifi-sim.scenario'

const MATERIAL_COLORS: Record<Material, string> = { drywall: '#c8c2b6', brick: '#a05b48', glass: '#7fb8e0' }

export function FloorPlanEditor() {
  const { scenario, setScenario } = useUi()
  const [tool, setTool] = useState<Tool>('select')
  const [sel, setSel] = useState<{ kind: 'node'; id: string } | { kind: 'wall'; index: number } | { kind: 'room'; index: number } | null>(null)
  const [dragRect, setDragRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [dragNode, setDragNode] = useState<string | null>(null)
  const [spawnN, setSpawnN] = useState(3)
  const [ioMsg, setIoMsg] = useState('')
  const svgRef = useRef<SVGSVGElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const toWorld = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!
    const r = svg.getBoundingClientRect()
    const scale = Math.min(r.width / (WORLD_W + 2), r.height / (WORLD_H + 2))
    const ox = (r.width - scale * (WORLD_W + 2)) / 2
    const oy = (r.height - scale * (WORLD_H + 2)) / 2
    return { x: (e.clientX - r.left - ox) / scale - 1, y: (e.clientY - r.top - oy) / scale - 1 }
  }

  const commit = (sc: Scenario) => setScenario(sc)

  const onPointerDown = (e: React.PointerEvent) => {
    const p = toWorld(e)
    if (tool === 'room') {
      setDragRect({ x0: snap(p.x), y0: snap(p.y), x1: snap(p.x), y1: snap(p.y) })
    } else if (tool === 'select') {
      const nid = hitTestNode(scenario.nodes, p, 0.4)
      if (nid) {
        setSel({ kind: 'node', id: nid })
        setDragNode(nid)
        return
      }
      const wi = hitTestWall(scenario.walls, p, 0.25)
      if (wi !== null) {
        setSel({ kind: 'wall', index: wi })
        return
      }
      const ri = scenario.rooms.findIndex((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)
      setSel(ri >= 0 ? { kind: 'room', index: ri } : null)
    } else if (tool === 'door' || tool === 'window') {
      const wi = hitTestWall(scenario.walls, p, 0.3)
      if (wi !== null) {
        const walls = [...scenario.walls]
        walls[wi] = addOpening(walls[wi], alongWall(walls[wi], p), tool === 'door' ? 0.9 : 1.2)
        commit({ ...scenario, walls })
      }
    } else if (tool === 'sta') {
      const n = scenario.nodes.length
      let id = `sta-${n}`
      const used = new Set(scenario.nodes.map((x) => x.id))
      let k = n
      while (used.has(id)) id = `sta-${++k}`
      const node: NodeCfg = {
        id, kind: 'sta', name: id.toUpperCase(), pos: { x: snap(p.x), y: snap(p.y), z: 1.0 },
        txPowerDbm: 15, profile: 'browsing', caps: nonht,
      }
      commit({ ...scenario, nodes: [...scenario.nodes, node] })
      setTool('select')
      setSel({ kind: 'node', id })
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
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

  const deleteSelection = () => {
    if (!sel) return
    if (sel.kind === 'node') {
      const n = scenario.nodes.find((x) => x.id === sel.id)
      if (!n || n.kind === 'ap') return
      commit({ ...scenario, nodes: scenario.nodes.filter((x) => x.id !== sel.id) })
    } else if (sel.kind === 'room') {
      const rooms = scenario.rooms.filter((_, i) => i !== sel.index)
      commit({ ...scenario, rooms, walls: roomsToWalls(rooms, scenario.walls) })
    }
    setSel(null)
  }

  const updateNode = (id: string, patch: Partial<NodeCfg>) => {
    commit({ ...scenario, nodes: scenario.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) })
  }

  const selNode = sel?.kind === 'node' ? scenario.nodes.find((n) => n.id === sel.id) : undefined
  const selWall = sel?.kind === 'wall' ? scenario.walls[sel.index] : undefined

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', height: '100%' }}>
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 2, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(['select', 'room', 'door', 'window', 'sta'] as Tool[]).map((t) => (
            <button key={t} className={tool === t ? 'active' : ''} onClick={() => setTool(t)}>
              {{ select: '☝ select', room: '▭ room', door: '🚪 door', window: '🪟 window', sta: '📱 STA' }[t]}
            </button>
          ))}
        </div>
        <svg
          ref={svgRef}
          viewBox={`-1 -1 ${WORLD_W + 2} ${WORLD_H + 2}`}
          style={{ width: '100%', height: '100%', display: 'block', background: '#14161c', touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* grid */}
          {Array.from({ length: WORLD_W + 1 }, (_, i) => (
            <line key={`v${i}`} x1={i} y1={0} x2={i} y2={WORLD_H} stroke="#22262f" strokeWidth={0.02} />
          ))}
          {Array.from({ length: WORLD_H + 1 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={i} x2={WORLD_W} y2={i} stroke="#22262f" strokeWidth={0.02} />
          ))}
          {/* rooms */}
          {scenario.rooms.map((r, i) => (
            <g key={i}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h}
                fill={sel?.kind === 'room' && sel.index === i ? '#2a3550' : '#1c212c'} stroke="none" />
              <text x={r.x + 0.2} y={r.y + 0.55} fontSize={0.42} fill="#8a93a3">{r.name}</text>
            </g>
          ))}
          {/* walls with openings as gaps */}
          {scenario.walls.map((w, i) => {
            const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1)
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
          {/* drag preview */}
          {dragRect && (
            <rect
              x={Math.min(dragRect.x0, dragRect.x1)} y={Math.min(dragRect.y0, dragRect.y1)}
              width={Math.abs(dragRect.x1 - dragRect.x0)} height={Math.abs(dragRect.y1 - dragRect.y0)}
              fill="rgba(59,130,246,0.15)" stroke="#3b82f6" strokeWidth={0.05} strokeDasharray="0.2 0.1" />
          )}
          {/* nodes */}
          {scenario.nodes.map((n) => (
            <g key={n.id} style={{ cursor: 'pointer' }}>
              <circle cx={n.pos.x} cy={n.pos.y} r={n.kind === 'ap' ? 0.35 : 0.28}
                fill={n.kind === 'ap' ? '#3b82f6' : '#22c55e'}
                stroke={sel?.kind === 'node' && sel.id === n.id ? '#fff' : 'none'} strokeWidth={0.06} />
              <text x={n.pos.x + 0.4} y={n.pos.y + 0.12} fontSize={0.36} fill="#d5dae3">{n.name}</text>
            </g>
          ))}
        </svg>
      </div>

      {/* side panel */}
      <div style={{ borderLeft: '1px solid var(--border)', background: 'var(--panel)', padding: 10, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ color: 'var(--dim)', marginBottom: 4 }}>Scenario</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button onClick={() => { localStorage.setItem(LS_KEY, scenarioToJson(scenario)); setIoMsg('saved') }}>💾 Save</button>
            <button onClick={() => {
              const s = localStorage.getItem(LS_KEY)
              if (!s) return setIoMsg('nothing saved')
              try { commit(scenarioFromJson(s)); setIoMsg('loaded') } catch (e) { setIoMsg(String(e)) }
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
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            RTS threshold
            <input type="number" step={100} value={scenario.rtsThresholdBytes} style={{ width: 70 }}
              onChange={(e) => commit({ ...scenario, rtsThresholdBytes: Number(e.target.value) })} /> B
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
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
            {selNode.kind === 'sta' && (
              <label style={{ display: 'block', marginBottom: 4 }}>
                Traffic{' '}
                <select value={selNode.profile} onChange={(e) => updateNode(selNode.id, { profile: e.target.value as ProfileId })}>
                  {(['video', 'backup', 'browsing', 'iot', 'saturated', 'idle'] as ProfileId[]).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
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
            {selNode.kind === 'sta' && <button onClick={deleteSelection}>🗑 Delete node</button>}
          </div>
        )}

        {selWall && sel?.kind === 'wall' && (
          <div>
            <div style={{ color: 'var(--dim)', marginBottom: 4 }}>Wall</div>
            <label>
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
              <button style={{ marginTop: 6 }} onClick={() => {
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
            <button onClick={deleteSelection}>🗑 Delete room</button>
          </div>
        )}

        <div style={{ color: 'var(--dim)', fontSize: 11, marginTop: 'auto' }}>
          Draw rooms with ▭, punch doors/windows into walls, drop STAs, then hit ▶ Simulate.
        </div>
      </div>
    </div>
  )
}
