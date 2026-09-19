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
import type { UwbMode, UwbSessionCfg } from '../model/scenario'
import type { Ns } from '../model/types'
import { rstuNs, uwbSlotsPerTag } from './phy'

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
  const slots = uwbSlotsPerTag(cfg.method, anchors, cfg.schedule, cfg.contentionSlots, cfg.mode)
  const slotNs = rstuNs(cfg.slotRstu)
  const roundNs = slots * slotNs
  const blockNs = rstuNs(cfg.blockRstu)
  return {
    method: cfg.method, anchors, slots, slotNs, roundNs, blockNs,
    roundsPerBlock: cfg.mode === 'dl-tdoa' ? 1 : Math.floor(blockNs / roundNs),
    schedule: cfg.schedule, contentionSlots: cfg.contentionSlots, mode: cfg.mode,
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
