import { describe, it, expect } from 'vitest'
import {
  MMRS_LEN, MMS_COMBINE_MAX_DB, MMS_SETS, MMS_SPREAD, MS_CHIPS, MS_RSTU,
  UWB_MS_BUDGET_NJ, combineGainDb, mmsFragmentDbm, mmsLayout, mmsLongestFragmentNs, mmsSet,
  mmrsSymbolChips, MS_NS, MS_RCTU, ratioSigma, rifChips, rifNs, rmarkerFromFragment, rsfChips,
  rsfNs, trainDetected,
  type MmsPhy, type MmsSetId,
} from '../../src/uwb/mms'
import {
  COUNTER_MOD, RCTU_NS, RCTU_PER_CHIP, RSTU_CHIPS, UWB_CHIP_HZ, UWB_CHIP_NS, UWB_PL_EXP,
  UWB_RX_SENS_DBM, UWB_TX_POWER_DBM,
  uwbPl0Db,
} from '../../src/uwb/phy'
import { WALL_LOSS_DB } from '../../src/engine/propagation'

/** A train of X RSFs and Y RIFs at the session default fragment shape. */
function train(rsfs: MmsPhy['rsfs'], rifs: MmsPhy['rifs'], gapMs: MmsPhy['gapMs']): MmsPhy {
  return { rsfs, rifs, nMsr: 40, gap: 64, stsLen: 64, gapMs }
}

describe('the multi-millisecond fragment', () => {
  it('measures its millisecond in chips and in RSTU', () => {
    expect(MS_CHIPS).toBe(UWB_CHIP_HZ / 1000)
    expect(MS_RSTU * RSTU_CHIPS).toBe(MS_CHIPS)
  })

  it('builds an MMRS symbol from the length-128 set, its two gaps and the spreading factor', () => {
    expect(mmrsSymbolChips(0)).toBe(MMS_SPREAD * MMRS_LEN)
    expect(mmrsSymbolChips(33)).toBe(4 * (128 + 2 * 33))
    expect(mmrsSymbolChips(64)).toBe(4 * (128 + 2 * 64))
    expect(rsfChips(40, 33)).toBe(40 * mmrsSymbolChips(33))
    expect(rsfChips(40, 33)).toBe(31_040)
    expect(rifChips(64)).toBe(64 * 512)
  })

  it('reproduces the four published fragment lengths, to 0.01 µs', () => {
    // 4ab draft 15-23/0100r2 quotes these as "62.2", "65.6", "< 92" and "65.6" µs.
    expect(rsfNs(40, 33) / 1000).toBeCloseTo(62.18, 2)
    expect(rsfNs(32, 64) / 1000).toBeCloseTo(65.64, 2)
    expect(rsfNs(64, 25) / 1000).toBeCloseTo(91.28, 2)
    expect(rifNs(64) / 1000).toBeCloseTo(65.64, 2)
    // Every fragment length is a whole number of nanoseconds, like every other PPDU here.
    expect(Number.isInteger(rsfNs(40, 64))).toBe(true)
    expect(Number.isInteger(rifNs(256))).toBe(true)
  })

  it('reproduces the RSF length of every mandatory RSF-only set', () => {
    // The lengths 15-23/0502r3 prints beside the ten RSF-only sets, in set order. Nine land
    // inside half of the table's last printed digit; rsf-7 is 62.051 µs against a printed 62.0,
    // which is the table's own rounding — so the loop allows 0.06 µs and the exact value of
    // that one set is pinned on its own below.
    const printedUs = [62.2, 64.7, 66.0, 68.6, 69.9, 57.9, 62.0, 63.1, 64.1, 65.6]
    printedUs.forEach((us, i) => {
      const id = `rsf-${i + 1}` as MmsSetId
      const set = MMS_SETS[id]
      expect(set.rsfs, id).toBe(16)
      expect(set.rifs, id).toBe(0)
      expect(set.gapMs, id).toBe(1)
      expect(Math.abs(rsfNs(set.nMsr, set.gap) / 1000 - us), `${id} is ${rsfNs(set.nMsr, set.gap) / 1000} µs`)
        .toBeLessThanOrEqual(0.06)
    })
    expect(rsfNs(MMS_SETS['rsf-7'].nMsr, MMS_SETS['rsf-7'].gap)).toBe(62_051)
  })

  it('ships the seven mixed sets at one RSF shape and the (X, Y) pairs of the draft', () => {
    const pairs = MMS_SETS
    const mixed: Array<[MmsSetId, number, number]> = [
      ['mixed-1', 1, 1], ['mixed-2', 1, 2], ['mixed-3', 1, 4], ['mixed-4', 1, 8],
      ['mixed-5', 2, 2], ['mixed-6', 4, 4], ['mixed-7', 8, 8],
    ]
    for (const [id, x, y] of mixed) {
      expect(pairs[id], id).toEqual({ rsfs: x, rifs: y, nMsr: 64, gap: 25, stsLen: 64, gapMs: 1 })
    }
    expect(Object.keys(MMS_SETS)).toHaveLength(17)
    // `mmsSet` hands out a copy: a caller that spreads it into a session config cannot edit the table.
    const copy = mmsSet('mixed-7')
    expect(copy).toEqual(MMS_SETS['mixed-7'])
    expect(copy).not.toBe(MMS_SETS['mixed-7'])
  })
})

describe('the fragment’s share of the millisecond budget', () => {
  it('spends 37 nJ in the fragment’s own length', () => {
    expect(UWB_MS_BUDGET_NJ).toBe(37)
    expect(mmsFragmentDbm(rsfNs(40, 64))).toBeCloseTo(-3.46, 2)
    expect(mmsFragmentDbm(rsfNs(40, 33))).toBeCloseTo(-2.25, 2)
    expect(mmsFragmentDbm(rifNs(64))).toBeCloseTo(-2.49, 2)
    // A shorter fragment holds the same energy, so it is louder.
    expect(mmsFragmentDbm(rsfNs(32, 49))).toBeGreaterThan(mmsFragmentDbm(rsfNs(64, 25)))
  })

  it('combines equal-power fragments coherently, up to the largest train', () => {
    expect(combineGainDb(0)).toBe(0)
    expect(combineGainDb(1)).toBe(0)
    expect(combineGainDb(16)).toBe(MMS_COMBINE_MAX_DB)
    expect(MMS_COMBINE_MAX_DB).toBeCloseTo(12.04, 2)
    expect(combineGainDb(4)).toBeCloseTo(6.02, 2)
  })

  it('detects a train the single fragment is too quiet for', () => {
    // −100.2 dBm is 7.2 dB under sensitivity: eight fragments (9.03 dB) clear it, four do not.
    expect(trainDetected(-100.2, 8)).toBe(true)
    expect(trainDetected(-100.2, 4)).toBe(false)
    expect(trainDetected(UWB_RX_SENS_DBM, 1)).toBe(true)
    expect(trainDetected(UWB_RX_SENS_DBM - 0.1, 1)).toBe(false)
    expect(trainDetected(-200, 0)).toBe(false)
  })

  it('sharpens the clock ratio with the span the train covers', () => {
    expect(ratioSigma(100, 7)).toBeCloseTo(2.0203e-8, 12)
    // Twice the span, half the error.
    expect(ratioSigma(100, 14)).toBeCloseTo(ratioSigma(100, 7) / 2, 12)
    // In ppm, the two numbers the spec quotes for X = 8 and X = 16.
    expect(ratioSigma(100, 7) * 1e6).toBeCloseTo(0.0202, 4)
    expect(ratioSigma(100, 15) * 1e6).toBeCloseTo(0.0094, 4)
  })
})

describe('the reach a train buys (closed form, channel 9, line of sight)', () => {
  /** Distance at which a transmitter of `txDbm` plus `gainDb` of combining lands on sensitivity. */
  function reachM(txDbm: number, gainDb: number, wallsDb: number): number {
    const budgetDb = txDbm + gainDb - UWB_RX_SENS_DBM - uwbPl0Db(9) - wallsDb
    return 10 ** (budgetDb / (10 * UWB_PL_EXP))
  }
  const fragDbm = mmsFragmentDbm(rsfNs(40, 64))
  const twoBricks = 2 * WALL_LOSS_DB.brick

  it('is 26.6 m for a 4z frame and 89.6 m for one fragment', () => {
    expect(reachM(UWB_TX_POWER_DBM, 0, 0)).toBeCloseTo(26.6, 1)
    expect(reachM(fragDbm, combineGainDb(1), 0)).toBeCloseTo(89.6, 1)
  })

  it('is 253.4 m for the default eight-fragment train, 16.0 m of it behind two brick walls', () => {
    expect(reachM(fragDbm, combineGainDb(8), 0)).toBeCloseTo(253.4, 1)
    expect(reachM(fragDbm, combineGainDb(8), twoBricks)).toBeCloseTo(16.0, 1)
  })
})

describe('the slot layout of one MMS pair round', () => {
  it('lays the default (X = 8, Y = 0) train out in 28 slots', () => {
    const l = mmsLayout(train(8, 0, 1))
    expect(l.controlSlots).toBe(4)
    expect(l.rpSlots).toBe(20)
    expect(l.reportSlots).toBe(4)
    expect(l.slots).toBe(28)
    for (let m = 0; m < 8; m++) {
      expect(l.fragmentSlot('initiator', 'rsf', m), `rsf ${m}`).toBe(4 + 2 * m)
      expect(l.fragmentSlot('responder', 'rsf', m), `rsf ${m}`).toBe(5 + 2 * m)
    }
    expect(l.reportSlot('responder')).toBe(24)
    expect(l.reportSlot('initiator')).toBe(26)
  })

  it('grows the ranging phase past the draft’s floor of 20 slots', () => {
    expect(mmsLayout(train(16, 0, 1)).rpSlots).toBe(32)
    expect(mmsLayout(train(16, 0, 1)).slots).toBe(40)
    expect(mmsLayout(train(1, 0, 1)).rpSlots).toBe(20)
    expect(mmsLayout(train(1, 0, 1)).slots).toBe(28)
  })

  it('places the RIF train after the RSFs, with the idle millisecond when Z = 2', () => {
    const z1 = mmsLayout(train(8, 8, 1))
    expect(z1.rpSlots).toBe(32)
    expect(z1.fragmentSlot('initiator', 'rif', 0)).toBe(20)
    expect(z1.fragmentSlot('responder', 'rif', 0)).toBe(21)
    expect(z1.fragmentSlot('initiator', 'rif', 7)).toBe(34)
    const z2 = mmsLayout(train(8, 8, 2))
    expect(z2.rpSlots).toBe(34)
    expect(z2.fragmentSlot('initiator', 'rif', 0)).toBe(22)
  })

  it('opens the ranging phase with the RIF when there is no RSF at all', () => {
    const l = mmsLayout(train(0, 1, 1))
    expect(l.rpSlots).toBe(20)
    expect(l.fragmentSlot('initiator', 'rif', 0)).toBe(4)
    expect(l.fragmentSlot('responder', 'rif', 0)).toBe(5)
  })

  it('refuses a fragment the train does not have', () => {
    const l = mmsLayout(train(8, 0, 1))
    expect(() => l.fragmentSlot('initiator', 'rsf', 8)).toThrow(/fragment/)
    expect(() => l.fragmentSlot('initiator', 'rif', 0)).toThrow(/fragment/)
    expect(() => l.fragmentSlot('responder', 'rsf', -1)).toThrow(/fragment/)
  })

  it('every fragment and both reports land inside the round', () => {
    for (const rsfs of [0, 1, 2, 4, 8, 16] as const) {
      for (const rifs of [0, 1, 2, 4, 8] as const) {
        if (rsfs + rifs === 0) continue
        for (const gapMs of [1, 2] as const) {
          const l = mmsLayout(train(rsfs, rifs, gapMs))
          const last = Math.max(
            rsfs > 0 ? l.fragmentSlot('responder', 'rsf', rsfs - 1) : -1,
            rifs > 0 ? l.fragmentSlot('responder', 'rif', rifs - 1) : -1,
          )
          expect(last, `${rsfs}/${rifs}/${gapMs}`).toBeLessThan(l.controlSlots + l.rpSlots)
          expect(l.reportSlot('initiator') + 1, `${rsfs}/${rifs}/${gapMs}`).toBeLessThan(l.slots)
        }
      }
    }
  })

  it('sizes a slot by the longest fragment the train carries', () => {
    expect(mmsLongestFragmentNs(train(8, 0, 1))).toBe(rsfNs(40, 64))
    expect(mmsLongestFragmentNs(train(0, 1, 1))).toBe(rifNs(64))
    expect(mmsLongestFragmentNs({ rsfs: 1, rifs: 1, nMsr: 32, gap: 0, stsLen: 256, gapMs: 1 })).toBe(rifNs(256))
    // A 256-unit RIF is 262.6 µs and is why the 300 RSTU slot rule can still fail.
    expect(rifNs(256) / 1000).toBeCloseTo(262.56, 2)
  })
})

// --- The millisecond ruler ------------------------------------------------------

describe('one millisecond, in the units the ratio is measured in', () => {
  it('is 63 897 600 RCTU, exactly', () => {
    expect(MS_NS).toBe(1_000_000)
    expect(MS_RCTU).toBe(63_897_600)
    // The same number the engine's own RCTU gives, to the nanosecond — and built from the one
    // shared RCTU_PER_CHIP of the units leaf, not from a second copy of the 128.
    expect(MS_RCTU).toBe(MS_CHIPS * RCTU_PER_CHIP)
    expect(RCTU_NS).toBe(UWB_CHIP_NS / RCTU_PER_CHIP)
    expect(MS_RCTU * RCTU_NS).toBeCloseTo(MS_NS, 6)
  })

  it('is what turns a measured span into a clock ratio', () => {
    // A receiver 20 ppm fast measures 7 ms of a train as 7 ms × (1 + 20e-6) of its own counter.
    const span = 7 * MS_RCTU * (1 + 20e-6)
    expect((span / (7 * MS_RCTU) - 1) * 1e6).toBeCloseTo(20, 9)
  })
})

describe('rmarkerFromFragment', () => {
  it('is the fragment’s own stamp when the train’s first fragment arrived', () => {
    // Index 0 walks back nothing at all, whatever the ratio says — which is why a train that
    // arrived whole is stamped bit for bit as it was before the ratio entered this function.
    expect(rmarkerFromFragment(2_000_017, 0, null)).toBe(2_000_017)
    expect(rmarkerFromFragment(2_000_017, 0, 1 + 40e-6)).toBe(2_000_017)
  })

  it('walks back a millisecond of the transmitter’s per fragment when the first ones were lost', () => {
    // The same RMARKER, recovered from fragment i of a train whose first i were lost: the
    // structure is known from the narrowband control exchange, so any fragment times the train.
    // The receiver counts its own milliseconds, so each of the peer's is MS_RCTU × ratio of them.
    const rmarker = 2_000_017
    const ratio = 1 + 40e-6
    for (let i = 0; i < 8; i++) {
      const stamp = rmarker + Math.round(i * MS_RCTU * ratio)
      expect(rmarkerFromFragment(stamp, i, ratio), `fragment ${i}`).toBe(rmarker)
    }
  })

  it('leaves the crystals’ whole offset behind when there was no ratio to measure', () => {
    // One fragment heard and it was not the first: the receiver has only its own nominal
    // millisecond, and the walk-back is short by index × 1 ms × the offset between the clocks.
    const rmarker = 2_000_017
    const ratio = 1 + 40e-6
    const stamp = rmarker + Math.round(3 * MS_RCTU * ratio)
    const residualRctu = rmarkerFromFragment(stamp, 3, null) - rmarker
    expect(residualRctu).toBe(Math.round(3 * MS_RCTU * ratio) - 3 * MS_RCTU)
    // 3 ms × 40 ppm = 120 ns of counter, which is 7 665 RCTU.
    expect(residualRctu * RCTU_NS).toBeCloseTo(120, 1)
  })

  it('is exact: no rounding creeps in over the longest train the draft allows', () => {
    expect(rmarkerFromFragment(123_456_789 + 15 * MS_RCTU, 15, 1)).toBe(123_456_789)
    expect(MS_NS).toBe(1_000_000) // the true-time millisecond the train is cut on
  })

  it('wraps the 40-bit counter rather than going negative', () => {
    // A train whose first fragment fell before the counter rolled over.
    expect(rmarkerFromFragment(10, 1, 1)).toBe(COUNTER_MOD - MS_RCTU + 10)
  })
})
