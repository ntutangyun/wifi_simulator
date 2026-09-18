# Task 9 report — Lesson 2 "The clock inside the reply time"

Status: **DONE**. Branch `feat/uwb-ranging`, worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`.

## Files

- New: `src/course/uwb/uwb-sstwr.ts` (`uwbSstwrScenario`, `uwbSstwr`, id `uwb-sstwr`, module 11)
- New: `tests/course/uwb-sstwr.test.ts` (23 tests)
- Modified: `src/course/lessons.ts` (import + `LESSONS` entry after `uwbIntro`)
- Modified: `tests/fixtures/lesson-hashes.json` (3 additions, no changes)

## Scene, exactly as the brief

`oneRoom()` (10 × 8 m brick-walled Lab), tag `tag-1` "Phone" at (5, 4, 2.2), anchors at
(8.5, 4), (5, 7.5), (1.5, 4), (5, 0.5) all z 2.2 — every true distance exactly 3.50 m.
Session `{ method: 'ss', nlos: false }`. Base `{ tag: 10, anchors: -10 }`; variants
`{ tag: 0, anchors: 0 }` "Perfect crystals"/"理想晶振" and `{ tag: 1, anchors: -1 }`
"TCXOs, ±1 ppm"/"±1 ppm 的温补晶振".

## Measured numbers (all pinned by the test, all measured before the prose was written)

Base run, tag +10 ppm / anchors −10 ppm:

| anchor | slot | raw range | raw error | corrected (log) | corrected error |
|---|---|---|---|---|---|
| anchor-1 | 1 | 9.51 m | +6.01 m | 3.45 m | −5.3 cm |
| anchor-2 | 2 | 15.47 m | +11.97 m | 3.42 m | −7.8 cm |
| anchor-3 | 3 | 21.49 m | +17.99 m | 3.41 m | −9.5 cm |
| anchor-4 | 4 | 27.42 m | +23.92 m | 3.51 m | +0.5 cm |

Other pinned facts: Tprop 11.675 ns → RX_START at 12 ns for all four anchors; round =
5 slots of 2 ms, UWB_SLOT at 0/2/4/6/8 ms; anchor-1 counters 26 381 597 885 and
26 509 391 059, difference 127 793 174 RCTU = the frame's `replyRctu`; consecutive raw
steps 5.96 / 6.02 / 5.93 m; FoM 0x16 → `97 % within 0.5 ns` (15 cm); log lines quoted
verbatim via `fmtRecord`.

Perfect-crystal variant raw errors: **1.9, −1.9, 0.7, −6.1 cm** (all `< 0.15 m`).
TCXO variant raw errors: **0.62, 1.18, 1.80, 2.34 m** (≈ i × 0.60 m, each within 0.15 m
of the formula).

The table block quotes the predicted errors **6.0 / 12.0 / 18.0 / 24.0 m**; the test
recomputes each from the formula, asserts `.toFixed(1)` matches, and asserts the four
strings `"6.0 m"`, `"12.0 m"`, `"18.0 m"`, `"24.0 m"` appear among the table cells.

## Deviations from the brief / the task message

1. **Residual bound.** The task message said "σ_cfo = 0.2 ppm → 1σ of 6 cm per ms of
   reply". The engine gives **3.0 cm per ms**: the residual is ½·Treply·σ_cfo, so
   1 ms × 0.2 ppm / 2 = 0.1 ns = 3.0 cm. 6 cm is the figure *per 2 ms slot*. The lesson
   states 3.0 cm/ms and 6.0 cm (anchor 1) to 24.0 cm (anchor 4) of 1-σ; the test bounds
   each corrected error by `3 × hypot(residualSigma(slot), SIGMA_R)` rather than a flat
   `< 0.15 m`, so it is principled and grows with the slot. (The measured maximum is
   9.5 cm, so a flat 0.15 m would in fact have passed this seed — the per-slot bound is
   the safer pin.)
2. **The `Treply is i × 2 ms − Tprop` assertion.** Written first as a plain equality it
   failed by exactly 20 ns: `replyRctu` is measured on the anchor's −10 ppm clock, so it
   is the true interval × (1 − 10e-6). The test now asserts that, plus the corollary that
   half the shortfall is 3 m per slot (the tag's own +10 ppm on Tround supplies the other
   half of the 6 m). This turned into a better pin than the original.
3. **Jump labels.** "the first range, 6 m long" was reworded to "the first range: raw is
   6 m long" (and the fourth likewise) so a learner does not read it as the corrected
   figure.
4. Nothing else deviates. Body outline, jump/observe/tryThis/quiz counts, variants, ids
   and the sources-first sentence are as specified.

## Study time

`lessonWords(uwbSstwr)` = **1707**; `lessonMinutes` = **25** (4 observe × 2 + 2 tryThis ×
4 = 16 min, plus 1707/150 = 11.4 min of reading → 27.4 → rounds to 25). Seventeen words
of headroom before it rounds to 30; the file header says so.

## Fixture diff

```
+  "uwb-sstwr": "774c9dd5",
+  "uwb-sstwr#0": "774c9dd5",
+  "uwb-sstwr#1": "774c9dd5",
```

Three additions, **no existing hash changed**. The three are identical because
`timelineHash` mixes only `t:seq:type` — the variants differ solely in crystal ppm, which
changes counter *values* but not event timing or ordering. (Contrast `uwb-intro` vs
`uwb-intro#0`, where the distance changes RX times.)

## Verification

- `npx tsc -b` — clean (no `any`, no `@ts-ignore` anywhere in the new files)
- `npx vite build` — built in 2.6 s
- `npx vitest run` — **91 files, 947 tests, all passing**
- `tests/course/uwb-sstwr.test.ts` alone — 23 tests passing

Both languages were re-read side by side; every number appears identically in the English
and Chinese of the same block, and one EN/ZH drift found in a quiz option
("geometry" vs "更好的几何位置") was fixed.

---

# Fix round 1

Review `task-9-review.md` (2 blocking, 8 minor) — all ten addressed. Files touched:
`src/course/uwb/uwb-sstwr.ts` and `tests/course/uwb-sstwr.test.ts` only. The hash fixture was
**not** regenerated and `src/course/lessons.ts` was not touched.

## Blocking

**1. "a twentieth of the base offset" → "a tenth".** The base scene is ±10 ppm per device
(eA − eB = 20 ppm), the TCXO scene ±1 ppm (eA − eB = 2 ppm): a factor of ten, which is what
"an order of magnitude" and the measured 0.60 vs 6.00 m per slot already said. Fixed EN and
ZH, and the sentence now names the numbers the ratio is between ("eA − eB falls from 20 ppm
to 2 ppm" / "eA − eB 从 20 ppm 降到 2 ppm"). New test `"TCXOs, ±1 ppm" is a TENTH of the base
offset, and gives a tenth of the ramp` pins `BASE_PPM.delta / TCXO_PPM.delta === 10` from the
two scenarios, pins the prose strings in both languages, and pins
`predictedRawErrM(slot, BASE) / predictedRawErrM(slot, TCXO) ≈ 10` for all four slots. The
stale test comment is gone and the measured ramp ratio is checked too.

**2. observe 2's "about 3.4 m corrected" was false for anchor 4 (3.51 m).** Rewritten to
"The corrected figures stay between 3.41 and 3.51 m" / "修正后的读数都落在 3.41 与 3.51 m
之间". New test `observe 2's span holds` derives the min and max of the corrected column as
printed strings, asserts `['3.41', '3.51']`, asserts both language strings contain them, and
additionally pins the fact quiz 3 rests on: anchor 4 has the smallest absolute error of the
four.

## Minors

3. **Coffs pinned against the run.** New test recovers the engine's own Coffs per anchor by
   inverting `ssTwrCorrected` (`Coffs = (2·tof − Tround + Treply) / Treply`, since `coffs` is
   on no record), asserts each is within 5σ of `eB − eA` and rounds to −20 ppm. Measured:
   −20.24 / −20.10 / −20.11 / −19.95 ppm. The synthetic worked case now builds its arguments
   from `BASE_PPM` too.
4. **Table cells pinned.** The old test checked only the "Predicted error" and "Treply"
   columns. The replacement walks the four rows and asserts all five cells of each: anchor id
   = `r.peer`, Treply = `` `${slot*2} ms − Tprop` ``, predicted = the formula to one decimal,
   raw range = `rctuToMetres(tofRawRctu).toFixed(2)`, raw error = `rawErr.toFixed(2)` — cells
   tied to the measurement rather than to a second literal. The prose sentence "believes it
   is 9.51 m from one … 27.42 m from another" and observe 2's `9.51 → 15.47 → 21.49 → 27.42`
   are now built from the same measured values and `toContain`-ed.
5. **Stale jump-label comment fixed**, and a new test pins all four jump labels plus
   `Math.round(rawErr)` = 6 and 24 for the two that quote a number.
6. **Rounding matches the phrase:** `Math.round(ratio / 10_000) * 10_000 === 170_000` (the
   prose says "a hundred and seventy thousand"), with the true 171 306 named in the comment.
7. **FoM intermediate lookups pinned** as far as the module's public surface allows: the
   tables are not exported, so the test reads interval index 2 with the identity scale index 1
   (`fomDecode((FOM_LOS & 0x1f) | (1 << 5)).intervalNs === 1`) and then asserts the shipped
   byte's 0.5 ns is exactly half of it — separating "(2 → 1 ns)" from "(0 → ×0.5)".
8. **Crystal offsets and noise read back, not re-typed.** `ppmOf(variant)` derives
   `{ tag, anchors, delta }` from each scenario's nodes; `SESSION = uwbSstwr.scenario().uwb!`
   supplies `tsNoisePs` and `cfoNoisePpm`. `predictedRawErrM(slot, ppm)` is now the single
   place the raw-error formula lives; the five hand-typed `10e-6` / `20e-6` / `1e-6` / `2e-6`
   and `rangeSigmaM(100)` are gone.
9. **Header made true:** it now names what "every number is pinned" covers (table cells, the
   numeric jump labels, the crystal offsets, the engine's Coffs).
10. **`as unknown as L10n` replaced** with the typed predicate
    `isL10n(o): o is Record<string, unknown> & L10n`, matching the shape lesson 1's fix round
    adopted.

## Word budget

The two prose rewrites added words, so two sentences were tightened elsewhere ("does not
measure distance at all; it measures how" → "measures not distance but how"; "the
double-sided exchange of the next lesson" → "the next lesson's double-sided exchange").
`lessonWords` = **1716**, `lessonMinutes` = **25** (eight words of headroom; the header says
so).

## Verification

- `npx vitest run tests/course/uwb-sstwr.test.ts` → **27 tests passing** (was 23).
- `npx tsc -b` → no diagnostics from either of my files.
- Hash fixture untouched (`git status` shows no change to it). Recomputed `uwb-sstwr`,
  `uwb-sstwr#0` and `uwb-sstwr#1` directly: all three still `774c9dd5`, matching the recorded
  fixture.

### Two pre-existing failures from the concurrent lesson-3 agent, not from this fix

At the time of this commit the lesson-3 agent has `src/course/lessons.ts` modified and
`src/course/uwb/uwb-dstwr.ts` / `tests/course/uwb-dstwr.test.ts` untracked in the shared
worktree, without having regenerated the fixture yet. Consequently:

- `npx vitest run tests/engine/lesson-hashes.test.ts` fails with **82 computed keys against
  80 recorded** — the two extra keys are `uwb-dstwr*`. Nothing of mine changed: my three keys
  were verified equal to the fixture above.
- `npx tsc -b` reports one error, `tests/course/uwb-dstwr.test.ts(151,23): TS2339 Property
  'node' does not exist on type 'TLRecord'` — their file, their fix.

Both clear when lesson 3 regenerates the fixture and fixes its own test.
