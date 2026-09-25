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
