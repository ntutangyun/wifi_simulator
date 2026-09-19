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
 * Tag k owns round k of every block. Anchors serve every round. DL-TDoA turns that around: the
 * anchors own the one round a block holds, and every tag in the scenario listens to it.
 */
import type { EventQueue } from '../engine/events'
import { hashStr } from '../engine/hash'
import type { Rng } from '../engine/rng'
import type { Spectrum } from '../engine/spectrum'
import type { EmitFn } from '../model/records'
import type { NodeCfg, UwbSessionCfg, Wall } from '../model/scenario'
import type { Ns } from '../model/types'
import { UwbChannel } from './channel'
import { UwbClock } from './clock'
import { UwbDevice, type UwbGeometry } from './device'
import { UWB_MAX_ANCHORS, uwbSlotFitNs } from './phy'
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
  ) {
    const anchors = nodes.filter((n) => n.uwb?.role === 'anchor').map((n) => n.id)
    const tags = nodes.filter((n) => n.uwb?.role === 'tag').map((n) => n.id)
    this.plan = roundPlan(cfg, anchors.length)
    // DL-TDoA runs one anchor round per block and every tag listens to it, so a block holds any
    // number of tags — the rule below is a two-way-ranging (and UL-TDoA) rule, and the schema
    // skips it in this mode for the same reason.
    const listenOnly = this.plan.mode === 'dl-tdoa'
    // The scenario schema checks the same thing in RSTU, before rstuNs rounds;
    // this is the check in the units the scheduler actually uses, so the two
    // definitions of "how many tags fit in a block" cannot drift apart unnoticed.
    if (!listenOnly && tags.length > this.plan.roundsPerBlock) {
      throw new Error(
        `UwbNetwork: ${tags.length} tags need ${tags.length} rounds, but a ${this.plan.blockNs} ns block `
        + `holds ${this.plan.roundsPerBlock} rounds of ${this.plan.roundNs} ns`,
      )
    }
    // The same pair of guards, in the units the scheduler runs in: a frame that outlives its
    // slot would be lost to the receiver's deadline with no diagnostic at all.
    const needNs = uwbSlotFitNs(anchors.length, this.plan.mode)
    if (this.plan.slotNs < needNs) {
      throw new Error(
        `UwbNetwork: a ${this.plan.slotNs} ns ranging slot cannot carry a round of ${anchors.length} `
        + `anchors, whose longest frame plus flight needs ${needNs} ns`,
      )
    }
    if (anchors.length > UWB_MAX_ANCHORS) {
      throw new Error(`UwbNetwork: ${anchors.length} anchors exceed the ${UWB_MAX_ANCHORS} a Final can list`)
    }

    // The receiver's clock-offset estimate needs the transmitter's crystal, so
    // the channel reads it back out of the devices it is about to carry.
    const ch = new UwbChannel(
      q, now, nodes, walls, { channel: cfg.channel, nlos: cfg.nlos },
      (id) => this.devices.get(id)?.clock.ppm ?? 0, emit, spectrum,
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
      const dev = new UwbDevice(
        n.id,
        {
          role: n.uwb?.role ?? 'anchor', pos: n.pos,
          tsNoisePs: cfg.tsNoisePs, cfoNoisePpm: cfg.cfoNoisePpm, maxAttempts: cfg.maxAttempts,
          tdoaClockCorrection: cfg.tdoaClockCorrection,
        },
        clock, rng, q, now, ch, emit, geometry,
      )
      this.devices.set(n.id, dev)
      ch.register(n.id, dev)
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
    const runRound = (block: number, round: number, tagId: string, crowdIds: string[]): void => {
      const crowd = crowdIds.map((id) => this.devices.get(id)!)
      const peers = { tag: tagId, anchors }
      for (let s = 0; s < this.plan.slots; s++) {
        const at = slotStartNs(this.plan, block, round, s)
        q.schedule(at, () => {
          if (s === 0) for (const d of crowd) d.beginRound(block, round, this.plan, tagId, anchors)
          const action = slotAction(this.plan, s)
          for (const d of crowd) d.onSlot(s, action, at + this.plan.slotNs, peers)
        }, 0)
      }
      const endNs = slotStartNs(this.plan, block, round, this.plan.slots - 1) + this.plan.slotNs
      q.schedule(endNs, () => {
        // A listen-only round belongs to nobody: every tag closes its own measurement and no
        // feedback travels back to the anchors, because no anchor asked anything of a tag.
        if (listenOnly) {
          for (const d of crowd) d.endRound()
          return
        }
        // The tag closes first (it always did: it heads the crowd), and what it ranged this
        // round is handed straight back to the anchors. SS-TWR ends at the tag, so this is
        // the only way a responder in a contention round can learn whether its draw worked —
        // the model's stand-in for the upper layer of standard §10.32.1 NOTE. A time-scheduled
        // round ignores the flag entirely, and emits nothing either way.
        const heard = new Set(this.devices.get(tagId)!.endRound())
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
