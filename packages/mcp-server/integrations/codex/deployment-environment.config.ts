import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['packages/mcp-server/integrations/codex/deployment-environment.test.ts'],
    testTimeout: 5000,
  },
})
