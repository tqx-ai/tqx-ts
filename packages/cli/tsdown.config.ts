import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'tsdown'

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }
const sdkSourceEntry = fileURLToPath(new URL('../sdk/src/index.ts', import.meta.url))
const defaultBaseUrl = process.env.TQX_BUILD_BASE_URL?.trim() ?? ''
const defaultTradingBaseUrl = process.env.TQX_BUILD_TRADING_BASE_URL?.trim() ?? ''
const apiKeyUrl = process.env.TQX_BUILD_GET_API_KEY_URL?.trim() ?? ''

export default defineConfig({
  alias: {
    '@tqx-ai/sdk': sdkSourceEntry,
  },
  clean: true,
  deps: {
    alwaysBundle: ['@tqx-ai/sdk'],
  },
  define: {
    __TQX_BUILD_API_KEY_URL__: JSON.stringify(apiKeyUrl),
    __TQX_BUILD_CLI_VERSION__: JSON.stringify(packageJson.version),
    __TQX_BUILD_DEFAULT_BASE_URL__: JSON.stringify(defaultBaseUrl),
    __TQX_BUILD_DEFAULT_TRADING_BASE_URL__: JSON.stringify(defaultTradingBaseUrl),
  },
  dts: false,
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  sourcemap: true,
  target: 'node22',
})
