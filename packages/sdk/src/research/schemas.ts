import * as v from 'valibot'

import { TqxValidationError } from '../errors'
import { isRecord } from '../utils/basic/type-guard'

const finiteNumber = v.pipe(
  v.number(),
  v.check((value) => Number.isFinite(value), 'Expected a finite number'),
)
const nonNegativeNumber = v.pipe(finiteNumber, v.minValue(0))
const positiveInteger = v.pipe(v.number(), v.safeInteger(), v.minValue(1))
const nonNegativeInteger = v.pipe(v.number(), v.safeInteger(), v.minValue(0))
const text = (max: number) => v.pipe(v.string(), v.maxLength(max))
const dateString = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}$/),
  v.check((value) => {
    const date = new Date(`${value}T00:00:00Z`)
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  }, 'Expected a valid YYYY-MM-DD date'),
)
const sourceCode = v.pipe(
  v.string(),
  v.check(
    (value) => new TextEncoder().encode(value).length <= 1024 * 1024,
    'Source code exceeds 1 MiB',
  ),
)
export const ResourceIdSchema = v.pipe(
  v.string(),
  v.regex(/^[0-9a-f]{24}$/, 'Expected a 24-character lowercase ObjectId'),
)
export const ResourceIdInputSchema = ResourceIdSchema
export const RequestIdSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(128),
  v.regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
)
export const QubeMarketSchema = v.pipe(
  v.string(),
  v.transform((value) => value.trim().toLowerCase()),
  v.picklist(['stock', 'future', 'hk', 'us']),
)
export const FactorCodeTypeSchema = v.picklist(['python', 'formula'])
export const BacktestFrequencySchema = v.picklist(['1d', '1M'])
export const PollIntervalSchema = v.pipe(finiteNumber, v.minValue(Number.MIN_VALUE))
export const PollTimeoutSchema = nonNegativeNumber
const titleSchema = v.pipe(
  v.string(),
  v.check((value) => {
    const length = [...value].length
    return (
      length >= 1 &&
      length <= 200 &&
      value === value.trim() &&
      !/[\p{Cc}\p{Cs}]/u.test(value) &&
      !/[\\/]/.test(value) &&
      !['.', '..'].includes(value) &&
      !/\.(py|formula)$/i.test(value)
    )
  }, 'Expected a business title of 1-200 characters without paths, control characters or source extensions'),
)
const description = text(2000)
export const OriginInputSchema = v.strictObject({
  sessionId: v.pipe(text(128), v.minLength(1)),
  chatRunId: v.pipe(text(128), v.minLength(1)),
})
export const FactorBindingInputSchema = v.strictObject({
  factorId: ResourceIdInputSchema,
  factorVersionId: ResourceIdInputSchema,
})

const backtestEntries = {
  periodStart: v.optional(dateString),
  periodEnd: v.optional(dateString),
  initBalance: v.optional(v.pipe(finiteNumber, v.minValue(Number.MIN_VALUE))),
  commissionRate: v.optional(nonNegativeNumber),
  slippage: v.optional(nonNegativeNumber),
  frequency: v.optional(BacktestFrequencySchema),
  standardSymbol: v.optional(v.picklist(['sse_composite', 'csi300', 'csi500', 'csi1000'])),
  marginRate: v.optional(positiveInteger),
}
export const BacktestParametersSchema = v.pipe(
  v.strictObject(backtestEntries),
  v.check(
    (value) =>
      validPeriod(value.periodStart, value.periodEnd, value.frequency === '1M' ? 1 : 10, false),
    'Invalid backtest period (maximum 1 year for minute bars or 10 years for daily bars)',
  ),
)
const analysisEntries = {
  periodStart: v.optional(dateString),
  periodEnd: v.optional(dateString),
  adjustmentCycle: v.optional(v.picklist([1, 3, 5, 10, 20, 30])),
  groupNumber: v.optional(v.picklist([3, 5, 10, 20])),
  factorDirection: v.optional(v.picklist([1, -1])),
  stockPool: v.optional(v.picklist(['沪深全A', '沪深300', '中证500', '中证1000'])),
  marketType: v.optional(v.literal('主力')),
}
export const FactorAnalysisParamsInputSchema = v.pipe(
  v.strictObject(analysisEntries),
  v.check(
    (value) => validPeriod(value.periodStart, value.periodEnd, 5, true),
    'Analysis period must increase and not exceed five years',
  ),
)
function validPeriod(
  start: string | undefined,
  end: string | undefined,
  years: number,
  strict: boolean,
): boolean {
  if (start === undefined || end === undefined) return true
  const [year, month, day] = start.split('-').map(Number) as [number, number, number]
  const lastDay = new Date(Date.UTC(year + years, month, 0)).getUTCDate()
  const boundary = `${String(year + years).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
  return (strict ? end > start : end >= start) && end <= boundary
}

const createEntries = {
  requestId: RequestIdSchema,
  title: titleSchema,
  description: v.optional(description),
  code: sourceCode,
  market: QubeMarketSchema,
  origin: v.optional(OriginInputSchema),
}
export const CreateFactorInputSchema = v.strictObject({
  ...createEntries,
  codeType: FactorCodeTypeSchema,
})
export const CreateStrategyInputSchema = v.strictObject({
  ...createEntries,
  backtest: v.optional(BacktestParametersSchema),
  factorBinding: v.optional(v.nullable(FactorBindingInputSchema)),
})
export const SourceUpdateInputSchema = v.strictObject({
  requestId: RequestIdSchema,
  baseSourceRevision: positiveInteger,
  code: sourceCode,
  origin: v.optional(OriginInputSchema),
})
const configEntries = {
  baseConfigRevision: positiveInteger,
  title: v.optional(titleSchema),
  description: v.optional(description),
}
export const UpdateFactorInputSchema = v.pipe(
  v.strictObject({ ...configEntries, parameters: v.optional(FactorAnalysisParamsInputSchema) }),
  v.check(
    (input) =>
      input.title !== undefined ||
      input.description !== undefined ||
      input.parameters !== undefined,
    'Expected at least one field to update',
  ),
)
export const UpdateStrategyInputSchema = v.pipe(
  v.strictObject({
    ...configEntries,
    requestId: v.optional(RequestIdSchema),
    backtest: v.optional(BacktestParametersSchema),
    factorBinding: v.optional(v.nullable(FactorBindingInputSchema)),
  }),
  v.check(
    (input) =>
      input.title !== undefined ||
      input.description !== undefined ||
      input.backtest !== undefined ||
      input.factorBinding !== undefined,
    'Expected at least one field to update',
  ),
)
const revisionEntries = {
  requestId: RequestIdSchema,
  expectedSourceRevision: positiveInteger,
  expectedConfigRevision: positiveInteger,
}
export const RestoreInputSchema = v.strictObject(revisionEntries)
export const FactorAnalysisInputSchema = v.strictObject({
  ...revisionEntries,
  parameters: v.optional(FactorAnalysisParamsInputSchema),
  origin: v.optional(OriginInputSchema),
})
export const StrategyBacktestInputSchema = v.strictObject({
  ...revisionEntries,
  backtest: v.optional(BacktestParametersSchema),
  origin: v.optional(OriginInputSchema),
})
export const CreateVersionInputSchema = v.strictObject({
  requestId: RequestIdSchema,
  runId: ResourceIdInputSchema,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  description: v.optional(v.pipe(description, v.trim())),
})
export const ValidateFactorInputSchema = v.union([
  v.strictObject({
    factorId: ResourceIdInputSchema,
    expectedSourceRevision: v.optional(positiveInteger),
  }),
  v.strictObject({ code: sourceCode, market: QubeMarketSchema, codeType: FactorCodeTypeSchema }),
])
export const ValidateStrategyInputSchema = v.union([
  v.strictObject({ strategyId: ResourceIdInputSchema, expectedSourceRevision: positiveInteger }),
  v.strictObject({ code: sourceCode, market: QubeMarketSchema }),
])
const listEntries = {
  limit: v.optional(v.pipe(positiveInteger, v.maxValue(100))),
  cursor: v.optional(v.pipe(text(1024), v.minLength(1))),
  market: v.optional(QubeMarketSchema),
  keyword: v.optional(text(200)),
}
export const ListQubeResourcesInputSchema = v.strictObject(listEntries)
export const ListFactorsInputSchema = v.strictObject({
  ...listEntries,
  bindableOnly: v.optional(v.boolean()),
})
export const ListFactorVersionsInputSchema = v.strictObject({
  market: QubeMarketSchema,
  query: v.optional(text(200)),
  factorId: v.optional(ResourceIdInputSchema),
  limit: listEntries.limit,
  cursor: listEntries.cursor,
})
const timeFilter = v.pipe(
  v.string(),
  v.check(
    (value) =>
      v.safeParse(dateString, value).success ||
      (/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
        Number.isFinite(Date.parse(value))),
    'Expected an ISO date or timezone-aware datetime',
  ),
)
function researchTime(value: string, end: boolean): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // Qube interprets date-only filters as Shanghai calendar days.
    return Date.parse(`${value}T00:00:00+08:00`) + (end ? 86_400_000 : 0)
  }
  return Date.parse(value)
}
export const ListResearchInputSchema = v.pipe(
  v.strictObject({
    ...listEntries,
    limit: v.optional(v.pipe(positiveInteger, v.maxValue(10))),
    title: v.optional(text(200)),
    description: v.optional(text(200)),
    status: v.optional(
      v.picklist([
        'queued',
        'preparing',
        'running',
        'succeeded',
        'failed',
        'cancelled',
        'cancelling',
        'no_valid_candidates',
      ]),
    ),
    factorId: v.optional(ResourceIdInputSchema),
    strategyId: v.optional(ResourceIdInputSchema),
    timeField: v.optional(v.picklist(['created_at', 'updated_at'])),
    from: v.optional(timeFilter),
    to: v.optional(timeFilter),
  }),
  v.check(
    (value) =>
      value.from === undefined ||
      value.to === undefined ||
      researchTime(value.from, false) < researchTime(value.to, true),
    'from must be earlier than to',
  ),
)
export const ListFactorAnalysesInputSchema = v.strictObject({
  includeDeleted: v.optional(v.boolean()),
  status: v.optional(
    v.picklist(['preparing', 'queued', 'running', 'succeeded', 'failed', 'cancelled']),
  ),
})
export const ListStrategyBacktestsInputSchema = v.strictObject({
  limit: v.optional(v.pipe(positiveInteger, v.maxValue(200))),
})
const record = v.looseObject({})
const optionalRecord = v.optional(v.nullable(record))
export const DiagnosticSchema = v.looseObject({
  message: v.string(),
  code: v.optional(v.string()),
  field: v.optional(v.nullable(v.string())),
})
export const ValidationResultSchema = v.looseObject({
  valid: v.boolean(),
  diagnostics: v.array(DiagnosticSchema),
  code_sha256: v.string(),
  source_revision: v.optional(positiveInteger),
})
const assetEntries = {
  id: ResourceIdSchema,
  title: v.string(),
  description: v.optional(v.string()),
  market: QubeMarketSchema,
  source_revision: positiveInteger,
  config_revision: positiveInteger,
  parameters: record,
  code: v.optional(v.string()),
  validation: optionalRecord,
  parameter_validation: optionalRecord,
}
export const FactorSchema = v.looseObject({ ...assetEntries, code_type: FactorCodeTypeSchema })
export const StrategySchema = v.looseObject({ ...assetEntries, code_type: v.literal('python') })
export const FactorSourceSchema = v.looseObject({ ...FactorSchema.entries, code: v.string() })
export const StrategySourceSchema = v.looseObject({ ...StrategySchema.entries, code: v.string() })
export const ResearchSummarySchema = v.looseObject({ id: ResourceIdSchema })
export const ResearchStatusSchema = v.picklist([
  'preparing',
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
])
const runEntries = {
  id: ResourceIdSchema,
  status: ResearchStatusSchema,
  progress: optionalRecord,
  cancel_requested: v.optional(v.boolean()),
  metrics: optionalRecord,
}
export const FactorAnalysisSchema = v.looseObject({ ...runEntries, factor_id: ResourceIdSchema })
export const FactorAnalysisSubmissionSchema = v.looseObject({
  run_id: ResourceIdSchema,
  factor_id: ResourceIdSchema,
  status: ResearchStatusSchema,
  idempotent: v.boolean(),
  code_sha256: v.string(),
  params: record,
})
export const BacktestSchema = v.looseObject({
  ...runEntries,
  strategy_id: ResourceIdSchema,
})
export const FactorVersionSchema = v.looseObject({
  id: ResourceIdSchema,
  factor_id: ResourceIdSchema,
  version: positiveInteger,
  name: v.string(),
  run_id: ResourceIdSchema,
  code: v.optional(v.string()),
})
export const StrategyVersionSchema = v.looseObject({
  id: ResourceIdSchema,
  strategy_id: ResourceIdSchema,
  version: positiveInteger,
  name: v.string(),
  run_id: ResourceIdSchema,
  code: v.optional(v.string()),
})
export const DeletedResourceSchema = v.looseObject({
  id: ResourceIdSchema,
  deleted: v.literal(true),
})
export const ResultPageInputSchema = v.pipe(
  v.strictObject({
    field: v.picklist(['equity', 'trades', 'logs', 'symbol_performance', 'account_summary']),
    offset: v.optional(nonNegativeInteger),
    limit: v.optional(v.pipe(positiveInteger, v.maxValue(500))),
    keyword: v.optional(text(200)),
    symbol: v.optional(v.pipe(text(64), v.minLength(1))),
  }),
  v.check(
    (input) => input.symbol === undefined || input.field === 'trades',
    'symbol is only supported for trades',
  ),
)
export const ResultPageSchema = v.looseObject({
  rows: v.array(v.unknown()),
  items: v.optional(v.array(v.unknown())),
  data: v.optional(v.unknown()),
  total: nonNegativeInteger,
  offset: nonNegativeInteger,
  limit: positiveInteger,
  has_more: v.boolean(),
})
export const ChartInputSchema = v.pipe(
  v.strictObject({
    from: v.optional(timeFilter),
    to: v.optional(timeFilter),
    maxPoints: v.optional(v.pipe(positiveInteger, v.minValue(2), v.maxValue(5000))),
  }),
  v.check(
    (value) =>
      value.from === undefined ||
      value.to === undefined ||
      Date.parse(value.from) <= Date.parse(value.to),
    'from must not be later than to',
  ),
)

const chartRange = v.looseObject({ from: v.nullable(v.string()), to: v.nullable(v.string()) })
export const BacktestChartSchema = v.looseObject({
  run_id: ResourceIdSchema,
  range: chartRange,
  extent: chartRange,
  points: v.array(
    v.looseObject({
      ts: v.string(),
      equity: v.nullable(finiteNumber),
      break_before: v.optional(v.boolean()),
    }),
  ),
  source_count: nonNegativeInteger,
  total_count: nonNegativeInteger,
  sampled: v.boolean(),
  trade_days: v.array(
    v.looseObject({
      day: v.string(),
      ts: v.string(),
      equity: v.nullable(finiteNumber),
      buy_count: nonNegativeInteger,
      sell_count: nonNegativeInteger,
      total: nonNegativeInteger,
      counts: v.record(v.string(), nonNegativeInteger),
      trades: v.array(record),
    }),
  ),
  date_anchors: v.optional(
    v.array(v.looseObject({ day: v.string(), from: v.string(), to: v.string() })),
  ),
  complete: v.optional(v.nullable(v.boolean())),
})
export const BacktestSymbolKlinesSchema = v.looseObject({
  market: QubeMarketSchema,
  symbol: v.string(),
  period: v.literal('1d'),
  period_start: dateString,
  period_end: dateString,
  bars: v.array(
    v.looseObject({
      timestamp: finiteNumber,
      open: finiteNumber,
      high: finiteNumber,
      low: finiteNumber,
      close: finiteNumber,
      volume: v.nullable(finiteNumber),
      turnover: v.optional(v.nullable(finiteNumber)),
    }),
  ),
})

const tuningCandidateParameters = v.strictObject({
  adjustmentCycle: analysisEntries.adjustmentCycle,
  groupNumber: analysisEntries.groupNumber,
  factorDirection: analysisEntries.factorDirection,
  stockPool: v.optional(v.picklist(['沪深全A', '沪深300', '中证500', '中证1000'])),
  marketType: v.optional(v.literal('主力')),
})
const parameterName = v.pipe(v.string(), v.regex(/^[A-Za-z][A-Za-z0-9_]{0,127}$/))
const numericParameters = v.record(parameterName, finiteNumber)
const factorTuningCandidate = v.pipe(
  v.strictObject({
    baseline: v.optional(v.boolean(), false),
    parameters: v.optional(tuningCandidateParameters),
    factorParameters: v.optional(numericParameters),
  }),
  v.check(
    (input) =>
      !input.baseline ||
      (Object.values(input.parameters ?? {}).every((value) => value === undefined) &&
        Object.keys(input.factorParameters ?? {}).length === 0),
    'Baseline candidates cannot override parameters',
  ),
)
const tuningPeriod = v.pipe(
  v.strictObject({ periodStart: dateString, periodEnd: dateString }),
  v.check((input) => input.periodEnd > input.periodStart, 'periodEnd must be after periodStart'),
)
export const FactorTuningInputSchema = v.pipe(
  v.strictObject({
    ...revisionEntries,
    candidates: v.pipe(v.array(factorTuningCandidate), v.minLength(1), v.maxLength(32)),
    objective: v.optional(v.literal('rank_ic_mean'), 'rank_ic_mean'),
    holdoutEnabled: v.optional(v.literal(false), false),
    researchPeriod: tuningPeriod,
    warmupTradingDays: v.pipe(nonNegativeInteger, v.maxValue(5000)),
    origin: v.optional(OriginInputSchema),
  }),
  v.check(
    (input) => input.candidates.filter((candidate) => candidate.baseline).length === 1,
    'Expected exactly one baseline candidate',
  ),
)
export const StrategyTuningInputSchema = v.pipe(
  v.strictObject({
    ...revisionEntries,
    candidates: v.pipe(
      v.array(
        v.strictObject({
          strategyParameters: v.pipe(numericParameters, v.minEntries(1), v.maxEntries(256)),
        }),
      ),
      v.minLength(1),
    ),
    objective: v.optional(v.picklist(['total_return', 'sharpe', 'max_drawdown']), 'total_return'),
    validationEnabled: v.optional(v.boolean(), true),
    tradingDates: v.pipe(v.array(dateString), v.minLength(2), v.maxLength(4000)),
    origin: v.optional(OriginInputSchema),
  }),
  v.check(
    (input) =>
      input.tradingDates.every((date, index, dates) => index === 0 || date > dates[index - 1]!),
    'tradingDates must be sorted and unique',
  ),
  v.check((input) => {
    const candidates = new Map(
      input.candidates.map((candidate) => [
        JSON.stringify(
          Object.entries(candidate.strategyParameters).toSorted(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        ),
        candidate.strategyParameters,
      ]),
    )
    return (
      candidates.size <= 31 &&
      [...candidates.values()].reduce(
        (total, parameters) => total + Object.keys(parameters).length,
        0,
      ) <= 256
    )
  }, 'Expected at most 31 unique candidates and 256 total strategy parameter keys'),
)
export const FactorTuningSchema = v.looseObject({
  id: ResourceIdSchema,
  factor_id: ResourceIdSchema,
  status: v.string(),
})
export const StrategyTuningSchema = v.looseObject({
  id: ResourceIdSchema,
  strategy_id: ResourceIdSchema,
  status: v.string(),
})
export const FactorSnapshotSchema = v.looseObject({
  id: ResourceIdSchema,
  run_id: ResourceIdSchema,
  name: v.string(),
})
export const TuningRerunInputSchema = v.strictObject({ requestId: RequestIdSchema })
export const FactorTuningApplyInputSchema = v.strictObject({
  requestId: RequestIdSchema,
  trialId: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  expectedSourceRevision: positiveInteger,
  expectedConfigRevision: positiveInteger,
})
export const StrategyTuningApplyInputSchema = v.strictObject({
  requestId: RequestIdSchema,
  candidateId: ResourceIdInputSchema,
  expectedSourceRevision: positiveInteger,
  expectedConfigRevision: positiveInteger,
})
export const FactorSnapshotInputSchema = v.strictObject({
  runId: ResourceIdInputSchema,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
})

export interface QubePage<T> {
  items: T[]
  hasMore: boolean
  nextCursor: string | null
  counts?: Record<string, number>
}
export interface PollOptions<T> {
  interval?: number
  timeout?: number
  progressCallback?: (result: T) => void
}
export interface PollTimeoutResult {
  cli_status: 'TIMEOUT'
  timeout_seconds: number
}
export type PollResult<T> = T | (T & PollTimeoutResult)
export type QubeMarket = v.InferOutput<typeof QubeMarketSchema>
export type BacktestParameters = v.InferOutput<typeof BacktestParametersSchema>
export type FactorAnalysisParamsInput = v.InferInput<typeof FactorAnalysisParamsInputSchema>
export type FactorTuning = v.InferOutput<typeof FactorTuningSchema>
export type StrategyTuning = v.InferOutput<typeof StrategyTuningSchema>
export type FactorSnapshot = v.InferOutput<typeof FactorSnapshotSchema>
export type FactorTuningInput = v.InferInput<typeof FactorTuningInputSchema>
export type StrategyTuningInput = v.InferInput<typeof StrategyTuningInputSchema>
export type TuningRerunInput = v.InferInput<typeof TuningRerunInputSchema>
export type FactorTuningApplyInput = v.InferInput<typeof FactorTuningApplyInputSchema>
export type StrategyTuningApplyInput = v.InferInput<typeof StrategyTuningApplyInputSchema>
export type FactorSnapshotInput = v.InferInput<typeof FactorSnapshotInputSchema>
export type CreateFactorInput = v.InferInput<typeof CreateFactorInputSchema>
export type CreateStrategyInput = v.InferInput<typeof CreateStrategyInputSchema>
export type UpdateFactorInput = v.InferInput<typeof UpdateFactorInputSchema>
export type UpdateStrategyInput = v.InferInput<typeof UpdateStrategyInputSchema>
export type SourceUpdateInput = v.InferInput<typeof SourceUpdateInputSchema>
export type RestoreInput = v.InferInput<typeof RestoreInputSchema>
export type FactorAnalysisInput = v.InferInput<typeof FactorAnalysisInputSchema>
export type StrategyBacktestInput = v.InferInput<typeof StrategyBacktestInputSchema>
export type CreateVersionInput = v.InferInput<typeof CreateVersionInputSchema>
export type ValidateFactorInput = v.InferInput<typeof ValidateFactorInputSchema>
export type ValidateStrategyInput = v.InferInput<typeof ValidateStrategyInputSchema>
export type ListQubeResourcesInput = v.InferInput<typeof ListQubeResourcesInputSchema>
export type ListFactorsInput = v.InferInput<typeof ListFactorsInputSchema>
export type ListResearchInput = v.InferInput<typeof ListResearchInputSchema>
export type ListFactorAnalysesInput = v.InferInput<typeof ListFactorAnalysesInputSchema>
export type ListStrategyBacktestsInput = v.InferInput<typeof ListStrategyBacktestsInputSchema>
export type ListBacktestsInput = ListResearchInput
export type Factor = v.InferOutput<typeof FactorSchema>
export type Strategy = v.InferOutput<typeof StrategySchema>
export type FactorAnalysis = v.InferOutput<typeof FactorAnalysisSchema>
export type FactorAnalysisSubmission = v.InferOutput<typeof FactorAnalysisSubmissionSchema>
export type Backtest = v.InferOutput<typeof BacktestSchema>
export type FactorVersion = v.InferOutput<typeof FactorVersionSchema>
export type StrategyVersion = v.InferOutput<typeof StrategyVersionSchema>
export type ResultPageInput = v.InferInput<typeof ResultPageInputSchema>
export type ChartInput = v.InferInput<typeof ChartInputSchema>
export type BacktestChart = v.InferOutput<typeof BacktestChartSchema>
export type BacktestSymbolKlines = v.InferOutput<typeof BacktestSymbolKlinesSchema>
export type ListFactorVersionsInput = v.InferInput<typeof ListFactorVersionsInputSchema>

export function getBacktestParameters(value: unknown): BacktestParameters {
  if (!isRecord(value)) return {}
  const parameters = isRecord(value.parameters) ? value.parameters : value
  const raw = isRecord(value.backtest_params)
    ? value.backtest_params
    : isRecord(parameters.backtest)
      ? parameters.backtest
      : parameters
  return parseResearchInput(BacktestParametersSchema, {
    periodStart: raw.period_start ?? undefined,
    periodEnd: raw.period_end ?? undefined,
    initBalance: raw.init_balance ?? undefined,
    commissionRate: raw.commission_rate ?? undefined,
    slippage: raw.slippage ?? undefined,
    frequency: raw.frequency ?? undefined,
    standardSymbol: raw.standard_symbol ?? undefined,
    marginRate: raw.margin_rate ?? undefined,
  })
}
export function getFactorAnalysisParams(value: unknown): FactorAnalysisParamsInput {
  if (!isRecord(value)) return {}
  const raw = isRecord(value.analysis_parameters)
    ? value.analysis_parameters
    : isRecord(value.parameters)
      ? value.parameters
      : isRecord(value.params)
        ? value.params
        : value
  return parseResearchInput(FactorAnalysisParamsInputSchema, {
    periodStart: raw.period_start ?? undefined,
    periodEnd: raw.period_end ?? undefined,
    adjustmentCycle: raw.adjustment_cycle ?? undefined,
    groupNumber: raw.group_number ?? undefined,
    factorDirection: raw.factor_direction ?? undefined,
    stockPool: raw.stock_pool ?? undefined,
    marketType: raw.market_type ?? undefined,
  })
}
export function parseResearchInput<
  TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(schema: TSchema, input: unknown): v.InferOutput<TSchema> {
  const result = v.safeParse(schema, input)
  if (!result.success) throw new TqxValidationError('Invalid SDK input', result.issues)
  return result.output
}
