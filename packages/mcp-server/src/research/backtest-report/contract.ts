import * as v from 'valibot'

import { id, integer, finite, status, revision, time, date } from '../../utils/research-values'

export const REPORT_META = 'tqx.trade/backtest-view'
const text = (max = 200) => v.pipe(v.string(), v.maxLength(max))
const nullableNumber = v.nullable(finite)
const identity = { schemaVersion: v.literal(1), type: v.literal('qube'), runId: id }
export const viewInput = v.strictObject({ type: v.literal('qube'), runId: id })
const bound = (max: number, min = 1) => v.pipe(integer, v.minValue(min), v.maxValue(max))
// Internal component/adapter contract, not a separate MCP tool input.
export const queryInput = v.variant('operation', [
  v.strictObject({ ...viewInput.entries, operation: v.literal('overview') }),
  v.pipe(
    v.strictObject({
      ...viewInput.entries,
      operation: v.literal('chart'),
      from: v.optional(time),
      to: v.optional(time),
      maxPoints: v.optional(bound(5000, 2), 1200),
    }),
    v.check(
      (s) => !s.from || !s.to || Date.parse(s.from) <= Date.parse(s.to),
      'Invalid chart range',
    ),
  ),
  v.pipe(
    v.strictObject({
      ...viewInput.entries,
      operation: v.literal('result'),
      field: v.picklist(['trades', 'symbol_performance', 'account_summary']),
      offset: v.optional(integer, 0),
      limit: v.optional(bound(100), 20),
      keyword: v.optional(text()),
      symbol: v.optional(v.pipe(text(64), v.minLength(1))),
    }),
    v.check(
      (s) => s.symbol === undefined || s.field === 'trades',
      'symbol is only supported for trades',
    ),
  ),
])
const metric = v.object({ value: nullableNumber, source: v.nullable(text(80)) })
export const metricKeys = [
  'totalReturn',
  'annualReturn',
  'maxDrawdown',
  'sharpe',
  'sortino',
  'calmar',
  'tradeCount',
  'equity',
] as const
const metrics = v.object({
  totalReturn: metric,
  annualReturn: metric,
  maxDrawdown: metric,
  sharpe: metric,
  sortino: metric,
  calmar: metric,
  tradeCount: metric,
  equity: metric,
})
const section = v.object({
  state: v.picklist(['ready', 'empty', 'error']),
  code: v.optional(text(128)),
  message: v.optional(text(300)),
})
export const summarySchema = v.object({
  ...identity,
  strategyId: id,
  title: text(),
  market: v.nullable(v.picklist(['hk', 'us'])),
  currency: v.nullable(v.picklist(['HKD', 'USD'])),
  status,
  terminal: v.boolean(),
  progress: v.nullable(v.pipe(finite, v.minValue(0), v.maxValue(100))),
  period: v.object({ from: v.nullable(date), to: v.nullable(date) }),
  initialCapital: v.nullable(v.pipe(finite, v.minValue(Number.MIN_VALUE))),
  frequency: v.nullable(v.picklist(['1d', '1M'])),
  sourceRevision: v.nullable(revision),
  configRevision: v.nullable(revision),
  parameters: v.object({
    commissionRate: nullableNumber,
    slippage: nullableNumber,
    standardSymbol: v.nullable(text(64)),
    marginRate: nullableNumber,
  }),
  metrics,
  fetchedAt: time,
  warnings: v.pipe(v.array(text(300)), v.maxLength(20)),
  sections: v.object({ chart: section }),
})
const range = v.object({ from: v.nullable(time), to: v.nullable(time) })
const point = v.object({ ts: time, equity: nullableNumber, breakBefore: v.optional(v.boolean()) })
export const chartSchema = v.object({
  range,
  extent: range,
  points: v.pipe(v.array(point), v.maxLength(5000)),
  sourceCount: integer,
  totalCount: integer,
  sampled: v.boolean(),
  partial: v.optional(v.boolean()),
  complete: v.optional(v.nullable(v.boolean())),
  tradeDays: v.array(
    v.object({
      day: date,
      ts: time,
      equity: nullableNumber,
      buyCount: integer,
      sellCount: integer,
      total: integer,
    }),
  ),
  dateAnchors: v.optional(v.array(v.object({ day: date, from: time, to: time }))),
  benchmark: v.optional(
    v.object({ standardSymbol: text(64), points: v.pipe(v.array(point), v.maxLength(5000)) }),
  ),
})
const cell = v.union([text(300), finite, v.null()])
export const resultSchema = v.object({
  field: v.picklist(['trades', 'symbol_performance', 'account_summary']),
  rows: v.pipe(v.array(v.record(text(64), cell)), v.maxLength(100)),
  total: integer,
  offset: integer,
  limit: bound(100),
  hasMore: v.boolean(),
  nextOffset: v.optional(integer),
  partial: v.optional(v.boolean()),
  availableFrom: v.optional(integer),
  availableTotal: v.optional(integer),
})
export const reportSchema = v.object({
  ...identity,
  operation: v.literal('overview'),
  summary: summarySchema,
  chart: v.nullable(chartSchema),
})
export const queryResultSchema = v.variant('operation', [
  reportSchema,
  v.object({ ...identity, operation: v.literal('chart'), chart: chartSchema }),
  v.object({ ...identity, operation: v.literal('result'), result: resultSchema }),
])

export type Identity = v.InferOutput<typeof viewInput>
export type Summary = v.InferOutput<typeof summarySchema>
export type ChartData = v.InferOutput<typeof chartSchema>
export type ResultPage = v.InferOutput<typeof resultSchema>
export type Report = v.InferOutput<typeof reportSchema>
export type Query = v.InferOutput<typeof queryInput>
export type QueryResult = v.InferOutput<typeof queryResultSchema>
