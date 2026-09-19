/**
 * The UWB ranging engine: one medium, one device per UWB node, and the clock
 * that walks the session schedule.
 *
 * It is the UWB counterpart of the Wi-Fi link wiring in engine/simulation.ts,
 * and deliberately much smaller, because a scheduled ranging session has no
 * contention to arbitrate: the block/round/slot grid (src/uwb/session.ts) says
 * who transmits when, for the whole session, before it starts. All this class
 * does is turn that grid into events and hand each slot to its participants.
 *
 * Tag k owns round k of every block. Anchors serve every round.
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
    // The scenario schema checks the same thing in RSTU, before rstuNs rounds;
    // this is the check in the units the scheduler actually uses, so the two
    // definitions of "how many tags fit in a block" cannot drift apart unnoticed.
    if (tags.length > this.plan.roundsPerBlock) {
      throw new Error(
        `UwbNetwork: ${tags.length} tags need ${tags.length} rounds, but a ${this.plan.blockNs} ns block `
        + `holds ${this.plan.roundsPerBlock} rounds of ${this.plan.roundNs} ns`,
      )
    }
    // The same pair of guards, in the units the scheduler runs in: a frame that outlives its
    // slot would be lost to the receiver's deadline with no diagnostic at all.
    const needNs = uwbSlotFitNs(anchors.length)
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
        { role: n.uwb?.role ?? 'anchor', pos: n.pos, tsNoisePs: cfg.tsNoisePs, cfoNoisePpm: cfg.cfoNoisePpm },
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
    const startBlock = (block: number): void => {
      tags.forEach((tagId, k) => {
        const crowd = [tagId, ...anchors].map((id) => this.devices.get(id)!)
        const peers = { tag: tagId, anchors }
        for (let s = 0; s < this.plan.slots; s++) {
          const at = slotStartNs(this.plan, block, k, s)
          q.schedule(at, () => {
            if (s === 0) for (const d of crowd) d.beginRound(block, k, this.plan, tagId, anchors)
            const action = slotAction(this.plan, s)
            for (const d of crowd) d.onSlot(s, action, at + this.plan.slotNs, peers)
          }, 0)
        }
        const endNs = slotStartNs(this.plan, block, k, this.plan.slots - 1) + this.plan.slotNs
        q.schedule(endNs, () => { for (const d of crowd) d.endRound() }, 0)
      })
      q.schedule((block + 1) * this.plan.blockNs, () => startBlock(block + 1), 0)
    }
    // Block 0 starts at t = 0, i.e. now: the session is laid out block by block
    // so a run of any length only ever holds one block's worth of events.
    startBlock(0)
  }
}
