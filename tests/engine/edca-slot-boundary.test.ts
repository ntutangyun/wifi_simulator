import { describe, it, expect } from 'vitest'
import { SLOT_NS } from '../../src/engine/phy'
import type { TLRecord } from '../../src/model/records'
import { makeBss, msdu } from './helpers'

const NODES = ['ap', 'sta-1', 'sta-2']
const STRONG = { 'sta-1>ap': -55, 'ap>sta-1': -55, 'sta-2>ap': -56, 'ap>sta-2': -56, 'sta-1>sta-2': -58, 'sta-2>sta-1': -58 }

/** Two saturated contenders: backoffs are drawn, run, frozen and resumed many times. */
function contend(edca: boolean, seed: number) {
  const b = makeBss(NODES, STRONG, { edca, seed })
  for (let i = 0; i < 30; i++) {
    b.enqueue(1_000_000 + i, 'sta-1', msdu('sta-1', 'ap'))
    b.enqueue(1_000_000 + i, 'sta-2', msdu('sta-2', 'ap'))
  }
  b.runUntil(200_000_000)
  return b.records.filter((r) => 'node' in r && r.node === 'sta-1')
}

/** Every freeze: (value at IFS end, full idle slots after IFS end, value frozen). */
function freezes(recs: TLRecord[]) {
  const out: { start: number; k: number; frozen: number }[] = []
  let ifsEnd = -1
  let start: number | null = null
  for (const r of recs) {
    if (r.type === 'IFS_END') { ifsEnd = r.t; start = null }
    if ((r.type === 'BACKOFF_DRAW' || r.type === 'BACKOFF_RESUME') && r.t === ifsEnd) start = r.value
    if (r.type === 'BACKOFF_FREEZE' && start !== null) {
      out.push({ start, k: Math.floor((r.t - ifsEnd) / SLOT_NS), frozen: r.value })
      start = null
    }
  }
  return out
}

describe('backoff slot boundaries (§10.23.2.4)', () => {
  it('EDCA also decrements at the AIFS-end boundary, so a freeze keeps one slot less', () => {
    const f = freezes(contend(true, 7))
    expect(f.length).toBeGreaterThan(3)
    for (const x of f) expect(x.frozen).toBe(Math.max(0, x.start - x.k - 1))
  })

  it('DCF decrements only after each idle slot', () => {
    const f = freezes(contend(false, 7))
    expect(f.length).toBeGreaterThan(3)
    for (const x of f) expect(x.frozen).toBe(x.start - x.k)
  })

  it('EDCA: an uninterrupted countdown still transmits at AIFS end + b·slot', () => {
    const recs = contend(true, 7)
    let checked = 0
    for (let i = 0; i < recs.length; i++) {
      const d = recs[i]
      if (d.type !== 'BACKOFF_DRAW') continue
      const rest = recs.slice(i + 1)
      const next = rest.find((r) => r.type === 'TX_START' || r.type === 'BACKOFF_FREEZE' || r.type === 'IFS_START')
      if (next?.type !== 'TX_START') continue
      expect(next.t).toBe(d.t + d.value * SLOT_NS)
      checked++
    }
    expect(checked).toBeGreaterThan(3)
  })
})
