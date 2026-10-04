/**
 * Every lesson says where its model is not the radio.
 *
 * A survey on 2026-09-26 found 5 of 68 lesson files declaring anything at all,
 * under seven different ad-hoc headings. A simulator that never says what it
 * left out teaches a reader to trust it further than it deserves — and this
 * course's whole discipline is that a stated number matches the simulated one,
 * which is worth nothing if the reader cannot tell which numbers are modelled.
 *
 * The rollout is over: `limits` is required in the type, every graded lesson
 * carries at least one, and the `NOT_YET` ledger that tracked the work owed is
 * gone because nothing is owed. One exception remains, and it announces itself.
 *
 * It used to be the whole paused AMP track, all four lessons declaring
 * `limits: []`. `amp-slots` and `amp-coexist` were migrated to the new shape
 * 2026-10-02 along with the rest of the readability programme's last coverage
 * hole, and each now carries real, engine-checked limits like any other
 * lesson — AMP is still a paused feature, but a paused feature's lesson TEXT is
 * live, and leaving its limits empty was never required by the pause, only by
 * the migration not having reached it yet. `amp-intro` and `amp-ppdu` are what
 * is left, and the expectation below names exactly them, so finishing their
 * migration (or resuming AMP itself) fails this file rather than quietly
 * widening the rule.
 */
import { describe, expect, it } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { COURSE_ORDER } from '../../src/course/curriculum'
import type { Lesson, LimitKind } from '../../src/course/lessonKit'

const KINDS: LimitKind[] = ['threshold', 'unmodelled', 'model-value', 'out-of-scope']

/** The two AMP lessons not yet migrated to the new shape are not held to this yet. */
const PAUSED_AMP = ['amp-intro', 'amp-ppdu']
const graded = (l: Lesson): boolean => !PAUSED_AMP.includes(l.id)

const done = LESSONS.filter(graded)

describe('the one exception is honest about itself', () => {
  it('excludes exactly these two AMP lessons, and they are the only ones with no limits', () => {
    const excluded = LESSONS.filter((l) => !graded(l)).map((l) => l.id).sort()
    expect(excluded).toEqual([...PAUSED_AMP].sort())
    const empty = LESSONS.filter((l) => l.limits.length === 0).map((l) => l.id).sort()
    expect(empty, 'a lesson declares no limits').toEqual([...PAUSED_AMP].sort())
  })

  it('has something to check, so the rules below are not vacuous', () => {
    expect(done.length).toBeGreaterThan(0)
  })
})

describe('every graded lesson declares its limits properly', () => {
  it.each(done)('$id names at least one', (l) => {
    expect(l.limits.length).toBeGreaterThan(0)
  })

  it.each(done)('$id uses only the four kinds', (l) => {
    for (const lim of l.limits) {
      expect(KINDS, `${l.id}: ${lim.kind}`).toContain(lim.kind)
    }
  })

  it.each(done)('$id says something in each one', (l) => {
    for (const lim of l.limits) {
      // Long enough to have named what was given up rather than that something was.
      expect(lim.text.length, `${l.id} / ${lim.kind}: "${lim.text}"`).toBeGreaterThan(16)
    }
  })

  it.each(done)('$id does not repeat a kind with the same words', (l) => {
    const seen = l.limits.map((x) => `${x.kind}:${x.text}`)
    expect(new Set(seen).size, l.id).toBe(seen.length)
  })
})

describe('a limit that promises the truth later names a lesson that delivers it', () => {
  const ids = new Set(LESSONS.map((l) => l.id))

  it('every `until` points at a real lesson', () => {
    const bad: string[] = []
    for (const l of LESSONS) {
      for (const lim of l.limits) {
        if (lim.until && !ids.has(lim.until)) bad.push(`${l.id} → ${lim.until}`)
      }
    }
    expect(bad, `dangling until: ${bad.join(', ')}`).toEqual([])
  })

  it('never points at itself', () => {
    const bad = LESSONS.filter((l) => l.limits.some((x) => x.until === l.id)).map((l) => l.id)
    expect(bad).toEqual([])
  })

  /**
   * **Criterion A — `until` is only ever legal on an `out-of-scope` limit.**
   *
   * `until` renders as 「（这一条在《…》里会被解除）」(`ui/i18n.ts`'s `limitUntil`) and
   * its own doc comment says *the lesson that lifts this simplification*. Both are a
   * promise in the future tense, and until 2026-10-05 nothing checked it: the two tests
   * above ask only that the named lesson EXISTS and is not this one.
   *
   * The check does not need a new field, because the discriminator was already on the
   * limit. `LimitKind` has four values and they are not the same kind of thing:
   * `threshold`, `unmodelled` and `model-value` describe the ENGINE (a hard line instead
   * of a curve, an effect not modelled, a constant this simulator picked), while
   * `out-of-scope` describes a class of SCENARIO. **Every lesson runs the same engine.**
   * A lesson owns its `scenario()` and its `variants`; it does not own whether `rate.ts`
   * sends probe frames or whether `fading.ts` correlates neighbouring bins. So an `until`
   * on one of the other three kinds is not "a promise that might go unmet" — it is one
   * that CANNOT be met. Either the promise is false or the `kind` is, and both are bugs.
   *
   * Measured before it was written: on the course as of 2026-10-05 this picked out 5 of
   * the 10 sites with no false positives. Three were promises that genuinely went unmet
   * (`anomaly`'s two pointing at `rate-vs-model`, whose own `limits[0]`/`limits[1]`
   * restate them, and the engine-level half of `mcs-ladder`'s); two were promises that
   * were KEPT while the `kind` was wrong (`anomaly`'s TXOP entry and `width`'s flat
   * channel — the engine does build TXOP, aggregation and per-bin fading, all of them
   * behind a scenario switch). The first three became `seeAlso`; the other two had their
   * `kind` corrected.
   *
   * **A is necessary, not sufficient, and the next author must not read more into it.**
   * It cannot catch an `out-of-scope` limit pointing at a lesson that does not in fact
   * open that class of scenario. Criterion B below is for exactly that gap, and what B
   * checks is whether a HUMAN has judged it — not whether they judged it right.
   *
   * **And A has one known edge, so that a future red here is read correctly.** The
   * derivation says a `model-value` cannot be lifted because the value lives in the
   * engine — but *some* model values are **scenario fields** (`fading`'s Rician K, a
   * node's own ppm figure), and a limit about one of those genuinely *could* be lifted
   * by a lesson that sets it differently. Zero such sites exist today (2026-10-05: the
   * only `model-value` that ever carried an `until` was the two-counter rate control,
   * which is hard-coded in `rate.ts`). **So if this test ever goes red on a
   * `model-value` whose value is a scenario field, the criterion is what needs
   * widening — not necessarily the limit.** Say which in the commit message either way.
   */
  it('`until` only ever sits on an out-of-scope limit', () => {
    const bad: string[] = []
    for (const l of LESSONS) {
      for (const lim of l.limits) {
        if (lim.until && lim.kind !== 'out-of-scope') bad.push(`${l.id} / ${lim.kind} → ${lim.until}`)
      }
    }
    expect(
      bad,
      `an \`until\` on an engine-level kind can never be lifted, because every lesson runs the `
      + `same engine; use \`seeAlso\`, or fix the \`kind\`: ${bad.join('; ')}`,
    ).toEqual([])
  })
})

/**
 * `seeAlso`: the other promise, and the weaker one — that lesson goes DEEPER into this
 * limit without lifting it. Added 2026-10-05 together with criterion A, because the
 * three sites A disqualified had real navigation value that deleting the `until` would
 * have thrown away (`rate-vs-model` is a whole lesson of the two-counter controller
 * cutting a paper prediction to a fifth), and the honest field for that is not a softer
 * wording of `until`.
 *
 * It holds an id and never a sentence. That is load-bearing: `tests/course/wording.test.ts`
 * and `tests/course/readability.test.ts` reach limit prose by NAMING the field
 * (`...l.limits.map((x) => x.text)`) rather than by walking the object, so prose in a new
 * field would pass under both banned-word lists unseen.
 */
describe('a limit that points at a deeper treatment says so as a deeper treatment', () => {
  const ids = new Set(LESSONS.map((l) => l.id))

  it('every `seeAlso` points at a real lesson', () => {
    const bad: string[] = []
    for (const l of LESSONS) {
      for (const lim of l.limits) {
        if (lim.seeAlso && !ids.has(lim.seeAlso)) bad.push(`${l.id} → ${lim.seeAlso}`)
      }
    }
    expect(bad, `dangling seeAlso: ${bad.join(', ')}`).toEqual([])
  })

  it('never points at itself', () => {
    const bad = LESSONS.filter((l) => l.limits.some((x) => x.seeAlso === l.id)).map((l) => l.id)
    expect(bad).toEqual([])
  })

  it('is never on the same limit as an `until`', () => {
    // The two sentences contradict each other — 「会被解除」and 「但不解除它」— and the panel
    // renders both branches rather than preferring one, deliberately: the rule lives here.
    const bad: string[] = []
    for (const l of LESSONS) {
      for (const lim of l.limits) if (lim.until && lim.seeAlso) bad.push(`${l.id} / ${lim.kind}`)
    }
    expect(bad, `one limit claiming both lifted and not lifted: ${bad.join(', ')}`).toEqual([])
  })
})

/**
 * **Criterion B — the site list is frozen, because "is it really lifted" is not
 * mechanically decidable and that is a reason to pin the human judgement, not to drop it.**
 *
 * Three mechanical criteria were measured on the 2026-10-05 course before this one was
 * written, and two of them died:
 *
 *  - "the target's own `limits` must not restate the source's in other words" — proxied by
 *    longest common substring. Both ends wrong: the WORST site (`anomaly`'s
 *    collision-vs-fade, a verbatim restatement in meaning) scored 5 characters, while the
 *    most honest lift in the course (`width` → `selectivity`) scored 24 — and those 24 are
 *    a code identifier (`channel.ts 的 resolveLock`) that both lessons are RIGHT to cite.
 *    Restatement is a semantic event, not a string event.
 *  - "the target must have a scenario that turns on what the source says is missing" —
 *    the one that sounded hardest measured softest. Seven promises, six different axes
 *    (see the fourth column below), and `Scenario` has no field saying which knob a given
 *    limit is about. The one axis expressible in a line, the difference in negotiated
 *    feature flags, is a FALSE POSITIVE on `width` → `selectivity` (identical `feats`,
 *    the difference is two top-level sections) and FALSELY GREEN on `streams` → `mumimo`
 *    (the flags that differ are `ampdu`/`txop`/`ofdma`, which that limit never mentions —
 *    it is about there being one station). On the two UWB sites it is blind.
 *
 * So B does not judge the truth of a promise. **It judges whether anyone judged it.** The
 * table is the whole promise ledger; a fourteenth `until` turns this red and its author has
 * to write the fourth column down and leave a ruler in their own lesson's test file
 * (precedents: `width.test.ts`, `uwb-blocks.test.ts`, and as of 2026-10-05 also
 * `anomaly.test.ts`, `backoff.test.ts`, `streams.test.ts`, `mcs-ladder.test.ts`, and as of
 * the `fading` lesson also `fading.test.ts`, whose own header states its gate before measuring it).
 *
 * The census is taken off `LESSONS`, never off the file text. A `kind: 'formula'` block in
 * a lesson's `numbers` is character-for-character the shape of a `Limit`, so a regex sweep
 * of `src/course` counts one entry that is not a limit at all.
 */
describe('criterion B · the thirteen `until` promises are a frozen ledger', () => {
  /** `[source, target, a substring of the limit's own text, the axis that opens it]`. */
  const UNTIL_SITES: readonly [string, string, string, string][] = [
    ['mcs-ladder', 'rate-vs-model', '本课四个变体一次失败也没有',
      '失败数 0 → 那一课的场景真的丢帧（五台站点在一米圆上，重传数等于重叠数），于是查表之下那一层损失反馈看得见了'],
    ['ifs', 'edca', 'AIFS[AC]',
      '业务档位：本课两台都跑 saturated 的单一 DIFS → edca 的四台各带一类业务，四条队列各等一份不同长度的 AIFS'],
    ['backoff', 'txop', '一次成功只换来一帧',
      '节点世代：两台站点 nonht（GEN_FEATURES.nonht 是空集）→ txop 的两台 vht，于是 edca/ampdu/txop 三个标志都协商上'],
    ['anomaly', 'txop', '没有发送机会（TXOP），也不聚合',
      '同一个轴：两台站点 nonht → txop 的两台 vht。引擎一直建着 TXOP 与聚合，缺的是本场景的站点用不上它们'],
    ['width', 'selectivity', '本课这四档的信道是平的',
      '顶层两节：selectivityScenario 就是 widthScenario 外加 fading 与 selectivity（节点的 feats 两课完全相同，所以这个轴不在节点上）'],
    ['streams', 'mumimo', '只有一台站点',
      '站点数 1 → 4。源课那条限制的主语就是「只有一台站点」，而换掉的正是它，不是任何一个特性标志'],
    ['uwb-intro', 'uwb-sstwr', '两端的晶振都钉在 0 ppm',
      '逐节点的 ppm 实参 0 → ±10，于是单边测距的偏差以米计（那一课真的给出 6.01 m）'],
    ['uwb-blocks', 'uwb-contention', '「点名要先有名单」',
      '会话旋钮：竞争窗口与名单。那一课讲的正是手里根本没有名单的标签'],
    // The five `fading` sites, added 2026-10-05 with that lesson. One axis for all five, and it
    // is a top-level scenario section rather than anything on a node: `fadingScenario` is
    // `widthScenario(20, 1)` with the station in the far living room and a `fading` section, and
    // the five sources are the five lessons whose text says in so many words that their own
    // scene did not write that section. Two of them (`radio-primer`, `bianchi`) had to have
    // their `kind` corrected from `unmodelled` to `out-of-scope` first — the engine has built
    // both fading layers since the selectivity slice, so what those two limits really named was
    // their own scene, which is criterion A's second precedent (`width`'s flat channel), not its
    // first. The five lessons are measured to sit earlier in `COURSE_ORDER` than `fading`
    // (radio-primer 0, mcs-ladder 3, bianchi 21, rate-vs-model 23, rate-fallback 36 → fading 38).
    ['radio-primer', 'fading', '本课的场景没有打开',
      '顶层一节：fadingScenario 的瑞利与莱斯两个变体写了 fading 一节，于是 RX_START 这一行真的印出 shadow 与 fast 两个数，而本课的四个变体里这两个字段根本不出现'],
    ['mcs-ladder', 'fading', '让同一条链路自己在几级之间来回',
      '顶层一节：同一条链路在那一课的瑞利变体里用到 MCS 0 到 3 四个级别、降档 22 次升档 19 次（种子 7），而本课四个变体里级别恒定'],
    ['bianchi', 'fading', '那时同一条链路会在几级之间来回，本课那两张表立刻不再适用',
      '顶层一节：固定速率这个前提在那一课的场景里逐帧不成立——1000 ms 里 848 帧分布在四个级别上（瑞利，种子 7），而本课的圆弧是把它布置成真的'],
    ['rate-vs-model', 'fading', '那时这张速率直方图就不再是单一成因的了',
      '顶层一节，而解除的方式是给出互补的那一半：本课的直方图单一成因是碰撞，那一课的单一成因是链路变差（单链路场景，COLLISION 恒为 0，失败全部 lowSinr），两课合起来才是两个成因'],
    ['rate-fallback', 'fading', '所以这里 337 次失败没有一次来自链路变差',
      '顶层一节，加上站点数 2 → 1：在本课自己的两站点场景上打开衰落会凭空多出 514 个碰撞，所以那一课换成单链路场景，于是它的失败 100% 来自链路变差，而本课是 0%'],
  ]

  const actual = LESSONS.flatMap((l) => l.limits.filter((x) => x.until).map((x) => `${l.id}→${x.until!}`))

  it('is exactly these thirteen sites, no more and no fewer', () => {
    expect([...actual].sort()).toEqual(UNTIL_SITES.map(([s, t]) => `${s}→${t}`).sort())
  })

  it.each(UNTIL_SITES)('%s → %s names its own words and the axis that opens it', (src, dst, needle, axis) => {
    const lesson = LESSONS.find((l) => l.id === src)
    expect(lesson, `${src} is in the course`).toBeDefined()
    const lim = lesson!.limits.find((x) => x.until === dst)
    expect(lim, `${src} no longer points at ${dst}`).toBeDefined()
    expect(lim!.text, `${src} → ${dst}: the ledger's substring moved`).toContain(needle)
    // criterion A again, per site: a promise to lift is only coherent about a scenario class
    expect(lim!.kind, `${src} → ${dst}`).toBe('out-of-scope')
    // the fourth column is the part no test can compute; an empty one means nobody judged
    expect(axis.trim(), `${src} → ${dst} has no axis written down`).not.toBe('')
  })

  /**
   * **Criterion C — the target comes after the source.**
   *
   * **This check is vacuous today and the next reader should know it.** All thirteen targets
   * already sit later in `COURSE_ORDER` than their source (mcs-ladder 3 → rate-vs-model 23,
   * ifs 11 → edca 26, backoff 13 → txop 29, anomaly 18 → txop 29, width 32 → selectivity 33,
   * streams 34 → mumimo 42, uwb-intro 51 → uwb-sstwr 54, uwb-blocks 58 → uwb-contention 63,
   * and the five `fading` sites — radio-primer 0, mcs-ladder 3, bianchi 21, rate-vs-model 23,
   * rate-fallback 36 → fading 38), so it discriminates nothing and will not catch a single
   * thing wrong with the course as it stands.
   *
   * It is here anyway, because 「这一条在《…》里**会被**解除」is future tense: an `until`
   * aimed at an EARLIER lesson makes that sentence a lie, and nothing else would stop it.
   * Three lines against the mistake this repository makes most often — a mistyped id.
   */
  it('points forward, which today it cannot help doing', () => {
    const backward: string[] = []
    for (const l of LESSONS) {
      for (const lim of l.limits) {
        if (!lim.until) continue
        const from = COURSE_ORDER.indexOf(l.id)
        const to = COURSE_ORDER.indexOf(lim.until)
        if (!(to > from)) backward.push(`${l.id}(${from}) → ${lim.until}(${to})`)
      }
    }
    expect(backward, `an \`until\` aimed backwards: ${backward.join(', ')}`).toEqual([])
  })
})

/**
 * The `seeAlso` ledger, frozen for the same reason as B: adding or removing a promise to
 * the reader should be an explicit edit. Three rows as of 2026-10-05, all pointing at
 * `rate-vs-model` — the lesson whose own `limits[0]`/`limits[1]` restate what these three
 * limits say, which is what "never lifted" looks like from the other end.
 *
 * `width`'s inter-bin-correlation limit deliberately carries NO pointer at all, even
 * though `selectivity` restates it; `tests/course/width.test.ts` pins that it carries
 * neither field. `ru-diversity` gets none either, and `tests/course/ofdma-dl.test.ts`
 * says why.
 */
describe('the three `seeAlso` sites are a frozen ledger too', () => {
  const SEE_ALSO_SITES: readonly [string, string, string][] = [
    ['anomaly', 'rate-vs-model', '这里的速率控制只有两个计数'],
    ['anomaly', 'rate-vs-model', '它分不清碰撞与衰落'],
    ['mcs-ladder', 'rate-vs-model', '真实速率控制的输入还要更多'],
  ]

  it('is exactly these three, no more and no fewer', () => {
    const actual = LESSONS.flatMap((l) => l.limits.filter((x) => x.seeAlso).map((x) => `${l.id}→${x.seeAlso!}`))
    expect([...actual].sort()).toEqual(SEE_ALSO_SITES.map(([s, t]) => `${s}→${t}`).sort())
  })

  it.each(SEE_ALSO_SITES)('%s → %s still says the words it was entered for', (src, dst, needle) => {
    const lesson = LESSONS.find((l) => l.id === src)!
    const lim = lesson.limits.find((x) => x.seeAlso === dst && x.text.includes(needle))
    expect(lim, `${src}: no \`seeAlso: '${dst}'\` limit containing ${needle}`).toBeDefined()
  })
})
