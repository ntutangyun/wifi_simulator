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
import { minGen } from '../../src/model/caps'
import {
  DEFAULT_UWB_SESSION, ScenarioSchema, defaultScenario, type NodeCfg, type Scenario,
} from '../../src/model/scenario'
import type { Generation } from '../../src/model/types'

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

/** Every generation, so a matrix over them is a matrix and not a sample. */
const GENERATIONS: Generation[] = ['nonht', 'vht', 'he', 'eht']

/**
 * A two-node scene: one AP at `apGen`, one station at `staGen`, fading on, selectivity on.
 *
 * Features and `linkId` are stripped so that the only thing varying across the matrix is the
 * pair of generations — `linkId: '2g'` with `vht`, and `'6g'` with `nonht`/`vht`, are refused by
 * rules of their own (`src/model/scenario.ts`), and a matrix that tripped those would be
 * measuring them instead of this.
 */
const pair = (apGen: Generation, staGen: Generation): Scenario => {
  const base = defaultScenario()
  const plain = (n: NodeCfg, generation: Generation): NodeCfg => {
    const { linkId: _drop, ...rest } = n
    return { ...rest, caps: { generation, features: {} } }
  }
  return {
    ...base,
    nodes: [
      plain(base.nodes.find((n) => n.kind === 'ap')!, apGen),
      plain(base.nodes.find((n) => n.kind === 'sta')!, staGen),
    ],
    fading: { smallScale: 'rayleigh' },
    selectivity: {},
  } as Scenario
}

/**
 * The refusals this plan raises on the `selectivity` path alone, so other rules cannot colour
 * the result.
 *
 * **It fails loudly on a node-level error rather than returning nothing.** A failure inside
 * `NodesSchema` aborts the scenario-level `superRefine` before the selectivity rules run at all,
 * so an empty list would mean "never measured" while reading exactly like "accepted" — the
 * instrument quietly reporting the answer the test wanted. Two of the cases below were written
 * with an invalid node at first and passed for that reason; this guard is what caught it.
 */
const selIssues = (sc: Scenario): string[] => {
  const r = ScenarioSchema.safeParse(sc)
  if (r.success) return []
  const broken = r.error.issues
    .filter((i) => i.path[0] === 'nodes')
    .map((i) => `${i.path.join('.')}: ${i.message}`)
  expect(broken, 'the scene itself is invalid, so the selectivity rules never ran').toEqual([])
  return r.error.issues.filter((i) => i.path[0] === 'selectivity').map((i) => i.message)
}

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

/**
 * **The axis the four generation tests above do not cover**, and the hole the whole-branch
 * review stopped the merge on: each of them forces *every* node to one generation, so none of
 * them can tell "there is an HE device" from "there is an HE link".
 *
 * A link's PPDU format is `minGen` of its two ends (`src/engine/simulation.ts` · `modeFor`), so
 * an `eht` laptop behind a `nonht` access point is a non-HT link with no 26-tone RU in it. The
 * predicate used to ask `nodes.some(...)`, which accepted all eight mixed pairs: checkbox lit,
 * no red line, and a record stream field-for-field identical to the feature switched off.
 *
 * This matrix is the whole 4 × 4, and its expectation is computed from `minGen` rather than
 * listed — a table of sixteen hand-written verdicts is a second model of the rule, and the one
 * that drifts is the test.
 */
describe('the third refusal asks about a link, not about a device', () => {
  for (const apGen of GENERATIONS) {
    for (const staGen of GENERATIONS) {
      const linkGen = minGen(apGen, staGen)
      const binnable = linkGen === 'he' || linkGen === 'eht'
      it(`${apGen} AP + ${staGen} STA is a ${linkGen} link, so selectivity is ${binnable ? 'accepted' : 'refused'}`, () => {
        const issues = selIssues(pair(apGen, staGen))
        expect(issues.length, issues.join(' | ')).toBe(binnable ? 0 : 1)
        if (!binnable) expect(issues[0]).toContain('至少有一条 eht 或 he 链路')
      })
    }
  }

  it('refuses all eight mixed pairs, and accepts all four that are he/eht at both ends', () => {
    // The same claim counted rather than per-case, so the matrix above cannot pass by being
    // empty: eight mixed, four low-low, four binnable.
    const verdicts = GENERATIONS.flatMap((a) => GENERATIONS.map((b) => selIssues(pair(a, b)).length === 0))
    expect(verdicts.filter((ok) => ok).length).toBe(4)
    expect(verdicts.filter((ok) => !ok).length).toBe(12)
  })

  it('counts only the station end, not any station: one binnable peer is enough', () => {
    // "At least one link", deliberately. An eht AP with a vht phone AND an he laptop keeps the
    // section, because the he link really does split into bins; the vht phone's own PPDUs are
    // excluded by the engine instead (isOfdmWifiPpdu, src/engine/channel.ts).
    const sc = pair('eht', 'vht')
    const he = { ...sc.nodes[1], id: 'sta-he', name: 'HE laptop', caps: { generation: 'he' as const, features: {} } }
    expect(selIssues(sc)).toHaveLength(1)
    expect(selIssues({ ...sc, nodes: [...sc.nodes, he] })).toHaveLength(0)
  })
})

describe('the third refusal counts only nodes that can carry a binned PPDU', () => {
  it('an eht UWB anchor does not authorise the switch for an all-nonht Wi-Fi scene', () => {
    // A `kind: 'uwb'` node has no Wi-Fi radio at all — `nodeLinks` returns [] and `linkPlanFor`
    // skips it (src/model/caps.ts), and simulation.ts says so in as many words. Under the old
    // device-counting predicate its `caps.generation` voted anyway, so one anchor could switch
    // the feature on for a scene whose every link was non-HT; the run then recorded no
    // `WIFI_SEL` at all.
    const sc = pair('nonht', 'nonht')
    expect(selIssues(sc)).toHaveLength(1)
    const anchor: NodeCfg = {
      ...sc.nodes[1],
      id: 'anchor-1', kind: 'uwb', name: 'Anchor', caps: { generation: 'eht', features: {} },
      uwb: { role: 'anchor', clockPpm: 0 },
    } as NodeCfg
    const tag: NodeCfg = { ...anchor, id: 'tag-1', name: 'Tag', uwb: { role: 'tag', clockPpm: 0 } } as NodeCfg
    const withUwb = { ...sc, nodes: [...sc.nodes, anchor, tag], uwb: DEFAULT_UWB_SESSION }
    expect(selIssues(withUwb), 'a UWB anchor voted').toHaveLength(1)
  })

  it('an eht AMP tag does not authorise it either', () => {
    // An AMP tag *is* a link member (on 2.4 GHz), so excluding it is not about the link plan:
    // its PPDUs are OOK and carry `frame.amp`, which `isOfdmWifiPpdu` rejects at its first
    // test, so it can never contribute a binned reception whatever its caps claim.
    const sc = pair('nonht', 'nonht')
    const tag: NodeCfg = {
      ...sc.nodes[1],
      id: 'tag-1', kind: 'amp', name: 'Tag', linkId: '2g', caps: { generation: 'eht', features: {} },
    } as NodeCfg
    expect(selIssues({ ...sc, nodes: [...sc.nodes, tag] }), 'an AMP tag voted').toHaveLength(1)
  })

  it('a scene with no AP has no link to bin, whatever its stations are', () => {
    // Without a `kind: 'ap'` node there is no link plan, no channel and no MAC at all
    // (src/engine/simulation.ts), so there is nothing for a bin to subdivide.
    const sc = pair('eht', 'eht')
    expect(selIssues(sc)).toHaveLength(0)
    const apless = { ...sc, nodes: sc.nodes.filter((n) => n.kind !== 'ap') }
    expect(selIssues(apless), 'an AP-less scene was accepted').toHaveLength(1)
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
