import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

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
    expect(src).toMatch(/const ONE_COLUMN = 'minmax\(0, 1fr\)'/)
  })
})
