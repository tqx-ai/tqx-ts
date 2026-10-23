import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: {
    __TQX_BUILD_DEFAULT_BASE_URL__: JSON.stringify('https://build-default-api.example.test'),
    __TQX_BUILD_DEFAULT_TRADING_BASE_URL__: JSON.stringify(
      'https://build-default-trading-api.example.test',
    ),
  },
  resolve: {
    alias: {
      '@tqx-ai/sdk': fileURLToPath(new URL('../sdk/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
})
