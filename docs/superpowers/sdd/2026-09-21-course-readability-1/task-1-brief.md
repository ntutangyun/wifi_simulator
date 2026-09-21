### Task 1: The contract, the renderer and the readability test

**Files:**
- Modify: `src/course/lessonKit.ts` (types), `src/course/curriculum.ts` (`lessonWords`, `KNOWN_WORDS`, `trackOf`, `lessonBlocks`), `src/course/CoursePanel.tsx` (render), `src/ui/i18n.ts` (course strings EN+ZH), `tests/course/lessons.test.ts` (use `lessonBlocks`), `README.md` (course paragraph), `docs/superpowers/specs/2026-09-18-zero-to-hero-curriculum-design.md` (replace the "Density" line with a pointer to the readability spec).
- Create: `tests/course/readability.test.ts`, `tests/course/readability-rules.test.ts` (unit tests of the rule functions), `src/course/readability.ts` (the pure rule functions the test and future tooling share).

**Interfaces (produces):**

```ts
// lessonKit.ts
export interface Term { term: string; plain: L10n }
export type Block =
  | { kind?: 'p'; heading?: L10n; text: L10n }
  | { kind: 'formula'; heading?: L10n; text: L10n; note?: L10n }
  | { kind: 'table'; heading?: L10n; head: L10n[]; rows: L10n[][] }
  | { kind: 'list'; heading?: L10n; items: L10n[] }
  | { kind: 'steps'; heading?: L10n; items: L10n[] }
  | { kind: 'widget'; heading?: L10n; widget: 'linkBudget' | 'mcsLadder'; params?: Record<string, number | string>; caption?: L10n }
  /** A call-out that sends the reader to the simulator: loads the lesson scenario, or jumps to jumps[jump] once loaded. */
  | { kind: 'watch'; heading?: L10n; text: L10n; jump?: number }
export interface Lesson {
  id: string; module: number; title: L10n
  /** Old shape, being migrated away. A lesson has either `body` or the eight fields below. */
  body?: Block[]
  why?: L10n; outcomes?: L10n[]; needs?: string[]; terms?: Term[]
  picture?: Block[]; numbers?: Block[]; deeper?: Block[]; sources?: L10n[]
  scenario: () => Scenario; variants?: LessonVariant[]; jumps: JumpTarget[]
  observe: L10n[]; tryThis: L10n[]; quiz: Quiz[]
}
/** True once a lesson carries the new shape. */
export const isMigrated = (l: Lesson): boolean => l.why !== undefined
```

```ts
// curriculum.ts
/** Every block a learner reads on the main path, in either shape (not `deeper`). */
export function lessonBlocks(l: Lesson): Block[]          // body ?? [...picture, ...numbers]
export function lessonWords(l: Lesson): number            // walks why, outcomes, terms, picture, numbers (or body), observe, tryThis, quiz — never deeper or sources
/** The pseudo-track a lesson belongs to for the prerequisite rule: 'wifi' | 'amp' | 'uwb' (module 7 is 'amp'). */
export function trackOf(l: Lesson): 'wifi' | 'amp' | 'uwb'
```

```ts
// readability.ts — pure, tested on their own
export const KNOWN_WORDS: ReadonlySet<string>   // upper-case: WI-FI, AP, STA, MAC, PHY, DB, DBM, ID, RF, OK, CPU, IOT, GPS, USB, TX, RX, US, EU, CN, LED, PC, TV, QR, I, A, AM, PM
export const PROTOCOL_NAME = /(?:P?802\.1[15](?:\.\d)?[a-z]*|Wi-Fi\s?\d|Bluetooth\s?\d(?:\.\d)?)/g
export const CITATION = /§|\bClause\b|IEEE Std|\bP802\.|\b1[15]-2\d\/\d{3,4}\b|\bPM-\d|\bD[01]\.\d\b|\bdraft\b|\bTBD\b|model choice|草案|标准正文|模型取值/i
export function acronyms(text: string): string[]           // tokens /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*\b/ of length ≥ 2, protocol names removed first, tokens containing '_' dropped, returned upper-cased
export function numericQuantities(text: string): number     // count of /\d[\d,.\s]*\d|\d/ digit groups after removing protocol names (a space-separated thousands group like "336 207 494 656" counts once)
export function enWords(text: string): number
export function zhChars(text: string): number               // count of CJK characters
export function paragraphTexts(blocks: Block[]): L10n[]      // the `text` of every p and watch block, formula notes, widget captions (not table cells, not formula bodies)
```

```ts
// i18n.ts — course: add
outcomes: string      // 'After this lesson you can' / '学完这一课你能'
needs: string         // 'You need' / '需要先学'
terms: string         // 'New words' / '新词'
numbers: string       // 'Now the numbers' / '现在看数字'
deeper: string        // 'Going deeper' / '再深一层'
sources: string       // 'Where these numbers come from' / '这些数字从哪里来'
watchLoad: string     // '▶ Load and watch' / '▶ 载入并观察'
watchJump: string     // '⚡ Jump there' / '⚡ 跳到那里'
```

- [ ] **Step 1: Failing unit tests for the rule functions** — `tests/course/readability-rules.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { acronyms, numericQuantities, CITATION, enWords, zhChars, KNOWN_WORDS } from '../../src/course/readability'

describe('readability rules', () => {
  it('finds acronyms and leaves protocol names, units and record names alone', () => {
    expect(acronyms('The STS — the timing sequence — follows the SFD in 802.11bp and Wi-Fi 7; see TX_START.'))
      .toEqual(['STS', 'SFD'])
    expect(acronyms('An A-MPDU behind an L-SIG')).toEqual(['A-MPDU', 'L-SIG'])
    expect(acronyms('CTS-to-self ends the NAV')).toEqual(['CTS', 'NAV'])
    expect(acronyms('5 dBm at 2.4 GHz for 16 µs')).toEqual([])
  })
  it('counts numeric quantities, grouping spaced thousands, ignoring protocol names', () => {
    expect(numericQuantities('five metres is 16.678 ns, or 1 065.7 ticks, in 802.15.4')).toBe(2)
    expect(numericQuantities('336 207 494 656 minus 336 335 290 928')).toBe(2)
    expect(numericQuantities('Wi-Fi 7 routers')).toBe(0)
  })
  it('spots citations in either language and nothing else', () => {
    for (const s of ['§10.29.1.1', 'Clause 16', 'IEEE Std 802.15.4-2024', 'P802.11bp', '11-24/1613r20', '15-23/0100r2', 'PM-87', 'D0.5', 'the draft', 'TBD', 'a model choice', '草案', '标准正文', '模型取值'])
      expect(CITATION.test(s), s).toBe(true)
    for (const s of ['a drafty room is fine? no: "draft" alone matches — use "drafty"', 'the anchor answers', '锚点作答'])
      expect(CITATION.test(s.replace(/draft/g, 'drafty')), s).toBe(false)
  })
  it('counts words and CJK characters', () => {
    expect(enWords('one two  three')).toBe(3)
    expect(zhChars('一二三 abc，四')).toBe(4)
  })
  it('the baseline knows units and everyday words only', () => {
    for (const w of ['AP', 'STA', 'DBM', 'WI-FI']) expect(KNOWN_WORDS.has(w)).toBe(true)
    for (const w of ['STS', 'RMARKER', 'OOK', 'TXOP', 'SIFS']) expect(KNOWN_WORDS.has(w)).toBe(false)
  })
})
```

- [ ] **Step 2: Run** `npx vitest run tests/course/readability-rules.test.ts` → FAIL (module missing).

- [ ] **Step 3: Write `src/course/readability.ts`** with the exports above. `acronyms`: strip protocol names, then match `/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*\b/g`, drop tokens shorter than 2 characters, drop tokens with `_`, drop tokens that are all digits, upper-case, keep order, de-duplicate. `numericQuantities`: strip protocol names, then count matches of `/\d(?:[\d,.]|\s(?=\d{3}\b))*/g`. `CITATION` exactly as above. `KNOWN_WORDS` as listed.

- [ ] **Step 4: Run** the rule tests → PASS. Fix the regexes until every case in Step 1 passes; do not weaken the cases.

- [ ] **Step 5: Types and helpers.** In `lessonKit.ts` add `Term`, the `watch` block, the optional fields and `isMigrated`. In `curriculum.ts` add `lessonBlocks`, `trackOf` (`l.module === 7 ? 'amp' : TIERS[MODULES[l.module].tier].track`), and change `lessonWords` to walk `{ why, outcomes, terms, picture, numbers, body, observe, tryThis, quiz }` (walk each only if present). Replace `l.body` with `lessonBlocks(l)` in `tests/course/lessons.test.ts` (lines 34, 194, 236–237) and in `CoursePanel.tsx`.

- [ ] **Step 6: Failing readability test** — `tests/course/readability.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { COURSE_ORDER, lessonMinutes, lessonWords, trackOf } from '../../src/course/curriculum'
import { isMigrated, type Block, type L10n, type Lesson } from '../../src/course/lessonKit'
import { CITATION, KNOWN_WORDS, acronyms, enWords, numericQuantities, paragraphTexts, zhChars } from '../../src/course/readability'

/** Lessons still in the old shape. Each migration task removes its ids; the list only shrinks. */
export const MIGRATING: string[] = [
  'radio-primer', 'decode-thresholds', 'roles-stack', 'frame-anatomy', 'airtime', 'ifs', 'backoff', 'nav', 'hidden', 'anomaly',
  'retries-queues', 'bianchi', 'bianchi-vs-sim', 'tier1-project', 'edca', 'ampdu', 'txop', 'txop-protect', 'width', 'streams', 'rate',
  'ofdma-dl', 'ofdma-ul', 'mumimo', 'mlo', 'amp-intro', 'amp-slots', 'amp-coexist', 'capstone',
  'uwb-intro', 'uwb-sstwr', 'uwb-dstwr', 'uwb-blocks', 'uwb-position', 'uwb-coexist', 'uwb-contention', 'uwb-dl-tdoa', 'uwb-ul-tdoa', 'uwb-aoa', 'uwb-mms', 'uwb-nba',
]
/** Stands in for the `terms` of radio-primer and frame-anatomy until they migrate (then delete it: the test below insists). */
const TIER1_BASELINE = ['SINR', 'SNR', 'RSSI', 'MCS', 'OFDM', 'PPDU', 'MPDU', 'MSDU', 'FCS', 'BSS', 'BSSID', 'SSID', 'ACK', 'CRC', 'QOS', 'L-SIG', 'L-STF', 'L-LTF', 'U-SIG', 'HE', 'EHT', 'HT', 'VHT', 'SIFS', 'DIFS', 'NAV', 'CW', 'CCA', 'EIFS', 'RTS', 'CTS']
const CITED_FIELDS: (keyof Lesson)[] = ['why', 'outcomes', 'terms', 'picture', 'observe', 'tryThis', 'quiz']

const byId = new Map(LESSONS.map((l) => [l.id, l]))
const ordered = COURSE_ORDER.flatMap((id) => byId.get(id) ?? [])
const migrated = ordered.filter((l) => !MIGRATING.includes(l.id))
const textsOf = (x: unknown): L10n[] => { /* walk like lessonWords, collecting {en,zh} */ }
const firstOfTrack = (l: Lesson) => ordered.find((o) => trackOf(o) === trackOf(l) && !MIGRATING.includes(o.id)) === l

describe('readability · migration bookkeeping', () => {
  it('every MIGRATING id is a real lesson still in the old shape', () => {
    for (const id of MIGRATING) { expect(byId.has(id), id).toBe(true); expect(isMigrated(byId.get(id)!), id).toBe(false) }
  })
  it('every lesson not in MIGRATING is in the new shape', () => {
    for (const l of migrated) expect(isMigrated(l), l.id).toBe(true)
  })
  it('TIER1_BASELINE exists only while radio-primer and frame-anatomy are unmigrated', () => {
    const stillOld = MIGRATING.includes('radio-primer') || MIGRATING.includes('frame-anatomy')
    expect(TIER1_BASELINE.length > 0).toBe(stillOld)
  })
})

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
    const known = new Set<string>([...KNOWN_WORDS, ...TIER1_BASELINE])
    for (const o of ordered) {
      if (o === l) break
      const sameTrack = trackOf(o) === trackOf(l) || (trackOf(o) === 'wifi' && ['radio-primer', 'frame-anatomy'].includes(o.id))
      if (sameTrack && !MIGRATING.includes(o.id)) for (const t of o.terms!) known.add(t.term.toUpperCase())
    }
    for (const t of l.terms!) known.add(t.term.toUpperCase())
    const texts = [l.why!, ...paragraphTexts(l.picture!), ...l.outcomes!]
    for (const s of texts) for (const a of acronyms(s.en)) expect(known.has(a), `${l.id}: "${a}" in "${s.en.slice(0, 60)}…"`).toBe(true)
  })
  it('keeps the picture light: short paragraphs, at most two quantities each, no citations', () => {
    for (const p of paragraphTexts(l.picture!)) {
      expect(enWords(p.en), p.en).toBeLessThanOrEqual(90)
      expect(zhChars(p.zh), p.zh).toBeLessThanOrEqual(170)
      expect(numericQuantities(p.en), p.en).toBeLessThanOrEqual(2)
      expect(CITATION.test(p.en) || CITATION.test(p.zh), p.en).toBe(false)
    }
  })
  it('cites only in sources and in table cells of the numbers', () => {
    for (const f of CITED_FIELDS) for (const s of textsOf(l[f])) expect(CITATION.test(s.en) || CITATION.test(s.zh), `${f}: ${s.en.slice(0, 80)}`).toBe(false)
    for (const s of paragraphTexts(l.numbers!)) expect(CITATION.test(s.en) || CITATION.test(s.zh), s.en).toBe(false)
  })
  it('fits the main path: 500–1300 words, at most 20 minutes', () => {
    expect(lessonWords(l)).toBeGreaterThanOrEqual(500); expect(lessonWords(l)).toBeLessThanOrEqual(1300)
    expect(lessonMinutes(l)).toBeLessThanOrEqual(20)
  })
})
```

  Fill `textsOf` with the same walk `lessonWords` uses (collect every `{en, zh}` object, skipping `scenario` and `find`). With `MIGRATING` covering every current lesson, the per-lesson suite is empty and only the bookkeeping tests run.

- [ ] **Step 7: Run** `npx vitest run tests/course/readability.test.ts` → the bookkeeping tests PASS (vitest allows an empty `describe.each`; if it complains, guard it with `if (migrated.length)`).

- [ ] **Step 8: The renderer.** In `CoursePanel.tsx`, for a migrated lesson render in this order: header line (tier · module · minutes), title, `why` as a paragraph in a slightly larger font (13.5px), `L.outcomes` heading + bullet list, `L.needs` heading + a row of small buttons (one per id, label = that lesson's title, `onClick={() => selectLesson(id)}`), `L.terms` heading + a two-column table (term / plain), then `picture` blocks, `L.numbers` heading + `numbers` blocks, `<details><summary>{L.deeper}</summary>…</details>` if `deeper` is present, then the existing load/variants/jumps block, observe, experiments, quiz, and finally `<details><summary>{L.sources}</summary><ul>…</ul></details>`. A `watch` block renders as a call-out box (left border 3px accent, padding 8px) with the text and one button: `L.watchLoad` when the scenario is not loaded (calls `loadCourseScenario(lesson.scenario())`), else `L.watchJump` if `jump` is set (calls `jump(lesson.jumps[b.jump].find, …)`), else no button. An unmigrated lesson renders exactly as today via `lessonBlocks`. Add the eight strings to both language tables.

- [ ] **Step 9: Docs.** Replace the "Density" bullet in the 2026-09-18 curriculum spec with: "Density: see `2026-09-21-course-readability-design.md` — depth after understanding; citations only in the sources block." Add one paragraph to README's course section describing the lesson shape (why → outcomes → prerequisites → new words → picture → numbers → observe → experiments → quiz → sources).

- [ ] **Step 10: Gates.** `npx vitest run` (all green; the i18n parity test and the course tests must not need any allowlist), `npx tsc -b --noEmit`, `npm run build`. Both hash fixtures unchanged.

- [ ] **Step 11: Commit** `feat(course): a zero-to-hero lesson contract — new sections, collapsed depth and sources, and the readability test that enforces them`.

---

