import { describe, it, expect } from 'vitest'
import { FADING_DEFAULTS, fadingDb, shadowDb, smallScaleDb, type FadingCfg } from '../../src/engine/fading'

/** Fading off: the default a scenario without a `fading` section gets. */
const OFF: FadingCfg = { shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'none', ricianKdB: 0 }
/** Shadowing only, so the slow layer can be measured without the fast one on top. */
const SHADOW: FadingCfg = { ...FADING_DEFAULTS, smallScale: 'none' }
/** Small-scale only, so the fast layer can be measured without the slow one under it. */
const RAYLEIGH: FadingCfg = { ...FADING_DEFAULTS, shadowSigmaDb: 0, smallScale: 'rayleigh' }
const rician = (kDb: number): FadingCfg => ({ ...RAYLEIGH, smallScale: 'rician', ricianKdB: kDb })

const coherenceNs = FADING_DEFAULTS.coherenceMs * 1e6

/** Sample standard deviation, and the mean it was taken about. */
function stats(xs: number[]): { mean: number, sd: number } {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  const varc = xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (xs.length - 1)
  return { mean, sd: Math.sqrt(varc) }
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** 20000 shadow draws spread over 100 links and 200 coherence intervals. */
function shadowDraws(cfg: FadingCfg): number[] {
  const out: number[] = []
  for (let link = 0; link < 100; link++) {
    for (let iv = 0; iv < 200; iv++) out.push(shadowDb(cfg, 7, 'ap', `sta-${link}`, iv * coherenceNs))
  }
  return out
}

/** 20000 small-scale draws spread over 100 links and 200 frames. */
function fastDraws(cfg: FadingCfg): number[] {
  const out: number[] = []
  for (let link = 0; link < 100; link++) {
    for (let f = 0; f < 200; f++) out.push(smallScaleDb(cfg, 7, 'ap', `sta-${link}`, `f${f}`))
  }
  return out
}

describe('fading: the draw is a pure function of its inputs', () => {
  it('is pure: the same inputs give the same value, a hundred times over', () => {
    const v = shadowDb(SHADOW, 7, 'ap', 'sta-1', 1_000_000)
    for (let i = 0; i < 100; i++) {
      expect(shadowDb(SHADOW, 7, 'ap', 'sta-1', 1_000_000)).toBe(v)
    }
    const f = smallScaleDb(RAYLEIGH, 7, 'ap', 'sta-1', 'frame-42')
    for (let i = 0; i < 100; i++) {
      expect(smallScaleDb(RAYLEIGH, 7, 'ap', 'sta-1', 'frame-42')).toBe(f)
    }
  })

  it('holds the shadow steady inside one coherence interval and changes across', () => {
    const a = shadowDb(SHADOW, 7, 'ap', 'sta-1', 0)
    expect(shadowDb(SHADOW, 7, 'ap', 'sta-1', coherenceNs - 1)).toBe(a)
    expect(shadowDb(SHADOW, 7, 'ap', 'sta-1', coherenceNs + 1)).not.toBe(a)
  })

  it('holds the small-scale fade steady for one frame and changes between frames', () => {
    const a = smallScaleDb(RAYLEIGH, 7, 'ap', 'sta-1', 'f1')
    expect(smallScaleDb(RAYLEIGH, 7, 'ap', 'sta-1', 'f1')).toBe(a)
    expect(smallScaleDb(RAYLEIGH, 7, 'ap', 'sta-1', 'f2')).not.toBe(a)
  })

  it('gives different links different fades', () => {
    expect(shadowDb(SHADOW, 7, 'ap', 'sta-1', 0)).not.toBe(shadowDb(SHADOW, 7, 'ap', 'sta-2', 0))
    expect(smallScaleDb(RAYLEIGH, 7, 'ap', 'sta-1', 'f1'))
      .not.toBe(smallScaleDb(RAYLEIGH, 7, 'ap', 'sta-2', 'f1'))
  })

  it('gives a link its own fade in each direction', () => {
    expect(shadowDb(SHADOW, 7, 'ap', 'sta-1', 0)).not.toBe(shadowDb(SHADOW, 7, 'sta-1', 'ap', 0))
  })

  it('gives different seeds different fades', () => {
    expect(shadowDb(SHADOW, 7, 'ap', 'sta-1', 0)).not.toBe(shadowDb(SHADOW, 8, 'ap', 'sta-1', 0))
    expect(smallScaleDb(RAYLEIGH, 7, 'ap', 'sta-1', 'f1'))
      .not.toBe(smallScaleDb(RAYLEIGH, 8, 'ap', 'sta-1', 'f1'))
  })

  it('is off when it is off', () => {
    expect(fadingDb(OFF, 7, 'ap', 'sta-1', 0, 'f1')).toBe(0)
    expect(shadowDb(OFF, 7, 'ap', 'sta-1', 12_345_678)).toBe(0)
    expect(smallScaleDb(OFF, 7, 'ap', 'sta-1', 'f9')).toBe(0)
  })

  it('adds the two layers, so either alone is the whole answer', () => {
    const both = fadingDb(FADING_DEFAULTS, 7, 'ap', 'sta-1', 5_000_000, 'f3')
    const slow = shadowDb(FADING_DEFAULTS, 7, 'ap', 'sta-1', 5_000_000)
    const fast = smallScaleDb(FADING_DEFAULTS, 7, 'ap', 'sta-1', 'f3')
    expect(both).toBeCloseTo(slow + fast, 12)
  })
})

describe('fading: the distributions have the shape they claim', () => {
  it('has roughly the standard deviation it was asked for', () => {
    const { mean, sd } = stats(shadowDraws(SHADOW))
    expect(Math.abs(sd - SHADOW.shadowSigmaDb)).toBeLessThan(0.1 * SHADOW.shadowSigmaDb)
    expect(Math.abs(mean)).toBeLessThan(0.2)
  })

  it('scales the shadow with the sigma it is given', () => {
    const wide = stats(shadowDraws({ ...SHADOW, shadowSigmaDb: 8 })).sd
    expect(Math.abs(wide - 8)).toBeLessThan(0.8)
  })

  it('rayleigh is mostly a small loss with an occasional deep one', () => {
    const draws = fastDraws(RAYLEIGH)
    expect(Math.abs(median(draws) - -1.59)).toBeLessThan(0.2)
    expect(draws.filter((d) => d < -10).length).toBeGreaterThan(0)
  })

  it('leaves the mean power untouched, so 0 dB is no fading', () => {
    const linear = fastDraws(RAYLEIGH).map((d) => 10 ** (d / 10))
    const mean = linear.reduce((a, b) => a + b, 0) / linear.length
    expect(mean).toBeGreaterThan(0.95)
    expect(mean).toBeLessThan(1.05)
  })

  it('rician with a high K factor barely moves', () => {
    const wide = stats(fastDraws(rician(0))).sd
    const narrow = stats(fastDraws(rician(20))).sd
    expect(narrow).toBeLessThan(wide / 4)
    expect(narrow).toBeLessThan(1)
  })

  it('rician at a low K factor is nearly rayleigh', () => {
    const k = stats(fastDraws(rician(-20))).sd
    const r = stats(fastDraws(RAYLEIGH)).sd
    expect(Math.abs(k - r)).toBeLessThan(0.5)
  })
})

describe('FADING_DEFAULTS', () => {
  it('are the figures the design picked from the indoor measurement ranges', () => {
    expect(FADING_DEFAULTS).toEqual({
      shadowSigmaDb: 4, coherenceMs: 100, smallScale: 'rayleigh', ricianKdB: 6,
    })
  })
})
