import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// The store owns a Player at module scope, and a real one spawns the sim Worker
// the moment a mode change loads a scenario — nothing this test needs.
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
const { canRedo, canUndo } = await import('../../src/editor/history')

const pristine = useUi.getState()

beforeEach(() => {
  useUi.setState(pristine, true)
})

afterEach(() => {
  useUi.setState(pristine, true)
})

/** Two edits of the initial scenario, distinct objects with distinct contents. */
function edits() {
  const base = useUi.getState().scenario
  return { base, one: { ...base, seed: 101 }, two: { ...base, seed: 202 } }
}

describe('store undo / redo', () => {
  it('starts with nothing to undo or redo', () => {
    const { history } = useUi.getState()
    expect(canUndo(history)).toBe(false)
    expect(canRedo(history)).toBe(false)
  })

  it('walks back and forward through two edits', () => {
    const { base, one, two } = edits()
    useUi.getState().setScenario(one)
    useUi.getState().setScenario(two)
    expect(useUi.getState().scenario).toBe(two)

    useUi.getState().undo()
    expect(useUi.getState().scenario).toBe(one)
    useUi.getState().undo()
    expect(useUi.getState().scenario).toBe(base)
    expect(canUndo(useUi.getState().history)).toBe(false)

    useUi.getState().redo()
    expect(useUi.getState().scenario).toBe(one)
    useUi.getState().redo()
    expect(useUi.getState().scenario).toBe(two)
    expect(canRedo(useUi.getState().history)).toBe(false)
  })

  it('folds edits sharing a coalesce key into one step', () => {
    const { base, one, two } = edits()
    useUi.getState().setScenario(one, 'drag:1')
    useUi.getState().setScenario(two, 'drag:1')
    useUi.getState().undo()
    expect(useUi.getState().scenario).toBe(base)
  })

  it('drops the node selection on undo, since it may name a node that is gone', () => {
    const { one } = edits()
    useUi.getState().setScenario(one)
    useUi.setState({ selectedNodeId: 'ap' })
    useUi.getState().undo()
    expect(useUi.getState().selectedNodeId).toBeNull()
  })

  it('a visit to course mode gives the editor its document and its undo depth back', () => {
    const { base, one, two } = edits()
    useUi.getState().setScenario(one)
    useUi.getState().setScenario(two)

    useUi.getState().setMode('course')
    useUi.getState().loadCourseScenario({ ...base, seed: 909 })
    expect(useUi.getState().scenario.seed).toBe(909)

    useUi.getState().setMode('edit')
    expect(useUi.getState().scenario).toBe(two)
    useUi.getState().undo()
    expect(useUi.getState().scenario).toBe(one)
    useUi.getState().undo()
    expect(useUi.getState().scenario).toBe(base)
  })

  it('undo and redo are inert while a lesson is loaded, so they never overwrite it', () => {
    const { base, one } = edits()
    useUi.getState().setScenario(one)
    useUi.getState().setMode('course')
    const lesson = { ...base, seed: 909 }
    useUi.getState().loadCourseScenario(lesson)

    useUi.getState().undo()
    expect(useUi.getState().scenario).toBe(lesson)
    useUi.getState().redo()
    expect(useUi.getState().scenario).toBe(lesson)

    useUi.getState().setMode('edit')
    expect(useUi.getState().scenario).toBe(one)
    useUi.getState().undo()
    expect(useUi.getState().scenario).toBe(base)
  })

  it('adopting a course scenario starts a fresh history and drops the parked one', () => {
    const { one, two } = edits()
    useUi.getState().setScenario(one)
    expect(canUndo(useUi.getState().history)).toBe(true)

    useUi.getState().setMode('course')
    useUi.getState().adoptCourseScenario(two)
    expect(useUi.getState().scenario).toBe(two)
    expect(canUndo(useUi.getState().history)).toBe(false)
    useUi.getState().undo()
    expect(useUi.getState().scenario).toBe(two)
  })

  it('a round trip through simulate mode keeps the history', () => {
    const { base, one } = edits()
    useUi.getState().setScenario(one)
    useUi.getState().setMode('simulate')
    useUi.getState().setMode('edit')
    expect(canUndo(useUi.getState().history)).toBe(true)
    useUi.getState().undo()
    expect(useUi.getState().scenario).toBe(base)
  })
})
