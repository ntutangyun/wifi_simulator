import { describe, it, expect } from 'vitest'
import { canDeleteNode, hasAp, newAnchor, newAp, newUwbTag, removeNode, uwbSessionIssue } from '../../src/editor/planOps'
import { GEN_FEATURES } from '../../src/model/caps'
import { DEFAULT_UWB_SESSION, ScenarioSchema, defaultScenario, type Scenario, type UwbSessionCfg } from '../../src/model/scenario'
import { UWB_TX_POWER_DBM } from '../../src/uwb/phy'

/** A scenario carrying `n` anchors and one tag on top of the default house. */
function withUwb(n: number, session: Partial<UwbSessionCfg> = {}): Scenario {
  let sc = defaultScenario()
  for (let i = 0; i < n; i++) sc = newAnchor(sc, { x: i, y: 0 }).sc
  sc = newUwbTag(sc, { x: 1, y: 1 }).sc
  return { ...sc, uwb: { ...DEFAULT_UWB_SESSION, ...session } }
}

describe('newAnchor / newUwbTag', () => {
  it('drops an anchor with the ranging defaults and opens a session', () => {
    const base = defaultScenario()
    expect(base.uwb).toBeUndefined()
    const { sc, id } = newAnchor(base, { x: 1.24, y: 2.06 })
    expect(id).toBe('anchor-1')
    const n = sc.nodes.find((x) => x.id === id)!
    expect(n).toMatchObject({
      kind: 'uwb', name: 'Anchor 1', txPowerDbm: UWB_TX_POWER_DBM, profiles: ['idle'], uwb: { role: 'anchor' },
    })
    // snapped to the 0.1 m grid; anchors sit high on the wall
    expect(n.pos.x).toBeCloseTo(1.2, 9)
    expect(n.pos.y).toBeCloseTo(2.1, 9)
    expect(n.pos.z).toBe(2.2)
    expect(n.caps).toEqual({ generation: 'nonht', features: {} })
    expect(sc.uwb).toEqual(DEFAULT_UWB_SESSION)
    expect(base.nodes).toHaveLength(defaultScenario().nodes.length) // pure
  })

  it('numbers anchors and tags per role and keeps ids unique', () => {
    const a1 = newAnchor(defaultScenario(), { x: 0, y: 0 })
    const a2 = newAnchor(a1.sc, { x: 1, y: 0 })
    expect(a2.id).toBe('anchor-2')
    const t1 = newUwbTag(a2.sc, { x: 2, y: 0 })
    expect(t1.id).toBe('uwb-1')
    const t2 = newUwbTag(t1.sc, { x: 3, y: 0 })
    expect(t2.id).toBe('uwb-2')
    expect(new Set(t2.sc.nodes.map((n) => n.id)).size).toBe(t2.sc.nodes.length)
  })

  it('gives a tag the role tag at head height', () => {
    const { sc, id } = newUwbTag(defaultScenario(), { x: 3, y: 3 })
    const n = sc.nodes.find((x) => x.id === id)!
    expect(n.uwb).toEqual({ role: 'tag' })
    expect(n.name).toBe('UWB tag 1')
    expect(n.pos.z).toBe(1.0)
  })

  it('an anchor plus a tag is a scenario the schema accepts', () => {
    const sc = newUwbTag(newAnchor(defaultScenario(), { x: 0, y: 0 }).sc, { x: 2, y: 2 }).sc
    expect(ScenarioSchema.safeParse(sc).success).toBe(true)
  })

  it('reuses the session a second UWB node finds already open', () => {
    const one = newAnchor(defaultScenario(), { x: 0, y: 0 }).sc
    const tuned: Scenario = { ...one, uwb: { ...DEFAULT_UWB_SESSION, method: 'ss', channel: 5 } }
    expect(newUwbTag(tuned, { x: 1, y: 1 }).sc.uwb).toEqual(tuned.uwb)
  })
})

describe('uwbSessionIssue', () => {
  it('is null for the defaults and for a plan with no UWB at all', () => {
    expect(uwbSessionIssue(withUwb(4))).toBeNull()
    expect(uwbSessionIssue(defaultScenario())).toBeNull()
  })

  it('reports a ranging slot too short for the round', () => {
    // 300 RSTU is 250 µs; a 6-anchor DS round needs ~268 µs for its Final.
    const msg = uwbSessionIssue(withUwb(6, { slotRstu: 300 }))
    expect(msg).toContain('ranging slot')
    expect(msg).toContain('lengthen slotRstu')
  })

  it('reports more anchors than a round can carry', () => {
    expect(uwbSessionIssue(withUwb(10))).toContain('at most 9 anchors')
  })

  it('reports a block that cannot hold every tag', () => {
    let sc = withUwb(4, { blockRstu: 4800, slotRstu: 480 })
    sc = newUwbTag(sc, { x: 5, y: 5 }).sc
    expect(uwbSessionIssue(sc)).toContain('tags at')
  })

  it('reports a UWB node left without a session', () => {
    const sc = withUwb(2)
    expect(uwbSessionIssue({ ...sc, uwb: undefined })).toContain('needs a UWB session')
  })

  it('ignores an issue that has nothing to do with ranging', () => {
    const sc = withUwb(2)
    const noAp: Scenario = { ...sc, nodes: sc.nodes.filter((n) => n.kind !== 'ap') }
    expect(ScenarioSchema.safeParse(noAp).success).toBe(false) // the stations lost their AP
    expect(uwbSessionIssue(noAp)).toBeNull()
  })
})

describe('newAp / hasAp', () => {
  /** A UWB-only plan: every Wi-Fi node deleted, ranging devices left. */
  function uwbOnly(): Scenario {
    let sc = withUwb(2)
    for (const n of sc.nodes.filter((x) => x.kind === 'sta' || x.kind === 'amp')) sc = removeNode(sc, n.id)
    return removeNode(sc, 'ap')
  }

  it('puts a Wi-Fi 7 AP back into a plan that lost it', () => {
    const before = uwbOnly()
    expect(hasAp(before)).toBe(false)
    const { sc, id } = newAp(before, { x: 2.04, y: 3.96 })
    expect(id).toBe('ap')
    expect(hasAp(sc)).toBe(true)
    const ap = sc.nodes.find((n) => n.id === id)!
    expect(ap).toMatchObject({ kind: 'ap', name: 'AP', txPowerDbm: 20, profiles: ['idle'] })
    expect(ap.pos.z).toBe(2.0)
    expect(ap.pos.x).toBeCloseTo(2.0, 9)
    expect(ap.pos.y).toBeCloseTo(4.0, 9)
    expect(ap.caps.generation).toBe('eht')
    for (const f of GEN_FEATURES.eht) expect(ap.caps.features[f]).toBe(true)
    expect(ScenarioSchema.safeParse(sc).success).toBe(true)
    // the ranging session it was placed next to is untouched
    expect(sc.uwb).toEqual(DEFAULT_UWB_SESSION)
  })

  it('refuses a second AP', () => {
    const sc = defaultScenario()
    expect(hasAp(sc)).toBe(true)
    const { sc: same, id } = newAp(sc, { x: 9, y: 1 })
    expect(same).toBe(sc)
    expect(id).toBe('ap')
  })

  it('an AP the plan gets back can be deleted again', () => {
    const sc = newAp(uwbOnly(), { x: 1, y: 1 }).sc
    expect(canDeleteNode(sc, 'ap')).toBe(true)
    expect(hasAp(removeNode(sc, 'ap'))).toBe(false)
  })
})

describe('removeNode / canDeleteNode', () => {
  it('closes the session with the last UWB node', () => {
    const sc = withUwb(1)
    const anchor = sc.nodes.find((n) => n.uwb?.role === 'anchor')!
    const tag = sc.nodes.find((n) => n.uwb?.role === 'tag')!
    const oneLeft = removeNode(sc, anchor.id)
    expect(oneLeft.uwb).toEqual(DEFAULT_UWB_SESSION)
    const none = removeNode(oneLeft, tag.id)
    expect(none.uwb).toBeUndefined()
    expect(ScenarioSchema.safeParse(none).success).toBe(true)
  })

  it('keeps the AP while any Wi-Fi client is left', () => {
    const sc = defaultScenario()
    expect(sc.nodes.some((n) => n.kind === 'sta')).toBe(true)
    expect(canDeleteNode(sc, 'ap')).toBe(false)
    expect(removeNode(sc, 'ap')).toBe(sc)
  })

  it('lets a UWB-only plan drop the AP', () => {
    let sc = withUwb(3)
    for (const n of sc.nodes.filter((x) => x.kind === 'sta' || x.kind === 'amp')) sc = removeNode(sc, n.id)
    expect(canDeleteNode(sc, 'ap')).toBe(true)
    const uwbOnly = removeNode(sc, 'ap')
    expect(uwbOnly.nodes.every((n) => n.kind === 'uwb')).toBe(true)
    expect(ScenarioSchema.safeParse(uwbOnly).success).toBe(true)
  })
})
