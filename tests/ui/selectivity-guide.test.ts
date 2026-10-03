/**
 * The learner-facing reference text for frequency selectivity: the Guide's section on it, the
 * glossary's `Frequency selectivity` entry, and the editor panel's own description.
 *
 * Three surfaces print the same handful of figures, and until this file existed nothing held
 * them to the engine. The shape is `tests/ui/uwb-guide.test.ts`'s, which the UWB and AMP sides
 * already use in a dozen places: render `Guide`, read `EditorGuide.tsx` as source text, and
 * assert the numbers **recomputed from the engine** appear in both — never a literal typed a
 * second time here. `src/engine/selectivity.ts` says it of its own constant ("Computed, not
 * written as 2.03125"), and a test that writes `2.03125` would be the fourth copy of exactly
 * the number that comment refuses to have a copy of.
 *
 * What is *not* recomputed here: the five pooled drop rates, the two worst-bin means and the
 * loss median. Those come from measurement runs that take minutes
 * (`tests/engine/selectivity-inert.test.ts`, `-round.test.ts`, `selectivity.test.ts` own them),
 * so the three surfaces are instead held to agreeing with each other, and the one figure that
 * *is* arithmetic on an engine formula — the noise floor's rise from 20 to 320 MHz — is
 * recomputed, the precedent `tests/course/width.test.ts` set for the same number.
 */
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import { noiseDbm } from '../../src/engine/phy'
import { RU26_TONES, DF_EHT_KHZ, selBinWidthMhz, selBins } from '../../src/engine/selectivity'
import { selectivityRefusals } from '../../src/model/scenario'
import { Guide } from '../../src/ui/Guide'
import { GLOSSARY } from '../../src/ui/glossary'
import { STRINGS } from '../../src/ui/i18n'

/**
 * Every run of whitespace flattened to one space. Both sources wrap a sentence across JSX
 * lines, so `从 20 到 320 MHz` is `从 20 到
        320 MHz` on disk — a phrase this file has to
 * be able to ask about without knowing where the author's line breaks fell.
 */
const flat = (s: string): string => s.replace(/\s+/g, ' ')

/** The editor panel's prose, read as source text — the same way uwb-guide.test.ts reads it. */
const EDITOR_GUIDE = flat(readFileSync(new URL('../../src/editor/EditorGuide.tsx', import.meta.url), 'utf8'))

/** The Guide body, rendered. */
const GUIDE = flat(renderToStaticMarkup(createElement(Guide)))

/** The glossary entry under test. */
const ENTRY = GLOSSARY.flatMap((g) => g.items).find((i) => i.term === 'Frequency selectivity')

/** The editor checkbox's own hint, which is the fourth surface and the shortest. */
const HINT = STRINGS.editor.selectivityOnHint

/** Every surface that prints these figures, so one loop covers all of them. */
const SURFACES: [string, string][] = [
  ['Guide', GUIDE],
  ['EditorGuide', EDITOR_GUIDE],
  ['glossary', `${ENTRY?.alt ?? ''} ${ENTRY?.def ?? ''}`],
]

/** The five widths the three surfaces all enumerate. */
const WIDTHS = [20, 40, 80, 160, 320]

const WIDEST = WIDTHS[WIDTHS.length - 1]
const NARROWEST = WIDTHS[0]

describe('the bin geometry is quoted from the engine, not typed again', () => {
  it('has a glossary entry at all', () => {
    expect(ENTRY).toBeDefined()
    expect(ENTRY?.def).toBeTruthy()
  })

  it('prints the bin width every surface claims, recomputed from the two standard numbers', () => {
    // Not `2.03125`: the width is 26 tones x 78.125 kHz, and the engine's own comment forbids
    // writing the product down. If either constant is ever corrected, this test moves with it
    // and the prose that did not move fails.
    const mhz = String(selBinWidthMhz())
    expect(mhz).toBe(String((RU26_TONES * DF_EHT_KHZ) / 1000))
    for (const [name, text] of SURFACES) {
      expect(text, `${name} is missing the bin width ${mhz} MHz`).toContain(`${mhz} MHz`)
    }
    expect(HINT, 'the checkbox hint is missing the bin width').toContain(`${mhz} MHz`)
  })

  it('prints the five bin counts as `selBins` computes them, in width order', () => {
    const counts = WIDTHS.map((w) => String(selBins(w))).join('/')
    expect(counts).toBe('9/18/36/72/144')
    for (const [name, text] of SURFACES) {
      expect(text, `${name} is missing the bin counts ${counts}`).toContain(counts)
    }
    expect(HINT, 'the checkbox hint is missing the bin counts').toContain(counts)
  })

  it('prints the five widths themselves beside those counts', () => {
    const widths = WIDTHS.join('/')
    for (const [name, text] of SURFACES) {
      expect(text, `${name} is missing the width list ${widths}`).toContain(widths)
    }
  })

  it('prints the subcarrier spacing the bin width is derived from', () => {
    const khz = `${DF_EHT_KHZ} kHz`
    for (const [name, text] of SURFACES) {
      expect(text, `${name} is missing the spacing ${khz}`).toContain(khz)
    }
  })
})

describe('the wide-channel cost is recomputed, not quoted', () => {
  it('states the noise floor’s rise from the narrowest width to the widest', () => {
    // The same arithmetic `selectivityScenario` lifts both radios by, and the one figure in this
    // passage that is a formula rather than a measurement — so it is computed here.
    const riseDb = (Math.round((noiseDbm(WIDEST) - noiseDbm(NARROWEST)) * 100) / 100).toFixed(2)
    expect(riseDb).toBe('12.04')
    for (const [name, text] of SURFACES) {
      expect(text, `${name} is missing the ${riseDb} dB noise-floor rise`).toContain(`${riseDb} dB`)
      // And it has to say over what span, or it reads as 12.04 dB per doubling.
      expect(text, `${name} states ${riseDb} dB without its span`)
        .toContain(`从 ${NARROWEST} 到 ${WIDEST} MHz`)
    }
  })

  it('credits the recovery to frequency diversity, the reviewed lesson’s own word', () => {
    // `width`'s limits entry ends on 频率分集 (the diversity inside the loss), not 频率选择性
    // (the loss itself). Selectivity does not give part of the noise floor back; the diversity
    // it contains does.
    for (const [name, text] of SURFACES) {
      if (!text.includes('只把其中一部分补回来')) continue
      expect(text, `${name} says selectivity gives part of it back`)
        .not.toContain('频率选择性只把其中一部分补回来')
      expect(text, `${name} does not credit frequency diversity`).toContain('频率分集')
    }
  })
})

describe('the figures that come from a measurement run agree across the surfaces', () => {
  // Re-measured under Task 6c's PPDU-format gate: the two worst-bin means and the loss median
  // are draw statistics and did not move (tests/engine/selectivity.test.ts), while the pooled
  // drop rates did — 14.39/0.52 % became 14.66/0.75 % once the non-HT ACKs left the per-bin
  // path (tests/engine/selectivity-inert.test.ts).
  const MEASURED = ['12.05 dB', '24.09 dB', '2.36 dB', '3.62 dB', '14.66 %', '0.75 %']

  it('quotes the same measured set everywhere it quotes any of it', () => {
    for (const [name, text] of SURFACES) {
      for (const n of MEASURED) {
        expect(text, `${name} is missing ${n}`).toContain(n)
      }
    }
  })

  it('warns that the two worst-bin figures are means over many draws', () => {
    // Without this the reader meets 12.05 dB here and about 10 dB in one run's own WIFI_SEL
    // line, and concludes the reference text is wrong. The reviewed lesson
    // (src/course/tier2/selectivity.ts) carries the warning; these three did not.
    //
    // The caveat is asserted, the figure behind it is not: the single-round median depends on
    // which variant and how long (10.21 dB over the engine's 200 ms sweep, 10.29 dB over the
    // lesson's own 150 ms variant), so these three say "about 10 dB" and the lesson keeps the
    // decimal. A fourth home for that number is exactly what this slice spent its last commit
    // removing.
    for (const [name, text] of SURFACES) {
      expect(text, `${name} quotes 12.05 dB with no single-round caveat`).toContain('约 10 dB')
      expect(text, `${name} pins a single-round decimal of its own`).not.toContain('10.1 dB')
    }
  })

  it('says drop *rate* rather than drop count, in every surface that compares the widths', () => {
    for (const [name, text] of SURFACES) {
      if (!text.includes('14.39')) continue
      expect(text, `${name} never says the margins are comparable`).toContain('余量可比')
      // 掉帧数 may appear only inside the sentence that rules it out.
      if (text.includes('掉帧数')) {
        expect(text, `${name} compares drop counts`).toContain('不是掉帧数')
      }
    }
  })

  it('never claims a strong link drops more frames because of selectivity', () => {
    for (const [name, text] of SURFACES) {
      expect(text, `${name} predicts more drops on a strong link`)
        .not.toContain('信道越宽，踩到这种坑的机会越多')
    }
  })

  it('quotes neither open-loop figure, which belong to a different data set', () => {
    for (const [name, text] of SURFACES) {
      for (const n of ['34.43', '7.14']) {
        expect(text, `${name} quotes ${n}`).not.toContain(n)
      }
    }
  })

  it('carries none of the pre-correction drop rates', () => {
    // The figures these three printed before the PPDU-format gate. A surface still holding one
    // of them is a surface that was missed, and it would contradict the lesson once the course
    // pass lands the new column.
    for (const [name, text] of SURFACES) {
      for (const n of ['14.39', '12.71', '9.48', '5.09', '0.52']) {
        expect(text, `${name} still quotes the pre-correction ${n}`).not.toContain(n)
      }
    }
  })
})

describe('the editor panel states no rule the schema states', () => {
  it('does not restate any refusal sentence, which the checkbox prints from the schema', () => {
    // M3: the three rules were lifted into `selectivityRefusals` so the grey box and the schema
    // could not word them two ways — and then the panel's description grew a third wording, with
    // its third rule's parenthesis word for word identical to the refusal's. Nothing is allowed
    // to hold a copy: the editor renders the refusals, the panel's description points at them.
    const refusals = [
      ...selectivityRefusals({ fading: undefined, nodes: [] }),
      ...selectivityRefusals({ fading: { shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'none' }, nodes: [] }),
    ]
    expect(refusals.length).toBeGreaterThanOrEqual(3)
    for (const message of refusals) {
      // The distinctive middle of each refusal, past its shared opening and its "or remove
      // selectivity" tail — a substring long enough that an incidental match is not credible.
      const core = message.slice(message.indexOf('：') + 1, message.indexOf('：') + 25)
      expect(core.length).toBeGreaterThan(10)
      expect(EDITOR_GUIDE, `EditorGuide restates a refusal: ${core}`).not.toContain(core)
    }
  })

  it('points the reader at the checkbox’s own red line instead', () => {
    expect(EDITOR_GUIDE).toContain('selectivityRefusals')
  })
})

describe('the 26-tone RU carries its English name wherever it is introduced', () => {
  it('names it in every surface that uses the Chinese term', () => {
    const surfaces: [string, string][] = [...SURFACES, ['selectivityOnHint', HINT]]
    for (const [name, text] of surfaces) {
      if (!text.includes('26 音调资源单元')) continue
      expect(text, `${name} introduces 26 音调资源单元 with no English name`)
        .toContain('26-tone RU')
    }
  })

  it('names capture effect in English too, where it lists what still reads the flat sample', () => {
    for (const [name, text] of [...SURFACES, ['selectivityOnHint', HINT]] as [string, string][]) {
      if (!text.includes('捕获效应')) continue
      expect(text, `${name} says 捕获效应 with no English name`).toContain('capture effect')
    }
  })
})
