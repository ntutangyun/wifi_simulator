/**
 * Every empirical claim in "Sixteen milliseconds of energy", measured against the
 * lesson's own scene and its three variants. Each assertion quotes the sentence it
 * guards, copied from the shipped string; the fragment lengths and powers, the
 * narrowband message sizes, the combining gains, the clock-ratio sigma and the
 * range floor come from the engine's own exports rather than being re-typed here,
 * and every measured figure is read out of a run. The link budget is checked twice
 * over: once as the closed form (fragment power − path loss − two brick walls) and
 * once through the trains the devices actually reported.
 */
import { describe, it, expect } from 'vitest'
import {
  ANCHOR_Z, MMS_ANCHORS, TAG_POS, TAG_Z, uwbMms, uwbMmsScenario, type UwbMmsVariant,
} from '../../src/course/uwb/uwb-mms'
import { Simulation } from '../../src/engine/simulation'
import { DEFAULT_UWB_SESSION, ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block, L10n, Lesson } from '../../src/course/lessonKit'
import { brick, twoWallLab } from '../../src/course/lessonKit'
import {
  COURSE_ORDER, MODULES, OBSERVE_MINUTES, TIERS, TRY_MINUTES, lessonMinutes, lessonWords,
} from '../../src/course/curriculum'
import { LESSONS } from '../../src/course/lessons'
import { fmtRecord } from '../../src/ui/format'
import { STRINGS } from '../../src/ui/i18n'
import {
  C_M_PER_NS, RCTU_NS, UWB_NLOS_NS, UWB_PL_EXP, UWB_PPM_MAX, UWB_RX_SENS_DBM, UWB_TX_POWER_DBM,
  fomText, uwbPl0Db, uwbPollBytes, uwbPpduNs,
} from '../../src/uwb/phy'
import { WALL_LOSS_DB } from '../../src/engine/propagation'
import {
  MMS_SETS, UWB_MS_BUDGET_NJ, combineGainDb, mmsFragmentDbm, mmsLayout, mmsSet, ratioSigma,
  rsfChips, rsfNs,
} from '../../src/uwb/mms'
import {
  NB_CHIP_US, NB_DEFAULT_CHANNELS, NB_POLL_BYTES, NB_REPORT_BYTES, NB_RESP_BYTES,
  NB_SYMBOL_CHIPS, NB_SYMBOL_US, nbCenterMhz, nbPpduNs,
} from '../../src/uwb/nb'
import { rangeSigmaM } from '../../src/uwb/position'
import { rctuToMetres } from '../../src/uwb/ranging'
import { roundPlan } from '../../src/uwb/session'
import { applyRecord, initViewState } from '../../src/model/view'
import { uwbFixRow, uwbNbChannelText, uwbTrainRows } from '../../src/uwb/ui/rows'

const MS = 1_000_000
/** Seven blocks: block 6 starts at 1.200 s and its three pair rounds are over by 1.242 s,
 * while block 7 would not start until 1.400 s. The lesson's "1.3 seconds" is this window. */
const RUN_NS = 1300 * MS
const BLOCKS = 7
const TAG = 'tag-1'
const ANCHORS = MMS_ANCHORS.map((a) => a.id)
/** Index into `uwbMms.variants`. */
const V_FOUR = 0
const V_RSF1 = 1
const V_TWR = 2

const scenarioOf = (v: UwbMmsVariant): Scenario =>
  v === 'base' ? uwbMms.scenario()
    : uwbMms.variants![v === 'four' ? V_FOUR : v === 'rsf1' ? V_RSF1 : V_TWR].scenario()

const memo = new Map<string, TLRecord[]>()
const recs = (v: UwbMmsVariant): TLRecord[] => {
  if (!memo.has(v)) memo.set(v, [...new Simulation(scenarioOf(v)).runUntil(RUN_NS).records])
  return memo.get(v)!
}

const of = <K extends TLRecord['type']>(rs: TLRecord[], type: K): Extract<TLRecord, { type: K }>[] =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type)
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length

/** The trains this node made of its peers' fragments, in the order they were reported. */
const trainsAt = (v: UwbMmsVariant, node: string): Extract<TLRecord, { type: 'UWB_MMS_TRAIN' }>[] =>
  of(recs(v), 'UWB_MMS_TRAIN').filter((t) => t.node === node)
/** One train per peer, the first of the run — the numbers the tables quote. */
const firstTrains = (v: UwbMmsVariant): Extract<TLRecord, { type: 'UWB_MMS_TRAIN' }>[] =>
  ANCHORS.map((p) => trainsAt(v, TAG).find((t) => t.peer === p)!)

/** 3-D distance from an anchor to the tag, as the scene places them. */
const distTo = (a: { x: number; y: number }): number =>
  Math.hypot(a.x - TAG_POS.x, a.y - TAG_POS.y, ANCHOR_Z - TAG_Z)

/** The closed form the lesson's link-budget table is: a fragment's own EIRP, free space on
 * channel 9 at exponent 2, and two brick walls. */
const rxDbmOf = (fragNs: number, d: number): number =>
  mmsFragmentDbm(fragNs) - (uwbPl0Db(9) + 10 * UWB_PL_EXP * Math.log10(d) + 2 * WALL_LOSS_DB.brick)

/** Everything a learner reads of this lesson, joined — for "is this number actually printed?". */
const lessonProse = (l: Lesson): string => {
  const out: string[] = []
  const walk = (x: unknown): void => {
    if (x == null || typeof x === 'function') return
    if (Array.isArray(x)) { x.forEach(walk); return }
    if (typeof x !== 'object') return
    const o = x as Record<string, unknown>
    if (typeof o.en === 'string') { out.push(o.en); return }
    for (const [k, v] of Object.entries(o)) if (k !== 'scenario' && k !== 'find') walk(v)
  }
  walk({ body: l.body, observe: l.observe, tryThis: l.tryThis, quiz: l.quiz })
  return out.join('\n')
}
const prose = (): string => lessonProse(uwbMms)

const tables = (): Extract<Block, { kind: 'table' }>[] =>
  uwbMms.body.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
const cell = (row: number, col: number): string => tables()[0].rows[row][col].en

describe('uwb-mms · lesson shape', () => {
  it('the scenario and its three variants pass the scenario schema', () => {
    expect(() => ScenarioSchema.parse(uwbMms.scenario())).not.toThrow()
    expect(uwbMms.variants).toHaveLength(3)
    for (const v of uwbMms.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
    expect(uwbMms.variants!.map((v) => v.label.en))
      .toEqual(['Four fragments', 'Set rsf-1', '4z for comparison'])
    expect(uwbMms.variants!.map((v) => v.label.zh)).toEqual(['四个片段', '参数集 rsf-1', '拿 4z 作对照'])
  })

  it('the computed study time follows the formula and stays inside the 15–25 minute target', () => {
    const raw = lessonWords(uwbMms) / 150
      + OBSERVE_MINUTES * uwbMms.observe.length + TRY_MINUTES * uwbMms.tryThis.length
    expect(lessonMinutes(uwbMms)).toBe(Math.max(5, Math.round(raw / 5) * 5))
    expect(lessonMinutes(uwbMms)).toBeGreaterThanOrEqual(15)
    expect(lessonMinutes(uwbMms)).toBeLessThanOrEqual(25)
    // the header's word budget: 25 minutes needs at most 1724 words, because 1725 makes raw
    // exactly 27.5 and Math.round(5.5) rounds up
    expect(lessonWords(uwbMms)).toBeLessThanOrEqual(1724)
    const at1725 = 1725 / 150 + OBSERVE_MINUTES * 4 + TRY_MINUTES * 2
    expect(Math.round(at1725 / 5) * 5).toBe(30)
    expect(uwbMms.module).toBe(15)
    expect(uwbMms.id).toBe('uwb-mms')
  })

  it('it offers five jumps, four things to observe, two experiments and three questions', () => {
    expect(uwbMms.jumps).toHaveLength(5)
    expect(uwbMms.observe).toHaveLength(4)
    expect(uwbMms.tryThis).toHaveLength(2)
    expect(uwbMms.quiz).toHaveLength(3)
    for (const q of uwbMms.quiz) expect(q.options[q.answer]).toBeDefined()
  })

  it('every jump target occurs in the base run, in the order the list gives them', () => {
    const rs = recs('base')
    const idx: number[] = []
    for (const j of uwbMms.jumps) {
      const i = rs.findIndex(j.find)
      expect(i, j.label.en).toBeGreaterThanOrEqual(0)
      idx.push(i)
    }
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
    // the narrowband poll opens the round at 0, the first fragment goes out in slot 4, the
    // train is judged in the slot after the last fragment, the report lands in slot 24
    expect(rs[idx[0]].t).toBe(0)
    expect(rs[idx[1]].t).toBe(2 * MS)
    expect(rs[idx[2]].t).toBe(9.5 * MS)
    expect(rs[idx[3]].t).toBe(12 * MS)
    expect(rs[idx[4]].t).toBe(12 * MS + nbPpduNs(NB_REPORT_BYTES) + 44)
  })

  it('every string a learner reads exists in both languages', () => {
    const seen: L10n[] = []
    const isL10n = (o: Record<string, unknown>): o is Record<string, unknown> & L10n =>
      typeof o.en === 'string' && typeof o.zh === 'string'
    const walk = (x: unknown): void => {
      if (x == null || typeof x === 'function') return
      if (Array.isArray(x)) { x.forEach(walk); return }
      if (typeof x !== 'object') return
      const o = x as Record<string, unknown>
      if (isL10n(o)) { seen.push(o); return }
      for (const [k, v] of Object.entries(o)) if (k !== 'scenario' && k !== 'find') walk(v)
    }
    walk({
      title: uwbMms.title, body: uwbMms.body, observe: uwbMms.observe,
      tryThis: uwbMms.tryThis, quiz: uwbMms.quiz, variants: uwbMms.variants, jumps: uwbMms.jumps,
    })
    expect(seen.length).toBeGreaterThan(40)
    for (const l of seen) {
      expect(l.en.trim().length, l.en).toBeGreaterThan(0)
      expect(l.zh.trim().length, l.en).toBeGreaterThan(0)
      if (/[a-z]{3,}\s+[a-z]{3,}/.test(l.en)) expect(l.zh, l.en).not.toBe(l.en)
    }
  })

  it('opens by saying what is standard, what is draft, what is regulation and what is model', () => {
    const first = uwbMms.body[0]
    expect(first.kind ?? 'p').toBe('p')
    const en = (first as Extract<Block, { kind?: 'p' }>).text.en
    expect(en).toContain('IEEE Std 802.15.4-2024')
    // the narrowband radio is the standard's, exactly as the companion lesson says: Clause 12
    // O-QPSK, 32 chips a symbol at 0.5 µs, 4 bits a symbol — 250 kb/s, and 576 µs for 12 octets
    expect(en).toContain('everything that turns a Clause 12 O-QPSK radio into a control radio for UWB')
    expect(NB_SYMBOL_CHIPS * NB_CHIP_US).toBe(NB_SYMBOL_US)
    expect(4 / (NB_SYMBOL_US / 1000)).toBe(250) // 4 bits per 16 µs symbol, in kb/s
    expect(nbPpduNs(NB_POLL_BYTES) / 1000).toBe(576)
    // …and the paragraph that describes that radio credits Clause 12 for it too
    const carries = uwbMms.body.find((b) => b.heading?.en === 'What the narrowband radio carries')!
    const carriesText = (carries as Extract<Block, { kind?: 'p' }>).text
    expect(carriesText.en).toContain('Clause 12’s 250 kb/s O-QPSK radio')
    expect(carriesText.zh).toContain('标准第 12 章')
    expect(en).toContain('P802.15.4ab')
    expect(en).toContain('D5.0')
    expect(en).toContain('The balloted draft may differ')
    for (const doc of ['15-22/0381r5', '15-23/0100r2', '15-23/0502r3', '15-22/0205r0']) {
      expect(en, doc).toContain(doc)
    }
    expect(en).toContain('One number is regulation')
    expect(en).toContain('−41.3 dBm/MHz mean EIRP averaged over a millisecond')
    expect(en).toContain('the rest is model')
    const zh = (first as Extract<Block, { kind?: 'p' }>).text.zh
    expect(zh).toContain('P802.15.4ab')
    expect(zh).toContain('D5.0')
    expect(zh).toContain('15-22/0205r0')
  })

  it('opens UWB Tier 3 and module 15, after uwb-aoa and before uwb-nba', () => {
    expect(TIERS[6]).toEqual({
      track: 'uwb', en: 'UWB Tier 3 · What comes next: 802.15.4ab', zh: 'UWB 第三阶段 · 下一步：802.15.4ab',
    })
    expect(MODULES[15]).toEqual({
      tier: 6, title: { en: 'Narrowband-assisted multi-millisecond UWB', zh: '窄带辅助的多毫秒 UWB' },
    })
    expect(MODULES[uwbMms.module].tier).toBe(6)
    expect(COURSE_ORDER[COURSE_ORDER.indexOf('uwb-aoa') + 1]).toBe('uwb-mms')
    const ids = LESSONS.map((l) => l.id)
    expect(ids[ids.indexOf('uwb-mms') - 1]).toBe('uwb-aoa')
    expect(ids[ids.indexOf('uwb-mms') + 1]).toBe('uwb-nba')
    expect(ids[ids.length - 1]).toBe('uwb-nba')
  })
})

describe('uwb-mms · the scene', () => {
  const sc = uwbMmsScenario('base')

  it('is a 22 × 8 m hall with full-height brick partitions at x = 5 and x = 10', () => {
    expect(sc.rooms).toEqual([{ x: 0, y: 0, w: 22, h: 8, name: 'Hall' }])
    expect(sc.walls).toEqual(twoWallLab().walls)
    expect(sc.walls).toContainEqual(brick(5, 0, 5, 8))
    expect(sc.walls).toContainEqual(brick(10, 0, 10, 8))
    for (const w of sc.walls) expect(w.openings).toEqual([])
    expect(prose()).toContain('The hall is 22 × 8 m, cut into three bays by full-height brick partitions at x = 5 and x = 10')
  })

  it('places three anchors in the first bay and the tag in the third, crystals set', () => {
    expect(sc.nodes.map((n) => n.id)).toEqual([...ANCHORS, TAG])
    for (const a of MMS_ANCHORS) {
      const n = sc.nodes.find((x) => x.id === a.id)!
      expect(n.pos, a.id).toEqual({ x: a.x, y: a.y, z: ANCHOR_Z })
      expect(n.uwb, a.id).toEqual({ role: 'anchor', ppm: a.ppm })
    }
    const tag = sc.nodes.find((n) => n.id === TAG)!
    expect(tag.pos).toEqual({ x: TAG_POS.x, y: TAG_POS.y, z: TAG_Z })
    expect(tag.uwb).toEqual({ role: 'tag', ppm: TAG_POS.ppm })
    // "Three anchors stand in the first bay at 2.20 m … the tag at (13.00, 4.00) in the third"
    expect(ANCHOR_Z).toBe(2.2)
    expect(TAG_Z).toBe(1.0)
    for (const a of MMS_ANCHORS) expect(a.x, a.id).toBeLessThan(5)
    expect(TAG_POS.x).toBeGreaterThan(10)
    // "13.04, 13.04 and 12.76 m through 24 dB of brick"
    expect(MMS_ANCHORS.map((a) => distTo(a).toFixed(2))).toEqual(['13.04', '13.04', '12.76'])
    expect(2 * WALL_LOSS_DB.brick).toBe(24)
    expect(prose()).toContain('13.04, 13.04 and 12.76 m through 24 dB of brick')
  })

  it('is an MMS session on the draft defaults, one UNII-3 control channel, responder reporting', () => {
    const u = sc.uwb!
    expect(u.mode).toBe('mms')
    expect(u.method).toBe('ss')
    expect(u.slotRstu).toBe(600)
    expect(u.slotRstu % 300).toBe(0)
    expect(u.blockRstu).toBe(DEFAULT_UWB_SESSION.blockRstu)
    expect(u.nlos).toBe(true)
    expect(u.aoa).toBe(false)
    expect(u.tsNoisePs).toBe(DEFAULT_UWB_SESSION.tsNoisePs)
    expect(u.cfoNoisePpm).toBe(DEFAULT_UWB_SESSION.cfoNoisePpm)
    expect(u.mms).toEqual({ ...DEFAULT_UWB_SESSION.mms, nbChannels: [3], report: 'responder' })
    expect(u.mms.rsfs).toBe(8)
    expect(u.mms.rifs).toBe(0)
    expect(u.mms.nMsr).toBe(40)
    expect(u.mms.gap).toBe(64)
    expect(u.mms.nbChannels).toEqual(NB_DEFAULT_CHANNELS)
    // the variants move one thing each
    expect(uwbMmsScenario('four').uwb!.mms).toEqual({ ...u.mms, rsfs: 4 })
    expect(uwbMmsScenario('rsf1').uwb!.mms).toEqual({ ...u.mms, ...mmsSet('rsf-1') })
    expect(mmsSet('rsf-1')).toEqual({ rsfs: 16, rifs: 0, nMsr: 40, gap: 33, stsLen: 64, gapMs: 1 })
    const twr = uwbMmsScenario('twr').uwb!
    expect(twr.mode).toBe('twr')
    expect(twr.method).toBe('ss')
    expect(twr.slotRstu).toBe(600)
    expect(JSON.stringify(uwbMmsScenario('twr').nodes)).toBe(JSON.stringify(sc.nodes))
  })

  it('"28 slots × 500 µs = 14 ms", three pair rounds of a 200 ms block that holds fourteen', () => {
    const plan = roundPlan(sc.uwb!, ANCHORS.length)
    expect(plan.slots).toBe(28)
    expect(plan.slotNs).toBe(0.5 * MS)
    expect(plan.roundNs).toBe(14 * MS)
    expect(plan.blockNs).toBe(200 * MS)
    expect(plan.roundsPerBlock).toBe(14)
    const layout = mmsLayout({ ...sc.uwb!.mms })
    expect([layout.controlSlots, layout.rpSlots, layout.reportSlots]).toEqual([4, 20, 4])
    expect(layout.slots).toBe(28)
    expect(layout.reportSlot('responder')).toBe(24)
    // three pair rounds take 42 ms of the block; set rsf-1's take 60
    expect(3 * plan.roundNs).toBe(42 * MS)
    const rsf1 = roundPlan(uwbMmsScenario('rsf1').uwb!, ANCHORS.length)
    expect(rsf1.slots).toBe(40)
    expect(rsf1.roundNs).toBe(20 * MS)
    expect(3 * rsf1.roundNs).toBe(60 * MS)
    expect(prose()).toContain('the ranging phase grows from 20 slots to 32, the round from 14 ms to 20, three rounds from 42 ms of the block to 60 ms')
    // and the run agrees: 28-slot MMS rounds, three a block, one per anchor
    const rounds = of(recs('base'), 'UWB_ROUND')
    expect(rounds).toHaveLength(BLOCKS * ANCHORS.length)
    expect(rounds.slice(0, 4).map((r) => [r.node, r.t, r.round, r.block, r.slots, r.mode])).toEqual([
      [TAG, 0, 0, 0, 28, 'mms'],
      [TAG, 14 * MS, 1, 0, 28, 'mms'],
      [TAG, 28 * MS, 2, 0, 28, 'mms'],
      [TAG, 200 * MS, 0, 1, 28, 'mms'],
    ])
  })
})

describe('uwb-mms · thirty-seven nanojoules, and one fragment', () => {
  it('"−41.3 dBm/MHz over 499.2 MHz is −14.3 dBm … for a millisecond is 37 nJ"', () => {
    const dbm = -41.3 + 10 * Math.log10(499.2)
    expect(dbm.toFixed(1)).toBe('-14.3')
    // −14.3 dBm held for 1 ms: mW × ms = µJ, so 10^(−1.43) µJ = 37 nJ
    expect((10 ** (dbm / 10) * 1000).toFixed(0)).toBe(String(UWB_MS_BUDGET_NJ))
    expect(UWB_MS_BUDGET_NJ).toBe(37)
  })

  it('"a Poll to three anchors (36 octets, 203.782 µs) spends 8.11 nJ and throws the other 29 away"', () => {
    expect(uwbPollBytes(ANCHORS.length)).toBe(36)
    expect(uwbPpduNs(uwbPollBytes(ANCHORS.length))).toBe(203_782)
    const nJ = 10 ** (UWB_TX_POWER_DBM / 10) * (uwbPpduNs(uwbPollBytes(ANCHORS.length)) / 1000)
    expect(nJ.toFixed(2)).toBe('8.11')
    expect(Math.round(UWB_MS_BUDGET_NJ - nJ)).toBe(29)
    expect(UWB_TX_POWER_DBM).toBe(-14)
    // and the run's own 4z Poll is that frame
    const poll = of(recs('twr'), 'TX_START').find((r) => r.frame.kind === 'uwbPoll')!
    expect(poll.frame.bytes).toBe(36)
    expect(poll.frame.txTimeNs).toBe(203_782)
  })

  it('"40 × 4 × (128 + 2 × 64) = 40 960 chips, 82.051 µs; … is −3.46 dBm"', () => {
    expect(40 * 4 * (128 + 2 * 64)).toBe(40_960)
    expect(rsfChips(40, 64)).toBe(40_960)
    expect(rsfNs(40, 64)).toBe(82_051)
    expect(mmsFragmentDbm(rsfNs(40, 64)).toFixed(2)).toBe('-3.46')
    // set rsf-1's shorter fragment, and the 1.20 dB it buys
    expect(rsfNs(MMS_SETS['rsf-1'].nMsr, MMS_SETS['rsf-1'].gap)).toBe(62_179)
    expect(mmsFragmentDbm(62_179).toFixed(2)).toBe('-2.25')
    expect((mmsFragmentDbm(62_179) - mmsFragmentDbm(82_051)).toFixed(2)).toBe('1.20')
    expect(prose()).toContain('so the fragment is 62.179 µs instead of 82.051')
    expect(prose()).toContain('plus 1.20 dB for the shorter fragment')
  })

  it('"X equal-power fragments combine to 10·log10(X) dB", 6.02 / 9.03 / 12.04', () => {
    expect([4, 8, 16].map((n) => combineGainDb(n).toFixed(2))).toEqual(['6.02', '9.03', '12.04'])
    expect(UWB_RX_SENS_DBM).toBe(-93)
    expect([0, 1, 2].map((r) => cell(r, 2))).toEqual(['+6.02 dB', '+9.03 dB', '+12.04 dB'])
    // the first column is the train each row is about, and the last is what came of it
    expect([0, 1, 2].map((r) => cell(r, 0)))
      .toEqual(['4 × 82.051 µs', '8 × 82.051 µs', '16 × 62.179 µs'])
    expect([0, 1, 2].map((r) => cell(r, 4))).toEqual(['lost', 'detected', 'detected'])
    expect([0, 1, 2].map((r) => tables()[0].rows[r][4].zh)).toEqual(['丢失', '检出', '检出'])
    expect(tables()[0].head.map((h) => h.en))
      .toEqual(['Train', 'Per fragment', 'Gain', 'Margin', 'Verdict'])
    expect(prose()).toContain('combine to 10·log10(X) dB, detected once that clears −93 dBm')
  })
})

describe('uwb-mms · the two-wall link budget', () => {
  const margins = (v: UwbMmsVariant): string[] =>
    firstTrains(v).map((t) => `${t.marginDb >= 0 ? '+' : ''}${t.marginDb.toFixed(2)}`)

  it('"Every fragment arrives at −100.26 dBm, or −100.07 from the near anchor"', () => {
    const rx = firstTrains('base').map((t) => t.rxDbm.toFixed(2))
    expect(rx).toEqual(['-100.26', '-100.26', '-100.07'])
    // the same number from the closed form: a fragment's EIRP, free space on channel 9, two walls
    expect(MMS_ANCHORS.map((a) => rxDbmOf(rsfNs(40, 64), distTo(a)).toFixed(2)))
      .toEqual(['-100.26', '-100.26', '-100.07'])
    // "seven decibels under the receiver"
    expect(Math.round(UWB_RX_SENS_DBM - firstTrains('base')[0].rxDbm)).toBe(7)
    expect(cell(1, 1)).toBe('−100.26 / −100.07 dBm')
    expect(prose()).toContain('Every fragment arrives at −100.26 dBm, or −100.07 from the near anchor')
  })

  it('X = 8: every train heard in full, +1.77 / +1.96 dB, and every pair ranges', () => {
    expect(margins('base')).toEqual(['+1.77', '+1.77', '+1.96'])
    expect(cell(1, 3)).toBe('+1.77 / +1.96 dB')
    for (const t of trainsAt('base', TAG)) {
      expect(t.heard, t.peer).toBe(8)
      expect(t.fragments, t.peer).toBe(8)
      expect(t.detected, t.peer).toBe(true)
      expect(t.gainDb, t.peer).toBeCloseTo(combineGainDb(8), 9)
      expect(t.marginDb, t.peer).toBeCloseTo(t.rxDbm + t.gainDb - UWB_RX_SENS_DBM, 9)
      // "no single fragment is audible": the margin is entirely the train's
      expect(t.rxDbm, t.peer).toBeLessThan(UWB_RX_SENS_DBM)
    }
    expect(of(recs('base'), 'UWB_RANGE').map((r) => r.node)).toEqual(
      Array.from({ length: BLOCKS * ANCHORS.length }, () => TAG),
    )
    expect(of(recs('base'), 'UWB_TIMEOUT')).toEqual([])
  })

  it('X = 4: the same fragments, 6.02 dB instead of 9.03, and all three trains lost', () => {
    expect(margins('four')).toEqual(['-1.24', '-1.24', '-1.05'])
    expect(cell(0, 3)).toBe('−1.24 / −1.05 dB')
    expect(cell(0, 1)).toBe('−100.26 / −100.07 dBm')
    // the ruling the scene was built for: every one of the three fails at X = 4, by a decibel
    // or more, and every one succeeds at X = 8 by a decibel or more
    for (const t of trainsAt('four', TAG)) {
      expect(t.heard, t.peer).toBe(4)
      expect(t.rxDbm.toFixed(2), t.peer).toBe(firstTrains('base').find((b) => b.peer === t.peer)!.rxDbm.toFixed(2))
      expect(t.detected, t.peer).toBe(false)
      expect(t.marginDb, t.peer).toBeLessThanOrEqual(-1)
      expect(t.ratioPpm, t.peer).toBeNull()
    }
    for (const t of firstTrains('base')) expect(t.marginDb, t.peer).toBeGreaterThanOrEqual(1)
    // both sides lose the other's train, so nobody reports and the tag times out instead
    for (const a of ANCHORS) expect(trainsAt('four', a).every((t) => !t.detected), a).toBe(true)
    expect(of(recs('four'), 'UWB_RANGE')).toEqual([])
    expect(of(recs('four'), 'UWB_POSITION')).toEqual([])
    const outs = of(recs('four'), 'UWB_TIMEOUT')
    expect(outs).toHaveLength(21)
    expect(outs).toHaveLength(BLOCKS * ANCHORS.length)
    // one per pair round, so the peer walks the anchors: seven lines each, not 21 of anchor-1
    expect(new Set(outs.map((o) => `${o.node} ${o.expected} ${o.slot} ${o.peer}`)))
      .toEqual(new Set(ANCHORS.map((a) => `${TAG} nbReport 24 ${a}`)))
    expect(outs.filter((o) => o.peer === 'anchor-1')).toHaveLength(BLOCKS)
    expect(outs.slice(0, 3).map((o) => fmtRecord(o))).toEqual([
      'tag-1 UWB slot 24: no nb-report from anchor-1',
      'tag-1 UWB slot 24: no nb-report from anchor-2',
      'tag-1 UWB slot 24: no nb-report from anchor-3',
    ])
    expect(uwbMms.tryThis[0].en).toContain('one per pair round — “tag-1 UWB slot 24: no nb-report from anchor-1”, then anchor-2, then anchor-3')
    // "Each anchor loses the tag's train and the tag loses all three of theirs"
    for (const a of ANCHORS) expect(trainsAt('four', a), a).toHaveLength(BLOCKS)
    expect(trainsAt('four', TAG)).toHaveLength(BLOCKS * ANCHORS.length)
    // exactly the 3.01 dB of a halved train, and nothing else
    for (const t of firstTrains('four')) {
      const eight = firstTrains('base').find((b) => b.peer === t.peer)!
      expect(eight.marginDb - t.marginDb, t.peer).toBeCloseTo(10 * Math.log10(2), 9)
    }
  })

  it('X = 16 on set rsf-1: −99.05 / −98.86 dBm per fragment, +5.99 / +6.18 dB', () => {
    expect(firstTrains('rsf1').map((t) => t.rxDbm.toFixed(2))).toEqual(['-99.05', '-99.05', '-98.86'])
    expect(margins('rsf1')).toEqual(['+5.99', '+5.99', '+6.18'])
    expect(MMS_ANCHORS.map((a) => rxDbmOf(rsfNs(40, 33), distTo(a)).toFixed(2)))
      .toEqual(['-99.05', '-99.05', '-98.86'])
    expect(cell(2, 0)).toBe('16 × 62.179 µs')
    expect(cell(2, 1)).toBe('−99.05 / −98.86 dBm')
    expect(cell(2, 3)).toBe('+5.99 / +6.18 dB')
    for (const t of trainsAt('rsf1', TAG)) {
      expect(t.heard, t.peer).toBe(16)
      expect(t.detected, t.peer).toBe(true)
    }
    expect(of(recs('rsf1'), 'UWB_RANGE')).toHaveLength(BLOCKS * ANCHORS.length)
    expect(of(recs('rsf1'), 'UWB_TIMEOUT')).toEqual([])
    expect(prose()).toContain('the margin goes from +1.8 to +6.0 dB')
  })

  it('the event log says what the observe items quote, in both languages', () => {
    const line = (v: UwbMmsVariant, node: string): string =>
      fmtRecord(trainsAt(v, node)[0])
    expect(line('base', 'anchor-1'))
      .toBe('anchor-1 RSF train ← tag-1: 8/8 heard, -100.3 dBm + 9.0 dB = margin 1.8 dB → detected, ratio -39.995 ppm')
    expect(line('base', TAG))
      .toBe('tag-1 RSF train ← anchor-1: 8/8 heard, -100.3 dBm + 9.0 dB = margin 1.8 dB → detected, ratio 39.970 ppm')
    expect(line('four', 'anchor-1'))
      .toBe('anchor-1 RSF train ← tag-1: 4/4 heard, -100.3 dBm + 6.0 dB = margin -1.2 dB → lost')
    // the UWB log lines are language-neutral: the same string is what a ZH reader sees
    expect(uwbMms.observe[2].en).toContain('anchor-1 RSF train ← tag-1: 8/8 heard, -100.3 dBm + 9.0 dB = margin 1.8 dB → detected, ratio -39.995 ppm')
    expect(uwbMms.observe[2].zh).toContain('anchor-1 RSF train ← tag-1: 8/8 heard, -100.3 dBm + 9.0 dB = margin 1.8 dB → detected, ratio -39.995 ppm')
    expect(uwbMms.tryThis[0].en).toContain('anchor-1 RSF train ← tag-1: 4/4 heard, -100.3 dBm + 6.0 dB = margin -1.2 dB → lost')
    expect(uwbMms.tryThis[0].zh).toContain('anchor-1 RSF train ← tag-1: 4/4 heard, -100.3 dBm + 6.0 dB = margin -1.2 dB → lost')
  })
})

describe('uwb-mms · what the narrowband radio carries', () => {
  const rs = () => recs('base')

  it('"a POLL of 12 octets and 576 µs … a REPORT, 13 octets and 608 µs"', () => {
    expect([NB_POLL_BYTES, NB_RESP_BYTES, NB_REPORT_BYTES]).toEqual([12, 12, 13])
    expect(nbPpduNs(NB_POLL_BYTES)).toBe(576_000)
    expect(nbPpduNs(NB_RESP_BYTES)).toBe(576_000)
    expect(nbPpduNs(NB_REPORT_BYTES)).toBe(608_000)
    const tx = of(rs(), 'TX_START').filter((r) => r.t < 14 * MS)
    expect(tx.map((r) => [r.node, r.frame.kind, r.t]).slice(0, 3)).toEqual([
      [TAG, 'nbPoll', 0], ['anchor-1', 'nbResp', MS], [TAG, 'uwbRsf', 2 * MS],
    ])
    expect(tx.at(-1)!.frame.kind).toBe('nbReport')
    expect(tx.at(-1)!.t).toBe(12 * MS)
    expect(tx.filter((r) => r.frame.kind === 'uwbRsf')).toHaveLength(16)
    for (const r of tx) {
      const want = r.frame.kind === 'uwbRsf' ? 82_051 : nbPpduNs(r.frame.bytes)
      expect(r.frame.txTimeNs, r.frame.kind).toBe(want)
    }
  })

  it('"here channel 3, 5733.75 MHz", and the inspector says the same', () => {
    expect(nbCenterMhz(3)).toBe(5733.75)
    const poll = of(rs(), 'TX_START').find((r) => r.frame.kind === 'nbPoll')!
    expect(poll.frame.uwb?.nb?.channel).toBe(3)
    expect(poll.frame.uwb?.nb?.centerMhz).toBe(5733.75)
    expect(poll.frame.mbps).toBe(0.25)
    const vs = initViewState(uwbMmsScenario('base'))
    for (const r of rs()) applyRecord(vs, r)
    const u = vs.nodes[TAG].uwb!
    expect(uwbNbChannelText(u, STRINGS.en.uwb)).toBe('3 · 5733.75 MHz')
    expect(uwbNbChannelText(u, STRINGS.zh.uwb)).toBe('3 · 5733.75 MHz')
    expect(u.mms.lbtBusy).toBe(0) // UNII-3: 'auto' asks for no listen before talk
    expect(of(rs(), 'UWB_NB_LBT')).toEqual([])
    expect(uwbMms.observe[3].en).toContain('3 · 5733.75 MHz')
  })

  it('"Those three are 1.760 ms of the round’s 3.073 ms of air; all sixteen fragments are 1.313 ms"', () => {
    const air = of(rs(), 'TX_START').filter((r) => r.t < 14 * MS)
    const sum = (kinds: string[]): number =>
      air.filter((r) => kinds.includes(r.frame.kind)).reduce((a, r) => a + r.frame.txTimeNs, 0)
    expect(sum(['nbPoll', 'nbResp', 'nbReport'])).toBe(1_760_000)
    expect(sum(['uwbRsf'])).toBe(16 * 82_051)
    expect((sum(['uwbRsf']) / MS).toFixed(3)).toBe('1.313')
    expect((air.reduce((a, r) => a + r.frame.txTimeNs, 0) / MS).toFixed(3)).toBe('3.073')
  })

  it('the tag opens on narrowband and the responder alone reports', () => {
    const kinds = of(rs(), 'TX_START').filter((r) => r.frame.kind.startsWith('nb'))
    // one report per pair round, from the responder of that round, block after block
    expect(kinds.filter((r) => r.frame.kind === 'nbReport').map((r) => r.node))
      .toEqual(Array.from({ length: BLOCKS }, () => ANCHORS).flat())
    expect(uwbMmsScenario('base').uwb!.mms.report).toBe('responder')
    expect(prose()).toContain('only then is either side primed to listen')
  })
})

describe('uwb-mms · the ruler a millisecond long', () => {
  const rs = () => recs('base')
  /** True ratio at the tag: its own ppm minus the peer's. */
  const trueRatio = (peer: string): number =>
    TAG_POS.ppm - MMS_ANCHORS.find((a) => a.id === peer)!.ppm

  it('"σ_ratio = 0.0202 ppm" over the train’s 7 ms', () => {
    const sigmaPpm = ratioSigma(DEFAULT_UWB_SESSION.tsNoisePs, 7) * 1e6
    expect(sigmaPpm.toFixed(4)).toBe('0.0202')
    expect(DEFAULT_UWB_SESSION.tsNoisePs).toBe(100)
    expect(prose()).toContain('100 ps stamps give σ_ratio = 0.0202 ppm')
  })

  it('"round 0 measures 39.970, 19.992 and 9.967" against a true 40, 20 and 10 ppm', () => {
    expect(ANCHORS.map(trueRatio)).toEqual([40, 20, 10])
    expect(firstTrains('base').map((t) => t.ratioPpm!.toFixed(3)))
      .toEqual(['39.970', '19.992', '9.967'])
    const sigmaPpm = ratioSigma(DEFAULT_UWB_SESSION.tsNoisePs, 7) * 1e6
    for (const t of trainsAt('base', TAG)) {
      expect(Math.abs(t.ratioPpm! - trueRatio(t.peer)), t.peer).toBeLessThan(4 * sigmaPpm)
    }
    // "The responder uses that ratio; the initiator inverts it": the two ends of one pair
    // measure the same ratio with opposite signs, and the tag is the initiator
    const atAnchor = trainsAt('base', 'anchor-1')[0]
    expect(atAnchor.ratioPpm!.toFixed(3)).toBe('-39.995')
    expect(Math.sign(atAnchor.ratioPpm!)).toBe(-Math.sign(firstTrains('base')[0].ratioPpm!))
  })

  it('"the reply is one slot, 0.5 ms", and the correction is what the train measured', () => {
    const reply = of(rs(), 'TX_START').map((r) => r.frame.uwb?.nb?.replyRctu).find((x) => x !== undefined)!
    expect((reply * RCTU_NS / MS).toFixed(3)).toBe('0.500')
    // the raw range minus the corrected one is ½ · T_reply · 40 ppm · c = 3.00 m
    const closed = 0.5 * 0.5e-3 * 40e-6 * C_M_PER_NS * 1e9
    expect(closed.toFixed(2)).toBe('3.00')
    const gaps = of(rs(), 'UWB_RANGE').filter((r) => r.peer === 'anchor-1')
      .map((r) => rctuToMetres(r.tofRawRctu!) - r.distM)
    expect(mean(gaps)).toBeCloseTo(closed, 2)
    expect(prose()).toContain('½ × 0.5 ms × 40 ppm × c = 3.00 m')
  })

  it('the three rungs are arithmetic from the constants: 1.5 m, 1.5 cm, 1.5 mm', () => {
    const halfReplyS = 0.5 * 0.5e-3
    const cMs = C_M_PER_NS * 1e9
    // one crystal at the §16.4.9 limit
    expect((halfReplyS * UWB_PPM_MAX * 1e-6 * cMs).toFixed(1)).toBe('1.5')
    expect(UWB_PPM_MAX).toBe(20)
    // the carrier estimate 4z falls back on
    expect((halfReplyS * DEFAULT_UWB_SESSION.cfoNoisePpm * 1e-6 * cMs * 100).toFixed(1)).toBe('1.5')
    expect(DEFAULT_UWB_SESSION.cfoNoisePpm).toBe(0.2)
    // the train's own residual
    const sigmaPpm = ratioSigma(DEFAULT_UWB_SESSION.tsNoisePs, 7) * 1e6
    expect((halfReplyS * sigmaPpm * 1e-6 * cMs * 1000).toFixed(1)).toBe('1.5')
    expect(prose()).toContain('One crystal at the ±20 ppm of §16.4.9 would be 1.5 m of it')
    expect(prose()).toContain('leaves 1.5 cm at 0.2 ppm; the train’s 0.0202 ppm leaves 1.5 mm')
  })

  it('"two receive stamps alone are c·σ_ts/√2 = 2.1 cm … an RMS of 2.05 cm" over 21 ranges', () => {
    expect((rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs) * 100).toFixed(1)).toBe('2.1')
    const biasM = 2 * UWB_NLOS_NS.brick * C_M_PER_NS
    const errs = of(rs(), 'UWB_RANGE').map((r) => r.distM - r.trueDistM - biasM)
    expect(errs).toHaveLength(21)
    expect(errs).toHaveLength(BLOCKS * ANCHORS.length)
    const rms = Math.sqrt(mean(errs.map((e) => e * e)))
    expect((rms * 100).toFixed(2)).toBe('2.05')
    // the 1.5 mm of ratio residual is invisible under it: adding it in quadrature moves
    // nothing a reader could see
    const floor = rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs)
    expect(rms).toBeLessThan(1.2 * floor)
    expect((Math.hypot(floor, 0.0015) * 100).toFixed(1)).toBe((floor * 100).toFixed(1))
    expect(prose()).toContain('over 21 ranges the error about this room’s bias has an RMS of 2.05 cm')
  })

  it('the log line the lesson quotes for the first range', () => {
    const first = of(rs(), 'UWB_RANGE')[0]
    expect(fmtRecord(first)).toBe('tag-1 range → anchor-1 (SS): 14.26 m (true 13.04 m, raw 17.25 m)')
    expect(first.t).toBe(12 * MS + nbPpduNs(NB_REPORT_BYTES) + 44)
    expect(uwbMms.observe[3].en).toContain('tag-1 range → anchor-1 (SS): 14.26 m (true 13.04 m, raw 17.25 m)')
    expect(prose()).toContain('range → anchor-1 (SS): 14.26 m (true 13.04 m, raw 17.25 m)')
  })
})

describe('uwb-mms · where the gain actually comes from', () => {
  it('19.57 dB over a 4z Poll, and only 9.03 of it is the train', () => {
    const d = distTo(MMS_ANCHORS[0])
    const pathDb = uwbPl0Db(9) + 10 * UWB_PL_EXP * Math.log10(d) + 2 * WALL_LOSS_DB.brick
    const poll = UWB_TX_POWER_DBM - pathDb
    expect(poll.toFixed(2)).toBe('-110.80')
    const train = firstTrains('base')[0].rxDbm + firstTrains('base')[0].gainDb
    expect(train.toFixed(2)).toBe('-91.23')
    expect((train - poll).toFixed(2)).toBe('19.57')
    // the split: the train, the shorter fragment, and the budget the 4z transmitter never spends
    const pollNs = uwbPpduNs(uwbPollBytes(ANCHORS.length))
    const burstDb = 10 * Math.log10(UWB_MS_BUDGET_NJ / (10 ** (UWB_TX_POWER_DBM / 10) * (pollNs / 1000)))
    const shorterDb = mmsFragmentDbm(rsfNs(40, 64)) - mmsFragmentDbm(pollNs)
    expect(burstDb.toFixed(2)).toBe('6.59')
    expect(shorterDb.toFixed(2)).toBe('3.95')
    expect(combineGainDb(8).toFixed(2)).toBe('9.03')
    expect(burstDb + shorterDb + combineGainDb(8)).toBeCloseTo(train - poll, 6)
    // "a burst-mode one could hold −7.41 dBm and be as legal"
    expect(mmsFragmentDbm(pollNs).toFixed(2)).toBe('-7.41')
    expect((burstDb + shorterDb).toFixed(2)).toBe('10.54')
    expect(prose()).toContain('its eight-fragment train arrives at an effective −91.23: 19.57 dB better')
    expect(uwbMms.quiz[1].options[1].en).toContain('9.03 dB; the other 10.54 is transmit power')
  })
})

describe('uwb-mms · what the walls charge anyway', () => {
  const rs = () => recs('base')

  it('"4 ns, 1.199 m, every round", and the figure of merit says NLOS', () => {
    expect(UWB_NLOS_NS.brick).toBe(2)
    const biasM = 2 * UWB_NLOS_NS.brick * C_M_PER_NS
    expect(biasM.toFixed(3)).toBe('1.199')
    for (const r of of(rs(), 'UWB_RANGE')) {
      expect(Math.abs(r.distM - r.trueDistM - biasM), `${r.peer} b${r.block}`)
        .toBeLessThan(4 * rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs))
      expect(fomText(r.fom), r.peer).toBe('75 % within 12 ns')
      expect(r.integrity, r.peer).toBeUndefined() // Y = 0: no integrity train, no flag
      expect(r.method).toBe('ss')
    }
    expect(uwbMmsScenario('base').uwb!.mms.rifs).toBe(0)
    expect(prose()).toContain('figure of merit says “75 % within 12 ns”, the NLOS byte')
    expect(prose()).toContain('with Y = 0 there is no integrity flag')
  })

  it('"(14.22, 4.05) m against a true (13.00, 4.00), 1.22 m east, GDOP 2.93, ellipse 6.1 × 1.3 cm"', () => {
    const fixes = of(rs(), 'UWB_POSITION')
    expect(fixes).toHaveLength(BLOCKS)
    for (const f of fixes) {
      expect(f.node).toBe(TAG)
      expect(f.method).toBe('twr')
      expect(f.anchors).toEqual(ANCHORS)
      expect(f.gdop.toFixed(2)).toBe('2.93')
      expect(f.x - f.trueX).toBeGreaterThan(1.2) // pushed east by the walls' own delay
    }
    // the block fix comes at the tag's last pair round of the block
    expect(fixes.map((f) => f.t)).toEqual(
      Array.from({ length: BLOCKS }, (_, b) => b * 200 * MS + 42 * MS),
    )
    const vs = initViewState(uwbMmsScenario('base'))
    for (const r of rs()) applyRecord(vs, r)
    const u = vs.nodes[TAG].uwb!
    const row = uwbFixRow(u.position!, STRINGS.en.uwb)
    expect(row.estimate).toBe('(14.22, 4.05) m')
    expect(row.truth).toBe('(13.00, 4.00) m')
    expect(row.error).toBe('122.4 cm')
    expect(row.gdop).toBe('2.93')
    expect(row.ellipse).toBe('6.1 × 1.3 cm')
    expect(row.method).toBe('two-way ranging')
    expect(uwbFixRow(u.position!, STRINGS.zh.uwb).method).toBe('双向测距 (TWR)')
    expect(uwbMms.observe[3].en).toContain('fix (14.22, 4.05) m, error 122.4 cm, GDOP 2.93, ellipse 6.1 × 1.3 cm')
  })

  it('the inspector’s train table is what observe 4 quotes', () => {
    const vs = initViewState(uwbMmsScenario('base'))
    for (const r of recs('base')) applyRecord(vs, r)
    const rows = uwbTrainRows(vs.nodes[TAG].uwb!, STRINGS.en.uwb)
    expect(rows.map((r) => [r.peer, r.kind, r.heard, r.margin, r.detected])).toEqual([
      ['anchor-1', '8 × RSF', '8 / 8', '+1.8 dB', 'detected'],
      ['anchor-2', '8 × RSF', '8 / 8', '+1.8 dB', 'detected'],
      ['anchor-3', '8 × RSF', '8 / 8', '+2.0 dB', 'detected'],
    ])
    expect(uwbTrainRows(vs.nodes[TAG].uwb!, STRINGS.zh.uwb)[0].detected).toBe('检出')
    expect(uwbMms.observe[3].en).toContain('8 × RSF, 8 / 8, +1.8 dB, detected (+2.0 dB for the near anchor)')
  })
})

describe('uwb-mms · 4z for comparison', () => {
  it('"42 timeouts, not one range" in the same room', () => {
    const rs = recs('twr')
    expect(of(rs, 'UWB_RANGE')).toEqual([])
    expect(of(rs, 'UWB_POSITION')).toEqual([])
    const outs = of(rs, 'UWB_TIMEOUT')
    expect(outs).toHaveLength(42)
    const byKind: Record<string, number> = {}
    for (const o of outs) byKind[o.expected] = (byKind[o.expected] ?? 0) + 1
    // every anchor waits for a Poll it never hears; the tag waits out all three response slots
    expect(byKind).toEqual({ uwbPoll: BLOCKS * ANCHORS.length, uwbResp: BLOCKS * ANCHORS.length })
    expect(of(rs, 'UWB_ROUND')).toHaveLength(BLOCKS)
    expect(of(rs, 'UWB_ROUND')[0].slots).toBe(4)
    expect(of(rs, 'UWB_MMS_TRAIN')).toEqual([])
    expect(prose()).toContain('the same room, ordinary SS-TWR — 42 timeouts, not one range')
  })

  it('the tag is the one that polls, and the anchors are the ones left waiting', () => {
    const rs = recs('twr')
    // "the tag's Poll to three anchors" / "The tag's 4z Poll reaches anchor 1 at −110.80 dBm"
    const polls = of(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbPoll')
    expect(polls).toHaveLength(BLOCKS)
    expect(new Set(polls.map((r) => r.node))).toEqual(new Set([TAG]))
    expect(polls[0].frame.dst).toBe('*')
    // so every 'uwbPoll' timeout belongs to an anchor, and every 'uwbResp' one to the tag
    const outs = of(rs, 'UWB_TIMEOUT')
    expect(new Set(outs.filter((o) => o.expected === 'uwbPoll').map((o) => o.node)))
      .toEqual(new Set(ANCHORS))
    expect(new Set(outs.filter((o) => o.expected === 'uwbResp').map((o) => o.node)))
      .toEqual(new Set([TAG]))
    expect(prose()).toContain('the tag’s Poll to three anchors (36 octets, 203.782 µs)')
    expect(prose()).toContain('The tag’s 4z Poll reaches anchor 1 at −110.80 dBm')
    // the room is symmetric, so what anchor 1 hears of the tag is what the tag hears of it:
    // the same −110.80 dBm for a Poll, and the same −100.26 dBm for a fragment
    const atAnchor = trainsAt('base', 'anchor-1')[0]
    expect(atAnchor.rxDbm.toFixed(2)).toBe(firstTrains('base')[0].rxDbm.toFixed(2))
    expect((atAnchor.rxDbm + atAnchor.gainDb).toFixed(2)).toBe('-91.23')
  })
})

describe('uwb-mms · the lines the observe items quote', () => {
  const rs = () => recs('base')
  const txLine = (kind: string, node?: string): string =>
    fmtRecord(of(rs(), 'TX_START').find((r) => r.frame.kind === kind && (node === undefined || r.node === node))!)

  it('observe 1: the round, and the narrowband poll that opens it', () => {
    expect(fmtRecord(of(rs(), 'UWB_ROUND')[0]))
      .toBe('tag-1 UWB round 0 of block 0 (MMS): 28 slots × 500.0 µs')
    expect(txLine('nbPoll')).toBe('tag-1 → anchor-1 NBPOLL 12 B @0.25 Mbps (576.0 µs)')
    for (const q of [
      'tag-1 UWB round 0 of block 0 (MMS): 28 slots × 500.0 µs',
      'tag-1 → anchor-1 NBPOLL 12 B @0.25 Mbps (576.0 µs)',
    ]) {
      expect(uwbMms.observe[0].en, q).toContain(q)
      expect(uwbMms.observe[0].zh, q).toContain(q)
    }
  })

  it('observe 2: the transmit stamp, and the fragment it stamps', () => {
    const tx = of(rs(), 'UWB_TS').find((r) => r.dir === 'tx')!
    expect(fmtRecord(tx)).toBe('tag-1 TX RMARKER → anchor-1 RSF: counter 336330610684')
    expect(tx.t).toBe(2 * MS)
    expect(txLine('uwbRsf')).toBe('tag-1 → anchor-1 UWBRSF 0 B @0 Mbps (82.1 µs)')
    for (const q of [
      'tag-1 TX RMARKER → anchor-1 RSF: counter 336330610684',
      'tag-1 → anchor-1 UWBRSF 0 B @0 Mbps (82.1 µs)',
    ]) {
      expect(uwbMms.observe[1].en, q).toContain(q)
      expect(uwbMms.observe[1].zh, q).toContain(q)
    }
  })

  it('observe 3: the receive stamp with its figure of merit, and when each side rules', () => {
    const rx = of(rs(), 'UWB_TS').find((r) => r.dir === 'rx')!
    expect(fmtRecord(rx))
      .toBe('anchor-1 RX RMARKER ← tag-1 RSF: counter 26504711136 (75 % within 12 ns)')
    expect(rx.t).toBe(9.5 * MS)
    // "The tag rules at 10.000 ms": its own verdict on the anchor's train, one slot later
    expect(trainsAt('base', 'anchor-1')[0].t).toBe(9.5 * MS)
    expect(trainsAt('base', TAG)[0].t).toBe(10 * MS)
    const q = 'anchor-1 RX RMARKER ← tag-1 RSF: counter 26504711136 (75 % within 12 ns)'
    expect(uwbMms.observe[2].en).toContain(q)
    expect(uwbMms.observe[2].zh).toContain(q)
    expect(uwbMms.observe[2].en).toContain('At 9.500 ms')
    expect(uwbMms.observe[2].en).toContain('The tag rules at 10.000 ms')
  })

  it('observe 4: the narrowband report, and the inspector in both languages', () => {
    expect(txLine('nbReport')).toBe('anchor-1 → tag-1 NBREPORT 13 B @0.25 Mbps (608.0 µs)')
    expect(uwbMms.observe[3].en).toContain('anchor-1 → tag-1 NBREPORT 13 B @0.25 Mbps (608.0 µs)')
    expect(uwbMms.observe[3].zh).toContain('anchor-1 → tag-1 NBREPORT 13 B @0.25 Mbps (608.0 µs)')
    // "After seven blocks": the fix the inspector holds at the end of the run is the last of
    // the seven, not the first, which was solved at 42 ms
    const fixes = of(rs(), 'UWB_POSITION')
    expect(fixes).toHaveLength(BLOCKS)
    expect(fixes[0].t).toBe(42 * MS)
    const vs = initViewState(uwbMmsScenario('base'))
    for (const r of rs()) applyRecord(vs, r)
    const u = vs.nodes[TAG].uwb!
    expect(uwbFixRow(u.position!, STRINGS.en.uwb).estimate)
      .toBe(`(${fixes[BLOCKS - 1].x.toFixed(2)}, ${fixes[BLOCKS - 1].y.toFixed(2)}) m`)
    expect(uwbMms.observe[3].en).toContain('After seven blocks the tag’s inspector reads')
    expect(uwbMms.observe[3].zh).toContain('七个块之后打开标签的检视面板')
    // the ZH observe quotes the ZH inspector: the train row's kind, count, margin and verdict
    const zhRows = uwbTrainRows(u, STRINGS.zh.uwb)
    expect(uwbMms.observe[3].zh).toContain(zhRows[0].kind)
    expect(uwbMms.observe[3].zh).toContain(zhRows[0].heard)
    expect(uwbMms.observe[3].zh).toContain(zhRows[0].margin)
    expect(uwbMms.observe[3].zh).toContain(zhRows[0].detected)
    expect(uwbMms.observe[3].zh).toContain(zhRows[2].margin)
    expect(uwbMms.observe[3].zh).toContain(uwbNbChannelText(u, STRINGS.zh.uwb)!)
  })

  it('"one of the seventeen mandatory sets"', () => {
    expect(Object.keys(MMS_SETS)).toHaveLength(17)
    expect(uwbMms.tryThis[1].en).toContain('one of the seventeen mandatory sets')
  })
})

describe('uwb-mms · determinism', () => {
  it('replays bit-for-bit, in all four scenes', () => {
    for (const v of ['base', 'four', 'rsf1', 'twr'] as UwbMmsVariant[]) {
      const again = [...new Simulation(scenarioOf(v)).runUntil(RUN_NS).records]
      expect(again, v).toEqual(recs(v))
    }
  })
})
