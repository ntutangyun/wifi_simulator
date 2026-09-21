/**
 * The readability rules of the lesson contract, as pure functions over text.
 *
 * `tests/course/readability.test.ts` enforces the contract of
 * docs/superpowers/specs/2026-09-21-course-readability-design.md with these;
 * they live in src/ rather than in the test so that a future authoring tool
 * (a word counter, an acronym linter) speaks exactly the same rules the test
 * does, and so each rule can be pinned on its own.
 */
import type { Block, L10n, Lesson } from './lessonKit'

/**
 * Acronyms and everyday words a reader is assumed to know before lesson one:
 * units, the two ends of a Wi-Fi link, and words any engineer meets outside
 * this course. Everything else must be introduced by a lesson's `terms`.
 * Upper-case, because `acronyms()` returns upper-case tokens.
 *
 * `I` and `A` are never consulted, because `acronyms()` drops single
 * characters before any lookup. They are kept so that this reads as the whole
 * list of words a reader is assumed to know, rather than that list minus the
 * two that happen to be one letter long.
 */
export const KNOWN_WORDS: ReadonlySet<string> = new Set([
  'WI-FI', 'AP', 'STA', 'MAC', 'PHY', 'DB', 'DBM', 'ID', 'RF', 'OK',
  'CPU', 'IOT', 'GPS', 'USB', 'TX', 'RX', 'US', 'EU', 'CN', 'LED',
  'PC', 'TV', 'QR', 'I', 'A', 'AM', 'PM',
])

/**
 * A protocol's name, which is neither an acronym to introduce nor a quantity
 * to count: "802.11bp", "P802.15.4ab", "Wi-Fi 7", "Bluetooth 5.4". Removed
 * from the text before the other rules look at it.
 */
export const PROTOCOL_NAME = /(?:P?802\.1[15](?:\.\d)?[a-z]*|Wi-Fi\s?\d|Bluetooth\s?\d(?:\.\d)?)/g

/**
 * Provenance: a clause, a draft or contribution number, or a statement that a
 * value is the simulator's choice rather than the standard's. Belongs in
 * `sources` and in table cells of `numbers` — nowhere else.
 */
export const CITATION = /§|\bClause\b|IEEE Std|\bP802\.|\b1[15]-2\d\/\d{3,4}(?:r\d+)?\b|\bPM-\d|\bD[01]\.\d\b|\bdraft\b|\bTBD\b|model choice|草案|标准正文|模型取值/i

/** Upper-case tokens, hyphenated parts included: STS, SFD, A-MPDU, L-SIG. */
const ACRONYM = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*\b/g

/**
 * A digit group: a number, its decimals and its thousands separators. A space
 * only continues the group when what follows is a three-digit group, so the
 * typographic thousands of "1 065.7" and "336 207 494 656" count once, while
 * "16 µs, 8 slots" counts twice.
 */
const QUANTITY = /\d(?:[\d,.]|\s(?=\d{3}\b))*/g

/** CJK ideographs — the characters a Chinese paragraph is measured in. */
const CJK = /[㐀-䶿一-鿿]/g

const withoutProtocolNames = (text: string): string => text.replace(PROTOCOL_NAME, ' ')

/**
 * Every acronym the reader has to already know to follow this text, in order
 * of first use and without repeats. Protocol names are not acronyms, and
 * neither are the UI's own record names (`TX_START`), which the reader reads
 * off the screen rather than out of the standard.
 *
 * There is deliberately no upper bound on a token's length. The spec's phrase
 * is "a token of 2–6 upper-case letters/digits", but its own worked example of
 * a word that must be introduced is RMARKER, which is seven; a ceiling would
 * wave through exactly the terms this rule exists to catch.
 */
export function acronyms(text: string): string[] {
  const out: string[] = []
  for (const m of withoutProtocolNames(text).matchAll(ACRONYM)) {
    const token = m[0].toUpperCase()
    // The last two conditions cannot fire against ACRONYM as it stands (its
    // class holds no `_`, and a match always opens on a letter). They are kept
    // as the record-name and bare-number rules in executable form, so that
    // widening ACRONYM later cannot silently start reporting `TX_START`.
    if (token.length < 2 || token.includes('_') || /^[\d-]+$/.test(token)) continue
    if (!out.includes(token)) out.push(token)
  }
  return out
}

/** How many numeric quantities a text carries; a protocol's name is not one. */
export function numericQuantities(text: string): number {
  return withoutProtocolNames(text).match(QUANTITY)?.length ?? 0
}

/** English words, whitespace-separated. */
export function enWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

/** Chinese characters; Latin letters and punctuation do not count. */
export function zhChars(text: string): number {
  return text.match(CJK)?.length ?? 0
}

/**
 * The running prose of a set of blocks, in reading order: what the word and
 * citation rules measure. A heading and the items of a list or a set of steps
 * are prose like any other — a citation or an unintroduced acronym hides in
 * them just as well as in a paragraph.
 *
 * Only two things are left out, and for the same reason: table cells and
 * formula bodies are where the exact values live, and (inside `numbers`) a
 * table cell is the one place the contract allows provenance.
 */
export function paragraphTexts(blocks: Block[]): L10n[] {
  const out: L10n[] = []
  for (const b of blocks) {
    if (b.heading) out.push(b.heading)
    switch (b.kind ?? 'p') {
      case 'p':
      case 'watch':
        out.push((b as Extract<Block, { kind?: 'p' }>).text)
        break
      case 'list':
      case 'steps':
        out.push(...(b as Extract<Block, { kind: 'list' }>).items)
        break
      case 'formula': {
        const note = (b as Extract<Block, { kind: 'formula' }>).note
        if (note) out.push(note)
        break
      }
      case 'widget': {
        const caption = (b as Extract<Block, { kind: 'widget' }>).caption
        if (caption) out.push(caption)
        break
      }
      default:
        // `table`: the cells are the values, and the "where" column is where
        // the provenance of the numbers is allowed to be written down.
        break
    }
  }
  return out
}

/**
 * Every bilingual string a learner can read in a lesson: the one walk that all
 * the per-lesson tests and the contract test share, so a field added to the
 * contract is covered everywhere the moment it is added here.
 *
 * Walked: `why`, `outcomes`, `terms` (the `plain` line of each — the `term`
 * itself is the standard's own spelling and carries no translation),
 * `picture`, `numbers`, `deeper`, `sources`, `observe`, `tryThis` and `quiz`,
 * including table cells, formula bodies and quiz options, because a learner
 * reads those too. `scenario` and `find` are skipped: they are functions of
 * the engine, not text.
 *
 * `title`, `variants[].label` and `jumps[].label` are deliberately outside it —
 * they are the chrome around a lesson rather than the lesson — so a caller
 * that wants them appends them to the result itself.
 *
 * It takes a `Partial<Lesson>` so a caller can ask for one field at a time,
 * `lessonStrings({ picture })`, which is how the citation rule is applied
 * field by field.
 */
export function lessonStrings(l: Partial<Lesson>): L10n[] {
  const out: L10n[] = []
  const walk = (x: unknown): void => {
    if (x == null || typeof x === 'function') return
    if (Array.isArray(x)) { x.forEach(walk); return }
    if (typeof x !== 'object') return
    const o = x as Record<string, unknown>
    if (typeof o.en === 'string' && typeof o.zh === 'string') { out.push(o as unknown as L10n); return }
    for (const [k, v] of Object.entries(o)) if (k !== 'scenario' && k !== 'find') walk(v)
  }
  walk({
    why: l.why, outcomes: l.outcomes, terms: l.terms, picture: l.picture, numbers: l.numbers,
    deeper: l.deeper, sources: l.sources, observe: l.observe, tryThis: l.tryThis, quiz: l.quiz,
  })
  return out
}
