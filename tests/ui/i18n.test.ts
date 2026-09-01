import { describe, it, expect } from 'vitest'
import { STRINGS } from '../../src/ui/i18n'
import type { FrameKind } from '../../src/model/frames'

const KINDS: FrameKind[] = ['data', 'ack', 'rts', 'cts', 'ba', 'trigger', 'mba']
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
