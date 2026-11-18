import { describe, expect, it } from 'vitest'

import {
  getBacktestParameters,
  getFactorAnalysisParams,
  parseResearchInput,
  StrategyTuningInputSchema,
  BacktestParametersSchema,
  FactorAnalysisParamsInputSchema,
  ListResearchInputSchema,
  FactorTuningInputSchema,
  ResultPageSchema,
  BacktestChartSchema,
  FactorSchema,
  StrategySchema,
} from '../src/research/schemas'
import * as v from 'valibot'

describe('Qube Next research schemas', () => {
  it.each([FactorSchema, StrategySchema])('preserves pending configuration drafts', (schema) => {
    const base = {
      id: '507f1f77bcf86cd799439011',
      title: 'Saved settings',
      market: 'us',
      code_type: 'python',
      source_revision: 2,
      config_revision: 3,
      parameters: {},
    }
    expect(v.parse(schema, base)).not.toHaveProperty('parameters_draft')
    for (const draft of [null, {}, { backtest: { period_start: '2026-01-01' } }]) {
      expect(v.parse(schema, { ...base, parameters_draft: draft }).parameters_draft).toEqual(draft)
    }
    for (const draft of [[], 'pending', false]) {
      expect(v.safeParse(schema, { ...base, parameters_draft: draft }).success).toBe(false)
    }
  })

  it.each(['HSI.HK', 'HSCE.HK', 'HSTECH.HK', 'SPX', 'IXIC', 'NDX', 'DJI'])(
    'accepts the %s benchmark while rejecting it as a factor pool',
    (symbol) => {
      expect(() =>
        parseResearchInput(FactorAnalysisParamsInputSchema, { stockPool: symbol }),
      ).toThrow('Invalid SDK input')
      expect(
        parseResearchInput(BacktestParametersSchema, { standardSymbol: symbol }).standardSymbol,
      ).toBe(symbol)
      expect(() =>
        parseResearchInput(FactorTuningInputSchema, {
          requestId: 'tuning-1',
          expectedSourceRevision: 1,
          expectedConfigRevision: 1,
          candidates: [{ baseline: true }, { parameters: { stockPool: symbol } }],
          researchPeriod: { periodStart: '2026-01-01', periodEnd: '2026-02-01' },
          warmupTradingDays: 0,
        }),
      ).toThrow('Invalid SDK input')
    },
  )
  it.each([undefined, 'all'])(
    'accepts stockPool=%s for analysis and tuning without injecting a default',
    (stockPool) => {
      const parameters = stockPool === undefined ? {} : { stockPool }
      expect(parseResearchInput(FactorAnalysisParamsInputSchema, parameters)).toEqual(parameters)
      expect(
        parseResearchInput(FactorTuningInputSchema, {
          requestId: 'tuning-1',
          expectedSourceRevision: 1,
          expectedConfigRevision: 1,
          candidates: [{ baseline: true }, { parameters }],
          researchPeriod: { periodStart: '2026-01-01', periodEnd: '2026-02-01' },
          warmupTradingDays: 0,
        }).candidates[1]?.parameters,
      ).toEqual(parameters)
    },
  )
  it('rejects unsupported pools, benchmarks and malformed partial metadata', () => {
    expect(() =>
      parseResearchInput(FactorAnalysisParamsInputSchema, { stockPool: 'unknown' }),
    ).toThrow('Invalid SDK input')
    expect(() => parseResearchInput(BacktestParametersSchema, { standardSymbol: 'all' })).toThrow(
      'Invalid SDK input',
    )
    const page = {
      rows: [],
      total: 0,
      offset: 0,
      limit: 10,
      has_more: false,
      partial: true,
      available_from: 3,
      available_total: 8,
    }
    expect(v.parse(ResultPageSchema, page)).toEqual(page)
    expect(v.safeParse(ResultPageSchema, { ...page, available_total: -1 }).success).toBe(false)
    expect(v.safeParse(ResultPageSchema, { ...page, partial: 'true' }).success).toBe(false)
  })
  it('preserves and validates benchmark curves and partial chart state', () => {
    const chart = {
      run_id: '507f1f77bcf86cd799439011',
      range: { from: null, to: null },
      extent: { from: null, to: null },
      points: [],
      source_count: 0,
      total_count: 0,
      sampled: false,
      trade_days: [],
      partial: true,
      complete: false,
      benchmark: {
        standard_symbol: 'NDX',
        points: [{ ts: '2026-01-02T14:30:00Z', equity: null, break_before: true }],
      },
    }
    expect(v.parse(BacktestChartSchema, chart)).toEqual(chart)
    expect(
      v.safeParse(BacktestChartSchema, {
        ...chart,
        benchmark: { standard_symbol: 'NDX', points: [{ ts: '2026-01-02', equity: '100' }] },
      }).success,
    ).toBe(false)
  })
  it.each([
    ['2021-01-01', '2026-01-01'],
    ['2020-02-29', '2025-02-28'],
  ])('includes the five calendar year analysis boundary from %s', (periodStart, periodEnd) => {
    expect(() =>
      parseResearchInput(FactorAnalysisParamsInputSchema, { periodStart, periodEnd }),
    ).not.toThrow()
    const nextDay = new Date(`${periodEnd}T00:00:00Z`)
    nextDay.setUTCDate(nextDay.getUTCDate() + 1)
    expect(() =>
      parseResearchInput(FactorAnalysisParamsInputSchema, {
        periodStart,
        periodEnd: nextDay.toISOString().slice(0, 10),
      }),
    ).toThrow('Invalid SDK input')
    expect(() =>
      parseResearchInput(FactorAnalysisParamsInputSchema, {
        periodStart,
        periodEnd: periodStart,
      }),
    ).toThrow('Invalid SDK input')
  })

  it.each(['1d', '1M'])('accepts a single-day %s backtest', (frequency) => {
    expect(() =>
      parseResearchInput(BacktestParametersSchema, {
        periodStart: '2026-01-01',
        periodEnd: '2026-01-01',
        frequency,
      }),
    ).not.toThrow()
  })

  it.each([
    ['2026-01-01', '2026-01-01', true],
    ['2026-01-02', '2026-01-01', false],
    ['2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', false],
    ['2026-01-01T00:00:00Z', '2026-01-01T08:00:00+08:00', false],
    ['2026-01-01T00:00:00Z', '2026-01-01T00:00:01Z', true],
    ['2026-01-01', '2025-12-31T17:00:00Z', true],
    ['2026-01-01T16:00:00Z', '2026-01-01', false],
    ['2026-01-01T15:59:59Z', '2026-01-01', true],
  ])('compares summary filters %s to %s (valid: %s)', (from, to, valid) => {
    const parse = () => parseResearchInput(ListResearchInputSchema, { from, to })
    if (valid) expect(parse).not.toThrow()
    else expect(parse).toThrow('Invalid SDK input')
  })

  it('extracts backtest parameters from strategy and run response shapes', () => {
    expect(
      getBacktestParameters({
        parameters: {
          backtest: {
            period_start: '2026-01-01',
            period_end: '2026-06-30',
            standard_symbol: 'csi300',
            margin_rate: 2,
            slippage: null,
          },
        },
      }),
    ).toEqual({
      periodStart: '2026-01-01',
      periodEnd: '2026-06-30',
      standardSymbol: 'csi300',
      marginRate: 2,
    })
    expect(getBacktestParameters({ backtest_params: { init_balance: 1000 } })).toEqual({
      initBalance: 1000,
    })
    expect(getBacktestParameters({ init_balance: null, period_start: null })).toEqual({})
  })

  it('extracts only present factor analysis parameters', () => {
    expect(
      getFactorAnalysisParams({
        analysis_parameters: {
          adjustment_cycle: 10,
          factor_direction: null,
        },
      }),
    ).toEqual({ adjustmentCycle: 10 })
    expect(getFactorAnalysisParams({ params: {}, period_start: null })).toEqual({})
  })

  it('rejects empty and oversized strategy tuning candidates', () => {
    const base = {
      requestId: 'request-1',
      expectedSourceRevision: 1,
      expectedConfigRevision: 1,
      tradingDates: ['2026-01-01', '2026-01-02'],
    }
    expect(() =>
      parseResearchInput(StrategyTuningInputSchema, {
        ...base,
        candidates: [{ strategyParameters: {} }],
      }),
    ).toThrow('Invalid SDK input')
    expect(() =>
      parseResearchInput(StrategyTuningInputSchema, {
        ...base,
        candidates: Array.from({ length: 32 }, (_, index) => ({
          strategyParameters: { [`window${index}`]: index + 1 },
        })),
      }),
    ).toThrow('Invalid SDK input')
  })
})
