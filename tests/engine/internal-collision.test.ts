import { describe, it, expect } from 'vitest'
import { makeBss, msdu } from './helpers'

describe('internal collision (§10.23.2.12.1)', () => {
  it('the losing AC counts a retry on the frame it would have sent', () => {
    const b = makeBss(['ap', 'sta-1'], { 'sta-1>ap': -55, 'ap>sta-1': -55 }, { edca: true })
    // an idle medium since forever: both ACs are ready at the same instant
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap', 1400, 3))
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap', 1400, 0))
    b.runUntil(50_000_000)
    expect(b.recs('INTERNAL_COLLISION', 'sta-1')).toHaveLength(1)
    const retry = b.recs('RETRY', 'sta-1')
    expect(retry).toHaveLength(1)
    expect(retry[0]).toMatchObject({ ac: 0, retries: 1, qsrc: 1 })
    const bkData = b.recs('TX_START', 'sta-1').find((r) => r.frame.kind === 'data' && r.frame.ac === 0)!
    expect(bkData.frame.retryFlag).toBe(true)
    expect(b.delivered).toHaveLength(2)
  })
})
