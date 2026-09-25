/**
 * Unit tests for the text helpers of the lesson contract. They are the
 * vocabulary every per-lesson test and the contract test speak in, so they are
 * pinned on their own: a walk that quietly stopped seeing a block kind would let
 * a whole section go ungraded without a single test turning red.
 *
 * The rules about how the prose READS — acronym walks, citations, word budgets,
 * density, definition in place — were retired on 2026-09-25
 * (docs/superpowers/specs/2026-09-25-course-pace-and-diagrams.md), and their
 * unit tests went with them.
 */
import { describe, it, expect } from 'vitest'
import { cellTexts, lessonStrings, mainPathChars, paragraphTexts, zhChars } from '../../src/course/readability'
import { type Block } from '../../src/course/lessonKit'

const blocks: Block[] = [
  { heading: '标签在做什么', text: '没有电池的标签听不见。' },
  { kind: 'watch', text: '按下播放，看第二个时隙。' },
  { kind: 'list', heading: '发生了三件事', items: ['读写器发问', '标签作答'] },
  { kind: 'steps', items: ['备好时隙', '发出回答'] },
  { kind: 'formula', heading: '空口时间', text: 'T = L / R', note: 'L 是比特长度。' },
  { kind: 'table', heading: '取值出处', head: ['是什么', '在哪里'], rows: [['16 µs', '§9.3.7']] },
  { kind: 'widget', widget: 'linkBudget', caption: '拖动距离滑块。' },
]

describe('lesson text walks', () => {
  it('counts CJK characters and nothing else', () => {
    expect(zhChars('一二三 abc，四')).toBe(4)
    expect(zhChars('16 µs')).toBe(0)
  })

  it('reads headings and list items as prose, and leaves table cells and formula bodies out', () => {
    expect(paragraphTexts(blocks)).toEqual([
      '标签在做什么', '没有电池的标签听不见。',
      '按下播放，看第二个时隙。',
      '发生了三件事', '读写器发问', '标签作答',
      '备好时隙', '发出回答',
      '空口时间', 'L 是比特长度。',
      '取值出处',
      '拖动距离滑块。',
    ])
  })

  it('reads the table cells a learner reads as language, and skips the ones that are values', () => {
    // `16 µs` and `§9.3.7` are a glance, not a sentence: no Chinese, so no term to name.
    expect(cellTexts(blocks)).toEqual(['是什么', '在哪里'])
  })

  it('walks every string a learner reads, and never a function or a block discriminant', () => {
    expect(lessonStrings({
      why: '为什么',
      outcomes: ['学会一件事'],
      terms: [{ term: 'A-MPDU', plain: '一串帧' }],
      picture: [{ kind: 'watch', text: '看这里', jump: 0 }],
      sources: ['出处'],
    })).toEqual(['为什么', '学会一件事', '一串帧', '看这里', '出处'])
    // `scenario` and `find` are engine functions, and `kind` is a discriminant
    expect(lessonStrings({ picture: [{ kind: 'p', text: '一句' }] })).toEqual(['一句'])
  })

  it('measures the main path only: deeper and sources are not read at reading speed', () => {
    const chars = mainPathChars({
      why: '三个字',
      outcomes: ['两字'],
      terms: [{ term: 'OOK', plain: '通断键控' }],
      picture: [{ text: '一句话' }],
      numbers: [{ text: '四个字符' }],
      observe: ['看'], tryThis: ['试'], quiz: [],
      deeper: [{ text: '这一段不算在内' }],
      sources: ['出处也不算'],
    })
    expect(chars).toBe(3 + 2 + 4 + 3 + 4 + 1 + 1)
  })
})
