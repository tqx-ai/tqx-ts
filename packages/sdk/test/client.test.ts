import { afterEach, describe, expect, it, vi } from 'vitest'
import { safeParse } from 'valibot'

import {
  TqxApiError,
  TqxClient,
  TqxConfigurationError,
  TqxNetworkError,
  TqxProtocolError,
  TqxValidationError,
  type TqxClientOptions,
  TradingAccountDataSchema,
} from '../src/index'

const now = '2026-07-21T12:00:00Z'

const removedResearchBaseUrlOption: TqxClientOptions = {
  baseUrl: 'https://research-api.example.test',
  // @ts-expect-error researchBaseUrl was removed; use baseUrl for research requests.
  researchBaseUrl: 'https://legacy-research-api.example.test',
}
void removedResearchBaseUrlOption

function response(
  data: unknown,
  init: ResponseInit = {},
  envelope: {
    requestId?: string
    code?: string
    message?: string
  } = {},
): Response {
  return Response.json(
    {
      code: envelope.code ?? '0',
      message: envelope.message ?? 'success',
      data,
      request_id: envelope.requestId ?? 'request-1',
      timestamp: 1_753_094_400_000,
    },
    init,
  )
}

afterEach(() => {
  vi.unstubAllEnvs?.()
  vi.useRealTimers()
})

describe('TqxClient', () => {
  it('uses the build-time trading default when no URL is provided', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(response({ status: 'ok', service: 'panda_openapi', version: '1.0.0' }))
    const client = new TqxClient({ fetch })

    await client.health()

    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      'https://build-default-trading-api.example.test/openapi/v1/health',
    )
  })

  it('uses the trading default for User API status and verification', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ status: 'ok', service: 'panda_openapi', version: '1.0.0' }))
      .mockResolvedValueOnce(response({ valid: true }))
    const client = new TqxClient({ apiKey: 'key', fetch })

    await client.user.getStatus()
    await client.user.verify()

    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      'https://build-default-trading-api.example.test/openapi/v1/health',
      'https://build-default-trading-api.example.test/openapi/v1/auth/verify',
    ])
  })

  it('uses TQX_BASE_URL as the runtime override for every request group', async () => {
    vi.stubEnv('TQX_BASE_URL', 'https://runtime-api.example.test')
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ status: 'ok', service: 'panda_openapi', version: '1.0.0' }))
      .mockResolvedValueOnce(response({ valid: true }))
      .mockResolvedValueOnce(Response.json({ code: 0, data: { items: [] } }))
    const client = new TqxClient({ apiKey: 'key', fetch })

    await client.health()
    await client.auth.verify()
    await client.research.listFactors()

    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      'https://runtime-api.example.test/openapi/v1/health',
      'https://runtime-api.example.test/openapi/v1/auth/verify',
      'https://runtime-api.example.test/agent_quant/api/factors/page?offset=0&limit=100',
    ])
  })

  it('uses baseUrl for research and tradingBaseUrl for OpenAPI requests', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ valid: true }))
      .mockResolvedValueOnce(Response.json({ code: 0, data: { id: 1, market: 'hk' } }))
    const client = new TqxClient({
      baseUrl: 'https://research-api.example.test/',
      tradingBaseUrl: 'https://trading-api.example.test/',
      apiKey: 'key',
      fetch,
    })

    await client.auth.verify()
    await expect(
      client.research.createFactor({
        name: 'close',
        code: 'close',
        codeType: 'formula',
        market: 'hk',
      }),
    ).resolves.toMatchObject({ id: 1, market: 'hk' })

    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      'https://trading-api.example.test/openapi/v1/auth/verify',
      'https://research-api.example.test/agent_quant/api/factors',
    ])
  })

  it('uses the non-trading base URL for the User API balance endpoint', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ code: 0, data: { balance: 123.0 } }))
    const client = new TqxClient({
      baseUrl: 'https://user-api.example.test/pandaApi',
      tradingBaseUrl: 'https://trading-api.example.test',
      apiKey: 'key',
      fetch,
    })

    await expect(client.user.getBalance()).resolves.toEqual({ balance: 123.0 })

    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      'https://user-api.example.test/pandaApi/userWallet/myWallet',
    )
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('X-API-Key')).toBe('key')
  })

  it('uses the build-time base URL for the User API balance endpoint', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ code: 0, data: { balance: '123.00' } }))
    const client = new TqxClient({ apiKey: 'key', fetch })

    await client.user.getBalance()

    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      'https://build-default-api.example.test/userWallet/myWallet',
    )
  })

  it('normalizes wallet-shaped balance responses to balance', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        Response.json({ code: 0, data: { userId: 7, computingPower: '123.00', bamboo: '9.00' } }),
      )
    const client = new TqxClient({
      baseUrl: 'https://user-api.example.test/pandaApi',
      apiKey: 'key',
      fetch,
    })

    await expect(client.user.getBalance()).resolves.toEqual({ balance: '123.00' })
  })

  it('rejects an explicitly empty base URL', () => {
    expect(() => new TqxClient({ baseUrl: '', fetch: vi.fn() })).toThrow(TqxConfigurationError)
  })

  it('calls public health without an API key', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(response({ status: 'ok', service: 'panda_openapi', version: '1.0.0' }))
    const client = new TqxClient({ baseUrl: 'https://api.example.test/', fetch })

    await expect(client.health()).resolves.toEqual({
      status: 'ok',
      service: 'panda_openapi',
      version: '1.0.0',
    })
    const [url, init] = fetch.mock.calls[0]!
    expect(String(url)).toBe('https://build-default-trading-api.example.test/openapi/v1/health')
    expect(new Headers(init?.headers).has('X-API-Key')).toBe(false)
  })

  it('verifies an API key through the authenticated endpoint', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response({ valid: true }))
    const client = new TqxClient({
      baseUrl: 'https://api.example.test',
      apiKey: 'sk-test-1234567890123456',
      fetch,
    })

    await expect(client.auth.verify()).resolves.toEqual({ valid: true })
    const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers)
    expect(headers.get('X-API-Key')).toBe('sk-test-1234567890123456')
  })

  it('encodes list filters as query parameters', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(response({ items: [], next_cursor: null }))
    const client = new TqxClient({ baseUrl: 'https://api.example.test', apiKey: 'key', fetch })

    await client.trading.listPositions({
      symbol: '00700.HK',
      market: 'HK',
      limit: 10,
      cursor: 'opaque+/=',
    })

    const url = new URL(String(fetch.mock.calls[0]?.[0]))
    expect(Object.fromEntries(url.searchParams)).toEqual({
      symbol: '00700.HK',
      market: 'HK',
      limit: '10',
      cursor: 'opaque+/=',
    })
  })

  it('retries idempotent GET requests after transient network failures', async () => {
    vi.useFakeTimers()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(new TypeError('fetch failed again'))
      .mockResolvedValueOnce(response({ status: 'ok', service: 'panda_openapi', version: '1.0.0' }))
    const client = new TqxClient({ tradingBaseUrl: 'https://api.example.test', fetch })

    const promise = client.health()

    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(99)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(199)
    expect(fetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(3)

    await expect(promise).resolves.toEqual({
      status: 'ok',
      service: 'panda_openapi',
      version: '1.0.0',
    })
  })

  it.each([502, 503, 504] as const)('retries GET requests after %s responses', async (status) => {
    vi.useFakeTimers()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json(
          {
            code: 'service_unavailable',
            message: 'service unavailable',
            data: null,
            request_id: `request-${status}`,
            timestamp: 1,
          },
          {
            status,
            headers: { 'X-Request-ID': `request-${status}` },
          },
        ),
      )
      .mockResolvedValueOnce(response({ status: 'ok', service: 'panda_openapi', version: '1.0.0' }))
    const client = new TqxClient({ tradingBaseUrl: 'https://api.example.test', fetch })

    const promise = client.health()

    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(fetch).toHaveBeenCalledTimes(2)

    await expect(promise).resolves.toEqual({
      status: 'ok',
      service: 'panda_openapi',
      version: '1.0.0',
    })
  })

  it('preserves the latest retryable response metadata when retries exhaust on a network error', async () => {
    vi.useFakeTimers()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json(
          {
            code: 'service_unavailable',
            message: 'service unavailable',
            data: null,
            request_id: 'request-503',
            timestamp: 1,
          },
          {
            status: 503,
            headers: { 'X-Request-ID': 'request-503' },
          },
        ),
      )
      .mockRejectedValueOnce(new TypeError('network unavailable'))
      .mockRejectedValueOnce(new TypeError('network unavailable again'))
    const client = new TqxClient({ tradingBaseUrl: 'https://api.example.test', fetch })

    const error = client.health().catch((caught: unknown) => caught)

    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(fetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(200)
    expect(fetch).toHaveBeenCalledTimes(3)

    await expect(error).resolves.toMatchObject({
      message: 'Unable to reach the TQX API',
      status: 503,
      requestId: 'request-503',
      url: 'https://api.example.test/openapi/v1/health',
    })
  })

  it.each([408, 429] as const)('does not retry GET requests after %s responses', async (status) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json(
          {
            code: status === 408 ? 'request_timeout' : 'rate_limited',
            message: status === 408 ? 'request timed out' : 'rate limited',
            data: null,
            request_id: `request-${status}`,
            timestamp: 1,
          },
          {
            status,
            headers: { 'X-Request-ID': `request-${status}` },
          },
        ),
      )
      .mockResolvedValueOnce(response({ status: 'ok', service: 'panda_openapi', version: '1.0.0' }))
    const client = new TqxClient({ tradingBaseUrl: 'https://api.example.test', fetch })

    const error = await client.health().catch((caught: unknown) => caught)

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(error).toBeInstanceOf(TqxApiError)
    expect(error).toMatchObject({
      status,
      code: status === 408 ? 'request_timeout' : 'rate_limited',
      requestId: `request-${status}`,
    })
  })

  it('maps place-order input to the OpenAPI request', async () => {
    const signal = {
      signal_id: 'signal-001',
      state: 'ACCEPTED',
      order_id: 'order-1',
      order_status: 'SUBMITTED',
      message: null,
      created_at: now,
      updated_at: now,
      error_code: null,
      broker_error_id: null,
    }
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(response(signal, { status: 202 }))
    const client = new TqxClient({ baseUrl: 'https://api.example.test', apiKey: 'key', fetch })

    await expect(
      client.trading.placeOrder({
        symbol: ' aapl.us ',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: '2',
        price: '185.50',
        reason: ' breakout ',
        idempotencyKey: 'signal-001',
      }),
    ).resolves.toEqual(signal)

    const [, init] = fetch.mock.calls[0]!
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('signal-001')
    expect(JSON.parse(String(init?.body))).toEqual({
      symbol: 'AAPL.US',
      side: 'BUY',
      order_type: 'LIMIT',
      quantity: '2',
      price: '185.50',
      reason: 'breakout',
    })
  })

  it('does not retry writes without an idempotency key', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError('fetch failed'))
    const client = new TqxClient({ baseUrl: 'https://api.example.test', apiKey: 'key', fetch })

    await expect(
      client.trading.modifyOrder({
        orderId: 'order-1',
        price: '185.50',
      }),
    ).rejects.toBeInstanceOf(TqxNetworkError)

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('retries idempotent writes that include an idempotency key', async () => {
    vi.useFakeTimers()
    const signal = {
      signal_id: 'signal-retry-001',
      state: 'ACCEPTED',
      order_id: 'order-1',
      order_status: 'SUBMITTED',
      message: null,
      created_at: now,
      updated_at: now,
      error_code: null,
      broker_error_id: null,
    }
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json(
          {
            code: 'service_unavailable',
            message: 'service unavailable',
            data: null,
            request_id: 'request-503',
            timestamp: 1,
          },
          {
            status: 503,
            headers: { 'X-Request-ID': 'request-503' },
          },
        ),
      )
      .mockResolvedValueOnce(response(signal, { status: 202 }, { requestId: 'request-202' }))
    const client = new TqxClient({ baseUrl: 'https://api.example.test', apiKey: 'key', fetch })

    const promise = client.trading.placeOrder({
      symbol: 'AAPL.US',
      side: 'BUY',
      orderType: 'LIMIT',
      quantity: '2',
      price: '185.50',
      idempotencyKey: 'signal-retry-001',
    })

    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(fetch).toHaveBeenCalledTimes(2)

    await expect(promise).resolves.toEqual(signal)
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Idempotency-Key')).toBe(
      'signal-retry-001',
    )
  })

  it('accepts signal diagnostics when querying a signal', async () => {
    const signal = {
      signal_id: 'signal-001',
      state: 'ACCEPTED',
      order_id: 'order-1',
      order_status: 'SUBMITTED',
      message: null,
      created_at: now,
      updated_at: now,
      error_code: null,
      broker_error_id: null,
    }
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response(signal))
    const client = new TqxClient({ baseUrl: 'https://api.example.test', apiKey: 'key', fetch })

    await expect(client.trading.getSignal('signal-001')).resolves.toEqual(signal)
  })

  it('rejects invalid order styles before making a request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    const client = new TqxClient({ baseUrl: 'https://api.example.test', apiKey: 'key', fetch })

    await expect(
      client.trading.placeOrder({
        symbol: 'AAPL.US',
        side: 'BUY',
        orderType: 'MARKET',
        quantity: '1',
        price: '100',
        idempotencyKey: 'signal-002',
      }),
    ).rejects.toBeInstanceOf(TqxValidationError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('explains idempotency key validation failures', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    const client = new TqxClient({ baseUrl: 'https://api.example.test', apiKey: 'key', fetch })

    const error = await client.trading
      .placeOrder({
        symbol: '00700.HK',
        side: 'BUY',
        orderType: 'MARKET',
        quantity: '100',
        idempotencyKey: 'aaa',
      })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TqxValidationError)
    expect(error).toMatchObject({
      issues: [
        {
          message: 'Must be at least 8 characters',
          path: [{ key: 'idempotencyKey' }],
        },
      ],
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('throws a typed API error for non-success envelopes', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json(
        {
          code: 'invalid_api_key',
          message: 'API key is invalid',
          data: null,
          request_id: 'request-401',
          timestamp: 1,
        },
        { status: 401 },
      ),
    )
    const client = new TqxClient({ baseUrl: 'https://api.example.test', apiKey: 'bad', fetch })

    const error = await client.auth.verify().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(TqxApiError)
    expect(error).toMatchObject({ status: 401, code: 'invalid_api_key', requestId: 'request-401' })
  })

  it('preserves business data attached to API errors', async () => {
    const rejection = {
      signal_id: 'signal-rejected',
      state: 'REJECTED',
      order_id: null,
      order_status: 'REJECTED',
      message: 'insufficient funds or buying power',
      error_code: 'ORDER_INSERT_ERROR_20001',
      broker_error_id: 20001,
      rejection_reason: 'broker says buying power is insufficient',
      created_at: now,
      updated_at: now,
    }
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json(
        {
          code: 'insufficient_funds',
          message: rejection.message,
          data: rejection,
          request_id: 'request-rejected',
          timestamp: 1,
        },
        { status: 409 },
      ),
    )
    const client = new TqxClient({ baseUrl: 'https://api.example.test', apiKey: 'key', fetch })

    const error = await client.trading
      .placeOrder({
        symbol: '00700.HK',
        side: 'BUY',
        orderType: 'MARKET',
        quantity: '100',
        idempotencyKey: 'signal-rejected',
      })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TqxApiError)
    expect(error).toMatchObject({
      code: 'insufficient_funds',
      status: 409,
      data: rejection,
    })
  })

  it('preserves classified 422 rejection details without reclassifying them', async () => {
    const rejection = {
      signal_id: 'signal-lot-size',
      state: 'REJECTED',
      order_id: null,
      order_status: 'REJECTED',
      message: 'order quantity does not match the market lot size',
      error_code: 'ORDER_INSERT_ERROR_5001',
      broker_error_id: -110045,
      rejection_reason: 'Huatai rejected the quantity: invalid lot size',
      created_at: now,
      updated_at: now,
    }
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json(
        {
          code: 'invalid_lot_size',
          message: rejection.message,
          data: rejection,
          request_id: 'request-lot-size',
          timestamp: 1,
        },
        { status: 422 },
      ),
    )
    const client = new TqxClient({ baseUrl: 'https://api.example.test', apiKey: 'key', fetch })

    const error = await client.trading
      .placeOrder({
        symbol: '00700.HK',
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: '100',
        price: '350',
        idempotencyKey: 'signal-lot-size',
      })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TqxApiError)
    expect(error).toMatchObject({
      status: 422,
      code: 'invalid_lot_size',
      requestId: 'request-lot-size',
      data: { rejection_reason: rejection.rejection_reason, broker_error_id: -110045 },
    })
  })

  it('rejects successful responses whose data violates the schema', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response({ valid: false }))
    const client = new TqxClient({ baseUrl: 'https://api.example.test', apiKey: 'key', fetch })

    await expect(client.auth.verify()).rejects.toBeInstanceOf(TqxProtocolError)
  })

  it('reports non-JSON response diagnostics', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response('<html>upstream unavailable</html>', {
        status: 500,
        headers: {
          'Content-Type': 'text/html',
          'X-Request-ID': 'request-non-json',
        },
      }),
    )
    const client = new TqxClient({
      baseUrl: 'https://api.example.test/pandaApi',
      apiKey: 'key',
      fetch,
    })

    const error = await client.research.listFactors().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TqxProtocolError)
    expect(error).toMatchObject({
      status: 500,
      requestId: 'request-non-json',
      contentType: 'text/html',
      url: 'https://api.example.test/pandaApi/agent_quant/api/factors/page?offset=0&limit=100',
    })
  })

  it('covers the remaining account, order, trade and signal operations', async () => {
    const account = {
      account_id: 101,
      future_field: 'preserved',
      mode: 'PAPER',
      base_currency: 'HKD',
      total_assets: '1000.00',
      cash: '500.00',
      available_cash: '450.00',
      frozen_cash: '50.00',
      buying_power: '450.00',
      market_value: '500.00',
      unrealized_pnl: '10.00',
      as_of: now,
      is_stale: false,
    }
    const order = {
      order_id: 'order/1',
      client_order_id: null,
      symbol: 'AAPL.US',
      symbol_name: 'Apple',
      market: 'US',
      currency: 'USD',
      side: 'BUY',
      order_type: 'LIMIT',
      status: 'SUBMITTED',
      quantity: '2',
      price: '185.50',
      filled_quantity: '0',
      remaining_quantity: '2',
      average_fill_price: null,
      submitted_at: now,
      updated_at: now,
    }
    const trade = {
      trade_id: 'trade-1',
      order_id: 'order/1',
      symbol: 'AAPL.US',
      symbol_name: 'Apple',
      market: 'US',
      currency: 'USD',
      side: 'BUY',
      quantity: '2',
      price: '185.50',
      amount: '371.00',
      commission: '1.00',
      executed_at: now,
    }
    const signal = {
      signal_id: 'signal-remaining',
      state: 'ACCEPTED',
      order_id: 'order/1',
      order_status: 'SUBMITTED',
      message: null,
      created_at: now,
      updated_at: now,
    }
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(account))
      .mockResolvedValueOnce(response({ items: [order], next_cursor: null }))
      .mockResolvedValueOnce(response(order))
      .mockResolvedValueOnce(response({ order_id: 'order/1', accepted: true }, { status: 202 }))
      .mockResolvedValueOnce(response({ order_id: 'order/1', accepted: true }, { status: 202 }))
      .mockResolvedValueOnce(response({ items: [trade], next_cursor: null }))
      .mockResolvedValueOnce(response(signal))
    const client = new TqxClient({ baseUrl: 'https://api.example.test', apiKey: 'key', fetch })

    await expect(client.trading.getAccount({ currency: 'HKD' })).resolves.toEqual(account)
    expect(safeParse(TradingAccountDataSchema, { ...account, account_id: '101' }).success).toBe(
      true,
    )
    await expect(client.trading.listOrders({ limit: 1 })).resolves.toEqual({
      items: [order],
      next_cursor: null,
    })
    await expect(client.trading.getOrder('order/1')).resolves.toEqual(order)
    await expect(
      client.trading.modifyOrder({ orderId: 'order/1', price: '186.00' }),
    ).resolves.toEqual({ order_id: 'order/1', accepted: true })
    await expect(client.trading.cancelOrder('order/1')).resolves.toEqual({
      order_id: 'order/1',
      accepted: true,
    })
    await expect(
      client.trading.listTrades({ market: 'US', orderId: 'order/1', limit: 5 }),
    ).resolves.toEqual({ items: [trade], next_cursor: null })
    await expect(client.trading.getSignal('signal-remaining')).resolves.toEqual(signal)

    expect(String(fetch.mock.calls[2]?.[0])).toContain('/orders/order%2F1')
    expect(fetch.mock.calls[3]?.[1]?.method).toBe('PATCH')
    expect(fetch.mock.calls[4]?.[1]?.method).toBe('DELETE')
    expect(String(fetch.mock.calls[5]?.[0])).toContain('order_id=order%2F1')
  })
})
