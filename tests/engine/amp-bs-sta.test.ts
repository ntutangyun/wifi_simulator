import { describe, it, expect } from 'vitest'
import {
  AMP_BS_LOSS_DB, AMP_BS_T1_NS, AMP_BS_T2_NS, ampRfidFrame, bstNs, crc16Epc, epcOf, monoLeakDbm,
  readerFloorDbm, type Gen2Cmd, type Gen2Reply,
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
  const cmd = (c: Gen2Cmd, o: { wupMs?: number; q?: number; rn16?: number; dst?: string; reply?: Gen2Reply | null; t3?: number; slot?: number } = {}): FrameDesc =>
    ampRfidFrame({
      src: 'ap', dst: o.dst ?? '*', cmd: c, session: 1, q: o.q, rn16: o.rn16,
      slot: o.slot ?? (slot = c === 'query' || c === 'queryRep' ? slot + 1 : slot),
      ulKbps: 250, wupNs: (o.wupMs ?? 0) * MS,
      bstNs: bstNs(o.reply === undefined ? 'rn16' : o.reply, 250, o.t3),
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

describe('AmpBsStaMac — a tag with no radio', () => {
  it('boots on a WUP it can hear, draws its slot counter and answers slot 0 at AMP-Data end + T1', () => {
    const b = bench({ t1: 0.2 }, 3)
    const dataEnd = b.send(0, b.cmd('query', { wupMs: 1, q: 0 }))
    b.run(3 * MS)
    const boot = b.recs('AMP_BS_BOOT', 't1')
    expect(boot.length).toBe(1)
    expect(boot[0].powered).toBe(true)
    expect(boot[0].t).toBe(dataEnd)
    // 10 dBm charge, free space at 2.44 GHz over 0.2 m: 40.196 + 20·log10(0.2) = 26.2 dB
    expect(boot[0].incidentDbm).toBeCloseTo(10 - (40.196 + 20 * Math.log10(0.2)), 2)

    const counter = b.recs('AMP_BS_COUNTER', 't1')
    expect(counter.length).toBe(1)
    expect(counter[0]).toMatchObject({ counter: 0, q: 0 })

    const tx = b.recs('TX_START', 't1')[0]
    expect(tx.t).toBe(dataEnd + AMP_BS_T1_NS)
    expect(tx.frame.kind).toBe('ampBsReply')
    expect(tx.frame.amp!.bs!.reply).toBe('rn16')
    expect(tx.frame.txTimeNs).toBe(112_000) // 48 µs sync + 64 µs of RN16
    expect(b.heard.map((h) => h.frame.amp!.bs!.reply)).toEqual(['rn16'])
  })

  it('reports the reply’s power at the reader and its margin over the reader’s own floor', () => {
    const b = bench({ t1: 0.2 }, 3)
    b.send(0, b.cmd('query', { wupMs: 1, q: 0 }))
    b.run(3 * MS)
    const rep = b.recs('AMP_BS_REPLY', 't1')[0]
    const pl = 40.196 + 20 * Math.log10(0.2)
    expect(rep.rxDbmAtAp).toBeCloseTo(0 - 2 * pl - AMP_BS_LOSS_DB, 2)
    expect(rep.snrDb).toBeCloseTo(rep.rxDbmAtAp - readerFloorDbm(monoLeakDbm(0)), 6)
    expect(rep.kind).toBe('rn16')
    expect(rep.slot).toBe(1)
  })

  it('counts down on QueryRep and answers in the slot it drew, not before', () => {
    const b = bench({ t1: 0.2 }, 3)
    let t = 0
    const q = b.cmd('query', { wupMs: 1, q: 2 })
    b.send(t, q)
    t += q.txTimeNs + AMP_BS_T2_NS
    const reps: number[] = []
    for (let i = 0; i < 3; i++) {
      const f = b.cmd('queryRep')
      b.send(t, f)
      reps.push(t)
      t += f.txTimeNs + AMP_BS_T2_NS
    }
    b.run(t + 3 * MS)
    const drawn = b.recs('AMP_BS_COUNTER', 't1')[0].counter
    const tx = b.recs('TX_START', 't1')
    expect(tx.length).toBe(1)
    // counter c means: answer in the (c+1)-th slot — the Query itself is slot 1.
    const opened = drawn === 0 ? 0 : reps[drawn - 1]
    const ppdu = drawn === 0 ? q : b.records.find((r) => r.type === 'TX_START' && r.t === opened)!
    expect(ppdu).toBeDefined()
    expect(tx[0].frame.amp!.bs!.slot).toBe(drawn + 1)
    // …and the tag is in `bsWait` from the draw until the slot it chose opens
    if (drawn > 0) {
      expect(b.recs('MAC_STATE', 't1').some((s) => s.state === 'bsWait')).toBe(true)
    }
  })

  it('ACK → EPC → Read: the EPC reply carries the tag’s own EPC and sets the session flag', () => {
    const b = bench({ t1: 0.2 }, 3)
    let t = 0
    const q = b.cmd('query', { wupMs: 1, q: 0 })
    b.send(t, q)
    t += q.txTimeNs + AMP_BS_T2_NS
    b.run(t)
    const rn16 = b.heard[0].frame.amp!.bs!.rn16!
    const ack = b.cmd('ack', { rn16, dst: 't1', reply: 'epc' })
    const ackEnd = b.send(t, ack)
    t += ack.txTimeNs + AMP_BS_T2_NS
    b.run(t)
    expect(b.heard[1].frame.amp!.bs).toMatchObject({ reply: 'epc', epc: epcOf('t1') })
    expect(b.records.find((r) => r.type === 'TX_START' && r.node === 't1' && r.t === ackEnd + AMP_BS_T1_NS)).toBeDefined()

    const read = b.cmd('read', { rn16, dst: 't1', reply: 'read' })
    const readEnd = b.send(t, read)
    t += read.txTimeNs + AMP_BS_T2_NS
    b.run(t)
    expect(b.heard[2].frame.amp!.bs!.reply).toBe('read')
    expect(b.heard[2].t).toBeGreaterThan(readEnd)

    // A second Query in the same session finds the tag inventoried: it stays silent.
    const again = b.cmd('query', { wupMs: 1, q: 0 })
    b.send(t, again)
    b.run(t + again.txTimeNs + 3 * MS)
    expect(b.recs('AMP_BS_COUNTER', 't1').length).toBe(1)
    expect(b.heard.length).toBe(3)
  })

  it('ignores an ACK carrying somebody else’s RN16', () => {
    const b = bench({ t1: 0.2 }, 3)
    let t = 0
    const q = b.cmd('query', { wupMs: 1, q: 0 })
    b.send(t, q)
    t += q.txTimeNs + AMP_BS_T2_NS
    b.run(t)
    const mine = b.heard[0].frame.amp!.bs!.rn16!
    b.send(t, b.cmd('ack', { rn16: (mine ^ 0x5555) & 0xffff, dst: 't1', reply: 'epc' }))
    b.run(t + 3 * MS)
    expect(b.heard.length).toBe(1)
  })

  it('a tag out of activation range hears nothing and emits nothing', () => {
    const b = bench({ near: 0.2, far: 0.35 }, 3)
    b.send(0, b.cmd('query', { wupMs: 1, q: 0 }))
    b.run(3 * MS)
    expect(b.recs('AMP_BS_BOOT', 'near').length).toBe(1)
    expect(b.recs('AMP_BS_BOOT', 'far')).toEqual([])
    expect(b.recs('AMP_BS_COUNTER', 'far')).toEqual([])
    expect(b.recs('RX_OK', 'far')).toEqual([])
  })

  it('an unpowered tag cannot act on a command that carries no wake-up preamble', () => {
    const b = bench({ t1: 0.2 }, 3)
    b.send(0, b.cmd('queryRep'))
    b.run(3 * MS)
    const boot = b.recs('AMP_BS_BOOT', 't1')
    expect(boot.length).toBe(1)
    expect(boot[0].powered).toBe(false)
    expect(b.recs('AMP_BS_COUNTER', 't1')).toEqual([])
    expect(b.recs('TX_START', 't1')).toEqual([])
    // …and it says so once, not once per command it cannot use
    b.send(3 * MS, b.cmd('queryRep'))
    b.run(7 * MS)
    expect(b.recs('AMP_BS_BOOT', 't1').length).toBe(1)
  })

  it('falls unpowered when the carrier stops for longer than T2 + 8 µs, and re-boots on the next WUP', () => {
    const b = bench({ t1: 0.2 }, 3)
    const q1 = b.cmd('query', { wupMs: 1, q: 2 })
    const end = 0 + q1.txTimeNs
    b.send(0, q1)
    b.run(end + AMP_BS_POWER_HOLD_NS + 1000)
    expect(b.recs('MAC_STATE', 't1').pop()!.state).toBe('idle')
    // a QueryRep arriving after the gap finds an unpowered tag …
    b.send(end + AMP_BS_POWER_HOLD_NS + 2000, b.cmd('queryRep'))
    b.run(end + 5 * MS)
    expect(b.recs('AMP_BS_BOOT', 't1').map((r) => r.powered)).toEqual([true, false])
    // … and the counter it drew survives the power cut (11-25/0061r0's "Extend", model)
    // Replayed from the tag's own stream, forked the way the bench forks it: the counter is the
    // same one it drew before the power cut, and it is still the only one it ever drew.
    const drawn = b.recs('AMP_BS_COUNTER', 't1')[0].counter
    expect(drawn).toBe(new Rng(3).fork(1).int(3))
    expect(b.recs('AMP_BS_COUNTER', 't1').length).toBe(1)
  })

  it('stays powered across a whole TXOP: consecutive PPDUs are exactly T2 apart', () => {
    const b = bench({ t1: 0.2 }, 3)
    let t = 0
    const q1 = b.cmd('query', { wupMs: 1, q: 2 })
    b.send(t, q1)
    t += q1.txTimeNs + AMP_BS_T2_NS
    for (let i = 0; i < 3; i++) {
      const f = b.cmd('queryRep')
      b.send(t, f)
      t += f.txTimeNs + AMP_BS_T2_NS
    }
    b.run(t + MS)
    expect(b.recs('AMP_BS_BOOT', 't1').map((r) => r.powered)).toEqual([true])
    expect(AMP_BS_POWER_HOLD_NS).toBeGreaterThan(AMP_BS_T2_NS)
  })

  it('a Wi-Fi frame across the BST-Excitation destroys the reflection', () => {
    // The end-to-end coexistence test shows a deferring station can never *get* into a BST
    // window; this is what happens to a reply if one does, which is the spec's `none` variant.
    const clean = bench({ t1: 0.2 }, 3)
    clean.send(0, clean.cmd('query', { wupMs: 1, q: 0 }))
    clean.run(3 * MS)
    expect(clean.heard.length).toBe(1)

    const b = bench({ t1: 0.2 }, 3)
    const q = b.cmd('query', { wupMs: 1, q: 0 })
    const dataEnd = b.send(0, q)
    // A Wi-Fi station a metre from the reader, on the air right through the reply.
    b.wifi('cam', dataEnd + AMP_BS_T1_NS - 4_000, 200_000)
    b.run(3 * MS)
    expect(b.recs('TX_START', 't1').length).toBe(1) // the tag still answers
    expect(b.heard.length).toBe(0) // the reader gets nothing out of it
  })

  it('the tag’s on-air identity is the CRC-16 of its EPC', () => {
    expect(crc16Epc(epcOf('t1'))).toBeGreaterThan(0)
    expect(crc16Epc(epcOf('t1'))).not.toBe(crc16Epc(epcOf('t2')))
  })
})
