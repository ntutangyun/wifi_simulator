/**
 * Unit tests for the readability rule functions. They are the vocabulary the
 * course-wide readability test speaks in, so they are pinned on their own:
 * a rule that quietly stops seeing an acronym or a citation would let a dense
 * lesson through without a single test turning red.
 */
import { describe, it, expect } from 'vitest'
import { acronyms, numericQuantities, CITATION, enWords, zhChars, KNOWN_WORDS, paragraphTexts } from '../../src/course/readability'
import { N, type Block } from '../../src/course/lessonKit'

describe('readability rules', () => {
  it('finds acronyms and leaves protocol names, units and record names alone', () => {
    expect(acronyms('The STS — the timing sequence — follows the SFD in 802.11bp and Wi-Fi 7; see TX_START.'))
      .toEqual(['STS', 'SFD'])
    expect(acronyms('An A-MPDU behind an L-SIG')).toEqual(['A-MPDU', 'L-SIG'])
    expect(acronyms('CTS-to-self ends the NAV')).toEqual(['CTS', 'NAV'])
    expect(acronyms('5 dBm at 2.4 GHz for 16 µs')).toEqual([])
  })
  it('counts numeric quantities, grouping spaced thousands, ignoring protocol names', () => {
    expect(numericQuantities('five metres is 16.678 ns, or 1 065.7 ticks, in 802.15.4')).toBe(2)
    expect(numericQuantities('336 207 494 656 minus 336 335 290 928')).toBe(2)
    expect(numericQuantities('Wi-Fi 7 routers')).toBe(0)
  })
  it('spots citations in either language and nothing else', () => {
    for (const s of ['§10.29.1.1', 'Clause 16', 'IEEE Std 802.15.4-2024', 'P802.11bp', '11-24/1613r20', '15-23/0100r2', 'PM-87', 'D0.5', 'the draft', 'TBD', 'a model choice', '草案', '标准正文', '模型取值'])
      expect(CITATION.test(s), s).toBe(true)
    for (const s of ['a drafty room', 'the anchor answers the poll', '锚点作答'])
      expect(CITATION.test(s), s).toBe(false)
  })
  it('counts words and CJK characters', () => {
    expect(enWords('one two  three')).toBe(3)
    expect(zhChars('一二三 abc，四')).toBe(4)
  })
  it('reads headings and list items as prose, and leaves table cells and formula bodies out', () => {
    const blocks: Block[] = [
      { heading: N('What the tag does'), text: N('A tag with no battery cannot listen.') },
      { kind: 'watch', text: N('Press play and watch the second slot.') },
      { kind: 'list', heading: N('Three things happen'), items: [N('the reader asks'), N('the tag answers')] },
      { kind: 'steps', items: [N('arm the slot'), N('send the answer')] },
      { kind: 'formula', heading: N('Airtime'), text: N('T = L / R'), note: N('L is the length in bits.') },
      { kind: 'table', heading: N('Where the values come from'), head: [N('what'), N('where')], rows: [[N('16 µs'), N('§9.3.7')]] },
      { kind: 'widget', widget: 'linkBudget', caption: N('Drag the distance slider.') },
    ]
    expect(paragraphTexts(blocks).map((l) => l.en)).toEqual([
      'What the tag does', 'A tag with no battery cannot listen.',
      'Press play and watch the second slot.',
      'Three things happen', 'the reader asks', 'the tag answers',
      'arm the slot', 'send the answer',
      'Airtime', 'L is the length in bits.',
      'Where the values come from',
      'Drag the distance slider.',
    ])
  })
  it('so a citation hiding in a list item or a heading is caught', () => {
    const sneaky: Block[] = [
      { kind: 'list', items: [N('the anchor answers'), N('the reply time is fixed per §10.29.1.1')] },
      { kind: 'p', heading: N('Clause 16 in one picture'), text: N('The tag answers in its slot.') },
    ]
    expect(paragraphTexts(sneaky).some((l) => CITATION.test(l.en))).toBe(true)
    expect(paragraphTexts(sneaky).filter((l) => CITATION.test(l.en)).map((l) => l.en))
      .toEqual(['the reply time is fixed per §10.29.1.1', 'Clause 16 in one picture'])
  })
  it('the baseline knows units and everyday words only', () => {
    for (const w of ['AP', 'STA', 'DBM', 'WI-FI']) expect(KNOWN_WORDS.has(w)).toBe(true)
    for (const w of ['STS', 'RMARKER', 'OOK', 'TXOP', 'SIFS']) expect(KNOWN_WORDS.has(w)).toBe(false)
  })
})
