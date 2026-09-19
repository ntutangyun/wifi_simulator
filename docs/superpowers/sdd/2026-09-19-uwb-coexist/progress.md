# SDD ledger — plan: docs/superpowers/plans/2026-09-19-uwb-coexist.md

Worktree: D:\wifi_sim\.claude\worktrees\feat-link-2g (branch feat/uwb-ranging, after the positioning plan at f8c1f1a; spec 0493ab7)
Spec: docs/superpowers/specs/2026-09-19-uwb-slices-design.md (Slice 3)
Baseline: 1110 tests green, tsc + build clean.

## Pre-flight scan

| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1 ↔ T2 | `UWB_BAND_MHZ`, `uwbInBandDbm`, `uwbPl0Db` used by the Spectrum's arithmetic | consistent |
| T1 ↔ T3/T4 | `sixGhzCenterMhz` read by Simulation to decide whether to build the Spectrum; `uwbBandOverlap` | consistent |
| T2 ↔ T3/T4 | `Spectrum.emit/retire/onChange/foreignMw`, `Emission` shape | consistent |
| T3 ↔ Wi-Fi hashes | the channel's behaviour must be byte-identical when no spectrum is passed | guarded by the fixture |
| T3 ↔ T4 | one Spectrum instance shared by the 6g Channel and the UwbChannel, created in Simulation | T3 creates it and passes to the Channel; T4 passes it on to UwbNetwork — T3 leaves a documented hand-off (the variable exists before UWB wiring) |
| T4 ↔ T5 | `UWB_INTERFERED` record fields used by the lesson test | consistent |
| T5 ↔ curriculum | TIERS[5], modules 13/14, COURSE_ORDER five ids (four lessons of later slices are ids without lessons: `orderLessons` skips ids with no authored lesson, per curriculum.ts) | consistent |
| Spec ↔ T5 lesson | base laptop profile is `browsing` (moderate duty) so counts are informative; `saturated` is a variant | Ruling: deviates from the spec's sentence ("a laptop running a saturated download") on purpose — spec updated in the ledger, costs nothing |
| Global | existing hashes unchanged through T4 | guarded |

Model plan: T1 sonnet; T2–T4 opus; T5 opus; T6 sonnet. Reviewers: opus for T2–T5, sonnet otherwise.

## Progress
Task 1: dispatched (base fdd88c2, sonnet)
Task 2: dispatched in parallel (base fdd88c2, opus; new files only, no imports from T1 symbols)
Task 2: implemented (commit cef2f62). Review dispatched (opus)
Task 1: implemented (commit 6b4d748). Review dispatched (sonnet)
Task 3: dispatched (base 6b4d748, opus)
Task 2: review: spec approved, quality CHANGES REQUIRED (blocking: retire txId fallback removes a live emission; 5 minor). Rulings: identity-only retire; export PL0_DB/PL_EXP from propagation; import UWB_PL_EXP; phase-1 notification kept and documented; uwbChannelOf bounded via UWB_CHANNEL_MHZ; by-reference documented. Fix round 1: resumed implementer
Task 1: complete (commit 6b4d748, review approved; 2 style minors parked)
Task 2: fix round 1 (commit d5334d4); scoped re-review dispatched
Task 2: complete (commits cef2f62 + d5334d4, re-review approved; 3 minors parked)
Task 3: implemented (commit 7995c4f; gate widened to max(widest, 160) - accepted). Review dispatched (opus)
Task 4: dispatched (base 7995c4f, opus)
Task 3: complete (commit 7995c4f, review approved; 4 minors parked for the fix wave)
Task 4: implemented (commit d987c3e; measured: saturated laptop 1 m from the tag -> 33 interfered/s, 0 fixes; channel 7 -> byte-identical). Review dispatched (opus)
Task 5: dispatched (base d987c3e, opus; course files)
Task 6: dispatched in parallel (base d987c3e, sonnet; Guide/glossary/README/EditorGuide only)
Task 4: complete (commit d987c3e, review approved; 3 minors parked)
Task 6: implemented (commit 47dd7fb). Review dispatched (sonnet)
Task 6: review: quality approved, spec CHANGES REQUIRED (blocking: unqualified "CCA never fires on UWB" in README/Guide/glossary; within ~0.3 m it does). Ruling: qualify by distance in all four places + pin. Fix round 1: resumed implementer
Task 6: fix round 1 (commit 11b6b9d); scoped re-review dispatched
Task 6: re-review: still CHANGES REQUIRED (the 30 cm cutoff is 37 cm from the engine constants - my spec figure). Ruling: quote "about 40 cm", derive 0.367 m in the test. Fix round 2: resumed implementer
Task 6: fix round 2 (commit caef9db); scoped re-review dispatched
Task 6: complete (commits 47dd7fb + 11b6b9d + caef9db, re-review approved)
Task 5: implemented (commit 16e4711). Rulings: base laptop profile `backup` (browsing produced zero interference), variant named "Saturated upload", 4th variant "No UWB" - accepted. Review dispatched (opus)
Ruling: slices 3-6 get ONE combined whole-branch review after slice 6 (each slice is small; per-task reviews cover them until then)
Task 5: review: spec approved, quality CHANGES REQUIRED (blocking: CCA claim unqualified/false; 8 minor). Ruling: fix all nine. Fix round 1: resumed implementer
Task 5: fix round 1 (commit f87ec6a); scoped re-review dispatched
Task 5: complete (commits 16e4711 + f87ec6a, re-review approved). SLICE 3 PLAN COMPLETE at f87ec6a (combined whole-branch review deferred to after slice 6 by ruling). Parked minors: T1 style x2, T2 x3, T3 x4, T4 x3.
