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
  it('collinear anchors cannot fix a point: null', () => {
    const collinear: AnchorPos[] = [
      { id: 'a1', x: 0, y: 0, z: 1 }, { id: 'a2', x: 5, y: 0, z: 1 }, { id: 'a3', x: 10, y: 0, z: 1 },
    ]
    expect(solvePosition(collinear, rangesTo(collinear, 3, 0, 1), 1, 0.042)).toBeNull()
  })
})
