# SDD ledger — plan: docs/superpowers/plans/2026-09-22-uwb-completion.md

Pre-flight: T1 (pure move) precedes T2/T3 (both edit device.mms.ts); T2 and T3 serialised (both touch channel.ts/mms.ts); T4 after T3. No parallel implementers this plan.

## Progress
T1: dispatched (sonnet)
Plan committed bbc5233. T1 dispatched (sonnet, base bbc5233).
T1: d2a2416 DONE (2252 tests, fixtures unchanged; private members made public for the split — accepted, no external caller). T1: complete.
T2 dispatched (opus, base d2a2416).
T2: 255f459 DONE_WITH_CONCERNS (2261 tests; moved keys uwb-mms/uwb-mms-numbers at 19.84–20.02 dB combined; pin 2.05→2.10 cm; RIF rule verified against 15-24/0235r2, no change). Ruling: noise floor = sensitivity − preamble accumulation gain (18.06 dB) ACCEPTED — the plan left the reference undefined, the literal alternative re-pins the whole track; cost if wrong: one constant + course re-pin. Carry: reported sigmas (rangeSigmaM/dlDiff/ulDiff/ellipses) still use the quoted tsNoisePs on weak links.
T2 review dispatched (sonnet). T3 dispatched (opus, base 255f459), concurrent with the read-only review.
T2 review: NEEDS FIXES — 1 important (rifStartMs JSDoc quotes a 15-24/0235r2 sentence verbatim; paraphrase), 0 minor. Ruling: controller applies the paraphrase directly after T3 commits (mms.ts is in T3's set; no concurrent writers); the same sentence in task-2-report.md is paraphrased before the ledger export.
T3: 44c0282 DONE_WITH_CONCERNS (2276 tests, fixtures unchanged; POLL caps responders at 3 for a 600 RSTU slot; fragGapNs fix; Emission.rxId ignored by Spectrum.foreignMw by design). T2 fix + stale README bullet: f481f90 (controller). T2: complete.
T3 review dispatched (opus). T4 dispatched (opus, base f481f90) concurrently with the read-only review; T4 told: one-to-many scenes need ≤3 anchors at 600 RSTU or slotRstu = 1 ms/(R+1); R=2 has no true millisecond.
T3 review: NEEDS FIXES — 1 important (I1: README/report "true millisecond" slot 300 RSTU is schema-illegal; 600 RSTU is the floor, one-to-many spacing is (R+1) slots), 8 minor (M2 uwbNbSlotFitNs at R=1; M3 fragGapNs also fixes non-600 slots, unpinned; M4 scope rationale; M5 responders not rendered in rows.ts; M6 0x10 cited vs 0x30/0x40 default; M7 onMmsRx non-peer; M8 stale 'capture' reason in 3-way overlap; M9 UWB_BROADCAST untagged). Ruling: T4 corrected mid-flight (600 RSTU, ≤3 anchors); T3 fix round 1 (resume T3 implementer) runs AFTER T4 commits — README and fixtures overlap. Cost if wrong: one extra rebase-free serial wait.
T4: c73953d DONE_WITH_CONCERNS (2346 tests; knobs uwb.attacker/uwb.stsOff + UWB_STS_REJECT; uwb-nba base 3 anchors; MODULES gained tier-6 capstone module; four 4ab base keys moved, #3 pairwise variants carry old hashes; uwb-sts = uwb-intro hash). Accepted.
T3 fix round 1 dispatched (resume T3 implementer, base c73953d) concurrently with T4 review (sonnet, read-only).
T4 review: approve with fixes — 1 important (uwb-sts numbers prose "pull the same way" contradicts the quiz's correct "one falls, one rises"), 2 minor. Ruling: folded into the final fix wave (prose-only; saves a round). T4: complete pending fix wave.
T3 fix round 1: 909706c (all 9 addressed; fragGapNs also fixed pairwise at non-600 slots — pinned). T3: complete.
Whole-branch review dispatched (fable, bbc5233..909706c). Fix wave will also carry the T4 review's 1 important + 2 minor.
Whole-branch review (fable): FIX WAVE — 6 important (I1 capstone one-to-many cost claims inverted; I2 half-metre brief never closed; I3 stale "one distance" in uwb-nba/uwb-nba-coexist after re-base; I4 uwb-sts "pull the same way"; I5 STS vs SYNC length claim; I6 honest 20 m run not loadable from uwb-sts), 10 minor, 6 carries. Engine T1–T3 merge-ready. ONE fix wave dispatched (resume T4 implementer, base 909706c).
Fix wave: 3bba75f (I1–I6 + course minors M1/M2/M9/M10; uwb-sts#2 = uwb-intro#0 added). Controller: 01eb724 (M3, M5, M6, M7). Carries: M4 foreignDbm doc vs first-fragment SINR; M8 duplicated hashOf; C1–C6 per branch-review.md. Gates: tsc clean, 2357 tests green. Merged to main.
