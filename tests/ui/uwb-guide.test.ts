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
import { EditorGuide } from '../../src/editor/EditorGuide'
import { Guide } from '../../src/ui/Guide'
import { STRINGS } from '../../src/ui/i18n'
import { GLOSSARY } from '../../src/ui/glossary'
import { AOA_SIGMA_CLAMP_DEG, AOA_SIGMA_PHI_RAD, aoaSigmaDeg, antennaSpacingM } from '../../src/uwb/aoa'
import {
  MMS_COMBINE_MAX_DB, MMS_SETS, UWB_MS_BUDGET_NJ, mmsFragmentDbm, mmsLayout, rifNs, rsfNs,
} from '../../src/uwb/mms'
import {
  NB_CHANNELS, NB_LBT_CCA_US, NB_LBT_EDT_DBM_PER_MHZ, NB_LBT_THRESHOLD_DBM, NB_POLL_BYTES,
  NB_REPORT_BYTES, NB_RX_SENS_DBM, NB_TX_DBM, nbCenterMhz, nbPpduNs,
} from '../../src/uwb/nb'
import {
  COUNTER_MOD, FOM_LOS, FOM_NLOS, RCTU_NS, UWB_BAND_MHZ, UWB_BLINK_BYTES, UWB_CAPTURE_DB, UWB_MAX_ANCHORS,
  UWB_MAX_INPUT_DBM_PER_MHZ, UWB_PL_EXP, UWB_RX_SENS_DBM, UWB_SIR_MIN_DB, UWB_TX_POWER_DBM,
  fomDecode, fomText, rstuNs, uwbFinalBytes, uwbInBandDbm, uwbPl0Db, uwbSlotsPerTag,
} from '../../src/uwb/phy'
import { rangeSigmaM } from '../../src/uwb/position'
import { ELLIPSE_DRAW_SCALE } from '../../src/uwb/scene'

const README = readFileSync(new URL('../../README.md', import.meta.url), 'utf8')
/** Pinning the panel's prose against the engine's live constants reads the source text
 * directly, the same way README is read raw. */
const EDITOR_GUIDE = readFileSync(new URL('../../src/editor/EditorGuide.tsx', import.meta.url), 'utf8')

/** The prose writes a Unicode minus, not an ASCII hyphen. */
const dbm = (v: number): string => `${v} dBm`.replace('-', '−')
/** Same, for a bare dB figure (the coexistence SIR floor, not a power level). */
const db = (v: number): string => `${v} dB`.replace('-', '−')
/** A schedule figure as the prose states it: `rstuNs` is the one definition of an RSTU. */
const ms = (rstu: number): string => `${rstuNs(rstu) / 1e6} ms`

const SIGMA_CM = `${(rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs) * 100).toFixed(1)} cm`
const COUNTER_WRAP_S = `${((COUNTER_MOD * RCTU_NS) / 1e9).toFixed(1)} s`

/** The Guide body, rendered. */
function renderGuide(): string {
  return renderToStaticMarkup(createElement(Guide))
}

/** A string that carries at least one CJK ideograph. */
const hasCjk = (s: string): boolean => /[一-鿿]/.test(s)

describe('UWB glossary group', () => {
  const group = GLOSSARY.find((g) => g.id === 'uwb')

  it('exists and is titled in Chinese', () => {
    expect(group).toBeDefined()
    expect(group?.title).toBeTruthy()
    expect(hasCjk(group?.title ?? '')).toBe(true)
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

  it('has a name and a definition in every item, with real Chinese', () => {
    for (const item of group?.items ?? []) {
      expect(item.alt, `${item.term}.alt`).toBeTruthy()
      expect(item.def, `${item.term}.def`).toBeTruthy()
      expect(hasCjk(item.def), `${item.term}.def is not Chinese`).toBe(true)
    }
  })

  it('quotes the engine values a learner would otherwise have to guess', () => {
    const text = (group?.items ?? []).map((i) => `${i.alt} ${i.def}`).join(' ')
    expect(text).toContain('15.650 ps')
    expect(text).toContain('833.333 ns')
    expect(text).toContain('73.269 µs')
  })
})

describe('Guide section 11', () => {
  it('renders the heading', () => {
    expect(renderGuide()).toContain('11 · UWB 测距')
  })

  it('states the ellipse draw factor and that the inspector shows the true axes', () => {
    const guide = renderGuide()
    expect(guide).toContain(`${ELLIPSE_DRAW_SCALE}×`)
    expect(guide).toContain('检视面板（Inspector）')
  })

  it('the glossary and the README quote the same factor, so it is never retyped stale', () => {
    // The constant has already moved once (3 → 10); every place that names it is pinned to it.
    const ellipse = (GLOSSARY.find((g) => g.id === 'uwb')?.items ?? [])
      .filter((i) => i.term.toLowerCase().includes('ellipse'))
    expect(ellipse.length).toBeGreaterThan(0)
    for (const i of ellipse) {
      for (const text of [i.alt, i.def]) {
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
  const zh = renderGuide()
  const all = [zh, README]

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
    // The README quotes fomText verbatim; the Chinese prose translates the sentence, so there only
    // the two decoded numbers — the parts that rot when a table entry moves — are pinned.
    expect(fomText(FOM_LOS)).toBe('97 % within 0.5 ns')
    expect(fomText(FOM_NLOS)).toBe('75 % within 12 ns')
    expect(README).toContain(fomText(FOM_LOS))
    expect(README).toContain(fomText(FOM_NLOS))
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
  const zh = renderGuide()

  it('the Guide states the SIR floor and the UWB channel-5 band edges from the engine constants', () => {
    expect(zh).toContain(db(UWB_SIR_MIN_DB)) // −12 dB
    expect(zh).toContain(`${UWB_BAND_MHZ[5].lo}`) // 6240
    expect(zh).toContain(`${UWB_BAND_MHZ[5].hi}`) // 6739.2
  })

  it('the glossary carries the four coexistence terms', () => {
    const group = GLOSSARY.find((g) => g.id === 'uwb')
    const terms = (group?.items ?? []).map((i) => i.term.toLowerCase())
    for (const t of ['in-band interference', 'sir', 'noise rise', '6 ghz channel']) {
      expect(terms.some((x) => x.includes(t)), `missing glossary term: ${t}`).toBe(true)
    }
    const sirItem = group?.items.find((i) => i.term.toLowerCase() === 'sir')
    expect(sirItem).toBeDefined()
    for (const text of [sirItem?.alt, sirItem?.def]) {
      expect(text).toContain(db(UWB_SIR_MIN_DB))
    }
    expect(sirItem?.def).toContain(`${UWB_MAX_INPUT_DBM_PER_MHZ}`.replace('-', '−'))
    expect(sirItem?.def).toContain('§16.4.10')
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
    expect(zh).toContain('40 cm')
    const noiseRise = (GLOSSARY.find((g) => g.id === 'uwb')?.items ?? [])
      .find((i) => i.term.toLowerCase() === 'noise rise')
    expect(noiseRise).toBeDefined()
    for (const text of [noiseRise?.alt, noiseRise?.def]) {
      expect(text).toContain('40 cm')
    }
    const sirRow = README.split('\n').find((l) => l.includes('UWB SIR floor under in-band Wi-Fi')) ?? ''
    expect(sirRow).toContain('40 cm')
  })
})

describe('Contention-based rounds (schedule mode 0)', () => {
  it('quotes the contention defaults and the capture margin from the engine constants', () => {
    const text = renderGuide()
    expect(text).toContain('§10.32.9.5')
    expect(text).toContain('§10.32.9.6')
    expect(text).toContain(`${DEFAULT_UWB_SESSION.contentionSlots}`)
    expect(text).toContain(`${DEFAULT_UWB_SESSION.maxAttempts}`)
    expect(text).toContain(`${UWB_CAPTURE_DB} dB`)
    expect(text).toContain('UWB_CONTEND_COLLISION')
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
      expect(item?.alt, `${item?.term}.alt`).toBeTruthy()
      expect(hasCjk(item?.alt ?? ''), `${item?.term}.alt is not Chinese`).toBe(true)
    }
    expect(rcps?.def).toContain('§10.32.9.5')
    expect(rcma?.def).toContain('§10.32.9.6')

    expect(README).toContain('schedule mode 0')
    expect(README).toContain('§10.32.9.5')
    expect(README).toContain('§10.32.9.6')
    expect(README).not.toContain('no contention-based ranging round')
  })
})

describe('TDoA modes (one-way ranging, §10.29.1.2.5)', () => {
  it('the Guide states DL-TDoA and UL-TDoA with the engine\'s blink size and default sync error', () => {
    const text = renderGuide()
    expect(text).toContain('§10.29.1.2.5')
    expect(text).toContain('DL-TDoA')
    expect(text).toContain('UL-TDoA')
    expect(text).toContain(`${UWB_BLINK_BYTES}`) // the 14-octet blink
    expect(text).toContain(`${DEFAULT_UWB_SESSION.syncErrorNs} ns`) // 0 ns, wired sync by default
  })

  it('the glossary carries the six TDoA terms, cited against §10.29.1.2.5 or model', () => {
    const group = GLOSSARY.find((g) => g.id === 'uwb')
    const terms = (group?.items ?? []).map((i) => i.term.toLowerCase())
    for (const t of ['tdoa', 'dl-tdoa', 'ul-tdoa', 'blink', 'hyperbolic positioning', 'clock-rate correction']) {
      expect(terms, `missing glossary term: ${t}`).toContain(t)
    }
    const tdoa = group?.items.find((i) => i.term.toLowerCase() === 'tdoa')
    expect(tdoa?.def).toContain('§10.29.1.2.5')
    const blink = group?.items.find((i) => i.term.toLowerCase() === 'blink')
    for (const text of [blink?.alt, blink?.def]) expect(text).toContain(`${UWB_BLINK_BYTES}`)
    const ulTdoa = group?.items.find((i) => i.term.toLowerCase() === 'ul-tdoa')
    expect(ulTdoa?.def).toContain('syncErrorNs')

    expect(README).toContain('| standard §10.29.1.2.5 |')
  })
})

describe('AoA (angle of arrival, §10.29.1.1)', () => {
  const ANTENNA_SPACING_CM = `${(antennaSpacingM(9) * 100).toFixed(1)} cm`
  const SIGMA_BORESIGHT_DEG = `${aoaSigmaDeg(0).toFixed(1)}°`
  const SIGMA_60_DEG = `${aoaSigmaDeg(60).toFixed(1)}°`

  it('the Guide states the phase-difference model and its bearing error from the engine constants', () => {
    const text = renderGuide()
    expect(text).toContain('§10.29.1.1')
    expect(text).toContain(ANTENNA_SPACING_CM)
    expect(text).toContain(`${AOA_SIGMA_PHI_RAD}`)
    expect(text).toContain(SIGMA_BORESIGHT_DEG)
    expect(text).toContain(SIGMA_60_DEG)
    expect(text).toContain(`${AOA_SIGMA_CLAMP_DEG}°`)
  })

  it('the cross-range error is the horizontal range times theta, not the slant range', () => {
    // emitAoaFix (src/uwb/device.ts) walks out horizM = sqrt(r^2 - dz^2) before multiplying by
    // aoaSigmaDeg, because an anchor off the tag's height measures a slant range, not a horizontal
    // one; the Guide's teaching paragraph must say the same thing the engine and the Cross-range
    // error glossary term (horizM·aoaSigmaDeg(θ)) do, not the slant range r·θ.
    const text = renderGuide()
    expect(text).toContain('r<sub>h</sub>·θ')
    expect(text).toContain('r<sub>h</sub> = √(r² − Δz²)')
  })

  it('the glossary carries the four AoA terms, and the README documents AoA as standard plus the PDoA model', () => {
    const group = GLOSSARY.find((g) => g.id === 'uwb')
    const terms = (group?.items ?? []).map((i) => i.term.toLowerCase())
    for (const t of ['aoa', 'pdoa', 'boresight / yaw', 'cross-range error']) {
      expect(terms, `missing glossary term: ${t}`).toContain(t)
    }
    const aoaItem = group?.items.find((i) => i.term.toLowerCase() === 'aoa')
    expect(aoaItem?.alt, 'aoa.alt').toContain('§10.29.1.1')
    expect(aoaItem?.def, 'aoa.def').toContain('§10.29.1.1')

    expect(README).toContain('§10.29.1.1')
    expect(README).toContain(`${AOA_SIGMA_PHI_RAD} rad`)
    expect(README).toContain(ANTENNA_SPACING_CM)
  })

  it('pins the glossary and EditorGuide AoA figures to the live engine constants, so a drift fails here', () => {
    // The Guide paragraph imports AOA_SIGMA_PHI_RAD/aoaSigmaDeg/antennaSpacingM directly, so it can
    // never go stale; the glossary's AoA/PDoA entries and EditorGuide's checkbox prose repeat the
    // same figures as plain text, so pin them here against a fresh computation from src/uwb/aoa.ts.
    const group = GLOSSARY.find((g) => g.id === 'uwb')
    const aoaItem = group?.items.find((i) => i.term.toLowerCase() === 'aoa')
    const pdoaItem = group?.items.find((i) => i.term.toLowerCase() === 'pdoa')
    expect(aoaItem?.def, 'aoa def').toContain(SIGMA_BORESIGHT_DEG)
    expect(aoaItem?.def, 'aoa def').toContain(SIGMA_60_DEG)
    expect(aoaItem?.def, 'aoa def').toContain(`${AOA_SIGMA_CLAMP_DEG}°`)
    expect(pdoaItem?.def, 'pdoa def').toContain(ANTENNA_SPACING_CM)
    expect(pdoaItem?.def, 'pdoa.def').toContain(`${AOA_SIGMA_PHI_RAD}`)

    expect(EDITOR_GUIDE, 'EditorGuide AoA checkbox').toContain(SIGMA_BORESIGHT_DEG)
  })
})

/**
 * Section 12 is the one section of the Guide built on an *unratified* draft, so two things are
 * pinned that no other section needs: that the word "draft" is on the heading,
 * and that every fragment length and LBT figure the prose quotes is the number `src/uwb/mms.ts`
 * and `src/uwb/nb.ts` actually compute — paraphrased draft numbers rot silently otherwise.
 */
describe('Guide section 12 (P802.15.4ab, draft)', () => {
  const zh = renderGuide()
  const us = (ns: number): string => (ns / 1000).toFixed(2)

  it('renders the heading, marked as a draft', () => {
    expect(zh).toContain('12 · ')
    expect(zh).toContain('多毫秒')
    expect(zh).toContain('草案')
    // the mode name the editor's select shows carries the same qualifier
    expect(STRINGS.editor.uwbModes.mms).toContain('802.15.4ab 草案')
  })

  it('quotes the fragment lengths mms.ts computes, not retyped draft numbers', () => {
    // The three published RSF lengths the draft's own table gives, plus the 64-unit RIF and the
    // session default's RSF — each written to 2 decimals in the prose.
    const cases: [string, number][] = [
      ['rsf-1 (N_MSR 40, gap 33)', rsfNs(MMS_SETS['rsf-1'].nMsr, MMS_SETS['rsf-1'].gap)],
      ['rsf-10 (N_MSR 32, gap 64)', rsfNs(MMS_SETS['rsf-10'].nMsr, MMS_SETS['rsf-10'].gap)],
      ['mixed (N_MSR 64, gap 25)', rsfNs(MMS_SETS['mixed-1'].nMsr, MMS_SETS['mixed-1'].gap)],
      ['RIF, 64 × 512 chips', rifNs(64)],
      ['the session default RSF', rsfNs(DEFAULT_UWB_SESSION.mms.nMsr, DEFAULT_UWB_SESSION.mms.gap)],
    ]
    expect(cases.map(([, ns]) => us(ns))).toEqual(['62.18', '65.64', '91.28', '65.64', '82.05'])
    for (const text of [zh, README]) {
      for (const [what, ns] of cases) expect(text, what).toContain(`${us(ns)} µs`)
    }
  })

  it('quotes the millisecond budget and the combining gain from the engine', () => {
    for (const text of [zh, README]) {
      expect(text).toContain(`${UWB_MS_BUDGET_NJ} nJ`)
      expect(text).toContain('10·log10(X)')
      expect(text).toContain(`${MMS_COMBINE_MAX_DB.toFixed(2)} dB`) // 12.04 dB, X = 16
    }
    // the fragment power the channel actually radiates, for the default RSF and for set rsf-1
    const defaultDbm = mmsFragmentDbm(rsfNs(DEFAULT_UWB_SESSION.mms.nMsr, DEFAULT_UWB_SESSION.mms.gap))
    const setDbm = mmsFragmentDbm(rsfNs(MMS_SETS['rsf-1'].nMsr, MMS_SETS['rsf-1'].gap))
    expect([defaultDbm.toFixed(2), setDbm.toFixed(2)]).toEqual(['-3.46', '-2.25'])
    expect(zh).toContain(dbm(Number(defaultDbm.toFixed(2))))
    expect(zh).toContain(dbm(Number(setDbm.toFixed(2))))
  })

  it('quotes the narrowband PHY, the channel plan and the LBT threshold from nb.ts', () => {
    const lbt = NB_LBT_THRESHOLD_DBM.toFixed(2) // −71.02 dBm over 2.5 MHz
    expect(lbt).toBe('-71.02')
    for (const text of [zh, README]) {
      // A bare "250" also matches the schema's "1…250", so the count is asserted as a phrase.
      expect(text).toContain(text === zh ? `${NB_CHANNELS} 个信道` : `${NB_CHANNELS} channels`)
      expect(text).toContain(`${NB_LBT_CCA_US} µs`) // the 9 µs CCA
      expect(text).toContain(dbm(NB_LBT_EDT_DBM_PER_MHZ).replace(' dBm', ' dBm/MHz'))
      expect(text).toContain(`${lbt.replace('-', '−')} dBm`)
      expect(text).toContain(dbm(NB_TX_DBM)) // 10 dBm
      expect(text).toContain(dbm(NB_RX_SENS_DBM)) // −100 dBm
      expect(text).toContain(`${(nbPpduNs(NB_POLL_BYTES) / 1000).toFixed(0)} µs`) // 576 µs
      expect(text).toContain(`${(nbPpduNs(NB_REPORT_BYTES) / 1000).toFixed(0)} µs`) // 608 µs
    }
    // the reconstructed centre formula's two anchors, in the Guide and the README
    for (const text of [zh, README]) {
      expect(text).toContain(`${nbCenterMhz(0)}`) // 5726.25
      expect(text).toContain(`${nbCenterMhz(50)}`) // 5926.25
    }
  })

  it('states the pairwise cycle the layout builds, with the draft slot default', () => {
    const layout = mmsLayout(DEFAULT_UWB_SESSION.mms)
    expect(layout.slots).toBe(28)
    expect(layout.controlSlots + layout.rpSlots + layout.reportSlots).toBe(layout.slots)
    expect(README).toContain(`${layout.slots} slots`)
    expect(zh).toContain(`${layout.slots} 个时隙`)
    for (const text of [zh, README]) expect(text).toContain('0.5 ms')
    // the two coexistence radii the coupling model pins
    expect(zh).toContain('≈ 8.6 m')
    expect(zh).toContain('≈ 15 m')
  })

  it('names the P802.15.4ab draft documents it paraphrases, and never claims to have read the draft itself', () => {
    for (const doc of ['0381r5', '0100r2', '0502r3', '0205r0']) {
      expect(README, doc).toContain(doc)
    }
    // Not a version number: those move every recirculation, and pinning one here is how a
    // stale claim survives review. What must hold is that both say it is an unratified draft.
    expect(zh).toContain('草案')
    expect(README).toContain('unratified draft')
    expect(README).toContain('Draft status')
  })
})

describe('the 802.15.4ab glossary group', () => {
  const group = GLOSSARY.find((g) => g.id === 'uwb-mms')

  it('exists, titled in Chinese and marked a draft', () => {
    expect(group).toBeDefined()
    expect(group?.title).toContain('802.15.4ab')
    expect(hasCjk(group?.title ?? '')).toBe(true)
    expect(group?.title).toContain('草案')
  })

  it('carries every term the MMS engine exposes', () => {
    const terms = (group?.items ?? []).map((i) => i.term.toLowerCase())
    for (const t of [
      'mms', 'rsf', 'rif', 'mmrs', 'n_msr', 'nba-uwb', 'nb control channel',
      'lbt', 'millisecond energy budget', 'coherent combining', 'train-derived clock ratio',
    ]) {
      expect(terms.some((x) => x.includes(t)), `missing glossary term: ${t}`).toBe(true)
    }
  })

  it('has a name and a definition in every item, in real Chinese', () => {
    expect(group?.items.length ?? 0).toBeGreaterThanOrEqual(11)
    for (const item of group?.items ?? []) {
      for (const text of [item.alt, item.def]) expect(text, item.term).toBeTruthy()
      expect(hasCjk(item.def), `${item.term}.def`).toBe(true)
    }
  })

  it('pins its numbers to the engine, so a moved constant fails here', () => {
    const find = (term: string) => group?.items.find((i) => i.term.toLowerCase() === term)
    const budget = find('millisecond energy budget')
    expect(budget?.def).toContain(`${UWB_MS_BUDGET_NJ} nJ`)
    const combining = find('coherent combining')
    expect(combining?.def).toContain(`${MMS_COMBINE_MAX_DB.toFixed(2)} dB`)
    const lbt = group?.items.find((i) => i.term.toLowerCase().startsWith('lbt'))
    expect(lbt?.def).toContain(`${NB_LBT_THRESHOLD_DBM.toFixed(2)}`.replace('-', '−'))
    expect(lbt?.def).toContain(`${NB_LBT_CCA_US} µs`)
    const rif = find('rif')
    expect(rif?.def).toContain(`${(rifNs(64) / 1000).toFixed(2)} µs`)
  })
})

describe('the EditorGuide MMS section', () => {
  // Rendered, not read off the source: a marker that matched a comment would pass while the
  // panel showed nothing, and every string below is meant to reach the user's screen.
  const zh = renderToStaticMarkup(createElement(EditorGuide))
  /** The section, from its own heading to the next one — so a marker cannot be satisfied by
   * some other part of a very long panel. */
  const section = (html: string, from: string, to: string): string => {
    const start = html.indexOf(from)
    expect(start, `heading not rendered: ${from}`).toBeGreaterThan(-1)
    const end = html.indexOf(to, start)
    expect(end, `next heading not rendered: ${to}`).toBeGreaterThan(start)
    return html.slice(start, end)
  }
  const zhMms = section(zh, 'MMS 片段序列（802.15.4ab 草案）', '墙体属性')

  it('describes every MMS field inside its own section', () => {
    for (const marker of ['参数集', 'nbChannels', 'LBT', 'RSF', 'RIF', 'N_MSR', '草案']) {
      expect(zhMms, marker).toContain(marker)
    }
  })

  it('marks the section a draft and says the method select is off for a reason', () => {
    expect(zhMms).toContain('802.15.4ab')
    expect(zhMms).toContain('单边')
  })
})
