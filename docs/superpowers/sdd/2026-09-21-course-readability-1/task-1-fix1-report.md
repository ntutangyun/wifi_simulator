# Task 1 re-review — fix round 1 (commit 6bc18be)

Fix base (previous review's head): `926e10e`. Head reviewed: `6bc18be`
(`docs(spec)` commit `fc5195d` on top is the controller's spec-text ruling for
minor 2 only, not part of the fix diff; checked for consistency, not re-reviewed).
Diff file: `.superpowers/sdd/2026-09-21-course-readability-1/task-1-fix1-review.md`
(confirmed matches `git show 6bc18be --stat` exactly: 5 files, +76/−9).

Concurrent Task 2 is writing `src/course/uwb/*`, `tests/course/uwb-*`,
`tests/course/readability.test.ts`; uncommitted changes to those paths were
ignored per instructions.

## Finding Verdicts

**Important 1 — `list`/`steps` items and headings escaped the citation rule
in `numbers`, and the acronym/paragraph rules in `picture`.** — **ADDRESSED.**
`src/course/readability.ts:112` now pushes `b.heading` unconditionally before
the per-kind switch; `:118-121` adds a `case 'list': case 'steps':` branch
that spreads `.items`. Diff evidence (`task-1-fix1-review.md` lines 168-196):
the new `paragraphTexts` returns, in reading order, every block heading, then
`p`/`watch` text, or `list`/`steps` items, or the `formula` note, or the
`widget` caption — table cells and formula bodies remain excluded via the
unchanged `default: break`. Two new unit tests in
`tests/course/readability-rules.test.ts` pin this: the first asserts the
exact ordered sequence across all six block kinds (headings and list/steps
items included; `§9.3.7` from the table cell and `T = L / R` from the formula
body proved absent); the second proves `CITATION` now fires on a citation
hidden in a `list` item and in a block `heading`. The fix report's RED proof
(removing the `if (b.heading)` line and the `list`/`steps` case, both new
tests fail: `2 failed | 5 passed (7)`) is consistent with the diff — without
those two branches, `paragraphTexts` cannot emit the heading strings or the
list-item strings the two tests assert on. Since `readability.test.ts`
already routes the acronym rule, the picture paragraph caps, and both
`numbers` citation loops through `paragraphTexts` (untouched this round, per
the earlier review), the fix closes the hole on every one of those paths at
once, exactly as claimed. `readability-rules.test.ts` passes: 7/7 (verified
by direct run, see Tests below).

**Minor 2 — `acronyms` has no upper bound, though the spec said "2–6".** —
**DECLINED-BY-RULING.** Controller ruling: the spec's "2–6" was wrong;
acronym tokens have no upper length bound (RMARKER, 7 chars, must be caught).
Codified in `fc5195d` (spec text changed from "2–6 upper-case letters/digits"
to "two or more upper-case letters/digits (any length: `RMARKER` counts)").
`src/course/readability.ts:64` (current) has no length ceiling; the fix
report explains the decline reasoning verbatim, matching the ruling.

**Minor 3 — two unreachable guards in `acronyms`.** — **ADDRESSED.**
`readability.ts:130-135` keeps `token.includes('_')` and
`/^[\d-]+$/.test(token)`, now with a comment explaining they are deliberate
belt-and-braces against a future widening of `ACRONYM`. Matches the fix
report and one of the reviewer's two offered options (comment, not removal).

**Minor 4 — `KNOWN_WORDS` carries two never-consulted entries (`I`, `A`).**
— **ADDRESSED.** `readability.ts:96-100` adds a comment explaining `I`/`A`
are kept so the set reads as the whole assumed-known-word list rather than
that list minus two one-letter entries. Set contents unchanged.

**Minor 5 — `lessonWords` does not count a `Term`'s `term` string.** —
**ADDRESSED.** `curriculum.ts:66-70` (diff) adds
`if (typeof o.term === 'string' && o.plain !== undefined) strings.push(o.term)`
inside the generic walk, with a comment on why a `Term`'s bare word needs its
own line. Fix report notes this is a no-op today (`grep -rn '^\s*terms:'
src/course/` returns nothing — no lesson yet has a `terms` field), consistent
with the full-suite run showing no per-lesson word count moved.

**Minor 6 — ZH side unmeasured for acronyms and per-paragraph quantities.**
— **DEFERRED**, ledger reason confirmed. `progress.md:26`: "Deferred to the
fix wave (readability.test.ts owned by T2): #6 ZH-side acronym/quantity
checks...". Fix report's own "Deferred to the fix wave" section repeats the
same reasoning (fix requires iterating `[s.en, s.zh]` at
`readability.test.ts:99,105`, a file this round could not touch). Correctly
listed as deferred, not silently dropped.

**Minor 7 — `deeper` blocks and `sources` strings have no well-formedness
test.** — **split, per the fix round's own split:**
- 7a (`deeper` blocks uncovered by `lessons.test.ts`'s block-shape walk) —
  **ADDRESSED.** `tests/course/lessons.test.ts:215-219` (diff) changes the
  walk to `const all = [...lessonBlocks(l), ...(l.deeper ?? [])]` with a
  comment explaining `deeper` is off `lessonBlocks` by design but is still
  panel-rendered. Minimal, one-line change; no assertion logic altered
  (see Constraint 3 check below).
- 7b (no bilingual well-formedness check over `sources`/`outcomes`/
  `terms[].plain`) — **DEFERRED**, ledger reason confirmed:
  `progress.md:26` lists "#7b bilingual walk over sources/outcomes/
  terms.plain" as deferred to the fix wave (needs `readability.test.ts`,
  owned by T2). Matches the fix report's own listing.

**Minor 8 — outcomes heading renders over an empty list.** — **ADDRESSED.**
`CoursePanel.tsx` diff wraps the `L.outcomes` heading and `<ul>` together in
`{(lesson.outcomes ?? []).length > 0 && (<>...</>)}`, matching the gating
pattern already used for needs/terms/numbers/deeper (sections 4, 5, 7, 8).

**Minor 9 — `firstOfTrack` means "first migrated lesson of the track", not
"first lesson".** — **DEFERRED**, ledger reason confirmed:
`progress.md:26` lists "#9 firstOfTrack comment" as deferred to the fix wave.
Fix report repeats the same. The finding only asked for a comment at
`readability.test.ts:47`, a file this round could not touch — correctly
deferred rather than dropped.

**Minor 10 — the report over-counted its own collateral (17 files/48
sites vs. actual 14 files/36 sites).** — **ADDRESSED.** This was a
reporting-accuracy finding, not a code defect; the fix report explicitly
corrects the number ("36 sites across 14 per-lesson test files, not '17
files, 48 sites'") with the arithmetic explanation for the original error.
No code change was required or made for this one, correctly.

**Also verified: the `course.why` i18n key open question** — listed as
"outstanding for the controller, not assigned to me" in the fix report, and
`progress.md:26` lists it among the items deferred to the fix wave. Not
silently dropped.

## Constraint Checks Requested by the Controller

**(1) `paragraphTexts` reading-order and exclusion contract.** Confirmed by
direct code read (`src/course/readability.ts:109-136`, current tree): for
each block in array order, the block's `heading` (if present) is pushed
first, then exactly one of: `p`/`watch` text, `list`/`steps` items
(spread, preserving their array order), `formula` note (if present), or
`widget` caption (if present); `table` and any block without a matching
case fall to `default: break` and contribute nothing. Table cells and
formula bodies (the `text` field of a `formula` block) are never pushed.
The new `readability-rules.test.ts` test asserts the exact resulting
array across a seven-block fixture spanning all six kinds, which pins both
the inclusion and the ordering. The RED proof in the fix report (both new
tests fail with the two added branches removed) is a genuine causal check,
not just correlation — I confirmed the same by reading which strings the
test's `.toEqual` requires that only those two branches emit (the heading
strings `'What the tag does'`, `'Three things happen'`,
`'Where the values come from'`, `'Airtime'` require the heading branch;
`'the reader asks'`, `'the tag answers'`, `'arm the slot'`,
`'send the answer'` require the list/steps branch).

**(2) `readability.test.ts` untouched by 6bc18be.** Confirmed:
`git diff 0eaac5e..6bc18be -- tests/course/readability.test.ts` produces no
output. The file is only modified in the working tree by the concurrent
Task 2 implementer (per `git status`), not by this commit.

**(3) `lessons.test.ts` block-shape walk now includes `deeper` blocks,
minimally.** Confirmed: the only change is
`lessonBlocks(l).forEach(...)` → `const all = [...lessonBlocks(l), ...(l.deeper ?? [])]; all.forEach(...)`
plus a two-line explanatory comment (`tests/course/lessons.test.ts`, per
`task-1-fix1-review.md` lines 213-229). No assertion body, no other test,
and no other describe block touched.

**(4) New defects.** None found. `paragraphTexts`'s widened output cannot
regress `readability.test.ts` (untouched) or any currently-passing test:
the file is only consumed by the acronym rule, the picture caps, and the
`numbers` citation loops, all in the file that was not touched this round,
and those routes only get *more* text to check, which can only turn a
previously-passing lesson red if it actually contains a violation — correct
behavior, not a regression. `readability.ts`'s and `lessons.test.ts`'s
type casts (`Extract<Block, {kind:'list'}>`) are sound: `lessonKit.ts:45-47`
gives both `list` and `steps` an `items: L10n[]` field, matching the cast.

## Tests Run

```
npx vitest run tests/course/readability-rules.test.ts tests/course/readability.test.ts tests/course/lessons.test.ts
```

Result: `readability-rules.test.ts` — 7/7 passed. `lessons.test.ts` —
42/42 passed. `readability.test.ts` — 16/17 passed; the one failure is
`readability · uwb-intro > fits the main path: 500–1300 words, at most 20
minutes` (`expected 1684 to be less than or equal to 1300`), caused by the
concurrent Task 2 implementer's uncommitted, in-progress edits to
`src/course/uwb/uwb-intro.ts` (still old-shape word count, per that lesson's
own uncommitted state) — not something the 6bc18be diff touches or could
cause. This is the same class of failure the task instructions carve out for
`tests/course/uwb-intro.test.ts`; here it surfaces through
`readability.test.ts`'s per-lesson `describe.each` over `uwb-intro`'s live
(uncommitted) data rather than through the uwb-intro test file itself, but
the root cause and ownership are identical (Task 2, in flight) and it is not
counted against this round.

Also ran `npx tsc -b --noEmit`: clean, no output, no errors anywhere
(including the previously-flagged `tests/course/uwb-frame.test.ts`, which
compiles cleanly in the current tree state).

## New Breakage in the Fix Diff

None.

## Out-of-Scope Observations

None beyond what the previous review already ledgered (minors 6, 7b, 9, and
`course.why`, all correctly tracked as deferred above).

## Verdict

**ALL ADDRESSED-OR-DEFERRED.** Important 1 addressed with diff and test
evidence. Minor 2 declined by controller ruling (spec amended in `fc5195d`).
Minors 3, 4, 5, 7a, 8, 10 addressed. Minors 6, 7b, 9 and the `course.why`
i18n key are deferred to the fix wave, per `progress.md:26`, and are listed
as deferred rather than dropped. No new breakage in the fix diff. One test
failure observed (`readability.test.ts`'s `uwb-intro` case) is caused by
concurrent Task 2 uncommitted work, not by this commit, and is not counted.
