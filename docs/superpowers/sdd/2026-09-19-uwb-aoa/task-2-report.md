# Task 2 — lesson "One anchor is enough" (`uwb-aoa`, module 14)

Branch `feat/uwb-ranging`, worktree `.claude/worktrees/feat-link-2g`, commit **32c5df4**.

## The scene

`oneRoom()` (10 × 8 m, "Lab"). One anchor `anc-1` at (5.00, 0.50, 2.20) with `yawDeg: 90` — facing
+y, into the room — and one tag `badge-1` at z 1.00. DS-TWR, `aoa: true`, channel 9, `nlos: false`,
both crystals drawn. Seven blocks over 1.3 s: one round per block, two bearings per round (the Poll
and the Final), one single-anchor fix per round.

The badge's spots are built as **x = 5 + r·sin θ, y = 0.5 + r·cos θ**, i.e. laid out to the anchor's
*right*. The engine's azimuth is counter-clockwise-positive, so the records come back at
−45.000° / −60.000° and the prose says "45° to its right". `SPOTS` and `tagXY()` are exported and the
test recomputes `trueAzimuthDeg` from the scenario, so a coordinate that drifts fails rather than
quietly contradicting the table.

| Variant | Where | True bearing |
|---|---|---|
| base | (5.000, 2.500), boresight 2 m | 0.0° |
| `45° at 4 m` / `4 m 处 45°` | (7.828, 3.328) | −45.0° |
| `60° at 5 m` / `5 m 处 60°` | (9.330, 3.000) | −60.0° |
| `Behind the anchor` / `锚点背后` | badge unmoved at (5.000, 2.500), anchor `yawDeg: −90` | 180.0° |

**Deviation, controller-sanctioned in spirit:** the "behind" variant uses `yawDeg: −90`, not 270 —
the schema is `.min(-180).max(180)` and 270 is rejected. −90 is the same facing; the test pins the
rejection of 270 so the reason stays on the record.

The 60° variant is at **5 m**, not 6: 6 m at 60° lands at x = 10.196, outside the 10 m room (the
controller's ruling).

## Measured and pinned

All from the lesson's own scenarios, seven rounds each.

| Spot | σ_θ | cross-range 1-σ (rh·σ_θ) | anchor range error | fix error | first ellipse |
|---|---|---|---|---|---|
| boresight 2 m | 2.74° | 9.5 cm | 2.0 cm | 2.1–15.6 cm, mean 9.6 | 9.4 × 2.1 cm |
| 45° at 4 m | 3.87° | 27.0 cm | 2.0 cm | 5.8–44.5 cm, mean 26.5 | 25.7 × 2.1 cm |
| 60° at 5 m | 5.47° | 47.7 cm | 2.0 cm | 10.4–87.7 cm, mean 48.2 | 43.1 × 2.1 cm |

- λ(9) = 3.75 cm, d = **1.88 cm** (the brief said 1.87; `antennaSpacingM(9)·100 = 1.8767`, which is
  1.88 at two places, and the test pins `toFixed(2)`). λ(5) = 4.62 cm, d = 2.31 cm. φ and θ̂ are
  identical on both channels, which the test proves rather than asserts.
- φ at 45° = 2.221 rad, at 60° = 2.721 rad; σ_φ = 0.15 rad ≈ 8.6°; the clamp returns exactly ±90°.
- σ_r = 2.12 cm; every ellipse's minor axis *is* `rangeSigmaM(100)` to twelve places, and the major
  axis is a quarter turn from the anchor→fix bearing at all 21 fixes.
- **The error has a direction.** Each fix is decomposed along and across the true ray: the across
  component equals the fix error to within a millimetre at every spot, and the along component of
  all twenty-one fixes stays inside **9 cm** — under 4 σ_r.
  *(The brief's draft said 8 cm; the measured worst is 8.02 cm, so the prose says 9 and the test
  pins 0.09 and 4 σ_r. This is the one number that moved from the brief.)*
- Slant vs plan at the 45° spot: **4.176 m vs 4.000 m**, a 17.6 cm bias (8.3 σ_r) the horizontal-leg
  correction removes. Pinned two ways: every fix sits at √(r² − Δz²) from the anchor, and lifting the
  badge to the anchor's own height (where the two agree) moves no fix by more than a millimetre.
- **Behind the anchor:** the fourteen bearings equal the base scene's to twelve decimal places (only
  the 4e-16 rad that `sin(180°)` leaves behind separates them), the range is right to 2.0 cm, the
  clamp never fires, and the seven fixes are **396.7–403.0 cm out, mean 400.2 = 2 × rh**, at
  (5.06, −1.47) and outside the room. The across-boresight component is the base run's with its sign
  turned over — the reflection, pinned as such.
- Editor spot in try-this 2: (8.94, 1.19) is 80° off at 4 m; σ_θ 15.75°, **six of the fourteen**
  bearings pinned at the −90.0° clamp, worst ellipse 3.16 m.
- Log lines pinned verbatim: `anc-1 AoA ← badge-1: 2.3° (true 0.0°)` at 197 636 ns,
  `anc-1 range → badge-1 (DS): 2.30 m (true 2.33 m)` and
  `anc-1 position of badge-1 (4.94, 2.47) m, true (5.00, 2.50), error 0.07 m, GDOP 1.00, 1 anchors (AoA)`
  at 4 193 534 ns. Inspector rows pinned whole (anchor's range row and bearing row, badge's fix row
  in EN and ZH).

## Shape

4 observe, 2 tryThis, 3 quiz, 5 jumps (Poll → bearing → Final → range → fix, ascending in the run).
**1 663 English words → `lessonMinutes` 25**, against the 1 724 ceiling; the study-time test pins
both. GDOP is mentioned once, to say it is 1.00 by construction and has nothing to say; every
comparison in the lesson is between error ellipses.

New kit predicates: `firstUwbAoa` (`UWB_AOA`) and `firstUwbAoaFix` (`UWB_POSITION` with
`method === 'aoa'`).

## Seams touched

- `tests/course/uwb-coexist.test.ts`: `for (const id of after.slice(4)) … not.toContain` →
  `for (const id of after) … toContain` (one line + its comment).
- `tests/course/uwb-ul-tdoa.test.ts`: `expect(ids).not.toContain('uwb-aoa')` →
  `expect(ids[ids.indexOf('uwb-ul-tdoa') + 1]).toBe('uwb-aoa')` (one line + its comment).

## Verification

`npx tsc -b` clean, `npx vite build` clean, `npx vitest run` **108 files / 1431 tests green**
(including the other agent's in-flight Guide/glossary/editor tests). Hash fixture diff is four
additions and nothing else:

```
+  "uwb-aoa": "cb72f093",
+  "uwb-aoa#0": "c58087b8",
+  "uwb-aoa#1": "9b7d8c94",
+  "uwb-aoa#2": "cb72f093",
```

(`#2` shares the base hash because the timeline is `t:seq:type` and the "behind" variant changes only
positions and yaw — no record moves.)

No `any`, `@ts-ignore` or `as unknown as` anywhere in the new files.

## Worth knowing

1. **The lesson is 1 663 words, 61 under the ceiling.** It reads at 25 minutes as required, but the
   next editor has less headroom than usual; the caution block in the module header says so.
2. **`nlos` is set false but changes nothing here** — the line of sight is clean, and an `nlos: true`
   run is bit-identical. It is set for explicitness, not for effect. Not claimed in the prose.
3. **`aoa: false` is *not* byte-identical on this scene.** The anchor's phase draw is last in the
   reception, so turning AoA off shifts its later timestamp draws. The lesson never claims
   otherwise; the byte-identity claim in task 1 was about the *tag's* stamps.

---

# Fix round 1

Commit **5139da3**, on top of `32c5df4`. Only `src/course/uwb/uwb-aoa.ts` and
`tests/course/uwb-aoa.test.ts` touched; the fixture was not regenerated.

## Finding 1 (required) — the 1-σ sentence

Try-this 1 said "the row's 1-σ grows 2.7° → 4.3° → 7.5°". `uwbAoaRows` evaluates
`aoaSigmaDeg` at the **last measured** bearing, and the last draw of each run is 1.4–1.6 σ out, so
that trio overstated the model's growth by 37 % at the 60° spot and contradicted the lesson's own
table and quiz 1 (2.74° / 3.87° / 5.47°) about the same three places. Now:

> The inspector's 1-σ is σ_θ at the bearing that row happened to measure last, so it moves with
> every draw: here it reads ± 2.7°, ± 4.3° and ± 7.5° where the model's σ_θ at the three spots is
> 2.74°, 3.87° and 5.47°.

ZH rewritten in step. Observe 3's gloss — where the reader first meets the row — was rewritten to
match ("it is σ_θ at the bearing that row last measured") rather than the vaguer "it belongs to the
angle it was measured at", which only reads correctly in the base scene where the two coincide.

New pins: the row string is `± aoaSigmaDeg(last bearing).toFixed(1)°` at each spot, the last
bearing is *not* the truth at any of them, `aoaSigmaDeg` at the three true azimuths is
2.74 / 3.87 / 5.47, and both the EN and ZH sentences carry the model's trio.

## Minors

2. **Clamp.** "The model clamps it at 45°" → "The model clamps σ_θ itself at 45°, which it reaches
   at about ±86.5° off boresight and past which the linearisation describes nothing." The
   crossover is computed in the test (`acos(σ_φ/(π·45°rad))` = 86.514° → "86.5"), bracketed at
   86.4°/86.6°, and 60° and the 80° spot are both shown to be below it — so the sentence can no
   longer be read as clamping badges past 45° off boresight.
3. **Semi-axis.** "the worst ellipse is 3.16 m long" → "the worst ellipse's **semi-major axis** is
   3.16 m". *Deviation from the review's literal suggestion ("major axis"), one word:* `ellipse.a`
   is the semi-axis — the body says "The ellipse's semi-axes are those two measurements" and the
   inspector prints "9.4 × 2.1 cm" — so "major axis" would be wrong by a factor of two against the
   lesson's own convention. The finding (the convention was dropped) is fixed either way; the test
   pins the new wording and the body's semi-axes sentence together.
4. **Plan vs slant in the mirror section.** "unmoved, still 2.00 m away" → "…on the floor"; "same
   spot, same 2.00 m" → "…on the floor". Pinned: the badge is 2.00 m from the anchor in plan and
   2.33 m in slant, which is the number observe 1–2 print for it.
5. **Report only.** The earlier report's "GDOP is mentioned once" was wrong — the English prose
   names it three times: once in the body (to say it is 1.00 by construction and has nothing to say)
   and twice inside quoted UI (observe 2's log line, observe 4's inspector row). The binding
   constraint holds: no comparison in the lesson uses GDOP. Corrected here.
6. **Not done, out of scope.** `src/uwb/aoa.ts`'s docstring still says "2.73° at boresight" where
   `aoaSigmaDeg(0)` = 2.73536° (→ "2.74" at two places). The review marks it informational and it
   is not one of this task's two files; it wants one word in a later commit so the corpus does not
   carry both roundings.

## Budget

The required rewrite is +49 English words against 61 of headroom, so six low-value sentences were
trimmed to keep room for future edits: quiz 1's "the link budget is the same and the antennas do not
move", quiz 3's "and why the field exists at all", observe 2's "One anchor, and the line says so.",
observe 4's repeated "the cross", "rather than anything iterative" in the body, and "hand back" →
"report" in body[0]. **1 678 words, `lessonMinutes` 25** (was 1 663). No pinned sentence was
touched by the trims.

## Verification

`npx tsc -b` clean. `npx vitest run tests/course/uwb-aoa.test.ts` → **27/27**. Wider, because prose
moved: `npx vitest run tests/course tests/engine/lesson-hashes.test.ts` → 26 files, **642/642**, so
the fixture still matches without regeneration. Working tree shows only the two intended files.
