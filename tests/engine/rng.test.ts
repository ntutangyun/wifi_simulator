import { describe, it, expect } from 'vitest'
import { Rng } from '../../src/engine/rng'

describe('Rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rng(123)
    const b = new Rng(123)
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next())
  })

  it('differs across seeds', () => {
    const a = new Rng(1)
    const b = new Rng(2)
    const sa = Array.from({ length: 10 }, () => a.next())
    const sb = Array.from({ length: 10 }, () => b.next())
    expect(sa).not.toEqual(sb)
  })

  it('int(15) covers [0,15] and stays in range', () => {
    const r = new Rng(7)
    const seen = new Set<number>()
    for (let i = 0; i < 10_000; i++) {
      const v = r.int(15)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(15)
      seen.add(v)
    }
    expect(seen.has(0)).toBe(true)
    expect(seen.has(15)).toBe(true)
  })

  it('forked streams are independent and deterministic', () => {
    const root = new Rng(42)
    const f1 = root.fork(1)
    const f2 = root.fork(2)
    const s1 = Array.from({ length: 20 }, () => f1.next())
    const s2 = Array.from({ length: 20 }, () => f2.next())
    expect(s1).not.toEqual(s2)
    const again = new Rng(42).fork(1)
    expect(Array.from({ length: 20 }, () => again.next())).toEqual(s1)
  })
})
