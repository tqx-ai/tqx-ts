import { defineCommand } from 'citty'

import type { CommandRuntime } from '../runtime/command-runtime'
import { createBacktestCommand } from './backtest-command'
import { createFactorCommand } from './factor-command'
import { createStrategyCommand } from './strategy-command'

export function createResearchCommand(runtime: CommandRuntime) {
  return defineCommand({
    meta: { name: 'research', description: 'Access Qube factor research and backtesting' },
    subCommands: {
      factor: createFactorCommand(runtime),
      strategy: createStrategyCommand(runtime),
      backtest: createBacktestCommand(runtime),
    },
  })
}
