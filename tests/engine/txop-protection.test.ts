import { describe, it, expect } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { Simulation } from '../../src/engine/simulation'
import { ACK_BYTES, BA_BYTES, CTS_BYTES, RTS_BYTES, SIFS_NS, ctrlRespRateFor, txTimeNs } from '../../src/engine/phy'
import { defaultFeatures } from '../../src/model/caps'
import type { FrameDesc } from '../../src/model/frames'
import type { Scenario, TxopProtection } from '../../src/model/scenario'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { makeBss } from './helpers'

const MS = 1_000_000
type Rec<K extends TLRecord['type']> = Extract<TLRecord, { type: K }>
const isTx = (r: TLRecord): r is Rec<'TX_START'> => r.type === 'TX_START'
const respNs = (f: FrameDesc): number =>
  txTimeNs(f.ampdu !== undefined ? BA_BYTES : ACK_BYTES, ctrlRespRateFor(f.mbps))

/**
 * Lesson 5's hallway: A and B cannot hear each other, both hear the AP.
 * Here they are Wi-Fi 5 uploaders, so each channel win becomes a TXOP of several exchanges.
 * 2026-11-11 (W7a): rewritten for IEEE Std 802.11-2024 §9.2.5.2, which defines exactly two
 * classes of Duration setting — single and multiple protection. The engine's third policy,
 * 'boundary', was not one of them and is gone.
 */
function hallway(prot: TxopProtection, seed = 7): Scenario {
  const sc = LESSONS.find((l) => l.id === 'hidden')!.scenario()
  for (const n of sc.nodes) {
    if (n.kind !== 'sta') continue
    // no A-MPDU: each 1500 B frame is its own exchange, so a TXOP chains several of them
    n.caps = { generation: 'vht', features: { ...defaultFeatures('vht'), ampdu: false } }
    n.txopProtection = prot
  }
  // RTS threshold below the frame size (lesson 10's setting), so every TXOP opens with RTS/CTS.
  return { ...sc, seed, rtsThresholdBytes: 500 }
}

/** The data frames sta-1 sent, each with the record of the response that answered it, grouped by TXOP. */
function txops(recs: readonly TLRecord[]): Rec<'TX_START'>[][] {
  const out: Rec<'TX_START'>[][] = []
  let cur: Rec<'TX_START'>[] | null = null
  for (const r of recs) {
    if (r.type === 'TXOP_START' && r.node === 'sta-1') { cur = []; out.push(cur) }
    if (r.type === 'TXOP_END' && r.node === 'sta-1') cur = null
    if (cur && isTx(r) && r.node === 'sta-1' && r.frame.kind === 'data') cur.push(r)
  }
  return out
}

describe('single protection (§9.2.5.2 a)), 2026-11-11', () => {
  const recs = new Simulation(hallway('single')).runUntil(300 * MS).records
  const tx = recs.filter(isTx)

  it('the RTS covers the pending frame, one CTS, one Ack and three SIFS (a)1))', () => {
    const cts = (rts: Rec<'TX_START'>) => txTimeNs(CTS_BYTES, ctrlRespRateFor(rts.frame.mbps))
    // the data frame a SIFS after the CTS that answered this RTS
    const dataAfter = (rts: Rec<'TX_START'>) => tx.find((r) => r.node === 'sta-1' && r.frame.kind === 'data'
      && r.t === rts.t + rts.frame.txTimeNs + 2 * SIFS_NS + cts(rts))
    const answered = tx.filter((r) => r.node === 'sta-1' && r.frame.kind === 'rts' && dataAfter(r) !== undefined)
    expect(answered.length).toBeGreaterThan(5)
    for (const rts of answered) {
      const data = dataAfter(rts)!
      expect(rts.frame.durationFieldNs).toBe(3 * SIFS_NS + cts(rts) + data.frame.txTimeNs + respNs(data.frame))
    }
  })

  it('a non-final data frame also covers the following frame and its response (a)8) ii)); the final one only its Ack (a)8) i))', () => {
    // "Final" is the holder's estimate when it builds the frame, from what its queue holds: a
    // frame that arrives during the exchange may still follow it inside the TXOP limit.
    let nonFinal = 0
    let final = 0
    for (const burst of txops(recs)) {
      burst.forEach((d, i) => {
        const next = burst[i + 1]
        const own = SIFS_NS + respNs(d.frame)
        if (d.frame.durationFieldNs === own) {
          final++
          return
        }
        // Announced as non-final: unless this exchange failed (which ends the TXOP, §10.23.2.2),
        // the following frame went out a SIFS after this Ack, as announced.
        if (next === undefined) {
          if (d.t + d.frame.txTimeNs + d.frame.durationFieldNs > 299 * MS) return // cut off by the run's end
          expect(recs.some((r) => r.type === 'ACK_TIMEOUT' && r.node === 'sta-1' && r.t > d.t && r.t < d.t + d.frame.durationFieldNs + d.frame.txTimeNs),
            `the TXOP announced past ${d.t} ended only because that exchange failed`).toBe(true)
          return
        }
        expect(next.t).toBe(d.t + d.frame.txTimeNs + own + SIFS_NS)
        expect(d.frame.durationFieldNs, `non-final frame at ${d.t}`)
          .toBe(own + SIFS_NS + next.frame.txTimeNs + SIFS_NS + respNs(next.frame))
        nonFinal++
      })
    }
    expect(nonFinal).toBeGreaterThan(10)
    expect(final).toBeGreaterThan(5)
  })

  it('the AP’s Ack carries the data frame’s Duration less SIFS and itself (§9.2.5.6), so B hears the next frame announced', () => {
    let checked = 0
    for (const d of tx.filter((r) => r.node === 'sta-1' && r.frame.kind === 'data')) {
      const ack = tx.find((r) => r.node === 'ap' && r.frame.kind === 'ack' && r.t === d.t + d.frame.txTimeNs + SIFS_NS)
      if (!ack) continue
      expect(ack.frame.durationFieldNs).toBe(Math.max(0, d.frame.durationFieldNs - SIFS_NS - ack.frame.txTimeNs))
      checked++
    }
    expect(checked).toBeGreaterThan(10)
    expect(recs.some((r) => r.type === 'NAV_SET' && r.node === 'sta-2' && r.source.startsWith('ack:'))).toBe(true)
  })
})

describe('multiple protection (§9.2.5.2 b)), 2026-11-11', () => {
  const recs = new Simulation(hallway('multiple')).runUntil(300 * MS).records
  const tx = recs.filter(isTx)
  const txopEnds = recs.filter((r): r is Rec<'TXOP_START'> => r.type === 'TXOP_START' && r.node === 'sta-1')

  it('the RTS, and every data frame after it, reserves to the end of the TXOP (the upper bound of b)3)/b)4))', () => {
    let checked = 0
    for (const r of tx.filter((x) => x.node === 'sta-1' && (x.frame.kind === 'rts' || x.frame.kind === 'data'))) {
      const txop = [...txopEnds].reverse().find((x) => x.t <= r.t)
      if (!txop) continue
      if (recs.some((x) => x.type === 'TXOP_END' && x.node === 'sta-1' && x.t > txop.t && x.t <= r.t)) continue
      expect(r.frame.durationFieldNs, `${r.frame.kind} at ${r.t}`).toBe(txop.untilNs - (r.t + r.frame.txTimeNs))
      checked++
    }
    expect(checked).toBeGreaterThan(20)
  })

  it('the CTS and the Acks repeat that end (§9.2.5.6), and the hidden station B loads it', () => {
    const rts = tx.find((r) => r.node === 'sta-1' && r.frame.kind === 'rts'
      && tx.some((c) => c.node === 'ap' && c.frame.kind === 'cts' && c.t === r.t + r.frame.txTimeNs + SIFS_NS))!
    const cts = tx.find((r) => r.node === 'ap' && r.frame.kind === 'cts' && r.t === rts.t + rts.frame.txTimeNs + SIFS_NS)!
    const ctsTime = txTimeNs(CTS_BYTES, ctrlRespRateFor(rts.frame.mbps))
    expect(cts.frame.durationFieldNs).toBe(rts.frame.durationFieldNs - SIFS_NS - ctsTime)
    const end = rts.t + rts.frame.txTimeNs + rts.frame.durationFieldNs
    expect(cts.t + cts.frame.txTimeNs + cts.frame.durationFieldNs).toBe(end)
    const data = tx.find((r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t === cts.t + cts.frame.txTimeNs + SIFS_NS)!
    const ack = tx.find((r) => r.node === 'ap' && r.frame.kind === 'ack' && r.t === data.t + data.frame.txTimeNs + SIFS_NS)!
    expect(ack.t + ack.frame.txTimeNs + ack.frame.durationFieldNs).toBe(end)
    // B loads every CTS it decodes as a NAV reaching that same end
    let loaded = 0
    for (const c of tx.filter((r) => r.node === 'ap' && r.frame.kind === 'cts' && r.frame.dst === 'sta-1')) {
      const at = c.t + c.frame.txTimeNs
      const nav = recs.find((r): r is Rec<'NAV_SET'> => r.type === 'NAV_SET' && r.node === 'sta-2' && r.t === at && r.source === 'cts:ap')
      if (!nav) continue
      expect(nav.untilNs).toBe(at + c.frame.durationFieldNs)
      loaded++
    }
    expect(loaded).toBeGreaterThan(5)
  })

  it('a TXOP that ends early is truncated with CF-End, which the AP repeats and B obeys (§10.23.2.10)', () => {
    const cf = tx.filter((r) => r.frame.kind === 'cfend')
    expect(cf.length).toBeGreaterThan(0)
    const mine = cf.find((r) => r.node === 'sta-1')!
    const relay = cf.find((r) => r.node === 'ap' && r.t > mine.t)!
    expect(relay.t).toBe(mine.t + mine.frame.txTimeNs + SIFS_NS)
    const relayEnd = relay.t + relay.frame.txTimeNs
    expect(recs.some((r) => r.type === 'NAV_CLEAR' && r.node === 'sta-2' && r.t === relayEnd)).toBe(true)
    expect(recs.some((r) => r.type === 'NAV_SET' && r.source.startsWith('cfend:'))).toBe(false)
  })
})

describe('the two classes and nothing else, 2026-11-11', () => {
  it('a saved scenario that still says "boundary" loads as multiple protection', () => {
    const sc = hallway('single')
    const raw = JSON.parse(JSON.stringify(sc)) as { nodes: { kind: string; txopProtection?: string }[] }
    for (const n of raw.nodes) if (n.kind === 'sta') n.txopProtection = 'boundary'
    const parsed = ScenarioSchema.parse(raw)
    for (const n of parsed.nodes) if (n.kind === 'sta') expect(n.txopProtection).toBe('multiple')
  })
})

describe('CTS response and the saved TXOP holder address (§10.3.2.9, §10.23.2.4), 2026-11-11', () => {
  const NODES = ['ap', 'sta-1', 'sta-2']
  const LINKS = { 'sta-1>ap': -55, 'ap>sta-1': -55, 'sta-2>ap': -55, 'ap>sta-2': -55, 'sta-1>sta-2': -55, 'sta-2>sta-1': -55 }
  const frame = (kind: 'data' | 'rts', src: string, dst: string, durationNs: number): FrameDesc => ({
    kind, src, dst, bytes: kind === 'rts' ? RTS_BYTES : 1528, mbps: 24, durationFieldNs: durationNs, txTimeNs: 100_000,
  })
  const run = (rtsFrom: string) => {
    const b = makeBss(NODES, LINKS)
    // sta-1's data frame to sta-2 sets the AP's NAV for 2 ms; sta-1 is the saved TXOP holder.
    b.at(1_000_000, () => b.macs.ap.onRxOk(1_000_000, frame('data', 'sta-1', 'sta-2', 2 * MS), 'sta-1'))
    b.at(1_200_000, () => b.macs.ap.onRxOk(1_200_000, frame('rts', rtsFrom, 'ap', 500_000), rtsFrom))
    b.runUntil(5 * MS)
    return b.recs('TX_START', 'ap').filter((r) => r.frame.kind === 'cts')
  }

  it('answers an RTS from the TXOP holder although the NAV is set', () => {
    const cts = run('sta-1')
    expect(cts.length).toBe(1)
    expect(cts[0].t).toBe(1_200_000 + SIFS_NS)
  })

  it('does not answer an RTS from anyone else while the NAV is set', () => {
    expect(run('sta-2').length).toBe(0)
  })
})
