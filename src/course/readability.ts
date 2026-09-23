/**
 * The readability rules of the lesson contract, as pure functions over text.
 *
 * `tests/course/readability.test.ts` enforces the contract of
 * docs/superpowers/specs/2026-09-21-course-readability-design.md with these;
 * they live in src/ rather than in the test so that a future authoring tool
 * (a word counter, an acronym linter) speaks exactly the same rules the test
 * does, and so each rule can be pinned on its own.
 */
import { FRAME_KINDS } from '../model/frames'
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
  // Wi-Fi generation labels: product names a learner meets on a box (Wi-Fi 4/5/6/7), not
  // terms any lesson has to introduce. Ruling 3 of plans/2026-09-22-course-readability-wifi.
  'HT', 'VHT', 'HE', 'EHT',
  // Units. They only became visible to `acronyms()` when the tokenizer
  // learned mixed-case tails, and a frequency is not a word to introduce.
  'MHZ', 'GHZ', 'KHZ',
])

/**
 * The names the log prints for a frame — `NBPOLL`, `UWBRSF`, `UWBBLINK` — which
 * a reader reads off the screen rather than out of the standard, and which are
 * therefore no more a word to introduce than `TX_START` is. The list is the
 * engine's own `FRAME_KINDS`, upper-cased exactly as `src/ui/format.ts` prints
 * it, so a kind added to the engine is exempt the moment it exists rather than
 * when somebody remembers to type it here. A record type (`UWB_TS`) carries an
 * underscore and is already exempt.
 */
export const LOG_NAMES: ReadonlySet<string> = new Set(FRAME_KINDS.map((k) => k.toUpperCase()))

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

/**
 * A token that opens on a capital and may carry a mixed-case tail, hyphenated
 * parts included: STS, SFD, A-MPDU, L-SIG, and also TDoA, AoA, FoM, DL-TDoA,
 * MHz. The all-capitals form of the pattern read `DL-TDoA` as the bare `DL`
 * and could not see `AoA` at all, so a whole family of the course's own words
 * — the ones with a lower-case tail — was outside the acronym rule.
 *
 * A hyphen only continues the token when the part after it opens on a capital
 * or a digit, so `CTS-to-self` is the acronym `CTS` followed by two English
 * words, while `DL-TDoA` and `A-MPDU` are each one word to introduce.
 *
 * A match is only an acronym when {@link ACRONYM_CAPS} holds: see there.
 */
const ACRONYM = /\b[A-Z][A-Za-z0-9]*(?:-[A-Z0-9][A-Za-z0-9]*)*\b/g

/**
 * How many capitals or digits a token must hold to be an acronym rather than
 * an ordinary capitalised word. Two: `The`, `Poll`, `Final` and `Response` are
 * words a reader knows; `TDoA`, `AoA`, `FoM`, `MHz` and `DL-TDoA` are not.
 */
const ACRONYM_CAPS = 2

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
    if ((m[0].match(/[A-Z0-9]/g) ?? []).length < ACRONYM_CAPS) continue
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
 * The table cells of a set of blocks that a learner reads as language: the
 * ones whose two halves differ. A language-neutral cell (`en === zh`) is a log
 * line, a counter value or a symbol — a glance rather than a sentence, and the
 * one place the contract lets provenance stand — so it is left out here for
 * the same reason `paragraphTexts` leaves every cell out of the citation rule.
 *
 * The acronym rule reads these: `GDOP 1.06` in a cell is a word the learner
 * meets whether or not the sentence around it is prose.
 */
export function cellTexts(blocks: Block[]): L10n[] {
  const out: L10n[] = []
  for (const b of blocks) {
    if (b.kind !== 'table') continue
    for (const c of [...b.head, ...b.rows.flat()]) if (c.en !== c.zh) out.push(c)
  }
  return out
}

/**
 * The other half of {@link cellTexts}: the table cells whose two halves are
 * IDENTICAL. The contract calls these language-neutral — a counter value, a
 * symbol, a protocol or log name — and renders the one string to both readers.
 *
 * Step 5's review found two rules leaking through that exemption, so they now
 * read these cells too (`tests/course/readability.test.ts`):
 *  - a neutral cell must actually be neutral. `N('1400 B of video')` and
 *    `N('4,990 overlaps → 2,713 retries')` are English sentences printed
 *    verbatim into a Chinese table, which is the B2/B6 defect class.
 *  - a word met in one is still a word met: `BPSK 1/2` in a main-path table
 *    has to be glossed somewhere in that section, exactly as `GDOP 1.06` in a
 *    bilingual cell already had to be.
 */
export function neutralCellTexts(blocks: Block[]): L10n[] {
  const out: L10n[] = []
  for (const b of blocks) {
    if (b.kind !== 'table') continue
    for (const c of [...b.head, ...b.rows.flat()]) if (c.en === c.zh) out.push(c)
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
  /** `why` + `outcomes` + `terms` + `picture`: everything before "Now the numbers". */
  picture: number
  /** `numbers`. */
  numbers: number
  /** `observe` + `tryThis` + `quiz`: what the reader does at the simulator. */
  practice: number
  /** All three, plus an unmigrated lesson's flat `body`. */
  total: number
}

/**
 * The length budget, in the English words `lessonWords` counts.
 *
 * Raised 2026-09-23 (spec amendment "Mechanism before metaphor"): under the
 * first ceiling — 1300 words, 20 minutes — the cheapest way to keep a claim
 * inside the budget was to compress its mechanism into a pointer phrase ("plus
 * 3 dB kept in hand", "that is head arithmetic"), which is exactly the reading
 * failure the programme exists to prevent. Explaining costs words, so the
 * ceiling pays for it; a lesson that still does not fit splits.
 */
export const BUDGETS = {
  /** `why` + `outcomes` + `terms` + `picture`. */
  picture: 900,
  /** `numbers`, where the procedures live. */
  numbers: 550,
  /** `observe` + `tryThis` + `quiz`. */
  practice: 450,
  /** Main path, floor and ceiling. */
  totalMin: 500,
  totalMax: 1800,
  /** A track's first lesson stays short: the point of the programme. */
  openerMax: 1000,
  /** `lessonMinutes`, which counts reading plus time at the simulator. */
  minutes: 30,
} as const

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
 * A term is matched as a WHOLE word with an optional plural, ignoring case, so
 * "chips" introduces `chip` and "tags" introduces `tag` — the reader meets the
 * word, not the singular. It used to be a bare prefix, which made `DS` match
 * "dso…" and `ESS` match "essentially" (step 5 review, rule-gap 3); the plural
 * tail is what a prefix was there for in the first place.
 */
export function firstTermUses(blocks: Block[], terms: readonly string[]): string[][] {
  const seen = new Set<string>()
  return densityTexts(blocks).map((p) => {
    const fresh: string[] = []
    for (const term of terms) {
      if (seen.has(term)) continue
      const re = new RegExp(`\\b${escapeRe(term)}(e?s)?\\b`, 'i')
      if (re.test(p.en) || re.test(p.zh)) { seen.add(term); fresh.push(term) }
    }
    return fresh
  })
}

/**
 * Naming markers: the ways a sentence can name the thing it has just pictured
 * without parentheses — "这一级，就是 MCS", "that is the BSS".
 */
const NAMING = /就是|叫做|叫作|称为|名叫|即|这就是|名字是|is called|are called|known as|we call|the name for|(?:is|are)\s+(?:an?|the)?\s*$|[—–]\s*(?:an?|the)?\s*$/i

/**
 * Whether a term is NAMED where it is pictured (amendment of 2026-09-23).
 *
 * A reader meets "几台跟它说话的设备" and has no way to connect it to the STA
 * they will see in the log, unless the sentence carries the name at that spot:
 * either in parentheses — 几台跟它说话的设备（STA）— or with a naming clause.
 * The check is on the FIRST use in a text; later uses are just the word.
 *
 * A term that does not appear in the text at all is vacuously fine: this rule
 * is about how a name is introduced, not about where it must appear.
 */
export function namedInPlace(text: string, term: string): boolean {
  // `\\b`, not `\b`: inside a template literal `\b` is the backspace character,
  // which matches nothing — the rule graded vacuously until this was fixed.
  // A word boundary is also meaningless between CJK characters, so a Chinese
  // name is matched literally; without this the Chinese half of the rule sees
  // only the Latin acronyms and passes everything else (UWB track review,
  // 2026-09-23: 14 of 18 lessons had terms the Chinese arm never graded).
  const cjk = new RegExp(CJK.source).test(term) // CJK carries /g/; a fresh one is stateless
  const re = cjk ? new RegExp(escapeRe(term)) : new RegExp(`\\b${escapeRe(term)}\\b`, 'i')
  const m = re.exec(text)
  if (!m) return true
  const before = text.slice(Math.max(0, m.index - 28), m.index)
  // An open bracket that has not closed yet: "(the SSID", （接入点，AP.
  if (/[（(][^）)]{0,30}$/.test(before)) return true
  // Or the gloss follows the name instead of preceding it: "the MAC — the part
  // of the radio that decides when to send —", DS（分发系统）.
  if (/^\s*[—–(（]/.test(text.slice(m.index + m[0].length, m.index + m[0].length + 6))) return true
  return NAMING.test(before)
}

/**
 * Whether a plain-words stand-in carries its name where it first appears:
 * 几台跟它说话的设备（STA）, "one box everyone talks to (the access point, AP)".
 *
 * `standIn` is the everyday phrase a lesson uses for the thing; `name` is what
 * the log, the inspector and the standard call it. The reader has to join the
 * two, and the place to join them is the first sentence that pictures the
 * thing — not a glossary three screens away.
 */
export function namedAtStandIn(text: string, standIn: RegExp, name: string): boolean {
  const m = new RegExp(standIn.source, standIn.flags.replace(/g/g, '')).exec(text)
  if (!m) return true
  // The parenthesis may open before the stand-in — "(the access point, AP)" —
  // or after it — 接入点（AP）— so the window starts a little ahead of the match.
  const window = text.slice(Math.max(0, m.index - 10), m.index + m[0].length + 24)
  return new RegExp(`[（(][^）)]{0,28}\\b${escapeRe(name)}\\b`).test(window)
}

/**
 * The Chinese name a term's plain-words gloss opens with, when it has one:
 * `灵敏度：某一级还能被解出来的最弱到达功率` → `灵敏度`.
 *
 * The naming rule is written about the lesson, not about its English half, but
 * a `Term`'s `term` is one string shared by both languages — usually the Latin
 * acronym — so the Chinese arm had nothing to look for and passed every term
 * it could not find. A Chinese gloss that opens with its own name gives the
 * rule the handle it needs; one that does not is not graded, which is the
 * conservative direction.
 */
export function zhTermName(plainZh: string): string | null {
  const m = /^([㐀-䶿一-鿿]{2,8})[：:]/.exec(plainZh.trim())
  return m ? m[1]! : null
}
