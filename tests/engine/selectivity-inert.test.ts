/**
 * Every combination the `selectivity` schema *allows*, proved not to be empty — design doc
 * 2026-10-03-selectivity §6's lower half plus its closing paragraph.
 *
 * This branch has shipped three configurations that were legal and provably did nothing
 * (slice 3's `contention` + `rmnr`, slice 3.5's SRRR `RRTT` bit, the batch SSBD §5 names), and
 * each one made a feature look finished. §6 therefore named this slice's candidates in advance.
 * Two of them are already proved and are **not** repeated here:
 *
 *   - **§6 item 1, the AMP carve-out** — `selectivity-round.test.ts` runs a scene with both AMP
 *     tiers twice, differing only by the section, and matches the whole record stream field for
 *     field including `seq`, with zero `WIFI_SEL`; deleting the carve-out moves 354 records.
 *   - **§8.8, the branch not entered** — the same file counts the draws through the fading
 *     sampler, so "the section absent takes no per-bin draw" covers the branch and not merely an
 *     equal result.
 *
 * What is left, and what this file is: §6 items 2, 3 and 4, and the closing paragraph's
 * selectivity-beside-shadowing case.
 *
 * ---
 *
 * **None of this can be red first, and saying otherwise would be a lie.** Tasks 1 to 4 built the
 * geometry, the combiner, the switch and the wiring; every behaviour below already works, so a
 * test written here fails against nothing. The sensitivity of each assertion was established by
 * **mutation** instead — one line of `src/` changed at a time, the three selectivity test files
 * run, the file restored from a byte copy and `git diff` confirmed empty. Nine mutations, and
 * which of this file's seven tests each one killed (M = margin-rich pair, T = the thin-margin
 * control, F = the flat-fade correction, W = the width sweep, U = the MU bin count, S = the
 * shadow test):
 *
 * | mutation (one line of `src/`) | kills here | kills elsewhere |
 * | --- | --- | --- |
 * | `selBins`: drop the `× widthMhz / 20`, so every width reports 9 bins | M(40 MHz), W, U, S | Task 1's geometry, Task 4's sweep ×2 |
 * | `selCombine`: decide on `sel.meanSinrDb`, not `sel.effSinrDb` | T, W | Task 4's sweep, Task 4's MCS ladder |
 * | `selCombine`: stop subtracting `flatFadeDb` from the mean | M ×2, T, F, W, S | Task 4's sweep |
 * | `selEffSinrDb`: return the worst bin instead of the capacity combination | M ×2, F, W, S | Task 2's combiner, Task 4 ×3 |
 * | `smallScaleDb`: ignore the `bin` argument in the key | M ×2, F, W, S | the 4-bit calibration, Task 4 ×4 |
 * | `shadowDb`: key the slow layer by `tNs` rather than by the interval index | **S only** | — |
 * | `selCombine`: `worstBinDb` from `Math.max` instead of `Math.min` | M ×2 | Task 4 ×2 |
 * | delete the AMP carve-out (`isOfdmWifiPpdu` → `true`) | **none** | Task 4's AMP stream — which is why that item is not re-proved here |
 * | `selCombine`: give a member the whole PPDU's bins again, as before slice 4b | **U only** | slice 4b's round tests ×5 of 8 |
 *
 * Every test here is killed by at least one mutation and no mutation killed nothing, so there is
 * no tautology to delete this time. Two are the only thing on the branch that holds its line:
 * the shadow test for the slow layer's interval keying, and the MU test for the bin count —
 * and that MU test is the one slice 4b **changed** rather than kept. 4a wrote this table's last
 * row as "take the bins from the member's own `ruFraction`", because that mutation was 4b's
 * intended fix and killing the test was how 4a knew the test was load-bearing. 4b made that
 * mutation the engine's rule, so the row is now its inverse: what kills U today is putting the
 * member back on the whole channel. That row **was** re-measured the same way (one line of
 * `selCombine` forced to the whole-channel share, the three selectivity files plus
 * `tests/model/view.test.ts` and `tests/ui/format.test.ts` run, then the file restored from a
 * byte copy and `git diff` confirmed to carry only this slice's own change and not the
 * mutation). U dies here, and **five of slice 4b's eight round tests** die in
 * `selectivity-round.test.ts`. The three survivors are the interesting part, and all three
 * survive on purpose:
 *
 *   - the **MU-MIMO** one, because MU-MIMO already read the whole channel — which is what makes
 *     it an assertion that nothing moved rather than a second copy of the others;
 *   - **"never mixes members that hold a share with members that hold none"**, which is about
 *     what `mac.ts` builds, not about what `selCombine` reads of it;
 *   - **"says on every row what its bins were counted against"**, which asserts that
 *     `WIFI_SEL.widthMhz` is there and consistent, and that stays true whichever bins were read.
 */
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { mumimoScenario, widthScenario } from '../../src/course/wifiScenes'
import { selBins, selMemberBins } from '../../src/engine/selectivity'
import { selRowDecoded, selRows } from './selectivity-pairing'
import { noiseDbm } from '../../src/engine/phy'
import { RICIAN_K_DEFAULT_DB, type FadingCfg } from '../../src/engine/fading'
import type { ChannelWidth } from '../../src/model/caps'
import type { Scenario } from '../../src/model/scenario'
import type { RxFailReason, TLRecord } from '../../src/model/records'

const MS = 1_000_000

/** The pessimistic distribution and the engine's default, with the slow layer out of the way. */
const RAYLEIGH: FadingCfg = { shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'rayleigh' }
/** The line-of-sight case, at the K factor the engine already defaults to (`fading.ts`). */
const RICIAN: FadingCfg = {
  shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'rician', ricianKdB: RICIAN_K_DEFAULT_DB,
}

const run = (s: Scenario, ns: number): TLRecord[] => [...new Simulation(s).runUntil(ns).records]

const ofType = <K extends TLRecord['type']>(rs: TLRecord[], type: K): Extract<TLRecord, { type: K }>[] =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type)

/** The uplink's own combining records: the saturated direction, and the one the rate loop drives. */
const upSels = (rs: TLRecord[]): Extract<TLRecord, { type: 'WIFI_SEL' }>[] =>
  ofType(rs, 'WIFI_SEL').filter((s) => s.from === 'sta-1')

const lowSinrFails = (rs: TLRecord[]): number =>
  ofType(rs, 'RX_FAIL').filter((r) => r.reason === 'lowSinr').length

/** Every `RX_FAIL` reason with its count, so a comparison cannot miss a reason by not asking. */
const failsByReason = (rs: TLRecord[]): Partial<Record<RxFailReason, number>> => {
  const out: Partial<Record<RxFailReason, number>> = {}
  for (const r of ofType(rs, 'RX_FAIL')) out[r.reason] = (out[r.reason] ?? 0) + 1
  return out
}

/**
 * The whole record stream with the new record type and the sequence numbers taken out.
 *
 * `seq` has to go because `WIFI_SEL` is inserted *into* the stream: one extra record renumbers
 * every record after it, so a run that emits them can never match one that does not on `seq`,
 * however identical everything else is. Nothing else is dropped — this is a field-for-field
 * comparison of every other record, which is what makes "nothing followed" mean the timeline
 * and not a chosen summary of it.
 */
const strippedStream = (rs: TLRecord[]): string =>
  JSON.stringify(rs.filter((r) => r.type !== 'WIFI_SEL').map(({ seq: _seq, ...rest }) => rest))

const quantile = (xs: number[], f: number): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * f))]
}

describe('selectivity §6 item 2: a link with margin to spare measures a loss and nothing follows', () => {
  /**
   * The `width` lesson's own shipped scene: a router and a laptop on the same desk of the study,
   * ~1.4 m apart, with the laptop optionally moved two metres down the desk. Nothing about the
   * geometry is tuned for this test — it is the scene the lesson ships, and the schema could not
   * refuse it anyway: being generous with the geometry is allowed (§6 item 2).
   */
  const desk = (
    w: ChannelWidth, o: { fade?: FadingCfg | null; sel?: boolean; x?: number } = {},
  ): Scenario => {
    const base = widthScenario(w, 1)
    const fade = o.fade === undefined ? RAYLEIGH : o.fade
    return {
      ...base,
      nodes: base.nodes.map((n) => (
        n.id === 'sta-1' && o.x !== undefined ? { ...n, pos: { ...n.pos, x: o.x } } : n
      )),
      ...(fade === null ? {} : { fading: fade }),
      ...(o.sel === false ? {} : { selectivity: {} }),
    }
  }

  const SPARE = [
    // Rayleigh at 20 MHz: the nine-bin channel on the desk. The deepest bin sits ~10 dB under
    // the mean and the worst frame of the run loses 9.95 dB, against 12.78 dB of room.
    { name: 'rayleigh, 20 MHz, on the desk', w: 20 as ChannelWidth, fade: RAYLEIGH, x: undefined },
    // Rician K = 6 dB two metres out: the line-of-sight case at the engine's own default K, which
    // is the distribution a 2 m desk link would actually have.
    { name: 'rician K=6, 40 MHz, two metres out', w: 40 as ChannelWidth, fade: RICIAN, x: 5 },
  ]

  /**
   * **"It measures something and nothing follows", pinned explicitly rather than left looking as
   * though it worked.** The three halves of that sentence are asserted separately:
   *
   *   1. the records exist and carry a real loss — every frame of the run, `lossDb > 0`, with a
   *      median near §4.1's figure and a deepest bin several dB under the mean;
   *   2. the margin is what absorbs it — the median room above the rate's own threshold exceeds
   *      the *worst* loss in the whole run, which is the structural reason nothing flips rather
   *      than an observation that nothing did;
   *   3. nothing followed — `RX_FAIL` matches the feature-off run reason by reason, and in fact
   *      the entire record stream matches field for field once the new records are removed.
   *
   * **Which "off" this is, and why.** The baseline is the scene as it *ships* — no `fading`
   * section, no `selectivity` section — which is the configuration every published scenario is
   * in and therefore what "the feature off" means for the fixtures. Against the other possible
   * baseline (this same fading with only the section removed) the counts do **not** match, and
   * that is asserted in its own test below rather than left out.
   */
  it.each(SPARE)('$name: WIFI_SEL with lossDb > 0, and the timeline does not move', ({ w, fade, x }) => {
    const on = run(desk(w, { fade, x }), 100 * MS)
    const shipped = run(desk(w, { fade: null, sel: false, x }), 100 * MS)
    const sels = upSels(on)

    // 1. it measured something, on all but a few per cent of the frames
    //
    // **Not "every frame", and the difference is a real property of the combiner rather than a
    // tolerance.** Measured here: 90.7 % of the nine-bin frames lose, with the remainder gaining
    // up to 1.77 dB. A set of dB deviations that averages 0 dB does not average 1 in *linear*
    // power, so a draw whose linear mean lands above 1 combines to slightly better than the flat
    // mean — the same asymmetry Task 2 caught in its own "Jensen's inequality" sanity test, which
    // was wrong for exactly this reason. At 72 bins the deviations concentrate and every frame
    // loses (measured 100 %); at 9 they do not, so asserting that they do would be a test that
    // is itself false.
    expect(sels.length).toBeGreaterThan(50)
    const lossy = sels.filter((s) => s.lossDb > 0)
    expect(lossy.length / sels.length).toBeGreaterThan(0.85)
    expect(quantile(sels.map((s) => s.lossDb), 0.5)).toBeGreaterThan(0.5)
    expect(quantile(sels.map((s) => s.worstBinDb), 0.5)).toBeLessThan(-5)
    expect(sels.map((s) => s.bins)).toEqual(sels.map(() => selBins(w)))

    // 2. and the margin, read out of the same records, is bigger than the worst of it
    const marginDb = quantile(sels.map((s) => s.meanSinrDb - s.threshDb), 0.5)
    const worstLossDb = Math.max(...sels.map((s) => s.lossDb))
    expect(marginDb).toBeGreaterThan(worstLossDb)

    // 3. so nothing followed: the counts the brief asks for, and then the whole stream
    expect(lowSinrFails(on)).toBe(lowSinrFails(shipped))
    expect(failsByReason(on)).toEqual(failsByReason(shipped))
    expect(strippedStream(on)).toBe(strippedStream(shipped))
    // Non-vacuity of that last comparison: there were records to compare.
    expect(on.length).toBeGreaterThan(1000)
  }, 120_000)

  /**
   * The ruler's own control, and the reason the test above is not "a dead code path compared with
   * itself": the *same builder*, one width wider, puts the link 3.75 dB above its threshold
   * instead of 12.78, and there the per-bin decision does flip frames. So the equality above is a
   * property of the margin, not of an instrument that cannot see a consequence.
   */
  it('the same scene with a thin margin does flip frames, so the equality above is the margin’s', () => {
    const thin = run(desk(160, { fade: RAYLEIGH }), 100 * MS)
    const shipped = run(desk(160, { fade: null, sel: false }), 100 * MS)
    const sels = upSels(thin)
    expect(quantile(sels.map((s) => s.meanSinrDb - s.threshDb), 0.5))
      .toBeLessThan(Math.max(...sels.map((s) => s.lossDb)))
    expect(lowSinrFails(thin)).toBeGreaterThan(0)
    expect(lowSinrFails(thin)).not.toBe(lowSinrFails(shipped))
    expect(strippedStream(thin)).not.toBe(strippedStream(shipped))
  }, 120_000)

  /**
   * **The correction §6 item 2 needs, measured.** The item's wording — "`RX_FAIL` matches the run
   * with the feature off" — is true against the shipped (unfaded) scene and **false** against the
   * run that differs by the section alone, and the reason is structural rather than a tolerance:
   * the per-bin draw **replaces** this frame's flat draw (Task 4's `selCombine`), it does not
   * stack on it. A flat Rayleigh draw fades the whole PPDU at once, so a deep one kills it
   * outright; the same draw split across nine bins is averaged by capacity before the decision
   * sees it. So on a margin-rich link the feature does not add a consequence — it *removes* the
   * flat fade's, and it always removes it in that direction.
   *
   * This is asserted rather than noted because the item's own sentence would otherwise read as
   * though the only available comparison had been made.
   */
  it('against the same fading with the section removed the counts do NOT match: the per-bin path saves frames', () => {
    for (const { w, fade, x } of SPARE) {
      const on = run(desk(w, { fade, x }), 100 * MS)
      const flat = run(desk(w, { fade, x, sel: false }), 100 * MS)
      expect(lowSinrFails(flat), `${w} MHz flat`).toBeGreaterThan(0)
      expect(lowSinrFails(on), `${w} MHz per-bin`).toBeLessThan(lowSinrFails(flat))
    }
  }, 120_000)
})

describe('selectivity §6 item 3: twenty megahertz is the most affected width, not the least', () => {
  /** Where the `width` lesson's own `tryThis` sends the laptop: the middle of the living room. */
  const LIVING_ROOM = { x: 12.5, y: 6 }
  const WIDTHS: ChannelWidth[] = [20, 40, 80, 160, 320]
  /**
   * Offsets added on top of the noise-floor equalisation, in dB.
   *
   * They exist to **populate the margin groups**, not to pick a winner: the rate loop settles a
   * link at one of a handful of distances above its threshold (the ladder is quantised), so a
   * single power per width leaves 20 MHz alone in its own group — which is exactly why Task 4's
   * sweep could compare four widths and not five. Nine offsets per width put every width into
   * several groups, and the comparison is then made *inside* a group, chosen by the margins
   * themselves. `physics`-free: a power offset is a scenario knob, not a model constant.
   */
  const OFFSETS_DB = [0, 1, 2, 3, 4, 5, 6, 7, 8]

  /**
   * One width's scene with the mean SINR held across widths, as Task 4 established: both radios
   * are lifted by the noise floor's own rise, `noiseDbm(w) − noiseDbm(20)`, computed from the
   * engine's formula and never written down. Without it the 12.04 dB the floor moves from 20 to
   * 320 MHz swamps the effect under test — and that floor, not selectivity, is what the `width`
   * lesson already teaches as the real cost of a wide channel (§4.1).
   */
  const sweepScene = (w: ChannelWidth, extraDb: number): Scenario => {
    const base = widthScenario(w, 1)
    const liftDb = noiseDbm(w) - noiseDbm(20) + extraDb
    return {
      ...base,
      nodes: base.nodes.map((n) => ({
        ...n,
        txPowerDbm: n.txPowerDbm + liftDb,
        ...(n.id === 'sta-1' ? { pos: { ...n.pos, ...LIVING_ROOM } } : {}),
      })),
      fading: RAYLEIGH,
      selectivity: {},
    }
  }

  interface Row {
    w: ChannelWidth
    bins: number
    /** Median room above the rate's own threshold, read out of `WIFI_SEL` itself. */
    marginDb: number
    /**
     * The receiver's `lowSinr` failures, and the uplink data PPDUs they are counted against.
     *
     * Named precisely because this branch has read this record wrong before: `RX_FAIL` is the
     * *receiver* failing to decode, which is what a per-bin decode decision produces and what
     * this test is about. It is **not** "the sender's attempt failed" — a lost ACK leaves an
     * `RX_MISS` and feeds the rate loop through `RETRY`/`DROP`, which is a different question
     * (and the one `selectivity-round.test.ts` asks).
     */
    fails: number
    ppdus: number
  }

  const widthRow = (w: ChannelWidth, extraDb: number): Row => {
    const rs = run(sweepScene(w, extraDb), 100 * MS)
    const sels = upSels(rs)
    expect(sels.length, `${w} MHz +${extraDb} dB: no uplink reception to read`).toBeGreaterThan(20)
    return {
      w,
      bins: sels[0].bins,
      marginDb: quantile(sels.map((s) => s.meanSinrDb - s.threshDb), 0.5),
      fails: lowSinrFails(rs),
      ppdus: ofType(rs, 'TX_START')
        .filter((r) => r.frame.kind === 'data' && r.frame.src === 'sta-1').length,
    }
  }

  /**
   * **The direction, in the only form a round supports.** §6 item 3 as planned asked for the
   * `RX_FAIL` *count* to fall strictly across the five widths; Task 4 measured 14, 44, 47, 23, 4
   * and §4.4 corrected the criterion: it is the drop **rate** per PPDU (a 320 MHz channel puts
   * three times as many PPDUs on the air in the same 100 ms), and it is only comparable **at
   * equal margin**, because the closed rate loop lets a width pay for a worse channel in rate
   * instead of in drops. §4.1's open-loop 34.43 % → 7.14 % are draws at a fixed 20 dB SINR; no
   * round produces them and nothing here quotes them.
   *
   * What this adds to Task 4's sweep, which compared the four widths that happened to share a
   * margin: **20 MHz is in the comparison.** Runs are pooled by the margin the loop settled them
   * at, so the nine-bin channel lands in a group with the wider ones, and the group's drop rates
   * are pooled per width — one width's rate is its failures over its PPDUs across every run in
   * the group, which is the per-PPDU rate of the group and not an average of ratios.
   *
   * Re-measured 2026-10-03 under Task 6c's PPDU-format gate (100 ms per run, 45 runs): the
   * largest group is still the 3.62 dB margin with all five widths in it, and its pooled drop
   * rates run **14.66 %, 13.10 %, 9.81 %, 5.61 %, 0.75 %** — the nine-bin channel drops frames
   * nineteen times as often as the 144-bin one at the same distance above the same ladder. The
   * other groups put 20 MHz strictly highest too.
   *
   * **Before that gate the column read 14.39, 12.71, 9.48, 5.09, 0.52 %**, a ratio of 27.7
   * rather than 19.5. The difference is the non-HT ACKs: they used to be judged on nine bins
   * they have no 26-tone RU for, at every width, and dropping them out of the per-bin path
   * raises every rate a little and the widest one most. These figures were re-measured against
   * the corrected rule, not reconciled with the old ones — the lesson quotes measurements of
   * the engine, so they follow it.
   */
  it('drops the most often of the five widths, pooled at the margin the rate loop settled at', () => {
    const rows = WIDTHS.flatMap((w) => OFFSETS_DB.map((d) => widthRow(w, d)))
    expect(rows.map((r) => r.bins)).toEqual(rows.map((r) => selBins(r.w)))

    // Group by the margin itself. The key is the measured median, so which widths end up
    // comparable is decided by the runs and not by this test.
    const groups = new Map<string, Row[]>()
    for (const r of rows) {
      const k = r.marginDb.toFixed(2)
      groups.set(k, [...(groups.get(k) ?? []), r])
    }
    /** Pooled failures per PPDU for each width present in a group, narrowest first. */
    const pooled = (g: Row[]): { w: ChannelWidth; rate: number }[] => {
      const byW = new Map<ChannelWidth, { f: number; p: number }>()
      for (const r of g) {
        const cur = byW.get(r.w) ?? { f: 0, p: 0 }
        byW.set(r.w, { f: cur.f + r.fails, p: cur.p + r.ppdus })
      }
      return [...byW.entries()].sort((a, b) => a[0] - b[0]).map(([w, v]) => ({ w, rate: v.f / v.p }))
    }

    const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
    const [biggestMargin, biggestRows] = sorted[0]
    const biggest = pooled(biggestRows)
    const label = (ps: { w: ChannelWidth; rate: number }[]): string =>
      ps.map((p) => `${p.w}:${(p.rate * 100).toFixed(2)}%`).join(' ')
    // The largest group has to carry all five widths, or the comparison this test exists for was
    // not available and a weaker one must not pass silently in its place.
    expect(biggest.map((p) => p.w), label(biggest)).toEqual(WIDTHS)
    // Non-vacuous at the narrow end: a chain of zeros would be strictly nothing.
    expect(biggest[0].rate, label(biggest)).toBeGreaterThan(0)
    for (let i = 1; i < biggest.length; i++) {
      expect(biggest[i].rate, `${biggest[i].w} against ${biggest[i - 1].w} MHz: ${label(biggest)}`)
        .toBeLessThan(biggest[i - 1].rate)
    }
    // The headline the `width` lesson may print: an order of magnitude between the ends.
    expect(biggest[0].rate).toBeGreaterThan(10 * biggest[biggest.length - 1].rate)

    /*
     * The four figures the `width` lesson's `limits` entry prints, pinned here rather than left in
     * a doc comment (review of 2026-10-03, finding 4c): the margin this group IS, both ends of the
     * pooled rate column, and the end-to-end multiple. They are exact, not approximate — every
     * run here is deterministic and a pooled rate is one integer over another — so a drift of any
     * kind turns this red with both columns printed, which is what the lesson needs: it tells a
     * reader to hold the margin comparable and then quotes these numbers as the result.
     */
    expect(biggestMargin, label(biggest)).toBe('3.62')
    expect(biggest.map((p) => (p.rate * 100).toFixed(2)), label(biggest))
      .toEqual(['14.66', '13.10', '9.81', '5.61', '0.75'])
    // 14.66 / 0.75 ≈ 19.5, the "nineteen times" of this test's own doc comment. A bound rather
    // than a rounded integer, because the exact rates above already fix the quotient and a
    // nearest-integer assertion would only be a second spelling of them that is easier to get
    // wrong (19.5 rounds to 20, not 19).
    expect(biggest[0].rate / biggest[biggest.length - 1].rate, label(biggest)).toBeGreaterThan(19)

    // And in every group where 20 MHz can be compared with a wider channel at all, it is the
    // worst of them — so the nine-bin case being the most affected is not one group's accident.
    const comparable = [...groups.values()].map(pooled)
      .filter((ps) => ps.length > 1 && ps[0].w === 20)
    expect(comparable.length).toBeGreaterThanOrEqual(3)
    for (const ps of comparable) {
      expect(Math.max(...ps.map((p) => p.rate)), label(ps)).toBe(ps[0].rate)
      expect(ps[0].rate, label(ps)).toBeGreaterThan(ps[1].rate)
    }
  }, 600_000)
})

describe('selectivity, slice 4b: a multi-user member gets its own resource unit’s bins', () => {
  /**
   * **4a asserted an overestimate; this is what 4b replaced that assertion with.**
   *
   * An OFDMA member physically occupies its own resource unit, not the channel: this engine's
   * scheduler gives each of three members `ruFraction = 1/3` (`buildMuParts` in mac.ts), and the
   * standard's smallest resource unit — 26 tones — **is one bin** (`selectivity.ts`). Until
   * slice 4b `selCombine` keyed the bin count off the PPDU's width and handed a member all 72,
   * overestimating its frequency diversity by exactly `1 / ruFraction` and charging it a smaller
   * loss than its own resource unit produces. 4a could not fix that and so asserted it instead,
   * leaving this note: "this is the one test in this file that slice 4b must change rather than
   * keep", with `selBins(widthMhz × ruFraction)` named as the value that would replace it.
   *
   * **4a's predicted value is off by a bin on this very scene**, because the order of the two
   * multiplications is not free in floating point: the engine computes
   * `selBins(widthMhz) × ruFraction`, floored, and scaling the *width* first loses a bin at
   * n = 3 on all five widths. That is pure arithmetic and so it is pinned at the pure-function
   * layer, in `tests/engine/selectivity.test.ts` ("loses a bin at n = 3 on every width…"), not
   * here behind an 80 ms round. What this test does is the part that needs a round: that the
   * record the engine emits agrees, row by row, with the PPDU it judged.
   *
   * **Measuring instrument**: `mumimoScenario(false)` (so OFDMA, not MU-MIMO) with Rayleigh
   * fading and `selectivity`, over **80 ms**, counting the **OFDMA member subset** of
   * `WIFI_SEL` — members only, failures included (see `selectivity-pairing.ts` for why that
   * last word is load-bearing).
   */
  it('reports the member’s own bins, from its own share, with nothing truncated on this scene', () => {
    const base = mumimoScenario(false)
    const rs = run({ ...base, fading: RAYLEIGH, selectivity: {} }, 80 * MS)

    // One pairing measure for every selectivity test (`selectivity-pairing.ts`). This file used
    // to look forward to the `RX_OK` instead, which silently dropped every member reception
    // that failed — and slice 4b is the change that makes a member fail. On this scene that was
    // 95 members audited out of 98.
    const rows = selRows(rs)
      .filter((x) => x.frame.muKind === 'ofdma' && x.part?.ruFraction !== undefined)
    const members = rows.map((x) => ({
      bins: x.sel.bins, binStart: x.sel.binStart, widthMhz: x.sel.widthMhz,
      frac: x.part!.ruFraction!, recorded: x.sel.ruFraction,
      decoded: selRowDecoded(rs, x),
    }))

    // Non-vacuous: the scene really does group, and often enough to measure. 98 member rows at
    // 80 ms, of which 3 failed to decode — the three the old forward pairing could not see.
    expect(members.length).toBe(98)
    expect(members.filter((m) => !m.decoded).length).toBe(3)
    for (const m of members) {
      expect(m.frac).toBeLessThan(1)
      // The record states the share it used, which is what makes `bins` readable at all: 24 on
      // a 72-bin channel is a member's resource unit, not a 72-bin channel reporting 24.
      expect(m.recorded).toBe(m.frac)
      // What it reports now: the member's own bins, computed from the member's own share.
      expect(m.bins).toBe(selMemberBins(m.widthMhz, m.frac))
      expect(m.bins).toBeLessThan(selBins(m.widthMhz))
      // The overestimate 4a asserted, stated as the factor that is now gone.
      expect(selBins(m.widthMhz) / m.bins).toBeCloseTo(1 / m.frac, 9)
      // Nothing is truncated on this scene: 160 MHz over two or three members divides the bin
      // count whole, so the engine's floor does nothing here. The truncation itself is covered
      // where it bites, at the pure-function layer.
      expect(selBins(m.widthMhz) * m.frac).toBe(m.bins)
      expect(Number.isInteger(selBins(m.widthMhz) * m.frac)).toBe(true)
      // The run stays inside the channel — the gate `selCombine` throws on.
      expect(m.binStart).toBeGreaterThanOrEqual(0)
      expect(m.binStart + m.bins).toBeLessThanOrEqual(selBins(m.widthMhz))
    }
    // Both shares the scene builds are present, so no row above is one group size's accident.
    expect(new Set(members.map((m) => m.frac))).toEqual(new Set([1 / 2, 1 / 3]))
  }, 120_000)
})

describe('selectivity beside shadowing: two dimensions, neither eating the other', () => {
  /** A 20 ms coherence time, so a 200 ms round crosses ten intervals. */
  const COHERENCE_MS = 20
  const SHADOW_SIGMA_DB = 8

  /**
   * The shadow's own interval index for a time, mirroring `shadowDb` in fading.ts exactly
   * (`floor(tNs / round(coherenceMs × 1e6))`). Written here rather than imported because the
   * engine keeps it inside the sampler; if it ever stops matching, the first assertion below —
   * that the mean is constant inside an interval — is what fails.
   */
  const intervalOf = (tNs: number): number =>
    Math.floor(tNs / Math.max(1, Math.round(COHERENCE_MS * 1e6)))

  /**
   * Shadowing moves in time, selectivity across frequency (§3.2: a shadow is the whole channel
   * together, so the slow layer is deliberately **not** split per bin). Neither should eat the
   * other, and both halves are asserted:
   *
   *   - **the shadow still steps**: `meanSinrDb` is constant inside a coherence interval and
   *     jumps across one, ten distinct levels spanning 20.7 dB in a 200 ms round;
   *   - **selectivity does not notice**: the `lossDb` distribution is the same in every one of
   *     those intervals — medians inside a 0.27 dB band while the mean they sit on moves 20.7 dB.
   *
   * **The ruler, which was wrong the first time.** Bucketing these records by their own
   * timestamp puts a 20.69 dB spread inside one interval, and the cause is not the physics: a
   * lock's level is drawn when the preamble is acquired, so a PPDU that *straddles* a coherence
   * boundary carries the previous interval's shadow and reports it under the next interval's
   * timestamp. The reception's own `RX_START` is the right clock, and the broken reading is
   * asserted beside the good one so the next reader does not have to rediscover it.
   */
  it('the mean jumps between coherence intervals while the loss distribution stays put', () => {
    const base = widthScenario(160, 1)
    const scen: Scenario = {
      ...base,
      fading: { shadowSigmaDb: SHADOW_SIGMA_DB, coherenceMs: COHERENCE_MS, smallScale: 'rayleigh' },
      selectivity: {},
    }
    const rs = run(scen, 200 * MS)

    const rows: { startNs: number; endNs: number; meanSinrDb: number; lossDb: number }[] = []
    for (let i = 0; i < rs.length; i++) {
      const sel = rs[i]
      if (sel.type !== 'WIFI_SEL' || sel.from !== 'sta-1') continue
      let startNs = sel.t
      for (let j = i - 1; j >= 0; j--) {
        const p = rs[j]
        if (p.type === 'RX_START' && p.node === sel.node && p.from === sel.from) {
          startNs = p.t
          break
        }
      }
      rows.push({ startNs, endNs: sel.t, meanSinrDb: sel.meanSinrDb, lossDb: sel.lossDb })
    }
    expect(rows.length).toBeGreaterThan(200)
    expect(rows.filter((r) => r.lossDb > 0).length).toBe(rows.length)

    const bucket = (key: 'startNs' | 'endNs'): Map<number, typeof rows> => {
      const m = new Map<number, typeof rows>()
      for (const r of rows) {
        const k = intervalOf(r[key])
        m.set(k, [...(m.get(k) ?? []), r])
      }
      return m
    }
    const spread = (xs: number[]): number => Math.max(...xs) - Math.min(...xs)

    // The shadow holds steady inside an interval — the reception's own acquisition clock.
    const byStart = bucket('startNs')
    expect(byStart.size).toBeGreaterThanOrEqual(8)
    for (const [k, g] of byStart) {
      expect(spread(g.map((r) => r.meanSinrDb)), `interval ${k}`).toBeLessThan(1e-9)
    }
    // …and the broken clock, recorded: a straddling PPDU reports the old shadow at a new time.
    const byEnd = [...bucket('endNs').values()].map((g) => spread(g.map((r) => r.meanSinrDb)))
    expect(Math.max(...byEnd)).toBeGreaterThan(1)

    // The shadow jumps across intervals, and by more than a rounding.
    const levels = [...byStart.entries()].sort((a, b) => a[0] - b[0])
      .map(([, g]) => g[0].meanSinrDb)
    expect(new Set(levels.map((l) => l.toFixed(6))).size).toBe(levels.length)
    for (let i = 1; i < levels.length; i++) {
      expect(Math.abs(levels[i] - levels[i - 1]), `interval ${i}`).toBeGreaterThan(1)
    }
    const meanSpanDb = spread(levels)
    expect(meanSpanDb).toBeGreaterThan(2 * SHADOW_SIGMA_DB)

    // And the loss distribution is the same in every one of them: the frequency dimension does
    // not know the time dimension moved. Compared against the span it is riding on, which is
    // what makes "the same" a measurement rather than a tolerance pulled out of the air.
    const medians = [...byStart.values()].map((g) => quantile(g.map((r) => r.lossDb), 0.5))
    const p90s = [...byStart.values()].map((g) => quantile(g.map((r) => r.lossDb), 0.9))
    expect(spread(medians)).toBeLessThan(meanSpanDb / 10)
    expect(spread(p90s)).toBeLessThan(meanSpanDb / 10)
    // The two ends of the shadow's range, which is the "inside and outside" of the claim: the
    // deepest-shadowed interval and the strongest one give the same loss.
    const ends = [...byStart.values()].sort((a, b) => a[0].meanSinrDb - b[0].meanSinrDb)
    const lossOf = (g: typeof rows): number => quantile(g.map((r) => r.lossDb), 0.5)
    expect(Math.abs(lossOf(ends[0]) - lossOf(ends[ends.length - 1]))).toBeLessThan(0.5)
  }, 300_000)
})
