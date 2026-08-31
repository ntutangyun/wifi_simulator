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
    sc.nodes.push({ id: 'sta-1', kind: 'sta', name: 'dup', pos: { x: 1, y: 1, z: 1 }, txPowerDbm: 15, profile: 'idle', caps: nonht })
    expect(() => ScenarioSchema.parse(sc)).toThrow(/duplicate node id/)
  })

  it('rejects non-positive room sizes', () => {
    const sc = defaultScenario()
    sc.rooms[0] = { ...sc.rooms[0], w: -1 }
    expect(() => ScenarioSchema.parse(sc)).toThrow()
  })
})
