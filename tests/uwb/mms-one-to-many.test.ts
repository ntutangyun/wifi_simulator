/**
 * P802.15.4ab **one-to-many** MMS rounds: one initiator, every anchor of the session as its
 * responders, and the per-receiver fragment capture the medium needs to keep their trains apart.
 *
 * Four things are worth pinning here and nowhere else:
 *  - a round really does produce a range per responder, from one train;
 *  - two overlapping trains at one receiver leave the stronger standing, fragment by fragment,
 *    and the weaker is reported as a **capture** rather than as a collision;
 *  - a responder that never gets into the round costs the round only its own range;
 *  - and `oneToMany: false` — the default, and what a plan saved before the switch existed
 *    reads back as — leaves the pairwise cycle byte for byte where it was.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { EventQueue } from '../../src/engine/events'
import { Rng } from '../../src/engine/rng'
import { Simulation } from '../../src/engine/simulation'
import { Spectrum, wifiToUwbPathLossDb } from '../../src/engine/spectrum'
import type { FrameDesc } from '../../src/model/frames'
import { makeEmitter, type RxFailReason, type TLRecord } from '../../src/model/records'
import {
  DEFAULT_UWB_SESSION, ScenarioSchema, type NodeCfg, type Scenario, type UwbSessionCfg, type Wall,
} from '../../src/model/scenario'
import type { Ns } from '../../src/model/types'
import { LESSONS } from '../../src/course/lessons'
import { nbBand } from '../../src/uwb/nb'
import { UwbNetwork } from '../../src/uwb/network'
import { UwbChannel, type UwbRadio, type UwbRxInfo } from '../../src/uwb/channel'
import { UWB_BROADCAST } from '../../src/uwb/frames'
import { makeRsf } from '../../src/uwb/frames'
import { mmsLayout, type MmsPhy } from '../../src/uwb/mms'
import { mmsResponders, UWB_CAPTURE_DB, UWB_TX_POWER_DBM } from '../../src/uwb/phy'
import { roundPlan } from '../../src/uwb/session'

const MS = 1_000_000

// --- scenes -------------------------------------------------------------------------------

interface Place { x: number; y: number; z: number; ppm?: number }

const uwbNode = (id: string, p: Place, role: 'anchor' | 'tag'): NodeCfg => ({
  id, kind: 'uwb', name: id, pos: { x: p.x, y: p.y, z: p.z },
  txPowerDbm: UWB_TX_POWER_DBM, profiles: ['idle'],
  caps: { generation: 'nonht', features: {} },
  uwb: { role, ...(p.ppm !== undefined ? { ppm: p.ppm } : {}) },
})

/** The MMS session the pairwise tests use (tests/uwb/network.test.ts), with the one switch this
 * file is about. The draft's 600 RSTU slot is what makes a round 0.5 ms a slot. */
function mmsScene(
  anchors: Place[], tags: Place[], oneToMany: boolean, walls: Wall[] = [],
  over: Partial<UwbSessionCfg['mms']> = {},
): Scenario {
  return {
    rooms: [{ x: 0, y: 0, w: 14, h: 12, name: 'lab' }],
    walls,
    nodes: [
      ...anchors.map((p, i) => uwbNode(`anc-${i + 1}`, p, 'anchor')),
      ...tags.map((p, i) => uwbNode(`tag-${i + 1}`, p, 'tag')),
    ],
    servers: [],
    seed: 7,
    rtsThresholdBytes: 3000,
    snapshotIntervalMs: 10,
    uwb: {
      ...DEFAULT_UWB_SESSION, mode: 'mms', method: 'ss', slotRstu: 600, aoa: false, nlos: false,
      mms: { ...DEFAULT_UWB_SESSION.mms, oneToMany, ...over },
    },
  }
}

const run = (sc: Scenario, ns: number): TLRecord[] => new Simulation(sc).runUntil(ns).records
const of = <T extends TLRecord['type']>(rs: TLRecord[], type: T, node?: string): Extract<TLRecord, { type: T }>[] =>
  rs.filter((r) => r.type === type && (node === undefined || (r as { node?: string }).node === node)) as never

/** Three anchors round a tag, all in line of sight of it. */
const RING: Place[] = [{ x: 1, y: 1, z: 1 }, { x: 11, y: 1, z: 1 }, { x: 6, y: 10, z: 1 }]
const TAG: Place = { x: 6, y: 5, z: 1 }

// --- the medium, driven directly ------------------------------------------------------------

class StubRadio implements UwbRadio {
  listen = true
  oks: { from: string; frame: FrameDesc; info: UwbRxInfo }[] = []
  fails: { from: string; reason: RxFailReason }[] = []
  listening(): boolean { return this.listen }
  onRxStart(): void {}
  onRxOk(from: string, frame: FrameDesc, info: UwbRxInfo): void { this.oks.push({ from, frame, info }) }
  onRxFail(from: string, reason: RxFailReason): void { this.fails.push({ from, reason }) }
}

const bare = (id: string, x: number, y: number): NodeCfg => ({
  id, kind: 'uwb', name: id, pos: { x, y, z: 0 }, txPowerDbm: UWB_TX_POWER_DBM,
  profiles: ['idle'], caps: { generation: 'nonht', features: {} }, uwb: { role: 'anchor' },
})

function harness(nodes: NodeCfg[]) {
  const q = new EventQueue()
  let now: Ns = 0
  const records: TLRecord[] = []
  const ch = new UwbChannel(q, () => now, nodes, [], { channel: 9, nlos: false }, () => 0, makeEmitter((r) => records.push(r)))
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
  return { ch, records, runUntil, setNow: (t: Ns) => { now = t }, of: (id: string) => radios.get(id)! }
}

const TRAIN: MmsPhy = { ...DEFAULT_UWB_SESSION.mms }
const rsf = (src: string, dst: string, index: number): FrameDesc => makeRsf(src, dst, index, TRAIN, 0, 0, 0)

// --- the pairwise fixture ---------------------------------------------------------------------

/**
 * The UWB record hash of `tests/engine/uwb-record-hashes.test.ts`, written out here so this file
 * can check one key of its fixture without importing a module whose top level runs a suite. Keep
 * the two in step: they are the same fold over the same lines, by construction.
 */
function hashOf(records: TLRecord[]): string {
  const value = (v: unknown): string => {
    if (v === null) return 'null'
    if (v === undefined) return 'undefined'
    if (typeof v === 'number') {
      if (Number.isNaN(v)) return 'NaN'
      if (v === Infinity) return 'Infinity'
      if (v === -Infinity) return '-Infinity'
      return String(Number(v.toFixed(6)))
    }
    if (typeof v === 'string' || typeof v === 'boolean') return String(v)
    if (Array.isArray(v)) return `[${v.map(value).join(',')}]`
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>
      return `{${Object.keys(o).sort().map((k) => `${k}:${value(o[k])}`).join(',')}}`
    }
    return String(v)
  }
  let h = 0x811c9dc5
  const fold = (s: string): void => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
  }
  for (const r of records) {
    const o = r as unknown as Record<string, unknown>
    const rest = Object.keys(o).filter((k) => k !== 'type' && k !== 'node').sort()
    const parts = [`type:${String(o.type)}`, `node:${String(o.node)}`]
    for (const k of rest) parts.push(`${k}:${value(o[k])}`)
    fold(parts.join('|'))
    fold('\n')
  }
  return (h >>> 0).toString(16)
}

const FIXTURE = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../fixtures/uwb-record-hashes.json'), 'utf8'),
) as Record<string, string>

// --- 1. every responder in one round ------------------------------------------------------

describe('a one-to-many round ranges every anchor at once', () => {
  const sc = mmsScene(RING, [TAG], true)
  const rs = run(sc, 1000 * MS)

  it('lays the round out as control + (R + 1) slots a millisecond + report', () => {
    const plan = roundPlan(sc.uwb!, RING.length)
    const l = plan.mms!.layout
    expect(plan.mms!.oneToMany).toBe(true)
    expect(l.responders).toBe(3)
    // Two slots for the POLL window and two for each responder's RESP.
    expect(l.controlSlots).toBe(8)
    // X = 8 RSFs, four devices to a millisecond — past the draft's 20-slot floor.
    expect(l.rpSlots).toBe(32)
    // Two report windows per responder: its own, then the initiator's answer to it.
    expect(l.reportSlots).toBe(12)
    expect(plan.slots).toBe(52)
    // The initiator opens each millisecond and the three responders follow it, in order.
    expect(l.fragmentSlot('initiator', 'rsf', 0)).toBe(8)
    expect([0, 1, 2].map((k) => l.fragmentSlot('responder', 'rsf', 0, k))).toEqual([9, 10, 11])
    expect(l.fragmentSlot('initiator', 'rsf', 1)).toBe(12)
    expect([0, 1, 2].map((k) => l.reportSlot('responder', k))).toEqual([40, 44, 48])
    expect([0, 1, 2].map((k) => l.reportSlot('initiator', k))).toEqual([42, 46, 50])
    // Four slots to a millisecond of the ranging phase, and the draft's 600 RSTU slot is half a
    // millisecond — so this round really spaces its fragments 2 ms apart, and says so rather
    // than letting every receiver assume a millisecond and read a clock ratio of two.
    expect(plan.mms!.fragGapNs).toBe(2_000_000)
  })

  it('gives the tag one round per block, not one per pair', () => {
    const rounds = of(rs, 'UWB_ROUND', 'tag-1')
    expect(rounds.length).toBeGreaterThanOrEqual(5)
    // Five blocks in the window, one round each — a pairwise session would run three per block.
    expect(new Set(rounds.map((r) => r.round))).toEqual(new Set([0]))
    expect(rounds.every((r) => r.mode === 'mms')).toBe(true)
  })

  it('hears every responder’s train and ranges all three in the same round', () => {
    const first = of(rs, 'UWB_ROUND', 'tag-1')[0]
    const inRound = (r: { block: number }): boolean => r.block === first.block
    const trains = of(rs, 'UWB_MMS_TRAIN', 'tag-1').filter(inRound)
    expect(trains.map((t) => t.peer)).toEqual(['anc-1', 'anc-2', 'anc-3'])
    expect(trains.every((t) => t.detected)).toBe(true)
    expect(trains.every((t) => t.heard === t.fragments)).toBe(true)
    const ranges = of(rs, 'UWB_RANGE', 'tag-1').filter(inRound)
    expect(ranges.map((r) => r.peer)).toEqual(['anc-1', 'anc-2', 'anc-3'])
    for (const r of ranges) expect(Math.abs(r.distM - r.trueDistM)).toBeLessThan(0.3)
  })

  it('names the round’s responders on every train record, and only there', () => {
    const otm = of(rs, 'UWB_MMS_TRAIN')
    expect(otm.length).toBeGreaterThan(0)
    for (const t of otm) expect(t.responders).toEqual(['anc-1', 'anc-2', 'anc-3'])
    // The same scene pairwise says nothing about responders: its record is the one that shipped.
    const pair = of(run(mmsScene(RING, [TAG], false), 400 * MS), 'UWB_MMS_TRAIN')
    expect(pair.length).toBeGreaterThan(0)
    for (const t of pair) expect(t.responders).toBeUndefined()
  })

  it('solves the tag’s fix from the one round, not from a block of pair rounds', () => {
    const fixes = of(rs, 'UWB_POSITION', 'tag-1')
    expect(fixes.length).toBeGreaterThanOrEqual(5)
    for (const f of fixes) {
      expect(f.anchors).toEqual(['anc-1', 'anc-2', 'anc-3'])
      expect(Math.hypot(f.x - f.trueX, f.y - f.trueY)).toBeLessThan(0.5)
    }
  })
})

// --- 2. capture, per receiver and per fragment -----------------------------------------------

describe('the medium keeps the strongest overlapping train, fragment by fragment', () => {
  it('captures the weaker train at the receiver both are addressed to', () => {
    // Both responders answer the same initiator; `near` is 12 dB above `far` at it.
    const h = harness([bare('i', 0, 0), bare('near', 1, 0), bare('far', 4, 0)])
    for (const index of [0, 1]) {
      h.setNow(index * MS)
      h.ch.transmit('near', rsf('near', 'i', index))
      h.ch.transmit('far', rsf('far', 'i', index))
      h.runUntil((index + 1) * MS - 1)
    }
    const i = h.of('i')
    // Per fragment, not per train: both milliseconds are decided on their own, and the
    // strongest is decoded in each of them.
    expect(i.oks.map((o) => o.from)).toEqual(['near', 'near'])
    expect(i.fails).toEqual([{ from: 'far', reason: 'capture' }, { from: 'far', reason: 'capture' }])
    const rxFail = h.records.filter((r) => r.type === 'RX_FAIL')
    expect(rxFail).toHaveLength(2)
    for (const r of rxFail) expect(r).toMatchObject({ node: 'i', from: 'far', reason: 'capture' })
  })

  it('still calls it a collision when neither leads by the capture margin', () => {
    const h = harness([bare('i', 0, 0), bare('a', 1, 0), bare('b', 1.3, 0)])
    h.ch.transmit('a', rsf('a', 'i', 0))
    h.ch.transmit('b', rsf('b', 'i', 0))
    h.runUntil(MS)
    const i = h.of('i')
    expect(i.oks).toHaveLength(0)
    expect(i.fails.map((f) => f.reason)).toEqual(['collision', 'collision'])
    // …because the two are inside the 5 dB the capture rule asks for.
    const powers = ['a', 'b'].map((id) => h.ch.rssiDbm(id, 'i', rsf(id, 'i', 0)))
    expect(Math.abs(powers[0] - powers[1])).toBeLessThan(UWB_CAPTURE_DB)
  })

  it('does not let a train addressed to one receiver doom another receiver’s train', () => {
    // `r2` is accumulating the initiator's broadcast train; `r1`'s fragment, unicast to `i`,
    // arrives at `r2` far louder — and must leave what `r2` is decoding alone.
    const h = harness([bare('i', 0, 0), bare('r1', 1, 0), bare('r2', 6, 0)])
    h.ch.transmit('i', rsf('i', UWB_BROADCAST, 0))
    h.ch.transmit('r1', rsf('r1', 'i', 0))
    h.runUntil(MS)
    const r2 = h.of('r2')
    expect(r2.oks.map((o) => o.from).sort()).toEqual(['i', 'r1'])
    expect(r2.fails).toHaveLength(0)
    // At the initiator, which both are on the air for, the ordinary rule applies again: the
    // broadcast train and the unicast one do compete.
    expect(h.of('i').oks.map((o) => o.from)).toEqual(['r1'])
  })
})

// --- 3. a responder that loses its slot --------------------------------------------------------

describe('a responder that never gets into the round costs only its own range', () => {
  /**
   * The round, driven by hand so a `Spectrum` can be parked over the narrowband control channel —
   * the simulator builds its own, and nothing foreign reaches a receiver without one. The Wi-Fi
   * emitter sits 30 cm from anc-3 and five metres from everybody else, so the POLL is drowned at
   * anc-3 and nowhere else: anc-3 is the one responder that never learns there is a round.
   */
  function runBlocked(): TLRecord[] {
    const nodes = [
      uwbNode('anc-1', RING[0], 'anchor'), uwbNode('anc-2', RING[1], 'anchor'),
      uwbNode('anc-3', RING[2], 'anchor'), uwbNode('tag-1', TAG, 'tag'),
    ]
    const q = new EventQueue()
    let now = 0
    const recs: TLRecord[] = []
    const sp = new Spectrum([], q, () => now)
    const band = nbBand(DEFAULT_UWB_SESSION.mms.nbChannels[0])
    sp.emit('wifi', {
      txId: 'ap', eirpDbm: 6, bandLoMhz: band.lo - 10, bandHiMhz: band.hi + 10,
      pos: { x: RING[2].x, y: RING[2].y + 0.3, z: 1 }, lossDb: wifiToUwbPathLossDb,
    })
    const cfg: UwbSessionCfg = {
      ...DEFAULT_UWB_SESSION, mode: 'mms', method: 'ss', slotRstu: 600, aoa: false, nlos: false,
      mms: { ...DEFAULT_UWB_SESSION.mms, oneToMany: true },
    }
    new UwbNetwork(q, () => now, nodes, [], cfg, new Rng(7), makeEmitter((x) => recs.push(x as TLRecord)), sp, 7)
    for (;;) {
      const t = q.peekTime()
      if (t === null || t > 3 * 200 * MS) break
      const e = q.pop()!
      now = e.t
      e.fn()
    }
    return recs
  }
  const rs = runBlocked()

  it('loses the control exchange at that one responder and nowhere else', () => {
    const lost = of(rs, 'UWB_INTERFERED')
    expect(lost.length).toBeGreaterThanOrEqual(3)
    expect(new Set(lost.map((r) => r.node))).toEqual(new Set(['anc-3']))
    for (const r of lost) expect(r.sirDb).toBeLessThan(0)
    // It never answers, so the tag waits out its RESP window and says so — once per block.
    const waits = of(rs, 'UWB_TIMEOUT', 'tag-1').filter((r) => r.peer === 'anc-3')
    expect(waits.length).toBeGreaterThanOrEqual(3)
    expect(waits.every((r) => r.expected === 'nbResp')).toBe(true)
  })

  it('ranges the two that answered and none to the one that did not', () => {
    const peers = new Set(of(rs, 'UWB_RANGE', 'tag-1').map((r) => r.peer))
    expect([...peers].sort()).toEqual(['anc-1', 'anc-2'])
    // Two ranges in each of the three blocks: the round went on without the third.
    expect(of(rs, 'UWB_RANGE', 'tag-1')).toHaveLength(6)
  })

  it('leaves the surviving pair’s trains whole', () => {
    const trains = of(rs, 'UWB_MMS_TRAIN', 'tag-1')
    expect(trains.length).toBeGreaterThan(0)
    for (const t of trains) {
      expect(['anc-1', 'anc-2']).toContain(t.peer)
      expect(t.detected).toBe(true)
      expect(t.heard).toBe(t.fragments)
    }
  })

  it('produces no fix at all, because two ranges are not three', () => {
    expect(of(rs, 'UWB_POSITION', 'tag-1')).toHaveLength(0)
  })
})

// --- 4 & 5. the pairwise cycle is untouched -----------------------------------------------------

describe('oneToMany: false is the cycle that shipped', () => {
  it('replays the uwb-mms lesson scene to its recorded fixture hash', () => {
    const lesson = LESSONS.find((l) => l.id === 'uwb-mms')!
    expect(lesson.scenario().uwb?.mms.oneToMany).toBe(false)
    const records = new Simulation(lesson.scenario()).runUntil(1300 * MS)
      .records.filter((r) => r.type.startsWith('UWB_'))
    expect(FIXTURE['uwb-mms']).toBeDefined()
    expect(hashOf(records)).toBe(FIXTURE['uwb-mms'])
  })

  it('reads back pairwise from a plan that predates the switch, and hashes the same', () => {
    const sc = mmsScene(RING, [TAG], false)
    const legacy = JSON.parse(JSON.stringify(sc)) as Record<string, unknown>
    delete ((legacy.uwb as Record<string, unknown>).mms as Record<string, unknown>).oneToMany
    const parsed = ScenarioSchema.parse(legacy)
    expect(parsed.uwb?.mms.oneToMany).toBe(false)
    expect(hashOf(run(parsed, 400 * MS))).toBe(hashOf(run(sc, 400 * MS)))
  })

  it('lays a pair round out exactly as it always did', () => {
    const pairwise = roundPlan(mmsScene(RING, [TAG], false).uwb!, RING.length)
    expect(pairwise.mms!.oneToMany).toBe(false)
    expect(pairwise.slots).toBe(28)
    const l = pairwise.mms!.layout
    expect([l.responders, l.controlSlots, l.rpSlots, l.reportSlots]).toEqual([1, 4, 20, 4])
    expect(l.fragmentSlot('initiator', 'rsf', 0)).toBe(4)
    expect(l.fragmentSlot('responder', 'rsf', 0)).toBe(5)
    expect(l.reportSlot('responder')).toBe(24)
    expect(l.reportSlot('initiator')).toBe(26)
    // …and it is what `mmsLayout` gives with no responder count at all.
    expect(mmsLayout(DEFAULT_UWB_SESSION.mms).slots).toBe(28)
    expect(mmsResponders(DEFAULT_UWB_SESSION.mms, 4)).toBe(1)
    expect(mmsResponders({ ...DEFAULT_UWB_SESSION.mms, oneToMany: true }, 4)).toBe(4)
  })
})
