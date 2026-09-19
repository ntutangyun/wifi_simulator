# SDD ledger — plan: docs/superpowers/plans/2026-09-19-uwb-contention.md

Worktree: D:\wifi_sim\.claude\worktrees\feat-link-2g (branch feat/uwb-ranging, after slice 3 at 16e4711)
Spec: docs/superpowers/specs/2026-09-19-uwb-slices-design.md (Slice 4)

## Pre-flight scan

| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1 → T2 | `schedule/contentionSlots/maxAttempts`, `RoundPlan.schedule`, `slotAction anchor −1`, poll IEs RCPS/RCMA | consistent |
| T2 feedback model | SS gives the anchor no feedback; the network tells the anchor at round end whether it was heard (model) | ruling recorded; the lesson states it |
| T2 ↔ channel | collisions rely on the existing 6 dB rule in `UwbChannel`; equal-distance anchors collide | consistent |
| T3 ↔ T2 | `UWB_CONTEND` fields, `contendCollisions` on the tag lane | consistent |
| Global | `schedule: 'time'` byte-identical; fixture unchanged until T3 | guarded |

Model plan: T1 sonnet, T2 opus, T3 opus, T4 sonnet; reviewers opus for T2–T3.

## Progress
Task 1: dispatched (base 16e4711, sonnet; in parallel with slice-3 Task 5 review, which is read-only)
Task 1: implemented (commit 7abebde). Review dispatched (sonnet)
Task 2: dispatched (base 7abebde, opus)
Task 1: complete (commit 7abebde, review approved; minor: uwbSlotFitNs uses the Final even in contention - parked for the combined fix wave)
Task 2: implemented (commit a25364d). Rulings: UWB_CONTEND_COLLISION also on captured slots (an answer was lost) accepted; the lesson must say sit-outs thin the field so measured successes sit above the analytic value at small S. Review dispatched (opus)
Task 3: dispatched (base a25364d, opus)
Task 4: dispatched in parallel (base a25364d, sonnet; docs files only)
Task 2: complete (commit a25364d, review approved; 7 minors parked for the combined fix wave)
Task 4: implemented (commit bb2423f; RCPS/RCMA full names confirmed against the 802.15.4-2024 TOC: Ranging Contention Phase Structure IE, Ranging Contention Maximum Attempts IE). Review dispatched (sonnet)
Task 4: review: CHANGES REQUIRED (blocking: CJK inside alt.en for the three new terms). Fixed by the controller directly + a language-separation test; Task 4 complete
Task 3: implemented (commit f6b990b; measured S=4 above the formula, S=8/16 below - lesson explains via contenders/round; unbriefed finding: draw = reply time so range error scales with the slot). Review dispatched (opus)
Task 3: complete (commit f6b990b, review approved; 6 minors parked). SLICE 4 PLAN COMPLETE at f6b990b (combined whole-branch review after slice 6). Parked: T1 slot-fit in contention, T2 x7, T3 x6
