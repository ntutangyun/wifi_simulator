import { describe, it, expect } from 'vitest'
import { DEFAULT_AMP_AP, ScenarioSchema, defaultScenario, nonht, scenarioErrorText } from '../../src/model/scenario'

describe('scenario schema', () => {
  it('accepts the default scenario', () => {
    expect(() => ScenarioSchema.parse(defaultScenario())).not.toThrow()
  })

  it('rejects two APs', () => {
    const sc = defaultScenario()
    sc.nodes.push({ ...sc.nodes[0], id: 'ap2' })
    expect(() => ScenarioSchema.parse(sc)).toThrow(/exactly one AP/)
  })

  it('rejects zero APs', () => {
    const sc = defaultScenario()
    sc.nodes = sc.nodes.filter((n) => n.kind !== 'ap')
    expect(() => ScenarioSchema.parse(sc)).toThrow(/exactly one AP/)
  })

  it('rejects duplicate node ids', () => {
    const sc = defaultScenario()
    sc.nodes.push({ id: 'sta-1', kind: 'sta', name: 'dup', pos: { x: 1, y: 1, z: 1 }, txPowerDbm: 15, profiles: ['idle'], caps: nonht })
    expect(() => ScenarioSchema.parse(sc)).toThrow(/duplicate node id/)
  })

  it('rejects non-positive room sizes', () => {
    const sc = defaultScenario()
    sc.rooms[0] = { ...sc.rooms[0], w: -1 }
    expect(() => ScenarioSchema.parse(sc)).toThrow()
  })
})

describe('traffic profiles per node', () => {
  it('a node may carry several streams, each keeping its own profile', () => {
    const sc = defaultScenario()
    sc.nodes[1].profiles = ['voice', 'backup']
    const parsed = ScenarioSchema.parse(sc)
    expect(parsed.nodes[1].profiles).toEqual(['voice', 'backup'])
  })

  it('still loads a legacy scenario with a single `profile` field', () => {
    const sc = defaultScenario() as unknown as { nodes: Record<string, unknown>[] }
    const legacy: Record<string, unknown> = { ...sc.nodes[1], profile: 'voice' }
    delete legacy.profiles
    sc.nodes[1] = legacy
    const parsed = ScenarioSchema.parse(sc)
    expect(parsed.nodes[1].profiles).toEqual(['voice'])
  })

  it('normalises idle: dropped when combined, kept alone, empty list allowed', () => {
    const sc = defaultScenario()
    sc.nodes[1].profiles = ['idle', 'video', 'video']
    sc.nodes[2].profiles = []
    const parsed = ScenarioSchema.parse(sc)
    expect(parsed.nodes[1].profiles).toEqual(['video'])
    expect(parsed.nodes[2].profiles).toEqual(['idle'])
  })
})

describe('linkId 2g in the schema', () => {
  it('accepts 2g on non-VHT stations and rejects it on VHT', () => {
    const sc = defaultScenario()
    sc.nodes[1].linkId = '2g'
    sc.nodes[1].caps.generation = 'he'
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    sc.nodes[1].caps.generation = 'vht'
    expect(() => ScenarioSchema.parse(sc)).toThrow(/2\.4 GHz/)
  })

  it('rejects 6g on 802.11a and on Wi-Fi 5, and accepts it on Wi-Fi 6/7', () => {
    const sc = defaultScenario()
    sc.nodes[1].linkId = '6g'
    for (const gen of ['he', 'eht'] as const) {
      sc.nodes[1].caps.generation = gen
      expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    }
    for (const gen of ['nonht', 'vht'] as const) {
      sc.nodes[1].caps.generation = gen
      expect(() => ScenarioSchema.parse(sc)).toThrow(/6 GHz/)
    }
  })
})

describe('AMP nodes in the schema', () => {
  it('a tag is kind amp on 2.4 GHz; AMP polling needs a Wi-Fi 7 AP', () => {
    const sc = defaultScenario()
    sc.nodes[0].caps = { generation: 'eht', features: { edca: true } }
    sc.nodes[0].ampAp = { ...DEFAULT_AMP_AP }
    sc.nodes.push({ id: 'tag-1', kind: 'amp', name: 'Tag', pos: { x: 3, y: 3, z: 1 }, txPowerDbm: 0, profiles: ['idle'], caps: { generation: 'nonht', features: {} }, ampTag: { dlSensDbm: -70 } })
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    sc.nodes[3].linkId = '5g'
    expect(() => ScenarioSchema.parse(sc)).toThrow(/2\.4 GHz/)
    sc.nodes[3].linkId = '2g'
    sc.nodes[0].caps.generation = 'he'
    expect(() => ScenarioSchema.parse(sc)).toThrow(/Wi-Fi 7/)
  })

  it('AMP tag settings belong to an AMP tag node, not to a station or an AP', () => {
    const sc = defaultScenario()
    sc.nodes[1].ampTag = { dlSensDbm: -70 }
    expect(() => ScenarioSchema.parse(sc)).toThrow(/AMP tag/)
    delete sc.nodes[1].ampTag
    sc.nodes[0].ampTag = { id16: 7 }
    expect(() => ScenarioSchema.parse(sc)).toThrow(/AMP tag/)
  })
})

describe('scenarioErrorText', () => {
  it('is the issue sentences, not the ZodError JSON the banner used to print', () => {
    const sc = defaultScenario()
    sc.nodes = sc.nodes.filter((n) => n.kind !== 'ap')
    try {
      ScenarioSchema.parse(sc)
      expect.unreachable('the schema should have rejected an AP-less plan with stations')
    } catch (e) {
      const text = scenarioErrorText(e)
      expect(text).toBe('scenario must have exactly one AP (found 0)')
      expect(text).not.toContain('"code"')
    }
  })

  it('passes an ordinary Error through unchanged', () => {
    expect(scenarioErrorText(new Error('boom'))).toBe('boom')
    expect(scenarioErrorText('boom')).toBe('boom')
  })
})
