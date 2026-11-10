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
import {
  CHARS_PER_MINUTE, COURSE_ORDER, MODULES, SITTING_MINUTES,
  isLongLesson, lessonBlocks, lessonMinutes, needsClosure, trackOf,
} from '../../src/course/curriculum'
import { isMigrated, isStandardFirst, type Block, type Lesson } from '../../src/course/lessonKit'
import {
  gradedProseTexts, lessonStrings, lessonTexts, mainPathChars, mainPathTexts, readerTexts,
  ZH_TERMS, ZH_TERMS_EXCLUDED, bracketedAtFirstZhUse, brackets, zhAkaViolations, zhTermFailure, type ZhTerm,
} from '../../src/course/readability'
import {
  MIGRATING, MIGRATING_NOW, migratedLessons, names, orderedLessons, zhMainText, zhTermsFor,
} from './corpus'
import { MAIN_PATH_BAND } from './coverageNumbers'

/**
 * MIGRATING, the lesson lists and the one ruler live in `tests/course/corpus.ts`, and the
 * per-lesson floor in `tests/course/coverageNumbers.ts` (both imported above), because
 * `tests/course/wifi-coverage.test.ts` states the same figures to a reader. The `limits` debt
 * ceiling and its measurement lived in that module too until 2026-11-11, when the standard-first
 * restructure retired `limits`; see the `describe` that replaced the ratchet below.
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
      if (isStandardFirst(l)) {
        // The standard-first shape (2026-11-10): ① standard, ② implementation, ③ labs, and every
        // lab points at a variant and a jump that exist and says what to see and what it shows.
        expect(l.standard!.length).toBeGreaterThan(0)
        expect(l.implementation!.length).toBeGreaterThan(0)
        expect(l.labs!.length).toBeGreaterThan(0)
        expect(l.sources!.length).toBeGreaterThan(0)
        for (const lab of l.labs!) {
          expect(lab.steps.length, lab.heading).toBeGreaterThan(0)
          expect(lab.expect.trim(), lab.heading).not.toBe('')
          expect(lab.meaning.trim(), lab.heading).not.toBe('')
          if (lab.variant !== undefined) expect(l.variants?.[lab.variant], lab.heading).toBeDefined()
          if (lab.jump !== undefined) expect(l.jumps[lab.jump], lab.heading).toBeDefined()
          for (const vi of lab.more ?? []) expect(l.variants?.[vi], lab.heading).toBeDefined()
        }
        return
      }
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
    // `lessonBlocks` is the main path in either shape; in the standard-first shape it is ① and the
    // labs' blocks, so the rule is carried as a procedure in the standard's own section.
    const steps = lessonBlocks(l).filter((b) => b.kind === 'steps')
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
  // **Retired 2026-11-11: the element-for-element comparison with the `b06c8e7` walk.** That walk
  // read `why`, `outcomes`, `body`/`picture`/`numbers`, `observe`, `tryThis` and `quiz` — the old
  // shapes' sections. Since 2026-11-11 every lesson is standard-first, so the `it.each` that ran
  // the comparison iterated an empty list and proved nothing. What the selector reads now is
  // pinned from the new sections instead: it opens with `why`, it reaches every ② row on both
  // sides and every ③ lab's reading, and it still leaves `terms` and `sources` out.
  it.each(ordered.map((l) => [l.id, l] as const))('%s is graded on why, ①, ② and ③, in that order', (_id, l) => {
    const graded = gradedProseTexts(l)
    expect(graded[0], 'the graded walk opens with `why`').toBe(l.why)
    const at = (s: string): number => graded.indexOf(s)
    for (const row of l.implementation!) {
      for (const s of [row.topic, row.standard, row.sim]) {
        expect(at(s), `${l.id}: ② 「${row.topic}」 is not in the graded walk`).toBeGreaterThan(-1)
      }
    }
    for (const lab of l.labs!) {
      for (const s of [lab.heading, ...lab.steps, lab.expect, lab.meaning]) {
        expect(at(s), `${l.id}: ③ 「${lab.heading}」 is not in the graded walk`).toBeGreaterThan(-1)
      }
    }
    // ② is read before ③: the first ② string comes before the first lab heading.
    expect(at(l.implementation![0].topic), `${l.id}: ② before ③`).toBeLessThan(at(l.labs![0].heading))
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
   *
   * 2026-11-11: after the standard-first restructure it named two — 碰撞避免 and
   * 每用户分配表. Neither is taught by any lesson (the course writes DCF/EDCA and the
   * standard's 用户信息字段 instead), so both rows were removed from ZH_TERMS rather than
   * a use being invented for them; `边界保护` went the same day, because it is not a
   * §9.2.5.2 name at all.
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
 *  - bare 「今天」 was 「今天这条按块的规则」 (a variant label, now 「上一课的按块规则」), the engine as it stands, 5 times;
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
   * The anti-vacuity guard: this rule has to be able to fail, and it has to see
   * the strings `lessonStrings` leaves out. The three real sites of 2026-10-04 were
   * in `limits`, which `lessonStrings` never walked — that gap was pinned here on
   * the first lesson that still had a `limits` section.
   *
   * **Re-pointed 2026-11-11.** No lesson has `limits` any more (the standard-first
   * restructure moved its content into ② `implementation`), so that pin had nothing
   * to stand on. What it protected still matters: this rule must read everything a
   * reader reads, including the chrome `lessonStrings` omits. So it is pinned on the
   * whole course now — every title, every jump label and every ② row is in
   * `readerTexts`, and the title and jump labels are NOT in `lessonStrings`.
   */
  it('grades every string a reader reads, including the ones `lessonStrings` leaves out, and can fail', () => {
    // The gap itself, on an object where nothing else could supply the string: a title that a
    // lesson also repeats in its prose (`retries-queues` uses its title as a lab heading) would
    // make a per-lesson 「not in lessonStrings」 check false for a reason that is not the gap.
    expect(lessonStrings({ title: '本周刚加上的标题' }), '`lessonStrings` still leaves the title out').toEqual([])
    expect(readerText({ title: '本周刚加上的标题' } as Lesson), 'but `readerTexts` reaches it').toEqual(['本周刚加上的标题'])
    for (const l of LESSONS) {
      const all = readerText(l)
      expect(all, `${l.id}: readerTexts reaches the title`).toContain(l.title)
      for (const j of l.jumps) expect(all, `${l.id}: readerTexts reaches jump 「${j.label}」`).toContain(j.label)
      for (const row of l.implementation!) expect(all, `${l.id}: readerTexts reaches ② 「${row.topic}」`).toContain(row.sim)
    }
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
    expect(nba.variants![3].label).toBe('每次只与一个锚点测距')
    expect(text).toContain('本课自己只用第四项「每次只与一个锚点测距」')
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
 * EXCLUDES on purpose.
 *
 * **Those three figures are criterion P at `cdf6396` (2026-10-05), and they are a reading rather
 * than a law.** They were reproduced at that commit on 2026-10-11, arm by arm, except that its
 * `deeper` 81 needs a wider ruler than the criterion names (78 by the prose walk — see the
 * ratchet's docblock below and §3.4 of the design document). The quantity is measured in this
 * repository now, by `criterionP` in `tests/course/coverageNumbers.ts`, and §17 of
 * `docs/wifi-feature-coverage.md` states today's three sides beside the criterion-Q ones. The
 * sentence this paragraph rests on — `limits` alone outweighing the two excluded fields together —
 * holds today as well: 291 against 190 + 82. It is stated and compared there, not asserted here.
 *
 * The honest question is not "is this string graded" but
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
   *
   * **21 on 2026-11-11** (floor 25 → 18). The standard-first restructure gave every
   * lesson its own ① and ② sections, which name and bracket more of the terms its
   * labels use, so fewer labels lean on a prerequisite alone. Re-measured, not
   * widened to fit: the closure still carries 21 sites that would go red without it.
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
      .toBeGreaterThanOrEqual(18)
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
 * **The `limits` debt ratchet, retired 2026-11-11.**
 *
 * From 2026-10-05 this place held a ratchet: official terms named in a lesson's `limits[].text`
 * and never on its own graded main path, as (lesson, term) pairs, with a ceiling a human owned
 * (`LIMITS_DEBT_CEILING`, 296 at filing, 169 on 2026-11-10), and a second `it` asserting that
 * `limits` carried more of this debt than `sources` and than `deeper`, each on its own. The
 * reason was that `limits` was rendered open on the main path, written at the density of
 * collapsed depth, and timed at zero.
 *
 * The standard-first restructure (UWB 2026-11-10, Wi-Fi/AMP 2026-11-11) removed `limits` and
 * `deeper` from every lesson. The ratchet then measured 0 against 169, its anti-vacuity floors
 * (debt ≥ 120, ≥ 30 lessons) were red, and the comparison with `sources` and `deeper` compared a
 * field that exists with two that do not. Lowering the floors to zero would have left green
 * checks over empty fields, so the ratchet and its comparison are deleted (with
 * `tests/course/coverageNumbers.test.ts` and the instruments in `./coverageNumbers`); `git log -p`
 * on this file has their full history.
 *
 * What replaces them pins why the debt cannot come back in another form: the content `limits`
 * held now lives in ② `implementation`, which IS on the graded main path — so the bracket rule
 * reads it like any other main-path prose — and IS timed by `lessonMinutes`. The `it`s below
 * assert both, on every lesson; tests/course/limits.test.ts pins `limits` itself empty.
 */
describe('readability · what `limits` held is graded and timed now (the ratchet, retired 2026-11-11)', () => {
  it.each(ordered.map((l) => [l.id, l] as const))('%s: every ② row is on the graded main path and the timed main path', (_id, l) => {
    const graded = gradedProseTexts(l)
    const main = mainPathTexts(l)
    for (const row of l.implementation!) {
      expect(graded, `${l.id}: ② 「${row.topic}」 is not graded by the bracket rule`).toContain(row.sim)
      expect(main, `${l.id}: ② 「${row.topic}」 is not timed by lessonMinutes`).toContain(row.sim)
    }
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
 * makes the estimate less accurate rather than more. The real omission was
 * `limits` — 48 115 characters, a quarter of the main path, open by default,
 * timed at zero. It closed on 2026-11-11 without a slice of its own: the
 * standard-first restructure moved that content into `implementation`, which is
 * timed, and retired `limits` (see the `describe` above).
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
   * The length limit became a soft guideline on 2026-11-10 (user: "remove the course length
   * limit, make it softer instead"). What used to stand here — a hard 30-minute ceiling, the
   * pinned course total, the bucket-margin census and the CAUTION notes it demanded in lesson
   * files — is gone. What is left is the guideline's own behaviour: a lesson past one sitting
   * is marked long, and nothing refuses it.
   */
  it('marks a lesson long exactly when its estimate is past one sitting', () => {
    for (const l of ordered) expect(isLongLesson(l), l.id).toBe(lessonMinutes(l) > SITTING_MINUTES)
    const padded = { ...ordered[0], why: '字'.repeat(CHARS_PER_MINUTE * (SITTING_MINUTES + 5)) }
    expect(isLongLesson(padded), 'a lesson far past one sitting is marked, not refused').toBe(true)
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
    // 90 → 91 on 2026-10-11, and the module count did NOT move with it either — for a third
    // reason again: `uwb-ancillary-loss` is not a new subject but the second half of
    // `uwb-ancillary`, split along the seam its own `outcomes` already drew 2 + 2
    // (docs/superpowers/specs/2026-10-11-no-room-design.md §2.1). M24 already held two lessons,
    // so the index migration cost was 0 files and 0 sites here as well.
    expect(ordered.length, 'lessons in COURSE_ORDER with authored prose behind them').toBe(91)
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

})
