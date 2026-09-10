import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { HOUSEHOLDS } from '../../src/model/households'
import { minGen } from '../../src/model/caps'
import { txTimeModeNs, type PhyMode } from '../../src/engine/phy'
import type { TLRecord } from '../../src/model/records'

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

  it('an over-large candidate group is served as a smaller MU-MIMO group, never one that overruns the AP', () => {
    const everyDst = new Set<string>()
    for (const r of mu) {
      if (r.type !== 'TX_START') continue
      const parts = r.frame.muParts ?? []
      const streams = parts.reduce((s, p) => s + (p.nss ?? 1), 0)
      // The AP is 4-stream: a group must never demand more than that.
      expect(streams).toBeLessThanOrEqual(4)
      for (const p of parts) everyDst.add(p.dst)
    }
    // This household has more than two 2-stream stations with large frames
    // pending on the same AC at once (sta-1/2/3 video, plus the TV) — more
    // than a single pair could ever join at once against a 4-stream AP. The
    // AP still forms MU-MIMO groups, and does so from more than one fixed
    // pair of members, which is only possible if an over-large candidate set
    // gets trimmed down to a fitting subgroup rather than being abandoned in
    // favor of OFDMA whenever more than two stations are eligible.
    expect(everyDst.size).toBeGreaterThan(2)
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
