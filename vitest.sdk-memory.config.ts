import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import memory from './packages/mcp-server/tests/memory.config'
import workspace from './vitest.config'

export default defineConfig({
  ...memory,
  root: fileURLToPath(new URL('.', import.meta.url)),
  define: workspace.define,
  resolve: workspace.resolve,
  test: {
    ...memory.test,
    include: ['packages/sdk/test/**/*.test.ts'],
    setupFiles: [
      fileURLToPath(new URL('./packages/mcp-server/tests/memory.setup.ts', import.meta.url)),
    ],
  },
})
