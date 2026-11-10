import { describe, expect, it } from 'vitest'

import {
  getBacktestParameters,
  getFactorAnalysisParams,
  parseResearchInput,
  StrategyTuningInputSchema,
} from '../src/research/schemas'

describe('Qube Next research schemas', () => {
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
