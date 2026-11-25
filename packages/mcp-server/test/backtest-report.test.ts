import * as v from 'valibot'
import { describe, expect, it } from 'vitest'

import { loadReport, loadQuery, enforceBudget } from '../src/research/backtest-report/load'
import { projectRun, projectChart, projectResult } from '../src/research/backtest-report/project'
import { queryInput, viewInput } from '../src/research/backtest-report/contract'
import { nearestSample, pointValue } from '../src/ui/qube/backtest/chart'
import { fixture, scenarios } from '../src/ui/qube/backtest/dev/fixtures'
import { fixtureQuery } from '../src/ui/qube/backtest/adapters/fixture'
import { chart, envelope, ID, RUN, researchAuth, run, setupResearch } from './helpers/research'

const fetchedAt = '2026-11-25T04:00:00Z'
const frozenRun = () => ({
  ...run('strategy'),
  market: 'hk',
  title: 'Frozen title',
  parameters: {
    backtest: {
      init_balance: 1000,
      period_start: '2026-01-01',
      period_end: '2026-01-31',
      frequency: '1d',
      standard_symbol: 'HSI',
    },
  },
})

describe('backtest report data boundaries', () => {
  it.each([
    {},
    { runId: RUN },
    { type: 'other', runId: RUN },
    { type: 1, runId: RUN },
    { type: 'qube', runId: '../secret' },
    { type: 'qube', runId: RUN, url: 'https://example.test' },
  ])('rejects unsupported view inputs %j', (input) => {
    expect(v.safeParse(viewInput, input).success).toBe(false)
  })
  it.each([
    { operation: 'chart', maxPoints: 5001 },
    { operation: 'chart', from: '2026-03-01', to: '2026-01-01' },
    { operation: 'result', field: 'code' },
    { operation: 'result', field: 'trades', offset: -1 },
    { operation: 'result', field: 'trades', limit: 101 },
    { operation: 'result', field: 'account_summary', symbol: 'AAPL.US' },
  ])('bounds App queries %j', (input) => {
    expect(v.safeParse(queryInput, { type: 'qube', runId: RUN, ...input }).success).toBe(false)
  })
  it('keeps engine values, zeroes, documented aliases and frozen identity; strips unselected data', () => {
    const raw = {
      ...frozenRun(),
      metrics: {
        return: '0',
        annualized_return: '.12',
        maximum_drawdown: 0.2,
        sharpe: false,
        sharpe_ratio: '1.25',
        sortino: '',
        kama_ratio: '-0.1',
        trade_count: 0,
        final_equity: '990.12345',
        secret: 'no',
      },
    }
    const result = projectRun(raw, fetchedAt)
    expect(result).toMatchObject({
      title: 'Frozen title',
      runId: RUN,
      strategyId: ID,
      currency: 'HKD',
      initialCapital: 1000,
      metrics: {
        totalReturn: { value: 0, source: 'return' },
        sharpe: { value: 1.25, source: 'sharpe_ratio' },
        sortino: { value: null, source: null },
        tradeCount: { value: 0 },
        equity: { value: 990.12345 },
      },
    })
    expect(JSON.stringify(result)).not.toMatch(/private-source|storage_path|secret/)
    expect(result.metrics.annualReturn.value).toBe(0.12)
  })
  it('does not fabricate missing settings, metrics or run market', () => {
    const result = projectRun(
      { ...run('strategy', 'running'), metrics: { final_equity: 100, trade_count: -1 } },
      fetchedAt,
    )
    expect(result).toMatchObject({
      market: null,
      currency: null,
      initialCapital: null,
      period: { from: null, to: null },
      metrics: {
        totalReturn: { value: null },
        tradeCount: { value: null },
        equity: { value: null },
      },
    })
    expect(result.warnings).toHaveLength(3)
  })
  it('preserves null/gaps, completeness, market anchors and benchmark, dropping trade previews', () => {
    const result = projectChart({
      ...chart,
      points: [{ ts: '2026-01-01', equity: null }, ...chart.points],
      benchmark: { standard_symbol: 'HSI', points: chart.points },
    })
    expect(result.points[0]?.equity).toBeNull()
    expect(result.points[1]?.breakBefore).toBe(true)
    expect(result).toMatchObject({
      complete: false,
      sampled: true,
      benchmark: { standardSymbol: 'HSI' },
    })
    expect(result.tradeDays[0]).not.toHaveProperty('trades')
    expect(result.dateAnchors?.[0]?.day).toBe('2026-01-02')
    expect(() =>
      projectChart({ ...chart, points: [{ ts: '2026-02-01', equity: 1 }, ...chart.points] }),
    ).toThrow('time order')
  })
  it('whitelists table scalars without changing numeric strings or pagination evidence', () => {
    const input = { runId: RUN, field: 'trades' as const, offset: 0, limit: 1 }
    const raw = {
      run_id: RUN,
      field: 'trades',
      offset: 0,
      limit: 1,
      total: 40,
      has_more: true,
      partial: true,
      available_from: 4,
      available_total: 10,
      rows: [
        {
          price: '990.123456789012345',
          quantity: 0,
          symbol: 'AAPL.US',
          token: 'secret',
          code_snapshot: 'secret',
        },
      ],
    }
    const result = projectResult(raw, input)
    expect(result).toMatchObject({
      nextOffset: 1,
      partial: true,
      availableFrom: 4,
      availableTotal: 10,
      rows: [{ price: '990.123456789012345', quantity: 0 }],
    })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(() => projectResult({ ...raw, run_id: ID }, input)).toThrow()
    expect(() => projectResult({ ...raw, offset: 2 }, input)).toThrow()
  })
  it('retains metrics when the chart fails and makes no mutations', async () => {
    const runtime = setupResearch()
    runtime.fetch.mockImplementation(async (url) =>
      String(url).endsWith(`/${RUN}`)
        ? envelope(frozenRun())
        : Response.json({ code: 'LIVE_RESULT_UNAVAILABLE' }, { status: 503 }),
    )
    try {
      const report = await loadReport(
        { auth: researchAuth(), gateway: runtime.gateway, now: () => Date.parse(fetchedAt) },
        { type: 'qube', runId: RUN },
      )
      expect(report.chart).toBeNull()
      expect(report.summary).toMatchObject({
        status: 'succeeded',
        metrics: { sharpe: { value: 1.2 } },
        sections: { chart: { state: 'error' } },
      })
      expect(runtime.fetch).toHaveBeenCalledTimes(2)
      for (const [, init] of runtime.fetch.mock.calls) expect(init?.method).toBe('GET')
    } finally {
      runtime.dispose()
    }
  })
  it('requires read scope before exchange, including queries, and rejects mismatched runs', async () => {
    const runtime = setupResearch()
    try {
      const context = { auth: researchAuth(['research:run']), gateway: runtime.gateway }
      await expect(loadReport(context, { type: 'qube', runId: RUN })).rejects.toMatchObject({
        code: 'AUTHORIZATION_REQUIRED',
      })
      await expect(
        loadQuery(context, {
          type: 'qube',
          runId: RUN,
          operation: 'result',
          field: 'trades',
          offset: 0,
          limit: 5,
        }),
      ).rejects.toMatchObject({ code: 'AUTHORIZATION_REQUIRED' })
      expect(runtime.exchange).not.toHaveBeenCalled()
      runtime.fetch.mockImplementation(async () => envelope({ ...frozenRun(), id: ID }))
      await expect(
        loadReport(
          { auth: researchAuth(), gateway: runtime.gateway },
          { type: 'qube', runId: RUN },
        ),
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    } finally {
      runtime.dispose()
    }
  })
  it('enforces serialized byte budgets', () => {
    expect(() => enforceBudget({ value: '界'.repeat(100) }, 250)).toThrow('output limit')
  })
})

describe('report chart and local scenarios', () => {
  it('snaps to the nearest actual timestamp and never interpolates returns', () => {
    const points = [
      { ts: '2026-01-01', equity: 100 },
      { ts: '2026-01-10', equity: null },
      { ts: '2026-01-11', equity: 90 },
    ]
    expect(nearestSample(points, Date.parse('2026-01-09'))).toBe(1)
    expect(nearestSample(points, 0)).toBe(0)
    expect(nearestSample([], 0)).toBe(-1)
    expect(pointValue(null, 100, true)).toBeNull()
    expect(pointValue(90, null, true)).toBeNull()
    expect(pointValue(90, 100, true)).toBeCloseTo(-0.1)
    expect(pointValue(90, 100, false)).toBe(90)
  })
  it.each(scenarios)('uses the same validated query contract in %s', (scenario) => {
    const report = fixture(scenario),
      query = fixtureQuery(report, true)
    expect(query({ type: 'qube', runId: RUN, operation: 'overview' })).toEqual(report)
    const first = query({
      type: 'qube',
      runId: RUN,
      operation: 'result',
      field: 'trades',
      offset: 0,
      limit: 5,
    })
    expect(first.operation === 'result' && first.result.rows.length).toBe(
      scenario === 'no-trades' ? 0 : 5,
    )
    expect(() => query({ type: 'qube', runId: ID, operation: 'overview' })).toThrow('identity')
  })
  it('does not invent result pages while replaying an overview recording', () => {
    const query = fixtureQuery(fixture('hk-loss'))
    expect(() =>
      query({
        type: 'qube',
        runId: RUN,
        operation: 'result',
        field: 'trades',
        offset: 0,
        limit: 5,
      }),
    ).toThrow('does not synthesize trades')
  })
  it('bounds both replay curves while preserving omitted gaps and source counts', () => {
    const report = fixture('hk-loss')
    const points = Array.from({ length: 7 }, (_, i) => ({
      ts: `2026-01-0${i + 1}`,
      equity: i === 1 ? null : 100 + i,
      ...(i === 5 ? { breakBefore: true } : {}),
    }))
    report.chart!.points = points
    report.chart!.benchmark = { standardSymbol: 'HSI', points }
    report.chart!.sourceCount = 70
    report.chart!.sampled = true
    const query = fixtureQuery(report)
    const result = query({ type: 'qube', runId: RUN, operation: 'chart', maxPoints: 3 })
    expect(result.operation).toBe('chart')
    if (result.operation !== 'chart') throw new Error('Expected chart')
    expect(result.chart.sourceCount).toBe(70)
    expect(result.chart.points).toHaveLength(3)
    expect(result.chart.benchmark?.points).toEqual(result.chart.points)
    expect(result.chart.points.slice(1).every((point) => point.breakBefore)).toBe(true)
    expect(() =>
      query({ type: 'qube', runId: RUN, operation: 'chart', from: '2026-01-01', maxPoints: 3 }),
    ).toThrow('cannot infer')
  })
})
