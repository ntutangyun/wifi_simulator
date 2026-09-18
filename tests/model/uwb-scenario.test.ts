import { describe, it, expect } from 'vitest'
import {
  DEFAULT_UWB_SESSION, ScenarioSchema, nonht,
  type NodeCfg, type Scenario, type UwbSessionCfg,
} from '../../src/model/scenario'
import { LESSONS } from '../../src/course/lessons'

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

  it('every lesson scenario still parses', () => {
    for (const l of LESSONS) {
      expect(() => ScenarioSchema.parse(l.scenario()), l.id).not.toThrow()
    }
  })
})
