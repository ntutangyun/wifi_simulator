# C4 review — `rate`, `rate-fallback` (commit 21b9c64)

## Verdict: PASS

Counts: 0 Important, 2 Minor.

## Method

- Pass 1 (beginner read): `npx tsx scripts/lesson-dump.ts rate en|zh` and `rate-fallback en|zh`,
  read cold against Tier 1 vocabulary plus the current text of every Tier 2 lesson up to and
  including `streams`.
- Pass 2 (correction + pins): read `src/course/tier2/rate.ts`, `rate-fallback.ts`,
  `tests/course/rate.test.ts`, `rate-fallback.test.ts`, the pre-rewrite lesson at `1582f6b`, the
  still-live pins in `tests/course/quoted-timestamps.test.ts`, the batch brief and C4-report.
- Ran `npx vitest run tests/course/rate.test.ts tests/course/rate-fallback.test.ts
  tests/course/quoted-timestamps.test.ts` (45/45 green), `READABILITY_INCLUDE=rate,rate-fallback
  npx vitest run tests/course/readability.test.ts` (604/605 green — the one failure is
  `txop-protect` migration bookkeeping, another implementer's in-flight file, not this batch's),
  and `npx tsc -b --noEmit` (pre-existing unused-variable errors in `readability.test.ts`, a file
  this commit doesn't touch — not this batch's).
- Diff scope check: `src/course/tier2/rate.ts`, new `rate-fallback.ts`,
  `tests/course/{rate,rate-fallback}.test.ts`, plus the three files the brief allows a split to
  touch — `lessons.ts` (+1 import, +1 array entry, both directly after `rate`), `curriculum.ts`
  (`'rate-fallback'` inserted right after `'rate'` in `COURSE_ORDER`), and
  `tests/fixtures/lesson-hashes.json` (+1 line, `"rate-fallback": "3e219398"`, identical to
  `rate`'s hash). `quoted-timestamps.test.ts` and `tests/course/lessons.test.ts` are untouched, as
  claimed.

## Pass 1 findings

No stop points in either lesson. Both read cleanly against the assumed vocabulary
(`decode-thresholds`: MCS; `retries-queues`: ACK/ACK timeout/CW; `bianchi-vs-sim`: capture, reached
transitively through `rate`'s own `needs`). No undefined word, no EN/ZH divergence (every number in
both languages' tables and prose matches), no digit sits in a `picture` paragraph without a backing
table — both lessons keep prose numeric-free and put every quantity in `numbers` — and no quiz
requires `deeper` to answer (`rate`'s two quiz items draw on "Two ways to be wrong" /"The only news
a sender gets" / "The lid the signal puts on"; `rate-fallback`'s draw on the four-step rule and the
per-rung table). The split boundary is exactly where a reader would want to stop: `rate` ends on
"How quickly it falls, how slowly it climbs, and what a long stretch of slow frames costs everyone
else, is the next lesson" — an explicit, honest handoff, not a mid-thought cut. `rate-fallback`
picks up the fall/climb rule cold and does not re-explain the ceiling.

## Pass 2 findings — the correction

Reproduced independently rather than trusting the report's arithmetic:

- `tests/course/quoted-timestamps.test.ts`'s `lost()` still counts only frames followed by an
  `ACK_TIMEOUT` within 50 µs, and still asserts `m2/m1/m0 = {209, 39, 6}` → `8.7/7.5/6.7%`, summing
  to 254 — this is the **old, timeout-only subset**, confirmed still green.
- `tests/course/rate-fallback.test.ts`'s `lostAt[]` instead counts a `RETRY` (or `DROP`) between
  the end of an attempt and the start of the next, which is what the engine's `onFailure` actually
  fires on. `timeouts` is 254, `retryTs.length + dropTs.length` is 337, and `dropTs` is empty — so
  the extra 83 are exactly retries with no timeout record, as the report says. Counted this way,
  `perRung(2/1/0)` gives `{2396,266,11.1%} / {517,61,11.8%} / {90,10,11.1%}` — flat, not falling
  with frame length, and the death-spiral direction is still absent from the data (`perRung(0).pct
  <= perRung(1).pct`, both ≈ the ceiling's rate).
- Ran both test files together (both read `rate`'s scene through the same memoised `runOf`, so
  there's no run-to-run drift risk): all 34 assertions pass, confirmed above with 45/45 across all
  three files including `quoted-timestamps.test.ts`.
- The correction does not weaken the lesson's argument: `rate-fallback`'s `deeper` states the
  254/83/337 split honestly and the quiz still holds (MCS 1's 11.8% is still worst, if barely).

**The correction checks out.** The old lesson's claim was real but scoped to a subset of failures
without saying so; the new one counts everything `onFailure` fires on and reports flat, not falling,
per-attempt loss.

## Pins

Confirms the report: no `.body!` site existed for `rate` (it had no test file; its pins lived
entirely in `quoted-timestamps.test.ts` and one `lessons.test.ts` shape check, both untouched and
green). Every surviving old claim — the three airtimes/rate-line values, the ceiling, the 25
excursions and six bottom-rung runs, the airtime tax, the backoff-hold numbers, the near station,
both closer-to-router experiments, the third-uploader experiment — is now also pinned in one of the
two new test files against the sentence that states it, split correctly along the old/new lesson
boundary (rungs and airtime stay with `rate`; the loop, the excursions and their cost move to
`rate-fallback`). The multi-user reporting paragraph moved to `rate`'s `deeper`, still pinned
unchanged in `quoted-timestamps.test.ts` against the `mumimo` scene.

## Minor

- `quoted-timestamps.test.ts`'s two "lesson 18" comment blocks (around lines 315–318 and 373–384)
  still narrate prose that no longer exists in `rate.ts` — "here MCS 2, decided purely by distance
  and the wall", "the longest frames are, if anything, the least often lost", the 8.7/7.5/6.7%
  framing — since that text moved and was corrected. The pinned assertions are still true and still
  useful (they pin the *old, timeout-only* reading, which is a legitimate secondary fact about the
  run), but the comments now describe a lesson that doesn't say those sentences any more. The
  implementer flagged this themselves and left it for whoever owns that file — agreed that's the
  right call rather than editing a file outside this batch's dispatch.
- `rate.needs` includes `'width'`, but none of `width`'s owned terms (`channel width`,
  `sub-carrier`, `symbol`, `noise floor`) appear anywhere in `rate.ts`'s or `rate-fallback.ts`'s
  reader-facing sections — `width`/`symbol` show up only inside one `sources` sentence ("the
  modulation and coding rate of that rung at this width and one stream"). The automated
  needs-closure test apparently scans `sources` text too (not just the acronym-rule-checked
  sections), which is why `width` is required and the suite is green — but a curriculum reader
  skimming `needs` would see `width` and reasonably expect the lesson to lean on channel-width
  vocabulary, and it doesn't. Cosmetic; no reader-facing effect since `sources` is citation prose
  nobody's quizzed on.
