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
  zhTermName,
  paragraphTexts,
  zhChars,
  ZH_TERMS, ZH_TERMS_EXCLUDED, bracketedAtFirstZhUse, zhAkaViolations, zhTermFailure, type ZhTerm,
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
 * Step 5's tightened cell rules (rule-gaps 1 and 2 of
 * .superpowers/sdd/2026-09-22-course-readability-wifi/tier1-review.md) turned red on lessons
 * outside the wave that introduced them, and this list excused those ids until their own wave
 * reached the file.
 *
 * It is empty, and every id that was in it was fixed rather than re-excused: `edca` and `txop`
 * glossed their access-category short names in the cell (`VO (voice)` / `VO（语音）`);
 * `uwb-dstwr` and `uwb-blocks` glossed `Treply1` and `SP1`; `uwb-ul-tdoa` and
 * `uwb-mms-numbers` gave their English-only cells real Chinese halves, which is what takes a
 * cell out of the language-neutral set in the first place. Kept, empty, because the next
 * tightened rule will want it — and because an empty allow-list is a claim worth stating.
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
  // 余量 is the quantity; 剩余量/存余量 are ordinary words that contain it, and nav
  // was reworded once for a match inside 剩余量 before the rule learned the difference.
  { name: 'margin', re: /\bmargins?\b|(?<![剩存养])余量/ },
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
  // DIRECT needs, not the transitive closure. The closure was the second shape
  // this helper had, and it was vacuous too: uwb-intro needs frame-anatomy,
  // which needs roles-stack, which needs decode-thresholds — so every UWB
  // lesson inherited all four quantities from the one Wi-Fi lesson that made
  // the rule vacuous in the first place (UWB track review, 2026-09-23). A
  // quantity a lesson uses is glossed by that lesson or by one the reader was
  // told to read immediately before it; anything further back is a reminder
  // the lesson owes its reader itself.
  const pool = [l, ...(l.needs ?? []).flatMap((id) => byId.get(id) ?? [])]
  return pool
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
    // The Chinese arm, which graded only Latin tokens until the UWB track
    // review found it: a term whose gloss opens with its own Chinese name is
    // held to the same rule under that name.
    for (const t of l.terms ?? []) {
      const zhName = zhTermName(t.plain.zh)
      if (zhName && !namedInPlace(zh, zhName)) unnamed.push(`${zhName} (zh name of ${t.term})`)
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
 * What is graded, per lesson, is the reader's own order over `why`, `outcomes`,
 * `picture`, `numbers`, `observe`, `tryThis` and `quiz`. `deeper` and `sources`
 * are collapsed professional depth — `sources` is where the clause numbers and
 * the English names already live — and a language-neutral table cell
 * (`en === zh`) is left out because editing its Chinese half alone would break
 * that neutrality and move the English word count (inventory section 5).
 */
const zhMainTexts = (l: Lesson): L10n[] => [l.why!, ...(l.outcomes ?? [])]
  .concat(paragraphTexts(l.picture ?? []), cellTexts(l.picture ?? []))
  .concat(paragraphTexts(l.numbers ?? []), cellTexts(l.numbers ?? []))
  .concat(l.observe, l.tryThis, l.quiz.flatMap((q) => [q.q, ...q.options, q.explain]))

/** One joined Chinese string per lesson, in reading order: what "first use" is first in. */
const zhMainText = (l: Lesson): string => zhMainTexts(l).map((s) => s.zh).join(' ')

/**
 * Every failure of one lesson: the bracket arm, then the `aka` arm. Collected
 * rather than asserted term by term — an `expect` inside the loop stops a
 * lesson at its first failure and hides the rest, which has already cost this
 * programme one round trip (see the same note on the naming rule above).
 */
/**
 * The glossary rows graded in one lesson: all of them, minus the three whose
 * Chinese word means something else in the other track (`ZhTerm.track` says
 * which, and why each one is there).
 */
const zhTermsFor = (l: Lesson): ZhTerm[] => ZH_TERMS.filter((t) => !t.track || t.track === trackOf(l))

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
