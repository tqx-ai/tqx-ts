import { describe, expect, it, vi } from 'vitest'

import { createResearchQuery, type ResearchCall } from '../src/ui/qube/backtest/adapters/research'
import { fixtureResearch } from '../src/ui/qube/backtest/adapters/fixture'
import { fixture, scenarios } from '../src/ui/qube/backtest/dev/fixtures'
import type { Query } from '../src/research/backtest-report/contract'

const recording = fixture('hk-loss')
const runId = recording.runId
const overview = { type: 'qube', runId, operation: 'overview' } as const
const chart = { type: 'qube', runId, operation: 'chart', maxPoints: 600 } as const
const page = {
  type: 'qube',
  runId,
  operation: 'result',
  field: 'trades',
  offset: 0,
  limit: 2,
} as const
function setup(change?: (data: Record<string, unknown>, action: string) => void) {
  const source = fixtureResearch(recording, true)
  const call = vi.fn<ResearchCall>(async (action, input) => {
    const result = await source(action, input)
    change?.(result.structuredContent as Record<string, unknown>, action)
    return result
  })
  return { call, query: createResearchQuery(call, () => recording.summary) }
}

describe('backtest public Research adapter', () => {
  it('refreshes with the two existing read actions and preserves verified frozen metadata', async () => {
    const { call, query } = setup()
    const result = await query(overview)
    expect(call.mock.calls).toEqual([
      ['strategy.backtest.get', { runId }],
      ['backtest.chart.get', { runId, maxPoints: 600 }],
    ])
    expect(result).toMatchObject({
      operation: 'overview',
      summary: {
        title: recording.summary.title,
        market: 'hk',
        currency: 'HKD',
        initialCapital: recording.summary.initialCapital,
        metrics: recording.summary.metrics,
      },
      chart: recording.chart,
    })
  })
  it.each([undefined, { ...recording.summary, runId: 'aaaaaaaaaaaaaaaaaaaaaaaa' }])(
    'does not borrow unavailable or different-run metadata',
    async (current) => {
      const result = await createResearchQuery(fixtureResearch(recording), () => current)(overview)
      expect(result).toMatchObject({
        summary: { title: 'Backtest report', market: null, currency: null },
      })
    },
  )
  it('retains available metrics when the chart action fails', async () => {
    const source = fixtureResearch(recording)
    const query = createResearchQuery(
      async (action, input) => {
        if (action === 'backtest.chart.get') return { isError: true }
        return source(action, input)
      },
      () => recording.summary,
    )
    expect(await query(overview)).toMatchObject({
      chart: null,
      summary: { metrics: recording.summary.metrics, sections: { chart: { state: 'error' } } },
    })
  })
  it('maps chart windows and result pagination without report-only arguments', async () => {
    const { call, query } = setup()
    await query({ ...chart, from: '2025-02-01', to: '2025-03-01' })
    await query({ ...page, keyword: 'HK', symbol: '00700.HK' })
    expect(call.mock.calls).toEqual([
      ['backtest.chart.get', { runId, maxPoints: 600, from: '2025-02-01', to: '2025-03-01' }],
      [
        'backtest.result.get',
        { runId, field: 'trades', offset: 0, limit: 2, keyword: 'HK', symbol: '00700.HK' },
      ],
    ])
  })
  it('preserves numeric strings and removes columns outside the report projection', async () => {
    const { query } = setup((data, action) => {
      if (action === 'backtest.result.get')
        data.rows = [
          { symbol: '00700.HK', price: '123.4567890123456789', internal_note: 'unrendered' },
          {},
        ]
    })
    expect(await query(page)).toMatchObject({
      result: { rows: [{ symbol: '00700.HK', price: '123.4567890123456789' }, {}] },
    })
  })
  it.each([
    ['run', chart, { runId: 'aaaaaaaaaaaaaaaaaaaaaaaa' }],
    ['strategy', overview, { resourceId: 'aaaaaaaaaaaaaaaaaaaaaaaa' }],
    ['field', page, { field: 'account_summary' }],
    ['offset', page, { offset: 1 }],
    ['limit', page, { limit: 3 }],
    ['next offset', page, { nextOffset: 100 }],
  ] as const)('rejects a mismatched %s response', async (_name, input, changes) => {
    const { query } = setup((data) => {
      Object.assign(data, changes)
    })
    await expect(query(input as Query)).rejects.toThrow()
  })
  it('rejects out-of-order chart samples and excess returned points', async () => {
    const unordered = setup((data) => {
      ;(data.points as unknown[]).reverse()
    })
    await expect(unordered.query(chart)).rejects.toThrow('time order')
    await expect(setup().query({ ...chart, maxPoints: 2 })).resolves.toMatchObject({
      operation: 'chart',
    })
    const source = fixtureResearch(recording)
    const query = createResearchQuery(
      (action, input) => source(action, { ...input, maxPoints: 600 }),
      () => recording.summary,
    )
    await expect(query({ ...chart, maxPoints: 2 })).rejects.toThrow('maxPoints')
  })
  it.each([
    { isError: true },
    { content: [{ type: 'text', text: '{}' }] },
    { structuredContent: { runId, padding: 'a'.repeat(524_288) } },
  ])('rejects failed, missing or oversized public output', async (result) => {
    const query = createResearchQuery(
      async () => result,
      () => recording.summary,
    )
    await expect(query(chart)).rejects.toThrow()
  })
  it.each(scenarios)(
    'uses the production query path for the %s workbench scenario',
    async (scenario) => {
      const report = fixture(scenario)
      const result = await createResearchQuery(
        fixtureResearch(report, true),
        () => report.summary,
      )(overview)
      expect(result).toMatchObject({
        type: 'qube',
        runId,
        operation: 'overview',
        summary: { status: report.summary.status, metrics: report.summary.metrics },
      })
      if (scenario === 'chart-error') expect(result).toHaveProperty('chart', null)
      else expect(result).toHaveProperty('chart', report.chart)
    },
  )
  it('keeps replay honest when result pages or sampled windows were not recorded', async () => {
    const report = fixture('long-sampled')
    const query = createResearchQuery(fixtureResearch(report), () => report.summary)
    await expect(query(page)).rejects.toThrow('No recorded result page')
    await expect(query({ ...chart, from: '2025-02-01' })).rejects.toThrow(
      'No recorded chart window',
    )
  })
})
