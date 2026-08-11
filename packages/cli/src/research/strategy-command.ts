import { defineCommand } from 'citty'

import type { QubePage, TqxClient } from '@tqx-ai/sdk'

import type { CommandRuntime } from '../runtime/command-runtime'
import { CliUsageError } from '../utils/errors'
import {
  addDownload,
  backtestArgs,
  backtestParameters,
  type BacktestArgs,
  type ContentArgs,
  ensureMarket,
  hasBacktestInput,
  listArgs,
  listInput,
  type ListArgs,
  pageResponse,
  pollOptions,
  type WaitArgs,
  resourceId,
  resourceIdArg,
  resourceIds,
  resultResponse,
  resultStatus,
  selectContent,
  selectOptionalContent,
  strategyWarnings,
  toMarket,
  waitArgs,
} from './shared'

export function createStrategyCommand(runtime: CommandRuntime) {
  return defineCommand({
    meta: { name: 'strategy', description: 'Manage Qube strategies and backtests' },
    subCommands: {
      create: defineCommand({
        meta: { name: 'create', description: 'Create a strategy definition' },
        args: {
          market: {
            type: 'enum',
            options: ['stock', 'future', 'hk', 'us', 'STOCK', 'FUTURE', 'HK', 'US'],
            required: true,
          },
          code: { type: 'string', description: 'Python strategy source' },
          file: { type: 'string', description: 'Load strategy source from a file' },
          name: { type: 'string', default: 'TQX Strategy', description: 'Strategy name' },
          description: { type: 'string', description: 'Strategy description' },
          strictMarketApi: { type: 'boolean', description: 'Reject invalid market API usage' },
          ...backtestArgs,
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const market = toMarket(args.market!)
            const content = selectContent(args as unknown as ContentArgs, false)
            const warnings = strategyWarnings(content.value, market, Boolean(args.strictMarketApi))
            const createdStrategy = await client.research.createStrategy({
              name: args.name!,
              description: args.description,
              code: content.value,
              market,
              backtest: backtestParameters(args as unknown as BacktestArgs, true),
            })
            await ensureMarket(
              client,
              'strategy',
              createdStrategy.id,
              createdStrategy.market,
              market,
            )
            return {
              success: true,
              strategy_id: createdStrategy.id,
              strategy: createdStrategy,
              warnings,
            }
          }),
      }),
      save: defineCommand({
        meta: { name: 'save', description: 'Save a strategy code version' },
        args: {
          strategyId: resourceIdArg('Strategy ID'),
          code: { type: 'string', description: 'Python strategy source' },
          file: { type: 'string', description: 'Load strategy source from a file' },
          name: { type: 'string', description: 'Strategy name' },
          description: { type: 'string', description: 'Strategy description' },
          baseVersionId: { type: 'string', description: 'Expected current version ID' },
          confirmRebase: { type: 'boolean', description: 'Rebase on the latest version' },
          ...backtestArgs,
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const content = selectContent(args as unknown as ContentArgs, false)
            const saved = await client.research.saveStrategy(
              resourceId(args.strategyId, 'strategy ID'),
              {
                code: content.value,
                name: args.name,
                description: args.description,
                baseVersionId:
                  args.baseVersionId === undefined
                    ? undefined
                    : resourceId(args.baseVersionId, 'base version ID'),
                confirmRebase: Boolean(args.confirmRebase),
                backtest: hasBacktestInput(args as unknown as BacktestArgs)
                  ? backtestParameters(args as unknown as BacktestArgs, false)
                  : undefined,
              },
            )
            return {
              success: true,
              strategy_id: saved.strategy.id,
              version_id: saved.version.id,
              version_created: saved.version_created,
              strategy: saved.strategy,
              version: saved.version,
            }
          }),
      }),
      info: defineCommand({
        meta: { name: 'info', description: 'Get a strategy definition' },
        args: { strategyId: resourceIdArg('Strategy ID') },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const fetchedStrategy = await client.research.getStrategy(
              resourceId(args.strategyId, 'strategy ID'),
            )
            return { success: true, strategy: fetchedStrategy }
          }),
      }),
      versions: defineCommand({
        meta: { name: 'versions', description: 'List strategy code versions' },
        args: { strategyId: resourceIdArg('Strategy ID') },
        run: ({ args }) =>
          runtime.research(async (client) => ({
            success: true,
            strategy_id: resourceId(args.strategyId, 'strategy ID'),
            versions: await client.research.listStrategyVersions(
              resourceId(args.strategyId, 'strategy ID'),
            ),
          })),
      }),
      revert: defineCommand({
        meta: { name: 'revert', description: 'Revert a strategy version as a new version' },
        args: {
          strategyId: resourceIdArg('Strategy ID'),
          versionNumber: resourceIdArg('Version number'),
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const strategyId = resourceId(args.strategyId, 'strategy ID')
            const version = await client.research.revertStrategyVersion(
              strategyId,
              resourceId(args.versionNumber, 'version number'),
            )
            return { success: true, strategy_id: strategyId, version }
          }),
      }),
      update: defineCommand({
        meta: { name: 'update', description: 'Update a strategy definition' },
        args: {
          strategyId: resourceIdArg('Strategy ID'),
          market: {
            type: 'enum',
            options: ['stock', 'future', 'hk', 'us', 'STOCK', 'FUTURE', 'HK', 'US'],
          },
          code: { type: 'string', description: 'Python strategy source' },
          file: { type: 'string', description: 'Load strategy source from a file' },
          name: { type: 'string', description: 'Strategy name' },
          description: { type: 'string', description: 'Strategy description' },
          strictMarketApi: { type: 'boolean', description: 'Reject invalid market API usage' },
          ...backtestArgs,
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const strategyId = resourceId(args.strategyId, 'strategy ID')
            const content = selectOptionalContent(args as unknown as ContentArgs, false)
            const hasBacktestUpdates = hasBacktestInput(args as unknown as BacktestArgs)
            const current =
              content !== undefined || hasBacktestUpdates || args.strictMarketApi
                ? await client.research.getStrategy(strategyId)
                : undefined
            const market = args.market === undefined ? current?.market : toMarket(args.market)
            if (content !== undefined) {
              const warnings = strategyWarnings(
                content.value,
                market ?? 'us',
                Boolean(args.strictMarketApi),
              )
              void warnings
            }
            const updated = await client.research.updateStrategy(strategyId, {
              name: args.name,
              description: args.description,
              code: content?.value,
              market,
              backtest: hasBacktestUpdates
                ? backtestParameters(args as unknown as BacktestArgs, false, current?.params)
                : undefined,
            })
            if (market !== undefined)
              await ensureMarket(client, 'strategy', updated.id, updated.market, market)
            return { success: true, strategy_id: updated.id, strategy: updated }
          }),
      }),
      run: defineCommand({
        meta: { name: 'run', description: 'Run a strategy backtest' },
        args: {
          strategyId: resourceIdArg('Strategy ID'),
          ...backtestArgs,
          ...waitArgs,
          download: {
            type: 'string',
            description: 'Save result JSON; omit the value for Downloads',
          },
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const strategyId = resourceId(args.strategyId, 'strategy ID')
            const storedStrategy = await client.research.getStrategy(strategyId)
            const submitted = await client.research.runStrategyBacktest(
              strategyId,
              backtestParameters(args as unknown as BacktestArgs, false, storedStrategy.params),
            )
            if (args.noWait) {
              const output: Record<string, unknown> = {
                success: true,
                status: 'SUBMITTED',
                strategy_id: strategyId,
                run_id: submitted.id,
                result: submitted,
              }
              addDownload(output, submitted, args.download, `backtest-${submitted.id}.json`)
              return output
            }
            const result = await client.research.pollBacktest(
              submitted.id,
              pollOptions(args as unknown as WaitArgs),
            )
            const output: Record<string, unknown> = {
              ...resultResponse(result, 'run_id'),
              strategy_id: strategyId,
            }
            if (resultStatus(result) === 'TIMEOUT')
              output.stop_command = `tqx research strategy stop ${submitted.id}`
            addDownload(output, result, args.download, `backtest-${submitted.id}.json`)
            return output
          }),
      }),
      stop: defineCommand({
        meta: { name: 'stop', description: 'Cancel a strategy backtest' },
        args: { runId: resourceIdArg('Backtest run ID') },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const runId = resourceId(args.runId, 'backtest run ID')
            const result = await client.research.cancelBacktest(runId)
            return {
              success: result.cancelled === true,
              run_id: runId,
              status: resultStatus(result),
              result,
            }
          }),
      }),
      result: defineCommand({
        meta: { name: 'result', description: 'Get a strategy backtest result' },
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
            const output: Record<string, unknown> = resultResponse(result, 'run_id')
            addDownload(output, result, args.download, `backtest-${runId}.json`)
            return output
          }),
      }),
      list: defineCommand({
        meta: { name: 'list', description: 'List strategy definitions' },
        args: { ...listArgs },
        run: ({ args }) =>
          runtime.research(async (client) =>
            pageResponse(
              await listStrategiesForDisplay(client, args as unknown as ListArgs),
              'strategies',
              Boolean(args.includeContent),
            ),
          ),
      }),
      delete: defineCommand({
        meta: { name: 'delete', description: 'Delete strategy definitions' },
        args: {
          strategyId: resourceIdArg('Strategy ID'),
          yes: { type: 'boolean', description: 'Confirm deletion' },
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            if (!args.yes) throw new CliUsageError('deletion confirmation requires --yes')
            const ids = resourceIds(args._, 'strategy ID')
            await Promise.all(ids.map((id) => client.research.deleteStrategy(id)))
            return { success: true, deleted: ids }
          }),
      }),
    },
  })
}

async function listStrategiesForDisplay(
  client: TqxClient,
  args: ListArgs,
): Promise<QubePage<Record<string, unknown>>> {
  const input = listInput(args)
  return client.research.listStrategies(input) as Promise<QubePage<Record<string, unknown>>>
}
