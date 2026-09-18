# UWB Positioning, Scene, Editor and Course Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the first UWB slice: the 3-D scene overlay (range rings, position estimate, error ellipse), editor support for UWB anchors, tags and the ranging session, the Guide / glossary / README entries, and the last two lessons of the UWB track (ranging blocks; from ranges to a position).

**Architecture:** Everything builds on the engine and seams of `docs/superpowers/plans/2026-09-18-uwb-core.md` (complete on `feat/uwb-ranging`). New UWB code stays under `src/uwb/` (`scene.ts`, `ui/UwbSessionFields.tsx`, `ui/UwbNodeFields.tsx`, `course/uwb/*`); core files get one hook each (viewport, editor, planOps, Guide, glossary, README, i18n). Nothing moves.

**Tech Stack:** TypeScript, Vite, React, Three.js, zod, vitest (existing). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-18-uwb-ranging-design.md` — Part C (scene, editor, guide, glossary) and Part D lessons 4 and 5. Read the whole-branch review's "carry to the positioning plan" list in `docs/superpowers/sdd/2026-09-18-uwb-core/branch-review.md` (exported with the ledgers) before Task 1.

## Global Constraints

- Every user-visible string in both `en` and `zh` tables of `src/ui/i18n.ts`; real Chinese, never pasted English.
- `tests/engine/lesson-hashes.test.ts` passes **without** regeneration in Tasks 1–4; Tasks 5 and 6 regenerate (`UPDATE_HASHES=1`) and the fixture diff must only **add** keys.
- `npx tsc -b`, `npx vite build` and `npx vitest run` green after every task; no `any`, no `@ts-ignore`, no `as unknown as`.
- The 3-D scene's axis convention is `three.x = pos.x, three.y = pos.z (height), three.z = pos.y` (see `src/scene/effects.ts` constructor); everything drawn "on the floor" sits at `three.y = 0.01`.
- Lesson contract (EN + ZH, body → observe → tryThis → quiz, `lessonMinutes` 15–25, every empirical claim pinned by a test that quotes the sentence, constants imported from the engine, envelope claims pinned to values or 4σ, never a 3σ bound one draw from flapping). Budget words from the start: 4 observe + 2 tryThis leave ~1 350 English words for 25 minutes.
- Commit after each task with a conventional message ending with the two trailer lines
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_016HUme5YXCB8DTeScyfn7pL`; commit by explicit pathspec.
- Work in `D:\wifi_sim\.claude\worktrees\feat-link-2g` on branch `feat/uwb-ranging`; plain single git commands only.

---

## File structure

| File | Responsibility |
|---|---|
| `src/uwb/scene.ts` | `UwbOverlay`: range rings per anchor, estimate cross, 1-σ ellipse, fading with the block. |
| `src/scene/viewport.tsx` | Adds the overlay when the scenario has UWB nodes; calls `overlay.update(view)` per frame. |
| `src/editor/planOps.ts` | `newAnchor`, `newUwbTag` (ids, defaults, session created on first UWB node). |
| `src/editor/FloorPlanEditor.tsx` | Tools `anchor` / `uwbTag`, node circles and list rows for UWB kinds, `UwbNodeFields`, `UwbSessionFields`, AP deletion rule. |
| `src/uwb/ui/UwbNodeFields.tsx`, `src/uwb/ui/UwbSessionFields.tsx` | The per-node and per-session editor sections. |
| `src/editor/EditorGuide.tsx` | Entries for the two new objects and the session section. |
| `src/ui/Guide.tsx`, `src/ui/glossary.ts`, `README.md` | Section "11 · UWB ranging", glossary group `uwb`, README rows. |
| `src/ui/Inspector.tsx` | BSS totals exclude UWB lanes (parked item from the core plan). |
| `src/course/uwb/uwb-blocks.ts`, `src/course/uwb/uwb-position.ts` | Lessons 4 and 5. |
| `tests/uwb/scene.test.ts`, `tests/editor/uwb-planOps.test.ts`, `tests/ui/uwb-guide.test.ts`, `tests/course/uwb-blocks.test.ts`, `tests/course/uwb-position.test.ts` | Tests. |

---

### Task 1: Scene overlay — range rings, estimate and error ellipse

**Files:**
- Create: `src/uwb/scene.ts`
- Modify: `src/scene/viewport.tsx`, `src/uwb/view.ts` (add `block` to `UwbRangeView`), `src/uwb/records.ts` only if a field is missing
- Test: `tests/uwb/scene.test.ts`

**Interfaces:**

```ts
// src/uwb/view.ts — UwbRangeView gains `block: number` (the block the latest range came from), set from UWB_RANGE.block.

// src/uwb/scene.ts
import * as THREE from 'three'
import type { Scenario } from '../model/scenario'
import type { ViewState } from '../model/view'
export const UWB_RING_COLOR = 0xfbbf24, UWB_FIX_COLOR = 0xf59e0b, UWB_ELLIPSE_COLOR = 0xf59e0b
export class UwbOverlay {
  readonly group: THREE.Group           // name 'uwb-overlay'
  constructor(sc: Scenario)             // remembers anchors' and tags' positions (scene axes) and the block length in ns
  /** Rebuild/refresh from the live view: one ring per (tag, anchor) with a range, the tag's fix and ellipse. */
  update(vs: ViewState): void
  dispose(): void
}
```

Behaviour:
- For every tag lane with `uwb.ranges`: a thin `THREE.LineLoop` circle (64 segments) of radius `distM` in the horizontal plane, centred on the anchor's (x, y) at floor height, colour `UWB_RING_COLOR`. Opacity = `0.45 × max(0, 1 − ageFraction)` where `ageFraction = (vs.t − roundEndNs) / blockNs` and `roundEndNs` is taken from the tag's current block: `block × blockNs + (round + 1) × roundNs` (block/round/roundNs from the tag's `UwbNodeView` and the session). Rings from a block older than `uwb.block − 1` are not drawn.
- The fix: a small cross (two 0.3 m lines) at (position.x, position.y) on the floor, colour `UWB_FIX_COLOR`; the 1-σ ellipse as a `LineLoop` with semi-axes `a`, `b` (metres; drawn at 3× so it is visible: state the factor in a constant `ELLIPSE_DRAW_SCALE = 3` and in the tooltip strings of Task 3's guide). Both hidden when `position` is null.
- Geometry objects are reused (keyed by `tag:anchor` and `tag:fix`), disposed on removal.
- `viewport.tsx`: `if (sc.nodes.some(n => n.kind === 'uwb')) { overlay = new UwbOverlay(sc); scene.add(overlay.group) }`, `overlay?.update(view)` in the render loop, `overlay?.dispose()` in cleanup.

- [ ] **Step 1: Write the failing tests** `tests/uwb/scene.test.ts` (three.js runs headless in vitest with the `three` package; no renderer needed): build the lesson-3 (DS) scenario via `Simulation`, run 25 ms, take `sim.view`; `new UwbOverlay(sc).update(view)` → the group has 4 rings + 1 cross + 1 ellipse; ring radii equal `uwb.ranges[anchor].distM` to 1e-9; ring opacity 0.45 at `t = roundEnd`, ≈ 0 at `t = roundEnd + blockNs`; at 5 ms (before any range) the group is empty; after `update` with a view whose position is null the cross and ellipse are absent; `dispose()` empties the group.
- [ ] **Step 2: Run** — failure. **Step 3: Implement.** **Step 4:** `npx vitest run`, `npx tsc -b`, `npx vite build`; open the app (`npx vite --port 5176`, kill afterwards) on any Wi-Fi scenario to confirm no regression.
- [ ] **Step 5: Commit** `feat(scene): UWB overlay with range rings, position fix and error ellipse`.

---

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

### Task 3: Guide section, glossary group, README rows

**Files:**
- Modify: `src/ui/Guide.tsx` (section "11 · UWB ranging" EN and ZH: what a ranging counter is, RMARKER, SS vs DS in two sentences, blocks/rounds/slots, what the rings and the ellipse mean incl. the 3× draw factor, the model numbers), `src/ui/glossary.ts` (group `uwb` with the spec's term list: UWB, HRP UWB PHY, RMARKER, ranging counter / RCTU, RSTU, STS, SP1, SS-TWR, DS-TWR, ranging block / round / slot, controller / controlee, initiator / responder, RRTI / RMI / ARC / RDM IE, FoM, NLOS, GDOP, error ellipse — each with the value the engine uses), `README.md` (feature bullet; a conformance table "802.15.4-2024 HRP UWB ranging" with rows standard / FiRa / model like the AMP rows; known simplifications: no CCA, sensitivity-only reception, 2-D fix, no AoA/TDoA)
- Test: `tests/ui/uwb-guide.test.ts`: the glossary group exists with ≥ 18 items, every item bilingual; the Guide renders (react-dom/server `renderToStaticMarkup`) with the heading "11 · UWB ranging" in EN and "11 · UWB 测距" in ZH; README contains the conformance heading.

- [ ] **Step 1: Write the failing test.** **Step 2–4:** implement, run, build. **Step 5: Commit** `docs(uwb): guide section, glossary group and README conformance rows`.

---

### Task 4: BSS totals and any leftover core-plan carry-overs

**Files:** `src/ui/Inspector.tsx` (if not done in Task 2), `src/uwb/ui/rows.ts`, tests.

Fold anything the core plan's final review carried over that Tasks 1–3 did not close (read `docs/superpowers/sdd/2026-09-18-uwb-core/branch-review.md` §"Carry to the positioning plan" and the ledger's parked items). If nothing remains, record "nothing left" in the ledger and skip the commit.

---

### Task 5: Lesson 4 "Blocks, rounds and slots"

**Files:**
- Create: `src/course/uwb/uwb-blocks.ts`; modify `src/course/lessons.ts`; regenerate the hash fixture (additions only)
- Test: `tests/course/uwb-blocks.test.ts`

Lesson (`id 'uwb-blocks'`, `module 12`, title "Blocks, rounds and slots" / 块、轮与时隙):

- Scenario: `oneRoom()`, four anchors on lesson 2's 3.50 m ring around (5, 4) at z 2.2, three tags at z 1.0: `uwb-1` (5, 4), `uwb-2` (3, 2.5), `uwb-3` (7.5, 6); DS-TWR, defaults (block 240 000 RSTU, slot 2 400 RSTU), nlos off, ppm drawn (undefined). Variant: `slotRstu: 600` ("0.5 ms slots" / "0.5 ms 时隙").
- Body: source sentence (§10.32.2 block/round/slot, RSTU §10.29.1.5; FiRa's 2 ms / 200 ms; model numbers); the block picture (`table`: block 200 ms = 240 000 RSTU, round 10 slots = 20 ms, 10 rounds per block, tag k in round k); the ARC IE (block/round/slot durations) and the RDM IE (slot assignment) in the poll; transmission at the slot boundary (transmission offset 0); the radio-on argument (a tag listens and transmits only in its own round: 20 ms of 200 ms = 10 %; the anchors are on for every round that has a tag: 60 ms = 30 %); why the slot is 2 ms when the longest frame is 236.6 µs (receiver processing, the FiRa margin); the 0.5 ms variant (round 5 ms, radio-on 2.5 %, the slot-fit rule that stops you below 237 µs).
- Pinned: `UWB_ROUND` at 0 / 20 / 40 ms and 200 / 220 / 240 ms; `UWB_ROUND_END` at 20 / 40 / 60 ms; a poll's `TX_START.t` equals its slot start exactly; `roundPlan` numbers; the tag's radio-on share computed from its MAC_STATE spans (`uwbWait`/`rx`/`tx` time over the block) = 10.0 %, anchors 30.0 %; the variant's 2.5 %; the schema rejects `slotRstu: 282` (235 µs) with four anchors and accepts 300… no: accepts 285? Compute from `uwbPpduNs(uwbFinalBytes(4)) + 200 = 236 803 ns` → minimum slot 285 RSTU (237 500 ns); pin that boundary; a `UWB_POSITION` for each tag every block.
- 4 observe, 2 tryThis (the variant; delete one anchor in the editor and read the new slot count — an editor-referencing experiment is allowed now), 3 quiz.

- [ ] **Steps:** measure first, test, lesson, register, regenerate hashes (additions only), `npx vitest run`, `npx tsc -b`, `npx vite build`, commit `feat(course): UWB lesson "Blocks, rounds and slots"`.

---

### Task 6: Lesson 5 "From four ranges to a point"

**Files:**
- Create: `src/course/uwb/uwb-position.ts`; modify `src/course/lessons.ts`; regenerate the hash fixture (additions only)
- Test: `tests/course/uwb-position.test.ts`

Lesson (`id 'uwb-position'`, `module 12`, title "From four ranges to a point" / 从四个距离到一个点):

- Scenario: `oneRoom()`, anchors in the four corners at (0.5, 0.5), (9.5, 0.5), (0.5, 7.5), (9.5, 7.5), z 2.2; tag `uwb-1` at (4, 3.5, 1.0); DS-TWR, nlos on, ppm drawn. Variants: "A brick wall in one path" / 一堵砖墙挡住一条路径 — a brick segment `brick(2, 1.5, 2, 3)` between the tag and anchor (0.5, 0.5) only (verify with `wallsCrossed` that exactly that pair crosses it); "Three anchors" / 三个锚点 — drop the (9.5, 7.5) anchor.
- Body: source sentence (§10.29.1.7 FoM; the solver, GDOP and ellipse are model); trilateration as least squares (the residual, the Jacobian rows as unit vectors); the rings in the scene; GDOP at the tag's spot (quote the engine's value); the error ellipse (1-σ; drawn 3×); what a wall does: a 2.0 ns excess delay = 0.60 m on that one range (`UWB_NLOS_NS.brick × C`), the FoM byte flips to 75 % within 12 ns, and the fix shifts by less than 0.60 m in the direction away from that anchor (quote the measured shift); three anchors: GDOP rises (quote), the ellipse stretches.
- Pinned: the LOS fix error within 4σ_r·GDOP over the first N blocks (pin the measured values too); GDOP from `solvePosition` on exact ranges; the ellipse axes; the NLOS range's bias = `UWB_NLOS_NS.brick · C_M_PER_NS` = 0.5996 m ± 4σ and its FoM 0x7b, the other three 0x16; the fix shift magnitude and direction sign; the three-anchor GDOP and axis ratio; positions every block.
- 4 observe, 2 tryThis, 3 quiz.

- [ ] **Steps:** as Task 5; commit `feat(course): UWB lesson "From four ranges to a point"`.

---

## Self-review

- Spec coverage: Part C scene → Task 1; editor → Task 2; guide/glossary → Task 3; Part D lessons 4–5 → Tasks 5–6; core-plan carry-overs → Task 4.
- Type consistency: `UwbRangeView.block` (Task 1) used by the overlay; `roundPlan` (core plan) used by the session fields and lesson 4's test; `uwbSessionIssue` (Task 2) mirrors the schema's messages; `UWB_ROUND_END` (core fix wave) used by lesson 4's pins.
- Every step names its tests and the values or the function that produces them.
