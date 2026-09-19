# Task 1 review — bands, overlap and the 6 GHz channel setting

Commit reviewed: `6b4d748503a1c4c5b5a54b11e421e2b276540e89`

## Verification run

- `npx vitest run tests/uwb/coexist-bands.test.ts tests/model tests/editor tests/engine/lesson-hashes.test.ts` — 17 files, 171 tests, all passed, including `tests/engine/lesson-hashes.test.ts` (fixture untouched, hash unchanged) and the new `tests/editor/coexist-note.test.ts` (9 cases) / `tests/uwb/coexist-bands.test.ts` (5 cases).
- `npx tsc -b` — exit 0, no errors anywhere in the tree.
- Manually re-derived the required floating-point edge cases:
  - `uwbBandOverlapMhz(6260, 80, 5)`: `[6220,6300] ∩ [6240,6739.2]` = `6300-6240 = 60` exactly (all operands are exact binary-representable multiples of 5/10), `60/80 = 0.75` exactly — matches the brief's `6260/80 → exactly 0.75` case with no floating-point drift.
  - `uwbInBandDbm(-14, 80) = -14 + 10·log10(80/499.2) ≈ -21.951`, matches `≈ −21.95`; `uwbInBandDbm(-14, 0) = -14 + 10·log10(0) = -Infinity`, matches exactly.
  - `UWB_BAND_MHZ[5]`/`[9]` cross-checked against the pre-existing `UWB_CHANNEL_MHZ` centres (6489.6 ± 249.6, 7987.2 ± 249.6) — consistent, not a stray literal.
- `clampSixGhzCenterMhz` step-5 snap: since `clampField` bounds the raw value to `[5955, 7115]` *before* the `Math.round(x/5)*5` snap, and both bounds are themselves multiples of 5, the subsequent snap cannot push the result back out of range (nearest-multiple-of-5 of a value already inside a 5-aligned interval stays inside it) — verified by the 9 `coexist-note.test.ts` cases including clamp-then-snap in both directions.
- `scenarioFromJson`/`scenarioToJson` (`src/editor/planOps.ts:353-359`) are untouched — plain `JSON.stringify`/`ScenarioSchema.parse`. `sixGhzCenterMhz` is `.optional()` on the schema, so a saved scenario lacking the field parses unchanged (confirmed by the "a scenario without the field parses unchanged" test and by `tests/model/uwb-scenario.test.ts`'s "every lesson scenario still parses" case, which covers real lesson fixtures with no field set).
- No `any`, `@ts-ignore`, or `as unknown as` anywhere in the diff.
- Editor strings: EN "overlaps UWB channel 5 at 80 MHz: N %" / ZH "与 UWB 5 信道重叠（按 80 MHz 计）：N %" are real, correctly-formed Chinese, gated on `sixGhzOverlapPct` returning non-null (channel-5 UWB session *and* a UWB node present) exactly as specified.

## Findings

1. **Minor** — `src/ui/i18n.ts:288` (EN) / `:312` (ZH): the overlap note's wording is `"overlaps UWB channel 5 at 80 MHz: ${pct} %"`, adding "at 80 MHz" beyond the brief's illustrative `"overlaps UWB channel 5: N %"`. This is an accurate clarification (the note is in fact computed at a fixed 80 MHz Wi-Fi channel width) and not a spec violation — the brief text was descriptive, not a literal string requirement — but flagging it since exact wording was called out as a binding constraint category. No action required unless the plan owner wants the shorter string.
2. **Minor** — `src/uwb/phy.ts:81-84`: `UWB_BAND_MHZ` band edges (6240.0/6739.2, 7737.6/8236.8) are hand-written literals rather than derived from the pre-existing `UWB_CHANNEL_MHZ` centre ± 249.6. They are numerically consistent (verified above) and match the brief's explicit interface exactly, so this is a style-only observation, not a defect.

No blocking findings. All binding constraints (exact exports/values, band edges, overlap fraction and its floating-point edge case, `UWB_SIR_MIN_DB`/`UWB_MAX_INPUT_DBM_PER_MHZ`, `uwbInBandDbm` −Infinity-at-0, `DEFAULT_SIX_GHZ_CENTER_MHZ`, `sixGhzChannelNo`, schema bounds/step/optionality, backward-compatible parsing, editor input with `ch N` + clamp-to-schema step-5, the gated overlap note in real EN/ZH, the listed tests, and the untouched lesson-hash fixture) are met by the diff as committed.

## Verdict

Spec: APPROVED
Quality: APPROVED

1. Minor finding: wording of the overlap note includes "at 80 MHz" beyond the brief's illustrative text (`src/ui/i18n.ts:288,312`) — cosmetic, not a violation.
2. Minor finding: `UWB_BAND_MHZ` edges are literal constants rather than derived from `UWB_CHANNEL_MHZ` ± 249.6 (`src/uwb/phy.ts:81-84`) — style-only, values verified correct.
