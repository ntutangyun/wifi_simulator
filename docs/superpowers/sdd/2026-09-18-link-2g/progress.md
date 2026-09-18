# SDD ledger — plan: docs/superpowers/plans/2026-09-18-link-2g.md

Worktree: D:\wifi_sim\.claude\worktrees\feat-link-2g (branch feat/link-2g, base 2463cbc)
Spec: docs/superpowers/specs/2026-09-18-amp-tier-design.md (Part A)
Baseline: 66 files / 588 tests green, tsc clean at 2463cbc.

## Pre-flight scan

| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T2 ↔ T3 | `PhyTiming`, `OFDM_5G`, `ERP_2G`, `aifsNs(aifsn, T)`, `TxTimeOpts` (exists at phy.ts:192) | consistent |
| T2 internal | `OFDM_5G.eifsNs` filled after `EIFS_NS` is defined | Ruling: declare `OFDM_5G` after `EIFS_NS` instead of mutating — same values, no mutable export — costs nothing if wrong |
| T3 ↔ T5 | `WifiMacCfg.timing` set by `timingFor(link)` | consistent |
| T3 ↔ helpers | `makeBss` gains `timing` option, default OFDM_5G | consistent |
| T3 internal | EIFS behavioural test premise (lowSinr at −80 dBm) flagged uncertain by the plan itself | implementer adjusts the level per the brief's own instruction; not a conflict |
| T4 ↔ T5 | `negotiatedWidth(a, b, link)`, `linkOfVirtual`, `physicalId`, `LINK_ORDER`; `LinkPlan.members` has three keys | consistent; `view.ts siblingId` unaffected |
| T4 ↔ T6 | `BAND_LABEL`, `linkOfVirtual`; `Strings.inspector.link5/link6` → `linkName` | callers of link5/link6 must all move (Inspector only, implementer greps) |
| T1 ↔ T3/T5 | hash fixture consumed by every later task | consistent |
| T6 internal | Inspector renders every lane of the node (replaces sibling logic) | consistent with T4's plan |
| Global | existing scenarios bit-identical | guarded by T1 fixture |

No conflicts requiring a ruling beyond the T2 declaration order.

## Progress
Task 1: implemented (commit 700804f, DONE, fixture: 66 entries)
Task 1: minor (deferred): report self-review claimed 8-char hashes; timelineHash is unpadded hex (cosmetic, no code change)
Task 1: complete (commits 2463cbc..700804f, review clean)
Task 2: implemented (commit 2e5285a)
Task 2: minor (deferred): ERP DIFS expression written twice in phy.ts (difsNs and inside eifsNs); PhyTiming interface far from its instances
Task 2: complete (commits 700804f..2e5285a, review clean)
Task 3: implemented (commit 1436d91). Ruling: brief ACK test expected 6 Mb/s ACK; implementer corrected to 24 Mb/s (control-response rate after 54 Mb/s data) — accepted pending reviewer check — costs one wrong test value if wrong
Task 1: reopened — lesson-hashes.test.ts breaks tsc -b (no @types/node). Ruling: add @types/node devDependency rather than rewrite the test — costs one dev dependency if wrong. Fix round 1 dispatched to the Task 1 implementer
Task 1: fix round 1/5 (1 addressed pending re-review — @types/node added; commits 1436d91..cc40c20)
Task 4: dispatched (base cc40c20)
Task 1: fix round 1/5 re-review: ADDRESSED (commits 1436d91..cc40c20); Task 1 complete (review clean)
Task 3: complete (commits 2e5285a..1436d91, review clean; ACK-rate test correction confirmed by reviewer against ctrlRespRateFor)
Task 4: implemented (commit d1c6472; added LINK_EXTRA_LOSS_DB 2g:0 placeholder in simulation.ts for compile — Task 5 sets -6.5)
Task 5: dispatched (base d1c6472)
Task 4: reviewer Important (out of Task 4 scope): primaryMac/ARRIVAL hardcode 5g-or-6g so a 2g-only station would crash before Task 5 — Ruling: Task 5 brief already replaces both with primaryVid; verify in Task 5 review — costs a runtime crash on 2g scenarios if Task 5 misses it
Task 4: minor (deferred): nodeLinks AP branch is dead code (comment it); duplicate caps import line in caps.test.ts; TimelineStrip hardcodes 6G/5G labels (Task 6 scope)
Task 4: complete (commits cc40c20..d1c6472, review clean)
Task 5: implemented (commit 61d7cc3)
Task 6: dispatched (base 61d7cc3)
Task 5: minor (deferred): sibling-poke loop now issues a guarded no-op self-poke for 2g-only stations
Task 5: complete (commits d1c6472..61d7cc3, review clean; Task 4 ruling verified: primaryVid replaces both hardcoded sites)
Task 6: implemented (commit c07c8b2; in-app visual check skipped by implementer, controller will do it at final review)
Task 7: dispatched (base c07c8b2)
Task 6: deferred (controller in-app check): EditorGuide.tsx link paragraph still says "non-MLO Wi-Fi 6/7 devices … two bands" — stale after the third band; fix in the final wave
Task 6: controller in-app check PASSED (dev server :5175; lanes Router·5G / Router·2.4G / Camera·2.4G / Phone·5G; inspector table matches) — screenshot .superpowers/sdd/simulate-2g.png
Task 6: complete (commits 61d7cc3..c07c8b2, review clean; in-app check by controller passed)
Task 7: implemented (commit 47fff06)
Task 7: review Needs fixes — U+201C opening quotes replaced by U+201D in the ERP zh text and in the unrelated ACK timeout zh entry; straight apostrophe in ERP en text. Fix round 1 dispatched to the Task 7 implementer
Task 7: fix round 1/5 (3 addressed pending re-review; commits 47fff06..e706fb3)
Task 7: fix round 1/5 re-review: all 3 ADDRESSED (commits 47fff06..e706fb3)
Task 7: complete (commits c07c8b2..e706fb3, review clean after 1 fix round)
FINAL REVIEW (opus): With fixes. Critical: view.ts siblingId only pairs #6g (plan defect) → AP queue never drains for 2g DL, latencies zero; physical-id lookups in view.ts/viewport.tsx miss 2g-only stations; EditorGuide text false. Important: stray scratch files; setGeneration stale 6g linkId; phantom empty 5g link for all-2g scenarios. Minors 7-19 listed in final-findings.md.
Ruling: plan line "view.ts siblingId needs no change" was wrong — fixed in the final wave (siblingIds by physicalId) — costs nothing if wrong since old behaviour is preserved for 5g/6g
Ruling: linkPlanFor stops seeding 5g unconditionally (spec rule wins over plan text) — costs a lane-order change for all-2g scenarios only; 5g-only scenarios guarded by the hash fixture
Ruling: deferred 13 (bianchiModel timing) and 17 (tsconfig split for tests) to a later slice — cost: analytical model mismatch only once a 2.4 GHz lesson exists; Node globals typed in browser code
Final fix wave dispatched (opus) on base e706fb3
Final fix wave: implemented (commits e706fb3..cc92a92; 612 tests green, tsc + build OK); re-review dispatched
Final fix wave re-review (opus): all 17 findings ADDRESSED, no Critical/Important breakage
Parked — Ruling: MLO AP with every station on 2.4 GHz keeps an empty 6 GHz lane and loses its 5 GHz lane (caps.ts linkPlanFor seeds only 6g for an MLO AP) — real but reachable only via the editor corner case; fold the one-line fix (seed 5g too for an MLO AP) into the AMP plan Task 2, which edits caps.ts — costs a confusing lane layout in that corner until then
Parked — Ruling: 2.4 GHz wave tint is a no-op for RTS/CTS orange (effects.ts warmShift) — cosmetic; leave
PLAN COMPLETE: feat/link-2g at cc92a92; 612 tests green, tsc + build OK; not merged (user decision)
