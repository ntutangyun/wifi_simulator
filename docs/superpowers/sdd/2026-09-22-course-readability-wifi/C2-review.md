# Review — batch C2 (`txop-protect`, commit 1582f6b)

Verdict: **Pass.**

## Method

- Pass 1 (beginner read): `npx tsx scripts/lesson-dump.ts txop-protect en` and `zh`, read cold
  against the current text of `nav`, `hidden`, `txop`, `edca` (all read previously).
- Pass 2 (pins): diffed against `git show 3a0624b:src/course/tier2/txop-protect.ts`, read
  `tests/course/txop-protect.test.ts` and the "lesson 10" block of `tests/course/lesson-claims.test.ts`,
  ran both plus the readability suite.
- Ran: `npx vitest run tests/course/txop-protect.test.ts` (13/13 pass), `npx vitest run
  tests/course/lesson-claims.test.ts -t "lesson 10"` (5/5 pass, 35 skipped as expected),
  `READABILITY_INCLUDE=txop-protect npx vitest run tests/course/readability.test.ts` (605 tests,
  1 failure — `rate` MIGRATING bookkeeping, unrelated to this file, matches the report's stated
  concurrent-work exclusion).

## Findings

**Important: 0**

**Minor: 2**

1. *(picture / title)* The title ("...for the whole turn") and several `observe`/`tryThis`/`deeper`
   items use "turn" interchangeably with "burst" (the word used throughout the six main `picture`
   blocks), but the lesson never states the equivalence explicitly. It rests on `edca`'s prior use
   of "turn" for a round of contention ("a better place in the argument over the next turn") and
   `txop`'s quiz option ("more turns than the stations"), which makes it a defensible callback
   rather than an undefined word, but a first-time reader who skips straight from `txop` to here
   could momentarily wonder whether "turn" names something new. Not a contract violation (no bare
   acronym, no undefined term), just a soft spot.
2. *(sources)* Good catch already made by the implementer: the CF-End relay is correctly flagged
   as "a model choice" rather than a general standard rule (the standard spells it out only for an
   S1G AP) — noting this because it was one of the two specific things this review was asked to
   verify, and it holds up against the corpus text quoted in the report.

## Pin verification (pass 2 detail)

- Every claim the pre-rewrite lesson made and the rewrite still makes is still pinned: the 300 ms
  table (46/21, 212/614, 112/47, 6/1) and every observe timing (0.736 ms / 2500 µs / 0.780 ms /
  2456 µs / 3.264 ms / ≈2.90 ms / 376 µs / 2.976 ms / 28 µs) remain in `lesson-claims.test.ts`
  ("lesson 10 · protecting the burst") untouched and green; the RTS-threshold corner (21→80,
  614→344, 1.9 ms) also remains there and is now correctly presented as `deeper` content instead
  of a third main-path experiment.
- The three-policy table's new "multiple" column is pinned per variant in the new test file:
  counts equal boundary's (`row(multiple()) === row(boundary())`), airtime rows equal boundary's
  (`announcingNs`, `allAirNs`, `meanNavNs`), and the claim that this is *because* every station
  that could collide already heard the CTS is consistent with the scene (both hidden stations
  hear only the AP, and boundary's CTS already reaches the TXOP end for them) — the "identical to
  boundary" claim is both stated and true, and the reason given is accurate.
  the 2.164 ms / 60 µs Duration-field claim is pinned exactly (`toBe(2_164 * US)` / `toBe(60 * US)`).
- Fixture `tests/fixtures/lesson-hashes.json` untouched (only `txop-protect.ts` and its new test
  file were touched, confirmed via `git show --stat 1582f6b`); scenario builder and both variants
  are byte-identical to the pre-rewrite lesson.
- No `.body!` site existed to retire (this lesson had no prior test file) — correctly reported as
  such.

## Beginner-read notes (pass 1 detail)

- `TXOP` the bare token never appears in any checked field (why/outcomes/terms/picture/
  numbers/observe/tryThis/quiz) — confirmed by grep; its only appearance is inside a `sources`
  citation string, which is exempt. The lesson reads as fully self-contained in plain words
  ("the burst", "the question", "the answer", "the reservation").
- Numbers in prose stay small and always land in a table or a clearly headed paragraph; no
  heading-less paragraph pair in `numbers`. The `watch` block is the third `picture` block,
  inside the required first three.
- EN/ZH agree on every quantity and fraction word checked ("a twentieth"/二十分之一, "nearly three
  times"/接近三倍, "a third"/三分之一, all table cells).
- Both quizzes are answerable from the main path: quiz 1 restates the picture's "only the access
  point is audible to B" directly; quiz 2 restates the "Giving the time back" paragraph on CF-End.
- No claim in the picture or numbers contradicts the simulation: verified the "multiple ≡
  boundary" table columns and the Duration-field maxima against a live run via the test file.
