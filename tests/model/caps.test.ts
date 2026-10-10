import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  BAND_LABEL, FEATURE_LABEL, GENERATIONS, GEN_FEATURES, GEN_LABEL, GEN_RANK, LINK_ORDER, MAX_WIDTH,
  linkOfVirtual, linkPlanFor, minGen, negotiatedNss, negotiatedWidth, nodeLinks, nssOf, virtualId,
  widthOf,
} from '../../src/model/caps'
import { STRINGS } from '../../src/ui/i18n'
import { PHY_MODES, PHY_MODE_ORDER, UHR_SFD_MCS } from '../../src/engine/phy'
import { ScenarioSchema, defaultScenario, type NodeCfg } from '../../src/model/scenario'
import type { Generation } from '../../src/model/types'

const CAPS_SRC = readFileSync(new URL('../../src/model/caps.ts', import.meta.url), 'utf8')

/**
 * The jsdoc block immediately above `decl`, with its `*` margin stripped and folded to one line.
 *
 * Folded because a claim in a comment wraps wherever the line length puts it, so a check that
 * reads the raw text is really a check on where somebody pressed Enter.
 */
function docblockOf(src: string, decl: string): string {
  const at = src.indexOf(decl)
  if (at < 0) throw new Error(`no ${decl} in this source`)
  const open = src.lastIndexOf('/**', at)
  const close = src.indexOf('*/', open)
  if (open < 0 || close > at) throw new Error(`no docblock immediately above ${decl}`)
  return src.slice(open + 3, close).split(/[\r\n]+/).map((l) => l.replace(/^\s*\* ?/, '').trim()).join(' ')
}

/** Sentences, so a check can ask whether ONE sentence makes two claims at once. */
const sentences = (s: string): string[] => s.split(/(?<=[.!?])\s+/).filter((x) => x.trim() !== '')

/**
 * **`GENERATIONS` is the one list in this repo a new generation cannot be left out of, and this
 * block is why.**
 *
 * `Generation` gained `'uhr'` on 2026-10-10. `tsc -b --force` named seven places — every
 * `Record<Generation, …>` literal — and **not one of the six generation matrices in `tests/`**,
 * because `['nonht', 'vht', 'he', 'eht']` is still a perfectly well-typed `Generation[]` when a
 * fifth member exists. Three of those six are pairing loops whose titles promise every pair.
 * So the lists moved into `src/` (`GENERATIONS`, `PHY_MODE_ORDER`), the matrices import them,
 * and these welds are what stop the lists themselves from going stale: each one is derived from
 * an exhaustive `Record` the compiler DOES check.
 */
describe('one list of generations, and nothing may fall out of it', () => {
  it('GENERATIONS is exactly the keys of the exhaustive records, lowest rank first', () => {
    expect([...GENERATIONS].sort()).toEqual(Object.keys(GEN_RANK).sort())
    expect([...GENERATIONS].sort()).toEqual(Object.keys(MAX_WIDTH).sort())
    expect([...GENERATIONS].sort()).toEqual(Object.keys(GEN_LABEL).sort())
    expect([...GENERATIONS].sort()).toEqual(Object.keys(GEN_FEATURES).sort())
    const ranks = GENERATIONS.map((g) => GEN_RANK[g])
    expect(ranks).toEqual([...ranks].sort((x, y) => x - y))
    expect(GENERATIONS.length).toBe(5)
  })

  it('PhyMode and Generation really are the same union, member for member', () => {
    // `selBinnableGen` is one predicate serving both questions (src/engine/selectivity.ts) and
    // `modeFor` hands a `Generation` straight into a `PhyMode` slot (src/engine/simulation.ts).
    // Both are only sound while these two lists agree.
    expect([...PHY_MODE_ORDER].sort()).toEqual([...GENERATIONS].sort())
    expect([...PHY_MODE_ORDER].sort()).toEqual(Object.keys(PHY_MODES).sort())
  })

  it('the zod enum accepts every generation — a runtime list tsc cannot check', () => {
    // This is the catcher for `ScenarioSchema`'s `z.enum([...])`, which is a VALUE: adding a
    // member to `Generation` without adding it there leaves a legal plan the loader rejects.
    const base = defaultScenario()
    for (const g of GENERATIONS) {
      const nodes = [
        { ...base.nodes[0]!, caps: { generation: g, features: {} } },
        { ...base.nodes[1]!, linkId: undefined, caps: { generation: g, features: {} } },
      ]
      const r = ScenarioSchema.safeParse({ ...base, nodes })
      const enumIssue = r.success ? [] : r.error.issues.filter((i) => i.path.join('.').includes('generation'))
      expect(enumIssue, `the schema's generation enum rejects '${g}'`).toEqual([])
    }
  })

  it('and a generation the union does not have is still refused', () => {
    // Anti-vacuity for the check above: it must be able to fail.
    const base = defaultScenario()
    const nodes = [{ ...base.nodes[0]!, caps: { generation: 'wifi9', features: {} } }, base.nodes[1]!]
    expect(ScenarioSchema.safeParse({ ...base, nodes }).success).toBe(false)
  })

  it('minGen is a total order over the whole list, so every pair has one answer', () => {
    for (const a of GENERATIONS) {
      for (const b of GENERATIONS) {
        const m = minGen(a, b)
        expect(GEN_RANK[m]).toBe(Math.min(GEN_RANK[a], GEN_RANK[b]))
        expect(minGen(b, a)).toBe(m)
      }
    }
  })
})

/**
 * **The `qam4k` switch is labelled twice and rendered once, and the rendered one went false.**
 *
 * Both labels read 「4096-QAM (MCS 12/13)」 until 2026-10-10. Those two rung numbers are EHT's:
 * `uhr` interleaves four new rungs below them, so its 4096-QAM pair is index 16/17. The
 * generation dropdown has offered Wi-Fi 8 since `'uhr'` landed, and the feature checkboxes
 * underneath it are rendered from `STRINGS.features` — so a `uhr` node could be ticking a box
 * whose caption named a rung it does not have.
 *
 * Three welds, because the defect had three halves. The wording has to be true of every mode
 * with a 4096-QAM rung at all (so it is positional, and the position is MEASURED off
 * `PHY_MODES`); the two tables have to agree on which switches exist; and neither may go back to
 * naming a number, which is what a bare 「no rung index in either label」 assertion forbids.
 */
describe('the feature labels say nothing that is only true of one generation', () => {
  it('4096-QAM really is the top two rungs of every ladder that has it, which is what both labels now say', () => {
    const withQam = PHY_MODE_ORDER.filter((m) => PHY_MODES[m].qam4kFromMcs !== undefined)
    // Anti-vacuity: two modes have the rung, and the positional claim is about both of them.
    expect(withQam, 'the modes with a 4096-QAM rung').toEqual(['eht', 'uhr'])
    for (const m of withQam) {
      const p = PHY_MODES[m]
      expect(p.qam4kFromMcs, `${m}: the lowest 4096-QAM index is the ladder's length minus two`)
        .toBe(p.ndbps.length - 2)
    }
    // And the indices really are different, which is the whole reason one wording had to replace
    // the other rather than the number being corrected.
    expect(PHY_MODES.eht.qam4kFromMcs).toBe(12)
    expect(PHY_MODES.uhr.qam4kFromMcs).toBe(16)
  })

  it('neither label names a rung index, in any generation', () => {
    for (const [where, table] of [['FEATURE_LABEL', FEATURE_LABEL], ['STRINGS.features', STRINGS.features]] as const) {
      for (const [flag, label] of Object.entries(table)) {
        expect(/MCS\s*\d/.test(label), `${where}.${flag} = 「${label}」 names an MCS index, and an`
          + ' index means a different modulation in each generation (eht 12/13 against uhr 16/17)')
          .toBe(false)
      }
    }
  })

  /**
   * **A source comment is an evidence claim, and this one over-read its motion.**
   *
   * `GEN_FEATURES`'s docblock used to say 「Motion #200 includes 4096-QAM in UHR (so `qam4k`)」.
   * The motion's whole text is `Include 4096-QAM in UHR UEQM` and it sits in the
   * unequal-modulation subsection of the SFD, between #199 `Exclude BPSK from UHR UEQM` and
   * #216's mandatory-MCS list, so it rules on what UEQM may mix across spatial streams — a
   * feature this engine has no model of — rather than granting UHR the rung. The rung itself
   * comes over with EHT, and the engine says so in numbers: the two 4096-QAM rungs keep EHT's
   * own draft numbers 12 and 13, while the four MCSs 11bn adds are 17 / 19 / 20 / 23.
   *
   * So this checks the numbers first and the sentence second. Nobody reads the sentence, which
   * is exactly why nothing but this would notice it drifting back.
   */
  it("the 4096-QAM pair is EHT's MCS 12/13 carried over, which is the basis the docblock may cite", () => {
    // the engine's own statement of the inheritance: same N_DBPS, same draft MCS numbers
    expect(PHY_MODES.uhr.ndbps.slice(PHY_MODES.uhr.qam4kFromMcs!))
      .toEqual(PHY_MODES.eht.ndbps.slice(PHY_MODES.eht.qam4kFromMcs!))
    expect(UHR_SFD_MCS.slice(PHY_MODES.uhr.qam4kFromMcs!), "UHR keeps EHT's own two numbers here")
      .toEqual([12, 13])
    // anti-vacuity: the four rungs 11bn really adds are elsewhere in the ladder and are not these
    expect(UHR_SFD_MCS.filter((m) => m > 13).sort((a, b) => a - b)).toEqual([17, 19, 20, 23])

    const doc = docblockOf(CAPS_SRC, 'export const GEN_FEATURES')
    // the quotation has to be the motion's own words, not a paraphrase of a wider claim
    expect(doc, "#200's whole text").toContain('Include 4096-QAM in UHR UEQM')
    // and no sentence may offer #200 as the reason the flag is on — the regression this guards
    for (const s of sentences(doc)) {
      expect(/Motion #200/.test(s) && /`qam4k`/.test(s),
        `the docblock offers Motion #200 as the basis for \`qam4k\` again: 「${s.trim()}」`).toBe(false)
    }
    // the positive half, so a docblock that simply drops the citation does not pass either
    expect(sentences(doc).some((s) => /Motion #419/.test(s) && /MCS0-15/.test(s)),
      'the docblock still has to say which motion DOES carry the rung').toBe(true)
  })

  it('and the two tables label the same seven switches', () => {
    // The English table has no consumer — the editor renders the i18n one — so nothing but this
    // would notice the two drifting apart. See FEATURE_LABEL's docblock.
    expect(Object.keys(FEATURE_LABEL).sort()).toEqual(Object.keys(STRINGS.features).sort())
    expect(Object.keys(FEATURE_LABEL).sort()).toEqual([...new Set(GENERATIONS.flatMap((g) => GEN_FEATURES[g]))].sort())
  })
})

function node(gen: Generation, widthMhz?: number, nss?: number): NodeCfg {
  return {
    id: 'n', kind: 'sta', name: 'n', pos: { x: 0, y: 0, z: 1 }, txPowerDbm: 15,
    profiles: [], caps: { generation: gen, features: {}, widthMhz, nss } as NodeCfg['caps'],
  }
}

describe('channel width and spatial streams', () => {
  it('default to 20 MHz and one stream, which is what keeps lessons 1-14 unchanged', () => {
    expect(widthOf(node('eht'))).toBe(20)
    expect(nssOf(node('eht'))).toBe(1)
  })

  it('a link runs at the narrower width and the smaller stream count of its two ends', () => {
    const ap = node('eht', 320, 4)
    const phone = node('eht', 160, 2)
    expect(negotiatedWidth(ap, phone)).toBe(160)
    expect(negotiatedNss(ap, phone)).toBe(2)
  })

  it('a declared width is clamped to what the generation can do', () => {
    expect(widthOf(node('he', 320))).toBe(MAX_WIDTH.he)
    expect(widthOf(node('nonht', 80))).toBe(20)
  })
})

const mk = (id: string, kind: 'ap' | 'sta', generation: Generation, extra: Partial<NodeCfg> = {}): NodeCfg => ({
  id, kind, name: id, pos: { x: 0, y: 0, z: 1 }, txPowerDbm: 15, profiles: ['idle'],
  caps: { generation, features: {} }, ...extra,
})

describe('the 2.4 GHz link', () => {
  it('virtual ids and band labels', () => {
    expect(virtualId('sta-1', '2g')).toBe('sta-1#2g')
    expect(virtualId('sta-1', '5g')).toBe('sta-1')
    expect(linkOfVirtual('sta-1#2g')).toBe('2g')
    expect(linkOfVirtual('sta-1#6g')).toBe('6g')
    expect(linkOfVirtual('sta-1')).toBe('5g')
    expect(BAND_LABEL).toEqual({ '2g': '2.4G', '5g': '5G', '6g': '6G' })
    expect(LINK_ORDER).toEqual(['5g', '6g', '2g'])
  })

  it('a station with linkId 2g is on the 2.4 GHz link unless it is VHT', () => {
    expect(nodeLinks(mk('s', 'sta', 'nonht', { linkId: '2g' }), false)).toEqual(['2g'])
    expect(nodeLinks(mk('s', 'sta', 'he', { linkId: '2g' }), false)).toEqual(['2g'])
    expect(nodeLinks(mk('s', 'sta', 'eht', { linkId: '2g' }), false)).toEqual(['2g'])
    expect(nodeLinks(mk('s', 'sta', 'vht', { linkId: '2g' }), false)).toEqual(['5g'])
    expect(nodeLinks(mk('s', 'sta', 'he', { linkId: '6g' }), false)).toEqual(['6g'])
    expect(nodeLinks(mk('s', 'sta', 'he'), false)).toEqual(['5g'])
  })

  it('the AP joins every link a station uses; 5 GHz-only scenarios are unchanged', () => {
    const ap = mk('ap', 'ap', 'eht')
    const old = linkPlanFor([ap, mk('a', 'sta', 'he'), mk('b', 'sta', 'nonht')])
    expect(old.links).toEqual(['5g'])
    expect(old.virtualIds).toEqual(['ap', 'a', 'b'])
    const mixed = linkPlanFor([ap, mk('a', 'sta', 'he', { linkId: '2g' }), mk('b', 'sta', 'nonht')])
    expect(mixed.links).toEqual(['5g', '2g'])
    expect(mixed.members['2g']).toEqual(['ap', 'a'])
    expect(mixed.members['5g']).toEqual(['ap', 'b'])
    expect(mixed.virtualIds).toEqual(['ap', 'ap#2g', 'a#2g', 'b'])
  })

  it('an all-2.4 GHz scenario builds no phantom 5 GHz link', () => {
    const plan = linkPlanFor([mk('ap', 'ap', 'eht'), mk('sta', 'sta', 'he', { linkId: '2g' })])
    expect(plan.links).toEqual(['2g'])
    expect(plan.virtualIds).toEqual(['ap#2g', 'sta#2g'])
    expect(plan.members['5g']).toEqual([])
    expect(plan.members['2g']).toEqual(['ap', 'sta'])
  })

  it('an AP on its own still operates one 5 GHz link', () => {
    const plan = linkPlanFor([mk('ap', 'ap', 'eht')])
    expect(plan.links).toEqual(['5g'])
    expect(plan.virtualIds).toEqual(['ap'])
  })

  it('an MLO AP keeps its 5 + 6 GHz pair even when every station is on 5 GHz', () => {
    const ap = mk('ap', 'ap', 'eht', { caps: { generation: 'eht', features: { mlo: true } } })
    const plan = linkPlanFor([ap, mk('a', 'sta', 'he')])
    expect(plan.links).toEqual(['5g', '6g'])
    expect(plan.virtualIds).toEqual(['ap', 'ap#6g', 'a'])
  })

  it('an MLO AP keeps both radios even when only a 2.4 GHz station is present', () => {
    const ap = mk('ap', 'ap', 'eht', { caps: { generation: 'eht', features: { mlo: true } } })
    const plan = linkPlanFor([ap, mk('a', 'sta', 'he', { linkId: '2g' })])
    expect(plan.links).toEqual(['5g', '6g', '2g'])
  })

  it('width is clamped to 40 MHz on 2.4 GHz', () => {
    const n = mk('s', 'sta', 'eht', { caps: { generation: 'eht', features: {}, widthMhz: 160 }, linkId: '2g' })
    expect(widthOf(n)).toBe(160)
    expect(widthOf(n, '2g')).toBe(40)
  })
})
