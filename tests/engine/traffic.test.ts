import { describe, it, expect, beforeEach } from 'vitest'
import { EventQueue } from '../../src/engine/events'
import { Rng } from '../../src/engine/rng'
import { TrafficSource, resetMsduIds, type Msdu } from '../../src/engine/traffic'
import type { ProfileId } from '../../src/model/scenario'

function collect(profile: ProfileId, untilNs: number, seed = 1) {
  const q = new EventQueue()
  let now = 0
  const out: { node: string; msdu: Msdu }[] = []
  const src = new TrafficSource(q, () => now, new Rng(seed), 'sta-1', 'ap', profile, (node, msdu) =>
    out.push({ node, msdu }),
  )
  src.start()
  for (;;) {
    const t = q.peekTime()
    if (t === null || t > untilNs) break
    const e = q.pop()!
    now = e.t
    e.fn()
  }
  return out
}

beforeEach(resetMsduIds)

describe('traffic profiles', () => {
  it('video: ~15 Mbps DL at the AP', () => {
    const out = collect('video', 100_000_000) // 100 ms
    expect(out.length).toBeGreaterThanOrEqual(115)
    expect(out.length).toBeLessThanOrEqual(140)
    expect(out.every((o) => o.node === 'ap' && o.msdu.bytes === 1400 && o.msdu.dst === 'sta-1')).toBe(true)
  })

  it('backup: two 50-frame UL bursts within 100 ms', () => {
    const out = collect('backup', 100_000_000)
    expect(out.length).toBe(100)
    expect(out.every((o) => o.node === 'sta-1' && o.msdu.bytes === 1500 && o.msdu.dst === 'ap')).toBe(true)
  })

  it('saturated: 20 frames at t=0', () => {
    const out = collect('saturated', 1)
    expect(out.length).toBe(20)
  })

  it('idle: nothing', () => {
    expect(collect('idle', 1_000_000_000).length).toBe(0)
  })

  it('is deterministic for a given seed', () => {
    resetMsduIds()
    const a = collect('video', 50_000_000, 7).map((o) => o.msdu.bornNs)
    resetMsduIds()
    const b = collect('video', 50_000_000, 7).map((o) => o.msdu.bornNs)
    expect(a).toEqual(b)
  })
})
