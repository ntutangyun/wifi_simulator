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

