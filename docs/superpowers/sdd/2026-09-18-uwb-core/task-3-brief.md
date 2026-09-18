### Task 3: Position solver with GDOP and the error ellipse

**Files:**
- Create: `src/uwb/position.ts`
- Test: `tests/uwb/position.test.ts`

**Interfaces:**

```ts
export interface AnchorPos { id: string; x: number; y: number; z: number }
export interface Ellipse { a: number; b: number; thetaRad: number }   // 1-σ semi-axes (a ≥ b), major-axis angle from +x
export interface Fix { x: number; y: number; gdop: number; ellipse: Ellipse; residualM: number; iterations: number }
/** √2 · c · σ_ts: two noisy receive counters per range. tsNoisePs → metres. */
export function rangeSigmaM(tsNoisePs: number): number
/**
 * Gauss–Newton on (x, y) with the tag's z known. Residual r_i = ‖p − a_i‖ − d_i.
 * Start at the anchors' centroid; stop after 20 iterations or a step under 1 mm.
 * null when fewer than 3 ranges match an anchor. Σ = σ_r²·(JᵀJ)⁻¹ (J = rows of horizontal unit vectors
 * (p − a_i)/‖p − a_i‖, x and y components only); gdop = √trace((JᵀJ)⁻¹); ellipse from Σ's eigen-decomposition.
 */
export function solvePosition(anchors: AnchorPos[], ranges: { id: string; distM: number }[], zTag: number, sigmaRangeM: number): Fix | null
```

Eigen-decomposition of the symmetric 2×2 `[[sxx, sxy], [sxy, syy]]`: `tr = sxx + syy`, `det = sxx·syy − sxy²`, `λ₁,₂ = tr/2 ± √(tr²/4 − det)` (clamp the root's argument at 0), `a = √λ₁`, `b = √λ₂`, `thetaRad = ½·atan2(2·sxy, sxx − syy)`.

- [ ] **Step 1: Write the failing tests** `tests/uwb/position.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { rangeSigmaM, solvePosition, type AnchorPos } from '../../src/uwb/position'

const square: AnchorPos[] = [
  { id: 'a1', x: 0, y: 0, z: 1 }, { id: 'a2', x: 10, y: 0, z: 1 }, { id: 'a3', x: 0, y: 10, z: 1 }, { id: 'a4', x: 10, y: 10, z: 1 },
]
const dist = (a: AnchorPos, x: number, y: number, z: number) => Math.hypot(a.x - x, a.y - y, a.z - z)
const rangesTo = (as: AnchorPos[], x: number, y: number, z: number) => as.map((a) => ({ id: a.id, distM: dist(a, x, y, z) }))

describe('solvePosition', () => {
  it('recovers the exact point from exact ranges (square, in plane)', () => {
    const f = solvePosition(square, rangesTo(square, 2, 3, 1), 1, 0.042)!
    expect(f.x).toBeCloseTo(2, 5); expect(f.y).toBeCloseTo(3, 5); expect(f.residualM).toBeLessThan(1e-6)
  })
  it('recovers the exact point with anchors above the tag (3-D ranges, 2-D fix)', () => {
    const high = square.map((a) => ({ ...a, z: 2.2 }))
    const f = solvePosition(high, rangesTo(high, 7, 4, 1), 1, 0.042)!
    expect(f.x).toBeCloseTo(7, 4); expect(f.y).toBeCloseTo(4, 4)
  })
  it('at the centre of a square, GDOP is 1.0 and the ellipse is a circle of radius σ/√2', () => {
    const f = solvePosition(square, rangesTo(square, 5, 5, 1), 1, 0.042)!
    expect(f.gdop).toBeCloseTo(1.0, 6)
    expect(f.ellipse.a).toBeCloseTo(0.042 / Math.SQRT2, 6); expect(f.ellipse.b).toBeCloseTo(0.042 / Math.SQRT2, 6)
  })
  it('three anchors in a triangle still fix the point; two do not', () => {
    const tri = square.slice(0, 3)
    const f = solvePosition(tri, rangesTo(tri, 4, 3, 1), 1, 0.042)!
    expect(f.x).toBeCloseTo(4, 4); expect(f.y).toBeCloseTo(3, 4)
    expect(solvePosition(tri, rangesTo(tri, 4, 3, 1).slice(0, 2), 1, 0.042)).toBeNull()
  })
  it('a range for an unknown anchor is ignored', () => {
    const r = [...rangesTo(square, 5, 5, 1), { id: 'ghost', distM: 1 }]
    expect(solvePosition(square, r, 1, 0.042)!.x).toBeCloseTo(5, 5)
  })
  it('rangeSigmaM(100) is 4.24 cm', () => {
    expect(rangeSigmaM(100)).toBeCloseTo(0.0424, 4)
  })
})
```

- [ ] **Step 2: Run** — expect failure. **Step 3: Implement** `position.ts` (a 2×2 normal-equation solve by hand; no matrix library). **Step 4: Run** — PASS; `npx tsc -b`.
- [ ] **Step 5: Commit** `feat(uwb): 2-D position solver with GDOP and error ellipse`.

---

