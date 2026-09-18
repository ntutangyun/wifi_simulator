/**
 * Guard: every lesson scenario, lesson variant and household preset replays
 * to the timeline hash recorded in tests/fixtures/lesson-hashes.json.
 * Regenerate deliberately with UPDATE_HASHES=1 npx vitest run tests/engine/lesson-hashes.test.ts
 * and explain the change in the commit message.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { LESSONS } from '../../src/course/lessons'
import { HOUSEHOLDS } from '../../src/model/households'
import { Simulation } from '../../src/engine/simulation'
import type { Scenario } from '../../src/model/scenario'

const MS = 1_000_000
const RUN_NS = 150 * MS
const FIXTURE = path.resolve(__dirname, '../fixtures/lesson-hashes.json')

function scenarios(): { id: string; sc: Scenario }[] {
  const out: { id: string; sc: Scenario }[] = []
  for (const l of LESSONS) {
    out.push({ id: l.id, sc: l.scenario() })
    l.variants?.forEach((v, i) => out.push({ id: `${l.id}#${i}`, sc: v.scenario() }))
  }
  for (const h of HOUSEHOLDS) out.push({ id: `household:${h.id}`, sc: h.scenario() })
  return out
}

describe('timeline hashes of every shipped scenario', () => {
  const hashes: Record<string, string> = {}
  for (const { id, sc } of scenarios()) {
    const sim = new Simulation(sc)
    sim.runUntil(RUN_NS)
    hashes[id] = sim.timelineHash()
  }
  if (process.env.UPDATE_HASHES) {
    fs.mkdirSync(path.dirname(FIXTURE), { recursive: true })
    fs.writeFileSync(FIXTURE, JSON.stringify(hashes, null, 2) + '\n')
  }

  it('match the recorded fixture', () => {
    const recorded = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as Record<string, string>
    expect(hashes).toEqual(recorded)
  })
})
