# Review package: 0eaac5e..6bc18be

## Commits
6bc18be fix(course): readability checks cover list items and headings; review minors

## Files changed
 src/course/CoursePanel.tsx             | 12 ++++++++----
 src/course/curriculum.ts               |  4 ++++
 src/course/readability.ts              | 32 +++++++++++++++++++++++++++++---
 tests/course/lessons.test.ts           |  5 ++++-
 tests/course/readability-rules.test.ts | 32 +++++++++++++++++++++++++++++++-
 5 files changed, 76 insertions(+), 9 deletions(-)

## Diff
diff --git a/src/course/CoursePanel.tsx b/src/course/CoursePanel.tsx
index 1db057c..b311647 100644
--- a/src/course/CoursePanel.tsx
+++ b/src/course/CoursePanel.tsx
@@ -269,24 +269,28 @@ export function CoursePanel() {
         {t(TIERS[MODULES[lesson.module].tier])} · {t(MODULES[lesson.module].title)} · {L.minutes(lessonMinutes(lesson))}
       </div>
       <h3 style={{ margin: '4px 0 8px', fontSize: 14 }}>{idx + 1} · {t(lesson.title)}</h3>
 
       {!isMigrated(lesson) && blocks(lessonBlocks(lesson), 'body')}
 
       {isMigrated(lesson) && (
         <>
           <p style={whyStyle}>{t(lesson.why!)}</p>
 
-          <h4 style={h4}>{L.outcomes}</h4>
-          <ul style={listStyle}>
-            {(lesson.outcomes ?? []).map((o, i) => <li key={i}>{t(o)}</li>)}
-          </ul>
+          {(lesson.outcomes ?? []).length > 0 && (
+            <>
+              <h4 style={h4}>{L.outcomes}</h4>
+              <ul style={listStyle}>
+                {lesson.outcomes!.map((o, i) => <li key={i}>{t(o)}</li>)}
+              </ul>
+            </>
+          )}
 
           {(lesson.needs ?? []).length > 0 && (
             <>
               <h4 style={h4}>{L.needs}</h4>
               <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                 {lesson.needs!.map((id) => (
                   <button key={id} style={{ fontSize: 11.5 }} onClick={() => selectLesson(id)}>
                     {t(LESSONS.find((x) => x.id === id)?.title ?? { en: id, zh: id })}
                   </button>
                 ))}
diff --git a/src/course/curriculum.ts b/src/course/curriculum.ts
index 3ff3ec9..7c9d16b 100644
--- a/src/course/curriculum.ts
+++ b/src/course/curriculum.ts
@@ -128,20 +128,24 @@ export function lessonBlocks(l: Lesson): Block[] {
  * minutes of the main path, not of the depth behind the collapsed sections.
  */
 export function lessonWords(l: Lesson): number {
   const strings: string[] = []
   const walk = (x: unknown): void => {
     if (x == null || typeof x === 'function') return
     if (Array.isArray(x)) { x.forEach(walk); return }
     if (typeof x === 'object') {
       const o = x as Record<string, unknown>
       if (typeof o.en === 'string' && typeof o.zh === 'string') { strings.push(o.en); return }
+      // A Term's word is the only text a learner reads that is not bilingual —
+      // the standard spells it the same in both languages — so it needs its
+      // own line here or the "New words" table would read as free.
+      if (typeof o.term === 'string' && o.plain !== undefined) strings.push(o.term)
       for (const [k, v] of Object.entries(o)) if (k !== 'scenario' && k !== 'find') walk(v)
     }
   }
   walk({
     why: l.why, outcomes: l.outcomes, terms: l.terms, picture: l.picture, numbers: l.numbers,
     body: l.body, observe: l.observe, tryThis: l.tryThis, quiz: l.quiz,
   })
   return strings.join(' ').split(/\s+/).filter(Boolean).length
 }
 
diff --git a/src/course/readability.ts b/src/course/readability.ts
index 932d39d..a5b88c5 100644
--- a/src/course/readability.ts
+++ b/src/course/readability.ts
@@ -7,20 +7,25 @@
  * (a word counter, an acronym linter) speaks exactly the same rules the test
  * does, and so each rule can be pinned on its own.
  */
 import type { Block, L10n } from './lessonKit'
 
 /**
  * Acronyms and everyday words a reader is assumed to know before lesson one:
  * units, the two ends of a Wi-Fi link, and words any engineer meets outside
  * this course. Everything else must be introduced by a lesson's `terms`.
  * Upper-case, because `acronyms()` returns upper-case tokens.
+ *
+ * `I` and `A` are never consulted, because `acronyms()` drops single
+ * characters before any lookup. They are kept so that this reads as the whole
+ * list of words a reader is assumed to know, rather than that list minus the
+ * two that happen to be one letter long.
  */
 export const KNOWN_WORDS: ReadonlySet<string> = new Set([
   'WI-FI', 'AP', 'STA', 'MAC', 'PHY', 'DB', 'DBM', 'ID', 'RF', 'OK',
   'CPU', 'IOT', 'GPS', 'USB', 'TX', 'RX', 'US', 'EU', 'CN', 'LED',
   'PC', 'TV', 'QR', 'I', 'A', 'AM', 'PM',
 ])
 
 /**
  * A protocol's name, which is neither an acronym to introduce nor a quantity
  * to count: "802.11bp", "P802.15.4ab", "Wi-Fi 7", "Bluetooth 5.4". Removed
@@ -49,25 +54,34 @@ const QUANTITY = /\d(?:[\d,.]|\s(?=\d{3}\b))*/g
 /** CJK ideographs — the characters a Chinese paragraph is measured in. */
 const CJK = /[㐀-䶿一-鿿]/g
 
 const withoutProtocolNames = (text: string): string => text.replace(PROTOCOL_NAME, ' ')
 
 /**
  * Every acronym the reader has to already know to follow this text, in order
  * of first use and without repeats. Protocol names are not acronyms, and
  * neither are the UI's own record names (`TX_START`), which the reader reads
  * off the screen rather than out of the standard.
+ *
+ * There is deliberately no upper bound on a token's length. The spec's phrase
+ * is "a token of 2–6 upper-case letters/digits", but its own worked example of
+ * a word that must be introduced is RMARKER, which is seven; a ceiling would
+ * wave through exactly the terms this rule exists to catch.
  */
 export function acronyms(text: string): string[] {
   const out: string[] = []
   for (const m of withoutProtocolNames(text).matchAll(ACRONYM)) {
     const token = m[0].toUpperCase()
+    // The last two conditions cannot fire against ACRONYM as it stands (its
+    // class holds no `_`, and a match always opens on a letter). They are kept
+    // as the record-name and bare-number rules in executable form, so that
+    // widening ACRONYM later cannot silently start reporting `TX_START`.
     if (token.length < 2 || token.includes('_') || /^[\d-]+$/.test(token)) continue
     if (!out.includes(token)) out.push(token)
   }
   return out
 }
 
 /** How many numeric quantities a text carries; a protocol's name is not one. */
 export function numericQuantities(text: string): number {
   return withoutProtocolNames(text).match(QUANTITY)?.length ?? 0
 }
@@ -76,38 +90,50 @@ export function numericQuantities(text: string): number {
 export function enWords(text: string): number {
   return text.split(/\s+/).filter(Boolean).length
 }
 
 /** Chinese characters; Latin letters and punctuation do not count. */
 export function zhChars(text: string): number {
   return text.match(CJK)?.length ?? 0
 }
 
 /**
- * The running prose of a set of blocks: what the word and citation rules
- * measure. Table cells and formula bodies are excluded — they are where the
- * exact values and (in `numbers`) their provenance are allowed to live.
+ * The running prose of a set of blocks, in reading order: what the word and
+ * citation rules measure. A heading and the items of a list or a set of steps
+ * are prose like any other — a citation or an unintroduced acronym hides in
+ * them just as well as in a paragraph.
+ *
+ * Only two things are left out, and for the same reason: table cells and
+ * formula bodies are where the exact values live, and (inside `numbers`) a
+ * table cell is the one place the contract allows provenance.
  */
 export function paragraphTexts(blocks: Block[]): L10n[] {
   const out: L10n[] = []
   for (const b of blocks) {
+    if (b.heading) out.push(b.heading)
     switch (b.kind ?? 'p') {
       case 'p':
       case 'watch':
         out.push((b as Extract<Block, { kind?: 'p' }>).text)
         break
+      case 'list':
+      case 'steps':
+        out.push(...(b as Extract<Block, { kind: 'list' }>).items)
+        break
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
+        // `table`: the cells are the values, and the "where" column is where
+        // the provenance of the numbers is allowed to be written down.
         break
     }
   }
   return out
 }
diff --git a/tests/course/lessons.test.ts b/tests/course/lessons.test.ts
index 5370150..1b2b0ce 100644
--- a/tests/course/lessons.test.ts
+++ b/tests/course/lessons.test.ts
@@ -184,21 +184,24 @@ describe('jump targets occur in their lesson simulations', () => {
 
 describe('lesson body blocks', () => {
   const bilingual = (l: { en: string; zh: string } | undefined, where: string) => {
     expect(l, where).toBeDefined()
     expect(l!.en.trim().length, `${where} en`).toBeGreaterThan(0)
     expect(l!.zh.trim().length, `${where} zh`).toBeGreaterThan(0)
   }
 
   it('every block is bilingual and well-formed for its kind', () => {
     for (const l of LESSONS) {
-      lessonBlocks(l).forEach((b, i) => {
+      // `deeper` is off the main path, so lessonBlocks leaves it out — but the
+      // panel renders it, so it is held to the same shape as everything else.
+      const all = [...lessonBlocks(l), ...(l.deeper ?? [])]
+      all.forEach((b, i) => {
         const where = `${l.id} body[${i}]`
         if (b.heading) bilingual(b.heading, `${where} heading`)
         switch (b.kind ?? 'p') {
           case 'p':
           case 'formula':
           case 'watch':
             bilingual((b as { text: L10n }).text, `${where} text`)
             if ('note' in b && b.note) bilingual(b.note, `${where} note`)
             break
           case 'table': {
diff --git a/tests/course/readability-rules.test.ts b/tests/course/readability-rules.test.ts
index 62755d6..8991c65 100644
--- a/tests/course/readability-rules.test.ts
+++ b/tests/course/readability-rules.test.ts
@@ -1,18 +1,19 @@
 /**
  * Unit tests for the readability rule functions. They are the vocabulary the
  * course-wide readability test speaks in, so they are pinned on their own:
  * a rule that quietly stops seeing an acronym or a citation would let a dense
  * lesson through without a single test turning red.
  */
 import { describe, it, expect } from 'vitest'
-import { acronyms, numericQuantities, CITATION, enWords, zhChars, KNOWN_WORDS } from '../../src/course/readability'
+import { acronyms, numericQuantities, CITATION, enWords, zhChars, KNOWN_WORDS, paragraphTexts } from '../../src/course/readability'
+import { N, type Block } from '../../src/course/lessonKit'
 
 describe('readability rules', () => {
   it('finds acronyms and leaves protocol names, units and record names alone', () => {
     expect(acronyms('The STS — the timing sequence — follows the SFD in 802.11bp and Wi-Fi 7; see TX_START.'))
       .toEqual(['STS', 'SFD'])
     expect(acronyms('An A-MPDU behind an L-SIG')).toEqual(['A-MPDU', 'L-SIG'])
     expect(acronyms('CTS-to-self ends the NAV')).toEqual(['CTS', 'NAV'])
     expect(acronyms('5 dBm at 2.4 GHz for 16 µs')).toEqual([])
   })
   it('counts numeric quantities, grouping spaced thousands, ignoring protocol names', () => {
@@ -23,15 +24,44 @@ describe('readability rules', () => {
   it('spots citations in either language and nothing else', () => {
     for (const s of ['§10.29.1.1', 'Clause 16', 'IEEE Std 802.15.4-2024', 'P802.11bp', '11-24/1613r20', '15-23/0100r2', 'PM-87', 'D0.5', 'the draft', 'TBD', 'a model choice', '草案', '标准正文', '模型取值'])
       expect(CITATION.test(s), s).toBe(true)
     for (const s of ['a drafty room', 'the anchor answers the poll', '锚点作答'])
       expect(CITATION.test(s), s).toBe(false)
   })
   it('counts words and CJK characters', () => {
     expect(enWords('one two  three')).toBe(3)
     expect(zhChars('一二三 abc，四')).toBe(4)
   })
+  it('reads headings and list items as prose, and leaves table cells and formula bodies out', () => {
+    const blocks: Block[] = [
+      { heading: N('What the tag does'), text: N('A tag with no battery cannot listen.') },
+      { kind: 'watch', text: N('Press play and watch the second slot.') },
+      { kind: 'list', heading: N('Three things happen'), items: [N('the reader asks'), N('the tag answers')] },
+      { kind: 'steps', items: [N('arm the slot'), N('send the answer')] },
+      { kind: 'formula', heading: N('Airtime'), text: N('T = L / R'), note: N('L is the length in bits.') },
+      { kind: 'table', heading: N('Where the values come from'), head: [N('what'), N('where')], rows: [[N('16 µs'), N('§9.3.7')]] },
+      { kind: 'widget', widget: 'linkBudget', caption: N('Drag the distance slider.') },
+    ]
+    expect(paragraphTexts(blocks).map((l) => l.en)).toEqual([
+      'What the tag does', 'A tag with no battery cannot listen.',
+      'Press play and watch the second slot.',
+      'Three things happen', 'the reader asks', 'the tag answers',
+      'arm the slot', 'send the answer',
+      'Airtime', 'L is the length in bits.',
+      'Where the values come from',
+      'Drag the distance slider.',
+    ])
+  })
+  it('so a citation hiding in a list item or a heading is caught', () => {
+    const sneaky: Block[] = [
+      { kind: 'list', items: [N('the anchor answers'), N('the reply time is fixed per §10.29.1.1')] },
+      { kind: 'p', heading: N('Clause 16 in one picture'), text: N('The tag answers in its slot.') },
+    ]
+    expect(paragraphTexts(sneaky).some((l) => CITATION.test(l.en))).toBe(true)
+    expect(paragraphTexts(sneaky).filter((l) => CITATION.test(l.en)).map((l) => l.en))
+      .toEqual(['the reply time is fixed per §10.29.1.1', 'Clause 16 in one picture'])
+  })
   it('the baseline knows units and everyday words only', () => {
     for (const w of ['AP', 'STA', 'DBM', 'WI-FI']) expect(KNOWN_WORDS.has(w)).toBe(true)
     for (const w of ['STS', 'RMARKER', 'OOK', 'TXOP', 'SIFS']) expect(KNOWN_WORDS.has(w)).toBe(false)
   })
 })
