import { afterEach, describe, expect, it, vi } from 'vitest'

import { TqxApiError, TqxClient, TqxConfigurationError, type TqxClientOptions } from '../src/index'

const account = {
  account_id: 'paper-account',
  mode: 'PAPER',
  base_currency: 'USD',
  total_assets: '1000.00',
  cash: '900.00',
  available_cash: '900.00',
  frozen_cash: '0',
  buying_power: '900.00',
  market_value: '100.00',
  unrealized_pnl: '0',
  as_of: '2026-07-21T12:00:00Z',
  is_stale: false,
}
const positions = {
  items: [
    {
      symbol: 'AAPL.US',
      symbol_name: 'Apple',
      market: 'US',
      currency: 'USD',
      side: 'LONG',
      quantity: '1',
      available_quantity: '1',
      average_cost: '100.00',
      last_price: '100.00',
      market_value: '100.00',
      unrealized_pnl: '0',
      unrealized_pnl_ratio: '0',
      as_of: account.as_of,
    },
  ],
  next_cursor: null,
}
const health = { status: 'ok', service: 'panda_openapi', version: '1.0.0' }

function response(data: unknown, status = 200, code = '0'): Response {
  return Response.json(
    { code, message: 'test response', data, request_id: 'auth-test', timestamp: 1 },
    { status },
  )
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('TqxClient authentication', () => {
  it.each([{ apiKey: '  api-key  ' }, { bearerToken: '  api.token_~+/-==  ' }])(
    'uses only the configured credential for account and positions: %j',
    async (credential) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(response(account))
        .mockResolvedValueOnce(response(positions))
      const client = new TqxClient({
        baseUrl: 'https://research.example.test/pandaApi',
        tradingBaseUrl: 'https://trading.example.test/pandaApi/',
        ...credential,
        fetch,
      })

      await expect(client.trading.getAccount()).resolves.toEqual(account)
      await expect(
        client.trading.listPositions({
          market: 'US',
          symbol: 'AAPL.US',
          limit: 10,
          cursor: 'next+/=',
        }),
      ).resolves.toEqual(positions)

      expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
        'https://trading.example.test/openapi/v1/trading/account',
        'https://trading.example.test/openapi/v1/trading/positions?symbol=AAPL.US&market=US&limit=10&cursor=next%2B%2F%3D',
      ])
      for (const [, init] of fetch.mock.calls) {
        expect(init?.method).toBe('GET')
        expect(init?.body).toBeUndefined()
        const headers = new Headers(init?.headers)
        expect(headers.get('Accept')).toBe('application/json')
        expect(headers.get('X-API-Key')).toBe(credential.apiKey ? 'api-key' : null)
        expect(headers.get('Authorization')).toBe(
          credential.bearerToken ? 'Bearer api.token_~+/-==' : null,
        )
      }
    },
  )

  it.each([{}, { apiKey: 'api-key' }, { bearerToken: 'api-token' }])(
    'keeps both health entry points public with credential configuration %j',
    async (credential) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(response(health))
        .mockResolvedValueOnce(response(health))
      const client = new TqxClient({
        tradingBaseUrl: 'https://trading.example.test/pandaApi',
        ...credential,
        fetch,
      })

      await expect(client.health()).resolves.toEqual(health)
      await expect(client.user.getStatus()).resolves.toEqual(health)

      expect(fetch).toHaveBeenCalledTimes(2)
      for (const [url, init] of fetch.mock.calls) {
        expect(String(url)).toBe('https://trading.example.test/openapi/v1/health')
        const headers = new Headers(init?.headers)
        expect(headers.has('X-API-Key')).toBe(false)
        expect(headers.has('Authorization')).toBe(false)
      }
    },
  )

  it.each([
    { apiKey: 'key', bearerToken: 'token' },
    { apiKey: '', bearerToken: 'token' },
    { apiKey: 'key', bearerToken: '' },
    { apiKey: '', bearerToken: '' },
  ])('rejects both credential options before fetching: %j', (credential) => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    expect(() => new TqxClient({ ...credential, fetch })).toThrow(
      new TqxConfigurationError('apiKey and bearerToken are mutually exclusive'),
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['apiKey', 'bearerToken'] as const)(
    'rejects empty, unsafe, and non-string %s values as configuration errors',
    (name) => {
      const fetch = vi.fn<typeof globalThis.fetch>()
      const invalidValues: unknown[] = [
        '',
        ' \t\n ',
        null,
        123,
        false,
        {},
        [],
        'a\r\nb',
        'a\0b',
        'a\tb',
        '\u4e2d',
      ]
      for (const value of invalidValues) {
        const options = { [name]: value, fetch } as TqxClientOptions
        expect(() => new TqxClient(options)).toThrow(TqxConfigurationError)
      }
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it.each(['Bearer token', 'a b', 'a:b', 'a,b', 'a=b', '='])(
    'rejects malformed Bearer token %j',
    (bearerToken) => {
      expect(() => new TqxClient({ bearerToken, fetch: vi.fn() })).toThrow(TqxConfigurationError)
    },
  )

  it('rejects protected requests without credentials before fetching', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    const client = new TqxClient({ fetch })
    const requests = [
      () => client.trading.getAccount(),
      () => client.trading.listPositions(),
      () => client.auth.verify(),
      () => client.user.getBalance(),
      () => client.research.listFactors(),
    ]

    await Promise.all(
      requests.map((request) =>
        expect(request()).rejects.toThrow(
          new TqxConfigurationError('An API key or Bearer token is required for this request'),
        ),
      ),
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('retains the Bearer header and GET retry policy after a transient failure', async () => {
    vi.useFakeTimers()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(null, 503, 'service_unavailable'))
      .mockResolvedValueOnce(response(positions))
    const client = new TqxClient({ bearerToken: 'api-token', fetch })

    const pending = client.trading.listPositions()
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(100)
    await expect(pending).resolves.toEqual(positions)

    expect(fetch).toHaveBeenCalledTimes(2)
    for (const [, init] of fetch.mock.calls) {
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe('Bearer api-token')
      expect(headers.has('X-API-Key')).toBe(false)
    }
  })

  it('returns Bearer rejection without attempting token exchange or refresh', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(null, 401, 'invalid_token'))
    const client = new TqxClient({ bearerToken: 'expired-token', fetch })

    const error = await client.trading.getAccount().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(TqxApiError)
    expect(error).toMatchObject({ status: 401, code: 'invalid_token', requestId: 'auth-test' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('preserves Bearer authentication and idempotency across retried writes', async () => {
    vi.useFakeTimers()
    const signal = {
      signal_id: 'signal-auth-retry',
      state: 'ACCEPTED',
      order_id: null,
      order_status: null,
      message: null,
      created_at: account.as_of,
      updated_at: account.as_of,
      error_code: null,
      broker_error_id: null,
    }
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(null, 503, 'service_unavailable'))
      .mockResolvedValueOnce(response(signal, 202))
    const client = new TqxClient({ bearerToken: 'api-token', fetch })

    const pending = client.trading.placeOrder({
      symbol: 'AAPL.US',
      side: 'BUY',
      quantity: '1',
      orderType: 'MARKET',
      idempotencyKey: 'auth-retry-001',
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(100)
    await expect(pending).resolves.toEqual(signal)

    expect(fetch).toHaveBeenCalledTimes(2)
    for (const [, init] of fetch.mock.calls) {
      const headers = new Headers(init?.headers)
      expect(init?.method).toBe('POST')
      expect(headers.get('Authorization')).toBe('Bearer api-token')
      expect(headers.has('X-API-Key')).toBe(false)
      expect(headers.get('Idempotency-Key')).toBe('auth-retry-001')
      expect(headers.get('Content-Type')).toBe('application/json')
      expect(JSON.parse(String(init?.body))).toEqual({
        symbol: 'AAPL.US',
        side: 'BUY',
        quantity: '1',
        order_type: 'MARKET',
        time_in_force: 'DAY',
      })
    }
  })
})
