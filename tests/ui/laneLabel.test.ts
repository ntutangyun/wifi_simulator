import { describe, it, expect } from 'vitest'
import { fitLaneLabel } from '../../src/ui/laneLayout'

// 6 px per character stands in for canvas text measurement
const px = (s: string) => s.length * 6

describe('fitLaneLabel', () => {
  it('returns the whole label when it fits', () => {
    expect(fitLaneLabel('Laptop (MLO)', ' · 6G', 200, px)).toBe('Laptop (MLO) · 6G')
    expect(fitLaneLabel('AP', '', 200, px)).toBe('AP')
  })

  it('shortens the name but never the band suffix, so the two MLO lanes stay distinguishable', () => {
    const six = fitLaneLabel('Laptop (MLO)', ' · 6G', 14 * 6, px)
    const five = fitLaneLabel('Laptop (MLO)', ' · 5G', 14 * 6, px)
    expect(six.endsWith(' · 6G')).toBe(true)
    expect(five.endsWith(' · 5G')).toBe(true)
    expect(six).not.toBe(five)
    expect(px(six)).toBeLessThanOrEqual(14 * 6)
    expect(six).toBe('Laptop (…' + ' · 6G')
  })

  it('keeps the suffix even when there is room for nothing else', () => {
    expect(fitLaneLabel('Laptop (MLO)', ' · 6G', 6 * 6, px)).toBe('… · 6G')
  })
})
