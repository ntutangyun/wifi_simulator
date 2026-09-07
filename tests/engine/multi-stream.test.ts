import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { defaultScenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'

type Rec<K extends TLRecord['type']> = Extract<TLRecord, { type: K }>
const isDraw = (r: TLRecord): r is Rec<'BACKOFF_DRAW'> => r.type === 'BACKOFF_DRAW'
const isTx = (r: TLRecord): r is Rec<'TX_START'> => r.type === 'TX_START'

const MS = 1_000_000

/** One Wi-Fi 6 station running a voice call and a cloud backup at the same time. */
function mixed() {
  const sc = defaultScenario()
  sc.nodes[1].profiles = ['voice', 'backup'] // STA-1 (TV), HE, EDCA on
  sc.nodes[2].profiles = ['idle']
  return sc
}

describe('multiple traffic streams on one station', () => {
  const recs = new Simulation(mixed()).runUntil(300 * MS).records
  const sta = (r: { node?: string }) => r.node === 'sta-1'

  it('the station contends in AC_VO and AC_BK, and in nothing else', () => {
    const acs = new Set(recs.filter(isDraw).filter(sta).map((r) => r.ac))
    expect(acs.has(3), 'voice contends as AC_VO').toBe(true)
    expect(acs.has(0), 'backup contends as AC_BK').toBe(true)
    expect(acs.has(1) || acs.has(2)).toBe(false)
  })

  it('both streams actually deliver frames', () => {
    const tx = recs.filter(isTx).filter((r) => sta(r) && r.frame.kind === 'data')
    expect(tx.some((r) => r.frame.ac === 3 && r.frame.bytes < 400), 'a 200 B voice frame').toBe(true)
    expect(tx.some((r) => r.frame.ac === 0), 'a backup frame').toBe(true)
  })

  it('the AP queues the downlink voice leg as AC_VO', () => {
    const ap = recs.filter(isTx).filter((r) => r.node === 'ap' && r.frame.kind === 'data' && r.frame.dst === 'sta-1')
    expect(ap.some((r) => r.frame.ac === 3)).toBe(true)
  })
})
