import { describe, it, expect } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { Simulation } from '../../src/engine/simulation'
import { defaultFeatures } from '../../src/model/caps'
import type { NodeCfg, Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000
type Rec<K extends TLRecord['type']> = Extract<TLRecord, { type: K }>
const isTx = (r: TLRecord): r is Rec<'TX_START'> => r.type === 'TX_START'

/**
 * An MLO AP's two MACs share one MLD queue, but a link may only transmit to
 * peers that are actually on it. Regression: the 6 GHz MAC took the head of the
 * shared queue regardless of destination and fired video frames at 5 GHz-only
 * Wi-Fi 5 TVs — every attempt timed out and frames were dropped at the retry
 * limit (lesson 9: 131 phantom transmissions and 22 lost frames in 300 ms).
 */
describe('a link only transmits to peers that are on it', () => {
  it('lesson 9: the AP’s 6 GHz radio stays silent and drops nothing', () => {
    const lesson = LESSONS.find((l) => l.id === 'txop')!
    const recs = new Simulation(lesson.scenario()).runUntil(300 * MS).records
    expect(recs.filter((r) => r.type === 'TX_START' && r.node === 'ap#6g')).toHaveLength(0)
    expect(recs.filter((r) => r.type === 'DROP' && (r.node === 'ap' || r.node === 'ap#6g'))).toHaveLength(0)
    // the TVs still get their video on 5 GHz
    expect(recs.some((r) => r.type === 'RX_OK' && r.node === 'sta-1' && r.frame.kind === 'data')).toBe(true)
  })

  it('MLO station and single-band station sharing the AP queue: each frame goes out on a link its receiver is on', () => {
    const mk = (id: string, name: string, kind: 'ap' | 'sta', x: number, gen: NodeCfg['caps']['generation'], profiles: NodeCfg['profiles']): NodeCfg => ({
      id, kind, name, pos: { x, y: 4, z: kind === 'ap' ? 2 : 1 }, txPowerDbm: kind === 'ap' ? 20 : 15, profiles,
      caps: { generation: gen, features: defaultFeatures(gen) },
    })
    const sc: Scenario = {
      rooms: [{ x: 0, y: 0, w: 10, h: 8, name: 'room' }], walls: [],
      nodes: [mk('ap', 'AP', 'ap', 5, 'eht', ['idle']), mk('sta-1', 'MLO', 'sta', 3, 'eht', ['video']), mk('sta-2', 'Legacy', 'sta', 7, 'vht', ['video'])],
      seed: 7, rtsThresholdBytes: 3000, snapshotIntervalMs: 50,
    }
    const recs = new Simulation(sc).runUntil(300 * MS).records
    const on6 = recs.filter(isTx).filter((r) => r.node === 'ap#6g' && r.frame.kind === 'data')
    expect(on6.length, 'the MLO station is served on 6 GHz too').toBeGreaterThan(0)
    expect(on6.every((r) => r.frame.dst === 'sta-1'), 'nothing for the 5 GHz-only station goes out on 6 GHz').toBe(true)
    expect(recs.filter((r) => r.type === 'DROP' && r.node.startsWith('ap'))).toHaveLength(0)
    expect(recs.some((r) => r.type === 'RX_OK' && r.node === 'sta-2' && r.frame.kind === 'data')).toBe(true)
  })
})
