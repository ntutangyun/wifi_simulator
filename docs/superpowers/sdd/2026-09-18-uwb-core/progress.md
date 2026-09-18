# SDD ledger — plan: docs/superpowers/plans/2026-09-18-uwb-core.md

Worktree: D:\wifi_sim\.claude\worktrees\feat-link-2g (branch feat/uwb-ranging, stacked on feat/amp-active-tx at 9c6cb69)
Spec: docs/superpowers/specs/2026-09-18-uwb-ranging-design.md
Plan committed at a6af5d6. Baseline: 753 tests green, tsc clean at 9c6cb69 (re-run in background at start).

## Pre-flight scan

| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1 ↔ T2 | `RCTU_NS`, `COUNTER_MOD`, `C_M_PER_NS`, `FOM_LOS/NLOS` | consistent |
| T1 ↔ T4 | `uwbPpduNs`, `uwbPollBytes`, `uwbRespBytes`, `uwbFinalBytes`, `UWB_REPORT_BYTES` used by the frame builders | consistent |
| T1 ↔ T5 | `uwbPl0Db`, `UWB_PL_EXP`, `UWB_RX_SENS_DBM`, `UWB_CAPTURE_DB`, `UWB_NLOS_NS`; T5 adds `wallsCrossed` to `src/engine/propagation.ts` | consistent (new export, no existing caller) |
| T2 ↔ T6 | `UwbClock.fromRng(rng, ppm?)`, `counter(trueNs, extraNs?)`, `counterDiff`, `gaussian`; `ssTwrRaw/Corrected`, `dsTwr`, `rctuToMetres`, `fomFor` | consistent |
| T3 ↔ T6 | `solvePosition(anchors, ranges, zTag, sigmaRangeM)`, `rangeSigmaM`, `AnchorPos` | consistent |
| T4 ↔ T6 | `UwbRecord` fields; builders `makePoll/makeResp/makeFinal/makeReport` signatures; `UwbInfo.replyRctu/finalTimes/reportTimes/schedule` | consistent |
| T4 ↔ T7 | `NodeView.uwb`, `MacStateName 'uwbWait'`, `laneIds` | consistent; `STATE_SPAN` is `Record<string, …>` so T4 compiles without T7 |
| T4 internal | `FrameKind` gains four kinds while `i18n.ts` holds `Record<FrameKind, string>` tables (`kindName`, `whatIs`, `next`) and `frameFields.ts` may switch exhaustively | **Ruling:** T4 adds the four entries to those i18n tables (EN + ZH, short) and any placeholder decode case needed to compile; T7 replaces the placeholders with the real decode — cost if wrong: a few strings rewritten in T7 |
| T4 internal | `NodeKind` gains `'uwb'`; `records.ts` imports `UwbFrameKind` (type-only) from `../uwb/frames` and `UwbRecord` from `../uwb/records` | type-only cycle-free imports; consistent with the spec's seam 2 |
| T4 ↔ T6 schema | `tags ≤ floor(blockRstu / (slots·slotRstu))` in the schema equals `roundsPerBlock` in `roundPlan` | consistent (same slots formula in both) |
| T5 ↔ T6 | `UwbRadio` (listening/onRxStart/onRxOk/onRxFail), `UwbRxInfo` (rssiDbm, propNs, nlosNs, nlos, txStartNs, txPpm), `UwbChannel(q, now, nodes, walls, cfg, ppmOf, emit)` | consistent |
| T6 internal | UWB_ROUND and UWB_SLOT both at the slot-0 start: ROUND first, then SLOT; tag emits UWB_SLOT for every slot of its round | consistent, documented in the brief |
| T6 ↔ Simulation | Wi-Fi wiring wrapped in `if (ap)`; traffic fork index stays the `sc.nodes` index (lesson scenarios list UWB nodes last) | consistent; hash fixture guards existing scenarios |
| T6 ↔ T8–10 | lesson tests read `UWB_RANGE.tofRawRctu/tofRctu/distM/trueDistM`, `UWB_ROUND.untilNs/slots`, `UWB_TS` order | consistent |
| T7 ↔ T4 | `PpduSegment` key union gains `sync/sfd/stsGap/sts/phr/psdu`; i18n segment names | T7 adds both |
| T8 ↔ CoursePanel | `TIERS: Tier[]` where `Tier extends L10n` — existing `t(tier)` calls still type-check | consistent |
| T8–10 ↔ hashes | fixture regenerated, additions only | guarded by the diff check in each task |
| Global | lesson hashes unchanged through T7 | guarded by `tests/engine/lesson-hashes.test.ts` |

Model plan: T1–T3 sonnet implementer / sonnet reviewer; T4–T10 opus implementer / opus reviewer (prose tasks stay on opus after the AMP quote-corruption incident).

## Progress
Task 1: dispatched (base a6af5d6, sonnet)
Task 1: implemented (commit 04e0b1e). Ruling: 60-octet Final = 480 bits = two RS blocks -> 234 551 ns, not 228 397 (my arithmetic error; implementer caught it) - spec/plan/briefs patched, T6/T10 numbers updated - costs nothing if wrong (pinned by phy.test)
Task 1: review dispatched (sonnet)
Task 2: dispatched (base 04e0b1e / docs at dba17fd, sonnet)
Task 1: complete (commits a6af5d6..04e0b1e, review approved; 2 minor: duplicated generic comments on the MHR/IE constants, frame-size helpers hardcode multipliers - parked for the final fix wave)
Task 2: implemented (commit 5eadceb). Ruling: the brief's 0.5 mm tolerances on SS/DS closed forms are below the 4.69 mm RCTU quantisation; 5 mm tolerance accepted (reviewer to confirm) - costs nothing if wrong
Task 2: review dispatched (sonnet)
Task 3: dispatched (base 5eadceb, sonnet)
Task 2: complete (commits 04e0b1e..5eadceb, review approved; tolerance widening confirmed as RCTU quantisation physics)
Task 3: implemented (commit bc1b1bb)
Task 3: review dispatched (sonnet)
Task 4: dispatched (base bc1b1bb, opus)
Task 3: review: spec approved, quality CHANGES REQUIRED (blocking: singular JtJ -> NaN gdop/ellipse). Ruling: return null when det < 1e-9 (documented no-fix), extract accumulateNormal helper. Fix round 1: resumed implementer (sonnet), commit by pathspec only (Task 4 in flight)
Task 3: fix round 1 (commit f015145); scoped re-review dispatched (sonnet)
Task 3: complete (commits 5eadceb..f015145, re-review clean). Carry to Task 6: solvePosition returns null for singular geometry -> no UWB_POSITION that round
Task 4: implemented (commit e8fe158; placeholders for T7: frameFields decode, TimelineStrip lanes still linkPlanFor)
Task 4: review dispatched (opus)
Task 5: dispatched (base e8fe158, opus)
Task 4: complete (commits f015145..e8fe158, review approved, 8 minor). Carry: T6 -> use applyUwbRecord return value (`if (applyUwbRecord(vs, r)) return`), makeResp omit undefined replyRctu, Simulation ap! assertion; T7 -> effects.ts ap! assertion reachable for UWB-only scenarios, UWB typeName not Control (zh shows 控制帧), TimelineStrip lanes
Task 5: implemented (commit 54d95a1)
Task 5: review dispatched (opus)
Task 6: dispatched (base 54d95a1, opus)
Task 5: complete (commits e8fe158..54d95a1, review approved, 4 minor + 2 info; notes forwarded to T6: flight time from info.propNs, device ignores RX while tx/idle)
Task 6: implemented (commit bf05b35). Rulings: UWB_POSITION at the round end instant (20 ms) accepted; 3-tag test runs 470 ms; 0 ppm raw-vs-corrected bound from the CFO estimator - all costless if wrong
Task 6: review dispatched (opus)
Task 7: dispatched (base bf05b35, opus)
Task 6: review: spec CHANGES REQUIRED (blocking: anchor reports without being listed in the Final) + 7 minor. Rulings: fix 1-7 (report guard + test, drop dead pollCoffs/pollFom and cfg.method, delete unreachable queued deadline, hashStr -> src/engine/hash.ts with re-export, tx-id guard on TX-end timer, assert tags <= roundsPerBlock); finding 8 (RX_OK without UWB_TS when device refuses) accepted. Fix round 1: resumed implementer (opus)
Task 6: fix round 1 (commit 17e614d); scoped re-review dispatched (opus)
Task 6: complete (commits 54d95a1..17e614d, re-review clean; cosmetic: rename cancelDeadline -> clearExpectation, parked for the final fix wave)
Task 7: implemented (commit 00350f5). Ruling: Final = 14 + 12N octets (plan arithmetic error surfaced by the decode; 62 octets / 236 603 ns for four anchors) - spec/plan/briefs patched at 36dc1d5; fix round 1 resumed implementer (opus) before the task review; RRTI example unit in the brief was wrong (127 803 RCTU = 2 us) - no action
Task 7: fix round 1 (commit 2c2973f); task review dispatched (opus, covers 00350f5 + 2c2973f)
Task 8: dispatched (base 2c2973f, opus)
Task 7: task review: spec CHANGES REQUIRED (blocking: inspector FoM column missing, wrong summary) + 8 minor. Rulings: fix 1-8; finding 9 (BSS totals lists UWB lanes) accepted, carry to the positioning plan. Fix round 2: resumed implementer (opus)
Task 7: fix round 2 (commit 8adab88); scoped re-review dispatched (opus)
Task 7: complete (commits 17e614d..8adab88, re-review approved). Parked for the final fix wave: fomText English in the ZH inspector column (needs a localised fomText), event log calls uwbFrameFields without try/catch. Carry to positioning plan: BSS totals list UWB lanes
Task 8: implemented (commit ac21aac). Rulings: local 22x8 m rangingLab() instead of oneRoom() (20 m variant needs it) accepted; PSDU of the 30-octet poll is 37.179 us (brief said 35.13, my arithmetic) - lesson quotes the measured value
Task 8: review dispatched (opus)
Task 9: dispatched (base ac21aac, opus)
Task 8: review: spec approved, quality CHANGES REQUIRED (3 blocking: unpinned -14/-93 dBm, retyped tx power in lessonKit, ceil claim not guarded; 11 minor). Ruling: fix 1-9, 11, 12, 14 and move rangingLab() into lessonKit (10) - but WAIT for Task 9 to land first (both would edit lessonKit.ts in one worktree); 13 (CoursePanel test) parked
Task 9: implemented (commit c68d3a1). Ruling: corrected-SS residual is 1/2*Treply*sigma_cfo = 3.0 cm per ms (my brief said 6) - lesson uses the right number; per-slot 3-sigma bound accepted
Task 9: review dispatched (opus)
Task 8: fix round 1 resumed (opus; files uwb-intro.ts, its test, lessonKit.ts)
Task 10: dispatched (base c68d3a1, opus; disjoint files from the Task 8 fix)
Task 8: fix round 1 (commit 557a49f); scoped re-review dispatched (opus). Note: tests/uwb/zz-probe.test.ts is a scratch file of the Task 10 implementer - must be gone before the final review
Task 9: review: spec approved, quality CHANGES REQUIRED (2 blocking prose drifts: "a twentieth" is a tenth; observe 2 "about 3.4 m" false for anchor 4; 8 minor). Ruling: fix all ten. Fix round 1: resumed implementer (opus)
Task 8: complete (commits 8adab88..ac21aac + 557a49f, re-review approved; CoursePanel track-heading test parked for the final fix wave)
Task 9: fix round 1 (commit 8defe87); scoped re-review dispatched (opus)
Task 9: complete (commits ac21aac..c68d3a1 + 8defe87, re-review approved; 2 nits parked for the final fix wave: lexicographic min/max in the span test, FoM scale-index assumption)
Task 10: implemented (commit 87ec262; deviations accepted: chronological jumps, 3 mm, per-slot 1-sigma, local scene)
Task 10: review dispatched (opus)
Task 10: review: spec approved, quality CHANGES REQUIRED (2 blocking prose drifts: Poll also grows with N; the inspector shows one RRTI IE of 24 not four of 6; 10 minor). Ruling: fix all twelve. Fix round 1: resumed implementer (opus)
Task 10: fix round 1 (commit e559d8e); scoped re-review dispatched (opus)
Task 10: complete (commits 8defe87..87ec262 + e559d8e, re-review approved; 2 optional minors)
All 10 tasks complete at e559d8e. Whole-branch review dispatched (fable)
Whole-branch review (fable): CHANGES REQUIRED - 1 blocking (sigma_r = c*sigma/sqrt2 not sqrt2*c*sigma: my spec error), 3 important (no round-end signal -> stale slot; wrong clause citations; no slot-fit guard), 9 minor. Rulings: fix all 13 + the parked task minors in ONE fix wave; spec amended (UWB_ROUND_END, slot-fit rule, sigma, citations, titles). Fix wave dispatched (opus)
Fix wave: complete (44d2ec2..99888ec, six commits A-F; 999 tests green, tsc + vite build clean). Report: .superpowers/sdd/2026-09-18-uwb-core/fix-wave-report.md. Deviation: the 300-RSTU slot fits FOUR anchors (236.8 us < 250.0 us) - the pinned boundary is six (267.6 us); rstuNs/uwbSlotsPerTag/uwbSlotFitNs moved to the leaf uwb/phy.ts to keep zod out of the engine. Hash fixture: the seven uwb-* keys only.
Fix wave: commits 44d2ec2 1bbe167 026c661 bb57ac0 5b95351 99888ec (999 tests). Ruling: slot-fit boundary pinned at six anchors (my brief example was wrong: 250 us fits four); rstuNs/uwbSlotsPerTag/uwbSlotFitNs live in uwb/phy.ts (leaf). Scoped re-review dispatched (fable)
Fix wave re-review (fable): APPROVED, 0 remaining. PLAN COMPLETE at 99888ec (999 tests, tsc/build green). Ledgers exported to docs/superpowers/sdd/2026-09-18-uwb-core/
