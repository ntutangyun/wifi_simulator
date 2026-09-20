# SDD ledger — plan: docs/superpowers/plans/2026-09-19-uwb-aoa.md

Worktree: D:\wifi_sim\.claude\worktrees\feat-link-2g (branch feat/uwb-ranging; started while slice 5's last lesson review runs)
Spec: docs/superpowers/specs/2026-09-19-uwb-slices-design.md (Slice 6)

## Pre-flight scan

| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1 ↔ slice 5 | `UWB_POSITION.method` and `of` already exist (TDoA); AoA adds `'aoa'` | consistent — the type already lists 'aoa' |
| T1 device | the anchor computes AoA on every response it receives; single-anchor fix only when the anchor holds a range this round (DS after the Final) — SS anchors emit AoA only | ruling recorded; the lesson uses DS |
| T1 overlay | bearing line keyed like rings, ages with the block | consistent |
| T2 scene | tag positions must stay inside `oneRoom()` (10 × 8); the "behind the anchor" variant via yaw 270 with the tag in the room | consistent |
| Global | `aoa: false` byte-identical; fixture unchanged until T2 | guarded |

Model plan: T1 opus, T2 opus, T3 sonnet; reviewers opus / sonnet.

## Progress
Task 1: dispatched (base b4ac444, opus; in parallel with the slice-5 Task 5 review, read-only)
Task 1: implemented (commit 275f031). Ruling: single-anchor fix must use the horizontal range sqrt(r^2 - dz^2) (18 cm bias at the lesson geometry otherwise) - follow-up requested before review; UwbPositionView.anchors accepted; mid-round flicker with several AoA anchors accepted (lesson uses one)
Task 1: follow-up (commit 2b01118). Review dispatched (opus)
Task 2: dispatched (base 2b01118, opus; lesson)
Task 3: dispatched in parallel (base 2b01118, sonnet; docs only)
Task 1: complete (commits 275f031 + 2b01118, review approved; 4 low parked)
Task 3: implemented (commit c800e4e). Review dispatched (sonnet)
Task 3: review: spec approved, quality CHANGES REQUIRED (major: Guide cross-range formula uses slant range; minor: unpinned numbers). Fix round 1: resumed implementer
Task 3: fix round 1 (commit be26ffb); scoped re-review dispatched
Task 3: complete (commits c800e4e + be26ffb, re-review approved)
Task 2: implemented (commit 32c5df4; yawDeg -90 for the behind variant; 1.88 cm; 9 cm bound - accepted). Review dispatched (opus)
Task 2: review: spec approved, quality CHANGES REQUIRED (required: try-this sigma numbers are per-draw not design sigma; 4 minor). Fix round 1: resumed implementer
Task 2: fix round 1 (commit 5139da3); scoped re-review dispatched
Task 2: complete (commits 32c5df4 + 5139da3, re-review approved). SLICE 6 PLAN COMPLETE at 5139da3. Combined whole-branch review of slices 3-6 dispatched (fable), base f8c1f1a
Combined whole-branch review (fable): APPROVED, 0 blocking, 1 important (DL coffs printed as fraction), 6 minor. Rulings: ONE fix wave for findings 1-7 plus every parked minor of the four slice ledgers; schema rejects aoa outside twr (finding 7 + parked aoa T1 #5). Fix wave dispatched (opus)
Fix wave: commits 5684d58..c7d2289 (9 commits, 1440 tests). Scoped re-review dispatched (fable)
Fix wave re-review: the fable agent was terminated by a rate limit mid-review; re-dispatched on opus (scoped re-review)
Fix wave re-review (opus): APPROVED, 1 minor (120 m headline) fixed by the controller in 27f7dd5. SLICES 3-6 COMPLETE. Ledgers exported; branch fast-forwarded to main per the user instruction of 2026-09-20.
