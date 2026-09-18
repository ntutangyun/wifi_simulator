### Task 2: Editor — UWB anchors and tags, the session section, the AP rule

**Files:**
- Modify: `src/editor/planOps.ts`, `src/editor/FloorPlanEditor.tsx`, `src/editor/EditorGuide.tsx`, `src/ui/i18n.ts`, `src/ui/Inspector.tsx`
- Create: `src/uwb/ui/UwbNodeFields.tsx`, `src/uwb/ui/UwbSessionFields.tsx`
- Test: `tests/editor/uwb-planOps.test.ts` (+ extend the existing editor tests under `tests/editor/`)

**Interfaces:**

```ts
// src/editor/planOps.ts
export function newAnchor(sc: Scenario, pos: { x: number; y: number }): { sc: Scenario; id: string }   // id anchor-k, name `Anchor k`, z 2.2, txPowerDbm UWB_TX_POWER_DBM, uwb { role: 'anchor' }; creates sc.uwb = DEFAULT_UWB_SESSION if absent
export function newUwbTag(sc: Scenario, pos: { x: number; y: number }): { sc: Scenario; id: string }   // id uwb-k, name `UWB tag k`, z 1.0, role 'tag'
export function uwbSessionIssue(sc: Scenario): string | null   // the first schema message about the UWB session (slot fit, tags per block, anchors ≤ 9), else null — the editor shows it under the session section
// src/uwb/ui/UwbNodeFields.tsx: props { node: NodeCfg; onChange(patch: Partial<NodeCfg>): void } — role (read-only label), height z (0.1–3 m), crystal offset ppm (−100…100, blank = drawn), tx power (−30…0 dBm)
// src/uwb/ui/UwbSessionFields.tsx: props { session: UwbSessionCfg; anchors: number; tags: number; onChange(patch: Partial<UwbSessionCfg>): void } — method (SS/DS), block RSTU (with the ms it equals), slot RSTU (ms), channel (5/9), timestamp noise ps, clock-estimate noise ppm, NLOS on/off; shows slots per round and rounds per block computed from `roundPlan`, and `uwbSessionIssue` text when not null.
```

Editor changes: two new tools (`anchor`, `uwbTag`) in the tool row with EN/ZH labels; node circles: anchor `#f59e0b` r 0.3 (square if the SVG allows, else circle), tag `#fbbf24` r 0.22; node list rows with the same colours; the delete button on the AP row is enabled when the scenario has no `sta`/`amp` node (rule: an AP may be deleted only then; the row's tooltip says so); the selected-node panel renders `UwbNodeFields` for `kind === 'uwb'` (and none of the Wi-Fi fields); a **UWB session** section appears below the node list whenever any UWB node exists; removing the last UWB node removes `sc.uwb`. `Inspector.tsx`: the no-selection BSS totals table lists Wi-Fi lanes only. `EditorGuide.tsx`: entries "📍 UWB anchor", "📱 UWB tag", "UWB session" in EN and ZH.

- [ ] **Step 1: Write the failing tests** `tests/editor/uwb-planOps.test.ts`: `newAnchor` on `defaultScenario()` adds a valid node and the default session (schema-valid); a second anchor gets `anchor-2`; `newUwbTag` role tag z 1.0; `uwbSessionIssue` returns the slot-fit message for `slotRstu: 300` with 4 anchors and null for the defaults; removing the last UWB node clears `uwb` (a `removeNode` helper if one exists, else the editor's function extracted into planOps).
- [ ] **Step 2–4:** implement; `npx vitest run`, `npx tsc -b`, `npx vite build`; load the editor in the browser, place an anchor and a tag, simulate, confirm rings appear and no console errors; kill the server.
- [ ] **Step 5: Commit** `feat(editor): UWB anchors, tags and the ranging session; AP deletable in UWB-only plans`.

---

