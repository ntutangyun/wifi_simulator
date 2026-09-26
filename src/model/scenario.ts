import { z } from 'zod'
// src/uwb/phy.ts imports nothing of the model at run time (only `mms.ts`, `nb.ts` and the
// determinism hash, which in turn take nothing from here but types), so the schema can measure
// a ranging slot with the very functions the ranging engine uses, without a cycle.
import {
  MMS_DRAFT_DEFAULTS, MMS_FIXED_REPLY_RSTU_MAX, MMS_FIXED_REPLY_RSTU_MIN, mmsSlotsPerMs, type MmsPhy,
} from '../uwb/mms'
import { NB_CHANNELS } from '../uwb/nb'
import { mmsResponders, rstuNs, UWB_MAX_ANCHORS, uwbNbSlotFitNs, uwbSlotFitNs, uwbSlotsPerTag } from '../uwb/phy'
import type { LinkId } from './caps'
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
  /** Operating link for non-MLO devices: '2g' (802.11g / Wi-Fi 6/7 on 2.4 GHz), '5g' default, '6g' (Wi-Fi 6E/7). */
  linkId?: LinkId
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
  /** AP only, Wi-Fi 7 (eht) generation only: ambient-power (AMP) polling on the 2.4 GHz link. */
  ampAp?: AmpApCfg
  /** `kind: 'amp'` only: an ambient-power tag's identity and downlink sensitivity. */
  ampTag?: AmpTagCfg
  /** `kind: 'uwb'` only: the ranging role this device plays and its clock error. */
  uwb?: UwbNodeCfg
}

/**
 * AP-side ambient-power (AMP) polling configuration (IEEE P802.11bp). The AP
 * announces a round with an AMP Trigger PPDU; tags reply in their access
 * phase (random contention, then scheduled slots for tags heard in it).
 */
export interface AmpApCfg {
  pollIntervalMs: number
  slots: number
  acwe: number
  dlKbps: 250 | 1000
  ulKbps: 250 | 1000 | 4000
  protection: 'ctsSelf' | 'none'
  readMode: 'inline' | 'twoPhase'
  /**
   * The reader half of the backscatter tier: absent, the AP only runs Active Tx rounds. Present,
   * it also runs EPC Gen2 inventory rounds — `q` slots of 2^Q, replies at `ulKbps`, a WUP of
   * `wupMs` to boot the tags, `chargeDbm` up to the end of each command and `bsDbm` while the
   * reply is expected, a TXOP of `txopMs`, and whether a successful inventory is followed by a
   * Read and a Write.
   */
  backscatter?: AmpBackscatterCfg
}

export interface AmpBackscatterCfg {
  q: number
  ulKbps: 250 | 1000
  wupMs: number
  chargeDbm: number
  bsDbm: number
  txopMs: number
  read: boolean
  write: boolean
}

export const DEFAULT_AMP_AP: AmpApCfg = {
  pollIntervalMs: 100, slots: 4, acwe: 2, dlKbps: 250, ulKbps: 250, protection: 'ctsSelf', readMode: 'inline',
}

/**
 * The reader's defaults: Gen2's Q = 2 (four slots), the slower of the two uplink rates, the
 * minimum wake-up preamble the framework allows (PM-73), and 11-25/0307r0's PEX_C = 10 dBm /
 * PEX_B = 0 dBm. `txopMs` is a model choice. Read on, Write off — a Write costs 3 ms of air.
 */
export const DEFAULT_AMP_BS: AmpBackscatterCfg = {
  q: 2, ulKbps: 250, wupMs: 1, chargeDbm: 10, bsDbm: 0, txopMs: 4, read: true, write: false,
}

/** How a tag answers: with a carrier of its own (Active Tx) or by reflecting the reader's. */
export type AmpTagMode = 'active' | 'backscatter'

/** An ambient-power tag's per-node configuration. */
export interface AmpTagCfg {
  id16?: number
  dlSensDbm?: number
  /** Default `'active'`: every tag saved before the backscatter tier existed is an Active Tx one. */
  mode?: AmpTagMode
  /** Backscatter tags: the 96-bit EPC as 24 hex characters. Absent, it is derived from the node id. */
  epc?: string
}

/**
 * A UWB device's role in a ranging session: an anchor sits at a known place
 * and answers, a tag ranges to every anchor and solves its own position.
 */
export interface UwbNodeCfg {
  role: 'anchor' | 'tag'
  /** Crystal offset of this device's ranging clock, in ppm (standard §16.4.9 allows ±20). */
  ppm?: number
  /**
   * Anchor only, angle-of-arrival sessions: which way the anchor's antenna array faces, in
   * degrees counter-clockwise from +x (so 90° faces +y). Every bearing it reports is measured
   * from this boresight, and its ±90° field of view is centred on it — an anchor on a wall is
   * normally turned to face the room. Absent means 0°.
   */
  yawDeg?: number
}

/**
 * How a session measures. 'twr' is two-way ranging (the tag talks to every anchor and gets a
 * distance each); the two one-way modes measure time differences of arrival instead, and the
 * tag transmits nothing at all ('dl-tdoa', it listens to a round the anchors run) or exactly
 * once ('ul-tdoa', it blinks and the infrastructure positions it). 'mms' is the narrowband-
 * assisted multi-millisecond ranging of IEEE P802.15.4ab: a two-way exchange again, but one
 * whose control plane rides a narrowband radio and whose ranging signal is a train of fragments
 * a millisecond apart (src/uwb/mms.ts, src/uwb/nb.ts).
 */
export type UwbMode = 'twr' | 'dl-tdoa' | 'ul-tdoa' | 'mms'

/** Whether a narrowband transmission listens before it talks: 'auto' follows the draft's rule
 * (mandatory in UNII-5, optional in UNII-3), 'on' and 'off' are the scenario's override. */
export type NbLbt = 'auto' | 'on' | 'off'

/** Which side of an MMS pair round sends a narrowband measurement report: the responder in the
 * first report slot, the initiator in the second, or both. 4ab draft 15-22/0381r5 Table 1.1.4.1 */
export type NbReportMode = 'responder' | 'initiator' | 'bi'

/**
 * The MMS half of a session: the shape of each device's fragment train, and the narrowband
 * radio its control plane runs on. Only `mode: 'mms'` reads any of it.
 */
export interface UwbMmsCfg extends MmsPhy {
  /** The narrowband channels the session may hop between, 1…250 distinct entries of 0…249.
   * 4ab draft 15-22/0381r5 §1.5.2 */
  nbChannels: number[]
  nbLbt: NbLbt
  report: NbReportMode
  /**
   * One round, one initiator, **every** anchor of the session as its responders (P802.15.4ab
   * one-to-many ranging: 4ab draft 15-22/0381r5 Table 1.6.3.1, POLL 0x10 / RESP 0x11 /
   * REPORT 0x12 / 0x13). The initiator's train goes out once and every responder hears it;
   * each responder answers in its own narrowband and ranging slots, and the tag comes out of
   * one round with a range to each of them.
   *
   * Off — the default — a round is one pair, and a block holds a round per tag–anchor pair:
   * exactly what shipped before, byte for byte.
   */
  oneToMany: boolean
}

/**
 * One ranging session (standard §10.32.2, the modes of §10.32.3): the block/slot structure every tag
 * shares, the TWR method, the channel, and the two noise knobs the engine
 * draws its timestamp and clock errors from.
 */
export interface UwbSessionCfg {
  method: 'ss' | 'ds'
  /** Ranging block duration in RSTU (standard §10.32.2). */
  blockRstu: number
  /** Ranging slot duration in RSTU; a whole number of 3-RSTU units (standard §10.32.2). */
  slotRstu: number
  channel: 5 | 9
  /** 1-σ receive-timestamp noise in picoseconds. */
  tsNoisePs: number
  /** 1-σ residual carrier-frequency-offset error in ppm. */
  cfoNoisePpm: number
  /** Add the extra NLOS delay of each wall crossed to the time of flight. */
  nlos: boolean
  /** Round schedule (standard §10.32.2 / §10.32.3): 'time' assigns every device a fixed slot in
   * advance; 'contention' (schedule mode 0) opens a shared response phase that responders draw a
   * slot from at random (SS-TWR only in this simulator). */
  schedule: 'time' | 'contention'
  /** Contention round only: the response-phase window, RCPS IE (§10.32.9.5); 8 is a model default. */
  contentionSlots: number
  /** Contention round only: retries before an anchor sits out a round, RCMA IE (§10.32.9.6); 3 is a model default. */
  maxAttempts: number
  /** What the session measures: two-way ranges, or one-way time differences (§10.32.3). */
  mode: UwbMode
  /** DL-TDoA only: the tag corrects its own clock rate from the round's poll-to-Final interval
   * before differencing its arrival times. With it off, the tag's crystal offset (up to ±20 ppm
   * over a whole round) swamps the differences — the lesson's centrepiece. */
  tdoaClockCorrection: boolean
  /** UL-TDoA only (model): 1-σ residual error, in nanoseconds, of each anchor's calibration to
   * anchor 0's timebase — what imperfect "wired sync" costs the fix. */
  syncErrorNs: number
  /** Two-way ranging only: every anchor also measures the phase difference between its two
   * antennas on each frame it receives from the tag, and reports the bearing that phase implies
   * (src/uwb/aoa.ts). A DS-TWR anchor that has both a range and a bearing fixes the tag on its
   * own — the one single-anchor position in the simulator. */
  aoa: boolean
  /** `mode: 'mms'` only: the fragment train and the narrowband control radio of P802.15.4ab.
   * It is carried in every session, at its default, so that switching the mode needs no second
   * decision — and so that a scenario saved before this slice reads back unchanged. */
  mms: UwbMmsCfg
  /**
   * Model: an attacker sitting between the two radios that relays every two-way and TDoA ranging frame of
   * this session (MMS fragment trains are outside the model's reach) so that its RMARKER appears to arrive `advanceNs` earlier than light allows — the
   * distance-reduction relay the scrambled timestamp sequence exists to stop.
   *
   * Absent — the default — there is no attacker at all, and no scenario that never named one
   * changes by a chip.
   */
  attacker?: { advanceNs: number }
  /**
   * Model: the session's ranging frames carry no scrambled timestamp sequence, so the receiver
   * has nothing unforgeable to time and takes the relayed leading edge at face value
   * (standard §10.32: an STS-less SP0 packet is a legal configuration, and ranging on it is
   * what the standard's own security clause warns against).
   *
   * With it absent or false the sequence is there: a relayed frame does not correlate against
   * the key the session holds, the receiver rejects the stamp (`UWB_STS_REJECT`) and the round
   * simply produces no range. It only ever matters when `attacker` is set.
   */
  stsOff?: boolean
}

/** The draft's own ranging-cycle defaults, which are deliberately not one of the mandatory
 * parameter sets of `MMS_SETS`: X = 8 RSFs, no RIF, N_MSR 40 at the MMRS default gap of 64
 * (an 82.05 µs fragment), Z = 1, and a UNII-3 control channel where listen-before-talk is
 * optional. 4ab draft 15-22/0381r5 Table 1.2.3.1 / 1.2.3.3 */
export const DEFAULT_UWB_MMS: UwbMmsCfg = {
  rsfs: 8, rifs: 0, nMsr: 40, gap: 64, stsLen: 64, gapMs: 1,
  nbChannels: [3], nbLbt: 'auto', report: 'bi', oneToMany: false,
  // Every draft feature off, which is the session that shipped before any of them existed.
  ...MMS_DRAFT_DEFAULTS,
}

export const DEFAULT_UWB_SESSION: UwbSessionCfg = {
  method: 'ds', blockRstu: 240_000, slotRstu: 2400, channel: 9, tsNoisePs: 100, cfoNoisePpm: 0.2, nlos: true,
  schedule: 'time', contentionSlots: 8, maxAttempts: 3,
  mode: 'twr', tdoaClockCorrection: true, syncErrorNs: 0, aoa: false,
  mms: { ...DEFAULT_UWB_MMS, nbChannels: [...DEFAULT_UWB_MMS.nbChannels] },
}

/** 802.11ax 6 GHz channel 7 (80 MHz), model default: the centre `Scenario.sixGhzCenterMhz`
 * takes when a scenario does not set one. */
export const DEFAULT_SIX_GHZ_CENTER_MHZ = 5985

/** The narrowest 6 GHz channel the cross-technology gate ever tests: a 6 GHz link may widen to
 * 320 MHz, and a false negative would silently uncouple the two engines, so the gate widens the
 * negotiated width to at least this before asking whether the bands meet. The simulation gates
 * on it and the editor's plan note warns on it, so the two cannot disagree. model */
export const SIX_GHZ_GATE_MIN_WIDTH_MHZ = 160

/** 6 GHz channel numbering: channel 1 sits at 5955 MHz, channels 5 MHz apart, so a centre
 * frequency's channel number is (centre − 5950) / 5. standard 802.11ax 6 GHz channelization */
export function sixGhzChannelNo(centerMhz: number): number {
  return (centerMhz - 5950) / 5
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
  /** MAC transmit queues: MSDUs per access category and MSDU lifetime. Absent = 500 MSDUs, 500 ms. */
  queue?: { limit: number; lifetimeMs: number }
  /** UWB ranging session; required as soon as the scenario holds a `uwb` node. */
  uwb?: UwbSessionCfg
  /** Centre frequency of the plan's 6 GHz Wi-Fi channel, in MHz (802.11ax channelization:
   * 5955 + 5·(channel − 1)). Absent = DEFAULT_SIX_GHZ_CENTER_MHZ (channel 7, 80 MHz). */
  sixGhzCenterMhz?: number
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
    kind: z.enum(['ap', 'sta', 'amp', 'uwb']),
    name: z.string(),
    pos: Vec3Schema,
    txPowerDbm: z.number(),
    profiles: z.array(ProfileSchema).transform(normalizeProfiles),
    caps: z.object({
      generation: z.enum(['nonht', 'vht', 'he', 'eht']),
      features: z.record(z.boolean()),
      widthMhz: z.union([z.literal(20), z.literal(40), z.literal(80), z.literal(160), z.literal(320)]).optional(),
      nss: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
    }),
    linkId: z.enum(['2g', '5g', '6g']).optional(),
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
    ampAp: z.object({
      pollIntervalMs: z.number().min(10).max(10_000),
      slots: z.number().int().min(1).max(16),
      acwe: z.number().int().min(0).max(4),
      dlKbps: z.union([z.literal(250), z.literal(1000)]),
      ulKbps: z.union([z.literal(250), z.literal(1000), z.literal(4000)]),
      protection: z.enum(['ctsSelf', 'none']),
      readMode: z.enum(['inline', 'twoPhase']),
      // EPC Gen2 allows Q 0…15; 8 is 256 slots, which is already more than a TXOP can offer
      // (model). `wupMs` has the framework's 1 ms minimum under it (SFD PM-73); `txopMs` and the
      // two power ranges are model choices wide enough for the lesson's variants.
      backscatter: z.object({
        q: z.number().int().min(0).max(8),
        ulKbps: z.union([z.literal(250), z.literal(1000)]),
        wupMs: z.number().min(1),
        chargeDbm: z.number().min(-10).max(30),
        bsDbm: z.number().min(-10).max(30),
        txopMs: z.number().min(1).max(10),
        read: z.boolean(),
        write: z.boolean(),
      }).optional(),
    }).optional(),
    ampTag: z.object({
      id16: z.number().int().min(1).max(0xfffe).optional(),
      dlSensDbm: z.number().optional(),
      // A tag saved before the backscatter tier existed carries no mode at all and reads back as
      // an Active Tx one, so every such scenario replays unchanged.
      mode: z.enum(['active', 'backscatter']).default('active'),
      epc: z.string().regex(/^[0-9a-fA-F]{24}$/, 'an EPC is 24 hex characters (96 bits)').optional(),
    }).optional(),
    uwb: z.object({
      role: z.enum(['anchor', 'tag']),
      ppm: z.number().min(-100).max(100).optional(),
      yawDeg: z.number().min(-180).max(180).optional(),
    }).optional(),
  }).superRefine((n, ctx) => {
    if (n.linkId === '2g' && n.caps.generation === 'vht') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Wi-Fi 5 (VHT) has no 2.4 GHz mode; pick 802.11g, Wi-Fi 6 or Wi-Fi 7 for the 2.4 GHz link' })
    }
    if (n.linkId === '6g' && (n.caps.generation === 'nonht' || n.caps.generation === 'vht')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '6 GHz needs Wi-Fi 6 or Wi-Fi 7; 802.11a and Wi-Fi 5 (VHT) have no 6 GHz mode' })
    }
    if (n.kind === 'amp' && n.linkId !== undefined && n.linkId !== '2g') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'AMP tags live on the 2.4 GHz link' })
    }
    if (n.ampAp && !(n.kind === 'ap' && n.caps.generation === 'eht')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'AMP polling needs a Wi-Fi 7 AP (the AMP DL PPDU carries U-SIG)' })
    }
    if (n.ampTag && n.kind !== 'amp') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'only an AMP tag node carries AMP tag settings' })
    }
    if (n.kind === 'uwb' && !n.uwb) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'a UWB node needs UWB settings (role anchor or tag)' })
    }
    if (n.uwb && n.kind !== 'uwb') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'only a UWB node carries UWB settings' })
    }
  }),
)

/**
 * The MMS half of a session. The four enumerated fields are checked here, where a bad value has
 * nowhere sensible to go; each union is `mms.ts`'s own set written out as literals, because zod
 * cannot build one from an array without a cast, and `tests/model/uwb-scenario.test.ts` walks
 * the exported sets against this schema so the two cannot drift apart unnoticed.
 *
 * `gap` and `nbChannels` are deliberately left open and checked in the scenario's `superRefine`
 * instead, because their rules belong to the ranging session as a whole — `path: ['uwb']`, in
 * the wording the editor shows — and an issue raised on the field would stop that refinement
 * running at all.
 *
 * The six draft-feature fields go the other way: each rule below reads nothing but this object's own
 * fields, so a setting that contradicts another setting of the same object is wrong whatever the
 * session does with it, and it is refused here rather than only in MMS mode.
 *
 * Exported because `tests/model/uwb-scenario.test.ts` parses it directly.
 */
export const UwbMmsSchema = z.object({
  rsfs: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(4), z.literal(8), z.literal(16)]),
  rifs: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(4), z.literal(8)]),
  nMsr: z.union([z.literal(32), z.literal(40), z.literal(48), z.literal(64), z.literal(128), z.literal(256)]),
  gap: z.number(),
  stsLen: z.union([z.literal(32), z.literal(64), z.literal(128), z.literal(256)]),
  gapMs: z.union([z.literal(1), z.literal(2)]),
  nbChannels: z.array(z.number()),
  nbLbt: z.enum(['auto', 'on', 'off']),
  report: z.enum(['responder', 'initiator', 'bi']),
  // A scenario saved before one-to-many rounds existed reads back pairwise, which is what it
  // was: the field has to carry a default or the editor would refuse every such plan.
  oneToMany: z.boolean().default(false),
  // The six draft-feature fields, every one defaulted to the behaviour that shipped, so a plan saved
  // before them reads back as the session it was.
  control: z.enum(['nba', 'uwbd']).default('nba'),
  nonInterleaved: z.boolean().default(false),
  fixedReplyRstu: z.number().int().nullable().default(null),
  reversedOrder: z.boolean().default(false),
  rsfSfd: z.boolean().default(false),
  uwbdControl: z.enum(['sp0', 'none']).default('sp0'),
}).superRefine((mms, ctx) => {
  // 控制相位的长度只有 UWB 驱动配置才自己决定；窄带辅助配置的 POLL/RESP 窗口由窄带一侧排定，
  // 'none' 在那里是一个什么都不做的设置，所以宁可拒绝，也不要让它静静地留在计划里。
  if (mms.uwbdControl === 'none' && mms.control !== 'uwbd') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['uwbdControl'],
      message: '零长度控制相位只属于 UWB 驱动配置：窄带辅助配置的控制相位跑在窄带电台上，这里选 none 不改变任何东西（15-25/0194r0）',
    })
  }
  if (mms.rsfSfd && mms.control !== 'uwbd') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rsfSfd'],
      message: 'RSF 带 SFD 只在 UWB 驱动配置下有意义：窄带辅助模式里没有包首 SYNC+SFD 可丢',
    })
  }
  if (mms.rsfSfd && mms.nMsr !== 32 && mms.nMsr !== 64) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rsfSfd'],
      message: '草案只在 RSF 片段长度为 32 或 64 时允许 RSF 带 SFD（15-25/0066r1）',
    })
  }
  // 固定回复时间是从“收到第一个片段”起算的，交织模式里两端的片段互相穿插，没有这样一个起点。
  if (mms.fixedReplyRstu !== null && !mms.nonInterleaved) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fixedReplyRstu'],
      message: '固定回复时间只属于非交织模式：交织的两列片段没有“收完第一个片段再回复”这个起点（15-25/0224r2）',
    })
  }
  if (mms.fixedReplyRstu !== null
    && (mms.fixedReplyRstu < MMS_FIXED_REPLY_RSTU_MIN || mms.fixedReplyRstu > MMS_FIXED_REPLY_RSTU_MAX)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fixedReplyRstu'],
      message: `固定回复时间要落在 ${MMS_FIXED_REPLY_RSTU_MIN}…${MMS_FIXED_REPLY_RSTU_MAX} RSTU（约 0.25…510 ms）：这是草案给 macMmsFixedReplyTime 的取值范围，下界正是一个 MMS 测距时隙的最小长度（15-25/0224r2）`,
    })
  }
  // 反序的意义是“响应方先发”，而交织模式里两端本来就在同一毫秒里各发一片，没有先后可换。
  if (mms.reversedOrder && !mms.nonInterleaved) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reversedOrder'],
      message: '反序只属于非交织模式：交织时两端在同一毫秒里各发一个片段，没有“谁先发”可以调换（15-25/0556r2）',
    })
  }
})

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
    queue: z.object({ limit: z.number().int().positive(), lifetimeMs: z.number().positive() }).optional(),
    uwb: z.object({
      method: z.enum(['ss', 'ds']),
      blockRstu: z.number().int().positive().refine((v) => v % 3 === 0, 'block must be a multiple of 3 RSTU'),
      slotRstu: z.number().int().min(300).refine((v) => v % 3 === 0, 'slot must be a multiple of 3 RSTU'),
      channel: z.union([z.literal(5), z.literal(9)]),
      tsNoisePs: z.number().min(0),
      cfoNoisePpm: z.number().min(0),
      nlos: z.boolean(),
      schedule: z.enum(['time', 'contention']).default('time'),
      contentionSlots: z.number().int().min(2).max(32).default(8),
      maxAttempts: z.number().int().min(1).max(10).default(3),
      mode: z.enum(['twr', 'dl-tdoa', 'ul-tdoa', 'mms']).default('twr'),
      tdoaClockCorrection: z.boolean().default(true),
      syncErrorNs: z.number().min(0).max(10).default(0),
      aoa: z.boolean().default(false),
      // A session saved before P802.15.4ab existed here carries no MMS settings at all, and
      // reads back with the draft's defaults — so every such scenario replays unchanged.
      mms: UwbMmsSchema.default(() => ({ ...DEFAULT_UWB_MMS, nbChannels: [...DEFAULT_UWB_MMS.nbChannels] })),
      // The security pair, both absent by default: a plan that never named an attacker reads
      // back without either field, exactly as it was written.
      attacker: z.object({ advanceNs: z.number().min(0).max(10_000) }).optional(),
      stsOff: z.boolean().optional(),
    }).optional(),
    sixGhzCenterMhz: z.number().int().min(5955).max(7115).refine((v) => v % 5 === 0, '6 GHz centre frequency must be a 5 MHz channel step').optional(),
  })
  .superRefine((sc, ctx) => {
    // Wi-Fi needs its one AP; a scenario that is nothing but UWB nodes has no
    // BSS at all and must not be forced to invent one.
    const aps = sc.nodes.filter((n) => n.kind === 'ap')
    const wifi = sc.nodes.filter((n) => n.kind === 'sta' || n.kind === 'amp')
    if ((wifi.length > 0 || aps.length > 1) && aps.length !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `scenario must have exactly one AP (found ${aps.length})` })
    }
    // Every ranging rule is tagged `path: ['uwb']` so the editor can tell a
    // session issue from any other by its path rather than by reading its
    // wording (src/editor/planOps.ts · uwbSessionIssue).
    const uwbNodes = sc.nodes.filter((n) => n.kind === 'uwb')
    if (uwbNodes.length > 0) {
      if (!sc.uwb) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['uwb'], message: 'a scenario with UWB nodes needs a UWB session (scenario.uwb)' })
      } else {
        // A contention round's response phase (schedule mode 0) has only the response frame to
        // work with: SS-TWR's; DS-TWR's report phase would need a second contention window of its
        // own, which this simulator does not model.
        if (sc.uwb.schedule === 'contention' && sc.uwb.method !== 'ss') {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['uwb'], message: 'contention-based rounds are SS-TWR only in this simulator' })
        }
        // A contention round is a two-way exchange the tag starts; one-way ranging has no such
        // exchange to contend for (in DL-TDoA the tag never transmits, in UL-TDoA it transmits
        // once, in its own slot).
        // There are two schedules, so "not contention" and "time" are the same requirement: one
        // mistake, one issue.
        const mode = sc.uwb.mode
        if (mode !== 'twr' && sc.uwb.schedule !== 'time') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'contention-based rounds are two-way ranging only; one-way and MMS ranging need a time-scheduled session',
          })
        }
        // An anchor measures the angle of arrival on a frame the tag sends it, and only a
        // two-way round has one: in DL-TDoA the tag never transmits, in UL-TDoA its single blink
        // is not part of an exchange, and in MMS the tag's ranging signal is a train of
        // sequences, not a frame with a phase to compare. The engine guards on the mode, so the
        // flag would be silently inert here rather than wrong - the schema says so instead of
        // letting a hand-edited or imported plan carry a setting that does nothing.
        if (mode !== 'twr' && sc.uwb.aoa) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'angle of arrival is measured on two-way responses; turn it off for TDoA and MMS modes',
          })
        }
        // The P802.15.4ab rules. They read only `sc.uwb.mms`, and only in MMS mode: a two-way
        // or one-way session carries the same settings untouched and must not be judged on them.
        if (mode === 'mms') {
          const mms = sc.uwb.mms
          if (mms.rsfs + mms.rifs === 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: 'an MMS train needs at least one fragment (rsfs + rifs > 0)',
            })
          }
          if (!Number.isInteger(mms.gap) || mms.gap < 0 || mms.gap > 64) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['uwb'], message: 'MMRS gap must be an integer 0…64' })
          }
          const channels = mms.nbChannels
          const distinct = new Set(channels).size === channels.length
          const inRange = channels.every((c) => Number.isInteger(c) && c >= 0 && c < NB_CHANNELS)
          if (channels.length < 1 || channels.length > NB_CHANNELS || !distinct || !inRange) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: 'the narrowband allow list needs 1…250 distinct channels 0…249',
            })
          }
          // The draft's ranging slot is a multiple of 300 RSTU (0.25 ms), not of the 3 RSTU the
          // core standard asks for: the cycle is laid out in milliseconds and the slot has to
          // divide them. 4ab draft 15-22/0381r5 §1.1.1
          if (sc.uwb.slotRstu % 300 !== 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: 'an MMS ranging slot must be a multiple of 300 RSTU (P802.15.4ab draft)',
            })
          }
          // The two slot rules that replace the frame rule below: a slot holds one fragment, and
          // the two slots the draft gives each narrowband message hold one of those. The anchor
          // count `uwbSlotFitNs` takes is for the modes whose frames grow with it — an MMS slot
          // holds one fragment whoever is in the round — so it is passed none.
          const slotNs = rstuNs(sc.uwb.slotRstu)
          const fragNs = uwbSlotFitNs(0, 'mms', sc.uwb.schedule, mms)
          if (slotNs < fragNs) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: `a ${sc.uwb.slotRstu} RSTU slot is ${(slotNs / 1000).toFixed(1)} µs, but the longest MMS `
                + `fragment needs ${(fragNs / 1000).toFixed(1)} µs plus flight`,
            })
          }
          // …and a one-to-many POLL names every responder, three octets each, so the longest
          // narrowband message of the round grows with the anchor count even though no fragment
          // does. At the draft's 600 RSTU slot that caps a one-to-many round at three responders.
          const responders = mmsResponders(mms, uwbNodes.filter((n) => n.uwb?.role === 'anchor').length)
          const nbNs = uwbNbSlotFitNs(mms, responders)
          if (2 * slotNs < nbNs) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: `two ${sc.uwb.slotRstu} RSTU slots are ${(2 * slotNs / 1000).toFixed(1)} µs, but a narrowband `
                + `message of a round with ${responders} responder${responders === 1 ? '' : 's'} needs `
                + `${(nbNs / 1000).toFixed(1)} µs plus flight`,
            })
          }
        }
        const anchors = uwbNodes.filter((n) => n.uwb?.role === 'anchor').length
        const tags = uwbNodes.filter((n) => n.uwb?.role === 'tag').length
        if (anchors < 1 || tags < 1) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['uwb'], message: `a UWB session needs at least one anchor and one tag (found ${anchors} and ${tags})` })
        } else {
          // A hyperbolic fix is solved from differences, and N anchors give N−1 of them: four
          // anchors for the three a 2-D position needs. MMS measures ranges, not differences,
          // so it needs no more anchors than two-way ranging does.
          if ((mode === 'dl-tdoa' || mode === 'ul-tdoa') && anchors < 4) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: `one-way ranging needs at least 4 anchors for 3 time differences (found ${anchors})`,
            })
          }
          // Every tag gets its own slots inside the block; the block cannot be
          // oversubscribed or two tags would range in the same slot. DL-TDoA is the exception:
          // the anchors run one round per block and every tag in the scenario listens to that
          // same round, so tags cost the schedule nothing at all.
          // An MMS round is pairwise, so a block has to hold one round per tag–anchor pair
          // rather than one per tag — the count the rule below compares against `fits`.
          // …at this session's own slots per millisecond, because a non-interleaved MMS ranging
          // phase is that many slots per millisecond of train: sized at the draft's default
          // instead, the rule would check the block against a round of the wrong length.
          const slots = uwbSlotsPerTag(
            sc.uwb.method, anchors, sc.uwb.schedule, sc.uwb.contentionSlots, mode, sc.uwb.mms,
            mmsSlotsPerMs(sc.uwb.slotRstu),
          )
          const fits = Math.floor(sc.uwb.blockRstu / (slots * sc.uwb.slotRstu))
          // One round has to fit the block in every mode, DL-TDoA included: a round that outlives
          // its block runs into the next one's slots, and nothing downstream notices — the
          // scheduler starts each block on the clock, whatever the last one was still doing.
          if (fits < 1) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: `the UWB block of ${sc.uwb.blockRstu} RSTU is too short for one round of ${slots} `
                + `slots × ${sc.uwb.slotRstu} RSTU; lengthen blockRstu or shorten slotRstu`,
            })
          } else if (mode === 'mms' && !sc.uwb.mms.oneToMany && tags * anchors > fits) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: `the UWB block fits ${fits} tag–anchor pairs at ${slots} slots each (found ${tags * anchors}); lengthen blockRstu or shorten slotRstu`,
            })
          } else if (mode === 'mms' && sc.uwb.mms.oneToMany && tags > fits) {
            // A one-to-many round holds every anchor at once, so a block costs one round per
            // tag — a longer round, but one of them, which is the whole point of the mode.
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: `the UWB block fits ${fits} one-to-many rounds at ${slots} slots each (found ${tags}); lengthen blockRstu or shorten slotRstu`,
            })
          } else if (mode !== 'dl-tdoa' && mode !== 'mms' && tags > fits) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: `the UWB block fits ${fits} tags at ${slots} slots each (found ${tags}); lengthen blockRstu or shorten slotRstu`,
            })
          }
          // …and every frame of the round has to fit its slot. A frame that outlives its
          // slot is not an error at run time: the receiver's deadline fires first, the late
          // PPDU is ignored, and the round silently loses every anchor. So it is caught here.
          // An MMS round has no such frame — its two slot rules are above, and they do not
          // depend on the anchor count.
          if (mode !== 'mms') {
            const slotNs = rstuNs(sc.uwb.slotRstu)
            const needNs = uwbSlotFitNs(anchors, mode, sc.uwb.schedule)
            if (slotNs < needNs) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['uwb'],
                message: `a ${sc.uwb.slotRstu} RSTU ranging slot is ${(slotNs / 1000).toFixed(1)} µs, but a round with `
                  + `${anchors} anchors needs ${(needNs / 1000).toFixed(1)} µs for its longest frame plus flight; `
                  + 'lengthen slotRstu or use fewer anchors',
              })
            }
          }
          // Nothing in an MMS round grows with the anchor count — every pair gets a round of
          // its own — so the PSDU-length cap does not apply to it; the block rule bounds it.
          if (mode !== 'mms' && anchors > UWB_MAX_ANCHORS) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: `a ranging round takes at most ${UWB_MAX_ANCHORS} anchors (found ${anchors}): `
                + 'the TWR Final grows by 12 octets per anchor and must stay inside the 127-octet PSDU limit '
                + '(the one-way modes’ frames are shorter, so the same cap is conservative for them)',
            })
          }
        }
      }
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
    // A backscatter tag has no transmitter of its own: with no reader running inventory rounds
    // it can never be heard from, so the plan is asking for something that cannot happen. The
    // rule is here rather than on the node because it needs the AP, and it is tagged with the
    // tag's own index so the editor can point at the node that is wrong.
    const hasReader = sc.nodes.some((n) => n.kind === 'ap' && n.ampAp?.backscatter !== undefined)
    if (!hasReader) {
      sc.nodes.forEach((n, i) => {
        if (n.kind === 'amp' && n.ampTag?.mode === 'backscatter') {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes', i], message: 'a backscatter tag needs an AP with the RFID inventory on' })
        }
      })
    }
  })

/**
 * What went wrong with a scenario, as a learner should read it. A ZodError's
 * own `message` is the raw JSON of every issue — `[{ "code": "custom", … }]` —
 * while the issue messages are the sentences the editor already shows beside
 * the offending section, so the banner and the editor say the same thing.
 */
export function scenarioErrorText(e: unknown): string {
  if (e instanceof z.ZodError) return e.issues.map((i) => i.message).join('; ')
  return e instanceof Error ? e.message : String(e)
}

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
