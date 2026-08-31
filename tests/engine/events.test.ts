import { describe, it, expect } from 'vitest'
import { EventQueue } from '../../src/engine/events'

describe('EventQueue', () => {
  it('pops in time order', () => {
    const q = new EventQueue()
    const out: string[] = []
    q.schedule(30, () => out.push('c'))
    q.schedule(10, () => out.push('a'))
    q.schedule(20, () => out.push('b'))
    for (let e = q.pop(); e; e = q.pop()) e.fn()
    expect(out).toEqual(['a', 'b', 'c'])
  })

  it('breaks equal-time ties by insertion order', () => {
    const q = new EventQueue()
    const out: string[] = []
    q.schedule(5, () => out.push('first'))
    q.schedule(5, () => out.push('second'))
    q.schedule(5, () => out.push('third'))
    for (let e = q.pop(); e; e = q.pop()) e.fn()
    expect(out).toEqual(['first', 'second', 'third'])
  })

  it('skips cancelled events and updates peekTime', () => {
    const q = new EventQueue()
    const out: string[] = []
    const h = q.schedule(1, () => out.push('cancelled'))
    q.schedule(2, () => out.push('kept'))
    q.cancel(h)
    expect(q.peekTime()).toBe(2)
    for (let e = q.pop(); e; e = q.pop()) e.fn()
    expect(out).toEqual(['kept'])
  })

  it('supports scheduling from inside a popped event', () => {
    const q = new EventQueue()
    const out: number[] = []
    q.schedule(1, () => {
      out.push(1)
      q.schedule(2, () => out.push(2))
    })
    for (let e = q.pop(); e; e = q.pop()) e.fn()
    expect(out).toEqual([1, 2])
    expect(q.size).toBe(0)
  })
})
