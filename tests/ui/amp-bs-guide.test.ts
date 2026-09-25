/**
 * The learner-facing reference text for the mono-static backscatter slice (A2): the Guide's
 * "Backscatter (mono-static)" subsection under Ambient power, the glossary's new `amp` group
 * terms and the README's conformance/simplification rows. Same discipline as
 * tests/ui/uwb-guide.test.ts: a figure the prose quotes that the engine also computes is pinned
 * against the engine, so a moved constant fails here instead of the text quietly going stale.
 */
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import {
  AMP_BS_ACTIVATION_DBM, AMP_BS_ISOLATION_DB, AMP_BS_LOSS_DB, AMP_BS_READER_DR_DB,
  AMP_BS_REQ_SNR_DB, activationReachM, bsReplyNs, monoReachM,
} from '../../src/engine/ampBs'
import { EditorGuide } from '../../src/editor/EditorGuide'
import { Guide } from '../../src/ui/Guide'
import { GLOSSARY } from '../../src/ui/glossary'
import { STRINGS } from '../../src/ui/i18n'

const README = readFileSync(new URL('../../README.md', import.meta.url), 'utf8')

/** The prose writes a Unicode minus, not an ASCII hyphen. */
const dbm = (v: number): string => `${v} dBm`.replace('-', '−')
/** A string that carries at least one CJK ideograph. */
const hasCjk = (s: string): boolean => /[一-鿿]/.test(s)

const REACH_250_CM = (monoReachM(0, 250) * 100).toFixed(1)
const REACH_1000_CM = (monoReachM(0, 1000) * 100).toFixed(1)
const ACTIVATION_10_CM = (activationReachM(10) * 100).toFixed(1)
const ACTIVATION_20_CM = (activationReachM(20) * 100).toFixed(1)

/** The Guide body, rendered (as uwb-guide.test.ts does). */
function renderGuide(): string {
  return renderToStaticMarkup(createElement(Guide))
}

describe('reach and activation figures, computed fresh from ampBs.ts', () => {
  it('match the numbers the spec and the task reports quote', () => {
    expect(REACH_250_CM).toBe('32.8')
    expect(REACH_1000_CM).toBe('23.2')
    expect(ACTIVATION_10_CM).toBe('30.9')
    expect(ACTIVATION_20_CM).toBe('97.8')
  })
})

describe('Guide: Backscatter (mono-static) subsection', () => {
  const zh = renderGuide()

  it('renders the heading, after the Ambient power heading', () => {
    // toContain first on every heading the ordering check leans on — otherwise a heading that
    // silently disappeared would leave indexOf at -1 and the "-1 < n" comparison would still pass.
    expect(zh).toContain('10 · 环境能量')
    expect(zh).toContain('反向散射（单站式）')
    expect(zh).toContain('11 · UWB 测距')
    expect(zh.indexOf('10 · 环境能量')).toBeLessThan(zh.indexOf('反向散射（单站式）'))
    expect(zh.indexOf('反向散射（单站式）')).toBeLessThan(zh.indexOf('11 · UWB 测距'))
  })

  it('states the reply reach and the activation reach, pinned to the engine', () => {
    expect(zh).toContain(`${REACH_250_CM} cm`)
    expect(zh).toContain(`${REACH_1000_CM} cm`)
    expect(zh).toContain(`${ACTIVATION_10_CM} cm`)
    expect(zh).toContain(`${ACTIVATION_20_CM} cm`)
    expect(zh).toContain(dbm(AMP_BS_ACTIVATION_DBM))
  })

  it('states that a tag beyond activation reach never boots', () => {
    expect(zh).toContain('永远不会启动')
  })

  it('states the self-leakage and dynamic-range figures the reader model uses', () => {
    expect(zh).toContain(`${AMP_BS_ISOLATION_DB} dB`)
    expect(zh).toContain(`${AMP_BS_READER_DR_DB} dB`)
    expect(zh).toContain(`${AMP_BS_LOSS_DB} dB`)
  })

  it('names the Gen2 inventory terms', () => {
    expect(zh).toContain('EPC Gen2')
    expect(zh).toContain('RN16')
    expect(zh).toContain('WUP-Excitation')
    expect(zh).toContain('BST-Excitation')
  })
})

describe('AMP glossary group: the new backscatter terms', () => {
  const group = GLOSSARY.find((g) => g.id === 'amp')

  it('exists and covers every new term', () => {
    expect(group).toBeDefined()
    const terms = (group?.items ?? []).map((i) => i.term.toLowerCase())
    for (const t of [
      'backscatter', 'mono-static', 'wup-excitation', 'bst-excitation', 'epc gen2',
      'q / slot counter', 'rn16', 'epc', 'reader dynamic range', 'self-leakage',
    ]) {
      expect(terms, `missing glossary term: ${t}`).toContain(t)
    }
  })

  it('reads in plain words: no engine identifiers anywhere in the group', () => {
    // The Guide and the README carry the provenance, and the document tags stay here too
    // (TGbp 11-25/0307r0 is a citation, not a symbol). What does not belong on the learner's
    // plain-words surface is the engine's own spelling of a number. Names the standard itself
    // uses — AC_BK, aSIFSTime, ISO/IEC — are vocabulary a learner will meet again; these two
    // patterns are ours and only ours: every constant of this tier is AMP_…, and every field or
    // helper of it ends in the unit or the type it carries.
    const ENGINE_CONSTANT = /\bAMP_[A-Z0-9_]+\b/
    const ENGINE_SYMBOL = /\b([a-z][A-Za-z0-9]*(Dbm|Ns|Ms|Kbps|Db|Cfg)|Amp[A-Z][A-Za-z]*)\b/
    for (const item of group?.items ?? []) {
      for (const text of [item.term, item.alt, item.def]) {
        expect(text.match(ENGINE_CONSTANT)?.[0], `${item.term}: engine constant`).toBeUndefined()
        expect(text.match(ENGINE_SYMBOL)?.[0], `${item.term}: engine identifier`).toBeUndefined()
      }
    }
  })

  it('the Backscatter entry no longer says it is unmodeled', () => {
    const item = group?.items.find((i) => i.term.toLowerCase() === 'backscatter')
    expect(item?.def.toLowerCase()).not.toContain('not modeled')
    expect(item?.def).not.toContain('尚未建模')
  })

  it('every new term has alt and def text, in real Chinese', () => {
    const newTerms = [
      'backscatter', 'mono-static', 'wup-excitation', 'bst-excitation', 'epc gen2',
      'q / slot counter', 'rn16', 'epc', 'reader dynamic range', 'self-leakage',
    ]
    for (const t of newTerms) {
      const item = group?.items.find((i) => i.term.toLowerCase() === t)
      expect(item, t).toBeDefined()
      expect(item!.alt, `${t}.alt`).toBeTruthy()
      expect(item!.def, `${t}.def`).toBeTruthy()
      expect(hasCjk(item!.def), `${t}.def is not Chinese`).toBe(true)
    }
  })

  it('quotes the reach and activation figures where the terms discuss them', () => {
    const wup = group?.items.find((i) => i.term.toLowerCase() === 'wup-excitation')
    expect(wup?.def).toContain(`${ACTIVATION_10_CM} cm`)
    expect(wup?.def).toContain(`${ACTIVATION_20_CM} cm`)
  })

  it('pins the RN16 entry\'s airtime to bsReplyNs, not a retyped literal', () => {
    const rn16Ns = bsReplyNs('rn16', 250)
    expect(rn16Ns).toBe(112_000) // 48 µs sync + 64 µs data
    const item = group?.items.find((i) => i.term.toLowerCase() === 'rn16')
    for (const text of [item?.alt, item?.def]) {
      expect(text).toContain(`${rn16Ns / 1000} µs`)
    }
  })

  it('the BST-Excitation entry is plain words: no bare T1/T3/T4 symbols, and states how long in prose', () => {
    const item = group?.items.find((i) => i.term.toLowerCase() === 'bst-excitation')
    expect(item?.def).not.toMatch(/T1|T3|T4/)
    expect(item?.def).toContain('2 毫秒')
  })

  it('the EPC Gen2 entry expands SFD on first use', () => {
    const item = group?.items.find((i) => i.term.toLowerCase() === 'epc gen2')
    expect(item?.def).toContain('框架文档（SFD）')
  })
})

describe('EditorGuide: one entry per new control', () => {
  const zh = renderToStaticMarkup(createElement(EditorGuide))
  /** The section, from its own heading to the next one — so a marker cannot be satisfied by some
   * other part of a very long panel (same helper as tests/ui/uwb-guide.test.ts). */
  const section = (html: string, from: string, to: string): string => {
    const start = html.indexOf(from)
    expect(start, `heading not rendered: ${from}`).toBeGreaterThan(-1)
    const end = html.indexOf(to, start)
    expect(end, `next heading not rendered: ${to}`).toBeGreaterThan(start)
    return html.slice(start, end)
  }
  const zhSection = section(zh, 'AMP 反向散射（RFID 盘点）', 'UWB 测距会话')

  it('documents every new control, inside its own section', () => {
    for (const marker of [
      '模式', 'EPC', 'RFID 盘点', '>Q<', '上行速率', '唤醒载波', '充能功率', '散射窗功率',
      'TXOP', 'ACK 后读取', '读取后写入',
    ]) {
      expect(zhSection, marker).toContain(marker)
    }
  })

  it('reuses the mode select\'s own strings from i18n', () => {
    expect(STRINGS.editor.ampModes.active).toContain('主动发射')
    expect(STRINGS.editor.ampModes.backscatter).toContain('反向散射')
  })

  it('the Charge power / BS power entries quote the reach and activation figures, pinned to the engine', () => {
    expect(zhSection).toContain(`${ACTIVATION_10_CM} cm`)
    expect(zhSection).toContain(`${ACTIVATION_20_CM} cm`)
    expect(zhSection).toContain(`${REACH_250_CM}`)
    expect(zhSection).toContain(`${REACH_1000_CM}`)
  })
})

/**
 * Important #3 of the review: the constraint asks for engine-computed numbers "where a test can
 * check them" — the Guide already imports the constants directly, but EditorGuide and the i18n
 * hints only ever held retyped literals, so a moved engine constant could go stale there with a
 * green suite. These are the two places that were missing; every other learner-facing surface is
 * covered above (Guide) or in the README describe block below.
 */
describe('i18n hints quote the reach and activation figures, pinned to the engine', () => {
  it('ampBsChargeHint and ampBsWupHint (activation)', () => {
    const E = STRINGS.editor
    expect(E.ampBsChargeHint).toContain(`${ACTIVATION_10_CM} cm`)
    expect(E.ampBsChargeHint).toContain(`${ACTIVATION_20_CM} cm`)
  })

  it('ampBsBsHint (reply reach)', () => {
    const E = STRINGS.editor
    expect(E.ampBsBsHint).toContain(`${REACH_250_CM} cm`)
    expect(E.ampBsBsHint).toContain(`${REACH_1000_CM} cm`)
  })

  it('bsSnrHint names the margin each uplink rate needs, both of them', () => {
    // The hint used to quote the 250 kb/s bar alone, which reads as *the* threshold; the faster
    // answer needs 6 dB more, and that is the whole reason the rate is a knob.
    const hint = STRINGS.inspector.bsSnrHint
    expect(hint).toContain(`${AMP_BS_REQ_SNR_DB[250]} dB`)
    expect(hint).toContain(`${AMP_BS_REQ_SNR_DB[1000]} dB`)
  })
})

describe('README: backscatter conformance and simplifications', () => {
  it('carries a conformance row for each tagged constant', () => {
    for (const tag of ['11-24/0537r0', '11-25/0058r1', '11-25/0307r0', 'PM-74', 'FM-44']) {
      expect(README, `missing tag: ${tag}`).toContain(tag)
    }
  })

  it('quotes the reach and activation figures, pinned to the engine', () => {
    expect(README).toContain(`${REACH_250_CM} cm`)
    expect(README).toContain(`${REACH_1000_CM} cm`)
    expect(README).toContain(`${ACTIVATION_10_CM} cm`)
    expect(README).toContain(`${ACTIVATION_20_CM} cm`)
  })

  it('no longer claims backscatter is unimplemented, and states mono-static is modelled', () => {
    expect(README).not.toContain('backscatter (mono-/bistatic), the energizer, wireless power transfer and energy harvesting are not implemented yet')
    expect(README).toContain('mono-static backscatter')
  })

  it('records the new simplifications: nominal T1, no Q-adaptation, Friis below 1 m, two powers in one PPDU', () => {
    // Exact phrases, not the bare word "nominal" (which also matches unrelated prose elsewhere).
    expect(README).toContain('Backscatter timing is nominal')
    expect(README).toContain('T1 (16 µs) is fixed rather than resampled every reply')
    expect(README).toContain("Q-adaptation (QueryAdjust) is not modelled")
    expect(README).toContain('free-space (Friis), not the indoor Wi-Fi law')
    expect(README).toContain('5 cm floor')
    expect(README).toContain('two powers in one frame')
  })

  it('tags every conformance row the way the spec tags it: model split, PM-57, and T3\'s own contribution', () => {
    const row = (marker: string) => README.split('\n').find((l) => l.includes(marker)) ?? ''
    const dl = row('Backscatter DL PPDU: two excitations')
    expect(dl, 'DL PPDU row').toContain('model (the two-power split)')
    const ul = row('Backscatter UL PPDU')
    expect(ul, 'UL PPDU row').toContain('PM-57')
    expect(ul, 'UL PPDU row').toContain('model reading of PM-35')
    const bst = row('BST-Excitation timing')
    expect(bst, 'BST timing row').toContain('11-26/0120r0')
  })
})
