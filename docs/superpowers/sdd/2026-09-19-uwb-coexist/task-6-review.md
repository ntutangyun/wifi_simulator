# Task 6 review — Guide, glossary, README, editor guide (6 GHz coexistence)

Reviewed: commit 47dd7fb (`docs(uwb): coexistence in the guide, glossary and README`), diff
`d987c3e..47dd7fb`. Ground truth: `src/uwb/phy.ts`, `src/model/scenario.ts`, `src/engine/spectrum.ts`,
`src/engine/channel.ts`, spec `docs/superpowers/specs/2026-09-19-uwb-slices-design.md` Slice 3.

## Findings

### 1. [BLOCKING] Unqualified "CCA never fires on UWB power" contradicts the engine's own CCA path

- Files: `README.md` (new row, "UWB SIR floor under in-band Wi-Fi, −12 dB"); `src/ui/Guide.tsx`
  (new EN paragraph ~L172, new ZH paragraph ~L207); `src/ui/glossary.ts` ("Noise rise" term, `alt.en`
  ~L261 and `def.en`/`def.zh` ~L263–264).
- What: all four places state, unconditionally, that Wi-Fi's CCA/carrier-sense "never" fires on UWB
  power — e.g. README: "Wi-Fi's own CCA never fires on UWB power"; Guide EN: "a UWB frame is far too
  weak to trip CCA"; Guide ZH mirrors it; glossary "Noise rise": "it never crosses a CCA threshold ...
  Wi-Fi's carrier sense never fires from it" (ZH: "永远不会超过 CCA 门限 ... 载波侦听永远不会被它触发").
- Why: this is exactly the drift the task brief calls out to check, and it is real. In
  `src/engine/channel.ts` `updateAllCca` (~L479–488), foreign power from `Spectrum` **is** summed into
  the same energy-detect accumulator that trips CCA_BUSY: `sum += sp.s.foreignMw('wifi', ...)`, then
  `busy = anyPd || sum >= mw(CCA_ED_DBM) || ...` with `CCA_ED_DBM = -62` (`src/engine/phy.ts`). The
  spec (`2026-09-19-uwb-slices-design.md`, Slice 3, "Wi-Fi side") already states the correct, qualified
  claim: "a UWB frame is far below −62 dBm past 30 cm, so this never trips **in the lesson**" — i.e.
  distance-qualified, not a general "never". Working the numbers confirms the qualifier is load-bearing,
  not pedantry: a UWB channel-5 frame's in-band EIRP inside an 80 MHz Wi-Fi channel fully overlapping
  it is `UWB_TX_POWER_DBM (−14) + 10·log10(80/499.2) ≈ −22 dBm`; at `d ≈ 0.2 m` the UWB→Wi-Fi path loss
  (`uwbToWifiPathLossDb`, PL0 ≈ 48.7 dB at channel 5's centre frequency, `UWB_PL_EXP = 2.0`) is only
  `48.7 + 20·log10(0.2) ≈ 34.7 dB`, giving a received power around −57 dBm — **above** `CCA_ED_DBM`
  (−62 dBm) and enough to trip `CCA_BUSY`. So a Wi-Fi radio close enough to a UWB transmitter (well
  within a metre) genuinely can see CCA busy from UWB energy; the docs' blanket "never" is false as
  written, not merely imprecise for corner cases the sim never exercises.
- What to do: qualify every one of these four claims by distance/scenario the way the spec does — e.g.
  "at the lesson's anchor-to-AP distances, UWB power never crosses the −62 dBm CCA_ED energy-detect
  floor" or "past ~30 cm, a UWB frame is too weak to trip CCA" — in README, Guide EN, Guide ZH, and the
  glossary's "Noise rise" term (`alt` and both `def` languages). A test asserting the qualifier is
  present (e.g. `toContain('30 cm')` or similar) would pin it the way the rest of the file pins claims
  against constants.

## Other checks (no issues found)

- Numbers in Guide.tsx/glossary/README all trace to imported constants (`UWB_BAND_MHZ[5/9]`,
  `UWB_SIR_MIN_DB = −12`, `UWB_MAX_INPUT_DBM_PER_MHZ = −45`, `DEFAULT_SIX_GHZ_CENTER_MHZ = 5985`,
  `sixGhzChannelNo`) rather than being retyped; channel-7-default / channel-71-overlap arithmetic
  checked against `sixGhzChannelNo` and `UWB_BAND_MHZ[5]` and is correct.
- Standard/model tags are correct where numbers are stated: −12 dB SIR floor tagged model; −45 dBm/MHz
  tagged standard §16.4.10 (matches `phy.ts` comment); "channel 9 never overlaps a 6 GHz Wi-Fi channel"
  is a frequency-only (not power/distance) claim and is unconditionally true given the schema's
  6 GHz centre range (5955–7115 MHz) vs. `UWB_BAND_MHZ[9]` (7737.6–8236.8 MHz) — no qualifier needed
  there, unlike finding 1.
- README's corrected "Known simplifications" bullet (replacing the stale "no ... coexistence" line)
  now truthfully separates UWB-vs-UWB sensitivity/capture from the cruder Wi-Fi↔UWB coupling model
  (flat spectral density, transmitter's own path-loss law, no adjacent-channel leakage) — matches
  `spectrum.ts`'s header comment and `bandOverlapMhz`'s hard clipping at band edges.
- EditorGuide's new "6 GHz channel" entry (EN/ZH) describes an overlap readout that is genuinely
  implemented (`src/editor/FloorPlanEditor.tsx`, `src/editor/planOps.ts` reference
  overlap/`sixGhzCenterMhz`), not a doc written ahead of the feature.
- EN and ZH bodies say the same thing throughout the new Guide paragraph, EditorGuide entry, and all
  four glossary terms (checked line by line); no content present in one language and missing in the
  other.
- Glossary's "In-band interference" and "Noise rise" terms don't individually wrap "path-loss law" /
  "flat density" in an explicit "(model)" tag, but this matches the file's existing house style (only
  specific disputed numeric values get an inline model/standard tag, e.g. the SIR entry); the model
  framing is already carried at the README row level. Not a defect.
- No `any` or `@ts-ignore` introduced.
- `npx vitest run tests/ui/uwb-guide.test.ts`: 22 passed (19 existing + 3 new), matches the report.
- `npx tsc -b`: clean except pre-existing errors confined to `tests/scratch/**` (the other agent's
  in-flight work, not touched by this task) — no errors in any file this task changed.

## Verdict

Spec: CHANGES REQUIRED
Quality: APPROVED

Findings: 1 blocking, 0 minor.

## Re-review (fix round 1)

Reviewed: `task-6-fix1.diff`, commit 11b6b9d (`fix(docs): CCA and UWB power claim qualified by distance`),
on top of 47dd7fb.

### Verified

- All four places from finding 1 now carry a distance qualifier: README's "UWB SIR floor" row, `Guide.tsx`
  EN and ZH paragraphs, and `glossary.ts`'s "Noise rise" `alt`/`def` in both languages. None states the
  bare "never" any more.
- EN/ZH parity holds for the new text in all four places — same qualifier, same number, same structure,
  checked line by line.
- New test (`tests/ui/uwb-guide.test.ts`, "qualifies 'CCA never fires on UWB power' by distance...")
  asserts `'30 cm'` appears in the Guide (both languages), the glossary "Noise rise" term (`alt` + both
  `def`s), and the README SIR row. `npx vitest run tests/ui/uwb-guide.test.ts`: 23 passed (22 + 1 new).

### 2. [BLOCKING] The "~30 cm" cutoff itself doesn't hold up against the engine's own constants — it appears to reuse UWB channel 9's path-loss constant instead of channel 5's

- Files: `README.md` (SIR-floor row), `src/ui/Guide.tsx` (EN ~L60–61, ZH ~L88–89), `src/ui/glossary.ts`
  ("Noise rise" `alt.en`/`alt.zh`/`def.en`/`def.zh`), `tests/ui/uwb-guide.test.ts` (new test's comment
  block, ~L144–150).
- What: the fix states "past about 30 cm a UWB frame's in-band power falls below the −62 dBm
  energy-detect floor." Recomputing from the engine's own constants (`uwbPl0Db(5)`, `UWB_TX_POWER_DBM`,
  `UWB_PL_EXP`, `CCA_ED_DBM`) for the exact scenario the coexistence lesson uses — an 80 MHz Wi-Fi
  channel (channel 71) sitting fully inside UWB channel 5's band, so overlap = 80 MHz of the UWB
  emission's 499.2 MHz — the true crossover is **≈ 37 cm**, not 30 cm:
  - `inBandDbm = UWB_TX_POWER_DBM + 10·log10(80/499.2) ≈ −21.95 dBm`
  - `uwbPl0Db(5) ≈ 48.69 dB` (channel 5's centre frequency, 6489.6 MHz — the only UWB channel that ever
    overlaps 6 GHz Wi-Fi)
  - At d = 0.30 m: received = −21.95 − (48.69 + 20·log10(0.30)) ≈ **−60.19 dBm**, which is 1.8 dB *above*
    (stronger than) `CCA_ED_DBM = −62 dBm` — i.e. CCA would still trip at exactly 30 cm.
  - At d = 0.37 m: received ≈ −62.01 dBm — this is the actual crossing point.
  - Checked with a plain Node computation against `phy.ts`'s own formulas; see command below.
  - The "30 cm" figure matches almost exactly (0.300 m) if `uwbPl0Db(9) ≈ 50.50 dB` (channel 9's PL0) is
    used instead of channel 5's — but channel 9 never overlaps 6 GHz Wi-Fi at all (per the same README
    row and Guide paragraph), so channel 9's path loss is the wrong constant for this claim. This "30 cm"
    text also already existed verbatim in the design spec (`2026-09-19-uwb-slices-design.md`, Slice 3,
    "Wi-Fi side": "far below −62 dBm past 30 cm"), so the fix faithfully reproduced the spec's number
    rather than re-deriving it — but the coordinator's instruction for this round was explicitly to check
    the arithmetic, and it doesn't hold.
  - Notably, the new test's own inline comment is more careful than the prose it justifies: it says the
    received power at 0.3 m is "≈ −60 dBm — close to CCA_ED_DBM (−62 dBm)" (accurate, hedged), but the
    prose four lines above/below it in the same commit asserts the power has already "fallen below" that
    floor at that same distance — the two statements contradict each other once you compare the numbers.
  - The test itself only asserts the *string* `'30 cm'` appears; it does not compute the crossover from
    `uwbPl0Db`/`CCA_ED_DBM` and assert the claimed distance is actually conservative, so it can't catch
    this.
- Why: this is a quantitative claim advertised as derived from "the engine's constants" (per the
  coordinator's framing of this fix), and it is off by about 7 cm / 1.8 dB in the unsafe direction (the
  stated distance is *inside* the zone where CCA can still trip, not outside it). It doesn't affect any
  currently-pinned lesson number (real anchor/AP separations in the lesson are on the order of metres,
  far past either 30 cm or 37 cm), so it's a documentation-accuracy issue rather than a wrong simulated
  result — but it is exactly the kind of stated-vs-engine-truth drift this review chain exists to catch,
  and the number is wrong on its own terms.
- What to do: either (a) recompute the cutoff from `uwbPl0Db(5)` specifically (channel 5 is the only
  channel this claim is about) and round up/conservatively — e.g. "past about 40 cm" — or (b) drop the
  precise distance and use safely-qualified language that doesn't assert a specific crossover (e.g. "at
  any separation of a metre or more" / "well within a metre"), or (c) tie the number to a computed
  constant with a test that derives it from `uwbPl0Db(5)`, `UWB_TX_POWER_DBM`, `UWB_PL_EXP` and
  `CCA_ED_DBM` rather than a hand-picked round number, so a future constant change can't silently make
  the claim wrong again.
- Repro:
  ```
  node -e "
  const C=299792458;
  const pl0=(f)=>20*Math.log10(4*Math.PI*f/C);
  const inBand=-14+10*Math.log10(80/499.2);
  const rx=(d,p)=>inBand-(p+20*Math.log10(d));
  console.log('PL0 ch5', pl0(6489.6e6), 'PL0 ch9', pl0(7987.2e6));
  console.log('rx at 0.30m (ch5 PL0):', rx(0.30, pl0(6489.6e6)));
  console.log('rx at 0.37m (ch5 PL0):', rx(0.37, pl0(6489.6e6)));
  "
  ```

## Verdict (fix round 1)

Spec: CHANGES REQUIRED
Quality: APPROVED

Findings: 1 blocking, 0 minor.

## Re-review (fix round 2)

Reviewed: `task-6-fix2.diff`, commit caef9db (`fix(docs): the CCA cutoff for UWB power is 37 cm on channel
5, quoted as 40 cm`), on top of 11b6b9d. Ignored the unrelated f893c70 (not present in this diff anyway).

### Verified

- Finding 2 is resolved. All four places (README's SIR-floor row, `Guide.tsx` EN and ZH, `glossary.ts`
  "Noise rise" `alt`/`def` EN and ZH) now say "about 40 cm" instead of "about 30 cm".
- The cutoff is no longer a hand-picked number: the test now computes
  `CCA_UWB_CROSSOVER_M = 10 ** ((uwbInBandDbm(UWB_TX_POWER_DBM, 80) - uwbPl0Db(5) - CCA_ED_DBM) / (10 *
  UWB_PL_EXP))` directly from `src/uwb/phy.ts`'s exported functions/constants and `CCA_ED_DBM` from
  `src/engine/phy.ts`, and asserts it lands between 0.36 and 0.38 m. Re-derived this independently
  (same formula, same constants): crossover ≈ 0.3697 m — inside the asserted range, and correctly uses
  channel 5's `uwbPl0Db` (48.69 dB), not channel 9's (the bug behind fix round 1's "30 cm"). Rounding the
  true 0.367 m crossover *up* to "about 40 cm" is the conservative direction (40 cm > 37 cm, so the
  "falls below the floor past 40 cm" claim now holds with margin — unlike "30 cm", which was on the wrong
  side of the true crossover).
- The old test's illustrative comment (which computed a fixed −60 dBm at a fixed 0.3 m and only said
  "close to" the floor, contradicting the adjacent prose's "falls below") is gone, replaced by a comment
  that derives the number from the same constants the prose now matches — comment and prose no longer
  disagree.
- `npx vitest run tests/ui/uwb-guide.test.ts`: 24 passed (23 + 1 new crossover test).
- EN/ZH parity holds for every changed line (30→40 substitutions only; no other drift introduced).

### No new issues found.

## Verdict (fix round 2)

Spec: APPROVED
Quality: APPROVED

Findings: 0 blocking, 0 minor.
