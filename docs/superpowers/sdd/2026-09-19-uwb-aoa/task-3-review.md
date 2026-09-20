# Task 3 review — AoA docs (Guide, glossary, README, EditorGuide)

Reviewed: commit `c800e4e` (`2b01118..c800e4e`, 5 files, +132/−1) against
`.superpowers/sdd/2026-09-19-uwb-aoa/task-3-brief.md`, the task report, `task-1-report.md`, and
ground truth in `src/uwb/aoa.ts`, the AoA parts of `src/uwb/device.ts`, and `src/model/scenario.ts`.
Concurrent uncommitted course-lesson work (`src/course/uwb/uwb-aoa.ts`, `lessonKit.ts`,
`lessons.ts`, `tests/course/__probe.test.ts`) was ignored per scope.

## Verification

- `npx vitest run tests/ui/uwb-guide.test.ts` — 31/31 passing (29 existing + 2 new), exit 0.
- `npx tsc -b` — clean, exit 0, no errors anywhere (including the course files the other agent is
  touching — the report's noted `uwb-aoa.ts`/`lessonKit` failure is no longer present).
- No `any`, `as any`, `@ts-ignore` or `@ts-expect-error` in the diff.
- `alt.en`/`def.en` stay English-only for the four new glossary terms (covered by the pre-existing
  "language separation" test, which iterates every group).
- Deliverables present: Guide paragraph EN/ZH importing live constants from `src/uwb/aoa.ts`; four
  glossary terms (AoA, PDoA, Boresight / yaw, Cross-range error), each bilingual; two new README
  rows (AoA, PDoA) plus the "Known simplifications" bullet rewritten (not just appended) to
  describe the actual AoA model instead of "no AoA (...) yet"; two new EditorGuide entries
  ("Facing (yaw)" / "朝向" and "Angle of arrival (AoA)" / "到达角（AoA）") in both languages; exactly
  two new tests, in a new `describe('AoA (angle of arrival, §10.29.1.1)')` block.
- Tag discipline is correct: only the "AoA" glossary term cites the standard (§10.29.1.1); PDoA,
  Boresight/yaw and Cross-range error are all attributed as model/FiRa-style, matching that only
  AoA-as-a-ranging-result is standard and everything that produces it (PDoA, the antenna model,
  the fix) is this simulator's model.
- Numeric claims that were spot-checked against a fresh computation of `wavelengthM`/`aoaSigmaDeg`
  from the actual constants (`C_M_PER_NS = 0.299792458`, `UWB_CHANNEL_MHZ = {5: 6489.6, 9: 7987.2}`,
  `AOA_SIGMA_PHI_RAD = 0.15`) all check out: half-wavelength spacing rounds to 1.9 cm (ch 9,
  1.8767 cm exactly) / 2.3 cm (ch 5, 2.3098 cm exactly), matching what `toFixed(1)` in `Guide.tsx`
  and the hardcoded glossary strings both say; σ_θ(0°) = 2.7357° → "2.7°"; σ_θ(60°) = 5.4713° →
  "5.5°"; clamp 45°. The mirror (`sin(180° − θ) = sin θ`), the ±90° field of view, `yawDeg` measured
  from +x with 0 default, "every frame … from the tag" (not "every response", matching the actual
  per-frame draw in `device.ts` rather than the stale brief wording), and the DS-TWR-only /
  disabled-under-TDoA gating are all stated correctly and consistently across the five files.

## Findings

1. **Major (quality/drift) — `Guide.tsx`'s cross-range formula uses the slant range, not the
   horizontal range, contradicting both the engine and this same commit's own glossary entry.**
   Both `GuideEn` and `GuideZh`'s AoA paragraph say: "the bearing's angle error becomes a
   cross-range error that grows with distance — r·θ (θ in radians) metres off to the side" (ZH:
   "r·θ（θ 以弧度计）米"). But `emitAoaFix` in `src/uwb/device.ts` (lines ~1018–1033) computes
   `sigmaAcrossM = horizM * aoaSigmaDeg(thetaDeg) * (Math.PI / 180)`, where `horizM =
   √(max(0, distM² − Δz²))` is the *horizontal* leg of the slant range — and the function's own
   doc comment spells this out explicitly: "across it the bearing's rh·σ_θ". This was a deliberate
   controller ruling in task 1 (deviation 5 in `task-1-report.md`: "Slant range → horizontal range
   … `emitAoaFix` walks out `rh = √(max(0, r² − Δz²))` rather than the slant range, for the fix,
   for the cross-range axis and … the overlay's line"), and the corresponding glossary term added
   in *this* commit gets it right: `Cross-range error`'s `alt.en`/`def.en` both say
   `horizM·aoaSigmaDeg(θ)`, not `r·aoaSigmaDeg(θ)`. So the Guide's main teaching paragraph — the
   one place most readers will actually learn the formula, and the one place in this task required
   to use imported constants — states a formula that is wrong whenever anchor and tag differ in
   height (which is the lesson's own mounting: anchor 2.2 m, tag 1.0 m per `task-1-report.md`), and
   is inconsistent with the correct glossary term two files away in the same diff. Fix: change
   `r·θ` to something like "the horizontal range times θ" (or introduce a short "horizontal range"
   term matching `horizM`) in both `GuideEn` and `GuideZh`.

2. **Minor (maintainability, non-blocking) — numeric AoA figures in `glossary.ts` and
   `EditorGuide.tsx` (2.7°, 5.5°, 45°, 1.9 cm) are hardcoded strings, not derived from
   `src/uwb/aoa.ts`, and nothing pins them against future drift.** `Guide.tsx` correctly imports
   `AOA_SIGMA_PHI_RAD`, `AOA_SIGMA_CLAMP_DEG`, `aoaSigmaDeg`, `antennaSpacingM` and the new test
   checks its rendered output against those same live constants — but the four glossary entries
   and the two EditorGuide entries repeat the same numbers as plain text. If `AOA_SIGMA_PHI_RAD` or
   the clamp ever changes, these would silently go stale with no test catching it (unlike the Guide
   paragraph, which would fail `tests/ui/uwb-guide.test.ts` immediately). Not required by the brief
   (only "Guide paragraph EN/ZH with imported constants" is binding) and today's values are all
   correct, so this is a note for a future slice rather than a change request now.

## Verdict

Spec: APPROVED
Quality: CHANGES REQUIRED

## Re-review (fix round 1)

Reviewed: `task-3-fix1.diff`, commit `be26ffb` (`c800e4e..be26ffb`, 2 files, +43/−4) —
`src/ui/Guide.tsx` and `tests/ui/uwb-guide.test.ts`.

- Finding 1 (Major — slant-range vs horizontal-range cross-range formula): **resolved.** Both
  `GuideEn` and `GuideZh`'s AoA paragraph now say r<sub>h</sub>·θ, with an explicit clause
  "r<sub>h</sub> = √(r² − Δz²) is the *horizontal* range (an anchor on the ceiling measures a
  slant range r, not the horizontal distance)" (ZH equivalent present and matches in meaning).
  This now agrees with `emitAoaFix` in `src/uwb/device.ts` (`horizM = √(max(0, distM² − Δz²))`)
  and with this task's own "Cross-range error" glossary term. New test
  `'the cross-range error is the horizontal range times theta, not the slant range, in both
  languages'` pins both `r<sub>h</sub>·θ` and the `r<sub>h</sub> = √(r² − Δz²)` clause in both
  rendered languages, so a regression back to plain `r·θ` would fail here.
- Finding 2 (Minor — hardcoded AoA numbers in glossary/EditorGuide unpinned against drift):
  **resolved.** New test `'pins the glossary and EditorGuide AoA figures to the live engine
  constants, so a drift fails here'` reads `src/editor/EditorGuide.tsx` as raw source text (same
  technique already used for `README.md`) and checks the AoA/PDoA glossary `def.en`/`def.zh` and
  the EditorGuide prose against `aoaSigmaDeg(0)`, `aoaSigmaDeg(60)`, `AOA_SIGMA_CLAMP_DEG`,
  `antennaSpacingM(9)` and `AOA_SIGMA_PHI_RAD` computed fresh from `src/uwb/aoa.ts`. A future
  change to those constants without updating the hardcoded prose now fails the suite.
- `npx vitest run tests/ui/uwb-guide.test.ts` — 33/33 passing (31 prior + 2 new), exit 0.
- No new findings from this diff: the two files touched are exactly the two implicated by round 1,
  no unrelated changes, no `any`/`@ts-ignore`, ZH parity maintained.

### Verdict (fix round 1)

Spec: APPROVED
Quality: APPROVED
