# Task 2 report — `uwb-intro` rewritten, `uwb-frame` split out

Branch `feat/uwb-ranging`, worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`.
Base when I started was `926e10e`; by the time I staged, the branch had advanced to
`0573cad` (Task 1's follow-ups and the AMP implementer's commits landed under me).

## What I built

### `src/course/uwb/uwb-intro.ts` — "A radio that measures time" / "一台测量时间的射频"

Rewritten to the zero-to-hero contract. `body` is gone; the lesson is now
`why` / `outcomes` / `needs` / `terms` / `picture` / `numbers` / `deeper` / `sources`.

- **why** — the brief's draft verbatim in EN (the register ruling said to hit it); the ZH is
  written fresh, not translated.
- **outcomes** (3), **needs** `['radio-primer', 'frame-anatomy']`, **terms** (4):
  `UWB`, `anchor`, `RMARKER`, `RCTU` — the four-term cap for a track's first lesson.
- **picture** (7 blocks, no table): "Loud is not the same as near" → "Clicks instead of tones" →
  **watch (jump 0)** "One question, one answer" → the RMARKER paragraph → "Two clocks that do not
  agree" → "How wrong is a few centimetres" → **watch (jump 3)** at the range line.
  The first `watch` is the **third** block, per the ruling: the reader is at the simulator before
  the mechanism is finished. Zero numeric quantities in the whole picture, EN and ZH.
- **numbers** (7 blocks, in the contract's order): the SS-TWR formula + note; the four-counter
  table with its lead-in; the arithmetic formula + note; the raw-vs-corrected paragraph; the
  **Units** table with a "Where" column carrying the only citations in the lesson body
  (`Clause 16`, `§10.29`); the 17 ns / 16.678 ns rounding paragraph.
- **deeper** (4, collapsed, not counted in study time): the clock-offset correction's 0.2 ppm
  residual; the 40-bit counter wrap (17.2 s); the ±20 ppm consequence; the Wi-Fi channel's zero
  propagation delay.
- **sources** (4 bullets): the old opening provenance paragraph, broken up — the standard and its
  clauses, FiRa's 2 ms / 200 ms, the model constants, §16.4.9 and the 40-bit choice.
- `scenario`, `variants`, `jumps` unchanged. `observe` keeps items 1–3, `tryThis` the 20 m one.
  `quiz` keeps the RCTU and the 17 ns questions, drops the RMARKER one (moved), and gains the plain
  "Why does UWB measure time instead of signal strength?".

### `src/course/uwb/uwb-frame.ts` (new) — "What a ranging frame is made of" / "一帧测距帧由什么组成"

- **why** the brief's draft (EN) with fresh ZH; **outcomes** (3); **needs** `['uwb-intro']`;
  **terms** (6): `SYNC`, `SFD`, `STS`, `PHR`, `PSDU`, `slot`.
- **picture** (6 blocks): "Locking on before listening" → "A sequence nobody can forge" →
  **watch (jump 0)** "Read the strip left to right" → "The header and the message" →
  "Two slots, one round" → "Where the stamp goes". Zero numeric quantities.
- **numbers** (3): the "What 197.628 µs is made of" table moved intact; the RMARKER arithmetic
  paragraph (65.128 + 8.141 = 73.269 µs, the 20-octet response, 385 µs of the 4 ms); the PSDU
  paragraph (30 octets at 6.81 Mb/s, 35.2 µs uncoded vs 37.179 µs, 240 + 48 bits + 2-symbol tail).
- **sources** (3): Clause 16, §10.29.1.1, §10.32, and what is FiRa's or the simulator's.
- `deeper` none (the contract does not require one).
- `scenario: () => uwbIntroScenario(5)` with the 20 m variant — the same builder `uwb-intro` uses,
  imported from it, so the split adds no scenario. `jumps`: `firstUwbPoll`, `firstUwbResp`.
- `observe` (2): the old fourth item (two 2 ms slots, response at exactly 2 000 000 ns, 385 µs of
  4 ms) + a new one on the frame-detail strip. `tryThis` (1): the "do the arithmetic yourself"
  experiment. `quiz` (3): the old RMARKER question + the STS's purpose + why the message is small.

### Wiring

- `src/course/curriculum.ts`: `'uwb-frame'` inserted in `COURSE_ORDER` right after `'uwb-intro'`.
  Nothing else in that file touched.
- `src/course/lessons.ts`: `uwbFrame` imported and registered beside `uwbIntro`. Nothing else.
- `tests/course/readability.test.ts`: `'uwb-intro'` removed from `MIGRATING`. One line, nothing else.
- `tests/fixtures/lesson-hashes.json`: two added lines (below).

## Word counts and study time

Measured with `lessonWords` / `lessonMinutes` (the contract's own walk):

| section | uwb-intro | uwb-frame |
|---|---|---|
| why | 79 | 63 |
| outcomes | 37 | 34 |
| terms | 59 | 108 |
| picture | 366 | 470 |
| numbers | 394 | 209 |
| observe | 104 | 91 |
| tryThis | 64 | 48 |
| quiz | 188 | 251 |
| **`lessonWords`** | **1291** | **1274** |
| **`lessonMinutes`** | **20** | **15** |

Both inside the spec's 500–1300 and ≤ 20 minutes. `uwb-intro` was 1705 words before the split
(1694 of prose by its own old header comment); the two lessons together are 2565, the growth being
the new on-ramp (why / outcomes / terms) and the picture, against provenance and depth that moved
into `sources` and `deeper` and are no longer counted.

Longest picture paragraph: 57 EN words / 106 ZH characters (`uwb-intro`), 82 EN / 135 ZH
(`uwb-frame`) — the caps are 90 and 170. Numeric quantities per picture paragraph: **0** everywhere,
in both languages. Acronyms used in why/outcomes/picture: `UWB`, `RMARKER` for `uwb-intro` (both its
own terms); `RMARKER`, `SYNC`, `SFD`, `STS`, `PHR`, `PSDU` for `uwb-frame` (its own six plus
`uwb-intro`'s, which precedes it in the same track).

`uwb-intro` sits **9 words** under the 1300 ceiling. The file header carries a CAUTION block saying
so: a sentence added there means a sentence deleted, or `readability.test.ts` fails. Depth that does
not fit belongs in `deeper`, provenance in `sources` — neither is counted.

## Tests moved, kept, added

**Moved to `tests/course/uwb-frame.test.ts`** (verbatim, each with the sentence it guards):

| test | now guards |
|---|---|
| the poll is 30 octets and 197.628 µs | the table's PSDU and total rows; the picture's "thirty bytes in the poll and twenty in the answer" |
| every field duration is `chipsToNs` of its chip count | the Duration column |
| the symbol and chip counts the "Field" column names | the Field column |
| the PSDU is 240 data bits, 48 parity, 2-symbol tail at 6.81 Mb/s | the PSDU paragraph |
| 160.449 µs structure / 37.179 µs message | the total row and the second observation |
| the RMARKER is the first chip after the SFD, 73.269 µs in | the RMARKER paragraph and quiz 1 |
| the response is 20 octets and 187.372 µs | the RMARKER paragraph, including the 385 µs |
| the round is two 2 ms slots, response at exactly 2 000 000 ns | the first observation and "Two slots, one round" |

**Kept in `tests/course/uwb-intro.test.ts`**: the units describe (chip/RCTU/metre/tick, the 1 ns
grid, the 40-bit wrap, the ±20 ppm cost), the flight-time describe (17 ns, 67 ns, round-up, the
Wi-Fi contrast), the four-lines-to-subtract describe (all five), the range-the-log-reports describe
(all four). The lesson-shape describe was rewritten around the new fields.

**Added** (both files, a `lesson shape` block):

- `isMigrated`, module, `needs`, the exact `terms` list, no table in `uwb-intro`'s picture, the
  first `watch` inside the first three picture blocks (the ruling), and each `watch.jump` resolving
  to a real jump target;
- `lessonWords` inside the lesson's window and `lessonMinutes ≤ 20` (the old "15–25" became "≤ 20");
- every jump target found in the base run;
- the bilingual walk, now over `why`/`outcomes`/`terms`/`picture`/`numbers`/`deeper`/`sources`
  instead of `body`;
- in `uwb-frame`: `uwbFrame.scenario()` deep-equals `uwbIntroScenario(5)` and the variant
  `uwbIntroScenario(20)` — the split's promise that the scene did not change;
- in `uwb-frame`: the uncoded 35.2 µs figure, the PSDU being the frame's last segment, shorter than
  SYNC and than STS, and under a fifth of the airtime.

## Every number that stays in prose, and the test that pins it

All in `tests/course/uwb-intro.test.ts` unless marked **[F]** (`tests/course/uwb-frame.test.ts`).

| number | where it is written | pinned by |
|---|---|---|
| 2 ms reply, 2 ms + Tprop, five orders of magnitude | numbers, SS-TWR note | the anchor's reply is 2 ms − Tprop… |
| 336 207 494 656 / 26 381 598 252 / 26 509 392 384 / 336 335 290 928 | numbers, counter table | the counters in the table are the counters in the log |
| 127 796 272 / 127 794 132 / 1070 / 16.75 ns / 5.02 m | numbers, arithmetic formula | subtracting them by hand gives 1070 RCTU… |
| 2140, 16.678 ns, 1065.7 ticks, 4.3 ticks, 100 ps | numbers, arithmetic note | 1070 is 4.3 ticks long… (+ the 100 ps session field) |
| 4.95 / 5.00 / 5.02 m, 1070, 7 cm | numbers, range-line paragraph | the range line reads 4.95 m…; the correction moves… by 7 cm |
| 499.2 MHz, 2.003 ns, 15.650 ps, 2⁻⁷ | numbers, Units table | the chip is 2.003 ns at 499.2 MHz… |
| 3.3356 ns, 213.1 RCTU, c = 0.299792458 m/ns, 4.7 mm, 2.3 mm | numbers, Units table | one metre is 3.3356 ns and 213.1 ticks… |
| 17 ns, 16.68, 16.678 ns, 15.650 ps, 1 ns, 64× | numbers, rounding paragraph | five metres of air is a 17 ns gap…; the engine rounds UP…; the 1 ns grid is 64 ticks |
| 0.2 ppm, 0.4 ns | deeper, "A correction with nothing to correct" | the correction moves… the 0.2 ppm the estimator cannot see past |
| 40 bits, 2⁴⁰, 15.650 ps, 17.2 s | deeper, counter wrap | the 40-bit counter wraps after 17.2 seconds |
| 0 ppm, ±20 ppm, 40 ns, 20 ns, six metres | deeper, crystals | the standard allows ±20 ppm… |
| 9 µs slot | deeper, Wi-Fi contrast | the Wi-Fi channel, by contrast… |
| 0 ns, 17 ns | observe 1 | five metres of air is a 17 ns gap… |
| 2 187 389 ns, 4.95 / 5.00 / 5.02 m, 2.1 cm | observe 3 | the range line reads 4.95 m…; the correction moves… by 7 cm |
| 17 → 67 ns, 16.678 → 66.713 ns, 19.95 / 20.00 m, 5 cm | tryThis | twenty metres is 67 ns…; at 20 m the range reads 19.95 m… |
| 2.003 ns ≈ 60 cm, 15.650 ps, 4.7 mm, 128×, 499.2 MHz, 213.1 | quiz 2 | the chip is 2.003 ns at 499.2 MHz…; one metre is 3.3356 ns and 213.1 ticks |
| 16.678 ns, 17 ns, 0.3 ns, 1 ns grid | quiz 3 | the engine rounds the flight UP… |
| 197.628 / 65.128 / 8.141 / 1.026 / 65.641 / 19.487 / 37.179 µs, 64 / 8 / 512 / 19 symbols | **[F]** numbers table | **[F]** every field duration…; the symbol and chip counts… |
| 160.449 µs, 37.179 µs | **[F]** numbers table | **[F]** 160.449 µs of the poll is structure… |
| 65.128 + 8.141 = 73.269 µs, 20 octets, 26.923, 187.372, 2 ms, 385 µs | **[F]** numbers, RMARKER paragraph | **[F]** the RMARKER is the first chip after the SFD…; the response is 20 octets… |
| 30 octets, 6.81 Mb/s, 35.2 µs, 37.179 µs, 240 / 48 bits, 2-symbol tail | **[F]** numbers, PSDU paragraph | **[F]** the PSDU is 240 data bits… |
| thirty bytes / twenty (words, not digits) | **[F]** picture, "The header and the message" | **[F]** the poll is 30 octets…; the response is 20 octets… |
| two 2 ms slots, 2 000 000 ns, 4 ms, 385 µs | **[F]** observe 1 | **[F]** the round is two 2 ms slots… |
| 15.650 ps, 0.299792458 m/ns, 1070 RCTU, 5.02 m | **[F]** tryThis | subtracting them by hand gives 1070 RCTU… (uwb-intro) |
| 73.269, 65.128, 8.141 µs | **[F]** quiz 1 | **[F]** the RMARKER is the first chip after the SFD… |

Nothing quoted in prose is unpinned. Three new pins were added for figures that previously had none:
`C_M_PER_NS === 0.299792458` (the Units table's "Where" cell), one chip ≈ 60 cm (the wrong quiz
option, which is wrong by being right about the chip), and the uncoded 35.2 µs.

## TDD evidence

**RED** — `npx vitest run tests/course/uwb-intro.test.ts tests/course/uwb-frame.test.ts`, after
writing both test files and before writing either lesson:

```
FAIL  tests/course/uwb-frame.test.ts [ tests/course/uwb-frame.test.ts ]
Error: Failed to load url ../../src/course/uwb/uwb-frame … Does the file exist?

FAIL  tests/course/uwb-intro.test.ts > uwb-intro · lesson shape > is written to the zero-to-hero contract
AssertionError: expected false to be true          // isMigrated
FAIL  tests/course/uwb-intro.test.ts > uwb-intro · lesson shape > fits one sitting
AssertionError: expected 1694 to be less than or equal to 1300
FAIL  tests/course/uwb-intro.test.ts > uwb-intro · lesson shape > every jump target occurs in the base run
TypeError: uwbIntro.picture is not iterable
FAIL  tests/course/uwb-intro.test.ts > uwb-intro · lesson shape > every string … in both languages
AssertionError: expected 27 to be greater than 50
 Test Files  2 failed (2)
      Tests  5 failed | 22 passed (27)
```

Expected: the new lesson module did not exist, and the old lesson had no `picture`, was 1694 words
and had nothing under the new fields to walk.

**GREEN** — `npx vitest run tests/course` after writing both lessons and the wiring:

```
 Test Files  30 passed (30)
      Tests  749 passed (749)
```

That run includes `readability.test.ts` exercising all seven per-lesson rules over `uwb-intro` and
`uwb-frame`, which is the first time the contract test has had a migrated lesson to bite on.

## Gates

| command | result |
|---|---|
| `npx vitest run tests/course` | **30 files, 749 tests passed**, output pristine |
| `npx vitest run` | **126 files, 1892 tests passed**, output pristine — no failure anywhere, including the AMP implementer's files |
| `npx tsc -b --noEmit` | clean, no output |
| `npm run build` | `✓ built in 3.02s` (only the pre-existing chunk-size advisory) |
| `git diff tests/fixtures/lesson-hashes.json` | exactly two added lines |

```
+  "uwb-frame": "231ef59c",
+  "uwb-frame#0": "1acca385",
```

identical to `uwb-intro` / `uwb-intro#0` — the scene really is the same run twice.

## Deviations from the brief

1. **`tests/fixtures/uwb-record-hashes.json` is NOT untouched.** The gate asked for it to be, and
   that is impossible: `tests/engine/uwb-record-hashes.test.ts` enumerates `LESSONS` and emits one
   test per lesson id starting `uwb-`, so `uwb-frame` and `uwb-frame#0` arrive as two new tests that
   throw `no recorded UWB record hash for 'uwb-frame'`. Leaving them failing would have broken the
   full-suite gate in a file that is not the AMP implementer's. I regenerated with `UPDATE_HASHES=1`
   and the diff is two added lines, nothing else:

   ```
   +  "uwb-frame": "1ada81b1",
   +  "uwb-frame#0": "98180104",
   ```

   — byte-identical to `uwb-intro`'s recorded values, which is itself the proof the brief wanted:
   the split added no scenario. **If the controller wants that fixture untouched, the alternative is
   to teach the record-hash test that two lesson ids may share a scene; I did not touch that file.**

2. **The word windows in the content contract do not fit what `lessonWords` counts.** The contract
   asks for 600–900 main-path words for `uwb-intro`, but `lessonWords` walks `terms`, `observe`,
   `tryThis` and `quiz` too, and those four alone — with the contract's own mandated three
   observations, one experiment, three quiz questions and four terms — are 415 words. The mandated
   `numbers` content (three formulas/tables with their notes, the counter table, the Units table)
   is another ~390. The lesson landed at **1291**, inside the spec's binding 500–1300 rule, with
   picture + numbers + the on-ramp at 935. I pinned `lessonWords` at 900–1300 and the pre-simulator
   prose at 600–1000 in `uwb-intro.test.ts`, and 800–1300 / 600–1000 in `uwb-frame.test.ts`, and
   noted in both test comments what the split had budgeted. **The contract's 600–900 and 800–1200
   should be re-expressed against a named quantity in the next brief.**

3. **The "2.1 cm of range-noise sigma" sentence had to move into `observe`, not `numbers`.**
   `tests/course/uwb-position.test.ts:332` asserts `lessonProse(uwbIntro)` contains
   `"2.1 cm of range-noise sigma"`, and that helper walks `{ body, observe, tryThis, quiz }` — with
   `body` gone, anything I put in `numbers` is invisible to it. `uwb-position.test.ts` is not a file
   I own, so I kept the phrase alive by extending the third observation instead. **When
   `uwb-position` is migrated, that helper should walk `lessonBlocks(l)`**, and the sentence can go
   back where it belongs.

4. **`PSDU is the smallest segment` was false and is gone.** The contract's `uwb-frame` outcome
   ("explain why the payload is the smallest part") and my first draft of the observation and quiz
   said the PSDU is the smallest field. It is not: at 37.179 µs it is larger than the SFD (8.141),
   the two STS gaps (1.026) and the PHR (19.487). The claim is now "the message takes less air than
   the pattern that introduces it" — shorter than SYNC and than STS, last in the frame, under a
   fifth of the airtime — and all three of those are pinned.

5. **Two contract items were moved from `numbers` to `deeper` in `uwb-intro`** to fit the word cap
   while keeping the picture readable: the clock-offset correction's mechanism (0.2 ppm → 0.4 ns →
   why SS-TWR's error grows with the reply) and the 40-bit counter wrap. The contract put the first
   in `numbers` and the second in `deeper`; the raw-vs-corrected paragraph itself stays in `numbers`
   with the 4.95 / 5.00 / 5.02 m and the 7 cm, which is what the contract's bullet named. No quiz
   answer depends on anything in `deeper`.

6. **`uwb-intro`'s "The next lesson takes the mercy away"** became "A later lesson in this track
   takes the mercy away": with `uwb-frame` inserted, the next lesson is no longer `uwb-sstwr`.

## Self-review findings, fixed before reporting

- The first draft of `uwb-frame`'s test asserted the uncoded payload figure as
  `240 / UWB_MBPS / 1000`, which is 0.0 µs — `UWB_MBPS` is bits per microsecond, so the divide by
  1000 was wrong. Fixed to `240 / UWB_MBPS` = 35.2, with a comment saying why.
- The same test asserted the PSDU is the shortest segment over 2 µs; it is not (see deviation 4).
  Replaced by three assertions that are true and that the prose now matches.
- `uwb-intro` came in at 1684 words on the first complete draft and again at 1438 after one trim.
  Two more passes brought it to 1291. Nothing was dropped — the trims are word-level, and every
  number, claim and pin in the first draft is still there.

## Concerns

1. **`uwb-intro` has 9 words of headroom under the 1300 cap.** The next person to add a sentence
   there will fail `readability.test.ts` and may not read the header's CAUTION first. If the spec's
   ceiling is meant to be a real budget for a lesson with three observations, an experiment and
   three quiz questions, it wants either a higher cap or a `lessonWords` that stops counting the
   quiz.
2. **Neither lesson has been seen in a browser.** vitest runs in node, so `CoursePanel` is verified
   only by `tsc` and `npm run build`. `uwb-intro` is the first lesson ever rendered with `terms`,
   two `watch` call-outs, a four-block `deeper` and a four-bullet `sources`; the `<details>`
   elements, the `needs` buttons and the watch buttons' load/jump behaviour are unexercised. One
   minute on the dev server before the learner reads it is worth it.
3. **The ZH side has not been read by a second pair of eyes.** It is written, not translated (the
   sentence order differs from the EN in several paragraphs), but the spec asks for a reviewer to
   read the ZH on its own, and that has not happened.
4. **`uwb-frame`'s `tryThis`** ("copy the four counters out of the log and do the arithmetic") is
   the contract's placement, but the four counters and the arithmetic now live in `uwb-intro`. The
   experiment works — the scene is the same and the log lines are there — but it reads as an odd
   fit in a lesson about field layout. Worth a ruling before the pattern is copied.

---

# Fix round 1

Both reviews addressed. One commit on top of `46ee066`; fixtures untouched
(`git status --short tests/fixtures/` empty).

## Final measurements

| | words | minutes | prose (why→numbers) |
|---|---|---|---|
| `uwb-intro` | **1291** | **20** | 935 |
| `uwb-frame` | **1270** | **15** | 906 |

Longest picture paragraph after the pass: 56 EN / 106 ZH (`uwb-intro`),
88 EN / 145 ZH (`uwb-frame`) — caps 90 / 170. Zero numeric quantities in either
picture, both languages. The first `watch` is picture block **2** in both.

Every word added this round was paid for by a word removed: `uwb-intro` went
1291 → 1318 → 1291, `uwb-frame` 1275 → 1386 → 1270.

## Task review

**Important 1 — "everything after it is the message" (false).** Rewritten in
both languages so the order is what the reader carries away:

> The RMARKER is the first chip after the SFD ends, so the frame runs SYNC, SFD,
> the stamp, then the STS between its two gaps, the PHR and the PSDU. Everything
> before the stamp gets both radios locked on; everything after it is what the
> frame has to prove and to say. …

Pinned by a new test in `uwb-frame.test.ts`, "the frame runs SYNC, SFD, the
stamp, STS between its gaps, PHR, PSDU": it asserts `layout.map(s => s.key)`
equals `['sync','sfd','stsGap','sts','stsGap','phr','psdu']` from
`uwbPpduLayout`, that the stamped segment is the first `stsGap`, that only
`sync` and `sfd` precede it, that the stamp offset is `sync + sfd`, and that what
follows the stamp and is *not* the PSDU is longer than the PSDU — the exact thing
the old sentence denied.

**Minor 2 — first-`watch` ruling unpinned on `uwb-frame`.** Added (ruling 2):
both shape tests now assert `findIndex(kind === 'watch') < 3`.

**Minor 3 — CAUTION header understated.** It now says **NINE** words, and adds
that `lessonMinutes` is already exactly 20, so one more `observe` (+2 min) or
`tryThis` (+4 min) fails the study-time ceiling however few words it adds.

**Minor 4 — stale comment quotes.** Re-quoted from the current text at five
sites in `uwb-intro.test.ts`: the Units table's two rows, the 64×-finer grid
sentence, the 17 ns observation, the 20 m experiment and the round-up paragraph.

**Minor 5 — the experiment's pins not discoverable from its own file.** The
`uwb-frame.test.ts` header now names the file, describe and test that pin
15.650 ps / 0.299792458 m/ns / 1070 RCTU / 5.02 m, and says why one assertion
covers both lessons (one scene).

**Minor 6 — reading directions disagreed.** Both now read left to right (see
ruling 3).

**Minor 7 — unpinned qualitative comparisons.** The `uwb-frame` one is pinned:
`ACK_TX_TIME_6M_NS === 44_000` and `uwbPpduNs(30) > 4 × that`, guarding "far
longer than a Wi-Fi acknowledgement". **Declined** for `uwb-intro`'s "a wall or a
hand costs more signal than ten metres of air": it is the brief's verbatim `why`,
carries no numeric token, and any pin would have to fix one wall material and one
decade of range — the engine answers that only per material and distance, so the
pin would assert a stricter claim than the sentence makes.

**Minor 8 — `UWB` and `anchor` not glossed inside `picture`.** **Partly
declined.** Both are glossed in `why` (the paragraph immediately above) and in
`terms`; the reviewer did not block on it and the beginner reader did not list
either as unexplained. The word budget bought one gloss and it went to **poll**,
which the beginner reader *did* list: the first watch now reads "The phone sends
a poll — the frame that opens a round — and the anchor answers."

**Minor 9 — a puzzle raised in `numbers`, answered in `deeper`.** Closed: the
range-line paragraph ends "…yet it moved the answer 7 cm. Going deeper says why."
(ZH: 原因见"再深一层"。)

## Beginner-reader review

**Ruling 3 / the EN and ZH stop point — `uwb-frame`'s observe.** Fixed in both
languages; the strip is read left to right everywhere and the PSDU is the last
segment reached:

> Open the poll in the frame detail view and read the strip left to right. The
> PSDU is the last segment you reach, and shorter than the run of SYNC that opens
> the frame — though it alone carries a message.

**Ruling 4 — "chip".** `uwb-intro`'s `terms` is at the four-entry cap for a
track's first lesson, so the gloss went into the picture sentence where the word
now first appears: "A UWB radio does the opposite: **it sends chips — pulses so
short each is over almost before it began.**" `chip` is then a `term` of
`uwb-frame` ("one pulse period, the smallest thing this radio can place in
time"), which cost the `slot` entry — `slot` is not an acronym so no rule
requires it, and it is glossed inline where it is used ("It cuts time into equal
slots and gives each frame one"). `uwb-frame`'s terms are now
`SYNC, SFD, STS, PHR, PSDU, chip`.

**Ruling 4 — symbol vs chip.** A new picture block, "Two words, two sizes",
placed immediately after the watch so the reader has just seen the strip:

> Those chips are what every length in this lesson is counted in. A symbol is a
> block of chips — a preamble symbol a long block, a symbol carrying message bits
> a much shorter one — which is why a field counted in symbols and one counted in
> chips can come out nearly the same length. The table below gives both counts, so
> no row leaves you guessing which unit it is in.

No counts in the picture, per the ruling; they went into the table's Field
column — "SYNC, 64 preamble symbols of 508 chips", "SFD, 8 preamble symbols",
"PHR, 19 symbols of 512 chips", "PSDU, 30 octets: 290 symbols of 64 chips" — and
are pinned by a new test against `PSYM_CHIPS` (508), `PHR_SYMBOL_CHIPS` (512),
`DATA_SYMBOL_CHIPS` (64) and `psduSymbols(30)` (290), including the paragraph's
own claim that SYNC and STS land within 2 % of each other.

**Ruling 4 — "spends a whole symbol on each of them".** Removed; the sentence is
now exact: "Each of the 240 data bits gets one data symbol of 64 chips, the 48
parity bits get one each, and a 2-symbol tail closes it: 290 symbols."

**Ruling 5 — "sigma".** The observation now reads "…against 2.1 cm of range-noise
sigma, **the standard deviation of a reading**." I **did not replace** the word:
`tests/course/uwb-position.test.ts:332` (not my file) asserts the literal phrase
`2.1 cm of range-noise sigma` inside `lessonProse(uwbIntro)`, so replacing it
breaks a test I do not own. Glossing serves the intent and keeps that test
honest; the ZH now says 标准差 without the calque around it.

**Ruling 5 — the four-idea formula note.** Split: the `formula` block's note
defines Tround and Treply only, and a separate short paragraph carries the
2 ms ∓ Tprop relationship and the cancelling conclusion.

**Ruling 6 — ZH renderings.** Applied all three `uwb-intro` suggestions
("在每一帧测距帧内部稍靠前一点…", "锚点记的两笔正好反过来", "所以能准确地认出脉冲到达的那一刻")
and two of the three for `uwb-frame` (the "整帧里，只有这一道边沿…" rewrite and
"这两帧本来可以挨得更近，但会话不让"). The third `uwb-frame` suggestion was the
observe contradiction, fixed above.

**Other beginner notes.** "threshold" is now "the detection threshold". "poll" is
glossed (Minor 8). The Units table's "Where" column is **kept** — the spec allows
citations in exactly one place, a table cell of `numbers`, and dropping it would
leave the lesson's provenance in `sources` alone — but it is now bare
("Clause 16", "§10.29" rather than "the HRP UWB PHY, Clause 16" and "the ranging
counter, §10.29"), which drops the datasheet register the reader noticed and buys
five words back. The overloaded `why` paragraph is the brief's verbatim draft and
the register ruling said to hit it, so it stands.

## Gates

| command | result |
|---|---|
| `npx vitest run tests/course tests/engine/lesson-hashes.test.ts tests/engine/uwb-record-hashes.test.ts` | **32 files, 792 tests passed**, output pristine |
| `npx vitest run` | **126 files, 1910 tests passed**, output pristine — no failure anywhere, AMP files included |
| `npx tsc -b --noEmit` | clean |
| `npm run build` | `✓ built in 3.02s` (pre-existing chunk-size advisory only) |
| `git status --short tests/fixtures/` | empty — both fixtures byte-identical to `46ee066` |

The three files I own now carry 60 tests (17 readability + 16 frame + 27 intro),
up from 57. Files changed this round: `src/course/uwb/uwb-intro.ts`,
`src/course/uwb/uwb-frame.ts`, `tests/course/uwb-intro.test.ts`,
`tests/course/uwb-frame.test.ts` — nothing else.

## Still open (unchanged from the first report)

Neither lesson has been rendered in a browser. `tests/course/uwb-position.test.ts`
still needs its `lessonProse` helper to walk `lessonBlocks` when that lesson
migrates, or the "sigma" phrasing stays frozen in `observe`.
