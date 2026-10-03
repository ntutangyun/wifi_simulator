/**
 * What `phyUwbMmsRsfSfd` costs on the air: the SFD the draft appends to every RSF, and the peak
 * power the fragment gives up for it (`docs/superpowers/specs/2026-10-03-leftovers-design.md` §2).
 *
 * The attribute used to reach exactly one line of this engine — which fragments `acquired` is
 * allowed to try — and the fragment itself did not change by a chip. The two fixture rows said so:
 * `uwb-acquisition` and `uwb-acquisition#0` held the same air hash. So the lesson taught the
 * attribute as a one-way gain, which is not what the draft's own two conditions imply.
 *
 * Two independent derivations give this SFD the same duration, which is why nothing here is a new
 * literal:
 *
 *  - the standard's: Table 16-31's BPRF parameter sets all carry an 8-preamble-symbol SFD
 *    (Table 16-11 SFD #2), and Table 16-10 gives the length-91 code a 364-chip symbol, so
 *    8 × 364 chips is 5 833 ns;
 *  - the draft's: the short-packet column of 15-25/0194r0's acquisition table gives the SFD cell
 *    as 5.8 µs, and that cell is already `MMS_SP0_SEGMENT_NS.sfd`.
 *
 * They agree to 0.57%, so the implementation takes the one the engine already holds.
 */
import { describe, it, expect } from 'vitest'
import {
  MMS_DRAFT_DEFAULTS, MMS_RSF_SFD_N_MSR, MMS_SPREAD, MMS_SP0_SEGMENT_NS, mmsFragmentDbm,
  mmsLongestFragmentNs, rsfAirNs, rsfNs, type MmsPhy, type NMsr,
} from '../../src/uwb/mms'
import { makeRsf } from '../../src/uwb/frames'
import { UWB_SLOT_GUARD_NS, uwbSlotFitNs } from '../../src/uwb/phy'
import { chipsToNs } from '../../src/uwb/units'
import { DEFAULT_UWB_SESSION } from '../../src/model/scenario'

/** The session's own train at one of the two fragment lengths the draft allows the SFD after. */
const phy = (nMsr: NMsr, over: Partial<MmsPhy> = {}): MmsPhy => ({
  rsfs: 8, rifs: 0, nMsr, gap: DEFAULT_UWB_SESSION.mms.gap, stsLen: 64, gapMs: 1,
  ...MMS_DRAFT_DEFAULTS, control: 'uwbd', uwbdControl: 'none', ...over,
})

const rsfOf = (p: MmsPhy) => makeRsf('tag-1', 'anchor-1', 0, p, 1, 0, 0)

describe('the SFD after every RSF has a length, and it is the one the engine already holds', () => {
  it('is off by default, so no stored plan changes', () => {
    expect(MMS_DRAFT_DEFAULTS.rsfSfd).toBe(false)
    for (const n of MMS_RSF_SFD_N_MSR) {
      expect(rsfAirNs(phy(n))).toBe(rsfNs(n, DEFAULT_UWB_SESSION.mms.gap))
    }
  })

  it('appends the draft table cell, and the standard derives the same duration twice', () => {
    // The draft's path: the cell is already in the engine, as the SP0 packet's own SFD segment.
    for (const n of MMS_RSF_SFD_N_MSR) {
      const bare = rsfNs(n, DEFAULT_UWB_SESSION.mms.gap)
      expect(rsfAirNs(phy(n, { rsfSfd: true })) - bare).toBe(MMS_SP0_SEGMENT_NS.sfd)
    }
    // The standard's path: 8 preamble symbols of the length-91 code (Table 16-10, Table 16-11
    // SFD #2, Table 16-31). The two agree to better than 0.6%, which is what licenses taking the
    // engine's own constant instead of inventing a second one.
    const SFD_PREAMBLE_SYMBOLS = 8
    const fromStandard = chipsToNs(SFD_PREAMBLE_SYMBOLS * 91 * MMS_SPREAD)
    expect(fromStandard).toBe(5_833)
    expect(Math.abs(fromStandard - MMS_SP0_SEGMENT_NS.sfd) / MMS_SP0_SEGMENT_NS.sfd)
      .toBeLessThan(0.006)
  })

  it('does not depend on the fragment length or the gap — it is one fixed duration', () => {
    const added = (p: MmsPhy): number => rsfAirNs({ ...p, rsfSfd: true }) - rsfAirNs(p)
    for (const n of MMS_RSF_SFD_N_MSR) {
      for (const gap of [25, 33, 64]) {
        expect(added(phy(n, { gap }))).toBe(MMS_SP0_SEGMENT_NS.sfd)
      }
    }
  })
})

describe('the fragment on the air, and the peak power it gives up', () => {
  it('lengthens the RSF frame by the SFD at both allowed lengths', () => {
    for (const n of MMS_RSF_SFD_N_MSR) {
      const off = rsfOf(phy(n))
      const on = rsfOf(phy(n, { rsfSfd: true }))
      expect(off.txTimeNs).toBe(rsfAirNs(phy(n)))
      expect(on.txTimeNs).toBe(rsfAirNs(phy(n, { rsfSfd: true })))
      expect(on.txTimeNs - off.txTimeNs).toBe(MMS_SP0_SEGMENT_NS.sfd)
    }
    // The two figures the lesson prints, computed: 131 282 → 137 082 and 65 641 → 71 441 ns.
    expect([rsfOf(phy(64)).txTimeNs, rsfOf(phy(64, { rsfSfd: true })).txTimeNs])
      .toEqual([131_282, 137_082])
    expect([rsfOf(phy(32)).txTimeNs, rsfOf(phy(32, { rsfSfd: true })).txTimeNs])
      .toEqual([65_641, 71_441])
  })

  it('charges the millisecond budget for it, and the shorter fragment pays about double', () => {
    // `mmsFragmentDbm` spends one millisecond's 37 nJ inside the fragment's own length, so a
    // longer fragment is a quieter one. Both deltas are computed, never typed.
    const cost = (n: NMsr): number =>
      rsfOf(phy(n, { rsfSfd: true })).uwb!.mms!.txDbm - rsfOf(phy(n)).uwb!.mms!.txDbm
    expect(cost(64)).toBeCloseTo(-0.188, 3)
    expect(cost(32)).toBeCloseTo(-0.368, 3)
    // The sentence this cut buys: the draft's two allowed lengths do not cost the same, and the
    // shorter one costs about twice as much.
    expect(cost(32) / cost(64)).toBeCloseTo(2.0, 1)
    // …and the frame's own dBm is still `mmsFragmentDbm` of its own length, nothing else.
    for (const n of MMS_RSF_SFD_N_MSR) {
      const on = rsfOf(phy(n, { rsfSfd: true }))
      expect(on.uwb!.mms!.txDbm).toBeCloseTo(mmsFragmentDbm(on.txTimeNs), 12)
    }
  })
})

describe('the ranging slot has to hold the longer fragment', () => {
  it('grows the longest fragment and the slot fit by exactly the SFD', () => {
    for (const n of MMS_RSF_SFD_N_MSR) {
      const off = phy(n)
      const on = phy(n, { rsfSfd: true })
      expect(mmsLongestFragmentNs(on) - mmsLongestFragmentNs(off)).toBe(MMS_SP0_SEGMENT_NS.sfd)
      expect(mmsLongestFragmentNs(on)).toBe(rsfAirNs(on))
      // The slot rule reads that maximum and adds the flight guard; a slot cut to the old length
      // would clip the fragment it is supposed to hold.
      const fit = (p: MmsPhy): number => uwbSlotFitNs(1, 'mms', 'time', p)
      expect(fit(on) - fit(off)).toBe(MMS_SP0_SEGMENT_NS.sfd)
      expect(fit(on)).toBe(rsfAirNs(on) + UWB_SLOT_GUARD_NS)
    }
  })

  it('leaves a train whose longest fragment is an RIF alone', () => {
    // The attribute follows an RSF, and an RIF is an STS segment: a train whose RIF is the
    // longest fragment sizes its slot off the RIF either way.
    const rifLed = phy(32, { rifs: 8, stsLen: 256 })
    expect(mmsLongestFragmentNs({ ...rifLed, rsfSfd: true })).toBe(mmsLongestFragmentNs(rifLed))
  })
})
