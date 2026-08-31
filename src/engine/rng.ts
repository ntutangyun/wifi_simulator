/**
 * Deterministic seeded PRNG (splitmix32). Each node gets an independent stream
 * via fork() — 802.11-2024 §10.3.3 NOTE 1 requires statistical independence of
 * the random backoff streams between STAs.
 */
export class Rng {
  private s: number

  constructor(seed: number) {
    this.s = seed >>> 0
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x9e3779b9) >>> 0
    let z = this.s
    z ^= z >>> 16
    z = Math.imul(z, 0x21f0aaad)
    z ^= z >>> 15
    z = Math.imul(z, 0x735a2d97)
    z ^= z >>> 15
    return (z >>> 0) / 4294967296
  }

  /** Uniform integer in [0, maxInclusive]. */
  int(maxInclusive: number): number {
    return Math.floor(this.next() * (maxInclusive + 1))
  }

  /** Derive an independent, deterministic child stream. Does not advance this stream. */
  fork(streamId: number): Rng {
    const r = new Rng((this.s ^ Math.imul(streamId + 1, 0x85ebca6b)) >>> 0)
    r.next()
    return r
  }
}
