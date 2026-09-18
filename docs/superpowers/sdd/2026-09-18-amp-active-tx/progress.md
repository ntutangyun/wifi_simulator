# SDD ledger — plan: docs/superpowers/plans/2026-09-18-amp-active-tx.md

Worktree: D:\wifi_sim\.claude\worktrees\feat-link-2g (branch feat/amp-active-tx, stacked on feat/link-2g at cc92a92)
Spec: docs/superpowers/specs/2026-09-18-amp-tier-design.md (Part B)
Baseline: 612 tests green, tsc clean, build OK at cc92a92.

## Pre-flight scan

| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1 ↔ T4 | `AmpInfo.ulKbps` set by `ampTriggerFrame`, read by `AmpStaMac.ulRateOf` | consistent (plan patched before execution) |
| T1 ↔ T3 | `AMP_UL_BW_MHZ`, `ampUlSensDbm`, `AMP_UL_REQ_SINR_DB`, `AMP_DL_REQ_SINR_DB`, `AMP_TAG_DL_SENS_DBM`, `AMP_UL_SYNC_CHIPS`, `AMP_UL_CHIP_NS` | consistent |
| T1 ↔ T7 | T1 adds a placeholder AMP decode case in `frameFields.ts`; T7 replaces it with the real fields | consistent, T7 must remove the placeholder |
| T2 ↔ T5 | `NodeCfg.ampAp` / `ampTag`, `DEFAULT_AMP_AP`, `nodeLinks(amp) → ['2g']` | consistent |
| T2 ↔ T6 | `MacStateName 'ampWait'`: T2 maps it to `'sifs'` in `STATE_SPAN` temporarily; T6 adds `SpanKind 'slot'` | consistent, T6 must switch it |
| T2 ↔ link-2g final state | `view.ts` now has `siblingIds`/`primaryLaneOf`; T2 only adds `amp`/`ampRound` fields and cases | no conflict |
| T2 ↔ link-2g parked item | `linkPlanFor` seeds only `'6g'` for an MLO AP (5 GHz lane lost when all stations are on 2.4 GHz) | Ruling: fold the one-line fix (seed `'5g'` and `'6g'` for an MLO AP) into T2, which edits caps.ts anyway — costs nothing if wrong (no shipped scenario is affected; hash fixture guards) |
| T3 ↔ T4/T5 | `Channel.register(id, listener, opts)`; `decodeThreshDb(frame, rid, r)` internal | consistent |
| T4 ↔ T5 | `AmpStaMac` constructor `(nodeId, q, now, ch, rng, emit, cfg)`; `AMP_RESULT.sent` | consistent |
| T5 ↔ T6 | AMP records consumed by `format.ts`, `laneLayout.ts`, `Inspector.tsx` | consistent |
| T5 internal | AMP round starts before the OFDMA branch in `transmitFor`; `inExchange()` includes `ampRound.active`; BK TXOP limit not applied | consistent with spec ("one exchange") |
| T5 test 'protection none' | empirical premise (camera frames start inside slots) | implementer may adjust geometry/seed within the brief's scenario; not a conflict |
| T5 tests with AP + tags only | `linkPlanFor` (post fix wave) yields links `['2g']`, AP lane `ap#2g` | tests already use `ap#2g` and `tag-1#2g` — consistent |
| T9 ↔ T10–12 | module inserted at index 7; capstone → 8; `COURSE_ORDER` ids after `mlo` | consistent |
| T6 ↔ T7 | `FieldKey`/`PpduSegmentKey` additions need i18n names — done in T7 | consistent |
| Global | existing scenarios bit-identical | guarded by `tests/engine/lesson-hashes.test.ts` |

## Progress
Task 1: implemented (commit 6edf0e7)
Task 2: dispatched (base 6edf0e7)
Task 1: minor (deferred to Task 7 prose pass): zh whatIs.ampTrigger uses 命名 (prefer 规定/划出); whatIs.ampAck "on-body power" phrasing awkward in en and zh
Task 1: complete (commits cc92a92..6edf0e7, review clean)
Task 2: implemented (commit 61da702; also added fmtRecord cases in format.ts for compile — Task 6 sets the exact strings)
Task 3: dispatched (base 61da702)
Task 3: implemented (commit 31fff73)
Task 4: dispatched (base 31fff73)
Task 2: complete (commits 6edf0e7..61da702, review clean). Carry to Task 5: the AP must emit only tx/waitAck MAC_STATE during an AMP round (ampWait is a tag state) or the reducer clears ampRound mid-round
Task 3: complete (commits 61da702..31fff73, review clean)
Task 4: implemented (commit cff480f)
Task 5: dispatched (base cff480f, opus)
Task 4: reviewer Important — tag counts Acks by arrival order, so a silently missed Ack makes it transmit one slot late. Ruling: keep (faithful to SFD MM-46 / PDT 39.4: Ack PPDUs carry no slot index, the tag must count; the mis-slotted response is then ignored by the AP and reported lost) — lesson 2 should mention it — costs a less robust tag than the model could be if wrong
Task 4: minor (deferred): the phase-2 sent=true callback in transmitResponse has no cancel handle (unreachable race today)
Task 4: complete (commits 31fff73..cff480f, review clean)
Task 5: implemented (commit 2e3f178; test slotNs corrected 272→528 µs for inline reading — consistent with Tasks 10/11)
Task 6: dispatched (base 2e3f178)
Task 5 note: implementer added scheduleResponse early-return while a round is active (prevents a SIFS ACK colliding with the next AMP Ack); reviewer asked to judge
Task 6: implemented (commit 53d5216)
Task 7: dispatched (base 53d5216)
Task 5: review Approved with 1 Important (brief defect: onAmpDone never resets BK CW/QSRC) + minors. Ruling: fix (§10.23.2.2 CW resets on success) — costs polling latency drift under contention if wrong. Fix round 1 dispatched: resetQsrc in onAmpDone + unify ampCapable + view received filter by slot
Task 5: minor (parked): scheduleResponse guard also suppresses CF-End repeat mid-round (unreachable); redundant casts and value import in ampAp.ts; no Duration/ID 32.767 ms cap modelled (worst case 26.3 ms)
Task 6: minor (deferred): Inspector.tsx fragment blocks keep shallow indentation
Task 6: complete (commits 2e3f178..53d5216, review clean)
Task 5: fix round 1/5 (3 addressed pending re-review; commit 5ff11e6)
Task 7: implemented (commit d9ca763)
Task 8: dispatched (base d9ca763)
Task 5: fix round 1/5 re-review: all 3 ADDRESSED (commit 5ff11e6)
Task 5: complete (commits cff480f..2e3f178 + 5ff11e6, review clean after 1 fix round)
Task 7: complete (commits 5ff11e6..d9ca763, review clean)
Task 8: implemented (commit 6fc76b5). Ruling: protection/readMode selects unlabeled (brief gap) — add labels + hints for slots/dlKbps/ulKbps in Task 13 docs pass — costs a slightly bare editor section until then
Task 9: dispatched (base 6fc76b5)
Task 8: complete (commits d9ca763..6fc76b5, review clean; labels/hints for the AMP section deferred to Task 13)
Task 9: implemented (commit cbf9bd4)
Task 10: dispatched (base cbf9bd4, opus)
Task 9: complete (commits 6fc76b5..cbf9bd4, review clean)
Task 10: implemented (commit 10dd983). Deviations accepted: no sit-out possible at ACWE 2 with 4 slots (jump replaced); try-this uses dlSensDbm knob; 25 min study time near the cap
Task 11: dispatched (base 10dd983, opus)
Task 10: review Needs fixes — 2 false sentences (response "longest of three"; AP "full of all four" incl. NAV_SET), unpinned try-this 2, stale test-comment quotes, 4 overstated claims, minors. Fix round 1 dispatched (12 items)
Session note: user paused then resumed; main and feat/link-2g pushed to origin during the pause; feat/amp-active-tx not yet pushed
Task 11: implemented (commit 4d00f86; slot model restricted to reachable slots, all cells within 0.05; capture margin cross-pinned via amp-collision test)
Task 12: dispatched (base 4d00f86, opus)
Task 10: fix round 1/5 (12 addressed + a third wrong claim found and fixed: quoted RSSI ignored LINK_EXTRA_LOSS_DB 2g; commit a03c8de) — re-review dispatched
Task 11: review Approved with fixes — non-verbatim test quotes, capture pin missing in 3 variants, minors. Fix round 1 dispatched (10 items)
Task 10: fix round 1/5 re-review: all 12 + 2 extras ADDRESSED (commit a03c8de)
Task 10: minor (deferred to final wave): stale link-budget numbers in a test comment (amp-intro.test.ts ~411-413) and old table heading quote (~246); "Every AMP frame … pads 20 µs" should say "every downlink AMP frame"; EN opening "It follows…" vs ZH "本模块依据" drift
Task 10: complete (commits cbf9bd4..10dd983 + a03c8de, review clean after 1 fix round)
Task 11: fix round 1/5 (10 addressed pending re-review; commit f93c8e9). Note: Task 12 agent has src/engine/mac.ts modified — reviewer to judge
Task 11: fix round 1/5 re-review: all 10 ADDRESSED (commit f93c8e9)
Task 11: complete (commits 10dd983..4d00f86 + f93c8e9, review clean after 1 fix round)
Task 12: implemented (commits b7a898c engine fix: AMP frame during a CTS/ACK wait must fail the attempt (Task 5 early-return bug); 121e8f0 lesson). Deviation: camera profile backup→saturated. Reviewer to judge both
Task 13: dispatched (base 121e8f0) incl. Task 8 labels/hints and Task 10 deferred one-liners
Task 12 Ruling: camera profile backup→saturated accepted (backup maps to AC_BK; the spec wants an AC_BE uplink) — costs a stress-test framing instead of a realistic camera
Task 12 Ruling: the brief expected "no camera frame starts inside any slot with ctsSelf" and "every response acked unless tags collide"; measurement shows NAV taken in 17/20 rounds, 9 camera RTS inside slots, 3 responses lost to the camera — accepted as measured and taught ("CTS-to-self is an announcement, not a fence") — costs nothing if wrong since every number is pinned
Task 12: review Needs fixes — observe #2 jump lands on the wrong event (73 µs vs described 817 µs); ZH-only unmeasured 50/50 split; minors. Engine fix b7a898c APPROVED. Fix round 1 dispatched (8 items)
Parked modelling note (not a defect now): Wi-Fi radios treat DL AMP PPDUs as decodable receptions (AIFS, not EIFS, afterwards) — spec Part B chose "decode the L-SIG"; revisit when the PHY tier models unsupported-format RXEND errors
Task 13: implemented (commit d895af9; scope per dispatch message, brief file narrower)
Task 13: review Needs fixes — duplicate "7 ·" heading in Guide.tsx (EN+ZH); minors. Fix round 1 dispatched (3 items)
Task 13: fix round 1/5 (3 addressed pending re-review; commit dec3a62)
Task 12: fix round 1/5 (8 addressed + "only the first round on time" corrected to two rounds; commit 8d6fb95) — re-review dispatched; camera-profile deviation already ruled accepted
Task 13: fix round 1/5 re-review: all 3 ADDRESSED (commit dec3a62)
Task 13: complete (commits 121e8f0..d895af9 + dec3a62, review clean after 1 fix round)
Task 12: fix round 1/5 re-review: all 8 ADDRESSED (commit 8d6fb95)
Task 12: complete (commits f93c8e9..121e8f0 + 8d6fb95, engine fix b7a898c approved, review clean after 1 fix round)
ALL 13 TASKS COMPLETE — final whole-branch review dispatched (opus) on cc92a92..8d6fb95
Controller in-app check PASSED: Course → Module "Ambient power IoT (802.11bp)" → lesson 1 loads; jump "first tag response" shows CTS/trigger/Acks (teal) on Router lane, violet responses + slot-wait spans on tag lanes, tag discs + dashed links in 3D, AMP legend entries — screenshot .superpowers/sdd/amp-lesson1-response.png
FINAL REVIEW (opus): With fixes. Critical: lesson 2 RSSI numbers ignore LINK_EXTRA_LOSS_DB 2g (test pins band-neutral values). Important: frame-detail strings say "backscatter" for Active Tx; setGeneration leaves ampAp on a non-EHT AP; tag onAck ordering lets a late tag fire on the next trigger. Minors 6-15 in final-findings.md
Ruling: parked DL-AMP-decode modelling note stays (reviewer agrees it is the more faithful choice: valid L-SIG → normal RXEND → AIFS); documented in README instead — costs nothing until the PHY tier models format errors
Ruling: delete unread AmpApRound.stats rather than surface it (lessons measure from records) — costs a re-add if a UI later wants live round stats
Final fix wave dispatched (opus) on base 8d6fb95
Final fix wave: implemented (commit 9c58e1e; 753 tests green; lesson-3 try-this count 35→33 as a consequence of the tag boundary fix; subagent used a different Co-Authored-By trailer — amend after re-review). Re-review dispatched
Final fix wave re-review (opus): all 15 ADDRESSED, no new Critical/Important breakage; lesson-3 35→33 consequence verified
Ruling: keep the fix-wave commit trailer as written by the subagent (session line identical) rather than rewrite history — costs an inconsistent Co-Authored-By line on one commit
PLAN COMPLETE: feat/amp-active-tx at 9c58e1e (+ ledger export commit); 753 tests green, tsc + build OK; not merged (user decision)
