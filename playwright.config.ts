/**
 * The browser side of the test suite: one spec, and it is about width.
 *
 * Why it exists at all. Four separate defects in this app showed up only at
 * 470 CSS px — the reader's foldable phone shut — and not one of them was found
 * by looking: each turned up by accident, in a slice about something else, after
 * a person had walked into it on the device. Nothing in `npm test` knows what a
 * viewport is: `vitest` runs `environment: 'node'`, there is no jsdom and no
 * testing-library in the repository, and `tests/ui/appGrid.test.ts` — the one
 * test about layout — reads `App.tsx` as text and matches regular expressions
 * against it. A geometry defect cannot be caught that way, and jsdom could not
 * catch it either: jsdom performs no layout, so every `clientWidth` it reports
 * is 0.
 *
 * So this is a real browser against the real dev server, which is also how the
 * measurements quoted all over `src/ui/layout.ts` were taken. It is deliberately
 * kept out of `npm test`: the unit suite is 7 000-odd assertions in two minutes
 * and must stay installable with `npm ci` alone, while this needs a 130 MB
 * browser download. `npm run test:ui` runs it, and
 * `.github/workflows/ui-narrow.yml` is the job that does so in CI.
 *
 * The two phone projects set `hasTouch`, because `index.css` gives every control
 * a bigger box under `(pointer: coarse)` and the device only ever reports
 * coarse — a width measured with a mouse is a measurement of a screen nobody
 * touches that way, and that mistake has already misled one brief in this
 * repository. The spec asserts the pointer type it got rather than trusting the
 * flag: an instrument that silently measured the wrong thing is how three of the
 * four defects survived this long.
 */
import { defineConfig, devices } from '@playwright/test'

/** Not 5173: three dev servers from earlier slices are parked on the usual ports. */
const PORT = 5317
const baseURL = `http://127.0.0.1:${PORT}`

/** The foldable this app is read on, shut and open, and a desktop window as the control. */
export const VIEWPORTS = {
  'foldable-shut': { width: 470, height: 511 },
  'foldable-open': { width: 939, height: 511 },
  desktop: { width: 1440, height: 900 },
} as const

export default defineConfig({
  testDir: 'tests/e2e',
  // The three projects share one dev server and the whole suite is a few dozen
  // navigations; parallelism would buy noise rather than time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['line']] : [['list']],
  use: { baseURL },
  projects: [
    /*
     * Runs first, and everything below depends on it: `reuseExistingServer` means this suite
     * trusts whatever is already answering on `PORT`, and until 2026-10-10 the only thing
     * checking that it was this working tree's code was a person remembering to `curl` it.
     * The reuse stays — owning the server brings back the teardown documented at the foot of
     * this file — so the identity is verified instead, by writing a nonce into this tree and
     * asking the server for it. `tests/e2e/server-identity.setup.ts` says what that does and
     * does not prove, and why the body is read rather than the status code.
     *
     * `testMatch` is needed only here: Playwright's default matches `*.spec.ts` and
     * `*.test.ts`, so the three projects below do not pick a `*.setup.ts` up.
     */
    {
      name: 'server-identity',
      testMatch: /server-identity\.setup\.ts$/,
    },
    {
      name: 'foldable-shut',
      dependencies: ['server-identity'],
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS['foldable-shut'], hasTouch: true },
    },
    {
      name: 'foldable-open',
      dependencies: ['server-identity'],
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS['foldable-open'], hasTouch: true },
    },
    {
      name: 'desktop',
      dependencies: ['server-identity'],
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS.desktop },
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  // ===== teardown on a Windows dev machine: one clean completion, one long silence, and a confounder =====
  //
  // **Read this warning before trusting any version of this paragraph.** It has
  // been written wrong three times, and the three failures have three different
  // shapes worth keeping:
  //
  //   1. "The teardown has never been shown to work" — falsified by a run that
  //      owned its server and completed. Written from an absence of evidence and
  //      stated as a property.
  //   2. "The teardown hangs" — falsified by the very run being called hung,
  //      which printed `24 passed (41.7m)`, exit 0, nine minutes after that claim
  //      was committed. Written from a run that had been killed, about a run
  //      still in flight.
  //   3. "It completes, and it can take 41 minutes" — withdrawn, because that
  //      41-minute run had **someone else's `Stop-Process` land on its server**
  //      partway through. Written from a measurement whose subject had been
  //      altered from outside while it was being measured.
  //
  // This fourth version is written from a run nobody killed, over an hour, which
  // is the only reason to trust it further than the three above — not because it
  // sounds more careful. Its own limit is stated with it below: "nobody killed
  // anything" is what was arranged and what the records show, but the machine was
  // not idle, and a claim that it was would be the fourth mistake of the same
  // family. Four tries to describe one teardown honestly; the paragraph is longer
  // than the config it documents, and that is the correct ratio for something
  // this easy to state wrongly.
  //
  // What is actually known, and nothing beyond it:
  //
  // **One uncontaminated completion.** A run with 5317 confirmed empty beforehand
  // (that port specifically, not inferred from a count; the port is
  // `--strictPort`, so there was nothing to reuse and this config had to own its
  // server) printed `24 passed (3.0m)`, exit 0, 5317 absent afterwards, unrelated
  // dev-server count unchanged. About two and a half of those three minutes were
  // after the last test. That run is the only evidence that this path completes on
  // its own, and it is good evidence.
  //
  // **One long silence that cannot be scored either way.** Another run, also with
  // 5317 empty beforehand, ran its tests in about 30 seconds (`[24/24]` on stdout
  // at 12:18:17) and then emitted nothing until its summary at 12:59:29 — forty-one
  // minutes, with its server listening throughout. It is tempting to read that as
  // "slow but fine". It cannot be read as anything, because a second person
  // tidying stale ports on the same machine ran `Stop-Process -Id 34068 -Force`
  // inside that window, and **34068 was this run's own server** — the PID seen on
  // 5317 by `netstat` at 12:28:31, 12:30:39 and 12:33:00, with a start time of
  // 12:17:47 matching the run's own start. So the summary at 12:59:29 is equally
  // consistent with the teardown finishing by itself and with its being released
  // when the process it was waiting on was killed from outside. The records on
  // both sides cannot separate those. Two further runs showed the same silence and
  // were killed early (at roughly fifteen and two minutes), so they say nothing
  // either.
  //
  // **And one silence with the one confounder that matters deliberately removed,
  // which is the measurement this paragraph is finally built on.** The other
  // session agreed, for the duration, to kill nothing, run no suite, and not even
  // query the process table — listing processes is itself slow here and competes
  // with the teardown. With 5317 confirmed empty beforehand: started 13:09:53,
  // `[24/24]` on stdout at 13:10:26 (the 24 tests take 33 seconds), then
  // **nothing written for 60 minutes and 20 seconds**, server listening
  // throughout, at which point it was stopped. The figure to beat was the 41
  // minutes above; it was passed by half again.
  //
  // What that window was *not* is idle, and the difference matters enough to
  // write down. Twenty-four minutes into the silence, at 13:34:43, a lesson
  // source file in this worktree was edited — so the dev server recompiled, and
  // nobody can call the box quiet.
  //
  // The edit came from the same session that had agreed to stand down. Not a
  // broken promise: the three things it promised not to do were kills, suites and
  // process queries, and it did none of them. The promise simply did not cover
  // writing a file, and neither of us noticed that it had to — the thing being
  // timed was a process serving *this tree*, so a source edit is an input to the
  // experiment as surely as a kill is. **When you arrange a window to measure
  // something here, enumerate every input to it, not the obvious one.** That is
  // the generalisable half; the specific half is that a file write does not
  // release a pending kill, so the hour still stands as evidence about this
  // teardown. What does not stand is the word "quiet", and it is not used.
  //
  // So, stated as narrowly as the evidence allows: **in this shell, an unaided
  // completion has never been observed.** The one completion seen here had an
  // external kill of its own server inside its window; the one attempt protected
  // from that was still silent at an hour. That is one observation each way, not a
  // proof, but it is the wrong direction for "slow but fine" and the right one for
  // "the 41-minute summary was released by that kill". The only unaided completion
  // anywhere is the 3.0m run in the other shell, and nobody knows what differs.
  //
  // Why the silence is not diagnosed: the instruments were unusable, in two
  // different ways worth telling apart rather than lumping together as "slow".
  // In the same window, `taskkill /T /F` and `Stop-Process` from a shell **were**
  // merely slow — they took minutes, exceeding the tool timeout that was waiting
  // on them, but they did eventually do the job. The one query that would have
  // answered the question did not run at all: `Get-CimInstance Win32_Process`,
  // merely *listing* processes to look for a `taskkill` child still working under
  // the quiet test process, came back as a WMI failure —
  // `Get-CimInstance : Shutting down`, `HRESULT 0x80041033`
  // (`WBEM_E_SHUTTING_DOWN`). So the taskkill-child question is open because the
  // query never executed, not because it was too slow to wait for.
  //
  // Playwright's Windows teardown kills a process tree, and this box's process
  // layer was both minutes-slow at killing and unable to serve a process listing
  // at all. That is a plausible cause and an absent instrument at the same time.
  // The real answer wants a box where `taskkill` returns promptly and WMI
  // answers.
  //
  // Three practical rules, each one paid for:
  //
  //   * **Read the verdict off `[24/24]` and the per-test lines, and do not wait
  //     for the summary.** On this box the summary may not come: one attempt was
  //     left alone for an hour and never printed it. The test result is complete
  //     long before — 33 seconds in — and is not improved by waiting. If you need
  //     an exit code, you need a box where the teardown returns.
  //   * **Do not start another sweep while one is still finishing.** Doing that
  //     produced the only red this file has shown — a 30-second timeout waiting
  //     for the app's first button to paint, in a run that took 59s against a
  //     normal 28.8s, while a previous run's teardown ground through the same
  //     process table. Nothing was ever refused a connection (the tests after the
  //     failing one passed), so the server was alive; it was contention. Re-run
  //     alone: 24 passed, 28.8s.
  //   * **Expect the box's process tooling to misbehave while a teardown is
  //     pending, and do not read its failures as facts about Playwright.** Shell
  //     kills took minutes; a WMI process listing failed outright. Both recovered
  //     once nothing was tearing down.
  //   * **Somebody else reaped a port out from under a measurement on this
  //     machine, and it was probably you.** Not a risk to bear in mind — a thing
  //     that happened, and the most likely next person to do it is whoever is
  //     reading this, because the eleven stale dev servers sitting on this box
  //     from previous weeks are exactly what invites a tidy-up. It is what
  //     invalidated the 41-minute figure above. Two consequences: before timing
  //     anything about a process here, say so to whoever else is working on the
  //     box; and before killing a stray dev server, check whether a run owns it
  //     (its start time against a running suite's start time is enough — that is
  //     how the contamination above was established after the fact). Even
  //     *looking* is not free: `Get-CimInstance Win32_Process` takes minutes
  //     here, and Playwright's teardown is walking the same process table.
  //
  // Concurrency with `vitest` was suspected and is not an explanation: two of the
  // three silences had no concurrent suite. It is still worth avoiding on its own
  // evidence — vitest lost a worker in the one window where they overlapped
  // (`7200 passed (7218)`, `Error: Worker exited unexpectedly`; run alone
  // afterwards, 7218/7218).
  //
  // One experiment, recorded so it is not repeated: `npx vite` was swapped for
  // `node node_modules/vite/bin/vite.js`, on the theory that Playwright's kill
  // was reaching a wrapper process instead of the server. It leaked exactly the
  // same way, so the theory is unsupported and the change was reverted. Do not
  // re-apply it without evidence — a config change resting on an unchecked
  // diagnosis is the thing this whole slice has been about.
  //
  // CI is a different story and a simpler one: `ubuntu-latest`, where Playwright
  // kills the server's process group, and `reuseExistingServer` is false, so the
  // teardown path is the only path there is and a leak would surface as a hung
  // job rather than hide. If that ever happens, this is the note to start from.
})
