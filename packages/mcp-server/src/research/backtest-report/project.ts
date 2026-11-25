import * as v from 'valibot'

import { date, revision } from '../../utils/research-values'
import { ResearchError } from '../errors'
import { object } from '../gateway'
import * as p from '../projections'
import { runOutput, chartOutput, resultOutput } from '../schemas'
import { chartSchema, reportSchema, resultSchema, summarySchema } from './contract'
import type { Summary, ChartData, ResultPage } from './contract'

export function validate<T extends v.GenericSchema>(schema: T, value: unknown): v.InferOutput<T> {
  const parsed = v.safeParse(schema, value)
  if (!parsed.success) throw new ResearchError('INVALID_RESPONSE', 'Invalid backtest report data')
  return parsed.output
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? object(value) : {}
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

export function projectRun(raw: Record<string, unknown>, fetchedAt: string): Summary {
  const run = record(validate(runOutput('backtest'), p.run(raw, 'strategy')))
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
  const market = raw.market === 'hk' || raw.market === 'us' ? raw.market : null
  const count = metric('trade_count', 'total_trades')
  if (count.value !== null && (!Number.isSafeInteger(count.value) || count.value < 0))
    count.value = null
  const progress = number(record(run.progress).percent)
  return validate(summarySchema, {
    schemaVersion: 1,
    type: 'qube',
    runId: run.id,
    strategyId: run.resourceId,
    title: string(raw.title) || 'Backtest report',
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

export function projectChart(raw: Record<string, unknown>): ChartData {
  // Validate the existing public shape first, then remove trade previews from UI data.
  const chart = validate(chartOutput, p.chart(raw))
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
  return validate(chartSchema, chart)
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
  raw: Record<string, unknown>,
  input: { runId: string; field: keyof typeof columns; offset: number; limit: number },
): ResultPage {
  const page = validate(resultOutput(false), p.backtestResults(raw, input))
  const rows = (page.rows as unknown[]).map((item) => {
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

export function report(summary: Summary, chart: ChartData | null) {
  return validate(reportSchema, {
    schemaVersion: 1,
    type: 'qube',
    runId: summary.runId,
    operation: 'overview',
    summary,
    chart,
  })
}
