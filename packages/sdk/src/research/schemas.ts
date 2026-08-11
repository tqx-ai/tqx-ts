import * as v from 'valibot'

import { TqxValidationError } from '../errors'
import { isRecord } from '../utils/basic/type-guard'

const nonEmptyString = v.pipe(
  v.string(),
  v.transform((value) => value.trim()),
  v.minLength(1, 'Expected a non-empty string'),
)
const dateString = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date'))
const nonNegativeNumber = v.pipe(v.number(), v.minValue(0))
const positiveInteger = v.pipe(v.number(), v.integer(), v.minValue(1))
const finiteNumber = v.pipe(
  v.number(),
  v.check((value) => Number.isFinite(value), 'Expected a finite number'),
)
export const PollIntervalSchema = v.pipe(finiteNumber, v.minValue(Number.MIN_VALUE))
export const PollTimeoutSchema = v.pipe(finiteNumber, v.minValue(0))

export const QubeMarketSchema = v.pipe(
  v.string(),
  v.transform((value) => value.trim().toLowerCase()),
  v.picklist(['stock', 'future', 'hk', 'us']),
)
export const ResourceIdSchema = positiveInteger
export const FactorCodeTypeSchema = v.picklist(['python', 'formula'])
export const BacktestFrequencySchema = v.picklist(['1d', '1M'])

export const BacktestParametersSchema = v.strictObject({
  periodStart: v.optional(dateString),
  periodEnd: v.optional(dateString),
  initBalance: v.optional(positiveInteger),
  commissionRate: v.optional(nonNegativeNumber),
  slippage: v.optional(nonNegativeNumber),
  frequency: v.optional(BacktestFrequencySchema),
  symbols: v.optional(v.array(nonEmptyString)),
  /** Stock benchmark; unsupported for futures/HK/US backtests. */
  standardSymbol: v.optional(v.picklist(['上证指数', '沪深300', '中证500', '中证1000'])),
  /** Futures-only margin rate. */
  marginRate: v.optional(positiveInteger),
  /** @deprecated The research API currently accepts only close matching. */
  matchingType: v.optional(v.literal('close')),
})

export const FactorAnalysisParamsInputSchema = v.strictObject({
  periodStart: v.optional(dateString),
  periodEnd: v.optional(dateString),
  adjustmentCycle: v.optional(positiveInteger),
  groupNumber: v.optional(v.pipe(v.number(), v.integer(), v.minValue(2), v.maxValue(20))),
  factorDirection: v.optional(v.picklist([0, 1])),
  stockPool: v.optional(v.string()),
  marketType: v.optional(v.string()),
})

export const CreateFactorInputSchema = v.strictObject({
  name: nonEmptyString,
  description: v.optional(v.string()),
  code: nonEmptyString,
  codeType: FactorCodeTypeSchema,
  market: QubeMarketSchema,
  analysisParams: v.optional(FactorAnalysisParamsInputSchema),
  sourceSessionId: v.optional(ResourceIdSchema),
})

export const UpdateFactorInputSchema = v.pipe(
  v.strictObject({
    name: v.optional(nonEmptyString),
    description: v.optional(v.string()),
    code: v.optional(nonEmptyString),
    codeType: v.optional(FactorCodeTypeSchema),
    market: v.optional(QubeMarketSchema),
  }),
  v.check(
    (input) => Object.values(input).some((value) => value !== undefined),
    'Expected at least one field to update',
  ),
)

export const FactorAnalysisInputSchema = v.strictObject({
  factorVersionId: v.optional(ResourceIdSchema),
  name: v.optional(nonEmptyString),
  periodStart: v.optional(dateString),
  periodEnd: v.optional(dateString),
  adjustmentCycle: v.optional(positiveInteger),
  groupNumber: v.optional(v.pipe(v.number(), v.integer(), v.minValue(2), v.maxValue(20))),
  factorDirection: v.optional(v.picklist([0, 1])),
  stockPool: v.optional(v.string()),
  marketType: v.optional(v.string()),
})

export const FactorStrategyInputSchema = v.strictObject({
  periodStart: v.optional(dateString),
  periodEnd: v.optional(dateString),
  initBalance: v.optional(positiveInteger),
  rebalancePeriod: v.optional(positiveInteger),
  topN: v.optional(positiveInteger),
  stockPool: v.optional(v.string()),
  factorDirection: v.optional(v.picklist([0, 1])),
  weighting: v.optional(v.string()),
  maxPositionPerStock: v.optional(finiteNumber),
  takeProfitPct: v.optional(finiteNumber),
  stopLossPct: v.optional(finiteNumber),
  minHoldingDays: v.optional(positiveInteger),
  excludeSt: v.optional(v.boolean()),
  rebalanceThresholdBuffer: v.optional(v.pipe(v.number(), v.integer())),
  lotsPerSymbol: v.optional(positiveInteger),
  strategyName: v.optional(nonEmptyString),
})

export const FactorStrategyResponseSchema = v.looseObject({
  strategy_id: ResourceIdSchema,
  strategy_name: v.optional(v.string()),
  market: QubeMarketSchema,
})

export const FactorStrategyBacktestResponseSchema = v.looseObject({
  strategy_id: ResourceIdSchema,
  backtest_run_id: ResourceIdSchema,
  market: v.optional(QubeMarketSchema),
})

export const CreateStrategyInputSchema = v.strictObject({
  name: nonEmptyString,
  description: v.optional(v.string()),
  code: nonEmptyString,
  market: QubeMarketSchema,
  params: v.optional(v.record(v.string(), v.unknown())),
  backtest: v.optional(BacktestParametersSchema),
})

export const UpdateStrategyInputSchema = v.pipe(
  v.strictObject({
    name: v.optional(nonEmptyString),
    description: v.optional(v.string()),
    code: v.optional(nonEmptyString),
    market: v.optional(QubeMarketSchema),
    params: v.optional(v.record(v.string(), v.unknown())),
    backtest: v.optional(BacktestParametersSchema),
  }),
  v.check(
    (input) => Object.values(input).some((value) => value !== undefined),
    'Expected at least one field to update',
  ),
)

export const ListQubeResourcesInputSchema = v.strictObject({
  offset: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100))),
  market: v.optional(QubeMarketSchema),
  keyword: v.optional(v.pipe(v.string(), v.maxLength(256))),
})

export const ListBacktestsInputSchema = v.strictObject({
  offset: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100))),
  market: v.optional(QubeMarketSchema),
  keyword: v.optional(v.pipe(v.string(), v.maxLength(256))),
  strategyId: v.optional(ResourceIdSchema),
  strategyVersionId: v.optional(ResourceIdSchema),
  nullVersion: v.optional(v.boolean()),
})

const QubeRecordSchema = v.looseObject({})
const optionalRecord = v.optional(v.nullable(QubeRecordSchema))

export const StrategyVersionSchema = v.looseObject({
  id: ResourceIdSchema,
  strategy_id: ResourceIdSchema,
  version_number: positiveInteger,
  code: v.string(),
  label: v.optional(v.nullable(v.string())),
  starred: v.optional(v.boolean()),
  origin: v.optional(v.string()),
  params: optionalRecord,
})

export const FactorVersionSchema = v.looseObject({
  id: ResourceIdSchema,
  factor_id: ResourceIdSchema,
  version_number: positiveInteger,
  code: v.string(),
  code_type: FactorCodeTypeSchema,
  market: v.optional(v.string()),
  label: v.optional(v.nullable(v.string())),
  starred: v.optional(v.boolean()),
  params: optionalRecord,
})

export const FactorSchema = v.looseObject({
  id: ResourceIdSchema,
  name: v.optional(v.string()),
  description: v.optional(v.nullable(v.string())),
  code: v.optional(v.string()),
  code_type: v.optional(FactorCodeTypeSchema),
  market: v.optional(QubeMarketSchema),
  latest_version: v.optional(v.nullable(FactorVersionSchema)),
})

export const StrategySchema = v.looseObject({
  id: ResourceIdSchema,
  name: v.optional(v.string()),
  description: v.optional(v.nullable(v.string())),
  code: v.optional(v.string()),
  market: v.optional(QubeMarketSchema),
  params: optionalRecord,
})

export const FactorAnalysisSchema = v.looseObject({
  id: ResourceIdSchema,
  status: v.optional(v.string()),
  progress: optionalRecord,
  cancelled: v.optional(v.boolean()),
})

export const BacktestSchema = v.looseObject({
  id: ResourceIdSchema,
  status: v.optional(v.string()),
  progress: optionalRecord,
  cancelled: v.optional(v.boolean()),
  strategy_id: v.optional(ResourceIdSchema),
})

export const BacktestCancelResultSchema = v.looseObject({
  cancelled: v.boolean(),
  run_id: v.optional(ResourceIdSchema),
  status: v.optional(v.string()),
  reason: v.optional(v.string()),
})

export const StrategySaveInputSchema = v.strictObject({
  code: nonEmptyString,
  baseVersionId: v.optional(ResourceIdSchema),
  confirmRebase: v.optional(v.boolean()),
  name: v.optional(nonEmptyString),
  description: v.optional(v.string()),
  backtest: v.optional(BacktestParametersSchema),
})

export const StrategySaveSchema = v.looseObject({
  strategy: StrategySchema,
  version: StrategyVersionSchema,
  version_created: v.boolean(),
})

export const FactorSaveInputSchema = v.strictObject({
  code: nonEmptyString,
  codeType: FactorCodeTypeSchema,
  market: v.optional(QubeMarketSchema),
  analysisParams: FactorAnalysisParamsInputSchema,
  name: v.optional(nonEmptyString),
  description: v.optional(v.string()),
  baseVersionId: v.optional(ResourceIdSchema),
  sourceSessionId: v.optional(ResourceIdSchema),
  confirmRebase: v.optional(v.boolean()),
})

export const FactorSaveSchema = v.looseObject({
  id: ResourceIdSchema,
  version: FactorVersionSchema,
  version_created: v.boolean(),
})

export const StrategyBacktestParamsSchema = v.pipe(
  v.looseObject({
    source: v.picklist(['saved', 'latest_run', 'default']),
    params: QubeRecordSchema,
  }),
  v.transform((value) => ({ source: value.source, params: getBacktestParameters(value.params) })),
)

export const VersionPatchInputSchema = v.pipe(
  v.strictObject({
    label: v.optional(v.nullable(v.string())),
    starred: v.optional(v.boolean()),
  }),
  v.check(
    (input) => Object.values(input).some((value) => value !== undefined),
    'Expected at least one field to update',
  ),
)

export const QubePageResponseSchema = v.union([
  v.array(QubeRecordSchema),
  v.looseObject({
    items: v.optional(v.array(QubeRecordSchema)),
    has_more: v.optional(v.boolean()),
    next_offset: v.optional(v.nullable(v.number())),
  }),
])

export const BacktestVersionPageResponseSchema = v.looseObject({
  items: v.optional(v.array(QubeRecordSchema)),
  has_more: v.optional(v.boolean()),
  next_offset: v.optional(v.nullable(v.number())),
  total: v.optional(v.number()),
})

export interface QubePage<T> {
  items: T[]
  hasMore: boolean
  nextOffset: number | null
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
export type CreateFactorInput = v.InferInput<typeof CreateFactorInputSchema>
export type UpdateFactorInput = v.InferInput<typeof UpdateFactorInputSchema>
export type FactorAnalysisInput = v.InferInput<typeof FactorAnalysisInputSchema>
export type FactorStrategyInput = v.InferInput<typeof FactorStrategyInputSchema>
export type FactorStrategyResponse = v.InferOutput<typeof FactorStrategyResponseSchema>
export type FactorStrategyBacktestResponse = v.InferOutput<
  typeof FactorStrategyBacktestResponseSchema
>
export type CreateStrategyInput = v.InferInput<typeof CreateStrategyInputSchema>
export type UpdateStrategyInput = v.InferInput<typeof UpdateStrategyInputSchema>
export type ListQubeResourcesInput = v.InferInput<typeof ListQubeResourcesInputSchema>
export type ListBacktestsInput = v.InferInput<typeof ListBacktestsInputSchema>
export type Factor = v.InferOutput<typeof FactorSchema>
export type Strategy = v.InferOutput<typeof StrategySchema>
export type FactorAnalysis = v.InferOutput<typeof FactorAnalysisSchema>
export type Backtest = v.InferOutput<typeof BacktestSchema>
export type BacktestCancelResult = v.InferOutput<typeof BacktestCancelResultSchema>
export type StrategyVersion = v.InferOutput<typeof StrategyVersionSchema>
export type FactorVersion = v.InferOutput<typeof FactorVersionSchema>
export type StrategySaveInput = v.InferInput<typeof StrategySaveInputSchema>
export type StrategySave = v.InferOutput<typeof StrategySaveSchema>
export type FactorSaveInput = v.InferInput<typeof FactorSaveInputSchema>
export type FactorSave = v.InferOutput<typeof FactorSaveSchema>
export type StrategyBacktestParams = v.InferOutput<typeof StrategyBacktestParamsSchema>
export type VersionPatchInput = v.InferInput<typeof VersionPatchInputSchema>

export function getBacktestParameters(value: unknown): BacktestParameters {
  if (!isRecord(value)) return {}
  const standardSymbol =
    value.standard_symbol === '上证指数' ||
    value.standard_symbol === '沪深300' ||
    value.standard_symbol === '中证500' ||
    value.standard_symbol === '中证1000'
      ? value.standard_symbol
      : undefined
  const result = v.safeParse(BacktestParametersSchema, {
    periodStart: value.period_start ?? undefined,
    periodEnd: value.period_end ?? undefined,
    initBalance: value.init_balance ?? undefined,
    commissionRate: value.commission_rate ?? undefined,
    slippage: value.slippage ?? undefined,
    frequency: value.frequency ?? undefined,
    symbols: value.symbols ?? undefined,
    standardSymbol,
    marginRate: value.margin_rate ?? undefined,
    matchingType: value.matching_type ?? undefined,
  })
  return result.success ? result.output : {}
}

export function getFactorAnalysisParams(value: unknown): FactorAnalysisParamsInput {
  if (!isRecord(value)) return {}
  const result = v.safeParse(FactorAnalysisParamsInputSchema, {
    periodStart: value.period_start ?? undefined,
    periodEnd: value.period_end ?? undefined,
    adjustmentCycle: value.adjustment_cycle ?? undefined,
    groupNumber: value.group_number ?? undefined,
    factorDirection: value.factor_direction ?? undefined,
    stockPool: value.stock_pool ?? undefined,
    marketType: value.market_type ?? undefined,
  })
  return result.success ? result.output : {}
}

export function parseResearchInput<
  TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(schema: TSchema, input: unknown): v.InferOutput<TSchema> {
  const result = v.safeParse(schema, input)
  if (!result.success) throw new TqxValidationError('Invalid SDK input', result.issues)
  return result.output
}
