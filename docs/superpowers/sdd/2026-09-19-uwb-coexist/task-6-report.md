# Task 6 report

Status: done
Commit: 47dd7fb
Tests: `npx vitest run tests/ui/uwb-guide.test.ts` — 22 passed (19 existing + 3 new); full suite (excluding the other agent's in-flight `src/course/**`, `tests/course/**`, `tests/scratch/**`) — 82 files / 674 tests passed. `npx tsc -b` and `npx vite build` both clean (the one pre-existing `tests/scratch/measure-coexist.test.ts` TS error belongs to the other agent's in-flight work, not touched).
Concerns: none — Guide.tsx's new paragraph pulls `UWB_SIR_MIN_DB`, `UWB_MAX_INPUT_DBM_PER_MHZ`, `UWB_BAND_MHZ`, `DEFAULT_SIX_GHZ_CENTER_MHZ` and `sixGhzChannelNo` directly from the engine (imported, not retyped); the README's stale "no ... coexistence" simplification bullet (which predates this branch's slices) was corrected to describe the actual flat-spectral-density/transmitter-law/no-adjacent-channel-leakage model.

## Fix round 1

Status: done
Commit: 11b6b9d
Fix: reviewer's blocking finding — the README row, Guide EN/ZH paragraph and glossary "Noise rise" term (alt + both defs) all stated, unconditionally, that Wi-Fi's CCA "never" fires on UWB power. The engine's `updateAllCca` does sum foreign power into the energy-detect accumulator (`CCA_ED_DBM = −62`, `src/engine/phy.ts`), and within well under a metre a UWB channel-5 frame's in-band power (≈ −22 dBm EIRP inside an 80 MHz Wi-Fi channel, path loss 48.7 + 20·log10 d at channel 5) exceeds that floor. Qualified all four claims by distance ("past about 30 cm ... at any realistic spacing CCA never fires", EN and ZH), matching the design spec's own qualifier. Added a test (`tests/ui/uwb-guide.test.ts`, "qualifies 'CCA never fires on UWB power' by distance") asserting `30 cm` appears in the rendered EN/ZH Guide, the glossary's Noise-rise term (alt + both defs) and the README's SIR-floor row, with the −22/−60 dBm crossover math from the engine's constants recorded in a comment.
Tests: `npx vitest run tests/ui/uwb-guide.test.ts` — 23 passed (22 previous + 1 new); full suite (same exclusions) — 82 files / 675 tests passed. `npx tsc -b` and `npx vite build` clean.
Concerns: none.

## Fix round 2

Status: done
Commit: caef9db
Fix: re-review recomputed the CCA/UWB crossover from the engine's own constants — `uwbInBandDbm(UWB_TX_POWER_DBM, 80)` ≈ −22 dBm, `uwbPl0Db(5)` = 48.694, `UWB_PL_EXP` = 2.0, `CCA_ED_DBM` = −62 — giving d = 10^((−22 − 48.694 + 62)/20) ≈ 0.367 m, not the "30 cm" fix round 1 used. Replaced "30 cm" with "about 40 cm" (rounded up to the next 10 cm, the conservative figure) in all four places: README's SIR-floor row, Guide.tsx EN and ZH paragraphs, and the glossary's "Noise rise" term (alt + both defs). Rewrote the pinning test to compute `CCA_UWB_CROSSOVER_M` directly from `uwbInBandDbm`, `uwbPl0Db(5)`, `UWB_PL_EXP` and `CCA_ED_DBM` (imported from `src/engine/phy.ts`), asserting it falls in 0.36–0.38 m, plus the existing four "quotes 40 cm" assertions (Guide EN/ZH, glossary term, README row) updated from 30 cm to 40 cm.
Tests: `npx vitest run tests/ui/uwb-guide.test.ts` — 24 passed (23 previous + 1 new crossover test). Full suite (same exclusions) — 1 pre-existing failure in `tests/engine/lesson-hashes.test.ts` (92 vs 87 scenario hashes), caused by the other agent's in-flight course/lesson additions, not this task's files; all other 675 tests across 81 other files passed. `npx tsc -b` and `npx vite build` clean.
Concerns: none — the lesson-hashes failure is outside this task's scope (course files owned by the other concurrent agent).
