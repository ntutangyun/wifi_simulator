/**
 * `Scenario.fading`: the optional section that turns the time-varying link on.
 *
 * The first describe below is the one the rest of the slice rests on. Fading is
 * switched by the *presence* of the section, not by a value inside it, because
 * the byte-identical guarantee for every existing scenario comes from
 * `linkDbm` never entering the fading branch at all — not from the branch
 * happening to add 0 dB. So a scenario that says nothing about fading must
 * parse to an object with no `fading` key whatsoever. A `.default()` on the
 * section itself would fill it in, every existing scenario would take the
 * branch, and both hash fixtures would move; these tests are what stops that.
 */
import { describe, it, expect } from 'vitest'
import { ScenarioSchema, defaultScenario, type Scenario } from '../../src/model/scenario'
import { FADING_DEFAULTS } from '../../src/engine/fading'

/** A plain two-room house with no fading section — the shape of every scenario in the repo today. */
const base = (): Scenario => defaultScenario()

/** Parse a scenario plus a raw `fading` section, as a hand-edited or imported plan would carry it. */
function parseWith(fading: unknown): Record<string, unknown> {
  return ScenarioSchema.parse({ ...base(), fading }) as unknown as Record<string, unknown>
}

describe('Scenario.fading is absent by default, not defaulted', () => {
  it('a scenario with no fading section parses to an object with no fading property', () => {
    const parsed = ScenarioSchema.parse(base()) as unknown as Record<string, unknown>
    expect('fading' in parsed).toBe(false)
    expect(Object.keys(parsed)).not.toContain('fading')
  })

  it('the default scenario carries no fading section', () => {
    expect(base().fading).toBeUndefined()
  })

  it('round-tripping a scenario without fading through JSON adds no fading key', () => {
    const parsed = ScenarioSchema.parse(JSON.parse(JSON.stringify(base()))) as unknown as Record<string, unknown>
    expect('fading' in parsed).toBe(false)
  })
})

describe('Scenario.fading, once written, gets the four defaults', () => {
  it('an empty section fills all four fields from FADING_DEFAULTS', () => {
    expect(parseWith({}).fading).toEqual(FADING_DEFAULTS)
  })

  it('a field that is written wins over its default', () => {
    expect(parseWith({ shadowSigmaDb: 7, coherenceMs: 250 }).fading).toEqual({
      ...FADING_DEFAULTS, shadowSigmaDb: 7, coherenceMs: 250,
    })
  })

  it('choosing rician without a K factor gets the default K', () => {
    expect(parseWith({ smallScale: 'rician' }).fading).toEqual({
      ...FADING_DEFAULTS, smallScale: 'rician',
    })
  })

  it('accepts an explicit K factor under rician', () => {
    expect(parseWith({ smallScale: 'rician', ricianKdB: 10 }).fading).toEqual({
      ...FADING_DEFAULTS, smallScale: 'rician', ricianKdB: 10,
    })
  })

  it('shadowSigmaDb 0 and smallScale none are both legal: fading on, but flat', () => {
    expect(parseWith({ shadowSigmaDb: 0, smallScale: 'none' }).fading).toEqual({
      ...FADING_DEFAULTS, shadowSigmaDb: 0, smallScale: 'none',
    })
  })

  it('rejects a smallScale distribution the engine has no model for', () => {
    expect(() => parseWith({ smallScale: 'nakagami' })).toThrow()
  })
})

describe('Scenario.fading cross-field and range rules', () => {
  it('rejects a K factor when the distribution is not rician', () => {
    expect(() => parseWith({ smallScale: 'rayleigh', ricianKdB: 6 })).toThrow(/莱斯 K 因子/)
  })

  it('rejects a K factor when the small-scale layer is off altogether', () => {
    expect(() => parseWith({ smallScale: 'none', ricianKdB: 6 })).toThrow(/莱斯 K 因子/)
  })

  it('rejects a K factor under the default distribution, which is rayleigh', () => {
    expect(() => parseWith({ ricianKdB: 6 })).toThrow(/莱斯 K 因子/)
  })

  it('names the offending field on the issue path, so the editor can show it there', () => {
    const r = ScenarioSchema.safeParse({ ...base(), fading: { ricianKdB: 6 } })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.some((i) => i.path.join('.') === 'fading.ricianKdB')).toBe(true)
  })

  it('rejects a negative shadowing sigma', () => {
    expect(() => parseWith({ shadowSigmaDb: -1 })).toThrow()
  })

  it('rejects a coherence time of zero', () => {
    expect(() => parseWith({ coherenceMs: 0 })).toThrow()
  })

  it('rejects a negative coherence time', () => {
    expect(() => parseWith({ coherenceMs: -100 })).toThrow()
  })
})
