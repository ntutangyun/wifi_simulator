/** Minimal i18n: one typed string table. The interface is what stops a label going missing. */
import type { FeatureFlag, LinkId } from '../model/caps'
import type { FrameDesc, FrameKind } from '../model/frames'
import type { Generation } from '../model/types'
import type { AmpTagMode, NbLbt, NbReportMode, ProfileId, UwbMode } from '../model/scenario'
import type { FadingCfg } from '../engine/fading'
import type { RxFailReason } from '../model/records'
import type { AddrRole, FcBitKey, FieldKey, PpduSegmentKey } from '../model/frameFields'
import type { NB_MSG_ID } from '../uwb/nb'
import type { MmsPhy } from '../uwb/mms'
import type { UwbFixMethod } from '../uwb/records'
import type { UwbReplyTime } from '../uwb/phy'

/** How a multi-user PPDU is split — absent for frames that are always OFDMA-flavored (triggers, UL TB, M-BA). */
export type MuKind = FrameDesc['muKind']

/** The small-scale fading distributions, named here so a new one cannot be added without a label. */
export type SmallScale = FadingCfg['smallScale']

export interface LegendItem {
  color: string
  label: string
  hint: string
}

export interface Strings {
  header: { subtitle: string; edit: string; simulate: string; course: string }
  /** The red banner over the scene when the worker refuses a scenario. */
  simError: (detail: string) => string
  /** The floating text above a device in the 3D view. */
  sceneLabel: { slot: (n: number) => string; waitAck: string; waitCts: string }
  panel: { inspector: string; log: string; guide: string; resizeHint: string }
  /** The 3-D view's on-screen camera buttons. A finger can orbit and pinch the
   *  view directly; these are for precise moves and for getting back. */
  view: {
    panUp: string; panDown: string; panLeft: string; panRight: string
    zoomIn: string; zoomOut: string; home: string
  }
  /** Controls that exist only when the viewport is too small for the desktop shell. */
  compact: {
    openSide: string
    closeSide: string
    showCourse: string
    showView: string
    collapseTimeline: string
    expandTimeline: string
  }
  guideWindow: {
    title: string; terms: string; overview: string; search: string
    empty: string; close: string; dragHint: string
  }
  course: {
    title: string
    progressOf: (done: number, total: number) => string
    module: string
    minutes: (n: number) => string
    selectPrompt: string
    /** Section labels of the zero-to-hero lesson shape. */
    outcomes: string
    needs: string
    terms: string
    numbers: string
    deeper: string
    sources: string
    /** Buttons inside a `watch` call-out. */
    watchLoad: string
    watchJump: string
    load: string
    reload: string
    variants: string
    jumps: string
    notFound: string
    observe: string
    tryThis: string
    quiz: string
    check: string
    correct: string
    incorrect: string
    markDone: string
    done: string
    next: string
    prev: string
    back: string
    openInEditor: string
    loadHint: string
    /** The section naming where a lesson's model is not the radio. */
    limits: string
    limitKind: Record<'threshold' | 'unmodelled' | 'model-value' | 'out-of-scope', string>
    limitUntil: (lessonTitle: string) => string
    /** The documents a section's lessons are checked against, and how firm they are. */
    basis: (docs: string) => string
    /** Appended to a draft document's name wherever it is printed. */
    draftMark: string
    /** Heading over the list of contributions a draft lesson models. */
    contributions: string
  }
  transport: {
    play: string; pause: string; speed: string; simulating: string
    prevExch: string; nextExch: string; prevEv: string; nextEv: string
    minusSlot: string; plusSlot: string; minusUs: string; plusUs: string
    speeds: { us: number; label: string }[]
  }
  strip: { windowHint: string; legendCollision: string; zoomIn: string; zoomOut: string }
  legend: LegendItem[]
  editor: {
    tools: { select: string; room: string; door: string; window: string; ap: string; sta: string; tag: string; anchor: string; uwbTag: string; scatterer: string; fit: string; undo: string; redo: string }
    undoHint: string; redoHint: string
    /** Why the AP tool, the Wi-Fi device tools and 🎲 Spawn are disabled. */
    apExists: string; needApFirst: string
    scenario: string; save: string; load: string; export_: string; import_: string
    spawn: string; rts: string; rtsHint: string; seed: string; seedHint: string
    sixGhz: string; sixGhzHint: string; sixGhzChannel: (n: number) => string; sixGhzOverlap: (pct: number) => string
    sixGhzNbOverlap: string
    /** The fading section of the object list: the switch, the four figures, and why a field is grey. */
    fading: string; fadingOn: string; fadingOnHint: string; fadingOffHint: string
    fadingSigma: string; fadingSigmaHint: string; fadingSigmaBad: string
    fadingCoherence: string; fadingCoherenceHint: string; fadingCoherenceBad: string
    fadingSmallScale: string; fadingSmallScaleHint: string
    fadingSmallScales: Record<SmallScale, string>
    fadingRicianK: string; fadingRicianKHint: string; fadingRicianKBad: string; fadingRicianOnly: string
    /** The frequency-selectivity switch, directly under the fading section: one checkbox, no
     * figures of its own. Why it is grey is not here — those three sentences are the schema's
     * (`selectivityRefusals`, src/model/scenario.ts), read straight out of it so the grey box and
     * the refusal cannot word the same rule two ways. */
    selectivity: string; selectivityOn: string; selectivityOnHint: string
    /** The reflecting objects (scatterers) section: the list, and the one figure each object has.
     * `scattererLoss` has to say which way is bigger — it is a *loss*, so the more negative the
     * number the stronger the reflector, and 0 dB is one square metre rather than "neutral". */
    scatterers: string; scatterersHint: string; noScatterers: string
    scatterer: string; scattererLoss: string; scattererLossHint: string; scattererLossBad: string
    scattererHeight: string; scattererHeightHint: string; scattererHeightBad: string
    scattererNeedsUwb: string; deleteScatterer: string
    objects: string; properties: string; guide: string
    nodesHeader: string; rooms: string; walls: string; noRooms: string
    node: string; name: string; wifi: string; link: string; linkHint: string; bands: Record<LinkId, string>
    preset: string; presetPick: string; presetHint: string; brands: Record<'huawei' | 'xiaomi' | 'honor' | 'apple', string>; mloCapableNote: string
    servers: string; addServer: string; serverName: string; serverKind: string; serverRtt: string; serverRttHint: string; deleteServer: string
    streamServer: string; households: string; householdsPick: string
    gameAccel: string; gameAccelHint: string
    p2pTarget: string; p2pTargetHint: string;
    tamper: string; tamperHint: string; tamperKinds: Record<'none' | 'custom' | 'escalate' | 'aifs' | 'cw' | 'noDouble' | 'txopHog' | 'navInflate' | 'greedy', string>
    serverJitter: string; serverJitterHint: string; serverProcess: string; serverProcessHint: string
    traffic: string; txPower: string; height: string
    txopProt: string; txopProtHint: string
    txopProtNames: Record<'single' | 'boundary' | 'multiple', string>
    deleteNode: string; deleteRoom: string; apNoDelete: string; delete_: string
    wall: string; material: string; materialHint: string; removeOpenings: string
    room: string; openings: string
    emptyHint: string
    saved: string; loaded: string; imported: string; nothingSaved: string
    scaleBarHint: string
    amp: string; ampEnable: string; ampInterval: string; ampIntervalHint: string
    ampSlots: string; ampSlotsHint: string; ampAcwe: string; ampAcweHint: string
    ampDl: string; ampDlHint: string; ampUl: string; ampUlHint: string
    ampProt: Record<'ctsSelf' | 'none', string>; ampProtLabel: string
    ampRead: Record<'inline' | 'twoPhase', string>; ampReadLabel: string
    ampNeedsEht: string
    ampSens: string; ampSensHint: string
    /** A tag's answer mode (mode is a property; the ⚡ tool always places an Active Tx tag). */
    ampMode: string; ampModeHint: string; ampModes: Record<AmpTagMode, string>
    /** Backscatter tags only: the 96-bit EPC as 24 hex characters. */
    ampEpc: string; ampEpcHint: string; ampEpcBad: string
    /** Shown under the Mode select when this tag is `ampTagIssue`'s "will not pass" case. */
    ampBsNeedsReader: string
    /** The AP's mono-static reader: an EPC Gen2-style inventory tunnelled in AMP RFID frames. */
    ampBs: string; ampBsEnable: string; ampBsEnableHint: string
    ampBsQ: string; ampBsQHint: string
    ampBsUl: string; ampBsUlHint: string
    ampBsWup: string; ampBsWupHint: string
    ampBsCharge: string; ampBsChargeHint: string
    ampBsBs: string; ampBsBsHint: string
    ampBsTxop: string; ampBsTxopHint: string
    ampBsRead: string; ampBsReadHint: string
    ampBsWrite: string; ampBsWriteHint: string
    /** UWB ranging: the per-node fields (uwb/ui/UwbNodeFields.tsx). */
    uwbNode: string; uwbRole: string; uwbRoles: Record<'anchor' | 'tag', string>
    /** `mode: 'm2m'` only: the role line's own note that in this mode the role is drawing only —
     * every node is a ranging participant regardless of it (design §5). Without this a reader
     * who picked 'tag' or 'anchor' before switching to many-to-many would think the choice had
     * gone wrong, rather than simply stopped mattering. */
    uwbRoleM2mNote: string
    uwbPpm: string; uwbPpmHint: string; uwbPpmDrawn: string; uwbPpmRange: string
    /** Anchor only: which way its antenna array faces (angle of arrival). */
    uwbYaw: string; uwbYawHint: string
    /** UWB ranging: the session section (uwb/ui/UwbSessionFields.tsx). */
    uwbSession: string; uwbCounts: (anchors: number, tags: number) => string
    uwbNoNodes: string; uwbRemoveSession: string; uwbRemoveSessionHint: string; uwbSessionInUse: string
    uwbMethod: string; uwbMethodHint: string; uwbMethods: Record<'ss' | 'ds', string>
    /**
     * Which two-way ranging procedure carries the reply time (standard §10.29.6.3–.7): a select
     * beside the method, and a number field (RSTU) that only means anything under `'fixed'`.
     * `uwbReplyTimeMmsOnly` is the one shared reason both are dead for, same as `uwbMethod`'s own
     * `uwbMmsSsOnly` — MMS has its own, differently-named fixed reply time (`uwbFixedReply` above,
     * a different field in a different clause of a different document, design §3).
     */
    uwbReplyTime: string; uwbReplyTimeHint: string; uwbReplyTimeMmsOnly: string
    /** `mode: 'm2m'` only: why the reply-time select is locked to 'embedded' (design §5) — a
     * different rule from MMS's `uwbReplyTimeMmsOnly`, so it gets its own key rather than
     * borrowing that one's wording about a draft feature many-to-many has nothing to do with. */
    uwbReplyTimeM2mOnly: string
    uwbReplyTimes: Record<UwbReplyTime, string>
    uwbReplyTimeRstu: string; uwbReplyTimeRstuHint: string; uwbReplyTimeRstuOnly: string
    /** One-way ranging (standard §10.32.3): the mode and the two knobs only one mode each uses. */
    uwbMode: string; uwbModeHint: string; uwbModes: Record<UwbMode, string>
    uwbClockCorrection: string; uwbClockCorrectionHint: string; uwbDlOnly: string
    uwbSyncError: string; uwbSyncErrorHint: string; uwbUlOnly: string
    uwbTwrOnly: string
    uwbAoa: string; uwbAoaHint: string; uwbAoaTwrOnly: string
    /**
     * Why the two fields are greyed out in MMS, which the one-way modes' own reasons do not
     * cover: an MMS tag transmits and an MMS range is two-way, so `uwbAoaTwrOnly` and
     * `uwbTwrOnly` would both be false there. Picked by `uwbAoaHintKey` / `uwbScheduleHintKey`.
     */
    uwbAoaMms: string; uwbScheduleMms: string
    /** Many-to-many's own reasons for the same two fields (design §5) — neither "the tag never
     * transmits" (there is no tag) nor "the round is two-way but the signal has no frame" (MMS)
     * describes it: there is simply no single anchor and no single tag's frame to point at or
     * measure a bearing on, and every slot is already spoken for before the round starts. */
    uwbAoaM2m: string; uwbScheduleM2m: string
    uwbBlock: string; uwbBlockHint: string; uwbSlot: string; uwbSlotHint: string
    uwbChannel: string; uwbChannelHint: string
    uwbTsNoise: string; uwbTsNoiseHint: string; uwbCfoNoise: string; uwbCfoNoiseHint: string
    uwbNlos: string; uwbNlosHint: string
    /** The contention schedule (standard §10.32.2 mode 0), SS-TWR only. */
    uwbSchedule: string; uwbScheduleHint: string; uwbSchedules: Record<'time' | 'contention', string>
    uwbSsOnly: string
    /** Why the window and the budget are greyed out in an SS-TWR session that is time-scheduled. */
    uwbContentionOnly: string
    uwbContentionSlots: string; uwbContentionSlotsHint: string
    uwbMaxAttempts: string; uwbMaxAttemptsHint: string
    /**
     * How many rounds one control message governs (standard §10.32.9.1, ARC IE's RCM Validity
     * Rounds field) — two-way ranging only, which is why `uwbRcmValidityTwrOnly` exists beside
     * `uwbRcmValidityHint`, the same split `uwbAoaHintKey` uses.
     */
    uwbRcmValidityRounds: string; uwbRcmValidityHint: string; uwbRcmValidityTwrOnly: string
    /**
     * The ranging message non-receipt frame (standard §10.34): a responder's own reason not to
     * stay silent. Three refusals, each its own hint key (`uwbRmnrHintKey`): outside two-way
     * ranging there is no control message to hold at all; at `rcmValidityRounds: 1` the control
     * message and the round's own initiation message are the same frame, so the state this
     * checkbox turns on cannot exist yet (`uwbRmnrNeedsValidity` — the one hint in this panel
     * that teaches a causal reason rather than "wrong mode"); and a contention responder's slot is
     * drawn fresh every round, never read off a still-valid one.
     */
    uwbRmnr: string; uwbRmnrHint: string; uwbRmnrTwrOnly: string; uwbRmnrNeedsValidity: string; uwbRmnrContention: string
    /**
     * The receipt-confirmation request bit (standard §10.36's ARC IE, MMRCR, bit 15 of the same
     * Content Control word `uwbRcmValidityRounds` already occupies — design §3.1 of
     * 2026-10-02-receipt-confirmation-design.md): legal in two-way ranging and many-to-many, the
     * two modes where some device never otherwise learns whether it was heard. Five hint keys,
     * each `uwbMmrcrHintKey`'s own reason: three outright refusals, one per non-`'twr'`/non-`'m2m'`
     * mode (each has a different reason the ARC IE never applies), plus the two `rmnr` already
     * carries — needing a window wider than one round, and a time-scheduled slot.
     */
    uwbMmrcr: string; uwbMmrcrHint: string
    uwbMmrcrDlTdoa: string; uwbMmrcrUlTdoa: string; uwbMmrcrMms: string
    uwbMmrcrNeedsValidity: string; uwbMmrcrContention: string
    /**
     * SP3 grouped ranging (standard §10.32.8, design `2026-10-02-sp3-design.md`): two-way ranging
     * only, and only beside the time schedule and the deferred reply-time shape. Seven hint keys,
     * `uwbSp3HintKey`'s own reasons — four outright mode refusals, the contention refusal `rmnr`
     * and `mmrcr` already carry their own versions of, and the reply-time refusal that is this
     * field's own (an SP3 marker has no payload to carry the measured time in, so only the
     * deferred shape's report frame can).
     */
    uwbSp3: string; uwbSp3Hint: string
    uwbSp3DlTdoa: string; uwbSp3UlTdoa: string; uwbSp3Mms: string; uwbSp3M2m: string
    uwbSp3Contention: string; uwbSp3NeedsDeferred: string
    /**
     * The SRRR IE's own RAOA/RRTT request bits (standard §10.32.9.9), live only once `sp3` is on.
     * RAOA carries a second refusal (`uwbSrrrRaoaNeedsAoa`): it asks the report phase for a
     * bearing no anchor without `aoa` on ever computes.
     */
    uwbSrrrRaoa: string; uwbSrrrRrtt: string
    uwbSrrrRaoaHint: string; uwbSrrrRrttHint: string
    uwbSrrrNeedsSp3: string; uwbSrrrNeedsSs: string; uwbSrrrRaoaNeedsAoa: string
    /**
     * Ranging ancillary information exchange, Request = 0 half (standard §10.35.1; RAICT IE
     * §10.35.2.1; design doc 2026-10-02-ancillary-design.md): two-way ranging only, and not beside
     * `sp3` (task 2's own judgment call — two independently-sized appended batches with no defined
     * order between them). `uwbAncillaryFrames` is `model`: a real device would size a message
     * from an upper-layer payload this engine has no primitive for, so the scenario states the
     * frame count directly instead, the same standing `rcmValidityRounds` already has.
     */
    uwbAncillary: string; uwbAncillaryHint: string; uwbAncillaryTwrOnly: string; uwbAncillarySp3: string
    uwbAncillaryFrames: string; uwbAncillaryFramesHint: string; uwbAncillaryFramesOff: string
    /** "slots per round N · rounds per block M" under the session fields. */
    uwbPlan: (slots: number, rounds: number) => string
    /** `mode: 'm2m'` only: how many participants the round actually holds — every UWB node, not
     * just the ones drawn as anchors, which is what `uwbCounts` above the panel would suggest on
     * its own (design §5). */
    uwbM2mParticipants: (participants: number) => string
    /**
     * `mode: 'mms'` only: the P802.15.4ab fragment train and the narrowband radio its control
     * plane runs on. The "draft" qualifier lives on the mode name and on `uwbMmsHint`; every
     * other hint carries the tag of whatever number it quotes.
     */
    uwbMms: string; uwbMmsHint: string
    uwbMmsSet: string; uwbMmsSetHint: string; uwbMmsCustom: string
    uwbRsfs: string; uwbRsfsHint: string
    uwbRifs: string; uwbRifsHint: string
    uwbNMsr: string; uwbNMsrHint: string
    uwbGap: string; uwbGapHint: string
    uwbStsLen: string; uwbStsLenHint: string
    uwbGapMs: string; uwbGapMsHint: string
    uwbNbChannels: string; uwbNbChannelsHint: string; uwbNbChannelsBad: string
    uwbNbLbt: string; uwbNbLbtHint: string; uwbNbLbts: Record<NbLbt, string>
    uwbReport: string; uwbReportHint: string; uwbReports: Record<NbReportMode, string>
    uwbOneToMany: string; uwbOneToManyHint: string
    /**
     * The six P802.15.4ab draft features (`MmsDraftPhy`). Each is legal only beside certain values
     * of the others, so each carries its own description *and* the schema's reason for being
     * greyed out — one key per reason, picked by the `mms…HintKey` functions of
     * `uwb/ui/UwbSessionFields.tsx`, which derive the greying from the very same answer.
     */
    uwbMmsControl: string; uwbMmsControlHint: string
    uwbMmsControls: Record<MmsPhy['control'], string>
    uwbUwbdControl: string; uwbUwbdControlHint: string; uwbUwbdNbaOnly: string
    uwbUwbdControls: Record<MmsPhy['uwbdControl'], string>
    uwbRsfSfd: string; uwbRsfSfdHint: string; uwbRsfSfdUwbdOnly: string; uwbRsfSfdNMsr: string
    uwbNonInterleaved: string; uwbNonInterleavedHint: string
    uwbFixedReply: string; uwbFixedReplyHint: string; uwbFixedReplyBad: string
    uwbFixedReplyInterleaved: string; uwbFixedReplyOneToMany: string; uwbFixedReplyReversed: string
    uwbReversed: string; uwbReversedHint: string
    uwbReversedInterleaved: string; uwbReversedFixedReply: string
    /**
     * Spectrum sensing based deferral (task 5, standard §10.45 — a P802.15.4ab **draft** clause):
     * the on/off switch and its five fields (`UwbSsbdCfg`), each described on its own since the
     * checkbox is the only one of them that is ever greyed out — the four numbers and the end
     * action are only live beside it.
     */
    uwbSsbd: string; uwbSsbdHint: string; uwbSsbdUwbdOnly: string; uwbSsbdNeedsLbt: string
    uwbSsbdMinBf: string; uwbSsbdMinBfHint: string
    uwbSsbdMaxBf: string; uwbSsbdMaxBfHint: string
    uwbSsbdMaxBackoffs: string; uwbSsbdMaxBackoffsHint: string
    uwbSsbdUnit: string; uwbSsbdUnitHint: string
    uwbSsbdTxOnEnd: string; uwbSsbdTxOnEndHint: string
    /** Why the allow list and the LBT select are dead: Config 1 has no narrowband radio at all. */
    uwbNbNoRadio: string
    /** Why the SS/DS select is greyed out in MMS mode. */
    uwbMmsSsOnly: string
    /** The read-only line under the MMS fields: fragment length, its power and the round. */
    uwbMmsDerived: (
      rsfUs: string, longestUs: string, fragDbm: string, slots: number, roundMs: string,
    ) => string
  }
  inspector: {
    waiting: string; bssTotals: string; throughput: string; delivered: string
    collisions: string; retries: string; node: string; ok: string; rty: string; airtime: string; lat: string; latHint: string
    width: string; nss: string
    linkName: Record<LinkId, string>
    acHeader: { ac: string; bo: string; cw: string; queue: string }
    acHint: string; boHint: string; cwHint: string; queueHint: string
    backoffCounter: string; cw: string; ssrcSlrc: string; ssrcHint: string
    nav: string; navHint: string; navIdle: string; left: string
    ifs: string; ifsHint: string; cca: string; ccaHint: string; busy: string; idle: string
    txop: string; txopHint: string
    transmitting: string; receiving: string; queue: string; old: string; more: string; inFlight: string
    /** "DATA 来自 sta-2" — the frame being received, and who from. */
    receivingFrom: (kind: string, from: string) => string
    stats: string; framesDelivered: string; retriesDrops: string; collisionsL: string
    airtimeShare: string; rxThroughput: string
    txLatency: string; txLatencyHint: string; rxLatency: string; rxLatencyHint: string
    appRtt: string; appRttHint: string; relayLatency: string; relayLatencyHint: string; servers: string; serverCols: { server: string; kind: string; rtt: string; up: string; down: string }
    ampTag: string; aboc: string; abocHint: string; slot: string; slotHint: string
    ampCounts: string; ampCountsHint: string; ampRound: string; ampRoundHint: string; satOut: string
    ampPhase: Record<'random' | 'scheduled', string>
    /** Backscatter tag rows: its Gen2 slot counter, its session flag, its reflections and the
     * margin the last one had over the reader's own leakage floor. */
    bsCounter: string; bsCounterHint: string
    bsInventoried: string; bsInventoriedHint: string; bsYes: string; bsNo: string
    bsReplies: string; bsRepliesHint: string
    bsSnr: string; bsSnrHint: string
    /** The reader's row: the inventory session it is running and how its slots are going. */
    inventory: string; inventoryHint: string; session: string
    /** The same three columns after the TXOP: the round is cleared the instant it reports them. */
    inventoryLast: string; inventoryLastHint: string
  }
  /** UWB ranging inspector (uwb/ui/UwbInspector.tsx). */
  uwb: {
    anchor: string; tag: string; role: string
    blockRound: string; slot: string; timeouts: string
    /**
     * Slots a responder filled with an RMNR frame instead of silence (standard §10.34), counted
     * at the initiator — see `UwbNodeView.rmnr`. Shown beside `timeouts` unconditionally, the same
     * way `interfered` is: turning `rmnr` on makes `timeouts` fall with nothing else in the live
     * view to say where those rounds went, so the pair has to be visible before a reader ever
     * needs to ask.
     */
    rmnr: string; rmnrHint: string
    /**
     * Receipt confirmations this node received (standard §10.36's MMRCM), counted at the initiator
     * — see `UwbNodeView.mmrcm`. Unconditional for the same reason `rmnr` is, and for a sharper
     * one: this row is the only thing in the live view that ever answers "who heard me", so a
     * reader who cannot see the row cannot tell "nobody confirmed" from "the feature is off".
     */
    mmrcm: string; mmrcmHint: string
    /**
     * The two phases of an SP3 grouped-ranging round made countable (standard §10.32.8.1), both
     * counted at the initiator — see `UwbNodeView.sp3` / `UwbNodeView.sp3Reports`. Unconditional
     * for the reason `rmnr` is and one of its own: with `sp3` on, every other row in this panel
     * reads exactly as it does in an SP1 round — the same slots, the same ranges — so without
     * these two nothing in the live view says the ranging phase carried no identity at all.
     * The pair belongs together: what the ranging phase stops spending is spent in the report
     * phase, and one number alone shows only half of that trade.
     */
    sp3: string; sp3Hint: string
    sp3Reports: string; sp3ReportsHint: string
    /**
     * The ranging ancillary information exchange made countable (standard §10.35), both counted at
     * the **receiver** — which in this clause is the ranging *initiator*, because §10.35.1 inverts
     * the two role names. See `UwbNodeView.ancillary` / `UwbNodeView.ancillaryMissing`.
     *
     * Unconditional, and the pair is not optional: a fragment's wait is silent (one member of a
     * message is evaluated by the message, like a P802.15.4ab fragment), so `timeouts` above cannot
     * move for a lost fragment. Without the second row a message that lost half of itself would
     * read exactly like one that arrived whole.
     */
    ancillary: string; ancillaryHint: string
    ancillaryMissing: string; ancillaryMissingHint: string
    /** Receptions this node lost to in-band Wi-Fi power. */
    interfered: string
    /** Contention rounds: the anchor's latest draw, and the tag's lost response slots. */
    contend: string; contendHint: string
    contendDraw: (slot: number, attempt: number) => string
    contendSitOut: string
    contendCollisions: string; contendCollisionsHint: string
    ranges: string; peer: string; measured: string; trueDist: string; error: string; fom: string; rounds: string
    /** One-way ranging: the table of time differences against the round's reference anchor. */
    tdoa: string; tdoaHint: string
    /** Caption of the time-difference table: which anchor every row is measured against. */
    tdoaAgainst: (ref: string) => string
    /** Angle of arrival: the anchor's table of bearings, one row per tag. */
    aoa: string; aoaHint: string; aoaSigma: string; aoaRowHint: string
    /** The Figure of Merit byte as a phrase: "97 % within 0.5 ns" (standard §10.29.1.7). */
    fomWithin: (pct: number, intervalNs: number) => string
    noFom: string
    position: string; estimate: string; gdop: string; ellipse: string; noPosition: string
    /** The same line for a one-way lane, which never measures a range at all. */
    noPositionTdoa: string
    /** What solved the fix, as a row label and as the four methods' names. */
    methodLabel: string; method: Record<UwbFixMethod, string>
    /** Shown on the ellipse of a one-way fix, whose σ is a documented approximation. */
    ellipseHintTdoa: string
    /** Shown on the ellipse of a single-anchor angle fix, whose two axes are two different
     * measurements rather than two directions of one. */
    ellipseHintAoa: string
    /** P802.15.4ab: the fragment-train table, one row per peer. */
    trains: string; trainsHint: string
    /** Column headers of that table: what the train held, how many fragments arrived, how far
     * the combined train cleared sensitivity, whether it did, and the ratio it measured. */
    trainKindCol: string; trainHeard: string; trainMargin: string; trainDetected: string; trainRatio: string
    trainYes: string; trainNo: string
    /** "8 × RSF" / "2 × RIF": what the train was made of. */
    trainKind: (kind: 'rsf' | 'rif', fragments: number) => string
    /** A train nothing was heard of has no received power and no margin at all. */
    trainNothing: string
    /** P802.15.4ab one-to-many round: the anchors this node's fragment train was shared with. */
    responders: string; respondersHint: string; respondersOf: (ids: string[]) => string
    /** The narrowband control radio: the channel this block hopped to, and what listen before
     * talk has cost this node. */
    nbChannel: string; nbChannelHint: string
    nbChannelAt: (channel: number, centerMhz: number) => string
    lbtBusy: string; lbtBusyHint: string
    lbtBusyCount: (checks: number, blocks: number) => string
    /** Standard §10.45 (a P802.15.4ab draft clause): the per-slot channel access, which replaces
     * the per-block rule above when the session turns it on. Never both in one session. */
    ssbd: string; ssbdHint: string
    ssbdCount: (checks: number, waitNs: number, failed: number) => string
    /** Shown on a range measured with an integrity train beside it. */
    integrityOk: string; integrityBad: string
  }
  log: { empty: string }
  profiles: Record<ProfileId, string>
  /** One-word app names for the 3D label under a station's name. */
  appShort: Record<ProfileId, string>
  serverKinds: Record<'video' | 'web' | 'call' | 'game', string>
  generations: Record<Generation, string>
  features: Record<FeatureFlag, string>
  frameDetail: {
    title: string
    close: string
    /** Shown when the user clicked the receiver's lane rather than the sender's. */
    clickedRx: (lane: string) => string
    kindName: Record<FrameKind, string>
    /** Beginner-level "what is this frame and why does it exist". */
    whatIs: Record<FrameKind, string>
    /** Beginner-level "what happens right after this frame". */
    next: Record<FrameKind, string>
    nextTitle: string
    from: string; to: string; everyone: string
    when: string; whenHint: string
    airtime: string; airtimeHint: string
    size: string; sizeHint: string
    rate: string; rateHintMcs: string; rateHintLegacy: string
    ac: string; acNames: string[]; acHint: string
    duration: string; durationHint: string
    seq: string; seqHint: string
    retry: string; retryHint: string
    ampduTitle: (n: number) => string
    ampduHint: string
    muTitle: (n: number) => string
    muHint: (kind: MuKind) => string
    muTo: string; muSize: string; muRate: string
    ruNote: (kind: MuKind) => string
    fields: {
      title: string; hint: string
      mpdu: (typeName: 'Control' | 'Data' | 'Ranging', subtype: string, bytes: number) => string
      forUser: (dst: string) => string
      subframes: (n: number) => string
      firstShown: string
      subframeRow: (i: number, delim: number, mpdu: number, pad: number) => string
      name: Record<FieldKey, string>
      bit: Record<FcBitKey, string>
      role: Record<AddrRole, string>
      broadcast: string
      ppdu: string; ppduHint: string
      segment: Record<PpduSegmentKey, string>
      symbols: (n: number, symUs: number) => string
      /** UWB: where inside the PPDU the ranging timestamp is taken. */
      rmarker: (us: string) => string
      /**
       * The contents of a decoded UWB field, as `uwb/frameFields.ts` spells them out. The
       * standard's own tokens — `SP1`, `DS-TWR`, `RCTU`, `N_MSR`, `treply1`, `CRC-16` — stay as
       * the standard writes them; everything around them is prose and belongs here.
       */
      /**
       * The rows the event log expands under a Wi-Fi frame. They name the same header the frame
       * inspector names, so they are labels and not prose: only IEEE and EPC Gen2 tokens
       * (`TXTIME`, `ACWE`, `ABOC`, `RN16`, `EPC`, `Q`, the excitation names) stay English.
       */
      row: {
        type: string
        ra: string; ta: string
        psduLength: string; octets: (n: number) => string
        dataRate: string
        txtime: string
        durationId: string; navRest: (us: string) => string
        seqNo: string; retryFlag: string
        ampRate: string; ampRateValue: (kbps: number) => string
        slots: string; slotDuration: string; acwe: string
        phase: string; phaseName: Record<'random' | 'scheduled', string>
        acksSlot: string; slot: string; aboc: string
        gen2Cmd: string; sessionSlot: string
        q: string; qValue: (q: number, slots: number) => string
        rn16: string; wup: string; bst: string
        excitationPower: string; excitationValue: (charge: number, backscatter: number) => string
        gen2Reply: string; epc: string; incident: string
      }
      uwbValue: {
        fc: (sp: number) => string
        seq: (round: number, slot: number) => string
        arc: (sp: number, method: string, block: number, round: number, responders?: number) => string
        rdm: (n: number, list: string) => string
        rdmSlot: (id: string, slot: number) => string
        rrmc: (slot: number, method: string) => string
        rcps: (first: number, last: number) => string
        rcma: (n: number) => string
        replyTime: (time: string) => string
        finalReply: (id: string, time: string) => string
        rmiFinal: (n: number, list: string) => string
        rmiFinalEntry: (id: string, time: string) => string
        rmiReport: (treply1: string, tround2: string) => string
        txTime: (time: string) => string
        rxTimes: (n: number, list: string) => string
        coffs: (ppm: string) => string
        blink: (block: number, round: number) => string
        /** §10.34's RMNR IE: no Content field at all, so there is nothing to parametrise the row
         * with — the row names what the IE's mere presence says. */
        rmnr: () => string
        /** §10.36's RMMRC IE: how many initiators this frame answers, and the entry list. */
        rmmrc: (n: number, list: string) => string
        /** §10.32.9.9's SRRR IE: one responder's own request, and the two bits it is made of. One
         * IE per responder, so the row names which responder's request it is. */
        srrr: (id: string, raoa: boolean, rrtt: boolean) => string
        /** The bearing an SP3 data report carries back, when RAOA asked for it. */
        raoa: (deg: string) => string
        /** One MMRC list entry: the initiator's address and its receipt bitmap, printed as the
         * literal bits (window-round order, index 0 first) rather than a byte count — the whole
         * point of the row is which rounds were received, not how many. */
        rmmrcEntry: (id: string, bits: string) => string
        /** §10.35.2.1's RAICT IE (Request = 0 half): whichever of the message number and the
         * frames-remaining count the content's presence bits made room for. Neither is a required
         * argument — the row names whichever the frame actually carries. */
        raict: (messageNumber?: number, framesRemaining?: number) => string
        fragment: (kind: string, index: number, of: number, msIn: number) => string
        fragmentRsf: (nMsr: number, gap: number) => string
        fragmentRif: (segments: number) => string
        nbMsgId: (name: string, hex: string) => string
        nbMsgName: Record<keyof typeof NB_MSG_ID | 'unknown', string>
        nbChannel: (channel: number, mhz: string) => string
        nbResponders: (n: number, ids: string) => string
        /** P802.15.4ab Config 1: which of the control plane's three messages an SP0 frame is. */
        sp0Role: Record<'poll' | 'resp' | 'report', string>
        sp0Rest: (octets: number) => string
        nbTurnAround: (time: string) => string
        nbRest: (octets: number) => string
      }
    }
  }
  widgets: {
    txPower: string; distance: string; walls: string; width: string; mode: string
    wallName: Record<'drywall' | 'brick' | 'glass', string>
    pathLoss: string; wallLoss: string; rssi: string; noise: string; snr: string
    bestMcs: string; required: string; margin: (db: number) => string
    ladderSnr: string; mcs: string; rate: string; reqSinr: string; sens: string
    usable: (n: number) => string
  }
  tooltips: {
    transmitting: string; dlMu: (n: number, kind: MuKind) => string; ampdu: (n: number, dst: string) => string
    data: (dst: string) => string; ack: (dst: string) => string; ba: (dst: string) => string
    mba: string; trigger: string; rts: (dst: string) => string; cts: (dst: string) => string; cfend: string
    nonHt: string; sifsNote: string; retryNote: string; ruNote: (kind: MuKind) => string
    receiving: (kind: string, from: string) => string
    rxCorrupted: (reason: RxFailReason, interferers: string) => string
    backoffTitle: string; backoffL1: string; backoffL2: string
    deferTitle: (ifs: string) => string; eifsNote: string; deferNote: string
    ifsChain: (kinds: string) => string
    navTitle: string; navNote: string; sifsWait: string
    ampTrigger: string; ampAck: (dst: string) => string; ampResp: (slot: number) => string
    /** Backscatter: the Gen2 command name, and the Gen2 reply name with the slot it came back in. */
    ampRfid: (cmd: string) => string; ampBsReply: (reply: string, slot: number) => string
    ampWait: string; ampWaitNote: string
    /** A backscatter tag counting down the reader's slots — powered, but not its turn. */
    bsWait: string; bsWaitNote: string
    uwbPoll: (anchors: number) => string; uwbResp: (slot: number) => string
    /** SS-TWR with a deferred reply time (standard §10.29.6.3): the reply time in a message
     * of its own, a slot later than the Response it describes. */
    uwbSsDefer: (slot: number) => string
    /** The initiation-only message a later round of a valid RCM carries (standard §10.32.9.1):
     * no anchor list to quote, unlike `uwbPoll` — the slot table is still the earlier round's. */
    uwbInit: string
    /** Many-to-many ranging (standard §10.32.6/§10.32.7): the slot this participant transmitted in
     * and how many arrival times it reported alongside its own transmit time. */
    uwbM2m: (slot: number, rxTimes: number) => string
    /** §10.34's ranging message non-receipt exchange: the slot this responder holds, standing in
     * for the response that never came. */
    uwbRmnr: (slot: number) => string
    uwbFinal: string; uwbReport: (dst: string) => string; uwbBlink: string
    /** P802.15.4ab: one fragment of a train ("RSF 3 of 8"), and the three narrowband messages. */
    uwbFragment: (kind: string, index: number, of: number) => string
    /** A fragment has no data rate — it is a sequence — so its own EIRP takes that column. */
    uwbFragmentRate: (dbm: number) => string
    /** A narrowband control message is a second radio altogether: O-QPSK at 250 kb/s, not the
     * HRP UWB PSDU rate the line above quotes. */
    nbRate: (mbps: number) => string
    nbPoll: (dst: string) => string; nbResp: (dst: string) => string; nbReport: (dst: string) => string
    /** P802.15.4ab Config 1: the same three messages as one SP0 packet on the UWB PHY. */
    uwbSp0: (role: 'poll' | 'resp' | 'report', dst: string) => string
    /** §10.32.8.2's SP3 marker: the slot it sits in, which is the only thing that says whose it
     * is — the frame has no address field to read one from. */
    uwbSp3: (slot: number) => string
    /** An SP3 packet has no PHR and no PSDU, so it has no data rate at all: this replaces the
     * BPRF PSDU rate `uwbRate` quotes for every frame that does have one. */
    uwbSp3Rate: string
    uwbRate: (mbps: number) => string
    uwbWait: string; uwbWaitNote: string
    /** §10.36's receipt-confirmation answer: how many initiators this frame lists. */
    uwbMmrcm: (n: number) => string
    /** §10.35.2.1's RAICT IE (Request = 0 half): the slot this fragment sits in, which is the
     * only thing that says whose it is — like RMNR and MMRCM above, the frame carries no range. */
    uwbAncillary: (slot: number) => string
  }
}

/** The three SP0 control messages, as the timeline's one-line tooltip names them — the draft's
 * own message names, which stay English tokens the way every other IEEE token here does.
 * 4ab draft 15-25/0194r0 */
const SP0_ROLE_SHORT: Record<'poll' | 'resp' | 'report', string> = {
  poll: 'POLL', resp: 'RESP', report: 'REPORT',
}

export const STRINGS: Strings = {
  header: { subtitle: 'IEEE 802.11 DCF/EDCA · 微秒时间尺度', edit: '✎ 编辑', simulate: '▶ 仿真', course: '📚 课程' },
  simError: (detail) => `仿真出错：${detail}`,
  sceneLabel: { slot: (n) => `时隙 ${n}`, waitAck: '等 ACK', waitCts: '等 CTS' },
  panel: { inspector: '🔍 检视器', log: '📜 事件日志', guide: '📖 学习指南', resizeHint: '拖动调整宽度 · 双击恢复默认' },
  view: {
    panUp: '向前移动视角', panDown: '向后移动视角',
    panLeft: '向左移动视角', panRight: '向右移动视角',
    zoomIn: '拉近', zoomOut: '拉远', home: '回到初始视角',
  },
  compact: {
    openSide: '🔍 检视器 / 日志',
    closeSide: '关闭',
    showCourse: '课文',
    showView: '视图',
    collapseTimeline: '收起时间轴',
    expandTimeline: '展开时间轴',
  },
  guideWindow: {
    title: '📖 Wi-Fi 速查手册', terms: '术语', overview: '概览',
    search: '搜索术语…', empty: '没有匹配的术语',
    close: '关闭（Esc）', dragHint: '可拖动',
  },
  course: {
    title: 'Wi-Fi MAC 实战课程',
    progressOf: (d, t) => `已完成 ${d}/${t} 课`,
    module: '模块',
    minutes: (n) => `约 ${n} 分钟`,
    selectPrompt: '在左侧选择一课，载入其仿真场景，对照课文观察实时时间轴。',
    outcomes: '学完这一课你能',
    needs: '需要先学',
    terms: '新词',
    numbers: '现在看数字',
    deeper: '再深一层',
    sources: '这些数字从哪里来',
    watchLoad: '▶ 载入并观察',
    watchJump: '⚡ 跳到那里',
    load: '▶ 载入本课仿真',
    reload: '↻ 重新开始仿真',
    variants: '场景变体',
    jumps: '跳转到',
    notFound: '当前仿真窗口内尚未出现——让仿真再运行一会儿',
    observe: '👀 观察要点',
    tryThis: '🧪 动手实验',
    quiz: '✅ 自测',
    check: '提交',
    correct: '回答正确！',
    incorrect: '不对——',
    markDone: '标记本课完成',
    done: '已完成 ✓',
    next: '下一课 →',
    prev: '← 上一课',
    back: '☰ 课程目录',
    openInEditor: '✎ 在编辑器中打开本课场景',
    loadHint: '载入预设场景（会替换当前场景；离开课程模式时会恢复你自己的场景）。',
    limits: '这一课的模型在哪里不是真实的无线电',
    limitKind: {
      threshold: '硬门限代替曲线：',
      unmodelled: '没有建模：',
      'model-value': '本仿真器自选的取值：',
      'out-of-scope': '这个模型答不了：',
    },
    limitUntil: (t) => `（这一条在《${t}》里会被解除）`,
    basis: (docs) => `依据：${docs}`,
    draftMark: '草案，内容可能变动',
    contributions: '本课依据的提案文稿：',
  },
  transport: {
    play: '▶ 播放', pause: '❚❚ 暂停', speed: '速度', simulating: '⏳ 仿真中…',
    prevExch: '⏮ 帧交换', nextExch: '帧交换 ⏭', prevEv: '← 事件', nextEv: '事件 →',
    minusSlot: '−时隙', plusSlot: '+时隙', minusUs: '−µs', plusUs: '+µs',
    speeds: [
      { us: 100, label: '放慢 10 000 倍' },
      { us: 300, label: '放慢 3 333 倍' },
      { us: 1000, label: '放慢 1 000 倍' },
      { us: 3000, label: '放慢 333 倍' },
      { us: 10_000, label: '放慢 100 倍' },
      { us: 100_000, label: '放慢 10 倍' },
      { us: 1_000_000, label: '实时' },
    ],
  },
  strip: {
    // The hint names both ways in, because the same strip is read with a mouse
    // on a desktop and with a finger on a phone.
    windowHint: '滚轮或拖动移时间 · Ctrl+滚轮或双指捏合缩放 · 点击帧看详情',
    legendCollision: '碰撞',
    zoomIn: '放大（看更短的时间）',
    zoomOut: '缩小（看更长的时间）',
  },
  legend: [
    { color: '#3b82f6', label: '下行数据', hint: 'AP 发出的数据 PPDU（下行）。长度即真实占用空口时间。' },
    { color: '#22c55e', label: '上行数据', hint: '终端（STA）发出的数据 PPDU（上行）。' },
    { color: '#e5e7eb', label: 'ACK', hint: '确认帧：在收到帧之后恰好一个 SIFS（16 µs）发出。' },
    { color: '#d8b4fe', label: 'BA', hint: 'BlockAck 块确认：一帧确认整个 A-MPDU 聚合。' },
    { color: '#facc15', label: 'Trigger', hint: 'Wi-Fi 6 触发帧：AP 调度多个终端同时进行上行 OFDMA 传输。' },
    { color: '#f97316', label: 'RTS/CTS', hint: '超过 RTS 门限时使用的介质预约握手（防隐藏节点）。' },
    { color: '#fb7185', label: 'CF-End', hint: 'TXOP 截断：持有者释放不再需要的预约；终端发出的 CF-End 由 AP 重复一遍。' },
    { color: '#f59e0b', label: '退避', hint: '随机退避倒数：每个空闲 9 µs 时隙减 1；介质忙时冻结。' },
    { color: '#6d5a1b', label: '等待', hint: '等待 DIFS/AIFS/EIFS 静默期，或等待介质变为空闲。' },
    { color: '#06b6d4', label: '交换等待', hint: '帧交换过程中的停顿：SIFS 周转或等待响应（ACK/CTS）——并非在竞争信道。' },
    { color: '#9333ea', label: 'NAV', hint: '虚拟载波侦听：被侦听到的 Duration 字段预约了介质。' },
    { color: '#8b5cf6', label: '接收', hint: '正在接收帧。' },
    { color: '#ef4444', label: '接收失败', hint: '打斜线：未能解码的接收，之后接收方要等一个 EIFS。红色表示被碰撞损坏——接收机只会锁定一个前导码，重叠的帧表现为一次失败的接收；紫色表示信号本身太弱，通常是旁听者听不懂一个高速率的帧。' },
    { color: '#ef4444', label: '碰撞', hint: '两个以上的传输重叠，导致接收失败。' },
    { color: '#2dd4bf', label: 'AMP 下行', hint: 'AMP 触发帧或 AMP 确认帧：2.4 GHz 上带传统前导码的 OOK PPDU，发给环境能量标签。' },
    { color: '#a78bfa', label: 'AMP 上行', hint: '标签在其抽中的时隙内发出的 OOK 应答；没有 Wi-Fi 电台能看到的前导码。' },
    { color: '#115e59', label: '等候时隙', hint: '一枚标签正等待稍后的时隙，数着 AP 发出的 Ack。' },
    { color: '#f59e0b', label: 'UWB 标签', hint: '测距标签自己发出的帧——开启一轮的轮询帧，以及 DS-TWR 下收尾的终结帧。' },
    { color: '#fbbf24', label: 'UWB 锚点', hint: '锚点在自己测距时隙内的回答：响应帧，以及 DS-TWR 下的测量报告帧。' },
  ],
  editor: {
    tools: { select: '☝ 选择', room: '▭ 房间', door: '🚪 门', window: '🪟 窗', ap: '📡 AP', sta: '📱 终端', tag: '🏷 AMP 标签', anchor: '📍 UWB 锚点', uwbTag: '📱 UWB 标签', scatterer: '🪞 散射体', fit: '⌂ 复位', undo: '↶ 撤销', redo: '↷ 重做' },
    undoHint: '撤销上一步编辑（Ctrl+Z）',
    redoHint: '重做已撤销的编辑（Ctrl+Shift+Z 或 Ctrl+Y）',
    apExists: '场景中已经有 AP 了——Wi-Fi 有且仅允许一个',
    needApFirst: '请先放置一个 AP：终端和 AMP 标签都需要 AP（只有纯 UWB 场景才可以没有）',
    scenario: '场景', save: '💾 保存', load: '📂 载入', export_: '⬇ 导出', import_: '⬆ 导入',
    spawn: '🎲 随机生成终端', rts: 'RTS', rtsHint: 'dot11RTSThreshold：大于该门限的帧启用 RTS/CTS 保护',
    seed: '种子', seedHint: '随机种子 — 相同种子可完全复现同一次仿真',
    sixGhz: '6 GHz 信道', sixGhzHint: '本方案 6 GHz Wi-Fi 信道的中心频率（802.11ax 信道编号，5 MHz 步进）',
    sixGhzChannel: (n) => `第 ${n} 信道`,
    sixGhzOverlap: (pct) => `与 UWB 5 信道重叠（按 80 MHz 计）：${pct} %`,
    sixGhzNbOverlap: '有一个 MMS 控制信道落在这个 Wi-Fi 信道中',
    fading: '时变链路（衰落）',
    fadingOn: '开启衰落',
    fadingOnHint: '打开后，链路电平不再只由几何与墙决定，而是随时间起伏：慢的一层是阴影衰落，快的一层是小尺度衰落。场景默认不写这一节，也就没有任何衰落，既有场景的运行结果因此一个数都不变。',
    fadingOffHint: '先勾上「开启衰落」，下面几项才可编辑',
    fadingSigma: '阴影 σ',
    fadingSigmaHint: '对数正态阴影衰落的标准差，dB。这是电平在其均值上下漂移的幅度：约三分之二的时间落在 ±σ 之内。0 表示不加阴影。默认 4 dB。',
    fadingSigmaBad: '阴影 σ 要填一个不小于 0 的数（dB）；0 表示不加阴影',
    fadingCoherence: '相干时间',
    fadingCoherenceHint: '阴影值保持不变的那段时间，ms。时间被切成等长的区间，每个区间抽一个阴影值：区间之内恒定，跨区间才换。它是配置值而不是从速度推出来的——这里没有任何东西在动。默认 100 ms。',
    fadingCoherenceBad: '相干时间要填一个大于 0 的数（ms）',
    fadingSmallScale: '小尺度分布',
    fadingSmallScaleHint: '逐帧变化的那一层，一帧之内恒定。无 = 只留阴影；瑞利 = 没有直射径的纯散射，最悲观的那一种；莱斯 = 直射径加散射，两者之比由 K 因子给出。',
    fadingSmallScales: { none: '无', rayleigh: '瑞利（NLOS）', rician: '莱斯（LOS）' },
    fadingRicianK: '莱斯 K',
    fadingRicianKHint: '直射径功率与散射功率之比，dB。K 越大，能拿去起伏的能量越少：K = 0 dB 时两者相当，K 很大时这一层几乎不动，K 趋于 0（线性）就退回瑞利。默认 6 dB。',
    fadingRicianKBad: '莱斯 K 因子要填一个数（dB）',
    fadingRicianOnly: '只有分布选「莱斯」时才有 K 因子：瑞利按定义没有直射径，「无」连小尺度衰落都不抽',
    selectivity: '频率选择性（frequency selectivity）',
    selectivityOn: '按 26 音调资源单元分格',
    selectivityOnHint: '打开后，快的那一层不再对整条信道同一个值：信道按 2.03125 MHz 一格（一个 26 音调资源单元，26-tone RU）各抽一次，各格的信噪比再按容量折成一个有效信噪比，解调的判决就落在这个合成值上。格数由带宽算出，不可配：20/40/80/160/320 MHz 对应 9/18/36/72/144 格。场景默认不写这一节，整条信道因此只有一个值，既有场景的运行结果一个数都不变。它只改解调这一步：载波侦听、前导检测、捕获效应（capture effect）与选级读的仍然是那一次平坦抽样；AMP 侧那几种 OOK 的 PPDU 也不走这条路。',
    scatterers: '散射体（回波）',
    scatterersHint: '房间里会反射的物体：它给每一次发送在每个接收端添上第二个到达——比直达路径晚，因为多走了路；弱不弱则要看物体：一个很强的反射体立在连线附近时，两段短路加起来可以比一条长的直达路径还响（−10 dB 的衣柜在 2 m 连线旁 0.87 m 以内就是如此）；一平方米的物体则在同样的几何里始终更弱。场景默认没有这一节，也就没有任何回波。只有 UWB 侧读回波，Wi-Fi 链路完全不受影响；而且回波对测距是隐形的：4z 接收机锁的是第一条路径。',
    noScatterers: '暂无 — 用 🪞 在画布上放一个',
    scatterer: '散射体',
    scattererLoss: '反射损耗（越小反射越强）',
    scattererLossHint: '这个物体比一面理想反射面弱多少 dB。注意方向：这是损耗，所以数越小反射越强。0 dB 不是「中性」，而是「正好一平方米」；半平方米是 +3.01 dB；一个衣柜大约 −10 dB。没有下界——几平方米的物体本来就该是负数。放置时写入的是 −10 dB：一平方米的理想反射面在常见室内距离上根本听不到。',
    scattererLossBad: '反射损耗要填一个有限实数（dB）；它没有下界，越小反射越强，0 dB = 一平方米',
    scattererHeight: '高度',
    scattererHeightHint: '反射中心离地多高，米。它连同 x、y 一起决定两段路程，也就决定回波晚多少、弱多少。放置时取 1.0 米。',
    scattererHeightBad: '高度要填一个有限实数（米）',
    scattererNeedsUwb: '场景里还没有 UWB 设备：散射体只在 UWB 收发之间产生回波，放好之后请再放一个锚点与一个标签',
    deleteScatterer: '🗑 删除散射体',
    objects: '🗂 对象列表', properties: '⚙ 属性', guide: '📖 编辑器说明',
    nodesHeader: '节点（顺序 = 时间轴泳道）', rooms: '房间', walls: '墙体', noRooms: '暂无 — 用 ▭ 绘制一个',
    node: '节点', name: '名称', wifi: 'Wi-Fi', link: '频段',
    linkHint: '工作频段；802.11g 与 Wi-Fi 6/7 可用 2.4 GHz，Wi-Fi 6E/7 可用 6 GHz（MLO 设备使用 5 + 6 GHz）',
    bands: { '2g': '2.4 GHz', '5g': '5 GHz', '6g': '6 GHz' },
    preset: '手机', presetPick: '选择机型…', presetHint: '真实机型（国行配置）：设置名称、Wi-Fi 代际、功能与典型业务，之后仍可随意修改。',
    brands: { huawei: '华为', xiaomi: '小米 / Redmi', honor: '荣耀', apple: '苹果' },
    mloCapableNote: '国行：6 GHz 关闭，而本模拟器只模拟 5 + 6 GHz 的 MLO。勾选上方 MLO 可模拟国际版。',
    servers: '云服务器', addServer: '+ 服务器', serverName: '名称', serverKind: '类型', serverRtt: '广域网 RTT',
    serverRttHint: 'AP 与该服务器之间经互联网的往返时延；每个方向各占一半',
    deleteServer: '🗑 删除服务器', streamServer: '服务器', households: '🏠 家庭场景', householdsPick: '载入一个家庭场景…',
    serverJitter: '广域网抖动', serverJitterHint: '每个报文的往返时延在 RTT 与 RTT + 抖动之间随机（每个方向各一半）',
    serverProcess: '处理时间', serverProcessHint: '服务器响应请求或回显 ping 所需的时间',
    p2pTarget: '发给', p2pTargetHint: '接收这路视频的手机；AP 收到每一帧后转发给它',
    tamper: '⚠ 篡改驱动', tamperHint: '该终端无视 AP 广播的 EDCA 参数。选择一种作弊方式，看看它给作弊者带来什么、让其他人付出什么。',
    tamperKinds: {
      none: '合规', custom: '自定义',
      escalate: '优先级提升——所有帧都按 AC_VO 发送',
      aifs: 'AIFS 压底——所有类别 AIFSN 取 1',
      cw: '竞争窗口坍缩——不做随机退避（CW 0）',
      noDouble: '不加倍——碰撞后 CW 从不增大',
      txopHog: 'TXOP 霸占——每次接入占用信道 8 ms',
      navInflate: 'NAV 虚报——Duration 字段多报 3 ms',
      greedy: '贪婪——以上全部（经典作弊）',
    },
    gameAccel: '🎮 游戏加速', gameAccelHint: '路由器游戏模式：把游戏流量标记进 AC_VI。关闭时游戏报文没有 DSCP 标记，和其他流量一样按尽力而为（AC_BE）竞争。',
    traffic: '业务', txPower: '发射功率', height: '高度',
    txopProt: 'TXOP 保护',
    txopProtHint: '本节点持有多次交换的突发时如何预告：逐次交换的 Duration（单次）；用 RTS/CTS 把介质预约到 TXOP 结束、提前结束时以 CF-End 归还（边界）；或在此基础上让每个数据帧也携带 TXOP 剩余时间（多重）。',
    txopProtNames: { single: '单次（逐次交换）', boundary: '边界（RTS/CTS 预约整个突发 + CF-End）', multiple: '多重（每帧携带剩余时间）' },
    deleteNode: '🗑 删除节点', deleteRoom: '🗑 删除房间', delete_: '删除',
    apNoDelete: '只有当场景中不再有终端和 AMP 标签时才能删除 AP——纯 UWB 场景不需要 BSS',
    wall: '墙体', material: '材质', materialHint: '射频衰减：石膏板 5 dB · 砖墙 12 dB · 玻璃 3 dB（每次穿越）',
    removeOpenings: '移除门窗开口', room: '房间', openings: '个开口',
    emptyHint: '未选中任何对象。点击画布上（或上方对象列表中）的节点、墙体或房间即可在此编辑其属性。场景的保存/载入与设置位于画布顶部的菜单栏。',
    saved: '已保存', loaded: '已载入', imported: '已导入', nothingSaved: '尚无存档',
    scaleBarHint: '网格 1 米（粗线 5 米）· 滚轮缩放 · 中键/右键拖动平移',
    amp: 'AMP 轮询（802.11bp）', ampEnable: '轮询环境功率标签',
    ampInterval: '轮询间隔', ampIntervalHint: 'AP 为一轮 AMP 竞争（AC_BK）信道的频度',
    ampSlots: '时隙数 (N)', ampSlotsHint: '触发帧每轮打开的上行时隙数量',
    ampAcwe: 'ACWE', ampAcweHint: 'ACW = 2^ACWE − 1：标签抽取时隙计数器的取值范围',
    ampDl: '下行速率', ampDlHint: 'AMP 触发帧与 AMP 确认帧使用的数据速率',
    ampUl: '上行速率', ampUlHint: '触发帧为标签的上行应答指定的数据速率',
    ampProt: { ctsSelf: '轮询前先发 CTS-to-self', none: '不做保护' }, ampProtLabel: '保护',
    ampRead: { inline: '在随机接入应答中直接读取', twoPhase: '先读 id，再做一次预约读取' }, ampReadLabel: '读取方式',
    ampNeedsEht: 'AMP 轮询需要 Wi-Fi 7 的 AP（AMP 下行 PPDU 携带 U-SIG）',
    ampSens: '下行灵敏度', ampSensHint: '该标签包络检波器能解出的最弱 AMP 下行 PPDU（模型默认 −72 dBm）',
    ampMode: '模式', ampModeHint: '该标签如何应答：自带发射机，还是反射阅读器的载波',
    ampModes: { active: '主动发射（Active Tx）', backscatter: '反向散射（Backscatter）' },
    ampEpc: 'EPC', ampEpcHint: '96 位电子产品编码，24 个十六进制字符；留空则由节点 id 派生',
    ampEpcBad: 'EPC 必须是 24 个十六进制字符（96 位），或留空',
    ampBsNeedsReader: '该标签所在的场景里没有任何 AP 打开 RFID 盘点——请到 AP 自己的属性里打开它，否则场景无法通过校验',
    ampBs: 'RFID 盘点', ampBsEnable: '运行 EPC Gen2 盘点（单站式反向散射）',
    ampBsEnableHint: 'AP 自己辐射载波并聆听标签反射回来的信号——关闭时不会有任何反向散射标签应答',
    ampBsQ: 'Q', ampBsQHint: 'Query(Q)：每个标签从 [0, 2^Q − 1] 中抽取一个时隙计数器；Q = 2 即四个时隙。草案自身的 Q 自适应未建模',
    ampBsUl: '上行速率', ampBsUlHint: '标签反向散射应答所用的速率',
    ampBsWup: '唤醒载波（ms）', ampBsWupHint: '一个 TXOP 第一个 PPDU 前端的唤醒载波时长；标签需要在 −20 dBm 以上持续整个窗口才能启动',
    ampBsCharge: '充能功率', ampBsChargeHint: '直到每条命令结束为止所辐射的功率；标签必须在整个唤醒窗口内听到它才能启动——默认 10 dBm 时可达 30.9 cm，20 dBm 时可达 97.8 cm。超出这个距离的标签永远不会启动：没有泳道，也没有记录。',
    ampBsBs: '散射窗功率', ampBsBsHint: '等待应答期间辐射的功率；调高它并不会增加距离，因为阅读器自身的泄漏底噪也会同样升高——无论如何设置，应答距离在 250 kb/s 时都是 32.8 cm，1 Mb/s 时都是 23.2 cm',
    ampBsTxop: 'TXOP（ms）', ampBsTxopHint: '一次盘点突发最多占用信道多久；装不下的盘点会在下一个 TXOP 中继续，沿用同一个会话与同一个时隙',
    ampBsRead: 'ACK 后读取', ampBsReadHint: 'EPC 应答成功后跟一次 8 字节的 Read',
    ampBsWrite: '读取后写入', ampBsWriteHint: 'Read 之后跟一次 Write，标签在 2 ms 后才应答——阅读器要在这段等待中一直保持载波，所以泳道上的 Write PPDU 长约 3 ms',
    uwbNode: 'UWB 测距（802.15.4-2024）', uwbRole: '角色', uwbRoles: { anchor: '锚点（位置固定，负责应答）', tag: '标签（测距并解算自身位置）' },
    uwbRoleM2mNote: '多对多测距（M2M）下角色不影响测距：这里选锚点还是标签，只决定这个节点在场景图里画成什么样子，场景里的每一台 UWB 设备都会成为参与者，两两互相测距（design §5）',
    uwbPpm: '晶振偏差', uwbPpmHint: '该设备测距时钟的频率偏差，单位 ppm；标准允许 ±20 ppm。留空则由本次仿真按随机种子抽取。',
    uwbPpmDrawn: '由种子抽取', uwbPpmRange: '±100 ppm；真实晶振通常在 ±20 以内',
    uwbYaw: '朝向',
    uwbYawHint: '该锚点天线阵列指向的方向，以 +x 轴为 0°、逆时针为正（90° 即指向 +y）。只有当会话开启到达角测量时才有意义：所有方位角都相对这个正前方给出，而锚点只能看到其左右各 90°——位于锚点背后的标签会被镜像到正前方那一侧，因为两根天线分辨不出前后。',
    uwbSession: 'UWB 测距会话', uwbCounts: (a, t) => `${a} 个锚点 · ${t} 个标签`,
    uwbNoNodes: '当前没有任何测距设备使用该会话',
    uwbRemoveSession: '🗑 删除测距会话', uwbRemoveSessionHint: '删除 scenario.uwb——导入的文件里可能带着一个没有任何设备参与的会话',
    uwbSessionInUse: '场景中还有 UWB 设备时不能删除该会话；请先删除这些设备',
    uwbMethod: '测距方式', uwbMethodHint: 'SS-TWR（单边双向测距）：每个锚点只需一次轮询与一次响应，帧数减半，但两台设备之间的时钟偏差会原样进入测距结果。DS-TWR 增加终结帧与报告帧，可将其抵消。',
    uwbMethods: { ss: 'SS-TWR（单边双向）', ds: 'DS-TWR（双边双向）' },
    uwbReplyTime: '回复时间走哪条路', uwbReplyTimeHint: '回复时间/往返时间信息从产生它的设备走到需要它的设备，走的是哪条路（标准 §10.29.6.3–.7）：嵌入——写进它自己测量的那一帧（RRTI IE），要求硬件能预约未来的发送时刻，本仿真默认走这一条；延后——先把那一帧发空，量出自己的真实发送时刻后，再用一条专门的后续报文补上；固定——两端事先约定一个数，应答方在收到之后的这个固定时延处发送，这个数完全不上空口，但换来的是应答方必须真的踩准这个时刻。DS-TWR 没有“固定”这一种（标准只定义了它的嵌入式与延后两种），竞争调度里没有“延后”这一种（抽到的时隙没有固定的后续时隙可去）。',
    uwbReplyTimeMmsOnly: 'MMS 有它自己的“固定回复时间”（macMmsFixedReplyTime，见下方 MMS 小节）：草案不同、时机不同，与这里的三选一无关，因此在 MMS 模式下与测距方式一并置灰',
    uwbReplyTimeM2mOnly: '多对多测距没有独立的响应帧：参与者自己的那一次发送已经带着发送时刻，与它收到的每一个接收时刻，这就是嵌入式的做法——标准的多对多条款（§10.32.6/§10.32.7）没有定义延后或固定的时间信息形态',
    uwbReplyTimes: { embedded: '嵌入（今天的行为）', deferred: '延后', fixed: '固定' },
    uwbReplyTimeRstu: '固定回复时间',
    uwbReplyTimeRstuHint: '仅“固定”形态生效：第一个应答方在收到 Poll 之后固定这么久再发（单位 RSTU），从它自己的晶振数——第 k 个应答方在此基础上再加 k 个测距时隙。这个数从不上空口，但它同时是本仿真唯一一种发送不对齐时隙的形态：调得太小，应答方会在自己的时隙还没开始时发送；调得太大，会被自己时隙的边界切掉——两种情况整轮都以超时收场（design §6.1）。',
    uwbReplyTimeRstuOnly: '只有“固定”形态会用到这个数：回复时间走嵌入或延后那条路时，它写进帧里或量出来，用不着事先约定',
    uwbMode: '测距模式', uwbModeHint: '双向测距为每个锚点测出一个距离，由标签自己解算位置。两种单向模式改为测量到达时间差：DL-TDoA 由锚点跑完整轮，全程不发射的标签据此自行定位；UL-TDoA 则由标签发一帧闪发，共享同一时基的锚点替它定位——这两种模式都需要四个锚点才能凑出三个时间差。多毫秒测距（multi-millisecond ranging, MMS）又回到双向测距，但它默认是成对进行的：一个轮次只含一个标签和一个锚点，测距信号是一列片段，控制交互与测量报告则走一套单独的控制面——窄带电台只是这套控制面的两种配置之一。它对锚点数量没有下限要求，要求的是测距块能装下所有配对，即“标签数 × 锚点数 ≤ 每块轮次数”。多对多测距（many-to-many, M2M）里没有标签也没有锚点：场景中的每一台 UWB 设备都轮流发送一次，一次发送同时是对排在它后面的人的“问”，也是对排在它前面的人的“答”，N 个参与者一轮只用 N 个时隙（SS-TWR）或 2N 个时隙（DS-TWR）就能测出全部两两距离——轮流当标签则要 N² 个时隙才做得到同一件事。以上四种模式都必须是时间调度的会话。',
    uwbModes: {
      twr: '双向测距（TWR）', 'dl-tdoa': '单向·下行（DL-TDoA）', 'ul-tdoa': '单向·上行（UL-TDoA）',
      mms: '多毫秒测距（MMS，802.15.4ab 草案）',
      m2m: '多对多测距（M2M，标准 §10.32.6/§10.32.7）',
    },
    uwbClockCorrection: '标签时钟校正', uwbClockCorrectionHint: 'DL-TDoA：只听不发的标签先用本轮“轮询帧→终结帧”这段间隔量出自己晶振的快慢，再去做到达时间差。关掉它就能看到 ±20 ppm 的后果：误差为 20 ppm 乘以从轮询帧到被计时的那一帧之间的间隔——本系列课程那种五时隙轮次里最长 6 ms，即 36 米；若有九个锚点，最后一个应答帧在轮询帧后 16 ms，则是 96 米。',
    uwbDlOnly: '只有 DL-TDoA 用得上：这是那个“只听”的标签自己做的校正，其他模式里没有只听的标签',
    uwbSyncError: '锚点同步误差', uwbSyncErrorHint: 'UL-TDoA：各锚点的时钟被校准到同一时基的程度（模型采用“有线同步”）。每个锚点一次性抽取一个这种量级的固定残差；1 ns 就是 30 cm 的距离差，而且发再多闪发也平均不掉。',
    uwbUlOnly: '只有 UL-TDoA 用得上：这是锚点之间的共享时基，其他模式都不会去比较两个锚点的时间戳',
    uwbTwrOnly: '单向测距的轮次必须为每个锚点事先排好时隙，因此两种单向模式只支持时间调度',
    uwbAoa: '到达角（AoA）',
    uwbAoaHint: '每个锚点在收到标签的每一帧时，都额外测量两根天线之间的相位差，并换算成方位角（视场为正前方左右各 90°，正前方 1-σ 约 2.7°，越靠边越差）。配合 DS-TWR，锚点同时握有距离和方向，仅凭自己就能定出标签的位置——一个锚点，一个定位。',
    uwbAoaTwrOnly: '只有双向测距时锚点才会收到标签发来的帧：DL-TDoA 中标签根本不发射，UL-TDoA 中标签那一帧闪发也不属于任何锚点参与应答的轮次',
    uwbAoaMms: 'MMS 中的标签确实会发射，测距也确实是双向的——它缺的不是“方向”，而是可供测方位角的那一帧。它的测距信号是一列“素”序列：没有前导、没有 SFD、没有 PHR，天线阵列根本找不到可以比较两路相位的东西。在这里让方位角无从测起的是信号本身，而不是交互的方向。',
    uwbAoaM2m: '到达角是锚点朝着固定的天线阵列、对准标签的一次发送测出来的——而多对多测距里没有锚点，也没有标签：每个参与者的一次发送要同时回答排在它前面的好几个人，没有哪一次发送是单独朝着谁的，也就没有单独的一对可供测方位角（design §5）',
    uwbScheduleMms: 'MMS 的测距周期在块开始之前就已排定——一个标签–锚点配对独占一个轮次（打开一对多开关时则是会话中的全部锚点），轮次内每个片段又独占一个时隙，一毫秒一个——因此根本没有留下可供竞争的响应窗口。选中该模式时还会把时隙改成草案自己的 600 RSTU（4ab 草案 15-22/0381r5 Table 1.2.3.2）。',
    uwbScheduleM2m: '多对多测距的每一个时隙都已经排给了确定的参与者，在块开始之前就定好了顺序：竞争抢的是谁能占到一个时隙，而这里时隙早就分完了，没有什么可抢的（design §5）',
    uwbBlock: '测距块', uwbBlockHint: '测距块循环往复；每个标签在块内独占一个轮次，因此块长决定了标签多久刷新一次位置',
    uwbSlot: '测距时隙', uwbSlotHint: '一个测距时隙只装一帧；它必须容得下该轮次中最长的一帧（DS-TWR 的终结帧，长度随锚点数增长）以及其飞行时间',
    uwbChannel: '信道', uwbChannelHint: '信道 5 为 6489.6 MHz，信道 9 为 7987.2 MHz。两者只有 1 米处的自由空间损耗不同（48.7 dB 对 50.5 dB），因此信道 9 在任何距离上都恒定多损耗约 1.8 dB。',
    uwbTsNoise: '时间戳噪声', uwbTsNoiseHint: '接收时间戳误差的 1-σ 值；100 ps 的计时误差折合 3 cm 的飞行距离，经双向测距公式折算后是 2.1 cm 的测距误差。该值是接收信噪比为 20 dB 时的水平：信号更弱时时间戳按 sqrt(20 dB / SNR) 变差，最多为此值的十倍',
    uwbCfoNoise: '时钟估计噪声', uwbCfoNoiseHint: '接收机估计载波频偏后残留误差的 1-σ 值；这正是 SS-TWR 无法抵消的那一部分',
    uwbNlos: 'NLOS 穿墙时延', uwbNlosHint: '把射线穿过的每一堵墙的附加时延计入飞行时间（石膏板 0.5 ns、砖墙 2 ns、玻璃 0.2 ns）。墙只会让测距结果偏大，不会偏小。',
    uwbSchedule: '调度方式', uwbScheduleHint: '时间调度：轮询帧逐一指明每个锚点及其时隙，因此不可能发生碰撞。竞争调度（调度模式 0）：轮询帧只开出一个响应窗口，各锚点各自在窗口内随机抽取一个时隙——控制器无需事先知道现场有哪些锚点，代价则是碰撞。',
    uwbSchedules: { time: '时间调度', contention: '竞争调度' },
    uwbSsOnly: '竞争轮次中只有响应帧需要安排时隙；DS-TWR 还需要为报告帧再开一个窗口，因此本仿真的校验规则只允许竞争调度配合 SS-TWR',
    uwbContentionOnly: '时间调度的轮次里无需抽取——每个锚点本来就有自己的时隙。把“调度方式”改成竞争调度后才能使用本项。',
    uwbContentionSlots: '响应时隙数', uwbContentionSlotsHint: '轮询帧通告的响应窗口长度（RCPS IE）：每个锚点在这些时隙中均匀抽取一个。若有 N 个锚点、S 个时隙，则某个锚点独占其时隙的概率为 (1 − 1/S)^(N−1)。',
    uwbMaxAttempts: '尝试次数', uwbMaxAttemptsHint: '轮询帧通告的重试预算（RCMA IE）：连续这么多轮都没有被标签测到之后，锚点会空过一轮再重新抽取时隙',
    uwbRcmValidityRounds: 'RCM 有效轮次',
    uwbRcmValidityHint: '一条控制消息（RCM，Ranging Control Message）能管几轮测距（标准 §10.32.9.1，ARC IE 的 RCM Validity Rounds 字段，6 位，取值 0–63）。1 表示每轮都带一条控制消息，也就是今天的行为；调大之后，其余轮次只发测距启动消息，不再重发时隙表。',
    uwbRcmValidityTwrOnly: '只有双向测距才有 ARC IE 携带的控制消息：两种单向模式、MMS 和多对多测距的测距帧里都没有这一帧，这个字段只能是 1',
    uwbRmnr: 'RMNR',
    uwbRmnrHint: '响应方手里还握着一条仍然有效的控制消息，却没收到本轮的测距启动消息时，发一帧测距消息未收到帧（RMNR，Ranging Message Not Received，标准 §10.34）代替沉默——发出这一帧本身就确认了它仍持有控制消息',
    uwbRmnrTwrOnly: '只有双向测距才有 ARC IE 携带的控制消息：这几种模式里没有这样一条消息，也就没有谁能“仍然持有”它',
    uwbRmnrNeedsValidity: '每轮一条控制消息（RCM 有效轮次为 1）时，这条控制消息和本轮的测距启动消息是同一帧：没收到这一帧的响应方，连自己的时隙都无从知道，也就没有地方可以发 RMNR——请先把 RCM 有效轮次调到 2 以上',
    uwbRmnrContention: '竞争调度下响应方的时隙是临时抽到的，不是哪一条控制消息里写定的，RMNR 在这里没有什么可确认的——请先把调度方式改回时间调度',
    uwbMmrcr: '收妥确认请求（MMRCR）',
    uwbMmrcrHint: '在 ARC IE 里置位 MMRCR（标准 §10.36，控制字第 15 位），请对端用一帧 MMRCM 确认它在当前 RCM 有效轮次窗口里收到了哪几条开场消息——这一位和上面的 RCM 有效轮次同属一个字，置位本身不增加控制消息的字节数，花费空口时间的是对端的那一帧回答',
    uwbMmrcrDlTdoa: 'DL-TDoA 里能发出控制消息的只有 anchor 0，其余 anchor 有没有收到它的 Poll，已经由它自己发没发 Response 说明；真正不知道自己有没有被听见的是标签，而标签在 DL-TDoA 里从不发送，不是双方都认识的一个地址，没法替它确认',
    uwbMmrcrUlTdoa: 'UL-TDoA 里标签只发一次闪烁帧，没有 ARC IE，也没有谁来应答，收妥确认没有地方可以请求',
    uwbMmrcrMms: 'MMS 的控制面走的是窄带的 nbPoll/nbResp/nbReport，不是这里的 ARC IE，收妥确认请求的这一位没有地方可以搭',
    uwbMmrcrNeedsValidity: '每轮一条控制消息（RCM 有效轮次为 1）时，窗口只有一块，位图也只有一位，而这一位说的正是这一帧收到了没有——响应方发没发 Response，已经当场说明了同一件事，不必再发一帧去确认它：请先把 RCM 有效轮次调到 2 以上',
    uwbMmrcrContention: '收妥确认要落在一个确定属于某个应答方的时隙里，竞争式调度下响应方的时隙是抽来的，没有谁能保证占到那个时隙：请先把调度方式改回时间调度',
    uwbSp3: 'SP3 分组测距',
    uwbSp3Hint: 'SP3 测距帧只有 SYNC、SFD 与 STS（标准 §10.32.8），没有 PHR，也没有载荷：往返测距阶段改发这种标记帧，随后另起一个测量报告阶段，把方位角与往返时间发回来',
    uwbSp3DlTdoa: 'DL-TDoA 里收发 Poll、Response 与 Final 的是锚点之间，标签在这个模式下从不发送，没有一次标签－锚点往返可以压成 SP3 标记',
    uwbSp3UlTdoa: 'UL-TDoA 里标签只发一次闪烁帧，没有往返可言',
    uwbSp3Mms: 'MMS 的控制面走窄带电台的 nbPoll/nbResp/nbReport，不是这里的 ARC/SRRR IE，也没有 SP3 这种 UWB PHY 包格式的位置',
    uwbSp3M2m: '多对多测距没有独立的 RCM：每个参与者的一次发送本身既是问也是答，没有这样一条控制消息可以挂 SRRR IE',
    uwbSp3Contention: '竞争式测距轮里响应方的时隙是临时抽到的，SRRR IE 要在 RCM 里按固定的应答方逐个声明它要报告哪几项，这里没有这样一条控制消息可挂：请先把调度方式改回时间调度',
    uwbSp3NeedsDeferred: 'SP3 包没有载荷，测距帧量到的时间要靠随后的测量报告阶段另发一帧补上：请先把回复时间改成延后，或者把 SP3 关掉',
    uwbSrrrRaoa: 'SRRR 请求到达角',
    uwbSrrrRrtt: 'SRRR 请求往返时间',
    uwbSrrrRaoaHint: '响应方在 RCM 里请求发起方把方位角写进测量报告阶段的那一帧（标准 §10.32.9.9）：关掉这一位，报告帧就不带这一项，字节数更少',
    uwbSrrrRrttHint: '响应方在 RCM 里请求发起方把往返时间写进发起方自己那一帧测量报告（标准 §10.32.9.9）：置位之后发起方多占一个时隙发这一帧，关掉则没有这一帧',
    uwbSrrrNeedsSp3: '只有 SP3 分组测距的 RCM 里才有 SRRR 这个控制字可以置位',
    uwbSrrrNeedsSs: '这两个请求位由延后回复时间那条路上的帧来回答——方位角装在响应方的延后报文里，往返时间装在发起方自己的测量报告里；双边双向的报告相位是两端交换自己的，不会因为这两个请求而变化，请求放在这里没有一帧能回答它：请先把测距方式改成单边双向',
    uwbSrrrRaoaNeedsAoa: '锚点没有打开到达角测量，测量报告阶段里没有方位角可以报：请先打开到达角',
    uwbAncillary: '测距辅助信息交换',
    uwbAncillaryHint: '打开后，发起方——这一节里角色名与测距本身相反，发消息的一端叫发起方，收的一端叫响应方（标准 §10.35.1）——把一条消息连续分装进本轮的若干个测距时隙发出，每一帧带一枚 RAICT 信息元（标准 §10.35.2.1），其中 Frames Remaining 字段报这条消息还剩几帧。窗口复用 RCM 有效轮次已经定出的那个边界（标准 §10.32.9.1）。',
    uwbAncillaryTwrOnly: '只有双向测距的轮次里才有能带 RAICT 信息元的帧：其余几种模式要么没有一个锚点对标签发送的时隙，要么控制面走的不是这种帧，辅助信息交换没有地方可以发',
    uwbAncillarySp3: 'SP3 分组测距的报告阶段已经是按 SRRR 两位独立追加的一批帧，辅助信息消息（ancillaryFrames）是另一批独立追加的帧，这一刀没有规定两者怎样排在一起：请先把 SP3 关掉，或者把测距辅助信息关掉',
    uwbAncillaryFrames: '辅助信息帧数',
    uwbAncillaryFramesHint: '这条辅助信息消息分成几帧发出（model）：本仿真没有上层应用来定这个数，场景直接给出帧数，RAICT 信息元的 Frames Remaining 字段从这个数减一开始倒数到 0（标准 §10.35.2.1）',
    uwbAncillaryFramesOff: '测距辅助信息交换关闭时这个数没有作用——打开上面的开关才会按它分帧发送',
    uwbPlan: (slots, rounds) => `每轮 ${slots} 个时隙 · 每块 ${rounds} 轮`,
    uwbM2mParticipants: (participants) => `多对多测距：全部 ${participants} 台 UWB 设备都是参与者，按 id 排序决定发送顺序——上方的锚点/标签计数只影响画法，不影响这个数`,
    uwbMms: 'MMS 片段序列',
    uwbMmsHint: '802.15.4ab 草案中的多毫秒数据包：测距信号不再是一次突发，而是一列短片段（成对轮次里相隔一毫秒，一对多时间隔更长）。每个片段都可以把整整一毫秒的 37 nJ 能量额度（法规）花在自己那段短得多的长度里，而 X 个片段相干合并又能再换来 10·log10(X) dB。本节所有内容都是对 TG4ab 提案文稿的转述——已进入投票的 D05 在编号与细节上可能有所不同。',
    uwbMmsSet: '参数集',
    uwbMmsSetHint: '草案规定的必选工作参数集（4ab 草案 15-23/0502r3，拟编为 16.2.11.4）：十组纯 RSF 序列（各 16 个片段）和七组混合序列。选中某一组会写入下面五个物理层字段并把 Z 置为 1；改动其中任何一个，下拉框就会显示“自定义”。会话默认值取自草案的测距周期默认配置而非某个参数集，因此一打开就是“自定义”。',
    uwbMmsCustom: '自定义',
    uwbRsfs: 'RSF 个数（X）',
    uwbRsfsHint: '一台设备发送多少个测距序列片段，每毫秒一个。测距时间戳落在第一个片段上；X = 0 时改落到第一个 RIF 上。可取 0、1、2、4、8、16（4ab 草案 15-22/0381r5 Table 1.6.3.2），其中 16 个片段相当于 12.04 dB 的合并增益。',
    uwbRifs: 'RIF 个数（Y）',
    uwbRifsHint: 'RSF 之后跟随多少个完整性片段。每个片段就是一段 STS，这一列片段只决定测距结果的完整性标志，别无他用——Y = 0 即不做完整性校验。可取 0、1、2、4、8（4ab 草案 15-22/0381r5 Table 1.6.3.2）。',
    uwbNMsr: 'N_MSR',
    uwbNMsrHint: '一个 RSF 内 MMRS 符号的重复次数。在 499.2 Mchip/s 下，一个 RSF 为 N_MSR × 4 ×（128 + 2 × 间隔）个码片（4ab 草案 15-23/0100r2 §2.3.2），因此它决定片段的长度——又因为一毫秒的能量要摊在这段长度上，它也决定了片段有多“轻”。',
    uwbGap: 'MMRS 间隔',
    uwbGapHint: 'MMRS 符号在其长度为 128 的互补序列两半之间插入的零的个数，取 0…64（4ab 草案 15-23/0100r2 §2.3.2）。必选参数集使用 25 到 64，会话默认值为 64。',
    uwbStsLen: 'STS 长度',
    uwbStsLenHint: 'RIF 中加扰时间戳序列的长度，以 512 个码片为单位（STS 见标准 §16.2.9，单位见 4ab 草案 15-23/0100r2 §2.3.2）。64 个单位即一个 65.64 µs 的片段。',
    uwbGapMs: '空闲毫秒（Z）',
    uwbGapMsHint: '草案在测距序列与完整性序列之间留出的间隔，好让接收机先处理完前者再开始后者。Z = 1 时第一个 RIF 紧接最后一个 RSF 的下一毫秒发出；Z = 2 时两者之间空出一整毫秒（4ab 草案 15-23/0100r2 §2.3.2）。',
    uwbNbChannels: '窄带信道',
    uwbNbChannelsHint: '本会话可用的窄带控制信道，用逗号分隔。全部共 250 个，间隔 2.5 MHz：0–49 位于 UNII-3，自 5726.25 MHz 起；50–249 位于 UNII-5，自 5926.25 MHz 起（4ab 草案 15-22/0381r5 §1.4.1；中心频率公式本身是依据频段边界反推出来的——模型取值）。每个测距块从列表中挑一个。按回车或移开焦点即生效。',
    uwbNbChannelsBad: '窄带信道白名单需要 1…250 个互不相同的信道，取值范围 0…249',
    uwbNbLbt: '先听后说（LBT）',
    uwbNbLbtHint: '窄带发送前是否先监听 9 µs：草案规定 UNII-5（信道号 ≥ 50）必须执行、UNII-3 可选，“自动”即按此判断（4ab 草案 15-22/0381r5 §1.4.2，援引 ETSI EN 303 687 的基于帧设备规则）。“忙”的判据是 2.5 MHz 信道内的外部功率达到或超过 −71.02 dBm；一旦判忙，本设备的窄带电台在该测距块剩余时间内不再发送。',
    uwbNbLbts: { auto: '自动——信道号 ≥ 50 时开启', on: '始终开启', off: '关闭' },
    uwbReport: '报告方式',
    uwbReportHint: '成对轮次结束时由哪一方发送窄带测量报告：响应方用第一个报告时隙、发起方用第二个，或者两方都发（4ab 草案 15-22/0381r5 Table 1.1.4.1）。算一次距离需要往返时间和回复时间，而每一方各自只能测到其中之一——因此只有收到报告的一方才算得出距离。用来修正的时钟比率则来自它自己那列片段序列；若序列只给了它一个片段，就改用窄带载波频偏估计。',
    uwbOneToMany: '一对多轮次',
    uwbOneToManyHint: '一个轮次里只有一个发起方，而会话中的每个锚点都是它的响应方（4ab 草案 15-22/0381r5 Table 1.6.3.1：一对多 POLL 0x10 携带响应方数量、每响应方时隙数以及响应方地址列表，0x12/0x13 则是它的报告消息）。标签的片段序列只发一次，所有锚点同时收听；每个锚点在自己的窄带窗口和自己的测距时隙里回应，于是测距阶段的一毫秒是「每台设备一个时隙」而不是两个，标签只用一个轮次就能得到到每个锚点的距离。关闭（默认）时一个轮次只是一对标签–锚点，一个测距块要装下每一对各一个轮次。需要注意：在 schema 允许的任何时隙长度下，一对多轮次的片段间隔都会大于一毫秒（600 RSTU 已是最短的合法 MMS 时隙），因此引擎按该轮次真实的片段间隔来测时钟比率，而不是按名义上的一毫秒。一毫秒内各时隙的交错顺序是本引擎的取值（模型）；消息格式与「每响应方分配时隙」则来自草案。',
    uwbReports: {
      responder: '响应方发报告——由发起方测距',
      initiator: '发起方发报告——由响应方测距',
      bi: '双方都发报告',
    },
    uwbMmsControl: '控制面配置',
    uwbMmsControlHint: '草案给 MMS 定义了两套控制面。配置 2（Config 2）是窄带辅助（narrowband-assisted, NBA）：POLL、RESP、REPORT 三条消息都跑在一套 2.5 MHz 的窄带电台上，每个窗口占两个测距时隙。配置 1（Config 1）是 UWB 驱动（UWB-driven, UWBD）：设备只有一个电台，同样这三条消息改成 UWB 物理层上的 SP0（BASIC_PACKET）包，窗口缩到一个时隙（4ab 草案 15-25/0194r0）。切到配置 1 时下面的窄带信道与先听后发会置灰并清空——那里已经没有窄带电台可供它们作用，引擎在这种配置下也确实一个窄带信道都不抽；切回配置 2 会写回草案的默认窄带设置（信道 3、LBT 自动），因为一份空的允许列表是配置 2 不接受的，而本控件不替你记住上一份列表。',
    uwbMmsControls: { nba: '配置 2 · 窄带辅助（NBA）', uwbd: '配置 1 · UWB 驱动（UWBD）' },
    uwbUwbdControl: '控制相位',
    uwbUwbdControlHint: 'UWB 驱动配置下控制相位的形态。草案用轮询与响应两个时隙数来描述它：取 1–15 时控制相位里发 SP0 控制帧；两者都取 0 时控制相位长度为零——一条控制帧都不发，测距包自己的包首 SYNC+SFD 同时充当轮询与响应，整个轮次只剩测距相位与报告相位（4ab 草案 15-25/0194r0）。选零长度省掉的正是那两个控制窗口，代价是两端都得事先知道这一轮的形状。',
    uwbUwbdNbaOnly: '零长度控制相位只属于 UWB 驱动配置：窄带辅助配置的 POLL/RESP 窗口排在窄带电台上，在这里选什么都不改变任何东西（4ab 草案 15-25/0194r0）',
    uwbUwbdControls: { sp0: 'SP0 控制帧', none: '零长度——由包首 SYNC+SFD 代劳' },
    uwbRsfSfd: 'RSF 带 SFD',
    uwbRsfSfdHint: '让每个 RSF 片段后面都跟一个帧起始定界符（start-of-frame delimiter, SFD），于是任何一个片段都能充当整包的开头。默认只有包首那一个片段带 SYNC+SFD，它一丢，后面的片段再全部收到也打不开这个包；带上 SFD 后接收机从听到的第一个片段起就能接管——这恰恰是把片段摊进好几个毫秒之后最需要防的那件事（4ab 草案 15-25/0066r1）。代价是每个片段都多花一段 SFD 的时间。',
    uwbRsfSfdUwbdOnly: 'RSF 带 SFD 只在 UWB 驱动配置下有意义：窄带辅助配置里没有包首 SYNC+SFD 可丢，也就没有「哪个片段能开包」这个问题（4ab 草案 15-25/0066r1）',
    uwbRsfSfdNMsr: '草案只在 RSF 片段长度（N_MSR）为 32 或 64 时定义了带 SFD 的 RSF：SFD 要塞进片段自己那段长度里，更长的片段没有给出这种形态（4ab 草案 15-25/0066r1）。先把 N_MSR 改成 32 或 64',
    uwbNonInterleaved: '非交织子轮',
    uwbNonInterleavedHint: '把一个轮次拆成若干子轮（sub-round），每台设备一个：子轮里只有它自己在发，它那列片段连续发完，下一台设备的子轮才开始（4ab 草案 15-25/0292r1，拟编为 §10.39.7）。默认的交织（interleaved）形态相反——同一毫秒里每台设备各发一个片段。非交织换来的是一个明确的时刻「对方整个包收完了」，固定回复时间与反序都建立在它之上；代价是轮次长得多：一个子轮就是一整列片段的长度，设备数直接乘上去，草案默认的 600 RSTU 时隙下，三个响应方的一对多轮次要 100 个时隙（50 ms），而交织形态是 52 个。测距块装不下时，本节下方会用红字说出来。',
    uwbFixedReply: '固定回复时间',
    uwbFixedReplyHint: 'macMmsFixedReplyTime：应答方不再等到自己子轮的开头才发，而是在收完对方整个 MMS 包之后，固定这么久再发（4ab 草案 15-25/0224r2、15-25/0681r1）。取值 300…612000 RSTU（约 0.25…510 ms），下界 300 RSTU 正是一个 MMS 测距时隙的最小长度；按回车或移开焦点生效，越界的值不会被保存。它把回复时间从「排定的」改成「约定的」：两端各自从同一个常量算出同一个时刻，发起方不必再等时隙边界。',
    uwbFixedReplyBad: '固定回复时间需要一个 300…612000 RSTU 之间的整数（约 0.25…510 ms）',
    uwbFixedReplyInterleaved: '固定回复时间只属于非交织模式：它从收完对方整个 MMS 包起算，而交织时两端在同一毫秒里各发一个片段，根本没有这样一个「收完了」的起点（4ab 草案 15-25/0224r2、15-25/0556r2）',
    uwbFixedReplyOneToMany: '固定回复时间是一对一的：草案把它放在 One-to-one Response Compact 帧里，而一对多时一个共用的常量会让每个应答方在同一时刻一起发（4ab 草案 15-25/0224r2）',
    uwbFixedReplyReversed: '反序下应答方就是开场先发包的那一方，而固定回复时间要的正是「收完对方的包」这个起点——一台设备同时当不了这两个角色。这是本仿真器的自洽规则，不是草案的禁令：草案把这两个位放在同一个八位组里，并没有禁止同时置位',
    uwbReversed: '反序轮次',
    uwbReversedHint: '让应答方先发自己的 MMS 包，发起方随后（4ab 草案 15-25/0556r2）——发起方自进入测距阶段起偏移 600 RSTU 再发，本引擎把这个偏移放在它自己的子轮内。它换的是角色：先发的那一方量到的是往返时间，后发的量到的是回复时间，于是「谁算得出距离」也跟着换到另一边。',
    uwbReversedInterleaved: '反序只属于非交织模式：交织时两端在同一毫秒里各发一个片段，没有「谁先发」可以调换（4ab 草案 15-25/0556r2）',
    uwbReversedFixedReply: '固定回复时间已经打开：它要的起点是「收完对方的包」，而反序会让应答方成为开场先发的那一方，两者在同一台设备上互相排斥。要用反序，先关掉固定回复时间',
    uwbSsbd: 'SSBD',
    uwbSsbdHint: '频谱感知延后（spectrum sensing based deferral, SSBD）：标准 §10.45（一条草案条款）给窄带发射定的信道接入方法之一——每一个窄带发射时隙上各自感知一次信道，判忙则按线性增长的随机退避再等一次，退避次数用尽后由下面的收尾动作决定这次尝试怎么结束。默认关闭：关闭时维持既有的先听后发规则——一次忙检测让本设备在整个测距块剩余时间内不再发送窄带帧。',
    uwbSsbdUwbdOnly: 'UWB 驱动配置（配置 1）没有窄带电台：没有信道可以感知，与窄带信道、先听后说被置灰的理由相同',
    uwbSsbdNeedsLbt: '先听后说关闭时没有 CCA 可以跑：SSBD 是「需要先听时」使用的信道接入方法之一。请先把先听后说改成自动或始终开启',
    uwbSsbdMinBf: '退避因子下界',
    uwbSsbdMinBfHint: '退避因子（backoff factor, BF）的初值下界：还没有发生忙检测之前，一次新尝试的 BF 就取这个值。标准 §10.45 给的取值范围是 1…63（CID 489 把原来的 1…31 改宽）。',
    uwbSsbdMaxBf: '退避因子上界',
    uwbSsbdMaxBfHint: '退避因子每判一次忙就加一，到这个值封顶。标准 §10.45 给的取值范围同样是 1…63。',
    uwbSsbdMaxBackoffs: '最大退避次数',
    uwbSsbdMaxBackoffsHint: '算法自己给这次尝试计的忙检测次数——每次新尝试置 0——允许达到的上限，超过之后由收尾动作决定这次尝试怎么结束。标准 §10.45 给的取值范围是 0…255。',
    uwbSsbdUnit: '退避单位',
    uwbSsbdUnitHint: '一个退避单位的时长：每次忙检测之后延迟的是这个数乘以一次 0…退避因子的均匀抽样。标准 §10.45 给的取值范围是 1…63 µs（同一条 CID 489 改宽的范围）。',
    uwbSsbdTxOnEnd: '退避次数用尽后照发',
    uwbSsbdTxOnEndHint: '退避次数用尽时的收尾动作：勾选即标准说的 TxOnEnd——算法仍以 Success 结束，窄带帧照常发出；取消则是 FailOnEnd——算法以 Failure 结束，这次尝试没有窄带帧发出，相当于一次信道接入失败。',
    uwbNbNoRadio: 'UWB 驱动配置（配置 1）没有窄带电台：三条控制消息都改成了 UWB 物理层上的 SP0 包，窄带信道列表与先听后发在这里没有任何东西可以作用（4ab 草案 15-25/0194r0）',
    uwbMmsSsOnly: 'MMS 采用单边测距，再用片段序列自己量出的时钟比率加以修正——有了这把长达毫秒的“尺子”，双边测距已无可抵消之物，因此没有 MMS 版的 DS-TWR 可选',
    uwbMmsDerived: (rsfUs, longestUs, fragDbm, slots, roundMs) =>
      `RSF ${rsfUs} µs · 最长片段 ${longestUs} µs，${fragDbm} dBm · 每轮 ${slots} 个时隙 · ${roundMs} ms`,
  },
  inspector: {
    waiting: '等待仿真…', bssTotals: 'BSS 总览 — 点击节点或泳道查看详情',
    throughput: '吞吐量', delivered: '已交付', collisions: '碰撞次数', retries: '重传次数',
    node: '节点', ok: '成功', rty: '重传', airtime: '空口占比',
    lat: '时延', latHint: '该节点所发帧的平均交付时延：进入队列 → 被确认',
    width: '信道带宽', nss: '空间流',
    linkName: { '2g': '2.4 GHz 链路', '5g': '5 GHz 链路', '6g': '6 GHz 链路' },
    acHeader: { ac: 'AC', bo: '退避', cw: 'CW', queue: '队列' },
    acHint: 'EDCA 接入类别（BK=后台，BE=尽力而为，VI=视频，VO=语音）',
    boHint: '当前退避时隙计数', cwHint: '竞争窗口：退避值从 [0, CW] 均匀抽取',
    queueHint: '该接入类别队列中的帧数——正在发送的帧在收到 ACK 之前仍计入队列',
    backoffCounter: '退避计数器', cw: 'CW', ssrcSlrc: 'QSRC',
    ssrcHint: '最近一次失败的接入类别的重传计数器（802.11-2020）。每次失败使 CW 翻倍，成功后清零；另外每个帧单独计数重传次数，重传 7 次后丢弃。',
    nav: 'NAV', navHint: '网络分配矢量：来自侦听到的 Duration 字段的虚拟载波侦听',
    navIdle: '空闲', left: '剩余',
    ifs: 'IFS', ifsHint: '正在进行的帧间间隔：DIFS/AIFS（竞争）或 EIFS（收到损坏帧之后）',
    cca: 'CCA', ccaHint: '物理载波侦听：能量 ≥ −62 dBm 或可解码前导 ≥ −82 dBm',
    busy: '忙', idle: '空闲',
    txop: 'TXOP', txopHint: '传输机会：无需重新竞争、以 SIFS 相连的连续帧交换，上限为该 AC 的 TXOP 限值',
    transmitting: '发送中', receiving: '接收中', queue: '队列', old: '前', more: '更多',
    receivingFrom: (kind, from) => `${kind} 来自 ${from}`,
    inFlight: '已发出',
    stats: '统计', framesDelivered: '成功交付帧数', retriesDrops: '重传 / 丢弃', collisionsL: '碰撞',
    airtimeShare: '空口占比', rxThroughput: '接收吞吐量',
    txLatency: '发送时延', txLatencyHint: '帧进入本节点队列到收到 ACK/BlockAck 的平均 / 最大时间——包含排队、AIFS、退避与全部重传；被丢弃的帧不计',
    rxLatency: '接收时延', rxLatencyHint: '发往本节点的帧的平均 / 最大交付时延，从发送方的队列开始计时',
    appRtt: 'RTT（ping）', appRttHint: '本终端向云服务器发送的 ping 的平均 / 最大往返时延：每秒 4 次、走该业务的接入类别、服务器即时回显——Wi-Fi 上行、广域网、Wi-Fi 下行，即游戏里显示的 ping 值',
    relayLatency: '手机互传', relayLatencyHint: '另一部手机发给本机的视频帧的平均 / 最大时延：发送方队列 → AP → 本机，两跳 Wi-Fi 加 AP 转发',
    servers: '云服务器', serverCols: { server: '服务器', kind: '类型', rtt: '广域网 RTT', up: '上行', down: '下行' },
    ampTag: 'AMP 标签', aboc: 'ABOC',
    abocHint: 'AMP 退避计数器：每次随机接入触发时从 [0, ACW] 均匀抽取；ABOC < N 则选中时隙 ABOC + 1',
    slot: '时隙', slotHint: '该标签在本轮将使用的上行时隙',
    ampCounts: '发送 / 已确认 / 丢失',
    ampCountsHint: '已发送的应答数、被随后的 AMP Ack 确认的数量，以及丢失的数量（碰撞、信号弱或错过时机）',
    ampRound: 'AMP 轮次', ampRoundHint: '该链路上正在进行的轮询轮次，以及目前已应答的标签',
    ampPhase: { random: '随机接入', scheduled: '调度' },
    satOut: '弃权 / 已听到',
    bsCounter: '时隙计数器',
    bsCounterHint: 'EPC Gen2 时隙计数器：收到 Query 时从 [0, 2^Q − 1] 均匀抽取；每收到一个 QueryRep 减一，减到 0 时标签反射自己的 RN16',
    bsInventoried: '已盘点', bsYes: '是', bsNo: '否',
    bsInventoriedHint: '读写器已在本会话中读到该标签的 EPC，因此它会保持沉默，直到出现新的会话号',
    bsReplies: '反射次数 / 碰撞次数',
    bsRepliesHint: '该标签已反射出的应答数，以及其中有多少次与另一个标签落在同一时隙',
    bsSnr: '读写器处余量',
    bsSnrHint: '上一次反射高出读写器自身泄漏底噪多少；在 250 kb/s 下要有 3 dB 才能解调，更快的 1 Mb/s 应答则要 9 dB',
    inventory: 'RFID 盘点', session: '会话',
    inventoryHint: '正在进行的 EPC Gen2 盘点：会话号、正在开放的时隙，以及本次 TXOP 读到的标签数 / 碰撞时隙数 / 空时隙数',
    inventoryLast: '上一次盘点',
    inventoryLastHint: '刚刚结束的那次 TXOP 的统计——读到的标签数 / 碰撞时隙数 / 空时隙数，以及这次会话在 2^Q 个时隙中走到了第几个；在下一次轮询之前，读写器只是在听着整个房间',
  },
  uwb: {
    anchor: '锚点', tag: '标签', role: '角色',
    blockRound: '测距块 / 轮次', slot: '测距时隙', timeouts: '超时时隙',
    rmnr: '测距消息未收到帧', rmnrHint: '这些时隙并非沉默：响应方仍持有一条有效的控制消息，只是没收到本轮的测距启动消息，于是发了一帧 RMNR 代替沉默——打开 RMNR 后，这部分原本会计入上面“超时时隙”的轮次改记在这里',
    mmrcm: '收妥确认帧', mmrcmHint: '响应方回来的收妥确认（MMRCM）帧数，记在发起方这一侧：请求只占用控制消息里本来就有的一位，不多花一个字节，花钱的是这些回答——每一帧里带着一张位图，说明本有效期窗口里你发出的那几条开场消息它收到了哪几条；哪一块丢了，位图里那一位就是 0，而超时只能说“没来”',
    sp3: 'SP3 测距标记', sp3Hint: '发起方在测距相位收到的 SP3 测距标记帧数（标准 §10.32.8.2），记在发起方这一侧：这种包只有 SYNC、SFD 与 STS，没有 PHR 也没有载荷，帧里没有任何身份字段——发起方只能按排定的时隙表反推这一帧是谁发的。打开 SP3 之后，这一面板其余各行与 SP1 轮次读起来一模一样，时隙与距离都照旧，只有这一行说得出测距相位里的帧其实什么都没带',
    sp3Reports: 'SP3 测量报告帧', sp3ReportsHint: '发起方收到的 SP3 测量报告帧数（标准 §10.32.8.1 的第三相位），同样记在发起方这一侧：标记帧没有载荷，它量到的时间、以及 SRRR 请求过的方位角与往返时间，都要靠这一相位另发的帧送回来。这两行要一起看——测距相位省下来的空口时间，是在这一相位里付掉的',
    ancillary: '辅助信息分片', ancillaryHint: '本端收到的测距辅助信息分片数（标准 §10.35）。这一节把两个角色名反过来用了：发辅助信息的那一端叫发起方，收的那一端叫响应方——与测距里的同名词正好相反，所以这一行记在测距的发起方（标签）这一侧，而发分片的是测距里作答的那一端（锚点）',
    ancillaryMissing: '按剩余帧数查出的缺帧', ancillaryMissingHint: '本端凭 RAICT 信息元的 Frames Remaining 字段断定从未到达的分片数（标准 §10.35.2.1）：每一个分片都报一次「这条消息还剩几帧」，所以读到 3 之后读到 1，就知道报 2 的那一帧没来——在后一帧到达的那一刻就知道，不等任何东西。分片的等待是静默的，上面的超时行不会为缺帧动，所以这两行要一起看',
    interfered: '被 Wi-Fi 干扰丢失',
    contend: '竞争抽取', contendHint: '该锚点在最近一个竞争轮次中抽到的响应时隙，以及这是它第几次尝试让标签听到自己',
    contendDraw: (slot, attempt) => `时隙 ${slot} · 第 ${attempt} 次尝试`,
    contendSitOut: '本轮空过',
    contendCollisions: '碰撞时隙数', contendCollisionsHint: '该标签因两个锚点选中同一响应时隙而丢失应答的时隙数；即使其中较强的一路高出 6 dB 被成功捕获，另一路应答仍然丢失，因此同样计入',
    ranges: '测距结果', peer: '对端', measured: '实测', trueDist: '真值', error: '误差',
    fom: '置信度', rounds: '轮次',
    tdoa: '到达时间差',
    tdoaAgainst: (ref) => `相对 ${ref}`,
    tdoaHint: '单向测距不测距离：每一行是该锚点的消息比参考锚点晚到多少，这把标签定在两个锚点之间的一条双曲线上',
    aoa: '到达角测量',
    aoaHint: '该锚点看到标签的方位角，以自身正前方为 0°、向其左侧为正；它来自锚点两根天线之间的相位差，与飞行时间无关',
    aoaSigma: '1-σ',
    aoaRowHint: '方位角的 1-σ 为 σ_φ/(π·cos θ)：正前方约 2.7°，60° 处翻一倍，±90° 处发散——那里标签再转动也不会改变相位差。真实方位角超过 ±90° 说明标签在锚点背后，测量结果会被镜像到正前方一侧。',
    fomWithin: (pct, ns) => `${pct} % 的误差落在 ${ns} ns 内`, noFom: '无 FoM',
    position: '位置解算', estimate: '估计值', gdop: '几何精度因子 GDOP', ellipse: '误差椭圆（1-σ）',
    noPosition: '尚无定位结果——标签需要在同一测距块内拿到三个锚点的距离',
    noPositionTdoa: '尚无定位结果——标签需要在同一测距块内拿到三个到达时间差',
    methodLabel: '解算方式',
    method: {
      twr: '双向测距 (TWR)', 'dl-tdoa': '下行到达时间差 (DL-TDoA)', 'ul-tdoa': '上行到达时间差 (UL-TDoA)',
      aoa: '到达角 (AoA)',
    },
    trains: '片段序列',
    trainsHint: '多毫秒测距把测距信号拆成一串短片段发出（成对轮次里每毫秒一个，一对多时每台设备一个时隙的间隔），接收机把它们叠加起来：N 个片段带来 10·log10(N) dB 的增益，余量一列里已经算进了这份增益。时钟比例是用整串片段的长度，量出对端时钟相对本机时钟的快慢。',
    trainKindCol: '序列', trainHeard: '听到', trainMargin: '余量', trainDetected: '合成结果',
    trainRatio: '时钟比例',
    trainYes: '检出', trainNo: '丢失',
    responders: '一对多',
    respondersHint: '本轮次包含的响应方，按时隙顺序排列——也就是发起方那条一对多 POLL '
      + '点名的列表。发起方的片段序列只发一次，这些响应方全都能听到；每一个又在属于自己的窄带窗口和测距时隙里回应，'
      + '因此标签只用一个轮次就能得到到每一个锚点的距离。成对轮次只有一个响应方，不显示这一行。',
    respondersOf: (ids) => ids.join('、'),
    trainKind: (kind, fragments) => `${fragments} × ${kind.toUpperCase()}`,
    trainNothing: '—',
    nbChannel: '窄带信道',
    nbChannelHint: '本次会话的控制面——轮询、响应和测量报告——所在的 2.5 MHz 信道。它按测距块在允许列表中跳变。',
    nbChannelAt: (channel, centerMhz) => `${channel} · ${centerMhz.toFixed(2)} MHz`,
    lbtBusy: '先听后发',
    lbtBusyHint: '检测到窄带信道忙的次数，以及因此损失的测距块：一次忙检测会让该设备在本块内不再发出任何窄带消息，而没有轮询就没有整个测距周期',
    lbtBusyCount: (checks, blocks) => `${checks} 次忙 · 跳过 ${blocks} 个块`,
    ssbd: '频谱感知延后',
    ssbdHint: '按标准 §10.45（一条草案条款）做的信道接入：每一个窄带发射时隙上各感知一次，'
      + '判忙则按线性增长的随机退避再等一次，退避次数用尽后由收尾动作决定是照发还是算一次信道接入失败。'
      + '这一行数的是感知次数、实际等掉的总时长，以及其中有多少次没能发出去。'
      + '它与上一行的「先听后发」是两条路，不会同时走：那一条的单位是整个测距块，这一条的单位是一个时隙。',
    ssbdCount: (checks, waitNs, failed) => `${checks} 次感知 · 共等 ${(waitNs / 1000).toFixed(1)} µs`
      + (failed === 0 ? '' : ` · ${failed} 次接入失败`),
    integrityOk: '完整性序列已验证本次测距',
    integrityBad: '未检出完整性序列——本次测距未经验证',
    ellipseHintAoa: '单锚点定位的椭圆，其两条轴来自两种互不相干的测量：沿视线方向是测距本身的 σ（100 ps 时为 2.1 cm），垂直视线方向则是 r·σ_θ——4 米正前方约 19 cm，偏向两侧还会更大。因此在任何有意义的距离上，椭圆都是一条横跨视线的细长条。此外方位角是水平的、而测距是斜距，因此定位时沿视线走的是这个直角三角形的水平边 √(r² − Δz²)（Δz 按标签配置的高度计算）——这也是为什么装在天花板上的锚点，其定位十字会落在自己的测距圆环内侧一点。',
    ellipseHintTdoa: '单向定位的椭圆按一个时间差真正包含的误差画出：两个带噪声的时间戳，再加上 DL-TDoA 中各响应锚点的时钟偏差估计残差（响应时隙越靠后越大），或 UL-TDoA 中锚点之间的同步标定误差。这是一阶近似：锚点的同步误差是固定偏差，不是多轮平均就能消掉的噪声，因此该椭圆只表示定位可能偏离多远，而不是严格的 68 % 置信区间。',
  },
  log: { empty: '窗口内无事件' },
  profiles: {
    video: '视频流（下行，AC_VI）', voice: '语音通话（双向，AC_VO）', gaming: '在线游戏（实测王者荣耀：上行约 33 帧/s，下行 15 Hz）', p2pvideo: '向另一部手机传视频（经 AP，AC_VI）', backup: '云备份（上行，AC_BK）',
    browsing: '网页浏览（AC_BE）', iot: '物联网传感器（AC_BK）', saturated: '饱和上传（AC_BE）', idle: '空闲',
  },
  appShort: { video: '视频', voice: '通话', gaming: '游戏', p2pvideo: '投送', backup: '备份', browsing: '网页', iot: '传感', saturated: '上传', idle: '' },
  serverKinds: { video: '视频（流媒体）', web: '网页 / 云', call: '通话', game: '游戏' },
  generations: {
    nonht: '802.11a（传统）', vht: 'Wi-Fi 5 (VHT)', he: 'Wi-Fi 6 (HE)', eht: 'Wi-Fi 7 (EHT)',
  },
  features: {
    edca: 'EDCA（QoS 接入类别）', ampdu: 'A-MPDU 聚合 + BlockAck', txop: 'TXOP 突发',
    ofdma: 'OFDMA（多用户调度）', mumimo: 'MU-MIMO（空分多用户）', mlo: '多链路操作 (MLO)', qam4k: '4096-QAM (MCS 12/13)',
  },
  frameDetail: {
    title: '📨 帧详情',
    close: '返回节点视图',
    clickedRx: (lane) => `你点击的是接收方——泳道「${lane}」正在收听这帧，同一时刻发送方正在发出它。`,
    kindName: {
      data: '数据帧', ack: 'ACK — 确认帧', rts: 'RTS — 请求发送',
      cts: 'CTS — 允许发送', ba: 'BlockAck — 块确认',
      trigger: 'Trigger — 触发帧', mba: '多站点 BlockAck', cfend: 'CF-End — 提前结束',
      ampTrigger: 'AMP 触发帧', ampAck: 'AMP 确认帧', ampResp: 'AMP 应答帧',
      ampRfid: 'AMP RFID 命令帧', ampBsReply: '反向散射应答',
      uwbPoll: 'UWB 轮询帧', uwbResp: 'UWB 响应帧', uwbFinal: 'UWB 终结帧', uwbReport: 'UWB 测量报告帧',
      uwbSsDefer: 'UWB 延后报文',
      uwbInit: 'UWB 测距启动帧',
      uwbM2m: 'UWB 多对多测距帧',
      uwbRmnr: 'UWB 测距消息未收到帧（RMNR）',
      uwbBlink: 'UWB 闪发帧',
      uwbRsf: 'MMS 测距片段（RSF）',
      uwbRif: 'MMS 完整性片段（RIF）',
      nbPoll: '窄带 POLL',
      nbResp: '窄带 RESP',
      nbReport: '窄带 REPORT',
      uwbSp0: 'SP0 控制帧',
      uwbMmrcm: 'UWB 多消息收妥确认帧（MMRCM）',
      uwbSp3: 'SP3 测距标记',
      uwbAncillary: 'UWB 测距辅助信息帧（RAICT）',
    },
    whatIs: {
      cfend: 'TXOP 持有者把时间还回去。它的 RTS/CTS 已把信道预约到 TXOP 结束，但突发提前发完了，于是用这一帧告诉所有解出它的站点：现在就可以撤销那段预约。若发送者是终端，AP 会在一个 SIFS 后重复一遍，让小区另一侧也听到释放。',
      data: '真正运载数据的帧——你的视频、网页、备份等字节就装在里面通过空口传输。时间轴上的其它一切，都是为了让这样的帧安全送达。',
      ack: '一张小小的回执。Wi-Fi 电台发送时无法同时收听，自己永远不知道帧有没有送到——必须由接收方用这条简短的「收到，完好」来确认。收不到 ACK，发送方就认定丢失并重传。',
      rts: '在长数据帧之前先发的一句「我能讲话吗？」。它很短，即使碰撞也只损失这几个字节；而且它的 Duration 字段能让离数据发送方太远、听不到它的站点（隐藏节点）也保持安静。',
      cts: '「可以，请讲」——对 RTS 的回答。它从接收方一侧把预约再广播一遍，让接收方附近的站点也知道要保持安静。',
      ba: '整批数据的一张回执：接收方不再逐帧回 ACK，而是返回一张位图，标明 A-MPDU 聚合中哪些子帧收到了。只有缺失的子帧才需要重发。',
      trigger: 'AP 扮演指挥家（Wi-Fi 6 OFDMA）：把信道切成若干频率子块（资源单元 RU），邀请多个终端在同一时刻各自在自己的子块里发送。',
      mba: '发给多个站点的一张合并回执：一轮同时进行的 OFDMA 上行结束后，AP 用这一帧统一确认所有终端的数据。',
      ampTrigger: 'AP 按 P802.11bp 草案发送的环境能量触发帧：以慢速通断键控（OOK）PPDU 划出 N 个上行时隙，并规定标签如何从中选定一个——随机竞争还是按预定顺序。无电池的标签没有普通 Wi-Fi 接收机，正是这一帧才让一轮能够开始。',
      ampAck: 'AP 对某个 AMP 上行时隙的确认帧：同样由 AP 正常供电发出的 OOK PPDU，用来关闭它所确认的、由标签以收集到的能量主动发射作答的那个时隙。按照 P802.11bp 草案，没有自己时钟的标签靠数这些确认帧来判断时隙何时打开，因此每一帧同时也在提示下一个时隙。',
      ampResp: '标签在自己 AMP 上行时隙里的应答，用从 AP 载波上收集到的能量发送，而不是电池供电。按照 P802.11bp 草案，这一帧尽量精简——只有 ID，以及触发帧要求时才附带的一次传感器读数——这样收集到的能量刚好够发完。',
      ampRfid: '读写器发给反向散射标签的命令：一条 EPC Gen2 命令——Query、QueryRep、ACK、Read、Write——被装进 P802.11bp 的 AMP RFID 帧里。整个 PPDU 里大部分时间根本不是数据而是载波：先是至少一毫秒的唤醒激励，把标签供上电；命令之后还有第二段激励，标签就靠反射它把答案送回去。',
      ampBsReply: '标签在完全没有发射机的情况下作答。它没有振荡器，只是让天线在两种阻抗之间来回切换，于是读写器自己的载波被调制后反射回来，功率还低了约 6 dB。这个信号在房间里往返了两趟，回到读写器时远低于普通接收机能容忍的噪声——所以决定它能传多远的，是读写器的自泄漏和动态范围，而不是它的发射功率。',
      uwbPoll: '标签用它开启一轮测距：一帧广播的 UWB 帧，列出参与的锚点及其时隙顺序。它的发送时刻由标签自己的测距计数器读出，是后续所有距离计算的第一个时间戳。',
      uwbResp: '某一个锚点在它自己的测距时隙里的回答。在 SS-TWR 下，它还会带上锚点测得的回复时间，标签靠它才能从往返时间里减去锚点的处理时延。',
      uwbSsDefer: 'SS-TWR 延后回复时间下，锚点发响应帧的那一刻还不知道自己这次发送的时间戳，只能先空手作答。等它把发送时刻真正读回来，才用这一帧单独补给标签——回复时间因此是一条独立的消息，占自己的时隙，而不是响应帧的一部分。',
      uwbInit: '标签开启每一轮测距，本来要靠一帧轮询帧同时做两件事：告诉各锚点这一轮谁在哪个时隙答（配置），并打下这一轮计时的第一个时间戳（启动）。当更早一轮轮询帧定下的时隙表还在有效期内，标签就只发这一帧——没有 ARC，没有 RDM，只剩启动这一半。标准里这两件事本来就是两帧（§10.34 的插图画的正是两帧），本仿真器只在有效期开始的那一轮把它们合成一帧；往后的几轮，这一帧才是两者之中仍然要发的那一个。',
      uwbM2m: '多对多测距里，每台设备只发这一种帧：带着自己的发送时刻，加上它听到的、排在它前面每一个参与者的到达时刻。对排在它后面的参与者，这一帧是「问」；对排在它前面的参与者，它自己就是「答」——一次发送顶两份活，N 台设备因此只需要 N 个时隙，就能量出全部 N(N−1)/2 条距离，而不必像轮流当标签那样耗费 N² 个。',
      uwbRmnr: '响应方手里还握着一条仍然有效的控制消息，却没收到这一轮的启动消息——它不像沉默超时那样把自己的时隙空出来，而是在里面发出这一帧。RMNR 信息元没有任何内容字段，它携带的两条信息全靠「发在哪、什么时候发」来传递：发出来这件事本身，就是「你的控制消息我收到了」；发的是 RMNR 而不是一次按时的回答，就是「这一轮的启动消息我没收到」。',
      uwbFinal: '标签在 DS-TWR 一轮末尾发出的帧：广播它测得的往返时间和回复时间，让每个锚点能把它们与自己的一对时间合并，把两边时钟的偏差一起抵消掉。',
      uwbReport: '锚点的测量报告：其中是只有它自己能测到的那两个时间。它们和终结帧里的数字合在一起，恰好凑齐该锚点的 DS-TWR 四时间戳等式。',
      uwbBlink: '标签的闪发帧：十四个字节，每个测距块发一次，仅此而已。它不携带任何时间——由各锚点在共享时基上给它的到达时刻打戳，这些时刻之差就定出了标签的位置。',
      uwbRsf: '多毫秒测距序列中的一个片段（802.15.4ab 草案）：一段重复的 MMRS 符号，每毫秒发一个。单独看它可能弱得根本听不见——接收机把整串片段叠加起来，十六个片段就是十二分贝的增益。',
      uwbRif: '完整性序列中的一个片段（802.15.4ab 草案）：一段 STS，唯一的任务是证明刚才那次测距没有被重放或伪造。',
      nbPoll: '发起方开启一次窄带辅助测距轮（802.15.4ab 草案）。围绕测量的一切——谁和谁测距、什么时候测——都走 5–6 GHz 上那个 250 kb/s 的慢速窄带电台，而不是 UWB 电台。',
      nbResp: '响应方对窄带 POLL 的答复（802.15.4ab 草案）：它听到了轮询，并将在随后的测距阶段发出自己的片段序列。',
      nbReport: '一份窄带测量报告（802.15.4ab 草案）：响应方测得的回复时间，或发起方测得的周转时间——计算距离所需的数字，由控制电台而非 UWB 电台携带。',
      uwbSp0: '同一套控制消息——轮询、响应、测量报告——但这台设备没有窄带电台（802.15.4ab 草案的配置 1）。于是它们改成 SP0 基本包，走 UWB 电台本身。代价写在链路预算里：SP0 比测距包自带的那段 SYNC+SFD 更长、峰值功率更低，捕获门槛要差约 4 dB，所以有它在的时候，是它决定这一轮能不能建立起来。',
      uwbMmrcm: '多对多测距里，一个参与者只知道自己算出了到谁的距离，却不知道谁听见了自己——控制器可以在轮询帧里请求一次确认（标准 §10.36），这个请求本身不花一个字节，因为它只是 ARC IE 控制字里早就有的那两个字节中的一位。花钱的是这一帧：响应方把它在当前控制消息有效期窗口里，收到了该发起方的哪几条开场消息，逐发起方列成一张位图回送过去。',
      uwbSp3: 'SP3 包（标准 §10.32.8）只有 SYNC、SFD 与 STS：没有 PHR，也没有载荷。'
        + '所以它是标准里最短的测距帧——约 141 µs，比最短的那种 SP1 响应短约 40 µs——'
        + '而同一个原因让它什么也装不了：既装不下身份，也装不下时间戳。'
        + '身份由时隙决定，轮询帧里的 RDM IE 事先排定哪个时隙归谁；'
        + '时间要等到随后的测量报告相位，由另一帧用 RMI IE 送回来。',
      uwbAncillary: '测距辅助信息交换（标准 §10.35）里 Request 位为 0 的那一半：这一帧装着一枚 RAICT 信息元'
        + '（Ranging Or Ancillary Information Counter and Type IE，标准 §10.35.2.1）。内容字段只有一个控制字节，'
        + '外加两个可选字节——消息号和剩余帧数——各自由控制字节里的一个存在位决定在不在，所以这枚信息元的长度'
        + '是一到三个字节，不是固定的。一条装不进一帧的消息就靠这个剩余帧数字段，一帧一帧地数下去。',
    },
    next: {
      cfend: '所有解出它的站点都会清零 NAV，安静一个 DIFS/AIFS 后即可重新竞争。听不到它的站点则要一直等到自己听到的那段预约自然结束。',
      data: '若完好到达，接收方会在恰好一个 SIFS（16 µs——Wi-Fi 里最短的间隔，短到没人能插队）之后回 ACK 或 BlockAck。若无回音，发送方超时后把竞争窗口翻倍并重传。',
      ack: '这次帧交换到此完成。被 Duration 字段压制的站点解除 NAV 计时器，等待一个 DIFS/AIFS 的安静期后继续退避倒数——信道争夺重新开始。',
      rts: '被叫站点会在一个 SIFS 后回复 CTS。若 CTS 没来，损失的只是这短短一帧，发送方可以低成本重试。',
      cts: '数据帧将在一个 SIFS 后发出，在 RTS/CTS 刚刚预约好的安静窗口内传输。',
      ba: '位图中标记缺失的子帧被发送方重新入队；确认过的就算送达。之后信道竞争恢复。',
      trigger: '一个 SIFS 之后，所有被邀请的终端同时发送，各自在自己的 RU 内、严格按分配的时长进行；随后 AP 用多站点 BlockAck 统一确认。',
      mba: '这轮上行 OFDMA 到此结束；各终端把未被确认的数据重新入队，正常竞争恢复。',
      ampTrigger: '选中某个时隙的标签会在该时隙内用 AMP 应答帧作答；AP 依次确认每一个时隙，无论该时隙是否真的有标签应答。P802.11bp 草案正是靠这种「先应答、后确认」的节奏来化解竞争——标签根本不具备载波侦听能力。',
      ampAck: '轮次会被这一帧本身提示进入下一个时隙，或者在所有时隙都被应答并确认后结束。按照 P802.11bp 草案，标签没有自己的时钟，只能靠数这些确认帧来判断该在什么时候发送。',
      ampResp: '一个 SIFS 之后，AP 会为这个时隙发送一个确认帧，无论该时隙里是否真的有标签应答——沉默也是一种结果。P802.11bp 草案对触发帧打开的每个时隙都重复这一过程，之后要么结束这一轮，要么由 AP 开启新一轮。',
      ampRfid: '凡是时隙计数器已经减到 0 的标签，都会在这个 PPDU 末尾那段激励里把答案反射回来——没有单独的上行，也不用等待任何间隔。随后读写器直接发出下一条命令：按照 P802.11bp 草案，反向散射应答之后不跟确认帧，因为下一条命令本身就是确认。',
      ampBsReply: '读写器要么听见了，要么没听见，然后继续往下走：若只有一个应答被正确解出，就发 ACK 点名这个标签的随机数；若两个标签撞在一起或者根本没有回应，就发下一个时隙的 QueryRep。等所有时隙都发完、或者 TXOP 用尽，这一轮就结束。',
      uwbPoll: '各个锚点按轮询帧分配的测距时隙依次作答。某个时隙如果一直沉默，就是一次超时：该锚点这一轮不贡献距离。',
      uwbResp: '在 SS-TWR 下，标签此时已经拿齐所需的一切，可以直接算出距离。在 DS-TWR 下，它会等所有锚点答完，再发出终结帧。',
      uwbSsDefer: '标签收到这份回复时间，从对该锚点的往返时间里减去它，就算出了到这个锚点的距离。各锚点的延后报文互不相干，谁先送到，标签就先测出到谁的距离。',
      uwbInit: '各个锚点照着更早一轮轮询帧给出的时隙表依次作答，就像那张表刚刚又发过一遍——配置没有变，只是没有再重复它。某个时隙如果一直沉默，仍然记一次超时；若该响应方开着测距消息未收到，它会改发那一帧，而不是沉默。',
      uwbM2m: '排在它前面的每一个参与者，此刻手里已经凑齐了算这一对距离要用的全部四个时间戳，立刻能算出到它的距离；排在它后面的参与者还算不出来——要等到自己发送的那一刻才轮到它们把这一帧收进自己的时刻表。下一个参与者在下一个测距时隙接着发送，直到最后一个发完，这一轮的 N(N−1)/2 条距离才算齐。',
      uwbRmnr: '发起方由此把「这个锚点没收到启动消息」从「它不在了」或「它的回答丢了」里分出来——换作沉默超时，这三种情形在发起方看来毫无分别。这个锚点这一轮不贡献距离，但它的控制消息仍然有效：下一轮它还会照着原来的时隙表照常作答。',
      uwbFinal: '每个听到它的锚点都会在自己的时隙里回一帧测量报告；标签随即就每个锚点都集齐了四个时间戳，可以换算成距离。',
      uwbReport: '标签就该锚点完成 DS-TWR 计算。当足够多的锚点都报告完毕，它就解出自己的位置，这一轮结束；下一轮在下一个测距块开始。',
      uwbBlink: '标签在这个块剩下的时间里保持沉默。每个听到闪发帧的锚点把自己的到达时刻交给基础设施，由后者作差并代替标签解出位置。',
      uwbRsf: '一毫秒后下一个片段接着发出，接收机把它们逐个累加。序列结束时它清点听到了多少个，再判断合成后的能量是否越过了灵敏度。',
      uwbRif: '完整性序列的其余片段继续每毫秒一个地发出；若合成后足够强，这一轮的测距结果会带上完整性标志。',
      nbPoll: '两个时隙之后响应方以窄带 RESP 作答，紧接着就是 UWB 测距阶段——两串片段序列。',
      nbResp: '测距阶段开始：两台设备各自发出片段序列，每毫秒各一个，在同一毫秒内交错排列。',
      nbReport: '接收一方用片段序列给出的时钟比例完成单边飞行时间计算并记录距离；下一轮在下一个测距块开始。',
      uwbSp0: '这条消息扮演哪个角色，就接哪一段：轮询之后是响应方的 SP0 应答，应答之后是 UWB 测距阶段的两串片段，测量报告之后这一轮结束。整轮都在同一个 UWB 电台上，没有第二个电台可退。',
      uwbMmrcm: '被列在位图里的每个发起方，此刻才第一次知道这个响应方到底收到了自己哪几条开场消息——这件事本来谁都不会主动告诉它。位图之外的发起方毫无所获：它们没有被问到，这一帧也没有回答关于它们的任何事。',
      uwbSp3: '这一相位里的每个标记只留下一个到达时刻。等 SP3 测距相位按排定的时隙走完，'
        + '设备改回能带载荷的包格式，进入测量报告相位：被 SRRR IE 请求过的那几项——'
        + '方位角、往返时间、回复时间——由请求方与被请求方各自一帧发出。'
        + '多出来的那一帧，就是这个最短的测距帧要付的代价。',
      uwbAncillary: '接收端看剩余帧数就知道这条消息还差几帧——数字从某个值一路数到 0，到 0 的那一帧是这条消息的'
        + '最后一帧。如果中间缺了一帧，下一帧到达时剩余帧数不会接上缺口前那一帧的数字，接收端由此发现少了哪一帧，'
        + '不必等整条消息超时。',
    },
    nextTitle: '接下来会发生什么',
    from: '发送方', to: '接收方', everyone: '多个终端（多用户）',
    when: '开始时刻', whenHint: '第一个比特进入空口的仿真时刻',
    airtime: '空口时间',
    airtimeHint: '这帧占用信道的时长：先是固定的 PHY 前导码（供各电台同步），然后是 字节数 ÷ 速率。在此期间其他任何人的信号都无法被正确接收。',
    size: '大小',
    sizeHint: '空口上的总字节数：MAC 头 + 载荷 + 4 字节 FCS 校验和（接收方用它检测损坏）',
    rate: '速率',
    rateHintMcs: 'MCS = 调制编码方案，相当于链路的「档位」。MCS 越高，每个符号装的比特越多，但要求信号越干净。',
    rateHintLegacy: '控制帧和传统帧使用低速、稳健的速率，保证任何站点——哪怕最老的——都能解码。',
    ac: '优先级（AC）',
    acNames: ['后台 (AC_BK)', '尽力而为 (AC_BE)', '视频 (AC_VI)', '语音 (AC_VO)'],
    acHint: 'EDCA 接入类别：优先级越高，等待的间隔越短、抽取的退避越小，所以语音通常抢得过云备份。',
    duration: 'Duration 字段',
    durationHint: '帧头里预告了整个交换还要持续多久；所有侦听到它的站点会据此设置 NAV 计时器并在这段时间内保持安静——一种「广播即预约」的机制。',
    seq: '序列号',
    seqHint: '按目的地递增的计数器：若 ACK 丢失导致同一帧被发两次，接收方靠它识别重复。',
    retry: '重传',
    retryHint: 'Retry 位已置 1：这一帧之前发过一次但没有收到确认（碰撞或噪声），现在正在重发。',
    ampduTitle: (n) => `A-MPDU 聚合 — 一次突发携带 ${n} 帧`,
    ampduHint: '把许多数据帧拼进同一次发送：前导码和竞争等待只需付一次，而不是每帧一次。整批数据由一个 BlockAck 统一确认。',
    muTitle: (n) => `多用户载荷 — ${n} 个终端同时`,
    muHint: (kind) => kind === 'mumimo'
      ? 'MU-MIMO 让所有终端在同一时刻、相同频率、以完整带宽发送；下表每一行是一个终端的空间流——靠空间而不是频率子块来区分。'
      : 'OFDMA 把信道切成更小的频率子块（资源单元 RU）；下表每一行是一个终端的子块，全部同时传输。',
    muTo: '终端', muSize: '字节', muRate: '速率',
    ruNote: (kind) => kind === 'mumimo'
      ? '空分复用：与同组其它帧在同一时刻、相同频率、以完整带宽发送而互不干扰——它们占用不同的空间流。'
      : 'RU 正交：与同组其它帧同时发送而互不干扰——它们占用不同的频率子块。',
    fields: {
      title: '空口字段', hint: '逐字段的 MAC 头，以及 PPDU 如何分配它的空口时间',
      mpdu: (ty, sub, b) => `${sub}（${ty === 'Data' ? '数据帧' : ty === 'Ranging' ? '测距帧' : '控制帧'}）· ${b} B`,
      forUser: (dst) => `发往 ${dst} 的 PSDU`,
      subframes: (n) => `A-MPDU：${n} 个子帧`,
      firstShown: '第一个 MPDU 的字段：',
      subframeRow: (i, d, m, p) => `#${i + 1}：定界符 ${d} + MPDU ${m}${p ? ` + 填充 ${p}` : ''} B`,
      name: {
        fc: '帧控制（Frame Control）', duration: '持续时间（Duration）', addr1: '地址 1', addr2: '地址 2', addr3: '地址 3',
        seqCtl: '序列控制', qos: 'QoS 控制', body: '帧体（MSDU）', baControl: 'BA 控制',
        baInfo: 'BA 信息', commonInfo: '公共信息', userInfo: '用户信息列表', fcs: 'FCS 校验',
        ampId: 'ID（16 位 AMP 标识符）', ampTdc: '类型相关控制（TDC）', ampStaList: '终端 ID 列表',
        seqNo: '序列号', dstPan: '目的 PAN ID',
        dstAddr16: '目的地址（16 位）', srcAddr16: '源地址（16 位）',
        ieArc: 'ARC 信息元·高级测距控制', ieRdm: 'RDM 信息元·测距设备管理',
        ieRrmc: 'RRMC 信息元·测距轮次管理控制',
        ieRrti: 'RRTI 信息元·测距回复时间',
        ieRmi: 'RMI 信息元·测距测量信息',
        ieRcps: 'RCPS 信息元·竞争阶段时隙',
        ieRcma: 'RCMA 信息元·竞争最大尝试次数',
        ieTxTime: '发送时刻信息元·发送方自己的发送时刻',
        ieRxTimes: '接收时刻信息元·发送方掌握的各到达时刻',
        ieCoffs: '时钟偏差信息元·响应锚点相对锚点 0 的偏差',
        ieBlink: '闪发信息元·单向闪发帧的内容',
        ieRmnr: 'RMNR 信息元·测距消息未收到，无内容字段',
        ieRmmrc: 'RMMRC 信息元·多消息收妥确认',
        ieSrrr: 'SRRR 信息元·某个响应方请求报告哪几项',
        ieRaoa: '方位角项·数据报告相位带回的那个方位角',
        ieRaict: 'RAICT 信息元·测距辅助信息计数与类型',
        mmsFragment: '片段·第几个，共几个',
        mmsShape: '序列·这个片段由什么构成',
        mmsLength: '长度·一毫秒的能量花在多长的时间里',
        mmsPower: '发射功率·这一个片段自己的 EIRP',
        nbMsgId: '消息 ID·这是哪一种控制消息',
        nbChannel: '窄带信道·在哪个信道上发出',
        nbFields: '消息字段·草案表格中的其余字段，按字节计',
        nbTime: '测距时间·计算距离所用的那个数',
        nbResponders: '响应方列表·这一轮一对多测距是发给谁的',
        sp0Role: '消息角色·这是控制面的哪一条消息',
        sp0Fields: '消息字段·SP0 载荷里的其余字节',
      },
      bit: {
        protocolVersion: '协议版本', type: '类型', subtype: '子类型', toDs: 'To DS', fromDs: 'From DS',
        moreFrag: '更多分片', retry: '重传', pwrMgt: '电源管理', moreData: '更多数据',
        protected: '加密', htc: '+HTC',
      },
      role: { RA: '接收端', TA: '发送端', DA: '目的地址', SA: '源地址', BSSID: 'BSSID' },
      broadcast: '广播',
      ppdu: 'PPDU 结构', ppduHint: '先是前导码和 PHY 头，然后是承载 PSDU 的数据符号',
      segment: {
        legacyPreamble: 'STF + LTF', signal: 'SIGNAL', preamble: '前导码', muSig: 'SIG-B / EHT-SIG',
        data: '数据', padding: '填充 / PE',
        usig: 'RL-SIG + U-SIG（12 µs）', ampSync: 'AMP-Sync（OOK 码片）', ampSig: 'AMP-SIG（2 字节）',
        ampData: 'AMP-Data（曼彻斯特 OOK）', signalExt: '信号扩展（6 µs）',
        ampWup: 'WUP 激励（给标签供电的载波）', ampBst: 'BST 激励（应答所反射的载波）',
        sync: 'SYNC（64 个前导符号）', sfd: 'SFD（帧起始定界符）', stsGap: 'STS 间隔',
        sts: 'STS（加扰时间戳序列）', phr: 'PHR（PHY 帧头）', psdu: 'PSDU（测距负载）',
        mmsFrag: '片段（一段序列，没有前导码——RMARKER 就是它的第一个脉冲）',
        nbShr: 'SHR（8 个前导符号 + 2 个 SFD 符号）',
      },
      symbols: (n, u) => `${n} 个符号 × ${u} µs`,
      rmarker: (us) => `RMARKER 位于 ${us} µs——所有测距时间戳都在这一点读取，而不是帧的起点`,
      row: {
        type: '类型',
        ra: 'RA / 地址 1', ta: 'TA / 地址 2',
        psduLength: 'PSDU 长度', octets: (n) => `${n} 字节`,
        dataRate: '数据速率',
        txtime: 'TXTIME',
        durationId: '持续时间 / ID', navRest: (us) => `${us}（为本次交换剩下的部分预约介质）`,
        seqNo: '序列号', retryFlag: '重发比特',
        ampRate: 'AMP 速率', ampRateValue: (kbps) => `${kbps} kb/s（曼彽斯特 OOK）`,
        slots: '时隙数', slotDuration: '时隙长度', acwe: 'ACWE',
        phase: '阶段', phaseName: { random: '随机接入', scheduled: '调度' },
        acksSlot: '确认的时隙', slot: '时隙', aboc: 'ABOC',
        gen2Cmd: 'EPC Gen2 命令', sessionSlot: '会话 / 时隙',
        q: 'Q', qValue: (q, slots) => `${q}（${slots} 个时隙）`,
        rn16: 'RN16', wup: 'WUP-Excitation', bst: 'BST-Excitation',
        excitationPower: '激励功率',
        excitationValue: (charge, bs) => `${charge} dBm 充能 / ${bs} dBm 反向散射`,
        gen2Reply: 'Gen2 应答', epc: 'EPC', incident: '入射激励',
      },
      uwbValue: {
        fc: (sp) => `数据帧 · SP${sp} 测距 · PAN ID 压缩 · 16 位短地址`,
        seq: (round, slot) => `轮 ${round}，时隙 ${slot}`,
        arc: (sp, method, block, round, responders) =>
          `SP${sp} · ${method} · 块 ${block} · 轮 ${round}${responders === undefined ? '' : ` · ${responders} 个应答方`}`,
        rdm: (n, list) => `${n} 台设备：${list}`,
        rdmSlot: (id, slot) => `${id} 时隙 ${slot}`,
        rrmc: (slot, method) => `时隙 ${slot} · ${method}`,
        rcps: (first, last) => `应答阶段时隙 ${first}…${last}`,
        rcma: (n) => `最多尝试 ${n} 次`,
        replyTime: (time) => `回复时间 ${time}`,
        finalReply: (id, time) => `${id}：treply2 ${time}`,
        rmiFinal: (n, list) => `${n} 个锚点：${list}`,
        rmiFinalEntry: (id, time) => `${id} tround1 ${time}`,
        rmiReport: (treply1, tround2) => `treply1 ${treply1} · tround2 ${tround2}`,
        txTime: (time) => `发送时刻 ${time}`,
        rxTimes: (n, list) => `${n} 个接收时刻：${list} RCTU`,
        coffs: (ppm) => `时钟偏差 ${ppm} ppm——相对锚点 0`,
        blink: (block, round) => `闪发 · 块 ${block} · 轮 ${round}`,
        rmnr: () => '无内容字段——仅凭出现在这个时隙本身，说明仍持有有效 RCM、但本轮启动消息未收到',
        rmmrc: (n, list) => `${n} 个发起方：${list}`,
        srrr: (id, raoa, rrtt) => `${id} 请求：方位角 ${raoa ? '要' : '不要'}，往返时间 ${rrtt ? '要' : '不要'}`,
        raoa: (deg) => `${deg}——响应方自己测到的方位角，由它的报告帧带回`,
        rmmrcEntry: (id, bits) => `${id} 收妥位图 ${bits}（从左到右：窗口第一轮…最后一轮）`,
        raict: (messageNumber, framesRemaining) => {
          const parts: string[] = []
          if (messageNumber !== undefined) parts.push(`消息号 ${messageNumber}`)
          if (framesRemaining !== undefined) parts.push(`剩余帧数 ${framesRemaining}`)
          return parts.length > 0 ? parts.join(' · ') : '控制字节：两个可选字段均不在'
        },
        fragment: (kind, index, of, msIn) => `${kind} 第 ${index} / ${of} 个 · 序列中的第 ${msIn} ms`,
        fragmentRsf: (nMsr, gap) => `N_MSR ${nMsr} × MMRS 符号 · 间隔 ${gap}`,
        fragmentRif: (segments) => `STS 段 ${segments} × 512 码片`,
        nbMsgId: (name, hex) => `${name}（${hex}）`,
        nbMsgName: {
          poll: 'POLL', resp: 'RESP',
          reportInitiator: 'REPORT（发起方）', reportResponder: 'REPORT（响应方）',
          pollOtm: 'POLL（一对多）', respOtm: 'RESP（一对多）',
          reportInitiatorOtm: 'REPORT（发起方，一对多）', reportResponderOtm: 'REPORT（响应方，一对多）',
          unknown: '未知消息',
        },
        nbChannel: (channel, mhz) => `信道 ${channel} · ${mhz} MHz`,
        nbResponders: (n, ids) => `${n} 个应答方 · 每个 1 个时隙 · ${ids}`,
        sp0Role: { poll: 'POLL（轮询）', resp: 'RESP（响应）', report: 'REPORT（测量报告）' },
        sp0Rest: (octets) => `${octets} B · 草案未逐字段给出 SP0 载荷的排布`,
        nbTurnAround: (time) => `周转时间 ${time}`,
        nbRest: (octets) => `${octets} 字节的会话与调度字段`,
      },
    },
  },
  widgets: {
    txPower: '发射功率', distance: '距离', walls: '中间的墙', width: '信道带宽', mode: 'PHY',
    wallName: { drywall: '石膏板', brick: '砖墙', glass: '玻璃' },
    pathLoss: '路径损耗', wallLoss: '穿墙损耗', rssi: '接收功率（RSSI）', noise: '底噪', snr: '信噪比 SNR',
    bestMcs: '可用的最高 MCS', required: '需要', margin: (db) => `所需 SINR + ${db} dB 余量`,
    ladderSnr: '你的 SNR', mcs: 'MCS', rate: 'Mbps（20 MHz，单流）', reqSinr: '所需 SINR', sens: '灵敏度',
    usable: (n) => `可用 ${n} 个 MCS（含速率余量）`,
  },
  tooltips: {
    transmitting: '发送中',
    dlMu: (n, kind) => kind === 'mumimo'
      ? `下行 MU-MIMO PPDU → ${n} 个终端（同频率，空间分割）`
      : `下行 MU PPDU → ${n} 个终端（OFDMA）`,
    ampdu: (n, dst) => `A-MPDU 聚合（${n} 个 MPDU）→ ${dst}`,
    data: (dst) => `数据帧 → ${dst}`,
    ack: (dst) => `ACK 确认 → ${dst}`,
    ba: (dst) => `BlockAck 块确认 → ${dst}`,
    mba: '多站点 BlockAck（OFDMA）',
    trigger: '触发帧 — 调度上行 OFDMA',
    rts: (dst) => `RTS → ${dst}（预约介质）`,
    cts: (dst) => `CTS → ${dst}`,
    cfend: 'CF-End（提前释放 TXOP 预约）',
    nonHt: '非 HT',
    sifsNote: '在帧结束后一个 SIFS（16 µs）发出 — 响应帧从不参与竞争',
    retryNote: '重传（Retry 位已置 1）',
    ruNote: (kind) => kind === 'mumimo'
      ? 'MU-MIMO：与同组同时传输，相同频率，不同空间流'
      : 'RU 正交：与同组的其他帧同时传输',
    receiving: (kind, from) => `正在接收来自 ${from} 的 ${kind}`,
    rxCorrupted: (reason, interferers) =>
      reason === 'collision' ? `已损坏——与 ${interferers} 发生碰撞` :
      reason === 'undetected' ? (interferers
        ? `未检测到——前导码被 ${interferers} 淹没（SINR 低于 4 dB）`
        : '未检测到——前导码相对噪声太弱（SINR 低于 4 dB）') :
      reason === 'capture' ? '已放弃——重新同步到更强的前导码' :
      reason === 'txDuringRx' ? '已放弃——本机开始发送' :
      '已损坏——信号相对噪声/干扰太弱',
    backoffTitle: '随机退避倒数',
    backoffL1: '每个空闲 9 µs 时隙减 1；介质忙时冻结（§10.3.3）',
    backoffL2: '计数到 0 即发送 — 这就是站点避免碰撞的方式',
    deferTitle: (ifs) => `等待中${ifs ? `（${ifs}）` : ''}`,
    ifsChain: (kinds) => `本块依次经过：${kinds}`,
    eifsNote: 'EIFS：收到损坏帧后的加长等待（§10.3.2.3.7）',
    deferNote: '等待介质保持一个 IFS 的空闲，之后退避才能继续',
    navTitle: 'NAV 已设置',
    navNote: '虚拟载波侦听：侦听到的 Duration 字段预约了介质（§10.3.2.4）',
    sifsWait: '交换过程中的等待（SIFS 周转 / 等待响应）',
    ampTrigger: 'AMP 触发帧 — AP 为环境能量标签开放上行时隙',
    ampAck: (dst) => `AMP 确认 → ${dst} — 关闭一个时隙并开启下一个`,
    ampResp: (slot) => `时隙 ${slot} 内的 AMP 应答`,
    ampRfid: (cmd) => `AMP RFID · ${cmd} —— 读写器激励信号中承载的一条 EPC Gen2 命令`,
    ampBsReply: (reply, slot) => `时隙 ${slot} 内反向散射回来的 ${reply} —— 读写器自己的载波被反射回来`,
    ampWait: '等待自己的时隙',
    ampWaitNote: '标签没有载波侦听：它靠数 AP 发出的 Ack 来计时，并在打开自己时隙的那个 Ack 之后一个 AMP SIFS（10 µs）发送。',
    bsWait: '正在倒数自己的时隙',
    bsWaitNote: '反向散射标签既没有时钟也没有发射机：只有读写器的载波在空中时它才活着，它靠数读写器发出的 QueryRep 一路倒数到自己的时隙。',
    uwbPoll: (n) => `UWB 轮询帧——标签对 ${n} 个锚点开启一轮测距`,
    uwbResp: (slot) => `测距时隙 ${slot} 内的 UWB 响应帧`,
    uwbSsDefer: (slot) => `测距时隙 ${slot} 内的 UWB 延后报文——锚点补上它那一次响应的回复时间`,
    uwbInit: 'UWB 测距启动帧——仍沿用更早一轮的时隙表，这一轮不再重发配置',
    uwbM2m: (slot, rxTimes) => `测距时隙 ${slot} 内的 UWB 多对多帧——自己的发送时刻，外加 ${rxTimes} 个已收到的到达时刻`,
    uwbRmnr: (slot) => `测距时隙 ${slot} 内的 UWB 测距消息未收到帧——持有有效控制消息，但本轮启动消息未收到`,
    uwbFinal: 'UWB 终结帧——标签广播它测得的时间（DS-TWR）',
    uwbReport: (dst) => `UWB 测量报告 → ${dst}`,
    uwbBlink: 'UWB 闪发帧 — 标签只发一次，由各锚点打时间戳（UL-TDoA）',
    uwbFragment: (kind, index, of) => `${kind} 第 ${index} / ${of} 个 — 多毫秒序列中的一个片段`,
    uwbFragmentRate: (dbm) => `序列 · ${dbm.toFixed(2)} dBm`,
    nbRate: (mbps) => `${mbps} Mbps O-QPSK · 窄带控制面（802.15.4ab 草案）`,
    uwbSp0: (role, dst) => `SP0 ${SP0_ROLE_SHORT[role]} → ${dst} — 控制面跑在 UWB 电台上，没有窄带那一侧`,
    nbPoll: (dst) => `窄带 POLL → ${dst} — 在控制电台上开启一次测距周期`,
    nbResp: (dst) => `窄带 RESP → ${dst} — 它听到了轮询，将参与测距`,
    nbReport: (dst) => `窄带 REPORT → ${dst} — 计算距离所用的那个时间`,
    uwbSp3: (slot) => `测距时隙 ${slot} 内的 SP3 测距标记——只有 SYNC、SFD 与 STS，没有 PHR，也没有载荷；`
      + `是哪台设备发的，由这个时隙本身说明`,
    uwbSp3Rate: '没有载荷，也就没有数据速率 · HRP UWB（SP3 包：SYNC+SFD+STS）',
    uwbRate: (mbps) => `${mbps} Mbps BPRF · HRP UWB（SP1 PPDU）`,
    uwbAncillary: (slot) => `测距时隙 ${slot} 内的 UWB 测距辅助信息帧（RAICT）——装着这条消息的一个分片`,
    uwbWait: '持有一个测距时隙',
    uwbWaitNote: 'UWB 设备从不参与竞争：本轮的调度表已经规定了这个时隙属于谁，接收机只需保持开启到时隙截止。',
    uwbMmrcm: (n) => `UWB 多消息收妥确认帧——答复 ${n} 个发起方`,
  },
}

/** The string table. */
export function useStrings(): Strings {
  return STRINGS
}
