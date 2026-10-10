/**
 * **Which lessons this run grades, and the one ruler it measures them with.**
 *
 * The lesson corpus as the course tests see it: the reader's order, the set still in the old
 * shape, the switch that admits one of them to the contract early, each lesson's glossary rows
 * and its graded main text, and `names` — the single call both sides of every term comparison
 * go through.
 *
 * **One ruler on both sides of every comparison** is why that last one is a shared export rather
 * than a local helper, and the reason it is carried here verbatim: an earlier count of the
 * `limits` debt came out as 279 because the 「appears in `limits`」 side matched abbreviations on
 * a whole-token boundary while the 「appears on the main path」 side used a bare `includes`, which
 * excused ten pairs. {@link bracketedAtFirstZhUse} is the ruler, and {@link names} is the same
 * call on both sides.
 *
 * **This file and `./coverageNumbers` were one file called `limitsDebt.ts` until 2026-10-10.**
 * That name covered the debt ceiling it was created for and then stopped covering what kept
 * being added to it — the migration list, the lesson orders, the ruler, and finally
 * `MAIN_PATH_BAND`, a prose-length band with nothing to do with any debt, which the next person
 * would not have thought to look for in a file with that name. The split is by what the two
 * halves ARE: this one is the corpus and the ruler, `./coverageNumbers` is the two figures §17 of
 * `docs/wifi-feature-coverage.md` states to a reader. Every definition moved unchanged, and the
 * move was checked by dumping all 14 exports in full on both sides and diffing.
 *
 * It is a plain `.ts` module under `tests/course/` rather than a `.test.ts` one, which is the
 * existing shape for shared test machinery here (`tests/course/kit.ts`, `tests/course/coverage.ts`,
 * `tests/course/rssi.ts`).
 */
import { COURSE_ORDER, trackOf } from '../../src/course/curriculum'
import { LESSONS } from '../../src/course/lessons'
import type { Lesson } from '../../src/course/lessonKit'
import {
  ZH_TERMS, bracketedAtFirstZhUse, gradedProseTexts, type ZhTerm,
} from '../../src/course/readability'

/**
 * Lessons still in the old shape. Each migration task removes its ids; the list only shrinks.
 * Empty since 2026-10-02: `amp-slots` and `amp-coexist` were the last two, and the AMP track's
 * last coverage hole besides them was the term rule's own `graded` exclusion, removed in the
 * same pass.
 *
 * **It lives here rather than in `readability.test.ts` because the debt is measured over the
 * MIGRATED set**, and two sides measuring 「the debt」 over two different lesson lists is the same
 * silent disagreement this module exists to remove. Today the list is empty and the two sets
 * coincide; that is a fact about today's corpus, not a definition — which is precisely the kind of
 * coincidence the ratchet's own docblock refuses to lean on.
 */
export const MIGRATING: string[] = []

/** The ids of `READABILITY_INCLUDE`, trimmed; an unset or blank variable names none. */
export function includedIds(env: string | undefined): string[] {
  return (env ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

/**
 * MIGRATING as this run sees it: the recorded list minus the ids of
 * `READABILITY_INCLUDE`. It only ever shrinks the list — an id the variable
 * names but MIGRATING does not hold changes nothing — so the switch can admit
 * a lesson to the contract test but never excuse one from it.
 */
export function effectiveMigrating(migrating: readonly string[], env: string | undefined): string[] {
  const included = includedIds(env)
  return migrating.filter((id) => !included.includes(id))
}

/**
 * MIGRATING as this run grades it. `READABILITY_INCLUDE=uwb-sstwr,uwb-dstwr` removes those ids
 * for one run, so an implementer can hold a rewritten lesson to the contract before the
 * controller has registered it — without editing a shared, controller-owned file. The switch only
 * ever shrinks the list (`tests/course/kit.ts`), so it can admit a lesson to the contract but
 * never excuse one.
 */
export const MIGRATING_NOW = effectiveMigrating(MIGRATING, process.env.READABILITY_INCLUDE)

const byId = new Map(LESSONS.map((l) => [l.id, l]))

/** Every lesson of the course, in the reader's order. */
export const orderedLessons = (): Lesson[] => COURSE_ORDER.flatMap((id) => byId.get(id) ?? [])

/** The lessons held to the lesson contract in this run: {@link orderedLessons} minus MIGRATING. */
export const migratedLessons = (): Lesson[] =>
  orderedLessons().filter((l) => !MIGRATING_NOW.includes(l.id))

/** The glossary rows graded in one lesson: all of them, minus those the other track owns. */
export const zhTermsFor = (l: Lesson): ZhTerm[] =>
  ZH_TERMS.filter((t) => !t.track || t.track === trackOf(l))

/** One joined Chinese string per lesson, in reading order: what "first use" is first in. */
export const zhMainText = (l: Lesson): string => gradedProseTexts(l).join(' ')

/** The one ruler: did this text name the term at all (bracketed or not)? */
export const names = (text: string, t: ZhTerm): boolean => bracketedAtFirstZhUse(text, t) !== null
