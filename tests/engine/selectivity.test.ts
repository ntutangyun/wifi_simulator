import { describe, it, expect } from 'vitest'
import { RU26_TONES, RU26_PER_20MHZ, DF_EHT_KHZ, selBinWidthMhz, selBins, selBinStart, selMemberBins, selEffSinrDb } from '../../src/engine/selectivity'
import { smallScaleDb, type FadingCfg } from '../../src/engine/fading'

const RAYLEIGH: FadingCfg = { shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'rayleigh' }
const rician = (kDb: number): FadingCfg => ({ ...RAYLEIGH, smallScale: 'rician', ricianKdB: kDb })

/** 40000 per-bin small-scale draws spread over 100 links, 20 frames and 20 bins. */
function binDraws(cfg: FadingCfg): number[] {
  const out: number[] = []
  for (let link = 0; link < 100; link++) {
    for (let f = 0; f < 20; f++) {
      for (let bin = 0; bin < 20; bin++) {
        out.push(smallScaleDb(cfg, 7, 'ap', `sta-${link}`, `f${f}`, bin))
      }
    }
  }
  return out
}

function fractionOutside(draws: number[], lo: number, hi: number): number {
  return draws.filter((d) => d < lo || d > hi).length / draws.length
}

describe('selectivity: the bin geometry is computed, not written down', () => {
  it('derives the bin count and width from the standard, never a literal', () => {
    expect([20, 40, 80, 160, 320].map(selBins)).toEqual([9, 18, 36, 72, 144])
    expect(selBinWidthMhz()).toBeCloseTo(2.03125, 5)
  })

  it('swapping the EHT subcarrier spacing for the pre-EHT one changes the bin width', () => {
    // Proves the width is computed from DF_EHT_KHZ, not a decorated literal:
    // RU26_TONES x 312.5 kHz (pre-EHT spacing) / 1000 = 8.125 MHz.
    const PRE_EHT_DF_KHZ = 312.5
    expect(RU26_TONES * PRE_EHT_DF_KHZ / 1000).toBeCloseTo(8.125, 5)
    expect(RU26_TONES).toBe(26)
    expect(RU26_PER_20MHZ).toBe(9)
    expect(DF_EHT_KHZ).toBeCloseTo(78.125, 5)
  })
})

describe('selectivity: the standard\'s own 4-bit deviation field is the calibration', () => {
  it('matches the clamp fraction of the 4-bit ΔSNR field for rayleigh and rician(K=6)', () => {
    const rayleighDraws = binDraws(RAYLEIGH)
    const ricianDraws = binDraws(rician(6))
    expect(rayleighDraws.length).toBe(40000)
    expect(ricianDraws.length).toBe(40000)
    const rayleighFrac = fractionOutside(rayleighDraws, -8, 7)
    const ricianFrac = fractionOutside(ricianDraws, -8, 7)
    expect(rayleighFrac).toBeCloseTo(0.153, 2)
    expect(ricianFrac).toBeCloseTo(0.033, 2)
  })
})

describe('selEffSinrDb: combines by capacity, not by the worst bin, not by EESM', () => {
  it('returns the mean SINR unchanged when every bin agrees — capacity adds no bias', () => {
    // All bins flat at the mean (dev = 0): capacity combining must be a no-op, the same way an
    // average of equal numbers is that number. This is the trivial case the big statistical test
    // below builds on, and it is cheap enough to pin exactly.
    expect(selEffSinrDb(20, new Array(144).fill(0))).toBeCloseTo(20, 9)
  })

  it('never exceeds the mean SINR when the bins average back to it in linear power — Jensen on log2(1+x), not a tuned bound', () => {
    // log2(1+x) is concave, so Jensen gives mean_b(log2(1+x_b)) <= log2(1 + mean_b(x_b)): capacity
    // combining can only lose against a flat channel at the same *linear* average SINR. That
    // linear average is what `fading.ts` actually pins to 1 (`E[|h|²] = 1`, its own doc comment)
    // — not a zero mean in dB, which Jensen's gap makes a different, smaller number. So the devs
    // below are chosen to average to 1 in *linear* power (10^(1.76/10) ≈ 1.5, 10^(-3.01/10) ≈ 0.5,
    // mean 1), the condition the inequality actually needs; a naive dB-symmetric pair such as
    // [+5, -5] does not satisfy it and can (and does) come out fractionally above the mean.
    const devsDb = [10 * Math.log10(1.5), 10 * Math.log10(0.5)]
    expect(selEffSinrDb(20, devsDb)).toBeLessThan(20)
    expect(selEffSinrDb(20, [0, 0, 0])).toBeCloseTo(20, 9)
  })

  /**
   * **The one test that is the point.** Over the *same* per-bin draws (this engine's own
   * Rayleigh fading, no new distribution), measure both numbers at 320 MHz / 144 bins and
   * assert them together — either number alone reads as a modelling choice; the pair is the
   * refutation of "take the worst bin". The same block is then run at 20 MHz / 9 bins, because
   * the `width` lesson quotes both ends and derives "about 3 dB per doubling" from them: two
   * numbers a course subtracts must come off one instrument (review finding 4a).
   *
   * `worstBinDepth` is the design this slice rejects: the deepest bin's average distance below
   * the mean, i.e. what a worst-bin combiner would report as the link's loss. It is deliberately
   * reimplemented here, in the test, rather than exported from `selectivity.ts` — production code
   * has no caller for it, by design (see the comment on `selEffSinrDb`).
   *
   * Sample size: 40 000 independent 144-bin draws (one frame key per trial, same convention as
   * the 4-bit-field calibration above). Measured directly (not tuned to match): at this N,
   * `worstBinDepth` averages ≈24.12 dB and `selEffSinrDb`'s loss has a median of ≈2.357 dB,
   * against the design doc's §3.3/§4.1 figures of 24.09 dB and 2.36 dB measured at larger N
   * (400 000, where the design doc's own convergence note applies — Task 1 hit the same noise-vs-N
   * tradeoff calibrating the 4-bit field). The two concur to within the noise of this N: a 0.03 dB
   * gap on the worst-bin average, 0.003 dB on the median loss. The tolerances below reflect that
   * measured convergence, not a round number picked to make the test pass.
   */
  it('combines by capacity, and that is an order of magnitude from the worst bin', () => {
    const TRIALS = 40_000
    const MEAN_SINR_DB = 20

    /** Both figures over the same per-bin draws, at whatever bin count is asked for. */
    const block = (bins: number): { avgWorstDepth: number; medianLoss: number } => {
      const worstDepths: number[] = []
      const lossesDb: number[] = []
      for (let i = 0; i < TRIALS; i++) {
        const devsDb: number[] = []
        for (let bin = 0; bin < bins; bin++) {
          devsDb.push(smallScaleDb(RAYLEIGH, 7, 'ap', 'sta', `f${i}`, bin))
        }
        worstDepths.push(-Math.min(...devsDb))
        lossesDb.push(MEAN_SINR_DB - selEffSinrDb(MEAN_SINR_DB, devsDb))
      }
      const avgWorstDepth = worstDepths.reduce((a, b) => a + b, 0) / worstDepths.length
      const sortedLosses = [...lossesDb].sort((a, b) => a - b)
      const medianLoss = sortedLosses.length % 2
        ? sortedLosses[(sortedLosses.length - 1) / 2]
        : (sortedLosses[sortedLosses.length / 2 - 1] + sortedLosses[sortedLosses.length / 2]) / 2
      return { avgWorstDepth, medianLoss }
    }

    // 320 MHz, the design doc's worst case, and 20 MHz, the other end the `width` lesson quotes.
    const wide = block(selBins(320))
    const narrow = block(selBins(20))
    expect([selBins(320), selBins(20)]).toEqual([144, 9])

    // The deepest bin, ~24 dB down — the design this slice rejects would report this as the
    // link's loss.
    expect(wide.avgWorstDepth).toBeCloseTo(24.09, 0) // within 0.5 dB of the design doc's converged figure
    // Capacity's actual median loss — an order of magnitude smaller.
    expect(wide.medianLoss).toBeCloseTo(2.36, 1) // within 0.05 dB
    // The ratio is the argument: the worst bin is not a stand-in for the channel's loss.
    expect(wide.avgWorstDepth / wide.medianLoss).toBeGreaterThan(9)

    /*
     * The narrow end, on the SAME instrument (review of 2026-10-03, finding 4a). The `width`
     * lesson prints 12.05 dB against 24.09 dB and concludes "about 3 dB per doubling" from the
     * pair, so the pair has to be measured the same way: one deepest-bin average read off two bin
     * counts of one 40 000-trial block, not two numbers from two different procedures. Measured
     * here: 12.08 dB at 9 bins against 24.12 dB at 144, converging to the design doc's 12.05 /
     * 24.09 at 400 000 — the same noise-vs-N gap the comment above records.
     *
     * The per-doubling figure is then derived rather than typed: four doublings separate 20 MHz
     * from 320 MHz, and the measured difference over four comes out at 3.01 dB.
     */
    expect(narrow.avgWorstDepth).toBeCloseTo(12.05, 0) // within 0.5 dB, same tolerance as 24.09
    expect(narrow.avgWorstDepth).toBeLessThan(wide.avgWorstDepth)
    const DOUBLINGS = Math.log2(320 / 20)
    expect(DOUBLINGS).toBe(4)
    expect((wide.avgWorstDepth - narrow.avgWorstDepth) / DOUBLINGS).toBeCloseTo(3, 1) // within 0.05 dB
    // …and the loss capacity actually charges barely moves across that whole span — measured
    // 2.30 dB at 9 bins against 2.36 dB at 144, i.e. it rises by about a twentieth of a decibel
    // while the deepest bin falls by 12 — which is why the lesson's headline is the drop rate and
    // not this column. A bound on the difference rather than `toBeCloseTo`, because the two are
    // 0.056 dB apart and the nearest `toBeCloseTo` precision either side (0.05 or 0.5) would be
    // too tight or too loose to mean anything.
    expect(Math.abs(wide.medianLoss - narrow.medianLoss)).toBeLessThan(0.1)
    expect(narrow.medianLoss).toBeCloseTo(2.3, 1)
  }, 30_000)
})

/*
 * ---------------------------------------------------------------------------
 * Slice 4b, task 1: one OFDMA member's share of the bins.
 *
 * `selBins` answers for the whole PPDU; an OFDMA member only occupies
 * `ruFraction` of it (`mac.ts`'s `frac = mumimo ? 1 : 1 / dsts.length`), so a
 * member's frequency diversity was over-counted by exactly the member count.
 * These two functions are the bottom layer of the fix: bins per member, and
 * where that member's run of bins starts.
 * ---------------------------------------------------------------------------
 */

/**
 * Every (bandwidth, member count) combination the engine can produce, with the
 * un-truncated share beside the truncated one. `n` stops at 4 because
 * `muDsts.slice(0, 4)` caps a multi-user PPDU at four members (`mac.ts`), and
 * `widthMhz` comes from `ChannelWidth = 20 | 40 | 80 | 160 | 320`
 * (`model/caps.ts`), so these fifteen rows are the whole input space.
 *
 * `raw` is `selBins(width) / n` before truncation; `bins` is after. The two
 * columns are listed separately on purpose: **twelve of the fifteen rows have
 * raw === bins**, i.e. truncation does nothing at all, and only three rows
 * ((20,2), (20,4), (40,4)) actually lose a bin. Without both columns in the
 * table the next reader would take truncation for the common case.
 */
const MEMBER_BINS: readonly { width: number; n: number; raw: number; bins: number }[] = [
  { width: 20, n: 2, raw: 4.5, bins: 4 }, // truncates
  { width: 20, n: 3, raw: 3, bins: 3 },
  { width: 20, n: 4, raw: 2.25, bins: 2 }, // truncates
  { width: 40, n: 2, raw: 9, bins: 9 },
  { width: 40, n: 3, raw: 6, bins: 6 },
  { width: 40, n: 4, raw: 4.5, bins: 4 }, // truncates
  { width: 80, n: 2, raw: 18, bins: 18 },
  { width: 80, n: 3, raw: 12, bins: 12 },
  { width: 80, n: 4, raw: 9, bins: 9 },
  { width: 160, n: 2, raw: 36, bins: 36 },
  { width: 160, n: 3, raw: 24, bins: 24 },
  { width: 160, n: 4, raw: 18, bins: 18 },
  { width: 320, n: 2, raw: 72, bins: 72 },
  { width: 320, n: 3, raw: 48, bins: 48 },
  { width: 320, n: 4, raw: 36, bins: 36 },
]

describe('selMemberBins: a member gets a whole number of 26-tone RUs', () => {
  it('matches the share table on all fifteen (bandwidth, member count) combinations', () => {
    expect(MEMBER_BINS.length).toBe(15)
    for (const { width, n, bins } of MEMBER_BINS) {
      expect(selMemberBins(width, 1 / n)).toBe(bins)
    }
  })

  it('truncates on exactly three rows and is a no-op on the other twelve', () => {
    // The point of this test is the *count*. If a later change made truncation
    // bite on more rows - or stopped it biting on these three - the split moves
    // and the standard's tone tables (below) stop backing the function.
    const truncating = MEMBER_BINS.filter((r) => r.raw !== r.bins)
    const inert = MEMBER_BINS.filter((r) => r.raw === r.bins)
    expect(truncating.map((r) => [r.width, r.n])).toEqual([[20, 2], [20, 4], [40, 4]])
    expect(inert.length).toBe(12)

    // The twelve: `selBins(width) / n` is already a whole number, so `Math.floor`
    // removes nothing. Asserted through `Number.isInteger` on the raw product
    // rather than by eye, because `1 / 3` is not exact in binary - this is the
    // assertion that says the n = 3 column was *checked* and not assumed. (It
    // holds: 9 x (1/3) rounds to exactly 3.0 in IEEE 754 doubles, and likewise
    // at 18, 36, 72 and 144 bins.)
    for (const { width, n, raw } of inert) {
      expect(Number.isInteger(selBins(width) * (1 / n))).toBe(true)
      expect(selBins(width) * (1 / n)).toBe(raw)
      expect(selMemberBins(width, 1 / n)).toBe(selBins(width) / n)
    }

    // The three: the truncated value is the one the standard's own tone tables
    // give, not a rounding of convenience. Checked against Table 27-8 (20 MHz)
    // and Table 27-9 (40 MHz) of IEEE Std 802.11-2024:
    //   (20, 2) 4.5 -> 4: the two 106-tone RUs are [-122:-17] and [17:122],
    //           which cover 26-tone RUs 1-4 and 6-9 - four bins each. 26-tone
    //           RU 5 is [-16:-4, 4:16], "the middle 26-tone RU" (Table 27-8
    //           NOTE 2), and it is inside neither 106-tone RU.
    //   (20, 4) 2.25 -> 2: the four 52-tone RUs are [-121:-70], [-68:-17],
    //           [17:68], [70:121] - two 26-tone RUs each, RU 5 again outside.
    //   (40, 4) 4.5 -> 4: the four 106-tone RUs are [-243:-138], [-109:-4],
    //           [4:109], [138:243] - four of the 18 bins each; the two left out
    //           are 26-tone RUs 5 and 14.
    expect(truncating.map((r) => r.bins)).toEqual([4, 2, 4])
    for (const { width, n, raw, bins } of truncating) {
      expect(bins).toBe(Math.floor(raw))
      expect(selMemberBins(width, 1 / n) * n).toBeLessThan(selBins(width))
    }
  })

  it('floors at one bin, which is one 26-tone RU and so a physical floor', () => {
    // One 26-tone RU is one bin - it is the unit the standard's own CQI report
    // is keyed to (11be section 9.4.1.75) - so a member can never hold less
    // than one.
    //
    // Today's engine never reaches the clamp: the smallest share in the table
    // above is 20 MHz split four ways, which is 2 bins. So this assertion uses
    // a share the engine does not currently produce, and says so, rather than
    // leaving a `Math.max` in the source that provably does nothing.
    expect(Math.min(...MEMBER_BINS.map((r) => r.bins))).toBe(2)
    expect(selMemberBins(20, 1 / 9)).toBe(1) // raw 1.0 - exact, no clamp needed
    expect(selMemberBins(20, 1 / 20)).toBe(1) // raw 0.45 - the clamp
    expect(selMemberBins(320, 1 / 500)).toBe(1) // raw 0.288 - the clamp, wide channel
  })

  it('gives a member the whole channel when its share is all of it', () => {
    // `ruFraction === 1` is what a single-user PPDU and a MU-MIMO member both
    // amount to, so this path must return exactly what `selBins` returns.
    for (const w of [20, 40, 80, 160, 320]) expect(selMemberBins(w, 1)).toBe(selBins(w))
  })
})

describe('selBinStart: members take consecutive runs, and the dropped bin stays visible', () => {
  it('accumulates the bins of the members before it', () => {
    expect(selBinStart(20, [1 / 2, 1 / 2], 0)).toBe(0)
    expect(selBinStart(20, [1 / 2, 1 / 2], 1)).toBe(4)
    expect([0, 1, 2, 3].map((i) => selBinStart(20, [1 / 4, 1 / 4, 1 / 4, 1 / 4], i))).toEqual([0, 2, 4, 6])
    expect([0, 1, 2].map((i) => selBinStart(20, [1 / 3, 1 / 3, 1 / 3], i))).toEqual([0, 3, 6])
    expect([0, 1, 2, 3].map((i) => selBinStart(40, [1 / 4, 1 / 4, 1 / 4, 1 / 4], i))).toEqual([0, 4, 8, 12])
    expect([0, 1, 2, 3].map((i) => selBinStart(80, [1 / 4, 1 / 4, 1 / 4, 1 / 4], i))).toEqual([0, 9, 18, 27])
  })

  it('leaves the truncated bins unclaimed at the top of the channel, where the tables leave them', () => {
    // 20 MHz, two members: bins 0-3 and 4-7, so bin 8 is claimed by nobody -
    // and bin 8 is exactly the bin the standard leaves out (Table 27-8's middle
    // 26-tone RU is in neither 106-tone RU). Consecutive runs are what make
    // that absence countable; giving both members bins 0-3 would hide it.
    const halves = [1 / 2, 1 / 2]
    const lastEnd20 = selBinStart(20, halves, 1) + selMemberBins(20, 1 / 2)
    expect(lastEnd20).toBe(8)
    expect(selBins(20) - lastEnd20).toBe(1)

    // 40 MHz, four members: two bins left over, not one - the 40 MHz table has
    // no middle RU (18 is even), and the bins the four 106-tone RUs leave out
    // are 26-tone RUs 5 and 14.
    const quarters = [1 / 4, 1 / 4, 1 / 4, 1 / 4]
    const lastEnd40 = selBinStart(40, quarters, 3) + selMemberBins(40, 1 / 4)
    expect(selBins(40) - lastEnd40).toBe(2)

    // 80 MHz, four members: nothing left over, 36 / 4 is whole.
    expect(selBinStart(80, quarters, 3) + selMemberBins(80, 1 / 4)).toBe(selBins(80))
  })

  /*
   * The two assertions below are the whole physical content of "which bins".
   *
   * What is NOT assertable here: that two members land on different bins. Bins
   * are drawn independently of one another, and two members are already
   * independent draws (the fading key carries the receiver id), so an assertion
   * that member A's bins differ from member B's would pass while proving only
   * that two integers are unequal. *Where* a member sits has no effect on the
   * distribution at all - exactly none, and the test just above measures it
   * with its instrument rather than quoting a round number. Position
   * exists for a readable record and for the slice that gives inter-bin
   * correlation a value - not for this slice's numbers. That is why there is no
   * third assertion.
   */
  /**
   * The "0.02 dB" that four places quote, measured with its instrument written down — and the
   * finding is that **0.02 dB is not a property of this model, it is the sampling error of an
   * unrecorded run.**
   *
   * The claim it stands for ("where a member sits has no effect on its effective SINR") is
   * exactly true here, not approximately: `smallScaleDb` keys each draw on the bin index, the
   * draws are independent, and `selEffSinrDb` reduces them through an unordered mean. So the
   * true spread between the six four-bin windows of a nine-bin channel is **zero**, and any
   * number a run reports is Monte-Carlo noise that shrinks as 1/√N. Measured on this test's own
   * sampler and keys at seed 1, mean SINR 20 dB, Rayleigh with no shadow:
   *
   * | draws | spread of the six window means | standard error | ratio |
   * | --- | --- | --- | --- |
   * | 20 000 | 0.0207 dB | 0.0187 | 1.11 |
   * | 50 000 | 0.0296 dB | 0.0117 | 2.52 |
   * | 100 000 | 0.0070 dB | 0.0083 | 0.85 |
   *
   * The spread does not even fall monotonically, because it is noise, not a quantity.
   * **So 0.02 dB is a figure from somewhere on that ladder** — and pinning it as a tolerance
   * would pin an artifact. This test pins the claim instead: the spread must be small
   * **relative to the standard error of the means it is a spread of**. That ratio is what
   * "indistinguishable from zero" means quantitatively, and a bound on it is scale-free — it
   * holds at any N, whereas a real position effect blows through it at any N. Measured
   * sensitivity, by tilting each bin's deviation by a constant times its index: **0.05 dB per
   * bin → 12.9 standard errors**, 0.1 → 26.0, 0.25 → 64.9. So the bound of four catches a
   * systematic effect far smaller than any loss this feature reports.
   *
   * **Instrument**: seed 1, transmitter `ap`, receiver `sta-1`, Rayleigh (`shadowSigmaDb: 0`,
   * so the slow layer is out), mean SINR 20 dB, 20 000 independent frames, nine bins each, the
   * six consecutive four-bin windows. Deterministic — the sampler takes the seed, so these
   * numbers reproduce exactly.
   *
   * It is pinned at all because a comment was not enough: the figure is quoted in the design
   * doc, in `selectivity.ts`'s own docblock and in two test comments, and a lesson that wanted
   * to print it had to decline for want of an assertion.
   */
  it('shows position buying nothing: six windows apart by noise and not by physics', () => {
    const cfg: FadingCfg = { shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'rayleigh' }
    const meanSinrDb = 20
    const draws = 20_000
    const full = selBins(20)
    const span = selMemberBins(20, 1 / 2)
    expect([full, span]).toEqual([9, 4])
    // Every four-bin window a nine-bin channel has: starts 0 through 5, so six of them.
    const starts = [...Array(full - span + 1).keys()]
    expect(starts).toEqual([0, 1, 2, 3, 4, 5])

    const sum = starts.map(() => 0)
    const sumSq = starts.map(() => 0)
    for (let i = 0; i < draws; i++) {
      // One frame's nine bins, from the engine's own sampler on the engine's own key scheme.
      const devsDb: number[] = []
      for (let bin = 0; bin < full; bin++) {
        devsDb.push(smallScaleDb(cfg, 1, 'ap', 'sta-1', `frame${i}`, bin))
      }
      starts.forEach((start, k) => {
        const eff = selEffSinrDb(meanSinrDb, devsDb.slice(start, start + span))
        sum[k]! += eff
        sumSq[k]! += eff * eff
      })
    }
    const means = sum.map((t) => t / draws)
    const stdErrs = sumSq.map((q, k) => Math.sqrt(q / draws - means[k]! ** 2) / Math.sqrt(draws))
    const spread = Math.max(...means) - Math.min(...means)
    const worstStdErr = Math.max(...stdErrs)

    // The claim: the windows differ by no more than sampling noise. Four standard errors is the
    // bound; this run comes in at 1.11, and a 0.05 dB-per-bin tilt would come in at 12.9.
    expect(spread).toBeLessThan(4 * worstStdErr)
    // And the measured figures, so the next reader need not re-run anything to know what this
    // run said. These are the numbers the prose above quotes, and they are exact: the sampler
    // takes the seed, so nothing here is a sample of a sample.
    expect(spread).toBeCloseTo(0.0207, 3)
    expect(worstStdErr).toBeCloseTo(0.0187, 3)
    // Non-vacuity: the windows are genuinely fading, so the smallness above is about position
    // and not about a sampler that returned a constant.
    for (const m of means) expect(m).toBeLessThan(meanSinrDb - 2)
  })

  it('keeps every member inside the channel, with runs that do not overlap', () => {
    for (const n of [2, 3, 4]) {
      const fractions = new Array<number>(n).fill(1 / n)
      for (const width of [20, 40, 80, 160, 320]) {
        const full = selBins(width)
        let prevEnd = 0
        for (let i = 0; i < n; i++) {
          const start = selBinStart(width, fractions, i)
          const bins = selMemberBins(width, fractions[i]!)
          expect(start).toBe(prevEnd) // consecutive, hence non-overlapping
          expect(Number.isInteger(start)).toBe(true)
          expect(start + bins).toBeLessThanOrEqual(full) // never past the channel edge
          prevEnd = start + bins
        }
      }
    }
  })

  /*
   * What actually keeps `selCombine`'s overflow gate unreachable, written as arithmetic
   * rather than as a sentence in a comment.
   *
   * The loop above stops at four members because that is all `mac.ts` builds, and that
   * stopping point looks like a test-coverage choice. It is not: it is the whole reason the
   * gate cannot fire. `selMemberBins` floors at one bin, so n members claim **at least** n
   * bins however thin their shares are, and an exactly equal split therefore overflows the
   * channel the moment n passes that channel's bin count. The narrowest channel has nine
   * bins, `mac.ts` caps a group at four (`muDsts.slice(0, 4)` downlink and
   * `users.slice(0, 4)` for a Trigger's users), and four is less than nine — that gap, and
   * not the evenness of the division, is what makes the gate dead code today.
   *
   * So this is a test about a cap in another file, deliberately: raise it past nine and the
   * engine throws on an allocation with nothing wrong with it, and the message `selCombine`
   * prints has to say so rather than blame the shares.
   */
  it('overflows the narrowest channel only past its bin count, which is why the cap of four is safe', () => {
    const NARROWEST = 20
    const full = selBins(NARROWEST)
    expect(full).toBe(9)

    const claimed = (n: number): number => {
      const fractions = new Array<number>(n).fill(1 / n)
      return selBinStart(NARROWEST, fractions, n - 1) + selMemberBins(NARROWEST, 1 / n)
    }
    // Every group size the engine can build fits, and the largest one is not close to the edge.
    expect([2, 3, 4].map(claimed)).toEqual([8, 9, 8])
    for (const n of [2, 3, 4]) expect(claimed(n)).toBeLessThanOrEqual(full)
    // So do all the sizes between the cap and the bin count: the floor is not yet binding.
    for (let n = 5; n <= full; n++) expect(claimed(n)).toBeLessThanOrEqual(full)
    // One past the bin count, and the floor alone overflows it — n members, one bin each.
    expect(claimed(full + 1)).toBe(full + 1)
    expect(claimed(full + 1)).toBeGreaterThan(full)
    // And the shares that did it sum to exactly one, which is what `selCombine`'s message
    // prints to keep this case from being reported as an overlay that was never built.
    const overflowing = new Array<number>(full + 1).fill(1 / (full + 1))
    expect(overflowing.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12)
  })

  /*
   * **The order of the two multiplications is worth one bin, and only at n = 3.**
   *
   * 4a predicted that the per-member count would be `selBins(widthMhz × ruFraction)`.
   * `selMemberBins` computes `selBins(widthMhz) × ruFraction`, floored. In exact arithmetic
   * those are the same product; in doubles they are not, because scaling the *width* by 1/3
   * first produces a non-terminating binary fraction that lands just under the integer, so
   * flooring it loses a bin. Scaling the *bin count* keeps the division exact.
   *
   * This lives here, at the pure-function layer, because it is pure arithmetic — it used to
   * sit at the end of a round-level test in `selectivity-inert.test.ts`, where it only ran
   * after an 80 ms simulation and would have disappeared with that test.
   *
   * It is pinned rather than described because it is the one way this slice could have shipped
   * an off-by-one that no round-level assertion would notice: 23 bins out of 72 is a perfectly
   * plausible number. And it is pinned on **all five widths**, not just the one 4a's note
   * happened to mention, together with the two member counts where the trap does not exist —
   * n = 2 and n = 4 are exact in binary, so the two orders agree there and the hazard would
   * look narrower than it is if only one column were shown.
   */
  it('loses a bin at n = 3 on every width if the width is scaled before the bin count', () => {
    const WIDTHS = [20, 40, 80, 160, 320]
    const scaleWidthFirst = WIDTHS.map((w) => Math.floor(selBins(w * (1 / 3))))
    const scaleBinsFirst = WIDTHS.map((w) => selMemberBins(w, 1 / 3))
    expect(scaleWidthFirst).toEqual([2, 5, 11, 23, 47])
    expect(scaleBinsFirst).toEqual([3, 6, 12, 24, 48])
    for (let i = 0; i < WIDTHS.length; i++) {
      expect(scaleWidthFirst[i]).toBe(scaleBinsFirst[i]! - 1) // exactly one bin, every width
      // The engine's order is exact; 4a's lands strictly below the integer it should have hit.
      expect(selBins(WIDTHS[i]!) * (1 / 3)).toBe(scaleBinsFirst[i])
      expect(selBins(WIDTHS[i]! * (1 / 3))).toBeLessThan(scaleBinsFirst[i]!)
    }
    // n = 2 and n = 4 are exact in binary, so there the two orders agree and there is no trap:
    // the hazard is the share, not the truncation.
    for (const n of [2, 4]) {
      expect(WIDTHS.map((w) => Math.floor(selBins(w * (1 / n)))))
        .toEqual(WIDTHS.map((w) => selMemberBins(w, 1 / n)))
    }
  })

  it('is a pure function of its arguments - same inputs, same bins', () => {
    const fractions = [1 / 3, 1 / 3, 1 / 3]
    expect(selBinStart(160, fractions, 2)).toBe(selBinStart(160, fractions, 2))
    expect(selMemberBins(160, 1 / 3)).toBe(selMemberBins(160, 1 / 3))
  })

  it('does not care how the shares were ordered, only how many bins precede', () => {
    // Unequal shares are not something `mac.ts` builds today (it divides evenly),
    // but the signature takes a list, so the accumulation must be positional and
    // nothing more.
    expect(selBinStart(80, [1 / 2, 1 / 4, 1 / 4], 1)).toBe(18)
    expect(selBinStart(80, [1 / 2, 1 / 4, 1 / 4], 2)).toBe(27)
    expect(selBinStart(80, [1 / 4, 1 / 4, 1 / 2], 2)).toBe(18)
  })
})
