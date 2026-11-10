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
 * A round has one initiator and R responders. R = 1 is the pairwise cycle; R = N is the draft's
 * one-to-many round. Interleaved, a one-to-many round is **one ranging sub-round per responder**,
 * each a complete pairwise exchange with its own POLL (Message Control 1 on the first, naming the
 * responders; Message Control 0 on the later ones), so the initiator's train goes out once per
 * sub-round (15-25/0213r2, CID 474). Non-interleaved (§10.39.7), the initiator sends its train
 * once in its own sub-round and each responder answers in a sub-round of its own; how the draft
 * cuts that shape for one-to-many is not finished (15-25/0213r2, CIDs 205/207), so that order is
 * this engine's. Everything a device holds is therefore held **per peer** (`MmsPeerState`): the
 * POLL, the RMARKER of its own train for that peer, and the peer's train.
 */
import type { FrameDesc } from '../model/frames'
import type { UwbSsbdCfg } from '../model/scenario'
import type { UwbRxInfo } from './channel'
import { counterDiff, gaussian } from './clock'
import {
  makeNbPoll, makeNbPollOtm, makeNbReport, makeNbResp, makeRif, makeRsf,
  makeSp0Poll, makeSp0Report, makeSp0Resp,
  UWB_BROADCAST, type UwbFrameKind, type UwbInfo, type UwbSp0Msg,
} from './frames'
import {
  acquired, combineGainDb, mmsSp0TxDbm, MS_NS, MS_RCTU, rmarkerFromFragment, trainDetected,
} from './mms'
import {
  NB_CSMA, NB_LBT_THRESHOLD_DBM, NB_PHY_CCA_DURATION_US, NB_POLL_BYTES, NB_REPORT_BYTES,
  NB_RESP_BYTES, NB_UNIT_BACKOFF_US, nbLbtRequired, nbOtmPollBytes,
} from './nb'
import { nbSlotSlackNs, tsSigmaNs, UWB_RX_SENS_DBM, uwbSinrDb } from './phy'
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
   * here — that is the whole of what the train-derived clock ratio measures (model).
   */
  arrivalNs: number
  /** The excess delay of an obstructed first path, as for any other reception. */
  nlosNs: number
  nlos: boolean
  rssiDbm: number
  /** The worst foreign in-band power the mediator reported over this fragment's own reception,
   * in dBm; −Infinity with nothing foreign on the air. */
  foreignDbm: number
}

/**
 * What this device holds about **one peer** of the round in progress: the responder it is
 * ranging with (at the initiator) or the initiator itself (at a responder).
 */
export interface MmsPeerState {
  /** This peer's index in the round's responder list — the exchange it owns. At a responder it is
   * that responder's own index, because the peer there is the initiator. */
  responder: number
  /** The POLL that opens this exchange happened at this device: the initiator transmitted it, or
   * the responder received it. An initiator whose channel access failed never polled, and so has
   * no exchange to wait for a RESP of. */
  polled: boolean
  /**
   * This device knows there is a peer at the other end of the exchange. Only a primed peer's train
   * is closed out and turned into times.
   *
   * Config 2: the narrowband exchange — the initiator's RESP arrived, or the responder answered a
   * POLL. Config 1 with SP0: the same exchange on SP0 packets. Config 1 with no control phase:
   * acquiring the packet is the priming. Non-interleaved, the initiator transmits its packet
   * without waiting for a response and the responder answers after receiving it (15-25/0292r1,
   * 15-25/0331r1), so there hearing the POLL is what primes the responder. 4ab draft 15-25/0194r0
   */
  primed: boolean
  /** This device's own RMARKER for this exchange: the counter it stamped the first fragment of its
   * timing train at (the RSFs, or the RIFs when the train carries no RSF). */
  txRmarker: number | null
  /** The peer's fragments, per kind, in the order they arrived (which is index order). */
  frags: { rsf: TrainFragment[]; rif: TrainFragment[] }
  /** The trains already closed out, so a train is evaluated exactly once. */
  done: { rsf: boolean; rif: boolean }
  /** The peer's RMARKER as this device stamped it; null until that train is detected. */
  rxRmarker: number | null
  /** Whether that first path was obstructed — the range's figure of merit. */
  rxNlos: boolean
  /** The clock ratio the timing train measured, as this device's counter per the peer's; null
   * when fewer than two fragments were heard. */
  ratio: number | null
  /** The integrity train was detected (Y > 0 only): the flag a range carries. */
  rifDetected: boolean
  /**
   * The Predicted Reply Time of this exchange (resolution 15-25/0681r1): at the responder, the one
   * it sent in its RESP at Message Control 2 — which is what lets it skip its REPORT; at the
   * initiator, the one it received. Null when none was sent or received.
   */
  predictedReplyRctu: number | null
  /** Initiator: the transmitter offset its receiver read off that RESP — the carrier-offset
   * fallback when the responder's train was too thin to measure a ratio over. */
  respTxPpm: number | null
}

/**
 * What one device holds for one MMS round (P802.15.4ab). Null in every other mode.
 */
export interface MmsRoundState {
  /** The narrowband channel this block hops to; the network draws it and both ends are told.
   * **Null under Config 1**, which has no narrowband radio to hop. */
  nbChannel: number | null
  /** Responder, one-to-many over the narrowband radio: it heard the first sub-round's POLL at
   * Message Control 1 and found itself in its Responder Address List. A later sub-round's POLL is
   * Message Control 0 and names nobody, so without the list a responder cannot know that sub-round
   * is its own (15-25/0213r2, CID 474). */
  listed: boolean
  /** One entry per peer this device is ranging with, keyed by id. */
  peers: Map<string, MmsPeerState>
  /** The round's responders in slot order, as the schedule handed them over. Empty until the
   * first slot of the round runs. */
  responders: string[]
}

export function freshMms(_plan: MmsRoundPlan, nbChannel: number | null): MmsRoundState {
  return { nbChannel, listed: false, peers: new Map(), responders: [] }
}

/** This device's state for one peer, created on first use so that a round which never reaches a
 * peer carries no state about it. `responder` is the peer's slot index in the round. */
function peerState(m: MmsRoundState, mp: MmsRoundPlan, id: string, responder: number): MmsPeerState {
  const found = m.peers.get(id)
  if (found) return found
  const fresh: MmsPeerState = {
    responder, polled: false, primed: false, txRmarker: null,
    frags: { rsf: [], rif: [] },
    done: { rsf: mp.phy.rsfs === 0, rif: mp.phy.rifs === 0 },
    rxRmarker: null, rxNlos: false, ratio: null, rifDetected: false,
    predictedReplyRctu: null, respTxPpm: null,
  }
  m.peers.set(id, fresh)
  return fresh
}

/** Whether this round has a control exchange to be permitted by. With a zero-length control
 * phase there is nothing to wait for: the packet's own leading SYNC+SFD fragment is the poll and
 * the response. 4ab draft 15-25/0194r0 */
function controlPrimes(mp: MmsRoundPlan): boolean {
  return mp.layout.controlSlots > 0
}

/** The responders one of the initiator's transmissions in exchange `anchor` is for: that one
 * responder interleaved (each sub-round is a pair), every responder non-interleaved (the
 * initiator's sub-round and its train are shared). A pair round has one either way. */
function exchangeOf(mp: MmsRoundPlan, responders: string[], anchor: number): string[] {
  if (mp.phy.nonInterleaved) return responders
  const id = responders[anchor]
  return id === undefined ? [] : [id]
}

/**
 * Whether the initiator may put its packet on the air for `to` without having been answered.
 *
 * Interleaved with a control exchange: no — the RESP primes both ends before any fragment goes out.
 * Non-interleaved: yes, once its POLL went out — "the initiator transmits its MMS packet without
 * waiting for a response compact frame" (15-25/0292r1, restated in 15-25/0331r1); a POLL that never
 * went out (channel access failure) leaves no exchange to transmit into. Zero-length control
 * phase: yes — its leading SYNC+SFD fragment is the poll (15-25/0194r0). Responders never open.
 */
function opensRound(dev: UwbDevice, m: MmsRoundState, mp: MmsRoundPlan, to: string[]): boolean {
  if (dev.cfg.role !== 'tag') return false
  if (!controlPrimes(mp)) return true
  return mp.phy.nonInterleaved && to.some((id) => m.peers.get(id)?.polled === true)
}

/** Whether this round's control messages ride the UWB PHY as SP0 packets rather than the
 * narrowband radio. 4ab draft 15-25/0194r0 */
function sp0Control(mp: MmsRoundPlan): boolean {
  return mp.phy.control === 'uwbd'
}

/** The frame kind this round's control messages arrive as — what a listen window is armed for. */
function controlKind(mp: MmsRoundPlan, role: 'poll' | 'resp' | 'report'): UwbFrameKind {
  if (sp0Control(mp)) return 'uwbSp0'
  return role === 'poll' ? 'nbPoll' : role === 'resp' ? 'nbResp' : 'nbReport'
}

/** The round's fragment spacing in ranging counter units — `MmsRoundPlan.fragGapNs`, in the
 * units a counter difference is measured in. */
function fragGapRctu(mp: MmsRoundPlan): number {
  return (MS_RCTU * mp.fragGapNs) / MS_NS
}

/** Which of a train's two kinds carries the round's ranging time: the RSFs, or the RIFs when
 * the session's train has no RSF at all. 4ab draft 15-23/0100r2 §2.3.2 */
function timingKind(mp: MmsRoundPlan): 'uwbRsf' | 'uwbRif' {
  return mp.phy.rsfs > 0 ? 'uwbRsf' : 'uwbRif'
}

/**
 * One slot of an MMS round. The shape is `mmsLayout`'s and reaches the device through the round
 * plan, so neither end derives it twice.
 *
 * Two rules run through all of it. **Priming**: the control exchange is what tells a device
 * there is a peer to range with, and an unprimed pair neither transmits a fragment nor listens
 * for one — the draft's discontinuation rule. **Evaluation at the end of a train**: a train is
 * closed out in the slot after its last fragment, which is where every draw and every record of it
 * happens.
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
  const mine = isTag ? -1 : responders.indexOf(dev.id)
  if (!isTag && mine < 0) return
  closeDueTrains(dev, r, m, mp, peers, slot)
  const open = (id: string): boolean => !controlPrimes(mp) || m.peers.get(id)?.primed === true
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
      const anchor = ('anchor' in action ? action.anchor : undefined) ?? 0
      if (role === 'poll') {
        if (isTag) {
          txControlPoll(dev, r, m, mp, responders, anchor)
          return
        }
        // A responder listens for the POLL of its own exchange — and, one-to-many interleaved over
        // the narrowband radio, for the first sub-round's POLL as well, whose list is how it learns
        // which sub-round is its own.
        const own = mp.layout.pollFor(mine) === anchor
        const list = mp.oneToMany && !sp0Control(mp) && anchor === 0
        if (own || list) dev.listenFor(slot, peers.tag, kind, slot + win)
        return
      }
      const id = responders[anchor]
      if (id === undefined) return
      if (role === 'resp') {
        if (!isTag) {
          if (anchor === mine) txControlResp(dev, r, m, mp, peers.tag, slot, mine)
          return
        }
        // An exchange the initiator never opened has no RESP to wait for.
        if (m.peers.get(id)?.polled === true) dev.listenFor(slot, id, kind, slot + win)
        return
      }
      if (action.tx === 'tag') {
        if (isTag) txControlReport(dev, r, m, mp, id, slot)
        else if (anchor === mine && open(peers.tag)) dev.listenFor(slot, peers.tag, kind, slot + rwin)
        return
      }
      if (!isTag) {
        if (anchor === mine) txControlReport(dev, r, m, mp, peers.tag, slot)
        return
      }
      // A responder that sent its reply time as a Predicted Reply Time sends no REPORT
      // (15-25/0681r1), so its window is not waited on.
      if (open(id) && m.peers.get(id)?.predictedReplyRctu == null) dev.listenFor(slot, id, kind, slot + rwin)
      return
    }
    case 'uwbRsf':
    case 'uwbRif': {
      if (action.tx === 'tag') {
        if (isTag) {
          txOwnTrainFragment(dev, r, m, mp, exchangeOf(mp, responders, action.anchor), action.kind, action.index, slot)
          return
        }
        // Interleaved, the initiator's fragments in another responder's sub-round are not for this
        // one; non-interleaved, its one train is for everybody. A lost fragment is counted by the
        // train, not reported: `silent`.
        const forMe = mp.phy.nonInterleaved || action.anchor === mine
        if (forMe && open(peers.tag)) dev.listenFor(slot, peers.tag, action.kind, slot + 1, true)
        return
      }
      const id = responders[action.anchor]
      if (id === undefined) return
      if (!isTag) {
        if (action.anchor === mine) txOwnTrainFragment(dev, r, m, mp, [peers.tag], action.kind, action.index, slot)
        return
      }
      if (open(id)) dev.listenFor(slot, id, action.kind, slot + 1, true)
      return
    }
    default:
      // 'idle', and every 4z kind: no MMS round ever schedules one.
      return
  }
}

/** The record of one CSMA-CA event on the narrowband radio: a CCA that found the channel busy
 * (`retry`, or `fail` when NB has passed macMaxCsmaBackoffs), or an attempt abandoned because the
 * next backoff and CCA would leave no room for the frame inside its window (`noRoom`). */
function emitNbLbt(
  dev: UwbDevice, r: RoundState, channel: number, slot: number, nb: number, be: number, backoffNs: number,
  foreignDbm: number, outcome: 'retry' | 'fail' | 'noRoom',
): void {
  dev.emit({
    t: dev.now(), type: 'UWB_NB_LBT', node: dev.id, channel, foreignDbm, thresholdDbm: NB_LBT_THRESHOLD_DBM,
    block: r.block, round: r.round, slot, nb, be, backoffNs, outcome,
  })
}

/**
 * The channel access one narrowband transmission runs through, **per transmission slot**.
 *
 * 4ab draft §10.39.8.3, as rewritten by 15-25/0307r1 and 15-25/0427r4: where regulation requires
 * listen-before-talk (`nbLbtRequired`), the initiator and the responder each apply CSMA-CA (§6.3.2)
 * or SSBD (§10.45) independently in every transmission slot, even when two consecutive slots use
 * the same channel; where it does not, the same methods may be used for coexistence — which is what
 * a session with `ssbd` set does on any channel. 2026-11-11 (audit #19): a busy check used to
 * silence this device's narrowband radio for the rest of the block.
 *
 * `tx` is the transmission itself, deferred rather than returned as a verdict, because a backoff
 * and a CCA take time: the message goes out when channel access succeeds, inside its own window,
 * or not at all.
 */
function nbAccess(
  dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, bytes: number, slot: number,
  tx: () => void,
): void {
  // Config 1 has no narrowband radio, so there is no channel to sense. 4ab draft 15-25/0194r0
  if (m.nbChannel === null) {
    tx()
    return
  }
  const ssbd = mp.ssbd
  if (ssbd !== null) {
    ssbdAttempt(dev, r, ssbd, m.nbChannel, bytes, slot, 0, ssbd.minBf, 0, tx)
    return
  }
  if (!nbLbtRequired(m.nbChannel, mp.nbLbt)) {
    tx()
    return
  }
  csmaAttempt(dev, r, m.nbChannel, bytes, slot, 0, NB_CSMA.minBe, 0, tx)
}

/**
 * Unslotted CSMA-CA, standard §6.3.2.1 (Figure 6-2): delay random(2^BE − 1) unit backoff periods
 * (`NB_UNIT_BACKOFF_US`), perform a CCA (`NB_PHY_CCA_DURATION_US`, averaged — `ccaMeasure`); idle
 * → success and transmit; busy → NB + 1, BE = min(BE + 1, macMaxBe), and NB > macMaxCsmaBackoffs is
 * a channel access failure. PIB values `NB_CSMA`.
 *
 * `elapsedNs` is how far into its window this transmission already is. The window is the draft's
 * two-slot narrowband window: a backoff and CCA that would leave no room for the frame to end
 * inside it end the attempt (`noRoom`) — the standard does not say what a MAC does with a slot it
 * has run out of; giving up rather than transmitting into the next window is this simulator's
 * choice.
 */
function csmaAttempt(
  dev: UwbDevice, r: RoundState, channel: number, bytes: number, slot: number,
  nb: number, be: number, elapsedNs: number, tx: () => void,
): void {
  const units = dev.ssbdRng().int(2 ** be - 1)
  const backoffNs = units * NB_UNIT_BACKOFF_US * 1000
  const ccaNs = NB_PHY_CCA_DURATION_US * 1000
  if (elapsedNs + backoffNs + ccaNs > nbSlotSlackNs(r.plan.slotNs, bytes)) {
    emitNbLbt(dev, r, channel, slot, nb, be, backoffNs, NOTHING_HEARD_DBM, 'noRoom')
    return
  }
  const cca = (): void => {
    // The queue outlives a round, and a backoff armed in one must not sense in the next.
    if (dev.round !== r) return
    dev.ch.ccaMeasure(dev.id, channel, ccaNs, ({ busy, foreignDbm }) => {
      if (dev.round !== r) return
      if (!busy) {
        tx()
        return
      }
      const fail = nb + 1 > NB_CSMA.maxBackoffs
      emitNbLbt(dev, r, channel, slot, nb + 1, be, backoffNs, foreignDbm, fail ? 'fail' : 'retry')
      if (fail) return
      csmaAttempt(
        dev, r, channel, bytes, slot, nb + 1, Math.min(be + 1, NB_CSMA.maxBe), elapsedNs + backoffNs + ccaNs, tx,
      )
    })
  }
  if (backoffNs === 0) cca()
  else dev.at(dev.now() + backoffNs, cca)
}

/**
 * One CCA of standard §10.45 (a P802.15.4ab **draft** clause), and the wait drawn before it.
 *
 * `nb` is NB — how many times this attempt has already found the channel busy — and `bf` is BF,
 * the backoff factor that wait was drawn against. Both reset with every transmission slot.
 * `random(BF)` is `Rng.int(bf)`, uniform over 0…BF inclusive (CID 489/493).
 *
 * The CCA lasts phyCcaDuration (CID 490/495: SSBD reads the PHY's attribute; `NB_PHY_CCA_DURATION_US`)
 * and its reading is the foreign power averaged over it (`ccaMeasure`, audit #20). **The wait is
 * `min(draw, the room left in this window)`, and the clamp emits a record of its own** — a
 * simulator's choice kept from the SSBD slice; a window too short even for the CCA ends the attempt
 * (`noRoom`).
 */
function ssbdAttempt(
  dev: UwbDevice, r: RoundState, s: UwbSsbdCfg, channel: number,
  bytes: number, slot: number, nb: number, bf: number, waitedNs: number, tx: () => void,
): void {
  const drawnUnits = dev.ssbdRng().int(bf)
  const wantNs = drawnUnits * s.unitBackoffUs * 1000
  const ccaNs = NB_PHY_CCA_DURATION_US * 1000
  const say = (
    backoffNs: number, foreignDbm: number, outcome: 'idle' | 'txOnEnd' | 'failOnEnd' | 'clamped' | 'noRoom',
  ): void => {
    dev.emit({
      t: dev.now(), type: 'UWB_SSBD', node: dev.id, block: r.block, round: r.round, slot, channel,
      nb, bf, drawnUnits, backoffNs, foreignDbm, thresholdDbm: NB_LBT_THRESHOLD_DBM, outcome,
    })
  }
  const roomNs = nbSlotSlackNs(r.plan.slotNs, bytes) - waitedNs - ccaNs
  if (roomNs < 0) {
    say(0, NOTHING_HEARD_DBM, 'noRoom')
    return
  }
  const backoffNs = Math.min(wantNs, roomNs)
  const clamped = backoffNs < wantNs
  const cca = (): void => {
    if (dev.round !== r) return
    dev.ch.ccaMeasure(dev.id, channel, ccaNs, ({ busy, foreignDbm }) => {
      if (dev.round !== r) return
      if (!busy) {
        say(backoffNs, foreignDbm, clamped ? 'clamped' : 'idle')
        tx()
        return
      }
      // NB past its cap: TxOnEnd ends in Success and transmits anyway, FailOnEnd in Failure.
      if (nb >= s.maxBackoffs) {
        say(backoffNs, foreignDbm, s.txOnEnd ? 'txOnEnd' : 'failOnEnd')
        if (s.txOnEnd) tx()
        return
      }
      if (clamped) say(backoffNs, foreignDbm, 'clamped')
      ssbdAttempt(
        dev, r, s, channel, bytes, slot, nb + 1, Math.min(bf + 1, s.maxBf), waitedNs + backoffNs + ccaNs, tx,
      )
    })
  }
  if (backoffNs === 0) cca()
  else dev.at(dev.now() + backoffNs, cca)
}

/** Initiator, POLL window `poll`: open the exchange(s) it covers — one responder's sub-round
 * interleaved, every responder non-interleaved, the one responder of a pair round. */
function txControlPoll(
  dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, responders: string[], poll: number,
): void {
  const covered = exchangeOf(mp, responders, poll)
  if (covered.length === 0) return
  const first = poll === 0
  // The first one-to-many POLL names every responder (12 + 3N octets); every later sub-round's is
  // Message Control 0, twelve octets (15-25/0213r2, CID 474).
  const bytes = mp.oneToMany && first ? nbOtmPollBytes(responders.length) : NB_POLL_BYTES
  const slot = mp.layout.pollSlot(poll)
  nbAccess(dev, r, m, mp, bytes, slot, () => {
    covered.forEach((id) => { peerState(m, mp, id, responders.indexOf(id)).polled = true })
    if (sp0Control(mp)) {
      const dst = covered.length > 1 ? UWB_BROADCAST : covered[0]
      dev.send(makeSp0Poll(dev.id, dst, r.block, r.round, slot, mmsSp0TxDbm(mp.phy)), null)
      return
    }
    const nbChannel = m.nbChannel as number
    dev.send(
      mp.oneToMany
        ? makeNbPollOtm(dev.id, responders, nbChannel, r.block, r.round, slot, first)
        : makeNbPoll(dev.id, responders[0], nbChannel, r.block, r.round),
      null,
    )
  })
}

/**
 * Responder, its own RESP window: answer the POLL of its exchange. Interleaved, this is also the
 * moment either end is primed — the answer comes before any fragment. Non-interleaved the POLL
 * primed it already (`onMmsRx`), and the RESP follows the initiator's packet.
 *
 * With `predictedReplyTime` (non-interleaved only — the schema refuses it otherwise) the RESP is
 * Message Control 2 and carries the Predicted Reply Time: the interval, on this device's own
 * counter, from the RMARKER of the initiator's packet it received to the RMARKER of the packet it
 * is about to transmit — the first fragment of its timing train, at the slot the layout gives it.
 * Resolution 15-25/0681r1. With no RMARKER of the initiator's packet (its train was not detected)
 * there is nothing to predict, and the RESP goes out at Message Control 0.
 */
function txControlResp(
  dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, peer: string, slot: number, mine: number,
): void {
  const p = peerState(m, mp, peer, mine)
  if (!p.polled) return
  let predicted: number | undefined
  if (mp.phy.predictedReplyTime && p.rxRmarker !== null) {
    const kind = timingKind(mp) === 'uwbRsf' ? 'rsf' : 'rif'
    const txAt = slotStartNs(r.plan, r.block, r.round, mp.layout.fragmentSlot('responder', kind, 0, mine))
    predicted = counterDiff(dev.clock.counter(txAt), p.rxRmarker)
  }
  nbAccess(dev, r, m, mp, NB_RESP_BYTES, slot, () => {
    p.primed = true
    if (predicted !== undefined) p.predictedReplyRctu = predicted
    if (sp0Control(mp)) {
      dev.send(makeSp0Resp(dev.id, peer, r.block, r.round, slot, mmsSp0TxDbm(mp.phy), predicted), null)
      return
    }
    const nbChannel = m.nbChannel as number
    dev.send(makeNbResp(dev.id, peer, nbChannel, r.block, r.round, slot, mp.oneToMany, predicted), null)
  })
}

/**
 * One fragment of this device's own train, for the exchange(s) `to`. Only the first is stamped, and
 * its stamp is taken at the transmission instant itself with **no SHR offset**: an MMS fragment's
 * RMARKER is its first pulse.
 *
 * `to` is the one peer of a pair round, of an interleaved sub-round and of a responder, and every
 * responder for the non-interleaved one-to-many initiator — one train, broadcast.
 */
function txOwnTrainFragment(
  dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, to: string[],
  kind: 'uwbRsf' | 'uwbRif', index: number, slot: number,
): void {
  if (to.length === 0) return
  const primed = to.some((id) => m.peers.get(id)?.primed === true)
  if (!primed && !opensRound(dev, m, mp, to)) return
  const dst = to.length > 1 ? UWB_BROADCAST : to[0]
  const counter = dev.clock.counter(dev.now())
  const desc = kind === 'uwbRsf'
    ? makeRsf(dev.id, dst, index, mp.phy, r.block, r.round, slot)
    : makeRif(dev.id, dst, index, mp.phy, r.block, r.round, slot)
  if (index === 0 && kind === timingKind(mp)) {
    const isTag = dev.cfg.role === 'tag'
    for (const id of to) {
      const k = isTag ? m.responders.indexOf(id) : m.responders.indexOf(dev.id)
      peerState(m, mp, id, k).txRmarker = counter
    }
  }
  dev.send(desc, index === 0 ? counter : null)
}

/**
 * A measurement report, in the report window this device owns for this peer — a narrowband
 * message under Config 2 and an SP0 packet under Config 1. The responder sends the reply time it
 * turned the exchange around in and the initiator the round trip it measured (4ab draft
 * 15-22/0381r5 Table 1.6.3.1, REPORT 0x06/0x07 and one-to-many 0x12/0x13).
 *
 * A responder that already sent its reply time as a Predicted Reply Time has nothing left to report
 * — that is what Message Control 2 is for: "it may be used to avoid a separate report of the reply
 * time" (15-25/0681r1). A device whose own train or whose peer's train was never stamped has no
 * time to report; it stays silent.
 */
function txControlReport(
  dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, peer: string, slot: number,
): void {
  const p = m.peers.get(peer)
  if (!p || !p.primed || p.txRmarker === null || p.rxRmarker === null) return
  const isTag = dev.cfg.role === 'tag'
  if (!isTag && p.predictedReplyRctu !== null) return
  // The initiator transmits first, so it measured a round trip and the responder the reply.
  const times = isTag
    ? { roundTripRctu: counterDiff(p.rxRmarker, p.txRmarker) }
    : { replyRctu: counterDiff(p.txRmarker, p.rxRmarker) }
  nbAccess(dev, r, m, mp, NB_REPORT_BYTES, slot, () => {
    if (sp0Control(mp)) {
      dev.send(makeSp0Report(dev.id, peer, r.block, r.round, slot, times, mmsSp0TxDbm(mp.phy)), null)
      return
    }
    dev.send(
      makeNbReport(
        dev.id, peer, m.nbChannel as number, r.block, r.round, slot, times, mp.oneToMany,
        isTag ? 'initiator' : 'responder',
      ),
      null,
    )
  })
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
  // A responder's only peer is the initiator.
  if (!isTag && from !== r.tagId) return
  const index = isTag ? m.responders.indexOf(from) : m.responders.indexOf(dev.id)
  if (index < 0) return
  const frag = u.mms
  if (frag) {
    const p = peerState(m, mp, from, index)
    // With no control exchange, THIS is the priming: the packet's own leading SYNC+SFD fragment
    // is the poll and the response. 4ab draft 15-25/0194r0
    if (!controlPrimes(mp)) p.primed = true
    // The schedule fires a fragment on true time; a real transmitter cuts its train on its
    // own crystal, and that difference IS the clock ratio the train measures (model).
    const drift = info.txPpm * 1e-6
    p.frags[frag.kind].push({
      index: frag.index,
      arrivalNs: info.txStartNs + info.propNs - (frag.index * mp.fragGapNs * drift) / (1 + drift),
      nlosNs: info.nlosNs, nlos: info.nlos, rssiDbm: info.rssiDbm, foreignDbm: info.foreignDbm,
    })
    return
  }
  const role = controlRole(kind, u.sp0)
  switch (role) {
    case 'poll': {
      if (isTag) return
      // The first one-to-many POLL lists its responders: one that does not find itself there is
      // not in this round, and one that does now knows which sub-round is its own.
      if (u.nb?.responders) {
        if (!u.nb.responders.includes(dev.id)) return
        m.listed = true
      }
      // Is this the POLL of this responder's own exchange? A later sub-round's POLL names nobody,
      // so over the narrowband radio only the list says it is ours.
      if (u.slot !== mp.layout.pollSlot(mp.layout.pollFor(index))) return
      if (mp.oneToMany && !sp0Control(mp) && !m.listed) return
      const p = peerState(m, mp, from, index)
      p.polled = true
      // Non-interleaved, the POLL is also the priming: the initiator transmits its whole packet
      // without waiting for a response. 4ab draft 15-25/0292r1, 15-25/0331r1
      if (mp.phy.nonInterleaved) p.primed = true
      return
    }
    case 'resp': {
      if (!isTag) return
      // The initiator learns here, and only here, that this responder is in the exchange.
      const p = peerState(m, mp, from, index)
      p.primed = true
      const predicted = u.nb?.predictedReplyRctu ?? u.sp0?.predictedReplyRctu
      if (predicted !== undefined) {
        p.predictedReplyRctu = predicted
        p.respTxPpm = info.txPpm
      }
      return
    }
    case 'report':
      onControlReportRx(dev, r, m, mp, from, u, info)
      return
    default:
      return
  }
}

/** Which of the control plane's three messages a reception is, or null if it is not one of them.
 * Config 2's three frame kinds say it on their own; Config 1's one frame kind says it in its
 * content. 4ab draft 15-25/0194r0 */
function controlRole(kind: UwbFrameKind, sp0: UwbSp0Msg | undefined): 'poll' | 'resp' | 'report' | null {
  if (kind === 'uwbSp0') return sp0?.role ?? null
  if (kind === 'nbPoll') return 'poll'
  if (kind === 'nbResp') return 'resp'
  return kind === 'nbReport' ? 'report' : null
}

/** Close out every train whose last fragment was due in the slot just gone — one per primed
 * peer, in responder order. */
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
      evaluateTrain(dev, r, mp, p, id, kind, n)
    }
  }
}

/**
 * What one train came to, and the two timestamps taken from it — the heart of the mode.
 *
 * Detection is combining: the receiver was primed by the control exchange and accumulated
 * blind, so no single fragment had to be audible on its own, and `heard` of them at `rxDbm`
 * add up to `rxDbm + 10·log10(heard)`.
 *
 * Under Config 1 there is one question in front of that one: the packet's leading SYNC+SFD
 * fragment has to be acquired on its own (`acquired`). Fail it and the train counts as undetected
 * however loud it was.
 *
 * The draws, in the order the spec fixes them: the first heard fragment's stamp, then — only
 * when two or more were heard — the last heard fragment's. Nothing is drawn for a train that was
 * not detected.
 */
function evaluateTrain(
  dev: UwbDevice, r: RoundState, mp: MmsRoundPlan, p: MmsPeerState,
  peer: string, kind: 'rsf' | 'rif', fragments: number,
): void {
  const m = r.mms as MmsRoundState
  const frags = p.frags[kind]
  const heard = frags.length
  const rxDbm = heard > 0 ? frags[0].rssiDbm : NOTHING_HEARD_DBM
  const gainDb = combineGainDb(heard)
  const marginDb = heard > 0 ? rxDbm + gainDb - UWB_RX_SENS_DBM : NOTHING_HEARD_DBM
  // One SYNC+SFD opens the whole packet, so acquisition is judged once — on the train that leads
  // the packet — and when the leading fragment did not arrive it is handed over as the inaudible
  // thing it was, rather than letting fragment 1 slide into its place.
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
    const sigmaNs = tsSigmaNs(dev.cfg.tsNoisePs, uwbSinrDb(rxDbm + gainDb, first.foreignDbm))
    const firstExtraNs = first.nlosNs + gaussian(dev.rng) * sigmaNs
    const firstCounter = dev.clock.counter(first.arrivalNs, firstExtraNs)
    fom = fomFor(first.nlos)
    if (heard >= 2) {
      const last = frags[heard - 1]
      const lastExtraNs = last.nlosNs + gaussian(dev.rng) * sigmaNs
      const spanRctu = counterDiff(dev.clock.counter(last.arrivalNs, lastExtraNs), firstCounter)
      ratio = spanRctu / ((last.index - first.index) * fragGapRctu(mp))
    }
    rmarker = rmarkerFromFragment(firstCounter, first.index, ratio, fragGapRctu(mp))
  }
  dev.emit({
    t: dev.now(), type: 'UWB_MMS_TRAIN', node: dev.id, peer, kind,
    fragments, heard, rxDbm, gainDb, marginDb, detected,
    ratioPpm: ratio === null ? null : (ratio - 1) * 1e6,
    block: r.block, round: r.round,
    ...(mp.oneToMany ? { responders: [...m.responders] } : {}),
  })
  if (detected && rmarker !== null) {
    dev.emit({
      t: dev.now(), type: 'UWB_TS', node: dev.id, dir: 'rx', peer, frameKind, counter: rmarker, fom,
    })
  }
  if (kind === 'rif') p.rifDetected = detected
  if (frameKind !== timingKind(mp) || !detected || rmarker === null) return
  p.rxRmarker = rmarker
  p.rxNlos = frags[0].nlos
  p.ratio = ratio
  // The initiator that holds a Predicted Reply Time has both halves the moment it has timed the
  // responder's train: no report is on its way. 15-25/0681r1
  if (dev.cfg.role === 'tag' && p.predictedReplyRctu !== null && p.txRmarker !== null) {
    rangeFromTimes(dev, r, mp, p, peer, counterDiff(p.rxRmarker, p.txRmarker), p.predictedReplyRctu, p.respTxPpm ?? 0)
  }
}

/**
 * The single-sided range from a round trip and a reply time, with the clock correction of SS-TWR:
 * the replying end's rate against the end that measured the round trip. A train hands the ratio
 * over directly — this device's counter per the peer's — so the initiator (round trip) inverts it
 * and the responder (reply) uses it as it stands. Without a train ratio the device falls back on
 * the carrier-frequency offset its receiver estimated (`peerTxPpm`), with the estimator's residual
 * drawn here, once.
 */
function rangeFromTimes(
  dev: UwbDevice, r: RoundState, mp: MmsRoundPlan, p: MmsPeerState, peer: string,
  roundTripRctu: number, replyRctu: number, peerTxPpm: number,
): void {
  const initiator = dev.cfg.role === 'tag'
  let coffs: number
  if (p.ratio !== null) {
    coffs = initiator ? 1 / p.ratio - 1 : p.ratio - 1
  } else {
    const replyPpm = initiator ? peerTxPpm : dev.clock.ppm
    const roundTripPpm = initiator ? dev.clock.ppm : peerTxPpm
    coffs = (replyPpm - roundTripPpm) * 1e-6 + gaussian(dev.rng) * dev.cfg.cfoNoisePpm * 1e-6
  }
  reportRange(
    dev, r, peer, 'ss',
    ssTwrCorrected(roundTripRctu, replyRctu, coffs),
    ssTwrRaw(roundTripRctu, replyRctu),
    fomFor(p.rxNlos),
    mp.phy.rifs > 0 ? p.rifDetected : undefined,
  )
}

/** The peer's half of the exchange has arrived in a REPORT: this device now holds a round trip
 * and a reply time, and turns them into a range. */
function onControlReportRx(
  dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, from: string, u: UwbInfo,
  info: UwbRxInfo,
): void {
  const msg = u.nb ?? u.sp0
  const p = m.peers.get(from)
  if (!msg || !p || p.txRmarker === null || p.rxRmarker === null) return
  const initiator = dev.cfg.role === 'tag'
  const own = initiator ? counterDiff(p.rxRmarker, p.txRmarker) : counterDiff(p.txRmarker, p.rxRmarker)
  const roundTripRctu = initiator ? own : msg.roundTripRctu
  const replyRctu = initiator ? msg.replyRctu : own
  if (roundTripRctu === undefined || replyRctu === undefined) return
  rangeFromTimes(dev, r, mp, p, from, roundTripRctu, replyRctu, info.txPpm)
}

/**
 * Tag, MMS: the block's fix. A pair round holds one anchor, so three ranges are three rounds —
 * which is why this is the one mode whose fix is not a round's but a block's, and why it is
 * solved at the block's last pair round. A one-to-many round holds every anchor at once, so its
 * ranges are all in by the end of the round and the fix is solved there.
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
