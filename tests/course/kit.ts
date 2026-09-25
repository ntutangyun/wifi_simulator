/**
 * The shared test kit of the readability programme
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md).
 *
 * A lesson test opens with `lessonShapeSuite(lesson, { proseMax })` — the
 * contract checks every migrated lesson owes, written once — and then pins its
 * own empirical claims against `runOf(lesson)`, a memoised simulation run so
 * that a lesson and its variants are simulated once per run length rather than
 * once per assertion.
 *
 * It also holds the `READABILITY_INCLUDE` switch: an implementer rewriting a
 * lesson the controller has not registered yet grades it with
 *
 *   READABILITY_INCLUDE=uwb-sstwr,uwb-dstwr npx vitest run tests/course
 *
 * which removes those ids from MIGRATING for that run alone, so nobody has to
 * edit tests/course/readability.test.ts (a shared, controller-owned file) to
 * see their own lesson judged.
 *
 * This file is not itself a test file (no `.test.ts`); the logic in it — the
 * memo key and the include switch — is tested by tests/course/kit.test.ts.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import type { Scenario } from '../../src/model/scenario'
import { isMigrated, type Lesson } from '../../src/course/lessonKit'
import { LESSONS } from '../../src/course/lessons'
import { OBSERVE_MINUTES, TRY_MINUTES, lessonBlocks, lessonMinutes, lessonWords } from '../../src/course/curriculum'
import { BUDGETS, CITATION, lessonBudget, lessonStrings, paragraphTexts } from '../../src/course/readability'

const MS = 1_000_000
/** Long enough for a UWB ranging block and a Wi-Fi round; an AMP lesson asks for 1000 ms. */
export const DEFAULT_RUN_NS = 30 * MS

// ---------------------------------------------------------------------------
// shared simulation runs
// ---------------------------------------------------------------------------

/**
 * The memo key of one run: the lesson, which scenario of it, and how long it
 * ran. The base scenario is spelled `base` rather than left to a `??` fallback,
 * because variant 0 is falsy and must not collapse into it.
 */
export const runKey = (id: string, variant: number | undefined, ns: number): string =>
  `${id}|${variant === undefined ? 'base' : `v${variant}`}|${ns}`

/**
 * Module-level, so every suite in one worker that asks for the same lesson,
 * variant and run length shares one simulation.
 */
const runs = new Map<string, TLRecord[]>()

/**
 * The records of a lesson's base scenario, or of `lesson.variants[variant]`,
 * run to `ns` nanoseconds — memoised on {@link runKey}.
 *
 * The array handed back is shared: a caller filters or copies it, never sorts
 * or splices it in place.
 */
export function runOf(l: Lesson, variant?: number, ns: number = DEFAULT_RUN_NS): TLRecord[] {
  const key = runKey(l.id, variant, ns)
  const hit = runs.get(key)
  if (hit) return hit
  const s: Scenario = variant === undefined ? l.scenario() : l.variants![variant].scenario()
  const rs = [...new Simulation(s).runUntil(ns).records]
  runs.set(key, rs)
  return rs
}

/** The records of one type, narrowed — the filter every lesson test opens with. */
export const ofType = <K extends TLRecord['type']>(rs: TLRecord[], type: K): Extract<TLRecord, { type: K }>[] =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type)

// ---------------------------------------------------------------------------
// READABILITY_INCLUDE
// ---------------------------------------------------------------------------

/** The ids of `READABILITY_INCLUDE`, trimmed; an unset or blank variable names none. */
export function includedIds(env: string | undefined): string[] {
  return (env ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

/**
 * MIGRATING as this run sees it: the recorded list minus the ids of
 * `READABILITY_INCLUDE`. It only ever shrinks the list — an id the variable
 * names but MIGRATING does not hold changes nothing — so the switch can admit
 * a lesson to the contract test but never excuse one from it.
 */
export function effectiveMigrating(migrating: readonly string[], env: string | undefined): string[] {
  const included = includedIds(env)
  return migrating.filter((id) => !included.includes(id))
}

// ---------------------------------------------------------------------------
// the shape suite
// ---------------------------------------------------------------------------

export interface LessonShapeOptions {
  /**
   * The content contract's prose window: `lessonWords` without `observe`,
   * `tryThis` and `quiz` — what the reader reads before the simulator.
   */
  proseMax: number
  /** Main-path words. `BUDGETS.totalMax`, or `BUDGETS.openerMax` for a track's first lesson. */
  totalMax?: number
  /** The lesson whose scene this one is the second half of: their hashes must be equal. */
  sameSceneAs?: string
  /** Run length for the jump-target check; an AMP lesson needs 1000 ms. */
  runNs?: number
}

/** Both recorded hash fixtures; a lesson appears in whichever one covers its radio. */
const FIXTURES = ['lesson-hashes.json', 'uwb-record-hashes.json']
  .map((f) => path.resolve(__dirname, '../fixtures', f))

/**
 * Every check the lesson contract asks of a migrated lesson, as one `describe`:
 * the shape, the section budgets and the stated minutes, the jump targets, the
 * bilingual walk, and — for the second half of a split — that it loads the
 * first half's scene, so the recorded timeline hashes are the same run twice.
 *
 * The per-lesson test file keeps everything this cannot know: the module, the
 * `needs`, the exact `terms`, the scenario schema, and every empirical claim.
 */
export function lessonShapeSuite(l: Lesson, o: LessonShapeOptions): void {
  const ns = o.runNs ?? DEFAULT_RUN_NS
  describe(`${l.id} · lesson shape`, () => {
    it('is written to the zero-to-hero contract', () => {
      expect(isMigrated(l)).toBe(true)
      expect(l.picture!.length).toBeGreaterThan(0)
      expect(l.numbers!.length).toBeGreaterThan(0)
      expect(l.sources!.length).toBeGreaterThan(0)
      // the reader is sent to the simulator before the mechanism is finished
      const firstWatch = l.picture!.findIndex((b) => b.kind === 'watch')
      expect(firstWatch).toBeGreaterThanOrEqual(0)
      expect(firstWatch).toBeLessThan(3)
      // depth may be dense, but its provenance still belongs in `sources`
      for (const p of paragraphTexts(l.deeper ?? [])) {
        expect(CITATION.test(p), `deeper: ${p.slice(0, 80)}`).toBe(false)
      }
    })

    it('fits one sitting: the section budgets, the prose window and the minutes ceiling', () => {
      // The spec's "Length and pace", printed by `npx tsx scripts/lesson-dump.ts <id> en`.
      const b = lessonBudget(l)
      expect(b.picture, 'why + outcomes + terms + picture').toBeLessThanOrEqual(BUDGETS.picture)
      expect(b.numbers, 'numbers').toBeLessThanOrEqual(BUDGETS.numbers)
      expect(b.practice, 'observe + tryThis + quiz').toBeLessThanOrEqual(BUDGETS.practice)
      expect(b.total).toBe(lessonWords(l))
      expect(lessonWords(l)).toBeGreaterThanOrEqual(BUDGETS.totalMin)
      expect(lessonWords(l)).toBeLessThanOrEqual(o.totalMax ?? BUDGETS.totalMax)
      const prose = lessonWords({ ...l, observe: [], tryThis: [], quiz: [] })
      expect(prose, 'why + outcomes + terms + picture + numbers').toBeLessThanOrEqual(o.proseMax)
      expect(lessonBlocks(l).length).toBe(l.picture!.length + l.numbers!.length)
      // the stated minutes are the formula's, and the formula fits a sitting
      const raw = lessonWords(l) / 150 + OBSERVE_MINUTES * l.observe.length + TRY_MINUTES * l.tryThis.length
      expect(lessonMinutes(l)).toBe(Math.max(5, Math.round(raw / 5) * 5))
      expect(lessonMinutes(l)).toBeLessThanOrEqual(BUDGETS.minutes)
    })

    it('every jump target occurs in the base run', () => {
      const rs = runOf(l, undefined, ns)
      for (const j of l.jumps) expect(rs.some(j.find), j.label).toBe(true)
      for (const b of l.picture!) {
        if (b.kind === 'watch' && b.jump !== undefined) expect(l.jumps[b.jump]).toBeDefined()
      }
    })

    it('every string a learner reads is there', () => {
      // One walk for every lesson test: src/course/readability.ts. `title`, the variant
      // labels and the jump labels are the chrome around a lesson, so they are added here.
      const seen: string[] = [
        ...lessonStrings(l), l.title,
        ...(l.variants ?? []).map((v) => v.label), ...l.jumps.map((j) => j.label),
      ]
      // a structural floor rather than a smoke bound: one string per outcome, term, block,
      // source, observation, experiment and (question + options + explanation) of a quiz,
      // plus why, the title, every variant label and every jump label.
      const floor = 2 + l.outcomes!.length + l.terms!.length + l.picture!.length + l.numbers!.length
        + (l.deeper?.length ?? 0) + l.sources!.length + l.observe.length + l.tryThis.length
        + 3 * l.quiz.length + (l.variants?.length ?? 0) + l.jumps.length
      expect(seen.length).toBeGreaterThanOrEqual(floor)
      for (const s of seen) {
        expect(s.trim().length, s).toBeGreaterThan(0)
      }
    })

    if (o.sameSceneAs !== undefined) {
      it(`loads ${o.sameSceneAs}'s own scene, so the split costs the reader nothing`, () => {
        const first = LESSONS.find((x) => x.id === o.sameSceneAs)
        expect(first, o.sameSceneAs).toBeDefined()
        // Scenario for scenario, so the two ids replay to the same timeline hash
        // value for value: the fixture addition is a copy, not a new run.
        expect(l.scenario()).toEqual(first!.scenario())
        expect((l.variants ?? []).map((v) => v.scenario()))
          .toEqual((first!.variants ?? []).map((v) => v.scenario()))
        // and once the controller has registered the split, the fixtures say so too
        const keys = ['', ...(l.variants ?? []).map((_v, i) => `#${i}`)]
        for (const file of FIXTURES) {
          const rec = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>
          for (const k of keys) {
            const mine = rec[`${l.id}${k}`]
            const theirs = rec[`${o.sameSceneAs}${k}`]
            if (mine !== undefined && theirs !== undefined) expect(mine, `${l.id}${k}`).toBe(theirs)
          }
        }
      })
    }
  })
}
