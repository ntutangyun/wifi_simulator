/**
 * P802.15.4ab narrowband-assisted multi-millisecond (MMS) ranging for `UwbDevice`: the narrowband
 * control exchange, the RSF/RIF fragment trains and their combining detector, and the block fix
 * they feed. Split out of device.ts (pure move); every function here takes the device as its
 * first argument.
 *
 * A round has one initiator and R responders. R = 1 is the pairwise cycle — one tag, one anchor,
 * one round per pair in a block — and R = N is the draft's **one-to-many** round, where the
 * initiator polls every anchor of the session at once, its train goes out once and is heard by
 * all of them, and each responder answers in narrowband and ranging slots of its own (4ab draft
 * 15-22/0381r5 Table 1.6.3.1, messages 0x10/0x11/0x12/0x13; the slot interleave itself is this
 * engine's — see `mmsLayout`). Everything below is written for R responders and takes the
 * pairwise path as the R = 1 case, which is what keeps a pair round byte-identical.
 */
import type { FrameDesc } from '../model/frames'
import type { UwbRxInfo } from './channel'
import { counterDiff, gaussian } from './clock'
import {
  makeNbPoll, makeNbPollOtm, makeNbReport, makeNbResp, makeRif, makeRsf,
  UWB_BROADCAST, type UwbFrameKind, type UwbInfo,
} from './frames'
import { combineGainDb, MS_NS, MS_RCTU, rmarkerFromFragment, trainDetected } from './mms'

import { NB_LBT_THRESHOLD_DBM, nbLbtRequired } from './nb'
import { tsSigmaNs, UWB_RX_SENS_DBM, uwbSinrDb } from './phy'
import { rangeSigmaM, solvePosition } from './position'
import { fomFor, ssTwrCorrected, ssTwrRaw } from './ranging'
import { NOTHING_HEARD_DBM } from './records'
import type { MmsRoundPlan, SlotAction } from './session'
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
  /** Initiator: this responder's RESP arrived. Responder: it answered the POLL. Only a primed
   * peer transmits fragments to, or listens for fragments from, the other end. */
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
 * The round has two halves and a device may reach neither: the narrowband control exchange
 * *primes* it (the initiator when its POLL is answered, the responder when it answers one), and
 * only a primed device transmits fragments or listens for them.
 */
export interface MmsRoundState {
  /** The narrowband channel this block hops to; the network draws it and both ends are told. */
  nbChannel: number
  /** The round's POLL happened at this device: the initiator transmitted one, or the responder
   * received one. An initiator whose listen-before-talk check was busy never polled, and so has
   * no cycle to wait for a RESP of — the draft's discontinuation, on the initiator's side. */
  polled: boolean
  /** This device's own RMARKER: the counter it stamped its first fragment of the *timing* train
   * at (the RSFs, or the RIFs when the train carries no RSF). One train per round, whether it
   * goes to one responder or to all of them — which is the point of the one-to-many round. */
  txRmarker: number | null
  /** One entry per peer this device is ranging with, keyed by id. */
  peers: Map<string, MmsPeerState>
  /** The round's responders in slot order, as the schedule handed them over. Empty until the
   * first slot of the round runs. */
  responders: string[]
}

export function freshMms(_plan: MmsRoundPlan, nbChannel: number): MmsRoundState {
  return { nbChannel, polled: false, txRmarker: null, peers: new Map(), responders: [] }
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
 * cost the whole cycle rather than one message. **Evaluation at the end of a train**: a fragment
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
  switch (action.kind) {
    case 'nbPoll':
      if (isTag) txNbPoll(dev, r, m, mp, responders)
      // The responder's window is two slots long, so its wait is too.
      else dev.listenFor(slot, peers.tag, 'nbPoll', slot + 2)
      return
    case 'nbResp': {
      const id = responders[action.anchor]
      if (id === undefined) return
      if (!isTag) {
        if (action.anchor === mine) txNbResp(dev, r, m, mp, peers.tag, slot, mine)
        return
      }
      if (m.polled) dev.listenFor(slot, id, 'nbResp', slot + 2)
      return
    }
    case 'uwbRsf':
    case 'uwbRif': {
      if (action.tx === 'tag') {
        if (isTag) txOwnTrainFragment(dev, r, m, mp, responders, action.kind, action.index, slot)
        // A lost fragment is counted by the train, not reported: `silent`.
        else if (m.peers.get(peers.tag)?.primed) dev.listenFor(slot, peers.tag, action.kind, slot + 1, true)
        return
      }
      const id = responders[action.anchor]
      if (id === undefined) return
      if (!isTag) {
        if (action.anchor === mine) txOwnTrainFragment(dev, r, m, mp, [peers.tag], action.kind, action.index, slot)
        return
      }
      if (m.peers.get(id)?.primed) dev.listenFor(slot, id, action.kind, slot + 1, true)
      return
    }
    case 'nbReport': {
      const id = responders[action.anchor]
      if (id === undefined) return
      if (action.tx === 'tag') {
        // The initiator's answer to responder `action.anchor`, in that responder's own window.
        if (isTag) txNbReport(dev, r, m, mp, id, slot)
        else if (action.anchor === mine && m.peers.get(peers.tag)?.primed) {
          dev.listenFor(slot, peers.tag, 'nbReport', slot + 2)
        }
        return
      }
      if (!isTag) {
        if (action.anchor === mine) txNbReport(dev, r, m, mp, peers.tag, slot)
        return
      }
      if (m.peers.get(id)?.primed) dev.listenFor(slot, id, 'nbReport', slot + 2)
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

/** Initiator, slot 0: open the cycle. A pair round polls its one responder by name; a
 * one-to-many round broadcasts one POLL that lists every responder it is for. */
function txNbPoll(
  dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, responders: string[],
): void {
  if (!nbClear(dev, r, m, mp)) return
  m.polled = true
  dev.send(
    mp.oneToMany
      ? makeNbPollOtm(dev.id, responders, m.nbChannel, r.block, r.round)
      : makeNbPoll(dev.id, responders[0], m.nbChannel, r.block, r.round),
    null,
  )
}

/** Responder, its own RESP window: answer a POLL it heard — and only then is either end primed. */
function txNbResp(
  dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, peer: string, slot: number, mine: number,
): void {
  if (!m.polled) return
  if (!nbClear(dev, r, m, mp)) return
  peerState(m, mp, peer, mine).primed = true
  dev.send(
    mp.oneToMany
      ? makeNbResp(dev.id, peer, m.nbChannel, r.block, r.round, slot, true)
      : makeNbResp(dev.id, peer, m.nbChannel, r.block, r.round),
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
  if (!anyPrimed(m)) return
  const dst = mp.oneToMany && dev.cfg.role === 'tag' ? UWB_BROADCAST : to[0]
  if (dst === undefined) return
  const counter = dev.clock.counter(dev.now())
  const desc = kind === 'uwbRsf'
    ? makeRsf(dev.id, dst, index, mp.phy, r.block, r.round, slot)
    : makeRif(dev.id, dst, index, mp.phy, r.block, r.round, slot)
  if (index === 0 && kind === timingKind(mp)) m.txRmarker = counter
  dev.send(desc, index === 0 ? counter : null)
}

/**
 * A narrowband measurement report, in the report window this device owns for this peer. The
 * responder sends the reply time it turned the round around in and the initiator the round trip
 * it measured — the two halves of one single-sided exchange, carried on the control radio
 * because the UWB side of an MMS cycle transmits nothing but fragments. A one-to-many round
 * gives every responder a pair of windows of its own, so the initiator answers each of them
 * separately and no message ever has to carry more than the one time its sender measured (4ab
 * draft 15-22/0381r5 Table 1.6.3.1, REPORT 0x12 / 0x13).
 *
 * A device whose own train of this peer was never detected has no RMARKER of it and so no time
 * to report; it stays silent, and the other end's wait reports the gap.
 */
function txNbReport(
  dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, peer: string, slot: number,
): void {
  const p = m.peers.get(peer)
  if (m.txRmarker === null || !p || !p.primed || p.rxRmarker === null) return
  if (!nbClear(dev, r, m, mp)) return
  const times = dev.cfg.role === 'tag'
    ? { roundTripRctu: counterDiff(p.rxRmarker, m.txRmarker) }
    : { replyRctu: counterDiff(m.txRmarker, p.rxRmarker) }
  dev.send(makeNbReport(dev.id, peer, m.nbChannel, r.block, r.round, slot, times, mp.oneToMany), null)
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
  // The peer's index in the round: a responder's own when this device is the initiator, and
  // this device's own when the peer is the initiator.
  const index = isTag ? m.responders.indexOf(from) : m.responders.indexOf(dev.id)
  if (index < 0) return
  const frag = u.mms
  if (frag) {
    // The schedule fires a fragment on true time; a real transmitter cuts its train on its
    // own crystal, and that difference IS the clock ratio the train measures. Re-space the
    // arrival by the transmitter's ppm here — at most 300 ns over the longest train (model).
    const drift = info.txPpm * 1e-6
    peerState(m, mp, from, index).frags[frag.kind].push({
      index: frag.index,
      arrivalNs: info.txStartNs + info.propNs - (frag.index * mp.fragGapNs * drift) / (1 + drift),
      nlosNs: info.nlosNs, nlos: info.nlos, rssiDbm: info.rssiDbm, foreignDbm: info.foreignDbm,
    })
    return
  }
  switch (kind) {
    case 'nbPoll':
      // A one-to-many POLL is a broadcast: it opens the round only for the responders it names.
      if (u.nb?.responders && !u.nb.responders.includes(dev.id)) return
      m.polled = true
      return
    case 'nbResp':
      // The initiator learns here, and only here, that this responder is in the round.
      peerState(m, mp, from, index).primed = true
      return
    case 'nbReport':
      onNbReport(dev, r, m, mp, from, u, info)
      return
    default:
      return
  }
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
  const detected = heard > 0 && trainDetected(rxDbm, heard)
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
      // The fragments are a millisecond apart on the transmitter's clock, so the span this
      // receiver measured over them is its own counter per the peer's — a ruler milliseconds
      // long, where the narrowband carrier offers only its own residual.
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
function onNbReport(
  dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, from: string, u: UwbInfo,
  info: UwbRxInfo,
): void {
  const nb = u.nb
  const p = m.peers.get(from)
  if (!nb || !p || m.txRmarker === null || p.rxRmarker === null) return
  const isTag = dev.cfg.role === 'tag'
  const own = isTag ? counterDiff(p.rxRmarker, m.txRmarker) : counterDiff(m.txRmarker, p.rxRmarker)
  const roundTripRctu = isTag ? own : nb.roundTripRctu
  const replyRctu = isTag ? nb.replyRctu : own
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
