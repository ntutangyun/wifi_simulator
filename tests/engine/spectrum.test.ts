import { describe, it, expect } from 'vitest'
import { EventQueue } from '../../src/engine/events'
import {
  Spectrum,
  bandOverlapMhz,
  uwbToWifiPathLossDb,
  wifiToUwbPathLossDb,
  type Emission,
} from '../../src/engine/spectrum'
import type { Wall } from '../../src/model/scenario'
import type { Ns, Vec3 } from '../../src/model/types'

/** UWB channel 5: 6489.6 MHz centre, 499.2 MHz wide. */
const UWB5_LO = 6240
const UWB5_HI = 6739.2
/** UWB channel 9: 7987.2 MHz centre. */
const UWB9_LO = 7737.6
const UWB9_HI = 8236.8
/** Wi-Fi 6 GHz channel 71: 6305 MHz centre, 80 MHz wide. */
const WIFI_LO = 6265
const WIFI_HI = 6345

const at = (x: number): Vec3 => ({ x, y: 0, z: 1 })

const drywallAt = (x: number): Wall => ({
  x1: x,
  y1: -2,
  x2: x,
  y2: 2,
  material: 'drywall',
  openings: [],
})

const wifiPpdu = (pos: Vec3, txId = 'ap'): Emission => ({
  txId,
  eirpDbm: 20,
  bandLoMhz: WIFI_LO,
  bandHiMhz: WIFI_HI,
  pos,
})

const uwbFrame = (pos: Vec3, txId = 'anchor'): Emission => ({
  txId,
  eirpDbm: -14,
  bandLoMhz: UWB5_LO,
  bandHiMhz: UWB5_HI,
  pos,
})

/** Drive a real queue up to and including `t`, keeping the clock the handlers see. */
function makeClock(q: EventQueue): { now: () => Ns; runUntil: (t: Ns) => void } {
  let now: Ns = 0
  return {
    now: () => now,
    runUntil: (t: Ns) => {
      for (;;) {
        const next = q.peekTime()
        if (next === null || next > t) break
        const e = q.pop()
        if (!e) break
        now = e.t
        e.fn()
      }
      now = t
    },
  }
}

describe('band overlap', () => {
  it('is the width of the intersection, zero when disjoint', () => {
    expect(bandOverlapMhz(WIFI_LO, WIFI_HI, UWB5_LO, UWB5_HI)).toBeCloseTo(80, 6)
    expect(bandOverlapMhz(WIFI_LO, WIFI_HI, UWB9_LO, UWB9_HI)).toBe(0)
    expect(bandOverlapMhz(6200, 6280, UWB5_LO, UWB5_HI)).toBeCloseTo(40, 6)
  })
})

describe('cross-technology path loss', () => {
  it('uses the transmitter law on each side', () => {
    // 46.7 + 30·log10(3) + 1.2
    expect(wifiToUwbPathLossDb(3, 0)).toBeCloseTo(62.21, 2)
    // uwbPl0Db(5) ≈ 48.69, + 20·log10(4)
    expect(uwbToWifiPathLossDb(4, 0, 5)).toBeCloseTo(60.73, 2)
    expect(wifiToUwbPathLossDb(0.01, 0)).toBeCloseTo(wifiToUwbPathLossDb(0.1, 0), 9)
  })
})

describe('Spectrum foreign power', () => {
  it('gives a UWB receiver the Wi-Fi PPDU in band at 3 m', () => {
    const q = new EventQueue()
    const clock = makeClock(q)
    const s = new Spectrum([], q, clock.now)
    s.emit('wifi', wifiPpdu(at(0)))
    // the whole 80 MHz channel is inside the UWB band: 20 − 62.2 dB
    expect(s.foreignDbm('uwb', at(3), UWB5_LO, UWB5_HI)).toBeCloseTo(-42.2, 1)
  })

  it('reports nothing on UWB channel 9', () => {
    const q = new EventQueue()
    const clock = makeClock(q)
    const s = new Spectrum([], q, clock.now)
    s.emit('wifi', wifiPpdu(at(0)))
    expect(s.foreignMw('uwb', at(3), UWB9_LO, UWB9_HI)).toBe(0)
    expect(s.foreignDbm('uwb', at(3), UWB9_LO, UWB9_HI)).toBe(-Infinity)
  })

  it('gives a Wi-Fi receiver the slice of a UWB frame inside its channel at 4 m', () => {
    const q = new EventQueue()
    const clock = makeClock(q)
    const s = new Spectrum([], q, clock.now)
    s.emit('uwb', uwbFrame(at(0)))
    // −14 + 10·log10(80/499.2) − (48.69 + 12.04)
    expect(s.foreignDbm('wifi', at(4), WIFI_LO, WIFI_HI)).toBeCloseTo(-82.7, 1)
  })

  it('is silent when the other side has no live emission', () => {
    const q = new EventQueue()
    const clock = makeClock(q)
    const s = new Spectrum([], q, clock.now)
    s.emit('uwb', uwbFrame(at(0)))
    // a UWB emission is foreign to Wi-Fi only; the UWB side sees nothing of its own
    expect(s.foreignDbm('uwb', at(3), UWB5_LO, UWB5_HI)).toBe(-Infinity)
  })

  it('sums two emissions in mW, not in dB', () => {
    const q = new EventQueue()
    const clock = makeClock(q)
    const s = new Spectrum([], q, clock.now)
    s.emit('wifi', wifiPpdu(at(0), 'ap1'))
    const single = s.foreignMw('uwb', at(3), UWB5_LO, UWB5_HI)
    s.emit('wifi', wifiPpdu(at(0), 'ap2'))
    expect(s.foreignMw('uwb', at(3), UWB5_LO, UWB5_HI)).toBeCloseTo(2 * single, 12)
    expect(s.foreignDbm('uwb', at(3), UWB5_LO, UWB5_HI)).toBeCloseTo(-42.2 + 3.01, 1)
  })

  it('retire removes exactly one emission', () => {
    const q = new EventQueue()
    const clock = makeClock(q)
    const s = new Spectrum([], q, clock.now)
    const a = wifiPpdu(at(0), 'ap1')
    const b = wifiPpdu(at(0), 'ap2')
    s.emit('wifi', a)
    s.emit('wifi', b)
    const both = s.foreignMw('uwb', at(3), UWB5_LO, UWB5_HI)
    s.retire('wifi', a)
    expect(s.foreignMw('uwb', at(3), UWB5_LO, UWB5_HI)).toBeCloseTo(both / 2, 12)
    s.retire('wifi', b)
    expect(s.foreignMw('uwb', at(3), UWB5_LO, UWB5_HI)).toBe(0)
    expect(s.foreignDbm('uwb', at(3), UWB5_LO, UWB5_HI)).toBe(-Infinity)
  })

  it('retires by identity: an unregistered emission and a double retire are no-ops', () => {
    const q = new EventQueue()
    const clock = makeClock(q)
    const s = new Spectrum([], q, clock.now)
    const woken: Ns[] = []
    s.onChange('uwb', (t) => woken.push(t))

    const a = wifiPpdu(at(0), 'ap')
    const b = wifiPpdu(at(0), 'ap') // same transmitter id, a second frame still on the air
    s.emit('wifi', a)
    s.emit('wifi', b)
    const both = s.foreignMw('uwb', at(3), UWB5_LO, UWB5_HI)

    s.retire('wifi', a)
    const afterOne = s.foreignMw('uwb', at(3), UWB5_LO, UWB5_HI)
    expect(afterOne).toBeCloseTo(both / 2, 12)
    clock.runUntil(10) // the emits and the real retire all land at t = 0, coalesced
    expect(woken).toEqual([0])

    // a stray second retire of the same object must not take b off the air
    s.retire('wifi', a)
    expect(s.foreignMw('uwb', at(3), UWB5_LO, UWB5_HI)).toBe(afterOne)
    // nor may an emission that was never registered, even with a matching txId
    s.retire('wifi', wifiPpdu(at(0), 'ap'))
    expect(s.foreignMw('uwb', at(3), UWB5_LO, UWB5_HI)).toBe(afterOne)

    clock.runUntil(20)
    expect(woken).toEqual([0]) // a no-op retire wakes nobody
  })

  it('refuses to guess a channel for a band that is no UWB channel', () => {
    const q = new EventQueue()
    const clock = makeClock(q)
    const s = new Spectrum([], q, clock.now)
    s.emit('uwb', { txId: 'odd', eirpDbm: -14, bandLoMhz: 2400, bandHiMhz: 2480, pos: at(0) })
    expect(() => s.foreignMw('wifi', at(4), 2400, 2480)).toThrow(/no UWB channel/)
  })

  it('accepts channel 9 as well as channel 5', () => {
    const q = new EventQueue()
    const clock = makeClock(q)
    const s = new Spectrum([], q, clock.now)
    s.emit('uwb', { txId: 'anchor', eirpDbm: -14, bandLoMhz: UWB9_LO, bandHiMhz: UWB9_HI, pos: at(0) })
    // uwbPl0Db(9) ≈ 50.50 against uwbPl0Db(5) ≈ 48.69, so channel 9 loses 1.80 dB more
    const ch9 = s.foreignDbm('wifi', at(4), UWB9_LO, UWB9_HI)
    expect(ch9).toBeCloseTo(-14 - uwbToWifiPathLossDb(4, 0, 9), 6)
    expect(uwbToWifiPathLossDb(4, 0, 9) - uwbToWifiPathLossDb(4, 0, 5)).toBeCloseTo(1.8, 1)
  })

  it('adds the loss of a wall on the direct ray', () => {
    const q = new EventQueue()
    const clock = makeClock(q)
    const clear = new Spectrum([], q, clock.now)
    const walled = new Spectrum([drywallAt(1.5)], q, clock.now)
    clear.emit('wifi', wifiPpdu(at(0)))
    walled.emit('wifi', wifiPpdu(at(0)))
    const a = clear.foreignDbm('uwb', at(3), UWB5_LO, UWB5_HI)
    const b = walled.foreignDbm('uwb', at(3), UWB5_LO, UWB5_HI)
    expect(b).toBeCloseTo(a - 5, 6) // WALL_LOSS_DB.drywall
  })
})

describe('Spectrum change notifications', () => {
  it('wakes the other side once per emit and once per retire, at phase 1', () => {
    const q = new EventQueue()
    const clock = makeClock(q)
    const s = new Spectrum([], q, clock.now)
    const seen: string[] = []
    s.onChange('uwb', (t) => seen.push(`uwb@${t}`))
    s.onChange('wifi', (t) => seen.push(`wifi@${t}`))

    const e = wifiPpdu(at(0))
    q.schedule(100, () => s.emit('wifi', e), 0)
    q.schedule(100, () => seen.push('phase0'), 0)
    q.schedule(100, () => seen.push('phase2'), 2)
    q.schedule(200, () => s.retire('wifi', e), 0)
    clock.runUntil(300)

    // only the UWB side hears about a Wi-Fi emission, and it hears at phase 1
    expect(seen).toEqual(['phase0', 'uwb@100', 'phase2', 'uwb@200'])
  })

  it('coalesces a burst of changes at one instant into one notification', () => {
    const q = new EventQueue()
    const clock = makeClock(q)
    const s = new Spectrum([], q, clock.now)
    const times: Ns[] = []
    s.onChange('uwb', (t) => times.push(t))

    q.schedule(
      50,
      () => {
        s.emit('wifi', wifiPpdu(at(0), 'ap1'))
        s.emit('wifi', wifiPpdu(at(0), 'ap2'))
        s.emit('wifi', wifiPpdu(at(0), 'ap3'))
      },
      0,
    )
    clock.runUntil(60)
    expect(times).toEqual([50])
  })

  it('calls listeners in registration order', () => {
    const q = new EventQueue()
    const clock = makeClock(q)
    const s = new Spectrum([], q, clock.now)
    const order: string[] = []
    s.onChange('uwb', () => order.push('first'))
    s.onChange('uwb', () => order.push('second'))
    s.onChange('uwb', () => order.push('third'))
    s.emit('wifi', wifiPpdu(at(0)))
    clock.runUntil(0)
    expect(order).toEqual(['first', 'second', 'third'])
  })
})
