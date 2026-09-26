/**
 * The touch gestures are arithmetic, so they are tested as arithmetic.
 *
 * The direction of each one is the part worth pinning: a pinch that zooms the
 * wrong way and a drag that scrubs backwards both "work" in the sense that
 * something moves, and both are unusable.
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_SPAN, MIN_SPAN, TAP_SLOP, ZOOM_STEP,
  clampSpan, distance, dragNs, isTap, pinchSpan, zoomedSpan,
} from '../../src/ui/timelineGestures'

describe('clampSpan', () => {
  it('keeps a window inside what the strip can show', () => {
    expect(clampSpan(5_000_000)).toBe(5_000_000)
    expect(clampSpan(1)).toBe(MIN_SPAN)
    expect(clampSpan(9e12)).toBe(MAX_SPAN)
  })

  it('gives the narrowest window for a number that is not one', () => {
    expect(clampSpan(Number.NaN)).toBe(MIN_SPAN)
    expect(clampSpan(Number.POSITIVE_INFINITY)).toBe(MAX_SPAN)
  })
})

describe('zoomedSpan', () => {
  it('above 1 shows more time and below 1 shows less', () => {
    expect(zoomedSpan(5_000_000, ZOOM_STEP)).toBe(7_000_000)
    expect(zoomedSpan(5_000_000, 1 / ZOOM_STEP)).toBe(3_571_429)
  })

  it('stops at the bounds instead of running past them', () => {
    expect(zoomedSpan(MIN_SPAN, 1 / ZOOM_STEP)).toBe(MIN_SPAN)
    expect(zoomedSpan(MAX_SPAN, ZOOM_STEP)).toBe(MAX_SPAN)
  })
})

describe('pinchSpan', () => {
  it('fingers apart show less time, fingers together show more', () => {
    // the direction that makes a pinch feel like a pinch
    expect(pinchSpan(4_000_000, 100, 200)).toBe(2_000_000)
    expect(pinchSpan(4_000_000, 200, 100)).toBe(8_000_000)
  })

  it('holding the distance holds the window', () => {
    expect(pinchSpan(4_000_000, 150, 150)).toBe(4_000_000)
  })

  it('ignores a pinch with no distance rather than dividing by zero', () => {
    expect(pinchSpan(4_000_000, 0, 120)).toBe(4_000_000)
    expect(pinchSpan(4_000_000, 120, 0)).toBe(4_000_000)
  })

  it('clamps like every other way of changing the window', () => {
    expect(pinchSpan(MAX_SPAN, 200, 1)).toBe(MAX_SPAN)
    expect(pinchSpan(MIN_SPAN, 1, 200)).toBe(MIN_SPAN)
  })
})

describe('dragNs', () => {
  it('drags the content with the finger, which is backwards in time', () => {
    // a finger moving right pulls earlier time into view
    expect(dragNs(100, 1000, 5_000_000)).toBe(-500_000)
    expect(dragNs(-100, 1000, 5_000_000)).toBe(500_000)
  })

  it('scales with the visible window, not with pixels alone', () => {
    // the same swipe crosses the same fraction of the view whatever it is showing
    expect(dragNs(50, 500, 1_000_000)).toBe(-100_000)
    expect(dragNs(50, 500, 10_000_000)).toBe(-1_000_000)
  })

  it('moves nothing across a strip of no width', () => {
    expect(dragNs(40, 0, 5_000_000)).toBe(0)
  })
})

describe('isTap', () => {
  it('lets a finger wobble without turning a tap into a drag', () => {
    expect(isTap(0, 0)).toBe(true)
    expect(isTap(TAP_SLOP, 0)).toBe(true)
  })

  it('calls a real movement a drag', () => {
    expect(isTap(TAP_SLOP + 1, 0)).toBe(false)
    expect(isTap(0, 40)).toBe(false)
  })
})

describe('distance', () => {
  it('is the plain one', () => {
    expect(distance(0, 0, 3, 4)).toBe(5)
    expect(distance(10, 10, 10, 10)).toBe(0)
  })
})
