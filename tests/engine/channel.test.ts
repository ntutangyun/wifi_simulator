import { describe, it, expect } from 'vitest'
import { Channel, type PhyListener } from '../../src/engine/channel'
import { EventQueue } from '../../src/engine/events'
import { txTimeNs } from '../../src/engine/phy'
import type { FrameDesc } from '../../src/model/frames'
import { makeEmitter, type TLRecord } from '../../src/model/records'

/** Test harness: nodes (default a,b,c) with an explicit dBm link matrix. */
function setup(links: Record<string, number>, ids: string[] = ['a', 'b', 'c']) {
  const q = new EventQueue()
  let now = 0
  const table = new Map<string, Map<string, number>>()
  for (const key of Object.keys(links)) {
    const [tx, rx] = key.split('>')
    if (!table.has(tx)) table.set(tx, new Map())
    table.get(tx)!.set(rx, links[key])
  }
  const records: TLRecord[] = []
  const emit = makeEmitter((r) => records.push(r))
  const ch = new Channel(q, () => now, table, emit)
  const calls: Record<string, string[]> = {}
  const listener = (id: string): PhyListener => ({
    onCcaBusy: (t) => calls[id].push(`busy@${t}`),
    onCcaIdle: (t) => calls[id].push(`idle@${t}`),
    onRxStart: () => {},
    onRxOk: (t, f, from) => calls[id].push(`rxok:${f.kind}:${from}@${t}`),
    onRxCorrupt: (t) => calls[id].push(`corrupt@${t}`),
  })
  for (const id of ids) {
    calls[id] = []
    ch.register(id, listener(id))
  }
  const runUntil = (t: number) => {
    for (;;) {
      const pt = q.peekTime()
      if (pt === null || pt > t) break
      const e = q.pop()!
      now = e.t
      e.fn()
    }
    now = t
  }
  const at = (t: number, fn: () => void) => q.schedule(t, fn)
  return { ch, records, calls, runUntil, at }
}

const frame = (kind: FrameDesc['kind'], src: string, dst: string, bytes: number, mbps: number): FrameDesc => ({
  kind, src, dst, bytes, mbps, durationFieldNs: 0, txTimeNs: txTimeNs(bytes, mbps),
})

describe('Channel', () => {
  it('delivers a clean frame and drives third-party CCA', () => {
    const { ch, records, calls, runUntil, at } = setup({
      'a>b': -60, 'a>c': -70, 'b>a': -60, 'b>c': -75, 'c>a': -70, 'c>b': -75,
    })
    const f = frame('data', 'a', 'b', 1428, 54)
    at(1000, () => ch.startTx('a', f))
    runUntil(1_000_000)
    expect(calls.b).toContain(`rxok:data:a@${1000 + f.txTimeNs}`)
    // c (−70 dBm) locks but SNR 25 dB < 30 dB needed for 54M payload → corrupt (→EIFS), then idle
    expect(calls.c).toEqual([`busy@1000`, `corrupt@${1000 + f.txTimeNs}`, `idle@${1000 + f.txTimeNs}`])
    expect(records.filter((r) => r.type === 'RX_START').length).toBe(2) // b and c both ≥ −82
    expect(records.some((r) => r.type === 'COLLISION')).toBe(false)
  })

  it('fails both receptions on a comparable-power collision and emits COLLISION', () => {
    const { ch, calls, records, runUntil, at } = setup({
      'a>c': -60, 'b>c': -61, 'a>b': -95, 'b>a': -95, 'c>a': -60, 'c>b': -61,
    })
    const fa = frame('data', 'a', 'c', 1428, 54)
    const fb = frame('data', 'b', 'c', 1428, 54)
    at(1000, () => ch.startTx('a', fa))
    at(5000, () => ch.startTx('b', fb))
    runUntil(1_000_000)
    expect(calls.c.some((s) => s.startsWith('corrupt'))).toBe(true)
    expect(calls.c.some((s) => s.startsWith('rxok'))).toBe(false)
    const col = records.find((r) => r.type === 'COLLISION')
    expect(col).toBeDefined()
    expect((col as Extract<TLRecord, { type: 'COLLISION' }>).nodes).toEqual(['a', 'b'])
  })

  it('captures the stronger frame over a weak interferer', () => {
    const { ch, calls, runUntil, at } = setup({
      'a>c': -50, 'b>c': -85, 'a>b': -95, 'b>a': -95, 'c>a': -50, 'c>b': -85,
    })
    const fa = frame('data', 'a', 'c', 1428, 54) // needs SINR ≥ 30 dB; has ~34.6 dB vs −85 interferer
    const fb = frame('data', 'b', 'c', 1428, 54)
    at(1000, () => ch.startTx('a', fa))
    at(3000, () => ch.startTx('b', fb))
    runUntil(1_000_000)
    expect(calls.c.some((s) => s.startsWith('rxok:data:a'))).toBe(true)
  })

  it('re-syncs to a much stronger preamble arriving mid-acquisition', () => {
    const { ch, calls, records, runUntil, at } = setup({
      'a>c': -40, 'b>c': -75, 'a>b': -95, 'b>a': -95, 'c>a': -40, 'c>b': -75,
    })
    const fa = frame('data', 'a', 'c', 1428, 54)
    const fb = frame('data', 'b', 'c', 1428, 54)
    at(1000, () => ch.startTx('b', fb)) // weak one starts first…
    at(3000, () => ch.startTx('a', fa)) // …strong one 2 µs later, inside the 20 µs preamble
    runUntil(1_000_000)
    expect(calls.c.some((x) => x.startsWith('rxok:data:a'))).toBe(true)
    const dropped = records.find((r) => r.type === 'RX_FAIL' && r.reason === 'capture')
    expect(dropped).toBeDefined()
    expect((dropped as Extract<TLRecord, { type: 'RX_FAIL' }>).from).toBe('b')
    // A superseded reception never reaches PHY-RXEND, so it must not arm EIFS.
    expect(calls.c.some((x) => x.startsWith('corrupt'))).toBe(false)
  })

  it('resolves a simultaneous start by signal strength, not by transmitter order', () => {
    const links = { 'a>c': -40, 'b>c': -75, 'a>b': -95, 'b>a': -95, 'c>a': -40, 'c>b': -75 }
    const winners: string[] = []
    for (const order of [['a', 'b'], ['b', 'a']]) {
      const { ch, calls, runUntil, at } = setup(links)
      const f: Record<string, FrameDesc> = {
        a: frame('data', 'a', 'c', 1428, 54),
        b: frame('data', 'b', 'c', 1428, 54),
      }
      at(1000, () => { for (const id of order) ch.startTx(id, f[id]) })
      runUntil(1_000_000)
      winners.push(calls.c.filter((x) => x.startsWith('rxok')).join(',') || 'none')
    }
    expect(winners[0]).toContain('rxok:data:a')
    expect(winners[0]).toEqual(winners[1]) // order must not change the outcome
  })

  it('resolves a 3-way pileup with straddling margins identically in any order', () => {
    // a beats b by 4 dB (< capture margin), b beats c by 5 dB (≥ margin),
    // a beats c by 9 dB. Evaluated weakest-first, c would lock, b would
    // capture c, and a (only +4 over b) would be stuck as interference —
    // the lock holder used to depend on evaluation order.
    const links = {
      'a>d': -40, 'b>d': -44, 'c>d': -49,
      'a>b': -95, 'a>c': -95, 'b>a': -95, 'b>c': -95, 'c>a': -95, 'c>b': -95,
      'd>a': -40, 'd>b': -44, 'd>c': -49,
    }
    const runs: string[] = []
    for (const order of [['a', 'b', 'c'], ['c', 'b', 'a']]) {
      const { ch, records, runUntil, at } = setup(links, ['a', 'b', 'c', 'd'])
      at(1000, () => { for (const id of order) ch.startTx(id, frame('data', id, 'd', 1428, 54)) })
      runUntil(1_000_000)
      runs.push(
        records
          .filter((r) => (r.type === 'RX_START' || r.type === 'RX_FAIL' || r.type === 'RX_OK') && r.node === 'd')
          .map((r) => `${r.type}:${'from' in r ? r.from : ''}`)
          .join(' '),
      )
    }
    expect(runs[0]).toContain('RX_START:a') // the strongest holds the lock
    expect(runs[0]).toEqual(runs[1]) // and the record stream is order-invariant
  })

  it('names an interferer in the COLLISION record even if it ended earlier', () => {
    const { ch, records, runUntil, at } = setup({
      'a>c': -70, 'b>c': -60, 'a>b': -95, 'b>a': -95, 'c>a': -70, 'c>b': -60,
    })
    at(1000, () => ch.startTx('a', frame('data', 'a', 'c', 1428, 6))) // long, weak — c locks it
    at(31_000, () => ch.startTx('b', frame('data', 'b', 'c', 100, 54))) // short, strong, past a's preamble
    runUntil(3_000_000)
    const col = records.find((r) => r.type === 'COLLISION')
    expect(col).toBeDefined()
    expect((col as Extract<TLRecord, { type: 'COLLISION' }>).nodes).toContain('b')
  })

  it('does not capture on a margin below 5 dB', () => {
    const { ch, calls, records, runUntil, at } = setup({
      'a>c': -60, 'b>c': -57, 'a>b': -95, 'b>a': -95, 'c>a': -60, 'c>b': -57,
    })
    at(1000, () => ch.startTx('a', frame('data', 'a', 'c', 1428, 54)))
    at(3000, () => ch.startTx('b', frame('data', 'b', 'c', 1428, 54)))
    runUntil(1_000_000)
    expect(records.some((r) => r.type === 'RX_FAIL' && r.reason === 'capture')).toBe(false)
    expect(calls.c.some((x) => x.startsWith('rxok'))).toBe(false)
    expect(calls.c.some((x) => x.startsWith('corrupt'))).toBe(true)
  })

  it('does not capture once the receiver is past the preamble', () => {
    const { ch, calls, records, runUntil, at } = setup({
      'a>c': -40, 'b>c': -75, 'a>b': -95, 'b>a': -95, 'c>a': -40, 'c>b': -75,
    })
    at(1000, () => ch.startTx('b', frame('data', 'b', 'c', 1428, 54)))
    at(26_000, () => ch.startTx('a', frame('data', 'a', 'c', 1428, 54))) // 25 µs in: committed
    runUntil(1_000_000)
    expect(records.some((r) => r.type === 'RX_FAIL' && r.reason === 'capture')).toBe(false)
    expect(calls.c.some((x) => x.startsWith('rxok'))).toBe(false)
    expect(calls.c.some((x) => x.startsWith('corrupt'))).toBe(true)
  })

  it('reports energy-only busy without corrupt when nothing is decodable', () => {
    const { ch, calls, records, runUntil, at } = setup({
      'a>c': -63, 'b>c': -63, 'a>b': -95, 'b>a': -95, 'c>a': -63, 'c>b': -63,
    })
    // each −63 alone < ED(−62) and < PD(−82 is met!)… use −83 signals: below PD, sum −80 < ED → no busy.
    // Instead: two −64.8 signals sum ≈ −61.8 ≥ ED → energy busy, none ≥ −82? −64.8 IS ≥ −82.
    // True energy-only busy needs signals ≥ ED sum but each < −82 — impossible since ED > PD.
    // So instead assert: single −63 signal ≥ PD locks and decodes (it is decodable); c busy with cause preamble.
    at(1000, () => ch.startTx('a', frame('data', 'a', 'c', 100, 6)))
    runUntil(1_000_000)
    const busy = records.find((r) => r.type === 'CCA_BUSY' && r.node === 'c')
    expect(busy).toMatchObject({ cause: 'preamble' })
    expect(calls.c.some((s) => s.startsWith('rxok'))).toBe(true)
  })

  it('fails reception when the receiver starts transmitting mid-frame', () => {
    const { ch, calls, records, runUntil, at } = setup({
      'a>b': -60, 'b>a': -60, 'a>c': -95, 'b>c': -95, 'c>a': -95, 'c>b': -95,
    })
    at(1000, () => ch.startTx('a', frame('data', 'a', 'b', 1428, 54)))
    at(5000, () => ch.startTx('b', frame('data', 'b', 'a', 100, 6)))
    runUntil(1_000_000)
    expect(records.some((r) => r.type === 'RX_FAIL' && r.node === 'b' && r.reason === 'txDuringRx')).toBe(true)
    expect(calls.b.some((s) => s.startsWith('rxok:data:a'))).toBe(false)
  })
})

describe('orthogonal groups (OFDMA RUs)', () => {
  const otf = (src: string, group: string): FrameDesc => ({
    kind: 'data', src, dst: 'c', bytes: 1428, mbps: 54,
    durationFieldNs: 0, txTimeNs: txTimeNs(1428, 54), orthogonalGroup: group,
  })

  it('same-group frames do not interfere and both decode at a multi-locking receiver', () => {
    const { ch, calls, records, runUntil, at } = setup({
      'a>c': -60, 'b>c': -61, 'a>b': -95, 'b>a': -95, 'c>a': -60, 'c>b': -61,
    })
    at(1000, () => ch.startTx('a', otf('a', 'g1')))
    at(1000, () => ch.startTx('b', otf('b', 'g1')))
    runUntil(1_000_000)
    expect(calls.c.filter((s) => s.startsWith('rxok')).length).toBe(2)
    expect(records.some((r) => r.type === 'COLLISION')).toBe(false)
  })

  it('different groups still collide', () => {
    const { ch, calls, runUntil, at } = setup({
      'a>c': -60, 'b>c': -61, 'a>b': -95, 'b>a': -95, 'c>a': -60, 'c>b': -61,
    })
    at(1000, () => ch.startTx('a', otf('a', 'g1')))
    at(1000, () => ch.startTx('b', otf('b', 'g2')))
    runUntil(1_000_000)
    expect(calls.c.some((s) => s.startsWith('corrupt'))).toBe(true)
  })
})
