# Task 1 report — bands, overlap and the 6 GHz channel setting

Status: DONE
Commit: 6b4d748503a1c4c5b5a54b11e421e2b276540e89

## What was built

- `src/uwb/phy.ts`: `UWB_BAND_MHZ` (channel 5 / 9 band edges), `uwbBandOverlapMhz`,
  `uwbBandOverlap`, `UWB_SIR_MIN_DB`, `UWB_MAX_INPUT_DBM_PER_MHZ`, `uwbInBandDbm` —
  all exactly as specified in the brief's interfaces.
- `src/model/scenario.ts`: `DEFAULT_SIX_GHZ_CENTER_MHZ = 5985`, `sixGhzChannelNo`,
  `Scenario.sixGhzCenterMhz?: number` plus the schema rule (int, 5955–7115, step 5).
  A scenario without the field still parses; the default is left for the engine
  (a later task) to apply via `sc.sixGhzCenterMhz ?? DEFAULT_SIX_GHZ_CENTER_MHZ`.
- `src/editor/planOps.ts`: two small pure helpers so the editor field and its test
  share one definition — `clampSixGhzCenterMhz(raw)` (clampField to [5955,7115],
  then snap to the nearest 5 MHz step) and `sixGhzOverlapPct(sc, centerMhz)`
  (null unless the plan has a channel-5 UWB session *and* a UWB node; else the
  rounded overlap percentage from `uwbBandOverlap(center, 80, 5)`).
- `src/editor/FloorPlanEditor.tsx`: a "6 GHz channel" number input next to Seed/RTS
  in the plan-settings toolbar (step 5, min/max from the schema), showing
  `ch ${sixGhzChannelNo}`, plus a dim overlap note that only appears per
  `sixGhzOverlapPct`.
- `src/ui/i18n.ts`: `editor.sixGhz`, `sixGhzHint`, `sixGhzChannel(n)`,
  `sixGhzOverlap(pct)` in both EN and ZH (real Chinese, following the file's
  existing bilingual pairing style).

## Tests

- `tests/uwb/coexist-bands.test.ts` (new): band edges, all four `uwbBandOverlap`
  cases from the brief, and both `uwbInBandDbm` cases.
- `tests/model/uwb-scenario.test.ts` (extended): `sixGhzChannelNo` cases, plus
  4 schema cases (accept 6305, reject 6303, reject 5950, unset field still parses).
- `tests/editor/coexist-note.test.ts` (new — no DOM/render harness exists under
  tests/editor, so this is a pure arithmetic test of `clampSixGhzCenterMhz` and
  `sixGhzOverlapPct`, the exact functions the editor input and note use): 9 cases
  covering clamp-low, clamp-high, snap-to-5-either-direction, pass-through,
  empty-string fallback, and all four "does the note fire" branches.

## Verification

- `npx tsc -b` — clean, no errors.
- `npx vite build` — succeeds (pre-existing >500kB chunk warning only, unrelated).
- `npx vitest run` — 100 files / 1141 tests, all green, including
  `tests/engine/lesson-hashes.test.ts` unchanged (no regeneration needed).

## Concerns

None. `src/engine/spectrum.ts` / `tests/engine/spectrum.test.ts` were not present
in the tree and were not touched; the commit's pathspec is limited to the 8 files
listed above.
