/**
 * Many-to-many ranging for `UwbDevice` — IEEE Std 802.15.4-2024 §10.32.6 (SS-TWR, Figure 10-240) and
 * §10.32.7 (DS-TWR, Figure 10-241). Split out of `device.ts` like `device.tdoa.ts` and `device.mms.ts`,
 * every function taking the device as its first argument.
 *
 * ## The round (2026-11-11, W3 — audit #2)
 *
 * M initiators and N responders. The controller — this engine: initiator 0, the first tag by node id
 * (`session.ts#m2mRoles`) — sends the RCM in slot 0, fused with its own ranging initiation message
 * (§10.32.2 allows the merge when the controller is an initiator): ARC with Multi-node Mode 2
 * ("Multi-node many-to-many", Table 10-163), RR, an RDM IE (SIU = 1) that gives every other device its
 * Ranging Role and Ranging Slot Index (§10.32.9.8), and the RRMC IE. Then:
 *
 * - **Ranging initiation phase.** Initiators 1…M−1 each send a ranging initiation message (RRMC only)
 *   in the slot the RDM IE gave them. SS: Ranging Control Information 0, Reply Time Request 1. DS:
 *   Ranging Control Information 2.
 * - **Ranging response phase.** Each responder sends one response, broadcast. SS: one RRTI IE whose list
 *   carries a reply time per initiator it heard (§10.32.6: "insert an RRTI IE ... for each initiator").
 *   DS: an RRMC IE (3), starting the second round trip.
 * - **DS only, final.** Each initiator sends a final frame with an RRTI IE (its reply time to each
 *   responder's response) and an RMI IE (its round-trip time to each responder) (§10.32.7).
 *
 * Who computes: in SS each **initiator**, on each response ("Upon receipt of each MCPS-DATA.indication
 * primitive delivering a ranging response message, each initiator next higher layer has sufficient
 * information to calculate its TOF to that responder"); in DS each **responder**, on each final
 * ("Upon receiving the second MCPS-DATA.indication primitive reporting the arrival of the final RFRAME
 * from an initiator, each responder's next higher layer has sufficient information to calculate its
 * TOF to the initiator"). Nothing is reported back: Figures 10-240 and 10-241 request no result.
 *
 * SS: M + N frames, M × N ranges at the initiators. DS: 2M + N frames, M × N ranges at the responders.
 *
 * ## What a device knows
 *
 * The controller wrote the schedule, so it knows every slot's owner. Every other device knows the
 * round only from the RCM it decoded (§10.32.9.8: "Upon reception of the RCM, a controlee knows whether
 * it is selected to participate"): the RDM IE's elements, sorted by slot index, are its schedule. A
 * device that did not decode the RCM, or that the RDM IE does not list, takes no part in the round —
 * it neither transmits nor listens after slot 0.
 *
 * The final frame's slot is not in the RDM IE (one element per device, §10.32.9.8): the DS final
 * phase follows the response phase in the initiation order — this engine's choice, the standard
 * leaves it to the controller's next higher layer.
 */
import type { FrameDesc } from '../model/frames'
import { counterDiff } from './clock'
import { makeFinal, makeInit, makeM2mResp, makePoll, type UwbArcFields } from './frames'
import { dsTwr, ssTwrCorrected, ssTwrRaw } from './ranging'
import { slotAction, type RoundPlan } from './session'
import type { RoundState, ScheduledAction, UwbDevice } from './device'
import { reportRange } from './device.report'

/** A many-to-many round's two role lists, each in slot order: initiator k sends its initiation in
 * the k-th initiation slot, responder j its response in the j-th response slot. */
export interface M2mSchedule {
  initiators: string[]
  responders: string[]
}

/** What one device holds for one many-to-many round. Null in every other mode. */
export interface M2mRoundState {
  /** The round's controller (initiator 0). Known in advance at every device, like a two-way round's
   * tag: it is whose RCM a controlee listens for in slot 0. */
  controller: string
  /** The round as this device knows it: the controller's own lists, or what the RDM IE of the RCM
   * this device decoded says. Null at a controlee until then — and for the whole round at one that
   * missed the RCM or is not listed. */
  schedule: M2mSchedule | null
  /** Initiator: its own initiation message's TX counter. */
  txInit: number | null
  /** DS initiator: each responder's response arrival, by responder id. */
  rxResp: Map<string, number>
  /** Responder: each initiator's initiation arrival, by initiator id — the reference times of its
   * RRTI reply times (SS) and the start of its Treply1 (DS). */
  rxInit: Map<string, number>
  /** Responder: its own response's TX counter. */
  txResp: number | null
}

/**
 * Open a many-to-many round at one device. `roles` is the scenario's role split; only the controller
 * reads it — it is the controller's next higher layer that decides the schedule. Every other device
 * starts with no schedule and learns its place from the RCM.
 */
export function freshM2m(selfId: string, roles: M2mSchedule): M2mRoundState {
  const controller = roles.initiators[0]
  if (controller === undefined) throw new Error('freshM2m: a many-to-many round needs at least one initiator')
  return {
    controller,
    schedule: selfId === controller
      ? { initiators: [...roles.initiators], responders: [...roles.responders] }
      : null,
    txInit: null,
    rxResp: new Map(),
    rxInit: new Map(),
    txResp: null,
  }
}

/** The slot the round plan gives `phase`'s `index`-th device, or null. Read off `slotAction`, the one
 * layout, so the RDM IE the controller writes and the schedule the network runs cannot disagree. */
export function m2mSlotOf(plan: RoundPlan, phase: 'init' | 'resp' | 'final', index: number): number | null {
  for (let s = 0; s < plan.rangingSlots; s++) {
    const a = slotAction(plan, s)
    if (a.kind === 'uwbM2m' && a.phase === phase && a.index === index) return s
  }
  return null
}

/** Who owns a slot of the round, as this device's schedule says. */
function ownerOf(sched: M2mSchedule, phase: 'init' | 'resp' | 'final', index: number): string | undefined {
  return phase === 'resp' ? sched.responders[index] : sched.initiators[index]
}

/**
 * One slot of a many-to-many round. Slot 0 is the controller's RCM, which every device listens for.
 * After it a device acts only on the schedule it holds: it transmits in its own slots, an initiator
 * listens to the responses, a responder listens to the initiation messages and (DS) the finals, and
 * nobody listens to a device of its own role.
 */
export function onM2mSlot(dev: UwbDevice, slot: number, action: ScheduledAction, r: RoundState): void {
  const m = requireM2m(r, 'onM2mSlot')
  if (action.kind !== 'uwbM2m') {
    throw new Error(`onM2mSlot: a many-to-many round scheduled a '${action.kind}' action in slot ${slot}`)
  }
  if (action.phase === 'init' && action.index === 0) {
    if (dev.id === m.controller) dev.transmitFor(action, slot, r, { tag: m.controller, anchors: [] })
    else dev.listenFor(slot, m.controller, 'uwbPoll')
    return
  }
  const sched = m.schedule
  if (sched === null) return
  const owner = ownerOf(sched, action.phase, action.index)
  // The RDM IE and the plan are written from one layout (`m2mSlotOf`), so a slot whose owner the
  // schedule does not have means the two disagree — not a state the model can be in on purpose.
  if (owner === undefined) {
    throw new Error(`onM2mSlot: slot ${slot} (${action.phase} ${action.index}) has no owner in the schedule this device holds`)
  }
  if (owner === dev.id) {
    dev.transmitFor(action, slot, r, { tag: m.controller, anchors: [] })
    return
  }
  const iAmResponder = sched.responders.includes(dev.id)
  const iAmInitiator = sched.initiators.includes(dev.id)
  if (action.phase === 'resp' && iAmInitiator) dev.listenFor(slot, owner, 'uwbResp')
  else if (action.phase === 'init' && iAmResponder) dev.listenFor(slot, owner, 'uwbInit')
  else if (action.phase === 'final' && iAmResponder) dev.listenFor(slot, owner, 'uwbFinal')
}

/** This device's transmission in its own slot. `arc` is the RCM's ARC IE (`device.ts#arcFieldsFor`). */
export function transmitM2m(
  dev: UwbDevice, action: ScheduledAction, slot: number, r: RoundState, txCounter: number, arc: UwbArcFields,
): void {
  const m = requireM2m(r, 'transmitM2m')
  const sched = m.schedule
  if (action.kind !== 'uwbM2m' || sched === null) {
    throw new Error(`transmitM2m: asked to transmit a '${action.kind}' without a many-to-many schedule`)
  }
  const { plan, block, round } = r
  if (action.phase === 'init') {
    m.txInit = txCounter
    if (action.index > 0) {
      dev.send(makeInit(dev.id, plan.method, block, round, slot), txCounter)
      return
    }
    // The controller's RCM fused with its own initiation message: the RDM IE lists every other device
    // with its role and slot (standard §10.32.9.8, SIU = 1).
    const rdm = [
      ...sched.initiators.slice(1).map((id, k) => ({ id, slot: slotFor(plan, 'init', k + 1), initiator: true })),
      ...sched.responders.map((id, j) => ({ id, slot: slotFor(plan, 'resp', j), initiator: false })),
    ]
    dev.send(
      makePoll(dev.id, rdm.map((e) => e.id), plan.method, block, round, { arc, rdm }),
      txCounter,
    )
    return
  }
  if (action.phase === 'resp') {
    // A responder that heard no initiation message has nothing to answer: its slot stays empty.
    if (m.rxInit.size === 0) return
    m.txResp = txCounter
    // SS: one reply time per initiator heard, from that initiation's RMARKER to this frame's
    // (§10.29.8.1), in slot order. DS: none — the responder computes (§10.32.7).
    const rrti = sched.initiators
      .filter((id) => m.rxInit.has(id))
      .map((id) => ({ id, replyRctu: counterDiff(txCounter, m.rxInit.get(id)!) }))
    dev.send(makeM2mResp(dev.id, plan.method, block, round, slot, rrti), txCounter)
    return
  }
  // DS final: per responder whose response arrived, the first round-trip time (RMI IE) and the second
  // reply time (RRTI IE) (§10.32.7). An initiator that heard no response has nothing to report.
  const t1 = m.txInit
  if (t1 === null || m.rxResp.size === 0) return
  const times = sched.responders
    .filter((id) => m.rxResp.has(id))
    .map((id) => {
      const t4 = m.rxResp.get(id)!
      return { id, tround1: counterDiff(t4, t1), treply2: counterDiff(txCounter, t4) }
    })
  dev.send(makeFinal(dev.id, times, block, round, slot), txCounter)
}

/** A slot the layout must have; a missing one is a planner bug. */
function slotFor(plan: RoundPlan, phase: 'init' | 'resp' | 'final', index: number): number {
  const s = m2mSlotOf(plan, phase, index)
  if (s === null) throw new Error(`m2m: the round plan has no ${phase} slot for index ${index}`)
  return s
}

/**
 * A many-to-many frame has arrived (the slot's expectation already checked kind and sender).
 *
 * - The RCM: a controlee reads its schedule from the RDM IE and keeps the RCM (`holdRcm`, for the
 *   MMRCR bit, §10.36.1). A responder also takes it as the controller's initiation message.
 * - An initiation message, at a responder: its arrival is kept.
 * - SS response, at an initiator: its own RRTI element gives the reply time, and the range is done.
 * - DS response, at an initiator: its arrival is kept for the final.
 * - DS final, at a responder: its own RMI/RRTI element gives Tround1 and Treply2, and the range is done.
 *
 * A responder notes the receipt of every message from an initiator (standard §10.36.2.1's bit per slot).
 */
export function onM2mRx(
  dev: UwbDevice, r: RoundState, from: string, frame: FrameDesc, counter: number, coffs: number, fom: number,
): void {
  const m = requireM2m(r, 'onM2mRx')
  switch (frame.kind) {
    case 'uwbPoll': {
      const rdm = frame.uwb?.rdm ?? []
      const listed = rdm.find((e) => e.id === dev.id)
      dev.holdRcm(r, frame)
      // Not selected by the RDM IE: this device takes no part in the round.
      if (listed === undefined) return
      const bySlot = [...rdm].sort((a, b) => a.slot - b.slot)
      m.schedule = {
        initiators: [from, ...bySlot.filter((e) => e.initiator).map((e) => e.id)],
        responders: bySlot.filter((e) => !e.initiator).map((e) => e.id),
      }
      if (!listed.initiator) {
        m.rxInit.set(from, counter)
        dev.noteReceipt(from, r.block, r.round, r.slot, r.plan)
      }
      return
    }
    case 'uwbInit':
      m.rxInit.set(from, counter)
      dev.noteReceipt(from, r.block, r.round, r.slot, r.plan)
      return
    case 'uwbResp': {
      if (r.plan.method === 'ds') {
        m.rxResp.set(from, counter)
        return
      }
      const mine = frame.uwb?.rrti?.find((e) => e.id === dev.id)
      // The responder did not hear this initiator, so its response carries nothing for it.
      if (mine === undefined || m.txInit === null) return
      const tround = counterDiff(counter, m.txInit)
      const treply = mine.replyRctu
      // `coffs` is this reception's carrier-offset estimate, which puts the responder's reply time on
      // this device's timebase — the same correction a one-to-many initiator applies (`onResponse`).
      reportRange(dev, r, from, 'ss', ssTwrCorrected(tround, treply, coffs), ssTwrRaw(tround, treply), fom)
      return
    }
    case 'uwbFinal': {
      dev.noteReceipt(from, r.block, r.round, r.slot, r.plan)
      const mine = frame.uwb?.finalTimes?.find((e) => e.id === dev.id)
      const rxInit = m.rxInit.get(from)
      if (mine === undefined || mine.tround1 === undefined || mine.treply2 === undefined
        || rxInit === undefined || m.txResp === null) return
      const treply1 = counterDiff(m.txResp, rxInit) // T3 − T2, this responder's clock
      const tround2 = counterDiff(counter, m.txResp) // T6 − T3, this responder's clock
      // DS-TWR cancels the clock offset rather than correcting it, so there is no uncorrected reading.
      reportRange(dev, r, from, 'ds', dsTwr(mine.tround1, treply1, tround2, mine.treply2), undefined, fom)
      return
    }
    default:
      throw new Error(`onM2mRx: a '${frame.kind}' frame from ${from} in a many-to-many round`)
  }
}

/** The round's many-to-many state, or a throw naming the caller: `RoundState.m2m` is non-null for
 * exactly the rounds whose `plan.mode` is `'m2m'`. */
function requireM2m(r: RoundState, who: string): M2mRoundState {
  const m = r.m2m
  if (!m) throw new Error(`${who}: a '${r.plan.mode}' round carries no many-to-many state`)
  return m
}
