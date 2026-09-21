# Task 2 review — timestamp noise scales with SNR; RIF start per D5.0

Commit reviewed: `255f459`. Verdict: **NEEDS FIXES**.

Important: 1. Minor: 0.

## Important

1. **Verbatim standard/contribution text pasted in `src/uwb/mms.ts`'s `rifStartMs` JSDoc**, violating the
   binding constraint "no copyrighted standard text (paraphrase and numbers only)". The comment quotes, in
   quotation marks, what is presented as the editor's instruction from comment resolution 15-24/0235r2 /
   proposed clause text 15-23/0371r1 and 15-23/0412r0:

   > a device "may start transmitting a first RIF fragment at RpRifOffset into the ranging phase if no RSF
   > fragments are present, or RpRifOffset after the start of its last RSF fragment transmission otherwise"

   This is a direct quotation of external standards-body text carried into shipped source, not a paraphrase
   with numbers only — exactly what the plan's binding constraints forbid, regardless of whether D5.0 itself
   is balloted or still a contribution. The commit message describing the same rule (paraphrased, no quotation
   marks: "puts the first RIF at RpRifOffset after the start of the last RSF...") is fine and should be the
   model for the code comment. Fix: rewrite the JSDoc to paraphrase the rule (as the commit body already does)
   and keep only the clause/contribution numbers as citation, dropping the quoted sentence. The same quoted
   sentence also appears in `.superpowers/sdd/2026-09-22-uwb-completion/task-2-report.md`; since that file may
   ship with the branch, it should be paraphrased too, though it is lower priority than the source comment.

## Checks that passed

- **Determinism**: `git diff` of `tests/fixtures/uwb-record-hashes.json` touches exactly `uwb-mms` and
  `uwb-mms-numbers`, both moving to the same new hash (`457953c4`, from the same old hash `570d5920`) — i.e.
  one scene, as the commit body and report claim. No other of the 51 keys, and no `lesson-hashes.json` key,
  changed. The draw order is preserved: `device.ts` and `device.mms.ts` still call `gaussian(this.rng)` /
  `gaussian(dev.rng)` in the same place, only the sigma passed in changed from a constant to `tsSigmaNs(...)`.
- **Formula**: `tsNoiseScale` = `sqrt(10**((TS_SNR_REF_DB - snrDb)/10))` clamped `[1, TS_SIGMA_MAX]` —
  algebraically `sqrt(SNR_ref_lin / SNR_lin)`, floored at 1×, capped at 10× (reached exactly at 0 dB). Applied
  identically to both the first and last stamp of an MMS train via one `sigmaNs` computed from the combined
  SNR (`rxDbm + gainDb`) in `device.mms.ts`'s `evaluateTrain`. Every new constant (`UWB_TS_ACCUM_GAIN_DB`,
  `UWB_NOISE_FLOOR_DBM`, `TS_SNR_REF_DB`, `TS_SIGMA_MAX`) is tagged `model`.
- **RIF rule**: `rifStartMs(rsfs, gapMs, index) = rsfs>0 ? rsfs+gapMs-1+index : index` matches (X+Z−1+y) for
  X>0 and gives offset 0 for X=0, as decision 2 requires. All three call sites — `mmsLayout`'s `rp` (phase
  length), `fragmentSlot`, and `slotFragment`'s `firstRif` — now route through this one function; grepped the
  repo for any remaining `x + z - 1` / `gapMs - 1`-style literal and found none outside `rifStartMs` itself.
  The X=0 phase-length case was previously wrong (always added `z - 1 + y` regardless of X) and is now fixed
  consistently with `fragmentSlot`/`slotFragment`.
- **Tests**: `npx vitest run tests/uwb/ts-noise.test.ts` — 9/9 pass. They cover the five behaviours the report
  lists: (1) σ = quoted value at/above 20 dB, (2) exactly 10× at 0 dB plus the shape in between, (3) cap held
  arbitrarily far below 0 dB, (4) the noise-floor/foreign-power arithmetic, (5) the consequence — a two-anchor
  DS-TWR scene (2 m vs 26 m, 300 blocks) where the far anchor's ranges scatter wider. That test uses >200
  delivered samples per anchor with generously bracketed bounds (ratio > 1.1 and < 1.4× the theoretical scale
  factor), which is a real statistical check, not a one-draw coin flip. A further test confirms the pairwise
  MMS lesson variant's trains all combine above the reference (scale exactly 1), which is the reason its
  fixture hash is untouched.
- **i18n**: `uwbTsNoiseHint` (EN/ZH), `Guide.tsx`'s model-numbers paragraph (EN/ZH), and the README row all say
  the same thing — 100 ps quoted at 20 dB SNR, scaling as √(20 dB / SNR), capped at 10× — consistently.
- **tsc/build**: `npx tsc -b --noEmit` clean.
