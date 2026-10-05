import { describe, it, expect } from 'vitest'
import { STRINGS } from '../../src/ui/i18n'
import { FRAME_KINDS } from '../../src/model/frames'
import { DEFAULT_UWB_SESSION } from '../../src/model/scenario'
import { C_M_PER_NS } from '../../src/uwb/phy'
import { rangeSigmaM } from '../../src/uwb/position'

/** Every kind the engine can emit, from the one list `FrameKind` itself is derived from — a
 * hand-written copy here had gone stale by six kinds before it was noticed. */
const KINDS = FRAME_KINDS

describe('frameDetail strings', () => {
  it('walks every frame kind the engine can emit, not a hand-kept subset', () => {
    expect(KINDS.length).toBeGreaterThanOrEqual(23)
    expect(KINDS).toContain('ampRfid')
    expect(KINDS).toContain('ampBsReply')
    expect(new Set(KINDS).size).toBe(KINDS.length)
  })

  it('covers every frame kind with non-empty text', () => {
    const fd = STRINGS.frameDetail
    for (const k of KINDS) {
      expect(fd.kindName[k], `kindName.${k}`).toBeTruthy()
      expect(fd.whatIs[k], `whatIs.${k}`).toBeTruthy()
      expect(fd.next[k], `next.${k}`).toBeTruthy()
    }
  })
})

describe('band strings', () => {
  it('names every link in the editor and the inspector', () => {
    for (const l of ['2g', '5g', '6g'] as const) {
      expect(STRINGS.editor.bands[l]).toBeTruthy()
      expect(STRINGS.inspector.linkName[l]).toBeTruthy()
    }
  })
})

describe('UWB editor hints', () => {
  const ps = DEFAULT_UWB_SESSION.tsNoisePs // 100
  /** What the panels, the Guide, the glossary and the lessons all call the range sigma. */
  const range = `${(rangeSigmaM(ps) * 100).toFixed(1)} cm`
  /** …against the raw flight distance of the same timing error, which is not the same number. */
  const flight = `${(C_M_PER_NS * (ps / 1000) * 100).toFixed(0)} cm`

  it('quotes the range sigma beside the flight distance, not instead of it', () => {
    const hint = STRINGS.editor.uwbTsNoiseHint
    expect(range).toBe('2.1 cm')
    expect(flight).toBe('3 cm')
    expect(hint, 'flight').toContain(flight)
    expect(hint, 'range').toContain(range)
    expect(hint).toContain(`${ps} ps`)
  })
})

/**
 * The header's short labels, pinned to the full ones they stand in for.
 *
 * They exist because 470 px cannot hold seven labelled controls: measured at
 * `index.css`'s coarse-pointer sizes the row wanted 441 px and had 283, and it
 * is a `.hscroll`, so two of the three mode buttons simply scrolled out of
 * sight behind a hidden scrollbar. Two strings for one control is two places
 * for a rename to land in, so the relationship is asserted rather than trusted:
 * the mode's short form is its full label minus the leading mark, and the two
 * utilities' short form IS that leading mark.
 */
describe('the one-column header labels', () => {
  const S = STRINGS.compact.short

  /** A label's leading mark and the word after it — `'✎ 编辑'` → `['✎', '编辑']`. */
  const split = (label: string): [string, string] => {
    const i = label.indexOf(' ')
    expect(i, label).toBeGreaterThan(0)
    return [label.slice(0, i), label.slice(i + 1)]
  }

  it('gives each mode button the word out of its own full label', () => {
    for (const [full, shortForm] of [
      [STRINGS.header.edit, S.edit],
      [STRINGS.header.simulate, S.simulate],
      [STRINGS.header.course, S.course],
    ] as const) {
      const [mark, word] = split(full)
      expect(shortForm, full).toBe(word)
      expect(shortForm, full).not.toContain(mark)
      expect(full, 'the long form is still the one with the mark').toBe(`${mark} ${shortForm}`)
    }
  })

  it('gives each utility button the mark out of its own full label', () => {
    for (const [full, shortForm] of [
      [STRINGS.compact.openSide, S.openSide],
      [STRINGS.panel.guide, S.guide],
    ] as const) {
      const [mark] = split(full)
      expect(shortForm, full).toBe(mark)
      expect(full.startsWith(`${shortForm} `), full).toBe(true)
    }
  })

  it('is shorter than what it replaces — that is the entire reason it exists', () => {
    const fulls = [STRINGS.compact.openSide, STRINGS.panel.guide,
      STRINGS.header.edit, STRINGS.header.simulate, STRINGS.header.course]
    const shorts = [S.openSide, S.guide, S.edit, S.simulate, S.course]
    for (let i = 0; i < fulls.length; i++) {
      expect(shorts[i].length, fulls[i]).toBeLessThan(fulls[i].length)
    }
    // Together they are what has to fit, so the sum is the figure that matters.
    expect(shorts.join('').length).toBeLessThan(fulls.join('').length / 2)
  })
})
