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
    const raw = this.origin + this.localRctu(trueNs, extraNs)
    return ((raw % COUNTER_MOD) + COUNTER_MOD) % COUNTER_MOD
  }

  /**
   * The **true** instant at which this clock's own counter will read exactly `rctu` counter units
   * past the RMARKER it stamped at (trueNs, extraNs) — the inverse of `counter`, for a device that
   * has to *hit* a counter value rather than read one.
   *
   * Exactly one thing in this engine needs it: a responder running the fixed reply time of
   * standard §10.29.6.5, which must put its Response on the air a pre-agreed number of its own
   * counter units after it received the Poll (see `UwbDevice.armFixedReply`). The interval is a
   * count of *this* crystal, so the wall-clock interval it takes is that count divided by this
   * clock's rate — which is why a responder running fast answers a little early in true time and
   * a slow one a little late, and why `ssTwrCorrected`'s (1 − coffs) is still the conversion the
   * initiator needs (design §8).
   *
   * It shares `localRctu` with `counter` rather than repeating the rounding rule, so the instant
   * aimed at and the counter later stamped at it cannot round to different values.
   */
  after(trueNs: number, extraNs: number, rctu: number): number {
    return ((this.localRctu(trueNs, extraNs) + rctu) * RCTU_NS) / (1 + this.ppm * 1e-6)
  }

  /** This clock's own reading of an RMARKER at (trueNs + extraNs), in whole RCTU before the
   * origin is added and before the 40-bit counter wraps. The one rounding rule of this class. */
  private localRctu(trueNs: number, extraNs: number): number {
    return Math.round(((trueNs + extraNs) * (1 + this.ppm * 1e-6)) / RCTU_NS)
  }
}
