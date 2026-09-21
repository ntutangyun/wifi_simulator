# B6 review — `tier1-project` split into `tier1-project` + `tier1-project-review`

Commit reviewed: `56fde56`. Read: batch brief, B6-report.md, B6-review.diff, pre-rewrite
`tier1-project.ts`/`tier1-project.test.ts` (58494a5), `uwb-capstone.ts` rubric shape,
current `tier1-project.ts` / `tier1-project-review.ts`, both tests, `curriculum.ts`,
`lessons.ts`, `lesson-hashes.json`. Ran `npx tsx scripts/lesson-dump.ts` for both ids
in en/zh, `npx vitest run tests/course/tier1-project.test.ts
tests/course/tier1-project-review.test.ts` (37/37 pass), `npx tsc -b --noEmit` (clean),
`npx vitest run tests/engine/lesson-hashes.test.ts` (pass), and
`READABILITY_INCLUDE=tier1-project,tier1-project-review npx vitest run
tests/course/readability.test.ts` (534/535 pass, the one failure is `edca`, another
implementer's in-flight file, unrelated to this batch).

## Verdict: PASS, with 2 Important findings to fix before this batch is considered final polish (not release-blocking — tests are green and no pin was lost).

## Important (2)

1. **`tier1-project` → numbers → "The three variants, predicted" table** — the column
   header is **"The link that moved"**, but for the second row ("A tablet joins, beside
   the router") and third row ("The living-room laptop leaves") no link moved at all —
   a station joined or left instead. Both rows show `MCS 13` under that column, which is
   really just the (unchanged) study-laptop rung, restated with a header that promises a
   moved link. A beginner scanning the table for "what changed" in the tablet/leaves rows
   will look for a link that moved and find none — the header contradicts the row's
   content for 2 of 3 variants.

2. **`tier1-project` → quiz Q1** — "The living-room laptop **arrives at** 18.84 dB and
   MCS 3 needs 16.99 dB." Two paragraphs earlier, the `(a)` table gives this station
   two *different* quantities under two *different* headers: `Arrives at` = −75.15 dBm,
   `SNR` = 18.84 dB. The quiz borrows the verb from the "Arrives at" column but attaches
   the SNR column's value and unit — a learner checking the quiz's claim against the
   printed table will not find "arrives at 18.84 dB" anywhere; that number is filed
   under SNR, not "arrives at." The lesson's own `deeper` note two blocks later gets
   this right ("The living-room laptop's 18.84 dB of **SNR**"), so the inconsistency is
   internal to this lesson, not just sloppy phrasing carried from the old version — the
   old lesson never used "arrives at" for this number either. Fix: "The living-room
   laptop's SNR is 18.84 dB" (EN and ZH).

## Minor (0)

None beyond the two Important items above — no undefined words, no EN/ZH numeric
disagreement, no false statement about the simulation, no rubric line unsupported by
the run, and every quiz is otherwise answerable from the main path.

## Pass 1 (beginner read) — otherwise clean

- Split boundary is right: `tier1-project` stops exactly at "write the four
  predictions down" (before the run); `tier1-project-review` opens with "Now open the
  run." A learner would naturally stop to do the paper work between the two.
- `DCF` is in `tier1-project`'s `terms` and glossed in both languages; it is the first
  lesson to gloss it, matching the owner-table note in the report.
- The `watch` block sits at picture-block 3 of `tier1-project` and block 2 of
  `tier1-project-review` — both within the first three blocks, per contract.
- EN/ZH read as two originals making the same claims with the same numbers throughout
  both lessons; no drift found in either dump.
- Budgets match the report exactly: `tier1-project` 609/650 · 341/350 · 312/400 ·
  1262 total; `tier1-project-review` 565/650 · 349/350 · 347/400 · 1261 total.

## Pass 2 (pins)

- Every pin listed in the old test (`tests/course/tier1-project.test.ts` @ 58494a5)
  survives in one half, against the same named record — confirmed pin-by-pin against
  the diff (link budgets, symbol/airtime arithmetic, the Bianchi fixed point, the
  share, all three variants, the two estimators, the deaf-late-start mechanism, the
  three waits, EIFS count, rate-adaptation shortfall, the 160 MHz `deeper` note).
- The corrected first-draw claim is pinned: `tests/course/tier1-project.test.ts` checks
  `draw.cw === 31` and that both openers start at `t = 0`, matching the new observation
  that the first backoff draw comes from an already-doubled window.
- `tests/fixtures/lesson-hashes.json` diff is exactly four added lines
  (`tier1-project-review`, `#0`, `#1`, `#2`), each value byte-identical to
  `tier1-project`'s corresponding line.
- `COURSE_ORDER` (`src/course/curriculum.ts`) and `src/course/lessons.ts` both place
  `tier1-project-review` immediately after `tier1-project`, one import/one entry, same
  module (module 1).
- `DCF` appears in `tier1-project.terms` with an EN+ZH plain-words gloss.
- `.body!` is retired from both tests (only present in explanatory comments, not code);
  `lessonShapeSuite` + `lessonStrings`/`runOf` do the walk instead.
