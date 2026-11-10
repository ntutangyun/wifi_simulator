/**
 * Standard §10.45 (P802.15.4ab **draft**; §10.45 does not exist in the published
 * IEEE Std 802.15.4-2024 — see `docs/superpowers/specs/2026-10-03-ssbd-design.md` §0.1):
 * spectrum sensing based deferral's own worst-case latency bound, and the room one narrowband
 * window has left for a backoff to fit in.
 *
 * `ssbdBoundNs` is this slice's hardest "caps are computed" instance, because the thing that is
 * stale is the standard's own appendix: the TFD's two published examples (46 µs at the defaults,
 * 2.088 ms tuned) reproduce only under two premises CID 489/493 and CID 490/495 later overturned
 * — a `2 × BF` backoff draw (now `random(BF)`) and a 1 µs CCA (now the PHY's own
 * `phyCcaDuration`, this engine's `NB_LBT_CCA_US` = 9 µs). Both numbers below are read out of the
 * function itself, not transcribed from the design doc or this comment.
 */
import { describe, it, expect } from 'vitest'
import { nbSlotSlackNs, rstuNs, ssbdBoundNs } from '../../src/uwb/phy'
import { NB_WINDOW_SLOTS } from '../../src/uwb/mms'
import {
  NB_PHY_CCA_DURATION_US, NB_POLL_BYTES, NB_REPORT_BYTES, nbOtmPollBytes, nbPpduNs,
} from '../../src/uwb/nb'

describe('ssbdBoundNs — standard §10.45 (draft), the worst-case latency bound', () => {
  /** standard §10.45: backoff factor lower bound 1, upper bound 5, max backoffs 5, backoff unit
   * 1 µs — `docs/superpowers/specs/2026-10-03-ssbd-design.md` §4.1's five-field defaults, minus
   * `txOnEnd`, which this bound does not depend on. */
  const DEFAULTS = { minBf: 1, maxBf: 5, maxBackoffs: 5, unitBackoffUs: 1 }

  // 2026-11-11 (audit #20): each CCA lasts phyCcaDuration, 8 symbol periods = 128 µs (standard
  // Table 12-2; CID 490/495 has SSBD read the PHY's attribute). It was 9 µs, the ETSI minimum.
  it('computes the default bound as 788 µs — six 128 µs CCAs and 20 µs of backoff — not the appendix’s 46', () => {
    expect(ssbdBoundNs(DEFAULTS)).toBe(788_000)
    expect(ssbdBoundNs(DEFAULTS)).not.toBe(46_000)
  })

  it('reproduces the TFD appendix’s stale 46 µs only under both of its overturned premises at once', () => {
    // CID 489/493: `2 × BF` → `random(BF)`. CID 490/495: a dedicated SSBD CCA duration → the
    // PHY attribute. Reinstating both — not just one — is what gets back to the appendix's
    // number; that is the whole reason the appendix expired.
    expect(ssbdBoundNs({ ...DEFAULTS, backoffMultiplier: 2, ccaUs: 1 })).toBe(46_000)
  })

  it('the default bound is read off NB_PHY_CCA_DURATION_US, not a copied-in literal', () => {
    let expectedUs = 0
    for (let i = 0; i <= DEFAULTS.maxBackoffs; i++) {
      expectedUs += Math.min(DEFAULTS.minBf + i, DEFAULTS.maxBf) * DEFAULTS.unitBackoffUs + NB_PHY_CCA_DURATION_US
    }
    expect(ssbdBoundNs(DEFAULTS)).toBe(expectedUs * 1000)
  })

  it('a wider configuration moves the bound, so the function is not a constant in disguise', () => {
    expect(ssbdBoundNs({ minBf: 1, maxBf: 63, maxBackoffs: 10, unitBackoffUs: 63 })).toBeGreaterThan(
      ssbdBoundNs(DEFAULTS),
    )
  })
})

describe('nbSlotSlackNs — the room left in a narrowband window (NB_WINDOW_SLOTS × slotNs − nbPpduNs)', () => {
  // The MMS session's own slot length (`uwb-nba`, `uwb-nba-coexist`): 600 RSTU = 500 µs, so two
  // window slots are 1 ms — nothing here is a literal, it is `rstuNs` and `NB_WINDOW_SLOTS`.
  const slotNs = rstuNs(600)

  it('a POLL leaves 424 µs of slack', () => {
    const unclamped = NB_WINDOW_SLOTS * slotNs - nbPpduNs(NB_POLL_BYTES)
    expect(nbSlotSlackNs(slotNs, NB_POLL_BYTES)).toBe(unclamped)
    expect(nbSlotSlackNs(slotNs, NB_POLL_BYTES)).toBe(424_000)
  })

  it('a REPORT leaves 392 µs of slack', () => {
    const unclamped = NB_WINDOW_SLOTS * slotNs - nbPpduNs(NB_REPORT_BYTES)
    expect(nbSlotSlackNs(slotNs, NB_REPORT_BYTES)).toBe(unclamped)
    expect(nbSlotSlackNs(slotNs, NB_REPORT_BYTES)).toBe(392_000)
  })

  // 2026-11-11: the one-to-many POLL is 12 + 3N octets (15-22/0381r5 Table 1.6.3.1), not 14 + 3N, so
  // four responders fit (40 µs left) and it is five that overrun.
  it('a one-to-many POLL at 5 responders overruns its own window: −56 µs before clamping, 0 after', () => {
    // NB_WINDOW_SLOTS is a fixed 2 and does not scale with the message, so `max(0, …)` must not
    // hide this: it is a real answer (one configuration where a backoff cannot fit at all).
    expect(NB_WINDOW_SLOTS * slotNs - nbPpduNs(nbOtmPollBytes(4))).toBe(40_000)
    const bytes = nbOtmPollBytes(5)
    const unclamped = NB_WINDOW_SLOTS * slotNs - nbPpduNs(bytes)
    expect(unclamped).toBe(-56_000)
    expect(nbSlotSlackNs(slotNs, bytes)).toBe(0)
  })
})
