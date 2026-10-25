import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import memory from './packages/mcp-server/tests/memory.config'

// Reviewed children are spawned before the parent installs its runtime guards.
// Each child has its own deny-network/deny-persistence policy; IPC is pipes only.
export default defineConfig({
  ...memory,
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    ...memory.test,
    include: ['scripts/memory-chain.test.ts'],
    setupFiles: [],
    testTimeout: 120_000,
    hookTimeout: 15_000,
  },
})
