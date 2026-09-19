import { describe, it, expect } from 'vitest'
import { canDeleteNode, hasAp, newAnchor, newAp, newUwbTag, removeNode, uwbSessionIssue } from '../../src/editor/planOps'
import { GEN_FEATURES } from '../../src/model/caps'
import { DEFAULT_UWB_SESSION, ScenarioSchema, defaultScenario, type Scenario, type UwbSessionCfg } from '../../src/model/scenario'
import { UWB_TX_POWER_DBM } from '../../src/uwb/phy'
import { uwbMethodPatch, uwbModePatch } from '../../src/uwb/ui/UwbSessionFields'

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

  it('accepts what the session fields save for a contention round', () => {
    // The three fields the editor adds, at the bounds its inputs clamp to.
    const sc = withUwb(6, { method: 'ss', schedule: 'contention', contentionSlots: 16, maxAttempts: 5 })
    expect(uwbSessionIssue(sc)).toBeNull()
    expect(ScenarioSchema.safeParse(sc).success).toBe(true)
    expect(uwbSessionIssue(withUwb(6, { method: 'ss', schedule: 'contention', contentionSlots: 2, maxAttempts: 1 }))).toBeNull()
    expect(uwbSessionIssue(withUwb(6, { method: 'ss', schedule: 'contention', contentionSlots: 32, maxAttempts: 10 }))).toBeNull()
  })

  it('refuses a contention round on DS-TWR, which the method select is what keeps apart', () => {
    // The field disables the schedule under DS-TWR and drops back to 'time' when the
    // method changes; a file that carries the pair anyway is rejected here.
    const bad = withUwb(6, { method: 'ds', schedule: 'contention' })
    expect(ScenarioSchema.safeParse(bad).success).toBe(false)
    expect(uwbSessionIssue(bad)).toMatch(/SS-TWR|contention/i)
  })

  it('round-trips the one-way mode and its two knobs through a valid session', () => {
    // What the three new fields of the session section produce: the mode select's patch, the
    // DL-only clock-correction checkbox and the UL-only sync error. Each survives the schema
    // unchanged, and a four-anchor time-scheduled session takes all of them without complaint.
    const uplink = withUwb(4, { ...uwbModePatch('ul-tdoa'), syncErrorNs: 1 })
    expect(uwbSessionIssue(uplink)).toBeNull()
    expect(ScenarioSchema.parse(uplink).uwb)
      .toEqual({ ...DEFAULT_UWB_SESSION, mode: 'ul-tdoa', schedule: 'time', syncErrorNs: 1 })
    const downlink = withUwb(4, { ...uwbModePatch('dl-tdoa'), tdoaClockCorrection: false })
    expect(uwbSessionIssue(downlink)).toBeNull()
    expect(ScenarioSchema.parse(downlink).uwb)
      .toEqual({ ...DEFAULT_UWB_SESSION, mode: 'dl-tdoa', schedule: 'time', tdoaClockCorrection: false })
  })

  it('round-trips the angle-of-arrival checkbox and an anchor’s facing', () => {
    // The two fields slice 6 adds to the editor: a session-wide checkbox, and a yaw on the
    // anchor whose array it turns. Both survive the schema unchanged, and the yaw is optional —
    // an anchor that has never been turned carries no field at all and faces +x.
    const sc = withUwb(1, { aoa: true })
    const turned: Scenario = {
      ...sc,
      nodes: sc.nodes.map((n) => (n.id === 'anchor-1' ? { ...n, uwb: { role: 'anchor' as const, yawDeg: 90 } } : n)),
    }
    expect(uwbSessionIssue(turned)).toBeNull()
    const parsed = ScenarioSchema.parse(turned)
    expect(parsed.uwb).toEqual({ ...DEFAULT_UWB_SESSION, aoa: true })
    expect(parsed.nodes.find((n) => n.id === 'anchor-1')!.uwb).toEqual({ role: 'anchor', yawDeg: 90 })
    expect(parsed.nodes.find((n) => n.id === 'uwb-1')!.uwb).toEqual({ role: 'tag' })
    // A session saved before the checkbox existed reads as off, not as undefined.
    const { aoa: _dropped, ...legacy } = DEFAULT_UWB_SESSION
    expect(ScenarioSchema.parse({ ...sc, uwb: legacy }).uwb!.aoa).toBe(false)
    // …and the field the editor clamps to ±180 is the field the schema accepts.
    for (const yawDeg of [-180, 0, 180]) {
      expect(ScenarioSchema.safeParse({
        ...sc, nodes: sc.nodes.map((n) => (n.id === 'anchor-1' ? { ...n, uwb: { role: 'anchor', yawDeg } } : n)),
      }).success).toBe(true)
    }
    expect(ScenarioSchema.safeParse({
      ...sc, nodes: sc.nodes.map((n) => (n.id === 'anchor-1' ? { ...n, uwb: { role: 'anchor', yawDeg: 181 } } : n)),
    }).success).toBe(false)
  })

  it('takes a contention session back to the time schedule when a one-way mode is picked', () => {
    // Exactly what the method select does for DS-TWR: the schema takes a one-way round in a
    // time-scheduled session only, so the field changes the pair together rather than leaving
    // the user a plan it rejects, with the fix two fields away.
    const contending: Partial<UwbSessionCfg> = { method: 'ss', schedule: 'contention' }
    expect(uwbSessionIssue(withUwb(4, { ...contending, mode: 'ul-tdoa' }))).toMatch(/one-way|two-way/i)
    expect(uwbModePatch('ul-tdoa')).toEqual({ mode: 'ul-tdoa', schedule: 'time', aoa: false })
    expect(uwbSessionIssue(withUwb(4, { ...contending, ...uwbModePatch('ul-tdoa') }))).toBeNull()
    // Going back to two-way ranging touches the mode alone: the schedule is the user's again.
    expect(uwbModePatch('twr')).toEqual({ mode: 'twr' })
    expect(uwbSessionIssue(withUwb(4, { ...contending, ...uwbModePatch('twr') }))).toBeNull()
  })

  it('refuses angle of arrival outside two-way ranging, and the mode select clears it', () => {
    // A bearing is measured on a frame the tag sends the anchor, and a one-way round has none:
    // in DL-TDoA the tag never transmits, in UL-TDoA its blink is answered by nobody. The engine
    // already ignored the flag there, so the schema now refuses the pair instead of letting a
    // hand-edited plan carry a setting that does nothing.
    for (const mode of ['dl-tdoa', 'ul-tdoa'] as const) {
      const bad = withUwb(4, { mode, aoa: true })
      expect(ScenarioSchema.safeParse(bad).success, mode).toBe(false)
      expect(uwbSessionIssue(bad), mode).toBe('angle of arrival is measured on two-way responses; turn it off for TDoA modes')
    }
    // and the field the user actually touches never produces that pair
    expect(uwbModePatch('dl-tdoa')).toEqual({ mode: 'dl-tdoa', schedule: 'time', aoa: false })
    expect(uwbSessionIssue(withUwb(4, { aoa: true, ...uwbModePatch('dl-tdoa') }))).toBeNull()
    // two-way ranging keeps the checkbox the user's own
    expect(uwbModePatch('twr').aoa).toBeUndefined()
    expect(uwbSessionIssue(withUwb(4, { aoa: true, ...uwbModePatch('twr') }))).toBeNull()
  })

  it('the method select patches the schedule with it, both ways', () => {
    // The same invariant as the mode select, in the pure helper the field calls: the editor can
    // never leave the plan in the pair the schema rejects.
    const contending: Partial<UwbSessionCfg> = { method: 'ss', schedule: 'contention' }
    expect(uwbMethodPatch('ds')).toEqual({ method: 'ds', schedule: 'time' })
    expect(uwbSessionIssue(withUwb(4, { ...contending, ...uwbMethodPatch('ds') }))).toBeNull()
    // going back to SS-TWR leaves the schedule alone: it is the user's field again
    expect(uwbMethodPatch('ss')).toEqual({ method: 'ss' })
    expect(uwbSessionIssue(withUwb(4, { ...contending, ...uwbMethodPatch('ss') }))).toBeNull()
  })

  it('still needs four anchors for a one-way mode, which no field can patch away', () => {
    expect(uwbSessionIssue(withUwb(3, uwbModePatch('ul-tdoa')))).toContain('at least 4 anchors')
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

  it('claims a bound on a session field, whose message never says UWB', () => {
    const msg = uwbSessionIssue(withUwb(4, { slotRstu: 3 }))
    expect(msg).toContain('300') // path ['uwb', 'slotRstu']
    expect(msg).not.toMatch(/UWB|ranging/i)
  })

  it('claims a field issue on a ranging device', () => {
    const sc = withUwb(2)
    const bad: Scenario = {
      ...sc,
      nodes: sc.nodes.map((n) => (n.kind === 'uwb' ? { ...n, txPowerDbm: 'loud' as unknown as number } : n)),
    }
    expect(uwbSessionIssue(bad)).toBeTruthy()
  })

  it('is what the schema paths say, not what the messages word: every session rule is rooted at uwb', () => {
    // The match is by path, so each rule has to carry one; a coexistence rule that merely
    // mentions UWB on a Wi-Fi path must not be dragged under the session section.
    const cases: Scenario[] = [
      withUwb(10), // more anchors than a round carries
      withUwb(6, { slotRstu: 300 }), // slot too short for the Final
      { ...withUwb(4), nodes: withUwb(4).nodes.filter((n) => n.uwb?.role !== 'tag') }, // no tag
      { ...withUwb(2), uwb: undefined }, // nodes without a session
    ]
    for (const sc of cases) {
      const parsed = ScenarioSchema.safeParse(sc)
      expect(parsed.success).toBe(false)
      if (parsed.success) continue
      const worded = parsed.error.issues.filter((i) => /\bUWB\b|ranging/i.test(i.message))
      expect(worded.length).toBeGreaterThan(0)
      for (const i of worded) expect(i.path[0], i.message).toBe('uwb')
    }
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
