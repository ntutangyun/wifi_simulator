/**
 * Guard: every lesson scenario, lesson variant and household preset replays
 * to the timeline hash recorded in tests/fixtures/lesson-hashes.json.
 * Regenerate deliberately with UPDATE_HASHES=1 npx vitest run tests/engine/lesson-hashes.test.ts
 * and explain the change in the commit message.
 *
 * ## What this fixture anchors, and what it is blind to
 *
 * **It anchors the TIMING, not the content.** `Simulation.timelineHash` folds `t:seq:type` and
 * nothing else (`updateHash`, src/engine/simulation.ts), so a change that moves no record in
 * time, adds none and removes none — one that only rewrites a FIELD of a record that was
 * already there — passes this file untouched. Nobody should read a green run here as "the
 * recorded behaviour is unchanged".
 *
 * **There is a real pair in the fixture that proves it, and it is better than any description.**
 * `wan-rtt` and `edca-tamper#9` both record `9a3160d4`. They are not the same scene: the second
 * is the first with a `txopHog` tamper preset hung on the phone. The preset rewrites 87
 * `TXOP_START.untilNs` fields from 2 528 000 ns to 8 000 000 ns, and because a lone gaming
 * station never has a second frame to hold the medium for, not one other record moves. Same
 * record count, same instants, same types — same hash. That cheat is invisible here, by
 * construction, and the two ids sitting on one hash is what makes it legible.
 *
 * **So the evidence for a field-level claim has to be a field-level diff.** That is what
 * `tests/engine/tamper-inert.test.ts` does: it compares the whole record array record by record
 * and reports which TYPES and which FIELDS moved, which is the only ruler that can tell "the
 * switch did nothing" from "the switch printed a number and nothing followed". When a slice
 * changes what a record SAYS rather than when it happens, this fixture is not the guard — that
 * file's shape is.
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
