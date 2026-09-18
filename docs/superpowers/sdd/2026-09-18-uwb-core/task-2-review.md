# Task 2 review: clocks, 40-bit counters and SS/DS-TWR formulas

Reviewed: brief (`task-2-brief.md`), report (`task-2-report.md`), and `task-2-review.diff`
(commit `5eadceb`, plus the unrelated preceding docs commit `dba17fd` swept into the diff range).
Verified independently by re-implementing the diff's `clock.ts`/`ranging.ts` logic in a scratch
Node script and by running `npx vitest run tests/uwb/ranging.test.ts tests/uwb/clock.test.ts`
in the worktree (9/9 pass) and `git status --porcelain` before/after (clean except two
pre-existing untracked files unrelated to this task, `src/uwb/position.ts` and
`tests/uwb/position.test.ts` — not touched, not part of this diff).

## Verdict

Spec: APPROVED
Quality: APPROVED

## Tolerance question — verdict

REFUTED (as a bug) / CONFIRMED (as physics): the report's numeric argument is correct — I
independently recomputed both residuals bit-for-bit (SS-TWR `dM=5`: −0.9255 mm; DS-TWR
`dM=12.5`: −0.6793 mm) and both exceed the 0.5 mm bound `toBeCloseTo(x, 3)` enforces, so a
spec-correct `counter()`/`ssTwrRaw`/`dsTwr` implementation cannot pass the brief's literal
`toBeCloseTo(x, 3)` assertions with these exact inputs — the widening to `toBeCloseTo(x, 2)`
is a legitimate correction of an inconsistency in the brief's own test literals (its DS-TWR
prose already said "to within 1 mm", looser than the `3`-digit assertion it wrote), not a
weakening of a real bug; the controller's provisional acceptance is upheld.

## Findings

1. **`tests/uwb/ranging.test.ts:317` and `:336`** — tolerance widened from `toBeCloseTo(x, 3)`
   (0.5 mm) to `toBeCloseTo(x, 2)` (5 mm). What: verified by direct recomputation (script
   reproducing `UwbClock`/`counterDiff`/`ssTwrRaw`/`dsTwr` exactly) that the true residuals are
   ≈0.925 mm (SS-TWR, `dM=5`) and ≈0.679 mm (DS-TWR, `dM=12.5`), both driven purely by
   independent ±0.5-RCTU (±2.35 mm-equivalent-at-the-timestamp) rounding in `UwbClock.counter`
   on non-cancelling legs of the exchange, matching the report's figures exactly. A genuinely
   spec-correct implementation cannot satisfy the original 0.5 mm bound here. Why: the brief's
   test literals demanded a tighter bound than the model's own 15.65 ps / 4.69 mm RCTU grid
   permits for these inputs; this is an oversight in the brief's authored digits, not an
   implementation defect. What to do: nothing — accept the widening as done. Non-blocking
   (informational; confirms the controller's provisional read). Note for the plan owner: since
   the 5 mm bound is fixed (not input-dependent) and these two test cases are deterministic
   (not seeded/randomised), it is safe for these specific literals, but if future tasks reuse
   `exchange()` with different `dM`/reply values close to a residual maximum, a swept check (I
   found DS-TWR residuals up to ≈2.7 mm across `dM ∈ [1,50)` with the same ±20 ppm/asymmetric
   reply pattern) shows 5 mm still holds comfortable headroom — no action needed now.

2. **General** — no other deviations from the brief found. All six signatures
   (`gaussian`, `counterDiff`, `UwbClock` constructor/`fromRng`/`counter`, `ssTwrRaw`,
   `ssTwrCorrected`, `dsTwr`, `rctuToMetres`, `metresToNs`, `fomFor`) match the brief's
   interfaces and formulas verbatim, including the draw order in `fromRng` (ppm drawn only
   when `undefined`, then origin always drawn) and the single post-scaling rounding in
   `counter`. Constants (`COUNTER_MOD`, `RCTU_NS`, `UWB_PPM_MAX`, `C_M_PER_NS`, `FOM_LOS`,
   `FOM_NLOS`) are all imported from `src/uwb/phy.ts`, none redefined. No `any`, no
   `@ts-ignore` anywhere in the four touched/created files (grep confirmed). Non-blocking.

## Findings by severity

Blocking: 0. Minor: 0. Informational: 2 (both above; neither requires changes).
