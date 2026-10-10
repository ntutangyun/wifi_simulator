/**
 * The three rules that refuse a tampered driver or a game-mode switch nothing will ever read
 * (`driverRefusalsFor`, src/model/scenario.ts; design doc 2026-10-05-built-but-untaught §7.5).
 *
 * Same discipline as `selectivity-scenario.test.ts`: the rules live in one exported function so
 * that the schema and the editor say the same sentence, and this file grades that function from
 * both sides — what it refuses, what it must keep accepting, and that it refuses nothing the
 * repository ships today.
 *
 * **The third rule is the one to read carefully, and it is not "no tamper without EDCA".**
 * `cwMin`, `cwMax`, `noDoubling` and `navInflateUs` are all live under DCF — a backoff is drawn
 * and a Duration is written whatever the access method — so a blanket rule would delete real
 * behaviour. What is refused is a preset whose fields are ALL unreadable on this link, which on
 * a legacy link is exactly `escalate`, `aifs` and `txopHog`, and never `cw`, `noDouble`,
 * `navInflate` or the combined `greedy`.
 *
 * **And it asks the LINK, not the node**, which is the lesson `hasBinnableLink` was rewritten
 * for: `simulation.ts` computes a station's `cfg.edca` as `hasFeature(sta) && hasFeature(ap)`,
 * so the "old router, new laptop" pair runs DCF with both of the station's own flags set. The
 * matrix below walks every (AP generation × station generation) pair rather than sampling, for
 * exactly that reason.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LESSONS } from '../../src/course/lessons'
import { HOUSEHOLDS } from '../../src/model/households'
import {
  ScenarioSchema, TAMPER_KINDS, TAMPER_PRESETS, defaultScenario, driverRefusals, driverRefusalsFor,
  tamperReadableFields, tamperSetFields, type NodeCfg, type Scenario, type TamperKind,
} from '../../src/model/scenario'
import { GENERATIONS } from '../../src/model/caps'
import type { Generation } from '../../src/model/types'

/** One AP and one station at the given generations, each with every flag its generation allows. */
function pair(apGen: Generation, staGen: Generation, cheat?: TamperKind): Scenario {
  const base = defaultScenario()
  const full = { edca: true, ampdu: true, txop: true, ofdma: true, mumimo: true, mlo: true, qam4k: true }
  const ap: NodeCfg = { ...base.nodes[0], caps: { generation: apGen, features: { ...full } } }
  const sta: NodeCfg = {
    ...base.nodes[1], id: 'sta-1', linkId: undefined,
    caps: { generation: staGen, features: { ...full } },
    ...(cheat === undefined ? {} : { tamper: { ...TAMPER_PRESETS[cheat] } }),
  }
  return { ...base, nodes: [ap, sta] }
}

const accepts = (sc: Scenario): boolean => ScenarioSchema.safeParse(sc).success

describe('the tampered driver and the game switch · what the three rules refuse', () => {
  it('refuses a game-mode boolean on anything but the access point, and says where it belongs', () => {
    const sc = pair('eht', 'eht')
    sc.nodes[1] = { ...sc.nodes[1], gameAccel: true }
    const why = driverRefusalsFor(sc, sc.nodes[1])
    expect(why.length).toBe(1)
    expect(why[0]).toContain('gameAccel')
    expect(why[0], 'a refusal that does not say where to put it is half a refusal').toContain('接入点')
    expect(accepts(sc)).toBe(false)
    // the same boolean one node over is the thing the engine actually reads
    const ok = pair('eht', 'eht')
    ok.nodes[0] = { ...ok.nodes[0], gameAccel: true }
    expect(driverRefusalsFor(ok, ok.nodes[0])).toEqual([])
    expect(accepts(ok)).toBe(true)
  })

  it('refuses a tamper preset on anything but a station, and says where it belongs', () => {
    const sc = pair('eht', 'eht')
    sc.nodes[0] = { ...sc.nodes[0], tamper: { ...TAMPER_PRESETS.greedy } }
    const why = driverRefusalsFor(sc, sc.nodes[0])
    expect(why.length).toBe(1)
    expect(why[0]).toContain('tamper')
    expect(why[0]).toContain('站点')
    expect(accepts(sc)).toBe(false)
    expect(accepts(pair('eht', 'eht', 'greedy')), 'the same preset on a station').toBe(true)
  })

  /**
   * The third rule, over the whole (AP × station) × preset matrix: 5 × 5 × 7 = 175 plans, every
   * one of them judged by the same two rulers that decide the refusal — which fields the preset
   * sets, and which of them this link can read.
   *
   * The assertion is an EQUIVALENCE rather than a list of ids, so a preset added to
   * `TAMPER_KINDS` later lands on the correct side with nothing to edit here.
   *
   * **And `GENERATIONS` is imported rather than written out here, which is what let the matrix
   * grow from 112 plans to 175 with nothing to edit when `'uhr'` went in.** A local
   * `['nonht', 'vht', 'he', 'eht']` is still a well-typed `Generation[]` after a fifth member
   * appears, so `tsc` would not have said a word — the matrix would simply have gone on
   * measuring four generations under a title that claims it walks every pair.
   */
  it('refuses a preset exactly when this link can read none of its fields', () => {
    let refused = 0
    let accepted = 0
    for (const apGen of GENERATIONS) {
      for (const staGen of GENERATIONS) {
        for (const k of TAMPER_KINDS) {
          const sc = pair(apGen, staGen, k)
          const readable = tamperReadableFields(TAMPER_PRESETS[k], sc.nodes[1], sc.nodes[0])
          const want = readable.length === 0
          expect(driverRefusalsFor(sc, sc.nodes[1]).length > 0, `${apGen}/${staGen} · ${k}`).toBe(want)
          expect(accepts(sc), `${apGen}/${staGen} · ${k}`).toBe(!want)
          if (want) refused++; else accepted++
        }
      }
    }
    // anti-vacuity from both ends: the matrix really does split
    expect(refused, 'plans refused across the matrix').toBeGreaterThan(0)
    expect(accepted, 'plans accepted across the matrix').toBeGreaterThan(0)
    expect(refused + accepted).toBe(GENERATIONS.length * GENERATIONS.length * TAMPER_KINDS.length)
  })

  /**
   * The three the rule refuses on a legacy link and the four it must not, named. This is the
   * list the `edca-tamper` lesson teaches, and it is the one place a future widening of the rule
   * to "no tamper without EDCA" would be caught: `cw`, `noDouble` and `navInflate` are effective
   * under DCF, and `greedy` carries a readable pair among its five fields.
   */
  it('refuses escalate, aifs and txopHog on a legacy link and accepts the other four', () => {
    const refusedOnLegacy = TAMPER_KINDS.filter((k) => !accepts(pair('nonht', 'nonht', k)))
    expect([...refusedOnLegacy].sort()).toEqual(['aifs', 'escalate', 'txopHog'])
    const kept = TAMPER_KINDS.filter((k) => accepts(pair('nonht', 'nonht', k)))
    expect([...kept].sort()).toEqual(['cw', 'greedy', 'navInflate', 'noDouble'])
  })

  /**
   * The mixed pair, which is the whole reason the rule reads the link. A station with every flag
   * set, behind an access point that has none of them, runs DCF — and asking the node would have
   * accepted this plan and left it inert.
   */
  it('reads the link and not the device, so "old router, new laptop" is refused too', () => {
    expect(accepts(pair('nonht', 'eht', 'aifs')), 'eht station, nonht AP').toBe(false)
    expect(accepts(pair('eht', 'nonht', 'aifs')), 'nonht station, eht AP').toBe(false)
    expect(accepts(pair('eht', 'eht', 'aifs'))).toBe(true)
    // and the station's own flags are not what decided it
    expect(pair('nonht', 'eht', 'aifs').nodes[1].caps.features.edca).toBe(true)
  })

  /** `txopLimitUs` needs both flags, which is why it is not grouped with the other two. */
  it('refuses a TXOP-limit preset on a link that has EDCA but no TXOP', () => {
    const sc = pair('eht', 'eht', 'txopHog')
    sc.nodes[0] = { ...sc.nodes[0], caps: { ...sc.nodes[0].caps, features: { edca: true } } }
    sc.nodes[1] = { ...sc.nodes[1], caps: { ...sc.nodes[1].caps, features: { edca: true } } }
    expect(tamperReadableFields(TAMPER_PRESETS.txopHog, sc.nodes[1], sc.nodes[0])).toEqual([])
    expect(accepts(sc)).toBe(false)
    // while the window collapse on that very same link is read and kept
    const cw = { ...sc, nodes: [sc.nodes[0], { ...sc.nodes[1], tamper: { ...TAMPER_PRESETS.cw } }] }
    expect(accepts(cw)).toBe(true)
  })

  /** An empty config sets nothing, so rule 3 has nothing to call unreadable. Stated, not implied. */
  it('says nothing about a tamper that sets no field at all', () => {
    const sc = pair('nonht', 'nonht')
    sc.nodes[1] = { ...sc.nodes[1], tamper: {} }
    expect(tamperSetFields({})).toEqual([])
    expect(driverRefusalsFor(sc, sc.nodes[1])).toEqual([])
    expect(accepts(sc)).toBe(true)
  })
})

/**
 * **The census: not one plan this repository ships is refused.**
 *
 * A refusal rule is only ever worth adding if it is measured against everything that exists
 * first — a rule that breaks a shipped lesson is a rule that gets deleted rather than obeyed.
 * 255 plans and 1 080 nodes on 2026-10-05: the 85 lessons and every variant of them, the seven
 * editor households, and the editor's own opening document.
 *
 * It is paired with a planted violation, because a census that counts nothing would report the
 * same zero.
 */
describe('the three rules refuse nothing this repository ships', () => {
  const plans: { label: string; sc: Scenario }[] = []
  for (const l of LESSONS) {
    plans.push({ label: l.id, sc: l.scenario() })
    l.variants?.forEach((v, i) => plans.push({ label: `${l.id}#${i}`, sc: v.scenario() }))
  }
  for (const h of HOUSEHOLDS) plans.push({ label: `household:${h.id}`, sc: h.scenario() })
  plans.push({ label: 'defaultScenario()', sc: defaultScenario() })

  it('counts every lesson scene, every household and the editor’s own opening plan', () => {
    expect(plans.length).toBeGreaterThanOrEqual(255)
    expect(plans.reduce((n, p) => n + p.sc.nodes.length, 0)).toBeGreaterThanOrEqual(1080)
  })

  it('raises no refusal on any of them', () => {
    const hits = plans.flatMap((p) => driverRefusals(p.sc).map((m) => `${p.label}: ${m}`))
    expect(hits, 'a rule that refuses a shipped plan is a rule that will be deleted').toEqual([])
  })

  it('and would have caught one, so the zero above is a measurement', () => {
    const planted: Scenario = {
      ...plans[0].sc,
      nodes: plans[0].sc.nodes.map((n) => (n.kind === 'ap'
        ? { ...n, tamper: { ...TAMPER_PRESETS.aifs } }
        : { ...n, gameAccel: true })),
    }
    expect(driverRefusals(planted).length).toBeGreaterThanOrEqual(2)
  })
})

/**
 * **The criterion these rules were judged against is in the repository, and the pointers to it
 * resolve.**
 *
 * It used to live in `.superpowers/sdd/LESSONS.md`, which is `.gitignore`d — so a docblock
 * pointing at it was a reference to a file the reader does not have, which is worse than no
 * reference. It moved to `docs/inert-config-contract.md` on 2026-10-05, and the three places a
 * person writing the NEXT refusal must pass through each carry one line pointing at it.
 *
 * This test is the thing that keeps that true. It is weak on purpose — it cannot tell a good
 * pointer from a stale one — but a dangling pointer is exactly the failure it was moved to
 * avoid, and nothing else in the repository would notice the file being renamed or deleted.
 * Same shape as `tests/course/limits.test.ts`'s "leave a ruler in your own test file" check.
 *
 * **Four places since slice 3d, not three**, and the number is the count of exported rule functions
 * plus one: `ancillaryRequestRefusals` is the third such function (standard §10.35.2.1's Request
 * field), and it carries its own pointer for the same reason the other two do. The `superRefine`
 * site that reads it does **not** carry a second one — the `superRefine` already has its line, and
 * a path repeated once per rule inside it would make this count grow with the rules rather than
 * with the entry points.
 */
describe('the refuse-or-pin criterion is in the repository and the code points at it', () => {
  const DOC = 'docs/inert-config-contract.md'
  const read = (rel: string): string => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8')

  it('exists, and says which of the two outcomes it is about', () => {
    const doc = read(DOC)
    expect(doc.length, 'the criterion is not an empty file').toBeGreaterThan(2000)
    expect(doc).toContain('允许但空转')
    expect(doc).toContain('拒绝')
    expect(doc).toContain('钉住现状')
  })

  it('is pointed at from all four places a new refusal passes through', () => {
    const scenario = read('src/model/scenario.ts')
    // one line in each of the three exported rule functions, and one in the superRefine itself
    const hits = scenario.split(DOC).length - 1
    expect(hits, `${DOC} is named ${hits} times in scenario.ts; the contract says four — one per`
      + ' exported rule function, plus the superRefine itself').toBe(4)
    // and each one is actually inside the thing it is meant to introduce
    const at = (needle: string): number => scenario.indexOf(needle)
    expect(at('export function selectivityRefusals')).toBeGreaterThan(-1)
    expect(at('export function driverRefusalsFor')).toBeGreaterThan(-1)
    expect(at('export function ancillaryRequestRefusals')).toBeGreaterThan(-1)
    expect(at('.superRefine((sc, ctx)')).toBeGreaterThan(-1)
  })

  /** The renderer owns the one caveat the criterion could not fix, so it says so too. */
  it('is pointed at from the renderer, which carries the zod short-circuit caveat', () => {
    const planOps = read('src/editor/planOps.ts')
    expect(planOps).toContain(DOC)
    expect(planOps, 'the caveat itself, not only the pointer').toContain('short-circuit')
  })
})
