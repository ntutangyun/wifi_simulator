/**
 * The fading panel's logic — not its wording.
 *
 * Four things are worth holding still here, and the first three are about what the panel is
 * *allowed to produce*. Nothing validates on the way up: `setScenario` stores whatever the
 * editor hands it and the schema parse happens inside `Simulation`, so a control that commits
 * a section the schema would refuse hands the user a plan that throws on Run with the fix
 * several fields away.
 *
 * 1. which fields are grey, and when;
 * 2. that a refused value is refused, so the field can keep the last one that worked;
 * 3. that every section these functions *can* build is one `ScenarioSchema` accepts —
 *    checked by building it and parsing it, not by re-stating the rule;
 * 4. and, once, that what the switch commits actually changes what a run does. Schema-valid
 *    is not the same as wired up.
 *
 * The labels, hints and red lines themselves are not tested: they are copy, and a test that
 * pinned them would fail on every rewording without ever catching a bug.
 */
import { describe, it, expect } from 'vitest'
import {
  fadingFieldsLive, fadingSmallScalePatch, fadingToggle,
  parseCoherenceMs, parseRicianKdB, parseShadowSigmaDb, scenarioFromJson, scenarioToJson, withFading,
} from '../../src/editor/planOps'
import { FADING_DEFAULTS, RICIAN_K_DEFAULT_DB, type FadingCfg } from '../../src/engine/fading'
import { ScenarioSchema, defaultScenario } from '../../src/model/scenario'
import { Simulation } from '../../src/engine/simulation'
import { LESSONS } from '../../src/course/lessons'

const SMALL_SCALES: FadingCfg['smallScale'][] = ['none', 'rayleigh', 'rician']

/** What the store would hold after the panel committed this section, parsed as the run parses it. */
const parseWith = (fading: FadingCfg | undefined) =>
  ScenarioSchema.safeParse(withFading(defaultScenario(), fading))

describe('which fields the panel greys out', () => {
  it('greys all four while the plan has no fading section', () => {
    expect(fadingFieldsLive(undefined)).toEqual({ fields: false, ricianKdB: false })
  })

  it('lights the three common fields as soon as the section exists', () => {
    expect(fadingFieldsLive(fadingToggle(true)).fields).toBe(true)
  })

  it('leaves the K factor grey under every distribution but rician', () => {
    for (const smallScale of SMALL_SCALES) {
      const live = fadingFieldsLive(fadingSmallScalePatch(FADING_DEFAULTS, smallScale))
      expect(live.ricianKdB, smallScale).toBe(smallScale === 'rician')
      expect(live.fields, smallScale).toBe(true)
    }
  })
})

describe('the switch writes the section, and removes it', () => {
  it('off is the absent section, which is what the engine reads as "no fading"', () => {
    expect(fadingToggle(false)).toBeUndefined()
    const off = withFading(defaultScenario(), fadingToggle(false))
    // Not merely `undefined`: the key is gone, so a plan whose switch was turned off again is
    // the same object as one that was never here. `{ ...sc, fading: undefined }` keeps the key,
    // and the schema's output keeps it too.
    expect('fading' in off).toBe(false)
    const parsed = ScenarioSchema.safeParse(off)
    expect(parsed.success).toBe(true)
    expect('fading' in (parsed as unknown as { data: Record<string, unknown> }).data).toBe(false)
  })

  it('turning the switch off again leaves the plan it started from', () => {
    const start = defaultScenario()
    const on = withFading(start, fadingToggle(true))
    expect(withFading(on, fadingToggle(false))).toStrictEqual(start)
  })

  it('on writes the four defaults — and no K factor, since the default is rayleigh', () => {
    const on = fadingToggle(true)
    expect(on).toEqual({
      shadowSigmaDb: FADING_DEFAULTS.shadowSigmaDb,
      coherenceMs: FADING_DEFAULTS.coherenceMs,
      smallScale: FADING_DEFAULTS.smallScale,
    })
    // FADING_DEFAULTS itself carries a K factor beside `rayleigh`; committing it as it stands
    // is exactly the illegal section this test exists to keep out of the store.
    expect(FADING_DEFAULTS.ricianKdB).toBe(RICIAN_K_DEFAULT_DB)
    expect(parseWith(FADING_DEFAULTS as FadingCfg).success).toBe(false)
    expect(parseWith(on).success).toBe(true)
  })
})

describe('picking a distribution never leaves a setting the engine will not read', () => {
  it('adds the K factor on the way into rician and drops it on the way out', () => {
    const rician = fadingSmallScalePatch(fadingToggle(true)!, 'rician')
    expect(rician.ricianKdB).toBe(RICIAN_K_DEFAULT_DB)
    for (const smallScale of ['none', 'rayleigh'] as const) {
      const off = fadingSmallScalePatch({ ...rician, ricianKdB: 12 }, smallScale)
      expect('ricianKdB' in off, smallScale).toBe(false)
    }
  })

  it('does not resurrect the K factor a previous rician had', () => {
    const back = fadingSmallScalePatch(
      fadingSmallScalePatch({ ...fadingToggle(true)!, smallScale: 'rician', ricianKdB: 12 }, 'rayleigh'),
      'rician',
    )
    expect(back.ricianKdB).toBe(RICIAN_K_DEFAULT_DB)
  })

  it('survives a save and a load, which is where an illegal section would land', () => {
    // 💾 Save writes JSON and 📂 Load parses it back through the schema. A section the panel
    // can build but the schema cannot re-read is a save/load bug for whoever saves first.
    for (const smallScale of SMALL_SCALES) {
      const sc = withFading(defaultScenario(), fadingSmallScalePatch(fadingToggle(true)!, smallScale))
      expect(scenarioFromJson(scenarioToJson(sc)).fading, smallScale).toEqual(sc.fading)
    }
  })

  it('produces a section the schema accepts, from every distribution to every other', () => {
    for (const from of SMALL_SCALES) {
      for (const to of SMALL_SCALES) {
        const start = fadingSmallScalePatch(fadingToggle(true)!, from)
        const next = fadingSmallScalePatch(start, to)
        expect(parseWith(next).success, `${from} → ${to}`).toBe(true)
      }
    }
  })
})

describe('a value the schema would refuse never reaches the scenario', () => {
  /** Each field's parser, the schema field it guards, and text the field must refuse. */
  const FIELDS = [
    {
      name: 'shadowSigmaDb',
      parse: parseShadowSigmaDb,
      refused: ['', '   ', 'abc', '-0.1', '-4', 'NaN', 'Infinity'],
      accepted: ['0', '4', '8.5'],
      put: (v: number): FadingCfg => ({ ...fadingToggle(true)!, shadowSigmaDb: v }),
    },
    {
      name: 'coherenceMs',
      parse: parseCoherenceMs,
      refused: ['', ' ', 'abc', '0', '-100', 'Infinity'],
      accepted: ['0.5', '100', '1000'],
      put: (v: number): FadingCfg => ({ ...fadingToggle(true)!, coherenceMs: v }),
    },
    {
      name: 'ricianKdB',
      parse: parseRicianKdB,
      // K is a ratio in dB and the schema bounds it at neither end: a negative K is a
      // line-of-sight component weaker than the scatter, which is a real link.
      refused: ['', 'abc', '--3', 'Infinity'],
      accepted: ['-3', '0', '6', '20'],
      put: (v: number): FadingCfg => fadingSmallScalePatch({ ...fadingToggle(true)!, ricianKdB: v }, 'rician'),
    },
  ]

  for (const f of FIELDS) {
    it(`${f.name}: refuses text the schema would refuse, so nothing is committed`, () => {
      for (const raw of f.refused) expect(f.parse(raw), raw).toBeNull()
    })

    it(`${f.name}: what it does accept, the schema accepts too`, () => {
      for (const raw of f.accepted) {
        const v = f.parse(raw)
        expect(v, raw).not.toBeNull()
        expect(parseWith(f.put(v!)).success, raw).toBe(true)
      }
    })
  }

  it('refuses the blank field rather than committing the 0 that Number() makes of it', () => {
    // The trap this shape exists for: `Number('')` is 0, so a lenient field would silently
    // turn the shadowing off — a legal value, and not the one anyone typed.
    expect(Number('')).toBe(0)
    expect(parseShadowSigmaDb('')).toBeNull()
    expect(parseCoherenceMs('')).toBeNull()
    expect(parseRicianKdB('')).toBeNull()
  })

  it('the refused sigma and coherence really are values the schema rejects', () => {
    const on = fadingToggle(true)!
    expect(parseWith({ ...on, shadowSigmaDb: -4 }).success).toBe(false)
    expect(parseWith({ ...on, coherenceMs: 0 }).success).toBe(false)
    expect(parseWith({ ...on, coherenceMs: -100 }).success).toBe(false)
  })
})

/**
 * The one test here that runs the engine: schema-valid is not the same as wired up. What the
 * switch commits has to reach `linkDbm` and change what the run does, or the panel is a set of
 * fields over nothing.
 *
 * `mcs-ladder`'s own scene is the measuring instrument: its geometry loses no frame at all, so
 * over 200 ms with fading off it produces **zero** RX_FAIL and zero RETRY. That zero is what
 * makes the count with fading on a proof rather than a measurement.
 */
describe('the section the switch commits reaches the run', () => {
  const RUN_NS = 200_000_000
  const lost = (sc: ReturnType<typeof defaultScenario>): number =>
    [...new Simulation(sc).runUntil(RUN_NS).records]
      .filter((r) => r.type === 'RX_FAIL' || r.type === 'RETRY').length

  it('turns a scene that loses nothing into one that does', () => {
    const base = LESSONS.find((l) => l.id === 'mcs-ladder')!.scenario()
    expect(lost(withFading(base, fadingToggle(false)))).toBe(0)
    expect(lost(withFading(base, fadingToggle(true)))).toBeGreaterThan(0)
  })
})
