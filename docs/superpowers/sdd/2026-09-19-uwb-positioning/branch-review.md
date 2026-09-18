# Whole-branch review — UWB positioning plan (265ed91..d0735ed on `feat/uwb-ranging`)

Reviewer: Claude Fable 5.1 (final whole-branch reviewer). Inputs: the spec (Part C, Part D lessons
4–5), the plan, `branch-review.diff` (read in full), the six per-task reviews and the ledger, the
engine sources the diff consumes (`src/uwb/phy.ts`, `channel.ts`, `session.ts`, `position.ts`,
`src/model/scenario.ts`, `src/ui/store.ts`, `src/player/player.ts`), and a live run of the app.

Verification (worktree clean at d0735ed):

- `npx vitest run` → 97 files, **1101 tests passed**, exit 0.
- `npx tsc -b` → exit 0. `npx vite build` → built, exit 0 (the pre-existing >500 kB chunk warning).
- Fixture diff `265ed91..d0735ed` of `tests/fixtures/lesson-hashes.json`: five keys **added**
  (`uwb-blocks`, `uwb-blocks#0`, `uwb-position`, `uwb-position#0`, `uwb-position#1`), nothing
  changed or removed — no Wi-Fi, AMP or household hash moved.
- Live check on the dev server already serving this worktree (port 5176), EN and ZH: placed four
  anchors and a tag on the default plan; deleted STA-1, STA-2, then the AP (button enabled only
  after the STAs were gone; STA / AMP / Spawn tools greyed, AP tool re-enabled); simulated the
  AP-less plan — no console error, no page error, BSS totals table empty of UWB lanes, anchors
  drawn as boxes and the tag as a slab, range rings on the floor at 25 ms and visibly faded at
  160 ms; back in the editor deleted the tag — the red schema line "a UWB session needs at least
  one anchor and one tag (found 4 and 0)" appeared under the session section and 🗑 Remove
  session stayed disabled; simulating that state surfaced the same message as a Simulation error
  instead of crashing; re-adding the tag cleared the issue. ZH session section renders
  "每轮 10 个时隙 · 每块 10 轮". The Guide window opens with the UWB glossary group live.

## Verdict

**APPROVED** — no blocking findings; the two important items (a ZH lesson sentence quoting the
English editor string, and one Part C clause the plan silently dropped) are small follow-ups that
touch no engine code, and everything else is minor.

## What the whole-branch pass checked (and found sound)

**Integration with the core plan.** `UwbRangeView.block` and `UwbPositionView.block` are set in the
reducer from `UWB_RANGE.block` / `UWB_POSITION.block` (`src/uwb/view.ts:77,94`) and consumed only by
the overlay's age rule (`src/uwb/scene.ts:129,143`); the two stale-drop tests pin both. `UWB_ROUND_END`
is consumed by lesson 4's jump list through the new `firstUwbRoundEnd` predicate. `roundPlan` is
called with the same `(session, anchorCount)` shape in the overlay, `UwbSessionFields`, both lessons
and their tests. `uwbSessionIssue` runs `ScenarioSchema.safeParse` and never re-encodes a rule (the
ledger's ruling), so the editor's red line and the run-time error are the same text — confirmed live.
`ELLIPSE_DRAW_SCALE` is 10 in `scene.ts`, and the EN/ZH Guide are pinned to it by
`tests/ui/uwb-guide.test.ts:96-98`. No import cycle: `uwb/ui/*` → `editor/planOps` →
`model/scenario` → `uwb/phy` (a leaf); `editor/planOps` never imports `uwb/ui`. No dead exports
(`UWB_*_COLOR`, `GuideEn`/`GuideZh`, `uwbBlocksScenario`, `uwbPositionScenario`, `UwbPositionVariant`
are all consumed by tests or the app).

**Scene.** Axis convention matches `effects.ts` (`three.x = x`, `three.z = y`, floor at `y = 0.01`);
the ellipse rotation `rotation.y = −θ` is correct (a +θ turn in the model's (x, y) plane is a −θ
rotation about scene-up, re-derived by hand: `(1,0,0)` → `(cos θ, 0, sin θ)`); fade is clamped at
both ends and keyed to the tag's own round end; objects are reused by name and disposed
(geometry + material) on removal and on `dispose()`; the viewport gate `sc.uwb && some(kind ===
'uwb')` is exactly the constructor's precondition, so the throw is unreachable from the app; a
scenario reload remounts the Viewport via `key={vp-${mode}-${simSession}}` (`App.tsx:106`), so the
overlay's captured anchor positions can never go stale.

**Editor state safety.** Every action was walked: first anchor → session opened, issue "(found 1
and 0)" shown; first tag → valid; delete AP → allowed only with no `sta`/`amp`, selection cleared;
delete last UWB node → `removeNode` drops `sc.uwb`; delete last tag but keep anchors → issue shown,
Remove disabled; imported orphan session → section visible, Remove enabled; slot / block fields
clamp to the schema's bounds and to whole 3-RSTU units on blur; method / anchor-count changes that
oversubscribe the block or overflow the Final are reported; an invalid state that is run anyway is
caught by the worker and shown as a Simulation error. No sequence produces an unreported invalid
scenario.

**Lessons as a learner.** Every number in lessons 4 and 5 was re-derived independently of the tests
(bearings 64.6/89.4/95.2/110.8°, row lengths 0.968–0.985, 4σ_r·GDOP = 8.9 cm, 0.5996 m, 53 %,
3.5×, 37.9° → GDOP 2.32, 282/285/300 RSTU with the 697 ns margin, 267 572 ns → 324 RSTU, 11.8 %,
4 µs, the 39-octet Poll, 1 934 334 = 1 934 230 + 8 × 13 ns, 140 ms of empty rounds, "seven"
empty rounds, 16 ms / 12 rounds after deleting an anchor). Lessons 1–5 now teach the Part D arc end
to end; lesson 3's 9.67 % and lesson 4's 10 % / 0.97 % are numerically consistent (see M10 for the
wording). No seed-only sentence is unpinned.

**Docs spot checks against the engine.** RMARKER 36 576 chips = 73.269 µs, RCTU 15.650 ps, 40-bit
wrap 17.2 s, RSTU 833.333 ns, STS 33 792 chips = 67.692 µs, channel 5/9 MHz and the constant 1.8 dB
(`uwbPl0Db` 48.69 vs 50.50 dB), NLOS 0.2/0.5/2.0 ns = 0.06/0.15/0.60 m, σ_r = 2.1 cm, 20 ppm × 2 ms
= 20 ns ≈ 6 m, 2N + 2 slots, Final 14 + 12N octets, ≤ 9 anchors, ARC 10 / RDM 3 + 3N / RRTI 6 /
RMI 3 + 6N and 13 octets — all match `src/uwb/phy.ts`.

## Findings (most severe first)

No blocking findings.

### I1 — IMPORTANT: lesson 4 (ZH) quotes the English editor string a Chinese learner never sees

`src/course/uwb/uwb-blocks.ts:143` (tryThis 2, `zh`): "再看 UWB 会话那一栏：“slots per round 8 ·
rounds per block 12”". The ZH editor renders `strings.zh.editor.uwbPlan(8, 12)` = "每轮 8 个时隙 ·
每块 12 轮" (`src/ui/i18n.ts`, confirmed live). This is the stated-vs-UI drift class the project
tracks, and the only place in the two lessons where a localised UI string is quoted in the wrong
language (lesson 5's ZH observe 2 correctly quotes "误差椭圆（1-σ）", the ZH inspector label; the
event-log quotes are English in both languages by design). The test at
`tests/course/uwb-blocks.test.ts:548` pins the numbers, not the string. **Do:** quote the ZH form
and pin the sentence against `strings.zh.editor.uwbPlan(8, 12)` (and the EN one against
`strings.en.editor.uwbPlan(8, 12)`) so a relabel cannot silently break it.

### I2 — IMPORTANT: spec Part C "the spawn tool can add both" was not implemented and not recorded

Spec `docs/superpowers/specs/2026-09-18-uwb-ranging-design.md` §Part C · Editor: "…a **UWB session**
section … shown when the plan has UWB nodes; **the spawn tool can add both**". 🎲 Spawn is unchanged
(`spawnRandomStas`, `src/editor/planOps.ts:155`, STAs only) and is now greyed out without an AP.
The plan's Task 2 omitted the clause and no ledger ruling retires it, so this is a silent spec
deviation rather than a decision. **Do:** either amend the spec line (the placement tools cover
the use case and random anchor placement is of doubtful value) or add anchors/tags to the spawner;
record whichever in the ledger.

### M1 — MINOR: a stale "Simulation error" banner survives into edit mode (pre-existing, now reachable)

`src/ui/store.ts:113-116` — `setMode('edit')` clears `view`/`playhead` but not `simError`, so after
running an invalid plan the banner "a UWB session needs at least one anchor and one tag (found 4
and 0)" stays above the editor even after the plan is fixed (confirmed live: 4 anchors + 1 tag,
banner still up). The branch did not introduce it, but it made every schema-invalid UWB state
reachable from the editor and reports the same text in red under the session section, so the
learner now sees two copies, one of them stale. **Do:** `simError: null` in the `else` branch. While
there: the run-time text is the raw `ZodError` JSON (`[{ "code": "custom", "message": … }]`); the
issue message alone reads better and is what the editor already shows.

### M2 — MINOR: lesson 5 credits lesson 2 with a formula lesson 2 never states

`src/course/uwb/uwb-position.ts` (body, "The ellipse around the cross", EN and ZH): "Lesson 2 fixed
σ_r at c·σ_ts/√2, 2.12 cm at 100 ps". Lessons 1 and 2 quote "2.1 cm of range-noise sigma" /
"timestamp noise, whose 1-σ is 2.1 cm" (`uwb-intro.ts:107`, `uwb-sstwr.ts:129`) but the `c·σ_ts/√2`
form appears nowhere in lessons 1–3 (no `√` in any EN sentence); it is first derived here and in the
Guide/glossary. **Do:** "Lesson 1 quoted σ_r = 2.1 cm; it is c·σ_ts/√2, …" (same word count).

### M3 — MINOR: EditorGuide's import entry still says "exactly one AP"

`src/editor/EditorGuide.tsx:90` (EN: "Imports are schema-validated: exactly one AP, unique node
ids.") and `:320` (ZH: "有且仅有一个 AP"). Since 42f941b the schema requires an AP only when a
station or AMP tag exists (`src/model/scenario.ts:397-400`), and the same file's 🗑 Delete node entry
says so. **Do:** "exactly one AP whenever a station or AMP tag is present".

### M4 — MINOR: the timestamp-noise hint says "3 cm of range" beside panels that say 2.1 cm

`src/ui/i18n.ts:351` "100 ps of timing is 3 cm of range" / `:725` "折合 3 cm 的测距误差";
`src/editor/EditorGuide.tsx:220` "(100 ps is 3 cm)" / `:435`. c·100 ps = 3.0 cm is a *flight*
distance; the range σ the lessons, Guide, glossary and README all teach is c·σ_ts/√2 = 2.1 cm, and
the inspector's ellipse is built from that. A learner reading the hint and the Guide side by side
gets two numbers for the same knob. **Do:** "3 cm of flight — 2.1 cm of range after the TWR
formula" (and the ZH twin).

### M5 — MINOR: one edition cited as "802.15.4z" where the rest of the branch cites 802.15.4-2024

`src/editor/EditorGuide.tsx` (📍 UWB anchor entry, EN "IEEE 802.15.4z ranging anchor" / ZH
"IEEE 802.15.4z 测距锚点") and `src/ui/i18n.ts` `uwbNode: 'UWB ranging (802.15.4z)'` / '(802.15.4z)'.
README, Guide §11, the glossary title and both lessons cite IEEE Std 802.15.4-2024; the core review's
honesty rule asked for one edition. Not wrong (4z is the amendment that introduced the ranging
IEs), just inconsistent. **Do:** "802.15.4-2024" or "802.15.4z (now 802.15.4-2024)" in both places.

### M6 — MINOR: technology UI reaches back into the core editor for `clampField`

`src/uwb/ui/UwbNodeFields.tsx:8`, `src/uwb/ui/UwbSessionFields.tsx:9` import `clampField` from
`../../editor/planOps`. No cycle (see above), but the plan's architecture is "core files get one
hook each; new UWB code stays under `src/uwb/`", and this is the only `uwb/` → `editor/` edge. **Do
(next slice):** move `clampField` to a leaf (`src/ui/fields.ts`, like `fmtTime.ts` was for the
format cycle) and import it from both sides.

### M7 — MINOR: `uwbSessionIssue` matches on message wording

`src/editor/planOps.ts:296` `issue.path.includes('uwb') || /\bUWB\b|ranging/i.test(issue.message)`.
The four session rules are added with no path (`scenario.ts:405-441`), so the regex is what actually
catches them today. The first coexistence rule that mentions UWB on a Wi-Fi path (e.g. "6 GHz
channel … overlaps UWB channel 5") will be reported under the session section. **Do:** give the
schema's UWB issues `path: ['uwb']` and drop the regex.

### M8 — MINOR: the ellipse factor is retyped as a literal in three places, two of them unpinned

`src/ui/Guide.tsx:170,339` (`<b>10×</b>`, pinned by the Guide test), `src/ui/glossary.ts` ("drawn at
10×", twice, EN/ZH) and `README.md:25` ("drawn at 10×") — the last two are not pinned to
`ELLIPSE_DRAW_SCALE`. The plan's pre-flight said "imports the constant, never retypes it". The
constant already changed once on this branch (3 → 10 in 3aad62a). **Do:** extend
`tests/ui/uwb-guide.test.ts` to the glossary text and README, or interpolate the constant in the
glossary.

### M9 — MINOR (note): the timeline fixture cannot see the wall variant

`tests/fixtures/lesson-hashes.json`: `uwb-position` and `uwb-position#0` share the hash `d331c1b`.
This is correct: the hash covers `t:seq:type` only (`simulation.ts:309-317`) and the NLOS excess is
applied to the RMARKER counters, not to delivery (`channel.ts:150-165` delivers at `t + ceil(propNs)`,
carrying `nlosNs` to the receiver). So the fixture guards Wi-Fi timing but is blind to UWB
timestamp-level physics; `tests/course/uwb-position.test.ts:469-580` carries that load. Nothing to
change now; see the carry list.

### M10 — MINOR: three ratios called "duty cycle" across lessons 3 and 4

`src/course/uwb/uwb-dstwr.ts:104,172` call 9.67 % (airtime inside the 20 ms *round*) "the duty
cycle"; `src/course/uwb/uwb-blocks.ts` opens "What the radio actually costs" with two more — the
10 % schedule share and the 0.97 % radio share *of the block* — and says "two different shares …
both get called a duty cycle". The numbers agree (0.967 % = 9.67 % / 10 rounds) and nothing is
contradicted, but the learner meets three ratios under one word in consecutive lessons. **Do:** one
clause in lesson 4 ("lesson 3's 9.67 % was of the round; of the block it is 0.97 %") — the lesson
has ten words of budget left, so trade a clause.

Parked items not re-reported: Task 2's re-placed-AP ordering/`mumimo` note; Task 6's three cosmetic
nits; schema messages shown in English in the ZH editor.

## Carry to the next slice

1. **Overlay assumes tag-initiated TWR.** `UwbOverlay.update` draws one ring per `(tag, anchor)`
   from the tag lane's `ranges` and ages everything by `roundEndNs(block, u.round)` with a constant
   `roundNs` and the tag's fixed round index. DL-TDoA (the tag only listens, no per-anchor two-way
   range), UL-TDoA (blinks), contention-based rounds and round hopping (round index varies per block)
   and AoA (a bearing glyph, not a ring) each break one of those assumptions. Have the reducer stamp
   a `roundEndNs` (or `freshUntilNs`) on `UwbRangeView`/`UwbPositionView` so the overlay stops
   recomputing the schedule, and key drawings by fix source.
2. **`roundPlan(sc.uwb, anchorCount)` with the anchor count recomputed ad hoc** in `scene.ts`,
   `UwbSessionFields`, both lessons and the tests. Centralise as `sessionPlan(sc)` before
   contention-based rounds change the plan's shape.
3. **Schema issue tagging** (M7) and **`clampField` leaf** (M6) — both trivial, both easier before
   the coexistence rules land.
4. **Fixture blindness** (M9): the 6E/UWB slice changes RX outcomes (RX_FAIL registers in the hash)
   but interference-induced timestamp error will not. Add a UWB digest to the fixture (e.g. fold
   `UWB_RANGE.distM` to the millimetre and `UWB_POSITION.x/y` into a second hash per UWB lesson).
5. **Wi-Fi + UWB in one plan** is already legal and untested by the editor tests: `hasAp` gating,
   `canDeleteNode` and the BSS-totals filter `!n.uwb` all assume UWB never needs the AP. The
   coexistence lesson will be the first mixed scene; add an editor test for "AP + STA + anchors +
   tag" and the delete rule then.
6. **Word budgets**: lessons 4 and 5 sit 10 and 6 words under the 25-minute ceiling; I1, M2 and M10
   must trade words, not add them.
7. **Stale banner / raw ZodError text** (M1) — one line in the store, worth taking with any UI touch.
8. **Spec Part C spawn clause** (I2) — decide and record.
9. **Localised schema messages** (parked): with three UWB rules and a coexistence rule coming, an
   `issueKey` → i18n table will be cheaper than translating `message` strings after the fact.

## Re-review (fix wave)

Reviewed `8c3993d..61e4684` (spec amendment `8c3993d` plus three fix commits `48221b5`, `32ed89e`,
`61e4684`) against I1–I2, M1–M8 and M10 above, from `fix-wave.diff` (content-identical to
`git diff 8c3993d..HEAD`: 266 changed lines each, none differing) and `fix-wave-report.md`, with the
touched files re-read where the diff context was not enough.

Verification at `61e4684`, worktree clean:

- `npx vitest run` → 97 files, **1110 tests passed**, exit 0 (+9 over the 1101 reviewed above).
- `npx tsc -b` → exit 0. `npx vite build` → built, exit 0 (the pre-existing chunk-size warning).
- `tests/fixtures/lesson-hashes.json`: no diff across `d0735ed..61e4684`. No scenario, seed or
  engine timing changed — the wave touches prose, editor plumbing, the schema's issue *paths* and
  the error text; no `addIssue` condition moved.

### Verdict

**APPROVED** — every ruled item is closed as ruled; no regression; one new architectural nit
recorded for the carry list, not worth another round.

### Item by item

| Item | Ruling | Closed? | Where / how checked |
|---|---|---|---|
| I1 ZH try-this quotes the EN editor string | quote the ZH editor via `STRINGS.zh` | **yes** | `uwb-blocks.ts:143` now "每轮 8 个时隙 · 每块 12 轮" = `STRINGS.zh.editor.uwbPlan(8, 12)`; pinned for both languages from `roundPlan(SESSION, ANCHORS − 1)` in `tests/course/uwb-blocks.test.ts` ("each language quotes the plan line its own editor prints") |
| I2 spawn clause | spec amendment | **yes** | `8c3993d` rewrites the Part C sentence: random spawn adds stations only, UWB nodes placed with their tools, the AP tool restores an AP — matches `spawnRandomStas` and `newAp` as shipped |
| M1 stale banner + raw ZodError | clear + friendly text | **yes** | `store.ts` edit/guide branch sets `simError: null`; `scenarioErrorText` (`model/scenario.ts`) joins issue sentences, used by `sim.worker.ts`; pinned in `tests/model/scenario.test.ts` (AP-less plan → exactly "scenario must have exactly one AP (found 0)", no `"code"`) |
| M2 lesson 2 credited with the formula | reword | **yes** | "Lesson 1’s 2.1 cm of σ_r is c·σ_ts/√2, 2.12 cm at 100 ps" / ZH twin; pinned from `SIGMA_R`, lesson 1 asserted to print "2.1 cm of range-noise sigma", lesson 2 asserted not to contain the formula. +2 words, lesson 5 at 1720 ≤ 1724 (`lessonMinutes` still 25, pinned) |
| M3 "exactly one AP" import entry | reword | **yes** | `EditorGuide.tsx` EN "exactly one AP whenever a station or AMP tag is present" / ZH "只要存在终端或 AMP 标签，就必须有且仅有一个 AP" — matches `scenario.ts` |
| M4 "3 cm of range" hint | flight vs range | **yes** | `i18n.ts` `uwbTsNoiseHint` EN/ZH and `EditorGuide.tsx` EN/ZH name 3 cm of flight and 2.1 cm of range; `tests/ui/i18n.test.ts` derives both from `C_M_PER_NS` and `rangeSigmaM(100)` |
| M5 "802.15.4z" | one edition | **yes** | `EditorGuide.tsx` anchor entry EN/ZH and `i18n.ts` `uwbNode` EN/ZH → "802.15.4-2024" (plain form; acceptable) |
| M6 `clampField` leaf | move to a leaf | **yes** | new `src/ui/inputs.ts` (imports nothing); `planOps.ts` re-exports it (editor and existing tests untouched); both `uwb/ui/*` import the leaf — `src/uwb/ui/` → `src/editor/` edge gone |
| M7 issue matching by wording | tag paths, drop regex | **yes** | all five ranging `addIssue` calls carry `path: ['uwb']`; `uwbSessionIssue` claims `path[0] === 'uwb'` or a `['nodes', i, …]` issue where node `i` is `kind === 'uwb'`; regex removed; three new cases in `tests/editor/uwb-planOps.test.ts`, including the guard that every issue *worded* UWB/ranging is *rooted* at `uwb` |
| M8 ellipse factor retyped | pin / interpolate | **yes** | `Guide.tsx` and `uwb-position.ts` (body, observe 3, quiz distractor, EN/ZH) interpolate `ELLIPSE_DRAW_SCALE`; glossary entry (all four strings) and README pinned to the constant in `tests/ui/uwb-guide.test.ts`; "ten" → "10" keeps the word count |
| M9 fixture blindness | note only | n/a | still on the carry list |
| M10 three ratios called "duty cycle" | one name per ratio | **yes** | lesson 3 "channel occupancy" / 信道占用率 (`uwb-dstwr.ts:104,172`), lesson 4 "schedule share" / "radio-on share" (调度占比 / 射频开启占比); no words added (1705 / 1712), budgets pinned |

The five deviations the report lists (M2 +2 words instead of +4; `inputs.ts` not `fields.ts`; plain
"802.15.4-2024"; no cross-reference clause for M10; an unasked-for test for `scenarioErrorText`)
are all within the rulings or improvements on them.

### Remaining findings

None blocking, none important. One new **minor**, for the carry list rather than another round:

**R1 — MINOR: `ELLIPSE_DRAW_SCALE` now pulls `three` into the course and the Guide.**
`src/course/uwb/uwb-position.ts:20` and `src/ui/Guide.tsx:2` import the constant from
`src/uwb/scene.ts`, which imports `three` and `./session`. Neither the worker nor `model/` reaches
it (checked: `sim.worker.ts` imports only `Simulation` and `scenarioErrorText`), the main bundle
already carries `three`, and every test suite already loaded it — so nothing regresses. But it is
the first `src/course/` → three.js edge, and the constant is a presentation number, not scene
machinery. **Do (next slice):** move `ELLIPSE_DRAW_SCALE` to a leaf (`src/uwb/phy.ts` beside the
other model constants, or `src/uwb/constants.ts`) and re-export it from `scene.ts`.

Carry list above stands, with R1 added to item 3 and M9 unchanged.
