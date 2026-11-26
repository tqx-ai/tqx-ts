import * as v from 'valibot'

import { date, revision } from '../../utils/research-values'
import { ResearchError } from '../errors'
import { runOutput, chartOutput, resultOutput } from '../schemas'
import { chartSchema, reportSchema, resultSchema, summarySchema } from './contract'
import type { Summary, ChartData, ResultPage } from './contract'

export function validate<T extends v.GenericSchema>(schema: T, value: unknown): v.InferOutput<T> {
  const parsed = v.safeParse(schema, value)
  if (!parsed.success) throw new ResearchError('INVALID_RESPONSE', 'Invalid backtest report data')
  return parsed.output
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
function number(value: unknown): number | null {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)
        ? Number(value)
        : NaN
  return Number.isFinite(n) ? n : null
}
const string = (value: unknown, max = 200) =>
  typeof value === 'string' && value.length <= max ? value : null
const validDate = (value: unknown) => (v.safeParse(date, value).success ? value : null)
const validRevision = (value: unknown) => (v.safeParse(revision, value).success ? value : null)

export function projectRun(
  data: Record<string, unknown>,
  fetchedAt: string,
  metadata: { title?: unknown; market?: unknown } = {},
): Summary {
  const run = record(validate(runOutput('backtest'), data))
  const metrics = record(run.metrics)
  const backtest = record(record(run.parameters).backtest)
  const metric = (...keys: string[]): { value: number | null; source: string | null } => {
    for (const key of keys) {
      const value = number(metrics[key])
      if (value !== null) return { value, source: key }
    }
    return { value: null, source: null }
  }
  const initial = number(backtest.init_balance)
  const market = metadata.market === 'hk' || metadata.market === 'us' ? metadata.market : null
  const count = metric('trade_count', 'total_trades')
  if (count.value !== null && (!Number.isSafeInteger(count.value) || count.value < 0))
    count.value = null
  const progress = number(record(run.progress).percent)
  return validate(summarySchema, {
    schemaVersion: 1,
    type: 'qube',
    runId: run.id,
    strategyId: run.resourceId,
    title: string(metadata.title) || 'Backtest report',
    market,
    currency: market === 'hk' ? 'HKD' : market === 'us' ? 'USD' : null,
    status: run.status,
    terminal: run.terminal,
    progress: progress !== null && progress >= 0 && progress <= 100 ? progress : null,
    period: { from: validDate(backtest.period_start), to: validDate(backtest.period_end) },
    initialCapital: initial !== null && initial > 0 ? initial : null,
    frequency:
      backtest.frequency === '1d' || backtest.frequency === '1M' ? backtest.frequency : null,
    sourceRevision: validRevision(run.sourceRevision),
    configRevision: validRevision(run.configRevision),
    parameters: {
      commissionRate: number(backtest.commission_rate),
      slippage: number(backtest.slippage),
      standardSymbol: string(backtest.standard_symbol, 64),
      marginRate: number(backtest.margin_rate),
    },
    metrics: {
      totalReturn: metric('total_return', 'return'),
      annualReturn: metric('annual_return', 'annualized_return'),
      maxDrawdown: metric('max_drawdown', 'maximum_drawdown'),
      sharpe: metric('sharpe', 'sharpe_ratio'),
      sortino: metric('sortino', 'sortino_ratio'),
      calmar: metric('kama_ratio', 'calmar_ratio'),
      tradeCount: count,
      equity: metric(run.status === 'succeeded' ? 'final_equity' : 'current_equity'),
    },
    fetchedAt,
    warnings: [
      ...(run.status !== 'succeeded'
        ? ['This run has not succeeded. Available figures may be intermediate.']
        : []),
      ...(market === null ? ['Run market and currency are unavailable.'] : []),
      ...(initial === null || initial <= 0
        ? ['Frozen initial capital is unavailable; return view is disabled.']
        : []),
      ...(run.status === 'failed'
        ? ['Remote Research run failed; inspect the run in Qube for diagnostics.']
        : []),
    ],
    sections: { chart: { state: 'empty' } },
  })
}

export function projectChart(data: Record<string, unknown>): ChartData {
  // Validate the existing public shape first, then remove trade previews from UI data.
  const chart = validate(chartOutput, data)
  const points = [chart.points, ...(chart.benchmark ? [chart.benchmark.points] : [])]
  for (const series of points) {
    let previous = -Infinity
    for (const point of series) {
      const ts = Date.parse(point.ts)
      if (!Number.isFinite(ts) || ts < previous)
        throw new ResearchError('INVALID_RESPONSE', 'Invalid chart time order')
      previous = ts
    }
  }
  const result = validate(chartSchema, chart)
  enforceBudget(result, UI_BUDGET - 16_384)
  return result
}

const columns = {
  trades: [
    'display_ts',
    'ts',
    'timestamp',
    'datetime',
    'trade_date',
    'time',
    'date',
    'symbol',
    'code',
    'instrument',
    'symbol_code',
    'direction',
    'side',
    'action',
    'offset',
    'quantity',
    'qty',
    'volume',
    'price',
    'fill_price',
    'commission',
    'fee',
  ],
  symbol_performance: [
    'symbol',
    'code',
    'instrument',
    'symbol_code',
    'name',
    'symbol_name',
    'instrument_name',
    'direction',
    'trade_count',
    'net_pnl',
    'final_pnl',
    'total_pnl',
    'pnl',
  ],
  account_summary: ['market_value', 'margin', 'total_fee'],
} as const
const numericColumns = new Set([
  'quantity',
  'qty',
  'volume',
  'price',
  'fill_price',
  'commission',
  'fee',
  'trade_count',
  'net_pnl',
  'final_pnl',
  'total_pnl',
  'pnl',
  'market_value',
  'margin',
  'total_fee',
])

export function projectResult(
  data: Record<string, unknown>,
  input: { runId: string; field: keyof typeof columns; offset: number; limit: number },
): ResultPage {
  const page = validate(resultOutput(false), data)
  const sourceRows = page.rows as unknown[]
  if (
    page.runId !== input.runId ||
    page.field !== input.field ||
    page.offset !== input.offset ||
    page.limit !== input.limit ||
    sourceRows.length > input.limit ||
    (page.hasMore &&
      (sourceRows.length === 0 || page.nextOffset !== page.offset + sourceRows.length))
  )
    throw new ResearchError('INVALID_RESPONSE', 'Invalid backtest result page')
  const rows = sourceRows.map((item) => {
    const row = record(item)
    return Object.fromEntries(
      columns[input.field]
        .filter((key) => key in row)
        .map((key) => {
          const value = row[key]
          if (value !== null && typeof value !== 'string' && typeof value !== 'number')
            throw new ResearchError('INVALID_RESPONSE', 'Invalid backtest result cell')
          if (value !== null && numericColumns.has(key) && number(value) === null)
            throw new ResearchError('INVALID_RESPONSE', 'Invalid numeric backtest result cell')
          return [key, value]
        }),
    )
  })
  return validate(resultSchema, { ...page, rows })
}

export const UI_BUDGET = 524_288
export function enforceBudget(value: unknown, limit: number) {
  if (new TextEncoder().encode(JSON.stringify(value)).length > limit)
    throw new ResearchError(
      'RESULT_TOO_LARGE',
      'Backtest report exceeds the output limit; reduce the page or range',
    )
}

export function report(
  summary: Summary,
  chart: ChartData | null,
  error?: { code: string; message: string },
) {
  if (error) {
    summary.sections.chart = { state: 'error', ...error }
    summary.warnings.push(
      'Chart unavailable. Metrics remain available; refresh or narrow the range.',
    )
  } else if (chart) {
    summary.sections.chart = { state: chart.points.length ? 'ready' : 'empty' }
    if (chart.sampled)
      summary.warnings.push('Curve is sampled; inspection snaps to returned samples.')
    if (chart.partial || chart.complete !== true)
      summary.warnings.push('Chart completeness is not confirmed; available data may be partial.')
  }
  enforceBudget(summary, 16_384)
  const result = validate(reportSchema, {
    schemaVersion: 1,
    type: 'qube',
    runId: summary.runId,
    operation: 'overview',
    summary,
    chart,
  })
  enforceBudget(result, UI_BUDGET)
  return result
}
