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
  COMPACT_H, COMPACT_W, SINGLE_W, TIMELINE_H, TIMELINE_H_COMPACT,
  layoutFor, mainColumns, type MainPane,
} from '../../src/ui/layout'

/** The viewport this module was written for. */
const FOLDABLE = { w: 939, h: 511 }
/** A desktop window, which must come out exactly as it did before this module. */
const DESKTOP = { w: 1920, h: 1080 }

describe('layoutFor', () => {
  it('leaves a desktop window alone', () => {
    const l = layoutFor(DESKTOP.w, DESKTOP.h)
    expect(l).toEqual({
      compact: false, sideAsDrawer: false, singleColumn: false, timelineH: TIMELINE_H,
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
