#!/usr/bin/env node

import { runCli } from './command'
import { getRuntimeProcess } from './utils/runtime'

try {
  await runCli()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  getRuntimeProcess().stderr.write(`Error: ${message}\n`)
  getRuntimeProcess().exitCode = 2
}

export { runCli } from './command'
export * from './credentials'
export * from './output'
export * from './update'
