/**
 * Unit tests for the readability rule functions. They are the vocabulary the
 * course-wide readability test speaks in, so they are pinned on their own:
 * a rule that quietly stops seeing an acronym or a citation would let a dense
 * lesson through without a single test turning red.
 */
import { describe, it, expect } from 'vitest'
import { acronyms, numericQuantities, CITATION, enWords, zhChars, KNOWN_WORDS } from '../../src/course/readability'

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
  it('the baseline knows units and everyday words only', () => {
    for (const w of ['AP', 'STA', 'DBM', 'WI-FI']) expect(KNOWN_WORDS.has(w)).toBe(true)
    for (const w of ['STS', 'RMARKER', 'OOK', 'TXOP', 'SIFS']) expect(KNOWN_WORDS.has(w)).toBe(false)
  })
})
