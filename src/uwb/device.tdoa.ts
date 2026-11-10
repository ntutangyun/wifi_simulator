/**
 * One-way ranging (OWR) for `UwbDevice` — the two time-difference-of-arrival cases of IEEE Std
 * 802.15.4-2024 §10.29.1.2.5, which this simulator calls by their industry names:
 *
 * - **DL-TDoA** is the standard's second case: "multiple synchronized nodes broadcast messages
 *   sequentially with known transmission time offsets with respect to each other … the transmission
 *   offset is taken into account when calculating the difference in arrival time". The round is
 *   Figure 10-225's "<OWR>": the controller (anchor 0) sends the RCM in slot 0 — ARC IE with Ranging
 *   Round Usage = 0 (Table 10-164), RR IE, RDM IE assigning every anchor its slot (§10.32.9.8) — and
 *   each anchor then broadcasts one ranging message, an RFRAME with no payload IE, at the start of its
 *   slot. The anchors share one timebase, so the slot starts are the known offsets; the listening tag
 *   takes its own arrival counters, removes its own clock rate with the clock offset its receiver
 *   measured (§10.29.1.1, §10.29.1.6), subtracts the known offsets and is left with differences of
 *   distance. Nothing it needs rides in any frame.
 * - **UL-TDoA** is the first case: the mobile device broadcasts a blink — the shortest frame possible,
 *   e.g. a 12-octet multipurpose frame — and fixed nodes "synchronized in some way" stamp its arrival on
 *   their common timebase.
 *
 * 2026-11-11 (W4, audit #15): until then the DL-TDoA round was the FiRa one — unsynchronized anchors
 * whose Poll, Responses and Final carried transmit times, receive times and a clock offset in three
 * IEs the standard does not define, and a tag that corrected each anchor's clock from them — and the
 * blink carried a "BLINK" IE the standard does not define either.
 *
 * Split out of device.ts; every function here takes the device as its first argument.
 */
import type { FrameDesc } from '../model/frames'
import type { UwbFrameKind } from './frames'
import { makeOwrMsg, makeOwrRcm } from './frames'
import { counterDiff } from './clock'
import { C_M_PER_NS, RCTU_NS } from './phy'
import { solveTdoa } from './position'
import type { RoundState, ScheduledAction, UwbDevice } from './device'

/** What one tag heard from one anchor's ranging message inside a DL-TDoA round. */
export interface DlArrival {
  /** When the message arrived, on the tag's own clock (RCTU counter). */
  rxCounter: number
  /** The clock offset the tag's receiver measured on this message (standard §10.29.1.1: "The next
   * higher layer can estimate the relative clock offset between the remote transmitter and the local
   * reference clock at the receiver"): how much faster the sender runs than the tag, as a fraction.
   * The anchors are synchronized to one timebase, so against any of them it is the tag's own rate. */
  coffs: number
}

/**
 * What a device holds for a DL-TDoA round. Null in every other mode.
 */
export interface DlRoundState {
  /** The slot the RCM's RDM IE gives each anchor (standard §10.32.9.8), as this device decoded it —
   * or, at the controller, as it wrote it. Null until the RCM: a device that never heard it does not
   * know who sends when, so an anchor without it stays silent and a tag without it measures nothing. */
  slots: Map<string, number> | null
  /** Tag: one entry per anchor whose ranging message it heard. */
  arrivals: Map<string, DlArrival>
}

/** A fresh round's DL state. */
export function freshDl(): DlRoundState {
  return { slots: null, arrivals: new Map() }
}

/**
 * 1-σ of one DL-TDoA time difference, as a distance — the number the fix's error ellipse is drawn
 * from. Two terms: the tag's two independent receive timestamps (√2·c·σ_ts, 4.2 cm at 100 ps), and
 * the residual of its clock-offset estimate, which multiplies the known transmission offset it
 * corrects (0.2 ppm of a 2 ms offset is 12 cm, of a 6 ms offset 36 cm). The second dominates from the
 * first slot on, which is why an anchor that transmits late in the round is measured worse.
 *
 * It assumes the tag's own rate correction is on. With `tdoaClockCorrection: false` the tag's crystal —
 * up to 20 ppm of the whole offset — dominates everything here and is deliberately not in this figure.
 */
function dlDiffSigmaM(offsetNs: number, tsNoisePs: number, cfoNoisePpm: number): number {
  return Math.hypot(
    Math.SQRT2 * C_M_PER_NS * (tsNoisePs / 1000),
    C_M_PER_NS * offsetNs * cfoNoisePpm * 1e-6,
  )
}

/**
 * 1-σ of one UL-TDoA time difference, as a distance: two anchors' arrivals, each carrying its
 * receiver's timestamp noise and its own residual calibration error to the common timebase.
 *
 * First-order model, and the one place it is worth saying so out loud: `syncErrorNs` is a **bias**
 * per anchor, drawn once and kept for the whole session, not white noise that averages down over
 * rounds. Treating it as noise makes the ellipse the right *size* while leaving it the wrong kind
 * of statement — it is indicative of how far off the fix may be, not a 68 % interval a repeated
 * measurement would fall in.
 */
function ulDiffSigmaM(tsNoisePs: number, syncErrorNs: number): number {
  return Math.SQRT2 * C_M_PER_NS * Math.hypot(tsNoisePs / 1000, syncErrorNs)
}

/**
 * One slot of a DL-TDoA round. The anchors own every slot of it: anchor 0 sends the RCM in slot 0,
 * anchor k its ranging message in the slot the RCM gave it. A tag reaches only `listenFor` here —
 * which is what makes "a tag never transmits in DL-TDoA" a property of the code and not of the
 * schedule — and an anchor listens only for the RCM, the one frame it needs (its slot is in it).
 */
export function onDlSlot(
  dev: UwbDevice, slot: number, action: ScheduledAction, r: RoundState, peers: { tag: string; anchors: string[] },
): void {
  if (action.tx !== 'anchor') return
  const dl = r.dl
  if (!dl) return
  const controller = peers.anchors[0]
  if (action.kind === 'uwbRcm') {
    if (dev.id === controller) {
      transmitOwrRcm(dev, r, peers)
      return
    }
    // Every other device, tag or anchor, needs this one frame: it is where the slots are.
    dev.listenFor(slot, controller, 'uwbRcm')
    return
  }
  // A ranging-message slot. Who owns it is what the RCM said — not the scene's anchor order — and a
  // device that did not decode the RCM does not know.
  if (!dl.slots) return
  let owner: string | null = null
  for (const [id, s] of dl.slots) if (s === slot) owner = id
  if (owner === null) return
  if (owner === dev.id) {
    dev.send(makeOwrMsg(dev.id, r.block, r.round, slot), dev.txCounterNow())
    return
  }
  // Only a tag measures anything from the anchors' messages; another anchor has no use for them.
  if (dev.cfg.role === 'tag') dev.listenFor(slot, owner, 'uwbResp')
}

/** The controller's RCM: every anchor of the round, anchor k at slot k + 1 (`slotAction`). */
function transmitOwrRcm(dev: UwbDevice, r: RoundState, peers: { tag: string; anchors: string[] }): void {
  const nodes = peers.anchors.map((id, k) => ({ id, slot: k + 1 }))
  r.dl!.slots = new Map(nodes.map((n) => [n.id, n.slot]))
  dev.send(makeOwrRcm(dev.id, nodes, r.block, r.round, dev.cfg.stsOff === true ? 0 : 1), dev.txCounterNow())
}

/** Any device, DL-TDoA: the RCM arrived. Keep the slot table its RDM IE carries (§10.32.9.8). */
export function onDlRcm(r: RoundState, frame: FrameDesc): void {
  if (!r.dl) return
  r.dl.slots = new Map((frame.uwb?.rdm ?? []).map((e) => [e.id, e.slot]))
}

/** Tag, DL-TDoA: an anchor's ranging message arrived — keep its arrival counter and the clock offset
 * the receiver measured on it. */
export function onDlRx(dev: UwbDevice, r: RoundState, from: string, kind: UwbFrameKind, counter: number, coffs: number): void {
  if (dev.cfg.role !== 'tag' || kind !== 'uwbResp' || !r.dl) return
  r.dl.arrivals.set(from, { rxCounter: counter, coffs })
}

/**
 * One slot of a UL-TDoA round, and there is only ever one: the tag whose round it is blinks in
 * it, and every anchor listens. Nothing answers the blink, so the tag's radio is off the instant
 * its frame has left — one transmission per block is the whole cost of being positioned —
 * and an anchor that hears nothing simply has no arrival to contribute.
 */
export function onUlSlot(
  dev: UwbDevice, slot: number, action: ScheduledAction, r: RoundState, peers: { tag: string; anchors: string[] },
): void {
  if (action.kind !== 'uwbBlink') return
  if (dev.cfg.role === 'tag') {
    if (peers.tag === dev.id) dev.transmitFor(action, slot, r, peers)
    return
  }
  dev.listenFor(slot, peers.tag, 'uwbBlink')
}

/**
 * Tag only, DL-TDoA: this round's time differences (UWB_TDOA, one per anchor heard besides the
 * reference) and the hyperbolic fix they solve to.
 *
 * The reference is anchor 0, the controller. Anchor k transmitted (slot_k − slot_0) slots after it on
 * the anchors' common timebase — the known transmission offset of §10.29.1.2.5, read off the RCM's RDM
 * IE and the slot duration. The tag's arrival counters run on its own crystal, up to 20 ppm off, which
 * over a 6 ms offset is 120 ns — 36 m. So the tag first divides by its own rate, `1 − coffs`, from the
 * clock offset its receiver measured on the reference's message (the anchors are synchronized, so that
 * offset is the tag's own against the timebase); then it subtracts the offset. What remains is the
 * difference of the two flights.
 */
export function solveTdoaFix(dev: UwbDevice, r: RoundState): void {
  const dl = r.dl
  if (!dl || !dl.slots) return
  const refId = r.anchors[0]
  const ref = dl.arrivals.get(refId)
  const refSlot = dl.slots.get(refId)
  // Every difference is taken against the reference: without its message there is nothing to
  // difference against, and the round produces nothing.
  if (!ref || refSlot === undefined) return
  const rate = dev.cfg.tdoaClockCorrection ? 1 - ref.coffs : 1
  if (!(rate > 0) || !Number.isFinite(rate)) return
  const deltas: { id: string; dtNs: number }[] = []
  // Σσ_i² over the anchors actually heard: one difference's sigma grows with its offset.
  let sumSqM = 0
  for (const id of r.anchors) {
    if (id === refId) continue
    const a = dl.arrivals.get(id)
    const slot = dl.slots.get(id)
    if (!a || slot === undefined) continue // not heard this round: simply left out
    const offsetNs = (slot - refSlot) * r.plan.slotNs
    const dtNs = (counterDiff(a.rxCounter, ref.rxCounter) * RCTU_NS) / rate - offsetNs
    const trueDtNs = (dev.geometry.trueDistM(dev.id, id) - dev.geometry.trueDistM(dev.id, refId)) / C_M_PER_NS
    deltas.push({ id, dtNs })
    sumSqM += dlDiffSigmaM(offsetNs, dev.cfg.tsNoisePs, dev.cfg.cfoNoisePpm) ** 2
    dev.emit({
      t: dev.now(), type: 'UWB_TDOA', node: dev.id, ref: refId, peer: id,
      dtNs, trueDtNs, block: r.block, round: r.round,
    })
  }
  const fix = solveTdoa(
    r.anchors.map((id) => dev.geometry.anchorPos(id)),
    refId,
    deltas,
    dev.cfg.pos.z,
    // One sigma for a solver that takes only one: the RMS of the per-anchor sigmas above. A
    // first-order model — the offsets differ by a factor of three across a round — but the term it
    // is dominated by is the one the measured errors are dominated by too.
    Math.sqrt(sumSqM / Math.max(1, deltas.length)),
  )
  if (!fix) return
  dev.emit({
    t: dev.now(), type: 'UWB_POSITION', node: dev.id,
    x: fix.x, y: fix.y, trueX: dev.cfg.pos.x, trueY: dev.cfg.pos.y,
    gdop: fix.gdop, ellipse: fix.ellipse, anchors: [refId, ...deltas.map((d) => d.id)],
    block: r.block, method: 'dl-tdoa',
  })
}

/**
 * UL-TDoA, anchor: the arrival it stamped for this round's blink, already on the
 * infrastructure's common timebase, or null if it never heard the blink. The network reads it
 * while the round is still open and hands the set to the reference anchor.
 */
export function ulArrivalNs(dev: UwbDevice): number | null {
  return dev.round?.ulArrivalNs ?? null
}

/**
 * UL-TDoA, the reference anchor: difference the anchors' arrivals and solve the tag's position
 * from them. This is the one measurement in the whole model that no device made on its own —
 * every arrival was stamped by a different receiver, and it is the shared timebase (and only
 * the shared timebase) that lets them be subtracted at all. Two consequences the lesson lives
 * on: the tag spends one frame and learns nothing, and a calibration error between two anchors
 * is indistinguishable from the tag standing somewhere else.
 *
 * How the arrivals reach the reference anchor is outside 802.15.4 here (the anchors' wired backhaul;
 * standard §10.29.1.2.5 only requires the fixed nodes to be synchronized "in some way").
 *
 * `dtNs` is a plain difference — there is no clock-rate correction to make, because no interval
 * is measured on anybody's crystal here, only two instants on one timebase. The residual is the
 * two receivers' timestamp noise (√2·σ_ts) and the two anchors' calibration offsets.
 */
export function solveUlFix(dev: UwbDevice, arrivals: { id: string; ns: number }[]): void {
  const r = dev.round
  if (!r) return
  const refId = r.anchors[0]
  const tagId = r.tagId
  const byId = new Map(arrivals.map((a) => [a.id, a.ns]))
  const refNs = byId.get(refId)
  // Every difference is taken against the reference anchor: if it missed the blink there is
  // nothing to difference against, and the round produces nothing rather than quietly
  // re-referencing itself to an anchor the records do not name.
  if (refNs === undefined) return
  const deltas: { id: string; dtNs: number }[] = []
  for (const id of r.anchors) {
    if (id === refId) continue
    const ns = byId.get(id)
    if (ns === undefined) continue // this anchor did not hear the blink: it is left out
    const dtNs = ns - refNs
    const trueDtNs = (dev.geometry.trueDistM(tagId, id) - dev.geometry.trueDistM(tagId, refId)) / C_M_PER_NS
    deltas.push({ id, dtNs })
    dev.emit({
      t: dev.now(), type: 'UWB_TDOA', node: dev.id, ref: refId, peer: id,
      dtNs, trueDtNs, block: r.block, round: r.round, of: tagId,
    })
  }
  // The tag's height is the one thing about it the infrastructure assumes rather than solves
  // (a 2-D fix needs it); its x and y are used only as the truth the record is scored against.
  const tag = dev.geometry.anchorPos(tagId)
  const fix = solveTdoa(
    r.anchors.map((id) => dev.geometry.anchorPos(id)),
    refId,
    deltas,
    tag.z,
    // Both of what a UL difference carries: two receivers' timestamp noise and two anchors'
    // calibration errors (see `ulDiffSigmaM`, which also says why this is first-order).
    ulDiffSigmaM(dev.cfg.tsNoisePs, dev.cfg.syncErrorNs),
  )
  if (!fix) return
  dev.emit({
    t: dev.now(), type: 'UWB_POSITION', node: dev.id,
    x: fix.x, y: fix.y, trueX: tag.x, trueY: tag.y,
    gdop: fix.gdop, ellipse: fix.ellipse, anchors: [refId, ...deltas.map((d) => d.id)],
    block: r.block, method: 'ul-tdoa', of: tagId,
  })
}
