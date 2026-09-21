# Task 1 report — the contract, the renderer and the readability test

Branch `feat/uwb-ranging`, worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`, base `70f44de`.

## What I built

### 1. `src/course/readability.ts` (new) — the pure rules

Tasks 2–3 do not import this directly; the tests do. Exports:

```ts
export const KNOWN_WORDS: ReadonlySet<string>   // 27 entries, upper-case: WI-FI AP STA MAC PHY DB DBM ID RF OK
                                                // CPU IOT GPS USB TX RX US EU CN LED PC TV QR I A AM PM
export const PROTOCOL_NAME: RegExp              // /(?:P?802\.1[15](?:\.\d)?[a-z]*|Wi-Fi\s?\d|Bluetooth\s?\d(?:\.\d)?)/g
export const CITATION: RegExp                   // see "Deviations" — one amendment to the brief's literal
export function acronyms(text: string): string[]
export function numericQuantities(text: string): number
export function enWords(text: string): number
export function zhChars(text: string): number
export function paragraphTexts(blocks: Block[]): L10n[]
```

`acronyms` strips protocol names, matches `/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*\b/g`, drops tokens under
two characters, tokens containing `_` and all-digit tokens, upper-cases, keeps first-use order, de-duplicates.
`numericQuantities` strips protocol names and counts `/\d(?:[\d,.]|\s(?=\d{3}\b))*/g`, so a typographic
thousands group ("336 207 494 656") counts once. `zhChars` counts `[\u3400-\u4dbf\u4e00-\u9fff]` only, so
full-width punctuation does not count. `paragraphTexts` returns, per controller ruling (c), the `text` of
`p` and `watch` blocks, `formula` notes and `widget` captions — never table cells, never formula bodies.

### 2. `src/course/lessonKit.ts` — the contract

- New block kind `{ kind: 'watch'; heading?: L10n; text: L10n; jump?: number }`.
- New `export interface Term { term: string; plain: L10n }`.
- `Lesson.body` is now **optional**; the eight new optional fields are
  `why?: L10n`, `outcomes?: L10n[]`, `needs?: string[]`, `terms?: Term[]`,
  `picture?: Block[]`, `numbers?: Block[]`, `deeper?: Block[]`, `sources?: L10n[]`.
- `export const isMigrated = (l: Lesson): boolean => l.why !== undefined`.

`src/course/lessons.ts` re-exports `Term` (type) and `isMigrated` (value) alongside the existing type re-exports,
so a lesson file may import either from `./lessonKit` (as the existing lessons do) or from `./lessons`.

### 3. `src/course/curriculum.ts` — the helpers

```ts
export function trackOf(l: Lesson): 'wifi' | 'amp' | 'uwb'   // module 7 → 'amp', else TIERS[MODULES[l.module].tier].track
export function lessonBlocks(l: Lesson): Block[]              // l.body ?? [...(l.picture ?? []), ...(l.numbers ?? [])]
export function lessonWords(l: Lesson): number                // now walks why, outcomes, terms, picture, numbers,
                                                              // body, observe, tryThis, quiz — never deeper or sources
```

`lessonMinutes` is unchanged and therefore follows the new word count automatically.

Note for Tasks 2–3: the walk collects `{en, zh}` objects, so a `Term`'s `plain` counts towards `lessonWords`
but its `term` (a bare string) does not. A lesson's word budget is 500–1300.

### 4. `src/ui/i18n.ts` — eight new `course` strings (EN + ZH, both mandatory by type)

| key | EN | ZH |
|---|---|---|
| `outcomes` | After this lesson you can | 学完这一课你能 |
| `needs` | You need | 需要先学 |
| `terms` | New words | 新词 |
| `numbers` | Now the numbers | 现在看数字 |
| `deeper` | Going deeper | 再深一层 |
| `sources` | Where these numbers come from | 这些数字从哪里来 |
| `watchLoad` | ▶ Load and watch | ▶ 载入并观察 |
| `watchJump` | ⚡ Jump there | ⚡ 跳到那里 |

### 5. `src/course/CoursePanel.tsx` — the renderer

An **unmigrated** lesson renders exactly as before, through `blocks(lessonBlocks(lesson), 'body')`.

A **migrated** lesson (`isMigrated`) renders, between the title and the existing load/variants/jumps block:

1. `why` as one paragraph at 13.5 px, colour `#d5dae3` (the rest of the prose is 12.5 px / `#c3c9d4`);
2. `L.outcomes` `<h4>` + `<ul>`;
3. `L.needs` `<h4>` + a wrapping row of small buttons, one per id, labelled with that lesson's own title
   (falling back to the raw id if it is not authored yet), `onClick={() => selectLesson(id)}`;
4. `L.terms` `<h4>` + a headerless two-column table (term in `#e6eaf2`, `nowrap`; plain line beside it);
5. the `picture` blocks;
6. `L.numbers` `<h4>` + the `numbers` blocks;
7. `deeper`, if present, as `<details><summary>{L.deeper}</summary>…</details>` — native, closed by default (ruling (d)).

Then the unchanged load / variants / jumps / observe / experiments / quiz, and finally `sources` as a second
native `<details><summary>{L.sources}</summary><ul>…</ul></details>`, closed by default, above the "mark done" button.

A `watch` block renders anywhere blocks render, as a call-out: `borderLeft: '3px solid var(--accent)'`,
`padding: 8`, a faint blue wash, the text, and **one** button — `L.watchLoad` (calls
`loadCourseScenario(lesson.scenario())`) while nothing is loaded, otherwise `L.watchJump` (calls
`jump(lesson.jumps[b.jump].find, t(label))`) if `jump` is set, otherwise no button at all.

Sections 2–7 read their fields with `?? []` rather than `!`, so a lesson mid-edit that has `why` but not yet
`numbers` renders what it has instead of white-screening the panel. The test, not the renderer, is what
insists the fields are there.

### 6. Tests

- `tests/course/readability-rules.test.ts` (new) — five unit tests of the rule functions, verbatim from the
  brief except for the citation negatives (ruling (a)).
- `tests/course/readability.test.ts` (new) — the contract. Three bookkeeping tests always run; the seven
  per-lesson tests run over `migrated` (every lesson not in `MIGRATING`), guarded by `if (migrated.length)`
  per ruling (b). `MIGRATING` holds all 41 authored lessons today, so the per-lesson suite is currently empty.
  `MIGRATING` is exported so the migration tasks can be seen to shrink it.
- `tests/course/lessons.test.ts` — `l.body` → `lessonBlocks(l)` at lines 34, 194 and 236–237, and the
  block-shape switch gained a `case 'watch':` beside `'p'`/`'formula'` (it validates `text`), so the
  `watch` blocks Tasks 2–3 add do not hit that test's `throw new Error('unknown block kind')`.

### 7. Docs

- `docs/superpowers/specs/2026-09-18-zero-to-hero-curriculum-design.md`: the "Density" bullet now reads
  "see `2026-09-21-course-readability-design.md` — depth after understanding; citations only in the sources block."
- `README.md`: one paragraph under the course bullet describing the shape (why → outcomes → prerequisites →
  new words → picture → numbers → observe → experiments → quiz → sources) and pointing at the spec.

## TDD evidence

**RED** — `npx vitest run tests/course/readability-rules.test.ts`, before `src/course/readability.ts` existed:

```
FAIL  tests/course/readability-rules.test.ts [ tests/course/readability-rules.test.ts ]
Error: Failed to load url ../../src/course/readability … Does the file exist?
 Test Files  1 failed (1)
```

Expected: the module under test did not exist yet.

**GREEN** — same command after writing the module:

```
 ✓ tests/course/readability-rules.test.ts (5 tests) 6ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

**The contract test fires.** With the whole course in `MIGRATING` the per-lesson suite is empty, which proves
nothing on its own, so I temporarily removed `'uwb-aoa'` from `MIGRATING` and re-ran:

```
 × readability · migration bookkeeping > every lesson not in MIGRATING is in the new shape
 × readability · uwb-aoa > has every section, well-formed
 × readability · uwb-aoa > names prerequisites that exist, precede it, and respect the track rule
 × readability · uwb-aoa > why: plain words, no digits, no citations
 × readability · uwb-aoa > introduces every acronym before using it
 × readability · uwb-aoa > keeps the picture light: short paragraphs, at most two quantities each, no citations
 × readability · uwb-aoa > cites only in sources and in table cells of the numbers
 × readability · uwb-aoa > fits the main path: 500–1300 words, at most 20 minutes
      Tests  8 failed | 2 passed (10)
```

Every rule engages on an unmigrated lesson. `MIGRATING` was restored from the backup immediately after.

## Gates

| Command | Result |
|---|---|
| `npx vitest run` | **124 files, 1847 tests passed**, output pristine |
| `npx tsc -b --noEmit` | clean |
| `npm run build` | `✓ built in 2.97s` (only the pre-existing chunk-size advisory) |
| `git status --short tests/fixtures/` | empty — both hash fixtures unchanged |

## Files changed

Created: `src/course/readability.ts`, `tests/course/readability.test.ts`, `tests/course/readability-rules.test.ts`.
Modified: `src/course/lessonKit.ts`, `src/course/curriculum.ts`, `src/course/lessons.ts`,
`src/course/CoursePanel.tsx`, `src/ui/i18n.ts`, `tests/course/lessons.test.ts`, `README.md`,
`docs/superpowers/specs/2026-09-18-zero-to-hero-curriculum-design.md`, and 17 per-lesson test files
(one-character `.body` → `.body!` — see Deviations).

## Deviations from the brief

1. **`CITATION` amended.** The brief's literal `\b1[15]-2\d\/\d{3,4}\b` does **not** match its own required
   positive case `11-24/1613r20`: after the four digits comes `r`, a word character, so the trailing `\b`
   cannot hold. Step 4 ("fix the regexes until every case passes; do not weaken the cases") governs, so the
   alternative is now `\b1[15]-2\d\/\d{3,4}(?:r\d+)?\b` — the revision suffix is consumed explicitly rather
   than the boundary being dropped, which keeps the anchor and every other case identical.
2. **Citation negatives simplified**, per ruling (a): `['a drafty room', 'the anchor answers the poll', '锚点作答']`
   tested directly, without the brief's `.replace(/draft/g, 'drafty')` gymnastics. Every positive case is kept verbatim.
3. **`Block` dropped from the readability test's imports.** The brief's import line brings in `type Block`,
   which the test body never uses; `noUnusedLocals` is on, so it would not compile.
4. **17 per-lesson test files got `.body` → `.body!` (36 + 12 = 48 sites).** Making `body` optional turns every
   `uwbNba.body.find(…)`-style read into TS18048 under `strict`, and `tsconfig.json` includes `tests`. The brief
   assumed these would keep compiling; they do not. A non-null assertion is the smallest possible change and
   disappears by itself as each lesson is rewritten. No test logic or assertion was touched. Files:
   `tier1-decode-thresholds`, `tier1-radio-primer`, `tier1-roles-stack`, `uwb-aoa`, `uwb-blocks`, `uwb-coexist`,
   `uwb-contention`, `uwb-dl-tdoa`, `uwb-dstwr`, `uwb-mms`, `uwb-nba`, `uwb-position`, `uwb-sstwr`, `uwb-ul-tdoa`.
5. **`case 'watch'` added to `tests/course/lessons.test.ts`'s block-shape switch** (not in the brief). Without it
   the first `watch` block Task 2 writes throws `unknown block kind` in a test neither task's brief names.
6. **`isMigrated` and `Term` re-exported from `lessons.ts`** (not in the brief) for symmetry with the existing
   type re-exports; `CoursePanel` imports `isMigrated` from there.

## Self-review findings, fixed before reporting

- The renderer first used `lesson.outcomes!`, `lesson.needs!`, `lesson.terms!`, `lesson.numbers!` and would
  have crashed the whole panel on a half-written lesson. Changed to `?? []` guards.
- `blocks(lesson.deeper, …)` did not type-check after the guard was loosened to `(lesson.deeper ?? []).length > 0`,
  which does not narrow; it now passes `lesson.deeper!` inside a guard that has already proved it.

## Concerns for the controller

1. **The spec says `body` is removed; the brief keeps it optional.** I followed the brief. Step 7 of the spec's
   order of work ("`MIGRATING` empty, `body` removed from the type") is where the 48 `!`s above come back out.
2. **`lessonWords` does not count a `Term`'s `term` string** (the walk only collects bilingual objects). Terms are
   a handful of words per lesson, so the 500–1300 band is unaffected in practice, but the count is not literally
   "every word on the main path".
3. **The renderer is verified by `tsc` and `npm run build` only** — vitest runs in the node environment, so no
   test renders `CoursePanel`. The `watch` call-out's load/jump behaviour, the two `<details>` and the `needs`
   buttons have not been exercised in a browser. The first lesson written to the contract (Task 2) is the first
   time this layout is actually seen; a look at the dev server is worth one minute before Task 3 starts.
4. **`trackOf` keys the AMP track off the bare literal `l.module === 7`.** That is what the brief specifies, and
   `MODULES[7]` is "Ambient power IoT (802.11bp)", but inserting a module before index 7 would silently
   mis-track the AMP lessons. No test would catch it while `MIGRATING` still covers all of AMP.

## Commit

`926e10e` — feat(course): a zero-to-hero lesson contract — new sections, collapsed depth and sources, and the readability test that enforces them

## Note on the working tree

When I came to stage, `git status` also showed uncommitted modifications to `src/engine/ampBsSta.ts`,
`src/engine/ampReader.ts`, `src/engine/mac.ts`, `src/model/records.ts`, `src/model/view.ts` and
`tests/engine/amp-reader.test.ts` (+156/−20). **None of these are mine** — I touched no engine, model or AMP
file — so another writer is active in this worktree despite the brief saying I am the only one. I staged my 25
paths explicitly and left those six alone; the commit contains none of them. Two consequences worth knowing:

- the green `npx vitest run` above was run with those foreign edits present in the working tree. They are
  engine-side and independent of everything I changed (both lesson-hash fixtures were clean and
  `tests/engine/amp-reader.test.ts` passed), but the run is not a measurement of the committed tree alone;
- if the controller expected exclusive access here, that expectation did not hold.

---

# Fix round 1

Commit `6bc18be` — fix(course): readability checks cover list items and headings; review minors
(5 files, +76/−9). Reviewer report: `task-1-review-report.md` (Critical 0 · Important 1 · Minor 9).

## Important 1 — list/steps items and headings escaped the prose rules

Fixed in `src/course/readability.ts` only, per the controller's ruling. `paragraphTexts(blocks)` now
returns, **in reading order**: every block `heading`, the `text` of `p` and `watch` blocks, every item of
a `list` or `steps` block, `formula` notes and `widget` captions. Still excluded, and now with a comment
saying why: table cells (in `numbers` the "where" column is the one place provenance is allowed) and
formula bodies (they are the values).

Because `readability.test.ts` routes the acronym rule, the picture caps and both `numbers` citation loops
through `paragraphTexts`, this one change closes the hole on every path at once — a citation in a list
item of `numbers`, an unintroduced acronym in a `picture` heading, or a 200-word list item now fail.
I did not touch `readability.test.ts` (Task 2 owns it this round).

Two new cases in `tests/course/readability-rules.test.ts` pin it:

- *"reads headings and list items as prose, and leaves table cells and formula bodies out"* — a seven-block
  fixture covering all six kinds, asserting the exact returned sequence, so both the inclusions and the
  ordering are pinned, and `§9.3.7` in a table cell and `T = L / R` in a formula body are proved absent.
- *"so a citation hiding in a list item or a heading is caught"* — the finding's own scenario: `CITATION`
  now fires on a `§10.29.1.1` inside a `list` item and on a `Clause 16` inside a heading.

**RED proof.** Both new cases fail against the previous `paragraphTexts`. I temporarily removed the two
added branches (`if (b.heading)` and the `list`/`steps` case) and re-ran:

```
 × readability rules > reads headings and list items as prose, and leaves table cells and formula bodies out
 × readability rules > so a citation hiding in a list item or a heading is caught
      Tests  2 failed | 5 passed (7)
```

then restored the file and re-ran: **7 passed**.

## Minors fixed

- **#3 (readability.ts)** — the `_` and all-digit guards in `acronyms` are unreachable against `ACRONYM` as
  written. Kept, with a comment saying they are deliberate belt-and-braces so that widening `ACRONYM` later
  cannot silently start reporting `TX_START`.
- **#4 (readability.ts)** — `'I'` and `'A'` in `KNOWN_WORDS` can never be consulted (the two-character floor).
  Kept, with a comment, so the baseline reads as the whole list of words a reader is assumed to know rather
  than that list minus the two that happen to be one letter long.
- **#5 (curriculum.ts)** — `lessonWords` now counts a `Term`'s `term` string. The walk gained one line:
  an object carrying a string `term` beside a `plain` contributes that word before the walk descends.
  A no-op today (no lesson carries `terms` yet), so no existing word count or study time moved.
- **#8 (CoursePanel.tsx)** — the `L.outcomes` heading is now gated on a non-empty `outcomes`, like sections
  4, 5, 7 and 8; it no longer renders over an empty list.
- **#7, first half (lessons.test.ts)** — the block well-formedness test now iterates
  `[...lessonBlocks(l), ...(l.deeper ?? [])]`, so `deeper` blocks are held to the same shape as everything
  else the panel renders. This file is outside the six the controller named, but it is not on the
  forbidden list, it is in this round's gate command, it is mine from Task 1 and no other implementer has
  it open. Flagging the small overreach rather than leaving `deeper` at zero coverage.

## Minors not fixed, with reasons

- **#2 — cap `acronyms` at six characters.** **Declined, deliberately.** The reviewer reads the current
  behaviour as stricter-than-spec and harmless. Adding the cap is the *looser* direction, and it would open
  a real hole: the spec's own worked example of terms that must be introduced is "RMARKER, STS, SFD, RCTU",
  and RMARKER is seven characters. A ceiling would wave through exactly the word the rule exists to catch.
  I put the reasoning in a comment above `acronyms` instead. If the controller wants the spec's literal
  "2–6", it should first decide what happens to RMARKER.
- **#10 — the report over-counted its own collateral.** The reviewer is right and I am correcting it here:
  the `.body` → `.body!` collateral is **36 sites across 14 per-lesson test files**, not "17 files, 48 sites".
  My 48 was the sum of two sequential patch passes over the same set (24 + 12 sites landed; the tool printed
  36 for the first pass' candidate count), and 17 was the count of all `tests/course/*` files in the diff,
  which includes `lessons.test.ts` and the two new test files. Step 7's cleanup should be budgeted at
  **36 sites / 14 files**. The substance is as reported: every edit mechanical, no assertion touched.

## Deferred to the fix wave (need `tests/course/readability.test.ts`, which Task 2 holds)

- **#6** — the ZH side is unmeasured for acronyms (`:99` reads `s.en` only) and for per-paragraph quantities
  (`:105` counts `p.en` only), though the spec applies the word rules to both languages. Fix is to iterate
  `[s.en, s.zh]` in both loops.
- **#7, second half** — no bilingual well-formedness check over `sources`, `outcomes` or `terms[].plain`;
  add it to the structure test at `:71`.
- **#9** — `firstOfTrack` (`:47`) means "first *migrated* lesson of the track". Correct mid-migration, but it
  wants a comment so a future migrator does not lose an afternoon to a track's second lesson being
  transiently held to the ≤ 4-terms / no-table rule.

Also outstanding for the controller, not assigned to me: the spec's `Files` section lists an i18n key
`course.why` ("unused label, kept for a11y") that the brief's list of eight omits.

## Gates

| Command | Result |
|---|---|
| `npx vitest run tests/course/readability-rules.test.ts tests/course/readability.test.ts tests/course/lessons.test.ts` | **3 files, 52 tests passed**, output pristine |
| `npx tsc -b --noEmit` | errors **only** in `tests/course/uwb-frame.test.ts` (Task 2's new test for a lesson module that does not exist yet) — no error in any file I own |
| `npx vitest run` (full) | **123/125 files, 1838/1843 tests passed**; the 2 failing files are `tests/course/uwb-frame.test.ts` and `tests/course/uwb-intro.test.ts` |

The full-suite failures are confined to Task 2's in-flight files and are **not** caused by this round. The
uwb-intro failures read `uwbIntro.picture is not iterable`, `expected 1694 to be less than or equal to 1300`
and `expected 27 to be greater than 50` — Task 2's new contract test is written but the lesson itself is
still old-shape. I checked the one way my change could have touched them: `lessonWords` now counts
`Term.term`, but `grep -rn '^\s*terms:' src/course/` returns nothing, so no lesson has a `terms` field and
the new line contributes zero words to every existing count, including uwb-intro's 1694. Not fixed, as
instructed.

## Files changed this round

`src/course/readability.ts`, `src/course/curriculum.ts`, `src/course/CoursePanel.tsx`,
`tests/course/readability-rules.test.ts`, `tests/course/lessons.test.ts`.
