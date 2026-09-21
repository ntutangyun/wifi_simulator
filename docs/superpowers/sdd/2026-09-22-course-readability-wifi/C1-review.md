# C1 review — edca, ampdu, txop on the readability contract

Verdict: **Pass, no Important findings.**

## Method

- Pass 1 (beginner read): `npx tsx scripts/lesson-dump.ts {edca,ampdu,txop} {en,zh}`, read in
  dispatch order, as a reader who has seen every current Tier 1 lesson and nothing else.
- Pass 2 (pins): diffed each lesson against `git show 7c312be:src/course/tier2/<id>.ts`, read the
  three new test files against the old prose to check every surviving claim is pinned; ran
  `npx vitest run tests/course/edca.test.ts tests/course/ampdu.test.ts tests/course/txop.test.ts`
  (45/45 green), `tests/course/lesson-claims.test.ts` + `tests/course/quoted-timestamps.test.ts`
  (51/51 green, unmodified), `READABILITY_INCLUDE=edca,ampdu,txop npx vitest run
  tests/course/readability.test.ts` (577/577 green), `npx tsc -b --noEmit` (clean), and
  `git diff 7c312be 4e405ad -- tests/fixtures/lesson-hashes.json` (empty — fixture untouched).
  Confirmed against `src/course/curriculum.ts` that every `needs` id precedes its lesson in
  `COURSE_ORDER`, and that none of the three touch a baseline-owner-table word (radio-primer /
  decode-thresholds / roles-stack / frame-anatomy / frame-anatomy-bytes / airtime / ifs / backoff /
  nav / hidden own SIFS, DIFS, EIFS, CW, NAV, ACK, RTS, CTS etc.; none of those are re-taken here).

## Counts

- Important: 0
- Minor: 2

## Minor findings

1. **ampdu, numbers table, EN and ZH** — the "One turn, both ways" table's last row prints "228 µs"
   for the one-at-a-time air-per-delivered-frame figure, while the worked-formula block two lines
   below it prints "228.0 µs" for the same number. Cosmetic inconsistency in significant-figure
   formatting, not a numeric error (both trace to the same pinned value); a reader comparing the
   table row to the arithmetic row may pause on the mismatch.
2. **edca, deeper** — "every station here runs a single class" is the only sentence that tells the
   reader why the picture's "somebody has to be last" claim never surfaces as an internal collision
   in this scene. It lands correctly (and is pinned — `INTERNAL_COLLISION` asserted empty in the
   test), but it sits in `deeper`, one section past the picture that a learner following only the
   main path reads; a beginner who stops at `numbers` never sees the disclaimer that this
   mechanism exists but is invisible in the run. Not false, not required reading, but worth a
   one-clause pointer from the picture ("more on this in deeper") if a future pass touches this file.

## Pass 1 notes (no stop points found)

All three lessons read cleanly end to end in both languages: no undefined word, no claim the
`picture` contradicts, no bare number in prose without a table, no EN/ZH divergence in a claim or
a number, no quiz question unanswerable from `picture`+`numbers`, and no false statement about the
simulation — edca is explicit that this scene has zero internal collisions, and ampdu is explicit
that "losing a whole aggregate when any part of it collides" is a simulator choice, not the
standard's behaviour. ampdu's and txop's growth from ~200 words each added only load-bearing
content (fixed-cost economics, per-subframe error isolation, the block-ack agreement precondition
for ampdu; the reverse-direction/lending mechanism and why bursts need protection for txop) — no
padding sentence found.

## Pass 2 notes

Every claim the pre-rewrite lessons made that survives is pinned in the new per-lesson test files
against the named record (EDCA_PARAMS/aifsNs, TX_START/ENQUEUE/DEQUEUE timings, TXOP_START/END,
BACKOFF_DRAW, IFS_START — see the three test files for exact assertions). The two claims that did
*not* survive edca's rewrite (the "first internal collision" jump, and the internal-collision
example scenario) are honestly explained in the C1-report and confirmed by the test suite: the
scene genuinely produces zero `INTERNAL_COLLISION` records, so the old jump could never have
resolved. The 14-frame (ampdu) and 64-frame (`MAX_AMPDU_MPDUS`) ceilings are both pinned and
correctly distinguished (14 = this scene's TXOP-bound batch size; 64 = the structural ceiling,
asserted `toBeLessThan`). The replaced jumps ("first background frame", "first EIFS on the
uploader" for edca; "first backoff draw by the AP" for txop) all resolve against the base run in
their respective test files. `tests/fixtures/lesson-hashes.json` is byte-identical to HEAD before
this commit. No baseline owner-table word is re-owned by any of the three lessons.
