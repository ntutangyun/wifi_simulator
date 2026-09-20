# SDD ledger — plan: docs/superpowers/plans/2026-09-21-uwb-4ab.md

Worktree: D:\wifi_sim\.claude\worktrees\feat-link-2g (branch feat/uwb-ranging, after the resize port at 9cf2045 and spec c002e60)
Spec: docs/superpowers/specs/2026-09-21-uwb-4ab-design.md

## Pre-flight scan

| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1 → T2 | `MmsPhy`, `rsfNs/rifNs`, `mmsFragmentDbm`, `MMS_COMBINE_MAX_DB`, `nbBand/nbPl0Db/NB_*`, `NB_LBT_THRESHOLD_DBM`, `nbChannelForBlock`, `UwbMode 'mms'`, `UwbSessionCfg.mms` | consistent; T2's builders take `MmsPhy` and a channel number |
| T1 → T3 | `mmsLayout` (slot indices, report slots), `ratioSigma`, `trainDetected`, `combineGainDb` | consistent; T3's `slotAction` reads the layout, `evaluateTrain` uses the detection rule |
| T1 phy.ts ↔ schema | `uwbSlotsPerTag(..., 'mms', mms)` used by schema, roundPlan and network — three call sites | ruling: the `mms` argument is optional and required only for mode 'mms'; a missing one throws, so a call site that forgets cannot silently plan a 1-slot round |
| T2 ↔ existing coupling | `Emission.lossDb` replaces `uwbChannelOf`; Wi-Fi channel passes `wifiToUwbPathLossDb` | bit-exact by construction; fixture + coexist tests guard |
| T2 → T3 | `makeRsf/makeRif/makeNbPoll/makeNbResp/makeNbReport`, `lbtBusy`, per-frame sensitivity | consistent |
| T3 device | the tag's block fix at its last pair round; ranges kept across rounds | consistent with `endRound` ordering (fix before clear) |
| T3 ↔ T5/T6 | records `UWB_MMS_TRAIN`, `UWB_NB_LBT`, `integrity`, POLL's `uwb.nb.channel` | consistent |
| T4 ↔ T1 | `uwbModePatch('mms')` landed in T1 so the mode select works before the fields exist | consistent |
| T7 ↔ T5/T6 | records hash covers the new lessons; runs after them | consistent |
| Global | `mode: 'twr'` byte-identical; fixture unchanged until T5 | guarded |

Plan text vs rubric: no test-that-asserts-nothing mandated; the per-frame dispatch in T2 is a switch, not duplication.

Model plan: T1 opus, T2 opus, T3 opus, T4 sonnet (docs prose reviewed by opus), T5 opus, T6 opus, T7 sonnet; reviewers opus for T1–T3/T5–T6, sonnet for T4/T7.

## Progress
Task 1: dispatched (base a4a14f3, opus)
Task 1: implemented (ccf72d0; concerns: network 9-anchor cap + tag-count rule to align in T3, roundName/uwbModes.mms forced by types, phy<->mms import cycle documented). Review dispatched (opus)
Task 2: dispatched (base ccf72d0, opus; in parallel with the T1 review, read-only)
Task 1: complete (ccf72d0, review approved; 0 critical/important in-task). Carry to T3 (Important): network.ts still caps 9 anchors and counts tags not pairs for 'mms' — schema and network must agree; also nb.ts `nbCenterMhz` range guard + `derived`/`model` tags on nbPpduNs / NB_LBT_THRESHOLD_DBM (minors 4–5). Carry to T4: "draft"/"草案" in `uwbModes.mms` and the "Both need four anchors" hint (minors 2, 6). Parked for the fix wave: block-rule duplicate branch (minor 1), phy↔mms↔nb import cycle → `units.ts` (minor 3), no-UWB-nodes guard inheritance (minor 7, informational)
Task 2: implemented (9f3b878; 1504 tests, fixture unchanged). Concerns: exhaustive FrameKind records forced 30 EN+ZH strings + placeholder colours (T3 owns the palette); laneLayout label ladder and frameFields decoder not yet MMS/NB-aware (T3 must do before rendering); capture rule spans NB and UWB receptions at one node (harmless while phases are disjoint — parked, fix wave: per-radio capture); makeNbReport picks msgId from which time is present (ruling: accepted, T3 passes only the reporting side's time). Review dispatched (opus)
Task 3: dispatched (base 9f3b878, opus; in parallel with the T2 review, read-only)
Task 2: review: spec approved, quality CHANGES REQUIRED (Important: NB emission path untested end-to-end; onChange per-reception band untested). Fix round 1: resumed implementer (tests + widen isNbFrame/isMmsFragment to FrameKind + throw on empty makeNbReport times + pin the 4z control). Parked for the fix wave: three copies of the free-space law (minor 3), unreadable UwbChannelCfg.mms (minor 4), cross-radio capture (minor 8), placeholder colours → T3 owns
Task 2: fix round 1 (a5a452f); scoped re-review dispatched (sonnet)
Task 2: complete (9f3b878 + a5a452f, re-review approved)
Task 3: implemented (aef127a, amended to 6367927 for the attribution trailer; 1586 tests, fixture unchanged). Rulings: initiator inverts the train ratio (SS correction is the responder's rate) — accepted; fragments fire on true time so the train spacing is re-scaled by the tx ppm at the receiver (model) — accepted, reviewer to check; view.mms.trains keyed by peer (RIF overwrites RSF row) — parked for the fix wave (key by peer+kind). Lesson finding carried to T5: at the spec geometry the third anchor (4.5, 4) is 8.58 m from the tag and still ranges at X = 4; `integrity: false` needs mixed-5 with stsLen 256. Review dispatched (opus)
Task 4: dispatched (base 6367927, opus; owns UwbSessionFields.tsx, i18n.ts, planOps.ts, Guide.tsx, glossary.ts, README.md, EditorGuide.tsx)
Task 5: dispatched in parallel (base 6367927, opus; owns src/course/**, lessonKit.ts, curriculum.ts, lessons.ts, fixture, tests/course/uwb-mms.test.ts)
Task 3: review: spec approved, quality CHANGES REQUIRED (Important 1: NB frames' timeline tooltip says "HRP UWB (SP1 PPDU)" via uwbRate — needs an NB rate string + tightened uwb-lanes test; Important 2: mmsSlotAction re-derives the fragment→slot inverse instead of reading mmsLayout). All four physics deviations verified correct by the reviewer (initiator inverts the ratio; train re-spacing by tx ppm; σ-based thresholds; two draws on both paths). Fix round 1 deferred until T4 lands (it owns i18n.ts); will also take minors 4 (skippedBlocks = lbtBusy), 6 (marginDb identity comment), 9 (clear-LBT test with a Spectrum), 10b (channel per round comment). Parked for the fix wave: beginRound silent dead round (3), trains keyed by peer (5), RCTU_PER_CHIP duplicate / import cycle (7), fragment colour = amp colour (8), device.ts 1569 lines → device.mms.ts (10)
Task 4: implemented (fc1854c). Concerns: parseNbChannels in editor/planOps imported by uwb/ui (first such edge — parked, fix wave: move to ui/inputs.ts); uwbModePatch('mms') leaves method/slot alone (ruling: the T3 fix round makes the patch set method 'ss' and slotRstu 600 — the draft's 0.5 ms slot — so the editor's MMS round is the 28-slot/14 ms one the Guide describes; DEFAULT_UWB_SESSION itself stays 2400 for byte-identity); no `see` field on glossary items (accepted). Review dispatched (opus)
Task 3: fix round 1: resumed implementer (findings 1–2 + minors 4, 6, 9, 10b + the uwbModePatch('mms') ruling)
Task 4: review: spec approved, quality CHANGES REQUIRED (Important 1: AoA/schedule disabled-hints false in MMS — `oneWay` → `nonTwr` + a fourth hint; Important 2: parseNbChannels belongs in src/ui/inputs.ts, not editor/planOps). Minors to fix in the same round: "far longer than the entire UWB exchange" false for the default train (3); "the layout's 0.5 ms" → "the draft's default slot" (4); set-id ignores gapMs — soften the "never claims a set" claim / ZH hint (5); derived dBm wrong for X = 0 — use mmsLongestFragmentNs (6); "holds all three … ratio" — ratio not required, fallback exists (7); test nits (8); U+2212 + dead branch (9). Fix round 1 QUEUED behind T3's fix round (both touch UwbSessionFields.tsx and i18n.ts)
Task 3: fix round 1 (2f98242; kept lbtBusy and skippedBlocks as distinct fields — accepted); scoped re-review dispatched (sonnet)
Task 4: fix round 1: resumed implementer (Important 1–2 + minors 3–9)
Task 3: complete (6367927 + 2f98242, re-review approved)
Task 5: implemented (365ddfa; 1645 tests; fixture +4 keys). Rulings: anchor 3 at (0.3, 4.0) (both brief candidates fail; feasible band ~1 m) — accepted; burst split 6.59 dB + a third 3.95 dB term (fragment shorter than a Poll) — accepted, spec's 6.9 was an estimate; three course tests re-pinned for the new tier/tail — accepted, T6 must re-pin the tail again. Review dispatched (opus)
Task 6: dispatched (base 365ddfa, opus; owns src/course/**, tests/course/**, fixture; T4 fix round still running on ui/editor files)
Task 4: fix round 1 (5cb5b42; nb.ts docstring correction accepted); scoped re-review dispatched (sonnet)
Task 5: review: spec ⚠ (structure/pins fine), quality CHANGES REQUIRED (Important: 4z Poll attributed to anchor 1 — the tag polls; "every one" of 21 timeouts names anchor-1 (7 do) and the set check drops the peer; observe 4 quotes the last block's inspector state at 12.6 ms; six quoted UI strings incl. two raw counters unpinned). Minors 5–11 too. Fix round 1: resumed implementer (only uwb-mms.ts + its test; T6 owns the rest of course/)
Task 4: complete (fc1854c + 5cb5b42, re-review approved). Parked for the fix wave: "several times over" claim loose for custom nMsr 256 / gap 64 (525 µs RSF) — qualify as "for every mandatory set"
Task 5: fix round 1 (32a7984; the one red line "uwb-mms is last" belongs to T6's re-pin); scoped re-review dispatched (sonnet)
Task 5: complete (365ddfa + 32a7984, re-review approved; parked: stale test title "1.22 m east")
Task 6: implemented (f5b528d; 1692 tests; fixture +4). Rulings: base scene with the saturated laptop loses 7/7 blocks (the honest outcome; the outside/hop variants are the remedy) — accepted; "the router deferred" measured as CCA_BUSY{energy} during NB frames with the uncoupled variant as zero control + throughput/PPDU fallback — accepted; no LBT record without a mediator — accepted (it is what the engine does; the lesson must say why). Review dispatched (opus)
Task 7: dispatched in parallel (base f5b528d, sonnet; owns tests/engine/uwb-record-hashes.test.ts, tests/fixtures/uwb-record-hashes.json, src/engine/hash.ts if needed)
Task 6: review: spec ⚠, quality CHANGES REQUIRED (Important: "Nothing about this narrowband radio is in IEEE Std 802.15.4-2024" false — the NB PHY is Clause 12 O-QPSK). Fix round 1: resumed implementer (Important 1 + minors 2–8, 10; minor 9 covered by T7)
Task 7: implemented (bd65183; 37 keys, ~5 s). Ruling: the mismatch diagnostic prints the first record of the current run (no stored records to diff against) — accepted. Review dispatched (sonnet)
Task 7: complete (bd65183, review approved; sorted-key serialisation accepted; parked minors: −0 note, FNV constants duplicated, comment on sorted order)
Task 6: fix round 1 (4f2b3de; 1722 words); scoped re-review dispatched (sonnet)
Whole-branch review dispatched (fable), base a4a14f3, head 4f2b3de, in parallel with the T6 re-review
Task 6: complete (f5b528d + 4f2b3de, re-review approved; parked: "802.11ax" wording in the WIFI_6G_CENTER_MHZ comment). ALL 7 TASKS COMPLETE at 4f2b3de.
Whole-branch review (fable): CHANGES REQUIRED — gates green (116 files / 1729 tests), fixture additions only, no wrong tag, all numbers reproduce. Important 1: lost-leading-fragment RMARKER walk-back ignores the tx drift (3.0 m per lost fragment at 20 ppm; untested end to end); Important 2: uwb-mms first paragraph hands the NB radio to the draft. Minors 3–9. Rulings on parked: INCLUDE trains keyed peer:kind, units.ts leaf (cycle + RCTU_PER_CHIP), one free-space law, drop UwbChannelCfg.mms, fragment colour, beginRound throw, "several times over", stale titles; DEFER cross-radio capture, device.ts split (next slice), schema block-rule branch, −0/FNV. ONE fix wave dispatched (opus): findings 1–9 + the Include list
Fix wave: commits 293966e..8c25077 (10 commits, 1744 tests, both fixtures unchanged; both lessons at 1723/1724 words). Scoped re-review dispatched (opus)
Fix wave re-review (opus): READY TO MERGE — every finding and Include ruling addressed; gates re-run (116 files / 1744 tests, tsc, build, fixtures byte-identical); float note: rssiDbm's re-association differs by ≤ 2.8e-14 dB, guarded by both fixtures. Stale comment at network.ts:106 fixed by the controller. SLICE 7 COMPLETE. Carry list (see branch-review.md): one-to-many MMS cycle + per-radio capture; SNR-dependent timestamp precision; RpRifOffset 4-slot default vs the model's X+Z−1 ms RIF start (reconcile against D5.0); device.ts split into device.mms.ts; both UWB Tier 3 lessons sit at 1723/1724 words; rssiDbm re-association guarded by fixtures only; ppduBand centring, hyperbola drawing, AoA elevation, AES-CTR if ever needed.
