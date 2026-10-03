import type { Generation } from '../model/types'
// Type only, and the only import this file has: `selBinnableGen` is read by both
// `src/model/scenario.ts` (a link's generation) and `src/engine/channel.ts` (a PPDU's
// format), and neither may hold a second copy of the two-entry list.

/**
 * Frequency-selectivity bin geometry: how many per-26-tone-RU bins a channel
 * bandwidth splits into, and how wide one bin is.
 *
 * The standard never parameterises frequency selectivity under that name — no
 * delay spread, no coherence bandwidth, no channel-model table (see the design
 * doc §1.4 for the exhaustive search). What it does give, under other names, is
 * a per-26-tone resource-unit average SNR (standard §9.4.1.65 / §9.4.1.75) and
 * the EHT subcarrier spacing that turns a tone count into a bandwidth
 * (standard be Table 36-18). Every constant below is one of those two numbers;
 * the bin count and width are computed from them, never written as a literal.
 *
 * **26-tone RU, not the Ng = 16 subcarrier grouping** — the standard's other
 * frequency scale (Ng x DF_EHT_KHZ = 16 x 78.125 kHz = 1.25 MHz, finer than a
 * 26-tone RU). Three reasons, all standard-derived rather than a taste:
 *   1. §9.4.1.65 / §9.4.1.75 define the 26-tone RU's content as exactly the
 *      quantity this engine can carry — the dB average of the per-subcarrier
 *      SNR inside the RU. Ng's bin instead carries a ΔSNR plus a compressed
 *      beamforming angle, which this engine has no slot for.
 *   2. The 26-tone RU is OFDMA's *smallest* resource unit, so "one bin" here
 *      is also "one smallest RU" — the unit the next slice (per-RU allocation)
 *      already needs, with no conversion between the two.
 *   3. Fewer bins (9 per 20 MHz vs. 16) is cheaper on the per-bin fan-out this
 *      slice adds to `maxInterfMw` (design doc §2.3).
 */

/** The 26-tone resource unit the standard's own averaged-SNR field is keyed to. standard be §36.3.2.1 */
export const RU26_TONES = 26

/** How many 26-tone RUs the standard's Partial BW Info reports per 20 MHz bit. standard §9.4.1.75 */
export const RU26_PER_20MHZ = 9

/** EHT subcarrier spacing, kHz — the same table entry the GI and DFT period come from. standard be Table 36-18 */
export const DF_EHT_KHZ = 78.125

/**
 * The two generations a 26-tone RU exists in, and the single answer both of this feature's
 * gates read.
 *
 * `DF_EHT_KHZ` above is why this list has two entries rather than four: the 26-tone RU is a
 * clause 27 / 36 unit, defined at 78.125 kHz, while clause 17 (non-HT) and clause 21 (VHT) are
 * spaced 312.5 kHz — four times coarser. `src/engine/phy.ts`'s own tables say the same from the
 * other side: `TONES_VHT[20] = 52` against `TONES_HE[20] = 234` for the same 20 MHz. So on a
 * VHT or non-HT PPDU `selBinWidthMhz()` is not a coarse ruler, it is the wrong one.
 *
 * Both gates ask this one function, because they are the same question asked of two things:
 *   - `ScenarioSchema`'s third selectivity refusal asks it of a **link** — `minGen` of the two
 *     ends, which is the format that link's PPDUs actually take (src/model/scenario.ts);
 *   - `Channel`'s `isOfdmWifiPpdu` asks it of **one PPDU** — `FrameDesc.mode`, so that a
 *     non-HT ACK between two EHT radios is not binned either (src/engine/channel.ts).
 * `Generation` and `PhyMode` are the same four-member union, which is what lets one predicate
 * serve both; a second copy of the list is how the two would drift apart.
 */
export function selBinnableGen(gen: Generation | undefined): boolean {
  return gen === 'he' || gen === 'eht'
}

/** Width of one 26-tone RU bin, MHz. Computed, not written as 2.03125. standard §9.4.1.75 / standard be Table 36-18 */
export function selBinWidthMhz(): number {
  return (RU26_TONES * DF_EHT_KHZ) / 1000
}

/** How many 26-tone RU bins a channel of this width (MHz) splits into. standard §9.4.1.75 */
export function selBins(widthMhz: number): number {
  return (RU26_PER_20MHZ * widthMhz) / 20
}

/**
 * Combine per-bin SINR into one effective SINR by capacity — not by taking the worst bin,
 * and not by EESM. physics
 *
 *   selEffSinrDb = 10·log10( 2^( mean_b log2(1 + 10^((meanSinrDb + devsDb[b]) / 10)) ) − 1 )
 *
 * **Why not the worst bin.** `resolveLock` already takes the worst *instant* across a frame
 * (channel.ts), so taking the worst *bin* across the channel looks like the obvious next step —
 * and it is catastrophically wrong. Measured over the same draws this engine's own fading
 * produces (Rayleigh, meanSinrDb = 20): the deepest of 144 bins at 320 MHz averages ~24 dB below
 * the mean, against ~12 dB for the 9 bins of a 20 MHz channel. Taking the worst bin as the link's
 * SINR would declare the 320 MHz link 12 dB *worse* than the 20 MHz one — deleting the fact that
 * OFDM codes across the whole channel, so more bins give a code more places to recover a symbol,
 * not fewer. That was the direction `width`'s own `limits` entry used to predict (a wider channel
 * "has more chances to hit a notch" with no counterweight); `src/course/tier2/width.ts` now says
 * the consequence runs the other way, and the `selectivity` lesson measures it.
 *
 * **Why not EESM.** The industry's link-to-SINR mapping is EESM, and it needs a per-MCS β factor
 * tuned against a target BLER curve. That β is in none of the standard clauses this design's
 * search covered — it is the one number this slice would have to invent, so EESM is out-of-scope
 * on evidence grounds. Capacity needs no constant: it is a tightening of Jensen's inequality on
 * the concave function log2(1+x), so averaging capacity and inverting is never worse than the
 * mean-SINR estimate and carries nothing an author chose.
 *
 * **The honest cost.** A real receiver does not reach capacity — a real link-adaptation and
 * coding scheme loses a gap to it that depends on the constellation, code rate and interleaver,
 * none of which this model enumerates. So this function returns the *smallest* frequency-
 * selectivity loss there is: a lower bound. The gap between this bound and a real receiver is
 * precisely the number EESM's β would have supplied and that this slice declined to invent, and
 * it is stated as this feature's own `threshold` limit in the `selectivity` lesson.
 */
export function selEffSinrDb(meanSinrDb: number, devsDb: number[]): number {
  const meanCapacityBps = devsDb.reduce(
    (sum, devDb) => sum + Math.log2(1 + 10 ** ((meanSinrDb + devDb) / 10)),
    0,
  ) / devsDb.length
  return 10 * Math.log10(2 ** meanCapacityBps - 1)
}
