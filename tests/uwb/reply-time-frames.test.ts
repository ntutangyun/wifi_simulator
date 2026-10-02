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
import { makeFinal, makePoll, makeResp, makeSsDefer, type UwbDlTimes } from '../../src/uwb/frames'
import {
  UWB_ANCHOR_SEARCH_CEILING, UWB_MAX_PSDU_BYTES, UWB_SLOT_GUARD_NS, UWB_SS_DEFER_BYTES, uwbFinalBytes,
  uwbLongestFrameBytes, uwbMaxAnchors, uwbPollBytes, uwbPpduNs, uwbRespBytes, uwbSlotFitNs,
} from '../../src/uwb/phy'
import { roundPlan } from '../../src/uwb/session'

const fieldsOf = (f: ReturnType<typeof makeResp>) => uwbFrameFields(f).users[0].subframes[0].mpdu.fields
const fieldSum = (f: ReturnType<typeof makeResp>) => fieldsOf(f).reduce((s, x) => s + x.bytes, 0)

describe('reply-time frame sizes (design §5)', () => {
  it('drops the reply time from a Response that does not carry one', () => {
    expect(uwbRespBytes('ss', 'embedded')).toBe(20)
    expect(uwbRespBytes('ss', 'fixed')).toBe(14)
    expect(uwbRespBytes('ss', 'deferred')).toBe(14)
    expect(uwbRespBytes('ds', 'embedded')).toBe(14) // today's value, unchanged
  })

  it('stops the deferred Final growing with the anchor count — at 14 + 2A, not empty', () => {
    // Ruling 1: a deferred Final still lists its responders (device.ts's finalListedMe reads this
    // very list to decide whether an anchor may report at all); it drops the 4-octet round-trip
    // time and the whole RRTI IE that time would need, so it grows by 2 octets per anchor, not 12.
    const at1 = uwbFinalBytes(1, 'deferred')
    expect(at1).toBe(16)
    for (const a of [5, 9]) expect(uwbFinalBytes(a, 'deferred')).toBe(14 + 2 * a)
    expect(uwbFinalBytes(9, 'embedded')).toBe(122) // today's value, unchanged
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
    // Final is 26 octets and the Poll is 30 — the old code under-sized that slot's PPDU budget by
    // four octets of airtime, silently, for every DS-TWR-embedded round of exactly one anchor.
    expect(uwbPollBytes(1)).toBe(30)
    expect(uwbFinalBytes(1, 'embedded')).toBe(26)
    expect(uwbLongestFrameBytes(1, 'twr', 'time', 'ds', 'embedded')).toBe(30)
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
    // Neither the contention Poll (a flat 31 octets — RCPS + RCMA stand in for the RDM anchor
    // list) nor the SS Response grows with the anchor count, so nothing about the PSDU bounds a
    // contention round either — exactly the UL-TDoA situation, and it needs the same answer for
    // the same reason. What actually bounds a contention round is collision probability and
    // `contentionSlots`, neither of which is a frame length, so returning the search ceiling
    // (rather than the byte limit standing in for an anchor count) is the honest answer.
    expect(uwbLongestFrameBytes(1, 'twr', 'contention')).toBe(31)
    expect(uwbLongestFrameBytes(UWB_ANCHOR_SEARCH_CEILING, 'twr', 'contention')).toBe(31)
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
    for (const [method, replyTime] of [
      ['ss', 'embedded'], ['ss', 'deferred'], ['ss', 'fixed'], ['ds', 'deferred'],
    ] as const) {
      expect(
        uwbLongestFrameBytes(A, 'twr', 'time', method, replyTime), `${method}/${replyTime}`,
      ).toBe(uwbPollBytes(A))
    }
    // …and the slot demand follows that frame, term for term, rather than one chosen frame.
    expect(uwbSlotFitNs(A, 'twr', 'time', undefined, 'ds', 'embedded'))
      .toBe(uwbPpduNs(uwbFinalBytes(A)) + UWB_SLOT_GUARD_NS)
    expect(uwbSlotFitNs(A, 'twr', 'time', undefined, 'ss', 'embedded'))
      .toBe(uwbPpduNs(uwbPollBytes(A)) + UWB_SLOT_GUARD_NS)
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
        .toBe(uwbPpduNs(uwbLongestFrameBytes(A, 'twr', 'contention')) + UWB_SLOT_GUARD_NS)
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
    expect(r.bytes).toBe(20)
  })

  it('the deferred reply-time message carries the reply time and nothing else', () => {
    const d = makeSsDefer('a1', 'tag', 127_803, 0, 0, 2)
    expect(d.uwb!.ies).toEqual(['RRTI'])
    expect(d.uwb!.replyRctu).toBe(127_803)
    expect(d.bytes).toBe(UWB_SS_DEFER_BYTES)
    expect(d.bytes).toBe(17)
    expect(fieldSum(d)).toBe(d.bytes) // MHR + RRTI IE + FCS tiles the frame exactly
  })

  it('a deferred Final keeps the responder list and drops the round trip entirely', () => {
    const times = [
      { id: 'a1', tround1: 1_000, treply2: 2_000 },
      { id: 'a2', tround1: 1_100, treply2: 2_100 },
    ]
    const f = makeFinal('tag', times, 0, 0, 5, undefined, 'deferred')
    expect(f.bytes).toBe(uwbFinalBytes(2, 'deferred'))
    expect(f.bytes).toBe(18)
    expect(f.uwb!.ies).toEqual(['RMI']) // no RRTI IE at all — there is no time left to carry
    expect(f.uwb!.finalTimes).toEqual([{ id: 'a1' }, { id: 'a2' }])
    expect(fieldSum(f)).toBe(f.bytes)
    const ieKeys = fieldsOf(f).filter((x) => x.key.startsWith('ie')).map((x) => x.key)
    expect(ieKeys).toEqual(['ieRmi'])
    const rmiValue = fieldsOf(f).find((x) => x.key === 'ieRmi')!.value
    expect(rmiValue).toContain('a1')
    expect(rmiValue).toContain('a2')
  })

  it('an embedded Final is unaffected: the default keeps tround1/treply2 and both IEs', () => {
    const times = [{ id: 'a1', tround1: 1_000, treply2: 2_000 }]
    const f = makeFinal('tag', times, 0, 0, 5)
    expect(f.bytes).toBe(uwbFinalBytes(1, 'embedded'))
    expect(f.bytes).toBe(26)
    expect(f.uwb!.ies).toEqual(['RMI', 'RRTI'])
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

describe('device.ts guards a deferred Final it cannot build yet (fix round 1, item 1)', () => {
  /** A single anchor device, wired to a channel and clock but never scheduled through it: enough
   * for a private handler to run against real `RoundState`, following the same construction
   * `tests/uwb/network.test.ts`'s "UwbDevice.beginRound" group uses for the same reason. */
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

  type FinalFrame = ReturnType<typeof makeFinal>

  /** `onFinal` is private; this is the same "reach past the type" shape
   * `tests/uwb/sensing.test.ts` already uses on this class, scoped to exactly the one method under
   * test rather than casting the whole device to `any`. */
  const callOnFinal = (dev: UwbDevice, r: RoundState, from: string, frame: FinalFrame, counter: number, fom: number): void => {
    (dev as unknown as {
      onFinal: (r: RoundState, from: string, frame: FinalFrame, counter: number, fom: number) => void
    }).onFinal(r, from, frame, counter, fom)
  }

  it('a deferred Final (per-anchor times absent) produces no UWB_RANGE and no NaN anywhere', () => {
    const records: TLRecord[] = []
    const anchor = anchorDevice(records)
    const plan = roundPlan(DEFAULT_UWB_SESSION, 1) // ds, time-scheduled, one anchor
    anchor.beginRound(0, 0, plan, 'tag-1', ['anc-1'], {})
    const r = anchor.round!
    r.rxPollCounter = 1_000
    r.txRespCounter = 2_000
    // Exactly the shape frames.ts's makeFinal builds for replyTime: 'deferred' — the anchor is
    // listed (an id), but tround1/treply2 are absent, not zero. No session built through
    // device.ts produces this today (Task 4 wires `replyTime` into a device's own round), so this
    // reaches past the type the same way the fix does: the field really is missing at runtime,
    // which a `!` assertion cannot see and a real caller eventually will hand it.
    const deferredFinal = makeFinal('tag-1', [{ id: 'anc-1', tround1: 0, treply2: 0 }], 0, 0, plan.slots - 2, undefined, 'deferred')
    callOnFinal(anchor, r, 'tag-1', deferredFinal, 3_000, 0x16)
    // Design §7: a deferred Final gives the anchor no range at all — that is the correct
    // behaviour, not a failure — but the anchor is still listed, so it may still report later
    // (transmitFor's uwbReport case reads exactly this flag).
    expect(r.finalListedMe).toBe(true)
    expect(records.some((x) => x.type === 'UWB_RANGE')).toBe(false)
    // Before the fix, `dsTwr(undefined, …, undefined)` returns NaN without throwing (arithmetic on
    // `undefined` is NaN, not an exception), and `reportRange` banks it as a UWB_RANGE record with
    // no error anywhere — so this loop is what actually catches the bug, not just the count above.
    for (const rec of records) {
      for (const [k, v] of Object.entries(rec)) {
        if (typeof v === 'number') expect(Number.isNaN(v), `${rec.type}.${k}`).toBe(false)
      }
    }
  })
})
