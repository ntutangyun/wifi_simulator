/**
 * Task 1 of docs/superpowers/specs/2026-09-29-reply-time-design.md: the pure frame layer for the
 * three ranging procedures this simulator did not model — SS-TWR deferred and fixed reply time
 * (standard §10.29.6.3 / .5) and DS-TWR deferred time information (§10.29.6.6) — plus the
 * anchor-count cap those frame sizes imply (§5). No device or schema wiring lands here: this pins
 * frame content, frame sizes, and the law the cap is derived from.
 */
import { describe, it, expect } from 'vitest'
import { EventQueue } from '../../src/engine/events'
import { Rng } from '../../src/engine/rng'
import { makeEmitter, type TLRecord } from '../../src/model/records'
import { DEFAULT_UWB_SESSION, type NodeCfg } from '../../src/model/scenario'
import { UwbChannel } from '../../src/uwb/channel'
import { UwbClock } from '../../src/uwb/clock'
import { UwbDevice, type RoundState } from '../../src/uwb/device'
import { uwbFrameFields } from '../../src/uwb/frameFields'
import {
  makeDsDeferredReport, makeFinal, makePoll, makeResp, makeSsDefer, type UwbDlTimes,
} from '../../src/uwb/frames'
import {
  UWB_ANCHOR_SEARCH_CEILING, UWB_MAX_PSDU_BYTES, UWB_SLOT_GUARD_NS, UWB_SS_DEFER_BYTES, UWB_TURNAROUND_NS, uwbDsDeferredReportBytes,
  uwbFinalBytes,
  uwbLongestFrameBytes, uwbMaxAnchors, uwbPollBytes, uwbPpduNs, uwbRespBytes, uwbSlotFitNs,
} from '../../src/uwb/phy'
import { roundPlan } from '../../src/uwb/session'

const fieldsOf = (f: ReturnType<typeof makeResp>) => uwbFrameFields(f).users[0].subframes[0].mpdu.fields
const fieldSum = (f: ReturnType<typeof makeResp>) => fieldsOf(f).reduce((s, x) => s + x.bytes, 0)

describe('reply-time frame sizes (design §5)', () => {
  it('drops the reply time from a Response that does not carry one', () => {
    // 2026-11-10: the RRTI IE has a 1-octet content header (standard §10.29.8.1, Figure 10-208).
    expect(uwbRespBytes('ss', 'embedded')).toBe(21)
    expect(uwbRespBytes('ss', 'fixed')).toBe(14)
    expect(uwbRespBytes('ss', 'deferred')).toBe(14)
    // 2026-11-11 (W2b): an embedded DS Response carries Treply1 in its RRTI IE (§10.32.5, Figure
    // 10-238); a deferred one carries none (Figures 10-206, 10-237).
    expect(uwbRespBytes('ds', 'embedded')).toBe(21)
    expect(uwbRespBytes('ds', 'deferred')).toBe(14)
  })

  // 2026-11-10 (audit #3): the deferred Final is a bare ranging frame — `{Ranging}` in standard
  // §10.32.5 Figure 10-237, no IE at all — and its two times follow in the initiator's deferred
  // report, one RMI IE of 4 + 10N (§10.29.6.6). The old address-only RMI list broke §10.29.8.4's
  // "At least one measurement shall be present".
  it('makes the deferred Final bare (MHR + FCS) and moves its times into a 15 + 10A deferred report', () => {
    for (const a of [1, 5, 9]) {
      expect(uwbFinalBytes(a, 'deferred')).toBe(11)
      expect(uwbDsDeferredReportBytes(a)).toBe(15 + 10 * a)
    }
    // Embedded: one RMI IE (4 + 6A) and one RRTI IE listing every responder (3 + 6A).
    expect(uwbFinalBytes(9, 'embedded')).toBe(18 + 12 * 9)
  })
})

describe('the anchor cap is derived, not written down (design §5, Ruling 3)', () => {
  it('DS-TWR embedded keeps the old cap: its Final is still what binds the round', () => {
    const cap = uwbMaxAnchors('twr', 'ds', 'embedded', 'time')
    expect(cap).toBe(9)
    expect(uwbLongestFrameBytes(cap, 'twr', 'time', 'ds', 'embedded')).toBeLessThanOrEqual(UWB_MAX_PSDU_BYTES)
    expect(uwbLongestFrameBytes(cap + 1, 'twr', 'time', 'ds', 'embedded')).toBeGreaterThan(UWB_MAX_PSDU_BYTES)
  })

  it('pins the Poll/Final fix at one anchor: the Poll, not the Final, is the round\'s longest frame', () => {
    // Fix-round-1 finding: the old code took uwbFinalBytes(anchors) unconditionally for a
    // time-scheduled two-way round, even though the contention branch two lines below it already
    // knew a one-anchor Poll can outgrow the frame that ends the round. At one anchor the embedded
    // Final is 26 octets and the Poll is 33 (30 before 2026-11-10, when the RCM's ARC IE took the
    // standard's content and the RR IE joined it — audit #9) — the old code under-sized that slot's
    // PPDU budget, silently, for every DS-TWR-embedded round of exactly one anchor.
    expect(uwbPollBytes(1)).toBe(33)
    // 2026-11-10: 18 + 12 at one anchor (RMI and RRTI content headers, §10.29.8.4/§10.29.8.1).
    expect(uwbFinalBytes(1, 'embedded')).toBe(30)
    expect(uwbLongestFrameBytes(1, 'twr', 'time', 'ds', 'embedded')).toBe(33)
  })

  it('DS-TWR deferred and all three SS-TWR shapes clear the old cap: none has a Final that binds it', () => {
    const combos = [
      ['ds', 'deferred'], ['ss', 'embedded'], ['ss', 'deferred'], ['ss', 'fixed'],
    ] as const
    for (const [method, replyTime] of combos) {
      const cap = uwbMaxAnchors('twr', method, replyTime, 'time')
      expect(cap, `${method}/${replyTime}`).toBeGreaterThan(9)
      // Pinned by the law itself — uwbLongestFrameBytes(cap) ≤ 127 < uwbLongestFrameBytes(cap+1) —
      // not by a second copy of whatever number the search happens to return.
      expect(
        uwbLongestFrameBytes(cap, 'twr', 'time', method, replyTime), `${method}/${replyTime} at cap`,
      ).toBeLessThanOrEqual(UWB_MAX_PSDU_BYTES)
      expect(
        uwbLongestFrameBytes(cap + 1, 'twr', 'time', method, replyTime), `${method}/${replyTime} at cap+1`,
      ).toBeGreaterThan(UWB_MAX_PSDU_BYTES)
    }
  })

  it('gives DL-TDoA its own computed cap, and UL-TDoA the shared ceiling — neither is the old 9', () => {
    const dlCap = uwbMaxAnchors('dl-tdoa', 'ds', 'embedded', 'time')
    expect(dlCap).toBeGreaterThan(9)
    expect(uwbLongestFrameBytes(dlCap, 'dl-tdoa')).toBeLessThanOrEqual(UWB_MAX_PSDU_BYTES)
    expect(uwbLongestFrameBytes(dlCap + 1, 'dl-tdoa')).toBeGreaterThan(UWB_MAX_PSDU_BYTES)
    // UL-TDoA's only frame (the blink) never grows with the anchor count, so nothing about the
    // PSDU stops the search: it runs to the shared ceiling and returns that instead of a law.
    expect(uwbMaxAnchors('ul-tdoa', 'ds', 'embedded', 'time')).toBe(UWB_ANCHOR_SEARCH_CEILING)
  })

  it('gives a contention round the same ceiling, not the PSDU limit as an anchor count (fix round 1)', () => {
    // Neither the contention Poll (a flat 35 octets since 2026-11-10 — RCPS + RCMA stand in for the RDM anchor
    // list) nor the SS Response grows with the anchor count, so nothing about the PSDU bounds a
    // contention round either — exactly the UL-TDoA situation, and it needs the same answer for
    // the same reason. What actually bounds a contention round is collision probability and
    // `contentionSlots`, neither of which is a frame length, so returning the search ceiling
    // (rather than the byte limit standing in for an anchor count) is the honest answer.
    expect(uwbLongestFrameBytes(1, 'twr', 'contention')).toBe(35)
    expect(uwbLongestFrameBytes(UWB_ANCHOR_SEARCH_CEILING, 'twr', 'contention')).toBe(35)
    expect(uwbMaxAnchors('twr', 'ss', 'embedded', 'contention')).toBe(UWB_ANCHOR_SEARCH_CEILING)
    expect(uwbMaxAnchors('twr', 'ss', 'fixed', 'contention')).toBe(UWB_ANCHOR_SEARCH_CEILING)
  })
})

/**
 * Fix round 1 of Task 4. `uwbMaxAnchors` was derived from the round's own shape by this slice;
 * `uwbSlotFitNs` — the same law, measured in nanoseconds of slot instead of octets of PSDU — was
 * left sizing every two-way slot by the embedded DS-TWR Final. Both read `uwbLongestFrameBytes`,
 * so fixing one and leaving its twin was the inconsistency, not the fix (design §5, Ruling 3).
 */
describe('the slot-fit rule is derived from the round\'s own shape too (design §5, fix round 1)', () => {
  /** The anchor count the DS-embedded cap sits at, which is where the two shapes are furthest
   * apart — and the largest count any scene in this repository configures. */
  const A = uwbMaxAnchors('twr', 'ds', 'embedded', 'time')

  it('sizes an SS round by its Poll, not by the Final that round never sends', () => {
    // At nine anchors the embedded DS Final is 122 octets. Every other shape's longest frame is
    // the Poll — 54 octets — because an SS round has no Final at all and a deferred DS Final grows
    // 2 octets an anchor instead of 12.
    expect(uwbLongestFrameBytes(A, 'twr', 'time', 'ds', 'embedded')).toBe(uwbFinalBytes(A))
    // 2026-11-10: a deferred DS round's growing frame is the initiator's deferred report (15 + 10A,
    // standard §10.29.6.6), not the bare Final.
    expect(uwbLongestFrameBytes(A, 'twr', 'time', 'ds', 'deferred')).toBe(uwbDsDeferredReportBytes(A))
    for (const [method, replyTime] of [
      ['ss', 'embedded'], ['ss', 'deferred'], ['ss', 'fixed'],
    ] as const) {
      expect(
        uwbLongestFrameBytes(A, 'twr', 'time', method, replyTime), `${method}/${replyTime}`,
      ).toBe(uwbPollBytes(A))
    }
    // …and the slot demand follows that frame, term for term, rather than one chosen frame.
    expect(uwbSlotFitNs(A, 'twr', 'time', undefined, 'ds', 'embedded'))
      .toBe(uwbPpduNs(uwbFinalBytes(A)) + UWB_SLOT_GUARD_NS + UWB_TURNAROUND_NS)
    expect(uwbSlotFitNs(A, 'twr', 'time', undefined, 'ss', 'embedded'))
      .toBe(uwbPpduNs(uwbPollBytes(A)) + UWB_SLOT_GUARD_NS + UWB_TURNAROUND_NS)
  })

  it('measures the inaccuracy it removes: a third of the slot, asked of every SS round', () => {
    const dsNs = uwbSlotFitNs(A, 'twr', 'time', undefined, 'ds', 'embedded')
    const ssNs = uwbSlotFitNs(A, 'twr', 'time', undefined, 'ss', 'embedded')
    // Derived from the two frames, not written down: 68 octets of PPDU that an SS round's slot was
    // being asked to hold for a frame it does not contain.
    expect(dsNs - ssNs).toBe(uwbPpduNs(uwbFinalBytes(A)) - uwbPpduNs(uwbPollBytes(A)))
    expect(ssNs / dsNs).toBeLessThan(0.8)
  })

  it('defaults to the embedded DS round, so a caller that passes neither is unchanged', () => {
    // The two new parameters are the last two, and default to the largest shape — which is exactly
    // the frame this function measured before they existed. Every call site that has not been
    // threaded gets the number it always got, conservatively rather than silently differently.
    for (const a of [1, 5, A]) {
      expect(uwbSlotFitNs(a), `anchors ${a}`).toBe(uwbSlotFitNs(a, 'twr', 'time', undefined, 'ds', 'embedded'))
    }
    // A contention round is SS-TWR and ends at the Response, so its reply-time shape moves nothing
    // here either: the flat 31-octet Poll beats both the 20- and the 14-octet Response.
    for (const replyTime of ['embedded', 'fixed'] as const) {
      expect(uwbSlotFitNs(A, 'twr', 'contention', undefined, 'ss', replyTime))
        .toBe(uwbPpduNs(uwbLongestFrameBytes(A, 'twr', 'contention')) + UWB_SLOT_GUARD_NS + UWB_TURNAROUND_NS)
    }
  })
})

describe('makeResp / makeFinal / makeSsDefer carry the shapes above onto the wire', () => {
  it('a deferred Response carries no replyRctu key at all', () => {
    const r = makeResp('a1', 'tag', 'ss', 0, 0, 1, 999_000, undefined, 'deferred')
    expect('replyRctu' in r.uwb!).toBe(false)
    expect(r.uwb!.ies).toEqual(['RRMC'])
    expect(r.bytes).toBe(14)
  })

  it('a fixed Response also carries no replyRctu key, at the same 14 octets as deferred', () => {
    const r = makeResp('a1', 'tag', 'ss', 0, 0, 1, undefined, undefined, 'fixed')
    expect('replyRctu' in r.uwb!).toBe(false)
    expect(r.bytes).toBe(14)
  })

  it('an embedded SS Response is unaffected: the default keeps RRTI', () => {
    const r = makeResp('a1', 'tag', 'ss', 0, 0, 1, 127_803)
    expect(r.uwb!.replyRctu).toBe(127_803)
    expect(r.uwb!.ies).toEqual(['RRMC', 'RRTI'])
    expect(r.bytes).toBe(21) // 2026-11-10: RRTI 2 + 1 + 4 (§10.29.8.1)
    expect(fieldSum(r)).toBe(r.bytes)
  })

  // 2026-11-10 (audit #4): standard §10.29.6.3 — "This reply time is communicated to the initiating
  // side in the RMI IE ... carried by a subsequent message", not an RRTI IE. Unicast, so one list
  // element without an address: 2 + 2 + 4.
  it('the deferred reply-time message carries the reply time in an RMI IE and nothing else', () => {
    const d = makeSsDefer('a1', 'tag', 127_803, 0, 0, 2)
    expect(d.uwb!.ies).toEqual(['RMI'])
    expect(d.uwb!.replyRctu).toBe(127_803)
    expect(d.bytes).toBe(UWB_SS_DEFER_BYTES)
    expect(d.bytes).toBe(19)
    expect(fieldSum(d)).toBe(d.bytes) // MHR + RMI IE + FCS tiles the frame exactly
  })

  // 2026-11-10 (audit #3): standard §10.32.5 Figure 10-237 — the deferred Final is `{Ranging}`, no IE.
  it('a deferred Final carries no IE at all; the deferred report carries both times per responder', () => {
    const times = [
      { id: 'a1', tround1: 1_000, treply2: 2_000 },
      { id: 'a2', tround1: 1_100, treply2: 2_100 },
    ]
    const f = makeFinal('tag', times, 0, 0, 5, undefined, 'deferred')
    expect(f.bytes).toBe(uwbFinalBytes(2, 'deferred'))
    expect(f.bytes).toBe(11)
    expect(f.uwb!.ies).toEqual([])
    expect(f.uwb!.finalTimes).toBeUndefined()
    expect(fieldSum(f)).toBe(f.bytes)
    // …and the initiator's deferred report (§10.29.6.6): one RMI IE, reply time + round trip +
    // address per responder.
    const rep = makeDsDeferredReport('tag', times, 0, 0, 6)
    expect(rep.kind).toBe('uwbReport')
    expect(rep.bytes).toBe(15 + 10 * 2)
    expect(rep.uwb!.ies).toEqual(['RMI'])
    expect(rep.uwb!.finalTimes).toEqual(times)
    expect(fieldSum(rep)).toBe(rep.bytes)
    const rmiValue = fieldsOf(rep).find((x) => x.key === 'ieRmi')!.value
    expect(rmiValue).toContain('a1')
    expect(rmiValue).toContain('a2')
  })

  it('an embedded Final is unaffected: the default keeps tround1/treply2 and both IEs', () => {
    const times = [{ id: 'a1', tround1: 1_000, treply2: 2_000 }]
    const f = makeFinal('tag', times, 0, 0, 5)
    expect(f.bytes).toBe(uwbFinalBytes(1, 'embedded'))
    expect(f.bytes).toBe(30) // 2026-11-10: 9 + (4 + 6) + (3 + 6) + 2
    expect(f.uwb!.ies).toEqual(['RMI', 'RRTI'])
    expect(fieldSum(f)).toBe(f.bytes)
    expect(f.uwb!.finalTimes).toEqual(times)
  })

  it('leaves every DL-TDoA frame byte-identical: the trailing replyTime never reaches the dl branch', () => {
    const pollDl: UwbDlTimes = { txCounter: 1_000_000, rxCounters: {} }
    const respDl: UwbDlTimes = { txCounter: 1_200_000, rxCounters: { 'anc-0': 1_100_000 }, coffs: 1.5e-6 }
    const finalDl: UwbDlTimes = { txCounter: 1_900_000, rxCounters: { 'anc-1': 1_300_000, 'anc-2': 1_500_000 } }

    const poll = makePoll('anc-0', ['anc-1', 'anc-2'], 'ds', 0, 0, { dl: pollDl })
    const respBefore = makeResp('anc-1', '*', 'ds', 0, 0, 1, undefined, respDl)
    const respAfter = makeResp('anc-1', '*', 'ds', 0, 0, 1, undefined, respDl, 'deferred')
    const finalBefore = makeFinal('anc-0', [], 0, 0, 3, finalDl)
    const finalAfter = makeFinal('anc-0', [], 0, 0, 3, finalDl, 'deferred')

    expect(respAfter).toEqual(respBefore)
    expect(finalAfter).toEqual(finalBefore)
    // makePoll's own signature never grew a replyTime argument at all, so there is nothing to
    // pin about it here beyond the frame decoding cleanly — a `poll.uwb!.dl` equality check would
    // pass whether or not anything else in this diff were correct.
    for (const f of [poll, respBefore, finalBefore]) expect(fieldSum(f)).toBe(f.bytes)
  })
})

describe('deferred DS-TWR at the anchor: the range comes from the initiator deferred report (2026-11-10)', () => {
  /** A single anchor device, wired to a channel and clock but never scheduled through it: enough
   * for a private handler to run against real `RoundState`. */
  const anchorDevice = (records: TLRecord[]): UwbDevice => {
    const q = new EventQueue()
    const now = (): number => 0
    const emit = makeEmitter((r) => records.push(r))
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

  type Frame = ReturnType<typeof makeFinal>
  /** The two private handlers under test, reached past the type for exactly these two methods. */
  const priv = (dev: UwbDevice) => dev as unknown as {
    onFinal: (r: RoundState, from: string, frame: Frame, counter: number, fom: number) => void
    onDsDeferredReport: (r: RoundState, from: string, frame: Frame) => void
  }

  const setUp = (records: TLRecord[]): { anchor: UwbDevice; r: RoundState } => {
    const anchor = anchorDevice(records)
    const plan = roundPlan({ ...DEFAULT_UWB_SESSION, replyTime: 'deferred' }, 1)
    anchor.beginRound(0, 0, plan, 'tag-1', ['anc-1'], {})
    const r = anchor.round!
    r.rxPollCounter = 1_000
    r.txRespCounter = 2_000
    priv(anchor).onFinal(r, 'tag-1', makeFinal('tag-1', [], 0, 0, 2, undefined, 'deferred'), 3_000, 0x16)
    return { anchor, r }
  }

  // Standard §10.29.6.6: "When the responder receives the second MCPS-DATA.indication primitive
  // (with the RMI IE), it has sufficient information to calculate the TOF".
  it('a bare deferred Final gives no range; the deferred report brings tround1 and treply2 and the anchor ranges', () => {
    const records: TLRecord[] = []
    const { anchor, r } = setUp(records)
    expect(r.finalListedMe).toBe(false)
    expect(records.some((x) => x.type === 'UWB_RANGE')).toBe(false)
    const report = makeDsDeferredReport('tag-1', [{ id: 'anc-1', tround1: 1_000, treply2: 1_000 }], 0, 0, 3)
    priv(anchor).onDsDeferredReport(r, 'tag-1', report)
    expect(r.finalListedMe).toBe(true)
    expect(records.filter((x) => x.type === 'UWB_RANGE')).toHaveLength(1)
    for (const rec of records) {
      for (const [k, v] of Object.entries(rec)) {
        if (typeof v === 'number') expect(Number.isNaN(v), `${rec.type}.${k}`).toBe(false)
      }
    }
  })

  it('a deferred report that does not list this anchor leaves it unlisted and rangeless', () => {
    const records: TLRecord[] = []
    const { anchor, r } = setUp(records)
    priv(anchor).onDsDeferredReport(
      r, 'tag-1', makeDsDeferredReport('tag-1', [{ id: 'anc-9', tround1: 1, treply2: 1 }], 0, 0, 3),
    )
    expect(r.finalListedMe).toBe(false)
    expect(records.some((x) => x.type === 'UWB_RANGE')).toBe(false)
  })
})
