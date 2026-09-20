# Task 3 report — AoA docs (Guide, glossary, README, EditorGuide)

**Status:** done

**Commit:** c800e4e — `docs(uwb): angle of arrival in the guide, glossary and README`
(files: `src/ui/Guide.tsx`, `src/ui/glossary.ts`, `README.md`, `src/editor/EditorGuide.tsx`, `tests/ui/uwb-guide.test.ts`)

**Tests:** `npx vitest run tests/ui/uwb-guide.test.ts` — 31/31 passed (29 existing + 2 new, in a new `describe('AoA (angle of arrival, §10.29.1.1)')` block). `npx vite build` succeeds. `npx tsc -b` fails, but only on `src/course/uwb/uwb-aoa.ts` (another agent's in-progress lesson file referencing not-yet-exported `firstUwbAoa`/`firstUwbAoaFix` from `lessonKit`) — zero errors in any of my five files.

**Concerns:** none in my slice; the `tsc -b` failure is pre-existing/concurrent work outside my file set (course lesson + lessonKit, owned by the other agent) and was left untouched per scope.

## Fix round 1

Verdict: Spec approved, Quality CHANGES REQUIRED (1 major, 1 minor). Review: `.superpowers/sdd/2026-09-19-uwb-aoa/task-3-review.md`.

- **Major (fixed):** `Guide.tsx`'s AoA paragraph, EN and ZH, said the cross-range error is `r·θ` (the slant range times θ). `emitAoaFix` in `src/uwb/device.ts` and this same commit's own `Cross-range error` glossary term both use the *horizontal* range, `horizM = √(r² − Δz²)`, because a ceiling-mounted anchor measures a slant range. Reworded both paragraphs to `r_h·θ`, with the clause `r_h = √(r² − Δz²)` and the reason (a ceiling anchor's range is slant, not horizontal).
- **Minor (addressed):** the glossary's AoA/PDoA numbers (2.7°, 5.5°, 45°, 1.9 cm, 0.15) and EditorGuide's AoA-checkbox prose (2.7°) were hardcoded strings with nothing to catch drift. Left the strings as-is (not required to become imports) and added test assertions in `tests/ui/uwb-guide.test.ts` that pin them against a fresh computation from `src/uwb/aoa.ts`'s `AOA_SIGMA_PHI_RAD`/`AOA_SIGMA_CLAMP_DEG`/`aoaSigmaDeg`/`antennaSpacingM` (reading `EditorGuide.tsx`'s source text directly, the same way the README is read raw, since `EditorGuideEn`/`Zh` aren't exported). Also added a regression test pinning the corrected `r_h·θ` / `r_h = √(r² − Δz²)` formula in both languages.

**Commit:** be26ffb — `fix(docs): AoA cross-range formula uses the horizontal range; numbers pinned` (`src/ui/Guide.tsx`, `tests/ui/uwb-guide.test.ts`)

**Tests:** `npx vitest run tests/ui/uwb-guide.test.ts` — 33/33 passed (31 previous + 2 new). `npx tsc -b` and `npx vite build` both clean/green (the earlier `uwb-aoa.ts` lesson-file error has since resolved on the other agent's side).
