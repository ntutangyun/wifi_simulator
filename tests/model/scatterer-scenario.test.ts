/**
 * `Scenario.scatterers`: the optional list of reflecting objects in the room.
 *
 * The first describe below is the one the rest of the slice rests on, and it is
 * the same argument `fading-scenario.test.ts` opens with, for the same reason.
 * Echoes are switched by the *presence* of the section, not by its length: the
 * byte-identical guarantee for every existing scenario comes from the engine
 * never entering the echo branch at all — not from the branch happening to loop
 * over zero objects. So a scenario that says nothing about scatterers must parse
 * to an object with no `scatterers` key whatsoever. A `.default([])` on the
 * field would fill it in, every existing scenario would take the branch, and
 * both hash fixtures would be at risk; these tests are what stops that.
 *
 * The second describe is the lesson the fading slice paid for: a schema whose
 * output is not valid input is a save/load bug waiting for the first person who
 * saves. It is written here before the engine work reaches it, and it covers
 * every shape this section allows.
 */
import { describe, it, expect } from 'vitest'
import { ScenarioSchema, defaultScenario, type Scenario } from '../../src/model/scenario'
import type { ScattererCfg } from '../../src/engine/scatter'

/** A plain two-room house with no scatterers — the shape of every scenario in the repo today. */
const base = (): Scenario => defaultScenario()

/** One legal object: a person-sized reflector standing off to the side of the room. */
const one = (over: Partial<ScattererCfg> = {}): ScattererCfg => ({
  id: 'obj-1', pos: { x: 3, y: 3, z: 1 }, extraLossDb: 3.01, ...over,
})

/** Parse a scenario plus a raw `scatterers` section, as a hand-edited or imported plan carries it. */
function parseWith(scatterers: unknown): Record<string, unknown> {
  return ScenarioSchema.parse({ ...base(), scatterers }) as unknown as Record<string, unknown>
}

describe('Scenario.scatterers is absent by default, not defaulted to []', () => {
  it('a scenario with no scatterers section parses to an object with no scatterers property', () => {
    const parsed = ScenarioSchema.parse(base()) as unknown as Record<string, unknown>
    expect('scatterers' in parsed).toBe(false)
    expect(Object.keys(parsed)).not.toContain('scatterers')
  })

  it('the default scenario carries no scatterers section', () => {
    expect(base().scatterers).toBeUndefined()
  })

  it('round-tripping a scenario without scatterers through JSON adds no scatterers key', () => {
    const parsed = ScenarioSchema.parse(JSON.parse(JSON.stringify(base()))) as unknown as Record<string, unknown>
    expect('scatterers' in parsed).toBe(false)
  })

  it('an empty list stays an empty list: it is not folded back into absence', () => {
    // The two are different statements — "this plan has no reflecting objects in
    // it yet" against "this plan predates the section" — and the engine reads
    // them by presence, so the schema must not make either one into the other.
    const parsed = parseWith([])
    expect('scatterers' in parsed).toBe(true)
    expect(parsed.scatterers).toEqual([])
  })
})

describe('Scenario.scatterers, once written, is carried through verbatim', () => {
  it('keeps a single object with its id, position and reflectivity', () => {
    expect(parseWith([one()]).scatterers).toEqual([one()])
  })

  it('keeps several objects, in the order the plan wrote them', () => {
    const list = [one(), one({ id: 'obj-2', pos: { x: 7, y: 1, z: 2 }, extraLossDb: 10 })]
    expect(parseWith(list).scatterers).toEqual(list)
  })

  it('accepts a negative extraLossDb: a reflector larger than one square metre', () => {
    // extraLossDb is the object's reflectivity in dB, and 0 dB is one square
    // metre (`apertureCorrectionDb` in src/engine/scatter.ts spells out why). A
    // filing cabinet is several square metres, so its figure is negative. A
    // `min(0)` here would be a bound the physics does not have.
    expect(parseWith([one({ extraLossDb: -6 })]).scatterers).toEqual([one({ extraLossDb: -6 })])
  })

  it('accepts 0 dB, the one-square-metre reflector', () => {
    expect(parseWith([one({ extraLossDb: 0 })]).scatterers).toEqual([one({ extraLossDb: 0 })])
  })

  it('accepts negative coordinates: the room is not the whole world', () => {
    const s = one({ pos: { x: -2, y: -0.5, z: 0 } })
    expect(parseWith([s]).scatterers).toEqual([s])
  })
})

describe('Scenario.scatterers validation rules', () => {
  it('refuses two objects sharing an id', () => {
    expect(() => parseWith([one(), one({ pos: { x: 8, y: 8, z: 1 } })])).toThrow(/id 重复/)
  })

  it('names the second of the two on the issue path, so the editor can show it there', () => {
    const r = ScenarioSchema.safeParse({ ...base(), scatterers: [one(), one()] })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.some((i) => i.path.join('.') === 'scatterers.1.id')).toBe(true)
  })

  it('accepts two objects with different ids at the same place', () => {
    // Nothing physical forbids it, so the schema does not either; only the ids
    // have to be distinguishable, because the records name the object by id.
    const list = [one(), one({ id: 'obj-2' })]
    expect(parseWith(list).scatterers).toEqual(list)
  })

  it('refuses an empty id', () => {
    expect(() => parseWith([one({ id: '' })])).toThrow(/id 不能为空/)
  })

  it.each(['x', 'y', 'z'] as const)('refuses an infinite %s coordinate', (axis) => {
    expect(() => parseWith([one({ pos: { ...one().pos, [axis]: Infinity } })])).toThrow(/坐标/)
  })

  it.each(['x', 'y', 'z'] as const)('refuses a NaN %s coordinate', (axis) => {
    expect(() => parseWith([one({ pos: { ...one().pos, [axis]: NaN } })])).toThrow()
  })

  it('names the offending axis on the issue path', () => {
    const r = ScenarioSchema.safeParse({ ...base(), scatterers: [one({ pos: { x: 0, y: Infinity, z: 0 } })] })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.some((i) => i.path.join('.') === 'scatterers.0.pos.y')).toBe(true)
  })

  it('refuses an infinite extraLossDb', () => {
    expect(() => parseWith([one({ extraLossDb: -Infinity })])).toThrow(/extraLossDb/)
  })

  it('refuses a NaN extraLossDb', () => {
    expect(() => parseWith([one({ extraLossDb: NaN })])).toThrow()
  })

  it('refuses an object that never says how strongly it reflects', () => {
    // The one figure the geometry cannot supply for itself: 0 dB is not a
    // neutral value but a one-square-metre reflector, so the plan states it.
    const { extraLossDb: _drop, ...noLoss } = one()
    expect(() => parseWith([noLoss])).toThrow(/extraLossDb/)
  })

  it('refuses a scatterers section that is not a list', () => {
    expect(() => parseWith({ 'obj-1': one() })).toThrow()
  })
})

describe('the schema parses its own output', () => {
  // The fading slice shipped a schema whose output was not valid input — a
  // transform filled a field a cross-field rule then refused — and it was only
  // caught once the engine work reached it. Every shape this section allows gets
  // saved and loaded back here.
  const shapes: Array<[string, unknown]> = [
    ['no section at all', undefined],
    ['an empty list', []],
    ['one object', [one()]],
    ['several objects', [one(), one({ id: 'obj-2', pos: { x: 9, y: 4, z: 0.5 }, extraLossDb: -6 })]],
    ['a zero-dB object', [one({ extraLossDb: 0 })]],
    ['an object on the floor at the origin', [one({ pos: { x: 0, y: 0, z: 0 } })]],
  ]

  it.each(shapes)('round-trips %s through the whole schema', (_what, scatterers) => {
    // `undefined` is written as a missing key rather than an explicit one: the
    // absence the engine reads is `'scatterers' in sc`, so the test must not
    // smuggle the key in while claiming to leave it out.
    const sc = scatterers === undefined ? base() : { ...base(), scatterers }
    const once = ScenarioSchema.parse(sc)
    const twice = ScenarioSchema.safeParse(once)
    const why = twice.success ? '' : twice.error.issues.map((i) => i.message).join(' | ')
    expect(twice.success, why).toBe(true)
  })

  it.each(shapes)('%s reaches the same scatterers both times', (_what, scatterers) => {
    const sc = scatterers === undefined ? base() : { ...base(), scatterers }
    const once = ScenarioSchema.parse(sc)
    const twice = ScenarioSchema.parse(once)
    expect(twice.scatterers).toEqual(once.scatterers)
    expect('scatterers' in twice).toBe('scatterers' in once)
  })

  it.each(shapes)('%s survives a JSON save and load, key presence included', (_what, scatterers) => {
    const sc = scatterers === undefined ? base() : { ...base(), scatterers }
    const once = ScenarioSchema.parse(sc)
    const reloaded = ScenarioSchema.parse(JSON.parse(JSON.stringify(once)))
    expect('scatterers' in reloaded).toBe('scatterers' in once)
    expect(reloaded.scatterers).toEqual(once.scatterers)
  })
})
