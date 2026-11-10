/**
 * **An A-MPDU whose BlockAck never arrives is retried whole.**
 *
 * 2026-11-11 (W7a): this file used to pin "A-MPDU in this engine is all-or-nothing". That is no
 * longer the engine: an A-MPDU is received MPDU by MPDU and the BlockAck bitmap reports each one,
 * so a BlockAck that does arrive retires the acknowledged MPDUs and sends only the rest again
 * (§9.7, §10.12, §10.25; pinned in tests/engine/w7a-frames.test.ts). What this file still pins is
 * the other half, which is the standard's too: when NO valid response arrives, every MPDU of the
 * attempt has failed (§10.23.2.2's definition of failure), so what comes back is the WHOLE set of
 * subframes — `failMsdus` counts a retry for each and `queues.restore` unshifts them in order —
 * and at the retry limit all of them are dropped together.
 *
 * **The ruler, and the proof that it is one.** `violations()` walks the TX_START stream and
 * reports every retransmission whose `msduIds` is not identical to the attempt before it. The
 * last `it` feeds it a doctored stream in which one retry carries half its subframes, and
 * requires it to object — a census that cannot count is indistinguishable from a clean census.
 */
import { describe, it, expect } from 'vitest'
import { Channel } from '../../src/engine/channel'
import { EventQueue } from '../../src/engine/events'
import { DcfMac } from '../../src/engine/mac'
import { Rng } from '../../src/engine/rng'
import type { Msdu } from '../../src/engine/traffic'
import { makeEmitter, type TLRecord } from '../../src/model/records'

const MS = 1_000_000
const N_MSDUS = 6
const MSDU_BYTES = 1400

/**
 * One AP, one station, A-MPDU on — and a **one-way** link: the AP's PPDUs reach the station,
 * the station's BlockAcks do not reach the AP. Every aggregate therefore fails on the ack
 * timeout, which is the only way to reach `failMsdus` with more than one MSDU in hand without
 * a jammer's randomness in the picture. The MSDU lifetime is lifted so that the only reason an
 * MSDU can leave the queue is the retry limit.
 */
function run(): TLRecord[] {
  const q = new EventQueue()
  let now = 0
  const table = new Map<string, Map<string, number>>([
    ['ap', new Map([['sta-1', -40]])],
    // The BlockAck's direction: out of range, so the AP never hears an answer.
    ['sta-1', new Map([['ap', -200]])],
  ])
  const records: TLRecord[] = []
  const emit = makeEmitter((r) => records.push(r))
  const ch = new Channel(q, () => now, table, emit)
  const root = new Rng(7)
  const cfg = (isAp: boolean) => ({
    // High enough that a 6 x 1400 B A-MPDU is never preceded by an RTS: this file is about the
    // failure of the aggregate itself, not about protection.
    rtsThresholdBytes: 1_000_000,
    edca: false, txop: false, isAp,
    queueLimit: 1000,
    msduLifetimeNs: 10_000 * MS,
    modeForPeer: () => 'he' as const,
    mcsForPeer: () => 4,
    widthForPeer: () => 20,
    nssForPeer: () => 1,
    ampduWith: () => true,
    ofdmaWith: () => false,
    mumimoWith: () => false,
    ownNss: () => 1,
  })
  const macs: Record<string, DcfMac> = {}
  for (const [i, id] of ['ap', 'sta-1'].entries()) {
    const mac = new DcfMac(id, q, () => now, ch, root.fork(i + 1), emit, cfg(id === 'ap'))
    macs[id] = mac
    ch.register(id, mac)
  }
  let mid = 1
  for (let i = 0; i < N_MSDUS; i++) {
    const m: Msdu = { id: mid++, bytes: MSDU_BYTES, src: 'ap', dst: 'sta-1', bornNs: 0, ac: 1 }
    macs.ap.enqueue(m, 1)
  }
  for (;;) {
    const pt = q.peekTime()
    if (pt === null || pt > 60 * MS) break
    const e = q.pop()!
    now = e.t
    e.fn()
  }
  return records
}

/** The aggregates the AP put on the air, in order, as the MSDU ids each one carried. */
function attempts(recs: TLRecord[]): number[][] {
  return recs
    .filter((r) => r.type === 'TX_START' && r.node === 'ap' && r.frame.kind === 'data')
    .map((r) => (r as Extract<TLRecord, { type: 'TX_START' }>).frame)
    .filter((f) => f.ampdu !== undefined)
    .map((f) => f.ampdu!.msduIds)
}

/**
 * Every retransmission that carries something other than exactly what the attempt before it
 * carried. Empty means all-or-nothing held for the whole run.
 */
function violations(runs: number[][]): string[] {
  const out: string[] = []
  for (let i = 1; i < runs.length; i++) {
    const prev = runs[i - 1]
    const cur = runs[i]
    if (prev.length !== cur.length || prev.some((id, k) => id !== cur[k])) {
      out.push(`attempt ${i}: [${cur}] after [${prev}]`)
    }
  }
  return out
}

describe('an A-MPDU with no BlockAck fails whole (§10.23.2.2)', () => {
  const recs = run()
  const runs = attempts(recs)

  it('aggregates more than one subframe, so there is something to lose a part of', () => {
    expect(runs.length).toBeGreaterThan(1)
    expect(runs[0].length).toBe(N_MSDUS)
  })

  it('restores every subframe of a failed aggregate, never a subset', () => {
    expect(violations(runs)).toEqual([])
    // Stated as it IS: each retry is the same set in the same order, not merely the same size.
    for (const r of runs) expect(r).toEqual(runs[0])
  })

  it('counts one retry for every subframe, and drops them together at the limit', () => {
    const retries = recs.filter((r) => r.type === 'RETRY' && r.node === 'ap')
    expect(retries.length).toBe(runs.length)
    const dropped = recs
      .filter((r) => r.type === 'DROP' && r.node === 'ap' && r.reason === 'retryLimit')
      .map((r) => (r as Extract<TLRecord, { type: 'DROP' }>).msduId)
      .sort((a, b) => a - b)
    // All six leave at once, at the same instant, because they shared one attempt's fate.
    expect(dropped).toEqual(runs[0].slice().sort((a, b) => a - b))
    const at = recs.filter((r) => r.type === 'DROP' && r.reason === 'retryLimit').map((r) => r.t)
    expect(new Set(at).size).toBe(1)
  })

  it('and the census can fail: half a set restored is reported', () => {
    const half = runs.map((r, i) => (i === 1 ? r.slice(0, Math.ceil(r.length / 2)) : r))
    expect(violations(half).length).toBeGreaterThan(0)
    expect(violations(half)[0]).toContain('attempt 1')
  })
})
