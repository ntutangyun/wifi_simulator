/**
 * The lesson contract, enforced over every migrated lesson.
 *
 * Shrunk on 2026-09-25 to the user's ruling
 * (docs/superpowers/specs/2026-09-25-course-pace-and-diagrams.md, "What the
 * tests are for"): the suite tests the software and the lesson as DATA, not how
 * the prose reads. Gone with that ruling: the word budgets and the section
 * ceilings, paragraph length, term density, the acronym-introduction walks, the
 * first-use naming shapes, the quantity-glossing rule, the pointer-phrase
 * blocklist, the one-name-per-thing sheet, the cell rules, and everything left
 * of the bilingual machinery. `721984e` is the last commit that held them, and nothing here
 * asks about a language pair any more.
 *
 * What is left is four things:
 *  - the migration bookkeeping, so a lesson cannot quietly leave the contract;
 *  - the lesson as data: every section present, every string non-empty, every
 *    `needs` naming a real earlier lesson, every `watch` jump resolving, and the
 *    stated minutes inside the 30-minute ceiling the user asked for;
 *  - the procedure rule: a lesson that states a rule carries it as `steps`;
 *  - the terminology rule: every official term carries its standard English
 *    name, and its abbreviation where the standard has one, at its first Chinese
 *    use — the reader's own requirement, with its anti-vacuity guards.
 */
import { describe, it, expect } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { COURSE_ORDER, MAX_MINUTES, lessonMinutes, trackOf } from '../../src/course/curriculum'
import { isMigrated, type Block, type Lesson } from '../../src/course/lessonKit'
import {
  cellTexts, lessonStrings, paragraphTexts,
  ZH_TERMS, ZH_TERMS_EXCLUDED, bracketedAtFirstZhUse, zhAkaViolations, zhTermFailure, type ZhTerm,
} from '../../src/course/readability'
import { effectiveMigrating } from './kit'

/** Lessons still in the old shape. Each migration task removes its ids; the list only shrinks. */
export const MIGRATING: string[] = [

  'amp-slots', 'amp-coexist',
]

/**
 * MIGRATING as this run grades it. `READABILITY_INCLUDE=uwb-sstwr,uwb-dstwr`
 * removes those ids for one run, so an implementer can hold a rewritten lesson
 * to the contract before the controller has registered it — without editing
 * this file, which is the controller's. The switch only ever shrinks the list
 * (tests/course/kit.ts), and the bookkeeping below reads the recorded
 * MIGRATING, so it can admit a lesson to the contract but never excuse one.
 */
const MIGRATING_NOW = effectiveMigrating(MIGRATING, process.env.READABILITY_INCLUDE)

const byId = new Map(LESSONS.map((l) => [l.id, l]))
const ordered = COURSE_ORDER.flatMap((id) => byId.get(id) ?? [])
const migrated = ordered.filter((l) => !MIGRATING_NOW.includes(l.id))

describe('readability · migration bookkeeping', () => {
  it('every MIGRATING id is a real lesson still in the old shape', () => {
    // an id READABILITY_INCLUDE names is being graded as migrated in this run, so its
    // old-shape claim is suspended for the run; every other id is held to it.
    for (const id of MIGRATING) expect(byId.has(id), id).toBe(true)
    for (const id of MIGRATING_NOW) expect(isMigrated(byId.get(id)!), id).toBe(false)
  })
  it('every lesson not in MIGRATING is in the new shape', () => {
    // the recorded list, not this run's: the env var cannot take an id out of it for good
    for (const l of ordered.filter((x) => !MIGRATING.includes(x.id))) expect(isMigrated(l), l.id).toBe(true)
  })
})

// While MIGRATING still covers every lesson there is nothing to iterate, and
// vitest refuses an empty describe.each.
if (migrated.length) {
  describe.each(migrated.map((l) => [l.id, l] as const))('readability · %s', (_id, l) => {
    it('has every section, well-formed', () => {
      expect(l.why!.trim()).not.toBe('')
      expect(l.outcomes!.length).toBeGreaterThanOrEqual(2); expect(l.outcomes!.length).toBeLessThanOrEqual(4)
      expect(l.terms!.length).toBeGreaterThan(0)
      expect(l.picture!.length).toBeGreaterThan(0); expect(l.numbers!.length).toBeGreaterThan(0)
      expect(l.picture!.some((b) => b.kind === 'watch')).toBe(true)
      expect(l.sources!.length).toBeGreaterThan(0)
      for (const b of l.picture!) if (b.kind === 'watch' && b.jump !== undefined) expect(l.jumps[b.jump]).toBeDefined()
    })
    it('leaves no string a learner reads empty', () => {
      // every string a learner reads: `sources`, `outcomes`, each term's plain line,
      // every block, every table cell, every quiz option.
      //
      // The structural floor that used to stand beside this walk was deleted with it
      // measured rather than assumed: `lessonStrings` returns 47 to 139 more strings
      // than the floor demanded on every lesson in the course, because a table
      // contributes one string per cell and a quiz three per question, so no deletion
      // a reader would notice could ever reach it. `has every section, well-formed`
      // above is what actually catches a missing section. A rule that cannot fail is
      // worse than no rule: it reports success while grading nothing.
      const seen = lessonStrings(l)
      expect(seen.length, l.id).toBeGreaterThan(0)
      for (const x of seen) {
        expect(x.trim(), x).not.toBe('')
      }
    })
    it('asks a quiz whose answer is one of its own options', () => {
      for (const q of l.quiz) {
        expect(q.options.length, q.q).toBeGreaterThanOrEqual(2)
        expect(q.answer, q.q).toBeGreaterThanOrEqual(0)
        expect(q.answer, q.q).toBeLessThan(q.options.length)
      }
    })
    it('names prerequisites that exist, precede it, and respect the track rule', () => {
      if (l.id !== 'radio-primer') expect(l.needs!.length).toBeGreaterThan(0)
      for (const id of l.needs!) {
        expect(byId.has(id), id).toBe(true)
        expect(COURSE_ORDER.indexOf(id)).toBeLessThan(COURSE_ORDER.indexOf(l.id))
        if (trackOf(l) !== 'wifi') expect(trackOf(byId.get(id)!) === trackOf(l) || ['radio-primer', 'frame-anatomy'].includes(id), id).toBe(true)
      }
    })
    it('fits one sitting', () => {
      // The word budgets went with the 2026-09-25 ruling, so this is the only
      // length control the course has left, and the user asked for it by name: a
      // lesson past 30 minutes is teaching two topics, and the answer is to
      // split it, never to compress it.
      expect(lessonMinutes(l), `${l.id}: ${lessonMinutes(l)} minutes`).toBeLessThanOrEqual(MAX_MINUTES)
    })
  })
}

/**
 * The one rule about substance that the 2026-09-23 "mechanism before metaphor"
 * amendment leaves standing: a lesson that states a rule carries the rule as a
 * procedure the reader can re-run, not as a sentence about a procedure.
 *
 * The list is the lessons the amendment reached. It still earns its keep: the
 * two AMP lessons outside it (`amp-intro`, `amp-ppdu`) are a paused module, and
 * the terminology rule below would grade their untranslated prose.
 */
export const MECHANISM_DONE: string[] = [
  'decode-thresholds', 'roles-stack',
  'hidden', 'anomaly', 'retries-queues',
  'airtime', 'ifs', 'backoff', 'nav',
  'radio-primer', 'frame-anatomy', 'frame-anatomy-bytes',
  'edca', 'ampdu', 'txop', 'txop-protect',
  'width', 'streams', 'rate', 'rate-fallback',
  'ofdma-dl', 'ofdma-ul', 'mumimo',
  'mlo', 'capstone',
  'bianchi', 'bianchi-vs-sim', 'tier1-project', 'tier1-project-review',
  'uwb-intro', 'uwb-frame', 'uwb-sts',
  'uwb-sstwr', 'uwb-dstwr', 'uwb-blocks',
  'uwb-position', 'uwb-geometry', 'uwb-coexist', 'uwb-contention',
  'uwb-dl-tdoa', 'uwb-ul-tdoa', 'uwb-aoa',
  'uwb-mms', 'uwb-mms-numbers', 'uwb-nba', 'uwb-nba-coexist',
  'uwb-capstone',
]

/**
 * MECHANISM_DONE as this run grades it. `MECHANISM_INCLUDE=roles-stack,nav`
 * adds those ids for one run, so a batch implementer can hold a rewritten
 * lesson to the amendment before the controller has registered it — without
 * editing this file, which is the controller's. The switch only ever adds.
 */
const MECHANISM_NOW = [...new Set([
  ...MECHANISM_DONE,
  ...(process.env.MECHANISM_INCLUDE ?? '').split(',').map((s) => s.trim()).filter(Boolean),
])]

describe('readability · a rule is carried as a procedure', () => {
  const revised = migrated.filter((l) => MECHANISM_NOW.includes(l.id))

  it('grades every lesson the amendment has reached', () => {
    expect(revised.map((l) => l.id).sort()).toEqual(MECHANISM_NOW.filter((id) => !MIGRATING_NOW.includes(id)).sort())
  })

  it.each(revised.map((l) => [l.id, l] as const))('%s writes its procedure out as steps', (_id, l) => {
    const steps = [...(l.picture ?? []), ...(l.numbers ?? [])].filter((b) => b.kind === 'steps')
    expect(steps.length, `${l.id}: a lesson that states a rule carries the rule as a steps block`).toBeGreaterThan(0)
    for (const b of steps) expect((b as Extract<Block, { kind: 'steps' }>).items.length).toBeGreaterThanOrEqual(3)
  })
})

/**
 * Amendment 2026-09-25, "every official term carries its English name in the
 * Chinese" (.superpowers/sdd/2026-09-23-mechanism-before-metaphor/
 * zh-term-inventory.md, section 6).
 *
 * The reader's requirement: in the Chinese text, every official IEEE 802.11 /
 * 802.15.4 term carries its standard English name — and its common
 * abbreviation where one exists — in brackets at its first use, in that order:
 * 前导码（preamble）, 确认帧（ACK）, 仲裁帧间间隔（arbitration interframe space,
 * AIFS）. A bare `EDCA` teaches the reader an acronym and no term; a bare
 * 分布式帧间间隔 leaves them unable to look anything up.
 *
 * This is the one content rule the 2026-09-25 shrink kept, because it is the
 * user's own requirement rather than a style preference, and it is cheap.
 *
 * What is graded, per lesson, is the reader's own order over `why`, `outcomes`,
 * `picture`, `numbers`, `observe`, `tryThis` and `quiz`. `deeper` and `sources`
 * are collapsed professional depth — `sources` is where the clause numbers and
 * the English names already live.
 */
const zhMainTexts = (l: Lesson): string[] => [l.why!, ...(l.outcomes ?? [])]
  .concat(paragraphTexts(l.picture ?? []), cellTexts(l.picture ?? []))
  .concat(paragraphTexts(l.numbers ?? []), cellTexts(l.numbers ?? []))
  .concat(l.observe, l.tryThis, l.quiz.flatMap((q) => [q.q, ...q.options, q.explain]))

/** One joined Chinese string per lesson, in reading order: what "first use" is first in. */
const zhMainText = (l: Lesson): string => zhMainTexts(l).join(' ')

/**
 * The glossary rows graded in one lesson: all of them, minus the three whose
 * Chinese word means something else in the other track (`ZhTerm.track` says
 * which, and why each one is there).
 */
const zhTermsFor = (l: Lesson): ZhTerm[] => ZH_TERMS.filter((t) => !t.track || t.track === trackOf(l))

/**
 * Every failure of one lesson: the bracket arm, then the `aka` arm. Collected
 * rather than asserted term by term — an `expect` inside the loop stops a
 * lesson at its first failure and hides the rest, which has already cost this
 * programme one round trip.
 */
function zhTermFailures(l: Lesson): string[] {
  const zh = zhMainText(l)
  const out: string[] = []
  for (const t of zhTermsFor(l)) {
    const why = zhTermFailure(zh, t)
    if (why) out.push(`${l.id}: ${why}`)
    for (const a of zhAkaViolations(zh, t)) out.push(`${l.id}: ${a}`)
  }
  return out
}

describe('readability · every official term carries its English name in the Chinese', () => {
  const revised = migrated.filter((l) => MECHANISM_NOW.includes(l.id))

  it.each(revised.map((l) => [l.id, l] as const))('%s brackets every official term at its first Chinese use', (_id, l) => {
    expect(zhTermFailures(l), `${l.id}: official terms the Chinese never names in English`).toEqual([])
  })

  /**
   * Guard 1 of section 6.4 — the coverage floor. `bracketedAtFirstZhUse`
   * returns null when it did not grade, and three rules in this suite have
   * reported success while grading nothing: the pattern stopped matching, the
   * loop body never ran, and `expect([]).toEqual([])` passed. A matcher that
   * has quietly stopped matching — a `\b` in front of a CJK pattern, a stateful
   * `/g` regex, a broken escape — turns the suite red here instead of green.
   *
   * The floor is TWO, not the three section 6.4 guessed at: the first corpus
   * run found `uwb-position`, which names only 锚点 and 标签 on its main path
   * (三边定位 and GDOP are section 2.6 rows, and its 首径 is in `deeper`). A
   * floor that a healthy lesson cannot clear is a rule the next author edits
   * away, and two still turns all 47 lessons red the moment the matcher stops
   * matching. The corpus total below is the sharper number.
   */
  it.each(revised.map((l) => [l.id, l] as const))('%s has its terminology actually graded', (_id, l) => {
    const zh = zhMainText(l)
    const graded = zhTermsFor(l).filter((t) => bracketedAtFirstZhUse(zh, t) !== null)
    expect(graded.length, `${l.id}: the term rule graded nothing`).toBeGreaterThanOrEqual(2)
  })

  /**
   * The same guard summed over the course, where a partial regression shows.
   * A per-lesson floor of two survives a matcher that has lost, say, every
   * abbreviation; the total does not. It stood at 582 when this rule landed, on
   * a course no lesson of which had been fixed yet.
   */
  it('grades hundreds of terms across the course, not a handful', () => {
    const graded = revised.reduce((n, l) => {
      const zh = zhMainText(l)
      return n + zhTermsFor(l).filter((t) => bracketedAtFirstZhUse(zh, t) !== null).length
    }, 0)
    expect(graded, 'terms graded across the whole course').toBeGreaterThanOrEqual(450)
  })

  /**
   * Guard 2 of section 6.4 — the corpus-wide total. A glossary row no lesson
   * exercises is a row that could be wrong for ever, and this is the test that
   * catches a typo in ZH_TERMS itself: a misspelled `zh` matches nothing
   * anywhere, so it is ungraded everywhere, so it is named here.
   *
   * Until the fix wave lands, this test also names the kind-(b) rows whose
   * Chinese name the course has never written at all (视轴, 每用户分配表): that
   * is the same work order, from the other end.
   */
  it('grades every glossary row somewhere in the course', () => {
    const ungraded = ZH_TERMS.filter((t) => revised
      .filter((l) => !t.track || t.track === trackOf(l))
      .every((l) => bracketedAtFirstZhUse(zhMainText(l), t) === null))
    expect(ungraded.map((t) => t.zh ?? t.abbr), 'glossary rows no lesson ever uses').toEqual([])
  })

  /** Section 2.6 is the exclusion list, and it stays out of the glossary. */
  it('demands nothing for the words that are not IEEE terms', () => {
    const readded = ZH_TERMS.filter((t) => ZH_TERMS_EXCLUDED.some((x) => x.zh === t.zh))
    expect(readded.map((t) => t.zh), 'section 2.6 rows re-added to ZH_TERMS').toEqual([])
    // Section 2.6's 24 rows, a couple of which name two words and are split here.
    expect(ZH_TERMS_EXCLUDED.length).toBeGreaterThanOrEqual(24)
    for (const x of ZH_TERMS_EXCLUDED) expect(x.why, `${x.zh} is excluded with no reason given`).toMatch(/model choice|literature|statistics|engineering|regulatory/)
  })
})

/**
 * The probes of section 6.5, as tests rather than as a procedure somebody has
 * to remember to run. Each one is a lesson-shaped violation written out in
 * full, so a future reader can see what the rule is looking at; each one is
 * also the mutation that would make the rule vacuous, pinned from the other
 * side.
 */
describe('readability · the term rule can fail', () => {
  const PREAMBLE: ZhTerm = { zh: '前导码', en: 'preamble', aka: ['前导'] }
  const SIFS: ZhTerm = { zh: '短帧间间隔', en: 'short interframe space', abbr: 'SIFS' }
  const EDCA: ZhTerm = { zh: '增强型分布式信道接入', en: 'enhanced distributed channel access', abbr: 'EDCA' }

  /** The three outcomes pinned apart, so `false` can never be reported as `null`. */
  it('tells a good bracket, a missing bracket and an absent term apart', () => {
    expect(bracketedAtFirstZhUse('一帧开头那段前导码（preamble）', PREAMBLE)).toBe(true)
    expect(bracketedAtFirstZhUse('一帧开头那段前导码', PREAMBLE)).toBe(false)
    expect(bracketedAtFirstZhUse('没有这个词', PREAMBLE)).toBe(null)
  })

  /** P1 — kind (a): the Chinese name is there, the English is not. */
  it('P1: reports a Chinese name used with no English beside it', () => {
    const violating = '一次交互内部的那一小会儿就是短帧间间隔，回答就在这之后过来。'
    expect(zhTermFailure(violating, SIFS)).toBe('短帧间间隔 first used without （short interframe space, SIFS）')
    const fixed = '一次交互内部的那一小会儿就是短帧间间隔（short interframe space, SIFS），回答就在这之后过来。'
    expect(zhTermFailure(fixed, SIFS)).toBe(null)
    // The abbreviation alone is not enough when the standard spells the term out.
    expect(zhTermFailure('这就是短帧间间隔（SIFS）', SIFS)).toBe(null)
  })

  /** P2 — kind (c): the abbreviation leads and the Chinese name never appears. */
  it('P2: reports a bare abbreviation with no Chinese name leading', () => {
    expect(zhTermFailure('这就是 EDCA。', EDCA))
      .toBe('EDCA used with no Chinese name leading, 增强型分布式信道接入（enhanced distributed channel access, EDCA）')
    const fixed = '这就是增强型分布式信道接入（enhanced distributed channel access, EDCA）。'
    expect(zhTermFailure(fixed, EDCA)).toBe(null)
    // An acronym-only term carries its expansion in the bracket instead.
    const msdu: ZhTerm = { en: 'MAC service data unit', abbr: 'MSDU' }
    expect(zhTermFailure('这份载荷就是 MSDU。', msdu)).toBe('MSDU used without （MAC service data unit）')
    expect(zhTermFailure('这份载荷就是 MSDU（MAC service data unit）。', msdu)).toBe(null)
  })

  /** P3 — the `aka` arm: section 3's inconsistent renderings. */
  it('P3: reports an alternative rendering of a term the course has already named', () => {
    expect(zhAkaViolations('这三段合起来，就是前导。', PREAMBLE))
      .toEqual(['前导 is an alternative rendering of 前导码'])
    // 前导码 CONTAINS 前导, and so do 前导符号 and 前导检测: a correct sentence is
    // not an `aka` violation, which is the masking arm of firstUseIndex.
    expect(zhAkaViolations('就是前导码（preamble），由 64 个前导符号组成，靠前导检测锁定。', PREAMBLE)).toEqual([])
    expect(zhAkaViolations('噪声地板（noise floor）以上 3 dB', { zh: '噪声地板', en: 'noise floor', aka: ['底噪', '器声地板'] }))
      .toEqual([])
    expect(zhAkaViolations('屋里那点底噪', { zh: '噪声地板', en: 'noise floor', aka: ['底噪', '器声地板'] }))
      .toEqual(['底噪 is an alternative rendering of 噪声地板'])
  })

  /**
   * P4 — the historical mutation: `\b` in front of a CJK pattern (inside a
   * template literal it is the backspace character, and between two ideographs
   * a word boundary matches nothing either way). It made two earlier rules in
   * this suite grade every lesson vacuously.
   *
   * Pinned from both sides: the matcher finds a CJK name in running text, and
   * the `\b` form finds nothing at all — so the coverage floor above, which
   * counts what was graded, goes from "at least three" to zero the moment
   * somebody reintroduces it.
   */
  it('P4: matches a CJK name literally, which a word boundary never would', () => {
    const text = '这三段合起来，就是前导码（preamble）；一次交互内部是短帧间间隔（short interframe space, SIFS）。'
    const graded = [PREAMBLE, SIFS, EDCA].filter((t) => bracketedAtFirstZhUse(text, t) !== null)
    expect(graded.length, 'a literal CJK match grades the terms that are there').toBe(2)
    expect(new RegExp('\\b前导码').test(text), 'the historical bug: \\b matches nothing between ideographs').toBe(false)
    expect(new RegExp('\b前导码').test(text), 'and \\b in a template literal is a backspace').toBe(false)
  })
})
