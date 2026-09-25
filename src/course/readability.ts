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
import type { Block, Lesson } from './lessonKit'

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
export function paragraphTexts(blocks: Block[]): string[] {
  const out: string[] = []
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
export function cellTexts(blocks: Block[]): string[] {
  const out: string[] = []
  for (const b of blocks) {
    if (b.kind !== 'table') continue
    // A cell with Chinese in it is a cell read as language. It used to be the cell
    // whose two halves differed; with one string left, the Chinese is the test.
    for (const c of [...b.head, ...b.rows.flat()]) if (HAS_CJK.test(c)) out.push(c)
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
export function neutralCellTexts(blocks: Block[]): string[] {
  const out: string[] = []
  for (const b of blocks) {
    if (b.kind !== 'table') continue
    for (const c of [...b.head, ...b.rows.flat()]) if (!HAS_CJK.test(c)) out.push(c)
  }
  return out
}

/** Chinese in a string: what a cell being read as language now looks like. */
const HAS_CJK = /[㐀-䶿一-鿿]/

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
export function lessonStrings(l: Partial<Lesson>): string[] {
  const out: string[] = []
  const walk = (x: unknown): void => {
    if (x == null || typeof x === 'function') return
    if (typeof x === 'string') { out.push(x); return }
    if (Array.isArray(x)) { x.forEach(walk); return }
    if (typeof x !== 'object') return
    const o = x as Record<string, unknown>
    for (const [k, v] of Object.entries(o)) if (!NOT_PROSE.has(k)) walk(v)
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
export const countedWords = (s: string): number => enWords(s)

/**
 * Keys of a lesson object that hold a string which is not prose a learner reads:
 * a block's discriminant, a widget's name and its preset controls, and a
 * `Term`'s own word (the standard's own spelling, counted by `wordsIn` itself).
 * With `L10n` gone, a walk that did not skip these would read them as text.
 */
const NOT_PROSE = new Set(['scenario', 'find', 'kind', 'widget', 'params', 'term'])

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
  if (typeof x === 'string') return countedWords(x)
  if (Array.isArray(x)) return x.reduce<number>((n, v) => n + wordsIn(v), 0)
  if (typeof x !== 'object') return 0
  const o = x as Record<string, unknown>
  let n = 0
  // A formula's body is one glance whatever language its units are in; its
  // heading and its note are prose and are walked like anything else.
  if (o.kind === 'formula' && o.text !== undefined) n += 1
  if (typeof o.term === 'string' && o.plain !== undefined) n += enWords(o.term)
  for (const [k, v] of Object.entries(o)) {
    if (NOT_PROSE.has(k)) continue
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
export function densityTexts(blocks: Block[]): string[] {
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
export function definedInPlace(p: string, token: string): boolean {
  const t = escapeRe(token)
  const parenthesised = new RegExp(`[(（]\\s*${t}\\s*[)）]`)
  const gloss = new RegExp(`${t}\\s*[(（]`, 'i')
  const spelledOut = new RegExp(`\\b(?:[Tt]he|[Ii]ts|[Tt]heir|[Tt]his|[Aa]n?)\\s+(?:[a-z]+\\s+){1,4}${t}\\b`)
  const defines = (s: string): boolean => parenthesised.test(s) || gloss.test(s) || spelledOut.test(s)
  return defines(p)
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
      if (re.test(p)) { seen.add(term); fresh.push(term) }
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

/* ------------------------------------------------------------------------- *
 * Every official term carries its English name in the Chinese
 * (.superpowers/sdd/2026-09-23-mechanism-before-metaphor/zh-term-inventory.md)
 * ------------------------------------------------------------------------- */

/**
 * A glossary row: the Chinese name as the course must write it, the standard
 * English name, the standard abbreviation where one exists, and the
 * alternative renderings the course must NOT use.
 *
 * `zh` is absent for the terms the standard never gives a Chinese name and the
 * course only ever prints as an acronym (`MSDU`, `RMARKER`, `L-SIG`): there the
 * shape is the acronym outside the bracket and its English expansion inside.
 */
export interface ZhTerm {
  /** The Chinese name; absent for an acronym-only term. */
  zh?: string
  /** The standard English name, or the expansion of an acronym-only term. */
  en: string
  /** The standard abbreviation, where the standard has one. */
  abbr?: string
  /**
   * Renderings of the same term the course uses somewhere and must stop using
   * — section 3 of the inventory, made machine-checkable. Only the twelve
   * inconsistencies that document found are listed: an `aka` invented here
   * would be a naming decision dressed up as a lint.
   */
  aka?: readonly string[]
  /**
   * The track whose lessons this row is graded in, when the same Chinese word
   * means something else in the other track. Only three rows need it, and each
   * was a false positive the first corpus run found:
   *  - 时隙 is the Wi-Fi `slot time`; in the UWB track it is the **ranging**
   *    slot (its own row), and demanding `（slot time）` there taught the wrong
   *    term in 15 lessons;
   *  - 标签 is the UWB `tag`; in the Wi-Fi track it is a sticky label in an
   *    analogy (frame-anatomy) and the label above a node in the UI (ifs);
   *  - 重叠 is the UWB band `overlap`; in the Wi-Fi track it is what two
   *    colliding frames do to each other (backoff, bianchi).
   * A row without a track is graded in every lesson.
   */
  track?: 'wifi' | 'uwb'
}

/**
 * The official IEEE 802.11 / 802.15.4 terms of the course, from sections
 * 2.1–2.5 of the inventory. `zh` is the TARGET rendering, which for a
 * kind-(c) term (one the course prints only as a bare acronym) is the Chinese
 * name the fix wave has to write; until it is written the row is reported by
 * the abbreviation arm, or by the corpus-wide coverage test, and both are the
 * fix wave's work order rather than a bug in this table.
 *
 * Deliberately NOT here:
 *  - section 2.6 (see {@link ZH_TERMS_EXCLUDED});
 *  - `LLC`, `EMLSR`, `RD`: named only in `deeper`, which this rule does not
 *    read, so a row for them could never be graded;
 *  - `Coffs`: the simulator's own field name for the standard's ranging
 *    tracking offset, so it is a naming note, not a term to bracket;
 *  - the standard's message names (`Poll` / `Response` / `Final` / `Report`,
 *    `NB Poll` …), `SP0…SP3`, `ARC IE` / `RDM IE`, `Address 2` / `3` and
 *    `SA` / `DA`: each is a list the course already prints in the standard's
 *    own spelling, so there is no English name missing from it.
 */
export const ZH_TERMS: readonly ZhTerm[] = [
  // --- 2.1 PHY and link budget ---
  { zh: '接收信号强度指示', en: 'received signal strength indicator', abbr: 'RSSI' },
  { zh: '信噪比', en: 'signal-to-noise ratio', abbr: 'SNR' },
  { zh: '信干噪比', en: 'signal-to-interference-plus-noise ratio', abbr: 'SINR' },
  { zh: '噪声地板', en: 'noise floor', aka: ['底噪', '器声地板'] },
  { zh: '路径损耗', en: 'path loss' },
  { zh: '发射功率', en: 'transmit power' },
  { zh: '灵敏度', en: 'sensitivity' },
  { zh: '调制与编码方式', en: 'modulation and coding scheme', abbr: 'MCS' },
  { zh: '正交频分复用', en: 'orthogonal frequency-division multiplexing', abbr: 'OFDM' },
  { zh: '子载波', en: 'sub-carrier' },
  { zh: '符号', en: 'symbol' },
  { zh: '空闲信道评估', en: 'clear channel assessment', abbr: 'CCA' },
  { zh: '能量检测', en: 'energy detection', abbr: 'ED' },
  { zh: '前导检测', en: 'preamble detection' },
  { zh: '调制', en: 'modulation' },
  { zh: '编码率', en: 'coding rate' },
  { en: 'binary phase-shift keying', abbr: 'BPSK' },
  { en: 'quadrature phase-shift keying', abbr: 'QPSK' },
  { en: 'quadrature amplitude modulation', abbr: 'QAM' },
  { zh: '前导码', en: 'preamble', aka: ['前导'] },
  { en: 'legacy short training field', abbr: 'L-STF' },
  { en: 'legacy long training field', abbr: 'L-LTF' },
  { en: 'legacy signal field', abbr: 'L-SIG' },
  { en: 'universal signal field', abbr: 'U-SIG' },
  { zh: '服务字段', en: 'SERVICE field' },
  { zh: '尾比特', en: 'tail bits' },
  { zh: '填充', en: 'padding' },
  { zh: '空口时间', en: 'airtime' },
  { zh: '信道带宽', en: 'channel width' },
  { zh: '空间流', en: 'spatial stream' },
  { zh: '天线', en: 'antenna' },
  { zh: '波束成形', en: 'beamforming' },
  { zh: '探测', en: 'channel sounding' },
  { zh: '强制速率', en: 'mandatory rate' },
  { zh: '控制回应速率', en: 'control response rate' },
  { zh: '等效全向辐射功率', en: 'equivalent isotropically radiated power', abbr: 'EIRP' },

  // --- 2.2 roles, frames, addressing ---
  { zh: '站点', en: 'station', abbr: 'STA' },
  { zh: '接入点', en: 'access point', abbr: 'AP' },
  { zh: '媒体访问控制', en: 'medium access control', abbr: 'MAC' },
  { zh: '物理层', en: 'physical layer', abbr: 'PHY' },
  { zh: '基本服务集', en: 'basic service set', abbr: 'BSS' },
  { zh: '基本服务集标识', en: 'basic service set identifier', abbr: 'BSSID' },
  { zh: '服务集标识', en: 'service set identifier', abbr: 'SSID' },
  { zh: '分发系统', en: 'distribution system', abbr: 'DS' },
  { zh: '扩展服务集', en: 'extended service set', abbr: 'ESS' },
  { zh: '独立 BSS', en: 'independent BSS', abbr: 'IBSS' },
  { zh: '关联', en: 'association' },
  { zh: '管理帧', en: 'management frame' },
  { zh: '控制帧', en: 'control frame' },
  { zh: '数据帧', en: 'data frame' },
  { zh: '信标', en: 'Beacon' },
  { en: 'MAC service data unit', abbr: 'MSDU' },
  { en: 'MAC protocol data unit', abbr: 'MPDU' },
  { en: 'PHY protocol data unit', abbr: 'PPDU' },
  { zh: '载荷', en: 'payload', aka: ['净荷'] },
  { zh: '帧头', en: 'MAC header' },
  { zh: '帧控制', en: 'Frame Control' },
  { zh: '持续时间', en: 'Duration/ID' },
  { zh: '地址 1', en: 'Address 1' },
  { zh: '接收端地址', en: 'receiver address', abbr: 'RA' },
  { zh: '发送端地址', en: 'transmitter address', abbr: 'TA' },
  { zh: '序列控制', en: 'Sequence Control' },
  { zh: '分片号', en: 'Fragment Number' },
  { zh: '重发比特', en: 'Retry bit', aka: ['重传标志', '重复标志'] },
  { zh: '帧体', en: 'Frame Body' },
  { zh: '帧校验序列', en: 'frame check sequence', abbr: 'FCS' },
  { zh: '循环冗余校验', en: 'cyclic redundancy check', abbr: 'CRC' },
  { zh: '服务质量', en: 'quality of service', abbr: 'QoS' },
  { zh: '业务标识', en: 'traffic identifier', abbr: 'TID' },
  { zh: '接入类别', en: 'access category', abbr: 'AC' },
  { zh: '确认帧', en: 'acknowledgement', abbr: 'ACK' },
  { zh: '确认策略', en: 'Ack Policy' },

  // --- 2.3 channel access ---
  { zh: '时隙', en: 'slot time', track: 'wifi' },
  { zh: '短帧间间隔', en: 'short interframe space', abbr: 'SIFS' },
  // §10.3.2.3.5: the DCF interframe space. "distributed interframe space" is
  // the gloss the course carried and the one error this table fixes outright.
  { zh: '分布式帧间间隔', en: 'DCF interframe space', abbr: 'DIFS' },
  { zh: '扩展帧间间隔', en: 'extended interframe space', abbr: 'EIFS' },
  { zh: '仲裁帧间间隔', en: 'arbitration interframe space', abbr: 'AIFS' },
  { zh: '仲裁帧间间隔数', en: 'arbitration interframe space number', abbr: 'AIFSN' },
  { zh: '基本接入', en: 'basic access' },
  { zh: '介质', en: 'medium' },
  { zh: '载波侦听', en: 'carrier sense' },
  { zh: '虚拟载波侦听', en: 'virtual carrier sense' },
  { zh: '网络分配向量', en: 'network allocation vector', abbr: 'NAV' },
  { zh: '退避', en: 'backoff' },
  { zh: '竞争窗口', en: 'contention window', abbr: 'CW' },
  { zh: '最小竞争窗口', en: 'minimum contention window', abbr: 'CWmin', aka: ['最小窗口'] },
  { zh: '最大竞争窗口', en: 'maximum contention window', abbr: 'CWmax', aka: ['最大窗口'] },
  { zh: 'ACK 超时', en: 'ACK timeout' },
  { zh: '信号检测时延', en: 'aRxPHYStartDelay' },
  { zh: '隐藏节点', en: 'hidden station' },
  { zh: '请求发送', en: 'request to send', abbr: 'RTS' },
  { zh: '允许发送', en: 'clear to send', abbr: 'CTS' },
  { zh: 'RTS 门限', en: 'RTS threshold' },
  { zh: '分布式协调功能', en: 'distributed coordination function', abbr: 'DCF' },
  { zh: '增强型分布式信道接入', en: 'enhanced distributed channel access', abbr: 'EDCA' },
  { zh: '内部碰撞', en: 'internal collision' },
  { zh: '重传', en: 'retry' },
  { zh: '重传上限', en: 'retry limit' },
  { zh: '生存期', en: 'MSDU lifetime' },
  { zh: '队列', en: 'queue' },
  { zh: '碰撞避免', en: 'collision avoidance' },

  // --- 2.4 efficiency, aggregation, multi-user, multi-link ---
  { zh: '聚合 MPDU', en: 'aggregate MPDU', abbr: 'A-MPDU' },
  { zh: '子帧', en: 'subframe' },
  { zh: '定界符', en: 'MPDU delimiter' },
  { zh: '块确认', en: 'block acknowledgement', abbr: 'BlockAck' },
  { zh: '位图', en: 'bitmap' },
  { zh: '块确认协定', en: 'Block Ack agreement', abbr: 'ADDBA' },
  { zh: '传输机会', en: 'transmit opportunity', abbr: 'TXOP' },
  { zh: 'TXOP 上限', en: 'TXOP limit' },
  // 保护 (protection) is NOT a row: the course writes it as the ordinary verb
  // ("它保护的是什么", "光听信道保护不了一次交互"), so a substring rule reports four
  // sentences that are not naming a term at all. The three protection modes
  // below carry the §9.2.5.2 names, which is where the term is actually taught.

  { zh: '单次保护', en: 'single protection' },
  { zh: '边界保护', en: 'boundary protection' },
  { zh: '多重保护', en: 'multiple protection' },
  { en: 'contention-free end', abbr: 'CF-End' },
  { en: 'CTS to self', abbr: 'CTS-to-self' },
  { zh: '正交频分多址', en: 'orthogonal frequency-division multiple access', abbr: 'OFDMA' },
  { zh: '资源单元', en: 'resource unit', abbr: 'RU' },
  { zh: '多用户', en: 'multi-user', abbr: 'MU' },
  { zh: '多用户 PPDU', en: 'multi-user PPDU', abbr: 'MU PPDU' },
  { zh: '每用户分配表', en: 'per-user info field' },
  { zh: '上行', en: 'uplink', abbr: 'UL' },
  { zh: '下行', en: 'downlink', abbr: 'DL' },
  { zh: '触发帧', en: 'Trigger frame' },
  { zh: '基于触发的 PPDU', en: 'trigger-based PPDU', abbr: 'TB PPDU' },
  { zh: '多站点块确认', en: 'multi-STA BlockAck' },
  { zh: '多用户 MIMO', en: 'multi-user MIMO', abbr: 'MU-MIMO' },
  { zh: '链路', en: 'link' },
  { zh: '多链路操作', en: 'multi-link operation', abbr: 'MLO' },
  { zh: '多链路设备', en: 'multi-link device', abbr: 'MLD' },
  { zh: '序号', en: 'sequence number' },

  // --- 2.5 UWB / 802.15.4 and 802.15.4ab ---
  { zh: '超宽带', en: 'ultra-wideband', abbr: 'UWB' },
  { zh: '锚点', en: 'anchor' },
  { zh: '标签', en: 'tag', track: 'uwb' },
  { en: 'ranging marker', abbr: 'RMARKER' },
  { en: 'ranging counter time unit', abbr: 'RCTU' },
  { zh: '码片', en: 'chip' },
  { zh: '同步字段', en: 'SYNC field', abbr: 'SYNC' },
  { zh: '帧起始定界符', en: 'start-of-frame delimiter', abbr: 'SFD' },
  { zh: '加扰时间戳序列', en: 'scrambled timestamp sequence', abbr: 'STS' },
  { zh: '物理头', en: 'PHY header', abbr: 'PHR' },
  { en: 'PHY service data unit', abbr: 'PSDU' },
  { zh: '前导符号', en: 'preamble symbol' },
  { zh: '密钥', en: 'key' },
  { zh: '晶振', en: 'crystal', aka: ['晶体'] },
  { zh: '百万分之几', en: 'parts per million', abbr: 'ppm' },
  { zh: '时钟偏差', en: 'clock offset' },
  { zh: '单边双向测距', en: 'single-sided two-way ranging', abbr: 'SS-TWR' },
  { zh: '双边双向测距', en: 'double-sided two-way ranging', abbr: 'DS-TWR' },
  { zh: '测距测量信息', en: 'ranging measurement information', abbr: 'RMI' },
  { zh: '回复时延', en: 'reply time' },
  { zh: '测距块', en: 'ranging block' },
  { zh: '测距轮', en: 'ranging round' },
  { zh: '测距时隙', en: 'ranging slot' },
  { en: 'ranging slot time unit', abbr: 'RSTU' },
  { zh: '首径', en: 'first path' },
  { zh: '非视距', en: 'non-line-of-sight', abbr: 'NLOS' },
  { zh: '品质因数', en: 'figure of merit', abbr: 'FoM', aka: ['品质因子', '品质字节'] },
  { zh: '信干比', en: 'signal-to-interference ratio', abbr: 'SIR' },
  { zh: '重叠', en: 'overlap', track: 'uwb' },
  { zh: '应答窗口', en: 'response window' },
  { en: 'ranging contention phase structure IE', abbr: 'RCPS' },
  { en: 'ranging contention MAC attempts IE', abbr: 'RCMA' },
  { zh: '调度模式', en: 'scheduling mode' },
  { zh: '到达时间差', en: 'time difference of arrival', abbr: 'TDoA' },
  { zh: '下行形态', en: 'downlink TDoA', abbr: 'DL-TDoA' },
  { zh: '双曲线', en: 'hyperbola' },
  { zh: '时钟修正', en: 'clock correction' },
  { zh: '锚点基线', en: 'anchor baseline' },
  { zh: '参考锚点', en: 'reference anchor' },
  { zh: '闪发', en: 'blink' },
  { zh: '上行形态', en: 'uplink TDoA', abbr: 'UL-TDoA' },
  { zh: '同步误差', en: 'sync error' },
  { zh: '公共时基', en: 'common time base' },
  { zh: '到达角', en: 'angle of arrival', abbr: 'AoA' },
  { zh: '相位差', en: 'phase difference' },
  { zh: '视轴', en: 'boresight' },
  { zh: '视场', en: 'field of view' },
  { zh: '多毫秒', en: 'multi-millisecond', abbr: 'MMS' },
  { zh: '片段', en: 'fragment' },
  { zh: '测距序列片段', en: 'ranging sequence fragment', abbr: 'RSF' },
  { zh: '测距完整性片段', en: 'ranging integrity fragment', abbr: 'RIF', aka: ['完整性片段'] },
  { zh: '合成增益', en: 'combining gain' },
  { zh: '时钟比值', en: 'clock ratio' },
  { zh: '参数集', en: 'parameter set' },
  { zh: '窄带', en: 'narrowband', abbr: 'NB' },
  { en: 'offset quadrature phase-shift keying', abbr: 'O-QPSK' },
  { zh: '先听后发', en: 'listen before talk', abbr: 'LBT' },
  { zh: '允许列表', en: 'allow list' },
  { zh: '跳变', en: 'channel hopping' },
  { zh: '能量检测门限', en: 'energy detection threshold' },
  { zh: '占空比', en: 'duty cycle' },
]

/**
 * The words the course writes in Chinese that are NOT official IEEE terms, and
 * which the rule must therefore never demand an English name for — section 2.6
 * of the inventory. They are here as data, with the reason each is excluded, so
 * that nobody adds one to {@link ZH_TERMS} in good faith: a rule that demands
 * `（margin）` after 余量 produces noise, and noise trains authors to ignore the
 * rule. A test asserts the two lists stay disjoint.
 *
 * Four classes, and the class is the reason:
 *  - **model choice** — the simulator's own quantity or counter, which `sources`
 *    already declares as a model choice;
 *  - **literature** — a name from a paper (Bianchi, Heusse, Kamerman), not from
 *    a standard;
 *  - **statistics / engineering** — ordinary measurement or RF vocabulary that
 *    IEEE 802.11 does not define;
 *  - **regulatory** — an ETSI or FCC figure, which is a limit, not a term.
 */
export const ZH_TERMS_EXCLUDED: readonly { zh: string; why: string }[] = [
  { zh: '速率余量', why: "model choice: the simulator's 3 dB, declared in `sources`" },
  { zh: '空口占比', why: "model choice: the simulator's own counter" },
  { zh: '性能异常', why: 'literature: Heusse et al., INFOCOM 2003' },
  { zh: '速率控制', why: 'model choice: the standard leaves rate selection to the implementer' },
  { zh: '自动速率回退', why: 'literature: Kamerman & Monteban 1997, not anything IEEE defines' },
  { zh: '上限', why: "model choice: the simulator's word for the highest rung a link carries" },
  { zh: '尝试', why: "model choice: the simulator's counting unit" },
  { zh: '跌落', why: "model choice: the simulator's word for an excursion" },
  { zh: '饱和', why: "literature: Bianchi's assumption" },
  { zh: '发送概率', why: "literature: Bianchi's unknown τ" },
  { zh: '碰撞概率', why: "literature: Bianchi's unknown p" },
  { zh: '捕获', why: 'engineering: receiver behaviour, "not standard-mandated" per `sources`' },
  { zh: '捕获效应', why: 'engineering: receiver behaviour, not a term any standard defines' },
  { zh: '残差', why: 'statistics: least-squares' },
  { zh: '估计量', why: 'statistics: measurement vocabulary' },
  { zh: '链路预算', why: 'engineering: RF, not 802.11' },
  { zh: '余量', why: 'model choice: three different simulator quantities under one word (inventory §3.10)' },
  { zh: '队头阻塞', why: 'engineering: computer science' },
  { zh: '突发', why: "model choice: the course's word for the frames of one TXOP" },
  { zh: '瓶颈', why: 'engineering: ordinary engineering vocabulary' },
  { zh: '空过', why: "model choice: the model's own feedback loop" },
  { zh: '中继攻击', why: 'literature: security, and already bracketed' },
  { zh: '三边定位', why: 'engineering: GNSS vocabulary; `sources` says the standard is silent' },
  { zh: '器件噪声系数', why: 'engineering: RF' },
  { zh: '占空比限值', why: 'regulatory: ETSI EN 303 687 / FCC −41.3 dBm/MHz, a limit rather than a term' },
]

/**
 * Phrases in which a term's characters spell an ordinary Chinese word instead
 * of the term, and which are therefore masked out before the search. Both so far are
 * uwb-capstone's: 偏差的符号 and 块的符号 are the SIGN of an error, not an OFDM
 * 符号 (symbol). Kept as a list rather than as a reworded lesson so that the rule
 * reports no site an author would have to "fix" by writing 符号（symbol） into a
 * sentence about plus and minus.
 */
const ZH_HOMONYMS: readonly string[] = ['偏差的符号', '块的符号']

const NUL = String.fromCharCode(0)
const blankOut = (n: number): string => NUL.repeat(n)

/** Every rendering the glossary knows about: the canonical names, the abbreviations, the `aka`. */
const termNames = (all: readonly ZhTerm[]): string[] =>
  [...new Set(all.flatMap((t) => [t.zh, t.abbr, ...(t.aka ?? [])]))].filter((s): s is string => Boolean(s))

/**
 * The same text with every bracketed span blanked to NULs of the same length,
 * so indices still line up. Used when looking for a BARE abbreviation: `DCF`
 * inside 分布式帧间间隔（DCF interframe space, DIFS）is a gloss, not a use, and
 * without this the gloss of one term reports the next term as unnamed.
 */
const maskBrackets = (text: string): string =>
  // Only a bracket that holds an English GLOSS — a lower-case word of three
  // letters or more — is masked. A bracket holding just an acronym, 一张短清单
  // （RCPS）, is the bare use this rule exists to report, and masking those too
  // hid RCPS and RCMA from the rule altogether.
  // A bracket holding a UI path — （检视器 → BSS 总览） — is masked too: that is a
  // label the reader copies off the screen, like the log names LOG_NAMES already
  // exempt, not a sentence naming a term.
  text.replace(/[（(][^）)]*[）)]/g, (m) => (/[a-z]{3,}|→/.test(m) ? blankOut(m.length) : m))

const hasCjk = (s: string): boolean => new RegExp(CJK.source).test(s)

/**
 * Where a name is first used, or -1. Two things make this different from a
 * naive `indexOf`:
 *
 *  - **no `\b`.** A word boundary between two ideographs matches nothing, so a
 *    CJK name is matched literally. `namedInPlace` documents the same trap; it
 *    is the mutation that made two earlier rules in this suite grade nothing.
 *  - **longer names first.** 符号 is inside 前导符号, 时隙 inside 测距时隙,
 *    `MPDU` inside `A-MPDU` and `PPDU` inside `MU PPDU`. Every glossary name
 *    strictly containing this one is blanked before the search, so the longer
 *    term's own correct use is never reported as the shorter term's bare one.
 */
function firstUseIndex(text: string, needle: string, all: readonly ZhTerm[]): number {
  // The excluded words mask too: 链路预算 is section 2.6's RF-engineering term
  // and contains 链路, so without it the rule demanded `（link）` inside a phrase
  // it is not allowed to touch at all.
  const longer = [...termNames(all), ...ZH_TERMS_EXCLUDED.map((x) => x.zh), ...ZH_HOMONYMS]
    .filter((n) => n.length > needle.length && n.includes(needle))
  let hay = text
  for (const n of longer) if (hay.includes(n)) hay = hay.split(n).join(blankOut(n.length))
  if (hasCjk(needle)) return hay.indexOf(needle)
  // A Latin abbreviation, case-sensitively and as a whole token. A hyphen is
  // allowed to touch it (`16-QAM`, `O-QPSK`) because the masking above is what
  // separates a compound acronym from its parts. Bracketed spans are blanked:
  // the `DCF` of another term's gloss is not a bare use of DCF.
  const m = new RegExp(`(?<![A-Za-z0-9_])${escapeRe(needle)}(?![A-Za-z0-9_])`).exec(maskBrackets(hay))
  return m ? m.index : -1
}

/** The bracket the rule wants to see: `（preamble）`, `（arbitration interframe space, AIFS）`. */
export const wantedBracket = (t: ZhTerm): string => (t.abbr ? `（${t.en}, ${t.abbr}）` : `（${t.en}）`)

/**
 * Whether some bracket opening at, or within 40 characters after, the named
 * span carries the term's English name — and its abbreviation when it has one.
 *
 * An abbreviation ALONE satisfies it, when that is the whole bracket:
 * 确认帧（ACK）and 超宽带（UWB）are the shape the reader asked for, and the
 * inventory marks them done. 分发系统（分发系统，DS）is not: its bracket holds
 * Chinese, so it is neither the English name nor the bare abbreviation.
 */
function bracketCarriesEnglish(text: string, start: number, end: number, t: ZhTerm, needAbbr: boolean): boolean {
  for (const m of text.matchAll(/[（(]([^）)]{0,200})[）)]/g)) {
    const at = m.index ?? -1
    if (at < start || at > end + 40) continue
    const inside = m[1] ?? ''
    if (t.abbr && inside.trim() === t.abbr) return true
    if (inside.toLowerCase().includes(t.en.toLowerCase()) && (!needAbbr || inside.includes(t.abbr!))) return true
  }
  return false
}

/**
 * Why a term fails, or null when it passes or was not graded at all. The
 * message is the failure list the fix wave works down, so it names the term
 * and the bracket it is missing.
 *
 * Two arms, in the reader's order:
 *  - the Chinese name leads, and the bracket must follow it;
 *  - the bare abbreviation appears FIRST, which for a term that has a Chinese
 *    name means the name never led (kind (c) of the inventory), and for an
 *    acronym-only term means the expansion must be in the bracket.
 */
export function zhTermFailure(text: string, t: ZhTerm, all: readonly ZhTerm[] = ZH_TERMS): string | null {
  const zhAt = t.zh ? firstUseIndex(text, t.zh, all) : -1
  const abbrAt = t.abbr ? firstUseIndex(text, t.abbr, all) : -1
  if (zhAt >= 0 && (abbrAt < 0 || zhAt <= abbrAt)) {
    return bracketCarriesEnglish(text, zhAt, zhAt + t.zh!.length, t, Boolean(t.abbr))
      ? null
      : `${t.zh} first used without ${wantedBracket(t)}`
  }
  if (abbrAt >= 0) {
    if (t.zh) return `${t.abbr} used with no Chinese name leading, ${t.zh}${wantedBracket(t)}`
    // The acronym leads and the bracket holds the expansion — MSDU（MAC service
    // data unit） — so the bracket is not asked for the acronym as well.
    return bracketCarriesEnglish(text, abbrAt, abbrAt + t.abbr!.length, t, false)
      ? null
      : `${t.abbr} used without （${t.en}）`
  }
  return null
}

/**
 * Whether `text` carries `t`'s English at the FIRST occurrence of its Chinese
 * name (or, for an acronym-only term, of its acronym). Returns **null** when
 * neither appears, so the caller can count how many terms were actually graded
 * — the coverage floor of section 6.4, which is what turns a matcher that has
 * stopped matching from a silent pass into a loud failure.
 */
export function bracketedAtFirstZhUse(text: string, t: ZhTerm, all: readonly ZhTerm[] = ZH_TERMS): boolean | null {
  const graded = (t.zh ? firstUseIndex(text, t.zh, all) : -1) >= 0
    || (t.abbr ? firstUseIndex(text, t.abbr, all) : -1) >= 0
  if (!graded) return null
  return zhTermFailure(text, t, all) === null
}

/**
 * The alternative renderings of `t` that appear in `text`: section 3 of the
 * inventory as an assertion. 前导 is reported even though 前导码 contains it,
 * because every glossary name that CONTAINS the alternative — the canonical
 * name itself, 前导符号, 前导检测 — is masked out before the search.
 */
export function zhAkaViolations(text: string, t: ZhTerm, all: readonly ZhTerm[] = ZH_TERMS): string[] {
  return (t.aka ?? [])
    .filter((a) => firstUseIndex(text, a, all) >= 0)
    .map((a) => `${a} is an alternative rendering of ${t.zh}`)
}
