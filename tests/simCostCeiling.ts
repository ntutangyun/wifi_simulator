/**
 * The only hook that runs after every worker has finished: `globalSetup`'s teardown.
 *
 * `tests/simCost.ts` says at length what is counted, why that quantity and what the ceiling does
 * not cover. This file is the plumbing: clear the rows before the run so nothing stale is summed,
 * add them up after it, and throw if the total has passed `EVENT_CEILING`.
 *
 * A throw here is reported under the heading **Startup Error** — vitest has no better label for a
 * global hook — and the run exits non-zero while the test summary above it still reads green.
 * That mismatch is why the message below opens by saying what it is instead of what went wrong.
 */
import fs from 'node:fs'
import { COST_DIR, EVENT_CEILING, readRows } from './simCost'

export default function setup(): () => void {
  fs.rmSync(COST_DIR, { recursive: true, force: true })
  return () => {
    const rows = readRows()
    const total = rows.reduce((n, r) => n + r.events, 0)
    if (total <= EVENT_CEILING) return
    const top = [...rows]
      .sort((a, b) => b.events - a.events)
      .slice(0, 12)
      .map((r) => `  ${r.events.toString().padStart(10)}  ${r.file.replace(/^.*[\\/]tests[\\/]/, 'tests/')}`)
      .join('\n')
    throw new Error(
      'THE UNIT SUITE\'S SIMULATED WORK HAS PASSED ITS CEILING. Every test above passed; this is'
      + ' a cost census, not a broken test.\n'
      + `  ${total} engine events executed across ${rows.length} test files,`
      + ` against a ceiling of ${EVENT_CEILING}.\n`
      + '  The number is deterministic: the same edit produces the same total on every machine,'
      + ' so this is about what was added, not about this machine.\n'
      + '  What to do, and what not to: tests/simCost.ts, EVENT_CEILING. The answer is usually'
      + ' fewer seeds or a shorter run, not a bigger number.\n'
      + '  The most expensive files in this run, which is where the growth will be:\n'
      + top,
    )
  }
}
