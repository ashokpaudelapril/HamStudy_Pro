// TASK: Configure Vitest for unit-testing both main-process DB logic and renderer-side pure functions.
// HOW CODE SOLVES: Uses the node environment (no browser needed for pure functions or SQLite queries),
//                  defines path aliases matching electron-vite config so shared imports resolve correctly,
//                  and scopes test discovery to src/ only (excluding node_modules and out/).
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },
})
