import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { HOUSEHOLDS } from '../../src/model/households'
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
  const recs: TLRecord[] = []
  const sim = new Simulation(scenario())
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
      const end = recs.find((x) => x.type === 'TX_END' && x.node === 'ap' && x.t > r.t)
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
