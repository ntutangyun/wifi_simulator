import { describe, it, expect } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { Simulation } from '../../src/engine/simulation'
import type { FrameDesc } from '../../src/model/frames'
import type { TLRecord } from '../../src/model/records'
import { makeBss, msdu } from './helpers'

const MS = 1_000_000

describe('STA side of a triggered uplink', () => {
  it('CW and backoff are left untouched across a TB PPDU, acknowledged or not (802.11ax §26.5.2.3)', () => {
    const sc = LESSONS.find((l) => l.id === 'ofdma-ul')!.scenario()
    const recs: TLRecord[] = new Simulation(sc).runUntil(300 * MS).records
    let windows = 0
    for (const trig of recs) {
      if (trig.type !== 'RX_OK' || trig.frame.kind !== 'trigger') continue
      const sta = trig.node
      if (!trig.frame.muParts?.some((p) => p.dst === sta)) continue
      const tx = recs.find((r) => r.type === 'TX_START' && r.node === sta && r.t > trig.t)
      if (!tx || tx.type !== 'TX_START' || tx.frame.orthogonalGroup !== trig.frame.orthogonalGroup) continue
      // up to the M-BA (or its timeout), but not into the station's own next attempt
      const tbEnd = tx.t + tx.frame.txTimeNs
      const nextOwn = recs.find((r) => r.type === 'TX_START' && r.node === sta && r.t > tbEnd)
      const end = Math.min(tbEnd + 200_000, nextOwn ? nextOwn.t - 1 : Infinity)
      windows++
      // CW must not change; a backoff drawn in the window may only be one that was
      // already pending (e.g. after an earlier failed RTS), at the CW in force before the Trigger.
      const cwBefore = [...recs].reverse().find((r) => r.type === 'CW_CHANGE' && r.node === sta && r.t <= trig.t)
      const inWindow = recs.filter((r) => 'node' in r && r.node === sta && r.t > trig.t && r.t <= end)
      expect(inWindow.filter((r) => r.type === 'CW_CHANGE'), `${sta} TB PPDU @${tx.t}`).toHaveLength(0)
      for (const d of inWindow) {
        if (d.type === 'BACKOFF_DRAW' && cwBefore?.type === 'CW_CHANGE') expect(d.cw, `${sta} draw @${d.t}`).toBe(cwBefore.cw)
      }
    }
    expect(windows).toBeGreaterThan(5)
  })
})

describe('trigger response and NAV (CS Required)', () => {
  const nodes = ['ap', 'sta-1', 'sta-8', 'sta-9']
  const links = { 'sta-1>ap': -50, 'ap>sta-1': -50 }
  const trigger: FrameDesc = {
    kind: 'trigger', src: 'ap', dst: '*mu', bytes: 40, mbps: 24, durationFieldNs: 1_000_000, txTimeNs: 40_000,
    orthogonalGroup: 'g1', muParts: [
      { dst: 'sta-1', src: 'ap', bytes: 0, mcs: 0, mbps: 6, msduIds: [], mpduCount: 0, ac: 1, durNs: 400_000 },
      { dst: 'sta-9', src: 'ap', bytes: 0, mcs: 0, mbps: 6, msduIds: [], mpduCount: 0, ac: 1, durNs: 400_000 },
    ],
  }
  // a data frame (not an RTS, whose NAV may be released early) reserving 10 ms
  const navFrame = (from: string): FrameDesc => ({
    kind: 'data', src: from, dst: 'sta-8', bytes: 1428, mbps: 54, durationFieldNs: 10 * MS, txTimeNs: 232_000,
  })

  function run(navFrom: string) {
    const b = makeBss(nodes, links, { edca: true })
    b.enqueue(1 * MS, 'sta-1', msdu('sta-1', 'ap'))
    // hold sta-1 busy so it cannot send on its own before the trigger
    b.at(1 * MS - 1, () => b.macs['sta-1'].onRxOk(1 * MS - 1, navFrame(navFrom), navFrom))
    b.at(2 * MS, () => b.macs['sta-1'].onRxOk(2 * MS, trigger, 'ap'))
    b.runUntil(4 * MS)
    return b
  }

  it('a NAV set by a third party keeps the STA silent and is not cleared', () => {
    const b = run('sta-9')
    expect(b.recs('TX_START', 'sta-1').filter((r) => r.t >= 2 * MS && r.t < 4 * MS)).toHaveLength(0)
    expect(b.recs('NAV_CLEAR', 'sta-1').filter((r) => r.t < 4 * MS)).toHaveLength(0)
  })

  it('a NAV set by the triggering AP itself does not block the response', () => {
    const b = run('ap')
    const tb = b.recs('TX_START', 'sta-1').find((r) => r.t >= 2 * MS)
    expect(tb?.frame.orthogonalGroup).toBe('g1')
  })
})
