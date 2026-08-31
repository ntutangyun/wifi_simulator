import { describe, it, expect } from 'vitest'
import {
  buildLinkTable, pathLossDb, rxPowerDbm, segIntersectT, wallLossDb,
} from '../../src/engine/propagation'
import type { Wall } from '../../src/model/scenario'
import { defaultScenario } from '../../src/model/scenario'

const wall = (x1: number, y1: number, x2: number, y2: number, material: Wall['material'] = 'drywall', openings: Wall['openings'] = []): Wall =>
  ({ x1, y1, x2, y2, material, openings })

describe('segIntersectT', () => {
  it('finds a crossing with the param along the wall', () => {
    // ray (0,1)→(4,1) crosses wall (2,0)→(2,4) at u=0.25
    expect(segIntersectT(0, 1, 4, 1, 2, 0, 2, 4)).toBeCloseTo(0.25)
  })
  it('returns null for parallel segments', () => {
    expect(segIntersectT(0, 0, 4, 0, 0, 1, 4, 1)).toBeNull()
  })
  it('returns null for a miss', () => {
    expect(segIntersectT(0, 0, 1, 0, 2, -1, 2, 1)).toBeNull()
  })
})

describe('wallLossDb', () => {
  const a = { x: 0, y: 1, z: 1 }
  const b = { x: 4, y: 1, z: 1 }
  it('adds material loss for a crossing wall', () => {
    expect(wallLossDb(a, b, [wall(2, 0, 2, 4, 'brick')])).toBe(12)
    expect(wallLossDb(a, b, [wall(2, 0, 2, 4, 'drywall'), wall(3, 0, 3, 4, 'glass')])).toBe(8)
  })
  it('exempts walls crossed through an opening', () => {
    // crossing at 1 m from wall start; door spans 0.8–1.6 m
    expect(wallLossDb(a, b, [wall(2, 0, 2, 4, 'brick', [{ from: 0.8, to: 1.6 }])])).toBe(0)
    expect(wallLossDb(a, b, [wall(2, 0, 2, 4, 'brick', [{ from: 2.0, to: 2.9 }])])).toBe(12)
  })
})

describe('path loss and link table', () => {
  it('is 46.7 dB at 1 m and monotonic', () => {
    expect(pathLossDb(1)).toBeCloseTo(46.7)
    expect(pathLossDb(10)).toBeGreaterThan(pathLossDb(5))
  })
  it('guards d=0', () => {
    expect(Number.isFinite(pathLossDb(0))).toBe(true)
  })
  it('uses 3D distance', () => {
    const p = rxPowerDbm(20, { x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }, [])
    expect(p).toBeCloseTo(20 - (46.7 + 30 * Math.log10(5)))
  })
  it('builds a complete table, symmetric under equal tx power', () => {
    const sc = defaultScenario()
    for (const n of sc.nodes) n.txPowerDbm = 17
    const t = buildLinkTable(sc.nodes, sc.walls)
    for (const a of sc.nodes) for (const b of sc.nodes) {
      if (a.id === b.id) continue
      expect(t.get(a.id)!.get(b.id)).toBeCloseTo(t.get(b.id)!.get(a.id)!)
    }
  })
})
