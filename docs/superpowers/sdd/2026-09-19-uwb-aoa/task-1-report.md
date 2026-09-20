# Task 1 — angle of arrival: model, engine, view, overlay, editor

Branch `feat/uwb-ranging`, worktree `.claude/worktrees/feat-link-2g`.

## What was built

**`src/uwb/aoa.ts` (new, pure)** — the PDoA model, no state and no randomness:

- `AOA_SIGMA_PHI_RAD = 0.15` (model: 1-σ of a phase-difference measurement, ≈ 8.6° of phase).
- `wavelengthM(ch)` = c/f → 0.0375341 m (ch 9), 0.0461958 m (ch 5); `antennaSpacingM` = λ/2.
- `trueAzimuthDeg(from, yawDeg, to)` — horizontal azimuth off the anchor's boresight, wrapped to (−180, 180], positive counter-clockwise (to the anchor's left).
- `pdoaRad(θ, ch)` = 2π·(d/λ)·sin θ, which at d = λ/2 is π·sin θ — the whole ±90° field of view over exactly one turn of phase, nothing wraps, and identical on both channels because the spacing is defined in wavelengths.
- `azimuthFromPdoaDeg(φ, ch)` — the arc sine, argument clamped to ±1 so a noisy φ past ±π reads as the edge of the field of view rather than producing nothing.
- `aoaSigmaDeg(θ)` = σ_φ/(π·cos θ) in degrees: **2.736° at boresight**, 3.159° at 30°, 3.869° at 45°, 5.471° at 60°, 15.754° at 80°, clamped at `AOA_SIGMA_CLAMP_DEG = 45` where the linearisation has stopped describing anything.

**The mirror is in the physics, not in a branch.** sin(180° − θ) = sin θ, so a tag behind the anchor produces the phase of its reflection in front and the inverse reports that reflection. Documented in the module header, in the `UWB_AOA` record and in both languages' editor/inspector hints.

**Config** — `UwbNodeCfg.yawDeg?: number` (anchors; absent = 0; schema −180…180) and `UwbSessionCfg.aoa: boolean` (`DEFAULT_UWB_SESSION.aoa = false`, schema `.default(false)` so files saved before the slice read as off).

**Anchor behaviour (`src/uwb/device.ts`)** — in a `twr` round with `session.aoa`, on **every frame the anchor receives from the round's tag** (the Poll in SS; the Poll and the Final in DS):

1. the draw order inside a reception is **timestamp noise → CFO residual → phase noise**, the phase draw last on purpose, so `aoa: false` consumes exactly the stream it always did;
2. `φ = pdoaRad(trueθ) + gaussian·σ_φ`, `θ̂ = azimuthFromPdoaDeg(φ)`, emit `UWB_AOA { node: anchor, peer: tag, thetaDeg, trueThetaDeg, block, round }`;
3. when the anchor also finishes this round's range to the tag (DS only, in `reportRange` after the Final — an SS round ends at the tag and the anchor computes no range), emit `UWB_POSITION { node: anchor, method: 'aoa', of: tag, anchors: [anchor], gdop: 1 }` at `(ax + rh·cos(yaw + θ̂), ay + rh·sin(yaw + θ̂))` with `ellipse.a = max(σ_r, rh·σ_θ)`, `b = min(…)`, `thetaRad` = the bearing, turned +π/2 when the cross-range axis is the major one (it always is beyond a few centimetres).

`rh = √(max(0, r² − Δz²))`, `Δz = anchor.z − tag.z`: the bearing is horizontal and the range is a slant distance, so what is walked out along the bearing is the horizontal leg of that triangle, taken against the height the tag is *configured* at — the same assumption `solvePosition` makes for a 2-D fix. The overlay's bearing line needs no record field for it: the fix was placed at `rh` along the bearing, so the anchor-to-fix distance already is `rh`.

The fix's range is taken from the round's last bearing, i.e. the Final's — the one measured closest to the range it is paired with.

**Records / view / log / inspector / overlay / editor** — `UWB_AOA` in `UwbRecord` and in `src/ui/format.ts`'s dispatch; `fmtUwbRecord` prints `anc-1 AoA ← tag-1: 45.0° (true 45.0°)`; `UwbNodeView.aoa: Record<peer, {thetaDeg, trueThetaDeg, n}>` on the **anchor's** lane (a bearing is the anchor's own measurement) while the fix routes to the tag's lane through `of`; a per-peer bearing table in the inspector (measured / true / signed error / the 1-σ at that angle / rounds) in EN and ZH; an amber bearing line `bearing:<tag>` from the anchor to the fix, ageing exactly like a ring; a `yawDeg` number field on anchors and an AoA checkbox in the session section, disabled outside two-way ranging with a hint saying why.

## Measured at the test geometry

Anchor (5, 0.5, 1) facing +y (`yawDeg: 90`), tag 4 m away at 45° off boresight → (2.1716, 3.3284, 1). Both at z = 1, so the range is horizontal and no slant bias enters. σ_θ(45°) = 3.869°, cross-range 1-σ = 0.270 m, σ_r = 0.0212 m. Seed 7, DS-TWR, NLOS off.

| block | bearing on the Poll | bearing on the Final | fix | error |
|---|---|---|---|---|
| 0 | 41.624° (−3.38°, 0.87 σ) | 44.988° (−0.01°) | (2.1516, 3.3496) | 2.9 cm |
| 1 | 47.748° (+2.75°) | 44.114° (−0.89°) | (2.1930, 3.3952) | 7.0 cm |
| 2 | 43.782° (−1.22°) | 48.063° (+3.06°) | (2.0159, 3.1809) | 21.5 cm |

Every bearing is inside 4 σ_θ (15.5°); block 0's fix error is essentially all *along* the ray (the range read 4.029 m), block 2's mostly *across* it, which is the 27 cm axis showing itself. The ellipse of block 0: a = 0.2720 m, b = 0.0212 m, θ = 3.9268 rad = bearing (2.3560) + π/2.

Behind the anchor (anchor (5, 5) facing +y, tag at 135° off boresight, i.e. (2.172, 2.172)): the bearings come back as 41.6° and 45.0° against a truth of 135°, the range is right to 2 cm, and the fix lands at (2.152, 7.850) — **5.68 m from the tag**, its exact reflection in the boresight. That is the two-element array's front/back ambiguity, not a bug.

## Tests

- `tests/uwb/aoa.test.ts` (new, 12): λ and d on both channels, φ at 0/±30/90°, channel independence, the inverse over the field of view, the ±π clamp, `trueAzimuthDeg` with yaw and wrapping, σ_θ at five angles plus the 45° clamp, the mirror both ways, and 19 cm of cross-range at 4 m.
- `tests/uwb/network.test.ts` (+6): two bearings per DS round with the first block's two pinned (41.6236488°, 44.9876414°) and all inside 4 σ_θ; the single-anchor fix (node/`of`/method/`anchors`/gdop, error split into along/across the ray, the ellipse's two axes and its quarter turn); lane routing through the view; the mirror; a 1.2 m height difference — the radio measures 4.176 m, the fix walks out 4.00 m, the along-ray error stays at centimetres and the ellipse's major axis is exactly `rh·σ_θ(θ̂)`; and AoA off — no records, and the tag's own stamps bit-identical while the anchor's part company from the reception after its first phase draw.
- `tests/uwb/view.test.ts` (+1), `tests/uwb/scene.test.ts` (+1, bearing line start/end/length/colour/fade/removal), `tests/ui/uwb-format.test.ts` (+1, plus both new records in the `fmtRecord` delegation table), `tests/uwb/inspector-rows.test.ts` (+2), `tests/editor/uwb-planOps.test.ts` (+1, `aoa`/`yawDeg` round trip, legacy session default, yaw bounds).

`npx tsc -b`, `npx vite build` and `npx vitest run` (107 files, 1400 tests) all green; `tests/engine/lesson-hashes.test.ts` untouched and passing, which is what pins byte-identity for every existing session.

## Deviations and things worth knowing

1. **The brief's "on each response received from a tag" is implemented as "on each frame received from the tag"** — the Poll in SS, the Poll and the Final in DS. Two bearings per DS round, and the view's `n` counts frames, not rounds.
2. **`UwbPositionView` gained `anchors: string[]`.** The overlay has to know *which* anchor measured the bearing to draw the ray from the right place; the record already carried the list and the view was dropping it. Three existing expectations in `tests/uwb/view.test.ts` and `tests/uwb/inspector-rows.test.ts` were updated for it (and for the new empty `aoa: {}` lane field).
3. **No `rangeM` on the record.** The fix is built as anchor + r·(cos, sin) of the bearing, so the distance from the anchor to the fix *is* r exactly; the overlay derives it and nothing had to be added to `UWB_POSITION`.
4. **An angle lane keeps its rings.** `UwbOverlay` previously drew rings only for a `twr` fix; `aoa` was added, because the ring crossed by the ray meeting at the cross is the whole picture of what one anchor measured.
5. **Slant range → horizontal range (controller ruling, second commit).** `emitAoaFix` walks out `rh = √(max(0, r² − Δz²))` rather than the slant range, for the fix, for the cross-range axis and (derived) for the overlay's line. At the lesson's mounting — anchor 2.2 m, tag 1.0 m, 4 m apart on the floor — the slant range is 4.176 m, so the uncorrected form biased every fix 17.6 cm out along the ray; the corrected one leaves an along-ray error under 4 σ_r (8.5 cm), measured at 1–3 cm. A range shorter than Δz collapses to `rh = 0` instead of taking a root of a negative number. The pinned numbers were measured with both nodes at z = 1 and are unchanged. **The range ring is still the slant range** (as every ring on this floor is), so a ceiling anchor's cross now sits a little inside its own ring — said out loud in `scene.ts` and in both languages' ellipse hint.
6. **With several anchors and AoA on, each anchor writes an `aoa` fix to the tag's lane.** They arrive during the round and the tag's own TWR fix is emitted last (at `endRound`), so a multi-anchor lane still settles on the two-way fix at the end of every round — but a reader scrubbing mid-round will see the single-anchor fixes flicker past. The slice's lesson geometry is one anchor, where the question does not arise.
7. `aoa: true` is accepted by the schema in a one-way mode and simply ignored by the engine (the anchors never receive a frame from the tag there). The editor's checkbox is disabled outside two-way ranging rather than the schema rejecting the pair.
