import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  // agent worktrees live under .claude/worktrees: their copies of the tests are not ours to run
  // `tests/e2e` is Playwright's, not vitest's: it imports `@playwright/test`,
  // needs a real browser and a dev server, and runs under `npm run test:ui`.
  // Without the exclusion vitest collects it by name and fails on the import.
  test: { environment: 'node', exclude: ['**/node_modules/**', '**/dist/**', '.claude/**', 'tests/e2e/**'] },
})
