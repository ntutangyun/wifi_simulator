/**
 * The floating reference window's geometry, as the two numbers it really is.
 *
 * The window carried a hard 620 px width and a drag clamp written against that
 * constant. On the folded foldable — 470 x 511 CSS px, the screen this app is
 * actually read on — that put 162 px of itself off the right edge of the
 * screen, and the two things at that edge are the search box and the ✕. The
 * only remaining way to close it was `Escape`, which a phone does not have.
 *
 * Both decisions are pure functions of the viewport, for the same reason
 * `layout.ts` and `clampColumnWidth` are: the repository renders no DOM in its
 * test suite, so a geometry that is a value can be pinned here and a geometry
 * that is a style string cannot. The browser side of the same claim is in
 * `tests/e2e/narrow-width.spec.ts`.
 */
import { describe, expect, it } from 'vitest'
import { clampGuidePos, guideWindowWidth } from '../../src/ui/GuideWindow'

/** The foldable open, and the same phone shut. */
const OPEN = { w: 939, h: 511 }
const SHUT = { w: 470, h: 511 }
const DESKTOP = { w: 1920, h: 1080 }

/** Where the window ends, given a left edge and a viewport. */
const rightEdge = (x: number, vw: number): number => x + guideWindowWidth(vw)

describe('guideWindowWidth', () => {
  it('keeps its desktop width where the viewport has the room', () => {
    expect(guideWindowWidth(DESKTOP.w)).toBe(620)
    expect(guideWindowWidth(OPEN.w)).toBe(620)
  })

  it('gives up width rather than the screen edge on the folded phone', () => {
    // 470 − 2 × 12: the window and a gutter either side, which is the whole
    // point — 620 here is 150 px of window nobody can see or touch.
    expect(guideWindowWidth(SHUT.w)).toBe(446)
    expect(guideWindowWidth(SHUT.w)).toBeLessThanOrEqual(SHUT.w)
  })

  it('never exceeds the viewport at any width between the two', () => {
    for (let vw = 320; vw <= 1920; vw += 1) {
      expect(guideWindowWidth(vw), `vw=${vw}`).toBeLessThanOrEqual(vw)
    }
  })
})

describe('clampGuidePos', () => {
  const fit = (p: { x: number; y: number }, v: { w: number; h: number }) =>
    clampGuidePos(p, guideWindowWidth(v.w), v.w, v.h)

  it('leaves a position that is already on screen alone', () => {
    expect(fit({ x: 12, y: 52 }, SHUT)).toEqual({ x: 12, y: 52 })
    expect(fit({ x: 295, y: 52 }, OPEN)).toEqual({ x: 295, y: 52 })
  })

  it('never lets the right edge — where the ✕ is — leave the screen', () => {
    for (const v of [SHUT, OPEN, DESKTOP]) {
      for (const x of [0, 100, 500, 2000, 1e6]) {
        const p = fit({ x, y: 52 }, v)
        expect(rightEdge(p.x, v.w), `vw=${v.w} x=${x}`).toBeLessThanOrEqual(v.w)
      }
    }
  })

  it('still lets the reader shove it aside to the left, keeping a grab handle', () => {
    const p = fit({ x: -5000, y: 52 }, OPEN)
    expect(p.x).toBeLessThan(0)
    // 120 px of title bar left on screen: enough to drag it back by.
    expect(p.x + guideWindowWidth(OPEN.w)).toBeGreaterThanOrEqual(120)
  })

  it('brings a window parked on the open screen back onto the shut one', () => {
    // The fold is the case: 939 px wide, window flush right at x = 319, then the
    // screen becomes 470 px and the window is entirely past the right edge.
    const parked = clampGuidePos({ x: 319, y: 52 }, guideWindowWidth(OPEN.w), OPEN.w, OPEN.h)
    expect(parked).toEqual({ x: 319, y: 52 })
    const folded = fit(parked, SHUT)
    expect(rightEdge(folded.x, SHUT.w)).toBeLessThanOrEqual(SHUT.w)
    expect(folded.x).toBe(SHUT.w - guideWindowWidth(SHUT.w))
  })

  it('keeps the title bar on screen vertically too', () => {
    expect(fit({ x: 12, y: -200 }, SHUT).y).toBe(0)
    expect(fit({ x: 12, y: 5000 }, SHUT).y).toBe(SHUT.h - 60)
  })
})
