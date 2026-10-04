/**
 * The course's wording contract, enforced: `docs/course-wording-contract.md`.
 *
 * The reader found lesson 26's table naming its mechanisms 「捕获把输家救了回来」
 * and 「聋掉的迟到起跑」, and said those words were meant to help understanding
 * but confused the concept instead. Their ruling was plain professional Chinese
 * throughout, with analogy allowed only inside a sentence that marks itself as
 * one, and never in a title or a term position.
 *
 * This file exists so the ruling cannot be undone by the next edit. The repo
 * already had one assertion of this shape — `limits.test.ts` forbids the
 * sentence 「本仿真器有简化」 — and this is the same idea over a word list.
 *
 * Two design points, both of them lessons from the sweep that produced it:
 *
 *  - **It reads lesson OBJECTS, not source files.** `readability-rules.test.ts`
 *    and `diagram.test.ts` hold synthetic fixtures that use banned words as test
 *    data, and English design comments quote the old prose they replaced. Neither
 *    is text a reader sees, and scanning objects excludes both without a
 *    whitelist.
 *  - **Every ban carries its legitimate superstrings.** A bare substring check
 *    bans 时钟 along with 钟上, and 查表命中 along with 命中 — both correct
 *    Chinese. During the sweep one worker rewrote a perfectly good sentence to
 *    dodge exactly that, which is the test bullying the prose instead of serving
 *    it.
 */
import { describe, it, expect } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { readerTexts } from '../../src/course/readability'
import type { Lesson } from '../../src/course/lessonKit'

/**
 * Everything in a lesson a reader can see: `readerTexts`, the one walk
 * (src/course/readability.ts).
 *
 * This used to be a hand-rolled list — `lessonStrings`, plus `title`, plus
 * `limits[].text`, plus the jump labels, plus the variant labels, appended here
 * because `lessonStrings` reaches none of those four. WHY the four were added by
 * hand is worth keeping, because it is this rule's own evidence that it catches
 * things: the sweep found real offenders in three of them — 底噪 hid in a
 * `limits` entry, 「两个标签挤进同一时隙」 in a jump label, and three titles named
 * no mechanism at all. A reader meets all of them.
 *
 * What changed on 2026-10-05 is that the four are no longer a list anybody has to
 * remember. `readerTexts` walks the lesson OBJECT and excludes by key, so the
 * twentieth field of the contract is in this net the moment it is added, and a
 * field nobody has classified throws rather than passing unseen. Feeding this
 * rule everything is safe, and that was measured rather than assumed: the 86
 * banned words below, run over an unconditional walk of the whole object — ids,
 * `needs`, discriminants, figure coordinates, 11 735 strings — hit nothing. A
 * substring ban is unordered and context-free, so more text can only make it
 * louder, never wrong.
 */
function readerText(l: Lesson): string[] {
  return readerTexts(l)
}

/**
 * A banned word, and the longer words that legitimately contain it.
 *
 * `allow` is not an escape hatch for prose that wants the banned sense — it is
 * for different words that happen to share characters. Each entry says which.
 */
interface Ban {
  bad: string
  allow?: readonly string[]
  why?: string
}

/** Figurative images standing in for mechanisms — contract §2. */
const IMAGES: readonly Ban[] = [
  { bad: '聋' },
  { bad: '输家' },
  { bad: '赢家' },
  { bad: '救回' },
  { bad: '救了' },
  { bad: '门口' },
  { bad: '钟上', allow: ['时钟上'], why: '真实设备「跑在自己偏差的时钟上」is correct Chinese' },
  { bad: '老死' },
  { bad: '耳朵' },
  { bad: '偷' },
  { bad: '发言权' },
  { bad: '崩掉' },
  { bad: '撑得住' },
  { bad: '撑不住' },
  { bad: '白花' },
  { bad: '白送' },
  { bad: '白费' },
  { bad: '烧掉' },
  { bad: '低声细语' },
  { bad: '嗓门' },
  { bad: '大声' },
  { bad: '一团糊' },
  { bad: '撞车' },
  { bad: '起跑', allow: ['一起跑'], why: '「把两条链路一起跑起来」is 一起 + 跑, not 起跑' },
  { bad: '裸奔' },
  { bad: '可乘之机' },
  { bad: '报废' },
  { bad: '赌注' },
  { bad: '帽子' },
  { bad: '盖子' },
  { bad: '节拍' },
  { bad: '干坐着' },
  { bad: '挤进' },
  { bad: '挤成' },
  { bad: '挤过去' },
]

/** Commerce, contests and social manners standing in for mechanisms — §2.1/§2.2. */
const REGISTER: readonly Ban[] = [
  { bad: '买单' },
  { bad: '账单' },
  { bad: '买卖' },
  { bad: '买到' },
  { bad: '买下' },
  { bad: '买得起' },
  { bad: '买回来' },
  { bad: '账' },
  { bad: '价钱' },
  { bad: '标价' },
  { bad: '定价' },
  { bad: '票价' },
  { bad: '一口价' },
  { bad: '值钱' },
  { bad: '省钱' },
  { bad: '更贵' },
  { bad: '参赛' },
  { bad: '嫌疑人' },
  { bad: '怪罪' },
  { bad: '无辜' },
  { bad: '占便宜' },
  { bad: '摸到空口' },
  { bad: '熬' },
  { bad: '起价' },
  { bad: '难看' },
  { bad: '难堪' },
  { bad: '老老实实' },
  { bad: '家伙' },
  { bad: '活儿' },
  { bad: '片子' },
  { bad: '驮' },
  { bad: '独苗' },
  { bad: '解脱' },
  { bad: '认命' },
  { bad: '兑现' },
  { bad: '指挥' },
  { bad: '定死' },
  { bad: '闭嘴' },
  { bad: '出声' },
  { bad: '说了算' },
  { bad: '吃亏' },
  { bad: '乖' },
  { bad: '笨' },
  { bad: '聪明' },
  { bad: '失手' },
  { bad: '辩过去' },
  { bad: '命中', allow: ['查表命中'], why: 'a table/cache hit is the ordinary term' },
  { bad: '回执' },
  {
    bad: '惩罚',
    // The one legitimate use in the course: a quiz DISTRACTOR that names the misconception
    // ("the window doubles to punish stations that collided"), which the right answer then
    // corrects. Banning it there would delete the teaching, not the figure of speech.
    allow: ['为了惩罚发生过碰撞的站点'],
    why: '§2 of the contract replaces 惩罚（指 EIFS）with 这段更长的等待: EIFS is not a penalty, '
      + 'it is the time a station that locked onto something it could not decode has to wait '
      + 'before it may contend. The rule was written into the contract and never into this '
      + 'test, so four sentences carried it for weeks — three in tier 1 and one in Guide.tsx',
  },
  {
    bad: '底噪',
    allow: ['本底噪声'],
    why: '本底噪声 is the ordinary term for an instrument\'s or a band\'s background noise '
      + '(uwb-nba-coexist, on what the LBT energy detect cannot hear), not the banned '
      + 'colloquial alias of 噪声地板 that §2.1 rules out — and `ZH_TERMS` bans only 底噪 itself',
  },
  { bad: '压根', why: 'a misspelling of 根本' },
]

const BANS: readonly Ban[] = [...IMAGES, ...REGISTER]

/** Occurrences of `b.bad` that are not inside one of its allowed longer words. */
function offences(text: string, b: Ban): number {
  let n = 0
  for (let i = text.indexOf(b.bad); i >= 0; i = text.indexOf(b.bad, i + 1)) {
    const excused = (b.allow ?? []).some((w) => {
      const at = w.indexOf(b.bad)
      return at >= 0 && text.slice(i - at, i - at + w.length) === w
    })
    if (!excused) n++
  }
  return n
}

/** Which bans a lesson still breaks. */
function broken(id: string): string[] {
  const l = LESSONS.find((x) => x.id === id)!
  return BANS.filter((b) => readerText(l).some((t) => offences(t, b) > 0)).map((b) => b.bad)
}

describe('course wording · no figure of speech where a mechanism belongs', () => {
  // Every lesson, with no exception list. `NOT_YET` — the UWB track, which the
  // reader asked for after Wi-Fi — is gone with the sweep that emptied it.
  const swept = LESSONS.map((l) => l.id)

  // Parametrised by id, not by the lesson object: `it.each` prints every argument
  // into the test name, and a whole `Lesson` makes a failure unreadable — which
  // defeats the point of a test meant to tell someone what to fix.
  it.each(swept)('%s uses no figure of speech where a mechanism belongs', (id) => {
    expect(broken(id), `${id} still says: ${broken(id).join('、')}`).toEqual([])
  })

  // What the self-checking `NOT_YET` assertion was really for, kept now that the
  // list is gone: this rule must grade the whole course, not a shrinking subset.
  // Three rules in this suite have reported success while grading nothing, and an
  // exception list deleted without a floor under it is exactly how a fourth would.
  it('grades every lesson in the course', () => {
    expect(swept.sort()).toEqual(LESSONS.map((l) => l.id).sort())
    // 75 when the UWB sweep landed: 44 Wi-Fi, 27 UWB, 4 AMP. A floor rather than
    // an equality, so adding a lesson does not fail this and removing the whole
    // track does.
    expect(swept.length).toBeGreaterThanOrEqual(75)
  })
})

describe('course wording · 捕获 names which of its three senses it means', () => {
  /**
   * `捕获` survives the sweep because it is correct engineering Chinese — but
   * writing this test turned up something worse than any metaphor: **the word
   * means two different mechanisms in the two tracks of this one course.**
   *
   *  - Wi-Fi: 捕获效应, the *capture effect* — a receiver abandoning the preamble
   *    it locked onto for one at least 5 dB stronger (`engine/channel.ts`'s
   *    `canCapture`).
   *  - UWB: 捕获, *acquisition* — the receiver finding the packet at all and
   *    taking its timebase from it. `uwb-uwbd` glosses it in exactly those words
   *    and `uwb-acquisition` is a whole lesson about it.
   *
   * The UWB sweep found a third reading, and it matters here: `uwb/channel.ts`
   * resolves two overlapping UWB receptions by LEVEL (`UWB_CAPTURE_DB`, 6 dB) and
   * not by which preamble was locked onto first, so `uwb-contention`'s and
   * `uwb-sensing`'s 捕获 is the capture effect without the Wi-Fi rule's
   * order-dependence. Both lessons therefore say "到达电平明显高于" rather than
   * repeating the 5 dB re-sync wording, which would be false about this engine.
   *
   * Both are the field's own Chinese, so neither is wrong and neither gets
   * renamed. What a reader cannot survive is meeting the second sense with no
   * warning after learning the first. So each lesson that uses the word has to
   * name which one it means, in English, somewhere in its text.
   *
   * **Not "at its first use".** That was the first draft, and it was wrong:
   * `lessonStrings`' walk order is not reading order, and a lesson that
   * introduces the term properly in `limits` — as `collisions-cw` does — failed
   * a first-use rule while being perfectly clear. Policing order needs real
   * reading order; policing presence needs only the text.
   *
   * It cannot be enforced through `ZH_TERMS`: `readability.ts` lists 捕获 and
   * 捕获效应 in `ZH_TERMS_EXCLUDED` — receiver behaviour no standard defines —
   * and a test asserts the two lists stay disjoint.
   */
  const SENSES = ['capture effect', 'acquisition'] as const
  const users = LESSONS.filter((l) => readerText(l).some((t) => t.includes('捕获')))

  it('some lesson uses it, or this rule is guarding nothing', () => {
    expect(users.length).toBeGreaterThan(0)
  })

  it.each(users.map((l) => l.id))('%s says which sense of 捕获 it means', (id) => {
    const texts = readerText(LESSONS.find((x) => x.id === id)!)
    expect(
      SENSES.some((en) => texts.some((t) => t.includes(en))),
      `${id} uses 捕获 without ever naming capture effect or acquisition`,
    ).toBe(true)
  })
})
