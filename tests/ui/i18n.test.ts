import { describe, it, expect } from 'vitest'
import { STRINGS } from '../../src/ui/i18n'
import type { FrameKind } from '../../src/model/frames'
import { DEFAULT_UWB_SESSION } from '../../src/model/scenario'
import { C_M_PER_NS } from '../../src/uwb/phy'
import { rangeSigmaM } from '../../src/uwb/position'

const KINDS: FrameKind[] = ['data', 'ack', 'rts', 'cts', 'ba', 'trigger', 'mba', 'ampTrigger', 'ampAck', 'ampResp']
const LANGS = ['en', 'zh'] as const

describe('frameDetail strings', () => {
  it.each(LANGS)('%s covers every frame kind with non-empty text', (lang) => {
    const fd = STRINGS[lang].frameDetail
    for (const k of KINDS) {
      expect(fd.kindName[k], `kindName.${k}`).toBeTruthy()
      expect(fd.whatIs[k], `whatIs.${k}`).toBeTruthy()
      expect(fd.next[k], `next.${k}`).toBeTruthy()
    }
  })
})

describe('band strings', () => {
  it.each(LANGS)('%s names every link in the editor and the inspector', (lang) => {
    for (const l of ['2g', '5g', '6g'] as const) {
      expect(STRINGS[lang].editor.bands[l]).toBeTruthy()
      expect(STRINGS[lang].inspector.linkName[l]).toBeTruthy()
    }
  })
})

describe('UWB editor hints', () => {
  const ps = DEFAULT_UWB_SESSION.tsNoisePs // 100
  /** What the panels, the Guide, the glossary and the lessons all call the range sigma. */
  const range = `${(rangeSigmaM(ps) * 100).toFixed(1)} cm`
  /** …against the raw flight distance of the same timing error, which is not the same number. */
  const flight = `${(C_M_PER_NS * (ps / 1000) * 100).toFixed(0)} cm`

  it.each(LANGS)('%s quotes the range sigma beside the flight distance, not instead of it', (lang) => {
    const hint = STRINGS[lang].editor.uwbTsNoiseHint
    expect(range).toBe('2.1 cm')
    expect(flight).toBe('3 cm')
    expect(hint, 'flight').toContain(flight)
    expect(hint, 'range').toContain(range)
    expect(hint).toContain(`${ps} ps`)
  })
})
