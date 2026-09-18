import { describe, it, expect } from 'vitest'
import { Channel, type PhyListener } from '../../src/engine/channel'
import { EventQueue } from '../../src/engine/events'
import { makeEmitter, type TLRecord } from '../../src/model/records'
import { ampAckFrame, ampRespFrame, ampTriggerFrame } from '../../src/engine/amp'
import type { FrameDesc } from '../../src/model/frames'

function world(links: Record<string, number>, radios: { id: string; opts?: Parameters<Channel['register']>[2] }[]) {
  const q = new EventQueue()
  let now = 0
  const ids = radios.map((r) => r.id)
  const table = new Map(ids.map((tx) => [tx, new Map(ids.filter((rx) => rx !== tx).map((rx) => [rx, links[`${tx}>${rx}`] ?? -200]))]))
  const records: TLRecord[] = []
  const ch = new Channel(q, () => now, table, makeEmitter((r) => records.push(r)))
  const heard: Record<string, string[]> = {}
  for (const r of radios) {
    heard[r.id] = []
    const l: PhyListener = { onCcaBusy() {}, onCcaIdle() {}, onRxStart() {}, onRxOk(_t, f, from) { heard[r.id].push(`${f.kind}:${from}`) }, onRxCorrupt() {} }
    ch.register(r.id, l, r.opts)
  }
  const run = (t: number) => { for (;;) { const pt = q.peekTime(); if (pt === null || pt > t) break; const e = q.pop()!; now = e.t; e.fn() } now = t }
  const at = (t: number, fn: () => void) => q.schedule(t, fn)
  return { ch, records, heard, run, at }
}
const trigger = (): FrameDesc => ampTriggerFrame({ src: 'ap', dlKbps: 250, ulKbps: 250, phase: 'random', slots: 4, slotNs: 272_000, acwe: 2, sessionId: 1, staIds: [], reading: false, roundNs: 0, signalExtNs: 6_000 })

describe('AMP frames on the channel', () => {
  it('a tag decodes a DL AMP PPDU above its floor and never a Wi-Fi frame', () => {
    const w = world({ 'ap>tag': -60, 'ap>sta': -60 }, [{ id: 'ap', opts: { ampCapable: true } }, { id: 'tag', opts: { kind: 'tag', cca: false } }, { id: 'sta' }])
    w.at(0, () => w.ch.startTx('ap', trigger()))
    w.run(1_000_000)
    expect(w.heard.tag).toEqual(['ampTrigger:ap'])
    expect(w.heard.sta).toEqual(['ampTrigger:ap']) // the legacy preamble + L-SIG decode
    const cts: FrameDesc = { kind: 'cts', src: 'ap', dst: 'ap', bytes: 14, mbps: 6, durationFieldNs: 0, txTimeNs: 50_000 }
    w.at(2_000_000, () => w.ch.startTx('ap', cts))
    w.run(3_000_000)
    expect(w.heard.tag).toEqual(['ampTrigger:ap'])
    expect(w.records.some((r) => r.type === 'CCA_BUSY' && r.node === 'tag')).toBe(false)
  })
  it('a tag below its DL floor never hears the trigger', () => {
    const w = world({ 'ap>tag': -75 }, [{ id: 'ap', opts: { ampCapable: true } }, { id: 'tag', opts: { kind: 'tag', cca: false, floorDbm: -72 } }])
    w.at(0, () => w.ch.startTx('ap', trigger()))
    w.run(1_000_000)
    expect(w.heard.tag).toEqual([])
  })
  it('the AP decodes a UL response down to −94 dBm at 250 kb/s; a plain Wi-Fi station cannot detect it', () => {
    const w = world({ 'tag>ap': -93, 'tag>sta': -30 }, [{ id: 'ap', opts: { ampCapable: true } }, { id: 'tag', opts: { kind: 'tag', cca: false } }, { id: 'sta' }])
    w.at(0, () => w.ch.startTx('tag', ampRespFrame('tag', 'ap', 250, 1, 0, false)))
    w.run(1_000_000)
    expect(w.heard.ap).toEqual(['ampResp:tag'])
    expect(w.heard.sta).toEqual([])
    expect(w.records.some((r) => r.type === 'CCA_BUSY' && r.node === 'sta' && r.cause === 'energy')).toBe(true)
    const w2 = world({ 'tag>ap': -96 }, [{ id: 'ap', opts: { ampCapable: true } }, { id: 'tag', opts: { kind: 'tag', cca: false } }])
    w2.at(0, () => w2.ch.startTx('tag', ampRespFrame('tag', 'ap', 250, 1, 0, false)))
    w2.run(1_000_000)
    expect(w2.heard.ap).toEqual([])
  })
  it('two tags in one slot collide at the AP; a 5 dB stronger one is captured', () => {
    const w = world({ 'a>ap': -60, 'b>ap': -60 }, [{ id: 'ap', opts: { ampCapable: true } }, { id: 'a', opts: { kind: 'tag', cca: false } }, { id: 'b', opts: { kind: 'tag', cca: false } }])
    w.at(0, () => { w.ch.startTx('a', ampRespFrame('a', 'ap', 250, 1, 0, false)); w.ch.startTx('b', ampRespFrame('b', 'ap', 250, 1, 0, false)) })
    w.run(1_000_000)
    expect(w.heard.ap).toEqual([])
    expect(w.records.some((r) => r.type === 'COLLISION' && r.nodes.includes('a') && r.nodes.includes('b'))).toBe(true)
    const w2 = world({ 'a>ap': -55, 'b>ap': -70 }, [{ id: 'ap', opts: { ampCapable: true } }, { id: 'a', opts: { kind: 'tag', cca: false } }, { id: 'b', opts: { kind: 'tag', cca: false } }])
    w2.at(0, () => { w2.ch.startTx('b', ampRespFrame('b', 'ap', 250, 1, 0, false)) })
    w2.at(10_000, () => { w2.ch.startTx('a', ampRespFrame('a', 'ap', 250, 1, 0, false)) }) // inside b's 48 µs sync: capture
    w2.run(1_000_000)
    expect(w2.heard.ap).toEqual(['ampResp:a'])
  })
  it('an Ack addressed to one tag is still decoded by every tag in range', () => {
    const w = world({ 'ap>a': -60, 'ap>b': -60 }, [{ id: 'ap', opts: { ampCapable: true } }, { id: 'a', opts: { kind: 'tag', cca: false } }, { id: 'b', opts: { kind: 'tag', cca: false } }])
    w.at(0, () => w.ch.startTx('ap', ampAckFrame('ap', 'a', 250, 1, 6_000)))
    w.run(1_000_000)
    expect(w.heard.a).toEqual(['ampAck:ap'])
    expect(w.heard.b).toEqual(['ampAck:ap'])
  })
})
