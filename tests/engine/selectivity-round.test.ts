/**
 * Frequency selectivity as it reaches a reader: whole rounds, read back out of the record
 * stream, never a sampled statistic (design doc 2026-10-03-selectivity §9.4/§9.5).
 *
 * Tasks 1 to 3 of this slice built the bin geometry, the capacity combiner, the `WIFI_SEL`
 * record and the scenario switch, and every one of them was inert: nothing emitted anything.
 * This file is the acceptance of the wiring, and the first two tests are the slice's
 * conclusion rather than coverage of it. The other two are the carve-out and the switch: AMP's
 * two non-OFDM paths must come out field-for-field unchanged, and with the section absent no
 * bin-keyed draw may be taken at all — the branch, not merely its result.
 *
 * ---
 *
 * **The sweep scene, and why it is not `widthScenario(w, 1)` as it ships.** The design's
 * §4.1 table was measured at a *fixed* mean SINR of 20 dB with a link sitting exactly on its
 * rate's margin. A round of the shipped scene holds neither fixed, and two other things move
 * with the width at the same time:
 *
 *   - **the noise floor**, by 12.04 dB from 20 to 320 MHz (`noiseDbm`), which is the *other*
 *     thing the `width` lesson teaches and which §4.1 itself calls the real cost of a wide
 *     channel. Left in, it swamps the effect under test;
 *   - **the rate-control loop**, which answers a failure by stepping down and so hands itself
 *     a wider margin — so a channel that suffers more selectivity partly pays in rate instead
 *     of in drops.
 *
 * So both radios are turned up by exactly the noise floor's own rise, `noiseDbm(w) −
 * noiseDbm(20)`, which holds the mean SINR — and with it the whole sensitivity ladder's
 * choice — identical at all five widths, leaving the bin count as the only difference. That
 * figure is computed from the engine's own noise formula, never written down. The station
 * stands where the lesson's own `tryThis` sends it (7.5 right, 2 down from the router: the
 * middle of the far living room), because on the study desk the link has 6 dB more margin
 * than any per-bin loss this feature produces and every width drops zero frames.
 *
 * **Measured on the shipped scene for the record** (2026-10-03, 200 ms, Rayleigh, selectivity
 * on, `RX_FAIL(lowSinr)` counts at the five widths): **0, 0, 0, 36, 5** over 710…932 data
 * PPDUs. The plan's acceptance criterion — that count strictly decreasing across all five
 * widths — does **not** hold there, and the reason is the two confounds above, not the
 * physics. The second test is what does hold, and how it has to be stated to be true.
 *
 * Those two figures predate Task 6c's PPDU-format gate, under which a non-HT ACK is no longer
 * binned (`isOfdmWifiPpdu`). Re-measured on the corrected engine the five runs give **12, 45,
 * 52, 30, 7** failures over 249…870 data PPDUs — still not monotone in the count, which is the
 * only thing the paragraph above rests on.
 */
import { describe, it, expect, vi } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
// `sc` is aliased: this file already uses `sc` as a local name for a scenario value.
import { mumimoScenario, oneRoom, sc as sceneIn, widthScenario } from '../../src/course/wifiScenes'
import { node } from '../../src/course/lessonKit'
import { selBinStart, selBins, selMemberBins } from '../../src/engine/selectivity'
import { FAILURES_TO_STEP_DOWN } from '../../src/engine/rate'
import { noiseDbm } from '../../src/engine/phy'
import { minGen } from '../../src/model/caps'
import { ScenarioSchema } from '../../src/model/scenario'
import type { Generation } from '../../src/model/types'
import type { FadingCfg } from '../../src/engine/fading'
import type { ChannelWidth } from '../../src/model/caps'
import type { NodeCfg, Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { FrameDesc, MuPart } from '../../src/model/frames'
import { bsScenario, bsTag } from './amp-bs-helpers'

/**
 * Counts every draw the fading sampler takes, split by whether it carried a bin index.
 *
 * This is how the "does not enter the per-bin branch" test covers the branch instead of its
 * result: the per-bin path is defined by the bin-keyed draw (`smallScaleDb`'s sixth argument,
 * Task 1), so a run that takes none of them did not enter it, whatever its records look like.
 * `fadingDb` is counted beside it as the non-vacuity anchor — it is the entry point
 * `linkDbm` uses, and it calls the real `smallScaleDb` inside the module where this wrapper
 * cannot see it, so a zero on `binned` means something only next to a positive `link`.
 * Counting rather than recording arguments is deliberate: the width sweep drives millions of
 * draws through this wrapper and `vi.fn()` would hold every one of their argument arrays.
 */
const probe = vi.hoisted(() => ({ link: 0, binned: 0 }))

vi.mock('../../src/engine/fading', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/engine/fading')>()
  return {
    ...actual,
    fadingDb: (...args: Parameters<typeof actual.fadingDb>) => {
      probe.link++
      return actual.fadingDb(...args)
    },
    smallScaleDb: (...args: Parameters<typeof actual.smallScaleDb>) => {
      if (args[5] !== undefined) probe.binned++
      return actual.smallScaleDb(...args)
    },
  }
})

const MS = 1_000_000
/** Long enough for the rate loop to step down and climb back several times at every width. */
const SWEEP_NS = 200 * MS
const WIDTHS: ChannelWidth[] = [20, 40, 80, 160, 320]

/**
 * The fast layer alone, shadowing off.
 *
 * `shadowSigmaDb: 0` is the experiment, not a convenience: the slow layer is flat across the
 * channel by design (§3.2 — a shadow is the whole channel together) and its draw is keyed off
 * `(seed, link)`, so the same shadow lands on all five widths and would only move every link
 * margin by one common offset. Leaving it out isolates the layer this slice re-keys per bin,
 * which is also the layer §4.1's own table was measured on.
 */
const RAYLEIGH: FadingCfg = { shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'rayleigh' }

/** Where the `width` lesson's own `tryThis` sends the laptop: the middle of the living room. */
const LIVING_ROOM = { x: 12.5, y: 6 }

/** The width scene at one width, with the mean SINR held across widths (see the file header). */
function sweepScene(w: ChannelWidth, o: { fade?: boolean; sel?: boolean } = {}): Scenario {
  const sc = widthScenario(w, 1)
  const liftDb = noiseDbm(w) - noiseDbm(20)
  return {
    ...sc,
    nodes: sc.nodes.map((n) => ({
      ...n,
      txPowerDbm: n.txPowerDbm + liftDb,
      ...(n.id === 'sta-1' ? { pos: { ...n.pos, ...LIVING_ROOM } } : {}),
    })),
    ...(o.fade === false ? {} : { fading: RAYLEIGH }),
    ...(o.sel === false ? {} : { selectivity: {} }),
  }
}

const run = (sc: Scenario, ns: number): TLRecord[] => [...new Simulation(sc).runUntil(ns).records]

const ofType = <K extends TLRecord['type']>(rs: TLRecord[], type: K): Extract<TLRecord, { type: K }>[] =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type)

const lowSinrFails = (rs: TLRecord[]): number =>
  ofType(rs, 'RX_FAIL').filter((r) => r.reason === 'lowSinr').length

const dataTxCount = (rs: TLRecord[]): number =>
  ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'data').length

const quantile = (sorted: number[], f: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))]

/** What one width's round says about itself, all of it read out of the records. */
interface WidthRow {
  w: ChannelWidth
  bins: number
  /** Median of `meanSinrDb − threshDb` over the uplink's receptions: how much room it had. */
  marginDb: number
  medLossDb: number
  p90LossDb: number
  /** Median of the deepest bin's deviation: §3.3's table, measured in a round. */
  medWorstDb: number
  fails: number
  attempts: number
  dropRate: number
}

function widthRow(w: ChannelWidth): WidthRow {
  const rs = run(sweepScene(w), SWEEP_NS)
  // The uplink is the saturated direction and the one the rate loop drives. Since Task 6c the
  // ACK coming the other way emits no `WIFI_SEL` at all — it is a non-HT PPDU, so it has no
  // 26-tone RU to split into — but the filter stays: it is what makes these rows the uplink's.
  const sels = ofType(rs, 'WIFI_SEL').filter((s) => s.from === 'sta-1')
  expect(sels.length, `${w} MHz: no uplink reception to read`).toBeGreaterThan(50)
  const losses = sels.map((s) => s.lossDb).sort((a, b) => a - b)
  const worst = sels.map((s) => s.worstBinDb).sort((a, b) => a - b)
  const margins = sels.map((s) => s.meanSinrDb - s.threshDb).sort((a, b) => a - b)
  const fails = lowSinrFails(rs)
  const attempts = dataTxCount(rs)
  return {
    w, bins: sels[0].bins, marginDb: quantile(margins, 0.5),
    medLossDb: quantile(losses, 0.5), p90LossDb: quantile(losses, 0.9),
    medWorstDb: quantile(worst, 0.5),
    fails, attempts, dropRate: fails / attempts,
  }
}

describe('selectivity on whole rounds: what widening the channel actually does', () => {
  /** One sweep for the whole suite: five 200 ms rounds are the expensive part of this file. */
  let rows: WidthRow[] = []
  const sweep = (): WidthRow[] => {
    if (rows.length === 0) rows = WIDTHS.map(widthRow)
    return rows
  }

  /**
   * §3.3's table and §4.1's two columns, both measured in rounds rather than in draws, and
   * they point in opposite directions — which is the whole argument of the slice. Re-measured
   * 2026-10-03 at 200 ms under Task 6c's PPDU-format gate: the deepest bin's median at 10.21,
   * 13.58, 16.77, 19.85, 23.16 dB below the mean (the design doc's means, over far more draws,
   * run 12.05 to 24.09), and the loss's 90th percentile at 4.69, 3.87, 3.56, 3.21, 2.93 dB.
   * The median loss barely moves (2.07 to 2.36 dB); what the width buys is the *tail*.
   */
  it('deepens the worst bin at every doubling while tightening the loss, both strictly', () => {
    const rs = sweep()
    expect(rs.map((r) => r.bins)).toEqual(WIDTHS.map(selBins))
    for (let i = 1; i < rs.length; i++) {
      const label = `${rs[i].w} MHz against ${rs[i - 1].w} MHz`
      // the pit deepens…
      expect(rs[i].medWorstDb, `worst bin, ${label}`).toBeLessThan(rs[i - 1].medWorstDb)
      // …by roughly 3 dB a doubling, which is the shape §3.3 measured, not a literal from it
      const deepening = rs[i - 1].medWorstDb - rs[i].medWorstDb
      expect(deepening, `deepening, ${label}`).toBeGreaterThan(2)
      expect(deepening, `deepening, ${label}`).toBeLessThan(4.5)
      // …and the frame's own loss tightens, which is the opposite direction
      expect(rs[i].p90LossDb, `p90 loss, ${label}`).toBeLessThan(rs[i - 1].p90LossDb)
    }
    // The median hardly moves at all: the dispersion is what the width changes.
    const medians = rs.map((r) => r.medLossDb)
    expect(Math.max(...medians) - Math.min(...medians)).toBeLessThan(1)

    /*
     * The gap between a round and the draws, pinned because the `width` lesson now prints it
     * (review of 2026-10-03, finding 4b): the design doc's 12.05 dB at 20 MHz is a mean over
     * 40 000 draws (tests/engine/selectivity.test.ts), while ONE round of this scene holds far
     * fewer samples and its deepest bin sits about 2 dB shallower. A reader who runs a round and
     * reads 10.2 against a lesson printing 12.05 must find that difference explained rather than
     * discover it, so the number the lesson explains it with is asserted here.
     *
     * **It was 10.08 dB before Task 6c's PPDU-format gate** and is 10.21 dB after it: dropping
     * the non-HT ACKs out of the per-bin path leaves this median to the data PPDUs alone. The
     * figure is re-measured rather than the tolerance widened, so whichever number the lesson
     * prints has to be this one.
     */
    expect(rs[0].w).toBe(20)
    expect(rs[0].medWorstDb).toBeCloseTo(-10.21, 1) // within 0.05 dB
    expect(Math.abs(rs[0].medWorstDb).toFixed(1)).toBe('10.2')
  }, 300_000)

  /**
   * **The assertion the slice exists for**, and the one the plan's own wording cannot have:
   * the drop *rate* falls as the channel widens, strictly, among the widths whose link had
   * the same room to lose.
   *
   * Two corrections to the plan's criterion, both forced by what the rounds measured:
   *
   *   - **rate, not count.** A wider channel puts more PPDUs on the air in the same 200 ms
   *     (249 at 20 MHz, 870 at 320), so a count conflates airtime with decoding. Measured:
   *     12, 45, 52, 30, 7 failures — not monotone — against drop rates of 4.82, 9.93, 8.16,
   *     3.90, 0.80 %.
   *   - **at equal margin.** The rate loop settles each width at its own distance above the
   *     threshold, and a width that settles a step lower has already paid for its worse
   *     channel in rate rather than in drops. Here 40 / 80 / 160 / 320 MHz all settle at
   *     3.62 dB and form a strictly decreasing chain — 9.93 → 8.16 → 3.90 → 0.80 % — while
   *     20 MHz sits at 6.62 dB, a whole MCS step of extra room, and so drops fewer frames
   *     (4.82 %) than the 40 MHz channel while running slower.
   *
   * The group is picked by the margins themselves — the largest set of widths sharing one
   * median margin — not named here, so the test cannot be tuned by choosing which widths to
   * compare. End to end, the narrowest channel still drops an order of magnitude more often
   * than the widest.
   */
  it('drops strictly fewer frames at each wider channel, compared at equal margin', () => {
    const rs = sweep()
    // Non-vacuous: the narrow end has to actually lose frames, or a chain of zeros would pass
    // while measuring nothing.
    expect(rs[0].dropRate, `${rs[0].w} MHz`).toBeGreaterThan(0)
    // Group by the margin the loop settled at, and take the largest group.
    const groups = new Map<number, WidthRow[]>()
    for (const r of rs) groups.set(r.marginDb, [...(groups.get(r.marginDb) ?? []), r])
    const matched = [...groups.values()].sort((a, b) => b.length - a.length)[0]
    expect(matched.length, `margins ${rs.map((r) => `${r.w}:${r.marginDb.toFixed(2)}`).join(' ')}`)
      .toBeGreaterThanOrEqual(3)
    for (let i = 1; i < matched.length; i++) {
      expect(matched[i].dropRate, `${matched[i].w} MHz against ${matched[i - 1].w} MHz`)
        .toBeLessThan(matched[i - 1].dropRate)
    }
    // And the end-to-end claim the `width` lesson has to make, which needs no grouping.
    expect(rs[rs.length - 1].dropRate).toBeLessThan(rs[0].dropRate)
  }, 300_000)

  it('emits one self-consistent WIFI_SEL per Wi-Fi reception, binned by the PPDU’s own width', () => {
    const sels = ofType(run(sweepScene(160), 20 * MS), 'WIFI_SEL')
    expect(sels.length).toBeGreaterThan(0)
    for (const s of sels) {
      expect(s.lossDb).toBeCloseTo(s.meanSinrDb - s.effSinrDb, 9)
      expect(s.worstBinDb).toBeLessThan(0)
      // One bin count, not two. Before Task 6c the 20 MHz non-HT ACKs answering these PPDUs
      // were binned as well and nine turned up beside seventy-two; a non-HT PPDU has no
      // 26-tone RU, so every record left is the 160 MHz data PPDU's own.
      expect(s.bins).toBe(selBins(160))
    }
    expect(sels.some((s) => s.lossDb > 0)).toBe(true)
  })
})

describe('selectivity on whole rounds: the MCS moves on the timeline', () => {
  const dataMcs = (rs: TLRecord[]): number[] =>
    ofType(rs, 'TX_START')
      .filter((r) => r.frame.kind === 'data' && r.frame.src === 'sta-1' && r.frame.mcs !== undefined)
      .map((r) => r.frame.mcs!)

  it('holds one MCS with the feature off and steps between levels with it on', () => {
    // Off is the scene with no fading section at all: the level a rate was chosen on is the
    // level every frame then arrives at, so nothing ever fails and nothing ever steps.
    const off = dataMcs(run(sweepScene(40, { fade: false, sel: false }), 40 * MS))
    expect(off.length).toBeGreaterThan(10)
    expect(new Set(off).size).toBe(1)
    const on = dataMcs(run(sweepScene(40), 40 * MS))
    expect(on.length).toBeGreaterThan(10)
    expect(new Set(on).size).toBeGreaterThan(1)
    // The second control, and the one that makes this a test of *this* slice rather than of
    // fading: the same fade flat across the channel moves the MCS too (a deep frame fails
    // whole), so "it steps" alone would have passed before a line of this task was written.
    // The per-bin decision has to produce a different trajectory from the flat one.
    expect(on).not.toEqual(dataMcs(run(sweepScene(40, { sel: false }), 40 * MS)))
  })

  /**
   * The step-down rule under test is `RateControl`'s own (`FAILURES_TO_STEP_DOWN`, imported
   * rather than written as a 2), and this slice is the first thing to give it the trigger
   * source `rate-fallback`'s `out-of-scope` says it lacks — "none of the 337 failures here
   * came from the link getting worse".
   *
   * **The outcome of an attempt is read from the MAC's own records**, not inferred from
   * `RX_FAIL`. Inferring it was this test's first ruler and it was broken: a transmission can
   * go unacknowledged without any `RX_FAIL(lowSinr)` beside it (a lost ACK leaves an
   * `RX_MISS`), so attributing the receiver's failures to the sender's attempts reported two
   * step-downs out of ten as unexplained. `RETRY` and `DROP(retryLimit)` are the sender
   * saying it did not get an ACK, which is exactly what `onTxOutcome` feeds the rate loop,
   * and read that way all ten are explained.
   */
  it('precedes every step down by exactly two unacknowledged attempts', () => {
    const rs = run(sweepScene(40), SWEEP_NS)
    const outcomes: { i: number; ok: boolean }[] = []
    const attempts: { i: number; mcs: number }[] = []
    rs.forEach((r, i) => {
      if (r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.src === 'sta-1'
        && r.frame.mcs !== undefined) {
        attempts.push({ i, mcs: r.frame.mcs })
      } else if (r.type === 'RETRY' || (r.type === 'DROP' && r.reason === 'retryLimit')) {
        outcomes.push({ i, ok: false })
      } else if (r.type === 'RX_OK' && r.frame.kind === 'ack' && r.node.startsWith('sta-1')) {
        outcomes.push({ i, ok: true })
      }
    })
    const steps = attempts.filter((a, k) => k > 0 && a.mcs < attempts[k - 1].mcs)
    expect(steps.length).toBeGreaterThan(0)
    // The failures behind those steps are the per-bin decision's: this run judged its
    // receptions on a combined effective SINR, and said so in the record stream.
    expect(ofType(rs, 'WIFI_SEL').length).toBeGreaterThan(0)
    for (const step of steps) {
      const before = outcomes.filter((o) => o.i < step.i).slice(-FAILURES_TO_STEP_DOWN)
      expect(before.length, `step at record ${step.i}`).toBe(FAILURES_TO_STEP_DOWN)
      expect(before.map((o) => o.ok), `step at record ${step.i}`)
        .toEqual(new Array(FAILURES_TO_STEP_DOWN).fill(false))
    }
    // And it climbs back, so the timeline shows a ladder rather than a one-way slide.
    expect(attempts.some((a, k) => k > 0 && a.mcs > attempts[k - 1].mcs)).toBe(true)
  }, 300_000)
})

describe('selectivity leaves AMP’s two non-OFDM paths alone', () => {
  /**
   * `resolveLock` also serves a backscattered reply and an `amp.dir === 'ul'` OOK PPDU, and
   * neither is OFDM: a 26-tone resource unit is not a subdivision of anything they occupy,
   * and a mono-static reader hears a reply against its own leakage rather than thermal noise
   * (§6 item 1). So both take the scalar path, and the proof is the whole record stream: this
   * scene's two runs differ only by the `selectivity` section, and every record in them has
   * to match field for field, `seq` included — a `WIFI_SEL` slipped in anywhere would
   * renumber everything after it.
   *
   * Removing the carve-out does fail this, which is the point of writing it: the per-bin path
   * takes the flat fade back out of a level that never had one (a backscatter link is
   * measured off the geometry, not the link table), so a reply's SINR moves and both AMP
   * tiers' timelines move with it — silently, which is how this branch has lost AMP fixtures
   * before.
   */
  const activeTag = (id: string, x: number): NodeCfg => ({
    id, kind: 'amp', name: id, linkId: '2g', pos: { x, y: 4, z: 1 }, txPowerDbm: 0,
    profiles: ['idle'], caps: { generation: 'nonht', features: {} },
  })

  /**
   * An idle EHT station, present for one reason: to give the scene a link the section is
   * *allowed* on.
   *
   * Since the link-level refusal (Task 6c fix 1) a reader-plus-tags scene carries no binnable
   * link at all — `kind: 'amp'` nodes do not count, their PPDUs being OOK — so the schema now
   * refuses `selectivity` on it outright, and this test could no longer build its own subject.
   * That refusal is right: without a station there is nothing for a bin to subdivide.
   *
   * The station is **idle** because the comparison below is whole-stream equality, and a
   * station with traffic would break it legitimately — selectivity would flip some of its own
   * receptions, the retries would move the channel, and the reader's polls would shift with
   * them. Idle, it contributes no PPDU of its own, so what the two runs may differ by is
   * exactly what this test is about. The scene is therefore a *deliberately* inert
   * configuration, pinned here rather than hunted: unlike the defect this fix closed, it is not
   * one a user builds by accident, and this file is the thing that states it.
   */
  const idleStation = (): NodeCfg => ({
    id: 'sta-1', kind: 'sta', name: 'Laptop', pos: { x: 5, y: 4, z: 1 }, txPowerDbm: 15,
    profiles: ['idle'], caps: { generation: 'eht', features: { edca: true } },
  })

  /** A reader with both AMP tiers on: two Active Tx tags, one backscatter tag, one idle station. */
  const ampScene = (sel: boolean): Scenario => {
    const sc = bsScenario(
      {},
      [bsTag('bs-1', 0.2)],
      [activeTag('tag-1', 4), activeTag('tag-2', 6), idleStation()],
    )
    return { ...sc, fading: RAYLEIGH, ...(sel ? { selectivity: {} } : {}) }
  }

  it('leaves the backscatter and OOK uplink paths field-for-field identical', () => {
    // 300 ms: the reader alternates its two tiers, and the backscatter inventory is the
    // second of them.
    const without = run(ampScene(false), 300 * MS)
    const selective = run(ampScene(true), 300 * MS)
    // Non-vacuous: the scene really does run both tiers, and both decide something.
    expect(ofType(without, 'AMP_BS_REPLY').length).toBeGreaterThan(0)
    expect(ofType(without, 'AMP_BS_BOOT').length).toBeGreaterThan(0)
    expect(ofType(without, 'RX_OK').filter((r) => r.frame.amp?.dir === 'ul').length)
      .toBeGreaterThan(0)
    expect(selective).toEqual(without)
    // and nothing in the selective run claims a per-bin decision on any of it
    expect(ofType(selective, 'WIFI_SEL')).toEqual([])
    // The section really is on in that run — the schema accepted it, which it would not have
    // done before the idle station was added, so this test is measuring a live switch.
    expect(ScenarioSchema.safeParse(ampScene(true)).success).toBe(true)
  }, 300_000)
})

describe('selectivity only bins a PPDU format that has a 26-tone RU', () => {
  /**
   * The defect Task 6c found. `isOfdmWifiPpdu` used to be `frame.amp === undefined`, with
   * "non-HT is clause 17 OFDM" for its reason — true, and beside the point: the 26-tone RU is a
   * clause 27 / 36 unit, defined at HE/EHT's 78.125 kHz subcarrier spacing, while clause 17 and
   * clause 21 are spaced 312.5 kHz. The engine's own neighbour is the evidence:
   * `TONES_VHT[20] = 52` against `TONES_HE[20] = 234` for the same 20 MHz (phy.ts). So a VHT
   * PPDU was being judged on bins four times too narrow to exist in it.
   *
   * `ScenarioSchema` cannot be the only gate, and not because anything skips it — `Simulation`'s
   * constructor parses before it builds (simulation.ts), so even the worker's
   * `new Simulation(m.scenario)` surfaces a refusal rather than a run. It is that the schema's
   * rule is "at least one he/eht link": a **mixed** scene passes it with a VHT station still in,
   * and it should, because the HE links in it are fine. Only the PPDU can be gated.
   *
   * `WIFI_SEL` carries the receiver and the sender, so the claim is read straight out of the
   * records: the he station's receptions are binned, the vht station's are not, in one run.
   */
  const mixedScene = (): Scenario => {
    const sc = sweepScene(80)
    const he = sc.nodes.find((n) => n.id === 'sta-1')!
    const vht: NodeCfg = {
      ...he,
      id: 'sta-vht',
      name: 'VHT laptop',
      caps: { ...he.caps, generation: 'vht' },
    }
    return { ...sc, nodes: [...sc.nodes, vht] }
  }

  it('bins the he station’s PPDUs and leaves the vht station’s on the scalar path', () => {
    const rs = run(mixedScene(), 60 * MS)
    const sel = ofType(rs, 'WIFI_SEL')
    // Non-vacuous: both stations really do get their data PPDUs decoded in this window.
    const decodedFrom = (id: string) => ofType(rs, 'RX_OK')
      .filter((r) => r.from === id && r.frame.kind === 'data' && r.frame.mode !== undefined)
    expect(decodedFrom('sta-1').length, 'the he station sent no data PPDU').toBeGreaterThan(0)
    expect(decodedFrom('sta-vht').length, 'the vht station sent no data PPDU').toBeGreaterThan(0)
    // The he station's data PPDUs are binned, at the whole channel's bin count.
    const fromHe = sel.filter((r) => r.from === 'sta-1')
    expect(fromHe.length).toBeGreaterThan(0)
    expect(new Set(fromHe.map((r) => r.bins))).toEqual(new Set([selBins(80)]))
    // The vht station's are not binned at all — no record claims a per-bin decision on one.
    expect(sel.filter((r) => r.from === 'sta-vht')).toEqual([])
  }, 300_000)

  /**
   * The same rule reaching the control frames, which is where it is easiest to lose.
   *
   * `FrameDesc.mode` defaults to non-HT, so an ACK, a BlockAck, an RTS and a CTS all name no
   * format — and a non-HT PPDU is no more divisible into 26-tone RUs than a VHT one. There is
   * no version of the rule that holds for a VHT data PPDU and not for a non-HT ACK: the
   * spacing is 312.5 kHz in both.
   *
   * Taking them out of the per-bin path moved this lesson's six recorded timelines and the drop
   * rates measured off them, and the figures below were re-measured under this rule rather than
   * the gate being relaxed to preserve them: the lesson's numbers are measurements *of* the
   * engine, so they follow it. What this test pins is that no `WIFI_SEL` in a mixed run is ever
   * attributable to a PPDU whose format is not he or eht.
   */
  it('bins no non-HT control PPDU either, whatever the two radios can do', () => {
    const rs = run(mixedScene(), 60 * MS)
    const binned = new Set<string>()
    for (const r of ofType(rs, 'WIFI_SEL')) {
      const tx = ofType(rs, 'TX_START').find((t) => t.node === r.from && t.t <= r.t)
      if (tx) binned.add(`${tx.frame.kind}:${tx.frame.mode ?? 'unnamed'}`)
    }
    expect(binned.size, 'nothing was binned at all').toBeGreaterThan(0)
    for (const k of binned) expect(k, `a ${k} PPDU was binned`).toMatch(/:(he|eht)$/)
    // Non-vacuous in the other direction: the run really does carry control PPDUs, and they
    // really are received — they are simply decided on the scalar level.
    const acks = ofType(rs, 'RX_OK').filter((r) => r.frame.mode === undefined)
    expect(acks.length, 'the run contained no control reception to exclude').toBeGreaterThan(0)
  }, 300_000)
})

/**
 * **Every (AP × station) generation pair, judged on the records rather than on the schema.**
 *
 * The whole-branch review stopped the merge here. The schema's third refusal used to ask
 * `nodes.some(generation is he or eht)` while a link's PPDU format is `minGen` of its two ends,
 * so all eight mixed pairs — `nonht` AP with an `eht` station and the rest — parsed clean, lit
 * the checkbox, showed no red line, and ran a timeline field-for-field identical to the feature
 * being off. Schema-level tests could not see it: a scene that parses is not a scene where
 * anything happens.
 *
 * So the claim asserted here is the biconditional, and it is the only statement of this feature
 * that cannot be satisfied by doing nothing:
 *
 *   **the plan is refused, or the run bins something.** Never neither.
 *
 * The expectation comes from `minGen`, not from a written-out table of sixteen verdicts: a
 * second model of the rule is the thing that drifts.
 */
describe('selectivity is never legal-and-inert, over all sixteen generation pairs', () => {
  const GENERATIONS: Generation[] = ['nonht', 'vht', 'he', 'eht']

  /** One AP, one station, fading on, selectivity on; features and `linkId` stripped (see below). */
  const pairScene = (apGen: Generation, staGen: Generation): Scenario => {
    const base = widthScenario(20, 1)
    // `linkId: '2g'` with vht, and '6g' with nonht/vht, are refused by rules of their own, and
    // the features are dropped so the only thing moving across the matrix is the generations.
    const plain = (n: NodeCfg, generation: Generation): NodeCfg => {
      const { linkId: _drop, ...rest } = n
      return { ...rest, caps: { generation, features: {} } }
    }
    return {
      ...base,
      nodes: [
        plain(base.nodes.find((n) => n.kind === 'ap')!, apGen),
        plain(base.nodes.find((n) => n.kind === 'sta')!, staGen),
      ],
      fading: RAYLEIGH,
      selectivity: {},
    } as Scenario
  }

  for (const apGen of GENERATIONS) {
    for (const staGen of GENERATIONS) {
      const linkGen = minGen(apGen, staGen)
      const binnable = linkGen === 'he' || linkGen === 'eht'
      it(`${apGen} AP + ${staGen} STA (a ${linkGen} link) is ${binnable ? 'binned' : 'refused outright'}`, () => {
        const sc = pairScene(apGen, staGen)
        const accepted = ScenarioSchema.safeParse(sc).success
        expect(accepted, `schema ${accepted ? 'accepted' : 'refused'} a ${linkGen} link`).toBe(binnable)
        if (!accepted) {
          // `Simulation`'s constructor parses before it builds anything, so a refused plan
          // cannot be run at all — which is what makes the schema a real gate here.
          expect(() => new Simulation(sc)).toThrow()
          return
        }
        const rs = run(sc, 40 * MS)
        // Non-vacuous on both sides: the scene really exchanges frames, and the feature really
        // decided some of them per bin.
        expect(ofType(rs, 'RX_OK').length, 'the scene exchanged nothing').toBeGreaterThan(0)
        expect(ofType(rs, 'WIFI_SEL').length, 'accepted but inert').toBeGreaterThan(0)
      }, 120_000)
    }
  }

  it('and the accepted pairs differ from the same scene with the section off', () => {
    // The strongest form of "not inert": the two record streams are not equal. One pair is
    // enough — this is the property the sixteen cases above cover by proxy, stated once
    // directly, the way the AMP carve-out states its own.
    const sc = pairScene('eht', 'he')
    const { selectivity: _off, ...flat } = sc
    expect(run(sc, 40 * MS)).not.toEqual(run(flat as Scenario, 40 * MS))
  }, 120_000)
})

describe('selectivity: the section absent takes no per-bin draw at all', () => {
  /**
   * §8.1's rule, which is about floating point rather than tidiness: the scalar path has to be
   * reached *without* computing bins and discovering the deviations are all zero, because that
   * second arithmetic drifts and every recorded lesson hash would move with it. So the
   * assertion is on the draws, not on the records: a run with the section absent must take
   * none that carries a bin index, while taking the flat ones — otherwise a zero would only
   * mean the sampler was never asked anything.
   */
  it('takes link draws but no bin-keyed draw with the section absent, and bin-keyed ones with it', () => {
    probe.link = 0
    probe.binned = 0
    const off = run(sweepScene(160, { sel: false }), 20 * MS)
    expect(ofType(off, 'WIFI_SEL')).toEqual([])
    expect(probe.link).toBeGreaterThan(0)
    expect(probe.binned).toBe(0)

    probe.link = 0
    probe.binned = 0
    run(sweepScene(160), 20 * MS)
    expect(probe.binned).toBeGreaterThan(0)
    probe.link = 0
    probe.binned = 0
  })
})

/*
 * ===========================================================================
 * Slice 4b: an OFDMA member reads its own resource unit, not the whole PPDU.
 *
 * 4a binned the channel and gave every receiver all of its bins. An OFDMA
 * member's data is carried in one resource unit, so its frequency diversity
 * was over-counted by exactly the member count. The four tests below are the
 * whole observable content of the correction, and three of the four exist
 * because the obvious assertion in their place would have been empty
 * (design doc 2026-10-04 §8).
 * ===========================================================================
 */

/** One `WIFI_SEL` row with the PPDU it judged, and this receiver's own part of it. */
interface SelRow {
  sel: Extract<TLRecord, { type: 'WIFI_SEL' }>
  frame: FrameDesc
  /** This receiver's member entry, absent when it is not addressed in the PPDU. */
  part: MuPart | undefined
}

/**
 * Every `WIFI_SEL` of a run, paired with the PPDU it was the decision on.
 *
 * `WIFI_SEL` carries `node` and `from` but not the frame, so the pairing comes from the
 * `RX_START` that opened the same lock: `acquireLock` emits it with the frame, `resolveLock`
 * finds the lock back by `from`, and a receiver holds at most one lock per sender at a time —
 * so the last `RX_START` for a (node, from) pair is the frame this row judged. The `expect`
 * inside is what makes that an assertion rather than an assumption.
 */
function selRows(rs: TLRecord[]): SelRow[] {
  const open = new Map<string, FrameDesc>()
  const out: SelRow[] = []
  for (const r of rs) {
    if (r.type === 'RX_START') open.set(`${r.node}|${r.from}`, r.frame)
    if (r.type !== 'WIFI_SEL') continue
    const frame = open.get(`${r.node}|${r.from}`)
    expect(frame, `WIFI_SEL with no RX_START before it: ${r.node} <- ${r.from}`).toBeDefined()
    out.push({ sel: r, frame: frame!, part: frame!.muParts?.find((p) => p.dst === r.node) })
  }
  return out
}

/**
 * The `ofdma-dl` lesson's own scene with the two sections that turn this feature on — three
 * Wi-Fi 6 TVs on one 20 MHz channel, so a two-member PPDU asks for 4.5 bins and gets 4 of 9.
 *
 * Built here rather than imported from the lesson because the lesson's published scene has
 * neither section, and must not get them: no recorded hash may move in this slice (§5.1). The
 * node list is the lesson's, character for character.
 */
function ofdmaDlScene(shadowSigmaDb = 0): Scenario {
  return sceneIn(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'TV 1', 'sta', 3, 5.5, 'he', 'video'),
    node('sta-2', 'TV 2', 'sta', 5, 6.5, 'he', 'video'),
    node('sta-3', 'TV 3', 'sta', 7, 5.5, 'he', 'video'),
  ], { fading: { ...RAYLEIGH, shadowSigmaDb }, selectivity: {} })
}

/** The MU-MIMO lesson's scene with the same two sections: 160 MHz, two-stream phones. */
const mumimoSelScene = (): Scenario =>
  ({ ...mumimoScenario(true), fading: RAYLEIGH, selectivity: {} })

/** Long enough for both scenes to group hundreds of multi-user PPDUs. */
const MU_ROUND_NS = 1000 * MS

describe('selectivity, slice 4b: a member reads its own resource unit', () => {
  /**
   * §8 item 1. MU-MIMO is where this slice's wording ("multi-user") promises more than it
   * delivers, and the promise is kept by the *engine*, not by this slice: a MU-MIMO member
   * carries no `ruFraction` at all (`mac.ts`'s `frac = mumimo ? 1 : 1 / dsts.length`), so it
   * takes the whole-channel branch and `channel.ts` needs no `muKind` test anywhere. That is
   * a match with the standard rather than a shortcut — this engine's MU-MIMO PPDU does span
   * the whole bandwidth — but it has to be *asserted*, not left alone, or "multi-user" looks
   * covered when half of it was never touched.
   */
  it('leaves a MU-MIMO member on the whole channel, with no share recorded', () => {
    const rows = selRows(run(mumimoSelScene(), MU_ROUND_NS))
    const mumimo = rows.filter((x) => x.frame.muKind === 'mumimo')
    // Measured on the engine as it stood before this slice (931c915): every one of these rows
    // read all 72 bins of the 160 MHz channel, and this slice must leave every one there.
    expect(mumimo.length).toBe(2022)
    expect(new Set(mumimo.map((x) => x.sel.bins))).toEqual(new Set([selBins(160)]))
    for (const x of mumimo) {
      expect(x.part?.ruFraction).toBeUndefined() // the reason it is untouched
      expect(x.sel.bins).toBe(72)
      expect(x.sel.binStart).toBe(0)
      expect('ruFraction' in x.sel).toBe(false)
    }
  })

  /**
   * §8 item 2: measured, and nothing follows. `ofdma-dl`'s own scene has far more margin than
   * a four-bin loss can spend, so the correction is visible in every member's record and in no
   * decode outcome at all. Both pinned counts were measured on the pre-change engine, where
   * these same members read nine bins — they are the "same as the nine-bin round" half of the
   * claim, and the reason this test is not merely "the feature now does something".
   */
  it('gives a two-member OFDMA PPDU four of the nine bins, and moves no outcome', () => {
    const rs = run(ofdmaDlScene(), MU_ROUND_NS)
    const rows = selRows(rs)
    const full = selBins(20)
    expect(full).toBe(9)

    const ofdma = rows.filter((x) => x.frame.muKind === 'ofdma')
    const members = ofdma.filter((x) => x.part !== undefined)
    const overhearers = ofdma.filter((x) => x.part === undefined)
    expect(members.length).toBe(341)
    expect(overhearers.length).toBe(169)

    for (const x of members) {
      const n = x.frame.muParts!.length
      expect(x.sel.ruFraction).toBeCloseTo(1 / n, 12)
      expect(x.sel.bins).toBe(selMemberBins(20, 1 / n))
      expect(x.sel.bins).toBeLessThan(full)
    }
    // Both member counts this scene builds, and what each one reads: 1/2 -> 4.5 -> 4 bins,
    // 1/3 -> 3 bins exactly. The three-member PPDU is rare here (a second queue has to be
    // non-empty at the same instant) but it does occur, so both rows are measured.
    expect(new Set(members.map((x) => x.frame.muParts!.length))).toEqual(new Set([2, 3]))
    expect(new Set(members.filter((x) => x.frame.muParts!.length === 2).map((x) => x.sel.bins)))
      .toEqual(new Set([4]))
    expect(new Set(members.filter((x) => x.frame.muParts!.length === 3).map((x) => x.sel.bins)))
      .toEqual(new Set([3]))

    // A station overhearing a PPDU it is not addressed in reads the whole channel, and that is
    // not an omission: it is decoding the preamble, which spans the whole bandwidth — the same
    // thing `decodeThreshDb` says of it by holding it to the robust header's threshold.
    for (const x of overhearers) {
      expect(x.sel.bins).toBe(full)
      expect(x.sel.binStart).toBe(0)
      expect('ruFraction' in x.sel).toBe(false)
    }
    // Single-user receptions are untouched, and they are most of this scene's traffic.
    const su = rows.filter((x) => x.frame.muParts === undefined)
    expect(su.length).toBe(9595)
    expect(new Set(su.map((x) => x.sel.bins))).toEqual(new Set([full]))
    for (const x of su) expect('ruFraction' in x.sel).toBe(false)

    // The outcome half: identical to the nine-bin round, to the frame.
    expect(lowSinrFails(rs)).toBe(10)
    expect(dataTxCount(rs)).toBe(3369)
  })

  /*
   * §8 item 4, at the level the records are read. The assertion this slice invites — "two
   * members land on different bins" — would pass and prove only that two integers are
   * unequal: bins are drawn independently of one another and two members are independent
   * draws regardless (the fading key carries the receiver id), so *where* a member sits has no
   * effect on its distribution. Measured over all six four-bin windows of a nine-bin channel
   * the effective SINR agrees to within 0.02 dB. So there are exactly two assertions here and
   * there is no third one to write: determinism, and runs that tile the channel without
   * leaving it. Position becomes physical in the slice that gives adjacent bins a correlation;
   * until then this comment is the record of what the obvious third test would have been
   * worth.
   */
  it('places every member inside the channel, and places it there again on a rerun', () => {
    const a = selRows(run(ofdmaDlScene(), MU_ROUND_NS))
    const b = selRows(run(ofdmaDlScene(), MU_ROUND_NS))
    expect(a.length).toBe(b.length)
    expect(a.length).toBeGreaterThan(1000)
    for (let i = 0; i < a.length; i++) {
      expect([a[i]!.sel.binStart, a[i]!.sel.bins, a[i]!.sel.ruFraction])
        .toEqual([b[i]!.sel.binStart, b[i]!.sel.bins, b[i]!.sel.ruFraction])
    }
    for (const x of a) {
      const width = x.frame.widthMhz ?? 20
      expect(Number.isInteger(x.sel.binStart)).toBe(true)
      expect(x.sel.binStart).toBeGreaterThanOrEqual(0)
      expect(x.sel.binStart + x.sel.bins).toBeLessThanOrEqual(selBins(width))
      if (x.part?.ruFraction === undefined) continue
      // The runs are consecutive in `muParts` order, which is what makes them disjoint: this
      // member's start is the bins of every member before it, and nothing else.
      const parts = x.frame.muParts!
      expect(x.sel.binStart)
        .toBe(selBinStart(width, parts.map((p) => p.ruFraction ?? 1), parts.indexOf(x.part)))
    }
    // Two members of a 20 MHz PPDU take bins 0-3 and 4-7, so bin 8 is held by nobody — the
    // very bin Table 27-8's two 106-tone RUs leave out.
    const twos = a.filter((x) => x.part?.ruFraction !== undefined && x.frame.muParts!.length === 2)
    expect(new Set(twos.map((x) => x.sel.binStart))).toEqual(new Set([0, 4]))
  })

  /**
   * Both layers still move, and neither eats the other: the shadow is slow and flat across the
   * channel, the member's share is a frequency fact with no time in it. So in one run the same
   * member's `meanSinrDb` steps between coherence intervals while its `bins` never moves.
   * No count is pinned here: with shadowing on, the deeper per-member loss does change decode
   * outcomes, so this timeline legitimately differs from the pre-change one.
   */
  it('moves the mean with the shadow while the member’s bin count holds all round', () => {
    const rows = selRows(run(ofdmaDlScene(6), MU_ROUND_NS))
      .filter((x) => x.part?.ruFraction !== undefined && x.frame.muParts!.length === 2)
    const byNode = new Map<string, SelRow[]>()
    for (const x of rows) byNode.set(x.sel.node, [...(byNode.get(x.sel.node) ?? []), x])
    expect(byNode.size).toBe(3)
    for (const [id, xs] of byNode) {
      expect(xs.length, `${id}: too few member receptions to read`).toBeGreaterThan(20)
      expect(new Set(xs.map((x) => x.sel.meanSinrDb.toFixed(6))).size,
        `${id}: the shadow never moved`).toBeGreaterThan(1)
      expect(new Set(xs.map((x) => x.sel.bins)), `${id}: the share moved`).toEqual(new Set([4]))
      expect(new Set(xs.map((x) => x.sel.ruFraction))).toEqual(new Set([1 / 2]))
    }
  })
})
