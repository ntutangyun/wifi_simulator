/**
 * The echo, wired into the UWB medium — and the one thing it must not touch.
 *
 * A scatterer gives every transmission a **second arrival** at every receiver, later and
 * weaker (src/engine/scatter.ts). This file is about the constraint that carries the whole
 * slice (design §3 and §7): **a marked arrival is invisible to ranging.** It is physics before
 * it is a safety net — a 4z/4ab ranging receiver locks the first path and suppresses whatever
 * follows it — and the acceptance test is not "an echo exists" but "switch the scatterers on
 * and every `UWB_RANGE` record is field-for-field what it was without them". That test is
 * first in the file because it is the one that decides whether the slice may ship.
 *
 * The comparison is field-for-field rather than approximate: `serialiseMeasurement` below is the
 * serialisation tests/engine/uwb-record-hashes.test.ts folds into its fixture, so a single digit
 * moving anywhere in a range record fails this file.
 *
 * **One field is compared separately, and it is worth knowing why.** Since the sensing consumer
 * exists (src/uwb/sensing.ts), a scenario with reflecting objects writes `UWB_ECHO` records into
 * the same timeline — so every record after the first echo carries a higher `seq`, which is a
 * record's position in the whole stream and no part of any measurement. `serialiseMeasurement`
 * below therefore drops `seq` and compares everything else, and one test pins that `seq` really
 * is the *only* difference a range record shows. Nothing else about a range may move, and the
 * instant `t` is still compared, so a flight time cannot hide in here.
 */
import { describe, it, expect } from 'vitest'
import { uwbDstwrScenario } from '../../src/course/uwb/uwb-dstwr'
import { uwbMmsScenario } from '../../src/course/uwb/uwb-mms'
import type { ScattererCfg } from '../../src/engine/scatter'
import { EventQueue } from '../../src/engine/events'
import { Simulation } from '../../src/engine/simulation'
import type { FrameDesc } from '../../src/model/frames'
import { makeEmitter, type RxFailReason, type TLRecord } from '../../src/model/records'
import type { NodeCfg, Scenario, Wall } from '../../src/model/scenario'
import type { Ns } from '../../src/model/types'
import { UwbChannel, type EchoInfo, type UwbRadio, type UwbRxInfo } from '../../src/uwb/channel'
import { makeNbPoll, makePoll } from '../../src/uwb/frames'
import { C_M_PER_NS, UWB_CHIP_NS, UWB_RX_SENS_DBM } from '../../src/uwb/phy'

const MS = 1_000_000
/** The window every UWB lesson measures over (tests/engine/uwb-record-hashes.test.ts). */
const RUN_NS = 1300 * MS

// ---- field-for-field record comparison ---------------------------------------------------
// Lifted from tests/engine/uwb-record-hashes.test.ts so the two agree on what "identical"
// means: every own field, in sorted key order, numbers to six decimals.

function serialiseValue(v: unknown): string {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return 'NaN'
    if (v === Infinity) return 'Infinity'
    if (v === -Infinity) return '-Infinity'
    return String(Number(v.toFixed(6)))
  }
  if (typeof v === 'string' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return `[${v.map(serialiseValue).join(',')}]`
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).sort().map((k) => `${k}:${serialiseValue(o[k])}`).join(',')}}`
  }
  return String(v)
}

/** tests/engine/uwb-record-hashes.test.ts's `serialiseRecord`, minus `seq` — see the note at the
 * top of the file. Everything a range *measures* is still in here, `t` included; the one test
 * that cares about `seq` compares it field by field with `serialiseValue` instead. */
function serialiseMeasurement(r: TLRecord): string {
  const o = r as unknown as Record<string, unknown>
  const keys = Object.keys(o).filter((k) => k !== 'seq').sort()
  return keys.map((k) => `${k}:${serialiseValue(o[k])}`).join('|')
}

function runOf(sc: Scenario): { records: TLRecord[]; hash: string } {
  const sim = new Simulation(sc)
  const records = sim.runUntil(RUN_NS).records
  return { records, hash: sim.timelineHash() }
}

const rangeRecordsOf = (records: TLRecord[]): TLRecord[] =>
  records.filter((r) => r.type === 'UWB_RANGE')

const rangesOf = (records: TLRecord[]): string[] =>
  rangeRecordsOf(records).map(serialiseMeasurement)

// ---- the channel-level harness -----------------------------------------------------------

const node = (id: string, x: number, y: number, txPowerDbm = -14): NodeCfg => ({
  id, kind: 'uwb', name: id, pos: { x, y, z: 0 }, txPowerDbm,
  profiles: ['idle'], caps: { generation: 'nonht', features: {} }, uwb: { role: 'anchor' },
})

const wall = (x1: number, y1: number, x2: number, y2: number, material: Wall['material']): Wall =>
  ({ x1, y1, x2, y2, material, openings: [] })

class StubRadio implements UwbRadio {
  listen = true
  starts: { from: string; frame: FrameDesc }[] = []
  oks: { from: string; frame: FrameDesc; info: UwbRxInfo }[] = []
  fails: { from: string; reason: RxFailReason }[] = []
  echoes: { at: Ns; from: string; frame: FrameDesc; echo: EchoInfo }[] = []
  now: () => Ns = () => 0
  listening(): boolean { return this.listen }
  onRxStart(from: string, frame: FrameDesc): void { this.starts.push({ from, frame }) }
  onRxOk(from: string, frame: FrameDesc, info: UwbRxInfo): void { this.oks.push({ from, frame, info }) }
  onRxFail(from: string, reason: RxFailReason): void { this.fails.push({ from, reason }) }
  onEcho(from: string, frame: FrameDesc, echo: EchoInfo): void {
    this.echoes.push({ at: this.now(), from, frame, echo })
  }
}

function harness(
  nodes: NodeCfg[],
  scatterers?: ScattererCfg[],
  walls: Wall[] = [],
  cfg: { channel: 5 | 9; nlos: boolean } = { channel: 9, nlos: false },
) {
  const q = new EventQueue()
  let now: Ns = 0
  const records: TLRecord[] = []
  const emit = makeEmitter((r) => records.push(r))
  const ch = new UwbChannel(q, () => now, nodes, walls, cfg, () => 0, emit, null, scatterers)
  const radios = new Map<string, StubRadio>()
  for (const n of nodes) {
    const r = new StubRadio()
    r.now = () => now
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
  const of = (id: string): StubRadio => radios.get(id)!
  return { q, ch, records, of, runUntil }
}

// ---- the acceptance test, first ----------------------------------------------------------

/**
 * Off the line between every pair in the 10 × 8 m lab of `uwbDstwrScenario`, and well clear of
 * it: 2.5 m south of the phone, so no echo merges into a direct path.
 *
 * −10 dB of reflectivity is a wardrobe rather than an ideal square metre, and it is what it
 * takes for **every** anchor in this lab to hear the echo at all — at 0 dB only the nearest
 * one does, the rest landing under −93 dBm (see the level note further down). That matters
 * here: an acceptance test whose echoes were all rejected on arrival would pass for the wrong
 * reason. `tests/uwb/echo-channel.test.ts`'s own non-vacuity test below pins that they arrive.
 */
const LAB_SCATTERER: ScattererCfg = { id: 's1', pos: { x: 5, y: 1.5, z: 1 }, extraLossDb: -10 }
/** In the first bay of `uwbMmsScenario`'s two-wall lab, among the three anchors and with no wall
 * between: they hear each other's fragments off it, which is what puts an echo in front of
 * `acquired` and the train accumulation. A wardrobe again, and for the same reason — the anchors
 * are up to 7 m apart along that wall, and 0 dB of reflectivity would leave every echo but the
 * shortest under the receiver's floor. */
const MMS_SCATTERER: ScattererCfg = { id: 's1', pos: { x: 1.5, y: 4, z: 1.5 }, extraLossDb: -10 }

describe('ranging cannot see an echo', () => {
  it('a DS-TWR session gives field-for-field identical UWB_RANGE with scatterers on', () => {
    const off = runOf(uwbDstwrScenario({ tag: 10, anchors: -10 }))
    const on = runOf({ ...uwbDstwrScenario({ tag: 10, anchors: -10 }), scatterers: [LAB_SCATTERER] })
    expect(rangesOf(off.records).length).toBeGreaterThan(0)
    expect(rangesOf(on.records)).toEqual(rangesOf(off.records))
  })

  it('an MMS session — where `acquired` and the fragment train decide — is identical too', () => {
    const off = runOf(uwbMmsScenario())
    const on = runOf({ ...uwbMmsScenario(), scatterers: [MMS_SCATTERER] })
    expect(rangesOf(off.records).length).toBeGreaterThan(0)
    expect(rangesOf(on.records)).toEqual(rangesOf(off.records))
  })

  it('every UWB_* record other than the echoes is identical, not only the ranges', () => {
    // UWB_ECHO is excluded because it is the one record the scatterers are *for* — the
    // measurement task 4 added. Everything else the ranging session writes down, from the
    // round and slot boundaries to the timestamps and the fixes, must be untouched.
    const uwbOf = (rs: TLRecord[]): string[] =>
      rs.filter((r) => r.type.startsWith('UWB_') && r.type !== 'UWB_ECHO').map(serialiseMeasurement)
    const off = runOf(uwbDstwrScenario({ tag: 10, anchors: -10 }))
    const on = runOf({ ...uwbDstwrScenario({ tag: 10, anchors: -10 }), scatterers: [LAB_SCATTERER] })
    expect(uwbOf(on.records)).toEqual(uwbOf(off.records))
    // …and the exclusion is not vacuous: this scene really does produce echoes.
    expect(on.records.filter((r) => r.type === 'UWB_ECHO').length).toBeGreaterThan(0)
  })

  it('the only field the scatterers move on a range record is where it sits in the stream', () => {
    const off = rangeRecordsOf(runOf(uwbDstwrScenario({ tag: 10, anchors: -10 })).records)
    const on = rangeRecordsOf(
      runOf({ ...uwbDstwrScenario({ tag: 10, anchors: -10 }), scatterers: [LAB_SCATTERER] }).records,
    )
    expect(on).toHaveLength(off.length)
    expect(off.length).toBeGreaterThan(0)
    for (let i = 0; i < off.length; i++) {
      const a = off[i] as unknown as Record<string, unknown>
      const b = on[i] as unknown as Record<string, unknown>
      expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort())
      const moved = Object.keys(a).filter((k) => serialiseValue(a[k]) !== serialiseValue(b[k]))
      expect(moved).toEqual(['seq'])
      // Later in the stream, never earlier: the echoes ahead of it took sequence numbers.
      expect(b.seq as number).toBeGreaterThan(a.seq as number)
    }
  })

  it('the timeline hash is identical when the scatterers section is absent', () => {
    const a = runOf(uwbDstwrScenario({ tag: 10, anchors: -10 }))
    const b = runOf(uwbDstwrScenario({ tag: 10, anchors: -10 }))
    expect(b.hash).toBe(a.hash)
  })

  it('an empty list is a different statement from absence, and still changes nothing', () => {
    const absent = runOf(uwbDstwrScenario({ tag: 10, anchors: -10 }))
    const empty = runOf({ ...uwbDstwrScenario({ tag: 10, anchors: -10 }), scatterers: [] })
    expect(empty.hash).toBe(absent.hash)
  })

  it('and the echoes really do arrive in that lab — the test above is not vacuous', () => {
    // The same geometry and the same channel as the acceptance runs, driven through the medium
    // directly so the echoes are observable: a ranging device implements no `onEcho`, which is
    // precisely why the runs above cannot see them.
    const sc = uwbDstwrScenario({ tag: 10, anchors: -10 })
    const h = harness(sc.nodes, [LAB_SCATTERER], sc.walls, { channel: 9, nlos: sc.uwb!.nlos })
    h.ch.transmit('tag-1', makePoll('tag-1', ['anchor-1'], 'ds', 0, 0))
    h.runUntil(1_000_000)
    for (const a of ['anchor-1', 'anchor-2', 'anchor-3', 'anchor-4']) {
      expect(h.of(a).echoes.map((e) => e.echo.scattererId)).toEqual(['s1'])
      expect(h.of(a).echoes[0].echo.resolvable).toBe(true)
    }
  })

  it('and so do the MMS lab\'s, between the anchors that share its first bay', () => {
    const sc = uwbMmsScenario()
    const h = harness(sc.nodes, [MMS_SCATTERER], sc.walls, { channel: 9, nlos: sc.uwb!.nlos })
    h.ch.transmit('anchor-1', makePoll('anchor-1', ['anchor-2'], 'ss', 0, 0))
    h.runUntil(1_000_000)
    // A 4z poll is the stricter gate of the two: a fragment is delivered further below
    // sensitivity still (`MMS_COMBINE_MAX_DB`), so an echo audible here is audible in the train.
    expect(h.of('anchor-2').echoes).toHaveLength(1)
    expect(h.of('anchor-3').echoes).toHaveLength(1)
  })

  it('is deterministic with scatterers on: the same scenario and seed twice, the same hash', () => {
    const sc = (): Scenario =>
      ({ ...uwbDstwrScenario({ tag: 10, anchors: -10 }), scatterers: [LAB_SCATTERER] })
    expect(runOf(sc()).hash).toBe(runOf(sc()).hash)
  })
})

// ---- the echo itself ---------------------------------------------------------------------

/**
 * A two-metre pair, deliberately close together.
 *
 * The level, not the geometry, is what sets this scale. An echo pays a path loss on each leg
 * and gets back only the aperture the two-leg sum double-charged, so a one-square-metre object
 * halfway along a **ten**-metre line comes in at −106 dBm on channel 9 — thirteen dB under this
 * receiver's −93 dBm and therefore never delivered at all. At two metres the same object is
 * −81.5 dBm and audible. That is the bistatic radar relation, not a knob, and it is worth
 * knowing before a lesson scene puts a reflector across a lab.
 */
describe('an echo is a second arrival', () => {
  const nodes = [node('a', 0, 0), node('b', 2, 0)]
  /** 1 m off the 2 m line: the detour is 2·√2 − 2 = 0.83 m, past the 0.6 m a chip resolves,
   * so this echo is a separable one. */
  const s: ScattererCfg = { id: 's1', pos: { x: 1, y: 1, z: 0 }, extraLossDb: 0 }

  it('arrives later than the direct path', () => {
    const h = harness(nodes, [s])
    h.ch.transmit('a', makePoll('a', ['b'], 'ss', 0, 0))
    h.runUntil(1_000_000)
    const b = h.of('b')
    expect(b.oks).toHaveLength(1)
    expect(b.echoes).toHaveLength(1)
    const directNs = b.oks[0].info.propNs
    expect(b.echoes[0].echo.propNs).toBeGreaterThan(directNs)
    // And the instant it was delivered at is the ceiling of that flight time, as the direct
    // path's is: the event queue runs on whole nanoseconds.
    expect(b.echoes[0].at).toBe(Math.ceil(b.echoes[0].echo.propNs))
  })

  it('arrives weaker than the direct path', () => {
    const h = harness(nodes, [s])
    h.ch.transmit('a', makePoll('a', ['b'], 'ss', 0, 0))
    h.runUntil(1_000_000)
    const b = h.of('b')
    expect(b.echoes[0].echo.rssiDbm).toBeLessThan(b.oks[0].info.rssiDbm)
  })

  it('reports the bistatic geometry: which object, how far round, how much further', () => {
    const h = harness(nodes, [s])
    h.ch.transmit('a', makePoll('a', ['b'], 'ss', 0, 0))
    h.runUntil(1_000_000)
    const e = h.of('b').echoes[0].echo
    expect(e.scattererId).toBe('s1')
    expect(e.pathM).toBeCloseTo(2 * Math.SQRT2, 9)
    expect(e.excessM).toBeCloseTo(2 * Math.SQRT2 - 2, 9)
    expect(e.propNs).toBeCloseTo(e.pathM / C_M_PER_NS, 9)
  })

  it('a scatterer on the line is not resolvable; one 1 m off it is', () => {
    const on = harness(nodes, [{ id: 'on', pos: { x: 1, y: 0, z: 0 }, extraLossDb: 0 }])
    on.ch.transmit('a', makePoll('a', ['b'], 'ss', 0, 0))
    on.runUntil(1_000_000)
    expect(on.of('b').echoes[0].echo.excessM).toBeCloseTo(0, 9)
    expect(on.of('b').echoes[0].echo.resolvable).toBe(false)

    const off = harness(nodes, [s])
    off.ch.transmit('a', makePoll('a', ['b'], 'ss', 0, 0))
    off.runUntil(1_000_000)
    const e = off.of('b').echoes[0].echo
    expect(e.excessM).toBeGreaterThan(C_M_PER_NS * UWB_CHIP_NS)
    expect(e.resolvable).toBe(true)
  })

  it('one echo per scatterer per receiver', () => {
    const three = [
      { id: 's1', pos: { x: 0.8, y: 0.8, z: 0 }, extraLossDb: 0 },
      { id: 's2', pos: { x: 1, y: 1, z: 0 }, extraLossDb: 0 },
      { id: 's3', pos: { x: 1.2, y: 0.6, z: 0 }, extraLossDb: 0 },
    ]
    const h = harness([node('a', 0, 0), node('b', 2, 0), node('c', 0, 2)], three)
    h.ch.transmit('a', makePoll('a', ['b'], 'ss', 0, 0))
    h.runUntil(1_000_000)
    expect(h.of('b').echoes.map((e) => e.echo.scattererId).sort()).toEqual(['s1', 's2', 's3'])
    expect(h.of('c').echoes.map((e) => e.echo.scattererId).sort()).toEqual(['s1', 's2', 's3'])
    // Not back at the transmitter: this slice models bistatic echoes only.
    expect(h.of('a').echoes).toHaveLength(0)
  })

  it('a weaker object gives a weaker echo, dB for dB', () => {
    const loud = harness(nodes, [{ ...s, extraLossDb: 0 }])
    loud.ch.transmit('a', makePoll('a', ['b'], 'ss', 0, 0))
    loud.runUntil(1_000_000)
    const quiet = harness(nodes, [{ ...s, extraLossDb: 6 }])
    quiet.ch.transmit('a', makePoll('a', ['b'], 'ss', 0, 0))
    quiet.runUntil(1_000_000)
    expect(loud.of('b').echoes[0].echo.rssiDbm - quiet.of('b').echoes[0].echo.rssiDbm)
      .toBeCloseTo(6, 9)
  })

  it('no scatterers section, no echoes at all', () => {
    const h = harness(nodes)
    h.ch.transmit('a', makePoll('a', ['b'], 'ss', 0, 0))
    h.runUntil(1_000_000)
    expect(h.of('b').echoes).toHaveLength(0)
    expect(h.of('b').oks).toHaveLength(1)
  })

  it('an empty section is the branch taken with nothing to reflect off', () => {
    const h = harness(nodes, [])
    h.ch.transmit('a', makePoll('a', ['b'], 'ss', 0, 0))
    h.runUntil(1_000_000)
    expect(h.of('b').echoes).toHaveLength(0)
  })

  it('walls are charged per leg, so a wall between the object and the receiver costs', () => {
    // A more reflective object than the ideal square metre, because the brick this test puts in
    // the way costs 12 dB and the bare echo has only 11 dB of margin over −93 dBm to spend.
    const s = { id: 's1', pos: { x: 1, y: 1, z: 0 }, extraLossDb: -15 }
    const clear = harness(nodes, [s])
    clear.ch.transmit('a', makePoll('a', ['b'], 'ss', 0, 0))
    clear.runUntil(1_000_000)
    // A wall across the second leg only: the segment from the object at (1, 1) to b at (2, 0)
    // crosses x = 1.5 at y = 0.5, inside this wall; the first leg never reaches x = 1.5 and the
    // direct ray runs along y = 0, below the wall's lower end.
    const walled = harness(nodes, [s], [wall(1.5, 0.3, 1.5, 2, 'brick')])
    walled.ch.transmit('a', makePoll('a', ['b'], 'ss', 0, 0))
    walled.runUntil(1_000_000)
    expect(walled.of('b').echoes[0].echo.rssiDbm)
      .toBeLessThan(clear.of('b').echoes[0].echo.rssiDbm - 1)
    // And the direct path, which does not cross that wall, is untouched.
    expect(walled.of('b').oks[0].info.rssiDbm).toBeCloseTo(clear.of('b').oks[0].info.rssiDbm, 9)
  })

  it('a narrowband message resolves nothing: 2.5 MHz cannot separate a room-sized detour', () => {
    const h = harness(nodes, [s])
    h.ch.transmit('a', makeNbPoll('a', 'b', 3, 0, 0))
    h.runUntil(1_000_000)
    expect(h.of('b').echoes).toHaveLength(1)
    expect(h.of('b').echoes[0].echo.resolvable).toBe(false)
  })
})

// ---- the invisibility, at the medium ------------------------------------------------------

describe('a marked arrival never becomes a reception', () => {
  const nodes = [node('a', 0, 0), node('b', 2, 0)]
  const s: ScattererCfg = { id: 's1', pos: { x: 1, y: 1, z: 0 }, extraLossDb: 0 }

  it('emits no record of its own — the whole timeline is what it was', () => {
    const off = harness(nodes)
    off.ch.transmit('a', makePoll('a', ['b'], 'ss', 0, 0))
    off.runUntil(1_000_000)
    const on = harness(nodes, [s])
    on.ch.transmit('a', makePoll('a', ['b'], 'ss', 0, 0))
    on.runUntil(1_000_000)
    expect(on.records.map((r) => `${r.t}:${r.type}`)).toEqual(off.records.map((r) => `${r.t}:${r.type}`))
  })

  it('starts no second reception at the receiver', () => {
    const h = harness(nodes, [s])
    h.ch.transmit('a', makePoll('a', ['b'], 'ss', 0, 0))
    h.runUntil(1_000_000)
    expect(h.of('b').starts).toHaveLength(1)
    expect(h.of('b').oks).toHaveLength(1)
    expect(h.of('b').fails).toHaveLength(0)
  })

  it('does not enter the capture contest: a loud echo cannot doom the direct path', () => {
    // An object that reflects far better than an ideal square metre and stands almost on the
    // line, so its echo is both louder than the direct ray and lands in the same nanosecond —
    // the same batch. Were it a reception it would take the radio, or spoil it.
    const h = harness(nodes, [{ id: 'mirror', pos: { x: 1, y: 0.2, z: 0 }, extraLossDb: -40 }])
    h.ch.transmit('a', makePoll('a', ['b'], 'ss', 0, 0))
    h.runUntil(1_000_000)
    expect(h.of('b').echoes).toHaveLength(1)
    expect(h.of('b').echoes[0].echo.rssiDbm).toBeGreaterThan(h.of('b').oks[0].info.rssiDbm)
    expect(h.of('b').oks).toHaveLength(1)
    expect(h.of('b').fails).toHaveLength(0)
  })

  it('an echo below the receiver\'s sensitivity is not delivered', () => {
    const far = harness(nodes, [
      { id: 'faint', pos: { x: 1, y: 1, z: 0 }, extraLossDb: 120 },
    ])
    far.ch.transmit('a', makePoll('a', ['b'], 'ss', 0, 0))
    far.runUntil(1_000_000)
    expect(far.of('b').oks).toHaveLength(1)
    expect(far.of('b').echoes).toHaveLength(0)
  })

  it('a radio that is not listening hears no echo', () => {
    const h = harness(nodes, [s])
    h.of('b').listen = false
    h.ch.transmit('a', makePoll('a', ['b'], 'ss', 0, 0))
    h.runUntil(1_000_000)
    expect(h.of('b').echoes).toHaveLength(0)
  })

  it('the echo it does hear clears the same sensitivity the direct path does', () => {
    const h = harness(nodes, [s])
    h.ch.transmit('a', makePoll('a', ['b'], 'ss', 0, 0))
    h.runUntil(1_000_000)
    expect(h.of('b').echoes[0].echo.rssiDbm).toBeGreaterThanOrEqual(UWB_RX_SENS_DBM)
  })
})
