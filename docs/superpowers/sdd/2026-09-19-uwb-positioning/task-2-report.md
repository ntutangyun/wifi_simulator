# Task 2 report — Editor: UWB anchors and tags, the session section, the AP rule

**Status:** DONE_WITH_CONCERNS
**Commit:** `42f941b` — `feat(editor): UWB anchors, tags and the ranging session; AP deletable in UWB-only plans`
**Branch:** `feat/uwb-ranging` (worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`)

## What was built

### `src/editor/planOps.ts`
- `newAnchor(sc, pos)` / `newUwbTag(sc, pos)` — both thin wrappers over one private
  `newUwbNode(sc, pos, role)`. Node defaults exactly as specified: anchor z 2.2 / tag z 1.0,
  `txPowerDbm: UWB_TX_POWER_DBM`, `profiles: ['idle']`, `caps: { generation: 'nonht', features: {} }`,
  `uwb: { role }`, position snapped to the 0.1 m grid. The first UWB node adds
  `uwb: { ...DEFAULT_UWB_SESSION }`; a later one reuses whatever session is already open.
- `canDeleteNode(sc, id)` — true for everything but the AP; the AP only once the scenario holds
  no `sta` and no `amp` node.
- `removeNode(sc, id)` — refuses (returns `sc` unchanged) when `canDeleteNode` says no, and
  clears `sc.uwb` when the node removed was the last UWB device.
- `uwbSessionIssue(sc)` — implemented exactly per the controller ruling: runs
  `ScenarioSchema.safeParse(sc)` and returns the first issue whose **path contains a `uwb`
  segment** or whose **message matches `/\bUWB\b|ranging/i`**, else null. No schema rule is
  re-encoded here.

### Id / name scheme (deviation, see Concerns)
Anchors and tags are numbered **within their own role** — `anchor-1`, `anchor-2`, `uwb-1`,
`uwb-2`, named `Anchor k` / `UWB tag k` — with `newTag`'s `while (used.has(id)) id = …-${++k}`
uniqueness loop on top. This is what makes the brief's stated expectation ("a second anchor gets
`anchor-2`") true for any starting scenario; numbering off `sc.nodes.length` as `newTag` does
would have produced `anchor-3`/`anchor-4` on the default house.

### `src/uwb/ui/UwbNodeFields.tsx` (new)
Props `{ node: NodeCfg; onChange(patch: Partial<NodeCfg>) }`. Role as a read-only label, height
(0.1–3 m), crystal offset ppm (−100…100, blank ⇒ "drawn from the seed", i.e. `ppm: undefined`),
tx power (−30…0 dBm). All numeric inputs go through `clampField`.

### `src/uwb/ui/UwbSessionFields.tsx` (new)
Props `{ session, anchors, tags, issue, onChange }` — see Concerns for the `issue` prop. Method
(SS/DS), block RSTU with the ms it equals, slot RSTU with its ms, channel 5/9 (with the MHz),
timestamp noise ps, clock-estimate noise ppm, NLOS checkbox. Prints
`slots per round N · rounds per block M` straight from `roundPlan`, and the `issue` text in red
(`#f87171`) below it when not null. Block and slot inputs are snapped to whole 3-RSTU units so a
typed value can never violate the schema's "multiple of 3" rule.

### `src/editor/FloorPlanEditor.tsx`
- Two new tools `anchor` / `uwbTag` in the tool row (`TOOLS` array; the three placement tools now
  share one branch in `onPointerDown`).
- Canvas: an anchor is drawn as a 0.6 m **square** (`#f59e0b`), a tag as an r 0.22 circle
  (`#fbbf24`); colour and badge extracted into `nodeColor()` / `nodeBadge()` so the canvas and the
  object list can never drift apart. Badges are `UWB ⚓` / `UWB 🏷`.
- Node-list rows use the same colours (the anchor's swatch is square).
- The delete button on every row is now driven by `canDeleteNode`, so the AP's is enabled exactly
  when the plan has no station and no AMP tag; the tooltip states the rule in both languages. The
  property panel's `🗑 Delete node` button follows the same predicate.
- The **UWB session** section renders directly under the node list whenever any UWB node exists.
- The selected-node panel renders `UwbNodeFields` for `kind === 'uwb'` and suppresses the Wi-Fi
  block, the generic tx-power field and the generic height field for it.
- Colours match the existing 3D scene (`src/scene/nodes.ts` already draws an anchor `0xf59e0b`
  and a tag `0xfbbf24`).

### `src/ui/Inspector.tsx`
The no-selection BSS totals now read `Object.entries(view.nodes).filter(([, n]) => !n.uwb)`, so
the headline numbers and the per-node table cover Wi-Fi lanes only.

### `src/ui/i18n.ts`
New `editor` keys (EN + real ZH): the two tool labels, `uwbNode`, `uwbRole`, `uwbRoles`,
`uwbPpm(+Hint)`, `uwbPpmDrawn`, `uwbSession`, `uwbCounts`, `uwbMethod(+Hint)`, `uwbMethods`,
`uwbBlock(+Hint)`, `uwbSlot(+Hint)`, `uwbChannel(+Hint)`, `uwbTsNoise(+Hint)`,
`uwbCfoNoise(+Hint)`, `uwbNlos(+Hint)`, `uwbPlan`. `apNoDelete` was rewritten in both languages
to state the new rule instead of "the AP cannot be deleted".

### `src/editor/EditorGuide.tsx`
New `<D>` entries "📍 UWB anchor" and "📱 UWB tag" under Tools, a "🗑 Delete node" entry stating
the AP rule, and a whole **UWB session** section (method, block/slot with the `A+1` / `2A+2` slot
arithmetic, channel, the two noise knobs, NLOS, and the note that an impossible schedule is
reported in red) — EN and ZH. The stale sentence "The AP is always present and cannot be deleted"
in the object-list-order paragraph was corrected in both languages.

## Tests

`tests/editor/uwb-planOps.test.ts`, 14 cases, written before the implementation:
- anchor defaults, purity, session creation; role-wise numbering and id uniqueness; tag role/z/name
- anchor + tag on `defaultScenario()` is schema-valid; a second UWB node reuses an existing session
- `uwbSessionIssue`: null for defaults and for a UWB-free plan; the slot-fit message
  (6 anchors at `slotRstu: 300`); the >9-anchor message; the block-fit message; the missing-session
  message; **null** for a non-UWB issue (an AP removed while stations remain)
- `removeNode` closes the session with the last UWB node; the AP is kept while a station exists and
  `removeNode` returns the scenario untouched; a UWB-only plan may drop its AP and stays schema-valid

## Verification

- `npx tsc -b` — clean. No `any`, no `@ts-ignore`, no `as unknown as` added.
- `npx vitest run` — **94 files / 1025 tests passed**. (The hash fixture `lesson-hashes.test.ts`
  and `mac-state-ifs.test.ts` are green; nothing in the fixture was touched.)
- `npx vite build` — clean (only the pre-existing chunk-size warning).
- No eslint config exists in the repo (`eslint.config.*` missing), so no lint step was run.
- Browser, `npx vite --port 5187`, driven with Playwright:
  - placed three anchors and one tag → session section appeared reading
    `3 anchors · 1 tag` … `slots per round 8 · rounds per block 12` (DS, 3 anchors ⇒ 2·3+2 = 8;
    240000/(8·2400) = 12), no issue line;
  - shortening the block to 12 RSTU produced the red line
    *"the UWB block fits 0 tags at 8 slots each (found 1); lengthen blockRstu or shorten slotRstu"*,
    which cleared on restoring 240000;
  - selecting an anchor showed only role / height / crystal offset (“drawn from the seed”) /
    tx power / delete — no Wi-Fi fields;
  - the AP's 🗑 was disabled with the new tooltip while stations existed, became enabled after both
    stations were deleted, and deleting it left a UWB-only plan;
  - switching to ▶ Simulate ran that UWB-only plan: four ranging lanes with Poll / Response frames
    on the timeline, range rings and the tag's slot label in the 3D scene, **0 console errors**;
  - the BSS totals table showed no node rows (all lanes are UWB) — the intended effect.
  - Server killed, screenshots and `.playwright-mcp` removed.

## Concerns

1. **`UwbSessionFields` props deviate from the brief.** The brief lists
   `{ session, anchors, tags, onChange }` but also says the section shows the `uwbSessionIssue`
   text — which the component cannot compute without the whole `Scenario`. I added an
   `issue: string | null` prop and the editor passes `uwbSessionIssue(scenario)`, keeping the
   component presentational. The alternative was passing the whole scenario in.
2. **The issue text is English-only.** The ruling says `uwbSessionIssue` must return the schema's
   own message rather than re-encode the rules; the schema's messages are not localised, so the red
   line under the session section reads in English in the ZH UI. The Chinese guide explains what
   each failure means, but the message itself is not translated. Localising it would mean either
   translating schema messages or mapping them back to keys — both re-encode the rules, so I left
   it. Flagging it as a product decision.
3. **The brief's step-1 example is arithmetically wrong.** It says `slotRstu: 300` with **4**
   anchors yields the slot-fit message; per `uwbSlotFitNs` a 4-anchor round needs 236.8 µs and a
   300 RSTU slot is 250 µs, so it fits. The threshold is 6 anchors (267.6 µs). The test uses 6
   anchors, treating the schema as the oracle as instructed. (The context note's `slotRstu: 285`
   would also fail, but on the schema's `min(300)` bound rather than on slot fit.)
4. **Id numbering is role-wise, not `sc.nodes.length`-wise** — see above. It satisfies the brief's
   stated expectation and produces readable names, but it is not literally "like `newTag` does it".
5. During the run another agent briefly had `src/uwb/view.ts` mid-edit, which failed one
   `tests/uwb/view.test.ts` case; that landed as `1c2b74a`/`2a24bae` before my final run, and the
   full suite is green at `42f941b`. Their untracked `tests/ui/uwb-guide.test.ts` was left alone —
   it may want an entry for the new EditorGuide sections.

---

# Fix round 1

**Commit:** `3fc67c2` — `fix(editor): AP tool for AP-less plans, guarded Wi-Fi tools, session panel polish`
(7 files, +199/−41). Review: `task-2-review.md`, verdict Spec APPROVED / Quality CHANGES REQUIRED,
1 blocking + 9 minor. All ten are addressed.

## Finding 1 (blocking) — deleting the AP was a one-way door

`planOps.ts`: `newAp(sc, pos)` places the plan's one AP — id `ap` (with the usual `while (used.has(id))`
fallback), name `AP`, z 2.0, `txPowerDbm: 20`, `caps: { generation: 'eht', features }` built from
`defaultFeatures('eht')`, `profiles: ['idle']`, position snapped. A second AP is refused: the scenario
is returned unchanged and the existing AP's id comes back. `hasAp(sc)` is the shared predicate.

`FloorPlanEditor.tsx`: a `📡 AP` / `📡 AP` tool in `TOOLS`, disabled (with `E.apExists` as the tooltip)
while the plan has one; `onPointerDown` has its own `if (hasAp(scenario)) return` guard. `EditorGuide`
gained a `📡 AP` entry in both languages.

Tests (`tests/editor/uwb-planOps.test.ts`, 3 new cases, 17 total): the AP comes back into a UWB-only
plan with every documented default and every `GEN_FEATURES.eht` flag on and the result is schema-valid
with the ranging session untouched; a second `newAp` returns the identical scenario object; the
re-placed AP can be deleted again.

## Finding 2 — Wi-Fi tools while there is no AP

`WIFI_TOOLS = ['sta', 'tag']` are disabled with `E.needApFirst` ("place an AP first: …" / "请先放置一个
AP：…") whenever `hasAp` is false, as is 🎲 Spawn STAs. `onPointerDown` guards both placement branches
independently, and a `useEffect` drops the held tool back to `select` when placing or deleting the AP
disables it under the user's hand.

## Finding 3 — channel hint

EN `uwbChannelHint` now reads: *"…Only the 1 m free-space term differs (48.7 dB against 50.5 dB), so
channel 9 costs a constant 1.8 dB at every distance."* The ZH string was reworded to match exactly.
(`uwbPl0Db(5) = 48.71 dB`, `uwbPl0Db(9) = 50.51 dB`, and `UWB_PL_EXP` is shared.)

## Finding 4 — round plan with no anchors

`plan` is `anchors > 0 ? roundPlan(session, anchors) : null` and the line is only rendered when `plan`
is non-null; the red issue line ("needs at least one anchor and one tag") stands alone. Verified in the
browser with a tag-first plan.

## Finding 5 — ppm suffix

New string `uwbPpmRange`: "±100 ppm; real crystals stay within ±20" / "±100 ppm；真实晶振通常在 ±20 以内".
`UWB_PPM_MAX` is no longer imported by the component.

## Finding 6 — retyping the RSTU fields

A local `RstuInput` holds the typed text in `useState<string | null>` and commits
`to3(clampField(draft, lo, hi, true))` on blur or Enter. The other fields keep the AMP-style
per-keystroke clamp as instructed. Browser-verified: clearing `240000` leaves the committed value at
200.0 ms, typing `120000` commits only on blur (→ 100.0 ms), and `241000` rounds to `240999` on commit.

## Finding 7 — schema parse per render

`const sessionIssue = useMemo(() => uwbSessionIssue(scenario), [scenario])`; the memo is passed to the
panel. `commit` replaces the scenario object on every real edit, so the identity dependency is exact.

## Finding 8 — dangling `selectedNodeId`

`deleteNode` now calls the store's `select(null)` when `physicalId(selectedNodeId) === id`, which covers
the MLO lane ids as well as the newly deletable AP. Kept inside the editor rather than `store.ts` to
stay within the commit's pathspec.

## Finding 9 — ppm patch

`uwb: { ...node.uwb, role, ppm }`.

## Finding 10 — orphan session

The section renders on `scenario.uwb` alone, so an imported session no device uses is visible; it then
shows `uwbNoNodes` ("no ranging device uses this session") and a `🗑 Remove session` button wired to
`commit({ ...scenario, uwb: undefined })`. The button is **disabled while any UWB device is in the
plan** — removing the session then would make the scenario invalid — with `uwbSessionInUse` explaining
why. Browser-verified by loading a hand-written scenario with `uwb` and no UWB nodes: the section
appeared, the button was enabled, and clicking it removed the section.

## Verification

- `npx vitest run tests/editor tests/model tests/ui` — **22 files / 229 tests passed** (17 in
  `tests/editor/uwb-planOps.test.ts`).
- `npx vite build` — clean.
- `npx tsc -b` — one diagnostic, `tests/course/_measure-blocks.test.ts(17,59): Property 'label' does
  not exist on type 'FrameField'`, in the other agent's in-flight lesson-4 files (`src/course/uwb/`,
  `tests/course/`, `src/course/lessonKit.ts` are all uncommitted in the worktree). Re-running the same
  compile with `tests/course` and `src/course/uwb` excluded gives **zero diagnostics**, so nothing in
  this round contributes to it.
- Browser pass on :5187 (server stopped afterwards, artefacts removed, localStorage cleared):
  AP tool disabled with its tooltip while an AP exists; after deleting both stations and the AP the
  AP tool enabled and STA / AMP tag / Spawn all disabled with "place an AP first"; placing an AP made
  a Wi-Fi 7 node with every feature on, re-disabled the AP tool and re-enabled the Wi-Fi ones.
  0 console errors.

## Concern

Finding 10's "remove session" button is disabled rather than always live: with UWB devices present the
schema requires the session, so an enabled button would be a trap. The orphan case — the only one the
finding describes as reachable — is fully served.
