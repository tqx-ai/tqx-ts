import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const cliPackageJson = JSON.parse(
  readFileSync(new URL('./packages/cli/package.json', import.meta.url), 'utf8'),
) as { version: string }
const sdkEntry = fileURLToPath(new URL('./packages/sdk/src/index.ts', import.meta.url))

export default defineConfig({
  define: {
    __TQX_BUILD_API_KEY_URL__: JSON.stringify('https://build-api-key.example.test'),
    __TQX_BUILD_CLI_VERSION__: JSON.stringify(cliPackageJson.version),
    __TQX_BUILD_DEFAULT_BASE_URL__: JSON.stringify('https://build-default-api.example.test'),
    __TQX_BUILD_DEFAULT_TRADING_BASE_URL__: JSON.stringify(
      'https://build-default-trading-api.example.test',
    ),
  },
  resolve: {
    alias: {
      '@tqx-ai/sdk': sdkEntry,
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/test/**/*.test.ts'],
    restoreMocks: true,
  },
})
