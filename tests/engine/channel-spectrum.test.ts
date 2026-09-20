/**
 * The Wi-Fi side of the 6 GHz / UWB coupling: a `Channel` handed a `Spectrum`
 * adds the other technology's in-band power to every sum it already keeps —
 * a lock's worst-case interference, preamble detection and energy detect — and
 * behaves exactly as before when it is handed none.
 *
 * Every expected level is derived from the engine's own functions rather than
 * written out as a number, so a change to the path-loss law or the noise figure
 * moves the test with the model instead of silently breaking it.
 */
import { describe, expect, it } from 'vitest'
import { Channel, type ChannelSpectrum, type PhyListener } from '../../src/engine/channel'
import { EventQueue } from '../../src/engine/events'
import { CCA_ED_DBM, noiseDbm, sinrThreshDb, txTimeNs } from '../../src/engine/phy'
import { Simulation } from '../../src/engine/simulation'
import { Spectrum, uwbToWifiPathLossDb, type Emission } from '../../src/engine/spectrum'
import type { FrameDesc } from '../../src/model/frames'
import { makeEmitter, type TLRecord } from '../../src/model/records'
import { DEFAULT_UWB_SESSION, type NodeCfg, type Scenario } from '../../src/model/scenario'
import type { Vec3 } from '../../src/model/types'
import { UWB_BAND_MHZ, uwbInBandDbm } from '../../src/uwb/phy'

/** 6 GHz channel 71: 6305 MHz centre, 80 MHz — wholly inside UWB channel 5's band. */
const CENTER_MHZ = 6305
const WIDTH_MHZ = 80
const MBPS = 54
/** The receiver `b` sits 4 m from the UWB transmitter; `a` and `c` are far enough to hear nothing. */
const POS: Record<string, Vec3> = {
  a: { x: -100, y: 0, z: 1 },
  b: { x: 0, y: 0, z: 1 },
  c: { x: 104, y: 0, z: 1 },
}
const UWB_POS: Vec3 = { x: 4, y: 0, z: 1 }
const UWB_DIST_M = 4

/** In-band power a UWB emission of `eirpDbm` puts into the 80 MHz Wi-Fi channel at `b`. */
function foreignDbmAtB(eirpDbm: number): number {
  return uwbInBandDbm(eirpDbm, WIDTH_MHZ) - uwbToWifiPathLossDb(UWB_DIST_M, 0, 5)
}

/** Several dBm levels added as powers. */
function sumDbm(...dbms: number[]): number {
  return 10 * Math.log10(dbms.reduce((s, d) => s + 10 ** (d / 10), 0))
}

const uwbEmission = (eirpDbm: number): Emission => ({
  txId: 'anchor-1',
  eirpDbm,
  bandLoMhz: UWB_BAND_MHZ[5].lo,
  bandHiMhz: UWB_BAND_MHZ[5].hi,
  pos: UWB_POS,
  // the law the UwbChannel binds to a channel-5 frame
  lossDb: (d, w) => uwbToWifiPathLossDb(d, w, 5),
})

const frame = (src: string, dst: string): FrameDesc => ({
  kind: 'data', src, dst, bytes: 1428, mbps: MBPS,
  durationFieldNs: 0, txTimeNs: txTimeNs(1428, MBPS), widthMhz: WIDTH_MHZ,
})

/** 'none': no spectrum argument at all. 'empty': a real Spectrum with nothing on the air. */
type SpectrumMode = 'none' | 'empty' | { eirpDbm: number }

/** A three-node 6 GHz channel, optionally coupled to a Spectrum carrying one UWB frame. */
function setup(links: Record<string, number>, mode: SpectrumMode) {
  const q = new EventQueue()
  let now = 0
  const table = new Map<string, Map<string, number>>()
  for (const key of Object.keys(links)) {
    const [tx, rx] = key.split('>')
    if (!table.has(tx)) table.set(tx, new Map())
    table.get(tx)!.set(rx, links[key])
  }
  const records: TLRecord[] = []
  const emit = makeEmitter((r) => records.push(r))
  const s = new Spectrum([], q, () => now)
  const hook: ChannelSpectrum = {
    s,
    posOf: (id) => POS[id],
    txPowerOf: () => 20,
    centerMhz: CENTER_MHZ,
    widthMhz: WIDTH_MHZ,
  }
  const ch = new Channel(q, () => now, table, emit, mode === 'none' ? undefined : hook)
  const noop: PhyListener = {
    onCcaBusy: () => {}, onCcaIdle: () => {}, onRxStart: () => {}, onRxOk: () => {}, onRxCorrupt: () => {},
  }
  for (const id of ['a', 'b', 'c']) ch.register(id, noop)
  const emission = typeof mode === 'object' ? uwbEmission(mode.eirpDbm) : null
  if (emission) s.emit('uwb', emission)
  return {
    ch, s, emission, records,
    runUntil: (t: number) => {
      for (;;) {
        const pt = q.peekTime()
        if (pt === null || pt > t) break
        const e = q.pop()!
        now = e.t
        e.fn()
      }
      now = t
    },
    at: (t: number, fn: () => void) => q.schedule(t, fn),
  }
}

/** Every node hears every other: a run with locks, a collision and CCA transitions. */
const BUSY_LINKS: Record<string, number> = {
  'a>b': -60, 'a>c': -70, 'b>a': -60, 'b>c': -75, 'c>a': -70, 'c>b': -75,
}

/** Run one frame a→b and report how `b`'s reception ended. */
function receive(rxDbm: number, mode: SpectrumMode): { type: string; reason?: string } {
  const { ch, records, runUntil, at } = setup(
    { 'a>b': rxDbm, 'a>c': -200, 'b>a': rxDbm, 'b>c': -200, 'c>a': -200, 'c>b': -200 },
    mode,
  )
  at(1000, () => ch.startTx('a', frame('a', 'b')))
  runUntil(10_000_000)
  const r = records.find((x) => (x.type === 'RX_OK' || x.type === 'RX_FAIL') && x.node === 'b')
  return r === undefined ? { type: 'none' } : { type: r.type, reason: (r as { reason?: string }).reason }
}

describe('Channel · foreign in-band power from the Spectrum', () => {
  it("adds the foreign term to a lock's worst-case interference", () => {
    // −14 dBm spread over 499.2 MHz, 80 MHz of it in band, 4 m of UWB free space.
    const foreign = foreignDbmAtB(-14)
    expect(foreign).toBeCloseTo(-82.69, 2)
    // A reception decodes while rxDbm − (noise in 80 MHz + foreign) ≥ the 54 Mb/s threshold,
    // so the level at which it flips pins the interference sum to a fraction of a dB.
    const boundary = sinrThreshDb(MBPS) + sumDbm(noiseDbm(WIDTH_MHZ), foreign)
    expect(receive(boundary + 0.05, { eirpDbm: -14 })).toEqual({ type: 'RX_OK', reason: undefined })
    expect(receive(boundary - 0.05, { eirpDbm: -14 })).toEqual({ type: 'RX_FAIL', reason: 'lowSinr' })
    // The UWB frame is what moved that boundary: against thermal noise alone the
    // very same reception still clears the threshold, by the 6.4 dB noise rise.
    expect(receive(boundary - 0.05, 'empty')).toEqual({ type: 'RX_OK', reason: undefined })
    expect(boundary - (sinrThreshDb(MBPS) + noiseDbm(WIDTH_MHZ))).toBeCloseTo(6.41, 2)
  })

  it('turns a clean reception into RX_FAIL lowSinr when the foreign power is raised', () => {
    expect(receive(-50, { eirpDbm: -14 })).toEqual({ type: 'RX_OK', reason: undefined })
    // +10 dBm in the UWB band puts −58.7 dBm into the Wi-Fi channel at b: 8.7 dB
    // of SINR where 30 dB is needed. No Wi-Fi transmitter overlapped, so the
    // reception is lost to 'lowSinr' and no COLLISION is drawn.
    expect(foreignDbmAtB(10)).toBeCloseTo(-58.69, 2)
    expect(receive(-50, { eirpDbm: 10 })).toEqual({ type: 'RX_FAIL', reason: 'lowSinr' })
  })

  it('buries a weak preamble under foreign power', () => {
    // Detection needs 4 dB over everything else on the air. At −56 dBm against
    // a −58.7 dBm UWB frame there is 2.7 dB, so no preamble is acquired at all —
    // no lock, no RX_FAIL, no EIFS; on thermal noise alone the same PPDU decodes.
    const missed = (mode: SpectrumMode): TLRecord[] => {
      const { ch, records, runUntil, at } = setup(
        { 'a>b': -56, 'a>c': -200, 'b>a': -56, 'b>c': -200, 'c>a': -200, 'c>b': -200 },
        mode,
      )
      at(1000, () => ch.startTx('a', frame('a', 'b')))
      runUntil(10_000_000)
      return records.filter((r) => r.type === 'RX_MISS' || r.type === 'RX_START')
    }
    expect(missed({ eirpDbm: 10 }).map((r) => [r.type, (r as { reason?: string }).reason])).toEqual([
      ['RX_MISS', 'preambleSinr'],
    ])
    expect(missed('empty').map((r) => r.type)).toEqual(['RX_START'])
  })

  it('holds CCA busy on energy alone when a foreign emission passes −62 dBm', () => {
    const { s, emission, records, runUntil, at } = setup(BUSY_LINKS, { eirpDbm: 20 })
    // +20 dBm EIRP: −48.7 dBm in the Wi-Fi channel at b, above the −62 dBm
    // energy-detect floor; a and c are 100 m away and stay idle.
    expect(foreignDbmAtB(20)).toBeGreaterThan(CCA_ED_DBM)
    at(500_000, () => s.retire('uwb', emission!))
    runUntil(1_000_000)
    const cca = records.filter((r) => r.type === 'CCA_BUSY' || r.type === 'CCA_IDLE')
    expect(cca.map((r) => [r.type, r.node, (r as { cause?: string }).cause])).toEqual([
      ['CCA_BUSY', 'b', 'energy'],
      ['CCA_IDLE', 'b', undefined],
    ])
  })

  it('leaves every record untouched when no spectrum is passed', () => {
    const run = (mode: SpectrumMode): TLRecord[] => {
      const { ch, records, runUntil, at } = setup(BUSY_LINKS, mode)
      at(1000, () => ch.startTx('a', frame('a', 'b')))
      at(5000, () => ch.startTx('c', frame('c', 'b')))
      at(2_000_000, () => ch.startTx('b', frame('b', 'a')))
      runUntil(10_000_000)
      return records
    }
    const bare = run('none')
    expect(bare.length).toBeGreaterThan(10)
    expect(bare.some((r) => r.type === 'COLLISION')).toBe(true)
    // A Spectrum with nothing on the air contributes exactly 0 mW to every sum.
    expect(run('empty')).toEqual(bare)
  })
})

// --- Simulation: when the mediator is built at all -----------------------------

const wifiNode = (id: string, kind: 'ap' | 'sta', x: number): NodeCfg => ({
  id, kind, name: id, pos: { x, y: 0, z: kind === 'ap' ? 2 : 1 },
  txPowerDbm: kind === 'ap' ? 20 : 15, profiles: ['idle'],
  caps: { generation: 'eht', features: { edca: true, ampdu: true, txop: true } },
  ...(kind === 'sta' ? { linkId: '6g' as const } : {}),
})

const uwbNode = (id: string, x: number, y: number, role: 'anchor' | 'tag'): NodeCfg => ({
  id, kind: 'uwb', name: id, pos: { x, y, z: 1 }, txPowerDbm: -14, profiles: ['idle'],
  caps: { generation: 'nonht', features: {} }, uwb: { role, ppm: 0 },
})

const UWB_NODES = [
  uwbNode('anc-1', 5, 0, 'anchor'), uwbNode('anc-2', 0, 5, 'anchor'), uwbNode('anc-3', -5, 0, 'anchor'),
  uwbNode('tag-1', 0, 0, 'tag'),
]

function scenario(opts: { wifi: boolean; uwb: 5 | 9 | null; centerMhz?: number; nbChannels?: number[] }): Scenario {
  return {
    rooms: [{ x: -8, y: -8, w: 20, h: 20, name: 'lab' }],
    walls: [],
    // Wi-Fi nodes first, UWB nodes last: the traffic streams are seeded from
    // each node's index, so appending must not renumber a station's stream.
    nodes: [
      ...(opts.wifi ? [wifiNode('ap', 'ap', 8), wifiNode('sta-1', 'sta', 6)] : []),
      ...(opts.uwb === null ? [] : UWB_NODES),
    ],
    servers: [],
    seed: 7,
    rtsThresholdBytes: 3000,
    snapshotIntervalMs: 10,
    ...(opts.uwb === null ? {} : {
      uwb: {
        ...DEFAULT_UWB_SESSION, channel: opts.uwb, nlos: false,
        // an MMS session only when a narrowband allow list is asked for
        ...(opts.nbChannels === undefined ? {} : {
          mode: 'mms' as const,
          mms: { ...DEFAULT_UWB_SESSION.mms, nbChannels: [...opts.nbChannels] },
        }),
      },
    }),
    ...(opts.centerMhz === undefined ? {} : { sixGhzCenterMhz: opts.centerMhz }),
  }
}

describe('Simulation · the Spectrum exists only where the bands meet', () => {
  it('builds no mediator without both technologies', () => {
    expect(new Simulation(scenario({ wifi: false, uwb: 5, centerMhz: 6305 })).spectrum).toBeNull()
    expect(new Simulation(scenario({ wifi: true, uwb: null, centerMhz: 6305 })).spectrum).toBeNull()
  })

  it('builds no mediator when the two channels do not overlap', () => {
    // 6 GHz channel 7 (the default centre): 5945–6025 MHz, clear of UWB channel 5.
    expect(new Simulation(scenario({ wifi: true, uwb: 5, centerMhz: 5985 })).spectrum).toBeNull()
    expect(new Simulation(scenario({ wifi: true, uwb: 5 })).spectrum).toBeNull()
    // UWB channel 9 (7987.2 MHz) never meets a 6 GHz Wi-Fi channel.
    expect(new Simulation(scenario({ wifi: true, uwb: 9, centerMhz: 6305 })).spectrum).toBeNull()
  })

  it('builds one mediator for a 6 GHz link inside the UWB channel-5 band', () => {
    const sim = new Simulation(scenario({ wifi: true, uwb: 5, centerMhz: 6305 }))
    expect(sim.spectrum).toBeInstanceOf(Spectrum)
  })

  it('couples an MMS session whose narrowband allow list reaches into UNII-5', () => {
    // UWB channel 9 never meets 6 GHz Wi-Fi, so only the narrowband side can couple here:
    // control channel 200 is 6301.25 MHz, inside the AP's 6305 MHz channel.
    const sim = new Simulation(scenario({ wifi: true, uwb: 9, centerMhz: 6305, nbChannels: [200] }))
    expect(sim.spectrum).toBeInstanceOf(Spectrum)
  })

  it('leaves a UNII-3 allow list uncoupled, so the default session is unchanged', () => {
    // channel 3 is 5733.75 MHz: the whole UNII-3 half of the plan is below every 6 GHz channel
    expect(DEFAULT_UWB_SESSION.mms.nbChannels).toEqual([3])
    expect(new Simulation(scenario({ wifi: true, uwb: 9, centerMhz: 6305, nbChannels: [3] })).spectrum).toBeNull()
    // and every UNII-3 channel behaves the same way, including the highest
    expect(new Simulation(scenario({ wifi: true, uwb: 9, centerMhz: 6305, nbChannels: [0, 49] })).spectrum).toBeNull()
  })
})
