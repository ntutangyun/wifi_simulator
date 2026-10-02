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
import { Simulation } from '../../src/engine/simulation'
import {
  DEFAULT_UWB_SESSION, ScenarioSchema, type NodeCfg, type Scenario, type UwbSessionCfg,
} from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
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
  COUNTER_MOD, FOM_LOS, FOM_NLOS, RCTU_NS, SRRR_IE_BYTES, UWB_BAND_MHZ, UWB_BLINK_BYTES, UWB_CAPTURE_DB,
  UWB_MAX_INPUT_DBM_PER_MHZ, UWB_PL_EXP, UWB_RX_SENS_DBM, UWB_SIR_MIN_DB, UWB_SS_DEFER_BYTES, UWB_TX_POWER_DBM,
  fomDecode, fomText, rstuNs, uwbFinalBytes, uwbInBandDbm, uwbInitBytes, uwbM2mBytes, uwbMaxAnchors,
  uwbMaxMmrcmInitiators, uwbMaxParticipants, uwbMmrcmBytes, uwbPl0Db, uwbPollBytes, uwbPpduNs, uwbRespBytes,
  uwbRmnrBytes, uwbSlotsPerTag, uwbSp3InitReportBytes, uwbSp3Ns, uwbSp3PollBytes, uwbSp3ReportBytes,
  type UwbReplyTime,
} from '../../src/uwb/phy'
import { rangeSigmaM } from '../../src/uwb/position'
import { ELLIPSE_DRAW_SCALE } from '../../src/uwb/scene'
import { roundPlan } from '../../src/uwb/session'

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

  it('covers the reply-time term and its three routes (standard §10.29.6.3–.7)', () => {
    const terms = (group?.items ?? []).map((i) => i.term).join(' | ').toLowerCase()
    for (const t of ['reply time', 'embedded reply time', 'deferred reply time', 'fixed reply time']) {
      expect(terms, `missing term: ${t}`).toContain(t)
    }
  })

  it('names a provenance on every reply-time entry, the same bar the draft sections are held to', () => {
    const replyTimeItems = (group?.items ?? [])
      .filter((i) => i.term.toLowerCase().includes('reply time'))
    expect(replyTimeItems.length).toBeGreaterThanOrEqual(4)
    const marks = ['§10.29.6', '模型取值', '标准', '法规']
    for (const item of replyTimeItems) {
      const text = `${item.alt} ${item.def}`
      expect(marks.some((m) => text.includes(m)), `"${item.term}" names no provenance`).toBe(true)
    }
  })

  it('does not blur the line with MMS’s own, differently-named fixed reply time', () => {
    // design: `UwbSessionCfg.fixedReplyRstu` (published standard §10.29.6.5) and
    // `UwbMmsCfg.fixedReplyRstu` (4ab draft macMmsFixedReplyTime) are a different setting for a
    // different round shape; the published-standard entry must say so rather than silently reuse
    // the draft group's own "Fixed reply time" name for something else.
    const fixed = (group?.items ?? []).find((i) => i.term === 'Fixed reply time')
    expect(fixed).toBeDefined()
    expect(`${fixed?.alt} ${fixed?.def}`).toMatch(/SS-TWR/)
    const draftFixed = (GLOSSARY.find((g) => g.id === 'uwb-mms')?.items ?? [])
      .find((i) => i.term.toLowerCase().includes('fixed reply'))
    expect(draftFixed, 'the draft group should still carry its own, separate entry').toBeDefined()
  })
})

describe('Guide section 15: reply time / round-trip time', () => {
  const guide = renderGuide()

  it('renders the heading', () => {
    expect(guide).toContain('15 · 回复时间走哪条路')
  })

  it('states the frame sizes off the engine’s own frame builders (design §5)', () => {
    // SS Response: 20 embedded / 14 fixed (same octet count as deferred).
    expect(uwbRespBytes('ss', 'embedded')).toBe(20)
    expect(uwbRespBytes('ss', 'fixed')).toBe(14)
    expect(uwbRespBytes('ss', 'deferred')).toBe(14)
    expect(guide).toContain('>20<')
    expect(guide).toContain('>14<')
    // The deferred reply-time message: 17 octets.
    expect(UWB_SS_DEFER_BYTES).toBe(17)
    expect(guide).toContain('17（MHR + RRTI IE + FCS）')
    // DS Final at nine anchors: 14 + 12A embedded (122) against 14 + 2A deferred (32).
    expect(uwbFinalBytes(9, 'embedded')).toBe(122)
    expect(uwbFinalBytes(9, 'deferred')).toBe(32)
    expect(guide).toContain('14 + 12A（9 锚点 = 122）')
    expect(guide).toContain('14 + 2A（9 锚点 = 32）')
  })

  it('derives the anchor cap rather than quoting a literal 33 anywhere in the engine', () => {
    expect(uwbMaxAnchors('twr', 'ds', 'embedded', 'time')).toBe(9)
    expect(uwbMaxAnchors('twr', 'ds', 'deferred', 'time')).toBe(33)
    expect(uwbMaxAnchors('twr', 'ss', 'embedded', 'time')).toBe(33)
    expect(uwbMaxAnchors('twr', 'ss', 'deferred', 'time')).toBe(33)
    expect(uwbMaxAnchors('twr', 'ss', 'fixed', 'time')).toBe(33)
    expect(guide).toContain('9')
    expect(guide).toContain('33')
    // `src/uwb/ranging.ts` never hard-codes the cap the design doc forbids as a literal.
    const ranging = readFileSync(new URL('../../src/uwb/ranging.ts', import.meta.url), 'utf8')
    expect(ranging).not.toMatch(/\b33\b/)
  })

  it('states which end holds the range in every one of the five shapes (design §7)', () => {
    for (const row of ['SS 嵌入', 'SS 固定', 'SS 延后', 'DS 嵌入', 'DS 延后']) expect(guide).toContain(row)
    // DS embedded alone hands the anchor a range too — the Final is what carries it.
    expect(guide).toMatch(/只有 DS 嵌入[\s\S]{0,40}让锚点也拿到/)
  })

  /**
   * The five ranges in the Guide are **not** checked against a list of strings — that pins the
   * prose against itself, which is the one thing it cannot catch. They are checked against five
   * rounds run here, now, by the engine the reader is about to use.
   *
   * This project's recurring defect is stated-versus-simulated drift: a number written into the
   * text once, and true only until the next engine change. Task 5 quoted these from a brief and
   * said so; this is the test that makes the quotation load-bearing. Change the clock model, the
   * frame sizes or the reply-time routing and this test names the sentence that went stale.
   */
  it('quotes ranges the engine actually produces, measured here rather than copied', () => {
    const shapes: { method: 'ss' | 'ds'; replyTime: UwbReplyTime }[] = [
      { method: 'ss', replyTime: 'embedded' },
      { method: 'ss', replyTime: 'fixed' },
      { method: 'ss', replyTime: 'deferred' },
      { method: 'ds', replyTime: 'embedded' },
      { method: 'ds', replyTime: 'deferred' },
    ]
    const TRUE_M = 5
    const node = (id: string, x: number, role: 'anchor' | 'tag', ppm: number): NodeCfg => ({
      id, kind: 'uwb', name: id, pos: { x, y: 0, z: 1 }, txPowerDbm: UWB_TX_POWER_DBM,
      profiles: ['idle'], caps: { generation: 'nonht', features: {} }, uwb: { role, ppm },
    })
    const tagRange = (
      s: { method: 'ss' | 'ds'; replyTime: UwbReplyTime }, ppm: { a: number; t: number },
    ): number => {
      const sc: Scenario = {
        rooms: [{ x: 0, y: 0, w: 12, h: 10, name: 'lab' }],
        walls: [],
        nodes: [node('anc-1', 0, 'anchor', ppm.a), node('tag-1', TRUE_M, 'tag', ppm.t)],
        servers: [], seed: 7, rtsThresholdBytes: 3000, snapshotIntervalMs: 10,
        uwb: { ...DEFAULT_UWB_SESSION, ...s, tsNoisePs: 0, cfoNoisePpm: 0 },
      }
      const recs = new Simulation(sc).runUntil(40_000_000).records
      const r = recs.find((x) => x.type === 'UWB_RANGE' && x.node === 'tag-1')
      expect(r, `${s.method}/${s.replyTime} produced no range at all`).toBeDefined()
      return (r as { distM: number }).distM
    }

    // Crystals 35 ppm apart is what separates the five shapes; matched crystals is the control.
    const skewed = shapes.map((s) => tagRange(s, { a: 20, t: -15 }))
    const matched = shapes.map((s) => tagRange(s, { a: 0, t: 0 }))

    // Every figure the Guide prints has to be one of these, to six decimal places.
    for (const d of [...skewed, ...matched]) expect(guide).toContain(d.toFixed(6))

    // …and the three claims the prose makes about them are claims about the engine, not asides.
    // Embedded and deferred run the same arithmetic over a different carrier, so they agree
    // exactly; fixed counts its delay on the responder's own crystal, so it does not.
    expect(skewed[0]).toBe(skewed[2])
    expect(skewed[1]).not.toBe(skewed[0])
    expect(skewed[3]).toBe(skewed[4])
    // DS beats SS on a skewed pair, which is the whole reason DS-TWR exists.
    expect(Math.abs(skewed[3] - TRUE_M)).toBeLessThan(Math.abs(skewed[0] - TRUE_M))
    // Matched crystals collapse the five routes onto one answer.
    expect(new Set(matched).size).toBe(1)
  })

  it('names the three limits design §10 requires: no control plane, no negotiation, no jitter', () => {
    expect(guide).toContain('没有一个 MAC 原语')
    expect(guide).toContain('不会')
    expect(guide).toMatch(/RRTN IE/)
    expect(guide).toContain('抖动')
    expect(guide).toContain('15 cm')
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
    // The README writes the Final as "14 + 12N" octets; that is uwbFinalBytes (embedded DS-TWR,
    // the default and the shape the README's "≤ 9 anchors" row is specifically about).
    const dsEmbeddedCap = uwbMaxAnchors('twr', 'ds', 'embedded', 'time')
    for (const n of [1, 4, dsEmbeddedCap]) expect(uwbFinalBytes(n)).toBe(14 + 12 * n)
    expect(README).toContain('14 + 12N')
    expect(README).toContain(`≤ ${dsEmbeddedCap} anchors`)
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

/**
 * Section 16: many-to-many ranging (design §1/§2/§5). The slot table and the frame-size table are
 * `Guide.tsx`'s own calls to `roundPlan`/`uwbM2mBytes`/`uwbMaxParticipants`, so a drift there is
 * already caught elsewhere; what this suite pins is what Task 5's brief calls out by name — the
 * N-vs-N² headline, the per-participant split and the DS-vs-SS accuracy claim — against **whole
 * rounds run here, now**, the same discipline section 15's test above applies to its five ranges.
 * `PLACES`/`PPM` match `tests/uwb/m2m-round.test.ts` so this measures the identical scenario the
 * task report's figures came from, rather than a scenario picked to make the numbers come out.
 */
describe('Guide section 16: many-to-many ranging (design §1/§2/§5)', () => {
  const zh = renderGuide()

  it('renders the heading', () => {
    expect(zh).toContain('16 · 多对多测距')
  })

  const PLACES: { x: number; y: number }[] = [
    { x: 1, y: 1 }, { x: 7, y: 2 }, { x: 3, y: 6 }, { x: 11, y: 9 }, { x: 5, y: 13 }, { x: 15, y: 4 },
  ]
  const PPM = [0, 18, -14, 9, -20, 5]
  const idOf = (i: number): string => `p-${i}`
  const room = { x: 0, y: 0, w: 20, h: 16, name: 'lab' }
  const m2mNode = (i: number, ppm: number): NodeCfg => ({
    id: idOf(i), kind: 'uwb', name: idOf(i), pos: { ...PLACES[i], z: 1 },
    txPowerDbm: UWB_TX_POWER_DBM, profiles: ['idle'], caps: { generation: 'nonht', features: {} },
    uwb: { role: 'tag', ppm },
  })
  const m2mScenario = (n: number, session: Partial<UwbSessionCfg>): Scenario => ({
    rooms: [room], walls: [], nodes: Array.from({ length: n }, (_, i) => m2mNode(i, PPM[i] ?? 0)),
    servers: [], seed: 7, rtsThresholdBytes: 3000, snapshotIntervalMs: 10,
    uwb: { ...DEFAULT_UWB_SESSION, mode: 'm2m', nlos: false, tsNoisePs: 0, cfoNoisePpm: 0, ...session },
  })
  const runM2m = (n: number, session: Partial<UwbSessionCfg>) =>
    new Simulation(m2mScenario(n, session)).runUntil(100_000_000).records
  /** N one-to-many rounds, one per device taking its turn as the tag — the arrangement many-to-many
   * replaces, and design §1's other column. */
  const takingTurns = (n: number): { slots: number; ranges: number } => {
    let slots = 0
    let ranges = 0
    for (let k = 0; k < n; k++) {
      const nodes = Array.from({ length: n }, (_, i): NodeCfg => ({
        id: idOf(i), kind: 'uwb', name: idOf(i), pos: { ...PLACES[i], z: 1 },
        txPowerDbm: UWB_TX_POWER_DBM, profiles: ['idle'], caps: { generation: 'nonht', features: {} },
        uwb: { role: i === k ? 'tag' : 'anchor', ppm: 0 },
      }))
      const sc: Scenario = {
        rooms: [room], walls: [], nodes, servers: [], seed: 7, rtsThresholdBytes: 3000, snapshotIntervalMs: 10,
        uwb: {
          ...DEFAULT_UWB_SESSION, mode: 'twr', method: 'ss', replyTime: 'embedded',
          nlos: false, tsNoisePs: 0, cfoNoisePpm: 0,
        },
      }
      const recs = new Simulation(sc).runUntil(100_000_000).records
      const rounds = recs.filter((r) => r.type === 'UWB_ROUND')
      expect(rounds, `taking turns N=${n} turn ${k}`).toHaveLength(1)
      slots += (rounds[0] as { slots: number }).slots
      ranges += recs.filter((r) => r.type === 'UWB_RANGE').length
    }
    return { slots, ranges }
  }

  it('states the N-vs-N² headline and the exact slot ratio off whole rounds, for N = 3/4/6 (design §1)', () => {
    for (const n of [3, 4, 6]) {
      const m2mRecs = runM2m(n, { method: 'ss' })
      const m2mRounds = m2mRecs.filter((r) => r.type === 'UWB_ROUND')
      const m2mRanges = m2mRecs.filter((r) => r.type === 'UWB_RANGE')
      expect(m2mRounds.length, `N=${n}: a round ran at all`).toBeGreaterThan(0)
      const m2mSlots = (m2mRounds[0] as { slots: number }).slots
      const pairs = (n * (n - 1)) / 2
      expect(m2mSlots, `N=${n} m2m slots`).toBe(n)
      expect(m2mRanges.length, `N=${n} m2m ranges`).toBe(pairs)
      // The Guide's own table cell is `roundPlan`'s answer — must agree with the round that ran.
      expect(roundPlan({ ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss' }, n).slots, `N=${n}`).toBe(m2mSlots)

      const turns = takingTurns(n)
      expect(turns.slots, `N=${n} taking-turns slots`).toBe(n * n)
      expect(turns.ranges, `N=${n} taking-turns ranges (each pair measured twice)`).toBe(2 * pairs)
      expect(turns.slots / m2mSlots, `N=${n} the slot ratio`).toBe(n)

      const dsRecs = runM2m(n, { method: 'ds' })
      const dsRounds = dsRecs.filter((r) => r.type === 'UWB_ROUND')
      const dsRanges = dsRecs.filter((r) => r.type === 'UWB_RANGE')
      const dsSlots = (dsRounds[0] as { slots: number }).slots
      expect(dsSlots, `N=${n} DS slots`).toBe(2 * n)
      expect(dsRanges.length, `N=${n} DS ranges`).toBe(pairs)
      expect(roundPlan({ ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ds' }, n).slots, `N=${n}`).toBe(dsSlots)
    }
  })

  it('gives participant i exactly N-1-i ranges, and the guide quotes exactly that split (design §2)', () => {
    for (const n of [3, 6]) {
      const ranges = runM2m(n, { method: 'ss' }).filter((r) => r.type === 'UWB_RANGE') as
        { node: string; peer: string }[]
      const perParticipant = Array.from({ length: n }, (_, i) => ranges.filter((r) => r.node === idOf(i)).length)
      expect(perParticipant, `N=${n}`).toEqual(Array.from({ length: n }, (_, i) => n - 1 - i))
      expect(zh, `N=${n}`).toContain(perParticipant.join('、'))
    }
  })

  it('states the frames actually sent on air at N = 6, not a copied table (design §4)', () => {
    const records = runM2m(6, { method: 'ss' })
    const air = records.filter((r) => r.type === 'TX_START') as { node: string; frame: { bytes: number } }[]
    expect(air, 'one transmission per participant').toHaveLength(6)
    expect(air.map((r) => r.node)).toEqual(Array.from({ length: 6 }, (_, i) => idOf(i)))
    const bytes = air.map((r) => r.frame.bytes)
    expect(bytes).toEqual(Array.from({ length: 6 }, (_, i) => uwbM2mBytes(i))) // 20/26/30/34/38/42
    expect(zh).toContain(bytes.join(' / '))
  })

  it('derives the participant cap rather than quoting a literal, and the guide states it (design §4)', () => {
    const cap = uwbMaxParticipants('ss')
    expect(uwbMaxParticipants('ds'), 'SS and DS share one frame-size law').toBe(cap)
    expect(cap).toBe(27)
    expect(zh).toContain(`>${cap}<`)
    // `src/uwb/ranging.ts` never hard-codes the cap, exactly as section 15 already checks for the
    // two-way cap — restated here because it is a fresh number, not a re-assertion of that test.
    const ranging = readFileSync(new URL('../../src/uwb/ranging.ts', import.meta.url), 'utf8')
    expect(ranging).not.toMatch(/\b27\b/)
  })

  /**
   * The 150× accuracy claim, measured here rather than copied from the task report it was first
   * measured in. `cfoNoisePpm` is named explicitly at the session default: `QUIET`-style zeroing
   * of it would give SS-TWR a perfect offset estimate and erase the very difference this test (and
   * the Guide's prose) is about — the same instrument error Task 4's report already caught once.
   */
  it('quotes the DS-vs-SS accuracy measured from a real run with the crystals pulled apart (design §3)', () => {
    const withPpm: Partial<UwbSessionCfg> = { cfoNoisePpm: DEFAULT_UWB_SESSION.cfoNoisePpm }
    const errorsOf = (method: 'ss' | 'ds'): number[] => {
      const ranges = runM2m(6, { method, ...withPpm }).filter((r) => r.type === 'UWB_RANGE') as
        { distM: number; trueDistM: number }[]
      expect(ranges, method).toHaveLength(15)
      return ranges.map((r) => Math.abs(r.distM - r.trueDistM))
    }
    const ss = errorsOf('ss')
    const ds = errorsOf('ds')
    const ssMax = Math.max(...ss)
    const ssMean = ss.reduce((a, b) => a + b, 0) / ss.length
    const dsMax = Math.max(...ds)
    const dsMean = ds.reduce((a, b) => a + b, 0) / ds.length
    // The ordering the prose depends on, floored so it cannot pass on two equal, tiny numbers.
    expect(ssMax, 'SS carries the clock-offset residual').toBeGreaterThan(0.02)
    expect(dsMax, 'DS cancels it').toBeLessThan(ssMax / 5)
    // The exact figures the Guide states, at the precision it states them to.
    expect(ssMax.toFixed(4)).toBe('0.2175')
    expect(ssMean.toFixed(4)).toBe('0.0828')
    expect(dsMax.toFixed(6)).toBe('0.001454')
    expect(dsMean.toFixed(6)).toBe('0.000637')
    expect(zh).toContain(`${ssMax.toFixed(4)} m`)
    expect(zh).toContain(`${ssMean.toFixed(4)} m`)
    expect(zh).toContain(`${dsMax.toFixed(6)} m`)
    expect(zh).toContain(`${dsMean.toFixed(6)} m`)
    expect(zh).toContain(`${Math.round(ssMax / dsMax)}×`)
  })

  it('says role is drawing-only in this mode, and no anchor/tag terms leak into the mechanism paragraphs', () => {
    expect(zh).toContain('uwb.role')
    expect(zh).toMatch(/design §5/)
  })
})

describe('the many-to-many glossary terms, each with a provenance (design §1/§2/§5)', () => {
  const group = GLOSSARY.find((g) => g.id === 'uwb')
  const find = (term: string) => (group?.items ?? []).find((i) => i.term.toLowerCase() === term.toLowerCase())

  it('carries the three terms Task 5 adds', () => {
    for (const t of ['Many-to-many ranging', 'Participant list', 'Slot ratio (taking turns vs. many-to-many)']) {
      expect(find(t), t).toBeDefined()
    }
  })

  it('names a provenance on every one of them', () => {
    const marks = ['§10.32.6', '§10.32.7', 'design §', '模型取值']
    for (const t of ['Many-to-many ranging', 'Participant list', 'Slot ratio (taking turns vs. many-to-many)']) {
      const item = find(t)!
      const text = `${item.alt} ${item.def}`
      expect(marks.some((m) => text.includes(m)), `"${t}" names no provenance`).toBe(true)
    }
  })

  it('the many-to-many entry cites both ranging clauses and says role is drawing-only', () => {
    const item = find('Many-to-many ranging')!
    expect(item.alt).toContain('§10.32.6')
    expect(item.alt).toContain('§10.32.7')
    expect(item.def).toContain('uwb.role')
  })

  it('the participant-list entry says the order is by node id, not scene order, and why', () => {
    const item = find('Participant list')!
    expect(item.def).toMatch(/id/)
    expect(item.def).toMatch(/哈希|确定/)
  })

  it('the slot-ratio entry states the exact N = 6 figures the round actually produces', () => {
    const item = find('Slot ratio (taking turns vs. many-to-many)')!
    expect(item.def).toContain('30')
    expect(item.def).toContain('15')
  })
})

/**
 * Section 17: RCM validity rounds (design §1/§2/§2.2) and RMNR (design §3/§3.1). Every figure
 * the Guide states is read off a real run here, the same discipline section 15 and section 16
 * already apply — a drift in `uwbPollBytes`/`uwbInitBytes`/`uwbRmnrBytes` or in the engine's own
 * frame choice fails here, not just in `tests/uwb/rcm-validity-schedule.test.ts` and
 * `tests/uwb/rmnr-round.test.ts`, which this suite deliberately mirrors rather than imports from.
 */
describe('Guide section 17: RCM validity rounds / RMNR (design §1/§2/§2.2/§3)', () => {
  const zh = renderGuide()

  it('renders the heading', () => {
    expect(zh).toContain('17 ·')
    expect(zh).toContain('RCM Validity Rounds')
  })

  const rcmNode = (id: string, x: number, y: number, role: 'anchor' | 'tag', txPowerDbm = UWB_TX_POWER_DBM): NodeCfg => ({
    id, kind: 'uwb', name: id, pos: { x, y, z: 1 }, txPowerDbm, profiles: ['idle'],
    caps: { generation: 'nonht', features: {} }, uwb: { role },
  })
  const room = { x: 0, y: 0, w: 40, h: 30, name: 'hall' }
  const rcmScenario = (nodes: NodeCfg[], session: Partial<UwbSessionCfg>): Scenario => ({
    rooms: [room], walls: [], nodes, servers: [], seed: 7, rtsThresholdBytes: 3000, snapshotIntervalMs: 10,
    uwb: { ...DEFAULT_UWB_SESSION, ...session },
  })
  const runRcm = (sc: Scenario, untilNs: number): TLRecord[] => new Simulation(sc).runUntil(untilNs).records
  const of = <T extends TLRecord['type']>(rs: TLRecord[], type: T): Extract<TLRecord, { type: T }>[] =>
    rs.filter((r) => r.type === type) as never

  // Design §2.2's own worked example: four anchors, four blocks — a tag's successive ranging
  // rounds are successive blocks here, so the saving has to be read off four of them, not one.
  const A = 4
  const SCENE_A: NodeCfg[] = [
    rcmNode('anc-1', 0, 0, 'anchor'), rcmNode('anc-2', 8, 0, 'anchor'),
    rcmNode('anc-3', 0, 6, 'anchor'), rcmNode('anc-4', 8, 6, 'anchor'),
    rcmNode('tag-1', 4, 3, 'tag'),
  ]
  const BLOCK_NS = roundPlan(DEFAULT_UWB_SESSION, A).blockNs
  const RUN_NS = 4 * BLOCK_NS - 1_000_000
  const sceneA = (rcmValidityRounds: number): TLRecord[] =>
    runRcm(rcmScenario(SCENE_A, { method: 'ds', replyTime: 'embedded', nlos: false, rcmValidityRounds }), RUN_NS)
  const openers = (rs: TLRecord[]): { block: number; kind: string; bytes: number }[] =>
    of(rs, 'TX_START')
      .filter((r) => r.node === 'tag-1' && (r.frame.kind === 'uwbPoll' || r.frame.kind === 'uwbInit'))
      .map((r) => ({ block: r.frame.uwb?.block ?? -1, kind: r.frame.kind, bytes: r.frame.bytes }))

  it('states the two opener sizes and the per-tag, per-four-block saving off whole runs (design §2)', () => {
    const one = sceneA(1)
    const four = sceneA(4)
    const o1 = openers(one)
    const o4 = openers(four)
    expect(o1.map((o) => o.block), 'R=1: a block, an opener').toEqual([0, 1, 2, 3])
    expect(o4.map((o) => o.block), 'R=4: a block, an opener').toEqual([0, 1, 2, 3])
    expect(o1.map((o) => o.bytes)).toEqual([39, 39, 39, 39])
    expect(o4.map((o) => o.bytes)).toEqual([39, 14, 14, 14])
    // The two rulers the Guide's own constants use.
    expect(uwbPollBytes(A)).toBe(39)
    expect(uwbInitBytes()).toBe(14)

    const total = (os: { bytes: number }[]): number => os.reduce((s, o) => s + o.bytes, 0)
    const r1Total = total(o1)
    const r4Total = total(o4)
    expect(r1Total).toBe(156)
    expect(r4Total).toBe(81)
    expect(r1Total - r4Total).toBe(75)
    const perBlock = ((r1Total - r4Total) / 4).toFixed(2)
    expect(perBlock).toBe('18.75')

    // Every figure the Guide's prose states, quoted back from this same run.
    expect(zh).toContain(`${uwbPollBytes(A)} / ${uwbInitBytes()} / ${uwbInitBytes()} / ${uwbInitBytes()}`)
    expect(zh).toContain(`>${r4Total}<`)
    expect(zh).toContain(`>${r1Total}<`)
    expect(zh).toContain(`>${r1Total - r4Total}<`)
    expect(zh).toContain(`>${perBlock}<`)
    // The table cell for the first-round frame length, and the flat 14 of the rest.
    expect(zh).toContain(`27 + 3A（${A} 个锚点 = ${uwbPollBytes(A)}）`)

    // The measurement itself is untouched: every UWB_RANGE record agrees field for field.
    const ranges = (rs: TLRecord[]): unknown[] => of(rs, 'UWB_RANGE').map(({ seq, ...rest }) => rest)
    expect(ranges(one).length, 'DS embedded: a range at each end of each block').toBe(2 * A * 4)
    expect(ranges(four)).toEqual(ranges(one))
  })

  it('sends no ARC and no RDM after the first block of a validity window (design §2.1)', () => {
    const o4 = of(sceneA(4), 'TX_START')
      .filter((r) => r.node === 'tag-1' && (r.frame.kind === 'uwbPoll' || r.frame.kind === 'uwbInit'))
      .map((r) => [...(r.frame.uwb?.ies ?? [])])
    expect(o4[0]).toEqual(['ARC', 'RDM', 'RRMC'])
    for (const ies of o4.slice(1)) {
      expect(ies).toEqual(['RRMC'])
      expect(ies).not.toContain('RDM')
    }
  })

  // Design §3.1's scene: an anchor that holds block 0's control message, then moves out of the
  // initiation message's reach but not out of the tag's receive range for its own, louder frame.
  const TAG_DBM = -24
  const SCENE_B: NodeCfg[] = [
    rcmNode('anc-1', 0, 0, 'anchor'), rcmNode('anc-2', 0, 4, 'anchor'),
    rcmNode('anc-walk', 3, 4, 'anchor'), rcmNode('anc-far', 0, 16, 'anchor'),
    rcmNode('tag-1', 0, 0.001, 'tag', TAG_DBM),
  ]
  function runSceneB(rmnr: boolean): TLRecord[] {
    const nodes = SCENE_B.map((n) => ({ ...n, pos: { ...n.pos } }))
    const sc = rcmScenario(nodes, {
      method: 'ss', replyTime: 'embedded', nlos: false, tsNoisePs: 0, cfoNoisePpm: 0,
      rcmValidityRounds: 4, rmnr,
    })
    const sim = new Simulation(sc)
    const before = sim.runUntil(BLOCK_NS / 2).records
    const walker = nodes.find((n) => n.id === 'anc-walk')!
    walker.pos.y = 16
    walker.pos.x = 0
    return [...before, ...sim.runUntil(RUN_NS).records]
  }

  it('puts a 13-octet RMNR frame on the air, and the Guide states that size (design §3)', () => {
    const on = runSceneB(true)
    const sent = of(on, 'TX_START').filter((r) => r.frame.kind === 'uwbRmnr')
    expect(sent.length).toBeGreaterThan(0)
    for (const r of sent) {
      expect(r.frame.bytes).toBe(uwbRmnrBytes())
      expect(r.frame.bytes).toBe(13)
      expect(r.frame.uwb?.ies).toEqual(['RMNR'])
    }
    expect(uwbRmnrBytes()).toBe(13)
    expect(zh).toContain(`${uwbRmnrBytes()}`)
  })

  it('turns a silent timeout into a named reason, without moving a single range (design §3/§3.1)', () => {
    const off = runSceneB(false)
    const on = runSceneB(true)
    expect(of(off, 'UWB_RMNR')).toHaveLength(0)
    expect(of(on, 'UWB_RMNR').length).toBeGreaterThan(0)
    const timeoutsFor = (rs: TLRecord[]): number =>
      of(rs, 'UWB_TIMEOUT').filter((r) => r.node === 'tag-1' && r.peer === 'anc-walk').length
    expect(timeoutsFor(off)).toBeGreaterThan(0)
    // Those slots are no longer silent once rmnr is on: they leave no timeout for anc-walk.
    expect(timeoutsFor(on)).toBe(0)
    const ranges = (rs: TLRecord[]): unknown[] => of(rs, 'UWB_RANGE').map(({ seq, ...rest }) => rest)
    expect(ranges(on)).toEqual(ranges(off))
  })

  it('refuses rmnr at rcmValidityRounds 1', () => {
    const sc = rcmScenario(SCENE_A, { rmnr: true, rcmValidityRounds: 1 })
    expect(ScenarioSchema.safeParse(sc).success).toBe(false)
  })
})

describe('the RCM-validity / RMNR glossary terms, each with a provenance (design §1/§2/§3/§4)', () => {
  const group = GLOSSARY.find((g) => g.id === 'uwb')
  const find = (term: string) => (group?.items ?? []).find((i) => i.term.toLowerCase() === term.toLowerCase())

  it('carries both terms Task 5 adds', () => {
    for (const t of ['RCM Validity Rounds', 'RMNR']) expect(find(t), t).toBeDefined()
  })

  it('names a provenance on every one of them', () => {
    const marks = ['§10.32.9.1', '§10.34', '模型取值']
    for (const t of ['RCM Validity Rounds', 'RMNR']) {
      const item = find(t)!
      const text = `${item.alt} ${item.def}`
      expect(marks.some((m) => text.includes(m)), `"${t}" names no provenance`).toBe(true)
    }
  })

  it('the RCM Validity Rounds entry names the field width and the model’s own counting convention', () => {
    const item = find('RCM Validity Rounds')!
    expect(item.alt).toContain('§10.32.9.1')
    expect(item.def).toMatch(/0–63|0-63/)
    expect(item.alt).toContain('rcmValidityRounds')
  })

  it('the RMNR entry states the exact frame size and the three things a zero-content IE carries', () => {
    const item = find('RMNR')!
    expect(item.def).toContain('13')
    expect(item.def).toContain('谁在说话')
    expect(item.def).toContain('收到了')
    expect(item.def).toContain('没收到')
  })
})

describe('Guide section 18: receipt confirmation (standard §10.36; design §1-§6 of 2026-10-02-receipt-confirmation-design.md)', () => {
  const zh = renderGuide()

  it('renders the heading and names the frame and the request bit', () => {
    expect(zh).toContain('18 ·')
    expect(zh).toContain('§10.36')
    expect(zh).toContain('MMRCM')
    expect(zh).toContain('MMRCR')
  })

  it('states the two counts separately, and in the right order (design §6.1’s own correction)', () => {
    expect(zh).toContain('每个<b>发起方</b>一个——一个响应方可能听到好几个发起方')
    expect(zh).toContain('每个<b>响应方</b>一个——各自发自己收听到的那些发起方拼成的一帧')
  })

  it('distinguishes RMNR from the receipt bitmap along granularity, initiative and content — the section’s own point', () => {
    expect(zh).toContain('逐轮')
    expect(zh).toContain('整个有效轮次窗口')
    expect(zh).toContain('响应方自己——没等到启动消息就主动发')
    expect(zh).toContain('控制器——在 ARC IE 里置位 MMRCR 请求')
    expect(zh).toContain('本轮的测距启动消息没收到')
    expect(zh).toContain('窗口里我发出的那几条开场消息，你收到了哪几条')
  })

  // --- Measured: the N = 1/3/6 frame-size table, read off real many-to-many rounds ------------
  //
  // A two-way round only ever has one initiator (the tag), so N never varies there. The only mode
  // where one responder hears several initiators is 'm2m' — every participant answers every
  // earlier one in the same frame — so P = 2/4/7 participants give exactly N = P − 1 = 1/3/6
  // entries in the last participant's own MMRCM. `'m2m'` always runs at rcmValidityRounds 1, and
  // the bitmap stays one octet for any window of eight rounds or fewer (design §3.3), so these
  // figures are the same 15 + 3N the Guide's own R = 4 worked window states.
  const MS = 1_000_000
  const m2mNode = (id: string, x: number, y: number): NodeCfg => ({
    id, kind: 'uwb', name: id, pos: { x, y, z: 1 }, txPowerDbm: UWB_TX_POWER_DBM, profiles: ['idle'],
    caps: { generation: 'nonht', features: {} }, uwb: { role: 'anchor' },
  })
  const m2mScenario = (participants: number): Scenario => {
    // A tight cluster, well inside the engine's range at this power, so nothing is lost to path
    // loss and every participant hears every other one.
    const nodes = Array.from({ length: participants }, (_, i) => m2mNode(`p-${i}`, i, 0))
    return {
      rooms: [{ x: 0, y: 0, w: 20, h: 20, name: 'hall' }], walls: [], nodes, servers: [],
      seed: 7, rtsThresholdBytes: 3000, snapshotIntervalMs: 10,
      uwb: {
        ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss', schedule: 'time', replyTime: 'embedded',
        rcmValidityRounds: 1, mmrcr: true, nlos: false, tsNoisePs: 0, cfoNoisePpm: 0,
      },
    }
  }
  const of = <T extends TLRecord['type']>(rs: TLRecord[], type: T): Extract<TLRecord, { type: T }>[] =>
    rs.filter((r) => r.type === type) as never
  const PARTICIPANTS_FOR_N: Record<number, number> = { 1: 2, 3: 4, 6: 7 }

  it('the last participant’s MMRCM frame is 15 + 3N octets for N = 1, 3, 6, read off a real round', () => {
    for (const n of [1, 3, 6] as const) {
      const p = PARTICIPANTS_FOR_N[n]
      const sc = m2mScenario(p)
      const runNs = roundPlan(sc.uwb!, p).blockNs - MS
      const rs = new Simulation(sc).runUntil(runNs).records
      const last = `p-${p - 1}`
      const sent = of(rs, 'TX_START').filter((r) => r.node === last && r.frame.kind === 'uwbMmrcm')
      expect(sent.length, `N=${n}: p-${p - 1} sends one MMRCM`).toBeGreaterThan(0)
      for (const r of sent) {
        expect(r.frame.uwb?.mmrc?.length, `N=${n}`).toBe(n)
        expect(r.frame.bytes, `N=${n}`).toBe(uwbMmrcmBytes(n, 1))
      }
      // The figure this same run just measured is the one the Guide's table states.
      expect(zh).toContain(`>${uwbMmrcmBytes(n, 1)}<`)
    }
    // The Guide's own constants agree with the formula at the window it names.
    expect(uwbMmrcmBytes(1, 4)).toBe(18)
    expect(uwbMmrcmBytes(3, 4)).toBe(24)
    expect(uwbMmrcmBytes(6, 4)).toBe(33)
  })

  it('names the searched cap, not a literal', () => {
    const cap = uwbMaxMmrcmInitiators(4)
    expect(cap).toBeGreaterThan(0)
    expect(zh).toContain(`${cap}`)
  })

  it('sends no MMRCM at all when mmrcr is off — asking buys the answer, nothing else does', () => {
    const sc = m2mScenario(4)
    sc.uwb!.mmrcr = false
    const runNs = roundPlan(sc.uwb!, 4).blockNs - MS
    const rs = new Simulation(sc).runUntil(runNs).records
    expect(of(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbMmrcm')).toHaveLength(0)
  })

  // --- Measured: requesting costs nothing, and the answer never moves a range -------------------
  const rcmNode = (id: string, x: number, y: number, role: 'anchor' | 'tag'): NodeCfg => ({
    id, kind: 'uwb', name: id, pos: { x, y, z: 1 }, txPowerDbm: UWB_TX_POWER_DBM, profiles: ['idle'],
    caps: { generation: 'nonht', features: {} }, uwb: { role },
  })
  const twrScene: NodeCfg[] = [
    rcmNode('anc-1', 0, 0, 'anchor'), rcmNode('anc-2', 8, 0, 'anchor'),
    rcmNode('anc-3', 0, 6, 'anchor'), rcmNode('anc-4', 8, 6, 'anchor'),
    rcmNode('tag-1', 4, 3, 'tag'),
  ]
  const twrScenario = (mmrcr: boolean): Scenario => ({
    rooms: [{ x: 0, y: 0, w: 40, h: 30, name: 'hall' }], walls: [], nodes: twrScene, servers: [],
    seed: 7, rtsThresholdBytes: 3000, snapshotIntervalMs: 10,
    uwb: {
      ...DEFAULT_UWB_SESSION, method: 'ds', replyTime: 'embedded', nlos: false,
      rcmValidityRounds: 4, mmrcr,
    },
  })

  it('leaves the control message the same size whether or not MMRCR is set', () => {
    const openerBytes = (mmrcr: boolean): number[] => {
      const rs = new Simulation(twrScenario(mmrcr)).runUntil(roundPlan(DEFAULT_UWB_SESSION, 4).blockNs - MS).records
      return of(rs, 'TX_START')
        .filter((r) => r.node === 'tag-1' && (r.frame.kind === 'uwbPoll' || r.frame.kind === 'uwbInit'))
        .map((r) => r.frame.bytes)
    }
    expect(openerBytes(true)).toEqual(openerBytes(false))
  })

  it('leaves every UWB_RANGE record field-for-field the same whether or not MMRCR is set', () => {
    const ranges = (mmrcr: boolean): unknown[] => {
      const rs = new Simulation(twrScenario(mmrcr))
        .runUntil(4 * roundPlan(DEFAULT_UWB_SESSION, 4).blockNs - MS).records
      return of(rs, 'UWB_RANGE').map(({ seq, ...rest }) => rest)
    }
    expect(ranges(true)).toEqual(ranges(false))
  })
})

describe('the MMRCM / receipt-bitmap glossary terms, each with a provenance (standard §10.36; design §3/§4)', () => {
  const group = GLOSSARY.find((g) => g.id === 'uwb')
  const find = (term: string) => (group?.items ?? []).find((i) => i.term.toLowerCase() === term.toLowerCase())

  it('carries both terms task 4 adds', () => {
    for (const t of ['MMRCM', '收妥位图']) expect(find(t), t).toBeDefined()
  })

  it('names a provenance on every one of them', () => {
    const marks = ['§10.36', '模型取值']
    for (const t of ['MMRCM', '收妥位图']) {
      const item = find(t)!
      const text = `${item.alt} ${item.def}`
      expect(marks.some((m) => text.includes(m)), `"${t}" names no provenance`).toBe(true)
    }
  })

  it('the MMRCM entry names the byte formula and the two counts', () => {
    const item = find('MMRCM')!
    expect(item.def).toMatch(/15 \+ 3N/)
    expect(item.def).toContain('发起方')
    expect(item.def).toContain('响应方')
  })

  it('the receipt-bitmap entry ties each bit to RX_OK, not to a replay of records, and separates it from RMNR', () => {
    const item = find('收妥位图')!
    expect(item.def).toContain('RX_OK')
    expect(item.def).toContain('RMNR')
  })
})

describe('Guide section 19: SP3 grouped ranging (standard §10.32.8; SRRR IE §10.32.9.9)', () => {
  const zh = renderGuide()
  const us3 = (ns: number): string => (ns / 1000).toFixed(3)
  const SP3_MARKER_NS = uwbSp3Ns()
  const SP1_EMBEDDED_RESP_NS = uwbPpduNs(uwbRespBytes('ss', 'embedded'))
  const SP1_SHORTEST_RESP_NS = uwbPpduNs(uwbRespBytes('ds'))
  const SAVING_EMBEDDED_NS = SP1_EMBEDDED_RESP_NS - SP3_MARKER_NS
  const SAVING_SHORTEST_NS = SP1_SHORTEST_RESP_NS - SP3_MARKER_NS
  const REPORT_NS = uwbPpduNs(uwbSp3ReportBytes(false))
  const REPORT_RAOA_NS = uwbPpduNs(uwbSp3ReportBytes(true))
  const MULTIPLE_EMBEDDED = (REPORT_NS / SAVING_EMBEDDED_NS).toFixed(3)
  const MULTIPLE_SHORTEST = (REPORT_NS / SAVING_SHORTEST_NS).toFixed(3)
  const RCM_PER_RESPONDER_NS = uwbPpduNs(uwbSp3PollBytes(1)) - uwbPpduNs(uwbPollBytes(1))
  const NET_SAVING_NS = SAVING_SHORTEST_NS - RCM_PER_RESPONDER_NS
  const PAYBACK = (SP3_MARKER_NS / NET_SAVING_NS).toFixed(2)

  // A whole round's air time, built from the engine's own PPDU functions — the same arithmetic
  // the Guide's own module-scope constants use, so a drift in either fails here.
  const sp3RoundNs = (anchors: number, rrtt: boolean): number => {
    const rcm = uwbPpduNs(uwbSp3PollBytes(anchors))
    const markers = (anchors + 1) * SP3_MARKER_NS
    const reports = anchors * REPORT_NS
    const initReport = rrtt ? uwbPpduNs(uwbSp3InitReportBytes(anchors)) : 0
    return rcm + markers + reports + initReport
  }
  const sp1DeferredRoundNs = (anchors: number): number =>
    uwbPpduNs(uwbPollBytes(anchors))
      + anchors * uwbPpduNs(uwbRespBytes('ss', 'deferred')) + anchors * uwbPpduNs(UWB_SS_DEFER_BYTES)
  const sp1EmbeddedRoundNs = (anchors: number): number =>
    uwbPpduNs(uwbPollBytes(anchors)) + anchors * SP1_EMBEDDED_RESP_NS
  const crossover = (rrtt: boolean): number => {
    for (let a = 1; a <= 200; a++) if (sp3RoundNs(a, rrtt) <= sp1DeferredRoundNs(a)) return a
    throw new Error('no crossover found')
  }

  it('renders the heading, citing both clauses', () => {
    expect(zh).toContain('19 ·')
    expect(zh).toContain('§10.32.8')
    expect(zh).toContain('§10.32.9.9')
  })

  it('states the per-marker saving against both baselines, computed from the engine rather than retyped', () => {
    expect(SAVING_SHORTEST_NS).toBe(40256)
    expect(SAVING_EMBEDDED_NS).toBe(46410)
    expect(SP3_MARKER_NS).toBe(140962)
    expect(zh).toContain(`${us3(SAVING_EMBEDDED_NS)} µs`)
    expect(zh).toContain(`${us3(SAVING_SHORTEST_NS)} µs`)
  })

  it('states the report-phase cost and the two multiples, naming which baseline each one is against', () => {
    expect(zh).toContain(`${us3(REPORT_NS)} µs`)
    expect(MULTIPLE_EMBEDDED).toBe('3.971')
    expect(MULTIPLE_SHORTEST).toBe('4.578')
    expect(Number(MULTIPLE_SHORTEST)).toBeGreaterThan(Number(MULTIPLE_EMBEDDED))
    expect(zh).toContain(MULTIPLE_EMBEDDED)
    expect(zh).toContain(MULTIPLE_SHORTEST)
    const at = zh.indexOf(`${us3(REPORT_NS)} µs`)
    const nearby = zh.slice(at, at + 400)
    expect(nearby).toContain('嵌入式')
    expect(nearby).toContain('最短帧')
  })

  it('against SP1 embedded, SP3 is longer at every anchor count and the gap strictly widens (sp3-design §2.3)', () => {
    let prevGap = -Infinity
    for (let a = 1; a <= 10; a++) {
      const gap = sp3RoundNs(a, false) - sp1EmbeddedRoundNs(a)
      expect(gap, `A=${a}`).toBeGreaterThan(0)
      expect(gap, `A=${a} gap grows`).toBeGreaterThan(prevGap)
      prevGap = gap
    }
  })

  it('against SP1 deferred, there is a crossover at A = 4, and the pre-crossover gaps match the ones the report measured (sp3-design §2.3)', () => {
    const gap = (a: number): number => sp3RoundNs(a, false) - sp1DeferredRoundNs(a)
    expect(Math.round(gap(1) / 100) / 10).toBeCloseTo(103.8, 1)
    expect(Math.round(gap(2) / 100) / 10).toBeCloseTo(66.6, 1)
    expect(Math.round(gap(3) / 100) / 10).toBeCloseTo(35.6, 1)
    expect(gap(1)).toBeGreaterThan(0)
    expect(gap(2)).toBeGreaterThan(0)
    expect(gap(3)).toBeGreaterThan(0)
    expect(gap(4)).toBeLessThanOrEqual(0)
    expect(crossover(false)).toBe(4)
    expect(zh).toContain('4')
    expect(zh).toMatch(/交叉点.{0,6}4/)
  })

  it('with an RRTT request, the crossover moves to A = 11 (sp3-design §2.3)', () => {
    expect(crossover(true)).toBe(11)
    expect(zh).toMatch(/交叉点.{0,20}11/)
    // the no-RRTT crossover is unaffected by the RRTT-on search
    expect(crossover(false)).toBe(4)
  })

  it('a live round matches the formula exactly for A = 1…6 (the scene this engine can measure cleanly)', () => {
    const node = (id: string, x: number, role: 'anchor' | 'tag'): NodeCfg => ({
      id, kind: 'uwb', name: id, pos: { x, y: 0, z: 1 }, txPowerDbm: UWB_TX_POWER_DBM,
      profiles: ['idle'], caps: { generation: 'nonht', features: {} }, uwb: { role },
    })
    const totalNs = (anchors: number, session: Partial<UwbSessionCfg>): number => {
      const nodes: NodeCfg[] = [
        ...Array.from({ length: anchors }, (_, i) => node(`anc-${i + 1}`, i * 3, 'anchor')),
        node('tag-1', 1.5, 'tag'),
      ]
      const sc: Scenario = {
        rooms: [{ x: 0, y: 0, w: 40, h: 10, name: 'lab' }], walls: [], nodes, servers: [],
        seed: 7, rtsThresholdBytes: 3000, snapshotIntervalMs: 10,
        uwb: {
          ...DEFAULT_UWB_SESSION, mode: 'twr', method: 'ss', schedule: 'time',
          nlos: false, tsNoisePs: 0, cfoNoisePpm: 0, ...session,
        },
      }
      const recs = new Simulation(sc).runUntil(roundPlan(sc.uwb!, anchors).blockNs - 1).records
      return recs.filter((r) => r.type === 'TX_START')
        .reduce((s, r) => s + (r as { frame: { txTimeNs: number } }).frame.txTimeNs, 0)
    }
    for (const anchors of [1, 2, 3, 4, 5, 6]) {
      const emb = totalNs(anchors, { replyTime: 'embedded', sp3: false })
      const defr = totalNs(anchors, { replyTime: 'deferred', sp3: false })
      const sp3 = totalNs(anchors, { replyTime: 'deferred', sp3: true })
      expect(emb, `A=${anchors} embedded`).toBe(sp1EmbeddedRoundNs(anchors))
      expect(defr, `A=${anchors} deferred`).toBe(sp1DeferredRoundNs(anchors))
      expect(sp3, `A=${anchors} sp3`).toBe(sp3RoundNs(anchors, false))
    }
    // and with RRTT requested, at one anchor count small enough for this scene to measure cleanly
    const withRrtt = totalNs(4, { replyTime: 'deferred', sp3: true, srrr: { raoa: false, rrtt: true } })
    expect(withRrtt).toBe(sp3RoundNs(4, true))
  })

  it('states the RAOA report-size difference exactly, and it is the bearing item alone', () => {
    expect(REPORT_RAOA_NS - REPORT_NS).toBe(4102)
    expect(zh).toContain(us3(REPORT_NS))
    expect(zh).toContain(us3(REPORT_RAOA_NS))
  })

  it('states the net-saving arithmetic that explains the crossover: 40.256 less the RCM cost is 37.179, and the marker pays back at the fourth responder', () => {
    expect(RCM_PER_RESPONDER_NS).toBe(3077)
    expect(NET_SAVING_NS).toBe(37179)
    expect(PAYBACK).toBe('3.79')
    expect(zh).toContain(us3(SP3_MARKER_NS))
    expect(zh).toContain(us3(NET_SAVING_NS))
    expect(zh).toContain(PAYBACK)
  })

  it('contrasts SRRR against MMRCR: the request costs 3 octets per responder, MMRCR costs none, both are answered by a whole frame', () => {
    expect(SRRR_IE_BYTES).toBe(3)
    expect(zh).toContain(`${SRRR_IE_BYTES} 字节`)
    expect(zh).toMatch(/MMRCR[\s\S]{0,350}0 字节/)
  })

  it('does not use any of the wording contract’s banned cost-framing words, even though no test polices this file by default', () => {
    for (const w of ['更贵', '账', '买到', '省钱', '白费', '值钱']) expect(zh, w).not.toContain(w)
  })
})

describe('the EditorGuide SP3 / SRRR sections', () => {
  // Rendered, not read off the source — the same discipline the MMS section test above uses.
  const zh = renderToStaticMarkup(createElement(EditorGuide))
  const section = (html: string, from: string, to: string): string => {
    const start = html.indexOf(from)
    expect(start, `heading not rendered: ${from}`).toBeGreaterThan(-1)
    const end = html.indexOf(to, start)
    expect(end, `next heading not rendered: ${to}`).toBeGreaterThan(start)
    return html.slice(start, end)
  }
  const zhSp3 = section(zh, 'SP3 分组测距', 'SRRR 请求到达角')
  const zhSrrr = section(zh, 'SRRR 请求到达角', '到达角（AoA）</b>')

  it('describes the sp3 checkbox, its mode/schedule/reply-time restrictions, and points at the Guide for the crossover', () => {
    for (const marker of ['§10.32.8', 'SYNC', 'SFD', 'STS', '延后', '单边双向', '竞争调度', '第 19 节']) {
      expect(zhSp3, marker).toContain(marker)
    }
  })

  it('describes both SRRR request bits, the method restriction, and the MMRCR contrast', () => {
    for (const marker of ['请求到达角', '请求往返时间', '单边双向', 'MMRCR', '3 个字节']) {
      expect(zhSrrr, marker).toContain(marker)
    }
  })

  it('does not use any of the wording contract’s banned cost-framing words', () => {
    for (const w of ['更贵', '账', '买到', '省钱', '白费', '值钱', '划算']) {
      expect(zhSp3, w).not.toContain(w)
      expect(zhSrrr, w).not.toContain(w)
    }
  })
})

describe('the SP3 / SRRR glossary terms, each with a provenance (sp3-design, task 4)', () => {
  const group = GLOSSARY.find((g) => g.id === 'uwb')
  const find = (term: string) => (group?.items ?? []).find((i) => i.term.toLowerCase() === term.toLowerCase())
  const us3 = (ns: number): string => (ns / 1000).toFixed(3)

  it('carries both terms task 4 adds', () => {
    for (const t of ['SP3 包', 'SRRR IE']) expect(find(t), t).toBeDefined()
  })

  it('names a provenance on every one of them', () => {
    const marks = ['§10.32.8', '§10.32.9.9', '§10.36']
    for (const t of ['SP3 包', 'SRRR IE']) {
      const item = find(t)!
      const text = `${item.alt} ${item.def}`
      expect(marks.some((m) => text.includes(m)), `"${t}" names no provenance`).toBe(true)
    }
  })

  it('the SP3 packet entry states the crossover arithmetic, matching the engine', () => {
    const item = find('SP3 包')!
    const sp3Ns = uwbSp3Ns()
    const shortestNs = uwbPpduNs(uwbRespBytes('ds'))
    const embeddedNs = uwbPpduNs(uwbRespBytes('ss', 'embedded'))
    const reportNs = uwbPpduNs(uwbSp3ReportBytes(false))
    const rcmPerResponder = uwbPpduNs(uwbSp3PollBytes(1)) - uwbPpduNs(uwbPollBytes(1))
    const netSaving = (shortestNs - sp3Ns) - rcmPerResponder
    expect(item.def).toContain(us3(sp3Ns))
    expect(item.def).toContain(us3(netSaving))
    expect(item.def).toContain((sp3Ns / netSaving).toFixed(2))
    expect(item.def).toContain('四个')
    expect(item.def).not.toContain(us3(reportNs - embeddedNs)) // sanity: not quoting an unrelated figure
  })

  it('the SRRR entry states the byte formula, the method restriction, and the exact RAOA size difference', () => {
    const item = find('SRRR IE')!
    expect(item.def).toMatch(/3\s*字节/)
    expect(item.def).toMatch(/单边双向/)
    const noRaoa = uwbPpduNs(uwbSp3ReportBytes(false))
    const raoa = uwbPpduNs(uwbSp3ReportBytes(true))
    expect(item.def).toContain(us3(noRaoa))
    expect(item.def).toContain(us3(raoa))
    expect(item.def).toContain(us3(raoa - noRaoa))
    expect(item.def).toContain('十一')
  })

  it('does not use any of the wording contract’s banned cost-framing words', () => {
    for (const t of ['SP3 包', 'SRRR IE']) {
      const item = find(t)!
      for (const w of ['更贵', '账', '买到', '省钱', '白费', '值钱']) {
        expect(`${item.alt} ${item.def}`, `${t}: ${w}`).not.toContain(w)
      }
    }
  })
})
