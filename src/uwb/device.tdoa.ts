/**
 * DL-TDoA and UL-TDoA logic for `UwbDevice`: the one-way ranging modes where nothing is a round
 * trip — anchors broadcast their own instants and a tag differences arrival times (DL-TDoA), or
 * every anchor stamps a tag's blink and the infrastructure differences those (UL-TDoA). Split out
 * of device.ts (pure move); every function here takes the device as its first argument.
 */
import type { FrameDesc } from '../model/frames'
import type { UwbFrameKind } from './frames'
import { makeFinal, makePoll, makeResp } from './frames'
import { counterDiff } from './clock'
import { C_M_PER_NS, RCTU_NS } from './phy'
import { solveTdoa } from './position'
import type { RoundState, ScheduledAction, UwbDevice } from './device'

/** What one tag heard from one responder inside a DL-TDoA round. */
export interface DlResponse {
  /** When the Response arrived, on the tag's own clock. */
  rxCounter: number
  /** How long the responder waited between hearing the Poll and answering, on the responder's
   * clock: both counters rode in the Response, so the tag can subtract them itself. */
  replyTime: number
  /** The responder's own rate against anchor 0's (its ppm minus the reference's, as a fraction),
   * which is what turns `replyTime` into an interval of the reference's timebase. */
  coffs: number
}

/**
 * What a device holds for a DL-TDoA round, where nothing is a round trip and the roles are not
 * the two-way ones: anchor 0 runs the round, anchors 1…N−1 answer it, and every tag only listens.
 * Null in a two-way ranging round, which needs none of it.
 */
export interface DlRoundState {
  /** Tag: its own arrival counters for the Poll and the Final — the ends of the interval it
   * measures its clock rate over. Null until each lands; a round missing either produces nothing. */
  rxPoll: number | null
  rxFinal: number | null
  /** Tag: the same two instants as anchor 0 stamped them, straight out of those two frames. The
   * rate ratio is one interval over the other, so it is the tag's clock against anchor 0's — and
   * anchor 0's own crystal never enters the result. */
  txPoll: number | null
  txFinal: number | null
  /** Tag: one entry per responder it heard. */
  responses: Map<string, DlResponse>
  /** Responder: its clock-offset estimate to anchor 0, taken from the Poll's carrier. */
  coffsToRef: number | null
  /** Anchor 0: when each Response arrived on its clock, for the Final to carry. */
  rxResp: Record<string, number>
}

/**
 * 1-σ of one DL-TDoA time difference, as a distance — the number the fix's error ellipse is drawn
 * from. Two terms: the tag's two independent receive timestamps (√2·c·σ_ts, 4.2 cm at 100 ps),
 * and the responder's clock-offset estimate, whose residual multiplies the reply time it corrects
 * (0.2 ppm of a 2 ms reply is 12 cm, of a 6 ms reply 36 cm). The second dominates from the first
 * slot on, which is why a responder answering late is measured worse than one answering early.
 *
 * It assumes the tag's own rate correction is on. With `tdoaClockCorrection: false` the tag's
 * crystal - up to 20 ppm of the whole poll-to-arrival interval - dominates everything here and is
 * deliberately not in this figure; at the shipped +-20 ppm that variant produces no fix at all, so
 * there is no ellipse for it to be wrong about.
 */
function dlDiffSigmaM(replyNs: number, tsNoisePs: number, cfoNoisePpm: number): number {
  return Math.hypot(
    Math.SQRT2 * C_M_PER_NS * (tsNoisePs / 1000),
    C_M_PER_NS * replyNs * cfoNoisePpm * 1e-6,
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
 * One slot of a DL-TDoA round. The anchors own every slot of it: anchor 0 polls in slot 0 and
 * closes with the Final in slot N, anchor i answers in slot i. A tag reaches exactly one branch
 * here — `listenFor` — which is what makes "a tag never transmits in DL-TDoA" a property of the
 * code and not of the schedule: there is no path from a tag to `transmitFor` in this mode.
 */
export function onDlSlot(
  dev: UwbDevice, slot: number, action: ScheduledAction, r: RoundState, peers: { tag: string; anchors: string[] },
): void {
  // Every DL-TDoA slot is an anchor's; `slotAction` never produces a tag transmission in it.
  if (action.tx !== 'anchor') return
  const txId = peers.anchors[action.anchor]
  if (dev.cfg.role === 'tag') {
    // The whole round is the tag's measurement: the Poll starts its rate interval, each
    // Response is one time difference, the Final ends the rate interval.
    dev.listenFor(slot, txId, action.kind)
    return
  }
  if (txId === dev.id) {
    dev.transmitFor(action, slot, r, peers)
    return
  }
  // An anchor listens only for what its own part of the round needs, and sleeps through the
  // rest: anchor 0 must stamp every Response for the Final, a responder must hear the Poll it
  // answers. Neither ranges the other — there is no round trip anywhere in this round.
  const wanted: UwbFrameKind = dev.id === peers.anchors[0] ? 'uwbResp' : 'uwbPoll'
  if (action.kind === wanted) dev.listenFor(slot, txId, action.kind)
}

/**
 * One slot of a UL-TDoA round, and there is only ever one: the tag whose round it is blinks in
 * it, and every anchor listens. Nothing answers the blink, so the tag's radio is off the instant
 * its frame has left — one 181 µs transmission per block is the whole cost of being positioned —
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
 * Tag only, DL-TDoA: this round's time differences (UWB_TDOA, one per responder heard) and the
 * hyperbolic fix they solve to.
 *
 * Two corrections stand between the raw arrival counters and a difference of distances.
 *
 * 1. The tag's own crystal. A two-way range differences it away inside one exchange; here the
 *    arrivals are up to a whole round apart, and 20 ppm over 20 ms is 0.4 µs — 120 m. So the
 *    tag measures its rate over the one interval both clocks describe: anchor 0 reports when
 *    it sent the Poll and when it sent the Final, the tag holds its own two arrivals, and the
 *    flight from anchor 0 is in both of those and cancels. The ratio is the tag's clock over
 *    anchor 0's — nothing in it is true time, so anchor 0 is free to run at any ppm it likes.
 *    What is left after dividing is the timestamp noise of the two ends of the interval,
 *    scaled by how much of the round a difference spans.
 * 2. The responders' transmit instants. Anchor i does not answer the Poll instantly: it waits
 *    a slot boundary, which on its own clock is `replyTime`. Put on anchor 0's timebase with
 *    the responder's own clock-offset estimate and added to the Poll's flight time across the
 *    known anchor baseline, that is how much later than the Poll anchor i transmitted — which
 *    is exactly what has to come out of the arrival difference to leave geometry behind.
 */
export function solveTdoaFix(dev: UwbDevice, r: RoundState): void {
  const dl = r.dl
  // All four instants are required even with `tdoaClockCorrection: false`, where `rate = 1`
  // needs none of anchor 0's: a round the tag heard only half of is incomplete either way, and
  // dropping the same rounds in both variants is what makes them comparable round for round.
  if (!dl || dl.rxPoll === null || dl.rxFinal === null || dl.txPoll === null || dl.txFinal === null) return
  const refId = r.anchors[0]
  // The ratio of the two intervals is the tag's clock against anchor 0's, measured over the
  // one span the round gives it twice: anchor 0 stamped the Poll and the Final on its own
  // clock and said so in both frames, the tag stamped their arrivals on its own, and the
  // flight from anchor 0 sits in both arrivals and cancels. Dividing by it puts the tag's
  // arrival differences into anchor 0's counter units, which is where `txOffset_i` already
  // is — so anchor 0's own crystal drops out of the result entirely, whatever it runs at.
  const rate = dev.cfg.tdoaClockCorrection
    ? counterDiff(dl.rxFinal, dl.rxPoll) / counterDiff(dl.txFinal, dl.txPoll)
    : 1
  if (!(rate > 0) || !Number.isFinite(rate)) return
  const ref = dev.geometry.anchorPos(refId)
  const deltas: { id: string; dtNs: number }[] = []
  // Σσ_i² over the responders actually heard: one difference's sigma is not one number here,
  // because the term that dominates it grows with the slot the responder answered in.
  let sumSqM = 0
  for (const id of r.anchors) {
    const resp = dl.responses.get(id)
    if (!resp) continue // this responder was not heard this round: it is simply left out
    const a = dev.geometry.anchorPos(id)
    // True-time RCTU, the one term of this sum not in anchor 0's counter units: exactly it
    // would be tof*(1 + e_0), so the residual is tof*e_0 - 0.2 mm at 20 ppm over 30 m, orders
    // of magnitude under the clock-offset residual the difference already carries.
    const tofRctu = Math.hypot(a.x - ref.x, a.y - ref.y, a.z - ref.z) / C_M_PER_NS / RCTU_NS
    const txOffsetRctu = tofRctu + resp.replyTime * (1 - resp.coffs)
    const dtNs = (counterDiff(resp.rxCounter, dl.rxPoll) / rate - txOffsetRctu) * RCTU_NS
    const trueDtNs = (dev.geometry.trueDistM(dev.id, id) - dev.geometry.trueDistM(dev.id, refId)) / C_M_PER_NS
    deltas.push({ id, dtNs })
    sumSqM += dlDiffSigmaM(resp.replyTime * RCTU_NS, dev.cfg.tsNoisePs, dev.cfg.cfoNoisePpm) ** 2
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
    // One sigma for a solver that takes only one: the RMS of the per-responder sigmas above.
    // A first-order model — the responders' reply times differ by a factor of three across a
    // round, so no single number describes all three differences — but an honest one, in that
    // the term it is dominated by is the one the measured errors are dominated by too.
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

/**
 * DL-TDoA reception. An anchor keeps only what its own message must carry; a tag keeps
 * everything, because the whole round is its measurement.
 *
 * The responder's clock-offset estimate is stored as its own rate *against anchor 0*, i.e. the
 * negative of what its receiver measured on the reference's carrier (`coffs` here is always
 * "how much faster the sender runs than me"). That is the sign a consumer of the reply time
 * wants, exactly as SS-TWR's `(1 − coffs)` turns a responder's interval into the initiator's
 * timebase — only here the timebase everything lands in is anchor 0's, not the listener's.
 */
export function onDlRx(
  dev: UwbDevice, r: RoundState, from: string, frame: FrameDesc, kind: UwbFrameKind, counter: number, coffs: number,
): void {
  const dl = r.dl
  const refId = r.anchors[0]
  if (!dl) return
  if (dev.cfg.role === 'anchor') {
    if (kind === 'uwbPoll') {
      r.rxPollCounter = counter
      dl.coffsToRef = -coffs
    } else if (kind === 'uwbResp') {
      dl.rxResp[from] = counter
    }
    return
  }
  switch (kind) {
    case 'uwbPoll':
      // Both ends of the rate interval come in pairs: when it arrived here, and when anchor 0
      // says it left there. A frame without the sender's own instant is not one of this round's.
      if (frame.uwb?.dl === undefined) return
      dl.rxPoll = counter
      dl.txPoll = frame.uwb.dl.txCounter
      break
    case 'uwbFinal':
      if (frame.uwb?.dl === undefined) return
      dl.rxFinal = counter
      dl.txFinal = frame.uwb.dl.txCounter
      break
    case 'uwbResp': {
      const times = frame.uwb?.dl
      // A Response that is missing any of the three is not a DL-TDoA Response at all; the
      // responder is dropped rather than differenced against a time nobody sent.
      if (!times || times.coffs === undefined) return
      const rxPollAtPeer: number | undefined = times.rxCounters[refId]
      if (rxPollAtPeer === undefined) return
      dl.responses.set(from, {
        rxCounter: counter,
        replyTime: counterDiff(times.txCounter, rxPollAtPeer),
        coffs: times.coffs,
      })
      break
    }
  }
}

/**
 * An anchor's transmission in a DL-TDoA round. Each message says what its sender did on its own
 * clock, and nothing about any round trip: the Poll carries anchor 0's transmit instant, a
 * Response carries the responder's transmit instant, its arrival instant for the Poll and its
 * clock offset to anchor 0, and the Final carries anchor 0's transmit instant and its arrival
 * instant for every Response. All of it is broadcast — the audience is every tag in earshot,
 * none of which the anchors know is there.
 *
 * The Final's arrival instants are the one part a tag here never uses: they are carried because
 * the FiRa message does (a receiver could cross-check each responder's offset against anchor 0's
 * round trip with them), while this model's tag takes each responder's reply time and offset
 * from that responder's own Response.
 */
export function transmitDl(
  dev: UwbDevice, action: ScheduledAction, slot: number, r: RoundState, peers: { tag: string; anchors: string[] },
  txCounter: number,
): void {
  const dl = r.dl
  if (!dl) return
  const refId = peers.anchors[0]
  switch (action.kind) {
    case 'uwbPoll': {
      r.txPollCounter = txCounter
      // The Poll's schedule lists the *responders*: anchor 0 has slot 0 and the Final, and
      // slot i belongs to the i-th anchor of the scenario, which is how the Final can name
      // its arrival times in slot order.
      dev.send(
        // A one-way round is time-scheduled by construction, so the contention fields the
        // TWR Poll carries have nothing to say here: the Poll carries anchor 0's times instead.
        makePoll(dev.id, peers.anchors.slice(1), r.plan.method, r.block, r.round, {
          dl: { txCounter, rxCounters: {} },
        }),
        txCounter,
      )
      break
    }
    case 'uwbResp': {
      // An anchor that never heard the Poll has nothing to answer, and no offset to report.
      if (r.rxPollCounter === null || dl.coffsToRef === null) return
      r.txRespCounter = txCounter
      dev.send(
        makeResp(
          dev.id, '*', r.plan.method, r.block, r.round, slot, undefined,
          { txCounter, rxCounters: { [refId]: r.rxPollCounter }, coffs: dl.coffsToRef },
        ),
        txCounter,
      )
      break
    }
    case 'uwbFinal': {
      // Anchor 0 closes the round whether or not anyone answered it: a tag needs the Final to
      // measure its own clock rate, and an empty round still tells it that much.
      // The Final's RX times are carried because a FiRa DL-TDoA Final carries them, but no tag
      // in this model reads them: `onDlRx` takes only `txCounter` from the Final, and each
      // responder's reply time and offset come from its own Response (TXT/RXT/COFF). They are
      // what a receiver would need to check a responder's offset against anchor 0's round trip.
      r.txFinalCounter = txCounter
      dev.send(makeFinal(dev.id, [], r.block, r.round, slot, { txCounter, rxCounters: { ...dl.rxResp } }), txCounter)
      break
    }
    default:
      // No other kind is ever scheduled in this mode (see slotAction).
      break
  }
}
