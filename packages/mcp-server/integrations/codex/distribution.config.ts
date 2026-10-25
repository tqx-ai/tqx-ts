import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['packages/mcp-server/integrations/codex/distribution.test.ts'],
    testTimeout: 25000,
    hookTimeout: 60000,
  },
})
