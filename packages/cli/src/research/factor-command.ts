import { defineCommand } from 'citty'
import { getFactorAnalysisParams } from '@tqx-ai/sdk'

import type { CommandRuntime } from '../runtime/command-runtime'
import { CliUsageError } from '../utils/errors'
import {
  type ContentArgs,
  ensureMarket,
  factorDirection,
  listArgs,
  listInput,
  numberArg,
  pageResponse,
  pollOptions,
  positiveInteger,
  boundedInteger,
  type ListArgs,
  type WaitArgs,
  normalizeDate,
  resourceId,
  resourceIdArg,
  resourceIds,
  resultResponse,
  resultStatus,
  selectContent,
  selectOptionalContent,
  toMarket,
  waitArgs,
} from './shared'

export function createFactorCommand(runtime: CommandRuntime) {
  return defineCommand({
    meta: { name: 'factor', description: 'Manage Qube factor definitions and analyses' },
    subCommands: {
      create: defineCommand({
        meta: { name: 'create', description: 'Create a factor definition' },
        args: {
          market: {
            type: 'enum',
            options: ['stock', 'future', 'hk', 'us', 'STOCK', 'FUTURE', 'HK', 'US'],
            required: true,
          },
          code: { type: 'string', description: 'Python factor source' },
          formula: { type: 'string', description: 'Factor formula' },
          file: { type: 'string', description: 'Load factor source from a file' },
          name: { type: 'string', default: 'TQX Factor', description: 'Factor name' },
          description: { type: 'string', description: 'Factor description' },
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const content = selectContent(args as unknown as ContentArgs, true)
            const createdFactor = await client.research.createFactor({
              name: args.name!,
              description: args.description,
              code: content.value,
              codeType: content.type,
              market: toMarket(args.market!),
            })
            await ensureMarket(
              client,
              'factor',
              createdFactor.id,
              createdFactor.market,
              toMarket(args.market!),
            )
            return { success: true, factor_id: createdFactor.id, factor: createdFactor }
          }),
      }),
      info: defineCommand({
        meta: { name: 'info', description: 'Get a factor definition' },
        args: { factorId: resourceIdArg('Factor ID') },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const fetchedFactor = await client.research.getFactor(
              resourceId(args.factorId, 'factor ID'),
            )
            return { success: true, factor: fetchedFactor }
          }),
      }),
      update: defineCommand({
        meta: { name: 'update', description: 'Update a factor definition' },
        args: {
          factorId: resourceIdArg('Factor ID'),
          market: {
            type: 'enum',
            options: ['stock', 'future', 'hk', 'us', 'STOCK', 'FUTURE', 'HK', 'US'],
          },
          code: { type: 'string', description: 'Python factor source' },
          formula: { type: 'string', description: 'Factor formula' },
          file: { type: 'string', description: 'Load factor source from a file' },
          name: { type: 'string', description: 'Factor name' },
          description: { type: 'string', description: 'Factor description' },
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const content = selectOptionalContent(args as unknown as ContentArgs, true)
            const market = args.market === undefined ? undefined : toMarket(args.market)
            const updatedFactor = await client.research.updateFactor(
              resourceId(args.factorId, 'factor ID'),
              {
                name: args.name,
                description: args.description,
                code: content?.value,
                codeType: content?.type,
                market,
              },
            )
            if (market !== undefined) {
              await ensureMarket(client, 'factor', updatedFactor.id, updatedFactor.market, market)
            }
            return { success: true, factor_id: updatedFactor.id, factor: updatedFactor }
          }),
      }),
      save: defineCommand({
        meta: {
          name: 'save',
          description:
            'Save a factor code version. Check factor info or versions first, then use --baseVersionId=<latest_version_id> as the optimistic concurrency base. Use --confirmRebase to save on the latest HEAD after a conflict.',
        },
        args: {
          factorId: resourceIdArg('Factor ID'),
          market: {
            type: 'enum',
            options: ['stock', 'future', 'hk', 'us', 'STOCK', 'FUTURE', 'HK', 'US'],
          },
          code: { type: 'string', description: 'Python factor source' },
          formula: { type: 'string', description: 'Factor formula' },
          file: { type: 'string', description: 'Load factor source from a file' },
          name: { type: 'string', description: 'Factor name' },
          description: { type: 'string', description: 'Factor description' },
          baseVersionId: {
            type: 'string',
            description: 'Latest version ID to use as the optimistic concurrency base',
          },
          confirmRebase: {
            type: 'boolean',
            description: 'Rebase onto the latest HEAD before saving',
          },
          startDate: { type: 'string', description: 'Analysis start date' },
          endDate: { type: 'string', description: 'Analysis end date' },
          adjustmentCycle: { type: 'string' },
          groupNumber: { type: 'string' },
          factorDirection: { type: 'string' },
          stockPool: { type: 'string' },
          marketType: { type: 'string' },
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const content = selectContent(args as unknown as ContentArgs, true)
            const factorId = resourceId(args.factorId, 'factor ID')
            const current = await client.research.getFactor(factorId)
            const previous = getFactorAnalysisParams(current.latest_version?.params)
            const analysisParams = {
              ...previous,
              ...(args.startDate === undefined
                ? {}
                : { periodStart: normalizeDate(args.startDate) }),
              ...(args.endDate === undefined ? {} : { periodEnd: normalizeDate(args.endDate) }),
              ...(args.adjustmentCycle === undefined
                ? {}
                : { adjustmentCycle: positiveInteger(args.adjustmentCycle, 'adjustmentCycle') }),
              ...(args.groupNumber === undefined
                ? {}
                : { groupNumber: boundedInteger(args.groupNumber, 'groupNumber', 2, 20) }),
              ...(args.factorDirection === undefined
                ? {}
                : { factorDirection: factorDirection(args.factorDirection) }),
              ...(args.stockPool === undefined ? {} : { stockPool: args.stockPool }),
              ...(args.marketType === undefined ? {} : { marketType: args.marketType }),
            }
            const saved = await client.research.saveFactor(factorId, {
              code: content.value,
              codeType: content.type,
              market: args.market === undefined ? current.market : toMarket(args.market),
              name: args.name,
              description: args.description,
              baseVersionId:
                args.baseVersionId === undefined
                  ? undefined
                  : resourceId(args.baseVersionId, 'base version ID'),
              confirmRebase: Boolean(args.confirmRebase),
              analysisParams,
            })
            return {
              success: true,
              factor_id: factorId,
              version_id: saved.version.id,
              version_created: saved.version_created,
              factor: saved,
            }
          }),
      }),
      versions: defineCommand({
        meta: { name: 'versions', description: 'List factor code versions' },
        args: { factorId: resourceIdArg('Factor ID') },
        run: ({ args }) =>
          runtime.research(async (client) => ({
            success: true,
            factor_id: resourceId(args.factorId, 'factor ID'),
            versions: await client.research.listFactorVersions(
              resourceId(args.factorId, 'factor ID'),
            ),
          })),
      }),
      revert: defineCommand({
        meta: { name: 'revert', description: 'Revert a factor version as a new version' },
        args: {
          factorId: resourceIdArg('Factor ID'),
          versionNumber: resourceIdArg('Version number'),
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const factorId = resourceId(args.factorId, 'factor ID')
            const version = await client.research.revertFactorVersion(
              factorId,
              resourceId(args.versionNumber, 'version number'),
            )
            return { success: true, factor_id: factorId, version }
          }),
      }),
      run: defineCommand({
        meta: { name: 'run', description: 'Run a factor analysis' },
        args: {
          factorId: resourceIdArg('Factor ID'),
          name: { type: 'string', description: 'Analysis name' },
          factorVersionId: { type: 'string', description: 'Factor version ID' },
          startDate: { type: 'string', description: 'Start date (YYYYMMDD or YYYY-MM-DD)' },
          endDate: { type: 'string', description: 'End date (YYYYMMDD or YYYY-MM-DD)' },
          adjustmentCycle: { type: 'string', default: '5', description: 'Rebalance cycle' },
          groupNumber: { type: 'string', default: '5', description: 'Group count (2-20)' },
          factorDirection: {
            type: 'string',
            default: 'Positive',
            description: 'Positive or Negative',
          },
          stockPool: { type: 'string', description: 'Stock pool' },
          marketType: { type: 'string', description: 'Futures market type' },
          ...waitArgs,
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const factorId = resourceId(args.factorId, 'factor ID')
            const analysis = await client.research.createFactorAnalysis(factorId, {
              name: args.name,
              factorVersionId:
                args.factorVersionId === undefined
                  ? undefined
                  : resourceId(args.factorVersionId, 'factor version ID'),
              periodStart: normalizeDate(args.startDate),
              periodEnd: normalizeDate(args.endDate),
              adjustmentCycle: positiveInteger(args.adjustmentCycle, 'adjustmentCycle'),
              groupNumber: boundedInteger(args.groupNumber, 'groupNumber', 2, 20),
              factorDirection: factorDirection(args.factorDirection),
              stockPool: args.stockPool,
              marketType: args.marketType,
            })
            if (args.noWait) {
              return {
                success: true,
                status: 'SUBMITTED',
                factor_id: factorId,
                analysis_id: analysis.id,
                analysis,
              }
            }
            const result = await client.research.pollFactorAnalysis(
              analysis.id,
              pollOptions(args as unknown as WaitArgs),
            )
            return { ...resultResponse(result, 'analysis_id'), factor_id: factorId }
          }),
      }),
      stop: defineCommand({
        meta: { name: 'stop', description: 'Cancel a factor analysis' },
        args: {
          analysisId: resourceIdArg('Analysis ID'),
          pollInterval: { type: 'string', default: '1', description: 'Poll interval in seconds' },
          timeout: {
            type: 'string',
            default: '10',
            description: 'Maximum confirmation wait in seconds',
          },
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const analysisId = resourceId(args.analysisId, 'analysis ID')
            let result = await client.research.cancelFactorAnalysis(analysisId)
            let status = resultStatus(result)
            if (
              (status === 'PENDING' || status === 'RUNNING') &&
              numberArg(args.timeout, 'timeout') > 0
            ) {
              result = await client.research.pollFactorAnalysis(
                analysisId,
                pollOptions(args as unknown as WaitArgs),
              )
              status = resultStatus(result)
            }
            return {
              success: status === 'CANCELLED',
              analysis_id: analysisId,
              request_accepted: true,
              status: status === 'TIMEOUT' ? 'STOP_REQUESTED' : status,
              analysis: result,
            }
          }),
      }),
      result: defineCommand({
        meta: { name: 'result', description: 'Get a factor analysis result' },
        args: { analysisId: resourceIdArg('Analysis ID') },
        run: ({ args }) =>
          runtime.research(async (client) =>
            resultResponse(
              await client.research.getFactorAnalysis(resourceId(args.analysisId, 'analysis ID')),
              'analysis_id',
            ),
          ),
      }),
      list: defineCommand({
        meta: { name: 'list', description: 'List factor definitions' },
        args: { ...listArgs },
        run: ({ args }) =>
          runtime.research(async (client) =>
            pageResponse(
              await client.research.listFactors(listInput(args as unknown as ListArgs)),
              'factors',
              Boolean(args.includeContent),
            ),
          ),
      }),
      delete: defineCommand({
        meta: { name: 'delete', description: 'Delete factor definitions' },
        args: {
          factorId: resourceIdArg('Factor ID'),
          yes: { type: 'boolean', description: 'Confirm deletion' },
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            if (!args.yes) throw new CliUsageError('deletion confirmation requires --yes')
            const ids = resourceIds(args._, 'factor ID')
            await Promise.all(ids.map((id) => client.research.deleteFactor(id)))
            return { success: true, deleted: ids }
          }),
      }),
    },
  })
}
