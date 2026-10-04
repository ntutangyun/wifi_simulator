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
 * a per-26-tone resource-unit average SNR (standard §9.4.1.65, standard be
 * §9.4.1.75 — the two clauses live in different documents, see below) and
 * the EHT subcarrier spacing that turns a tone count into a bandwidth
 * (standard be Table 36-18). Every constant below is one of those two numbers;
 * the bin count and width are computed from them, never written as a literal.
 *
 * **26-tone RU, not the Ng = 16 subcarrier grouping** — the standard's other
 * frequency scale (Ng x DF_EHT_KHZ = 16 x 78.125 kHz = 1.25 MHz, finer than a
 * 26-tone RU). Three reasons, all standard-derived rather than a taste:
 *   1. standard §9.4.1.65 / standard be §9.4.1.75 define the 26-tone RU's content as exactly the
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

/**
 * How many 26-tone RUs the standard's Partial BW Info reports per 20 MHz bit. standard be §9.4.1.75
 *
 * **The clause number belongs to 802.11be, not to the base standard** (correction of 2026-10-04,
 * slice 4b). It was written `standard §9.4.1.75` here, in `selBinWidthMhz` and in `selBins`, and
 * IEEE Std 802.11-2024 has no such subclause: its 9.4.1 runs to §9.4.1.71 (Short SSID field) and
 * the string `9.4.1.75` does not occur anywhere in those 5956 pages. It is
 * **IEEE Std 802.11be-2024 §9.4.1.75 (EHT CQI Report field)**. Only the label was wrong; the 9 is
 * right, and that clause says more than this file used to claim:
 *
 *   - Ncqi — the number of RU indices a CQI report carries — is **9** times the number of bits set
 *     in B1..B8 of the Partial BW Info subfield when B0 is 0, and **18** times that count when B0
 *     is 1. So both the 9 here and the 18 of a 40 MHz bit are read off the clause, not inferred.
 *   - The undefined 26-tone RUs — **RU 19, RU 56, RU 93 and RU 130** — are **not included** in the
 *     field. Those are the middle RU of each 80 MHz subblock.
 *
 * So the reportable bin counts are 37−1 = 36 at 80 MHz, 74−2 = 72 at 160 MHz and 148−4 = 144 at
 * 320 MHz, which is exactly what `selBins(w) = 9w/20` returns on all five widths. **That makes the
 * formula below a literal reading of the clause** rather than a proportion someone chose.
 *
 * It also fixes what the count is a count *of*: **reportable** 26-tone RUs, not HE's physical ones.
 * Table 27-7 (standard) gives the physical maxima as 9 / 18 / **37** / **74** for CBW20 / 40 / 80 /
 * 160 — HE does define the middle RU — so `9w/20` is not the physical count at 80 MHz and above.
 */
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

/** Width of one 26-tone RU bin, MHz. Computed, not written as 2.03125. standard be §9.4.1.75 / standard be Table 36-18 */
export function selBinWidthMhz(): number {
  return (RU26_TONES * DF_EHT_KHZ) / 1000
}

/**
 * How many 26-tone RU bins a channel of this width (MHz) splits into — the whole PPDU's count,
 * i.e. the reportable 26-tone RUs of `RU26_PER_20MHZ`'s comment. standard be §9.4.1.75
 */
export function selBins(widthMhz: number): number {
  return (RU26_PER_20MHZ * widthMhz) / 20
}

/**
 * How many 26-tone RU bins **one OFDMA member** gets: the channel's bins times that member's
 * share, truncated to a whole number of bins, with a floor of one. standard §27.3.2.2 (Table 27-8 /
 * Table 27-9) / standard be §9.4.1.75
 *
 * `ruFraction` here is **this function's argument** — the share of the PPDU one member occupies, as
 * `mac.ts` computes it (`frac = mumimo ? 1 : 1 / dsts.length`). `selBins` answers for the whole
 * PPDU, so before this function existed every OFDMA member was credited with the frequency
 * diversity of the entire channel: over-counted by exactly the member count.
 *
 * **The truncation is the standard's tone table, not a rounding of convenience.** Read that
 * sentence before changing it. A non-whole share arises on only three of the fifteen
 * (bandwidth, member count) combinations this engine can build — (20 MHz, 2), (20 MHz, 4) and
 * (40 MHz, 4) — and on all three the truncated value is the number the standard's own fixed
 * 26-tone RU locations give:
 *
 *   - **(20, 2) → 4.5 → 4.** Table 27-8 defines exactly two 106-tone RUs, `[-122:-17]` and
 *     `[17:122]`. The first covers 26-tone RUs 1–4, the second 26-tone RUs 6–9: **four bins each.**
 *     26-tone RU 5 is `[-16:-4, 4:16]`, which that table's NOTE 2 calls *the middle 26-tone RU*,
 *     and it lies inside neither 106-tone RU. **The bin the truncation drops is a bin the standard
 *     itself leaves out of this split** — nobody holds it, and 11be §9.4.1.75 goes as far as
 *     excluding the same kind of middle RU from CQI reporting outright.
 *   - **(20, 4) → 2.25 → 2.** Table 27-8's four 52-tone RUs are `[-121:-70]`, `[-68:-17]`,
 *     `[17:68]`, `[70:121]`: **two bins each**, with RU 5 outside again.
 *   - **(40, 4) → 4.5 → 4.** Table 27-9's four 106-tone RUs are `[-243:-138]`, `[-109:-4]`,
 *     `[4:109]`, `[138:243]`: **four of the 18 bins each**, the two left out being 26-tone RUs 5
 *     and 14 (40 MHz has no middle RU — 18 is even).
 *
 * On the other twelve combinations the share is already whole and the truncation does nothing at
 * all, which `tests/engine/selectivity.test.ts` asserts row by row so that nobody reads truncation
 * as the common case.
 *
 * **The floor of one is physical, not defensive.** One bin *is* one 26-tone RU, and the 26-tone RU
 * is the unit 11be §9.4.1.75 reports in and the smallest RU OFDMA defines, so no member can hold
 * less. It is unreachable from today's inputs — the smallest share the engine builds is 20 MHz over
 * four members, i.e. 2 bins — and the test exercises it with a share the engine does not produce
 * rather than letting a clamp sit here proving nothing.
 *
 * What this does **not** model is written up as an `unmodelled` limit in the lesson: the truncated
 * bin simply does not exist for anyone in this simulator, whereas a real scheduler would hand it to
 * someone else or absorb it with a multi-RU allocation such as 52+26.
 */
export function selMemberBins(widthMhz: number, ruFraction: number): number {
  return Math.max(1, Math.floor(selBins(widthMhz) * ruFraction))
}

/**
 * Which bin a member's run starts at: the bins of every member before it, summed. model
 *
 * Members take **consecutive** runs in `muParts` order, so member `idx` begins where member
 * `idx - 1` ended. Two things follow, and only two:
 *   - the runs cannot overlap, and the last one cannot pass the channel edge (`selCombine` checks
 *     `start + bins <= selBins(width)`, which is what catches shares summing past 1);
 *   - the bins truncation dropped are left **unclaimed at the top of the channel**, where they can
 *     be counted — at 20 MHz with two members that is bin 8, which is the very bin Table 27-8's
 *     106-tone split leaves out.
 *
 * `fractions` are this function's own argument: the members' `ruFraction` values, in `muParts`
 * order. That order is deterministic for a given seed but is **not** stable across transmissions
 * downlink, since `Queues.dsts` yields queue-arrival order — so a given station's index moves.
 *
 * **Position buys no physics in this model.** Bins are drawn independently of each other, and two
 * members are independent draws regardless (the fading key carries the receiver id), so the
 * effective SINR of a four-bin run is the same wherever it sits: measured across all six four-bin
 * windows of a 9-bin channel it agrees to within 0.02 dB. Position is here for a readable record
 * and for the slice that gives inter-bin correlation a value, at which point it becomes physical.
 * In a real channel adjacent bins are correlated and an edge run is not an interior run.
 */
export function selBinStart(widthMhz: number, fractions: readonly number[], idx: number): number {
  let start = 0
  for (let i = 0; i < idx; i++) start += selMemberBins(widthMhz, fractions[i]!)
  return start
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
