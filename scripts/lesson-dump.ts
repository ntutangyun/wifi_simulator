/**
 * Print a lesson as a reader meets it:
 *
 *   npx tsx scripts/lesson-dump.ts <lessonId>
 *
 * or, for the length line of every UWB (or Wi-Fi) lesson at once — the one
 * screen that shows a batch against the 30-minute ceiling:
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
 * The section budgets are gone (docs/superpowers/specs/2026-09-25-course-pace-and-diagrams.md),
 * so the line at the end reports what is left: the characters on the main path
 * and the minutes `lessonMinutes` estimates from them, against the 30-minute
 * ceiling that is now the course's only length control.
 *
 * `tsx` is a devDependency of this repo (`npx tsx --version` prints it);
 * `npx vite-node scripts/lesson-dump.ts <id>` runs it too.
 */
import { LESSONS } from '../src/course/lessons'
import { lessonChars, lessonMinutes, MAX_MINUTES, trackOf } from '../src/course/curriculum'
import type { Block, Lesson } from '../src/course/lessonKit'

/** What a lesson costs a reader, one lesson to a line. */
function budgetLine(l: Lesson): string {
  const min = lessonMinutes(l)
  return `${l.id.padEnd(16)} ${String(lessonChars(l)).padStart(5)} chars`
    + ` · ${String(min).padStart(2)}/${MAX_MINUTES} min${min > MAX_MINUTES ? '  OVER' : ''}`
}

const [id] = process.argv.slice(2)

// The whole UWB track, in reading order: no prose, just the line the per-lesson
// dump ends with.
if (id === '--all-uwb') {
  for (const l of LESSONS.filter((x) => trackOf(x) === 'uwb')) console.log(budgetLine(l))
  process.exit(0)
}
if (id === '--all-wifi') {
  for (const l of LESSONS.filter((x) => trackOf(x) === 'wifi')) console.log(budgetLine(l))
  process.exit(0)
}

if (!id) {
  console.error('usage: npx tsx scripts/lesson-dump.ts <lessonId>')
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

const out = (s = ''): void => console.log(s)
const rule = (label: string): void => out(`\n--- ${label} ---\n`)

/** One block, in reading order, with the markers a rendered page would show. */
function block(b: Block, l: Lesson): void {
  if (b.heading) out(`## ${b.heading}`)
  switch (b.kind ?? 'p') {
    case 'p':
      out((b as Extract<Block, { kind?: 'p' }>).text)
      break
    case 'watch': {
      const w = b as Extract<Block, { kind: 'watch' }>
      const target = w.jump === undefined ? '' : ` → ${l.jumps[w.jump].label}`
      out(`[WATCH${target}] ${w.text}`)
      break
    }
    case 'formula': {
      const f = b as Extract<Block, { kind: 'formula' }>
      for (const line of f.text.split('\n')) out(`    ${line}`)
      if (f.note) out(f.note)
      break
    }
    case 'table': {
      const tb = b as Extract<Block, { kind: 'table' }>
      out(tb.head.join(' | '))
      for (const row of tb.rows) out(row.join(' | '))
      break
    }
    case 'list':
      for (const i of (b as Extract<Block, { kind: 'list' }>).items) out(`- ${i}`)
      break
    case 'steps':
      (b as Extract<Block, { kind: 'steps' }>).items.forEach((i, n) => out(`${n + 1}. ${i}`))
      break
    case 'widget': {
      const w = b as Extract<Block, { kind: 'widget' }>
      out(`[WIDGET ${w.widget}]`)
      if (w.caption) out(w.caption)
      break
    }
  }
  out()
}

const titleOf = (lessonId: string): string => {
  const n = LESSONS.find((x) => x.id === lessonId)
  return n ? n.title : lessonId
}

out(`# ${lesson.title}   [${lesson.id}]`)
out()

if (lesson.body) {
  out('(unmigrated: this lesson is still one flat body)')
  out()
  for (const b of lesson.body) block(b, lesson)
} else {
  out(lesson.why!)
  out()
  rule('after this lesson you can')
  for (const o of lesson.outcomes!) out(`- ${o}`)
  rule('you need')
  for (const n of lesson.needs!) out(`- ${titleOf(n)}`)
  rule('new words')
  for (const term of lesson.terms!) out(`- ${term.term}: ${term.plain}`)
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
for (const v of lesson.variants ?? []) out(`- variant: ${v.label}`)
for (const j of lesson.jumps) out(`- jump: ${j.label}`)

rule('observe')
for (const o of lesson.observe) out(`- ${o}`)

rule('experiments')
for (const e of lesson.tryThis) out(`- ${e}`)

rule('quiz')
for (const q of lesson.quiz) {
  out(q.q)
  q.options.forEach((o, i) => out(`  ${i === q.answer ? '*' : ' '} ${o}`))
  out(`  → ${q.explain}`)
  out()
}

if (lesson.sources?.length) {
  rule('sources')
  for (const s of lesson.sources) out(`- ${s}`)
}

rule('length')
out(budgetLine(lesson))
