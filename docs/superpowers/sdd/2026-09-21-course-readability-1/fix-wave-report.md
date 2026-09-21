# Step-1 fix wave — report

Branch `feat/uwb-ranging`, worktree `.claude/worktrees/feat-link-2g`, one commit on top of
`10dffd8`. Work order: `branch-review.md` (I1–I5, M1–M13, A1–A12); contract:
`docs/superpowers/specs/2026-09-21-course-readability-design.md`.

## Gates

| command | result |
|---|---|
| `npx vitest run tests/course tests/ui tests/engine/lesson-hashes.test.ts tests/engine/uwb-record-hashes.test.ts` | 46 files, 1004 passed |
| `npx vitest run` (full) | **128 files, 1966 passed**, 55 s, output pristine |
| `npx tsc -b --noEmit` | clean |
| `npm run build` | clean (only the pre-existing > 500 kB chunk notice) |
| fixtures | `tests/fixtures/lesson-hashes.json` and `uwb-record-hashes.json` **untouched** (no line added, none needed) |

## Budgets, before and after

Both measured with the amended `lessonWords` (A5), so they are comparable; the review's table
(1291 / 1270 / 1288 / 1285) was the old count, which charged every counter value as four words.

| lesson | picture ≤ 650 | numbers ≤ 350 | practice ≤ 400 | total | cap |
|---|---|---|---|---|---|
| uwb-intro | 542 → **469** | 296 → **269** | 356 → **256** | 1194 → **994** | 1000 (track opener) |
| uwb-frame | 721 → **632** | 217 → **208** | 324 → **316** | 1262 → **1156** | 1300 |
| amp-intro | 553 → **460** | 383 → **259** | 307 → **279** | 1243 → **998** | 1000 (track opener) |
| amp-ppdu | 644 → **633** | 265 → **312** | 347 → **313** | 1256 → **1258** | 1300 |

The dump's own lines (`npx tsx scripts/lesson-dump.ts <id> en`, last line of each):

```
uwb-intro: picture 469/650 · numbers 269/350 · practice 256/400 · total 994 (994 words, 15 min)
uwb-frame: picture 632/650 · numbers 208/350 · practice 316/400 · total 1156 (1156 words, 15 min)
amp-intro: picture 460/650 · numbers 259/350 · practice 279/400 · total 998 (998 words, 15 min)
amp-ppdu: picture 633/650 · numbers 312/350 · practice 313/400 · total 1258 (1258 words, 15 min)
```

`lessonMinutes` fell from 20 to 15 for uwb-intro; the other three were already 15.

## A. Rules and test

**A1 / I2 — Tier 1 admission.** `tests/course/readability.test.ts` now builds the known set in
one place, `knownFor(l)`: the baseline, this lesson's `terms`, and the `terms` of every migrated
earlier lesson in the same track **or** with `MODULES[o.module].tier === 0`. `needs` is
unchanged (still `radio-primer` / `frame-anatomy` only). `NAV` and `CTS` in `amp-intro` now have
a legal owner the moment Tier 1 migrates.

**A5 — what a word is.** `lessonWords` is now `lessonBudget(l).total`; the walk moved into
`src/course/readability.ts` as `wordsIn`, which counts a language-neutral cell (`en === zh`) and
a formula body as **one** word each and counts `terms[].term`. That retires the third copy of
the bilingual walk (**M7**). Two tests recompute words independently and were brought to the same
rule, with a comment saying so: `tests/course/tier1-roles-stack.test.ts` (the only independent
count in the suite — `tests/course/lessons.test.ts` uses `lessonWords` itself, so the study-time
test needed no change).

**A4 — section budgets.** `lessonBudget(l)` in `readability.ts` returns
`{ picture, numbers, practice, total }` (`picture` = why + outcomes + terms + picture;
`practice` = observe + tryThis + quiz; an unmigrated `body` lands in `total` alone). The contract
test asserts ≤ 650 / ≤ 350 / ≤ 400, `total === lessonWords(l)`, 500 ≤ total, and
`total ≤ firstOfTrack(l) ? 1000 : 1300`. The lesson tests and the dump print the same four counts.

**A2 — numbers prose.** New test: every `paragraphTexts(l.numbers)` item is ≤ 90 EN words,
≤ 170 ZH characters, ≤ 4 quantities per language, and every acronym in it is either known or
`definedInPlace`. The exemption rule, stated in the function's doc comment and pinned in
`readability-rules.test.ts`: a token is defined where it is used when, in **either** language of
the same paragraph, it is (a) inside parentheses — `Single-sided two-way ranging (SS-TWR)`,
`（SS-TWR）`; (b) followed by a parenthesis opening a gloss — `ACWE (the window exponent)`; or
(c) preceded by a determiner and one to four lower-case words — `its window exponent ACWE`.

**A3 — density.** `densityTexts(blocks)` is `paragraphTexts` minus the items of a `steps` block
(the citation rule still reads them); `firstTermUses(blocks, terms)` says which terms debut in
each paragraph. The contract test asserts ≤ 2 new terms and ≤ 4 distinct acronyms per picture
paragraph.

**A6 — observe and try-this.** ≤ 60 EN words and ≤ 6 quantities per item, both languages.

**A7 / I4 — deeper.** The citation check now covers `paragraphTexts(l.deeper ?? [])`; no other
rule touches `deeper`.

**Unit tests (RED first).** `tests/course/readability-rules.test.ts` gained three describes:
the word count (language-neutral cell, formula body, `Term.term`, functions skipped), the three
section budgets with `deeper`/`sources` excluded, and density + definition-in-place. RED for the
suite as a whole: `npx vitest run tests/course/readability.test.ts` failed **13 tests** across
all four lessons before any lesson was touched (numbers-prose quantities in amp-intro/uwb-frame/
amp-ppdu, SS-TWR unintroduced in uwb-intro, the three density pile-ups, the observe caps, and
four budget overruns) and passes now.

## B. Store and panel (I3 / A12)

`courseLoadedFor: string | null` in `src/ui/store.ts`, set by
`loadCourseScenario(sc, lessonId?)` and cleared everywhere `courseLoaded` is cleared (both
`setMode` branches, `adoptCourseScenario`). `CoursePanel.tsx` passes `lesson.id` at all three
call sites (main load, each variant, the watch call-out) and computes
`loaded = courseLoaded && courseLoadedFor === lesson.id`, which now gates the call-out's
load-vs-jump button, the Load/Reload label and the jump list. `App.tsx` still reads plain
`courseLoaded` for `simActive` — a scene is on screen whichever lesson it belongs to.

New `tests/ui/store-course.test.ts` (node-only, Player mocked as `store-history.test.ts` does),
4 tests: nothing loaded at rest; **load A then select B → not loaded for B, still loaded for A,
and loading B flips both**; a variant is still that lesson's scene; leaving course mode and
`adoptCourseScenario` forget the lesson.

## C. The four lessons

**I1 — the Fridge tag's own log line.** `amp-intro` observe 2 now quotes
`“slot 2: acknowledged”` (EN and ZH), with "its draw"/"its outcome" making the ownership
explicit. Pinned beside the ABOC line in `amp-intro.test.ts`:
`fmtRecord(results(rs, 'tag-1#2g')[0]) === 'tag-1#2g slot 2: acknowledged'`, plus
`fmtRecord(aboc(rs, 'tag-1#2g')[0])`; the Door tag's `slot 1: acknowledged` is kept as
`results(rs, 'tag-2#2g')[0]` so the old line is still guarded, now against the named record
rather than "the first record of that type" (A9-v).

**I5 — "Where the losses come from".** One sentence ("Not weak signal: twice in ten rounds both
tags drew the same number and spoke together") plus a two-row table — round · slot · collision
at · Ack names · tag learns at — carrying 201 216 / 201 556 µs and 502 972 / 503 312 µs. The
ACWE/ACW arithmetic moved to `deeper` as "The draw, in the trigger's own terms", beside "Why
neither tag ever sits a round out". Every pin moved with it; one was **added**: the table's
Round column is pinned as `coll.map(r => Math.floor(r.t / 100 ms) + 1) === [3, 6]`.

**Trims, lesson by lesson** (nothing lost its pin; nothing pinned was deleted):

- *uwb-intro* (opener, −198): the picture paragraph "Loud is not the same as near" deleted — it
  restated `why` ("a distance built on loudness inherits every obstacle") at 57 words; the
  "Why 17 ns and not 16.68?" paragraph became a two-row table (5 m | 16.678 ns | 17 ns;
  20 m | 66.713 ns | 67 ns) plus one sentence, which is also where the try-this's 66.713 ns went;
  the range line became a `formula` so its five quantities left the prose; the third quiz
  question (the 1 ns grid) deleted — it asked about the timeline rather than about ranging, and
  the claim it tested is still in `numbers` and still pinned (`the engine rounds the flight UP`,
  `the 1 ns timeline grid is 64 ranging ticks wide`). The 2.1 cm phrase `uwb-position` quotes
  back ("2.1 cm of range-noise sigma") is kept verbatim — its cross-lesson pin caught my first
  rewording.
- *uwb-frame* (−106, picture 721 → 632): **M1** the six-acronym recap is now a `steps` block
  ("The frame in order", six one-line items) with the two "why that edge" sentences left as the
  paragraph; **M2** every Field cell states its chips (`SYNC, 64 preamble symbols × 508 chips =
  32 512 chips`, SFD 4064, STS 32 768, PHR 9728, PSDU 18 560), so "Two words, two sizes" was
  deleted and the carried SFD-508 nit dissolves — the products and `chipsToNs(SFD)` are now
  pinned; the RMARKER offset became a formula, the poll-vs-response comparison a table, and the
  PSDU coding a formula + note (was 71 w / 9 q and 58 w / 9 q).
- *amp-intro* (opener, −245): "What a tag never does" (the three absent record types) moved whole
  to `deeper`; the link-margin paragraph became a `deeper` table (6 quantities in prose → cells);
  the slot-boundary arithmetic became a formula + note; the standard's name for a tag moved from
  `terms` to `sources`; **M9** the EN/ZH quantity drift is gone (ZH 几十微瓦 → 几微瓦 in both
  surviving sites; the third site went with the deleted clause).
- *amp-ppdu* (+2 net; sections all inside budget): **M3** one table — segment · 250 kb/s · who
  reads it, eight rows including the 16/4/12 legacy split — now serves both the formula note
  (68 w / 9 q → 25 w / 4 q) and the observe item ("check each segment against the table above",
  9 q → 0); the strip recap in the watch call-out became a `steps` block, which is what the
  density rule's three-terms-in-one-paragraph failure was about; the rate paragraph split in two;
  the Ack's 330 µs and the 1 Mb/s round became formulas, which is where the try-this's ten
  quantities (318 / 328 / 1670 / 1.67 % / 1620) now live, all still pinned.

**M5** — the three CAUTION word-budget headers are gone, replaced by a short note naming the
section budgets and the dump command.

## Minors

| # | state |
|---|---|
| M1, M2, M3, M4, M5, M7, M9, M11 | **done** (M4: all four lesson tests now assert the spec's bounds plus `prose ≤ window`, nothing else; M11: the `deeper` `<details>` got `sources`' margin) |
| M8 | **done in part.** `amp-coexist`'s "The first two lessons gave the tags a channel to themselves" was false after the split (three lessons precede it) → "The AMP lessons before this one"; `amp-slots`' "Lesson 1" and the two "unchanged from lesson 1" → "the first AMP lesson" (EN and ZH), with the quoting test comments updated. These are unmigrated lessons that step 3 rewrites; only the false/ambiguous references were touched. |
| M6 | **carried** — `docs/superpowers/specs/2026-09-18-zero-to-hero-curriculum-design.md` is outside this task's file list. |
| M10 | **carried** — it asks for a spec paragraph ("novice-read territory"), a docs change. |
| M12 | **carried by the plan** — `tests/course/kit.ts` is step 2 Task 1 (A9-ii). |
| M13 | **carried by the plan** — a step-5 planning decision. |
| M11's second half (lesson-index rows are `div onClick`) | **carried** — pre-existing, and the review marks it so. |

## D. Tooling (A10)

`scripts/lesson-dump.ts`: `npx tsx scripts/lesson-dump.ts <lessonId> <en|zh>` prints the title,
`why`, outcomes, the `needs` titles, the terms, the picture with `[WATCH → jump label]` markers,
the numbers with tables as `a | b | c` rows and formulas indented, `--- deeper ---`, the
variants and jumps, observe, experiments, the quiz with `*` on the answer, `--- sources ---`,
and finally the budget line. It is built on `lessonStrings` / `paragraphTexts` / `lessonBudget`,
so it prints exactly what the contract test measures. `npx tsx --version` → **tsx v4.23.15**
(a devDependency already), so no fallback was needed; `npx vite-node` runs it too, and the doc
comment says so. `scripts/` is outside `tsconfig.json`'s `include`, so `tsc -b` does not see it;
README documents no scripts, so the doc comment is the only documentation (as instructed).

## Declines / judgement calls worth a look

1. **uwb-intro lost its third quiz question** and **one picture paragraph**; **amp-intro** moved
   a picture paragraph and a numbers table into `deeper`. With 1000 words for an opener and
   ~250 of them spoken for by observe + try-this + quiz, trimming alone did not reach the cap:
   uwb-intro needed −198 and amp-intro −245. In each case I cut repetition or moved depth, never
   a mechanism sentence, and every claim kept a pin. If the controller would rather keep the
   quiz question, the 1000-word cap needs revisiting instead.
2. **No claim was deleted, so no test was deleted.**
3. `picture` sits at 632 and 633 of 650 for the two second lessons — 17 words of slack each. A
   future sentence there will have to buy its space.
4. The `definedInPlace` exemption is deliberately mechanical and may exempt a token that merely
   appears in parentheses. It is stated in the comment and pinned; no lesson relies on it except
   uwb-intro's SS-TWR heading.
