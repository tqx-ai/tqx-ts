import { defineConfig } from 'vitest/config'
import memory from './memory.config'
export default defineConfig({
  ...memory,
  test: {
    ...memory.test,
    include: ['tests/read-only-runner.memory.ts', 'tests/read-only-client.memory.ts'],
  },
})
