/**
 * **The test suite's own cost, bounded.**
 *
 * Four things about this course are watched by a number somebody has to read when it moves: the
 * prose corpus (`all.length < 11500`, tests/course/readability-rules.test.ts), the stated minutes
 * (`toBe(1_925)`, tests/course/readability.test.ts), the declared limits (the 292 ratchet,
 * tests/course/limits.test.ts) and the lesson and module counts. **How long the unit suite takes
 * was watched by nothing**, and it is the next bound that will arrive: one whole run is 166 s of
 * wall and 752 s of per-file time across the workers, and the three most expensive files are
 * 68 s, 49 s and 47 s on their own.
 *
 * **A wall-clock assertion is the wrong instrument** and this is deliberately not one. The same
 * suite on a slower machine takes twice as long and on a loaded one three times, so a clock bound
 * is either flaky or so loose it never fires — and it would fire on the machine rather than on
 * the edit. The engine, though, is deterministic: given the same scenarios it does exactly the
 * same work. So the WORK is bounded instead, and the work is counted exactly.
 *
 * **What is counted and why that one.** `SIM_COST.events` — events actually executed by
 * `Simulation.runUntil`'s loop. `src/engine/events.ts` holds the measurements behind choosing it
 * over simulated nanoseconds and emitted records; the short version is that it is the quantity
 * that best predicts per-file wall time (Spearman +0.890 against +0.715 and +0.882) and the only
 * one of the three that is a count of work rather than of model time or of output.
 *
 * Measured twice over two independent full runs: **37 982 445 events, identical per file in both
 * runs** — the same 275 numbers, not merely the same sum. (A third, earlier measurement through a
 * monkey-patched prototype differed by 1 304 events in one file; that was the patch reaching a
 * second copy of the module under `vi.mock`, not the engine wandering.)
 *
 * **What this does NOT bound, stated so nobody reads it as more than it is:**
 *  - **Everything that is not simulation.** `tests/course/readability.test.ts` is the third most
 *    expensive file in the suite at 47 s and executes ZERO events; 98 of 275 files simulate
 *    nothing at all. A prose-walk or a schema-parse blowup is invisible here. The corpus size
 *    guard is what watches the first of those.
 *  - **A partial run.** It is a ceiling, so `npx vitest run tests/course` sums less and passes.
 *    It can therefore be green on a subset for no good reason; it can never be falsely red. The
 *    teardown prints the row count beside the total so a reader can see which kind of run it was.
 *  - **Per-file cost.** One file doubling while another halves leaves the total put. The total is
 *    the thing duration follows, so the total is what is bounded; the census the failure prints
 *    is where the per-file answer is.
 *
 * **The mechanics, and why they are what they are.** Vitest isolates each test file, so no
 * process sees the whole run: a worker counts its own file and writes one row, and the only hook
 * that runs after every worker is `globalSetup`'s teardown (`tests/simCostCeiling.ts`), which
 * sums the rows and throws. Rows are written one file per test path rather than appended, so a
 * watch-mode re-run overwrites its own row instead of double-counting it, and they live under
 * `node_modules/` so two worktrees running at once cannot read each other's.
 *
 * **Three files rather than two**, and the reason is a vitest rule: `globalSetup` runs in a
 * different context and may not import `vitest` at all, so whatever the teardown shares with the
 * per-file hook has to live somewhere neither `afterAll` nor `expect` is in scope. That is this
 * file. `tests/simCostRow.ts` is the per-file hook; `tests/simCostCeiling.ts` is the teardown.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Where the per-test-file rows go. Under `node_modules/`: ignored by git, and per worktree. */
export const COST_DIR = path.join(ROOT, 'node_modules', '.vitest-sim-cost')

/**
 * The ceiling, and the margin behind it.
 *
 * 40 000 000 against **37 982 445 measured on 2026-10-10**, so the margin is 2 017 555 events —
 * 5.3 %, and about three fifths of the single most expensive file in the suite
 * (`tests/course/claim-to-contribution.test.ts`, 3 414 853 events for 68 s of wall). That is
 * chosen to be crossed by the FIRST lesson test of that size rather than the third, which is the
 * same choice `all.length < 11500` made at 6 % over 10 823.
 *
 * **If this is red, do not raise it on the way past.** Red means the suite's simulated work grew
 * by a twentieth, which on 2026-10-10's machine is about a minute of wall time, and the decision
 * owed is whether the new round is worth it — seed counts and run lengths are the usual place to
 * look, and a 60-seed sweep is worth more than a 120-seed one far more often than the reverse.
 * Raising the number is a deliberate act that owes one line saying what was added and what it
 * bought, the way the 1 925 equality above it does.
 */
export const EVENT_CEILING = 40_000_000

/** One row's file name: the test path, flattened, so a re-run overwrites rather than appends. */
const rowFile = (testPath: string): string =>
  path.join(COST_DIR, testPath.replace(/[^a-zA-Z0-9]+/g, '_').slice(-180) + '.json')

export interface CostRow { file: string; events: number }

/** Every row written so far, newest write per test path. */
export function readRows(): CostRow[] {
  if (!fs.existsSync(COST_DIR)) return []
  const out: CostRow[] = []
  for (const name of fs.readdirSync(COST_DIR)) {
    if (!name.endsWith('.json')) continue
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(COST_DIR, name), 'utf8')) as CostRow)
    } catch {
      // a half-written row is a lost row, which can only make the ceiling greener; the teardown
      // prints the row count so a reader can see it happened
    }
  }
  return out
}

/** This test file's row. Named by the test path so a re-run overwrites rather than appends. */
export function writeRow(file: string, events: number): void {
  fs.mkdirSync(COST_DIR, { recursive: true })
  fs.writeFileSync(rowFile(file), JSON.stringify({ file, events }), 'utf8')
}
