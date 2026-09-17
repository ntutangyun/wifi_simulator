import { describe, it, expect } from 'vitest'
import { Channel, type PhyListener } from '../../src/engine/channel'
import { EventQueue } from '../../src/engine/events'
import { makeEmitter, type TLRecord } from '../../src/model/records'
import type { FrameDesc } from '../../src/model/frames'

/**
 * `rx` transmits 0–1 ms. Meanwhile `j` starts a long frame at 100 µs, so rx
 * cannot see its preamble. `a` optionally starts a frame to rx at 2 ms.
 */
function run(jDbm: number, aDbm: number | null) {
  const q = new EventQueue()
  let now = 0
  const table = new Map<string, Map<string, number>>([
    ['rx', new Map([['x', -40], ['j', -200], ['a', -200]])],
    ['j', new Map([['rx', jDbm], ['x', -200], ['a', -200]])],
    ['a', new Map([['rx', aDbm ?? -200], ['x', -200], ['j', -200]])],
    ['x', new Map([['rx', -200], ['j', -200], ['a', -200]])],
  ])
  const recs: TLRecord[] = []
  const calls: string[] = []
  const ch = new Channel(q, () => now, table, makeEmitter((r) => recs.push(r)))
  const listener = (id: string): PhyListener => ({
    onCcaBusy: () => calls.push(`${id}:busy`), onCcaIdle: () => calls.push(`${id}:idle`),
    onRxStart: (_t, _f, from) => calls.push(`${id}:rxstart:${from}`),
    onRxOk: (_t, _f, from) => calls.push(`${id}:ok:${from}`),
    onRxCorrupt: () => calls.push(`${id}:corrupt`),
  })
  for (const id of ['rx', 'j', 'a', 'x']) ch.register(id, listener(id))
  const f = (src: string, dst: string, dur: number): FrameDesc => ({
    kind: 'data', src, dst, bytes: 1500, mbps: 54, durationFieldNs: 0, txTimeNs: dur,
  })
  q.schedule(0, () => ch.startTx('rx', f('rx', 'x', 1_000_000)))
  q.schedule(100_000, () => ch.startTx('j', f('j', 'x', 5_000_000)))
  if (aDbm !== null) q.schedule(2_000_000, () => ch.startTx('a', f('a', 'rx', 500_000)))
  const ccaAt = (t: number) => { q.schedule(t, () => ccaLog.push([t, ch.isCcaBusy('rx')]), 2) }
  const ccaLog: [number, boolean][] = []
  ccaAt(1_000_000); ccaAt(1_500_000)
  for (;;) { const pt = q.peekTime(); if (pt === null) break; const e = q.pop()!; now = e.t; e.fn() }
  return { recs, calls, ccaLog }
}

describe('CCA for a signal whose preamble was missed during our own transmission (§17.3.10.6)', () => {
  it('below −62 dBm it does not hold CCA busy once our transmission ends', () => {
    const { ccaLog } = run(-75, null)
    expect(ccaLog).toEqual([[1_000_000, false], [1_500_000, false]])
  })

  it('at or above −62 dBm energy detection keeps CCA busy', () => {
    const { ccaLog } = run(-60, null)
    expect(ccaLog).toEqual([[1_000_000, true], [1_500_000, true]])
  })
})

describe('preamble detection needs SINR ≥ 4 dB (ns-3 ThresholdPreambleDetectionModel)', () => {
  it('a −70 dBm preamble under a −68 dBm interferer is missed: no RX_START, no RX_FAIL, no EIFS', () => {
    const { recs, calls } = run(-68, -70)
    expect(recs.some((r) => r.type === 'RX_MISS' && r.node === 'rx' && r.from === 'a' && r.reason === 'preambleSinr')).toBe(true)
    expect(recs.some((r) => (r.type === 'RX_START' || r.type === 'RX_FAIL') && r.node === 'rx' && r.from === 'a')).toBe(false)
    expect(calls.filter((c) => c.startsWith('rx:rxstart') || c === 'rx:corrupt')).toEqual([])
  })

  it('the same preamble 5 dB above the interferer is detected', () => {
    const { recs } = run(-75, -70)
    expect(recs.some((r) => r.type === 'RX_START' && r.node === 'rx' && r.from === 'a')).toBe(true)
  })
})
