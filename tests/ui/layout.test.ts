/**
 * The shell's arrangement is a decision about numbers, so it is tested as one.
 *
 * The case that drove this module is a foldable phone unfolded: 939 x 511 CSS
 * px, wide enough for two columns and far too short for the desktop timeline.
 * It appears below by name, because a breakpoint with no real device behind it
 * is a guess, and the next person to move one should see what moved with it.
 */
import { describe, expect, it } from 'vitest'
import {
  COARSE_TRANSPORT_MIN_W, COMPACT_H, COMPACT_W, SINGLE_W, TIMELINE_H, TIMELINE_H_COMPACT,
  layoutFor, mainColumns, transportOrder, type MainPane, type TransportItem,
} from '../../src/ui/layout'

/** The viewport this module was written for. */
const FOLDABLE = { w: 939, h: 511 }
/** The same phone shut: half the width, the same height. */
const FOLDED = { w: 470, h: 511 }
/** A desktop window, which must come out exactly as it did before this module. */
const DESKTOP = { w: 1920, h: 1080 }

describe('layoutFor', () => {
  it('leaves a desktop window alone', () => {
    const l = layoutFor(DESKTOP.w, DESKTOP.h)
    expect(l).toEqual({
      compact: false, sideAsDrawer: false, singleColumn: false, timelineH: TIMELINE_H,
      rowStack: false, transportScroll: false,
    })
  })

  it('treats the unfolded foldable as compact, with the side panel as a drawer', () => {
    const l = layoutFor(FOLDABLE.w, FOLDABLE.h)
    expect(l.compact).toBe(true)
    expect(l.sideAsDrawer).toBe(true)
    expect(l.singleColumn).toBe(false)
  })

  it('gives the foldable a shorter timeline, because 190 of 511 is not affordable', () => {
    expect(layoutFor(FOLDABLE.w, FOLDABLE.h).timelineH).toBe(TIMELINE_H_COMPACT)
    expect(TIMELINE_H_COMPACT).toBeLessThan(TIMELINE_H)
  })

  it('reads width and height independently', () => {
    // wide but short: the timeline shrinks, the columns stay
    const shortWide = layoutFor(1600, 500)
    expect(shortWide.timelineH).toBe(TIMELINE_H_COMPACT)
    expect(shortWide.sideAsDrawer).toBe(false)
    // narrow but tall: the columns give way, the timeline keeps its height
    const tallNarrow = layoutFor(900, 1200)
    expect(tallNarrow.sideAsDrawer).toBe(true)
    expect(tallNarrow.timelineH).toBe(TIMELINE_H)
  })

  it('falls to one column only below the single-column width', () => {
    expect(layoutFor(SINGLE_W, 800).singleColumn).toBe(false)
    expect(layoutFor(SINGLE_W - 1, 800).singleColumn).toBe(true)
  })

  it('switches exactly at each breakpoint and not before', () => {
    expect(layoutFor(COMPACT_W, 800).sideAsDrawer).toBe(false)
    expect(layoutFor(COMPACT_W - 1, 800).sideAsDrawer).toBe(true)
    expect(layoutFor(1600, COMPACT_H).timelineH).toBe(TIMELINE_H)
    expect(layoutFor(1600, COMPACT_H - 1).timelineH).toBe(TIMELINE_H_COMPACT)
    expect(layoutFor(SINGLE_W, 511).rowStack).toBe(false)
    expect(layoutFor(SINGLE_W - 1, 511).rowStack).toBe(true)
  })

  it('stacks the player on the folded phone and nowhere the unfolded one goes', () => {
    expect(layoutFor(FOLDED.w, FOLDED.h).rowStack).toBe(true)
    // The two arrangements that were tuned by hand and confirmed by the reader.
    expect(layoutFor(FOLDABLE.w, FOLDABLE.h).rowStack).toBe(false)
    expect(layoutFor(DESKTOP.w, DESKTOP.h).rowStack).toBe(false)
  })

  it('stacks on height alone for no viewport', () => {
    // A short desktop window is not a phone: its transport has room for one row
    // and a mouse has no good way to scroll one sideways.
    expect(layoutFor(1600, 500).rowStack).toBe(false)
    // and a tall phone is still a phone
    expect(layoutFor(412, 800).rowStack).toBe(true)
  })
})

describe('transportScroll', () => {
  it('is always true where rowStack is, no matter the pointer', () => {
    expect(layoutFor(FOLDED.w, FOLDED.h).transportScroll).toBe(true)
    expect(layoutFor(FOLDED.w, FOLDED.h, false).transportScroll).toBe(true)
    expect(layoutFor(FOLDED.w, FOLDED.h, true).transportScroll).toBe(true)
  })

  it('leaves a mouse pointer wrapping at every width, including the unfolded foldable', () => {
    // No third argument at all — the default a caller gets before it has
    // measured anything — must read as a mouse, not as a guess either way.
    expect(layoutFor(FOLDABLE.w, FOLDABLE.h).transportScroll).toBe(false)
    expect(layoutFor(FOLDABLE.w, FOLDABLE.h, false).transportScroll).toBe(false)
    // Even well below the coarse-pointer threshold, a mouse gets no scrolling
    // row: it has no comfortable gesture for one, so wrapping is still the
    // better of the two awkward choices for it.
    expect(layoutFor(COARSE_TRANSPORT_MIN_W - 1, 511, false).transportScroll).toBe(false)
  })

  it('turns the unfolded foldable into a scrolling row on a real touch pointer', () => {
    // This is the viewport and the pointer the brief measured: 939 is short of
    // the 947 px the row wants at `pointer: coarse` sizes.
    expect(layoutFor(FOLDABLE.w, FOLDABLE.h, true).transportScroll).toBe(true)
  })

  it('switches exactly at the coarse-pointer width and not before', () => {
    expect(layoutFor(COARSE_TRANSPORT_MIN_W, 511, true).transportScroll).toBe(false)
    expect(layoutFor(COARSE_TRANSPORT_MIN_W - 1, 511, true).transportScroll).toBe(true)
  })

  it('leaves a wide touchscreen alone: the row already fits', () => {
    expect(layoutFor(1440, 900, true).transportScroll).toBe(false)
  })
})

describe('transportOrder', () => {
  const ALL: TransportItem[] = [
    'prevExch', 'prevEv', 'minusSlot', 'minusUs', 'play',
    'plusUs', 'plusSlot', 'nextEv', 'nextExch', 'time', 'busy', 'speed',
  ]

  it('puts the time, play and the speed leftmost when stacked, in that order', () => {
    expect(transportOrder(true).slice(0, 3)).toEqual(['time', 'play', 'speed'])
  })

  it('leaves the wide row as it was: steps around play, readouts trailing', () => {
    expect(transportOrder(false)).toEqual([
      'prevExch', 'prevEv', 'minusSlot', 'minusUs',
      'play',
      'plusUs', 'plusSlot', 'nextEv', 'nextExch',
      'time', 'busy', 'speed',
    ])
  })

  it('shows every control in both orders, so neither hides one', () => {
    for (const stacked of [false, true]) {
      const order = transportOrder(stacked)
      expect(order).toHaveLength(ALL.length)
      expect([...order].sort()).toEqual([...ALL].sort())
    }
  })

  it('keeps the step buttons in time order either way', () => {
    // −exchange … −µs … +µs … +exchange reads as one axis; a reordering that
    // crossed them would put "back" to the right of "forward".
    for (const stacked of [false, true]) {
      const order = transportOrder(stacked)
      const at = (id: TransportItem): number => order.indexOf(id)
      expect(at('prevExch')).toBeLessThan(at('prevEv'))
      expect(at('prevEv')).toBeLessThan(at('minusSlot'))
      expect(at('minusSlot')).toBeLessThan(at('minusUs'))
      expect(at('plusUs')).toBeLessThan(at('plusSlot'))
      expect(at('plusSlot')).toBeLessThan(at('nextEv'))
      expect(at('nextEv')).toBeLessThan(at('nextExch'))
      expect(at('minusUs')).toBeLessThan(at('plusUs'))
    }
  })

  it('hands back a copy, so a caller cannot reorder the next caller\'s row', () => {
    const a = transportOrder(true)
    a.reverse()
    expect(transportOrder(true)[0]).toBe('time')
  })
})

describe('mainColumns', () => {
  const desktop = layoutFor(DESKTOP.w, DESKTOP.h)
  const foldable = layoutFor(FOLDABLE.w, FOLDABLE.h)
  const phone = layoutFor(400, 800)

  it('is unchanged on a desktop, in all three modes', () => {
    expect(mainColumns('edit', desktop, 360, 'course')).toBe('minmax(0, 1fr)')
    expect(mainColumns('simulate', desktop, 360, 'course'))
      .toBe('minmax(0, 1fr) minmax(320px, 400px)')
    expect(mainColumns('course', desktop, 360, 'course'))
      .toBe('360px minmax(0, 1fr) minmax(300px, 360px)')
  })

  it('gives simulate mode the whole width once the side panel is a drawer', () => {
    expect(mainColumns('simulate', foldable, 360, 'course')).toBe('minmax(0, 1fr)')
  })

  it('gives the lesson the larger share of the foldable, not the smaller', () => {
    // the defect this exists to fix: at 939 the desktop template gave the lesson
    // 279px, the least of the three columns
    expect(mainColumns('course', foldable, 360, 'course')).toBe('minmax(0, 1.4fr) minmax(0, 1fr)')
  })

  it('puts the larger share on whichever pane is the main one', () => {
    expect(mainColumns('course', foldable, 360, 'view')).toBe('minmax(0, 1fr) minmax(0, 1.4fr)')
  })

  it('is one column on a phone whatever the mode or pane', () => {
    for (const mode of ['edit', 'simulate', 'course'] as const) {
      for (const pane of ['course', 'view'] as MainPane[]) {
        expect(mainColumns(mode, phone, 360, pane)).toBe('minmax(0, 1fr)')
      }
    }
  })

  it('never emits a bare 1fr for a flexible column', () => {
    // `1fr` is `minmax(auto, 1fr)`, and `auto` lets the 3-D canvas push its
    // neighbours off screen — the overflow bug this template already had once
    for (const layout of [desktop, foldable, phone]) {
      for (const mode of ['edit', 'simulate', 'course'] as const) {
        const cols = mainColumns(mode, layout, 360, 'course')
        expect(cols, cols).not.toMatch(/(^|\s)1fr(\s|$)/)
      }
    }
  })
})
