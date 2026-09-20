import { describe, it, expect } from 'vitest'
import { clampColumnWidth } from '../../src/ui/columnResize'

const limits = { min: 240, max: 900, reserve: 660 }

describe('clampColumnWidth', () => {
  it('keeps a width inside the range unchanged', () => {
    expect(clampColumnWidth(340, limits, 1600)).toBe(340)
  })
  it('never goes below min, even on a tiny viewport', () => {
    expect(clampColumnWidth(100, limits, 1600)).toBe(240)
    expect(clampColumnWidth(340, limits, 500)).toBe(240)
  })
  it('caps at max on a wide viewport', () => {
    expect(clampColumnWidth(5000, limits, 3000)).toBe(900)
  })
  it('leaves the reserve for the rest of the layout on a narrow viewport', () => {
    // 1200 − 660 = 540 is the most the column may take
    expect(clampColumnWidth(800, limits, 1200)).toBe(540)
  })
  it('falls back to min for a non-numeric stored value', () => {
    expect(clampColumnWidth(Number.NaN, limits, 1600)).toBe(240)
  })
  it('rounds to whole pixels', () => {
    expect(clampColumnWidth(340.6, limits, 1600)).toBe(341)
  })
})
