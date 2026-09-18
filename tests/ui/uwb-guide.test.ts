/**
 * The learner-facing reference text for the UWB ranging engine: the Guide's
 * section 11, the glossary's `uwb` group and the README's conformance rows.
 * Text is a deliverable like any other here — a term the engine has but the
 * glossary has not is a hole in the course, so the shape is pinned by a test.
 */
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import { GuideEn, GuideZh } from '../../src/ui/Guide'
import { GLOSSARY } from '../../src/ui/glossary'

const README = readFileSync(new URL('../../README.md', import.meta.url), 'utf8')

/** zustand's SSR snapshot is the store's *initial* state, so a server render cannot be
 * steered by `setLang`: render the two language bodies the `Guide` switch chooses between. */
function renderGuide(lang: 'en' | 'zh'): string {
  return renderToStaticMarkup(createElement(lang === 'zh' ? GuideZh : GuideEn))
}

/** A string that carries at least one CJK ideograph. */
const hasCjk = (s: string): boolean => /[一-鿿]/.test(s)

describe('UWB glossary group', () => {
  const group = GLOSSARY.find((g) => g.id === 'uwb')

  it('exists and is titled in both languages', () => {
    expect(group).toBeDefined()
    expect(group?.title.en).toBeTruthy()
    expect(group?.title.zh).toBeTruthy()
    expect(hasCjk(group?.title.zh ?? '')).toBe(true)
  })

  it('carries at least 18 terms', () => {
    expect(group?.items.length ?? 0).toBeGreaterThanOrEqual(18)
  })

  it('covers every term the ranging engine exposes', () => {
    const terms = (group?.items ?? []).map((i) => i.term).join(' | ').toLowerCase()
    for (const t of [
      'uwb', 'hrp uwb phy', 'rmarker', 'rctu', 'rstu', 'sts', 'sp1',
      'ss-twr', 'ds-twr', 'ranging block', 'ranging round', 'ranging slot',
      'controller', 'controlee', 'initiator', 'responder',
      'rrti ie', 'rmi ie', 'arc ie', 'rdm ie', 'fom', 'nlos', 'gdop', 'error ellipse',
    ]) {
      expect(terms, `missing term: ${t}`).toContain(t)
    }
  })

  it('is bilingual in every item, with real Chinese', () => {
    for (const item of group?.items ?? []) {
      expect(item.alt.en, `${item.term}.alt.en`).toBeTruthy()
      expect(item.alt.zh, `${item.term}.alt.zh`).toBeTruthy()
      expect(item.def.en, `${item.term}.def.en`).toBeTruthy()
      expect(item.def.zh, `${item.term}.def.zh`).toBeTruthy()
      expect(hasCjk(item.def.zh), `${item.term}.def.zh is not Chinese`).toBe(true)
      expect(item.def.zh, `${item.term}.def.zh is the English text`).not.toBe(item.def.en)
    }
  })

  it('quotes the engine values a learner would otherwise have to guess', () => {
    const text = (group?.items ?? []).map((i) => `${i.alt.en} ${i.def.en}`).join(' ')
    expect(text).toContain('15.650 ps')
    expect(text).toContain('833.333 ns')
    expect(text).toContain('73.269 µs')
  })
})

describe('Guide section 11', () => {
  it('renders the EN heading', () => {
    expect(renderGuide('en')).toContain('11 · UWB ranging')
  })

  it('renders the ZH heading', () => {
    expect(renderGuide('zh')).toContain('11 · UWB 测距')
  })

  it('states the ellipse draw factor and that the inspector shows the true axes', () => {
    const en = renderGuide('en')
    expect(en).toContain('10×')
    expect(en.toLowerCase()).toContain('inspector')
    expect(renderGuide('zh')).toContain('10×')
  })

  it('quotes the session defaults the engine runs', () => {
    const en = renderGuide('en')
    expect(en).toContain('200 ms')
    expect(en).toContain('2 ms')
  })
})

describe('README', () => {
  it('has the UWB conformance heading', () => {
    expect(README).toContain('802.15.4-2024 HRP UWB ranging')
  })

  it('cites the ranging clauses in its table', () => {
    for (const clause of ['§10.29.1.1', '§10.29.1.4', '§10.29.1.5', '§10.29.1.2.2', '§10.29.1.2.4', '§10.29.1.7', '§10.32.2', '§16.2']) {
      expect(README, `missing clause: ${clause}`).toContain(clause)
    }
  })

  it('records the UWB simplifications', () => {
    expect(README).toContain('no CCA')
    expect(README).toMatch(/AoA/)
  })
})
