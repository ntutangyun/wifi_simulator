# Task 1 review — angle of arrival: model, engine, view, overlay, editor

Reviewed: `6cd5899..2b01118` (two commits, 21 files, +883/−19), against
`.superpowers/sdd/2026-09-19-uwb-aoa/task-1-brief.md`, the task report, and Slice 6 of
`docs/superpowers/specs/2026-09-19-uwb-slices-design.md`. Concurrent uncommitted work by other
agents (`docs/superpowers/sdd/2026-09-19-uwb-aoa/`) was ignored.

## Verdict

- Spec: APPROVED
- Quality: APPROVED

## Verification

- `npx vitest run tests/uwb tests/ui tests/editor tests/engine/lesson-hashes.test.ts` — 25 files,
  353 tests, all passing (exit 0). `tests/engine/lesson-hashes.test.ts` green and untouched, which
  is what pins byte-identity for every pre-existing session.
- `npx tsc -b` — clean, exit 0, no errors anywhere (none to attribute to the other agents either).
- No `any`, `@ts-ignore`, `@ts-expect-error` or `as unknown as` in any added line (the four grep
  hits are the English words "any"/"many" inside i18n hint strings and a comment).
- The review package's 21 `diff --git` entries match `git diff --stat 6cd5899..2b01118` exactly —
  nothing outside the package was touched, and no lesson fixture appears in it.

## What was checked, and holds

**Sign and convention, end to end.** `trueAzimuthDeg` = `wrapDeg(atan2(Δy, Δx)·RAD − yawDeg)`,
counter-clockwise positive, yaw measured from +x, wrapped to (−180, 180] (`wrapDeg` maps −180 to
+180; pinned by `trueAzimuthDeg(at(0,0), 90, at(0,−1)) === 180`). The fix inverts exactly that:
`bearingRad = (yawDeg + θ̂)·DEG`, `p = (ax + rh·cos, ay + rh·sin)`. The overlay's axis swap is
right: `ray.rotation.y = −atan2(fix.y − src.z, fix.x − src.x)` with `src.z` holding the anchor's
*model* y, and a rotation of −β about scene-y maps the unit +x segment to
`(cos β, 0, sin β)` = model `(cos β, sin β)`. `tests/uwb/scene.test.ts` transforms the ray's
endpoint through `matrixWorld` and asserts it lands on the fix to 9 places, so a sign flip cannot
pass silently. The ellipse's `rotation.y = −thetaRad` takes the same sign, as the comment says.

**Draw order and `aoa: false`.** The phase draw sits in `onRx` immediately after the receive
timestamp's `gaussian` and the CFO residual's `gaussian`, behind
`this.cfg.aoa && role === 'anchor' && r.plan.mode === 'twr' && from === r.tagId`, so with `aoa`
off there is no draw at all and no branch that reorders one. Pinned twice: the network test
asserts the tag's whole stamp stream is identical with AoA on and off and that the anchor's
streams agree up to its first phase draw and diverge after, and the lesson hashes cover the rest.

**`aoaSigmaDeg` is fed θ̂, never the truth** — in `emitAoaFix` (`sigmaAcrossM = horizM ·
aoaSigmaDeg(thetaDeg)`, `thetaDeg = r.aoaThetaDeg`) and in `uwbAoaRows` (`aoaSigmaDeg(a.thetaDeg)`).
The slant-range test pins `ellipse.a === horizM · aoaSigmaDeg(θ̂)` to 9 places, which would fail
if the truth were substituted.

**The controller's rh ruling is applied in all three places** — the fix, the cross-range axis and
(derived, since the fix is placed at rh along the bearing) the overlay's line length. `rh =
√(max(0, r² − Δz²))` guards the negative root. `ellipse.a = max(σ_r, rh·σ_θ)`, `b = min(…)`,
`thetaRad` turned +π/2 exactly when the cross-range axis is major. `gdop: 1`, `of: tag`,
`anchors: [anchor]`, `method: 'aoa'` all as ruled.

**Single-anchor fix only when the anchor holds a range.** `emitAoaFix` is reached only from
`reportRange`'s `else if (this.cfg.aoa)` branch. Of the three `reportRange` call sites, the two
tag-side ones (`onResponse` SS, `onReport` DS) are excluded by the `role === 'tag'` arm, leaving
`onFinal` — anchor, DS, `from === r.tagId` — as the only anchor path, so the bearing in
`r.aoaThetaDeg` and the range always belong to the same peer. SS anchors emit bearings and no
fix, as ruled.

**Records, view, log, inspector, overlay, editor.** `UWB_AOA` added to the union, to
`fmtRecord`'s dispatch and to `fmtUwbRecord` in the brief's exact wording; the bearing lands on
the *anchor's* lane (`vs.nodes[r.node]`) while the fix routes to the tag through `subject`/`of`;
`UwbPositionView.anchors` added (accepted deviation) and the three existing expectations updated;
`yawDeg` field on anchors and the AoA checkbox (disabled outside TWR, with a hint) in the editor;
EN and ZH strings complete for every new key, including the rh caveat in `ellipseHintAoa`.

**Test coverage** matches the brief item for item: closed forms (λ, d, φ at 0/±30/90°, channel
independence, the inverse, the ±π clamp, `trueAzimuthDeg` with yaw and wrapping, σ_θ at five
angles plus the clamp, the mirror both ways), the DS scene at 45°/4 m with both of block 0's
bearings pinned and all inside 4 σ_θ, the fix's fields, the along/across error split, the ellipse
axes and quarter turn, lane routing, a 1.2 m height difference, AoA off, the overlay line
(start/end/length/colour/fade/removal), the inspector rows and the editor round trip.

## Findings

1. **Low (quality) — two adjacent comments in `src/uwb/device.ts` now contradict each other on
   which draw is last.** The new block calls the phase draw "the third and last draw of a
   reception", but ~35 lines below, `drawContentionSlot` is still introduced with "The contention
   draw comes last, after this reception's timestamp-noise and carrier-offset draws above" — and
   in an SS contention round with `aoa: true` the contention draw does come after the phase draw.
   No behavioural consequence (the byte-identity argument only needs "no draw when `aoa` is off",
   which holds), but one of the two sentences should be qualified.

2. **Low (spec/test) — the mirror test never pins the reflection itself.** `tests/uwb/network.test.ts`
   asserts `|θ̂ − 45| < 4σ_θ`, that the anchor-to-fix distance is still ≈ 4 m, and that the fix is
   more than 5 m from the tag. That is consistent with the mirror but does not assert it: any
   bearing error of roughly the right size would also pass the 5 m bound. The report itself gives
   the exact number to pin — fix (2.152, 7.850) against the tag's mirror image (2.172, 7.828) —
   so one `toBeCloseTo` pair on the reflected coordinates would turn an implication into an
   assertion.

3. **Low (docs) — "reflection in the boresight" is the wrong mirror line.** The report (and the
   test comment) describe the front/back ambiguity as the tag's "exact reflection in the
   boresight". A reflection *in the boresight* would send 135° to −135°; what `sin(180° − θ) =
   sin θ` produces is the reflection across the array baseline (the line through the anchor
   perpendicular to boresight), which sends 135° to +45° — and that is what the numbers show
   (anchor (5, 5) facing +y, tag (2.172, 2.172), fix (2.152, 7.850): mirrored in `y = 5`).
   `src/uwb/aoa.ts`'s own module header gets it right ("its mirror image in front of it"); only
   the prose around it is loose.

4. **Low (cosmetic) — `uwbAoaRows` can print a signed negative zero.** `deg(44.9876 − 45)` renders
   `-0.0°`, and `tests/uwb/inspector-rows.test.ts` pins that string. Harmless, and the range table's
   `cm` formatter has the same property today, so this is a note rather than a change request.

5. **Info — `aoa: true` is schema-legal in a one-way mode and silently inert** (report deviation 7).
   The engine guards on `r.plan.mode === 'twr'` and the editor disables the checkbox, so nothing
   misbehaves; but a hand-edited or imported plan can carry a flag that does nothing and says
   nothing. If a later slice touches `uwbSessionIssue`, a note there would close the gap. Not a
   blocker — the spec does not require the schema to reject the pair.

6. **Info — `fix.anchors[0]` is indexed unchecked in `src/uwb/scene.ts`.** An `aoa` fix with an
   empty `anchors` array would reach `physicalId(undefined)`. It cannot happen today (the only
   emitter writes `[this.id]`) and the `if (!src) continue` guard covers an unknown id, so this is
   recorded only as a latent assumption the overlay makes about the record.

No finding blocks the task. Items 1–3 are worth a follow-up commit if the lesson task in this plan
touches the same files anyway.
