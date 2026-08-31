import { create } from 'zustand'
import { Player } from '../player/player'
import { ScenarioSchema, defaultScenario, type Scenario } from '../model/scenario'
import type { Ns } from '../model/types'
import type { ViewState } from '../model/view'

export type Lang = 'en' | 'zh'

export interface UiState {
  mode: 'edit' | 'simulate'
  lang: Lang
  setLang(l: Lang): void
  scenario: Scenario
  playheadNs: Ns
  playing: boolean
  buffering: boolean
  speedUsPerSec: number
  view: ViewState | null
  selectedNodeId: string | null
  simError: string | null
  setMode(m: 'edit' | 'simulate'): void
  setScenario(sc: Scenario): void
  select(id: string | null): void
  setSpeed(usPerSec: number): void
}

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
  simError: null,
  setMode(m) {
    if (m === get().mode) return
    if (m === 'simulate') {
      set({ simError: null, playheadNs: 0, view: null })
      player.speedUsPerSec = get().speedUsPerSec
      player.load(get().scenario)
      set({ mode: m })
    } else {
      player.dispose()
      set({ mode: m, playing: false, view: null, playheadNs: 0 })
    }
  },
  setScenario(sc) {
    set({ scenario: sc })
  },
  select(id) {
    set({ selectedNodeId: get().selectedNodeId === id ? null : id })
  },
  setSpeed(usPerSec) {
    player.speedUsPerSec = usPerSec
    set({ speedUsPerSec: usPerSec })
  },
}))

player.onError = (msg) => useUi.setState({ simError: msg })
