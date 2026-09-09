import { describe, it, expect } from 'vitest'
import { HOUSEHOLDS } from '../../src/model/households'
import { TAMPER_PRESETS } from '../../src/model/scenario'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000

/**
 * A TXOP holder that has scheduled its next frame one SIFS after a response
 * can be intruded on: a station whose NAV did not cover the gap (single
 * protection only covers the response) starts an RTS in it. The holder's
 * radio is receiving when the continuation was armed; when the RTS ends it
 * owes a CTS. Two SIFS timers were left pending, the continuation fired
 * first and the CTS timer then hit "startTx while transmitting".
 * Found by the tamper report: full house, the Huawei phone greedy + uploading.
 */
function scenario() {
  const sc = HOUSEHOLDS.find((h) => h.id === 'full-house')!.scenario()
  const n = sc.nodes.find((x) => x.id === 'sta-1')!
  n.profiles = [...n.profiles, 'backup']
  n.tamper = { ...TAMPER_PRESETS.greedy }
  return sc
}

describe('a frame received during a TXOP holder\'s SIFS gap pre-empts its continuation', () => {
  const recs: TLRecord[] = []
  const sim = new Simulation(scenario())

  it('runs 800 ms without the channel refusing a start (the crash)', () => {
    expect(() => {
      for (let t = 50 * MS; t <= 800 * MS; t += 50 * MS) recs.push(...sim.runUntil(t).records)
    }).not.toThrow()
  })

  it('every RTS the AP receives gets a CTS one SIFS later, and the AP never squeezes a data frame in between', () => {
    let cases = 0
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i]
      if (r.type !== 'RX_OK' || r.node !== 'ap' || r.frame.kind !== 'rts') continue
      cases++
      const later = recs.slice(i + 1).filter((x) => x.t <= r.t + 16_000 && 'node' in x && x.node === 'ap' && x.type === 'TX_START')
      expect(later.map((x) => x.type === 'TX_START' ? `${x.frame.kind}@${x.t - r.t}` : ''), `after RTS @${r.t}`).toEqual(['cts@16000'])
    }
    expect(cases).toBeGreaterThan(5)
  })

  it('a TXOP holder that receives a frame it must answer has released its TXOP by the time it answers', () => {
    let txop = false
    let checked = 0
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i]
      if (r.type === 'TXOP_START' && r.node === 'ap') txop = true
      if (r.type === 'TXOP_END' && r.node === 'ap') txop = false
      if (r.type === 'TX_START' && r.node === 'ap' && (r.frame.kind === 'cts' || r.frame.kind === 'ack' || r.frame.kind === 'ba')) {
        checked++
        expect(txop, `AP still holds a TXOP while answering with ${r.frame.kind} @${r.t}`).toBe(false)
      }
    }
    expect(checked).toBeGreaterThan(100)
  })
})
