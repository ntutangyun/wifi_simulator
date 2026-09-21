# Task 2 fix round 1 — re-review

Fix commit: `fe99177` (base `b2829c2`), diff file
`.superpowers/sdd/2026-09-21-course-readability-1/task-2-fix1-review.md`.
Files touched: `src/course/uwb/uwb-frame.ts`, `src/course/uwb/uwb-intro.ts`,
`tests/course/uwb-frame.test.ts`, `tests/course/uwb-intro.test.ts` — exactly
the four files the fix report claims, nothing else.

## Task review (`task-2-review-report.md`) — 1 Important, 8 Minor

- **Important 1 — "everything after it is the message" is false** —
  ADDRESSED. `uwb-frame.ts` now reads "The RMARKER is the first chip after
  the SFD ends, so the frame runs SYNC, SFD, the stamp, then the STS between
  its two gaps, the PHR and the PSDU. Everything before the stamp gets both
  radios locked on; everything after it is what the frame has to prove and
  to say." Verified against the engine: `src/uwb/frameFields.ts:308–319`
  (`uwbPpduLayout`) returns
  `['sync','sfd',{'stsGap',rmarkerNs},'sts','stsGap','phr','psdu']` — the
  stamp sits at the first `stsGap`, offset `SYNC_NS+SFD_NS`. The new test
  `uwb-frame.test.ts:545` (`the frame runs SYNC, SFD, the stamp, STS between
  its gaps, PHR, PSDU`) asserts `layout.map(s=>s.key)` equals that exact
  array, that the stamped segment is `stsGap`, that only `sync`/`sfd`
  precede it, and that what follows the stamp minus the PSDU is still
  larger than the PSDU — the precise fact the old sentence denied. ZH
  updated in lockstep and says the same order. Ran the vitest file; the test
  passes (see Gates below).
- **Minor 2 — first-`watch` ruling unpinned on `uwb-frame`** — ADDRESSED.
  `uwb-frame.test.ts:61–63` now asserts `findIndex(kind==='watch') < 3`,
  same shape as `uwb-intro.test.ts:57–59`. Watch is picture block index 2
  (third block) in both files.
- **Minor 3 — CAUTION header understated the budget** — ADDRESSED.
  `uwb-intro.ts:16–28` now says "within NINE words" and adds the
  study-time-ceiling note ("`lessonMinutes` is already exactly 20 … one more
  `observe` item (+2 min) or one more `tryThis` (+4 min) fails"). Matches
  `uwb-intro.test.ts:72–73,79–80` (`lessonMinutes ≤ 20`, `lessonWords` in
  [900,1300]), both passing.
- **Minor 4 — stale comment quotes** — ADDRESSED. Re-quoted at all cited
  sites in `uwb-intro.test.ts` (Units table rows, the 64×-finer-grid
  sentence, the 17 ns observation line, the round-up paragraph, the 20 m
  experiment) to match the current lesson prose word-for-word.
- **Minor 5 — experiment's pins undiscoverable from `uwb-frame.test.ts`** —
  ADDRESSED. New file-header comment in `uwb-frame.test.ts:8–13` names the
  file, describe and test in `uwb-intro.test.ts` that pin 15.650 ps /
  0.299792458 m/ns / 1070 RCTU / 5.02 m, and explains why one scene covers
  both.
- **Minor 6 — reading directions disagreed ("left to right" vs "right to
  left")** — ADDRESSED. Both the `picture` watch and the `observe` item now
  say "left to right" / "从左读到右" and "the PSDU is the last segment you
  reach"; confirmed no occurrence of "right to left" / "从右往左" /
  "从右读到左" remains anywhere in either lesson file (grepped, zero hits).
- **Minor 7 — unpinned qualitative comparisons** — PARTIAL, as ruled.
  `uwb-frame`'s "far longer than a Wi-Fi acknowledgement" is now pinned:
  new test `uwb-frame.test.ts:66–70` asserts `ACK_TX_TIME_6M_NS === 44_000`
  and `uwbPpduNs(30) > 4 * ACK_TX_TIME_6M_NS` (197 628 > 176 000, true).
  `uwb-intro`'s "a wall or a hand costs more signal than ten metres of air"
  is DECLINED-BY-RULING, confirmed: no change made to that sentence, and the
  controller's ruling stands (it's the brief's verbatim `why`, no numeric
  token to pin, and the engine only answers per-material/per-distance —
  pinning it would assert a stricter claim than the sentence makes).
- **Minor 8 — `UWB`/`anchor` not glossed inside `picture`** —
  DECLINED-BY-RULING, confirmed. Both terms are still explained in `why` +
  `terms`, not inside `picture`, matching the controller's ruling. The word
  budget instead went to glossing "poll" (the beginner reader's actual
  complaint): the first watch now reads "The phone sends a poll — the frame
  that opens a round — and the anchor answers."
- **Minor 9 — puzzle raised in `numbers`, answered only in `deeper`** —
  ADDRESSED. The range-line paragraph now ends "...yet it moved the answer
  7 cm. Going deeper says why." (ZH: "原因见'再深一层'。").

## Beginner-reader review (`task-2-novice-read.md`)

- **`uwb-frame` priority 1 — observe contradiction (right-to-left vs "PSDU
  last")** — ADDRESSED, same fix as Minor 6 above, both EN and ZH.
- **`uwb-frame` priority 2 — symbol/chip units unreconciled** — ADDRESSED.
  New picture block "Two words, two sizes" (`uwb-frame.ts`, after the watch)
  states the symbol/chip relationship with zero numeric quantities (a rule
  requirement, verified — no digits in either language's text). The counts
  moved into the table's Field column ("64 preamble symbols of 508 chips",
  "19 symbols of 512 chips", "290 symbols of 64 chips") and are pinned by a
  new test (`uwb-frame.test.ts:528–543`) against `PSYM_CHIPS` (508),
  `PHR_SYMBOL_CHIPS` (512), `DATA_SYMBOL_CHIPS` (64), and `psduSymbols(30)`
  (290) — all confirmed passing. One nit: the SFD row ("8 preamble
  symbols") does not itself restate the 508-chip figure the way SYNC/PHR/PSDU
  do, so a reader has to infer the SFD's chips-per-symbol from the SYNC row
  rather than read it off its own row — not false, just a small
  incompleteness of the "no row leaves you guessing" claim. Not blocking.
- **`uwb-frame`/`uwb-intro` priority — "chip" never defined** — ADDRESSED
  for both. `uwb-intro.ts` picture: "it sends chips — pulses so short each
  is over almost before it began" (glossed inline at first use).
  `uwb-frame`'s `terms` now has `chip` replacing `slot` (`slot` isn't an
  acronym and is still glossed inline where used: "It cuts time into equal
  slots and gives each frame one").
- **`uwb-intro` priority 2 — "sigma" ungloosed** — ADDRESSED per the
  controller's ruling: `observe` now reads "...against 2.1 cm of
  range-noise sigma, the standard deviation of a reading." The literal
  phrase `2.1 cm of range-noise sigma` is preserved verbatim, which is
  required by `tests/course/uwb-position.test.ts:332`
  (`lessonProse(uwbIntro)).toContain(`${sigmaCm} of range-noise sigma`)`) —
  confirmed the substring still occurs in the new sentence, so that
  out-of-file test still passes.
- **`uwb-intro` priority 3 — four-idea formula note** — ADDRESSED. The
  `formula` block's `note` now states only Tround/Treply; a new separate
  paragraph carries the 2 ms ∓ Tprop relationship and the cancellation
  conclusion.

## Verification specifically requested

1. **False "everything after the RMARKER" claim gone (EN+ZH), replacement
   order pinned against `uwbPpduLayout`** — confirmed, see Important 1
   above. Read `src/uwb/frameFields.ts:298–319` directly: layout is exactly
   `sync, sfd, stsGap(rmarker), sts, stsGap, phr, psdu`, matching the new
   prose and the new test byte-for-byte.
2. **"Read right to left / PSDU last" contradiction gone, both languages** —
   confirmed gone (grep found zero remaining occurrences of the
   right-to-left phrasing in either language).
3. **"chip" glossed in `uwb-intro`'s picture and in `uwb-frame`'s `terms`;
   "Two words, two sizes" states the relation with no numbers in the
   picture; counts sit in the table with a pin** — all confirmed, see above.
4. **First-watch assertion in both shape tests** — confirmed,
   `uwb-intro.test.ts:57–59` and `uwb-frame.test.ts:61–63`, both passing.
5. **500–1300 words / ≤20 min / readability suite passes** — confirmed by
   running the suite (below): `uwb-intro` 1291 words/20 min, `uwb-frame`
   1270 words/15 min (per the fix report, and the bound assertions in both
   test files pass).
6. **New defects** — none found. No new false claim, no new citation
   leaking outside `sources`/the Units table's "Where" cells (checked by
   grep for `§`/`Clause` across both lesson files — every hit is in
   `sources` or a table "Where" cell, same as before the fix), and every ZH
   change I spot-checked still matches its EN counterpart (RMARKER order
   sentence, symbol/chip block, reading-direction fix, sigma gloss, formula
   note split).

## Gates run

`npx vitest run tests/course/uwb-intro.test.ts tests/course/uwb-frame.test.ts tests/course/readability.test.ts tests/engine/lesson-hashes.test.ts tests/engine/uwb-record-hashes.test.ts`

```
✓ tests/course/readability.test.ts (17 tests)
✓ tests/course/uwb-frame.test.ts (16 tests)
✓ tests/course/uwb-intro.test.ts (27 tests)
✓ tests/engine/uwb-record-hashes.test.ts (39 tests)
✓ tests/engine/lesson-hashes.test.ts (1 test)

Test Files  5 passed (5)
     Tests  100 passed (100)
```

Output pristine (no failures, warnings, or skips). This matches the fix
report's own claim of "32 files, 792 tests passed" for the wider set it ran.

## New breakage in the fix diff

None found.

## Out-of-scope observations

- The SFD table row's chip-per-symbol count is left implicit (see beginner
  priority 2 above) — non-blocking, noted for a future pass, not something
  the fix diff broke (it's a residual gap in the new "Two words, two sizes"
  material this same fix introduced, so arguably in-scope but too minor to
  reopen the loop over).
- Everything the original review flagged as "cannot verify from this diff"
  (browser rendering, ZH prose quality as read by a native reader, the
  `uwb-position.test.ts` `lessonProse` helper needing to walk
  `lessonBlocks` once that lesson migrates) remains open and untouched by
  this fix round — carried forward, not new.

## Verdict

**ALL ADDRESSED.** Every Important/Minor finding from the task review and
every priority item from the beginner-reader review is ADDRESSED or
DECLINED-BY-RULING (confirmed consistent with the controller's rulings). No
new Critical/Important breakage introduced by the fix diff. Full requested
test command passes clean (100/100).
