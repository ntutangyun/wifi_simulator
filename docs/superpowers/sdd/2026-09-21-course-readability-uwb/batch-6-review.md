# Batch 6 review — uwb-nba and uwb-nba-coexist

Commit under review: `df0006f` (rewrite of `uwb-nba` and its split into
`uwb-nba-coexist`). Files: `src/course/uwb/uwb-nba.ts`,
`src/course/uwb/uwb-nba-coexist.ts`, `tests/course/uwb-nba.test.ts`,
`tests/course/uwb-nba-coexist.test.ts`.

## Verdicts

- **uwb-nba: READY**
- **uwb-nba-coexist: READY**

## Counts by severity

- Blocker: 0
- Major: 0
- Minor: 1
- Nit: 3

---

## Part 1 — beginner read

Persona background confirmed against source: `UWB`, `anchor`, `RMARKER`, `RCTU`
(uwb-intro); `SYNC`/`SFD`/`STS`/`PHR`/`PSDU`/`chip` (uwb-frame); `block`/`round`/
`slot`/`RSTU` (uwb-blocks); `overlap`/`SIR`/`energy detect` (uwb-coexist). The old
`uwb-mms` body (`git show a6fb16c:src/course/uwb/uwb-mms.ts`) already establishes
the narrowband-control-radio idea and the exact Poll/Response/Report sizes
(12/12/13 B, 576/576/608 µs) that `uwb-nba` reuses, so the persona is not
starting cold on the split radio's role — only on the message-by-message detail,
which is what the lesson supplies.

### uwb-nba · en
- First unfollowable sentence: none.
- Unexplained words: none in the main path; all of `narrowband`, `NB`, `Poll`,
  `Response`, `Report` are glossed in `terms` before use.
- Multi-idea paragraphs: "Why a slow radio is the right radio" (`deeper`) folds
  two separate points into one paragraph — the link-budget argument (250 kb/s vs.
  a 499.2 MHz ranging channel, −100 dBm sensitivity vs. 10 dBm Tx) and the
  battery-life argument (wideband front end sleeps between blocks). It's in
  `deeper`, off the main/quiz path, so **Nit**, not a blocker.
- Contradictions: none found. The 576/608 µs numbers, the 12.000/12.608 ms
  timestamps, and the "eight fragments, 34.5/32.0 dB" figures are internally
  consistent between `the picture`, `now the numbers`, and `observe`.
- Opening states problem and for whom: yes — "A ranging device measures time; it
  does not negotiate... Doing that on the wide ranging radio would spend its
  airtime on words instead of on measurements," aimed at a reader who already
  knows the wide radio does the timing.
- Simulator prompt early with a preview: yes — the `[WATCH → the narrowband poll
  that opens the round]` call-out is the 4th block of `the picture` and says what
  you'll see ("jump to the first narrowband message... a round is arranged on the
  small radio first and only then measured on the wide one").
- Quiz answerable from the main path: yes, both questions (which radio carries
  the reply time; why 576 µs for 12 bytes) are answered in `the picture` and `now
  the numbers` before `deeper`.
- Datasheet-register sentences: none in the narrative; the message-size table and
  the `(10 + 2 + 2 × octets) × 16 µs` formula are correctly confined to `now the
  numbers`.
- "draft"/document-number wording outside `sources`: none found — `P802.15.4ab`,
  `D5.0`, and the two TG4ab contribution numbers appear only in `sources`.

### uwb-nba · zh
- First unfollowable sentence: none.
- Translated-sounding sentences: none stood out as calques; the zh prose reads as
  independently composed (e.g. "论字节更慢，可它反而更便宜" and "论字节慢，正是换来
  ……的代价" are idiomatic, not mirrored English syntax).
- Otherwise matches the English: same terms glossed, same quiz coverage, same
  early watch prompt, no draft/document wording outside `sources`.

### uwb-nba-coexist · en
- First unfollowable sentence: none.
- Unexplained words: none in the main path; `LBT`, `allow list`, `hop` are
  glossed in `terms` and reused consistently.
- Multi-idea paragraphs: "Counting what Wi-Fi gives up" (`deeper`) packs three
  distinct claims into one paragraph — the clear-channel-transition count (44 vs.
  0), the comparison to the wideband radio's much shorter reach, and the
  model-simplification caveat about the 9 µs instantaneous reading. It's in
  `deeper`, off the main/quiz path — **Nit**.
- Contradictions: none found. Cross-checked the LBT threshold arithmetic
  (−75 + 10·log10(2.5) = −71.02), the crossing-distance arithmetic (20 +
  10·log10(2.5/80) = 4.95, then 8.62 m from the indoor path-loss law), the
  15.07 m energy-detect reach, and the 10.95 % throughput-loss figure
  ((407.215−362.631)/407.215) — all self-consistent.
- Opening states problem and for whom: yes — "The little control radio has to
  live somewhere... In a room with a busy router that rule almost never lets the
  control radio speak — and a ranging session that cannot speak measures
  nothing."
- Simulator prompt early with a preview: yes — `[WATCH → the busy check that ends
  the block]` is the 3rd block of `the picture`, and the surrounding text says
  what you'll see ("the line gives the level it measured, the threshold... and
  what follows").
- Quiz answerable from the main path: yes. Q1 (why one distance in 1.3 s) is
  answered by "One refusal costs a block, not a message" plus the −63.72 dBm
  figure in `now the numbers`. Q2 (cost to Wi-Fi with the rule off) is answered
  by the 87-failures/10.95% figures, also in `now the numbers`, not only in
  `deeper`.
- Datasheet-register sentences: none in the narrative; formulas and the
  four-scene comparison table are confined to `now the numbers`.
- "draft"/document-number wording outside `sources`: none found.

### uwb-nba-coexist · zh
- First unfollowable sentence: none.
- Translated-sounding sentences: none read as calques; e.g. "先听并不能让一条消息
  变得无害，它只是让这样的消息变少" and "这笔差额由笔记本来付" both read as
  natural Chinese phrasing rather than mirrored English.
- Otherwise matches the English: same terms, same quiz coverage, same early watch
  prompt, no draft wording outside `sources`.

None of the findings above are blockers; both lessons state the problem and
audience up front, put the simulator prompt early with a preview, keep the quiz
inside the main path, and keep draft/document numbers confined to `sources`.

---

## Part 2 — pins and contract

### Test inventory diff, `a6fb16c:tests/course/uwb-nba.test.ts` → df0006f's two files

The old single file had 30 `it`s; the new files have 19 (`uwb-nba.test.ts`) + 24
(`uwb-nba-coexist.test.ts`) = 43, reflecting the split plus new assertions (e.g.
the two-anchor 34.5/32.0 dB margins, where the old file only pinned one anchor's
34.5 dB). Every old pin is present, moved, or strengthened:

- Scenario/variants schema, four corner anchors, the 10×8 m lab scene: kept once
  in `uwb-nba.test.ts` (`is the coexistence lesson's room...`,
  `places four corner anchors...`); `uwb-nba-coexist.test.ts` does not repeat the
  scene build, instead asserting `lessonShapeSuite(uwbNbaCoexist, { ...,
  sameSceneAs: 'uwb-nba' })` (line 64) and a same-scene check via the shared kit —
  confirmed by reading the test file header comment ("the two ids load the very
  same scenes").
- "block-3 identity" (`skippedBlocks(..., 'anchor-1')` / `'anchor-2'` both equal
  `[3]`, not just a count of skipped blocks) — pinned in
  `uwb-nba-coexist.test.ts:305-315`, unchanged from the old assertion.
- 576/608 µs enumeration (Poll 12 B, Response 12 B, Report 13 B; the
  `(10+2+2×octets)×16 µs` formula; 36/38 symbols) — pinned in
  `uwb-nba.test.ts:186-214`, unchanged.
- The quoted fix line (`"uwb-1 NB LBT busy on ch 200: -63.7 dBm ≥ -71.0 —
  skipping the block"`) — pinned in `uwb-nba-coexist.test.ts:331-343`
  ("the busy check, the line it prints, and the silence the anchors then
  report"), including the two anchor-timeout lines that follow it.
- "250 channels / 50 UNII-3 / 200 UNII-5", "wholly contains thirty-two, numbers
  186 to 217", and the default allow list `[3]` / 5733.75 MHz — all pinned in
  `uwb-nba-coexist.test.ts:209-264`.
- The four-scene comparison table (blocks skipped, tag distances, fixes for
  in-channel / outside / hopping / no-LBT) — pinned across
  `uwb-nba-coexist.test.ts:318-431`.
- 44 clear-channel transitions, 108 messages / 87 failures, 10.95 % throughput
  loss, 15.07 m reach, ~40 cm wideband reach, seven narrowband frames dying at
  the phone — all pinned, `uwb-nba-coexist.test.ts:444-536`.

Every number I found quoted in either lesson's prose has a matching assertion;
I did not find an unpinned number in the main path or in `deeper`.

`sameSceneAs` is used (`uwb-nba-coexist.test.ts:64`). `.body!` is gone —
`grep -rn "\.body!" tests/course/uwb-nba*.test.ts src/course/uwb/uwb-nba*.ts`
returns nothing. The old per-lesson "computed study time follows the formula...
15–25 minute target" test (with the boundary-case math for the 1724/1725-word
rounding edge) is absent from both new files; this matches the convention
already used by sibling recent lessons (`uwb-coexist`, `uwb-dl-tdoa`,
`uwb-ul-tdoa` also lack it), and the generic bound (≤20 minutes, `500-1300`
words) is still enforced by `tests/course/readability.test.ts:196-205` for every
lesson in `COURSE_ORDER`. Not a regression specific to this commit — **Minor**,
same as flagged in the batch-4 review, since the exact 15-minute floor for this
module is no longer independently asserted per lesson (a drop to, say, 10
minutes would only be caught by the shared ≤20 ceiling, not a floor).

### Test run

`npx vitest run tests/course/uwb-nba.test.ts tests/course/uwb-nba-coexist.test.ts tests/course/readability.test.ts`:
- `uwb-nba.test.ts`: 23 passed.
- `uwb-nba-coexist.test.ts`: 30 passed.
- `readability.test.ts`: 220 passed, 1 failed —
  `uwb-aoa: expected true to be false` in "every MIGRATING id is a real lesson
  still in the old shape." This names `uwb-aoa`, owned by the concurrent
  implementer, exactly the bookkeeping failure the task said to ignore.

### Mechanism spot-checks against `src/uwb/nb.ts` and `src/uwb/device.ts`

**uwb-nba:**
1. LBT threshold formula (`−75 dBm/MHz + 10·log10(2.5 MHz) = −71.02 dBm`) and the
   2.5 MHz channel width — confirmed in `src/uwb/nb.ts:126-131`
   (`NB_LBT_EDT_DBM_PER_MHZ = -75`, `NB_LBT_THRESHOLD_DBM = NB_LBT_EDT_DBM_PER_MHZ
   + 10 * Math.log10(NB_CHANNEL_MHZ)`).
2. The `(10 + 2 + 2 × octets) × 16 µs` airtime formula and 250 kb/s rate —
   confirmed in `src/uwb/nb.ts:23-31` (`NB_SYMBOL_US = 16`, `NB_SHR_SYMBOLS = 10`,
   `NB_PHR_SYMBOLS = 2`, and `nbPpduNs` computing exactly that sum).
3. 250 narrowband channels, default allow list `[3]` — confirmed in
   `src/uwb/nb.ts:63` (`NB_CHANNELS = 250`) and `:108` (`NB_DEFAULT_CHANNELS =
   [3]`).

**uwb-nba-coexist:**
1. "One refusal costs a block, not a message" — confirmed verbatim by the
   docstring at `src/uwb/device.ts:364-365` ("the draft's listen-before-talk rule
   is not per frame but per block — a busy check stops") and the discontinuation
   logic at `:1258-1319` ("no narrowband transmission for the [rest of the
   block]").
2. `nbLbtRequired` gating channel 200 as required and channel 3 as optional —
   confirmed in `src/uwb/nb.ts:136` and matches the "where listening first is
   optional" claim about the default allow list.
3. The busy check reads a single instantaneous power level against the fixed
   threshold (not a margin/SNR test) — confirmed by `this.ch.lbtBusy(this.id,
   m.nbChannel)` at `src/uwb/device.ts:1314`, matching the lesson's "The test is
   a power reading, nothing more."

## Findings by severity

**Minor (1):**
1. The per-lesson lower-bound study-time pin (old: `expect(lessonMinutes(...))
   .toBeGreaterThanOrEqual(15)` alongside the ≤25 ceiling and the exact
   1724/1725-word rounding-boundary check) is not present in either new test
   file. `tests/course/readability.test.ts` still enforces a shared ≤20-minute
   ceiling and a 500–1300 word band for every lesson, so nothing is currently
   wrong (both lessons dump at 20 minutes), but a future edit that shrank either
   lesson well below 15 minutes would not be caught by a lesson-specific floor.
   This matches the convention already adopted by `uwb-coexist`/`uwb-dl-tdoa`/
   `uwb-ul-tdoa`, so it is not a regression introduced by this commit — flagging
   for awareness only. Fix (optional): add
   `expect(lessonMinutes(l)).toBeGreaterThanOrEqual(15)` back per lesson if the
   module's 15-minute floor still matters.

**Nit (3):**
1. `src/course/uwb/uwb-nba.ts` (`deeper`, "Why a slow radio is the right radio"):
   mixes the link-budget argument and the battery-life argument in one
   paragraph. Fix: split into two sentences/paragraphs, e.g. end the paragraph
   after "...where a ranging fragment would not," and start a new one with "The
   device also gets to keep the wideband front end asleep..."
2. `src/course/uwb/uwb-nba-coexist.ts` (`deeper`, "Counting what Wi-Fi gives
   up"): packs the transition count, the wideband-reach comparison, and the
   model-simplification caveat into one paragraph. Fix: split the last sentence
   ("The model's simplification shows the other way too...") into its own
   paragraph or fold it into "How far the check can see" instead, where the
   model-caveat framing already lives.
3. (Informational, not a defect) Both zh translations read as independently
   composed rather than machine-translated; I did not find three sentences worth
   flagging as calques in either lesson, better than several prior batches in
   this series.

No blockers or major findings. Both lessons are internally consistent, every
number quoted in prose is pinned, the mechanism claims check out against
`src/uwb/nb.ts` and `src/uwb/device.ts`, and both test suites pass in full (the
one failure in `readability.test.ts` is the pre-flagged, unrelated `uwb-aoa`
bookkeeping issue from the concurrent implementer).
