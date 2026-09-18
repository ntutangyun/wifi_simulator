# Fix wave — UWB positioning whole-branch review

One wave, three commits on `feat/uwb-ranging`, worktree `feat-link-2g`, from `8c3993d`.

| Commit | Subject |
| --- | --- |
| `48221b5` | refactor(editor): a leaf for clampField, a path on every UWB schema issue |
| `32ed89e` | fix(ui): one edition, the AP rule as the schema has it, 2.1 cm of range |
| `61e4684` | fix(course): the ZH try-this quotes the ZH editor; one name per ratio |

## Items

### I1 — lesson 4 (ZH) quoted the English editor string — `61e4684`

`src/course/uwb/uwb-blocks.ts` tryThis 2 (`zh`) now quotes
"每轮 8 个时隙 · 每块 12 轮", which is exactly what `strings.zh.editor.uwbPlan(8, 12)`
renders in `src/ui/i18n.ts`. The EN sentence was already the EN string and is
unchanged. `tests/course/uwb-blocks.test.ts` gained
*"each language quotes the plan line its own editor prints, word for word"*,
which builds both expected quotes from `STRINGS.<lang>.editor.uwbPlan(slots, rounds)`
with `slots`/`rounds` taken from `roundPlan(SESSION, ANCHORS - 1)` — so neither a
relabel of the editor nor a change to the round plan can pass silently.

`lessonMinutes(uwbBlocks)` is still 25: the lesson went from 1714 to **1712**
English words (M10 traded two words out; I1 touches ZH only). Header comment updated.

### I2 — spawn clause — no code change

Resolved by the spec amendment in `8c3993d` (spawn adds stations only; an AP tool
restores the AP). Nothing to do here.

### M1 — stale "Simulation error" banner — `48221b5`

`src/ui/store.ts`: the `else` branch of `setMode` (the edit/guide path) now sets
`simError: null` alongside the view and playhead it already cleared, with a comment
saying why — the banner belongs to the run that raised it, and the session section
draws the live complaint in red already.

The second half of the finding is also done: `src/worker/sim.worker.ts` posted a
ZodError's own `message`, which is the raw JSON of every issue. A new
`scenarioErrorText(e)` in `src/model/scenario.ts` returns the issue *sentences*
joined by "; " (and passes any other error through unchanged); the worker's `init`
catch uses it, so the banner and the editor now say the same words.
Pinned by two cases in `tests/model/scenario.test.ts`.

### M2 — lesson 5 credited lesson 2 with a formula — `61e4684`

`src/course/uwb/uwb-position.ts`, "The ellipse around the cross", EN and ZH:
"Lesson 2 fixed σ_r at c·σ_ts/√2, 2.12 cm at 100 ps" → **"Lesson 1's 2.1 cm of σ_r
is c·σ_ts/√2, 2.12 cm at 100 ps"** (ZH: 第 2 课已经定下… → 第 1 课引用的 2.1 cm
测距噪声，其来历正是…). Lesson 1 does print "2.1 cm of range-noise sigma"; the formula
is first written here.

New pins in `tests/course/uwb-position.test.ts`: the sentence is built from
`SIGMA_R`, lesson 1's own prose is asserted to contain that figure, and lesson 2's
prose is asserted **not** to contain `c·σ_ts/√2`. The file's `prose()` helper was
generalised to `lessonProse(lesson)` with `prose()` kept as the local alias.

Deviation from the review's suggested wording ("Lesson 1 quoted σ_r = 2.1 cm; it is
c·σ_ts/√2, …", +4 words): the shipped wording costs **+2** words instead, because
lesson 5 had only six of headroom and M8's interpolation had to fit too. Lesson 5 is
now 1720 words (ceiling 1724); header comment updated.

### M3 — "exactly one AP" in the import entry — `32ed89e`

`src/editor/EditorGuide.tsx`, both languages: "exactly one AP whenever a station or
AMP tag is present" / "只要存在终端或 AMP 标签，就必须有且仅有一个 AP". Matches
`src/model/scenario.ts:397-400` and the file's own Delete-node entry.

### M4 — the timestamp-noise hint — `32ed89e`

Four strings now name the flight distance and the range sigma separately:
- `src/ui/i18n.ts` `uwbTsNoiseHint` (EN): "100 ps of timing is 3 cm of flight and,
  after the TWR formula, 2.1 cm of range"; ZH twin likewise.
- `src/editor/EditorGuide.tsx`: "(100 ps is 3 cm of flight, 2.1 cm of range)" / ZH twin.

No test covered the hint, so one was added: `tests/ui/i18n.test.ts` §"UWB editor
hints" derives 2.1 cm from `rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs)` and 3 cm from
`C_M_PER_NS`, asserts both appear in the hint in each language, and asserts the two
are the numbers the review named.

### M5 — the 802.15.4z citation — `32ed89e`

`src/editor/EditorGuide.tsx` (📍 anchor entry, EN and ZH) and `src/ui/i18n.ts`
`uwbNode` (EN and ZH) now cite **802.15.4-2024**, like the README, Guide §11, the
glossary and both lessons. Plain "802.15.4-2024" was chosen over the review's
alternative "802.15.4z (now 802.15.4-2024)" to keep the node-section label short.

### M6 — `clampField` leaf — `48221b5`

New leaf `src/ui/inputs.ts` holds `clampField` (imports nothing). `src/editor/planOps.ts`
re-exports it, so `FloorPlanEditor` and both existing test suites are untouched;
`src/uwb/ui/UwbNodeFields.tsx` and `src/uwb/ui/UwbSessionFields.tsx` import the leaf.
`src/uwb/ui/` now has no edge into `src/editor/`.

Named `src/ui/inputs.ts` per the controller ruling (the review had suggested
`src/ui/fields.ts`).

### M7 — `uwbSessionIssue` matched on wording — `48221b5`

All five ranging `addIssue` calls in `src/model/scenario.ts`'s `superRefine` now carry
`path: ['uwb']`, with a comment pointing at the consumer. `uwbSessionIssue` claims an
issue when `issue.path[0] === 'uwb'`, or when it is `['nodes', i, …]` and node `i` is a
ranging device; the `/\bUWB\b|ranging/i` regex is gone.

`tests/editor/uwb-planOps.test.ts` gained three cases: a bound on a session field
(whose message never says "UWB") is claimed; a field issue on a ranging device is
claimed; and, for four invalid plans, **every** issue whose message mentions UWB or
ranging is asserted to be rooted at `uwb` — so a future rule that forgets the path
fails here rather than showing up under the wrong section. The existing
"ignores an issue that has nothing to do with ranging" case still passes.

### M8 — the ellipse draw factor — `32ed89e` (Guide, pins) and `61e4684` (lesson 5)

- `src/ui/Guide.tsx` imports `ELLIPSE_DRAW_SCALE` and renders `{ELLIPSE_DRAW_SCALE}×`
  in both languages instead of the literal `10×`.
- `src/course/uwb/uwb-position.ts` imports it and interpolates it in all three places
  it names the factor: the body ("draws it ${…} times over"), observe 3 ("drawn ${…}
  times life size") and the quiz distractor ("the ${…}× draw scale"), EN and ZH. The
  affected strings became template literals. English word count is unchanged
  ("ten" → "10").
- The two mentions the review found unpinned now have pins in
  `tests/ui/uwb-guide.test.ts`: every string of the glossary's error-ellipse entry
  (`alt.en/zh`, `def.en/zh`) must contain `${ELLIPSE_DRAW_SCALE}×`, and `README.md`
  must contain `drawn at ${ELLIPSE_DRAW_SCALE}×`. `tests/course/uwb-position.test.ts`
  builds its three assertions from the constant as well.

`src/ui/glossary.ts` and `README.md` are unchanged — their text already reads "10×",
which is now guarded rather than retyped-and-hoped.

### M9 — note only

No change, as ruled. Still on the carry list.

### M10 — three ratios, one word — `61e4684`

One name per ratio, EN and ZH, across lessons 3 and 4:

| Ratio | EN | ZH |
| --- | --- | --- |
| airtime / round | channel occupancy | 信道占用率 |
| round / block | schedule share | 调度占比 |
| measured radio on-time / block | radio-on share | 射频开启占比 |

- `src/course/uwb/uwb-dstwr.ts:104` "the duty cycle barely moves" → "channel occupancy
  barely moves" (ZH 占空比 → 信道占用率), and the same in the quiz explanation at `:172`.
- `src/course/uwb/uwb-blocks.ts:84` "Two different shares of the block both get called a
  duty cycle" → "…are easy to confuse"; "The radio share" → "The radio-on share"
  (ZH: 都被叫作占空比 → 极易混为一谈; 射频占比 → 射频开启占比).

Words were swapped, never added: lesson 3 went 1706 → **1705** words and lesson 4
1714 → **1712**; both header budgets updated (lesson 3's comment also had a
pre-existing off-by-one, 1707, now corrected). The review's suggested extra clause
("lesson 3's 9.67 % was of the round; of the block it is 0.97 %") was **not** added —
the controller's ruling was vocabulary only, and lesson 3 has no room for a sentence.
Test comments quoting the old sentence were updated, and the radio-share test was
renamed to "the radio-on share…".

## Verification (at `61e4684`, worktree clean)

- `npx tsc -b` → exit 0.
- `npx vite build` → built in 2.69 s, exit 0 (the pre-existing >500 kB chunk warning).
- `npx vitest run` → **97 files, 1110 tests passed**, exit 0 (1101 before this wave;
  +9 from the new pins).
- `tests/fixtures/lesson-hashes.json`: no diff across `8c3993d..61e4684`. No scenario,
  seed or engine behaviour changed in this wave.
- `git status` clean.

## Deviations, in one place

1. M2's replacement clause costs +2 words rather than the review's +4 phrasing, to keep
   lesson 5 inside its budget alongside M8.
2. M6's leaf is `src/ui/inputs.ts` (controller's name), not the review's `src/ui/fields.ts`.
3. M5 uses plain "802.15.4-2024" rather than "802.15.4z (now 802.15.4-2024)".
4. M10 adds no cross-reference clause to lesson 4 — vocabulary only, per the ruling.
5. M1 was given a test (`scenarioErrorText`) though none was asked for; the store's
   one-line change itself has no test, there being no store suite.
