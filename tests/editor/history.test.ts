import { describe, it, expect } from 'vitest'
import {
  HISTORY_CAP, canRedo, canUndo, historyInit, historyPush, historyRedo, historyUndo,
} from '../../src/editor/history'

describe('history push / undo / redo', () => {
  it('undo restores the previous present and fills the future; redo re-applies', () => {
    const h0 = historyInit('a')
    expect(canUndo(h0)).toBe(false)
    expect(canRedo(h0)).toBe(false)

    const h1 = historyPush(h0, 'b')
    expect(h1.present).toBe('b')
    expect(h1.past).toEqual(['a'])

    const u = historyUndo(h1)
    expect(u.present).toBe('a')
    expect(u.future).toEqual(['b'])
    expect(canUndo(u)).toBe(false)
    expect(canRedo(u)).toBe(true)

    const r = historyRedo(u)
    expect(r.present).toBe('b')
    expect(r.past).toEqual(['a'])
    expect(r.future).toEqual([])
  })

  it('undo with an empty past and redo with an empty future are no-ops', () => {
    const h = historyInit('a')
    expect(historyUndo(h)).toBe(h)
    expect(historyRedo(h)).toBe(h)
  })

  it('a push after an undo drops the redo branch', () => {
    const h = historyUndo(historyPush(historyPush(historyInit('a'), 'b'), 'c'))
    expect(h.future).toEqual(['c'])
    const next = historyPush(h, 'd')
    expect(next.future).toEqual([])
    expect(next.present).toBe('d')
    expect(canRedo(next)).toBe(false)
  })

  it('keeps at most HISTORY_CAP past states, forgetting the oldest', () => {
    let h = historyInit(0)
    for (let i = 1; i <= HISTORY_CAP + 5; i++) h = historyPush(h, i)
    expect(h.present).toBe(HISTORY_CAP + 5)
    expect(h.past.length).toBe(HISTORY_CAP)
    while (canUndo(h)) h = historyUndo(h)
    expect(h.present).toBe(5)
  })
})

describe('history coalescing', () => {
  it('folds a run of pushes sharing one key into a single past entry', () => {
    let h = historyPush(historyInit('a'), 'b')
    h = historyPush(h, 'c', 'drag:1')
    h = historyPush(h, 'd', 'drag:1')
    h = historyPush(h, 'e', 'drag:1')
    expect(h.present).toBe('e')
    expect(h.past).toEqual(['a', 'b'])
    expect(historyUndo(h).present).toBe('b')
  })

  it('a different key starts a new step', () => {
    let h = historyPush(historyInit('a'), 'b', 'drag:1')
    h = historyPush(h, 'c', 'drag:1')
    h = historyPush(h, 'd', 'drag:2')
    expect(h.past).toEqual(['a', 'c'])
    expect(historyUndo(h).present).toBe('c')
  })

  it('an unkeyed push never coalesces', () => {
    let h = historyPush(historyInit('a'), 'b', 'drag:1')
    h = historyPush(h, 'c')
    h = historyPush(h, 'd')
    expect(h.past).toEqual(['a', 'b', 'c'])
  })

  it('an undo ends the run, so the next push with the same key is its own step', () => {
    let h = historyPush(historyInit('a'), 'b', 'drag:1')
    h = historyUndo(h)
    h = historyPush(h, 'c', 'drag:1')
    expect(h.past).toEqual(['a'])
    expect(h.present).toBe('c')
  })
})

describe('history immutability', () => {
  it('pushing the identical reference is a no-op', () => {
    const v = { n: 1 }
    const h = historyInit(v)
    expect(historyPush(h, v)).toBe(h)
    expect(historyPush(h, v, 'k')).toBe(h)
  })

  it('never mutates the history it is given', () => {
    const h = Object.freeze({ ...historyPush(historyInit('a'), 'b'), past: Object.freeze(['a']) as string[] })
    historyPush(h, 'c')
    historyPush(h, 'c', 'k')
    historyUndo(h)
    historyRedo(historyUndo(h))
    expect(h.past).toEqual(['a'])
    expect(h.present).toBe('b')
    expect(h.future).toEqual([])
  })
})
