/**
 * Task 1 of docs/superpowers/specs/2026-10-01-rcm-validity-design.md: the pure frame layer for
 * the RCM validity window (standard §10.32.9.1 ARC IE, "RCM Validity Rounds") and the ranging
 * message non-receipt exchange it makes possible (standard §10.34). No schema, no schedule, no
 * device lands here — this pins frame content and frame sizes only.
 */
import { describe, it, expect } from 'vitest'
import {
  makeBlink, makeFinal, makeInit, makeM2m, makePoll, makeReport, makeResp, makeRmnr,
} from '../../src/uwb/frames'
import { uwbFrameFields } from '../../src/uwb/frameFields'
import {
  RMNR_IE_BYTES, UWB_BLINK_BYTES, UWB_IE_HDR_BYTES, UWB_REPORT_BYTES, uwbFinalBytes, uwbInitBytes,
  uwbM2mBytes, uwbPollBytes, uwbRespBytes, uwbRmnrBytes,
} from '../../src/uwb/phy'

const fieldsOf = (f: ReturnType<typeof makeResp>) => uwbFrameFields(f).users[0].subframes[0].mpdu.fields
const fieldSum = (f: ReturnType<typeof makeResp>) => fieldsOf(f).reduce((s, x) => s + x.bytes, 0)

describe('the initiation-only message cannot grow with the anchor count: it takes no such argument (design §2)', () => {
  it('is a flat 14 octets', () => {
    expect(uwbInitBytes()).toBe(14)
    expect(uwbPollBytes(4)).toBe(39) // today's value, unchanged
  })

  it('makeInit builds the 14-octet frame, carrying only RRMC, under its own kind', () => {
    const f = makeInit('tag', 'ss', 2, 1)
    // Fix round 1: this is not a lighter Poll. The standard's own figure (§10.34) draws the
    // control message and the ranging initiation message as two separate frames; this engine
    // fuses them in a validity window's first round only, so a later round's message is the one
    // of those two standard messages that remains — not a variant of the one that is gone. A
    // distinct kind says that; reusing 'uwbPoll' would hide it, the way a second use of 'uwbResp'
    // would have hidden the deferred reply-time message and the many-to-many frame earlier on
    // this branch.
    expect(f.kind).toBe('uwbInit')
    expect(f.bytes).toBe(14)
    expect(f.uwb!.ies).toEqual(['RRMC'])
    // No schedule field at all (Ruling 3): the responder's slot table comes from the still-valid
    // RCM, not from this message.
    expect(f.uwb!.schedule).toBeUndefined()
    expect(f.uwb!.block).toBe(2)
    expect(f.uwb!.round).toBe(1)
    expect(fieldSum(f)).toBe(f.bytes)
  })
})

describe('an RMNR frame is a header-only IE and nothing else (standard §10.34.2.1)', () => {
  it('RMNR_IE_BYTES is just the element header — the IE has no Content field', () => {
    expect(RMNR_IE_BYTES).toBe(UWB_IE_HDR_BYTES)
    expect(RMNR_IE_BYTES).toBe(2)
  })

  it('the whole frame is MHR + 2 + FCS = 13 octets', () => {
    expect(uwbRmnrBytes()).toBe(13)
  })

  it('makeRmnr builds that frame, with ies exactly [\'RMNR\']', () => {
    const f = makeRmnr('anc-1', 'tag', 0, 0, 2)
    expect(f.kind).toBe('uwbRmnr')
    expect(f.bytes).toBe(13)
    expect(f.uwb!.ies).toEqual(['RMNR'])
    expect(fieldSum(f)).toBe(f.bytes)
  })
})

describe('says what the first round saves against the ones after it (design §2)', () => {
  it('is 13 + 3A octets, for A = 1, 4, 9', () => {
    for (const a of [1, 4, 9]) {
      expect(uwbPollBytes(a) - uwbInitBytes()).toBe(13 + 3 * a)
    }
  })
})

describe('leaves every existing frame byte-identical', () => {
  it('Poll', () => {
    const f = makePoll('tag', ['a1', 'a2'], 'ds', 0, 0)
    expect(f.kind).toBe('uwbPoll')
    expect(f.bytes).toBe(uwbPollBytes(2))
    expect(f.bytes).toBe(33)
    expect(f.uwb!.ies).toEqual(['ARC', 'RDM', 'RRMC'])
    expect(f.uwb!.schedule).toEqual(['a1', 'a2'])
    expect(fieldSum(f)).toBe(f.bytes)
  })

  it('Response', () => {
    const f = makeResp('a1', 'tag', 'ss', 0, 0, 1, 127_803)
    expect(f.kind).toBe('uwbResp')
    expect(f.bytes).toBe(uwbRespBytes('ss'))
    expect(f.bytes).toBe(20)
    expect(f.uwb!.ies).toEqual(['RRMC', 'RRTI'])
    expect(fieldSum(f)).toBe(f.bytes)
  })

  it('Final', () => {
    const times = [{ id: 'a1', tround1: 1_000, treply2: 2_000 }]
    const f = makeFinal('tag', times, 0, 0, 5)
    expect(f.kind).toBe('uwbFinal')
    expect(f.bytes).toBe(uwbFinalBytes(1))
    expect(f.bytes).toBe(26)
    expect(f.uwb!.ies).toEqual(['RMI', 'RRTI'])
    expect(fieldSum(f)).toBe(f.bytes)
  })

  it('Report', () => {
    const f = makeReport('a1', 'tag', 1_000, 2_000, 0, 0, 6)
    expect(f.kind).toBe('uwbReport')
    expect(f.bytes).toBe(UWB_REPORT_BYTES)
    expect(f.bytes).toBe(24)
    expect(f.uwb!.ies).toEqual(['RMI'])
    expect(fieldSum(f)).toBe(f.bytes)
  })

  it('Blink', () => {
    const f = makeBlink('tag', 0, 0)
    expect(f.kind).toBe('uwbBlink')
    expect(f.bytes).toBe(UWB_BLINK_BYTES)
    expect(f.bytes).toBe(14)
    expect(f.uwb!.ies).toEqual(['BLINK'])
    expect(fieldSum(f)).toBe(f.bytes)
  })

  it('Many-to-many', () => {
    const f = makeM2m('p1', 'ss', 0, 0, 1, { txCounter: 1_000, rxCounters: { p0: 500 } })
    expect(f.kind).toBe('uwbM2m')
    expect(f.bytes).toBe(uwbM2mBytes(1))
    expect(f.bytes).toBe(26)
    expect(f.uwb!.ies).toEqual(['RRMC', 'TXT', 'RXT'])
    expect(fieldSum(f)).toBe(f.bytes)
  })
})
