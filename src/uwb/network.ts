/**
 * The UWB ranging engine: one medium, one device per UWB node, and the clock
 * that walks the session schedule.
 *
 * It is the UWB counterpart of the Wi-Fi link wiring in engine/simulation.ts,
 * and deliberately much smaller, because a ranging session has no medium to
 * arbitrate: the block/round/slot grid (src/uwb/session.ts) says who transmits
 * when, for the whole session, before it starts. All this class does is turn
 * that grid into events and hand each slot to its participants. A contention
 * session changes nothing here — the grid reserves a response window, and the
 * anchors, not the network, decide which slot of it each of them answers in.
 *
 * Tag k owns round k of every block. Anchors serve every round. An MMS round is pairwise by
 * default — tag t and anchor k own round t·A + k, and no other device is in it — so a block
 * holds one round per pair; with `mms.oneToMany` the tag's round holds every anchor at once and
 * a block is back to one round per tag. DL-TDoA turns that around: the
 * anchors own the one round a block holds, and every tag in the scenario listens to it. UL-TDoA
 * keeps the round-per-tag grid but empties the round out to a single slot: the tag blinks in it,
 * every anchor listens, and the infrastructure does the arithmetic afterwards.
 */
import type { EventQueue } from '../engine/events'
import { hashStr } from '../engine/hash'
import type { Rng } from '../engine/rng'
import type { ScattererCfg } from '../engine/scatter'
import type { Spectrum } from '../engine/spectrum'
import type { EmitFn } from '../model/records'
import type { NodeCfg, UwbSessionCfg, Wall } from '../model/scenario'
import type { Ns } from '../model/types'
import { UwbChannel } from './channel'
import { gaussian, UwbClock } from './clock'
import { UwbDevice, type UwbGeometry } from './device'
import { nbChannelForBlock } from './nb'
import { uwbMaxAnchors, uwbNbSlotFitNs, uwbSlotFitNs } from './phy'
import { UwbSensor } from './sensing'
import { roundPlan, slotAction, slotStartNs, type RoundPlan } from './session'

export class UwbNetwork {
  readonly devices = new Map<string, UwbDevice>()
  readonly plan: RoundPlan
  readonly channel: UwbChannel

  constructor(
    q: EventQueue,
    now: () => Ns,
    nodes: NodeCfg[],
    walls: Wall[],
    cfg: UwbSessionCfg,
    root: Rng,
    emit: EmitFn,
    /** The cross-technology mediator, when the scenario's 6 GHz Wi-Fi link shares this
     * session's band; null (the default) leaves the ranging session exactly as it was. */
    spectrum: Spectrum | null = null,
    /** The scenario's seed, which the narrowband channel plan hops over the block index
     * (`nbChannelForBlock`). Only `mode: 'mms'` reads it; 0 is a harmless default for the
     * callers and tests that build a network without one. */
    private readonly seed: number = 0,
    /** The scenario's reflecting objects, when it has the section at all (`Scenario.scatterers`).
     * `undefined` — the default, and what every scenario written before the section parses to —
     * means the medium computes no echoes, so every such session ranges bit-for-bit as before. */
    scatterers?: ScattererCfg[],
  ) {
    const anchors = nodes.filter((n) => n.uwb?.role === 'anchor').map((n) => n.id)
    const tags = nodes.filter((n) => n.uwb?.role === 'tag').map((n) => n.id)
    this.plan = roundPlan(cfg, anchors.length)
    // DL-TDoA runs one anchor round per block and every tag listens to it, so a block holds any
    // number of tags — the rule below is a two-way-ranging (and UL-TDoA) rule, and the schema
    // skips it in this mode for the same reason.
    const listenOnly = this.plan.mode === 'dl-tdoa'
    // A pairwise MMS round holds one tag and one anchor, so a block has to hold a round per
    // *pair* rather than one per tag (4ab draft 15-22/0381r5 §1.1); a one-to-many round holds
    // the whole ring, and a block is one round per tag again.
    const mmsPlan = this.plan.mms ?? null
    // Every MMS session ends a round the same way — nothing travels back — whether that round
    // held one pair or the whole ring; `oneToMany` only decides how many rounds a block needs.
    const mms = mmsPlan !== null
    const oneToMany = mmsPlan?.oneToMany === true
    // The scenario schema checks the same things in RSTU, before rstuNs rounds; these are the
    // checks in the units the scheduler actually uses, so the two definitions of "how much fits
    // in a block" — and of which modes are exempt from which rule — cannot drift apart unnoticed.
    const rounds = mms && !oneToMany ? tags.length * anchors.length : tags.length
    if (!listenOnly && rounds > this.plan.roundsPerBlock) {
      throw new Error(
        `UwbNetwork: ${rounds} ${mms && !oneToMany ? 'pairs' : 'tags'} need ${rounds} rounds, but a ${this.plan.blockNs} ns `
        + `block holds ${this.plan.roundsPerBlock} rounds of ${this.plan.roundNs} ns`,
      )
    }
    // The same pair of guards, in the units the scheduler runs in: a frame that outlives its
    // slot would be lost to the receiver's deadline with no diagnostic at all.
    const needNs = uwbSlotFitNs(anchors.length, this.plan.mode, this.plan.schedule, cfg.mms)
    if (this.plan.slotNs < needNs) {
      throw new Error(
        `UwbNetwork: a ${this.plan.slotNs} ns ranging slot cannot carry a round of ${anchors.length} `
        + `anchors, whose longest frame plus flight needs ${needNs} ns`,
      )
    }
    // An MMS round has a second frame rule the schema checks too: the draft gives each
    // narrowband message two slots, and a 608 µs REPORT has to fit inside them.
    if (mms) {
      const nbNs = uwbNbSlotFitNs(cfg.mms, mmsPlan.layout.responders)
      if (2 * this.plan.slotNs < nbNs) {
        throw new Error(
          `UwbNetwork: two ${this.plan.slotNs} ns ranging slots cannot carry a narrowband message of a `
          + `round with ${mmsPlan.layout.responders} responders, which needs ${nbNs} ns plus flight`,
        )
      }
    }
    // Nothing in an MMS round grows with the anchor count — each pair gets a round of its own,
    // and no frame lists the anchors — so the PSDU cap the round's longest frame runs into does
    // not apply to it, and `uwbMaxAnchors` refuses to be asked for an MMS round at all (it has no
    // PSDU to size) — so `!mms` has to guard the call, not just the throw. `replyTime` is not a
    // session field yet, so this is the cap embedded reply-time carries — the schema checks the
    // identical thing in RSTU (see scenario.ts), and the two must not drift apart.
    if (!mms) {
      const anchorCap = uwbMaxAnchors(this.plan.mode, this.plan.method, 'embedded', this.plan.schedule)
      if (anchors.length > anchorCap) {
        throw new Error(`UwbNetwork: ${anchors.length} anchors exceed the ${anchorCap} this round's longest frame allows`)
      }
    }

    // The receiver's clock-offset estimate needs the transmitter's crystal, so
    // the channel reads it back out of the devices it is about to carry.
    const ch = new UwbChannel(
      q, now, nodes, walls,
      // The medium reads only the session's channel and its NLOS switch; everything an MMS frame
      // needs (power, band, length) rides on the frame itself.
      { channel: cfg.channel, nlos: cfg.nlos },
      (id) => this.devices.get(id)?.clock.ppm ?? 0, emit, spectrum, scatterers,
    )
    this.channel = ch

    const byId = new Map(nodes.map((n) => [n.id, n]))
    const geometry: UwbGeometry = {
      trueDistM: (a, b) => ch.distanceM(a, b),
      anchorPos: (id) => {
        const n = byId.get(id)
        if (!n) throw new Error(`UwbNetwork: unknown anchor ${id}`)
        return { id, x: n.pos.x, y: n.pos.y, z: n.pos.z }
      },
    }

    for (const n of nodes) {
      // One stream per UWB node, shared by the crystal draw and every later
      // noise draw, so a node's randomness is independent of its neighbours'
      // and independent of how many nodes the scenario holds.
      const rng = root.fork(hashStr(`${n.id}#uwb`))
      const clock = UwbClock.fromRng(rng, n.uwb?.ppm)
      // UL-TDoA (model "wired sync"): the anchors are calibrated to one common timebase, and each
      // is left with a fixed residual error of it. It is drawn here, once, from this anchor's own
      // stream and straight after its crystal — so it cannot reorder anything, and no other mode
      // draws it at all: a two-way or DL-TDoA session takes exactly the stream it took before.
      const syncOffsetNs = this.plan.mode === 'ul-tdoa' && n.uwb?.role === 'anchor'
        ? gaussian(rng) * cfg.syncErrorNs
        : 0
      const dev = new UwbDevice(
        n.id,
        {
          role: n.uwb?.role ?? 'anchor', pos: n.pos,
          tsNoisePs: cfg.tsNoisePs, cfoNoisePpm: cfg.cfoNoisePpm, maxAttempts: cfg.maxAttempts,
          tdoaClockCorrection: cfg.tdoaClockCorrection, syncOffsetNs, syncErrorNs: cfg.syncErrorNs,
          // Angle of arrival is a property of the anchor hardware, so a tag carries the flag
          // and never acts on it; an anchor with no yaw of its own faces +x.
          aoa: cfg.aoa, yawDeg: n.uwb?.yawDeg ?? 0, channel: cfg.channel,
          // The security pair, spread only when the session names them, so a device of a
          // session that has no attacker carries neither field.
          ...(cfg.attacker ? { attacker: { ...cfg.attacker } } : {}),
          ...(cfg.stsOff !== undefined ? { stsOff: cfg.stsOff } : {}),
        },
        clock, rng, q, now, ch, emit, geometry,
      )
      this.devices.set(n.id, dev)
      // The one place sensing is switched on, and it is switched on by the **presence of the
      // scatterers section** — the same branch the medium takes, so the two cannot disagree
      // about whether this session has reflecting objects in it. With no section the device is
      // registered bare: it implements no `onEcho`, the medium's `onEcho?.()` finds nothing to
      // call, and no session written before this slice can emit a `UWB_ECHO`. With a section
      // (even an empty one) the device is wrapped in a sensor that forwards every ranging call
      // through untouched and consumes the echoes the device is not allowed to see — which is
      // how ranging stays bit-for-bit what it was (sensing design §3 and §7).
      ch.register(n.id, scatterers === undefined ? dev : new UwbSensor(n.id, dev, now, emit))
    }

    /**
     * Lay out one block. The invariant the devices' slot deadlines rest on:
     * **every slot of a round is followed, at the instant it ends, by another
     * `onSlot` on the same crowd or by that round's `endRound`** — the last slot
     * by `endRound`, every other slot by the next slot's start. Both are queued
     * here, in order, before any of them runs, so they precede anything a device
     * queues from inside a slot. Keep that true, and a slot with no answer is
     * always reported exactly once, at exactly the slot boundary.
     */
    const runRound = (
      block: number, round: number, tagId: string, crowdIds: string[],
      /** The pair's own anchor list — one entry in an MMS round, every anchor in every other
       * mode, and what a slot action's `anchor` index is resolved against. */
      roundAnchors: string[] = anchors,
      /** The block's narrowband channel, drawn once per block by `startBlock`; null outside
       * an MMS session, where there is no narrowband radio to put on one. */
      nbChannel: number | null = null,
    ): void => {
      const crowd = crowdIds.map((id) => this.devices.get(id)!)
      const peers = { tag: tagId, anchors: roundAnchors }
      for (let s = 0; s < this.plan.slots; s++) {
        const at = slotStartNs(this.plan, block, round, s)
        q.schedule(at, () => {
          if (s === 0) for (const d of crowd) d.beginRound(block, round, this.plan, tagId, anchors, { nbChannel })
          const action = slotAction(this.plan, s)
          for (const d of crowd) d.onSlot(s, action, at + this.plan.slotNs, peers)
        }, 0)
      }
      const endNs = slotStartNs(this.plan, block, round, this.plan.slots - 1) + this.plan.slotNs
      q.schedule(endNs, () => {
        // A listen-only round belongs to nobody: every tag closes its own measurement and no
        // feedback travels back to the anchors, because no anchor asked anything of a tag.
        if (listenOnly) {
          for (const d of crowd) d.endRound(false)
          return
        }
        // An MMS round ends at every device in it with nothing travelling back: each side
        // computed its own range from the narrowband reports, and there is no contention budget
        // for a feedback flag to refill. The tag heads the crowd, so its block fix — solved
        // inside its own `endRound` at the last pair round of the block — still precedes the
        // anchor's close, exactly as every other mode's tag-first order does.
        if (mms) {
          for (const d of crowd) d.endRound(false)
          return
        }
        if (this.plan.mode === 'ul-tdoa' && anchors.length > 0) {
          // The tag blinked once and is finished; everything else happens on the infrastructure
          // side. The anchors' arrivals are already on their common timebase, so the reference
          // anchor — anchor 0, the one every difference is taken against — collects them and
          // solves the tag's position before any round state is cleared. Nothing travels back to
          // the tag: it is positioned without ever learning that it was.
          const arrivals: { id: string; ns: number }[] = []
          for (const id of anchors) {
            const ns = this.devices.get(id)!.ulArrivalNs()
            if (ns !== null) arrivals.push({ id, ns })
          }
          this.devices.get(anchors[0])!.solveUlFix(arrivals)
          for (const d of crowd) d.endRound(false)
          return
        }
        // The tag closes first (it always did: it heads the crowd), and what it ranged this
        // round is handed straight back to the anchors. SS-TWR ends at the tag, so this is
        // the only way a responder in a contention round can learn whether its draw worked —
        // the model's stand-in for the upper layer of standard §10.32.1 NOTE. A time-scheduled
        // round ignores the flag entirely, and emits nothing either way.
        const heard = new Set(this.devices.get(tagId)!.endRound(false))
        for (const id of anchors) this.devices.get(id)!.endRound(heard.has(id))
      }, 0)
    }

    const startBlock = (block: number): void => {
      if (listenOnly) {
        // One round per block, run by the anchors, with every tag in the crowd: the tags come
        // first so a listener's slot record precedes the frame that lands in it, exactly as the
        // single tag of a two-way round heads its own crowd. `tagId` is empty because no tag
        // owns this round — nothing in the round is addressed to one.
        runRound(block, 0, '', [...tags, ...anchors])
      } else if (mmsPlan) {
        // The narrowband control plane hops channel **per block**, deterministically from the
        // scenario's seed (4ab draft 15-22/0381r5 §1.5.3): drawn once, here, and handed to every
        // round of the block, so no device re-derives it and the two ends of a round cannot land
        // on different channels.
        // …and only when there is a narrowband radio to hop it. Config 1's allow list is empty
        // because that side has no radio at all, so there is no channel for the block and every
        // round of it is told so. 4ab draft 15-25/0194r0
        const nbChannel = mmsPlan.phy.control === 'nba'
          ? nbChannelForBlock(mmsPlan.nbChannels, this.seed, block)
          : null
        if (oneToMany) {
          // One round per tag, and every anchor is in it: the tag's POLL names them all, its
          // train goes out once for all of them, and each answers in slots of its own (4ab draft
          // 15-22/0381r5 Table 1.6.3.1). A block therefore costs one round per tag — a longer
          // round than a pair's, but one of them.
          tags.forEach((tagId, t) => runRound(block, t, tagId, [tagId, ...anchors], anchors, nbChannel))
        } else {
          // One round per tag–anchor pair: tag t and anchor k own round t·A + k, which is what
          // lets a tag know its block is over when `round % A === A − 1`.
          tags.forEach((tagId, t) => anchors.forEach((anchorId, k) => {
            runRound(block, t * anchors.length + k, tagId, [tagId, anchorId], [anchorId], nbChannel)
          }))
        }
      } else {
        tags.forEach((tagId, k) => runRound(block, k, tagId, [tagId, ...anchors]))
      }
      q.schedule((block + 1) * this.plan.blockNs, () => startBlock(block + 1), 0)
    }
    // Block 0 starts at t = 0, i.e. now: the session is laid out block by block
    // so a run of any length only ever holds one block's worth of events.
    startBlock(0)
  }
}
