/**
 * The two fading layers as distributions, not as one draw: 200 000 samples each.
 *
 * **Why this file exists, and it is not coverage.** `engine/fading.ts`'s docblock said, for as
 * long as the file has existed, that the small-scale layer is 「scaled so that `E[|h|²] = 1` and
 * the layer therefore averages 0 dB」. The first half is right and the second is a mistake, and it
 * is Jensen's inequality: `10·log10` is concave, so `E[log X]` sits strictly below `log E[X]`
 * whenever X is not a constant. Measured below: Rayleigh averages **−2.514 dB** and Rician at
 * K = 6 dB averages **−0.959 dB**, while the log-normal shadow — drawn in dB to begin with —
 * really is zero-mean. So **turning Rayleigh on does not merely add variance to a link, it
 * lowers that link's mean level by 2.51 dB**, and that is one half of why the `fading` lesson's
 * conclusion comes out the way it does.
 *
 * Instrument for every figure here, stated once: the pure functions `smallScaleDb` and
 * `shadowDb`, seed 7, link `ap > sta-1`, 200 000 draws, a fresh key each time (`f0`…`f199999`
 * for the fast layer, interval `i` at `i · 100 ms` for the slow one). Nothing in this file runs
 * a simulation, so no scenario, seed or duration can move these numbers — which is the point of
 * measuring the layer before measuring what a MAC does with it.
 *
 * Tolerances are stated as ± on a figure measured with THIS instrument, not as a confidence
 * interval: the draws are a pure hash of the key, so the numbers are exact and repeatable, and
 * the slack is there only so that a change of mixing function is reported as the one-line
 * difference it is rather than as nineteen failures.
 */
import { describe, expect, it } from 'vitest'
import { RICIAN_K_DEFAULT_DB, shadowDb, smallScaleDb, type FadingCfg } from '../../src/engine/fading'

const MS = 1_000_000
const N = 200_000
const SEED = 7
const TX = 'ap'
const RX = 'sta-1'

/** Euler–Mascheroni, for the closed form of the Rayleigh layer's dB-domain mean. */
const EULER_GAMMA = 0.5772156649015329

const cfg = (over: Partial<FadingCfg>): FadingCfg =>
  ({ shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'none', ...over })

interface Stats { mean: number; sd: number; median: number; p05: number; p10: number; belowMinus10Pct: number; min: number }

function stats(xs: number[]): Stats {
  const sorted = [...xs].sort((a, b) => a - b)
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length)
  const q = (p: number): number => sorted[Math.floor(p * sorted.length)]
  return {
    mean, sd, median: q(0.5), p05: q(0.05), p10: q(0.1),
    belowMinus10Pct: (100 * xs.filter((v) => v < -10).length) / xs.length,
    min: sorted[0],
  }
}

/** The fast layer's 200 000 draws, one per frame key. */
const fast = (c: FadingCfg): number[] =>
  Array.from({ length: N }, (_, i) => smallScaleDb(c, SEED, TX, RX, `f${i}`))

/** The slow layer's 200 000 draws, one per coherence interval. */
const slow = (c: FadingCfg): number[] =>
  Array.from({ length: N }, (_, i) => shadowDb(c, SEED, TX, RX, i * c.coherenceMs * MS))

const RAYLEIGH = cfg({ smallScale: 'rayleigh' })
const RICIAN6 = cfg({ smallScale: 'rician', ricianKdB: RICIAN_K_DEFAULT_DB })

describe('the fast layer is not zero-mean in dB, which is what the docblock used to claim', () => {
  const r = stats(fast(RAYLEIGH))
  const k6 = stats(fast(RICIAN6))

  it('Rayleigh averages −2.514 dB, and the closed form says −2.5068', () => {
    expect(r.mean).toBeCloseTo(-2.514, 2)
    // −10γ/ln10 exactly. The measured mean sits 0.007 dB below it, and the clamp below is why:
    // the two draws that hit −50 dB would otherwise have gone deeper still.
    expect((-10 * EULER_GAMMA) / Math.LN10).toBeCloseTo(-2.5068, 4)
    expect(r.mean).toBeLessThan((-10 * EULER_GAMMA) / Math.LN10)
  })

  it('Rician at the default K = 6 dB averages −0.959 dB: shallower, and still not zero', () => {
    expect(RICIAN_K_DEFAULT_DB).toBe(6)
    expect(k6.mean).toBeCloseTo(-0.959, 2)
    // Both are below zero, and the one with a line-of-sight component is nearer to it. That
    // ordering, not the two values, is what Jensen's inequality predicts.
    expect(k6.mean).toBeLessThan(0)
    expect(k6.mean).toBeGreaterThan(r.mean)
  })

  it('and the deep tail is where the two differ by much more than their means', () => {
    // 9.51 % against 1.68 %: a factor of 5.7, where the means differ by a factor of 2.6. This
    // pair is the mechanism behind the `fading` lesson's conclusion — Rayleigh's deep fades are
    // what drive its rate control to the bottom rung and keep it there.
    expect(r.belowMinus10Pct).toBeCloseTo(9.51, 1)
    expect(k6.belowMinus10Pct).toBeCloseTo(1.68, 1)
    expect(r.median).toBeCloseTo(-1.6, 1)
    expect(k6.median).toBeCloseTo(-0.46, 1)
    expect(r.p05).toBeCloseTo(-12.91, 1)
    expect(k6.p05).toBeCloseTo(-6.86, 1)
    expect(r.p10).toBeCloseTo(-9.78, 1)
    expect(k6.p10).toBeCloseTo(-5.01, 1)
  })

  it('clamps at −50 dB, and does so about twice in 200 000 draws', () => {
    const clamped = fast(RAYLEIGH).filter((v) => v <= -50).length
    // A complex Gaussian lands within 10^-5 of the origin in power with probability
    // 1 − e^(−10⁻⁵) ≈ 10⁻⁵, so 200 000 draws expect two. The clamp is the only reason the
    // Rayleigh mean above is not itself a function of how many draws were taken.
    expect(clamped).toBe(2)
    expect(stats(fast(RAYLEIGH)).min).toBe(-50)
    // Rician at K = 6 dB never reaches it: the line-of-sight term has to be cancelled first.
    expect(stats(fast(RICIAN6)).min).toBeCloseTo(-40.18, 1)
  })
})

describe('the slow layer IS zero-mean in dB, because that is the domain it is drawn in', () => {
  it('sigma 4 dB gives mean +0.001 and standard deviation 3.998', () => {
    const s = stats(slow(cfg({ shadowSigmaDb: 4 })))
    expect(s.mean).toBeCloseTo(0.001, 2)
    expect(s.sd).toBeCloseTo(3.998, 2)
    expect(s.p05).toBeCloseTo(-6.57, 1)
    // 4.56 sigma down in 200 000 draws, which is what a normal tail gives.
    expect(s.min).toBeCloseTo(-18.25, 1)
  })

  it('and sigma scales it and nothing else, so the asymmetry is the fast layer’s alone', () => {
    for (const sigma of [1, 2, 8]) {
      const s = stats(slow(cfg({ shadowSigmaDb: sigma })))
      expect(Math.abs(s.mean), `sigma ${sigma}`).toBeLessThan(0.01)
      expect(s.sd / sigma, `sigma ${sigma}`).toBeCloseTo(0.9996, 2)
    }
  })

  it('returns exactly 0 at sigma 0, before it has even read the coherence time', () => {
    // This is what makes every published scene's `coherenceMs: 100` a field that is written and
    // never read: both scenes that turn fading on set `shadowSigmaDb: 0`.
    // `tests/course/fading.test.ts` pins that census; here is the line that makes it true.
    for (const coherenceMs of [1, 100, 500, 1e9]) {
      expect(shadowDb(cfg({ shadowSigmaDb: 0, coherenceMs }), SEED, TX, RX, 123 * MS)).toBe(0)
    }
  })
})

describe('the K factor moves both figures together, and its dB-vs-linear trap is measured', () => {
  const sweep = (kdB: number): Stats => stats(fast(cfg({ smallScale: 'rician', ricianKdB: kdB })))

  it('a large K leaves almost nothing to fade: at 20 dB both figures go to zero', () => {
    const s = sweep(20)
    expect(s.mean).toBeCloseTo(-0.044, 2)
    expect(s.belowMinus10Pct).toBe(0)
  })

  /**
   * **`ricianKdB: 0` is not Rayleigh, and the design document for this slice got that wrong.**
   *
   * `fading.ts` says 「a K of zero is Rayleigh again」 and that sentence is correct — about the
   * LINEAR ratio in the expression beside it. The configured field is in dB, and `10 ** (0/10)`
   * is 1, not 0: equal line-of-sight and scattered power, a visibly different distribution from
   * Rayleigh in both figures this file measures. The acceptance criterion written for this slice
   * asked for `ricianKdB: 0` to 「agree with the Rayleigh row」; it does not, and the figures
   * below are the reason the criterion was the thing corrected rather than the code.
   *
   * Rayleigh is the `ricianKdB → −∞` limit, so **no finite setting reaches it** — but the limit
   * is approached fast, and −20 dB is already indistinguishable from it at this sample size.
   */
  it('K = 0 dB is K = 1 linear, which is nothing like Rayleigh', () => {
    const r = stats(fast(RAYLEIGH))
    const k0 = sweep(0)
    expect(k0.mean).toBeCloseTo(-2.05, 2)
    expect(k0.belowMinus10Pct).toBeCloseTo(7.26, 1)
    // Both differ from Rayleigh by far more than this file's tolerances.
    expect(k0.mean - r.mean).toBeCloseTo(0.464, 2)
    expect(r.belowMinus10Pct - k0.belowMinus10Pct).toBeCloseTo(2.25, 1)
  })

  it('and a deeply negative K does reach Rayleigh, which is where that sentence is true', () => {
    const r = stats(fast(RAYLEIGH))
    for (const kdB of [-20, -40]) {
      const s = sweep(kdB)
      expect(s.mean, `K ${kdB} dB`).toBeCloseTo(r.mean, 1)
      expect(s.belowMinus10Pct, `K ${kdB} dB`).toBeCloseTo(r.belowMinus10Pct, 0)
    }
  })

  it('`none` draws nothing at all, which is what keeps an unfaded scene bit-identical', () => {
    for (const key of ['f0', 'f1', 'f99999']) {
      expect(smallScaleDb(cfg({ smallScale: 'none' }), SEED, TX, RX, key)).toBe(0)
    }
  })
})
