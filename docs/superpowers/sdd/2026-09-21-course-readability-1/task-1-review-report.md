# Task 1 review — the contract, the renderer and the readability test

Diff under review: `70f44de..926e10e` (25 files, +521/−55), via
`.superpowers/sdd/2026-09-21-course-readability-1/task-1-review.md`.
Uncommitted engine/model/AMP edits from the concurrent implementers were ignored.

## Spec Compliance

**✅ Spec compliant** — every file on the brief's list has its hunk, every interface in
the brief's "produces" block is present with the stated signature, and the three
controller rulings are honoured verbatim. Two deviations are authorised (CITATION
`(?:r\d+)?`, `.body!`) and two more (`case 'watch'` in `lessons.test.ts`, the
`lessons.ts` re-export) are small and load-bearing. See Issues for one
under-enforcement in the readability test.

File-by-file against the brief's list:

| Brief item | Status |
|---|---|
| `src/course/lessonKit.ts` — `Term`, `watch`, 8 optional fields, `isMigrated` | ✅ lessonKit.ts:50, 53-56, 71-88, 99 |
| `src/course/curriculum.ts` — `lessonWords`, `trackOf`, `lessonBlocks` | ✅ curriculum.ts:112, 121, 130-146 |
| `src/course/CoursePanel.tsx` — render | ✅ CoursePanel.tsx:227-336, 405-413 |
| `src/ui/i18n.ts` — 8 keys EN+ZH | ✅ i18n.ts:34-42 (type), 347-354 (EN), 886-893 (ZH) |
| `tests/course/lessons.test.ts` — `lessonBlocks` | ✅ lines 34, 194, 236-237 |
| `README.md` — course paragraph | ✅ README.md:12 |
| `docs/.../2026-09-18-zero-to-hero-curriculum-design.md` — Density line | ✅ verbatim replacement |
| `tests/course/readability-rules.test.ts` (new) | ✅ 5 tests, brief's cases intact |
| `tests/course/readability.test.ts` (new) | ✅ 3 bookkeeping + 7 per-lesson |
| `src/course/readability.ts` (new) | ✅ all 8 exports |
| `tests/fixtures/*` unchanged | ✅ absent from the diff stat |

### Constraint 1 — rule functions against the spec's "Words"

Traced each brief unit case by hand against the regexes, not by trusting the run:

- `acronyms` (readability.ts:60-69). Protocol names stripped first (`withoutProtocolNames`,
  readability.ts:52); `TX_START` produces no match at all because `_` is a word character,
  so `\b` cannot close after `TX` and cannot open before `START`; `A-MPDU` / `L-SIG` survive
  whole through `(?:-[A-Z0-9]+)*`; `CTS-to-self` yields `CTS` because the lower-case `to`
  breaks the hyphen group and `-` is a non-word boundary; `dBm`/`GHz`/`MHz` never match
  because `\b[A-Z]` cannot open mid-word and the trailing `\b` cannot close before a
  lower-case letter. All four brief cases hold.
- `numericQuantities` (readability.ts:73). `\d(?:[\d,.]|\s(?=\d{3}\b))*` groups `1 065.7`
  and `336 207 494 656` once each and stops at `16 µs, 8 slots`; `802.15.4` and `Wi-Fi 7`
  are stripped by `PROTOCOL_NAME`. All three brief cases hold.
- `CITATION` (readability.ts:40). All 14 EN/ZH positives match, including `11-24/1613r20`
  under the ruled `(?:r\d+)?` amendment (`\d{3,4}` takes `1613`, `r20` is consumed, `\b`
  closes at end-of-string). All three negatives are rejected: `drafty` fails `\bdraft\b`
  on the trailing boundary. No `g` flag, so `.test()` has no `lastIndex` state — correct,
  and the only stateful regexes (`PROTOCOL_NAME`, `ACRONYM`, `QUANTITY`, `CJK`) are used
  with `replace`/`match`/`matchAll`, all of which reset or clone.
- `why` digit rule: readability.test.ts:88-93 uses `numericQuantities`, which carries the
  protocol-name exemption for free. ✅
- Unit tests are the brief's cases, not weakened: the only edit is the ruled simplification
  of the three citation negatives (readability-rules.test.ts:29-30); every positive is
  verbatim and no `expect` was loosened.

### Constraint 2 — every rule in the spec's "Tests"

Read the assertions, not the report. Each spec rule maps to a live assertion:

| Spec rule | Assertion | Fires? |
|---|---|---|
| fields present, well-formed | readability.test.ts:71-79 | yes — `why` trimmed non-empty both languages |
| outcomes 2–4 | :74 | yes |
| terms ≤ 6, ≤ 4 for a track's first | :75 via `firstOfTrack` (:47) | yes |
| ≥ 1 `watch` in `picture` | :77 | yes |
| no table in first lesson's `picture` | :78 | yes |
| `watch.jump` valid | :80 | yes |
| `needs` exist, precede, track rule | :83-89 | yes (`amp` pseudo-track at :88, `radio-primer`/`frame-anatomy` exception) |
| `needs` empty only for `radio-primer` | :84 | yes |
| `why`: no digits, no citations, EN+ZH | :90-93 | yes |
| acronym rule, running known set | :95-100 | yes (same-track or the two Tier-1 exceptions at :97; `TIER1_BASELINE` seeded at :96) |
| picture caps 90 EN / 170 ZH / ≤ 2 quantities / no citations | :103-107 | yes |
| citations only in `sources` and `numbers` table cells | :110-111 | partially — see Important 1 |
| 500–1300 words, ≤ 20 min | :114-115 | yes |
| MIGRATING ids real and old-shape | :52-54 | yes |
| everything else new-shape | :55-57 | yes |
| TIER1_BASELINE lifetime | :58-61 | yes |

The un-listing experiment the report cites is consistent with the assertions I read: all
seven per-lesson tests dereference required fields (`l.why!`, `l.outcomes!`, `l.terms!`,
`l.picture!`, `l.numbers!`, `l.sources!`, `l.needs!`), so an old-shape lesson fails each one
rather than vacuously passing. The `if (migrated.length)` guard (:65) is the ruled form and
does not suppress the three bookkeeping tests, which run unconditionally.

Verified the self-enforcement of the MIGRATING list: `byId.has(id)` plus `isMigrated(...) === false`
means an id cannot be parked there once its lesson migrates, and `migrated` covers the
complement — so the list can only shrink as lessons are rewritten. Confirmed all 41 ids resolve
(the bookkeeping tests pass; a stale id would fail :53).

### Constraint 3 — helpers

- `lessonWords` (curriculum.ts:130-146) walks `why, outcomes, terms, picture, numbers, body,
  observe, tryThis, quiz`; `deeper` and `sources` are absent from the walk object at :142-143. ✅
- `lessonBlocks` (curriculum.ts:121-123) is exactly `l.body ?? [...(l.picture ?? []), ...(l.numbers ?? [])]`. ✅
- `trackOf` (curriculum.ts:112-114) returns `'amp'` for module 7. Checked the named risk:
  `MODULES[7]` is "Ambient power IoT (802.11bp)" on tier 1 (`track: 'wifi'`), so the literal is
  correct today; the carry stands (curriculum.ts:112 has no guard tying it to that title).

### Constraint 4 — renderer and i18n

Thirteen sections in the spec's order, CoursePanel.tsx:
1 header/title (:257-261, unchanged) → 2 `why` paragraph at 13.5px (:276, style at :124) →
3 outcomes h4 + `<ul>` (:279-282) → 4 needs as buttons calling `selectLesson(id)` with the
target lesson's own title (:284-296) → 5 terms two-column table (:298-315) → 6 `picture`
blocks (:317) → 7 `L.numbers` h4 + blocks (:319-324) → 8 `<details>` for `deeper` (:326-331)
→ 9 load/variants/jumps (:338-…, untouched) → 10-12 observe/experiments/quiz (untouched) →
13 `<details>` for `sources` above "mark done" (:405-413). Both `<details>` are native and
have no `open` attribute, so they are closed by default (ruling (d)). ✅

`watch` call-out (:227-250): `borderLeft: '3px solid var(--accent)'`, `padding: 8` (:128-130);
`L.watchLoad` → `loadCourseScenario(lesson.scenario())` while `!courseLoaded`; otherwise
`L.watchJump` → `jump(target.find, t(target.label))` only when `b.jump` is set; otherwise no
button (:239-249 — both branches are guarded, there is no fallthrough that renders a dead button). ✅

Unmigrated lessons: `{!isMigrated(lesson) && blocks(lessonBlocks(lesson), 'body')}` (:274).
Same `heading`-then-`BlockView` structure as the code it replaced; only the React `key`
string gained a `:body` segment, which is not observable. ✅

i18n: eight keys added to the `Strings['course']` interface (i18n.ts:34-42) and to **both**
language tables with exactly the brief's EN and ZH strings, including the `▶`/`⚡` glyphs.
`tests/ui/i18n.test.ts` passes with no allowlist entry. ✅

### Constraint 5 — docs and scope

- Density line replaced verbatim with the brief's sentence. ✅
- README.md:12 carries one paragraph naming the shape in the brief's order and pointing at
  the readability spec. ✅
- `tests/fixtures/` untouched (not in the diff stat). ✅
- Files outside the brief's list: the 14 per-lesson test files (`.body` → `.body!`, ruled
  acceptable) and `src/course/lessons.ts` (+2 lines: `Term` type re-export and `isMigrated`
  value re-export). The latter is not on the brief's list but is a one-line barrel addition
  that `CoursePanel` consumes; acceptable.

### ⚠️ Cannot verify from this diff

- **The renderer is untested.** Nothing in vitest mounts `CoursePanel` (node environment, no
  jsdom/RTL in the suite). The `watch` load/jump branching, the two `<details>` and the `needs`
  buttons are verified by `tsc` and the human eye only. The implementer flags this as concern 3;
  I confirm it — the controller should look at the dev server once Task 2's first lesson lands,
  before Task 3 starts. This is the single largest unverified surface in the task.
- **`npm run build` and the full `npx vitest run`.** I ran the four files the controller named
  plus `tsc -b --noEmit`; the report's 1847-test green run I did not reproduce (and per the
  reviewer contract should not).
- **The report's full-suite run was taken with the concurrent implementers' uncommitted engine
  edits in the tree** — the report says so itself. The committed tree alone has not had a full
  suite run. Low risk (the changes are disjoint), but the controller should note it.
- **Spec vs brief: `body` is "removed" in the spec, optional here.** Deferred to step 7 by the
  spec's own order of work; the 36 `!`s come back out there. Not a defect of this task.
- **Spec's Files section lists an i18n key `course.why`** ("unused label, kept for a11y"); the
  brief's list of eight omits it and so does the diff. Controller call.

## Checks I ran

- `npx vitest run tests/course/readability.test.ts tests/course/readability-rules.test.ts tests/course/lessons.test.ts tests/ui/i18n.test.ts` → **4 files, 57 tests passed**, output pristine (no warnings, no stderr noise, no skipped tests).
- `npx tsc -b --noEmit` → **exit 0, no output**. Nothing from the concurrent implementers' files either.
- Focused read outside the diff, for one named risk each: `curriculum.ts` `MODULES`/`TIERS`
  (module-7 literal in `trackOf`); `COURSE_ORDER` (that `indexOf` in the prerequisite test cannot
  silently return −1 for an authored lesson — `orderLessons` throws on a lesson missing from the
  order, so it cannot).

## Strengths

- **The rule functions are genuinely pure and genuinely pinned.** Putting them in `src/` rather
  than inside the test (readability.ts:1-8 explains why) means the course-wide test and any
  future authoring tool speak one vocabulary, and `readability-rules.test.ts` means a regex that
  quietly stops seeing an acronym turns something red. This is the right shape for a rule engine
  that thirty-odd lessons will be graded against.
- **The CITATION deviation was found by reasoning, not by weakening the test.** The brief's own
  positive case `11-24/1613r20` cannot match the brief's own regex; the implementer consumed the
  revision suffix explicitly instead of dropping the `\b` anchor, which is the fix that keeps
  every other case identical. That is the right instinct.
- **The migration bookkeeping is self-tightening.** `MIGRATING` cannot hold a migrated lesson and
  cannot omit an unmigrated one, so the list mechanically shrinks; `TIER1_BASELINE` has a test
  that deletes it. Two pieces of temporary scaffolding that cannot be forgotten.
- **The renderer degrades instead of white-screening.** The self-review that changed `lesson.outcomes!`
  to `(lesson.outcomes ?? [])` (CoursePanel.tsx:280, 284, 298, 319) is the correct division of
  labour: the test insists the fields exist, the panel does not crash while an author is mid-edit.
- **`blocks()` (CoursePanel.tsx:253-258) removed the duplication** that a thirteen-section renderer
  would otherwise have spread across five call sites.
- **The report is unusually honest** — it volunteers the `lessonWords`/`Term` gap, the untested
  renderer, the `trackOf` fragility and the foreign working-tree edits rather than burying them.

## Issues

### Critical (Must Fix)

None.

### Important (Should Fix)

**1. `list` and `steps` items escape the citation rule in `numbers`, and the acronym and
paragraph rules in `picture`.** *(plan-mandated — the brief's Step 6 code is verbatim)*

`tests/course/readability.test.ts:111` checks citations in `numbers` only through
`paragraphTexts`, which by ruling (c) returns `p`/`watch` text, formula notes and widget
captions and drops everything else (`readability.ts:108` — `default: break`). A `list` or
`steps` block is running prose by any reading of the spec ("Citations allowed **only inside
table cells** (a 'where' column) — never in running prose"), and so is a block `heading`.
Today a `numbers` section can carry `{ kind: 'list', items: [{ en: 'per §10.29.1.1 …' }] }`
and no test turns red.

The same hole in `picture` is narrower but real: citations there *are* caught, because
`CITED_FIELDS` at :29 walks `picture` with `textsOf` (every string). But the acronym rule
(:98) and the paragraph caps (:103-107) both go through `paragraphTexts`, so an undefined
acronym or a six-number, 200-word list item in `picture` passes.

Why it matters: Task 2 is being written against this test right now, and the lessons it
replaces lean heavily on `list` and `steps`. An enforcement test with a hole shaped like the
most common block kind will let exactly the prose this programme exists to remove back in.

Fix (small, local to the test): add a helper beside `paragraphTexts` — or in the test — that
returns every `L10n` in a block set *except* `table` head/rows and `formula` bodies, and use
it for the two `numbers` citation loops and for the acronym loop. Keep `paragraphTexts` as it
is for the ≤ 90-words / ≤ 170-chars / ≤ 2-quantities caps, which really are per-paragraph, but
add a separate per-item cap for `list`/`steps` items if the controller wants the caps to bite
there too. Either way this should be a ruling the controller records, since the brief mandated
the current form.

### Minor (Nice to Have)

**2. `acronyms` has no upper bound, though the spec says "2–6".**
`src/course/readability.ts:64` drops tokens shorter than 2 but never caps length; the spec's
"A token of 2–6 upper-case letters/digits" implies a ceiling (its own examples top out at
`A-MPDU`, 6). The effect is stricter, not looser — an all-caps word of 7+ characters would be
demanded as a `terms` entry — so it cannot let bad prose through, but it will produce a
confusing failure the first time someone writes an emphatic all-caps word. Add
`|| token.replace(/-/g, '').length > 6` if the controller wants the spec's literal.

**3. Two unreachable guards in `acronyms`.** `src/course/readability.ts:64` —
`token.includes('_')` and `/^[\d-]+$/.test(token)` can never be true: `ACRONYM`
(readability.ts:43) has no `_` in its character class, and its first character class is
`[A-Z]`, so a matched token can be neither underscore-bearing nor all-digits. Both are
brief-mandated (Step 3) and harmless as documentation of intent; worth a comment saying they
are belt-and-braces, or removing them.

**4. `KNOWN_WORDS` carries two entries that can never be consulted.**
`src/course/readability.ts:21` lists `'I'` and `'A'`, but `acronyms` drops every token shorter
than 2 characters (:64), so neither can ever be looked up. Brief-mandated; note it or drop them.

**5. `lessonWords` does not count a `Term`'s `term` string.**
`src/course/curriculum.ts:142` walks `terms`, but the walk only collects objects carrying both
`en` and `zh`, so `{ term: 'RMARKER' }` contributes nothing while `plain` does. The spec says
`lessonWords` walks `terms`. Six words per lesson against a 500–1300 band is noise, but the
count is not literally the main path. If it should count, push `o.term` in the walk at
curriculum.ts:136-140.

**6. The ZH side is unmeasured for acronyms and quantities.**
`tests/course/readability.test.ts:99` reads `s.en` only, and :105 counts quantities in `p.en`
only. The spec is explicit that "the same rules apply to the ZH text (digits, citations,
paragraph length)". Citations and ZH paragraph length *are* checked (:106, :104); acronyms and
per-paragraph quantities are not. Brief-mandated, and Chinese prose does carry Latin acronyms.
Cheap fix: iterate `[s.en, s.zh]` in both loops.

**7. `deeper` blocks and `sources` strings have no well-formedness test at all.**
`tests/course/lessons.test.ts:194` now iterates `lessonBlocks(l)`, which by design excludes
`deeper` (curriculum.ts:121); `sources: L10n[]` is walked by nothing. So a `deeper` table with
a ragged row, or a `sources` entry with an empty `zh`, renders into the panel with zero
coverage — and both are rendered (CoursePanel.tsx:326-331, 405-413). Fix: iterate
`[...lessonBlocks(l), ...(l.deeper ?? [])]` at lessons.test.ts:194, and add a bilingual check
over `sources` (and over `outcomes` and `terms[].plain`, which are equally unchecked) to the
structure test at readability.test.ts:71.

**8. The outcomes heading renders over an empty list.**
`src/course/CoursePanel.tsx:279-282` emits `<h4>{L.outcomes}</h4>` unconditionally for a
migrated lesson while the `<ul>` uses `?? []`. Sections 4, 5, 7 and 8 all gate their heading on
a non-empty field; section 3 does not. One-line consistency fix.

**9. `firstOfTrack` means "first *migrated* lesson of the track", not "first lesson".**
`tests/course/readability.test.ts:47`. Mid-migration that is the only workable definition, but
it means a track's second or third lesson is transiently held to the ≤ 4-terms / no-table-in-
picture rule if it migrates before the first one does. Harmless if each step migrates in course
order (the spec's order of work does), but worth a comment at :47 so a future migrator does not
lose an afternoon to it.

**10. The report over-counts its own collateral.** `task-1-report.md` says "17 per-lesson test
files (36 + 12 = 48 sites)". The diff touches **14** per-lesson test files with **36** `.body!`
sites (17 is the count of all `tests/course/*` files in the diff, including `lessons.test.ts`,
`readability.test.ts` and `readability-rules.test.ts`). The substance is unaffected — every
edit is the mechanical `.body` → `.body!` the ruling permits, with no assertion touched — but
the controller is budgeting step 7's cleanup off this number.

## Assessment

**Spec compliance:** ✅ Spec compliant (with the ⚠️ items above)

**Task quality:** Approved

**Counts:** Critical 0 · Important 1 · Minor 9

**Reasoning:** The contract, the helpers, the renderer and the i18n strings match the brief and
the spec section by section; the rule functions are correct against every case I traced by hand
rather than by running, and the enforcement test dereferences the required fields on every path,
so it fails rather than vacuously passes on an old-shape lesson. The one Important finding is a
hole the brief itself mandated — `list`/`steps` prose slipping past the citation and acronym
rules — which should be closed by a controller ruling before Task 2's lessons are graded against
this test, not by reopening Task 1.
