/**
 * Course mode's scene bookkeeping: which lesson the loaded scene belongs to.
 *
 * `courseLoaded` alone is global, so a lesson the reader has merely walked to
 * would render its watch call-outs as "jump there" and seek into the previous
 * lesson's recording — a moment that lesson's prose is not about, when it is
 * in the recording at all. `courseLoadedFor` is what the panel asks instead.
 *
 * The bookkeeping is only half of it: what the reader is looking at is the
 * scenario the *player* was handed, and this file asserts that too — see the
 * recording stub below and the two claims at the bottom.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import type { Scenario } from '../../src/model/scenario'

/**
 * What the player was actually told to show. The stub used to be
 * `load(): void {}` — it recorded nothing and nothing asserted it was called,
 * so every claim in this file was about a boolean on the panel and none of it
 * was about the screen. The scene the reader watches is the argument of
 * `load`, so the stub keeps it.
 */
const seen = vi.hoisted(() => ({
  /** Scenarios handed to the player, in order. */
  loads: [] as unknown[],
  /** Whether a scene is loaded in the player right now — `load` without a later `dispose`. */
  live: false,
  disposes: 0,
}))

// The store owns a Player at module scope, and a real one spawns the sim Worker
// the moment a scenario is loaded — nothing this test needs.
vi.mock('../../src/player/player', () => ({
  Player: class {
    speedUsPerSec = 1000
    playing = false
    onError: ((msg: string) => void) | null = null
    load(sc: Scenario): void {
      seen.loads.push(sc)
      seen.live = true
    }
    dispose(): void {
      seen.live = false
      seen.disposes += 1
    }
  },
}))

const { useUi } = await import('../../src/ui/store')

/** The scene the player is showing, or null when it has none. */
const onScreen = (): unknown => (seen.live ? seen.loads[seen.loads.length - 1] : null)

const resetPlayer = () => {
  seen.loads.length = 0
  seen.live = false
  seen.disposes = 0
}

const pristine = useUi.getState()

beforeEach(() => {
  useUi.setState(pristine, true)
  resetPlayer()
})

afterEach(() => {
  useUi.setState(pristine, true)
  resetPlayer()
})

/** What the panel asks before it offers "jump there" instead of "load and watch". */
const loadedFor = (lessonId: string): boolean => {
  const s = useUi.getState()
  return s.courseLoaded && s.courseLoadedFor === lessonId
}

describe('course mode · which lesson the loaded scene belongs to', () => {
  it('starts with nothing loaded and no lesson named', () => {
    expect(useUi.getState().courseLoaded).toBe(false)
    expect(useUi.getState().courseLoadedFor).toBeNull()
  })

  it('loading lesson A and then selecting lesson B takes A’s scene off the screen', () => {
    const base = useUi.getState().scenario
    useUi.getState().setMode('course')
    useUi.getState().selectLesson('uwb-intro')
    useUi.getState().loadCourseScenario({ ...base, seed: 11 }, 'uwb-intro')
    expect(loadedFor('uwb-intro')).toBe(true)
    expect(onScreen()).toEqual({ ...base, seed: 11 })

    useUi.getState().selectLesson('uwb-frame')
    // This case used to assert `courseLoaded === true` here and call it "the
    // scene is still on screen", as though it were the design. It was the
    // defect, and the assertion was the defect written down: lesson A's
    // recording under lesson B's panel, which offered "load and watch".
    expect(useUi.getState().courseLoaded).toBe(false)
    expect(loadedFor('uwb-frame')).toBe(false)
    expect(loadedFor('uwb-intro')).toBe(false)
    expect(onScreen()).toBeNull()

    useUi.getState().loadCourseScenario({ ...base, seed: 22 }, 'uwb-frame')
    expect(loadedFor('uwb-frame')).toBe(true)
    expect(loadedFor('uwb-intro')).toBe(false)
    expect(onScreen()).toEqual({ ...base, seed: 22 })
  })

  it('walking back to the lesson the scene belongs to keeps it', () => {
    const base = useUi.getState().scenario
    useUi.getState().setMode('course')
    useUi.getState().selectLesson('uwb-intro')
    useUi.getState().loadCourseScenario({ ...base, seed: 77 }, 'uwb-intro')
    // Re-selecting the lesson that is loaded must not throw its recording
    // away: the panel's call-outs are already offering jumps into it.
    const disposesBefore = seen.disposes
    useUi.getState().selectLesson('uwb-intro')
    expect(seen.disposes).toBe(disposesBefore)
    expect(loadedFor('uwb-intro')).toBe(true)
    expect(onScreen()).toEqual({ ...base, seed: 77 })
  })

  it('a variant of a lesson is still that lesson’s scene', () => {
    const base = useUi.getState().scenario
    useUi.getState().setMode('course')
    useUi.getState().loadCourseScenario({ ...base, seed: 33 }, 'amp-intro')
    useUi.getState().loadCourseScenario({ ...base, seed: 44 }, 'amp-intro')
    expect(loadedFor('amp-intro')).toBe(true)
  })

  it('leaving course mode, and taking a lesson into the editor, forget the lesson', () => {
    const base = useUi.getState().scenario
    useUi.getState().setMode('course')
    useUi.getState().loadCourseScenario({ ...base, seed: 55 }, 'amp-ppdu')
    useUi.getState().setMode('edit')
    expect(useUi.getState().courseLoaded).toBe(false)
    expect(useUi.getState().courseLoadedFor).toBeNull()

    useUi.getState().setMode('course')
    useUi.getState().loadCourseScenario({ ...base, seed: 66 }, 'amp-ppdu')
    useUi.getState().adoptCourseScenario({ ...base, seed: 66 })
    expect(useUi.getState().courseLoaded).toBe(false)
    expect(useUi.getState().courseLoadedFor).toBeNull()
  })
})

/**
 * The two claims about the reader's screen, over the whole course. Until these
 * existed nothing in `tests/ui` asserted that a scene reached the player at
 * all — and the repository has no DOM-rendering test, so this is the only
 * place the path from "load this lesson" to "this is what is drawn" is pinned.
 *
 * How far the first claim reaches, measured rather than assumed: the 83
 * lessons build 57 distinct scenes between them (`radio-primer`,
 * `noise-floor`, `decode-thresholds` and `mcs-ladder` share one, and there are
 * eighteen more such groups), so a deep-equal check cannot tell a lesson from
 * its scene twin. It pins the scene, not the id — the id is what the second
 * assertion in each pass is for.
 */
describe('course mode · the scene on screen is this lesson’s', () => {
  it('hands the player exactly `lesson.scenario()`, for every lesson and every variant', () => {
    useUi.getState().setMode('course')
    for (const l of LESSONS) {
      const scenes: [string, () => Scenario][] = [[l.id, l.scenario]]
      ;(l.variants ?? []).forEach((v, i) => scenes.push([`${l.id}#${i}`, v.scenario]))
      for (const [label, build] of scenes) {
        useUi.getState().loadCourseScenario(build(), l.id)
        expect(onScreen(), label).toEqual(build())
        expect(useUi.getState().courseLoadedFor, label).toBe(l.id)
      }
    }
  })

  it('never leaves another lesson’s scene on screen under an unloaded panel', () => {
    useUi.getState().setMode('course')
    for (let i = 0; i < LESSONS.length; i++) {
      const a = LESSONS[i]
      const b = LESSONS[(i + 1) % LESSONS.length]
      resetPlayer()
      useUi.getState().selectLesson(a.id)
      useUi.getState().loadCourseScenario(a.scenario(), a.id)
      useUi.getState().selectLesson(b.id)
      // "the panel says this lesson is loaded" and "the player is holding a
      // scene" must be true together or false together. They came apart in
      // exactly one direction: the panel offered "load and watch" while the
      // 3-D view, the timeline, the transport, the inspector and the event log
      // were all still showing the previous lesson's recording.
      const s = useUi.getState()
      const panelSaysLoaded = s.courseLoaded && s.courseLoadedFor === b.id
      expect(onScreen() !== null, `${a.id} → ${b.id}`).toBe(panelSaysLoaded)
    }
  })
})
