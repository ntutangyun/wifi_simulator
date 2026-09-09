import { describe, it, expect } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000

/**
 * A DL MU exchange is over when the last BlockAck has been received. The AP
 * used to keep waiting until the response timeout (BA end + 45 µs) before
 * resolving it and arming its SIFS continuation, so the TXOP holder idled
 * 61 µs after every DL MU PPDU — longer than any AIFS, an open door for
 * whoever contended next.
 */
describe('a DL MU exchange resolves on its last BlockAck', () => {
  const sc = LESSONS.find((x) => x.id === 'ofdma-dl')!.scenario()
  const recs: TLRecord[] = []
  const sim = new Simulation(sc)
  for (let t = 50 * MS; t <= 300 * MS; t += 50 * MS) recs.push(...sim.runUntil(t).records)

  it('the AP resolves (CW_CHANGE) at the instant the last expected BlockAck ends', () => {
    let rounds = 0
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i]
      if (r.type !== 'TX_END' || r.node !== 'ap' || !r.frame.muParts || r.frame.kind !== 'data') continue
      const gid = r.frame.orthogonalGroup
      const users = r.frame.muParts.length
      const bas = recs.filter((x) => x.type === 'RX_OK' && x.node === 'ap' && x.frame.kind === 'ba' && x.frame.orthogonalGroup === gid)
      if (bas.length !== users) continue // a lost BA resolves on the timeout instead
      rounds++
      const lastBa = Math.max(...bas.map((x) => x.t))
      const resolved = recs.find((x) => x.t >= lastBa && x.type === 'CW_CHANGE' && x.node === 'ap')
      expect(resolved?.t, `round after MU PPDU ending @${r.t}`).toBe(lastBa)
    }
    expect(rounds).toBeGreaterThan(5)
  })
})
