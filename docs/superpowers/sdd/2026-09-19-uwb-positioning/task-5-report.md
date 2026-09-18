# Task 5 report — UWB lesson 4, "Blocks, rounds and slots"

Branch `feat/uwb-ranging`, worktree `.claude/worktrees/feat-link-2g`.

## Files

- new `src/course/uwb/uwb-blocks.ts` (lesson `uwb-blocks`, module 12)
- new `tests/course/uwb-blocks.test.ts` (23 tests)
- `src/course/lessons.ts` — import + registration
- `src/course/lessonKit.ts` — added `firstUwbRoundEnd` (it was missing, as the brief anticipated)
- `tests/fixtures/lesson-hashes.json` — two added keys, nothing else touched

## Scenario

`oneRoom()`, lesson 2's four anchors on the 3.50 m ring around (5, 4) at z 2.2; three tags at
z 1.0 — `uwb-1` "Phone 1" (5, 4), `uwb-2` "Phone 2" (3, 2.5), `uwb-3` "Phone 3" (7.5, 6). DS,
defaults (block 240 000 RSTU, slot 2 400 RSTU), `nlos: false`, ppm left undefined (drawn).
Variant: `slotRstu: 600`, "0.5 ms slots" / "0.5 ms 时隙". The scenario builder takes the slot
length, so base = `uwbBlocksScenario(2400)` and variant = `uwbBlocksScenario(600)`; the test pins
that 2400 is the schema default, so the base scene really is "defaults".

## Measured numbers (all pinned in the test)

Schedule (`roundPlan`): 10 slots × 2 000 000 ns = 20 ms round, block 200 ms (240 000 RSTU),
`roundsPerBlock` 10, three tags used, rounds 3–9 empty = 140 ms.

- `UWB_ROUND` at 0 / 20 / 40 ms (block 0) and 200 / 220 / 240 ms (block 1); `UWB_ROUND_END` at
  20 / 40 / 60 ms. Round line: `uwb-1 UWB round 0 of block 0 (DS-TWR): 10 slots × 2000.0 µs`.
- Every `TX_START.t` is a multiple of the slot; the three Polls at 0, 20 000 000, 40 000 000 ns.
  No `BACKOFF_DRAW`, no `IFS_START`, no `NAV_SET`, no `UWB_TIMEOUT`.
- Poll = 39 octets; ARC IE 10 octets `SP1 · DS-TWR · block 0 · round 0 · 4 responders`;
  RDM IE 15 octets `4 devices: anchor-1 slot 1, anchor-2 slot 2, anchor-3 slot 3, anchor-4 slot 4`.
- `UWB_POSITION`: one per tag per block — uwb-1 (5.01, 3.99) GDOP 1.06 @20 ms, uwb-2 (3.01, 2.52)
  GDOP 1.08 @40 ms, uwb-3 (7.50, 6.01) GDOP 1.06 @60 ms; every block-0 error < 2.5 cm.
- Radio-on from MAC_STATE over block 0 (uwbWait + rx + tx): **tag 1 934 334 ns = 0.97 %**,
  **anchor 2 448 546 ns = 1.22 %**. Per round the anchor is on 816 180 ns with four wake-ups
  (state trace pinned exactly). The tag's figure = the round's airtime 1 934 230 ns + 8 × 13 ns
  of flight.
- Variant: slot 500 000 ns, round 5 ms, `roundsPerBlock` 40, round-ends and fixes at 5 / 10 / 15 ms,
  round share 2.5 %; radio-on **unchanged to the nanosecond** at 1 934 334 ns / 0.97 %.
- Slot-fit: `uwbPpduNs(uwbFinalBytes(4))` 236 603 + 200 guard = 236 803 ns. Schema: 282 RSTU
  rejected by **two** issues (floor + fit), 285 RSTU (237 500 ns, clears fit by 697 ns) rejected by
  the floor alone, 300 RSTU (250 000 ns) accepted. Fit only exceeds the floor from six anchors
  (267 572 ns → 324 RSTU). Deleting an anchor: 8 slots, 16 ms round, `roundsPerBlock` **12**.

## Deviations from the brief (with reasons)

1. **Radio-on shares are not 10 % / 30 %.** The brief predicted the tag's own round (20/200 ms) and
   the anchors' three rounds (60/200 ms) as the radio-on figures. Measurement shows the device
   model switches the receiver off the instant the expected frame lands, and an anchor never listens
   in the other anchors' slots, so the real numbers are 0.97 % and 1.22 %. The lesson now teaches
   both figures explicitly — "schedule share" vs "radio share" — which is a stronger point than the
   brief's version, and the 10 %/30 % pair is still stated and pinned as the schedule share.
2. **The variant's 2.5 % is the schedule share, not a radio saving.** Measured radio-on is identical
   in both scenes to the nanosecond, because no frame changes length. The lesson says so and the
   test pins the equality.
3. **The minimum slot is 300 RSTU, not 285.** 285 RSTU does clear the fit rule (by 697 ns) but the
   schema's own `z.number().int().min(300)` refuses it. The schema is the oracle, so the lesson
   pins 282 → two issues, 285 → floor only, 300 → accepted, and explains when the fit rule becomes
   the binding constraint instead (six anchors).
4. **"rounds per block 10" after deleting an anchor would have been wrong**: a 16 ms round gives 12.
   Corrected in the editor try-this and pinned.
5. Added `firstUwbRoundEnd` to `lessonKit.ts`; the second-tag-round and next-block predicates are
   local to the lesson file, in the house style of lesson 3's `firstAnchorRange`.

## Size

`lessonWords` = 1708 (body 1079, observe 194, tryThis 123, quiz 312), `lessonMinutes` = 25
(4 observe + 2 tryThis = 16 min, reading 11.4 min). Ceiling is 1724, so 16 words of headroom; the
file header states this.

## Hash fixture

`git diff tests/fixtures/lesson-hashes.json` adds exactly two lines:
`"uwb-blocks": "8c34bc07"` and `"uwb-blocks#0": "b1d9cf3"`. No existing key changed.

## Gates

`npx tsc -b` clean; `npx vite build` clean; `npx vitest run` — 96 files, 1069 tests, all passing.

---

## Fix round 1

Review `task-5-review.md`: Spec APPROVED, Quality CHANGES REQUIRED (2 blocking, 7 minor). All nine
addressed in `src/course/uwb/uwb-blocks.ts` and `tests/course/uwb-blocks.test.ts` only. No scenario
changed, so the fixture was **not** regenerated.

1. **(blocking) "seven" → "six" slots slept through**, EN and ZH, and "which slot to answer in" →
   "which slots", since an anchor owns two (Response *i*, Report 5 + *i*). Consistent with the pinned
   non-idle slot list `[0,0,1,5,5,6]` and with "four wake-ups in ten slots".
2. **(blocking) the three-round total now states the measurement.** 3 × 816 180 = 2 448 540, not
   2 448 546. Measured per-round: **816 180 / 816 194 / 816 172 ns**, sum exactly **2 448 546 ns** —
   the rounds differ because the flight to each of the three tags rounds differently. Prose now reads
   "816 180 ns in the first … Three rounds, differing by nanoseconds of flight, make 2 448 546 ns",
   and the test asserts the per-round triple and `sum === 2 448 546` as equalities (the old
   `3 × 816 180 < 2 448 546` inequality is gone).
3. "they differ tenfold" → "tenfold and more" / "相差十倍以上", and pinned: tag ratio **10.3×**,
   anchor ratio **24.5×** (the review's 24.6 came from dividing the rounded percentages; 60 ms /
   2 448 546 ns is 24.5), both ≥ 10, anchor > tag.
4. "what this model does not simulate … the drift between devices" → "what this model leaves out …
   and schedule drift — here a slot boundary is exact, but 20 ppm across 200 ms is 4 µs each way".
   The model does draw crystal ppm (`UwbClock.fromRng`); what it does not drift is the schedule, and
   the test now pins every `TX_START` to an exact multiple of `slotNs` under that sentence.
5. The fourth/eleventh-tag claim is now schema-pinned: `schemaIssues` takes an extra-tag count, so
   4 and 10 tags parse clean and 11 gives exactly
   `the UWB block fits 10 tags at 10 slots each (found 11); lengthen blockRstu or shorten slotRstu`.
6. Three narrow pins widened: (a) the per-tag fix count is asserted for block 1 as well, with the
   220/240/260 ms instants; (b) the variant's radio-on is checked for all three tags and against each
   tag's own base-run figure; (c) `to3(clampField('285', 300, 60 000, true)) === 300` pins the
   editor's 285→300 snap that tryThis 2 tells the learner to perform.
7. Every quoted comment re-copied from the shipped strings (twelve of them, including the one that
   quoted a sentence no longer in the lesson), plus two test titles that quoted stale wording.
8. TryThis 1 now says "the editor's session section" / "编辑器里会话那一栏".
9. The extra ZH clause "而且还是同样的定位" dropped from the "Shorter slots" paragraph.

Size after the fixes: `lessonWords` **1714**, `lessonMinutes` 25 (ceiling 1724, ten words of
headroom); the file header states the new figure.

Gates: `npx vitest run tests/course/uwb-blocks.test.ts` → **26 tests passed** (23 before, +3 new:
the eleventh-tag schema pin, the tenfold-and-more ratios, the 285→300 snap). `npx tsc -b` clean.
`npx vitest run tests/engine/lesson-hashes.test.ts` fails **only** on three added `uwb-position*`
keys from the concurrent lesson-5 work; `uwb-blocks` (8c34bc07) and `uwb-blocks#0` (b1d9cf3) are
unchanged, as expected for prose-only edits.
