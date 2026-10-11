/**
 * **The instrument, not the course.**
 *
 * `tests/course/coverageNumbers.ts` is where the figures §17 of `docs/wifi-feature-coverage.md`
 * states are MEASURED, and every other test in the programme compares a written number against
 * what it returns. Nothing compared its own arithmetic against anything, and one piece of that
 * arithmetic is provably inert on today's corpus: criterion P subtracts each lesson's baseline
 * (the bracket rule's failures on its graded main path alone) and that baseline is zero on all 91
 * lessons, so deleting the subtraction would change no figure a reader sees.
 *
 * `docs/inert-config-contract.md` says such a thing is refused or pinned. It is refused — 「the
 * failures the rule would NEWLY emit」 is criterion P's definition, and a corpus with a non-zero
 * baseline is one bad lesson away — so this file pins it, and what it feeds the instrument is a
 * SYNTHETIC lesson whose main path already fails. The real course cannot supply one: that is the
 * whole reason the subtraction looks inert.
 *
 * The assertion deliberately NOT written here is 「the baseline is zero」. It can only redden on a
 * day `tests/course/readability.test.ts` is already red, which makes it decoration rather than a
 * ruler — the defect class this programme keeps removing.
 */
import { describe, it, expect } from 'vitest'
import type { Lesson } from '../../src/course/lessonKit'
import {
  armsTotal, criterionP, failuresOn, gradedWalkFailures, leadOf, limitsOf, SIDE_TEXT,
} from './coverageNumbers'
import { zhMainText } from './corpus'

/**
 * A lesson that exists only to be measured: a one-sentence main path (`why` is the first section
 * of the graded walk) and whichever of the three sides the case needs.
 *
 * `module: 8` is a real Wi-Fi module, because `zhTermsFor` asks `trackOf` which glossary rows this
 * lesson is graded on and that answer comes from the module. Everything else the lesson contract
 * wants is absent on purpose: this object is never run, rendered or graded for shape — it is an
 * input to two pure functions.
 */
const synth = (why: string, side: Partial<Lesson> = {}): Lesson => ({
  id: 'synthetic', module: 8, why, limits: [], ...side,
} as unknown as Lesson)

/** `limits` holding one line of text, the shape {@link limitsOf} joins. */
const asLimits = (text: string): Partial<Lesson> =>
  ({ limits: [{ kind: 'model-value', text }] } as unknown as Partial<Lesson>)

/** What criterion P would say if it did NOT subtract: the rule over main path ＋ field, flat. */
const unsubtracted = (l: Lesson, get: (x: Lesson) => string): ReturnType<typeof failuresOn> =>
  failuresOn(l, `${zhMainText(l)} ${get(l)}`)

describe('coverageNumbers · criterion P really subtracts, measured on the instrument itself', () => {
  /**
   * 符号 (symbol) is a glossary row with no `aka`, so it moves the bracket arm and only that arm.
   * The two lessons differ in ONE thing — whether the main path already used the word bare — and
   * the `limits` line handed to the instrument is the same string in both.
   */
  const LIMIT = '这一处的解释里出现了符号。'
  const clean = synth('这一课讲一件与术语表无关的事，句子里不出现那个词。', asLimits(LIMIT))
  const owing = synth('这一课的主路径自己就裸用了符号，所以它本来就报错。', asLimits(LIMIT))

  it('the bracket arm: one `limits` string, 1 on a clean main path and 0 on an owing one', () => {
    // The baselines are the premise, so they are stated rather than assumed: this is the lesson
    // the real corpus cannot supply.
    expect(gradedWalkFailures([clean]).bracket, 'the clean lesson must have a zero baseline').toBe(0)
    expect(gradedWalkFailures([owing]).bracket, 'the owing lesson must already fail').toBe(1)

    expect(criterionP([clean]).limits.bracket, 'a term the main path never names is NEWLY emitted')
      .toBe(1)
    expect(criterionP([owing]).limits.bracket, 'the same `limits` text on a main path that already'
      + ' fails on that term emits nothing NEW — if this reads 1, the subtraction is gone').toBe(0)

    // And the subtraction is the only thing that separates them: without it both read 1.
    expect(unsubtracted(clean, SIDE_TEXT.limits).bracket).toBe(1)
    expect(unsubtracted(owing, SIDE_TEXT.limits).bracket).toBe(1)
  })

  /**
   * 噪声地板 (noise floor) carries two forbidden renderings — 底噪 and 器声地板 — and
   * `zhAkaViolations` returns one entry per rendering it finds. So a main path using one of them
   * and a `limits` using the OTHER is the case where the subtraction has to produce a non-zero
   * answer that is still not the flat total: baseline 1, flat 2, P 1.
   */
  it('the aka arm: baseline 1, flat total 2, and P is 1 — not 2 and not 0', () => {
    const l = synth('这一课的主路径写了底噪，一次。', asLimits('这一处写的是器声地板。'))
    expect(gradedWalkFailures([l]).aka, 'the main path owes one aka violation').toBe(1)
    expect(unsubtracted(l, SIDE_TEXT.limits).aka, 'both renderings are present once `limits` joins')
      .toBe(2)
    expect(criterionP([l]).limits.aka, 'one violation is NEW; the other was already there').toBe(1)
    // The arms are added in exactly one place, and that is the number §17 states as a total.
    expect(armsTotal(criterionP([l]).limits)).toBe(1)
    expect(armsTotal({ bracket: 286, aka: 5 })).toBe(291)
  })

  /**
   * One `side` helper serves all three fields today, so this is a guard on a future refactor
   * rather than on three separate code paths: a subtraction dropped from one branch is the exact
   * mistake that would otherwise show up as 「one column of §17 drifted」 months later.
   */
  it('all three sides subtract, not just the ratcheted one', () => {
    const owed = '这一处的解释里出现了符号。'
    const cases: [string, Partial<Lesson>][] = [
      ['limits', asLimits(owed)],
      ['sources', { sources: [owed] }],
      ['deeper', { deeper: [{ heading: '一段深度', text: owed }] } as unknown as Partial<Lesson>],
    ]
    for (const [side, field] of cases) {
      const c = synth('这一课讲一件与术语表无关的事，句子里不出现那个词。', field)
      const o = synth('这一课的主路径自己就裸用了符号，所以它本来就报错。', field)
      expect(criterionP([c])[side as 'limits'].bracket, `${side}: newly emitted on a clean lesson`)
        .toBe(1)
      expect(criterionP([o])[side as 'limits'].bracket, `${side}: nothing new on an owing lesson`)
        .toBe(0)
      // the field really is what carried it — an empty one scores nothing either way
      expect(criterionP([synth('这一课讲一件与术语表无关的事。')])[side as 'limits'].bracket)
        .toBe(0)
    }
  })

  /**
   * `leadOf` is the other function §17 reads through — the direction of the sum comparison, in
   * words, because a bare margin that can go negative while staying equal to the measurement is
   * the defect that got it moved here. Its docblock says `by` is a magnitude and `leader` carries
   * the sign; a sign convention nothing checks is a sign convention somebody gets backwards.
   */
  it('leadOf has exactly three forms and never a negative magnitude', () => {
    expect(leadOf(5, 3)).toEqual({ leader: 'limits', by: 2 })
    expect(leadOf(3, 5)).toEqual({ leader: 'sum', by: 2 })
    expect(leadOf(4, 4)).toEqual({ leader: 'tie', by: 0 })
    for (const [a, b] of [[0, 9], [9, 0], [7, 7], [1, 2]]) {
      expect(leadOf(a, b).by, `leadOf(${a}, ${b}) must not report a negative magnitude`)
        .toBeGreaterThanOrEqual(0)
    }
  })
})

describe('coverageNumbers · limitsOf is what a reader is shown, joined', () => {
  it('reads every `limits` line, in order, and nothing else of the lesson', () => {
    const l = synth('主路径。', { limits: [
      { kind: 'model-value', text: '第一条。' }, { kind: 'threshold', text: '第二条。' },
    ] } as unknown as Partial<Lesson>)
    expect(limitsOf(l)).toBe('第一条。 第二条。')
  })
})
