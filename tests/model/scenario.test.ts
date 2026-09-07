import { describe, it, expect } from 'vitest'
import { ScenarioSchema, defaultScenario, nonht } from '../../src/model/scenario'

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
