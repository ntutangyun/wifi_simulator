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

export type ProfileId = 'video' | 'voice' | 'gaming' | 'p2pvideo' | 'backup' | 'browsing' | 'iot' | 'saturated' | 'idle'

/**
 * How a TXOP holder announces its burst (§9.2.5.2 / §10.23.2.8):
 *  - single:   every frame's Duration covers only its own response (default).
 *  - boundary: an RTS/CTS opens a multi-exchange burst and its Duration covers
 *              the whole planned burst; data frames inside keep single protection.
 *  - multiple: as boundary, and every data frame also carries the TXOP remainder.
 * A burst that ends early is truncated with CF-End (§10.23.2.9).
 */
export type TxopProtection = 'single' | 'boundary' | 'multiple'
export const TXOP_PROTECTIONS: TxopProtection[] = ['single', 'boundary', 'multiple']
export const PROFILE_IDS: ProfileId[] = ['video', 'voice', 'gaming', 'p2pvideo', 'backup', 'browsing', 'iot', 'saturated', 'idle']

/**
 * Canonical form of a node's stream list: no duplicates, 'idle' only when it
 * stands alone (an empty list means idle too).
 */
export function normalizeProfiles(list: readonly ProfileId[]): ProfileId[] {
  const out = [...new Set(list)].filter((p) => p !== 'idle')
  return out.length ? out : ['idle']
}

/**
 * A tampered driver: how a station deviates from the EDCA parameters the AP
 * broadcast. Every field is optional; unset means "obeys the standard".
 */
export interface TamperCfg {
  /** Send every frame in this access category regardless of the stream's real class (3 = AC_VO). */
  allAsAc?: number
  /** Use this AIFSN for every category (the standard floor for a station is 2; 1 is reserved for the AP). */
  aifsn?: number
  /** Contention window bounds for every category (0/0 = no random backoff at all). */
  cwMin?: number
  cwMax?: number
  /** Never double the window after a collision or a lost ACK (cwMax pinned to cwMin). */
  noDoubling?: boolean
  /** Hold the medium this long per TXOP, whatever the category's limit. */
  txopLimitUs?: number
  /** Add this to the Duration field of its own frames so neighbours set a longer NAV. */
  navInflateUs?: number
}

export type TamperKind = 'escalate' | 'aifs' | 'cw' | 'noDouble' | 'txopHog' | 'navInflate' | 'greedy'
export const TAMPER_KINDS: TamperKind[] = ['escalate', 'aifs', 'cw', 'noDouble', 'txopHog', 'navInflate', 'greedy']

/** Named cheats, from the subtle to the brazen. `greedy` is the patent draft's violator. */
export const TAMPER_PRESETS: Record<TamperKind, TamperCfg> = {
  escalate: { allAsAc: 3 },
  aifs: { aifsn: 1 },
  cw: { cwMin: 0, cwMax: 0 },
  noDouble: { noDoubling: true },
  txopHog: { txopLimitUs: 8000 },
  navInflate: { navInflateUs: 3000 },
  greedy: { allAsAc: 3, aifsn: 1, cwMin: 0, cwMax: 0, txopLimitUs: 8000 },
}

/** Which named cheat a config is, if it equals one exactly. */
export function tamperKindOf(t: TamperCfg | undefined): TamperKind | 'custom' | 'none' {
  if (!t) return 'none'
  const key = JSON.stringify(t)
  for (const k of TAMPER_KINDS) if (JSON.stringify(TAMPER_PRESETS[k]) === key) return k
  return 'custom'
}

export interface NodeCfg {
  id: string
  kind: NodeKind
  name: string
  pos: Vec3
  txPowerDbm: number
  /**
   * Traffic streams this node generates (STAs only; the AP carries whatever
   * the downlink legs produce). Several may run at once — a voice call next to
   * a cloud backup — and each keeps its own EDCA access category.
   */
  profiles: ProfileId[]
  caps: CapabilityProfile
  /** Operating link for non-MLO HE/EHT nodes ('5g' default). */
  linkId?: '5g' | '6g'
  /** Burst protection policy when this node holds a TXOP ('single' default). */
  txopProtection?: TxopProtection
  /** Per-stream server binding (server id); unset streams use the first server of their kind. */
  servers?: Partial<Record<ProfileId, string>>
  /**
   * AP only: the router's "game acceleration" mode. Off (default) leaves game
   * packets unmarked, so they contend as best effort (AC_BE); on, the router
   * marks game flows into AC_VI, as the gaming modes of home routers do.
   */
  gameAccel?: boolean
  /** Station only: a tampered driver that ignores the broadcast EDCA parameters. */
  tamper?: TamperCfg
  /** Station only, with the p2pvideo stream: the station this phone streams to (via the AP). */
  p2pTarget?: string
}

/** What kind of endpoint a stream talks to beyond the AP. */
export type ServerKind = 'video' | 'web' | 'call' | 'game'
export const SERVER_KINDS: ServerKind[] = ['video', 'web', 'call', 'game']

/**
 * A cloud endpoint: an application server reached through the AP's WAN link,
 * modelled as a fixed one-way delay of rttMs/2 in each direction.
 */
export interface ServerCfg {
  id: string
  kind: ServerKind
  name: string
  /** Base WAN round trip AP ↔ server. */
  rttMs: number
  /** WAN jitter: each packet's RTT is drawn uniformly in [rttMs, rttMs + jitterMs] (half per direction). */
  jitterMs: number
  /** Server processing time before it answers a request or echoes a ping. */
  processMs: number
}

export const DEFAULT_SERVERS: ServerCfg[] = [
  { id: 'srv-video', kind: 'video', name: 'YouTube', rttMs: 20, jitterMs: 2, processMs: 1 },
  { id: 'srv-web', kind: 'web', name: 'Google', rttMs: 12, jitterMs: 2, processMs: 5 },
  { id: 'srv-call', kind: 'call', name: 'Call server', rttMs: 40, jitterMs: 5, processMs: 1 },
  { id: 'srv-game', kind: 'game', name: 'Game server', rttMs: 25, jitterMs: 3, processMs: 2 },
]

/** Server kind a traffic profile talks to; null for pure-Wi-Fi stress profiles. */
export function serverKindFor(profile: ProfileId): ServerKind | null {
  switch (profile) {
    case 'video': return 'video'
    case 'browsing':
    case 'backup':
    case 'iot': return 'web'
    case 'voice': return 'call'
    case 'gaming': return 'game'
    case 'p2pvideo': // stays inside the BSS: no cloud server
    case 'saturated':
    case 'idle': return null
  }
}

/** The server a station's stream uses: its explicit binding, else the first of the kind, else none. */
export function serverFor(sc: Pick<Scenario, 'servers'>, n: NodeCfg, profile: ProfileId): ServerCfg | null {
  const bound = n.servers?.[profile]
  if (bound) return sc.servers.find((s) => s.id === bound) ?? null
  const kind = serverKindFor(profile)
  if (!kind) return null
  return sc.servers.find((s) => s.kind === kind) ?? null
}

export interface Scenario {
  rooms: Room[]
  walls: Wall[]
  nodes: NodeCfg[]
  /** Cloud endpoints; empty means every stream is purely local (no WAN delay, no app RTT). */
  servers: ServerCfg[]
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

const ProfileSchema = z.enum(['video', 'voice', 'gaming', 'p2pvideo', 'backup', 'browsing', 'iot', 'saturated', 'idle'])

/** Scenarios saved before multi-stream support carry a single `profile`. */
function migrateLegacyProfile(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && !('profiles' in raw) && 'profile' in raw) {
    const { profile, ...rest } = raw as Record<string, unknown>
    return { ...rest, profiles: [profile] }
  }
  return raw
}

const NodeCfgSchema = z.preprocess(
  migrateLegacyProfile,
  z.object({
    id: z.string().min(1),
    kind: z.enum(['ap', 'sta']),
    name: z.string(),
    pos: Vec3Schema,
    txPowerDbm: z.number(),
    profiles: z.array(ProfileSchema).transform(normalizeProfiles),
    caps: z.object({
      generation: z.enum(['nonht', 'vht', 'he', 'eht']),
      features: z.record(z.boolean()),
    }),
    linkId: z.enum(['5g', '6g']).optional(),
    txopProtection: z.enum(['single', 'boundary', 'multiple']).optional(),
    servers: z.record(ProfileSchema, z.string()).optional(),
    gameAccel: z.boolean().optional(),
    p2pTarget: z.string().min(1).optional(),
    tamper: z.object({
      allAsAc: z.number().int().min(0).max(3).optional(),
      aifsn: z.number().int().min(0).optional(),
      cwMin: z.number().int().min(0).optional(),
      cwMax: z.number().int().min(0).optional(),
      noDoubling: z.boolean().optional(),
      txopLimitUs: z.number().min(0).optional(),
      navInflateUs: z.number().min(0).optional(),
    }).optional(),
  }),
)

const ServerSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['video', 'web', 'call', 'game']),
  name: z.string(),
  rttMs: z.number().min(0),
  jitterMs: z.number().min(0).default(0),
  processMs: z.number().min(0).default(0),
})

export const ScenarioSchema: z.ZodType<Scenario, z.ZodTypeDef, unknown> = z
  .object({
    rooms: z.array(RoomSchema),
    walls: z.array(WallSchema),
    nodes: z.array(NodeCfgSchema),
    /** Scenarios saved before cloud servers existed get the defaults. */
    servers: z.array(ServerSchema).default(() => DEFAULT_SERVERS.map((s) => ({ ...s }))),
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
    const serverIds = new Set<string>()
    for (const s of sc.servers) {
      if (serverIds.has(s.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate server id "${s.id}"` })
      serverIds.add(s.id)
    }
    for (const n of sc.nodes) {
      if (n.p2pTarget !== undefined) {
        if (n.p2pTarget === n.id) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `node "${n.id}" cannot stream video to itself` })
        else if (!sc.nodes.some((m) => m.id === n.p2pTarget && m.kind === 'sta')) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `node "${n.id}" streams to unknown station "${n.p2pTarget}"` })
      }
      for (const [profile, sid] of Object.entries(n.servers ?? {})) {
        if (!serverIds.has(sid)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `node "${n.id}" binds ${profile} to unknown server "${sid}"` })
      }
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
        txPowerDbm: 20, profiles: ['idle'],
        caps: { generation: 'eht', features: { edca: true, ampdu: true, txop: true, ofdma: true, mlo: true, qam4k: true } },
      },
      {
        id: 'sta-1', kind: 'sta', name: 'STA-1 (TV)', pos: { x: 4.5, y: 6.5, z: 1.0 },
        txPowerDbm: 15, profiles: ['video'],
        caps: { generation: 'he', features: { edca: true, ampdu: true, txop: true, ofdma: true } },
      },
      {
        id: 'sta-2', kind: 'sta', name: 'STA-2 (Laptop)', pos: { x: 8.5, y: 2.0, z: 1.0 },
        txPowerDbm: 15, profiles: ['backup'],
        caps: { generation: 'vht', features: { edca: true, ampdu: true, txop: true } },
      },
    ],
    servers: DEFAULT_SERVERS.map((s) => ({ ...s })),
    seed: 42,
    rtsThresholdBytes: 3000,
    snapshotIntervalMs: 10,
  }
}
