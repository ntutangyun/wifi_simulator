import { describe, it, expect } from 'vitest'
import {
  DEFAULT_UWB_SESSION, ScenarioSchema, nonht, sixGhzChannelNo,
  type NodeCfg, type Scenario, type UwbSessionCfg,
} from '../../src/model/scenario'
import { LESSONS } from '../../src/course/lessons'
import { EventQueue } from '../../src/engine/events'
import { Rng } from '../../src/engine/rng'
import { makeEmitter } from '../../src/model/records'
import { UwbNetwork } from '../../src/uwb/network'
import {
  rstuNs, UWB_BLINK_BYTES, UWB_MAX_ANCHORS, uwbDlPollBytes, uwbFinalBytes, uwbLongestFrameBytes, uwbSlotFitNs,
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

  it('every lesson scenario still parses', () => {
    for (const l of LESSONS) {
      expect(() => ScenarioSchema.parse(l.scenario()), l.id).not.toThrow()
    }
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
