import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { ONE_COLUMN } from '../../src/ui/layout'

/**
 * A row-only CSS grid gets an implicit `auto` column, which is as wide as its
 * widest child wants to be. The 3-D viewport's canvas carries the pixel width
 * it was last given, so an `auto` column latches at that width and the viewer
 * paints over the column beside it when the course column is widened. Every
 * grid in the shell states its single column so the column can never exceed
 * the grid item.
 */
describe('App layout grids', () => {
  const src = readFileSync(new URL('../../src/ui/App.tsx', import.meta.url), 'utf8')

  const styleObjects = (): string[] => {
    const out: string[] = []
    for (let i = src.indexOf("display: 'grid'"); i >= 0; i = src.indexOf("display: 'grid'", i + 1)) {
      const open = src.lastIndexOf('style={{', i)
      const close = src.indexOf('}}', i)
      expect(open).toBeGreaterThanOrEqual(0)
      expect(close).toBeGreaterThan(i)
      out.push(src.slice(open, close))
    }
    return out
  }

  it('finds every grid container in the shell', () => {
    expect(styleObjects().length).toBeGreaterThanOrEqual(5)
  })

  it('states a bounded column for every grid container', () => {
    for (const style of styleObjects()) {
      expect(style).toMatch(/gridTemplateColumns:/)
    }
  })

  it('keeps the single-column value bounded below by zero', () => {
    // The string itself moved to `layout.ts`, so that the editor — whose own
    // row-only grid had the same defect, with its own symptom — states the same
    // column rather than a second copy of it. What this file can still check is
    // that the shell takes it from there and does not re-declare it.
    expect(src).toMatch(/import \{[^}]*\bONE_COLUMN\b[^}]*\} from '\.\/layout'/s)
    expect(src).not.toMatch(/const ONE_COLUMN =/)
    expect(ONE_COLUMN).toBe('minmax(0, 1fr)')
  })
})

/**
 * The player's two strips — the timeline and the control row — are rendered in
 * one order for every viewport: the timeline, then the controls. The shell used
 * to swap them in its stacked arrangement, which left the folded phone the only
 * size with the controls above the timeline; the reader asked for the controls at
 * the bottom everywhere, so there is no longer a branch to get wrong. This reads
 * the source rather than a render because the order is no longer a decision any
 * function returns — a test of `layout.ts` could only assert that nothing there
 * mentions it, which is not the same thing.
 */
describe("the player's two strips", () => {
  const src = readFileSync(new URL('../../src/ui/App.tsx', import.meta.url), 'utf8')

  /** The `playerRows` value: from its declaration to the `return (` that follows it. */
  const playerRows = (): string => {
    const open = src.indexOf('const playerRows =')
    expect(open).toBeGreaterThanOrEqual(0)
    const close = src.indexOf('\n  return (', open)
    expect(close).toBeGreaterThan(open)
    return src.slice(open, close)
  }

  it('renders each strip exactly once, so there is only one arrangement', () => {
    const body = playerRows()
    expect(body.match(/TimelineStrip/g)).toHaveLength(1)
    expect(body.match(/\{transport\}/g)).toHaveLength(1)
  })

  it('puts the timeline above the control row', () => {
    const body = playerRows()
    expect(body.indexOf('TimelineStrip')).toBeLessThan(body.indexOf('{transport}'))
  })

  it('does not branch on the arrangement to decide the order', () => {
    expect(playerRows()).not.toMatch(/rowStack/)
  })
})
