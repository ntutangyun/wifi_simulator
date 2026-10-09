/**
 * The `limits` debt, measured once — the module both sides of the ratchet share.
 *
 * **Why this file exists.** The debt is asserted in two places and they used to agree by
 * coincidence rather than by construction:
 *
 *  - `tests/course/readability.test.ts` holds the ratchet itself — the debt may not exceed
 *    {@link LIMITS_DEBT_CEILING} — and computed it from a private `owed` / `limitsOf` pair;
 *  - `docs/wifi-feature-coverage.md` §17 states the same number to a reader, in a row that also
 *    states its 余量, and `tests/course/wifi-coverage.test.ts` checked that row by **reading the
 *    ratchet's `it` title out of the test file with a regex**. That compared two pieces of TEXT.
 *    It could not tell a paid-down debt from a stale ceiling, so the 余量 the row shows — 「the
 *    ratchet has no slack left」 — was the one figure in §17 that nothing measured. Pay four
 *    pairs back without touching the ceiling and that 0 quietly becomes a lie, which is the exact
 *    defect the slices around it were opened for.
 *
 * So the computation lives here, once, and both sides call it. §17's 实测 column is now the
 * **measured debt**, its 余量 column is `ceiling − debt`, and the ceiling is the one number a
 * human owns: raising it needs somebody to agree to it, and nothing in the repository may raise
 * it to make a build green.
 *
 * **One ruler on both sides of every comparison**, which is the property the old inline copy was
 * careful about and the reason it is carried over verbatim: an earlier count of this same debt
 * came out as 279 because the 「appears in `limits`」 side matched abbreviations on a whole-token
 * boundary while the 「appears on the main path」 side used a bare `includes`, which excused ten
 * pairs. {@link bracketedAtFirstZhUse} is the ruler, and {@link names} is the same call on both
 * sides.
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

/**
 * Criterion Q, for one field of one lesson: the (lesson, term) pairs where the term is named in
 * `field` and never named on that lesson's own graded main path.
 *
 * Criterion Q is NOT criterion P — how many failure messages the bracket rule would newly emit if
 * the field joined its walk — and the ratchet's docblock in `readability.test.ts` says why the
 * distinction has to be named rather than assumed.
 */
export const owed = (l: Lesson, field: string): string[] => {
  const own = zhMainText(l)
  return zhTermsFor(l)
    .filter((t) => names(field, t) && !names(own, t))
    .map((t) => `${l.id}|${t.zh ?? t.abbr}`)
}

/** Everything a reader is shown in a lesson's `limits`, joined. */
export const limitsOf = (l: Lesson): string => l.limits.map((x) => x.text).join(' ')

/**
 * **The ceiling, and the one number here a human owns.**
 *
 * It is the ceiling AND (today) the current value: the debt stands at exactly 292, with no slack
 * in it, and that is deliberate rather than an accident of when it was measured — a ratchet with
 * room left in it is not a ratchet. Paying debt down is never a human's call; **raising this is**,
 * and it is not a thing to do because the build is red. See the ratchet's own docblock in
 * `readability.test.ts` for the history of the number (296 → 292 on 2026-10-05, and 302 → 292
 * before that).
 */
export const LIMITS_DEBT_CEILING = 292

/**
 * The ratchet, measured: the debt as a list of `lesson|term` pairs, its size, and the slack left
 * under the ceiling.
 *
 * Both sides call THIS, which is the whole point of the module: §17's row and the assertion it
 * cites cannot drift apart by one side being re-measured and the other re-typed.
 */
let memo: { pairs: string[]; debt: number; slack: number } | null = null

export function limitsRatchet(): { pairs: string[]; debt: number; slack: number } {
  if (memo) return memo
  const pairs = migratedLessons().flatMap((l) => owed(l, limitsOf(l)))
  memo = { pairs, debt: pairs.length, slack: LIMITS_DEBT_CEILING - pairs.length }
  return memo
}
