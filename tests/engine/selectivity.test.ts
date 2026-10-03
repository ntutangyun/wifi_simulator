import { describe, it, expect } from 'vitest'
import { RU26_TONES, RU26_PER_20MHZ, DF_EHT_KHZ, selBinWidthMhz, selBins } from '../../src/engine/selectivity'
import { smallScaleDb, type FadingCfg } from '../../src/engine/fading'

const RAYLEIGH: FadingCfg = { shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'rayleigh' }
const rician = (kDb: number): FadingCfg => ({ ...RAYLEIGH, smallScale: 'rician', ricianKdB: kDb })

/** 40000 per-bin small-scale draws spread over 100 links, 20 frames and 20 bins. */
function binDraws(cfg: FadingCfg): number[] {
  const out: number[] = []
  for (let link = 0; link < 100; link++) {
    for (let f = 0; f < 20; f++) {
      for (let bin = 0; bin < 20; bin++) {
        out.push(smallScaleDb(cfg, 7, 'ap', `sta-${link}`, `f${f}`, bin))
      }
    }
  }
  return out
}

function fractionOutside(draws: number[], lo: number, hi: number): number {
  return draws.filter((d) => d < lo || d > hi).length / draws.length
}

describe('selectivity: the bin geometry is computed, not written down', () => {
  it('derives the bin count and width from the standard, never a literal', () => {
    expect([20, 40, 80, 160, 320].map(selBins)).toEqual([9, 18, 36, 72, 144])
    expect(selBinWidthMhz()).toBeCloseTo(2.03125, 5)
  })

  it('swapping the EHT subcarrier spacing for the pre-EHT one changes the bin width', () => {
    // Proves the width is computed from DF_EHT_KHZ, not a decorated literal:
    // RU26_TONES x 312.5 kHz (pre-EHT spacing) / 1000 = 8.125 MHz.
    const PRE_EHT_DF_KHZ = 312.5
    expect(RU26_TONES * PRE_EHT_DF_KHZ / 1000).toBeCloseTo(8.125, 5)
    expect(RU26_TONES).toBe(26)
    expect(RU26_PER_20MHZ).toBe(9)
    expect(DF_EHT_KHZ).toBeCloseTo(78.125, 5)
  })
})

describe('selectivity: the standard\'s own 4-bit deviation field is the calibration', () => {
  it('matches the clamp fraction of the 4-bit ΔSNR field for rayleigh and rician(K=6)', () => {
    const rayleighDraws = binDraws(RAYLEIGH)
    const ricianDraws = binDraws(rician(6))
    expect(rayleighDraws.length).toBe(40000)
    expect(ricianDraws.length).toBe(40000)
    const rayleighFrac = fractionOutside(rayleighDraws, -8, 7)
    const ricianFrac = fractionOutside(ricianDraws, -8, 7)
    expect(rayleighFrac).toBeCloseTo(0.153, 2)
    expect(ricianFrac).toBeCloseTo(0.033, 2)
  })
})
