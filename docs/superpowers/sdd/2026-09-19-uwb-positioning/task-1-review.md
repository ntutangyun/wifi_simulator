# Task 1 review — Scene overlay: range rings, estimate and error ellipse

Reviewed: `265ed91..3aad62a` (`39b7385` feat + `3aad62a` the 10× ellipse ruling), against
`task-1-brief.md`, `task-1-report.md` and `task-1-review.diff`.
Files: `src/uwb/scene.ts` (new), `src/scene/viewport.tsx`, `src/uwb/view.ts`,
`tests/uwb/scene.test.ts` (new), `tests/uwb/inspector-rows.test.ts`.

## Verdict

Spec: APPROVED
Quality: APPROVED

## Gates

- `npx vitest run tests/uwb/scene.test.ts tests/uwb/inspector-rows.test.ts tests/engine/lesson-hashes.test.ts`
  → **3 files / 17 tests, all green** (scene 8, inspector-rows 8, lesson-hashes 1).
- `npx tsc -b` → two errors, both in `src/ui/i18n.ts` (271, 626: `anchor`/`uwbTag` missing from a
  toolbar string block). **Not Task 1's**: `src/ui/i18n.ts` is uncommitted (` M`) and belongs to the
  concurrent Task 2 editor work; neither Task 1 commit touches it. No error in `src/uwb/scene.ts`,
  `src/scene/viewport.tsx`, `src/uwb/view.ts` or either test file.
- Hash fixture: `git diff 265ed91..3aad62a -- tests/engine/` is empty — `tests/engine/lesson-hashes.test.ts`
  was not touched, and it passes. Correct: the overlay emits no records.
- No `any`, no `@ts-ignore`, no `as unknown as` in either new file (grep clean). The only casts are the
  `material as THREE.LineBasicMaterial` narrowings `src/scene/effects.ts` already uses.

## Binding constraints — checked one by one

| Constraint | Result |
|---|---|
| `UwbOverlay { group, update(vs), dispose() }` | met (`src/uwb/scene.ts:67-160`), `group.name = 'uwb-overlay'` |
| one ring per (tag, anchor) with a range | met; lanes filtered to `uwb.role === 'tag'`, so an anchor's own `ranges` never doubles the rings |
| radius = `distM` | met, via `scale.x`/`scale.z` on a unit circle (`:123`) |
| centred on the anchor's (x, y), `three.y = 0.01` | met (`:122`, `FLOOR_Y = 0.01`), axis swap `z = pos.y` correct |
| colour `0xfbbf24` | met (`UWB_RING_COLOR`) |
| opacity `0.45 × max(0, 1 − age/blockNs)` | met (`:116-117`) — see finding 1 for the un-clamped upper end |
| rings older than one block not drawn | met (`:115`), and the fade reaches exactly 0 at the same instant the next block's range lands (see below) |
| cross + 1-σ ellipse at `ELLIPSE_DRAW_SCALE = 10`, hidden when `position` is null | met (`:129-146`), pinned by tests 5 and 6 |
| objects reused by key, disposed on removal | met (`ensure` `:94-103`, sweep `:149-154`, `dispose` `:156-160`) |
| viewport: build only for UWB scenarios, update per frame, dispose on cleanup | met (`src/scene/viewport.tsx`, the three added hunks) |
| `UwbRangeView.block` from `UWB_RANGE.block` | met (`src/uwb/view.ts:19-20, 76-78`) |
| tests as the brief lists | met, plus the two extra the report names (stale-block drop, object reuse) |

## The four risks the review was pointed at — all clean

1. **Ellipse rotation plane and direction.** Correct. `src/uwb/position.ts:159` gives
   `thetaRad = 0.5·atan2(2σxy, σxx − σyy)`, the major-eigenvector angle measured from +x toward +y in
   the model plane, and `a = √λ₁` is the matching (major) semi-axis. The overlay scales the unit
   circle to `(a·S, 1, b·S)` — major along local x — and sets `rotation.y = −θ`. three.js's
   `makeRotationY(φ)` sends `(1,0,0) → (cos φ, 0, −sin φ)`, so `φ = −θ` sends the major end to
   `(a cos θ, 0, a sin θ)`, i.e. model `(a cos θ, a sin θ)`. That is the requested anticlockwise turn
   under `three.z = pos.y`. The circle's own parameterisation `(cos a, 0, sin a)` runs the same way,
   so the ellipse is not mirrored either. three composes `T·R·S`, so the non-uniform scale is applied
   in the local frame before the rotation — the right order.
2. **Geometry/material churn.** No leak and no per-frame allocation of GPU resources:
   `circleGeometry()`/`crossGeometry()` are only ever called inside the `make()` thunk of `ensure`
   (`:94-103`), which runs once per key. Steady-state `update` writes only `position`, `scale`,
   `rotation.y` and `material.opacity`. Removal disposes geometry **and** material (`:63-66`), and so
   does `dispose()`. Test 8 pins object *and* geometry identity across updates.
3. **A tag holding only a previous block's range.** Correct, and pleasingly so. With
   `roundEnd(B, k) = B·blockNs + (k+1)·roundNs` and a tag's round index constant across blocks
   ("tag k owns round k of every block", `src/uwb/network.ts:12`), `roundEnd(B−1, k) + blockNs =
   roundEnd(B, k)` exactly — so a one-block-old ring reaches opacity 0 at precisely the instant its
   replacement lands, with no flicker and no double-drawn ring. A range missed for two blocks is then
   dropped by `:115` when it is already invisible. Using the range's own `block` with the tag's
   current `round` (the controller ruling) is sound *because* the round index is invariant; had rounds
   been reassigned per block it would not be, which is worth a sentence in the module doc one day.
4. **`structuredClone` in the tests hiding a stale-object bug.** It does not. `cloneView` is
   `structuredClone` (`src/model/view.ts:293-295`), so each `at(view, t)` hands `update` a fresh deep
   copy — but the overlay retains nothing from `vs`: it copies scalars into three.js objects and keys
   everything by string. There is no reference it could hold stale, and it never mutates `vs`, so the
   clone changes nothing relative to production, where the viewport passes the live mutated `view`.
   Node positions are read from the `Scenario` in the constructor rather than the view, which is safe
   because `ViewState` carries no node position at all (nodes cannot move).

## Findings

All minor; none blocking.

1. **Minor — `src/uwb/scene.ts:116-117`: ring opacity has no upper clamp, so it can exceed the stated
   0.45 maximum.** `age` is measured to the *end* of the round, but a `UWB_RANGE` record is emitted at
   its report slot, i.e. before the round ends — so between the range landing and `roundEndNs`, `age`
   is negative and `opacity = 0.45·(1 − age) > 0.45`. In the DS lesson (20 ms round, 200 ms block) the
   overshoot is ≤ 10 % and invisible; in a scenario whose block holds one round (`roundNs ≈ blockNs`,
   which the schema permits) a fresh ring would draw at up to ~0.9 — twice the intended strength, and
   visually indistinguishable from the opaque fix cross. Write
   `RING_MAX_OPACITY * Math.max(0, Math.min(1, 1 - age))`. (Note the brief's formula has the same hole,
   so this is not a deviation — it is the formula that wants tightening.)

2. **Minor — `src/uwb/scene.ts:129-146`: the fix cross and the ellipse never age, while their rings
   do.** `u.position` is only ever overwritten, never cleared (`src/uwb/view.ts:87-96`), so a tag whose
   rounds start timing out keeps a full-strength cross and a crisp 1-σ ellipse on the floor
   indefinitely — after the rings that produced them have faded to nothing. That is the project's
   recurring failure mode (drawn state outliving simulated state), and the scene then asserts a
   confidence the engine no longer has. Spec-conformant as written (the brief only asks for hiding on
   `position === null`), so not blocking, but worth a follow-up: `UWB_POSITION` already carries `block`
   (`src/uwb/records.ts:18`), so adding `block` to `UwbPositionView` the same way `UwbRangeView` just
   gained it would let the cross and ellipse fade on exactly the ring rule, for a few lines. Raise it
   with the controller rather than fixing it inside Task 1.

3. **Minor — `src/uwb/scene.ts:118, 134, 143`: the `objects` map keys share a namespace with the peer
   ids.** Rings are keyed `` `${tag}:${peer}` `` while the fix and ellipse are keyed `` `${tag}:fix` ``
   and `` `${tag}:ellipse` ``, so an anchor whose node id is literally `fix` or `ellipse` would collide
   and one object would silently replace the other. The object *names* already carry the `ring:` /
   `fix:` / `ellipse:` prefixes that make this unambiguous — key by the name (`ensure(name, …)`) and the
   class of bug disappears.

4. **Minor — `src/uwb/scene.ts:113 vs 118`: the tag id goes through `physicalId()`, the peer id does
   not.** The report's reasoning for `physicalId(vid)` ("so the names can never grow a lane suffix")
   applies equally to `peer`, which is used raw in both the key and the object name. Harmless today —
   UWB never runs MLO — but the two halves of the same identifier should be normalised the same way, or
   neither should be.

5. **Minor — `src/uwb/scene.ts:83`: `sc.uwb ?? DEFAULT_UWB_SESSION` substitutes timings rather than
   flagging their absence.** The engine only builds a `UwbNetwork` when `sc.uwb` is set
   (`src/engine/simulation.ts:268-271`), so a scenario with UWB nodes and no session produces no ranges
   and the fallback is unreachable in practice — but if that ever changes, the overlay would age rings
   against a 240 000-RSTU block the engine is not using, and the only symptom would be wrong fade
   rates. Either take the session as a required constructor argument, or keep the `??` and add a one-line
   comment saying why it can only ever be dead code.

*Nit, no action:* `viewport.tsx` cleanup calls `uwb?.dispose()`, which empties the group but leaves the
now-childless group parented to `scene`. That matches the layer's existing practice (the house, the node
meshes and `EffectsLayer` are not detached either, and the whole scene goes out of scope with the
effect), so it is consistent rather than wrong.

## Report accuracy

The report's account matches the code, including the two honest deviation notes (round end taken from
the range's own block; `tests/uwb/inspector-rows.test.ts` touched only to add the new required field).
Its "3×" text is superseded by its own follow-up section and by `3aad62a`; the code, the doc comment and
test 5 all agree on 10. Task 3's guide must quote 10×, as both the report and the constant's doc comment
say.

## Re-review (fix round 1)

Scope: `3aad62a..2a24bae` (`fix(scene): ring opacity clamp, the fix ages with its block, distinct
overlay keys`), package `task-1-fix1.diff`, plus the "Fix round 1" section of `task-1-report.md`.
Five files, all Task 1's own: `src/uwb/scene.ts`, `src/uwb/view.ts`, `tests/uwb/scene.test.ts`,
`tests/uwb/inspector-rows.test.ts`, `tests/uwb/view.test.ts`. Task 2's dirty files
(`src/editor/*`, `src/ui/*`, `src/uwb/ui/*`, `tests/editor/*`) are untouched by the commit — checked
against `git diff --stat`.

### Verdict

Spec: APPROVED
Quality: APPROVED

### Gates

- `npx vitest run tests/uwb tests/engine/lesson-hashes.test.ts` → **11 files / 95 tests, all green**
  (`tests/uwb/scene.test.ts` 8 → 12).
- `npx tsc -b` → **clean**, no output. The two `src/ui/i18n.ts` errors the first review attributed to
  the concurrent Task 2 work have gone, as the report says — so the `block` field added to
  `UwbPositionView` has no unfixed literal anywhere in the tree.
- `tests/engine/lesson-hashes.test.ts` green, fixture still untouched (`git diff 3aad62a..2a24bae`
  touches no file under `tests/engine/`).

### The five rulings, one by one

1. **Opacity clamp — done, and better than asked.** `fade()` (`src/uwb/scene.ts`) returns
   `Math.max(0, Math.min(1, 1 - age))` and is the single source of ageing for the ring, the cross and
   the ellipse, each scaled by its own `*_MAX_OPACITY`. Nothing can now draw stronger than its stated
   maximum, in any block/round ratio. The new test reads the ring a full round *before* its round end —
   the exact negative-age window finding 1 named — and pins 0.45.
2. **`UwbPositionView.block` — done, and the fix now ages on the ring rule.** Set from
   `UWB_POSITION.block` in the reducer (`src/uwb/view.ts`), which the record already carried
   (`src/uwb/records.ts:18`); cross and ellipse fade from `roundEnd(fix.block, u.round)` and are dropped
   at `fix.block < u.block - 1` — the same predicate and the same round index as the rings, so the two
   cannot drift apart. `initUwbNodeView` correctly needed no change (a lane starts `position: null`).
   The new tests pin the 1.0/0.8 → 0.5/0.4 → 0/0 curve and, crucially, both directions of the
   independence: a stale ring set with a current fix, and a stale fix with current rings.
3. **Distinct key prefixes — done.** The map is keyed by each object's own name, and `ensure` lost its
   redundant key argument, so key and name can no longer diverge. The collision class is gone by
   construction rather than by convention.
4. **`physicalId()` on the peer id — done.** `const peer = physicalId(id)` feeds both the position
   lookup and the key/name, matching the tag id's treatment.
5. **Session fallback replaced by a throw — done, and the comment's claim checks out.** I verified the
   schema really does enforce it: `src/model/scenario.ts:402-405` raises "a scenario with UWB nodes
   needs a UWB session (scenario.uwb)". So for any parsed scenario the throw is unreachable, and a
   wrong fade rate can no longer be substituted silently. See finding 6 for the one caveat.

### Nothing regressed

Re-checked the four properties the first review verified, against the new code: the ellipse rotation
(`rotation.y = -thetaRad`) and its scale/rotation order are untouched; geometry and material are still
created once per key inside `ensure`'s `make()` thunk and disposed on sweep and on `dispose()` — the
fade now writes one extra `material.opacity` per frame and allocates nothing; the previous-block
continuity argument still holds unchanged for rings and now holds identically for the fix; and the
tests' `structuredClone` still hides nothing, since the overlay retains no reference into the view.
The `transparent: true` added to the cross material is correct for a fading line (it moves the cross
into the transparent render queue, which is where the rings and ellipse already are).

### Remaining findings

Findings 1–5 of the first review are all resolved. One new minor, from ruling 5:

6. **Minor — `src/scene/viewport.tsx` (unchanged by this commit): the overlay's new throw is reachable
   from a render effect.** The build gate is still `sc.nodes.some((n) => n.kind === 'uwb')`, which does
   not also test `sc.uwb`, so a scenario holding a UWB node without a session now throws *inside the
   `useEffect`* instead of simply drawing nothing. There is no error boundary in the tree
   (`grep -rn "ErrorBoundary\|componentDidCatch" src/` is empty), so that would take the whole 3-D view
   down, not just the overlay. `ScenarioSchema.parse` guards every load path (`src/ui/store.ts:58`,
   `src/editor/planOps.ts:308`), so it is unreachable today — but Task 2 is adding interactive UWB node
   creation to the editor, and an in-memory scenario between "anchor dropped" and "session added" is
   exactly the intermediate state that would hit it. Making the gate
   `sc.uwb && sc.nodes.some((n) => n.kind === 'uwb')` keeps the throw as the contract for a
   mis-constructed overlay while degrading the half-built-scenario case to "no overlay yet". Worth
   raising with the controller as a Task 1/Task 2 seam rather than fixing blind here.

*Nit, unchanged from the first review:* `uwb?.dispose()` leaves the emptied group parented to `scene`,
consistent with every other layer.

