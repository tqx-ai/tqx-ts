import { defineCommand } from 'citty'

import type { CommandRuntime } from '../runtime/command-runtime'
import {
  addDownload,
  listArgs,
  listInput,
  type ListArgs,
  pageResponse,
  resourceId,
  resourceIdArg,
  normalizeBacktestDisplay,
  resultResponse,
} from './shared'

export function createBacktestCommand(runtime: CommandRuntime) {
  return defineCommand({
    meta: { name: 'backtest', description: 'Inspect Qube backtest records' },
    subCommands: {
      list: defineCommand({
        meta: { name: 'list', description: 'List backtest records' },
        args: { ...listArgs },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const page = await client.research.listBacktests(listInput(args as unknown as ListArgs))
            return pageResponse(
              {
                ...page,
                items: page.items.map((item) => normalizeBacktestDisplay(item)),
              },
              'backtests',
              Boolean(args.includeContent),
            )
          }),
      }),
      result: defineCommand({
        meta: { name: 'result', description: 'Get a complete backtest result' },
        args: {
          runId: resourceIdArg('Backtest run ID'),
          download: {
            type: 'string',
            description: 'Save result JSON; omit the value for Downloads',
          },
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const runId = resourceId(args.runId, 'backtest run ID')
            const result = await client.research.getBacktest(runId)
            const displayResult = normalizeBacktestDisplay(result)
            const output: Record<string, unknown> = resultResponse(displayResult, 'run_id')
            addDownload(output, result, args.download, `backtest-${runId}.json`)
            return output
          }),
      }),
    },
  })
}
