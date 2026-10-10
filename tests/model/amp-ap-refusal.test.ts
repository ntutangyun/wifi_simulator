/**
 * **`ampAp` on a non-EHT access point: the refusal, and the reason it gives.**
 *
 * This rule shipped on the day the AMP panel did and nothing checked it until 2026-10-10. It
 * mattered less while `'uhr'` existed only in the engine; slice W12b put Wi-Fi 8 in the editor's
 * generation dropdown, so a reader can now reach it in two clicks, and W12a's report had already
 * flagged that the verdict rested on a sentence living in a report rather than on a measurement.
 *
 * **The verdict and the six steps it was run through are in `ampApRefusals`'s own docblock**
 * (src/model/scenario.ts); `docs/inert-config-contract.md` is the contract. This file is the
 * measurement half:
 *
 *  - step 1 — the census below: every shipped scene that carries `ampAp` carries it on an `eht`
 *    access point, so the refusal deletes no teaching;
 *  - the refusal is reachable and real, in both directions, and the schema and the editor print
 *    one sentence rather than two;
 *  - step 4 — the constant that would have to be invented to accept `uhr`.
 *
 * **What is NOT asserted here is a sign of inertness**, because the field is not inert: nothing
 * in `src/engine/amp*.ts` reads `caps.generation`, so a `uhr` AP with this section would poll
 * quite happily. That is why this refusal is of the `guardIntervalRefusals` class — the draft
 * published no mapping — and not of the wiring class the contract's step 3 describes. The test
 * that says so is `the engine would have run it, which is why this is not a wiring refusal`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  DEFAULT_AMP_AP, ScenarioSchema, ampApRefusals, defaultScenario,
  type NodeCfg, type Scenario,
} from '../../src/model/scenario'
import { generationPatch } from '../../src/editor/planOps'
import { GENERATIONS } from '../../src/model/caps'
import { AMP_LEGACY_PREAMBLE_NS } from '../../src/engine/amp'
import { LESSONS } from '../../src/course/lessons'
import { HOUSEHOLDS } from '../../src/model/households'
import { STRINGS } from '../../src/ui/i18n'

const SRC = (p: string): string => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

const ap = (gen: NodeCfg['caps']['generation'], withAmp = true): NodeCfg => ({
  id: 'ap', kind: 'ap', name: 'Router', pos: { x: 3, y: 3, z: 1 }, txPowerDbm: 20, profiles: [],
  caps: { generation: gen, features: { edca: true } },
  ampAp: withAmp ? { ...DEFAULT_AMP_AP } : undefined,
})

describe('ampApRefusals · the rule and its single wording', () => {
  it('refuses every generation but eht, and accepts eht — so the zero is a measurement', () => {
    const refused = GENERATIONS.filter((g) => ampApRefusals(ap(g)).length > 0)
    expect(refused, 'eht is the only generation that may poll').toEqual(['nonht', 'vht', 'he', 'uhr'])
    expect(ampApRefusals(ap('eht')), 'and it really does accept the one it allows').toEqual([])
    // and with no section there is nothing to refuse, whatever the generation
    for (const g of GENERATIONS) expect(ampApRefusals(ap(g, false))).toEqual([])
  })

  it('refuses the section on a node that is not an access point, with its own reason', () => {
    const sta = { ...ap('eht'), kind: 'sta' as const }
    const why = ampApRefusals(sta)
    expect(why).toHaveLength(1)
    expect(why[0]).toContain('只贴在接入点上')
    // the two reasons are different sentences: a reader told the wrong thing cannot fix it
    expect(why[0]).not.toEqual(ampApRefusals(ap('uhr'))[0])
  })

  it('names the subfield that actually discriminates, not the field both generations carry', () => {
    const why = ampApRefusals(ap('uhr'))[0]!
    // the corpus criterion: TGbp SFD PM-37 / PM-54 identify a DL AMP PPDU by PHY version 0,
    // 802.11be-2024 §9 sets that subfield to 0 for EHT, and TGbn Motion #22 sets it to 1 for UHR
    expect(why, 'the version number is the whole argument').toContain('版本号')
    expect(why).toContain('0')
    expect(why).toContain('1')
    // **The regression this guards.** The old sentence was 「AMP 下行 PPDU 携带的是 U-SIG」 and
    // W12a defended it by saying a UHR PPDU signals in UHR-SIG instead. SFD Motion #182 keeps
    // every U-SIG field of the UHR MU PPDU as EHT's; UHR-SIG replaces EHT-SIG. So a reason that
    // stops at 「carries U-SIG」 does not discriminate at all, and it may not come back.
    expect(/携带的?是 U-SIG。?$/.test(why.trim()),
      'a reason that stops at 「it carries U-SIG」 is true of uhr too').toBe(false)
    expect(why, 'and it has to say what to do instead').toContain('请')
  })

  it('is the only Chinese wording of this rule a reader can be shown', () => {
    // the editor renders `ampApRefusals` itself (asked hypothetically) rather than a string of
    // its own — the defect `selectivityRefusals` was lifted into scenario.ts to remove, and the
    // one `planOps.ts`'s docblock already named while this pair was still an example of it
    const editor = SRC('src/editor/FloorPlanEditor.tsx')
    expect(editor.includes('ampApRefusals({ ...selNode, ampAp: DEFAULT_AMP_AP })'),
      'the panel reads the schema’s own sentence').toBe(true)
    expect(/\bE\.ampNeedsEht\b/.test(editor), 'and renders no second copy').toBe(false)
    const second = Object.entries(STRINGS as unknown as Record<string, unknown>)
      .concat(Object.entries(STRINGS.editor as unknown as Record<string, unknown>))
      .filter(([, v]) => typeof v === 'string' && /AMP 轮询需要/.test(v as string))
    expect(second, 'a second wording in STRINGS is how the two drifted apart last time').toEqual([])
  })
})

describe('the schema is where that refusal lands', () => {
  const sceneWith = (n: NodeCfg): Scenario => {
    const base = defaultScenario()
    return { ...base, nodes: [n, ...base.nodes.slice(1)] }
  }

  it('rejects a uhr access point that polls, with ampApRefusals’ own sentence', () => {
    const r = ScenarioSchema.safeParse(sceneWith(ap('uhr')))
    expect(r.success).toBe(false)
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message)
    expect(msgs, 'the schema quotes the function verbatim').toContain(ampApRefusals(ap('uhr'))[0])
  })

  it('and accepts the same plan with an eht access point, so the rejection is about one field', () => {
    expect(ScenarioSchema.safeParse(sceneWith(ap('eht'))).success).toBe(true)
    expect(ScenarioSchema.safeParse(sceneWith(ap('uhr', false))).success).toBe(true)
  })

  it('the engine would have run it, which is why this is not a wiring refusal', () => {
    // contract step 3: the threshold for refusing is 「the field cannot be read on this path」.
    // It can be — nothing in the AMP engine asks what generation the access point is — so this
    // refusal is of the guardInterval class (no published mapping) and says so.
    for (const f of ['amp', 'ampAp', 'ampSta', 'ampBs', 'ampBsSta', 'ampReader']) {
      expect(SRC(`src/engine/${f}.ts`), `engine/${f}.ts reads caps.generation`)
        .not.toMatch(/caps\s*\.\s*generation|minGen\(/)
    }
    // contract step 4: the constant that would be invented. 32 µs is EHT's legacy preamble plus
    // EHT's 8 µs U-SIG, and every AMP airtime the five lessons print is built on it.
    expect(AMP_LEGACY_PREAMBLE_NS).toBe(32_000)
    expect(SRC('src/engine/amp.ts'), 'and it carries its own breakdown').toContain('U-SIG 8')
  })
})

/**
 * **Step 1 of the contract, as a measurement rather than a sentence.**
 *
 * 「扫全部课程场景与变体 —— `LESSONS` 的 `scenario()` 与 `variants[*].scenario()`，再加 `HOUSEHOLDS`
 * 与 `defaultScenario()` —— 不是读代码猜，也不是看任务给的文件清单。」 Measured 2026-10-10: 284
 * scenes, sixteen of them carrying `ampAp`, all sixteen on an `eht` node of kind `ap`, belonging
 * to the five AMP lessons. So this refusal deletes no teaching content — and five of those
 * lessons teach the rule itself in prose.
 */
describe('ampApRefusals refuses nothing this repository ships', () => {
  const scenes: { label: string; sc: Scenario }[] = []
  for (const l of LESSONS) {
    scenes.push({ label: l.id, sc: l.scenario() })
    l.variants?.forEach((v, i) => scenes.push({ label: `${l.id}#${i}`, sc: v.scenario() }))
  }
  for (const h of HOUSEHOLDS) scenes.push({ label: `household:${h.id}`, sc: h.scenario() })
  scenes.push({ label: 'defaultScenario()', sc: defaultScenario() })

  it('counts every lesson scene, every variant, every household and the opening plan', () => {
    expect(scenes.length).toBeGreaterThanOrEqual(284)
  })

  it('every scene that polls does it from an eht access point', () => {
    const carriers = scenes.flatMap((s) => s.sc.nodes
      .filter((n) => n.ampAp !== undefined)
      .map((n) => `${s.label}:${n.id} ${n.kind}/${n.caps.generation}`))
    // anti-vacuity: there really are scenes to count, and they are the five AMP lessons'
    expect(carriers.length, 'scenes carrying ampAp').toBe(16)
    expect([...new Set(carriers.map((c) => c.split(' ')[1]))]).toEqual(['ap/eht'])
    expect([...new Set(carriers.map((c) => c.split(':')[0]!.split('#')[0]))].sort())
      .toEqual(['amp-backscatter', 'amp-coexist', 'amp-intro', 'amp-ppdu', 'amp-slots'])
  })

  it('raises no refusal on any of them, and would have caught a planted one', () => {
    expect(scenes.flatMap((s) => s.sc.nodes.flatMap((n) => ampApRefusals(n).map((m) => `${s.label}:${n.id} ${m}`))))
      .toEqual([])
    const polling = scenes.find((s) => s.sc.nodes.some((n) => n.ampAp !== undefined))!
    const planted = polling.sc.nodes.map((n) => (n.ampAp === undefined ? n
      : { ...n, caps: { ...n.caps, generation: 'uhr' as const } }))
    expect(planted.flatMap((n) => ampApRefusals(n)).length,
      'a census that counts nothing reports the same zero').toBe(1)
  })
})

describe('the editor cannot build a plan the schema would reject', () => {
  it('switching the polling access point to Wi-Fi 8 drops the section, as it does for Wi-Fi 6', () => {
    const polling = ap('eht')
    for (const gen of GENERATIONS.filter((g) => g !== 'eht')) {
      expect(generationPatch(polling, gen).ampAp, `${gen} keeps ampAp`).toBeUndefined()
    }
    expect(generationPatch(polling, 'eht').ampAp, 'and eht keeps it').toEqual(DEFAULT_AMP_AP)
  })

  it('and the drop is one-way through the dropdown, which planOps’ docblock states', () => {
    // Not a promise that this is right — a statement of what the reader loses. Switching the
    // dropdown back does not restore the section; as of 2026-10-10 the editor says so, and the
    // undo stack is where it comes back from. `tests/editor/planOps.test.ts` holds the notice.
    const dropped = { ...ap('eht'), ...generationPatch(ap('eht'), 'uhr') }
    expect(dropped.ampAp).toBeUndefined()
    expect(generationPatch(dropped, 'eht').ampAp, 'gone for good').toBeUndefined()
    expect(SRC('src/editor/planOps.ts'), 'and it is written down where the function is')
      .toContain('**The drop is one-way through the dropdown, and as of 2026-10-10 it is announced.**')
  })
})
