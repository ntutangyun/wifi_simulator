import { describe, it, expect } from 'vitest'
import { EventQueue } from '../../src/engine/events'
import type { FrameDesc } from '../../src/model/frames'
import { makeEmitter, type RxFailReason, type TLRecord } from '../../src/model/records'
import type { NodeCfg, Wall } from '../../src/model/scenario'
import type { Ns } from '../../src/model/types'
import { UwbChannel, type UwbRadio, type UwbRxInfo } from '../../src/uwb/channel'
import { makeNbPoll, makePoll, makeRif, makeRsf } from '../../src/uwb/frames'
import { MMS_COMBINE_MAX_DB, type MmsPhy } from '../../src/uwb/mms'
import { NB_RX_SENS_DBM, NB_TX_DBM, nbPl0Db } from '../../src/uwb/nb'
import { C_M_PER_NS, UWB_PL_EXP, UWB_RX_SENS_DBM, uwbPl0Db } from '../../src/uwb/phy'

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


// --- P802.15.4ab: one medium, three PHYs -------------------------------------------

/** The draft's own ranging-cycle default train. 4ab draft 15-22/0381r5 Table 1.2.3.3 */
const MMS_PHY: MmsPhy = { rsfs: 8, rifs: 2, nMsr: 40, gap: 64, stsLen: 64, gapMs: 1 }

/** How far a transmitter of `txDbm`, on a band whose 1 m loss is `pl0`, is heard at exactly
 * `rxDbm` \u2014 the channel's own law solved for distance. */
const distanceForRx = (txDbm: number, pl0: number, rxDbm: number): number =>
  10 ** ((txDbm - pl0 - rxDbm) / (10 * UWB_PL_EXP))

/** A two-node floor on channel 9 with the receiver placed where `frame` lands at `rxDbm`. */
function atLevel(frame: FrameDesc, txDbm: number, pl0: number, rxDbm: number) {
  const d = distanceForRx(txDbm, pl0, rxDbm)
  const h = harness([node('t', 0, 0, -14, 'tag'), node('a', d, 0)], [], { channel: 9, nlos: false })
  expect(h.ch.rssiDbm('t', 'a', frame)).toBeCloseTo(rxDbm, 9)
  h.ch.transmit('t', frame)
  h.runUntil(frame.txTimeNs * 2)
  return h
}

describe('UwbChannel per-frame PHY: the delivery floor', () => {
  it('hands a fragment to its device twelve decibels below 4z sensitivity, because a train combines', () => {
    // MMS_COMBINE_MAX_DB = 10\u00b7log10(16): the largest train this model allows. \u221293 \u2212 12.04 = \u2212105.04 dBm
    expect(MMS_COMBINE_MAX_DB).toBeCloseTo(12.041, 3)
    expect(UWB_RX_SENS_DBM - MMS_COMBINE_MAX_DB).toBeCloseTo(-105.04, 2)

    const rsf = makeRsf('t', 'a', 0, MMS_PHY, 0, 0, 4)
    const h = atLevel(rsf, rsf.uwb!.mms!.txDbm, uwbPl0Db(9), -100)
    expect(h.rec('RX_OK', 'a')).toHaveLength(1)
    expect(h.of('a').oks[0].info.rssiDbm).toBeCloseTo(-100, 9)
    expect(h.of('a').oks[0].frame.kind).toBe('uwbRsf')
  })

  it('drops a fragment no train could rescue', () => {
    const rif = makeRif('t', 'a', 0, MMS_PHY, 0, 0, 26)
    const h = atLevel(rif, rif.uwb!.mms!.txDbm, uwbPl0Db(9), -106)
    expect(h.rec('RX_START', 'a')).toHaveLength(0)
    expect(h.rec('RX_OK', 'a')).toHaveLength(0)
    expect(h.rec('RX_FAIL', 'a')).toHaveLength(0)
  })

  it('still drops a 4z frame at \u2212100 dBm: only a fragment gets the combining allowance', () => {
    const f = makePoll('t', ['a'], 'ss', 0, 0)
    const h = atLevel(f, -14, uwbPl0Db(9), -100)
    expect(h.rec('RX_START', 'a')).toHaveLength(0)
    expect(h.rec('RX_OK', 'a')).toHaveLength(0)
  })

  it('delivers a narrowband message down to its own \u2212100 dBm receiver, at its own power and its own band', () => {
    const nb = makeNbPoll('t', 'a', 200, 0, 0)
    expect(NB_RX_SENS_DBM).toBe(-100)
    // the NB radio runs at NB_TX_DBM whatever the node's UWB power is, and its 1 m loss is the
    // narrowband channel's, not the UWB channel's
    const ok = atLevel(nb, NB_TX_DBM, nbPl0Db(200), -99)
    expect(ok.rec('RX_OK', 'a')).toHaveLength(1)
    expect(ok.of('a').oks[0].frame.kind).toBe('nbPoll')
    // asked without a frame the same channel answers for the session's UWB radio instead: the
    // node's −14 dBm at uwbPl0Db(9) over the same 1067.05 m, which is −125.06 dBm
    const d = distanceForRx(NB_TX_DBM, nbPl0Db(200), -99)
    expect(d).toBeCloseTo(1067.05, 2)
    expect(ok.ch.rssiDbm('t', 'a'))
      .toBeCloseTo(-14 - uwbPl0Db(9) - 10 * UWB_PL_EXP * Math.log10(d), 9)
    expect(ok.ch.rssiDbm('t', 'a')).toBeCloseTo(-125.06, 2)

    const lost = atLevel(makeNbPoll('t', 'a', 200, 0, 0), NB_TX_DBM, nbPl0Db(200), -101)
    expect(lost.rec('RX_START', 'a')).toHaveLength(0)
  })
})
