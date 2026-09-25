/**
 * The shared test kit of the readability programme
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md).
 *
 * A lesson test opens with `lessonShapeSuite(lesson)` — the contract checks
 * every migrated lesson owes, written once — and then pins its own empirical
 * claims against `runOf(lesson)`, a memoised simulation run so that a lesson and
 * its variants are simulated once per run length rather than once per assertion.
 *
 * What the suite checks is the lesson as DATA and as a scenario: the sections
 * are present, every string is non-empty, every jump predicate matches a record
 * in the run, the stated minutes follow the formula and fit one sitting, and a
 * split lesson loads its sibling's scene so the recorded hashes are the same run
 * twice. The rules about how the prose READS were retired on 2026-09-25
 * (docs/superpowers/specs/2026-09-25-course-pace-and-diagrams.md).
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
import {
  CHARS_PER_MINUTE, MAX_MINUTES, OBSERVE_MINUTES, TRY_MINUTES, lessonBlocks, lessonChars, lessonMinutes,
} from '../../src/course/curriculum'
import { lessonStrings } from '../../src/course/readability'

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
 * the shape, the stated minutes, the jump targets, every string present, and —
 * for the second half of a split — that it loads the first half's scene, so the
 * recorded timeline hashes are the same run twice.
 *
 * The per-lesson test file keeps everything this cannot know: the module, the
 * `needs`, the exact `terms`, the scenario schema, and every empirical claim.
 */
export function lessonShapeSuite(l: Lesson, o: LessonShapeOptions = {}): void {
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
    })

    it('fits one sitting: the stated minutes are the formula, and the formula fits', () => {
      expect(lessonBlocks(l).length).toBe(l.picture!.length + l.numbers!.length)
      const raw = lessonChars(l) / CHARS_PER_MINUTE
        + OBSERVE_MINUTES * l.observe.length + TRY_MINUTES * l.tryThis.length
      expect(lessonMinutes(l)).toBe(Math.max(5, Math.round(raw / 5) * 5))
      // The only length control the course has left: past 30 minutes a lesson is
      // teaching two topics, and the answer is to split it.
      expect(lessonMinutes(l)).toBeLessThanOrEqual(MAX_MINUTES)
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
      // The structural floor that used to stand here was deleted after it was measured:
      // `lessonStrings` returns 47 to 139 more strings than the floor demanded on every
      // lesson in the course — a table contributes one string per cell — so nothing a
      // reader would notice could ever reach it. The section checks above are what catch
      // a missing section; a rule that cannot fail reports success while grading nothing.
      expect(seen.length, l.id).toBeGreaterThan(0)
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
