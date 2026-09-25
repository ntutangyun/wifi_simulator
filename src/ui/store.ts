import { create } from 'zustand'
import { historyInit, historyPush, historyRedo, historyUndo, type History } from '../editor/history'
import { Player } from '../player/player'
import type { FrameDesc } from '../model/frames'
import { ScenarioSchema, defaultScenario, type Scenario } from '../model/scenario'
import type { Ns } from '../model/types'
import type { ViewState } from '../model/view'

/** A frame block the user clicked on the timeline. */
export interface FrameSelection {
  frame: FrameDesc
  /** Lane (virtual node id) that was clicked. */
  nodeId: string
  /** Whether the clicked lane was transmitting or receiving this frame. */
  side: 'tx' | 'rx'
  startNs: Ns
  endNs: Ns
}

export interface UiState {
  mode: 'edit' | 'simulate' | 'course'
  scenario: Scenario
  /** Edit history of `scenario`. Read it for canUndo/canRedo; write it only through the actions. */
  history: History<Scenario>
  playheadNs: Ns
  playing: boolean
  buffering: boolean
  speedUsPerSec: number
  view: ViewState | null
  selectedNodeId: string | null
  selectedFrame: FrameSelection | null
  simError: string | null
  setMode(m: 'edit' | 'simulate' | 'course'): void
  /** Course: currently selected lesson + whether its sim is loaded. */
  courseLessonId: string | null
  courseLoaded: boolean
  /**
   * Which lesson the loaded scene belongs to, or null when nothing is loaded.
   * `courseLoaded` alone is global: with it, a call-out in lesson B would offer
   * "Jump there" into lesson A's recording and seek to a moment that is not in
   * it. A panel asks `courseLoaded && courseLoadedFor === lesson.id`.
   */
  courseLoadedFor: string | null
  /** Increments whenever a new simulation is (re)started — keys scene rebuilds. */
  simSession: number
  selectLesson(id: string | null): void
  /** `lessonId` names the lesson the scene belongs to — a variant's scene is still that lesson's. */
  loadCourseScenario(sc: Scenario, lessonId?: string): void
  adoptCourseScenario(sc: Scenario): void
  /** `coalesceKey`: successive edits sharing one key fold into a single undo step. */
  setScenario(sc: Scenario, coalesceKey?: string | null): void
  undo(): void
  redo(): void
  select(id: string | null): void
  selectFrame(f: FrameSelection | null): void
  setSpeed(usPerSec: number): void
}

/**
 * The editor's document, parked while course mode borrows `scenario` for a
 * lesson. Its history rides along: the same document comes back, so the undo
 * depth the user had built up must come back with it.
 */
let courseStash: { scenario: Scenario; history: History<Scenario> } | null = null

export const player = new Player((t, vs, buffering) => {
  useUi.setState({ playheadNs: t, view: vs, buffering, playing: player.playing })
})

function initialScenario(): Scenario {
  try {
    const s = typeof localStorage !== 'undefined' ? localStorage.getItem('wifi-sim.scenario') : null
    if (s) return ScenarioSchema.parse(JSON.parse(s)) as Scenario
  } catch {
    // fall through to default
  }
  return defaultScenario()
}

type Mode = UiState['mode']

/**
 * Where the user was when they last closed the tab. A refresh in the middle of
 * a lesson used to drop the learner back into the editor, which loses both the
 * lesson and the reason they had the page open.
 */
function initialMode(): Mode {
  try {
    const m = typeof localStorage !== 'undefined' ? localStorage.getItem('wifi-sim.mode') : null
    if (m === 'edit' || m === 'simulate' || m === 'course') return m
  } catch {
    // default below
  }
  return 'edit'
}

/** The lesson that was open. An id the course no longer has simply shows the catalogue. */
function initialLesson(): string | null {
  try {
    const id = typeof localStorage !== 'undefined' ? localStorage.getItem('wifi-sim.lesson') : null
    return id && id.length > 0 ? id : null
  } catch {
    return null
  }
}

function remember(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // storage unavailable — keep in-memory only
  }
}

const startScenario = initialScenario()

export const useUi = create<UiState>((set, get) => ({
  mode: 'edit',
  scenario: startScenario,
  history: historyInit(startScenario),
  playheadNs: 0,
  playing: false,
  buffering: false,
  speedUsPerSec: 1000,
  view: null,
  selectedNodeId: null,
  selectedFrame: null,
  simError: null,
  setMode(m) {
    const prev = get().mode
    if (m === prev) return
    remember('wifi-sim.mode', m)
    // leaving course mode restores the scenario the user had before, undo depth and all
    if (prev === 'course' && courseStash !== null) {
      set({ scenario: courseStash.scenario, history: courseStash.history })
      courseStash = null
    }
    if (m === 'simulate') {
      player.dispose()
      set({ simError: null, playheadNs: 0, view: null, selectedFrame: null })
      player.speedUsPerSec = get().speedUsPerSec
      player.load(get().scenario)
      set({ mode: m, simSession: get().simSession + 1 })
    } else if (m === 'course') {
      courseStash = { scenario: get().scenario, history: get().history }
      player.dispose()
      set({ mode: m, playing: false, view: null, playheadNs: 0, courseLoaded: false, courseLoadedFor: null, simError: null, selectedFrame: null })
    } else {
      // The banner belongs to the run that raised it: leaving it up over the
      // editor would show the learner a complaint about a plan they are in the
      // middle of fixing, beside the live one the session section already draws.
      player.dispose()
      set({ mode: m, playing: false, view: null, playheadNs: 0, courseLoaded: false, courseLoadedFor: null, simError: null, selectedFrame: null })
    }
  },
  courseLessonId: initialLesson(),
  courseLoaded: false,
  courseLoadedFor: null,
  simSession: 0,
  selectLesson(id) {
    remember('wifi-sim.lesson', id)
    set({ courseLessonId: id })
  },
  loadCourseScenario(sc, lessonId) {
    player.dispose()
    // A lesson scenario is transient course state, not an edit: the editor is
    // unmounted and its history stays parked in courseStash until it returns.
    set({ scenario: sc, simError: null, playheadNs: 0, view: null, courseLoaded: true, courseLoadedFor: lessonId ?? null, selectedNodeId: null, selectedFrame: null, simSession: get().simSession + 1 })
    player.speedUsPerSec = get().speedUsPerSec
    player.load(sc)
  },
  adoptCourseScenario(sc) {
    // user wants the lesson scenario in the editor: don't restore the stash
    courseStash = null
    remember('wifi-sim.mode', 'edit')
    player.dispose()
    set({ mode: 'edit', scenario: sc, history: historyInit(sc), playing: false, view: null, playheadNs: 0, courseLoaded: false, courseLoadedFor: null, selectedFrame: null })
  },
  setScenario(sc, coalesceKey = null) {
    const h = historyPush(get().history, sc, coalesceKey)
    set({ scenario: h.present, history: h })
  },
  undo() {
    // In course mode `scenario` holds the lesson while the editor's document
    // and its history sit in the stash: an undo there would overwrite the lesson.
    if (get().mode === 'course') return
    const h = historyUndo(get().history)
    if (h === get().history) return
    // the selection may name a node this scenario no longer has
    set({ scenario: h.present, history: h, selectedNodeId: null })
  },
  redo() {
    if (get().mode === 'course') return
    const h = historyRedo(get().history)
    if (h === get().history) return
    set({ scenario: h.present, history: h, selectedNodeId: null })
  },
  select(id) {
    set({ selectedNodeId: get().selectedNodeId === id ? null : id })
  },
  selectFrame(f) {
    set({ selectedFrame: f })
  },
  setSpeed(usPerSec) {
    player.speedUsPerSec = usPerSec
    set({ speedUsPerSec: usPerSec })
  },
}))

player.onError = (msg) => useUi.setState({ simError: msg })

// Restore the remembered mode through setMode itself, so the transition runs
// exactly as it does for a click: simulate loads the player, course parks the
// editor's document in the stash.
const startMode = initialMode()
if (startMode !== 'edit') useUi.getState().setMode(startMode)
