import { z } from 'zod'
import type { CapabilityProfile, NodeKind, Vec3 } from './types'

export type Material = 'drywall' | 'brick' | 'glass'

/** Opening (door/window) along a wall, measured in meters from the wall's (x1,y1) end. */
export interface Opening {
  from: number
  to: number
}

export interface Wall {
  x1: number
  y1: number
  x2: number
  y2: number
  material: Material
  openings: Opening[]
}

export interface Room {
  x: number
  y: number
  w: number
  h: number
  name: string
}

export type ProfileId = 'video' | 'backup' | 'browsing' | 'iot' | 'saturated' | 'idle'

export interface NodeCfg {
  id: string
  kind: NodeKind
  name: string
  pos: Vec3
  txPowerDbm: number
  profile: ProfileId
  caps: CapabilityProfile
}

export interface Scenario {
  rooms: Room[]
  walls: Wall[]
  nodes: NodeCfg[]
  seed: number
  /** dot11RTSThreshold in PSDU octets. */
  rtsThresholdBytes: number
  snapshotIntervalMs: number
}

const OpeningSchema = z.object({ from: z.number().min(0), to: z.number().min(0) })

const WallSchema = z.object({
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  material: z.enum(['drywall', 'brick', 'glass']),
  openings: z.array(OpeningSchema),
})

const RoomSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  name: z.string(),
})

const Vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() })

const NodeCfgSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['ap', 'sta']),
  name: z.string(),
  pos: Vec3Schema,
  txPowerDbm: z.number(),
  profile: z.enum(['video', 'backup', 'browsing', 'iot', 'saturated', 'idle']),
  caps: z.object({
    generation: z.enum(['nonht', 'vht', 'he', 'eht']),
    features: z.record(z.boolean()),
  }),
})

export const ScenarioSchema: z.ZodType<Scenario> = z
  .object({
    rooms: z.array(RoomSchema),
    walls: z.array(WallSchema),
    nodes: z.array(NodeCfgSchema),
    seed: z.number().int(),
    rtsThresholdBytes: z.number().int().min(0),
    snapshotIntervalMs: z.number().int().positive(),
  })
  .superRefine((sc, ctx) => {
    const aps = sc.nodes.filter((n) => n.kind === 'ap')
    if (aps.length !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `scenario must have exactly one AP (found ${aps.length})` })
    }
    const ids = new Set<string>()
    for (const n of sc.nodes) {
      if (ids.has(n.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate node id "${n.id}"` })
      }
      ids.add(n.id)
    }
  })

export const nonht: CapabilityProfile = { generation: 'nonht', features: {} }

/** 10×8 m two-room house: living room (left, 6×8) and bedroom (right, 4×8), door in the divider. */
export function defaultScenario(): Scenario {
  const drywall = (x1: number, y1: number, x2: number, y2: number, openings: Opening[] = []): Wall => ({
    x1, y1, x2, y2, material: 'drywall', openings,
  })
  const brick = (x1: number, y1: number, x2: number, y2: number): Wall => ({
    x1, y1, x2, y2, material: 'brick', openings: [],
  })
  return {
    rooms: [
      { x: 0, y: 0, w: 6, h: 8, name: 'Living room' },
      { x: 6, y: 0, w: 4, h: 8, name: 'Bedroom' },
    ],
    walls: [
      // outer shell (brick)
      brick(0, 0, 10, 0),
      brick(10, 0, 10, 8),
      brick(10, 8, 0, 8),
      brick(0, 8, 0, 0),
      // divider with a 0.9 m door starting 3.5 m from (6,0)
      drywall(6, 0, 6, 8, [{ from: 3.5, to: 4.4 }]),
    ],
    nodes: [
      {
        id: 'ap', kind: 'ap', name: 'AP', pos: { x: 2, y: 4, z: 2.0 },
        txPowerDbm: 20, profile: 'idle', caps: nonht,
      },
      {
        id: 'sta-1', kind: 'sta', name: 'STA-1 (TV)', pos: { x: 4.5, y: 6.5, z: 1.0 },
        txPowerDbm: 15, profile: 'video', caps: nonht,
      },
      {
        id: 'sta-2', kind: 'sta', name: 'STA-2 (Laptop)', pos: { x: 8.5, y: 2.0, z: 1.0 },
        txPowerDbm: 15, profile: 'backup', caps: nonht,
      },
    ],
    seed: 42,
    rtsThresholdBytes: 3000,
    snapshotIntervalMs: 10,
  }
}
