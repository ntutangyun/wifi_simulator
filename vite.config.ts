import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  // agent worktrees live under .claude/worktrees: their copies of the tests are not ours to run
  // `tests/e2e` is Playwright's, not vitest's: it imports `@playwright/test`,
  // needs a real browser and a dev server, and runs under `npm run test:ui`.
  // Without the exclusion vitest collects it by name and fails on the import.
  // `setupFiles` + `globalSetup` are the suite's own cost census (tests/simCost.ts): a worker can
  // only see the file it is running, so each writes one row and the global teardown — the one
  // hook that runs after every worker — sums them and bounds the total. It adds one `++` per
  // executed engine event and one small write per test file; measured at +2 % of wall, inside
  // run-to-run noise.
  test: {
    environment: 'node',
    // vitest 5 schedules the per-file workers differently from vitest 2, and under that
    // scheduling a handful of 1-5 s engine runs (bianchi, mumimo, uwb-planOps's closed-system
    // walks) land past the 5 s default and time out — a different handful each run. The suite's
    // real cost bound is the event ceiling (tests/simCost.ts), not wall time; the timeout only
    // needs to be above what a loaded machine takes.
    testTimeout: 30_000,
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**', 'tests/e2e/**'],
    setupFiles: ['./tests/simCostRow.ts'],
    globalSetup: ['./tests/simCostCeiling.ts'],
  },
})
