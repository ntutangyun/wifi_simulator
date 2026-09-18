# Task 6 report: Timeline, event log, inspector, scene

## What

Wired the AMP records/frames the engine already emits (Tasks 1–5) into the UI:
timeline lane spans, the collision-tick canvas layer, the event-log text
formatter, the node inspector, i18n strings (en + zh), and the 3D scene.

## TDD evidence

1. Appended the brief's exact test cases to `tests/ui/laneLayout.test.ts`
   (`ampWait` opens a `'slot'` span + tooltip name) and `tests/ui/format.test.ts`
   (`fmtRecord` for `AMP_ROUND`/`AMP_SLOT`/`AMP_ABOC`/`AMP_RESULT`).
2. Ran `npx vitest run tests/ui/laneLayout.test.ts tests/ui/format.test.ts` —
   confirmed both new tests failed against the old code:
   - `AMP_ROUND` string mismatch (`'ap#2g AMP round (random, 4 slots) unt…'` vs
     expected `'ap#2g AMP round (random): 4 slots × 2…'`)
   - `ampWait` span still resolved to `kind: 'sifs'` (Task 2's temporary mapping)
3. Implemented (see Files below).
4. Re-ran the same two files — both green (29 tests).
5. Ran the full required gate: `npx vitest run tests/ui tests/model tests/engine/lesson-hashes.test.ts`
   — 15 files / 120 tests passed (hash fixture included, unaffected).
6. Ran the entire suite for extra confidence: `npx vitest run` — 72 files /
   646 tests passed.
7. `npx tsc -b` — clean, no output.
8. `npm run build` — succeeded (`tsc -b && vite build`), only the pre-existing
   "chunk > 500 kB" advisory warning (unrelated to this change).

## Files changed

- `src/ui/laneLayout.ts` — `SpanKind` gains `'slot'`; `STATE_SPAN.ampWait = 'slot'`
  (replacing Task 2's temporary `'sifs'` mapping); `HIT_ORDER.slot = 2`; `tx` case
  in `spanTooltip` now names `ampTrigger`/`ampAck`/`ampResp` and uses
  `f.amp.kbps` kb/s OOK as the rate line when `f.amp` is present; added
  `case 'slot'` returning `[T.ampWait · dur, T.ampWaitNote]`.
- `src/ui/TimelineStrip.tsx` — `SPAN_COLORS.slot = '#115e59'`; `txColor` maps
  `ampTrigger`/`ampAck` → `'#2dd4bf'`, `ampResp` → `'#a78bfa'`; added a second
  tick-drawing loop next to the `COLLISION` one that draws a 1 px `#2dd4bf`
  vertical tick (alpha 0.6) at each in-window `AMP_SLOT` record's `t`, on that
  record's own lane only (full lane height), looked up via `nodeIds.indexOf(r.node)`.
- `src/ui/format.ts` — `fmtRecord` cases for `AMP_ROUND`/`AMP_SLOT`/`AMP_ABOC`/
  `AMP_RESULT` replaced with the brief's final strings (verified byte-for-byte
  against the new test); `decodeFrame` now pushes AMP rows when `f.amp` is set:
  `AMP rate`, plus `Slots`/`Slot duration`/`ACWE`/`Phase` for triggers,
  `Acknowledges slot` for Acks, `Slot`/`ABOC` for responses.
- `src/ui/Inspector.tsx` — `StateBadge` colours gain `ampWait: '#0d9488'`;
  `NodeSection` now branches `nv.amp ? <AMP rows> : nv.acs ? <AC table> : <plain
  backoff/CW>` and renders `nv.ampRound` (AP lanes) as an extra row; the
  QSRC/NAV/IFS/CCA block and the queue list are both skipped when `nv.amp` is set
  (tags have neither).
- `src/ui/i18n.ts` — `Strings.tooltips` gains `ampTrigger`, `ampAck`, `ampResp`,
  `ampWait`, `ampWaitNote`; `Strings.inspector` gains `ampTag`, `aboc`,
  `abocHint`, `slot`, `slotHint`, `ampCounts`, `ampCountsHint`, `ampRound`,
  `ampRoundHint`, `satOut`; three new `legend` entries (AMP DL teal, AMP UL
  violet, slot-wait teal). Filled verbatim in `en`; natural Simplified Chinese
  equivalents added in `zh` (both tables are exhaustive — TypeScript enforces
  this via the `Strings` interface).
- `src/scene/nodes.ts` — `buildNodeGroup` gains an `n.kind === 'amp'` branch: a
  flat `CylinderGeometry(0.12, 0.12, 0.02, 16)` disc in `0x2dd4bf`. (`appLine`
  already returned `''` for any non-`'sta'` kind, so no change was needed
  there; `haloColor`'s `ampWait` case was already in place from Task 5.)
- `src/scene/effects.ts` — the AP↔station association-line loop now includes
  tags (`n.kind !== 'ap'` instead of `=== 'sta'`); AMP tags get a dashed
  (`LineDashedMaterial`, `computeLineDistances()`) teal (`0x2dd4bf`) line at
  opacity 0.12, distinct from the plain grey 0.18-opacity station line.
- `tests/ui/laneLayout.test.ts`, `tests/ui/format.test.ts` — the brief's two
  test cases, appended verbatim.

## Self-review

- Both `en` and `zh` string tables compile under the shared `Strings`
  interface — TypeScript would fail `tsc -b` if either table were missing a
  key, and it passed clean.
- The four `fmtRecord` AMP cases were typed directly from the brief's test
  assertions and the test passes byte-for-byte (`toBe`, not `toContain`).
- Searched for `TODO(Task 6)` / `placeholder` across `src/ui` — none remain;
  Task 2's temporary `ampWait: 'sifs'` mapping in `STATE_SPAN` is gone,
  replaced by the real `'slot'` mapping.
- Verified `AmpInfo`/`AMP_ROUND` record field names (`kbps`, `slotNs`, `acwe`,
  `dlKbps`, `ulKbps`, `ackFor`, `aboc`, `slot`) against `src/model/frames.ts`
  and `src/model/records.ts` before using them, rather than guessing.
- Confirmed `nv.ampRound` (AP) and `nv.amp` (tag) are mutually exclusive lane
  kinds per `src/model/view.ts`, so the Inspector's `nv.amp ? … : nv.acs ? … :
  …` branch and the separate `nv.ampRound &&` row don't fight each other.
- Ran the full test suite (646 tests, not just the required gate) and both
  `tsc -b` and `npm run build` to catch anything the narrower gate might miss.
- Did not start the dev server / eyeball the scenario (Step 5 in the brief is
  explicitly optional); all verification here is via the test suite,
  typechecker and build.

## Concerns

- Minor cosmetic-only nit: the two new `{!nv.amp && <>...</>}` wrapped blocks
  in `Inspector.tsx` keep their original (now one-level-shallow) indentation
  rather than being re-indented under the fragment, to keep the diff minimal
  and avoid manual re-indentation risk. Purely stylistic; no functional impact
  and it doesn't affect JSX correctness (verified by `tsc -b`/build/tests).
- The brief's "Files:" line mentions "association line for tags: dashed teal"
  while the inline Step-3 instructions only specify colour/opacity; I
  implemented both (dashed via `THREE.LineDashedMaterial` + `computeLineDistances()`,
  plus the specified `0x2dd4bf`/0.12 opacity) since there's no prior dashed-line
  precedent in the codebase to match against — worth a visual sanity check in
  Step 5 if anyone runs the dev server later.
- Did not manually run Step 5 (loading the `amp-ap.test.ts` `scenario()` via
  `localStorage` in a live `npx vite` instance) since it's marked optional and
  the task emphasized not leaving a dev server running; all functional
  behaviour is covered by the vitest suite instead.
