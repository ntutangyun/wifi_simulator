/**
 * The arithmetic behind the timeline's touch gestures.
 *
 * The strip has always been driven by a wheel: scroll to move time, Ctrl+scroll
 * to zoom. Neither exists on a phone, so the same two things arrive as a drag
 * and a pinch. What they do to the window is arithmetic, and it lives here so it
 * can be tested without a pointer — the same reason `layout.ts` is a function of
 * two numbers rather than a media query.
 *
 * Nothing here holds state or touches the DOM; the component owns the pointers
 * and calls these.
 */

/** Narrowest window the strip will show: 100 µs. */
export const MIN_SPAN = 100_000
/** Widest window the strip will show: 1 s. */
export const MAX_SPAN = 1_000_000_000

/** How far a pointer may travel and still count as a tap rather than a drag, in px. */
export const TAP_SLOP = 8

/** A visible window clamped to what the strip can show. */
export function clampSpan(ns: number): number {
  // Only NaN needs a guard: `Math.min`/`Math.max` clamp an infinity to the bound
  // it ran past, which is the right answer for "as wide as it will go", while
  // NaN would pass straight through them.
  if (Number.isNaN(ns)) return MIN_SPAN
  return Math.round(Math.min(MAX_SPAN, Math.max(MIN_SPAN, ns)))
}

/**
 * The window after zooming by `factor`: above 1 shows more time, below 1 less.
 *
 * The wheel's own step is 1.4, and the buttons use the same one so that a tap
 * and a notch move the view by the same amount.
 */
export const ZOOM_STEP = 1.4

export function zoomedSpan(span: number, factor: number): number {
  return clampSpan(span * factor)
}

/** Distance between two points, for a pinch. */
export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by)
}

/**
 * The window a pinch has asked for, from the span it started at.
 *
 * Fingers moving apart mean "show me less time", so the span shrinks as the
 * distance grows — the ratio is start over now, not now over start. A pinch that
 * starts on a degenerate distance (both fingers on one pixel) is ignored rather
 * than dividing by zero.
 */
export function pinchSpan(startSpan: number, startDist: number, nowDist: number): number {
  if (!(startDist > 0) || !(nowDist > 0)) return clampSpan(startSpan)
  return clampSpan(startSpan * (startDist / nowDist))
}

/**
 * How far, in nanoseconds, a horizontal drag of `dxPx` across a strip `widthPx`
 * wide should move the playhead.
 *
 * Dragging right moves the content right, which means going back in time, so the
 * sign is inverted — the same direction a finger moves a map.
 */
export function dragNs(dxPx: number, widthPx: number, spanNs: number): number {
  if (!(widthPx > 0)) return 0
  return Math.round((-dxPx / widthPx) * spanNs)
}

/** True when a pointer that has travelled `dx`, `dy` should still count as a tap. */
export function isTap(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) <= TAP_SLOP
}
