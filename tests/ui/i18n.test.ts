import { describe, it, expect } from 'vitest'
import { STRINGS } from '../../src/ui/i18n'
import type { FrameKind } from '../../src/model/frames'

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
