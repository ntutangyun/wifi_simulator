/**
 * The reflecting-objects panel's logic — not its wording.
 *
 * Four things are worth holding still, and the first two are the ones a bug would hide in.
 *
 * 1. **The section's absence is load-bearing.** Echoes are switched by whether `scatterers` is
 *    *there*, not by its length (src/model/scenario.ts), so deleting the last object has to take
 *    the key with it. A plan left holding `scatterers: []` would put every run into the echo
 *    branch to loop over nothing — and, worse, would be indistinguishable in the editor from a
 *    plan that deliberately says "the section is on, there is nothing to reflect off".
 * 2. **Nothing invalid may reach the scenario.** Nothing validates on the way up: `setScenario`
 *    stores whatever the editor hands it and the schema parse happens inside `Simulation`, so a
 *    field that commits a figure the schema would refuse hands the user a plan that throws on
 *    Run with the fix several panels away. So every value the parser accepts is checked by
 *    *building the scenario and parsing it*, not by restating the rule.
 * 3. **A placed object survives save and load**, which is where the fading slice was bitten: a
 *    schema whose output is not valid input is a save/load bug waiting for the first person who
 *    saves.
 * 4. And, once, that what the tool places actually changes what a run does. Schema-valid is not
 *    the same as wired up.
 *
 * The labels, hints and red lines are not tested: they are copy, and a test that pinned them
 * would fail on every rewording without ever catching a bug.
 */
import { describe, it, expect } from 'vitest'
import {
  NEW_SCATTERER_EXTRA_LOSS_DB, hitTestScatterer, moveScatterer, newAnchor, newScatterer, newUwbTag,
  parseScattererNumber, removeScatterer, scenarioFromJson, scenarioToJson, updateScatterer,
  withScatterers,
} from '../../src/editor/planOps'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { Simulation } from '../../src/engine/simulation'

const MS = 1_000_000

/** A plan with a room and nothing in it: no AP, which the schema allows as long as nothing
 * Wi-Fi is present, so these tests are about the scatterers section and nothing else. */
const emptyPlan = (): Scenario => ({
  rooms: [{ x: -1, y: -1, w: 8, h: 8, name: 'lab' }],
  walls: [],
  nodes: [],
  servers: [],
  seed: 7,
  rtsThresholdBytes: 3000,
  snapshotIntervalMs: 10,
})

/** An anchor and a tag two metres apart — the only baseline an echo is audible across
 * (tasks 3 and 4: reach is genuinely short), placed the way the editor places them. */
function uwbPair(): Scenario {
  let sc = emptyPlan()
  sc = newAnchor(sc, { x: 0, y: 0 }).sc
  sc = newUwbTag(sc, { x: 2, y: 0 }).sc
  return sc
}

describe('the section is there or it is not', () => {
  it('a plan that has never been here has no scatterers key', () => {
    expect('scatterers' in emptyPlan()).toBe(false)
  })

  it('placing the first object writes the section', () => {
    const { sc, id } = newScatterer(emptyPlan(), { x: 1, y: 1 })
    expect(sc.scatterers).toHaveLength(1)
    expect(sc.scatterers![0].id).toBe(id)
  })

  it('removing the last object removes the key, not just its contents', () => {
    const { sc, id } = newScatterer(emptyPlan(), { x: 1, y: 1 })
    const gone = removeScatterer(sc, id)
    // The point of the whole file: not `[]`, and not `undefined` under a key that is still
    // there. An empty list is a different statement, and a key holding `undefined` survives the
    // schema parse.
    expect('scatterers' in gone).toBe(false)
    expect(gone.scatterers).toBeUndefined()
    expect('scatterers' in ScenarioSchema.parse(gone)).toBe(false)
  })

  it('removing one of two leaves the other one in the section', () => {
    const one = newScatterer(emptyPlan(), { x: 1, y: 1 })
    const two = newScatterer(one.sc, { x: 2, y: 2 })
    const left = removeScatterer(two.sc, one.id)
    expect(left.scatterers?.map((s) => s.id)).toEqual([two.id])
  })

  it('an emptied list is the absent section however it got empty', () => {
    expect('scatterers' in withScatterers(emptyPlan(), [])).toBe(false)
    const { sc, id } = newScatterer(emptyPlan(), { x: 1, y: 1 })
    expect('scatterers' in withScatterers(sc, sc.scatterers!.filter((s) => s.id !== id))).toBe(false)
  })
})

describe('what the tool places', () => {
  it('states extraLossDb rather than leaning on a default, because there is none', () => {
    const { sc } = newScatterer(emptyPlan(), { x: 1, y: 1 })
    expect(sc.scatterers![0].extraLossDb).toBe(NEW_SCATTERER_EXTRA_LOSS_DB)
    // …and the schema really does refuse a plan that left the figure out, which is why the
    // panel has to pass one: 0 dB is "exactly one square metre", not "neutral".
    const { extraLossDb: _dropped, ...noLevel } = sc.scatterers![0]
    expect(ScenarioSchema.safeParse({ ...sc, scatterers: [noLevel] }).success).toBe(false)
  })

  it('snaps to the 0.1 m grid on placement and on every drag', () => {
    const { sc, id } = newScatterer(emptyPlan(), { x: 1.234, y: 2.678 })
    // `toBeCloseTo`, not `toEqual`: `snap` is a round-trip through a division, so a snapped
    // coordinate carries the same float dust every node placement carries.
    expect(sc.scatterers![0].pos.x).toBeCloseTo(1.2, 9)
    expect(sc.scatterers![0].pos.y).toBeCloseTo(2.7, 9)
    const moved = moveScatterer(sc, id, { x: 3.049, y: -0.06 })
    expect(moved.scatterers![0].pos.x).toBeCloseTo(3.0, 9)
    expect(moved.scatterers![0].pos.y).toBeCloseTo(-0.1, 9)
  })

  it('leaves the height alone when dragged across the floor', () => {
    const { sc, id } = newScatterer(emptyPlan(), { x: 1, y: 1 })
    const raised = updateScatterer(sc, id, { pos: { ...sc.scatterers![0].pos, z: 1.8 } })
    expect(moveScatterer(raised, id, { x: 4, y: 4 }).scatterers![0].pos.z).toBe(1.8)
  })

  it('never hands out an id twice, even after deleting from the middle', () => {
    let sc = emptyPlan()
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      const placed = newScatterer(sc, { x: i, y: 0 })
      sc = placed.sc
      ids.push(placed.id)
    }
    sc = removeScatterer(sc, ids[1])
    const again = newScatterer(sc, { x: 5, y: 0 })
    const all = again.sc.scatterers!.map((s) => s.id)
    expect(new Set(all).size).toBe(all.length)
    // and the schema agrees, since duplicate ids are a rule it enforces itself
    expect(ScenarioSchema.safeParse(again.sc).success).toBe(true)
  })

  it('finds the object under the pointer, and nothing when there is none', () => {
    const { sc, id } = newScatterer(emptyPlan(), { x: 1, y: 1 })
    expect(hitTestScatterer(sc.scatterers, { x: 1.05, y: 1 }, 0.3)).toBe(id)
    expect(hitTestScatterer(sc.scatterers, { x: 3, y: 3 }, 0.3)).toBeNull()
    expect(hitTestScatterer(undefined, { x: 1, y: 1 }, 0.3)).toBeNull()
  })
})

describe('what the number fields may commit', () => {
  it('refuses text that is not a finite number, so the field keeps the last value that worked', () => {
    for (const raw of ['', '   ', 'abc', 'NaN', 'Infinity', '-Infinity', '1,2', '3 dB']) {
      expect(parseScattererNumber(raw), raw).toBeNull()
    }
  })

  it('accepts the figures the physics has, including the negative ones', () => {
    // No lower bound anywhere: 0 dB is one square metre, +3.01 is half of one, and a wardrobe
    // is legitimately negative (`apertureCorrectionDb`, src/engine/scatter.ts).
    for (const raw of ['0', '3.01', '-10', '-40.5', '0.0']) {
      expect(parseScattererNumber(raw), raw).toBe(Number(raw))
    }
  })

  it('builds only scenarios the schema accepts, checked by parsing them', () => {
    const { sc, id } = newScatterer(emptyPlan(), { x: 1, y: 1 })
    for (const raw of ['0', '3.01', '-10', '-40.5']) {
      const v = parseScattererNumber(raw)!
      expect(ScenarioSchema.safeParse(updateScatterer(sc, id, { extraLossDb: v })).success, raw).toBe(true)
      const pos = { ...sc.scatterers![0].pos, z: v }
      expect(ScenarioSchema.safeParse(updateScatterer(sc, id, { pos })).success, raw).toBe(true)
    }
  })

  it('and the values it refuses are exactly the ones the schema would refuse', () => {
    const { sc, id } = newScatterer(emptyPlan(), { x: 1, y: 1 })
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(ScenarioSchema.safeParse(updateScatterer(sc, id, { extraLossDb: bad })).success).toBe(false)
      const pos = { ...sc.scatterers![0].pos, z: bad }
      expect(ScenarioSchema.safeParse(updateScatterer(sc, id, { pos })).success).toBe(false)
    }
  })
})

describe('save and load', () => {
  it('round-trips a placed object through the scenario JSON, unchanged', () => {
    const { sc } = newScatterer(uwbPair(), { x: 1, y: 1 })
    const back = scenarioFromJson(scenarioToJson(sc))
    expect(back.scatterers).toEqual(sc.scatterers)
  })

  it('round-trips a plan with no objects as a plan with no section', () => {
    const { sc, id } = newScatterer(uwbPair(), { x: 1, y: 1 })
    const back = scenarioFromJson(scenarioToJson(removeScatterer(sc, id)))
    expect('scatterers' in back).toBe(false)
  })

  it('parses its own output again after an edit, the trap the fading slice fell into', () => {
    const { sc, id } = newScatterer(uwbPair(), { x: 1, y: 1 })
    const edited = updateScatterer(scenarioFromJson(scenarioToJson(sc)), id, { extraLossDb: 0 })
    expect(() => scenarioFromJson(scenarioToJson(edited))).not.toThrow()
  })
})

describe('placing one changes what a run does', () => {
  /** How many echoes a run of this plan reports. */
  const echoes = (sc: Scenario): number =>
    new Simulation(ScenarioSchema.parse(sc)).runUntil(30 * MS).records
      .filter((r) => r.type === 'UWB_ECHO').length

  it('is silent until an object is placed, and reports echoes once one is', () => {
    const pair = uwbPair()
    expect(echoes(pair)).toBe(0)
    // 1 m off the 2 m line: 0.83 m of detour, past the 0.60 m a chip resolves, and loud enough
    // to clear the receiver's floor at the reflectivity the tool writes.
    expect(echoes(newScatterer(pair, { x: 1, y: 1 }).sc)).toBeGreaterThan(0)
  })

  it('and is silent again once the last object is deleted', () => {
    const { sc, id } = newScatterer(uwbPair(), { x: 1, y: 1 })
    expect(echoes(removeScatterer(sc, id))).toBe(0)
  })
})
