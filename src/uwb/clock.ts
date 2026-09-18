import type { Rng } from '../engine/rng'
import { COUNTER_MOD, RCTU_NS, UWB_PPM_MAX } from './phy'

/** Box–Muller standard normal from two uniform draws (u1 clamped ≥ 1e-12). Two rng.next() calls per value. */
export function gaussian(rng: Rng): number {
  const u1 = Math.max(rng.next(), 1e-12)
  const u2 = rng.next()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

/** (later − earlier) mod 2^40, always in [0, 2^40). */
export function counterDiff(later: number, earlier: number): number {
  const d = later - earlier
  return ((d % COUNTER_MOD) + COUNTER_MOD) % COUNTER_MOD
}

export class UwbClock {
  constructor(
    readonly ppm: number,
    readonly origin: number,
  ) {}

  /** ppm given, or uniform in [−20, 20]; origin uniform integer in [0, 2^40). Draw order: ppm (if undefined) first, then origin. */
  static fromRng(rng: Rng, ppm?: number): UwbClock {
    const resolvedPpm = ppm !== undefined ? ppm : (rng.next() * 2 - 1) * UWB_PPM_MAX
    const origin = Math.floor(rng.next() * COUNTER_MOD)
    return new UwbClock(resolvedPpm, origin)
  }

  /** Ranging counter (integer RCTU, mod 2^40) for an RMARKER at true time trueNs plus extraNs of measured delay (noise, NLOS). */
  counter(trueNs: number, extraNs = 0): number {
    const localNs = (trueNs + extraNs) * (1 + this.ppm * 1e-6)
    const raw = this.origin + Math.round(localNs / RCTU_NS)
    return ((raw % COUNTER_MOD) + COUNTER_MOD) % COUNTER_MOD
  }
}
