/**
 * Task 1 of docs/superpowers/specs/2026-09-29-reply-time-design.md: the pure frame layer for the
 * three ranging procedures this simulator did not model — SS-TWR deferred and fixed reply time
 * (standard §10.29.6.3 / .5) and DS-TWR deferred time information (§10.29.6.6) — plus the
 * anchor-count cap those frame sizes imply (§5). No device or schema wiring lands here: this pins
 * frame content, frame sizes, and the law the cap is derived from.
 */
import { describe, it, expect } from 'vitest'
import { uwbFrameFields } from '../../src/uwb/frameFields'
import { makeFinal, makePoll, makeResp, makeSsDefer, type UwbDlTimes } from '../../src/uwb/frames'
import {
  UWB_MAX_PSDU_BYTES, UWB_SS_DEFER_BYTES, UWB_UL_TDOA_ANCHOR_CEILING, uwbFinalBytes,
  uwbLongestFrameBytes, uwbMaxAnchors, uwbRespBytes,
} from '../../src/uwb/phy'

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

  it('gives DL-TDoA its own computed cap, and UL-TDoA a chosen ceiling — neither is the old 9', () => {
    const dlCap = uwbMaxAnchors('dl-tdoa', 'ds', 'embedded', 'time')
    expect(dlCap).toBeGreaterThan(9)
    expect(uwbLongestFrameBytes(dlCap, 'dl-tdoa')).toBeLessThanOrEqual(UWB_MAX_PSDU_BYTES)
    expect(uwbLongestFrameBytes(dlCap + 1, 'dl-tdoa')).toBeGreaterThan(UWB_MAX_PSDU_BYTES)
    // UL-TDoA's only frame (the blink) never grows with the anchor count, so nothing about the
    // PSDU stops the search: it runs to the chosen ceiling and returns that instead of a law.
    expect(uwbMaxAnchors('ul-tdoa', 'ds', 'embedded', 'time')).toBe(UWB_UL_TDOA_ANCHOR_CEILING)
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
    // The Poll's own signature never grew a replyTime argument at all — same call, sanity-checked
    // alongside the two that did, so all three DL-TDoA builders are pinned together.
    expect(poll.uwb!.dl).toEqual(pollDl)
    for (const f of [poll, respBefore, finalBefore]) expect(fieldSum(f)).toBe(f.bytes)
  })
})
