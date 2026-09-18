# SDD ledger — plan: docs/superpowers/plans/2026-09-19-uwb-positioning.md

Worktree: D:\wifi_sim\.claude\worktrees\feat-link-2g (branch feat/uwb-ranging, continuing after the core plan at 265ed91)
Spec: docs/superpowers/specs/2026-09-18-uwb-ranging-design.md (Part C, Part D lessons 4–5)
Baseline: 999 tests green, tsc + build clean at 265ed91.

## Pre-flight scan

| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| core fix wave ↔ T1 | `UWB_ROUND_END` record exists; `UwbRangeView.block` — T1 adds it if the fix wave did not (checked at dispatch) | consistent |
| T1 ↔ viewport | `UwbOverlay.group/update/dispose`; viewport adds it only when UWB nodes exist | consistent |
| T1 ↔ T3 | `ELLIPSE_DRAW_SCALE = 3` quoted in the Guide | T3 imports the constant, never retypes it |
| T2 ↔ schema | `uwbSessionIssue` must mirror the schema's own messages: implement it by running `ScenarioSchema.safeParse` and picking the first UWB issue, not by re-encoding the rules | ruling recorded here for the T2 brief |
| T2 ↔ core phy | `rstuNs`, `uwbSlotsPerTag`, `uwbSlotFitNs` live in `src/uwb/phy.ts`; `roundPlan` in `session.ts` | consistent |
| T2 ↔ T5 | lesson 4's "delete one anchor in the editor" try-this depends on T2's editor | T2 precedes T5 |
| T4 | may be empty | skip commit if nothing left |
| T5 ↔ slot-fit rule | minimum slot for four anchors = ceil((236 803) / 833.333) = 285 RSTU (multiple of 3 → 285) | the lesson pins the boundary the schema enforces, not the plan's literal |
| T5/T6 ↔ hashes | additions only | guarded per task |
| Global | Wi-Fi hashes unchanged | guarded by the fixture |

Model plan: T1–T3 opus implementer / opus reviewer; T4 sonnet; T5–T6 opus.

## Progress
Task 1: dispatched (base 265ed91, opus)
Task 1: implemented (commit 39b7385). Ruling: ELLIPSE_DRAW_SCALE 3 -> 10 (a 2 cm sigma at 3x is a dot) - follow-up commit requested before review
Task 2: dispatched (base 39b7385, opus; editor files only)
Task 1: follow-up (commit 3aad62a); review dispatched (opus)
Task 1: review approved (5 minor). Ruling: fix 1-5 now (opacity clamp; fix/ellipse age via UwbPositionView.block; key prefixes; physicalId on peer; throw instead of session fallback). Fix round 1: resumed implementer
Task 1: fix round 1 (commit 2a24bae); scoped re-review dispatched
Task 1: complete (commits 265ed91..2a24bae + viewport gate fix by the controller, re-review approved)
Task 3: dispatched (base 1c2b74a, opus; Guide/glossary/README + tests/ui only, in parallel with Task 2 which owns the editor files and i18n editor strings)
Task 2: implemented (commit 42f941b). Rulings: `issue` prop accepted; schema messages stay English (the rules live in the schema by ruling) - parked as a known gap; per-role id numbering accepted; slot-fit example in the brief was wrong (threshold 6 anchors)
Task 2: review dispatched (opus)
Task 3: implemented (commit a03085d; GuideEn/GuideZh exported for the SSR test - accepted)
Task 3: review dispatched (opus)
Task 4: nothing left from the core carry list after T1-T3 (sigma, round-end, axis, editor, guards, BSS totals all closed); schema messages unlocalised parked. No commit.
Task 5: dispatched (base a03085d, opus)
Task 2: review: spec approved, quality CHANGES REQUIRED (blocking: no way to add an AP back; 9 minor). Rulings: AP tool + newAp; disable STA/AMP/spawn without AP; hint text; hide plan without anchors; ppm label; RSTU fields clamp on blur; memoise safeParse; clear selection on delete; merge ppm patch; session section visible whenever sc.uwb with remove button. Fix round 1: resumed implementer
Task 3: review: spec approved, quality CHANGES REQUIRED (blocking: README tags the 40-bit counter as standard; 5 minor). Ruling: fix all six. Fix round 1: resumed implementer
Task 2: fix round 1 (commit 3fc67c2); scoped re-review dispatched
Task 3: fix round 1 (commit f7334a9; ruling 2 taken as drop-the-clause); scoped re-review dispatched
Task 2: complete (commits 1c2b74a..42f941b + 3fc67c2, re-review approved; 1 minor parked for the final fix wave)
Task 3: complete (commits a03085d + f7334a9, re-review approved)
Task 5: implemented (commit 3f73852). Rulings: radio-on measured (0.97 % tag / 1.22 % anchor) vs schedule share (10 % / 30 %) - lesson teaches both, accepted; schema floor 300 RSTU means 285 is refused - lesson pins 282/285/300, accepted
Task 5: review dispatched (opus)
Task 6: dispatched (base 3f73852, opus)
Task 5: review: spec approved, quality CHANGES REQUIRED (2 blocking prose errors: "seven" slots is six; 2 448 546 vs 3 x 816 180; 7 minor). Ruling: fix all nine. Fix round 1: resumed implementer
Task 5: fix round 1 (commit 69ebb08); scoped re-review dispatched
Task 5: complete (commits f7334a9..3f73852 + 69ebb08, re-review approved)
Task 6: implemented (commit e68526a; 1100 tests). Review dispatched (opus)
Task 6: review: spec approved, quality CHANGES REQUIRED (2 blocking geometry claims false: bearings at (9.5,0.5); off-centre GDOP causal claim reversed; 9 minor). Ruling: fix all eleven. Fix round 1: resumed implementer
Task 6: fix round 1 (commit d0735ed); scoped re-review dispatched
Task 6: complete (commits 69ebb08..e68526a + d0735ed, re-review approved; 3 cosmetic nits parked)
All 6 tasks complete at d0735ed (1101 tests). Whole-branch review dispatched (fable) over 265ed91..d0735ed
Whole-branch review (fable): APPROVED, 0 blocking, 2 important, 10 minor. Rulings: I2 resolved by spec amendment (spawn = stations only); I1 + M1-M8 + M10 in ONE fix wave; M9 note only. Fix wave dispatched (opus)
Fix wave: commits 48221b5 32ed89e 61e4684 (1110 tests). Scoped re-review dispatched (fable)
Fix wave re-review (fable): APPROVED, 1 minor (R1) fixed by the controller (constant moved to view.ts). PLAN COMPLETE (1110 tests). Ledgers exported.
