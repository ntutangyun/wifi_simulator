/**
 * The zero-to-hero lesson contract, enforced over every migrated lesson:
 * docs/superpowers/specs/2026-09-21-course-readability-design.md.
 *
 * Structure (every section present and well-formed), words (an acronym is
 * introduced before it is used; the picture stays light; citations live only
 * in `sources` and in table cells of `numbers`) and length (the main path fits
 * a sitting). Lessons still in the old shape are listed in MIGRATING and
 * skipped; each migration task deletes its ids, so the list only shrinks.
 *
 * The word rules are applied to BOTH languages: the spec writes them about the
 * lesson, not about its English half, and the acronyms of a Chinese paragraph
 * are the same Latin tokens (`NAV`, `AMP-SIG`, `RMARKER`) the English one uses.
 */
import { describe, it, expect } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { COURSE_ORDER, MODULES, lessonMinutes, lessonWords, trackOf } from '../../src/course/curriculum'
import { isMigrated, type Block, type L10n, type Lesson } from '../../src/course/lessonKit'
import {
  BUDGETS, CITATION, KNOWN_WORDS, LOG_NAMES, acronyms, cellTexts, definedInPlace, densityTexts, enWords,
  firstTermUses, lessonBudget, lessonStrings, namedAtStandIn, namedInPlace, neutralCellTexts, numericQuantities,
  paragraphTexts,
  zhChars,
} from '../../src/course/readability'
import { effectiveMigrating } from './kit'

/** Lessons still in the old shape. Each migration task removes its ids; the list only shrinks. */
export const MIGRATING: string[] = [
  
  'amp-slots', 'amp-coexist',
]
/**
 * Step 5's owner table (plans/2026-09-22-course-readability-wifi.md): every word the
 * TIER1_BASELINE stand-in used to admit now belongs to one Tier 1 lesson's `terms`, and
 * the generation labels HT/VHT/HE/EHT moved to KNOWN_WORDS. The test below keeps it so.
 */
const TIER1_OWNERS: Record<string, string[]> = {
  'radio-primer': ['SNR', 'SINR', 'RSSI'],
  'decode-thresholds': ['MCS', 'OFDM', 'CCA'],
  'roles-stack': ['BSS', 'BSSID', 'SSID'],
  'frame-anatomy': ['PPDU', 'MPDU', 'MSDU', 'FCS', 'CRC', 'QOS'],
  'frame-anatomy-bytes': ['L-STF', 'L-LTF', 'L-SIG', 'U-SIG'],
  airtime: ['ACK'],
  ifs: ['SIFS', 'DIFS', 'EIFS'],
  backoff: ['CW'],
  nav: ['NAV'],
  hidden: ['RTS', 'CTS'],
}
const CITED_FIELDS: (keyof Lesson)[] = ['why', 'outcomes', 'terms', 'picture', 'observe', 'tryThis', 'quiz']

/**
 * Two lower-case English words reading as a phrase: the shape of a sentence, as
 * opposed to a value, an arithmetic line, a protocol name or a log line.
 * "26 + 1400 + 4 = 1430 B", "retryLimit", "MCS 13" and "9 µs" do not match it;
 * "1400 B of video" and "4,990 overlaps → 2,713 retries" do.
 *
 * Two alternatives, because the review's own two examples need both: adjacent
 * words ("of video"), and two words of four letters or more with only digits,
 * units and punctuation between them ("overlaps → 2,713 retries"). The second
 * keeps its gap short and its words long so that "20 and 40 ms" — a value list,
 * not a sentence — stays out of it.
 */
const CELL_PROSE = /\b[a-z]{2,}\s+[a-z]{2,}\b|\b[a-z]{4,}\b[^A-Za-z\n]{1,12}\b[a-z]{4,}\b/
/** A record or log line the reader copies off the screen: it opens with a node id. */
const LOG_LINE = /^[a-z][a-z0-9]*-\d+\b/
/** A record type or constant name — `TX_START`, `MCS` — read rather than translated. */
const RECORD_NAME = /^[A-Z0-9_]+$/

/**
 * TEMPORARY — step 5's tightened cell rules (rule-gaps 1 and 2 of
 * .superpowers/sdd/2026-09-22-course-readability-wifi/tier1-review.md) turn red on
 * lessons outside the Wi-Fi Tier 1 fix wave that introduced them. The rule stays on;
 * these ids are excused until their own wave rewrites the offending cells.
 *
 * The Wi-Fi ids are gone: the Tier 2 fix wave glossed `edca`'s and `txop`'s four
 * access-category short names in the cell itself (`VO (voice)` / `VO（语音）`).
 * TODO(uwb-fix-wave): `uwb-ul-tdoa` and `uwb-mms-numbers` print English phrases into
 * language-neutral cells ("1 slot of 2 ms, 1 frame", "2.10 cm over 21 ranges");
 * `uwb-dstwr` and `uwb-blocks` print `Treply1` and `SP1` unglossed.
 */
const CELL_RULE_CARRIES: Record<string, string> = {}

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

/** Every bilingual string of one lesson field — `lessonStrings`, asked for a single field. */
const textsOf = (l: Lesson, f: keyof Lesson): L10n[] =>
  lessonStrings({ [f]: l[f] } as unknown as Partial<Lesson>)
/**
 * True for the first MIGRATED lesson of a track, which is the one held to the
 * stricter opening rules (at most four new words, no table in the picture).
 * Mid-migration that is not necessarily the track's first lesson in
 * COURSE_ORDER: a track whose opener is still in MIGRATING has its second
 * lesson judged as the opener until the first one lands. That is deliberate —
 * the rule exists to protect whichever lesson a reader actually meets first.
 */
const firstOfTrack = (l: Lesson) => ordered.find((o) => trackOf(o) === trackOf(l) && !MIGRATING_NOW.includes(o.id)) === l

/**
 * Every acronym a lesson may use without introducing it: the baseline, its own
 * `terms`, and the `terms` of every migrated lesson before it that is in the
 * same track OR in Wi-Fi Tier 1. The Tier 1 admission is the spec's, and is
 * wider than the prerequisite rule on purpose — `needs` stays restricted to
 * radio-primer and frame-anatomy, but a one-line reminder in the picture is
 * enough for any Tier 1 word. Narrowing it to those two lessons would leave
 * `NAV` and `CTS` with no legal owner (TIER1_OWNERS names who owns what).
 */
function knownFor(l: Lesson): Set<string> {
  const known = new Set<string>([...KNOWN_WORDS, ...LOG_NAMES])
  for (const o of ordered) {
    if (o === l) break
    const admitted = trackOf(o) === trackOf(l) || (trackOf(o) === 'wifi' && MODULES[o.module].tier === 0)
    if (admitted && !MIGRATING_NOW.includes(o.id)) for (const t of o.terms!) known.add(t.term.toUpperCase())
  }
  for (const t of l.terms!) known.add(t.term.toUpperCase())
  return known
}

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
  it('every ex-baseline word is a term of the Tier 1 lesson that owns it', () => {
    for (const [id, words] of Object.entries(TIER1_OWNERS)) {
      const l = byId.get(id)!
      expect(l, id).toBeDefined()
      const terms = new Set((l.terms ?? []).map((t) => t.term.toUpperCase()))
      for (const w of words) expect(terms.has(w), `${id} owns ${w}`).toBe(true)
    }
  })
})

// While MIGRATING still covers every lesson there is nothing to iterate, and
// vitest refuses an empty describe.each.
if (migrated.length) {
  describe.each(migrated.map((l) => [l.id, l] as const))('readability · %s', (_id, l) => {
    it('has every section, well-formed', () => {
      expect(l.why!.en.trim()).not.toBe(''); expect(l.why!.zh.trim()).not.toBe('')
      expect(l.outcomes!.length).toBeGreaterThanOrEqual(2); expect(l.outcomes!.length).toBeLessThanOrEqual(4)
      expect(l.terms!.length).toBeLessThanOrEqual(firstOfTrack(l) ? 4 : 6)
      expect(l.picture!.length).toBeGreaterThan(0); expect(l.numbers!.length).toBeGreaterThan(0)
      expect(l.picture!.some((b) => b.kind === 'watch')).toBe(true)
      if (firstOfTrack(l)) expect(l.picture!.some((b) => b.kind === 'table')).toBe(false)
      expect(l.sources!.length).toBeGreaterThan(0)
      for (const b of l.picture!) if (b.kind === 'watch' && b.jump !== undefined) expect(l.jumps[b.jump]).toBeDefined()
    })
    it('says everything in both languages', () => {
      // every string a learner reads, `sources`, `outcomes` and each term's plain line included
      const seen = lessonStrings(l)
      // a structural floor: one string per outcome, term, block, source, observation,
      // experiment and (question + options + explanation) of a quiz, plus `why` itself,
      // so deleting a section cannot pass as "still bilingual".
      const floor = 1 + l.outcomes!.length + l.terms!.length + l.picture!.length + l.numbers!.length
        + (l.deeper?.length ?? 0) + l.sources!.length + l.observe.length + l.tryThis.length + 3 * l.quiz.length
      expect(seen.length).toBeGreaterThanOrEqual(floor)
      for (const x of seen) {
        expect(x.en.trim(), x.en).not.toBe('')
        expect(x.zh.trim(), x.en).not.toBe('')
        // anything that is a sentence of English must have been written in Chinese too
        if (/[a-z]{3,}\s+[a-z]{3,}/.test(x.en)) expect(x.zh, x.en).not.toBe(x.en)
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
    it('why: plain words, no digits, no citations', () => {
      for (const s of [l.why!.en, l.why!.zh]) {
        expect(numericQuantities(s), s).toBe(0)
        expect(CITATION.test(s), s).toBe(false)
      }
    })
    it('introduces every acronym before using it', () => {
      const known = knownFor(l)
      const texts = [l.why!, ...paragraphTexts(l.picture!), ...l.outcomes!]
      // both languages: a Chinese paragraph borrows the same Latin acronyms
      for (const s of texts) {
        for (const a of acronyms(s.en)) expect(known.has(a), `${l.id} EN: "${a}" in "${s.en.slice(0, 60)}…"`).toBe(true)
        for (const a of acronyms(s.zh)) expect(known.has(a), `${l.id} ZH: "${a}" in "${s.zh.slice(0, 30)}…"`).toBe(true)
      }
    })
    it('keeps the picture light: short paragraphs, at most two quantities each, no citations', () => {
      for (const p of paragraphTexts(l.picture!)) {
        expect(enWords(p.en), p.en).toBeLessThanOrEqual(90)
        expect(zhChars(p.zh), p.zh).toBeLessThanOrEqual(170)
        expect(numericQuantities(p.en), p.en).toBeLessThanOrEqual(2)
        expect(numericQuantities(p.zh), p.zh).toBeLessThanOrEqual(2)
        expect(CITATION.test(p.en) || CITATION.test(p.zh), p.en).toBe(false)
      }
    })
    it('keeps the picture uncrowded: two new words and four acronyms to a paragraph', () => {
      const paragraphs = densityTexts(l.picture!)
      const fresh = firstTermUses(l.picture!, l.terms!.map((t) => t.term))
      for (const [i, p] of paragraphs.entries()) {
        expect(fresh[i].length, `${l.id}: ${fresh[i].join(', ')} all first used in "${p.en.slice(0, 60)}…"`).toBeLessThanOrEqual(2)
        const distinct = new Set([...acronyms(p.en), ...acronyms(p.zh)])
        expect(distinct.size, `${l.id}: ${[...distinct].join(', ')} in "${p.en.slice(0, 60)}…"`).toBeLessThanOrEqual(4)
      }
    })
    it('keeps the numbers prose short: ≤ 90 words, ≤ 4 quantities, acronyms known or defined in place', () => {
      const known = knownFor(l)
      for (const p of paragraphTexts(l.numbers!)) {
        expect(enWords(p.en), p.en).toBeLessThanOrEqual(90)
        expect(zhChars(p.zh), p.en).toBeLessThanOrEqual(170)
        expect(numericQuantities(p.en), p.en).toBeLessThanOrEqual(4)
        expect(numericQuantities(p.zh), p.en).toBeLessThanOrEqual(4)
        for (const a of new Set([...acronyms(p.en), ...acronyms(p.zh)])) {
          expect(known.has(a) || definedInPlace(p, a), `${l.id} numbers: "${a}" in "${p.en.slice(0, 60)}…"`).toBe(true)
        }
      }
    })
    it('introduces every acronym the tables and the practice use, too', () => {
      // Amendment A3: the rule used to stop at the cell border, so a word a learner meets in
      // a `numbers` cell ("GDOP 1.06"), in an observation, in an experiment or in a quiz could
      // be two lessons ahead of its gloss and nothing turned red. A language-neutral cell (a
      // log line, a counter) is still exempt — `cellTexts` drops it — and so is a token the
      // paragraph or the item defines where it uses it.
      const known = knownFor(l)
      const quiz = l.quiz.flatMap((q) => [q.q, ...q.options, q.explain])
      const texts: [string, L10n][] = [
        ...cellTexts(l.numbers!).map((c) => ['numbers cell', c] as [string, L10n]),
        ...cellTexts(l.picture!).map((c) => ['picture cell', c] as [string, L10n]),
        ...l.observe.map((s) => ['observe', s] as [string, L10n]),
        ...l.tryThis.map((s) => ['tryThis', s] as [string, L10n]),
        ...quiz.map((s) => ['quiz', s] as [string, L10n]),
      ]
      for (const [where, s] of texts) {
        for (const a of new Set([...acronyms(s.en), ...acronyms(s.zh)])) {
          expect(known.has(a) || definedInPlace(s, a), `${l.id} ${where}: "${a}" in "${s.en.slice(0, 60)}…"`).toBe(true)
        }
      }
    })
    it('keeps a language-neutral cell neutral: a value or a name, never an English sentence', () => {
      // Step 5 review, rule-gap 1 (the B2 defect, recurring in B6): `en === zh` renders the
      // ONE string to both readers, so `N('1400 B of video')` puts English verbatim into a
      // Chinese main-path table. A value, an arithmetic line, a protocol or log name, a record
      // name and a provenance cell are all fine — none of them is two English words in a row.
      if (CELL_RULE_CARRIES[l.id]) return
      for (const c of [...neutralCellTexts(l.numbers!), ...neutralCellTexts(l.picture!)]) {
        if (CITATION.test(c.en) || LOG_LINE.test(c.en) || RECORD_NAME.test(c.en) || LOG_NAMES.has(c.en.toUpperCase())) continue
        expect(CELL_PROSE.test(c.en), `${l.id}: language-neutral cell reads as English prose — "${c.en}"`).toBe(false)
      }
    })
    it('introduces the acronyms of a language-neutral cell as well', () => {
      // Step 5 review, rule-gap 2 (B1's carry): `cellTexts` drops `en === zh` cells, so
      // `BPSK 1/2` in a main-path table met the reader with no gloss anywhere. A word is a
      // word whichever cell it stands in; it may be glossed in the cell, in that section's
      // prose, or in any bilingual cell of that section — anywhere the reader is looking.
      if (CELL_RULE_CARRIES[l.id]) return
      const known = knownFor(l)
      for (const bs of [l.numbers!, l.picture!]) {
        const around = [...paragraphTexts(bs), ...cellTexts(bs)]
        for (const c of neutralCellTexts(bs)) {
          if (CITATION.test(c.en)) continue
          for (const a of acronyms(c.en)) {
            const ok = known.has(a) || definedInPlace(c, a) || around.some((p) => definedInPlace(p, a))
            expect(ok, `${l.id} neutral cell: "${a}" in "${c.en}" is glossed nowhere in that section`).toBe(true)
          }
        }
      }
    })
    it('tabulates a run of figures instead of chopping it into paragraphs', () => {
      // Amendment A2: the four-quantity cap was being met by cutting one paragraph into a run
      // of heading-less one-sentence paragraphs, which reads worse than what it replaced and
      // loses the heading that told the reader which scene the figures belong to. A run of
      // figures is a `table`, a `list` or a `steps` block; a bare paragraph may follow one of
      // those or a headed paragraph, never another bare paragraph.
      for (const [i, b] of l.numbers!.entries()) {
        if ((b.kind ?? 'p') !== 'p' || b.heading) continue
        const prev = l.numbers![i - 1]
        const bare = prev !== undefined && (prev.kind ?? 'p') === 'p' && !prev.heading
        expect(bare, `${l.id} numbers[${i}]: "${(b as Extract<Block, { kind?: 'p' }>).text.en.slice(0, 60)}…" follows a heading-less paragraph`).toBe(false)
      }
    })
    it('keeps an observe or try-this item to one thing to do: ≤ 60 words, ≤ 6 quantities', () => {
      for (const s of [...l.observe, ...l.tryThis]) {
        expect(enWords(s.en), s.en).toBeLessThanOrEqual(60)
        expect(numericQuantities(s.en), s.en).toBeLessThanOrEqual(6)
        expect(numericQuantities(s.zh), s.en).toBeLessThanOrEqual(6)
      }
    })
    it('cites only in sources and in table cells of the numbers', () => {
      for (const f of CITED_FIELDS) for (const s of textsOf(l, f)) expect(CITATION.test(s.en) || CITATION.test(s.zh), `${f}: ${s.en.slice(0, 80)}`).toBe(false)
      for (const s of paragraphTexts(l.numbers!)) expect(CITATION.test(s.en) || CITATION.test(s.zh), s.en).toBe(false)
      // depth may be dense, but its provenance still belongs in `sources`
      for (const s of paragraphTexts(l.deeper ?? [])) expect(CITATION.test(s.en) || CITATION.test(s.zh), `deeper: ${s.en.slice(0, 80)}`).toBe(false)
    })
    it('fits the main path: the section budgets, the word window and the minutes ceiling', () => {
      const b = lessonBudget(l)
      expect(b.picture, 'why + outcomes + terms + picture').toBeLessThanOrEqual(BUDGETS.picture)
      expect(b.numbers, 'numbers').toBeLessThanOrEqual(BUDGETS.numbers)
      expect(b.practice, 'observe + tryThis + quiz').toBeLessThanOrEqual(BUDGETS.practice)
      expect(b.total).toBe(lessonWords(l))
      expect(lessonWords(l)).toBeGreaterThanOrEqual(BUDGETS.totalMin)
      // the point of the programme is that a track's first lesson is short
      expect(lessonWords(l)).toBeLessThanOrEqual(firstOfTrack(l) ? BUDGETS.openerMax : BUDGETS.totalMax)
      expect(lessonMinutes(l)).toBeLessThanOrEqual(BUDGETS.minutes)
    })
  })
}

/**
 * Step 5 review, rule-gap 5: one name per thing, across a whole track.
 *
 * Two drifts got through five batch reviews because each one is invisible inside a
 * single lesson and only shows up when the track is read end to end: `Mbps` against
 * `Mb/s` (nine uses in the two primer lessons, `Mb/s` in every later one), and a ZH
 * learner meeting the same actor as 站点 in one lesson and 终端 in the next. Both are
 * a grep, so they belong in the suite rather than in a reviewer's patience.
 *
 * Scope is the Wi-Fi track, because that is the track whose vocabulary sheet this is.
 */
describe('readability · one name per thing, across the Wi-Fi track', () => {
  const wifi = migrated.filter((l) => trackOf(l) === 'wifi')
  it.each(wifi.map((l) => [l.id, l] as const))('%s says Mb/s, and calls a station 站点', (_id, l) => {
    for (const s of lessonStrings(l)) {
      expect(/Mbps/.test(s.en) || /Mbps/.test(s.zh), `${l.id}: write Mb/s, not Mbps — "${s.en.slice(0, 60)}…"`).toBe(false)
      // 终端 is the ZH word Tier 1 settled against: roles-stack teaches 站点 and every
      // lesson after it has to keep calling the same actor by the same name.
      expect(/终端/.test(s.zh), `${l.id}: a station is 站点, not 终端 — "${s.zh.slice(0, 40)}…"`).toBe(false)
      // 模拟器 against 仿真器 (Tier 2 review, Minor 15): the tool has one ZH name.
      expect(/模拟器/.test(s.zh), `${l.id}: this tool is 仿真器, not 模拟器 — "${s.zh.slice(0, 40)}…"`).toBe(false)
    }
  })

  /**
   * Tier 2 review, Important 4: the access point had three names across Tier 2 and
   * they flipped lesson to lesson — "router" in one, "access point" in the next, a
   * bare "AP" in the Chinese of a third, while the node on screen said `AP`.
   *
   * The rule is the screen: a lesson may call it a router only where its own scene
   * labels that node `Router` (widthScenario, mumimoScenario). Everywhere else in
   * Tier 2 it is the access point, and in Chinese 接入点 — never a bare "AP", which a
   * beginner reading Chinese has to translate back before the sentence means anything.
   *
   * Scope is Wi-Fi Tier 2, which is the block this sheet was settled for; Tier 1
   * has its own bridge from "router" to "access point" in roles-stack.
   */
  const ROUTER_LABELLED = ['width', 'streams', 'mumimo']
  const tier2 = wifi.filter((l) => MODULES[l.module].tier === 1)
  it.each(tier2.map((l) => [l.id, l] as const))('%s calls the access point by the name on its own screen', (_id, l) => {
    for (const s of lessonStrings(l)) {
      if (!ROUTER_LABELLED.includes(l.id)) {
        expect(/\brouters?\b/i.test(s.en), `${l.id}: this scene labels the node AP — say access point — "${s.en.slice(0, 60)}…"`).toBe(false)
        expect(/路由器/.test(s.zh), `${l.id}: this scene labels the node AP — say 接入点 — "${s.zh.slice(0, 40)}…"`).toBe(false)
      }
      // One exception, added with the 2026-09-23 amendment: the name may ride in
      // brackets on the Chinese word, \u63a5\u5165\u70b9\uff08AP\uff09, which is the point of
      // rule 4: it lets a reader join \u63a5\u5165\u70b9 to the AP the log prints. Anywhere else
      // a bare AP is still a word the reader must translate back first.
      const bare = s.zh.replace(/\u63a5\u5165\u70b9\uff08[^\uff09]{0,12}AP[^\uff09]{0,12}\uff09/g, '\u63a5\u5165\u70b9')
      expect(/AP/.test(bare), `${l.id}: write \u63a5\u5165\u70b9 in Chinese, or \u63a5\u5165\u70b9\uff08AP\uff09 at first use`).toBe(false)
    }
  })
})

/**
 * Amendment A4: `needs` is the promise a lesson makes about what the reader
 * has already read, and until now nothing held the promise to what the picture
 * actually leans on. The acronym rule admits any earlier lesson of the track
 * by design — a one-line reminder is enough for a word met in passing — but a
 * picture section BUILT on another lesson's term ("An ellipse across the line
 * of sight", "the quality byte on each range") needs that lesson named.
 *
 * Scope, and why it is this and not wider:
 *  - per track, because a term's owner is the lesson of that track that
 *    glosses it, and `needs` may only name lessons of the same track;
 *  - only an owner EARLIER in COURSE_ORDER, because a lesson cannot need one
 *    that comes after it, and a word a lesson uses before any lesson claims it
 *    is being used in its everyday sense (uwb-intro's "round", "poll");
 *  - `picture` only, because that is where a reader is being taught rather
 *    than shown figures; `numbers` and `deeper` may lean forward (A7).
 */
describe('readability · needs is honest about what the picture leans on', () => {
  /** The first lesson of each track to gloss each term: its owner. */
  const owners = new Map<string, Map<string, string>>()
  for (const l of migrated) {
    const track = trackOf(l)
    if (!owners.has(track)) owners.set(track, new Map())
    const own = owners.get(track)!
    for (const t of l.terms!) if (!own.has(t.term.toLowerCase())) own.set(t.term.toLowerCase(), l.id)
  }
  /** Every lesson reachable from `id` through `needs`, transitively. */
  const closureOf = (id: string, acc = new Set<string>()): Set<string> => {
    for (const n of byId.get(id)?.needs ?? []) if (!acc.has(n)) { acc.add(n); closureOf(n, acc) }
    return acc
  }
  const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')

  it.each(migrated.map((l) => [l.id, l] as const))('%s', (_id, l) => {
    const own = owners.get(trackOf(l))!
    const reachable = closureOf(l.id).add(l.id)
    for (const p of paragraphTexts(l.picture!)) {
      for (const [term, ownerId] of own) {
        if (reachable.has(ownerId)) continue
        if (COURSE_ORDER.indexOf(ownerId) > COURSE_ORDER.indexOf(l.id)) continue
        // a whole word with an optional plural, as `firstTermUses` matches: "chips" is
        // `chip`, but "essentially" is no longer `ESS` (step 5 review, rule-gap 3)
        const re = new RegExp(`\\b${escapeRe(term)}(e?s)?\\b`, 'i')
        const hit = re.test(p.en) ? p.en : null
        expect(hit, `${l.id}: "${term}" is ${ownerId}'s word, and ${ownerId} is not in the needs closure — "${hit?.slice(0, 60)}…"`).toBe(null)
      }
    }
  })
})

/**
 * Amendment 2026-09-23, "mechanism before metaphor"
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md).
 *
 * The first contract asked every claim to be pinned by a test and every
 * acronym to be glossed, and it capped the main path at 1300 words. Nothing
 * in it asked that the reader be able to REDO the computation, and under the
 * cap the cheapest way to keep a claim was to compress its mechanism into a
 * pointer phrase — "plus 3 dB kept in hand", "that is head arithmetic",
 * 留在手里的 3 dB, 这笔账 — each of which points at something that is either
 * in `deeper` or nowhere. Three rules close that hole, on lessons revised to
 * the amendment; the list only grows.
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
 * Rule 1 — no pointer phrases. Each of these names a quantity by gesturing at
 * it rather than saying what it is; every one is taken from a sentence a
 * reader stopped at.
 */
const SHORTHAND: { re: RegExp; why: string }[] = [
  { re: /(?:dB|margin|\bspare\b)[^.]{0,24}in hand|in hand[^.]{0,16}(?:dB|margin)|留在手里|手里留|手里仍留|手里还留/, why: 'name the margin and its size instead' },
  { re: /head arithmetic|这笔账|那笔账/, why: 'write the arithmetic out as steps' },
  { re: /the bare requirement|不含余量的那个要求/, why: 'say which requirement, and what the margin was' },
  { re: /、之类|之类的|等等。|诸如此类/, why: 'list them, or drop the list' },
]

/**
 * Rule 2 — a quantity the reader is asked to use is glossed like an acronym:
 * it appears in the `terms` of this lesson or of an earlier one, term or plain
 * words, in either language. 余量 was used four times across Tier 1 and 2 and
 * defined nowhere.
 */
/**
 * Words a lesson uses without owning them: the reader sees them in the log and
 * in the inspector, so a lesson that pictures one of them names it where it
 * pictures it, however many lessons ago it was introduced.
 */
const BORROWED = ['MAC', 'PHY']

/**
 * The two actors every lesson pictures in plain words. Wherever a lesson first
 * says "the access point" / 接入点, it carries the name the log prints beside
 * it, so the reader can join the picture to the screen: 接入点（AP）.
 */
const STAND_INS: { name: string; en: RegExp; zh: RegExp }[] = [
  { name: 'AP', en: /access point/i, zh: /接入点/ },
  { name: 'STA', en: /\bstations?\b/i, zh: /站点/ },
]

const QUANTITIES: { name: string; re: RegExp }[] = [
  { name: 'margin', re: /\bmargins?\b|余量/ },
  { name: 'sensitivity', re: /\bsensitivit(?:y|ies)\b|灵敏度/ },
  { name: 'threshold', re: /\bthresholds?\b|门限/ },
  { name: 'noise floor', re: /\bnoise floors?\b|噪声地板/ },
]

/**
 * The `terms` a lesson may lean on for rule 2: its own, and those of the
 * lessons in the transitive closure of its `needs`.
 *
 * It used to be every earlier lesson in COURSE_ORDER, which made the rule
 * unfailable from lesson 3 onward — `decode-thresholds` alone puts margin,
 * sensitivity, threshold and noise floor into the pool, so every later lesson
 * inherited all four whether or not it had told the reader anything (Wi-Fi
 * track review, 2026-09-23: the third vacuous rule found in this suite).
 * `needs` is the honest boundary — what the lesson itself claims the reader
 * has read — and a separate test keeps `needs` honest.
 */
function glossTextUpTo(l: Lesson): string {
  const seen = new Set<string>()
  const walk = (x: Lesson): Lesson[] => {
    if (seen.has(x.id)) return []
    seen.add(x.id)
    const from = (x.needs ?? []).flatMap((id) => { const o = byId.get(id); return o ? walk(o) : [] })
    return [...from, x]
  }
  return walk(l)
    .filter((o) => !MIGRATING_NOW.includes(o.id))
    .flatMap((o) => (o.terms ?? []).flatMap((t) => [t.term, t.plain.en, t.plain.zh]))
    .join(' | ')
}

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

describe('readability · mechanism before metaphor', () => {
  const revised = migrated.filter((l) => MECHANISM_NOW.includes(l.id))

  it('grades every lesson the amendment has reached', () => {
    expect(revised.map((l) => l.id).sort()).toEqual(MECHANISM_NOW.filter((id) => !MIGRATING_NOW.includes(id)).sort())
  })

  it.each(revised.map((l) => [l.id, l] as const))('%s points at no quantity it has not named', (_id, l) => {
    for (const s of lessonStrings(l)) {
      for (const { re, why } of SHORTHAND) {
        const hit = re.exec(s.en) ?? re.exec(s.zh)
        expect(hit, `${l.id}: "${hit?.[0]}" — ${why} · ${s.en.slice(0, 60)}…`).toBeNull()
      }
    }
  })

  it.each(revised.map((l) => [l.id, l] as const))('%s glosses every quantity it asks the reader to use', (_id, l) => {
    const gloss = glossTextUpTo(l)
    const main = [l.why!, ...(l.outcomes ?? [])].concat(paragraphTexts(l.picture ?? []), paragraphTexts(l.numbers ?? []))
    for (const { name, re } of QUANTITIES) {
      const used = main.some((t) => re.test(t.en) || re.test(t.zh))
      if (!used) continue
      expect(re.test(gloss), `${l.id}: uses "${name}" on the main path but no terms table defines it`).toBe(true)
    }
  })

  it.each(revised.map((l) => [l.id, l] as const))('%s names each term where it pictures it', (_id, l) => {
    // The analogy and the name travel together: 几台跟它说话的设备（STA）, not one
    // paragraph of picture and the name three paragraphs later.
    const main = [l.why!, ...(l.outcomes ?? [])].concat(paragraphTexts(l.picture ?? []))
    const en = main.map((x) => x.en).join(' ')
    const zh = main.map((x) => x.zh).join(' ')
    // The lesson's own terms, and the words every lesson borrows without owning:
    // a reader meeting 几台跟它说话的设备 needs STA in the same breath, or the log
    // they are sent to look at is a different subject.
    const names = [...(l.terms ?? []).map((t) => t.term), ...BORROWED]
    // Collected, not asserted one by one: an `expect` per name stops at the
    // first failure, which sends an author back for one fix at a time while
    // the rest of the lesson's unnamed terms stay hidden behind it. A fix
    // round found five more waiting behind the six that were reported.
    const unnamed: string[] = []
    for (const name of names) {
      if (!namedInPlace(en, name)) unnamed.push(`${name} (en)`)
      if (!namedInPlace(zh, name)) unnamed.push(`${name} (zh)`)
    }
    for (const si of STAND_INS) {
      if (!namedAtStandIn(en, si.en, si.name)) unnamed.push(`${si.name} at "${si.en.source}" (en)`)
      if (!namedAtStandIn(zh, si.zh, si.name)) unnamed.push(`${si.name} at ${si.zh.source} (zh)`)
    }
    expect(unnamed, `${l.id}: named nowhere near the picture that introduces them`).toEqual([])
  })

  it.each(revised.map((l) => [l.id, l] as const))('%s writes its procedure out as steps', (_id, l) => {
    const steps = [...(l.picture ?? []), ...(l.numbers ?? [])].filter((b) => b.kind === 'steps')
    expect(steps.length, `${l.id}: a lesson that states a rule carries the rule as a steps block`).toBeGreaterThan(0)
    for (const b of steps) expect((b as Extract<Block, { kind: 'steps' }>).items.length).toBeGreaterThanOrEqual(3)
  })
})
