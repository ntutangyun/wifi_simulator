/**
 * Time-varying link fading: the two layers that make a station at a fixed
 * position stop hearing exactly the same level for ever.
 *
 * **Every draw is a pure function of `(seed, txId, rxId, key)`, hashed.** This is
 * not a style choice. The consumer, `linkDbm` in `channel.ts`, is called several
 * times over one frame's life — once for carrier sense, once for the capture
 * decision, and again for every SINR recomputation. A draw taken from a stateful
 * stream would hand each of those calls a different number: one frame would
 * arrive at one receiver at several levels at once, and which level went to which
 * question would depend on event-queue ordering, so the same scenario with the
 * same seed would answer differently after an unrelated change. Hashing makes the
 * draw re-entrant and order-independent instead: ask a hundred times, in any
 * order, from any caller, and get the same number.
 *
 * Two layers, each **flat across the whole channel bandwidth** on its own — but that is the
 * default, not the ceiling. `smallScaleDb`'s optional `bin` argument below is the
 * frequency-selectivity hook: given a bin index it draws the fast layer once per 26-tone-RU bin
 * of the same frame, and `channel.ts` combines those by capacity into one effective SINR
 * (`selectivity.ts`, and the scenario's `selectivity` section is what switches it on). Still not
 * modelled: **delay spread** itself — a bin's depth is drawn, not computed from any path's
 * arrival time — **no Doppler**, since nodes do not move, so the coherence time is a configured
 * figure rather than one derived from a speed, and **no correlation between bins**.
 *
 * | layer | model | how fast it changes |
 * | --- | --- | --- |
 * | shadowing | log-normal, sigma configurable | slow: keyed by the coherence interval index, so it holds steady inside one interval and changes across |
 * | small-scale | Rayleigh (NLOS) or Rician (LOS, K configurable) | fast: keyed by the frame, so it holds steady for one frame and changes between frames |
 *
 * Both are expressed in **dB relative to the link's mean level**, so no fading is
 * exactly `0` and the result composes with the static path loss by addition.
 */
import { hashStr } from './hash'
import type { Ns } from '../model/types'

export interface FadingCfg {
  /** Standard deviation of the log-normal shadowing, dB. 0 adds no shadowing. */
  shadowSigmaDb: number
  /** Coherence time of the shadowing, ms: the shadow holds one value per interval. */
  coherenceMs: number
  /** Distribution of the small-scale fade. */
  smallScale: 'none' | 'rayleigh' | 'rician'
  /**
   * Rician K factor, dB. Optional, and absent in every other distribution —
   * the schema fills it only for `'rician'` so that its output parses as its own
   * input; a K factor beside `'rayleigh'` is refused, so emitting one there made
   * saving and reloading a faded plan throw.
   */
  ricianKdB?: number
}

/**
 * What the four knobs take when a scenario turns fading on without saying more.
 * **Only in effect once the user has explicitly turned fading on** — a scenario
 * with no `fading` section gets today's behaviour, not these.
 *
 * All four are `model`. Indoor measurements commonly put the shadowing sigma
 * between 3 and 8 dB and the Rician K factor between 3 and 10 dB; this simulator
 * picks one figure from the middle of each range rather than claiming a
 * particular measurement campaign. The coherence time and the choice of Rayleigh
 * as the default distribution are likewise this simulator's pick: 100 ms is slow
 * enough to be visible across many frames, and Rayleigh is the pessimistic case
 * (no line-of-sight component at all). model
 */
/**
 * The K factor a rician fade takes when a scenario asks for one without saying
 * how strong. Its own constant rather than a field of `FADING_DEFAULTS`, because
 * `FadingCfg.ricianKdB` is optional — absent in every distribution but rician —
 * and a default has to be a number whatever the config left out. model
 */
export const RICIAN_K_DEFAULT_DB = 6

export const FADING_DEFAULTS: FadingCfg = {
  shadowSigmaDb: 4,
  coherenceMs: 100,
  smallScale: 'rayleigh',
  ricianKdB: RICIAN_K_DEFAULT_DB,
}

/**
 * Floor on a small-scale fade, dB. A complex Gaussian can land arbitrarily close
 * to the origin, and 10·log10 of that is arbitrarily negative; a fade this deep
 * is already tens of dB below any receiver's sensitivity, so clamping changes no
 * outcome and keeps the dB arithmetic finite. model
 */
const MIN_SMALL_SCALE_DB = -50

/**
 * splitmix32's finalizer, the mixing step of `Rng.next` without the state.
 *
 * `hashStr` (FNV-1a) is what every per-node RNG stream id is already forked from,
 * so the key string is hashed with the house function; but FNV-1a's avalanche is
 * weak in the low bits, and adjacent keys here differ by one character — the
 * coherence interval 41 and 42, the frames `f41` and `f42`. Left unmixed those
 * would give visibly correlated fades from one interval to the next. This turns
 * the hash into a well-spread 32-bit word.
 */
function mix32(x: number): number {
  let z = x >>> 0
  z ^= z >>> 16
  z = Math.imul(z, 0x21f0aaad)
  z ^= z >>> 15
  z = Math.imul(z, 0x735a2d97)
  z ^= z >>> 15
  return z >>> 0
}

/**
 * One uniform in the **open** interval (0, 1), drawn from the link and key alone.
 * Open at both ends because Box–Muller takes `log(u)`: a 0 would be an infinity.
 * `stream` picks which of the independent uniforms a key needs.
 */
function uniform(seed: number, txId: string, rxId: string, key: string, stream: number): number {
  const h = hashStr(`${seed}|${txId}|${rxId}|${key}`)
  return (mix32((h + Math.imul(stream + 1, 0x9e3779b9)) >>> 0) + 0.5) / 4294967296
}

/**
 * Two independent standard normals by Box–Muller, from two hashed uniforms.
 * Both are returned because the complex Gaussian a fade comes from needs a pair,
 * and throwing one away would cost a second hash for nothing.
 */
function normalPair(seed: number, txId: string, rxId: string, key: string): [number, number] {
  const r = Math.sqrt(-2 * Math.log(uniform(seed, txId, rxId, key, 0)))
  const theta = 2 * Math.PI * uniform(seed, txId, rxId, key, 1)
  return [r * Math.cos(theta), r * Math.sin(theta)]
}

/**
 * The slow layer: log-normal shadowing on this link at time `tNs`, in dB about
 * the mean (so it is as often a gain as a loss).
 *
 * The key is the **coherence interval index**, `floor(tNs / coherenceNs)`, which
 * is what makes the value hold steady inside one interval and change across it.
 */
export function shadowDb(cfg: FadingCfg, seed: number, txId: string, rxId: string, tNs: Ns): number {
  if (cfg.shadowSigmaDb === 0) return 0
  const coherenceNs = Math.max(1, Math.round(cfg.coherenceMs * 1e6))
  const interval = Math.floor(tNs / coherenceNs)
  return normalPair(seed, txId, rxId, `shadow|${interval}`)[0] * cfg.shadowSigmaDb
}

/**
 * The fast layer: the small-scale fade this link puts on the frame `frameKey`,
 * in dB relative to the mean power.
 *
 * Both distributions come from the magnitude of a complex Gaussian channel
 * coefficient `h`, scaled so that `E[|h|²] = 1` — so the layer averages 0 dB **in
 * power**, and **not in dB**. In dB it averages **−2.51 dB** for Rayleigh and
 * **−0.96 dB** at K = 6 dB, because `10·log10` is concave and Jensen's inequality
 * puts `E[log X]` below `log E[X]`; Rayleigh's figure is exactly `−10γ/ln10 =
 * −2.5068 dB` (γ is the Euler–Mascheroni constant), the measured 200 000-draw mean
 * landing at −2.514 because of the clamp below. **So turning Rayleigh on does not
 * merely add variance to a link — it lowers its mean level by 2.51 dB.** The slow
 * layer is the asymmetric half of this: a log-normal shadow genuinely is zero-mean
 * in dB (measured +0.001 dB at sigma 4), because that is the domain it is drawn in.
 * Instrument for all four figures: `tests/engine/fading-stats.test.ts`, and the
 * design note is docs/superpowers/specs/2026-10-05-fading-lesson-design.md §0.3(c).
 *
 * Rayleigh is pure scatter, `h = (x + jy)/√2`. Rician adds a deterministic
 * line-of-sight component alongside the scatter, with `K` the ratio of the
 * line-of-sight power to the scattered power: `h = √(k/(k+1)) + √(1/(k+1))·(x + jy)/√2`,
 * so a large K leaves almost nothing to fade and a K of zero is Rayleigh again.
 * **`K` there is the linear ratio, not the configured dB figure**, and the two are
 * easy to confuse where it matters most: `ricianKdB: 0` is `K = 1`, equal
 * line-of-sight and scattered power, which is nothing like Rayleigh — measured
 * dB-domain mean −2.050 against Rayleigh's −2.514, `P(< −10 dB)` 7.26 % against
 * 9.51 %. Rayleigh is the `ricianKdB → −∞` limit, so no finite setting reaches it;
 * `tests/engine/fading-stats.test.ts` pins both ends of that range.
 *
 * `bin` is the optional frequency-selectivity hook (model, see `selectivity.ts`):
 * omitted, the draw is keyed by `frameKey` alone, exactly as before — this is
 * what keeps every scenario without that feature turned on byte-identical.
 * Given, it folds the bin index into the key so each 26-tone-RU bin of the same
 * frame draws independently, reusing this same distribution and K factor rather
 * than adding a new one.
 */
export function smallScaleDb(
  cfg: FadingCfg, seed: number, txId: string, rxId: string, frameKey: string, bin?: number,
): number {
  if (cfg.smallScale === 'none') return 0
  const key = bin === undefined ? `fast|${frameKey}` : `fast|${frameKey}|b${bin}`
  const [x, y] = normalPair(seed, txId, rxId, key)
  let re = x / Math.SQRT2
  let im = y / Math.SQRT2
  if (cfg.smallScale === 'rician') {
    const k = 10 ** ((cfg.ricianKdB ?? RICIAN_K_DEFAULT_DB) / 10)
    const scatter = Math.sqrt(1 / (k + 1))
    re = Math.sqrt(k / (k + 1)) + re * scatter
    im *= scatter
  }
  const power = re * re + im * im
  return Math.max(MIN_SMALL_SCALE_DB, 10 * Math.log10(power))
}

/**
 * Both layers together: what to add to this link's static level for this frame.
 * 0 exactly when fading is off, which is what keeps a scenario without a
 * `fading` section returning the very same floating-point numbers as today.
 */
export function fadingDb(
  cfg: FadingCfg, seed: number, txId: string, rxId: string, tNs: Ns, frameKey: string,
): number {
  return shadowDb(cfg, seed, txId, rxId, tNs) + smallScaleDb(cfg, seed, txId, rxId, frameKey)
}
