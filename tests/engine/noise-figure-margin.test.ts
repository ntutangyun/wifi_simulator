/**
 * `decode-thresholds` claims that this simulator's 7 dB noise figure — 3 dB
 * better than the 10 dB the standard's sensitivity table assumes — cancels the
 * 3 dB rate margin the sender keeps, and that this holds at every bandwidth.
 *
 * The lesson said "at 20 MHz" until 2026-09-26, which was wrong and actively
 * misleading in a lesson whose own experiment runs at 80 MHz. It is pinned here
 * rather than left as prose, because the claim is about two constants that
 * someone may reasonably want to change, and the course would go quietly false.
 */
import { describe, expect, it } from 'vitest'
import { NOISE_FIGURE_DB, RATE_MARGIN_DB, noiseDbm, reqSinrDb } from '../../src/engine/phy'

/** The noise figure the standard's sensitivity table is derived against. §17.3.10.2 */
const STANDARD_NF_DB = 10

const WIDTHS = [20, 40, 80, 160] as const

/** Best MCS whose required SINR plus `margin` fits this SNR. */
const pick = (snr: number, margin: number): number => {
  let best = 0
  for (let i = 0; i <= 11; i++) if (snr >= reqSinrDb('he', i) + margin) best = i
  return best
}

describe('the noise figure advantage against the rate margin', () => {
  it('is exactly the margin, so the two are the same size', () => {
    expect(STANDARD_NF_DB - NOISE_FIGURE_DB).toBe(RATE_MARGIN_DB)
  })

  it.each(WIDTHS)('lowers the %i MHz noise floor by exactly that much', (width) => {
    expect(noiseDbm(width, NOISE_FIGURE_DB)).toBeCloseTo(noiseDbm(width, STANDARD_NF_DB) - RATE_MARGIN_DB, 6)
  })

  // The claim as the lesson now states it: what cancels is the rate chosen, not
  // the two decibel figures annihilating each other.
  it.each(WIDTHS)('picks at %i MHz the rate a standard-assumption receiver would pick with no margin', (width) => {
    const ours = noiseDbm(width, NOISE_FIGURE_DB)
    const theirs = noiseDbm(width, STANDARD_NF_DB)
    for (let rx = -95; rx <= -30; rx += 0.5) {
      expect(pick(rx - ours, RATE_MARGIN_DB), `${rx} dBm at ${width} MHz`)
        .toBe(pick(rx - theirs, 0))
    }
  })

  it('is not a coincidence of one width: the floors differ by the margin everywhere', () => {
    // If a future change breaks the equality above, this says which half moved.
    for (const width of WIDTHS) {
      const diff = noiseDbm(width, STANDARD_NF_DB) - noiseDbm(width, NOISE_FIGURE_DB)
      expect(diff, `${width} MHz`).toBeCloseTo(RATE_MARGIN_DB, 6)
    }
  })
})
