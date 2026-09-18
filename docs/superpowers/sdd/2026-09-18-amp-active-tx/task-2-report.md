# Task 2 report — Model types: tags, AP AMP config, records, view state

## What

Implemented the model-only slice of the AMP plan on top of Task 1 (`src/engine/amp.ts`,
`ampTrigger`/`ampAck`/`ampResp` frame kinds):

- `src/model/types.ts`: `NodeKind` gains `'amp'`.
- `src/model/scenario.ts`:
  - `NodeCfg` gains `ampAp?: AmpApCfg` and `ampTag?: AmpTagCfg`.
  - New `AmpApCfg` interface + `DEFAULT_AMP_AP` constant, `AmpTagCfg` interface.
  - `NodeCfgSchema`: `kind` enum extended to `['ap', 'sta', 'amp']`; `ampAp`/`ampTag` zod
    objects added with the brief's bounds (`pollIntervalMs` 10–10000, `slots` 1–16,
    `acwe` 0–4, `dlKbps`/`ulKbps`/`protection`/`readMode` enums).
  - `superRefine` gains two rules: a `kind: 'amp'` node with `linkId` set to anything but
    `'2g'` fails with a message containing "2.4 GHz"; an `ampAp` config on anything but an
    `eht`-generation AP fails with a message containing "Wi-Fi 7". A tag with `linkId`
    absent is accepted (2g is forced downstream by `nodeLinks`).
- `src/model/records.ts`: `MacStateName` gains `'ampWait'`; `TLRecord` gains
  `AMP_ROUND` / `AMP_SLOT` / `AMP_ABOC` / `AMP_RESULT`, verbatim per the brief.
- `src/model/view.ts`:
  - New `AmpTagView` and `AmpRoundView` interfaces; `NodeView` gains
    `amp?: AmpTagView` and `ampRound?: AmpRoundView | null`.
  - `initViewState`: a `kind: 'amp'` lane gets a fresh `AmpTagView`
    (`acs` is already `null` for it via the existing EDCA-feature check, since `nonht`
    has no EDCA feature — no extra code needed there); every AP lane gets `ampRound: null`.
  - `applyRecord`: added `AMP_ROUND`/`AMP_SLOT`/`AMP_ABOC`/`AMP_RESULT` cases exactly as
    specified. `RX_OK` pushes `r.from` onto `ampRound.received` when the frame is
    `ampResp` and the node has a live round. `MAC_STATE` clears `ampRound` to `null`
    whenever the new state is anything other than `'tx'`/`'waitAck'` (the reducer doesn't
    know the AP's read mode, so it keeps the round alive through the AP's own
    trigger/ack transmissions and clears on anything else, per the brief).
- `src/scene/nodes.ts` `haloColor`: added `case 'ampWait': return 0x0d9488`.
- `src/ui/laneLayout.ts` `STATE_SPAN`: added `ampWait: 'sifs'` (SpanKind change parked for
  Task 6, per the brief).
- `src/model/caps.ts`:
  - `nodeLinks`: `if (n.kind === 'amp') return ['2g']` as the first line.
  - `linkPlanFor`: the parked finding fix — `used` is now seeded with **both** `'5g'`
    and `'6g'` for an MLO AP (an MLO AP always runs both radios), not just `'6g'`. Updated
    the surrounding comment to match.

### Unplanned but required fix: `src/ui/format.ts`

`fmtRecord`'s `switch (r.type)` over `TLRecord['type']` is exhaustive with no `default`.
Adding the four new `TLRecord` variants in `records.ts` broke `npx tsc -b` there (a
"function lacks ending return statement" error), even though this file isn't named in
the brief's file list. Since a clean `tsc -b` is a hard requirement, I added minimal
formatting cases for `AMP_ROUND`/`AMP_SLOT`/`AMP_ABOC`/`AMP_RESULT` (one-line human-readable
strings, consistent with the file's existing style). No other UI files needed touching —
this was the only other exhaustive switch on `TLRecord`/`MacStateName` in the tree.

### Test-file fix

The brief's `view.test.ts` snippet types its `rec` helper's parameter as
`Omit<TLRecord, 'seq'>`. Because `Omit` is not distributive over a discriminated union,
this collapses to a type with only the fields common to every `TLRecord` variant (losing
`node`, `phase`, etc.), which fails to typecheck. `records.ts` already solves this with a
`DistributiveOmit` type used internally for `EmitFn`, so I typed the test's `rec` helper
as `Parameters<EmitFn>[0]` instead (the same fix the file's existing `seq()` helper uses),
keeping runtime behaviour identical to the brief's snippet.

## TDD evidence

1. Added the brief's tests verbatim (`tests/model/scenario.test.ts` AMP describe block,
   `tests/model/view.test.ts` AMP describe block) plus the extra `caps.test.ts` case for
   the MLO-AP link-seeding fix, before writing any implementation.
2. Ran `npx vitest run tests/model/scenario.test.ts tests/model/view.test.ts tests/model/caps.test.ts`
   → 3 failures (schema rejected `kind: 'amp'`; `linkPlanFor` produced `['6g','2g']` instead
   of `['5g','6g','2g']`; `vs.nodes['tag-1#2g']` was `undefined`), rest green.
3. Implemented per the brief; re-ran the same command → all pass.
4. Ran `npx tsc -b` → surfaced the `src/ui/format.ts` and test-file typing issues above;
   fixed both; re-ran → clean.

## Suites run (final, all green)

- `npx vitest run tests/model tests/engine/lesson-hashes.test.ts tests/engine/simulation.test.ts`
  → 11 files / 86 tests passed.
- `npx tsc -b` → clean, no output.
- Full suite `npx vitest run` → 69 files / 622 tests passed (includes lesson-claims,
  quoted-timestamps, mumimo, dl-mu-standard, etc. — confirms no regression anywhere else
  in the tree from the `caps.ts`/`view.ts` changes).

## Files changed

- `src/model/types.ts`
- `src/model/scenario.ts`
- `src/model/records.ts`
- `src/model/view.ts`
- `src/model/caps.ts`
- `src/scene/nodes.ts`
- `src/ui/laneLayout.ts`
- `src/ui/format.ts` (unplanned, see above)
- `tests/model/scenario.test.ts`
- `tests/model/view.test.ts`
- `tests/model/caps.test.ts`

Commit: `61da702` "feat(model): AMP tags, AP polling config, AMP records and view state"
on `feat/amp-active-tx`.

## Self-review

- **Completeness against the brief**: every interface, schema rule, record variant,
  reducer case and the two named exhaustive-switch sites are implemented exactly as
  specified, plus the parked `linkPlanFor` finding and its `caps.test.ts` case.
- **No engine behaviour change**: no file under `src/engine/` was touched; the reducer
  additions are purely additive `case` branches keyed on record types the engine does not
  yet emit (Task 5's job), so no existing code path's output changes. `timelineHash()`
  (used by `lesson-hashes.test.ts`) hashes the raw record timeline, not `ViewState`, so it
  is untouched by the `view.ts`/`caps.ts` changes; confirmed the fixture still matches
  without regeneration.
- **No UI beyond the two exhaustive-switch sites named in the brief**, with the one
  documented exception (`src/ui/format.ts`) forced by the hard `tsc -b` requirement —
  flagged above rather than silently expanding scope.
- **Test output pristine**: full-suite run above shows 622/622 passing, no skipped or
  console-warning noise beyond the suite's normal timing output.
- Double-checked the `existing MLO AP` `caps.test.ts` cases (5 GHz-only, MLO with a plain
  5 GHz station) still pass unchanged after the `used` seeding fix — they do, since the
  station's own `nodeLinks` call was already adding `'5g'` in that case; the fix only
  matters when no station pulls in `'5g'` on its own (the new 2.4 GHz-only-station case).

## Concerns

- `src/ui/format.ts` was not in the brief's file list; I judged it in-scope because the
  task's own hard requirement ("`npx tsc -b` clean") could not otherwise be met once
  `records.ts` gained the four new `TLRecord` variants. The added cases are simple
  one-line formatters with no behavioural stakes (used only for a debug/log string), but
  flagging in case the plan intended a different file or wording for AMP record display
  strings.
- The `MAC_STATE` rule (`ampRound = null` unless the new state is `tx`/`waitAck`) is a
  blunt instrument — it fires on **every** node's `MAC_STATE` record, not just AP lanes,
  and adds an `ampRound: null` key to any node's view once it first hits a non-tx/waitAck
  state, even a plain station engine transitions to `null` under it will occasionally
  reintroduce nothing observable (since only AP lanes ever get `ampRound` sets from
  `AMP_ROUND`, this is inert everywhere else, just slightly wasteful). No test evidence of
  actual harm — full suite is green — but noting it as a follow-up spot to revisit in
  Task 5/6 if it ever needs restricting to AP lanes only.
