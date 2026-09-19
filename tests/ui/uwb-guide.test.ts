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
import { DEFAULT_UWB_SESSION } from '../../src/model/scenario'
import { GuideEn, GuideZh } from '../../src/ui/Guide'
import { GLOSSARY } from '../../src/ui/glossary'
import {
  COUNTER_MOD, FOM_LOS, FOM_NLOS, RCTU_NS, UWB_BAND_MHZ, UWB_MAX_ANCHORS, UWB_MAX_INPUT_DBM_PER_MHZ,
  UWB_RX_SENS_DBM, UWB_SIR_MIN_DB, UWB_TX_POWER_DBM,
  fomDecode, fomText, rstuNs, uwbFinalBytes, uwbSlotsPerTag,
} from '../../src/uwb/phy'
import { rangeSigmaM } from '../../src/uwb/position'
import { ELLIPSE_DRAW_SCALE } from '../../src/uwb/scene'

const README = readFileSync(new URL('../../README.md', import.meta.url), 'utf8')

/** The prose writes a Unicode minus, not an ASCII hyphen. */
const dbm = (v: number): string => `${v} dBm`.replace('-', '−')
/** Same, for a bare dB figure (the coexistence SIR floor, not a power level). */
const db = (v: number): string => `${v} dB`.replace('-', '−')
/** A schedule figure as the prose states it: `rstuNs` is the one definition of an RSTU. */
const ms = (rstu: number): string => `${rstuNs(rstu) / 1e6} ms`

const SIGMA_CM = `${(rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs) * 100).toFixed(1)} cm`
const COUNTER_WRAP_S = `${((COUNTER_MOD * RCTU_NS) / 1e9).toFixed(1)} s`

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
    expect(en).toContain(`${ELLIPSE_DRAW_SCALE}×`)
    expect(en.toLowerCase()).toContain('inspector')
    expect(renderGuide('zh')).toContain(`${ELLIPSE_DRAW_SCALE}×`)
  })

  it('the glossary and the README quote the same factor, so it is never retyped stale', () => {
    // The constant has already moved once (3 → 10); every place that names it is pinned to it.
    const ellipse = (GLOSSARY.find((g) => g.id === 'uwb')?.items ?? [])
      .filter((i) => i.term.toLowerCase().includes('ellipse'))
    expect(ellipse.length).toBeGreaterThan(0)
    for (const i of ellipse) {
      for (const text of [i.alt.en, i.alt.zh, i.def.en, i.def.zh]) {
        expect(text, i.term).toContain(`${ELLIPSE_DRAW_SCALE}×`)
      }
    }
    expect(README).toContain(`drawn at ${ELLIPSE_DRAW_SCALE}×`)
  })
})

/**
 * Prose drifts silently when a constant moves, so every figure the text quotes that the engine
 * also computes is asserted against the engine rather than against a literal: change the constant
 * and the doc test fails instead of the text quietly becoming false.
 */
describe('figures pinned to the engine', () => {
  const en = renderGuide('en')
  const zh = renderGuide('zh')
  const all = [en, zh, README]

  it('quotes the session defaults from DEFAULT_UWB_SESSION', () => {
    for (const text of all) {
      expect(text).toContain(ms(DEFAULT_UWB_SESSION.blockRstu)) // 200 ms
      expect(text).toContain(ms(DEFAULT_UWB_SESSION.slotRstu)) // 2 ms
      expect(text).toContain(`${DEFAULT_UWB_SESSION.tsNoisePs} ps`)
      expect(text).toContain(`${DEFAULT_UWB_SESSION.cfoNoisePpm} ppm`)
    }
  })

  it('quotes the link budget from the PHY constants', () => {
    for (const text of all) {
      expect(text).toContain(dbm(UWB_TX_POWER_DBM)) // −14 dBm
      expect(text).toContain(dbm(UWB_RX_SENS_DBM)) // −93 dBm
    }
  })

  it('quotes the range sigma the solver is given', () => {
    for (const text of all) expect(text).toContain(SIGMA_CM) // 2.1 cm
  })

  it('quotes the FoM texts the engine decodes', () => {
    // English prose quotes fomText verbatim; the Chinese translates the sentence, so there only
    // the two decoded numbers — the parts that rot when a table entry moves — are pinned.
    expect(fomText(FOM_LOS)).toBe('97 % within 0.5 ns')
    expect(fomText(FOM_NLOS)).toBe('75 % within 12 ns')
    for (const text of [en, README]) {
      expect(text).toContain(fomText(FOM_LOS))
      expect(text).toContain(fomText(FOM_NLOS))
    }
    for (const fom of [FOM_LOS, FOM_NLOS]) {
      const { levelPct, intervalNs } = fomDecode(fom)
      expect(zh).toContain(`${levelPct} %`)
      expect(zh).toContain(`${intervalNs} ns`)
    }
  })

  it('states the round shape the scheduler builds', () => {
    // The Guide and the README both write the DS round as "2N + 2" slots.
    expect(uwbSlotsPerTag('ds', 4)).toBe(2 * 4 + 2)
    expect(uwbSlotsPerTag('ss', 4)).toBe(4 + 1)
    for (const text of all) expect(text).toContain('2N + 2')
    expect(README).toContain('N + 1')
  })

  it('states the Final size and the anchor limit the frame builder imposes', () => {
    // The README writes the Final as "14 + 12N" octets; that is uwbFinalBytes.
    for (const n of [1, 4, UWB_MAX_ANCHORS]) expect(uwbFinalBytes(n)).toBe(14 + 12 * n)
    expect(README).toContain('14 + 12N')
    expect(README).toContain(`≤ ${UWB_MAX_ANCHORS} anchors`)
  })

  it('states the counter width as a model choice, with its wrap', () => {
    expect(README).toContain(COUNTER_WRAP_S) // 17.2 s
    const row = README.split('\n').find((l) => l.includes(COUNTER_WRAP_S)) ?? ''
    expect(row, 'the counter-width row must be tagged model, not a clause').toContain('| model |')
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

describe('6 GHz coexistence', () => {
  const en = renderGuide('en')
  const zh = renderGuide('zh')

  it('the Guide states the SIR floor and the UWB channel-5 band edges from the engine constants', () => {
    for (const text of [en, zh]) {
      expect(text).toContain(db(UWB_SIR_MIN_DB)) // −12 dB
      expect(text).toContain(`${UWB_BAND_MHZ[5].lo}`) // 6240
      expect(text).toContain(`${UWB_BAND_MHZ[5].hi}`) // 6739.2
    }
  })

  it('the glossary carries the four coexistence terms, bilingual', () => {
    const group = GLOSSARY.find((g) => g.id === 'uwb')
    const terms = (group?.items ?? []).map((i) => i.term.toLowerCase())
    for (const t of ['in-band interference', 'sir', 'noise rise', '6 ghz channel']) {
      expect(terms.some((x) => x.includes(t)), `missing glossary term: ${t}`).toBe(true)
    }
    const sirItem = group?.items.find((i) => i.term.toLowerCase() === 'sir')
    expect(sirItem).toBeDefined()
    for (const text of [sirItem?.alt.en, sirItem?.alt.zh, sirItem?.def.en, sirItem?.def.zh]) {
      expect(text).toContain(db(UWB_SIR_MIN_DB))
    }
    for (const text of [sirItem?.def.en, sirItem?.def.zh]) {
      expect(text).toContain(`${UWB_MAX_INPUT_DBM_PER_MHZ}`.replace('-', '−'))
      expect(text).toContain('§16.4.10')
    }
  })

  it('the README carries the §16.4.10 row for the receiver maximum input', () => {
    expect(README).toContain('§16.4.10')
    const row = README.split('\n').find((l) => l.includes('§16.4.10')) ?? ''
    expect(row, 'the §16.4.10 row must be tagged standard').toContain('| standard §16.4.10 |')
  })
})
