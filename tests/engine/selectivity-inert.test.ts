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
 * | `selCombine`: take the bins from the member's own `ruFraction` | **U only** | — |
 *
 * Every test here is killed by at least one mutation and no mutation killed nothing, so there is
 * no tautology to delete this time. Two are the only thing on the branch that holds its line:
 * the shadow test for the slow layer's interval keying, and the MU test for the bin count —
 * which is also the test slice 4b will have to *change* rather than keep, since the mutation that
 * kills it is exactly 4b's intended fix.
 */
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { mumimoScenario, widthScenario } from '../../src/course/wifiScenes'
import { selBins } from '../../src/engine/selectivity'
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
   * Measured 2026-10-03, 100 ms per run, 45 runs: the largest group is the 3.62 dB margin with
   * all five widths in it, and its pooled drop rates run **14.39 %, 12.71 %, 9.48 %, 5.09 %,
   * 0.52 %** — the nine-bin channel drops frames twenty-seven times as often as the 144-bin one
   * at the same distance above the same ladder. The three other groups (6.62, 4.62, 5.62 dB) all
   * put 20 MHz strictly highest too.
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
      .toEqual(['14.39', '12.71', '9.48', '5.09', '0.52'])
    // 14.39 / 0.52 ≈ 27.7, the "twenty-seven times" of this test's own doc comment. A bound
    // rather than a rounded integer, because the exact rates above already fix the quotient and a
    // nearest-integer assertion would only be a second spelling of them that is easier to get
    // wrong (27.7 rounds to 28, not 27).
    expect(biggest[0].rate / biggest[biggest.length - 1].rate, label(biggest)).toBeGreaterThan(27)

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

describe('selectivity §6 item 4: a multi-user member gets the whole channel’s bins', () => {
  /**
   * **An overestimated quantity asserted as it stands, rather than taken for correct.**
   *
   * An OFDMA member physically occupies its own resource unit, not the channel: this engine's
   * scheduler gives each of three members `ruFraction = 1/3` (`buildMuParts` in mac.ts), and the
   * standard's smallest resource unit — 26 tones — **is one bin** (`selectivity.ts`). So a
   * member's own frequency diversity is a third of the channel's at best and a single bin at
   * worst, while `selCombine` keys the bin count off the PPDU's width and hands it all 72. Its
   * diversity is therefore overestimated by exactly `1 / ruFraction`, and the loss it is charged
   * is smaller than the loss its own resource unit would produce.
   *
   * Building the per-RU version is slice 4b (§7.1), not this one. What this test does is make the
   * present number **impossible to mistake for the right one**: it asserts the overestimate, its
   * size, and the figure the per-RU model would have to produce instead.
   *
   * So this is the one test in this file that slice 4b must **change** rather than keep: taking
   * the bin count from the member's own `ruFraction` is the mutation that kills it, and that
   * mutation is 4b's intended fix. When it lands, `selBins(widthMhz × ruFraction)` becomes the
   * expected value and this comment is the record of what the number used to be.
   */
  it('reports selBins(whole width) for a member whose resource unit is a fraction of it', () => {
    const base = mumimoScenario(false)
    const rs = run({ ...base, fading: RAYLEIGH, selectivity: {} }, 80 * MS)

    // `WIFI_SEL` carries no `ruFraction`, so the member's share is read off the frame of the
    // outcome that follows it: `resolveLock` emits the combining record immediately before the
    // RX_OK/RX_FAIL for the same (node, from) at the same instant.
    const members: { bins: number; widthMhz: number; frac: number }[] = []
    for (let i = 0; i < rs.length; i++) {
      const sel = rs[i]
      if (sel.type !== 'WIFI_SEL') continue
      const outcome = rs.slice(i + 1, i + 4).find((r) => (
        (r.type === 'RX_OK' || r.type === 'RX_FAIL') && r.node === sel.node && r.from === sel.from
      ))
      if (outcome?.type !== 'RX_OK' || outcome.frame.muKind !== 'ofdma') continue
      const part = outcome.frame.muParts?.find((p) => p.dst === sel.node)
      if (part?.ruFraction === undefined) continue // an overhearer, not a member of this PPDU
      members.push({ bins: sel.bins, widthMhz: outcome.frame.widthMhz ?? 20, frac: part.ruFraction })
    }

    // Non-vacuous: the scene really does group, and often enough to measure.
    expect(members.length).toBeGreaterThan(20)
    for (const m of members) {
      expect(m.frac).toBeLessThan(1)
      // What it reports: the whole channel's bins, by the standard's own arithmetic.
      expect(m.bins).toBe(selBins(m.widthMhz))
      // What its own resource unit would give, and the factor between them — which is the size
      // of the overestimate, computed from the member's own share rather than written down.
      expect(m.bins).toBeGreaterThan(selBins(m.widthMhz * m.frac))
      expect(m.bins * m.frac).toBeCloseTo(selBins(m.widthMhz * m.frac), 9)
      // And the floor of the per-RU model: the standard's smallest RU is one bin, so a member
      // could be entitled to as little as one.
      expect(selBins(m.widthMhz * m.frac)).toBeGreaterThanOrEqual(1)
    }
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
