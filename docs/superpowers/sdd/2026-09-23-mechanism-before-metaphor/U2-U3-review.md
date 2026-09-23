# Review — U2 (uwb-sstwr, uwb-dstwr, uwb-blocks) and U3 (uwb-position, uwb-geometry, uwb-coexist, uwb-contention)

Reviewed read-only against commits 0054ab7 (U2) and 89f152f (U3), worktree
`D:\wifi_sim\.claude\worktrees\feat-link-2g`. No files edited, no git state changed.

## Method

- Read every `steps` block in all seven lessons against the engine: `src/uwb/device.ts`,
  `src/uwb/ranging.ts`, `src/uwb/clock.ts`, `src/uwb/position.ts`, `src/uwb/session.ts`,
  `src/model/scenario.ts` (schema), `src/engine/spectrum.ts`, `src/uwb/channel.ts`.
- Ran `MECHANISM_INCLUDE=...,uwb-sstwr,uwb-dstwr,uwb-blocks,uwb-position,uwb-geometry,uwb-coexist,uwb-contention
  READABILITY_INCLUDE=...` against `tests/course/readability.test.ts` — 986 passed.
- Ran the seven lesson test files individually — 250 passed.
- `npx tsc -b --noEmit` — clean.
- Dumped all seven lessons in `en` and `zh` (`scripts/lesson-dump.ts`) and read them in
  course order as a reader who has just finished uwb-intro/uwb-frame/uwb-sts.

## 1. Procedures against the code

Every `steps` block checked traces to the cited engine function, in the engine's own
order, with the engine's own constants:

- **uwb-sstwr**: the four-stamp sequence, `Coffs` from the carrier lock, `ssTwrRaw` /
  `ssTwrCorrected`, `RCTU_NS × C_M_PER_NS`, and the closing claim that `UWB_RANGE` carries
  no error bar while `rangeSigmaM` is computed apart — all confirmed against
  `src/uwb/device.ts` (`onResponse`, `transmitFor`), `src/uwb/ranging.ts`,
  `src/uwb/position.ts` (`rangeSigmaM`).
- **uwb-dstwr**: the six-stamp sequence and `dsTwr`'s four-product formula match
  `src/uwb/device.ts` (`onFinal`, `onReport`) and `src/uwb/ranging.ts` exactly, including
  "no clock offset is read" (`dsTwr` takes no `coffs` argument).
- **uwb-blocks**: `uwbSlotsPerTag`'s `2·anchors + 2` for DS, `slotStartNs`'s
  `block·blockNs + round·roundNs + slot·slotNs`, and `slotAction`'s per-slot transmitter
  assignment (slot 0 Poll, 1..4 Response, 5 Final, 6..9 Report at 4 anchors) all match
  `src/uwb/session.ts` line for line.
- **uwb-position**: the 8-step Gauss–Newton procedure (centroid seed, residual, J row,
  normal-equation solve, 1 mm/20-iteration stop, RMS residual, formatter's `hypot` error)
  matches `src/uwb/position.ts` (`solvePosition`, `accumulateNormal`, `gaussNewton`,
  `fixFrom`) and `src/uwb/device.ts` (`solveFix`) exactly.
- **uwb-geometry**: the GDOP/ellipse derivation (`JᵀJ` inverse, `√(invXX+invYY)`,
  `σ_r²·(JᵀJ)⁻¹`, eigenvalues, `atan2`) matches `fixFrom` exactly, including the closing
  claim that nothing after step 1 reads a measured range.
- **uwb-coexist**: the mediator steps (EIRP spread evenly, own path-loss law, per-emission
  share in mW, SIR against `UWB_SIR_MIN_DB`, no retry inside the block, the reverse
  direction stopping at `CCA_ED_DBM`) match `src/engine/spectrum.ts` (`Spectrum.foreignMw`)
  and `src/uwb/channel.ts` field for field.
- **uwb-contention**: the draw procedure (`slot = 1 + rng.int(S-1)`, slot 0 never drawn,
  `UWB_CAPTURE_DB = 6`, one collision record per slot, the round-boundary feedback loop,
  slot-as-reply-time) matches `src/uwb/device.ts` (`drawContentionSlot`, `onRxFail`,
  `endRound`) exactly.

No plausible-but-uncoded step found in either batch. Where sstwr/dstwr describe the same
mechanism they agree (Treply/Tround naming, the −20.24 ppm Coffs, the four-counter set for
anchor-1 reproduced identically in both lessons' worked tables); where blocks/coexist/
contention describe the schedule they agree with each other and with `session.ts`.

## 2. U3's engine finding — confirmed

`solvePosition` (`src/uwb/position.ts`) returns `Fix.residualM`. `UwbDevice.solveFix`
(`src/uwb/device.ts:388-405`) emits `UWB_POSITION` with `x, y, gdop, ellipse, anchors,
block, method` — no residual field. The `UWB_POSITION` record type in `src/uwb/records.ts`
has no residual field either. `fmtRecord` (`src/uwb/format.ts`) computes its printed error
from `hypot(x-trueX, y-trueY)`, not from the solver's residual. `src/uwb/ui/rows.ts` has no
reference to a residual at all. The finding is exactly as reported: the residual is
computed and never surfaced anywhere a reader can see it.

Both lessons' corrected sentences ("the solver knows that without being told which range
lied" / "Inside the solver it leaves a 21 cm residual ... no record carries that figure")
are accurate given this.

Reproduced the three residual figures directly against `solvePosition`:
- uwb-position's clean-round residual "under a micrometre" — consistent with feeding
  near-exact ranges through Gauss–Newton (float-precision floor).
- uwb-position's block-0 worked example, 1.44 cm RMS residual at the converged point
  (3.9933, 3.4981) — consistent with `√(Σr_i²/n)` at that point.
- uwb-geometry's walled-scene 21 cm residual — consistent with a 0.5996 m NLOS excess on
  one of four ranges pulling the fit off by the reported 0.316 m (noise-free) / 30.9 cm
  (this run), leaving the stated residual.
All three are pinned in the lessons' own test files and the pins run the actual solver
rather than asserting the printed number, so they will catch drift.

## 3. Slot-floor scope — confirmed, both correct

`ScenarioSchema.uwb.slotRstu` (`src/model/scenario.ts:595`) is `z.number().int().min(300)`
for every session, mode-independent. The 600 RSTU figure is MMS-only: the `superRefine`
block's `slotRstu % 300 !== 0` check plus the two-slot 608.2 µs REPORT requirement (echoed
in `MmsRoundPlan.fragGapNs`'s doc comment in `src/uwb/session.ts`) makes 600 RSTU the
shortest *legal MMS* slot, not a general floor.

Checked every lesson in both batches: none of the seven states or implies a 600 RSTU
general floor. `uwb-blocks` (a 4z DS-TWR session, not MMS) correctly states 300 RSTU /
250.0 µs in its `deeper` section and pins it against `schemaIssues(300) === []` /
`schemaIssues(297)` reporting the floor violation. No lesson in either batch is an MMS
lesson, so the 600 figure correctly appears nowhere.

## 4. U3's two `numbers` → `deeper` moves

- **uwb-coexist, "When the spare runs out"**: the saturated-upload corner case (200/200
  ranges lost, 0/25 fixes, 0.97% Wi-Fi throughput cost). This is reachable only via the
  "Saturated upload" variant and states no step of the main mechanism — the main-path
  procedure (mediator registration → SIR test → timeout → 3-anchor fix) is fully present
  in `numbers` without it, and the main table's "Saturated upload" row already carries the
  same totals. Nothing load-bearing was removed; not an Important finding.
- **uwb-contention, "Latency"**: states the base scene's first-fix time (1.218 s) against
  the roll-call's. This is a summary statistic over the whole run, not a step of the draw
  procedure, and `deeper`'s neighbouring paragraph ("What thirty rounds actually deliver")
  already restates the 1.218 s figure. Nothing load-bearing was removed.

Both moves are within the letter and spirit of the rule ("`deeper` is for provenance and
corner cases"); neither took a mechanism step off the main path.

## 5. U2's cleared table-cell defects

`CELL_RULE_CARRIES` in `tests/course/readability.test.ts` now lists only `uwb-ul-tdoa` and
`uwb-mms-numbers` — confirmed the `uwb-dstwr` (`Treply1`) and `uwb-blocks` (`SP1`) entries
are gone, matching the report. Verified in the lesson source: `uwb-dstwr`'s "Two halves and
the answer" table's `Treply1` header is glossed by the procedure's own steps text
(`Treply1 (its wait, Poll in to Response out)`), which appears verbatim in both the steps
list and the worked-example row labels. `uwb-blocks`' ARC-IE cell now reads
`SP1（加扰时间戳序列分组）` in its Chinese half, and the RDM-IE cell below it is bilingual
too — both English halves are the log's literal `SP1 · DS-TWR · ...` / `4 devices: ...`
text, matching what the report claims about `arc.value`/`rdm.value` byte-identity. All
seven lesson test files pass (250/250), so the existing cell-vs-inspector pins hold.

## 6. Beginner read (EN + ZH), all seven

Read all seven dumps in course order. Findings:

**No blocking pointer-phrase failures found in either batch's own material.** Every
quantity used on the main path (Treply, Tround, Coffs, GDOP, SIR, residual, RCPS, RCMA,
etc.) is named and sized at first use, in both languages, matching the reports' "naming
fixed" claims.

**Minor — uwb-coexist zh, "三个办法，只有一个管用"**, second bullet:
> 把 Wi-Fi 信道挪一点，只让它一部分重叠——部分重叠并不等于部分保护，还是那些帧在还是那些块里丢掉。

The clause "还是那些帧在还是那些块里丢掉" repeats "还是" in a way that reads as translated
English word order ("the same frames ... in the same blocks") rather than natural Chinese.
It is still followable (a beginner would not stop here), but it does not read as
independently composed Chinese. Suggest: "丢的还是那些帧、还是那些块" or simply "还是那些帧
在那些块里丢掉，一帧没少" to remove the doubled "还是...还是..." construction.

**Pre-existing, out of scope**: `uwb-sstwr` and `uwb-dstwr` carry several ASCII straight
quotes in Chinese prose (e.g. `"几乎抵消"`, `"理想晶振"`, `"再深一层"`) rather than the
full-width `“ ”` the amendment's own zh style asks for. Checked by `git blame` and by
diffing commit 0054ab7 directly: every one of these lines predates both U2 and U3 (commit
84261ae, 2026-09-21) and was not touched by either batch's diff. Not attributable to these
implementers; flagging only so the controller does not lose track of it, since it is real
and in a lesson these two batches touched.

No sentence in either batch points at a quantity it never names. Both Chinese texts read
as independently composed (natural clause order, correct measure words, no residual
English syntax) apart from the one Minor item above and the pre-existing straight-quote
carry.

## 7. Pins

All pre-existing pins across the seven lesson test files pass (250/250), and the readability
suite passes with both batches included via `MECHANISM_INCLUDE`/`READABILITY_INCLUDE`
(986/986). New pins were spot-checked for deriving against the engine rather than copying
constants from prose:
- uwb-sstwr/uwb-dstwr: pins run `ssTwrRaw`/`ssTwrCorrected`/`dsTwr`/`counterDiff` on the
  run's own `UWB_TS` records, not on the printed numbers.
- uwb-blocks: pins run `slotStartNs`/`uwbSlotsPerTag` against every `UWB_ROUND`/`UWB_SLOT`
  the run emits.
- uwb-position/uwb-geometry: pins rebuild every worked-example cell from `solvePosition`
  directly and compare to the emitted record (confirmed by reading the test files' own
  descriptions and by the fact that `Fix.residualM` — not exposed anywhere else — is the
  only way to pin the residual figures, which the tests do).
- uwb-coexist/uwb-contention: pins rebuild `foreignDbm`/SIR from `wifiToUwbPathLossDb` and
  the draw bounds from `Rng.int`, not from the printed dB/slot figures.

`MECHANISM_DONE` (readability.test.ts:445-457) now includes `uwb-sstwr`, `uwb-dstwr`,
`uwb-blocks` (U2, controller-registered) but not the four U3 ids — expected, since U3 grades
via `MECHANISM_INCLUDE` ahead of controller registration, per the workflow.

## Summary

No Important findings. One Minor finding (the doubled 还是...还是... clause in uwb-coexist
zh). One pre-existing, out-of-scope item flagged for visibility (straight quotes in
uwb-sstwr/uwb-dstwr zh, predating both batches).

**PASS**
Important: 0. Minor: 1.
Worst finding: uwb-coexist's zh "三个办法" second bullet reads with translated-English
clause repetition ("还是那些帧在还是那些块里丢掉") rather than composed Chinese — followable,
not blocking, but not independently written.
