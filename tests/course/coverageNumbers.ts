/**
 * **The one figure §17 of `docs/wifi-feature-coverage.md` states that is not measured by the
 * course itself: the per-lesson main-path floor.**
 *
 * A number stated in two places with nothing comparing them is this repository's standing defect,
 * so the floor lives here once and both sides read it — the prose check in
 * `tests/course/wifi-coverage.test.ts` and the contract assertion in
 * `tests/course/readability.test.ts`.
 *
 * **Retired 2026-11-11: the `limits` debt and the criterion Q / P instruments.** Until then this
 * module also held `LIMITS_DEBT_CEILING` (169) and `limitsRatchet()` — the ratchet on official
 * terms a lesson's `limits[].text` named while its own main path never did — together with
 * `sideDebts()` / `criterionP()` / `leadOf()`, which measured the same debt over `limits`,
 * `sources` and `deeper` for §17's three-sides table, and `tests/course/coverageNumbers.test.ts`,
 * which pinned that instrument's arithmetic on synthetic lessons. The standard-first restructure
 * (2026-11-10 for UWB, 2026-11-11 for Wi-Fi/AMP) removed `limits` and `deeper` from every lesson,
 * so the ratchet measured 0 against a ceiling of 169 and the three-sides table compared two
 * fields that no longer exist with one that does. Lowering the ceiling to 0 would have left a
 * green check over an empty field. What `limits` used to hold is in `implementation` now, which
 * IS on the graded main path — so the bracket rule itself covers it, and
 * `tests/course/readability.test.ts` pins that every `implementation` row is in the graded walk.
 * `git log -p` on this file has the retired instruments and their history.
 */

/**
 * The per-lesson main-path floor the lesson contract enforces, about a third of the mean lesson.
 * `readability.test.ts` asserts it lesson by lesson with a **strict** comparison (`> floor`).
 * The upper end of the band went with the hard length limit on 2026-11-10.
 */
export const MAIN_PATH_BAND = { floor: 700 } as const
