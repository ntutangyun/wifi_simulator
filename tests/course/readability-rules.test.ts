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
import {
  SECTIONS, cellTexts, lessonStrings, lessonTexts, mainPathChars, paragraphTexts, zhChars,
  type LessonText, type Role, type Section,
} from '../../src/course/readability'
import { type Block, type Lesson } from '../../src/course/lessonKit'
import { LESSONS } from '../../src/course/lessons'
import { COURSE_ORDER } from '../../src/course/curriculum'
import { diagramTexts } from '../../src/course/diagram'

const blocks: Block[] = [
  { heading: '标签在做什么', text: '没有电池的标签听不见。' },
  { kind: 'watch', text: '按下播放，看第二个时隙。' },
  { kind: 'list', heading: '发生了三件事', items: ['读写器发问', '标签作答'] },
  { kind: 'steps', items: ['备好时隙', '发出回答'] },
  { kind: 'formula', heading: '空口时间', text: 'T = L / R', note: 'L 是比特长度。' },
  { kind: 'table', heading: '取值出处', head: ['是什么', '在哪里'], rows: [['16 µs', '§9.3.7']] },
  { kind: 'widget', widget: 'linkBudget', caption: '拖动距离滑块。' },
  {
    kind: 'diagram', heading: '谁跟谁说话',
    spec: {
      kind: 'topology',
      nodes: [{ id: 'ap', label: '接入点', role: 'ap', x: 0, y: 0 }, { id: 't', label: '标签', role: 'sta', x: 1, y: 1 }],
      links: [{ from: 't', to: 'ap', label: '一跳' }],
      ring: { nodes: ['ap', 't'], label: '一张网' },
    },
    caption: '虚线那条走不通。',
  },
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
      // a diagram's labels are prose: the heading, then every label inside the
      // figure in reading order, then the caption. That is what puts a term
      // first named in a picture in front of the terminology rule.
      '谁跟谁说话', '一张网', '接入点', '标签', '一跳', '虚线那条走不通。',
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
    // a diagram: every label inside the spec, and never a node id or a link's ends
    expect(lessonStrings({ picture: [blocks[7]] })).toEqual([
      '谁跟谁说话', '一张网', '接入点', '标签', '一跳', '虚线那条走不通。',
    ])
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

/**
 * `lessonTexts`: the one walk, 2026-10-05
 * (docs/superpowers/specs/2026-10-05-wording-reach-design.md).
 *
 * The hole it closes: "which fields hold text a reader reads" had twelve
 * hand-rolled answers in this repository — `lessonStrings`, `mainPathChars`,
 * and ten more in the tests — in seven mutually different field combinations,
 * and not one test compared them. `lessonKit.ts` could only ask the next author
 * in a comment to remember to extend two of the twelve.
 *
 * The design is an EXCLUSION table, so a new field is in the net the moment it
 * is added, and three latches stand behind it because only two of the three run
 * in `npm test` (the `test` script is `vitest run`, which does not type-check):
 *  - `Record<keyof Lesson, Section | null>` — a type error, `npm run build` only;
 *  - a run-time throw on an unclassified key — every lesson red at once;
 *  - the census below — a new field that carries prose moves a count.
 */
describe('lessonTexts · the one walk', () => {
  const lesson: Lesson = {
    id: 'probe', module: 0, title: '标题',
    why: '为什么', outcomes: ['学会一件事'], needs: ['radio-primer'],
    terms: [{ term: 'A-MPDU', plain: '一串帧' }],
    picture: blocks,
    numbers: [{ kind: 'formula', heading: '空口时间', text: 'T = L / R', note: 'L 是比特长度。' }],
    deeper: [{ text: '更深一层' }],
    sources: ['出处'],
    limits: [{ kind: 'threshold', text: '一刀切', until: 'fading', seeAlso: 'backoff' }],
    scenario: () => ({}) as never,
    variants: [{ label: '变体一', scenario: () => ({}) as never }],
    jumps: [{ label: '第一帧', find: () => true }],
    observe: ['看'], tryThis: ['试'],
    quiz: [{ q: '问', options: ['甲', '乙'], answer: 1, explain: '解释' }],
  }

  it('tags every string with the section the reader meets it in', () => {
    const got = lessonTexts(lesson)
    // the reader's order over the sections, `title` first and the chrome last
    expect([...new Set(got.map((t) => t.section))]).toEqual([
      'title', 'why', 'outcomes', 'terms', 'picture', 'numbers',
      'deeper', 'sources', 'limits', 'observe', 'tryThis', 'quiz',
      'variantLabel', 'jumpLabel',
    ])
    const of = (s: Section): string[] => got.filter((t) => t.section === s).map((t) => t.text)
    expect(of('title')).toEqual(['标题'])
    expect(of('terms')).toEqual(['一串帧'])
    expect(of('limits')).toEqual(['一刀切'])
    expect(of('variantLabel')).toEqual(['变体一'])
    expect(of('jumpLabel')).toEqual(['第一帧'])
    expect(of('quiz')).toEqual(['问', '甲', '乙', '解释'])
  })

  it('tags each string with what it is inside its block', () => {
    const got = lessonTexts(lesson)
    const role = (text: string): Role | undefined => got.find((t) => t.text === text)?.role
    // chrome is chrome wherever it sits
    expect(role('标题')).toBe('label')
    expect(role('变体一')).toBe('label')
    expect(role('第一帧')).toBe('label')
    // a formula's body is a value; its note and heading are prose
    expect(role('T = L / R')).toBe('value')
    expect(role('L 是比特长度。')).toBe('prose')
    // a table's head and rows are cells, Chinese or not; its heading is prose
    expect(role('是什么')).toBe('cell')
    expect(role('16 µs')).toBe('cell')
    expect(role('取值出处')).toBe('prose')
    // a label inside a figure is a figure; the caption around it is prose
    expect(role('接入点')).toBe('figure')
    expect(role('虚线那条走不通。')).toBe('prose')
    // and a heading, a paragraph, a watch call-out and a list item are all prose
    for (const t of ['标签在做什么', '没有电池的标签听不见。', '按下播放，看第二个时隙。', '读写器发问'])
      expect(role(t), t).toBe('prose')
  })

  it('names a path a failure message can point at a person with', () => {
    const got = lessonTexts(lesson)
    expect(got.find((t) => t.text === '16 µs')!.path).toBe('picture[5].rows[0][0]')
    expect(got.find((t) => t.text === '乙')!.path).toBe('quiz[0].options[1]')
    expect(got.find((t) => t.text === '接入点')!.path).toBe('picture[7].spec[1]')
    expect(got.find((t) => t.text === '变体一')!.path).toBe('variants[0].label')
  })

  it('excludes the keys that hold no prose, each for its own stated reason', () => {
    const texts = lessonTexts(lesson).map((t) => t.text)
    // a Term's own word is the standard's spelling, not a translation
    expect(texts).not.toContain('A-MPDU')
    // a Limit's `until`/`seeAlso` hold a lesson id, never a sentence
    expect(texts).not.toContain('fading')
    expect(texts).not.toContain('backoff')
    // identifiers, discriminants and control presets
    for (const out of ['probe', 'radio-primer', 'threshold', 'formula', 'table', 'linkBudget'])
      expect(texts, out).not.toContain(out)
  })

  it('reads a diagram through diagramTexts, in the order that walk gives', () => {
    // The generic walk cannot tell a label from a node id or a link's two ends, and the
    // reader's order inside a figure is `diagramTexts`' to decide, not this walk's.
    const spec = (blocks[7] as Extract<Block, { kind: 'diagram' }>).spec
    expect(lessonTexts({ picture: [blocks[7]] }).filter((t) => t.role === 'figure').map((t) => t.text))
      .toEqual(diagramTexts(spec))
  })

  /**
   * The latch that actually runs in `npm test`. The type error on
   * `Record<keyof Lesson, …>` is the first line of defence and it does not fire
   * here: vitest transpiles with esbuild and never type-checks, so a missing
   * classification would leave 6 800 tests green. This one turns all 83 lessons
   * red at once, with the key name and the lesson id in the message.
   */
  it('throws on a field nobody has classified, and not on one that is', () => {
    expect(() => lessonTexts({ ...lesson, newField: '一句中文' } as never))
      .toThrow(/newField` is not classified/)
    expect(() => lessonTexts({ ...lesson })).not.toThrow()
    // and a field classified `null` is silently out rather than a throw
    expect(() => lessonTexts({ id: 'probe', module: 0 })).not.toThrow()
  })

  /**
   * The memo must not weaken the latch — 2026-10-05.
   *
   * `lessonTexts` caches its answer in a `WeakMap` keyed by the lesson OBJECT,
   * because the walk sits on a render path (`CoursePanel.tsx:313` reaches it
   * once per lesson for all 83 rows of the contents list). A cache is exactly
   * the kind of change that turns a latch into a decoration, so the two ways it
   * could are pinned here rather than argued:
   *  - keyed by `l.id`, a lesson with a NEW field would read the cached answer
   *    for the old one and never be checked. Asserted below by walking the real
   *    lesson FIRST, so it is definitely cached, and then handing over a spread
   *    of it with an unclassified field;
   *  - the array is shared, so a caller that mutated it would corrupt what every
   *    later caller reads. It is frozen, and the type says `readonly`.
   */
  it('still throws on an unclassified field after the same lesson has been walked once', () => {
    const real = LESSONS[0]
    const warm = lessonTexts(real)
    expect(lessonTexts(real), 'the memo returns the same array, not a copy').toBe(warm)
    expect(() => lessonTexts({ ...real, newField: '一句中文' } as never))
      .toThrow(/newField` is not classified/)
    // and the cached answer for the real lesson is untouched by that call
    expect(lessonTexts(real)).toBe(warm)
  })

  it('hands out a frozen array, because every caller gets the same one', () => {
    const got = lessonTexts(LESSONS[0]) as LessonText[]
    expect(Object.isFrozen(got)).toBe(true)
    expect(() => got.push({ section: 'why', role: 'prose', path: 'x', text: 'y' })).toThrow()
  })

  it('answers a fresh object by walking it, so a Partial literal is never served a stale cache', () => {
    const real = LESSONS[0]
    lessonTexts(real)
    // a different object with the same content is a different key: walked, not served
    const copy = { ...real }
    expect(lessonTexts(copy)).not.toBe(lessonTexts(real))
    expect(lessonTexts(copy).map((t) => t.text)).toEqual(lessonTexts(real).map((t) => t.text))
  })
})

/**
 * The census: every section of every lesson in the course, counted.
 *
 * Two different kinds of assertion, and the difference is the point. A string
 * COUNT is pinned against the lesson data that produces it — one `title` per
 * lesson, one `plain` per term, one `text` per limit, one label per variant —
 * so prose edits never touch it while a new field carrying prose moves it
 * immediately. A CHARACTER count is pinned as a range, because prose is edited
 * every week and an equality there would be a chore rather than a rule.
 *
 * This is the third latch of `lessonTexts`, and it also catches the opposite
 * failure, which is the one the top of this file worries about: a walk that
 * quietly stopped seeing a block kind would let a whole section go ungraded
 * with nothing turning red. Here it turns a count to zero.
 */
describe('lessonTexts · the census over the whole course', () => {
  const ordered = COURSE_ORDER.flatMap((id) => LESSONS.filter((l) => l.id === id))
  const all = ordered.flatMap((l) => lessonTexts(l))
  const count = (s: Section): number => all.filter((t) => t.section === s).length
  const chars = (s: Section): number => all.filter((t) => t.section === s)
    .reduce((n, t) => n + zhChars(t.text), 0)
  const sum = (f: (l: Lesson) => number): number => ordered.reduce((n, l) => n + f(l), 0)

  it('walks all 87 lessons and nothing else', () => {
    expect(ordered.length).toBe(LESSONS.length)
    // 87 since slice W5 added `amp-backscatter`, the backscatter tier of M10 — 878 lines of
    // engine that produced none of its five record types in any of the 251 course scenarios
    // before it. 86 before that, when slice 3d added `uwb-ancillary-request`.
    expect(ordered.length).toBe(87)
  })

  it('sees every section, which a walk that stopped seeing a block kind would not', () => {
    // `body` is the exception and it is bookkeeping, not a hole: the old flat shape
    // finished migrating on 2026-10-02, so no lesson has one left.
    //
    // **This is also the record of that migration, and the reason `'body'` is still a member of
    // five section lists** (`LESSON_STRING_SECTIONS`, `MAIN_PATH_SECTIONS`, the graded-prose
    // list, `SECTION_OF`, `SECTION_KEY`) while contributing nothing: those memberships are
    // provably inert — `mainPathChars` is identical with `'body'` struck out of
    // `MAIN_PATH_SECTIONS`, lesson for lesson, all 87 — and `docs/inert-config-contract.md`'s
    // two outcomes for that shape are refuse or pin. Deleting the field is the other slice (it
    // moves `lessonKit.ts`, `readability.ts` in five places, `curriculum.ts`'s `lessonBlocks`
    // fallback and `blocksOf` below); keeping it costs the two lines here, and they are what
    // makes the memberships safe rather than merely harmless. The second assertion is the
    // stronger of the two and the one that is literally the sentence: `count` is zero for a
    // lesson carrying `body: []` as well, and the field itself is what the lists react to.
    const withBody = ordered.filter((l) => l.body !== undefined).map((l) => l.id)
    expect(withBody, 'the flat `body` shape finished migrating; these lessons went back to it')
      .toEqual([])
    for (const s of SECTIONS) {
      if (s === 'body') { expect(count(s), 'body').toBe(0); continue }
      expect(count(s), `${s} is in no lesson's walk`).toBeGreaterThan(0)
    }
  })

  it('counts one string per thing the lesson data says there is', () => {
    expect(count('title')).toBe(ordered.length)
    expect(count('why')).toBe(ordered.filter((l) => l.why !== undefined).length)
    expect(count('outcomes')).toBe(sum((l) => l.outcomes!.length))
    expect(count('terms')).toBe(sum((l) => l.terms!.length))
    expect(count('sources')).toBe(sum((l) => l.sources!.length))
    expect(count('observe')).toBe(sum((l) => l.observe.length))
    expect(count('tryThis')).toBe(sum((l) => l.tryThis.length))
    // `kind` is a discriminant and `until`/`seeAlso` are ids, so a limit is one string.
    // This is the assertion that fires if `Limit` ever grows a second prose field —
    // the thing `lessonKit.ts` used to ask the next author to remember.
    expect(count('limits')).toBe(sum((l) => l.limits.length))
    expect(count('variantLabel')).toBe(sum((l) => (l.variants ?? []).length))
    expect(count('jumpLabel')).toBe(sum((l) => l.jumps.length))
    // a quiz is its question, its options and its explanation; `answer` is an index
    expect(count('quiz')).toBe(sum((l) => l.quiz.reduce((n, q) => n + 2 + q.options.length, 0)))
  })

  it('counts one string per role the blocks say there is', () => {
    const role = (r: Role): number => all.filter((t) => t.role === r).length
    const blocksOf = (l: Lesson): Block[] => [...(l.picture ?? []), ...(l.numbers ?? []), ...(l.deeper ?? []), ...(l.body ?? [])]
    expect(role('label')).toBe(count('title') + count('variantLabel') + count('jumpLabel'))
    expect(role('figure')).toBe(sum((l) => blocksOf(l)
      .filter((b) => b.kind === 'diagram')
      .reduce((n, b) => n + diagramTexts((b as Extract<Block, { kind: 'diagram' }>).spec).length, 0)))
    expect(role('value')).toBe(sum((l) => blocksOf(l).filter((b) => b.kind === 'formula').length))
    expect(role('cell')).toBe(sum((l) => blocksOf(l)
      .filter((b) => b.kind === 'table')
      .reduce((n, b) => {
        const t = b as Extract<Block, { kind: 'table' }>
        return n + t.head.length + t.rows.flat().length
      }, 0)))
    // prose is the rest, and it is the one role no structural count reproduces, so it
    // gets a range. 5 101 on 2026-10-05.
    expect(role('prose')).toBeGreaterThan(4500)
    expect(role('prose')).toBeLessThan(6000)
    expect(role('prose') + role('label') + role('figure') + role('value') + role('cell')).toBe(all.length)
  })

  it('holds the course inside the character ranges it was measured at', () => {
    // Re-measured 2026-10-05 after the built-but-untaught slice, which added `wan-rtt`
    // and `edca-tamper`: two whole lessons is exactly the structural change these ranges
    // are supposed to notice, and five of the fourteen went out or within fifty characters
    // of going out (`variantLabel` 959 against a ceiling of 950 was the one that turned
    // red; `numbers` landed at 61 680 against 62 000 and `tryThis` at 9 451 against 9 500).
    // Re-centred rather than nudged, because a ceiling a prose edit can reach teaches the
    // next author to edit the number instead of reading it. The measurement behind each
    // pair is the current total, and the band is about ±6 % of it — wide enough for
    // ordinary prose editing, narrow enough that a module arriving or leaving moves one
    // out. Current: title 946, why 11 120, outcomes 6 593, terms 7 368, picture 53 252,
    // numbers 61 671, deeper 26 076, sources 17 099, limits 49 499, observe 10 372,
    // tryThis 9 451, quiz 25 186, variantLabel 959, jumpLabel 2 188.
    const RANGES: readonly (readonly [Section, number, number])[] = [
      ['title', 850, 1100], ['why', 10000, 12000], ['outcomes', 6000, 7200],
      ['terms', 6800, 7900], ['picture', 50000, 56500], ['numbers', 57000, 65500],
      ['deeper', 24000, 28000], ['sources', 15500, 18500], ['limits', 45000, 52500],
      ['observe', 9500, 11000], ['tryThis', 8500, 10000], ['quiz', 23000, 27000],
      ['variantLabel', 750, 1050], ['jumpLabel', 2000, 2400],
    ]
    for (const [s, lo, hi] of RANGES) {
      expect(chars(s), `${s}: ${chars(s)} Chinese characters`).toBeGreaterThanOrEqual(lo)
      expect(chars(s), `${s}: ${chars(s)} Chinese characters`).toBeLessThanOrEqual(hi)
    }
    // and the whole page: 10 139 strings / 281 780 Chinese characters after this slice
    // (9 898 / 274 723 before it)
    expect(all.length).toBeGreaterThan(9000)
    expect(all.length).toBeLessThan(11500)
  })

  it('leaves no string a reader reads empty, across every section', () => {
    // The non-empty check the contract suite and `kit.ts` each run per lesson, summed
    // here over the sections neither of them used to reach.
    expect(all.filter((t) => t.text.trim() === '').map((t) => t.path)).toEqual([])
  })
})
