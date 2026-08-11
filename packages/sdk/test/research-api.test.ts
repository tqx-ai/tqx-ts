import { describe, expect, it, vi } from 'vitest'

import { TqxApiError, TqxClient, TqxValidationError } from '../src/index'

function gatewayResponse(
  data: unknown,
  code: string | number = 0,
  init: ResponseInit = {},
): Response {
  return Response.json({ code, data, message: 'success', request_id: 'qube-request' }, init)
}

describe('Qube research API', () => {
  it('maps versioned strategy and factor research endpoints to the Qube contract', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        gatewayResponse({
          strategy: { id: 8, name: 's', market: 'future', params: {} },
          version: { id: 81, strategy_id: 8, version_number: 2, code: 'code' },
          version_created: true,
        }),
      )
      .mockResolvedValueOnce(
        gatewayResponse({
          id: 91,
          factor_id: 4,
          factor_version_id: 42,
          version_number: 3,
          code: 'close',
          code_type: 'formula',
          market: 'stock',
        }),
      )
      .mockResolvedValueOnce(
        gatewayResponse({ id: 91, strategy_id: 8, strategy_version_id: 81, status: 'pending' }),
      )
    const client = new TqxClient({
      baseUrl: 'https://api.example.test/pandaApi',
      apiKey: 'key',
      fetch,
    })

    await client.research.saveStrategy(8, {
      code: 'code',
      baseVersionId: 80,
      backtest: { marginRate: 2, standardSymbol: '沪深300' },
    })
    await client.research.revertFactorVersion(4, 2)
    await client.research.runStrategyVersionBacktest(81)

    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      'https://api.example.test/pandaApi/agent_quant/api/strategies/8/save',
    )
    expect(fetch.mock.calls[0]?.[1]?.method).toBe('PUT')
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
      code: 'code',
      base_version_id: 80,
      backtest_params: { margin_rate: 2, standard_symbol: '沪深300' },
    })
    expect(String(fetch.mock.calls[1]?.[0])).toBe(
      'https://api.example.test/pandaApi/agent_quant/api/factors/4/versions/2/revert',
    )
    expect(String(fetch.mock.calls[2]?.[0])).toBe(
      'https://api.example.test/pandaApi/agent_quant/api/strategy-versions/81/backtests',
    )
  })

  it('maps factor analysis market-specific parameters', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(gatewayResponse({ id: 7, factor_id: 4, status: 'pending' }))
    const client = new TqxClient({
      baseUrl: 'https://api.example.test/pandaApi',
      apiKey: 'key',
      fetch,
    })

    await client.research.createFactorAnalysis(4, {
      factorVersionId: 12,
      factorDirection: 0,
      stockPool: 'pool',
      marketType: 'main',
    })

    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
      factor_id: 4,
      factor_version_id: 12,
      factor_direction: 0,
      stock_pool: 'pool',
      market_type: 'main',
    })
  })

  it('maps factor creation and list filters to Qube gateway requests', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(gatewayResponse({ id: 12, name: 'volume', market: 'hk' }))
      .mockResolvedValueOnce(
        gatewayResponse({
          items: [{ id: 12, name: 'volume', description: null, market: 'hk' }],
          has_more: true,
          next_offset: 20,
        }),
      )
    const client = new TqxClient({
      baseUrl: 'https://api.example.test/pandaApi',
      apiKey: 'key',
      fetch,
    })

    await expect(
      client.research.createFactor({
        name: ' volume ',
        description: 'factor description',
        code: 'volume',
        codeType: 'formula',
        market: 'HK',
      }),
    ).resolves.toMatchObject({ id: 12, market: 'hk' })
    await expect(
      client.research.listFactors({ offset: 10, limit: 10, market: 'us', keyword: 'momentum' }),
    ).resolves.toEqual({
      items: [{ id: 12, name: 'volume', description: null, market: 'hk' }],
      hasMore: true,
      nextOffset: 20,
    })

    const [, createInit] = fetch.mock.calls[0]!
    expect(new Headers(createInit?.headers).get('X-API-Key')).toBe('key')
    expect(createInit?.method).toBe('POST')
    expect(JSON.parse(String(createInit?.body))).toEqual({
      name: 'volume',
      description: 'factor description',
      code: 'volume',
      code_type: 'formula',
      market: 'hk',
    })
    const listUrl = new URL(String(fetch.mock.calls[1]?.[0]))
    expect(listUrl.pathname).toBe('/pandaApi/agent_quant/api/factors/page')
    expect(Object.fromEntries(listUrl.searchParams)).toEqual({
      offset: '10',
      limit: '10',
      market: 'us',
      keyword: 'momentum',
    })
  })

  it('accepts nullable descriptions in strategy list responses', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json({
        code: 0,
        message: 'success',
        data: {
          items: [
            {
              id: 21,
              name: 'strategy-one',
              description: null,
              market: 'hk',
            },
          ],
          has_more: false,
          next_offset: null,
        },
        request_id: 'qube-request',
      }),
    )
    const client = new TqxClient({
      baseUrl: 'https://api.example.test/pandaApi',
      apiKey: 'key',
      fetch,
    })

    await expect(client.research.listStrategies()).resolves.toEqual({
      items: [{ id: 21, name: 'strategy-one', description: null, market: 'hk' }],
      hasMore: false,
      nextOffset: null,
    })
  })

  it('maps strategy backtest parameters and cancellation paths', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(gatewayResponse({ id: 91, status: 'pending' }))
      .mockResolvedValueOnce(gatewayResponse({ id: 91, status: 'cancelled', cancelled: true }))
    const client = new TqxClient({
      baseUrl: 'https://api.example.test/pandaApi',
      apiKey: 'key',
      fetch,
    })

    await client.research.runStrategyBacktest(8, {
      periodStart: '2026-01-01',
      periodEnd: '2026-03-31',
      initBalance: 1_000_000,
      commissionRate: 1,
      slippage: 0,
      frequency: '1d',
      symbols: ['AAPL.US'],
    })
    await expect(client.research.cancelBacktest(91)).resolves.toMatchObject({ cancelled: true })

    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      'https://api.example.test/pandaApi/agent_quant/api/strategies/8/run-backtest',
    )
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      period_start: '2026-01-01',
      period_end: '2026-03-31',
      init_balance: 1_000_000,
      commission_rate: 1,
      slippage: 0,
      frequency: '1d',
      symbols: ['AAPL.US'],
    })
    expect(String(fetch.mock.calls[1]?.[0])).toBe(
      'https://api.example.test/pandaApi/agent_quant/api/backtests/91/cancel',
    )
  })

  it('converts saved strategy backtest parameters to SDK casing', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      gatewayResponse({
        source: 'saved',
        params: {
          period_start: '2026-01-01',
          init_balance: 1000,
          standard_symbol: '沪深300',
          symbols: null,
        },
      }),
    )
    const client = new TqxClient({
      baseUrl: 'https://api.example.test/pandaApi',
      apiKey: 'key',
      fetch,
    })

    await expect(client.research.getStrategyBacktestParameters(8)).resolves.toEqual({
      source: 'saved',
      params: { periodStart: '2026-01-01', initBalance: 1000, standardSymbol: '沪深300' },
    })
  })

  it('accepts raw Qube resource responses whose code is source content', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json({
        id: 13,
        name: 'close',
        code: 'close',
        data: { raw: true },
        message: 'factor label',
        market: 'hk',
      }),
    )
    const client = new TqxClient({
      baseUrl: 'https://api.example.test/pandaApi',
      apiKey: 'key',
      fetch,
    })

    await expect(
      client.research.createFactor({
        name: 'close',
        code: 'close',
        codeType: 'formula',
        market: 'hk',
      }),
    ).resolves.toMatchObject({
      id: 13,
      code: 'close',
      data: { raw: true },
      message: 'factor label',
      market: 'hk',
    })
  })

  it('rejects invalid Qube resource inputs before requesting the gateway', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    const client = new TqxClient({
      baseUrl: 'https://api.example.test/pandaApi',
      apiKey: 'key',
      fetch,
    })

    expect(() => client.research.getFactor(0)).toThrow(TqxValidationError)
    await expect(
      client.research.createFactor({ name: '', code: 'close', codeType: 'formula', market: 'hk' }),
    ).rejects.toBeInstanceOf(TqxValidationError)
    await expect(
      client.research.runStrategyBacktest(1, {
        standardSymbol: 'benchmark' as never,
      }),
    ).rejects.toBeInstanceOf(TqxValidationError)
    await expect(
      client.research.createStrategyFromFactor(1, {
        rebalanceThresholdBuffer: 1.5,
      }),
    ).rejects.toBeInstanceOf(TqxValidationError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('maps Qube gateway errors without requiring an OpenAPI envelope', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        Response.json(
          { code: 409, detail: { message: 'backtest cannot be cancelled' } },
          { status: 409 },
        ),
      )
    const client = new TqxClient({
      baseUrl: 'https://api.example.test/pandaApi',
      apiKey: 'key',
      fetch,
    })

    const error = await client.research.cancelBacktest(91).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(TqxApiError)
    expect(error).toMatchObject({
      status: 409,
      code: '409',
      message: 'backtest cannot be cancelled',
    })
  })

  it('polls through success, failure, cancellation, and timeout states', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(gatewayResponse({ id: 1, status: 'done' }))
      .mockResolvedValueOnce(gatewayResponse({ id: 2, status: 'failed' }))
      .mockResolvedValueOnce(gatewayResponse({ id: 3, status: 'cancelled' }))
      .mockResolvedValueOnce(gatewayResponse({ id: 4, status: 'pending' }))
    const client = new TqxClient({
      baseUrl: 'https://api.example.test/pandaApi',
      apiKey: 'key',
      fetch,
    })

    await expect(client.research.pollFactorAnalysis(1, { timeout: 1 })).resolves.toMatchObject({
      id: 1,
      status: 'done',
    })
    await expect(client.research.pollFactorAnalysis(2, { timeout: 1 })).resolves.toMatchObject({
      id: 2,
      status: 'failed',
    })
    await expect(client.research.pollBacktest(3, { timeout: 1 })).resolves.toMatchObject({
      id: 3,
      status: 'cancelled',
    })
    await expect(client.research.pollBacktest(4, { timeout: 0 })).resolves.toMatchObject({
      id: 4,
      status: 'pending',
      cli_status: 'TIMEOUT',
      timeout_seconds: 0,
    })
  })

  it('reports invalid polling options as SDK validation errors', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    const client = new TqxClient({
      baseUrl: 'https://api.example.test/pandaApi',
      apiKey: 'key',
      fetch,
    })

    await expect(client.research.pollBacktest(1, { interval: 0 })).rejects.toBeInstanceOf(
      TqxValidationError,
    )
    await expect(client.research.pollBacktest(1, { timeout: -1 })).rejects.toBeInstanceOf(
      TqxValidationError,
    )
    expect(fetch).not.toHaveBeenCalled()
  })
})
