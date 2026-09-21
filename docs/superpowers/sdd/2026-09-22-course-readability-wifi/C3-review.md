# C3 review — `width`, `streams` (commit 30950fe)

## Verdict: PASS

Counts: 0 Important, 2 Minor.

## Method

- Pass 1 (beginner read): `npx tsx scripts/lesson-dump.ts width en|zh` and `streams en|zh`, read
  cold against Tier 1 vocabulary only.
- Pass 2 (pins): read `src/course/tier2/width.ts`, `streams.ts`, `tests/course/width.test.ts`,
  `tests/course/streams.test.ts`, the pre-rewrite lessons at `7c312be`, the still-live pins in
  `tests/course/lesson-claims.test.ts` (lesson 15, lesson 16) and `quoted-timestamps.test.ts`, and
  the batch brief and C3-report.
- Ran `npx vitest run tests/course/width.test.ts tests/course/streams.test.ts` (36/36 green),
  `npx vitest run tests/course` (1665/1665 green — the report's "1594/1595 migration bookkeeping"
  failure is stale, already clean on this tree) and `npx tsc -b --noEmit` (clean).
- Diff scope check: only `src/course/tier2/{width,streams}.ts` and
  `tests/course/{width,streams}.test.ts` touched; `lessons.ts`, `curriculum.ts`,
  `readability.test.ts`, `lesson-hashes.json` all untouched, as claimed.

## Pass 1 findings

No stop points. Both lessons read cleanly against the Tier 1 vocabulary the learner is assumed to
have (`decode-thresholds`: MCS, OFDM, CCA, rung/ladder; `airtime`: ACK, preamble, payload). No
undefined word, no EN/ZH divergence (numbers and claims match line for line in both languages), no
number appears in prose without a backing table, no quiz is answerable only from `deeper` (both
`width` quiz items draw on `picture`/`numbers`/`tryThis`; both `streams` quiz items draw on
`picture`/`numbers`). The picture's physics claims (wider channel = more sub-carriers not a faster
symbol rate; the preamble is fixed-length at every width; a wider channel raises the noise floor,
not the interference-margin requirement) all check out against `src/engine/phy.ts` via the pins
below. No padding — both lessons are near their word budgets, not stuffed to them.

## Pass 2 findings

- The 20/40/80/160 MHz table (sub-carriers, MCS, rate line, symbols, airtime) is pinned per-variant
  against `widthScenario` runs in `width.test.ts`, and cross-checked against
  `quoted-timestamps.test.ts`'s shared `PhyQuote` walk (per the file's own header comment).
- The living-room table (415.2/238.4/170.4/224.8 µs, MCS 3/3/2/0, no retries/drops) is measured
  fresh from the moved scenario, not hard-coded from the old lesson.
- The inversion-window pin (`width.test.ts` line 201) is honest: it sweeps RSSI from -80 to -60 dBm
  in 0.01 dB steps and derives the invert-region edges from `mcsForRssi`/`txTimeModeNs` directly,
  not from restating the two boundary numbers the lesson prints. It independently reproduces
  "about one decibel wide" and "roughly half a decibel to either edge" and the -70.51 dBm position.
  This is a width-based measurement, not a tautology.
- Material moved to `deeper` (the one-decibel window, the 802.11a/20 MHz legacy fallback for
  `width`; the MU-MIMO forward reference and the why-paths-must-differ explanation for `streams`)
  is re-pinned in the new per-lesson test files, and the two claims that were already pinned
  elsewhere (`lesson-claims.test.ts` lesson 15's 48.7/48.0 dB margin and 704 µs/18 Mb/s fallback;
  lesson 16's Router 4 · Phone 2 == 2-stream identity) still pass unmodified against the unchanged
  scenario builder, exactly as the report says.
- Fixture (`tests/fixtures/lesson-hashes.json`) untouched, confirmed by diff and by both lessons'
  `scenario`/`variants` pins asserting `toEqual(widthScenario(...))` byte-for-byte.
- No `.body!` sites existed to retire for either lesson (both were bodied-lesson-shaped only via
  the pre-migration lessons, not via test call sites) — matches the report.

## Minor

- `width`, picture, "And the neighbours": introduces an OBSS/channel-overlap claim (wider channels
  make more neighbours wait) that this lesson's own scenario (single AP–STA pair, no other BSS)
  never demonstrates, unlike every other picture paragraph, which the learner can go verify with
  the buttons on screen. It's accurate domain knowledge and carries no numbers, so it isn't a pin
  gap, just a texture change from the rest of the lesson.
- `width` picture uses "rate ladder", and `width` numbers/quiz use "sensitivity ladder" for the
  same MCS threshold ladder introduced in `decode-thresholds` (which itself says "ladder of
  rates"/"the ladder"). Not an undefined-word violation — both readings are already established —
  but the naming drifts across three near-synonyms across two lessons.
