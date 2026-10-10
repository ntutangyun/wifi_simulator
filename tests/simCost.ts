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
 *  - **Everything that is not simulation.** `tests/course/readability.test.ts` is among the two
 *    or three most expensive files in the suite — 47 s when that was written, 55.4 s on
 *    2026-10-10 — and executes ZERO events; 98 of 276 files simulate nothing at all. A
 *    prose-walk or a schema-parse blowup is invisible here. **How much of that other half is
 *    bounded anyway is measured below, and the answer is "most of it, and not all".**
 *  - **A partial run.** It is a ceiling, so `npx vitest run tests/course` sums less and passes.
 *    It can therefore be green on a subset for no good reason; it can never be falsely red. The
 *    teardown prints the row count beside the total so a reader can see which kind of run it was.
 *  - **Per-file cost.** One file doubling while another halves leaves the total put. The total is
 *    the thing duration follows, so the total is what is bounded; the census the failure prints
 *    is where the per-file answer is.
 *
 * ===========================================================================================
 * **THE OTHER HALF: how much of the non-simulating cost is already bounded, and by what.**
 *
 * The argument this section was written to check: the expensive files that run no simulation
 * are expensive in CORPUS SIZE — `readability.test.ts` walks every paragraph of every lesson —
 * and corpus size is already clamped from three directions, so those files cannot grow on
 * their own, only with the course, and the course's growth is bounded. The three clamps are
 * **`all.length < 11500`** (10 823 on 2026-10-10, 676 strings of headroom;
 * `tests/course/readability-rules.test.ts`), the **per-lesson main-path band `(700, 4 400)`
 * Han characters**, and the **per-section means at ±10 % of fourteen recorded figures** (both
 * in the same file). Beside them sit the equalities — 90 lessons, 32 modules, 1 925 minutes.
 *
 * **The argument is right about the file that matters and wrong as a general statement, and
 * it was measured rather than reasoned about.** Method: `LESSONS` was truncated to a prefix
 * (one line in `src/course/lessons.ts`, reverted afterwards — a prefix and not every other
 * lesson, because `needs` always points backwards, so a prefix keeps prerequisites intact),
 * and the same seven files were run alone at 90, 45 and 23 lessons with nothing else changed.
 * Per-file wall time, in that isolated run:
 *
 * ```
 *   file                                     90      45      23    events   corpus-driven?
 *   tests/course/readability.test.ts      24.9 s  11.7 s   6.4 s        0   yes  (1.00 / 0.47 / 0.26)
 *   tests/course/wifi-coverage.test.ts     1.27 s  0.71 s  0.50 s       0   yes
 *   tests/course/wording.test.ts           236 ms  157 ms   59 ms       0   yes
 *   tests/course/readability-rules.test.ts 101 ms   65 ms   45 ms       0   yes
 *   tests/engine/selectivity.test.ts       6.32 s  6.28 s  6.29 s       0   NO   (flat to 0.7 %)
 *   tests/engine/fading-stats.test.ts      4.09 s  4.10 s  4.12 s       0   NO   (flat to 0.6 %)
 *   tests/editor/uwb-planOps.test.ts      11.5 s  11.9 s  11.2 s       63   NO   (flat)
 * ```
 *
 * (Those absolute figures are from a seven-file run and are smaller than the same files in a
 * full 276-file run, where the workers compete; the ratios across a column are the point. The
 * truncated runs do go red — anything asserting a count of 90 does — but the timings above
 * belong to the per-lesson `it`s, which still run and still pass: `readability.test.ts`
 * collects 1 037 tests at 90 lessons, 537 at 45 and 291 at 23.)
 *
 * **So the first half of the argument holds, and it holds for the part that dominates.** In
 * the full run of 2026-10-10, the 98 files that execute no events cost 80.6 s of the 789.8 s
 * of per-file time (10.2 %), and `readability.test.ts` alone is 55.4 s of that 80.6 s — 69 %.
 * It tracks corpus size almost exactly (halve the corpus, halve the file), so the three clamps
 * above really do bound it, and the right place to look when it grows is the course.
 *
 * **The second half does not hold, which is why no comment here claims the other half is
 * covered.** The next two zero-event files are flat across a four-fold change in corpus:
 * `tests/engine/selectivity.test.ts` is `TRIALS = 40_000` and
 * `tests/engine/fading-stats.test.ts` is `N = 200_000` — hand-written loop counts bounded by
 * nothing but themselves, and those two figures are read back out of those two files by
 * `tests/smoke.test.ts` › `the cost ceiling's written measurement`, so this paragraph cannot
 * quietly go stale. They are 18.0 s, 22 % of the zero-event time, and the
 * remaining 95 files share 7.2 s. Worse for the ceiling's own framing,
 * `tests/editor/uwb-planOps.test.ts` costs 26.7 s in a full run on **63 events**: the ceiling
 * counts it and in no useful sense constrains it, so "zero events" understates the gap.
 *
 * **What that leaves, stated as narrowly as the measurement allows.** This ceiling plus the
 * three corpus clamps bound roughly nine tenths of the suite's cost: everything that
 * simulates, and the corpus walk that is most of what does not. They do not bound a test that
 * draws two hundred thousand samples because somebody typed 200 000, and a second ruler was
 * deliberately not built for that — the honest counter is not wall time (the argument against
 * it opens this file) and there is no deterministic unit of "non-engine work" to count the way
 * events are counted. Until there is, the discipline is the hand-written constant itself:
 * **a loop count in a test is a cost nobody is watching, and raising one is the same kind of
 * deliberate act as raising the number below.** The measurement here is what a future ruler
 * would be designed against, and it is 2026-10-10's; re-run it before trusting it.
 * ===========================================================================================
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
 *
 * **And read it for what it covers.** It bounds the simulating half. The section "THE OTHER
 * HALF" in this file's header measures how much of the rest is bounded by the corpus clamps
 * (most of it) and names the part that is bounded by nothing (two files, 18 s, hand-written
 * loop counts). A green run here is not a statement about those.
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
