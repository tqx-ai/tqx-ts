import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { assertMemoryImport } from './memory-policy'

const root = fileURLToPath(new URL('..', import.meta.url))
export default defineConfig({
  root,
  envDir: false,
  plugins: [
    {
      name: 'mcp-memory-only-imports',
      enforce: 'pre',
      resolveId(id, importer) {
        assertMemoryImport(id)
        const target = id.startsWith('.') && importer ? resolve(importer, '..', id) : id
        const entry = resolve(root, 'src/index').replaceAll('\\', '/')
        if (target.replaceAll('\\', '/').replace(/\.ts$/, '') === entry)
          throw new Error('Memory-only checks cannot import the environment-loading service entry')
      },
    },
  ],
  define: {
    __TQX_BUILD_DEFAULT_BASE_URL__: JSON.stringify('https://unused-memory-only.invalid'),
    __TQX_BUILD_DEFAULT_TRADING_BASE_URL__: JSON.stringify('https://unused-memory-only.invalid'),
  },
  resolve: {
    alias: { '@tqx-ai/sdk': fileURLToPath(new URL('../../sdk/src/index.ts', import.meta.url)) },
  },
  test: {
    // Audited exact files, not a wildcard and not a skip list. New tests require another audit.
    include: [
      'tests/config.test.ts',
      'tests/http.test.ts',
      'tests/protocol.test.ts',
      'tests/review.test.ts',
      'tests/runtime.test.ts',
      'tests/trading.test.ts',
      'tests/trading-v2.test.ts',
      'tests/memory-guard.memory.ts',
    ],
    setupFiles: ['tests/memory.setup.ts'],
    pool: 'threads',
    fileParallelism: false,
    cache: false,
    experimental: { fsModuleCache: false },
    deps: { optimizer: { ssr: { enabled: false } } },
    coverage: { enabled: false },
    reporters: ['default'],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    watch: false,
    update: false,
    sequence: { hooks: 'stack' },
  },
})
