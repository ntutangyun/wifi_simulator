/**
 * Shared building blocks for course lessons: the lesson types, scenario builders
 * (walls, houses, nodes) and jump-target predicates. Lesson files import from
 * here, never from lessons.ts, so modules that define lessons do not form a cycle.
 */
import { defaultFeatures, linkOfVirtual } from '../model/caps'
import type { AmpApCfg, NodeCfg, ProfileId, Room, Scenario, UwbSessionCfg, Wall } from '../model/scenario'
import { DEFAULT_AMP_AP, DEFAULT_UWB_SESSION } from '../model/scenario'
import type { TLRecord } from '../model/records'
import type { Generation } from '../model/types'
import { UWB_TX_POWER_DBM } from '../uwb/phy'

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
  /** An interactive view computed from the engine's own functions; params preset its controls. */
  | { kind: 'widget'; heading?: L10n; widget: 'linkBudget' | 'mcsLadder'; params?: Record<string, number | string>; caption?: L10n }

export interface Lesson {
  id: string
  module: number
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

export function tag(id: string, name: string, x: number, y: number, dlSensDbm?: number): NodeCfg {
  return { id, kind: 'amp', name, pos: { x, y, z: 1 }, txPowerDbm: 0, profiles: ['idle'], caps: { generation: 'nonht', features: {} }, linkId: '2g', ampTag: dlSensDbm === undefined ? {} : { dlSensDbm } }
}

export function ampAp(id: string, name: string, x: number, y: number, amp: Partial<AmpApCfg> = {}, features?: Record<string, boolean>): NodeCfg {
  const n = node(id, name, 'ap', x, y, 'eht', 'idle', features ?? { edca: true, txop: true, ampdu: true })
  return { ...n, ampAp: { ...DEFAULT_AMP_AP, ...amp } }
}

/**
 * A UWB node: no Wi-Fi profile to run and no Wi-Fi capabilities to speak of,
 * so it idles on the Wi-Fi side and does all its work in the ranging session.
 * The transmit power is the engine's own UWB default (−41.3 dBm/MHz mean EIRP
 * over the 499.2 MHz channel), taken from phy.ts rather than re-typed here, so a
 * lesson's link budget cannot drift away from the engine's.
 */
function uwbNode(id: string, name: string, role: 'anchor' | 'tag', x: number, y: number, z: number, ppm?: number): NodeCfg {
  return {
    id, kind: 'uwb', name, pos: { x, y, z }, txPowerDbm: UWB_TX_POWER_DBM,
    profiles: ['idle'], caps: { generation: 'nonht', features: {} },
    uwb: { role, ...(ppm === undefined ? {} : { ppm }) },
  }
}

/** A UWB anchor: a fixed device at a known place that answers a tag's Poll. */
export function anchor(id: string, name: string, x: number, y: number, z = 2.2, ppm?: number): NodeCfg {
  return uwbNode(id, name, 'anchor', x, y, z, ppm)
}

/** A UWB tag: the device that ranges to every anchor and solves its own position. */
export function uwbTag(id: string, name: string, x: number, y: number, z = 1.0, ppm?: number): NodeCfg {
  return uwbNode(id, name, 'tag', x, y, z, ppm)
}

/**
 * sc() with a ranging session attached: a UWB scenario needs one as soon as it
 * holds a UWB node. `extra` is spread BEFORE the session, so an `extra.uwb`
 * cannot silently replace the DEFAULT_UWB_SESSION merge `session` refines —
 * pass session overrides in `session`, which is the only argument that merges.
 */
export function uwbSc(
  house: { rooms: Room[]; walls: Wall[] }, nodes: NodeCfg[],
  session: Partial<UwbSessionCfg> = {}, extra: Partial<Scenario> = {},
): Scenario {
  return sc(house, nodes, { ...extra, uwb: { ...DEFAULT_UWB_SESSION, ...session } })
}

/**
 * The UWB hall: a 22 × 8 m room inside one brick shell. Long enough that a tag
 * 20 m from an anchor on the same line is still indoors and still on the
 * anchor's side of every wall, so the flight time is exactly the separation
 * divided by c. oneRoom()'s 10 × 8 m cannot hold that span.
 */
export function rangingLab(): { rooms: Room[]; walls: Wall[] } {
  return {
    rooms: [{ x: 0, y: 0, w: 22, h: 8, name: 'Hall' }],
    walls: [brick(0, 0, 22, 0), brick(22, 0, 22, 8), brick(22, 8, 0, 8), brick(0, 8, 0, 0)],
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
export const first6g = txOf((r) => linkOfVirtual(r.node) === '6g' && r.frame.kind === 'data')
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

export const firstAmpTrigger = txOf((r) => r.frame.kind === 'ampTrigger')
export const firstAmpResp = txOf((r) => r.frame.kind === 'ampResp')
export const firstAmpAck = txOf((r) => r.frame.kind === 'ampAck')
export const firstAmpAckToTag = txOf((r) => r.frame.kind === 'ampAck' && r.frame.dst !== r.frame.src)
export const firstAmpSatOut = (r: TLRecord): boolean => r.type === 'AMP_ABOC' && r.slot === null
export const firstAmpLost = (r: TLRecord): boolean => r.type === 'AMP_RESULT' && r.sent && !r.acked
export const firstScheduledTrigger = txOf((r) => r.frame.kind === 'ampTrigger' && r.frame.amp?.phase === 'scheduled')

export const firstUwbPoll = txOf((r) => r.frame.kind === 'uwbPoll')
export const firstUwbResp = txOf((r) => r.frame.kind === 'uwbResp')
export const firstUwbFinal = txOf((r) => r.frame.kind === 'uwbFinal')
export const firstUwbReport = txOf((r) => r.frame.kind === 'uwbReport')
export const firstUwbRange = (r: TLRecord): boolean => r.type === 'UWB_RANGE'
export const firstUwbRoundEnd = (r: TLRecord): boolean => r.type === 'UWB_ROUND_END'
export const firstUwbPosition = (r: TLRecord): boolean => r.type === 'UWB_POSITION'
export const firstUwbTimeout = (r: TLRecord): boolean => r.type === 'UWB_TIMEOUT'
export const firstUwbRxTs = (r: TLRecord): boolean => r.type === 'UWB_TS' && r.dir === 'rx'

