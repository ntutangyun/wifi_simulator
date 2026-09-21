# SDD ledger — plan: docs/superpowers/plans/2026-09-21-amp-backscatter.md

Worktree: D:\wifi_sim\.claude\worktrees\feat-link-2g (branch feat/uwb-ranging = the platform branch; main fast-forwards from it), after the AMP slices spec 4dc8273
Spec: docs/superpowers/specs/2026-09-21-amp-backscatter-energy-design.md (Common ground + Slice A2)

## Pre-flight scan

| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1 → T2 | `bsPathLossDb`, `readerFloorDbm`, `monoLeakDbm`, `bsReplyDbm`, `bsDecodes`, `AMP_BS_*`, frame kinds `ampRfid`/`ampBsReply`, `AmpInfo.rfid/bs` | consistent; T2 reads `rfid.chargeDbm/bsDbm/bstNs` for the per-instant power and `bs.incidentDbm` for the reply |
| T1 → T3 | `ampRfidFrame`, `ampBsReplyFrame`, `bstNs`, `ampBsDlPpduNs`, Gen2 sizes, `crc16Epc`, config defaults | consistent |
| T2 ↔ T3 | the AP receives `ampBsReply` only while its own BST window is on — T2 gates on the AP's current DL PPDU; T3's round must keep the PPDU on the air through the BST (it does: the BST is part of the PPDU) | consistent; ruling: T2 exposes `channel.currentTx(nodeId)` or an equivalent query rather than T3 telling the channel |
| T1 ↔ units | `freeSpacePl0Db` lives in `src/uwb/units.ts` (a leaf) — T1 imports it, so the Wi-Fi engine gains an edge to `src/uwb/units.ts` | ruling: acceptable (leaf, no technology import); note in the file header |
| T3 mac.ts hook | one `ampPending` poll starts either `AmpApRound` or `AmpInventoryRound`; alternate when both apply | ruling: alternate strictly (even polls Active Tx, odd polls inventory) — model, documented |
| T3 tag power | "unpowered at the end of every DL PPDU unless the next arrives within T2 + 8 µs" vs the CTS-to-self Duration | ruling: the PPDU-gap rule (a tag has no clock; T2 is what keeps it alive) |
| T5 ↔ fixture | additions only | guarded |
| Global | `mode: 'active'` byte-identical; new frame kinds force `kindName/whatIs/next` strings (as UWB slice 7 found) — T1 adds them EN + ZH | guarded |

Model plan: T1 opus, T2 opus, T3 opus, T4 sonnet→opus review, T5 opus; reviewers opus (T4 sonnet).

## Progress
Task 1: dispatched (base 567b715, opus)
Side work (user request 2026-09-21, outside this plan): editor undo/redo dispatched on opus in an isolated worktree (brief: scratchpad/undo-redo-brief.md); cherry-pick onto feat/uwb-ranging between tasks, never concurrently with an implementer touching store.ts/i18n.ts/FloorPlanEditor.tsx.
Task 1: implemented e08ed28 (DONE_WITH_CONCERNS: ampPpduLayout strip for ampRfid deferred to T3; frameFields/effects/laneLayout/planOps touched beyond brief for tsc + JSON round-trip; incidentDbm unset until T2/T3); review package task-1-review.md; reviewer dispatched (opus)
Side work: undo/redo landed as 78aed5d (cherry-pick + course-mode guard on undo/redo)
Task 2: dispatched (base 78aed5d, opus)
Task 1 review: spec ❌ / quality needs fixes — 2 important (i18n KINDS array stale; ampPpduLayout for ampRfid violates the sum-to-txTimeNs invariant), 7 minor. Ruling: the ampRfid PPDU strip is fixed NOW from the ampBs timing helpers (new excitation segment keys; T3 only adds palette/labels) — deferring a broken invariant to T3 would make T3's first recorded frame red — cost if wrong: T3 renames segments. Fix round 1: resume implementer (opus); files disjoint from T2 (channel.ts / amp-bs-channel.test.ts).
Task 1 fix round 1: 4299134 (FRAME_KINDS list drives FrameKind + i18n parity; ampRfid PPDU strip from ampBs timings with ampWup/ampBst keys; crc fold, epc override, ppm comment, softened tags, lessonKit mode); re-review dispatched (sonnet, package task-1-fix1-review.md)
Task 2: implementer committed f5d36e8 — awaiting report
Task 2: f5d36e8 DONE_WITH_CONCERNS — rulings: (1) bsTag resolves reception at end of AMP-Data (spec: reply starts T1 after AMP-Data) — accepted; (2) reply acquired at AMP_BS_REQ_SNR_DB not the 4 dB preamble gate (keeps reach 0.328 m) — accepted; (3) reader floor replaces thermal noise for replies (0.001 dB) — accepted; (4) reply gated at its start instant only; Active Tx 'tag' still hears ampRfid — reviewer to judge. Reviewer dispatched (opus). Task 3 dispatched concurrently (base f5d36e8, opus) — must not touch channel.ts.
Task 1 re-review: all addressed except PARTIAL minor — `select` never passed through decodeFrame in a test (arithmetic correct by inspection). Ruling: parked for the whole-branch fix wave (carry: add one select decode case to tests/model/frameFields.test.ts) — not worth a third round; cost if wrong: none functional.
Task 1: complete (e08ed28 + 4299134)
Task 2 review: spec ✅ / quality needs changes — 2 important (PPDU prefix composition triplicated across ampBs.ts/channel.ts; idle ampCapable AP decodes a reply against thermal noise — BST window not enforced when the reader is idle), 9 minor; open question answered: start-instant gate provably sufficient (bstNs always contains a reply at T1). Fix round 1: resume implementer (opus); T3 running concurrently — T2 fixer owns channel.ts + amp-bs-channel.test.ts, may add one export to ampBs.ts only if that file is clean.
Task 2 fix round 1: c782ec2 (ampBsSyncEndNs/ampBsDataEndNs exported once; BST gate positive in detectFloorDbm incl. idle reader; minors 4-9,11 done). Carries: fold spectrum+bsGeometry into one Channel opts object (before A3); move bsDataEndNs/txDbmAt into ampBs.ts once T3 imports settle; verify AP txPowerDbm vs chargeDbm; A4 bistatic receiver reply bandwidth. Re-review dispatched (sonnet).
Task 2 re-review: ALL ADDRESSED (declines sound; carries recorded above)
Task 2: complete (f5d36e8 + c782ec2)
PAUSE (user, 2026-09-21): course readability comes before more features. Plan: let Task 3 land and pass review, run Task 4 (editor/i18n/Guide — sonnet) so the feature is coherent, then hold Task 5 (the backscatter lesson) until the readability contract exists (plan 2026-09-21-course-readability-1); write it under that contract. Whole-branch review and merge of A2 follow the lesson.
Task 3: 70f44de DONE_WITH_CONCERNS. Rulings: (1) `bstEnergy()` collision detection in mac.ts via public channel API — accepted for this slice; carry: an `onRxMiss` PhyListener callback in the channel would be the clean home (reviewer judges the hook's readability); (2) Wi-Fi never lands inside a BST window (reader gaps ≤ T2 = 16 µs < any AIFS; a loud-enough station hears the reader and defers) — accepted as a faithful model result; T4/T5: the lesson drops "Wi-Fi in the room loses replies" and instead shows the TXOP structure protecting replies; the lost-to-interference pin lives at the channel bench; (3) activation reach (0.309 m @10 dBm) binds before the reply reach (0.328 m) — ruling: the lesson scene charges at 20 dBm (activation 0.978 m) so the reply limit is what the reader sees; editor default stays chargeDbm 10 per spec; (4) no record for an out-of-range tag — accepted. Reviewer dispatched (opus).
Task 3 review: spec ✅ / quality needs fixes — 2 important (bstEnergy ignores the reader floor → unheard-but-booted tag counted as a collision at 20 dBm; a slot cut at the TXOP boundary after its RN16 loses the tag for the session, test flipped to read:false instead of fixing), 6 minor. Fix round 1: resume implementer (opus); readability T1 concurrently owns src/course, CoursePanel, i18n.ts, tests/course, README — T3 fixer must not touch them.
Task 3 fix round 1: 0eaac5e (reader floor gates bstEnergy → sub-floor answers tally as empties, documented; slotReserveNs reserves T2 + ACK before a Query/QueryRep; pinned numbers unchanged; minor 8 declined with reason). Carries: onRxMiss/bstEnergyAt in channel; spec Coexistence `none` sentence to amend; "alternation" wording = polls. Re-review dispatched (sonnet).
Task 3 re-review: ALL ADDRESSED
Task 3: complete (70f44de + 0eaac5e)
Task 4: dispatched (base 0eaac5e, sonnet) — owns src/editor/**, src/ui/{Guide,glossary,i18n (editor/guide/glossary sections only)}, README (editor section only), EditorGuide; must not touch src/course/** or the course i18n section.
Task 4: 0573cad DONE; reviewer dispatched (opus — editor wiring + hint numbers are judgment; the Guide/glossary prose is the part a learner reads)
Task 4 review: spec ❌ / quality needs fixes — 5 important (EPC draft input without key follows the selection; backscatter-needs-a-reader schema rule never surfaced → invalid plan saved, silent defaultScenario fallback on load; Guide/i18n reach numbers as unpinned literals; README source tags wrong on three rows; glossary BST entry states a formula in undefined symbols), 10 minor. Fix round 1: resume implementer (sonnet).
Task 4 fix round 1: b2829c2 (EPC input keyed per node; ampTagIssue surfaced with EN+ZH; reach numbers pinned to ampBs functions; README rows retagged; glossary plain-language; 9 minors fixed, minor 10 declined with reason). Re-review dispatched (sonnet).
Task 4 re-review: ALL ADDRESSED
Task 4: complete (0573cad + b2829c2)
Task 5 (lesson): HELD until readability step 1 lands; written under the readability contract afterwards.
Whole-branch review of A2 T1–T4 dispatched (fable) — package limited to the AMP paths (branch interleaves undo/redo and course-readability commits, reviewed separately).
Whole-branch review (fable): NEEDS A FIX WAVE — 3 important (poll tick during a running inventory truncates it as complete; Inspector inventory tally nulled by the same-instant MAC_STATE defer; Wi-Fi radios hear RFID PPDUs at AP txPowerDbm not chargeDbm/bsDbm → the "Wi-Fi never lands in a BST window" result is geometry, not law), 9 minor, 10 carries. ONE fix dispatch (opus, fresh) on engine/view files; readability T3 concurrently owns course files.
Fix wave: cd73d94 — I-1/I-2/I-3 fixed RED-first; M-2,3,4,5,6,7,9 done; M-1, M-8 carried. Probe under corrected power: in the 10×8 m room Wi-Fi still never starts inside a BST window (command energy-detect reach 6.97 m > farthest corner 6.40 m) — geometry, pinned with the 40 m-hall counter-example where reflections ARE lost. Scoped re-review dispatched (sonnet).
Fix-wave re-review: READY TO MERGE (A2 T1–T4 + fix wave). Carries C-1…C-10 in branch-review.md. Task 5 (lesson) stays HELD; the slice merges with course-readability step 1.
