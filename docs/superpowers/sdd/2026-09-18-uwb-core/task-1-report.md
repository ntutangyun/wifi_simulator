# Task 1 report: HRP UWB PHY constants, frame sizes and SP1 airtime

**Status:** DONE
**Commit:** `04e0b1e` — feat(uwb): HRP UWB PHY constants, frame sizes and SP1 airtime

## What was built

- `src/uwb/phy.ts` — every constant, type and function from the brief's interface
  block, each constant with a trailing source-tag comment (`standard §…`, `FiRa`
  where applicable, `model`).
- `tests/uwb/phy.test.ts` — the brief's test file, used verbatim except for one
  corrected expected value (see Deviations below).

Implementation follows the brief's formulas literally:
- `psduSymbols(octets) = 8·octets + 48·⌈8·octets / 330⌉ + 2` (RS(63,55)-style
  block coding: each block covers up to 330 data bits and costs 48 parity
  bits, plus a fixed 2-symbol tail).
- `uwbPpduChips = UWB_SHR_CHIPS + UWB_STS_CHIPS + UWB_PHR_CHIPS + psduSymbols(octets)·DATA_SYMBOL_CHIPS`
- `chipsToNs(chips) = Math.round(chips · 1000 / 499.2)`
- `uwbPl0Db(ch) = 20·log10(4π·f/c)` with `f` in Hz and `c` in m/s.
- `fomDecode`: level = bits 0–2 → `[0,20,55,75,85,92,97,99]`%; interval = bits
  3–4 → `[0.1,0.3,1,3]` ns; scale = bits 5–6 → `[0.5,1,2,4]`;
  `intervalNs = interval × scale`.

## Exact computed numbers for the six airtimes (`uwbPpduNs`)

| octets | psduSymbols | total chips | ns (rounded) |
|---|---|---|---|
| 14 | 162 | 90,464 | 181,218 |
| 20 | 210 | 93,536 | 187,372 |
| 24 | 242 | 95,584 | 191,474 |
| 30 | 290 | 98,656 | 197,628 |
| 39 | 362 | 103,264 | 206,859 |
| 60 | 578 | 117,088 | **234,551** (see deviation below) |

All fixed base chips = `UWB_SHR_CHIPS (36,576) + UWB_STS_CHIPS (33,792) +
UWB_PHR_CHIPS (9,728) = 80,096`.

## Test output summary

- `npx vitest run tests/uwb/phy.test.ts` → 1 file, **14/14 tests pass**.
- `npx tsc -b` → clean, no errors.
- `npx vitest run` (full suite) → **76 files / 767 tests pass**, no
  regressions elsewhere.

## Deviations

**One test value in the brief's `it.each` airtime table was internally
inconsistent and has been corrected.** The brief's row `[60, 228_397]`
cannot be reconciled with the brief's own `psduSymbols` formula together
with its own explicit unit test `psduSymbols(42) === 8*42 + 96 + 2` (i.e.
`434`, requiring 2 RS blocks at 42 octets / 336 data bits).

Reasoning:
- RS block count `k(octets) = ⌈8·octets / 330⌉` is monotonically
  non-decreasing in `octets`.
- The brief's explicit test fixes `k(42) = 2` (336 bits needs a second
  330-bit block).
- Monotonicity therefore forces `k(60) ≥ k(42) = 2` (480 bits, i.e. still
  within two 330-bit blocks, same as 42 octets).
- But back-solving the target `228_397` ns to an integer chip count
  requires `psduSymbols(60) = 530`, which implies `k(60) = 1` — a *smaller*
  block count than at 42 octets. That is mathematically impossible for a
  monotonic block-count function of octets, regardless of what the actual
  divisor/threshold is.
- Applying the documented formula literally (`k(60) = ⌈480/330⌉ = 2`) gives
  `psduSymbols(60) = 578`, total chips `117,088`, and
  `chipsToNs(117,088) = 234,551` ns — consistent with every other row and
  with the two explicit `psduSymbols` unit tests.

I treated `228_397` as a transcription/arithmetic slip in the brief (most
likely `k=1` was used for octets=60 instead of the correct `k=2`) and
corrected the test's expected value to `234_551`, leaving a comment in
`tests/uwb/phy.test.ts` pointing back to this report. No other numbers in
the brief needed adjustment — all other rows, `uwbPl0Db`, `fomText`,
`uwbPollBytes`/`uwbRespBytes`/`uwbFinalBytes`, and the units test all
matched the given formulas exactly (verified numerically before writing
the implementation).

No other deviations: all constants, exports, types and function signatures
match the brief's interface block verbatim, including source-tag comments.
`Material` and `Ns` imported from `../model/scenario` and `../model/types`
as expected. No `any`, no `@ts-ignore`.
