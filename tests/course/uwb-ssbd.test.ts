/**
 * Every empirical claim in "有界的延后，和它界不住的那个帧" — the lesson on spectrum sensing based
 * deferral (standard §10.45, a P802.15.4ab **draft** clause; see `uwb/phy.ts`'s `ssbdBoundNs` and
 * design doc `docs/superpowers/specs/2026-10-03-ssbd-design.md` §0.1).
 *
 * Nothing below is a number typed out of the design doc. The two bounds come from
 * `ssbdBoundNs`/`nbSlotSlackNs` called with the schema's own defaults, the backoff-unit setting
 * comes from the lesson's own computed export, and every count — ranges, fixes, sensing records,
 * clamps, timeouts, Wi-Fi airtimes — is read out of a 1.3 s run of the lesson's own four scenes.
 * The prose is then checked against those values rather than the other way round: this file
 * decides what the lesson may print.
 *
 * Why that matters here specifically: three reading-time constants were re-typed from memory
 * earlier on this branch and all three were wrong, and the design doc's own "the scene's longest
 * Wi-Fi frame is 469.6 µs" is a figure measured on `uwb-nba-coexist`'s **one-to-many** base scene,
 * not on the pair-round scene this lesson runs — where the narrowband messages the session gets
 * out push the Wi-Fi link down two rate steps and the longest data frame is 564.8 µs. The lesson
 * prints the number this file measures.
 */
import { describe, it, expect } from 'vitest'
import {
  SSBD_BIGGEST_BF, SSBD_BIGGEST_UNIT_US, SSBD_DEFAULTS, uwbSsbd, uwbSsbdScenario,
} from '../../src/course/uwb/uwb-ssbd'
import { uwbNbaScenario } from '../../src/course/uwb/uwb-nba'
import { COURSE_ORDER, MODULES, citedDocs } from '../../src/course/curriculum'
import { cellTexts, lessonStrings, paragraphTexts } from '../../src/course/readability'
import type { Block } from '../../src/course/lessonKit'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { applyRecord, initViewState } from '../../src/model/view'
import { fmtRecord } from '../../src/ui/format'
import { STRINGS } from '../../src/ui/i18n'
import { uwbLbtText, uwbSsbdText } from '../../src/uwb/ui/rows'
import { NB_LBT_CCA_US, NB_LBT_THRESHOLD_DBM, NB_POLL_BYTES, NB_REPORT_BYTES, nbPpduNs } from '../../src/uwb/nb'
import { NB_WINDOW_SLOTS } from '../../src/uwb/mms'
import { nbSlotSlackNs, rstuNs, ssbdBoundNs } from '../../src/uwb/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const US = 1_000
/** Seven whole blocks — the window every narrowband lesson measures over. */
const RUN_NS = 1300 * MS
const TAG = 'uwb-1'
const NB_KINDS = new Set(['nbPoll', 'nbResp', 'nbReport'])
/** Indices into `uwbSsbd.variants`. */
const V_PER_BLOCK = 0
const V_BIGGEST = 1
const V_OFF = 2

// The lesson contract. 1.3 s rather than the kit's 30 ms default: one of the jump targets is the
// first solved fix, which this scene reaches at 256 ms.
lessonShapeSuite(uwbSsbd, { runNs: RUN_NS })

const recs = (variant?: number): TLRecord[] => runOf(uwbSsbd, variant, RUN_NS)
const ssbdOf = (variant?: number) => ofType(recs(variant), 'UWB_SSBD')
const rangesOf = (variant?: number): number => ofType(recs(variant), 'UWB_RANGE').length
const fixesOf = (variant?: number): number => ofType(recs(variant), 'UWB_POSITION').length
const nbTx = (rs: TLRecord[]) => ofType(rs, 'TX_START').filter((r) => NB_KINDS.has(r.frame.kind))
const wifiData = (rs: TLRecord[]) => ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'data')

/** Every line a reader meets on the main path, headings and table cells included. */
const mainText = (): string[] => [
  uwbSsbd.why!, ...uwbSsbd.outcomes!,
  ...paragraphTexts(uwbSsbd.picture!), ...cellTexts(uwbSsbd.picture!),
  ...paragraphTexts(uwbSsbd.numbers!), ...cellTexts(uwbSsbd.numbers!),
  ...uwbSsbd.observe, ...uwbSsbd.tryThis,
  ...uwbSsbd.quiz.flatMap((q) => [q.q, ...q.options, q.explain]),
]
/** Somewhere a reader can see it — including `deeper`, which carries the depth. */
const says = (s: string): boolean => lessonStrings(uwbSsbd).some((t) => t.includes(s))
/** The rows of the table whose heading starts with `heading`. */
function tableRows(heading: string): string[][] {
  const all = [...uwbSsbd.picture!, ...uwbSsbd.numbers!, ...(uwbSsbd.deeper ?? [])]
  const hit = all.find((b): b is Extract<Block, { kind: 'table' }> =>
    b.kind === 'table' && (b.heading ?? '').startsWith(heading))
  expect(hit, `no table headed "${heading}"`).toBeDefined()
  return hit!.rows
}

// ---------------------------------------------------------------------------
// registration and provenance
// ---------------------------------------------------------------------------

describe('uwb-ssbd · where it sits', () => {
  it('follows the coexistence lesson in the reading order', () => {
    expect(COURSE_ORDER.indexOf('uwb-ssbd')).toBe(COURSE_ORDER.indexOf('uwb-nba-coexist') + 1)
  })

  it('is in the narrowband control-plane module, which is checked against the draft', () => {
    expect(uwbSsbd.module).toBe(27)
    expect(MODULES[uwbSsbd.module].title).toBe('窄带控制面')
    // The clause is a draft one, so the module must be one that declares a draft basis. `basisOf`
    // is exercised by tests/course/basis.test.ts; here it is enough that the lesson names
    // contributions, which that file then checks against the registry.
    expect(citedDocs(uwbSsbd).length).toBeGreaterThan(4)
  })

  it('names the clause as a draft one rather than as published text', () => {
    const src = uwbSsbd.sources!.join('\n')
    expect(src).toContain('§10.45')
    expect(src).toContain('P802.15.4ab 草案')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).toContain('§10.37')
    // Each of the eight documents the lesson rests on, by number.
    for (const doc of [
      '15-22/0486r5', '15-24/0010r36', '15-24/0121r2', '15-25/0486r1',
      '15-25/0307r1', '15-26/0179r1', '15-26/0244r1', '15-26/0365r0',
    ]) expect(citedDocs(uwbSsbd), doc).toContain(doc)
  })

  it('loads uwb-nba`s own room with nothing but `ssbd` changed', () => {
    const base = uwbSsbdScenario('defaults')
    const pair = uwbNbaScenario('pairwise')
    expect({ ...base, uwb: undefined }).toEqual({ ...pair, uwb: undefined })
    expect(base.uwb!.mms.ssbd).toEqual(SSBD_DEFAULTS)
    expect(pair.uwb!.mms.ssbd).toBeNull()
    // …and the per-block scene is that scene untouched, which is what the lesson compares against.
    expect(uwbSsbdScenario('perBlock')).toEqual(pair)
    expect(uwbSsbdScenario('off')).toEqual(uwbNbaScenario('noLbt'))
  })

  it('every scene it ships is one the schema accepts', () => {
    for (const v of ['defaults', 'perBlock', 'biggest', 'off'] as const) {
      expect(() => ScenarioSchema.parse(uwbSsbdScenario(v)), v).not.toThrow()
    }
  })
})

// ---------------------------------------------------------------------------
// the two computed bounds
// ---------------------------------------------------------------------------

describe('uwb-ssbd · the bound is computed, not copied', () => {
  it('the defaults are the schema`s own, and the bound over them is 74 µs', () => {
    expect(SSBD_DEFAULTS).toEqual({ minBf: 1, maxBf: 5, maxBackoffs: 5, unitBackoffUs: 1, txOnEnd: true })
    // Re-derived here independently of the function, so a drift in either shows up as a mismatch
    // between the two rather than against a literal.
    let sum = 0
    for (let i = 0; i <= SSBD_DEFAULTS.maxBackoffs; i++) {
      sum += Math.min(SSBD_DEFAULTS.minBf + i, SSBD_DEFAULTS.maxBf) * SSBD_DEFAULTS.unitBackoffUs * US
        + NB_LBT_CCA_US * US
    }
    expect(ssbdBoundNs(SSBD_DEFAULTS)).toBe(sum)
    expect(ssbdBoundNs(SSBD_DEFAULTS) / US).toBe(74)
    const formula = uwbSsbd.numbers!.find((b) => b.kind === 'formula' && b.text.includes('74 µs'))
    expect(formula, 'the lesson states the bound as a formula').toBeDefined()
  })

  it('the draft appendix`s 46 µs reproduces only under the two overturned premises', () => {
    expect(ssbdBoundNs({ ...SSBD_DEFAULTS, backoffMultiplier: 2, ccaUs: 1 }) / US).toBe(46)
    expect(says('46 µs')).toBe(true)
    // …and the lesson says why, naming both premises rather than only the number.
    const why = lessonStrings(uwbSsbd).join('\n')
    expect(why).toContain('两倍退避因子')
    expect(why).toContain('1 µs')
  })

  it('the sensing share of the bound is what the engine does not spend', () => {
    const bound = ssbdBoundNs(SSBD_DEFAULTS)
    const sensing = (SSBD_DEFAULTS.maxBackoffs + 1) * NB_LBT_CCA_US * US
    expect(sensing / US).toBe(54)
    expect((bound - sensing) / US).toBe(20)
    // The lesson prints both, and prints them as the algorithm's sum rather than as a delay.
    expect(says('54 µs')).toBe(true)
    expect(tableRows('两个上界')).toContainEqual(['六段退避最多加起来', '20 µs'])
  })

  it('the slack of each narrowband window is computed from the window and the message', () => {
    const slotNs = rstuNs(uwbSsbdScenario('defaults').uwb!.slotRstu)
    expect(slotNs).toBe(500 * US)
    expect(NB_WINDOW_SLOTS).toBe(2)
    expect(nbPpduNs(NB_POLL_BYTES) / US).toBe(576)
    expect(nbPpduNs(NB_REPORT_BYTES) / US).toBe(608)
    expect(nbSlotSlackNs(slotNs, NB_POLL_BYTES)).toBe(NB_WINDOW_SLOTS * slotNs - nbPpduNs(NB_POLL_BYTES))
    expect(nbSlotSlackNs(slotNs, NB_POLL_BYTES) / US).toBe(424)
    expect(nbSlotSlackNs(slotNs, NB_REPORT_BYTES) / US).toBe(392)
  })

  it('the largest backoff that fits is computed from that slack', () => {
    const slack = nbSlotSlackNs(rstuNs(uwbSsbdScenario('defaults').uwb!.slotRstu), NB_POLL_BYTES)
    expect(SSBD_BIGGEST_UNIT_US).toBe(Math.floor(slack / US / SSBD_BIGGEST_BF))
    expect(SSBD_BIGGEST_UNIT_US).toBe(60)
    expect(SSBD_BIGGEST_BF * SSBD_BIGGEST_UNIT_US * US).toBeLessThanOrEqual(slack)
    expect(SSBD_BIGGEST_BF * SSBD_BIGGEST_UNIT_US).toBe(420)
    const biggest = uwbSsbdScenario('biggest').uwb!.mms.ssbd!
    expect([biggest.minBf, biggest.maxBf, biggest.unitBackoffUs])
      .toEqual([SSBD_BIGGEST_BF, SSBD_BIGGEST_BF, SSBD_BIGGEST_UNIT_US])
  })
})

// ---------------------------------------------------------------------------
// the four settings — the lesson's headline table
// ---------------------------------------------------------------------------

describe('uwb-ssbd · four settings, one scene, 1.3 s', () => {
  it('the table`s own rows are what the four runs produce', () => {
    const measured = [
      ['先听后发整个关掉', String(rangesOf(V_OFF)), String(fixesOf(V_OFF)), '—'],
      ['今天这条按块的规则', String(rangesOf(V_PER_BLOCK)), String(fixesOf(V_PER_BLOCK)), '—'],
      ['SSBD，草案的缺省值', String(rangesOf()), String(fixesOf()), String(ssbdOf().length)],
      ['SSBD，退避开到塞得进去的最大', String(rangesOf(V_BIGGEST)), String(fixesOf(V_BIGGEST)), String(ssbdOf(V_BIGGEST).length)],
    ]
    expect(tableRows('四种设置')).toEqual(measured)
    // The values the lesson's prose then argues from, stated here so a drift names itself.
    expect(measured.map((r) => r[1])).toEqual(['47', '1', '50', '3'])
    expect(measured.map((r) => r[2])).toEqual(['5', '0', '6', '0'])
  })

  it('the per-block rule costs 46 of the 47 cycles, and the readings are per block', () => {
    expect(rangesOf(V_OFF) - rangesOf(V_PER_BLOCK)).toBe(46)
    const lbt = ofType(recs(V_PER_BLOCK), 'UWB_NB_LBT')
    expect(lbt).toHaveLength(9)
    expect(lbt.filter((r) => r.node === TAG)).toHaveLength(7)
    // One reading a block for the tag, and nothing of its own narrowband after it in that block.
    expect(lbt.filter((r) => r.node === TAG).map((r) => r.block)).toEqual([0, 1, 2, 3, 4, 5, 6])
    for (const r of lbt) {
      const after = nbTx(recs(V_PER_BLOCK))
        .filter((x) => x.node === r.node && x.t > r.t && x.t < (r.block + 1) * 200 * MS)
      expect(after, `${r.node} b${r.block}`).toEqual([])
    }
    expect(ssbdOf(V_PER_BLOCK)).toEqual([])
    expect(says('46 个周期')).toBe(true)
    expect(says('九次忙')).toBe(true)
  })

  it('the defaults replace a per-block consequence with a per-slot one', () => {
    // No per-block reading at all, and one record for every narrowband transmission.
    expect(ofType(recs(), 'UWB_NB_LBT')).toEqual([])
    expect(ssbdOf()).toHaveLength(nbTx(recs()).length)
    expect(ssbdOf()).toHaveLength(110)
    // …on distinct slots inside one round, which is the whole of "per slot, not per block".
    const perRound = new Map<string, number[]>()
    for (const r of ssbdOf()) {
      const k = `${r.node}|${r.block}|${r.round}`
      perRound.set(k, [...(perRound.get(k) ?? []), r.slot])
    }
    for (const [k, slots] of perRound) expect(new Set(slots).size, k).toBe(slots.length)
    expect([...perRound].filter(([k]) => k.startsWith(`${TAG}|0|`)).length).toBeGreaterThan(1)
  })

  it('it is not that the bound outwaited anything: 63 of 110 read busy and sent anyway', () => {
    const rs = ssbdOf()
    const busy = rs.filter((r) => r.foreignDbm >= r.thresholdDbm)
    expect(busy).toHaveLength(63)
    expect(rs.filter((r) => r.outcome === 'txOnEnd')).toHaveLength(63)
    expect(rs.filter((r) => r.outcome === 'idle')).toHaveLength(47)
    expect(rs.filter((r) => r.outcome === 'failOnEnd')).toEqual([])
    expect(rs.filter((r) => r.outcome === 'clamped')).toEqual([])
    // Every busy attempt ran out of backoffs first — the end action is what transmitted.
    for (const r of rs.filter((x) => x.outcome === 'txOnEnd')) expect(r.nb).toBe(SSBD_DEFAULTS.maxBackoffs)
    for (const r of rs) expect(r.thresholdDbm).toBe(NB_LBT_THRESHOLD_DBM)
    expect(says('110 次感知里有 63 次读到的是忙')).toBe(true)
  })

  it('no Wi-Fi data frame in the scene is shorter than the bound, and most are longer than the slack', () => {
    const data = wifiData(recs())
    const times = data.map((r) => r.frame.txTimeNs)
    expect(data).toHaveLength(2291)
    expect(Math.min(...times) / US).toBe(75.2)
    expect(Math.max(...times) / US).toBe(564.8)
    const bound = ssbdBoundNs(SSBD_DEFAULTS)
    expect(times.filter((t) => t < bound)).toEqual([])
    const slack = nbSlotSlackNs(rstuNs(uwbSsbdScenario('defaults').uwb!.slotRstu), NB_POLL_BYTES)
    expect(times.filter((t) => t > slack)).toHaveLength(1887)
    expect(tableRows('两个上界')).toContainEqual(['场景里最短的 Wi-Fi 数据帧', '75.2 µs'])
    expect(tableRows('两个上界')).toContainEqual(['场景里最长的 Wi-Fi 数据帧', '564.8 µs'])
    expect(tableRows('两个上界')).toContainEqual(['2291 帧里长于 424 µs 的', '1887 帧'])
  })

  it('the engine waits less than the algorithm`s bound, and the lesson says which is which', () => {
    // The displacement a reader can see: how far into its own 500 µs slot each narrowband
    // message went out. Zero without the algorithm; at most 16 µs with it, against a 74 µs bound.
    const slotNs = rstuNs(uwbSsbdScenario('defaults').uwb!.slotRstu)
    const offs = (variant?: number): number[] => nbTx(recs(variant)).map((r) => r.t % slotNs)
    expect(new Set(offs(V_OFF))).toEqual(new Set([0]))
    expect(new Set(offs(V_PER_BLOCK))).toEqual(new Set([0]))
    const moved = Math.max(...offs())
    expect(moved / US).toBe(16)
    expect(moved).toBeLessThan(ssbdBoundNs(SSBD_DEFAULTS))
    expect(moved).toBeLessThanOrEqual(ssbdBoundNs(SSBD_DEFAULTS) - (SSBD_DEFAULTS.maxBackoffs + 1) * NB_LBT_CCA_US * US)
    expect(tableRows('两个上界')).toContainEqual(['窄带消息在自己时隙里的最大位移，实测', '16 µs'])
    // The wording rule of design doc §5.5: the 74 µs is the algorithm's, never the engine's delay.
    expect(says('算法的延迟上界')).toBe(true)
    expect(says('它是算法承诺不超过的那条线，不是每一次都要付出的时长')).toBe(true)
  })

  it('the biggest backoff that fits is worse, and the record says why', () => {
    const rs = ssbdOf(V_BIGGEST)
    expect(rs).toHaveLength(128)
    const clamped = rs.filter((r) => r.outcome === 'clamped')
    expect(clamped).toHaveLength(80)
    expect(clamped.filter((r) => r.backoffNs === 0)).toHaveLength(52)
    // Sensing happened, waiting did not: a drawn-but-unaffordable number beside a zero wait.
    for (const r of clamped.filter((x) => x.backoffNs === 0)) expect(r.drawnUnits).toBeGreaterThan(0)
    expect(Math.max(...rs.map((r) => r.backoffNs)) / US).toBe(420)
    expect(ofType(recs(V_BIGGEST), 'UWB_TIMEOUT')).toHaveLength(53)
    expect(rangesOf(V_BIGGEST)).toBeLessThan(rangesOf())
    expect(rangesOf(V_BIGGEST)).toBeLessThan(rangesOf(V_OFF))
    // …and the thing it cannot outwait is longer than the whole window's room.
    const slack = nbSlotSlackNs(rstuNs(uwbSsbdScenario('defaults').uwb!.slotRstu), NB_POLL_BYTES)
    expect(Math.max(...wifiData(recs()).map((r) => r.frame.txTimeNs))).toBeGreaterThan(slack)
    expect(says('128 条记录里有 80 条被截断，其中 52 条真正等掉的时长是 0')).toBe(true)
    expect(says('53 次超时')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// what a reader sees on screen
// ---------------------------------------------------------------------------

describe('uwb-ssbd · the lines the lesson quotes', () => {
  it('quotes the first sensing record verbatim, instant included', () => {
    const first = ssbdOf()[0]
    expect(first.t).toBe(9 * US)
    expect(first.node).toBe(TAG)
    expect(fmtRecord(first))
      .toBe('uwb-1 slot 0 ch 200: sensed -57.7 dBm against -71.0 dBm, backoff 5/5, waited 3.0 µs — txOnEnd')
    expect(uwbSsbd.observe[0]).toContain(fmtRecord(first))
    expect(uwbSsbd.observe[0]).toContain('0.009 ms')
    // …and the POLL it let out went at that same instant.
    expect(nbTx(recs())[0].t).toBe(first.t)
    expect(nbTx(recs())[0].frame.kind).toBe('nbPoll')
  })

  it('quotes a responder`s own clear reading, which disagrees with the initiator`s', () => {
    const idle = ssbdOf().find((r) => r.outcome === 'idle')!
    expect(idle.t).toBe(1 * MS)
    expect(idle.node).toBe('anchor-1')
    expect(idle.foreignDbm).toBeLessThan(idle.thresholdDbm)
    expect(fmtRecord(idle))
      .toBe('anchor-1 slot 2 ch 200: sensed -75.0 dBm against -71.0 dBm, backoff 0/1, no wait — idle')
    expect(uwbSsbd.observe[1]).toContain(fmtRecord(idle))
    expect(uwbSsbd.observe[1]).toContain('1.000 ms')
  })

  it('the inspector shows the deferral row and no listen-before-talk row at all', () => {
    const vs = initViewState(uwbSsbdScenario('defaults'))
    for (const r of recs()) applyRecord(vs, r)
    const u = vs.nodes[TAG].uwb
    expect(u).toBeDefined()
    if (!u) throw new Error('the tag has no ranging view')
    expect(uwbSsbdText(u, STRINGS.uwb)).toBe('55 次感知 · 共等 108.0 µs')
    // The two are alternatives, so only one of them can ever have a count in one session.
    expect(uwbLbtText(u, STRINGS.uwb)).toBeNull()
    expect(u.mms.ssbdFailed).toBe(0)
    expect(uwbSsbd.observe[2]).toContain('55 次感知 · 共等 108.0 µs')
  })

  it('every jump target it offers is in the base run', () => {
    for (const j of uwbSsbd.jumps) expect(recs().some(j.find), j.label).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// the limits, against the engine
// ---------------------------------------------------------------------------

describe('uwb-ssbd · its four limits are the engine`s', () => {
  it('declares exactly the four it owes, and leaves the threshold one unlifted', () => {
    expect(uwbSsbd.limits.map((l) => l.kind))
      .toEqual(['model-value', 'model-value', 'out-of-scope', 'threshold'])
    // Nothing later in the course lifts the instantaneous reading, so nothing promises it.
    for (const l of uwbSsbd.limits) expect(l.until, l.kind).toBeUndefined()
  })

  it('the model-value limit is right that there are five fields and not the draft`s six', () => {
    expect(Object.keys(SSBD_DEFAULTS).sort())
      .toEqual(['maxBackoffs', 'maxBf', 'minBf', 'txOnEnd', 'unitBackoffUs'])
    const text = uwbSsbd.limits[0].text
    expect(text).toContain('五个')
    expect(text).toContain('持久化')
    expect(text).toContain('重传')
  })

  it('the out-of-scope limit is right that a scene with no Wi-Fi link senses nothing foreign', () => {
    // Not asserted from the limit's wording but from a run: the same session with every Wi-Fi node
    // removed has no mediator, so every reading is the absence of one and nothing is ever deferred.
    const base = uwbSsbdScenario('defaults')
    const alone = ScenarioSchema.parse({ ...base, nodes: base.nodes.filter((n) => n.kind === 'uwb') })
    const sim = new Simulation(alone)
    expect(sim.spectrum).toBeNull()
    const rs: TLRecord[] = [...sim.runUntil(200 * MS).records]
    const mine = ofType(rs, 'UWB_SSBD')
    expect(mine.length).toBeGreaterThan(0)
    expect(mine.every((r) => r.outcome === 'idle')).toBe(true)
    expect(mine.every((r) => r.nb === 0)).toBe(true)
    expect(mine.every((r) => r.foreignDbm === -Infinity)).toBe(true)
    expect(uwbSsbd.limits[2].text).toContain('躲开的东西是零')
  })
})

// ---------------------------------------------------------------------------
// the wording rules this lesson is specifically at risk of breaking
// ---------------------------------------------------------------------------

describe('uwb-ssbd · the two rules this slice paid for', () => {
  it('never prints an attribute spelling, because the corpus spells each one three ways', () => {
    // Design doc §4.1: the same quantity is `macMinBf`/`macSsbdMinBf`,
    // `macMaxSSBDBackoffs`/`macSsbdMaxBackoffs`, `macSSBDBOEndAction`/`macSsbdTxOnEnd`. The lesson
    // names the quantity and cites the clause instead, in the prose AND in `limits`/`sources`.
    const everything = [...lessonStrings(uwbSsbd), ...uwbSsbd.limits.map((l) => l.text), uwbSsbd.title]
    for (const spelling of ['macMinBf', 'macMaxBf', 'macSsbd', 'macSSBD', 'macMaxSSBD', 'phyCcaEdThreshold', 'phyCcaDuration']) {
      expect(everything.filter((t) => t.includes(spelling)), spelling).toEqual([])
    }
  })

  it('says the bound belongs to the algorithm, never that the engine delays by it', () => {
    // The distinction design doc §5.5 asks for, checked as a claim rather than as a phrase: the
    // lesson states the 74 µs beside both the 20 µs ceiling and the 16 µs it measured, so a reader
    // cannot read the bound as a per-attempt cost.
    const t = mainText().join('\n')
    expect(t).toContain('74 µs')
    expect(t).toContain('20 µs')
    expect(t).toContain('16 µs')
    expect(t).toContain('最坏情形')
  })

  it('says listening first is optional in the draft and mandatory only by regulation', () => {
    expect(uwbSsbd.why!).toContain('可选')
    expect(uwbSsbd.why!).toContain('十三条')
    expect(uwbSsbd.why!).toContain('管制')
    // …and the sources name the resolution table that is the evidence for it.
    expect(uwbSsbd.sources!.join('\n')).toContain('15-26/0244r1')
  })
})
