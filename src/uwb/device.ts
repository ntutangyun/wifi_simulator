/**
 * One HRP UWB ranging device — an anchor or a tag — driven entirely by the
 * session schedule (src/uwb/session.ts). It is a radio (UwbRadio) and a small
 * state machine. In a time-scheduled session it never contends for the medium,
 * because the session has already decided who transmits in every slot; in a
 * contention session (standard §10.32.2 schedule mode 0) the schedule reserves a
 * response window instead, and every anchor draws a slot in it from its own
 * stream — so two anchors can land in one slot and lose each other there.
 *
 * The state it shows on its lane is the Wi-Fi MAC_STATE vocabulary, so one
 * timeline reducer covers both technologies:
 *   idle     — between its slots; the receiver is off (that is what makes UWB
 *              ranging cheap: a tag listens for microseconds per block)
 *   uwbWait  — a slot it expects a frame in, receiver on, deadline armed
 *   rx       — a PPDU is arriving
 *   tx       — radiating; half-duplex, so listening() is false
 *
 * Every measurement is a pair of ranging counters (standard §10.29.1): the
 * transmitter stamps the RMARKER it is about to send, the receiver stamps the
 * RMARKER it saw. Only the receive stamps carry noise — a transmitter knows
 * exactly when it fires — so a round trip carries √2·σ_ts, not 2·σ_ts, and the
 * range, which halves it, carries σ_ts/√2 (see `rangeSigmaM`).
 */
import type { EventQueue } from '../engine/events'
import type { Rng } from '../engine/rng'
import type { FrameDesc } from '../model/frames'
import type { EmitFn, MacStateName, RxFailReason } from '../model/records'
import type { Ns, Vec3 } from '../model/types'
import type { UwbChannel, UwbRadio, UwbRxInfo } from './channel'
import { counterDiff, gaussian, type UwbClock } from './clock'
import { makeFinal, makePoll, makeReport, makeResp, type UwbFrameKind } from './frames'
import { C_M_PER_NS, RCTU_NS, UWB_RMARKER_NS } from './phy'
import { rangeSigmaM, solvePosition, solveTdoa, type AnchorPos } from './position'
import { dsTwr, fomFor, rctuToMetres, ssTwrCorrected, ssTwrRaw } from './ranging'
import type { RoundPlan, SlotAction } from './session'

/** Per-device settings. The TWR method is NOT here: a round's `RoundPlan` is the
 * one truth about how that round is measured, and the device reads it from there. */
export interface UwbDeviceCfg {
  role: 'anchor' | 'tag'
  pos: Vec3
  tsNoisePs: number
  cfoNoisePpm: number
  /** Contention rounds only: the retry budget the Poll's RCMA IE advertises. An anchor spends one
   * attempt per round its response is not acknowledged by a range, and sits a round out when the
   * budget is empty. Ignored entirely by a time-scheduled round. */
  maxAttempts: number
  /** DL-TDoA only: the listening tag measures its own clock rate against the round's Poll-to-Final
   * interval before it differences its arrival times. Off, it keeps its raw counter differences —
   * and up to ±20 ppm of crystal error over a whole round is metres of position error. */
  tdoaClockCorrection: boolean
}

export interface UwbGeometry {
  /** 3-D separation of two nodes from the scenario: the truth a range is scored against. */
  trueDistM: (a: string, b: string) => number
  /** An anchor's surveyed position, as the tag's solver knows it. */
  anchorPos: (id: string) => AnchorPos
}

export type UwbDeviceState = Extract<MacStateName, 'idle' | 'uwbWait' | 'rx' | 'tx'>

/** The frame this device is waiting for in the slot it is in. */
interface Expectation {
  slot: number
  /** Null in an open slot, where the sender is not known in advance. */
  from: string | null
  kind: UwbFrameKind
  /**
   * The slot is open: any anchor of the round may answer in it, and none has to.
   * True only in a contention round's response phase, where the slot belongs to
   * whoever drew it. An open slot that stays silent is the ordinary outcome of
   * the draw, not a peer that failed to answer, so it reports no UWB_TIMEOUT —
   * there is no peer the record could name.
   */
  open: boolean
}

/** What a tag remembers about one anchor inside the round in progress. */
interface PeerMeasurement {
  id: string
  rxRespCounter: number
  coffs: number
  fom: number
  /** Poll→Response round trip, in the tag's own counter units. */
  tround1: number
  /** Response→Final reply, in the tag's own counter units; known once the Final goes out. */
  treply2: number | null
}

/** What one tag heard from one responder inside a DL-TDoA round. */
interface DlResponse {
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
interface DlRoundState {
  /** Tag: its own arrival counters for the Poll and the Final — the ends of the interval it
   * measures its clock rate over. Null until each lands; a round missing either produces nothing. */
  rxPoll: number | null
  rxFinal: number | null
  /** Tag: one entry per responder it heard. */
  responses: Map<string, DlResponse>
  /** Responder: its clock-offset estimate to anchor 0, taken from the Poll's carrier. */
  coffsToRef: number | null
  /** Anchor 0: when each Response arrived on its clock, for the Final to carry. */
  rxResp: Record<string, number>
}

/** Everything one device holds for the duration of a single ranging round. */
interface RoundState {
  block: number
  round: number
  plan: RoundPlan
  tagId: string
  anchors: string[]
  /** The slot the round is in, as the schedule last announced it. */
  slot: number
  /** Contention round, anchor: the response slot it drew on the Poll; null when it drew none
   * (it is sitting the round out, or it never heard the Poll). */
  contendSlot: number | null
  /** Contention round, tag: the slot a collision was already reported for, so two doomed
   * responses in one slot are one UWB_CONTEND_COLLISION and not two. */
  contendCollisionSlot: number | null
  // tag side
  txPollCounter: number | null
  txFinalCounter: number | null
  peers: Map<string, PeerMeasurement>
  ranges: { id: string; distM: number }[]
  // anchor side
  rxPollCounter: number | null
  txRespCounter: number | null
  rxFinalCounter: number | null
  /** The Final listed this anchor, i.e. the tag did receive its Response. */
  finalListedMe: boolean
  /** One-way ranging state; non-null exactly in a DL-TDoA round. */
  dl: DlRoundState | null
}

function freshRound(block: number, round: number, plan: RoundPlan, tagId: string, anchors: string[]): RoundState {
  return {
    block, round, plan, tagId, anchors: [...anchors],
    slot: 0, contendSlot: null, contendCollisionSlot: null,
    txPollCounter: null, txFinalCounter: null, peers: new Map(), ranges: [],
    rxPollCounter: null, txRespCounter: null, rxFinalCounter: null, finalListedMe: false,
    // Fresh every round: a tag that heard half a round keeps nothing of it, so a missing Poll
    // or Final can never be filled in from the round before.
    dl: plan.mode === 'dl-tdoa' ? { rxPoll: null, rxFinal: null, responses: new Map(), coffsToRef: null, rxResp: {} } : null,
  }
}

export class UwbDevice implements UwbRadio {
  state: UwbDeviceState = 'idle'
  private round: RoundState | null = null
  private expect: Expectation | null = null
  /** Monotonic id of the transmission in progress; its end timer carries a copy. */
  private txSeq = 0
  /** The MHR's Sequence Number: one 8-bit counter per device, wrapping at 256. */
  private seqNo = 0
  /**
   * Contention rounds, anchor: what is left of the RCMA retry budget. SS-TWR gives a responder
   * no acknowledgement of its own — the exchange ends at the tag — so the anchor cannot know
   * whether it was heard. The model closes that loop at the round's end (see `endRound`): a
   * round that produced a range for this anchor refills the budget, a round that did not spends
   * one attempt of it, and an empty budget buys one silent round before the anchor tries again.
   */
  private attemptsLeft: number

  constructor(
    readonly id: string,
    private cfg: UwbDeviceCfg,
    readonly clock: UwbClock,
    private rng: Rng,
    private q: EventQueue,
    private now: () => Ns,
    private ch: UwbChannel,
    private emit: EmitFn,
    private geometry: UwbGeometry,
  ) {
    this.attemptsLeft = cfg.maxAttempts
  }

  get role(): 'anchor' | 'tag' {
    return this.cfg.role
  }

  // ---- schedule hooks -------------------------------------------------------

  /** Tag: open its round (UWB_ROUND) — in DL-TDoA that is the anchors' round, which every tag
   * opens a lane for because every tag measures the whole of it. Anchor: note the round it is
   * about to serve. */
  beginRound(block: number, round: number, plan: RoundPlan, tagId: string, anchors: string[]): void {
    this.round = freshRound(block, round, plan, tagId, anchors)
    if (this.cfg.role !== 'tag') return
    this.emit({
      t: this.now(), type: 'UWB_ROUND', node: this.id, block, round,
      slots: plan.slots, slotNs: plan.slotNs, method: plan.method, mode: plan.mode,
      untilNs: this.now() + plan.roundNs,
    })
  }

  /** Called at every slot start of a round this device takes part in. */
  onSlot(slot: number, action: SlotAction, slotEndNs: Ns, peers: { tag: string; anchors: string[] }): void {
    this.closeSlot()
    const r = this.round
    if (!r) return
    r.slot = slot
    if (this.cfg.role === 'tag') {
      this.emit({ t: this.now(), type: 'UWB_SLOT', node: this.id, slot, untilNs: slotEndNs })
    }
    if (r.plan.mode === 'dl-tdoa') {
      this.onDlSlot(slot, action, r, peers)
      return
    }
    // A contention round's response phase belongs to nobody in advance: `slotAction` names no
    // anchor (its `anchor` is -1), each anchor drew its own slot when it decoded the Poll, and
    // the tag simply listens through the whole window for whoever turns up.
    if (r.plan.schedule === 'contention' && action.kind === 'uwbResp') {
      if (this.cfg.role === 'anchor') {
        if (r.contendSlot === slot) this.transmitFor(action, slot, r, peers)
        return
      }
      this.listenOpen(slot)
      return
    }
    const txId = action.tx === 'tag' ? peers.tag : peers.anchors[action.anchor]
    if (txId === this.id) {
      this.transmitFor(action, slot, r, peers)
      return
    }
    // A device listens only for the frames addressed to it or broadcast to its
    // round: an anchor ignores the other anchors' slots entirely (receiver off),
    // and a tag ignores nothing, because every answer in the round is its own.
    const mine = this.cfg.role === 'tag'
      ? action.kind === 'uwbResp' || action.kind === 'uwbReport'
      : action.kind === 'uwbPoll' || action.kind === 'uwbFinal'
    if (!mine) return
    this.listenFor(slot, txId, action.kind)
  }

  /**
   * One slot of a DL-TDoA round. The anchors own every slot of it: anchor 0 polls in slot 0 and
   * closes with the Final in slot N, anchor i answers in slot i. A tag reaches exactly one branch
   * here — `listenFor` — which is what makes "a tag never transmits in DL-TDoA" a property of the
   * code and not of the schedule: there is no path from a tag to `transmitFor` in this mode.
   */
  private onDlSlot(slot: number, action: SlotAction, r: RoundState, peers: { tag: string; anchors: string[] }): void {
    // Every DL-TDoA slot is an anchor's; `slotAction` never produces a tag transmission in it.
    if (action.tx !== 'anchor') return
    const txId = peers.anchors[action.anchor]
    if (this.cfg.role === 'tag') {
      // The whole round is the tag's measurement: the Poll starts its rate interval, each
      // Response is one time difference, the Final ends the rate interval.
      this.listenFor(slot, txId, action.kind)
      return
    }
    if (txId === this.id) {
      this.transmitFor(action, slot, r, peers)
      return
    }
    // An anchor listens only for what its own part of the round needs, and sleeps through the
    // rest: anchor 0 must stamp every Response for the Final, a responder must hear the Poll it
    // answers. Neither ranges the other — there is no round trip anywhere in this round.
    const wanted: UwbFrameKind = this.id === peers.anchors[0] ? 'uwbResp' : 'uwbPoll'
    if (action.kind === wanted) this.listenFor(slot, txId, action.kind)
  }

  /**
   * Tag: solve this round's fix, close the round, and return the anchors it ranged — the set the
   * network hands straight back to those anchors as `heard`, which is the whole of the feedback
   * model an SS-TWR responder has no frame for (standard §10.32.1 NOTE leaves the filtering of a
   * ranging result to the upper layer; here the upper layer is the network).
   *
   * Anchor: spend or refill the contention retry budget, and return nothing. Only an anchor that
   * actually drew a slot this round spends an attempt — a round it sat out is the price it has
   * already paid, and a round whose Poll it never heard is not its doing.
   */
  endRound(heard = false): string[] {
    this.closeSlot()
    const r = this.round
    this.round = null
    if (!r) return []
    if (this.cfg.role !== 'tag') {
      if (r.plan.schedule === 'contention' && r.contendSlot !== null) {
        this.attemptsLeft = heard ? this.cfg.maxAttempts : Math.max(0, this.attemptsLeft - 1)
      }
      return []
    }
    if (r.plan.mode === 'dl-tdoa') this.solveTdoaFix(r)
    else this.solveFix(r)
    // The round is over whether or not it produced a fix: the tag's radio is off until
    // its round in the next block, and the view's slot returns to null.
    this.emit({ t: this.now(), type: 'UWB_ROUND_END', node: this.id, block: r.block, round: r.round })
    return r.ranges.map((x) => x.id)
  }

  /** Tag only: the round's 2-D fix from the anchors that answered, emitted as UWB_POSITION. */
  private solveFix(r: RoundState): void {
    if (r.ranges.length < 3) return
    const fix = solvePosition(
      r.anchors.map((id) => this.geometry.anchorPos(id)),
      r.ranges,
      this.cfg.pos.z,
      rangeSigmaM(this.cfg.tsNoisePs),
    )
    // Fewer than three usable ranges, or anchors too nearly collinear to invert:
    // the round simply produces no fix rather than a fabricated one.
    if (!fix) return
    this.emit({
      t: this.now(), type: 'UWB_POSITION', node: this.id,
      x: fix.x, y: fix.y, trueX: this.cfg.pos.x, trueY: this.cfg.pos.y,
      gdop: fix.gdop, ellipse: fix.ellipse, anchors: r.ranges.map((x) => x.id), block: r.block,
      method: 'twr',
    })
  }

  /**
   * Tag only, DL-TDoA: this round's time differences (UWB_TDOA, one per responder heard) and the
   * hyperbolic fix they solve to.
   *
   * Two corrections stand between the raw arrival counters and a difference of distances.
   *
   * 1. The tag's own crystal. A two-way range differences it away inside one exchange; here the
   *    arrivals are up to a whole round apart, and 20 ppm over 20 ms is 0.4 µs — 120 m. So the
   *    tag measures its rate over the one interval it knows in the anchors' timebase: Poll to
   *    Final is exactly the round's N slots, and anchor 0's flight time to the tag sits in both
   *    arrivals and cancels. What is left after dividing by that ratio is the timestamp noise of
   *    the two ends of the interval, scaled by how much of the round a difference spans.
   * 2. The responders' transmit instants. Anchor i does not answer the Poll instantly: it waits
   *    a slot boundary, which on its own clock is `replyTime`. Put on anchor 0's timebase with
   *    the responder's own clock-offset estimate and added to the Poll's flight time across the
   *    known anchor baseline, that is how much later than the Poll anchor i transmitted — which
   *    is exactly what has to come out of the arrival difference to leave geometry behind.
   */
  private solveTdoaFix(r: RoundState): void {
    const dl = r.dl
    if (!dl || dl.rxPoll === null || dl.rxFinal === null) return
    const refId = r.anchors[0]
    const rate = this.cfg.tdoaClockCorrection
      ? counterDiff(dl.rxFinal, dl.rxPoll) / (((r.plan.slots - 1) * r.plan.slotNs) / RCTU_NS)
      : 1
    if (!(rate > 0)) return
    const ref = this.geometry.anchorPos(refId)
    const deltas: { id: string; dtNs: number }[] = []
    for (const id of r.anchors) {
      const resp = dl.responses.get(id)
      if (!resp) continue // this responder was not heard this round: it is simply left out
      const a = this.geometry.anchorPos(id)
      const tofRctu = Math.hypot(a.x - ref.x, a.y - ref.y, a.z - ref.z) / C_M_PER_NS / RCTU_NS
      const txOffsetRctu = tofRctu + resp.replyTime * (1 - resp.coffs)
      const dtNs = (counterDiff(resp.rxCounter, dl.rxPoll) / rate - txOffsetRctu) * RCTU_NS
      const trueDtNs = (this.geometry.trueDistM(this.id, id) - this.geometry.trueDistM(this.id, refId)) / C_M_PER_NS
      deltas.push({ id, dtNs })
      this.emit({
        t: this.now(), type: 'UWB_TDOA', node: this.id, ref: refId, peer: id,
        dtNs, trueDtNs, block: r.block, round: r.round,
      })
    }
    const fix = solveTdoa(
      r.anchors.map((id) => this.geometry.anchorPos(id)),
      refId,
      deltas,
      this.cfg.pos.z,
      // Each difference carries two noisy timestamps where a range carries the equivalent of one,
      // so the ellipse is drawn with √2·σ_r. It is the documented approximation of this model:
      // the clock-correction residual, which grows with the responder's slot, is not in it.
      Math.SQRT2 * rangeSigmaM(this.cfg.tsNoisePs),
    )
    if (!fix) return
    this.emit({
      t: this.now(), type: 'UWB_POSITION', node: this.id,
      x: fix.x, y: fix.y, trueX: this.cfg.pos.x, trueY: this.cfg.pos.y,
      gdop: fix.gdop, ellipse: fix.ellipse, anchors: [refId, ...deltas.map((d) => d.id)],
      block: r.block, method: 'dl-tdoa',
    })
  }

  // ---- radio ----------------------------------------------------------------

  listening(): boolean {
    return this.state === 'uwbWait' || this.state === 'rx'
  }

  onRxStart(): void {
    if (this.state === 'uwbWait') this.setState('rx')
  }

  onRxFail(_from: string, reason: RxFailReason): void {
    const r = this.round
    // A response lost to overlap in a contention slot is the collision the whole schedule mode
    // is about, so the tag names the slot it happened in. It is keyed on the slot, not on the
    // reception: two responses that doom each other fail twice and are one collision, and a slot
    // where the stronger was captured still lost the weaker one.
    if (
      reason === 'collision' && r !== null && this.cfg.role === 'tag'
      && r.plan.schedule === 'contention' && r.contendCollisionSlot !== r.slot
    ) {
      r.contendCollisionSlot = r.slot
      this.emit({ t: this.now(), type: 'UWB_CONTEND_COLLISION', node: this.id, slot: r.slot })
    }
    // The slot's deadline is still armed; it will report the miss.
    if (this.state === 'rx') this.setState(this.expect ? 'uwbWait' : 'idle')
  }

  onRxOk(from: string, frame: FrameDesc, info: UwbRxInfo): void {
    // The channel gates deliveries at the arrival instant only; a device that
    // began transmitting (or went back to sleep) part-way through a reception
    // must not stamp a counter from it. Half-duplex is enforced here, not there.
    if (this.state !== 'uwbWait' && this.state !== 'rx') return
    const kind = frame.kind as UwbFrameKind
    const exp = this.expect
    const r = this.round
    if (!r || !exp || (exp.from !== null && exp.from !== from) || exp.kind !== kind) {
      // Not the frame this slot is for: no ranging counter is taken from it.
      if (this.state === 'rx') this.setState(this.expect ? 'uwbWait' : 'idle')
      return
    }

    // The receive stamp: the RMARKER's true instant, plus the extra delay this
    // receiver actually measures — the NLOS excess of an obstructed first path,
    // and the leading-edge estimator's own noise.
    const trueRmarkerNs = info.txStartNs + UWB_RMARKER_NS + info.propNs
    const extraNs = info.nlosNs + gaussian(this.rng) * (this.cfg.tsNoisePs / 1000)
    const counter = this.clock.counter(trueRmarkerNs, extraNs)
    const fom = fomFor(info.nlos)
    this.emit({ t: this.now(), type: 'UWB_TS', node: this.id, dir: 'rx', peer: from, frameKind: kind, counter, fom })
    // Clock-offset estimate from the carrier (standard §16.4.9): how much faster
    // the sender's crystal runs than mine, with the estimator's residual error.
    const coffs = (info.txPpm - this.clock.ppm) * 1e-6 + gaussian(this.rng) * this.cfg.cfoNoisePpm * 1e-6

    this.clearExpectation()
    this.setState('idle')

    if (r.plan.mode === 'dl-tdoa') {
      this.onDlRx(r, from, frame, kind, counter, coffs)
      return
    }

    switch (kind) {
      case 'uwbPoll':
        // An anchor keeps only the counter: DS-TWR cancels the clock offset by
        // construction, so it never needs `coffs`, and its range is scored by
        // the Final's first-path quality (the last frame of the exchange).
        r.rxPollCounter = counter
        // The contention draw comes last, after this reception's timestamp-noise and
        // carrier-offset draws above, so it never reorders the stream a time-scheduled
        // round takes from the same generator.
        if (r.plan.schedule === 'contention' && this.cfg.role === 'anchor') this.drawContentionSlot(r)
        break
      case 'uwbResp':
        this.onResponse(r, from, frame, counter, coffs, fom)
        break
      case 'uwbFinal':
        this.onFinal(r, from, frame, counter, fom)
        break
      case 'uwbReport':
        this.onReport(r, from, frame, fom)
        break
    }
  }

  // ---- slot handling --------------------------------------------------------

  /**
   * Close the slot that just ended: a slot whose expected frame never arrived
   * reports a UWB_TIMEOUT, and the receiver goes back to sleep.
   *
   * This is the whole deadline mechanism, and it needs no timer. A slot's
   * deadline is its end, and its end is the next slot's start — at which the
   * network calls `onSlot` on every participant of the round, whether or not
   * that participant has anything to do in the new slot. The round's last slot
   * ends in `endRound`, called on every participant too. So every armed slot is
   * closed at exactly the right instant by the schedule itself (the invariant
   * is recorded in network.ts, which is what guarantees it).
   */
  private closeSlot(): void {
    const exp = this.expect
    if (!exp) return
    this.expect = null
    // An open contention slot names no peer, so a silent one has nothing to report:
    // an empty slot is what most of the response window looks like by design.
    if (!exp.open && exp.from !== null) {
      this.emit({ t: this.now(), type: 'UWB_TIMEOUT', node: this.id, slot: exp.slot, peer: exp.from, expected: exp.kind })
    }
    this.setState('idle')
  }

  /**
   * Anchor, on the Poll of a contention round: draw the response slot to answer in, uniformly
   * over the window the RCPS IE advertised (standard §10.32.2 schedule mode 0). An anchor whose
   * RCMA budget is spent answers in no slot at all this round — the one back-off a responder
   * that cannot hear the other responders has — and starts the next round with a full budget.
   */
  private drawContentionSlot(r: RoundState): void {
    if (this.attemptsLeft === 0) {
      this.attemptsLeft = this.cfg.maxAttempts
      this.emit({ t: this.now(), type: 'UWB_CONTEND', node: this.id, slot: null, attempt: 0 })
      return
    }
    const slot = 1 + this.rng.int(r.plan.contentionSlots - 1)
    r.contendSlot = slot
    this.emit({
      t: this.now(), type: 'UWB_CONTEND', node: this.id, slot,
      attempt: this.cfg.maxAttempts - this.attemptsLeft + 1,
    })
  }

  /** The expected frame arrived: drop the expectation without reporting a miss. */
  private clearExpectation(): void {
    this.expect = null
  }

  private listenFor(slot: number, from: string, kind: UwbFrameKind): void {
    this.setState('uwbWait')
    this.expect = { slot, from, kind, open: false }
  }

  /** Tag, contention round: listen through a response slot for whichever anchor drew it, if any. */
  private listenOpen(slot: number): void {
    this.setState('uwbWait')
    this.expect = { slot, from: null, kind: 'uwbResp', open: true }
  }

  private transmitFor(action: SlotAction, slot: number, r: RoundState, peers: { tag: string; anchors: string[] }): void {
    const t = this.now()
    const txCounter = this.clock.counter(t + UWB_RMARKER_NS)
    if (r.plan.mode === 'dl-tdoa') {
      this.transmitDl(action, slot, r, peers, txCounter)
      return
    }
    // TODO (Task 3, UL-TDoA): a tag's 'uwbBlink' has no case below. Nothing throws on it — the
    // switch is not exhaustive by design — so an unwired mode is silent rather than fatal.
    switch (action.kind) {
      case 'uwbPoll': {
        r.txPollCounter = txCounter
        this.send(
          makePoll(
            this.id, peers.anchors, r.plan.method, r.block, r.round,
            r.plan.schedule, r.plan.contentionSlots, this.cfg.maxAttempts,
          ),
          txCounter,
        )
        break
      }
      case 'uwbResp': {
        // An anchor that never heard the Poll has nothing to reply to: its slot
        // stays empty, and the tag's own deadline reports the gap.
        if (r.rxPollCounter === null) return
        r.txRespCounter = txCounter
        const replyRctu = r.plan.method === 'ss' ? counterDiff(txCounter, r.rxPollCounter) : undefined
        this.send(makeResp(this.id, r.tagId, r.plan.method, r.block, r.round, slot, replyRctu), txCounter)
        break
      }
      case 'uwbFinal': {
        r.txFinalCounter = txCounter
        const times: { id: string; tround1: number; treply2: number }[] = []
        for (const id of r.anchors) {
          const p = r.peers.get(id)
          if (!p) continue // this anchor never answered: it is left out of the Final
          p.treply2 = counterDiff(txCounter, p.rxRespCounter)
          times.push({ id, tround1: p.tround1, treply2: p.treply2 })
        }
        this.send(makeFinal(this.id, times, r.block, r.round, slot), txCounter)
        break
      }
      case 'uwbReport': {
        // Only an anchor the Final actually listed reports. If the tag never
        // received this anchor's Response — an asymmetric link, or a capture
        // loss at the tag — there is no half-exchange to complete, so the
        // anchor stays silent rather than putting a useless PPDU on the air.
        if (!r.finalListedMe) return
        if (r.rxPollCounter === null || r.txRespCounter === null || r.rxFinalCounter === null) return
        const treply1 = counterDiff(r.txRespCounter, r.rxPollCounter)
        const tround2 = counterDiff(r.rxFinalCounter, r.txRespCounter)
        this.send(makeReport(this.id, r.tagId, treply1, tround2, r.block, r.round, slot), txCounter)
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
   */
  private transmitDl(
    action: SlotAction, slot: number, r: RoundState, peers: { tag: string; anchors: string[] }, txCounter: number,
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
        this.send(
          makePoll(
            this.id, peers.anchors.slice(1), r.plan.method, r.block, r.round,
            r.plan.schedule, r.plan.contentionSlots, this.cfg.maxAttempts,
            { txCounter, rxCounters: {} },
          ),
          txCounter,
        )
        break
      }
      case 'uwbResp': {
        // An anchor that never heard the Poll has nothing to answer, and no offset to report.
        if (r.rxPollCounter === null || dl.coffsToRef === null) return
        r.txRespCounter = txCounter
        this.send(
          makeResp(
            this.id, '*', r.plan.method, r.block, r.round, slot, undefined,
            { txCounter, rxCounters: { [refId]: r.rxPollCounter }, coffs: dl.coffsToRef },
          ),
          txCounter,
        )
        break
      }
      case 'uwbFinal': {
        // Anchor 0 closes the round whether or not anyone answered it: a tag needs the Final to
        // measure its own clock rate, and an empty round still tells it that much.
        r.txFinalCounter = txCounter
        this.send(makeFinal(this.id, [], r.block, r.round, slot, { txCounter, rxCounters: { ...dl.rxResp } }), txCounter)
        break
      }
      default:
        // No other kind is ever scheduled in this mode (see slotAction).
        break
    }
  }

  /** Radiate one PPDU: half-duplex for its whole airtime, RMARKER stamped before it leaves. */
  private send(desc: FrameDesc, txCounter: number): void {
    const t = this.now()
    // The MHR's Sequence Number is a real per-device counter, as in any 802.15.4
    // device, so the decoder has a number to show instead of the schedule tuple.
    const frame: FrameDesc = { ...desc, seqNo: this.seqNo }
    this.seqNo = (this.seqNo + 1) % 256
    this.setState('tx')
    this.emit({
      t, type: 'UWB_TS', node: this.id, dir: 'tx', peer: frame.dst,
      frameKind: frame.kind as UwbFrameKind, counter: txCounter,
    })
    this.ch.transmit(this.id, frame)
    // The timer belongs to *this* transmission: comparing the id keeps a stale
    // one (a PPDU that somehow outlived its slot) from idling the next.
    const txId = ++this.txSeq
    this.q.schedule(t + frame.txTimeNs, () => {
      if (this.state === 'tx' && this.txSeq === txId) this.setState('idle')
    }, 2)
  }

  // ---- measurements ---------------------------------------------------------

  /** Tag, on an anchor's Response. SS-TWR finishes the range here; DS-TWR banks it for the Final. */
  private onResponse(r: RoundState, from: string, frame: FrameDesc, counter: number, coffs: number, fom: number): void {
    if (r.txPollCounter === null) return
    const tround1 = counterDiff(counter, r.txPollCounter)
    r.peers.set(from, { id: from, rxRespCounter: counter, coffs, fom, tround1, treply2: null })
    if (r.plan.method !== 'ss') return
    const replyRctu = frame.uwb?.replyRctu
    if (replyRctu === undefined) return
    const tofRawRctu = ssTwrRaw(tround1, replyRctu)
    const tofRctu = ssTwrCorrected(tround1, replyRctu, coffs)
    this.reportRange(r, from, 'ss', tofRctu, tofRawRctu, fom)
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
  private onDlRx(
    r: RoundState, from: string, frame: FrameDesc, kind: UwbFrameKind, counter: number, coffs: number,
  ): void {
    const dl = r.dl
    const refId = r.anchors[0]
    if (!dl) return
    if (this.cfg.role === 'anchor') {
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
        dl.rxPoll = counter
        break
      case 'uwbFinal':
        dl.rxFinal = counter
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

  /** Anchor, on the tag's Final: it now holds all four times of the double-sided exchange. */
  private onFinal(r: RoundState, from: string, frame: FrameDesc, counter: number, fom: number): void {
    r.rxFinalCounter = counter
    const entry = frame.uwb?.finalTimes?.find((e) => e.id === this.id)
    // Whether the Final listed this anchor decides both its own range and
    // whether it may report at all (see transmitFor's uwbReport case).
    r.finalListedMe = entry !== undefined
    if (!entry) return // the tag never heard this anchor's Response
    if (r.rxPollCounter === null || r.txRespCounter === null) return
    const treply1 = counterDiff(r.txRespCounter, r.rxPollCounter)
    const tround2 = counterDiff(counter, r.txRespCounter)
    this.reportRange(r, from, 'ds', dsTwr(entry.tround1, treply1, tround2, entry.treply2), undefined, fom)
  }

  /** Tag, on an anchor's Report: the anchor's half of the double-sided exchange. */
  private onReport(r: RoundState, from: string, frame: FrameDesc, fom: number): void {
    const p = r.peers.get(from)
    const times = frame.uwb?.reportTimes
    if (!p || p.treply2 === null || !times) return
    this.reportRange(r, from, 'ds', dsTwr(p.tround1, times.treply1, times.tround2, p.treply2), undefined, fom)
  }

  private reportRange(
    r: RoundState, peer: string, method: 'ss' | 'ds', tofRctu: number, tofRawRctu: number | undefined, fom: number,
  ): void {
    const distM = rctuToMetres(tofRctu)
    this.emit({
      t: this.now(), type: 'UWB_RANGE', node: this.id, peer, method,
      tofRctu, ...(tofRawRctu !== undefined ? { tofRawRctu } : {}),
      distM, trueDistM: this.geometry.trueDistM(this.id, peer), fom, block: r.block, round: r.round,
    })
    if (this.cfg.role === 'tag') r.ranges.push({ id: peer, distM })
  }

  private setState(s: UwbDeviceState): void {
    if (this.state === s) return
    this.state = s
    this.emit({ t: this.now(), type: 'MAC_STATE', node: this.id, state: s })
  }
}
