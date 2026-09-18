/**
 * The ranging session schedule (standard §10.32.2, time-scheduled mode of
 * §10.32.3): a session is a train of
 * ranging blocks, each block is split into ranging rounds, each round into
 * ranging slots, and every slot belongs to exactly one device.
 *
 * The shape is fixed before the session starts — that is the whole point of a
 * scheduled (as opposed to contention-based) ranging session: no device ever
 * contends for the medium, so a ranging exchange has no backoff, no NAV and no
 * retry, and its reply times are known to the nanosecond in advance. One tag
 * owns one round per block, so N tags need N rounds inside the block.
 *
 * A round is laid out as
 *   SS-TWR:  slot 0 Poll (tag) | slots 1..A Response (anchor 0..A-1)
 *   DS-TWR:  … | slot A+1 Final (tag) | slots A+2..2A+1 Report (anchor 0..A-1)
 */
import type { UwbSessionCfg } from '../model/scenario'
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
}

/** The fixed shape of one round, and how many of them fit in a block. */
export function roundPlan(cfg: UwbSessionCfg, anchors: number): RoundPlan {
  const slots = uwbSlotsPerTag(cfg.method, anchors)
  const slotNs = rstuNs(cfg.slotRstu)
  const roundNs = slots * slotNs
  const blockNs = rstuNs(cfg.blockRstu)
  return { method: cfg.method, anchors, slots, slotNs, roundNs, blockNs, roundsPerBlock: Math.floor(blockNs / roundNs) }
}

/** Absolute start of one slot of one round of one block. */
export function slotStartNs(p: RoundPlan, block: number, round: number, slot: number): Ns {
  return block * p.blockNs + round * p.roundNs + slot * p.slotNs
}

/** Who transmits in a slot, and what. */
export type SlotAction =
  | { kind: 'uwbPoll'; tx: 'tag' }
  | { kind: 'uwbResp'; tx: 'anchor'; anchor: number }
  | { kind: 'uwbFinal'; tx: 'tag' }
  | { kind: 'uwbReport'; tx: 'anchor'; anchor: number }

export function slotAction(p: RoundPlan, slot: number): SlotAction {
  if (slot === 0) return { kind: 'uwbPoll', tx: 'tag' }
  if (slot <= p.anchors) return { kind: 'uwbResp', tx: 'anchor', anchor: slot - 1 }
  if (p.method === 'ss') throw new Error(`slotAction: SS round has ${p.slots} slots, asked for ${slot}`)
  if (slot === p.anchors + 1) return { kind: 'uwbFinal', tx: 'tag' }
  if (slot <= 2 * p.anchors + 1) return { kind: 'uwbReport', tx: 'anchor', anchor: slot - p.anchors - 2 }
  throw new Error(`slotAction: DS round has ${p.slots} slots, asked for ${slot}`)
}
