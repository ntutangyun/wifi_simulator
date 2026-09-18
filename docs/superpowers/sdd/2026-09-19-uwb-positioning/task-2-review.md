# Task 2 review — Editor: UWB anchors and tags, the session section, the AP rule

Reviewed: `42f941b` (`1c2b74a..42f941b`), worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`, branch `feat/uwb-ranging`.
Concurrent edits by another agent (`src/ui/Guide.tsx`, `src/ui/glossary.ts`, `README.md`, `tests/ui/uwb-guide.test.ts`) were ignored.

## Verdict

Spec: APPROVED
Quality: CHANGES REQUIRED

## Verification run

- `npx vitest run tests/editor tests/model tests/ui tests/engine/lesson-hashes.test.ts` — **23 files / 227 tests passed**, including `tests/editor/uwb-planOps.test.ts` (14) and `tests/engine/lesson-hashes.test.ts` (1, fixture untouched). An earlier run of the same command failed 11 cases in `tests/ui/uwb-guide.test.ts`; that is the other agent's in-flight file and it was green by the second run.
- `npx tsc -b` — exit 0, no diagnostics.
- No `any`, `@ts-ignore`, `@ts-expect-error` or `as unknown as` in the added lines.

## Spec conformance (each binding constraint checked)

| Constraint | Result |
| --- | --- |
| `newAnchor` / `newUwbTag` defaults: z 2.2 / 1.0, `UWB_TX_POWER_DBM`, `profiles ['idle']`, `caps { generation: 'nonht', features: {} }`, `uwb.role`, 0.1 m snap | met (`planOps.ts:201-224`) |
| session created on the first UWB node (`sc.uwb ?? { ...DEFAULT_UWB_SESSION }`), removed with the last (`removeNode`) | met (`planOps.ts:224`, `planOps.ts:249-253`) |
| `uwbSessionIssue` via `ScenarioSchema.safeParse`, first UWB-related message or null, no rule re-encoded | met (`planOps.ts:264-271`); path `['uwb', …]` covers the field rules, the message regex covers the path-less `superRefine` issues |
| editor tools for both kinds, EN/ZH labels | met (`FloorPlanEditor.tsx:29`, `i18n.ts` `editor.tools.anchor` / `.uwbTag`) |
| node circles / list rows with the amber colours | met (`nodeColor`, anchor `#f59e0b` 0.6 m square, tag `#fbbf24` r 0.22; list swatch square for an anchor) |
| `UwbNodeFields`: role read-only, z, ppm (blank = drawn), tx power | met (`src/uwb/ui/UwbNodeFields.tsx`) |
| `UwbSessionFields`: method, block/slot RSTU with ms, channel, ts noise ps, cfo ppm, NLOS; slots/round + rounds/block from `roundPlan`; issue in red | met (`src/uwb/ui/UwbSessionFields.tsx`) |
| AP deletable only when no `sta`/`amp`, tooltip EN/ZH | met (`canDeleteNode`, `apNoDelete` rewritten in both tables) |
| BSS totals list Wi-Fi lanes only | met (`Inspector.tsx:181`, filter `!n.uwb`; the per-node table reuses the same filtered list) |
| `EditorGuide` entries EN/ZH | met; the stale "the AP … cannot be deleted" sentence was corrected in both languages too |
| every new i18n string in both tables, real Chinese | met (32 new `editor.*` keys, EN and ZH) |

Controller rulings were applied as stated and are **not** counted as findings: the extra `issue` prop on `UwbSessionFields`, the schema message shown unlocalised, per-role id numbering, and the 6-anchors-at-300-RSTU slot-fit threshold.

Checks from the brief's "look for" list that came back clean:
- **Session/nodes never diverge.** `removeNode` is the only node-removal path in the editor; it drops `sc.uwb` exactly when the last `kind: 'uwb'` node goes. The household dropdown replaces the whole scenario (`h.scenario()`), so it cannot leave an orphan session either.
- **A tag past rounds-per-block always shows.** The schema's `fits = floor(blockRstu / (slots·slotRstu))` and the panel's `roundsPerBlock = floor(blockNs / roundNs)` cannot disagree: `rstuNs(x) = x·2500/3` is exact for every multiple of 3, and both fields are constrained to multiples of 3.
- **`clampField` bounds vs the schema's.** Every bound in the two components sits inside the schema's (`blockRstu` 3…6e6 + `to3`, `slotRstu` 300…60000 + `to3`, `tsNoisePs` 0…10000, `cfoNoisePpm` 0…20, `ppm` ±100 = the schema's own range). No field edit can commit a scenario the schema rejects on a field rule.
- **AP delete vs `linkPlanFor`.** `linkPlanFor` already tolerates an AP-less scenario (`caps.ts:131`) and `Simulation` guards on `const ap = …; if (ap)` (`simulation.ts:78`), so a UWB-only plan runs.
- **Id generation vs lesson ids.** Lesson UWB nodes get explicit ids from `lessonKit.anchor`/`uwbTag`; the `while (used.has(id))` loop makes a collision impossible whatever the lesson chose.
- **React keys.** Neither new component holds local state or renders a list, and both are fully controlled from props, so re-selecting a node cannot leak the previous node's values.

## Findings

### 1. Deleting the AP is a one-way door: there is no way to put one back — **blocking**

`src/editor/FloorPlanEditor.tsx:29` (`TOOLS`), `src/editor/planOps.ts:238-244` (`canDeleteNode`)

`TOOLS` is `['select', 'room', 'door', 'window', 'sta', 'tag', 'anchor', 'uwbTag']` — there is no `ap` placement tool, the property panel has no node-kind selector, and `commit` is a bare `setScenario` with no undo stack (`FloorPlanEditor.tsx:80`). Before this commit that was sound, because the AP could never be removed. Now the guide actively invites the user to delete it ("🗑 Delete node … a plan of nothing but UWB devices has no BSS at all and runs happily without one"), and once they do, the only ways back are 📂 Load, ⬆ Import or a household preset — each of which discards the rooms, walls and nodes they just drew.

Do one of: add an `ap` tool to `TOOLS` (label in both tables, `EditorGuide` entry, and the placement branch in `onPointerDown` rejecting a second AP), or make the `sta` / `tag` placement path re-create a default AP when the plan has none. The first is the smaller change and pairs naturally with the new delete rule.

### 2. After the AP is gone, the STA / AMP tools and 🎲 Spawn STAs still build a scenario the schema rejects — **minor**

`src/editor/FloorPlanEditor.tsx:126-145` (`onPointerDown`), `:308-311` (spawn button)

`ScenarioSchema` fails with `scenario must have exactly one AP (found 0)` as soon as a `sta` or `amp` node exists without an AP. Nothing in the editor says so: `uwbSessionIssue` filters that message out on purpose (and its own test pins that behaviour, `tests/editor/uwb-planOps.test.ts:93-98`), the session section only covers ranging, and the failure finally arrives at ▶ Simulate as the raw Zod text through `Simulation`'s `ScenarioSchema.parse` → worker `post({type:'error'})` → `useUi.simError`.

Either disable the `sta` / `tag` tools and the spawn button while `nodes.every(n => n.kind !== 'ap')` (with the reason in the tooltip), or fold a general `scenarioIssue(sc)` line into the editor next to the session issue. Fixing finding 1 by re-creating the AP on placement would close this one too.

### 3. The English channel hint states a distance-dependent loss that the model does not have — **minor**

`src/ui/i18n.ts`, `editor.uwbChannelHint` (EN): *"channel 5 is 6489.6 MHz, channel 9 is 7987.2 MHz — the higher channel loses about 1.8 dB more per decade of range"*

The channel enters the model only through `uwbPl0Db` = `20·log10(4π·f/c)` (`src/uwb/phy.ts:62-66`), the reference loss at 1 m; `UWB_PL_EXP` is the same for both channels (`src/uwb/channel.ts:123`). The difference is therefore a **constant** 20·log10(7987.2/6489.6) = 1.80 dB at every distance, not a per-decade slope. The Chinese string already says the right thing ("同样距离下的自由空间损耗约多 1.8 dB"), so the two languages currently disagree. Reword the EN string to match the ZH one.

### 4. The session panel prints a round plan that does not exist when there are no anchors — **minor**

`src/uwb/ui/UwbSessionFields.tsx:26` — `const plan = roundPlan(session, Math.max(1, anchors))`

Drop a tag first (a natural order: tag, then anchors) and the section reads *"slots per round 4 · rounds per block 12"* for a plan with zero anchors, while `UwbNetwork` builds its plan from the real count (`src/uwb/network.ts:41`). The red issue line ("needs at least one anchor and one tag") does appear beside it, but the two lines contradict each other. Render the plan line as `—` (or skip it) when `anchors === 0` instead of substituting 1.

### 5. The ppm field is labelled ±20 but accepts ±100 — **minor**

`src/uwb/ui/UwbNodeFields.tsx:38-40`

The suffix is `±${UWB_PPM_MAX} ppm` = "±20 ppm" whenever a value is set, yet `min`/`max` and `clampField` are ±100 (the schema's range, as the brief requires). A reader takes the suffix for the field's range. The tooltip already carries the standard's ±20 correctly, so either show the control's own range in the suffix or make the suffix read "standard ±20".

### 6. Per-keystroke clamping makes the block and slot fields hard to retype — **minor**

`src/uwb/ui/UwbSessionFields.tsx:37-49`, `to3` at `:78-80`; same class in `UwbNodeFields.tsx:32,43`

The inputs are controlled and every keystroke is committed through `clampField` + `to3`. Clearing `240000` commits `3` immediately (`clampField` returns `lo` for `''`), and each following digit is re-clamped and re-rounded to a multiple of 3, so a six-digit block cannot be typed digit by digit. The same shape bites the signed fields: typing `-` into tx power reports `''` to the handler and commits `−30`, overwriting the minus sign. This follows the existing AMP-field pattern, so it is consistent rather than novel, but a 6-digit field is where it starts to hurt. Hold a local draft string and commit on blur/Enter, or only clamp when the parsed value is finite and the raw string is non-empty.

### 7. A full schema parse runs on every editor render while a UWB plan is open — **minor**

`src/editor/FloorPlanEditor.tsx:449` — `issue={uwbSessionIssue(scenario)}`

`uwbSessionIssue` runs `ScenarioSchema.safeParse` over the whole scenario (rooms, walls, every node, plus both `superRefine` passes) on each render of `FloorPlanEditor`. The editor re-renders per pointer-move frame while a node is being dragged (`updateNode` → `commit` → `setScenario`), so a drag re-parses the entire scenario at frame rate. Wrap it in `useMemo(() => uwbSessionIssue(scenario), [scenario])`.

### 8. `useUi.selectedNodeId` can now dangle on the AP — **minor**

`src/ui/store.ts:136-138` (`setScenario`), `src/editor/FloorPlanEditor.tsx:199-203` (`deleteNode`)

`deleteNode` clears the editor's local `sel`, but `setScenario` leaves the store's `selectedNodeId` untouched, so it keeps naming a node that no longer exists. `Inspector` survives on its `!view.nodes[selectedNodeId]` guard. This is pre-existing behaviour for stations, but the AP was previously undeletable, so `selectedNodeId === 'ap'` is a newly reachable dangling value. Clearing it in `setScenario` when the id is no longer in `sc.nodes` is a one-line fix.

### 9. The ppm edit rebuilds `node.uwb` from scratch — **minor**

`src/uwb/ui/UwbNodeFields.tsx:19,36-38`

`role` falls back to `'tag'` (`node.uwb?.role ?? 'tag'`) and the patch writes `uwb: { role, ppm }`, discarding anything else in `node.uwb`. Today `UwbNodeCfg` has exactly these two fields and a `kind: 'uwb'` node without `uwb` is rejected by the schema, so nothing is lost — but editing ppm on such a node would silently stamp it `tag`, and the next field added to `UwbNodeCfg` would be dropped on every ppm keystroke. Write `uwb: { ...node.uwb, role, ppm }`.

### 10. An orphan `scenario.uwb` cannot be seen or removed in the editor — **minor**

`src/editor/FloorPlanEditor.tsx:444` — the section renders only when `uwbNodes.length > 0 && scenario.uwb`

Nothing in the schema forbids a session with no UWB nodes, and the editor's own paths never create one, so this is only reachable through ⬆ Import of a hand-written file. Such a session then stays invisible and rides along into every ⬇ Export. Either have the schema reject it, or have `removeNode`'s sibling logic strip it on load. Lowest priority of the list.

---

## Re-review (fix round 1)

Reviewed: `3fc67c2` (`fix(editor): AP tool for AP-less plans, guarded Wi-Fi tools, session panel polish`).
The package spans `42f941b..3fc67c2` and therefore also carries Task 3's docs commit `a03085d`; `src/ui/Guide.tsx`, `src/ui/glossary.ts`, `README.md` and `tests/ui/uwb-guide.test.ts` were ignored, as instructed.

### Verdict

Spec: APPROVED
Quality: APPROVED

### Verification run

- `npx vitest run tests/editor tests/model tests/ui` — **234 passed / 1 failed**. The single failure is `tests/ui/uwb-guide.test.ts > quotes the FoM texts the engine decodes`, in the other agent's in-flight file, which is out of scope. Every Task-2 suite is green, `tests/editor/uwb-planOps.test.ts` now at 17 cases.
- `npx tsc -b` — exit 0, no diagnostics (the `tests/course/_measure-blocks.test.ts` diagnostic the report mentions is gone; the other agent landed their fix).

### Ruling-by-ruling

1. **AP tool + `newAp`** — closed. `newAp` (`planOps.ts:197-215`) refuses a second AP by returning the identical scenario object and the existing id, snaps the position, and builds `caps` from `defaultFeatures('eht')`. The tool is in `TOOLS`, disabled with `E.apExists` while an AP exists, and `onPointerDown` carries its own `if (hasAp(scenario)) return` so the disabled button is not the only guard. Three new tests cover the round trip, the refusal (`expect(same).toBe(sc)`) and re-deleting the replaced AP. `EditorGuide` gained a `📡 AP` entry in both languages.
2. **Wi-Fi tools and Spawn without an AP** — closed. `WIFI_TOOLS = ['sta','tag']` and 🎲 Spawn are disabled with `E.needApFirst`; both placement branches guard independently; the `useEffect([tool, apPresent])` drops a held tool back to `select` when the AP appears or goes. Both strings present in EN and ZH.
3. **Channel hint** — closed and numerically correct. `uwbPl0Db(5) = 20·log10(4π·6.4896e9/c) = 48.69 dB`, `uwbPl0Db(9) = 50.50 dB`, difference 1.80 dB, and `UWB_PL_EXP` is shared, so "a constant 1.8 dB at every distance" is exactly what the model does. The ZH string was reworded to say the same thing; the two languages now agree.
4. **Round plan with no anchors** — closed. `plan = anchors > 0 ? roundPlan(session, anchors) : null` and the line renders only when `plan` is non-null; no fabricated anchor count remains.
5. **ppm label** — closed. `UWB_PPM_MAX` is no longer imported by the component; the suffix is the new `uwbPpmRange` ("±100 ppm; real crystals stay within ±20" / "±100 ppm；真实晶振通常在 ±20 以内"), which states the control's own range.
6. **RSTU fields draft-then-clamp** — closed for the two fields the ruling names. `RstuInput` holds `useState<string | null>`, renders `draft ?? value`, and commits `to3(clampField(...))` on blur or Enter only when the user actually typed. The two instances are fixed sibling positions, so neither can inherit the other's draft. The remaining per-keystroke-clamped fields (ppm, height, tx power, the two noise knobs) were left as the ruling scopes it.
7. **`useMemo` on the schema parse** — closed. `sessionIssue` is memoised on `scenario`, and `commit` always replaces the scenario object, so the identity dependency is exact.
8. **Selection cleared on delete** — closed. `deleteNode` calls the store's `select(null)` when `physicalId(selectedNodeId) === id`, which also covers MLO virtual ids.
9. **ppm patch merges** — closed. `uwb: { ...node.uwb, role, ppm }`.
10. **Session visible whenever `sc.uwb`, remove button disabled while devices exist** — accepted as ruled. The section renders on `scenario.uwb` alone; `orphan = anchors === 0 && tags === 0` drives both the `uwbNoNodes` line and the button's `disabled`, with `uwbSessionInUse` as the tooltip otherwise. `uwbSessionIssue` returns null for an orphan session (the schema permits one), so the panel is the only thing that surfaces it — which is the point of the change.

No regression found in the previously approved behaviour: the node defaults, session open/close, `uwbSessionIssue`, the amber canvas and list styling, the AP-delete rule, the Wi-Fi-only BSS totals and the EN/ZH guide entries are all untouched or only additively changed, and every new string exists in both tables with real Chinese.

### Remaining findings

#### 11. The re-placed AP is not the AP that was deleted — **minor**

`src/editor/planOps.ts:197-215`

Two small differences from every AP the project ships:

- `newAp` appends to `sc.nodes`, so a re-placed AP sits **last** in 🗂 Objects, and node order is lane order (`src/model/lanes.ts:11`) — its timeline lane therefore renders at the bottom, while `defaultScenario()` and every household put the AP first. The user can walk it up with ▲, but `nodes: [node, ...sc.nodes]` would match the convention for free.
- `defaultFeatures('eht')` turns on `mumimo`, which the shipped default AP leaves off (`scenario.ts:496`), so delete-then-replace silently upgrades the BSS to DL MU-MIMO. The guide entry does say "Wi-Fi 7 with every feature on" in both languages, so this is disclosed rather than drift; it is listed only so the choice is a recorded one.

Neither affects schema validity or any test, and neither blocks the task.
