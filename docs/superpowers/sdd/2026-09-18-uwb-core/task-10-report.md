# Task 10 report — Lesson 3 "Two round trips cancel the clock" (`uwb-dstwr`)

Branch `feat/uwb-ranging`, worktree `.claude/worktrees/feat-link-2g`.
Files: `src/course/uwb/uwb-dstwr.ts` (new), `src/course/lessons.ts` (+2 lines),
`tests/course/uwb-dstwr.test.ts` (new), `tests/fixtures/lesson-hashes.json` (regenerated).

## Scene

`oneRoom()` (10 × 8 m "Lab"), tag `tag-1` "Phone" at (5, 4, 2.2), anchors on the 3.50 m ring at
(8.5, 4), (5, 7.5), (1.5, 4), (5, 0.5), all z = 2.2; session `{ method: 'ds', nlos: false }`.
Base `{ tag: 10, anchors: -10 }`, one variant `{ tag: 20, anchors: -20 }`
("Worst-case crystals, ±20 ppm" / "最差晶振，±20 ppm").

Lesson 2's `uwbSstwrScenario` hard-codes `method: 'ss'` and takes no method argument, so the scene is
rebuilt locally as `uwbDstwrScenario(ppm)` with identical coordinates (no lesson imports another
lesson). The test pins the ring, the room, the z, the node order and the session config, so the two
scenes cannot drift apart silently.

## Measured numbers (all pinned in the test)

Round / frames
- `roundPlan` → 10 slots (2N + 2) × 2 000 000 ns; `UWB_ROUND.untilNs === 20_000_000`;
  log line `tag-1 UWB round 0 of block 0 (DS-TWR): 10 slots × 2000.0 µs`; no `UWB_TIMEOUT`.
- TX order: poll@0, resp@2/4/6/8 ms, final@10 ms, report@12/14/16/18 ms.
- Poll 39 oct / 206 859 ns (206.86 µs); Response (DS) 14 / 181 218 (181.22); Final 62 / 236 603
  (236.60); Report 24 / 191 474 (191.47). Round: 253 octets, **1 934 230 ns = 1 934.23 µs**.
- Duty: 1 934 230 / 20 000 000 = **9.67 %**, against **9.56 %** for the SS round
  (206 859 + 4 × 187 372 = 956 347 of 10 ms). Final = 14 + 12N; 62 oct = 496 bits = 2 RS blocks
  (`RS_BLOCK_BITS` 330); MHR 9 + RMI 27 + 4 × RRTI 6 + FCS 2 = 62; 9 + 13 + 2 = 24.
  Fifth anchor: +12 octets on the Final, +2 slots = +4 ms.

Counters (anchor-1, base run)
- `UWB_TS` 26 381 597 885 (rx poll), 26 509 391 059 (tx resp), 27 020 567 485 (rx final)
  → Treply1 = 127 793 174, Tround2 = 511 176 426 RCTU.
- Phone: Tround1 = 127 797 230, Treply2 = 511 185 160 RCTU.
- Tround1 − Treply1 = **+4 056 RCTU (+63 ns)**; Tround2 − Treply2 = **−8 734 (−137 ns)**; both should
  be 2·Tprop = 23.3 ns. Sum of the four = **≈1 277 952 000 RCTU = 20.000 ms** (10 ms on each clock),
  pinned per anchor to ±1000 RCTU and ±200 ns per half.

The two single-sided halves (base)

| Anchor | Treply1 | (Tround1−Treply1)/2 | (Tround2−Treply2)/2 | DS |
|---|---|---|---|---|
| anchor-1 | 2 ms − Tprop | 9.51 m | −20.49 m | 3.51 m |
| anchor-2 | 4 ms − Tprop | 15.47 m | −14.48 m | 3.49 m |
| anchor-3 | 6 ms − Tprop | 21.49 m | −8.43 m | 3.54 m |
| anchor-4 | 8 ms − Tprop | 27.42 m | −2.55 m | 3.45 m |

The first-half column reproduces lesson 2's raw ramp exactly (9.51 / 15.47 / 21.49 / 27.42 m); the
test also checks each against the ±10 ppm prediction to < 0.15 m. Averaging anchor 1's halves gives
**−5.49 m** (the quiz distractor), pinned.

Ranges and fix
- Errors, tag lane: **+1.4, −0.9, +3.7, −5.2 cm** (exact: +1.41, −0.93, +3.71, −5.16); all < 6 cm,
  all < 0.15 m, all inside 3·σ of their own slot.
- Anchor-lane `UWB_RANGE` at **10 236 615 ns** (all four, at the Final); tag-lane at 12/14/16/18 ms
  + 191 486 ns. `tofRctu` identical on both lanes (exact `===`), `distM` within 1e-9, `tofRawRctu`
  absent for DS.
- `UWB_POSITION` at 20 000 000 ns:
  `tag-1 position (5.01, 3.98) m, true (5.00, 4.00), error 0.02 m, GDOP 1.00, 4 anchors`.

Clock-cancellation algebra (verified numerically, not asserted from theory)
- Numerator scales by exactly (1 + eA)(1 + eB) and the denominator by 1 + (eA + eB)/2, for
  (eA, eB) ∈ {(20,−20), (20,20), (10,−10), (−5,20)} ppm and every slot 1–4.
- Residual = Tprop·(eA + eB)/2. Worst pair allowed (both +20 ppm): **0.2335 ps = 0.07 mm**.
  With the crystals opposed (this scene): |error| < 1e-8 m (1.4 nm).

Timestamp noise (the per-slot bound the brief asked for)
- Three noisy receive stamps per result with sensitivities r2/S, ½, r1/S (S = r1 + r2 doubled), so
  1-σ = **1.94 cm in slots 1 and 4, 1.85 cm in slots 2 and 3** — flat, not a ramp (exactly equal for
  slots 1 and 4; max/min < 1.06), and below lesson 2's `rangeSigmaM(100)` = 4.24 cm.
- Measured over 100 seeds the per-slot RMS is 1.95 / 1.86 / 2.04 / 1.76 cm; the test requires each
  within 25 % of the prediction. Range bounds use 3·σ(slot), not a flat guess.

±20 ppm variant
- Anchor-1 halves become 15.51 m and −44.47 m; DS ranges 3.52 / 3.49 / 3.54 / 3.45 m, each within
  **3 mm** of the base (largest change 2.82 mm, anchor-4); fix error 0.02 m, GDOP 1.00.

## Lesson shape

- `id: 'uwb-dstwr'`, `module: 11`, already in `COURSE_ORDER`.
- Body: sources → three-message exchange (`steps`, 4 items) → `formula` (DS + the cancellation
  argument) → "Two wrong halves" + halves `table` → "The price is slots, not airtime" + frame
  `table` → "The same number, computed twice" → "What it does not fix".
- 5 jumps (poll, Final, anchor-lane range, first report, position), 4 observe, 2 tryThis, 3 quiz.
- **1 710 English words → `lessonMinutes` 25** (band 975–1724; 15 words of headroom, recorded in the
  file header as lesson 2 does).

## Fixture diff

Additions only:
```
+  "uwb-dstwr": "dbb6fae5",
+  "uwb-dstwr#0": "dbb6fae5",
```
No existing hash changed.

## Verification

`npx tsc -b` clean · `npx vite build` ok · `npx vitest run` **92 files / 988 tests, all passing**
(no failures anywhere, including the other agent's lesson-1 files, which were committed as 557a49f
and 8defe87 while this task ran). New test file: 32 tests.

## Deviations from the brief

1. **Jump order.** The brief lists poll, Final, first report, anchor-lane range, position; the lesson
   lists them chronologically — poll (0), Final (10 ms), anchor-lane range (10.237 ms), first report
   (12 ms), position (20 ms) — because an anchor computes its range on the Final, before any report
   flies. The test asserts the jumps occur in list order and that the anchor range precedes the
   first report.
2. **"within 2.8 mm" → "within 3 mm".** The measured largest base-to-variant change is 2.815 mm, so
   2.8 mm would have been false by 15 µm.
3. **"about 1.9 cm of 1-σ" → "1.9 cm in slots 1 and 4, 1.8 cm in slots 2 and 3".** The weighted
   sigma is 1.94 / 1.85 / 1.85 / 1.94 cm; quoting one figure for all four would have rounded two of
   them the wrong way. The "does not ramp" point is unaffected (slots 1 and 4 are exactly equal).
4. **Scene defined locally** rather than imported: `uwbSstwrScenario` is SS-only (see above).
5. The observe item on the two differences says "+63 ns and −137 ns where both should be twice the
   11.675 ns of flight" rather than "63 ns too long" — the difference *is* 63 ns, of which 23.3 ns
   is real flight.
6. NLOS is pointed at "the positioning lesson that closes this track" rather than "lesson 5", since
   the fifth id in `COURSE_ORDER` is `uwb-position` and naming it by role survives reordering.

---

# Fix round 1

Review `task-10-review.md` on commit 87ec262: Spec APPROVED, Quality CHANGES REQUIRED — 2 blocking,
10 minor. All twelve closed, in `src/course/uwb/uwb-dstwr.ts` and `tests/course/uwb-dstwr.test.ts`
only. The hash fixture was **not** regenerated (prose-only changes leave the timeline untouched);
`npx vitest run tests/engine/lesson-hashes.test.ts` passes on the committed fixture.

## Blocking

**1 — "the only one that grows with the anchor count" was false.** The Poll is `27 + 3N`
(`src/uwb/phy.ts:94`), so it grows too. The sentence is now "The Final is the largest frame, and the
one that grows fastest with the anchor count: 14 + 12N octets against the Poll's 27 + 3N" (ZH:
"…也是随锚点数增长最快的帧：14 + 12N 字节，而 Poll 是 27 + 3N"). New test *the Final is the largest
frame and the one that grows fastest* pins `Math.max(...sizes) === uwbFinalBytes(4)`,
`uwbFinalBytes(n) === 14 + 12n` and `uwbPollBytes(n) === 27 + 3n` for n ∈ {3,4,5},
`uwbPollBytes(5) − uwbPollBytes(4) === 3`, `uwbFinalBytes(5) − uwbFinalBytes(4) === 12`, and that the
Response and the report do not grow at all.

**2 — the inspector shows one RRTI IE of 24, not four of 6.** `frameFields.ts:80–86` emits a single
`ieRrti` row of `n * RRTI_IE_BYTES`. tryThis 2 now reads "62 octets in two IE rows — an RMI IE of 27
listing four anchors and one RRTI IE of 24 holding the four Treply2 values, 6 each", and body step 3
"carrying each anchor's Tround1 in one RMI IE and all four Treply2 = txFinal − rxResp in one RRTI IE"
(both languages). New test *the Final's two IE rows are an RMI of 27 and one RRTI of 24* decodes the
run's own `TX_START` Final through `uwbFrameFields` and asserts the IE rows are exactly
`[{ieRmi, 27}, {ieRrti, 24}]`, that the RRTI value string is "4 reply times (treply2), one per
anchor", and the same for the report (`[{ieRmi, 13}]`).

## Minor

3. **Formula block pinned.** New test asserts there is exactly one `formula` block, that its
   `text.en` is the printed expression character for character, that `zh` equals it, and that
   `dsTwr(t1, r1, t2, r2)` reproduces `(t1·t2 − r1·r2)/(t1+t2+r1+r2)` on three arbitrary quadruples.
4. **Model numbers named and pinned.** `COUNTER_BITS` is imported and pinned to 40 (≥ 32),
   `rmiFinalIeBytes(n) === 3 + 6n` loops over n ∈ {3,4,5}, and `RRTI_IE_BYTES`, `RMI_REPORT_IE_BYTES`,
   `SESSION.tsNoisePs` and `PLAN.slotNs` back the sentence's other four numbers.
5. **Guard comments resynced.** Every quoted fragment was re-copied from the shipped strings and then
   verified mechanically (a script extracts every quoted fragment from the test's comments and checks
   it against the lesson's `en:` literals). The four remaining non-matches are real strings that
   extractor does not scan: the module title in `curriculum.ts`, two `J()` jump labels, and the
   `uwbDstwrScenario` doc comment. Comments that described a table rather than quoting a string
   (the head row, the total row, a table row) no longer use quotation marks.
6. **Both tables checked cell by cell** via `cell(table, row, col)`; head labels and row count pinned
   too, so a value in the wrong column now fails.
7. **Scene cross-pinned to lesson 2.** New test *is lesson 2's scene to the letter* asserts
   `JSON.stringify` of `uwbDstwrScenario(p)` equals that of `uwbSstwrScenario(p)` once `uwb.method` is
   normalised, for both ppm pairs, and that the two methods really are 'ds' and 'ss'. Lesson 2 was not
   edited; the import is test-level only.
8. **The NLOS sentence was wrong and is now right.** DS-TWR does *not* cancel a delay common to the
   receive stamps: with every rx stamp late by δ, tround1 and tround2 rise by δ and treply1 and
   treply2 fall by δ, the denominator is unchanged and the numerator gains exactly δ × denominator, so
   the estimate is `Tprop + δ`. The prose now says "an obstructed first path delays all three stamps,
   and the formula adds that delay straight to the range" (ZH: "会把这三个时间戳一起推迟，而公式会把这
   段延迟直接加到距离上"). New test *a delay common to all three receive stamps is added straight to the
   range* drives `dsTwr` with each of `UWB_NLOS_NS`'s three materials across all four slots and pins
   both `est − tprop === δ` and the metre form `excessNs × c`; one brick wall is 0.60 m on every range.
9. **"Three noisy receive stamps" pinned against the engine.** New test *only the receive stamps carry
   noise* replays the scene on eight seeds: the tag's tx-poll→tx-final span is identical on all eight
   (a transmitter knows when it fires), while each of the four intervals that crosses a receive stamp
   scatters by more than zero and less than 8 σ of the session's 100 ps, and the record stream shows
   exactly the three rx stamps the sentence names.
10. **The Final's payload pinned by content.** New test asserts `uwb.ies === ['RMI','RRTI']`,
    `finalTimes.length === 4`, and that each entry's `tround1`/`treply2` equal the `fourTimes()`
    values, plus the report's `ies` and `reportTimes`.
11. **Header claims made true.** The ceiling is stated as 1724 with the note that 1725 tips the
    rounding to 30, and the study-time test now pins `lessonWords ≤ 1724` and demonstrates the 1725
    case. Prose trimmed from 1722 to **1707 words** (still 25 minutes, 17 words of headroom), so the
    header's count is accurate again; claim (a) holds now that findings 3, 4, 8, 9 and 10 are closed.
12. **Test nits.** `fourTimes` now looks each counter up by lane, direction and frame kind through a
    `stamp()` helper instead of positional indices, and takes the record stream as an argument (used
    for the variant and the seed sweep); the `2 * PLAN.roundNs / 2` no-op is now an explicit
    `halfNs = PLAN.roundNs / 2`, pinned to 10 ms. Seeded runs are memoised.

## Verification

`npx tsc -b` clean · `npx vite build` ok · `npx vitest run tests/course/uwb-dstwr.test.ts
tests/engine/lesson-hashes.test.ts` → 39 passed · full `npx vitest run` → **92 files / 994 tests, all
passing** (38 in this file, up from 32). `git status` shows only the two files.
