/**
 * Top-level deterministic simulation. v2: multi-link (MLO) wiring — one
 * Channel + per-node MACs per link, capability negotiation (generation minimum
 * + feature intersection with the AP), EDCA access-category routing, shared
 * MLD queues for MLO devices, and the OFDMA UL-backlog hook.
 *
 * Records from the 6 GHz link carry virtualized node ids (`id#6g`) so the UI
 * shows one lane per node per link; frame src/dst stay physical.
 */
import {
  hasFeature, linkPlanFor, minGen, negotiated, negotiatedNss, negotiatedWidth, nssOf, physicalId,
  virtualId, widthOf,
  type LinkId,
} from '../model/caps'
import { makeEmitter, type EmitFn, type TLRecord } from '../model/records'
import {
  DEFAULT_SIX_GHZ_CENTER_MHZ, ScenarioSchema, serverFor, type NodeCfg, type Scenario,
} from '../model/scenario'
import type { Ns } from '../model/types'
import { applyRecord, cloneView, initViewState, type Snapshot, type ViewState } from '../model/view'
import { nbBand } from '../uwb/nb'
import { UwbNetwork } from '../uwb/network'
import { uwbBandOverlap } from '../uwb/phy'
import { AMP_TAG_DL_SENS_DBM, ampId16 } from './amp'
import { AmpStaMac } from './ampSta'
import { Channel, type ChannelSpectrum } from './channel'
import { EventQueue } from './events'
import { hashStr } from './hash'
import { WifiMac } from './mac'
import { ERP_2G, mcsForRssi, OFDM_5G, type PhyTiming } from './phy'
import { buildLinkTable } from './propagation'
import { AcQueues } from './queues'
import { RateControl } from './rate'
import { Rng } from './rng'
import { bandOverlapMhz, Spectrum } from './spectrum'
import { TrafficSource, resetMsduIds, type Msdu } from './traffic'

/** Re-exported for the callers that grew up importing it from here. */
export { hashStr } from './hash'

export interface Batch {
  records: TLRecord[]
  snapshots: Snapshot[]
  frontierNs: Ns
}

/** Extra path loss per link relative to the 5 GHz table (higher frequency loses more; 2.4 GHz loses 6.5 dB less). */
export const LINK_EXTRA_LOSS_DB: Record<LinkId, number> = { '2g': -6.5, '5g': 0, '6g': 1.2 }

/** Interframe timing of a link's PHY: clause 18 ERP-OFDM on 2.4 GHz, clause 17 OFDM elsewhere. */
export function timingFor(link: LinkId): PhyTiming {
  return link === '2g' ? ERP_2G : OFDM_5G
}

export class Simulation {
  private q = new EventQueue()
  private nowNs: Ns = 0
  private pendingRecords: TLRecord[] = []
  private pendingSnapshots: Snapshot[] = []
  private live: ViewState
  private hash = 0x811c9dc5
  /** MACs keyed by virtual id. */
  readonly macs = new Map<string, WifiMac>()
  /** AMP tag MACs keyed by virtual id (tags are not Wi-Fi stations: they never appear in `macs`). */
  readonly tags = new Map<string, AmpStaMac>()
  /** The UWB ranging engine, when the scenario holds UWB nodes and a session. */
  readonly uwb?: UwbNetwork
  /**
   * The cross-technology mediator, non-null only when a 6 GHz Wi-Fi link and a
   * UWB session may share spectrum. Both engines hold the same object.
   *
   * "May": the gate widens the link's negotiated width to at least 160 MHz before testing the
   * overlap, because a 6 GHz link can reach 320 MHz and a false negative would silently uncouple
   * the two engines. So a narrow link centred just outside the UWB band still builds a mediator,
   * which is then inert - every `foreignMw` uses the real width and returns 0. Read this field as
   * "the bands may meet", never as "these two are coupled".
   */
  readonly spectrum: Spectrum | null = null

  constructor(sc: Scenario) {
    ScenarioSchema.parse(sc)
    resetMsduIds()
    this.live = initViewState(sc)
    const emit: EmitFn = (r) => {
      const rec = r as TLRecord
      this.pendingRecords.push(rec)
      applyRecord(this.live, rec)
      this.updateHash(rec)
    }
    const baseEmit = makeEmitter((r) => emit(r as never))

    const root = new Rng(sc.seed)
    const uwbNodes = sc.nodes.filter((n) => n.kind === 'uwb')
    // Every Wi-Fi structure hangs off the one AP, and a scenario may legitimately
    // have none: a pure UWB ranging session is a complete scenario with no BSS at
    // all. Without an AP there is no link plan, no channel, no MAC and no traffic.
    const ap = sc.nodes.find((n) => n.kind === 'ap')
    if (ap) {
      const plan = linkPlanFor(sc.nodes)
      const byId = new Map(sc.nodes.map((n) => [n.id, n]))

      // ---- negotiation helpers (physical ids) ----
      const other = (a: NodeCfg, peerId: string): NodeCfg => (a.kind === 'ap' ? byId.get(peerId) ?? a : ap)
      const modeFor = (me: NodeCfg, peerId: string) => minGen(me.caps.generation, other(me, peerId).caps.generation)

      // ---- shared MLD queues (per physical node) ----
      const queuesOf = new Map<string, AcQueues>()
      for (const n of sc.nodes) {
        // an AMP tag has no transmit queue (it answers triggers); a UWB node is
        // not a Wi-Fi station at all
        if (n.kind === 'amp' || n.kind === 'uwb') continue
        queuesOf.set(n.id, new AcQueues(sc.queue?.limit))
      }

      /** Traffic sources per station — one per stream it runs. */
      const sources = new Map<string, TrafficSource[]>()
      const apMacs: WifiMac[] = [] // one per link the AP is on

      // ---- per-link channels + MACs ----
      for (const link of plan.links) {
        const memberIds = plan.members[link]
        const memberSet = new Set(memberIds)
        const members = memberIds.map((id) => byId.get(id)!)
        const table = buildLinkTable(members, sc.walls)
        const extra = LINK_EXTRA_LOSS_DB[link]
        if (extra) {
          for (const row of table.values()) {
            for (const [k, v] of row) row.set(k, v - extra)
          }
        }
        // Virtualize node ids in this link's records.
        const vname = (id: string) => virtualId(id, link)
        const linkEmit: EmitFn = (r) => {
          const rec = r as Record<string, unknown>
          const out = { ...rec }
          if (typeof out.node === 'string') out.node = vname(out.node as string)
          if (Array.isArray(out.nodes)) out.nodes = (out.nodes as string[]).map(vname)
          baseEmit(out as never)
        }
        // Cross-technology coupling: only the 6 GHz link, and only when a band
        // of the UWB session can actually meet it. Energy detection listens
        // over the whole operating channel — the widest width any member
        // negotiates with the AP — and the gate is that channel, never narrower
        // than 160 MHz, so a link that only *might* widen into a UWB band is
        // still coupled. Each PPDU then overlaps on its own real width, so an
        // uncoupled link is one that cannot overlap.
        //
        // Two bands can meet it: UWB channel 5 (as before), and — in MMS mode —
        // any narrowband control channel of the session's allow list, which for
        // channels 50…249 sits in UNII-5 alongside 6 GHz Wi-Fi. A UNII-3 allow
        // list (the default) therefore never couples, and every session that
        // existed before this slice is gated exactly as it was.
        let hook: ChannelSpectrum | undefined
        if (link === '6g' && sc.uwb && uwbNodes.length > 0) {
          const centerMhz = sc.sixGhzCenterMhz ?? DEFAULT_SIX_GHZ_CENTER_MHZ
          const peers = members.filter((m) => m.id !== ap.id)
          const widthMhz = peers.length
            ? Math.max(...peers.map((m) => negotiatedWidth(m, ap, link)))
            : widthOf(ap, link)
          const gateWidthMhz = Math.max(widthMhz, 160)
          const gateLo = centerMhz - gateWidthMhz / 2
          const gateHi = centerMhz + gateWidthMhz / 2
          const uwbCoupled = sc.uwb.channel === 5 && uwbBandOverlap(centerMhz, gateWidthMhz, 5) > 0
          const nbCoupled = sc.uwb.mode === 'mms'
            && sc.uwb.mms.nbChannels.some((n) => {
              const b = nbBand(n)
              return bandOverlapMhz(b.lo, b.hi, gateLo, gateHi) > 0
            })
          if (uwbCoupled || nbCoupled) {
            const spectrum = this.spectrum ?? new Spectrum(sc.walls, this.q, () => this.nowNs)
            this.spectrum = spectrum
            hook = {
              s: spectrum,
              posOf: (id) => byId.get(id)!.pos,
              txPowerOf: (id) => byId.get(id)!.txPowerDbm,
              centerMhz,
              widthMhz,
            }
          }
        }
        const ch = new Channel(this.q, () => this.nowNs, table, linkEmit, hook)

        for (const n of members) {
          const vid = vname(n.id)
          if (n.kind === 'amp') {
            // An ambient-power tag: no carrier sense, no NAV, a radio that only
            // ever decodes the AP's downlink AMP PPDUs.
            const tagMac = new AmpStaMac(
              n.id, this.q, () => this.nowNs, ch, root.fork(hashStr(vid)), linkEmit,
              { apId: ap.id, id16: n.ampTag?.id16 ?? ampId16(n.id) },
            )
            ch.register(n.id, tagMac, { kind: 'tag', cca: false, floorDbm: n.ampTag?.dlSensDbm ?? AMP_TAG_DL_SENS_DBM })
            this.tags.set(vid, tagMac)
            continue
          }
          const edca = hasFeature(n, 'edca') && hasFeature(ap, 'edca')
          // This MAC runs AMP polling: the AP, on the 2.4 GHz link, configured
          // for it, with at least one tag to poll. Its radio decodes the tags'
          // uplink for exactly as long as it polls them.
          const polls = n.kind === 'ap' && link === '2g' && !!n.ampAp && members.some((m) => m.kind === 'amp')
          const rate = new RateControl()
          const mac = new WifiMac(
            n.id, this.q, () => this.nowNs, ch,
            root.fork(hashStr(vid)), linkEmit,
            {
              rtsThresholdBytes: sc.rtsThresholdBytes,
              msduLifetimeNs: sc.queue ? sc.queue.lifetimeMs * 1_000_000 : undefined,
              edca,
              txop: edca && hasFeature(n, 'txop') && hasFeature(ap, 'txop'),
              isAp: n.kind === 'ap',
              timing: timingFor(link),
              ampAp: polls ? n.ampAp : undefined,
              modeForPeer: (peer) => modeFor(n, peer),
              mcsForPeer: (peer) => {
                const rssi = table.get(n.id)?.get(peer) ?? -200
                const mode = modeFor(n, peer)
                const peerCfg = other(n, peer)
                const cap = mode === 'eht' && !negotiated(n, peerCfg, 'qam4k') ? 11 : undefined
                const ceiling = mcsForRssi(mode, rssi, cap, negotiatedWidth(n, peerCfg, link))
                return rate.mcsFor(peer, ceiling)
              },
              widthForPeer: (peer) => negotiatedWidth(n, other(n, peer), link),
              nssForPeer: (peer) => negotiatedNss(n, other(n, peer)),
              reachable: (peer) => memberSet.has(peer) && byId.get(peer)?.kind !== 'amp',
              onTxOutcome: (peer, ok) => { if (ok) rate.onSuccess(peer); else rate.onFailure(peer) },
              txopProtection: n.txopProtection ?? 'single',
              tamper: n.kind === 'sta' ? n.tamper : undefined,
              qosWith: (peer) => hasFeature(n, 'edca') && hasFeature(other(n, peer), 'edca'),
              ampduWith: (peer) => negotiated(n, other(n, peer), 'ampdu'),
              ofdmaWith: (peer) => negotiated(n, other(n, peer), 'ofdma'),
              mumimoWith: (peer) => negotiated(n, other(n, peer), 'mumimo'),
              ownNss: () => nssOf(n),
              ulBacklog: n.kind === 'ap'
                ? () => memberIds
                    .filter((id) => id !== ap.id && byId.get(id)!.kind === 'sta' && negotiated(byId.get(id)!, ap, 'ofdma'))
                    .map((id) => {
                      const stq = queuesOf.get(id)!
                      // A station may hold several streams: trigger it for its highest-priority backlog.
                      const ac = stq.all().reduce((m, x) => Math.max(m, x.ac), 0)
                      return { peer: id, ac, bytes: stq.all().reduce((s, x) => s + x.msdu.bytes, 0) }
                    })
                    .filter((u) => u.bytes > 0)
                : undefined,
            },
            {
              onDequeue: (msduId, acked) => {
                for (const s of sources.get(n.id) ?? []) {
                  s.refill()
                  // only an acknowledged frame reaches its cloud server (one WAN delay later)
                  if (acked) s.onUplinkDelivered(msduId, this.nowNs)
                }
                const relay = relayPending.get(msduId)
                if (!acked) relayPending.delete(msduId)
                if (acked && relay && n.kind === 'sta') {
                  // phone-to-phone: the AP forwards the acknowledged frame to its final station
                  relayPending.delete(msduId)
                  const at = this.nowNs + RELAY_FWD_NS
                  this.q.schedule(at, () => enqueue(ap.id, { id: msduId, bytes: relay.bytes, src: ap.id, dst: relay.finalDst!, bornNs: at, ac: relay.ac, relayFromNs: relay.bornNs }))
                }
              },
            },
            queuesOf.get(n.id),
          )
          this.macs.set(vid, mac)
          ch.register(n.id, mac, { ampCapable: polls })
          if (n.kind === 'ap') apMacs.push(mac)
        }
      }

      // ---- traffic → primary-link MAC (shared queues make it MLD-wide) ----
      /** The virtual id of each node's primary MAC: its first lane in the plan (5g before 6g before 2g). */
      const primaryVids = new Map<string, string>()
      for (const v of plan.virtualIds) {
        const p = physicalId(v)
        if (!primaryVids.has(p)) primaryVids.set(p, v)
      }
      const primaryVid = (id: string): string => primaryVids.get(id)!
      const primaryMac = (id: string): WifiMac => this.macs.get(primaryVid(id))!
      /** Uplink MSDUs bound for another station, by id: forwarded by the AP once acknowledged. */
      const relayPending = new Map<number, Msdu>()
      const RELAY_FWD_NS = 50_000 // AP forwarding latency
      const enqueue = (atNode: string, msdu: Msdu) => {
        if (msdu.finalDst) relayPending.set(msdu.id, msdu)
        const staId = atNode === ap.id ? msdu.dst : atNode
        const sta = byId.get(staId)
        // a tampered driver may re-mark its own (uplink) frames; it cannot touch the AP's
        const ac = atNode !== ap.id && sta?.tamper?.allAsAc !== undefined ? sta.tamper.allAsAc : msdu.ac
        baseEmit({ t: this.nowNs, type: 'ARRIVAL', node: primaryVid(atNode), msduId: msdu.id, bytes: msdu.bytes, dst: msdu.dst })
        primaryMac(atNode).enqueue(msdu, ac)
        // MLO: wake the sibling link's MAC; OFDMA: poke the AP scheduler.
        for (const [vid, mac] of this.macs) {
          if (vid !== primaryVid(atNode) && physicalId(vid) === atNode) mac.pokeAccess()
        }
        if (atNode !== ap.id && sta && negotiated(sta, ap, 'ofdma')) {
          for (const m of apMacs) m.notifyUlBacklog()
        }
      }
      // `i` is the index in sc.nodes, including any non-station node, because
      // the traffic streams are seeded from it and every saved scenario must
      // replay bit-for-bit. Lesson scenarios therefore list their UWB nodes
      // last: appending one must not renumber a station's stream.
      for (const [i, n] of sc.nodes.entries()) {
        if (n.kind !== 'sta') continue
        const list: TrafficSource[] = []
        n.profiles.forEach((profile, j) => {
          if (profile === 'idle') return
          // The first stream keeps the historical fork (1000 + i) so single-stream
          // scenarios replay bit-for-bit; extra streams get their own independent streams.
          const rng = root.fork(j === 0 ? 1000 + i : 100_000 + i * 16 + j)
          const server = serverFor(sc, n, profile)
          const link = server
            ? { id: server.id, wanNs: Math.round(server.rttMs * 500_000), jitterNs: Math.round(server.jitterMs * 1_000_000), processNs: Math.round(server.processMs * 1_000_000) }
            : null
          const src = new TrafficSource(this.q, () => this.nowNs, rng, n.id, ap.id, profile, enqueue, { server: link, emit: baseEmit, gameAccel: ap.gameAccel === true, p2pTarget: n.p2pTarget })
          list.push(src)
          src.start()
        })
        sources.set(n.id, list)
      }
    }

    // ---- UWB ranging session ----
    // A scheduled session runs beside the BSS: its own medium, its own devices, its own event
    // stream. Forking from `root` does not advance it, so adding UWB nodes to a scenario leaves
    // the Wi-Fi timeline bit-for-bit identical - unless the bands meet. With a `this.spectrum`
    // the two engines do touch: a UWB frame raises every open Wi-Fi lock's interference and can
    // turn an RX_OK into an RX_FAIL lowSinr, and each emission adds a phase-1 notification. The
    // RNG fork order, which is what the bit-for-bit claim protects, is unchanged either way.
    if (uwbNodes.length && sc.uwb) {
      // The mediator, if the 6 GHz link built one above, is handed on here: both
      // engines then hold the same object and hear each other's emissions.
      this.uwb = new UwbNetwork(this.q, () => this.nowNs, uwbNodes, sc.walls, sc.uwb, root, baseEmit, this.spectrum)
    }

    // ---- snapshots ----
    const intervalNs = sc.snapshotIntervalMs * 1_000_000
    const takeSnapshot = (at: Ns) => {
      this.q.schedule(at, () => {
        const view = cloneView(this.live)
        view.t = at
        this.pendingSnapshots.push({ t: at, view })
        takeSnapshot(at + intervalNs)
      }, 3)
    }
    takeSnapshot(0)
  }

  get view(): ViewState {
    return this.live
  }

  runUntil(t: Ns): Batch {
    for (;;) {
      const pt = this.q.peekTime()
      if (pt === null || pt > t) break
      const e = this.q.pop()!
      this.nowNs = e.t
      e.fn()
    }
    this.nowNs = t
    const batch: Batch = {
      records: this.pendingRecords,
      snapshots: this.pendingSnapshots,
      frontierNs: t,
    }
    this.pendingRecords = []
    this.pendingSnapshots = []
    return batch
  }

  private updateHash(r: TLRecord): void {
    const s = `${r.t}:${r.seq}:${r.type}`
    let h = this.hash
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    this.hash = h >>> 0
  }

  timelineHash(): string {
    return this.hash.toString(16)
  }
}

