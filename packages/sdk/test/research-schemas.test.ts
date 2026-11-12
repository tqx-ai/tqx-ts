import { describe, expect, it } from 'vitest'

import {
  getBacktestParameters,
  getFactorAnalysisParams,
  parseResearchInput,
  StrategyTuningInputSchema,
  BacktestParametersSchema,
  FactorAnalysisParamsInputSchema,
  ListResearchInputSchema,
} from '../src/research/schemas'

describe('Qube Next research schemas', () => {
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
