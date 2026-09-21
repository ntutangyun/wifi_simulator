# Course readability — UWB track (steps 2 and 4 of the spec, merged)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Lean loop: one implementer per batch, one combined reviewer (beginner read of the rendered dump + pins), one fix round, no re-review unless an Important stays open; one whole-track review at the end.

**Goal:** Every UWB lesson after the two openers is rewritten to the readability contract; eleven lessons become fifteen.

**Spec:** `docs/superpowers/specs/2026-09-21-course-readability-design.md` (binding: "The shape of a lesson", "Words", "Numbers", "Length and pace", "Splitting", "Plan template for steps 2–7"). Reference pair: `src/course/uwb/uwb-intro.ts`, `uwb-frame.ts` and their tests.

## Global Constraints

- Everything in the spec's Words / Numbers / Length rules, enforced by `tests/course/readability.test.ts`. Prose windows below are `lessonWords` without observe/tryThis/quiz.
- Scenarios byte-identical: `tests/fixtures/lesson-hashes.json` and `uwb-record-hashes.json` additions only (new split ids equal to the first half's). The first half of a split keeps the id.
- Every pinned claim keeps its test; pins move with sentences and are pinned against the record they name. `.body!` sites in the batch's tests are retired.
- EN + ZH written, not translated. No copyrighted standard text; citations only in `sources` and `numbers` table cells.
- **Shared files are the controller's** (`src/course/curriculum.ts` COURSE_ORDER, `src/course/lessons.ts`, `tests/course/readability.test.ts` MIGRATING, both fixtures). An implementer tests its lessons with `READABILITY_INCLUDE=<ids>` (Task 0) and never edits those five files.
- Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` / `Claude-Session: https://claude.ai/code/session_016HUme5YXCB8DTeScyfn7pL`.

---

### Task 0: Test kit, shared runs, include switch

**Files:** create `tests/course/kit.ts`; modify `tests/course/readability.test.ts`, `tests/course/uwb-intro.test.ts`, `uwb-frame.test.ts`, `amp-intro.test.ts`, `amp-ppdu.test.ts` (migrate to the kit), `scripts/lesson-dump.ts` (budget line already there; add `--all-uwb` listing).

- `lessonShapeSuite(lesson, { proseMax })` — one `describe` with: isMigrated; `lessonMinutes ≤ 20`; `lessonBudget` within the spec's budgets and prose ≤ proseMax; every jump target found in the base run; bilingual walk over `lessonStrings`; first `watch` within the first three picture blocks; no citation in `deeper`; split id shares its hash with the first half when `{ sameSceneAs: id }` is given.
- `runOf(lesson, variant?, ns?)` — memoised `Simulation` run keyed by lesson id + variant + ns, shared across test files in one worker (module-level Map); the four migrated tests use it.
- `READABILITY_INCLUDE` env var: comma-separated ids removed from `MIGRATING` at runtime so an implementer can grade an unregistered lesson; the bookkeeping test ignores the env var.
- Commit `test(course): lesson shape kit, shared simulation runs, READABILITY_INCLUDE`.

---

### Batches (Tasks 1–6). Each: rewrite in place, the implementer owns only the named lesson files and tests, returns word budgets per lesson.

Content contract per lesson = `why` (2–3 plain sentences, the register of uwb-intro), 2–4 outcomes, `needs`, ≤ 6 terms, picture headings, what goes to numbers / deeper / sources. Prose windows: opener-style ≤ 650 picture side; total ≤ 1300 (≤ 1000 only for track openers — none here).

**Task 1 — TWR clocks:** `uwb-sstwr` (needs uwb-frame; terms ppm, crystal, clock offset; picture: why a reply time measured on the wrong clock lies; watch on the range error; numbers: the error formula and the ±10/±1/0 ppm table) and `uwb-dstwr` (needs uwb-sstwr; terms Final, round trip 2; picture: two round trips, the offset appears with opposite signs and cancels; numbers: the DS-TWR formula and the ±20 ppm variant). Retire `.body!` in both tests.

**Task 2 — Schedule and position:** `uwb-blocks` (needs uwb-frame; terms block, round, slot, RSTU; picture: a timetable nobody negotiates; watch on the block boundary; numbers: 2 ms / 0.5 ms slots, block length) and `uwb-position` split into `uwb-position` (needs uwb-blocks, uwb-dstwr; terms trilateration, residual; picture: three distances make a point, four make a check; watch on UWB_POSITION) + `uwb-geometry` (needs uwb-position; terms GDOP in plain words, NLOS; picture: why the same range error grows with geometry, the brick-wall and three-anchor variants; numbers: the error table). Same scene builder; `uwb-geometry` hashes equal `uwb-position`'s.

**Task 3 — Sharing the band:** `uwb-coexist` (needs uwb-blocks; terms overlap, energy detect; picture: Wi-Fi at 6 GHz sees a UWB pulse as noise and vice versa; the five variants as watch prompts) and `uwb-contention` (needs uwb-coexist; terms contention window, RCPS, RCMA; picture: when the controller does not know who is there it opens a window and anchors draw slots; numbers: 4 / 8 / 16 slots collision table).

**Task 4 — One-way ranging:** `uwb-dl-tdoa` (needs uwb-position; terms TDoA, hyperbola, clock correction; picture: a tag that only listens; watch on the position line; numbers: the raw vs corrected error, ten-tag variant) and `uwb-ul-tdoa` (needs uwb-dl-tdoa; terms blink, sync error; picture: one blink, anchors on a shared clock locate it; numbers: 1 ns of sync error = 30 cm).

**Task 5 — Angle and MMS:** `uwb-aoa` (needs uwb-dstwr; terms AoA, phase difference, field of view; picture: two antennas hear the same pulse at slightly different times; watch on the angle line; numbers: 2.7° sigma, the three variants) and `uwb-mms` split into `uwb-mms` (needs uwb-blocks, uwb-dstwr; terms fragment, RSF, RIF; picture: why one long frame cannot survive, fragments re-assembled; watch on the train) + `uwb-mms-numbers` (needs uwb-mms; terms combining gain, ratio; numbers: RSF/RIF lengths, 12.04 dB, the energy rule, the 4z comparison). `uwb-mms-numbers` hashes equal `uwb-mms`'s.

**Task 6 — Narrowband helper:** `uwb-nba` split into `uwb-nba` (needs uwb-mms; terms narrowband, Poll/Response/Report; picture: a small radio that carries the talking so the wideband one only carries the timing; watch on the NB frames) + `uwb-nba-coexist` (needs uwb-nba, uwb-coexist; terms LBT, hop; picture: listen before talk, the router's channel, hopping; numbers: −71.02 dBm threshold, the four variants). `uwb-nba-coexist` hashes equal `uwb-nba`'s. Also the carried nit: the SFD row of uwb-frame's "Two words, two sizes" table restates 508.

**Controller step after each batch:** register split ids in `lessons.ts`, insert into `COURSE_ORDER`, remove ids from `MIGRATING`, regenerate both fixtures (additions only), run `tests/course` + hash suites, commit `chore(course): register <ids>`.

**Review per batch:** one reviewer (sonnet) reads `npx tsx scripts/lesson-dump.ts <id> en|zh` for each lesson as a beginner who knows the preceding UWB lessons, then checks the pin inventory against the pre-rewrite test file and the fixture rule. One fix round.

**Whole-track review** after Task 6 (fable), one fix wave, merge.
