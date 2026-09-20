/**
 * Every empirical claim in "The narrowband radio shares 6 GHz too", measured against
 * the lesson's own scene and its three variants. Each assertion quotes the sentence it
 * guards, copied from the shipped string; the channel plan, the listen-before-talk
 * threshold and the two path-loss laws come from the engine's own exports rather than
 * being re-typed here, and every measured figure — busy checks, skipped blocks, ranges,
 * fixes, lost narrowband frames, the Wi-Fi side's failed PPDUs and throughput — is read
 * out of a run over the lesson's 1.3 s window.
 */
import { describe, it, expect } from 'vitest'
import {
  ANCHOR_Z, LAPTOP_POS, NBA_ANCHORS, NBA_CHANNELS, ROUTER_POS, TAG_POS, TAG_Z,
  WIFI_6G_CENTER_MHZ, uwbNba, uwbNbaScenario, type UwbNbaVariant,
} from '../../src/course/uwb/uwb-nba'
import { Simulation } from '../../src/engine/simulation'
import { DEFAULT_UWB_SESSION, ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block, L10n, Lesson } from '../../src/course/lessonKit'
import { LESSON_6G_WIDTH_MHZ, oneRoom } from '../../src/course/lessonKit'
import {
  COURSE_ORDER, MODULES, OBSERVE_MINUTES, TIERS, TRY_MINUTES, lessonMinutes, lessonWords,
} from '../../src/course/curriculum'
import { LESSONS } from '../../src/course/lessons'
import { fmtRecord } from '../../src/ui/format'
import { STRINGS } from '../../src/ui/i18n'
import { applyRecord, initViewState } from '../../src/model/view'
import { uwbLbtText, uwbNbChannelText } from '../../src/uwb/ui/rows'
import {
  NB_CHANNELS, NB_CHANNEL_MHZ, NB_DEFAULT_CHANNELS, NB_LBT_CCA_US, NB_LBT_EDT_DBM_PER_MHZ,
  NB_LBT_THRESHOLD_DBM, NB_POLL_BYTES, NB_REPORT_BYTES, NB_RX_SENS_DBM, NB_TX_DBM, nbBand,
  nbCenterMhz, nbChannelForBlock, nbPl0Db, nbPpduNs,
} from '../../src/uwb/nb'
import { bandOverlapMhz, uwbToWifiPathLossDb, wifiToUwbPathLossDb } from '../../src/engine/spectrum'
import { CCA_ED_DBM } from '../../src/engine/phy'
import { UWB_PL_EXP, UWB_TX_POWER_DBM } from '../../src/uwb/phy'
import { roundPlan } from '../../src/uwb/session'

const MS = 1_000_000
/** Seven whole blocks: block 6 opens at 1.200 s and its four pair rounds are over by
 * 1.256 s, while block 7 would not start until 1.400 s. The lesson's "1.3 seconds". */
const RUN_NS = 1300 * MS
const SEC = RUN_NS / 1e9
const BLOCKS = 7
const TAG = 'uwb-1'
const ANCHORS = NBA_ANCHORS.map((a) => a.id)
const UWB_IDS = new Set([...ANCHORS, TAG])
const NB_KINDS = new Set(['nbPoll', 'nbResp', 'nbReport'])
/** The scenario's seed, which `nbChannelForBlock` hops over the block index. */
const SEED = 7
/** Index into `uwbNba.variants`. */
const V_OUT = 0
const V_HOP = 1
const V_NOLBT = 2

const scenarioOf = (v: UwbNbaVariant): Scenario =>
  v === 'base' ? uwbNba.scenario()
    : uwbNba.variants![v === 'outside' ? V_OUT : v === 'hop' ? V_HOP : V_NOLBT].scenario()

const memo = new Map<string, TLRecord[]>()
const recs = (v: UwbNbaVariant): TLRecord[] => {
  if (!memo.has(v)) memo.set(v, [...new Simulation(scenarioOf(v)).runUntil(RUN_NS).records])
  return memo.get(v)!
}

/** The same Wi-Fi, with the ranging session and its nodes removed — the reference the
 * Wi-Fi-side numbers are read against. */
const noSessionRecs = (): TLRecord[] => {
  if (!memo.has('none')) {
    const { uwb: _s, ...bare } = scenarioOf('base')
    const alone: Scenario = { ...bare, nodes: bare.nodes.filter((n) => n.kind !== 'uwb') }
    expect(alone.uwb).toBeUndefined()
    expect(() => ScenarioSchema.parse(alone)).not.toThrow()
    memo.set('none', [...new Simulation(alone).runUntil(RUN_NS).records])
  }
  return memo.get('none')!
}

const of = <K extends TLRecord['type']>(rs: TLRecord[], type: K): Extract<TLRecord, { type: K }>[] =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type)

const lbt = (v: UwbNbaVariant): Extract<TLRecord, { type: 'UWB_NB_LBT' }>[] => of(recs(v), 'UWB_NB_LBT')
const ranges = (v: UwbNbaVariant): Extract<TLRecord, { type: 'UWB_RANGE' }>[] => of(recs(v), 'UWB_RANGE')
const tagRanges = (v: UwbNbaVariant): Extract<TLRecord, { type: 'UWB_RANGE' }>[] =>
  ranges(v).filter((r) => r.node === TAG)
const fixes = (v: UwbNbaVariant): Extract<TLRecord, { type: 'UWB_POSITION' }>[] => of(recs(v), 'UWB_POSITION')
/** The distinct ranging blocks this node lost to a busy check. */
const skippedBlocks = (v: UwbNbaVariant, node: string): number[] =>
  [...new Set(lbt(v).filter((l) => l.node === node).map((l) => l.block))]

/** Every narrowband PPDU of the run, with the window it occupied the air for. */
const nbFrames = (v: UwbNbaVariant): Extract<TLRecord, { type: 'TX_START' }>[] =>
  of(recs(v), 'TX_START').filter((r) => NB_KINDS.has(r.frame.kind))

/**
 * Times a Wi-Fi radio's clear-channel assessment went busy on **energy alone** while a
 * narrowband frame was on the air and the radio was not itself starting to transmit.
 * `CCA_BUSY` carries only a cause, and 'energy' also covers a radio's own transmission,
 * so both filters are needed; the "Outside the router's channel" run, where no mediator
 * exists at all, is the control that says the count is really the narrowband radio's.
 */
const nbDeferrals = (v: UwbNbaVariant): Extract<TLRecord, { type: 'CCA_BUSY' }>[] => {
  const wins = nbFrames(v).map((f) => [f.t, f.t + f.frame.txTimeNs] as const)
  const ownTx = new Set(of(recs(v), 'TX_START').map((r) => `${r.node}@${r.t}`))
  return of(recs(v), 'CCA_BUSY').filter((c) => c.cause === 'energy' && !UWB_IDS.has(c.node)
    && !ownTx.has(`${c.node}@${c.t}`) && wins.some(([a, b]) => c.t >= a && c.t <= b))
}

/** Wi-Fi PPDUs that failed to decode — the Wi-Fi side's own losses. */
const wifiRxFail = (rs: TLRecord[]): Extract<TLRecord, { type: 'RX_FAIL' }>[] =>
  of(rs, 'RX_FAIL').filter((r) => !UWB_IDS.has(r.node))
/** Narrowband frames a UWB device lost to a Wi-Fi PPDU, with the frame that was lost. */
const nbLosses = (v: UwbNbaVariant): { rx: Extract<TLRecord, { type: 'RX_FAIL' }>; kind: string }[] =>
  of(recs(v), 'RX_FAIL').filter((r) => UWB_IDS.has(r.node)).map((r) => ({
    rx: r,
    kind: of(recs(v), 'TX_START').find((t) => t.node === r.from && t.t <= r.t
      && t.t + t.frame.txTimeNs + 1000 >= r.t)!.frame.kind,
  }))

/** Goodput in Mb/s, MSDU sizes taken from the engine's own ENQUEUE records. */
function mbps(rs: TLRecord[], node: string): number {
  const dropped = new Set(of(rs, 'DROP').map((r) => r.msduId))
  const bytes = new Map(of(rs, 'ENQUEUE').filter((r) => r.node === node).map((r) => [r.msduId, r.bytes]))
  let bits = 0
  for (const r of of(rs, 'DEQUEUE')) {
    if (r.node === node && !dropped.has(r.msduId)) bits += 8 * (bytes.get(r.msduId) ?? 0)
  }
  return bits / SEC / 1e6
}

/** In-band level (dBm) a Wi-Fi transmitter of `eirpDbm` over `widthMhz` puts into one
 * 2.5 MHz narrowband channel `dM` away, under the Wi-Fi link's own law. */
const wifiInNbDbm = (eirpDbm: number, widthMhz: number, dM: number): number =>
  eirpDbm + 10 * Math.log10(NB_CHANNEL_MHZ / widthMhz) - wifiToUwbPathLossDb(dM, 0)

/** The distance at which `wifiInNbDbm` crosses `targetDbm` — a bisection, not a transcription. */
const crossingM = (f: (d: number) => number, targetDbm: number): number => {
  let lo = 0.1
  let hi = 1000
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) >= targetDbm) lo = mid
    else hi = mid
  }
  return lo
}

const dist3 = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const TAG_3D = { x: TAG_POS.x, y: TAG_POS.y, z: TAG_Z }

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
const prose = (): string => lessonProse(uwbNba)

const table = (): Extract<Block, { kind: 'table' }> =>
  uwbNba.body.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[0]
const cell = (row: number, col: number): string => table().rows[row][col].en

describe('uwb-nba · lesson shape', () => {
  it('the scenario and its three variants pass the scenario schema', () => {
    expect(() => ScenarioSchema.parse(uwbNba.scenario())).not.toThrow()
    expect(uwbNba.variants).toHaveLength(3)
    for (const v of uwbNba.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
    expect(uwbNba.variants!.map((v) => v.label.en))
      .toEqual(['Outside the router’s channel', 'Hop over four channels', 'No LBT'])
    expect(uwbNba.variants!.map((v) => v.label.zh))
      .toEqual(['避开路由器的信道', '在四个信道间跳变', '不先听后发'])
  })

  it('the computed study time follows the formula and stays inside the 15–25 minute target', () => {
    const raw = lessonWords(uwbNba) / 150
      + OBSERVE_MINUTES * uwbNba.observe.length + TRY_MINUTES * uwbNba.tryThis.length
    expect(lessonMinutes(uwbNba)).toBe(Math.max(5, Math.round(raw / 5) * 5))
    expect(lessonMinutes(uwbNba)).toBeGreaterThanOrEqual(15)
    expect(lessonMinutes(uwbNba)).toBeLessThanOrEqual(25)
    // the header's word budget: 25 minutes needs at most 1724 words, because 1725 makes raw
    // exactly 27.5 and Math.round(5.5) rounds up
    expect(lessonWords(uwbNba)).toBeLessThanOrEqual(1724)
    const at1725 = 1725 / 150 + OBSERVE_MINUTES * 4 + TRY_MINUTES * 2
    expect(Math.round(at1725 / 5) * 5).toBe(30)
    expect(uwbNba.module).toBe(15)
    expect(uwbNba.id).toBe('uwb-nba')
  })

  it('it offers five jumps, four things to observe, two experiments and three questions', () => {
    expect(uwbNba.jumps).toHaveLength(5)
    expect(uwbNba.observe).toHaveLength(4)
    expect(uwbNba.tryThis).toHaveLength(2)
    expect(uwbNba.quiz).toHaveLength(3)
    for (const q of uwbNba.quiz) expect(q.options[q.answer]).toBeDefined()
  })

  it('every jump target occurs in the base run, in the order the list gives them', () => {
    const rs = recs('base')
    const idx: number[] = []
    for (const j of uwbNba.jumps) {
      const i = rs.findIndex(j.find)
      expect(i, j.label.en).toBeGreaterThanOrEqual(0)
      idx.push(i)
    }
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
    // the POLL opens the round at 0, the anchor judges the tag's train in the slot after its
    // last fragment, the REPORT lands in slot 24, the range follows it, and the tag's own
    // report slot at 13.000 ms is where listen before talk finally stops it
    expect(rs[idx[0]].t).toBe(0)
    expect(rs[idx[1]].t).toBe(9.5 * MS)
    expect(rs[idx[2]].t).toBe(12 * MS)
    expect(rs[idx[3]].t).toBe(12 * MS + nbPpduNs(NB_REPORT_BYTES) + 16)
    expect(rs[idx[4]].t).toBe(13 * MS)
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
      title: uwbNba.title, body: uwbNba.body, observe: uwbNba.observe,
      tryThis: uwbNba.tryThis, quiz: uwbNba.quiz, variants: uwbNba.variants, jumps: uwbNba.jumps,
    })
    expect(seen.length).toBeGreaterThan(40)
    for (const l of seen) {
      expect(l.en.trim().length, l.en).toBeGreaterThan(0)
      expect(l.zh.trim().length, l.en).toBeGreaterThan(0)
      if (/[a-z]{3,}\s+[a-z]{3,}/.test(l.en)) expect(l.zh, l.en).not.toBe(l.en)
    }
  })

  it('opens by saying what is standard, what is draft, what is regulation and what is model', () => {
    const first = uwbNba.body[0]
    expect(first.kind ?? 'p').toBe('p')
    const en = (first as Extract<Block, { kind?: 'p' }>).text.en
    expect(en).toContain('IEEE Std 802.15.4-2024')
    expect(en).toContain('P802.15.4ab')
    expect(en).toContain('D5.0')
    expect(en).toContain('The balloted draft may differ')
    for (const doc of ['15-22/0381r5', '15-23/0100r2']) expect(en, doc).toContain(doc)
    expect(en).toContain('One layer is regulation')
    expect(en).toContain('−75 dBm/MHz threshold')
    expect(en).toContain('the rest is model')
    // the two reconstructions the spec asks to be named once
    expect(en).toContain('the channel-centre formula is reconstructed from the published counts and band edges')
    expect(en).toContain('the block-wise hop uses the simulator’s own string hash where the draft specifies AES-128-CTR')
    const zh = (first as Extract<Block, { kind?: 'p' }>).text.zh
    expect(zh).toContain('P802.15.4ab')
    expect(zh).toContain('D5.0')
    expect(zh).toContain('15-22/0381r5')
    expect(zh).toContain('15-23/0100r2')
    expect(zh).toContain('AES-128-CTR')
  })

  it('is the second lesson of module 15, after uwb-mms, and the last of the course', () => {
    expect(TIERS[6].track).toBe('uwb')
    expect(MODULES[15].tier).toBe(6)
    expect(MODULES[uwbNba.module].tier).toBe(6)
    expect(COURSE_ORDER[COURSE_ORDER.indexOf('uwb-mms') + 1]).toBe('uwb-nba')
    const ids = LESSONS.map((l) => l.id)
    expect(ids[ids.indexOf('uwb-nba') - 1]).toBe('uwb-mms')
    expect(ids[ids.length - 1]).toBe('uwb-nba')
  })
})

describe('uwb-nba · the scene', () => {
  const sc = uwbNbaScenario('base')

  it('is the coexistence lesson’s room: one 10 × 8 m lab, a Wi-Fi 7 router and a saturated laptop', () => {
    expect(sc.rooms).toEqual(oneRoom().rooms)
    expect(sc.walls).toEqual(oneRoom().walls)
    expect(sc.sixGhzCenterMhz).toBe(WIFI_6G_CENTER_MHZ)
    expect(WIFI_6G_CENTER_MHZ).toBe(6305)
    const ap = sc.nodes.find((n) => n.id === 'ap')!
    expect(ap.pos).toEqual({ x: ROUTER_POS.x, y: ROUTER_POS.y, z: ROUTER_POS.z })
    expect(ap.txPowerDbm).toBe(20)
    expect(ap.caps.widthMhz).toBe(LESSON_6G_WIDTH_MHZ)
    expect(LESSON_6G_WIDTH_MHZ).toBe(80)
    const laptop = sc.nodes.find((n) => n.id === 'laptop')!
    expect(laptop.pos).toEqual({ x: LAPTOP_POS.x, y: LAPTOP_POS.y, z: 1.0 })
    expect(laptop.profiles).toEqual(['saturated'])
    expect(laptop.txPowerDbm).toBe(15)
    expect(laptop.linkId).toBe('6g')
    // "802.11ax channel 71, 6265 to 6345 MHz"
    expect([WIFI_6G_CENTER_MHZ - 40, WIFI_6G_CENTER_MHZ + 40]).toEqual([6265, 6345])
    expect(prose()).toContain('802.11ax channel 71, 6265 to 6345 MHz')
  })

  it('places four corner anchors at 2.20 m and the tag 1.50 m from the router', () => {
    expect(sc.nodes.map((n) => n.id)).toEqual(['ap', 'laptop', ...ANCHORS, TAG])
    for (const a of NBA_ANCHORS) {
      const n = sc.nodes.find((x) => x.id === a.id)!
      expect(n.pos, a.id).toEqual({ x: a.x, y: a.y, z: ANCHOR_Z })
      expect(n.uwb, a.id).toEqual({ role: 'anchor' })
    }
    const tag = sc.nodes.find((n) => n.id === TAG)!
    expect(tag.pos).toEqual({ x: TAG_POS.x, y: TAG_POS.y, z: TAG_Z })
    expect(tag.uwb).toEqual({ role: 'tag' })
    expect(ANCHOR_Z).toBe(2.2)
    expect(TAG_Z).toBe(1.0)
    // "The tag stands at (4.00, 3.50, 1.00) and the router at (5.00, 4.00, 2.00):
    //  √(1² + 0.5² + 1²) = 1.50 m apart"
    expect([TAG_POS.x, TAG_POS.y, TAG_Z]).toEqual([4, 3.5, 1.0])
    expect([ROUTER_POS.x, ROUTER_POS.y, ROUTER_POS.z]).toEqual([5, 4, 2.0])
    expect(dist3(TAG_3D, ROUTER_POS)).toBeCloseTo(Math.sqrt(1 + 0.25 + 1), 12)
    expect(dist3(TAG_3D, ROUTER_POS).toFixed(2)).toBe('1.50')
    // "the laptop, 3.35 m away"
    expect(dist3(TAG_3D, { x: LAPTOP_POS.x, y: LAPTOP_POS.y, z: 1.0 }).toFixed(2)).toBe('3.35')
    // "anchor 1 is 4.76 m off"
    expect(dist3(TAG_3D, { x: NBA_ANCHORS[0].x, y: NBA_ANCHORS[0].y, z: ANCHOR_Z }).toFixed(2)).toBe('4.76')
    expect(prose()).toContain('√(1² + 0.5² + 1²) = 1.50 m apart')
    expect(prose()).toContain('anchor 1 is 4.76 m off')
  })

  it('is an MMS session on the draft defaults, UWB channel 9, reporting both ways', () => {
    const u = sc.uwb!
    expect(u.mode).toBe('mms')
    expect(u.method).toBe('ss')
    expect(u.slotRstu).toBe(600)
    expect(u.channel).toBe(9)
    expect(u.aoa).toBe(false)
    expect(u.nlos).toBe(true)
    expect(u.blockRstu).toBe(DEFAULT_UWB_SESSION.blockRstu)
    expect(u.mms).toEqual({ ...DEFAULT_UWB_SESSION.mms, nbChannels: [200], nbLbt: 'auto', report: 'bi' })
    expect(u.mms.rsfs).toBe(8)
    expect(u.mms.report).toBe('bi')
    // the variants move one thing each
    expect(uwbNbaScenario('outside').uwb!.mms).toEqual({ ...u.mms, nbChannels: [100] })
    expect(uwbNbaScenario('hop').uwb!.mms).toEqual({ ...u.mms, nbChannels: [100, 150, 200, 210] })
    expect(uwbNbaScenario('noLbt').uwb!.mms).toEqual({ ...u.mms, nbLbt: 'off' })
    expect(NBA_CHANNELS).toEqual({ base: [200], outside: [100], hop: [100, 150, 200, 210], noLbt: [200] })
    for (const v of ['base', 'outside', 'hop', 'noLbt'] as UwbNbaVariant[]) {
      expect(JSON.stringify(uwbNbaScenario(v).nodes), v).toBe(JSON.stringify(sc.nodes))
    }
  })

  it('"28 slots × 500 µs", four pair rounds of a 200 ms block, seven whole blocks in the window', () => {
    const plan = roundPlan(sc.uwb!, ANCHORS.length)
    expect(plan.slots).toBe(28)
    expect(plan.roundNs).toBe(14 * MS)
    expect(plan.blockNs).toBe(200 * MS)
    // four anchors, one round each: the last of block 6 ends at 1.256 s, inside the window
    expect(6 * plan.blockNs + ANCHORS.length * plan.roundNs).toBeLessThan(RUN_NS)
    expect(7 * plan.blockNs).toBeGreaterThan(RUN_NS)
    const rounds = of(recs('outside'), 'UWB_ROUND')
    expect(rounds).toHaveLength(BLOCKS * ANCHORS.length)
    expect([...new Set(rounds.map((r) => r.block))]).toEqual([0, 1, 2, 3, 4, 5, 6])
    for (const r of rounds) expect(r.mode).toBe('mms')
  })
})

describe('uwb-nba · the channel plan', () => {
  it('"250 channels 2.5 MHz wide: 50 in UNII-3 from 5726.25 MHz up, and 200 in UNII-5 … from 5926.25 MHz up"', () => {
    expect(NB_CHANNELS).toBe(250)
    expect(NB_CHANNEL_MHZ).toBe(2.5)
    expect(nbCenterMhz(0)).toBe(5726.25)
    expect(nbCenterMhz(49)).toBe(5848.75)
    expect(nbCenterMhz(50)).toBe(5926.25)
    expect(nbCenterMhz(249)).toBe(6423.75)
    // "One 20 MHz Wi-Fi channel covers eight of them"
    expect(20 / NB_CHANNEL_MHZ).toBe(8)
    expect(prose()).toContain('250 channels 2.5 MHz wide: 50 in UNII-3 from 5726.25 MHz up, and 200 in UNII-5')
    expect(prose()).toContain('One 20 MHz Wi-Fi channel covers eight of them')
  })

  it('"wholly contains thirty-two, numbers 186 to 217", and 200 is 6301.25 MHz', () => {
    const lo = WIFI_6G_CENTER_MHZ - LESSON_6G_WIDTH_MHZ / 2
    const hi = WIFI_6G_CENTER_MHZ + LESSON_6G_WIDTH_MHZ / 2
    const inside: number[] = []
    for (let n = 0; n < NB_CHANNELS; n++) {
      const b = nbBand(n)
      if (b.lo >= lo && b.hi <= hi) inside.push(n)
    }
    expect(inside).toHaveLength(32)
    expect([inside[0], inside[inside.length - 1]]).toEqual([186, 217])
    expect(inside).toContain(200)
    expect(inside).toContain(210)
    expect(prose()).toContain('wholly contains thirty-two, numbers 186 to 217')
  })

  it('the four channels the lesson uses, and which of them lie inside 6265–6345 MHz', () => {
    const lo = WIFI_6G_CENTER_MHZ - LESSON_6G_WIDTH_MHZ / 2
    const hi = WIFI_6G_CENTER_MHZ + LESSON_6G_WIDTH_MHZ / 2
    const centres = [100, 150, 200, 210].map((n) => nbCenterMhz(n))
    expect(centres).toEqual([6051.25, 6176.25, 6301.25, 6326.25])
    const overlaps = [100, 150, 200, 210].map((n) => {
      const b = nbBand(n)
      return bandOverlapMhz(b.lo, b.hi, lo, hi) > 0
    })
    expect(overlaps).toEqual([false, false, true, true])
    // "Channel 100 would be 6051.25 MHz, with 212.5 MHz of empty spectrum between its upper
    //  edge and the router’s lower one"
    expect(lo - nbBand(100).hi).toBe(212.5)
    expect(prose()).toContain('The session’s control channel is 200, at 6301.25 MHz')
    expect(prose()).toContain('Channel 100 would be 6051.25 MHz, with 212.5 MHz of empty spectrum')
    expect(prose()).toContain('6326.25 MHz is inside too')
    expect(cell(0, 1)).toBe('200 · 6301.25 MHz')
    expect(cell(1, 1)).toBe('100 · 6051.25 MHz')
    expect(cell(2, 1)).toBe('100 / 150 / 200 / 210')
    expect(cell(3, 1)).toBe('200 · 6301.25 MHz')
    // and the run agrees: every POLL of the base scene names channel 200 at 6301.25 MHz
    for (const f of nbFrames('base')) {
      expect(f.frame.uwb?.nb?.channel).toBe(200)
      expect(f.frame.uwb?.nb?.centerMhz).toBe(6301.25)
    }
  })

  it('"the draft’s default allow list [3] — 5733.75 MHz, in UNII-3"', () => {
    expect(NB_DEFAULT_CHANNELS).toEqual([3])
    expect(nbCenterMhz(3)).toBe(5733.75)
    expect(nbCenterMhz(3)).toBeLessThan(5850)
    expect(prose()).toContain('the draft’s default allow list [3] — 5733.75 MHz, in UNII-3')
  })
})

describe('uwb-nba · the listen-before-talk threshold', () => {
  it('"−75 dBm/MHz + 10·log10(2.5 MHz) = −71.02 dBm", and the 9 µs assessment', () => {
    expect(NB_LBT_EDT_DBM_PER_MHZ).toBe(-75)
    expect(NB_LBT_CCA_US).toBe(9)
    expect(NB_LBT_THRESHOLD_DBM).toBeCloseTo(-75 + 10 * Math.log10(2.5), 12)
    expect(NB_LBT_THRESHOLD_DBM.toFixed(2)).toBe('-71.02')
    const formula = uwbNba.body.find((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')!
    expect(formula.text.en).toContain('threshold = −75 dBm/MHz + 10·log10(2.5 MHz) = −71.02 dBm')
    expect(formula.note!.en).toContain('at least 9 µs')
    // every busy record the run emits carries that same threshold
    for (const l of lbt('base')) expect(l.thresholdDbm).toBe(NB_LBT_THRESHOLD_DBM)
  })

  it('"20 + 10·log10(2.5 / 80) = 4.95 dBm … d = 8.62 m" — arithmetic, labelled as such', () => {
    const inBand = 20 + 10 * Math.log10(NB_CHANNEL_MHZ / LESSON_6G_WIDTH_MHZ)
    expect(inBand.toFixed(2)).toBe('4.95')
    const d = crossingM((m) => wifiInNbDbm(20, LESSON_6G_WIDTH_MHZ, m), NB_LBT_THRESHOLD_DBM)
    expect(d.toFixed(2)).toBe('8.62')
    const formula = uwbNba.body.find((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')!
    expect(formula.text.en).toContain('20 + 10·log10(2.5 / 80) = 4.95 dBm')
    expect(formula.text.en).toContain('4.95 − (46.7 + 30·log10 d + 1.2) = −71.02  →  d = 8.62 m')
    expect(formula.note!.en).toContain('The three lines are arithmetic, not a measurement')
    // the Wi-Fi law the lesson prints is the engine's own
    expect(wifiToUwbPathLossDb(1, 0)).toBeCloseTo(46.7 + 1.2, 12)
    expect(wifiToUwbPathLossDb(10, 0) - wifiToUwbPathLossDb(1, 0)).toBeCloseTo(30, 12)
  })

  it('at 1.50 m the check only asks whether anyone is transmitting: −48.23 / −42.21 / −63.72 dBm', () => {
    const dRouter = dist3(TAG_3D, ROUTER_POS)
    const dLaptop = dist3(TAG_3D, { x: LAPTOP_POS.x, y: LAPTOP_POS.y, z: 1.0 })
    expect(wifiInNbDbm(20, 80, dRouter).toFixed(2)).toBe('-48.23')
    expect(wifiInNbDbm(20, 20, dRouter).toFixed(2)).toBe('-42.21')
    expect(wifiInNbDbm(15, 80, dLaptop).toFixed(2)).toBe('-63.72')
    // "22.8 dB over the threshold" and "still 7.3 dB over"
    expect((wifiInNbDbm(20, 80, dRouter) - NB_LBT_THRESHOLD_DBM).toFixed(1)).toBe('22.8')
    expect((wifiInNbDbm(15, 80, dLaptop) - NB_LBT_THRESHOLD_DBM).toFixed(1)).toBe('7.3')
    expect(dRouter).toBeLessThan(8.62)
    expect(prose()).toContain('An 80 MHz PPDU from the router reads −48.23 dBm there, 22.8 dB over the threshold')
    expect(prose()).toContain('the router’s 20 MHz control frames read −42.21 dBm')
    expect(prose()).toContain('the laptop, 3.35 m away at 15 dBm, reads −63.72, still 7.3 dB over')
    // and the tag's own busy checks read exactly the laptop's 80 MHz PPDU
    const tagChecks = lbt('base').filter((l) => l.node === TAG)
    expect(tagChecks.length).toBeGreaterThan(0)
    for (const l of tagChecks) expect(l.foreignDbm.toFixed(2)).toBe('-63.72')
  })
})

describe('uwb-nba · the base scene, inside the router’s channel', () => {
  it('"seven blocks, seven busy checks, seven skipped" — and two anchors in block 3', () => {
    expect(lbt('base')).toHaveLength(9)
    expect(skippedBlocks('base', TAG)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(skippedBlocks('base', TAG)).toHaveLength(BLOCKS)
    expect(lbt('base').filter((l) => l.node === TAG)).toHaveLength(BLOCKS)
    expect(skippedBlocks('base', 'anchor-1')).toEqual([3])
    expect(skippedBlocks('base', 'anchor-2')).toEqual([3])
    expect(skippedBlocks('base', 'anchor-3')).toEqual([])
    expect(skippedBlocks('base', 'anchor-4')).toEqual([])
    expect(cell(0, 2)).toBe('7 of 7')
    expect(prose()).toContain('Seven blocks, seven busy checks, seven skipped')
    expect(prose()).toContain('Anchors 1 and 2 each have a busy check too, both in block 3')
  })

  it('"the anchor’s REPORT at 12.000 ms gives the tag the only range of the run"', () => {
    expect(tagRanges('base')).toHaveLength(1)
    expect(ranges('base')).toHaveLength(1)
    expect(fixes('base')).toHaveLength(0)
    const r = tagRanges('base')[0]
    expect([r.peer, r.block, r.method]).toEqual(['anchor-1', 0, 'ss'])
    expect(fmtRecord(r)).toBe('uwb-1 range → anchor-1 (SS): 4.74 m (true 4.76 m, raw 7.51 m)')
    expect(r.t).toBe(12 * MS + nbPpduNs(NB_REPORT_BYTES) + 16)
    expect((r.t / MS).toFixed(3)).toBe('12.608')
    expect(of(recs('base'), 'UWB_TIMEOUT')).toHaveLength(29)
    expect([cell(0, 3), cell(0, 4)]).toEqual(['1', '0'])
    expect(uwbNba.observe[3].en).toContain('“uwb-1 range → anchor-1 (SS): 4.74 m (true 4.76 m, raw 7.51 m)” at 12.608 ms')
    expect(uwbNba.observe[3].en).toContain('against 29 timeouts')
  })

  it('the block-0 story the lesson tells, line by line', () => {
    const at = (t: number, pred: (r: TLRecord) => boolean): TLRecord =>
      recs('base').find((r) => r.t === t && pred(r))!
    const txKind = (k: string) => (r: TLRecord): boolean => r.type === 'TX_START' && r.frame.kind === k
    // "At t = 0 the channel happens to be clear: POLL, RESP at 1.000 ms"
    expect(fmtRecord(at(0, txKind('nbPoll')))).toBe('uwb-1 → anchor-1 NBPOLL 12 B @0.25 Mbps (576.0 µs)')
    expect(at(1 * MS, txKind('nbResp'))).toBeDefined()
    expect(nbPpduNs(NB_POLL_BYTES)).toBe(576_000)
    expect(nbPpduNs(NB_REPORT_BYTES)).toBe(608_000)
    // "eight fragments each way at 34.5 dB of margin"
    const train = of(recs('base'), 'UWB_MMS_TRAIN')[0]
    expect([train.heard, train.fragments, train.detected]).toEqual([8, 8, true])
    expect(train.marginDb.toFixed(1)).toBe('34.5')
    // "the anchor’s REPORT at 12.000 ms"
    expect(fmtRecord(at(12 * MS, txKind('nbReport'))))
      .toBe('anchor-1 → uwb-1 NBREPORT 13 B @0.25 Mbps (608.0 µs)')
    // "Then at 13.000 ms the tag’s own report slot finds the channel busy"
    const busy = lbt('base')[0]
    expect(busy.t).toBe(13 * MS)
    expect(busy.node).toBe(TAG)
    expect(busy.block).toBe(0)
    expect(fmtRecord(busy))
      .toBe('uwb-1 NB LBT busy on ch 200: -63.7 dBm ≥ -71.0 — skipping the block')
    expect(uwbNba.observe[1].en)
      .toContain('“uwb-1 NB LBT busy on ch 200: -63.7 dBm ≥ -71.0 — skipping the block”')
    // "its other three pair rounds never start": the anchors say so
    const to = of(recs('base'), 'UWB_TIMEOUT')
    expect(fmtRecord(to.find((r) => r.t === 14 * MS)!))
      .toBe('anchor-1 UWB slot 26: no nb-report from uwb-1')
    expect(fmtRecord(to.find((r) => r.t === 15 * MS)!))
      .toBe('anchor-2 UWB slot 0: no nb-poll from uwb-1')
    expect(uwbNba.observe[1].en).toContain('“anchor-1 UWB slot 26: no nb-report from uwb-1” at 14.000 ms')
    expect(uwbNba.observe[1].en).toContain('“anchor-2 UWB slot 0: no nb-poll from uwb-1” at 15.000 ms')
    expect(nbFrames('base')).toHaveLength(6)
  })

  it('the tag’s inspector: "200 · 6301.25 MHz" and "7 busy · 7 blocks skipped", EN and ZH', () => {
    const vs = initViewState(scenarioOf('base'))
    for (const r of recs('base')) applyRecord(vs, r)
    const u = vs.nodes[TAG].uwb!
    expect(uwbNbChannelText(u, STRINGS.en.uwb)).toBe('200 · 6301.25 MHz')
    expect(uwbNbChannelText(u, STRINGS.zh.uwb)).toBe('200 · 6301.25 MHz')
    expect(u.mms.lbtBusy).toBe(7)
    expect(u.mms.skippedBlocks).toBe(7)
    expect(uwbLbtText(u, STRINGS.en.uwb)).toBe('7 busy · 7 blocks skipped')
    expect(uwbLbtText(u, STRINGS.zh.uwb)).toBe('7 次忙 · 跳过 7 个块')
    expect(STRINGS.en.uwb.lbtBusy).toBe('listen before talk')
    expect(STRINGS.zh.uwb.lbtBusy).toBe('先听后发')
    expect(uwbNba.observe[2].en).toContain('“200 · 6301.25 MHz”')
    expect(uwbNba.observe[2].en).toContain('“7 busy · 7 blocks skipped”')
    expect(uwbNba.observe[2].zh).toContain('“7 次忙 · 跳过 7 个块”')
    // "Its two train rows are untouched: 8 / 8 heard, +34.5 and +32.0 dB, detected"
    expect(Object.keys(u.mms.trains)).toEqual(['anchor-1', 'anchor-2'])
    for (const t of Object.values(u.mms.trains)) {
      expect(`${t.heard} / ${t.fragments}`).toBe('8 / 8')
      expect(t.detected).toBe(true)
    }
    expect(Object.values(u.mms.trains).map((t) => t.marginDb.toFixed(1))).toEqual(['34.5', '32.0'])
    expect(uwbNba.observe[2].en).toContain('8 / 8 heard, +34.5 and +32.0 dB, detected')
  })
})

describe('uwb-nba · outside the router’s channel', () => {
  it('"not one busy check, 28 ranges, and a fix in all seven blocks on four anchors"', () => {
    expect(lbt('outside')).toHaveLength(0)
    expect(tagRanges('outside')).toHaveLength(BLOCKS * ANCHORS.length)
    expect(tagRanges('outside')).toHaveLength(28)
    for (const a of ANCHORS) expect(ranges('outside').filter((r) => r.node === a), a).toHaveLength(BLOCKS)
    expect(ranges('outside')).toHaveLength(28 + BLOCKS * ANCHORS.length)
    expect(fixes('outside')).toHaveLength(BLOCKS)
    for (const f of fixes('outside')) expect(f.anchors).toHaveLength(4)
    expect(of(recs('outside'), 'UWB_TIMEOUT')).toHaveLength(0)
    expect(fmtRecord(fixes('outside')[0]))
      .toBe('uwb-1 position (3.99, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.05, 4 anchors')
    expect(uwbNba.tryThis[0].en).toContain('not one busy check, 28 ranges, and a fix in all seven blocks on four anchors')
    expect(uwbNba.tryThis[0].en)
      .toContain('“uwb-1 position (3.99, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.05, 4 anchors”')
    expect([cell(1, 2), cell(1, 3), cell(1, 4)]).toEqual(['0', '28', '7'])
  })

  it('"identical to a run with no ranging session: 407.215 Mb/s, not one failed PPDU"', () => {
    expect(mbps(recs('outside'), 'laptop#6g').toFixed(3)).toBe('407.215')
    expect(mbps(noSessionRecs(), 'laptop#6g').toFixed(3)).toBe('407.215')
    expect(wifiRxFail(recs('outside'))).toHaveLength(0)
    expect(wifiRxFail(noSessionRecs())).toHaveLength(0)
    expect(nbDeferrals('outside')).toHaveLength(0)
    // and it is a whole-record identity, not just a throughput one
    const wifiSide = (rs: TLRecord[]): string => JSON.stringify(
      rs.filter((r) => !UWB_IDS.has((r as { node?: string }).node ?? ''))
        .map((r) => ({ ...r, seq: 0 })),
    )
    expect(wifiSide(recs('outside'))).toBe(wifiSide(noSessionRecs()))
    expect(uwbNba.tryThis[0].en)
      .toContain('The Wi-Fi side is identical to a run with no ranging session: 407.215 Mb/s, not one failed PPDU')
  })
})

describe('uwb-nba · hopping over four channels', () => {
  it('the block → channel map, replayed from nbChannelForBlock and read off the frames', () => {
    const list = NBA_CHANNELS.hop
    const replay = [0, 1, 2, 3, 4, 5, 6].map((b) => nbChannelForBlock(list, SEED, b))
    expect(replay).toEqual([100, 210, 200, 150, 100, 210, 200])
    expect(scenarioOf('hop').seed).toBe(SEED)
    // what the run actually used: every narrowband frame of a block names the block's channel
    const used = new Map<number, number>()
    for (const f of nbFrames('hop')) used.set(f.frame.uwb!.block!, f.frame.uwb!.nb!.channel)
    for (const l of lbt('hop')) used.set(l.block, l.channel)
    expect([...used.keys()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect([0, 1, 2, 3, 4, 5, 6].map((b) => used.get(b))).toEqual(replay)
    expect(prose()).toContain('giving 100, 210, 200, 150, 100, 210, 200 over the run')
    expect(uwbNba.quiz[1].options[1].en)
      .toContain('list[hash(“7:b”) mod 4] gives 100, 210, 200, 150, 100, 210, 200')
  })

  it('"blocks 0, 3 and 4 land outside and give three fixes; the other four are skipped"', () => {
    expect(skippedBlocks('hop', TAG)).toEqual([1, 2, 5, 6])
    expect(lbt('hop')).toHaveLength(4)
    for (const l of lbt('hop')) expect(l.node).toBe(TAG)
    expect(fixes('hop').map((f) => f.block)).toEqual([0, 3, 4])
    expect(fixes('hop')).toHaveLength(3)
    for (const f of fixes('hop')) expect(f.anchors).toHaveLength(4)
    // "though block 5 gets one range out before its report slot is stopped"
    expect(tagRanges('hop')).toHaveLength(13)
    const perBlock: Record<number, number> = {}
    for (const r of tagRanges('hop')) perBlock[r.block] = (perBlock[r.block] ?? 0) + 1
    expect(perBlock).toEqual({ 0: 4, 3: 4, 4: 4, 5: 1 })
    expect([cell(2, 2), cell(2, 3), cell(2, 4)]).toEqual(['4 of 7', '13', '3'])
    expect(prose()).toContain('though block 5 gets one range out before its report slot is stopped')
    expect(prose()).toContain('Three fixes instead of seven')
  })
})

describe('uwb-nba · with listen before talk switched off', () => {
  it('"21 ranges and 5 fixes", and no busy check at all', () => {
    expect(lbt('noLbt')).toHaveLength(0)
    expect(tagRanges('noLbt')).toHaveLength(21)
    expect(fixes('noLbt')).toHaveLength(5)
    expect(fixes('noLbt').map((f) => f.block)).toEqual([1, 2, 3, 4, 5])
    expect(nbFrames('noLbt')).toHaveLength(108)
    expect([cell(3, 2), cell(3, 3), cell(3, 4)]).toEqual(['0', '21', '5'])
    expect(uwbNba.tryThis[1].en).toContain('21 ranges and 5 fixes')
    expect(uwbNba.quiz[2].q.en).toContain('the session gets 21 ranges instead of 1')
  })

  it('"Seven narrowband frames die at the tag, five REPORTs and two RESPs"', () => {
    const lost = nbLosses('noLbt')
    expect(lost).toHaveLength(7)
    for (const l of lost) {
      expect(l.rx.node).toBe(TAG)
      expect(l.rx.reason).toBe('lowSinr')
      expect(NB_KINDS.has(l.kind), l.kind).toBe(true)
    }
    expect(lost.filter((l) => l.kind === 'nbReport')).toHaveLength(5)
    expect(lost.filter((l) => l.kind === 'nbResp')).toHaveLength(2)
    // one UWB_INTERFERED per loss, all of them the router's 20 MHz control frame at 1.50 m
    const interfered = of(recs('noLbt'), 'UWB_INTERFERED')
    expect(interfered).toHaveLength(7)
    for (const i of interfered) {
      expect(i.node).toBe(TAG)
      expect(ANCHORS).toContain(i.from)
      expect(i.foreignDbm.toFixed(2)).toBe('-42.21')
      expect(i.sirDb).toBeLessThan(0)
    }
    expect(interfered[0].foreignDbm.toFixed(2))
      .toBe(wifiInNbDbm(20, 20, dist3(TAG_3D, ROUTER_POS)).toFixed(2))
    expect(fmtRecord(interfered[0]))
      .toBe('uwb-1 UWB frame from anchor-3 lost to Wi-Fi: SIR -10.9 dB (foreign -42.2 dBm)')
    expect(uwbNba.tryThis[1].en).toContain('five REPORTs and two RESPs')
    expect(uwbNba.tryThis[1].en)
      .toContain('the first “uwb-1 UWB frame from anchor-3 lost to Wi-Fi: SIR -10.9 dB (foreign -42.2 dBm)”')
    expect(uwbNba.tryThis[1].en).toContain('the router’s own 20 MHz control frame, 1.50 m away')
    // an NB frame is lost as soon as foreign power reaches its own: no margin to spend
    expect(NB_RX_SENS_DBM).toBe(-100)
  })

  it('"87 failed PPDUs and 10.95 % of the laptop’s throughput: 362.631 Mb/s against 407.215"', () => {
    const with_ = mbps(recs('noLbt'), 'laptop#6g')
    const without = mbps(recs('outside'), 'laptop#6g')
    expect(with_.toFixed(3)).toBe('362.631')
    expect(without.toFixed(3)).toBe('407.215')
    expect(((without - with_) / without * 100).toFixed(2)).toBe('10.95')
    expect(wifiRxFail(recs('noLbt'))).toHaveLength(87)
    expect(wifiRxFail(recs('outside'))).toHaveLength(0)
    expect(prose()).toContain('362.631')
    expect(prose()).toContain('a loss of 10.95 %')
    expect(uwbNba.quiz[2].options[1].en)
      .toBe('87 failed PPDUs and 10.95 % of the laptop’s throughput: 362.631 Mb/s against 407.215')
  })

  it('"44 times in 1.3 seconds one goes clear-channel busy" on a narrowband frame alone', () => {
    expect(nbDeferrals('noLbt')).toHaveLength(44)
    // shared between the two Wi-Fi radios, and the "outside" run is the control at zero
    const byNode: Record<string, number> = {}
    for (const c of nbDeferrals('noLbt')) byNode[c.node] = (byNode[c.node] ?? 0) + 1
    expect(byNode).toEqual({ 'ap#6g': 23, 'laptop#6g': 21 })
    expect(nbDeferrals('outside')).toHaveLength(0)
    expect(nbDeferrals('base')).toHaveLength(7)
    expect(nbDeferrals('hop')).toHaveLength(1)
    expect(prose()).toContain('44 times in 1.3 seconds one goes clear-channel busy')
    expect(prose()).toContain('a 576 µs POLL or a 608 µs REPORT')
  })

  it('"with the rule on, six reach the air … and five Wi-Fi PPDUs fail behind them"', () => {
    expect(nbFrames('base')).toHaveLength(6)
    expect(wifiRxFail(recs('base'))).toHaveLength(5)
    expect(nbFrames('noLbt')).toHaveLength(108)
    expect(wifiRxFail(recs('noLbt'))).toHaveLength(87)
    // every one of the base run's five failures happened while a narrowband frame was on the air
    const wins = nbFrames('base').map((f) => [f.t, f.t + f.frame.txTimeNs] as const)
    for (const f of wifiRxFail(recs('base'))) {
      expect(wins.some(([a, b]) => f.t >= a && f.t <= b), String(f.t)).toBe(true)
    }
    expect(prose()).toContain('With the rule on, six reach the air in 1.3 seconds and five Wi-Fi PPDUs fail behind them')
    expect(prose()).toContain('with it off, 108 reach the air and 87 fail')
  })
})

describe('uwb-nba · what the narrowband radio is heard at', () => {
  it('"10 − 48.44 − 20·log10 d = −62 puts the radius at 15.07 m"', () => {
    expect(NB_TX_DBM).toBe(10)
    expect(CCA_ED_DBM).toBe(-62)
    expect(nbPl0Db(200).toFixed(2)).toBe('48.44')
    const radius = crossingM((d) => NB_TX_DBM - nbPl0Db(200) - 20 * Math.log10(d), CCA_ED_DBM)
    expect(radius.toFixed(2)).toBe('15.07')
    // "more than the room is long"
    expect(radius).toBeGreaterThan(oneRoom().rooms[0].w)
    expect(prose()).toContain('10 − 48.44 − 20·log10 d = −62 puts the radius at 15.07 m')
    expect(uwbNba.quiz[2].explain.en).toContain('reaches −62 dBm at 15.07 m')
  })

  it('"a ranging frame’s −14 dBm … only trips … energy detection within about 40 cm"', () => {
    // the coexistence lesson's own number, recomputed here from the same two laws
    const inBand = UWB_TX_POWER_DBM + 10 * Math.log10(LESSON_6G_WIDTH_MHZ / 499.2)
    const radius = crossingM((d) => inBand - uwbToWifiPathLossDb(d, 0, 5), CCA_ED_DBM)
    expect(UWB_TX_POWER_DBM).toBe(-14)
    expect(UWB_PL_EXP).toBe(2)
    expect(radius).toBeGreaterThan(0.35)
    expect(radius).toBeLessThan(0.45)
    expect(prose()).toContain('only trips Wi-Fi’s −62 dBm energy detection within about 40 cm')
  })
})
