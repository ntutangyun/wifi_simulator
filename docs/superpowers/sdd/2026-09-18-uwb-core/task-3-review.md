# Task 3 review: 2-D position solver with GDOP and error ellipse

Reviewed: commit `bc1b1bb` (`src/uwb/position.ts`, `tests/uwb/position.test.ts`) against
`task-3-brief.md`.

## Verdict

Spec: APPROVED
Quality: CHANGES REQUIRED

## Findings

1. **[Blocking] `src/uwb/position.ts:140-161` — singular `JᵀJ` (collinear/degenerate anchor
   geometry) leaks `NaN`/`Infinity` into the returned `Fix` instead of a defined result.**
   The in-loop Gauss–Newton step guards the determinant (`if (Math.abs(det) < 1e-15) break`,
   line 108) before applying an update, but the *post-loop* recomputation of `JᵀJ` for
   `gdop`/covariance (lines 140-144) divides by the same `det` with no guard at all:
   `invXX = jtjYY / det`, `invXY = -jtjXY / det`, `invYY = jtjXX / det`. When anchors and the
   tag are collinear (a real, reachable input — nothing in `solvePosition`'s contract excludes
   it), `det` is exactly 0 and these become `0/0` (`NaN`) or `x/0` (`Infinity`), which then
   propagate through `gdop`, `sxx/sxy/syy`, and the eigen-decomposition into
   `ellipse.a/b/thetaRad`. Verified empirically: for anchors `(0,0,1),(5,0,1),(10,0,1)` and tag
   `(3,0,1)`, `solvePosition` returns
   `{ x: 5, y: 0, gdop: NaN, ellipse: { a: NaN, b: NaN, thetaRad: NaN }, residualM: 2, iterations: 1 }`
   — i.e. it silently reports a "fix" that is both numerically wrong (loop exited on iteration 1
   without applying the well-conditioned x-only update, so `x` stayed at the centroid instead of
   moving toward 3) and structurally invalid (`NaN` fields) rather than returning `null` or some
   other defined degenerate result. The brief's own review checklist calls out exactly this case
   ("singular JᵀJ (collinear anchors)"), so this is squarely in scope. Fix: when the final `det`
   is ~0 (or use the same `1e-15` threshold consistently), return `null` (simplest, consistent
   with the existing `< 3 usable ranges → null` contract) or otherwise produce a well-defined
   degenerate `Fix` (e.g. clamp/flag unobservable directions) instead of letting `NaN`/`Infinity`
   escape to callers.

2. **[Minor] `src/uwb/position.ts:90-104` vs `121-137` — duplicated Jacobian/residual
   accumulation.** The per-iteration loop body and the final "recompute at convergence" block
   build `jtjXX/jtjXY/jtjYY` (and residuals) with near-identical code. Not incorrect, but a
   small shared helper (e.g. `computeJtJAndResiduals(x, y, usable)`) would remove ~15 lines of
   duplication and reduce the risk of the two copies drifting if the model changes later
   (e.g. if the singular-matrix fix above is added, it would need to be applied in one place
   only).

3. **[Minor] `src/uwb/position.ts:82-118` — early `break` on a merely near-singular `det`
   discards a still-useful partial update.** When `det` is small but not exactly 0 (nearly, not
   exactly, collinear geometry), the loop breaks entirely and keeps the untouched `x, y` from the
   previous iteration, even though one direction (e.g. along the anchors' line) may still be
   well-conditioned and worth updating. This is a secondary consequence of solving the 2×2 system
   as a single closed form rather than handling the axes independently; not required by the brief
   (which only specifies the closed-form 2×2 solve), so this is a suggestion, not a blocker —
   flagging alongside finding 1 since a fix for the singular case may want to address both.

## Notes (verified, no issues)

- Exports and signatures match the brief exactly: `AnchorPos`, `Ellipse`, `Fix`, `rangeSigmaM`,
  `solvePosition(anchors, ranges, zTag, sigmaRangeM)`.
- `C_M_PER_NS` is imported from `./phy` (`src/uwb/phy.ts`), not redefined; `rangeSigmaM(100)` ≈
  0.0424 m checks out against `C_M_PER_NS = 0.299792458`.
- Gauss–Newton starts at the anchors' centroid, iterates ≤ 20 times or stops on a step < 1 mm
  (`STEP_TOL_M = 1e-3`), matches the brief.
- `< 3` usable ranges → `null`; ranges for unknown anchor ids are filtered out via the `byId`
  map before the count check — both match the brief and the tests.
- `gdop = √trace((JᵀJ)⁻¹)` uses the horizontal (x, y) components of the 3-D unit vector
  `(p − a_i)/‖p − a_i‖`, computed from the full 3-D distance (`Math.hypot(dx, dy, dz)`) — correct
  per brief, and the "3-D anchors, 2-D fix" test exercises this.
  A tag exactly at an anchor's horizontal position but offset in z (zero-length horizontal
  vector, nonzero 3-D distance) is handled correctly: `ux = dx/dist3 = 0`, `uy = 0`, no division
  by zero, since `dist3 = |dz| > 0` in that case; the `dist3 > 0 ? … : 0` guard also covers the
  literal-zero-distance case cleanly.
- Eigen-decomposition matches the brief's formulas verbatim, including the discriminant clamp
  (`Math.max(tr*tr/4 - det2, 0)`) and `thetaRad = ½·atan2(2·sxy, sxx − syy)`; the extra
  `Math.max(lambda1/2, 0)` clamps before the final `sqrt` are a reasonable defensive addition.
- No `any`, no `@ts-ignore` anywhere in the new file (confirmed by grep).
- All 6 brief-specified tests pass; `npx tsc -b` is clean (per the task-3-report and re-verified
  independently that the file has no `any`/`@ts-ignore`).
- Commit `bc1b1bb` contains exactly the two files the brief calls for, with the requested
  commit message and trailers.

## Re-review (fix round 1)

Reviewed commit `f015145` (`bc1b1bb..f015145`, `src/uwb/position.ts` and
`tests/uwb/position.test.ts` only) against the controller's ruling.

Spec: APPROVED
Quality: APPROVED

### (1) Blocking finding resolved

Yes. `MIN_DET = 1e-9` is checked in both places: inside the Gauss–Newton loop right after
computing `det` on each iteration (`src/uwb/position.ts:120`, `return null` — no more silent
`break` with a stale/partial update), and again at the final covariance step before the `JᵀJ`
inverse is used (`src/uwb/position.ts:137`, `return null` before `invXX/invXY/invYY` are
computed). No path remains that divides by an unguarded `det`, so `NaN`/`Infinity` cannot leak
into a returned `Fix`. Re-ran the exact repro from finding 1 — anchors `(0,0,1),(5,0,1),(10,0,1)`,
tag `(3,0,1)` — via the new test `'collinear anchors cannot fix a point: null'`
(`tests/uwb/position.test.ts:190-195`), which asserts `solvePosition(...)` is exactly `null`
(`toBeNull()`, which would fail on any object with `NaN` fields). Confirmed passing.

### (2) Minors addressed per the ruling

- Minor 2 (duplicated Jacobian/residual accumulation): resolved. Both the per-iteration loop and
  the final at-convergence recompute now call one shared `accumulateNormal(usable, x, y, zTag)`
  helper (`src/uwb/position.ts:50-81`) returning `{ jtjXX, jtjXY, jtjYY, jtrX, jtrY, sumSq }`; no
  duplicated accumulation code remains.
- Minor 3 (near-singular det discarding a partial update via `break`): resolved per the ruling —
  near-singular now returns `null` uniformly (both the in-loop and final checks), rather than
  breaking and keeping a partial/stale `(x, y)`.

### (3) No regression

- `npx vitest run tests/uwb/position.test.ts` — 7/7 pass (the original 6 unchanged plus the new
  collinear-geometry case), independently re-run.
- `npx tsc -b` — no errors attributable to `src/uwb/position.ts` or its test; the errors currently
  reported by a full `tsc -b` are all in `tests/model/lanes.test.ts`, `tests/model/uwb-scenario.test.ts`,
  and `tests/uwb/view.test.ts`, from Task 4's concurrent in-progress work in other files, out of
  scope for this review.
- Math for well-conditioned geometry is unchanged: `accumulateNormal` is a verbatim extraction of
  the previous inline accumulation (same `dx/dy/dz`, `dist3`, unit-vector, and residual formulas),
  and `MIN_DET = 1e-9` is far below the `O(1)`-scaled determinant of any of the well-conditioned
  test geometries (square, triangle, off-centre points), so none of those paths are affected —
  confirmed by the unchanged pass/values of the original 6 tests.

No remaining findings.
