# SDD ledger — plan: docs/superpowers/plans/2026-09-19-uwb-tdoa.md

Worktree: D:\wifi_sim\.claude\worktrees\feat-link-2g (branch feat/uwb-ranging; slice 4's lesson still landing when Task 1 started)
Spec: docs/superpowers/specs/2026-09-19-uwb-slices-design.md (Slice 5)

## Pre-flight scan

| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1 → T2/T3 | `mode`, `tdoaClockCorrection`, `syncErrorNs`, `RoundPlan.mode`, `slotAction` for dl/ul, `uwbBlink`, `UwbInfo.dl`, `solveTdoa` | consistent |
| T1 schema ↔ existing rules | dl-tdoa lifts tags ≤ rounds/block; ul-tdoa uses tags ≤ block/slot; both need ≥ 4 anchors and schedule 'time' | consistent with slice 4's contention rule (contention + tdoa → reject) — **ruling:** add that rejection in T1 |
| T2 ↔ slice 6 (AoA) | `UWB_POSITION.method` and `of` are introduced here; AoA reuses them | consistent |
| T3 view `of` routing ↔ overlay | positions routed to the `of` lane; overlay keys by lane | consistent |
| T2 tag rate correction | r from poll→final on the tag's clock vs N·slotNs; flight time common → cancels | consistent with the spec's corrected paragraph |
| Global | `mode: 'twr'` byte-identical; fixture unchanged until T4 | guarded |

Model plan: T1 opus, T2 opus, T3 opus, T4–T5 opus, T6 sonnet; reviewers opus.

## Progress
Task 1: dispatched (base ae608ec, opus; in parallel with slice-4 Task 3 lesson which owns course files and the fixture)
Task 1: implemented (commit df37e84). Rulings: DL frame sizes with per-IE headers (poll 33+3R, resp 30, final 22+4R) accepted; TDoA fixes pass sqrt2*sigma_r as sigmaRangeM (a difference of two noisy stamps) and lessons compare position errors / ellipses, never raw GDOP numbers across solvers. Review dispatched (opus)
Task 2: dispatched (base df37e84, opus)
Task 1: review: spec CHANGES REQUIRED (medium: dl-tdoa lost the one-round-fits-block floor; 5 minor). Rulings: fix 1-5, park 6 (makePoll signature) for the combined fix wave, 7 forwarded to Task 2. Fix round 1: resumed implementer (no exported signature changes while Task 2 runs)
Task 1: fix round 1 (commit 88ed935); scoped re-review dispatched
Task 1: complete (commits df37e84 + 88ed935, re-review approved; makePoll signature parked)
Task 2: implemented (commit 4b14529). Ruling: rate ratio r must use anchor 0 own TX counters (poll/final) as the reference interval so e_0 cancels - follow-up requested before review; correction-off yields no fix (lesson quotes differences in metres) accepted; tdoaClockCorrection via UwbDeviceCfg accepted
Task 2: follow-up (commit d398c67: r in anchor-0 units). Review dispatched (opus)
Task 3: dispatched (base d398c67, opus)
Task 2: complete (commits 4b14529 + d398c67, review approved; 5 low). Ruling for a follow-up after Task 3 lands (device.ts is Task 3 territory now): the DL-TDoA ellipse sigma must include the CFO residual per responder (sigma_i = sqrt((sqrt2*c*sigma_ts)^2 + (c*replyTime_i*sigma_cfo)^2), RMS over responders); UL-TDoA sigma = sqrt((sqrt2*c*sigma_ts)^2 + (c*syncErrorNs)^2) - lessons must not pin the optimistic ellipse
Task 3: implemented (commit cb74c66; four documented deviations accepted). Follow-up requested: honest TDoA ellipse sigmas (UL incl. sync error, DL incl. CFO residual RMS)
Task 3: follow-up (commit 1277472). Review dispatched (opus)
Task 4: dispatched (base 1277472, opus; lesson dl-tdoa)
Task 3: complete (commits cb74c66 + 1277472, review approved; 6 low parked incl. a stale doc comment in network.test.ts and the pre-follow-up ellipse figures in the report body)
Task 6: dispatched in parallel (base 1277472, sonnet; docs files only)
Task 6: implemented (commit daa0b1e). Review dispatched (sonnet)
Task 6: complete (commit daa0b1e, review approved; 1 low parked)
Task 4: implemented (commit c419b0d; badge-* tag ids to keep the correction-off no-fix claim true - accepted). Review dispatched (opus)
Task 5: dispatched (base c419b0d, opus; lesson ul-tdoa)
Task 4: review: spec approved, quality CHANGES REQUIRED (medium: fix-error sentence pins the scene not one badge; 6 low). Fix round 1: resumed implementer
Task 4: fix round 1 (commit 28251be); scoped re-review dispatched
Task 4: complete (commits c419b0d + 28251be, re-review approved; ruling on the parked envelope: 3-sigma bounds acceptable when the pinned values are also asserted)
Task 5: implemented (commit b4ac444; 1637 words accepted; identical hashes for the two scenes accepted - the hash is of the air). Review dispatched (opus)
Task 5: review: spec approved, quality CHANGES REQUIRED (medium: "changes not one record" false - counters change; 7 low). Fix round 1: resumed implementer
Task 5: fix round 1 (commit 5176a49); scoped re-review dispatched
Task 5: complete (commits b4ac444 + 5176a49, re-review approved). SLICE 5 PLAN COMPLETE at 5176a49 (combined whole-branch review after slice 6). Parked: T1 makePoll signature, T2 x5 low, T3 x6 low, T6 x1
