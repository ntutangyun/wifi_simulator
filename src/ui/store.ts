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
  /**
   * Increments whenever something asks for the 3-D view to be *on screen*.
   *
   * Deliberately not `simSession`, and the two are not interchangeable:
   * `simSession` keys the scene rebuild (`<Viewport key={…simSession}>` in
   * `App.tsx`), so every bump of it throws the scene away and puts the camera
   * back at its starting position. "Bring the view on screen" must not do that —
   * a jump that reset the camera would be a worse defect than the one it fixed,
   * and harder to notice. So loading a lesson's scenario bumps both (it really
   * does start a new run) while a jump bumps only this one.
   */
  viewRequest: number
  /**
   * Ask the single-column shell to show the 3-D view instead of the prose.
   *
   * The store says *what happened*, not which pane is up: `pane` is local state
   * in `App.tsx` and stays there. This is the signal a jump had no way to send —
   * `player.seekFirst` moves the playhead and touches no store field at all.
   */
  requestView(): void
  /**
   * The `seq` of the record a course jump landed on, or null.
   *
   * The second signal a jump had no way to send, and for the same reason as
   * `viewRequest`: moving the playhead says *when*, and the event log needs to
   * know *which row*. One instant can carry dozens of records — the first data
   * frame of `radio-primer` shares its nanosecond with 45 others and is the
   * 43rd of them — so the time the playhead holds cannot pick the row the
   * reader clicked, and before this field the log sometimes did not render that
   * row at all (`src/ui/eventLogWindow.ts` has the census).
   *
   * Navigation does not have to clear it: `pickLogRows` honours it only while
   * the playhead is still on that record's own instant, so a step, a seek or a
   * second of playback releases it without a write.
   *
   * A **new run** is the one case that does, and it is not optional: `seq`
   * restarts at 0 for every simulation, so a seq left over from the last
   * recording would name a real, different record in this one. Every site that
   * replaces the run already resets `playheadNs` to 0, so the reset rides along
   * with that one — seven of them, and a new one that forgets this is a new one
   * that forgets the playhead too, which is far louder.
   */
  jumpSeq: number | null
  /** Record which row a jump landed on; null when the jump found nothing. */
  markJump(seq: number | null): void
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
  playheadNs: 0, jumpSeq: null,
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
      set({ simError: null, playheadNs: 0, jumpSeq: null, view: null, selectedFrame: null })
      player.speedUsPerSec = get().speedUsPerSec
      player.load(get().scenario)
      set({ mode: m, simSession: get().simSession + 1 })
    } else if (m === 'course') {
      courseStash = { scenario: get().scenario, history: get().history }
      player.dispose()
      set({ mode: m, playing: false, view: null, playheadNs: 0, jumpSeq: null, courseLoaded: false, courseLoadedFor: null, simError: null, selectedFrame: null })
    } else {
      // The banner belongs to the run that raised it: leaving it up over the
      // editor would show the learner a complaint about a plan they are in the
      // middle of fixing, beside the live one the session section already draws.
      player.dispose()
      set({ mode: m, playing: false, view: null, playheadNs: 0, jumpSeq: null, courseLoaded: false, courseLoadedFor: null, simError: null, selectedFrame: null })
    }
  },
  courseLessonId: initialLesson(),
  courseLoaded: false,
  courseLoadedFor: null,
  simSession: 0,
  viewRequest: 0,
  requestView() {
    set({ viewRequest: get().viewRequest + 1 })
  },
  markJump(seq) {
    set({ jumpSeq: seq })
  },
  selectLesson(id) {
    remember('wifi-sim.lesson', id)
    // Walking to another lesson has to take the previous lesson's scene with
    // it. This used to write `courseLessonId` alone, and `courseLoadedFor`
    // then caught only what it was added for: the panel offered "load and
    // watch" while the 3-D view, the timeline, the transport, the inspector
    // and the event log all still held the lesson the reader had left — so a
    // reader counting what `observe` told them to count was counting another
    // lesson's recording. The clearing is the one `setMode('course')` already
    // does, and the principle is the one `CoursePanel`'s `loaded` already
    // states: a scene belongs to the lesson it was loaded for.
    //
    // `null` is the catalogue, and it is excluded on purpose: the catalogue
    // makes no claim about any scene, and stepping out to it to find the next
    // lesson is not a reason to lose the recording of the one being read —
    // a reader who walks out and back in gets their scene, not a reload.
    if (id !== null && id !== get().courseLoadedFor) {
      player.dispose()
      set({ courseLessonId: id, courseLoaded: false, courseLoadedFor: null, playing: false, view: null, playheadNs: 0, jumpSeq: null, simError: null, selectedFrame: null })
    } else set({ courseLessonId: id })
  },
  loadCourseScenario(sc, lessonId) {
    player.dispose()
    // A lesson scenario is transient course state, not an edit: the editor is
    // unmounted and its history stays parked in courseStash until it returns.
    // Both counters: this really is a new run (`simSession`, which rebuilds the
    // scene) and the reader has to be taken to it (`viewRequest`). The two other
    // writers of `simSession` bump it alone on purpose — `setMode` leaves the
    // reader where the mode puts them, and no mode but `course` has two panes.
    set({ scenario: sc, simError: null, playheadNs: 0, jumpSeq: null, view: null, courseLoaded: true, courseLoadedFor: lessonId ?? null, selectedNodeId: null, selectedFrame: null, simSession: get().simSession + 1, viewRequest: get().viewRequest + 1 })
    player.speedUsPerSec = get().speedUsPerSec
    player.load(sc)
  },
  adoptCourseScenario(sc) {
    // user wants the lesson scenario in the editor: don't restore the stash
    courseStash = null
    remember('wifi-sim.mode', 'edit')
    player.dispose()
    set({ mode: 'edit', scenario: sc, history: historyInit(sc), playing: false, view: null, playheadNs: 0, jumpSeq: null, courseLoaded: false, courseLoadedFor: null, selectedFrame: null })
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
