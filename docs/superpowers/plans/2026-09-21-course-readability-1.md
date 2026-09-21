# Course readability, step 1 — the contract, the renderer and the two reference lessons

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every lesson a zero-to-hero shape the course panel renders and a test enforces, and rewrite the first UWB and the first AMP lesson to it (each split in two) so the learner can read them while the rest of the course migrates.

**Architecture:** `Lesson` gains the fields `why / outcomes / needs / terms / picture / numbers / deeper? / sources`; `body` stays optional during the migration and a helper `lessonBlocks(l)` returns whichever shape a lesson has. `tests/course/readability.test.ts` walks `COURSE_ORDER`, skips ids in its `MIGRATING` list and enforces the word, number, citation, length and structure rules on the rest. The course panel renders the thirteen sections, with "Going deeper" and "Where these numbers come from" collapsed.

**Tech Stack:** TypeScript strict, React, zustand, vitest (node environment, no DOM).

**Spec:** `docs/superpowers/specs/2026-09-21-course-readability-design.md` (binding). Read its "The shape of a lesson", "Words", "Length and pace", "Splitting" and "Tests" sections before any task.

## Global Constraints

- EN + ZH for every string; the ZH is written, not translated.
- No copyrighted standard or draft text in the repo: paraphrase; quote only numbers and field names.
- Every empirical claim in a lesson is pinned by a test in `tests/course`; when a sentence moves between lessons its test moves with it.
- Scenarios are byte-identical: `tests/fixtures/lesson-hashes.json` changes by **additions only** (new ids `uwb-frame`, `uwb-frame#0`, `amp-ppdu`, `amp-ppdu#0`); `tests/fixtures/uwb-record-hashes.json` unchanged.
- The first half of a split keeps the original id (`uwb-intro`, `amp-intro`).
- `why`: no digits except inside a protocol name; no citation tokens; no unknown acronyms. `picture` paragraphs: ≤ 90 EN words, ≤ 170 ZH characters, ≤ 2 numeric quantities, no citation tokens. Citations only in `sources` and in `numbers` table cells. Main-path words 500–1 300; `lessonMinutes` ≤ 20.
- Do not touch `src/engine`, `src/uwb`, `src/model` (other than nothing), or any AMP slice file; the AMP backscatter slice is in flight on the same branch.
- Commit trailer on every commit:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_016HUme5YXCB8DTeScyfn7pL
  ```

---

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

### Task 2: `uwb-intro` rewritten, `uwb-frame` split out

**Files:**
- Modify: `src/course/uwb/uwb-intro.ts`, `src/course/curriculum.ts` (`COURSE_ORDER`: insert `'uwb-frame'` right after `'uwb-intro'`), `src/course/lessons.ts` (register), `tests/course/uwb-intro.test.ts` (pins that stay), `tests/course/readability.test.ts` (remove `'uwb-intro'` from `MIGRATING`), `tests/fixtures/lesson-hashes.json` (additions `uwb-frame`, `uwb-frame#0`).
- Create: `src/course/uwb/uwb-frame.ts`, `tests/course/uwb-frame.test.ts`.

**Interfaces:** consumes Task 1's `Lesson` fields, `watch` block and `MIGRATING`. Produces nothing later tasks consume. Both lessons use `uwbIntroScenario(5)` with the `uwbIntroScenario(20)` variant, unchanged.

**Content contract for `uwb-intro` — "A radio that measures time" / "一台测量时间的射频"** (module 11, 600–900 main-path words):

- `why` (draft, EN; write the ZH fresh): *Your phone can already tell you how far it is from a Wi-Fi router, roughly, from how loud the router sounds. Roughly is the problem: a wall or a hand costs more signal than ten metres of air. Ultra-wideband takes a different route. It does not ask how loud a signal is. It asks when it arrived, and light is a very reliable clock. This lesson shows the smallest possible measurement: one anchor, one phone, four timestamps, one distance.*
- `outcomes`: read the four timestamps of a ranging round off the log; say why the phone measures a round trip and the anchor a reply time; explain why a few centimetres of error is not a bug.
- `needs`: `['radio-primer', 'frame-anatomy']`.
- `terms` (≤ 4): `UWB` (ultra-wideband: a radio that sends very short pulses over a very wide band, so the moment a pulse arrives can be pinned down sharply), `anchor` (a UWB radio fixed to the building, the reference the phone measures against), `RMARKER` (the one instant inside a frame both radios agree to timestamp), `RCTU` (the tick of the ranging clock; there are tens of thousands in a microsecond).
- `picture` (headings in EN/ZH): "Loud is not the same as near" (RSSI's failure in one paragraph, no numbers); "Clicks instead of tones" (a pulse radio, why a sharp edge gives a sharp time; no table); "One question, one answer" (poll and response; both sides write down when the frame passed a fixed point inside it; a `watch` block with `jump: 0`: *Load the simulation and press play. The phone sends a poll, the anchor answers in the next slot. Zoom the timeline until you can see the tiny gap between the two lanes: that gap is the air between them.*); "Two clocks that do not agree" (each radio has its own counter starting anywhere; only differences on the same clock mean anything; the round trip minus the reply time is two flights); "How wrong is a few centimetres" (noise on every timestamp; a `watch` with `jump: 3` pointing at the range line). At most two numbers per paragraph: allowed are "5 m" and "17 ns"-class quantities; no RCTU values here.
- `numbers`: the single-sided two-way ranging formula block (keep as is); the table of the four counters (keep); the arithmetic formula block (keep); one paragraph on raw vs corrected range (4.95 / 5.00 / 5.02 m); one table "Units" (chip 2.003 ns, RCTU 15.650 ps, 1 m = 3.3356 ns = 213.1 RCTU, tick = 4.7 mm flight / 2.3 mm range) with a "where" column citing §16.4 / §10.29 in the cells; the 17 ns vs 16.678 ns rounding paragraph.
- `deeper`: the 40-bit counter wrap (17.2 s); the ±20 ppm consequence; the Wi-Fi channel's zero propagation delay by contrast.
- `sources`: the old opening paragraph, rewritten as 3–4 bullet sentences (standard, clauses, FiRa's 2 ms / 200 ms, the model values −14 dBm / −93 dBm / 100 ps / 0.2 ppm / wall delay).
- `jumps`, `variants`: unchanged. `observe`: keep items 1, 2, 3 (the fourth, about the two 2 ms slots, moves to `uwb-frame`). `tryThis`: keep the 20 m one; the "do the arithmetic yourself" one moves to `uwb-frame`. `quiz`: keep Q1 (RCTU) and Q3 (17 ns), drop Q2 (RMARKER position — moves to `uwb-frame`); add one plain question: *Why does UWB measure time instead of signal strength?* (answer: strength depends on walls and hands, arrival time depends on distance and the speed of light).

**Content contract for `uwb-frame` — "What a ranging frame is made of" / "一帧测距帧由什么组成"** (module 11, 800–1 200 words):

- `why`: *A ranging frame carries almost no data, yet it is long — far longer than a Wi-Fi acknowledgement. Every part of it earns its place: some parts let the receiver lock on, one part fixes the exact instant to timestamp, one part makes the timestamp impossible to fake. Knowing the parts tells you where the RMARKER is and why it is there.*
- `outcomes`: name the five parts of a ranging frame and what each is for; point to the RMARKER on the frame's timeline; explain why the payload is the smallest part.
- `needs`: `['uwb-intro']`. `terms` (≤ 6): SYNC, SFD, STS, PHR, PSDU, slot.
- `picture`: "Locking on before listening" (SYNC and SFD in plain words); "A sequence nobody can forge" (STS; `watch` jump to the poll: *open the poll in frame detail and read the strip left to right*); "The header and the message" (PHR, PSDU: why 30 octets); "Two slots, one round" (the 2 ms slots; the fourth old observe item's content); "Where the stamp goes" (the RMARKER = first chip after the SFD, in words).
- `numbers`: the "What 197.628 µs is made of" table (moved intact, cited cells allowed); the RMARKER arithmetic paragraph (65.128 + 8.141 = 73.269 µs) and the response (20 octets, 187.372 µs); the PSDU line (240 data bits, 48 parity, 2-symbol tail at 6.81 Mb/s).
- `deeper`: none required. `sources`: standard clauses for Clause 16 fields, §10.29.1.1 RMARKER, §10.32 SP1.
- `observe`: the old fourth item (two slots of 2 ms, response at exactly 2 000 000 ns; only 385 µs carries a frame) + one new (*open the poll in frame detail: the PSDU is the last and smallest segment*). `tryThis`: the "do the arithmetic yourself" item. `quiz`: the old Q2 (RMARKER position) + one on the STS's purpose + one on why the payload is small. `jumps`: `firstUwbPoll`, `firstUwbResp`.

- [ ] **Step 1: Split the tests first.** Create `tests/course/uwb-frame.test.ts` by moving from `uwb-intro.test.ts` the describes "what 197.628 µs is made of" (all of it) and the pins "the round is two 2 ms slots and the response leaves at exactly 2 000 000 ns"; point them at `uwbFrame` (`import { uwbFrame } from '../../src/course/uwb/uwb-frame'`). Add to both files a `lesson shape` block asserting: `isMigrated`, `lessonMinutes ≤ 20`, `lessonWords` inside the lesson's word window, every jump target found in the base run, both languages present for every string (reuse the existing bilingual walk). Keep in `uwb-intro.test.ts`: the units, the flight time on the timeline, the four lines to subtract, the range the log reports. Update the study-time test from "15–25" to "≤ 20".

- [ ] **Step 2: Run** `npx vitest run tests/course/uwb-intro.test.ts tests/course/uwb-frame.test.ts` → FAIL (uwb-frame missing; shape assertions fail).

- [ ] **Step 3: Write the two lessons** to the content contracts above. Register `uwbFrame` in `src/course/lessons.ts` beside `uwbIntro`; insert `'uwb-frame'` in `COURSE_ORDER` after `'uwb-intro'`. Remove `'uwb-intro'` from `MIGRATING`. Every number that stays in prose must be one the tests pin; every number that has no pin is either given one in the numbers section's test or removed.

- [ ] **Step 4: Hashes.** `$env:UPDATE_HASHES='1'; npx vitest run tests/engine/lesson-hashes.test.ts` then `git diff tests/fixtures/lesson-hashes.json` must show exactly two added lines (`uwb-frame`, `uwb-frame#0`) with the same hashes as `uwb-intro` / `uwb-intro#0`. Anything else: stop and report.

- [ ] **Step 5: Gates.** `npx vitest run tests/course` (readability now runs for `uwb-intro` and `uwb-frame`), full `npx vitest run`, `npx tsc -b --noEmit`, `npm run build`.

- [ ] **Step 6: Commit** `feat(course): uwb-intro rewritten zero-to-hero — a radio that measures time; frame anatomy split into uwb-frame`.

---

### Task 3: `amp-intro` rewritten, `amp-ppdu` split out

**Files:**
- Modify: `src/course/amp/amp-intro.ts`, `src/course/curriculum.ts` (`COURSE_ORDER`: `'amp-ppdu'` after `'amp-intro'`), `src/course/lessons.ts`, `tests/course/amp-intro.test.ts`, `tests/course/readability.test.ts` (remove `'amp-intro'`), `tests/fixtures/lesson-hashes.json` (additions `amp-ppdu`, `amp-ppdu#0`).
- Create: `src/course/amp/amp-ppdu.ts`, `tests/course/amp-ppdu.test.ts`.

**Interfaces:** as Task 2. Both lessons use `ampIntroScenario({250,250})` with the `{1000,1000}` variant, unchanged.

**Content contract for `amp-intro` — "A tag with no battery" / "没有电池的标签"** (module 7, 600–900 words):

- `why`: *Imagine a sticker on a milk carton that reports the fridge temperature to your router — no battery, ever. It lives on the few microwatts it can scavenge from the air. A radio that poor cannot do what every Wi-Fi station does all day: listen for a gap and take its turn. So the router has to do the asking. This lesson shows one round of that asking, from the router's first frame to the last acknowledgement.*
- `outcomes`: say why a tag cannot use carrier sense; describe one polling round in order (reserve, ask, answer, acknowledge); read a tag's slot draw and its outcome in the log.
- `needs`: `['radio-primer', 'frame-anatomy']`. `terms` (≤ 4): AMP (ambient power: a Wi-Fi feature for devices that live on harvested energy), tag (the battery-free device; the standard calls it an Active Tx non-AP AMP STA), slot (a short window the router opens for one answer), ABOC (the number a tag draws to pick its slot).
- `picture`: "A radio that cannot listen" (envelope detector, microwatts, no clock; one-line reminders of what carrier sense and NAV are); "The router asks" (CTS-to-self as "keep quiet" to the Wi-Fi neighbours — one line on what a CTS is —, then the trigger that opens slots; `watch` jump to the first trigger); "Picking a slot at random" (ABOC in plain words, why two tags can pick the same slot; `watch` jump to the first lost response); "An acknowledgement is also a clock" (the Acks pace the slots because a tag cannot count time); "What a tag never does" (no CCA_BUSY, no backoff, no IFS records — the record names are allowed).
- `numbers`: the "first round on the AP's lane" table (moved intact); the round formula block (4190 µs, 4.19 %); the "second of polling" paragraph (ten rounds, forty slots, sixteen Acks naming a tag, 10/8/2); the ACW/ABOC arithmetic paragraph; one short "link margin" paragraph (−37.4 dBm vs −72 dBm; −57.4 dBm vs −94 dBm).
- `deeper`: the protection paragraph ("Protecting the round, and who ignores it") — it belongs to `amp-coexist` conceptually but is pinned here; keep it in deeper.
- `sources`: the old opening paragraph as bullets (P802.11bp draft status, 11-24/1613r20, 11-26/1519r5, 11-26/1889r4; the model values −72 dBm, 8 dB, 10 dB).
- `observe`: items 1 and 3 (the 10 µs gaps; the inspector step-through). `tryThis`: the deafened-Door-tag experiment. `quiz`: Q1 (why a slot) + one new plain question on why two tags sometimes lose (same draw) + Q on what an Ack for an empty slot names (the router itself).

**Content contract for `amp-ppdu` — "A frame a tag can hear" / "一帧标签听得懂的帧"** (module 7, 800–1 200 words):

- `why`: *A Wi-Fi radio and a battery-free tag cannot understand each other's signals. One speaks in finely shaped waveforms; the other can only tell loud from quiet. Yet they share the same air, and the router must talk to both in one breath. The frame that does this has two halves, and its length has very little to do with the data inside it.*
- `outcomes`: name the parts of a downlink AMP frame and say which half is for whom; explain why a four-byte acknowledgement takes hundreds of microseconds; predict which frame shrinks most when the data rate rises.
- `needs`: `['amp-intro']`. `terms` (≤ 6): OOK (on–off keying: the signal is either on or off, one bit per flash), Manchester (each bit is a flash-then-dark or dark-then-flash, so the receiver never loses the rhythm), preamble (the opening of a Wi-Fi frame every Wi-Fi radio recognises; here reminded, not new), AMP-Sync, AMP-SIG, padding.
- `picture`: "Two listeners, one frame" (legacy preamble for Wi-Fi radios, then the tag's part; `watch`: open the trigger in frame detail); "Loud or quiet, and nothing in between" (OOK and Manchester in plain words); "Why the frame is padded" (the tag needs time to think before answering); "Uplink: the mirror image" (no preamble, hence Wi-Fi only senses energy); "Small frame, long airtime" (fixed overhead dominates — the Ack).
- `numbers`: the trigger airtime formula (32 + 80 + 64 + 416 + 20 + 6 = 618 µs) with its note; the "three AMP frames" table; the response-scaling paragraph (528 → 132 µs); the padding values (20 / 36 µs) in a two-row table with a cited cell; the Ack's 128 µs of 330 µs.
- `sources`: SFD sections for the PPDU format, 11-26/1519r5 §39.3.2.2 padding, the model AMP-SIG widths.
- `observe`: the old item 2 (the Ack at 1226 µs in frame detail; the empty-slot Ack at 2982 µs) + one on the trigger's segment strip. `tryThis`: the 1 Mb/s variant item (318 µs, 1670 µs, 1.67 %, CTS Duration 1620 µs). `quiz`: old Q2 (padding) and Q3 (330 µs Ack) + one on why Wi-Fi only energy-detects the uplink. `jumps`: `firstAmpTrigger`, first Ack naming a tag, first Ack for an empty slot.

- [ ] **Step 1: Split the tests first.** Move to `tests/course/amp-ppdu.test.ts`: the describe "standard constants" items about the PPDU (padding, downlink PPDU parts, uplink no preamble, the three frames' octets and airtimes, the scaling, the CTS-to-self length), "at 1 Mb/s the same round is 1670 µs", and from "what the UI shows" the Ack ID-field, the 128 µs of 330 µs and the trigger body pins. Keep in `amp-intro.test.ts`: the shape of one round (timeline table, 4190 µs, 3044/90/1056), a second of polling, the tags never carrier-sense, no NAV_SET, link budget, the deafened tag, the log lines, AMP SIFS. Add the shape block to both (as in Task 2, ≤ 20 minutes).

- [ ] **Step 2: Run** both test files → FAIL.

- [ ] **Step 3: Write the two lessons**, register, order, remove `'amp-intro'` from `MIGRATING`.

- [ ] **Step 4: Hashes** — exactly `amp-ppdu` and `amp-ppdu#0` added, equal to `amp-intro` / `amp-intro#0`.

- [ ] **Step 5: Gates** as Task 2.

- [ ] **Step 6: Commit** `feat(course): amp-intro rewritten zero-to-hero — a tag with no battery; the PPDU split into amp-ppdu`.

---

## Self-review

- Spec coverage: shape (T1), new blocks (T1), words/length/citation rules (T1 test), splitting rules and the first-id-keeps-scenario rule (T2, T3), the novice read (review loop, not a task), docs (T1), `MIGRATING` bookkeeping (T1–T3). Steps 2–7 of the spec are later plans.
- Placeholders: `textsOf` in Task 1's test is described in the line below the code; everything else is concrete.
- Type consistency: `Term { term, plain }`, `watch { text, jump? }`, `isMigrated`, `lessonBlocks`, `trackOf`, `MIGRATING` used identically in T1–T3.
