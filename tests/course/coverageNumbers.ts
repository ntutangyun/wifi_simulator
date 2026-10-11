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
import { gradedProseTexts, zhAkaViolations, zhTermFailure } from '../../src/course/readability'
import { migratedLessons, names, zhMainText, zhTermsFor } from './corpus'

/** The three fields the two criteria are measured over: the ratcheted one and the two excluded. */
export type Side = 'limits' | 'sources' | 'deeper'

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
export const sideDebts = (): Record<Side, string[]> => {
  const ls = migratedLessons()
  return {
    limits: ls.flatMap((l) => owed(l, SIDE_TEXT.limits(l))),
    sources: ls.flatMap((l) => owed(l, SIDE_TEXT.sources(l))),
    deeper: ls.flatMap((l) => owed(l, SIDE_TEXT.deeper(l))),
  }
}

/**
 * **What a reader is shown in each of the three fields — one definition, read by BOTH criteria.**
 *
 * Criterion Q ({@link sideDebts}) and criterion P ({@link criterionP}) are two different rules; if
 * they also read two different strings out of a lesson, then nothing about their two numbers is
 * comparable and the difference between them stops meaning anything. They are rules over the same
 * text, and this is that text. `deeper` is taken by the **prose walk the criterion names**
 * (`gradedProseTexts`, the same walk the bracket rule itself grades), not as every string the
 * field holds — see the `deeper` note in `criterionP`'s docblock, which is the one cell of the
 * three historical records that needs a wider ruler than this to reproduce.
 */
export const SIDE_TEXT: Record<Side, (l: Lesson) => string> = {
  limits: (l) => limitsOf(l),
  sources: (l) => (l.sources ?? []).join(' '),
  deeper: (l) => gradedProseTexts({ picture: l.deeper }).join(' '),
}

/** The lessons a side's pairs are spread over — the 涉及课数 column of §17's table. */
export const lessonsOwing = (pairs: readonly string[]): number =>
  new Set(pairs.map((p) => p.split('|')[0])).size

/** Criterion P's two arms, counted separately because they are two different rules. */
export type Arms = { bracket: number; aka: number }

/** `291 ＝ 286 ＋ 5` — the total §17 states, and the only way the two arms are ever added. */
export const armsTotal = (a: Arms): number => a.bracket + a.aka

/**
 * Both arms of the bracket rule over one string, for the terms one lesson is graded on.
 *
 * Exported for one reason: it is the 「without the subtraction」 half of {@link criterionP}, and
 * `coverageNumbers.test.ts` pins the subtraction by comparing the two on a synthetic lesson whose
 * main path already fails. A measuring function whose own arithmetic nothing checks is the species
 * this module keeps finding in the figures it measures.
 */
export const failuresOn = (l: Lesson, text: string): Arms => {
  let bracket = 0
  let aka = 0
  for (const t of zhTermsFor(l)) {
    if (zhTermFailure(text, t) !== null) bracket += 1
    aka += zhAkaViolations(text, t).length
  }
  return { bracket, aka }
}

/**
 * **The bracket rule's failures on the graded main path alone — criterion P's baseline.**
 *
 * Zero, and `readability.test.ts`'s own per-lesson assertion is what keeps it zero. It is not
 * asserted here, because an assertion that can only redden when another one is already red is
 * decoration; {@link criterionP} does not assume it either — it subtracts, so a day with a
 * non-zero baseline gets an honest P rather than a quietly inflated one. It is exported so a
 * reader can see for themselves that 「newly emitted」 and 「emitted」 coincide today.
 *
 * Takes a lesson list so the instrument can be aimed at a synthetic corpus — see
 * {@link criterionP}'s parameter, and `coverageNumbers.test.ts`, which needs a lesson whose
 * baseline is NOT zero and cannot get one out of the real course.
 */
export const gradedWalkFailures = (ls: readonly Lesson[] = migratedLessons()): Arms =>
  ls.reduce<Arms>((a, l) => {
    const f = failuresOn(l, zhMainText(l))
    return { bracket: a.bracket + f.bracket, aka: a.aka + f.aka }
  }, { bracket: 0, aka: 0 })

/**
 * **Criterion P, measured: how many failure messages the bracket rule would NEWLY emit if each
 * field joined the walk it grades.** A message per lesson per term, in two arms — the bracket arm
 * and the `aka` arm.
 *
 * **This is not criterion Q** ({@link owed} / {@link sideDebts}), which counts (lesson, term)
 * PAIRS. The two are easy to confuse, the filing design document was written wrong once by
 * confusing them (the ratchet typed as 279 when `limits` stood at 292), and today they disagree in
 * opposite directions on the same corpus — P is above Q on `limits` and below it on both excluded
 * fields. §17 of `docs/wifi-feature-coverage.md` prints them in one table, one column each, with
 * the criterion named in both headers, for exactly that reason.
 *
 * **The walk, which is the whole content of 「newly emit」.** The field's text is appended to that
 * lesson's own graded main path — one string, `zhMainText(l)` then the field — and both arms run
 * over the result; P is that minus the baseline ({@link gradedWalkFailures}, zero today). Running
 * the rule over the **field's text alone** answers a different question — every unbracketed use
 * inside the field, including terms the lesson's prose introduces perfectly well two paragraphs
 * earlier — and that is why two earlier attempts to reproduce the historical figures came back
 * 646 / 598 / 326 and 289 / 187 / 81 and were read as proof that P could not be recomputed.
 *
 * **Reproducing the three historical records needs the code and corpus of the commit that measured
 * them**, which means checking that commit's `src` out on its own and importing from there; the
 * scripts are in `probes.local/` and the two commits and their readings are recorded in the
 * ratchet's docblock in `readability.test.ts` and in §3.4 of
 * `docs/superpowers/specs/2026-10-05-wording-reach-design.md`. One cell of those records needs a
 * WIDER ruler than {@link SIDE_TEXT}: the design document's `deeper` 81 = 80 + 1 comes out only if
 * `deeper` is appended as every string it holds (formula bodies and non-Chinese cells too), while
 * the prose walk the criterion names gives 78 = 77 + 1 there.
 *
 * **The subtraction is the one part of this that is provably inert today, and it is pinned rather
 * than removed.** `base(l)` is zero on every lesson of the real course, so deleting the two
 * `- before.*` terms would change no figure anybody reads — which is precisely the shape
 * `docs/inert-config-contract.md` says to refuse or pin. It is refused: 「newly emit」 is the
 * definition, not an implementation detail, and a corpus with a non-zero baseline is one bad
 * lesson away. So it is pinned, and what is pinned is **the instrument, not the course** — the
 * `ls` parameter exists for that test. `coverageNumbers.test.ts` feeds a synthetic lesson whose
 * main path ALREADY fails the bracket rule and asserts that the same `limits` text scores 1 on a
 * clean main path and 0 on that one, so the subtraction is the only thing that can explain the
 * difference. The assertion that is NOT written is 「the baseline is zero」: it can only redden
 * when `readability.test.ts` is already red, which makes it decoration.
 */
export const criterionP = (ls: readonly Lesson[] = migratedLessons()): Record<Side, Arms> => {
  const base = (l: Lesson): Arms => failuresOn(l, zhMainText(l))
  const side = (get: (l: Lesson) => string): Arms =>
    ls.reduce<Arms>((a, l) => {
      const before = base(l)
      const after = failuresOn(l, `${zhMainText(l)} ${get(l)}`)
      return {
        bracket: a.bracket + after.bracket - before.bracket,
        aka: a.aka + after.aka - before.aka,
      }
    }, { bracket: 0, aka: 0 })
  return {
    limits: side(SIDE_TEXT.limits),
    sources: side(SIDE_TEXT.sources),
    deeper: side(SIDE_TEXT.deeper),
  }
}

/**
 * **Which way round the comparison runs, and by how much — the DIRECTION, not the margin.**
 *
 * The last row of §17's three-sides table compares the `limits` debt with `sources` ＋ `deeper`
 * put together. That comparison used to be an assertion in `readability.test.ts`, and W17 took it
 * off the rulers because it reddened on a quantity nobody governs: the sum side grows whenever a
 * lesson is added, and a strict ordering against it is a gate on writing lessons.
 *
 * **But the figure that replaced it can go wrong in a way no figure-to-figure comparison catches.**
 * §17 stated the margin as a bare `1`. The margin going to zero and then negative is legal — that
 * is the whole point of moving it here — yet a cell reading `-3` is a true cell: a stated number
 * equal to the measured number, with nothing about it to make anybody look. A number that can turn
 * into its own opposite while staying 「correct」 is the defect this repository keeps finding.
 *
 * So the cell states **which side leads**, in words, and this function is the measured answer to
 * compare it with. Re-aiming it that way constrains nothing — both directions are legal, and so is
 * a tie — while making the flip impossible to pass unread: the day the sum side takes the lead, the
 * sentence written in §17 is false, `wifi-coverage.test.ts` says so, and the only way out is for a
 * person to write the new true one. That is the same bargain as every other stated figure in §17,
 * and it costs a lesson author nothing extra: that row's `286` is already compared, so the row is
 * already theirs to update.
 *
 * `by` is a magnitude and never negative; `leader` carries the sign. A sign convention is one more
 * thing a reader can get backwards, and this cell exists to stop exactly that.
 */
export const sumRelation = (
  sides: Record<Side, readonly string[]> = sideDebts(),
): Lead => leadOf(sides.limits.length, sides.sources.length + sides.deeper.length)

/** Which side of the sum comparison leads, and by how much; `by` is never negative. */
export type Lead = { leader: 'limits' | 'sum' | 'tie'; by: number }

/**
 * **The direction, for either criterion — one definition, because one vocabulary.**
 *
 * §17's three-sides table states this sentence twice, once per criterion, and the three legal
 * forms it may take are the same both times. Two columns stating a direction in two vocabularies
 * would be the P/Q confusion with a second way in; `wifi-coverage.test.ts` checks both cells
 * through one parser and compares both against this.
 */
export const leadOf = (limits: number, sum: number): Lead => {
  const diff = limits - sum
  return { leader: diff > 0 ? 'limits' : diff < 0 ? 'sum' : 'tie', by: Math.abs(diff) }
}
