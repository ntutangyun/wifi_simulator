### Task 1: Baseline timeline-hash fixture

Records the hash of every lesson scenario, lesson variant and household preset **before** any engine change, so every later task proves it changed nothing.

**Files:**
- Create: `tests/engine/lesson-hashes.test.ts`
- Create: `tests/fixtures/lesson-hashes.json` (generated)

**Interfaces:**
- Consumes: `LESSONS` from `src/course/lessons.ts`, `HOUSEHOLDS` from `src/model/households.ts` (check the export name with `grep -n "^export const" src/model/households.ts`; if it is not `HOUSEHOLDS`, use the exported array of `Household`), `Simulation.timelineHash()`.
- Produces: the fixture every later task runs against.

- [ ] **Step 1: Write the test that computes and compares hashes**

```ts
// tests/engine/lesson-hashes.test.ts
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
```

- [ ] **Step 2: Generate the fixture**

Run: `UPDATE_HASHES=1 npx vitest run tests/engine/lesson-hashes.test.ts` (in PowerShell: `$env:UPDATE_HASHES='1'; npx vitest run tests/engine/lesson-hashes.test.ts; Remove-Item Env:UPDATE_HASHES`)
Expected: PASS, and `tests/fixtures/lesson-hashes.json` exists with one hex string per scenario.

- [ ] **Step 3: Run without the env var to confirm it compares**

Run: `npx vitest run tests/engine/lesson-hashes.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/engine/lesson-hashes.test.ts tests/fixtures/lesson-hashes.json
git commit -m "test(engine): record the timeline hash of every shipped scenario"
```

---

