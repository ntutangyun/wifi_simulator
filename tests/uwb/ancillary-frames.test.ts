/**
 * Task 1 of docs/superpowers/specs/2026-10-02-ancillary-design.md: the pure frame layer for
 * ranging ancillary information, Request = 0 half only (standard §10.35). No session switch, no
 * segmentation, no round lands here — this pins the RAICT IE's variable length and the frame
 * (`uwbAncillary`) that carries one fragment of it.
 */
import { describe, it, expect } from 'vitest'
import { makeAncillary } from '../../src/uwb/frames'
import { uwbFrameFields } from '../../src/uwb/frameFields'
import {
  RAICT_IE_MIN_BYTES, UWB_FCS_BYTES, UWB_IE_HDR_BYTES, UWB_MHR_BYTES, raictIeBytes, uwbAncillaryBytes,
} from '../../src/uwb/phy'

const fieldsOf = (f: ReturnType<typeof makeAncillary>) => uwbFrameFields(f).users[0].subframes[0].mpdu.fields
const fieldSum = (f: ReturnType<typeof makeAncillary>) => fieldsOf(f).reduce((s, x) => s + x.bytes, 0)

describe('raictIeBytes is one control octet plus whichever optional octets the presence bits claim (standard §10.35.2.1)', () => {
  it('RAICT_IE_MIN_BYTES is the header plus the control octet alone', () => {
    expect(RAICT_IE_MIN_BYTES).toBe(UWB_IE_HDR_BYTES + 1)
  })

  it('neither optional field present: just the control octet', () => {
    expect(raictIeBytes(false, false)).toBe(UWB_IE_HDR_BYTES + 1)
  })

  it('both optional fields present: control octet plus two more', () => {
    expect(raictIeBytes(true, true)).toBe(UWB_IE_HDR_BYTES + 3)
  })

  // The two middle cases are pinned separately and against each other: an implementation that
  // only counts how many of the two bits are set (and so cannot tell "number only" from "frames
  // remaining only" apart) would still pass if these were merged into one assertion.
  it('message number present, frames remaining absent', () => {
    expect(raictIeBytes(true, false)).toBe(UWB_IE_HDR_BYTES + 2)
  })

  it('frames remaining present, message number absent', () => {
    expect(raictIeBytes(false, true)).toBe(UWB_IE_HDR_BYTES + 2)
  })

  it('the two middle cases are equal in byte count but are not the same combination', () => {
    expect(raictIeBytes(true, false)).toBe(raictIeBytes(false, true))
    // Distinct inputs that happen to cost the same: a length-only check cannot distinguish them,
    // which is exactly why `makeAncillary` below checks presence against content directly rather
    // than trusting a byte count to imply the right shape.
  })
})

describe('uwbAncillaryBytes is MHR + RAICT IE + FCS', () => {
  it('matches the RAICT IE sizing exactly, at all four combinations', () => {
    for (const numberPresent of [false, true]) {
      for (const framesRemainingPresent of [false, true]) {
        expect(uwbAncillaryBytes(numberPresent, framesRemainingPresent)).toBe(
          UWB_MHR_BYTES + raictIeBytes(numberPresent, framesRemainingPresent) + UWB_FCS_BYTES,
        )
      }
    }
  })

  it('the smallest ancillary frame is MHR + the minimum RAICT IE + FCS, nothing more', () => {
    expect(uwbAncillaryBytes(false, false)).toBe(UWB_MHR_BYTES + RAICT_IE_MIN_BYTES + UWB_FCS_BYTES)
  })
})

describe('makeAncillary builds one RAICT-carrying fragment', () => {
  it('both optional fields present: sizes and decodes correctly', () => {
    const f = makeAncillary('tag', 'anc-1', 2, 1, 3, true, true, { messageNumber: 5, framesRemaining: 2 })
    expect(f.kind).toBe('uwbAncillary')
    expect(f.bytes).toBe(uwbAncillaryBytes(true, true))
    expect(f.uwb!.ies).toEqual(['RAICT'])
    expect(f.uwb!.raict).toEqual({ messageNumber: 5, framesRemaining: 2 })
    expect(f.uwb!.block).toBe(2)
    expect(f.uwb!.round).toBe(1)
    expect(f.uwb!.slot).toBe(3)
    // Not only the declared size: walk the decoded fields and the RAICT row's own byte count.
    expect(fieldSum(f)).toBe(f.bytes)
    const raictField = fieldsOf(f).find((x) => x.key === 'ieRaict')!
    expect(raictField.bytes).toBe(raictIeBytes(true, true))
    expect(raictField.value).toContain('5')
    expect(raictField.value).toContain('2')
  })

  it('neither optional field present: the smallest fragment, still decodes', () => {
    const f = makeAncillary('tag', 'anc-1', 0, 0, 0, false, false)
    expect(f.bytes).toBe(uwbAncillaryBytes(false, false))
    expect(f.uwb!.raict).toEqual({ messageNumber: undefined, framesRemaining: undefined })
    expect(fieldSum(f)).toBe(f.bytes)
  })

  it('message number only', () => {
    const f = makeAncillary('tag', 'anc-1', 0, 0, 0, true, false, { messageNumber: 9 })
    expect(f.bytes).toBe(uwbAncillaryBytes(true, false))
    expect(fieldSum(f)).toBe(f.bytes)
  })

  it('frames remaining only', () => {
    const f = makeAncillary('tag', 'anc-1', 0, 0, 0, false, true, { framesRemaining: 3 })
    expect(f.bytes).toBe(uwbAncillaryBytes(false, true))
    expect(fieldSum(f)).toBe(f.bytes)
  })
})

describe('makeAncillary refuses presence bits and content that disagree (the makeMmrcm precedent)', () => {
  it('refuses to claim a frames-remaining count it did not make room for', () => {
    expect(() => makeAncillary('tag', 'anc-1', 0, 0, 0, false, false, { framesRemaining: 2 }))
      .toThrow(/frames-remaining/)
  })

  it('refuses to claim room for a frames-remaining count and then not give one', () => {
    expect(() => makeAncillary('tag', 'anc-1', 0, 0, 0, false, true, {}))
      .toThrow(/frames-remaining/)
  })

  it('refuses to claim a message number it did not make room for', () => {
    expect(() => makeAncillary('tag', 'anc-1', 0, 0, 0, false, false, { messageNumber: 1 }))
      .toThrow(/message number/)
  })

  it('refuses to claim room for a message number and then not give one', () => {
    expect(() => makeAncillary('tag', 'anc-1', 0, 0, 0, true, false, {}))
      .toThrow(/message number/)
  })
})
