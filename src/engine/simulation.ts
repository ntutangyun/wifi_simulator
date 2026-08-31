/**
 * Top-level deterministic simulation: wires RNG streams, link table, channel,
 * per-node DCF MACs and traffic sources; runs the event queue and produces
 * batches of timeline records plus periodic ViewState snapshots.
 */
import { makeEmitter, type TLRecord } from '../model/records'
import { ScenarioSchema, type Scenario } from '../model/scenario'
import type { Ns } from '../model/types'
import { applyRecord, cloneView, initViewState, type Snapshot, type ViewState } from '../model/view'
import { Channel } from './channel'
import { EventQueue } from './events'
import { DcfMac } from './mac'
import { dataRateFor } from './phy'
import { buildLinkTable } from './propagation'
import { Rng } from './rng'
import { TrafficSource, resetMsduIds } from './traffic'

export interface Batch {
  records: TLRecord[]
  snapshots: Snapshot[]
  frontierNs: Ns
}

export class Simulation {
  private q = new EventQueue()
  private nowNs: Ns = 0
  private pendingRecords: TLRecord[] = []
  private pendingSnapshots: Snapshot[] = []
  private live: ViewState
  private hash = 0x811c9dc5 // FNV-1a running hash over all records
  readonly macs = new Map<string, DcfMac>()

  constructor(sc: Scenario) {
    ScenarioSchema.parse(sc)
    resetMsduIds()
    this.live = initViewState(sc)
    const emit = makeEmitter((r) => {
      this.pendingRecords.push(r)
      applyRecord(this.live, r)
      this.updateHash(r)
    })
    const linkTable = buildLinkTable(sc.nodes, sc.walls)
    const ch = new Channel(this.q, () => this.nowNs, linkTable, emit)
    const root = new Rng(sc.seed)
    const ap = sc.nodes.find((n) => n.kind === 'ap')!

    const sources = new Map<string, TrafficSource>()
    sc.nodes.forEach((n, i) => {
      const mac = new DcfMac(
        n.id, this.q, () => this.nowNs, ch, root.fork(i + 1), emit,
        {
          rtsThresholdBytes: sc.rtsThresholdBytes,
          rateForPeer: (peer) => dataRateFor(linkTable.get(n.id)?.get(peer) ?? -200),
        },
        {
          onDequeue: (msduId) => {
            // keep saturated queues topped up
            void msduId
            sources.get(n.id)?.refill()
          },
        },
      )
      this.macs.set(n.id, mac)
      ch.register(n.id, mac)
    })

    const enqueue = (atNode: string, msdu: { id: number; bytes: number; src: string; dst: string; bornNs: Ns }) => {
      emit({ t: this.nowNs, type: 'ARRIVAL', node: atNode, msduId: msdu.id, bytes: msdu.bytes, dst: msdu.dst })
      this.macs.get(atNode)!.enqueue(msdu)
    }
    for (const [i, n] of sc.nodes.entries()) {
      if (n.kind !== 'sta' || n.profile === 'idle') continue
      const src = new TrafficSource(this.q, () => this.nowNs, root.fork(1000 + i), n.id, ap.id, n.profile, enqueue)
      sources.set(n.id, src)
      src.start()
    }

    // Periodic snapshots in phase 3 — after every record of that instant.
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
