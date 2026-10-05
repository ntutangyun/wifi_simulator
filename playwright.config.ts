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
    {
      name: 'foldable-shut',
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS['foldable-shut'], hasTouch: true },
    },
    {
      name: 'foldable-open',
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS['foldable-open'], hasTouch: true },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS.desktop },
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  // ===== teardown on a Windows dev machine: intermittent, not broken =====
  //
  // This note replaces one that said the teardown path had never been shown to
  // work, which a later run falsified — so the paragraph became a false
  // statement sitting in the repository. What follows is only what has been
  // measured, on both sides.
  //
  // **It has been seen working.** One run with 5317 confirmed empty beforehand
  // (checked for that port specifically, not inferred from a count): the port is
  // `--strictPort`, so there was nothing to reuse and this config had to start
  // its own server. It printed `24 passed (3.0m)`, exited 0, and afterwards 5317
  // was absent again, with the number of unrelated dev servers on the box
  // unchanged across the run (eleven before, eleven after). That is the whole
  // path — own the server, run, print, exit, reap it — and it completed.
  //
  // That the port was empty first is the part that makes the run mean anything.
  // A run that finds a server already on 5317 reuses it, never owns it and never
  // tears it down, so its green says nothing about this paragraph — which is how
  // a batch of green runs came to be reported as evidence for a path they had
  // not touched.
  //
  // **It has also been seen hanging, three times out of three, in a different
  // shell on the same machine.** All 24 tests ran (`[24/24]` printed), then the
  // summary line never reached stdout, the process stayed alive and the server
  // stayed listening. The third of them was left deliberately alone to find out
  // whether it was merely slow: **it was still sitting there forty minutes after
  // its last test**, against the two and a half minutes the one clean run spent
  // after its last test. So "slow" does not cover it, and the honest word is
  // flaky — one shell reaps the server reliably, another has not managed it
  // once. Do not read this note as a reason to avoid the local run, and do not
  // read it as a promise either.
  //
  // What the two outcomes do **not** differ by, so that nobody spends the time
  // again: concurrency. The temptation is to pin it on running `vitest` at the
  // same time, and one of the three hangs did have that (vitest lost a worker of
  // its own in the same window — `7200 passed (7218)`,
  // `Error: Worker exited unexpectedly`; run alone afterwards it was
  // 7218/7218). **The other two hangs had no concurrent suite at all.** Running
  // the two suites one at a time is still the sane thing to do, on that lost
  // worker's evidence alone — but it does not make this teardown behave, and a
  // sentence here saying it does was written, falsified by the next run, and
  // removed.
  //
  // What they may differ by, offered as the open question and not as an answer:
  // how long the kill takes, and whether it ever returns. The one clean run took
  // 3.0m for a suite whose tests take about 29s, so two and a half minutes of it
  // were teardown; the hang that was timed sat for forty. Those two numbers are
  // the whole of what is known about the difference.
  //
  // Why that is still a question rather than an answer: the kill could not be
  // measured, because the tools for measuring it are the thing that is slow. On
  // this box, in the same window, `taskkill /T /F` and `Stop-Process` issued
  // from a shell took minutes or returned a timeout error, and
  // `Get-CimInstance Win32_Process` — merely *listing* processes, to look for a
  // `taskkill` child still running under the hung test process — did not return
  // within four minutes either. Playwright's Windows teardown kills a process
  // tree, so a machine whose process layer answers that slowly is a plausible
  // cause and an unusable instrument at the same time. Whoever picks this up
  // should do it on a box where `taskkill` returns promptly; nobody has measured
  // it, so nobody should write which it is.
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
