import { z } from 'zod'
// src/uwb/phy.ts is a leaf (it imports nothing at run time), so the schema can measure a
// ranging slot with the very functions the ranging engine uses, without a cycle.
import { rstuNs, UWB_MAX_ANCHORS, uwbSlotFitNs, uwbSlotsPerTag } from '../uwb/phy'
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
}

export const DEFAULT_AMP_AP: AmpApCfg = {
  pollIntervalMs: 100, slots: 4, acwe: 2, dlKbps: 250, ulKbps: 250, protection: 'ctsSelf', readMode: 'inline',
}

/** An ambient-power tag's per-node configuration. */
export interface AmpTagCfg {
  id16?: number
  dlSensDbm?: number
}

/**
 * A UWB device's role in a ranging session: an anchor sits at a known place
 * and answers, a tag ranges to every anchor and solves its own position.
 */
export interface UwbNodeCfg {
  role: 'anchor' | 'tag'
  /** Crystal offset of this device's ranging clock, in ppm (standard §16.4.9 allows ±20). */
  ppm?: number
}

/**
 * How a session measures. 'twr' is two-way ranging (the tag talks to every anchor and gets a
 * distance each); the two one-way modes measure time differences of arrival instead, and the
 * tag transmits nothing at all ('dl-tdoa', it listens to a round the anchors run) or exactly
 * once ('ul-tdoa', it blinks and the infrastructure positions it).
 */
export type UwbMode = 'twr' | 'dl-tdoa' | 'ul-tdoa'

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
}

export const DEFAULT_UWB_SESSION: UwbSessionCfg = {
  method: 'ds', blockRstu: 240_000, slotRstu: 2400, channel: 9, tsNoisePs: 100, cfoNoisePpm: 0.2, nlos: true,
  schedule: 'time', contentionSlots: 8, maxAttempts: 3,
  mode: 'twr', tdoaClockCorrection: true, syncErrorNs: 0,
}

/** 802.11ax 6 GHz channel 7 (80 MHz), model default: the centre `Scenario.sixGhzCenterMhz`
 * takes when a scenario does not set one. */
export const DEFAULT_SIX_GHZ_CENTER_MHZ = 5985

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
    }).optional(),
    ampTag: z.object({
      id16: z.number().int().min(1).max(0xfffe).optional(),
      dlSensDbm: z.number().optional(),
    }).optional(),
    uwb: z.object({
      role: z.enum(['anchor', 'tag']),
      ppm: z.number().min(-100).max(100).optional(),
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
      mode: z.enum(['twr', 'dl-tdoa', 'ul-tdoa']).default('twr'),
      tdoaClockCorrection: z.boolean().default(true),
      syncErrorNs: z.number().min(0).max(10).default(0),
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
        const mode = sc.uwb.mode
        if (mode !== 'twr' && sc.uwb.schedule === 'contention') {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['uwb'], message: 'contention-based rounds are two-way ranging only' })
        }
        if (mode !== 'twr' && sc.uwb.schedule !== 'time') {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['uwb'], message: 'one-way ranging needs a time-scheduled session (schedule: time)' })
        }
        const anchors = uwbNodes.filter((n) => n.uwb?.role === 'anchor').length
        const tags = uwbNodes.filter((n) => n.uwb?.role === 'tag').length
        if (anchors < 1 || tags < 1) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['uwb'], message: `a UWB session needs at least one anchor and one tag (found ${anchors} and ${tags})` })
        } else {
          // A hyperbolic fix is solved from differences, and N anchors give N−1 of them: four
          // anchors for the three a 2-D position needs.
          if (mode !== 'twr' && anchors < 4) {
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
          const slots = uwbSlotsPerTag(sc.uwb.method, anchors, sc.uwb.schedule, sc.uwb.contentionSlots, mode)
          const fits = Math.floor(sc.uwb.blockRstu / (slots * sc.uwb.slotRstu))
          if (mode !== 'dl-tdoa' && tags > fits) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: `the UWB block fits ${fits} tags at ${slots} slots each (found ${tags}); lengthen blockRstu or shorten slotRstu`,
            })
          }
          // …and every frame of the round has to fit its slot. A frame that outlives its
          // slot is not an error at run time: the receiver's deadline fires first, the late
          // PPDU is ignored, and the round silently loses every anchor. So it is caught here.
          const slotNs = rstuNs(sc.uwb.slotRstu)
          const needNs = uwbSlotFitNs(anchors, mode)
          if (slotNs < needNs) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: `a ${sc.uwb.slotRstu} RSTU ranging slot is ${(slotNs / 1000).toFixed(1)} µs, but a round with `
                + `${anchors} anchors needs ${(needNs / 1000).toFixed(1)} µs for its longest frame plus flight; `
                + 'lengthen slotRstu or use fewer anchors',
            })
          }
          if (anchors > UWB_MAX_ANCHORS) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: `a ranging round takes at most ${UWB_MAX_ANCHORS} anchors (found ${anchors}): `
                + 'the Final grows by 12 octets per anchor and must stay inside the 127-octet PSDU limit',
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
