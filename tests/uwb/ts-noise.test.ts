/**
 * Timestamp precision against the link (P802.15.4ab completion, decision 1): a receive
 * timestamp's 1-σ is the session's `tsNoisePs` only at `TS_SNR_REF_DB`; below it the
 * leading-edge estimator degrades as √(SNR_ref / SNR) and is capped at `TS_SIGMA_MAX` times
 * the quoted value.
 *
 * Four of the tests are the shape itself and one is the consequence: a two-anchor DS-TWR
 * scene whose second anchor sits at the edge of the receiver's reach scatters its ranges
 * measurably wider than the anchor two metres away, from one seeded stream and with every
 * round of both links delivered.
 */
import { describe, it, expect } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import {
  DEFAULT_UWB_SESSION, type NodeCfg, type Scenario, type UwbSessionCfg,
} from '../../src/model/scenario'
import {
  TS_SIGMA_MAX, TS_SNR_REF_DB, tsNoiseScale, tsSigmaNs, UWB_NOISE_FLOOR_DBM, UWB_RX_SENS_DBM,
  UWB_TS_ACCUM_GAIN_DB, UWB_TX_POWER_DBM, uwbPathLossDb, uwbPl0Db, uwbSinrDb,
} from '../../src/uwb/phy'

const MS = 1_000_000

function uwbNode(id: string, x: number, role: 'anchor' | 'tag'): NodeCfg {
  return {
    id, kind: 'uwb', name: id, pos: { x, y: 0, z: 1 },
    txPowerDbm: UWB_TX_POWER_DBM, profiles: ['idle'],
    caps: { generation: 'nonht', features: {} },
    uwb: { role, ppm: 0 },
  }
}

/** A scenario that is nothing but a UWB session: anchors on the x axis, one tag at the origin. */
function scene(anchorX: number[], session: Partial<UwbSessionCfg> = {}): Scenario {
  return {
    rooms: [{ x: -40, y: -5, w: 80, h: 10, name: 'hall' }],
    walls: [],
    nodes: [...anchorX.map((x, i) => uwbNode(`anc-${i + 1}`, x, 'anchor')), uwbNode('tag-1', 0, 'tag')],
    servers: [],
    seed: 7,
    rtsThresholdBytes: 3000,
    snapshotIntervalMs: 10,
    uwb: { ...DEFAULT_UWB_SESSION, ...session },
  }
}

const run = (sc: Scenario, ns: number): TLRecord[] => new Simulation(sc).runUntil(ns).records
const ranges = (rs: TLRecord[], peer: string): Extract<TLRecord, { type: 'UWB_RANGE' }>[] =>
  rs.filter((r) => r.type === 'UWB_RANGE' && (r as { peer?: string }).peer === peer) as never

/** Free-space + spreading only: what a node `dM` away is heard at on the session's channel. */
const rssiAt = (dM: number, ch: 5 | 9): number => UWB_TX_POWER_DBM - uwbPathLossDb(uwbPl0Db(ch), dM, 0)

const rms = (xs: number[]): number => Math.sqrt(xs.reduce((a, b) => a + b * b, 0) / xs.length)

describe('σ_ts against the link', () => {
  it('is the quoted 1-σ at the reference SNR, and no better above it', () => {
    expect(TS_SNR_REF_DB).toBe(20)
    expect(tsNoiseScale(TS_SNR_REF_DB)).toBe(1)
    expect(tsNoiseScale(30)).toBe(1)
    expect(tsNoiseScale(Infinity)).toBe(1)
    expect(tsSigmaNs(100, TS_SNR_REF_DB)).toBeCloseTo(0.1, 12)
    expect(tsSigmaNs(100, 40)).toBeCloseTo(0.1, 12)
  })

  it('is ten times the quoted 1-σ at 0 dB — the cap, reached exactly where the shape does', () => {
    expect(TS_SIGMA_MAX).toBe(10)
    expect(tsNoiseScale(0)).toBeCloseTo(10, 12)
    expect(tsSigmaNs(100, 0)).toBeCloseTo(1, 12)
    // …and the shape itself between the two ends: √(SNR_ref / SNR). Three decibels down is
    // √(10^0.3) = 1.41 — a hair under √2, because a decibel is not quite a factor of two.
    expect(tsNoiseScale(17)).toBeCloseTo(Math.sqrt(10 ** 0.3), 12)
    expect(tsNoiseScale(17)).toBeCloseTo(Math.SQRT2, 2)
    expect(tsNoiseScale(10)).toBeCloseTo(Math.sqrt(10), 12)
  })

  it('holds the cap below 0 dB, however far down the link goes', () => {
    for (const snr of [-1, -20, -40, -200, -Infinity]) {
      expect(tsNoiseScale(snr)).toBe(TS_SIGMA_MAX)
      expect(tsSigmaNs(100, snr)).toBeCloseTo(1, 12)
    }
  })

  it('measures the SNR against a floor the packet detector sits above, and counts foreign power in', () => {
    expect(UWB_NOISE_FLOOR_DBM).toBeCloseTo(UWB_RX_SENS_DBM - UWB_TS_ACCUM_GAIN_DB, 12)
    expect(UWB_TS_ACCUM_GAIN_DB).toBeCloseTo(18.06, 2)
    // A frame at sensitivity is still timed, at the accumulation gain above the floor.
    expect(uwbSinrDb(UWB_RX_SENS_DBM, -Infinity)).toBeCloseTo(UWB_TS_ACCUM_GAIN_DB, 12)
    // Foreign power adds to the noise: as loud as the floor halves the ratio (−3 dB).
    expect(uwbSinrDb(-60, UWB_NOISE_FLOOR_DBM)).toBeCloseTo(uwbSinrDb(-60, -Infinity) - 3.0103, 3)
    // A Wi-Fi neighbour 30 dB over the floor takes the whole 30 dB out of the timestamp.
    expect(uwbSinrDb(-60, UWB_NOISE_FLOOR_DBM + 30)).toBeCloseTo(uwbSinrDb(-60, -Infinity) - 30, 2)
  })
})

describe('what it costs a range: two anchors, one at the edge of the reach', () => {
  // Anchor 1 is two metres away and well over the reference; anchor 2 sits where it is heard
  // just above sensitivity, which is the worst a *delivered* 4z frame can be timed at. Both
  // links are delivered in every round — nothing here is a loss test.
  const CLOSE_M = 2
  const FAR_M = 26
  const ch = DEFAULT_UWB_SESSION.channel
  // Six slots of 2400 RSTU is one DS round over two anchors, and the block is exactly that:
  // 12 ms a block, 300 blocks, one range per anchor per block.
  const sc = scene([CLOSE_M, FAR_M], { method: 'ds', nlos: false, blockRstu: 14_400 })
  const rs = run(sc, 3600 * MS)
  const close = ranges(rs, 'anc-1')
  const far = ranges(rs, 'anc-2')

  it('delivers both links in every block, so only the stamps differ', () => {
    expect(rssiAt(FAR_M, ch)).toBeGreaterThan(UWB_RX_SENS_DBM)
    expect(rssiAt(FAR_M, ch)).toBeLessThan(UWB_RX_SENS_DBM + 1)
    expect(close.length).toBeGreaterThan(200)
    expect(far).toHaveLength(close.length)
  })

  it('times the close link at the reference and the far one below it', () => {
    expect(uwbSinrDb(rssiAt(CLOSE_M, ch), -Infinity)).toBeGreaterThan(TS_SNR_REF_DB)
    expect(tsNoiseScale(uwbSinrDb(rssiAt(CLOSE_M, ch), -Infinity))).toBe(1)
    const farScale = tsNoiseScale(uwbSinrDb(rssiAt(FAR_M, ch), -Infinity))
    expect(farScale).toBeGreaterThan(1.2)
    expect(farScale).toBeLessThan(TS_SIGMA_MAX)
  })

  it('scatters the far anchor’s ranges wider than the close one’s, by about that factor', () => {
    const errOf = (rows: typeof close): number[] => rows.map((r) => r.distM - r.trueDistM)
    const closeRms = rms(errOf(close))
    const farRms = rms(errOf(far))
    const farScale = tsNoiseScale(uwbSinrDb(rssiAt(FAR_M, ch), -Infinity))
    expect(farRms).toBeGreaterThan(closeRms)
    // Both are the same number of samples from the same seeded stream, so the ratio lands
    // near the scale factor itself — generously bracketed, it is a sample ratio.
    expect(farRms / closeRms).toBeGreaterThan(1.1)
    expect(farRms / closeRms).toBeLessThan(farScale * 1.4)
  })
})

describe('a scene whose links are all above the reference', () => {
  it('draws exactly what it drew before the scaling existed', () => {
    // Four anchors at 5 m of a tag at the origin: every link is over the reference, so every
    // scale is exactly 1 and every counter in the run is the one the unscaled draw produced.
    const sc = scene([5, -5, 3, -3], { method: 'ds', nlos: false })
    const rs = run(sc, 600 * MS)
    for (const d of [5, 3]) {
      expect(tsNoiseScale(uwbSinrDb(rssiAt(d, DEFAULT_UWB_SESSION.channel), -Infinity))).toBe(1)
    }
    const stamps = rs.filter((r) => r.type === 'UWB_TS' && (r as { dir?: string }).dir === 'rx')
    expect(stamps.length).toBe(48) // three blocks × four anchors × four receive stamps
    // The lesson scenes of the same shape are pinned byte for byte in
    // tests/engine/uwb-record-hashes.json; this is the local statement of the same fact.
    expect(rms(ranges(rs, 'anc-1').map((r) => r.distM - r.trueDistM))).toBeLessThan(0.1)
  })

  it('leaves the pairwise MMS lesson scene alone: its trains combine past the reference', () => {
    // uwb-mms's second variant (rsf-1, X = 16) is a pair round whose fragments combine well over
    // the reference, which is why its entry in tests/fixtures/uwb-record-hashes.json — the
    // hash it had before any of this existed — still matches. (The lesson's pairwise base scene,
    // now variant 3 / uwb-mms#3, sits at 19.84–20.02 dB and did move.) The reason, in the run:
    // every detected train of it is timed at scale 1, so not one counter of it could move.
    const lesson = LESSONS.find((l) => l.id === 'uwb-mms')!
    const variant = lesson.variants![1]
    const recs = new Simulation(variant.scenario()).runUntil(1300 * MS).records
    const trains = recs.filter((r) => r.type === 'UWB_MMS_TRAIN') as unknown as
      { rxDbm: number; gainDb: number; detected: boolean }[]
    const detected = trains.filter((t) => t.detected)
    expect(detected.length).toBeGreaterThan(20)
    for (const t of detected) {
      expect(uwbSinrDb(t.rxDbm + t.gainDb, -Infinity)).toBeGreaterThan(TS_SNR_REF_DB)
      expect(tsNoiseScale(uwbSinrDb(t.rxDbm + t.gainDb, -Infinity))).toBe(1)
    }
  })
})
