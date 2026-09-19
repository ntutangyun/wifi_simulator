import { describe, it, expect } from 'vitest'
import { UWB_BAND_MHZ, uwbBandOverlap, uwbBandOverlapMhz, uwbInBandDbm } from '../../src/uwb/phy'

describe('uwb phy · 6 GHz coexistence bands', () => {
  it('channel band edges are centre ± 249.6 MHz', () => {
    expect(UWB_BAND_MHZ[5]).toEqual({ lo: 6240.0, hi: 6739.2 })
    expect(UWB_BAND_MHZ[9]).toEqual({ lo: 7737.6, hi: 8236.8 })
  })

  it('a Wi-Fi channel fully inside the UWB band overlaps 100 %', () => {
    expect(uwbBandOverlap(6305, 80, 5)).toBe(1)
  })

  it('a Wi-Fi channel wholly outside the UWB band overlaps 0 %', () => {
    expect(uwbBandOverlap(5985, 80, 5)).toBe(0)
    expect(uwbBandOverlap(6305, 80, 9)).toBe(0)
  })

  it('a Wi-Fi channel straddling the band edge overlaps by its covered width', () => {
    // [6220, 6300] ∩ [6240, 6739.2] = [6240, 6300] = 60 MHz of 80
    expect(uwbBandOverlapMhz(6260, 80, 5)).toBe(60)
    expect(uwbBandOverlap(6260, 80, 5)).toBe(0.75)
  })

  it('uwbInBandDbm spreads the UWB EIRP over the overlapping width', () => {
    expect(uwbInBandDbm(-14, 80)).toBeCloseTo(-21.95, 2)
    expect(uwbInBandDbm(-14, 0)).toBe(-Infinity)
  })
})
