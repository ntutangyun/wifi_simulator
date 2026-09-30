/**
 * The ranging session schedule (standard §10.32.2): a session is a train of ranging blocks, each
 * block is split into ranging rounds, and each round into ranging slots.
 *
 * The block, round and slot lengths are fixed before the session starts, in every mode. What the
 * schedule decides is who owns a slot. In a **time-scheduled** session (§10.32.3) every slot
 * belongs to exactly one device: no device ever contends for the medium, so a ranging exchange
 * has no backoff, no NAV and no retry, and its reply times are known to the nanosecond in
 * advance. In a **contention** round (§10.32.2 schedule mode 0) the response phase belongs to
 * nobody in particular - each anchor draws a slot in it - so two anchors can and do land in one
 * slot. One tag owns one round per block either way, so N tags need N rounds inside the block.
 *
 * A round is laid out as
 *   SS-TWR:            slot 0 Poll (tag) | slots 1..A Response (anchor 0..A-1)
 *   SS-TWR deferred:   … | slots A+1..2A deferred reply-time message (anchor 0..A-1)
 *   DS-TWR:      … | slot A+1 Final (tag) | slots A+2..2A+1 Report (anchor 0..A-1)
 *   contention:  slot 0 Poll (tag) | slots 1..S Response (whichever anchors drew the slot)
 *   DL-TDoA: slot 0 Poll (anchor 0) | slots 1..A-1 Response (anchor 1..A-1) | slot A Final (anchor 0)
 *   UL-TDoA: slot 0 Blink (tag)
 *   m2m SS:  slots 0..N-1, participant i in slot i — its one transmission asks everyone after it
 *            and answers everyone before it (standard §10.32.6)
 *   m2m DS:  the same N slots twice over, because tround2/treply2 need the earlier participant of
 *            a pair to transmit again (standard §10.32.7, design §3)
 *
 * SS-TWR's slot count depends on `replyTime` (design §4): embedded and fixed both carry the reply
 * time on the Response itself (or never put it on the air at all) and stay at `A + 1`; deferred
 * cannot — the anchor does not yet know the Response's own send time while sending it — so it
 * answers empty and follows up, once it has read that timestamp back, with a message of its own in
 * a slot of its own: `2A + 1` slots in total. DS-TWR's slot count never moves with `replyTime`: a
 * deferred Final just carries less (design §4), on the same A+2+A slots.
 */
import { byCodeUnit } from '../engine/hash'
import type { NbLbt, NbReportMode, NodeCfg, UwbMode, UwbSessionCfg } from '../model/scenario'
import type { Ns } from '../model/types'
import { mmsLayout, mmsSlotsPerMs, type MmsLayout, type MmsPhy } from './mms'
import { mmsResponders, rstuNs, uwbSlotsPerTag, type UwbReplyTime } from './phy'

export { rstuNs }

export interface RoundPlan {
  method: 'ss' | 'ds'
  anchors: number
  /**
   * `mode: 'm2m'` only (design §5): the round's participant count, and **the field every
   * many-to-many path reads**. It is the very same number `anchors` holds — one caller-supplied
   * "how many others" argument, read under whichever name means something for the mode actually
   * running — so the two alias each other in every mode, and `tests/uwb/m2m-round.test.ts` pins
   * that (Ruling 8 of the slice ledger) rather than leaving it incidental.
   *
   * The aliasing is worth a name of its own because **`anchors` means two different things by
   * mode.** In a two-way round it counts the devices *other than* the tag, so three anchors is
   * four devices; in many-to-many it counts *everyone*, so three participants is three devices.
   * Same number, different quantity — and anything that reads `plan.anchors` in `'m2m'` while
   * meaning "the devices besides the initiator" is wrong by one. Renaming `anchors` to something
   * mode-neutral is the real fix and is deliberately **not** done here: it is read across `src/`
   * and `tests/`, and a rename landing beside a behavioural change is what this branch has twice
   * paid for. It joins `uwbSlotsPerTag`'s own deferred rename (`phy.ts`, Ruling 4) in one later
   * sweep commit, when nothing else is moving.
   *
   * Meaningless outside `'m2m'`; no other reader touches it.
   */
  participants: number
  slots: number
  slotNs: Ns
  roundNs: Ns
  blockNs: Ns
  roundsPerBlock: number
  /** Schedule this round was planned under (standard §10.32.2 / §10.32.3). */
  schedule: 'time' | 'contention'
  /** The session's response-phase window; meaningful only when `schedule` is 'contention'. */
  contentionSlots: number
  /** What the round measures: two-way ranges, or one-way time differences (§10.32.3). */
  mode: UwbMode
  /** Where the two-way reply time travels (design §2/§4): embedded in the Response, carried by a
   * deferred follow-up message of its own, or never sent at all. Read off the session's own `cfg`
   * here, in the one place both ends of a round already have to agree — `uwbSlotsPerTag` needs it
   * to size a deferred SS round, and `slotAction` needs it to know whether slots A+1…2A exist. */
  replyTime: UwbReplyTime
  /**
   * `replyTime: 'fixed'` only: the first responder's fixed reply delay, in nanoseconds, converted
   * from the session's `fixedReplyRstu` exactly once, here — the same reason `slotNs` and `roundNs`
   * are converted here rather than left as RSTU for a device to redo: a round has exactly one
   * nanosecond value for this delay, and a device converting its own copy is a second chance for
   * the two ends of a round to disagree on it.
   */
  fixedReplyNs: Ns
  /** Set exactly when `mode` is 'mms': everything an MMS pair round is laid out from, resolved
   * once here so that no device re-derives it — the two ends of a round must agree on the slot
   * every fragment sits in, and a second copy of `mmsLayout` at the device would be a second
   * chance to disagree. */
  mms?: MmsRoundPlan
}

/** The MMS half of a round plan (P802.15.4ab): the train both devices cut their fragments from,
 * the slot table those fragments and the narrowband messages sit in, and the three control-plane
 * settings a device needs in the round itself. */
export interface MmsRoundPlan {
  phy: MmsPhy
  layout: MmsLayout
  /** The round is one initiator and every anchor of the session (P802.15.4ab one-to-many
   * ranging), rather than one tag–anchor pair. `layout.responders` is the count it implies. */
  oneToMany: boolean
  /**
   * How far apart this round actually spaces one train's fragments, in nanoseconds:
   * `layout.fragGapSlots` slots of `slotNs`. The layout is the only thing that decides that
   * count — this field is a unit conversion of it and nothing more, because the round's two
   * readings of the spacing (the slots the fragments are placed in, and the ruler the receiver
   * measures with) have to be the same reading.
   *
   * An interleaved round spaces them (R + 1) slots, the width of one "millisecond" of its shared
   * ranging phase. A true millisecond (`MS_NS`) is the **pairwise round at the draft's 600 RSTU
   * slot** — which every shipped scene runs — and nothing else: an MMS slot must be a multiple of
   * 300 RSTU and two of them must hold the 608.2 µs REPORT, so 600 RSTU is the shortest legal slot
   * and no legal slot makes (R + 1) of them a millisecond for R > 1. A one-to-many interleaved
   * round's fragments are therefore always further apart than the draft's millisecond, and the
   * answer is to say so rather than to look for a slot that fixes it.
   *
   * A non-interleaved round has one transmitter per sub-round, so the device count drops out and
   * the gap is a millisecond's worth of slots whatever R is — the one thing that shape is better
   * at. It is never *less* than a millisecond either, which matters: the gap is what earns a
   * fragment its millisecond of regulatory energy budget, and half the gap would be twice the
   * permitted mean power.
   *
   * The receiver measures its clock ratio and walks its RMARKER back over *this* span rather
   * than over the nominal millisecond, because this is the span the schedule really produced —
   * a receiver that assumed 1 ms in a round that spaces them at 2 ms would read a clock ratio of
   * 2 and a range of tens of kilometres.
   */
  fragGapNs: Ns
  report: NbReportMode
  /** The session's narrowband allow list; the block's own channel is drawn from it per block.
   * **Empty under Config 1**, which has no narrowband radio at all — so no channel is drawn and
   * `nbLbt` has nothing to sense. 4ab draft 15-25/0194r0 */
  nbChannels: number[]
  nbLbt: NbLbt
}

/**
 * The fixed shape of one round, and how many of them fit in a block.
 *
 * Two-way ranging and UL-TDoA give each tag a round of its own, and as many of them fit in the
 * block as the arithmetic allows. A DL-TDoA block holds exactly one round — the anchors' own,
 * run whether or not anyone is listening — because every tag in the scenario positions itself
 * from that same round; a second copy would only cost air.
 */
export function roundPlan(cfg: UwbSessionCfg, anchors: number): RoundPlan {
  // How many slots a millisecond of the MMS cycle costs at this session's slot length: the layout
  // needs it, and so does the slot count below, which is the same layout measured.
  const slotsPerMs = mmsSlotsPerMs(cfg.slotRstu)
  const slots = uwbSlotsPerTag(
    cfg.method, anchors, cfg.schedule, cfg.contentionSlots, cfg.mode, cfg.mms, slotsPerMs, cfg.replyTime,
  )
  const slotNs = rstuNs(cfg.slotRstu)
  const layout = cfg.mode === 'mms' ? mmsLayout(cfg.mms, mmsResponders(cfg.mms, anchors), slotsPerMs) : null
  const roundNs = slots * slotNs
  const blockNs = rstuNs(cfg.blockRstu)
  return {
    method: cfg.method, anchors, participants: anchors, slots, slotNs, roundNs, blockNs,
    // One round per block in the two modes whose round belongs to the whole group rather than to
    // one tag: DL-TDoA's anchor round, which every tag positions itself from, and a many-to-many
    // round, which holds every participant at once (design §5). In both, a second copy of the
    // round inside the block would only cost air — and the number is read by the editor's own
    // plan note, so answering "how many would fit" there would be a lie about what runs.
    roundsPerBlock: cfg.mode === 'dl-tdoa' || cfg.mode === 'm2m' ? 1 : Math.floor(blockNs / roundNs),
    schedule: cfg.schedule, contentionSlots: cfg.contentionSlots, mode: cfg.mode,
    replyTime: cfg.replyTime, fixedReplyNs: rstuNs(cfg.fixedReplyRstu),
    // Copied, not referenced: a plan outlives the scenario object it was built from, and a
    // device reading the train's shape must not be able to see it edited underneath.
    ...(layout
      ? {
        mms: {
          phy: { ...cfg.mms },
          layout,
          oneToMany: cfg.mms.oneToMany,
          // Read off the layout, never worked out again here: the layout is what placed the
          // fragments, so it is the only thing that knows how far apart it placed them.
          fragGapNs: layout.fragGapSlots * slotNs,
          report: cfg.mms.report,
          nbChannels: [...cfg.mms.nbChannels],
          nbLbt: cfg.mms.nbLbt,
        },
      }
      : {}),
  }
}

/** Absolute start of one slot of one round of one block. */
export function slotStartNs(p: RoundPlan, block: number, round: number, slot: number): Ns {
  return block * p.blockNs + round * p.roundNs + slot * p.slotNs
}

/**
 * Many-to-many's participant order (design §5): every UWB node of the scenario, sorted by node
 * id — not by the order the scenario's own node list happens to hold them in.
 *
 * `model`: the standard leaves slot ownership to a scheduling table the devices negotiate
 * (§10.32.2), and this simulator has no such table to negotiate — it has to make the same
 * decision some other deterministic way. Node id is that way, chosen over scenario order
 * specifically because scenario order is not stable: the editor's own add/delete/reorder
 * operations change it, so two floor plans that describe the same geometry — the same nodes, the
 * same positions, added in a different order — would otherwise get a different slot assignment
 * and a different timeline hash for no physical reason at all. Sorted with `byCodeUnit`
 * (engine/hash.ts), the same tie-break the timeline hash's own same-instant ordering already
 * uses, so this list and that hash cannot disagree about what "deterministic order" means.
 *
 * Only `kind: 'uwb'` nodes are participants: `uwb.role` decides how a node is drawn, never
 * whether it takes part (design §5).
 */
export function m2mParticipants(nodes: NodeCfg[]): string[] {
  return nodes.filter((n) => n.kind === 'uwb').map((n) => n.id).sort(byCodeUnit)
}

/** Who transmits in a slot, and what. In two-way ranging the tag opens and closes the round; in
 * DL-TDoA the anchors own every slot (anchor 0 polls and finals, anchors 1…N−1 respond) and the
 * tags only listen; in UL-TDoA the tag's single slot holds its blink. */
export type SlotAction =
  | { kind: 'uwbPoll'; tx: 'tag' }
  | { kind: 'uwbPoll'; tx: 'anchor'; anchor: number }
  | { kind: 'uwbResp'; tx: 'anchor'; anchor: number }
  // SS-TWR deferred only (design §4): the follow-up message that carries the reply time the
  // Response could not, in the round's own slots A+1…2A — a kind of its own, not `'uwbResp'`
  // again, because a round can now put two different messages on the air per anchor.
  | { kind: 'uwbSsDefer'; tx: 'anchor'; anchor: number }
  | { kind: 'uwbFinal'; tx: 'tag' }
  | { kind: 'uwbFinal'; tx: 'anchor'; anchor: number }
  | { kind: 'uwbReport'; tx: 'anchor'; anchor: number }
  | { kind: 'uwbBlink'; tx: 'tag' }
  // Many-to-many (standard §10.32.6 SS / §10.32.7 DS, design §5): participant `index`'s one
  // transmission of pass `pass`. It is a kind of its own, not `'uwbPoll'` or `'uwbResp'` again,
  // because one transmission is both at once — the question for every later participant and the
  // answer for every earlier one — and `transmitFor` has to be able to tell that apart from a
  // two-way round's Poll or Response. `tx: 'peer'` for the same reason: every participant plays
  // both roles, so neither 'tag' nor 'anchor' names it honestly. SS has one pass (`pass: 0`); DS
  // has two (design §3) — `pass: 1` is the second pass a DS round needs so `tround2`/`treply2`
  // have a transmission of the earlier participant's to attach to.
  | { kind: 'uwbM2m'; tx: 'peer'; index: number; pass: 0 | 1 }
  // P802.15.4ab, the pairwise MMS cycle. The pair's anchor is always `anchor: 0` — a pair round
  // holds exactly one responder, and the network is what maps round t·A + k to anchor k.
  | { kind: 'nbPoll'; tx: 'tag' }
  | { kind: 'nbResp'; tx: 'anchor'; anchor: number }
  | { kind: 'uwbRsf' | 'uwbRif'; tx: 'tag' | 'anchor'; anchor: number; index: number }
  | { kind: 'nbReport'; tx: 'tag' | 'anchor'; anchor: number }
  // …and the same three messages under Config 1, which has no narrowband radio: one SP0 packet
  // format on the UWB PHY, with the role that names it. The slot is the same slot — it is the
  // radio underneath that changed. 4ab draft 15-25/0194r0
  | { kind: 'uwbSp0'; role: 'poll'; tx: 'tag' }
  | { kind: 'uwbSp0'; role: 'resp'; tx: 'anchor'; anchor: number }
  | { kind: 'uwbSp0'; role: 'report'; tx: 'tag' | 'anchor'; anchor: number }
  /** Nobody transmits: the second slot of each two-slot narrowband window, a ranging slot the
   * train does not reach, and a report slot the session's report mode does not use. */
  | { kind: 'idle' }

export function slotAction(p: RoundPlan, slot: number): SlotAction {
  if (p.mode === 'dl-tdoa') {
    // N + 1 slots: anchor 0's Poll, one Response per other anchor in its own slot, anchor 0's
    // Final. The responder in slot i is anchor i, which is what lets the Final list its RX times
    // in slot order without naming anyone.
    if (slot === 0) return { kind: 'uwbPoll', tx: 'anchor', anchor: 0 }
    if (slot < p.anchors) return { kind: 'uwbResp', tx: 'anchor', anchor: slot }
    if (slot === p.anchors) return { kind: 'uwbFinal', tx: 'anchor', anchor: 0 }
    throw new Error(`slotAction: DL-TDoA round has ${p.slots} slots, asked for ${slot}`)
  }
  if (p.mode === 'ul-tdoa') {
    if (slot === 0) return { kind: 'uwbBlink', tx: 'tag' }
    throw new Error(`slotAction: UL-TDoA round has ${p.slots} slots, asked for ${slot}`)
  }
  if (p.mode === 'mms') return mmsSlotAction(p, slot)
  if (p.mode === 'm2m') {
    // SS: one pass of N slots, participant i in slot i. DS: two passes of N (design §3), pass 0
    // in slots 0..N-1 and pass 1 immediately after in slots N..2N-1 — `uwbSlotsPerTag`'s own N and
    // 2N, walked back into a (pass, index) pair rather than assumed from a second formula.
    const n = p.participants
    if (slot < n) return { kind: 'uwbM2m', tx: 'peer', index: slot, pass: 0 }
    if (p.method === 'ds' && slot < 2 * n) return { kind: 'uwbM2m', tx: 'peer', index: slot - n, pass: 1 }
    throw new Error(`slotAction: m2m round has ${p.slots} slots, asked for ${slot}`)
  }
  if (slot === 0) return { kind: 'uwbPoll', tx: 'tag' }
  if (p.schedule === 'contention') {
    if (slot <= p.contentionSlots) return { kind: 'uwbResp', tx: 'anchor', anchor: -1 }
    throw new Error(`slotAction: contention round has ${p.slots} slots, asked for ${slot}`)
  }
  if (slot <= p.anchors) return { kind: 'uwbResp', tx: 'anchor', anchor: slot - 1 }
  if (p.method === 'ss') {
    // Deferred only: slots A+1…2A are the follow-up messages, one per anchor, in the same
    // anchor order as the Responses that preceded them (design §4).
    if (p.replyTime === 'deferred' && slot <= 2 * p.anchors) {
      return { kind: 'uwbSsDefer', tx: 'anchor', anchor: slot - p.anchors - 1 }
    }
    throw new Error(`slotAction: SS round has ${p.slots} slots, asked for ${slot}`)
  }
  if (slot === p.anchors + 1) return { kind: 'uwbFinal', tx: 'tag' }
  if (slot <= 2 * p.anchors + 1) return { kind: 'uwbReport', tx: 'anchor', anchor: slot - p.anchors - 2 }
  throw new Error(`slotAction: DS round has ${p.slots} slots, asked for ${slot}`)
}

/**
 * One slot of an MMS round (the table of the spec's "The ranging cycle"). In the interleaved
 * pairwise round slots 0–1 are the initiator's narrowband POLL window and 2–3 the responder's
 * RESP; the ranging phase alternates initiator/responder inside each millisecond; the last four
 * slots are the two report windows. 4ab draft 15-22/0381r5 §1.1
 *
 * Nothing below assumes that shape, because §10.39.7's sub-rounds do not have it: there each
 * device's narrowband window is the head of its own sub-round, so `controlSlots` is a total
 * scattered through the round rather than a prefix at the top of it, and slot 0 belongs to the
 * initiator only when `reversedOrder` did not send the responders first. So every window is
 * *asked for* — `pollSlot`, `respSlot`, `reportSlot` — and every other slot of the round is
 * offered to `slotFragment`, which answers null for the ones no fragment owns.
 *
 * Every fragment slot here comes from `mmsLayout.slotFragment`, the inverse of the
 * `fragmentSlot` the devices place their own fragments with — one map, read both ways, so that
 * the schedule and the device cannot disagree about where a fragment sits. (`tests/uwb/
 * session.test.ts` walks every legal train and every slot to keep that true, and
 * `tests/uwb/mms-schedule.test.ts` pins the interleaved answers slot for slot.)
 */
function mmsSlotAction(p: RoundPlan, slot: number): SlotAction {
  const m = p.mms
  if (!m) throw new Error('slotAction: an MMS round plan carries no MMS parameters')
  if (!Number.isInteger(slot) || slot < 0 || slot >= p.slots) {
    throw new Error(`slotAction: MMS round has ${p.slots} slots, asked for ${slot}`)
  }
  const { layout, report } = m
  // Which radio the round's three control messages ride. Config 2's are narrowband frames;
  // Config 1 has no narrowband radio, so the same three are SP0 packets on the UWB PHY. The slot
  // table below does not change with it — only what is put in the slot. 4ab draft 15-25/0194r0
  const sp0 = m.phy.control === 'uwbd'
  // --- control ---
  // The initiator's POLL opens the round, and every responder then answers in a RESP window of
  // its own — one window in a pair round, N in a one-to-many one, in responder order (4ab draft
  // 15-22/0381r5 Table 1.6.3.1, POLL 0x10 carries the responder list its slots follow). Where
  // those windows are is the layout's business: gathered at the top of an interleaved round, one
  // at the head of each sub-round otherwise.
  //
  // …and whether there are any is the control plane's: a zero-length control phase has no POLL
  // and no RESP window at all, so the layout is not asked where they are. The ranging packet's
  // own leading SYNC+SFD fragment is doing their work, and it is a fragment slot like any other.
  if (layout.controlSlots > 0) {
    if (slot === layout.pollSlot()) {
      return sp0 ? { kind: 'uwbSp0', role: 'poll', tx: 'tag' } : { kind: 'nbPoll', tx: 'tag' }
    }
    for (let k = 0; k < layout.responders; k++) {
      if (slot === layout.respSlot(k)) {
        return sp0
          ? { kind: 'uwbSp0', role: 'resp', tx: 'anchor', anchor: k }
          : { kind: 'nbResp', tx: 'anchor', anchor: k }
      }
    }
  }
  // --- ranging ---
  // The one map, read backwards: `mmsLayout.slotFragment` is built from the same arithmetic as
  // `fragmentSlot`, which is what the devices place their own fragments with. The second slot of
  // every narrowband window, the slots between two fragments a millisecond apart, the idle
  // milliseconds between the two trains, the tail of a ranging phase the draft sizes at 20 slots
  // whatever the train is, and the whole report phase are the slots it answers null for — nobody
  // owns them, so there is no phase bound to test here beyond its own.
  const frag = layout.slotFragment(slot)
  if (frag) {
    return {
      kind: frag.kind === 'rsf' ? 'uwbRsf' : 'uwbRif',
      tx: frag.side === 'initiator' ? 'tag' : 'anchor',
      anchor: frag.responder,
      index: frag.index,
    }
  }
  // --- report ---
  // Present in every round, whatever became of the control phase: the draft sizes the two from
  // separate pairs of parameters, and its own non-interleaved figure draws a Report over a
  // zero-length control phase. So a round whose poll and response are the packet itself still
  // carries its measured times back in a frame — which is what lets it range at all.
  // 4ab draft 15-25/0194r0
  if (layout.reportSlots > 0) {
    for (let k = 0; k < layout.responders; k++) {
      if (slot === layout.reportSlot('responder', k)) {
        if (report === 'initiator') return { kind: 'idle' }
        return sp0
          ? { kind: 'uwbSp0', role: 'report', tx: 'anchor', anchor: k }
          : { kind: 'nbReport', tx: 'anchor', anchor: k }
      }
      if (slot === layout.reportSlot('initiator', k)) {
        if (report === 'responder') return { kind: 'idle' }
        return sp0
          ? { kind: 'uwbSp0', role: 'report', tx: 'tag', anchor: k }
          : { kind: 'nbReport', tx: 'tag', anchor: k }
      }
    }
  }
  return { kind: 'idle' }
}
