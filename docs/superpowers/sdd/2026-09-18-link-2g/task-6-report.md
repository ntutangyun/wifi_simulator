# Task 6 report: UI — band labels, inspector link header, editor band selector

## What

Wired the 2.4 GHz link (added by Task 4's `LinkId`/`BAND_LABEL`/`linkOfVirtual`/`physicalId`/`linkPlanFor`) through the
UI: lane labels, tooltips, node names, the Inspector's per-link header, and a generalized band selector in the
floor-plan editor.

- `src/ui/names.ts`: `nodeDisplayName` now derives the band suffix from `linkOfVirtual`/`BAND_LABEL` instead of a
  hardcoded `#6g` check, so it now correctly renders `· 2.4G`, `· 6G`, or nothing for the primary (`5g`) lane.
- `src/ui/i18n.ts`: `Strings.editor` gained `bands: Record<LinkId, string>`; `Strings.inspector.link5`/`link6` were
  replaced with `linkName: Record<LinkId, string>`. Both `en` and `zh` tables updated with band labels and link
  names for `2g`/`5g`/`6g`, and `editor.linkHint` reworded per the brief (band eligibility by generation).
- `src/ui/Inspector.tsx`: the per-lane header now reads `L.linkName[linkOfVirtual(vid)]` instead of a `#6g` ternary.
  The node-detail view was generalized from "primary + optional 6g sibling" to "every lane whose `physicalId`
  matches the selected node", so a 2.4 GHz-only station, a 5+6 GHz MLO station, or (hypothetically) a node with
  more lanes all render every one of their `NodeSection`s.
- `src/ui/TimelineStrip.tsx`: `bandTag` and `laneLabel` now use `BAND_LABEL[linkOfVirtual(vid)]` instead of a
  `'6G'/'5G'` ternary on `#6g`, so band tags/lane suffixes are correct for all three bands. The span tooltip's band
  line now reads `L.inspector.linkName[linkOfVirtual(...)]`.
- `src/editor/FloorPlanEditor.tsx`: `setGeneration` now clears `linkId` only when switching to `vht` (Wi-Fi 5, which
  has no `linkId` concept) instead of only keeping it for `he`/`eht` — so a station moved to `nonht` (802.11a/g,
  which can use 2.4 GHz) keeps its link choice. The link `<select>` is now shown for any generation except `vht`
  (when MLO is off), with options `2g`/`5g`/`6g` filtered so `6g` only appears for `he`/`eht`, and labelled from
  `E.bands[l]`.

## TDD evidence

1. Added the brief's assertions first:
   - `tests/ui/names.test.ts`: `expect(nodeDisplayName(nodes, 'sta-1#2g', 'everyone')).toBe('Laptop (MLO) · 2.4G')`
   - `tests/ui/i18n.test.ts`: new `describe('band strings', ...)` block asserting `STRINGS[lang].editor.bands[l]`
     and `STRINGS[lang].inspector.linkName[l]` are truthy for `l` in `2g`/`5g`/`6g`, both langs.
2. Ran `npx vitest run tests/ui/names.test.ts tests/ui/i18n.test.ts` before implementing — confirmed FAIL:
   - `names.test.ts`: `expected 'Laptop (MLO)' to be 'Laptop (MLO) · 2.4G'`
   - `i18n.test.ts`: `Cannot read properties of undefined (reading '2g')` (`editor.bands`/`inspector.linkName`
     didn't exist yet) — 3 failing tests total, 5 passing (unrelated).
3. Implemented per the brief (names.ts, i18n.ts interface + both tables, Inspector.tsx, TimelineStrip.tsx,
   FloorPlanEditor.tsx).
4. Re-ran the same two files — all green (see below).

## Commands run (with output)

`npx vitest run tests/ui/names.test.ts tests/ui/i18n.test.ts` (before implementing):
```
 ❯ tests/ui/i18n.test.ts (4 tests | 2 failed)
   × band strings > en names every link in the editor and the inspector
     → Cannot read properties of undefined (reading '2g')
   × band strings > zh names every link in the editor and the inspector
     → Cannot read properties of undefined (reading '2g')
 ❯ tests/ui/names.test.ts (4 tests | 1 failed)
   × nodeDisplayName > maps engine ids to the scenario names a learner knows
     → expected 'Laptop (MLO)' to be 'Laptop (MLO) · 2.4G'
 Test Files  2 failed (2)
      Tests  3 failed | 5 passed (8)
```

`npx vitest run tests/ui tests/engine/lesson-hashes.test.ts` (after implementing):
```
 ✓ tests/ui/laneLabel.test.ts (3 tests)
 ✓ tests/ui/format.test.ts (5 tests)
 ✓ tests/ui/names.test.ts (4 tests)
 ✓ tests/ui/i18n.test.ts (4 tests)
 ✓ tests/ui/laneLayout.test.ts (22 tests)
 ✓ tests/engine/lesson-hashes.test.ts (1 test)
 Test Files  6 passed (6)
      Tests  39 passed (39)
```

`npx tsc -b`: no output, exit 0 (clean).

`npm run build`:
```
> wifi-sim@0.1.0 build
> tsc -b && vite build
✓ 99 modules transformed.
dist/index.html                     0.60 kB
dist/assets/sim.worker-*.js       114.26 kB
dist/assets/index-*.css             0.59 kB
dist/assets/index-*.js           1,216.23 kB
✓ built in 2.41s
```
(the >500 kB chunk-size warning is pre-existing/unrelated to this change)

Full-suite sanity check, `npx vitest run` (entire repo):
```
 Test Files  68 passed (68)
      Tests  606 passed (606)
```

Step 5 ("try it in the app"): partially done — no Playwright tool was loaded for this task, so I did not click
through the editor UI. I did start `npm run dev` (bound to port 5174; port 5173 was already occupied by another,
unrelated session's dev server, which I left untouched) and confirmed the page returned HTTP 200, then stopped my
instance. I did not verify the exact lane-label rendering ("Router · 5G", "Router · 2.4G", inspector showing both
link sections) by driving the browser — that part of Step 5 is skipped, per the brief's allowance.

## Files changed

- `D:\wifi_sim\.claude\worktrees\feat-link-2g\src\ui\names.ts`
- `D:\wifi_sim\.claude\worktrees\feat-link-2g\src\ui\i18n.ts`
- `D:\wifi_sim\.claude\worktrees\feat-link-2g\src\ui\Inspector.tsx`
- `D:\wifi_sim\.claude\worktrees\feat-link-2g\src\ui\TimelineStrip.tsx`
- `D:\wifi_sim\.claude\worktrees\feat-link-2g\src\editor\FloorPlanEditor.tsx`
- `D:\wifi_sim\.claude\worktrees\feat-link-2g\tests\ui\names.test.ts`
- `D:\wifi_sim\.claude\worktrees\feat-link-2g\tests\ui\i18n.test.ts`

## Self-review

- Both `en` and `zh` `Strings` tables were updated together for `editor.bands`, `inspector.linkName`, and the
  reworded `editor.linkHint`; TypeScript's structural typing on `Record<Lang, Strings>` would have caught a
  missing key in either table, and `tsc -b` is clean.
- Grepped `src` (post-change) for `link5|link6|'5g' \| '6g'` — the only hits left are `LinkId`'s own definition in
  `src/model/caps.ts` and an unrelated, out-of-scope `band?: '5g' | '6g'` field in `src/course/widgetModel.ts`
  (not touched by this task's file list, and not a `Strings` key).
  Grepped for `#6g` across `src`/`tests` — remaining hits are all either literal virtual-id string logic
  unconnected to the `Strings` tables (`src/model/view.ts`, `src/scene/effects.ts`, `src/editor/EditorGuide.tsx`
  prose, `src/course/lessons.ts`, `src/course/lessonKit.ts`, `scripts/tamper-report.ts`) or test assertions that
  still hold under the new logic (verified via the full-suite run above) — none of them assume `#6g` is the only
  non-primary band any more in the five files this task touched.
- `Inspector.tsx`'s node-detail view no longer special-cases "6g sibling"; it now lists every lane
  (`Object.keys(view.nodes).filter((vid) => physicalId(vid) === phys)`), which generalizes correctly to a
  2.4 GHz-only station (one lane), an MLO station (5g + 6g lanes), or any future third lane.
- `FloorPlanEditor.tsx`'s link `<select>` options are generation-gated (`6g` requires `he`/`eht`) matching
  `nodeLinks` in `caps.ts`, so a learner can't pick an option the engine wouldn't honor.
- Test output is pristine: 606/606 passing across the whole repo, `tsc -b` silent/clean, `npm run build` succeeds
  (only the pre-existing, unrelated chunk-size warning appears).

## Concerns

- None blocking. The one soft gap is Step 5's interactive verification (no Playwright tool loaded for this task),
  documented above and allowed by the brief as optional.
