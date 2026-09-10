import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { HOUSEHOLDS } from '../../src/model/households'
import { minGen } from '../../src/model/caps'
import { Channel } from '../../src/engine/channel'
import { EventQueue } from '../../src/engine/events'
import { DcfMac } from '../../src/engine/mac'
import { txTimeModeNs, type PhyMode } from '../../src/engine/phy'
import { Rng } from '../../src/engine/rng'
import type { Msdu } from '../../src/engine/traffic'
import { makeEmitter, type TLRecord } from '../../src/model/records'

const MS = 1_000_000

/** A house where the AP has large frames pending for several phones at once. */
function scenario() {
  const sc = HOUSEHOLDS.find((h) => h.id === 'full-house')!.scenario()
  for (const id of ['sta-1', 'sta-2', 'sta-3']) {
    sc.nodes.find((n) => n.id === id)!.profiles = ['video']
  }
  return sc
}

describe('MU-MIMO: one PPDU, several stations, split by space', () => {
  const sc = scenario()
  // Every member's actual PHY mode is the generation minimum with the (always
  // 'eht') AP — the same rule modeForPeer uses in simulation.ts. HE and EHT
  // share MCS 0-11's rate table (only EHT adds MCS 12/13), so recovering mode
  // from (mcs, mbps) alone is ambiguous; look it up from the node's own
  // negotiated generation instead.
  const genOf = new Map(sc.nodes.map((n) => [n.id, n.caps.generation]))
  const modeOf = (dst: string): PhyMode => minGen('eht', genOf.get(dst)!) as PhyMode

  const recs: TLRecord[] = []
  const sim = new Simulation(sc)
  for (let t = 50 * MS; t <= 1000 * MS; t += 50 * MS) recs.push(...sim.runUntil(t).records)
  const mu = recs.filter((r) => r.type === 'TX_START' && r.node === 'ap' && r.frame.muKind === 'mumimo')

  it('the AP sends MU-MIMO PPDUs when several stations have large frames pending', () => {
    expect(mu.length).toBeGreaterThan(3)
  })

  it('a group never asks for more streams than the AP has', () => {
    for (const r of mu) {
      if (r.type !== 'TX_START') continue
      const streams = (r.frame.muParts ?? []).reduce((s, p) => s + (p.nss ?? 1), 0)
      expect(streams).toBeLessThanOrEqual(4)
    }
  })

  it('every member uses the full width, unlike OFDMA where they share it', () => {
    for (const r of mu) {
      if (r.type !== 'TX_START') continue
      for (const p of r.frame.muParts ?? []) expect(p.ruFraction ?? 1).toBe(1)
    }
  })

  it('the PPDU lasts as long as its slowest member', () => {
    for (const r of mu) {
      if (r.type !== 'TX_START') continue
      const parts = r.frame.muParts ?? []
      const expected = Math.max(...parts.map((p) =>
        txTimeModeNs(modeOf(p.dst), p.bytes, p.mcs, { mu: true, widthMhz: r.frame.widthMhz, nss: p.nss })))
      expect(r.frame.txTimeNs).toBe(expected)
      const end = recs.find((x) => x.type === 'TX_END' && x.node === 'ap' && x.t === r.t + r.frame.txTimeNs)
      expect(end).toBeDefined()
    }
  })

  it('every member answers and the exchange resolves on the last BlockAck', () => {
    for (const r of mu) {
      if (r.type !== 'TX_START' || !r.frame.orthogonalGroup) continue
      const gid = r.frame.orthogonalGroup
      const bas = recs.filter((x) => x.type === 'RX_OK' && x.node === 'ap' && x.frame.kind === 'ba' && x.frame.orthogonalGroup === gid)
      if (bas.length !== (r.frame.muParts ?? []).length) continue // a lost BA resolves on timeout
      const last = Math.max(...bas.map((x) => x.t))
      const resolved = recs.find((x) => x.t >= last && x.type === 'CW_CHANGE' && x.node === 'ap')
      expect(resolved?.t).toBe(last)
    }
  })
})

describe('MU-MIMO: the stream-fitting drop rule (unit-level, controlled candidate set)', () => {
  /**
   * A purpose-built 1-AP/3-STA BSS where all three stations are always in
   * range, always MU-MIMO-eligible, and each has a large MSDU queued before
   * the AP's very first channel access — so the AP's first `transmitDlMu`
   * candidate set is guaranteed to be all three at once, not whatever the
   * traffic scheduler happens to produce. This isolates the stream-fitting
   * drop rule from the full-house scenario's timing, which (per review) can
   * satisfy a loose assertion through ordinary two-candidate draws alone.
   */
  function run(ownNss: number): TLRecord[] {
    const ids = ['ap', 'sta-1', 'sta-2', 'sta-3']
    const q = new EventQueue()
    let now = 0
    const table = new Map<string, Map<string, number>>()
    for (const tx of ids) {
      const row = new Map<string, number>()
      for (const rx of ids) if (tx !== rx) row.set(rx, -40)
      table.set(tx, row)
    }
    const records: TLRecord[] = []
    const emit = makeEmitter((r) => records.push(r))
    const ch = new Channel(q, () => now, table, emit)
    const root = new Rng(7)
    const cfg = () => ({
      rtsThresholdBytes: 3000,
      edca: false, txop: false, isAp: false,
      modeForPeer: () => 'eht' as const,
      mcsForPeer: () => 7,
      widthForPeer: () => 20,
      nssForPeer: () => 2,
      ampduWith: () => true,
      ofdmaWith: () => true,
      mumimoWith: () => true,
      ownNss: () => ownNss,
    })
    let apMac: DcfMac | undefined
    ids.forEach((id, i) => {
      const mac = new DcfMac(id, q, () => now, ch, root.fork(i + 1), emit, { ...cfg(), isAp: id === 'ap' })
      ch.register(id, mac)
      if (id === 'ap') apMac = mac
    })
    let mid = 1
    const msdu = (dst: string): Msdu => ({ id: mid++, bytes: 1400, src: 'ap', dst, bornNs: 0, ac: 1 })
    // All three destinations queued before the AP ever gets to transmit:
    // the first channel access sees all three as candidates at once.
    for (const dst of ['sta-1', 'sta-2', 'sta-3']) apMac!.enqueue(msdu(dst), 1)
    const horizon = 5 * MS
    for (;;) {
      const pt = q.peekTime()
      if (pt === null || pt > horizon) break
      const ev = q.pop()!
      now = ev.t
      ev.fn()
    }
    return records
  }

  it('with headroom for only two 2-stream members, a 3-station candidate set comes back as a 2-member MU-MIMO group', () => {
    const records = run(4) // AP has 4 streams: 2 members of 2 streams each fit, 3 do not
    const firstMu = records.find((r) => r.type === 'TX_START' && r.node === 'ap' && r.frame.muKind === 'mumimo')
    expect(firstMu).toBeDefined()
    if (firstMu?.type !== 'TX_START') throw new Error('unreachable')
    const parts = firstMu.frame.muParts ?? []
    // The candidate set handed to the grouping decision was all three
    // stations; the group that actually goes out must be smaller.
    expect(parts.length).toBeLessThan(3)
    expect(parts.length).toBe(2)
  })

  it('with headroom for all three, the same candidate set is served as one 3-member MU-MIMO group', () => {
    const records = run(6) // AP has 6 streams: three 2-stream members fit exactly
    const firstMu = records.find((r) => r.type === 'TX_START' && r.node === 'ap' && r.frame.muKind === 'mumimo')
    expect(firstMu).toBeDefined()
    if (firstMu?.type !== 'TX_START') throw new Error('unreachable')
    expect((firstMu.frame.muParts ?? []).length).toBe(3)
  })
})
