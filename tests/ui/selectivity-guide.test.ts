/**
 * The learner-facing reference text for frequency selectivity: the Guide's section on it, the
 * glossary's `Frequency selectivity` entry, and the editor panel's own description.
 *
 * Three surfaces print the same handful of figures, and until this file existed nothing held
 * them to the engine. The shape is `tests/ui/uwb-guide.test.ts`'s, which the UWB and AMP sides
 * already use in a dozen places: render `Guide`, read `EditorGuide.tsx` as source text, and
 * assert the numbers **recomputed from the engine** appear in both — never a literal typed a
 * second time here. `src/engine/selectivity.ts` says it of its own constant ("Computed, not
 * written as 2.03125"), and a test that writes `2.03125` would be the fourth copy of exactly
 * the number that comment refuses to have a copy of.
 *
 * What is *not* recomputed here: the five pooled drop rates, the two worst-bin means and the
 * loss median. Those come from measurement runs that take minutes
 * (`tests/engine/selectivity-inert.test.ts`, `-round.test.ts`, `selectivity.test.ts` own them),
 * so the three surfaces are instead held to agreeing with each other, and the one figure that
 * *is* arithmetic on an engine formula — the noise floor's rise from 20 to 320 MHz — is
 * recomputed, the precedent `tests/course/width.test.ts` set for the same number.
 */
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import { noiseDbm } from '../../src/engine/phy'
import { RU26_TONES, DF_EHT_KHZ, selBinWidthMhz, selBins, selMemberBins } from '../../src/engine/selectivity'
import { selectivityRefusals } from '../../src/model/scenario'
import { Guide } from '../../src/ui/Guide'
import { GLOSSARY } from '../../src/ui/glossary'
import { STRINGS } from '../../src/ui/i18n'

/**
 * Every run of whitespace flattened to one space. Both sources wrap a sentence across JSX
 * lines, so `从 20 到 320 MHz` is `从 20 到
        320 MHz` on disk — a phrase this file has to
 * be able to ask about without knowing where the author's line breaks fell.
 */
const flat = (s: string): string => s.replace(/\s+/g, ' ')

/** The editor panel's prose, read as source text — the same way uwb-guide.test.ts reads it. */
const EDITOR_GUIDE = flat(readFileSync(new URL('../../src/editor/EditorGuide.tsx', import.meta.url), 'utf8'))

/** The Guide body, rendered. */
const GUIDE = flat(renderToStaticMarkup(createElement(Guide)))

/** The glossary entry under test. */
const ENTRY = GLOSSARY.flatMap((g) => g.items).find((i) => i.term === 'Frequency selectivity')

/** The editor checkbox's own hint, which is the fourth surface and the shortest. */
const HINT = STRINGS.editor.selectivityOnHint

/**
 * **The fifth surface, and the one no assertion in this file could reach.** `README.md`
 * enumerates the same bin geometry in English, so none of the Chinese assertions above can be
 * pointed at it — and it therefore sat outside the range of every guard here while quoting the
 * bare clause pair this file bans, the pre-4b whole-channel overestimate, and the rate-selection
 * claim the engine contradicts. It gets its own block at the bottom, in English.
 */
const README = flat(readFileSync(new URL('../../README.md', import.meta.url), 'utf8'))

/** Every surface that prints these figures, so one loop covers all of them. */
const SURFACES: [string, string][] = [
  ['Guide', GUIDE],
  ['EditorGuide', EDITOR_GUIDE],
  ['glossary', `${ENTRY?.alt ?? ''} ${ENTRY?.def ?? ''}`],
]

/** The five widths the three surfaces all enumerate. */
const WIDTHS = [20, 40, 80, 160, 320]

const WIDEST = WIDTHS[WIDTHS.length - 1]
const NARROWEST = WIDTHS[0]

describe('the bin geometry is quoted from the engine, not typed again', () => {
  it('has a glossary entry at all', () => {
    expect(ENTRY).toBeDefined()
    expect(ENTRY?.def).toBeTruthy()
  })

  it('prints the bin width every surface claims, recomputed from the two standard numbers', () => {
    // Not `2.03125`: the width is 26 tones x 78.125 kHz, and the engine's own comment forbids
    // writing the product down. If either constant is ever corrected, this test moves with it
    // and the prose that did not move fails.
    const mhz = String(selBinWidthMhz())
    expect(mhz).toBe(String((RU26_TONES * DF_EHT_KHZ) / 1000))
    for (const [name, text] of SURFACES) {
      expect(text, `${name} is missing the bin width ${mhz} MHz`).toContain(`${mhz} MHz`)
    }
    expect(HINT, 'the checkbox hint is missing the bin width').toContain(`${mhz} MHz`)
  })

  it('prints the five bin counts as `selBins` computes them, in width order', () => {
    const counts = WIDTHS.map((w) => String(selBins(w))).join('/')
    expect(counts).toBe('9/18/36/72/144')
    for (const [name, text] of SURFACES) {
      expect(text, `${name} is missing the bin counts ${counts}`).toContain(counts)
    }
    expect(HINT, 'the checkbox hint is missing the bin counts').toContain(counts)
  })

  it('prints the five widths themselves beside those counts', () => {
    const widths = WIDTHS.join('/')
    for (const [name, text] of SURFACES) {
      expect(text, `${name} is missing the width list ${widths}`).toContain(widths)
    }
  })

  it('prints the subcarrier spacing the bin width is derived from', () => {
    const khz = `${DF_EHT_KHZ} kHz`
    for (const [name, text] of SURFACES) {
      expect(text, `${name} is missing the spacing ${khz}`).toContain(khz)
    }
  })
})

describe('the wide-channel cost is recomputed, not quoted', () => {
  it('states the noise floor’s rise from the narrowest width to the widest', () => {
    // The same arithmetic `selectivityScenario` lifts both radios by, and the one figure in this
    // passage that is a formula rather than a measurement — so it is computed here.
    const riseDb = (Math.round((noiseDbm(WIDEST) - noiseDbm(NARROWEST)) * 100) / 100).toFixed(2)
    expect(riseDb).toBe('12.04')
    for (const [name, text] of SURFACES) {
      expect(text, `${name} is missing the ${riseDb} dB noise-floor rise`).toContain(`${riseDb} dB`)
      // And it has to say over what span, or it reads as 12.04 dB per doubling.
      expect(text, `${name} states ${riseDb} dB without its span`)
        .toContain(`从 ${NARROWEST} 到 ${WIDEST} MHz`)
    }
  })

  it('credits the recovery to frequency diversity, the reviewed lesson’s own word', () => {
    // `width`'s limits entry ends on 频率分集 (the diversity inside the loss), not 频率选择性
    // (the loss itself). Selectivity does not give part of the noise floor back; the diversity
    // it contains does.
    for (const [name, text] of SURFACES) {
      if (!text.includes('只把其中一部分补回来')) continue
      expect(text, `${name} says selectivity gives part of it back`)
        .not.toContain('频率选择性只把其中一部分补回来')
      expect(text, `${name} does not credit frequency diversity`).toContain('频率分集')
    }
  })
})

describe('the figures that come from a measurement run agree across the surfaces', () => {
  // Re-measured under Task 6c's PPDU-format gate: the two worst-bin means and the loss median
  // are draw statistics and did not move (tests/engine/selectivity.test.ts), while the pooled
  // drop rates did — 14.39/0.52 % became 14.66/0.75 % once the non-HT ACKs left the per-bin
  // path (tests/engine/selectivity-inert.test.ts).
  const MEASURED = ['12.05 dB', '24.09 dB', '2.36 dB', '3.62 dB', '14.66 %', '0.75 %']

  it('quotes the same measured set everywhere it quotes any of it', () => {
    for (const [name, text] of SURFACES) {
      for (const n of MEASURED) {
        expect(text, `${name} is missing ${n}`).toContain(n)
      }
    }
  })

  it('warns that the two worst-bin figures are means over many draws', () => {
    // Without this the reader meets 12.05 dB here and about 10 dB in one run's own WIFI_SEL
    // line, and concludes the reference text is wrong. The reviewed lesson
    // (src/course/tier2/selectivity.ts) carries the warning; these three did not.
    //
    // The caveat is asserted, the figure behind it is not: the single-round median depends on
    // which variant and how long (10.21 dB over the engine's 200 ms sweep, 10.29 dB over the
    // lesson's own 150 ms variant), so these three say "about 10 dB" and the lesson keeps the
    // decimal. A fourth home for that number is exactly what this slice spent its last commit
    // removing.
    for (const [name, text] of SURFACES) {
      expect(text, `${name} quotes 12.05 dB with no single-round caveat`).toContain('约 10 dB')
      expect(text, `${name} pins a single-round decimal of its own`).not.toContain('10.1 dB')
    }
  })

  it('says drop *rate* rather than drop count, in every surface that compares the widths', () => {
    for (const [name, text] of SURFACES) {
      if (!text.includes('14.39')) continue
      expect(text, `${name} never says the margins are comparable`).toContain('余量可比')
      // 掉帧数 may appear only inside the sentence that rules it out.
      if (text.includes('掉帧数')) {
        expect(text, `${name} compares drop counts`).toContain('不是掉帧数')
      }
    }
  })

  it('never claims a strong link drops more frames because of selectivity', () => {
    // The third of this slice's three wording constraints, and the only one these surfaces had
    // no guard for: where there is margin to spare, frequency diversity *saves* frames, so no
    // surface may assert the opposite. The two sentences `width`'s own limits entry carried
    // before it was turned round, plus the plainest way of saying it.
    for (const [name, text] of SURFACES) {
      for (const claim of [
        '信道越宽，踩到这种坑的机会越多',
        '即便在编辑器里打开衰落也补不上这一条',
        '频率选择性会让你多掉帧',
        '掉帧反而越多',
      ]) {
        expect(text, `${name} predicts more drops on a strong link: ${claim}`).not.toContain(claim)
      }
    }
  })

  it('may state the naive prediction only in order to correct it', () => {
    // `Guide.tsx` quotes "wider channel, more deep bins, so worse" and then says the
    // measurements run the other way, which is the right way to handle a wrong intuition — and
    // which a flat ban on the phrase would have forbidden. So the rule is conditional: a
    // surface that raises it has to put the correction beside it.
    for (const [name, text] of SURFACES) {
      for (const naive of ['越宽越糟', '所以越糟']) {
        if (!text.includes(naive)) continue
        expect(text, `${name} raises “${naive}” and leaves it standing`)
          .toMatch(/与它相反|结论是反过来的|跑出来的结果相反/)
      }
    }
  })

  it('and says the counter-intuitive direction outright somewhere', () => {
    // The mirror of the test above: forbidding the wrong claim is only half of it, since a
    // surface that says nothing at all would pass. At least one of these three has to state the
    // direction that the measurements actually show.
    const stated = SURFACES.filter(([, text]) => (
      text.includes('掉帧反而越少') || text.includes('结论是反过来的') || text.includes('反直觉')
    ))
    expect(stated.map(([n]) => n).length, SURFACES.map(([n]) => n).join(' ')).toBeGreaterThan(0)
  })

  it('quotes neither open-loop figure, which belong to a different data set', () => {
    for (const [name, text] of SURFACES) {
      for (const n of ['34.43', '7.14']) {
        expect(text, `${name} quotes ${n}`).not.toContain(n)
      }
    }
  })

  it('carries none of the pre-correction drop rates', () => {
    // The figures these three printed before the PPDU-format gate. A surface still holding one
    // of them is a surface that was missed, and it would contradict the lesson once the course
    // pass lands the new column.
    for (const [name, text] of SURFACES) {
      for (const n of ['14.39', '12.71', '9.48', '5.09', '0.52']) {
        expect(text, `${name} still quotes the pre-correction ${n}`).not.toContain(n)
      }
    }
  })
})

describe('the exclusions are enumerated in full, not only the rare half', () => {
  it('names the generation limit wherever it names the AMP carve-out', () => {
    // The enumeration was already there and said only "the AMP side's OOK PPDUs do not take
    // this path" — the rare case. The one that holds in *every* scene went unsaid: only an
    // he/eht PPDU is binned, so every ACK (non-HT by default) and every frame of a vht or
    // legacy station keeps the scalar path. A reader who ticked the box on `defaultScenario()`
    // and went looking for the vht phone's `WIFI_SEL` row found nothing, having just been told
    // the only exclusion was AMP.
    const surfaces: [string, string][] = [...SURFACES, ['selectivityOnHint', HINT]]
    for (const [name, text] of surfaces) {
      if (!text.includes('OOK')) continue
      expect(text, `${name} lists the AMP exclusion without the generation one`)
        .toMatch(/he／eht|he\/eht/)
      expect(text, `${name} does not say the acknowledgements are excluded`).toContain('确认帧')
    }
  })

  it('every surface that names the AMP carve-out names both', () => {
    // Counted, so the loop above cannot pass by matching nothing.
    const surfaces: [string, string][] = [...SURFACES, ['selectivityOnHint', HINT]]
    expect(surfaces.filter(([, t]) => t.includes('OOK')).length).toBeGreaterThanOrEqual(3)
  })
})

describe('the editor panel states no rule the schema states', () => {
  it('does not restate any refusal sentence, which the checkbox prints from the schema', () => {
    // M3: the three rules were lifted into `selectivityRefusals` so the grey box and the schema
    // could not word them two ways — and then the panel's description grew a third wording, with
    // its third rule's parenthesis word for word identical to the refusal's. Nothing is allowed
    // to hold a copy: the editor renders the refusals, the panel's description points at them.
    const refusals = [
      ...selectivityRefusals({ fading: undefined, nodes: [] }),
      ...selectivityRefusals({ fading: { shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'none' }, nodes: [] }),
    ]
    expect(refusals.length).toBeGreaterThanOrEqual(3)
    for (const message of refusals) {
      // The distinctive middle of each refusal, past its shared opening and its "or remove
      // selectivity" tail — a substring long enough that an incidental match is not credible.
      const core = message.slice(message.indexOf('：') + 1, message.indexOf('：') + 25)
      expect(core.length).toBeGreaterThan(10)
      expect(EDITOR_GUIDE, `EditorGuide restates a refusal: ${core}`).not.toContain(core)
    }
  })

  it('points the reader at the checkbox’s own red line instead', () => {
    expect(EDITOR_GUIDE).toContain('selectivityRefusals')
  })
})

describe('the 26-tone RU carries its English name wherever it is introduced', () => {
  it('names it in every surface that uses the Chinese term', () => {
    const surfaces: [string, string][] = [...SURFACES, ['selectivityOnHint', HINT]]
    for (const [name, text] of surfaces) {
      if (!text.includes('26 音调资源单元')) continue
      expect(text, `${name} introduces 26 音调资源单元 with no English name`)
        .toContain('26-tone RU')
    }
  })

  it('names capture effect in English too, where it lists what still reads the flat sample', () => {
    for (const [name, text] of [...SURFACES, ['selectivityOnHint', HINT]] as [string, string][]) {
      if (!text.includes('捕获效应')) continue
      expect(text, `${name} says 捕获效应 with no English name`).toContain('capture effect')
    }
  })
})

describe('a member’s own bin count is named wherever the channel’s is', () => {
  /*
   * **The failure mode these four surfaces had, and which nothing here could have caught.**
   * Every one of them says the bin count 「由带宽算出 … 都不可配」, which is true of the CHANNEL
   * and was the whole story until slice 4b. It is not the story a reader arrives with: they
   * come from `ofdma-dl`, which now teaches that a member on 20 MHz reads 4 of the 9 bins, open
   * the glossary, read 「9 格，都不可配」 and conclude that every decision reads 9 — exactly the
   * overestimate slice 4b retired from the engine. Nothing about the sentence is false; it is
   * the half of the enumeration that fails, the same shape as 「the exclusions are enumerated in
   * full」 above.
   *
   * The clause is held to the engine's own arithmetic rather than to a literal, like every other
   * figure in this file: `selBins(20)` and `selMemberBins(20, 1/2)`, in `ofdma-dl`'s own words
   * (「各读 9 格里的 4 格」), so a surface and the lesson cannot word the same fact two ways.
   */
  const surfaces: [string, string][] = [...SURFACES, ['selectivityOnHint', HINT]]

  it('is a fourth surface, not three — EditorGuide prints the counts too', () => {
    // The brief for this task named glossary, i18n and Guide. `EditorGuide.tsx` enumerates the
    // same five counts and was the one that would have been missed.
    const counts = WIDTHS.map((w) => String(selBins(w))).join('/')
    expect(surfaces.filter(([, t]) => t.includes(counts)).length).toBe(4)
  })

  it('says the member reads only its own share’s bins', () => {
    for (const [name, text] of surfaces) {
      expect(text, `${name} gives the channel's bin count with no member clause`)
        .toContain(`${selBins(20)} 格里的 ${selMemberBins(20, 1 / 2)} 格`)
      expect(text, `${name} does not say whose bins those are`).toContain('整条信道')
    }
  })

  it('never says the bin count is the whole channel’s without saying so', () => {
    // The sentence that would re-teach the retired overestimate: a flat 「每一次判决都读整条
    // 信道的格」. None of the four may assert it.
    for (const [name, text] of surfaces) {
      for (const claim of ['每一次判决都是 9 格', '成员拿到的是整条信道的格数', '成员读的也是这个数']) {
        expect(text, `${name} re-teaches the pre-4b overestimate: ${claim}`).not.toContain(claim)
      }
    }
  })
})

describe('the CQI clause numbers are attributed to the right document', () => {
  /*
   * **Verified against the corpus at
   * `D:/ai_patent_experiments/.claude/skills/wifi_patent_skill/references/ieee_standards/text/`:**
   * `9.4.1.75` occurs 0 times in `80211-2024.json` and 6 in `80211be-2024.json`; `9.4.1.65`
   * occurs 6 times in the base standard and 0 in 11be; and the base standard's 9.4.1 runs out at
   * `.71`. So §9.4.1.75 (EHT CQI Report field) is an 802.11be-2024 clause and §9.4.1.65 (HE CQI
   * Report field) is a base-standard one, and the glossary used to hang the pair on one document
   * with a bare 「§9.4.1.65 / §9.4.1.75」. `src/course/tier2/selectivity.ts`'s own source entry
   * already said this; the glossary was the copy that did not move with it.
   */
  it('gives each of the two a document, never a bare pair', () => {
    for (const [name, text] of SURFACES) {
      if (!text.includes('9.4.1.75')) continue
      expect(text, `${name} cites §9.4.1.75 with no document`).toContain('802.11be-2024 §9.4.1.75')
      expect(text, `${name} cites §9.4.1.65 with no document`).toContain('802.11-2024 §9.4.1.65')
      expect(text, `${name} still hangs both clause numbers on one document`)
        .not.toContain('§9.4.1.65 / §9.4.1.75')
    }
  })

  it('and the one surface that cites them at all is counted', () => {
    expect(SURFACES.filter(([, t]) => t.includes('9.4.1.75')).length).toBeGreaterThan(0)
  })
})

describe('README.md is the fifth surface, and English, so it gets its own guards', () => {
  /*
   * **Why this block exists.** The four surfaces above are Chinese prose and share one loop.
   * `README.md` prints the same facts in English a few hundred lines into its RF-model
   * paragraph, which meant every rule this file enforces stopped at the repo's front page: it
   * still carried `§9.4.1.65 / §9.4.1.75` (banned above, and the base standard has no
   * §9.4.1.75), still said a member's decode reads the whole channel's bins (the overestimate
   * slice 4b removed from the engine), and still named rate selection among the readers of the
   * one flat draw (it reads the static link table instead — `mcsForPeer` in simulation.ts
   * never sees either fading layer).
   */
  it('enumerates the bin width, spacing and counts the engine computes', () => {
    const mhz = String(selBinWidthMhz())
    expect(README, `README is missing the bin width ${mhz} MHz`).toContain(`${mhz} MHz`)
    expect(README, 'README is missing the subcarrier spacing').toContain(`${DF_EHT_KHZ} kHz`)
    const counts = WIDTHS.map((w) => String(selBins(w))).join(' / ')
    expect(README, `README is missing the bin counts ${counts}`).toContain(counts)
    expect(README, 'README is missing the width list').toContain(WIDTHS.join(' / '))
  })

  it('never hangs the two CQI clause numbers on one document', () => {
    // The exact string the block above bans in the other four. `README.md` was out of its
    // range, which is how it kept the pair for two slices.
    expect(README).not.toContain('§9.4.1.65 / §9.4.1.75')
    expect(README, 'README cites §9.4.1.75 with no document')
      .toContain('802.11be-2024 §9.4.1.75')
    expect(README, 'README cites §9.4.1.65 with no document')
      .toContain('802.11-2024 §9.4.1.65')
  })

  it('says a member reads only its own share’s bins, like the other four', () => {
    // Held to the engine's arithmetic, not to a literal `4 of the 9`.
    expect(README, 'README gives the channel count with no member clause')
      .toContain(`${selMemberBins(20, 1 / 2)} of the ${selBins(20)} bins`)
    expect(README, 'README does not say whose bins the five counts are')
      .toMatch(/whole channel's\*\* bins|whole channel's bins/)
  })

  it('does not name rate selection among the readers of the flat draw', () => {
    // `buildLinkTable` runs once per link in `Simulation`'s constructor and is never written
    // again; `mcsForPeer` reads that table, so rate selection sees neither the shadow nor the
    // per-frame fade — let alone the bins. The first three of the four do read the flat draw
    // (`Channel.linkDbm`), so the fix is to split the list, not to drop it.
    expect(README).not.toContain('capture and rate selection keep reading the one flat draw')
    expect(README, 'README still lists rate selection with the flat-draw readers')
      .not.toMatch(/rate selection keep(s)? reading the one flat draw/)
    expect(README, 'README does not say what rate selection reads instead')
      .toContain('mcsForPeer')
  })
})

describe('rate selection is not one of the readers of the flat draw', () => {
  /*
   * **The sentence all five surfaces carried, whose fourth step was false.** Each said
   * 「载波侦听、前导检测、捕获效应与选级读的仍然是那一次平坦抽样」. The first three are right:
   * they go through `Channel.linkDbm`, which is this frame's table level plus both fading
   * layers. Rate selection does not. `buildLinkTable` runs once per link while `Simulation`
   * builds the link (simulation.ts) and is never written again, and `mcsForPeer` reads that
   * table — so rate selection sees neither the per-frame fade nor the slow shadow, let alone a
   * bin. The lesson `src/course/tier2/ru-diversity.ts` and `src/course/tier1/mcs-ladder.ts`
   * both already said so, which is the real reason this had to move: a reader going through
   * `COURSE_ORDER` met the two statements one lesson apart.
   *
   * Two assertions per surface, because either alone passes a surface that says nothing: the
   * old four-step list must be gone, AND the surface must name what rate selection reads
   * instead. `mcsForPeer` is the name the course already points readers at.
   */
  const surfaces: [string, string][] = [...SURFACES, ['selectivityOnHint', HINT]]

  it('no surface puts 选级 inside the flat-draw list', () => {
    for (const [name, text] of surfaces) {
      for (const claim of [
        '捕获效应（capture effect）与选级读的仍然是那一次平坦抽样',
        '捕获效应与选级读的仍然是那一次平坦抽样',
        '以及发送端选哪一级速率，读的仍然是整条信道那一次平坦抽样',
      ]) {
        expect(text, `${name} still lists rate selection among the flat-draw readers: ${claim}`)
          .not.toContain(claim)
      }
    }
  })

  it('every surface that names the first three names what the fourth reads instead', () => {
    const stating = surfaces.filter(([, t]) => t.includes('捕获效应'))
    // Counted, so the loop cannot pass by matching nothing. Three carry the enumeration; the
    // rendered Guide does not mention 捕获效应 at all.
    expect(stating.map(([n]) => n).length).toBeGreaterThanOrEqual(3)
    for (const [name, text] of stating) {
      expect(text, `${name} enumerates the flat-draw readers without saying what 选级 reads`)
        .toContain('mcsForPeer')
      expect(text, `${name} does not say the rate ceiling is the static link-table mean`)
        .toMatch(/静态的均值电平|链路表里那一个静态/)
      // And the part that makes it more than a pedantic distinction: the table carries
      // neither fading layer, so turning fading on in the editor moves nothing here.
      expect(text, `${name} does not say the shadow is absent from it too`)
        .toContain('连慢的那层阴影都不含')
    }
  })
})
