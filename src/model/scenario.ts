import { z } from 'zod'
// src/uwb/phy.ts imports nothing of the model at run time (only `mms.ts`, `nb.ts` and the
// determinism hash, which in turn take nothing from here but types), so the schema can measure
// a ranging slot with the very functions the ranging engine uses, without a cycle.
import {
  MMS_DRAFT_DEFAULTS, MMS_FIXED_REPLY_RSTU_MAX, MMS_FIXED_REPLY_RSTU_MIN, MMS_RSF_SFD_N_MSR,
  mmsSlotsPerMs, type MmsPhy,
} from '../uwb/mms'
// `src/engine/fading.ts` takes only `./hash` (no imports of its own) and this folder's `types`,
// so the schema can hold the fading defaults the sampling functions were written against
// without a cycle — one figure for each knob, in one place.
import { FADING_DEFAULTS, RICIAN_K_DEFAULT_DB, type FadingCfg } from '../engine/fading'
// Type only, and deliberately so: `src/engine/scatter.ts` takes nothing at run time but this
// folder's `types` (for `Vec3`), so the shape of a reflecting object is declared once, beside
// the geometry that consumes it, and the schema below validates that same shape.
import type { ScattererCfg } from '../engine/scatter'
import { NB_CHANNELS } from '../uwb/nb'
import {
  C_M_PER_NS, mmsResponders, rstuNs, srrrIeBytes, UWB_MAX_PSDU_BYTES, UWB_SLOT_GUARD_NS,
  uwbAncillarySlots, uwbM2mSlotFitNs,
  uwbMaxAnchors, uwbMaxParticipants, uwbMmrcmSlots, uwbNbSlotFitNs, uwbPollBytes, uwbPpduNs, uwbRespBytes,
  uwbSlotFitNs, uwbSlotsPerTag, type UwbReplyTime,
} from '../uwb/phy'
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
 * a millisecond apart (src/uwb/mms.ts, src/uwb/nb.ts). 'm2m' is many-to-many ranging (standard
 * §10.32.6 SS-TWR / §10.32.7 DS-TWR): every UWB node in the scenario is a participant of one
 * shared round, and each participant's single transmission answers every participant that sent
 * before it and asks every participant that sends after it — no node is "the" tag or "the"
 * anchor, so `uwb.role` only decides how a node is drawn
 * (`docs/superpowers/specs/2026-09-30-many-to-many-design.md` §5).
 */
export type UwbMode = 'twr' | 'dl-tdoa' | 'ul-tdoa' | 'mms' | 'm2m'

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
 * The SRRR IE's own request bits (standard §10.32.9.9, SP3 Ranging Request Report): what a
 * responder asks the measurement report phase to tell it back, one IE per responder in the RCM.
 * Both map onto something the engine already computes — `raoa` onto the `aoa` session switch's
 * bearing, `rrtt` onto DS-TWR's round-trip time — so the schema's own job is only the request
 * bits, not a new quantity. Read only when `UwbSessionCfg.sp3` is on (see the schema's
 * `superRefine`); carried in every session, at its default, for the same reason `mms` is — so a
 * scenario saved before this slice existed reads back unchanged. standard §10.32.9.9
 */
export interface UwbSrrrCfg {
  /** Request the responding anchor's angle-of-arrival bearing. */
  raoa: boolean
  /** Request the round-trip time. */
  rrtt: boolean
}

/** Every bit off: a session that turns `sp3` on without asking for anything back from the
 * report phase still gets the ranging result itself (the reply time deferred rules already
 * require), just none of SRRR's own optional extras. */
export const DEFAULT_UWB_SRRR: UwbSrrrCfg = { raoa: false, rrtt: false }

/**
 * One ranging session (standard §10.32.2, the modes of §10.32.3): the block/slot structure every tag
 * shares, the TWR method, the channel, and the two noise knobs the engine
 * draws its timestamp and clock errors from.
 */
export interface UwbSessionCfg {
  method: 'ss' | 'ds'
  /**
   * Which two-way ranging procedure carries the reply time or round-trip time, and how (standard
   * §10.29.6.3–.7): `'embedded'` writes it into the very frame whose own send time it measures;
   * `'deferred'` sends that frame empty of it and reports it in a later one; `'fixed'` never puts
   * it on the air at all — both ends agree on it in advance and the responder is trusted to
   * transmit at exactly that offset. Default `'embedded'` is today's behaviour, so a scenario
   * saved before this field existed reads back unchanged. See `UwbReplyTime` in `uwb/phy.ts` and
   * `docs/superpowers/specs/2026-09-29-reply-time-design.md` §2–3.
   */
  replyTime: UwbReplyTime
  /**
   * `replyTime: 'fixed'` only: the first responder's fixed reply delay, in RSTU, counted from
   * *its own* reception of the Poll — not from when the tag sent it, because a device with no
   * shared clock has no other reference to measure from (design §6). Responder k's own delay is
   * this plus k × `slotRstu`.
   *
   * This is a *different* setting from `UwbMmsCfg.fixedReplyRstu` (the P802.15.4ab draft's
   * `macMmsFixedReplyTime`, nullable, 300–612 000 RSTU): the two share a name because they are
   * the same concept — a responder's delay pinned in advance rather than measured — in two
   * different documents (the published standard's §10.29.6.5 here, the draft's own field there),
   * for two different round shapes. Setting one does nothing to the other.
   *
   * Default is one whole `slotRstu` (design §6.1 — a corrected two-sided bound, not the
   * one-sided rule this field first shipped with): the first responder's nominal, zero-flight
   * transmission then lands 237.2 RSTU into slot 1 — one Poll's airtime past that slot's own
   * boundary — with room on both sides for the schema's `fixed` slot-fit rule to check against
   * (below). Half a slot, this field's original default, sits *below* the lower bound at the
   * default slot length: the first responder would transmit at 1.18 ms, still inside slot 0,
   * before its own slot has even opened — the "too early" failure §6.1 added a rule for.
   */
  fixedReplyRstu: number
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
  /**
   * How many rounds one control message governs (standard §10.32.9.1's ARC IE, "RCM Validity
   * Rounds", Content Control bits 9–14, six bits — 0–63 in the standard; this simulator counts
   * "how many rounds", so 1…64 here). 1 is today's behaviour: a fresh control message (ARC + RDM
   * + RRMC, today's Poll) every round — see `makePoll` vs. `makeInit` in `src/uwb/frames.ts`
   * and design §2. Only `mode: 'twr'` and `'dl-tdoa'` ever send that control message at all;
   * the schema refuses a non-default value for the other three modes (design §4; see `rmnr`'s
   * own doc comment for why `'dl-tdoa'` also caps it at 1 in practice). model (the "rounds
   * governed" framing; the standard's own field is the raw six bits)
   */
  rcmValidityRounds: number
  /**
   * Whether a responder holding a still-valid control message, but that missed this round's own
   * initiation message, sends the RMNR IE instead of sitting silent (standard §10.34; `makeRmnr`
   * in `src/uwb/frames.ts`). Default false, so an existing scenario reads back unchanged.
   *
   * Requires `rcmValidityRounds` above 1: with one control message per round, the control message
   * and the round's initiation message are the same frame (today's Poll), so a responder that
   * missed it has not "lost the initiation but kept the control message" — it has kept nothing,
   * including the slot table the control message would have given it. There is no slot for it to
   * send an RMNR frame from, so the state RMNR reports does not exist. The schema's `superRefine`
   * refuses `rmnr: true` with `rcmValidityRounds: 1` and says so (design §4, Ruling 2).
   */
  rmnr: boolean
  /**
   * Whether a responder confirms, with a dedicated frame of its own, which of an initiator's
   * current-window openers it actually received (standard §10.36's RMMRC IE; the request itself
   * is the ARC IE's MMRCR bit, bit 15 of the same Content Control word `rcmValidityRounds`
   * already occupies — standard §10.32.9.1). Default false, so an existing scenario reads back
   * unchanged. `src/uwb/session.ts`'s `blockCarriesMmrcm`/`mmrcmInitiators`/`blockSlots` are the
   * one place both ends of a round read it; see the schema's own `superRefine` for which modes
   * and schedules it is refused under, and why `'m2m'` is supported rather than refused (design
   * doc `2026-10-02-receipt-confirmation-design.md` §2–§4).
   */
  mmrcr: boolean
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
  /**
   * SP3 grouped ranging (standard §10.32.8): run the exchange over the physically shortest
   * ranging frame the standard has — SYNC + SFD + STS, no PHR, no payload (`uwbSp3Chips`/
   * `uwbSp3Ns` in `uwb/phy.ts`) — instead of a normal SP1 frame. Default false, so an existing
   * scenario reads back unchanged. Because an SP3 frame cannot carry a timestamp, the round
   * always adds a measurement report phase after the SP3 ranging phase (design §2 of
   * `docs/superpowers/specs/2026-10-02-sp3-design.md`) — the schema's `superRefine` only accepts
   * it alongside `replyTime: 'deferred'`, the one existing reply-time shape that already puts the
   * time off until a later message rather than putting it on the air at all (`'embedded'`) or
   * never transmitting it (`'fixed'`).
   */
  sp3: boolean
  /** The SRRR IE's own RAOA/RRTT request bits (standard §10.32.9.9); see `UwbSrrrCfg`. Only read
   * when `sp3` is on. */
  srrr: UwbSrrrCfg
  /**
   * Ranging ancillary information exchange, Request = 0 half (standard §10.35.1; RAICT IE
   * §10.35.2.1; design doc `docs/superpowers/specs/2026-10-02-ancillary-design.md`): a device of
   * the round sends a message that does not fit the frames this engine already builds, segmented
   * across `ancillaryFrames` consecutive slots of the round and reported by the RAICT IE the
   * segments carry. Default false, so an existing scenario reads back unchanged.
   *
   * The window this exchange is bounded to — "the current round and the rounds this RCM governs"
   * (§10.35.1) — is `rcmValidityRounds` above, read as-is rather than given a field of its own:
   * the ARC IE's own Ranging Validity Rounds field (§10.32.9.1) is what the standard itself names
   * as the boundary, and it is the same field RMNR and MMRCM already reuse for their own windows
   * (see `rcmValidityRounds`'s own doc comment). A second field naming the same boundary would be
   * a second name for it, exactly the mistake this branch's `rmnr` rules were once written around.
   */
  ancillary: boolean
  /**
   * How many consecutive ranging slots one ancillary message is segmented across (design §4.2):
   * the RAICT IE's own Frames Remaining field, where present, counts down from
   * `ancillaryFrames − 1` to 0 across them. model — a real device would size this from whatever
   * upper-layer payload it actually has to carry, and this simulator has no MAC primitive and no
   * upper layer at all to measure one from (the same reason `rcmValidityRounds`'s own doc comment
   * gives for why its count is a scenario setting rather than something derived). Default 1 — one
   * frame, not segmented — so an existing scenario reads back unchanged.
   *
   * The schema's `superRefine` caps this at the round's own slot count (`uwbSlotsPerTag`), never a
   * literal: a message cannot be segmented across more slots than the round it rides in actually
   * has.
   */
  ancillaryFrames: number
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

/** The session's own default ranging slot length: 2400 RSTU (2000 µs). `DEFAULT_UWB_SESSION`'s
 * `slotRstu` and `fixedReplyRstu` both read from this one name, and so does the zod schema's
 * `fixedReplyRstu` default below, so a `fixed` default that has to be "one slot's worth" (design
 * §6.1) cannot silently drift from the slot length it is one of. Zod has no way to default one
 * field from a sibling's own (possibly overridden) value at parse time, so this is as close to
 * "derived from slotRstu" as a single object's per-field defaults can get. model */
const UWB_DEFAULT_SLOT_RSTU = 2400

export const DEFAULT_UWB_SESSION: UwbSessionCfg = {
  method: 'ds', replyTime: 'embedded', fixedReplyRstu: UWB_DEFAULT_SLOT_RSTU,
  blockRstu: 240_000, slotRstu: UWB_DEFAULT_SLOT_RSTU, channel: 9, tsNoisePs: 100, cfoNoisePpm: 0.2, nlos: true,
  schedule: 'time', contentionSlots: 8, maxAttempts: 3,
  rcmValidityRounds: 1, rmnr: false, mmrcr: false,
  mode: 'twr', tdoaClockCorrection: true, syncErrorNs: 0, aoa: false,
  sp3: false, srrr: { ...DEFAULT_UWB_SRRR },
  ancillary: false, ancillaryFrames: 1,
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
  /**
   * Time-varying link fading. **Absent means off**, and absent is what every scenario
   * written before this section says: the link level is then the static table's number and
   * nothing else, bit for bit as before. Unlike the other optional sections this one has no
   * "absent = these defaults" reading, because the engine switches on the section's presence
   * rather than on a value inside it — see `FADING_DEFAULTS`, which take effect only once a
   * plan has written the section, even as `{}`.
   */
  fading?: FadingCfg
  /**
   * Objects in the room that reflect, giving every transmission a second arrival at every
   * receiver (`src/engine/scatter.ts`). **Absent means no echoes at all**, and absent is what
   * every scenario written before this section says: the only arrival is the direct one, bit
   * for bit as before.
   *
   * Absent is not the same as `[]`, and the difference is load-bearing rather than tidy: the
   * engine decides whether to compute echoes at all by whether this property is here, exactly
   * as it does for `fading`, so a plan that predates the section must not read back carrying an
   * empty list. An empty list is a different statement — a plan that has the section and no
   * objects in it yet — and the schema keeps the two apart in both directions.
   *
   * Walls are not scatterers (design §9): they still only add delay and loss to the direct ray.
   */
  scatterers?: ScattererCfg[]
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
      epc: z.string().regex(/^[0-9a-fA-F]{24}$/, 'EPC 是 24 个十六进制字符（96 位）').optional(),
    }).optional(),
    uwb: z.object({
      role: z.enum(['anchor', 'tag']),
      ppm: z.number().min(-100).max(100).optional(),
      yawDeg: z.number().min(-180).max(180).optional(),
    }).optional(),
  }).superRefine((n, ctx) => {
    if (n.linkId === '2g' && n.caps.generation === 'vht') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Wi-Fi 5（VHT）没有 2.4 GHz 模式：2.4 GHz 链路请改用 802.11g、Wi-Fi 6 或 Wi-Fi 7' })
    }
    if (n.linkId === '6g' && (n.caps.generation === 'nonht' || n.caps.generation === 'vht')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '6 GHz 需要 Wi-Fi 6 或 Wi-Fi 7：802.11a 与 Wi-Fi 5（VHT）没有 6 GHz 模式' })
    }
    if (n.kind === 'amp' && n.linkId !== undefined && n.linkId !== '2g') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'AMP 标签只落在 2.4 GHz 链路上' })
    }
    if (n.ampAp && !(n.kind === 'ap' && n.caps.generation === 'eht')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'AMP 轮询需要一个 Wi-Fi 7 的 AP：AMP 下行 PPDU 携带的是 U-SIG' })
    }
    if (n.ampTag && n.kind !== 'amp') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '只有 AMP 标签节点才带 AMP 标签设置：这个节点不是 AMP 标签' })
    }
    if (n.kind === 'uwb' && !n.uwb) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'UWB 节点需要 UWB 设置：角色是 anchor 或 tag' })
    }
    if (n.uwb && n.kind !== 'uwb') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '只有 UWB 节点才带 UWB 设置：这个节点不是 UWB 节点' })
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
  // 这两个长度来自 `MMS_RSF_SFD_N_MSR`：编辑器的置灰规则读的是同一份清单，
  // 免得校验与控件各自抄一遍草案。
  if (mms.rsfSfd && !MMS_RSF_SFD_N_MSR.includes(mms.nMsr)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rsfSfd'],
      message: `草案只在 RSF 片段长度为 ${MMS_RSF_SFD_N_MSR.join(' 或 ')} 时允许 RSF 带 SFD（15-25/0066r1）`,
    })
  }
  // 固定回复时间是从“收完对方整个 MMS 包”起算的（较晚的修订如此），
  // 而该时刻需要的到达时间估计只在非交织模式的包末才拿得到；
  // 交织模式里两端的片段互相穿插，根本没有这样一个“收完了”的起点。
  if (mms.fixedReplyRstu !== null && !mms.nonInterleaved) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fixedReplyRstu'],
      message: '固定回复时间只属于非交织模式：它从收完对方整个 MMS 包起算，而这个到达时间估计只在非交织的包末才拿得到（15-25/0224r2、15-25/0556r2）',
    })
  }
  // 固定回复时间是一对一的：草案把回复时间放在 One-to-one Response Compact 帧里，
  // 而一个共用的常量会让所有应答方在同一个时刻一起开发。
  if (mms.fixedReplyRstu !== null && mms.oneToMany) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fixedReplyRstu'],
      message: '固定回复时间是一对一的：草案把它放在 One-to-one Response Compact 帧里，而一对多时一个共用常量会让每个应答方在同一时刻一起发（15-25/0224r2）',
    })
  }
  // 这一条不是草案的禁令：草案把「固定回复时间」和「反序」两个位放在同一个八位组里
  // （MMS Number of Fragments Configuration 的 bit 6 与 bit 7），并没有禁止同时置位。
  // 拒绝的理由是本仿真器自己的自洽：一台设备不能既是开场先发包的那一方，
  // 又是「收到对方的包之后固定时间再回复」的那一方——后者要的起点，前者根本没有。
  if (mms.fixedReplyRstu !== null && mms.reversedOrder) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fixedReplyRstu'],
      message: '这是本仿真器的自洽规则，不是草案的禁令（草案把这两个位放在同一个八位组里，并没有禁止同时置位）：反序下应答方就是开场先发 MMS 包的那一方，而固定回复时间要的正是“收完对方的包”这个起点，它一台设备身上同时当不了这两个角色。反序自己那 600 RSTU 的偏移是发起方从进入测距阶段起算的，与这一项是两回事（15-25/0224r2、15-25/0556r2）',
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
  // UWB 驱动配置（配置 1）那一侧根本没有窄带电台：控制面的三条消息改成 UWB PHY 上的 SP0 包，
  // 于是信道允许列表与先听后发都没有可作用的对象。宁可拒绝，也不要让计划里留着一份
  // 给不存在的电台的设置——引擎在这种配置下也确实一个窄带信道都不抽。
  if (mms.control === 'uwbd' && (mms.nbChannels.length > 0 || mms.nbLbt !== 'off')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['nbChannels'],
      message: 'UWB 驱动配置没有窄带电台：窄带信道列表要留空、先听后发要设为 off，这两项在这里没有任何东西可以作用（15-25/0194r0）',
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

/**
 * The fading section, and the one place in this file where **where a default sits** is the
 * whole point.
 *
 * The defaults are on the fields, never on the section. `fading` itself is `.optional()` with
 * no `.default()`, so a scenario that says nothing about fading parses to an object with no
 * `fading` property at all — not to one carrying `FADING_DEFAULTS`. The engine reads that
 * absence as "do not enter the fading branch", which is the only reason every scenario written
 * before this section still produces the very same link levels, down to the floating-point
 * number, and the two hash fixtures do not move. Put a `.default()` here and every existing
 * plan would quietly start fading.
 *
 * Inside the section the defaults are on the fields instead, so a plan opts in by writing
 * `fading: {}` and gets the four figures `FADING_DEFAULTS` documents — the editor never has to
 * make a learner name a sigma before anything happens.
 *
 * `ricianKdB` is the exception: it is optional *in the input* and filled by the `transform`
 * below rather than by a `.default()` on the field, because the cross-field rule has to be able
 * to tell "the plan wrote a K factor" from "the schema supplied one". A field default would
 * make those two indistinguishable and the rule would refuse `fading: {}`. The parsed output
 * still has all four fields, which is what `FadingCfg` promises its callers.
 */
const FadingSchema = z.object({
  shadowSigmaDb: z.number().min(0, '阴影衰落的标准差不能为负：它是一个以 dB 为单位的标准差，0 表示不加阴影')
    .default(FADING_DEFAULTS.shadowSigmaDb),
  coherenceMs: z.number().positive('阴影的相干时间必须为正：这是阴影值保持不变的那段时间，取 0 等于每一纳秒都重抽一次阴影，那已经不是阴影衰落了')
    .default(FADING_DEFAULTS.coherenceMs),
  smallScale: z.enum(['none', 'rayleigh', 'rician']).default(FADING_DEFAULTS.smallScale),
  ricianKdB: z.number().optional(),
}).superRefine((f, ctx) => {
  // 这是本仿真器的自洽规则，不是任何标准的禁令；与本文件其他几条同形：
  // 一个不起作用的设置不该静静留在保存下来的计划里。物理上的理由是 K 因子的定义本身——
  // K 是直射径功率与散射功率之比，瑞利分布按定义没有直射径，none 则连小尺度衰落都不抽，
  // 两种情况下 smallScaleDb 都不会去读这个数。
  if (f.ricianKdB !== undefined && f.smallScale !== 'rician') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ricianKdB'],
      message: `莱斯 K 因子只属于 smallScale 为 rician 的场景：K 是直射径功率与散射功率之比，瑞利分布按定义没有直射径，none 连小尺度衰落都不抽，这里写下的数引擎一个字都不会读（smallScale 缺省是 ${FADING_DEFAULTS.smallScale}，所以不写分布也算不上 rician）。这是本仿真器的自洽规则，不是标准的禁令`,
    })
  }
}).transform((f): FadingCfg => ({
  ...f,
  // Filled only for rician, so this schema parses its own output. Filling it
  // unconditionally made the transform emit a K factor beside `rayleigh`, which
  // the rule above then refused — so saving a faded plan and loading it back
  // threw. A schema whose output is not valid input is a save/load bug waiting
  // for the first person who saves.
  ...(f.smallScale === 'rician'
    ? { ricianKdB: f.ricianKdB ?? RICIAN_K_DEFAULT_DB }
    : {}),
}))

/**
 * A coordinate of a reflecting object, metres. `.finite()` rather than the plain `z.number()`
 * that `Vec3Schema` uses for nodes, because these three numbers are the input to a subtraction
 * and two square roots (`echoPathM`): an infinity anywhere in a position makes the echo's delay
 * and its level both NaN, and a NaN level compares false against every threshold, so the echo
 * would not be rejected — it would silently disappear. Refusing it here is the only place the
 * mistake is still legible. Note that no *bound* is imposed: a reflector outside the drawn rooms
 * is a legitimate thing to place, and the geometry has no opinion about where the walls are.
 */
const ScattererCoordSchema = z.number()
  .finite('散射体的坐标必须是有限实数：回波的两段路程是由坐标算出来的，无穷大或 NaN 会让时延与电平一起变成 NaN，而 NaN 与任何门限比较都不成立，这条回波就会悄悄消失而不是被拒绝')

/**
 * One reflecting object. The three rules here are the three ways a plan can describe an object
 * the echo geometry cannot use, and there is deliberately no fourth.
 *
 * **`extraLossDb` is not bounded below.** It is the object's reflectivity in dB, and 0 dB is one
 * square metre — `apertureCorrectionDb` in `src/engine/scatter.ts` derives why, and half a
 * square metre is +3.01 dB. A filing cabinet or a wardrobe is several square metres, so its
 * figure is legitimately negative. A `min(0)` would be a bound the physics does not have.
 *
 * **`extraLossDb` is required, with no default.** It is the one figure the geometry cannot
 * supply for itself: 0 dB is not a neutral value but a claim that the object is a
 * one-square-metre reflector, so the plan states it rather than inheriting it.
 */
const ScattererSchema = z.object({
  id: z.string().min(1, '散射体的 id 不能为空：回波记录靠 id 指认是哪个物体反射的，没有名字的物体在记录里认不出来'),
  pos: z.object({ x: ScattererCoordSchema, y: ScattererCoordSchema, z: ScattererCoordSchema }),
  extraLossDb: z.number({ required_error: '散射体要写明 extraLossDb，也就是它比一面一平方米的反射面弱多少 dB：0 dB 不是“中性值”，而是“正好一平方米”这个说法，所以这个数要由场景写出来，不由 schema 替它猜' })
    .finite('散射体的 extraLossDb 必须是有限实数：它会直接加进回波的路径损耗，无穷大或 NaN 会让这条回波的电平变成 NaN'),
})

/**
 * The scatterers section.
 *
 * As with `FadingSchema`, **where the default sits is the whole point**: there is no
 * `.default([])` here and there must never be one. `scatterers` is `.optional()` and nothing
 * else, so a scenario that says nothing about reflecting objects parses to an object with no
 * `scatterers` property at all. The engine reads that absence as "do not compute echoes", which
 * is the only reason every scenario written before this section still produces the very same
 * arrivals and the two hash fixtures do not move. An empty list is left as an empty list for the
 * mirror-image reason: a plan that has the section and no objects in it yet must not read back
 * looking like a plan that predates the section.
 *
 * The uniqueness rule sits on the array rather than on the field so that its `path` is rooted at
 * `scatterers` like every other issue about this section, and points at the *second* of two
 * namesakes — the one that was just added is the one the editor should highlight.
 */
const ScatterersSchema = z.array(ScattererSchema).superRefine((list, ctx) => {
  const firstAt = new Map<string, number>()
  list.forEach((s, i) => {
    const first = firstAt.get(s.id)
    if (first === undefined) { firstAt.set(s.id, i); return }
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [i, 'id'],
      message: `散射体 id 重复：“${s.id}” 已经是第 ${first + 1} 个散射体的名字了。回波记录按 id 指认反射体，两个同名的物体在记录里分不开，看不出是哪一个反射的`,
    })
  })
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
      // Both default: an existing scenario carries neither key and must read back byte for byte
      // (task-2-brief.md). `fixedReplyRstu`'s default is `UWB_DEFAULT_SLOT_RSTU` — one whole
      // slot's worth (design §6.1) — not guessed: see the field's own doc comment on
      // `UwbSessionCfg` for the arithmetic.
      replyTime: z.enum(['embedded', 'deferred', 'fixed']).default('embedded'),
      fixedReplyRstu: z.number().int().min(0).default(UWB_DEFAULT_SLOT_RSTU),
      blockRstu: z.number().int().positive().refine((v) => v % 3 === 0, 'UWB 块长要是 3 RSTU 的整数倍'),
      slotRstu: z.number().int().min(300).refine((v) => v % 3 === 0, '测距时隙要是 3 RSTU 的整数倍'),
      channel: z.union([z.literal(5), z.literal(9)]),
      tsNoisePs: z.number().min(0),
      cfoNoisePpm: z.number().min(0),
      nlos: z.boolean(),
      schedule: z.enum(['time', 'contention']).default('time'),
      contentionSlots: z.number().int().min(2).max(32).default(8),
      maxAttempts: z.number().int().min(1).max(10).default(3),
      // Both default: an existing scenario carries neither key and must read back byte for byte,
      // same discipline as `replyTime`/`fixedReplyRstu` above. 1…64 is this simulator's "how many
      // rounds" count of the ARC IE's six-bit RCM Validity Rounds field (standard §10.32.9.1); see
      // `UwbSessionCfg`'s own doc comment for the derivation. standard §10.32.9.1 / model
      rcmValidityRounds: z.number().int().min(1).max(64).default(1),
      rmnr: z.boolean().default(false),
      // Default false for the same reason as rmnr above: an existing scenario carries neither key
      // and must read back byte for byte. standard §10.32.9.1 (the request bit) / §10.36 (the
      // answer) / model (this simulator's own choice of which modes carry it; see `superRefine`)
      mmrcr: z.boolean().default(false),
      mode: z.enum(['twr', 'dl-tdoa', 'ul-tdoa', 'mms', 'm2m']).default('twr'),
      tdoaClockCorrection: z.boolean().default(true),
      syncErrorNs: z.number().min(0).max(10).default(0),
      aoa: z.boolean().default(false),
      // Both default: an existing scenario carries neither key and must read back byte for byte,
      // same discipline as every other switch in this block. standard §10.32.8 (sp3) / §10.32.9.9
      // (srrr) / model (defaulting both request bits off)
      sp3: z.boolean().default(false),
      srrr: z.object({
        raoa: z.boolean().default(false),
        rrtt: z.boolean().default(false),
      }).default(() => ({ ...DEFAULT_UWB_SRRR })),
      // Both default: an existing scenario carries neither key and must read back byte for byte,
      // same discipline as every other switch in this block. standard §10.35.1 (ancillary) /
      // §10.35.2.1 (ancillaryFrames' own RAICT IE, Frames Remaining) / model (ancillaryFrames
      // itself: a scenario setting, not something derived — see `UwbSessionCfg`'s own doc
      // comment). `ancillaryFrames`'s upper bound depends on the round's own slot count, which
      // this object alone cannot compute, so it is checked in the scenario's own `superRefine`
      // rather than with a literal `.max()` here.
      ancillary: z.boolean().default(false),
      ancillaryFrames: z.number().int().min(1).default(1),
      // A session saved before P802.15.4ab existed here carries no MMS settings at all, and
      // reads back with the draft's defaults — so every such scenario replays unchanged.
      mms: UwbMmsSchema.default(() => ({ ...DEFAULT_UWB_MMS, nbChannels: [...DEFAULT_UWB_MMS.nbChannels] })),
      // The security pair, both absent by default: a plan that never named an attacker reads
      // back without either field, exactly as it was written.
      attacker: z.object({ advanceNs: z.number().min(0).max(10_000) }).optional(),
      stsOff: z.boolean().optional(),
    }).optional(),
    sixGhzCenterMhz: z.number().int().min(5955).max(7115).refine((v) => v % 5 === 0, '6 GHz 中心频率要落在 5 MHz 的信道步长上').optional(),
    // Optional with no default, deliberately: see FadingSchema. Absent is off.
    fading: FadingSchema.optional(),
    // The same deliberate shape, for the same reason: see ScatterersSchema. Absent means no
    // echoes, and `.default([])` here would put every existing scenario into the echo branch.
    scatterers: ScatterersSchema.optional(),
  })
  .superRefine((sc, ctx) => {
    // Wi-Fi needs its one AP; a scenario that is nothing but UWB nodes has no
    // BSS at all and must not be forced to invent one.
    const aps = sc.nodes.filter((n) => n.kind === 'ap')
    const wifi = sc.nodes.filter((n) => n.kind === 'sta' || n.kind === 'amp')
    if ((wifi.length > 0 || aps.length > 1) && aps.length !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `场景必须正好有一个 AP（现在有 ${aps.length} 个）：Wi-Fi 节点都归在同一个 BSS 下` })
    }
    // Every ranging rule is tagged `path: ['uwb']` so the editor can tell a
    // session issue from any other by its path rather than by reading its
    // wording (src/editor/planOps.ts · uwbSessionIssue).
    const uwbNodes = sc.nodes.filter((n) => n.kind === 'uwb')
    if (uwbNodes.length > 0) {
      if (!sc.uwb) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['uwb'], message: '场景里有 UWB 节点，就需要一个 UWB 测距会话（scenario.uwb）' })
      } else {
        // A contention round's response phase (schedule mode 0) has only the response frame to
        // work with: SS-TWR's; DS-TWR's report phase would need a second contention window of its
        // own, which this simulator does not model.
        if (sc.uwb.schedule === 'contention' && sc.uwb.method !== 'ss') {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['uwb'], message: '竞争式测距轮在本仿真器里只支持 SS-TWR：DS-TWR 的报告相位还要一个自己的竞争窗口，本仿真器没有建模' })
        }
        // The standard's five two-way ranging procedures pair DS-TWR with only two reply-time
        // shapes, deferred and embedded (§10.29.6.3–.7): there is no "DS-TWR fixed" procedure at
        // all, so asking for one is refused rather than silently run as a shape the standard
        // never defined.
        if (sc.uwb.method === 'ds' && sc.uwb.replyTime === 'fixed') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'DS-TWR 没有“固定回复时间”这一种时间信息形态（标准 §10.29.6.3–.7 只定义了它的嵌入式与延后两种）：请把 replyTime 改成 embedded 或 deferred，或者把 method 改成 ss',
          })
        }
        // A contention round's responder draws its slot at random (schedule mode 0, §10.32.2):
        // a deferred follow-up message needs a slot of its own to go to, and there is none to
        // draw for a frame the round never scheduled in the first place — the same shortfall
        // that already keeps DS-TWR's own report phase out of a contention round above.
        //
        // `&& !sc.uwb.sp3`: sp3 forces replyTime to 'deferred' (its own rule below) and refuses
        // both other shapes, so this rule's own remedy — "change replyTime to embedded or
        // fixed" — is exactly what sp3's rules forbid. Offering it to an sp3 reader would be the
        // same loop Ruling 2 of the rcm-validity slice was fixed for; sp3's own contention rule
        // below gives the sp3-specific remedy instead (schedule to time, or sp3 off).
        if (sc.uwb.schedule === 'contention' && sc.uwb.replyTime === 'deferred' && !sc.uwb.sp3) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: '竞争式测距轮里响应方是抽到时隙的，延后报文没有固定的时隙可去：请把 replyTime 改成 embedded 或 fixed，或者把 schedule 改成 time',
          })
        }
        // A contention round is a two-way exchange the tag starts; one-way ranging has no such
        // exchange to contend for (in DL-TDoA the tag never transmits, in UL-TDoA it transmits
        // once, in its own slot).
        // There are two schedules, so "not contention" and "time" are the same requirement: one
        // mistake, one issue. Listed by name rather than "not twr", because 'm2m' is not 'twr'
        // either and gets its own reason just below — this one is "no tag-initiated exchange to
        // contend for", m2m's is "there is nothing left to contend for at all".
        const mode = sc.uwb.mode
        if ((mode === 'dl-tdoa' || mode === 'ul-tdoa' || mode === 'mms') && sc.uwb.schedule !== 'time') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: '竞争式测距轮只属于双向测距：竞争抢的是标签发起的那一次往返交互，单向测距与 MMS 没有这样的交互可抢，请改用时间排定的会话',
          })
        }
        // A many-to-many round's every slot already belongs to a specific participant (design
        // §5): the whole round is laid out before it starts, so there is nothing left for a
        // contention phase to draw for — unlike a two-way round, where it is the tag's own
        // exchange that contention arbitrates.
        if (mode === 'm2m' && sc.uwb.schedule === 'contention') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: '多对多测距的每一个时隙都已经排给了确定的参与者：竞争抢的是谁能占到一个时隙，而这里时隙早就分完了，没有什么可抢的，请把 schedule 改成 time',
          })
        }
        // Ruling 1 (design §2/§4): a many-to-many participant's one transmission answers *every*
        // earlier participant at once. Embedded is the only shape that is not either meaningless
        // or absent from the standard's many-to-many clauses: a participant's own frame already
        // carries its own transmit time and the arrival times it holds, which *is* embedding.
        if (mode === 'm2m' && sc.uwb.replyTime !== 'embedded') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: sc.uwb.replyTime === 'fixed'
              ? '多对多测距里，一个参与者的一次发送要同时回复排在它前面的好几个人：固定回复时间量的是从某一次接收算起的时延，而这里没有唯一的一次接收可言，这个组合没有意义，请把 replyTime 改成 embedded'
              : '多对多测距没有独立的响应帧：参与者自己的那一次发送已经带着发送时刻与收到的每一个接收时刻，这就是嵌入式的做法；延后报文要再发一条单独的消息，标准的多对多条款里没有定义这样的消息，请把 replyTime 改成 embedded',
          })
        }
        // An anchor measures the angle of arrival on a frame the tag sends it, and only a
        // two-way round has one: in DL-TDoA the tag never transmits, in UL-TDoA its single blink
        // is not part of an exchange, and in MMS the tag's ranging signal is a train of
        // sequences, not a frame with a phase to compare. The engine guards on the mode, so the
        // flag would be silently inert here rather than wrong - the schema says so instead of
        // letting a hand-edited or imported plan carry a setting that does nothing.
        if ((mode === 'dl-tdoa' || mode === 'ul-tdoa' || mode === 'mms') && sc.uwb.aoa) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'AoA 是在双向测距的响应帧上测的：TDoA 与 MMS 模式下请把它关掉',
          })
        }
        // Many-to-many has neither a fixed anchor array nor a single tag to measure phase
        // against (design §5: role only decides how a node is drawn) — a participant's one frame
        // answers several people at once, so there is no one frame's arrival to point a boresight
        // at either. Refused rather than left silently inert, for the same reason as the modes
        // above.
        if (mode === 'm2m' && sc.uwb.aoa) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: '到达角是锚点朝着固定的天线阵列、对准标签的一次发送测出来的：多对多里没有锚点也没有标签，每个参与者的一次发送回答的是好几个人，没有单独朝着谁的那一次发送可测，请把 aoa 关掉',
          })
        }
        // RCM Validity Rounds / RMNR (design §4 of 2026-10-01-rcm-validity-design.md). Both fields
        // default to today's behaviour (rcmValidityRounds 1, rmnr false), so an existing scenario
        // reads back unchanged.
        const { rcmValidityRounds, rmnr } = sc.uwb
        // Ruling 2 — the one refusal in this slice that exists to teach a mechanism rather than to
        // block a misconfiguration. Scoped to 'twr' only: 'dl-tdoa' gets its own unconditional
        // rmnr refusal below instead of this one, fixing a round-1 defect — this message's remedy
        // is "raise rcmValidityRounds above 1", but DL-TDoA's own rule (also below) refuses any
        // value above 1, so pairing the two here sent a dl-tdoa reader in a circle: rcmValidityRounds
        // 1 + rmnr true triggered this message, rcmValidityRounds 4 + rmnr true triggered the other,
        // and each told the reader to do what the other forbade. DL-TDoA's rmnr rule below says the
        // one thing neither contradictory message could: rmnr cannot be used in DL-TDoA at all.
        if (mode === 'twr' && rmnr && rcmValidityRounds === 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: '每轮一条控制消息（rcmValidityRounds 为 1）时，这条控制消息和本轮的测距启动消息是同一帧——'
              + '就是今天的轮询帧。这一帧一丢，响应方不是“错过了启动消息、却还留着控制消息”，它是什么都没留下：'
              + '连自己该在哪个时隙发送都不知道，没有时隙可去，RMNR 要报告的那个状态——“控制消息收到了，'
              + '本轮启动消息没收到”——根本不存在，也就没有什么可发：请把 rcmValidityRounds 调到 2 以上，'
              + '让控制消息跨轮有效，或者把 rmnr 关掉',
          })
        }
        // Contention (standard §10.32.2 schedule mode 0): a responder's slot is **its own draw**,
        // and it draws on the initiation message. A responder that missed that message therefore
        // has no slot — not because it forgot the schedule, but because the schedule never named
        // one for it, and a still-valid control message cannot supply what it never contained.
        // So the state RMNR reports cannot arise here either, for a different reason than the
        // rcmValidityRounds-1 case above: there the control message was lost with the initiation,
        // here it survives and still does not help.
        //
        // Found by Task 4, which measured the combination doing nothing rather than assuming it
        // worked: the schema permitted it and no round could ever emit an RMNR frame. A permitted
        // configuration that provably does nothing is how a feature comes to look finished.
        if (mode === 'twr' && rmnr && sc.uwb.schedule === 'contention') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: '竞争式测距轮里，响应方的时隙是它自己抽的，而它是在那条启动消息上抽的。'
              + '没收到启动消息的响应方因此没有时隙可去——不是忘了排定表，是排定表从来没有给它指定过一个，'
              + '而一条仍然有效的控制消息也拿不出它本来就不包含的东西。于是 RMNR 要报告的那个状态'
              + '在竞争轮里同样不存在：请把 schedule 改成 time，或者把 rmnr 关掉',
          })
        }
        // DL-TDoA (task-2-brief.md's hint): one block holds exactly one round — the anchors run it
        // once and every tag in the scenario listens to that same round (see the block-fit
        // comment further down). rcmValidityRounds buys "a few more rounds under the same control
        // message", and DL-TDoA never has a next round in the same block to buy — asking for more
        // than one is not a bigger window, it is a count with nothing left to count. This rule and
        // the one right after it can both fire on the same scenario (rcmValidityRounds 4, rmnr
        // true) without contradicting each other: each prescribes a change the other does not
        // forbid, which is exactly what the round-1 fix restored.
        if (mode === 'dl-tdoa' && rcmValidityRounds !== 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'DL-TDoA 的一个块只有一轮：锚点们跑一次，场景里每个标签都听同一轮测距。'
              + 'rcmValidityRounds 买的是“这条控制消息还能再管几轮”的空口时间，而这里一个块里根本没有下一轮可管，'
              + '请把 rcmValidityRounds 改回 1',
          })
        }
        // DL-TDoA + rmnr (round-1 fix): refused unconditionally, whatever rcmValidityRounds is set
        // to — not "refused at 1, allowed above 1" the way 'twr' is, which is what created the loop
        // above. RMNR only means something where a control message can still be valid in a later
        // round than the one it arrived in; that requires a block with a later round to be valid
        // *in*. DL-TDoA's block never has one (the rule above), so there is no value of
        // rcmValidityRounds — 1, 2, or 64 — under which "holds a still-valid control message but
        // missed this round's initiation" can describe a DL-TDoA round at all.
        if (mode === 'dl-tdoa' && rmnr) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'RMNR 要求一条跨轮仍然有效的控制消息——没收到本轮的启动消息时，还能靠上一轮收到的那条控制消息'
              + '知道自己的时隙。可“跨轮”要一个块里有不止一轮才谈得上：DL-TDoA 的一个块只有一轮，锚点们只跑这一次，'
              + '没有“上一轮”把控制消息传过来，也就没有“仍然持有一条有效的控制消息，却没收到本轮启动消息”这种'
              + '状态能在 DL-TDoA 里出现——不管 rcmValidityRounds 设成几都一样：请把 rmnr 关掉',
          })
        }
        // UL-TDoA (task-2-brief.md's hint: a UL-TDoA round is a single blink slot). `makeBlink`
        // carries no ARC, no RDM, no control message at all, ever: there is nothing here for
        // rcmValidityRounds to extend the life of. And there is no responder either — every anchor
        // is a passive receiver of the one blink, not an answerer with a slot of its own to lose
        // track of — so RMNR's state cannot exist here whatever rcmValidityRounds is set to.
        if (mode === 'ul-tdoa' && rcmValidityRounds !== 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'UL-TDoA 里标签只发一次闪烁帧，没有 ARC IE，没有控制消息：rcmValidityRounds 管的是控制消息'
              + '还能再管几轮，这里从来就没有控制消息可管，请把 rcmValidityRounds 改回 1',
          })
        }
        if (mode === 'ul-tdoa' && rmnr) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'RMNR 要求一个“持有仍然有效的控制消息、却没收到本轮启动消息”的应答方；UL-TDoA 的闪烁帧不是'
              + '发给谁的，也没有谁来应答——每个锚点只是被动接收——既没有应答方，也没有控制消息，请把 rmnr 关掉',
          })
        }
        // MMS (design §5): its control plane is the narrowband nbPoll/nbResp/nbReport of
        // P802.15.4ab, a different protocol on a different radio, not the ARC IE this slice reads.
        // No MMS frame
        // ever carries an ARC IE, so there is no control message here for rcmValidityRounds to
        // extend, and no responder reading its slot from one for rmnr to stand in for.
        if (mode === 'mms' && rcmValidityRounds !== 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'MMS 的控制面走的是窄带的 nbPoll/nbResp/nbReport（P802.15.4ab 草案），不是这里的 ARC IE：'
              + 'rcmValidityRounds 管的是 UWB 层那条控制消息还能再管几轮，MMS 的测距帧里没有这条消息，'
              + '请把 rcmValidityRounds 改回 1',
          })
        }
        if (mode === 'mms' && rmnr) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'RMNR 说的是一个“仍然持有 ARC 控制消息、却没收到本轮启动消息”的应答方；MMS 的控制面另起'
              + '炉灶，从来没有 ARC 控制消息，也就没有谁能“仍然持有”它，请把 rmnr 关掉',
          })
        }
        // Many-to-many (design §1/§2 of the many-to-many slice): no Poll at all — every
        // participant's one transmission is at once the question to everyone after it and the
        // answer to everyone before it (`makeM2m`). There is no separate control message for
        // rcmValidityRounds to extend, and no fixed responder slot handed out by one for rmnr to
        // stand in for.
        if (mode === 'm2m' && rcmValidityRounds !== 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: '多对多测距没有独立的控制消息：每个参与者的一次发送本身既是问也是答，rcmValidityRounds '
              + '管的是控制消息还能再管几轮，这里没有这样一条消息，请把 rcmValidityRounds 改回 1',
          })
        }
        if (mode === 'm2m' && rmnr) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'RMNR 说的是一个“仍然持有控制消息、却没收到本轮启动消息”的应答方；多对多测距里没有谁的'
              + '时隙是从一条控制消息里分来的，也没有谁在等一条本该收到却没收到的启动消息，请把 rmnr 关掉',
          })
        }
        // Multiple-message receipt confirmation (standard §10.36; design doc
        // 2026-10-02-receipt-confirmation-design.md, task 2 — `mmrcr` defaults to today's
        // behaviour, false, so an existing scenario reads back unchanged). The request itself (the
        // ARC IE's MMRCR bit) is modelled the same way `rcmValidityRounds`/`rmnr` already are — a
        // session-level setting both ends read off the one plan, not a bit toggled on the air — so
        // the rules below are only about which modes and schedules the *answer* (an MMRCM frame,
        // standard §3.2) ever makes sense for.
        const mmrcr = sc.uwb.mmrcr
        // Contention (standard §10.32.2 schedule mode 0; same shortfall as RMNR's own contention
        // refusal above): the whole point of a confirmation frame is that the device sending it
        // owns a slot the initiator can count on finding it in. A contention response phase hands
        // out no such slot — anchors draw for it — so putting the confirmation there would just
        // reintroduce, for the confirmation itself, the very collision risk it exists to resolve.
        if (mmrcr && sc.uwb.schedule === 'contention') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: '收妥确认要落在一个确定属于某个应答方的时隙里，而竞争式测距轮的响应窗口是抽来的，没有谁能'
              + '保证自己占到那个时隙——把确认帧也塞进竞争窗口，等于把它本该解决的碰撞风险又带了回来：'
              + '请把 schedule 改成 time，或者把 mmrcr 关掉',
          })
        }
        // DL-TDoA (model): the only two parties that could stand in a request/answer pair here are
        // anchor 0, which sends the round's one control message, and the anchors that answer it —
        // and an anchor's own Response already tells anchor 0 whether its Poll got through, with no
        // extra frame needed to say so again. The party that actually cannot tell whether it was
        // heard is a tag, but DL-TDoA's tags never transmit at all (they only position themselves
        // from the anchors' own round): they are not an address either end of this exchange can
        // confirm receipt to or from.
        if (mmrcr && mode === 'dl-tdoa') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'DL-TDoA 里能发出控制消息的只有 anchor 0，其余 anchor 收没收到它的 Poll，已经由它自己'
              + '发没发 Response 直接说明，不必再发一帧去确认同一件事；真正不知道自己有没有被听见的是标签，'
              + '可标签在 DL-TDoA 里从不发送——它不是双方都认识的一个地址，没法问它，也没法替它确认，'
              + '请把 mmrcr 关掉',
          })
        }
        // UL-TDoA (same shortfall its own rcmValidityRounds/rmnr rules above name): a blink carries
        // no ARC IE and opens no exchange at all, so there is nowhere for a request bit to sit and
        // no slot a confirmation could be scheduled into.
        if (mmrcr && mode === 'ul-tdoa') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'UL-TDoA 里标签只发一次闪烁帧，没有 ARC IE，也没有谁来应答：收妥确认问的是“你收到了我'
              + '开场的哪几条”，而这里连“开场”这件事都不存在，请把 mmrcr 关掉',
          })
        }
        // MMS (same reasoning as its own rcmValidityRounds/rmnr rules above): the control plane
        // that would carry the request rides a different radio entirely.
        if (mmrcr && mode === 'mms') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'MMS 的控制面走的是窄带的 nbPoll/nbResp/nbReport，不是这里的 ARC IE：收妥确认请求的那一位'
              + '没有地方可以搭，请把 mmrcr 关掉',
          })
        }
        // twr, rcmValidityRounds 1 (task-2-brief.md's own question: "the window is one block, the
        // bitmap is one bit — is it still worth a frame?"). For two-way ranging, no: a window of
        // one round covers exactly the round that just ran, and whether that one message got
        // through is already visible for free — a responder either sent a Response or it did not.
        // An MMRCM frame here would spend airtime re-stating what the round's own silence or
        // Response already said.
        if (mmrcr && mode === 'twr' && rcmValidityRounds === 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: '每轮一条控制消息时，窗口只有一块，位图也只有一位，而这一位说的正是“这一帧收到了没有”——'
              + '响应方发没发 Response，已经当场说明了同一件事，不必再发一帧去确认它：请把 rcmValidityRounds '
              + '调到 2 以上，让窗口真的跨出一块以上，或者把 mmrcr 关掉',
          })
        }
        // m2m (task-2-brief.md's hint, checked rather than taken on faith: design §2 points at this
        // mode as the one the standard's own Figure 10-272 is drawn over, but that figure's A1…AN
        // answered by B1…BM is not this engine's shape — a many-to-many round has no fixed
        // initiator/responder split, every participant is both at once). Deliberately **not**
        // refused, and not for the figure's reason but for one specific to this mode: 'm2m' already
        // pins rcmValidityRounds at 1 (the rule above), so the window mmrcr would describe here is
        // always exactly the round that just ran — the very "one bit, is it worth a frame?" case
        // 'twr' refuses just above. The two modes answer that question oppositely because the thing
        // that makes 'twr's bit free does not exist here: a two-way responder's silence-or-Response
        // already tells the initiator whether it was heard, at no extra cost, but a many-to-many
        // participant's one transmission is only ever echoed *forward* — `UwbM2mTimes.rxCounters`
        // reports receipt to whoever transmits *after* the sender in the same round, never back to
        // the sender itself (design §2 of the many-to-many slice). So the round's last participant,
        // and any participant whose broadcast a later one simply lost, have no other frame that
        // ever tells them they were heard — mmrcr's one bit is the only thing in this mode that
        // ever answers that question, which is exactly the gap design §2 of this slice opens with.
        // `mmrcmInitiators` in `uwb/session.ts` is accordingly every one of the round's own
        // participants here, not the single tag a two-way round has (design §3.3 below).
        // The capacity check further down (`mmrcrSlots`/`m2mRoundSlots`) prices that directly.
        //
        // SP3 grouped ranging (standard §10.32.8; design docs/superpowers/specs/
        // 2026-10-02-sp3-design.md §2/§3). `sp3` defaults false, so an existing scenario reads
        // back unchanged; `srrr` (the SRRR IE's own RAOA/RRTT request bits, §10.32.9.9) is carried
        // in every session, at its default, for the same reason `mms` is.
        const sp3 = sc.uwb.sp3
        const srrr = sc.uwb.srrr
        // Only 'twr' ever runs the three-phase round this flag turns on (RCM with one SRRR IE per
        // responder → SP3 ranging phase → measurement report phase, §10.32.8.1). dl-tdoa's own
        // Poll/Response/Final is an exchange *among anchors*, not the tag–anchor one SRRR
        // addresses — the other three never send an RCM at all, for the identical reason their own
        // rmnr/mmrcr rules above already give.
        if (sp3 && mode === 'dl-tdoa') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'SP3分组测距问答的是标签这一端：DL-TDoA里收发Poll、Response与Final的是锚点之间，'
              + '标签在这个模式下从不发送，没有一次标签-锚点的往返可以压成SP3标记，请把 sp3 关掉',
          })
        }
        if (sp3 && mode === 'ul-tdoa') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'UL-TDoA里标签只发一次闪烁帧，没有RCM，也没有应答方能在RCM之前声明自己要报告哪几'
              + '项：请把 sp3 关掉',
          })
        }
        if (sp3 && mode === 'mms') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'MMS的控制面走窄带的nbPoll/nbResp/nbReport，测距信号是一串片段：既没有这里的'
              + 'ARC/SRRR IE，也没有SP3这种UWB PHY包格式的位置，请把 sp3 关掉',
          })
        }
        if (sp3 && mode === 'm2m') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: '多对多测距没有独立的RCM：每个参与者的一次发送本身既是问也是答，SRRR IE要挂在'
              + 'RCM里按应答方逐个声明它要报告哪几项，这里没有这样一条控制消息可挂，请把 sp3 关掉',
          })
        }
        // The four rules below are scoped to `mode === 'twr'` on purpose, even though `sp3` is
        // already refused outright for every other mode above: 'm2m' has its own unconditional
        // "replyTime must be embedded" rule (Ruling 1), and an un-scoped sp3+embedded or
        // sp3+fixed rule here would tell an sp3+m2m reader to set replyTime to 'deferred' in the
        // very same parse that rule tells them to set it to 'embedded' — two remedies for the same
        // field pointing opposite ways, the Ruling-2 loop shape, even though each rule's *other*
        // remedy ("turn sp3 off") still resolves both at once. Scoping to 'twr' — the only mode
        // sp3 is ever legal in anyway — keeps a non-twr scenario's sp3 complaint to the one
        // "wrong mode" message above and nothing else.
        //
        // SP3's own teaching point (design §2): an SP3 packet is SYNC + SFD + STS, no PHR, no
        // payload — it cannot carry a timestamp at all, so 'embedded' (write the reply time into
        // the very frame that measures it) is not a configuration this round can run under: there
        // is no field left in the frame to write it into.
        if (sp3 && mode === 'twr' && sc.uwb.replyTime === 'embedded') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'SP3包只有SYNC+SFD+STS，没有PHR，也就没有载荷：嵌入式要把回复时间写进测量它的'
              + '那一帧本身，而这一帧已经没有字段可写——不是配置选不选的问题，请把 replyTime 改成 '
              + 'deferred，或者把 sp3 关掉',
          })
        }
        // 'fixed' is the one shape that never puts a reply time on the air at all, embedded or
        // not — both ends agree on it in advance (design §6 of the reply-time slice) and no
        // message ever carries it. SP3's marker buys exactly one thing: the round no longer has to
        // embed the reply time in the frame that measures it, because that value instead comes
        // back in the mandatory report phase this flag adds (design §2). Under 'fixed' that value
        // was never going to be transmitted anyway, with or without SP3, so there is nothing for
        // the report phase to carry back — the schema's own mandatory phase would have no reply
        // time of its own to report.
        if (sp3 && mode === 'twr' && sc.uwb.replyTime === 'fixed') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: '固定回复时间下，回复时间从不会出现在空口上——两端早就按约定好的时延各自发送，'
              + '不会再有哪一条消息把它随后补回来。SP3把测距帧压到最短，换的正是"这个值随后由另一条'
              + '消息补上"这件事，而固定回复时间下根本没有这件事，SP3这里要求的测量报告相位也就没有'
              + '回复时间可以携带：请把 replyTime 改成 deferred，或者把 sp3 关掉',
          })
        }
        // Contention (standard §10.32.2 schedule mode 0): refused here with its own remedy rather
        // than left to the generic contention+deferred rule above (now scoped away from sp3 for
        // exactly this reason) — that rule's other remedy, "change replyTime to embedded or
        // fixed", is what sp3's own two rules just above forbid, so leaving it in play here would
        // reopen the same kind of loop Ruling 2 of the rcm-validity slice was fixed for.
        if (sp3 && mode === 'twr' && sc.uwb.schedule === 'contention') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: '竞争式测距轮里响应方的时隙是抽来的：SRRR IE要在RCM里按固定的应答方逐个声明它'
              + '要报告哪几项，而竞争窗口里谁会抽到哪个时隙事先并不知道，请把 schedule 改成 time，'
              + '或者把 sp3 关掉',
          })
        }
        // The SRRR IE's own request bits (§10.32.9.9), checked only once sp3 is on: whatever
        // either bit says when sp3 is off describes a report phase that does not exist, the same
        // way `mms`'s own fields are only checked in `mode: 'mms'`.
        // …and both bits are refused outside SS-TWR, because the frames that answer them are the
        // deferred SS shape's own (§10.29.6.3's follow-up message carries the bearing; the
        // initiator's own measurement report carries the round trip, design §4.1). A DS round's
        // report phase is the double-sided exchange's own — its responder's report already carries
        // a round-trip time whatever SRRR says, and nothing in it would grow by a bearing — so
        // either bit there would be a request this engine accepts and provably never answers, which
        // is the trap `contention` + `rmnr` was the first instance of. Fix round 1 of task 3, and
        // the answer to task 2's own open question about `method` and `rrtt`.
        if (sp3 && mode === 'twr' && sc.uwb.method !== 'ss' && (srrr.raoa || srrr.rrtt)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'SRRR的两个请求位，是由延后那一条路上的报告帧来回答的：方位角装在响应方的延后'
              + '报文里，往返时间装在发起方自己那一帧测量报告里。DS-TWR的报告相位是双边交换自己的，'
              + '它既不会因为方位角变长，也已经无条件带着一个往返时间，请求放在这里不会有任何一帧回答它'
              + '——请把 method 改成 ss，或者把 srrr 的两个位都关掉',
          })
        }
        if (sp3 && mode === 'twr' && srrr.raoa && !sc.uwb.aoa) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'RAOA请求的是锚点测到的到达角，而到达角是aoa这个会话开关算出来的；aoa关着时'
              + '锚点从没算过这个角，报告相位里没有它可以报：请把 aoa 打开，或者把 srrr.raoa 关掉',
          })
        }
        // Ranging ancillary information exchange, Request = 0 (standard §10.35.1; RAICT IE
        // §10.35.2.1; design doc 2026-10-02-ancillary-design.md). `ancillary` defaults false, so
        // an existing scenario reads back unchanged; `ancillaryFrames` is carried in every
        // session, at its default, for the same reason `srrr`/`mms` are.
        const ancillary = sc.uwb.ancillary
        const ancillaryFrames = sc.uwb.ancillaryFrames
        // DL-TDoA (model): the round's whole air interaction is anchor-to-anchor — anchor 0 sends
        // the Poll, the other anchors answer it, anchor 0 sends the Final — and the tag never
        // transmits and is never the addressee of any of those three frames either; it only
        // overhears them to work out its own time differences. An ancillary exchange needs one
        // end to send the message and the other to receive it; DL-TDoA's tag can be neither one,
        // and there is no anchor-to-tag slot in the round for the message to travel in.
        if (ancillary && mode === 'dl-tdoa') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'DL-TDoA的空口交互只在锚点之间：anchor 0发Poll，其余锚点发Response，anchor 0发'
              + 'Final，标签全程只听、不发，也从来不是这几帧里任何一帧指明的收件人——辅助信息交换要'
              + '有发、收两端，这里没有一个锚点对标签说话的时隙能让这条消息走，请把 ancillary 关掉',
          })
        }
        // UL-TDoA / MMS / m2m (same shortfall, stated once per mode, same fact their own
        // rcmValidityRounds/rmnr rules above already establish): none of the three ever sends the
        // ARC IE at all, so none of them has the window `ancillary` reuses — §10.35.1 bounds the
        // exchange to the current round plus the rounds the ARC IE's own Ranging Validity Rounds
        // field still governs, and a mode with no ARC IE has no such field to read.
        if (ancillary && mode === 'ul-tdoa') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'UL-TDoA里标签只发一次闪烁帧，没有ARC IE：辅助信息交换要靠ARC IE的Ranging '
              + 'Validity Rounds字段圈出它落在哪几轮里，这里没有这个字段可读，请把 ancillary 关掉',
          })
        }
        if (ancillary && mode === 'mms') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'MMS的控制面走窄带的nbPoll/nbResp/nbReport，没有ARC IE；测距信号本身是一串'
              + '片段，也没有能带RAICT IE的UWB帧：辅助信息交换两头都没有地方可落，请把 ancillary 关掉',
          })
        }
        if (ancillary && mode === 'm2m') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: '多对多测距没有独立的控制消息，也没有ARC IE：辅助信息交换沿用的正是ARC IE的'
              + 'Ranging Validity Rounds字段圈出的那个窗口，这里没有这个字段可读，请把 ancillary 关掉',
          })
        }
        // SP3 (standard §10.32.8; design docs/superpowers/specs/2026-10-02-sp3-design.md), scoped
        // to 'twr' for the same reason the four sp3 rules above are: sp3 is already refused
        // outright for every other mode, so a non-twr scenario gets only the one "wrong mode"
        // complaint, not this one as well. SP3's own report phase (§10.32.8.2, design §4.1) is a
        // batch of frames the round already appends after its ranging phase, sized purely from the
        // SRRR IE's two request bits. Ancillary's own frames are a second, independently-sized
        // batch (`ancillaryFrames`, a scenario setting unrelated to SRRR) appended for an unrelated
        // reason, and this task does not say which batch goes first or how the two share whatever
        // slots the round has left — so the two are refused together rather than left to silently
        // pick an order nobody asked for.
        if (ancillary && sp3 && mode === 'twr') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['uwb'],
            message: 'SP3的报告相位（标准§10.32.8.2，design doc §4.1）是这一轮已经追加在测距帧之后'
              + '的一段，追加几帧由SRRR的两个请求位决定。辅助信息消息另外要追加的帧数'
              + '（ancillaryFrames）是场景单独设置的一个数，这一刀没有规定两段追加该怎样排在一起：'
              + '请把 sp3 关掉，或者把 ancillary 关掉',
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
              message: 'MMS 序列串至少要有一个片段（rsfs + rifs > 0）',
            })
          }
          if (!Number.isInteger(mms.gap) || mms.gap < 0 || mms.gap > 64) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['uwb'], message: 'MMRS 间隔要是 0…64 的整数' })
          }
          // The narrowband allow list, and only where there is a narrowband radio to use it:
          // Config 1's list is empty by the rule in `UwbMmsSchema`, and demanding a channel of a
          // session that has no second radio would leave no legal UWB-driven plan at all.
          // 4ab draft 15-25/0194r0
          const channels = mms.nbChannels
          const distinct = new Set(channels).size === channels.length
          const inRange = channels.every((c) => Number.isInteger(c) && c >= 0 && c < NB_CHANNELS)
          if (mms.control === 'nba'
            && (channels.length < 1 || channels.length > NB_CHANNELS || !distinct || !inRange)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: '窄带信道允许列表要填 1…250 个互不相同的信道，编号 0…249',
            })
          }
          // The draft's ranging slot is a multiple of 300 RSTU (0.25 ms), not of the 3 RSTU the
          // core standard asks for: the cycle is laid out in milliseconds and the slot has to
          // divide them. 4ab draft 15-22/0381r5 §1.1.1
          if (sc.uwb.slotRstu % 300 !== 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: 'MMS 测距时隙要是 300 RSTU 的整数倍（P802.15.4ab 草案）',
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
              message: `${sc.uwb.slotRstu} RSTU 的时隙只有 ${(slotNs / 1000).toFixed(1)} µs，而最长的 MMS `
                + `片段要 ${(fragNs / 1000).toFixed(1)} µs 再加上飞行时间`,
            })
          }
          // …and a one-to-many POLL names every responder, three octets each, so the longest
          // narrowband message of the round grows with the anchor count even though no fragment
          // does. At the draft's 600 RSTU slot that caps a one-to-many round at three responders.
          // …and only Config 2 sends one. Config 1's control frames are SP0 packets, whose
          // length is the packet format's and fits one slot at every legal slot length
          // (`MMS_SP0_WINDOW_SLOTS`), so there is no window to outgrow here.
          const responders = mmsResponders(mms, uwbNodes.filter((n) => n.uwb?.role === 'anchor').length)
          const nbNs = uwbNbSlotFitNs(mms, responders)
          if (mms.control === 'nba' && 2 * slotNs < nbNs) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: `两个 ${sc.uwb.slotRstu} RSTU 的时隙合起来是 ${(2 * slotNs / 1000).toFixed(1)} µs，而一轮里有 `
                + `${responders} 个应答方时，窄带消息要 `
                + `${(nbNs / 1000).toFixed(1)} µs 再加上飞行时间`,
            })
          }
        }
        const anchors = uwbNodes.filter((n) => n.uwb?.role === 'anchor').length
        const tags = uwbNodes.filter((n) => n.uwb?.role === 'tag').length
        // Many-to-many has neither a tag nor an anchor (design §5): every UWB node in the
        // scenario is a participant, and `uwb.role` only decides how it is drawn — it may be
        // anything, including all-tag, all-anchor or a mix, and none of that changes how the
        // round ranges. The requirement below is a two-way/TDoA rule, not a UWB-session rule, so
        // it is skipped for m2m rather than relaxed into accepting zero of either.
        if (mode !== 'm2m' && (anchors < 1 || tags < 1)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['uwb'], message: `UWB 会话至少要有一个 anchor 和一个 tag（现在是 ${anchors} 个和 ${tags} 个）` })
        } else if (mode === 'm2m') {
          // Every UWB node is a participant here (design §5) — not just the ones counted into
          // `anchors`/`tags` above, which name roles that do not mean "participant" in this mode.
          const participants = uwbNodes.length
          // The participant cap (design §4): the last participant's frame carries every earlier
          // participant's arrival time, so it is the round's longest one. Searched via
          // `uwbMaxParticipants`, never a literal — the same discipline `uwbMaxAnchors` follows
          // for the two-way cap below.
          const cap = uwbMaxParticipants(sc.uwb.method)
          if (participants > cap) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: `一轮多对多测距最多容纳 ${cap} 个参与者（现在有 ${participants} 个）：`
                + '排在最后的参与者带着前面每一个人的接收时刻，那一帧是全轮最长的，超过就会撑破 127 个八位组的 PSDU 上限（标准 §16.2.7）',
            })
          }
          // The slot has to hold that same longest frame plus the flight guard, exactly the
          // check every other mode gets below — aimed at the many-to-many frame's own size
          // function (`uwbM2mBytes`) rather than `uwbLongestFrameBytes`, which still has no
          // many-to-many case (design §5's cap is sized off `uwbM2mBytes`/`uwbMaxParticipants`
          // directly, not off the two-way frame chooser).
          // Read from `uwbM2mSlotFitNs`, not written out here: `UwbNetwork` enforces the identical
          // rule in nanoseconds when it lays the round out, and two copies of it is exactly the
          // drift Ruling 7 of this slice took out of this very function.
          const m2mSlotNs = rstuNs(sc.uwb.slotRstu)
          const m2mNeedNs = uwbM2mSlotFitNs(participants)
          if (m2mSlotNs < m2mNeedNs) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: `${sc.uwb.slotRstu} RSTU 的测距时隙只有 ${(m2mSlotNs / 1000).toFixed(1)} µs，而 `
                + `${participants} 个参与者的一轮多对多测距，最长的那一帧加上飞行时间要 ${(m2mNeedNs / 1000).toFixed(1)} µs：`
                + '请加大 slotRstu 或减少参与者数量',
            })
          }
          // One round holds the whole group, the same way a DL-TDoA round does (design §5) — not
          // one round per tag, because m2m has no tags to count rounds by. SS sends N slots, one
          // per participant; DS sends two passes of N, one per pass (design §3).
          // Ruling 7 (Task 3): this used to be its own inline formula, a second copy of exactly
          // what `uwbSlotsPerTag` now also computes for `mode: 'm2m'` — two sources of truth for
          // how long a round is, the very drift class slice 1 was bitten by once already. Reading
          // it from `uwbSlotsPerTag` instead — the same call `roundPlan` makes — is what
          // `tests/model/m2m-scenario.test.ts`'s "Ruling 7" describe block pins in place.
          // mmrcr's own slots (design §3.3, `uwb/session.ts#mmrcmInitiators`): m2m pins
          // rcmValidityRounds at 1 (the rule above), so *every* block is the one block that closes
          // its own one-block window — unlike 'twr' below, there is no "blocks 0…R−2 pay nothing"
          // case to spare here. One extra slot per participant, every block, whenever mmrcr is on.
          // Read from `uwb/phy.ts#uwbMmrcmSlots`, the one definition `session.ts` also reads —
          // this file cannot import `session.ts` (import cycle), which is exactly why the count
          // lives in `phy.ts` rather than being computed twice.
          const mmrcrSlots = uwbMmrcmSlots(mode, participants, sc.uwb.mmrcr)
          const m2mRoundSlots = uwbSlotsPerTag(
            sc.uwb.method, participants, sc.uwb.schedule, sc.uwb.contentionSlots, mode,
          ) + mmrcrSlots
          const m2mFits = Math.floor(sc.uwb.blockRstu / (m2mRoundSlots * sc.uwb.slotRstu))
          if (m2mFits < 1) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: `${sc.uwb.blockRstu} RSTU 的 UWB 块装不下一轮多对多测距的 ${m2mRoundSlots} `
                + `个时隙 × ${sc.uwb.slotRstu} RSTU`
                + (mmrcrSlots > 0 ? `（其中 ${mmrcrSlots} 个是 mmrcr 收妥确认的额外时隙）：请加大 blockRstu 或减小 slotRstu，或者把 mmrcr 关掉` : '：请加大 blockRstu 或减小 slotRstu'),
            })
          }
        } else {
          // A hyperbolic fix is solved from differences, and N anchors give N−1 of them: four
          // anchors for the three a 2-D position needs. MMS measures ranges, not differences,
          // so it needs no more anchors than two-way ranging does.
          if ((mode === 'dl-tdoa' || mode === 'ul-tdoa') && anchors < 4) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: `单向测距至少要 4 个 anchor，才凑得出定位要的 3 个时间差（现在有 ${anchors} 个）`,
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
          // …and at this session's own reply-time shape, because an SS round with a deferred
          // reply time is 2A+1 slots rather than A+1 (design §4): left at the default the rule
          // would check the block against a round A slots shorter than the one it will run.
          // …and at this session's own `sp3`, because an SP3 round carries two slots an SP1 one
          // does not — the initiator's own marker always, and its own measurement report when some
          // responder asked for the round trip (design §4.1). Left out, this rule would check the
          // block against a round two slots shorter than the one it will run. `UwbNetwork` computes
          // the identical thing in nanoseconds, from the identical fields.
          const slots = uwbSlotsPerTag(
            sc.uwb.method, anchors, sc.uwb.schedule, sc.uwb.contentionSlots, mode, sc.uwb.mms,
            mmsSlotsPerMs(sc.uwb.slotRstu), sc.uwb.replyTime,
            sc.uwb.sp3 && mode === 'twr' ? { rrtt: sc.uwb.srrr.rrtt } : undefined,
          )
          // Ranging ancillary information's own upper bound (task-2-brief.md's own requirement):
          // the message is segmented across consecutive slots *within* this round (design §4.2),
          // so `ancillaryFrames` cannot ask for more of them than the round actually has — read
          // off `slots` just computed above, never a literal, and the same reading both schedules
          // give it (`slots` already reads `sc.uwb.schedule`, so a contention round's own, smaller
          // or larger, slot count is what bounds it there, not the time-scheduled round's).
          // Scoped to 'twr', the only mode `ancillary` is not already refused in outright (the
          // four mode rules above) — every other mode's own refusal already tells the reader to
          // turn `ancillary` off, so this is the one further issue a 'twr' scenario can still get.
          if (ancillary && mode === 'twr' && ancillaryFrames > slots) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: `一轮测距只有 ${slots} 个时隙，装不下 ${ancillaryFrames} 帧的辅助信息消息——`
                + `它要连续占住本轮的 ${ancillaryFrames} 个时隙：请把 ancillaryFrames 调到 ${slots} 以内`,
            })
          }
          // mmrcr's own slot (design §3.3, `uwb/session.ts#blockCarriesMmrcm`/`mmrcmInitiators`):
          // one, the tag this round belongs to, on the block that closes its validity window. Every
          // block shares one fixed length (`blockRstu`), so the capacity check below has to budget
          // for that window-closing block even though the other `rcmValidityRounds − 1` blocks never
          // spend it — `roundPlan`'s own `blockNs` does not vary by block index. Gated on `'twr'`
          // alone (not `mode !== 'mms'`) because `mmrcr` is already refused outright for dl-tdoa,
          // ul-tdoa and mms above; `uwbMmrcmSlots` answers 0 there regardless.
          //
          // **One per anchor, not one.** The first draft budgeted a single slot — the tag this
          // round belongs to — and that was wrong: a responder is what sends an MMRCM, so a
          // two-way round needs one slot per *anchor*. The IE's one-entry-per-initiator count and
          // the slot's one-per-responder count are different numbers that coincide only in m2m.
          const mmrcrSlots = uwbMmrcmSlots(mode, anchors, sc.uwb.mmrcr)
          // …and the ancillary message's own appended slots, the second such batch (standard
          // §10.35.1, design §4.2): a window-*opening* block spends them the same way a
          // window-closing one spends mmrcr's, and every block shares one fixed `blockRstu`, so the
          // budget has to carry both. With `rcmValidityRounds: 1` — the default — a block both opens
          // and closes its own one-block window and really does spend both at once. Read from
          // `uwb/phy.ts#uwbAncillarySlots`, the one definition `session.ts#blockSlots` lays the slots
          // out from and `UwbNetwork` guards in nanoseconds — this file cannot import `session.ts`
          // (import cycle), which is exactly why the count lives in `phy.ts`.
          const ancillarySlotCount = uwbAncillarySlots(
            mode, sc.uwb.schedule, sc.uwb.contentionSlots, ancillary, ancillaryFrames,
          )
          // The round a block actually has to hold, extras and all — one expression, so that the
          // divisor below and every message that quotes it cannot drift apart. A message that
          // printed `slots + mmrcrSlots` while the division used a third term would be a number
          // defended by nothing.
          const roundSlots = slots + mmrcrSlots + ancillarySlotCount
          const fits = Math.floor(sc.uwb.blockRstu / (roundSlots * sc.uwb.slotRstu))
          // Which extras this block spends, and which switch turns each of them off, named only when
          // it is actually spending them.
          const extras: string[] = []
          if (mmrcrSlots > 0) extras.push(`${mmrcrSlots} 个是 mmrcr 收妥确认的`)
          if (ancillarySlotCount > 0) extras.push(`${ancillarySlotCount} 个是 ancillary 辅助信息消息的`)
          const extraNote = extras.length > 0 ? `（其中 ${extras.join('，')}额外时隙）` : ''
          const extraFix = extras.length > 0
            ? `${extraNote}：请加大 blockRstu 或减小 slotRstu，或者把${mmrcrSlots > 0 ? ' mmrcr' : ''}${ancillarySlotCount > 0 ? ' ancillary' : ''} 关掉`
            : '：请加大 blockRstu 或减小 slotRstu'
          // One round has to fit the block in every mode, DL-TDoA included: a round that outlives
          // its block runs into the next one's slots, and nothing downstream notices — the
          // scheduler starts each block on the clock, whatever the last one was still doing.
          if (fits < 1) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              // `${mmrcrSlots}`, not a literal 1: this message still said "1" after the slot count
              // was corrected to one per *responder* (uwb/phy.ts#uwbMmrcmSlots), so a four-anchor
              // round was told four slots did not fit and that one of them was the confirmation's.
              // `roundSlots` for the same reason, now that a second batch of extras exists.
              message: `${sc.uwb.blockRstu} RSTU 的 UWB 块装不下一轮测距的 ${roundSlots} `
                + `个时隙 × ${sc.uwb.slotRstu} RSTU`
                + extraFix,
            })
          } else if (mode === 'mms' && !sc.uwb.mms.oneToMany && tags * anchors > fits) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: `每对占 ${slots} 个时隙，UWB 块只装得下 ${fits} 对 tag–anchor（现在有 ${tags * anchors} 对）：请加大 blockRstu 或减小 slotRstu`,
            })
          } else if (mode === 'mms' && sc.uwb.mms.oneToMany && tags > fits) {
            // A one-to-many round holds every anchor at once, so a block costs one round per
            // tag — a longer round, but one of them, which is the whole point of the mode.
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: `每轮占 ${slots} 个时隙，UWB 块只装得下 ${fits} 轮一对多测距（现在有 ${tags} 轮）：请加大 blockRstu 或减小 slotRstu`,
            })
          } else if (mode !== 'dl-tdoa' && mode !== 'mms' && tags > fits) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['uwb'],
              message: `每个 tag 占 ${roundSlots} 个时隙，UWB 块只装得下 ${fits} 个 tag（现在有 ${tags} 个）：`
                + (extras.length > 0
                  ? `请加大 blockRstu 或减小 slotRstu，或者把${mmrcrSlots > 0 ? ' mmrcr' : ''}${ancillarySlotCount > 0 ? ' ancillary' : ''} 关掉`
                  : '请加大 blockRstu 或减小 slotRstu'),
            })
          }
          // …and every frame of the round has to fit its slot. A frame that outlives its
          // slot is not an error at run time: the receiver's deadline fires first, the late
          // PPDU is ignored, and the round silently loses every anchor. So it is caught here.
          // An MMS round has no such frame — its two slot rules are above, and they do not
          // depend on the anchor count.
          if (mode !== 'mms') {
            const slotNs = rstuNs(sc.uwb.slotRstu)
            // The session's own method and reply-time shape decide which frame is the longest one
            // (design §5): an SS-TWR round has no Final at all, so sizing its slot against the
            // embedded DS Final refused slots that fit the round perfectly well. `UwbNetwork`
            // computes the identical thing in nanoseconds, from the same two fields.
            // …and `sp3`, because SP3's RCM carries one SRRR IE per responder on top of the Poll
            // (standard §10.32.9.9): the longest frame of the round grows 6 octets an anchor rather
            // than 3, which is a slot-fit question as much as a PSDU-cap one.
            const needNs = uwbSlotFitNs(
              anchors, mode, sc.uwb.schedule, undefined, sc.uwb.method, sc.uwb.replyTime, sc.uwb.sp3,
            )
            if (slotNs < needNs) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['uwb'],
                message: `${sc.uwb.slotRstu} RSTU 的测距时隙只有 ${(slotNs / 1000).toFixed(1)} µs，而 `
                  + `${anchors} 个 anchor 的一轮测距，最长的那一帧加上飞行时间要 ${(needNs / 1000).toFixed(1)} µs：`
                  + '请加大 slotRstu 或减少 anchor 数量',
              })
            }
            // `fixed` is the one reply-time shape whose Response is not slot-aligned (design
            // §6/§6.1): anchor k transmits at `rxPollEnd + F + k·slotNs`, and has to land inside
            // its own slot k+1 — not before it opens, and not so late it is still transmitting
            // when it closes. Writing that out (round start T0, Poll airtime Ap, Response airtime
            // Ar, anchor k's flight ToF_k):
            //
            //   T0 + Ap + ToF_k + F + k·S  ≥  T0 + (k+1)·S      (not before its own slot opens)
            //   T0 + Ap + ToF_k + F + k·S  ≤  T0 + (k+2)·S − Ar − guard   (finishes before it shuts)
            //
            // `k·S` cancels on both sides — k drops out, which is exactly what "one Final serves
            // every responder" buys: the same F has to work for all of them — leaving a two-sided
            // bound on F alone:
            //
            //   S − Ap − ToF_k   ≤   F   ≤   2S − Ap − Ar − guard − ToF_k
            //
            // tightest over the anchors this scenario actually has: the lower bound is tightest at
            // the *nearest* anchor (smallest ToF), the upper bound at the *furthest* (largest ToF).
            // The first version of this rule was one-sided (only the upper bound, and it doubled
            // the flight term instead of keeping the two legs separate) — it refused a frame
            // arriving too late but let one through that arrived so early it lands in a slot that
            // is not its own yet, which is the more dangerous mistake. Design §6.1 has the fix and
            // the worked numbers.
            //
            // Flight time moves both bounds by at most one anchor's own ToF, which this simulator's
            // scenes keep well under a microsecond — real, and kept, but not what decides the
            // bound: the slot length and the two airtimes (Ap, Ar) are what actually bind it.
            if (mode === 'twr' && sc.uwb.replyTime === 'fixed') {
              const tagNodes = uwbNodes.filter((n) => n.uwb?.role === 'tag')
              const anchorNodes = uwbNodes.filter((n) => n.uwb?.role === 'anchor')
              let flightMinNs = Infinity
              let flightMaxNs = 0
              for (const t of tagNodes) {
                for (const a of anchorNodes) {
                  const distM = Math.hypot(t.pos.x - a.pos.x, t.pos.y - a.pos.y, t.pos.z - a.pos.z)
                  const tofNs = distM / C_M_PER_NS
                  flightMinNs = Math.min(flightMinNs, tofNs)
                  flightMaxNs = Math.max(flightMaxNs, tofNs)
                }
              }
              const fixedReplyNs = rstuNs(sc.uwb.fixedReplyRstu)
              const pollNs = uwbPpduNs(uwbPollBytes(anchors, sc.uwb.schedule))
              const respNs = uwbPpduNs(uwbRespBytes(sc.uwb.method, 'fixed'))
              const lowerNeededNs = slotNs - pollNs - flightMinNs
              const upperAllowedNs = 2 * slotNs - pollNs - respNs - UWB_SLOT_GUARD_NS - flightMaxNs
              if (fixedReplyNs > upperAllowedNs) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  path: ['uwb'],
                  message: `固定回复时间下，第一个响应方的固定时延 ${(fixedReplyNs / 1000).toFixed(1)} µs 超过了上限 `
                    + `${(upperAllowedNs / 1000).toFixed(1)} µs（两个时隙 ${(2 * slotNs / 1000).toFixed(1)} µs − Poll `
                    + `空口时间 ${(pollNs / 1000).toFixed(1)} µs − 响应帧空口时间 ${(respNs / 1000).toFixed(1)} µs − 时隙`
                    + `守卫 ${(UWB_SLOT_GUARD_NS / 1000).toFixed(1)} µs − 最远飞行时间 ${(flightMaxNs / 1000).toFixed(1)} `
                    + 'µs）：响应会被自己那个时隙的边界切掉，接收窗口关闭后整轮以超时收场——而 Poll 明明收到了：'
                    + '请减小 fixedReplyRstu，或者加大 slotRstu',
                })
              } else if (fixedReplyNs < lowerNeededNs) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  path: ['uwb'],
                  message: `固定回复时间下，第一个响应方的固定时延 ${(fixedReplyNs / 1000).toFixed(1)} µs 低于下限 `
                    + `${(lowerNeededNs / 1000).toFixed(1)} µs（一个时隙 ${(slotNs / 1000).toFixed(1)} µs − Poll `
                    + `空口时间 ${(pollNs / 1000).toFixed(1)} µs − 最近飞行时间 ${(flightMinNs / 1000).toFixed(1)} µs）：`
                    + '响应会落进还没轮到它的那个时隙——自己的时隙其实还没开始：请加大 fixedReplyRstu',
                })
              }
            }
          }
          // Nothing in an MMS round grows with the anchor count — every pair gets a round of
          // its own — so the PSDU-length cap does not apply to it; the block rule bounds it.
          // `uwbMaxAnchors` refuses to be asked for an MMS round at all (it has no PSDU to size),
          // so the guard has to come first, not just gate the issue it might raise.
          //
          // The cap depends on which frame actually grows: DS-TWR embedded is bound by its Final,
          // every other shape (SS-TWR's three, DS-TWR deferred) by the Poll instead, since none of
          // them has a Final that ever catches it (design §5). `replyTime` is a real scenario
          // field now, so the session's own shape decides the cap — DS-TWR embedded still gets the
          // Final-bound 9, but a DS-TWR deferred or any SS-TWR session (whose Poll is what grows)
          // gets the higher, Poll-bound cap instead.
          if (mode !== 'mms') {
            const anchorCap = uwbMaxAnchors(mode, sc.uwb.method, sc.uwb.replyTime, sc.uwb.schedule)
            if (anchors > anchorCap) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['uwb'],
                message: `一轮测距最多容纳 ${anchorCap} 个 anchor（现在有 ${anchors} 个）：`
                  + '这一轮里最长的那一帧随 anchor 数增长，超过就会撑破 127 个八位组的 PSDU 上限（标准 §16.2.7）',
              })
            }
            // SP3's own SRRR content (§10.32.9.9): sp3 gives every responder one SRRR IE in the
            // RCM — 3 octets each, on top of the Poll `uwbMaxAnchors` above already sized. Neither
            // `uwbMaxAnchors` nor the generic Poll it is bound by has ever heard of SRRR, so a
            // scenario this check alone accepts can still carry an RCM that outgrows the 127-octet
            // PSDU cap at a *lower* anchor count than `anchorCap` names — the request is not free,
            // the mirror image of §10.36's MMRCR bit (design §3.3).
            if (sp3 && mode === 'twr' && sc.uwb.schedule === 'time') {
              const rcmBytes = uwbPollBytes(anchors, sc.uwb.schedule) + srrrIeBytes(anchors)
              if (rcmBytes > UWB_MAX_PSDU_BYTES) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  path: ['uwb'],
                  message: `SP3的RCM要给 ${anchors} 个应答方各挂一个SRRR IE，一共 ${rcmBytes} 个`
                    + `八位组，超过了 ${UWB_MAX_PSDU_BYTES} 个八位组的PSDU上限（标准§16.2.7）：`
                    + '请减少 anchor 数量，或者把 sp3 关掉',
                })
              }
            }
          }
        }
      }
    }
    const ids = new Set<string>()
    for (const n of sc.nodes) {
      if (ids.has(n.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `节点 id "${n.id}" 重复了：每个节点的 id 要各不相同` })
      }
      ids.add(n.id)
    }
    const serverIds = new Set<string>()
    for (const s of sc.servers) {
      if (serverIds.has(s.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `服务器 id "${s.id}" 重复了：每个服务器的 id 要各不相同` })
      serverIds.add(s.id)
    }
    for (const n of sc.nodes) {
      if (n.p2pTarget !== undefined) {
        if (n.p2pTarget === n.id) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `节点 "${n.id}" 不能把点对点视频推给自己` })
        else if (!sc.nodes.some((m) => m.id === n.p2pTarget && m.kind === 'sta')) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `节点 "${n.id}" 的点对点视频指向了并不存在的站点 "${n.p2pTarget}"` })
      }
      for (const [profile, sid] of Object.entries(n.servers ?? {})) {
        if (!serverIds.has(sid)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `节点 "${n.id}" 把 ${profile} 业务绑到了并不存在的服务器 "${sid}"` })
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
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes', i], message: '反向散射标签需要一个开着 RFID 点存的 AP：它自己没有发射机，没有读写器跑点存轮次就永远发不出声音' })
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
