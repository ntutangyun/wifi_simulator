/**
 * Print a lesson as a reader meets it, in one language:
 *
 *   npx tsx scripts/lesson-dump.ts <lessonId> <en|zh>
 *
 * or, for the budget line of every UWB (or Wi-Fi) lesson at once — the one
 * screen that shows a batch's word counts against the spec's windows:
 *
 *   npx tsx scripts/lesson-dump.ts --all-uwb
 *   npx tsx scripts/lesson-dump.ts --all-wifi
 *
 * The novice read of the readability programme
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md, "Reviewing
 * a lesson") is done on this dump, not on the TypeScript source: a reviewer
 * asked to judge whether a lesson can be followed should read what the panel
 * renders — the main path in order, tables as rows, the collapsed sections
 * last — and nothing else.
 *
 * It is built on `lessonStrings` / `paragraphTexts` / `lessonBudget` in
 * src/course/readability.ts, so the words it prints and the counts it reports
 * are the words and counts the contract test measures. The budget line at the
 * end is the spec's "Length and pace" section budgets.
 *
 * `tsx` is a devDependency of this repo (`npx tsx --version` prints it);
 * `npx vite-node scripts/lesson-dump.ts <id> <lang>` runs it too.
 */
import { LESSONS } from '../src/course/lessons'
import { lessonMinutes, lessonWords, trackOf } from '../src/course/curriculum'
import { BUDGETS, lessonBudget } from '../src/course/readability'
import type { Block, L10n, Lesson } from '../src/course/lessonKit'

/** The spec's "Length and pace" section budgets, one lesson to a line. */
function budgetLine(l: Lesson): string {
  const b = lessonBudget(l)
  return `${l.id.padEnd(16)} picture ${String(b.picture).padStart(4)}/${BUDGETS.picture}`
    + ` · numbers ${String(b.numbers).padStart(4)}/${BUDGETS.numbers}`
    + ` · practice ${String(b.practice).padStart(4)}/${BUDGETS.practice}`
    + ` · total ${String(b.total).padStart(4)} (${lessonWords(l)} words, ${lessonMinutes(l)} min)`
}

const [id, langArg] = process.argv.slice(2)

// The whole UWB track's budgets, in reading order: no prose, just the line the
// per-lesson dump ends with. An unmigrated lesson has no sections, so its words
// land in the total alone — which is how it shows up as still to be rewritten.
if (id === '--all-uwb') {
  for (const l of LESSONS.filter((x) => trackOf(x) === 'uwb')) console.log(budgetLine(l))
  process.exit(0)
}
if (id === '--all-wifi') {
  for (const l of LESSONS.filter((x) => trackOf(x) === 'wifi')) console.log(budgetLine(l))
  process.exit(0)
}

const lang: 'en' | 'zh' = langArg === 'zh' ? 'zh' : 'en'

if (!id || (langArg !== undefined && langArg !== 'en' && langArg !== 'zh')) {
  console.error('usage: npx tsx scripts/lesson-dump.ts <lessonId> <en|zh>')
  console.error('       npx tsx scripts/lesson-dump.ts --all-uwb')
  console.error('       npx tsx scripts/lesson-dump.ts --all-wifi')
  console.error(`lessons: ${LESSONS.map((l) => l.id).join(' ')}`)
  process.exit(2)
}

const lesson = LESSONS.find((l) => l.id === id)
if (!lesson) {
  console.error(`no lesson "${id}". lessons: ${LESSONS.map((l) => l.id).join(' ')}`)
  process.exit(2)
}

const t = (s: L10n): string => s[lang]
const out = (s = ''): void => console.log(s)
const rule = (label: string): void => out(`\n--- ${label} ---\n`)

/** One block, in reading order, with the markers a rendered page would show. */
function block(b: Block, l: Lesson): void {
  if (b.heading) out(`## ${t(b.heading)}`)
  switch (b.kind ?? 'p') {
    case 'p':
      out(t((b as Extract<Block, { kind?: 'p' }>).text))
      break
    case 'watch': {
      const w = b as Extract<Block, { kind: 'watch' }>
      const target = w.jump === undefined ? '' : ` → ${t(l.jumps[w.jump].label)}`
      out(`[WATCH${target}] ${t(w.text)}`)
      break
    }
    case 'formula': {
      const f = b as Extract<Block, { kind: 'formula' }>
      for (const line of t(f.text).split('\n')) out(`    ${line}`)
      if (f.note) out(t(f.note))
      break
    }
    case 'table': {
      const tb = b as Extract<Block, { kind: 'table' }>
      out(tb.head.map(t).join(' | '))
      for (const row of tb.rows) out(row.map(t).join(' | '))
      break
    }
    case 'list':
      for (const i of (b as Extract<Block, { kind: 'list' }>).items) out(`- ${t(i)}`)
      break
    case 'steps':
      (b as Extract<Block, { kind: 'steps' }>).items.forEach((i, n) => out(`${n + 1}. ${t(i)}`))
      break
    case 'widget': {
      const w = b as Extract<Block, { kind: 'widget' }>
      out(`[WIDGET ${w.widget}]`)
      if (w.caption) out(t(w.caption))
      break
    }
  }
  out()
}

const titleOf = (lessonId: string): string => {
  const n = LESSONS.find((x) => x.id === lessonId)
  return n ? t(n.title) : lessonId
}

out(`# ${t(lesson.title)}   [${lesson.id}, ${lang}]`)
out()

if (lesson.body) {
  out('(unmigrated: this lesson is still one flat body)')
  out()
  for (const b of lesson.body) block(b, lesson)
} else {
  out(t(lesson.why!))
  out()
  rule('after this lesson you can')
  for (const o of lesson.outcomes!) out(`- ${t(o)}`)
  rule('you need')
  for (const n of lesson.needs!) out(`- ${titleOf(n)}`)
  rule('new words')
  for (const term of lesson.terms!) out(`- ${term.term}: ${t(term.plain)}`)
  rule('the picture')
  for (const b of lesson.picture!) block(b, lesson)
  rule('now the numbers')
  for (const b of lesson.numbers!) block(b, lesson)
  if (lesson.deeper?.length) {
    rule('deeper')
    for (const b of lesson.deeper) block(b, lesson)
  }
}

rule('load and jump')
for (const v of lesson.variants ?? []) out(`- variant: ${t(v.label)}`)
for (const j of lesson.jumps) out(`- jump: ${t(j.label)}`)

rule('observe')
for (const o of lesson.observe) out(`- ${t(o)}`)

rule('experiments')
for (const e of lesson.tryThis) out(`- ${t(e)}`)

rule('quiz')
for (const q of lesson.quiz) {
  out(t(q.q))
  q.options.forEach((o, i) => out(`  ${i === q.answer ? '*' : ' '} ${t(o)}`))
  out(`  → ${t(q.explain)}`)
  out()
}

if (lesson.sources?.length) {
  rule('sources')
  for (const s of lesson.sources) out(`- ${t(s)}`)
}

rule('budget')
out(budgetLine(lesson))
