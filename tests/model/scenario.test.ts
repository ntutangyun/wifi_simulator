import { describe, it, expect } from 'vitest'
import {
  DEFAULT_AMP_AP, DEFAULT_AMP_BS, ScenarioSchema, defaultScenario, nonht, scenarioErrorText,
  type AmpBackscatterCfg,
} from '../../src/model/scenario'

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

describe('backscatter tags and the RFID reader in the schema', () => {
  /** A Wi-Fi 7 AP with AMP polling on, and one tag of the given mode. `null` turns the RFID
   * inventory off — not `undefined`, which would take the default parameter below. */
  function reader(mode: 'active' | 'backscatter', bs: AmpBackscatterCfg | null = { ...DEFAULT_AMP_BS }) {
    const sc = defaultScenario()
    sc.nodes[0].caps = { generation: 'eht', features: { edca: true } }
    sc.nodes[0].ampAp = { ...DEFAULT_AMP_AP, backscatter: bs ?? undefined }
    sc.nodes.push({
      id: 'tag-1', kind: 'amp', name: 'Tag', pos: { x: 3, y: 3, z: 1 }, txPowerDbm: 0, profiles: ['idle'],
      caps: { generation: 'nonht', features: {} }, ampTag: { mode },
    })
    return sc
  }

  it('a tag saved before the backscatter tier existed reads back as an Active Tx one', () => {
    const sc = defaultScenario()
    sc.nodes[0].caps = { generation: 'eht', features: { edca: true } }
    sc.nodes[0].ampAp = { ...DEFAULT_AMP_AP }
    sc.nodes.push({
      id: 'tag-1', kind: 'amp', name: 'Tag', pos: { x: 3, y: 3, z: 1 }, txPowerDbm: 0, profiles: ['idle'],
      caps: { generation: 'nonht', features: {} }, ampTag: { dlSensDbm: -70 },
    })
    // Neither `mode` nor `backscatter` is in the saved plan, and it still parses.
    const out = ScenarioSchema.parse(JSON.parse(JSON.stringify(sc)))
    expect(out.nodes[3].ampTag?.mode).toBe('active')
    expect(out.nodes[0].ampAp?.backscatter).toBeUndefined()
  })

  it('accepts a backscatter tag when the AP runs the RFID inventory, and refuses it otherwise', () => {
    expect(() => ScenarioSchema.parse(reader('backscatter'))).not.toThrow()
    // Active Tx tags never needed a reader, and still do not.
    expect(() => ScenarioSchema.parse(reader('active', null))).not.toThrow()
    expect(() => ScenarioSchema.parse(reader('backscatter', null)))
      .toThrow(/a backscatter tag needs an AP with the RFID inventory on/)
  })

  it('bounds every reader setting', () => {
    const bad = (patch: Partial<AmpBackscatterCfg>) => () => ScenarioSchema.parse(reader('backscatter', { ...DEFAULT_AMP_BS, ...patch }))
    expect(bad({ q: -1 })).toThrow()
    expect(bad({ q: 9 })).toThrow()
    expect(bad({ q: 2.5 })).toThrow()
    expect(bad({ ulKbps: 4000 as 250 })).toThrow()
    expect(bad({ wupMs: 0.5 })).toThrow() // SFD PM-73: the WUP is a millisecond at minimum
    expect(bad({ txopMs: 0.5 })).toThrow()
    expect(bad({ txopMs: 11 })).toThrow()
    expect(bad({ chargeDbm: 31 })).toThrow()
    expect(bad({ bsDbm: -11 })).toThrow()
    // …and accepts the edges of each range.
    expect(bad({ q: 0, ulKbps: 1000, wupMs: 1, txopMs: 10, chargeDbm: 30, bsDbm: -10, write: true })).not.toThrow()
  })

  it('takes an EPC only as 24 hex characters', () => {
    const withEpc = (epc: string) => {
      const sc = reader('backscatter')
      sc.nodes[3].ampTag = { mode: 'backscatter', epc }
      return () => ScenarioSchema.parse(sc)
    }
    expect(withEpc('0123456789abcdef01234567')).not.toThrow()
    expect(withEpc('0123456789ABCDEF01234567')).not.toThrow()
    expect(withEpc('0123456789abcdef0123456')).toThrow(/24 hex/)
    expect(withEpc('0123456789abcdef012345678')).toThrow(/24 hex/)
    expect(withEpc('0123456789abcdef0123456g')).toThrow(/24 hex/)
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
