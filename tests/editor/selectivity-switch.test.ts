/**
 * The frequency-selectivity checkbox's logic — not its wording.
 *
 * The section has no fields, so there is nothing here about greying a number or refusing a
 * draft. What there is instead is the thing that made this control missing in the first place:
 * `selectivity` was legal, validated and read by the engine, and **no surface could set it**. So
 * these tests hold three things still:
 *
 * 1. **when the box can be ticked, and why not** — the three preconditions of the schema's
 *    `superRefine`, one at a time, in combination, and all satisfied;
 * 2. **that the reasons shown are the schema's own strings**, not a second wording of the same
 *    rule, because the panel's copy and the refusal would otherwise drift apart and the one that
 *    drifted would be the one the user reads;
 * 3. **that what the box commits is a plan `ScenarioSchema` accepts**, and that clearing it
 *    returns the plan it started from — key gone, not holding `undefined`.
 *
 * And, once, that the section reaches the run: schema-valid is not the same as wired up, the
 * same closing test `fading-fields.test.ts` ends on.
 *
 * Deliberately *not* an exhaustive `WALK_KEYS`/`OPS` closure like `uwb-planOps.test.ts`'s. That
 * shape earns its weight over a section with a dozen interacting fields; this one has none, and
 * the closure would be a frame around a single boolean.
 */
import { describe, it, expect } from 'vitest'
import { selectivityRefusals, ScenarioSchema, defaultScenario, type Scenario } from '../../src/model/scenario'
import {
  fadingSmallScalePatch, fadingToggle, selectivitySwitch, selectivityToggle, withFading, withSelectivity,
} from '../../src/editor/planOps'
import { Simulation } from '../../src/engine/simulation'
import { LESSONS } from '../../src/course/lessons'

/** The stock plan: an eht AP, an he STA and a vht STA — so the link precondition is already met. */
const base = (): Scenario => defaultScenario()

/** The stock plan with fading on, which is the only state the box can be ticked from. */
const ready = (): Scenario => withFading(base(), fadingToggle(true))

/** Every node forced to `nonht`, so the plan holds no OFDM link to subdivide. */
const nonOfdm = (sc: Scenario): Scenario => ({
  ...sc,
  nodes: sc.nodes.map((n) => ({ ...n, caps: { ...n.caps, generation: 'nonht' as const } })),
})

/** The refusal `superRefine` itself raises on this plan once it carries the section. */
const schemaRefusals = (sc: Scenario): string[] => {
  const parsed = ScenarioSchema.safeParse({ ...sc, selectivity: {} })
  if (parsed.success) return []
  return parsed.error.issues.filter((i) => i.path[0] === 'selectivity').map((i) => i.message)
}

describe('when the checkbox can be ticked', () => {
  it('is live, unticked and unexplained once all three preconditions hold', () => {
    expect(selectivitySwitch(ready())).toEqual({ on: false, live: true, refusals: [] })
  })

  it('is dead with one reason when fading is the only thing missing', () => {
    // The stock plan: eht/he/vht links, no fading section. One refusal, not three.
    const sw = selectivitySwitch(base())
    expect(sw).toMatchObject({ on: false, live: false })
    expect(sw.refusals).toHaveLength(1)
    expect(sw.refusals[0]).toContain('需要场景里先写出 fading 小节')
  })

  it('is dead with one reason when the distribution is the only thing missing', () => {
    // Fading is there, so this is a different refusal from the one above — and the remedy is
    // different too, which is why the schema keeps them apart instead of saying "fix fading".
    const none = withFading(base(), fadingSmallScalePatch(fadingToggle(true)!, 'none'))
    const sw = selectivitySwitch(none)
    expect(sw).toMatchObject({ on: false, live: false })
    expect(sw.refusals).toHaveLength(1)
    expect(sw.refusals[0]).toContain('需要 fading.smallScale 不是 none')
  })

  it('is dead with one reason when an OFDM link is the only thing missing', () => {
    const sw = selectivitySwitch(nonOfdm(ready()))
    expect(sw).toMatchObject({ on: false, live: false })
    expect(sw.refusals).toHaveLength(1)
    expect(sw.refusals[0]).toContain('至少有一条 eht、he 或 vht 链路')
  })

  it('names both reasons when two are missing at once', () => {
    // No fading *and* no OFDM link: two independent remedies, and the panel has to say both or
    // the user fixes one and meets the other.
    const sw = selectivitySwitch(nonOfdm(base()))
    expect(sw.live).toBe(false)
    expect(sw.refusals).toHaveLength(2)
    expect(sw.refusals[0]).toContain('需要场景里先写出 fading 小节')
    expect(sw.refusals[1]).toContain('至少有一条 eht、he 或 vht 链路')

    // The other pair: fading present but inert, and no OFDM link either.
    const inert = nonOfdm(withFading(base(), fadingSmallScalePatch(fadingToggle(true)!, 'none')))
    expect(selectivitySwitch(inert).refusals).toHaveLength(2)
  })

  it('stays operable while the section is on, however the plan has drifted since', () => {
    // A node edit this section never sees can invalidate a ticked plan — the only OFDM link
    // downgraded to nonht. Greying the box there would be the trap: the plan is already invalid
    // and the one control that could rescue it would have stopped responding.
    const on = withSelectivity(ready(), selectivityToggle(true))
    const drifted = nonOfdm(on)
    const sw = selectivitySwitch(drifted)
    expect(sw.on).toBe(true)
    expect(sw.live).toBe(true)
    expect(sw.refusals).toHaveLength(1)
    expect(withSelectivity(drifted, selectivityToggle(false)).selectivity).toBeUndefined()
  })
})

describe('the reasons shown are the schema’s own, not a paraphrase', () => {
  // The whole point of `selectivityRefusals` living in scenario.ts: one copy of the wording.
  // A second copy in the editor would drift at the first rewording, and the drifted one would
  // be the one the user reads — the schema's message only ever appears after a commit.
  const plans: [string, Scenario][] = [
    ['no fading', base()],
    ['smallScale none', withFading(base(), fadingSmallScalePatch(fadingToggle(true)!, 'none'))],
    ['no OFDM link', nonOfdm(ready())],
    ['no fading and no OFDM link', nonOfdm(base())],
    ['all three satisfied', ready()],
  ]

  for (const [what, sc] of plans) {
    it(`matches superRefine word for word: ${what}`, () => {
      expect(selectivitySwitch(sc).refusals).toEqual(schemaRefusals(sc))
      expect(selectivityRefusals(sc)).toEqual(schemaRefusals(sc))
    })
  }
})

describe('the switch writes the section, and removes it', () => {
  it('on is the empty object, which is the only shape this section ever takes', () => {
    expect(selectivityToggle(true)).toEqual({})
    const on = withSelectivity(ready(), selectivityToggle(true))
    const parsed = ScenarioSchema.safeParse(on)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.selectivity).toEqual({})
  })

  it('off is the absent key, not one holding undefined', () => {
    expect(selectivityToggle(false)).toBeUndefined()
    const off = withSelectivity(ready(), selectivityToggle(false))
    expect('selectivity' in off).toBe(false)
    const parsed = ScenarioSchema.safeParse(off)
    expect(parsed.success).toBe(true)
    expect('selectivity' in (parsed as unknown as { data: Record<string, unknown> }).data).toBe(false)
  })

  it('turning the switch off again leaves the plan it started from', () => {
    const start = ready()
    const on = withSelectivity(start, selectivityToggle(true))
    expect(withSelectivity(on, selectivityToggle(false))).toStrictEqual(start)
  })

  it('round-trips through save and load, where an illegal section would land', () => {
    const on = withSelectivity(ready(), selectivityToggle(true))
    const back = ScenarioSchema.safeParse(JSON.parse(JSON.stringify(on)))
    expect(back.success).toBe(true)
    expect(back.success && back.data.selectivity).toEqual({})
  })
})

describe('a fading change never leaves a section the schema would refuse', () => {
  // `withFading` is the single funnel for every edit the fading panel makes (FloorPlanEditor's
  // one `onChange`), which is why the invariant sits there and not in the component.
  it('drops selectivity when fading is switched off under it', () => {
    const on = withSelectivity(ready(), selectivityToggle(true))
    const off = withFading(on, fadingToggle(false))
    expect('selectivity' in off).toBe(false)
    expect('fading' in off).toBe(false)
    expect(ScenarioSchema.safeParse(off).success).toBe(true)
    // And the plan is the one we started from, before fading was ever turned on.
    expect(off).toStrictEqual(base())
  })

  it('drops selectivity when the distribution is turned to none under it', () => {
    const on = withSelectivity(ready(), selectivityToggle(true))
    const none = withFading(on, fadingSmallScalePatch(on.fading!, 'none'))
    expect('selectivity' in none).toBe(false)
    expect(none.fading?.smallScale).toBe('none')
    expect(ScenarioSchema.safeParse(none).success).toBe(true)
  })

  it('keeps selectivity across a fading change that stays legal', () => {
    const on = withSelectivity(ready(), selectivityToggle(true))
    const rician = withFading(on, fadingSmallScalePatch(on.fading!, 'rician'))
    expect(rician.selectivity).toEqual({})
    expect(ScenarioSchema.safeParse(rician).success).toBe(true)
  })

  it('leaves a plan that never had the section untouched', () => {
    const start = base()
    expect(withFading(withFading(start, fadingToggle(true)), fadingToggle(false))).toStrictEqual(start)
  })
})

/**
 * The one test here that runs the engine: schema-valid is not the same as wired up. What the
 * checkbox commits has to reach `selCombine` and change what the run records, or the control is
 * a tick over nothing — which is precisely the state this task found the feature in.
 *
 * `WIFI_SEL` is the instrument rather than a drop count: it is emitted once per Wi-Fi reception
 * **only** on the per-bin path, so none at all with the section absent is a statement about the
 * branch, not about a number that happened to come out the same.
 */
describe('the section the checkbox commits reaches the run', () => {
  const RUN_NS = 200_000_000
  const sels = (sc: Scenario): number =>
    [...new Simulation(sc).runUntil(RUN_NS).records].filter((r) => r.type === 'WIFI_SEL').length

  it('emits no per-bin record without the section, and many with it', () => {
    const faded = withFading(LESSONS.find((l) => l.id === 'mcs-ladder')!.scenario(), fadingToggle(true))
    expect(sels(withSelectivity(faded, selectivityToggle(false)))).toBe(0)
    expect(sels(withSelectivity(faded, selectivityToggle(true)))).toBeGreaterThan(0)
  })
})
