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
 *   SS-TWR:      slot 0 Poll (tag) | slots 1..A Response (anchor 0..A-1)
 *   DS-TWR:      … | slot A+1 Final (tag) | slots A+2..2A+1 Report (anchor 0..A-1)
 *   contention:  slot 0 Poll (tag) | slots 1..S Response (whichever anchors drew the slot)
 *   DL-TDoA: slot 0 Poll (anchor 0) | slots 1..A-1 Response (anchor 1..A-1) | slot A Final (anchor 0)
 *   UL-TDoA: slot 0 Blink (tag)
 */
import type { NbLbt, NbReportMode, UwbMode, UwbSessionCfg } from '../model/scenario'
import type { Ns } from '../model/types'
import { mmsLayout, type MmsLayout, type MmsPhy } from './mms'
import { mmsResponders, rstuNs, uwbSlotsPerTag } from './phy'

export { rstuNs }

export interface RoundPlan {
  method: 'ss' | 'ds'
  anchors: number
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
   * How far apart this round actually spaces one train's fragments, in nanoseconds: the
   * (R + 1) slots one "millisecond" of the ranging phase is made of. At the draft's 600 RSTU
   * slot and one responder it is a true millisecond (`MS_NS`), which is the case every shipped
   * scene runs; a one-to-many round stretches it unless the slot is shortened to 1 ms / (R + 1).
   *
   * The receiver measures its clock ratio and walks its RMARKER back over *this* span rather
   * than over the nominal millisecond, because this is the span the schedule really produced —
   * a receiver that assumed 1 ms in a round that spaces them at 2 ms would read a clock ratio of
   * 2 and a range of tens of kilometres.
   */
  fragGapNs: Ns
  report: NbReportMode
  /** The session's narrowband allow list; the block's own channel is drawn from it per block. */
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
  const slots = uwbSlotsPerTag(cfg.method, anchors, cfg.schedule, cfg.contentionSlots, cfg.mode, cfg.mms)
  const slotNs = rstuNs(cfg.slotRstu)
  const roundNs = slots * slotNs
  const blockNs = rstuNs(cfg.blockRstu)
  return {
    method: cfg.method, anchors, slots, slotNs, roundNs, blockNs,
    roundsPerBlock: cfg.mode === 'dl-tdoa' ? 1 : Math.floor(blockNs / roundNs),
    schedule: cfg.schedule, contentionSlots: cfg.contentionSlots, mode: cfg.mode,
    // Copied, not referenced: a plan outlives the scenario object it was built from, and a
    // device reading the train's shape must not be able to see it edited underneath.
    ...(cfg.mode === 'mms'
      ? {
        mms: {
          phy: { ...cfg.mms },
          layout: mmsLayout(cfg.mms, mmsResponders(cfg.mms, anchors)),
          oneToMany: cfg.mms.oneToMany,
          fragGapNs: (mmsResponders(cfg.mms, anchors) + 1) * slotNs,
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

/** Who transmits in a slot, and what. In two-way ranging the tag opens and closes the round; in
 * DL-TDoA the anchors own every slot (anchor 0 polls and finals, anchors 1…N−1 respond) and the
 * tags only listen; in UL-TDoA the tag's single slot holds its blink. */
export type SlotAction =
  | { kind: 'uwbPoll'; tx: 'tag' }
  | { kind: 'uwbPoll'; tx: 'anchor'; anchor: number }
  | { kind: 'uwbResp'; tx: 'anchor'; anchor: number }
  | { kind: 'uwbFinal'; tx: 'tag' }
  | { kind: 'uwbFinal'; tx: 'anchor'; anchor: number }
  | { kind: 'uwbReport'; tx: 'anchor'; anchor: number }
  | { kind: 'uwbBlink'; tx: 'tag' }
  // P802.15.4ab, the pairwise MMS cycle. The pair's anchor is always `anchor: 0` — a pair round
  // holds exactly one responder, and the network is what maps round t·A + k to anchor k.
  | { kind: 'nbPoll'; tx: 'tag' }
  | { kind: 'nbResp'; tx: 'anchor'; anchor: number }
  | { kind: 'uwbRsf' | 'uwbRif'; tx: 'tag' | 'anchor'; anchor: number; index: number }
  | { kind: 'nbReport'; tx: 'tag' | 'anchor'; anchor: number }
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
  if (slot === 0) return { kind: 'uwbPoll', tx: 'tag' }
  if (p.schedule === 'contention') {
    if (slot <= p.contentionSlots) return { kind: 'uwbResp', tx: 'anchor', anchor: -1 }
    throw new Error(`slotAction: contention round has ${p.slots} slots, asked for ${slot}`)
  }
  if (slot <= p.anchors) return { kind: 'uwbResp', tx: 'anchor', anchor: slot - 1 }
  if (p.method === 'ss') throw new Error(`slotAction: SS round has ${p.slots} slots, asked for ${slot}`)
  if (slot === p.anchors + 1) return { kind: 'uwbFinal', tx: 'tag' }
  if (slot <= 2 * p.anchors + 1) return { kind: 'uwbReport', tx: 'anchor', anchor: slot - p.anchors - 2 }
  throw new Error(`slotAction: DS round has ${p.slots} slots, asked for ${slot}`)
}

/**
 * One slot of a pairwise MMS round (the table of the spec's "The ranging cycle"). Slots 0–1 are
 * the initiator's narrowband POLL window and 2–3 the responder's RESP; the ranging phase
 * alternates initiator/responder inside each millisecond; the last four slots are the two report
 * windows. 4ab draft 15-22/0381r5 §1.1
 *
 * Every fragment slot here comes from `mmsLayout.slotFragment`, the inverse of the
 * `fragmentSlot` the devices place their own fragments with — one map, read both ways, so that
 * the schedule and the device cannot disagree about where a fragment sits. (`tests/uwb/
 * session.test.ts` walks every legal train and every slot to keep that true.)
 */
function mmsSlotAction(p: RoundPlan, slot: number): SlotAction {
  const m = p.mms
  if (!m) throw new Error('slotAction: an MMS round plan carries no MMS parameters')
  if (!Number.isInteger(slot) || slot < 0 || slot >= p.slots) {
    throw new Error(`slotAction: MMS round has ${p.slots} slots, asked for ${slot}`)
  }
  const { layout, report } = m
  // --- control ---
  // The initiator's POLL opens the round, and every responder then answers in a RESP window of
  // its own — one window in a pair round, N in a one-to-many one, in responder order (4ab draft
  // 15-22/0381r5 Table 1.6.3.1, POLL 0x10 carries the responder list its slots follow).
  if (slot === 0) return { kind: 'nbPoll', tx: 'tag' }
  if (slot < layout.controlSlots) {
    for (let k = 0; k < layout.responders; k++) {
      if (slot === layout.respSlot(k)) return { kind: 'nbResp', tx: 'anchor', anchor: k }
    }
    return { kind: 'idle' }
  }
  // --- ranging ---
  // The one map, read backwards: `mmsLayout.slotFragment` is built from the same arithmetic as
  // `fragmentSlot`, which is what the devices place their own fragments with. The idle
  // milliseconds between the two trains, and the tail of a ranging phase the draft sizes at 20
  // slots whatever the train is, are the slots it answers null for — nobody owns them.
  if (slot < layout.controlSlots + layout.rpSlots) {
    const frag = layout.slotFragment(slot)
    if (!frag) return { kind: 'idle' }
    return {
      kind: frag.kind === 'rsf' ? 'uwbRsf' : 'uwbRif',
      tx: frag.side === 'initiator' ? 'tag' : 'anchor',
      anchor: frag.responder,
      index: frag.index,
    }
  }
  // --- report ---
  for (let k = 0; k < layout.responders; k++) {
    if (slot === layout.reportSlot('responder', k)) {
      return report === 'initiator' ? { kind: 'idle' } : { kind: 'nbReport', tx: 'anchor', anchor: k }
    }
    if (slot === layout.reportSlot('initiator', k)) {
      return report === 'responder' ? { kind: 'idle' } : { kind: 'nbReport', tx: 'tag', anchor: k }
    }
  }
  return { kind: 'idle' }
}
