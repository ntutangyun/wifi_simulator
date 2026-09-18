# Task 1 report: `amp.ts` — constants, airtimes, sizes, frame builders

## What was done

Created `src/engine/amp.ts` (IEEE P802.11bp Ambient Power, Active Tx mode) with:
- Constants: `AMP_SIFS_NS`, `AMP_LEGACY_PREAMBLE_NS`, `AMP_DL_SYNC_NS`, `AMP_DL_SIG_BYTES`,
  `AMP_PADDING_NS`, `AMP_PADDING_PROTECTED_NS`, `AMP_UL_SYNC_CHIPS`, `AMP_UL_CHIP_NS`,
  `AMP_HDR_BYTES`, `AMP_FCS_BYTES`, `AMP_ACK_BYTES`, `AMP_TRIGGER_BODY_BYTES`,
  `AMP_STA_ID_BYTES`, `AMP_READING_BYTES`, `AMP_DL_REQ_SINR_DB`, `AMP_TAG_DL_SENS_DBM`,
  `AMP_UL_REQ_SINR_DB`, `AMP_UL_BW_MHZ`, plus `AMP_BROADCAST = '*amp'` (not in the brief's
  interface list but needed so `ampTriggerFrame`'s `dst` literal isn't duplicated ad hoc).
- Functions: `ampUlSensDbm`, `ampBitsNs`, `ampDlPpduNs`, `ampUlPpduNs`, `ampTriggerBytes`,
  `ampRespBytes`, `ampId16`, `ampTriggerFrame`, `ampAckFrame`, `ampRespFrame`, exactly per the
  brief's Step 3 code block.

Extended `src/model/frames.ts`:
- `FrameKind` gains `'ampTrigger' | 'ampAck' | 'ampResp'`.
- New `AmpInfo` interface (verbatim from the brief, including `ulKbps?: number` per the "things
  the brief cannot know" note).
- `FrameDesc` gains `amp?: AmpInfo`.

Fixed every exhaustive site the new `FrameKind` values break, so `npx tsc -b` stays clean:
- `src/ui/i18n.ts`: `frameDetail.kindName / whatIs / next` — added `ampTrigger`, `ampAck`,
  `ampResp` entries in both `en` and `zh` blocks (one sentence each, matching the surrounding
  style/tone; zh translations written alongside, not literal word-for-word).
- `src/model/frameFields.ts`: `SUBTYPE` gains `ampTrigger: 'AMP Trigger', ampAck: 'AMP Ack',
  ampResp: 'AMP Response'`; `SUBTYPE_BITS` gains the three `'—'` placeholders; `controlMpdu`'s
  switch gains `case 'ampTrigger': case 'ampAck': case 'ampResp': fields = [{ key: 'body',
  bytes: f.bytes, value: 'AMP' }]; break` (placeholder, per the brief — real layout is Task 7).
- `src/scene/effects.ts`: `frameColor` switch gains `case 'ampTrigger': case 'ampAck': return
  0x2dd4bf; case 'ampResp': return 0xa78bfa`.
- `tests/ui/i18n.test.ts`: `KINDS` list extended with the three new kinds.

Additional exhaustive-site sweep (per the task's instruction to grep and report anything the
brief missed): ran `grep -rn "Record<FrameKind" src` and `grep -rn "case 'cfend'" src`, plus a
broader `grep -rn "FrameKind" src` to catch any other consumer. Findings:
- `Record<FrameKind` hits: only the three `i18n.ts` lines already listed in the brief — no other
  site.
- `case 'cfend'` hits: `frameFields.ts` and `effects.ts` — both already covered above.
- `src/ui/laneLayout.ts` imports `FrameKind` but only as an optional field type (`frameKind?:
  FrameKind`), not in an exhaustive `Record`/`switch` — no changes needed there.
- No other exhaustive site was found. `npx tsc -b` (below) confirms nothing was missed.

## TDD evidence

**RED** — with `src/engine/amp.ts` temporarily moved aside:
```
$ mv src/engine/amp.ts src/engine/amp.ts.bak && npx vitest run tests/engine/amp-phy.test.ts
 ❯ tests/engine/amp-phy.test.ts (0 test)
 FAIL tests/engine/amp-phy.test.ts [ tests/engine/amp-phy.test.ts ]
Error: Failed to load url ../../src/engine/amp (resolved id: ../../src/engine/amp) ...
 Test Files  1 failed (1)
      Tests  no tests
```
(amp.ts restored immediately after.)

**GREEN**:
```
$ npx vitest run tests/engine/amp-phy.test.ts tests/ui/i18n.test.ts tests/engine/lesson-hashes.test.ts
 ✓ tests/engine/amp-phy.test.ts (7 tests) 7ms
 ✓ tests/ui/i18n.test.ts (4 tests) 5ms
 ✓ tests/engine/lesson-hashes.test.ts (1 test) 3ms
 Test Files  3 passed (3)
      Tests  12 passed (12)
```

```
$ npx tsc -b
(no output — clean)
```

Full-suite safety check (not required by the brief, run anyway before committing):
```
$ npx vitest run
 Test Files  69 passed (69)
      Tests  619 passed (619)
```

## Files changed
- `src/engine/amp.ts` (new)
- `tests/engine/amp-phy.test.ts` (new)
- `src/model/frames.ts` (modified: `FrameKind`, `AmpInfo`, `FrameDesc.amp`)
- `src/ui/i18n.ts` (modified: `frameDetail.kindName/whatIs/next`, en + zh)
- `src/model/frameFields.ts` (modified: `SUBTYPE`, `SUBTYPE_BITS`, `controlMpdu` placeholder case)
- `src/scene/effects.ts` (modified: `frameColor` placeholder cases)
- `tests/ui/i18n.test.ts` (modified: `KINDS` list)

Commit: `6edf0e7 feat(amp): P802.11bp Active Tx constants, airtimes and frame builders`
(branch `feat/amp-active-tx`, worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`).

## Sensitivity numbers verified against `noiseDbm`

Per the task's "things the brief cannot know" note, verified the brief's `toBeCloseTo` values
against the actual `noiseDbm(widthMhz) = -174 + 10·log10(width·1e6) + 7` formula in
`src/engine/phy.ts`:
- `noiseDbm(2) ≈ -103.99` dBm → `+10` SINR → `-93.99` ≈ **-94** ✓ (brief's `-94` unchanged)
- `noiseDbm(4) ≈ -100.98` dBm → `+12` SINR → `-88.98` ≈ **-89** ✓ (brief's `-89` unchanged)
- `noiseDbm(8) ≈ -97.97` dBm → `+15` SINR → `-82.97` ≈ **-83** ✓ (brief's `-83` unchanged)

All three match the brief's literal test file exactly (`toBeCloseTo(-94, 0)`, `-89`, `-83`); no
numeric adjustment was needed. Also independently re-derived every `ampDlPpduNs`/`ampUlPpduNs`
worked example in the brief's test file by hand (bit-time arithmetic) before running — all six
DL cases and six UL cases reduce to the exact literal expectations in the brief.

## Self-review

- Every constant in `amp.ts` carries a source tag comment (`SFD PM-…`, `SFD FM-…`, `PDT
  39.3.2.2`, or `model`), matching the brief's Step 3 block verbatim plus the one additional
  `AMP_BROADCAST` constant (undocumented in the brief's constant list but present in its own
  `ampTriggerFrame` code as the literal `'*amp'` — factored into a named, self-describing
  constant instead of leaving a bare string literal).
- Worked airtimes: independently recomputed all `ampDlPpduNs`/`ampUlPpduNs`/`ampTriggerBytes`/
  `ampRespBytes` test expectations from the formulas before running the tests; all match the
  brief's literal numbers exactly (see above).
- `AmpInfo.ulKbps` and `ampTriggerFrame`'s `ulKbps: a.ulKbps` were already present in the
  brief's own interface/code blocks (not something the brief omitted); added the extra
  `expect(tr.amp).toMatchObject({ ulKbps: 250 })` assertion per instruction.
- Test output is pristine: no console warnings, no unhandled promise rejections, no skipped
  tests, in either the targeted 3-file run or the full 69-file suite.
- Curly quotes: the new en/zh `whatIs`/`next` sentences use the same typographic
  quote/apostrophe characters (`'`, `"`, `"`) as the surrounding table entries — verified by
  eye against adjacent lines in the same object literal; no escaped `\'` introduced.
- `git commit` used a heredoc with the exact two attribution lines specified.

## Concerns

- None blocking. Two minor judgment calls worth flagging for the reviewer:
  1. `AMP_BROADCAST` constant: the brief's Step 3 code already writes the destination as the
     bare string `'*amp'` in `ampTriggerFrame`'s return; I promoted it to a named exported
     constant to avoid a stringly-typed magic value duplicated at the two call sites
     (`ampTriggerFrame` and nowhere else yet, but Task 7's UI work will likely need to test for
     the same broadcast marker). This is a strictly additive, non-brief-mandated addition — flag
     if the reviewer prefers the literal inline to stay closer to the brief's exact text.
  2. The `whatIs`/`next` sentence content for the three new AMP kinds is original prose written
     to match the brief's one-example en/zh pair and the existing table's tone; the brief gave
     one example sentence per language and said "etc.", so the exact wording for `ampAck`/
     `ampResp` is a judgment call, not a literal requirement. Content is explicitly called out
     as "refined in Task 7" per the brief, so this is expected to be revisited there.
