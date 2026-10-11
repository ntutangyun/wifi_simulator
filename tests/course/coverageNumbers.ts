/**
 * **The figures §17 of `docs/wifi-feature-coverage.md` states to a reader, and the measurements
 * behind them.**
 *
 * A number stated in two places with nothing comparing them is this repository's standing defect,
 * and §17 states all of these: the `limits` debt with its 余量, the per-lesson main-path band with
 * the tightest lesson's distance from its upper end, and (since 2026-10-11) the three sides of the
 * comparison that debt is read by, with their margins. So each lives here once and every side
 * calls it — the prose check in `tests/course/wifi-coverage.test.ts` and the contract assertions
 * in `tests/course/readability.test.ts`.
 *
 * **Why the debt is measured here rather than asserted twice.** It used to be asserted in two
 * places that agreed by coincidence:
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
 * §17's 实测 column is now the **measured debt**, its 余量 column is `ceiling − debt`, and the
 * ceiling is the one number a human owns: raising it needs somebody to agree to it, and nothing
 * in the repository may raise it to make a build green.
 *
 * The corpus these are measured over, and the ruler they are measured with, are `./corpus`;
 * this file and that one were one file called `limitsDebt.ts` until 2026-10-10, and that file's
 * docblock says why they are two now.
 */
import type { Lesson } from '../../src/course/lessonKit'
import { gradedProseTexts } from '../../src/course/readability'
import { migratedLessons, names, zhMainText, zhTermsFor } from './corpus'

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
 * It is the ceiling AND (today) the current value: the debt stands at exactly 287, with no slack
 * in it, and that is deliberate rather than an accident of when it was measured — a ratchet with
 * room left in it is not a ratchet. Paying debt down is never a human's call; **raising this is**,
 * and it is not a thing to do because the build is red. See the ratchet's own docblock in
 * `readability.test.ts` for the history of the number (292 → 289 and 289 → 287 both on
 * 2026-10-11, 296 → 292 on 2026-10-05, and 302 → 292 before that).
 *
 * **Why it comes down in the same slice that pays the debt, with nobody asked.** The two
 * sentences above are the rule: the ceiling is the current value, slack in it is the defect, and
 * only RAISING it is a human's call. The 296 → 292 step wrote the same thing down as a precedent
 * — 「leaving the number at 296 would have left four characters of slack in a ratchet whose whole
 * argument is that it has none」, in the ratchet's docblock — and §17 of
 * `docs/wifi-feature-coverage.md` states 余量 = `ceiling − debt` to a reader, so a debt paid down
 * with this number held still does not read as generosity: it reads as a 余量 nobody chose. W16
 * paid three of `@fading`'s pairs and lowered this by three in the same commit, and W17 paid its
 * last two — 载波侦听 and 隐藏节点, onto that lesson's own main path — and lowered this by two in
 * the same commit. W16 had declined that step because it cost the margin of a SECOND ruler (the
 * 「more than `sources` + `deeper`」 comparison, down to 3); W17 re-aimed that ruler onto each
 * field alone and moved the sum comparison into §17 as a measured figure, which is what made the
 * repayment cost nothing but prose.
 */
export const LIMITS_DEBT_CEILING = 287

/**
 * The per-lesson main-path band the lesson contract enforces: about a third of the mean lesson,
 * and twice it. `readability.test.ts` asserts it lesson by lesson with **strict** comparisons
 * (`> floor`, `< ceiling`), so a lesson sitting exactly on either end FAILS — which is why the
 * 「distance to the edge」 a reader is shown and the 「characters you may still add」 differ by one.
 *
 * It lives here for the same reason the ceiling does: §17 of `docs/wifi-feature-coverage.md`
 * states this band to a reader AND states the tightest lesson's distance from its upper end, and
 * a number stated in two places with nothing comparing them is this document's standing defect.
 */
export const MAIN_PATH_BAND = { floor: 700, ceiling: 4_400 } as const

/**
 * The ratchet, measured: the debt as a list of `lesson|term` pairs, its size, and the slack left
 * under the ceiling.
 *
 * Both sides call THIS, which is the whole point of the module: §17's row and the assertion it
 * cites cannot drift apart by one side being re-measured and the other re-typed.
 */
/**
 * **Memoised, and that is a loaded gun if anybody points it at a mutated corpus.** The lessons are
 * module-level constants, so one process sees one debt and the memo is free; but a caller that
 * MUTATES a lesson's `limits` and then asks again — which is exactly what a planted-violation
 * probe does — gets the number from before the mutation, silently and with no way to tell. This
 * repository has already been bitten three times by a measurement taken with a broken instrument,
 * and a memo that answers for a corpus that no longer exists is the next one. If you need the debt
 * of a changed corpus, call {@link owed} / {@link limitsOf} over your own lesson list; do not
 * reach for this.
 */
let memo: { pairs: string[]; debt: number; slack: number } | null = null

export function limitsRatchet(): { pairs: string[]; debt: number; slack: number } {
  if (memo) return memo
  const pairs = migratedLessons().flatMap((l) => owed(l, limitsOf(l)))
  memo = { pairs, debt: pairs.length, slack: LIMITS_DEBT_CEILING - pairs.length }
  return memo
}

/**
 * **The three sides of the comparison, measured with one ruler and defined once.**
 *
 * Criterion Q over `limits`, over `sources` and over `deeper` — the field the lesson contract
 * ratchets, and the two fields the bracket rule excludes on purpose. The ratchet is pinned on
 * `limits` because it is the BIGGEST of these three while being rendered open on the main path and
 * timed at zero, and `readability.test.ts` asserts exactly that, as two strict orderings.
 *
 * **Why all three live here rather than in the assertion that uses them.** Until 2026-10-11 the
 * assertion compared `limits` against `sources` **+** `deeper`, and the margin of that comparison
 * — 28 at its filing commit (`2514723`), 3 by the time anybody re-read it — was a number nobody
 * chose and nothing stated. Slice W17 re-aimed the assertion onto each field alone and moved the
 * sum comparison into §17 of `docs/wifi-feature-coverage.md` as a STATED figure: three sides,
 * their lesson counts and both margins. So the two sides have to read one definition, which is
 * what this module is for. A pair on the `sources`/`deeper` side is its own debt — a reader meets
 * an official term in a field this lesson's main path never names — of the same species as
 * `docs/course-wording-contract.md` §10, whose criterion scopes those two fields out.
 *
 * Not memoised, unlike {@link limitsRatchet}: see that function's warning. A caller measuring a
 * mutated corpus gets an honest answer from this one.
 */
export const sideDebts = (): Record<'limits' | 'sources' | 'deeper', string[]> => {
  const ls = migratedLessons()
  return {
    limits: ls.flatMap((l) => owed(l, limitsOf(l))),
    sources: ls.flatMap((l) => owed(l, (l.sources ?? []).join(' '))),
    deeper: ls.flatMap((l) => owed(l, gradedProseTexts({ picture: l.deeper }).join(' '))),
  }
}

/** The lessons a side's pairs are spread over — the 涉及课数 column of §17's table. */
export const lessonsOwing = (pairs: readonly string[]): number =>
  new Set(pairs.map((p) => p.split('|')[0])).size
