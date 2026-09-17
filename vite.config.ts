import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  // agent worktrees live under .claude/worktrees: their copies of the tests are not ours to run
  test: { environment: 'node', exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'] },
})
