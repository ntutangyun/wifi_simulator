import { describe, it, expect } from 'vitest'
import { EventQueue } from '../../src/engine/events'
import type { FrameDesc } from '../../src/model/frames'
import { makeEmitter, type RxFailReason, type TLRecord } from '../../src/model/records'
import type { NodeCfg, Wall } from '../../src/model/scenario'
import type { Ns } from '../../src/model/types'
import { UwbChannel, type UwbRadio, type UwbRxInfo } from '../../src/uwb/channel'
import { makePoll } from '../../src/uwb/frames'
import { C_M_PER_NS } from '../../src/uwb/phy'

const node = (id: string, x: number, y: number, txPowerDbm = -14, role: 'anchor' | 'tag' = 'anchor'): NodeCfg => ({
  id, kind: 'uwb', name: id, pos: { x, y, z: 0 }, txPowerDbm,
  profiles: ['idle'], caps: { generation: 'nonht', features: {} }, uwb: { role },
})

const wall = (x1: number, y1: number, x2: number, y2: number, material: Wall['material']): Wall =>
  ({ x1, y1, x2, y2, material, openings: [] })

class StubRadio implements UwbRadio {
  listen = true
  starts: { from: string; frame: FrameDesc }[] = []
  oks: { from: string; frame: FrameDesc; info: UwbRxInfo }[] = []
  fails: { from: string; reason: RxFailReason }[] = []
  listening(): boolean { return this.listen }
  onRxStart(from: string, frame: FrameDesc): void { this.starts.push({ from, frame }) }
  onRxOk(from: string, frame: FrameDesc, info: UwbRxInfo): void { this.oks.push({ from, frame, info }) }
  onRxFail(from: string, reason: RxFailReason): void { this.fails.push({ from, reason }) }
}

function harness(nodes: NodeCfg[], walls: Wall[] = [], cfg: { channel: 5 | 9; nlos: boolean } = { channel: 9, nlos: true }) {
  const q = new EventQueue()
  let now: Ns = 0
  const records: TLRecord[] = []
  const emit = makeEmitter((r) => records.push(r))
  const ch = new UwbChannel(q, () => now, nodes, walls, cfg, () => 0, emit)
  const radios = new Map<string, StubRadio>()
  for (const n of nodes) {
    const r = new StubRadio()
    radios.set(n.id, r)
    ch.register(n.id, r)
  }
  const runUntil = (t: Ns): void => {
    for (;;) {
      const next = q.peekTime()
      if (next === null || next > t) break
      const ev = q.pop()!
      now = ev.t
      ev.fn()
    }
    now = t
  }
  const setNow = (t: Ns): void => { now = t }
  const of = (id: string): StubRadio => radios.get(id)!
  const rec = (type: TLRecord['type'], id?: string): TLRecord[] =>
    records.filter((r) => r.type === type && (id === undefined || ('node' in r && r.node === id)))
  return { q, ch, records, of, rec, runUntil, setNow }
}

const poll = (): FrameDesc => makePoll('t', ['a'], 'ss', 0, 0)

describe('UwbChannel propagation delay', () => {
  it('delivers 5 m away after ceil(d/c) = 17 ns and finishes a PPDU later', () => {
    const h = harness([node('t', 0, 0, -14, 'tag'), node('a', 5, 0)])
    const f = poll()
    h.ch.transmit('t', f)
    h.runUntil(f.txTimeNs * 2)
    const txStart = h.rec('TX_START', 't')[0]
    const rxStart = h.rec('RX_START', 'a')[0]
    const rxOk = h.rec('RX_OK', 'a')[0]
    expect(txStart.t).toBe(0)
    expect(rxStart.t - txStart.t).toBe(17)
    expect(rxOk.t).toBe(rxStart.t + f.txTimeNs)
    expect(h.of('a').starts).toHaveLength(1)
    expect(h.of('a').oks).toHaveLength(1)
    expect(h.of('a').oks[0].info.propNs).toBeCloseTo(16.678, 3)
    expect(h.of('a').oks[0].info.propNs).toBeCloseTo(5 / C_M_PER_NS, 9)
    expect(h.of('a').oks[0].info.txStartNs).toBe(0)
    expect(h.of('a').fails).toHaveLength(0)
  })

  it('delivers 20 m away after 67 ns', () => {
    const h = harness([node('t', 0, 0, -14, 'tag'), node('a', 20, 0)])
    const f = poll()
    h.ch.transmit('t', f)
    h.runUntil(f.txTimeNs * 2)
    expect(h.rec('RX_START', 'a')[0].t).toBe(67)
    expect(h.ch.distanceM('t', 'a')).toBeCloseTo(20)
  })

  it('emits exactly one TX_START and a TX_END a PPDU later', () => {
    const h = harness([node('t', 0, 0, -14, 'tag'), node('a', 5, 0)])
    const f = poll()
    h.ch.transmit('t', f)
    h.runUntil(f.txTimeNs * 2)
    expect(h.rec('TX_START', 't')).toHaveLength(1)
    const ends = h.rec('TX_END', 't')
    expect(ends).toHaveLength(1)
    expect(ends[0].t).toBe(f.txTimeNs)
  })
})

describe('UwbChannel sensitivity', () => {
  it('drops a signal below −93 dBm without any record', () => {
    const h = harness([node('t', 0, 0, -14, 'tag'), node('a', 40, 0)])
    const f = poll()
    expect(h.ch.rssiDbm('t', 'a')).toBeLessThan(-93)
    h.ch.transmit('t', f)
    h.runUntil(f.txTimeNs * 2)
    expect(h.rec('RX_START', 'a')).toHaveLength(0)
    expect(h.rec('RX_OK', 'a')).toHaveLength(0)
    expect(h.rec('RX_FAIL', 'a')).toHaveLength(0)
    expect(h.of('a').starts).toHaveLength(0)
  })

  it('gives a radio that is not listening nothing at all', () => {
    const h = harness([node('t', 0, 0, -14, 'tag'), node('a', 5, 0)])
    h.of('a').listen = false
    const f = poll()
    h.ch.transmit('t', f)
    h.runUntil(f.txTimeNs * 2)
    expect(h.rec('RX_START', 'a')).toHaveLength(0)
    expect(h.rec('RX_OK', 'a')).toHaveLength(0)
    expect(h.of('a').starts).toHaveLength(0)
    expect(h.of('a').oks).toHaveLength(0)
    expect(h.of('a').fails).toHaveLength(0)
  })
})

describe('UwbChannel walls and NLOS excess delay', () => {
  const nodes = [node('t', 0, 0, -14, 'tag'), node('a', 5, 0)]
  const walls = [wall(2, -2, 2, 2, 'brick')]

  it('loses the wall material and adds its excess delay', () => {
    const clear = harness(nodes)
    const blocked = harness(nodes, walls)
    expect(blocked.ch.rssiDbm('t', 'a')).toBeCloseTo(clear.ch.rssiDbm('t', 'a') - 12, 9)
    expect(blocked.ch.nlosNs('t', 'a')).toBe(2.0)
    const f = poll()
    blocked.ch.transmit('t', f)
    blocked.runUntil(f.txTimeNs * 2)
    const info = blocked.of('a').oks[0].info
    expect(info.nlosNs).toBe(2.0)
    expect(info.nlos).toBe(true)
  })

  it('with NLOS modelling off the delay goes, but the path is still obstructed', () => {
    // The switch is the ideal-timestamp lab: no excess delay. It is not a claim that the
    // wall is gone, so the FoM still reports the path as obstructed (review finding 9).
    const h = harness(nodes, walls, { channel: 9, nlos: false })
    expect(h.ch.nlosNs('t', 'a')).toBe(0)
    expect(h.ch.obstructed('t', 'a')).toBe(true)
    const f = poll()
    h.ch.transmit('t', f)
    h.runUntil(f.txTimeNs * 2)
    const info = h.of('a').oks[0].info
    expect(info.nlosNs).toBe(0)
    expect(info.nlos).toBe(true)
  })

  it('reports no excess delay on a clear path', () => {
    const h = harness(nodes)
    const f = poll()
    h.ch.transmit('t', f)
    h.runUntil(f.txTimeNs * 2)
    expect(h.of('a').oks[0].info.nlosNs).toBe(0)
    expect(h.of('a').oks[0].info.nlos).toBe(false)
    expect(h.ch.obstructed('t', 'a')).toBe(false)
  })
})

describe('UwbChannel capture and collision', () => {
  /** Two transmitters equidistant from the listener; only their tx power differs. */
  const scene = (weakDbm: number) => {
    const h = harness([node('l', 5, 0, -14, 'tag'), node('s', 0, 0), node('w', 10, 0, weakDbm)])
    h.of('s').listen = false
    h.of('w').listen = false
    return h
  }

  it('lets the stronger of two overlapping receptions through when 10 dB apart', () => {
    const h = scene(-24)
    const f = poll()
    h.ch.transmit('s', f)
    h.ch.transmit('w', f)
    h.runUntil(f.txTimeNs * 2)
    expect(h.of('l').starts.map((s) => s.from)).toEqual(['s', 'w'])
    expect(h.of('l').oks.map((o) => o.from)).toEqual(['s'])
    expect(h.of('l').fails).toEqual([{ from: 'w', reason: 'collision' }])
    expect(h.rec('RX_OK', 'l')).toHaveLength(1)
    const fail = h.rec('RX_FAIL', 'l')[0]
    expect(fail).toMatchObject({ from: 'w', reason: 'collision' })
  })

  it('dooms both receptions when they are within the 6 dB capture margin', () => {
    const h = scene(-17)
    const f = poll()
    h.ch.transmit('s', f)
    h.ch.transmit('w', f)
    h.runUntil(f.txTimeNs * 2)
    expect(h.of('l').starts).toHaveLength(2)
    expect(h.of('l').oks).toHaveLength(0)
    expect(h.of('l').fails.map((x) => x.from).sort()).toEqual(['s', 'w'])
    expect(h.rec('RX_FAIL', 'l')).toHaveLength(2)
    for (const r of h.rec('RX_FAIL', 'l')) expect(r).toMatchObject({ reason: 'collision' })
  })

  it('lets a much stronger late arrival capture the receiver from an open reception', () => {
    const h = harness([node('l', 5, 0, -14, 'tag'), node('w', 0, 0, -24), node('s', 10, 0)])
    h.of('w').listen = false
    h.of('s').listen = false
    const f = poll()
    h.ch.transmit('w', f)
    h.setNow(1000)
    h.ch.transmit('s', f)
    h.runUntil(f.txTimeNs * 3)
    expect(h.of('l').oks.map((o) => o.from)).toEqual(['s'])
    expect(h.of('l').fails).toEqual([{ from: 'w', reason: 'collision' }])
  })
})
