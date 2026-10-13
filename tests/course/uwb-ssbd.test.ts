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
import { WIFI_6G_CENTER_MHZ, uwbNbaScenario } from '../../src/course/uwb/uwb-nba'
import { COURSE_ORDER, MODULES, citedDocs } from '../../src/course/curriculum'
import { cellTexts, lessonStrings, paragraphTexts, readerTexts } from '../../src/course/readability'
import type { Block } from '../../src/course/lessonKit'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, UwbSsbdSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { applyRecord, initViewState } from '../../src/model/view'
import { fmtRecord } from '../../src/ui/format'
import { STRINGS } from '../../src/ui/i18n'
import { uwbLbtText, uwbSsbdText } from '../../src/uwb/ui/rows'
import {
  NB_CHANNEL_MHZ, NB_LBT_CCA_US, NB_LBT_EDT_DBM_PER_MHZ, NB_LBT_THRESHOLD_DBM, NB_POLL_BYTES,
  NB_REPORT_BYTES, nbPpduNs,
} from '../../src/uwb/nb'
import { NB_WINDOW_SLOTS } from '../../src/uwb/mms'
import { SSBD_BF_UNIT_MAX, nbSlotSlackNs, rstuNs, ssbdBoundNs } from '../../src/uwb/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { zhNumeral } from './coverage'

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
    expect(uwbSsbd.module).toBe(29)
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
    const everything = readerTexts(uwbSsbd)
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

/**
 * **Every figure the prose prints, read back out of it.**
 *
 * The two headline tables above were already read-backs — `tableRows('四种设置')` is compared with
 * what the four runs produce, and the 「两个上界」 rows with `toContainEqual` of measured strings —
 * and the three quoted log lines are `fmtRecord` of the records they quote. The prose was not.
 * `says('46 µs')` asks whether the figure appears **somewhere**, and this lesson prints 46 twice,
 * 74 five times, 424 four times and 9 µs six times, so a planted copy leaves every `says` green.
 *
 * Nothing new is measured here. Every assertion calls the same `recs`, `ssbdOf`, `rangesOf`,
 * `fixesOf`, `nbTx`, `wifiData`, `ssbdBoundNs`, `nbSlotSlackNs` and `nbPpduNs` the tests above
 * call — the figure is parsed **out of the lesson** instead of being written down beside it.
 *
 * Citations are watched by **counting occurrences**, not by `toContain`. `ETSI EN 303 687` and
 * `2025/893` appear three times each and `9 µs` six times; asserting that the exact string occurs
 * exactly as often as it should is what makes editing the second or third copy visible, and it is
 * the only thing available for a document number with no corpus in this repo.
 */
describe('uwb-ssbd · every figure the prose prints, read back out of it', () => {
  const blockText = (b: unknown): string => {
    const out: string[] = []
    const walk = (v: unknown): void => {
      if (typeof v === 'string') out.push(v)
      else if (Array.isArray(v)) for (const x of v) walk(x)
      else if (v !== null && typeof v === 'object') for (const x of Object.values(v)) walk(x)
    }
    walk(b)
    return out.join('\n')
  }
  const WHY = uwbSsbd.why!
  const TERMS = blockText(uwbSsbd.terms)
  const PIC = blockText(uwbSsbd.picture)
  const NUMS = blockText(uwbSsbd.numbers)
  const DEEP = blockText(uwbSsbd.deeper)
  const LIMITS = blockText(uwbSsbd.limits)
  const SRC = blockText(uwbSsbd.sources)
  const OBS = blockText(uwbSsbd.observe)
  const TRY = blockText(uwbSsbd.tryThis)
  const QUIZ = blockText(uwbSsbd.quiz)
  const READER = readerTexts(uwbSsbd).join('\n')

  const val = (s: string): number => Number(s.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (s: string, re: RegExp, what: string): string[] => {
    const m = re.exec(s)
    expect(m, `${what}: the lesson no longer prints this in the shape this test reads`)
      .not.toBeNull()
    return m!.slice(1)
  }
  const figs = (s: string, re: RegExp, what: string): number[] => raw(s, re, what).map(val)
  /** A figure READ off the lesson against a measurement, at the precision it was printed to. */
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const zh = (s: string): number => {
    const n = zhNumeral(s.replace(/两/g, '二'))
    expect(n, `「${s}」 is not a numeral this file knows how to read`).not.toBeNull()
    return n!
  }
  /** How often an exact string occurs in everything a reader can read. */
  const occurrences = (needle: string): number => READER.split(needle).length - 1

  const SCENE = uwbSsbdScenario('defaults')
  const SLOT_NS = rstuNs(SCENE.uwb!.slotRstu)
  const BLOCK_NS = rstuNs(SCENE.uwb!.blockRstu)
  const BOUND_NS = ssbdBoundNs(SSBD_DEFAULTS)
  const SENSES = SSBD_DEFAULTS.maxBackoffs + 1
  const SENSING_NS = SENSES * NB_LBT_CCA_US * US
  const POLL_SLACK_NS = nbSlotSlackNs(SLOT_NS, NB_POLL_BYTES)

  it('the two units the lesson swaps: a 200 ms block for a 500 µs slot', () => {
    for (const [text, re, what] of [
      [WHY, /在整整一个测距块（ranging block）里不再发出任何控制消息，而一个块是 (\d+) ms/, '`why`'],
      [PIC, /从一个 (\d+) ms 的块，换成一个 [\d.]+ µs 的时隙/, '`picture`'],
      [QUIZ, /「一次忙赔一个 (\d+) ms 的块」/, 'the first explanation'],
      [DEEP, /场景的块长都是 (\d+) ms/, '`deeper` on the MMS block length'],
    ] as const) same(raw(text, re, what)[0]!, BLOCK_NS / MS, `${what}: the block this scene runs`)
    for (const [text, re, what] of [
      [PIC, /换成一个 (\d+) µs 的时隙/, '`picture`'],
      [NUMS, /一个窄带窗口是两个 (\d+) µs 的测距时隙/, 'the slack formula’s note'],
    ] as const) same(raw(text, re, what)[0]!, SLOT_NS / US, `${what}: the ranging slot`)
    // the per-block rule really does cost the whole block, and SSBD only the slot
    expect(ofType(recs(), 'UWB_NB_LBT'), 'the defaults make no per-block reading').toEqual([])
    expect(ssbdOf(V_PER_BLOCK), 'and the per-block rule makes no per-slot one').toEqual([])
    // the draw's own floor, in `terms` and twice in the body
    for (const [text, re, what] of [
      [TERMS, /就在 (\d) 到它之间随机抽一个数/, '`terms`'],
      [PIC, /它在 (\d) 到退避因子之间抽一个数/, '`picture`'],
      [NUMS, /在 (\d) 到退避因子之间抽一个数/, 'step 2'],
    ] as const) {
      const [floor] = figs(text, re, `${what} on the draw`)
      expect(Math.min(...ssbdOf().map((r) => r.drawnUnits)), `${what}: the lowest draw of the run`)
        .toBe(floor)
    }
    expect(raw(NUMS, /把忙次数置 (\d)、退避因子置下界/, 'step 1')[0], 'the counter a new slot starts at')
      .toBe(String(Math.min(...ssbdOf().map((r) => r.nb))))
  })

  it('the bound: every term of the sum, and the two shares it splits into', () => {
    const [from, to, lo, hi, unit, cca, total] = figs(NUMS,
      /上界 = Σ\(i=(\d)…(\d)\) \[ min\((\d)\+i, (\d)\) × (\d) µs \+ (\d) µs \] = (\d+) µs/,
      'the bound formula')
    expect(from, 'the sum starts at zero').toBe(0)
    expect(to! - from! + 1, 'and runs over one sensing per attempt').toBe(SENSES)
    expect([lo, hi], 'the two ends of the backoff factor')
      .toEqual([SSBD_DEFAULTS.minBf, SSBD_DEFAULTS.maxBf])
    expect(unit, 'the backoff unit the schema defaults to').toBe(SSBD_DEFAULTS.unitBackoffUs)
    expect(cca, 'the sensing time the regulation asks for').toBe(NB_LBT_CCA_US)
    same(String(total), BOUND_NS / US, 'and the bound those terms give')
    // the arithmetic, done with the figures the lesson itself printed
    let sum = 0
    for (let i = from!; i <= to!; i++) sum += Math.min(lo! + i, hi!) * unit! + cca!
    same(String(total), sum, 'which is the sum the line writes out')
    // the note restates the three parameters and both shares
    const [nLo, nHi, nSenses, nCca, nBackoff, nSensing] = raw(NUMS,
      /退避因子从下界 (\d) 起，每判一次忙加一、到上界 (\d) 为止，一共(.)次感知，每次按 (\d) µs 记。六段退避加起来最多 (\d+) µs，六次感知记 (\d+) µs/,
      'the bound formula’s note')
    expect([val(nLo!), val(nHi!)], 'the note’s two ends')
      .toEqual([SSBD_DEFAULTS.minBf, SSBD_DEFAULTS.maxBf])
    expect(zh(nSenses!), 'the note’s count of sensings').toBe(SENSES)
    expect(val(nCca!), 'the note’s sensing time').toBe(NB_LBT_CCA_US)
    same(nSensing!, SENSING_NS / US, 'the share the sensings are')
    same(nBackoff!, (BOUND_NS - SENSING_NS) / US, 'and the share the backoffs are')
    // the same two shares in the closing paragraph, with the measured displacement beside them
    const [pBound, pSensing] = raw(NUMS, /(\d+) µs 是最坏情形的和，而其中 (\d+) µs 是六次感知本身/,
      'the closing paragraph')
    same(pBound!, BOUND_NS / US, 'the bound, again')
    same(pSensing!, SENSING_NS / US, 'and the sensing share')
    const [pBackoff, pMoved] = raw(NUMS, /六段退避最多加起来 (\d+) µs；这个场景实测下来，窄带消息在自己时隙里最多挪后 (\d+) µs/,
      'the closing paragraph on what the engine really spends')
    same(pBackoff!, (BOUND_NS - SENSING_NS) / US, 'the backoff share')
    same(pMoved!, Math.max(...nbTx(recs()).map((r) => r.t % SLOT_NS)) / US,
      'and how far a message really moved inside its slot')
    expect(val(pMoved!), 'which is inside the share the backoffs can be')
      .toBeLessThanOrEqual(val(pBackoff!))
    // `limits` quotes the same difference as the thing the instantaneous reading explains
    const [lBackoff, lBound] = raw(LIMITS, /「六段退避最多 (\d+) µs」与「上界 (\d+) µs」的差额/,
      '`limits` on the difference')
    same(lBackoff!, (BOUND_NS - SENSING_NS) / US, '`limits`: the backoff share')
    same(lBound!, BOUND_NS / US, '`limits`: and the bound')
  })

  it('the appendix’s own figure, and the two premises that reproduce it', () => {
    const [appendix] = figs(NUMS, /附录上登的是 (\d+) µs/, '`numbers` on the appendix')
    const [senseNow, senseThen] = figs(NUMS, /一次感知记 (\d) µs 而不是 (\d) µs/,
      '`numbers` on the second premise')
    expect(senseThen, 'the sensing time the current text asks for').toBe(NB_LBT_CCA_US)
    const [again] = figs(NUMS, /同一个式子正好给出 (\d+) µs/, '`numbers` on the same sum')
    expect(again, 'the same figure, restated in the same paragraph').toBe(appendix)
    // and `deeper` reproduces both, naming the multiplier it puts back
    const [dCca, dBound, dSense, dAppendix] = figs(DEEP,
      /（倍数一倍、感知 (\d) µs）它给出 (\d+) µs；把倍数改成两倍、感知改成 (\d) µs，它给出 (\d+) µs/,
      '`deeper` on how the appendix was checked')
    expect(dCca, '`deeper`: the current sensing time').toBe(NB_LBT_CCA_US)
    same(String(dBound), BOUND_NS / US, '`deeper`: the bound the current text gives')
    expect(dSense, '`deeper`: the sensing time the appendix assumed').toBe(senseNow)
    same(String(dAppendix), ssbdBoundNs({ ...SSBD_DEFAULTS, backoffMultiplier: 2, ccaUs: dSense! }) / US,
      '`deeper`: and the figure those two premises reproduce')
    expect(dAppendix, 'which is the appendix’s own').toBe(appendix)
    expect(dAppendix, 'and it is smaller than the current bound').toBeLessThan(dBound!)
  })

  it('the slack of each window, and the largest backoff that fits inside it', () => {
    const [pollSlot, pollBytes, pollSlack] = figs(NUMS,
      /轮询：2 × (\d+) µs − (\d+) µs = (\d+) µs/, 'the slack formula, first line')
    const [repSlot, repBytes, repSlack] = figs(NUMS,
      /报告：2 × (\d+) µs − (\d+) µs = (\d+) µs/, 'the slack formula, second line')
    for (const s of [pollSlot, repSlot]) same(String(s), SLOT_NS / US, 'the ranging slot')
    same(String(pollBytes), nbPpduNs(NB_POLL_BYTES) / US, 'what a POLL itself takes')
    same(String(repBytes), nbPpduNs(NB_REPORT_BYTES) / US, 'what a REPORT takes')
    same(String(pollSlack), POLL_SLACK_NS / US, 'the room a POLL’s window leaves')
    same(String(repSlack), nbSlotSlackNs(SLOT_NS, NB_REPORT_BYTES) / US,
      'and the room a REPORT’s leaves')
    expect(repSlack, 'the report’s window is the tighter one, as the note says')
      .toBeLessThan(pollSlack!)
    // the note names the same three again
    const [nPoll, nRep, nSlack] = figs(NUMS,
      /轮询自己占 (\d+) µs，报告占 (\d+) µs，所以 (\d+) µs 是这个场景里一次退避能有的最大空间/,
      'the slack formula’s note')
    same(String(nPoll), nbPpduNs(NB_POLL_BYTES) / US, 'the note’s POLL')
    same(String(nRep), nbPpduNs(NB_REPORT_BYTES) / US, 'the note’s REPORT')
    same(String(nSlack), POLL_SLACK_NS / US, 'and the note’s slack')
    // `picture` names what a POLL occupies a third time
    same(raw(PIC, /而一条轮询自己要占掉其中的 (\d+) µs/, '`picture` on the POLL')[0]!,
      nbPpduNs(NB_POLL_BYTES) / US, 'what a POLL occupies')
    // "backoff factor 7, unit 60 µs, at most 420 µs — just inside the 424 µs of room"
    for (const [text, re, what] of [
      [NUMS, /退避因子按 (\d) 配、退避单位按 (\d+) µs 配，一次尝试最多等 (\d+) µs，刚好塞进轮询那 (\d+) µs 的余量/, '`numbers`'],
      [QUIZ, /把退避因子配到 (\d)、退避单位配到 (\d+) µs，一次尝试最多等 (\d+) µs，刚好塞进轮询那 (\d+) µs 的余量/, 'the second question'],
    ] as const) {
      const [bf, unit, most, slack] = figs(text, re, `${what} on the biggest setting`)
      expect(bf, `${what}: the backoff factor that setting pins`).toBe(SSBD_BIGGEST_BF)
      expect(unit, `${what}: and the unit it computes`).toBe(SSBD_BIGGEST_UNIT_US)
      expect(most, `${what}: the longest wait they allow`).toBe(bf! * unit!)
      same(String(slack), POLL_SLACK_NS / US, `${what}: the room it fits inside`)
      expect(most! * US, `${what}: and it really does fit`).toBeLessThanOrEqual(POLL_SLACK_NS)
      expect(Math.max(...ssbdOf(V_BIGGEST).map((r) => r.backoffNs)) / US,
        `${what}: which is the longest wait that run drew`).toBe(most)
    }
  })

  it('what the defaults recover, and why it is not that anything was outwaited', () => {
    const [bound, secs, frames, shortest, longest, boundAgain] = raw(NUMS,
      /缺省那 (\d+) µs 等不过身边任何一帧。这个场景 ([\d.]+) 秒里有 (\d+) 个 Wi-Fi 数据帧（data frame），最短的一帧空口时间（airtime）([\d.]+) µs，最长的 ([\d.]+) µs——没有哪一帧比 (\d+) µs 短/,
      '`numbers` on why the defaults work')
    same(bound!, BOUND_NS / US, 'the bound the defaults give')
    same(boundAgain!, BOUND_NS / US, 'and the same bound at the end of the sentence')
    same(secs!, RUN_NS / 1e9, 'the window this file measures over')
    /*
     * **The second printing of a figure is its own site — and a table's HEADING is a site.**
     * The sweep of 2026-10-13 planted 「四种设置，同一个场景，1.3 秒」 with the suite green: the
     * window is read here and again in the quiz, and neither of those reads looks at the
     * heading the table carries it in.
     */
    const headings = uwbSsbd.numbers!
      .map((b) => (b as { heading?: string }).heading ?? '').join('\n')
    same(raw(headings, /四种设置，同一个场景，([\d.]+) 秒/,
      'the headline table’s own heading')[0]!,
    RUN_NS / 1e9, 'the window that table is measured over')
    const times = wifiData(recs()).map((r) => r.frame.txTimeNs)
    expect(val(frames!), 'the Wi-Fi data frames of that window').toBe(times.length)
    same(shortest!, Math.min(...times) / US, 'the shortest of them')
    same(longest!, Math.max(...times) / US, 'and the longest')
    expect(times.filter((t) => t < BOUND_NS), 'and none is shorter than the bound').toEqual([])
    // "110 sensings, 63 read busy, 63 sent anyway; ranging back to 50, against 47 with no rule"
    for (const [text, re, what] of [
      [NUMS, /(\d+) 次感知里有 (\d+) 次读到的是忙，(\d+) 次照样发了出去/, '`numbers`'],
      [QUIZ, /(\d+) 次感知里有 (\d+) 次读到的是忙，(\d+) 次都照样发了出去/, 'the first explanation'],
    ] as const) {
      const [all, busy, sent] = figs(text, re, `${what} on the sensings`)
      expect(all, `${what}: the sensings the defaults make`).toBe(ssbdOf().length)
      expect(busy, `${what}: the ones that read busy`)
        .toBe(ssbdOf().filter((r) => r.foreignDbm >= r.thresholdDbm).length)
      expect(sent, `${what}: and the ones the end action sent anyway`)
        .toBe(ssbdOf().filter((r) => r.outcome === 'txOnEnd').length)
    }
    const [back, against] = figs(NUMS, /测距回到 (\d+) 次，与不听的那 (\d+) 次相当/,
      '`numbers` on what it recovers')
    expect(back, 'the ranges the defaults get').toBe(rangesOf())
    expect(against, 'and the ranges with no rule at all').toBe(rangesOf(V_OFF))
    // the quiz opens with the same two counts
    // the quiz prints the bound twice more, once in the option that is wrong about it
    for (const [re, what] of [
      [/缺省那 (\d+) µs 的上界足够等过身边的 Wi-Fi 帧/, 'the first option'],
      [/(\d+) µs 等不过场景里任何一帧/, 'the second option'],
    ] as const) same(raw(QUIZ, re, what)[0]!, BOUND_NS / US, `${what}: the bound`)
    const [qSecs, qBlocks, qOne, qBack] = raw(QUIZ,
      /按今天这条按块的规则，([\d.]+) 秒(.)个块里只量到(.)个距离；把 SSBD 按草案缺省值打开之后，测距回到 (\d+) 次/,
      'the first question')
    same(qSecs!, RUN_NS / 1e9, 'the quiz: the same window')
    // the blocks the window STARTS, which is what the run itself indexes: block 6 begins at
    // 1200 ms and the window ends inside it, so 1.3 s holds seven of them and not six and a half
    const blocksSeen = new Set(ofType(recs(), 'UWB_SSBD').map((r) => r.block))
    expect(zh(qBlocks!), 'the quiz: the blocks it holds').toBe(blocksSeen.size)
    expect(blocksSeen.size, 'which is how many a 1.3 s window starts')
      .toBe(Math.ceil(RUN_NS / BLOCK_NS))
    expect(zh(qOne!), 'the quiz: the ranges the per-block rule gets').toBe(rangesOf(V_PER_BLOCK))
    expect(val(qBack!), 'the quiz: and what the defaults recover').toBe(rangesOf())
    // and the quiz's own restatement of the shortest frame
    const [qShortest, qBound] = raw(QUIZ,
      /最短的 Wi-Fi 数据帧是 ([\d.]+) µs，没有哪一帧短于 (\d+) µs/, 'the first explanation')
    same(qShortest!, Math.min(...times) / US, 'the quiz: the shortest frame')
    same(qBound!, BOUND_NS / US, 'the quiz: and the bound it is longer than')
    const [cycles] = raw(NUMS, /第一行与第二行之间是 (\d+) 个周期/, '`numbers` on what the rule costs')
    expect(val(cycles!), 'the cycles the per-block rule loses')
      .toBe(rangesOf(V_OFF) - rangesOf(V_PER_BLOCK))
    // the table of two bounds: the row that counts frames longer than a window's slack
    const [ofFrames, overSlack, count] = figs(NUMS,
      /(\d+) 帧里长于 (\d+) µs 的\n?(\d+) 帧/, 'the 「两个上界」 table’s last row')
    expect(ofFrames, 'the frames of the run').toBe(times.length)
    same(String(overSlack), POLL_SLACK_NS / US, 'the slack they are measured against')
    expect(count, 'and how many are longer than it')
      .toBe(times.filter((t) => t > POLL_SLACK_NS).length)
  })

  it('what the biggest backoff costs, and the records that say why', () => {
    for (const [text, re, what] of [
      [NUMS, /(\d+) 条记录里有 (\d+) 条被截断，其中 (\d+) 条真正等掉的时长是 (\d)——/, '`numbers`'],
      [QUIZ, /(\d+) 条记录里有 (\d+) 条被截断，其中 (\d+) 条真正等掉的时长是 (\d)。/, 'the second explanation'],
    ] as const) {
      const [all, clamped, zeroed, waited] = figs(text, re, `${what} on the clamps`)
      const rs = ssbdOf(V_BIGGEST)
      expect(all, `${what}: the records that run leaves`).toBe(rs.length)
      expect(clamped, `${what}: the ones that were clamped`)
        .toBe(rs.filter((r) => r.outcome === 'clamped').length)
      expect(zeroed, `${what}: and the ones whose wait came to nothing`)
        .toBe(rs.filter((r) => r.outcome === 'clamped' && r.backoffNs === waited! * US).length)
      expect(waited, `${what}: which is the wait they really paid`).toBe(0)
    }
    const [ranges, timeouts] = raw(NUMS, /结果是(.)次测距，一次定位也解不出来，还多出 (\d+) 次超时/,
      '`numbers` on what it costs')
    expect(zh(ranges!), 'the ranges that setting gets').toBe(rangesOf(V_BIGGEST))
    expect(val(timeouts!), 'and the timeouts it adds')
      .toBe(ofType(recs(V_BIGGEST), 'UWB_TIMEOUT').length)
    expect(fixesOf(V_BIGGEST), 'with no fix at all').toBe(0)
    same(raw(NUMS, /而 (\d+) µs 本来就短于场景里最长的那一帧/, '`numbers` on the slack again')[0]!,
      POLL_SLACK_NS / US, 'the slack, once more')
    const [qSlack, qLongest] = raw(QUIZ,
      /而 (\d+) µs 短于场景里最长的那一帧（([\d.]+) µs）/, 'the second answer')
    same(qSlack!, POLL_SLACK_NS / US, 'the quiz: the slack')
    same(qLongest!, Math.max(...wifiData(recs()).map((r) => r.frame.txTimeNs)) / US,
      'the quiz: and the frame it is shorter than')
    const [qTimeouts] = figs(QUIZ, /一次定位也没有，还多出 (\d+) 次超时/, 'the second answer')
    expect(qTimeouts, 'the quiz: the timeouts').toBe(ofType(recs(V_BIGGEST), 'UWB_TIMEOUT').length)
    // `tryThis` reads the same column of the headline table
    const [tOff, tFix, tBig, tClamp] = figs(TRY,
      /「先听后发整个关掉」：(\d+) 个距离、(\d) 次定位[\s\S]*?三个距离、(\d+) 次超时，而记录里有 (\d+) 条截断/,
      '`tryThis`')
    expect(tOff, '`tryThis`: the ranges with no rule').toBe(rangesOf(V_OFF))
    expect(tFix, '`tryThis`: and the fixes').toBe(fixesOf(V_OFF))
    expect(tBig, '`tryThis`: the timeouts the biggest setting adds')
      .toBe(ofType(recs(V_BIGGEST), 'UWB_TIMEOUT').length)
    expect(tClamp, '`tryThis`: and its clamps')
      .toBe(ssbdOf(V_BIGGEST).filter((r) => r.outcome === 'clamped').length)
  })

  it('the regulation figures, the channel they are spread over, and every citation counted', () => {
    // −75 dBm/MHz over a 2.5 MHz channel is −71.02 dBm: `deeper`, `sources` and `limits`
    for (const [text, re, what] of [
      [DEEP, /本引擎取的 −(\d+) dBm\/MHz（摊到一条 ([\d.]+) MHz 的信道上是 −([\d.]+) dBm）/, '`deeper`'],
      [LIMITS, /本引擎取的 −(\d+) dBm\/MHz（摊到 ([\d.]+) MHz 得 −([\d.]+) dBm）/, '`limits`'],
    ] as const) {
      const [perMhz, width, total] = raw(text, re, `${what} on the threshold`)
      expect(-val(perMhz!), `${what}: the limit the regulation sets`).toBe(NB_LBT_EDT_DBM_PER_MHZ)
      same(width!, NB_CHANNEL_MHZ, `${what}: the channel it spreads over`)
      same(total!, -NB_LBT_THRESHOLD_DBM, `${what}: and the threshold that gives`)
      same(total!, -(-val(perMhz!) + 10 * Math.log10(val(width!))),
        `${what}: which is its own arithmetic`)
    }
    const [sPerMhz, sCca] = figs(SRC, /以下是法规：−(\d+) dBm\/MHz 的门限与至少 (\d) µs 的感知时长/,
      '`sources` on the regulation')
    expect(-sPerMhz!, '`sources`: the limit').toBe(NB_LBT_EDT_DBM_PER_MHZ)
    expect(sCca, '`sources`: the sensing time').toBe(NB_LBT_CCA_US)
    const [sCcaAgain, sWidth, sTotal] = raw(SRC,
      /代替规则要求的至少 (\d) µs 积分；门限摊到 ([\d.]+) MHz 得 −([\d.]+) dBm/,
      '`sources` on the model’s reading')
    expect(val(sCcaAgain!), '`sources`: the same sensing time').toBe(NB_LBT_CCA_US)
    same(sWidth!, NB_CHANNEL_MHZ, '`sources`: the channel')
    same(sTotal!, -NB_LBT_THRESHOLD_DBM, '`sources`: and the threshold')
    // the rejected review comments' own figures, and the channel step 3 reads
    const [rPerMhz, rCca] = figs(DEEP, /有的要 −(\d+) dBm\/MHz 配至少 (\d+) µs 的感知时长/,
      '`deeper` on the rejected comments')
    expect(-rPerMhz!, '`deeper`: the limit those comments asked for')
      .toBe(NB_LBT_EDT_DBM_PER_MHZ)
    /*
     * **Exempt, class (a): a draft figure with no corpus in this repo.** 16 µs is what one of
     * the rejected review comments asked for (`sources` cites 15-26/0244r1 for the decisions),
     * and nothing in this engine carries it — the comment was overturned, so there is no
     * constant, no record and no run it could be read against. What IS checkable is the only
     * thing the sentence uses it for, and that is the inequality below: the comment wanted a
     * sensing time LONGER than the one the regulation settles on. The sweep of 2026-10-13
     * walked through that inequality, and it stays, with this argument beside it.
     */
    expect(rCca, 'and a sensing time longer than the one the regulation asks for')
      .toBeGreaterThan(NB_LBT_CCA_US)
    for (const [text, re, what] of [
      [NUMS, /读一下这条 ([\d.]+) MHz 信道里的外来功率/, 'step 3'],
      [LIMITS, /向中介要一次该 ([\d.]+) MHz 频段内的外来功率/, '`limits`'],
    ] as const) same(raw(text, re, what)[0]!, NB_CHANNEL_MHZ, `${what}: one narrowband channel`)
    for (const [text, re, what] of [
      [LIMITS, /用它代替草案援引的至少 (\d) µs 能量积分/, '`limits`'],
      [LIMITS, /所以算上界时那 (\d) µs 只是式子里计入的时长/, '`limits`, on what the engine does not spend'],
    ] as const) {
      same(raw(text, re, what)[0]!, NB_LBT_CCA_US, `${what}: the sensing time`)
    }
    // the band this scene shares, in `limits`
    same(raw(LIMITS, /场景里没有 (\d) GHz Wi-Fi 链路/, '`limits` on a scene with no mediator')[0]!,
      Math.floor(WIFI_6G_CENTER_MHZ / 1000), 'the band this lesson runs in')
    same(raw(DEEP, /欧盟那份 (\d) GHz 的协调标准/, '`deeper` on the harmonised standard')[0]!,
      Math.floor(WIFI_6G_CENTER_MHZ / 1000), 'the same band')
    /*
     * The citations. There is no corpus for a document number here, so what is checkable is that
     * each exact string occurs as often as the lesson means it to — which is what makes editing
     * the SECOND or THIRD copy visible, where a `toContain` would not.
     */
    for (const [needle, times] of [
      ['ETSI EN 303 687', 3],
      ['2025/893 号决定', 3],
      ['CID 489/493', 1],
      ['CID 490/495', 1],
      ['15-22/0486r5', 1],
      ['15-26/0244r1', 1],
      ['§10.39.8.3', 1],
      ['§10.47', 2],
      ['§10.45', 3],
      ['spectrum sensing 与 10.45 中的任何一个', 1],
    ] as const) {
      expect(occurrences(needle), `「${needle}」 occurs exactly ${times} time(s)`).toBe(times)
    }
    /*
     * The widened attribute range. Both ends are checkable against the engine rather than
     * exempt as draft figures: the NEW upper bound is `SSBD_BF_UNIT_MAX`, which the schema
     * enforces, and the OLD one is named in the schema's own rejection message — so this reads
     * both out of `scenario.ts` instead of taking the sentence's word for either.
     * (An inequality stood here and the sweep of 2026-10-13 walked through it: a planted 32
     * is still greater than 1 and still less than 63.)
     */
    const [wasLo, wasHi, nowLo, nowHi] = figs(SRC,
      /并把取值范围从 (\d+)…(\d+) 放宽到 (\d+)…(\d+)/, '`sources` on the widened range')
    expect(nowHi, 'the upper bound the schema now enforces').toBe(SSBD_BF_UNIT_MAX)
    expect(nowLo, 'and the lower one it has always had').toBe(1)
    const bad = UwbSsbdSchema.safeParse({ maxBf: nowHi! + 1, minBf: 1 })
    expect(bad.success, 'one past the upper bound is refused').toBe(false)
    expect(UwbSsbdSchema.safeParse({ maxBf: nowHi!, minBf: nowLo! }).success,
      'and both ends themselves are accepted').toBe(true)
    expect(UwbSsbdSchema.safeParse({ maxBf: 0, minBf: 0 }).success,
      'while one below the lower bound is refused').toBe(false)
    // the OLD upper bound is the one the schema's own message says the comment replaced
    expect(wasLo, 'the old range started at the same place').toBe(nowLo)
    expect(JSON.stringify(bad.error!.issues),
      `the schema’s own message names ${wasHi} as the bound that was widened`)
      .toContain(`把上界从 ${wasHi} 改成了 ${nowHi}`)
    expect(nowHi, 'and it really was a widening').toBeGreaterThan(wasHi!)
    expect(SSBD_DEFAULTS.maxBf, 'while the default sits inside the old range too')
      .toBeLessThanOrEqual(wasHi!)
  })

  it('`deeper` and `observe`: the proposal next door, and the instant quoted twice', () => {
    // the frequency-domain proposal: 200 µs into the slot, and a block no longer than 100 ms
    const [at, cap, ours] = figs(DEEP,
      /而是在时隙内 (\d+) µs 处改用跳频序列里的下一条信道[\s\S]*?测距块不超过 (\d+) ms[\s\S]*?块长都是 (\d+) ms/,
      '`deeper` on the proposal')
    /*
     * **Exempt, class (a), twice over.** The 200 µs switch instant and the 100 ms block cap are
     * the frequency-domain proposal's own figures (15-26/0365r0), and that proposal is not in
     * this engine at all — there is no constant, no record and no run behind either. Both are
     * kept as the inequalities the sentence is built on, which is all this repo can say about
     * them: the switch happens inside one slot, and the cap is below what every MMS scene here
     * uses. The sweep of 2026-10-13 walked through both, and the third figure of the sentence
     * — this repo's own block length — is an equality against the scene.
     */
    expect(at! * US, 'the instant it would switch at is inside one slot').toBeLessThan(SLOT_NS)
    expect(cap, 'the block length it assumes').toBeLessThan(BLOCK_NS / MS)
    expect(ours, 'while this repo’s blocks are longer than that').toBe(BLOCK_NS / MS)
    /*
     * **The second printing of a figure is its own site.** `observe[0]` names the instant twice —
     * once in the quoted line's own `0.009 ms` and once in the sentence after it — and the
     * `toContain('0.009 ms')` above is satisfied by the first.
     */
    const first = ssbdOf()[0]!
    const [opens] = raw(OBS, /^([\d.]+) ms 处是第一条感知记录/,
      '`observe` on when the first sensing happened')
    same(opens!, first.t / MS, 'when the first sensing record is')
    const [again] = raw(OBS, /于是这条轮询照样在 ([\d.]+) ms 发了出去/,
      '`observe` on when the POLL went out')
    same(again!, first.t / MS, 'the instant the POLL really went out')
    expect(nbTx(recs())[0]!.t, 'which is the sensing record’s own instant').toBe(first.t)
    // and the responder's: 「换成锚点 1 自己的那一次」
    const idle = ssbdOf().find((r) => r.outcome === 'idle')!
    const [anchorNo] = figs(OBS, /换成锚点 (\d) 自己的那一次/, '`observe` on whose reading it is')
    expect(idle.node, 'the node that record belongs to').toBe(`anchor-${anchorNo}`)
  })
})
