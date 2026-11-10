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
import { EventQueue } from '../../src/engine/events'
import { Rng } from '../../src/engine/rng'
import { makeEmitter } from '../../src/model/records'
import { DEFAULT_UWB_SESSION, type NodeCfg } from '../../src/model/scenario'
import { UwbChannel } from '../../src/uwb/channel'
import { UwbClock } from '../../src/uwb/clock'
import { UwbDevice } from '../../src/uwb/device'
import { sp3ReplyTimeRequested, sp3ReportBearing } from '../../src/uwb/device.sp3'
import { makePoll, makeSp3 } from '../../src/uwb/frames'
import { roundPlan } from '../../src/uwb/session'
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
    // 2026-11-10: 42 051 ns — the PHR is 21 symbols (standard Table 16-2), 896 chips more than the
    // old 19, and every SP1 frame carries it while an SP3 marker does not.
    expect(savedNs).toBe(42051)
    expect(savedNs / 1000).toBeCloseTo(42.051, 3)
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
  // 2026-11-10 (audit #14): standard §10.32.9.9, Figure 10-255 — one SRRR IE names one
  // requester–provider pair. The requester (the initiator, which is the controller) may be omitted,
  // the provider's 2-octet short address may not: header 2 + control 1 + provider address 2.
  it('one SRRR IE is header 2 + one control octet + the provider short address = 5', () => {
    expect(SRRR_IE_BYTES).toBe(5)
  })

  it('makes the RCM longer by 5 per responder — a request is not free', () => {
    expect(srrrIeBytes(1)).toBe(SRRR_IE_BYTES)
    expect(srrrIeBytes(4) - srrrIeBytes(3)).toBe(5)
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
    // 2026-11-10: the report is now an RMI IE (§10.29.6.3), 19 octets, and the PHR is 21 symbols.
    expect(multiple).toBeCloseTo(4.474, 3)
  })
})

/**
 * 2026-11-10 (W2): a responder acts on the IEs of the RCM it actually decoded, not on the session
 * config. Pinned at the device: the RCM is handed to `holdRcm` exactly as a reception would, and what
 * the responder then holds — and therefore does — is read back.
 */
describe('a responder acts on the RCM it decoded (standard §10.32.9.1, §10.32.9.5/.6, §10.32.9.9)', () => {
  const anchor = (): UwbDevice => {
    const q = new EventQueue()
    const now = (): number => 0
    const emit = makeEmitter(() => undefined)
    const nodes: NodeCfg[] = [{
      id: 'anc-1', kind: 'uwb', name: 'anc-1', pos: { x: 1, y: 0, z: 1 }, txPowerDbm: -14,
      profiles: ['idle'], caps: { generation: 'nonht', features: {} }, uwb: { role: 'anchor' },
    }]
    const ch = new UwbChannel(q, now, nodes, [], { channel: 9, nlos: false }, () => 0, emit)
    return new UwbDevice(
      'anc-1',
      {
        role: 'anchor', pos: { x: 1, y: 0, z: 1 }, tsNoisePs: 100, cfoNoisePpm: 0.2, maxAttempts: 3, rmnr: false,
        tdoaClockCorrection: true, syncOffsetNs: 0, syncErrorNs: 0, aoa: false, yawDeg: 0, channel: 9,
      },
      new UwbClock(0, 0), new Rng(1), q, now, ch, emit,
      { trueDistM: () => 1, anchorPos: (id) => ({ id, x: 0, y: 0, z: 1 }) },
    )
  }
  const sp3Session = { ...DEFAULT_UWB_SESSION, method: 'ss' as const, replyTime: 'deferred' as const, sp3: true }

  // §10.32.9.9: "The RRT field indicates that a report of reply time is required when the RRT field is
  // one, and not required when the RRT field is zero." The reply time goes back only on RRT.
  it('sends its reply time only when its own SRRR IE set RRT, and its bearing only on RAOA', () => {
    for (const rrt of [true, false]) {
      for (const raoa of [true, false]) {
        const dev = anchor()
        const plan = roundPlan(sp3Session, 2)
        dev.beginRound(0, 0, plan, 'tag-1', ['anc-1', 'anc-2'], {})
        const r = dev.round!
        r.aoaThetaDeg = 12.5
        const poll = makePoll('tag-1', ['anc-1', 'anc-2'], 'ss', 0, 0, {
          srrr: [
            { provider: 'anc-1', raoa, rrt, rrtt: false, rtof: false },
            { provider: 'anc-2', raoa: !raoa, rrt: !rrt, rrtt: false, rtof: false },
          ],
        })
        dev.holdRcm(r, poll)
        expect(sp3ReplyTimeRequested(dev, r), `rrt=${rrt}`).toBe(rrt)
        expect(sp3ReportBearing(dev, r), `raoa=${raoa}`).toBe(raoa ? 12.5 : undefined)
      }
    }
  })

  // §10.32.9.6: "Upon reception, the value shall be used as the maximum number of contention
  // attempts"; §10.32.9.5: the phase's slot indices come from the RCPS IE.
  it('holds the contention phase and attempt cap of the RCPS/RCMA it decoded, and the set its ARC IE gave', () => {
    const dev = anchor()
    const plan = roundPlan({ ...DEFAULT_UWB_SESSION, method: 'ss', schedule: 'contention' }, 2)
    dev.beginRound(3, 0, plan, 'tag-1', ['anc-1', 'anc-2'], {})
    const r = dev.round!
    const poll = makePoll('tag-1', ['anc-1', 'anc-2'], 'ss', 3, 0, {
      schedule: 'contention', contentionSlots: 5, maxAttempts: 1,
      arc: {
        multiNode: 1, roundUsage: 1, stsConfig: 1, scheduleMode: 0, deferred: 0, timeStructure: 1,
        validityRounds: 2, mmrcr: 1,
      },
    })
    dev.holdRcm(r, poll)
    const held = dev.heldRcmFor(r)!
    expect(held.contention).toEqual({ firstSlot: 1, lastSlot: 5, maxAttempts: 1 })
    expect(held.mmrcr).toBe(true)
    // RCM Validity Rounds 2: this round and the next, in this block only.
    expect(dev.heldRcm(3, 1, 'tag-1')).not.toBeNull()
    expect(dev.heldRcm(3, 2, 'tag-1')).toBeNull()
    expect(dev.heldRcm(4, 0, 'tag-1')).toBeNull()
  })
})
