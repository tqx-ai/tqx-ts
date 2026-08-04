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
  v.picklist(['hk', 'us']),
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
})

export const CreateFactorInputSchema = v.strictObject({
  name: nonEmptyString,
  description: v.optional(v.string()),
  code: nonEmptyString,
  codeType: FactorCodeTypeSchema,
  market: QubeMarketSchema,
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
  name: v.optional(nonEmptyString),
  periodStart: v.optional(dateString),
  periodEnd: v.optional(dateString),
  adjustmentCycle: v.optional(positiveInteger),
  groupNumber: v.optional(v.pipe(v.number(), v.integer(), v.minValue(2), v.maxValue(20))),
  factorDirection: v.optional(v.picklist([0, 1])),
})

export const CreateStrategyInputSchema = v.strictObject({
  name: nonEmptyString,
  description: v.optional(v.string()),
  code: nonEmptyString,
  market: QubeMarketSchema,
  backtest: v.optional(BacktestParametersSchema),
})

export const UpdateStrategyInputSchema = v.pipe(
  v.strictObject({
    name: v.optional(nonEmptyString),
    description: v.optional(v.string()),
    code: v.optional(nonEmptyString),
    market: v.optional(QubeMarketSchema),
    versionSummary: v.optional(v.string()),
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

const QubeRecordSchema = v.looseObject({})
const optionalRecord = v.optional(v.nullable(QubeRecordSchema))

export const FactorSchema = v.looseObject({
  id: ResourceIdSchema,
  name: v.optional(v.string()),
  description: v.optional(v.nullable(v.string())),
  code: v.optional(v.string()),
  code_type: v.optional(FactorCodeTypeSchema),
  market: v.optional(QubeMarketSchema),
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

export const QubePageResponseSchema = v.union([
  v.array(QubeRecordSchema),
  v.looseObject({
    items: v.optional(v.array(QubeRecordSchema)),
    has_more: v.optional(v.boolean()),
    next_offset: v.optional(v.nullable(v.number())),
  }),
])

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
export type CreateFactorInput = v.InferInput<typeof CreateFactorInputSchema>
export type UpdateFactorInput = v.InferInput<typeof UpdateFactorInputSchema>
export type FactorAnalysisInput = v.InferInput<typeof FactorAnalysisInputSchema>
export type CreateStrategyInput = v.InferInput<typeof CreateStrategyInputSchema>
export type UpdateStrategyInput = v.InferInput<typeof UpdateStrategyInputSchema>
export type ListQubeResourcesInput = v.InferInput<typeof ListQubeResourcesInputSchema>
export type Factor = v.InferOutput<typeof FactorSchema>
export type Strategy = v.InferOutput<typeof StrategySchema>
export type FactorAnalysis = v.InferOutput<typeof FactorAnalysisSchema>
export type Backtest = v.InferOutput<typeof BacktestSchema>

export function getBacktestParameters(value: unknown): BacktestParameters {
  if (!isRecord(value)) return {}
  const result = v.safeParse(BacktestParametersSchema, {
    periodStart: value.period_start,
    periodEnd: value.period_end,
    initBalance: value.init_balance,
    commissionRate: value.commission_rate,
    slippage: value.slippage,
    frequency: value.frequency,
    symbols: value.symbols,
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
