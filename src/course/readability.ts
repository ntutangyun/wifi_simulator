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

/**
 * English words a learner reads in one bilingual string, for the length
 * budget. A language-neutral cell (`en === zh`: a counter value, a symbol, a
 * protocol name) counts ONE — it is a glance, not something read at 150 words
 * a minute — which is what the spec's "Length and pace" says counts.
 */
export const countedWords = (s: L10n): number => (s.en === s.zh ? 1 : enWords(s.en))

/**
 * English words a learner reads in anything a lesson field can hold: a string,
 * a block, a list of blocks, a quiz. The one walk behind `lessonWords` and
 * `lessonBudget`.
 *
 * Two things are not counted word by word, for the same reason: a
 * language-neutral cell and a formula body are read at a glance, so each
 * counts one. A `Term`'s own word counts — the "New words" table is read.
 */
export function wordsIn(x: unknown): number {
  if (x == null || typeof x === 'function') return 0
  if (Array.isArray(x)) return x.reduce<number>((n, v) => n + wordsIn(v), 0)
  if (typeof x !== 'object') return 0
  const o = x as Record<string, unknown>
  if (typeof o.en === 'string' && typeof o.zh === 'string') return countedWords(o as unknown as L10n)
  let n = 0
  // A formula's body is one glance whatever language its units are in; its
  // heading and its note are prose and are walked like anything else.
  if (o.kind === 'formula' && o.text !== undefined) n += 1
  if (typeof o.term === 'string' && o.plain !== undefined) n += enWords(o.term)
  for (const [k, v] of Object.entries(o)) {
    if (k === 'scenario' || k === 'find') continue
    if (k === 'text' && o.kind === 'formula') continue
    n += wordsIn(v)
  }
  return n
}

/**
 * The main path's word count, section by section: the spec's "Length and pace"
 * budgets, which sum to the total. `deeper` and `sources` are never counted —
 * the stated minutes are the minutes of the main path.
 */
export interface LessonBudget {
  /** `why` + `outcomes` + `terms` + `picture`: everything before "Now the numbers". ≤ 650. */
  picture: number
  /** `numbers`. ≤ 350. */
  numbers: number
  /** `observe` + `tryThis` + `quiz`: what the reader does at the simulator. ≤ 400. */
  practice: number
  /** All three, plus an unmigrated lesson's flat `body`. 500–1300; ≤ 1000 for a track's first lesson. */
  total: number
}

/** The four counts of {@link LessonBudget}: the contract test, the lesson tests and the dump share them. */
export function lessonBudget(l: Partial<Lesson>): LessonBudget {
  const picture = wordsIn([l.why, l.outcomes, l.terms, l.picture])
  const numbers = wordsIn(l.numbers)
  const practice = wordsIn([l.observe, l.tryThis, l.quiz])
  // The old flat shape has no sections, so it lands in the total alone.
  return { picture, numbers, practice, total: picture + numbers + practice + wordsIn(l.body) }
}

/**
 * The paragraphs the density rule measures: `paragraphTexts` without the items
 * of a `steps` block. An ordered recap — "SYNC, then SFD, then the stamp" — is
 * exempt from the density cap by the spec, and is the shape a pile-up should
 * be rewritten into; the citation rule still reads every one of its items.
 */
export function densityTexts(blocks: Block[]): L10n[] {
  return blocks.flatMap((b) => (b.kind === 'steps'
    ? (b.heading ? [b.heading] : [])
    : paragraphTexts([b])))
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')

/**
 * Whether a paragraph of `numbers` defines an acronym as it uses it, which the
 * spec exempts from the acronym rule ("its window exponent ACWE").
 *
 * The rule, stated so an author can hit it deliberately: the token is exempt
 * when, in EITHER language of the same paragraph, it is
 *   - written inside parentheses, which is how a name introduces its own
 *     short form — "Single-sided two-way ranging (SS-TWR)", "（SS-TWR）";
 *   - followed by a parenthesis opening a gloss — `ACWE (the window exponent)`;
 *   - preceded by a determiner and one to four lower-case words naming it:
 *     "its window exponent ACWE", "the scrambled timestamp sequence STS".
 * The two languages share one verdict because they are one sentence written
 * twice: a half that spells the word out has introduced it for either reader.
 */
export function definedInPlace(p: L10n, token: string): boolean {
  const t = escapeRe(token)
  const parenthesised = new RegExp(`[(（]\\s*${t}\\s*[)）]`)
  const gloss = new RegExp(`${t}\\s*[(（]`, 'i')
  const spelledOut = new RegExp(`\\b(?:[Tt]he|[Ii]ts|[Tt]heir|[Tt]his|[Aa]n?)\\s+(?:[a-z]+\\s+){1,4}${t}\\b`)
  const defines = (s: string): boolean => parenthesised.test(s) || gloss.test(s) || spelledOut.test(s)
  return defines(p.en) || defines(p.zh)
}

/**
 * Which of a lesson's `terms` make their first appearance in each paragraph of
 * the picture, in reading order: the density rule's "at most two of a lesson's
 * terms in one paragraph" counts the entries of each list.
 *
 * A term is matched as a word prefix, ignoring case, so "chips" introduces
 * `chip` and "tags" introduces `tag` — the reader meets the word, not the
 * singular.
 */
export function firstTermUses(blocks: Block[], terms: readonly string[]): string[][] {
  const seen = new Set<string>()
  return densityTexts(blocks).map((p) => {
    const fresh: string[] = []
    for (const term of terms) {
      if (seen.has(term)) continue
      const re = new RegExp(`\\b${escapeRe(term)}`, 'i')
      if (re.test(p.en) || re.test(p.zh)) { seen.add(term); fresh.push(term) }
    }
    return fresh
  })
}
