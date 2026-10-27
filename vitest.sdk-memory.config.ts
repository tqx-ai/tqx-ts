import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { assertMemoryImport } from './packages/sdk/test/memory-support/memory-policy'
import workspace from './vitest.config'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  envDir: false,
  plugins: [
    {
      name: 'sdk-memory-only-imports',
      enforce: 'pre',
      resolveId(id) {
        assertMemoryImport(id)
      },
    },
  ],
  define: workspace.define,
  resolve: workspace.resolve,
  test: {
    include: ['packages/sdk/test/**/*.test.ts'],
    setupFiles: [
      fileURLToPath(new URL('./packages/sdk/test/memory-support/memory.setup.ts', import.meta.url)),
    ],
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
