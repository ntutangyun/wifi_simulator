/**
 * Undo/redo for a single document value: past states, the present one, and the
 * states an undo has pushed into the future. Pure and immutable — no React and
 * no store — so the editor's history is testable on its own.
 */

export interface History<T> {
  past: T[]
  present: T
  future: T[]
  /** Coalesce key of the entry that produced `present`, or null. */
  key: string | null
}

/** Deepest undo we keep; beyond it the oldest states are forgotten. */
export const HISTORY_CAP = 100

export function historyInit<T>(present: T): History<T> {
  return { past: [], present, future: [], key: null }
}

/**
 * Push a new present. A non-null `key` equal to the key that produced the
 * current present replaces it in place instead of growing `past`, which is how
 * a pointer drag — hundreds of commits — folds into one undo step.
 */
export function historyPush<T>(h: History<T>, next: T, key: string | null = null): History<T> {
  if (next === h.present) return h
  if (key !== null && key === h.key) {
    return { past: h.past, present: next, future: [], key }
  }
  const past = [...h.past, h.present]
  if (past.length > HISTORY_CAP) past.splice(0, past.length - HISTORY_CAP)
  return { past, present: next, future: [], key }
}

export function historyUndo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h
  const past = h.past.slice(0, -1)
  const present = h.past[h.past.length - 1]
  // key is dropped so the next push starts a fresh step even mid-drag
  return { past, present, future: [h.present, ...h.future], key: null }
}

export function historyRedo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h
  const [present, ...future] = h.future
  return { past: [...h.past, h.present], present, future, key: null }
}

export const canUndo = (h: History<unknown>) => h.past.length > 0
export const canRedo = (h: History<unknown>) => h.future.length > 0
