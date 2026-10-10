import { useEffect, useMemo, useRef, useState } from 'react'
import { FADING_DEFAULTS, RICIAN_K_DEFAULT_DB, type FadingCfg } from '../engine/fading'
import { Rng } from '../engine/rng'
import { GEN_FEATURES, GEN_RANK, physicalId, type LinkId } from '../model/caps'
import { DEFAULT_AMP_AP, DEFAULT_AMP_BS, DEFAULT_SIX_GHZ_CENTER_MHZ, ampApRefusals, driverRefusalsFor, normalizeProfiles, PROFILE_IDS, SERVER_KINDS, sixGhzChannelNo, TAMPER_KINDS, TAMPER_PRESETS, TXOP_PROTECTIONS, serverFor, serverKindFor, tamperKindOf, type AmpApCfg, type AmpBackscatterCfg, type AmpTagMode, type GuardIntervalCfg, type Material, type NodeCfg, type ProfileId, type Scenario, type SelectivityCfg, type ServerCfg, type ServerKind, type TamperKind, type TxopProtection, type UwbSessionCfg } from '../model/scenario'
import { HOUSEHOLDS } from '../model/households'
import { nonht } from '../model/scenario'
import { BRANDS, STATION_PRESETS, applyPreset } from '../model/presets'
import type { Generation } from '../model/types'
import type { ScattererCfg } from '../engine/scatter'
import { useStrings } from '../ui/i18n'
import { parseEpc } from '../ui/inputs'
import { layoutFor, ONE_COLUMN } from '../ui/layout'
import { useUi } from '../ui/store'
import { useViewport } from '../ui/useViewport'
import { EditorGuide } from './EditorGuide'
import { canRedo, canUndo } from './history'
import { UwbNodeFields } from '../uwb/ui/UwbNodeFields'
import { UwbSessionFields } from '../uwb/ui/UwbSessionFields'
import {
  addOpening, alongWall, ampApDiscarded, ampTagIssue, canDeleteNode, clampField, clampSixGhzCenterMhz,
  fadingFieldsLive,
  fadingSmallScalePatch, fadingToggle, generationPatch, guardIntervalSwitch, guardIntervalTiers,
  guardIntervalToggle, hasAp,
  hitTestNode, hitTestScatterer, hitTestWall, moveScatterer, newAnchor, newAp, newScatterer, newTag,
  newUwbTag, parseCoherenceMs, parseRicianKdB, parseScattererNumber,
  parseShadowSigmaDb, removeNode, removeScatterer, roomsToWalls, scenarioFromJson, scenarioLoadIssues, updateScatterer, withFading,
  scenarioToJson, selectivitySwitch, selectivityToggle, sixGhzNbOverlaps, sixGhzOverlapPct, snap,
  spawnRandomStas, uwbSessionIssue, withGuardInterval, withSelectivity,
} from './planOps'

type Tool = 'select' | 'room' | 'door' | 'window' | 'ap' | 'sta' | 'tag' | 'anchor' | 'uwbTag' | 'scatterer'
const TOOLS: Tool[] = ['select', 'room', 'door', 'window', 'ap', 'sta', 'tag', 'anchor', 'uwbTag', 'scatterer']
/** Tools that place a Wi-Fi device, which the schema only accepts beside an AP. */
const WIFI_TOOLS: Tool[] = ['sta', 'tag']

type Sel =
  | { kind: 'node'; id: string }
  | { kind: 'wall'; index: number }
  | { kind: 'room'; index: number }
  | { kind: 'server'; id: string }
  | { kind: 'scatterer'; id: string }
  | null

const LS_KEY = 'wifi-sim.scenario'
const MATERIAL_COLORS: Record<Material, string> = { drywall: '#c8c2b6', brick: '#a05b48', glass: '#7fb8e0' }
/** A reflecting object's colour on the canvas and in the object list. Grey, and drawn as a
 * diamond rather than a circle or a square, because it is the one thing on the plan that is not
 * a radio: it never transmits, never receives and appears in no link table. */
const SCATTERER_COLOR = '#94a3b8'
/** ASCII hyphen-minus to the Unicode minus, for a negative dB dropped straight into a label —
 * the same helper `src/ui/Guide.tsx` keeps, for the same reason. */
const dbFmt = (v: number): string => String(v).replace('-', '−')
/** Streams a station can run; any combination may be ticked (none = idle). */
const STREAMS: ProfileId[] = PROFILE_IDS.filter((p) => p !== 'idle')
/** The small-scale distributions, in the order the select lists them (`FadingSchema`'s enum). */
const SMALL_SCALES: FadingCfg['smallScale'][] = ['none', 'rayleigh', 'rician']

interface ViewT {
  cx: number
  cy: number
  scale: number // px per meter
}

/**
 * Which of the editor's three columns is on screen where there is only room for
 * one. The desktop editor is `1fr 280px 300px`: the plan, the objects and
 * properties, and the editor's own notes. On a 470 px screen those two fixed
 * columns are 580 px between them, so the grid overflowed `main`'s
 * `overflow: hidden` — measured there, the plan column resolved to **0 px wide
 * and drew no SVG at all**, the notes column lost its right 110 px, and nothing
 * could scroll to reach either. One at a time is the same answer the shell
 * already gives the lesson and the 3-D view at this width.
 */
type EditorPane = 'plan' | 'objects' | 'guide'
const EDITOR_PANES: EditorPane[] = ['plan', 'objects', 'guide']

function fitView(sc: Scenario, wPx: number, hPx: number): ViewT {
  const xs = sc.rooms.length ? sc.rooms : [{ x: 0, y: 0, w: 10, h: 8 }]
  const minX = Math.min(...xs.map((r) => r.x)) - 1
  const maxX = Math.max(...xs.map((r) => r.x + r.w)) + 1
  const minY = Math.min(...xs.map((r) => r.y)) - 1
  const maxY = Math.max(...xs.map((r) => r.y + r.h)) + 1
  const scale = Math.min(wPx / (maxX - minX), hPx / (maxY - minY))
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, scale: Math.max(10, Math.min(200, scale)) }
}

const menuDivider: React.CSSProperties = { width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }
/** How this panel shows a rule the plan breaks — the schema's own complaint, in red, the same
 * style `uwb/ui/UwbSessionFields.tsx`'s `issueStyle` uses for the UWB session's own issue line. */
const issueStyle: React.CSSProperties = { color: '#f87171', fontSize: 11, marginTop: 3, lineHeight: 1.45 }

export function FloorPlanEditor() {
  const { scenario, setScenario, selectedNodeId, select } = useUi()
  const history = useUi((s) => s.history)
  const undo = useUi((s) => s.undo)
  const redo = useUi((s) => s.redo)
  const L = useStrings()
  const E = L.editor
  const [tool, setTool] = useState<Tool>('select')
  const [sel, setSel] = useState<Sel>(null)
  const [dragRect, setDragRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [dragNode, setDragNode] = useState<string | null>(null)
  /** The reflecting object being dragged, if any. Kept apart from `dragNode` because the two
   * live in different lists and a scatterer is not a node — the same id could name both. */
  const [dragScatterer, setDragScatterer] = useState<string | null>(null)
  const [spawnN, setSpawnN] = useState(3)
  /** The last load/save/import outcome: `ok` decides the colour, `lines` are the reasons.
   *  A boolean rather than sniffing the text — a refusal and a confirmation are different
   *  events, and telling them apart by the shape of the string is the kind of guess that
   *  breaks the first time somebody writes a short refusal. */
  const [ioMsg, setIoMsg] = useState<{ ok: boolean; lines: string[] }>({ ok: true, lines: [] })
  const [view, setView] = useState<ViewT | null>(null)
  const panRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  /** Bumped per node drag: its number keys every commit of that drag into one undo step. */
  const dragSeq = useRef(0)
  /**
   * Which column is on screen when only one fits, and whether that is the case.
   * The breakpoint is the shell's own `singleColumn` and not a new one: it is the
   * same decision about the same device, and `layout.ts` says at length why a
   * second constant near an existing one becomes two names for one thing.
   */
  const vp = useViewport()
  const onePane = layoutFor(vp.w, vp.h, vp.coarsePointer).singleColumn
  const [pane, setPane] = useState<EditorPane>('plan')

  /**
   * The plan canvas's own size, as state.
   *
   * It used to be read live out of `getBoundingClientRect()` during render,
   * which cannot survive either of the two things this slice introduced: a
   * hidden tab measures 0 x 0, and the first render that shows it again still
   * reads the old, hidden geometry because the rect is read before the DOM is
   * updated. It also never answered the fold at all — the viewBox kept the
   * aspect ratio of the screen the page was opened on.
   *
   * A zero measurement is dropped rather than stored, so switching away from the
   * plan tab and back does not repaint one frame of a degenerate 1 x 1 viewBox.
   */
  const [hostPx, setHostPx] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  useEffect(() => {
    const el = hostRef.current
    if (el === null || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return
      setHostPx((p) => (p.w === r.width && p.h === r.height ? p : { w: r.width, h: r.height }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    // `hostPx` rather than the live rect: at 470 px the plan column was 0 px
    // wide, this never cleared its own guard, and the editor showed no floor
    // plan whatsoever. The size now arrives as a change, so the fit happens
    // whenever the column first really has one.
    if (!view && hostPx.w > 50) setView(fitView(scenario, hostPx.w, hostPx.h))
  }, [view, scenario, hostPx])

  const resetView = () => {
    setView(fitView(scenario, hostPx.w, hostPx.h))
  }

  const commit = (sc: Scenario, key?: string | null) => setScenario(sc, key)

  const undoHere = () => { undo(); setSel(null) }
  const redoHere = () => { redo(); setSel(null) }

  // Shortcuts are window-wide because the plan canvas is not focusable; the
  // editor is only mounted in edit mode, so they cannot fire over the player.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const el = document.activeElement as HTMLElement | null
      const tag = el?.tagName.toLowerCase()
      // inside a text field the browser's own undo stack is the right one
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) undoHere()
      else if ((k === 'z' && e.shiftKey) || k === 'y') redoHere()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // ------- canvas interactions -------
  // `rect()` stays live, because a pointer event needs this frame's `left`/`top`
  // to turn a screen coordinate into a plan one. The viewBox's extent does not:
  // see `hostPx`.
  const rect = () => hostRef.current!.getBoundingClientRect()
  const vw = () => (view && hostPx.w > 0 ? hostPx.w / view.scale : 1)
  const vh = () => (view && hostPx.h > 0 ? hostPx.h / view.scale : 1)
  const px = (n: number) => (view ? n / view.scale : n)

  const toWorld = (e: { clientX: number; clientY: number }) => {
    const r = rect()
    return {
      x: view!.cx - vw() / 2 + (e.clientX - r.left) / view!.scale,
      y: view!.cy - vh() / 2 + (e.clientY - r.top) / view!.scale,
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!view) return
    if (e.button === 1 || e.button === 2) {
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
        setSel({ kind: 'node', id: nid })
        setDragNode(nid)
        dragSeq.current++
        return
      }
      // after the nodes: a device under the cursor wins over a piece of furniture under it
      const sid = hitTestScatterer(scenario.scatterers, p, px(14))
      if (sid) {
        setSel({ kind: 'scatterer', id: sid })
        setDragScatterer(sid)
        dragSeq.current++
        return
      }
      const wi = hitTestWall(scenario.walls, p, px(8))
      if (wi !== null) {
        setSel({ kind: 'wall', index: wi })
        return
      }
      const ri = scenario.rooms.findIndex((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)
      setSel(ri >= 0 ? { kind: 'room', index: ri } : null)
    } else if (tool === 'door' || tool === 'window') {
      const wi = hitTestWall(scenario.walls, p, px(10))
      if (wi !== null) {
        const walls = [...scenario.walls]
        walls[wi] = addOpening(walls[wi], alongWall(walls[wi], p), tool === 'door' ? 0.9 : 1.2)
        commit({ ...scenario, walls })
      }
    } else if (tool === 'ap') {
      if (hasAp(scenario)) return
      const { sc, id } = newAp(scenario, p)
      commit(sc)
      setTool('select')
      setSel({ kind: 'node', id })
    } else if (tool === 'sta') {
      if (!hasAp(scenario)) return
      const used = new Set(scenario.nodes.map((x) => x.id))
      let k = scenario.nodes.length
      let id = `sta-${k}`
      while (used.has(id)) id = `sta-${++k}`
      const node: NodeCfg = {
        id, kind: 'sta', name: id.toUpperCase(), pos: { x: snap(p.x), y: snap(p.y), z: 1.0 },
        txPowerDbm: 15, profiles: ['browsing'], caps: { ...nonht },
      }
      commit({ ...scenario, nodes: [...scenario.nodes, node] })
      setTool('select')
      setSel({ kind: 'node', id })
    } else if (tool === 'tag' || tool === 'anchor' || tool === 'uwbTag') {
      if (tool === 'tag' && !hasAp(scenario)) return
      const make = tool === 'tag' ? newTag : tool === 'anchor' ? newAnchor : newUwbTag
      const { sc, id } = make(scenario, p)
      commit(sc)
      setTool('select')
      setSel({ kind: 'node', id })
    } else if (tool === 'scatterer') {
      // No AP gate and no UWB gate: an object in the room is a fact about the room, and a plan
      // may legitimately be drawn before the devices that will hear its echoes are placed. The
      // section's own note says so when the plan has no ranging device yet.
      const { sc, id } = newScatterer(scenario, p)
      commit(sc)
      setTool('select')
      setSel({ kind: 'scatterer', id })
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!view) return
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
      commit({ ...scenario, nodes }, `drag:${dragSeq.current}`)
    } else if (dragScatterer) {
      // Same undo key as a node drag: one drag is one step in the history.
      commit(moveScatterer(scenario, dragScatterer, p), `drag:${dragSeq.current}`)
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
    setDragScatterer(null)
  }

  const onWheel = (e: React.WheelEvent) => {
    if (!view) return
    const f = e.deltaY > 0 ? 1 / 1.15 : 1.15
    const p = toWorld(e)
    const scale = Math.max(8, Math.min(300, view.scale * f))
    const r = rect()
    const mx = (e.clientX - r.left) / scale
    const my = (e.clientY - r.top) / scale
    setView({ scale, cx: p.x - mx + r.width / scale / 2, cy: p.y - my + r.height / scale / 2 })
  }

  // ------- model ops -------
  const deleteRoom = (index: number) => {
    const rooms = scenario.rooms.filter((_, i) => i !== index)
    commit({ ...scenario, rooms, walls: roomsToWalls(rooms, scenario.walls) })
    setSel(null)
  }

  const deleteNode = (id: string) => {
    if (!canDeleteNode(scenario, id)) return
    commit(removeNode(scenario, id))
    setSel(null)
    // the inspector's selection is kept in the store and would otherwise go on
    // naming a node that no longer exists — reachable for the AP since it may go
    if (selectedNodeId && physicalId(selectedNodeId) === id) select(null)
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

  /**
   * The generation dropdown's commit, plus the one thing it must not do quietly.
   *
   * `generationPatch` drops whatever the new generation cannot carry, and for a polling access
   * point that is the whole `ampAp` section the reader configured by hand. Before 2026-10-10 it
   * went with nothing said: the panel simply replaced the block with `ampApRefusals`' grey
   * paragraph about why a UHR access point may not poll, which reads as an explanation rather
   * than a receipt. `ampApDiscarded` (planOps.ts) answers whether this particular change threw a
   * configured section away — by asking the patch, so it cannot disagree with it — and
   * `E.ampDropped` is the only copy of what the row then says.
   *
   * The row, not a dialog: it is the channel a failed load or import already prints into, it is
   * the one thing in this editor measured to lay out at 470 px, and a modal on a phone over a
   * dropdown change would be worse than the silence it replaces. The line takes the refusal
   * colour (`ok: false`) because the reader lost something, not because the edit failed — the
   * edit is legitimate and goes through either way.
   *
   * One property inherited from the row and not introduced here: it is sticky, so the line stays
   * until the next message replaces it, exactly as 「已保存」 does. Measured at 470 px — switch a
   * polling access point to Wi-Fi 6, then switch it again to Wi-Fi 5, and the first line is still
   * on screen although the second change dropped nothing. Giving this one line a dismissal the
   * other messages do not have would be a second behaviour for one row.
   */
  const setGeneration = (n: NodeCfg, gen: Generation) => {
    if (ampApDiscarded(n, gen)) setIoMsg({ ok: false, lines: [E.ampDropped] })
    updateNode(n.id, generationPatch(n, gen))
  }

  const uwbNodes = scenario.nodes.filter((n) => n.kind === 'uwb')
  const updateUwbSession = (patch: Partial<UwbSessionCfg>) => {
    if (scenario.uwb) commit({ ...scenario, uwb: { ...scenario.uwb, ...patch } })
  }
  // a full schema parse, so it may not run on every pointer-move frame of a drag
  const sessionIssue = useMemo(() => uwbSessionIssue(scenario), [scenario])
  const apPresent = hasAp(scenario)
  const sixGhzCenterMhz = scenario.sixGhzCenterMhz ?? DEFAULT_SIX_GHZ_CENTER_MHZ
  const sixGhzOverlapPctVal = sixGhzOverlapPct(scenario, sixGhzCenterMhz)
  const sixGhzNbOverlapVal = sixGhzNbOverlaps(scenario, sixGhzCenterMhz)
  const toolDisabled = (t: Tool): string | null =>
    t === 'ap' && apPresent ? E.apExists : WIFI_TOOLS.includes(t) && !apPresent ? E.needApFirst : null

  // placing the AP (or deleting it) can disable the tool that is currently held
  useEffect(() => {
    if (tool === 'ap' ? apPresent : WIFI_TOOLS.includes(tool) && !apPresent) setTool('select')
  }, [tool, apPresent])

  const gridLines = () => {
    if (!view) return null
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
  const selServer = sel?.kind === 'server' ? scenario.servers.find((s) => s.id === sel.id) : undefined
  const updateServer = (id: string, patch: Partial<ServerCfg>) => {
    commit({ ...scenario, servers: scenario.servers.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  }
  const addServer = () => {
    let k = scenario.servers.length + 1
    while (scenario.servers.some((s) => s.id === `srv-${k}`)) k++
    const id = `srv-${k}`
    commit({ ...scenario, servers: [...scenario.servers, { id, kind: 'game', name: `Server ${k}`, rttMs: 30, jitterMs: 3, processMs: 2 }] })
    setSel({ kind: 'server', id })
  }
  const deleteServer = (id: string) => {
    // drop the server and every stream binding that pointed at it
    const nodes = scenario.nodes.map((n) => {
      if (!n.servers) return n
      const servers = Object.fromEntries(Object.entries(n.servers).filter(([, sid]) => sid !== id)) as NodeCfg['servers']
      return { ...n, servers: servers && Object.keys(servers).length ? servers : undefined }
    })
    commit({ ...scenario, nodes, servers: scenario.servers.filter((s) => s.id !== id) })
    if (sel?.kind === 'server' && sel.id === id) setSel(null)
  }
  const scatterers = scenario.scatterers ?? []
  const selScatterer = sel?.kind === 'scatterer' ? scatterers.find((s) => s.id === sel.id) : undefined
  /** A field of one reflecting object. Every call passes the figure explicitly: `extraLossDb`
   * has no default anywhere in this app, because 0 dB is a claim (one square metre) and not a
   * neutral value (`ScattererSchema`, src/model/scenario.ts). */
  const patchScatterer = (id: string, patch: Partial<ScattererCfg>) => commit(updateScatterer(scenario, id, patch))
  const deleteScatterer = (id: string) => {
    // With the last object the whole section goes, so the plan is once again indistinguishable
    // from one that never had any (`withScatterers`).
    commit(removeScatterer(scenario, id))
    if (sel?.kind === 'scatterer' && sel.id === id) setSel(null)
  }
  const selWall = sel?.kind === 'wall' ? scenario.walls[sel.index] : undefined
  const scaleBarM = view && view.scale > 40 ? 1 : 5

  return (
    <div style={{
      display: 'grid', gridTemplateRows: 'auto auto auto minmax(0, 1fr)',
      // The column this grid used not to state. Its implicit `auto` was as wide
      // as its widest child, which here is the fixed `280px + 300px` panel row:
      // 580 px whatever the window is. Every full-width row inside this grid
      // therefore measured itself against 580 instead of the viewport, which is
      // how the load-failure lines came to need a `100vw` of their own (see
      // below, where that patch is now gone) — the same defect `ONE_COLUMN` was
      // written for in the shell, in a second component nobody had applied it to.
      gridTemplateColumns: ONE_COLUMN,
      height: '100%', minWidth: 0,
    }}>
      {/* ===== menu bar (tools + scenario controls) ===== */}
      {/* Every child names its row. The two middle rows are conditional, and with
          auto-placement an absent one slid the panels up into an `auto` row whose
          height came from whatever the object list happened to want. */}
      <div style={{
        gridRow: 1,
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '5px 10px',
        background: 'var(--panel)', borderBottom: '1px solid var(--border)', fontSize: 12,
      }}>
        {TOOLS.map((t) => {
          const why = toolDisabled(t)
          return (
            <button key={t} className={tool === t ? 'active' : ''} disabled={why !== null}
              title={why ?? undefined} onClick={() => setTool(t)}>
              {E.tools[t]}
            </button>
          )
        })}
        <button onClick={resetView}>{E.tools.fit}</button>
        <button onClick={undoHere} disabled={!canUndo(history)} title={E.undoHint}>{E.tools.undo}</button>
        <button onClick={redoHere} disabled={!canRedo(history)} title={E.redoHint}>{E.tools.redo}</button>
        <span style={menuDivider} />
        <span style={{ color: 'var(--dim)' }}>{E.scenario}</span>
        <button onClick={() => { localStorage.setItem(LS_KEY, scenarioToJson(scenario)); setIoMsg({ ok: true, lines: [E.saved] }) }}>{E.save}</button>
        <button onClick={() => {
          const sv = localStorage.getItem(LS_KEY)
          if (!sv) return setIoMsg({ ok: false, lines: [E.nothingSaved] })
          try { commit(scenarioFromJson(sv)); setIoMsg({ ok: true, lines: [E.loaded] }) } catch (err) { setIoMsg({ ok: false, lines: scenarioLoadIssues(err) }) }
        }}>{E.load}</button>
        <button onClick={() => {
          const blob = new Blob([scenarioToJson(scenario)], { type: 'application/json' })
          const a = document.createElement('a')
          a.href = URL.createObjectURL(blob)
          a.download = 'wifi-scenario.json'
          a.click()
        }}>{E.export_}</button>
        <button onClick={() => fileRef.current?.click()}>{E.import_}</button>
        <input ref={fileRef} type="file" accept=".json" hidden onChange={async (e) => {
          const f = e.target.files?.[0]
          if (!f) return
          try { commit(scenarioFromJson(await f.text())); setIoMsg({ ok: true, lines: [E.imported] }) } catch (err) { setIoMsg({ ok: false, lines: scenarioLoadIssues(err) }) }
          e.target.value = ''
        }} />
        <span style={menuDivider} />
        <input type="number" min={1} max={20} value={spawnN} style={{ width: 44 }}
          onChange={(e) => setSpawnN(Number(e.target.value))} />
        <button disabled={!apPresent} title={apPresent ? undefined : E.needApFirst} onClick={() => {
          const rng = new Rng((Math.random() * 2 ** 31) >>> 0)
          commit(spawnRandomStas(scenario, spawnN, () => rng.next()))
        }}>{E.spawn}</button>
        <span style={menuDivider} />
        <select value="" title={E.households} onChange={(e) => {
          const h = HOUSEHOLDS.find((x) => x.id === e.target.value)
          if (!h) return
          commit(h.scenario())
          setSel(null)
          setIoMsg({ ok: true, lines: [E.loaded] })
        }}>
          <option value="">{E.households}</option>
          {HOUSEHOLDS.map((h) => <option key={h.id} value={h.id}>{h.title}</option>)}
        </select>
        <span style={menuDivider} />
        <label style={{ display: 'flex', gap: 4, alignItems: 'center' }} title={E.rtsHint}>
          {E.rts}
          <input type="number" step={100} value={scenario.rtsThresholdBytes} style={{ width: 62 }}
            onChange={(e) => commit({ ...scenario, rtsThresholdBytes: Number(e.target.value) })} /> B
        </label>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center' }} title={E.seedHint}>
          {E.seed}
          <input type="number" value={scenario.seed} style={{ width: 74 }}
            onChange={(e) => commit({ ...scenario, seed: Number(e.target.value) })} />
        </label>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center' }} title={E.sixGhzHint}>
          {E.sixGhz}
          <input type="number" step={5} min={5955} max={7115} value={sixGhzCenterMhz} style={{ width: 74 }}
            onChange={(e) => commit({ ...scenario, sixGhzCenterMhz: clampSixGhzCenterMhz(e.target.value) })} />
          {E.sixGhzChannel(sixGhzChannelNo(sixGhzCenterMhz))}
        </label>
        {sixGhzOverlapPctVal !== null && <span style={{ color: 'var(--dim)', fontSize: 11 }}>{E.sixGhzOverlap(sixGhzOverlapPctVal)}</span>}
        {sixGhzNbOverlapVal && <span style={{ color: 'var(--dim)', fontSize: 11 }}>{E.sixGhzNbOverlap}</span>}
      </div>

      {/* ===== the last load / save / import outcome, one line per reason =====
          **Its own grid row, not a flex item of the menu bar above.** The menu bar wraps, but at
          a narrow width its own content still overflows it, and a `flexBasis: 100%` child
          resolves against that overflowed content width — so the sentences ran off the right
          edge and could only be read by scrolling the toolbar sideways.

          It then needed a `100vw` of its own, and that patch is **gone**: it was treating the
          symptom of this grid's missing column (see the root `div` above) with a length that
          happens to mean the same thing — and `100vw` is the viewport *including* a vertical
          scrollbar, so on a platform that reserves one it is a dozen pixels too wide. With the
          column stated, the row's width is this grid's width, which is the editor's, which is
          the viewport's. Measured at 470 px: the row is 450 px wide and every line inside it.

          One row per reason rather than one wrapped paragraph: a schema refusal is a whole
          sentence now — the tampered-driver rules run past 150 characters — and three of them
          run together are three sentences nobody can tell apart. `scenarioLoadIssues`
          (src/editor/planOps.ts) decides what each line says; this decides nothing. */}
      {ioMsg.lines.length > 0 && (
        <div style={{
          gridRow: 2,
          display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, lineHeight: 1.45,
          padding: '4px 10px', background: 'var(--panel)', borderBottom: '1px solid var(--border)',
          minWidth: 0,
        }}>
          {ioMsg.lines.map((line) => (
            <span key={line} style={{ color: ioMsg.ok ? 'var(--dim)' : '#f87171', wordBreak: 'break-word' }}>{line}</span>
          ))}
        </div>
      )}

      {/* ===== which column is on screen, where only one fits =====
          The same choice the shell gives the lesson and the 3-D view at this width, and the
          reason it is needed is in `EditorPane`: at 470 px the three columns are 580 px of
          content inside a `main` that clips, so the plan was 0 px wide with no SVG drawn and
          the notes lost their right 110 px, with nothing to scroll to reach either. */}
      {onePane && (
        <div style={{
          gridRow: 3,
          display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', minWidth: 0,
          background: 'var(--panel)', borderBottom: '1px solid var(--border)', overflowX: 'auto',
        }}>
          {EDITOR_PANES.map((p) => (
            <button key={p} className={pane === p ? 'active' : ''} onClick={() => setPane(p)}>
              {E.panes[p]}
            </button>
          ))}
        </div>
      )}

      {/* ===== canvas + panels ===== */}
      <div style={{
        gridRow: 4,
        display: 'grid', gridTemplateColumns: onePane ? ONE_COLUMN : '1fr 280px 300px',
        minHeight: 0, minWidth: 0,
      }}>
        <div ref={hostRef} style={{
          position: 'relative', overflow: 'hidden',
          display: onePane && pane !== 'plan' ? 'none' : 'block',
        }}>
          {view && (
            <>
              <div style={{ position: 'absolute', left: 10, bottom: 8, zIndex: 2, color: 'var(--dim)', fontSize: 10 }}>
                <div style={{ width: scaleBarM * view.scale, height: 3, background: '#8a93a3', marginBottom: 2 }} />
                {scaleBarM} m · {E.scaleBarHint}
              </div>
              <svg
                viewBox={`${view.cx - vw() / 2} ${view.cy - vh() / 2} ${vw()} ${vh()}`}
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
                      {segs.map((sg, j) => (
                        <line key={j}
                          x1={w.x1 + ux * sg.a} y1={w.y1 + uy * sg.a}
                          x2={w.x1 + ux * sg.b} y2={w.y1 + uy * sg.b}
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
                {/* the reflecting objects, under the nodes: furniture is the background a
                    deployment is drawn on top of, and the hit test resolves the overlap the
                    same way round */}
                {scatterers.map((s) => {
                  const selHere = sel?.kind === 'scatterer' && sel.id === s.id
                  const r = 0.26
                  return (
                    <g key={`s:${s.id}`} style={{ cursor: 'pointer' }}>
                      <polygon
                        points={`${s.pos.x},${s.pos.y - r} ${s.pos.x + r},${s.pos.y} ${s.pos.x},${s.pos.y + r} ${s.pos.x - r},${s.pos.y}`}
                        fill={SCATTERER_COLOR} stroke={selHere ? '#fff' : 'none'} strokeWidth={0.06} />
                      <text x={s.pos.x + 0.36} y={s.pos.y + 0.12} fontSize={0.32} fill="#9aa3af">
                        {s.id} <tspan fontSize={0.26}>{dbFmt(s.extraLossDb)} dB</tspan>
                      </text>
                    </g>
                  )
                })}
                {scenario.nodes.map((n) => {
                  const selHere = sel?.kind === 'node' && sel.id === n.id
                  const anchor = n.kind === 'uwb' && n.uwb?.role === 'anchor'
                  return (
                    <g key={n.id} style={{ cursor: 'pointer' }}>
                      {/* an anchor is bolted to the building, so it is drawn as a square */}
                      {anchor ? (
                        <rect x={n.pos.x - 0.3} y={n.pos.y - 0.3} width={0.6} height={0.6} rx={0.06}
                          fill={nodeColor(n)} stroke={selHere ? '#fff' : 'none'} strokeWidth={0.06} />
                      ) : (
                        <circle cx={n.pos.x} cy={n.pos.y}
                          r={n.kind === 'ap' ? 0.35 : n.kind === 'amp' ? 0.2 : n.kind === 'uwb' ? 0.22 : 0.28}
                          fill={nodeColor(n)} stroke={selHere ? '#fff' : 'none'} strokeWidth={0.06} />
                      )}
                      <text x={n.pos.x + 0.4} y={n.pos.y + 0.12} fontSize={0.36} fill="#d5dae3">
                        {n.name} <tspan fill="#8a93a3" fontSize={0.28}>{nodeBadge(n)}</tspan>
                      </text>
                    </g>
                  )
                })}
              </svg>
            </>
          )}
        </div>

        {/* objects above, properties below */}
        <div style={{
          borderLeft: onePane ? 'none' : '1px solid var(--border)', background: 'var(--panel)',
          display: onePane && pane !== 'objects' ? 'none' : 'grid',
          gridTemplateRows: 'minmax(120px, 42%) 1fr', gridTemplateColumns: ONE_COLUMN, minHeight: 0, minWidth: 0,
        }}>
          <div style={{ overflowY: 'auto', minHeight: 0, borderBottom: '1px solid var(--border)' }}>
            <div style={{ padding: '6px 10px 2px', fontSize: 11, color: 'var(--dim)', letterSpacing: 0.5 }}>{E.objects}</div>
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
              <div>
                <div style={{ color: 'var(--dim)', marginBottom: 4 }}>{E.nodesHeader}</div>
                {scenario.nodes.map((n, i) => (
                  <div key={n.id}
                    onClick={() => setSel({ kind: 'node', id: n.id })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px', cursor: 'pointer',
                      background: sel?.kind === 'node' && sel.id === n.id ? '#2a3550' : undefined, borderRadius: 3,
                    }}>
                    <span style={{ width: 8, height: 8, borderRadius: n.kind === 'uwb' && n.uwb?.role === 'anchor' ? 1 : 4, background: nodeColor(n) }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.tamper ? '⚠ ' : ''}{n.name} <span style={{ color: 'var(--dim)' }}>{nodeBadge(n)}</span>
                    </span>
                    <button style={{ padding: '0 4px' }} disabled={i === 0} onClick={(e) => { e.stopPropagation(); moveNode(n.id, -1) }}>▲</button>
                    <button style={{ padding: '0 4px' }} disabled={i === scenario.nodes.length - 1} onClick={(e) => { e.stopPropagation(); moveNode(n.id, 1) }}>▼</button>
                    <button style={{ padding: '0 4px' }} disabled={!canDeleteNode(scenario, n.id)} title={canDeleteNode(scenario, n.id) ? E.delete_ : E.apNoDelete}
                      onClick={(e) => { e.stopPropagation(); deleteNode(n.id) }}>🗑</button>
                  </div>
                ))}
              </div>
              {/* on sc.uwb alone, so an imported session no device uses is visible and removable */}
              {scenario.uwb && (
                <UwbSessionFields
                  session={scenario.uwb}
                  anchors={uwbNodes.filter((n) => n.uwb?.role === 'anchor').length}
                  tags={uwbNodes.filter((n) => n.uwb?.role === 'tag').length}
                  issue={sessionIssue}
                  onChange={updateUwbSession}
                  onRemove={() => commit({ ...scenario, uwb: undefined })}
                />
              )}
              {/* unconditional: the switch is what opts a plan in, so it has to be reachable
                  from a plan that has no fading section at all */}
              <FadingFields fading={scenario.fading} onChange={(fading) => commit(withFading(scenario, fading))} />
              {/* Immediately under the fading section, and not anywhere else: every reason this
                  switch can be grey is a fact about `fading` or about the links, so read three
                  sections away the grey would be unexplainable. Unconditional for the same
                  reason the fading switch is — it is what opts a plan in. */}
              <SelectivityField scenario={scenario} onChange={(sel) => commit(withSelectivity(scenario, sel))} />
              {/* Under the selectivity switch and unconditional for the same reason: the
                  control is what opts a plan in. It is a radio group rather than a checkbox
                  because there are three tiers and the base one is the absence of the section
                  (`guardIntervalToggle`), so "off" is a choice among the three and not a
                  separate gesture. */}
              <GuardIntervalField scenario={scenario} onChange={(g) => commit(withGuardInterval(scenario, g))} />
              {/* The reflecting objects. Unlike fading there is no switch: the objects *are* the
                  section, so this list is only here to name what the 🪞 tool placed and to take
                  them away again — with the last of them the section itself goes. */}
              <div>
                <div style={{ color: 'var(--dim)', marginBottom: 4 }} title={E.scatterersHint}>{E.scatterers}</div>
                {scatterers.map((s) => (
                  <div key={s.id}
                    onClick={() => setSel({ kind: 'scatterer', id: s.id })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px', cursor: 'pointer',
                      background: sel?.kind === 'scatterer' && sel.id === s.id ? '#2a3550' : undefined, borderRadius: 3,
                    }}>
                    <span style={{ width: 8, height: 8, background: SCATTERER_COLOR, transform: 'rotate(45deg)' }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.id} <span style={{ color: 'var(--dim)' }}>{dbFmt(s.extraLossDb)} dB · {s.pos.z} m</span>
                    </span>
                    <button style={{ padding: '0 4px' }} title={E.deleteScatterer}
                      onClick={(e) => { e.stopPropagation(); deleteScatterer(s.id) }}>🗑</button>
                  </div>
                ))}
                {!scatterers.length && <div style={{ color: 'var(--dim)' }}>{E.noScatterers}</div>}
                {scatterers.length > 0 && !uwbNodes.length && <div style={issueStyle}>{E.scattererNeedsUwb}</div>}
              </div>
              <div>
                <div style={{ color: 'var(--dim)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {E.servers}
                  <button style={{ padding: '0 6px', marginLeft: 'auto' }} onClick={addServer}>{E.addServer}</button>
                </div>
                {scenario.servers.map((s) => (
                  <div key={s.id}
                    onClick={() => setSel({ kind: 'server', id: s.id })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px', cursor: 'pointer',
                      background: sel?.kind === 'server' && sel.id === s.id ? '#2a3550' : undefined, borderRadius: 3,
                    }}>
                    <span>☁</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.name} <span style={{ color: 'var(--dim)' }}>{L.serverKinds[s.kind]} · {s.rttMs}{s.jitterMs ? `+${s.jitterMs}` : ''} ms</span>
                    </span>
                    <button style={{ padding: '0 4px' }} title={E.deleteServer} onClick={(e) => { e.stopPropagation(); deleteServer(s.id) }}>🗑</button>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ color: 'var(--dim)', marginBottom: 4 }}>{E.rooms}</div>
                {scenario.rooms.map((r, i) => (
                  <div key={i}
                    onClick={() => setSel({ kind: 'room', index: i })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px', cursor: 'pointer',
                      background: sel?.kind === 'room' && sel.index === i ? '#2a3550' : undefined, borderRadius: 3,
                    }}>
                    <span style={{ flex: 1 }}>{r.name} <span style={{ color: 'var(--dim)' }}>{r.w}×{r.h} m</span></span>
                    <button style={{ padding: '0 4px' }} onClick={(e) => { e.stopPropagation(); deleteRoom(i) }}>🗑</button>
                  </div>
                ))}
                {!scenario.rooms.length && <div style={{ color: 'var(--dim)' }}>{E.noRooms}</div>}
              </div>
              <div>
                <div style={{ color: 'var(--dim)', marginBottom: 4 }}>{E.walls}</div>
                {scenario.walls.map((w, i) => (
                  <div key={i}
                    onClick={() => setSel({ kind: 'wall', index: i })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '1px 4px', cursor: 'pointer',
                      background: sel?.kind === 'wall' && sel.index === i ? '#2a3550' : undefined, borderRadius: 3,
                    }}>
                    <span style={{ width: 8, height: 8, background: MATERIAL_COLORS[w.material], borderRadius: 2 }} />
                    <span style={{ flex: 1, color: '#aeb6c2' }}>
                      ({w.x1},{w.y1})→({w.x2},{w.y2}) {L.widgets.wallName[w.material]}{w.openings.length ? ` · ${w.openings.length} ${E.openings}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ overflowY: 'auto', minHeight: 0 }}>
            <div style={{ padding: '6px 10px 2px', fontSize: 11, color: 'var(--dim)', letterSpacing: 0.5 }}>{E.properties}</div>
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selServer && (
                <div>
                  <div style={{ color: 'var(--dim)', marginBottom: 4 }}>☁ {selServer.name}</div>
                  <label style={{ display: 'block', marginBottom: 4 }}>
                    {E.serverName} <input value={selServer.name} onChange={(e) => updateServer(selServer.id, { name: e.target.value })} style={{ width: 130 }} />
                  </label>
                  <label style={{ display: 'block', marginBottom: 4 }}>
                    {E.serverKind}{' '}
                    <select value={selServer.kind} onChange={(e) => updateServer(selServer.id, { kind: e.target.value as ServerKind })}>
                      {SERVER_KINDS.map((k) => <option key={k} value={k}>{L.serverKinds[k]}</option>)}
                    </select>
                  </label>
                  <label style={{ display: 'block', marginBottom: 4 }} title={E.serverRttHint}>
                    {E.serverRtt}{' '}
                    <input type="number" min={0} step={5} value={selServer.rttMs} style={{ width: 56 }}
                      onChange={(e) => updateServer(selServer.id, { rttMs: Math.max(0, Number(e.target.value)) })} /> ms
                  </label>
                  <label style={{ display: 'block', marginBottom: 4 }} title={E.serverJitterHint}>
                    {E.serverJitter}{' '}
                    <input type="number" min={0} step={1} value={selServer.jitterMs} style={{ width: 56 }}
                      onChange={(e) => updateServer(selServer.id, { jitterMs: Math.max(0, Number(e.target.value)) })} /> ms
                  </label>
                  <label style={{ display: 'block', marginBottom: 4 }} title={E.serverProcessHint}>
                    {E.serverProcess}{' '}
                    <input type="number" min={0} step={1} value={selServer.processMs} style={{ width: 56 }}
                      onChange={(e) => updateServer(selServer.id, { processMs: Math.max(0, Number(e.target.value)) })} /> ms
                  </label>
                  <button onClick={() => deleteServer(selServer.id)}>{E.deleteServer}</button>
                </div>
              )}
              {selNode && (
                <div>
                  <div style={{ color: 'var(--dim)', marginBottom: 4 }}>{E.node}: {selNode.name}</div>
                  <label style={{ display: 'block', marginBottom: 4 }}>
                    {E.name} <input value={selNode.name} onChange={(e) => updateNode(selNode.id, { name: e.target.value })} style={{ width: 130 }} />
                  </label>
                  {selNode.kind === 'sta' && (
                    <label style={{ display: 'block', marginBottom: 4 }} title={E.presetHint}>
                      {E.preset}{' '}
                      <select value="" onChange={(e) => {
                        const p = STATION_PRESETS.find((x) => x.id === e.target.value)
                        if (p) commit({ ...scenario, nodes: scenario.nodes.map((n) => (n.id === selNode.id ? applyPreset(n, p) : n)) })
                      }}>
                        <option value="">{E.presetPick}</option>
                        {BRANDS.map((b) => (
                          <optgroup key={b} label={E.brands[b]}>
                            {STATION_PRESETS.filter((p) => p.brand === b).map((p) => (
                              <option key={p.id} value={p.id}>{p.model} · {p.released} · {genShort(p.generation)}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </label>
                  )}
                  {selNode.kind !== 'amp' && selNode.kind !== 'uwb' && (
                    <>
                      <label style={{ display: 'block', marginBottom: 4 }}>
                        {E.wifi}{' '}
                        <select value={selNode.caps.generation} onChange={(e) => setGeneration(selNode, e.target.value as Generation)}>
                          {(Object.keys(L.generations) as Generation[]).map((g) => (
                            <option key={g} value={g}>{L.generations[g]}</option>
                          ))}
                        </select>
                      </label>
                      {GEN_FEATURES[selNode.caps.generation].length > 0 && (
                        <div style={{ margin: '4px 0 6px', paddingLeft: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {GEN_FEATURES[selNode.caps.generation].map((f) => (
                            <label key={f} style={{ fontSize: 11.5, display: 'flex', gap: 5, alignItems: 'center' }} title={L.features[f]}>
                              <input type="checkbox" checked={selNode.caps.features[f] === true}
                                onChange={(e) => updateNode(selNode.id, {
                                  caps: { ...selNode.caps, features: { ...selNode.caps.features, [f]: e.target.checked } },
                                })} />
                              {L.features[f]}
                            </label>
                          ))}
                          {(() => {
                            const p = STATION_PRESETS.find((x) => x.model === selNode.name)
                            return p?.mloCapable && selNode.caps.features.mlo !== true
                              ? <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>{E.mloCapableNote}</div>
                              : null
                          })()}
                        </div>
                      )}
                      {GEN_FEATURES[selNode.caps.generation].includes('txop') && selNode.caps.features.txop === true && (
                        <label style={{ display: 'block', marginBottom: 4 }} title={E.txopProtHint}>
                          {E.txopProt}{' '}
                          <select
                            value={selNode.txopProtection ?? 'single'}
                            onChange={(e) => updateNode(selNode.id, { txopProtection: e.target.value as TxopProtection })}
                          >
                            {TXOP_PROTECTIONS.map((p) => <option key={p} value={p}>{E.txopProtNames[p]}</option>)}
                          </select>
                        </label>
                      )}
                      {selNode.kind === 'sta' && selNode.caps.generation !== 'vht' && selNode.caps.features.mlo !== true && (
                        <label style={{ display: 'block', marginBottom: 4 }} title={E.linkHint}>
                          {E.link}{' '}
                          <select value={selNode.linkId ?? '5g'} onChange={(e) => updateNode(selNode.id, { linkId: e.target.value as LinkId })}>
                            {(['2g', '5g', '6g'] as LinkId[])
                              .filter((l) => l !== '6g' || GEN_RANK[selNode.caps.generation] >= GEN_RANK.he)
                              .map((l) => <option key={l} value={l}>{E.bands[l]}</option>)}
                          </select>
                        </label>
                      )}
                      {selNode.kind === 'ap' && (
                        <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, cursor: 'pointer' }} title={E.gameAccelHint}>
                          <input type="checkbox" checked={selNode.gameAccel === true}
                            onChange={(e) => updateNode(selNode.id, { gameAccel: e.target.checked || undefined })} />
                          {E.gameAccel}
                        </label>
                      )}
                      {selNode.kind === 'sta' && (
                        <label style={{ display: 'block', marginBottom: 6 }} title={E.tamperHint}>
                          {E.tamper}{' '}
                          <select value={tamperKindOf(selNode.tamper)} style={{ maxWidth: 200 }}
                            onChange={(e) => {
                              const k = e.target.value
                              updateNode(selNode.id, { tamper: k === 'none' || k === 'custom' ? undefined : { ...TAMPER_PRESETS[k as TamperKind] } })
                            }}>
                            <option value="none">{E.tamperKinds.none}</option>
                            {TAMPER_KINDS.map((k) => <option key={k} value={k}>{E.tamperKinds[k]}</option>)}
                            {tamperKindOf(selNode.tamper) === 'custom' && <option value="custom">{E.tamperKinds.custom}</option>}
                          </select>
                        </label>
                      )}
                      {/* The schema's own wording, not a paraphrase of it, and on the screen
                          rather than in a tooltip: a touch screen has nothing to hover, and a
                          preset that is refused with no reason beside it is the shape of the
                          bug these rules exist to remove. `driverRefusalsFor`
                          (src/model/scenario.ts) holds the single copy, so this line and
                          `ScenarioSchema`'s refusal can never explain the same rule
                          differently. Rendered for EVERY node kind, not just `sta`: two of the
                          three rules are about a field sitting on the wrong kind, and a plan
                          imported from JSON can put either field anywhere. */}
                      {driverRefusalsFor(scenario, selNode).map((why) => (
                        <div key={why} style={issueStyle}>{why}</div>
                      ))}
                      {selNode.kind === 'sta' && (
                        <div style={{ marginBottom: 4 }}>
                          {E.traffic}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2, paddingLeft: 8 }}>
                            {STREAMS.map((p) => (
                              <label key={p} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={selNode.profiles.includes(p)}
                                  onChange={(e) => {
                                    const next = e.target.checked
                                      ? [...selNode.profiles, p]
                                      : selNode.profiles.filter((x) => x !== p)
                                    updateNode(selNode.id, { profiles: normalizeProfiles(next) })
                                  }}
                                />
                                <span style={{ flex: 1, minWidth: 0 }}>{L.profiles[p]}</span>
                                {p === 'p2pvideo' && selNode.profiles.includes(p) && (
                                  <select value={selNode.p2pTarget ?? ''} title={E.p2pTargetHint} style={{ flexShrink: 0, maxWidth: 120, fontSize: 11 }}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => updateNode(selNode.id, { p2pTarget: e.target.value || undefined })}>
                                    <option value="">{E.p2pTarget}…</option>
                                    {scenario.nodes.filter((n) => n.kind === 'sta' && n.id !== selNode.id).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                                  </select>
                                )}
                                {selNode.profiles.includes(p) && serverKindFor(p) && (() => {
                                  const kind = serverKindFor(p)!
                                  const choices = scenario.servers.filter((s) => s.kind === kind)
                                  const current = serverFor(scenario, selNode, p)?.id ?? ''
                                  return choices.length ? (
                                    <select value={current} title={E.streamServer} style={{ flexShrink: 0, maxWidth: 104, fontSize: 11 }}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => updateNode(selNode.id, { servers: { ...selNode.servers, [p]: e.target.value } })}>
                                      {choices.map((s) => <option key={s.id} value={s.id}>☁ {s.name}</option>)}
                                    </select>
                                  ) : null
                                })()}
                              </label>
                            ))}
                            {selNode.profiles[0] === 'idle' && (
                              <span style={{ color: 'var(--dim)', fontSize: 11 }}>{L.profiles.idle}</span>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {selNode.kind === 'uwb' && (
                    <UwbNodeFields node={selNode} mode={scenario.uwb?.mode} onChange={(patch) => updateNode(selNode.id, patch)} />
                  )}
                  {selNode.kind !== 'uwb' && (
                    <label style={{ display: 'block', marginBottom: 4 }}>
                      {E.txPower}{' '}
                      <input type="number" value={selNode.txPowerDbm} style={{ width: 56 }}
                        onChange={(e) => updateNode(selNode.id, { txPowerDbm: Number(e.target.value) })} /> dBm
                    </label>
                  )}
                  {selNode.kind === 'amp' && (
                    <>
                      <label style={{ display: 'block', marginBottom: 4 }} title={E.ampModeHint}>
                        {E.ampMode}{' '}
                        <select value={selNode.ampTag?.mode ?? 'active'}
                          onChange={(e) => updateNode(selNode.id, { ampTag: { ...selNode.ampTag, mode: e.target.value as AmpTagMode } })}>
                          <option value="active">{E.ampModes.active}</option>
                          <option value="backscatter">{E.ampModes.backscatter}</option>
                        </select>
                      </label>
                      {ampTagIssue(scenario, selNode.id) && <div style={issueStyle}>{E.ampBsNeedsReader}</div>}
                      {(selNode.ampTag?.mode ?? 'active') === 'backscatter' ? (
                        <AmpEpcInput key={selNode.id} epc={selNode.ampTag?.epc}
                          onCommit={(epc) => updateNode(selNode.id, { ampTag: { ...selNode.ampTag, epc } })} />
                      ) : (
                        <label style={{ display: 'block', marginBottom: 4 }} title={E.ampSensHint}>
                          {E.ampSens}{' '}
                          <input type="number" value={selNode.ampTag?.dlSensDbm ?? -72} style={{ width: 56 }}
                            onChange={(e) => updateNode(selNode.id, { ampTag: { ...selNode.ampTag, dlSensDbm: Number(e.target.value) } })} /> dBm
                        </label>
                      )}
                    </>
                  )}
                  {selNode.kind !== 'uwb' && (
                    <label style={{ display: 'block', marginBottom: 4 }}>
                      {E.height}{' '}
                      <input type="number" step={0.1} value={selNode.pos.z} style={{ width: 56 }}
                        onChange={(e) => updateNode(selNode.id, { pos: { ...selNode.pos, z: Number(e.target.value) } })} /> m
                    </label>
                  )}
                  {selNode.kind === 'ap' && (
                    <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                      <div style={{ color: 'var(--dim)', marginBottom: 4 }}>{E.amp}</div>
                      {selNode.caps.generation !== 'eht' ? (
                        /* The schema's own sentence, asked hypothetically — `ampApRefusals`
                           (src/model/scenario.ts) holds the single copy, so this line and
                           `ScenarioSchema`'s refusal can never explain the same rule
                           differently. There was a second Chinese wording of it here
                           (`STRINGS.ampNeedsEht`) until 2026-10-10, and it had already drifted:
                           it said 「携带 U-SIG」, which a UHR PPDU also does.

                           Dim rather than `issueStyle`: this node has no `ampAp`, so nothing is
                           being refused yet. It is the panel saying first what the schema would
                           say — which is what `fadingOffHint`'s precedent asks for — and a red
                           line on a `he` access point whose owner has done nothing wrong would
                           be crying wolf. The red belongs to the state where the section IS
                           present, and `scenarioLoadIssues` prints it there. */
                        <div style={{ fontSize: 11, color: 'var(--dim)' }}>
                          {ampApRefusals({ ...selNode, ampAp: DEFAULT_AMP_AP }).join(' ')}
                        </div>
                      ) : (
                        <>
                          <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, cursor: 'pointer' }}>
                            <input type="checkbox" checked={selNode.ampAp !== undefined}
                              onChange={(e) => updateNode(selNode.id, { ampAp: e.target.checked ? { ...DEFAULT_AMP_AP } : undefined })} />
                            {E.ampEnable}
                          </label>
                          {selNode.ampAp && (
                            <>
                              <label style={{ display: 'block', marginBottom: 4 }} title={E.ampIntervalHint}>
                                {E.ampInterval}{' '}
                                <input type="number" min={10} max={10_000} value={selNode.ampAp.pollIntervalMs} style={{ width: 62 }}
                                  onChange={(e) => updateNode(selNode.id, { ampAp: { ...selNode.ampAp!, pollIntervalMs: clampField(e.target.value, 10, 10_000) } })} /> ms
                              </label>
                              <label style={{ display: 'block', marginBottom: 4 }} title={E.ampSlotsHint}>
                                {E.ampSlots}{' '}
                                <input type="number" min={1} max={16} value={selNode.ampAp.slots} style={{ width: 56 }}
                                  onChange={(e) => updateNode(selNode.id, { ampAp: { ...selNode.ampAp!, slots: clampField(e.target.value, 1, 16, true) } })} />
                              </label>
                              <label style={{ display: 'block', marginBottom: 4 }} title={E.ampAcweHint}>
                                {E.ampAcwe}{' '}
                                <input type="number" min={0} max={4} value={selNode.ampAp.acwe} style={{ width: 56 }}
                                  onChange={(e) => updateNode(selNode.id, { ampAp: { ...selNode.ampAp!, acwe: clampField(e.target.value, 0, 4, true) } })} />
                              </label>
                              <label style={{ display: 'block', marginBottom: 4 }} title={E.ampDlHint}>
                                {E.ampDl}{' '}
                                <select value={selNode.ampAp.dlKbps}
                                  onChange={(e) => updateNode(selNode.id, { ampAp: { ...selNode.ampAp!, dlKbps: Number(e.target.value) as AmpApCfg['dlKbps'] } })}>
                                  <option value={250}>250 kbps</option>
                                  <option value={1000}>1000 kbps</option>
                                </select>
                              </label>
                              <label style={{ display: 'block', marginBottom: 4 }} title={E.ampUlHint}>
                                {E.ampUl}{' '}
                                <select value={selNode.ampAp.ulKbps}
                                  onChange={(e) => updateNode(selNode.id, { ampAp: { ...selNode.ampAp!, ulKbps: Number(e.target.value) as AmpApCfg['ulKbps'] } })}>
                                  <option value={250}>250 kbps</option>
                                  <option value={1000}>1000 kbps</option>
                                  <option value={4000}>4000 kbps</option>
                                </select>
                              </label>
                              <label style={{ display: 'block', marginBottom: 4 }}>
                                {E.ampProtLabel}{' '}
                                <select value={selNode.ampAp.protection}
                                  onChange={(e) => updateNode(selNode.id, { ampAp: { ...selNode.ampAp!, protection: e.target.value as AmpApCfg['protection'] } })}>
                                  <option value="ctsSelf">{E.ampProt.ctsSelf}</option>
                                  <option value="none">{E.ampProt.none}</option>
                                </select>
                              </label>
                              <label style={{ display: 'block', marginBottom: 4 }}>
                                {E.ampReadLabel}{' '}
                                <select value={selNode.ampAp.readMode}
                                  onChange={(e) => updateNode(selNode.id, { ampAp: { ...selNode.ampAp!, readMode: e.target.value as AmpApCfg['readMode'] } })}>
                                  <option value="inline">{E.ampRead.inline}</option>
                                  <option value="twoPhase">{E.ampRead.twoPhase}</option>
                                </select>
                              </label>
                              <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                                <div style={{ color: 'var(--dim)', marginBottom: 4 }}>{E.ampBs}</div>
                                <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, cursor: 'pointer' }} title={E.ampBsEnableHint}>
                                  <input type="checkbox" checked={selNode.ampAp.backscatter !== undefined}
                                    onChange={(e) => updateNode(selNode.id, {
                                      ampAp: { ...selNode.ampAp!, backscatter: e.target.checked ? { ...DEFAULT_AMP_BS } : undefined },
                                    })} />
                                  {E.ampBsEnable}
                                </label>
                                {selNode.ampAp.backscatter && (
                                  <>
                                    <label style={{ display: 'block', marginBottom: 4 }} title={E.ampBsQHint}>
                                      {E.ampBsQ}{' '}
                                      <input type="number" min={0} max={8} value={selNode.ampAp.backscatter.q} style={{ width: 56 }}
                                        onChange={(e) => updateNode(selNode.id, {
                                          ampAp: { ...selNode.ampAp!, backscatter: { ...selNode.ampAp!.backscatter!, q: clampField(e.target.value, 0, 8, true) } },
                                        })} />
                                    </label>
                                    <label style={{ display: 'block', marginBottom: 4 }} title={E.ampBsUlHint}>
                                      {E.ampBsUl}{' '}
                                      <select value={selNode.ampAp.backscatter.ulKbps}
                                        onChange={(e) => updateNode(selNode.id, {
                                          ampAp: { ...selNode.ampAp!, backscatter: { ...selNode.ampAp!.backscatter!, ulKbps: Number(e.target.value) as AmpBackscatterCfg['ulKbps'] } },
                                        })}>
                                        <option value={250}>250 kbps</option>
                                        <option value={1000}>1000 kbps</option>
                                      </select>
                                    </label>
                                    <label style={{ display: 'block', marginBottom: 4 }} title={E.ampBsWupHint}>
                                      {E.ampBsWup}{' '}
                                      <input type="number" min={1} max={1000} value={selNode.ampAp.backscatter.wupMs} style={{ width: 56 }}
                                        onChange={(e) => updateNode(selNode.id, {
                                          ampAp: { ...selNode.ampAp!, backscatter: { ...selNode.ampAp!.backscatter!, wupMs: clampField(e.target.value, 1, 1000) } },
                                        })} /> ms
                                    </label>
                                    <label style={{ display: 'block', marginBottom: 4 }} title={E.ampBsChargeHint}>
                                      {E.ampBsCharge}{' '}
                                      <input type="number" min={-10} max={30} value={selNode.ampAp.backscatter.chargeDbm} style={{ width: 56 }}
                                        onChange={(e) => updateNode(selNode.id, {
                                          ampAp: { ...selNode.ampAp!, backscatter: { ...selNode.ampAp!.backscatter!, chargeDbm: clampField(e.target.value, -10, 30) } },
                                        })} /> dBm
                                    </label>
                                    <label style={{ display: 'block', marginBottom: 4 }} title={E.ampBsBsHint}>
                                      {E.ampBsBs}{' '}
                                      <input type="number" min={-10} max={30} value={selNode.ampAp.backscatter.bsDbm} style={{ width: 56 }}
                                        onChange={(e) => updateNode(selNode.id, {
                                          ampAp: { ...selNode.ampAp!, backscatter: { ...selNode.ampAp!.backscatter!, bsDbm: clampField(e.target.value, -10, 30) } },
                                        })} /> dBm
                                    </label>
                                    <label style={{ display: 'block', marginBottom: 4 }} title={E.ampBsTxopHint}>
                                      {E.ampBsTxop}{' '}
                                      <input type="number" min={1} max={10} value={selNode.ampAp.backscatter.txopMs} style={{ width: 56 }}
                                        onChange={(e) => updateNode(selNode.id, {
                                          // the schema allows a fraction here (unlike `q`/`slots`/`acwe`), so this is
                                          // not int-clamped: an imported plan with e.g. txopMs 4.5 is never rounded
                                          ampAp: { ...selNode.ampAp!, backscatter: { ...selNode.ampAp!.backscatter!, txopMs: clampField(e.target.value, 1, 10) } },
                                        })} /> ms
                                    </label>
                                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, cursor: 'pointer' }} title={E.ampBsReadHint}>
                                      <input type="checkbox" checked={selNode.ampAp.backscatter.read}
                                        onChange={(e) => updateNode(selNode.id, {
                                          ampAp: { ...selNode.ampAp!, backscatter: { ...selNode.ampAp!.backscatter!, read: e.target.checked } },
                                        })} />
                                      {E.ampBsRead}
                                    </label>
                                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, cursor: 'pointer' }} title={E.ampBsWriteHint}>
                                      <input type="checkbox" checked={selNode.ampAp.backscatter.write}
                                        onChange={(e) => updateNode(selNode.id, {
                                          ampAp: { ...selNode.ampAp!, backscatter: { ...selNode.ampAp!.backscatter!, write: e.target.checked } },
                                        })} />
                                      {E.ampBsWrite}
                                    </label>
                                  </>
                                )}
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {canDeleteNode(scenario, selNode.id) && <button onClick={() => deleteNode(selNode.id)}>{E.deleteNode}</button>}
                </div>
              )}

              {selScatterer && (
                <div>
                  <div style={{ color: 'var(--dim)', marginBottom: 4 }} title={E.scatterersHint}>
                    {E.scatterer}: {selScatterer.id}
                  </div>
                  {/* Both fields are keyed by the object's id, so selecting another one hands
                      back a fresh instance rather than reconciling a refused draft onto it —
                      the trap `AmpEpcInput` documents below. */}
                  <NumberField key={`loss-${selScatterer.id}`}
                    label={E.scattererLoss} unit="dB" step={1} bad={E.scattererLossBad}
                    hint={E.scattererLossHint} live value={selScatterer.extraLossDb}
                    parse={parseScattererNumber}
                    onCommit={(v) => patchScatterer(selScatterer.id, { extraLossDb: v })} />
                  <NumberField key={`z-${selScatterer.id}`}
                    label={E.scattererHeight} unit="m" step={0.1} bad={E.scattererHeightBad}
                    hint={E.scattererHeightHint} live value={selScatterer.pos.z}
                    parse={parseScattererNumber}
                    onCommit={(v) => patchScatterer(selScatterer.id, { pos: { ...selScatterer.pos, z: v } })} />
                  <button onClick={() => deleteScatterer(selScatterer.id)}>{E.deleteScatterer}</button>
                </div>
              )}

              {selWall && sel?.kind === 'wall' && (
                <div>
                  <div style={{ color: 'var(--dim)', marginBottom: 4 }}>{E.wall}</div>
                  <label title={E.materialHint}>
                    {E.material}{' '}
                    <select value={selWall.material} onChange={(e) => {
                      const walls = [...scenario.walls]
                      walls[sel.index] = { ...walls[sel.index], material: e.target.value as Material }
                      commit({ ...scenario, walls })
                    }}>
                      {(['drywall', 'brick', 'glass'] as Material[])
                        .map((m) => <option key={m} value={m}>{L.widgets.wallName[m]}</option>)}
                    </select>
                  </label>
                  {selWall.openings.length > 0 && (
                    <button style={{ marginTop: 6, display: 'block' }} onClick={() => {
                      const walls = [...scenario.walls]
                      walls[sel.index] = { ...walls[sel.index], openings: [] }
                      commit({ ...scenario, walls })
                    }}>{E.removeOpenings}</button>
                  )}
                </div>
              )}

              {sel?.kind === 'room' && (
                <div>
                  <div style={{ color: 'var(--dim)', marginBottom: 4 }}>{E.room}: {scenario.rooms[sel.index]?.name}</div>
                  <label style={{ display: 'block', marginBottom: 4 }}>
                    {E.name} <input value={scenario.rooms[sel.index]?.name ?? ''} onChange={(e) => {
                      const rooms = [...scenario.rooms]
                      rooms[sel.index] = { ...rooms[sel.index], name: e.target.value }
                      commit({ ...scenario, rooms })
                    }} style={{ width: 130 }} />
                  </label>
                  <button onClick={() => deleteRoom(sel.index)}>{E.deleteRoom}</button>
                </div>
              )}

              {!sel && (
                <div style={{ color: 'var(--dim)', fontSize: 11 }}>
                  {E.emptyHint}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* guide column */}
        <div style={{
          borderLeft: onePane ? 'none' : '1px solid var(--border)', background: 'var(--panel)',
          display: onePane && pane !== 'guide' ? 'none' : 'block',
          overflowY: 'auto', minHeight: 0, minWidth: 0,
        }}>
          <div style={{ padding: '6px 12px 0', fontSize: 11, color: 'var(--dim)', letterSpacing: 0.5 }}>{E.guide}</div>
          <EditorGuide />
        </div>
      </div>
    </div>
  )
}

/**
 * The scenario's fading section: the switch that gives a plan time-varying links at all, and
 * the four figures behind it.
 *
 * The switch is the section's own presence — ticking it writes `fading`, clearing it removes
 * the property — because that is what the engine reads. A plan that has never been here has no
 * section, and therefore the link levels it has always had.
 *
 * Which fields are live, and which section a change produces, are both decided in `planOps.ts`
 * so the rules can be tested without rendering anything; this component only draws them. The
 * three number fields buffer their text and refuse what the schema would refuse, exactly as
 * `AmpEpcInput` below does — nothing illegal reaches the store, where nothing would catch it.
 */
function FadingFields({ fading, onChange }: { fading?: FadingCfg; onChange: (f: FadingCfg | undefined) => void }) {
  const E = useStrings().editor
  const live = fadingFieldsLive(fading)
  // What the fields show while the section is absent: the figures ticking the switch would write.
  const shown = fading ?? FADING_DEFAULTS
  const offHint = live.fields ? null : E.fadingOffHint
  return (
    <div>
      <div style={{ color: 'var(--dim)', marginBottom: 4 }}>{E.fading}</div>
      <label style={{ display: 'block', marginBottom: 4 }} title={E.fadingOnHint}>
        <input type="checkbox" checked={live.fields}
          onChange={(e) => onChange(fadingToggle(e.target.checked))} />
        {' '}{E.fadingOn}
      </label>
      {/* keyed by whether the field is live, so flipping the switch (or leaving rician) hands
          back a fresh instance: a refused draft is not the user's problem once the field it
          belonged to is grey — the same reconciliation trap `AmpEpcInput` documents below. */}
      <NumberField key={`sigma-${live.fields}`}
        label={E.fadingSigma} unit="dB" min={0} step={0.5} bad={E.fadingSigmaBad}
        hint={offHint ?? E.fadingSigmaHint} live={live.fields} value={shown.shadowSigmaDb}
        parse={parseShadowSigmaDb}
        onCommit={(v) => { if (fading) onChange({ ...fading, shadowSigmaDb: v }) }} />
      {/* no `min`: the schema's bound is *strictly* positive, which an HTML min cannot express,
          so the parser is the only authority and 0 gets the red line like any other refusal */}
      <NumberField key={`coherence-${live.fields}`}
        label={E.fadingCoherence} unit="ms" step={10} bad={E.fadingCoherenceBad}
        hint={offHint ?? E.fadingCoherenceHint} live={live.fields} value={shown.coherenceMs}
        parse={parseCoherenceMs}
        onCommit={(v) => { if (fading) onChange({ ...fading, coherenceMs: v }) }} />
      <label style={{ display: 'block', marginBottom: 4 }} title={offHint ?? E.fadingSmallScaleHint}>
        {E.fadingSmallScale}{' '}
        <select value={shown.smallScale} disabled={!live.fields}
          onChange={(e) => {
            if (fading) onChange(fadingSmallScalePatch(fading, e.target.value as FadingCfg['smallScale']))
          }}>
          {SMALL_SCALES.map((s) => <option key={s} value={s}>{E.fadingSmallScales[s]}</option>)}
        </select>
      </label>
      <NumberField key={`rician-${live.ricianKdB}`}
        label={E.fadingRicianK} unit="dB" step={1} bad={E.fadingRicianKBad}
        hint={live.ricianKdB ? E.fadingRicianKHint : offHint ?? E.fadingRicianOnly}
        live={live.ricianKdB} value={shown.ricianKdB ?? RICIAN_K_DEFAULT_DB}
        parse={parseRicianKdB}
        onCommit={(v) => { if (fading) onChange({ ...fading, ricianKdB: v }) }} />
    </div>
  )
}

/**
 * The scenario's frequency-selectivity section: one checkbox and nothing else.
 *
 * One checkbox is the whole control because the section has no fields — the bin count is the
 * standard's arithmetic on the PPDU's width and the per-bin deviation is `fading`'s own
 * distribution, so there is nothing here a plan could set (`SelectivityCfg`). Ticking writes
 * the section, clearing removes the property, exactly as the fading switch above: presence is
 * what the engine reads.
 *
 * It takes the whole scenario rather than the section, because every question about it is about
 * something else — is there a `fading` section, is its distribution `none`, is there an
 * eht/he link. `selectivitySwitch` answers all three in `planOps.ts` and hands back the
 * schema's own sentences for the ones that failed, so this draws them and decides nothing.
 */
/**
 * The data field's guard interval: three tiers, one of which is "no section at all".
 *
 * Shows the refusal in the schema's own words, visible rather than as a tooltip, for the reason
 * `SelectivityField` gives: on a touch screen there is nothing to hover, and a greyed control
 * with no reason beside it is the shape of the bug this pattern exists to prevent.
 */
function GuardIntervalField(
  { scenario, onChange }: { scenario: Scenario; onChange: (g: GuardIntervalCfg | undefined) => void },
) {
  const E = useStrings().editor
  const sw = guardIntervalSwitch(scenario)
  // Both halves of each radio's state live in planOps, so a test can reach them: which tier is
  // selectable and which is selected are this control's whole behaviour, and a greyed radio
  // nothing holds down is as much half a control as a group that could show two selections.
  const tiers = guardIntervalTiers(scenario)
  const TIERS = ['base', 'double', 'quad'] as const
  return (
    <div>
      <div style={{ color: 'var(--dim)', marginBottom: 4 }} title={E.guardIntervalHint}>{E.guardInterval}</div>
      {TIERS.map((tier) => (
        <label key={tier} style={{ display: 'block', marginBottom: 4 }} title={E.guardIntervalHint}>
          <input
            type="radio" name="guardInterval" checked={tiers[tier].checked}
            disabled={!tiers[tier].live}
            onChange={() => onChange(guardIntervalToggle(tier))}
          />
          {' '}{E.guardIntervalTiers[tier]}
        </label>
      ))}
      {sw.refusals.map((why) => <div key={why} style={issueStyle}>{why}</div>)}
    </div>
  )
}

function SelectivityField(
  { scenario, onChange }: { scenario: Scenario; onChange: (s: SelectivityCfg | undefined) => void },
) {
  const E = useStrings().editor
  const sw = selectivitySwitch(scenario)
  return (
    <div>
      <div style={{ color: 'var(--dim)', marginBottom: 4 }}>{E.selectivity}</div>
      <label style={{ display: 'block', marginBottom: 4 }} title={E.selectivityOnHint}>
        <input type="checkbox" checked={sw.on} disabled={!sw.live}
          onChange={(e) => onChange(selectivityToggle(e.target.checked))} />
        {' '}{E.selectivityOn}
      </label>
      {/* The schema's wording, not a paraphrase of it, and visible rather than a tooltip: on a
          touch screen there is nothing to hover, and a greyed checkbox with no reason beside it
          is the shape of this bug in the first place. */}
      {sw.refusals.map((why) => <div key={why} style={issueStyle}>{why}</div>)}
    </div>
  )
}

/**
 * One number field of a scenario section — the fading figures and a reflecting object's own two.
 * It holds the typed text and commits on blur or Enter, and a value `parse` refuses is not
 * committed at all: the draft stays on screen because it is what the user has to fix, and the
 * red line says what was wanted. The same shape as `FixedReplyInput`
 * (uwb/ui/UwbSessionFields.tsx), for the same reason — clamping per keystroke would commit the
 * lower bound the moment the field was cleared.
 *
 * `live` is `false` only where a section has a switch above its fields, which the fading section
 * has and the scatterers section does not (there the objects are the section).
 */
function NumberField(
  { label, unit, min, step, hint, bad, live, value, parse, onCommit }: {
    label: string; unit: string; min?: number; step: number; hint: string; bad: string
    live: boolean; value: number; parse: (raw: string) => number | null; onCommit: (v: number) => void
  },
) {
  const [draft, setDraft] = useState<string | null>(null)
  const [refused, setRefused] = useState(false)
  const commit = (): void => {
    if (draft === null) return
    const parsed = parse(draft)
    if (parsed === null) {
      setRefused(true)
      return
    }
    setRefused(false)
    setDraft(null)
    onCommit(parsed)
  }
  return (
    <div style={{ marginBottom: 4 }}>
      <label title={hint}>
        {label}{' '}
        <input type="number" min={min} step={step} style={{ width: 74 }} disabled={!live}
          value={draft ?? value}
          onChange={(e) => { setDraft(e.target.value); setRefused(false) }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        <span style={{ color: 'var(--dim)', fontSize: 11, marginLeft: 4 }}>{unit}</span>
      </label>
      {refused && <div style={issueStyle}>{bad}</div>}
    </div>
  )
}

/**
 * A backscatter tag's EPC field: `parseEpc` (src/ui/inputs.ts) does the parsing, this component
 * only buffers the draft and shows a red message when it does not parse — the same pattern as
 * `NbChannelsInput` (uwb/ui/UwbSessionFields.tsx). Callers must pass `key={id}` (the tag's node
 * id): without it, React reconciles this component's `draft`/`bad` state onto whatever tag is
 * selected next, so a rejected draft for tag A can end up committed to tag B once the user fixes
 * and blurs it. Keying by id forces a fresh instance — and fresh state — on every selection change.
 */
function AmpEpcInput({ epc, onCommit }: { epc: string | undefined; onCommit: (epc: string | undefined) => void }) {
  const E = useStrings().editor
  const [draft, setDraft] = useState<string | null>(null)
  const [bad, setBad] = useState(false)
  const commit = (): void => {
    if (draft === null) return
    const parsed = parseEpc(draft)
    if (parsed === null) {
      setBad(true) // the draft stays on screen: it is what the user has to fix
      return
    }
    setBad(false)
    setDraft(null)
    onCommit(parsed)
  }
  return (
    <div style={{ marginBottom: 4 }}>
      <label title={E.ampEpcHint}>
        {E.ampEpc}{' '}
        <input type="text" style={{ width: 160 }} value={draft ?? epc ?? ''}
          onChange={(e) => { setDraft(e.target.value); setBad(false) }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
      </label>
      {bad && <div style={issueStyle}>{E.ampEpcBad}</div>}
    </div>
  )
}

function genShort(g: Generation): string {
  return { nonht: '11a', vht: 'WF5', he: 'WF6', eht: 'WF7', uhr: 'WF8' }[g]
}

/** Node colour by kind, shared by the canvas and the object list. */
function nodeColor(n: NodeCfg): string {
  if (n.kind === 'ap') return '#3b82f6'
  if (n.kind === 'amp') return '#2dd4bf'
  if (n.kind === 'uwb') return n.uwb?.role === 'anchor' ? '#f59e0b' : '#fbbf24'
  return '#22c55e'
}

/** The short badge after a node's name in the canvas label and the object list. */
function nodeBadge(n: NodeCfg): string {
  if (n.kind === 'amp') return 'AMP'
  if (n.kind === 'uwb') return n.uwb?.role === 'anchor' ? 'UWB ⚓' : 'UWB 🏷'
  return genShort(n.caps.generation)
}
