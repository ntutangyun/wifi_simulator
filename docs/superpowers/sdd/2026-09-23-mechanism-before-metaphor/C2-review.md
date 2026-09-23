# C2 review — width, streams, rate, rate-fallback (+ C3 re-check: ofdma-ul)

Reviewed read-only against `batch-brief.md` and the "Amendment, 2026-09-23 —
mechanism before metaphor" section of
`docs/superpowers/specs/2026-09-21-course-readability-design.md`. No files
edited.

## 1. Is the procedure the engine's procedure?

**width** (`src/course/tier2/width.ts`, `numbers` steps block): checked
against `noiseDbm` and `mcsForRssi`/`reqSinrDb`/`toneRatio`/`txTimeModeNs` in
`src/engine/phy.ts`. Every step is a step the code takes, in the code's order,
with its constants:
- `noiseDbm(20)` = −93.99 dBm, +3.01 dB/doubling — matches `KTB_DBM_PER_HZ +
  10·log10(width) + NOISE_FIGURE_DB`.
- SNR = RSSI − noise floor; rung chosen by `snr >= reqSinrDb + RATE_MARGIN_DB`
  (`mcsForRssi`), and `reqSinrDb` takes no width argument, matching "a rung's
  requirement never depends on the width."
- Bits/symbol = `ndbps[mcs] × toneRatio(mode, width)`; symbols = `ceil((16 +
  8·bytes + 6) / ndbps)`; airtime = `preambleNs + symNs·nsym` = 48 µs + 13.6 µs
  × symbols for `eht`. All match `txTimeModeNs` exactly.
- Worked-example arithmetic (RSSI −70.51 dBm, 80/160 MHz rows) recomputed by
  hand from the constants above: every cell (−87.97, −84.96, 17.46, 14.45,
  13.99+3=16.99, 16.99+3=19.99, 8.99+3=11.99, 11.99+3=14.99, 351×4.19=1470,
  117×8.38=980, 9, 13, 170.4 µs, 224.8 µs) checks out.

**streams** (`negotiatedNss`/`nssOf` in `src/model/caps.ts`, `nss` factor in
`txTimeModeNs`): the link takes `Math.min(nssOf(a), nssOf(b))`; the rung
selection step correctly notes `nss` is not an input to `mcsForRssi`; bits/
symbol multiplies by `nss` exactly as coded. Worked numbers (129.6/88.8/75.2 µs
for 1/2/4 streams, 88.8 µs for Router4·Phone2, 61.6 µs for 160 MHz·4 streams)
recomputed and correct.

**rate** (`RateControl` in `src/engine/rate.ts`, call site in
`simulation.ts`): the five steps match `mcsFor` (clamp to ceiling),
`onFailure`/`onSuccess` (counter reset, `FAILURES_TO_STEP_DOWN = 2`,
`SUCCESSES_TO_STEP_UP = 10`, clamped to `[0, ceiling]`) in the order and with
the constants the code uses. Worked table (RSSI −75.46, SNR 18.53, ceiling
MCS 2, attempts 192/193/194) recomputed against `buildLinkTable` and
`reqSinrDb`/`RATE_MARGIN_DB` and matches; also directly pinned in
`tests/course/rate.test.ts` ("step 1" through "step 5" tests).

**rate-fallback** (`picture` steps, same engine functions): five steps match
`ACK_TIMEOUT_NS = 45 µs`, the same fail/succeed counter logic. No engine
disagreement found.

No Important findings under item 1.

## 2. C2's engine finding (near station stuck at MCS 11)

Verified directly in `src/engine/simulation.ts:242-249`: `mcsForPeer` sets
`cap = 11` when `mode === 'eht' && !negotiated(n, peerCfg, 'qam4k')`, and
`rateScenario` (`src/course/wifiScenes.ts:122-123`) gives all nodes
`feats = { edca: true }` only — no `qam4k`. So the cap is capability-driven,
not signal-driven. `rate.ts`'s sentence — "That rung is not where its signal
runs out — 58.7 dB would carry the top rung — but where the two ends' agreed
capabilities stop" — is correct and is pinned in
`tests/course/rate.test.ts` ("MCS 11 is where the agreed capabilities stop,
not where the signal does": `mcsForRssi('eht', rssi, 11, 20) === 11` vs.
`mcsForRssi('eht', rssi, 13, 20) === 13`, and RSSI−noise = 58.7 dB). Confirmed
correct, not an Important finding.

## 3. rate-fallback's failure-rate correction

Current text (numbers table + `deeper`) states 11.1% / 11.8% / 11.1% failure
per attempt across MCS 2/1/0, counted over all 337 real failures (254
ACK-timeout + 83 mid-reception retries), explicitly framed as flat, not
falling with frame length ("the per-attempt failure rate barely moves... and
the longest frames of all are not the worst off"). No trace of the old
"loss falls with frame length" claim or of counting only the 254 ACK
timeouts — `grep` for the old phrasing found nothing, and
`tests/course/rate-fallback.test.ts` pins both the flat rates and the 254/83
split. Correction holds.

## 4. Beginner read, both languages

Read `width`, `streams`, `rate`, `rate-fallback` end to end via
`scripts/lesson-dump.ts <id> en|zh`. No sentence stopped comprehension; no
sentence points at an unnamed quantity on the main path. 这笔账 is gone from
`width`; it is replaced by the "What a width actually changes, step by step"
block plus the "living-room laptop... run through the steps" table, which
does the arithmetic in the open (RSSI, noise floor, SNR, per-rung requirement,
bits/symbol, symbols, airtime) rather than gesturing at it. `margin`/余量 is
glossed in the prerequisite `decode-thresholds` (needed by `width` and
`rate`); `noise floor`/噪声地板 is glossed fresh in `width`. Chinese reads as
written Chinese, not translated English — no pointer phrases found (这笔账 /
留在手里 / 不含余量的那个要求 / 之类 all absent from the four lessons' main
paths).

Minor, non-blocking observation: `width` step 2 says "thermal noise across
that bandwidth plus the receiver's noise figure" — "noise figure" is not one
of the four quantities the amendment requires glossing (margin/sensitivity/
threshold/noise floor) and is not itself defined in this lesson or an earlier
one. It doesn't block comprehension (the resulting numbers are given directly
and the reader is never asked to compute with "noise figure" itself), so this
is not written up as a numbered finding.

## 5. C3 re-check: ofdma-ul

Both claims verified:
- "an instruction this simulator writes into the frame but does not act on"
  appears in the picture's steps block (power-correction item) and is
  elaborated in `deeper` ("this simulator dictates the slice, the length, the
  rung and the width but not that correction: its uploaders answer at the
  power they always use").
- "16,894 bytes per uploader = eleven whole frames plus 531 bytes of padding"
  is pinned directly against the engine in
  `tests/course/ofdma-ul.test.ts` ("step 6"): `ampduPsduBytes(11×1500) ===
  16_894`, a 12th frame would exceed the 17,425 B budget from
  `maxPsduBytesFor('he', 11, 0.5, 2ms, 20, 1)`, and `17_425 − 16_894 === 531`.
  `grep` for "fill to the byte" / "nothing wasted" / 一点没浪费 across
  `src/course` and `tests/course` returns nothing — the old claim is gone.

## 6. Rules and pins

`MECHANISM_INCLUDE=width,streams,rate,rate-fallback,ofdma-ul npx vitest run
tests/course/readability.test.ts` → 914/914 pass. The backspace-byte bug
C2 flagged (`\x08` where `\b` was meant) is already fixed on this branch — the
`/\brouters?\b/i` and `/\bAP\b/` rules fire correctly — and the AP-in-brackets
conflict C2 flagged has already been resolved: the test strips
`接入点（AP）`-shaped spans before checking for a bare `AP`, exactly as C2's
suggested fix implied. `width`/`streams`/`rate`/`rate-fallback` all pass
cleanly.

Ran the five lesson test files plus the full `tests/course` suite:
`npx vitest run tests/course/rate.test.ts tests/course/rate-fallback.test.ts
tests/course/width.test.ts tests/course/streams.test.ts
tests/course/ofdma-ul.test.ts` → 99/99 pass. Full `tests/course` → 58 files,
2197 tests, all pass (no red anywhere at review time, including
mlo/capstone/bianchi, which have since been fixed by other implementers).
`npx tsc -b --noEmit` → clean.

Diffed `tests/course/width.test.ts`, `streams.test.ts`, `rate.test.ts`,
`rate-fallback.test.ts` against their pre-eb143fa state: the only removed
lines are `proseMax` budget arguments (raised per lesson, as reported) and one
renamed test in `rate-fallback.test.ts` ("the four steps reproduce the run...”
→ "the steps reproduce the run... all 3,003 of them", same assertion body,
updated for five steps instead of four). No pin was dropped. New pins
(`mcsForRssi`, `ampduPsduBytes`, `buildLinkTable`, `reqSinrDb`,
`RATE_MARGIN_DB`, `negotiated(...,'qam4k')`, `nssOf`/`negotiatedNss`) are all
derivations against engine functions, not constants copied from prose.

## Verdict

No Important findings, no Minor findings.
