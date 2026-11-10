/**
 * The multi-millisecond (MMS) packet of IEEE P802.15.4ab: the PHY model behind `mode: 'mms'`.
 *
 * A 4z frame spends one burst of energy and is heard as far as that burst reaches. An MMS
 * device instead splits its ranging signal into short *fragments* sent a slot or more apart —
 * a *train* — and the receiver adds them up.
 *
 * How far apart: one millisecond, which is 15-23/0100r2 §2.3.2's figure, and in the interleaved
 * mode the responder's fragment follows the initiator's 500 µs later — "after the initiator has sent
 * one fragment, the responder will send a fragment 500 us later" (15-24/0633r1, describing D01; the
 * same 500 µs offset in 15-24/0664r2 and 15-25/0388r1). A one-to-many round is one ranging
 * sub-round per responder, each with its own control phase (15-25/0213r2, CID 474: Message Control 1
 * on the first sub-round's One-to-many Poll, 0 on the later ones), so every sub-round interleaves
 * exactly like a pair. 2026-11-11 (audit #22): the engine used to interleave all R responders inside
 * one shared millisecond of (R + 1) slots, which stretched the gap to 2 ms at three responders. The
 * non-interleaved round of §10.39.7 has one transmitter to a sub-round and takes the spacing from
 * the slot length (`mmsSlotsPerMs`). `MmsRoundPlan.fragGapNs` is what a round actually uses, and it
 * is the ruler the receiver is handed, so nothing downstream assumes the nominal millisecond.
 *
 * Two things follow, and they are the whole point of
 * the slice: each fragment may spend a full millisecond's regulatory energy budget in its own
 * (much shorter) length, and N fragments combine for another 10·log10(N) dB. The same train also
 * hands the receiver a ruler as long as the whole train to measure the transmitter's clock
 * rate against.
 *
 * Two fragment kinds: an **RSF** (ranging sequence fragment) is N_MSR repetitions of one MMRS
 * symbol and carries the ranging timestamp; an **RIF** (ranging integrity fragment) is one STS
 * segment and verifies that the range was not spoofed. A train is X RSFs then Y RIFs.
 *
 * Everything here is chips at 499.2 Mchip/s (standard §16.2.4) turned into nanoseconds by
 * `chipsToNs`, the same rounding every other PPDU in this engine is measured with. The draft
 * text is members-only: every number below is paraphrased from the TG4ab contributions named in
 * its tag, never copied. As of the September 2026 meeting the draft is in SA ballot
 * recirculation, and the balloted text may differ from the contributions modelled here — see
 * docs/superpowers/specs/2026-09-26-uwb-standard-basis.md for what was checked and what drifted.
 *
 * Everything this module needs of the engine's units comes from the leaf `units.ts`, never
 * from `phy.ts`: `phy.ts` imports *this* module to size an MMS slot, and an import the other
 * way would be a cycle whose constants are undefined half the time.
 */
import type { Ns } from '../model/types'
import { chipsToNs, COUNTER_MOD, RCTU_PER_CHIP, UWB_RX_SENS_DBM } from './units'

// --- The fragment ------------------------------------------------------------

export const MS_CHIPS = 499_200 // 4ab draft 15-23/0100r2 §2.3.2: one millisecond of chips
export const MS_RSTU = 1200 // 4ab draft 15-22/0381r5 §1.1.3: the same millisecond in RSTU

/** Ranging slots in one millisecond at the draft's default 600 RSTU slot: two. It is the default
 * `mmsLayout` lays a round out at, and the only value every scene in this repository uses.
 * derived (MS_RSTU / 600) */
export const MMS_SLOTS_PER_MS = 2

/**
 * How many ranging slots one millisecond of the cycle takes at a slot of `slotRstu` — the one
 * place that division is done, so the round plan, the schema's block-fit rule and the layout
 * cannot each reach a different answer.
 *
 * `ceil`, not a rounded division: a slot coarser than a millisecond still costs a whole slot, so
 * a 2400 RSTU slot spaces neighbouring fragments 2 ms apart rather than 1. That is the schedule's
 * own truth and `MmsRoundPlan.fragGapNs` reports it; what must never happen is the other
 * direction, a gap *under* a millisecond. 4ab draft 15-22/0381r5 §1.1.1 for the slot, model for
 * the rounding.
 */
export function mmsSlotsPerMs(slotRstu: number): number {
  return Math.max(1, Math.ceil(MS_RSTU / slotRstu))
}

/** Length of the complementary-set sequence an MMRS symbol is built from. */
export const MMRS_LEN = 128 // 4ab draft 15-23/0100r2 §2.3.2
/** Spreading factor L applied to the MMRS symbol. */
export const MMS_SPREAD = 4 // 4ab draft 15-23/0100r2 §2.3.2
/** An STS segment's length is counted in units of this many chips. */
export const STS_UNIT_CHIPS = 512 // standard §16.2.9

/** MMRS repetitions in one RSF. */
/**
 * Repetitions of the MMRS symbol in one RSF. Named N_MSR after 15-23/0100r2 §2.3.2, which is
 * what the course and the editor call it; the draft has since renamed the field carrying it to
 * **RSF Fragment Length**, in the Ranging PHY Configuration field (15-24/0506 + 15-25/0066r1).
 * The values are unchanged.
 */
export const N_MSR_SET = [32, 40, 48, 64, 128, 256] as const
/** X, the RSFs in a train. */
export const RSF_COUNT_SET = [0, 1, 2, 4, 8, 16] as const // 4ab draft 15-22/0381r5 Table 1.6.3.2
/** Y, the RIFs in a train. */
export const RIF_COUNT_SET = [0, 1, 2, 4, 8] as const // 4ab draft 15-22/0381r5 Table 1.6.3.2
/** An RIF's STS segment length, in 512-chip units. */
/**
 * An RIF's length in 512-chip STS units. 15-23/0100r2 §2.3.2; the draft now carries it in the
 * **RIF Fragment Length** field, beside RSF Fragment Length (15-24/0506 + 15-25/0066r1).
 */
export const STS_LEN_SET = [32, 64, 128, 256] as const

export type NMsr = (typeof N_MSR_SET)[number]
export type RsfCount = (typeof RSF_COUNT_SET)[number]
export type RifCount = (typeof RIF_COUNT_SET)[number]
export type StsLen = (typeof STS_LEN_SET)[number]

/** One MMRS symbol: the length-128 set split [A, G, B, G] with a gap of `gap` zeros on each
 * side of B, the whole thing spread by L = 4. 4ab draft 15-23/0100r2 §2.3.2 */
export function mmrsSymbolChips(gap: number): number {
  return MMS_SPREAD * (MMRS_LEN + 2 * gap)
}

/** An RSF: `nMsr` repetitions of one MMRS symbol. 4ab draft 15-23/0100r2 §2.3.2 */
export function rsfChips(nMsr: number, gap: number): number {
  return nMsr * mmrsSymbolChips(gap)
}

/** An RIF: one STS segment of `stsLen` 512-chip units. 4ab draft 15-23/0100r2 §2.3.2 */
export function rifChips(stsLen: number): number {
  return stsLen * STS_UNIT_CHIPS
}

export function rsfNs(nMsr: number, gap: number): Ns {
  return chipsToNs(rsfChips(nMsr, gap))
}

export function rifNs(stsLen: number): Ns {
  return chipsToNs(rifChips(stsLen))
}

// --- Energy and reach ---------------------------------------------------------

/** The energy one millisecond of a 500 MHz UWB transmitter may hold: −41.3 dBm/MHz over
 * 499.2 MHz is −14.3 dBm, and −14.3 dBm for 1 ms is 37 nJ. regulation (FCC Part 15.519 /
 * ETSI EN 302 065, quoted through 4ab draft 15-22/0205r0) */
export const UWB_MS_BUDGET_NJ = 37

/** A fragment spends the whole millisecond's budget inside its own length, so the shorter it
 * is the louder it is: 37 nJ in `fragNs` is `10·log10(37 / fragNs µs)` dBm. model
 *
 * The engine's 4z transmitter does not do this — it holds `UWB_TX_POWER_DBM` whatever the frame
 * length — so part of the gain a train shows is burst power and only `10·log10(X)` is the
 * multi-millisecond idea. The lesson says so. */
export function mmsFragmentDbm(fragNs: Ns): number {
  return 10 * Math.log10(UWB_MS_BUDGET_NJ / (fragNs / 1000))
}

/** The largest train's combining gain, and so the channel's delivery floor: a fragment quieter
 * than `UWB_RX_SENS_DBM − MMS_COMBINE_MAX_DB` cannot be rescued by any train this model
 * allows, and the channel need not carry it. model */
export const MMS_COMBINE_MAX_DB = 10 * Math.log10(16)

/** What `heard` equal-power fragments add up to, combined coherently. model */
export function combineGainDb(heard: number): number {
  return heard > 0 ? 10 * Math.log10(heard) : 0
}

/** Whether a train of `heard` fragments, each arriving at `rxDbm`, clears the receiver's
 * sensitivity once combined. The receiver is primed by the narrowband exchange and accumulates
 * blind, so no single fragment has to be audible on its own. model */
export function trainDetected(rxDbm: number, heard: number): boolean {
  return heard > 0 && rxDbm + combineGainDb(heard) >= UWB_RX_SENS_DBM
}

/** How much lower an SP0 control frame's peak power is than the packet's own SYNC+SFD fragment:
 * "Longer SP0 Frame is sent at lower peak power level"; the comparison gives 6.3, 5.3 or 3.8 dB
 * depending on code length and PSR — ratios of pulse counts under the same energy budget — and
 * the conclusion rounds them to "~4dB". 4ab draft 15-25/0194r0 slides 7–8 (a proposal; the
 * engine takes the rounded figure, the three are in the lesson) */
export const MMS_SP0_PENALTY_DB = 4

/**
 * The power an SP0 control frame is radiated at: the session's leading fragment's power
 * (`mmsFragmentDbm` of its own length — the packet's SYNC+SFD fragment in this engine) less
 * `MMS_SP0_PENALTY_DB`. It is then judged against the ordinary `UWB_RX_SENS_DBM`.
 *
 * 2026-11-11 (audit #17): the proposal's ~4 dB **is** the peak-power loss, so it is charged once,
 * here. The engine used to radiate SP0 at the node's own burst power (10.54 dB below the fragment in
 * `uwb-uwbd`'s configuration) **and** raise its delivery threshold by the 4 dB — the same loss
 * counted twice.
 */
export function mmsSp0TxDbm(phy: MmsPhy): number {
  const leadNs = phy.rsfs > 0 ? rsfNs(phy.nMsr, phy.gap) : rifNs(phy.stsLen)
  return mmsFragmentDbm(leadNs) - MMS_SP0_PENALTY_DB
}

/**
 * The SP0 (BASIC_PACKET) control frame, segment by segment, in nanoseconds: the **short packet**
 * column of the draft's own acquisition table — SYNC 46.7 µs (PSR64), SFD 5.8 µs, PHR 12.8 µs,
 * PSDU 52.3 µs. The four cells are what `uwbPpduLayout` draws, so the picture and the airtime
 * come from the same four numbers. 4ab draft 15-25/0194r0
 */
export const MMS_SP0_SEGMENT_NS = { sync: 46_700, sfd: 5_800, phr: 12_800, psdu: 52_300 } as const

/**
 * How long one SP0 control frame is on the air: the same table's **total** cell for the short
 * packet, 117.6 µs.
 *
 * The table's other column is the long packet (PSR128) at 170.1 µs, and the engine takes the
 * short one for every SP0 message rather than choosing between them. Nothing in an `MmsPhy`
 * decides it: `nMsr` is the RSF fragment's length, and the SP0 packet's preamble symbol
 * repetitions are a PHY setting of their own that this engine does not carry. Taking the short
 * packet is also the conservative reading of what SP0 costs — it is the *shorter* of the two, so
 * the round it lengthens is lengthened by as little as the draft allows, and nothing about the
 * schedule is flattered by the choice. 4ab draft 15-25/0194r0 (short-packet total; model for
 * taking one of the two columns)
 */
export const MMS_SP0_NS: Ns = MMS_SP0_SEGMENT_NS.sync + MMS_SP0_SEGMENT_NS.sfd
  + MMS_SP0_SEGMENT_NS.phr + MMS_SP0_SEGMENT_NS.psdu

/** The SP0 PSDU's data rate. 4ab draft 15-25/0194r0 */
export const MMS_SP0_MBPS = 1.95

/**
 * What the SP0 packet's PSDU holds, in octets: the table's 52.3 µs at 1.95 Mbit/s is 102 bits,
 * so twelve whole octets. That is the size of the draft's own compressed control PSDUs (POLL and
 * RESP are 12 octets, the REPORT 13), which is why **one** duration serves all three SP0
 * messages and why this engine does not grow an SP0 packet with a one-to-many responder list:
 * the table gives one PSDU length, and a packet stretched past it would be this model's
 * invention. derived from 4ab draft 15-25/0194r0
 */
export const MMS_SP0_PSDU_BYTES = 12

/**
 * Whether the receiver ever found the packet — the question `trainDetected` does not have to ask.
 *
 * Config 2: the narrowband POLL/RESP exchange hands both ends the same time base before a fragment
 * goes out, so the receiver knows where every fragment will land and accumulates blind — nothing
 * to acquire. Config 1: the UWB-driven MMS packet **starts with a SYNC+SFD fragment** whether or
 * not SP0 control frames went before it (15-25/0194r0 slides 5–7 draw SP0, then SYNC+SFD, then the
 * RSF/RIF fragments), and that fragment is what acquisition and the carrier-offset estimate are
 * taken from; losing it loses the round (15-25/0066r1's own discussion). So under Config 1 the head
 * of `fragments` has to be audible on its own, at the plain `UWB_RX_SENS_DBM`.
 *
 * 2026-11-11 (audit #18): the SP0 path used to count the packet as already acquired, and an
 * `rsfSfd` option let any RSF open it. That option was the proposal 15-25/0066r1 for CID 963, and
 * the commenter withdrew CID 963 (15-25/0082r8) — it is not in the draft, so it is gone, and the
 * SP0 path now has to find the packet's head like the zero-length one.
 *
 * **Nothing is combined here**, and that is the whole of what separates this from
 * `trainDetected`: one fragment has to be audible entirely on its own, because until one is
 * there is no time base to add the next one at. Four fragments 6 dB down are a detected train
 * and an unacquired packet at the same time.
 */
export function acquired(phy: MmsPhy, fragments: { rssiDbm: number }[]): boolean {
  if (phy.control === 'nba') return true
  const head = fragments[0]
  return head !== undefined && head.rssiDbm >= UWB_RX_SENS_DBM
}

/** One millisecond in nanoseconds: the spacing of two neighbouring fragments in the PAIRWISE
 * round, on the transmitter's own clock, and the unit the draft's timings are written in. Every
 * other round spaces them `MmsRoundPlan.fragGapNs`. 4ab draft 15-23/0100r2 §2.3.2 */
export const MS_NS: Ns = 1_000_000

/** The same millisecond in ranging counter units — what a measured span is divided by to get a
 * clock ratio. derived (63 897 600 RCTU) */
export const MS_RCTU = MS_CHIPS * RCTU_PER_CHIP

/**
 * Where a train's RMARKER fell on the receiver's own ranging counter, given the first fragment
 * of the train it actually heard: the fragments are `gapRctu` apart — one millisecond only in
 * the pairwise round, (responders + 1) slots in every other, see below — and the receiver knows
 * the train's shape from the narrowband control exchange, so fragment `index`, stamped at
 * `firstCounter`, puts fragment 0 — the RMARKER — `index` gaps earlier. A train whose
 * first fragment was lost is therefore still timed, from whichever fragment did arrive. model
 *
 * Those gaps are the *transmitter's*, and this counter is the receiver's, so the walk-back is
 * scaled by `ratio` — the receiver's counter per the peer's, which the very same train
 * measured. Walking back `index` undrifted gaps instead would leave `index` × the gap × the
 * clock offset between the two crystals: 20 ns per lost leading fragment at 20 ppm on a
 * one-millisecond gap, and so 3.0 m of range.
 *
 * `gapRctu` is how far apart this round actually spaces the fragments, in the receiver's counter
 * units — `MS_RCTU`, a true millisecond, in the pairwise round at the draft's 600 RSTU slot, and
 * longer in every other round the schema allows (see `MmsRoundPlan.fragGapNs`).
 *
 * `ratio` is null when fewer than two fragments were heard and there was no span to measure it
 * over. The receiver's own nominal millisecond is then all it has, and that residual stands —
 * there is nothing better to use. With fragment 0 in hand (`index` 0) nothing is walked back at
 * all and the ratio never enters.
 */
export function rmarkerFromFragment(
  firstCounter: number, index: number, ratio: number | null, gapRctu: number = MS_RCTU,
): number {
  if (index === 0) return firstCounter
  const back = Math.round(index * gapRctu * (ratio ?? 1))
  return (((firstCounter - back) % COUNTER_MOD) + COUNTER_MOD) % COUNTER_MOD
}

/** 1-σ of the train-derived clock ratio for a span of `spanMs` between the first and last heard
 * fragment: two timestamps of 1-σ `tsNoisePs` each, divided by the span they measure. The
 * result is a fraction (multiply by 1e6 for ppm). model */
export function ratioSigma(tsNoisePs: number, spanMs: number): number {
  return (Math.SQRT2 * tsNoisePs * 1e-12) / (spanMs * 1e-3)
}

// --- The train ----------------------------------------------------------------

/** The shape of one device's train: X RSFs then Y RIFs, the fragment parameters both are cut
 * from, and Z — the idle milliseconds between the last RSF and the first RIF, which give the
 * receiver time to process. */
export interface MmsPhy {
  rsfs: RsfCount
  rifs: RifCount
  nMsr: NMsr
  gap: number
  stsLen: StsLen
  /** Z, the RSF-to-RIF gap, in milliseconds — the draft's RpRifOffset. See `rifStartMs`. */
  gapMs: 1 | 2
  /** Config 2 (narrowband-assisted) or Config 1 (UWB-driven), which carries its control
   * phase on the HRP UWB PHY itself. 4ab draft 15-25/0194r0 */
  control: 'nba' | 'uwbd'
  /** Each side sends its whole train contiguously, in its own sub-round, rather than
   * interleaving a fragment per millisecond. 4ab draft 15-25/0292r1 (§10.39.7) */
  nonInterleaved: boolean
  /**
   * Non-interleaved only: the responder sends its RESP (One-to-one / One-to-many Response Compact
   * frame) at Message Control 2, whose content is a 5-octet **Predicted Reply Time** — the time,
   * measured at the responder, between the RMARKER of the initiator's MMS fragments it received
   * and the RMARKER of the MMS fragments it will transmit after this frame — "where it may be used
   * to avoid a separate report of the reply time". Resolution 15-25/0681r1, adopted without
   * objection (minutes 15-26/0006r0). It superseded the fixed reply time (15-25/0224r2) and the
   * reversed order (15-25/0556r2), which are therefore not in the draft and not in this engine.
   */
  predictedReplyTime: boolean
  /** UWB-driven only: whether the control phase carries an SP0 (BASIC_PACKET) frame.
   * The draft makes the control phase zero-length when the poll and response slot
   * counts are zero, and puts SP0 in use when they are 1-15; this is that choice.
   * Ignored under `control: 'nba'`. 4ab draft 15-25/0194r0 */
  uwbdControl: 'sp0' | 'none'
}

/** Just the four draft features of `MmsPhy`, without the train they sit beside. */
export type MmsDraftPhy = Pick<MmsPhy, 'control' | 'nonInterleaved' | 'predictedReplyTime' | 'uwbdControl'>

/**
 * The four draft features at the settings that reproduce the session this engine has always
 * run: Config 2 with its narrowband control plane, interleaved trains, a RESP at Message Control 0
 * (no predicted reply time), and an SP0 control phase.
 *
 * Every place that builds an `MmsPhy` spreads this, so a feature the draft added is off
 * everywhere until a scenario names it — which is what keeps every stored plan replaying
 * chip for chip. model
 */
export const MMS_DRAFT_DEFAULTS: MmsDraftPhy = {
  control: 'nba',
  nonInterleaved: false,
  predictedReplyTime: false,
  uwbdControl: 'sp0',
}

/**
 * Which millisecond of the ranging phase RIF number `index` (counted from 0) starts in, for a
 * train of `rsfs` RSFs and an RSF-to-RIF gap of `gapMs`: the first RIF starts RpRifOffset after
 * the **start of the last RSF**, and the last RSF started at millisecond X − 1, so the first RIF
 * is at X − 1 + Z and every further one a millisecond later. With no RSF at all (X = 0) the
 * offset is zero and the RIFs open the phase.
 *
 * P802.15.4ab §10.39.5, the UWB MMS ranging phase, paraphrased: without RSFs the first RIF may
 * go out RpRifOffset into the phase; with RSFs it may go out RpRifOffset after the last RSF
 * started. RpRifOffset is 2 ms when RSFs were sent and 0 ms otherwise.
 *
 * The clause keeps moving — §10.35.5, then §10.36.5, then §10.38.5, and §10.39.5 in every 2026
 * document — so a bare clause number here has a shelf life. The rule itself is the editor's
 * instruction carried by comment resolution 15-24/0235r2 (from the proposed clause text of
 * 15-23/0371r1 and 15-23/0412r0). No draft text is in the corpus this repository is checked
 * against, only the comment resolutions that quote it, so the balloted draft may differ.
 */
export function rifStartMs(rsfs: number, gapMs: number, index: number): number {
  return rsfs > 0 ? rsfs + gapMs - 1 + index : index
}

export type MmsSetId =
  | 'rsf-1' | 'rsf-2' | 'rsf-3' | 'rsf-4' | 'rsf-5'
  | 'rsf-6' | 'rsf-7' | 'rsf-8' | 'rsf-9' | 'rsf-10'
  | 'mixed-1' | 'mixed-2' | 'mixed-3' | 'mixed-4' | 'mixed-5' | 'mixed-6' | 'mixed-7'

const rsfOnly = (nMsr: NMsr, gap: number): MmsPhy =>
  ({ rsfs: 16, rifs: 0, nMsr, gap, stsLen: 64, gapMs: 1, ...MMS_DRAFT_DEFAULTS })
const mixed = (rsfs: RsfCount, rifs: RifCount): MmsPhy =>
  ({ rsfs, rifs, nMsr: 64, gap: 25, stsLen: 64, gapMs: 1, ...MMS_DRAFT_DEFAULTS })

/** The mandatory operating parameter sets: ten RSF-only trains (X = 16, Y = 0, at five gaps of
 * N_MSR 40 and five of N_MSR 32) and seven mixed ones (N_MSR 64, gap 25, STS 64, at seven
 * (X, Y) pairs). The UWB-only sets of the same table — an SHR and one RIF — are 4z SP3 in all
 * but name and are not modelled. A set fixes the *fragment* parameters only: the five draft
 * features come from `MMS_DRAFT_DEFAULTS`, so picking a set never turns one on.
 * 4ab draft 15-23/0502r3 (proposed 16.2.11.4) */
export const MMS_SETS: Record<MmsSetId, MmsPhy> = {
  'rsf-1': rsfOnly(40, 33),
  'rsf-2': rsfOnly(40, 37),
  'rsf-3': rsfOnly(40, 39),
  'rsf-4': rsfOnly(40, 43),
  'rsf-5': rsfOnly(40, 45),
  'rsf-6': rsfOnly(32, 49),
  'rsf-7': rsfOnly(32, 57),
  'rsf-8': rsfOnly(32, 59),
  'rsf-9': rsfOnly(32, 61),
  'rsf-10': rsfOnly(32, 64),
  'mixed-1': mixed(1, 1),
  'mixed-2': mixed(1, 2),
  'mixed-3': mixed(1, 4),
  'mixed-4': mixed(1, 8),
  'mixed-5': mixed(2, 2),
  'mixed-6': mixed(4, 4),
  'mixed-7': mixed(8, 8),
}

/** One mandatory set, as a fresh object: a caller spreading it into a session config must not
 * be able to edit the table it came from. */
export function mmsSet(id: MmsSetId): MmsPhy {
  return { ...MMS_SETS[id] }
}

/** The longest fragment the train actually carries — what a ranging slot has to hold. An empty
 * train (the schema refuses one) carries no fragment at all, and so needs no room. */
export function mmsLongestFragmentNs(phy: MmsPhy): Ns {
  return Math.max(
    phy.rsfs > 0 ? rsfNs(phy.nMsr, phy.gap) : 0,
    phy.rifs > 0 ? rifNs(phy.stsLen) : 0,
  )
}

// --- The round's slot layout ----------------------------------------------------

/**
 * Where every fragment and every control and report window of one MMS round sits, in slots counted
 * from the start of the round. A round is cut into **sub-rounds**:
 *
 * - interleaved: one sub-round per responder, each a complete pairwise exchange — the initiator's
 *   POLL window, that responder's RESP window, the ranging phase in which the two interleave (the
 *   responder 500 µs after the initiator, each a fragment per millisecond), and the two report
 *   windows. A pair round is the one-sub-round case. 4ab draft: 15-25/0213r2 (CID 474) for one
 *   sub-round per responder, each with its own One-to-many Poll; 15-24/0633r1 and 15-24/0664r2 for
 *   the 500 µs interleave;
 * - non-interleaved (§10.39.7): one sub-round per device — the initiator's, then each responder's —
 *   each its owner's control window and its owner's whole train, followed by the report phase.
 */
export interface MmsLayout {
  /** How many responders this round holds: 1 in a pair round, N in a one-to-many one. */
  responders: number
  /** What one **control** window of this round costs, in slots: `mmsWindowSlots` of the
   * session's control plane. Two for a narrowband window, one for an SP0 window, and **zero**
   * when the control phase is zero-length. */
  windowSlots: number
  /** What one **report** window costs, in slots: `mmsReportWindowSlots`. Never zero. */
  reportWindowSlots: number
  /** Every control window of the round together, in slots (`mmsControlSlots`): scattered one or two
   * to a sub-round, never a single prefix once a round has more than one sub-round. Zero when the
   * control phase is zero-length — a round with no POLL and no RESP at all. */
  controlSlots: number
  /** One sub-round's ranging phase: the draft's RpDuration floor of 20 slots, grown to fit the
   * train (`MMS_RP_MIN_SLOTS`). */
  rpSlots: number
  /** How many ranging slots one millisecond of this round's cycle takes, at the slot length the
   * session was laid out with — `mmsSlotsPerMs`, and 2 at the draft's 600 RSTU default. */
  slotsPerMs: number
  /**
   * How many slots this round puts between two neighbouring fragments of one train — **the one
   * place that spacing is decided**: `MmsRoundPlan.fragGapNs` is this times the slot, and the
   * receiver walks its RMARKER back over that.
   *
   * A millisecond either way. Interleaved, the responder's fragment sits half-way between two of the
   * initiator's, so the gap needs at least two slots — `max(2, slotsPerMs)`, a true millisecond at
   * 600 and 300 RSTU. Non-interleaved, one transmitter to a sub-round: `slotsPerMs`.
   */
  fragGapSlots: number
  /** Interleaved: how many slots after the initiator's fragment the responder's follows —
   * `fragGapSlots / 2`, one slot (500 µs) at 600 RSTU. 0 in the non-interleaved shape. */
  respOffsetSlots: number
  /** How many sub-rounds the round is cut into: R interleaved, R + 1 non-interleaved. */
  subRounds: number
  /** Slot index, within the round, where sub-round `i` begins. */
  subRoundStart(i: number): number
  /** The report phase in slots: two windows per responder (`mmsReportSlots`). */
  reportSlots: number
  slots: number
  /** How many POLL windows the round has: one per sub-round interleaved (the first One-to-many Poll
   * at Message Control 1 names the responders, the later ones are Message Control 0), and one in
   * the non-interleaved round, whose initiator sub-round polls them all. 0 with no control phase. */
  polls: number
  /** Which POLL opens responder `responder`'s exchange: its own sub-round's interleaved, POLL 0
   * non-interleaved. */
  pollFor(responder: number): number
  /** Slot index of POLL window `poll` (0 ≤ poll < `polls`). Throws with no control phase. */
  pollSlot(poll?: number): number
  /** Slot index of responder `responder`'s RESP window. Throws with no control phase. */
  respSlot(responder: number): number
  /** Slot index of fragment `index` of `kind` for `side`, in responder `responder`'s exchange. In
   * the non-interleaved round the initiator's train is one train for all responders and
   * `responder` is ignored for it. */
  fragmentSlot(side: 'initiator' | 'responder', kind: 'rsf' | 'rif', index: number, responder?: number): number
  /**
   * The inverse of `fragmentSlot`: which fragment, if any, sits in slot `slot` of the round, and in
   * whose exchange (`responder`). Null for every slot no fragment owns. The schedule and the devices
   * read this one map, so the two ends of a round cannot disagree about where a fragment is.
   */
  slotFragment(slot: number): {
    side: 'initiator' | 'responder'; kind: 'rsf' | 'rif'; index: number; responder: number
  } | null
  /** Slot index of the REPORT: responder `responder`'s own window, or the initiator's answer to it
   * one window later. */
  reportSlot(side: 'initiator' | 'responder', responder?: number): number
}

/** The two slots one narrowband window is: the draft's RcpPollSlot, RcpResponseSlot,
 * MrpFirstSlot and MrpSecondSlot are all 2. Exported for `phy.ts#nbSlotSlackNs` (standard
 * §10.45's SSBD slice), which needs the same number rather than a copy of it — it does not
 * scale with the message a window carries, which is the whole reason that function's slack can
 * go negative. 4ab draft 15-22/0381r5 §1.1 */
export const NB_WINDOW_SLOTS = 2

/**
 * The one slot an SP0 window is.
 *
 * A narrowband window is two slots because a 608 µs REPORT does not fit one. An SP0 packet is
 * `MMS_SP0_NS` — 117.6 µs — and the shortest ranging slot the draft's own rule allows is
 * 300 RSTU (250 µs), so one slot holds it plus the flight guard at **every** slot length an MMS
 * session may legally use. derived (4ab draft 15-25/0194r0 for the frame, 15-22/0381r5 §1.1.1 for
 * the slot)
 */
export const MMS_SP0_WINDOW_SLOTS = 1

/**
 * How many ranging slots one control-phase window of this round takes: two narrowband, one SP0,
 * and zero for Config 1's zero-length control phase, where the ranging packet's own leading
 * SYNC+SFD fragment is the poll and the response. 4ab draft 15-25/0194r0
 */
export function mmsWindowSlots(phy: MmsPhy): number {
  if (phy.control === 'nba') return NB_WINDOW_SLOTS
  return phy.uwbdControl === 'sp0' ? MMS_SP0_WINDOW_SLOTS : 0
}

/** The round's control windows, in slots. Interleaved: a POLL and a RESP window in each of the R
 * sub-rounds. Non-interleaved: the initiator's one POLL window and one RESP window per responder.
 * Both are two windows for a pair. Nothing at all when the control phase is zero-length. */
export function mmsControlSlots(phy: MmsPhy, responders = 1): number {
  const windows = phy.nonInterleaved ? 1 + responders : 2 * responders
  return mmsWindowSlots(phy) * windows
}

/**
 * How many ranging slots one **report** window of this round takes — read off a pair of draft
 * parameters of its own (macMms1stReportNSlots / macMms2ndReportNSlots, renamed by 15-26/0437r0),
 * which is why a zero-length control phase still has a report phase. Two narrowband, one SP0.
 * 4ab draft 15-25/0194r0
 */
export function mmsReportWindowSlots(phy: MmsPhy): number {
  return phy.control === 'nba' ? NB_WINDOW_SLOTS : MMS_SP0_WINDOW_SLOTS
}

/** The round's report windows, in slots: a pair per responder — its own REPORT, then the
 * initiator's answer to it. */
export function mmsReportSlots(phy: MmsPhy, responders = 1): number {
  return 2 * mmsReportWindowSlots(phy) * responders
}

/**
 * A floor under the ranging phase, in slots (model).
 *
 * 15-22/0381r5 Table 1.2.3.3 gave RpDuration as a default of 20. The draft has since changed its
 * nature rather than its value: macMmsRpDuration "shall be set at minimum to the required duration
 * for all RSF and RIF fragments to be transmitted and received but may be longer" (quoted in
 * comment resolution 15-25/0282r1), so it is derived, not defaulted; the 20 is this simulator's
 * floor under the derived length.
 */
export const MMS_RP_MIN_SLOTS = 20

/**
 * The fixed shape of one round for an initiator and `responders` responders (see `MmsLayout`).
 *
 * Interleaved, every sub-round is the pairwise round: control (POLL + RESP), a ranging phase of
 * `max(20, gap × train milliseconds)` slots in which the initiator's fragment opens each millisecond
 * and the responder's follows `respOffsetSlots` later, and the two report windows. At the draft's
 * 600 RSTU slot a pair round is control 4, two slots to a millisecond, report 4 — the round that
 * shipped before one-to-many existed, slot for slot.
 *
 * 2026-11-11 (audit #22): a one-to-many interleaved round used to share one control phase and one
 * initiator train among all R responders, with an (R + 1)-slot "millisecond" — 2 ms between
 * fragments at R = 3. The draft gives each responder a sub-round of its own (15-25/0213r2, CID 474),
 * so the initiator's train goes out once per sub-round and every fragment gap is a millisecond.
 *
 * Non-interleaved (§10.39.7, 15-25/0292r1): R + 1 sub-rounds — the initiator's own control window
 * and train, then each responder's — and the report phase after them. How a one-to-many round is cut
 * in this shape the draft has not finished defining (15-25/0213r2, CIDs 205/207: "Need extra work
 * for such mode"), so the order here is this engine's.
 */
export function mmsLayout(phy: MmsPhy, responders = 1, slotsPerMs = MMS_SLOTS_PER_MS): MmsLayout {
  if (!Number.isInteger(responders) || responders < 1) {
    throw new Error(`mmsLayout: a round needs at least one responder, asked for ${responders}`)
  }
  if (!Number.isInteger(slotsPerMs) || slotsPerMs < 1) {
    throw new Error(`mmsLayout: slotsPerMs must be a whole slot or more, asked for ${slotsPerMs}`)
  }
  const x = phy.rsfs
  const y = phy.rifs
  const z = phy.gapMs
  const win = mmsWindowSlots(phy)
  const rwin = mmsReportWindowSlots(phy)
  const control = mmsControlSlots(phy, responders)
  const report = mmsReportSlots(phy, responders)
  const count = (kind: 'rsf' | 'rif'): number => (kind === 'rsf' ? x : y)
  // The train's length in milliseconds: the RSFs' X, and — with RIFs — up to the last one, which
  // `rifStartMs` puts at X + Z − 1 + (Y − 1).
  const trainMs = y > 0 ? rifStartMs(x, z, y - 1) + 1 : x
  const checkResponder = (r: number): void => {
    if (!Number.isInteger(r) || r < 0 || r >= responders) {
      throw new Error(`mmsLayout: this round has ${responders} responders, asked for ${r}`)
    }
  }
  const checkIndex = (kind: 'rsf' | 'rif', index: number): void => {
    if (!Number.isInteger(index) || index < 0 || index >= count(kind)) {
      throw new Error(`mmsLayout: this train has ${count(kind)} ${kind.toUpperCase()} fragments, asked for ${index}`)
    }
  }
  /** A round whose control phase is zero-length has no POLL and no RESP window to name. */
  const needControl = (what: string): void => {
    if (control === 0) throw new Error(`mmsLayout: this round has no control phase, asked for its ${what}`)
  }
  /** Which fragment sits `ms` milliseconds into a train, or null for the idle milliseconds. */
  const fragAtMs = (ms: number): { kind: 'rsf' | 'rif'; index: number } | null => {
    if (ms < x) return { kind: 'rsf', index: ms }
    const firstRif = rifStartMs(x, z, 0)
    if (y > 0 && ms >= firstRif && ms < firstRif + y) return { kind: 'rif', index: ms - firstRif }
    return null
  }
  const msOf = (kind: 'rsf' | 'rif', index: number): number => (kind === 'rsf' ? index : rifStartMs(x, z, index))

  if (phy.nonInterleaved) {
    // One transmitter to a sub-round, so a millisecond of its phase is `slotsPerMs` slots and the
    // device count says nothing about the spacing.
    const rpOne = Math.max(MMS_RP_MIN_SLOTS, slotsPerMs * trainMs)
    const subRounds = 1 + responders
    const subRound = win + rpOne
    const ranging = subRounds * subRound
    const devOf = (side: 'initiator' | 'responder', responder: number): number =>
      side === 'initiator' ? 0 : 1 + responder
    const start = (i: number): number => {
      if (!Number.isInteger(i) || i < 0 || i >= subRounds) {
        throw new Error(`mmsLayout: this round has ${subRounds} sub-rounds, asked for ${i}`)
      }
      return i * subRound
    }
    return {
      responders,
      windowSlots: win,
      reportWindowSlots: rwin,
      controlSlots: control,
      rpSlots: rpOne,
      reportSlots: report,
      slotsPerMs,
      fragGapSlots: slotsPerMs,
      respOffsetSlots: 0,
      subRounds,
      slots: ranging + report,
      subRoundStart: start,
      polls: control > 0 ? 1 : 0,
      pollFor(responder) {
        checkResponder(responder)
        return 0
      },
      pollSlot(poll = 0) {
        needControl('POLL')
        if (poll !== 0) throw new Error(`mmsLayout: a non-interleaved round has one POLL, asked for ${poll}`)
        return start(0)
      },
      respSlot(responder) {
        needControl(`responder ${responder}'s RESP`)
        checkResponder(responder)
        return start(devOf('responder', responder))
      },
      fragmentSlot(side, kind, index, responder = 0) {
        checkIndex(kind, index)
        checkResponder(responder)
        return start(devOf(side, responder)) + win + slotsPerMs * msOf(kind, index)
      },
      slotFragment(slot) {
        if (!Number.isInteger(slot) || slot < 0 || slot >= ranging) return null
        const off = slot % subRound
        if (off < win) return null
        if ((off - win) % slotsPerMs !== 0) return null
        const f = fragAtMs((off - win) / slotsPerMs)
        if (!f) return null
        const dev = (slot - off) / subRound
        return dev === 0
          ? { side: 'initiator', ...f, responder: 0 }
          : { side: 'responder', ...f, responder: dev - 1 }
      },
      reportSlot(side, responder = 0) {
        checkResponder(responder)
        return ranging + 2 * rwin * responder + (side === 'initiator' ? rwin : 0)
      },
    }
  }

  // Interleaved: R pairwise sub-rounds.
  const gap = Math.max(2, slotsPerMs)
  const off = Math.floor(gap / 2)
  const rp = Math.max(MMS_RP_MIN_SLOTS, gap * trainMs)
  const subRound = 2 * win + rp + 2 * rwin
  const start = (i: number): number => {
    if (!Number.isInteger(i) || i < 0 || i >= responders) {
      throw new Error(`mmsLayout: this round has ${responders} sub-rounds, asked for ${i}`)
    }
    return i * subRound
  }
  return {
    responders,
    windowSlots: win,
    reportWindowSlots: rwin,
    controlSlots: control,
    rpSlots: rp,
    reportSlots: report,
    slotsPerMs,
    fragGapSlots: gap,
    respOffsetSlots: off,
    subRounds: responders,
    slots: responders * subRound,
    subRoundStart: start,
    polls: control > 0 ? responders : 0,
    pollFor(responder) {
      checkResponder(responder)
      return responder
    },
    pollSlot(poll = 0) {
      needControl('POLL')
      return start(poll)
    },
    respSlot(responder) {
      needControl(`responder ${responder}'s RESP`)
      checkResponder(responder)
      return start(responder) + win
    },
    fragmentSlot(side, kind, index, responder = 0) {
      checkIndex(kind, index)
      checkResponder(responder)
      return start(responder) + 2 * win + gap * msOf(kind, index) + (side === 'responder' ? off : 0)
    },
    slotFragment(slot) {
      if (!Number.isInteger(slot) || slot < 0 || slot >= responders * subRound) return null
      const sub = Math.floor(slot / subRound)
      const at = slot - sub * subRound - 2 * win
      if (at < 0 || at >= rp) return null
      const within = at % gap
      const side = within === 0 ? 'initiator' : within === off ? 'responder' : null
      if (side === null) return null
      const f = fragAtMs((at - within) / gap)
      return f ? { side, ...f, responder: sub } : null
    },
    reportSlot(side, responder = 0) {
      checkResponder(responder)
      return start(responder) + 2 * win + rp + (side === 'initiator' ? rwin : 0)
    },
  }
}
