import * as v from 'valibot'

import { reportSchema } from '../../../../research/backtest-report/contract'
import type { Report, ChartData } from '../../../../research/backtest-report/contract'

export const scenarios = [
  'hk-loss',
  'hk-profit',
  'us-profit',
  'no-benchmark',
  'no-trades',
  'empty',
  'single',
  'gaps',
  'missing',
  'partial',
  'long-sampled',
  'queued',
  'preparing',
  'running',
  'failed',
  'cancelled',
  'chart-error',
] as const
export type Scenario = (typeof scenarios)[number]
export const fixtureRun = '89abcdef0123456789abcdef'

// Deterministic synthetic development data. Never imported by the production entry.
const metric = (value: number | null, source: string) => ({
  value,
  source: value === null ? null : source,
})
const wave = (i: number) => Math.sin(i * 0.23) * 0.011 + Math.sin(i * 0.071) * 0.018
export function fixture(scenario: Scenario): Report {
  const us = scenario === 'us-profit'
  const initial = us ? 100_000 : 10_000_000
  const finalReturn = us || scenario === 'hk-profit' ? 0.219 : -0.0506
  const points = Array.from({ length: 180 }, (_, i) => ({
    ts: new Date(Date.UTC(2025, 0, 2 + i)).toISOString().slice(0, 10),
    equity: initial * (1 + (finalReturn * i) / 179 + wave(i) - (wave(179) * i) / 179),
  }))
  const chart: ChartData = {
    points,
    range: { from: points[0]!.ts, to: points.at(-1)!.ts },
    extent: { from: points[0]!.ts, to: points.at(-1)!.ts },
    sourceCount: 180,
    totalCount: 180,
    sampled: false,
    complete: true,
    partial: false,
    tradeDays: points
      .filter((_, i) => i % 13 === 0)
      .map((point, i) => ({
        day: point.ts,
        ts: point.ts,
        equity: point.equity,
        buyCount: i % 2 ? 0 : 1,
        sellCount: i % 2 ? 1 : 0,
        total: 1,
      })),
    dateAnchors: points.map((point) => ({ day: point.ts, from: point.ts, to: point.ts })),
    benchmark: {
      standardSymbol: us ? 'SPY.US' : 'HSI.HK',
      points: points.map((point, i) => ({
        ts: point.ts,
        equity: initial * (1 + 0.00015 * i + Math.sin(i * 0.09) * 0.012),
      })),
    },
  }
  const status =
    scenario === 'running' ||
    scenario === 'queued' ||
    scenario === 'preparing' ||
    scenario === 'failed' ||
    scenario === 'cancelled'
      ? scenario
      : 'succeeded'
  const data: Report = {
    schemaVersion: 1,
    type: 'qube',
    runId: fixtureRun,
    operation: 'overview',
    chart,
    summary: {
      schemaVersion: 1,
      type: 'qube',
      runId: fixtureRun,
      strategyId: '0123456789abcdef01234567',
      title: us ? 'Momentum rotation' : 'Adaptive momentum',
      market: us ? 'us' : 'hk',
      currency: us ? 'USD' : 'HKD',
      status,
      terminal: ['succeeded', 'failed', 'cancelled'].includes(status),
      progress: status === 'running' ? 63 : status === 'queued' || status === 'preparing' ? 0 : 100,
      period: { from: chart.extent.from, to: chart.extent.to },
      initialCapital: initial,
      frequency: '1d',
      sourceRevision: 3,
      configRevision: 2,
      parameters: {
        commissionRate: 0.0003,
        slippage: 0.001,
        standardSymbol: chart.benchmark!.standardSymbol,
        marginRate: 1,
      },
      metrics: {
        totalReturn: metric(finalReturn, 'total_return'),
        annualReturn: metric(finalReturn > 0 ? 0.32 : -0.089, 'annual_return'),
        maxDrawdown: metric(0.0842, 'max_drawdown'),
        sharpe: metric(us ? 1.42 : -0.68, 'sharpe_ratio'),
        sortino: metric(us ? 1.83 : -0.76, 'sortino_ratio'),
        calmar: metric(us ? 3.8 : -1.06, 'calmar_ratio'),
        tradeCount: metric(14, 'trade_count'),
        equity: metric(
          points.at(-1)!.equity,
          status === 'succeeded' ? 'final_equity' : 'current_equity',
        ),
      },
      fetchedAt: '2026-11-25T04:00:00Z',
      warnings: [],
      sections: { chart: { state: 'ready' } },
    },
  }
  if (scenario === 'no-benchmark') delete chart.benchmark
  if (scenario === 'no-trades') {
    chart.tradeDays = []
    data.summary.metrics.tradeCount = metric(0, 'trade_count')
  }
  if (scenario === 'long-sampled') {
    chart.sourceCount = chart.totalCount = 20_000
    chart.sampled = true
    data.summary.warnings = ['Curve is sampled; inspection snaps to returned samples.']
  }
  if (scenario === 'empty') {
    chart.points = []
    chart.tradeDays = []
    chart.sourceCount = chart.totalCount = 0
    delete chart.benchmark
    data.summary.sections.chart.state = 'empty'
  }
  if (scenario === 'single') {
    chart.points = [points[0]!]
    chart.tradeDays = []
    delete chart.benchmark
    chart.sourceCount = chart.totalCount = 1
  }
  if (scenario === 'gaps') {
    chart.points = points.map((p, i) => ({
      ts: p.ts,
      equity: i > 50 && i < 65 ? null : p.equity,
      breakBefore: i === 110,
    }))
  }
  if (scenario === 'missing') {
    delete chart.benchmark
    data.summary.initialCapital = null
    data.summary.market = data.summary.currency = null
    for (const key of Object.keys(data.summary.metrics) as Array<keyof typeof data.summary.metrics>)
      data.summary.metrics[key] = { value: null, source: null }
    data.summary.warnings = [
      'Metrics, currency and frozen initial capital are unavailable. Return view is disabled.',
    ]
  }
  if (scenario === 'partial' || status !== 'succeeded') {
    chart.complete = false
    chart.partial = true
    chart.sampled = true
    chart.totalCount = 1200
    data.summary.warnings = [
      status === 'succeeded'
        ? 'Chart is partial and sampled.'
        : 'This run has not succeeded. Available figures may be intermediate.',
    ]
  }
  if (scenario === 'chart-error') {
    data.chart = null
    data.summary.sections.chart = {
      state: 'error',
      code: 'LIVE_RESULT_UNAVAILABLE',
      message: 'Chart is temporarily unavailable. Retry this run.',
    }
  }
  return v.parse(reportSchema, data)
}
