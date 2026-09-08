import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { defaultScenario } from '../../src/model/scenario'
import { scenarioFromJson, scenarioToJson } from '../../src/editor/planOps'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000
type Rec<K extends TLRecord['type']> = Extract<TLRecord, { type: K }>

/**
 * A station with a tampered driver (the patent draft's "violator"): AIFS
 * floored, contention window collapsed, every frame sent as if top priority.
 * The engine must reproduce exactly that access timing so the advantage it
 * buys can be measured against compliant neighbours.
 */
describe('a station with tampered EDCA parameters', () => {
  function bss() {
    const sc = defaultScenario()
    sc.nodes[1].profiles = ['gaming']
    sc.nodes[1].tamper = { aifsn: 1, cwMin: 0, cwMax: 0 }
    sc.nodes[2].profiles = ['gaming']
    sc.nodes[2].caps = { generation: 'he', features: { edca: true, ampdu: true, txop: true, ofdma: true } }
    sc.nodes[2].pos = { x: 3.5, y: 6.5, z: 1 } // same room as sta-1, so it decodes the cheater's frames
    return sc
  }

  it('round-trips through the scenario schema', () => {
    const back = scenarioFromJson(scenarioToJson(bss()))
    expect(back.nodes[1].tamper).toEqual({ aifsn: 1, cwMin: 0, cwMax: 0 })
    expect(back.nodes[2].tamper).toBeUndefined()
  })

  it('waits only SIFS + 1 slot and never draws a backoff above 0, while its compliant twin follows AC_BE', () => {
    const recs = new Simulation(bss()).runUntil(300 * MS).records
    const ifs = (node: string) => recs.filter((r): r is Rec<'IFS_START'> => r.type === 'IFS_START' && r.node === node && r.kind === 'AIFS')
    const draws = (node: string) => recs.filter((r): r is Rec<'BACKOFF_DRAW'> => r.type === 'BACKOFF_DRAW' && r.node === node)
    const cheat = ifs('sta-1')
    expect(cheat.length).toBeGreaterThan(10)
    // AIFS = SIFS (16 µs) + 1 slot (9 µs); the IFS may be shortened by idle time already elapsed, never lengthened
    for (const r of cheat) expect(r.untilNs - r.t).toBeLessThanOrEqual(25_000)
    expect(draws('sta-1').length).toBeGreaterThan(10)
    expect(draws('sta-1').every((r) => r.value === 0 && r.cw === 0)).toBe(true)
    // the honest station: AIFSN 3 for AC_BE (SIFS + 3 slots = 43 µs) and real random backoff
    const honest = ifs('sta-2')
    expect(honest.some((r) => r.untilNs - r.t === 43_000)).toBe(true)
    expect(draws('sta-2').some((r) => r.value > 0)).toBe(true)
  })

  it('keeps its collapsed window even after a collision or retry', () => {
    const recs = new Simulation(bss()).runUntil(500 * MS).records
    const cw = recs.filter((r): r is Rec<'CW_CHANGE'> => r.type === 'CW_CHANGE' && r.node === 'sta-1')
    expect(cw.every((r) => r.cw === 0)).toBe(true)
  })

  it('priority escalation: its uplink frames are queued in AC_VO, the AP still sends to it in the real class', () => {
    const sc = bss()
    sc.nodes[1].tamper = { allAsAc: 3 }
    const recs = new Simulation(sc).runUntil(300 * MS).records
    const up = recs.filter((r): r is Rec<'ENQUEUE'> => r.type === 'ENQUEUE' && r.node === 'sta-1')
    expect(up.length).toBeGreaterThan(10)
    expect(up.every((r) => r.ac === 3)).toBe(true)
    const down = recs.filter((r): r is Rec<'ENQUEUE'> => r.type === 'ENQUEUE' && r.node === 'ap' && r.dst === 'sta-1')
    expect(down.every((r) => r.ac === 1)).toBe(true) // gaming is AC_BE at the AP (game acceleration off)
  })

  it('TXOP hog: every TXOP it opens is announced for 8 ms', () => {
    const sc = bss()
    sc.nodes[1].tamper = { txopLimitUs: 8000 }
    const recs = new Simulation(sc).runUntil(300 * MS).records
    const txops = recs.filter((r): r is Rec<'TXOP_START'> => r.type === 'TXOP_START' && r.node === 'sta-1')
    expect(txops.length).toBeGreaterThan(5)
    expect(txops.every((r) => r.untilNs - r.t === 8_000_000)).toBe(true)
  })

  it('NAV inflation: neighbours set a NAV 3 ms longer than the exchange needs', () => {
    const sc = bss()
    sc.nodes[1].tamper = { navInflateUs: 3000 }
    const recs = new Simulation(sc).runUntil(300 * MS).records
    const navs = recs.filter((r): r is Rec<'NAV_SET'> => r.type === 'NAV_SET' && r.node === 'sta-2' && r.source === 'data:sta-1')
    expect(navs.length).toBeGreaterThan(5)
    expect(navs.every((r) => r.untilNs - r.t >= 3_000_000)).toBe(true)
  })

  it('no doubling: the window never leaves cwMin however many retries', () => {
    const sc = bss()
    sc.nodes[1].tamper = { noDoubling: true }
    const recs = new Simulation(sc).runUntil(500 * MS).records
    const cw = recs.filter((r): r is Rec<'CW_CHANGE'> => r.type === 'CW_CHANGE' && r.node === 'sta-1')
    expect(cw.every((r) => r.cw === 15)).toBe(true) // AC_BE cwMin
  })
})
