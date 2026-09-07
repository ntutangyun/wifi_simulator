import { describe, it, expect } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { Simulation } from '../../src/engine/simulation'
import { CTS_BYTES, SIFS_NS, ctrlRespRateFor, txTimeNs } from '../../src/engine/phy'
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
    // second data frame of a burst: its Duration must reach the announced end, not just its own BA
    let found = false
    for (let i = 1; i < txs.length; i++) {
      const prev = txs[i - 1]
      const cur = txs[i]
      if (prev.frame.kind === 'data' && cur.frame.kind === 'data' && cur.t - (prev.t + prev.frame.txTimeNs) < 200_000) {
        found = true
        expect(cur.frame.durationFieldNs).toBeGreaterThan(200_000)
      }
    }
    expect(found).toBe(true)
  })

  it('protecting the burst removes the collisions that per-exchange protection leaves', () => {
    const base = new Simulation(hallway('single')).runUntil(300 * MS).records
    const baseCollisions = base.filter((r) => r.type === 'COLLISION').length
    const protCollisions = recs.filter((r) => r.type === 'COLLISION').length
    expect(baseCollisions).toBeGreaterThan(5)
    expect(protCollisions).toBeLessThan(baseCollisions / 3)
  })
})
