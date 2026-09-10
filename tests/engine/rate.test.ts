import { describe, it, expect } from 'vitest'
import { RateControl } from '../../src/engine/rate'
import { Simulation } from '../../src/engine/simulation'
import { HOUSEHOLDS } from '../../src/model/households'

describe('rate adaptation: signal strength sets the ceiling, losses push below it', () => {
  it('starts at the ceiling', () => {
    const r = new RateControl()
    expect(r.mcsFor('ap', 9)).toBe(9)
  })

  it('steps down one notch after two consecutive failures, not after one', () => {
    const r = new RateControl()
    r.mcsFor('ap', 9)
    r.onFailure('ap')
    expect(r.mcsFor('ap', 9)).toBe(9)
    r.onFailure('ap')
    expect(r.mcsFor('ap', 9)).toBe(8)
  })

  it('steps down twice after four failures', () => {
    const r = new RateControl()
    r.mcsFor('ap', 9)
    for (let i = 0; i < 4; i++) r.onFailure('ap')
    expect(r.mcsFor('ap', 9)).toBe(7)
  })

  it('a success resets the failure run, so isolated losses do not lower the rate', () => {
    const r = new RateControl()
    r.mcsFor('ap', 9)
    r.onFailure('ap')
    r.onSuccess('ap')
    r.onFailure('ap')
    expect(r.mcsFor('ap', 9)).toBe(9)
  })

  it('climbs back one notch per ten successes and stops at the ceiling', () => {
    const r = new RateControl()
    r.mcsFor('ap', 9)
    for (let i = 0; i < 4; i++) r.onFailure('ap')
    expect(r.mcsFor('ap', 9)).toBe(7)
    for (let i = 0; i < 20; i++) r.onSuccess('ap')
    expect(r.mcsFor('ap', 9)).toBe(9)
    for (let i = 0; i < 20; i++) r.onSuccess('ap')
    expect(r.mcsFor('ap', 9)).toBe(9)
  })

  it('never exceeds the ceiling, so it cannot run away from the propagation model', () => {
    const r = new RateControl()
    r.mcsFor('ap', 9)
    for (let i = 0; i < 50; i++) r.onSuccess('ap')
    expect(r.mcsFor('ap', 4)).toBe(4)
  })

  it('follows the ceiling down when the station walks away', () => {
    const r = new RateControl()
    r.mcsFor('ap', 9)
    expect(r.mcsFor('ap', 2)).toBe(2)
  })

  it('keeps a separate history per peer', () => {
    const r = new RateControl()
    r.mcsFor('a', 9)
    r.mcsFor('b', 9)
    r.onFailure('a')
    r.onFailure('a')
    expect(r.mcsFor('a', 9)).toBe(8)
    expect(r.mcsFor('b', 9)).toBe(9)
  })

  it('never goes below MCS 0', () => {
    const r = new RateControl()
    r.mcsFor('ap', 1)
    for (let i = 0; i < 40; i++) r.onFailure('ap')
    expect(r.mcsFor('ap', 1)).toBe(0)
  })
})

it('a lossy link drops below the modulation its signal strength alone would allow', () => {
  const sc = HOUSEHOLDS.find((h) => h.id === 'full-house')!.scenario()
  // Move one station to a congested corner of the bedroom and make it upload
  // hard. The plan's original far-corner spot (11.5, 8.5) sits outside the
  // building envelope entirely (threeRooms is 12x8, walls stop at y=8) and,
  // combined with the 160 MHz channel this eht link negotiates, the RSSI
  // margin already collapses mcsForRssi's ceiling to 0 — the achieved rate
  // never has anywhere to fall from, so the "the rate moved" assertion fails
  // for the wrong reason (permanently stuck at 0, not adapting). Moving the
  // station to (8.5, 7.5) keeps it inside the bedroom but still on the far
  // side from the AP at (4, 4), giving a ceiling with real headroom (SU MCS 3)
  // that this saturated, contention-heavy household can knock the achieved
  // rate down from.
  //
  // OFDMA is also switched off for this one station: with it on, the AP
  // schedules some of this station's uplink as Trigger-based UL MU, whose MCS
  // is chosen by the AP's own (separate, never-adapting in this scenario)
  // RateControl instead of this station's — mixing in a second, fixed MCS
  // level that would make the assertion pass for the wrong reason (two
  // constant levels, neither of which actually moved) rather than because
  // this station's own rate control adapted.
  const far = sc.nodes.find((n) => n.id === 'sta-3')!
  far.pos = { x: 8.5, y: 7.5, z: 1 }
  far.profiles = ['saturated']
  ;(far.caps.features as Record<string, boolean>).ofdma = false
  const recs = new Simulation(sc).runUntil(2_000 * 1_000_000).records
  const mcss = recs
    .filter((r) => r.type === 'TX_START' && r.node === 'sta-3' && r.frame.kind === 'data')
    .map((r) => (r.type === 'TX_START' ? r.frame.mcs ?? 0 : 0))
  expect(mcss.length).toBeGreaterThan(20)
  expect(Math.min(...mcss)).toBeLessThan(Math.max(...mcss)) // the rate moved
})
