/**
 * The UWB side of the 6 GHz coupling: a `UwbChannel` handed a `Spectrum` puts
 * every PPDU it radiates on the shared air, tracks the worst in-band Wi-Fi
 * power over each open reception, and loses the frame when the ratio falls
 * past `UWB_SIR_MIN_DB` — and behaves exactly as before when handed none.
 *
 * Every level is derived from the engine's own functions rather than written
 * out as a number, so a change to a path-loss law moves the test with the
 * model instead of silently breaking it; the numbers beside them are what
 * those functions produce today.
 */
import { describe, expect, it } from 'vitest'
import { EventQueue } from '../../src/engine/events'
import { Spectrum, uwbToWifiPathLossDb, wifiToUwbPathLossDb, type Emission } from '../../src/engine/spectrum'
import type { FrameDesc } from '../../src/model/frames'
import { makeEmitter, type RxFailReason, type TLRecord } from '../../src/model/records'
import type { NodeCfg } from '../../src/model/scenario'
import type { Ns, Vec3 } from '../../src/model/types'
import { UwbChannel, type UwbRadio, type UwbRxInfo } from '../../src/uwb/channel'
import { makeNbPoll, makePoll } from '../../src/uwb/frames'
import {
  NB_LBT_THRESHOLD_DBM, NB_SIR_MIN_DB, NB_TX_DBM, nbBand, nbPl0Db,
} from '../../src/uwb/nb'
import {
  UWB_CAPTURE_DB, UWB_PL_EXP, UWB_SIR_MIN_DB, UWB_TX_POWER_DBM, uwbInBandDbm, uwbPl0Db,
} from '../../src/uwb/phy'

/** 6 GHz channel 71: 6305 MHz centre, 80 MHz — wholly inside UWB channel 5's band. */
const WIFI_LO_MHZ = 6305 - 40
const WIFI_HI_MHZ = 6305 + 40

const node = (id: string, p: Vec3, role: 'anchor' | 'tag'): NodeCfg => ({
  id, kind: 'uwb', name: id, pos: p, txPowerDbm: UWB_TX_POWER_DBM,
  profiles: ['idle'], caps: { generation: 'nonht', features: {} }, uwb: { role },
})

/** The tag polls from the origin; the anchor stands 5 m away; the AP 3 m from the anchor. */
const TAG_POS: Vec3 = { x: 0, y: 0, z: 0 }
const ANC_POS: Vec3 = { x: 5, y: 0, z: 0 }
const AP_POS: Vec3 = { x: 5, y: 3, z: 0 }
const UWB_DIST_M = 5
const AP_DIST_M = 3

const NODES = [node('t', TAG_POS, 'tag'), node('a', ANC_POS, 'anchor')]

/** What the anchor hears of the tag's Poll: −14 dBm over 5 m of UWB free space. */
const RSSI_DBM = UWB_TX_POWER_DBM - uwbPl0Db(5) - 10 * UWB_PL_EXP * Math.log10(UWB_DIST_M)

/** The AP's whole 80 MHz sits inside the UWB band, so all of its EIRP lands at the anchor. */
const foreignAtAnchor = (eirpDbm: number): number => eirpDbm - wifiToUwbPathLossDb(AP_DIST_M, 0)

/** The AP EIRP that leaves the anchor exactly `sirDb` of signal-to-interference. */
const eirpForSir = (sirDb: number): number => RSSI_DBM - sirDb + wifiToUwbPathLossDb(AP_DIST_M, 0)

const wifiEmission = (eirpDbm: number): Emission => ({
  txId: 'ap', eirpDbm, bandLoMhz: WIFI_LO_MHZ, bandHiMhz: WIFI_HI_MHZ, pos: AP_POS,
  lossDb: wifiToUwbPathLossDb,
})

class StubRadio implements UwbRadio {
  oks: { from: string; info: UwbRxInfo }[] = []
  fails: { from: string; reason: RxFailReason }[] = []
  listening(): boolean { return true }
  onRxStart(): void {}
  onRxOk(from: string, _frame: FrameDesc, info: UwbRxInfo): void { this.oks.push({ from, info }) }
  onRxFail(from: string, reason: RxFailReason): void { this.fails.push({ from, reason }) }
}

/** A UWB channel on channel 5, with or without a Spectrum beside it; two nodes unless a test
 * needs a third to collide with. */
function harness(withSpectrum: boolean, nodes: NodeCfg[] = NODES) {
  const q = new EventQueue()
  let now: Ns = 0
  const records: TLRecord[] = []
  const emit = makeEmitter((r) => records.push(r))
  const s = new Spectrum([], q, () => now)
  const ch = new UwbChannel(
    q, () => now, nodes, [], { channel: 5, nlos: false }, () => 0, emit,
    withSpectrum ? s : null,
  )
  const radios = new Map<string, StubRadio>()
  for (const n of nodes) {
    const r = new StubRadio()
    radios.set(n.id, r)
    ch.register(n.id, r)
  }
  return {
    ch, s, records, radioOf: (id: string): StubRadio => radios.get(id)!,
    at: (t: Ns, fn: () => void): void => { q.schedule(t, fn) },
    runUntil: (t: Ns): void => {
      for (;;) {
        const next = q.peekTime()
        if (next === null || next > t) break
        const ev = q.pop()!
        now = ev.t
        ev.fn()
      }
      now = t
    },
  }
}

const poll = (): FrameDesc => makePoll('t', ['a'], 'ss', 0, 0)

interface Outcome {
  fail: Extract<TLRecord, { type: 'RX_FAIL' }> | undefined
  ok: Extract<TLRecord, { type: 'RX_OK' }> | undefined
  interfered: Extract<TLRecord, { type: 'UWB_INTERFERED' }> | undefined
  radio: StubRadio
  records: TLRecord[]
}

/**
 * One Poll from the tag to the anchor. `emitAt` says when the AP's PPDU joins
 * the air: `null` for no Wi-Fi at all, 0 for before the Poll leaves, a later
 * instant for a PPDU that starts in the middle of the reception.
 */
function receive(opts: { eirpDbm: number; emitAt: Ns | null; spectrum?: boolean }): Outcome {
  const h = harness(opts.spectrum ?? true)
  h.at(0, () => h.ch.transmit('t', poll()))
  if (opts.emitAt !== null) h.at(opts.emitAt, () => h.s.emit('wifi', wifiEmission(opts.eirpDbm)))
  h.runUntil(10_000_000)
  const at = <T extends TLRecord['type']>(type: T): Extract<TLRecord, { type: T }> | undefined =>
    h.records.find((r) => r.type === type && 'node' in r && r.node === 'a') as never
  return {
    fail: at('RX_FAIL'), ok: at('RX_OK'), interfered: at('UWB_INTERFERED'),
    radio: h.radioOf('a'), records: h.records,
  }
}

describe('UwbChannel · a reception under in-band Wi-Fi power', () => {
  it('loses a clean frame to an overlapping Wi-Fi PPDU', () => {
    // −14 dBm at 5 m of UWB free space against +20 dBm EIRP at 3 m of the Wi-Fi
    // link's own law: 34.5 dB of interference over the wanted signal, where the
    // receiver's correlation gain is only good for 12.
    expect(RSSI_DBM).toBeCloseTo(-76.67, 2)
    expect(foreignAtAnchor(20)).toBeCloseTo(-42.21, 2)
    const out = receive({ eirpDbm: 20, emitAt: 0 })
    expect(out.ok).toBeUndefined()
    expect(out.fail?.reason).toBe('lowSinr')
    expect(out.interfered).toBeDefined()
    expect(out.interfered?.from).toBe('t')
    expect(out.interfered?.foreignDbm).toBeCloseTo(-42.21, 2)
    expect(out.interfered?.sirDb).toBeCloseTo(-34.46, 2)
    // The record follows its RX_FAIL, at the same instant, and the radio is told.
    expect(out.interfered?.t).toBe(out.fail?.t)
    expect(out.interfered?.seq).toBe((out.fail?.seq ?? 0) + 1)
    expect(out.radio.fails).toEqual([{ from: 't', reason: 'lowSinr' }])
    expect(out.radio.oks).toEqual([])
  })

  it('decodes through a Wi-Fi PPDU 20 dB below the wanted signal', () => {
    const out = receive({ eirpDbm: eirpForSir(20), emitAt: 0 })
    expect(out.fail).toBeUndefined()
    expect(out.interfered).toBeUndefined()
    expect(out.ok).toBeDefined()
    // The reception still reports what it fought through.
    expect(out.radio.oks[0].info.foreignDbm).toBeCloseTo(RSSI_DBM - 20, 6)
  })

  it('turns over exactly at UWB_SIR_MIN_DB', () => {
    expect(receive({ eirpDbm: eirpForSir(UWB_SIR_MIN_DB + 0.1), emitAt: 0 }).ok).toBeDefined()
    expect(receive({ eirpDbm: eirpForSir(UWB_SIR_MIN_DB - 0.1), emitAt: 0 }).fail?.reason).toBe('lowSinr')
  })

  it('counts a Wi-Fi PPDU that only starts in the middle of the reception', () => {
    // The Poll is ~180 µs of air; at 100 µs the anchor is already locked on it,
    // and the foreign power it saw at arrival was zero.
    const out = receive({ eirpDbm: 20, emitAt: 100_000 })
    expect(out.ok).toBeUndefined()
    expect(out.fail?.reason).toBe('lowSinr')
    expect(out.interfered?.sirDb).toBeCloseTo(-34.46, 2)
    expect(out.records.find((r) => r.type === 'RX_START' && r.node === 'a')?.t).toBeLessThan(100_000)
  })

  it('reports a collided frame as a collision, never as interference', () => {
    // Two transmitters the same distance from the anchor, so neither captures the other, under
    // the same +20 dBm of Wi-Fi that kills a clean frame above. The collision decision is taken
    // first and returns, so the reception never reaches the SIR test: one RX_FAIL, reason
    // collision, and no UWB_INTERFERED anywhere - the lesson counts those per second, and a leak
    // from the collision path would inflate the headline number it prints.
    const second = node('t2', { x: 0, y: 0.2, z: 0 }, 'tag')
    const h = harness(true, [...NODES, second])
    h.at(0, () => h.ch.transmit('t', poll()))
    h.at(0, () => h.ch.transmit('t2', makePoll('t2', ['a'], 'ss', 0, 0)))
    h.at(0, () => h.s.emit('wifi', wifiEmission(20)))
    h.runUntil(10_000_000)
    const fails = h.records.filter((r) => r.type === 'RX_FAIL' && r.node === 'a')
    // both frames are lost, each as a collision: neither captured the other
    expect(fails.map((r) => (r as Extract<TLRecord, { type: 'RX_FAIL' }>).reason)).toEqual(['collision', 'collision'])
    expect(h.records.some((r) => r.type === 'UWB_INTERFERED')).toBe(false)
    // and the two levels really are inside the capture margin
    const dA = Math.hypot(ANC_POS.x - TAG_POS.x, ANC_POS.y - TAG_POS.y)
    const dB = Math.hypot(ANC_POS.x - second.pos.x, ANC_POS.y - second.pos.y)
    expect(Math.abs(10 * UWB_PL_EXP * Math.log10(dB / dA))).toBeLessThan(UWB_CAPTURE_DB)
  })

  it('leaves every record untouched when nothing foreign is on the air', () => {
    const bare = receive({ eirpDbm: 0, emitAt: null, spectrum: false })
    expect(bare.ok).toBeDefined()
    expect(bare.radio.oks[0].info.foreignDbm).toBe(-Infinity)
    // A Spectrum with nothing on it contributes exactly 0 mW to the reception.
    const empty = receive({ eirpDbm: 0, emitAt: null, spectrum: true })
    expect(empty.records).toEqual(bare.records)
    expect(empty.radio.oks[0].info.foreignDbm).toBe(-Infinity)
  })
})

describe('UwbChannel · the PPDU it puts on the shared air', () => {
  it('is live for exactly the PPDU, from TX_START to TX_END', () => {
    const h = harness(true)
    const at2m: Vec3 = { x: 0, y: 2, z: 0 }
    const seen = (): number => h.s.foreignDbm('wifi', at2m, WIFI_LO_MHZ, WIFI_HI_MHZ)
    const readings: { t: Ns; dbm: number }[] = []
    h.at(0, () => h.ch.transmit('t', poll()))
    for (const t of [0, 1000, 100_000, 300_000]) h.at(t, () => { readings.push({ t, dbm: seen() }) })
    h.runUntil(10_000_000)
    const txEnd = h.records.find((r) => r.type === 'TX_END')!.t
    // 80 MHz of the Poll's 499.2 MHz reaches a Wi-Fi receiver 2 m away.
    const expected = uwbInBandDbm(UWB_TX_POWER_DBM, WIFI_HI_MHZ - WIFI_LO_MHZ) - uwbToWifiPathLossDb(2, 0, 5)
    expect(expected).toBeCloseTo(-76.66, 2)
    expect(readings.filter((r) => r.t < txEnd).map((r) => r.dbm)).toEqual([expected, expected, expected])
    expect(readings.find((r) => r.t > txEnd)?.dbm).toBe(-Infinity)
  })
})


// --- P802.15.4ab: the narrowband radio under the same 6 GHz Wi-Fi ---------------------

/** A UNII-5 control channel: 5926.25 + 2.5 x 150 = 6301.25 MHz, wholly inside the AP's
 * 6265-6345 MHz channel. 4ab draft 15-22/0381r5 s1.4.1 */
const NB_UNII5 = 200
/** A UNII-3 control channel (the session default): 5733.75 MHz, nowhere near the AP. */
const NB_UNII3 = 3

/** What the anchor hears of a narrowband message from the tag 5 m away. */
const nbRssiDbm = (ch: number): number =>
  NB_TX_DBM - nbPl0Db(ch) - 10 * UWB_PL_EXP * Math.log10(UWB_DIST_M)

/** The AP's EIRP that lands at the anchor inside one 2.5 MHz narrowband channel. */
const foreignInNbChannel = (eirpDbm: number): number =>
  eirpDbm + 10 * Math.log10(2.5 / (WIFI_HI_MHZ - WIFI_LO_MHZ)) - wifiToUwbPathLossDb(AP_DIST_M, 0)

describe('UwbChannel . a narrowband reception uses its own band, power and SIR floor', () => {
  it('sees no Wi-Fi at all on a UNII-3 control channel the AP cannot reach', () => {
    const h = harness(true)
    h.at(0, () => h.ch.transmit('t', makeNbPoll('t', 'a', NB_UNII3, 0, 0)))
    h.at(0, () => h.s.emit('wifi', wifiEmission(20)))
    h.runUntil(10_000_000)
    const ok = h.radioOf('a').oks[0]
    expect(ok).toBeDefined()
    // the same instant, the same AP: a 4z reception would have been swamped, but the query band
    // is the NB channel's 2.5 MHz and the AP's 80 MHz does not touch it
    expect(nbBand(NB_UNII3).hi).toBeLessThan(WIFI_LO_MHZ)
    expect(ok.info.foreignDbm).toBe(-Infinity)
    expect(ok.info.rssiDbm).toBeCloseTo(nbRssiDbm(NB_UNII3), 9)
  })

  it('loses a UNII-5 message to the same PPDU, and says so with UWB_INTERFERED', () => {
    // NB has no correlation gain to spend: it is lost as soon as the foreign power reaches its own
    expect(NB_SIR_MIN_DB).toBe(0)
    expect(NB_SIR_MIN_DB).toBeGreaterThan(UWB_SIR_MIN_DB)
    const eirp = 30
    expect(foreignInNbChannel(eirp)).toBeGreaterThan(nbRssiDbm(NB_UNII5))

    const h = harness(true)
    h.at(0, () => h.ch.transmit('t', makeNbPoll('t', 'a', NB_UNII5, 0, 0)))
    h.at(0, () => h.s.emit('wifi', wifiEmission(eirp)))
    h.runUntil(10_000_000)
    const interfered = h.records.find((r) => r.type === 'UWB_INTERFERED')
    expect(interfered).toMatchObject({ type: 'UWB_INTERFERED', node: 'a', from: 't' })
    expect(interfered && 'foreignDbm' in interfered ? interfered.foreignDbm : 0)
      .toBeCloseTo(foreignInNbChannel(eirp), 9)
    expect(h.radioOf('a').fails.map((f) => f.reason)).toEqual(['lowSinr'])
  })
})

describe('UwbChannel . listen before talk on the narrowband channel', () => {
  /** Two would-be transmitters, 8 m and 9.5 m from the AP, on either side of the crossing. */
  const lbtNodes = [
    node('t', TAG_POS, 'tag'),
    node('near', { x: AP_POS.x, y: AP_POS.y + 8, z: AP_POS.z }, 'anchor'),
    node('far', { x: AP_POS.x, y: AP_POS.y + 9.5, z: AP_POS.z }, 'anchor'),
  ]

  it('is busy inside 8.6 m of a transmitting 6E AP and clear outside it', () => {
    // -75 dBm/MHz over 2.5 MHz. 4ab draft 15-22/0381r5 s1.4.2
    expect(NB_LBT_THRESHOLD_DBM).toBeCloseTo(-71.02, 2)
    const h = harness(true, lbtNodes)
    h.s.emit('wifi', wifiEmission(20))

    const near = h.ch.lbtBusy('near', NB_UNII5)
    const far = h.ch.lbtBusy('far', NB_UNII5)
    // an 80 MHz 20 dBm PPDU puts 4.95 dBm into 2.5 MHz; under the Wi-Fi law that is
    // -70.04 dBm at 8 m and -72.28 dBm at 9.5 m, so the crossing is at 8.63 m
    expect(near.foreignDbm).toBeCloseTo(-70.04, 2)
    expect(far.foreignDbm).toBeCloseTo(-72.28, 2)
    expect(near.busy).toBe(true)
    expect(far.busy).toBe(false)
  })

  it('reads nothing but the mediator: a silent AP, a UNII-3 channel and no mediator are all clear', () => {
    const quiet = harness(true, lbtNodes)
    expect(quiet.ch.lbtBusy('near', NB_UNII5)).toEqual({ busy: false, foreignDbm: -Infinity })

    const loud = harness(true, lbtNodes)
    loud.s.emit('wifi', wifiEmission(20))
    // the same PPDU, a UNII-3 channel: nothing of it lands in the band at all
    expect(loud.ch.lbtBusy('near', NB_UNII3)).toEqual({ busy: false, foreignDbm: -Infinity })

    const uncoupled = harness(false, lbtNodes)
    expect(uncoupled.ch.lbtBusy('near', NB_UNII5)).toEqual({ busy: false, foreignDbm: -Infinity })
  })
})
