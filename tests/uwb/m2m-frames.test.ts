/**
 * Task 1 of docs/superpowers/specs/2026-09-30-many-to-many-design.md: the pure frame layer for
 * many-to-many ranging (standard §10.32.6 SS / §10.32.7 DS) — the frame, its size, and the
 * participant cap that size implies. No schema, no schedule, no device lands here.
 */
import { describe, it, expect } from 'vitest'
import { uwbFrameFields } from '../../src/uwb/frameFields'
import { makeFinal, makeM2m, makePoll, makeResp, type UwbM2mTimes } from '../../src/uwb/frames'
import {
  DL_COFFS_IE_BYTES, TX_TIME_IE_BYTES, UWB_ANCHOR_SEARCH_CEILING, UWB_MAX_PSDU_BYTES, rxTimesIeBytes,
  uwbDlFinalBytes, uwbDlPollBytes, uwbDlRespBytes, uwbM2mBytes, uwbMaxParticipants,
} from '../../src/uwb/phy'

const fields = (f: ReturnType<typeof makeM2m>) => uwbFrameFields(f).users[0].subframes[0].mpdu.fields
const fieldSum = (f: ReturnType<typeof makeM2m>) => fields(f).reduce((s, x) => s + x.bytes, 0)
const keyed = (f: ReturnType<typeof makeM2m>, key: string) => fields(f).find((x) => x.key === key)

/** Participant i's payload: i arrival times, from whichever i participants sent before it. */
const rxCountersOf = (i: number): Record<string, number> =>
  Object.fromEntries(Array.from({ length: i }, (_, j) => [`p${j}`, 1_000_000 + j]))

describe('many-to-many frame content and size (design §4)', () => {
  it('grows by one ranging time per arrival it reports', () => {
    for (let k = 0; k <= 8; k++) {
      expect(uwbM2mBytes(k + 1) - uwbM2mBytes(k), `k=${k}`).toBe(4)
    }
  })

  it('never omits the RX-times IE, unlike DL-TDoA, so byte 0→1 costs the same 4 octets too', () => {
    // 9 (MHR) + 3 (RRMC) + 6 (TX time IE) + 2 (RX-times IE header, zero entries) + 2 (FCS).
    expect(uwbM2mBytes(0)).toBe(22)
    expect(uwbM2mBytes(1)).toBe(26)
  })

  it('makes the last participant the longest frame of the round', () => {
    const n = 6
    const frames = Array.from({ length: n }, (_, i) =>
      makeM2m(`p${i}`, 'ss', 0, 0, i, { txCounter: 1_000_000 + i, rxCounters: rxCountersOf(i) }))
    for (let i = 1; i < n; i++) {
      expect(frames[i].bytes, `frame ${i} vs ${i - 1}`).toBeGreaterThan(frames[i - 1].bytes)
    }
    const longest = Math.max(...frames.map((f) => f.bytes))
    expect(frames[n - 1].bytes).toBe(longest)
    expect(frames[n - 1].bytes).toBe(uwbM2mBytes(n - 1))
  })

  it('derives the participant cap from that frame, not from a literal', () => {
    for (const method of ['ss', 'ds'] as const) {
      const cap = uwbMaxParticipants(method)
      expect(cap, method).toBeGreaterThan(0)
      expect(cap, method).toBeLessThan(UWB_ANCHOR_SEARCH_CEILING)
      // Both sides of the boundary are pinned: the last participant of `cap` participants (which
      // carries cap-1 arrival times) still fits; one more participant would not.
      expect(uwbM2mBytes(cap - 1), method).toBeLessThanOrEqual(UWB_MAX_PSDU_BYTES)
      expect(uwbM2mBytes(cap), method).toBeGreaterThan(UWB_MAX_PSDU_BYTES)
    }
    // SS and DS share the cap: DS repeats the same per-slot frame shape a second time (design §3)
    // rather than sending a frame that carries both passes' times at once.
    expect(uwbMaxParticipants('ds')).toBe(uwbMaxParticipants('ss'))
    // The known boundary this file's arithmetic gives: 22 + 4k <= 127 solves to k <= 26, i.e. 27
    // participants (indices 0..26, the last carrying 26 arrival times) — the same 27 DL-TDoA's
    // structurally identical Final already caps at (uwb/phy.ts's uwbMaxAnchors comment).
    expect(uwbMaxParticipants('ss')).toBe(27)
  })

  it('carries the sender own transmit time and nothing about clock offset', () => {
    const times: UwbM2mTimes = { txCounter: 1_234_567, rxCounters: { p0: 1_000_000, p1: 1_100_000 } }
    const f = makeM2m('p2', 'ss', 0, 0, 2, times)
    // No `coffs` on the wire at all — that is measured on receive (design §4), like the existing
    // SS-TWR path's `onResponse` coffs argument, which comes from `UwbRxInfo`, never a frame.
    expect('coffs' in (f.uwb?.m2m ?? {})).toBe(false)
    expect(f.uwb?.ies).toEqual(['RRMC', 'TXT', 'RXT'])
    expect(f.uwb?.ies).not.toContain('COFF')
    expect(fieldSum(f)).toBe(f.bytes)
    expect(keyed(f, 'ieTxTime')).toBeTruthy()
    expect(keyed(f, 'ieRxTimes')).toBeTruthy()
    expect(keyed(f, 'ieCoffs')).toBeUndefined()
    expect(keyed(f, 'ieTxTime')!.bytes).toBe(TX_TIME_IE_BYTES)
    expect(keyed(f, 'ieRxTimes')!.bytes).toBe(rxTimesIeBytes(2))
    expect(f.bytes).toBe(uwbM2mBytes(2))
  })

  it('leaves every DL-TDoA frame byte-identical, field by field (the rename touched nothing)', () => {
    const dlPoll = makePoll('anc-0', ['anc-1', 'anc-2', 'anc-3'], 'ds', 0, 0, {
      dl: { txCounter: 1_000_000, rxCounters: {} },
    })
    const dlResp = makeResp('anc-1', '*', 'ds', 0, 0, 1, undefined, {
      txCounter: 1_200_000, rxCounters: { 'anc-0': 1_100_000 }, coffs: 1.5e-6,
    })
    const dlFinal = makeFinal('anc-0', [], 0, 0, 4, {
      txCounter: 1_900_000,
      rxCounters: { 'anc-1': 1_300_000, 'anc-2': 1_500_000, 'anc-3': 1_700_000 },
    })
    // Same three numbers as before the rename (tests/model/uwb-frameFields.test.ts).
    expect(dlPoll.bytes).toBe(uwbDlPollBytes(3))
    expect(dlPoll.bytes).toBe(42)
    expect(dlResp.bytes).toBe(uwbDlRespBytes())
    expect(dlResp.bytes).toBe(30)
    expect(dlFinal.bytes).toBe(uwbDlFinalBytes(3))
    expect(dlFinal.bytes).toBe(34)

    for (const f of [dlPoll, dlResp, dlFinal]) {
      expect(fieldSum(f), `${f.kind} ${f.bytes} B`).toBe(f.bytes)
    }
    // Same IE order as before: DL-TDoA still omits RXT when it carries no times (the Poll here
    // has none) and still carries COFF only on the Response.
    expect(dlPoll.uwb?.ies).toEqual(['ARC', 'RDM', 'RRMC', 'TXT'])
    expect(dlResp.uwb?.ies).toEqual(['RRMC', 'TXT', 'RXT', 'COFF'])
    expect(dlFinal.uwb?.ies).toEqual(['RRMC', 'TXT', 'RXT'])
    expect(keyed(dlPoll, 'ieTxTime')!.bytes).toBe(TX_TIME_IE_BYTES)
    expect(keyed(dlResp, 'ieRxTimes')!.bytes).toBe(rxTimesIeBytes(1))
    expect(keyed(dlResp, 'ieCoffs')!.bytes).toBe(DL_COFFS_IE_BYTES)
    expect(keyed(dlFinal, 'ieRxTimes')!.bytes).toBe(rxTimesIeBytes(3))
  })
})
