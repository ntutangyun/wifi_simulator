# Task 1 report — Scene overlay: range rings, estimate and error ellipse

Commit: `39b7385` — `feat(scene): UWB overlay with range rings, position fix and error ellipse`
Branch: `feat/uwb-ranging` (worktree `.claude/worktrees/feat-link-2g`), head before: `265ed91`.

## Files

- Created `src/uwb/scene.ts` — `UwbOverlay`, the colour constants and `ELLIPSE_DRAW_SCALE`.
- Created `tests/uwb/scene.test.ts` — 8 tests against the DS lesson's scenario.
- Modified `src/uwb/view.ts` — `UwbRangeView` gains `block`, set from `UWB_RANGE.block`.
- Modified `src/scene/viewport.tsx` — builds, updates and disposes the overlay.
- Modified `tests/uwb/inspector-rows.test.ts` — its hand-built `UwbNodeView` fixture needed the new
  `block` field (the only other place in the tree that constructs a `UwbRangeView` literal).

`src/uwb/records.ts` needed nothing: `UWB_RANGE` already carries `block`.

## Design

**Geometry.** Every drawing is a `THREE.Line` in the horizontal plane at `y = FLOOR_Y = 0.01`, the
same height the effects layer uses for its floor work, on the same axis convention
(`three.x = pos.x`, `three.y = pos.z` up, `three.z = pos.y`).

- Ring: a 64-point unit circle built in the XZ plane as a `LineLoop`, positioned at the anchor and
  scaled by the measured `distM` on x and z. Scaling rather than rebuilding means the geometry is
  created once per (tag, anchor) pair and never touched again as the range moves — the radius lives
  in `scale.x`/`scale.z`, which is what the test asserts.
- Fix: one `LineSegments` of four points — two 0.3 m lines crossed at the estimate — in
  `UWB_FIX_COLOR`, opaque.
- Ellipse: the same unit circle, scaled to `a·3` and `b·3` and turned by `rotation.y = -thetaRad`.
  The negative sign is the axis swap: the solver's θ turns the major axis anticlockwise in the
  model's (x, y) plane, and scene y is up, so the same turn is a negative rotation about it.

**Ageing.** `roundEndNs(block, round) = block·blockNs + (round + 1)·roundNs`, with `blockNs` and
`roundNs` taken once in the constructor from `roundPlan(sc.uwb, anchors)`. Opacity is
`0.45 · max(0, 1 − (vs.t − roundEndNs)/blockNs)`, so a ring is full strength the instant its round
ends and gone one block later. A range whose `block` is below `u.block − 1` is not drawn at all.

*Deviation worth naming:* the brief says the round end is "taken from the tag's current block"; the
implementation takes it from the **range's own** block (`r.block`), with the tag's round index. For a
current-block range the two are identical; for the one-block-old range the brief still asks to draw,
the range's own block is what makes it fade correctly instead of appearing fresh. That is also the
reason `block` was added to `UwbRangeView` at all, so I read this as the brief's intent.

**Reuse and disposal.** One `Map` keyed `tag:anchor`, `tag:fix`, `tag:ellipse` holds every live
object. `update` marks what it touched and removes, `geometry.dispose()`s and `material.dispose()`s
whatever it did not — so a lost range, a lane that stops fixing, or a stale block frees its GPU
resources on the next frame. `dispose()` does the same for everything.

Lanes are walked as `Object.entries(vs.nodes)` filtered to `uwb.role === 'tag'`; the lane id goes
through `physicalId()` so the object names can never grow a link suffix (a UWB device never runs
MLO, so today this is the identity).

**Viewport.** `const uwb = sc.nodes.some(n => n.kind === 'uwb') ? new UwbOverlay(sc) : null`, the
group added to the scene, `uwb?.update(view)` beside `effects.update(view)` in the render loop, and
`uwb?.dispose()` in the cleanup. A Wi-Fi-only scenario constructs nothing.

## Tests

`tests/uwb/scene.test.ts`, 8 tests, fixture = `uwbDstwr.scenario()` run to 25 ms (round 0 ends at
20 ms, so four ranges and one fix are in the view):

1. names the six objects: `ring:tag-1:anchor-{1..4}`, `fix:tag-1`, `ellipse:tag-1`, group named
   `uwb-overlay`.
2. each ring's radius equals `ranges[anchor].distM` to 1e-9, centred on the anchor's (x, z), just
   above the floor, `LineLoop`, 64 points, `UWB_RING_COLOR`.
3. opacity 0.45 at the round end, 0.225 half a block later, 0 one block later.
4. at 5 ms the group is empty.
5. the cross sits at the fix, spans 0.3 m each way, is `UWB_FIX_COLOR`; the ellipse is at the fix,
   scaled `a·3`/`b·3`, rotated `−θ`, `UWB_ELLIPSE_COLOR`; `ELLIPSE_DRAW_SCALE === 3`.
6. `position = null` → cross and ellipse gone, rings kept.
7. a range two blocks behind → its ring dropped.
8. objects and geometries are the same instances across updates; `dispose()` empties the group.

The only loosened tolerance is the cross's 0.3 m span, asserted to 1e-6 rather than 1e-9: a
`BufferAttribute` stores float32, so 0.3 comes back as 0.30000001192.

Gates: `npx tsc -b` clean, `npx vite build` clean, `npx vitest run` **93 files / 1007 tests, all
green** — including `tests/engine/lesson-hashes.test.ts`, whose fixture was not touched (the overlay
is a view-side drawing and emits no records).

## Verified in the browser

`npx vite --port 5186` (5176 was already taken by another process — noted rather than stolen),
driven with Playwright, then killed.

- Course → "Two round trips cancel the clock" → *Load this lesson's simulation* → play, then the
  lesson's own jump "the fix at the end of the round" (t ≈ 20 ms). Four amber rings appear, one per
  anchor, all four crossing in one place at the centre of the lab, with the amber cross sitting at
  that crossing. The rings are plainly 3.5 m in radius against the 10 × 8 m room, which matches the
  lesson's ring geometry. The 1-σ ellipse is ~6 cm across even at 3×, so it reads as a dot at this
  camera distance — that is expected, and is why Task 3's guide must quote the 3× factor.
- Before the ranges land (playhead at ~10 ms) the floor is bare, as designed.
- Console: 0 errors, 0 warnings (only React's devtools info line).
- Regression check: reloaded on the default Wi-Fi home scenario, switched to Simulate — house,
  nodes, cloud strip and association lines render as before, no overlay objects, no console errors.

## Deviations from the brief

1. Round end derived from the range's own block (see **Ageing** above).
2. One extra test file touched: `tests/uwb/inspector-rows.test.ts`, whose `UwbRangeView` literals
   would not compile without the new `block` field.
3. Dev server on port 5186 instead of 5176, which was in use by another process.
4. Two extra tests beyond the brief's list (stale-block drop; object/geometry reuse), since both
   behaviours are stated in the brief but were not in its test list.

No `any`, no `@ts-ignore`, no `as unknown as`. The `as` casts present are the ordinary three.js
material narrowings (`material as THREE.LineBasicMaterial`) the effects layer already uses.

## Follow-up

`3aad62a` — `fix(scene): draw the UWB error ellipse at 10x`: on the controller's ruling `ELLIPSE_DRAW_SCALE` goes from 3 to 10, so a 2 cm 1-σ ellipse draws at ~20 cm and reads as an ellipse rather than a dot beside a 3.5 m ring; the cross keeps its 0.3 m arms, the constant's doc comment and the test that pins the drawn semi-axes were updated with it, and the inspector still shows the true axes. Every mention of “3×” above should be read as 10×, and Task 3's guide must quote 10×. Re-verified: `npx tsc -b` and `npx vite build` clean, full `npx vitest run` 93 files / 1007 tests green.

## Fix round 1

`2a24bae` — `fix(scene): ring opacity clamp, the fix ages with its block, distinct overlay keys`,
the five review minors under the controller's rulings:

1. **Opacity clamp.** A range is recorded in its report slot, before its round ends, so its age is
   briefly negative; the fade is now `max(0, min(1, 1 - age))` in one private `fade()` helper that the
   rings, the cross and the ellipse all share, so nothing can draw stronger than its stated maximum.
2. **The fix ages like a ring.** `UwbPositionView` gains `block`, set from `UWB_POSITION.block`. The
   cross and the ellipse now fade from that block's round end (cross 1.0, ellipse 0.8, both times the
   shared fade) and are dropped once the fix is more than one block behind the tag's block — so a tag
   whose rounds time out no longer keeps an opaque cross on the floor after its rings have gone.
   `initUwbNodeView` needed no change (a lane starts with `position: null`); the two fixture literals
   in `tests/uwb/view.test.ts` and `tests/uwb/inspector-rows.test.ts` did.
3. **Distinct keys.** The object map is keyed by each object's own name — `ring:<tag>:<anchor>`,
   `fix:<tag>`, `ellipse:<tag>` — so an anchor whose id is literally `fix` cannot collide with the
   cross. `ensure(name, make)` lost its separate key argument.
4. **`physicalId(peer)`**, normalised the same way as the tag id, in both the key and the name.
5. **No session fallback.** `sc.uwb ?? DEFAULT_UWB_SESSION` is gone; the constructor throws
   `'UwbOverlay: a scenario with UWB nodes has no ranging session (scenario.uwb)'`, since substituting
   timings would only ever show up as a wrong fade rate. Pinned by a test.

Tests: `tests/uwb/scene.test.ts` grew from 8 to 12 — the 0.45 clamp read before the round end, the
cross/ellipse fade curve, a stale fix dropped while current rings stay, and the missing-session throw;
the old stale-block test now mutates the ranges' blocks rather than the tag's, so it isolates the rings.
`npx vitest run tests/uwb` → 10 files / 94 tests green; `npx tsc -b` clean (the other agent's `i18n.ts`
errors the review saw have since gone); `tests/engine/lesson-hashes.test.ts` and
`tests/course/uwb-dstwr.test.ts` re-run green (39 tests), the hash fixture untouched. Committed by
pathspec — the concurrent editor work in `src/editor/*`, `src/ui/*` and `src/uwb/ui/*` was not touched.
