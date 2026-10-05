/**
 * How the shell arranges itself for a given viewport.
 *
 * The app was built for a desktop window and has no media query anywhere, so on
 * a small screen it keeps a desktop's furniture: three columns where the one
 * being read is the narrowest, and two fixed strips under the viewport that
 * together take nearly half the height. Measured on an unfolded foldable at
 * 939 x 511 CSS px, course mode gave the lesson 279 px of 939, and simulate mode
 * spent 230 px of 511 on the timeline and the transport while the 3-D view got
 * 243 px. Those numbers are the state this module was written against.
 *
 * **Every row height here is a pointer type as well as a viewport**, and this
 * comment has been wrong twice for leaving that out. `index.css` gives controls
 * a larger floor under `(pointer: coarse)`, so the same 939 x 511 gives the 3-D
 * view **313 px with a mouse and 297 px on a finger** — the header and the
 * control row each grow from 38/40 to 47, and the view pays the 16 px. The
 * phone only ever reports coarse, so **297 is the number that describes the
 * device** and 313 is a measurement of a screen nobody touches that way. A
 * figure quoted from this header without its pointer type has already misled a
 * brief once; measure, and say which pointer you measured under.
 *
 * The same phone shut is 470 x 511: half the width, every bit of the height. See
 * `rowStack` for what changes there.
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

/**
 * Below this width, at `pointer: coarse` control sizes, the transport's twelve
 * controls no longer fit in one row (model): measured in the browser at
 * `index.css`'s coarse-pointer sizes, the row wants 947 px; 950 rounds that up
 * with 3 px of slack rather than sitting exactly on the measured figure, which a
 * sub-pixel layout could tip back into wrapping. At a fine (mouse) pointer the
 * same row only wants 911 px, which is why this cannot be a plain width
 * breakpoint — see `transportScroll` below.
 */
export const COARSE_TRANSPORT_MIN_W = 950

/** The timeline's height on a desktop, and the floor it may not shrink past. */
export const TIMELINE_H = 190
export const TIMELINE_H_COMPACT = 120
/** What is left of the timeline when it is collapsed: the handle that reopens it. */
export const TIMELINE_H_COLLAPSED = 26

/** Which panel the single-column shell is showing. */
export type MainPane = 'course' | 'view'

/**
 * The column every row-only grid in this app has to state.
 *
 * Without it the implicit column is `auto`, which is as wide as its widest child
 * wants to be — and a child wide enough to set its own width (the 3-D viewport's
 * canvas keeps the pixel width it was last given; the editor's panel row is a
 * fixed `280px + 300px`) then makes the column wider than the grid item. Two
 * separate defects came out of that: a viewport painting over the column beside
 * it, and a full-width row inside the editor resolving its width against 580 px
 * on a 470 px screen.
 *
 * `minmax(0, 1fr)` rather than a bare `1fr`, because `1fr` *is*
 * `minmax(auto, 1fr)` and `auto` is the half that does the damage. It lives here
 * rather than in one of the two components so the string has one definition —
 * `tests/ui/appGrid.test.ts` walks every grid in the shell and asks for it.
 */
export const ONE_COLUMN = 'minmax(0, 1fr)'

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
  /**
   * The player is three stacked rows: the 3-D view, then the timeline, then the
   * controls — the same top-to-bottom order every other viewport has. What is
   * different here is the control row itself: it is one row that scrolls sideways
   * instead of a block that wraps, and it leads with the time, play and the speed,
   * because the rest of it is off screen until the reader scrolls.
   *
   * This used to put the controls *above* the timeline, on the argument that the
   * row tapped most often should not sit against the bottom edge of the screen.
   * The reader has since used it on the device and asked for the controls at the
   * bottom at every size — which is where every other size already had them — so
   * the shell no longer has two orders to pick between. The stack itself did not
   * change; only that one claim did, and it is gone.
   */
  rowStack: boolean
  /**
   * The transport is one row that scrolls sideways instead of wrapping to a
   * second row. Always true when `rowStack` is — the folded phone's whole player
   * is built around it — but also true, independently, on an unfolded foldable:
   * see `layoutFor` for why that needs the pointer type and not just the width.
   * The order of the controls does not follow from this on its own; that is
   * still `rowStack`, because only the folded case loses enough of the row to
   * make reordering worth the cost of moving what the reader is used to.
   */
  transportScroll: boolean
  /**
   * The 3-D view shows its on-screen camera pad: pan, zoom, and `⌂` for the
   * starting view. This is `!compact`, deliberately not a breakpoint of its own,
   * so the pad is off on both halves of the foldable and on any window too narrow
   * or too short for the desktop arrangement.
   *
   * The pointer is not part of it, and that is the difference from
   * `transportScroll`. The pad is a 3 x 3 grid of buttons carrying inline
   * `width: 32` and `padding: 0`, which `index.css`'s `pointer: coarse` rule
   * cannot reach: measured in the browser it is 104 x 104 px at a fine pointer and
   * 104 x 104 px at a coarse one. Nothing about it changes with the pointer, so
   * reading the pointer here would be decoration — where `transportScroll` must,
   * because its row's width really does differ by 36 px between the two and the
   * gap straddles the unfolded foldable.
   *
   * What is left is what 104 x 104 px costs the view it covers (measured, same
   * session): 1.7 % of a 1040 x 632 desktop view, 3.9 % of the unfolded
   * 939 x 297 one, 7.6 % of the folded 470 x 301 one — and the two phone views are
   * less than half as tall to begin with. `compact` is the name this module
   * already gives that boundary; a second constant a hair away from it would be
   * two names for one decision and would drift.
   *
   * Eight of the nine buttons are redundant at either pointer: a drag orbits, a
   * wheel or a pinch zooms, a right-drag or two fingers pan, all directly on the
   * canvas, which opts out of the browser's own gestures for exactly that. `⌂` is
   * the one that is not — there is no gesture and no key for it — so where the pad
   * is off, the only way back to the starting view is to leave the mode and come
   * back, which rebuilds the scene. That was already true folded; it is now true
   * unfolded too. A real loss, taken knowingly.
   */
  cameraPad: boolean
}

/**
 * The arrangement for a viewport of `w` x `h` CSS px, and — for `transportScroll`
 * only — whether the pointer is a touch (`pointer: coarse`) one.
 *
 * Width and height are read independently and on purpose: an unfolded foldable
 * is wide enough for two columns and far too short for a 190 px timeline, so a
 * single breakpoint on either one alone would get it wrong. `coarsePointer`
 * defaults to `false` so a caller that has not measured it (tests, the server
 * render) gets the mouse answer rather than a guess.
 */
export function layoutFor(w: number, h: number, coarsePointer = false): ShellLayout {
  const narrow = w < COMPACT_W
  const short = h < COMPACT_H
  const singleColumn = w < SINGLE_W
  // Deliberately the same breakpoint as `singleColumn`, not a new one. The
  // stack exists because the transport cannot be one row here: measured in the
  // browser its twelve controls want 911 px side by side with a mouse pointer
  // and 947 px at the `pointer: coarse` sizes in `index.css`. Every width that
  // could be the dividing line was tried against the two real viewports — the
  // foldable is 939 x 511 open and 470 x 511 shut — and a breakpoint anywhere
  // near where the row actually overflows would catch 939 too, which is the one
  // arrangement that must not move. Below 700 the shell is already one column,
  // i.e. already a phone, which is the same decision about the same device; a
  // second constant a hundred px away would be two names for it and would drift.
  const rowStack = singleColumn
  const compact = narrow || short
  return {
    compact,
    // The drawer is a width decision: a short-but-wide window still has room for
    // the inspector beside the content, and hiding it there would cost a column
    // the reader can afford.
    sideAsDrawer: narrow,
    singleColumn,
    timelineH: short ? TIMELINE_H_COMPACT : TIMELINE_H,
    rowStack,
    // The folded phone needs this regardless (it is `rowStack`'s whole point),
    // but the unfolded foldable needs it too and `rowStack` must not move there.
    // The gap between the two pointer sizes (911 vs 947, see
    // `COARSE_TRANSPORT_MIN_W`) straddles 939, so width alone cannot be the
    // condition without either missing the real device or catching a mouse
    // window resized to the same width — a breakpoint on `w` here would be a
    // guess about a dimension that is not actually what overflowed. Reading the
    // pointer type instead is the honest version of the same decision. A fine
    // pointer is left wrapping at this width on purpose: a mouse has no
    // comfortable gesture for a sideways scroll, so turning this on for it would
    // swap one awkwardness for a worse one; a touchscreen already has the
    // gesture, verified in `.superpowers/sdd/folded-layout/report.md` section 5.
    transportScroll: rowStack || (coarsePointer && w < COARSE_TRANSPORT_MIN_W),
    // Size alone, for the reasons in `cameraPad`'s own comment: the pad measures
    // the same at either pointer, so there is nothing for the pointer to decide.
    cameraPad: !compact,
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
  const one = ONE_COLUMN
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

/**
 * One control of the transport row, named rather than positioned.
 *
 * The row's contents are the same at every size and only their order changes, so
 * the order is a value this module returns and `Transport.tsx` maps to elements.
 * That keeps the arrangement testable here, with the rest of the arrangement.
 */
export type TransportItem =
  | 'prevExch' | 'prevEv' | 'minusSlot' | 'minusUs'
  | 'play'
  | 'plusUs' | 'plusSlot' | 'nextEv' | 'nextExch'
  | 'time' | 'busy' | 'speed'

/** The desktop row: the steps straddle play, and the readouts trail on the right. */
const TRANSPORT_WIDE: readonly TransportItem[] = [
  'prevExch', 'prevEv', 'minusSlot', 'minusUs',
  'play',
  'plusUs', 'plusSlot', 'nextEv', 'nextExch',
  'time', 'busy', 'speed',
]

/**
 * The stacked row, in the order it was asked for: the time, play and the speed
 * first, everything else to their right. Those three are what a reader reaches
 * for while watching, and this row scrolls, so they are the three that must be
 * on screen before it is scrolled at all.
 */
const TRANSPORT_STACKED: readonly TransportItem[] = [
  'time', 'play', 'speed', 'busy',
  'prevExch', 'prevEv', 'minusSlot', 'minusUs',
  'plusUs', 'plusSlot', 'nextEv', 'nextExch',
]

/** The transport's controls left to right, for a stacked row or a wide one. */
export function transportOrder(rowStack: boolean): TransportItem[] {
  return [...(rowStack ? TRANSPORT_STACKED : TRANSPORT_WIDE)]
}
