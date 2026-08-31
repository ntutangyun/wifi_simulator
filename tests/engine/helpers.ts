import { Channel } from '../../src/engine/channel'
import { EventQueue } from '../../src/engine/events'
import { DcfMac } from '../../src/engine/mac'
import { RATES, dataRateFor } from '../../src/engine/phy'
import { Rng } from '../../src/engine/rng'
import type { Msdu } from '../../src/engine/traffic'
import { makeEmitter, type TLRecord } from '../../src/model/records'

export interface Bss {
  q: EventQueue
  ch: Channel
  macs: Record<string, DcfMac>
  records: TLRecord[]
  delivered: { at: string; msduId: number; t: number }[]
  runUntil(t: number): void
  at(t: number, fn: () => void): void
  enqueue(t: number, node: string, msdu: Msdu): void
  recs<T extends TLRecord['type']>(type: T, node?: string): Extract<TLRecord, { type: T }>[]
}

/**
 * Build a BSS with nodes and an explicit dBm link matrix `links['a>b']`.
 * Missing entries default to −200 (out of range).
 */
export function makeBss(nodeIds: string[], links: Record<string, number>, opts: { rtsThresholdBytes?: number; seed?: number } = {}): Bss {
  const q = new EventQueue()
  let now = 0
  const table = new Map<string, Map<string, number>>()
  for (const tx of nodeIds) {
    const row = new Map<string, number>()
    for (const rx of nodeIds) {
      if (tx === rx) continue
      const v = links[`${tx}>${rx}`]
      row.set(rx, v === undefined ? -200 : v)
    }
    table.set(tx, row)
  }
  const records: TLRecord[] = []
  const emit = makeEmitter((r) => records.push(r))
  const ch = new Channel(q, () => now, table, emit)
  const root = new Rng(opts.seed ?? 42)
  const delivered: Bss['delivered'] = []
  const macs: Record<string, DcfMac> = {}
  nodeIds.forEach((id, i) => {
    const mac = new DcfMac(
      id, q, () => now, ch, root.fork(i + 10), emit,
      {
        rtsThresholdBytes: opts.rtsThresholdBytes ?? 3000,
        edca: false, txop: false, isAp: id === 'ap',
        modeForPeer: () => 'nonht',
        mcsForPeer: (peer) => {
          const mbps = dataRateFor(table.get(peer)!.get(id) ?? -200)
          return RATES.findIndex((r) => r.mbps === mbps)
        },
        ampduWith: () => false,
        ofdmaWith: () => false,
      },
      { onMsduDelivered: (msduId, t) => delivered.push({ at: id, msduId, t }) },
    )
    macs[id] = mac
    ch.register(id, mac)
  })
  return {
    q, ch, macs, records, delivered,
    runUntil(t: number) {
      for (;;) {
        const pt = q.peekTime()
        if (pt === null || pt > t) break
        const e = q.pop()!
        now = e.t
        e.fn()
      }
      now = t
    },
    at(t: number, fn: () => void) {
      q.schedule(t, fn)
    },
    enqueue(t: number, node: string, msdu: Msdu) {
      q.schedule(t, () => macs[node].enqueue(msdu))
    },
    recs(type, node) {
      return records.filter((r) => r.type === type && (node === undefined || (r as { node?: string }).node === node)) as never
    },
  }
}

let mid = 1000
export const msdu = (src: string, dst: string, bytes = 1400): Msdu => ({ id: mid++, bytes, src, dst, bornNs: 0 })
