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
  // ===== a known gap in what has been verified about this config, on Windows =====
  //
  // Every test here has been run and passed many times. What has *not* been
  // shown to work on a Windows dev machine is the teardown: when this config
  // owns the dev server, the run completes all its tests — `[24/24]` prints —
  // and then the process hangs with the summary line never reaching stdout, the
  // server still listening. Every clean `24 passed` recorded for this file came
  // from a run that reused a server an earlier run had left behind, which means
  // the teardown path had never actually been exercised when it was first
  // reported green.
  //
  // It is left as `npx vite` rather than fixed, because the obvious fix did not
  // work and the diagnosis it rested on does not hold. Spawning node directly
  // (`node node_modules/vite/bin/vite.js`) to remove the wrapper process leaked
  // the server just the same. The likelier explanation is the machine: on that
  // same box `taskkill /T /F` and `Stop-Process` from a shell were themselves
  // taking minutes or timing out, so there is no evidence the wrapper was ever
  // the cause. A config change justified by a diagnosis that was not checked is
  // the thing this whole slice has been about.
  //
  // CI is unaffected in the one way that matters: it is `ubuntu-latest`, where
  // Playwright kills the server's process group, and `reuseExistingServer` is
  // false there, so a leak would show up as a hung job rather than hide. If that
  // ever happens, this is the note to start from.
})
