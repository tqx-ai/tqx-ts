import { defineConfig } from 'tsdown'

const defaultBaseUrl = process.env.TQX_BUILD_BASE_URL?.trim() ?? ''
const defaultTradingBaseUrl = process.env.TQX_BUILD_TRADING_BASE_URL?.trim() ?? ''

export default defineConfig({
  clean: true,
  define: {
    __TQX_BUILD_DEFAULT_BASE_URL__: JSON.stringify(defaultBaseUrl),
    __TQX_BUILD_DEFAULT_TRADING_BASE_URL__: JSON.stringify(defaultTradingBaseUrl),
  },
  dts: {
    sourcemap: true,
  },
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  platform: 'node',
  sourcemap: true,
  target: 'node22',
})
