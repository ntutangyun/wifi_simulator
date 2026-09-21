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
  CITATION, KNOWN_WORDS, LOG_NAMES, acronyms, cellTexts, definedInPlace, densityTexts, enWords,
  firstTermUses, lessonBudget, lessonStrings, numericQuantities, paragraphTexts, zhChars,
} from '../../src/course/readability'
import { effectiveMigrating } from './kit'

/** Lessons still in the old shape. Each migration task removes its ids; the list only shrinks. */
export const MIGRATING: string[] = [
    
  'txop-protect', 'rate',
  'ofdma-dl', 'ofdma-ul', 'mumimo', 'mlo', 'amp-slots', 'amp-coexist', 'capstone',
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
    it('fits the main path: the section budgets, 500–1300 words, at most 20 minutes', () => {
      const b = lessonBudget(l)
      expect(b.picture, 'why + outcomes + terms + picture').toBeLessThanOrEqual(650)
      expect(b.numbers, 'numbers').toBeLessThanOrEqual(350)
      expect(b.practice, 'observe + tryThis + quiz').toBeLessThanOrEqual(400)
      expect(b.total).toBe(lessonWords(l))
      expect(lessonWords(l)).toBeGreaterThanOrEqual(500)
      // the point of the programme is that a track's first lesson is short
      expect(lessonWords(l)).toBeLessThanOrEqual(firstOfTrack(l) ? 1000 : 1300)
      expect(lessonMinutes(l)).toBeLessThanOrEqual(20)
    })
  })
}

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
        // a word prefix, as `firstTermUses` matches: "chips" is `chip`
        const re = new RegExp(`\\b${escapeRe(term)}`, 'i')
        const hit = re.test(p.en) ? p.en : null
        expect(hit, `${l.id}: "${term}" is ${ownerId}'s word, and ${ownerId} is not in the needs closure — "${hit?.slice(0, 60)}…"`).toBe(null)
      }
    }
  })
})
