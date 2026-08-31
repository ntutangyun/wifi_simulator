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
  hasFeature, linkPlanFor, minGen, negotiated, virtualId, type LinkId,
} from '../model/caps'
import { makeEmitter, type EmitFn, type TLRecord } from '../model/records'
import { ScenarioSchema, type NodeCfg, type Scenario } from '../model/scenario'
import type { Ns } from '../model/types'
import { applyRecord, cloneView, initViewState, type Snapshot, type ViewState } from '../model/view'
import { Channel } from './channel'
import { EventQueue } from './events'
import { WifiMac } from './mac'
import { mcsForRssi } from './phy'
import { buildLinkTable } from './propagation'
import { AcQueues } from './queues'
import { Rng } from './rng'
import { TrafficSource, acForProfile, resetMsduIds, type Msdu } from './traffic'

export interface Batch {
  records: TLRecord[]
  snapshots: Snapshot[]
  frontierNs: Ns
}

/** Extra path loss on the 6 GHz link (higher frequency). */
const LINK_EXTRA_LOSS_DB: Record<LinkId, number> = { '5g': 0, '6g': 1.2 }

export class Simulation {
  private q = new EventQueue()
  private nowNs: Ns = 0
  private pendingRecords: TLRecord[] = []
  private pendingSnapshots: Snapshot[] = []
  private live: ViewState
  private hash = 0x811c9dc5
  /** MACs keyed by virtual id. */
  readonly macs = new Map<string, WifiMac>()

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

    const ap = sc.nodes.find((n) => n.kind === 'ap')!
    const plan = linkPlanFor(sc.nodes)
    const root = new Rng(sc.seed)
    const byId = new Map(sc.nodes.map((n) => [n.id, n]))

    // ---- negotiation helpers (physical ids) ----
    const other = (a: NodeCfg, peerId: string): NodeCfg => (a.kind === 'ap' ? byId.get(peerId) ?? a : ap)
    const modeFor = (me: NodeCfg, peerId: string) => minGen(me.caps.generation, other(me, peerId).caps.generation)

    // ---- shared MLD queues (per physical node) ----
    const queuesOf = new Map<string, AcQueues>()
    for (const n of sc.nodes) queuesOf.set(n.id, new AcQueues())

    const sources = new Map<string, TrafficSource>()
    const apMacs: WifiMac[] = [] // one per link the AP is on

    // ---- per-link channels + MACs ----
    for (const link of plan.links) {
      const memberIds = plan.members[link]
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
      const ch = new Channel(this.q, () => this.nowNs, table, linkEmit)

      for (const n of members) {
        const vid = vname(n.id)
        const edca = hasFeature(n, 'edca') && hasFeature(ap, 'edca')
        const mac = new WifiMac(
          n.id, this.q, () => this.nowNs, ch,
          root.fork(hashStr(vid)), linkEmit,
          {
            rtsThresholdBytes: sc.rtsThresholdBytes,
            edca,
            txop: edca && hasFeature(n, 'txop') && hasFeature(ap, 'txop'),
            isAp: n.kind === 'ap',
            modeForPeer: (peer) => modeFor(n, peer),
            mcsForPeer: (peer) => {
              const rssi = table.get(n.id)?.get(peer) ?? -200
              const mode = modeFor(n, peer)
              const peerCfg = other(n, peer)
              const cap = mode === 'eht' && !negotiated(n, peerCfg, 'qam4k') ? 11 : undefined
              return mcsForRssi(mode, rssi, cap)
            },
            ampduWith: (peer) => negotiated(n, other(n, peer), 'ampdu'),
            ofdmaWith: (peer) => negotiated(n, other(n, peer), 'ofdma'),
            ulBacklog: n.kind === 'ap'
              ? () => memberIds
                  .filter((id) => id !== ap.id && negotiated(byId.get(id)!, ap, 'ofdma'))
                  .map((id) => {
                    const stq = queuesOf.get(id)!
                    const ac = acForProfile(byId.get(id)!.profile)
                    return { peer: id, ac, bytes: stq.all().reduce((s, x) => s + x.msdu.bytes, 0) }
                  })
                  .filter((u) => u.bytes > 0)
              : undefined,
          },
          {
            onDequeue: (msduId) => {
              void msduId
              sources.get(n.id)?.refill()
            },
          },
          queuesOf.get(n.id),
        )
        this.macs.set(vid, mac)
        ch.register(n.id, mac)
        if (n.kind === 'ap') apMacs.push(mac)
      }
    }

    // ---- traffic → primary-link MAC (shared queues make it MLD-wide) ----
    const primaryMac = (id: string): WifiMac => {
      const links = plan.members['5g'].includes(id) ? '5g' : '6g'
      return this.macs.get(virtualId(id, links))!
    }
    const enqueue = (atNode: string, msdu: Msdu) => {
      const staId = atNode === ap.id ? msdu.dst : atNode
      const sta = byId.get(staId)
      const ac = sta ? acForProfile(sta.profile) : 1
      baseEmit({ t: this.nowNs, type: 'ARRIVAL', node: virtualId(atNode, plan.members['5g'].includes(atNode) ? '5g' : '6g'), msduId: msdu.id, bytes: msdu.bytes, dst: msdu.dst })
      primaryMac(atNode).enqueue(msdu, ac)
      // MLO: wake the sibling link's MAC; OFDMA: poke the AP scheduler.
      for (const [vid, mac] of this.macs) {
        if (vid !== virtualId(atNode, '5g') && vid.startsWith(`${atNode}#`)) mac.pokeAccess()
      }
      if (atNode !== ap.id && sta && negotiated(sta, ap, 'ofdma')) {
        for (const m of apMacs) m.notifyUlBacklog()
      }
    }
    for (const [i, n] of sc.nodes.entries()) {
      if (n.kind !== 'sta' || n.profile === 'idle') continue
      const src = new TrafficSource(this.q, () => this.nowNs, root.fork(1000 + i), n.id, ap.id, n.profile, enqueue)
      sources.set(n.id, src)
      src.start()
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

function hashStr(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
