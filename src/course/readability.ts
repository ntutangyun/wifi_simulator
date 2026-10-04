/**
 * The lesson contract's text helpers, as pure functions.
 *
 * What is left here after 2026-09-25 is deliberately small. The suite used to
 * hold a large body of rules about how a sentence READS — word budgets,
 * paragraph length, acronym density, first-use naming shapes, bilingual parity
 * — and the user's ruling retired them: the tests are for the software, not for
 * the prose (docs/superpowers/specs/2026-09-25-course-pace-and-diagrams.md,
 * "What the tests are for").
 *
 * Three things survive, because each one is either a walk over lesson DATA or
 * the user's own requirement:
 *  - `lessonStrings` / `paragraphTexts` / `cellTexts`: the walks that say what
 *    text a lesson holds. Every per-lesson test pins its claims through them.
 *  - `zhChars` and `mainPathChars`: the reading-time estimate behind
 *    `lessonMinutes`, which is the only length control the course has left.
 *  - `ZH_TERMS` and its matcher: every official term carries its standard
 *    English name, and its abbreviation where the standard has one, at its
 *    first use in a lesson. That is the reader's own requirement.
 */
import { diagramTexts, isDiagramSpec } from './diagram'
import type { Block, Lesson } from './lessonKit'

/** CJK ideographs — the characters a Chinese lesson is measured in. */
const CJK = /[㐀-䶿一-鿿]/g

/** Chinese in a string: what a table cell read as language looks like. */
const HAS_CJK = /[㐀-䶿一-鿿]/

/** Chinese characters; Latin letters, digits and punctuation do not count. */
export function zhChars(text: string): number {
  return text.match(CJK)?.length ?? 0
}

/**
 * The running prose of a set of blocks, in reading order. A heading and the
 * items of a list or a set of steps are prose like any other.
 *
 * Two things are left out, and for the same reason: a table cell and a formula
 * body are where the exact values live, so `cellTexts` reads the cells
 * separately.
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
      case 'diagram': {
        // Every label inside the figure, then its caption — the order a reader
        // meets them. A diagram's labels are prose: the terminology rule reads
        // this walk, so a term first named inside a picture has to carry its
        // English name exactly as a term first named in a sentence does.
        const d = b as Extract<Block, { kind: 'diagram' }>
        out.push(...diagramTexts(d.spec))
        if (d.caption) out.push(d.caption)
        break
      }
      default:
        // `table`: `cellTexts` reads the cells.
        break
    }
  }
  return out
}

/**
 * The table cells a learner reads as language: the ones with Chinese in them. A
 * cell holding only a value, a symbol or a log name is a glance rather than a
 * sentence, and carries no term to name.
 *
 * The terminology rule reads these, because 确认帧 in a table cell is the
 * reader's first meeting with the term just as much as one in a paragraph.
 */
export function cellTexts(blocks: Block[]): string[] {
  const out: string[] = []
  for (const b of blocks) {
    if (b.kind !== 'table') continue
    for (const c of [...b.head, ...b.rows.flat()]) if (HAS_CJK.test(c)) out.push(c)
  }
  return out
}

/**
 * Keys inside a lesson object that hold a string a learner does NOT read, each
 * with the reason it is out. This is an EXCLUSION table, which is the whole
 * design: a field nobody lists here is walked by {@link lessonTexts} the moment
 * it is added, so the banned-word lists, the self-dating rule and the
 * non-empty checks all see it without anyone remembering to extend a walk.
 *
 *  - `scenario`, `find`: engine functions. (Skipped as functions anyway.)
 *  - `kind`: a block's or a limit's discriminant.
 *  - `widget`, `params`: the control's name and its preset values.
 *  - `term`: a `Term`'s own word — the standard's own spelling, not a
 *    translation. (That reason is the one `NOT_PROSE` carried before this
 *    table existed, and it is kept verbatim.)
 *  - `until`, `seeAlso`: a lesson id, never a sentence (see `Limit`).
 *  - `answer`: a quiz's index into its own options.
 *  - `jump`: a `watch` block's index into `jumps`.
 *  - `id`, `module`, `needs`: identifiers and a number, and also classified
 *    `null` in {@link SECTION_OF}, so they are never reached from here.
 */
const NOT_TEXT = new Set([
  'scenario', 'find', 'kind', 'widget', 'params', 'term',
  'until', 'seeAlso', 'answer', 'jump', 'id', 'module', 'needs',
])

/**
 * What a reader-visible string is, within the block it sits in.
 *
 * These five are not new categories: they are exactly the split
 * {@link paragraphTexts} and {@link cellTexts} already make, which until now
 * lived in two functions and relied on each caller remembering which to call.
 *  - `prose`  — a heading, a paragraph, a `watch` call-out, a list or steps
 *               item, a formula's note, a widget's caption, a diagram's
 *               caption, a term's plain line, a quiz question, option or
 *               explanation, a source line, a limit's text.
 *  - `figure` — a label inside a diagram's spec, via `diagramTexts` (the
 *               generic walk cannot tell a label from a node id, and the order
 *               is the reader's and is pinned).
 *  - `cell`   — a table's `head` and `rows`. `cellTexts` takes only the ones
 *               with Chinese in them; the role is on every cell.
 *  - `value`  — a formula's body, which `paragraphTexts` deliberately leaves
 *               out: it is where the exact values live.
 *  - `label`  — `title`, a variant's label, a jump's label.
 */
export type Role = 'prose' | 'figure' | 'cell' | 'value' | 'label'

/** The block of the page a reader meets a string in. */
export type Section =
  | 'title' | 'why' | 'outcomes' | 'terms' | 'body' | 'picture' | 'numbers'
  | 'deeper' | 'sources' | 'limits' | 'observe' | 'tryThis' | 'quiz'
  | 'variantLabel' | 'jumpLabel'

/** One string a lesson shows a reader, and where it came from. */
export interface LessonText {
  /** The block of the page the reader meets it in. */
  section: Section
  /** What kind of string it is inside that block. */
  role: Role
  /** `numbers[3].rows[1][2]` — enough for a failure message to point at a person. */
  path: string
  text: string
}

/**
 * Every key of `Lesson`, classified. `null` means "holds no string a reader
 * reads", and the `Record<keyof Lesson, …>` makes a twentieth field added to
 * the contract without a classification a TYPE error.
 *
 * That type error is not enough on its own, and this has to be written down:
 * `package.json`'s `test` script is `vitest run`, vitest transpiles with
 * esbuild and does NOT type-check, and `tsc -b` only runs in `build`. So a
 * missing classification would not turn a single test red. {@link lessonTexts}
 * therefore ALSO throws at run time on an unclassified key, and
 * `tests/course/readability-rules.test.ts` pins the census of every section —
 * three latches for one hole, because only two of them run in `npm test`.
 */
const SECTION_OF: Record<keyof Lesson, Section | null> = {
  id: null,
  module: null,
  needs: null,
  scenario: null,
  title: 'title',
  why: 'why',
  outcomes: 'outcomes',
  terms: 'terms',
  body: 'body',
  picture: 'picture',
  numbers: 'numbers',
  deeper: 'deeper',
  sources: 'sources',
  limits: 'limits',
  observe: 'observe',
  tryThis: 'tryThis',
  quiz: 'quiz',
  variants: 'variantLabel',
  jumps: 'jumpLabel',
}

/**
 * The reader's order over the sections, and the key each one walks.
 *
 * Dropping `title`, `limits`, `variantLabel` and `jumpLabel` from this
 * sequence leaves exactly the order {@link lessonStrings} has always returned,
 * which is why that function can become a selector over this walk without a
 * single one of its callers changing.
 */
const SECTION_KEY: readonly (readonly [Section, keyof Lesson])[] = [
  ['title', 'title'], ['why', 'why'], ['outcomes', 'outcomes'], ['terms', 'terms'],
  ['body', 'body'], ['picture', 'picture'], ['numbers', 'numbers'],
  ['deeper', 'deeper'], ['sources', 'sources'], ['limits', 'limits'],
  ['observe', 'observe'], ['tryThis', 'tryThis'], ['quiz', 'quiz'],
  ['variantLabel', 'variants'], ['jumpLabel', 'jumps'],
]

/** Every section, in the reader's order — what the census iterates. */
export const SECTIONS: readonly Section[] = SECTION_KEY.map(([s]) => s)

/**
 * Every string a lesson shows a reader, tagged with where it came from.
 *
 * The one walk. It does NOT decide which strings are "Chinese lesson prose" —
 * that question had been answered seven different ways in this repository and
 * no test compared the seven. Its only job is that **no field is missed**: it
 * walks the object rather than naming fields, excludes by {@link NOT_TEXT}
 * rather than including by a list, and throws on a key nobody has classified.
 * Which strings a given rule wants is the rule's own business, and two rules
 * are allowed to answer differently — a substring ban is unordered and
 * context-free, while the first-use bracket rule is ordered and sensitive to
 * how a failure would have to be fixed.
 *
 * `spec` is the one special case and it is deliberate: a generic walk into a
 * diagram spec yields 852 strings per figure against `diagramTexts`' 420, and
 * the extra ones are node ids, link endpoints, tones and coordinates. The
 * order `diagramTexts` gives is the reader's, and it is pinned by
 * `tests/course/readability-rules.test.ts`.
 *
 * Takes a `Partial<Lesson>` so a caller can ask for one section at a time.
 */
/**
 * `lessonTexts` keyed by the lesson OBJECT, so the walk runs once per lesson.
 *
 * This exists because the walk is on a render path: `CoursePanel.tsx:313` calls
 * `lessonMinutes` once per lesson for all 83 rows of the contents list, which
 * reaches `mainPathChars` and so this walk. A lesson is a module-level literal
 * that nothing mutates, so the first call computes and every later one reads.
 *
 * Why a `WeakMap` on the object and not a cache keyed by `l.id`: the key has to
 * be the thing that was actually walked. A key of `id` would hand a cached
 * answer to `{ ...lesson, newField: '…' }` — a DIFFERENT object with the same id
 * — and the run-time latch below would never see the new field. Keyed by
 * identity, any object the walk has not seen is walked, latch and all; and a
 * one-off `Partial<Lesson>` literal, which every caller builds fresh, simply
 * never hits. `tests/course/readability-rules.test.ts` pins exactly that.
 *
 * What the memo does NOT survive, stated rather than assumed: a lesson object
 * MUTATED after its first walk. Nothing in this repository mutates one — they
 * are `const` literals in `src/course/*` — but if that ever changes, this cache
 * is the thing that goes stale, and the fix is to drop the entry, not to key it
 * differently.
 */
const WALKED = new WeakMap<object, readonly LessonText[]>()

export function lessonTexts(l: Partial<Lesson>): readonly LessonText[] {
  const hit = WALKED.get(l)
  if (hit) return hit
  for (const k of Object.keys(l)) {
    if (!(k in SECTION_OF)) {
      throw new Error(
        `lessonTexts: lesson field \`${k}\` is not classified. Add it to SECTION_OF in `
        + 'src/course/readability.ts (a Section when a reader reads it, null when not); when it '
        + 'holds strings a reader never reads, also name the key in NOT_TEXT with its reason.',
      )
    }
  }
  const out: LessonText[] = []
  const roleOf = (parent: Role, blockKind: string | undefined, key: string): Role => {
    if (parent === 'label') return 'label'
    if (blockKind === 'table' && (key === 'head' || key === 'rows')) return 'cell'
    if (blockKind === 'formula' && key === 'text') return 'value'
    return 'prose'
  }
  const walk = (x: unknown, path: string, section: Section, role: Role, blockKind?: string): void => {
    if (x == null || typeof x === 'function') return
    if (typeof x === 'string') { out.push({ section, role, path, text: x }); return }
    if (Array.isArray(x)) { x.forEach((v, i) => walk(v, `${path}[${i}]`, section, role, blockKind)); return }
    if (typeof x !== 'object') return
    const o = x as Record<string, unknown>
    const kind = typeof o.kind === 'string' ? o.kind : blockKind
    for (const [k, v] of Object.entries(o)) {
      if (NOT_TEXT.has(k)) continue
      if (k === 'spec' && isDiagramSpec(v)) {
        diagramTexts(v).forEach((t, i) => out.push({ section, role: 'figure', path: `${path}.spec[${i}]`, text: t }))
        continue
      }
      walk(v, `${path}.${k}`, section, roleOf(role, kind, k), kind)
    }
  }
  for (const [section, key] of SECTION_KEY) {
    if (!(key in l)) continue
    const isLabel = section === 'title' || section === 'variantLabel' || section === 'jumpLabel'
    walk(l[key], key, section, isLabel ? 'label' : 'prose')
  }
  // Frozen because it is SHARED: the memo hands the same array to every caller, so a
  // caller that pushed to it would corrupt what the next one reads. `readonly` says so in
  // the type and the freeze says so at run time, which is the pair this file wants rather
  // than a cast that hides one of them.
  const shared = Object.freeze(out)
  WALKED.set(l, shared)
  return shared
}

/* ------------------------------------------------------------------------- *
 * The selectors. Each one's docblock says why it is not one of the others —
 * that sentence is the thing twelve hand-rolled field lists never had.
 * ------------------------------------------------------------------------- */

const pick = (l: Partial<Lesson>, want: readonly Section[]): string[] => {
  const set = new Set(want)
  return lessonTexts(l).filter((t) => set.has(t.section)).map((t) => t.text)
}

/** The sections `lessonStrings` has always returned: everything but the chrome and `limits`. */
const LESSON_STRING_SECTIONS: readonly Section[] = [
  'why', 'outcomes', 'terms', 'body', 'picture', 'numbers',
  'deeper', 'sources', 'observe', 'tryThis', 'quiz',
]

/**
 * Every string a learner can read in a lesson, EXCEPT the chrome and `limits`.
 *
 * Behaviour is unchanged by the 2026-10-05 walk refactor, and that is a
 * requirement rather than an accident: around thirty per-lesson tests pin their
 * claims through this function, and one guard in
 * `tests/course/readability.test.ts` asserts that it still does not reach
 * `limits` — deliberately, so that a day on which it starts to is a day
 * somebody notices.
 *
 * Walked: `why`, `outcomes`, `terms` (each term's `plain` line), `body` (the old
 * flat shape, in the slot `picture` and `numbers` both occupy in the new one),
 * `picture`, `numbers`, `deeper`, `sources`, `observe`, `tryThis` and `quiz`,
 * including table cells, formula bodies and quiz options.
 *
 * `title`, `limits[].text`, `variants[].label` and `jumps[].label` are outside
 * it — they are the chrome around a lesson rather than the lesson, and `limits`
 * is a section of its own — so a caller that wants the whole page calls
 * {@link readerTexts} instead of appending them by hand. Until 2026-10-05 nine
 * callers appended them by hand, in five different combinations, and no test
 * compared the five.
 *
 * It takes a `Partial<Lesson>` so a caller can ask for one field at a time.
 */
export function lessonStrings(l: Partial<Lesson>): string[] {
  return pick(l, LESSON_STRING_SECTIONS)
}

/**
 * EVERY string a reader can read, chrome and `limits` included: the walk the
 * banned-word lists, the self-dating rule and the non-empty checks all share.
 *
 * Why this and not {@link lessonStrings}: a substring ban is unordered and
 * context-free, so more text can only mean more hits and never a wrong one —
 * measured, not argued (86 banned words and 4 self-dating patterns over an
 * unconditional walk of the whole object, 11 735 strings, zero hits). Those
 * rules want everything, and `limits` is where the three real self-dating
 * sentences of 2026-10-04 were hiding.
 *
 * Why not {@link gradedProseTexts}: that one feeds the ordered bracket rule,
 * which more text makes WRONG rather than merely louder.
 */
export function readerTexts(l: Partial<Lesson>): string[] {
  return lessonTexts(l).map((t) => t.text)
}

/** The sections a reader is assumed to read at reading speed. */
const MAIN_PATH_SECTIONS: readonly Section[] = [
  'why', 'outcomes', 'terms', 'body', 'picture', 'numbers', 'observe', 'tryThis', 'quiz',
]

/**
 * The main path: what `lessonMinutes` estimates reading time from.
 *
 * Why this and not {@link lessonStrings}: `deeper` and `sources` are collapsed
 * depth, and the stated minutes are the minutes of the main path.
 *
 * Why not {@link readerTexts}: `title` is read once and a label is clicked
 * rather than read, so counting them makes the estimate less accurate, not more
 * — and `limits[].text` is a quarter of the main path's length, rendered open
 * by default and timed at zero. That last one is a real debt, and it is now
 * pinned rather than left implicit (the ratchet in
 * `tests/course/readability.test.ts`); paying it means splitting six lessons,
 * which is another slice.
 *
 * Why not {@link gradedProseTexts}: this one DOES count `terms`, which is
 * rendered before `picture` and read at reading speed, while the bracket rule
 * deliberately does not grade it.
 */
export function mainPathTexts(l: Partial<Lesson>): string[] {
  return pick(l, MAIN_PATH_SECTIONS)
}

/** `mainPathChars` keyed by the lesson object; see {@link WALKED}. */
const MAIN_PATH_CHARS = new WeakMap<object, number>()

/**
 * Chinese characters across everything a learner reads on a lesson's main path.
 * Equal, lesson for lesson, to what it returned before the 2026-10-05 refactor.
 *
 * Memoised on the lesson object for the same reason the walk is: this is what
 * `lessonMinutes` calls, and the contents list calls that 83 times per render.
 */
export function mainPathChars(l: Partial<Lesson>): number {
  const hit = MAIN_PATH_CHARS.get(l)
  if (hit !== undefined) return hit
  const n = mainPathTexts(l).reduce((m, s) => m + zhChars(s), 0)
  MAIN_PATH_CHARS.set(l, n)
  return n
}

/** The three chrome sections: printed around a lesson rather than inside it. */
const CHROME_SECTIONS: readonly Section[] = ['title', 'variantLabel', 'jumpLabel']

/**
 * The chrome: `title`, the variant labels and the jump labels. Short strings,
 * the longest 19 characters, not one of them a sentence — against
 * `limits[].text`, every single entry of which is a paragraph.
 *
 * Why it is its own selector: the two reach rules of 2026-10-05 are about these
 * strings, and they split this set in two — `title` is the only string here
 * printed OUTSIDE its own lesson (`CoursePanel.tsx:312`, `:436`, `:581`,
 * `:586`), so it is held to its own lesson's main path, while a label is held
 * to the lesson's `needs` closure. See the rules' own docblocks.
 */
export function chromeTexts(l: Partial<Lesson>): string[] {
  return pick(l, CHROME_SECTIONS)
}

/** The sections the first-use bracket rule grades. */
const GRADED_SECTIONS: readonly Section[] = [
  'why', 'outcomes', 'body', 'picture', 'numbers', 'observe', 'tryThis', 'quiz',
]

/**
 * The prose the first-use bracket rule grades, in the reader's order.
 *
 * This is `paragraphTexts` + `cellTexts` over `why`/`outcomes`/`body`/
 * `picture`/`numbers`, then `observe`/`tryThis`/`quiz` — a restatement of the
 * hand-rolled walk it replaced and NOT a widening of it. The landing commit
 * asserted the two equal element for element over all 83 lessons before the old
 * one was deleted.
 *
 * Four things are deliberately outside it, and each exclusion has a measured
 * reason rather than an oversight:
 *  - `deeper` and `sources`: collapsed professional depth, where the clause
 *    numbers and the English names already live. Grading them would add 81 and
 *    180 failures.
 *  - `limits[].text`: by the same measure it belongs with those two rather than
 *    with the main path — its term density is HIGHER than `sources`' — and
 *    grading it would add 298 failures. The ratchet pins that debt instead.
 *  - `terms[].plain`: structurally not gradable by this rule. 101 of the 272
 *    glossary rows explain their word using another glossary word, which is
 *    what an explanation is for; demanding a bracket for every borrowed word
 *    turns the glossary into brackets. This exclusion is permanent — the reason
 *    is written out in the rule's docblock in
 *    `tests/course/readability.test.ts`.
 *  - `role: 'value'` (a formula's body) and `role: 'label'`: values and chrome.
 *    The labels ARE graded, by the two reach rules, against a different bar.
 *
 * A table cell counts only when it has Chinese in it: a cell holding a value, a
 * symbol or a log name is a glance rather than a sentence and carries no term
 * to name. That is `cellTexts`' own rule, unchanged.
 */
export function gradedProseTexts(l: Partial<Lesson>): string[] {
  const ts = lessonTexts(l)
  const out: string[] = []
  for (const s of GRADED_SECTIONS) {
    const mine = ts.filter((t) => t.section === s)
    for (const t of mine) if (t.role === 'prose' || t.role === 'figure') out.push(t.text)
    for (const t of mine) if (t.role === 'cell' && HAS_CJK.test(t.text)) out.push(t.text)
  }
  return out
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')

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

  // --- 2.2 roles, frames, addressing ---
  { zh: '站点', en: 'station', abbr: 'STA' },
  { zh: '接入点', en: 'access point', abbr: 'AP' },
  { zh: '媒体访问控制', en: 'medium access control', abbr: 'MAC' },
  { zh: '物理层', en: 'physical layer', abbr: 'PHY' },
  { zh: '基本服务集', en: 'basic service set', abbr: 'BSS' },
  { zh: '基本服务集标识', en: 'basic service set identifier', abbr: 'BSSID' },
  { zh: '服务集标识', en: 'service set identifier', abbr: 'SSID' },
  { zh: '分发系统', en: 'distribution system', abbr: 'DS' },
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
  { zh: '视场', en: 'field of view' },
  { zh: '多毫秒', en: 'multi-millisecond', abbr: 'MMS' },
  { zh: '片段', en: 'fragment' },
  { zh: '测距序列片段', en: 'ranging sequence fragment', abbr: 'RSF' },
  { zh: '合成增益', en: 'combining gain' },
  { zh: '时钟比值', en: 'clock ratio' },
  { zh: '参数集', en: 'parameter set' },
  { zh: '窄带', en: 'narrowband', abbr: 'NB' },
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
const ZH_HOMONYMS: readonly string[] = [
  // 符号 is an OFDM/UWB symbol in this course, except where it is the SIGN of a
  // number; beside 反 it is always a sign that flipped.
  '偏差的符号', '块的符号', '核对符号', '符号相反', '符号反',
  // 队列 is the MAC queue, except in the simulator's own event queue.
  '事件队列',
]

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
const wantedBracket = (t: ZhTerm): string => (t.abbr ? `（${t.en}, ${t.abbr}）` : `（${t.en}）`)

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
  for (const [at, inside] of brackets(text)) {
    if (at < start || at > end + 40) continue
    if (t.abbr && inside.trim() === t.abbr) return true
    if (inside.toLowerCase().includes(t.en.toLowerCase()) && (!needAbbr || inside.includes(t.abbr!))) return true
  }
  return false
}

/**
 * Every bracketed region of `text`, as [openIndex, contents], outermost first,
 * nested ones included as regions of their own.
 *
 * This was a regex — `/[（(]([^）)]{0,200})[）)]/g` — and it is a scanner now
 * because that regex is not nesting-aware and failed SILENTLY. On
 * `（本振偏移（local oscillator offset）之后还有 clock drift）` it matches from the
 * outer open bracket to the INNER close, so the outer bracket's tail is never
 * examined and a term named there reads as unnamed. `matchAll` then resumes
 * after that close, so the tail is not picked up as a second region either.
 *
 * Tracking depth fixes it, and the fix can only widen what the rule accepts:
 * every region the regex found is still found, with the same open index and at
 * least as much content. So no lesson that passed can start failing — which is
 * why this lands without a sweep behind it.
 *
 * That claim was not quite absolute when first written, and the branch review
 * found the hole: on a mixed-width unbalanced pair like `(A（B)`, the regex
 * matched a region at index 0, while the scanner popped the inner `（` for the
 * `)` and dropped the never-closed `(` entirely — losing a region the regex
 * had. No lesson in the corpus reaches it, so nothing was failing; the claim
 * above was what was wrong. Emitting each unclosed open bracket with the rest
 * of the string as its content makes the claim true rather than nearly true,
 * which is worth more than an exception noted in a comment: the claim is the
 * reason this function could replace the regex without a sweep behind it, and
 * a load-bearing claim should hold.
 */
export function brackets(text: string): [number, string][] {
  const out: [number, string][] = []
  const open: number[] = []
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '（' || c === '(') open.push(i)
    else if (c === '）' || c === ')') {
      const at = open.pop()
      // A close with no open is a stray; ignore it rather than guess where the
      // region began. Chinese prose in this course has both widths of bracket.
      if (at !== undefined) out.push([at, text.slice(at + 1, i)])
    }
  }
  // Whatever is still open never closed. The regex would have run such a
  // bracket to the next closer of either width, so to stay a superset of it
  // this runs each one to the end of the string.
  for (const at of open) out.push([at, text.slice(at + 1)])
  // Depth order comes out innermost-first because a region closes before its
  // parent. The caller takes the first region that satisfies it and the open
  // index is what decides eligibility, so order does not change the verdict —
  // sorting by open index only makes the sequence match the reader's.
  return out.sort((a, b) => a[0] - b[0])
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
