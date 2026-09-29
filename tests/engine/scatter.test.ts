/**
 * The echo geometry's invariants. Every one of these is physics rather than a
 * choice this simulator made, which is why they are checked over a hundred-odd
 * random geometries instead of one hand-picked case: a single case can pass for
 * the wrong reason, and this module's whole job is to be right for every
 * geometry a scenario can put a scatterer in.
 */
import { describe, it, expect } from 'vitest'
import {
  apertureCorrectionDb, directDelayNs, directPathM, echoDelayNs, echoExcessM, echoLossDb,
  echoPathM, isResolvable,
} from '../../src/engine/scatter'
import { Rng } from '../../src/engine/rng'
import { PL0_DB, PL_EXP } from '../../src/engine/propagation'
import { UWB_CHIP_NS, uwbPathLossDb } from '../../src/uwb/units'
import { uwbPl0Db } from '../../src/uwb/phy'
import type { Vec3 } from '../../src/model/types'

/**
 * Two path-loss laws, because the module takes one as a parameter and must hold
 * for either: the UWB stack's own, and the Wi-Fi engine's. If an invariant only
 * held for one of them it would not be an invariant of the geometry.
 */
const uwbLoss = (dM: number): number => uwbPathLossDb(uwbPl0Db(9), dM, 0)
const wifiLoss = (dM: number): number => PL0_DB + 10 * PL_EXP * Math.log10(Math.max(dM, 0.1))
const LAWS: Array<[string, (dM: number) => number]> = [['uwb', uwbLoss], ['wi-fi', wifiLoss]]

/**
 * A hundred and twenty random (TX, scatterer, RX) triples in a 20 m room, from a
 * seeded stream so a failure names a geometry that can be reproduced. Collinear
 * triples have measure zero here, which is what lets the strict inequalities
 * below be strict.
 */
function geometries(seed: number, n = 120): Array<[Vec3, Vec3, Vec3]> {
  const rng = new Rng(seed)
  const p = (): Vec3 => ({ x: rng.next() * 20, y: rng.next() * 20, z: rng.next() * 3 })
  return Array.from({ length: n }, () => [p(), p(), p()] as [Vec3, Vec3, Vec3])
}

/** UWB channel 5's wavelength, 6489.6 MHz. standard §16.2.x band centres */
const LAMBDA_M = 299.792458 / 6489.6

describe('echo geometry: an echo is always later than the direct path', () => {
  it('takes a longer path than the direct one, in every geometry', () => {
    for (const [tx, s, rx] of geometries(1)) {
      const direct = directPathM(tx, rx)
      const echo = echoPathM(tx, s, rx)
      expect(echo, JSON.stringify({ tx, s, rx })).toBeGreaterThan(direct)
      expect(echoExcessM(tx, s, rx)).toBeCloseTo(echo - direct, 9)
    }
  })

  it('arrives later than the direct path, in every geometry', () => {
    for (const [tx, s, rx] of geometries(2)) {
      expect(echoDelayNs(tx, s, rx)).toBeGreaterThan(directDelayNs(tx, rx))
    }
  })

  it('never reports a negative excess path, however the triple is arranged', () => {
    for (const [tx, s, rx] of geometries(3)) {
      expect(echoExcessM(tx, s, rx)).toBeGreaterThanOrEqual(0)
      expect(echoExcessM(tx, tx, rx)).toBeGreaterThanOrEqual(0)
      expect(echoExcessM(tx, rx, rx)).toBeGreaterThanOrEqual(0)
    }
  })

  it('turns metres into nanoseconds at one speed for both paths', () => {
    for (const [tx, s, rx] of geometries(4, 20)) {
      const ratio = echoDelayNs(tx, s, rx) / echoPathM(tx, s, rx)
      expect(directDelayNs(tx, rx) / directPathM(tx, rx)).toBeCloseTo(ratio, 12)
      // 1 m of flight is 3.3356 ns, so the ratio is that and nothing else.
      expect(ratio).toBeCloseTo(3.335640952, 6)
    }
  })
})

describe('echo geometry: a one-square-metre object is weaker in every geometry', () => {
  /**
   * The narrower claim, and the true one. "An echo is always weaker" was in the
   * design and in this file's first draft, and it is false: it holds for a weak
   * enough reflector, not for echoes as such. The counterexample is pinned in
   * the describe below, so neither half can be forgotten without a red test.
   *
   * `extraLossDb: 0` is one square metre, and at that reflectivity the two-leg
   * sum does lose more than the direct line everywhere.
   */
  for (const [name, law] of LAWS) {
    it(`loses more than the direct path under the ${name} law, at 0 dB reflectivity`, () => {
      for (const [tx, s, rx] of geometries(5)) {
        const direct = law(directPathM(tx, rx))
        expect(echoLossDb(tx, s, rx, law, LAMBDA_M, 0), JSON.stringify({ tx, s, rx })).toBeGreaterThan(direct)
      }
    })
  }

  it('charges both legs and the scatter summary, and nothing else', () => {
    const tx = { x: 0, y: 0, z: 1 }
    const s = { x: 2, y: 3, z: 1 }
    const rx = { x: 5, y: 0, z: 1 }
    const legs = uwbLoss(directPathM(tx, s)) + uwbLoss(directPathM(s, rx))
    // the two-leg sum minus the aperture it charges twice — the whole of the
    // difference between a two-leg reading and the bistatic radar relation
    expect(echoLossDb(tx, s, rx, uwbLoss, LAMBDA_M, 0))
      .toBeCloseTo(legs - apertureCorrectionDb(LAMBDA_M), 9)
  })

  it('makes a weaker object weaker, dB for dB', () => {
    const tx = { x: 0, y: 0, z: 1 }
    const s = { x: 2, y: 3, z: 1 }
    const rx = { x: 5, y: 0, z: 1 }
    const base = echoLossDb(tx, s, rx, uwbLoss, LAMBDA_M, 0)
    expect(echoLossDb(tx, s, rx, uwbLoss, LAMBDA_M, 7)).toBeCloseTo(base + 7, 9)
  })

  it('is a loss, not a gain: the summary never makes an echo louder', () => {
    // a correction, not a fudge: it is 10*log10(4*pi/lambda^2) and nothing else
    expect(apertureCorrectionDb(LAMBDA_M))
      .toBeCloseTo(10 * Math.log10((4 * Math.PI) / (LAMBDA_M * LAMBDA_M)), 12)
  })
})

describe('echo geometry: a scatterer on the straight line adds almost nothing', () => {
  const tx = { x: 0, y: 0, z: 1 }
  const rx = { x: 10, y: 0, z: 1 }

  it('adds exactly nothing when it stands on the line', () => {
    expect(echoExcessM(tx, { x: 4, y: 0, z: 1 }, rx)).toBeCloseTo(0, 12)
    expect(echoDelayNs(tx, { x: 4, y: 0, z: 1 }, rx)).toBeCloseTo(directDelayNs(tx, rx), 12)
  })

  it('adds less and less as it closes on the line', () => {
    let prev = Infinity
    for (const off of [2, 1, 0.5, 0.25, 0.1, 0.01, 0.001]) {
      const excess = echoExcessM(tx, { x: 4, y: off, z: 1 }, rx)
      expect(excess).toBeGreaterThan(0)
      expect(excess).toBeLessThan(prev)
      prev = excess
    }
    expect(prev).toBeLessThan(1e-5)
  })
})

describe('echo geometry: resolvable exactly when the extra path exceeds the resolution', () => {
  /** One UWB chip of flight, ≈ 0.6 m — the distance §4 of the design turns into a lesson. */
  const chipM = UWB_CHIP_NS * 0.299792458
  const tx = { x: 0, y: 0, z: 1 }
  const rx = { x: 10, y: 0, z: 1 }

  it('is about 0.6 m of extra path for a UWB receiver', () => {
    expect(chipM).toBeGreaterThan(0.55)
    expect(chipM).toBeLessThan(0.65)
  })

  it('says no just inside one chip and yes just outside it, from both sides', () => {
    // A scatterer beyond RX on the line: the excess path is exactly twice the
    // overshoot, so a wanted excess is placed by halving it.
    const beyond = (excessM: number): Vec3 => ({ x: 10 + excessM / 2, y: 0, z: 1 })
    for (const frac of [0.5, 0.9, 0.99]) {
      const s = beyond(chipM * frac)
      expect(echoExcessM(tx, s, rx)).toBeLessThan(chipM)
      expect(isResolvable(tx, s, rx, UWB_CHIP_NS), `${frac} of a chip`).toBe(false)
    }
    for (const frac of [1.01, 1.1, 2]) {
      const s = beyond(chipM * frac)
      expect(echoExcessM(tx, s, rx)).toBeGreaterThan(chipM)
      expect(isResolvable(tx, s, rx, UWB_CHIP_NS), `${frac} of a chip`).toBe(true)
    }
  })

  it('never resolves a scatterer standing on the line', () => {
    expect(isResolvable(tx, { x: 4, y: 0, z: 1 }, rx, UWB_CHIP_NS)).toBe(false)
  })

  it('takes the resolution as a parameter, so a finer receiver sees more', () => {
    const s = { x: 4, y: 0.5, z: 1 } // ≈ 0.05 m of extra path: a tenth of a chip
    expect(isResolvable(tx, s, rx, UWB_CHIP_NS)).toBe(false)
    expect(isResolvable(tx, s, rx, UWB_CHIP_NS / 100)).toBe(true)
  })

  it('agrees with the excess path over every random geometry', () => {
    for (const [tx2, s, rx2] of geometries(6)) {
      const excessNs = echoDelayNs(tx2, s, rx2) - directDelayNs(tx2, rx2)
      expect(isResolvable(tx2, s, rx2, UWB_CHIP_NS)).toBe(excessNs > UWB_CHIP_NS)
    }
  })
})

describe('echo geometry: pure', () => {
  it('is pure: same geometry, same answer, a hundred times over', () => {
    const tx = { x: 1.5, y: 2.5, z: 1 }
    const s = { x: 7, y: -3, z: 2 }
    const rx = { x: 9, y: 4, z: 0.5 }
    const path = echoPathM(tx, s, rx)
    const delay = echoDelayNs(tx, s, rx)
    const loss = echoLossDb(tx, s, rx, uwbLoss, LAMBDA_M, 3)
    for (let i = 0; i < 100; i++) {
      expect(echoPathM(tx, s, rx)).toBe(path)
      expect(echoDelayNs(tx, s, rx)).toBe(delay)
      expect(echoLossDb(tx, s, rx, uwbLoss, LAMBDA_M, 3)).toBe(loss)
    }
  })

  it('reads its arguments and nothing else: a fresh object with equal fields answers the same', () => {
    const a = echoPathM({ x: 0, y: 0, z: 0 }, { x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 })
    const b = echoPathM({ x: 0, y: 0, z: 0 }, { x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 })
    expect(b).toBe(a)
  })
})

describe('the echo loss reconstructs the bistatic radar relation', () => {
  /**
   * The justification for the whole shape of `echoLossDb`. A two-leg sum of a
   * free-space law over-charges by exactly `10*log10(sigma * 4*pi / lambda^2)`,
   * and that quantity splits into a geometry half (the aperture correction, which
   * this module computes) and a cross-section half (the scatterer's own
   * `extraLossDb`, which the scenario states). Put the two halves back and the
   * bistatic radar relation comes out — not approximately, exactly.
   *
   * This is why no radar cross-section in square metres is written anywhere: it
   * is the caller's number, expressed in the decibels the config already speaks.
   */
  const fspl = (lam: number) => (d: number) => 20 * Math.log10((4 * Math.PI * d) / lam)
  /** Bistatic radar loss, dB: (4*pi)^3 R1^2 R2^2 / (sigma * lambda^2). */
  const radarDb = (r1: number, r2: number, sigma: number, lam: number): number =>
    -10 * Math.log10((sigma * lam * lam) / ((4 * Math.PI) ** 3 * r1 * r1 * r2 * r2))

  // UWB channels 5 and 9, and a Wi-Fi wavelength, to show it is not UWB's alone
  const LAMBDAS = [299.792458 / 6489.6, 299.792458 / 7987.2, 299.792458 / 5985]

  it.each(LAMBDAS)('is exact at lambda = %f m, for every cross-section', (lam) => {
    const tx = { x: 0, y: 0, z: 1 }
    const rx = { x: 4, y: 0, z: 1 }
    const sc = { x: 2, y: 2, z: 1 }
    const r1 = Math.hypot(2, 2)
    const r2 = Math.hypot(2, 2)
    for (const sigma of [0.25, 0.5, 1, 2, 4]) {
      // the scenario states reflectivity in dB; sigma = 1 m^2 is 0 dB
      const extraLossDb = -10 * Math.log10(sigma)
      const mine = echoLossDb(tx, sc, rx, fspl(lam), lam, extraLossDb)
      expect(mine, `lambda ${lam}, sigma ${sigma}`).toBeCloseTo(radarDb(r1, r2, sigma, lam), 9)
    }
  })

  it('a one-square-metre object is the zero of extraLossDb', () => {
    // `toBeCloseTo`, not `toBe`: log10(1) is +0 and negating it gives -0, which
    // Object.is separates from +0 while every decibel reading treats them alike
    expect(-10 * Math.log10(1)).toBeCloseTo(0, 12)
  })
})

describe('a strong reflector near the line beats the direct path', () => {
  /**
   * The counterexample to "an echo is always weaker". Two short legs past a
   * strong object can carry more than one long direct line, and the crossover is
   * a position rather than a rule — which is the whole hinge of the resolution
   * lesson, where the *invisible* echo turns out to be the *loud* one.
   *
   * Geometry: a 2 m pair, the object at the midpoint and `off` metres aside.
   * `extraLossDb: -10` is the wardrobe the editor's tool places.
   */
  const LAM = 299.792458 / 7987.2 // UWB channel 9 centre. standard §16.2.x
  const fspl = (d: number) => 20 * Math.log10((4 * Math.PI * d) / LAM)
  const tx = { x: 0, y: 0, z: 1 }
  const rx = { x: 2, y: 0, z: 1 }
  const at = (off: number, extraLossDb: number) =>
    echoLossDb(tx, { x: 1, y: off, z: 1 }, rx, fspl, LAM, extraLossDb)
  const direct = fspl(directPathM(tx, rx))

  it('a wardrobe hugging the line arrives louder than the direct ray', () => {
    expect(at(0.1, -10)).toBeLessThan(direct)
  })

  it('and falls behind once it stands far enough aside', () => {
    expect(at(1.5, -10)).toBeGreaterThan(direct)
  })

  it('crosses over between those two positions, and nowhere else', () => {
    // monotone in `off`, so one crossing: find it and pin the bracket
    const louder = (off: number) => at(off, -10) < direct
    expect(louder(0.1)).toBe(true)
    expect(louder(1.5)).toBe(false)
    let lo = 0.1, hi = 1.5
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2
      if (louder(mid)) lo = mid; else hi = mid
    }
    expect(lo).toBeGreaterThan(0.8)
    expect(lo).toBeLessThan(0.95)
  })

  it('a one-square-metre object never manages it in the same geometry', () => {
    for (const off of [0.1, 0.5, 1, 2]) expect(at(off, 0)).toBeGreaterThan(direct)
  })
})
