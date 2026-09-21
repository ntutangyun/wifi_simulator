# Task 2 review — `uwb-intro` rewritten, `uwb-frame` split out

Diff under review: `0573cad..46ee066` (9 files, +598/−222). Uncommitted work by the
AMP implementer (`src/editor`, `src/ui/Guide.tsx`, `src/ui/glossary.ts`, README,
`tests/editor`, `tests/ui`) was ignored; every file below was read at `46ee066`
via `git show`.

## Verdicts

- **Spec compliance: ❌** — one binding global constraint fails: a claim in
  `uwb-frame`'s picture is false of the engine and contradicts the lesson's own
  pinned table (Important 1). Everything else in the brief's two content
  contracts, the file list and the fixture rulings is met.
- **Code quality: Needs changes** — the tests and pins are the strongest part of
  this task; the change needed is the false sentence (EN + ZH) plus a missing pin
  for the "first `watch` in the first three blocks" ruling on `uwb-frame`.

Counts: **Critical 0 · Important 1 · Minor 8.**

## Gates I ran

| command | result |
|---|---|
| `npx vitest run tests/course tests/engine/lesson-hashes.test.ts tests/engine/uwb-record-hashes.test.ts` | **32 files, 789 tests passed**, exit 0; output pristine (no warning, stderr, deprecation, skip or todo line in the full log) |
| `npx tsc -b --noEmit` | clean, exit 0, no output |
| `lessonWords` / `lessonMinutes` measured out of band (esbuild bundle → node) | `uwb-intro` 1291 words / 20 min / prose 935 / 14 blocks; `uwb-frame` 1275 words / 15 min / prose 888 / 9 blocks |

`readability.test.ts` reports 17 tests = 3 bookkeeping + 7 rules × 2 lessons, so the
contract test really bites on both lessons for the first time (it is not vacuous).

## Constraint-by-constraint

**1. Pins — inventory (no test dropped).** Old `tests/course/uwb-intro.test.ts` at
`0573cad` had 5 describes / 33 `it`s. At `46ee066`:

| old describe | where it is now |
|---|---|
| `lesson shape` (7 its) | `uwb-intro.test.ts:50` — all 7 present; "15–25 minutes" → "under 20 minutes" per the brief; + 2 new (`is written to the zero-to-hero contract`, `fits one sitting: 900–1300 words`) |
| `the units` (5 its) | `uwb-intro.test.ts:164` — all 5 |
| `what 197.628 µs is made of` (7 its) | `uwb-frame.test.ts:109` — all 7, moved verbatim and **strengthened** (`:153` adds the uncoded 35.2 µs; `:167` adds last-segment / shorter-than-SYNC / shorter-than-STS / < 20 % of airtime) |
| `the flight time on the timeline` (5 its) | 4 stay in `uwb-intro.test.ts:217`; the 5th (`the round is two 2 ms slots…`) moves to `uwb-frame.test.ts:206` and gains `poll t === 0` |
| `the four lines to subtract` (5 its) | `uwb-intro.test.ts:289` — all 5 |
| `the range the log reports` (4 its) | `uwb-intro.test.ts:349` — all 4 |

33 old → 40 new (27 + 13), nothing dropped, nothing weakened. New shape blocks exist
in both files and assert `isMigrated`, module, `needs`, the exact `terms` list, jump
targets against the base run, `lessonWords` window, `lessonMinutes ≤ 20`, and the
bilingual walk; `uwb-frame.test.ts:53` additionally deep-equals both scenarios to
`uwbIntroScenario(5)` / `(20)` — the split's promise, pinned.

**1b. Pins — numbers.** I walked every field of both lessons. Every numeric quantity
in prose has an assertion against the engine or the run: the counter quadruple and
its log-line spellings (`uwb-intro.test.ts:301`), 1070 / 16.75 ns / 5.02 m / 2140 /
1065.7 / 4.3 (`:312`, `:330`), 2 ms ∓ Tprop and five orders of magnitude (`:338`),
4.95 / 5.00 / 5.02 / 7 cm / 2.1 cm / 2 187 389 ns (`:350`, `:376`), the Units table
(`:165`, `:186`), 17 / 67 / 16.678 / 66.713 and the round-up (`:226`, `:234`, `:242`),
40-bit / 2⁴⁰ / 17.2 s (`:197`), ±20 ppm → 40 ns → six metres (`:207`), the 9 µs slot
(`:272`), −14 / −93 dBm, 100 ps, 0.2 ppm (`:97`, `:114`, `:376`), FiRa's 2 ms / 200 ms
(`:165`); and for `uwb-frame` the whole 197.628 µs table, 73.269, 160.449 / 37.179,
20 octets / 26.923 / 187.372 / 385 µs, 240 + 48 + 2 at 6.81 Mb/s and 35.2 µs, the two
2 ms slots and 2 000 000 ns. **No unpinned number.** Two caveats are Minor findings
(5 and 7) rather than misses.

**2. Contract.** Both lessons pass `readability.test.ts` for real (run above).
Non-tested rules, checked by reading: one idea per paragraph holds (`uwb-intro`
picture block 4 and 5 each stretch to two closely-joined statements but stay one
thought); first use of every `terms` entry is glossed inside `picture` for
`RMARKER` (`uwb-intro.ts:96`) and for all six of `uwb-frame`'s terms
(`uwb-frame.ts:55–83` glossed inline at `:59`, `:63`, `:67`, `:71`, `:75`) — see
Minor 8 for `UWB`/`anchor`; the first `watch` is the third picture block in both
lessons; `deeper`/`sources` carry the depth and provenance and no citation token
leaks (the contract test enforces `why`/`outcomes`/`terms`/`picture`/`observe`/
`tryThis`/`quiz` + `numbers` prose, and `deeper` is clean by reading — the ±20 ppm
depth line names no clause and its clause lives in `sources`); `needs` are correct
and ordered; `terms` = 4 for `uwb-intro` (first of track, and no table in its
picture) and 6 for `uwb-frame`; every quiz answer is derivable from `why`→`numbers`
(intro Q2 from the Units table, Q3 from the rounding paragraph; frame Q1 from the
`numbers` RMARKER paragraph, Q2/Q3 from the picture) — nothing depends on `deeper`.

**3. Truth.** The four plain-language mechanism sentences check out against the
engine: RX-only timestamp noise (`src/uwb/device.ts:775` adds
`gaussian × tsNoisePs`; the TX counter at `:905` takes no noise), so "two of the
four readings are receptions, so the answer carries two doses of it" is exactly
right; whole-tick counting (`src/uwb/clock.ts` `counter()` `Math.round`); unknown,
uniformly-drawn counter origins that cancel under `counterDiff` (`clock.ts`
`fromRng`); `ssTwrRaw = (tround − treply)/2` (`src/uwb/ranging.ts:4`) and the
correction scaling `treply` by the carrier-estimated offset (`ssTwrCorrected`,
`device.ts:781`), which is what the `deeper` 0.2 ppm → 0.4 ns paragraph describes.
Arithmetic spot-checks all close: 197.628 = 65.128+8.141+1.026+65.641+1.026+19.487+
37.179; 187.372 + 197.628 = 385.000; 240+48+2 symbols at 128.2 ns = 37.18 µs against
240/6.81 = 35.2 µs uncoded; 2⁴⁰ × 15.65 ps = 17.2 s; 20 ns × c = 6.0 m. The
re-worded claims from deviations 4 and 6 are true and pinned. The one claim that is
not true of the engine is Important 1.

**4. Fixtures.** `tests/fixtures/lesson-hashes.json` +2 lines
(`uwb-frame` `231ef59c`, `uwb-frame#0` `1acca385`) byte-equal to `uwb-intro`'s;
`tests/fixtures/uwb-record-hashes.json` +2 lines (`1ada81b1`, `98180104`) likewise.
Nothing else changed in either file; both hash suites pass.

**5. Bilingual.** Both shape tests walk every `L10n` (> 50 strings each), require a
non-empty `zh` and require `zh !== en` for anything holding two consecutive English
words. I read the ZH of `sources` and `deeper` against the EN line by line: same
clauses (Clause 16, §10.29, §10.32, §16.4.9), same FiRa 2 ms / 200 ms, same model
constants (−14 dBm, −93 dBm, 100 ps, 0.2 ppm, wall delay), same 40-bit-vs-32-bit
statement, same 17.2 s, ±20 ppm → 40 ns → 20 ns → six metres, same 9 µs. No fact
appears on one side only (the ZH adds one clarifying clause at `uwb-intro.ts:123`
— "计数只能取整" — which is true and pinned).

**6. Copyright.** No lifted standard prose anywhere, `sources` included: the
provenance bullets are descriptions of what a clause contains, and the term glosses
are original plain-language lines. The closest approach is "The RMARKER is defined
as the first chip after the SFD in §10.29.1.1" (`uwb-frame.ts:135`) — a one-line
statement of a definition, not reproduced text. Acceptable.

**7. Files.** Exactly the brief's list — `src/course/uwb/uwb-intro.ts`,
`src/course/uwb/uwb-frame.ts` (new), `src/course/curriculum.ts` (the one
`COURSE_ORDER` line), `src/course/lessons.ts` (import + `AUTHORED` entry),
`tests/course/uwb-intro.test.ts`, `tests/course/uwb-frame.test.ts` (new),
`tests/course/readability.test.ts` (the one `MIGRATING` line, `uwb-intro` removed
and `uwb-frame` correctly not added), `tests/fixtures/lesson-hashes.json` — plus
`tests/fixtures/uwb-record-hashes.json` under the controller's ruling. No stray edit.

## Strengths

- The moved tests arrived **stronger, not equal**: `uwb-frame.test.ts:167` now pins
  the three facts the re-worded outcome rests on (PSDU last, shorter than SYNC,
  shorter than STS, under a fifth of the airtime) instead of the false "smallest
  field" the brief asked for, and `:153` pins the uncoded 35.2 µs that the new
  sentence contrasts against. Deviation 4 is the right call, honestly reported.
- `uwb-frame.test.ts:53` deep-equals both of the new lesson's scenarios to
  `uwb-intro`'s builder. That is what makes the two identical fixture pairs a proof
  rather than a coincidence, and it will fail loudly if anyone gives `uwb-frame` its
  own scene later.
- Every assertion is measured against a real `Simulation` run or an engine export
  (`src/uwb/phy.ts`, `clock.ts`, `ranging.ts`, `position.ts`, `frameFields.ts`) —
  no re-typed constants, no mocks. `uwb-intro.test.ts:242` even builds a scratch
  1 m placement to distinguish `ceil` from `round`, which the lesson's own two
  distances cannot.
- Citation discipline is real: the only `§`/`Clause` tokens in either lesson body
  are inside the Units table's "Where" cells; everything else is in `sources`.
- The picture sections carry **zero** numeric quantities in both languages, well
  under the contract's two-per-paragraph, which is what the spec was reaching for.

## Issues

### Critical (Must Fix)

None.

### Important (Should Fix)

**1. `src/course/uwb/uwb-frame.ts:79` (EN) and `:80` (ZH) — "everything after it is
the message" is false.** The picture's closing block says: *"The RMARKER is the
first chip after the SFD ends. Everything before it is there so that both radios can
agree where 'here' is; everything after it is the message."* The engine's layout
(`src/uwb/frameFields.ts:311–319`) is SYNC | SFD | **[RMARKER]** | STS gap | STS |
STS gap | PHR | PSDU, and the lesson's own pinned table (`uwb-frame.ts:89–107`)
shows 1.026 + 65.641 + 1.026 + 19.487 µs of STS gaps, STS and PHR *after* the
73.269 µs RMARKER offset and before the 37.179 µs PSDU. So roughly 87 µs of what
follows the RMARKER is explicitly not the message — and the lesson defines "the
message" as the PSDU two blocks earlier (`:71–72`). The sentence also contradicts
the lesson's own watch block (`:63`, "the sequence in the middle, then the header
and, right at the end, the message") and undercuts the outcome it is meant to
support. A reader finishes this lesson believing the STS precedes the RMARKER.
Fix: say what actually follows, in both languages — e.g. EN *"…everything after it
— the unforgeable sequence, the header and the message — is what the frame has to
say."*; ZH *"…它之后的，是那段无法伪造的序列、头部，以及消息。"* Re-run
`npx vitest run tests/course` (word counts have 9 words of headroom in `uwb-intro`
only; `uwb-frame` sits at 1275/1300, so a short rewrite is safe).

### Minor (Nice to Have)

**2. `tests/course/uwb-frame.test.ts:50` — the "first `watch` inside the first three
picture blocks" ruling is not pinned for `uwb-frame`.** `uwb-intro.test.ts:56–59`
pins it (`findIndex(watch) < 3`); the frame test only asserts `some(kind ===
'watch')`, which `readability.test.ts` already covers. The lesson satisfies the rule
today (the watch is block 3 of 6) but nothing holds it there. Copy the two lines
from `uwb-intro.test.ts`.

**3. `src/course/uwb/uwb-intro.ts:21` — the CAUTION header understates the budget.**
It says the lesson "sits within forty of that ceiling"; the measured value is
1291 of 1300, i.e. **9 words**, which is what the implementer's own report states.
The header is the guardrail the next editor reads; make it say nine, and add that
`lessonMinutes` is already **exactly 20** (measured), so the study-time ceiling bites
before the word ceiling if an `observe` or `tryThis` item is added.

**4. `tests/course/uwb-intro.test.ts:166`, `:182`, `:226` — comment quotes no longer
match the lesson.** `:182` quotes "The timeline is drawn on a 1 ns grid; the ranging
underneath runs 64 times finer", `:166` quotes "One chip at 499.2 MHz | 2.003 ns" and
"One RCTU (2⁻⁷ of a chip)", `:226` quotes a sentence with "and RX_START on the
anchor's is at 17 ns" — the rewritten lesson says each of these differently
(`uwb-intro.ts:141`, `:135–138`, `:190`). The quoted sentence is what links a pin to
the prose it guards; stale quotes make the next reader doubt the pin is still the
right one. Re-quote from the new text.

**5. `src/course/uwb/uwb-frame.ts:126` — the experiment's numbers are pinned only in
the other lesson's test file.** 15.650 ps, 0.299792458 m/ns, 1070 RCTU and 5.02 m are
pinned at `tests/course/uwb-intro.test.ts:312`, which carries a comment pointing
forward to this experiment; `uwb-frame.test.ts` has no pointer back. Add a one-line
comment in `uwb-frame.test.ts` naming the file and test that pins them, so the frame
lesson's pins are discoverable from its own test file. (The implementer's Concern 4 —
that this experiment reads oddly in a frame-anatomy lesson — is a real placement
question for the controller, not a defect: the brief put it here.)

**6. `src/course/uwb/uwb-frame.ts:123` vs `:63` — the two reading directions
disagree.** The watch block says "Read the coloured strip from left to right"; the
observation says "read the segments right to left". Both work, but nothing tells the
reader why the direction flipped. Either say why ("start from the end: the PSDU is
the last segment") or make them agree.

**7. Two qualitative comparisons carry no pin.** `uwb-intro.ts:44` — "a wall or a
hand costs more signal than ten metres of air" (the brief's verbatim `why`; ~20 dB
over a decade of range against a typical wall's few-to-fifteen dB, so it is arguable
rather than wrong) and `uwb-frame.ts:22` — "far longer than a Wi-Fi acknowledgement"
(true, and cheaply pinnable against the engine's ACK airtime, unlike the first).
Neither is a numeric token, so no rule is broken; the second is worth a one-line pin
since the engine can answer it.

**8. First use inside `picture` leans on `why` for two of `uwb-intro`'s four terms.**
`UWB` first appears in the picture at `:88` ("A UWB radio does the opposite: its
pulses are so short…") and `anchor` at `:92` ("the anchor answers in the next slot")
— neither is glossed *inside* `picture`; both are explained in `why` (`:44`,
"Ultra-wideband… one anchor, one phone") and in `terms`. The spec's "first use" rule
is written about `picture`. This reads fine and I would not block on it, but the
novice reader's verdict on "anchor" is the one that should settle it.

**9. Deviation 5 leaves a question posed in `numbers` and answered only in
`deeper`.** `uwb-intro.ts:129` ends "the correction had nothing to correct — yet it
moved the answer 7 cm", and the mechanism (0.2 ppm → 0.4 ns → half on the range) now
lives in the collapsed `deeper` block at `:146`. That is a legitimate use of `deeper`
under the spec (no quiz depends on it) and it bought the word budget, but the main
path now raises a puzzle it does not resolve. One clause in `numbers` pointing at
"Going deeper" would close it — at a cost of ~8 of the 9 remaining words, so it may
have to wait for the word-budget ruling.

## ⚠️ Cannot verify from this diff

- **Rendering.** `uwb-intro` is the first lesson ever rendered with `terms`, two
  `watch` call-outs, a four-block `deeper` and a four-bullet `sources`; vitest runs
  in node, so `CoursePanel`'s `<details>`, `needs` links and watch load/jump buttons
  are covered only by `tsc` and the build. The implementer says the same (Concern 2).
  Controller: one pass on the dev server before the learner reads it.
- **ZH prose quality.** Facts and parity I verified; whether the Chinese reads as
  written-not-translated is the novice reader's seat, and the implementer reports it
  has had no second pair of eyes (Concern 3).
- **`tests/course/uwb-position.test.ts:332`** still requires the phrase "2.1 cm of
  range-noise sigma" inside `lessonProse(uwbIntro)`, which walks `{ body, observe,
  tryThis, quiz }`. The sentence now lives in `observe` (the controller's ruling) and
  the test passes, but the helper needs to walk `lessonBlocks` when `uwb-position`
  migrates, or the same constraint will distort that lesson too. Carry it into the
  `uwb-position` brief.
- **The full suite and `npm run build`** were run by the implementer (126 files /
  1892 tests, build 3.02 s), not by me; I ran the two suites I was asked for plus
  `tsc`. `tests/ui` is under concurrent edit by the AMP implementer, so a clean
  whole-suite result should be re-confirmed by the controller after both land.
