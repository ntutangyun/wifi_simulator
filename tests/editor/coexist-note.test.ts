import { describe, it, expect } from 'vitest'
import { clampSixGhzCenterMhz, sixGhzOverlapPct } from '../../src/editor/planOps'
import { DEFAULT_UWB_SESSION, nonht, type NodeCfg, type Scenario } from '../../src/model/scenario'

function uwbNode(id: string, role: 'anchor' | 'tag'): NodeCfg {
  return { id, kind: 'uwb', name: id, pos: { x: 0, y: 0, z: 1 }, txPowerDbm: -14, profiles: ['idle'], caps: { ...nonht }, uwb: { role } }
}

function scenario(uwb?: Scenario['uwb'], nodes: NodeCfg[] = []): Scenario {
  return { rooms: [], walls: [], nodes, servers: [], seed: 1, rtsThresholdBytes: 3000, snapshotIntervalMs: 10, uwb }
}

describe('clampSixGhzCenterMhz — the 6 GHz field clamps to the schema', () => {
  it('clamps below the minimum up to 5955', () => {
    expect(clampSixGhzCenterMhz('5000')).toBe(5955)
  })
  it('clamps above the maximum down to 7115', () => {
    expect(clampSixGhzCenterMhz('9000')).toBe(7115)
  })
  it('snaps an off-step value to the nearest 5 MHz', () => {
    expect(clampSixGhzCenterMhz('6303')).toBe(6305)
    expect(clampSixGhzCenterMhz('6302')).toBe(6300)
  })
  it('passes through an in-range on-step value unchanged', () => {
    expect(clampSixGhzCenterMhz('6305')).toBe(6305)
  })
  it('falls back to the low bound on an unparsable value', () => {
    expect(clampSixGhzCenterMhz('')).toBe(5955)
  })
})

describe('sixGhzOverlapPct — the overlap note only fires on a channel-5 UWB plan', () => {
  it('is null with no UWB session at all', () => {
    expect(sixGhzOverlapPct(scenario(undefined, [uwbNode('t', 'tag')]), 6305)).toBeNull()
  })
  it('is null when the UWB session is on channel 9', () => {
    const sc = scenario({ ...DEFAULT_UWB_SESSION, channel: 9 }, [uwbNode('t', 'tag')])
    expect(sixGhzOverlapPct(sc, 6305)).toBeNull()
  })
  it('is null when channel 5 is set but the plan has no UWB node', () => {
    const sc = scenario({ ...DEFAULT_UWB_SESSION, channel: 5 }, [])
    expect(sixGhzOverlapPct(sc, 6305)).toBeNull()
  })
  it('is the overlap percentage when a channel-5 session has a UWB node', () => {
    const sc = scenario({ ...DEFAULT_UWB_SESSION, channel: 5 }, [uwbNode('t', 'tag')])
    expect(sixGhzOverlapPct(sc, 6305)).toBe(100)
    expect(sixGhzOverlapPct(sc, 6260)).toBe(75)
    expect(sixGhzOverlapPct(sc, 5985)).toBe(0)
  })
})
