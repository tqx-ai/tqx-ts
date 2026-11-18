import { randomUUID } from 'node:crypto'
import { defineCommand } from 'citty'
import type { FactorAnalysisParamsInput } from '@tqx-ai/sdk'
import type { CommandRuntime } from '../runtime/command-runtime'
import { CliUsageError } from '../utils/errors'
import {
  type ContentArgs,
  listArgs,
  listInput,
  normalizeDate,
  pollOptions,
  pageResponse,
  positiveInteger,
  type ListArgs,
  type WaitArgs,
  resourceId,
  resourceIdArg,
  resourceIds,
  readJsonInput,
  cancellationResponse,
  resultResponse,
  selectContent,
  toMarket,
  factorDirection,
  allowedInteger,
  waitArgs,
} from './shared'

const revision = (value: string | undefined, name: string) => positiveInteger(value, name)
export function createFactorCommand(runtime: CommandRuntime) {
  return defineCommand({
    meta: { name: 'factor', description: 'Manage Qube factor definitions and analyses' },
    subCommands: {
      create: defineCommand({
        meta: { name: 'create', description: 'Create a factor definition' },
        args: {
          market: { type: 'enum', options: ['hk', 'us'], required: true },
          code: { type: 'string' },
          formula: { type: 'string' },
          file: { type: 'string' },
          title: { type: 'string', default: 'TQX Factor' },
          description: { type: 'string' },
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const content = selectContent(args as unknown as ContentArgs, true)
            const factor = await client.research.createFactor({
              requestId: randomUUID(),
              title: args.title!,
              description: args.description,
              code: content.value,
              codeType: content.type,
              market: toMarket(args.market!),
            })
            return { success: true, factor_id: factor.id, factor }
          }),
      }),
      info: defineCommand({
        meta: { name: 'info', description: 'Get a factor definition' },
        args: { factorId: resourceIdArg('Factor ID') },
        run: ({ args }) =>
          runtime.research(async (client) => ({
            success: true,
            factor: await client.research.getFactor(resourceId(args.factorId, 'factor ID')),
          })),
      }),
      source: defineCommand({
        meta: { name: 'source', description: 'Get factor source' },
        args: { factorId: resourceIdArg('Factor ID') },
        run: ({ args }) =>
          runtime.research(async (client) => ({
            success: true,
            factor: await client.research.getFactorSource(resourceId(args.factorId, 'factor ID')),
          })),
      }),
      update: defineCommand({
        meta: { name: 'update', description: 'Update factor metadata and parameters' },
        args: {
          factorId: resourceIdArg('Factor ID'),
          baseConfigRevision: { type: 'string', required: true },
          title: { type: 'string' },
          description: { type: 'string' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          adjustmentCycle: { type: 'string' },
          groupNumber: { type: 'string' },
          factorDirection: { type: 'string' },
          stockPool: {
            type: 'string',
            description: 'Stock pool; currently only all (full market) is supported',
          },
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const id = resourceId(args.factorId, 'factor ID')
            const result = await client.research.updateFactor(id, {
              baseConfigRevision: revision(args.baseConfigRevision, 'baseConfigRevision'),
              title: args.title,
              description: args.description,
              parameters: [
                args.startDate,
                args.endDate,
                args.adjustmentCycle,
                args.groupNumber,
                args.factorDirection,
                args.stockPool,
              ].some((value) => value !== undefined)
                ? {
                    periodStart: normalizeDate(args.startDate),
                    periodEnd: normalizeDate(args.endDate),
                    adjustmentCycle:
                      args.adjustmentCycle !== undefined
                        ? allowedInteger(args.adjustmentCycle, 'adjustmentCycle', [
                            1, 3, 5, 10, 20, 30,
                          ] as const)
                        : undefined,
                    groupNumber:
                      args.groupNumber !== undefined
                        ? allowedInteger(args.groupNumber, 'groupNumber', [3, 5, 10, 20] as const)
                        : undefined,
                    factorDirection: factorDirection(args.factorDirection),
                    stockPool: args.stockPool as FactorAnalysisParamsInput['stockPool'],
                  }
                : undefined,
            })
            return { success: true, factor_id: id, factor: result }
          }),
      }),
      save: defineCommand({
        meta: { name: 'save', description: 'Save factor source against a source revision' },
        args: {
          factorId: resourceIdArg('Factor ID'),
          code: { type: 'string' },
          formula: { type: 'string' },
          file: { type: 'string' },
          baseSourceRevision: { type: 'string', required: true },
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const content = selectContent(args as unknown as ContentArgs, true)
            const id = resourceId(args.factorId, 'factor ID')
            const factor = await client.research.updateFactorSource(id, {
              requestId: randomUUID(),
              baseSourceRevision: revision(args.baseSourceRevision, 'baseSourceRevision'),
              code: content.value,
            })
            return { success: true, factor_id: id, factor }
          }),
      }),
      versions: defineCommand({
        meta: { name: 'versions', description: 'List factor versions' },
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
      version: defineCommand({
        meta: { name: 'version', description: 'Get a factor version' },
        args: { versionId: resourceIdArg('Factor version ID') },
        run: ({ args }) =>
          runtime.research(async (client) => ({
            success: true,
            version: await client.research.getFactorVersion(
              resourceId(args.versionId, 'version ID'),
            ),
          })),
      }),
      'version-create': defineCommand({
        meta: {
          name: 'version-create',
          description: 'Create a named factor version from an analysis',
        },
        args: {
          factorId: resourceIdArg('Factor ID'),
          runId: resourceIdArg('Successful analysis ID'),
          name: { type: 'string', required: true },
          description: { type: 'string' },
        },
        run: ({ args }) =>
          runtime.research(async (client) => ({
            success: true,
            version: await client.research.createFactorVersion(
              resourceId(args.factorId, 'factor ID'),
              {
                requestId: randomUUID(),
                runId: resourceId(args.runId, 'analysis ID'),
                name: args.name!,
                description: args.description,
              },
            ),
          })),
      }),
      'version-restore': defineCommand({
        meta: { name: 'version-restore', description: 'Restore a factor version' },
        args: {
          factorId: resourceIdArg('Factor ID'),
          versionId: resourceIdArg('Factor version ID'),
          expectedSourceRevision: { type: 'string', required: true },
          expectedConfigRevision: { type: 'string', required: true },
        },
        run: ({ args }) =>
          runtime.research(async (client) => ({
            success: true,
            factor: await client.research.restoreFactorVersion(
              resourceId(args.factorId, 'factor ID'),
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
      'analysis-restore': defineCommand({
        meta: { name: 'analysis-restore', description: 'Restore a factor analysis snapshot' },
        args: {
          factorId: resourceIdArg('Factor ID'),
          runId: resourceIdArg('Analysis ID'),
          expectedSourceRevision: { type: 'string', required: true },
          expectedConfigRevision: { type: 'string', required: true },
        },
        run: ({ args }) =>
          runtime.research(async (client) => ({
            success: true,
            factor: await client.research.restoreFactorAnalysis(
              resourceId(args.factorId, 'factor ID'),
              resourceId(args.runId, 'analysis ID'),
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
        meta: { name: 'tuning', description: 'Manage factor parameter tuning tasks' },
        subCommands: {
          list: defineCommand({
            meta: { name: 'list', description: 'List factor tunings' },
            args: { factorId: resourceIdArg('Factor ID') },
            run: ({ args }) =>
              runtime.research(async (client) => ({
                success: true,
                tunings: await client.research.listFactorTunings(
                  resourceId(args.factorId, 'factor ID'),
                ),
              })),
          }),
          get: defineCommand({
            meta: { name: 'get', description: 'Get a factor tuning' },
            args: { tuningId: resourceIdArg('Factor tuning ID') },
            run: ({ args }) =>
              runtime.research(async (client) => ({
                success: true,
                tuning: await client.research.getFactorTuning(
                  resourceId(args.tuningId, 'tuning ID'),
                ),
              })),
          }),
          create: defineCommand({
            meta: {
              name: 'create',
              description: 'Create a factor tuning from a JSON request file',
            },
            args: {
              factorId: resourceIdArg('Factor ID'),
              file: { type: 'string', required: true },
            },
            run: ({ args }) =>
              runtime.research(async (client) => ({
                success: true,
                tuning: await client.research.createFactorTuning(
                  resourceId(args.factorId, 'factor ID'),
                  readJsonInput(args.file!, 'factor tuning JSON') as never,
                ),
              })),
          }),
          cancel: defineCommand({
            meta: { name: 'cancel', description: 'Cancel a factor tuning' },
            args: { tuningId: resourceIdArg('Factor tuning ID') },
            run: ({ args }) =>
              runtime.research(async (client) => ({
                success: true,
                tuning: await client.research.cancelFactorTuning(
                  resourceId(args.tuningId, 'tuning ID'),
                ),
              })),
          }),
          rerun: defineCommand({
            meta: { name: 'rerun', description: 'Rerun a factor tuning' },
            args: { tuningId: resourceIdArg('Factor tuning ID') },
            run: ({ args }) =>
              runtime.research(async (client) => ({
                success: true,
                tuning: await client.research.rerunFactorTuning(
                  resourceId(args.tuningId, 'tuning ID'),
                  { requestId: randomUUID() },
                ),
              })),
          }),
          apply: defineCommand({
            meta: { name: 'apply', description: 'Apply a successful factor tuning trial' },
            args: {
              tuningId: resourceIdArg('Factor tuning ID'),
              trialId: { type: 'string', required: true },
              expectedSourceRevision: { type: 'string', required: true },
              expectedConfigRevision: { type: 'string', required: true },
            },
            run: ({ args }) =>
              runtime.research(async (client) => ({
                success: true,
                ...(await client.research.applyFactorTuning(
                  resourceId(args.tuningId, 'tuning ID'),
                  {
                    requestId: randomUUID(),
                    trialId: args.trialId!,
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
        meta: { name: 'run', description: 'Run a factor analysis' },
        args: {
          factorId: resourceIdArg('Factor ID'),
          expectedSourceRevision: { type: 'string', required: true },
          expectedConfigRevision: { type: 'string', required: true },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          adjustmentCycle: { type: 'string' },
          groupNumber: { type: 'string' },
          factorDirection: { type: 'string' },
          stockPool: {
            type: 'string',
            description: 'Stock pool; currently only all (full market) is supported',
          },
          ...waitArgs,
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const id = resourceId(args.factorId, 'factor ID')
            const hasParameters = [
              args.startDate,
              args.endDate,
              args.adjustmentCycle,
              args.groupNumber,
              args.factorDirection,
              args.stockPool,
            ].some((value) => value !== undefined)
            const submitted = await client.research.createFactorAnalysis(id, {
              requestId: randomUUID(),
              expectedSourceRevision: revision(
                args.expectedSourceRevision,
                'expectedSourceRevision',
              ),
              expectedConfigRevision: revision(
                args.expectedConfigRevision,
                'expectedConfigRevision',
              ),
              parameters: hasParameters
                ? {
                    periodStart: normalizeDate(args.startDate),
                    periodEnd: normalizeDate(args.endDate),
                    adjustmentCycle:
                      args.adjustmentCycle === undefined
                        ? undefined
                        : allowedInteger(args.adjustmentCycle, 'adjustmentCycle', [
                            1, 3, 5, 10, 20, 30,
                          ] as const),
                    groupNumber:
                      args.groupNumber === undefined
                        ? undefined
                        : allowedInteger(args.groupNumber, 'groupNumber', [3, 5, 10, 20] as const),
                    factorDirection: factorDirection(args.factorDirection),
                    stockPool: args.stockPool as FactorAnalysisParamsInput['stockPool'],
                  }
                : undefined,
            })
            if (args.noWait)
              return {
                success: true,
                status: 'SUBMITTED',
                factor_id: id,
                analysis_id: submitted.run_id,
                analysis: submitted,
              }
            const result = await client.research.pollFactorAnalysis(
              String(submitted.run_id),
              pollOptions(args as unknown as WaitArgs),
            )
            return {
              ...resultResponse({ ...result, id: submitted.run_id } as never, 'analysis_id'),
              factor_id: id,
            }
          }),
      }),
      stop: defineCommand({
        meta: { name: 'stop', description: 'Cancel a factor analysis' },
        args: { analysisId: resourceIdArg('Analysis ID') },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const id = resourceId(args.analysisId, 'analysis ID')
            const result = await client.research.cancelFactorAnalysis(id)
            return cancellationResponse(result, id, 'analysis_id')
          }),
      }),
      analyses: defineCommand({
        meta: { name: 'analyses', description: 'List analyses for a factor' },
        args: {
          factorId: resourceIdArg('Factor ID'),
          includeDeleted: { type: 'boolean' },
          status: {
            type: 'enum',
            options: ['queued', 'preparing', 'running', 'succeeded', 'failed', 'cancelled'],
          },
        },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const factorId = resourceId(args.factorId, 'factor ID')
            const result = await client.research.listFactorAnalyses(factorId, {
              includeDeleted: args.includeDeleted,
              status: args.status as
                | 'queued'
                | 'preparing'
                | 'running'
                | 'succeeded'
                | 'failed'
                | 'cancelled'
                | undefined,
            })
            return {
              success: true,
              factor_id: factorId,
              count: result.runs.length,
              analyses: result.runs,
            }
          }),
      }),
      result: defineCommand({
        meta: { name: 'result', description: 'Get factor analysis result' },
        args: { analysisId: resourceIdArg('Analysis ID') },
        run: ({ args }) =>
          runtime.research(async (client) => ({
            success: true,
            analysis: await client.research.getFactorAnalysis(
              resourceId(args.analysisId, 'analysis ID'),
            ),
          })),
      }),
      list: defineCommand({
        meta: { name: 'list', description: 'List factor definitions' },
        args: { ...listArgs },
        run: ({ args }) =>
          runtime.research(async (client) => {
            const page = await client.research.listFactors(listInput(args as unknown as ListArgs))
            if (args.includeContent)
              page.items = await Promise.all(
                page.items.map((item) => client.research.getFactorSource(item.id)),
              )
            return pageResponse(page as never, 'factors', args.includeContent === true)
          }),
      }),
      delete: defineCommand({
        meta: { name: 'delete', description: 'Delete factor definitions' },
        args: { factorId: resourceIdArg('Factor ID'), yes: { type: 'boolean' } },
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
