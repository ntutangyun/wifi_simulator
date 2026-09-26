/**
 * Provenance is data, and data drifts.
 *
 * Each module declares the documents its lessons are checked against, and the
 * course panel prints that declaration — including whether the document is a
 * ratified standard or a draft that can still change. A declaration the lessons
 * have outgrown is worse than no declaration: it tells a reader that a number
 * read off a 2023 contribution came from a published standard.
 *
 * These are checks on the data, not on the wording. No lesson is required to
 * name a standard — a lesson resting entirely on the simulator's own model
 * values legitimately names none — so nothing here asserts on prose.
 */
import { describe, expect, it } from 'vitest'
import { GLOSSARY } from '../../src/ui/glossary'
import { LESSONS } from '../../src/course/lessons'
import {
  BASES, CONTRIBUTIONS, MODULES, TIERS, basisOf, citedBases, citedDocs, teachesDraft,
  type StandardBasis,
} from '../../src/course/curriculum'

/** Modules that have at least one authored lesson; an empty module is not shown. */
const live = MODULES
  .map((m, mi) => ({ m, mi, lessons: LESSONS.filter((l) => l.module === mi) }))
  .filter(({ lessons }) => lessons.length > 0)

const citedIn = (mi: number): Set<StandardBasis> =>
  new Set(LESSONS.filter((l) => l.module === mi).flatMap(citedBases))

describe('a module is checked against the documents it declares', () => {
  // The defect this exists to catch: a draft number appearing in a lesson whose
  // module claims a published standard. Silent, invisible in review, and it
  // misrepresents how firm a number is.
  it.each(live)('$m.title cites nothing it has not declared', ({ mi }) => {
    const declared = basisOf(mi)
    const undeclared = [...citedIn(mi)].filter((b) => !declared.includes(b))
    expect(undeclared, `module ${mi} cites ${undeclared.join(', ')}`).toEqual([])
  })

  // The other direction, for drafts only. A stale draft claim is the hazard; a
  // published standard cited by clause number alone (§17.3.10.2) is not, and
  // demanding its name in prose would be a rule about wording.
  it.each(live.filter(({ mi }) => teachesDraft(mi)))(
    '$m.title actually uses the draft it warns about',
    ({ mi }) => {
      const cited = citedIn(mi)
      const unusedDrafts = basisOf(mi).filter((b) => BASES[b].draft && !cited.has(b))
      expect(unusedDrafts, `module ${mi} declares unused ${unusedDrafts.join(', ')}`).toEqual([])
    },
  )
})

describe('a tier is checked against the documents it declares', () => {
  const liveTiers = TIERS
    .map((tier, ti) => ({ tier, ti, mods: live.filter(({ m }) => m.tier === ti) }))
    .filter(({ mods }) => mods.length > 0)

  // Weaker than the per-module rule on purpose: a tier's basis must be earned
  // somewhere under it, which catches a wholly invented declaration without
  // forcing every module to name the standard in its own prose.
  it.each(liveTiers)('$tier.label earns every document it declares', ({ tier, mods }) => {
    const cited = new Set(mods.flatMap(({ mi }) => [...citedIn(mi)]))
    const unearned = tier.basis.filter((b) => !cited.has(b))
    expect(unearned, `tier declares unearned ${unearned.join(', ')}`).toEqual([])
  })
})

describe('the basis table itself', () => {
  it('names every basis any tier or module declares', () => {
    const used = new Set([...TIERS.flatMap((t) => t.basis), ...MODULES.flatMap((m) => m.basis ?? [])])
    for (const b of used) expect(BASES[b], `no BASES entry for ${b}`).toBeTruthy()
  })

  it('marks the two unratified drafts as drafts, and the two published standards as not', () => {
    expect(BASES['p802-15-4ab'].draft).toBe(true)
    expect(BASES['p802-11bp'].draft).toBe(true)
    expect(BASES['ieee-802-15-4-2024'].draft).toBe(false)
    expect(BASES['ieee-802-11'].draft).toBe(false)
  })

  it('never lets a module declare exactly what its tier already declares', () => {
    // The `track` field earned this doctrine: an override that agrees with its
    // default is a second place for the same fact to go stale.
    const redundant = MODULES
      .map((m, mi) => ({ mi, m }))
      .filter(({ m }) => m.basis && m.basis.join() === TIERS[m.tier].basis.join())
      .map(({ mi }) => mi)
    expect(redundant, `modules ${redundant.join(', ')} restate their tier`).toEqual([])
  })
})

describe('a glossary section about a draft says so on every entry', () => {
  // The guide window is where a reader looks a number up out of context: no
  // lesson around it, no section heading above it. An entry from the draft
  // section that names no provenance reads exactly like one from the published
  // standard. "Provenance" here is deliberately broad — a draft citation, a
  // model value, a standard clause or a regulation all answer the question;
  // only silence fails.
  const draftGroups = GLOSSARY.filter((g) => g.title.includes('草案'))

  it('has a draft section to check', () => {
    expect(draftGroups.length).toBeGreaterThan(0)
  })

  const entries = draftGroups.flatMap((g) => g.items.map((it) => ({ g, it })))

  it.each(entries)('$it.term names where it comes from', ({ it: item }) => {
    const text = `${item.alt} ${item.def}`
    const marks = ['草案', '模型取值', '标准', '法规']
    expect(
      marks.some((m) => text.includes(m)),
      `glossary entry "${item.term}" names no provenance`,
    ).toBe(true)
  })
})

describe('a draft lesson names the contributions behind its numbers', () => {
  // The AMP track is paused, and two of its lessons carry no `sources` field at
  // all — a real gap, pinned below rather than skipped, so resuming AMP trips it.
  const SOURCELESS_AMP = ['amp-slots', 'amp-coexist']
  const draftLessons = LESSONS.filter(
    (l) => teachesDraft(l.module) && !SOURCELESS_AMP.includes(l.id),
  )

  it('has draft lessons to check', () => {
    expect(draftLessons.length).toBeGreaterThan(0)
  })

  it('still knows about the two AMP lessons that have no sources at all', () => {
    // Not an allowance: a standing note of work owed. When AMP resumes and these
    // gain sources, this expectation fails and the two join the rule above.
    const actual = LESSONS.filter((l) => teachesDraft(l.module) && !l.sources?.length).map((l) => l.id)
    expect(actual.sort()).toEqual([...SOURCELESS_AMP].sort())
  })

  // A lesson under a draft module whose numbers trace to no document is a number
  // with nowhere to check it. One document or several — the four MMS papers split
  // by layer, not by lesson — but never none.
  it.each(draftLessons)('$id cites at least one contribution', (l) => {
    expect(citedDocs(l).length, `${l.id} cites no draft contribution`).toBeGreaterThan(0)
  })

  // A mistyped revision reads exactly like a real one and sends anyone trying to
  // verify a number to a document that does not exist.
  it.each(LESSONS)('$id cites only registered contributions', (l) => {
    const unknown = citedDocs(l).filter((d) => !CONTRIBUTIONS[d])
    expect(unknown, `${l.id} cites unregistered ${unknown.join(', ')}`).toEqual([])
  })

  it('registers no contribution the course has stopped using', () => {
    const used = new Set(LESSONS.flatMap(citedDocs))
    const stale = Object.keys(CONTRIBUTIONS).filter((d) => !used.has(d))
    expect(stale, `unused registry entries: ${stale.join(', ')}`).toEqual([])
  })

  it('describes every contribution it registers', () => {
    for (const [doc, what] of Object.entries(CONTRIBUTIONS)) {
      expect(what.length, `${doc} has no description`).toBeGreaterThan(8)
    }
  })
})

describe('citedBases reads the prose it is given', () => {
  const of = (...sources: string[]): StandardBasis[] =>
    citedBases({ sources } as Parameters<typeof citedBases>[0]).sort()

  it('finds a contribution number', () => {
    expect(of('见 4ab 草案 15-22/0381r5 §1.1')).toEqual(['p802-15-4ab'])
  })

  it('finds the published 802.15.4 revision', () => {
    expect(of('见 IEEE Std 802.15.4-2024 §10.29')).toEqual(['ieee-802-15-4-2024'])
  })

  it('does not read 802.11 out of 802.11bp', () => {
    expect(of('见 P802.11bp 草案')).toEqual(['p802-11bp'])
  })

  it('does not read 802.11 out of a bare 802.15.4 citation', () => {
    expect(of('见 IEEE Std 802.15.4-2024')).toEqual(['ieee-802-15-4-2024'])
  })

  it('finds both when a lesson genuinely cites both', () => {
    expect(of('UWB 见 IEEE Std 802.15.4-2024，Wi-Fi 见 IEEE Std 802.11')).toEqual(
      ['ieee-802-11', 'ieee-802-15-4-2024'],
    )
  })

  it('finds nothing in a lesson that rests on model values alone', () => {
    expect(of('路径损耗指数 3.0 是模型取值，并非标准正文。')).toEqual([])
  })

  it('is stateless across calls despite the global regexes', () => {
    const src = '见 IEEE Std 802.15.4-2024 §10.29'
    expect(of(src)).toEqual(of(src))
  })
})
