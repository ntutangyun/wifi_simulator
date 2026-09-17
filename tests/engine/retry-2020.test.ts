import { describe, it, expect } from 'vitest'
import { makeBss, msdu } from './helpers'

const NODES = ['ap', 'sta-1', 'sta-2']
const STRONG = { 'sta-1>ap': -55, 'ap>sta-1': -55, 'sta-2>ap': -56, 'ap>sta-2': -56, 'sta-1>sta-2': -58, 'sta-2>sta-1': -58 }

describe('802.11-2020 retry model', () => {
  it('a retransmission keeps its sequence number (§10.3.2.14)', () => {
    const b = makeBss(NODES, { ...STRONG, 'sta-1>ap': -90 })
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap'))
    b.runUntil(100_000_000)
    const seqs = b.recs('TX_START', 'sta-1').filter((r) => r.frame.kind === 'data').map((r) => r.frame.seqNo)
    expect(seqs).toHaveLength(7)
    expect(new Set(seqs).size).toBe(1)
  })

  it('a frame above the RTS threshold gets 7 attempts, not 4', () => {
    const b = makeBss(NODES, { ...STRONG, 'sta-1>ap': -90 }, { rtsThresholdBytes: 500 })
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap'))
    b.runUntil(200_000_000)
    expect(b.recs('TX_START', 'sta-1').filter((r) => r.frame.kind === 'rts')).toHaveLength(7)
    expect(b.recs('DROP', 'sta-1')).toHaveLength(1)
    expect(b.recs('RETRY', 'sta-1').map((r) => r.retries)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('at the limit only the frames of the failed attempt are dropped', () => {
    const b = makeBss(NODES, { ...STRONG, 'sta-1>ap': -90 })
    for (let i = 0; i < 5; i++) b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap'))
    b.runUntil(30_000_000)
    const drops = b.recs('DROP', 'sta-1')
    expect(drops.length).toBeGreaterThan(0)
    expect(drops.filter((r) => r.t === drops[0].t)).toHaveLength(1)
  })
})
