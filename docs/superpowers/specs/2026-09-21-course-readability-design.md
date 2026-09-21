# Course readability — a zero-to-hero contract for every lesson

Date: 2026-09-21. Supersedes the "Audience and pace → Density" line of
`2026-09-18-zero-to-hero-curriculum-design.md` ("dense lessons are fine; main
text keeps § citations and exact µs numbers"). Everything else in that spec
still holds, in particular: EN + ZH, deterministic scenarios, every empirical
claim pinned by a test, unbuilt lessons hidden.

## Why

The learner is one motivated engineer with a basic Wi-Fi MAC background. Reading
the AMP and UWB tracks as they stand, they found the lessons "extremely
difficult to follow". Their words fix the target: *professional level means
depth, not how hard the text is to read.* The audit that followed found the
problem is structural, not local:

- Every AMP and UWB lesson opens with provenance — standard clauses, draft
  numbers, a list of model constants — before it says what the thing is or why
  anyone should care.
- Density is flat across tiers: the first UWB lesson reads like the last.
  Sentences introduce three or four new terms at once (RMARKER, STS, SFD, RCTU)
  and carry a number in nearly every clause.
- No on-ramp: no lesson says which lessons it assumes, what the reader will be
  able to do afterwards, or when to go and look at the simulator.
- Length: AMP lessons run ≈ 2 000 words, UWB ≈ 1 700, some Tier 1 lessons
  ≈ 1 800. The pre-existing Wi-Fi Tier 2 lessons predate the curriculum contract
  and share the habits.

Decisions taken with the learner on 2026-09-21: revise the whole course for
readability **before adding more features**; **split** dense lessons into
shorter ones rather than hiding depth behind collapsed sections; UWB and AMP
lessons assume **Wi-Fi Tier 1 basics only** (the radio primer and frame anatomy
lessons).

## The shape of a lesson

Depth stays. It moves to after understanding. Every lesson, old and new, has
this shape, in this order, rendered by the course panel with these section
labels (EN / ZH from `i18n.course`):

| # | Section | Field | Rule |
|---|---|---|---|
| 1 | Title | `title` | as today; no lesson numbers |
| 2 | *(no label)* | `why: L10n` | 2–4 plain sentences: the problem, who has it, what the lesson shows. No digits, no citations, no acronym that is not already known (see "Words") |
| 3 | After this lesson you can | `outcomes: L10n[]` | 2–4 bullets, each a verb phrase ("read a Poll's timestamp off the timeline") |
| 4 | You need | `needs: string[]` | lesson ids; rendered as clickable titles. Empty only for `radio-primer` |
| 5 | New words | `terms: Term[]` | 0–6 entries `{ term, plain: L10n }`: the word as the standard writes it, then one plain-language line. Every new acronym or protocol noun used in 2 or 6 must be here or in an earlier lesson's `terms` |
| 6 | *(headings inside)* | `picture: Block[]` | the mechanism in plain words. Paragraph ≤ 90 EN words / ≤ 170 ZH characters, one idea each, at most **two** numeric quantities per paragraph, no citations. May contain `watch` blocks |
| 7 | Now the numbers | `numbers: Block[]` | tables, formulas, widgets and short paragraphs carrying the exact values. Citations allowed **only inside table cells** (a "where" column) — never in running prose |
| 8 | Going deeper *(collapsed)* | `deeper?: Block[]` | optional; professional depth that is not needed to pass the quiz (derivations, corner cases, standard history) |
| 9 | Load / variants / jumps | `scenario`, `variants`, `jumps` | as today |
| 10 | Observe | `observe` | as today |
| 11 | Experiments | `tryThis` | as today |
| 12 | Quiz | `quiz` | as today; the answer must be derivable from 2–7 alone |
| 13 | Where these numbers come from *(collapsed)* | `sources: L10n[]` | the provenance: standard clauses, draft and contribution numbers, which values are model choices and why. This is where the old opening paragraphs go |

The field `body` is removed. `lessonWords` (study time) walks `why`, `outcomes`,
`terms`, `picture`, `numbers`, `observe`, `tryThis`, `quiz` — not `deeper`, not
`sources` — so the stated minutes are the minutes of the main path.

### New block kinds

- `{ kind: 'watch'; text: L10n; jump?: number }` — a call-out inside `picture`:
  "Load the simulation and press play: the tag answers in the second slot."
  Rendered with an inline button that loads the lesson's scenario (or jumps to
  `jumps[jump]` once loaded). At least one `watch` per lesson.
- `deeper` and `sources` render as `<details>` elements, closed by default,
  with the section label as `<summary>`.

Existing kinds (`p`, `formula`, `table`, `list`, `steps`, `widget`) are unchanged.

### Words

- **Acronym rule.** A token of two or more upper-case letters/digits (any length: `RMARKER` counts) (`STS`, `SFD`,
  `RCTU`, `OOK`, `TXOP`, `A-MPDU`, `L-SIG`) appearing in `why` or `picture` must
  be one of: (a) in this lesson's `terms`; (b) in the `terms` of a lesson that
  precedes it in `COURSE_ORDER` and is in the same track or in **any Wi-Fi
  Tier 1 lesson** (`needs` stays restricted to `radio-primer` / `frame-anatomy`;
  the acronym admission is wider than the prerequisite rule on purpose — a
  one-line reminder in the picture is enough for a Tier 1 word); (c) in the
  global baseline `KNOWN_WORDS` (units and everyday words: Wi-Fi, AP, STA, MAC,
  PHY, dB, dBm, µs, ns, ms, s, MHz, GHz, kb/s, Mb/s, ID, RF, OK, CPU, IoT, GPS,
  USB). The test walks the course in order and keeps the running set.
- **Tokens.** An acronym token starts with two or more capitals and may
  continue with letters, digits and hyphens, so mixed-case tails stay whole
  (`DL-TDoA`, `SS-TWR`); MHz/GHz/kHz are known words. The rule reads `why`,
  `outcomes`, `picture`, `numbers` prose, table cells, `observe`, `tryThis` and
  `quiz` (same-sentence definitions exempt).
- **Prerequisite closure.** Every term a lesson uses in `picture` is introduced
  in that lesson or in a lesson inside the transitive closure of its `needs`
  (a test walks the closure), so `needs` is honest.
- **Numbers layout.** Two heading-less paragraphs never sit side by side in
  `numbers`: a run of facts is a table, a formula, or carries a heading.
- **Density.** At most two of a lesson's `terms` make their first `picture`
  appearance in the same paragraph, and no `picture` paragraph carries more than
  four distinct acronyms. An ordered recap goes in a `steps` block, which is
  exempt from the density cap (not from the citation rule).
- **First use.** Inside `picture` the first sentence that uses a term from
  `terms` reads naturally without the reader having memorised the table: write
  "the STS — the timing sequence a spoofer cannot forge —" once, then `STS`.
- **Numbers.** In `picture`, at most two numeric quantities per paragraph (a
  numeric token is a number with an optional unit; ordinal words and "one"/"two"
  do not count). Exact values, derivations and tables belong in `numbers`.
- **Numbers prose.** A paragraph, watch text, formula note or widget caption
  inside `numbers` is ≤ 90 EN words / ≤ 170 ZH characters and carries at most
  **four** numeric quantities; anything denser is a `table` or a `formula`.
  Acronyms in `numbers` prose obey the acronym rule, except a token defined in
  that same sentence ("its window exponent ACWE").
- **Observe and experiments.** An `observe` or `tryThis` item is ≤ 60 EN words
  and carries at most six numeric quantities; the rest belongs in `numbers`.
  Each item is pinned against the record it names (the node and the slot), never
  against "the first record of that type".
- **Quantities in words** agree across languages ("a few" is not 几十); the
  novice read checks it, the task review pins it.
- **Citations** (`§`, `Clause`, `IEEE Std`, `P802.`, `11-2x/nnnn`, `15-2x/nnnn`,
  `PM-`, `D0.`, `D1.`, "draft", "TBD", "model choice"; ZH 草案 / 标准正文 /
  模型取值) appear only in `sources` and in table cells of `numbers`. The check
  covers `deeper` too; no other rule applies to `deeper` — depth may be dense.
- **Digits in `why`.** None, except inside a protocol name (`802.11bp`,
  `802.15.4`, `Wi-Fi 7`); the same names do not count as numeric quantities
  in `picture`.
- **Record names** in the UI's own spelling (`TX_START`, `UWB_TS`) are not
  acronyms for the rule: they are what the reader sees on screen. Tokens that
  contain an underscore are exempt, and so is any frame name the log prints
  (`NBPOLL`, `UWBRSF`, `UWBBLINK`) — the exempt list is the engine's own
  `FRAME_KINDS`, upper-cased, not a hand-typed copy. The novice read still
  judges them.
- **Before Wi-Fi Tier 1 is migrated** the readability test seeds the known set
  with a `TIER1_BASELINE` list standing in for the `terms` of `radio-primer`
  and `frame-anatomy`; the list is deleted, with a test asserting so, when
  those two lessons migrate.
- **Chinese** is written, not translated: the same rules apply to the ZH text
  (digits, citations, paragraph length), and a reviewer reads the ZH side on its
  own.

### Length and pace

- Main path (`lessonWords`) between **500 and 1 300** English words, with
  section budgets that sum to it: `why` + `outcomes` + `terms` + `picture`
  ≤ 650; `numbers` ≤ 350; `observe` + `tryThis` + `quiz` ≤ 400. **A track's
  first lesson is ≤ 1 000 in total** — the point of the programme is that the
  first lesson is short. Above the budgets the lesson is split (below,
  "Splitting").
- What `lessonWords` counts: every EN string a learner reads on the main path,
  except that a language-neutral cell (`en === zh`: a number, a symbol, a
  protocol name) and a formula body count **one** word each; `terms[].term`
  counts. Counter values and formula lines are not read at 150 words a minute.
- Study time ≤ 20 minutes per lesson (the `lessonMinutes` formula is unchanged).
- `needs` of a UWB or AMP lesson name only lessons of the same track or
  `radio-primer` / `frame-anatomy`. Wi-Fi concepts a UWB/AMP lesson leans on
  (SIFS, NAV, a TXOP, OFDM, a legacy preamble) get a one-line reminder where
  they appear — the reader may have arrived from Tier 1 straight away.
- The first lesson of each track has `terms` of at most four entries and a
  `picture` with no table.

### Zero-to-hero per track

Each track climbs from "I have never heard of this radio" to professional depth
inside the track, not by assuming the other tracks:

- **Wi-Fi** already has that gradient (Tier 1 → 4); it needs the structure, the
  word rules and a few splits.
- **UWB** gets a true first lesson — a radio that sends clicks instead of tones
  and therefore can measure time — with no numbers at all in the picture, and
  moves the frame anatomy (SYNC/SFD/STS/PHR/PSDU, RMARKER) into a second lesson.
- **AMP** gets a true first lesson — a tag with no battery cannot listen, so
  the AP must ask — and moves the PPDU anatomy and its airtimes into a second.

## Splitting

A lesson over 1 300 main-path words, or carrying two ideas a reader would want
to stop between, becomes two (rarely three). Rules:

- The **first** half keeps the original id (its scenario is unchanged, so
  `tests/fixtures/lesson-hashes.json` is additions only). New ids are added to
  `COURSE_ORDER` right after it and to the fixture.
- Both halves may share one scenario builder; a half that needs a narrower
  scene gets a variant, not a new builder, unless the spec of that track says
  otherwise.
- Every pinned claim keeps its test; the test moves with the sentence.

Planned splits (the plan may adjust a boundary with a ledger ruling; it may not
merge two of these back):

| Today | Words | Becomes |
|---|---|---|
| `uwb-intro` | 1 705 | `uwb-intro` "A radio that measures time" (clicks, why timing not throughput, the poll/response idea) + `uwb-frame` "What a ranging frame is made of" (fields, RMARKER, the 197.628 µs table) |
| `uwb-position` | 1 570 | `uwb-position` (three distances make a point) + `uwb-geometry` (why the same error grows with geometry; the anchor layout experiments) |
| `uwb-mms` | 1 743 | `uwb-mms` (why one long frame cannot survive; fragments and re-assembly, the picture) + `uwb-mms-numbers` "Fragments, budgets and the 12 dB" (RSF/RIF, the energy rule, ratios) |
| `uwb-nba` | 1 755 | `uwb-nba` (a narrowband helper radio: what it says and when) + `uwb-nba-coexist` (listen-before-talk, the 6 GHz overlap) |
| `amp-intro` | 2 037 | `amp-intro` "A tag with no battery" (why it cannot listen; who is who; the AP asks) + `amp-ppdu` "A frame a tag can hear" (legacy preamble + OOK, the airtime formula, padding) |
| `amp-slots` | 2 009 | `amp-slots` (trigger → slot → answer → ack) + `amp-aboc` (choosing a slot at random, collisions, the size of the window) |
| `amp-coexist` | 2 027 | `amp-coexist` (what Wi-Fi sees of a tag round; NAV) + `amp-protection` (protected vs unprotected rounds; the cost) |
| `tier1-project` | 1 802 | `tier1-project` (the brief and the plan) + `tier1-project-review` (reading the results, the write-up) |
| `frame-anatomy` | 1 688 | `frame-anatomy` (header, addresses, what each field is for) + `frame-anatomy-bytes` (the byte budget, the decoder, aggregation hooks) |

Every other lesson is rewritten in place. The pre-existing Wi-Fi Tier 2 lessons
move out of `src/course/lessons.ts` into `src/course/tier2/<id>.ts` (one file
per lesson, like Tier 1, UWB and AMP) as part of their rewrite; `lessons.ts`
keeps only the assembly.

## Reviewing a lesson

Two reviews per lesson batch, in this order:

1. **Novice read.** A reviewer briefed as "you know the Wi-Fi Tier 1 lessons and
   nothing else about this radio" reads the lesson top to bottom, in EN, then in
   ZH, and reports: the first sentence they could not follow and why; every word
   they did not know that the lesson did not explain; every paragraph carrying
   more than one idea; whether `why` answers "what problem, for whom"; whether
   the quiz is answerable from the main path. One finding of the first kind is a
   fix round.
2. **Task review** as usual: pinned claims, contract tests, byte-identical
   scenarios, EN/ZH parity, no lifted prose.

The novice reader reads a **rendered text dump**, not the TypeScript source:
`scripts/lesson-dump.ts <id> <en|zh>` prints the main path then the collapsed
sections, tables as rows, built on `lessonStrings` / `paragraphTexts`. The
novice read runs first; one stop point opens the fix round. Running it in
parallel with the task review is fine only if the ruling still waits for it.

## Plan template for steps 2–7 (learned from step 1)

- **Word windows** in a content contract are for the *prose* count
  `lessonWords({ ...l, observe: [], tryThis: [], quiz: [] })` and say so; each
  lesson test asserts the spec's bounds plus `prose ≤ <window max>` — one
  convention, not four.
- **Shape tests** come from one kit: `lessonShapeSuite(lesson, { proseMax })` in
  `tests/course/kit.ts` (migrated, ≤ 20 min, budgets, jumps found, bilingual
  walk, first watch within the first three picture blocks, no citation in
  deeper). Step 2 Task 1 creates it and migrates the four step-1 tests to it.
- **Fixtures** step reads: "`lesson-hashes.json` and, for UWB, `uwb-record-
  hashes.json`: additions only, equal to the first half's".
- **`.body!` retirement**: each task's file list names the `.body!` sites it
  retires, so step 7's type change is a no-op.
- **Batch by scene, not by count**: lessons sharing a scenario builder go to one
  implementer in one task (the split rule and the shared-scene pins are where
  the cross-file mistakes live). At most two tasks per step in parallel, each
  with its own fixture lines; `MIGRATING` edits serialised.
- **Shared simulation fixtures**: lesson tests that run the same scene share a
  memoised run (`tests/course/kit.ts`), so the course suite's wall time does
  not grow with the lesson count.
- **`courseLoadedFor`** in the store: a watch call-out offers "Jump there" only
  when *this* lesson's scene is the one loaded.
- **Step 5** carries a table assigning every `TIER1_BASELINE` word to the Tier 1
  lesson whose `terms` will own it (NAV → nav, CTS/RTS → hidden, SIFS/DIFS/EIFS
  → ifs, CW → backoff, CCA → decode-thresholds, …); the deletion test asserts
  each ex-baseline word is in some Tier 1 lesson's `terms`.

## Tests

`tests/course/readability.test.ts`, run over every lesson in `COURSE_ORDER`:

- structure: every field present and well-formed; `needs` ids exist and precede
  the lesson; a UWB/AMP lesson's `needs` obey the track rule; ≥ 1 `watch`;
  `terms` ≤ 6 (≤ 4 for a track's first lesson); the first lesson of a track has
  no table in `picture`.
- words: acronym rule with the running known set; ≤ 2 numeric quantities per
  `picture` paragraph; paragraph caps EN/ZH; citation tokens absent from `why`,
  `picture`, `outcomes`, `terms`, `observe`, `tryThis`, `quiz`, and from
  `numbers` prose (table cells excepted).
- length: 500 ≤ `lessonWords` ≤ 1 300; `lessonMinutes` ≤ 20.
- `why` has no digits.

During the migration the test carries an explicit `MIGRATING: string[]` list of
lesson ids still in the old shape (they are skipped, with a test asserting the
list only shrinks — each task removes its ids). The list is empty when the last
task lands, and the test then also asserts `body` no longer exists on the type.

Existing suites keep their job: `lesson-claims.test.ts`, `quoted-timestamps
.test.ts`, per-lesson tests, jump-target coverage, study-time check,
`lesson-hashes.json`.

## Files

- `src/course/lessonKit.ts` — `Lesson` fields above; `Term`; `Block` gains
  `watch`; helper `lesson({...})` builder that fills defaults and validates.
- `src/course/curriculum.ts` — `lessonWords` walks the new fields; `KNOWN_WORDS`;
  `trackOf(lessonId)`; `COURSE_ORDER` additions.
- `src/course/CoursePanel.tsx` — renders the 13 sections; `<details>` for
  `deeper` and `sources`; `watch` call-out with inline load/jump; `needs` as
  links.
- `src/ui/i18n.ts` — `outcomes`,
  `needs`, `terms`, `numbers`, `deeper`, `sources`, `watchLoad`, `watchJump`.
- `src/course/tier1/*.ts`, `src/course/tier2/*.ts` (new), `src/course/amp/*.ts`,
  `src/course/uwb/*.ts` — the lessons.
- `tests/course/readability.test.ts` (new); per-lesson tests updated as pins move.
- `docs/superpowers/specs/2026-09-18-zero-to-hero-curriculum-design.md` — the
  superseded line replaced by a pointer to this spec. `README.md` course
  section: one paragraph on the lesson shape.

## Order of work

1. Contract, renderer, i18n, the readability test with the full `MIGRATING`
   list, and the two new first lessons (`uwb-intro`, `amp-intro`) written to
   the contract as the reference pair. The learner reads these two before the
   rest is migrated — one fix round on the reference pair recalibrates the
   whole programme cheaply.
2. UWB Tier 1 (`uwb-frame`, `uwb-sstwr`, `uwb-dstwr`, `uwb-blocks`,
   `uwb-position` + `uwb-geometry`).
3. AMP (`amp-ppdu`, `amp-slots` + `amp-aboc`, `amp-coexist` + `amp-protection`).
4. UWB Tier 2 and 3 (`uwb-coexist`, `uwb-contention`, `uwb-dl-tdoa`,
   `uwb-ul-tdoa`, `uwb-aoa`, `uwb-mms` + `uwb-mms-numbers`, `uwb-nba` +
   `uwb-nba-coexist`).
5. Wi-Fi Tier 1 (10 lessons, two splits).
6. Wi-Fi Tier 2 (18 lessons into `tier2/`).
7. `MIGRATING` empty, `body` removed from the type, docs.

Each step merges to `main` on its own so the learner sees the improvement as
it lands. New lessons written after step 1 (the backscatter lesson of AMP
slice A2, and everything after) are written to this contract from the start.

## Out of scope

- New simulator features (the AMP slices A2 T4–T5, A3–A5 and UWB one-to-many
  resume after step 7, or after step 3 for the backscatter lesson if the
  learner asks).
- Audio, video or illustrations beyond the existing widgets.
- A reading-level metric (Flesch or similar); the rules above are the metric.
