# Whole-branch review — course readability, step 1

Range `70f44de → 070f21a` on `feat/uwb-ranging`, course commits only (926e10e, 6bc18be,
fc5195d, 46ee066, fe99177, d7078c7, a850db8, 070f21a). Read-only. Spec:
`docs/superpowers/specs/2026-09-21-course-readability-design.md`; plan:
`docs/superpowers/plans/2026-09-21-course-readability-1.md`; ledger: `progress.md` beside this file.

## Verdict: NEEDS A FIX WAVE (short)

Four small fixes before this merges as the reference for 45 lessons: one stated-vs-simulated
drift in `amp-intro`'s observe list (I1), the readability test admitting fewer Tier 1 lessons
than the spec says and so carrying a step-5 time bomb (I2), `deeper` unchecked for citations
although the spec forbids them there (I4), and one `numbers` paragraph in the reference AMP
lesson that reads exactly like the prose the programme exists to remove (I5). I3 (the watch
call-out's "Jump there" against another lesson's recording) can ride with step 2, which is when
it first bites. Nothing here is architectural; the contract, renderer and test design are sound.

Gates I ran (worktree, head 070f21a, tree clean):

| command | result |
|---|---|
| `npx vitest run tests/course tests/engine/lesson-hashes.test.ts tests/engine/uwb-record-hashes.test.ts` | 33 files, 819 tests passed; **wall 35.6 s** (vitest Duration 33.96 s; tests 143.9 s summed across workers, collect 53.5 s) |
| same + `tests/ui/i18n.test.ts`, default reporter (per-file timings below) | 34 files, 826 passed, 33.55 s |
| `npx tsc -b --noEmit` | clean, 9.8 s |
| `npm run build` | clean (only the pre-existing > 500 kB chunk notice), 13.1 s |

Measured out of band (`vite-node`, `lessonWords` / `readability.ts`):

| lesson | words | min | why | outcomes+terms | picture | numbers | observe | tryThis | quiz |
|---|---|---|---|---|---|---|---|---|---|
| uwb-intro | 1291 | 20 | 79 | 96 | 367 | 393 | 110 | 62 | 184 |
| uwb-frame | 1270 | 15 | 63 | 119 | 539 | 225 | 83 | 48 | 193 |
| amp-intro | 1288 | 15 | 77 | 82 | 394 | 428 | 86 | 44 | 177 |
| amp-ppdu | 1285 | 15 | 63 | 117 | 464 | 294 | 94 | 58 | 195 |

All four sit within 0.7–2.3 % of the 1300 ceiling; language-neutral table cells and formula
bodies account for 39–113 of those words.

## What step 1 does well

The two `why` openings are the best paragraphs in the course: a problem the reader already has
(a phone's RSSI distance; a sticker with no battery), stated in the reader's own words, with not
one digit. The pictures teach — I read all four lessons end to end in EN and then in ZH as the
learner would, and in every case I knew what the thing was and why before a single number
arrived; the ZH is written, not translated (响，不等于近; 这么穷的一台射频; 抽这一下，就是标签全部的"思考"),
and the fix rounds visibly took the beginner reader's stop points seriously (the right-to-left
slip, chip vs symbol, AMP-Sync/AMP-SIG/U-SIG spelled out). The split rule was honoured to the
byte (both fixtures additions only, hashes equal, and the new tests *prove* scenario identity
with `toEqual`), every one of the 33 + 33 old pins is accounted for and several were
strengthened (the exact PPDU segment order, the STS-between-gaps layout, the 16/4/12 strip),
and the mechanism sentences I checked against the engine are all true. `readability.ts` as a
pure module the test and a future authoring tool share, `paragraphTexts` as the prose seam and
`lessonStrings` as the bilingual seam, are the right cuts; the renderer keeps unmigrated
lessons byte-identical (only React keys changed) and the `<details>` / `<button>` choices give
keyboard access for free. The ledger's rulings are traceable and the CAUTION headers, whatever
else they show, tell the next author the truth.

## Findings

### Critical

None.

### Important

**I1. `amp-intro` observe item pairs the Fridge tag's draw with the Door tag's outcome line.**
`src/course/amp/amp-intro.ts:196` — "Step a round through the inspector with the Fridge tag
selected. The log prints the draw as “ABOC 1 of [0, 3] → slot 2”, the outcome as “slot 1:
acknowledged”". Measured on the lesson's own scene: the Fridge tag (tag-1) prints
`tag-1#2g ABOC 1 of [0, 3] → slot 2` and then `tag-1#2g slot 2: acknowledged`; `slot 1:
acknowledged` is the Door tag's line. The pin (`amp-intro.test.ts:416`) asserts
`fmtRecord(AMP_RESULT[0])`, which is tag-2's record, so the test passes while the sentence sends
a learner following the Fridge tag looking for a line that is not theirs. Same in ZH. This is
the stated-vs-simulated class the memory file warns about, in the reference lesson.
Fix: quote `slot 2: acknowledged` (EN and ZH) and pin
`fmtRecord(results(rs, 'tag-1#2g')[0]) === 'tag-1#2g slot 2: acknowledged'` next to the ABOC line.

**I2. The acronym rule's Tier 1 admission is narrower than the spec, and `TIER1_BASELINE`
hides it until step 5.** Spec "Words" (b): a token may be introduced by "a lesson that precedes
it in COURSE_ORDER and is in the same track **or in Wi-Fi Tier 1**". The test
(`tests/course/readability.test.ts:112`) admits only `radio-primer` and `frame-anatomy`, while
`TIER1_BASELINE` (`:31`) stands in for "the terms of radio-primer and frame-anatomy" yet
contains `SIFS DIFS NAV CW CCA EIFS RTS CTS` — channel-access words those two lessons will never
teach. `amp-intro`'s picture leans on `NAV` and `CTS` (`amp-intro.ts:77`, `:81`), `amp-ppdu`'s
numbers on `U-SIG`, `amp-intro.deeper` and `amp-ppdu.quiz` on `OFDM`, all from the baseline.
When step 5 migrates `radio-primer` and `frame-anatomy`, the bookkeeping test forces the baseline
to be deleted, and `amp-intro` fails on `NAV`/`CTS` with no legal place to put them (its `terms`
are capped at four). Fix now, one line: `sameTrack = trackOf(o) === trackOf(l) || (trackOf(o)
=== 'wifi' && MODULES[o.module].tier === 0)`; and in the step-5 plan a table assigning every
baseline word to the Tier 1 lesson whose `terms` will own it (NAV → `nav`, CTS/RTS → `hidden`,
SIFS/DIFS/EIFS → `ifs`, CW → `backoff`, CCA → `decode-thresholds`…), with the deletion test
asserting each ex-baseline word is now in some Tier 1 lesson's `terms`.

**I3. `courseLoaded` is global, so a watch call-out offers "Jump there" into another lesson's
recording.** `src/ui/store.ts:138-146` — `selectLesson` does not touch `courseLoaded`;
`CoursePanel.tsx:238-247` shows the load button only when nothing is loaded and otherwise the
jump button. Load `uwb-intro`, press Next twice: `uwb-sstwr` (once migrated, a different scene)
renders its call-outs with "⚡ Jump there", and the jump seeks the `uwb-intro` recording — a
misleading match or "not found". Today it is masked because the only adjacent migrated pairs
share a scene. The main Load/Reload button and the jump list have the same pre-existing flaw,
but the call-out is the contract's central device and sits in the prose. Fix (step 2 at the
latest): store `courseLoadedFor: string | null` (set by `loadCourseScenario(sc, lessonId)`), and
in the panel treat `loaded = courseLoaded && courseLoadedFor === lesson.id`; show the load button
otherwise (label "▶ Load and watch" is already right for both cases).

**I4. `deeper` is never checked for citations, though the spec allows them only in `sources`
and `numbers` table cells.** `readability.test.ts:32` `CITED_FIELDS` omits `deeper`, and the
`numbers`-prose line at `:134` does not cover it. All four `deeper` blocks are clean today (I
ran `CITATION` over `paragraphTexts(l.deeper)`), but the task-3 reviewer had to scan by hand,
which is what the test is for. Fix: add
`for (const s of paragraphTexts(l.deeper ?? [])) expect(CITATION.test(s.en) || CITATION.test(s.zh), s.en).toBe(false)`
beside the `numbers` line (do not add `deeper` to the acronym or length rules — depth is
allowed to be dense).

**I5. One `numbers` paragraph in the reference AMP lesson is the old prose.**
`amp-intro.ts:143` "Where the losses come from": 100 words, 13 numeric quantities, in one
paragraph — "its window exponent ACWE is 2, so ACW = 2² − 1 = 3, and the ABOC drawn from 0, 1,
2, 3 picks slot ABOC + 1. Twice in ten rounds both draw the same number — the slots ending at
201 216 µs and 502 972 µs. … each tag learns at 201 556 µs and 503 312 µs". The beginner reader
flagged the algebra-before-idea order; the fix round put the plain sentence first and left the
rest. Nothing in the test objects, because `numbers` prose has no caps (see A2). Since steps
2–7 will copy this file, fix it here: a two-row table (round · slot · collision at · Ack
names · tag learns at) with one sentence above it, and the ACWE/ACW arithmetic into `deeper`
next to "Why neither tag ever sits a round out", where it is already half-said. Word budget is
not a problem: the table cells replace the prose.

### Minor

**M1.** `uwb-frame.ts:82` "Where the stamp goes" puts all six of the lesson's acronyms in one
sentence ("so the frame runs SYNC, SFD, the stamp, then the STS between its two gaps, the PHR and
the PSDU") — a recap, but the exact pile-up the audit named, and the test cannot see it (A3).
Fix: make the order a `steps` block (six one-line items), keep the paragraph for the two
sentences about why that edge.

**M2.** `uwb-frame.ts:70` "Two words, two sizes" (75 words) exists only to reconcile a table
that counts SYNC/SFD/PHR in symbols and STS in chips. Put chips in every Field cell ("SYNC, 64
symbols × 508 chips = 32 512 chips") and the paragraph can go; the ledger's carried nit (the SFD
row not restating 508) disappears with it.

**M3.** `amp-ppdu.ts:99` the formula note is a 68-word, 9-quantity field-by-field budget, and
the second observe item (`:150`) repeats the same eight numbers as a strip. One table
(segment · µs · who reads it) in `numbers` serves both; the observe item then just says "read the
strip and check it against the table".

**M4.** Four lesson tests, four word windows: totals 900–1300 / 800–1300 / 500–1300 / 500–1300
and "prose" 600–1000 / 600–1000 / 450–1000 / 500–1100 (`uwb-intro.test.ts:79`,
`uwb-frame.test.ts:83`, `amp-intro.test.ts:82`, `amp-ppdu.test.ts:74`). Each task invented its
own. One convention (A9) before 41 more files do the same.

**M5.** The CAUTION headers (`uwb-intro.ts:18`, `amp-intro.ts:18`, `amp-ppdu.ts:13`) document a
budget crisis, not the lesson. They are honest and should stay until A4 lands, then go.

**M6.** `docs/superpowers/specs/2026-09-18-zero-to-hero-curriculum-design.md:17-18` still says
"15–25 minutes per lesson" and "5 minutes per observe item and 5 per try-this"; the new spec says
≤ 20 and the code says 2 / 4 (`curriculum.ts:153-155`). The pointer landed; its neighbours did
not.

**M7.** `curriculum.ts:lessonWords` is a third copy of the bilingual walk (`lessonStrings` in
`readability.ts` is the second, the pre-existing test walk the first). Express it as
`lessonStrings(l).map(s => s.en)` plus the `term` words. Also: a language-neutral cell such as
`336 207 494 656` counts as four words (56 words of uwb-intro's budget are N() cells, 57 more
are formula bodies); count each N() cell and formula body as one glance-word, or exclude them,
and say so in the spec.

**M8.** Neighbours made stale by the splits: `amp-slots.ts:41,49` "Lesson 1", `amp-coexist.ts:58`
"前两课" / `:88` "since lesson 1" (the ledger carries this to the AMP step); `uwb-position.ts:94`
"Lesson 1’s 2.1 cm" is still true (the observe item survived) — fine.

**M9.** EN/ZH quantity drift in `amp-intro`: EN "a few microwatts" (`:48`, `:77`, `:210`) vs
ZH "几十微瓦" (tens of microwatts). Localisation may rephrase; it may not change the number.

**M10.** Rule gaps the test knowingly leaves (record in the spec as "novice-read territory" so
nobody reopens them): `why` sentence count/length unenforced; `terms.plain` unchecked for
acronyms; `CITATION` misses `Table 16-5`, `Annex`, `Figure`, `TGbp`, `PDT`, `letter ballot`, and
`IEEE 802.11-2020` (protocol-name stripping eats it); lower-case jargon (envelope detector,
access function, crystal) is invisible by construction.

**M11.** `CoursePanel.tsx:325` the `deeper` `<details>` has no margin while `sources` (`:417`)
has `10px 0 4px`; lesson-index rows are `div onClick` (pre-existing, not keyboard-reachable).

**M12.** Test duplication: the ~70-line "lesson shape" block and the `memo`/`recs`/`ofType`/
`txs`/`ends` helpers are copied into each of the four files (and 5 copies of `recs` exist across
`tests/course`). See "Test-suite health".

**M13.** `firstOfTrack` will make `radio-primer` the Wi-Fi opener at step 5 and subject it to
"≤ 4 terms, no table in `picture`". A radio primer that cannot put dB / dBm / MHz in a table
until `numbers` may be fine, or may not; decide in the step-5 plan rather than discover it.

## Answers to the ten questions

1. **Contract.** Each of the four teaches; the shape serves the learner rather than adding
   ceremony — `outcomes`, `needs` and the call-outs cost ~100 words and repay it. Three spec
   rules are producing worse prose and want amendment (A2, A3, A4 below): the single 1300 total
   made the ceiling a target (all four at 1270–1291) and pushed density into `numbers`, where no
   cap applies (I5, M3); the acronym rule is per-lesson, not per-paragraph, so a six-acronym
   sentence passes (M1); and the ≤ 2-quantity rule did *not* force vagueness anywhere — the
   pictures with zero numbers are the best pages in the course. The acronym gloss rule produced
   no awkward glosses; "the STS — pulses generated from a key only the two radios hold" is the
   pattern working.
2. **The test.** It would catch the learner's three complaints as they appeared in the old
   openings: provenance first (`why` + `picture` citation checks), numbers everywhere in the
   picture (≤ 2), unintroduced acronyms in why/picture/outcomes (EN and ZH). Still passing:
   an acronym pile-up in one paragraph; `numbers`/`observe`/`tryThis`/`quiz` prose of any
   length and any number count (uwb-intro's try-this carries 8 quantities, a quiz option 9);
   citations in `deeper` (I4); lower-case jargon; a 300-word `why`. Maintainability: `MIGRATING`
   shrinking with an asserting test is the right bookkeeping; `TIER1_BASELINE` is the risk (I2);
   `describe.each` with the guard is fine; `paragraphTexts` and `lessonStrings` are the right
   seams — the remaining duplication is the *assertion* loops in the lesson tests, not the walk.
3. **Truth.** Verified against the engine myself: tags decode nothing but DL AMP PPDUs and key
   their slot on Acks (`ampSta.ts:91-110`, `onRxCorrupt → giveUp`); a Wi-Fi radio has no detect
   floor for the UL PPDU and can only hold CCA by energy (`channel.ts:495`, `:792-818`); only
   receive stamps carry noise and the correction scales `Treply` by the estimated offset
   (`uwb/device.ts:20`, `ranging.ts:9`); RMARKER = first chip after the SFD, 73 269 ns
   (`uwb/phy.ts:36`); the response leaves at the top of slot 1 (pinned). Every number in both
   AMP `numbers` sections traces to a pin in `amp-intro.test.ts` / `amp-ppdu.test.ts`, including
   the 138 µs, the 7-octet answer, 3.5× content / < 1/6 airtime and the 16/4/12 strip. The one
   false sentence is I1 (an observe item, not `numbers`).
4. **Pins.** None lost. Old `uwb-intro.test.ts` (33 its) → 27 + 16; old `amp-intro.test.ts`
   (33) → 25 + 17; each old `it` is present or moved, several strengthened; the only dropped
   assertions are the two 9 µs-slot lines whose sentence no longer exists (recorded in
   `amp-intro.test.ts:150`). New pins: scenario identity (both splits), first watch < 3,
   segment orders, the uncoded 35.2 µs, 44 µs ACK vs 197.6 µs poll.
5. **Suite health.** Wall 33.6–35.6 s for 34 files; the four migrated tests cost 63 / 25 /
   176 / 144 ms and `readability.test.ts` 55 ms — the AMP and UWB scenes are cheap even at 1 s.
   The wall is set by four pre-existing Wi-Fi files (`quoted-timestamps` 26.0 s, `tier1-project`
   24.0 s, `tier1-bianchi` 21.2 s, `bianchi-vs-sim` 16.3 s) plus per-file collect (~1.6 s each).
   Projection at 45 lessons: +≈ 0.2 s per UWB/AMP lesson, +≈ 1.5 ms per lesson in readability,
   Wi-Fi rewrites reuse existing tests — wall stays ≈ 35–40 s. A shared *memoised* fixture is
   not due for time; a shared *kit* is due for duplication (M12): `tests/course/kit.ts` exporting
   `runLesson(lesson, { untilNs, variant })` (per-file memo, keep vitest isolation), `ofType`,
   `txs`, `ends`, `countAt`, and `lessonShapeSuite(lesson, { module, needs, terms, proseMax })`
   — a `describe` factory replacing the 70-line block. Do it in step 2's Task 1 and have the
   four step-1 tests adopt it in the same task.
6. **i18n and panel.** The eight strings exist in both tables and the parity test passes; the
   `needs` buttons are real `<button>`s with the target's title; `<details>/<summary>` gives
   native keyboard toggling; the watch call-out's two states are right except for I3; unmigrated
   lessons render exactly as before (diff shows only the key string changed). `course.why`
   dropped from the spec was the right ruling.
7. **Split rule.** `tests/fixtures/lesson-hashes.json`: exactly four added lines, `amp-ppdu` =
   `amp-intro` (f1e44e52 / 94328b86), `uwb-frame` = `uwb-intro` (231ef59c / 1acca385).
   `uwb-record-hashes.json`: two added lines equal to `uwb-intro`'s (1ada81b1 / 98180104); the
   plan said "unchanged" and the ledger's ruling (additions for a new id sharing a scene) is
   correct — amend the plan template to say so.
8. **Docs.** README paragraph is accurate and in the right place; the curriculum spec pointer
   landed but its neighbours are stale (M6). The plan's advisory windows vs the spec's binding
   ones: the plan template should change (A9) — the windows were written for the prose the
   reader meets before the simulator, and `lessonWords` counts 350–400 words of observe/try/quiz
   on top, which is why every task "overran" its window while meeting the spec.
9. **Copyright.** No lifted standard prose. Field names, clause numbers and values only;
   glosses ("start-of-frame delimiter: a short pattern announcing that the beat ends here") are
   the author's; `sources` bullets cite by number and characterise, never quote.
10. **Plans for steps 2–7.** Below.

## Spec and plan amendments for steps 2–7

Twelve, each with the sentence that shows the need.

**A1 (spec "Words" (b), test `:112`).** Admit every earlier Wi-Fi Tier 1 lesson's `terms`, as
the spec already says; keep `needs` restricted to `radio-primer` / `frame-anatomy`. Evidence:
`amp-intro.ts:77` "and so is a NAV, the countdown a station keeps" — glossed inline as the spec
asks, yet legal only via a baseline word the step-5 deletion test will remove. Step-5 plan
carries the baseline-word → owning-lesson table.

**A2 (spec "Numbers"/"Length", new rule for `numbers` prose).** A `p`/`watch`/`note`/`caption`
inside `numbers` is ≤ 90 EN words / ≤ 170 ZH characters and ≤ 4 numeric quantities; anything
denser is a `table` or a `formula`. Acronyms in `numbers` prose obey the acronym rule, with an
exemption for tokens defined in that paragraph's own sentence ("its window exponent ACWE").
Evidence: `amp-intro.ts:143` (100 w / 13 q), `uwb-frame.ts:105` (71 w / 9 q), the unintroduced
`SS-TWR` heading at `uwb-intro.ts:104` and `ACWE`/`ACW` at `:143`. Add the check to
`readability.test.ts` beside the `picture` rule; it is `paragraphTexts(l.numbers)` again.

**A3 (spec "Words", new density rule).** At most two of a lesson's `terms` make their first
`picture` appearance in the same paragraph, and no `picture` paragraph carries more than four
distinct acronyms; ordered recaps go in a `steps` block, which is exempt from the density cap
(not from the citation rule). Evidence: `uwb-frame.ts:82` (six in one sentence);
`amp-ppdu.ts:66` introduces AMP-Sync, AMP-SIG and padding in one call-out — legible only because
each has an appositive.

**A4 (spec "Length and pace").** Replace the single 500–1300 total with section budgets that
sum to it: `why` + `outcomes` + `terms` + `picture` ≤ 650, `numbers` ≤ 350, `observe` +
`tryThis` + `quiz` ≤ 400, total ≤ 1300; a track's first lesson ≤ 1000 total. Evidence: all four
lessons at 1270–1291 with `numbers` at 393–428 in the two openers, and three CAUTION headers.
The point of the programme is that a first lesson is *short*; the spec as written lets it be as
long as the last.

**A5 (spec "Words", `lessonWords`).** State what counts: an N() cell (en === zh) and a formula
body count one word each; `terms.term` counts. Evidence: 113 of uwb-intro's 1291 words are
counter values and formula lines nobody reads at 150 wpm.

**A6 (spec "Numbers", `observe`/`tryThis`).** An observe or try-this item ≤ 60 EN words and
≤ 6 numeric quantities; the rest belongs in `numbers`. Evidence: `uwb-intro.ts:198` try-this
(62 w / 8 q: "16.678 ns becomes 66.713 ns" is a numbers-section fact), `amp-ppdu.ts:154`
(9 q), `amp-intro.ts:195` (7 q).

**A7 (spec "Citations", test `:32`).** Add `deeper` to the citation check (I4). No other rule
applies to `deeper`.

**A8 (spec "Chinese").** A quantity stated in words must agree across languages ("a few" ≠
"几十"); the novice read checks it, the task review pins it. Evidence M9.

**A9 (plan template, every step).** (i) Content-contract word windows are for the *prose*
count `lessonWords({...l, observe: [], tryThis: [], quiz: []})`, stated as such; each lesson test
asserts the spec's bounds plus `prose ≤ <window max>`, nothing else — one convention, not four.
(ii) The per-lesson test's shape block is `lessonShapeSuite(...)` from `tests/course/kit.ts`
(step 2 Task 1 creates it and migrates the four step-1 tests). (iii) The fixture step says
"`lesson-hashes.json` and, for UWB, `uwb-record-hashes.json`: additions only, equal to the first
half's". (iv) Each task's file list names the `.body!` sites it retires (the 36 sites in 14
files are all in tests of lessons that will be rewritten; `tier1-*` 3, `uwb-*` 33), so step 7's
type change is a no-op. (v) The observe/try-this items of a rewritten lesson are re-pinned
against the *record the sentence names* (node, slot), not the first record of that type (I1's
lesson).

**A10 (plan template, review loop).** The novice reader reads a rendered text dump, not the TS
source: add `scripts/lesson-dump.ts` (EN or ZH, main path then collapsed sections, tables as
rows) built on `lessonStrings`/`paragraphTexts` — the authoring tool `readability.ts`'s header
already anticipates. Run the novice read first and let one stop point open the fix round, as the
spec orders; running it in parallel with the task review (as tasks 2 and 3 did) is fine only if
the ruling still waits for it.

**A11 (plan batching).** Steps 2 and 4 each carry six to eight lessons. Batch by scene, not by
count: lessons sharing a scenario builder (uwb-intro/uwb-frame; the four TWR lessons on lesson
2's scene; amp-slots/amp-aboc) go to one implementer in one task, because the split rule and the
shared-scene pins are where the cross-file mistakes live. Two tasks per step in parallel at most,
each with its own fixture lines; `readability.test.ts`'s `MIGRATING` edits serialised as now.

**A12 (code, step 2 Task 1).** `courseLoadedFor` in the store (I3), and `firstOfTrack`'s
"no table in picture" decision for `radio-primer` written into the step-5 plan (M13).

## Carry list

From the ledger, still open: `trackOf` keys off the module-7 literal (derive from a `track`
field when AMP migrates); `amp-coexist` "前两课" / "lesson 1" references (AMP step); the SFD row
of the "Two words, two sizes" table not restating 508 (dissolves with M2); shared test fixtures
(now M12 / A9-ii); the `.body!` collateral (A9-iv).

New from this review: I3 (step 2), M2, M3, M6, M7, M8, M10, M11, M13; A2/A3/A4/A5/A6 need a
spec edit and a `readability.test.ts` change before step 2's lessons are written, or they will
be written to the current, looser rules and re-fixed.

## Per-file test timings (default reporter, for the record)

quoted-timestamps 25 983 ms · tier1-project 24 021 · tier1-bianchi 21 204 · bianchi-vs-sim
16 339 · uwb-coexist 8 771 · lesson-claims 8 477 · uwb-nba 7 547 · lessons 7 546 ·
uwb-record-hashes 6 863 · tier1-roles-stack 5 312 · amp-coexist 3 329 · uwb-position 1 283 ·
uwb-contention 1 215 · tier1-retries-queues 1 129 · uwb-dl-tdoa 883 · uwb-ul-tdoa 824 ·
uwb-mms 599 · uwb-dstwr 540 · tier1-radio-primer 448 · tier1-decode-thresholds 316 ·
amp-slots 253 · uwb-aoa 232 · **amp-intro 176 · amp-ppdu 144** · uwb-blocks 137 · uwb-sstwr 93 ·
tier1-frame-anatomy 92 · **uwb-intro 63 · readability 55** · widgetModel 26 · **uwb-frame 25** ·
i18n 10 · readability-rules 8. `lesson-hashes.test.ts` alone: 5.0 s, of which tests 3 ms
(it hashes scenario definitions, not runs).
