import { randomUUID } from 'node:crypto'
import { defineCommand } from 'citty'
import type { CommandRuntime } from '../runtime/command-runtime'
import { CliUsageError } from '../utils/errors'
import {
  addDownload,
  backtestArgs,
  backtestParameters,
  boundedInteger,
  type BacktestArgs,
  type ContentArgs,
  hasBacktestInput,
  listArgs,
  listInput,
  type ListArgs,
  pollOptions,
  pageResponse,
  type WaitArgs,
  resourceId,
  resourceIdArg,
  resourceIds,
  readJsonInput,
  cancellationResponse,
  resultResponse,
  resultStatus,
  selectContent,
  toMarket,
  waitArgs,
} from './shared'
const revision = (v: string | undefined, n: string) => {
  const x = Number(v)
  if (!Number.isSafeInteger(x) || x < 1) throw new CliUsageError(`${n} must be a positive integer`)
  return x
}
export function createStrategyCommand(runtime: CommandRuntime) {
  return defineCommand({
    meta: { name: 'strategy', description: 'Manage Qube strategies and backtests' },
    subCommands: {
      create: defineCommand({
        meta: { name: 'create', description: 'Create a strategy' },
        args: {
          market: { type: 'enum', options: ['hk', 'us'], required: true },
          code: { type: 'string' },
          file: { type: 'string' },
          title: { type: 'string', default: 'TQX Strategy' },
          description: { type: 'string' },
          ...backtestArgs,
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const content = selectContent(args as unknown as ContentArgs, false)
            const market = toMarket(args.market!)
            const strategy = await client.research.createStrategy({
              requestId: randomUUID(),
              title: args.title!,
              description: args.description,
              code: content.value,
              market,
              backtest: hasBacktestInput(args as unknown as BacktestArgs)
                ? backtestParameters(args as unknown as BacktestArgs, false)
                : undefined,
            })
            return { success: true, strategy_id: strategy.id, strategy }
          }),
      }),
      info: defineCommand({
        meta: { name: 'info', description: 'Get a strategy' },
        args: { strategyId: resourceIdArg('Strategy ID') },
        run: ({ args }) =>
          runtime.research(async (client) => ({
            success: true,
            strategy: await client.research.getStrategy(resourceId(args.strategyId, 'strategy ID')),
          })),
      }),
      source: defineCommand({
        meta: { name: 'source', description: 'Get strategy source' },
        args: { strategyId: resourceIdArg('Strategy ID') },
        run: ({ args }) =>
          runtime.research(async (client) => ({
            success: true,
            strategy: await client.research.getStrategySource(
              resourceId(args.strategyId, 'strategy ID'),
            ),
          })),
      }),
      update: defineCommand({
        meta: { name: 'update', description: 'Update strategy configuration' },
        args: {
          strategyId: resourceIdArg('Strategy ID'),
          baseConfigRevision: { type: 'string', required: true },
          title: { type: 'string' },
          description: { type: 'string' },
          ...backtestArgs,
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const id = resourceId(args.strategyId, 'strategy ID')
            const result = await client.research.updateStrategy(id, {
              requestId: randomUUID(),
              baseConfigRevision: revision(args.baseConfigRevision, 'baseConfigRevision'),
              title: args.title,
              description: args.description,
              backtest: hasBacktestInput(args as unknown as BacktestArgs)
                ? backtestParameters(args as unknown as BacktestArgs, false)
                : undefined,
            })
            return { success: true, strategy_id: id, strategy: result }
          }),
      }),
      save: defineCommand({
        meta: { name: 'save', description: 'Save strategy source against a source revision' },
        args: {
          strategyId: resourceIdArg('Strategy ID'),
          code: { type: 'string' },
          file: { type: 'string' },
          baseSourceRevision: { type: 'string', required: true },
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const content = selectContent(args as unknown as ContentArgs, false)
            const id = resourceId(args.strategyId, 'strategy ID')
            const result = await client.research.updateStrategySource(id, {
              requestId: randomUUID(),
              baseSourceRevision: revision(args.baseSourceRevision, 'baseSourceRevision'),
              code: content.value,
            })
            return { success: true, strategy_id: id, strategy: result }
          }),
      }),
      backtests: defineCommand({
        meta: { name: 'backtests', description: 'List backtests for a strategy' },
        args: {
          strategyId: resourceIdArg('Strategy ID'),
          limit: { type: 'string' },
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const strategyId = resourceId(args.strategyId, 'strategy ID')
            const result = await client.research.listStrategyBacktests(strategyId, {
              limit:
                args.limit === undefined ? undefined : boundedInteger(args.limit, 'limit', 1, 200),
            })
            return {
              success: true,
              strategy_id: strategyId,
              count: result.runs.length,
              backtests: result.runs,
            }
          }),
      }),
      versions: defineCommand({
        meta: { name: 'versions', description: 'List strategy versions' },
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
      version: defineCommand({
        meta: { name: 'version', description: 'Get a strategy version' },
        args: { versionId: resourceIdArg('Strategy version ID') },
        run: ({ args }) =>
          runtime.research(async (client) => ({
            success: true,
            version: await client.research.getStrategyVersion(
              resourceId(args.versionId, 'version ID'),
            ),
          })),
      }),
      'version-create': defineCommand({
        meta: {
          name: 'version-create',
          description: 'Create a named strategy version from a backtest',
        },
        args: {
          strategyId: resourceIdArg('Strategy ID'),
          runId: resourceIdArg('Successful backtest ID'),
          name: { type: 'string', required: true },
          description: { type: 'string' },
        },
        run: ({ args }) =>
          runtime.research(async (client) => ({
            success: true,
            version: await client.research.createStrategyVersion(
              resourceId(args.strategyId, 'strategy ID'),
              {
                requestId: randomUUID(),
                runId: resourceId(args.runId, 'backtest ID'),
                name: args.name!,
                description: args.description,
              },
            ),
          })),
      }),
      'version-restore': defineCommand({
        meta: { name: 'version-restore', description: 'Restore a strategy version' },
        args: {
          strategyId: resourceIdArg('Strategy ID'),
          versionId: resourceIdArg('Strategy version ID'),
          expectedSourceRevision: { type: 'string', required: true },
          expectedConfigRevision: { type: 'string', required: true },
        },
        run: ({ args }) =>
          runtime.research(async (client) => ({
            success: true,
            strategy: await client.research.restoreStrategyVersion(
              resourceId(args.strategyId, 'strategy ID'),
              resourceId(args.versionId, 'version ID'),
              {
                requestId: randomUUID(),
                expectedSourceRevision: revision(
                  args.expectedSourceRevision,
                  'expectedSourceRevision',
                ),
                expectedConfigRevision: revision(
                  args.expectedConfigRevision,
                  'expectedConfigRevision',
                ),
              },
            ),
          })),
      }),
      'backtest-restore': defineCommand({
        meta: { name: 'backtest-restore', description: 'Restore a strategy backtest snapshot' },
        args: {
          strategyId: resourceIdArg('Strategy ID'),
          runId: resourceIdArg('Backtest run ID'),
          expectedSourceRevision: { type: 'string', required: true },
          expectedConfigRevision: { type: 'string', required: true },
        },
        run: ({ args }) =>
          runtime.research(async (client) => ({
            success: true,
            strategy: await client.research.restoreBacktest(
              resourceId(args.strategyId, 'strategy ID'),
              resourceId(args.runId, 'backtest ID'),
              {
                requestId: randomUUID(),
                expectedSourceRevision: revision(
                  args.expectedSourceRevision,
                  'expectedSourceRevision',
                ),
                expectedConfigRevision: revision(
                  args.expectedConfigRevision,
                  'expectedConfigRevision',
                ),
              },
            ),
          })),
      }),
      tuning: defineCommand({
        meta: { name: 'tuning', description: 'Manage strategy parameter tuning tasks' },
        subCommands: {
          list: defineCommand({
            meta: { name: 'list', description: 'List strategy tunings' },
            args: { strategyId: resourceIdArg('Strategy ID') },
            run: ({ args }) =>
              runtime.research(async (client) => ({
                success: true,
                tunings: await client.research.listStrategyTunings(
                  resourceId(args.strategyId, 'strategy ID'),
                ),
              })),
          }),
          get: defineCommand({
            meta: { name: 'get', description: 'Get a strategy tuning' },
            args: { tuningId: resourceIdArg('Strategy tuning ID') },
            run: ({ args }) =>
              runtime.research(async (client) => ({
                success: true,
                tuning: await client.research.getStrategyTuning(
                  resourceId(args.tuningId, 'tuning ID'),
                ),
              })),
          }),
          create: defineCommand({
            meta: {
              name: 'create',
              description: 'Create a strategy tuning from a JSON request file',
            },
            args: {
              strategyId: resourceIdArg('Strategy ID'),
              file: { type: 'string', required: true },
            },
            run: ({ args }) =>
              runtime.research(async (client) => ({
                success: true,
                tuning: await client.research.createStrategyTuning(
                  resourceId(args.strategyId, 'strategy ID'),
                  readJsonInput(args.file!, 'strategy tuning JSON') as never,
                ),
              })),
          }),
          cancel: defineCommand({
            meta: { name: 'cancel', description: 'Cancel a strategy tuning' },
            args: { tuningId: resourceIdArg('Strategy tuning ID') },
            run: ({ args }) =>
              runtime.research(async (client) => ({
                success: true,
                tuning: await client.research.cancelStrategyTuning(
                  resourceId(args.tuningId, 'tuning ID'),
                ),
              })),
          }),
          rerun: defineCommand({
            meta: { name: 'rerun', description: 'Rerun a strategy tuning' },
            args: { tuningId: resourceIdArg('Strategy tuning ID') },
            run: ({ args }) =>
              runtime.research(async (client) => ({
                success: true,
                tuning: await client.research.rerunStrategyTuning(
                  resourceId(args.tuningId, 'tuning ID'),
                  { requestId: randomUUID() },
                ),
              })),
          }),
          apply: defineCommand({
            meta: { name: 'apply', description: 'Apply a successful strategy tuning candidate' },
            args: {
              tuningId: resourceIdArg('Strategy tuning ID'),
              candidateId: resourceIdArg('Candidate ID'),
              expectedSourceRevision: { type: 'string', required: true },
              expectedConfigRevision: { type: 'string', required: true },
            },
            run: ({ args }) =>
              runtime.research(async (client) => ({
                success: true,
                ...(await client.research.applyStrategyTuning(
                  resourceId(args.tuningId, 'tuning ID'),
                  {
                    requestId: randomUUID(),
                    candidateId: resourceId(args.candidateId, 'candidate ID'),
                    expectedSourceRevision: revision(
                      args.expectedSourceRevision,
                      'expectedSourceRevision',
                    ),
                    expectedConfigRevision: revision(
                      args.expectedConfigRevision,
                      'expectedConfigRevision',
                    ),
                  },
                )),
              })),
          }),
        },
      }),
      run: defineCommand({
        meta: { name: 'run', description: 'Run a strategy backtest' },
        args: {
          strategyId: resourceIdArg('Strategy ID'),
          expectedSourceRevision: { type: 'string', required: true },
          expectedConfigRevision: { type: 'string', required: true },
          ...backtestArgs,
          ...waitArgs,
          download: { type: 'string' },
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const id = resourceId(args.strategyId, 'strategy ID')
            const submitted = await client.research.runStrategyBacktest(id, {
              requestId: randomUUID(),
              expectedSourceRevision: revision(
                args.expectedSourceRevision,
                'expectedSourceRevision',
              ),
              expectedConfigRevision: revision(
                args.expectedConfigRevision,
                'expectedConfigRevision',
              ),
              backtest: hasBacktestInput(args as unknown as BacktestArgs)
                ? backtestParameters(args as unknown as BacktestArgs, false)
                : undefined,
            })
            if (args.noWait) {
              const out = {
                success: true,
                status: 'SUBMITTED',
                strategy_id: id,
                run_id: submitted.id,
                result: submitted,
              }
              addDownload(out, submitted as never, args.download, `backtest-${submitted.id}.json`)
              return out
            }
            const result = await client.research.pollBacktest(
              String(submitted.id),
              pollOptions(args as unknown as WaitArgs),
            )
            const out: Record<string, unknown> = {
              ...resultResponse({ ...result, id: submitted.id } as never, 'run_id'),
              strategy_id: id,
            }
            if (resultStatus(result as never) === 'TIMEOUT')
              out.stop_command = `tqx research strategy stop ${submitted.id}`
            addDownload(out, result as never, args.download, `backtest-${submitted.id}.json`)
            return out
          }),
      }),
      stop: defineCommand({
        meta: { name: 'stop', description: 'Cancel a strategy backtest' },
        args: { runId: resourceIdArg('Backtest run ID') },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const id = resourceId(args.runId, 'backtest run ID')
            const result = await client.research.cancelBacktest(id)
            return cancellationResponse(result, id, 'run_id')
          }),
      }),
      result: defineCommand({
        meta: { name: 'result', description: 'Get a strategy backtest result' },
        args: { runId: resourceIdArg('Backtest run ID'), download: { type: 'string' } },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const id = resourceId(args.runId, 'Backtest run ID')
            const result = await client.research.getBacktest(id)
            const out = { success: true, run_id: id, result }
            addDownload(out, result as never, args.download, `backtest-${id}.json`)
            return out
          }),
      }),
      list: defineCommand({
        meta: { name: 'list', description: 'List strategy definitions' },
        args: { ...listArgs },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const page = await client.research.listStrategies(
              listInput(args as unknown as ListArgs),
            )
            if (args.includeContent)
              page.items = await Promise.all(
                page.items.map((item) => client.research.getStrategySource(item.id)),
              )
            return pageResponse(page as never, 'strategies', args.includeContent === true)
          }),
      }),
      delete: defineCommand({
        meta: { name: 'delete', description: 'Delete strategy definitions' },
        args: { strategyId: resourceIdArg('Strategy ID'), yes: { type: 'boolean' } },
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
