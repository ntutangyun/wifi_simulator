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

/** Width of one 26-tone RU bin, MHz. Computed, not written as 2.03125. standard §9.4.1.75 / standard be Table 36-18 */
export function selBinWidthMhz(): number {
  return (RU26_TONES * DF_EHT_KHZ) / 1000
}

/** How many 26-tone RU bins a channel of this width (MHz) splits into. standard §9.4.1.75 */
export function selBins(widthMhz: number): number {
  return (RU26_PER_20MHZ * widthMhz) / 20
}
