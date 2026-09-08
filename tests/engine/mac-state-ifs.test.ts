import { describe, it, expect } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { Simulation } from '../../src/engine/simulation'
import { applyRecord, initViewState } from '../../src/model/view'

/**
 * A node whose IFS timer is armed is deferring, not idle. The 3D label and the
 * timeline's wait track both read the MAC state, so an 'idle' state during an
 * IFS makes the wait vanish and the following backoff appear from nowhere.
 */
describe('MAC state while an IFS is armed', () => {
  it('lesson 12: the AP is deferring during its AIFS after the BlockAck at 7780.2 µs', () => {
    const sc = LESSONS.find((x) => x.id === 'ofdma-ul')!.scenario()
    const vs = initViewState(sc)
    for (const r of new Simulation(sc).runUntil(8_000_000).records) {
      if (r.t > 7_800_000) break
      applyRecord(vs, r)
    }
    const ap = vs.nodes['ap']
    expect(ap.acs![1].ifs).toMatchObject({ kind: 'AIFS', untilNs: 7_823_200 })
    expect(ap.state).toBe('defer')
  })

  it('every lesson, every node: never idle while an IFS is pending', () => {
    for (const l of LESSONS) {
      const sc = l.scenario()
      const vs = initViewState(sc)
      const recs = new Simulation(sc).runUntil(100_000_000).records
      let lastT = -1
      const check = (t: number) => {
        for (const [vid, n] of Object.entries(vs.nodes)) {
          const pending = n.acs ? n.acs.some((a) => a.ifs && a.ifs.untilNs > t) : !!(n.ifs && n.ifs.untilNs > t)
          if (pending) expect(n.state, `${l.id} ${vid} @${t}`).not.toBe('idle')
        }
      }
      for (const r of recs) {
        // judge each instant once all its same-time records have been applied
        if (r.t !== lastT && lastT >= 0) check(lastT)
        applyRecord(vs, r)
        lastT = r.t
      }
    }
  })
})
