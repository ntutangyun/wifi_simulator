/**
 * Where a refresh puts the user. The shell used to open in the editor every
 * time, so reloading the page in the middle of a lesson threw away both the
 * lesson and the reason the page was open. The mode and the open lesson are
 * remembered in localStorage and restored through `setMode`, so the restored
 * transition is the same one a click performs.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

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

/** The tests run on node, which has no Web Storage: this is the whole of what the store uses. */
function stubStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed))
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
  vi.stubGlobal('localStorage', storage)
  return map
}

/** A fresh copy of the store, built against whatever is in storage right now. */
async function freshStore() {
  vi.resetModules()
  return (await import('../../src/ui/store')).useUi
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('the shell reopens where the user left it', () => {
  it('opens in the editor when nothing was remembered', async () => {
    stubStorage()
    const useUi = await freshStore()
    expect(useUi.getState().mode).toBe('edit')
    expect(useUi.getState().courseLessonId).toBeNull()
  })

  it('reopens course mode on the lesson that was open', async () => {
    stubStorage({ 'wifi-sim.mode': 'course', 'wifi-sim.lesson': 'nav' })
    const useUi = await freshStore()
    expect(useUi.getState().mode).toBe('course')
    expect(useUi.getState().courseLessonId).toBe('nav')
  })

  it('reopens simulate mode', async () => {
    stubStorage({ 'wifi-sim.mode': 'simulate' })
    const useUi = await freshStore()
    expect(useUi.getState().mode).toBe('simulate')
  })

  it('falls back to the editor for a value that is not a mode', async () => {
    stubStorage({ 'wifi-sim.mode': 'course-mode-2' })
    const useUi = await freshStore()
    expect(useUi.getState().mode).toBe('edit')
  })

  it('remembers a lesson id the course no longer has, and the panel shows the catalogue for it', async () => {
    stubStorage({ 'wifi-sim.mode': 'course', 'wifi-sim.lesson': 'no-such-lesson' })
    const useUi = await freshStore()
    // The store keeps the id; CoursePanel resolves it with `?? null`, which is the catalogue.
    expect(useUi.getState().courseLessonId).toBe('no-such-lesson')
  })
})

describe('what the shell writes down', () => {
  it('records each mode the user switches to', async () => {
    const map = stubStorage()
    const useUi = await freshStore()
    useUi.getState().setMode('course')
    expect(map.get('wifi-sim.mode')).toBe('course')
    useUi.getState().setMode('simulate')
    expect(map.get('wifi-sim.mode')).toBe('simulate')
    useUi.getState().setMode('edit')
    expect(map.get('wifi-sim.mode')).toBe('edit')
  })

  it('records the lesson opened and forgets it on the way back to the catalogue', async () => {
    const map = stubStorage()
    const useUi = await freshStore()
    useUi.getState().setMode('course')
    useUi.getState().selectLesson('backoff')
    expect(map.get('wifi-sim.lesson')).toBe('backoff')
    useUi.getState().selectLesson(null)
    expect(map.has('wifi-sim.lesson')).toBe(false)
  })

  it('taking a lesson scene into the editor is remembered as the editor', async () => {
    const map = stubStorage({ 'wifi-sim.mode': 'course', 'wifi-sim.lesson': 'nav' })
    const useUi = await freshStore()
    const sc = useUi.getState().scenario
    useUi.getState().adoptCourseScenario(sc)
    expect(useUi.getState().mode).toBe('edit')
    expect(map.get('wifi-sim.mode')).toBe('edit')
  })

  it('survives storage that throws, in memory only', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
      removeItem: () => { throw new Error('denied') },
    })
    const useUi = await freshStore()
    expect(useUi.getState().mode).toBe('edit')
    expect(() => useUi.getState().setMode('course')).not.toThrow()
    expect(useUi.getState().mode).toBe('course')
  })
})
