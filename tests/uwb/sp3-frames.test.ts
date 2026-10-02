/**
 * Task 1 of docs/superpowers/specs/2026-10-02-sp3-design.md: the pure frame layer for SP3
 * grouped ranging (standard §10.32.8) and its SRRR IE (§10.32.9.9). No schema, no schedule, no
 * device lands here — this pins the SP3 marker's size, its emptiness, and the SRRR IE's cost only.
 *
 * An SP3 packet is SYNC + SFD + STS: no PHR, no PSDU (standard §10.32.8.2). It is the physically
 * shortest ranging frame the standard has, and precisely because it has no PSDU it cannot carry a
 * timestamp or an address — the time it measures has to come back later, in a data report phase.
 */
import { describe, expect, it } from 'vitest'
import { makeSp3 } from '../../src/uwb/frames'
import { uwbFrameFields } from '../../src/uwb/frameFields'
import {
  SRRR_IE_BYTES, UWB_SS_DEFER_BYTES, UWB_STS_CHIPS, UWB_SHR_CHIPS,
  srrrIeBytes, uwbPpduNs, uwbRespBytes, uwbSp3Chips, uwbSp3Ns,
} from '../../src/uwb/phy'

describe('an SP3 marker is SHR + STS and nothing else — no PHR, no PSDU', () => {
  it('uwbSp3Chips is exactly UWB_SHR_CHIPS + UWB_STS_CHIPS', () => {
    expect(uwbSp3Chips()).toBe(UWB_SHR_CHIPS + UWB_STS_CHIPS)
  })

  it('is shorter than the shortest SP1 frame by about 40 µs — the PHR plus the minimum PSDU', () => {
    // The shortest SP1 frame on the air: a DS-TWR Response, which never carries a reply time
    // (DS defers both two-way times to the Final/Report) — 14 octets, all MHR + RRMC + FCS.
    const shortestSp1Ns = uwbPpduNs(uwbRespBytes('ds'))
    const savedNs = shortestSp1Ns - uwbSp3Ns()
    expect(savedNs).toBeGreaterThan(0)
    // Pinned to the number task 1's report quotes, so a retune of the PHY constants moves this
    // test rather than silently drifting away from what the report claims.
    expect(savedNs).toBe(40256)
    expect(savedNs / 1000).toBeCloseTo(40.256, 3)
  })
})

describe('makeSp3 carries no information unit at all', () => {
  it('has an empty ies list and no field that could carry identity or a time', () => {
    const f = makeSp3('a', 't', 'ss', 1, 0, 3)
    expect(f.kind).toBe('uwbSp3')
    // No PSDU at all: the frame has no byte length and no data rate, exactly like a 4ab fragment.
    expect(f.bytes).toBe(0)
    expect(f.mbps).toBe(0)
    expect(f.txTimeNs).toBe(uwbSp3Ns())
    // The whole of uwb.*: sp, method, block/round/slot (the engine's own bookkeeping, never sent
    // on the air) and an empty ies list — nothing from any other optional field (schedule,
    // replyRctu, finalTimes, reportTimes, dl, m2m, mms, nb, sp0, mmrc) rides along.
    expect(f.uwb).toEqual({ sp: 3, method: 'ss', block: 1, round: 0, slot: 3, ies: [] })
  })

  it('decodes to zero payload bytes, not a crash and not a hidden field', () => {
    const f = makeSp3('a', 't', 'ds', 2, 1, 5)
    const decoded = uwbFrameFields(f)
    expect(decoded.bytes).toBe(0)
    expect(decoded.users[0].subframes[0].mpdu.fields).toEqual([])
  })

  it('identity comes from the slot, not from the frame: two markers in two slots are byte-identical', () => {
    const a = makeSp3('anchor-1', 't', 'ss', 1, 0, 1)
    const b = makeSp3('anchor-2', 't', 'ss', 1, 0, 2)
    // Same shape, same size, same airtime — the only thing that differs is which slot each sits
    // in (`slotAction` reads that), never anything inside the frame itself.
    expect(a.bytes).toBe(b.bytes)
    expect(a.txTimeNs).toBe(b.txTimeNs)
    expect(a.uwb?.ies).toEqual(b.uwb?.ies)
  })
})

describe('SRRR_IE_BYTES and srrrIeBytes cost the RCM, exactly opposite of §10.36 MMRCR', () => {
  it('one SRRR IE is header 2 + one control octet = 3', () => {
    expect(SRRR_IE_BYTES).toBe(3)
  })

  it('makes the RCM longer by 3 per responder — a request is not free', () => {
    expect(srrrIeBytes(1)).toBe(SRRR_IE_BYTES)
    expect(srrrIeBytes(4) - srrrIeBytes(3)).toBe(3)
    expect(srrrIeBytes(0)).toBe(0)
  })
})

describe('there is no crossover: a whole SP3 grouped round costs more air time than an SP1 embedded round at every anchor count', () => {
  // Fix round 1 (controller correction, 2026-10-02): the first version of this test batched the
  // data report phase into one frame per round and found a crossover at A = 9. That was wrong
  // against the published text. §10.32.8.2's own description of Figure 10-242's measurement report
  // phase has Responder-1 and Responder-N *each separately* embed the requested reply time in an
  // RMI IE sent back to the initiator — one report frame per reporting device, not one frame for
  // the whole round. Under that accounting there is no crossover at all: every frame that carries
  // any payload pays the PHY's SHR + STS + PHR floor (~160 µs) before its first payload bit, so the
  // ~40 µs an SP3 marker saves can never buy back a whole extra frame. This is the very model this
  // task tried first and threw out as "the ruler must be wrong" — here the ruler was fine and the
  // batched-report model was the thing that needed throwing out instead; the published text settles
  // it in the standard's favour.
  //
  // "A whole round" is read here as the two phases that differ between the two shapes:
  //
  //   SP1 embedded SS-TWR: A Responses, each `uwbRespBytes('ss', 'embedded')` (carries its own
  //   reply time, RRTI IE included) — no report phase, because the time already rode the Response.
  //
  //   SP3 grouped: (A + 1) bare SP3 markers (the initiator's own plus one per responder,
  //   `uwbSp3Ns()` each) plus one report frame *per reporting responder* (standard §10.32.8.2,
  //   Figure 10-242) — exactly the deferred reply-time message this engine already built for
  //   SS-TWR (standard §10.29.6.3), `UWB_SS_DEFER_BYTES` (MHR + one RRTI IE + FCS): one device,
  //   one reply time, one frame. At A responders that is A such frames, each its own PPDU.
  //
  // Left out of both sides: the RCM/Poll phase (ARC + RDM + RRMC, `uwbPollBytes(A)`). Both rounds
  // need the exact same schedule announcement — the same anchors, the same slots — so it is the
  // same function of A on both sides and cancels out of the comparison exactly.
  const reportNs = uwbPpduNs(UWB_SS_DEFER_BYTES)
  const tSp1 = (anchors: number) => anchors * uwbPpduNs(uwbRespBytes('ss', 'embedded'))
  const tSp3 = (anchors: number) => (anchors + 1) * uwbSp3Ns() + anchors * reportNs

  it('SP3 costs more air time at every anchor count in a swept range, and the gap only widens', () => {
    let lastGap = -Infinity
    for (let anchors = 1; anchors <= 40; anchors++) {
      const gap = tSp3(anchors) - tSp1(anchors)
      expect(gap).toBeGreaterThan(0)
      expect(gap).toBeGreaterThan(lastGap)
      lastGap = gap
    }
  })

  it('the report phase eats several times the marker\'s own saving — the saving never buys the frame back', () => {
    // The same per-frame saving pinned above (40 256 ns): what one SP3 marker buys against the
    // shortest possible SP1 frame. One report frame (`UWB_SS_DEFER_BYTES`'s own airtime) costs
    // several times that much, which is the arithmetic behind "the saving never buys the frame
    // back" — computed here, not stated.
    const savedNs = uwbPpduNs(uwbRespBytes('ds')) - uwbSp3Ns()
    const multiple = reportNs / savedNs
    expect(multiple).toBeGreaterThan(1)
    expect(multiple).toBeCloseTo(4.578, 3)
  })
})
