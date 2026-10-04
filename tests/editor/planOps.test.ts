import { describe, it, expect } from 'vitest'
import {
  addOpening, ampTagIssue, clampField, generationPatch, guardIntervalSwitch, guardIntervalToggle,
  guardIntervalTiers, hitTestNode, hitTestWall, newTag, roomsToWalls,
  scenarioFromJson, scenarioToJson, spawnRandomStas, withGuardInterval,
} from '../../src/editor/planOps'
import { DEFAULT_AMP_AP, DEFAULT_AMP_BS, defaultScenario, guardIntervalRefusals, ScenarioSchema, type Room, type Scenario, type Wall } from '../../src/model/scenario'
import { Rng } from '../../src/engine/rng'

const rooms: Room[] = [
  { x: 0, y: 0, w: 4, h: 4, name: 'A' },
  { x: 4, y: 0, w: 4, h: 4, name: 'B' }, // shares edge x=4
]

describe('roomsToWalls', () => {
  it('collapses shared and collinear edges (5 walls, not 8)', () => {
    // y=0 and y=4 each merge across both rooms; x=4 divider is shared
    const walls = roomsToWalls(rooms)
    expect(walls).toHaveLength(5)
    const atX4 = walls.filter((w) => w.x1 === 4 && w.x2 === 4)
    expect(atX4).toHaveLength(1)
    expect(atX4[0]).toMatchObject({ y1: 0, y2: 4 })
  })

  it('merges collinear touching edges into a single run', () => {
    const stacked: Room[] = [
      { x: 0, y: 0, w: 4, h: 2, name: 'A' },
      { x: 0, y: 2, w: 4, h: 2, name: 'B' },
    ]
    const walls = roomsToWalls(stacked)
    const left = walls.filter((w) => w.x1 === 0 && w.x2 === 0)
    expect(left).toHaveLength(1)
    expect(left[0]).toMatchObject({ y1: 0, y2: 4 })
  })

  it('preserves material and openings across regeneration', () => {
    let walls = roomsToWalls(rooms)
    const i = walls.findIndex((w) => w.x1 === 4 && w.x2 === 4)
    walls[i] = { ...walls[i], material: 'brick' }
    walls[i] = addOpening(walls[i], 2, 0.9)
    const regenerated = roomsToWalls(rooms, walls)
    const again = regenerated.find((w) => w.x1 === 4 && w.x2 === 4)!
    expect(again.material).toBe('brick')
    expect(again.openings).toHaveLength(1)
  })
})

describe('openings', () => {
  const wall: Wall = { x1: 0, y1: 0, x2: 0, y2: 4, material: 'drywall', openings: [] }
  it('clamps to the wall extent', () => {
    const w = addOpening(wall, 3.9, 0.9)
    expect(w.openings[0].to).toBeLessThanOrEqual(4)
    expect(w.openings[0].to - w.openings[0].from).toBeCloseTo(0.9)
  })
  it('rejects overlapping openings', () => {
    const w1 = addOpening(wall, 2, 0.9)
    const w2 = addOpening(w1, 2.2, 0.9)
    expect(w2.openings).toHaveLength(1)
  })
})

describe('hit tests', () => {
  const walls = roomsToWalls(rooms)
  it('finds a wall near the pointer', () => {
    expect(hitTestWall(walls, { x: 4.05, y: 2 }, 0.2)).not.toBeNull()
    expect(hitTestWall(walls, { x: 2, y: 2 }, 0.2)).toBeNull()
  })
  it('finds nodes', () => {
    const sc = defaultScenario()
    expect(hitTestNode(sc.nodes, { x: 2.1, y: 4.1 }, 0.4)).toBe('ap')
    expect(hitTestNode(sc.nodes, { x: 9, y: 0.2 }, 0.3)).toBeNull()
  })
})

describe('spawnRandomStas', () => {
  it('adds n stations inside rooms with unique ids', () => {
    const rng = new Rng(1)
    const sc = spawnRandomStas(defaultScenario(), 5, () => rng.next())
    expect(sc.nodes.filter((n) => n.kind === 'sta')).toHaveLength(7)
    const ids = new Set(sc.nodes.map((n) => n.id))
    expect(ids.size).toBe(sc.nodes.length)
    for (const n of sc.nodes.filter((x) => x.kind === 'sta')) {
      const inside = sc.rooms.some((r) => n.pos.x >= r.x && n.pos.x <= r.x + r.w && n.pos.y >= r.y && n.pos.y <= r.y + r.h)
      expect(inside).toBe(true)
    }
  })
})

describe('newTag', () => {
  it('newTag appends an AMP tag on 2.4 GHz with a fresh id', () => {
    const { sc, id } = newTag(defaultScenario(), { x: 3, y: 3 })
    const n = sc.nodes.find((x) => x.id === id)!
    expect(n).toMatchObject({ kind: 'amp', linkId: '2g', txPowerDbm: 0, profiles: ['idle'] })
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    const again = newTag(sc, { x: 4, y: 4 })
    expect(again.id).not.toBe(id)
  })
})

describe('generationPatch', () => {
  /** The AMP lab the editor can build by hand: a Wi-Fi 7 AP that polls, plus one tag. */
  const ampLab = () => {
    const base = defaultScenario()
    base.nodes[0].caps = { generation: 'eht', features: { edca: true } }
    base.nodes[0].ampAp = { ...DEFAULT_AMP_AP }
    return newTag(base, { x: 3, y: 3 }).sc
  }

  it('an AMP lab round-trips through JSON unchanged', () => {
    const sc = ampLab()
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    expect(scenarioFromJson(scenarioToJson(sc))).toEqual(sc)
  })

  it('switching the polling AP off Wi-Fi 7 drops ampAp, so the scenario stays loadable', () => {
    const sc = ampLab()
    const ap = { ...sc.nodes[0], ...generationPatch(sc.nodes[0], 'he') }
    expect(ap.ampAp).toBeUndefined()
    expect(ap.caps.generation).toBe('he')
    const next = { ...sc, nodes: [ap, ...sc.nodes.slice(1)] }
    expect(() => ScenarioSchema.parse(next)).not.toThrow()
    expect(scenarioFromJson(scenarioToJson(next)).nodes[0].ampAp).toBeUndefined()
    // and it comes back when the AP is Wi-Fi 7 again — but only if it still has one
    expect(generationPatch(ap, 'eht').ampAp).toBeUndefined()
    expect(generationPatch(sc.nodes[0], 'eht').ampAp).toEqual(DEFAULT_AMP_AP)
  })

  it('drops a link the new generation cannot use, and keeps the flags it can', () => {
    const sc = defaultScenario()
    const sta = { ...sc.nodes[1], linkId: '6g' as const, caps: { generation: 'eht' as const, features: { edca: true } } }
    expect(generationPatch(sta, 'nonht').linkId).toBeUndefined()
    expect(generationPatch(sta, 'vht').linkId).toBeUndefined()
    expect(generationPatch(sta, 'he').linkId).toBe('6g')
    expect(generationPatch(sta, 'he').caps!.features.edca).toBe(true)
  })
})

describe('backscatter (mono-static) in the editor', () => {
  it('a plan round-trips a backscatter tag with an EPC through JSON', () => {
    const base = defaultScenario()
    base.nodes[0].caps = { generation: 'eht', features: { edca: true } }
    // the editor's "RFID inventory" checkbox: ampAp gains DEFAULT_AMP_BS
    base.nodes[0].ampAp = { ...DEFAULT_AMP_AP, backscatter: { ...DEFAULT_AMP_BS } }
    const { sc, id } = newTag(base, { x: 2, y: 2 })
    // the editor's Mode select + EPC field, exactly what updateNode would commit
    const withTag = { ...sc, nodes: sc.nodes.map((n) => (n.id === id ? { ...n, ampTag: { mode: 'backscatter' as const, epc: '0123456789abcdef01234567' } } : n)) }
    expect(() => ScenarioSchema.parse(withTag)).not.toThrow()
    expect(scenarioFromJson(scenarioToJson(withTag))).toEqual(withTag)
  })

  it('enabling RFID inventory on the AP yields a schema-valid scenario with DEFAULT_AMP_BS', () => {
    const sc = defaultScenario()
    sc.nodes[0].caps = { generation: 'eht', features: { edca: true } }
    sc.nodes[0].ampAp = { ...DEFAULT_AMP_AP } // AMP polling on first, as the editor requires
    // the RFID inventory checkbox's onChange: ampAp.backscatter = { ...DEFAULT_AMP_BS }
    const withInventory = { ...sc, nodes: sc.nodes.map((n, i) => (i === 0 ? { ...n, ampAp: { ...n.ampAp!, backscatter: { ...DEFAULT_AMP_BS } } } : n)) }
    expect(() => ScenarioSchema.parse(withInventory)).not.toThrow()
    expect(withInventory.nodes[0].ampAp?.backscatter).toEqual(DEFAULT_AMP_BS)
    expect(scenarioFromJson(scenarioToJson(withInventory)).nodes[0].ampAp?.backscatter).toEqual(DEFAULT_AMP_BS)
  })
})

describe('ampTagIssue', () => {
  /** An eht AP with a backscatter tag beside it — the exact shape `newTag` + the Mode select
   * produce — with `bs` controlling whether the AP runs the RFID inventory. */
  function withBsTag(bs: boolean): { sc: ReturnType<typeof defaultScenario>; tagId: string } {
    const base = defaultScenario()
    base.nodes[0].caps = { generation: 'eht', features: { edca: true } }
    base.nodes[0].ampAp = { ...DEFAULT_AMP_AP, backscatter: bs ? { ...DEFAULT_AMP_BS } : undefined }
    const { sc, id } = newTag(base, { x: 2, y: 2 })
    return { sc: { ...sc, nodes: sc.nodes.map((n) => (n.id === id ? { ...n, ampTag: { mode: 'backscatter' as const } } : n)) }, tagId: id }
  }

  it('is false once an AP on the plan runs the RFID inventory', () => {
    const { sc, tagId } = withBsTag(true)
    expect(ampTagIssue(sc, tagId)).toBe(false)
    // and the schema agrees: this exact plan parses
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
  })

  it('is true for a backscatter tag when no AP runs the RFID inventory — mirroring the schema rule', () => {
    const { sc, tagId } = withBsTag(false)
    expect(ampTagIssue(sc, tagId)).toBe(true)
    // and the schema agrees: this exact plan is the one the cross-node rule rejects
    expect(() => ScenarioSchema.parse(sc)).toThrow(/RFID/)
  })

  it('is false for an Active Tx tag, a missing node, and a non-amp node, regardless of the reader', () => {
    const { sc, tagId } = withBsTag(false)
    const activeSc = { ...sc, nodes: sc.nodes.map((n) => (n.id === tagId ? { ...n, ampTag: { mode: 'active' as const } } : n)) }
    expect(ampTagIssue(activeSc, tagId)).toBe(false)
    expect(ampTagIssue(sc, 'no-such-node')).toBe(false)
    expect(ampTagIssue(sc, sc.nodes[0].id)).toBe(false) // the AP itself
  })

  it('a fresh amp tag with no ampTag at all (defaults to active) is never an issue', () => {
    const base = defaultScenario()
    base.nodes[0].caps = { generation: 'eht', features: { edca: true } }
    const { sc, id } = newTag(base, { x: 2, y: 2 })
    expect(sc.nodes.find((n) => n.id === id)?.ampTag?.mode).toBe('active')
    expect(ampTagIssue(sc, id)).toBe(false)
  })

  it('turns true the moment the AP\'s RFID inventory is switched off — the "unticking AMP polling" trap', () => {
    const { sc, tagId } = withBsTag(true)
    expect(ampTagIssue(sc, tagId)).toBe(false)
    const withoutReader = { ...sc, nodes: sc.nodes.map((n) => (n.id === sc.nodes[0].id ? { ...n, ampAp: { ...n.ampAp!, backscatter: undefined } } : n)) }
    expect(ampTagIssue(withoutReader, tagId)).toBe(true)
  })
})

describe('clampField', () => {
  it('holds the AMP number inputs inside the schema bounds, empty field included', () => {
    expect(clampField('', 10, 10_000)).toBe(10)
    expect(clampField('  ', 10, 10_000)).toBe(10)
    expect(clampField('abc', 1, 16, true)).toBe(1)
    expect(clampField('99999', 10, 10_000)).toBe(10_000)
    expect(clampField('0', 1, 16, true)).toBe(1)
    expect(clampField('2.6', 1, 16, true)).toBe(3)
    expect(clampField('7', 0, 4, true)).toBe(4)
    expect(clampField('20', 10, 10_000)).toBe(20)
  })

  it('a clamped AMP config still parses', () => {
    const sc = defaultScenario()
    sc.nodes[0].caps = { generation: 'eht', features: { edca: true } }
    sc.nodes[0].ampAp = {
      ...DEFAULT_AMP_AP,
      pollIntervalMs: clampField('', 10, 10_000),
      slots: clampField('', 1, 16, true),
      acwe: clampField('', 0, 4, true),
    }
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
  })
})

describe('scenario json', () => {
  it('round-trips', () => {
    const sc = defaultScenario()
    expect(scenarioFromJson(scenarioToJson(sc))).toEqual(sc)
  })
  it('throws on invalid json', () => {
    expect(() => scenarioFromJson('{"rooms": []}')).toThrow()
  })
})

/**
 * The guard-interval control's three plan operations (design doc
 * docs/superpowers/specs/2026-10-05-guard-interval-design.md §3.3, §3.8).
 */
describe('guardIntervalSwitch / guardIntervalToggle / withGuardInterval', () => {
  /** An eht AP, an he station and a vht station, so the scene holds an eht–he link. */
  const ok = (): Scenario => defaultScenario()
  /** The same floor with every generation pushed down to vht: no link has a GI_TYPE. */
  const noGiLink = (): Scenario => ({
    ...ok(),
    nodes: ok().nodes.map((n) => {
      const { linkId: _drop, ...rest } = n
      return { ...rest, caps: { generation: 'vht' as const, features: {} } }
    }),
  })

  it('reports the base tier and no refusals on a scene that can take one', () => {
    const sw = guardIntervalSwitch(ok())
    expect(sw).toEqual({ gi: 'base', live: true, refusals: [] })
  })

  it('reports exactly one refusal, in the schema\'s own words, when no link has a GI_TYPE', () => {
    const sw = guardIntervalSwitch(noGiLink())
    expect(sw.gi).toBe('base')
    expect(sw.live).toBe(false)
    expect(sw.refusals).toEqual(guardIntervalRefusals(noGiLink()))
    expect(sw.refusals).toHaveLength(1)
  })

  it('stays live on a tier already chosen, so an invalid plan can still be switched back off', () => {
    // The reason `selectivitySwitch` gives, and the trap it was written for: a plan edited into
    // an invalid state must not leave the reader holding it with the only control that could
    // undo it gone dead.
    const stuck = { ...noGiLink(), guardInterval: { gi: 'quad' as const } }
    const sw = guardIntervalSwitch(stuck)
    expect(sw.gi).toBe('quad')
    expect(sw.live).toBe(true)
    expect(sw.refusals).toHaveLength(1)
  })

  it('maps base to no section at all, and the other two to their own', () => {
    expect(guardIntervalToggle('base')).toBeUndefined()
    expect(guardIntervalToggle('double')).toEqual({ gi: 'double' })
    expect(guardIntervalToggle('quad')).toEqual({ gi: 'quad' })
  })

  it('removes the KEY rather than setting it undefined, so the plan reads back as it was written', () => {
    const on = withGuardInterval(ok(), { gi: 'quad' })
    expect(on.guardInterval).toEqual({ gi: 'quad' })
    const off = withGuardInterval(on, undefined)
    expect('guardInterval' in off).toBe(false)
    // And a round trip through the schema keeps it that way.
    expect('guardInterval' in ScenarioSchema.parse(off)).toBe(false)
    expect(ScenarioSchema.parse(on).guardInterval).toEqual({ gi: 'quad' })
  })
})

/**
 * Which tiers the guard-interval control leaves live — the one part of that panel nothing held
 * down until the controller asked for it.
 *
 * **It is deliberately not parallel to `fadingFieldsLive` / `selectivitySwitch`, and the reason
 * is the control's shape rather than taste.** Those two drive a switch and a checkbox, where
 * "live" is one boolean. This drives a choice among three tiers in which the base tier IS the
 * absence of the section, so "off" is one of the three options rather than a separate gesture.
 * That is why `base` is pinned live here while the other two follow `guardIntervalSwitch`: the
 * promise `selectivitySwitch` keeps by staying live on the tier already chosen, this control
 * keeps by always being able to name the way back.
 */
describe('guardIntervalTiers', () => {
  const ok = (): Scenario => defaultScenario()
  const noGiLink = (): Scenario => ({
    ...ok(),
    nodes: ok().nodes.map((n) => {
      const { linkId: _drop, ...rest } = n
      return { ...rest, caps: { generation: 'vht' as const, features: {} } }
    }),
  })

  const liveOf = (sc: Scenario) => {
    const t = guardIntervalTiers(sc)
    return { base: t.base.live, double: t.double.live, quad: t.quad.live }
  }
  const checkedOf = (sc: Scenario) => {
    const t = guardIntervalTiers(sc)
    return (['base', 'double', 'quad'] as const).filter((k) => t[k].checked)
  }

  it('leaves all three live on a scene that can take a guard interval', () => {
    expect(liveOf(ok())).toEqual({ base: true, double: true, quad: true })
  })

  it('greys the two real tiers when no link has a GI_TYPE, and never greys the way back', () => {
    expect(liveOf(noGiLink())).toEqual({ base: true, double: false, quad: false })
  })

  it('keeps every tier live on an already-invalid plan, so it can be switched back off', () => {
    // The trap `selectivitySwitch` was written for: a plan edited into a state the schema
    // refuses must not leave the reader holding it with the control gone dead.
    const stuck = { ...noGiLink(), guardInterval: { gi: 'quad' as const } }
    expect(liveOf(stuck)).toEqual({ base: true, double: true, quad: true })
    // And the way back really is a plan the schema accepts.
    expect(() => ScenarioSchema.parse(withGuardInterval(stuck, guardIntervalToggle('base')))).not.toThrow()
  })

  it('agrees with the switch it reads, rather than restating the rule', () => {
    for (const sc of [ok(), noGiLink(), { ...noGiLink(), guardInterval: { gi: 'double' as const } }]) {
      const live = guardIntervalSwitch(sc).live
      expect(liveOf(sc)).toEqual({ base: true, double: live, quad: live })
    }
  })

  /**
   * The other half of a radio group, and it was missing while the greying was pinned: which tier
   * shows as selected. A group that can show two selections, or none, is as broken as one that
   * greys the wrong row — and neither failure is visible from `live` alone.
   */
  it('shows exactly one tier selected, and it is the one the plan is on', () => {
    expect(checkedOf(ok())).toEqual(['base'])
    expect(checkedOf({ ...ok(), guardInterval: { gi: 'double' } } as Scenario)).toEqual(['double'])
    expect(checkedOf({ ...ok(), guardInterval: { gi: 'quad' } } as Scenario)).toEqual(['quad'])
    // Including on a plan the schema refuses — an absent section reads as `base`, so the group
    // has no fourth state to fall into.
    expect(checkedOf(noGiLink())).toEqual(['base'])
    expect(checkedOf({ ...noGiLink(), guardInterval: { gi: 'quad' } } as Scenario)).toEqual(['quad'])
  })

  it('selects the tier a round trip through the toggle puts the plan on', () => {
    for (const tier of ['base', 'double', 'quad'] as const) {
      const sc = withGuardInterval(ok(), guardIntervalToggle(tier))
      expect(checkedOf(sc), tier).toEqual([tier])
      expect(guardIntervalTiers(sc)[tier].checked).toBe(true)
    }
  })
})
