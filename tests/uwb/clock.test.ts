import { describe, it, expect } from 'vitest'
import { Rng } from '../../src/engine/rng'
import { UwbClock, counterDiff, gaussian } from '../../src/uwb/clock'
import { COUNTER_MOD, RCTU_NS } from '../../src/uwb/phy'

describe('UwbClock', () => {
  it('counts RCTU from its origin at its own rate', () => {
    const c = new UwbClock(10, 1000)
    expect(c.counter(0)).toBe(1000)
    // 1 ms at +10 ppm = 1 000 010 ns of local time
    expect(c.counter(1_000_000)).toBe(1000 + Math.round(1_000_010 / RCTU_NS))
  })
  it('adds measured delay before scaling and wraps at 2^40', () => {
    const c = new UwbClock(0, COUNTER_MOD - 10)
    expect(c.counter(0, 20 * RCTU_NS)).toBe(10)
    expect(counterDiff(10, COUNTER_MOD - 10)).toBe(20)
  })
  it('draws ppm in [−20, 20] and an origin below 2^40, deterministically', () => {
    const a = UwbClock.fromRng(new Rng(1)); const b = UwbClock.fromRng(new Rng(1))
    expect(a.ppm).toBe(b.ppm); expect(a.origin).toBe(b.origin)
    expect(Math.abs(a.ppm)).toBeLessThanOrEqual(20)
    expect(a.origin).toBeLessThan(COUNTER_MOD); expect(Number.isInteger(a.origin)).toBe(true)
    expect(UwbClock.fromRng(new Rng(2), 3.5).ppm).toBe(3.5)
  })
  it('gaussian has zero mean and unit variance over 20 000 draws', () => {
    const r = new Rng(9); let s = 0, s2 = 0; const n = 20_000
    for (let i = 0; i < n; i++) { const g = gaussian(r); s += g; s2 += g * g }
    expect(s / n).toBeCloseTo(0, 1); expect(s2 / n).toBeCloseTo(1, 1)
  })
})
