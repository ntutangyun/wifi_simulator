# Task 1 re-review — Fix round 1 (78aed5d..4299134)

**Brief:** `.superpowers/sdd/2026-09-21-amp-backscatter/task-1-brief.md`
**Findings under verification:** `.superpowers/sdd/2026-09-21-amp-backscatter/task-1-review-report.md`
**Fix report:** `.superpowers/sdd/2026-09-21-amp-backscatter/task-1-report.md` ("Fix round 1" section)
**Diff reviewed:** `.superpowers/sdd/2026-09-21-amp-backscatter/task-1-fix1-review.md` (commit `4299134` only)

## Finding Verdicts

- **Important 1 — i18n parity test didn't cover the two new kinds** — **ADDRESSED**.
  `src/model/frames.ts:15-32` now defines `export const FRAME_KINDS = [...] as const` (23 entries,
  counted by hand: 8 + 5 + 5 + 5) and `export type FrameKind = typeof FRAME_KINDS[number]`, so the
  type can no longer outrun the array. `tests/ui/i18n.test.ts:8` imports `FRAME_KINDS` as `KINDS`
  and adds a guard test (`KINDS.length >= 23`, contains `'ampRfid'`/`'ampBsReply'`, no duplicates).
  `npx vitest run tests/ui/i18n.test.ts` → 7/7 green, confirming every kind (including the six
  UWB/4ab ones the old hand-written list had also missed) has non-empty EN/ZH strings.

- **Important 2 — `ampPpduLayout`'s "still sum to `txTimeNs`" was false for short RFID PPDUs** —
  **ADDRESSED**. `src/model/frameFields.ts:430-440` gives `ampRfid` its own branch (legacy preamble
  + optional `ampWup` + `ampSync` + `ampData` + `ampBst` + optional `signalExt`), reading
  `AMP_BS_DL_SYNC_NS`/`AMP_BS_DL_KBPS` from `ampBs.ts` instead of the Active Tx constants. Hand
  recomputation of the two cases specified:
  - **QueryRep, 1 Mb/s UL, WUP 0** (the case that used to overrun by −92 000 ns): `ampRfidBytes('queryRep')`
    = 5+1+2 = 8 B = 64 bits → `ampBitsNs(64,250)` = 256 000 ns. `bsReplyNs('rn16',1000)` = 24×500 +
    2×8×2×500 = 28 000 ns. `bstNs('rn16',1000)` = max(16 000, round(1.2×16 000 + 1.1×28 000)) =
    50 000 ns. `ampBsDlPpduNs` = 32 000 + 0 + 16 000 + 256 000 + 50 000 + 6 000(ext) = **360 000 ns**,
    matching `tests/engine/amp-bs-model.test.ts:145`. Layout segments: 16 000+4 000+12 000 (preamble)
    + 16 000 (sync) + 256 000 (data) + 50 000 (bst) + `ext = 360 000 − (32 000+0+16 000+256 000+50 000) = 6 000`
    → sum = 360 000. Matches exactly.
  - **Write, 250 kb/s, T3 = 2 ms**: `ampRfidBytes('write')` = 15 B = 120 bits → `ampBitsNs` = 480 000 ns.
    `bsReplyNs('write',250)` = 24×2000 + 5×8×2×2000 = 208 000 ns. `bstNs('write',250,2 000 000)` =
    round(1.1×2 000 000 + 1 000 + 1.1×208 000) = **2 429 800 ns**. `ampBsDlPpduNs` = 32 000+0+16 000+
    480 000+2 429 800+6 000 = **2 963 800 ns**, matching `tests/engine/amp-bs-model.test.ts:142`.
    Layout: preamble 32 000 + sync 16 000 + data 480 000 + bst 2 429 800 + `ext = 2 963 800 −
    2 957 800 = 6 000` → sum = 2 963 800. Matches exactly.
  `tests/model/frameFields.test.ts:167-267` (new) iterates `CMDS = ['query','queryRep','ack','read','write']`
  (5) × `RATES = [250,1000]` (2) × `wupNs ∈ [1_000_000, 2_000_000]` (2) = 20 combinations, each with
  `expect(d.ppdu.reduce((s,x)=>s+x.durNs,0), where).toBe(f.txTimeNs)` — strict `toBe` equality, confirmed.
  `npx vitest run tests/model/frameFields.test.ts` → 18/18 green.

- **Minor 1 — `crc16Epc` reserved-word fold was asserted but never exercised** — **ADDRESSED**.
  `tests/engine/amp-bs-model.test.ts:212-217` adds a dedicated test with two constructed EPCs whose
  *raw* CRC-16-CCITT is 0x0000 and 0xffff respectively (built from the CRC-extension-zeroing
  property of the algorithm, derivation stated in the test's own comment), both asserted to fold to
  `0x5a5a`, plus an ordinary EPC asserted to pass through unfolded (`0x84f9`). Ran
  `npx vitest run tests/engine/amp-bs-model.test.ts` → 16/16 green, so the derivation holds under
  the actual implementation (`src/engine/ampBs.ts:255-263`, CRC-16-CCITT poly 0x1021, init 0xFFFF).

- **Minor 2 — Gen2 field decode was unrequested scope with no test** — **PARTIAL**. New tests exist
  (`tests/model/frameFields.test.ts:224-233`) that call `decodeFrame` for **five** Gen2 commands
  (`query, queryRep, ack, read, write`) and all **four** replies (`rn16, epc, read, write`), pinning
  the `checkSize` invariant for each. However `CMDS` omits `'select'` — `Gen2Cmd` has six members
  (`GEN2_CMD_BYTES` includes `select: 18`) and `select` is never passed through `ampRfidFrame` /
  `decodeFrame` in any test file (`grep select tests/model/frameFields.test.ts` → no hits). The
  `checkSize` throw path for a `select` command decode remains untested. The fix-round report's own
  text ("pin the `checkSize` invariant for all six commands and all four replies") overstates this —
  it is five of six. Not a functional bug (the arithmetic is correct by inspection: 5+18+2=25 =
  `ampRfidBytes('select')`, and `fc(1)+ampId(2)+ampTdc(2)+body(18)+fcs(2)=25`), but the finding's
  literal ask ("all six commands") is not fully met.

- **Minor 3 — RFID id field ignored a configured EPC** — **ADDRESSED**.
  `src/model/frameFields.ts:328-330` now reads `crc16Epc(r.epc ?? epcOf(f.dst))`; `AmpRfidArgs`/
  `AmpInfo.rfid` gained `epc?: string` (`src/engine/ampBs.ts:202-204`, `src/model/frames.ts`).
  `tests/model/frameFields.test.ts:260-266` ("the id field decodes the tag's configured EPC...")
  asserts the configured-EPC id differs from the derived one and that broadcast still shows no id.

- **Minor 4 — "±20 % clock (100 000 ppm, PM-28)" was arithmetically wrong** — **ADDRESSED**.
  `src/engine/ampBs.ts:55-66` now states 100 000 ppm is ±10 %, separates it from the framework's own
  ±20 % T1 window, and says the model applies 1.2/1.1 directly rather than re-deriving them from the
  ppm figure — no false conversion remains.

- **Minor 5 — per-constant SFD attribution the spec doesn't make** — **ADDRESSED**.
  `BST_T1_MARGIN`, `BST_REPLY_MARGIN`, and `BST_DELAYED_SLACK_NS` (`src/engine/ampBs.ts:67-70`) now
  all carry the collective `SFD PM-74, PM-75, PM-86…PM-88 (collective)` tag instead of the
  individually-invented PM-87/PM-88 split; `bstNs`'s doc comment gained the missing PM-75.

- **Minor 6 — only one of two `ampTag` producers stated `mode` explicitly** — **ADDRESSED**.
  `src/course/lessonKit.ts:150` (per `task-1-fix1-review.md` diff) now writes `mode: 'active'` in
  both branches, matching `editor/planOps.newTag`. `npx vitest run tests/engine/lesson-hashes.test.ts`
  → 1/1 green, fixture untouched (`git status` doesn't list it — the field is inert in the engine).

- **Minor 7 — the report's rationale for the custom `expectReachM` disagreed with its own math** —
  **ADDRESSED**. The fix round's item (f) explicitly retracts the "only just inside" claim (0.32754
  is inside `toBeCloseTo(_,3)`'s ±0.0005 by 0.00046) and restates the real reason (±1 mm is "the
  centimetre the lesson quotes"). `tests/engine/amp-bs-model.test.ts:17-19`'s `expectReachM` doc
  comment now reads "to the centimetre they are quoted at (±1 mm)" — no false justification remains
  in the code; the finding was about the stated rationale, which is now corrected.

- **Minor 8 (declined) — `src/ui/laneLayout.ts:326-327` `?? 'query'` / `?? 'rn16'` fallbacks** —
  **NOT ADDRESSED, explicitly declined**. Confirmed unchanged: the two lines still read
  `GEN2_CMD_NAME[f.amp?.rfid?.cmd ?? 'query']` and `GEN2_REPLY_NAME[f.amp?.bs?.reply ?? 'rn16']`.
  The fix report's "Not done" section states the reasoning (consistent with the neighbouring
  `f.amp?.slot ?? 0` style; both fields are non-optional in the real types so the fallback can only
  mask a builder bug) and the original review rated it low priority. Matches what was declined —
  no silent regression here.

## New Breakage in the Fix Diff

None found.
- `npx tsc -b --noEmit` — exit 0, no output (independently re-run; also matches the fix report's claim).
- `npx vitest run tests/model tests/ui/i18n.test.ts tests/engine/amp-bs-model.test.ts tests/engine/lesson-hashes.test.ts`
  — **15 files, 184 tests, 0 failed**.
- The `FrameKind`-from-array refactor doesn't weaken the compiler-forced exhaustiveness the review
  praised: `SUBTYPE: Record<Exclude<FrameKind, 'data' | UwbFrameKind>, string>`
  (`src/model/frameFields.ts:132`) still has exactly the 12 required keys, and `tsc -b` is clean.
- Hand-verified the two `ampPpduLayout` arithmetic cases the task called for (above) — both sum to
  `f.txTimeNs` to the nanosecond, no residual dropped.

## Out-of-Scope Observations

None beyond what's already logged under Minor 2 above (in-scope: it's a partial fix of a listed
finding, not a new issue outside the diff).

## Verdict

**Fix round:** Findings remain open (one).
- **Minor 2 partial**: the Gen2 field decode `checkSize` invariant is now tested for 5 of 6 `Gen2Cmd`
  values — `'select'` is never exercised through `decodeFrame` in any test, and the fix report's
  claim of "all six commands" is inaccurate. Not a functional defect (the byte arithmetic for
  `select` is correct by inspection), but the finding's literal ask is not fully met.

All other findings (Important 1, Important 2, Minors 1, 3, 4, 5, 6, 7) are ADDRESSED with
verified evidence. Minor 8 was explicitly declined, as stated, and remains unchanged with no
silent regression. No new Critical/Important breakage was introduced by the fix diff.
