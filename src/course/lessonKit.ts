/**
 * Shared building blocks for course lessons: the lesson types, scenario builders
 * (walls, houses, nodes) and jump-target predicates. Lesson files import from
 * here, never from lessons.ts, so modules that define lessons do not form a cycle.
 */
import { defaultFeatures, linkOfVirtual, type ChannelWidth } from '../model/caps'
import type { AmpApCfg, NodeCfg, ProfileId, Room, Scenario, UwbSessionCfg, Wall } from '../model/scenario'
import { DEFAULT_AMP_AP, DEFAULT_UWB_SESSION } from '../model/scenario'
import type { TLRecord } from '../model/records'
import type { Generation } from '../model/types'
import { UWB_TX_POWER_DBM } from '../uwb/phy'
import { oneRoom, hallwayHouse, longApartment, sc } from './wifiScenes'

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
  /** A call-out that sends the reader to the simulator: loads the lesson scenario, or jumps to jumps[jump] once loaded. */
  | { kind: 'watch'; heading?: L10n; text: L10n; jump?: number }

/** One word the standard's own spelling, and the plain-language line that explains it. */
export interface Term {
  term: string
  plain: L10n
}

/**
 * A lesson in either shape. The old shape is one flat `body`; the new,
 * zero-to-hero shape (docs/superpowers/specs/2026-09-21-course-readability-design.md)
 * opens with why the reader should care, says what they will be able to do and
 * what they need first, names the new words, paints the picture in plain
 * language, and only then reaches the numbers — with the professional depth and
 * the provenance collapsed behind `deeper` and `sources`.
 */
export interface Lesson {
  id: string
  module: number
  title: L10n
  /** Old shape, being migrated away. A lesson has either `body` or the eight fields below. */
  body?: Block[]
  /** 2–4 plain sentences: the problem, who has it, what the lesson shows. */
  why?: L10n
  /** 2–4 verb phrases the reader can do afterwards. */
  outcomes?: L10n[]
  /** Lesson ids this one assumes; rendered as clickable titles. */
  needs?: string[]
  /** The new words this lesson introduces, at most six (four for a track's first lesson). */
  terms?: Term[]
  /** The mechanism in plain words; carries at least one `watch` call-out. */
  picture?: Block[]
  /** The exact values: tables, formulas, widgets and short paragraphs. */
  numbers?: Block[]
  /** Optional professional depth, collapsed; never needed to pass the quiz. */
  deeper?: Block[]
  /** Where the numbers come from: clauses, contributions, model choices. Collapsed. */
  sources?: L10n[]
  scenario: () => Scenario
  variants?: LessonVariant[]
  jumps: JumpTarget[]
  observe: L10n[]
  tryThis: L10n[]
  quiz: Quiz[]
}

/** True once a lesson carries the new shape. */
export const isMigrated = (l: Lesson): boolean => l.why !== undefined

/** A language-neutral cell (numbers, symbols, protocol names). */
export const N = (s: string): L10n => ({ en: s, zh: s })

// ---------------------------------------------------------------------------
// scenario building blocks
// ---------------------------------------------------------------------------

export const brick = (x1: number, y1: number, x2: number, y2: number): Wall =>
  ({ x1, y1, x2, y2, material: 'brick', openings: [] })
export const drywallDoor = (x1: number, y1: number, x2: number, y2: number, from: number): Wall =>
  ({ x1, y1, x2, y2, material: 'drywall', openings: [{ from, to: from + 0.9 }] })

/**
 * `oneRoom`, `hallwayHouse`, `longApartment` and `sc` live in `./wifiScenes`
 * now (they are Wi-Fi-lesson scene builders); re-exported here so every
 * existing `from './lessonKit'` import keeps working unchanged. `sc` is also
 * used locally below (the UWB scenario helpers build on it too).
 */
export { oneRoom, hallwayHouse, longApartment, sc }

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

export function tag(id: string, name: string, x: number, y: number, dlSensDbm?: number): NodeCfg {
  // The mode is stated rather than left to the schema's default, as in `editor/planOps.newTag`:
  // a lesson scenario and the same scenario reloaded from JSON have to be the same object.
  return { id, kind: 'amp', name, pos: { x, y, z: 1 }, txPowerDbm: 0, profiles: ['idle'], caps: { generation: 'nonht', features: {} }, linkId: '2g', ampTag: dlSensDbm === undefined ? { mode: 'active' } : { mode: 'active', dlSensDbm } }
}

export function ampAp(id: string, name: string, x: number, y: number, amp: Partial<AmpApCfg> = {}, features?: Record<string, boolean>): NodeCfg {
  const n = node(id, name, 'ap', x, y, 'eht', 'idle', features ?? { edca: true, txop: true, ampdu: true })
  return { ...n, ampAp: { ...DEFAULT_AMP_AP, ...amp } }
}

/** The width every 6 GHz node this kit builds asks for: the 80 MHz block a Wi-Fi 6E/7
 * client takes by default, and the width `Scenario.sixGhzCenterMhz` names the centre of. */
export const LESSON_6G_WIDTH_MHZ: ChannelWidth = 80

/**
 * A station on the 6 GHz link at 80 MHz, Wi-Fi 7, with the feature set the AMP
 * lessons give their router — EDCA, TXOP and aggregation — so a saturated or
 * browsing stream behaves like a modern client rather than a 1997 one. `linkId`
 * pins it to 6 GHz; its AP needs none, because an AP is a member of every link
 * one of its stations uses.
 */
export function wifi6g(id: string, name: string, x: number, y: number, profile: ProfileId | ProfileId[]): NodeCfg {
  const n = node(id, name, 'sta', x, y, 'eht', profile, { edca: true, txop: true, ampdu: true }, 1.0)
  n.caps.widthMhz = LESSON_6G_WIDTH_MHZ
  return { ...n, linkId: '6g' }
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

/**
 * The UWB hall with two full-height brick partitions across it, at x = 5 and x = 10, neither
 * of them with an opening: three bays of 5, 5 and 12 m. A device in the first bay and one in
 * the third are 24 dB and a dozen metres apart — far under what one 4z frame reaches, and
 * exactly the room a multi-millisecond train is for.
 */
export function twoWallLab(): { rooms: Room[]; walls: Wall[] } {
  const hall = rangingLab()
  return { rooms: hall.rooms, walls: [...hall.walls, brick(5, 0, 5, 8), brick(10, 0, 10, 8)] }
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
/** Contention round: the first anchor to actually draw a response slot (a sit-out draws nothing). */
export const firstUwbContend = (r: TLRecord): boolean => r.type === 'UWB_CONTEND' && r.slot !== null
/** Contention round: the first response slot the tag lost to two anchors answering in it. */
export const firstUwbContendCollision = (r: TLRecord): boolean => r.type === 'UWB_CONTEND_COLLISION'
/** Contention round: the first anchor whose retry budget ran out, so it stays silent for a round. */
export const firstUwbSitOut = (r: TLRecord): boolean => r.type === 'UWB_CONTEND' && r.slot === null
/** One-way ranging: the first time difference of arrival anybody computed (a tag in DL-TDoA,
 * the reference anchor in UL-TDoA). */
export const firstUwbTdoa = (r: TLRecord): boolean => r.type === 'UWB_TDOA'
/** UL-TDoA: the first blink a tag sends — the whole of its contribution to being positioned. */
export const firstUwbBlink = txOf((r) => r.frame.kind === 'uwbBlink')
/** DL-TDoA: the round the anchors run for whoever happens to be listening. Every tag in the
 * scenario opens one of these for the same round, so the first is the first tag's. */
export const firstUwbDlRound = (r: TLRecord): boolean => r.type === 'UWB_ROUND' && r.mode === 'dl-tdoa'
/** UL-TDoA: the one-slot round a single tag owns — the only thing it takes of the block. */
export const firstUwbUlRound = (r: TLRecord): boolean => r.type === 'UWB_ROUND' && r.mode === 'ul-tdoa'
/** P802.15.4ab: the narrowband POLL an initiator opens a pair round with — the first thing
 * that happens in an MMS round, and on the other radio. */
export const firstNbPoll = txOf((r) => r.frame.kind === 'nbPoll')
/** P802.15.4ab: the narrowband REPORT that closes a pair round, carrying the reply time or the
 * round trip the range is computed from. */
export const firstNbReport = txOf((r) => r.frame.kind === 'nbReport')
/** P802.15.4ab: the first fragment of a ranging train — one sequence, no preamble, and far too
 * quiet on its own to be heard at the far end of the two-wall hall. */
export const firstUwbRsf = txOf((r) => r.frame.kind === 'uwbRsf')
/** P802.15.4ab: the first verdict a receiver reached on a whole train — how many fragments
 * arrived, what they combined to, and whether that cleared its sensitivity. */
export const firstUwbTrain = (r: TLRecord): boolean => r.type === 'UWB_MMS_TRAIN'
/** P802.15.4ab: the first narrowband transmission that listen-before-talk stopped, which costs
 * the device every narrowband message of that block. */
export const firstNbLbt = (r: TLRecord): boolean => r.type === 'UWB_NB_LBT'
/** Angle of arrival: the first bearing an anchor took off a frame from a tag. */
export const firstUwbAoa = (r: TLRecord): boolean => r.type === 'UWB_AOA'
/** Angle of arrival: the first fix an anchor solved on its own, from its range and its bearing —
 * the only position in this simulator that one anchor produces. */
export const firstUwbAoaFix = (r: TLRecord): boolean => r.type === 'UWB_POSITION' && r.method === 'aoa'

