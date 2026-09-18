# Task 4 report: `LinkId '2g'` in the capability model and the scenario schema

## What was implemented

`src/model/caps.ts`:
- `LinkId` widened to `'2g' | '5g' | '6g'`.
- New `LINK_ORDER: LinkId[] = ['5g', '6g', '2g']` (5/6 GHz first so old scenarios keep their lane order).
- New `BAND_LABEL: Record<LinkId, string> = { '2g': '2.4G', '5g': '5G', '6g': '6G' }`.
- `widthOf(n, link?)` takes an optional link and clamps to 40 MHz when `link === '2g'` (otherwise unclamped by band, same generation clamp as before).
- `negotiatedWidth(a, b, link?)` forwards the optional link to `widthOf`.
- `nodeLinks(n, apMlo)`: a non-AP station with `linkId === '2g'` and generation other than `'vht'` returns `['2g']`; VHT stations fall through to `'5g'` (VHT/Wi-Fi 5 has no 2.4 GHz mode). AP link selection is no longer decided here — `linkPlanFor` decides it from the stations' `nodeLinks`.
- `virtualId(nodeId, link)`: generalized to `` `${nodeId}#${link}` `` for any non-`'5g'` link (previously hardcoded `#6g`).
- `linkOfVirtual(vid)`: generalized to read whatever suffix follows `#` (previously only recognized `#6g`).
- `linkPlanFor(nodes)`: rewritten so the AP joins every link any station uses (`used` set seeded with `'5g'`, plus `'6g'` when the AP is MLO, plus whatever `nodeLinks` returns per station), in `LINK_ORDER`. `members` is now a 3-key record (`'2g' | '5g' | '6g'`). `links` and `virtualIds` follow `LINK_ORDER`.

`src/model/scenario.ts`:
- Imports `LinkId` as a type from `./caps` (type-only, closing the circular import the same way `caps.ts` already imports `NodeCfg` as a type from `./scenario`).
- `NodeCfg.linkId` type changed from `'5g' | '6g'` to `LinkId`; doc comment updated to describe all three bands.
- Schema: `linkId: z.enum(['2g', '5g', '6g']).optional()`.
- Added `.superRefine((n, ctx) => { if (n.linkId === '2g' && n.caps.generation === 'vht') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Wi-Fi 5 (VHT) has no 2.4 GHz mode; pick 802.11g, Wi-Fi 6 or Wi-Fi 7 for the 2.4 GHz link' }) })` directly on the inner `z.object({...})`, i.e. `z.preprocess(migrateLegacyProfile, z.object({...}).superRefine(...))` — the refine sits inside the preprocess wrapper as the brief specified. Message contains "2.4 GHz" to satisfy `toThrow(/2\.4 GHz/)`.

`src/engine/simulation.ts` (minimal, type-preserving, noted per the brief):
- `LINK_EXTRA_LOSS_DB: Record<LinkId, number>` needed a `'2g'` key once `LinkId` grew a third member (`tsc -b` reported `TS2741` otherwise). Added `'2g': 0` with a `TODO(Task 5): real 2.4 GHz figure.` comment — Task 5 owns picking the real value and wiring 2.4 GHz path loss into the engine. No other engine logic was touched; `plan.members['5g']` / `plan.members['6g']` accesses elsewhere in `simulation.ts` still compile unchanged since those keys still exist on the now-3-key record.

## Grep audit of callers (brief's step 3 instruction)

Ran `grep -rn "nodeLinks(\|linkOfVirtual(\|virtualId(\|negotiatedWidth(\|widthOf(\|members\[" src tests`:
- `src/engine/simulation.ts`: `LINK_EXTRA_LOSS_DB` (fixed above), `plan.members[link]`, `plan.members['5g']` (x2), `virtualId(id, link)` calls — all still type-check because they use literal `'5g'`/`'6g'` link values already covered by the widened union, and `widthForPeer`/`negotiatedWidth` calls pass no link argument (still valid since it's now optional).
- `src/model/view.ts` (`siblingId`): not a caller of any of the greped functions and needed no change, confirmed by re-reading the brief's note.
- Test files (`tests/model/caps.test.ts`, `tests/model/presets.test.ts`, `tests/engine/phy-modes.test.ts`, `tests/course/lessons.test.ts`, `tests/model/households.test.ts`): all call these functions with literal `'5g'`/`'6g'` or no link argument; all still compile and pass.
- No UI files reference these functions (`src/model/caps.ts`'s exports weren't imported outside `src/model`, `src/engine`, and tests).

## TDD evidence

RED — `npx vitest run tests/model/caps.test.ts tests/model/scenario.test.ts` (after appending the brief's tests, before touching `caps.ts`/`scenario.ts`):
```
FAIL tests/model/caps.test.ts > the 2.4 GHz link > a station with linkId 2g is on the 2.4 GHz link unless it is VHT
FAIL tests/model/caps.test.ts > the 2.4 GHz link > the AP joins every link a station uses; 5 GHz-only scenarios are unchanged
FAIL tests/model/caps.test.ts > the 2.4 GHz link > width is clamped to 40 MHz on 2.4 GHz
FAIL tests/model/scenario.test.ts > linkId 2g in the schema > accepts 2g on non-VHT stations and rejects it on VHT
 Test Files  2 failed (2)
      Tests  5 failed | 11 passed (16)
```
(The "virtual ids and band labels" test also failed at collection time due to missing `LINK_ORDER`/`BAND_LABEL` exports before the fix; after implementation all pass — see below.)

GREEN — after implementing `caps.ts` and `scenario.ts`:
```
npx vitest run tests/model/caps.test.ts tests/model/scenario.test.ts
✓ tests/model/caps.test.ts (7 tests)
✓ tests/model/scenario.test.ts (9 tests)
```

## Suites run (final)

- `npx vitest run tests/model tests/engine/lesson-hashes.test.ts` → 10 files, 71 tests, all passing (includes the lesson-hash fixture — unchanged, confirming the 5 GHz-only scenarios still produce `['ap', ...stations]` virtualIds order).
- `npx tsc -b` → clean, no errors.
- Full suite `npx vitest run` → 68 files, 601 tests, all passing (no regressions anywhere in engine/course/UI tests).

## Files changed

- `src/model/caps.ts`
- `src/model/scenario.ts`
- `src/engine/simulation.ts` (one-line `LINK_EXTRA_LOSS_DB` fix, see above)
- `tests/model/caps.test.ts` (appended brief's tests verbatim, plus a second import line for the new exports to avoid a duplicate `widthOf` import)
- `tests/model/scenario.test.ts` (appended brief's test verbatim)

Commit: `d1c6472` — `feat(model): 2.4 GHz link id, band labels, AP on every link a station uses`

## Self-review findings

- Diff matches the brief's Step 3/4 code blocks essentially verbatim (function bodies, comments, `LINK_ORDER`, `BAND_LABEL`, `superRefine` placement and message).
- No engine behavior changed except the one unavoidable `Record<LinkId, number>` completion in `simulation.ts`, which is inert (`'2g': 0`, and no code path currently produces a `'2g'` link since `linkPlanFor`/`nodeLinks` are the only producers and Task 5 hasn't wired 2.4 GHz PHY timing into `Simulation` yet — actually `nodeLinks`/`linkPlanFor` *can* now produce `'2g'` if a scenario sets `linkId: '2g'`, but no shipped scenario or test does so outside the new model tests, so the lesson-hash fixture and full engine suite are unaffected).
- No UI files touched; `src/model/view.ts` confirmed unaffected (`siblingId` only pairs 5g/6g, no reference to the new band).
- Test output is pristine: no console warnings, no skipped tests, no flaky timing in the affected suites.
- `LinkPlan.members` is now a 3-key record everywhere it's constructed (`{ '2g': [], '5g': [], '6g': [] }`), so no caller can hit a missing key.

## Concerns

- If a real scenario is later authored with `linkId: '2g'` before Task 5 wires the engine's per-link PHY/propagation loss for 2.4 GHz, `Simulation` will run it through the existing 5/6 GHz-shaped code path with `LINK_EXTRA_LOSS_DB['2g'] = 0` (a placeholder) — this is expected per the task split (Task 5 owns that), but flagging so it isn't mistaken for a finished 2.4 GHz simulation path.
- None of the concerns are blocking; all in-scope tests and the full suite are green, and `tsc -b` is clean.
