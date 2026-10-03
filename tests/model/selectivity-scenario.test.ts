/**
 * `Scenario.selectivity`: the optional section that turns per-26-tone-RU frequency selectivity
 * on (design doc 2026-10-03-selectivity-design.md §3.4/§6).
 *
 * Same discipline as `fading-scenario.test.ts`: the section is switched by its own *presence*,
 * never by a value inside it, and a scenario that never mentions it must parse to an object with
 * no `selectivity` key at all — not one holding `{}`. Unlike `fading`, this section has nothing
 * of its own to default: the bin count is computed from the standard
 * (`src/engine/selectivity.ts`) and the per-bin deviation borrows `fading`'s own `smallScale` /
 * `ricianKdB`, so `selectivity: {}` is the *only* legal non-empty shape this section ever takes.
 */
import { describe, it, expect } from 'vitest'
import { ScenarioSchema, defaultScenario, type Scenario } from '../../src/model/scenario'

/** The repo's one stock scenario: an eht AP, an he STA and a vht STA, no fading, no selectivity. */
const base = (): Scenario => defaultScenario()

/** `base()` plus a `fading` section that actually fades — the minimum selectivity can borrow. */
const withFadingOn = (): Scenario => ({ ...base(), fading: { smallScale: 'rayleigh' } } as Scenario)

/** `base()` plus fading, with every node's generation forced to `nonht` — nothing to subdivide. */
const nonOfdmWithFading = (): Scenario => ({
  ...base(),
  nodes: base().nodes.map((n) => ({ ...n, caps: { ...n.caps, generation: 'nonht' as const } })),
  fading: { smallScale: 'rayleigh' },
} as Scenario)

describe('Scenario.selectivity is absent by default, not defaulted', () => {
  it('a scenario with no selectivity section parses to an object with no selectivity property', () => {
    const parsed = ScenarioSchema.parse(base()) as unknown as Record<string, unknown>
    expect('selectivity' in parsed).toBe(false)
    expect(Object.keys(parsed)).not.toContain('selectivity')
  })

  it('the default scenario carries no selectivity section', () => {
    expect(base().selectivity).toBeUndefined()
  })

  it('round-tripping a scenario without selectivity through JSON adds no selectivity key', () => {
    const parsed = ScenarioSchema.parse(JSON.parse(JSON.stringify(base()))) as unknown as Record<string, unknown>
    expect('selectivity' in parsed).toBe(false)
  })

  it('an existing scenario (no fading, no selectivity) still parses with both sections absent', () => {
    // The byte-identical guarantee (design doc §8) rests on this: no scenario in the repo has
    // ever had a fading section, so no scenario can trip the "selectivity needs fading" refusal
    // by accident.
    const parsed = ScenarioSchema.parse(base()) as unknown as Record<string, unknown>
    expect('fading' in parsed).toBe(false)
    expect('selectivity' in parsed).toBe(false)
  })
})

describe('Scenario.selectivity carries nothing to configure', () => {
  it('accepts an empty section once fading is on and an he/eht link exists', () => {
    const sc = { ...withFadingOn(), selectivity: {} }
    const parsed = ScenarioSchema.parse(sc)
    expect(parsed.selectivity).toEqual({})
  })

  it('has no bin-count field: the standard, not the plan, decides the bin count', () => {
    const sc = { ...withFadingOn(), selectivity: { binsPer20Mhz: 99 } }
    // Unknown keys are stripped by zod's default object mode, so this does not throw — but the
    // parsed section must not carry the invented field either.
    const parsed = ScenarioSchema.parse(sc)
    expect(parsed.selectivity).toEqual({})
  })
})

describe('Scenario.selectivity refusals (design doc §6 upper table)', () => {
  it('rejects selectivity with no fading section at all', () => {
    const sc = { ...base(), selectivity: {} }
    expect(() => ScenarioSchema.parse(sc)).toThrow(/fading/)
  })

  it('names the refusal on the selectivity path when fading is missing', () => {
    const r = ScenarioSchema.safeParse({ ...base(), selectivity: {} })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.some((i) => i.path.join('.') === 'selectivity')).toBe(true)
  })

  it('rejects selectivity with fading.smallScale: none', () => {
    const sc = { ...base(), fading: { smallScale: 'none' }, selectivity: {} }
    expect(() => ScenarioSchema.parse(sc)).toThrow(/smallScale|small[Ss]cale/)
  })

  it('accepts selectivity with fading.smallScale: rayleigh', () => {
    const sc = { ...withFadingOn(), selectivity: {} }
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
  })

  it('accepts selectivity with fading.smallScale: rician', () => {
    const sc = { ...base(), fading: { smallScale: 'rician' }, selectivity: {} }
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
  })

  it('rejects selectivity when the scene has no eht/he link (all nonht)', () => {
    expect(() => ScenarioSchema.parse({ ...nonOfdmWithFading(), selectivity: {} })).toThrow()
  })

  it('rejects selectivity on a scene whose only link is vht, OFDM though it is', () => {
    // This case was accepted until Task 6c, on the reasoning that a 26-tone RU subdivides an
    // OFDM channel and VHT is OFDM. The 26-tone RU is a clause 27 / 36 unit instead, defined at
    // HE/EHT's 78.125 kHz subcarrier spacing; clause 21 is spaced 312.5 kHz, four times coarser.
    // This repo's own table is the evidence: TONES_VHT[20] = 52 against TONES_HE[20] = 234 for
    // the same 20 MHz (src/engine/phy.ts). So VHT *was* the "wrong subcarrier spacing" this
    // refusal's own sentence warns about, and the rule used to wave it through.
    const sc = {
      ...withFadingOn(),
      nodes: base().nodes.map((n) => ({ ...n, caps: { ...n.caps, generation: 'vht' as const } })),
      selectivity: {},
    }
    expect(() => ScenarioSchema.parse(sc)).toThrow(/eht 或 he 链路/)
  })

  it('accepts selectivity on a mixed scene that keeps a vht link beside an he one', () => {
    // The rule is "at least one", not "every link": an he link does not stop being divisible
    // because a vht station shares the scene. What that vht station's own PPDUs must not get is
    // a bin, and only the engine can decide that (isOfdmWifiPpdu, src/engine/channel.ts) —
    // which is why the schema is deliberately not the only gate.
    expect(base().nodes.map((n) => n.caps.generation)).toContain('vht')
    expect(() => ScenarioSchema.parse({ ...withFadingOn(), selectivity: {} })).not.toThrow()
  })

  it('selectivity without fading and with no he/eht link reports both refusals at once', () => {
    const sc = {
      ...nonOfdmWithFading(),
      fading: undefined,
      selectivity: {},
    }
    const r = ScenarioSchema.safeParse(sc)
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.length).toBeGreaterThanOrEqual(2)
  })
})

describe('no refusal loop between the three selectivity rules', () => {
  // The brief's own warning: two refusals that each tell the reader to do what the other
  // forbids. Walked every pairwise combination of the new section against the two sections it
  // reads — fading's presence/smallScale, and the scene's node generations — and none of the
  // three remedies ("add fading", "change smallScale", "add an he/eht link") is something either
  // of the other two rules would then refuse.
  it('adding fading (as the first refusal asks) does not trip the smallScale refusal', () => {
    // fading: {} defaults smallScale to rayleigh (FADING_DEFAULTS), which the second rule accepts.
    const sc = { ...base(), fading: {}, selectivity: {} }
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
  })

  it('changing smallScale away from none (as the second refusal asks) does not revive the fading-absent refusal', () => {
    const sc = { ...base(), fading: { smallScale: 'rayleigh' }, selectivity: {} }
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
  })

  it('adding an he/eht link (as the third refusal asks) does not disturb the fading rules', () => {
    const sc = { ...withFadingOn(), selectivity: {} }
    const r = ScenarioSchema.safeParse(sc)
    expect(r.success).toBe(true)
  })

  it('all three remedies applied together produce one clean parse', () => {
    const sc = {
      ...base(),
      fading: { smallScale: 'rician' },
      selectivity: {},
    }
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
  })
})

describe('the schema parses its own output', () => {
  it('round-trips a selectivity-on scenario through the whole schema twice', () => {
    const sc = { ...withFadingOn(), selectivity: {} }
    const once = ScenarioSchema.parse(sc)
    const twice = ScenarioSchema.safeParse(once)
    const why = twice.success ? '' : twice.error.issues.map((i) => i.message).join(' | ')
    expect(twice.success, why).toBe(true)
  })

  it('reaches the same selectivity section both times', () => {
    const sc = { ...withFadingOn(), selectivity: {} }
    const once = ScenarioSchema.parse(sc)
    const twice = ScenarioSchema.parse(once)
    expect(twice.selectivity).toEqual(once.selectivity)
  })
})
