import { describe, it, expect } from 'vitest'
import {
  AMP_BS_LOSS_DB, AMP_BS_T1_NS, AMP_BS_T2_NS, ampRfidFrame, bstNs, crc16Epc, epcOf, monoLeakDbm,
  readerFloorDbm, type BsCmd, type BsReply,
} from '../../src/engine/ampBs'
import { AmpBsStaMac, AMP_BS_POWER_HOLD_NS } from '../../src/engine/ampBsSta'
import { Channel, type PhyListener } from '../../src/engine/channel'
import { EventQueue } from '../../src/engine/events'
import { Rng } from '../../src/engine/rng'
import type { FrameDesc } from '../../src/model/frames'
import { makeEmitter, type TLRecord } from '../../src/model/records'

const MS = 1_000_000
const AP = { x: 0, y: 0, z: 0 }

/**
 * One reader and N tags at stated distances, with no MAC at the reader at all: the test drives
 * the downlink PPDUs by hand, so the tag's own rules are what is under test.
 */
function bench(tags: Record<string, number>, seed = 7) {
  const q = new EventQueue()
  let now = 0
  const ids = ['ap', ...Object.keys(tags)]
  const pos: Record<string, { x: number; y: number; z: number }> = { ap: AP }
  for (const [id, d] of Object.entries(tags)) pos[id] = { x: d, y: 0, z: 0 }
  // The Wi-Fi link table is irrelevant to a backscatter radio (it reads the geometry), but the
  // channel still wants a row per node.
  const table = new Map(ids.map((tx) => [tx, new Map(ids.filter((rx) => rx !== tx).map((rx) => [rx, -50]))]))
  const records: TLRecord[] = []
  const emit = makeEmitter((r) => records.push(r))
  const ch = new Channel(q, () => now, table, emit, undefined, { posOf: (id) => pos[id], walls: [], txPowerOf: () => 20 })
  const heard: { t: number; from: string; frame: FrameDesc }[] = []
  const ap: PhyListener = {
    onCcaBusy() {}, onCcaIdle() {}, onRxStart() {}, onRxCorrupt() {},
    onRxOk(t, frame, from) { heard.push({ t, from, frame }) },
  }
  ch.register('ap', ap, { ampCapable: true })
  const root = new Rng(seed)
  const macs: Record<string, AmpBsStaMac> = {}
  Object.keys(tags).forEach((id, i) => {
    const m = new AmpBsStaMac(id, q, () => now, ch, root.fork(i + 1), emit, { apId: 'ap', epc: epcOf(id) })
    ch.register(id, m, { kind: 'bsTag', cca: false })
    macs[id] = m
  })
  const run = (t: number) => {
    for (;;) { const pt = q.peekTime(); if (pt === null || pt > t) break; const e = q.pop()!; now = e.t; e.fn() }
    now = t
  }
  let slot = 0
  const cmd = (c: BsCmd, o: { wupMs?: number; acwe?: number; dst?: string; epc?: string; reply?: BsReply | null; slot?: number } = {}): FrameDesc =>
    ampRfidFrame({
      src: 'ap', dst: o.dst ?? '*tags', cmd: c, session: 1, acwe: c === 'trigger' ? (o.acwe ?? 0) : undefined,
      epc: o.epc, slot: o.slot ?? (slot = c === 'trigger' ? slot + 1 : slot),
      ulKbps: 250, wupNs: (o.wupMs ?? 0) * MS,
      bstNs: bstNs(o.reply === undefined ? (c === 'trigger' ? 'id' : 'read') : o.reply, 250),
      chargeDbm: 10, bsDbm: 0, signalExtNs: 6_000,
    })
  /** Send `f` at `at` and return the instant its AMP-Data ends (where the tag decodes it). */
  const send = (at: number, f: FrameDesc): number => {
    q.schedule(at, () => ch.startTx('ap', f))
    return at + 32_000 + (f.amp!.rfid!.wupNs) + 16_000 + (f.bytes * 8 * 4_000)
  }
  const recs = <K extends TLRecord['type']>(type: K, node?: string) =>
    records.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type && (node === undefined || (r as { node?: string }).node === node))
  /** Put an ordinary Wi-Fi station on the air at `at` for `durNs`, a metre from the reader. */
  const wifi = (id: string, at: number, durNs: number) => {
    pos[id] = { x: 1, y: 0, z: 0 }
    table.set(id, new Map(ids.map((rx) => [rx, -40])))
    for (const row of table.values()) row.set(id, -40)
    const silent: PhyListener = { onCcaBusy() {}, onCcaIdle() {}, onRxStart() {}, onRxOk() {}, onRxCorrupt() {} }
    ch.register(id, silent)
    q.schedule(at, () => ch.startTx(id, {
      kind: 'data', src: id, dst: 'ap', bytes: 1000, mbps: 54, durationFieldNs: 0, txTimeNs: durNs,
    }))
  }
  return { q, ch, records, heard, macs, run, cmd, send, recs, wifi, pos }
}

/**
 * 2026-11-11 (W7b): the tag of PDT 11-26/1519r5 §39.3.3 / 11-26/1889r4 §39.4 — a broadcast AMP
 * Trigger with one slot makes it draw a NEW ABOC in [0, 2^ACWE − 1] and answer (an AMP Response
 * with its ID) only when ABOC is 0; an AMP RFID frame with the UHF Read addressed to its ID makes
 * it reflect the Read reply with its EPC. No slot counter survives a trigger, and nothing is kept
 * across TXOPs. The EPC Gen2 Query/QueryRep/ACK tag of proposal 11-25/0061r0 (not adopted) is gone.
 */
describe('AmpBsStaMac — a tag with no radio', () => {
  it('boots on a WUP it can hear, draws its ABOC and answers ABOC 0 at AMP-Data end + T1 with its ID', () => {
    const b = bench({ t1: 0.2 }, 3)
    const dataEnd = b.send(0, b.cmd('trigger', { wupMs: 1, acwe: 0 }))
    b.run(3 * MS)
    const boot = b.recs('AMP_BS_BOOT', 't1')
    expect(boot.length).toBe(1)
    expect(boot[0].powered).toBe(true)
    expect(boot[0].t).toBe(dataEnd)
    // 10 dBm charge, free space at 2.44 GHz over 0.2 m: 40.196 + 20·log10(0.2) = 26.2 dB
    expect(boot[0].incidentDbm).toBeCloseTo(10 - (40.196 + 20 * Math.log10(0.2)), 2)

    // §39.4: ABOC in [0, ACW], ACW = 2^ACWE − 1 = 0; a single slot (§39.3.3), so ABOC 0 answers.
    const aboc = b.recs('AMP_ABOC', 't1')
    expect(aboc.length).toBe(1)
    expect(aboc[0]).toMatchObject({ aboc: 0, acw: 0, slot: 1 })

    const tx = b.recs('TX_START', 't1')[0]
    expect(tx.t).toBe(dataEnd + AMP_BS_T1_NS)
    expect(tx.frame.kind).toBe('ampBsReply')
    expect(tx.frame.amp!.bs!.reply).toBe('id')
    expect(tx.frame.bytes).toBe(7)
    expect(tx.frame.txTimeNs).toBe(272_000) // 48 µs sync + 7 octets × 32 µs
    expect(b.heard.map((h) => h.frame.amp!.bs!.reply)).toEqual(['id'])
  })

  it('reports the reply’s power at the reader and its margin over the reader’s own floor', () => {
    const b = bench({ t1: 0.2 }, 3)
    b.send(0, b.cmd('trigger', { wupMs: 1, acwe: 0 }))
    b.run(3 * MS)
    const rep = b.recs('AMP_BS_REPLY', 't1')[0]
    const pl = 40.196 + 20 * Math.log10(0.2)
    expect(rep.rxDbmAtAp).toBeCloseTo(0 - 2 * pl - AMP_BS_LOSS_DB, 2)
    expect(rep.snrDb).toBeCloseTo(rep.rxDbmAtAp - readerFloorDbm(monoLeakDbm(0)), 6)
    expect(rep.kind).toBe('id')
    expect(rep.slot).toBe(1)
  })

  it('draws a fresh ABOC on every trigger and answers exactly the triggers it drew 0 for (§39.4)', () => {
    const b = bench({ t1: 0.2 }, 3)
    let t = 0
    const n = 12
    for (let i = 0; i < n; i++) {
      const f = b.cmd('trigger', { wupMs: i === 0 ? 1 : 0, acwe: 2 })
      b.send(t, f)
      t += f.txTimeNs + AMP_BS_T2_NS
    }
    b.run(t + MS)
    const abocs = b.recs('AMP_ABOC', 't1')
    expect(abocs.length).toBe(n)
    // Replayed from the tag's own stream, forked the way the bench forks it: one draw per trigger.
    const rng = new Rng(3).fork(1)
    expect(abocs.map((r) => r.aboc)).toEqual(Array.from({ length: n }, () => rng.int(3)))
    for (const r of abocs) expect(r.slot).toBe(r.aboc === 0 ? 1 : null)
    const replies = b.recs('TX_START', 't1').map((r) => r.frame.amp!.bs!.slot)
    expect(replies).toEqual(abocs.map((r, i) => (r.aboc === 0 ? i + 1 : null)).filter((x) => x !== null))
    expect(replies.length).toBeGreaterThan(0)
    // The tag never sits in a multi-slot countdown any more: between frames it is idle.
    expect(new Set(b.recs('MAC_STATE', 't1').map((s) => s.state))).toEqual(new Set(['rx', 'tx', 'idle']))
  })

  it('Read → its EPC: an AMP RFID frame addressed to its ID gets the Read reply, the other tag stays silent', () => {
    const b = bench({ t1: 0.2, t2: 0.2 }, 3)
    let t = 0
    const rd = b.cmd('read', { wupMs: 1, dst: 't1', epc: epcOf('t1') })
    const rdEnd = b.send(t, rd)
    t += rd.txTimeNs + AMP_BS_T2_NS
    b.run(t)
    expect(b.heard.length).toBe(1)
    expect(b.heard[0].from).toBe('t1')
    expect(b.heard[0].frame.amp!.bs).toMatchObject({ reply: 'read', epc: epcOf('t1') })
    expect(b.heard[0].frame.bytes).toBe(23)
    expect(b.records.find((r) => r.type === 'TX_START' && r.node === 't1' && r.t === rdEnd + AMP_BS_T1_NS)).toBeDefined()
    expect(b.recs('TX_START', 't2')).toEqual([])
  })

  it('a tag out of activation range hears nothing and emits nothing', () => {
    const b = bench({ near: 0.2, far: 0.35 }, 3)
    b.send(0, b.cmd('trigger', { wupMs: 1, acwe: 0 }))
    b.run(3 * MS)
    expect(b.recs('AMP_BS_BOOT', 'near').length).toBe(1)
    expect(b.recs('AMP_BS_BOOT', 'far')).toEqual([])
    expect(b.recs('AMP_ABOC', 'far')).toEqual([])
    expect(b.recs('RX_OK', 'far')).toEqual([])
  })

  it('an unpowered tag cannot act on a frame that carries no wake-up preamble', () => {
    const b = bench({ t1: 0.2 }, 3)
    b.send(0, b.cmd('trigger', { acwe: 0 }))
    b.run(3 * MS)
    const boot = b.recs('AMP_BS_BOOT', 't1')
    expect(boot.length).toBe(1)
    expect(boot[0].powered).toBe(false)
    expect(b.recs('AMP_ABOC', 't1')).toEqual([])
    expect(b.recs('TX_START', 't1')).toEqual([])
    // …and it says so once, not once per frame it cannot use
    b.send(3 * MS, b.cmd('trigger', { acwe: 0 }))
    b.run(7 * MS)
    expect(b.recs('AMP_BS_BOOT', 't1').length).toBe(1)
  })

  it('falls unpowered when the carrier stops for longer than T2 + 8 µs, and re-boots on the next WUP', () => {
    const b = bench({ t1: 0.2 }, 3)
    const f1 = b.cmd('trigger', { wupMs: 1, acwe: 2 })
    const end = 0 + f1.txTimeNs
    b.send(0, f1)
    b.run(end + AMP_BS_POWER_HOLD_NS + 1000)
    expect(b.recs('MAC_STATE', 't1').pop()!.state).toBe('idle')
    // a trigger arriving after the gap, with no WUP, finds an unpowered tag …
    b.send(end + AMP_BS_POWER_HOLD_NS + 2000, b.cmd('trigger', { acwe: 2 }))
    b.run(end + 5 * MS)
    expect(b.recs('AMP_BS_BOOT', 't1').map((r) => r.powered)).toEqual([true, false])
    expect(b.recs('AMP_ABOC', 't1').length).toBe(1)
    // … and one with a WUP boots it again
    b.send(end + 5 * MS, b.cmd('trigger', { wupMs: 1, acwe: 2 }))
    b.run(end + 9 * MS)
    expect(b.recs('AMP_BS_BOOT', 't1').map((r) => r.powered)).toEqual([true, false, true])
  })

  it('stays powered across a whole TXOP: consecutive PPDUs are exactly T2 apart', () => {
    const b = bench({ t1: 0.2 }, 3)
    let t = 0
    for (let i = 0; i < 4; i++) {
      const f = b.cmd('trigger', { wupMs: i === 0 ? 1 : 0, acwe: 2 })
      b.send(t, f)
      t += f.txTimeNs + AMP_BS_T2_NS
    }
    b.run(t + MS)
    expect(b.recs('AMP_BS_BOOT', 't1').map((r) => r.powered)).toEqual([true])
    expect(b.recs('AMP_ABOC', 't1').length).toBe(4)
    expect(AMP_BS_POWER_HOLD_NS).toBeGreaterThan(AMP_BS_T2_NS)
  })

  it('a Wi-Fi frame across the BST-Excitation destroys the reflection', () => {
    const clean = bench({ t1: 0.2 }, 3)
    clean.send(0, clean.cmd('trigger', { wupMs: 1, acwe: 0 }))
    clean.run(3 * MS)
    expect(clean.heard.length).toBe(1)

    const b = bench({ t1: 0.2 }, 3)
    const dataEnd = b.send(0, b.cmd('trigger', { wupMs: 1, acwe: 0 }))
    // A Wi-Fi station a metre from the reader, on the air right through the reply.
    b.wifi('cam', dataEnd + AMP_BS_T1_NS - 4_000, 400_000)
    b.run(3 * MS)
    expect(b.recs('TX_START', 't1').length).toBe(1) // the tag still answers
    expect(b.heard.length).toBe(0) // the reader gets nothing out of it
  })

  it('the tag’s on-air identity is the CRC-16 of its EPC', () => {
    expect(crc16Epc(epcOf('t1'))).toBeGreaterThan(0)
    expect(crc16Epc(epcOf('t1'))).not.toBe(crc16Epc(epcOf('t2')))
  })
})
