import * as v from 'valibot'

import {
  queryInput,
  queryResultSchema,
  reportSchema,
} from '../../../../research/backtest-report/contract'
import type { Query, QueryResult, Report } from '../../../../research/backtest-report/contract'
import { backtestRunInput, chartInput, resultInput } from '../../../../research/schemas'
import type { ResearchCall } from './research'

// Development-only conversion into the same public outputs as tqx_research_call.
export function fixtureResearch(recording: Report, syntheticResults = false): ResearchCall {
  const query = fixtureQuery(recording, syntheticResults)
  return async (action, input) => {
    let data: Record<string, unknown>
    if (action === 'strategy.backtest.get') {
      const { runId } = v.parse(backtestRunInput, input)
      const overview = query({ type: 'qube', runId, operation: 'overview' })
      if (overview.operation !== 'overview') throw new Error('Expected fixture overview')
      const s = overview.summary
      data = {
        kind: 'backtest',
        id: s.runId,
        resourceId: s.strategyId,
        status: s.status,
        terminal: s.terminal,
        progress: s.progress === null ? undefined : { percent: s.progress },
        sourceRevision: s.sourceRevision ?? undefined,
        configRevision: s.configRevision ?? undefined,
        metrics: Object.fromEntries(
          Object.values(s.metrics)
            .filter((m) => m.source !== null && m.value !== null)
            .map((m) => [m.source!, m.value]),
        ),
        parameters: {
          backtest: {
            init_balance: s.initialCapital,
            period_start: s.period.from,
            period_end: s.period.to,
            frequency: s.frequency,
            commission_rate: s.parameters.commissionRate,
            slippage: s.parameters.slippage,
            standard_symbol: s.parameters.standardSymbol,
            margin_rate: s.parameters.marginRate,
          },
        },
      }
    } else if (action === 'backtest.chart.get') {
      const args = v.parse(chartInput, input)
      const result = query({ type: 'qube', operation: 'chart', ...args })
      if (result.operation !== 'chart') throw new Error('Expected fixture chart')
      data = {
        ...result.chart,
        runId: result.runId,
        tradeDays: result.chart.tradeDays.map((day) =>
          Object.assign({}, day, { counts: {}, trades: [] }),
        ),
      }
    } else if (action === 'backtest.result.get') {
      const args = v.parse(resultInput, input)
      const result = query(v.parse(queryInput, { type: 'qube', operation: 'result', ...args }))
      if (result.operation !== 'result') throw new Error('Expected fixture result')
      data = { ...result.result, runId: result.runId }
    } else throw new Error('Unsupported fixture action')
    return { structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }] }
  }
}

export function fixtureQuery(recording: Report, syntheticResults = false) {
  const report = v.parse(reportSchema, recording)
  return (input: Query): QueryResult => {
    const query = v.parse(queryInput, input)
    if (query.type !== report.type || query.runId !== report.runId)
      throw new Error('Fixture run identity mismatch')
    const identity = { schemaVersion: 1 as const, type: report.type, runId: report.runId }
    if (query.operation === 'overview') return structuredClone(report)
    if (query.operation === 'chart') {
      if (!report.chart) throw new Error('Fixture chart unavailable')
      const chart = structuredClone(report.chart)
      if (
        !syntheticResults &&
        (query.from || query.to) &&
        (chart.sampled || chart.sourceCount > chart.points.length)
      )
        throw new Error('No recorded chart window. Sampled overview replay cannot infer it.')
      const filter = <T extends { ts: string }>(points: T[]) =>
        points.filter(
          (point) =>
            (!query.from || Date.parse(point.ts) >= Date.parse(query.from)) &&
            (!query.to || Date.parse(point.ts) <= Date.parse(query.to)),
        )
      const points = filter(chart.points),
        count = points.length
      const sample = <T extends { equity: number | null; breakBefore?: boolean }>(values: T[]) => {
        if (values.length <= query.maxPoints) return values
        let previous = -1
        return Array.from({ length: query.maxPoints }, (_, i) => {
          const index = Math.round((i * (values.length - 1)) / (query.maxPoints - 1))
          const point = values[index]!
          const broken = values
            .slice(previous + 1, index + 1)
            .some((value) => value.equity === null || value.breakBefore)
          previous = index
          return broken ? { ...point, breakBefore: true } : point
        })
      }
      chart.points = sample(points)
      if (query.from || query.to) chart.sourceCount = count
      chart.sampled ||= count > chart.points.length
      chart.range = { from: query.from ?? chart.range.from, to: query.to ?? chart.range.to }
      chart.tradeDays = filter(chart.tradeDays)
      if (chart.benchmark) chart.benchmark.points = sample(filter(chart.benchmark.points))
      return v.parse(queryResultSchema, { ...identity, operation: 'chart', chart })
    }
    if (!syntheticResults)
      throw new Error('No recorded result page. Overview replay does not synthesize trades.')
    const trades = Array.from(
      { length: report.summary.metrics.tradeCount.value ?? 14 },
      (_, i) => ({
        ts: new Date(Date.UTC(2025, 0, 2 + i * 13)).toISOString(),
        symbol: report.summary.market === 'us' ? 'AAPL.US' : '00700.HK',
        side: i % 2 ? 'SELL' : 'BUY',
        quantity: 100,
        price: String(400 + i * 3.25),
        commission: '12.50',
      }),
    )
    const records =
      query.field === 'trades'
        ? trades
        : query.field === 'symbol_performance'
          ? trades.length
            ? [
                {
                  symbol: trades[0]!.symbol,
                  name: 'Synthetic instrument',
                  trade_count: 14,
                  net_pnl: '-506000.00',
                },
              ]
            : []
          : [{ market_value: '9494000.00', margin: 0, total_fee: '175.00' }]
    const filtered = records.filter(
      (row) =>
        (!query.keyword ||
          JSON.stringify(row).toLowerCase().includes(query.keyword.toLowerCase())) &&
        (!query.symbol || ('symbol' in row && row.symbol === query.symbol)),
    )
    const rows = filtered.slice(query.offset, query.offset + query.limit),
      hasMore = query.offset + rows.length < filtered.length
    return v.parse(queryResultSchema, {
      ...identity,
      operation: 'result',
      result: {
        field: query.field,
        rows,
        total: filtered.length,
        offset: query.offset,
        limit: query.limit,
        hasMore,
        ...(hasMore ? { nextOffset: query.offset + rows.length } : {}),
        partial: report.chart?.partial ?? false,
      },
    })
  }
}
