import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
export default defineConfig({
  define: {
    __TQX_BUILD_DEFAULT_BASE_URL__: JSON.stringify('https://unused.invalid'),
    __TQX_BUILD_DEFAULT_TRADING_BASE_URL__: JSON.stringify('https://unused.invalid'),
  },
  resolve: {
    alias: { '@tqx-ai/sdk': fileURLToPath(new URL('../../../sdk/src/index.ts', import.meta.url)) },
  },
  test: {
    include: ['packages/mcp-server/integrations/codex/read-fixture.test.ts'],
    testTimeout: 8000,
    hookTimeout: 8000,
  },
})
