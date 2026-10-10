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
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LESSONS } from '../../src/course/lessons'
import {
  CHARS_PER_MINUTE, COURSE_ORDER, MAX_MINUTES, MODULES, OBSERVE_MINUTES, TRY_MINUTES,
  lessonChars, lessonMinutes, needsClosure, trackOf,
} from '../../src/course/curriculum'
import { isMigrated, type Block, type Lesson } from '../../src/course/lessonKit'
import {
  cellTexts, gradedProseTexts, lessonStrings, lessonTexts, mainPathChars, paragraphTexts, readerTexts,
  ZH_TERMS, ZH_TERMS_EXCLUDED, bracketedAtFirstZhUse, brackets, zhAkaViolations, zhTermFailure, type ZhTerm,
} from '../../src/course/readability'
import {
  MIGRATING, MIGRATING_NOW, migratedLessons, names, orderedLessons, zhMainText, zhTermsFor,
} from './corpus'
import { LIMITS_DEBT_CEILING, MAIN_PATH_BAND, limitsRatchet, owed } from './coverageNumbers'

/**
 * MIGRATING, the lesson lists and the one ruler live in `tests/course/corpus.ts`, and the
 * ceiling, the band and the measured debt in `tests/course/coverageNumbers.ts` (both imported
 * above), because `tests/course/wifi-coverage.test.ts` measures the same `limits` debt over the
 * same migrated set and used to do it by reading this file's text with a regex. The definitions
 * are unchanged; see those modules for why they moved, and why they are two files.
 */
const byId = new Map(LESSONS.map((l) => [l.id, l]))
const ordered = orderedLessons()
const migrated = migratedLessons()

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
 * Both this rule and the term rule below graded every lesson in the new shape
 * EXCEPT the AMP track until 2026-10-02, when the last two AMP lessons were
 * migrated and the AMP-specific exclusion that used to stand here was deleted
 * along with them. It was already deliberately an opt-OUT rather than an
 * allow-list — until 2026-09-25 this was a per-lesson list, which meant a
 * lesson added to the course was graded by neither rule until somebody
 * remembered to add its id, which is how four rules in this suite came to
 * grade nothing while reporting success — but an opt-out still has to be
 * deleted once the thing it was opting out ships, or it is the same bug one
 * remove away from mattering again.
 */
describe('readability · a rule is carried as a procedure', () => {
  it('grades every lesson of the course', () => {
    // The anti-vacuity guard in its honest form: not "the ids I listed are
    // graded" but "nothing escapes". A new lesson is covered the moment it is
    // registered, without anyone editing this file.
    expect(migrated.length).toBeGreaterThanOrEqual(50)
  })

  it.each(migrated.map((l) => [l.id, l] as const))('%s writes its procedure out as steps', (_id, l) => {
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
/*
 * The prose this rule grades, in the reader's order: `gradedProseTexts`, which is
 * one of the four selectors over the single lesson walk (2026-10-05).
 *
 * It replaced a hand-rolled chain here, and the two were asserted equal element
 * for element over all 83 lessons in the commit that made the swap — the point of
 * the swap is that the walk cannot MISS a field, not that this rule should grade
 * more of them. What the old chain was careful about is carried over in the
 * selector, including the one defect this file had to fix once: `l.why` is
 * `undefined` for a lesson still in the old flat `body` shape, and `[l.why!, ...]`
 * papered over that with a non-null assertion, which checks nothing at run time —
 * TypeScript trusts the `!` and the gap becomes the literal four-character string
 * `"undefined"` in the joined text instead of a missing `why` failing anything.
 * `body` is walked too, in the slot `picture` and `numbers` occupy in the new
 * shape, so an old-shape lesson's prose is graded rather than silently replaced.
 *
 * `zhMainText` (imported from `./corpus`) is `gradedProseTexts(l).join(' ')`; the assertion
 * below is the one place that needs the strings unjoined, and it calls the selector directly.
 */

/**
 * The swap of 2026-10-05, pinned from the side that matters: `gradedProseTexts`
 * is a RESTATEMENT of the chain it replaced, not a widening of it.
 *
 * The chain is written out again here, verbatim as it stood at `b06c8e7`, and
 * the two are compared element for element over all 83 lessons. The design note
 * said this assertion could be deleted once it had run once; it is kept, because
 * it is the only thing in the repository that can tell "the selector is the old
 * walk" from "the selector is close enough to the old walk". Those are the two
 * claims the whole no-behaviour-change step rests on, and one of them is cheap
 * to assert and expensive to re-derive.
 *
 * It is an equality on the SEQUENCE, not on a set: this rule is about first use,
 * so the order the reader meets the text in is part of the ruler.
 */
describe('readability · the graded-prose selector is the walk it replaced', () => {
  const retired = (l: Lesson): string[] => (l.why ? [l.why] : [])
    .concat(l.outcomes ?? [])
    .concat(paragraphTexts(l.body ?? []), cellTexts(l.body ?? []))
    .concat(paragraphTexts(l.picture ?? []), cellTexts(l.picture ?? []))
    .concat(paragraphTexts(l.numbers ?? []), cellTexts(l.numbers ?? []))
    .concat(l.observe, l.tryThis, l.quiz.flatMap((q) => [q.q, ...q.options, q.explain]))

  it.each(ordered.map((l) => [l.id, l] as const))('%s is graded on exactly the same strings, in the same order', (_id, l) => {
    expect(gradedProseTexts(l)).toEqual(retired(l))
  })

  it('grades every lesson of the course, so the equality above is not over an empty list', () => {
    expect(ordered.length).toBe(LESSONS.length)
    expect(ordered.reduce((n, l) => n + gradedProseTexts(l).length, 0)).toBeGreaterThan(5000)
  })
})

/*
 * `zhTermsFor` — the glossary rows graded in one lesson: all of them, minus the three whose
 * Chinese word means something else in the other track (`ZhTerm.track` says which, and why each
 * one is there) — is imported from `./corpus`, together with `zhMainText` and `names`. One
 * definition of the ruler, used by this file's bracket rule and by the `limits` debt the coverage
 * table states.
 */

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
  const revised = migrated

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

  /**
   * The ruler's own defect, pinned. `bracketCarriesEnglish` matched brackets
   * with a regex that is not nesting-aware, so on a bracket holding another
   * bracket it stopped at the INNER close and never read the outer tail — a
   * term named there read as unnamed, silently. Both halves are asserted: the
   * tail after a nested bracket, and the nested bracket itself.
   */
  it('reads a bracket that contains another bracket, in both halves', () => {
    const tail = '这一小会儿叫短帧间间隔（它在别处（见上文）也写作 short interframe space, SIFS）。'
    expect(zhTermFailure(tail, SIFS)).toBe(null)
    const inner = '这一小会儿叫短帧间间隔（见上文（short interframe space, SIFS）那一段）。'
    expect(zhTermFailure(inner, SIFS)).toBe(null)
    // And it still fails when neither bracket carries the name — the widened
    // reader must not turn into one that accepts anything.
    const neither = '这一小会儿叫短帧间间隔（见上文（第三节）那一段）。'
    expect(zhTermFailure(neither, SIFS)).toBe('短帧间间隔 first used without （short interframe space, SIFS）')
  })

  /**
   * The superset claim itself, which is the whole reason `brackets()` could replace the regex
   * without re-checking the corpus behind it. Asserted against the regex it replaced, over every
   * bracket string of length six or less that the two widths can spell — well nested, badly
   * nested, unbalanced either way, mixed widths. The branch review found the claim false on
   * `(A（B)` by hand; this is the exhaustive version, so the next person to widen the scanner
   * learns immediately whether they narrowed it instead.
   */
  it('finds every region the regex it replaced found, with at least as much content', () => {
    const OLD = /[（(]([^）)]{0,200})[）)]/g
    const alphabet = ['(', ')', '（', '）', 'A', 'B']
    let words: string[] = ['']
    const all: string[] = []
    for (let n = 0; n < 6; n++) {
      const next: string[] = []
      for (const w of words) for (const c of alphabet) next.push(w + c)
      all.push(...next)
      words = next
    }
    let checked = 0
    for (const w of all) {
      if (!/[（(]/.test(w)) continue
      const got = brackets(w)
      for (const m of w.matchAll(OLD)) {
        const at = m.index ?? -1
        const inside = m[1] ?? ''
        const mine = got.find((r) => r[0] === at)
        expect(mine, `${JSON.stringify(w)}: regex found a region at ${at} and the scanner did not`)
          .toBeDefined()
        expect(mine![1].length, `${JSON.stringify(w)}: region at ${at} lost content`)
          .toBeGreaterThanOrEqual(inside.length)
        checked++
      }
    }
    // The walk is only worth its runtime if it actually exercised the shapes in question.
    expect(checked).toBeGreaterThan(1000)
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

/**
 * Amendment 2026-10-04, "a lesson is not dated by the day it was written".
 *
 * The UWB read-through found four sentences that had been true the week they
 * were written and were quietly wrong afterwards: 「Wi-Fi 侧本周刚加上的阴影与
 * 小尺度衰落」 in `uwb-dstwr`, 「Wi-Fi 侧本周新增的两层衰落」 in `uwb-coexist`,
 * and 「这一条 2026-10-03 已经建进去了」 in `uwb-acquisition`. Two sibling copies
 * of the same sentence in `uwb-dl-tdoa` and `uwb-subrounds` had already been
 * reworded to 「那两层衰落」, which is the shape this rule asks for: a lesson may
 * say WHAT the engine does, never WHEN somebody built it.
 *
 * Why nothing caught them: all three live in `limits`, and `lessonStrings`
 * deliberately leaves `limits`, `title`, variant labels and jump labels out
 * (they are each walked by hand where a test wants them). So the three sites
 * the reader can read were in no walk at all. `readerText` below is that walk,
 * and the rule is run over it rather than over `lessonStrings`.
 *
 * The patterns are deliberately narrow, and they were MEASURED against the
 * whole 82-lesson course before being written down, because the obvious wide
 * ones are all wrong here:
 *  - bare 「刚」 has 36 honest sites (刚好, 一台刚开机的站点, 刚离开);
 *  - bare 「目前」 is 「到目前为止」, the reader's position in the course, 9 times;
 *  - bare 「今天」 is 「今天这条按块的规则」, the engine as it stands, 5 times;
 *  - any four-digit year bans 「IEEE Std 802.11-2024」 and the draft dates the
 *    `sources` of eight lessons depend on (「D0.5 于 2026 年 5 月发布」).
 * What is left after that measurement is an ISO date and the wall-clock words
 * that can only mean the author's own week — and those matched exactly the
 * three known sites and nothing else.
 */
describe('readability · no lesson dates itself', () => {
  /**
   * Every string the reader can read, INCLUDING the four `lessonStrings` leaves
   * out. This was a hand-rolled list of those four; `readerTexts` is the one walk
   * since 2026-10-05, so a fifth field is in this net the moment it is added
   * rather than when somebody remembers. `until` and `seeAlso` are lesson ids
   * rather than prose and are excluded there, the way `term` always has been.
   */
  const readerText = (l: Lesson): string[] => readerTexts(l)

  const ROTS: readonly { why: string; re: RegExp }[] = [
    { why: 'an ISO date', re: /\d{4}-\d{2}-\d{2}/ },
    { why: "a week, month or day relative to the author's own", re: /本周|本月|上周|下周|这周|上个月|下个月|本季|昨天|前天|明天|去年|今年|明年/ },
    { why: '「刚」 plus a shipping verb', re: /刚(刚)?(加上|新增|加进|建|接上|改成|做完|落地|上线)/ },
    { why: 'something described as newly added', re: /新增的|新加的|新近/ },
  ]

  it.each(ROTS.map((r) => [r.why, r] as const))('no lesson says %s', (_why, rot) => {
    const hits: string[] = []
    for (const l of LESSONS) {
      for (const s of readerText(l)) {
        const m = s?.match(rot.re)
        if (m) hits.push(`${l.id}: …${s.slice(Math.max(0, s.indexOf(m[0]) - 24), s.indexOf(m[0]) + 28)}…`)
      }
    }
    expect(hits, `${rot.why}: say what the engine does, not when it was built`).toEqual([])
  })

  /**
   * The anti-vacuity guard: this rule has to be able to fail, and it has to
   * still see the field the three real sites were hiding in. `lessonStrings`
   * not walking `limits` is exactly why they survived, so that gap is pinned
   * here rather than assumed — if `lessonStrings` ever starts walking `limits`,
   * this line goes red and `readerText` can be simplified on purpose instead of
   * by accident.
   */
  it('grades the field the three real sites were in, and can fail', () => {
    // 2026-10-05: this is the line the comment above promised would go red one day,
    // and it did not — `lessonStrings` still leaves `limits` out on purpose, because
    // around thirty per-lesson tests pin their claims through it. What moved is the
    // second half: `readerText` is `readerTexts` now, the walk rather than a list.
    const dstwr = LESSONS.find((l) => l.id === 'uwb-dstwr')!
    expect(lessonStrings(dstwr), '`lessonStrings` still leaves `limits` out')
      .not.toContain(dstwr.limits[dstwr.limits.length - 1].text)
    expect(readerText(dstwr), 'but `readerTexts` reaches it')
      .toContain(dstwr.limits[dstwr.limits.length - 1].text)
    for (const { re } of ROTS) expect(re.test('Wi-Fi 侧本周刚加上的两层衰落，2026-10-03 新增的')).toBe(true)
  })
})

/**
 * Amendment 2026-10-04, the four sites the UWB read-through found where a name
 * arrives before the lesson that owns it.
 *
 * The term rule above grades `why`, `outcomes`, `picture`, `numbers`,
 * `observe`, `tryThis` and `quiz`, and deliberately not `deeper` or `sources`
 * — collapsed professional depth, where `sources` already keeps the clause
 * numbers and the English names. That exclusion is why none of these turned it
 * red, and it is NOT a bug: three of the four sites below are in `deeper`, and
 * the read-through's claim that they are "rule violations" is wrong. They are
 * stumbles, which is a different and smaller thing: the reader meets GDOP six
 * lessons before `uwb-geometry` and DL-TDoA five before `uwb-dl-tdoa`, with no
 * bracket and no forward pointer, in a track whose own habit is to supply both
 * (`uwb-sstwr` on FoM and `uwb-position` on GDOP each say 「后面有专门一课」).
 *
 * A general rule was MEASURED before this narrow one was written, and it does
 * not exist: taking every acronym some lesson declares in `terms` and flagging
 * every earlier reader-visible use gives 81 sites, and the great majority are
 * honest — bracketed in place (DIFS, EIFS, CTS), inside a quoted log line
 * (`GDOP 1.05, 4 anchors`), or an ordinary English word that collides with an
 * acronym (`CQI Report`, `Block Ack Request`). A rule with that false-positive
 * rate would be edited away, so what is pinned here is the four sites
 * themselves, each with the shape the fix gave it.
 */
describe('readability · a name that arrives early says where it is taught', () => {
  const byId = new Map(LESSONS.map((l) => [l.id, l]))
  const lesson = (id: string): Lesson => {
    const l = byId.get(id)
    expect(l, `${id} is in the course`).toBeDefined()
    return l!
  }
  /** Everything in a lesson a reader can read, `limits` and the chrome included. */
  const everything = (l: Lesson): string => readerTexts(l).join(' / ')
  const earlier = (a: string, b: string): void =>
    expect(COURSE_ORDER.indexOf(a), `${a} precedes ${b}`).toBeLessThan(COURSE_ORDER.indexOf(b))

  it('uwb-dstwr names GDOP in full and points at uwb-geometry', () => {
    earlier('uwb-dstwr', 'uwb-geometry')
    const text = everything(lesson('uwb-dstwr'))
    expect(text).toContain('几何精度因子（geometric dilution of precision, GDOP）')
    expect(text).toContain('后面有专门一课讲它')
    // the lesson that owns it still owns it
    expect(lesson('uwb-geometry').terms!.map((t) => t.term)).toContain('GDOP')
  })

  it('uwb-m2m names DL-TDoA in full and points at uwb-dl-tdoa', () => {
    earlier('uwb-m2m', 'uwb-dl-tdoa')
    const text = everything(lesson('uwb-m2m'))
    expect(text).toContain('到达时间差（time difference of arrival, TDoA）')
    expect(text).toContain('下行形态（downlink TDoA, DL-TDoA）')
    expect(text).toContain('后面有专门一课讲它')
    // and the `sources` line that used to carry it bare now leans on the main one
    expect(lesson('uwb-m2m').sources!.join(' / ')).toContain('下行形态（DL-TDoA）')
    expect(lesson('uwb-dl-tdoa').terms!.map((t) => t.term)).toContain('DL-TDoA')
  })

  it('uwb-nba says the three variants it does not explain belong to the next lesson', () => {
    const nba = lesson('uwb-nba')
    const coexist = lesson('uwb-nba-coexist')
    earlier('uwb-nba', 'uwb-nba-coexist')
    // the two lessons share one menu on purpose (uwb-nba-coexist.test.ts pins that), so the
    // fix is disclosure in the prose rather than a shorter menu: three of the four labels are
    // the NEXT lesson's subject, and this lesson's own scene is the broken one, so a reader
    // looking for why reaches for them first.
    expect(nba.variants!.map((v) => v.label)).toEqual(coexist.variants!.map((v) => v.label))
    const text = lessonStrings(nba).join(' / ')
    expect(text).toContain('共用同一份变体菜单')
    expect(text).toContain('菜单里有三项是那一课的题目')
    for (const owed of ['跳变（channel hopping）', '先听后发（listen before talk, LBT）']) {
      expect(text, owed).toContain(owed)
    }
    // the one it does use, and the count the claim depends on
    expect(nba.variants).toHaveLength(4)
    expect(nba.variants![3].label).toBe('一次只问一个锚点')
    expect(text).toContain('本课自己只用第四项「一次只问一个锚点」')
  })

  it('uwb-sensing names UWB on its main path again', () => {
    // `0bb62e3` rewrote this lesson's last `limits` entry and deleted its only occurrence of
    // 超宽带（ultra-wideband, UWB）along with the half-sentence that held it. Nothing went red:
    // the term rule only asks that a term USED be bracketed, never that it be used, and the
    // sentence was in `limits`, which no walk reaches anyway.
    const text = lessonStrings(lesson('uwb-sensing')).join(' / ')
    expect(text).toContain('超宽带（ultra-wideband, UWB）')
  })
})

/**
 * Amendment 2026-10-05, the reach of the terminology rule
 * (docs/superpowers/specs/2026-10-05-wording-reach-design.md §3.6).
 *
 * The bracket rule above grades `gradedProseTexts`. Four reader-visible places
 * are outside that walk — `title`, `variants[].label`, `jumps[].label` and
 * `terms[].plain` — and a term may be NAMED in one of them while the lesson's
 * own prose never writes it. A reader then meets a word in a heading or on a
 * button with no English name behind it, anywhere.
 *
 * Running the bracket rule itself over those four is the wrong fix and that was
 * measured: it reddens 317 sites, of which 292 are in `limits[].text` alone —
 * more than `sources` (180) and `deeper` (81) together, the two fields the rule
 * EXCLUDES on purpose. The honest question is not "is this string graded" but
 * "may this string lean on a lesson the reader has already been told to read",
 * and the answer depends on WHERE THE STRING IS RENDERED. Hence two rules, not
 * one, and not three.
 *
 * ### Arm one — `title` — holds a lesson to its OWN main path
 *
 * Not because a title matters more. Because a title is the only one of the four
 * printed outside the lesson that owns it, and that is four line numbers in
 * `src/course/CoursePanel.tsx`:
 *  - `:312` — the contents list, all 83 of them, where the reader has read nothing;
 *  - `:436` — another lesson's `needs` button (66 distinct titles appear here);
 *  - `:581` / `:586` — beside another lesson's `limits`, as `limitUntil` /
 *    `limitSeeAlso` (8 distinct titles).
 * `:413` is the only one inside its own lesson.
 *
 * `:581`/`:586` is the sharpest of the four, because those edges all point
 * FORWARD: of the 16 `until`/`seeAlso` edges in the course, 16 of 16 name a
 * later lesson — delta +1 at the least, +13 median, **+38 at the most**
 * (`radio-primer` #1 → `fading` #39, and 21 of `fading`'s own prerequisites are
 * lessons the reader has not reached). So a title is printed in places where
 * that lesson's own prerequisites are not met. A `needs` closure cannot defend
 * a string rendered there, and a title therefore gets no closure.
 *
 * The other three have no cross-lesson render point at all, checked one by one:
 * `variants[].label` only at `:490`, `jumps[].label` only at `:364` and
 * `:503-504`, `terms[].plain` only at `:449-453` — each of them inside the
 * lesson being displayed.
 *
 * ### Arm two — the labels and the glosses — allow the `needs` closure
 *
 * To read one of those strings at all the reader must have opened the lesson,
 * and opening it puts its prerequisite chain on the screen. So a term there may
 * be bracketed in this lesson or in any lesson of its `needs` transitive
 * closure (`needsClosure`, src/course/curriculum.ts).
 *
 * ### Why `ofdma-dl | 下行` and `mumimo | 正交频分多址` are not the same site
 *
 * This sentence has to be written down, because the next reader will want to
 * merge the two arms, and merging them turns one of these into a wrong verdict
 * either way:
 *  - `mumimo`'s variant label reads `OFDMA（按频率划分）`. What occurs there is
 *    the ABBREVIATION, a mode name on a switch; the Chinese 正交频分多址 is
 *    nowhere in that lesson. Demanding it means making a lesson about
 *    multi-user MIMO open on behalf of the lesson about OFDMA — and that lesson,
 *    `ofdma-dl`, is `mumimo`'s DIRECT `needs`. Arm two passes it, correctly.
 *  - `ofdma-dl`'s TITLE reads `OFDMA 下行——一次发送，好几台设备`. What occurs there
 *    is the Chinese word 下行, and the lesson is the one that owns it. Demanding
 *    it means making a lesson write its own subject. Arm one failed it, and it
 *    was the arm's one real failure on landing: 下行 and `DL` were both absent
 *    from its graded main path and present only in `sources`.
 * One is "lesson A opens for lesson B", the other is "lesson A names its own
 * subject". The axis that tells them apart is the render position, not the field
 * name.
 *
 * ### The version that was thrown out, so nobody restores it
 *
 * An earlier cut of this rule split by FIELD: `title` **and** `variantLabel`
 * both held to the lesson's own main path. It is not vacuous — it reddens 5
 * sites today — and that is what makes it worse than vacuous: 4 of the 5 are
 * wrong catches, each bracketed in the lesson's own `needs` closure already
 * (`hidden`'s two RTS/CTS labels, `mumimo`'s OFDMA label, and `ofdma-dl | 下行`
 * itself, which is a real failure only under arm one's reasoning). Keeping it
 * would have meant a four-entry exemption ledger beside a five-site rule.
 * **What was thrown out is splitting by field, NOT the strict arm itself**:
 * arm one survives on the render-position evidence above, with 1 real failure
 * and 0 exemptions. Do not delete it as a leftover of that version.
 *
 * ### The lemma behind "no cheap fixes exist"
 *
 * The bracket rule is at 0 failures across the whole course. That is equivalent
 * to: every term NAMED on a graded main path already carries its bracket there.
 * So the bucket "the word is on the main path, it just lacks brackets" is empty
 * course-wide — measured at 1 058 (lesson, term) pairs, 0 of them unbracketed,
 * and 0 for each of `title`, `variantLabel`, `jumpLabel`, `terms[].plain` and
 * `limits[].text` separately. Every failure either arm can find therefore costs
 * new prose, which is why the arms have to be right about WHOSE prose it is.
 *
 * ### Why `terms[].plain` is in arm two and never in the bracket rule
 *
 * Permanently, and not because nobody noticed. 101 of the 272 glossary rows
 * explain their word using another glossary word, which is what an explanation
 * is: a gloss necessarily borrows words defined elsewhere, or it is not a gloss
 * but a recursion. Demanding a bracket for each borrowed word turns 272 rows
 * into brackets. Arm two is the right bar for it, because a gloss makes the same
 * claim a label does — that the reader already has this word.
 */
describe('readability · a term in the chrome has somewhere to have been learned', () => {
  const lessonsById = new Map(LESSONS.map((l) => [l.id, l]))

  /** One ruler for both sides of every comparison below — `names` comes from `./corpus`. */
  const taught = (text: string, t: ZhTerm): boolean => bracketedAtFirstZhUse(text, t) === true
  const wanted = (t: ZhTerm): string => (t.zh
    ? `${t.zh}${t.abbr ? `（${t.en}, ${t.abbr}）` : `（${t.en}）`}`
    : `${t.abbr}（${t.en}）`)
  const named = (t: ZhTerm): string => t.zh ?? t.abbr!

  /** Arm one: a term the title names must be bracketed on this lesson's own main path. */
  function titleArmFailures(l: Lesson): string[] {
    const own = zhMainText(l)
    const out: string[] = []
    for (const t of zhTermsFor(l)) {
      if (!names(l.title, t) || taught(own, t)) continue
      out.push(`${l.id}: the title 「${l.title}」 names ${named(t)}, and this lesson's own`
        + ` main path never writes ${wanted(t)}`)
    }
    return out
  }

  /**
   * Arm two: a term a variant label, a jump label or a glossary line names must
   * be bracketed on this lesson's main path, or on the main path of some lesson
   * in its `needs` transitive closure.
   *
   * The three sections come from `lessonTexts`, not from a hand-rolled list of
   * fields — that is the whole point of the walk this rule is built on.
   */
  function closureArmFailures(l: Lesson, lessons: Lesson[] = LESSONS): string[] {
    const by = new Map(lessons.map((x) => [x.id, x]))
    const labels = lessonTexts(l)
      .filter((t) => t.section === 'variantLabel' || t.section === 'jumpLabel' || t.section === 'terms')
    const own = zhMainText(l)
    const closure = [...needsClosure(l.id, lessons)].flatMap((id) => by.get(id) ?? [])
    const out: string[] = []
    for (const t of zhTermsFor(l)) {
      const at = labels.find((x) => names(x.text, t))
      if (!at || taught(own, t)) continue
      if (closure.some((c) => taught(zhMainText(c), t))) continue
      out.push(`${l.id}: ${at.path} 「${at.text}」 names ${named(t)}, and neither this lesson`
        + ` nor any of its ${closure.length} prerequisites ever writes ${wanted(t)}`)
    }
    return out
  }

  it.each(migrated.map((l) => [l.id, l] as const))('%s names in its own prose every term its title uses', (_id, l) => {
    expect(titleArmFailures(l), `${l.id}: a title is printed in the contents list and beside`
      + ' other lessons’ limits, where this lesson’s own prerequisites are not met').toEqual([])
  })

  it.each(migrated.map((l) => [l.id, l] as const))('%s has a lesson behind every term on its labels and in its glossary', (_id, l) => {
    expect(closureArmFailures(l), `${l.id}: a label or a gloss claims the reader already has`
      + ' this word; the lesson or one of its prerequisites has to have given it').toEqual([])
  })

  /**
   * Anti-vacuity, arm one. Three rules in this suite have reported success while
   * grading nothing, so what is asserted is not "the ids I listed pass" but "the
   * rule looked at something". 40 (lesson, term) pairs across 29 lessons on
   * 2026-10-05.
   */
  it('actually grades titles, across tens of lessons', () => {
    let pairs = 0
    const lessons = new Set<string>()
    for (const l of migrated) for (const t of zhTermsFor(l)) if (names(l.title, t)) { pairs++; lessons.add(l.id) }
    expect(pairs, 'glossary terms the titles of this course name').toBeGreaterThanOrEqual(30)
    expect(lessons.size, 'lessons whose title names a glossary term').toBeGreaterThanOrEqual(20)
  })

  /**
   * Anti-vacuity, arm two — and the sharper half of it. The floor on pairs
   * examined is the usual guard; the floor on pairs that ONLY the closure
   * satisfies is what makes the closure load-bearing rather than decorative. If
   * the closure were deleted and the arm held every label to its own lesson,
   * 35 sites would go red on 2026-10-05, and the design measured 26 of the 28
   * jump-label sites as bracketed in a prerequisite — which is why the strict
   * version of this arm was thrown out.
   */
  it('actually grades labels and glosses, and the closure is what passes a quarter of them', () => {
    let pairs = 0
    let onlyClosure = 0
    for (const l of migrated) {
      const labels = lessonTexts(l)
        .filter((t) => t.section === 'variantLabel' || t.section === 'jumpLabel' || t.section === 'terms')
      const own = zhMainText(l)
      const closure = [...needsClosure(l.id, LESSONS)].flatMap((id) => lessonsById.get(id) ?? [])
      for (const t of zhTermsFor(l)) {
        if (!labels.some((x) => names(x.text, t))) continue
        pairs++
        if (!taught(own, t) && closure.some((c) => taught(zhMainText(c), t))) onlyClosure++
      }
    }
    expect(pairs, 'glossary terms the labels and glosses of this course name').toBeGreaterThanOrEqual(250)
    expect(onlyClosure, 'sites only the needs closure passes — delete it and these go red')
      .toBeGreaterThanOrEqual(25)
  })

  /**
   * Both arms, able to fail, on a two-lesson course written out in full — the
   * same shape the term rule's own P1–P4 probes use. Pinned here as well as by
   * the mutations run against the real corpus on landing, because a mutation is
   * a thing somebody did once and this is a thing that runs every time.
   *
   * The discriminating quantity is chosen where the two arms DISAGREE, not where
   * they happen to agree: the second lesson's title and its label both name 下行,
   * its own prose never does, and its prerequisite's prose does. Arm one must
   * fail on it and arm two must pass on it, from the same fixture. A fixture on
   * which both arms answered the same would have proved nothing about the axis.
   */
  it('fails a title that leans on a prerequisite, and passes a label that does', () => {
    const base: Omit<Lesson, 'id' | 'title' | 'why' | 'needs' | 'jumps'> = {
      module: 0, outcomes: ['甲', '乙'], terms: [{ term: 'DL', plain: '方向那个词' }],
      picture: [{ kind: 'watch', text: '去看一眼' }], numbers: [{ text: '一个数' }],
      sources: ['出处'], limits: [], scenario: () => ({}) as never,
      observe: ['看'], tryThis: ['试'], quiz: [{ q: '问', options: ['甲', '乙'], answer: 0, explain: '解释' }],
    }
    const teacher: Lesson = {
      ...base, id: 'teacher', title: '一课', needs: [],
      why: '这个方向叫下行（downlink, DL），本课把它讲完。', jumps: [{ label: '第一帧', find: () => true }],
    }
    const borrower: Lesson = {
      ...base, id: 'borrower', title: '下行是怎么排的', needs: ['teacher'],
      why: '本课只把它排进一张表，不解释任何方向。', jumps: [{ label: '第一个下行帧', find: () => true }],
    }
    const course = [teacher, borrower]
    // the teacher passes both arms: it writes the term itself
    expect(titleArmFailures(teacher)).toEqual([])
    expect(closureArmFailures(teacher, course)).toEqual([])
    // the borrower's TITLE fails, because a title is printed where `teacher` has not been read
    expect(titleArmFailures(borrower)).toEqual([
      "borrower: the title 「下行是怎么排的」 names 下行, and this lesson's own main path"
      + ' never writes 下行（downlink, DL）',
    ])
    // its LABEL and its gloss pass, because `teacher` is in its closure
    expect(closureArmFailures(borrower, course)).toEqual([])
    // and the label arm does fail once the prerequisite is taken away. The replacement
    // goes into the course list too: `needsClosure` resolves `needs` through the list it
    // is handed, so handing it a lesson object the list does not contain would read the
    // old prerequisites back and quietly prove nothing.
    const alone: Lesson = { ...borrower, needs: [] }
    expect(closureArmFailures(alone, [teacher, alone])).toEqual([
      'borrower: jumps[0].label 「第一个下行帧」 names 下行, and neither this lesson nor any'
      + ' of its 0 prerequisites ever writes 下行（downlink, DL）',
    ])
  })
})

/**
 * The `limits` debt, ratcheted — 2026-10-05, design §3.4 and §8 step 4.
 *
 * `limits[].text` is the one field of a lesson that is rendered on the main path
 * (`CoursePanel.tsx:563`, a yellow-edged block open by DEFAULT, above the
 * collapsed `sources`), written at the density of collapsed professional depth,
 * and timed at zero. Those three things cannot all be right, and until this
 * assertion nothing in the repository could tell.
 *
 * The measurement that says so: run the bracket rule's own ruler over the terms
 * `limits` names, and compare field by field against the two fields that rule
 * EXCLUDES on purpose. `limits` is not an oversight in the same league as them —
 * it is worse than both put together:
 *
 * ```
 *                 criterion Q            criterion P
 *   limits        292 pairs / 76 lessons  (296 before slice 3d paid four back)
 *   sources       182 pairs / 68 lessons  176 = 172 bracket + 4 aka
 *   deeper         86 pairs / 39 lessons   76 =  75 bracket + 1 aka
 * ```
 *
 * ### The two criteria, and why this assertion has to name which one it uses
 *
 * They are easy to confuse and the design document was written wrong once by
 * confusing them, so both are defined here:
 *  - **criterion P** — how many FAILURE MESSAGES the bracket rule would newly
 *    emit if the field were appended to its walk. A message per lesson per term,
 *    in two arms (the bracket arm and the `aka` arm).
 *  - **criterion Q** — how many (lesson, term) PAIRS exist where the term is
 *    named in the field and never named on that lesson's graded main path.
 *
 * **This ratchet is criterion Q, and the number is 292.** It is NOT the same
 * criterion as P, even though the two coincided at 296 before slice 3d — and the
 * fact that they coincide here is precisely why the distinction is spelled out
 * rather than assumed. They are measurably different criteria: on `sources` Q is
 * 182 and P is 176, on `deeper` Q is 86 and P is 76. If a later reader finds
 * these two numbers equal again, that is a coincidence of this corpus, not a
 * definition.
 *
 * ### What this assertion does and does not ask for
 *
 * It does not ask anyone to fix 292 sites. It makes the debt visible and forbids
 * the 297th: a new `limits` entry that names an official term the lesson's own
 * main path never names turns this red, and the fix is one sentence on the main
 * path. Paying the debt itself means splitting six lessons — adding `limits` to
 * `mainPathChars` moves 50 lessons' stated minutes and puts six of them over the
 * 30-minute ceiling — which is another slice, and the design document has the
 * figures so that slice need not re-measure them.
 *
 * One ruler on both sides of the comparison, deliberately: an earlier count of
 * this same debt came out as 279 because the "appears in `limits`" side matched
 * abbreviations on a whole-token boundary while the "appears on the main path"
 * side used a bare `includes`, which excused ten pairs. `bracketedAtFirstZhUse`
 * is the ruler here, and it is the same call on both sides.
 */
describe('readability · the limits debt is pinned, and the 297th entry is refused', () => {
  // `names` comes from `./corpus`; `owed` (criterion Q for one field of one lesson), `limitsOf`,
  // the ceiling and the measured ratchet from `./coverageNumbers`, unchanged. They moved out of
  // this file on 2026-10-09 so
  // that §17 of docs/wifi-feature-coverage.md — which states this debt AND its 余量 to a reader —
  // compares against the MEASURED debt instead of against this `it`'s title text.

  /**
   * **The number itself is `LIMITS_DEBT_CEILING` in `./coverageNumbers`**, so this `it`'s title, the
   * comparison below and §17 of docs/wifi-feature-coverage.md all read one definition.
   *
   * **This number is the ceiling AND the current value: the debt stands at exactly 292.** There
   * is no slack in it, and that is deliberate rather than an accident of when it was measured —
   * a ratchet with room left in it is not a ratchet. What it means in practice, for whoever next
   * adds a `limits` entry:
   *
   *  - naming an official term that this lesson's own main path never names turns this red, with
   *    no warning shot;
   *  - the fix is one sentence on the main path, bracketing the term at its first use — not a
   *    bigger number here;
   *  - if that sentence will not fit, the other legal move is to pay one of the existing 292
   *    back, which is the same work on a different lesson;
   *  - **raising the ceiling needs a human to agree to it.** It is not a thing to do because the
   *    build is red.
   *
   * **296 → 292 on 2026-10-05, and the ratchet came down with it.** Slice 3d rewrote
   * `uwb-ancillary`'s `out-of-scope` limit — it stated the wrong mechanism, and its wrong sentence
   * was where four of this debt's entries came from (下行, 到达时间差, 多毫秒, 片段, all four named in
   * 「多对多、下行到达时间差、多毫秒片段全都共用的结构」, a clause that was false). Paying debt down is
   * never a human's call — only raising the ceiling is — and leaving the number at 296 would have
   * left four characters of slack in a ratchet whose whole argument is that it has none. The new
   * lesson of that slice added **zero**: its three `limits` name one official term
   * (媒体访问控制) and that term is bracketed on its own main path.
   *
   * The earlier precedent, so the instruction is not merely an instruction: the slice that added
   * `wan-rtt` and `edca-tamper` (2026-10-05) ran this up to 302 — six terms in the new lessons'
   * `limits` and five more from rewriting four existing ones — and brought every one of the
   * twelve back. Nine went onto a main path where they belonged anyway (`管理帧`, `信标`,
   * `参数集`, `帧头` are what 「作弊者偏离的是一套从未被广播过的参数」 is made of); three were
   * reworded, including one that was a term COLLISION rather than a missing bracket (`探测` is
   * the glossary's channel sounding, and the sentence meant a ping). The number did not move.
   */
  it(`owes no more than ${LIMITS_DEBT_CEILING} (lesson, term) pairs in \`limits\` — criterion Q, not P`, () => {
    const { pairs, debt } = limitsRatchet()
    expect(debt, `${debt} official terms are named in a lesson's \`limits\` and`
      + " never on that lesson's own main path. This is a ratchet: it does not ask for the"
      + ' existing ones to be fixed, it refuses the next one. If you added a `limits` entry,'
      + ' name the term on the main path too.').toBeLessThanOrEqual(LIMITS_DEBT_CEILING)
    // and it is not allowed to quietly become vacuous either: the debt is real today
    expect(debt, 'the debt this ratchet exists to make visible').toBeGreaterThanOrEqual(200)
    expect(new Set(pairs.map((p) => p.split('|')[0])).size, 'lessons carrying the debt')
      .toBeGreaterThanOrEqual(60)
    // and the number this ratchet asserts on is the number §17 of docs/wifi-feature-coverage.md
    // is compared against. Measured 2026-10-09 that this is not decoration: re-measuring the debt
    // privately HERE with a looser ruler (a bare `includes` on the main-path side, the historical
    // 279-vs-292 bug) gave 285 and left both this assertion and §17's row green — the ceiling had
    // quietly loosened by seven with nothing red. A fork on the document's side is caught by the
    // document; this is the same catch for a fork on this side.
    expect(debt, 'the ratchet is asserting on a privately re-measured debt, not on the shared'
      + ' `limitsRatchet()` that §17 of docs/wifi-feature-coverage.md is compared against')
      .toBe(limitsRatchet().debt)
  })

  /**
   * The comparison that makes the number mean something: `limits` is held to a
   * ratchet rather than graded, and the reason is that by this ruler it behaves
   * like the two fields the rule deliberately does not grade — only more so.
   * Asserted as an ordering rather than as three literals, so ordinary prose
   * edits do not touch it while the claim itself stays pinned.
   */
  it('carries more of this debt than `sources` and `deeper` put together', () => {
    const inSources = migrated.flatMap((l) => owed(l, (l.sources ?? []).join(' ')))
    const inDeeper = migrated.flatMap((l) => owed(l, gradedProseTexts({ picture: l.deeper }).join(' ')))
    const inLimits = limitsRatchet().pairs
    // 188 and 92 on 2026-10-09, against `limits`' 292 — the docblock above this describe once
    // recorded `sources` as 182, which was already stale when it was written (measured 185 before
    // slice 3d, 186 after it, 188 today). The assertions are floors and an ordering, so none of
    // the three moved.
    expect(inSources.length).toBeGreaterThan(100)
    expect(inDeeper.length).toBeGreaterThan(50)
    expect(inLimits.length, '`limits` is rendered open by default, written at the density of'
      + ' collapsed depth, and timed at zero — this is the number that says so')
      .toBeGreaterThan(inSources.length + inDeeper.length)
  })
})

/**
 * The stated minutes, pinned — 2026-10-05, design §6 and §8 step 5.
 *
 * The walk refactor of this slice replaced `mainPathChars`' hand-rolled field
 * list with a selector over `lessonTexts`, and the claim it rests on is that the
 * selector returns the same characters. A claim like that cannot be checked by
 * looking afterwards, because the course has a lesson one character from the
 * next five-minute bucket: `rate` needs **+1 Chinese character** to go from 20
 * minutes to 25. Behind it: `uwb-reply-time` +4, `uwb-m2m` +5, `ofdma-ul` +9,
 * `rts-cts` +11. A reading-order change that moved one string from `numbers` to
 * `sources` would move a number the reader has already seen, in a lesson nobody
 * was editing, with nothing going red.
 *
 * The stated minutes are reader-visible (`CoursePanel.tsx:389`), which is why
 * this slice declines to "improve" them: `title` is read once and a label is
 * clicked, so counting the chrome's 3 896 characters (2.17 % of the main path)
 * makes the estimate less accurate rather than more. The real omission is
 * `limits` — 48 115 characters, a quarter of the main path, open by default,
 * timed at zero — and paying it moves 50 lessons' minutes and puts six over the
 * 30-minute ceiling. That is a slice of its own; the ratchet above is what keeps
 * the debt visible until then.
 *
 * ### Both numbers were measured AFTER this slice's prose fixes, not before
 *
 * The design document quotes 179 215 and 1 740. Both were already stale before
 * this slice began — the corpus stood at 179 719 / 1 745 at `b06c8e7` — and the
 * first would have gone stale AGAIN inside the slice, because step 3 adds prose
 * to four lessons' main paths. Copying either figure from the design document
 * would have pinned a number that was false on the day it was pinned, and the
 * next person would have checked against it, failed, and suspected the code.
 * Measured here instead, after the fixes.
 *
 * ### The structure is asserted directly; the corpus total is only a sanity check
 *
 * The total was an equality on 179 872 for exactly one commit, and that was a
 * mistake worth writing down rather than quietly fixing. A check that is
 * designed to go red on every edit teaches one habit, and it is not reading it:
 * it teaches updating the number without looking at what moved. The most
 * expensive defect in this repository is a green check that cannot prove the
 * thing its name claims, and a check that is red every week is the same coin's
 * other face.
 *
 * **Then it was a band of 170 000–190 000, and the band had the same defect one
 * level up.** It was written to catch a structural change — its own message said
 * 「most likely a module added or removed」 — but it was a sum, so ordinary prose
 * editing moved it, and it carried a hand-written figure in this comment which
 * **went stale twice on 2026-10-05 alone**: the comment said 188 317 while the
 * corpus measured 188 798, pushed there by one lesson's edit (`b22dec2`,
 * `@selectivity`, +481), and the band stayed green because a band does not
 * notice. By then the ceiling left **1 202 characters of room** and the mean
 * lesson is 2 195, so the next lesson of any kind would have reddened a check
 * whose stated purpose was modules. A ceiling that no longer fits one of the
 * things it was sized in is not measuring that thing.
 *
 * So the structure is asserted as structure, in three pieces that each name what
 * moved, and none of which is a sum:
 *
 *  1. **the lesson count, exact.** A lesson arriving or leaving is a decision
 *     somebody makes on purpose, so it owes one line of diff here.
 *  2. **the module count, exact.** 「a module added or removed」 now has its own
 *     assertion instead of being inferred from a corpus total. This is the one
 *     the band claimed to be doing and could not do.
 *  3. **the per-lesson main path, inside a band** — and this one is per lesson,
 *     so its failure says which lesson. That is the whole gain over a sum: a red
 *     corpus total tells you something moved somewhere in 86 lessons.
 *
 * The per-lesson band is [700, 4 400], and both ends are a stated multiple of
 * the course mean rather than a fitted number:
 *
 *  - **4 400 is twice the mean lesson** (2 × 2 195 = 4 390, rounded out).
 *    `curriculum.ts`'s own rule for minutes says a lesson past 30 minutes is a
 *    lesson teaching two topics; this is that rule in characters.
 *  - **700 is about a third of the mean**, and it is a gut check rather than a
 *    detector. Measured: dropping `terms` out of `MAIN_PATH_SECTIONS`
 *    altogether — a whole section of the walk gone — moves the shortest lesson
 *    from 1 081 to 1 041, nowhere near 700. So the floor catches a lesson being
 *    gutted, not a lesson losing a section; the per-section census in
 *    `tests/course/readability-rules.test.ts` catches that one and is exact, and
 *    the failure message says so rather than implying otherwise.
 *
 * Measured margins on 2026-10-05, from the census at the bottom of this comment:
 * the longest lesson is `@ru-diversity` at 4 030 (370 below the ceiling) and the
 * shortest is `@relay-hops` at 1 081 (381 above the floor). Those two are both
 * about a sixth of a mean lesson, so the band is not loose — **but it does not
 * bind a new lesson at all**, which is the point: a new lesson lands at
 * 2 000–3 000 characters, in the middle third of the band, where the old ceiling
 * had 1 202 characters of room for a 2 195-character lesson. `@ru-diversity`
 * being 370 from its ceiling is deliberate and is written up as backlog slice W2:
 * it is already past raw 30 minutes, and the answer there is to split it.
 *
 * **No figure in the assertions below is hand-written except 86, 30 and the two
 * band edges.** The stale 188 317 is deleted rather than updated, because a
 * number that will expire should not live in a comment — it should be printed by
 * the census, which is what the failure messages now do.
 *
 * Re-measure with:
 *
 * ```ts
 * import { LESSONS } from '../../src/course/lessons'
 * import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
 * import { mainPathChars } from '../../src/course/readability'
 * const byId = new Map(LESSONS.map((l) => [l.id, l]))
 * const ordered = COURSE_ORDER.flatMap((id) => byId.get(id) ?? [])
 * ordered.length                                              // lessons
 * MODULES.length                                              // modules
 * ordered.map((l) => [l.id, mainPathChars(l)])                // the per-lesson band
 * ordered.reduce((n, l) => n + mainPathChars(l), 0)           // the sanity total
 * ```
 */
describe('readability · the stated minutes, and the characters behind them', () => {
  /**
   * One lesson's unrounded minutes, and how many Chinese characters of editing it would take to
   * push it into the next five-minute bucket. Shared by the three assertions below, because the
   * equality on 1 825 cannot say anything useful about its own failure without it.
   */
  const rawMinutes = (l: Lesson): number => lessonChars(l) / CHARS_PER_MINUTE
    + OBSERVE_MINUTES * l.observe.length + TRY_MINUTES * l.tryThis.length
  const toNextBucket = (l: Lesson): number =>
    (Math.round(rawMinutes(l) / 5) * 5 + 2.5 - rawMinutes(l)) * CHARS_PER_MINUTE

  /**
   * How many characters a lesson is PAST the bucket boundary it most recently crossed. Printed
   * next to the forward margin because the lesson that crossed is the one a red 1 825 is about,
   * and after crossing its forward margin is a comfortable 550 — it leaves the tight list rather
   * than topping it. This is the number that is small on exactly the culprit.
   */
  const sinceLastBucket = (l: Lesson): number =>
    (rawMinutes(l) - (Math.round(rawMinutes(l) / 5) * 5 - 2.5)) * CHARS_PER_MINUTE

  /**
   * Every lesson's two bucket margins, closest boundary first — the thing a red 1 825 needs to
   * say. The sum moving by ±5 means one lesson crossed; this census is where it is.
   */
  const margins = (): string => ordered
    .map((l) => [l.id, rawMinutes(l), toNextBucket(l), sinceLastBucket(l)] as const)
    .sort((a, b) => Math.min(a[2], a[3]) - Math.min(b[2], b[3]))
    .map(([id, raw, next, prev]) => `  @${id} raw ${raw.toFixed(2)} → ${lessonMinutes(byId.get(id)!)}`
      + ` min, ${next.toFixed(0)} characters to the next bucket, ${prev.toFixed(0)} past the last`)
    .join('\n')

  /**
   * **A lesson close to a bucket boundary says so in its own file, and the figure is checked.**
   *
   * The `toBe(1_925)` equality below is the only thing in the suite that notices a lesson
   * crossing a five-minute bucket, and it notices AFTER the fact: the next person to add a
   * sentence to `@rate` gets `expected 1930 to be 1925` on a file they did not open. Slice W13's
   * report asked for a header note and did not write one; slice W12c's wording contract already
   * recorded four of them, and those four said neither which assertion goes red nor what to do
   * about it.
   *
   * **The threshold is 50 Chinese characters, and it is the course's own sentence length.**
   * Measured over the 11 546 sentences of the 90 lessons (split on 。！？, Han characters only):
   * median 22, mean 26.1, p75 36, p90 52 — **88.5 % of this course's sentences are shorter than
   * 50 characters**. So "under 50 left" means "almost any sentence anybody adds flips the
   * bucket", which is exactly the population that owes a warning. It separates cleanly today: ten
   * lessons are under it, the eleventh (`@uwb-aoa`) is at 58, and the median lesson has 457.
   *
   * **What is checked is the three figures and the two pointers, not the prose.** The note's
   * character count, the bucket it is in and the bucket it would land in are recomputed here, so
   * a note cannot rot the way the six §17 figures and the `@link-2g` margin did — both of which
   * were hand-written numbers in comments that nothing read. The rest of the note is for a person
   * and is left alone, except that it must name the file that goes red and must not offer editing
   * the equality as a way out.
   *
   * It is a two-way rule on purpose: a lesson that moves AWAY from a boundary must lose its note,
   * because a warning about a danger that has passed is the thing that teaches readers to ignore
   * warnings.
   */
  describe('a lesson within 50 characters of a bucket says so in its own file', () => {
    const TIGHT_CHARS = 50
    /** The flattened leading docblock of a lesson's source file, by lesson id. */
    const docblocks = new Map<string, string>()
    const COURSE_SRC = fileURLToPath(new URL('../../src/course', import.meta.url))
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) { walk(p); continue }
        if (!e.name.endsWith('.ts')) continue
        const text = readFileSync(p, 'utf8')
        if (!text.startsWith('/**')) continue
        const block = text.slice(0, text.indexOf('\n */') + 4).replace(/\s*\n\s*\*\s?/g, ' ')
        for (const m of text.matchAll(/^\s*id: '([a-z0-9-]+)',$/gm)) docblocks.set(m[1], block)
      }
    }
    walk(COURSE_SRC)

    const NOTE = /CAUTION — (\d+) Chinese characters? from `lessonMinutes` rounding this lesson up from (\d+) to (\d+) minutes\./

    it('found a docblock for every lesson, so the rules below are not vacuous', () => {
      const missing = ordered.map((l) => l.id).filter((id) => !docblocks.has(id))
      expect(missing, 'no leading docblock found for these lesson ids').toEqual([])
    })

    const tight = ordered.filter((l) => Math.round(toNextBucket(l)) < TIGHT_CHARS)
    const roomy = ordered.filter((l) => Math.round(toNextBucket(l)) >= TIGHT_CHARS)

    it('has something to warn about, and something not to', () => {
      // If every lesson were tight the threshold would be meaningless, and if none were the
      // per-lesson rule below would assert nothing at all.
      expect(tight.length).toBeGreaterThan(0)
      expect(roomy.length).toBeGreaterThan(tight.length)
    })

    it.each(tight)('$id carries the note, with the right three figures', (l) => {
      const want = Math.round(toNextBucket(l))
      const at = lessonMinutes(l)
      const expected = `CAUTION — ${want} Chinese character${want === 1 ? '' : 's'} from`
        + ` \`lessonMinutes\` rounding this lesson up from ${at} to ${at + 5} minutes.`
      const block = docblocks.get(l.id) ?? ''
      const found = NOTE.exec(block)
      expect(found, `@${l.id} has ${want} characters left before ${at} becomes ${at + 5} minutes`
        + ' and its file says nothing. Add this to the end of its leading docblock, then the rest'
        + ` of the note the other nine carry:\n  ${expected}`).not.toBeNull()
      expect([found![1], found![2], found![3]].join('/'),
        `@${l.id}'s note has gone stale. It should read:\n  ${expected}`)
        .toBe(`${want}/${at}/${at + 5}`)
      // The two things the four notes of 2026-10-01 were missing, and the reason this slice
      // rewrote them: which assertion turns red, and that editing it is not the answer.
      expect(block, `@${l.id}'s note must name the file that goes red`)
        .toContain('tests/course/readability.test.ts')
      expect(block, `@${l.id}'s note must say what to do instead of widening the sum`)
        .toContain('re-pace or split, never the equality')
    })

    it('and no lesson with room to spare carries one', () => {
      // A stale warning is worse than none: the next reader learns that these notes are noise.
      // The 30-minute ceiling notes on `@ru-diversity`, `@amp-slots` and `@amp-coexist` are a
      // different sentence about a different limit and are deliberately not matched.
      const stale = roomy.filter((l) => NOTE.test(docblocks.get(l.id) ?? ''))
        .map((l) => `@${l.id} (${Math.round(toNextBucket(l))} characters of room)`)
      expect(stale, 'these lessons moved away from a boundary and kept the warning').toEqual([])
    })
  })

  it('has the lessons and the modules it says it has', () => {
    // The two structural counts, exact, each naming what moved. A lesson or a module arriving or
    // leaving is a deliberate act and owes one line of diff here; neither can be inferred from a
    // corpus total, which is what the retired band tried to do.
    // 88 → 89 on slice W12b, and the module count DID move with it: `uhr-rate-ladder` is the
    // first lesson of a new M13 under tier 3 (「第四阶段 · 研究」), inserted at index 13 rather than
    // appended, so 33 UWB lessons' `module` index shifted up by one in the same commit — 58 edits
    // across 38 files, the same bill tier 2's module paid on W3.
    // 87 → 88 on slice W3, and the module count DID move with it: `link-2g` is the first lesson
    // of a new M12 under tier 2, inserted at index 12 rather than appended, so 33 UWB lessons'
    // `module` index shifted up by one in the same commit. The contrast with W5 below is what
    // this `it` is for — there the lesson joined an existing module and 30 did not move.
    // 86 → 87 on slice W5, and the module count did NOT move with it: `amp-backscatter` is the
    // fifth lesson of the existing M10, so `MODULES.length` was still 30 and no UWB lesson's
    // `module` index shifted. Separating the two counts is what this `it` is for.
    // 89 → 90 on slice W13, and the module count did NOT move with it either: `claim-to-contribution`
    // is the SECOND lesson of the existing M13, which is what §6.0 of the tier-4 design predicted
    // and what tier 4 was given one module for — measured on that slice, the index migration cost
    // was 0 files and 0 sites, against the 58-across-38 that W12b paid to open M13.
    expect(ordered.length, 'lessons in COURSE_ORDER with authored prose behind them').toBe(90)
    expect(MODULES.length, 'modules — THIS is 「a module added or removed」, asserted directly')
      .toBe(32)
  })

  it('keeps every lesson\'s main path between a third of a lesson and two lessons', () => {
    // Per lesson, so the failure names the lesson. [700, 4 400] = about a third of the mean
    // lesson, and twice it; see the note above for why those two multiples and not a fitted
    // number. A new lesson lands at 2 000–3 000, in the middle third, so this does not bind one.
    const sorted = ordered.map((l) => [l.id, mainPathChars(l)] as const)
      .sort((a, b) => a[1] - b[1])
    const census = (): string => sorted.map(([id, n]) => `  ${id} ${n}`).join('\n')
    for (const [id, n] of sorted) {
      expect(n, `@${id} has ${n} main-path characters, under a third of the mean lesson — most`
        + ' likely it lost prose it is still assumed to have. This floor is a gut check and it'
        + ' is NOT what catches a lost section: the per-section census in'
        + ' tests/course/readability-rules.test.ts is, and it is exact.'
        + ` The course, shortest first:\n${census()}`)
        .toBeGreaterThan(MAIN_PATH_BAND.floor)
      expect(n, `@${id} has ${n} main-path characters, past twice the mean lesson. A lesson that`
        + ' long is a lesson teaching two topics, and the answer is to split it, never to'
        + ' compress it (curriculum.ts, lessonMinutes).'
        + ` The course, longest first:\n${sorted.slice().reverse().map(([i, c]) => `  ${i} ${c}`).join('\n')}`)
        .toBeLessThan(MAIN_PATH_BAND.ceiling)
    }
  })

  it('is a course and not a fragment, which is all the corpus total is asked for now', () => {
    // Demoted to an order-of-magnitude guard. It no longer carries a figure, because the figure
    // went stale twice on the day it was written; it catches `mainPathChars` returning 0 or the
    // walk collapsing, and nothing else. The structural signals are the three above.
    const chars = ordered.reduce((n, l) => n + mainPathChars(l), 0)
    expect(chars, `${chars} main-path Chinese characters across ${ordered.length} lessons`
      + ` (mean ${Math.round(chars / ordered.length)}). This is a sanity band, not a budget and`
      + ' not a structural signal — if it is red, the walk itself is broken.')
      .toBeGreaterThan(100_000)
    expect(chars).toBeLessThan(300_000)
  })

  it('states 1 925 minutes across the whole course, and no earlier lesson moved', () => {
    // 1 925 since slice W13: `claim-to-contribution` is 2 791 main-path characters, three things to
    // observe and two experiments — raw 26.6864, which the formula rounds to 25. **Measured after
    // the prose was final, not budgeted**, and trimmed once to get there: the first complete draft
    // was 2 870 characters, raw 27.0455, which left only 100 characters before the 27.5 boundary —
    // and M13's other lesson already sits 71 from its own. It now sits 178 clear above and 921
    // clear below. No earlier lesson moved: that slice added one lesson, two optional parameters to
    // an existing scene builder and six `CONTRIBUTIONS` entries, and edited no other lesson's prose.
    // 1 900 before it, since slice W12b: `uhr-rate-ladder` is 2 809 main-path characters, three things to
    // observe and two experiments — raw 26.7682, which the formula rounds to 25. **Measured after
    // the prose was final, not budgeted**, and it was trimmed twice to get there: the first
    // complete draft was 3 255 characters, raw 28.17, which rounds to 30 and would have put a new
    // lesson on the course's `MAX_MINUTES` ceiling. It now sits 161 characters clear of the 27.5
    // boundary above and 939 clear of the 22.5 one below. No earlier lesson moved: that slice
    // added one lesson, one scene builder and one `MODULES` entry, and edited no other lesson's
    // prose — the 33 UWB edits in the same commit are `module` indices, which
    // `MAIN_PATH_SECTIONS` does not count.
    // 1 875 before it, since slice W3: `link-2g` is 2 496 main-path characters, three things to observe and
    // two experiments — raw 25.3455, which the formula rounds to 25. **Measured after the prose
    // was final, not budgeted**, and it sits 626 characters clear of the 22.5 boundary below and
    // 474 clear of the 27.5 one above, so it does not appear near the top of the census.
    // (Re-measured 2026-10-09: this comment read 2 494 / raw 25.34 / 476 and 475. The character
    // count was wrong by two, the raw minute followed it, and 476 was the margin to the boundary
    // ABOVE, printed as the one below; 475 was never either of them. The lesson itself did not
    // move — `git log -p src/course/tier3/link-2g.ts` is one commit — so the figure was wrong when
    // it was written. Same defect class as the six §17 figures: hand-written, unchecked.) No earlier
    // lesson moved: that slice added one lesson, two scene builders and one `MODULES` entry, and
    // edited no other lesson's prose — the 33 UWB edits in the same commit are `module` indices,
    // which `MAIN_PATH_SECTIONS` does not count.
    // 1 850 before it, since slice W5: `amp-backscatter` is 2 487 main-path characters, three things to
    // observe and two experiments — raw 25.30, which the formula rounds to 25. **Measured after
    // the prose was final, not budgeted**, and it sits 283 characters clear of either bucket
    // boundary, so it does not appear near the top of the census below. No earlier lesson moved:
    // that slice added one lesson and two scene helpers and edited no other lesson's prose.
    // 1 825 before it, since slice 3d: `uwb-ancillary-request` is 2 990 main-path characters, two things to
    // observe and two experiments — raw 25.59, which the formula rounds to 25. **Measured after the
    // prose was final, not budgeted**, and `uwb-ancillary` itself did not move: that lesson's only
    // edit was to its `limits`, which `MAIN_PATH_SECTIONS` does not count.
    // **The equality is NOT relaxed** — it is deliberate that somebody looks at a new lesson's
    // minutes — but a bare `expected 1830 to be 1825` reads like "you broke something else".
    // What actually happened is that one lesson crossed a five-minute bucket, and the course has
    // six lessons within 25 characters of doing that (`@rate` within ONE), so the failure prints
    // every margin, tightest first. The reader of the red then sees the lesson, not the sum.
    // This replaces the hand-written margin table in docs/wifi-course-backlog.md, whose figures
    // for `@uwb-m2m` and `@rts-cts` were each one character out on the day it was written.
    expect(ordered.reduce((n, l) => n + lessonMinutes(l), 0),
      'the sum of every stated minute figure a reader can see. ±5 means one lesson crossed a'
      + ` bucket; every lesson's margin, tightest first:\n${margins()}`).toBe(1_925)
    // the two lessons of the built-but-untaught slice, measured after their prose was
    // final rather than copied from its design document (which budgeted 25 and 30 and
    // happened to be right, while its character budgets were not)
    expect(lessonMinutes(byId.get('wan-rtt')!)).toBe(25)
    expect(lessonMinutes(byId.get('edca-tamper')!)).toBe(30)
    // the four lessons this slice added prose to, and the one it did not have to
    expect(lessonMinutes(byId.get('ofdma-dl')!)).toBe(20)
    expect(lessonMinutes(byId.get('radio-primer')!)).toBe(15)
    expect(lessonMinutes(byId.get('small-frames')!)).toBe(20)
    expect(lessonMinutes(byId.get('uwb-mms')!)).toBe(25)
    expect(lessonMinutes(byId.get('uwb-uwbd')!)).toBe(20)
  })

  /**
   * The margin itself, as an assertion rather than as a remark. Without it the
   * two totals above look like arbitrary constants and the first person they get
   * in the way of deletes them. This says why they are there: the course has a
   * lesson that one more character would re-time.
   */
  it('has a lesson one character from the next bucket, which is why the totals are pinned', () => {
    const tightest = ordered.map((l) => [l.id, toNextBucket(l)] as const)
      .sort((a, b) => a[1] - b[1])[0]
    expect(tightest[0]).toBe('rate')
    expect(tightest[1], `${tightest[0]} is ${tightest[1].toFixed(2)} characters from being`
      + ' re-timed; prose edits in this course are not free').toBeLessThan(5)
    // and the lessons this slice did edit had room to spare, which is why it could choose
    // the fix that serves the reader instead of the one that protects a number
    for (const [id, least] of [['ofdma-dl', 100], ['radio-primer', 100], ['small-frames', 500],
      ['uwb-mms', 300], ['uwb-uwbd', 200]] as const) {
      const room = toNextBucket(byId.get(id)!)
      expect(room, `${id} has ${room.toFixed(0)} characters of room left`).toBeGreaterThan(least)
    }
  })

  /**
   * The other end of the same ruler, and it fires EARLIER than `fits one sitting` does.
   *
   * `lessonMinutes` rounds to five and clamps nothing, so a lesson at raw 31 still states 30 and
   * `fits one sitting` stays green until raw reaches 32.5. Two lessons are already past the
   * ceiling in raw terms, which means the next edit to either is the one that re-times it, and
   * the red it produces would arrive as a 1 825 failure rather than as "this lesson is too long".
   *
   * So the set is pinned, not the margin. A third lesson crossing raw 30 is a content decision —
   * `curriculum.ts` says the answer to a lesson past 30 minutes is to split it, never to compress
   * it — and it should be made on purpose rather than discovered at 32.5. Backlog slice W2 holds
   * the case for splitting these two; this assertion is what it asked for instead of the split.
   */
  it('names the lessons already past the 30-minute ceiling in raw terms', () => {
    const over = ordered.filter((l) => rawMinutes(l) > MAX_MINUTES).map((l) => l.id).sort()
    expect(over, 'lessons whose unrounded minutes exceed MAX_MINUTES. A new entrant here is a'
      + ' lesson teaching two topics (curriculum.ts, lessonMinutes) and the answer is to split'
      + ` it. Every lesson's margin, tightest first:\n${margins()}`)
      .toEqual(['ru-diversity', 'uwb-ancillary'])
  })
})
