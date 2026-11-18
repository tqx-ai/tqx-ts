/* eslint-disable no-await-in-loop */
import { describe, expect, it, vi } from 'vitest'
import { TqxClient } from '../src/index'

const ID = '507f1f77bcf86cd799439011'
const ID2 = '507f1f77bcf86cd799439012'
function response(data: unknown, status = 200) {
  return Response.json(data, { status })
}
function factor() {
  return {
    id: ID,
    code: 'close',
    title: 'close',
    description: '',
    market: 'hk',
    code_type: 'formula',
    source_revision: 1,
    config_revision: 1,
    parameters: {},
  }
}
function strategy() {
  return {
    id: ID,
    code: 'pass',
    title: 'demo',
    description: '',
    market: 'us',
    code_type: 'python',
    source_revision: 1,
    config_revision: 1,
    parameters: { backtest: {} },
    factor_binding: null,
  }
}
describe('Qube Next research API', () => {
  it('uses the Qube Next resource paths and revision bodies', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        response({ code: 0, data: { ...factor(), saved: true }, message: 'ok' }),
      )
      .mockResolvedValueOnce(response({ code: 0, data: factor(), message: 'ok' }))
      .mockResolvedValueOnce(
        response({ code: 0, data: { ...strategy(), saved: true }, message: 'ok' }),
      )
      .mockResolvedValueOnce(response({ code: 0, data: { ...strategy(), id: ID2 }, message: 'ok' }))
    const client = new TqxClient({
      baseUrl: 'https://api.example.test/tqxApi',
      apiKey: 'key',
      fetch,
    })
    await client.research.createFactor({
      requestId: 'factor-create-1',
      title: 'close',
      code: 'close',
      codeType: 'formula',
      market: 'hk',
    })
    await client.research.updateFactorSource(ID, {
      requestId: 'factor-source-1',
      baseSourceRevision: 1,
      code: 'close',
    })
    await client.research.createStrategy({
      requestId: 'strategy-create-1',
      title: 'demo',
      code: 'pass',
      market: 'us',
    })
    await client.research.updateStrategy(ID, {
      requestId: 'strategy-config-1',
      baseConfigRevision: 1,
      title: 'demo 2',
    })
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      `https://api.example.test/tqxApi/qube/api/factors`,
    )
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
      request_id: 'factor-create-1',
      title: 'close',
      code_type: 'formula',
      market: 'hk',
    })
    expect(String(fetch.mock.calls[1]?.[0])).toBe(
      `https://api.example.test/tqxApi/qube/api/factors/${ID}/source`,
    )
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
      request_id: 'factor-source-1',
      base_source_revision: 1,
      code: 'close',
      origin: undefined,
    })
    expect(String(fetch.mock.calls[2]?.[0])).toBe(
      `https://api.example.test/tqxApi/qube/api/strategies`,
    )
    expect(String(fetch.mock.calls[3]?.[0])).toBe(
      `https://api.example.test/tqxApi/qube/api/strategies/${ID}`,
    )
  })
  it('serializes cursor lists and validates result pages', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        response({
          code: 0,
          data: {
            strategies: [strategy()],
            has_more: true,
            next_cursor: 'next',
            counts: { all: 1, hk: 0, us: 1 },
          },
          message: 'ok',
        }),
      )
      .mockResolvedValueOnce(
        response({
          code: 0,
          data: {
            run_id: ID,
            field: 'trades',
            offset: 0,
            limit: 100,
            total: 1,
            rows: [{ symbol: 'AAPL.US' }],
            data: [{ symbol: 'AAPL.US' }],
            has_more: false,
          },
          message: 'ok',
        }),
      )
    const client = new TqxClient({
      baseUrl: 'https://api.example.test/tqxApi',
      apiKey: 'key',
      fetch,
    })
    await expect(
      client.research.listStrategies({ limit: 24, cursor: 'next' }),
    ).resolves.toMatchObject({ hasMore: true, nextCursor: 'next', counts: { all: 1 } })
    await expect(
      client.research.getBacktestResultPage(ID, { field: 'trades' }),
    ).resolves.toMatchObject({ total: 1, rows: [{ symbol: 'AAPL.US' }] })
    const url = new URL(String(fetch.mock.calls[0]?.[0]))
    expect(url.pathname).toBe(`/tqxApi/qube/api/strategies`)
    expect(Object.fromEntries(url.searchParams)).toEqual({ limit: '24', cursor: 'next' })
  })
  it('preserves gateway detail errors', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        response({ code: 409, detail: { code: 'CONFIG_CONFLICT', message: 'conflict' } }, 409),
      )
    const client = new TqxClient({
      baseUrl: 'https://api.example.test/tqxApi',
      apiKey: 'key',
      fetch,
    })
    await expect(client.research.getStrategy(ID)).rejects.toMatchObject({
      code: 'CONFIG_CONFLICT',
      message: 'conflict',
      data: { code: 'CONFIG_CONFLICT', message: 'conflict' },
    })
  })
})

const revisions = { requestId: 'request-1', expectedSourceRevision: 2, expectedConfigRevision: 3 }
const version = (kind: 'factor' | 'strategy') => ({
  id: ID2,
  [`${kind}_id`]: ID,
  version: 1,
  name: 'Baseline',
  run_id: ID,
})
const run = (kind: 'factor' | 'strategy', status = 'succeeded') => ({
  id: ID2,
  [`${kind}_id`]: ID,
  status,
})
const tuning = (kind: 'factor' | 'strategy') => ({ id: ID2, [`${kind}_id`]: ID, status: 'running' })
function setup(data: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => response(data))
  const client = new TqxClient({
    baseUrl: 'https://api.example.test/tqxApi/',
    apiKey: 'key',
    fetch,
  })
  return { fetch, client, research: client.research }
}
function requestAt(fetch: ReturnType<typeof setup>['fetch'], index = 0) {
  const [input, init] = fetch.mock.calls[index]!
  return {
    url: new URL(String(input)),
    method: init?.method,
    headers: new Headers(init?.headers),
    body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
  }
}

describe('Qube Next versions and tuning contracts', () => {
  it.each(['factor', 'strategy'] as const)(
    'creates a %s named version from the raw version response',
    async (kind) => {
      const { research, fetch } = setup(version(kind))
      const result =
        kind === 'factor'
          ? await research.createFactorVersion(ID, {
              requestId: 'version-1',
              runId: ID,
              name: ' Baseline ',
              description: ' note ',
            })
          : await research.createStrategyVersion(ID, {
              requestId: 'version-1',
              runId: ID,
              name: ' Baseline ',
              description: ' note ',
            })
      expect(result).toEqual(version(kind))
      const request = requestAt(fetch)
      expect(request.url.pathname).toBe(
        `/tqxApi/qube/api/${kind === 'factor' ? 'factors' : 'strategies'}/${ID}/versions`,
      )
      expect(request.method).toBe('POST')
      expect(request.headers.get('X-API-Key')).toBe('key')
      expect(request.body).toEqual({
        request_id: 'version-1',
        run_id: ID,
        name: 'Baseline',
        description: 'note',
      })
    },
  )

  it.each(['factor', 'strategy'] as const)(
    'restores %s versions and run snapshots with expected revisions',
    async (kind) => {
      const asset = kind === 'factor' ? factor() : strategy()
      const { research, fetch } = setup({ [kind]: asset })
      if (kind === 'factor') {
        expect(await research.restoreFactorVersion(ID, ID2, revisions)).toEqual(asset)
        expect(await research.restoreFactorAnalysis(ID, ID2, revisions)).toEqual(asset)
      } else {
        expect(await research.restoreStrategyVersion(ID, ID2, revisions)).toEqual(asset)
        expect(await research.restoreBacktest(ID, ID2, revisions)).toEqual(asset)
      }
      expect(requestAt(fetch).url.pathname.endsWith(`/${ID}/versions/${ID2}/restore`)).toBe(true)
      expect(
        requestAt(fetch, 1).url.pathname.endsWith(
          `/${ID}/${kind === 'factor' ? 'analyses' : 'backtests'}/${ID2}/restore`,
        ),
      ).toBe(true)
      for (let index = 0; index < 2; index++) {
        expect(requestAt(fetch, index).method).toBe('POST')
        expect(requestAt(fetch, index).body).toEqual({
          request_id: 'request-1',
          expected_source_revision: 2,
          expected_config_revision: 3,
        })
      }
    },
  )

  it('maps factor tuning candidates without renaming user parameter keys', async () => {
    const { research, fetch } = setup(tuning('factor'))
    await research.createFactorTuning(ID, {
      ...revisions,
      candidates: [
        { baseline: true },
        {
          parameters: { adjustmentCycle: 10, factorDirection: -1 },
          factorParameters: { lookBack: 20, look_back: 10 },
        },
      ],
      researchPeriod: { periodStart: '2026-01-01', periodEnd: '2026-06-30' },
      warmupTradingDays: 20,
    })
    const request = requestAt(fetch)
    expect(request.url.pathname.endsWith(`/factors/${ID}/tunings`)).toBe(true)
    expect(request.method).toBe('POST')
    expect(request.body).toEqual({
      request_id: 'request-1',
      expected_source_revision: 2,
      expected_config_revision: 3,
      candidates: [
        { baseline: true },
        {
          baseline: false,
          parameters: { adjustment_cycle: 10, factor_direction: -1 },
          factor_parameters: { lookBack: 20, look_back: 10 },
        },
      ],
      objective: 'rank_ic_mean',
      holdout_enabled: false,
      research_period: { period_start: '2026-01-01', period_end: '2026-06-30' },
      warmup_trading_days: 20,
    })
  })

  it('maps strategy tuning dates, objective and parameter candidates', async () => {
    const { research, fetch } = setup(tuning('strategy'))
    await research.createStrategyTuning(ID, {
      ...revisions,
      candidates: [{ strategyParameters: { fastWindow: 5 } }],
      tradingDates: ['2026-01-02', '2026-01-05'],
      objective: 'sharpe',
      validationEnabled: false,
    })
    expect(requestAt(fetch).body).toEqual({
      request_id: 'request-1',
      expected_source_revision: 2,
      expected_config_revision: 3,
      candidates: [{ strategy_parameters: { fastWindow: 5 } }],
      trading_dates: ['2026-01-02', '2026-01-05'],
      objective: 'sharpe',
      validation_enabled: false,
    })
  })

  it.each(['factor', 'strategy'] as const)(
    'supports %s tuning list, detail, cancel, rerun and apply',
    async (kind) => {
      const task = tuning(kind)
      const asset = kind === 'factor' ? factor() : strategy()
      const { research, fetch } = setup({ tunings: [task] })
      if (kind === 'factor') expect(await research.listFactorTunings(ID)).toEqual([task])
      else expect(await research.listStrategyTunings(ID)).toEqual([task])
      fetch.mockImplementation(async () => response(task))
      if (kind === 'factor') {
        await research.getFactorTuning(ID2)
        await research.cancelFactorTuning(ID2)
        await research.rerunFactorTuning(ID2, { requestId: 'rerun-1' })
      } else {
        await research.getStrategyTuning(ID2)
        await research.cancelStrategyTuning(ID2)
        await research.rerunStrategyTuning(ID2, { requestId: 'rerun-1' })
      }
      fetch.mockResolvedValueOnce(response({ tuning: task, [kind]: asset }))
      const applied =
        kind === 'factor'
          ? await research.applyFactorTuning(ID2, { ...revisions, trialId: 'trial-1' })
          : await research.applyStrategyTuning(ID2, { ...revisions, candidateId: ID })
      expect(applied).toMatchObject({ tuning: task, [kind]: asset })
      expect(fetch.mock.calls.map((_, index) => requestAt(fetch, index).url.pathname)).toEqual([
        `/tqxApi/qube/api/${kind === 'factor' ? 'factors' : 'strategies'}/${ID}/tunings`,
        ...['', '/cancel', '/rerun', '/apply'].map(
          (suffix) => `/tqxApi/qube/api/${kind}-tunings/${ID2}${suffix}`,
        ),
      ])
      expect(requestAt(fetch, 3).body).toEqual({ request_id: 'rerun-1' })
      expect(requestAt(fetch, 4).body).toEqual({
        request_id: 'request-1',
        expected_source_revision: 2,
        expected_config_revision: 3,
        [kind === 'factor' ? 'trial_id' : 'candidate_id']: kind === 'factor' ? 'trial-1' : ID,
      })
    },
  )

  it('validates tuning candidates and dates before sending requests', async () => {
    const { research, fetch } = setup({})
    const base = {
      ...revisions,
      researchPeriod: { periodStart: '2026-01-01', periodEnd: '2026-06-30' },
      warmupTradingDays: 20,
    }
    for (const candidates of [
      [],
      [{}],
      [{ baseline: true }, { baseline: true }],
      [{ baseline: true, factorParameters: { window: 5 } }],
      [{ baseline: true }, { factorParameters: { window: Number.NaN } }],
    ]) {
      await expect(research.createFactorTuning(ID, { ...base, candidates })).rejects.toMatchObject({
        name: 'TqxValidationError',
      })
    }
    for (const tradingDates of [
      ['2026-01-05', '2026-01-02'],
      ['2026-01-02', '2026-01-02'],
      ['2026-02-30', '2026-03-01'],
    ]) {
      await expect(
        research.createStrategyTuning(ID, {
          ...revisions,
          candidates: [{ strategyParameters: { window: 5 } }],
          tradingDates,
        }),
      ).rejects.toMatchObject({ name: 'TqxValidationError' })
    }
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('Qube Next query, validation and polling', () => {
  it('lists strategy backtests with an optional bounded limit', async () => {
    const { research, fetch } = setup({ runs: [run('strategy')] })
    await expect(research.listStrategyBacktests(ID, { limit: 200 })).resolves.toEqual({
      runs: [run('strategy')],
    })
    const request = requestAt(fetch)
    expect(request.url.pathname).toBe(`/tqxApi/qube/api/strategies/${ID}/backtests`)
    expect(request.url.search).toBe('?limit=200')
    expect(request.headers.get('X-API-Key')).toBe('key')
    expect(request.method).toBe('GET')
    await research.listStrategyBacktests(ID)
    expect(requestAt(fetch, 1).url.search).toBe('')
    for (const limit of [0, 201, 1.5]) {
      expect(() => research.listStrategyBacktests(ID, { limit })).toThrow('Invalid SDK input')
    }
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('validates summary status and ordering for each endpoint before sending', () => {
    const { research, fetch } = setup({})
    for (const list of [
      research.listAnalyses.bind(research),
      research.listBacktests.bind(research),
    ]) {
      for (const status of ['cancelling', 'no_valid_candidates'] as const) {
        expect(() => list({ status })).toThrow('Invalid SDK input')
      }
    }
    for (const list of [
      research.listFactorTuningSummaries.bind(research),
      research.listStrategyTuningSummaries.bind(research),
    ]) {
      expect(() => list({ status: 'preparing' })).toThrow('Invalid SDK input')
    }
    expect(() => research.listStrategyVersionSummaries({ status: 'succeeded' })).toThrow(
      'Invalid SDK input',
    )
    expect(() => research.listStrategyVersionSummaries({ timeField: 'updated_at' })).toThrow(
      'Invalid SDK input',
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('serializes valid summary filters for runs, tunings and versions', async () => {
    const { research, fetch } = setup({ runs: [], tunings: [], versions: [], next_cursor: null })
    await research.listAnalyses({ status: 'preparing' })
    await research.listBacktests({ status: 'succeeded', from: '2026-01-01', to: '2026-01-01' })
    await research.listFactorTuningSummaries({ status: 'cancelling' })
    await research.listStrategyTuningSummaries({ status: 'no_valid_candidates' })
    await research.listStrategyVersionSummaries({ timeField: 'created_at' })
    expect(
      fetch.mock.calls.map((_, index) =>
        Object.fromEntries(requestAt(fetch, index).url.searchParams),
      ),
    ).toEqual([
      { view: 'summary', limit: '10', status: 'preparing' },
      { view: 'summary', limit: '10', status: 'succeeded', from: '2026-01-01', to: '2026-01-01' },
      { view: 'summary', limit: '10', status: 'cancelling' },
      { view: 'summary', limit: '10', status: 'no_valid_candidates' },
      { view: 'summary', limit: '10', time_field: 'created_at' },
    ])
  })

  it('serializes summary filters and rejects unsupported parents and limits', async () => {
    const { research, fetch } = setup({ runs: [run('factor')] })
    await expect(
      research.listFactorAnalyses(ID, { includeDeleted: true, status: 'succeeded' }),
    ).resolves.toEqual({ runs: [run('factor')] })
    expect(Object.fromEntries(requestAt(fetch).url.searchParams)).toEqual({
      include_deleted: 'true',
      status: 'succeeded',
    })
    expect(() => research.listBacktests({ limit: 11 })).toThrow('Invalid SDK input')
    expect(() => research.listAnalyses({ strategyId: ID })).toThrow('Invalid SDK input')
    expect(() => research.listFactorVersionsForStrategy({ market: 'hk', factorId: 'bad' })).toThrow(
      'Invalid SDK input',
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('derives factor hasMore from next_cursor and preserves zero counts', async () => {
    const { research } = setup({
      factors: [factor()],
      next_cursor: 'next',
      counts: { all: 1, hk: 1, us: 0 },
    })
    expect(await research.listFactors()).toMatchObject({
      hasMore: true,
      nextCursor: 'next',
      counts: { us: 0 },
    })
  })

  it('maps analysis and backtest submissions with frozen revisions and origin', async () => {
    const { research, fetch } = setup({
      run_id: ID2,
      factor_id: ID,
      status: 'queued',
      idempotent: false,
      code_sha256: 'sha256',
      params: {},
    })
    await research.createFactorAnalysis(ID, {
      ...revisions,
      parameters: { factorDirection: -1, adjustmentCycle: 10 },
      origin: { sessionId: 'session', chatRunId: 'chat' },
    })
    expect(requestAt(fetch).body).toEqual({
      request_id: 'request-1',
      expected_source_revision: 2,
      expected_config_revision: 3,
      parameters: { factor_direction: -1, adjustment_cycle: 10 },
      origin: { session_id: 'session', chat_run_id: 'chat' },
    })
    fetch.mockResolvedValueOnce(response(run('strategy', 'queued')))
    await research.runStrategyBacktest(ID, {
      ...revisions,
      backtest: {
        periodStart: '2026-01-01',
        periodEnd: '2026-06-30',
        frequency: '1d',
        initBalance: 10000,
        slippage: 0.001,
      },
    })
    expect(requestAt(fetch, 1).url.pathname.endsWith(`/strategies/${ID}/backtests`)).toBe(true)
    expect(requestAt(fetch, 1).body.parameters.backtest).toEqual({
      period_start: '2026-01-01',
      period_end: '2026-06-30',
      frequency: '1d',
      init_balance: 10000,
      slippage: 0.001,
    })
  })

  it.each(['succeeded', 'failed', 'cancelled'])('stops polling a %s run', async (status) => {
    const { research, fetch } = setup(run('factor', status))
    const progress = vi.fn()
    expect(await research.pollFactorAnalysis(ID2, { progressCallback: progress })).toMatchObject({
      status,
    })
    expect(progress).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('polls queued to succeeded and returns a typed timeout', async () => {
    const { research, fetch } = setup(run('strategy', 'running'))
    fetch
      .mockResolvedValueOnce(response(run('strategy', 'queued')))
      .mockResolvedValueOnce(response(run('strategy')))
    expect(await research.pollBacktest(ID2, { interval: 0.001 })).toMatchObject({
      status: 'succeeded',
    })
    expect(await research.pollBacktest(ID2, { timeout: 0 })).toMatchObject({
      cli_status: 'TIMEOUT',
      timeout_seconds: 0,
      status: 'running',
    })
  })

  it('rejects invalid IDs, revisions, periods, response shapes and polling options', async () => {
    const { research, fetch } = setup({ id: ID })
    expect(() => research.getStrategy('101')).toThrow('Invalid SDK input')
    await expect(
      research.updateFactorSource(ID, {
        requestId: 'source',
        baseSourceRevision: 0,
        code: 'close',
      }),
    ).rejects.toMatchObject({ name: 'TqxValidationError' })
    await expect(
      research.createFactorAnalysis(ID, {
        ...revisions,
        parameters: { periodStart: '2026-01-01', periodEnd: '2025-01-01' },
      }),
    ).rejects.toMatchObject({ name: 'TqxValidationError' })
    await expect(research.pollBacktest(ID2, { interval: 0 })).rejects.toMatchObject({
      name: 'TqxValidationError',
    })
    await expect(research.getStrategy(ID)).rejects.toMatchObject({ name: 'TqxProtocolError' })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('maps result-page queries and validates field restrictions', async () => {
    const { research, fetch } = setup({
      rows: [],
      total: 0,
      limit: 20,
      offset: 40,
      has_more: false,
    })
    await research.getBacktestResultPage(ID2, {
      field: 'trades',
      offset: 40,
      limit: 20,
      keyword: 'buy',
      symbol: 'AAPL.US',
    })
    expect(Object.fromEntries(requestAt(fetch).url.searchParams)).toEqual({
      field: 'trades',
      offset: '40',
      limit: '20',
      q: 'buy',
      symbol: 'AAPL.US',
    })
    expect(() =>
      research.getBacktestResultPage(ID2, { field: 'equity', symbol: 'AAPL.US' }),
    ).toThrow('Invalid SDK input')
    expect(() => research.getBacktestResultPage(ID2, { field: 'trades', limit: 501 })).toThrow(
      'Invalid SDK input',
    )
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('decodes charts and daily symbol klines', async () => {
    const { research, fetch } = setup({
      run_id: ID2,
      range: { from: null, to: null },
      extent: { from: null, to: null },
      points: [{ ts: '2026-01-02', equity: 10000 }],
      source_count: 1,
      total_count: 1,
      sampled: false,
      trade_days: [],
    })
    expect(
      await research.getBacktestChart(ID2, {
        from: '2026-01-01',
        to: '2026-06-30',
        maxPoints: 200,
      }),
    ).toMatchObject({ sampled: false })
    expect(Object.fromEntries(requestAt(fetch).url.searchParams)).toEqual({
      from: '2026-01-01',
      to: '2026-06-30',
      max_points: '200',
    })
    fetch.mockResolvedValueOnce(
      response({
        market: 'us',
        symbol: 'AAPL.US',
        period: '1d',
        period_start: '2026-01-01',
        period_end: '2026-06-30',
        bars: [{ timestamp: 1767312000, open: 100, high: 102, low: 99, close: 101, volume: null }],
      }),
    )
    expect(await research.getBacktestSymbolKlines(ID2, 'AAPL.US')).toMatchObject({
      bars: [{ close: 101 }],
    })
    expect(requestAt(fetch, 1).url.pathname.endsWith(`/${ID2}/symbol-klines`)).toBe(true)
  })
})

async function collect<T>(values: AsyncIterable<T>) {
  const result: T[] = []
  for await (const value of values) result.push(value)
  return result
}
function sse(text: string) {
  const bytes = new TextEncoder().encode(text)
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7))
        controller.close()
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
}
describe('Qube Next event snapshots', () => {
  it.each(['factor', 'strategy'] as const)(
    'reads chunked %s run snapshots and terminal events',
    async (kind) => {
      const { research, fetch } = setup({})
      fetch.mockResolvedValueOnce(
        sse(
          `: heartbeat\r\nid: 4\r\nevent: snapshot\r\ndata: ${JSON.stringify({ seq: 4, run: { ...run(kind, 'running'), title: '动量' } })}\r\n\r\nid: 5\nevent: done\ndata: ${JSON.stringify({ seq: 5, run: run(kind) })}\n\n`,
        ),
      )
      const result = await collect<{ event: string }>(
        kind === 'factor'
          ? research.streamFactorAnalysis(ID2, { after: 3 })
          : research.streamBacktest(ID2, { after: 3 }),
      )
      expect(result).toMatchObject([
        { id: '4', seq: 4, event: 'snapshot', value: { status: 'running', title: '动量' } },
        { id: '5', seq: 5, event: 'done', value: { status: 'succeeded' } },
      ])
      expect(requestAt(fetch).headers.get('Accept')).toBe('text/event-stream')
      expect(requestAt(fetch).headers.get('X-API-Key')).toBe('key')
      expect(Object.fromEntries(requestAt(fetch).url.searchParams)).toEqual({
        protocol: '1',
        after: '3',
      })
    },
  )

  it.each(['factor', 'strategy'] as const)('reads %s tuning events', async (kind) => {
    const { research, fetch } = setup({})
    fetch.mockResolvedValueOnce(
      sse(
        `event: cancelled\nid: 2\ndata: ${JSON.stringify({ seq: 2, tuning: { ...tuning(kind), status: 'cancelled' } })}\n\n`,
      ),
    )
    const values = await collect<{ event: string }>(
      kind === 'factor' ? research.streamFactorTuning(ID2) : research.streamStrategyTuning(ID2),
    )
    expect(values[0]?.event).toBe('cancelled')
    expect(requestAt(fetch).url.pathname.endsWith(`/${kind}-tunings/${ID2}/events`)).toBe(true)
  })

  it('rejects malformed, mismatched and truncated streams with typed errors', async () => {
    const { research, fetch } = setup({})
    for (const text of [
      'event: snapshot\ndata: nope\n\n',
      `event: snapshot\ndata: ${JSON.stringify({ seq: 1, run: { ...run('strategy'), id: ID } })}\n\n`,
      'event: snapshot\ndata: {}',
    ]) {
      fetch.mockResolvedValueOnce(sse(text))
      await expect(collect(research.streamBacktest(ID2))).rejects.toMatchObject({
        name: 'TqxProtocolError',
      })
    }
    fetch.mockResolvedValueOnce(
      Response.json({ detail: { code: 'RESEARCH_NOT_FOUND', message: 'gone' } }, { status: 404 }),
    )
    await expect(collect(research.streamBacktest(ID2))).rejects.toMatchObject({
      name: 'TqxApiError',
      code: 'RESEARCH_NOT_FOUND',
    })
    fetch.mockResolvedValueOnce(Response.json({}))
    await expect(collect(research.streamBacktest(ID2))).rejects.toMatchObject({
      name: 'TqxProtocolError',
    })
  })

  it('honors abort before opening a connection and wraps connection failures', async () => {
    const { research, fetch } = setup({})
    const controller = new AbortController()
    controller.abort()
    expect(await collect(research.streamBacktest(ID2, { signal: controller.signal }))).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
    fetch.mockRejectedValueOnce(new TypeError('connection reset'))
    await expect(collect(research.streamBacktest(ID2))).rejects.toMatchObject({
      name: 'TqxNetworkError',
    })
  })
})

describe('Qube gateway error envelopes', () => {
  it('preserves string business failures even on HTTP 200', async () => {
    const { research } = setup({
      code: 'QUOTA_EXCEEDED',
      message: 'Quota exhausted',
      data: { remaining: 0 },
      request_id: 'quota-request',
    })
    await expect(research.getFactor(ID)).rejects.toMatchObject({
      name: 'TqxApiError',
      code: 'QUOTA_EXCEEDED',
      requestId: 'quota-request',
      data: { remaining: 0 },
    })
  })
  it('does not mistake resource source text for a gateway error', async () => {
    const { research } = setup({ ...factor(), code: 'COMMON_ERROR', request_id: 'source-request' })
    await expect(research.getFactorSource(ID)).resolves.toMatchObject({ code: 'COMMON_ERROR' })
  })
})

describe('Saved research configuration workflow', () => {
  it.each(['factor', 'strategy'] as const)(
    'runs %s with the saved receipt revisions and no overrides',
    async (kind) => {
      const parameters =
        kind === 'factor' ? { stock_pool: 'SPX' } : { backtest: { standard_symbol: 'NDX' } }
      const saved = {
        ...(kind === 'factor' ? factor() : strategy()),
        source_revision: 2,
        config_revision: 4,
        parameters,
        parameters_draft: null,
        parameter_validation: { status: 'valid', config_revision: 4 },
      }
      const { research, fetch } = setup(saved)
      const receipt =
        kind === 'factor'
          ? await research.updateFactor(ID, {
              baseConfigRevision: 3,
              parameters: { stockPool: 'SPX' },
            })
          : await research.updateStrategy(ID, {
              baseConfigRevision: 3,
              backtest: { standardSymbol: 'NDX' },
            })
      expect(receipt).toMatchObject(saved)
      fetch.mockResolvedValueOnce(
        response(
          kind === 'factor'
            ? {
                run_id: ID2,
                factor_id: ID,
                status: 'queued',
                idempotent: false,
                code_sha256: 'hash',
                params: parameters,
              }
            : { ...run('strategy', 'queued'), parameters },
        ),
      )
      const input = {
        requestId: 'saved-settings-run',
        expectedSourceRevision: receipt.source_revision,
        expectedConfigRevision: receipt.config_revision,
      }
      const submitted =
        kind === 'factor'
          ? await research.createFactorAnalysis(ID, input)
          : await research.runStrategyBacktest(ID, input)
      expect(submitted).toMatchObject(kind === 'factor' ? { params: parameters } : { parameters })
      expect(fetch).toHaveBeenCalledTimes(2)
      expect(requestAt(fetch, 0)).toMatchObject({
        method: 'PATCH',
        body: { base_config_revision: 3, parameters },
      })
      expect(requestAt(fetch, 1)).toMatchObject({
        method: 'POST',
        body: {
          request_id: 'saved-settings-run',
          expected_source_revision: 2,
          expected_config_revision: 4,
        },
      })
      expect(requestAt(fetch, 1).body).not.toHaveProperty('parameters')
    },
  )
})
