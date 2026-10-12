/**
 * Every empirical claim in "The fourteen rungs, and how a sender picks one",
 * measured against the scene it shares with `decode-thresholds` — which is
 * `radio-primer`'s — so all four M1 lessons read one run.
 *
 * The pins here are `decode-thresholds`'s before the 2026-09-25 re-pacing: the
 * six printed rungs, the modulation names, the `mcsLadder` widget, the
 * five-step rate-picking procedure, the worked living-room column, the
 * four-position table and both experiments. They moved together and on purpose
 * — a procedure and the scene that demonstrates it are not divided — which is
 * why the whole of "choosing a rung, step by step" is asserted below.
 *
 * The lesson is not registered yet (`src/course/lessons.ts` and `COURSE_ORDER`
 * are the controller's), so it is imported directly, and the terminology rule
 * readability.test.ts applies course-wide is re-run over it here.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mcsLadder as mcsLadderLesson } from '../../src/course/tier1/mcs-ladder'
import { decodeThresholds } from '../../src/course/tier1/decode-thresholds'
import { primerScenario, PRIMER_DISTANCES } from '../../src/course/tier1/radioLink'
import { MODULES } from '../../src/course/curriculum'
import { LESSONS } from '../../src/course/lessons'
import type { Block } from '../../src/course/lessonKit'
import {
  ZH_TERMS, cellTexts, paragraphTexts, zhAkaViolations, zhTermFailure,
} from '../../src/course/readability'
import { linkBudget, mcsLadder } from '../../src/course/widgetModel'
import { PHY_MODES, RATE_MARGIN_DB, TGI_NS, mcsForRssi, mcsRateMbps, noiseDbm, reqSinrDb, txTimeModeNs } from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import { ScenarioSchema } from '../../src/model/scenario'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { ROOT, zhNumeral } from './coverage'
import { selBinWidthMhz } from '../../src/engine/selectivity'

const MS = 1_000_000
/** The same run length the other three M1 lessons use, so they share one memo. */
const RUN_NS = 100 * MS

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (recs: TLRecord[], node: string, kind: string): Tx[] =>
  recs.filter((r): r is Tx => r.type === 'TX_START' && r.node === node && r.frame.kind === kind)
const variantRecs = (i: number): TLRecord[] => runOf(mcsLadderLesson, i, RUN_NS)

const wallsFor = (d: number) => (d > 5.5 ? (['brick'] as const) : ([] as const))
/** The "One 1530-octet frame, by position" table: level, SNR, rung, needs + 3 dB, airtime. */
const TABLE = [
  { rssi: '-31.7', snr: '62.3', mcs: 13, reqPlus: '47.99', airtime: 129_600 },
  { rssi: '-52.7', snr: '41.3', mcs: 10, reqPlus: '39.99', airtime: 143_200 },
  { rssi: '-72.3', snr: '21.7', mcs: 3, reqPlus: '19.99', airtime: 415_200 },
  { rssi: '-78.1', snr: '15.9', mcs: 1, reqPlus: '14.99', airtime: 768_800 },
]

lessonShapeSuite(mcsLadderLesson, { sameSceneAs: 'decode-thresholds', runNs: RUN_NS })

describe('mcs-ladder · the fourth lesson of the Wi-Fi track', () => {
  it('sits in M1, follows decode-thresholds, and owns the two rung words', () => {
    expect(mcsLadderLesson.id).toBe('mcs-ladder')
    expect(MODULES[mcsLadderLesson.module].title).toBe('信号与链路')
    expect(mcsLadderLesson.module).toBe(decodeThresholds.module)
    expect(mcsLadderLesson.needs).toEqual(['decode-thresholds'])
    expect(mcsLadderLesson.terms!.map((t) => t.term)).toEqual(['MCS', 'OFDM'])
  })

  it('loads decode-thresholds’ own scene, variant for variant', () => {
    expect(mcsLadderLesson.scenario()).toEqual(decodeThresholds.scenario())
    expect(mcsLadderLesson.variants!.map((v) => v.scenario()))
      .toEqual(decodeThresholds.variants!.map((v) => v.scenario()))
    expect(() => ScenarioSchema.parse(mcsLadderLesson.scenario())).not.toThrow()
    for (const v of mcsLadderLesson.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('brackets every official term at its first Chinese use', () => {
    const l = mcsLadderLesson
    const zh = [l.why!, ...l.outcomes!]
      .concat(paragraphTexts(l.picture!), cellTexts(l.picture!))
      .concat(paragraphTexts(l.numbers!), cellTexts(l.numbers!))
      .concat(l.observe, l.tryThis, l.quiz.flatMap((q) => [q.q, ...q.options, q.explain]))
      .join(' ')
    const wifi = ZH_TERMS.filter((t) => !t.track || t.track === 'wifi')
    const fails = wifi.flatMap((t) => [zhTermFailure(zh, t), ...zhAkaViolations(zh, t)].filter(Boolean))
    expect(fails).toEqual([])
    expect(wifi.filter((t) => zhTermFailure(zh, t) === null && zh.includes(t.zh ?? t.abbr!)).length)
      .toBeGreaterThanOrEqual(2)
  })
})

describe('mcs-ladder · the ladder itself', () => {
  it('the six printed rungs are the engine’s, requirement and sensitivity alike', () => {
    // "Six of the fourteen rungs, 20 MHz, one stream": MCS, modulation, bits per sub-carrier,
    //  Mb/s, sensitivity, needs.
    const rows = mcsLadder('eht')
    expect(rows).toHaveLength(14)
    const printed: [number, number, number, number, string][] = [
      [0, 0.5, 8.6, -82, '8.99'], [1, 1, 17.2, -79, '11.99'], [3, 2, 34.4, -74, '16.99'],
      [7, 5, 86.0, -64, '26.99'], [10, 7.5, 129.0, -54, '36.99'], [13, 10, 172.1, -46, '44.99'],
    ]
    for (const [mcs, bits, mbps, sens, req] of printed) {
      // "Bits per sub-carrier": the ladder's own bits per data tone
      expect(PHY_MODES.eht.ndbps[mcs] / 234, `bits/tone MCS ${mcs}`).toBe(bits)
      expect(rows[mcs].mbps).toBe(mbps)
      expect(rows[mcs].sensDbm).toBe(sens)
      expect(rows[mcs].reqSinrDb.toFixed(2)).toBe(req)
    }
    // the picture's "going up a rung loads each sub-carrier with more bits" — half a bit at
    // the bottom, ten at the top, for 36 dB more
    expect((rows[13].reqSinrDb - rows[0].reqSinrDb).toFixed(0)).toBe('36')
  })

  it('the modulation names count symbols, and a name plus its fraction gives the bits', () => {
    // the gloss under the table: "two levels is BPSK, four is QPSK, then the 16, 64, 1024 and
    //  4096 of the QAM family; the fraction after it is the coding rate." Each printed cell is
    //  `<symbols>-QAM <rate>`, and log2(symbols) × rate is the row's own bits per sub-carrier,
    //  so a name that stopped matching the ladder fails here.
    const printed: [number, string, number, number][] = [
      [0, 'BPSK', 2, 1 / 2], [1, 'QPSK', 4, 1 / 2], [3, '16-QAM', 16, 1 / 2],
      [7, '64-QAM', 64, 5 / 6], [10, '1024-QAM', 1024, 3 / 4], [13, '4096-QAM', 4096, 5 / 6],
    ]
    for (const [mcs, name, symbols, rate] of printed) {
      if (name === 'BPSK') expect(symbols).toBe(2)
      if (name === 'QPSK') expect(symbols).toBe(4)
      if (name.includes('-QAM')) expect(Number(name.split('-')[0])).toBe(symbols)
      expect(Math.log2(symbols) * rate, `bits/tone MCS ${mcs}`).toBeCloseTo(PHY_MODES.eht.ndbps[mcs] / 234, 9)
    }
    // deeper: "rungs 3 and 7 are the 16-QAM and 64-QAM their names give, at different
    //  fractions — 2 bits against 5, and 10 dB more asked for"
    expect((reqSinrDb('eht', 7) - reqSinrDb('eht', 3)).toFixed(0)).toBe('10')
  })

  it('the widget marks the living-room link, and the margin picks the rung', () => {
    // the caption "the marker at the living-room laptop's SNR rounded down to 21.5 dB. The
    //  rungs it lights are the ones that fit: requirement plus the margin kept in hand."
    const w = mcsLadderLesson.numbers!.find((b): b is Extract<Block, { kind: 'widget' }> => b.kind === 'widget')!
    expect(w.widget).toBe('mcsLadder')
    expect(w.params!.mode).toBe('eht')
    const snr = Number(w.params!.snrDb)
    expect(snr).toBe(21.5)
    const lb = linkBudget({ txDbm: 15, distanceM: 9, walls: ['brick'], widthMhz: 20, mode: 'eht' })
    expect(Math.floor(lb.snrDb * 2) / 2).toBe(snr)
    expect(mcsLadder('eht').filter((r) => snr >= r.reqSinrDb + RATE_MARGIN_DB).map((r) => r.mcs)).toEqual([0, 1, 2, 3])
  })
})

/**
 * The procedure arrived here whole, and the worked column beside it is the
 * procedure run at one place: every line of "the living-room laptop, step by
 * step" is the step it names, checked against the engine rather than quoted.
 */
describe('mcs-ladder · choosing a rung, step by step', () => {
  const RSSI = -72.3
  const steps = mcsLadderLesson.numbers!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!

  it('states the whole procedure, all five steps, on the main path', () => {
    // the one thing the split had to get right: no half of a procedure in another lesson
    expect(steps.items).toHaveLength(5)
    expect([...mcsLadderLesson.picture!, ...mcsLadderLesson.numbers!].filter((b) => b.kind === 'steps')).toHaveLength(1)
  })

  it('step 1: the received level minus the 20 MHz noise floor is the SNR the column prints', () => {
    expect(noiseDbm(20)).toBeCloseTo(-93.99, 2)
    expect(RSSI - noiseDbm(20)).toBeCloseTo(21.7, 1)
  })

  it('step 2: a required SINR is its sensitivity plus 90.99 dB', () => {
    for (let mcs = 0; mcs < PHY_MODES.eht.sensDbm.length; mcs++) {
      expect(reqSinrDb('eht', mcs)).toBeCloseTo(PHY_MODES.eht.sensDbm[mcs]! + 90.99, 2)
    }
  })

  it('steps 3 and 4: rung 3 fits with the margin and rung 7 does not, so the frame goes at 3', () => {
    const snr = RSSI - noiseDbm(20)
    expect(reqSinrDb('eht', 3)).toBeCloseTo(16.99, 2)
    expect(reqSinrDb('eht', 3) + RATE_MARGIN_DB).toBeCloseTo(19.99, 2)
    expect(reqSinrDb('eht', 3) + RATE_MARGIN_DB).toBeLessThanOrEqual(snr)
    expect(reqSinrDb('eht', 7)).toBeCloseTo(26.99, 2)
    expect(reqSinrDb('eht', 7) + RATE_MARGIN_DB).toBeCloseTo(29.99, 2)
    expect(reqSinrDb('eht', 7) + RATE_MARGIN_DB).toBeGreaterThan(snr)
    expect(mcsForRssi('eht', RSSI, undefined, 20)).toBe(3)
  })

  it('step 5: at 20 MHz the look-up shortcut picks the same rung as the arithmetic', () => {
    for (let dbm = -90; dbm <= -30; dbm += 0.5) {
      const bySensitivity = PHY_MODES.eht.sensDbm.reduce((best, sens, i) => (dbm >= sens ? i : best), 0)
      expect(mcsForRssi('eht', dbm, undefined, 20), `${dbm} dBm`).toBe(bySensitivity)
    }
    // quiz 2 walks it once by hand: −73 dBm meets rung 3's −74 dBm and misses rung 4's −70 dBm
    expect(PHY_MODES.eht.sensDbm[3]).toBe(-74)
    expect(PHY_MODES.eht.sensDbm[4]).toBe(-70)
    expect(mcsForRssi('eht', -73, undefined, 20)).toBe(3)
  })
})

describe('mcs-ladder · the simulation matches the ladder', () => {
  it('the position table is the run: rung, requirement and airtime, four places', () => {
    // "One 1530-octet frame, by position", and the observations "Read the MCS of the first
    //  data frame in each of the four variants: 13, 10, 3 and 1" / "Now read the airtime of
    //  that frame: 129.6, 143.2, 415.2 and 768.8 µs."
    PRIMER_DISTANCES.forEach((d, i) => {
      const e = TABLE[i]
      const s = mcsLadderLesson.variants![i].scenario()
      const lb = linkBudget({ txDbm: 15, distanceM: d, walls: [...wallsFor(d)], widthMhz: 20, mode: 'eht' })
      expect(lb.rssiDbm).toBeCloseTo(buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')!, 9)
      expect(lb.rssiDbm.toFixed(1)).toBe(e.rssi)
      expect(lb.snrDb.toFixed(1)).toBe(e.snr)
      expect(lb.mcs).toBe(e.mcs)
      expect(mcsForRssi('eht', lb.rssiDbm)).toBe(e.mcs)
      expect((reqSinrDb('eht', e.mcs) + RATE_MARGIN_DB).toFixed(2)).toBe(e.reqPlus)
      const data = txs(variantRecs(i), 'sta-1', 'data')
      expect(data.length).toBeGreaterThan(0)
      expect(data[0].t).toBe(0)
      for (const r of data) {
        expect(r.frame.mcs).toBe(e.mcs)
        expect(r.frame.mode).toBe('eht')
        expect(r.frame.widthMhz).toBe(20)
      }
      expect(data[0].frame.bytes).toBe(1530)
      expect(data[0].frame.txTimeNs).toBe(e.airtime)
    })
    // "twelve rungs down costs nearly six times the air for the very same 1530 octets", and
    // quiz 1's "129.6 µs at the desk and 768.8 µs at the far wall"
    expect(TABLE[0].mcs - TABLE[3].mcs).toBe(12)
    expect(TABLE[3].airtime / TABLE[0].airtime).toBeCloseTo(5.93, 2)
  })
})

describe('mcs-ladder · try this', () => {
  it('the slider: MCS 1 at 15.9 dB, MCS 13 at 62.3 dB, and two rungs fewer on HE', () => {
    // "the top usable rung moves from MCS 1 to MCS 13, twelve rungs for 46 dB. Then press the
    //  HE (Wi-Fi 6) button: the two fastest rungs disappear" — and deeper's "4096-QAM only
    //  arrived with Wi-Fi 7".
    const top = (mode: 'he' | 'eht', snr: number) =>
      mcsLadder(mode).filter((r) => snr >= r.reqSinrDb + RATE_MARGIN_DB).pop()!.mcs
    expect(top('eht', 15.9)).toBe(1)
    expect(top('eht', 62.3)).toBe(13)
    expect(62.3 - 15.9).toBeCloseTo(46.4, 9)
    expect(mcsLadder('he')).toHaveLength(12)
    expect(mcsLadder('eht').length - mcsLadder('he').length).toBe(2)
  })

  it('far wall at 12 dBm: one rung down, and 768.8 µs becomes 1476.0 µs', () => {
    // "the received level falls just under the sensitivity of the rung it was using, so the
    //  frames drop a rung and stretch from 768.8 to 1476.0 µs. 3 dB nearly doubles the airtime."
    const s = primerScenario(14)
    s.nodes.find((n) => n.id === 'sta-1')!.txPowerDbm = 12
    const lb = linkBudget({ txDbm: 12, distanceM: 14, walls: ['brick'], widthMhz: 20, mode: 'eht' })
    expect(lb.rssiDbm.toFixed(1)).toBe('-81.1')
    // just under rung 1's −79 dBm, still above rung 0's −82 dBm: exactly one rung
    expect(PHY_MODES.eht.sensDbm[1]).toBe(-79)
    expect(PHY_MODES.eht.sensDbm[0]).toBe(-82)
    expect(lb.rssiDbm).toBeLessThan(PHY_MODES.eht.sensDbm[1])
    expect(lb.rssiDbm).toBeGreaterThanOrEqual(PHY_MODES.eht.sensDbm[0])
    const rs = [...new Simulation(s).runUntil(50 * MS).records]
    const data = txs(rs, 'sta-1', 'data')
    expect(data.every((r) => r.frame.mcs === 0)).toBe(true)
    expect(data[0].frame.txTimeNs).toBe(1_476_000)
    expect(txTimeModeNs('eht', 1530, 0)).toBe(1_476_000)
    expect(ofType(rs, 'RX_FAIL')).toHaveLength(0)
    expect(TABLE[3].airtime * 2).toBeGreaterThan(1_476_000)
  })
})

/**
 * Slice 4a built frequency selectivity, so "the engine has no partially broken sub-carriers" is
 * no longer true — but the half this lesson is about still is: rate selection reads the link
 * table's mean (`mcsForPeer`), and nothing frequency-selective reaches it. The limit therefore
 * changes from "the situation does not exist" to "the situation exists and selection still cannot
 * see it", and names the standard's own two feedbacks that a real device uses instead.
 */
describe('mcs-ladder · rate selection after frequency selectivity', () => {
  const text = mcsLadderLesson.limits.map((l) => l.text).join('\n')

  it('says the per-bin ripple exists now and that selection still reads the mean', () => {
    expect(text).toContain(`${selBinWidthMhz()} MHz 一格`)
    expect(text).toContain('mcsForPeer')
    expect(text).toContain('频率选择性一个字都不进去')
  })

  /**
   * **And each clause number with the document it is actually in** (Task 6 of slice 4b). The
   * limit used to print 「§9.4.1.65 / §9.4.1.75」 under one 「标准」, and that is a factual
   * error about the corpus: searched over both documents, `9.4.1.65` occurs 6 times in IEEE Std
   * 802.11-2024 and 0 times in 802.11be-2024, and `9.4.1.75` the other way round (6 / 0). The
   * base standard's 9.4.1 runs to §9.4.1.71, so §9.4.1.75 is not a clause of it at all — it is
   * 802.11be-2024's EHT CQI Report field, the HE one being §9.4.1.65. `engine/selectivity.ts`
   * records the same correction for the constants keyed to it.
   */
  it('names the two feedbacks the standard defines for exactly this, each in its own document', () => {
    expect(text).toContain('IEEE Std 802.11-2024 §9.4.1.65')
    expect(text).toContain('IEEE Std 802.11be-2024 §9.4.1.75')
    expect(text).toContain('§9.4.1.49')
    expect(text).toContain('−8…+7 dB')
    // The pairing that was the error: never again under one document, nor as a bare pair.
    expect(text).not.toContain('§9.4.1.65 / §9.4.1.75')
    expect(text).not.toContain('§9.4.1.65 与 §9.4.1.75')
  })

  it('no longer claims the engine models no frequency selectivity', () => {
    expect(text).not.toContain('不建模时延扩展与频率选择性')
  })

  it('and neither section is in any scene this lesson runs', () => {
    // Both sections, every variant (review finding 7). The lesson's other limits tell the reader
    // to open fading in the editor to see rate control move, which is only honest if this scene
    // has neither section.
    const scenes = [mcsLadderLesson.scenario(), ...(mcsLadderLesson.variants ?? []).map((v) => v.scenario())]
    expect(scenes.length).toBeGreaterThan(1)
    for (const [i, sc] of scenes.entries()) {
      expect(sc.selectivity, `scene ${i}`).toBeUndefined()
      expect(sc.fading, `scene ${i}`).toBeUndefined()
    }
  })
})

/**
 * **The lookup-table limit, split 2026-10-05 (slice 4e).**
 *
 * It was one `unmodelled` entry with one `until: 'rate-vs-model'`, and it was compound —
 * the same shape `7ab9eb6` had just split on `uwb-blocks`, so deleting the whole `until`
 * would have thrown away a promise that is actually kept:
 *
 *  - **The scenario half IS lifted.** 「本课四个变体一次失败也没有 …… 而本课这一层看不见」 is a
 *    fact about THIS scene, and `rate-vs-model` opens it: that lesson's scene really does
 *    lose frames, so the loss feedback under the lookup table becomes visible. Same shape
 *    as `streams` 「只有一台站点」 → `mumimo`. It is therefore `out-of-scope`, which is the
 *    only kind an `until` may sit on (criterion A, `tests/course/limits.test.ts`).
 *  - **The engine half is lifted by nothing.** 「最近的成功率、信道忙闲，以及主动探测」 are
 *    three things `rate.ts` does not have, and every lesson runs the same `rate.ts`.
 *    `rate-vs-model`'s own `limits[0]`/`limits[1]` say so in its own words — no probe
 *    frames, no loss-rate window, CARA and RRAA mentioned and not implemented. So this
 *    half gets `seeAlso` (that lesson goes deeper, it does not lift) and says out loud
 *    that no lesson lifts it, the way `uwb-blocks` does.
 */
describe('mcs-ladder · the lookup-table limit promises only the half that is kept', () => {
  const scene = mcsLadderLesson.limits.find((l) => l.until === 'rate-vs-model')
  const engine = mcsLadderLesson.limits.find((l) => l.seeAlso === 'rate-vs-model')

  it('promises the lift only for the half this scene hides', () => {
    expect(scene, 'the lookup-table limit no longer points at `rate-vs-model`').toBeDefined()
    expect(scene!.kind).toBe('out-of-scope')
    // The scene clause leads, 2026-10-05 fix 1: an `out-of-scope` limit renders behind
    // 「这个模型答不了：」, and a sentence that opens on what the MODEL does reads as a denial
    // that the engine models it at all. `backoff`'s limit is the real precedent — it opens
    // 「这个场景里一次成功只换来一帧」, anchoring the scope first — so this one now does too.
    expect(scene!.text.startsWith('本课四个变体一次失败也没有')).toBe(true)
    expect(scene!.text).toContain('这一层看不见')
    // and it does NOT also promise the three inputs the engine simply does not have
    for (const notPromised of ['最近的成功率', '信道忙闲', '主动探测']) {
      expect(scene!.text, notPromised).not.toContain(notPromised)
    }
    expect(scene!.seeAlso).toBeUndefined()
  })

  it('keeps the engine half as a deeper read rather than a lift, and says nothing lifts it', () => {
    expect(engine, 'the engine half lost its pointer entirely').toBeDefined()
    expect(engine!.kind).toBe('unmodelled')
    expect(engine!.until, 'no lesson can lift a limit about the engine').toBeUndefined()
    expect(engine!.text).toContain('真实速率控制的输入还要更多')
    expect(engine!.text).toContain('一课也不解除')
  })

  it('`rate-vs-model` really does lose frames, and really does lack those three inputs', () => {
    const rvm = LESSONS.find((l) => l.id === 'rate-vs-model')!
    const rvmLimits = rvm.limits.map((l) => l.text).join(' / ')
    // what it lifts: the lookup table's floor becomes visible because this scene fails
    expect(rvmLimits).toContain('重传数才等于重叠数')
    // what it does NOT lift, restated in its own words — the other end of "never lifted"
    expect(rvmLimits).toContain('既不看是否收到了坏帧，也不发探测帧')
    expect(rvmLimits).toContain('引擎一个也没有实现')
    // **The target forwards nothing about THIS limit**, which is what matters here and is the
    // claim this assertion used to make of the whole lesson. It cannot any more: when the
    // `fading` lesson landed, `rate-vs-model`'s own time-invariance limit (the 57.8 dB link whose
    // level never moves, so every step down must be a collision) gained an `until: 'fading'` —
    // a different limit about a different axis, and `out-of-scope`, so exactly the kind that can
    // be lifted. Narrowed rather than deleted: the three limits that restate what `mcs-ladder`
    // hands over still carry no onward promise, and that is the property being pinned.
    const forwarding = rvm.limits.filter((l) => l.until || l.seeAlso)
    expect(forwarding.map((l) => l.until ?? l.seeAlso)).toEqual(['fading'])
    expect(forwarding[0].kind).toBe('out-of-scope')
    expect(forwarding[0].text).toContain('这张速率直方图就不再是单一成因的了')
    for (const needle of ['重传数才等于重叠数', '既不看是否收到了坏帧', '引擎一个也没有实现']) {
      const lim = rvm.limits.find((l) => l.text.includes(needle))!
      expect([lim.until, lim.seeAlso], needle).toEqual([undefined, undefined])
    }
  })
})

/**
 * **Every figure the lesson prints, read back out of the lesson.**
 *
 * This file is the most thorough in M1 — the six rungs, the five steps, the worked column, the
 * four positions and both experiments all have assertions — and every one of them compares the
 * engine with a literal written HERE, with the lesson's row quoted in a comment above it. `TABLE`
 * at the top of this file is the four-position table retyped: five figures a row, twenty in all,
 * on the test side. A comment is not a comparison, and a retyped table is not the table.
 *
 * `@mcs-ladder` hand-types 37 figures into its graded prose. It is also where the ratchet's own
 * detector was wrong: `tests/course/prose-readback.test.ts` listed this lesson as one whose test
 * never touches its prose, while the test reads `mcsLadderLesson.numbers` and
 * `mcsLadderLesson.limits` on four lines — the lesson is imported under an alias here, because
 * `mcsLadder` is already the widget model's function, and the detector only ever looked for
 * `mcsLadder.numbers`. The detector now reads the alias out of the import; what it was reporting
 * for this lesson was a naming convention. What it reported is nonetheless true of the FIGURES:
 * the reads it found are the widget's `params` and four `toContain` checks over `limits`, and not
 * one of the 37 printed figures. So this describe is the read-back the list was asking for.
 *
 * Each cell's unit and each figure's own number of decimals are read off the cell, never written
 * here: a figure cannot be re-measured without its convention.
 */
describe('mcs-ladder · every printed figure is read back out of the lesson', () => {
  const L = mcsLadderLesson
  const rungs = mcsLadder('eht')
  const tableWith = (fragment: string): { heading: string; head: string[]; rows: string[][] } => {
    const b = L.numbers!.find((x) => x.kind === 'table' && (x.heading ?? '').includes(fragment))
    expect(b, `no table whose heading contains 「${fragment}」`).toBeDefined()
    return b as { heading: string; head: string[]; rows: string[][] }
  }
  /** 「−82 dBm」 → −82; 「8.99 dB」 → 8.99; 「129.6 µs」 → 129.6; 「8.6」 → 8.6. */
  const val = (cell: string): number => Number(cell.replace(/−/g, '-').replace(/[^\d.-]/g, ''))
  /** A printed figure against a measurement, rounded to the decimals the CELL carries. */
  const same = (cell: string, measured: number, what: string): void => {
    const printed = cell.replace(/−/g, '-').replace(/[^\d.-]/g, '')
    const dp = (printed.split('.')[1] ?? '').length
    expect(Number(printed), `${what} (to ${dp} decimals, read off the cell)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  /** `zhNumeral` with 「两」 read as 「二」: the form Chinese uses before a measure word. */
  const zhCount = (s: string): number | null => zhNumeral(s.replace(/两/g, '二'))

  it('the rung table: fourteen rungs, six printed, and every cell of all six', () => {
    const t = tableWith('十四级中的六级')
    // 「十四级中的六级，20 MHz、单流」: the ladder's own length, this table's own length, and
    // the width — which is the width the worked column subtracts a noise floor for.
    const h = /([一二三四五六七八九十]+)级中的([一二三四五六七八九十]+)级，(\d+) MHz、单流/.exec(t.heading)
    expect(h, 'the heading no longer states the ladder, the extract and the width').not.toBeNull()
    expect(zhCount(h![1]), 'the rungs the ladder has').toBe(rungs.length)
    expect(zhCount(h![2]), 'and the rungs this table prints').toBe(t.rows.length)
    const floor = tableWith('照着步骤走一遍').rows
      .find((r) => r[0].includes('噪声地板'))![1]
    same(floor, noiseDbm(Number(h![3])), `the noise floor at the ${h![3]} MHz the heading names`)
    // every row, every column: the index, the modulation, the bits, the rate, the sensitivity
    // and the requirement — none of them typed on this side
    for (const row of t.rows) {
      const mcs = Number(row[0])
      const r = rungs.find((x) => x.mcs === mcs)
      expect(r, `the table prints MCS ${row[0]}, which the ladder does not have`).toBeDefined()
      const bits = PHY_MODES.eht.ndbps[mcs] / 234
      same(row[2], bits, `MCS ${mcs}: bits per sub-carrier`)
      same(row[3], r!.mbps, `MCS ${mcs}: Mb/s`)
      same(row[4], r!.sensDbm, `MCS ${mcs}: sensitivity`)
      same(row[5], r!.reqSinrDb, `MCS ${mcs}: the SINR it needs`)
      // 「16-QAM 1/2」: the name counts the symbols and the fraction is the coding rate, and
      // the two of them multiply out to the bits in the column beside them
      const m = /^(BPSK|QPSK|(\d+)-QAM) (\d+)\/(\d+)$/.exec(row[1])
      expect(m, `MCS ${mcs}: 「${row[1]}」 is not 「<modulation> <rate>」`).not.toBeNull()
      const symbols = m![2] ? Number(m![2]) : m![1] === 'BPSK' ? 2 : 4
      expect(Math.log2(symbols) * (Number(m![3]) / Number(m![4])),
        `MCS ${mcs}: ${row[1]} carries the bits the table prints beside it`).toBeCloseTo(bits, 9)
    }
    // the extract is in the ladder's own order, which is what makes it a ladder
    const printed = t.rows.map((r) => Number(r[0]))
    expect(printed, 'the rows climb').toEqual([...printed].sort((a, b) => a - b))
    // and it spans the whole ladder: the bottom rung and the top one are both in it
    expect([printed[0], printed[printed.length - 1]], 'from the bottom rung to the top')
      .toEqual([rungs[0].mcs, rungs[rungs.length - 1].mcs])
  })

  it('the gloss under it: two levels, four levels, and the QAM family it names', () => {
    const p = (L.numbers! as { text?: string }[]).map((x) => x.text ?? '').join('\n')
    const m = /([两一二三四五六七八九十]+)个电平是 BPSK[^]*?([两一二三四五六七八九十]+)个是 QPSK[^]*?家族的 ([\d、和 ]+)。/
      .exec(p)
    expect(m, 'the modulation gloss is gone, or its shape changed').not.toBeNull()
    expect(Math.log2(zhCount(m![1])!), 'BPSK carries one bit per symbol').toBe(1)
    expect(Math.log2(zhCount(m![2])!), 'and QPSK two').toBe(2)
    // the family members it lists are exactly the QAM orders the table prints
    const listed = m![3].split(/、|和/).map((x) => Number(x.trim())).sort((a, b) => a - b)
    const inTable = [...new Set(tableWith('十四级中的六级').rows
      .map((r) => /^(\d+)-QAM/.exec(r[1])?.[1]).filter(Boolean).map(Number))].sort((a, b) => a - b)
    expect(listed, 'the gloss lists the QAM orders the table uses').toEqual(inTable)
    // 「1/2 表示一半是消息、一半是冗余」
    const half = /(\d+)\/(\d+) 表示一半是消息/.exec(p)
    expect(half, 'the gloss no longer reads a coding rate out loud').not.toBeNull()
    expect(Number(half![1]) / Number(half![2]), 'and that rate really is a half').toBe(0.5)
  })

  it('the widget’s caption rounds the living room down, and the marker is that figure', () => {
    const w = L.numbers!.find((b) => b.kind === 'widget') as
      { params?: Record<string, number | string>; caption?: string }
    const m = /向下取整到 ([\d.]+) dB/.exec(w.caption ?? '')
    expect(m, 'the caption no longer states the rounded SNR').not.toBeNull()
    const lb = linkBudget({ txDbm: 15, distanceM: 9, walls: ['brick'], widthMhz: 20, mode: 'eht' })
    expect(Number(m![1]), 'the SNR the marker stops at, rounded down to half a dB')
      .toBe(Math.floor(lb.snrDb * 2) / 2)
    expect(Number(m![1]), 'which is the figure the widget is actually given').toBe(w.params!.snrDb)
    // 「余量已经算进去了」: the rungs it lights are the ones the margin allows
    expect(rungs.filter((r) => Number(m![1]) >= r.reqSinrDb + RATE_MARGIN_DB).map((r) => r.mcs),
      'the rungs that fit at that SNR').toEqual([0, 1, 2, 3])
  })

  it('the steps: the 90.99 dB it adds back, the 3 dB it keeps, and the width', () => {
    const items = (L.numbers!.find((x) => x.kind === 'steps') as { items: string[] }).items
    // step 2: 「它的灵敏度加 90.99 dB」
    const add = /灵敏度（sensitivity）加 ([\d.]+) dB/.exec(items[1])
    expect(add, 'step 2 no longer states what it adds to a sensitivity').not.toBeNull()
    for (const r of rungs) {
      same(`${add![1]}`, r.reqSinrDb - r.sensDbm, `MCS ${r.mcs}: requirement less sensitivity`)
    }
    // step 3: 「所需 SINR + 3 dB ≤ SNR」
    const margin = /所需 SINR \+ (\d+) dB ≤ SNR/.exec(items[2])
    expect(margin, 'step 3 no longer states the margin').not.toBeNull()
    same(`${margin![1]}`, RATE_MARGIN_DB, 'the rate margin step 3 keeps')
    // step 5: 「在 20 MHz 上」, and 「比标准表格的假设多听见 3 dB，恰好与余量相抵」
    const width = /在 (\d+) MHz 上/.exec(items[4])
    expect(width, 'step 5 no longer names the width its shortcut holds at').not.toBeNull()
    const extra = /多听见 (\d+) dB/.exec(items[4])
    expect(extra, 'step 5 no longer states the dB that cancels the margin').not.toBeNull()
    same(`${extra![1]}`, RATE_MARGIN_DB, 'the dB the shortcut cancels against')
    // and the shortcut really does agree with the arithmetic, at the width it names
    const w = Number(width![1])
    for (let dbm = -90; dbm <= -30; dbm += 0.5) {
      const bySens = PHY_MODES.eht.sensDbm.reduce((best, sens, i) => (dbm >= sens ? i : best), 0)
      expect(mcsForRssi('eht', dbm, undefined, w), `${dbm} dBm at ${w} MHz`).toBe(bySens)
    }
  })

  it('the worked column: six rows, the two verdicts included', () => {
    const t = tableWith('照着步骤走一遍')
    const rssi = val(t.rows.find((r) => r[0].includes('到达电平'))![1])
    const snr = rssi - noiseDbm(20)
    const ROWS: readonly (readonly [RegExp, (cell: string, l: RegExpExecArray) => void])[] = [
      [/^这条链路的到达电平$/, (c) => {
        const s = L.variants![2].scenario()
        same(c, buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')!, 'the level on that link')
      }],
      [/^减去 (\d+) MHz 的噪声地板$/, (c, l) => same(c, noiseDbm(Number(l[1])), 'the noise floor')],
      [/^= SNR$/, (c) => same(c, snr, 'the SNR the two rows above give')],
      // 「第 3 级的要求，加上余量」 → 「16.99 + 3 = 19.99 dB ✓」: a sum, and a verdict
      [/^第 (\d+) 级的要求，加上余量$/, (c, l) => verdict(c, Number(l[1]), snr)],
      [/^第 (\d+) 级的要求，加上余量$/, (c, l) => verdict(c, Number(l[1]), snr)],
      [/^于是这一帧发出去时用的是$/, (c) => {
        const m = /^MCS (\d+)$/.exec(c)
        expect(m, `「${c}」 is not 「MCS n」`).not.toBeNull()
        expect(Number(m![1]), 'the rung the sender picks').toBe(mcsForRssi('eht', rssi, undefined, 20))
      }],
    ]
    function verdict(cell: string, mcs: number, snrDb: number): void {
      const m = /^([\d.]+) \+ (\d+) = ([\d.]+) dB ([✓✗])$/.exec(cell)
      expect(m, `MCS ${mcs}: 「${cell}」 is not 「req + margin = sum dB ✓/✗」`).not.toBeNull()
      same(m![1], reqSinrDb('eht', mcs), `MCS ${mcs}: what it requires`)
      same(m![2], RATE_MARGIN_DB, `MCS ${mcs}: the margin`)
      same(m![3], reqSinrDb('eht', mcs) + RATE_MARGIN_DB, `MCS ${mcs}: and the sum`)
      // the tick is a claim, not decoration: it says this rung fits at this SNR
      expect(m![4], `MCS ${mcs}: whether it fits at ${snrDb.toFixed(1)} dB`)
        .toBe(reqSinrDb('eht', mcs) + RATE_MARGIN_DB <= snrDb ? '✓' : '✗')
    }
    expect(t.rows, 'the column walks exactly the rows this reads').toHaveLength(ROWS.length)
    for (const [i, [re, check]] of ROWS.entries()) {
      const l = re.exec(t.rows[i][0])
      expect(l, `row ${i}: 「${t.rows[i][0]}」 is not in the shape this reads`).not.toBeNull()
      check(t.rows[i][1], l!)
    }
    // the two verdicts really are one of each, which is what makes the row above the answer
    expect(t.rows.map((r) => /([✓✗])$/.exec(r[1])?.[1]).filter(Boolean), 'one fits, one does not')
      .toEqual(['✓', '✗'])
  })

  it('the four positions: distance, wall, level, SNR, rung, requirement and airtime', () => {
    const t = tableWith('同一个 1530 字节帧，按位置')
    // the heading carries the frame size, and it is the frame the run actually sends
    const bytes = /同一个 (\d+) 字节帧/.exec(t.heading)
    expect(bytes, 'the heading no longer states the frame size').not.toBeNull()
    // the margin column names the margin
    const head = /所需 \+ (\d+) dB/.exec(t.head[4])
    expect(head, 'the requirement column no longer names the margin it adds').not.toBeNull()
    same(head![1], RATE_MARGIN_DB, 'the margin the column adds')
    expect(t.rows, 'one row per variant of the lesson').toHaveLength(L.variants!.length)
    t.rows.forEach((row, i) => {
      // 「客厅，9 m + 砖墙」: the distance, and whether there is a wall in the way
      const where = /^.+?，(\d+) m( \+ 砖墙)?$/.exec(row[0])
      expect(where, `row ${i}: 「${row[0]}」 does not name a distance`).not.toBeNull()
      const d = Number(where![1])
      expect(d, `row ${i}: the distance the scene is built at`).toBe(PRIMER_DISTANCES[i])
      const s = L.variants![i].scenario()
      const lb = linkBudget({ txDbm: 15, distanceM: d, walls: [...wallsFor(d)], widthMhz: 20, mode: 'eht' })
      const measured = buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')!
      same(row[1], measured, `row ${i}: the level`)
      // 「+ 砖墙」 is a claim about the PATH, and every one of these scenes has five walls in it,
      // so counting them answers a different question. The level does answer it: of the two
      // budgets, with a brick wall and without, only one is the level that was measured.
      const budget = (walls: 'brick'[]) =>
        linkBudget({ txDbm: 15, distanceM: d, walls, widthMhz: 20, mode: 'eht' }).rssiDbm
      expect(Math.abs(measured - budget(['brick'])) < Math.abs(measured - budget([])),
        `row ${i}: whether a brick wall stands in this path`).toBe(!!where![2])
      same(row[2], lb.snrDb, `row ${i}: the SNR`)
      expect(Number(row[3]), `row ${i}: the rung`).toBe(lb.mcs)
      same(row[4], reqSinrDb('eht', lb.mcs) + RATE_MARGIN_DB, `row ${i}: requirement plus margin`)
      const data = txs(variantRecs(i), 'sta-1', 'data')[0]
      same(row[5], data.frame.txTimeNs / 1000, `row ${i}: the airtime`)
      expect(data.frame.bytes, `row ${i}: and the frame really is that size`).toBe(Number(bytes![1]))
    })
  })

  it('both observe lines, including the 「近六倍」 the second one takes', () => {
    const o = L.observe!
    // 「13、10、3、1」
    const rungsSaid = /第一个数据帧的 MCS：([\d、]+)——/.exec(o[0])
    expect(rungsSaid, 'observe[0] no longer lists the four rungs').not.toBeNull()
    expect(rungsSaid![1].split('、').map(Number), 'the rung of the first data frame, variant by variant')
      .toEqual(L.variants!.map((_v, i) => txs(variantRecs(i), 'sta-1', 'data')[0].frame.mcs))
    // 「129.6、143.2、415.2、768.8 µs」 and 「往下走十二级 … 多花近六倍」
    const air = /空口时间：([\d.、]+) µs。往下走([一二三四五六七八九十]+)级，同样的 (\d+) 个字节要多花近([一二三四五六七八九十]+)倍/
      .exec(o[1])
    expect(air, 'observe[1] no longer lists the four airtimes').not.toBeNull()
    const printed = air![1].split('、')
    expect(printed, 'one airtime per variant').toHaveLength(L.variants!.length)
    printed.forEach((cell, i) => {
      same(cell, txs(variantRecs(i), 'sta-1', 'data')[0].frame.txTimeNs / 1000, `variant ${i}: airtime`)
    })
    const mcsOf = (i: number): number => txs(variantRecs(i), 'sta-1', 'data')[0].frame.mcs!
    expect(zhCount(air![2]), 'the rungs between the top position and the bottom one')
      .toBe(mcsOf(0) - mcsOf(printed.length - 1))
    expect(Number(air![3]), 'the frame it is the same frame of')
      .toBe(txs(variantRecs(0), 'sta-1', 'data')[0].frame.bytes)
    // 「近六倍」: approaching six, and it has not got there
    const ratio = txs(variantRecs(3), 'sta-1', 'data')[0].frame.txTimeNs
      / txs(variantRecs(0), 'sta-1', 'data')[0].frame.txTimeNs
    const n = zhCount(air![4])!
    expect(ratio, `「近${air![4]}倍」 has not reached ${n}`).toBeLessThan(n)
    expect(Math.abs(ratio / n - 1), 'but is within a tenth of it').toBeLessThan(0.1)
  })

  it('both experiments, read out of `tryThis`', () => {
    // 「把滑杆先调到 15.9 dB，再调到 62.3 dB：最高可用级从 MCS 1 变成 MCS 13——46 dB 换来十二级」
    const a = /把滑杆先调到 ([\d.]+) dB，再调到 ([\d.]+) dB：最高可用级从 MCS (\d+) 变成 MCS (\d+)——(\d+) dB 换来([一二三四五六七八九十]+)级/
      .exec(L.tryThis![0])
    expect(a, 'the slider experiment is gone, or its shape changed').not.toBeNull()
    const top = (mode: 'he' | 'eht', snr: number) =>
      mcsLadder(mode).filter((r) => snr >= r.reqSinrDb + RATE_MARGIN_DB).pop()!.mcs
    expect(Number(a![3]), 'the top rung at the lower setting').toBe(top('eht', Number(a![1])))
    expect(Number(a![4]), 'and at the higher one').toBe(top('eht', Number(a![2])))
    // the two SNRs are two rows of the position table, so the experiment is the room
    const positions = tableWith('同一个 1530 字节帧，按位置').rows.map((r) => val(r[2]))
    for (const snr of [Number(a![1]), Number(a![2])]) {
      expect(positions, `${snr} dB is a position in the table`).toContain(snr)
    }
    // 「46 dB 换来十二级」: both halves, to the dB the sentence rounds to
    same(a![5], Number(a![2]) - Number(a![1]), 'the dB between the two settings')
    expect(zhCount(a![6]), 'and the rungs they buy').toBe(Number(a![4]) - Number(a![3]))
    // 「再按下 HE（Wi-Fi 6）那个模式按钮，最快的两级就消失了」
    const he = /按下 HE（Wi-Fi 6）那个模式按钮，最快的([两一二三四五六七八九十]+)级就消失了/
      .exec(L.tryThis![0])
    expect(he, 'the HE half of the experiment is gone').not.toBeNull()
    expect(zhCount(he![1]), 'the rungs HE does not have').toBe(rungs.length - mcsLadder('he').length)
    // 「把发射功率从 15 dBm 降到 12 dBm … 时长从 768.8 µs 拉到 1476.0 µs」
    const b = /从 (\d+) dBm 降到 (\d+) dBm[^]*?时长从 ([\d.]+) µs 拉到 ([\d.]+) µs：(\d+) dB 几乎让空口时间翻倍/
      .exec(L.tryThis![1])
    expect(b, 'the transmit-power experiment is gone, or its shape changed').not.toBeNull()
    const far = PRIMER_DISTANCES[PRIMER_DISTANCES.length - 1]
    const s = primerScenario(far)
    expect(s.nodes.find((n) => n.id === 'sta-1')!.txPowerDbm, 'the power the scene starts at')
      .toBe(Number(b![1]))
    s.nodes.find((n) => n.id === 'sta-1')!.txPowerDbm = Number(b![2])
    const dropped = [...new Simulation(s).runUntil(50 * MS).records] as TLRecord[]
    same(b![3], txs(variantRecs(3), 'sta-1', 'data')[0].frame.txTimeNs / 1000, 'the airtime before')
    same(b![4], txs(dropped, 'sta-1', 'data')[0].frame.txTimeNs / 1000, 'and after')
    same(b![5], Number(b![1]) - Number(b![2]), 'the dB it was dropped by')
    // 「几乎翻倍」: not quite double, which is the whole point of 「几乎」
    expect(val(b![4]), 'it has not quite doubled').toBeLessThan(2 * val(b![3]))
    expect(val(b![4]) / val(b![3]), 'but it is close').toBeGreaterThan(1.8)
  })

  it('the quiz walks the shortcut by hand, in the engine’s own sensitivities', () => {
    // quiz 1: 「为什么在书桌旁只要 129.6 µs，到远端墙边却要 768.8 µs」, and its explanation's two rungs
    const q1 = /只要 ([\d.]+) µs，到远端墙边却要 ([\d.]+) µs/.exec(L.quiz[0].q)
    expect(q1, 'quiz 1 no longer states the two airtimes').not.toBeNull()
    same(q1![1], txs(variantRecs(0), 'sta-1', 'data')[0].frame.txTimeNs / 1000, 'the desk’s airtime')
    same(q1![2], txs(variantRecs(3), 'sta-1', 'data')[0].frame.txTimeNs / 1000, 'and the far wall’s')
    const e1 = /这一帧走 MCS (\d+) 而不是 MCS (\d+)/.exec(L.quiz[0].explain!)
    expect(e1, 'quiz 1’s explanation no longer names the two rungs').not.toBeNull()
    expect([Number(e1![1]), Number(e1![2])], 'the far wall’s rung and the desk’s')
      .toEqual([txs(variantRecs(3), 'sta-1', 'data')[0].frame.mcs,
        txs(variantRecs(0), 'sta-1', 'data')[0].frame.mcs])
    // quiz 2: 「到达电平是 −73 dBm，20 MHz」 → 「MCS 3：灵敏度 −74 dBm；下一级要 −70 dBm」
    const q2 = /到达电平是 ([−\d.]+) dBm，(\d+) MHz/.exec(L.quiz[1].q)
    expect(q2, 'quiz 2 no longer states the level it asks about').not.toBeNull()
    const dbm = val(q2![1])
    const o = /^MCS (\d+)：灵敏度 ([−\d.]+) dBm，不高于 ([−\d.]+) dBm；下一级要 ([−\d.]+) dBm$/
      .exec(L.quiz[1].options[L.quiz[1].answer])
    expect(o, 'the right answer no longer walks the shortcut').not.toBeNull()
    const pick = Number(o![1])
    expect(pick, 'the rung the shortcut picks at that level')
      .toBe(mcsForRssi('eht', dbm, undefined, Number(q2![2])))
    same(o![2], PHY_MODES.eht.sensDbm[pick]!, `MCS ${pick}: its sensitivity`)
    expect(val(o![3]), 'the level the question asked about, restated').toBe(dbm)
    same(o![4], PHY_MODES.eht.sensDbm[pick + 1]!, `MCS ${pick + 1}: the rung just above`)
    // and the shortcut's two inequalities, which are what make this the answer
    expect(PHY_MODES.eht.sensDbm[pick]!, 'the chosen rung is within reach').toBeLessThanOrEqual(dbm)
    expect(PHY_MODES.eht.sensDbm[pick + 1]!, 'and the next one is not').toBeGreaterThan(dbm)
  })

  it('`deeper`’s 10 dB and `limits`’ citation, which the graded walk never reads', () => {
    // Headings as well as bodies: 「为什么 Wi-Fi 6 只有十二级」 is a heading, and the figure in
    // it is the only place the course states how many rungs HE has.
    const d = (L.deeper! as { heading?: string; text?: string }[])
      .map((x) => `${x.heading ?? ''}\n${x.text ?? ''}`).join('\n')
    // 「第 3 级与第 7 级 … 2 比特对 5 比特，代价是要求高出 10 dB」
    const m = /第 (\d+) 级与第 (\d+) 级[^]*?(\d+) 比特对 (\d+) 比特，代价是要求高出 (\d+) dB/.exec(d)
    expect(m, '`deeper` no longer compares the two rungs').not.toBeNull()
    const [lo, hi] = [Number(m![1]), Number(m![2])]
    same(m![3], PHY_MODES.eht.ndbps[lo] / 234, `MCS ${lo}: bits per sub-carrier`)
    same(m![4], PHY_MODES.eht.ndbps[hi] / 234, `MCS ${hi}: bits per sub-carrier`)
    same(m![5], reqSinrDb('eht', hi) - reqSinrDb('eht', lo), 'and the dB between their requirements')
    // 「为什么 Wi-Fi 6 只有十二级」
    const twelve = /只有([一二三四五六七八九十]+)级/.exec(d)
    expect(twelve, '`deeper` no longer counts HE’s rungs').not.toBeNull()
    expect(zhCount(twelve![1]), 'the rungs HE has').toBe(mcsLadder('he').length)
    // 「（simulation.ts 的 mcsForPeer）」: a citation is a claim about this repository
    const cite = /（([\w.]+) 的 (\w+)）/.exec(L.limits.map((x) => x.text).join('\n'))
    expect(cite, '`limits` no longer cites where the sender reads the level').not.toBeNull()
    const src = readFileSync(resolve(ROOT, `src/engine/${cite![1]}`), 'utf8')
    expect(src.includes(cite![2]), `${cite![1]} declares ${cite![2]}`).toBe(true)
  })

  /**
   * **The nineteen sites `scripts/figure-planting.ts` found this file still not reading**, on
   * 2026-10-12. Three figures account for most of them — the 1 530-byte frame, the 3 dB margin
   * and the 20 MHz width, each printed in three or four places — and the interesting one is
   * `deeper`'s 「1/2、3/4、5/6」: three code rates, printed as notation, and checkable because
   * the rung table beside them prints both the modulation and the bits per sub-carrier. A code
   * rate is the one of the three that cannot be read off the engine directly, and it does not
   * have to be: log2(order) × rate is the bits column, and the bits column is `ndbps / 234`.
   */
  it('the code rates `deeper` names are the ones the rung table’s own arithmetic implies', () => {
    const d = (L.deeper! as { heading?: string; text?: string }[])
      .map((x) => `${x.heading ?? ''}\n${x.text ?? ''}`).join('\n')
    const printed = /那个分数——([\d/]+)、([\d/]+)、([\d/]+)——/.exec(d)
    expect(printed, '`deeper` no longer names the three code rates').not.toBeNull()
    const rates = printed!.slice(1).map((x) => {
      const [a, b] = x.split('/').map(Number)
      return a / b
    })
    // every rung the table prints carries one of those rates, and the rate is what makes its
    // bits-per-sub-carrier column come out: log2(order) × rate = ndbps / 234
    const rows = (L.numbers!.find((x) => x.kind === 'table') as { rows: string[][] }).rows
    const seen = new Set<number>()
    for (const r of rows) {
      const mcs = Number(r[0])
      const mod = /^(?:(\d+)-QAM|(BPSK|QPSK)) (\d+)\/(\d+)$/.exec(r[1])
      expect(mod, `the rung 「${r[1]}」 is not 「modulation rate」`).not.toBeNull()
      const order = mod![1] !== undefined ? Number(mod![1]) : (mod![2] === 'BPSK' ? 2 : 4)
      const rate = Number(mod![3]) / Number(mod![4])
      expect(rates, `MCS ${mcs} uses a code rate 「${mod![3]}/${mod![4]}」 that \`deeper\` never names`)
        .toContain(rate)
      seen.add(rate)
      expect(Math.log2(order) * rate, `MCS ${mcs}: bits per sub-carrier`)
        .toBeCloseTo(PHY_MODES.eht.ndbps[mcs] / 234, 9)
    }
    expect([...seen].sort(), 'and every rate `deeper` names is used by a rung of the table')
      .toEqual([...rates].sort())
  })

  it('the frame, the margin and the width, wherever this lesson states them', () => {
    const everywhere = [
      L.why ?? '', ...(L.outcomes ?? []),
      ...(L.picture ?? []).map((b) => JSON.stringify(b)),
      ...(L.numbers ?? []).map((b) => JSON.stringify(b)),
      ...(L.deeper ?? []).map((b) => JSON.stringify(b)),
      ...L.limits.map((l) => l.text), ...(L.sources ?? []),
      ...L.observe, ...L.tryThis,
      ...L.quiz.flatMap((q) => [q.q, ...q.options, q.explain ?? '']),
    ].join('\n')
    // 「1530 个字节」/「1530 字节帧」: the frame every variant of this scene sends
    const frames = [...everywhere.matchAll(/(\d[\d ]*) 个?字节/g)]
      .map((m) => Number(m[1].replace(/ /g, '')))
      .filter((n) => n > 100)
    expect(frames.length, 'the lesson states the frame size more than once').toBeGreaterThan(1)
    const sent = new Set(variantRecs(0).filter((r) => r.type === 'TX_START' && r.frame.kind === 'data')
      .map((r) => (r as Extract<TLRecord, { type: 'TX_START' }>).frame.bytes))
    for (const f of frames) expect(sent, `a frame of ${f} B`).toContain(f)
    // 「3 dB 余量」: the engine's own margin, wherever the lesson names it
    const margins = [...everywhere.matchAll(/(\d+) dB 余量|留 (\d+) dB|这 (\d+) dB 就是/g)]
      .flatMap((m) => m.slice(1).filter(Boolean).map(Number))
    expect(margins.length, 'the lesson states the margin more than once').toBeGreaterThan(2)
    for (const g of margins) expect(g, `a margin of ${g} dB`).toBe(RATE_MARGIN_DB)
    // 「20 MHz」: the width every rate in this lesson is quoted at
    // the lookbehind keeps 「2.03125 MHz」 (the selectivity bin, which `limits` owns) out
    const widths = [...everywhere.matchAll(/(?<![\d.])(\d+) MHz/g)].map((m) => Number(m[1]))
    expect(widths.length, 'the lesson states the width more than once').toBeGreaterThan(1)
    for (const w of widths) expect(w, `a width of ${w} MHz`).toBe(20)
  })

  /**
   * **One figure of this lesson stays unread, with its reason.** `limits` names the standard's
   * own feedback granularity — 「逐 26 音调资源单元的平均信噪比」, cited to §9.4.1.65 — and that
   * is a figure about a document this repository does not contain. The engine has no 26-tone
   * resource unit to compare it with either: nothing in it reports per-RU signal-to-noise, which
   * is what the limit is saying. `scripts/figure-planting.ts` reports it and should.
   */
  it('`sources`’ guard interval, and the rung the quiz’s wrong option reaches for', () => {
    // 「本课的 Mb/s 是 20 MHz、单空间流、0.8 µs 保护间隔下的数值」: the tier every rate in the
    // rung table is quoted at
    const [gi] = [/([\d.]+) µs 保护间隔/.exec(L.sources!.join('\n'))!]
    same(gi[1], TGI_NS.base / 1_000, '`sources` on the guard interval the rates are quoted at')
    const rows = (L.numbers!.find((x) => x.kind === 'table') as { rows: string[][] }).rows
    for (const r of rows) {
      same(r[3], mcsRateMbps('eht', Number(r[0]), TGI_NS.base), `MCS ${r[0]}: the rate at that tier`)
    }
    // the quiz's wrong option: 「MCS 4：离 −70 dBm 只差 3 dB，余量正好补上」 — the sensitivity
    // it names is that rung's own, and the shortcut's answer is the rung below it
    const q = L.quiz.find((x) => x.q.includes('−73 dBm'))!
    const wrong = q.options.find((o) => o.includes('余量正好补上'))!
    const m = /MCS (\d+)：离 (−[\d.]+) dBm 只差 (\d+) dB/.exec(wrong)
    expect(m, 'the quiz no longer offers that option').not.toBeNull()
    same(m![2], PHY_MODES.eht.sensDbm[Number(m![1])], `MCS ${m![1]}: its own sensitivity`)
    expect(Number(m![3]), 'the margin it wants to add').toBe(RATE_MARGIN_DB)
    const [level] = [Number(/到达电平是 (−[\d.]+) dBm/.exec(q.q)![1].replace('−', '-'))]
    expect(PHY_MODES.eht.sensDbm[Number(m![1])], 'which is indeed above the level in the question')
      .toBeGreaterThan(level)
    // and the right answer is the rung below it, whose sensitivity is not above that level
    const right = /MCS (\d+)：灵敏度 (−[\d.]+) dBm/.exec(q.options[q.answer])
    expect(right, 'the quiz no longer states the rung it calls correct').not.toBeNull()
    expect(Number(right![1]), 'the rung the shortcut lands on').toBe(Number(m![1]) - 1)
    expect(PHY_MODES.eht.sensDbm[Number(right![1])], 'whose sensitivity is at or under the level')
      .toBeLessThanOrEqual(level)
  })
})
