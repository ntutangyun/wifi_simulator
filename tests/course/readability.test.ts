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
import { isMigrated, type L10n, type Lesson } from '../../src/course/lessonKit'
import {
  CITATION, KNOWN_WORDS, acronyms, definedInPlace, densityTexts, enWords, firstTermUses, lessonBudget,
  lessonStrings, numericQuantities, paragraphTexts, zhChars,
} from '../../src/course/readability'
import { effectiveMigrating } from './kit'

/** Lessons still in the old shape. Each migration task removes its ids; the list only shrinks. */
export const MIGRATING: string[] = [
  'radio-primer', 'decode-thresholds', 'roles-stack', 'frame-anatomy', 'airtime', 'ifs', 'backoff', 'nav', 'hidden', 'anomaly',
  'retries-queues', 'bianchi', 'bianchi-vs-sim', 'tier1-project', 'edca', 'ampdu', 'txop', 'txop-protect', 'width', 'streams', 'rate',
  'ofdma-dl', 'ofdma-ul', 'mumimo', 'mlo', 'amp-slots', 'amp-coexist', 'capstone',
  'uwb-aoa', 'uwb-mms',
]
/** Stands in for the `terms` of radio-primer and frame-anatomy until they migrate (then delete it: the test below insists). */
const TIER1_BASELINE = ['SINR', 'SNR', 'RSSI', 'MCS', 'OFDM', 'PPDU', 'MPDU', 'MSDU', 'FCS', 'BSS', 'BSSID', 'SSID', 'ACK', 'CRC', 'QOS', 'L-SIG', 'L-STF', 'L-LTF', 'U-SIG', 'HE', 'EHT', 'HT', 'VHT', 'SIFS', 'DIFS', 'NAV', 'CW', 'CCA', 'EIFS', 'RTS', 'CTS']
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
 * `NAV` and `CTS` with no legal owner once TIER1_BASELINE goes.
 */
function knownFor(l: Lesson): Set<string> {
  const known = new Set<string>([...KNOWN_WORDS, ...TIER1_BASELINE])
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
  it('TIER1_BASELINE exists only while radio-primer and frame-anatomy are unmigrated', () => {
    const stillOld = MIGRATING.includes('radio-primer') || MIGRATING.includes('frame-anatomy')
    expect(TIER1_BASELINE.length > 0).toBe(stillOld)
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
