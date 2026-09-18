import { describe, it, expect } from 'vitest'
import { Channel, type PhyListener } from '../../src/engine/channel'
import { EventQueue } from '../../src/engine/events'
import { Rng } from '../../src/engine/rng'
import { AmpStaMac } from '../../src/engine/ampSta'
import { AMP_SIFS_NS, ampAckFrame, ampTriggerFrame } from '../../src/engine/amp'
import { makeEmitter, type TLRecord } from '../../src/model/records'
import type { FrameDesc } from '../../src/model/frames'

function bench(tagIds: string[], seed = 7, links: Record<string, number> = {}) {
  const q = new EventQueue()
  let now = 0
  const ids = ['ap', ...tagIds]
  const table = new Map(ids.map((tx) => [tx, new Map(ids.filter((rx) => rx !== tx).map((rx) => [rx, links[`${tx}>${rx}`] ?? -50]))]))
  const records: TLRecord[] = []
  const emit = makeEmitter((r) => records.push(r))
  const ch = new Channel(q, () => now, table, emit)
  const apHeard: { t: number; from: string; frame: FrameDesc }[] = []
  const ap: PhyListener = { onCcaBusy() {}, onCcaIdle() {}, onRxStart() {}, onRxOk(t, frame, from) { apHeard.push({ t, from, frame }) }, onRxCorrupt() {} }
  ch.register('ap', ap, { ampCapable: true })
  const root = new Rng(seed)
  const tags = tagIds.map((id, i) => { const m = new AmpStaMac(id, q, () => now, ch, root.fork(i + 1), emit, { apId: 'ap', id16: 100 + i }); ch.register(id, m, { kind: 'tag', cca: false }); return m })
  const run = (t: number) => { for (;;) { const pt = q.peekTime(); if (pt === null || pt > t) break; const e = q.pop()!; now = e.t; e.fn() } now = t }
  const at = (t: number, fn: () => void) => q.schedule(t, fn)
  const send = (t: number, f: FrameDesc) => at(t, () => ch.startTx('ap', f))
  const trig = (slots = 4, acwe = 2, phase: 'random' | 'scheduled' = 'random', staIds: string[] = []) =>
    ampTriggerFrame({ src: 'ap', dlKbps: 250, ulKbps: 250, phase, slots, slotNs: 272_000, acwe, sessionId: 1, staIds, reading: false, roundNs: 4 * (272_000 + 2 * AMP_SIFS_NS + 330_000), signalExtNs: 6_000 })
  const ack = (dst: string, slot: number) => ampAckFrame('ap', dst, 250, slot, 6_000)
  const recs = <K extends TLRecord['type']>(type: K, node?: string) => records.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type && (node === undefined || (r as { node?: string }).node === node))
  return { q, ch, records, apHeard, tags, run, at, send, trig, ack, recs }
}

describe('AmpStaMac (PDT 39.4 UL channel access)', () => {
  it('draws ABOC in [0, ACW], transmits in slot ABOC+1 or sits out', () => {
    const b = bench(['t1', 't2', 't3', 't4', 't5', 't6'])
    b.send(0, b.trig(4, 2))
    b.run(700_000)
    const draws = b.recs('AMP_ABOC')
    expect(draws.length).toBe(6)
    for (const d of draws) {
      expect(d.acw).toBe(3)
      expect(d.aboc).toBeGreaterThanOrEqual(0)
      expect(d.aboc).toBeLessThanOrEqual(3)
      expect(d.slot).toBe(d.aboc < 4 ? d.aboc + 1 : null)
    }
    const trigEnd = b.recs('TX_END', 'ap')[0].t
    const slot1 = draws.filter((d) => d.slot === 1)
    const tx1 = b.recs('TX_START').filter((r) => r.frame.kind === 'ampResp')
    expect(tx1.map((r) => r.node).sort()).toEqual(slot1.map((d) => d.node).sort())
    for (const r of tx1) expect(r.t).toBe(trigEnd + AMP_SIFS_NS)
    expect(draws.every((d) => d.aboc <= d.acw)).toBe(true)
  })
  it('is deterministic per seed', () => {
    const a = bench(['t1', 't2', 't3'], 11); a.send(0, a.trig()); a.run(700_000)
    const c = bench(['t1', 't2', 't3'], 11); c.send(0, c.trig()); c.run(700_000)
    expect(a.recs('AMP_ABOC').map((r) => r.aboc)).toEqual(c.recs('AMP_ABOC').map((r) => r.aboc))
  })
  it('sits out when ABOC ≥ N (ACWE 3, one slot)', () => {
    const b = bench(['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'])
    b.send(0, b.trig(1, 3))
    b.run(700_000)
    const draws = b.recs('AMP_ABOC')
    expect(draws.some((d) => d.slot === null)).toBe(true)
    for (const d of draws) if (d.slot === null) expect(d.aboc).toBeGreaterThanOrEqual(1)
  })
  it('slot k ≥ 2 is keyed to the Ack that closes slot k−1: AMP SIFS after its end', () => {
    // seed chosen so t1 draws slot 2: scan seeds until it does (documented in the test).
    let b = bench(['t1'], 1)
    let seed = 1
    for (; seed < 200; seed++) { b = bench(['t1'], seed); b.send(0, b.trig(4, 2)); b.run(700_000); if (b.recs('AMP_ABOC')[0].slot === 2) break }
    expect(b.recs('AMP_ABOC')[0].slot).toBe(2)
    const trigEnd = b.recs('TX_END', 'ap')[0].t
    expect(b.recs('MAC_STATE', 't1').some((r) => r.state === 'ampWait')).toBe(true)
    // the AP closes slot 1 (nobody was there) with an Ack addressed to itself
    const ackStart = trigEnd + AMP_SIFS_NS + 272_000 + AMP_SIFS_NS
    b.send(ackStart, b.ack('ap', 1))
    b.run(ackStart + 330_000 + AMP_SIFS_NS + 300_000)
    const tx = b.recs('TX_START', 't1').find((r) => r.frame.kind === 'ampResp')!
    expect(tx.t).toBe(ackStart + 330_000 + AMP_SIFS_NS)
    expect(tx.frame.amp).toMatchObject({ slot: 2 })
    // Ack for slot 2 addressed to t1 → acknowledged
    const ack2 = tx.t + 272_000 + AMP_SIFS_NS
    b.send(ack2, b.ack('t1', 2))
    b.run(ack2 + 400_000)
    expect(b.recs('AMP_RESULT', 't1')[0]).toMatchObject({ slot: 2, sent: true, acked: true })
    expect(b.recs('MAC_STATE', 't1').pop()!.state).toBe('idle')
    // hearing the AP's DL PPDUs (the closing Ack, its own Ack) while ampWait
    // never relabels the tag 'rx' — only the trigger itself did that, once.
    expect(b.recs('MAC_STATE', 't1').filter((r) => r.state === 'rx').length).toBe(1)
  })
  it('an Ack for its slot addressed to someone else means the response was lost', () => {
    let b = bench(['t1'], 1)
    for (let seed = 1; seed < 200; seed++) { b = bench(['t1'], seed); b.send(0, b.trig(4, 2)); b.run(700_000); if (b.recs('AMP_ABOC')[0].slot === 1) break }
    const tx = b.recs('TX_START', 't1')[0]
    const ack1 = tx.t + 272_000 + AMP_SIFS_NS
    b.send(ack1, b.ack('ap', 1))
    b.run(ack1 + 400_000)
    expect(b.recs('AMP_RESULT', 't1')[0]).toMatchObject({ slot: 1, sent: true, acked: false })
  })
  it('a scheduled trigger assigns the slot by list position; an unlisted tag stays silent', () => {
    const b = bench(['t1', 't2', 't3'])
    b.send(0, b.trig(2, 0, 'scheduled', ['t2', 't1']))
    // A 2-id scheduled staIds list makes a 17-byte trigger PPDU (746_000 ns at
    // 250 kb/s), so its TX_END and the slot-1 response's TX_START (SIFS
    // later, at 756_000 ns) land after 700_000 ns; widen the run window.
    b.run(900_000)
    const trigEnd = b.recs('TX_END', 'ap')[0].t
    const tx = b.recs('TX_START').filter((r) => r.frame.kind === 'ampResp')
    expect(tx.map((r) => r.node)).toEqual(['t2'])
    expect(tx[0].t).toBe(trigEnd + AMP_SIFS_NS)
    expect(b.recs('AMP_ABOC', 't2')[0]).toMatchObject({ aboc: 0, acw: 0, slot: 1 })
    expect(b.recs('AMP_ABOC', 't1')[0]).toMatchObject({ aboc: 0, acw: 0, slot: 2 })
    expect(b.recs('AMP_ABOC', 't3').length).toBe(0)
    expect(b.recs('TX_START', 't3').length).toBe(0)
  })
  it('a tag that cannot decode the Ack it keys on loses the round', () => {
    let b = bench(['t1'], 1, { 'ap>t1': -50 })
    let seed = 1
    for (; seed < 200; seed++) { b = bench(['t1'], seed); b.send(0, b.trig(4, 2)); b.run(700_000); if (b.recs('AMP_ABOC')[0].slot === 3) break }
    const trigEnd = b.recs('TX_END', 'ap')[0].t
    const ack1 = trigEnd + AMP_SIFS_NS + 272_000 + AMP_SIFS_NS
    b.send(ack1, b.ack('ap', 1))
    // the second Ack is never sent: the round's end timer fires
    b.run(ack1 + 6_000_000)
    expect(b.recs('AMP_RESULT', 't1')[0]).toMatchObject({ slot: 3, sent: false, acked: false })
    expect(b.recs('TX_START', 't1').length).toBe(0)
  })
  it('Wi-Fi frames never trigger a tag', () => {
    const b = bench(['t1'])
    const cts: FrameDesc = { kind: 'cts', src: 'ap', dst: 'ap', bytes: 14, mbps: 6, durationFieldNs: 0, txTimeNs: 50_000 }
    b.send(0, cts)
    b.run(500_000)
    expect(b.recs('AMP_ABOC').length).toBe(0)
    expect(b.recs('TX_START', 't1').length).toBe(0)
  })
  it('a corrupted reception while a round is open (not yet sent) gives up and cancels its pending transmission', () => {
    // seed 1 draws t1 slot 1 (ACWE 2, 4 slots): its response is scheduled at
    // trigEnd + SIFS = 628_000, but never gets there — stop the clock first.
    const b = bench(['t1'], 1)
    b.send(0, b.trig(4, 2))
    b.run(620_000)
    expect(b.recs('AMP_ABOC')[0].slot).toBe(1)
    expect(b.recs('TX_START', 't1').length).toBe(0) // the SIFS-later response has not fired yet
    b.tags[0].onRxCorrupt(0)
    const results = b.recs('AMP_RESULT', 't1')
    expect(results.length).toBe(1)
    expect(results[0]).toMatchObject({ slot: 1, sent: false, acked: false })
    expect(b.recs('MAC_STATE', 't1').pop()!.state).toBe('idle')
    // the round's own scheduled transmitResponse must have been cancelled
    b.run(700_000)
    expect(b.recs('TX_START', 't1').length).toBe(0)
    expect(b.recs('AMP_RESULT', 't1').length).toBe(1)
  })
  it('a new Trigger cancels a still-open round: no stray result from the abandoned timer', () => {
    // seed 3 draws t1 slot 2 (ACWE 2, 4 slots): with no Ack ever sent for
    // slot 1, the round just sits in ampWait on its (far-future) end timer.
    const b = bench(['t1'], 3)
    b.send(0, b.trig(4, 2))
    b.send(620_000, b.trig(4, 2)) // well before the first round's own end timer (t=3_156_000)
    b.run(4_000_000)
    expect(b.recs('AMP_ABOC', 't1')[0].slot).toBe(2)
    expect(b.recs('AMP_ABOC', 't1').length).toBe(2) // the cancelled round's trigger still drew fresh ABOC
    // exactly one result — from the second round's own resolution, never two
    expect(b.recs('AMP_RESULT', 't1').length).toBe(1)
  })
})
