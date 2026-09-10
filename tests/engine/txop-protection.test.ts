import { describe, it, expect } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { Simulation } from '../../src/engine/simulation'
import { ACK_BYTES, BA_BYTES, CTS_BYTES, SIFS_NS, ctrlRespRateFor, txTimeNs } from '../../src/engine/phy'
import { defaultFeatures } from '../../src/model/caps'
import type { Scenario, TxopProtection } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000
type Rec<K extends TLRecord['type']> = Extract<TLRecord, { type: K }>
const isTx = (r: TLRecord): r is Rec<'TX_START'> => r.type === 'TX_START'

/**
 * Lesson 5's hallway: A and B cannot hear each other, both hear the AP.
 * Here they are Wi-Fi 5 uploaders, so each channel win becomes a TXOP burst
 * of A-MPDUs — the case where protecting only the first exchange is not enough.
 */
function hallway(prot: TxopProtection, seed = 7): Scenario {
  const sc = LESSONS.find((l) => l.id === 'hidden')!.scenario()
  for (const n of sc.nodes) {
    if (n.kind !== 'sta') continue
    // no A-MPDU: each 1500 B frame is its own exchange, so a TXOP chains several of them
    n.caps = { generation: 'vht', features: { ...defaultFeatures('vht'), ampdu: false } }
    n.txopProtection = prot
  }
  return { ...sc, seed }
}

describe('TXOP protection at the burst boundary', () => {
  const recs = new Simulation(hallway('boundary')).runUntil(300 * MS).records
  const rtsList = recs.filter(isTx).filter((r) => r.frame.kind === 'rts' && r.node === 'sta-1')

  it('the RTS that opens a burst announces the whole planned burst, not one exchange', () => {
    expect(rtsList.length).toBeGreaterThan(0)
    // find an RTS followed (within its own Duration) by at least two data frames from the holder
    const multi = rtsList.filter((rts) => {
      const end = rts.t + rts.frame.txTimeNs + rts.frame.durationFieldNs
      return recs.filter(isTx).filter((r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > rts.t && r.t < end).length >= 2
    })
    expect(multi.length, 'some RTS must cover a multi-exchange burst').toBeGreaterThan(0)
    const rts = multi[0]
    const ctsTime = txTimeNs(CTS_BYTES, ctrlRespRateFor(rts.frame.mbps))
    // the AP's CTS repeats the reservation minus itself
    const cts = recs.filter(isTx).find((r) => r.node === 'ap' && r.frame.kind === 'cts' && r.t > rts.t)!
    expect(cts.frame.durationFieldNs).toBe(rts.frame.durationFieldNs - SIFS_NS - ctsTime)
    // the hidden station B loads that reservation into its NAV and stays quiet for the burst
    const nav = recs.find((r): r is Rec<'NAV_SET'> => r.type === 'NAV_SET' && r.node === 'sta-2' && r.t >= cts.t && r.source.startsWith('cts:'))!
    expect(nav.untilNs).toBe(cts.t + cts.frame.txTimeNs + cts.frame.durationFieldNs)
    expect(recs.filter(isTx).some((r) => r.node === 'sta-2' && r.t > cts.t && r.t < nav.untilNs)).toBe(false)
  })

  it('a burst that ends early is truncated with CF-End, which the AP relays and B obeys', () => {
    const cf = recs.filter(isTx).filter((r) => r.frame.kind === 'cfend')
    expect(cf.length).toBeGreaterThan(0)
    const mine = cf.find((r) => r.node === 'sta-1')!
    const relay = cf.find((r) => r.node === 'ap' && r.t > mine.t)!
    expect(relay.t).toBe(mine.t + mine.frame.txTimeNs + SIFS_NS)
    // B could not hear A's CF-End, but hears the AP's: its NAV is cleared at the relay's end
    const relayEnd = relay.t + relay.frame.txTimeNs
    expect(recs.some((r) => r.type === 'NAV_CLEAR' && r.node === 'sta-2' && r.t === relayEnd)).toBe(true)
    // and a CF-End never sets a NAV
    expect(recs.some((r) => r.type === 'NAV_SET' && r.source.startsWith('cfend:'))).toBe(false)
  })

  it('data frames inside a boundary-protected burst still carry single protection', () => {
    const data = recs.filter(isTx).filter((r) => r.node === 'sta-1' && r.frame.kind === 'data')
    expect(data.length).toBeGreaterThan(0)
    for (const d of data) expect(d.frame.durationFieldNs).toBeLessThan(200_000)
  })

  it('"multiple" makes every data frame in the burst carry the TXOP remainder', () => {
    const multi = new Simulation(hallway('multiple')).runUntil(300 * MS).records
    const txs = multi.filter(isTx).filter((r) => r.node === 'sta-1')
    const rtsList = txs.filter((r) => r.frame.kind === 'rts')
    const dataList = txs.filter((r) => r.frame.kind === 'data')
    expect(dataList.length).toBeGreaterThan(0)
    expect(rtsList.length).toBeGreaterThan(0)
    // The real property (§9.2.5.2 multiple protection): every data frame's
    // Duration reaches the TXOP end the burst-opening RTS/CTS announced,
    // floored at a bare SIFS+ACK/BA when that remainder would be smaller
    // (near the tail of a burst). Recompute the announced end from each
    // frame's own opening RTS — the same reservation mac.ts's buildDataFrame
    // computes internally — rather than asserting a fixed, magic threshold:
    // that threshold shifts with the modulation in play (Task 5's rate
    // adaptation), while the underlying protocol property does not.
    let checked = 0
    for (const cur of dataList) {
      const openingRts = [...rtsList].reverse().find((r) => r.t <= cur.t)
      if (!openingRts) continue // no burst-opening RTS on record yet (run's very first attempt) — nothing to check
      const announcedEnd = openingRts.t + openingRts.frame.txTimeNs + openingRts.frame.durationFieldNs
      const respBytes = cur.frame.ampdu !== undefined ? BA_BYTES : ACK_BYTES
      const respTime = txTimeNs(respBytes, ctrlRespRateFor(cur.frame.mbps))
      const floor = SIFS_NS + respTime
      const remainder = announcedEnd - (cur.t + cur.frame.txTimeNs)
      const expected = Math.max(floor, remainder)
      expect(cur.frame.durationFieldNs, `data frame at t=${cur.t}`).toBe(expected)
      checked++
    }
    expect(checked).toBeGreaterThan(0)
    // And the property this table (lesson 5 → lesson 10) is built on: at
    // least one such frame genuinely carries more than a bare SIFS+ACK/BA —
    // multiple protection is doing real work, not degenerating to single.
    expect(
      dataList.some((cur) => {
        const respBytes = cur.frame.ampdu !== undefined ? BA_BYTES : ACK_BYTES
        return cur.frame.durationFieldNs > SIFS_NS + txTimeNs(respBytes, ctrlRespRateFor(cur.frame.mbps))
      }),
    ).toBe(true)
  })

  it('protecting the burst removes the collisions that per-exchange protection leaves', () => {
    const base = new Simulation(hallway('single')).runUntil(300 * MS).records
    const baseCollisions = base.filter((r) => r.type === 'COLLISION').length
    const protCollisions = recs.filter((r) => r.type === 'COLLISION').length
    expect(baseCollisions).toBeGreaterThan(5)
    expect(protCollisions).toBeLessThan(baseCollisions / 3)
  })
})
