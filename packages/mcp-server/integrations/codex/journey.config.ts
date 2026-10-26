import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: [
      'packages/mcp-server/integrations/codex/journey.test.ts',
      'packages/mcp-server/integrations/codex/journey-review.test.ts',
    ],
    testTimeout: 5000,
  },
})
