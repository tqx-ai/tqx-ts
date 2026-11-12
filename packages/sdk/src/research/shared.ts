/* eslint-disable no-await-in-loop */
import * as v from 'valibot'

import {
  ListQubeResourcesInputSchema,
  ListResearchInputSchema,
  parseResearchInput,
  PollIntervalSchema,
  PollTimeoutSchema,
  ResourceIdInputSchema,
  type BacktestParameters,
  type FactorAnalysisParamsInput,
  type ListQubeResourcesInput,
  type ListResearchInput,
  type PollOptions,
  type PollResult,
  type QubePage,
  type FactorTuningInput,
  type StrategyTuningInput,
} from './schemas'

export interface ResearchRequestOptions<
  TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
> {
  schema: TSchema
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Record<string, string | number | undefined>
  body?: unknown
  headers?: Record<string, string>
}
export type ResearchRequest = <
  TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(
  path: string,
  options: ResearchRequestOptions<TSchema>,
) => Promise<v.InferOutput<TSchema>>
export function resourceId(value: string): string {
  const parsed = parseResearchInput(ResourceIdInputSchema, value)
  return encodeURIComponent(String(parsed))
}
export function originBody(input: { sessionId: string; chatRunId: string } | undefined) {
  return input === undefined
    ? undefined
    : { session_id: input.sessionId, chat_run_id: input.chatRunId }
}
export function revisionBody(input: {
  requestId: string
  expectedSourceRevision: number
  expectedConfigRevision: number
}) {
  return {
    request_id: input.requestId,
    expected_source_revision: input.expectedSourceRevision,
    expected_config_revision: input.expectedConfigRevision,
  }
}
export function sourceBody(input: {
  requestId: string
  baseSourceRevision: number
  code: string
  origin?: { sessionId: string; chatRunId: string }
}) {
  return {
    request_id: input.requestId,
    base_source_revision: input.baseSourceRevision,
    code: input.code,
    origin: originBody(input.origin),
  }
}
export function backtestBody(input: BacktestParameters | undefined) {
  return input === undefined
    ? undefined
    : {
        period_start: input.periodStart,
        period_end: input.periodEnd,
        init_balance: input.initBalance,
        commission_rate: input.commissionRate,
        slippage: input.slippage,
        frequency: input.frequency,
        standard_symbol: input.standardSymbol,
        margin_rate: input.marginRate,
      }
}
export function analysisBody(input: FactorAnalysisParamsInput | undefined) {
  return input === undefined
    ? undefined
    : {
        period_start: input.periodStart,
        period_end: input.periodEnd,
        adjustment_cycle: input.adjustmentCycle,
        group_number: input.groupNumber,
        factor_direction: input.factorDirection,
        stock_pool: input.stockPool,
        market_type: input.marketType,
      }
}

export function factorTuningBody(input: FactorTuningInput) {
  return {
    ...revisionBody(input),
    candidates: input.candidates.map((candidate) => ({
      baseline: candidate.baseline,
      parameters:
        candidate.parameters === undefined
          ? undefined
          : {
              adjustment_cycle: candidate.parameters.adjustmentCycle,
              group_number: candidate.parameters.groupNumber,
              factor_direction: candidate.parameters.factorDirection,
              stock_pool: candidate.parameters.stockPool,
              market_type: candidate.parameters.marketType,
            },
      factor_parameters: candidate.factorParameters,
    })),
    objective: input.objective,
    holdout_enabled: input.holdoutEnabled,
    research_period: {
      period_start: input.researchPeriod.periodStart,
      period_end: input.researchPeriod.periodEnd,
    },
    warmup_trading_days: input.warmupTradingDays,
    origin: originBody(input.origin),
  }
}

export function strategyTuningBody(input: StrategyTuningInput) {
  return {
    ...revisionBody(input),
    candidates: input.candidates.map((candidate) => ({
      strategy_parameters: candidate.strategyParameters,
    })),
    objective: input.objective,
    validation_enabled: input.validationEnabled,
    trading_dates: input.tradingDates,
    origin: originBody(input.origin),
  }
}

export async function listResources<T>(
  request: ResearchRequest,
  path: string,
  input: ListQubeResourcesInput,
  itemSchema: v.BaseSchema<unknown, T, v.BaseIssue<unknown>>,
  key: string,
  query: Record<string, string | number | undefined> = {},
): Promise<QubePage<T>> {
  const parsed = parseResearchInput(ListQubeResourcesInputSchema, input)
  const response = await request(path, {
    schema: v.looseObject({
      [key]: v.array(itemSchema),
      next_cursor: v.nullable(v.string()),
      has_more: v.optional(v.boolean()),
      counts: v.optional(v.record(v.string(), v.pipe(v.number(), v.safeInteger(), v.minValue(0)))),
    }),
    query: {
      limit: parsed.limit ?? 24,
      cursor: parsed.cursor,
      market: parsed.market,
      q: parsed.keyword,
      ...query,
    },
  })
  return {
    items: response[key] as T[],
    hasMore:
      typeof response.has_more === 'boolean' ? response.has_more : response.next_cursor !== null,
    nextCursor: response.next_cursor as string | null,
    ...(response.counts === undefined ? {} : { counts: response.counts as Record<string, number> }),
  }
}
export function listResearch<T>(
  request: ResearchRequest,
  path: string,
  input: ListResearchInput,
  itemSchema: v.BaseSchema<unknown, T, v.BaseIssue<unknown>>,
  key: string,
  parent: 'factor' | 'strategy',
): Promise<QubePage<T>> {
  const parsed = parseResearchInput(
    v.pipe(
      ListResearchInputSchema,
      v.check(
        (value) =>
          value.status === undefined ||
          (key === 'runs'
            ? ['preparing', 'queued', 'running', 'succeeded', 'failed', 'cancelled']
            : key === 'tunings'
              ? [
                  'queued',
                  'running',
                  'succeeded',
                  'failed',
                  'cancelled',
                  'cancelling',
                  'no_valid_candidates',
                ]
              : []
          ).includes(value.status),
        'status is not valid for this research list',
      ),
      v.check(
        (value) => key !== 'versions' || value.timeField !== 'updated_at',
        'Immutable versions only support created_at ordering',
      ),
    ),
    input,
  )
  if (
    (parent === 'factor' && parsed.strategyId !== undefined) ||
    (parent === 'strategy' && parsed.factorId !== undefined)
  ) {
    parseResearchInput(v.never(), input)
  }
  return listResources(
    request,
    path,
    {
      limit: parsed.limit ?? 10,
      cursor: parsed.cursor,
      market: parsed.market,
      keyword: parsed.keyword,
    },
    itemSchema,
    key,
    {
      view: 'summary',
      title: parsed.title,
      description: parsed.description,
      status: parsed.status,
      factor_id: parsed.factorId,
      strategy_id: parsed.strategyId,
      time_field: parsed.timeField,
      from: parsed.from,
      to: parsed.to,
    },
  )
}
export async function pollResource<T extends { status: string }>(
  fetchResult: () => Promise<T>,
  terminalStatuses: Set<string>,
  options: PollOptions<T>,
): Promise<PollResult<T>> {
  const interval = parseResearchInput(PollIntervalSchema, options.interval ?? 2)
  const timeout = parseResearchInput(PollTimeoutSchema, options.timeout ?? 600)
  const started = Date.now()
  while (true) {
    const result = await fetchResult()
    options.progressCallback?.(result)
    if (terminalStatuses.has(result.status.toLowerCase())) return result
    if ((Date.now() - started) / 1000 >= timeout)
      return { ...result, cli_status: 'TIMEOUT', timeout_seconds: timeout }
    await new Promise<void>((resolve) => setTimeout(resolve, interval * 1000))
  }
}
export const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled'])
