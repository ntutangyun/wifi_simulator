import { create } from 'zustand'
import { Player } from '../player/player'
import type { FrameDesc } from '../model/frames'
import { ScenarioSchema, defaultScenario, type Scenario } from '../model/scenario'
import type { Ns } from '../model/types'
import type { ViewState } from '../model/view'

export type Lang = 'en' | 'zh'

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
  lang: Lang
  setLang(l: Lang): void
  scenario: Scenario
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
  /** Increments whenever a new simulation is (re)started — keys scene rebuilds. */
  simSession: number
  selectLesson(id: string | null): void
  loadCourseScenario(sc: Scenario): void
  adoptCourseScenario(sc: Scenario): void
  setScenario(sc: Scenario): void
  select(id: string | null): void
  selectFrame(f: FrameSelection | null): void
  setSpeed(usPerSec: number): void
}

let courseStash: Scenario | null = null

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

function initialLang(): Lang {
  try {
    const l = typeof localStorage !== 'undefined' ? localStorage.getItem('wifi-sim.lang') : null
    if (l === 'zh' || l === 'en') return l
  } catch {
    // default below
  }
  return 'zh'
}

export const useUi = create<UiState>((set, get) => ({
  mode: 'edit',
  lang: initialLang(),
  setLang(l) {
    try {
      localStorage.setItem('wifi-sim.lang', l)
    } catch {
      // storage unavailable — keep in-memory only
    }
    set({ lang: l })
  },
  scenario: initialScenario(),
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
    // leaving course mode restores the scenario the user had before
    if (prev === 'course' && courseStash !== null) {
      set({ scenario: courseStash })
      courseStash = null
    }
    if (m === 'simulate') {
      player.dispose()
      set({ simError: null, playheadNs: 0, view: null, selectedFrame: null })
      player.speedUsPerSec = get().speedUsPerSec
      player.load(get().scenario)
      set({ mode: m, simSession: get().simSession + 1 })
    } else if (m === 'course') {
      courseStash = get().scenario
      player.dispose()
      set({ mode: m, playing: false, view: null, playheadNs: 0, courseLoaded: false, simError: null, selectedFrame: null })
    } else {
      player.dispose()
      set({ mode: m, playing: false, view: null, playheadNs: 0, courseLoaded: false, selectedFrame: null })
    }
  },
  courseLessonId: null,
  courseLoaded: false,
  simSession: 0,
  selectLesson(id) {
    set({ courseLessonId: id })
  },
  loadCourseScenario(sc) {
    player.dispose()
    set({ scenario: sc, simError: null, playheadNs: 0, view: null, courseLoaded: true, selectedNodeId: null, selectedFrame: null, simSession: get().simSession + 1 })
    player.speedUsPerSec = get().speedUsPerSec
    player.load(sc)
  },
  adoptCourseScenario(sc) {
    // user wants the lesson scenario in the editor: don't restore the stash
    courseStash = null
    player.dispose()
    set({ mode: 'edit', scenario: sc, playing: false, view: null, playheadNs: 0, courseLoaded: false, selectedFrame: null })
  },
  setScenario(sc) {
    set({ scenario: sc })
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
