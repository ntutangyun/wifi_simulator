/**
 * Course mode's scene bookkeeping: which lesson the loaded scene belongs to.
 *
 * `courseLoaded` alone is global, so a lesson the reader has merely walked to
 * would render its watch call-outs as "jump there" and seek into the previous
 * lesson's recording — a moment that lesson's prose is not about, when it is
 * in the recording at all. `courseLoadedFor` is what the panel asks instead.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// The store owns a Player at module scope, and a real one spawns the sim Worker
// the moment a scenario is loaded — nothing this test needs.
vi.mock('../../src/player/player', () => ({
  Player: class {
    speedUsPerSec = 1000
    playing = false
    onError: ((msg: string) => void) | null = null
    load(): void {}
    dispose(): void {}
  },
}))

const { useUi } = await import('../../src/ui/store')

const pristine = useUi.getState()

beforeEach(() => {
  useUi.setState(pristine, true)
})

afterEach(() => {
  useUi.setState(pristine, true)
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

  it('loading lesson A and then selecting lesson B leaves B unloaded', () => {
    const base = useUi.getState().scenario
    useUi.getState().setMode('course')
    useUi.getState().selectLesson('uwb-intro')
    useUi.getState().loadCourseScenario({ ...base, seed: 11 }, 'uwb-intro')
    expect(loadedFor('uwb-intro')).toBe(true)

    useUi.getState().selectLesson('uwb-frame')
    // the scene is still on screen — `courseLoaded` is still true — but it is not this lesson's
    expect(useUi.getState().courseLoaded).toBe(true)
    expect(loadedFor('uwb-frame')).toBe(false)
    expect(loadedFor('uwb-intro')).toBe(true)

    useUi.getState().loadCourseScenario({ ...base, seed: 22 }, 'uwb-frame')
    expect(loadedFor('uwb-frame')).toBe(true)
    expect(loadedFor('uwb-intro')).toBe(false)
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
