# Task 1 review: HRP UWB PHY constants, frame sizes and SP1 airtime

Reviewed: `src/uwb/phy.ts`, `tests/uwb/phy.test.ts` (commit `04e0b1e`) against
`task-1-brief.md`.

## Verification performed

- `npx vitest run tests/uwb/phy.test.ts` → 1 file, 14/14 tests pass.
- `npx tsc -b` → clean, no errors.
- Manually re-derived every constant and every `it.each` airtime row
  (14/20/24/30/39/60 octets → 181218/187372/191474/197628/206859/234551 ns)
  from first principles (chip rate, SHR/STS/PHR chip counts, RS(63,55) block
  count, `chipsToNs` rounding) — all match.
- Manually re-derived `uwbPl0Db(5)` = 48.696 dB, `uwbPl0Db(9)` = 50.498 dB,
  and `fomDecode`/`fomText` bit-field extraction for `0x16` → `97 % within
  0.5 ns` and `0x7b` → `75 % within 12 ns` — all match.
- Confirmed `Material` (`'drywall' | 'brick' | 'glass'`) and `Ns` (`number`)
  are exported from `src/model/scenario.ts` / `src/model/types.ts` as
  imported.
- Confirmed the one changed test value (`60 → 234_551` instead of the
  brief's `228_397`) is the controller-preapproved correction; the diff
  carries an explanatory comment pointing at `task-1-report.md`.
- Grepped the diff for `any` and `@ts-ignore` — none found.

## Spec compliance (A)

Every export name, type, function signature and constant value in
`src/uwb/phy.ts` matches the brief's interface block exactly: all 39 named
constants/consts-groups, `UwbChannelNo`, `UWB_CHANNEL_MHZ`, and all nine
functions (`psduSymbols`, `uwbPpduChips`, `chipsToNs`, `uwbPpduNs`,
`uwbPl0Db`, `rdmIeBytes`, `rmiFinalIeBytes`, `uwbPollBytes`, `uwbRespBytes`,
`uwbFinalBytes`, `fomDecode`, `fomText`) implement the brief's formulas
literally, verified both by re-derivation and by the test run. The test
file is the brief's Step-1 file verbatim except for the single
pre-approved airtime correction. Source-tag comments are present on every
constant and match the brief's tags where the brief gave one; where the
brief left a derived/computed constant untagged (e.g. `UWB_SHR_CHIPS`,
`UWB_RMARKER_NS`, `UWB_STS_CHIPS`, `UWB_PHR_CHIPS`), the implementation
matches that (untagged, value-comment only) pattern rather than inventing
a tag — consistent with the brief.

No missing exports, no extra/renamed exports, no signature drift.

## Code quality (B)

Clean, readable, no dead code, no `any`/`@ts-ignore`. Two cosmetic
(non-blocking) observations:

1. `src/uwb/phy.ts:77-79` and `:80-82` — the brief expressed
   `UWB_MHR_BYTES`/`UWB_FCS_BYTES`/`UWB_IE_HDR_BYTES` (and separately
   `ARC_IE_BYTES`/`RRMC_IE_BYTES`/`RRTI_IE_BYTES`) as one combined
   declaration with one shared trailing comment. The implementer split
   each into its own `export const` line but copied the *same* shared
   comment onto all three in each group verbatim (e.g. all three IE-size
   constants say "model sizing from the IE field lists"). This is
   harmless and matches the brief's intent, but on its own each line now
   reads as if that generic text specifically justifies that one value.
   Severity: minor. Optional: fold back into one combined declaration per
   the brief's literal formatting, or make each comment specific to its
   constant.
2. `src/uwb/phy.ts:86-104` (`rdmIeBytes`, `rmiFinalIeBytes`,
   `uwbPollBytes`, `uwbFinalBytes`) hardcode their multipliers (3, 6, 3,
   12) as literals rather than referencing the same-valued named constants
   declared just above (`RRTI_IE_BYTES = 6`, `RMI_FINAL_ENTRY_BYTES = 6`,
   etc.). This matches the brief's literal formulas exactly (spec-correct)
   and the named constants are plausibly meant for a later task's frame
   encoding, so this is not a fault of this task — noting only as a
   forward-looking maintainability observation, not a required change.
   Severity: minor / informational.

Test quality: assertions use concrete literal expected values (not
formulas re-evaluating the code under test), except the brief's own
`psduSymbols(42)).toBe(8 * 42 + 96 + 2)` line, which is inherited verbatim
from the brief's mandated test file and is a hardcoded literal expression
(434) rather than a call back into implementation constants — not a
tautology, not introduced by the implementer.

## Verdict

Spec: APPROVED
Quality: APPROVED

### Findings

1. `src/uwb/phy.ts:77-82` — Shared brief comment duplicated verbatim
   across three split-out constants (`UWB_MHR_BYTES`, `UWB_FCS_BYTES`,
   `UWB_IE_HDR_BYTES`, and separately `ARC_IE_BYTES`, `RRMC_IE_BYTES`,
   `RRTI_IE_BYTES`) reads as per-constant justification but is generic.
   Why it matters: mild reduction in comment precision when scanning the
   file for why one field is a given size. What to do: optionally
   recombine into the brief's single grouped declaration, or add a
   constant-specific clause. Severity: minor.
2. `src/uwb/phy.ts:87,91,95,103` — Frame-size helper functions hardcode
   multipliers that duplicate values already named as exported constants
   (e.g. `RMI_FINAL_ENTRY_BYTES`) instead of referencing them. Why it
   matters: future edits to the named constant would silently desync from
   the formula. What to do: no action required for this task (matches
   brief's literal formulas); flag for whichever later task wires these
   constants into actual frame builders, to consider deriving the totals
   from the constants instead of parallel literals. Severity: minor /
   informational, non-blocking.

Findings: 0 blocking, 2 minor.
