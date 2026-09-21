/**
 * The two pieces of logic in the lesson test kit (tests/course/kit.ts):
 * the memo key behind `runOf`, and the `READABILITY_INCLUDE` switch that lets
 * an implementer grade a lesson the controller has not registered yet.
 *
 * `lessonShapeSuite` itself is not tested here: it *is* tests, and it is
 * exercised by every lesson test that calls it.
 */
import { describe, it, expect } from 'vitest'
import { effectiveMigrating, includedIds, runKey, runOf } from './kit'
import { uwbIntro } from '../../src/course/uwb/uwb-intro'

describe('kit · the run memo key', () => {
  it('separates the base run, each variant and each run length', () => {
    const keys = [
      runKey('uwb-intro', undefined, 1000), runKey('uwb-intro', 0, 1000), runKey('uwb-intro', 1, 1000),
      runKey('uwb-intro', undefined, 2000), runKey('uwb-frame', undefined, 1000),
    ]
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('is the same key for the same lesson, variant and length', () => {
    expect(runKey('uwb-intro', 0, 1000)).toBe(runKey('uwb-intro', 0, 1000))
    // a variant index of 0 is not the base run, which no `?? ` fallback may conflate
    expect(runKey('uwb-intro', 0, 1000)).not.toBe(runKey('uwb-intro', undefined, 1000))
  })

  it('runOf hands back one memoised record list per key, and runs the scene for real', () => {
    const base = runOf(uwbIntro, undefined, 3_000_000)
    expect(base).toBe(runOf(uwbIntro, undefined, 3_000_000))
    expect(base.length).toBeGreaterThan(0)
    // a different variant or a different length is a different run
    expect(runOf(uwbIntro, 0, 3_000_000)).not.toBe(base)
    expect(runOf(uwbIntro, undefined, 4_000_000)).not.toBe(base)
    // the longer run of the same scene is a prefix of nothing less: it holds at least as much
    expect(runOf(uwbIntro, undefined, 4_000_000).length).toBeGreaterThanOrEqual(base.length)
  })
})

describe('kit · the READABILITY_INCLUDE switch', () => {
  it('reads a comma-separated list, trimming blanks', () => {
    expect(includedIds('uwb-sstwr,uwb-dstwr')).toEqual(['uwb-sstwr', 'uwb-dstwr'])
    expect(includedIds(' uwb-sstwr , uwb-dstwr , ')).toEqual(['uwb-sstwr', 'uwb-dstwr'])
    expect(includedIds(undefined)).toEqual([])
    expect(includedIds('')).toEqual([])
    expect(includedIds('  ')).toEqual([])
  })

  it('removes exactly the named ids from MIGRATING and nothing else', () => {
    const migrating = ['uwb-sstwr', 'uwb-dstwr', 'uwb-blocks']
    expect(effectiveMigrating(migrating, 'uwb-dstwr')).toEqual(['uwb-sstwr', 'uwb-blocks'])
    expect(effectiveMigrating(migrating, 'uwb-dstwr,uwb-blocks')).toEqual(['uwb-sstwr'])
    // an id that is not in the list, or no env var at all, leaves it exactly as it was
    expect(effectiveMigrating(migrating, 'capstone')).toEqual(migrating)
    expect(effectiveMigrating(migrating, undefined)).toEqual(migrating)
    // it only ever shrinks the list; it never adds an id to it
    expect(effectiveMigrating(migrating, 'uwb-dstwr').every((id) => migrating.includes(id))).toBe(true)
  })
})
