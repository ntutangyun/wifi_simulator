import { describe, it, expect } from 'vitest'
import {
  DEFAULT_UWB_MMS, DEFAULT_UWB_SESSION, ScenarioSchema, nonht, sixGhzChannelNo,
  type NodeCfg, type Scenario, type UwbMmsCfg, type UwbSessionCfg,
} from '../../src/model/scenario'
import { LESSONS } from '../../src/course/lessons'
import { N_MSR_SET, RIF_COUNT_SET, RSF_COUNT_SET, STS_LEN_SET } from '../../src/uwb/mms'
import { EventQueue } from '../../src/engine/events'
import { Rng } from '../../src/engine/rng'
import { makeEmitter } from '../../src/model/records'
import { UwbNetwork } from '../../src/uwb/network'
import {
  rstuNs, UWB_BLINK_BYTES, UWB_MAX_ANCHORS, uwbDlPollBytes, uwbFinalBytes, uwbLongestFrameBytes, uwbNbSlotFitNs,
  uwbPollBytes, uwbRespBytes, uwbSlotFitNs, uwbSlotsPerTag,
} from '../../src/uwb/phy'

function uwbNode(id: string, role: 'anchor' | 'tag', x: number, y: number): NodeCfg {
  return {
    id, kind: 'uwb', name: id, pos: { x, y, z: 1 }, txPowerDbm: -14,
    profiles: ['idle'], caps: { ...nonht }, uwb: { role },
  }
}

function sta(id: string): NodeCfg {
  return {
    id, kind: 'sta', name: id, pos: { x: 1, y: 1, z: 1 }, txPowerDbm: 15,
    profiles: ['idle'], caps: { ...nonht },
  }
}

function uwbScenario(nodes: NodeCfg[], uwb: UwbSessionCfg = DEFAULT_UWB_SESSION): Scenario {
  return {
    rooms: [{ x: 0, y: 0, w: 10, h: 8, name: 'Hall' }],
    walls: [],
    nodes,
    servers: [],
    seed: 7,
    rtsThresholdBytes: 3000,
    snapshotIntervalMs: 10,
    uwb,
  }
}

/** The ranging engine on its own, which re-checks the schema's two slot rules in nanoseconds. */
function network(nodes: NodeCfg[], uwb: UwbSessionCfg = DEFAULT_UWB_SESSION): UwbNetwork {
  const q = new EventQueue()
  return new UwbNetwork(q, () => 0, nodes, [], uwb, new Rng(7), makeEmitter(() => {}))
}

const twoAnchorsOneTag = (): NodeCfg[] => [
  uwbNode('anc-1', 'anchor', 0, 0),
  uwbNode('anc-2', 'anchor', 8, 0),
  uwbNode('tag-1', 'tag', 4, 4),
]

describe('UWB nodes and sessions in the schema', () => {
  it('a UWB-only scenario needs no AP', () => {
    expect(() => ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag()))).not.toThrow()
  })

  it('still demands exactly one AP as soon as a Wi-Fi station is present', () => {
    const sc = uwbScenario([...twoAnchorsOneTag(), sta('sta-1')])
    expect(() => ScenarioSchema.parse(sc)).toThrow(/exactly one AP/)
  })

  it('a UWB node must carry UWB settings', () => {
    const nodes = twoAnchorsOneTag()
    delete nodes[2].uwb
    expect(() => ScenarioSchema.parse(uwbScenario(nodes))).toThrow(/UWB node needs/)
  })

  it('a station must not carry UWB settings', () => {
    const wifi = sta('sta-1')
    wifi.uwb = { role: 'tag' }
    const sc = uwbScenario([...twoAnchorsOneTag(), wifi])
    expect(() => ScenarioSchema.parse(sc)).toThrow(/only a UWB node/)
  })

  it('UWB nodes need a session block on the scenario', () => {
    const sc = uwbScenario(twoAnchorsOneTag())
    delete sc.uwb
    expect(() => ScenarioSchema.parse(sc)).toThrow(/UWB session/)
  })

  it('a session needs at least one anchor and one tag', () => {
    const onlyAnchors = [uwbNode('anc-1', 'anchor', 0, 0), uwbNode('anc-2', 'anchor', 8, 0)]
    expect(() => ScenarioSchema.parse(uwbScenario(onlyAnchors))).toThrow(/anchor and .*tag/)
    const onlyTags = [uwbNode('tag-1', 'tag', 0, 0)]
    expect(() => ScenarioSchema.parse(uwbScenario(onlyTags))).toThrow(/anchor and .*tag/)
  })

  it('the ranging slot must be a whole number of 3-RSTU units', () => {
    const bad = uwbScenario(twoAnchorsOneTag(), { ...DEFAULT_UWB_SESSION, slotRstu: 2401 })
    expect(() => ScenarioSchema.parse(bad)).toThrow(/multiple of 3 RSTU/)
    const good = uwbScenario(twoAnchorsOneTag(), { ...DEFAULT_UWB_SESSION, slotRstu: 2400 })
    expect(() => ScenarioSchema.parse(good)).not.toThrow()
  })

  it('the block must fit every tag: DS-TWR with 4 anchors is 10 slots per tag', () => {
    // 10 slots × 2400 RSTU = 24 000 RSTU (20 ms); a 240 000 RSTU (200 ms) block fits 10 tags.
    const anchors = [0, 1, 2, 3].map((i) => uwbNode(`anc-${i}`, 'anchor', i * 3, 0))
    const tags = (n: number) => Array.from({ length: n }, (_, i) => uwbNode(`tag-${i}`, 'tag', i, 4))
    expect(() => ScenarioSchema.parse(uwbScenario([...anchors, ...tags(10)]))).not.toThrow()
    expect(() => ScenarioSchema.parse(uwbScenario([...anchors, ...tags(11)]))).toThrow(/fits 10 tags/)
  })

  it('every frame must fit its slot: 300 RSTU carries five anchors, not six', () => {
    // The Final is the round's longest frame: 14 + 12N octets, 248.910 µs at five anchors and
    // 267.372 µs at six, plus 200 ns of flight guard, against a 300 RSTU slot of 250 µs.
    expect(uwbSlotFitNs(5)).toBe(249_110)
    expect(uwbSlotFitNs(6)).toBe(267_572)
    expect(rstuNs(300)).toBe(250_000)
    const shortSlot = { ...DEFAULT_UWB_SESSION, slotRstu: 300 }
    const anchors = (n: number) => Array.from({ length: n }, (_, i) => uwbNode(`anc-${i}`, 'anchor', i * 2, 0))
    const tag = uwbNode('tag-1', 'tag', 4, 4)
    expect(() => ScenarioSchema.parse(uwbScenario([...anchors(5), tag], shortSlot))).not.toThrow()
    expect(() => ScenarioSchema.parse(uwbScenario([...anchors(6), tag], shortSlot)))
      .toThrow(/300 RSTU ranging slot is 250.0 µs.*needs 267.6 µs/)
    // and the engine refuses the same round in nanoseconds, so the two cannot drift apart
    expect(() => network([...anchors(6), tag], shortSlot)).toThrow(/cannot carry a round of 6 anchors/)
    expect(rstuNs(DEFAULT_UWB_SESSION.slotRstu)).toBeGreaterThan(uwbSlotFitNs(UWB_MAX_ANCHORS))
  })

  it('a round takes at most nine anchors: the Final has to stay under 127 octets', () => {
    expect(uwbFinalBytes(UWB_MAX_ANCHORS)).toBe(122)
    expect(uwbFinalBytes(UWB_MAX_ANCHORS + 1)).toBe(134)
    const anchors = (n: number) => Array.from({ length: n }, (_, i) => uwbNode(`anc-${i}`, 'anchor', i * 2, 0))
    const tag = uwbNode('tag-1', 'tag', 4, 4)
    expect(() => ScenarioSchema.parse(uwbScenario([...anchors(9), tag]))).not.toThrow()
    expect(() => ScenarioSchema.parse(uwbScenario([...anchors(10), tag]))).toThrow(/at most 9 anchors \(found 10\)/)
    expect(() => network([...anchors(10), tag])).toThrow(/10 anchors exceed the 9/)
  })

  it('contention-based rounds are SS-TWR only', () => {
    const ds = uwbScenario(twoAnchorsOneTag(), { ...DEFAULT_UWB_SESSION, schedule: 'contention', method: 'ds' })
    expect(() => ScenarioSchema.parse(ds)).toThrow(/contention-based rounds are SS-TWR only in this simulator/)
    const ss = uwbScenario(twoAnchorsOneTag(), { ...DEFAULT_UWB_SESSION, schedule: 'contention', method: 'ss' })
    expect(() => ScenarioSchema.parse(ss)).not.toThrow()
  })

  it('contentionSlots and maxAttempts are bounded', () => {
    const bad = (over: Partial<UwbSessionCfg>) => uwbScenario(twoAnchorsOneTag(), { ...DEFAULT_UWB_SESSION, ...over })
    expect(() => ScenarioSchema.parse(bad({ contentionSlots: 1 }))).toThrow()
    expect(() => ScenarioSchema.parse(bad({ contentionSlots: 33 }))).toThrow()
    expect(() => ScenarioSchema.parse(bad({ contentionSlots: 2 }))).not.toThrow()
    expect(() => ScenarioSchema.parse(bad({ contentionSlots: 32 }))).not.toThrow()
    expect(() => ScenarioSchema.parse(bad({ maxAttempts: 0 }))).toThrow()
    expect(() => ScenarioSchema.parse(bad({ maxAttempts: 11 }))).toThrow()
    expect(() => ScenarioSchema.parse(bad({ maxAttempts: 1 }))).not.toThrow()
    expect(() => ScenarioSchema.parse(bad({ maxAttempts: 10 }))).not.toThrow()
  })

  it('a contention round sizes the block-fit rule as 1 + contentionSlots, not per-anchor', () => {
    // 9 slots (1 + 8 contention) × 2400 RSTU = 21 600 RSTU; a 240 000 RSTU block fits 11 tags.
    const anchors = [0, 1, 2, 3].map((i) => uwbNode(`anc-${i}`, 'anchor', i * 3, 0))
    const tags = (n: number) => Array.from({ length: n }, (_, i) => uwbNode(`tag-${i}`, 'tag', i, 4))
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, method: 'ss', schedule: 'contention', contentionSlots: 8 }
    expect(() => ScenarioSchema.parse(uwbScenario([...anchors, ...tags(11)], cfg))).not.toThrow()
    expect(() => ScenarioSchema.parse(uwbScenario([...anchors, ...tags(12)], cfg))).toThrow(/fits 11 tags/)
  })

  it('one-way ranging needs four anchors and a time schedule', () => {
    const anchors = (n: number) => Array.from({ length: n }, (_, i) => uwbNode(`anc-${i}`, 'anchor', i * 2, 0))
    const tag = uwbNode('tag-1', 'tag', 4, 4)
    for (const mode of ['dl-tdoa', 'ul-tdoa'] as const) {
      const cfg = (over: Partial<UwbSessionCfg> = {}): UwbSessionCfg => ({ ...DEFAULT_UWB_SESSION, mode, ...over })
      // Three anchors give two differences; a 2-D hyperbolic fix needs three.
      expect(() => ScenarioSchema.parse(uwbScenario([...anchors(3), tag], cfg())), mode)
        .toThrow(/needs at least 4 anchors for 3 time differences \(found 3\)/)
      expect(() => ScenarioSchema.parse(uwbScenario([...anchors(4), tag], cfg())), mode).not.toThrow()
      expect(() => ScenarioSchema.parse(uwbScenario([...anchors(4), tag], cfg({ schedule: 'contention', method: 'ss' }))), mode)
        .toThrow(/contention-based rounds are two-way ranging only/)
      // One mistake, one issue: there are two schedules, so "not contention" and "needs time"
      // are the same requirement and must not be reported twice.
      const bad = ScenarioSchema.safeParse(uwbScenario([...anchors(4), tag], cfg({ schedule: 'contention', method: 'ss' })))
      expect(bad.success, mode).toBe(false)
      if (!bad.success) expect(bad.error.issues, mode).toHaveLength(1)
    }
  })

  it('one round must fit the block in every mode, DL-TDoA included', () => {
    // 4 anchors, DL-TDoA: 5 slots × 2400 RSTU = 12 000 RSTU against a 3 000 RSTU block. Lifting
    // the tags-per-block rule for DL-TDoA must not lift the floor under it: a round that outlives
    // its block would run into the next block's slots, and nothing downstream notices.
    const anchors = [0, 1, 2, 3].map((i) => uwbNode(`anc-${i}`, 'anchor', i * 3, 0))
    const tag = uwbNode('tag-1', 'tag', 4, 4)
    const tiny = { blockRstu: 3000, slotRstu: 2400 }
    for (const mode of ['dl-tdoa', 'ul-tdoa', 'twr'] as const) {
      const sc = uwbScenario([...anchors, tag], { ...DEFAULT_UWB_SESSION, ...tiny, mode })
      if (mode === 'ul-tdoa') {
        // A blink round is one slot of 2 400 RSTU, and that does fit a 3 000 RSTU block.
        expect(() => ScenarioSchema.parse(sc), mode).not.toThrow()
        continue
      }
      expect(() => ScenarioSchema.parse(sc), mode).toThrow(/block of 3000 RSTU is too short for one round/)
      const bad = ScenarioSchema.safeParse(sc)
      expect(bad.success, mode).toBe(false)
      // …and it replaces the tags-per-block message rather than doubling it.
      if (!bad.success) expect(bad.error.issues.filter((i) => /tags at/.test(i.message)), mode).toHaveLength(0)
    }
  })

  it('DL-TDoA lifts the block-fit rule, UL-TDoA caps the block at one blink slot per tag', () => {
    const anchors = [0, 1, 2, 3].map((i) => uwbNode(`anc-${i}`, 'anchor', i * 3, 0))
    const tags = (n: number) => Array.from({ length: n }, (_, i) => uwbNode(`tag-${i}`, 'tag', i % 10, 4))
    // DS-TWR fits 10 tags in the block; DL-TDoA fits any number, because they all listen to the
    // same anchor round instead of each running one of their own.
    expect(() => ScenarioSchema.parse(uwbScenario([...anchors, ...tags(11)]))).toThrow(/fits 10 tags/)
    const dl: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'dl-tdoa' }
    expect(() => ScenarioSchema.parse(uwbScenario([...anchors, ...tags(50)], dl))).not.toThrow()
    // A blink is one slot, so the block holds blockRstu / slotRstu = 100 of them.
    const ul: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'ul-tdoa' }
    expect(DEFAULT_UWB_SESSION.blockRstu / DEFAULT_UWB_SESSION.slotRstu).toBe(100)
    expect(() => ScenarioSchema.parse(uwbScenario([...anchors, ...tags(100)], ul))).not.toThrow()
    expect(() => ScenarioSchema.parse(uwbScenario([...anchors, ...tags(101)], ul))).toThrow(/fits 100 tags at 1 slots each/)
  })

  it('the slot-fit rule measures the mode’s own longest frame', () => {
    // A DL-TDoA round's longest frame is anchor 0's Poll (27 + 3R + 6 octets, R responders), not
    // the TWR Final; a UL-TDoA round's is the 14-octet blink, the shortest frame there is.
    expect(uwbLongestFrameBytes(4)).toBe(uwbFinalBytes(4))
    expect(uwbLongestFrameBytes(4, 'dl-tdoa')).toBe(uwbDlPollBytes(3))
    expect(uwbLongestFrameBytes(4, 'ul-tdoa')).toBe(UWB_BLINK_BYTES)
    expect(uwbSlotFitNs(4, 'ul-tdoa')).toBeLessThan(uwbSlotFitNs(4, 'dl-tdoa'))
    expect(uwbSlotFitNs(4, 'dl-tdoa')).toBeLessThan(uwbSlotFitNs(4))
    // A 363 RSTU slot (302.5 µs) is too short for a nine-anchor DS-TWR round — its Final is 122
    // octets — but it carries that round's DL-TDoA shape (a 57-octet Poll) and a blink with room
    // to spare. So the rule has to ask the mode what the round's longest frame is.
    const anchors = Array.from({ length: 9 }, (_, i) => uwbNode(`anc-${i}`, 'anchor', i * 2, 0))
    const tag = uwbNode('tag-1', 'tag', 4, 4)
    const short = { slotRstu: 363, blockRstu: 36_300 }
    expect(rstuNs(363)).toBe(302_500)
    expect(uwbSlotFitNs(9)).toBeGreaterThan(302_500)
    expect(uwbSlotFitNs(9, 'dl-tdoa')).toBeLessThan(302_500)
    expect(uwbSlotFitNs(9, 'ul-tdoa')).toBeLessThan(302_500)
    expect(() => ScenarioSchema.parse(uwbScenario([...anchors, tag], { ...DEFAULT_UWB_SESSION, ...short })))
      .toThrow(/363 RSTU ranging slot is 302.5 µs/)
    expect(() => ScenarioSchema.parse(uwbScenario([...anchors, tag], { ...DEFAULT_UWB_SESSION, ...short, mode: 'dl-tdoa' })))
      .not.toThrow()
    expect(() => ScenarioSchema.parse(uwbScenario([...anchors, tag], { ...DEFAULT_UWB_SESSION, ...short, mode: 'ul-tdoa' })))
      .not.toThrow()
  })

  it('a contention round is sized by its Poll, not by the Final it never sends', () => {
    // Contention is SS-TWR and ends at the Response: the frames on the air are the 31-octet Poll
    // (RCPS + RCMA in place of the anchor list, so anchor-count independent) and an SS Response.
    // At one anchor the Final-sized bound was the smaller number, which is the case that would
    // have let a too-short slot through if the 300 RSTU floor were ever lowered.
    expect(uwbPollBytes(1, 'contention')).toBe(31)
    expect(uwbLongestFrameBytes(1, 'twr', 'contention')).toBe(31)
    expect(uwbLongestFrameBytes(1, 'twr', 'contention')).toBeGreaterThan(uwbFinalBytes(1))
    expect(uwbRespBytes('ss')).toBeLessThan(31)
    // the window's size does not change the frames, and more anchors do not either
    expect(uwbLongestFrameBytes(6, 'twr', 'contention')).toBe(31)
    expect(uwbSlotFitNs(6, 'twr', 'contention')).toBeLessThan(uwbSlotFitNs(6))
    expect(uwbSlotFitNs(1, 'twr', 'contention')).toBeGreaterThan(uwbSlotFitNs(1))
  })

  it('every lesson scenario still parses', () => {
    for (const l of LESSONS) {
      expect(() => ScenarioSchema.parse(l.scenario()), l.id).not.toThrow()
    }
  })
})

describe('the P802.15.4ab MMS session in the schema', () => {
  /** An MMS session, optionally with a patch over the defaults. */
  function mmsSession(patch: Partial<UwbSessionCfg> = {}, mms: Partial<UwbMmsCfg> = {}): UwbSessionCfg {
    return {
      ...DEFAULT_UWB_SESSION, mode: 'mms', ...patch,
      mms: { ...DEFAULT_UWB_MMS, nbChannels: [...DEFAULT_UWB_MMS.nbChannels], ...mms },
    }
  }
  const anchorsN = (n: number): NodeCfg[] =>
    Array.from({ length: n }, (_, i) => uwbNode(`anc-${i}`, 'anchor', i * 2, 0))
  const tag = uwbNode('tag-1', 'tag', 4, 4)

  it('a session saved before P802.15.4ab existed reads back with the draft’s defaults', () => {
    const legacy: Record<string, unknown> = { ...DEFAULT_UWB_SESSION }
    delete legacy.mms
    const sc: unknown = { ...uwbScenario(twoAnchorsOneTag()), uwb: legacy }
    const parsed = ScenarioSchema.parse(sc)
    expect(parsed.uwb).toEqual(DEFAULT_UWB_SESSION)
    expect(parsed.uwb?.mms).toEqual({
      rsfs: 8, rifs: 0, nMsr: 40, gap: 64, stsLen: 64, gapMs: 1, nbChannels: [3], nbLbt: 'auto', report: 'bi',
    })
    // Two such scenarios must not share the one allow-list array the default is written from.
    const again = ScenarioSchema.parse(sc)
    expect(again.uwb?.mms.nbChannels).not.toBe(parsed.uwb?.mms.nbChannels)
    expect(again.uwb?.mms.nbChannels).not.toBe(DEFAULT_UWB_MMS.nbChannels)
  })

  it('the default MMS session is legal, and every other mode ignores its settings', () => {
    expect(() => ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), mmsSession()))).not.toThrow()
    // A nonsense train in a two-way session is never read, so it is never judged.
    const twr = { ...DEFAULT_UWB_SESSION, mms: { ...DEFAULT_UWB_MMS, rsfs: 0 as const, rifs: 0 as const, gap: 900 } }
    expect(() => ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), twr))).not.toThrow()
  })

  it('accepts exactly the enumerated values mms.ts publishes, and nothing else', () => {
    // The schema writes each set out as a union of literals, because zod cannot build one from
    // an array without a cast. This walk is the tie that keeps the two from drifting apart.
    const cases: Array<[string, readonly number[], number]> = [
      ['rsfs', RSF_COUNT_SET, 3], ['rifs', RIF_COUNT_SET, 16],
      ['nMsr', N_MSR_SET, 33], ['stsLen', STS_LEN_SET, 512], ['gapMs', [1, 2], 3],
    ]
    for (const [field, allowed, rejected] of cases) {
      for (const v of allowed) {
        const uwb = { ...DEFAULT_UWB_SESSION, mms: { ...DEFAULT_UWB_MMS, [field]: v } }
        expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), uwb)).success, `${field} ${v}`).toBe(true)
      }
      const bad = { ...DEFAULT_UWB_SESSION, mms: { ...DEFAULT_UWB_MMS, [field]: rejected } }
      expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), bad)).success, `${field} ${rejected}`).toBe(false)
    }
  })

  it('a train needs at least one fragment', () => {
    const empty = mmsSession({}, { rsfs: 0, rifs: 0 })
    expect(() => ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), empty)))
      .toThrow(/an MMS train needs at least one fragment \(rsfs \+ rifs > 0\)/)
    expect(() => ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), mmsSession({}, { rsfs: 0, rifs: 1 }))))
      .not.toThrow()
  })

  it('the MMRS gap is a whole number of zeros, 0 to 64', () => {
    for (const gap of [-1, 65, 33.5]) {
      expect(() => ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), mmsSession({}, { gap }))), `gap ${gap}`)
        .toThrow(/MMRS gap must be an integer 0…64/)
    }
    for (const gap of [0, 33, 64]) {
      expect(() => ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), mmsSession({}, { gap }))), `gap ${gap}`)
        .not.toThrow()
    }
  })

  it('the narrowband allow list is 1…250 distinct channels of the 250 there are', () => {
    for (const nbChannels of [[], [3, 3], [250], [-1], [3.5], Array.from({ length: 251 }, (_, i) => i)]) {
      expect(
        () => ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), mmsSession({}, { nbChannels }))),
        JSON.stringify(nbChannels).slice(0, 20),
      ).toThrow(/the narrowband allow list needs 1…250 distinct channels 0…249/)
    }
    expect(() => ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), mmsSession({}, { nbChannels: [0, 3, 249] }))))
      .not.toThrow()
  })

  it('an MMS ranging slot is a multiple of 300 RSTU, not of the core standard’s 3', () => {
    // 2403 RSTU is a legal slot everywhere else in the simulator and is refused here.
    expect(() => ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), mmsSession({ slotRstu: 2403 }))))
      .toThrow(/an MMS ranging slot must be a multiple of 300 RSTU \(P802\.15\.4ab draft\)/)
    expect(() => ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), { ...DEFAULT_UWB_SESSION, slotRstu: 2403 })))
      .not.toThrow()
  })

  it('a slot has to hold the longest fragment, and two slots a narrowband message', () => {
    // A 256-unit RIF is 262.6 µs: it does not fit the 250 µs of a 300 RSTU slot, though the
    // 82.1 µs default RSF does.
    const bigRif = mmsSession({ slotRstu: 300 }, { rifs: 1, stsLen: 256 })
    expect(() => ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), bigRif)))
      .toThrow(/a 300 RSTU slot is 250\.0 µs, but the longest MMS fragment needs 262\.8 µs plus flight/)
    // The 608 µs REPORT is what really sets the floor: two 300 RSTU slots are 500 µs.
    expect(() => ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), mmsSession({ slotRstu: 300 }))))
      .toThrow(/two 300 RSTU slots are 500\.0 µs, but a narrowband message needs 608\.2 µs plus flight/)
    // 600 RSTU — the draft's own default slot — clears both.
    expect(() => ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), mmsSession({ slotRstu: 600 })))).not.toThrow()
    expect(uwbNbSlotFitNs()).toBe(608_200)
  })

  it('the block has to hold one round per tag–anchor pair, not one per tag', () => {
    // 28 slots × 2400 RSTU = 67 200 RSTU a round; a 240 000 RSTU block holds three of them.
    expect(uwbSlotsPerTag('ds', 4, 'time', 8, 'mms', DEFAULT_UWB_MMS)).toBe(28)
    expect(() => ScenarioSchema.parse(uwbScenario([...anchorsN(3), tag], mmsSession()))).not.toThrow()
    expect(() => ScenarioSchema.parse(uwbScenario([...anchorsN(4), tag], mmsSession())))
      .toThrow(/the UWB block fits 3 tag–anchor pairs at 28 slots each \(found 4\); lengthen blockRstu or shorten slotRstu/)
  })

  it('skips the rules that are about frames the MMS round does not send', () => {
    // The nine-anchor cap sizes the TWR Final's PSDU; nothing in an MMS round grows with the
    // anchor count, so ten anchors are fine — the block rule is what bounds them.
    const tenPairs = mmsSession({ slotRstu: 600 })
    expect(() => ScenarioSchema.parse(uwbScenario([...anchorsN(10), tag], tenPairs))).not.toThrow()
    expect(() => ScenarioSchema.parse(uwbScenario([...anchorsN(10), tag]))).toThrow(/at most 9 anchors/)
    // The one-way four-anchor rule is about time differences; MMS measures ranges.
    expect(() => ScenarioSchema.parse(uwbScenario([...anchorsN(1), tag], mmsSession()))).not.toThrow()
    expect(() => ScenarioSchema.parse(uwbScenario([...anchorsN(1), tag], { ...DEFAULT_UWB_SESSION, mode: 'dl-tdoa' })))
      .toThrow(/needs at least 4 anchors/)
    // And the TWR frame rule: at 300 RSTU a six-anchor two-way round is refused for its Final,
    // while the MMS round of the same six anchors is judged on its fragment and its NB message.
    expect(() => ScenarioSchema.parse(uwbScenario([...anchorsN(6), tag], { ...DEFAULT_UWB_SESSION, slotRstu: 300 })))
      .toThrow(/300 RSTU ranging slot is 250\.0 µs/)
    let mmsMsg = ''
    try {
      ScenarioSchema.parse(uwbScenario([...anchorsN(6), tag], mmsSession({ slotRstu: 300 })))
    } catch (e) {
      mmsMsg = e instanceof Error ? e.message : String(e)
    }
    expect(mmsMsg).not.toMatch(/ranging slot is 250\.0 µs/)
    expect(mmsMsg).toMatch(/two 300 RSTU slots/)
    expect(() => uwbLongestFrameBytes(6, 'mms')).toThrow(/not PSDUs/)
    expect(() => uwbSlotsPerTag('ds', 6, 'time', 8, 'mms')).toThrow(/needs the session's MMS parameters/)
    expect(() => uwbSlotFitNs(6, 'mms')).toThrow(/needs the session's MMS parameters/)
  })

  it('takes the two rules the one-way modes already carry', () => {
    expect(() => ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), mmsSession({ schedule: 'contention', method: 'ss' }))))
      .toThrow(/contention-based rounds are two-way ranging only; one-way and MMS ranging need a time-scheduled session/)
    expect(() => ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), mmsSession({ aoa: true }))))
      .toThrow(/angle of arrival is measured on two-way responses; turn it off for TDoA and MMS modes/)
  })
})

describe('sixGhzChannelNo', () => {
  it('channel = (centre − 5950) / 5', () => {
    expect(sixGhzChannelNo(6305)).toBe(71)
    expect(sixGhzChannelNo(5985)).toBe(7)
  })
})

describe('Scenario.sixGhzCenterMhz', () => {
  const base = (): Scenario => uwbScenario(twoAnchorsOneTag())

  it('accepts a valid 5 MHz-step centre inside range', () => {
    expect(() => ScenarioSchema.parse({ ...base(), sixGhzCenterMhz: 6305 })).not.toThrow()
  })

  it('rejects a centre that is not a multiple of 5', () => {
    expect(() => ScenarioSchema.parse({ ...base(), sixGhzCenterMhz: 6303 })).toThrow()
  })

  it('rejects a centre below the schema minimum', () => {
    expect(() => ScenarioSchema.parse({ ...base(), sixGhzCenterMhz: 5950 })).toThrow()
  })

  it('a scenario without the field parses unchanged (default applies later)', () => {
    const sc = base()
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    expect(sc.sixGhzCenterMhz).toBeUndefined()
  })
})
