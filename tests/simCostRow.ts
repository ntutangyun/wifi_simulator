/**
 * The per-test-file half of the suite's cost census — a `setupFiles` entry, so vitest runs it
 * once per test file and `afterAll` here is that file's own end.
 *
 * It is split from `tests/simCost.ts` because the other half of the census is a `globalSetup`,
 * which vitest runs in a context where importing `vitest` throws; the shared constants therefore
 * cannot sit beside an `afterAll`. `tests/simCost.ts` says what is counted and why.
 *
 * Every failure here is swallowed on purpose: a census that cannot write its row makes the
 * ceiling greener, never redder, and a cost measurement must not be the reason a green suite goes
 * red. The teardown prints the row count beside the total so a reader can see rows went missing.
 */
import { afterAll, expect } from 'vitest'
import { SIM_COST } from '../src/engine/events'
import { writeRow } from './simCost'

afterAll(() => {
  try {
    writeRow(expect.getState().testPath ?? 'unknown', SIM_COST.events)
  } catch {
    // see above
  }
  SIM_COST.events = 0
})
