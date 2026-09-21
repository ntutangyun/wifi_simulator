/**
 * P802.15.4ab narrowband-assisted multi-millisecond (MMS) ranging for `UwbDevice`: the narrowband
 * control exchange, the RSF/RIF fragment trains and their combining detector, and the block fix
 * they feed. Split out of device.ts (pure move); every function here takes the device as its
 * first argument.
 */
import type { FrameDesc } from '../model/frames'
import type { UwbRxInfo } from './channel'
import { counterDiff, gaussian } from './clock'
import { makeNbPoll, makeNbReport, makeNbResp, makeRif, makeRsf, type UwbFrameKind, type UwbInfo } from './frames'
import { combineGainDb, MS_NS, MS_RCTU, rmarkerFromFragment, trainDetected } from './mms'
import { NB_LBT_THRESHOLD_DBM, nbLbtRequired } from './nb'
import { UWB_RX_SENS_DBM } from './phy'
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
}

/**
 * What one device holds for one pairwise MMS round (P802.15.4ab). Null in every other mode.
 *
 * The round has two halves and a device may reach neither: the narrowband control exchange
 * *primes* it (the initiator when its POLL is answered, the responder when it answers one), and
 * only a primed device transmits fragments or listens for them.
 */
export interface MmsRoundState {
  /** The narrowband channel this block hops to; the network draws it and both ends are told. */
  nbChannel: number
  /** Initiator: its POLL was answered. Responder: it answered a POLL. */
  primed: boolean
  /** The round's POLL happened at this device: the initiator transmitted one, or the responder
   * received one. An initiator whose listen-before-talk check was busy never polled, and so has
   * no cycle to wait for a RESP of — the draft's discontinuation, on the initiator's side. */
  polled: boolean
  /** The peer's fragments, per kind, in the order they arrived (which is index order). */
  frags: { rsf: TrainFragment[]; rif: TrainFragment[] }
  /** The trains already closed out, so a train is evaluated exactly once. */
  done: { rsf: boolean; rif: boolean }
  /** This device's own RMARKER: the counter it stamped its first fragment of the *timing* train
   * at (the RSFs, or the RIFs when the train carries no RSF). */
  txRmarker: number | null
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

export function freshMms(plan: MmsRoundPlan, nbChannel: number): MmsRoundState {
  return {
    nbChannel, primed: false, polled: false,
    frags: { rsf: [], rif: [] },
    done: { rsf: plan.phy.rsfs === 0, rif: plan.phy.rifs === 0 },
    txRmarker: null, rxRmarker: null, rxNlos: false, ratio: null, rifDetected: false,
  }
}

/** Which of a train's two kinds carries the round's ranging time: the RSFs, or the RIFs when
 * the session's train has no RSF at all. The other kind is logged and, for the RIFs, decides the
 * integrity flag — but no time is taken from it. 4ab draft 15-23/0100r2 §2.3.2 */
function timingKind(mp: MmsRoundPlan): 'uwbRsf' | 'uwbRif' {
  return mp.phy.rsfs > 0 ? 'uwbRsf' : 'uwbRif'
}

/**
 * One slot of a pairwise MMS round. The shape is `mmsLayout`'s and reaches the device through
 * the round plan, so neither end derives it twice: control (narrowband POLL, then RESP), the
 * ranging phase (both trains, interleaved a slot apart inside each millisecond), and the two
 * narrowband report windows.
 *
 * Two rules run through all of it. **Priming**: the control exchange is what tells a device
 * there is a peer to range with, and an unprimed device neither transmits a fragment nor
 * listens for one — the draft's discontinuation rule, and what makes a busy listen-before-talk
 * check cost the whole cycle rather than one message. **Evaluation at the end of a train**:
 * a fragment is never stamped on arrival (see `onMmsRx`); the train is closed out in the slot
 * after its last fragment, which is where every draw and every record of it happens.
 */
export function onMmsSlot(
  dev: UwbDevice, slot: number, action: SlotAction, r: RoundState, peers: { tag: string; anchors: string[] },
): void {
  const m = r.mms
  const mp = r.plan.mms
  if (!m || !mp) return
  const isTag = dev.cfg.role === 'tag'
  const peer = isTag ? peers.anchors[0] : peers.tag
  if (peer === undefined || peer === '') return
  closeDueTrains(dev, r, m, mp, peer, slot)
  switch (action.kind) {
    case 'nbPoll':
      if (isTag) txNbPoll(dev, r, m, mp, peer)
      // The responder's window is two slots long, so its wait is too.
      else dev.listenFor(slot, peer, 'nbPoll', slot + 2)
      return
    case 'nbResp':
      if (!isTag) txNbResp(dev, r, m, mp, peer)
      else if (m.polled) dev.listenFor(slot, peer, 'nbResp', slot + 2)
      return
    case 'uwbRsf':
    case 'uwbRif': {
      if (action.tx === (isTag ? 'tag' : 'anchor')) {
        txFragment(dev, r, m, mp, peer, action.kind, action.index, slot)
      } else if (m.primed) {
        // A lost fragment is counted by the train, not reported: `silent`.
        dev.listenFor(slot, peer, action.kind, slot + 1, true)
      }
      return
    }
    case 'nbReport':
      if (action.tx === (isTag ? 'tag' : 'anchor')) txNbReport(dev, r, m, mp, peer, slot)
      else if (m.primed) dev.listenFor(slot, peer, 'nbReport', slot + 2)
      return
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

/** Initiator, slot 0: open the cycle. */
function txNbPoll(dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, peer: string): void {
  if (!nbClear(dev, r, m, mp)) return
  m.polled = true
  dev.send(makeNbPoll(dev.id, peer, m.nbChannel, r.block, r.round), null)
}

/** Responder, slot 2: answer a POLL it heard — and only then is either end primed. */
function txNbResp(dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, peer: string): void {
  if (!m.polled) return
  if (!nbClear(dev, r, m, mp)) return
  m.primed = true
  dev.send(makeNbResp(dev.id, peer, m.nbChannel, r.block, r.round), null)
}

/**
 * One fragment of this device's own train. Only the first of each kind is stamped, and its
 * stamp is taken at the transmission instant itself with **no SHR offset**: an MMS fragment's
 * RMARKER is its first pulse, not a marker 73 µs into a preamble it does not have.
 */
function txFragment(
  dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, peer: string,
  kind: 'uwbRsf' | 'uwbRif', index: number, slot: number,
): void {
  if (!m.primed) return
  const counter = dev.clock.counter(dev.now())
  const desc = kind === 'uwbRsf'
    ? makeRsf(dev.id, peer, index, mp.phy, r.block, r.round, slot)
    : makeRif(dev.id, peer, index, mp.phy, r.block, r.round, slot)
  if (index === 0 && kind === timingKind(mp)) m.txRmarker = counter
  dev.send(desc, index === 0 ? counter : null)
}

/**
 * A narrowband measurement report, in the report window this device owns. The responder sends
 * the reply time it turned the round around in and the initiator the round trip it measured —
 * the two halves of one single-sided exchange, carried on the control radio because the UWB
 * side of an MMS cycle transmits nothing but fragments.
 *
 * A device whose own train of the peer was never detected has no RMARKER of it and so no time
 * to report; it stays silent, and the other end's wait reports the gap.
 */
function txNbReport(
  dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, peer: string, slot: number,
): void {
  if (!m.primed || m.txRmarker === null || m.rxRmarker === null) return
  if (!nbClear(dev, r, m, mp)) return
  const times = dev.cfg.role === 'tag'
    ? { roundTripRctu: counterDiff(m.rxRmarker, m.txRmarker) }
    : { replyRctu: counterDiff(m.txRmarker, m.rxRmarker) }
  dev.send(makeNbReport(dev.id, peer, m.nbChannel, r.block, r.round, slot, times), null)
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
  dev.clearExpectation()
  dev.setState('idle')
  const u = frame.uwb
  if (!m || !u) return
  const frag = u.mms
  if (frag) {
    // The schedule fires a fragment on true time; a real transmitter cuts its train on its
    // own crystal, and that difference IS the clock ratio the train measures. Re-space the
    // arrival by the transmitter's ppm here — at most 300 ns over the longest train (model).
    const drift = info.txPpm * 1e-6
    m.frags[frag.kind].push({
      index: frag.index,
      arrivalNs: info.txStartNs + info.propNs - (frag.index * MS_NS * drift) / (1 + drift),
      nlosNs: info.nlosNs, nlos: info.nlos, rssiDbm: info.rssiDbm,
    })
    return
  }
  switch (kind) {
    case 'nbPoll':
      m.polled = true
      return
    case 'nbResp':
      // The initiator learns here, and only here, that it has a peer this round.
      m.primed = true
      return
    case 'nbReport':
      onNbReport(dev, r, m, from, u, info)
      return
    default:
      return
  }
}

/** Close out every train of the peer whose last fragment was due in the slot just gone. */
function closeDueTrains(
  dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, peer: string, slot: number,
): void {
  if (!m.primed) return
  const peerSide = dev.cfg.role === 'tag' ? 'responder' : 'initiator'
  for (const kind of ['rsf', 'rif'] as const) {
    if (m.done[kind]) continue
    const n = kind === 'rsf' ? mp.phy.rsfs : mp.phy.rifs
    if (slot !== mp.layout.fragmentSlot(peerSide, kind, n - 1) + 1) continue
    m.done[kind] = true
    evaluateTrain(dev, r, m, mp, peer, kind, n)
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
  dev: UwbDevice, r: RoundState, m: MmsRoundState, mp: MmsRoundPlan, peer: string, kind: 'rsf' | 'rif', fragments: number,
): void {
  const frags = m.frags[kind]
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
    const sigmaNs = dev.cfg.tsNoisePs / 1000
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
      ratio = spanRctu / ((last.index - first.index) * MS_RCTU)
    }
    // …and that same ruler is what the walk-back to the RMARKER is measured with when the
    // leading fragments were lost. With fragment 0 in hand this is `firstCounter` itself, so
    // a train that arrived whole is stamped exactly as before.
    rmarker = rmarkerFromFragment(firstCounter, first.index, ratio)
  }
  dev.emit({
    t: dev.now(), type: 'UWB_MMS_TRAIN', node: dev.id, peer, kind,
    fragments, heard, rxDbm, gainDb, marginDb, detected,
    ratioPpm: ratio === null ? null : (ratio - 1) * 1e6,
    block: r.block, round: r.round,
  })
  if (detected && rmarker !== null) {
    dev.emit({
      t: dev.now(), type: 'UWB_TS', node: dev.id, dir: 'rx', peer, frameKind, counter: rmarker, fom,
    })
  }
  // Only one of the two trains carries this round's time. An integrity train is evaluated and
  // logged like any other — it is the flag the range carries — but no time is taken from it,
  // unless it is all the train has (X = 0).
  if (kind === 'rif') m.rifDetected = detected
  if (frameKind !== timingKind(mp) || !detected || rmarker === null) return
  m.rxRmarker = rmarker
  m.rxNlos = frags[0].nlos
  m.ratio = ratio
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
  dev: UwbDevice, r: RoundState, m: MmsRoundState, from: string, u: UwbInfo, info: UwbRxInfo,
): void {
  const mp = r.plan.mms
  const nb = u.nb
  if (!mp || !nb || m.txRmarker === null || m.rxRmarker === null) return
  const isTag = dev.cfg.role === 'tag'
  const own = isTag ? counterDiff(m.rxRmarker, m.txRmarker) : counterDiff(m.txRmarker, m.rxRmarker)
  const roundTripRctu = isTag ? own : nb.roundTripRctu
  const replyRctu = isTag ? nb.replyRctu : own
  if (roundTripRctu === undefined || replyRctu === undefined) return
  let coffs: number
  if (m.ratio !== null) {
    coffs = isTag ? 1 / m.ratio - 1 : m.ratio - 1
  } else {
    const responderPpm = isTag ? info.txPpm : dev.clock.ppm
    const initiatorPpm = isTag ? dev.clock.ppm : info.txPpm
    coffs = (responderPpm - initiatorPpm) * 1e-6 + gaussian(dev.rng) * dev.cfg.cfoNoisePpm * 1e-6
  }
  reportRange(
    dev, r, from, 'ss',
    ssTwrCorrected(roundTripRctu, replyRctu, coffs),
    ssTwrRaw(roundTripRctu, replyRctu),
    fomFor(m.rxNlos),
    mp.phy.rifs > 0 ? m.rifDetected : undefined,
  )
}

/**
 * Tag, MMS: the block's fix, solved at the end of its last pair round. A round holds one
 * anchor, so three ranges are three rounds — which is why this is the one mode whose fix is
 * not a round's but a block's. An MMS range is a two-way range like any other, so the record
 * says `method: 'twr'`; what made it is on the round's own `UWB_ROUND.mode`.
 */
export function solveMmsFix(dev: UwbDevice, r: RoundState): void {
  const anchors = r.anchors.length
  // Round t·A + k belongs to anchor k, so the block's last pair round for this tag is k = A−1.
  if (anchors === 0 || r.round % anchors !== anchors - 1) return
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
