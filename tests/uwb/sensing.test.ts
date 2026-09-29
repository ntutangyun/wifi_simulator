/**
 * The consumer of an echo: what a receiver *writes down* when one reaches it.
 *
 * `tests/uwb/echo-channel.test.ts` next door pins that echoes arrive and that ranging cannot
 * see them. This file is about the other half — that a scenario with reflecting objects in it
 * produces a **measurement a reader can watch**: one `UWB_ECHO` record per echo heard, carrying
 * the bistatic range it implies, the delay it arrived at, how much further than the direct ray
 * it went, and the verdict that is the whole teaching point (design §4): **could this receiver
 * separate it from the direct path at all?**
 *
 * The resolution tests are the ones that matter. A scatterer standing nearly on the line
 * between the two ends adds almost no extra path, and the record has to say both things — the
 * few centimetres of excess *and* the "no" — because a lesson shows the reader the arithmetic,
 * not just the answer.
 *
 * What this slice deliberately cannot record, and what belongs in a lesson's `limits`:
 * an echo that arrived but was too weak. The medium gates an echo on the direct path's own
 * sensitivity (`deliverEcho`), and there is no separate sensing floor to invent one from — so a
 * faint echo is simply never handed over, and no record says it was there.
 */
import { describe, it, expect } from 'vitest'
import { EventQueue } from '../../src/engine/events'
import { type ScattererCfg } from '../../src/engine/scatter'
import { Simulation } from '../../src/engine/simulation'
import type { FrameDesc } from '../../src/model/frames'
import { makeEmitter, type RxFailReason, type TLRecord } from '../../src/model/records'
import {
  DEFAULT_UWB_SESSION, type NodeCfg, type Scenario, type UwbSessionCfg, type Wall,
} from '../../src/model/scenario'
import type { Ns } from '../../src/model/types'
import { UwbChannel, type UwbRadio, type UwbRxInfo } from '../../src/uwb/channel'
import { makeNbPoll, makePoll } from '../../src/uwb/frames'
import { fmtRecord } from '../../src/ui/format'
import { fmtUwbRecord } from '../../src/uwb/format'
import { C_M_PER_NS, UWB_CHIP_NS, UWB_TX_POWER_DBM } from '../../src/uwb/phy'
import { UwbSensor } from '../../src/uwb/sensing'
import { applyUwbRecord } from '../../src/uwb/view'
import { initViewState } from '../../src/model/view'

const MS = 1_000_000
/** The extra path a 499.2 Mchip/s receiver needs before it can call an echo a second arrival:
 * c × UWB_CHIP_NS, 0.6005 m (design §4). */
const RESOLVES_M = C_M_PER_NS * UWB_CHIP_NS

// ---- a scene small enough for an echo to be audible in ------------------------------------
//
// Reach is genuinely short (task 3 measured it): an ideal square metre halfway along a *ten*
// metre line lands 13 dB under the receiver's floor, because an echo pays a path loss on each
// leg and only gets back the aperture the two-leg sum double-charged. So these scenes are two
// metres across and their reflectors are wardrobes (−10 dB), not ideal square metres. Nothing
// here is tuned to make a level come out: the scene is small because the physics is.

interface Place { x: number; y: number; z: number }

function uwbNode(id: string, p: Place, role: 'anchor' | 'tag'): NodeCfg {
  return {
    id, kind: 'uwb', name: id, pos: { x: p.x, y: p.y, z: p.z },
    txPowerDbm: UWB_TX_POWER_DBM, profiles: ['idle'],
    caps: { generation: 'nonht', features: {} },
    uwb: { role, ppm: 0 },
  }
}

/** A scenario that is nothing but a UWB session, with or without the scatterers section.
 * `scatterers` is spread in only when it is given, because absence and an empty list are two
 * different statements (src/model/scenario.ts). */
function uwbScenario(
  anchors: Place[], tags: Place[],
  scatterers?: ScattererCfg[],
  session: Partial<UwbSessionCfg> = {},
): Scenario {
  return {
    rooms: [{ x: -2, y: -2, w: 12, h: 10, name: 'lab' }],
    walls: [],
    nodes: [
      ...anchors.map((p, i) => uwbNode(`anc-${i + 1}`, p, 'anchor')),
      ...tags.map((p, i) => uwbNode(`tag-${i + 1}`, p, 'tag')),
    ],
    servers: [],
    seed: 7,
    rtsThresholdBytes: 3000,
    snapshotIntervalMs: 10,
    uwb: { ...DEFAULT_UWB_SESSION, ...session },
    ...(scatterers !== undefined ? { scatterers } : {}),
  }
}

/** A wardrobe 1 m off the 2 m line between the pair: the detour is 2·√2 − 2 = 0.83 m, past the
 * 0.60 m a chip resolves, so this one is separable. */
const WARDROBE: ScattererCfg = { id: 'wardrobe', pos: { x: 1, y: 1, z: 1 }, extraLossDb: -10 }
/** The same object 0.2 m off the line: the detour is 2·√1.04 − 2 = 0.04 m, well inside a chip,
 * so this one merges into the direct path and cannot be told from it. */
const POSTER: ScattererCfg = { id: 'poster', pos: { x: 1, y: 0.2, z: 1 }, extraLossDb: -10 }

const ANCHOR: Place = { x: 0, y: 0, z: 1 }
const TAG: Place = { x: 2, y: 0, z: 1 }

type EchoRecord = Extract<TLRecord, { type: 'UWB_ECHO' }>

const run = (sc: Scenario, ns: number): TLRecord[] => new Simulation(sc).runUntil(ns).records
const echoesOf = (rs: TLRecord[]): EchoRecord[] => rs.filter((r) => r.type === 'UWB_ECHO') as EchoRecord[]

// ---- the channel-level harness, for the geometry cases ------------------------------------
// The same shape as tests/uwb/echo-channel.test.ts's, except that the registered radio is a
// UwbSensor wrapping the stub: that is exactly the object src/uwb/network.ts registers when a
// scenario has the scatterers section, so what this harness records is what a session records.

class StubRadio implements UwbRadio {
  listen = true
  oks: { from: string; frame: FrameDesc; info: UwbRxInfo }[] = []
  fails: { from: string; reason: RxFailReason }[] = []
  starts: { from: string; frame: FrameDesc }[] = []
  listening(): boolean { return this.listen }
  onRxStart(from: string, frame: FrameDesc): void { this.starts.push({ from, frame }) }
  onRxOk(from: string, frame: FrameDesc, info: UwbRxInfo): void { this.oks.push({ from, frame, info }) }
  onRxFail(from: string, reason: RxFailReason): void { this.fails.push({ from, reason }) }
}

function harness(
  nodes: NodeCfg[], scatterers?: ScattererCfg[], walls: Wall[] = [],
  cfg: { channel: 5 | 9; nlos: boolean } = { channel: 9, nlos: false },
) {
  const q = new EventQueue()
  let now: Ns = 0
  const records: TLRecord[] = []
  const emit = makeEmitter((r) => records.push(r))
  const ch = new UwbChannel(q, () => now, nodes, walls, cfg, () => 0, emit, null, scatterers)
  const stubs = new Map<string, StubRadio>()
  for (const n of nodes) {
    const stub = new StubRadio()
    stubs.set(n.id, stub)
    ch.register(n.id, new UwbSensor(n.id, stub, () => now, emit))
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
  return { ch, records, runUntil, of: (id: string): StubRadio => stubs.get(id)!, echoes: () => echoesOf(records) }
}

const pairNodes = (): NodeCfg[] => [uwbNode('anc-1', ANCHOR, 'anchor'), uwbNode('tag-1', TAG, 'tag')]

// ---- what the record says -----------------------------------------------------------------

describe('a receiver handed an echo writes down a measurement', () => {
  it('records one UWB_ECHO per echo, at the receiver, naming the object', () => {
    const h = harness(pairNodes(), [WARDROBE])
    h.ch.transmit('tag-1', makePoll('tag-1', ['anc-1'], 'ss', 0, 0))
    h.runUntil(MS)
    const es = h.echoes()
    expect(es).toHaveLength(1)
    expect(es[0].node).toBe('anc-1')
    expect(es[0].from).toBe('tag-1')
    expect(es[0].scattererId).toBe('wardrobe')
  })

  it('carries the bistatic range R1 + R2 and the delay that implies', () => {
    const h = harness(pairNodes(), [WARDROBE])
    h.ch.transmit('tag-1', makePoll('tag-1', ['anc-1'], 'ss', 0, 0))
    h.runUntil(MS)
    const e = h.echoes()[0]
    // |tag→S| + |S→anc| with both ends and the object at z = 1: √2 + √2.
    expect(e.pathM).toBeCloseTo(2 * Math.SQRT2, 9)
    expect(e.propNs).toBeCloseTo(e.pathM / C_M_PER_NS, 9)
    // Later than the direct ray's own flight, and the record is written at the instant the
    // echo was delivered — the ceiling of that flight time, as every arrival is.
    expect(e.propNs).toBeGreaterThan(2 / C_M_PER_NS)
    expect(e.t).toBe(Math.ceil(e.propNs))
  })

  it('carries the excess path in metres, the resolution in metres, and the verdict', () => {
    const h = harness(pairNodes(), [WARDROBE])
    h.ch.transmit('tag-1', makePoll('tag-1', ['anc-1'], 'ss', 0, 0))
    h.runUntil(MS)
    const e = h.echoes()[0]
    expect(e.excessM).toBeCloseTo(2 * Math.SQRT2 - 2, 9)
    expect(e.resolutionM).toBeCloseTo(RESOLVES_M, 9)
    expect(e.resolvable).toBe(true)
    // The verdict and the two lengths agree: a reader can do the comparison from the record.
    expect(e.excessM > e.resolutionM).toBe(e.resolvable)
  })

  it('carries the level, which is below the direct path it came in behind', () => {
    const h = harness(pairNodes(), [WARDROBE])
    h.ch.transmit('tag-1', makePoll('tag-1', ['anc-1'], 'ss', 0, 0))
    h.runUntil(MS)
    expect(h.echoes()[0].rssiDbm).toBeLessThan(h.of('anc-1').oks[0].info.rssiDbm)
  })
})

// ---- the teaching point -------------------------------------------------------------------

describe('resolution: an object on the line is invisible, and the record says why', () => {
  it('a poster 0.2 m off the line is not resolvable, and the record shows how narrowly', () => {
    const h = harness(pairNodes(), [POSTER])
    h.ch.transmit('tag-1', makePoll('tag-1', ['anc-1'], 'ss', 0, 0))
    h.runUntil(MS)
    const e = h.echoes()[0]
    expect(e.resolvable).toBe(false)
    expect(e.excessM).toBeCloseTo(2 * Math.hypot(1, 0.2) - 2, 9)
    expect(e.excessM).toBeLessThan(e.resolutionM)
    // It is not that nothing arrived: the echo is there, and it is 4 cm of extra path.
    expect(e.excessM).toBeGreaterThan(0)
    expect(e.pathM).toBeGreaterThan(2)
  })

  it('walk the same object away from the line and the verdict flips, on the same run', () => {
    const h = harness(pairNodes(), [POSTER, WARDROBE])
    h.ch.transmit('tag-1', makePoll('tag-1', ['anc-1'], 'ss', 0, 0))
    h.runUntil(MS)
    const by = new Map(h.echoes().map((e) => [e.scattererId, e]))
    expect(by.get('poster')!.resolvable).toBe(false)
    expect(by.get('wardrobe')!.resolvable).toBe(true)
    expect(by.get('poster')!.excessM).toBeLessThan(by.get('wardrobe')!.excessM)
  })

  it('an object exactly on the line adds no path at all, and is not resolvable', () => {
    const h = harness(pairNodes(), [{ id: 'on-the-line', pos: { x: 1, y: 0, z: 1 }, extraLossDb: -10 }])
    h.ch.transmit('tag-1', makePoll('tag-1', ['anc-1'], 'ss', 0, 0))
    h.runUntil(MS)
    const e = h.echoes()[0]
    expect(e.excessM).toBeCloseTo(0, 9)
    expect(e.pathM).toBeCloseTo(2, 9)
    expect(e.resolvable).toBe(false)
  })

  it('a narrowband receiver resolves nothing in a room: 2.5 MHz needs 120 m of detour', () => {
    const h = harness(pairNodes(), [WARDROBE])
    h.ch.transmit('tag-1', makeNbPoll('tag-1', 'anc-1', 3, 0, 0))
    h.runUntil(MS)
    const e = h.echoes()[0]
    expect(e.resolvable).toBe(false)
    // And the record says what it would have taken, which is the point: the same 0.83 m of
    // detour that a chip separates is nothing at all to a 2.5 MHz channel.
    expect(e.resolutionM).toBeGreaterThan(100)
    expect(e.excessM).toBeCloseTo(2 * Math.SQRT2 - 2, 9)
  })
})

// ---- a whole round, through the simulation -------------------------------------------------

describe('a whole SS-TWR round with two objects in the room', () => {
  const sc = (): Scenario => uwbScenario([ANCHOR], [TAG], [WARDROBE, POSTER], { method: 'ss' })

  it('both ends of the exchange record both objects: four echoes per round', () => {
    const es = echoesOf(run(sc(), 30 * MS))
    expect(es).toHaveLength(4)
    // The tag's POLL is reflected to the anchor, and the anchor's RESP back to the tag.
    expect(es.filter((e) => e.node === 'anc-1' && e.from === 'tag-1')).toHaveLength(2)
    expect(es.filter((e) => e.node === 'tag-1' && e.from === 'anc-1')).toHaveLength(2)
    // The bistatic range is the same both ways round — reciprocity — and so is the verdict.
    for (const id of ['wardrobe', 'poster']) {
      const two = es.filter((e) => e.scattererId === id)
      expect(two).toHaveLength(2)
      expect(two[0].pathM).toBeCloseTo(two[1].pathM, 9)
      expect(two[0].resolvable).toBe(two[1].resolvable)
    }
    expect(es.filter((e) => e.scattererId === 'wardrobe').every((e) => e.resolvable)).toBe(true)
    expect(es.filter((e) => e.scattererId === 'poster').every((e) => !e.resolvable)).toBe(true)
  })

  it('and the round still ranges: the UWB_RANGE records are what they are without the objects', () => {
    // Every field except `seq`, which is the record's place in the whole stream and moves by
    // however many echoes were written ahead of it — not part of any measurement. The instant
    // `t`, the counters and the range itself are all compared, and
    // tests/uwb/echo-channel.test.ts pins that `seq` is the only field that can move at all.
    const serialise = (rs: TLRecord[]): string[] => rs
      .filter((r) => r.type === 'UWB_RANGE')
      .map((r) => JSON.stringify(r, Object.keys(r).filter((k) => k !== 'seq').sort()))
    const off = run(uwbScenario([ANCHOR], [TAG], undefined, { method: 'ss' }), 30 * MS)
    const on = run(sc(), 30 * MS)
    expect(serialise(off).length).toBeGreaterThan(0)
    expect(serialise(on)).toEqual(serialise(off))
  })

  it('is deterministic: the same scenario twice, the same timeline hash and the same records', () => {
    const a = new Simulation(sc())
    const b = new Simulation(sc())
    const ra = a.runUntil(30 * MS).records
    const rb = b.runUntil(30 * MS).records
    expect(a.timelineHash()).toBe(b.timelineHash())
    expect(echoesOf(rb).map((e) => JSON.stringify(e))).toEqual(echoesOf(ra).map((e) => JSON.stringify(e)))
  })
})

// ---- the absence, which is what keeps every existing fixture still -------------------------

describe('no scatterers section, no consumer and no record', () => {
  it('a session with no section emits no UWB_ECHO at all', () => {
    expect(echoesOf(run(uwbScenario([ANCHOR], [TAG], undefined, { method: 'ss' }), 30 * MS))).toHaveLength(0)
  })

  it('an empty section is a different statement and still emits none', () => {
    expect(echoesOf(run(uwbScenario([ANCHOR], [TAG], [], { method: 'ss' }), 30 * MS))).toHaveLength(0)
  })

  it('the medium never even offers one: a ranging device implements no onEcho', () => {
    // The structural half of design §3. A UwbDevice has no such method, so with no sensor
    // wrapped round it there is no door for an echo to come through.
    const sim = new Simulation(uwbScenario([ANCHOR], [TAG], undefined, { method: 'ss' }))
    sim.runUntil(MS)
    const dev = sim.uwb!.devices.get('anc-1')!
    expect((dev as unknown as { onEcho?: unknown }).onEcho).toBeUndefined()
  })
})

// ---- the consumers of a record kind --------------------------------------------------------

describe('the event log and the view reducer know the new kind', () => {
  const rec = (over: Partial<EchoRecord>): EchoRecord => ({
    t: 9 as Ns, seq: 1, type: 'UWB_ECHO', node: 'anc-1', from: 'tag-1', scattererId: 'wardrobe',
    pathM: 2.828427, propNs: 9.435, excessM: 0.828427, resolutionM: RESOLVES_M,
    rssiDbm: -71.5, resolvable: true, ...over,
  })

  it('logs a resolvable echo with both lengths and the verdict', () => {
    const line = fmtUwbRecord(rec({}))
    expect(line).toContain('anc-1')
    expect(line).toContain('tag-1')
    expect(line).toContain('wardrobe')
    expect(line).toContain('2.83 m')
    expect(line).toContain('0.83 m')
    expect(line).toContain('0.60 m')
  })

  it('logs an unresolvable one as merged into the direct path', () => {
    const line = fmtUwbRecord(rec({ scattererId: 'poster', excessM: 0.0396, resolvable: false }))
    expect(line).toContain('poster')
    expect(line).toContain('0.04 m')
    expect(line).not.toBe(fmtUwbRecord(rec({})))
  })

  it('is delegated by fmtRecord, so the event log reaches the UWB vocabulary', () => {
    // src/ui/format.ts's switch is the other consumer of a record kind: it returns a string and
    // has no default, so a kind missing from its list is a compile error — but the delegation
    // itself is worth an assertion, as it is for every other UWB type.
    expect(fmtRecord(rec({}))).toBe(fmtUwbRecord(rec({})))
  })

  it('is claimed by the UWB reducer, so the Wi-Fi one never sees it', () => {
    const vs = initViewState(uwbScenario([ANCHOR], [TAG], [WARDROBE], { method: 'ss' }))
    expect(applyUwbRecord(vs, rec({}))).toBe(true)
  })
})
