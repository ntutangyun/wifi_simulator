# Task 2 review — lesson "One anchor is enough" (`uwb-aoa`, module 14)

Reviewed: `be26ffb..32c5df4` (one commit), against `task-2-brief.md`, `task-2-report.md`,
`task-2-review.diff` and the files at HEAD. Ground truth cross-checked: `src/uwb/aoa.ts`
(`pdoaRad`, `azimuthFromPdoaDeg`, `aoaSigmaDeg`, `AOA_SIGMA_PHI_RAD`, `AOA_SIGMA_CLAMP_DEG`,
`antennaSpacingM`), `src/uwb/device.ts` (`measureAoa`, `reportRange`, `emitAoaFix` — the
horizontal-leg correction and the ellipse), `src/uwb/ui/rows.ts` (`uwbAoaRows`, `uwbFixRow`),
`src/course/uwb/uwb-ul-tdoa.ts` + `tests/course/uwb-ul-tdoa.test.ts` (house style),
spec Slice 6 (`docs/superpowers/specs/2026-09-19-uwb-slices-design.md:22`) and
`.superpowers/sdd/2026-09-19-uwb-aoa/task-1-report.md`. The working tree matches HEAD for every
reviewed file; the only untracked path is `docs/superpowers/sdd/2026-09-19-uwb-aoa/` (briefs).

## Verdict

Spec: APPROVED
Quality: CHANGES REQUIRED

One required change (finding 1): try-this 1 presents a single noisy inspector readout as the
growth of σ_θ, and the trio it quotes (2.7° → 4.3° → 7.5°) contradicts, for a reader, the table
and quiz 1's own σ_θ (2.74° / 3.87° / 5.47°) at the same three spots. Everything else is
correct, pinned, and of the standard the TDoA lessons set.

## Commands

- `npx vitest run tests/course/uwb-aoa.test.ts tests/course/lessons.test.ts
  tests/engine/lesson-hashes.test.ts` → 3 files, **70/70 passed**, exit 0.
- `npx tsc -b` → clean, exit 0, no output.
- Extra, because the commit edits two other course tests' seam assertions:
  `npx vitest run tests/course` → 25 files, **641/641 passed**, exit 0.
- Extra probes (scratchpad, `vite-node`, nothing written into the repo): the fourteen bearings of
  each spot and the sigma the inspector row derives from the last of them; EN/ZH numeric-token
  parity over all 62 localized strings; `aoa: true` vs `aoa: false` on the base scene.

## Binding constraints — checked one by one

1. **Scene.** One anchor `anc-1` at (5, 0.5, 2.2), `yawDeg: 90`; tag `badge-1` at z 1.0;
   `oneRoom()` 10 × 8 m. Pinned per variant in *"is one anchor facing into the room and one
   badge…"* (position, role, yaw, z, room, and that every badge is inside the room).
2. **Spots.** base boresight 2 m, `off45` 45° at 4 m, `off60` 60° at 5 m — built polar from the
   anchor (`tagXY`), so the true azimuths are −45.000°/−60.000° rather than a rounded coordinate's
   approximation. `trueAzimuthDeg` is recomputed from the scenario in the test and compared to 9
   decimals, and to the engine's own `trueThetaDeg` at 3 decimals. The `rangeM` in `SPOTS` is the
   *horizontal* distance, which is what the cross-range column then multiplies — correct after
   `be26ffb`.
3. **"Behind the anchor" with `yawDeg: -90`.** Accepted deviation from the brief's 270, and the
   reason is on the record: the test parses a `yawDeg: 270` copy of the scenario and asserts the
   schema rejects it (`.min(-180).max(180)`), and asserts |yaw| ≤ 180 for all four variants.
4. **Session.** DS, `mode: 'twr'`, `aoa: true`, channel 9, `nlos: false`, every other knob left at
   `DEFAULT_UWB_SESSION` and no node `ppm` set — all pinned per variant. "DS is not optional here"
   is proved, not asserted: an SS copy of the scene yields 7 bearings and zero `UWB_POSITION`.
5. **Identity and shape.** `id: 'uwb-aoa'`, `module: 14`, tier 5, last of `COURSE_ORDER`,
   4 observe / 2 tryThis / 3 quiz / 5 jumps (jump indices asserted ascending *and* at the exact
   record times). `lessonMinutes` = 25 (measured: 1663 words, ceiling 1724) and the test pins both
   the formula and the ≤ 1724 ceiling.
6. **Fixture additions only.** The `lesson-hashes.json` hunk is four added keys and nothing else;
   `tests/engine/lesson-hashes.test.ts` green, so no existing course run moved.
7. **Seam edits, one assertion line each.** `uwb-coexist.test.ts`: `for (const id of after.slice(4))
   … not.toContain` → `for (const id of after) … toContain`; `uwb-ul-tdoa.test.ts`:
   `expect(ids).not.toContain('uwb-aoa')` → `expect(ids[ids.indexOf('uwb-ul-tdoa') + 1])
   .toBe('uwb-aoa')`. One assertion plus its comment in each file; both files still pass.
8. **Standard vs model.** Body[0] cites §10.29.1.1 for AoA being among a ranging round's results
   (matches Slice 6 and the corpus usage) and names the antennas, λ/2, σ_φ, the arc sine, the
   clamp, the mirror and "every number below" as model, "FiRa-style, not anything the standard
   specifies". Pinned phrase by phrase.
9. **Errors and ellipses, never GDOP.** No comparison anywhere uses GDOP; the body says it is 1.00
   by construction and "Compare error ellipses instead", and every variant comparison in the table,
   try-this 1 and try-this 2 is in centimetres of error or in ellipse axes. (See finding 5 on the
   report's wording.)
10. **ZH parity.** All 62 EN/ZH pairs carry the *same multiset of numeric tokens* (probe: 0
    mismatches), every ZH string is a real translation (the existing "zh ≠ en for prose" guard
    passes), and the ZH table cells share the `N()` numerals. ZH keeps the corpus's typography
    (−45.0°, 7 987.2 MHz).
11. **Pure predicates.** `firstUwbAoa` / `firstUwbAoaFix` are one-line type/field tests on a
    `TLRecord`, no closure state, no allocation — same shape as the ten predicates above them.
12. **No escape hatches.** No `any`, `as unknown as`, `@ts-ignore` or `@ts-expect-error` in either
    new file (the only assertions are `Extract<…>` narrowings and `NodeCfg` annotations).

## Claim → pin table

Every number and empirical sentence a learner reads, and what holds it. "Verified" means I also
recomputed or re-measured it outside the test.

| # | Claim (EN prose) | Pin | Status |
|---|---|---|---|
| 1 | antennas "1.88 cm apart — half a wavelength on channel 9, whose 7 987.2 MHz carrier is 3.75 cm long" | `UWB_CHANNEL_MHZ[9]`, `(wavelengthM(9)*100).toFixed(2)`, `(antennaSpacingM(9)*100).toFixed(2)`, `antennaSpacingM ≈ λ/2` to 12 places | ✅ verified (1.8767 → 1.88) |
| 2 | "Channel 5: λ = 4.62 cm, spacing 2.31 cm; only the ratio matters" | same `toFixed(2)` pins on ch 5 + `pdoaRad`/`azimuthFromPdoaDeg` equal on both channels to 12 places at 0/−45/−60/80° | ✅ |
| 3 | Δφ = 2π·(d/λ)·sin θ = π·sin θ; θ̂ = asin(Δφ/π) clamped to ±90° | `pdoaRad(±90) ≈ ±π` (12 places), `pdoaRad(0) === 0`, `azimuthFromPdoaDeg(±1.4π) === ±90`; formula block text pinned | ✅ matches `src/uwb/aoa.ts` exactly |
| 4 | "45° off boresight produces 2.221 rad, one 60° off 2.721 rad" | `Math.abs(pdoaRad(-45,9)).toFixed(3)`, same at −60 | ✅ verified |
| 5 | "σ_φ = 0.15 rad ≈ 8.6°" | `AOA_SIGMA_PHI_RAD === 0.15`, `(0.15·180/π).toFixed(1) === '8.6'` | ✅ |
| 6 | "σ_θ = σ_φ/(π·cos θ) … 2.74° [boresight]; 3.87° at 45°, 5.47° at 60°" | `aoaSigmaDeg(0|−45|−60).toFixed(2)`, plus the closed form to 12 places at four angles; table cells (0,2),(1,2),(2,2) | ✅ verified (2.7354 → "2.74"; see finding 6 on the stale "2.73" in `aoa.ts`'s docstring) |
| 7 | "at ±90° it diverges … The model clamps it at 45°" | `aoaSigmaDeg(90) === AOA_SIGMA_CLAMP_DEG === 45` | ✅ value correct, wording ambiguous — finding 2 |
| 8 | fourteen bearings per spot, each inside 4 σ_θ of the truth | loop over `UWB_AOA` of base/off45/off60: length 14, `|θ̂ − θ| < 4·aoaSigmaDeg(θ_true)` | ✅ verified (worst 4.34° / 6.35° / 10.03° against 10.9° / 15.5° / 21.9°) |
| 9 | true bearings read −45.0° and −60.0° "exactly" | `trueAzimuthDeg` recomputed from the scenario to 9 places + record `toFixed(3)` + the table cells | ✅ |
| 10 | "the 2.12 cm sigma it has had since module 11" | `(rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs)*100).toFixed(2)` | ✅ |
| 11 | cross-range 1-σ 9.5 / 27.0 / 47.7 cm | table cells compared to `horizM(v)·aoaSigmaDeg(θ_true)` computed in the test | ✅ verified (2·2.7354°, 4·3.8687°, 5·5.4708° in rad) |
| 12 | range error 2.0 cm at all three spots | mean of the anchor's seven `|distM − trueDistM|`, `toFixed(1)`, per row | ✅ |
| 13 | fix error 2.1–15.6 (mean 9.6) / 5.8–44.5 (26.5) / 10.4–87.7 (48.2) cm | min/max/mean of the seven `hypot(x−trueX, y−trueY)`, per row, and again in try-this 1 | ✅ |
| 14 | "fix error and cross-range error are the same number twice" | each fix decomposed on the true ray: `||across| − fixError| < 1 mm` at all 21 fixes; `max|across| < 2σ_cross` | ✅ measured, not asserted |
| 15 | "the along-the-ray component of all twenty-one fixes stays inside 9 cm" | `max|along| < 0.09` **and** `< 4·σ_r` over 21 fixes | ✅ (brief said 8 cm; measured worst 8.02 cm — the report flags the one number that moved) |
| 16 | ellipses 9.4 × 2.1 / 25.7 × 2.1 / 43.1 × 2.1 cm, minor axis = σ_r, major a quarter turn from the bearing | first fix of each spot formatted; `ellipse.b ≈ rangeSigmaM` to 12 places; `a > b` and the turn = π/2 to 9 places at **all 21** fixes | ✅ matches `emitAoaFix` |
| 17 | slant 4.176 m vs plan 4.000 m at the 45° spot; 17.6 cm, "eight times the range's own sigma"; "the fix walks out √(r² − Δz²)" | slant/plan recomputed from `tagXY`; `(slant−4)/σ_r > 8`; every fix's distance from the anchor equals `√(distM² − Δz²)` to 9 places; and lifting the badge to the anchor's height moves no fix by > 1 mm | ✅ the strongest pin in the file; matches `emitAoaFix` and task-1 ruling 5 |
| 18 | "the cross sits a little inside the range ring, which is still the slant range" | task-1 report §5 (rings stay slant); observe 4's "the cross sits inside the range ring" | ✅ consistent with the engine and the overlay |
| 19 | observe 1: Poll at t = 0, bearing at 197.636 µs reading 2.3°, Final's bearing at 4.193 534 ms reading 1.8° | jump-target times (`0`, `197_636`, `4_000_000`, `4_193_534`) + `fmtRecord` of both bearings, verbatim | ✅ |
| 20 | observe 2: the three lines at 4.193 534 ms, verbatim, incl. "…(4.94, 2.47) m, true (5.00, 2.50), error 0.07 m, GDOP 1.00, 1 anchors (AoA)" | records at that instant, in that type order, each `fmtRecord` string `toContain`-ed in the observe text | ✅ |
| 21 | observe 2: "The fix takes the Final's bearing" | `ellipse.thetaRad` equals yaw + θ̂ of the round's **second** bearing + π/2, to 12 places | ✅ |
| 22 | observe 3: anchor rows — "2.31 m against a true 2.33, −2.4 cm, 97 % within 0.5 ns, 7 rounds, DS-TWR"; bearing "−3.7°, true 0.0°, error −3.7°, ± 2.7°, over 14 rounds" | whole `uwbRangeRows`/`uwbAoaRows` objects compared with `toEqual` after replaying the run through `initViewState`/`applyRecord` | ✅ |
| 23 | observe 4: badge's lane — "(5.13, 2.47) m against (5.00, 2.50), 13.3 cm out, GDOP 1.00, ellipse 9.4 × 2.1 cm", solved from AoA; the anchor has no fix and the badge no bearing | whole `uwbFixRow` object EN + the ZH method string; `a.position === null`; `uwbAoaRows(tag) === []` | ✅ |
| 24 | try-this 1: "the row's 1-σ grows 2.7° → 4.3° → 7.5°" | `uwbAoaRows(...)[0].sigma` per variant | ⚠️ pinned and reproducible, but it is `aoaSigmaDeg(last measured bearing)`, not σ_θ — **finding 1** |
| 25 | try-this 1: "(8.94, 1.19), 80° off at 4 m: σ_θ is 15.75°, six of the fourteen bearings pinned at the −90.0° clamp, worst ellipse 3.16 m" | spot recomputed from 80°/4 m; `aoaSigmaDeg(-80).toFixed(2)`; count of `θ̂ === -90` is 6; `max(ellipse.a).toFixed(2)` | ✅ value right; "3.16 m long" is the semi-axis — finding 3 |
| 26 | "sin(180° − θ) = sin θ" — the mirror is in the model, not a branch | `pdoaRad(180−t) ≈ pdoaRad(t)` and `azimuthFromPdoaDeg(pdoaRad(180−t)) ≈ t` at five angles | ✅ |
| 27 | behind: "the fourteen bearings come back identical to before, around 0°", true bearing 180.0°, badge unmoved, only Facing changed | bearing-by-bearing equality with the base run to 12 places; `trueThetaDeg === 180`; `tagXY('behind') === tagXY('base')`; yaws −90 vs 90; first line `fmtRecord` verbatim | ✅ verified |
| 28 | behind: "the range is right to 2 cm there and the clamp never fires" | the seven range errors are *the same array* as the base run's; mean 2.0 cm; no `|θ̂| === 90` | ✅ |
| 29 | behind: fixes near (5.06, −1.47), 3.97–4.03 m out, 396.7–403.0 cm, mean 400.2 = 2·r_h, outside the room, ellipse unchanged | first fix `toFixed(2)`; min/max/mean in cm; `mean ≈ 2·r_h`; all `y < 0`; `across` = −(base `across`) to 9 places; ellipse majors equal the base run's element by element | ✅ the reflection is pinned as a reflection, not just as a distance |
| 30 | "Put Facing back to 90° and the error returns to 2.1–15.6 cm"; "the editor's Facing field" | base min/max in cm; `STRINGS.en/zh.editor.uwbYaw` | ✅ |
| 31 | quiz 1 "twice as uncertain at 60°" | 5.4708/2.7354 = 2.000 exactly (cos 60° = ½) | ✅ exact, nice |
| 32 | quiz 3 explain: "The range is right to 2 cm there and the clamp never fires" | asserted verbatim against the run's own evidence | ✅ |

No claim in the lesson was left unpinned.

## Findings

1. **[Required] Try-this 1's "the row's 1-σ grows 2.7° → 4.3° → 7.5°" is a single noisy sample,
   and reads as a contradiction of the lesson's own σ_θ.** `uwbAoaRows` computes
   `aoaSigmaDeg(a.thetaDeg)` from the **last measured** bearing, and the last bearing of each run
   happens to be a high draw. Measured (probe over the three runs):

   | spot | last measured θ̂ | row σ | model σ_θ at the truth | the last draw's error |
   |---|---|---|---|---|
   | base | −3.74° | 2.74° → "± 2.7°" | 2.74° | −3.7° (1.4 σ) |
   | off45 | −50.56° | 4.31° → "± 4.3°" | 3.87° | −5.6° (1.4 σ) |
   | off60 | −68.62° | 7.51° → "± 7.5°" | 5.47° | −8.6° (1.6 σ) |

   So the sequence the learner is told to watch overstates the model's growth by 37 % at the 60°
   spot, and the same lesson's table (5.47°) and quiz 1's correct answer ("2.74° ahead and 5.47°
   at 60°") say something else about the same spot. Observe 3's "it belongs to the angle it was
   measured at" does not close the gap: in the base scene the two coincide, so nothing warns the
   reader that the displayed number is σ_θ at *one noisy bearing*, not σ_θ at where the badge is.
   Fix is one clause, e.g. "…the row quotes σ_θ at the bearing it happened to measure last, so it
   reads ± 2.7°, ± 4.3°, ± 7.5° where the model's own σ_θ is 2.74°, 3.87° and 5.47°" — and the
   ZH sentence in step. Mind the budget: only **61 words** of headroom before `lessonMinutes` tips
   to 30, so trim elsewhere if the rewrite is longer than about ten words. The test's existing
   assertion stays valid; its comment ("at the LAST measured angle") already says the right thing
   and should be promoted into the prose.

2. **[Minor] "The model clamps it at 45°, past which the linearisation describes nothing" is
   ambiguous.** `AOA_SIGMA_CLAMP_DEG` clamps the *sigma* at 45°, which first bites at about
   ±86.5° of azimuth — but the sentence sits two clauses after "at 45° it is 3.87°", so it can be
   read as "σ_θ is clamped for badges past 45° off boresight", which would contradict the 5.47°
   in the next breath and the 15.75° in try-this 1. Suggest "The model clamps σ_θ itself at 45°
   (it gets there at about ±86° off boresight), past which…". `src/uwb/aoa.ts`'s own docstring and
   the glossary both say it more precisely.

3. **[Minor] "the worst ellipse is 3.16 m long".** `ellipse.a` is the 1-σ *semi*-axis — which the
   body itself establishes ("The ellipse's semi-axes are those two measurements") and which the
   inspector prints as "9.4 × 2.1 cm". Calling 3.16 m the ellipse's length is the one place the
   lesson drops that convention. "the worst ellipse's major axis is 3.16 m" costs three words.

4. **[Minor] "unmoved, still 2.00 m away" / "same spot, same 2.00 m" in the mirror section.** Two
   paragraphs earlier the lesson teaches that the radio measures the slant range, and observe 1–2
   print "2.30 m (true 2.33 m)" for this very badge. 2.00 m is the plan distance; say so ("still
   2.00 m away on the floor"), or the section undoes the section before it.

5. **[Minor, report only] "GDOP is mentioned once" is not accurate.** The English prose names it
   three times: the body ("GDOP is 1.00 by construction and has nothing to say here"), observe 2's
   verbatim log line, and observe 4's inspector row. The binding constraint — compare errors and
   ellipses, never GDOP — *is* met; only the report's sentence is wrong, and the two extra
   mentions are quoted UI, which is the right way to have them.

6. **[Informational] 2.74° vs the controller's accepted 2.73°, and a stale docstring.**
   `aoaSigmaDeg(0)` = 2.73536°, so the lesson's `toFixed(2)` "2.74" is the correct rounding and
   the accepted "2.73" was a truncation — inherited from `src/uwb/aoa.ts`'s own docstring
   ("2.73° at boresight"), which task 1's report already contradicts with "2.736° at boresight".
   Nothing to change in this task; worth one word in `aoa.ts` in a later commit so the corpus does
   not carry both.

7. **[Informational] `"uwb-aoa#2"` hashes identically to `"uwb-aoa"`.** Expected — the timeline
   hash is `t:seq:type` and the "behind" variant moves no record — but it does mean the fixture
   cannot catch a regression in that variant's geometry. `tests/course/uwb-aoa.test.ts` pins it
   hard (bearings, fixes, reflection, ellipses), so coverage is not actually thin; no action.

8. **[Informational] Report note 3 checks out.** Probe: on the base scene, `aoa: false` is *not*
   record-identical to `aoa: true` once the `UWB_AOA`/`UWB_POSITION` records are stripped — the
   anchor's phase draw shifts its later draws. That does not contradict `device.ts:618`, whose
   claim is that `aoa: false` is byte-identical to a build that never had the feature (the draw is
   last, so it consumes nothing when off). The lesson claims neither. No action.

## Quality notes (no action)

- House style is followed closely: module header with the "what the lesson is really about"
  paragraph, the "Every number quoted below is pinned in…" line and the word-budget CAUTION block;
  exported `SPOTS`/`tagXY` so the test recomputes the geometry instead of transcribing it;
  `J`/`N`/`anchor`/`uwbTag`/`uwbSc`/`oneRoom` from the kit; variants as closures.
- The test is the best of the UWB set: three of the lesson's four theses are checked twice, once
  against the closed form and once against the run (bearings vs `aoaSigmaDeg` and vs the spread;
  cross-range vs `r_h·σ_θ` and vs the along/across decomposition; the mirror vs
  sin(180° − θ) = sin θ and vs the base run's own bearings). The slant-range pin — "lifting the
  badge to the anchor's height moves no fix by more than a millimetre" — is the kind of test that
  would survive a rewrite of `emitAoaFix`.
- The two new kit predicates are correctly placed and documented, and `firstUwbAoaFix` narrows on
  `method` without a cast.
- `aoaAnchor` uses `a.uwb!` — non-null on a value the kit just built; same pattern as elsewhere in
  the course files, and not an escape hatch.

## Re-review (fix round 1)

Reviewed: `32c5df4..5139da3` (one commit, lesson + test only), against `task-2-fix1.diff` and the
files at HEAD; working tree clean apart from the untracked briefs directory.

### Verdict

Spec: APPROVED
Quality: APPROVED

### Commands

- `npx vitest run tests/course/uwb-aoa.test.ts` → 1 file, **27/27 passed**, exit 0.
- Extra: `npx vitest run tests/course/lessons.test.ts tests/engine/lesson-hashes.test.ts` →
  **43/43 passed**, exit 0 (no scenario moved, so the four hash keys are untouched).
- Extra probes re-run: EN/ZH numeric-token parity over all 62 localized strings → 0 mismatches;
  `lessonWords` / `lessonMinutes`; the fourteen bearings and the row sigma per spot.

### Item by item

1. **Required (finding 1) — fixed, and better than asked.** Try-this 1 now reads "The inspector's
   1-σ is σ_θ at the bearing that row happened to measure last, so it moves with every draw: here
   it reads ± 2.7°, ± 4.3° and ± 7.5° where the model's σ_θ at the three spots is 2.74°, 3.87° and
   5.47°", with the ZH sentence carrying both trios. The pin now matches the claim in three ways:
   the row strings, `sigma === '± ' + aoaSigmaDeg(lastBearing).toFixed(1) + '°'` per spot, and
   `last.thetaDeg !== last.trueThetaDeg` (so "it moves with every draw" is evidenced, not
   asserted), plus `aoaSigmaDeg(SPOTS[v].offBoresightDeg)` = 2.74 / 3.87 / 5.47 and a `toContain`
   on both languages. Observe 3's closing clause was fixed in the same spirit ("it is σ_θ at the
   bearing that row last measured"), which removes the base-scene coincidence that hid the gap.
   No contradiction is left between try-this 1, the table and quiz 1.
2. **Minor 2 — fixed.** "The model clamps σ_θ itself at 45°, which it reaches at about ±86.5° off
   boresight and past which the linearisation describes nothing." The crossover is derived in the
   test from `AOA_SIGMA_PHI_RAD` and `AOA_SIGMA_CLAMP_DEG` (not typed in) and checked to one
   decimal, and bracketed: `aoaSigmaDeg(86.4) < 45`, `aoaSigmaDeg(86.6) === 45`. It also pins that
   the clamp bites at neither 60° nor the 80° spot, which is the reader's real question.
   Recomputed independently: acos(0.15·180/(π²·45)) = 86.514°. ZH matches ("约 ±86.5°").
3. **Minor 3 — fixed.** "the worst ellipse's semi-major axis is 3.16 m" / "半长轴达 3.16 m", with
   a test comment tying `ellipse.a` to the body's "The ellipse's semi-axes are those two
   measurements" (also pinned). Convention is now consistent across body, try-this and inspector.
4. **Minor 4 — fixed.** "unmoved, still 2.00 m away on the floor" and "same spot, same 2.00 m on
   the floor", ZH "平面上仍在 2.00 m 外" / "平面上同样的 2.00 m". Pinned from the scenario itself:
   the plan distance is 2.00 m and the slant 2.33 m, the same 2.33 observe 1 prints.
5. **Minor 5 (report wording) — not applicable to the code**; the report was not regenerated and
   nothing in the lesson changed on that point. Constraint still met: no comparison uses GDOP.
6. **Finding 6 (stale "2.73°" docstring in `src/uwb/aoa.ts`) — parked for the fix wave**, as
   ruled. Untouched here, correctly: this commit is lesson + test only.
7. **Budget.** 1663 → **1678 words**, `lessonMinutes` still **25**, 46 words below the 1724
   ceiling; the study-time test pins both. The fifteen added words were paid for by trims
   elsewhere (observe 2's "One anchor, and the line says so.", "rather than anything iterative",
   "hand back" → "report", and two quiz explanations).
8. **EN/ZH parity.** All 62 pairs still carry identical numeric-token multisets, including the two
   new trios and the 86.5°; every changed ZH string is a real translation of its EN counterpart,
   not a pass-through.
9. **Scope.** Two files, both this task's own; no engine, no fixtures, no seam tests.

### Remaining findings

- **[Nit, optional] Quiz 1's explanation lost its distractor rebuttal.** "the link budget is the
  same and the antennas do not move" was trimmed, leaving "Nothing about the radio changes with
  angle." Those two clauses were exactly what ruled out options a ("the signal is weaker off to
  the side") and c ("the antennas are further apart in wavelengths at that angle"), so the
  explanation now asserts where it used to explain. If any budget comes back, this is the first
  thing to restore.
- Findings 7 and 8 of the first round stand as informational, no action.
- No open blocking findings.
