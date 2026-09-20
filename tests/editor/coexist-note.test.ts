import { describe, it, expect } from 'vitest'
import { clampSixGhzCenterMhz, sixGhzNbOverlaps, sixGhzOverlapPct } from '../../src/editor/planOps'
import { nbListOverlapsSixGhz } from '../../src/uwb/nb'
import { SIX_GHZ_GATE_MIN_WIDTH_MHZ } from '../../src/model/scenario'
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

describe('nbListOverlapsSixGhz — the one predicate the gate and the note share', () => {
  // Channel 71 of the 6 GHz plan: 6265–6345 MHz at 80 MHz, 6225–6385 at the gate's 160.
  const CH71 = 6305

  it('is true for a UNII-5 channel inside the Wi-Fi channel and false for one outside', () => {
    expect(nbListOverlapsSixGhz([200], CH71, 80)).toBe(true) // 6301.25 MHz
    expect(nbListOverlapsSixGhz([100], CH71, 80)).toBe(false) // 6051.25 MHz
    expect(nbListOverlapsSixGhz([100, 210], CH71, 80)).toBe(true) // 6326.25 MHz
  })

  it('is false for a UNII-3 allow list, which is what the session defaults to', () => {
    expect(nbListOverlapsSixGhz([3], CH71, 320)).toBe(false) // 5733.75 MHz
    expect(nbListOverlapsSixGhz([3], 5955, 320)).toBe(false)
    // …though the top of UNII-3 is not infinitely far away: a 320 MHz channel centred at the
    // bottom of the 6 GHz plan reaches 5795 MHz, and channel 49 sits at 5848.75.
    expect(nbListOverlapsSixGhz([49], 5955, 320)).toBe(true)
    expect(nbListOverlapsSixGhz([49], 5955, 80)).toBe(false)
  })

  it('widens with the channel, so the gate’s 160 MHz floor catches more than 80 does', () => {
    // Channel 180 is 6251.25 MHz: outside the 80 MHz channel, inside the gate's 160.
    expect(nbListOverlapsSixGhz([180], CH71, 80)).toBe(false)
    expect(nbListOverlapsSixGhz([180], CH71, SIX_GHZ_GATE_MIN_WIDTH_MHZ)).toBe(true)
  })
})

describe('sixGhzNbOverlaps — the note fires for an MMS allow list in the 6 GHz channel', () => {
  const mms = (nbChannels: number[]): Scenario['uwb'] =>
    ({ ...DEFAULT_UWB_SESSION, mode: 'mms', channel: 9, mms: { ...DEFAULT_UWB_SESSION.mms, nbChannels } })

  it('is false with no UWB session, and false for a two-way session on channel 9', () => {
    expect(sixGhzNbOverlaps(scenario(undefined, [uwbNode('t', 'tag')]), 6305)).toBe(false)
    const twr = scenario({ ...DEFAULT_UWB_SESSION, channel: 9 }, [uwbNode('t', 'tag')])
    expect(sixGhzNbOverlaps(twr, 6305)).toBe(false)
  })

  it('is false when the plan has no UWB node to run the session', () => {
    expect(sixGhzNbOverlaps(scenario(mms([200]), []), 6305)).toBe(false)
  })

  it('is true for a UNII-5 control channel inside the plan’s 6 GHz channel, on UWB channel 9', () => {
    const sc = scenario(mms([200]), [uwbNode('t', 'tag')])
    expect(sixGhzNbOverlaps(sc, 6305)).toBe(true)
    // …and the old note says nothing at all about it: the ranging radio is on channel 9.
    expect(sixGhzOverlapPct(sc, 6305)).toBeNull()
  })

  it('is false for the default UNII-3 allow list, wherever the Wi-Fi channel sits', () => {
    const sc = scenario(mms([...DEFAULT_UWB_SESSION.mms.nbChannels]), [uwbNode('t', 'tag')])
    expect(sixGhzNbOverlaps(sc, 6305)).toBe(false)
    expect(sixGhzNbOverlaps(sc, 5955)).toBe(false)
  })
})
