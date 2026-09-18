# Task 3 report: Channel — radio kinds, AMP detection and decode thresholds

## What

Implemented the brief's rules in `src/engine/channel.ts`:

- New exported `RadioOpts` interface (`kind?: 'wifi' | 'tag'`, `ampCapable?: boolean`, `floorDbm?: number`, `cca?: boolean`).
- `RadioState` gained `kind`, `ampCapable`, `floorDbm`, `cca`, filled by `register(nodeId, listener, opts = {})` with the brief's defaults (`'wifi'`, `false`, `AMP_TAG_DL_SENS_DBM`, `true`) — so a bare `register(id, listener)` call reproduces today's behaviour exactly.
- New module function `ampNoiseBwMhz(frame)`: `AMP_UL_BW_MHZ[kbps]` for AMP UL frames, else `frame.widthMhz ?? 20`. Used in `detectOrMiss` and `interferenceMw` in place of the old inline `frame.widthMhz ?? 20`.
- New module function `detectFloorDbm(r, frame)`: the three-way rule from the brief (UL AMP → `ampCapable ? ampUlSensDbm(kbps) : null`; DL AMP → tag uses `r.floorDbm`, else `CCA_PD_DBM`; plain Wi-Fi → `null` for tags, else `CCA_PD_DBM`). Both `p >= CCA_PD_DBM` gates in `applyOneTx` now read `floor = detectFloorDbm(r, tx.frame)` once and test `floor !== null && p >= floor`.
- `decodeThreshDb(frame, rid, r)` gained the `RadioState` parameter (now module-private, still called only from `endTx`, which passes its own `r`). AMP UL → `AMP_UL_REQ_SINR_DB[kbps]`; AMP DL → tag: `AMP_DL_REQ_SINR_DB`, Wi-Fi: `sinrThreshDb(6)` (L-SIG-equivalent legacy-preamble decode); all other frames unchanged.
- `captureWindowNs(frame)` gained the two AMP cases ahead of the existing PHY-mode lookup: DL → `AMP_LEGACY_PREAMBLE_NS + AMP_DL_SYNC_NS`; UL → `AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[kbps]`.
- `updateAllCca`: `if (!r.cca) continue` skips tags (and any radio explicitly opted out) entirely — no CCA_BUSY/CCA_IDLE records, no listener calls, `ccaBusy` frozen at its initial `false`. The `anyPd` preamble-detect condition now also requires `a.frame.amp?.dir !== 'ul'`, since an AMP UL PPDU sits below a Wi-Fi radio's PD floor and can only ever register as raw energy.

No other files were touched — `src/engine/amp.ts` (Task 1) and `src/model/frames.ts`'s `AmpInfo`/`FrameDesc.amp` were already in place and needed no changes.

## TDD evidence

1. Wrote `tests/engine/amp-collision.test.ts` verbatim from the brief (5 tests: tag decodes DL above floor / never Wi-Fi; tag below floor never hears; AP decodes UL down to −94 dBm at 250 kb/s, plain Wi-Fi station cannot; two tags collide, 5 dB-stronger one captures; an Ack is decoded by every tag in range).
2. Ran it against the pre-Task-3 `channel.ts` (before any of the edits below): all 5 failed, with `decodeThreshDb` falling through to `sinrThreshDb(0.25)` → `Error: unknown OFDM rate 0.25 Mbps` (AMP frames carry `mbps: kbps/1000`, which isn't a real 802.11 rate) — confirms the tests exercise code paths that don't exist yet, not just typos.
3. Implemented the changes described above.
4. Re-ran `npx vitest run tests/engine/amp-collision.test.ts` → **5/5 pass**, first try, no numeric-premise adjustments needed — the brief's dB margins matched the engine's actual thresholds (in particular the 10 µs-inside-48 µs-sync capture scenario: `a` at −55 dBm vs `b`'s lock at −70 dBm is 15 dB ≥ `CAPTURE_MARGIN_DB` (5), and `10_000 ns < captureWindowNs` = `48 * 1000 = 48_000 ns`; then `detectOrMiss` for `a` sees SINR ≈ 15 dB ≥ `PREAMBLE_DETECT_SINR_DB` (4)).
5. Ran the full `tests/engine` suite → **40 files / 240 tests pass**, including `lesson-hashes.test.ts` (66 scenario hashes unchanged) and the pre-existing `amp-phy.test.ts` (Task 1/2's tests).
6. `npx tsc -b` → clean, no output.

## Suites run

- `npx vitest run tests/engine/amp-collision.test.ts` — 5/5 pass.
- `npx vitest run tests/engine` — 40 files, 240 tests, all pass (13.57 s).
- `npx tsc -b` — clean.

## Files changed

- `D:\wifi_sim\.claude\worktrees\feat-link-2g\src\engine\channel.ts` — the implementation described above (67 insertions, 10 deletions).
- `D:\wifi_sim\.claude\worktrees\feat-link-2g\tests\engine\amp-collision.test.ts` — new, verbatim from the brief.

Commit: `31fff73` "feat(channel): radio kinds and AMP OOK detection/decoding" on `feat/amp-active-tx`.

## Self-review

- **Defaults reproduce old behaviour**: `register(id, listener)` with no `opts` yields `kind: 'wifi', ampCapable: false, floorDbm: AMP_TAG_DL_SENS_DBM, cca: true` — `detectFloorDbm` then returns `CCA_PD_DBM` for every non-AMP frame and `null` for AMP UL frames (unreachable for a pure-Wi-Fi scenario with no AMP frames on the channel), `decodeThreshDb` falls through to the untouched original logic, `captureWindowNs` falls through to the untouched `PHY_MODES[...]` lookup, and `updateAllCca`'s new `!r.cca` guard is always false. The full pre-existing `tests/engine` suite (240 tests, including the 66-hash lesson fixture) stayed green with zero changes to any other file, confirming this bit-for-bit.
- **Every AMP rule in the brief's table is implemented**: verified line-by-line against the brief's "Rules" and "Step 3" sections — `detectFloorDbm`, `decodeThreshDb`, `captureWindowNs`, `ampNoiseBwMhz`, the two `applyOneTx` gates, `interferenceMw`/`detectOrMiss` noise bandwidth, and `updateAllCca`'s `cca` skip and `anyPd` UL exclusion all match verbatim.
- **Tags emit no CCA records**: enforced structurally by `if (!r.cca) continue` at the top of `updateAllCca`'s loop — a tag registered with `cca: false` is never visited, so `r.ccaBusy` never changes from its initial `false` and neither `CCA_BUSY`/`CCA_IDLE` emits nor `onCcaBusy`/`onCcaIdle` listener calls ever fire for it. Test 1 asserts this directly (`records.some(r => r.type === 'CCA_BUSY' && r.node === 'tag')` is `false` even while the AP is transmitting a CTS the tag can't decode).
- **Test output pristine**: both targeted and full-suite runs show only the vitest summary tables (test names all `✓`) with no console warnings/errors beyond the expected Windows CRLF `git add` notice at commit time (unrelated to test execution).

## Concerns

None. All numeric premises in the brief's tests held with the engine's actual thresholds and constants; no assertion needed adjustment.
