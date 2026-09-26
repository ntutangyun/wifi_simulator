/**
 * How the shell arranges itself for a given viewport.
 *
 * The app was built for a desktop window and has no media query anywhere, so on
 * a small screen it keeps a desktop's furniture: three columns where the one
 * being read is the narrowest, and two fixed strips under the viewport that
 * together take nearly half the height. Measured on an unfolded foldable at
 * 939 x 511 CSS px, course mode gave the lesson 279 px of 939, and simulate mode
 * spent 230 px of 511 on the timeline and the transport while the 3-D view got
 * 243 px.
 *
 * This module is the one place that decides what to do about it. It is pure and
 * takes the viewport as arguments so the decision can be tested without a
 * browser — the same shape `clampColumnWidth` in `columnResize.tsx` already
 * uses, and the reason neither needs a test that renders anything.
 */

/** Below this width the side panel stops being a column of its own. */
export const COMPACT_W = 1100
/** Below this height the timeline cannot afford its desktop size. */
export const COMPACT_H = 620
/**
 * Below this width two columns cannot both be useful, so the shell shows one and
 * lets the reader switch. A folded foldable and most phones in portrait land here.
 */
export const SINGLE_W = 700

/** The timeline's height on a desktop, and the floor it may not shrink past. */
export const TIMELINE_H = 190
export const TIMELINE_H_COMPACT = 120
/** What is left of the timeline when it is collapsed: the handle that reopens it. */
export const TIMELINE_H_COLLAPSED = 26

/** Which panel the single-column shell is showing. */
export type MainPane = 'course' | 'view'

export interface ShellLayout {
  /** The viewport is small enough that the desktop arrangement does not fit. */
  compact: boolean
  /** The inspector and the event log are a drawer over the content, not a column. */
  sideAsDrawer: boolean
  /** Only one of the lesson and the viewport is on screen; `MainPane` says which. */
  singleColumn: boolean
  /**
   * The timeline's height in px, before the reader collapses it. Collapsing is a
   * separate decision — this is what "open" means at this size.
   */
  timelineH: number
}

/**
 * The arrangement for a viewport of `w` x `h` CSS px.
 *
 * Width and height are read independently and on purpose: an unfolded foldable
 * is wide enough for two columns and far too short for a 190 px timeline, so a
 * single breakpoint on either one alone would get it wrong.
 */
export function layoutFor(w: number, h: number): ShellLayout {
  const narrow = w < COMPACT_W
  const short = h < COMPACT_H
  const singleColumn = w < SINGLE_W
  return {
    compact: narrow || short,
    // The drawer is a width decision: a short-but-wide window still has room for
    // the inspector beside the content, and hiding it there would cost a column
    // the reader can afford.
    sideAsDrawer: narrow,
    singleColumn,
    timelineH: short ? TIMELINE_H_COMPACT : TIMELINE_H,
  }
}

/**
 * The grid template for the main row, given the mode and the arrangement.
 *
 * `minmax(0, 1fr)` rather than `1fr` for every flexible column: a bare `1fr` is
 * `minmax(auto, 1fr)`, and `auto` lets a column with a wide child — the 3-D
 * canvas — push its neighbours off screen. That is the defect this string had
 * before, and it is why the value is written out rather than assumed.
 */
export function mainColumns(
  mode: 'edit' | 'simulate' | 'course',
  layout: ShellLayout,
  courseW: number,
  pane: MainPane,
): string {
  const one = 'minmax(0, 1fr)'
  if (mode === 'edit') return one
  if (layout.singleColumn) return one
  if (mode === 'simulate') {
    return layout.sideAsDrawer ? one : `${one} minmax(320px, 400px)`
  }
  // course
  if (layout.sideAsDrawer) {
    // Two columns, and the lesson gets the larger share — it is the thing being
    // read, and on the desktop layout it was the smallest of the three.
    return pane === 'course' ? `minmax(0, 1.4fr) ${one}` : `${one} minmax(0, 1.4fr)`
  }
  return `${courseW}px ${one} minmax(300px, 360px)`
}
