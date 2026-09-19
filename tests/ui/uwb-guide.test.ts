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
import { CCA_ED_DBM } from '../../src/engine/phy'
import { DEFAULT_UWB_SESSION } from '../../src/model/scenario'
import { GuideEn, GuideZh } from '../../src/ui/Guide'
import { GLOSSARY } from '../../src/ui/glossary'
import { AOA_SIGMA_CLAMP_DEG, AOA_SIGMA_PHI_RAD, aoaSigmaDeg, antennaSpacingM } from '../../src/uwb/aoa'
import {
  COUNTER_MOD, FOM_LOS, FOM_NLOS, RCTU_NS, UWB_BAND_MHZ, UWB_BLINK_BYTES, UWB_CAPTURE_DB, UWB_MAX_ANCHORS,
  UWB_MAX_INPUT_DBM_PER_MHZ, UWB_PL_EXP, UWB_RX_SENS_DBM, UWB_SIR_MIN_DB, UWB_TX_POWER_DBM,
  fomDecode, fomText, rstuNs, uwbFinalBytes, uwbInBandDbm, uwbPl0Db, uwbSlotsPerTag,
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

  // The claim that Wi-Fi's CCA "never" fires on UWB power is only true past a distance: a UWB
  // channel-5 frame's in-band EIRP inside an 80 MHz Wi-Fi channel fully overlapping it is
  // uwbInBandDbm(UWB_TX_POWER_DBM, 80) ≈ −22 dBm; the UWB→Wi-Fi path loss at distance d is
  // uwbPl0Db(5) + 10·UWB_PL_EXP·log10(d), so the crossover where the received power equals
  // CCA_ED_DBM (−62 dBm, src/engine/phy.ts) solves for d directly from those same constants.
  // Below that distance, a Wi-Fi radio genuinely can see CCA busy from UWB energy, so every
  // "CCA never fires" claim here must be qualified by distance, quoted rounded up to the next
  // 10 cm (0.367 m → "40 cm") rather than stated unconditionally or understated.
  const CCA_UWB_CROSSOVER_M = 10 ** ((uwbInBandDbm(UWB_TX_POWER_DBM, 80) - uwbPl0Db(5) - CCA_ED_DBM) / (10 * UWB_PL_EXP))

  it('the CCA/UWB crossover computed from the engine constants is about 0.37 m', () => {
    expect(CCA_UWB_CROSSOVER_M).toBeGreaterThan(0.36)
    expect(CCA_UWB_CROSSOVER_M).toBeLessThan(0.38)
  })

  it('qualifies "CCA never fires on UWB power" by distance, in the Guide, glossary and README', () => {
    for (const text of [en, zh]) expect(text).toContain('40 cm')
    const noiseRise = (GLOSSARY.find((g) => g.id === 'uwb')?.items ?? [])
      .find((i) => i.term.toLowerCase() === 'noise rise')
    expect(noiseRise).toBeDefined()
    for (const text of [noiseRise?.alt.en, noiseRise?.alt.zh, noiseRise?.def.en, noiseRise?.def.zh]) {
      expect(text).toContain('40 cm')
    }
    const sirRow = README.split('\n').find((l) => l.includes('UWB SIR floor under in-band Wi-Fi')) ?? ''
    expect(sirRow).toContain('40 cm')
  })
})

describe('Contention-based rounds (schedule mode 0)', () => {
  it('quotes the contention defaults and the capture margin, bilingual, from the engine constants', () => {
    for (const text of [renderGuide('en'), renderGuide('zh')]) {
      expect(text).toContain('§10.32.9.5')
      expect(text).toContain('§10.32.9.6')
      expect(text).toContain(`${DEFAULT_UWB_SESSION.contentionSlots}`)
      expect(text).toContain(`${DEFAULT_UWB_SESSION.maxAttempts}`)
      expect(text).toContain(`${UWB_CAPTURE_DB} dB`)
      expect(text).toContain('UWB_CONTEND_COLLISION')
    }
  })

  it('the glossary carries the three contention terms with their clauses, and the README documents schedule mode 0', () => {
    const group = GLOSSARY.find((g) => g.id === 'uwb')
    const terms = (group?.items ?? []).map((i) => i.term.toLowerCase())
    for (const t of ['contention-based ranging', 'rcps ie', 'rcma ie']) {
      expect(terms, `missing glossary term: ${t}`).toContain(t)
    }
    const rcps = group?.items.find((i) => i.term.toLowerCase() === 'rcps ie')
    const rcma = group?.items.find((i) => i.term.toLowerCase() === 'rcma ie')
    for (const item of [rcps, rcma]) {
      expect(item?.alt.en, `${item?.term}.alt.en`).toBeTruthy()
      expect(item?.alt.zh, `${item?.term}.alt.zh`).toBeTruthy()
      expect(hasCjk(item?.alt.zh ?? ''), `${item?.term}.alt.zh is not Chinese`).toBe(true)
    }
    expect(rcps?.def.en).toContain('§10.32.9.5')
    expect(rcps?.def.zh).toContain('§10.32.9.5')
    expect(rcma?.def.en).toContain('§10.32.9.6')
    expect(rcma?.def.zh).toContain('§10.32.9.6')

    expect(README).toContain('schedule mode 0')
    expect(README).toContain('§10.32.9.5')
    expect(README).toContain('§10.32.9.6')
    expect(README).not.toContain('no contention-based ranging round')
  })
})

describe('TDoA modes (one-way ranging, §10.29.1.2.5)', () => {
  it('the Guide states DL-TDoA and UL-TDoA with the engine\'s blink size and default sync error', () => {
    for (const text of [renderGuide('en'), renderGuide('zh')]) {
      expect(text).toContain('§10.29.1.2.5')
      expect(text).toContain('DL-TDoA')
      expect(text).toContain('UL-TDoA')
      expect(text).toContain(`${UWB_BLINK_BYTES}`) // the 14-octet blink
      expect(text).toContain(`${DEFAULT_UWB_SESSION.syncErrorNs} ns`) // 0 ns, wired sync by default
    }
  })

  it('the glossary carries the six TDoA terms, bilingual, cited against §10.29.1.2.5 or model', () => {
    const group = GLOSSARY.find((g) => g.id === 'uwb')
    const terms = (group?.items ?? []).map((i) => i.term.toLowerCase())
    for (const t of ['tdoa', 'dl-tdoa', 'ul-tdoa', 'blink', 'hyperbolic positioning', 'clock-rate correction']) {
      expect(terms, `missing glossary term: ${t}`).toContain(t)
    }
    const tdoa = group?.items.find((i) => i.term.toLowerCase() === 'tdoa')
    expect(tdoa?.def.en).toContain('§10.29.1.2.5')
    expect(tdoa?.def.zh).toContain('§10.29.1.2.5')
    const blink = group?.items.find((i) => i.term.toLowerCase() === 'blink')
    for (const text of [blink?.alt.en, blink?.def.en]) expect(text).toContain(`${UWB_BLINK_BYTES}`)
    const ulTdoa = group?.items.find((i) => i.term.toLowerCase() === 'ul-tdoa')
    for (const text of [ulTdoa?.def.en, ulTdoa?.def.zh]) expect(text).toContain('syncErrorNs')

    expect(README).toContain('| standard §10.29.1.2.5 |')
  })
})

describe('AoA (angle of arrival, §10.29.1.1)', () => {
  const ANTENNA_SPACING_CM = `${(antennaSpacingM(9) * 100).toFixed(1)} cm`
  const SIGMA_BORESIGHT_DEG = `${aoaSigmaDeg(0).toFixed(1)}°`
  const SIGMA_60_DEG = `${aoaSigmaDeg(60).toFixed(1)}°`

  it('the Guide states the phase-difference model and its bearing error from the engine constants', () => {
    for (const text of [renderGuide('en'), renderGuide('zh')]) {
      expect(text).toContain('§10.29.1.1')
      expect(text).toContain(ANTENNA_SPACING_CM)
      expect(text).toContain(`${AOA_SIGMA_PHI_RAD}`)
      expect(text).toContain(SIGMA_BORESIGHT_DEG)
      expect(text).toContain(SIGMA_60_DEG)
      expect(text).toContain(`${AOA_SIGMA_CLAMP_DEG}°`)
    }
  })

  it('the glossary carries the four AoA terms, bilingual, and the README documents AoA as standard plus the PDoA model', () => {
    const group = GLOSSARY.find((g) => g.id === 'uwb')
    const terms = (group?.items ?? []).map((i) => i.term.toLowerCase())
    for (const t of ['aoa', 'pdoa', 'boresight / yaw', 'cross-range error']) {
      expect(terms, `missing glossary term: ${t}`).toContain(t)
    }
    const aoaItem = group?.items.find((i) => i.term.toLowerCase() === 'aoa')
    expect(aoaItem?.alt.en, 'aoa.alt.en').toContain('§10.29.1.1')
    expect(aoaItem?.def.en, 'aoa.def.en').toContain('§10.29.1.1')
    expect(aoaItem?.def.zh, 'aoa.def.zh').toContain('§10.29.1.1')

    expect(README).toContain('§10.29.1.1')
    expect(README).toContain(`${AOA_SIGMA_PHI_RAD} rad`)
    expect(README).toContain(ANTENNA_SPACING_CM)
  })
})

describe('glossary · language separation', () => {
  it('every glossary term keeps alt.en and def.en free of Chinese characters', () => {
    const cjk = /[一-鿿]/
    for (const g of GLOSSARY) {
      for (const i of g.items) {
        expect(cjk.test(i.alt.en), `${i.term} alt.en`).toBe(false)
        expect(cjk.test(i.def.en), `${i.term} def.en`).toBe(false)
      }
    }
  })
})
