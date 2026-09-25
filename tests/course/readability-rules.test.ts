/**
 * Unit tests for the readability rule functions. They are the vocabulary the
 * course-wide readability test speaks in, so they are pinned on their own:
 * a rule that quietly stops seeing an acronym or a citation would let a dense
 * lesson through without a single test turning red.
 */
import { describe, it, expect } from 'vitest'
import {
  acronyms, numericQuantities, CITATION, countedWords, definedInPlace, densityTexts, enWords,
  firstTermUses, KNOWN_WORDS, lessonBudget, paragraphTexts, wordsIn, zhChars,
} from '../../src/course/readability'
import { type Block } from '../../src/course/lessonKit'

describe('readability rules', () => {
  it('finds acronyms and leaves protocol names, units and record names alone', () => {
    expect(acronyms('The STS — the timing sequence — follows the SFD in 802.11bp and Wi-Fi 7; see TX_START.'))
      .toEqual(['STS', 'SFD'])
    expect(acronyms('An A-MPDU behind an L-SIG')).toEqual(['A-MPDU', 'L-SIG'])
    expect(acronyms('CTS-to-self ends the NAV')).toEqual(['CTS', 'NAV'])
    expect(acronyms('5 dBm at 2.4 GHz for 16 µs')).toEqual(['GHZ'])
  })
  it('keeps a mixed-case tail whole, and leaves an ordinary capitalised word alone', () => {
    expect(acronyms('DL-TDoA, TDoA and AoA at 6 GHz, then Poll')).toEqual(['DL-TDOA', 'TDOA', 'AOA', 'GHZ'])
    expect(acronyms('UL-TDoA and SS-TWR, and the FoM byte')).toEqual(['UL-TDOA', 'SS-TWR', 'FOM'])
    // one capital is a sentence's opening or a message's name, not an acronym
    expect(acronyms('The Poll, the Response and the Final are Report words')).toEqual([])
    // and a unit is a word the reader is assumed to know
    for (const w of ['MHZ', 'GHZ', 'KHZ']) expect(KNOWN_WORDS.has(w), w).toBe(true)
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
      { heading: 'What the tag does', text: 'A tag with no battery cannot listen.' },
      { kind: 'watch', text: 'Press play and watch the second slot.' },
      { kind: 'list', heading: 'Three things happen', items: ['the reader asks', 'the tag answers'] },
      { kind: 'steps', items: ['arm the slot', 'send the answer'] },
      { kind: 'formula', heading: 'Airtime', text: 'T = L / R', note: 'L is the length in bits.' },
      { kind: 'table', heading: 'Where the values come from', head: ['what', 'where'], rows: [['16 µs', '§9.3.7']] },
      { kind: 'widget', widget: 'linkBudget', caption: 'Drag the distance slider.' },
    ]
    expect(paragraphTexts(blocks).map((l) => l)).toEqual([
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
      { kind: 'list', items: ['the anchor answers', 'the reply time is fixed per §10.29.1.1'] },
      { kind: 'p', heading: 'Clause 16 in one picture', text: 'The tag answers in its slot.' },
    ]
    expect(paragraphTexts(sneaky).some((l) => CITATION.test(l))).toBe(true)
    expect(paragraphTexts(sneaky).filter((l) => CITATION.test(l)).map((l) => l))
      .toEqual(['the reply time is fixed per §10.29.1.1', 'Clause 16 in one picture'])
  })
  it('the baseline knows units and everyday words only', () => {
    for (const w of ['AP', 'STA', 'DBM', 'WI-FI']) expect(KNOWN_WORDS.has(w)).toBe(true)
    for (const w of ['STS', 'RMARKER', 'OOK', 'TXOP', 'SIFS']) expect(KNOWN_WORDS.has(w)).toBe(false)
  })
})

describe('readability rules · the word count', () => {
  it('counts a language-neutral cell and a formula body as one glance each', () => {
    expect(countedWords('四个词')).toBe(4)
    expect(countedWords('336 207 494 656')).toBe(1)
    expect(wordsIn([{ kind: 'formula', heading: 'T', text: 'a = b + c + d', note: '两个词' }]))
      .toBe(1 + 1 + 2)
  })

  it('counts a term’s own word, and never a function or a foreign-language half', () => {
    expect(wordsIn([{ term: 'A-MPDU', plain: '一串帧' }])).toBe(1 + 4)
    expect(wordsIn({ scenario: () => 1, find: () => true, text: '二' })).toBe(2)
  })

  it('splits the main path into the spec’s three section budgets, and leaves deeper and sources out', () => {
    const b = lessonBudget({
      why: '三',
      outcomes: ['二'],
      terms: [{ term: 'OOK', plain: '通断键控' }],
      picture: [{ text: '一句' }],
      numbers: [{ text: '四个词' }],
      observe: ['看'],
      tryThis: ['试'],
      quiz: [],
      deeper: [{ text: '深' }],
      sources: ['出处' ],
    })
    expect(b).toEqual({ picture: 3 + 2 + (1 + 3) + 3, numbers: 4, practice: 3 + 2, total: 12 + 4 + 5 })
  })
})

describe('readability rules · density and definition in place', () => {
  const strip: Block[] = [
    { heading: 'Read the strip', text: '帧头是 SYNC 与 SFD。' },
    { kind: 'steps', heading: 'In order', items: [
      '先 SYNC，再 SFD',
      'STS、PHR、PSDU',
    ] },
  ]

  it('leaves the items of a steps block out of the density rule, keeping its heading', () => {
    expect(densityTexts(strip).map((l) => l))
      .toEqual(['Read the strip', 'The frame opens with the SYNC field and the SFD.', 'In order'])
    // the citation rule still reads every item
    expect(paragraphTexts(strip).length).toBe(5)
  })

  it('reports which terms first appear in each paragraph, so an ordered recap costs nothing', () => {
    expect(firstTermUses(strip, ['SYNC', 'SFD', 'STS', 'PHR', 'PSDU']))
      .toEqual([[], ['SYNC', 'SFD'], []])
    // a term is met as a word prefix: "chips" introduces `chip`
    expect(firstTermUses([{ text: '码片' }], ['chip', 'tag', 'slot']))
      .toEqual([['chip', 'tag']])
  })

  it('exempts an acronym the paragraph spells out where it uses it', () => {
    const p = '触发帧把窗口指数 ACWE 设成 2。'
    expect(definedInPlace(p, 'ACWE')).toBe(true)
    expect(definedInPlace(p, 'ACW')).toBe(false)
    const glossed = 'AMP-SIG（两个字节）说明后面是什么。'
    expect(definedInPlace(glossed, 'AMP-SIG')).toBe(true)
    // a name introducing its own short form, in either language's parentheses
    const short = '单边双向测距（SS-TWR）'
    expect(definedInPlace(short, 'SS-TWR')).toBe(true)
    expect(definedInPlace('STS 无法伪造。', 'STS')).toBe(false)
  })
})
