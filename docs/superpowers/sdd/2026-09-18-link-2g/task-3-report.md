# Task 3 report: WifiMac runs on a `PhyTiming`

## What was implemented

- `src/engine/mac.ts`: `WifiMacCfg` gained an optional `timing?: PhyTiming` field (default: `OFDM_5G`). The class now holds `private readonly T: PhyTiming`, set to `cfg.timing ?? OFDM_5G` as the constructor's first statement. Two new private helpers next to `exchangeNs`:
  - `airNs(bytes, mbps)` = `txTimeNs(bytes, mbps) + this.T.signalExtNs`
  - `airModeNs(mode, bytes, mcs, opts?)` = `txTimeModeNs(mode, bytes, mcs, opts) + this.T.signalExtNs`

  Every module-constant use (`SIFS_NS`, `SLOT_NS`, `DIFS_NS`, `EIFS_NS`, `ACK_TIMEOUT_NS`, `CTS_TIMEOUT_NS`, `RX_START_DELAY_NS`) was replaced with the corresponding `this.T.*` field, and every direct `txTimeNs(...)` / `txTimeModeNs(...)` call site was replaced with `this.airNs(...)` / `this.airModeNs(...)`, except the two `maxPsduBytesFor` budget calls (transmitTrigger's UL-size estimate and respondToTrigger's TB-PPDU budget), whose duration argument now subtracts `this.T.signalExtNs` before budgeting, since the extension is a no-transmission tail, not payload time. Now-unused imports (`SIFS_NS`, `SLOT_NS`, `DIFS_NS`, `EIFS_NS`, `ACK_TIMEOUT_NS`, `CTS_TIMEOUT_NS`, `RX_START_DELAY_NS`) were dropped; `OFDM_5G`, `type PhyTiming`, `type TxTimeOpts` were added.

- `tests/engine/helpers.ts`: `makeBss` options gained `timing?: PhyTiming` (imported from `../../src/engine/phy`), threaded into the `DcfMac` cfg.

- `tests/engine/link-2g.test.ts`: appended the brief's `describe('a MAC on the 2.4 GHz link', ...)` block (4 tests) to the existing Task 2 tests (kept unchanged).

## Premise check / deviation

The brief's own EIFS sub-test premise (54 Mb/s frame at −80 dBm failing as `lowSinr`) held exactly as written — no RSSI adjustment was needed. Verified by hand: `sinrThreshDb(54) ≈ 26 dB`; actual SINR at −80 dBm against the −93.99 dBm noise floor (`NOISE_FIGURE_DB = 7`) is ≈ 14 dB, well under threshold, and −80 ≥ −82 so the preamble still locks. `RX_FAIL` with `reason: 'lowSinr'` fires as expected.

One genuine premise error was found and fixed in the second sub-test ("the ACK follows one 10 µs SIFS..."): the brief's comment assumed the ACK is sent at 6 Mb/s (`44_000 + 6_000`), but with both links at −50 dBm the data frame is sent at 54 Mb/s, and `ctrlRespRateForMode` (§10.6: highest mandatory rate ≤ the eliciting frame's rate) picks 24 Mb/s for the response, not 6 Mb/s — confirmed independently by the pre-existing `tests/course/tier1-frame-anatomy.test.ts:156` (`expect(ack.frame.txTimeNs).toBe(28_000)` for a 24 Mb/s ACK on 5 GHz). I corrected the expected value to `28_000 + 6_000` (34,000 ns) with a comment explaining the real rate-selection path, rather than weakening the assertion or arbitrarily changing the RSSI to force 6 Mb/s. All other numeric assertions in the appended tests are exactly as the brief specified and passed as written.

## TDD evidence

**RED** — `npx vitest run tests/engine/link-2g.test.ts` (after Step 1, before touching `mac.ts`/`helpers.ts`):
```
✗ waits DIFS = 28 µs ... → expected 232000 to be 238000
✗ the ACK follows one 10 µs SIFS ... → expected 16000 to be 10000
✗ a lost ACK times out after 39 µs ... → expected 45000 to be 39000
✗ after a reception that failed to decode ... → expected 94000 to be 88000
Test Files  1 failed (1)
     Tests  4 failed | 3 passed (7)
```
Failures are exactly as expected: `makeBss` ignored `timing`, so the MAC still ran 5 GHz DIFS/EIFS/AckTimeout values with no signal extension.

**GREEN** — `npx vitest run tests/engine/link-2g.test.ts` (after Steps 3–4 and the ACK-rate test fix):
```
✓ tests/engine/link-2g.test.ts (7 tests) 25ms
Test Files  1 passed (1)
     Tests  7 passed (7)
```

## Suites run before committing

`npx vitest run tests/engine tests/course tests/model`:
```
Test Files  59 passed (59)
     Tests  534 passed (534)
```
Includes `tests/engine/lesson-hashes.test.ts` passing unchanged — confirms the default (5 GHz) timing produces bit-identical timelines to before the refactor.

`npx tsc -b`: no new errors introduced. Pre-existing errors in `tests/engine/lesson-hashes.test.ts` (`Cannot find module 'node:fs'`, `__dirname`, `process` — missing `@types/node` for that file) exist identically on the pre-Task-3 commit (verified by stashing my changes and re-running `tsc -b`), so they are out of scope for this task.

## Files changed

- `D:\wifi_sim\.claude\worktrees\feat-link-2g\src\engine\mac.ts`
- `D:\wifi_sim\.claude\worktrees\feat-link-2g\tests\engine\helpers.ts`
- `D:\wifi_sim\.claude\worktrees\feat-link-2g\tests\engine\link-2g.test.ts`

## Self-review

- `grep -n '\bSIFS_NS\b\|\bSLOT_NS\b\|\bDIFS_NS\b\|\bEIFS_NS\b\|\bACK_TIMEOUT_NS\b\|\bCTS_TIMEOUT_NS\b\|\bRX_START_DELAY_NS\b' src/engine/mac.ts` → no matches.
- `grep -n 'txTimeNs(\|txTimeModeNs(\|maxPsduBytesFor(' src/engine/mac.ts` → only:
  - line 146: `maxPsduBytesFor` function definition (unchanged)
  - line 573: `airNs`'s own body (`txTimeNs(bytes, mbps) + this.T.signalExtNs`)
  - line 578: `airModeNs`'s own body (`txTimeModeNs(mode, bytes, mcs, opts) + this.T.signalExtNs`)
  - line 815: `maxPsduBytesFor(mode, mcs, frac, 2_000_000 - this.T.signalExtNs, ulWidth, nss)` (transmitTrigger budget, extension excluded)
  - line 1299: `maxPsduBytesFor(mode, mcs, frac, dur - this.T.signalExtNs, width, nss)` (respondToTrigger budget, extension excluded)
- Test output is pristine (no console noise, no unhandled warnings) across both the targeted file and the full suite run.

## Concerns

None. The refactor is a faithful, mechanical replacement per the brief's line-by-line list (verified against a fresh grep rather than the brief's stale line numbers, which had drifted by a few lines after the helper insertions — content matched in every case). The one deviation (fixing the ACK-rate premise error in the test) is documented above with independent corroboration from an existing passing test.

## Commit

`1436d91` — `refactor(mac): per-link PhyTiming and signal extension in every airtime`
