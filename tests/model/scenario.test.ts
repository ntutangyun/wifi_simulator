import { describe, it, expect } from 'vitest'
import { ZodError } from 'zod'
import {
  DEFAULT_AMP_AP, DEFAULT_AMP_BS, ScenarioSchema, defaultScenario, guardIntervalRefusals, nonht,
  scenarioErrorText, type AmpBackscatterCfg, type NodeCfg, type Scenario,
} from '../../src/model/scenario'
import type { Generation } from '../../src/model/types'

describe('scenario schema', () => {
  it('accepts the default scenario', () => {
    expect(() => ScenarioSchema.parse(defaultScenario())).not.toThrow()
  })

  it('rejects two APs', () => {
    const sc = defaultScenario()
    sc.nodes.push({ ...sc.nodes[0], id: 'ap2' })
    // the count, not just the word: /AP/ alone also matches three other rules
    expect(() => ScenarioSchema.parse(sc)).toThrow(/现在有 2 个/)
  })

  it('rejects zero APs', () => {
    const sc = defaultScenario()
    sc.nodes = sc.nodes.filter((n) => n.kind !== 'ap')
    expect(() => ScenarioSchema.parse(sc)).toThrow(/现在有 0 个/)
  })

  it('rejects duplicate node ids', () => {
    const sc = defaultScenario()
    sc.nodes.push({ id: 'sta-1', kind: 'sta', name: 'dup', pos: { x: 1, y: 1, z: 1 }, txPowerDbm: 15, profiles: ['idle'], caps: nonht })
    expect(() => ScenarioSchema.parse(sc)).toThrow(/sta-1/)
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
    // /AMP/ alone also matches the 2.4 GHz rule and the Wi-Fi 7 polling rule
    expect(() => ScenarioSchema.parse(sc)).toThrow(/只有 AMP 标签节点/)
    delete sc.nodes[1].ampTag
    sc.nodes[0].ampTag = { id16: 7 }
    expect(() => ScenarioSchema.parse(sc)).toThrow(/只有 AMP 标签节点/)
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
    expect(() => ScenarioSchema.parse(reader('backscatter', null))).toThrow(/RFID/)
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
    expect(withEpc('0123456789abcdef0123456')).toThrow(/EPC/)
    expect(withEpc('0123456789abcdef012345678')).toThrow(/EPC/)
    expect(withEpc('0123456789abcdef0123456g')).toThrow(/EPC/)
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
      expect(e).toBeInstanceOf(ZodError)
      expect(text).toBe((e as ZodError).issues.map((i) => i.message).join('; '))
      expect(text).toMatch(/AP/)
      expect(text).not.toContain('"code"')
    }
  })

  it('passes an ordinary Error through unchanged', () => {
    expect(scenarioErrorText(new Error('boom'))).toBe('boom')
    expect(scenarioErrorText('boom')).toBe('boom')
  })
})

/**
 * `Scenario.guardInterval`: the optional section that picks the data field's guard interval
 * (design doc docs/superpowers/specs/2026-10-05-guard-interval-design.md §3.3, §3.8, §1.5).
 *
 * Same discipline as `fading` and `selectivity`: the section is switched by its own PRESENCE,
 * the default sits on a field and never on the section, and a scenario that never mentions it
 * parses to an object with no `guardInterval` key at all.
 */
describe('scenario schema · the guard-interval section', () => {
  /** An eht AP, an he station and a vht station — so the scene holds an eht–he link. */
  const base = (): Scenario => defaultScenario()

  /** An AP at `apGen` and one station at `staGen`, so the LINK generation is `minGen` of both. */
  const pair = (apGen: Generation, staGen: Generation): Scenario => {
    const b = defaultScenario()
    const plain = (n: NodeCfg, generation: Generation): NodeCfg => {
      const { linkId: _drop, ...rest } = n
      return { ...rest, caps: { generation, features: {} } }
    }
    return {
      ...b,
      nodes: [
        plain(b.nodes.find((n) => n.kind === 'ap')!, apGen),
        plain(b.nodes.find((n) => n.kind === 'sta')!, staGen),
      ],
    } as Scenario
  }

  it('(a) a scenario that says nothing has no guardInterval PROPERTY, not a base-filled one', () => {
    // `fading`'s own comment states this rule in so many words: the default sits on the field,
    // never on the section. A `.default({ gi: 'base' })` here would put every existing plan
    // into the guard-interval branch.
    const parsed = ScenarioSchema.parse(base())
    expect('guardInterval' in parsed).toBe(false)
    expect(parsed.guardInterval).toBeUndefined()
  })

  it('(b) accepts double and quad on a scene that holds an eht–he link', () => {
    for (const gi of ['double', 'quad'] as const) {
      const parsed = ScenarioSchema.parse({ ...base(), guardInterval: { gi } })
      expect(parsed.guardInterval).toEqual({ gi })
    }
  })

  it('(c) refuses gi: "base", and says both why it is empty and why it is the odd one out', () => {
    // Without this assertion there is no red line the day someone adds `'base'` back. 13.6 is
    // the "writing it down changes nothing" half; TB is the standard's half (§1.5: the base GI
    // is the only one of the three that is not mandatory for some PPDU format).
    let msg = ''
    try {
      ScenarioSchema.parse({ ...base(), guardInterval: { gi: 'base' } })
    } catch (e) {
      msg = scenarioErrorText(e)
    }
    expect(msg).not.toBe('')
    expect(msg).toContain('13.6')
    expect(msg).toContain('TB')
  })

  it('(d) refuses the section with no gi at all', () => {
    expect(() => ScenarioSchema.parse({ ...base(), guardInterval: {} })).toThrow()
  })

  it('(e) asks about the LINK and not the device: an eht AP with a vht station is refused', () => {
    // The hole `hasBinnableLink` was built for. Asking per device would let downgrading the
    // access point make the refusal disappear while the link stayed vht.
    let msg = ''
    try {
      ScenarioSchema.parse({ ...pair('eht', 'vht'), guardInterval: { gi: 'quad' } })
    } catch (e) {
      msg = scenarioErrorText(e)
    }
    expect(msg).toContain('链路')
    expect(msg).toContain('minGen')
    expect(msg).not.toContain('不是链路，是设备')
    // And the same scene one generation up is accepted, so the refusal is about the link.
    expect(() => ScenarioSchema.parse({ ...pair('eht', 'he'), guardInterval: { gi: 'quad' } })).not.toThrow()
    expect(() => ScenarioSchema.parse({ ...pair('vht', 'eht'), guardInterval: { gi: 'quad' } })).toThrow()
    expect(() => ScenarioSchema.parse({ ...pair('nonht', 'eht'), guardInterval: { gi: 'quad' } })).toThrow()
  })

  it('(f) does not read sc.fading — unlike selectivity, that would be a false dependency', () => {
    // The guard interval acts on the time axis and never goes through the fading draw, so
    // requiring `fading` would be a dependency the mechanism does not have.
    const scene = pair('eht', 'eht')
    expect(scene.fading).toBeUndefined()
    expect(guardIntervalRefusals(scene)).toEqual([])
    expect(guardIntervalRefusals({ ...scene, fading: { shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'none' } } as Scenario)).toEqual([])
    // And it is not empty for everything: the vht link still raises exactly one.
    expect(guardIntervalRefusals(pair('eht', 'vht'))).toHaveLength(1)
  })
})
