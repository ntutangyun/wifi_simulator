/**
 * Shared building blocks for course lessons: the lesson types, scenario builders
 * (walls, houses, nodes) and jump-target predicates. Lesson files import from
 * here, never from lessons.ts, so modules that define lessons do not form a cycle.
 */
import { defaultFeatures } from '../model/caps'
import type { NodeCfg, ProfileId, Room, Scenario, Wall } from '../model/scenario'
import type { TLRecord } from '../model/records'
import type { Generation } from '../model/types'

export interface L10n {
  en: string
  zh: string
}


export interface Quiz {
  q: L10n
  options: L10n[]
  answer: number
  explain: L10n
}

export interface JumpTarget {
  label: L10n
  find: (r: TLRecord) => boolean
}

export interface LessonVariant {
  label: L10n
  scenario: () => Scenario
}

/** A block of lesson prose. Every string is bilingual. */
export type Block =
  /** A short paragraph (default kind). */
  | { kind?: 'p'; heading?: L10n; text: L10n }
  /** One monospace formula line, optionally followed by a short note. */
  | { kind: 'formula'; heading?: L10n; text: L10n; note?: L10n }
  /** A small comparison table; every row has head.length cells. */
  | { kind: 'table'; heading?: L10n; head: L10n[]; rows: L10n[][] }
  /** Parallel points. */
  | { kind: 'list'; heading?: L10n; items: L10n[] }
  /** Ordered steps. */
  | { kind: 'steps'; heading?: L10n; items: L10n[] }

export interface Lesson {
  id: string
  module: number
  minutes: number
  title: L10n
  body: Block[]
  scenario: () => Scenario
  variants?: LessonVariant[]
  jumps: JumpTarget[]
  observe: L10n[]
  tryThis: L10n[]
  quiz: Quiz[]
}

/** A language-neutral cell (numbers, symbols, protocol names). */
export const N = (s: string): L10n => ({ en: s, zh: s })

// ---------------------------------------------------------------------------
// scenario building blocks
// ---------------------------------------------------------------------------

export const brick = (x1: number, y1: number, x2: number, y2: number): Wall =>
  ({ x1, y1, x2, y2, material: 'brick', openings: [] })
export const drywallDoor = (x1: number, y1: number, x2: number, y2: number, from: number): Wall =>
  ({ x1, y1, x2, y2, material: 'drywall', openings: [{ from, to: from + 0.9 }] })

/** Single 10×8 room with a brick shell. */
export function oneRoom(): { rooms: Room[]; walls: Wall[] } {
  return {
    rooms: [{ x: 0, y: 0, w: 10, h: 8, name: 'Lab' }],
    walls: [brick(0, 0, 10, 0), brick(10, 0, 10, 8), brick(10, 8, 0, 8), brick(0, 8, 0, 0)],
  }
}

/**
 * Room A | brick hallway (AP) | Room B. The stations' ray crosses TWO brick
 * walls (~24 dB) at ~8.4 m, landing below the −82 dBm preamble threshold —
 * genuinely hidden — while each station reaches the AP through one wall.
 */
export function hallwayHouse(): { rooms: Room[]; walls: Wall[] } {
  return {
    rooms: [
      { x: 0, y: 0, w: 4, h: 8, name: 'Room A' },
      { x: 4, y: 0, w: 2, h: 8, name: 'Hallway' },
      { x: 6, y: 0, w: 4, h: 8, name: 'Room B' },
    ],
    walls: [
      brick(0, 0, 10, 0), brick(10, 0, 10, 8), brick(10, 8, 0, 8), brick(0, 8, 0, 0),
      brick(4, 0, 4, 8), brick(6, 0, 6, 8),
    ],
  }
}

/**
 * Long 16×8 apartment: a study (0–6) and a far living room (6–16) split by
 * brick. Wide enough that the far station is genuinely far — ~11.5 m plus one
 * wall lands it at ~−75 dBm (12 Mb/s), 40 dB under the near station, so the
 * near frame's capture clears its 30 dB decode threshold by ~10 dB instead of
 * sitting on the edge of it.
 */
export function longApartment(): { rooms: Room[]; walls: Wall[] } {
  return {
    rooms: [
      { x: 0, y: 0, w: 6, h: 8, name: 'Study' },
      { x: 6, y: 0, w: 10, h: 8, name: 'Living room' },
    ],
    walls: [
      brick(0, 0, 16, 0), brick(16, 0, 16, 8), brick(16, 8, 0, 8), brick(0, 8, 0, 0),
      brick(6, 0, 6, 8),
    ],
  }
}




export function node(
  id: string, name: string, kind: 'ap' | 'sta', x: number, y: number,
  gen: Generation, profile: ProfileId | ProfileId[],
  features?: Record<string, boolean>, z?: number,
): NodeCfg {
  return {
    id, kind, name, pos: { x, y, z: z ?? (kind === 'ap' ? 2.0 : 1.0) },
    txPowerDbm: kind === 'ap' ? 20 : 15, profiles: Array.isArray(profile) ? profile : [profile],
    caps: { generation: gen, features: features ?? defaultFeatures(gen) },
  }
}

export function sc(house: { rooms: Room[]; walls: Wall[] }, nodes: NodeCfg[], extra: Partial<Scenario> = {}): Scenario {
  return {
    ...house, nodes,
    // Lessons are about the Wi-Fi MAC: no cloud servers, so no WAN delay and
    // every quoted timestamp stays where it is.
    servers: [],
    seed: 7, rtsThresholdBytes: 3000, snapshotIntervalMs: 10,
    ...extra,
  }
}

// ---------------------------------------------------------------------------
// jump-target predicates
// ---------------------------------------------------------------------------

export const txOf = (pred: (r: Extract<TLRecord, { type: 'TX_START' }>) => boolean) =>
  (r: TLRecord): boolean => r.type === 'TX_START' && pred(r)

export const firstData = txOf((r) => r.frame.kind === 'data')
export const firstAck = txOf((r) => r.frame.kind === 'ack')
export const firstBa = txOf((r) => r.frame.kind === 'ba')
export const firstRts = txOf((r) => r.frame.kind === 'rts')
export const firstAmpdu = txOf((r) => r.frame.ampdu !== undefined)
export const firstMuDl = txOf((r) => r.frame.kind === 'data' && r.frame.muParts !== undefined)
export const firstTrigger = txOf((r) => r.frame.kind === 'trigger')
export const firstMba = txOf((r) => r.frame.kind === 'mba')
export const firstCfEnd = txOf((r) => r.frame.kind === 'cfend')
export const firstCfEndRelay = txOf((r) => r.frame.kind === 'cfend' && r.node === 'ap')
export const first6g = txOf((r) => r.node.includes('#6g') && r.frame.kind === 'data')
export const firstCollision = (r: TLRecord): boolean => r.type === 'COLLISION'
export const firstRetry = (r: TLRecord): boolean => r.type === 'RETRY'
export const firstNav = (r: TLRecord): boolean => r.type === 'NAV_SET'
export const firstBackoffDraw = (r: TLRecord): boolean => r.type === 'BACKOFF_DRAW'
export const firstFreeze = (r: TLRecord): boolean => r.type === 'BACKOFF_FREEZE'
export const firstTxop = (r: TLRecord): boolean => r.type === 'TXOP_START'
export const firstInternal = (r: TLRecord): boolean => r.type === 'INTERNAL_COLLISION'
export const firstVo = (r: TLRecord): boolean =>
  (r.type === 'BACKOFF_DRAW' || r.type === 'IFS_START') && r.ac === 3

export const J = (en: string, zh: string, find: (r: TLRecord) => boolean): JumpTarget =>
  ({ label: { en, zh }, find })

