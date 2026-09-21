# B4 review — `hidden`, `anomaly` on the readability contract

Reviewed commit `835f94c`. Sources: batch brief, `B4-report.md`, `B4-review.diff`,
pre-rewrite `hidden.ts`/`anomaly.ts` at `b1b9daa`, `tests/course/hidden.test.ts`,
`tests/course/anomaly.test.ts`, `tests/course/lesson-claims.test.ts`,
`tests/course/quoted-timestamps.test.ts`.

## Verdict

**Pass.** No Important findings. Two Minor notes below. Both lessons read cleanly
as a beginner who knows only radio-primer, decode-thresholds, roles-stack,
frame-anatomy, airtime, ifs, backoff, nav; the terms/needs closure is correct
(hidden → backoff, nav → ifs → airtime → radio-primer/decode-thresholds/
frame-anatomy → roles-stack; anomaly → airtime, backoff, same closure minus
nav/hidden — confirmed the picture uses no NAV/Duration/RTS/CTS/hidden-node
words, matching the report's claim). Owner words RTS and CTS are present in
`hidden`'s terms. All pins traced below are present and green; the fixture and
scenario builders are untouched (confirmed via `git diff --stat` scope: only the
four files named in the report). `npx vitest run tests/course/hidden.test.ts
tests/course/anomaly.test.ts` — 34/34 pass. `READABILITY_INCLUDE=hidden,anomaly
npx vitest run tests/course/readability.test.ts` — all hidden/anomaly cases pass;
the one failure in that file (`roles-stack` migration bookkeeping) belongs to the
concurrent B5 batch, not B4.

## Counts

- Important: 0
- Minor: 2

## Minor findings

1. **`hidden`, second `watch` block (picture, "Watch a reservation land in the
   far room").** The instruction "Switch to the protected variant and press
   play" is followed correctly by the UI: `CoursePanel.tsx` renders exactly one
   variant button (labelled "Variant: RTS/CTS ON (threshold 500 B)" / its ZH
   equivalent) below the Load button, so with only one variant to switch to
   the instruction is unambiguous in practice. But the picture calls it "the
   protected variant" while the button text never uses the word "protected" —
   a first-time reader has to infer that the one available variant is the one
   meant. Same pattern (a bare "switch variants" with no literal button-text
   match) already exists in `radio-primer.ts`'s watch block, so this is
   consistent with house style rather than a new problem; flagging only
   because the task asked this exact spot to be checked closely. No jump loss
   here is a defect — `lessonShapeSuite` correctly forbids a `jumps` entry that
   doesn't fire in the base run, and the report's explanation for dropping
   "first RTS" is correct (base run's RTS threshold of 3000 B is above every
   frame, so it never sends one).

2. **`tests/course/lesson-claims.test.ts` line 265, stale comment text.** The
   comment quotes the *old* lesson's phrasing — "In this scene data collisions
   drop by about 95%" — while the rewritten `hidden` picture now says "about
   94%". The assertion itself (`cut` between 0.92 and 0.98) tolerates both
   numbers so the test is not broken, and the batch brief marks this file
   controller-owned/untouched, so B4 correctly left it alone. Worth a follow-up
   comment refresh whenever that file is next touched, so future readers aren't
   confused by the mismatched quoted number.

## Pass 1 (beginner read) detail

No stop points found. Specifically checked and clear:
- No undefined words: every capitalised term used (RTS, CTS, NAV, Duration, ACK,
  CW) is either owned by this lesson or reachable through `needs`' transitive
  closure; `anomaly` avoids MCS/NAV/Duration entirely and uses "symbol" only
  because `airtime` (in its closure) already defines it.
- EN/ZH dumps (`lesson-dump.ts hidden|anomaly en|zh`) match paragraph-for-
  paragraph and claim-for-claim; no divergent numbers between languages.
- Quiz questions in both lessons are answerable from the main `picture`/
  `numbers` path without needing `deeper`.
- No heading-less adjacent paragraphs, no unpinned numbers in prose beyond the
  ≤ 4 quantities/paragraph budget (verified by the passing readability run).
- No false statements about the simulation: spot-checked the "no NAV ever set
  in the base run" claim, the CTS-Duration-equals-NAV claim, and anomaly's
  "154 turns vs 135 acked" distinction (turns attempted vs. frames actually
  delivered — a real distinction, not an inconsistency) against
  `hidden.test.ts` / `anomaly.test.ts`.

## Pass 2 (pins) detail

Every claim the old lesson made that survives is still pinned against a named
record (spot-checked the asymmetry walk-through, the ~94%/95% cut, the RTS/CTS
byte sizes, the 209/510/234 frame counts, the capture-effect decibel table, and
the 704 µs/749 µs/15-timeout claims) — all present in the new test files or, for
material untouched by the rewrite, still green in `lesson-claims.test.ts` and
`quoted-timestamps.test.ts` exactly as the report states. `anomaly`'s
capture-effect section, correctly moved to `deeper`, is re-pinned there rather
than dropped. `tests/fixtures/lesson-hashes.json` is untouched. Owner words RTS
and CTS both appear verbatim in `hidden.terms`.
