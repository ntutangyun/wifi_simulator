/**
 * P802.15.4ab multi-millisecond (MMS) ranging for `UwbDevice`: the control exchange, the RSF/RIF
 * fragment trains and their combining detector, and the block fix they feed. Split out of
 * device.ts (pure move); every function here takes the device as its first argument.
 *
 * The control exchange has three shapes, and which one runs is the session's `control` /
 * `uwbdControl` (4ab draft 15-25/0194r0). Config 2 sends its POLL, RESP and REPORT on the
 * narrowband radio. Config 1 has no narrowband radio: the same three messages become SP0 packets
 * on the UWB PHY, or — with the control phase zero-length — are not sent at all, and the ranging
 * packet's own leading SYNC+SFD fragment is the poll and the response. Everything below asks the
 * round which shape it is rather than assuming the narrowband one.
 *
 * A round has one initiator and R responders. R = 1 is the pairwise cycle — one tag, one anchor,
 * one round per pair in a block — and R = N is the draft's **one-to-many** round, where the
 * initiator polls every anchor of the session at once, its train goes out once and is heard by
 * all of them, and each responder answers in narrowband and ranging slots of its own (4ab draft
 * 15-22/0381r5 Table 1.6.3.1, messages 0x10/0x11/0x12/0x13; the slot interleave itself is this
 * engine's — see `mmsLayout`). Everything below is written for R responders and takes the
 * pairwise path as the R = 1 case, which is what keeps a pair round byte-identical.
 *
 * Every device still owns a slot of its own inside each millisecond, so the round's trains never
 * overlap on the air. What a responder gains is that it hears the initiator's one train instead
 * of waiting for a round of its own — not that N trains are transmitted at once.
 */
import type { FrameDesc } from '../model/frames'
import type { UwbRxInfo } from './channel'
import { counterDiff, gaussian } from './clock'
import {
  makeNbPoll, makeNbPollOtm, makeNbReport, makeNbResp, makeRif, makeRsf,
  makeSp0Poll, makeSp0Report, makeSp0Resp,
  UWB_BROADCAST, type UwbFrameKind, type UwbInfo, type UwbSp0Msg,
} from './frames'
import {
  acquired, combineGainDb, mmsPacketFragments, mmsPacketSpanNs, MS_NS, MS_RCTU,
  rmarkerFromFragment, trainDetected,
} from './mms'

import { NB_LBT_THRESHOLD_DBM, nbLbtRequired } from './nb'
import { RCTU_NS, rstuNs, tsSigmaNs, UWB_PPM_MAX, UWB_RX_SENS_DBM, uwbSinrDb } from './phy'
import { rangeSigmaM, solvePosition } from './position'
import { fomFor, ssTwrCorrected, ssTwrRaw } from './ranging'
import { NOTHING_HEARD_DBM } from './records'
import { slotStartNs, type MmsRoundPlan, type SlotAction } from './session'
import type { RoundState, UwbDevice } from './device'
import { reportRange } from './device.report'

/** One fragment of a peer's train, as this receiver saw it. No record is emitted per fragment:
 * the train as a whole is what the receiver reports. */
export interface TrainFragment {
  index: number
  /**
   * When its RMARKER reached this antenna, in true time and **before** the receiver's own
   * excess delay and stamp noise (exactly as the 4z path separates `trueRmarkerNs` from
   * `extraNs`). The simulator's schedule fires on true time, but a real transmitter cuts its
   * train on its own crystal, so the millisecond spacing is re-scaled by the transmitter's ppm
   * here — that is the whole of what the train-derived clock ratio measures, and at ±20 ppm it
   * is at most 300 ns over the longest train, far inside the slot it sits in (model).
   */
  arrivalNs: number
  /** The excess delay of an obstructed first path, as for any other reception. */
  nlosNs: number
  nlos: boolean
  rssiDbm: number
  /** The worst foreign in-band power the mediator reported over this fragment's own reception,
   * in dBm; −Infinity with nothing foreign on the air. The train's combined SNR is measured
   * against it, so a Wi-Fi neighbour costs the train precision and not only fragments. */
  foreignDbm: number
}

/**
 * What this device holds about **one peer** of the round in progress: the responder it is
 * ranging with (at the initiator) or the initiator itself (at a responder). A pair round holds
 * exactly one of these and a one-to-many round one per responder, which is the whole of the
 * difference between the two at this level.
 */
export interface MmsPeerState {
  /** This peer's index in the round's responder list — the slots it owns. At a responder it is
   * that responder's own index, because the peer there is the initiator. */
  responder: number
  /**
   * This device knows there is a peer at the other end of the round. Only a primed peer's train
   * is closed out and turned into times.
   *
   * Where that knowledge comes from is the whole of the difference between the draft's two
   * configurations, and it is the causal chain the course teaches. Config 2: the narrowband
   * exchange — the initiator's RESP arrived, or the responder answered a POLL — so both ends hold
   * the same time base before a fragment goes out and the receiver accumulates blind. Config 1
   * with SP0: the same exchange, but the frame that carried it was an SP0 packet on the UWB PHY,
   * so being primed *is* having acquired that packet, inside the UWB link budget and 4 dB worse
   * than the ranging packet's own SYNC+SFD. Config 1 with no control phase at all: there is no
   * message to be primed by, so **acquiring the packet is the priming** — the first fragment this
   * device hears is the poll and the response, and a device that hears none never learns the peer
   * was there. 4ab draft 15-25/0194r0
   */
  primed: boolean
  /** The peer's fragments, per kind, in the order they arrived (which is index order). */
  frags: { rsf: TrainFragment[]; rif: TrainFragment[] }
  /** The trains already closed out, so a train is evaluated exactly once. */
  done: { rsf: boolean; rif: boolean }
  /** The peer's RMARKER as this device stamped it; null until that train is detected. */
  rxRmarker: number | null
  /** Whether that first path was obstructed — the range's figure of merit. */
  rxNlos: boolean
  /** The clock ratio the timing train measured, as this device's counter per the peer's; null
   * when fewer than two fragments were heard, which is what the narrowband fallback is for. */
  ratio: number | null
  /** The integrity train was detected (Y > 0 only): the flag a range carries. */
  rifDetected: boolean
}

/**
 * What one device holds for one MMS round (P802.15.4ab). Null in every other mode.
 *
 * The round has two halves and a device may reach neither: the control exchange *primes* it (the
 * initiator when its POLL is answered, the responder when it answers one), and only a primed
 * device transmits fragments or listens for them — unless there is no control exchange, where
 * the packet itself does that job (`MmsPeerState.primed`).
 */
export interface MmsRoundState {
  /** The narrowband channel this block hops to; the network draws it and both ends are told.
   * **Null under Config 1**, which has no narrowband radio to hop — and nothing here reads it
   * there, because nothing of that round goes out on the narrowband side. */
  nbChannel: number | null
  /** The round's POLL happened at this device: the initiator transmitted one, or the responder
   * received one. An initiator whose listen-before-talk check was busy never polled, and so has
   * no cycle to wait for a RESP of — the draft's discontinuation, on the initiator's side. */
  polled: boolean
  /** This device's own RMARKER: the counter it stamped its first fragment of the *timing* train
   * at (the RSFs, or the RIFs when the train carries no RSF). One train per round, whether it
   * goes to one responder or to all of them — which is the point of the one-to-many round. */
  txRmarker: number | null
  /**
   * How long this device's own packet was, **on its own ranging counter**: from the RMARKER it
   * stamped to the end of its last fragment. Null until that last fragment goes out, and null for
   * the whole of a round that named no fixed reply time — nothing else reads it.
   *
   * It is measured rather than looked up, and that is the point. The nominal span is a number both
   * ends know, but the span this transmitter actually produced is a span of *its* crystal, and the
   * fixed reply time's whole arithmetic is the initiator subtracting a reply time from a round trip
   * it measured on that same crystal (`rangeFromKnownReply`). Taking the nominal figure instead
   * would leave the crystal's offset over seven milliseconds of packet in the answer — some tens
   * of nanoseconds at ±20 ppm, which at the draft's own 30 cm per nanosecond is tens of metres.
   * 4ab draft 15-25/0556r2
   */
  txSpanRctu: number | null
  /** One entry per peer this device is ranging with, keyed by id. */
  peers: Map<string, MmsPeerState>
  /** The round's responders in slot order, as the schedule handed them over. Empty until the
   * first slot of the round runs. */
  responders: string[]
}

export function freshMms(_plan: MmsRoundPlan, nbChannel: number | null): MmsRoundState {
  return { nbChannel, polled: false, txRmarker: null, txSpanRctu: null, peers: new Map(), responders: [] }
}

/** This device's state for one peer, created on first use so that a round which never reaches a
 * peer carries no state about it. `responder` is the peer's slot index in the round. */
function peerState(m: MmsRoundState, mp: MmsRoundPlan, id: string, responder: number): MmsPeerState {
  const found = m.peers.get(id)
  if (found) return found
  const fresh: MmsPeerState = {
    responder, primed: false,
    frags: { rsf: [], rif: [] },
    done: { rsf: mp.phy.rsfs === 0, rif: mp.phy.rifs === 0 },
    rxRmarker: null, rxNlos: false, ratio: null, rifDetected: false,
  }
  m.peers.set(id, fresh)
  return fresh
}

/** Whether any peer of this round answered at all: what decides that a device's own train is
 * worth transmitting. In a pair round it is the one peer; in a one-to-many round one responder
 * is enough, because the train that goes out for it is the same train all the others would
 * have heard. */
function anyPrimed(m: MmsRoundState): boolean {
  for (const p of m.peers.values()) if (p.primed) return true
  return false
}

/**
 * Whether this round has a control exchange to be permitted by.
 *
 * With one — Config 2's narrowband messages, or Config 1's SP0 packets — an unprimed device
 * neither transmits a fragment nor listens for one: that is the draft's discontinuation rule, and
 * what makes a busy listen-before-talk check cost the whole cycle rather than one message.
 *
 * With a zero-length control phase there is nothing to wait for. Each device simply transmits in
 * the slots the schedule gave it, and listens in the others, because the packet's own leading
 * SYNC+SFD fragment is the poll and the response — there is no earlier moment at which anything
 * could have been learnt. Priming still happens, on the receiving side, and it happens by
 * acquiring that fragment. 4ab draft 15-25/0194r0
 */
function controlPrimes(mp: MmsRoundPlan): boolean {
  return mp.layout.controlSlots > 0
}

/**
 * With no control exchange, whether this device is the one that transmits without having been
 * told anything.
 *
 * Somebody has to go first, and the draft says who: the initiator sends its MMS packet without
 * waiting for a compact frame from the responder, and the responder starts its own sub-round only
 * after receiving that packet. So the opener's leading SYNC+SFD fragment IS the poll the other
 * side is waiting for, and the other side — having been told nothing else, ever — transmits only
 * once it has heard one. `reversedOrder` hands the opening to the responders, and this follows it.
 * 4ab draft 15-25/0292r1 for the order, 15-25/0194r0 for the fragment doing the poll's work.
 *
 * False in every round that has a control exchange: there, permission comes from the exchange and
 * nobody opens on their own.
 */
function opensRound(dev: UwbDevice, mp: MmsRoundPlan): boolean {
  if (controlPrimes(mp)) return false
  return (dev.cfg.role === 'tag') !== mp.phy.reversedOrder
}

/** Whether this round's control messages ride the UWB PHY as SP0 packets rather than the
 * narrowband radio. 4ab draft 15-25/0194r0 */
function sp0Control(mp: MmsRoundPlan): boolean {
  return mp.phy.control === 'uwbd'
}

/**
 * macMmsFixedReplyTime as a duration, or null when the session left the option off — **the one
 * conversion**, so the instant the responder replies at and the reply time the initiator assumes
 * cannot come out different.
 *
 * The option is the draft's "MMS without report". Single-sided two-way ranging needs two times:
 * the round trip the initiator measures, and the reply time the responder measures and sends back
 * in a compact frame. Agree the reply time beforehand and the initiator holds both already — so
 * the responder's report carries nothing and is not sent, and what the option saves is exactly the
 * energy of sending it. 4ab draft 15-25/0224r2 for the parameter, 15-25/0376r2 for the saving.
 */
function fixedReplyNs(mp: MmsRoundPlan): number | null {
  return mp.phy.fixedReplyRstu === null ? null : rstuNs(mp.phy.fixedReplyRstu)
}

/**
 * Responder: start its own packet a fixed interval after it finished receiving the initiator's.
 *
 * **From the end of the packet**, not from its first fragment. The earlier revision of the
 * proposal said the first fragment, but 15-25/0556r2 and 15-25/0681r1 both say "from the reception
 * of the HRP UWB PHY MMS packet", and the discussion gives the reason: an arrival estimate good
 * enough to reply from is only available at the end of the packet in the non-interleaved shape.
 * That is also why the option is tied to that shape at all — and why this arms on the packet's
 * **last** fragment and on nothing else. A round whose last fragment never arrived has no such
 * instant and so does not reply; the earlier fragments could have predicted the end from the
 * train's known shape, and this engine does not, because the draft's own condition is about the
 * end of the packet.
 *
 * The wait is counted on this device's **own crystal** — it is a MAC parameter in RSTU, and a
 * device has no other clock to count RSTU on. That is what makes the reply time a quantity the
 * initiator can convert with the ratio the train measured for it, rather than a nominal duration
 * whose crystal offset nobody can remove.
 *
 * The cost of all of it is accuracy, and the draft says so: the range is only as good as the
 * arrival estimate and as the responder's grip on its own transmit instant, and **1 ns of
 * time-of-flight error is about 30 cm of range** (15-25/0556r2). This engine does not add any
 * extra transmit-instant jitter of its own — a responder here hits the instant exactly — so what
 * the range carries is the residue of the model: the flight time the channel rounds to a whole
 * nanosecond, the whole nanosecond this wait is rounded to, and one fragment length of crystal
 * offset that neither end can convert away (`txSpanRctu`). Tens of centimetres, and named here
 * because the draft's own caveat is about a jitter this engine does not model.
 */
function armFixedReply(
  dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, peer: string,
  frag: { kind: 'rsf' | 'rif'; index: number },
): void {
  const replyNs = fixedReplyNs(mp)
  if (replyNs === null || dev.cfg.role === 'tag') return
  const frags = mmsPacketFragments(mp.phy, mp.fragGapNs)
  const last = frags[frags.length - 1]
  if (last === undefined || frag.kind !== last.kind || frag.index !== last.index) return
  // `now` is the end of that last fragment's reception: the channel delivers a frame at its end,
  // which is exactly the instant the draft measures from.
  const startNs = dev.now() + Math.round(replyNs / (1 + dev.clock.ppm * 1e-6))
  const roundNs = slotStartNs(r.plan, r.block, r.round, 0)
  // The report phase is the last thing in the round and the reply may be as long as 510 ms, so a
  // packet that would run into it — or into the next round — is not transmitted at all. The queue
  // would have fired it either way, and a fragment radiated over somebody else's slot is worse
  // than a round that produced nothing.
  const rangingEndNs = roundNs + (mp.layout.slots - mp.layout.reportSlots) * r.plan.slotNs
  if (startNs + mmsPacketSpanNs(mp.phy, mp.fragGapNs) > rangingEndNs) return
  for (const f of frags) {
    const at = startNs + f.offsetNs
    // Which slot the fragment ends up in — the frame carries it for the log and the decoder, and
    // it is where the fragment really went out rather than where the layout would have put it.
    const slot = Math.floor((at - roundNs) / r.plan.slotNs)
    const kind: 'uwbRsf' | 'uwbRif' = f.kind === 'rsf' ? 'uwbRsf' : 'uwbRif'
    dev.at(at, () => {
      if (dev.round !== r) return
      txOwnTrainFragment(dev, r, m, mp, [peer], kind, f.index, slot)
    })
  }
}

/**
 * Initiator, fixed reply time: open a receive window at each instant the responder's packet is
 * about to put a fragment on the air.
 *
 * The responder's packet is off the slot grid, so the round's own fragment slots are not where it
 * lands and the schedule cannot arm these windows. The initiator derives them from what it knows:
 * its own packet ends `mmsPacketSpanNs` after the RMARKER it has just stamped, and the reply
 * follows the pre-agreed interval after that.
 *
 * Its reading of that instant and the responder's differ by exactly two things, and the window is
 * opened early enough to swallow both: twice the flight time, which is always *positive* and so
 * only ever delays the arrival, and the crystal offset over the reply itself, which can shorten
 * the responder's count by up to `UWB_PPM_MAX` of it. Opening early costs nothing — the window
 * closes at a slot boundary regardless, and a fragment's wait reports no miss.
 */
function armFixedReplyListen(
  dev: UwbDevice, r: RoundState, mp: MmsRoundPlan, responders: string[],
): void {
  const replyNs = fixedReplyNs(mp)
  if (replyNs === null) return
  // A pair round, which is the only shape the option is written for: the draft carries the reply
  // time in a *one-to-one* Response Compact frame, and R responders replying after one constant
  // would all reply at once. `UwbMmsSchema` refuses the combination; this reads the one responder.
  const id = responders[0]
  if (id === undefined) return
  const early = Math.ceil(replyNs * UWB_PPM_MAX * 1e-6) + 1
  const startNs = dev.now() + mmsPacketSpanNs(mp.phy, mp.fragGapNs) + replyNs - early
  for (const f of mmsPacketFragments(mp.phy, mp.fragGapNs)) {
    const at = startNs + f.offsetNs
    const kind: 'uwbRsf' | 'uwbRif' = f.kind === 'rsf' ? 'uwbRsf' : 'uwbRif'
    dev.at(at, () => {
      if (dev.round !== r) return
      // Two slots, so a fragment that straddles a boundary is still the frame this wait was for.
      // Silent: a lost fragment is counted by the train, never reported one by one.
      dev.listenFor(r.slot, id, kind, r.slot + 2, true)
    })
  }
}

/**
 * Initiator, fixed reply time: the range, from a reply time nobody sent it.
 *
 * This is the whole point of the option. The round trip is measured as it always was — the
 * initiator's own RMARKER to the responder's. The reply time is not measured by anybody: it is
 * this device's **own** packet span, which it measured on its own counter, plus the pre-agreed
 * constant, which is a count of the **responder's** counter and so is converted by `ratio` — the
 * receiver's counter per the peer's, which the responder's own train just handed over. Nothing
 * arrives carrying a time, and the range comes out all the same.
 *
 * `ratio` is required. With fewer than two fragments heard there is none, and with the report gone
 * there is no carrier-offset fallback either — the frame that fallback used to ride on is the frame
 * this option exists to not send. So a train too thin to measure a ratio over produces no range
 * here, which is the honest answer rather than a reply time left at nominal rate.
 * 4ab draft 15-25/0224r2, 15-25/0376r2, 15-25/0556r2
 */
function rangeFromKnownReply(
  dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, p: MmsPeerState, peer: string,
): void {
  const replyNs = fixedReplyNs(mp)
  if (replyNs === null || dev.cfg.role !== 'tag') return
  if (m.txRmarker === null || m.txSpanRctu === null || p.rxRmarker === null || p.ratio === null) return
  const roundTripRctu = counterDiff(p.rxRmarker, m.txRmarker)
  const fixedRctu = replyNs / RCTU_NS
  const replyRctu = m.txSpanRctu + fixedRctu * p.ratio
  reportRange(
    dev, r, peer, 'ss',
    (roundTripRctu - replyRctu) / 2,
    // The raw figure is what the same two times come to with no clock correction at all, exactly
    // as a reported reply time's is.
    ssTwrRaw(roundTripRctu, m.txSpanRctu + fixedRctu),
    fomFor(p.rxNlos),
    mp.phy.rifs > 0 ? p.rifDetected : undefined,
  )
}

/** The frame kind this round's control messages arrive as — what a listen window is armed for. */
function controlKind(mp: MmsRoundPlan, role: 'poll' | 'resp' | 'report'): UwbFrameKind {
  if (sp0Control(mp)) return 'uwbSp0'
  return role === 'poll' ? 'nbPoll' : role === 'resp' ? 'nbResp' : 'nbReport'
}

/** The round's fragment spacing in ranging counter units — `MmsRoundPlan.fragGapNs`, in the
 * units a counter difference is measured in. A true millisecond is `MS_RCTU` exactly, which is
 * what every pairwise round at the draft's 600 RSTU slot comes to. */
function fragGapRctu(mp: MmsRoundPlan): number {
  return (MS_RCTU * mp.fragGapNs) / MS_NS
}

/** Which of a train's two kinds carries the round's ranging time: the RSFs, or the RIFs when
 * the session's train has no RSF at all. The other kind is logged and, for the RIFs, decides the
 * integrity flag — but no time is taken from it. 4ab draft 15-23/0100r2 §2.3.2 */
function timingKind(mp: MmsRoundPlan): 'uwbRsf' | 'uwbRif' {
  return mp.phy.rsfs > 0 ? 'uwbRsf' : 'uwbRif'
}

/**
 * One slot of an MMS round. The shape is `mmsLayout`'s and reaches the device through the round
 * plan, so neither end derives it twice: control (narrowband POLL, then one RESP window per
 * responder), the ranging phase (every train, interleaved a slot apart inside each millisecond),
 * and the narrowband report windows.
 *
 * Two rules run through all of it. **Priming**: the control exchange is what tells a device
 * there is a peer to range with, and an unprimed pair neither transmits a fragment nor listens
 * for one — the draft's discontinuation rule, and what makes a busy listen-before-talk check
 * cost the whole cycle rather than one message. A round with no control exchange has no such
 * permission to give and asks for none (`controlPrimes`). **Evaluation at the end of a train**: a fragment
 * is never stamped on arrival (see `onMmsRx`); a train is closed out in the slot after its last
 * fragment, which is where every draw and every record of it happens.
 */
export function onMmsSlot(
  dev: UwbDevice, slot: number, action: SlotAction, r: RoundState, peers: { tag: string; anchors: string[] },
): void {
  const m = r.mms
  const mp = r.plan.mms
  if (!m || !mp) return
  const isTag = dev.cfg.role === 'tag'
  const responders = peers.anchors
  if (peers.tag === '' || responders.length === 0) return
  m.responders = responders
  // A responder acts only in the slots of its own index; a device the round does not list has
  // nothing to do in it at all.
  const mine = isTag ? -1 : responders.indexOf(dev.id)
  if (!isTag && mine < 0) return
  closeDueTrains(dev, r, m, mp, peers, slot)
  // Whether this device may act on a peer in a fragment slot. With a control exchange it is what
  // that exchange said; with none, the schedule alone decides, and the packet primes the
  // receiving end as it arrives (`controlPrimes`).
  const open = (id: string): boolean => !controlPrimes(mp) || m.peers.get(id)?.primed === true
  // One window's width, and so the width of a wait inside it: two slots for a narrowband message,
  // one for an SP0 packet. Read off the layout, never assumed — and read twice, because the draft
  // sizes the control phase and the report phase from separate pairs of parameters, so a round
  // whose control windows are gone still has report windows of their own width.
  // 4ab draft 15-25/0194r0
  const win = mp.layout.windowSlots
  const rwin = mp.layout.reportWindowSlots
  switch (action.kind) {
    case 'nbPoll':
    case 'nbResp':
    case 'nbReport':
    case 'uwbSp0': {
      const role = action.kind === 'uwbSp0' ? action.role
        : action.kind === 'nbPoll' ? 'poll' : action.kind === 'nbResp' ? 'resp' : 'report'
      const kind = controlKind(mp, role)
      if (role === 'poll') {
        if (isTag) txControlPoll(dev, r, m, mp, responders)
        else dev.listenFor(slot, peers.tag, kind, slot + win)
        return
      }
      // Past the POLL, every control action names the responder whose window this is. (A POLL
      // does not, which is why it is handled above and not here.)
      const anchor = 'anchor' in action ? action.anchor : 0
      const id = responders[anchor]
      if (id === undefined) return
      if (role === 'resp') {
        if (!isTag) {
          if (anchor === mine) txControlResp(dev, r, m, mp, peers.tag, slot, mine)
          return
        }
        if (m.polled) dev.listenFor(slot, id, kind, slot + win)
        return
      }
      if (action.tx === 'tag') {
        // The initiator's answer to responder `anchor`, in that responder's own window.
        if (isTag) txControlReport(dev, r, m, mp, id, slot)
        else if (anchor === mine && open(peers.tag)) dev.listenFor(slot, peers.tag, kind, slot + rwin)
        return
      }
      if (!isTag) {
        if (anchor === mine) txControlReport(dev, r, m, mp, peers.tag, slot)
        return
      }
      if (open(id)) dev.listenFor(slot, id, kind, slot + rwin)
      return
    }
    case 'uwbRsf':
    case 'uwbRif': {
      // With a fixed reply time the responders' column is not in these slots at all: it starts a
      // pre-agreed interval after the initiator's packet finished arriving, which is a run-time
      // instant and not a slot (`armFixedReply`). So the slot the layout set aside for it goes
      // unused at both ends — the responder does not transmit in it, and the initiator does not
      // listen in it, because it has opened windows of its own where the packet really is.
      const fixedReply = fixedReplyNs(mp) !== null
      if (action.tx === 'tag') {
        if (isTag) txOwnTrainFragment(dev, r, m, mp, responders, action.kind, action.index, slot)
        // A lost fragment is counted by the train, not reported: `silent`.
        else if (open(peers.tag)) dev.listenFor(slot, peers.tag, action.kind, slot + 1, true)
        return
      }
      const id = responders[action.anchor]
      if (id === undefined) return
      if (!isTag) {
        if (action.anchor === mine && !fixedReply) {
          txOwnTrainFragment(dev, r, m, mp, [peers.tag], action.kind, action.index, slot)
        }
        return
      }
      if (open(id) && !fixedReply) dev.listenFor(slot, id, action.kind, slot + 1, true)
      return
    }
    default:
      // 'idle', and every 4z kind: no MMS round ever schedules one.
      return
  }
}

/**
 * Listen before talk on the block's narrowband channel (4ab draft 15-22/0381r5 §1.4.2), and
 * the draft's discontinuation that follows a busy one: **no narrowband transmission for the
 * rest of the block**, which with no POLL (or no RESP) means no cycle at all.
 *
 * A clear check emits nothing and draws nothing — it is the ordinary case, and a record per
 * clear check would be one per narrowband slot of every round.
 */
function nbClear(dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan): boolean {
  // Config 1 has no narrowband radio, so there is no channel to sense and no rule to obey: its
  // control frames go out on the UWB PHY, where the draft imposes no listen-before-talk. Asking
  // the question at all would be asking about a radio that is not there. 4ab draft 15-25/0194r0
  if (m.nbChannel === null) return true
  if (dev.nbSkipBlock === r.block) return false
  if (!nbLbtRequired(m.nbChannel, mp.nbLbt)) return true
  const { busy, foreignDbm } = dev.ch.lbtBusy(dev.id, m.nbChannel)
  if (!busy) return true
  dev.nbSkipBlock = r.block
  dev.emit({
    t: dev.now(), type: 'UWB_NB_LBT', node: dev.id, channel: m.nbChannel,
    foreignDbm, thresholdDbm: NB_LBT_THRESHOLD_DBM, block: r.block, round: r.round,
  })
  return false
}

/** Initiator, its POLL window: open the cycle. A pair round polls its one responder by name; a
 * one-to-many round broadcasts one POLL — the narrowband one lists every responder it is for,
 * the SP0 one cannot (`makeSp0Poll`) and does not need to. */
function txControlPoll(
  dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, responders: string[],
): void {
  if (!nbClear(dev, r, m, mp)) return
  m.polled = true
  if (sp0Control(mp)) {
    const dst = mp.oneToMany ? UWB_BROADCAST : responders[0]
    if (dst === undefined) return
    dev.send(makeSp0Poll(dev.id, dst, r.block, r.round, mp.layout.pollSlot()), null)
    return
  }
  const nbChannel = m.nbChannel as number
  dev.send(
    mp.oneToMany
      ? makeNbPollOtm(dev.id, responders, nbChannel, r.block, r.round)
      : makeNbPoll(dev.id, responders[0], nbChannel, r.block, r.round),
    null,
  )
}

/** Responder, its own RESP window: answer a POLL it heard — and only then is either end primed.
 * The POLL it heard was a narrowband message or an SP0 packet, and the answer follows it onto the
 * same radio. */
function txControlResp(
  dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, peer: string, slot: number, mine: number,
): void {
  if (!m.polled) return
  if (!nbClear(dev, r, m, mp)) return
  peerState(m, mp, peer, mine).primed = true
  if (sp0Control(mp)) {
    dev.send(makeSp0Resp(dev.id, peer, r.block, r.round, slot), null)
    return
  }
  const nbChannel = m.nbChannel as number
  dev.send(
    mp.oneToMany
      ? makeNbResp(dev.id, peer, nbChannel, r.block, r.round, slot, true)
      : makeNbResp(dev.id, peer, nbChannel, r.block, r.round),
    null,
  )
}

/**
 * One fragment of this device's own train. Only the first is stamped, and its stamp is taken at
 * the transmission instant itself with **no SHR offset**: an MMS fragment's RMARKER is its first
 * pulse, not a marker 73 µs into a preamble it does not have.
 *
 * `to` is the one peer in a pair round and at a responder, and the broadcast address in a
 * one-to-many initiator's train — one train, heard by every responder at once, which is what
 * the mode exists for.
 */
function txOwnTrainFragment(
  dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, to: string[],
  kind: 'uwbRsf' | 'uwbRif', index: number, slot: number,
): void {
  // Somebody has to have answered the control exchange — or, where there is none, this has to be
  // the device that opens the round, whose own leading fragment is the poll the far end is
  // waiting for. A device that is neither has been told nothing and says nothing.
  if (!anyPrimed(m) && !opensRound(dev, mp)) return
  const dst = mp.oneToMany && dev.cfg.role === 'tag' ? UWB_BROADCAST : to[0]
  if (dst === undefined) return
  const counter = dev.clock.counter(dev.now())
  const desc = kind === 'uwbRsf'
    ? makeRsf(dev.id, dst, index, mp.phy, r.block, r.round, slot)
    : makeRif(dev.id, dst, index, mp.phy, r.block, r.round, slot)
  if (index === 0 && kind === timingKind(mp)) {
    m.txRmarker = counter
    // The initiator knows when its own packet will end, and so when a fixed reply is due: it opens
    // the windows for it now, because the responder's column will not be in the slots the layout
    // reserved for it.
    if (dev.cfg.role === 'tag') armFixedReplyListen(dev, r, mp, to)
  }
  // The last fragment of the packet closes its span, on this transmitter's own counter — the ruler
  // the fixed reply time's arithmetic is done with (`MmsRoundState.txSpanRctu`). The fragment's own
  // length is the nominal one: it is the same constant at both ends of the round, and the only
  // thing in the span neither of them can convert. Taken only where something reads it, so a round
  // without the option walks no fragment list per fragment.
  if (fixedReplyNs(mp) !== null && m.txRmarker !== null) {
    const frags = mmsPacketFragments(mp.phy, mp.fragGapNs)
    const last = frags[frags.length - 1]
    if (last !== undefined && index === last.index && kind === (last.kind === 'rsf' ? 'uwbRsf' : 'uwbRif')) {
      m.txSpanRctu = counterDiff(counter, m.txRmarker) + last.lenNs / RCTU_NS
    }
  }
  dev.send(desc, index === 0 ? counter : null)
}

/**
 * A measurement report, in the report window this device owns for this peer — a narrowband
 * message under Config 2 and an SP0 packet under Config 1. The responder sends the reply time it
 * turned the round around in and the initiator the round trip it measured — the two halves of one
 * single-sided exchange, carried in a control frame because the ranging phase of an MMS cycle
 * transmits nothing but fragments. A one-to-many round
 * gives every responder a pair of windows of its own, so the initiator answers each of them
 * separately and no message ever has to carry more than the one time its sender measured (4ab
 * draft 15-22/0381r5 Table 1.6.3.1, REPORT 0x12 / 0x13).
 *
 * A device whose own train of this peer was never detected has no RMARKER of it and so no time
 * to report; it stays silent, and the other end's wait reports the gap.
 */
function txControlReport(
  dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, peer: string, slot: number,
): void {
  // The responder's half of the exchange is the reply time, and with a fixed reply time the
  // initiator already has it — so the frame carries nothing and is not sent. That is the whole of
  // what the option saves: not a shorter report, no report. The initiator's own half still goes
  // out, because the round trip it measured is the responder's only way to a range of its own.
  // 4ab draft 15-25/0376r2 (avoiding the need to send the report), 15-25/0224r2
  if (dev.cfg.role !== 'tag' && fixedReplyNs(mp) !== null) return
  const p = m.peers.get(peer)
  if (m.txRmarker === null || !p || !p.primed || p.rxRmarker === null) return
  if (!nbClear(dev, r, m, mp)) return
  const times = dev.cfg.role === 'tag'
    ? { roundTripRctu: counterDiff(p.rxRmarker, m.txRmarker) }
    : { replyRctu: counterDiff(m.txRmarker, p.rxRmarker) }
  if (sp0Control(mp)) {
    dev.send(makeSp0Report(dev.id, peer, r.block, r.round, slot, times), null)
    return
  }
  dev.send(makeNbReport(dev.id, peer, m.nbChannel as number, r.block, r.round, slot, times, mp.oneToMany), null)
}

/**
 * An MMS reception. Nothing here draws from the generator and nothing here emits a record: a
 * fragment is collected, a control message is acted on, and the train's own evaluation is
 * where the timestamps are taken.
 */
export function onMmsRx(
  dev: UwbDevice, r: RoundState, from: string, frame: FrameDesc, kind: UwbFrameKind, info: UwbRxInfo,
): void {
  const m = r.mms
  const mp = r.plan.mms
  dev.clearExpectation()
  dev.setState('idle')
  const u = frame.uwb
  if (!m || !mp || !u) return
  const isTag = dev.cfg.role === 'tag'
  // A responder's only peer is the initiator. Nothing else in the round is addressed to it, and
  // taking a frame from another responder would open a peer state the control exchange never
  // primed — which `anyPrimed` would then read as permission to transmit a train of its own.
  // The listen windows already make that unreachable; this makes it so without depending on them.
  if (!isTag && from !== r.tagId) return
  // The peer's index in the round: a responder's own when this device is the initiator, and
  // this device's own when the peer is the initiator.
  const index = isTag ? m.responders.indexOf(from) : m.responders.indexOf(dev.id)
  if (index < 0) return
  const frag = u.mms
  if (frag) {
    const p = peerState(m, mp, from, index)
    // With no control exchange, THIS is the priming: the packet's own leading SYNC+SFD fragment
    // is the poll and the response, so a device that hears a fragment has been told everything a
    // POLL would have told it, and a device that hears none never learns the peer was there at
    // all. 4ab draft 15-25/0194r0
    if (!controlPrimes(mp)) p.primed = true
    // The schedule fires a fragment on true time; a real transmitter cuts its train on its
    // own crystal, and that difference IS the clock ratio the train measures. Re-space the
    // arrival by the transmitter's ppm here — at most 300 ns over the longest train (model).
    const drift = info.txPpm * 1e-6
    p.frags[frag.kind].push({
      index: frag.index,
      arrivalNs: info.txStartNs + info.propNs - (frag.index * mp.fragGapNs * drift) / (1 + drift),
      nlosNs: info.nlosNs, nlos: info.nlos, rssiDbm: info.rssiDbm, foreignDbm: info.foreignDbm,
    })
    // …and if this was the last fragment of the initiator's packet, the instant the draft's fixed
    // reply time is measured from has just passed. `now` is it.
    armFixedReply(dev, r, m, mp, from, frag)
    return
  }
  // The control plane's three messages, whichever radio brought them: `role` is what they are,
  // and `kind` only says which of the two PHYs carried them here. 4ab draft 15-25/0194r0
  const role = controlRole(kind, u.sp0)
  switch (role) {
    case 'poll':
      // A one-to-many POLL is a broadcast: the narrowband one opens the round only for the
      // responders it names. An SP0 POLL names none — it has no room for a list — so the round's
      // own responder list is what a device checked itself against, in `onMmsSlot`.
      if (u.nb?.responders && !u.nb.responders.includes(dev.id)) return
      m.polled = true
      return
    case 'resp':
      // The initiator learns here, and only here, that this responder is in the round.
      peerState(m, mp, from, index).primed = true
      return
    case 'report':
      onControlReportRx(dev, r, m, mp, from, u, info)
      return
    default:
      return
  }
}

/** Which of the control plane's three messages a reception is, or null if it is not one of them.
 * Config 2's three frame kinds say it on their own; Config 1's one frame kind says it in its
 * content, because SP0 is one packet format carrying all three. 4ab draft 15-25/0194r0 */
function controlRole(kind: UwbFrameKind, sp0: UwbSp0Msg | undefined): 'poll' | 'resp' | 'report' | null {
  if (kind === 'uwbSp0') return sp0?.role ?? null
  if (kind === 'nbPoll') return 'poll'
  if (kind === 'nbResp') return 'resp'
  return kind === 'nbReport' ? 'report' : null
}

/** Close out every train whose last fragment was due in the slot just gone — one per primed
 * peer, in responder order, which is the order their slots run in. */
function closeDueTrains(
  dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan,
  peers: { tag: string; anchors: string[] }, slot: number,
): void {
  const isTag = dev.cfg.role === 'tag'
  const peerSide = isTag ? 'responder' : 'initiator'
  const ids = isTag ? peers.anchors : [peers.tag]
  for (const id of ids) {
    const p = m.peers.get(id)
    if (!p || !p.primed) continue
    for (const kind of ['rsf', 'rif'] as const) {
      if (p.done[kind]) continue
      const n = kind === 'rsf' ? mp.phy.rsfs : mp.phy.rifs
      if (slot !== mp.layout.fragmentSlot(peerSide, kind, n - 1, p.responder) + 1) continue
      p.done[kind] = true
      evaluateTrain(dev, r, m, mp, p, id, kind, n)
    }
  }
}

/**
 * What one train came to, and the two timestamps taken from it — the heart of the mode.
 *
 * Detection is combining: the receiver was primed by the control exchange and accumulated
 * blind, so no single fragment had to be audible on its own, and `heard` of them at `rxDbm`
 * add up to `rxDbm + 10·log10(heard)`. That is the whole multi-millisecond idea, and
 * `marginDb` is how far it cleared the receiver's sensitivity.
 *
 * Under Config 1 there is one question in front of that one: nothing was primed over a
 * narrowband exchange there — the time base came out of an SP0 packet on the UWB PHY, or, with no
 * control phase at all, out of this very packet's leading SYNC+SFD fragment — so the receiver has
 * to find the packet before it can accumulate anything, and `acquired` decides that on a SINGLE
 * fragment with no combining. Fail it and the train counts as undetected however loud it was — the fragments are all there and not one of
 * them can be timestamped — so the round produces no range. Config 2 never fails it, which is
 * why every scenario that has not asked for Config 1 runs exactly as it did.
 *
 * The draws, in the order the spec fixes them: the first heard fragment's stamp, then — only
 * when two or more were heard — the last heard fragment's. Nothing is drawn per fragment, and
 * nothing at all for a train that was not detected. The first stamp is taken twice over, from
 * one draw: once at its own arrival, which is what the second stamp is measured against, and
 * once walked back to the RMARKER (fragment 0, whether or not it arrived) — by the ratio the
 * two stamps just measured, because the milliseconds walked back are the peer's and this
 * counter is this receiver's. When fragment 0 did arrive the two are the same number.
 */
function evaluateTrain(
  dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, p: MmsPeerState,
  peer: string, kind: 'rsf' | 'rif', fragments: number,
): void {
  const frags = p.frags[kind]
  const heard = frags.length
  const rxDbm = heard > 0 ? frags[0].rssiDbm : NOTHING_HEARD_DBM
  const gainDb = combineGainDb(heard)
  const marginDb = heard > 0 ? rxDbm + gainDb - UWB_RX_SENS_DBM : NOTHING_HEARD_DBM
  // One SYNC+SFD opens the whole packet, so acquisition is judged once — on the train that leads
  // the packet, the RSFs when there are any and the RIFs when X = 0 — and both trains of that
  // packet live or die by the one verdict. A fragment the channel never delivered is missing
  // from `frags` entirely, so when the leading one did not arrive it is handed over as the
  // inaudible thing it was, rather than letting fragment 1 slide into its place.
  const opening = mp.phy.rsfs > 0 ? p.frags.rsf : p.frags.rif
  const openers = opening.length > 0 && opening[0].index === 0
    ? opening
    : [{ rssiDbm: NOTHING_HEARD_DBM }, ...opening]
  const detected = acquired(mp.phy, openers) && heard > 0 && trainDetected(rxDbm, heard)
  const frameKind: UwbFrameKind = kind === 'rsf' ? 'uwbRsf' : 'uwbRif'
  let ratio: number | null = null
  let rmarker: number | null = null
  let fom = 0
  if (detected) {
    const first = frags[0]
    // The train is stamped at what it *combined* to, not at one fragment's power: the whole
    // point of the mode is that N fragments buy 10·log10(N) dB, and those decibels buy timestamp
    // precision exactly as distance would (`tsSigmaNs`). Both stamps below are taken at this
    // one 1-σ — they are two reads of the same accumulated train.
    const sigmaNs = tsSigmaNs(dev.cfg.tsNoisePs, uwbSinrDb(rxDbm + gainDb, first.foreignDbm))
    const firstExtraNs = first.nlosNs + gaussian(dev.rng) * sigmaNs
    const firstCounter = dev.clock.counter(first.arrivalNs, firstExtraNs)
    fom = fomFor(first.nlos)
    if (heard >= 2) {
      const last = frags[heard - 1]
      const lastExtraNs = last.nlosNs + gaussian(dev.rng) * sigmaNs
      const spanRctu = counterDiff(dev.clock.counter(last.arrivalNs, lastExtraNs), firstCounter)
      // The fragments are `fragGapRctu(mp)` apart on the transmitter's clock — a millisecond
      // only in the pairwise round, (responders + 1) slots otherwise — so the span this
      // receiver measured over them is its own counter per the peer's: a ruler as long as the
      // whole train, where the narrowband carrier offers only its own residual.
      ratio = spanRctu / ((last.index - first.index) * fragGapRctu(mp))
    }
    // …and that same ruler is what the walk-back to the RMARKER is measured with when the
    // leading fragments were lost. With fragment 0 in hand this is `firstCounter` itself, so
    // a train that arrived whole is stamped exactly as before.
    rmarker = rmarkerFromFragment(firstCounter, first.index, ratio, fragGapRctu(mp))
  }
  dev.emit({
    t: dev.now(), type: 'UWB_MMS_TRAIN', node: dev.id, peer, kind,
    fragments, heard, rxDbm, gainDb, marginDb, detected,
    ratioPpm: ratio === null ? null : (ratio - 1) * 1e6,
    block: r.block, round: r.round,
    // Only a one-to-many round says who else was in it: a pair round's record has to compare
    // equal, field for field, to the one that shipped before the mode existed.
    ...(mp.oneToMany ? { responders: [...m.responders] } : {}),
  })
  if (detected && rmarker !== null) {
    dev.emit({
      t: dev.now(), type: 'UWB_TS', node: dev.id, dir: 'rx', peer, frameKind, counter: rmarker, fom,
    })
  }
  // Only one of the two trains carries this round's time. An integrity train is evaluated and
  // logged like any other — it is the flag the range carries — but no time is taken from it,
  // unless it is all the train has (X = 0).
  if (kind === 'rif') p.rifDetected = detected
  if (frameKind !== timingKind(mp) || !detected || rmarker === null) return
  p.rxRmarker = rmarker
  p.rxNlos = frags[0].nlos
  p.ratio = ratio
  // With a fixed reply time the initiator has both halves the moment it has timed this train:
  // there is no report on its way, and waiting for one would be waiting forever.
  rangeFromKnownReply(dev, r, m, mp, p, peer)
}

/**
 * The peer's half of the exchange has arrived: this device now holds a round trip and a reply
 * time, and turns them into a range.
 *
 * The clock correction of single-sided TWR is always the *responder's* rate against the
 * *initiator's*, whoever is computing — the reply is measured on one clock and the round trip
 * on the other, and only their ratio matters. A train hands that over directly: the ratio it
 * measured is this device's counter per the peer's, so the responder uses it as it stands and
 * the initiator inverts it. Without a train (one fragment heard, or none but the integrity
 * one) the device falls back on what the 4z path has always used — the carrier-frequency
 * offset its receiver estimated, with the estimator's residual drawn here, once.
 */
function onControlReportRx(
  dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, from: string, u: UwbInfo,
  info: UwbRxInfo,
): void {
  // The same two times, from whichever of the two control PHYs carried them.
  const msg = u.nb ?? u.sp0
  const p = m.peers.get(from)
  if (!msg || !p || m.txRmarker === null || p.rxRmarker === null) return
  const isTag = dev.cfg.role === 'tag'
  const own = isTag ? counterDiff(p.rxRmarker, m.txRmarker) : counterDiff(m.txRmarker, p.rxRmarker)
  const roundTripRctu = isTag ? own : msg.roundTripRctu
  const replyRctu = isTag ? msg.replyRctu : own
  if (roundTripRctu === undefined || replyRctu === undefined) return
  let coffs: number
  if (p.ratio !== null) {
    coffs = isTag ? 1 / p.ratio - 1 : p.ratio - 1
  } else {
    const responderPpm = isTag ? info.txPpm : dev.clock.ppm
    const initiatorPpm = isTag ? dev.clock.ppm : info.txPpm
    coffs = (responderPpm - initiatorPpm) * 1e-6 + gaussian(dev.rng) * dev.cfg.cfoNoisePpm * 1e-6
  }
  reportRange(
    dev, r, from, 'ss',
    ssTwrCorrected(roundTripRctu, replyRctu, coffs),
    ssTwrRaw(roundTripRctu, replyRctu),
    fomFor(p.rxNlos),
    mp.phy.rifs > 0 ? p.rifDetected : undefined,
  )
}

/**
 * Tag, MMS: the block's fix. A pair round holds one anchor, so three ranges are three rounds —
 * which is why this is the one mode whose fix is not a round's but a block's, and why it is
 * solved at the block's last pair round. A one-to-many round holds every anchor at once, so its
 * ranges are all in by the end of the round and the fix is solved there.
 *
 * An MMS range is a two-way range like any other, so the record says `method: 'twr'`; what made
 * it is on the round's own `UWB_ROUND.mode`.
 */
export function solveMmsFix(dev: UwbDevice, r: RoundState): void {
  const anchors = r.anchors.length
  if (r.plan.mms?.oneToMany !== true) {
    // Round t·A + k belongs to anchor k, so the block's last pair round for this tag is k = A−1.
    if (anchors === 0 || r.round % anchors !== anchors - 1) return
  }
  const ranges = [...dev.blockRanges].map(([id, distM]) => ({ id, distM }))
  dev.blockRanges.clear()
  if (ranges.length < 3) return
  const fix = solvePosition(
    r.anchors.map((id) => dev.geometry.anchorPos(id)),
    ranges,
    dev.cfg.pos.z,
    rangeSigmaM(dev.cfg.tsNoisePs),
  )
  if (!fix) return
  dev.emit({
    t: dev.now(), type: 'UWB_POSITION', node: dev.id,
    x: fix.x, y: fix.y, trueX: dev.cfg.pos.x, trueY: dev.cfg.pos.y,
    gdop: fix.gdop, ellipse: fix.ellipse, anchors: ranges.map((x) => x.id), block: r.block,
    method: 'twr',
  })
}
