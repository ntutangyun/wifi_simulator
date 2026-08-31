import { describe, it, expect } from 'vitest'
import {
  addOpening, hitTestNode, hitTestWall, roomsToWalls, scenarioFromJson, scenarioToJson, spawnRandomStas,
} from '../../src/editor/planOps'
import { defaultScenario, type Room, type Wall } from '../../src/model/scenario'
import { Rng } from '../../src/engine/rng'

const rooms: Room[] = [
  { x: 0, y: 0, w: 4, h: 4, name: 'A' },
  { x: 4, y: 0, w: 4, h: 4, name: 'B' }, // shares edge x=4
]

describe('roomsToWalls', () => {
  it('collapses shared and collinear edges (5 walls, not 8)', () => {
    // y=0 and y=4 each merge across both rooms; x=4 divider is shared
    const walls = roomsToWalls(rooms)
    expect(walls).toHaveLength(5)
    const atX4 = walls.filter((w) => w.x1 === 4 && w.x2 === 4)
    expect(atX4).toHaveLength(1)
    expect(atX4[0]).toMatchObject({ y1: 0, y2: 4 })
  })

  it('merges collinear touching edges into a single run', () => {
    const stacked: Room[] = [
      { x: 0, y: 0, w: 4, h: 2, name: 'A' },
      { x: 0, y: 2, w: 4, h: 2, name: 'B' },
    ]
    const walls = roomsToWalls(stacked)
    const left = walls.filter((w) => w.x1 === 0 && w.x2 === 0)
    expect(left).toHaveLength(1)
    expect(left[0]).toMatchObject({ y1: 0, y2: 4 })
  })

  it('preserves material and openings across regeneration', () => {
    let walls = roomsToWalls(rooms)
    const i = walls.findIndex((w) => w.x1 === 4 && w.x2 === 4)
    walls[i] = { ...walls[i], material: 'brick' }
    walls[i] = addOpening(walls[i], 2, 0.9)
    const regenerated = roomsToWalls(rooms, walls)
    const again = regenerated.find((w) => w.x1 === 4 && w.x2 === 4)!
    expect(again.material).toBe('brick')
    expect(again.openings).toHaveLength(1)
  })
})

describe('openings', () => {
  const wall: Wall = { x1: 0, y1: 0, x2: 0, y2: 4, material: 'drywall', openings: [] }
  it('clamps to the wall extent', () => {
    const w = addOpening(wall, 3.9, 0.9)
    expect(w.openings[0].to).toBeLessThanOrEqual(4)
    expect(w.openings[0].to - w.openings[0].from).toBeCloseTo(0.9)
  })
  it('rejects overlapping openings', () => {
    const w1 = addOpening(wall, 2, 0.9)
    const w2 = addOpening(w1, 2.2, 0.9)
    expect(w2.openings).toHaveLength(1)
  })
})

describe('hit tests', () => {
  const walls = roomsToWalls(rooms)
  it('finds a wall near the pointer', () => {
    expect(hitTestWall(walls, { x: 4.05, y: 2 }, 0.2)).not.toBeNull()
    expect(hitTestWall(walls, { x: 2, y: 2 }, 0.2)).toBeNull()
  })
  it('finds nodes', () => {
    const sc = defaultScenario()
    expect(hitTestNode(sc.nodes, { x: 2.1, y: 4.1 }, 0.4)).toBe('ap')
    expect(hitTestNode(sc.nodes, { x: 9, y: 0.2 }, 0.3)).toBeNull()
  })
})

describe('spawnRandomStas', () => {
  it('adds n stations inside rooms with unique ids', () => {
    const rng = new Rng(1)
    const sc = spawnRandomStas(defaultScenario(), 5, () => rng.next())
    expect(sc.nodes.filter((n) => n.kind === 'sta')).toHaveLength(7)
    const ids = new Set(sc.nodes.map((n) => n.id))
    expect(ids.size).toBe(sc.nodes.length)
    for (const n of sc.nodes.filter((x) => x.kind === 'sta')) {
      const inside = sc.rooms.some((r) => n.pos.x >= r.x && n.pos.x <= r.x + r.w && n.pos.y >= r.y && n.pos.y <= r.y + r.h)
      expect(inside).toBe(true)
    }
  })
})

describe('scenario json', () => {
  it('round-trips', () => {
    const sc = defaultScenario()
    expect(scenarioFromJson(scenarioToJson(sc))).toEqual(sc)
  })
  it('throws on invalid json', () => {
    expect(() => scenarioFromJson('{"rooms": []}')).toThrow()
  })
})
