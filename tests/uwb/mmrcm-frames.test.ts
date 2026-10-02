/**
 * Task 1 of docs/superpowers/specs/2026-10-02-receipt-confirmation-design.md: the pure frame
 * layer for the multi-message receipt confirmation exchange (standard §10.36, Figure 10-272
 * "Many-to-Many Messages"). No schema, no schedule, no device lands here — this pins the frame
 * (MMRCM), the IE (RMMRC) and the sizes only.
 */
import { describe, it, expect } from 'vitest'
import {
  makeBlink, makeFinal, makeInit, makeM2m, makeMmrcm, makePoll, makeReport, makeResp, makeRmnr,
} from '../../src/uwb/frames'
import { uwbFrameFields } from '../../src/uwb/frameFields'
import {
  RMMRC_ADDR_BYTES, RMMRC_FIXED_BYTES, UWB_BLINK_BYTES, UWB_IE_HDR_BYTES, UWB_MAX_PSDU_BYTES,
  UWB_REPORT_BYTES, rmmrcEntryBytes, uwbFinalBytes, uwbInitBytes, uwbM2mBytes, uwbMaxMmrcmInitiators,
  uwbMmrcmBytes, uwbPollBytes, uwbRespBytes, uwbRmnrBytes,
} from '../../src/uwb/phy'

const fieldsOf = (f: ReturnType<typeof makeResp>) => uwbFrameFields(f).users[0].subframes[0].mpdu.fields
const fieldSum = (f: ReturnType<typeof makeResp>) => fieldsOf(f).reduce((s, x) => s + x.bytes, 0)

/** A window of R rounds, every round's opener received: a receipt array `makeMmrcm` can use
 * without any schedule to draw it from (there is none yet — that is a later task). */
const allReceived = (r: number): boolean[] => Array.from({ length: r }, () => true)

describe('RMMRC_FIXED_BYTES and rmmrcEntryBytes are the element header plus flags/length, and the address plus bitmap (standard §10.36.2.1)', () => {
  it('the fixed part is header 2 + flags 1 + list length 1 = 4', () => {
    expect(RMMRC_FIXED_BYTES).toBe(UWB_IE_HDR_BYTES + 2)
    expect(RMMRC_FIXED_BYTES).toBe(4)
  })

  it('one entry is the 2-octet short address plus a bitmap that grows with the window', () => {
    expect(RMMRC_ADDR_BYTES).toBe(2)
    expect(rmmrcEntryBytes(4)).toBe(3) // 2 + ⌈4/8⌉
    expect(rmmrcEntryBytes(8)).toBe(3) // 2 + ⌈8/8⌉
    expect(rmmrcEntryBytes(9)).toBe(4) // 2 + ⌈9/8⌉
  })
})

describe('uwbMmrcmBytes costs 15 + 3N octets at a window of eight rounds or fewer (design §3.3)', () => {
  it('matches for N = 1, 3, 6', () => {
    for (const [n, want] of [[1, 18], [3, 24], [6, 33]] as const) {
      expect(uwbMmrcmBytes(n, 4)).toBe(want)
    }
  })

  it('holds at the R = 8 boundary too, not only below it', () => {
    expect(uwbMmrcmBytes(1, 8)).toBe(18)
    expect(uwbMmrcmBytes(6, 8)).toBe(33)
  })
})

describe('the bitmap — and so the whole frame — widens once the window passes eight rounds', () => {
  it('one initiator costs one more octet at R = 9 than at R = 8', () => {
    expect(uwbMmrcmBytes(1, 9) - uwbMmrcmBytes(1, 8)).toBe(1)
  })

  it('every initiator pays that extra octet, not just the first', () => {
    expect(uwbMmrcmBytes(6, 9) - uwbMmrcmBytes(6, 8)).toBe(6)
  })
})

describe('uwbMaxMmrcmInitiators derives the cap from the 127-octet PSDU, not from a literal', () => {
  it('pins both boundaries at R = 4: the cap itself fits, one more does not', () => {
    const cap = uwbMaxMmrcmInitiators(4)
    expect(cap).toBeGreaterThan(0)
    expect(uwbMmrcmBytes(cap, 4)).toBeLessThanOrEqual(UWB_MAX_PSDU_BYTES)
    expect(uwbMmrcmBytes(cap + 1, 4)).toBeGreaterThan(UWB_MAX_PSDU_BYTES)
  })

  it('a wider window (R = 9) lowers the cap — its entries cost one octet more each', () => {
    const cap4 = uwbMaxMmrcmInitiators(4)
    const cap9 = uwbMaxMmrcmInitiators(9)
    expect(cap9).toBeLessThan(cap4)
    expect(uwbMmrcmBytes(cap9, 9)).toBeLessThanOrEqual(UWB_MAX_PSDU_BYTES)
    expect(uwbMmrcmBytes(cap9 + 1, 9)).toBeGreaterThan(UWB_MAX_PSDU_BYTES)
  })
})

describe('makeMmrcm carries one list entry per initiator, each with an address and a bitmap', () => {
  it('builds the right shape and size for three initiators at R = 4', () => {
    const entries = [
      { initiator: 'a1', received: [true, true, true, true] },
      { initiator: 'a2', received: [true, false, true, false] },
      { initiator: 'a3', received: [false, false, false, false] },
    ]
    const f = makeMmrcm('b1', 'ctrl', 2, 1, 3, 4, entries)
    expect(f.kind).toBe('uwbMmrcm')
    expect(f.bytes).toBe(uwbMmrcmBytes(3, 4))
    expect(f.bytes).toBe(24)
    expect(f.uwb!.ies).toEqual(['RMMRC'])
    expect(f.uwb!.mmrc).toEqual(entries)
    expect(f.uwb!.block).toBe(2)
    expect(f.uwb!.round).toBe(1)
    expect(f.uwb!.slot).toBe(3)
    // Not only the declared size: walk the decoded fields and the RMMRC row's own byte count.
    expect(fieldSum(f)).toBe(f.bytes)
    const rmmrcField = fieldsOf(f).find((x) => x.key === 'ieRmmrc')!
    expect(rmmrcField.bytes).toBe(RMMRC_FIXED_BYTES + 3 * rmmrcEntryBytes(4))
    expect(rmmrcField.value).toContain('a1')
    expect(rmmrcField.value).toContain('a2')
    expect(rmmrcField.value).toContain('a3')
  })

  it('copies the entries rather than aliasing the caller\'s arrays', () => {
    const received = [true, false]
    const entries = [{ initiator: 'a1', received }]
    const f = makeMmrcm('b1', 'ctrl', 0, 0, 0, 2, entries)
    received[0] = false
    expect(f.uwb!.mmrc![0].received).toEqual([true, false])
  })

  it('an empty list (no initiators answered) still sizes to the fixed part alone', () => {
    const f = makeMmrcm('b1', 'ctrl', 0, 0, 0, 4, [])
    expect(f.bytes).toBe(uwbMmrcmBytes(0, 4))
    expect(f.bytes).toBe(15)
    expect(f.uwb!.mmrc).toEqual([])
    expect(fieldSum(f)).toBe(f.bytes)
  })

  it('one initiator at a nine-round window costs 19 octets, not 18', () => {
    const f = makeMmrcm('b1', 'ctrl', 0, 0, 0, 9, [{ initiator: 'a1', received: allReceived(9) }])
    expect(f.bytes).toBe(19)
    expect(fieldSum(f)).toBe(f.bytes)
  })
})

describe('leaves every existing frame byte-identical', () => {
  it('Poll', () => {
    const f = makePoll('tag', ['a1', 'a2'], 'ds', 0, 0)
    expect(f.bytes).toBe(uwbPollBytes(2))
    expect(f.bytes).toBe(33)
    expect(fieldSum(f)).toBe(f.bytes)
  })

  it('Response', () => {
    const f = makeResp('a1', 'tag', 'ss', 0, 0, 1, 127_803)
    expect(f.bytes).toBe(uwbRespBytes('ss'))
    expect(f.bytes).toBe(20)
    expect(fieldSum(f)).toBe(f.bytes)
  })

  it('Final', () => {
    const times = [{ id: 'a1', tround1: 1_000, treply2: 2_000 }]
    const f = makeFinal('tag', times, 0, 0, 5)
    expect(f.bytes).toBe(uwbFinalBytes(1))
    expect(f.bytes).toBe(26)
    expect(fieldSum(f)).toBe(f.bytes)
  })

  it('Report', () => {
    const f = makeReport('a1', 'tag', 1_000, 2_000, 0, 0, 6)
    expect(f.bytes).toBe(UWB_REPORT_BYTES)
    expect(f.bytes).toBe(24)
    expect(fieldSum(f)).toBe(f.bytes)
  })

  it('Blink', () => {
    const f = makeBlink('tag', 0, 0)
    expect(f.bytes).toBe(UWB_BLINK_BYTES)
    expect(f.bytes).toBe(14)
    expect(fieldSum(f)).toBe(f.bytes)
  })

  it('Many-to-many', () => {
    const f = makeM2m('p1', 'ss', 0, 0, 1, { txCounter: 1_000, rxCounters: { p0: 500 } })
    expect(f.bytes).toBe(uwbM2mBytes(1))
    expect(f.bytes).toBe(26)
    expect(fieldSum(f)).toBe(f.bytes)
  })

  it('Init', () => {
    const f = makeInit('tag', 'ss', 2, 1)
    expect(f.bytes).toBe(uwbInitBytes())
    expect(f.bytes).toBe(14)
    expect(fieldSum(f)).toBe(f.bytes)
  })

  it('RMNR', () => {
    const f = makeRmnr('anc-1', 'tag', 0, 0, 2)
    expect(f.bytes).toBe(uwbRmnrBytes())
    expect(f.bytes).toBe(13)
    expect(fieldSum(f)).toBe(f.bytes)
  })
})

describe('the receipt bitmap must cover exactly the window it reports on', () => {
  /**
   * `makeMmrcm` takes the window length *and* the arrays that fill it, so the bitmap's width has
   * two sources: the parameter prices the frame, the arrays carry the content. The doc comment
   * named that invariant and left it to the caller — and a frame priced for one octet of bitmap
   * while carrying nine bits of content is wrong in the one way no test of `uwbMmrcmBytes` can
   * see, because the size function is given the right number and returns it faithfully.
   *
   * So it throws, and names which initiator's entry disagreed. This branch has paid for the same
   * shape three times over: a round plan's `anchors` meaning two quantities by mode, a validity
   * state not keyed by initiator, and a slot count copied into the schema.
   */
  it('refuses a bitmap shorter than the window', () => {
    expect(() => makeMmrcm('b1', 'ctrl', 0, 0, 0, 4, [{ initiator: 'a1', received: allReceived(2) }]))
      .toThrow(/a1.*2 long in a 4-round window/)
  })

  it('refuses a bitmap longer than the window', () => {
    expect(() => makeMmrcm('b1', 'ctrl', 0, 0, 0, 4, [{ initiator: 'a1', received: allReceived(9) }]))
      .toThrow(/9 long in a 4-round window/)
  })

  it('names the offending initiator when only one of several disagrees', () => {
    expect(() => makeMmrcm('b1', 'ctrl', 0, 0, 0, 4, [
      { initiator: 'a1', received: allReceived(4) },
      { initiator: 'a2', received: allReceived(3) },
    ])).toThrow(/a2/)
  })

  it('still accepts an empty list, which belongs to a window of a known length', () => {
    expect(() => makeMmrcm('b1', 'ctrl', 0, 0, 0, 4, [])).not.toThrow()
  })
})
