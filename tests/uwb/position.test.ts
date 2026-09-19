import { describe, it, expect } from 'vitest'
import { rangeSigmaM, solvePosition, solveTdoa, type AnchorPos } from '../../src/uwb/position'
import { C_M_PER_NS } from '../../src/uwb/phy'

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
  it('rangeSigmaM(100) is 2.12 cm: c · σ_ts / √2, not √2 · c · σ_ts', () => {
    expect(rangeSigmaM(100)).toBeCloseTo(0.0212, 4)
    expect(rangeSigmaM(100)).toBeCloseTo((0.299792458 * 0.1) / Math.SQRT2, 12)
  })
  it('collinear anchors cannot fix a point: null', () => {
    const collinear: AnchorPos[] = [
      { id: 'a1', x: 0, y: 0, z: 1 }, { id: 'a2', x: 5, y: 0, z: 1 }, { id: 'a3', x: 10, y: 0, z: 1 },
    ]
    expect(solvePosition(collinear, rangesTo(collinear, 3, 0, 1), 1, 0.042)).toBeNull()
  })
})

/** The true time differences of arrival at (x, y, z), in nanoseconds, against anchor `ref`. */
const deltasTo = (as: AnchorPos[], ref: AnchorPos, x: number, y: number, z: number) =>
  as.filter((a) => a.id !== ref.id).map((a) => ({ id: a.id, dtNs: (dist(a, x, y, z) - dist(ref, x, y, z)) / C_M_PER_NS }))

describe('solveTdoa', () => {
  it('recovers the exact point from exact time differences (square, in plane)', () => {
    const f = solveTdoa(square, 'a1', deltasTo(square, square[0], 2, 3, 1), 1, 0.042)!
    expect(f.x).toBeCloseTo(2, 5); expect(f.y).toBeCloseTo(3, 5); expect(f.residualM).toBeLessThan(1e-6)
  })

  it('recovers a point off-centre with anchors above the tag (3-D distances, 2-D fix)', () => {
    const high = square.map((a) => ({ ...a, z: 2.2 }))
    const f = solveTdoa(high, 'a4', deltasTo(high, high[3], 7, 4, 1), 1, 0.042)!
    expect(f.x).toBeCloseTo(7, 4); expect(f.y).toBeCloseTo(4, 4)
  })

  it('at the centre of the square, the difference geometry is worse than trilateration’s', () => {
    const f = solveTdoa(square, 'a1', deltasTo(square, square[0], 5, 5, 1), 1, 0.042)!
    expect(f.x).toBeCloseTo(5, 5); expect(f.y).toBeCloseTo(5, 5)
    // Rows are u_i − u_ref, not u_i, so the normal equations are not on the spherical solver's
    // scale and the two GDOPs do not compare term for term: with a1 as the reference the three
    // rows are (−√2, 0), (0, −√2) and (−√2, −√2), JtJ = [[4, 2], [2, 4]] and GDOP = √(2/3).
    expect(f.gdop).toBeCloseTo(Math.sqrt(2 / 3), 12)
    expect(f.gdop).toBeCloseTo(0.8164965809277261, 12)
    // What does compare is the shape: trilateration's ellipse here is a circle of σ/√2, the
    // hyperbolic one is σ/√2 by σ/√6 — √3 times as long as it is wide — with its major axis on
    // the a2–a3 diagonal, across the reference anchor's own.
    expect(f.ellipse.a).toBeCloseTo(0.042 / Math.SQRT2, 12)
    expect(f.ellipse.b).toBeCloseTo(0.042 / Math.sqrt(6), 12)
    expect(f.ellipse.a / f.ellipse.b).toBeCloseTo(Math.sqrt(3), 12)
    expect(f.ellipse.thetaRad).toBeCloseTo(-Math.PI / 4, 12)
  })

  it('needs three differences: two are not enough', () => {
    const three = deltasTo(square, square[0], 2, 3, 1)
    expect(three).toHaveLength(3)
    expect(solveTdoa(square, 'a1', three.slice(0, 2), 1, 0.042)).toBeNull()
    // The reference differences with itself to nothing, so it never counts as one of the three.
    expect(solveTdoa(square, 'a1', [...three.slice(0, 2), { id: 'a1', dtNs: 0 }], 1, 0.042)).toBeNull()
    // Nor does a delta for an anchor the solver has never heard of.
    expect(solveTdoa(square, 'a1', [...three.slice(0, 2), { id: 'ghost', dtNs: 3 }], 1, 0.042)).toBeNull()
    // An unknown reference is no reference at all.
    expect(solveTdoa(square, 'ghost', three, 1, 0.042)).toBeNull()
  })

  it('collinear anchors cannot fix a point from differences either: null', () => {
    const collinear: AnchorPos[] = [
      { id: 'a1', x: 0, y: 0, z: 1 }, { id: 'a2', x: 5, y: 0, z: 1 },
      { id: 'a3', x: 10, y: 0, z: 1 }, { id: 'a4', x: 15, y: 0, z: 1 },
    ]
    expect(solveTdoa(collinear, 'a1', deltasTo(collinear, collinear[0], 3, 0, 1), 1, 0.042)).toBeNull()
  })
})
