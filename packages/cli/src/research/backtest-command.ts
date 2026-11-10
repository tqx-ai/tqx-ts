import { defineCommand } from 'citty'
import type { CommandRuntime } from '../runtime/command-runtime'
import {
  listArgs,
  listInput,
  pageResponse,
  type ListArgs,
  resourceId,
  resourceIdArg,
} from './shared'
export function createBacktestCommand(runtime: CommandRuntime) {
  return defineCommand({
    meta: { name: 'backtest', description: 'Inspect Qube backtest records' },
    subCommands: {
      list: defineCommand({
        meta: { name: 'list', description: 'List backtests' },
        args: { ...listArgs },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const page = await client.research.listBacktests(listInput(args as unknown as ListArgs))
            if (args.includeContent)
              page.items = await Promise.all(
                page.items.map((item) => client.research.getBacktest(String(item.id))),
              )
            return pageResponse(page as never, 'backtests', args.includeContent === true)
          }),
      }),
      result: defineCommand({
        meta: { name: 'result', description: 'Get a backtest result page' },
        args: {
          runId: resourceIdArg('Backtest run ID'),
          field: {
            type: 'enum',
            options: ['equity', 'trades', 'logs', 'symbol_performance', 'account_summary'],
            required: true,
          },
          offset: { type: 'string' },
          limit: { type: 'string' },
          symbol: { type: 'string' },
        },
        run: ({ args }) =>
          runtime.research(async (client) => ({
            success: true,
            run_id: resourceId(args.runId, 'Backtest run ID'),
            result: await client.research.getBacktestResultPage(
              resourceId(args.runId, 'Backtest run ID'),
              {
                field: args.field as never,
                offset: args.offset === undefined ? undefined : Number(args.offset),
                limit: args.limit === undefined ? undefined : Number(args.limit),
                symbol: args.symbol,
              },
            ),
          })),
      }),
    },
  })
}
