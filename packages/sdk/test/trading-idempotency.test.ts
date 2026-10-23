import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  TqxApiError,
  TqxClient,
  TqxNetworkError,
  TqxValidationError,
  type CancelOrderOptions,
  type ModifyOrderInput,
  type PlaceOrderInput,
} from '../src/index'

const key = 'write-retry-001'
const signal = {
  signal_id: 'signal-write-001',
  state: 'ACCEPTED',
  order_id: null,
  order_status: null,
  message: null,
  created_at: '2026-10-23T00:00:00Z',
  updated_at: '2026-10-23T00:00:00Z',
  error_code: null,
  broker_error_id: null,
}
const acknowledgement = { order_id: 'order/one', accepted: true }
const order: Omit<PlaceOrderInput, 'idempotencyKey'> = {
  symbol: 'AAPL.US',
  side: 'BUY',
  orderType: 'LIMIT',
  quantity: '2',
  price: '185.50',
}

interface WriteCase {
  name: string
  method: string
  path: string
  body?: unknown
  data: unknown
  invoke(client: TqxClient, idempotencyKey?: string): Promise<unknown>
}

const place: WriteCase = {
  name: 'placeOrder',
  method: 'POST',
  path: '/openapi/v1/trading/orders',
  body: {
    symbol: 'AAPL.US',
    side: 'BUY',
    order_type: 'LIMIT',
    quantity: '2',
    price: '185.50',
    time_in_force: 'DAY',
  },
  data: signal,
  invoke: (client, idempotencyKey) =>
    client.trading.placeOrder({ ...order, idempotencyKey: idempotencyKey! }),
}
const modify: WriteCase = {
  name: 'modifyOrder',
  method: 'PATCH',
  path: '/openapi/v1/trading/orders/order%2Fone',
  body: { price: '185.50' },
  data: acknowledgement,
  invoke: (client, idempotencyKey) =>
    client.trading.modifyOrder({ orderId: 'order/one', price: '185.50', idempotencyKey }),
}
const cancel: WriteCase = {
  name: 'cancelOrder',
  method: 'DELETE',
  path: '/openapi/v1/trading/orders/order%2Fone',
  data: acknowledgement,
  invoke: (client, idempotencyKey) =>
    idempotencyKey === undefined
      ? client.trading.cancelOrder('order/one')
      : client.trading.cancelOrder('order/one', { idempotencyKey }),
}
const writes = [place, modify, cancel]
const optionalKeyWrites = [modify, cancel]

function response(data: unknown, status = 200, code = '0'): Response {
  return Response.json(
    { code, message: 'test response', data, request_id: 'idempotency-test', timestamp: 1 },
    { status },
  )
}

afterEach(() => vi.useRealTimers())

describe.each([
  {
    name: 'API key',
    credential: { apiKey: 'synthetic-api-key' },
    authorization: null,
    apiKey: 'synthetic-api-key',
  },
  {
    name: 'Bearer',
    credential: { bearerToken: 'synthetic-api-token' },
    authorization: 'Bearer synthetic-api-token',
    apiKey: null,
  },
])('$name trading writes', ({ credential, authorization, apiKey }) => {
  function clientWith(fetch: typeof globalThis.fetch): TqxClient {
    return new TqxClient({
      baseUrl: 'https://research.example.test/pandaApi',
      tradingBaseUrl: 'https://trading.example.test/pandaApi',
      ...credential,
      fetch,
    })
  }

  it.each(writes)(
    'maps $name with only its authentication and idempotency headers',
    async (write) => {
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(response(write.data))

      await expect(write.invoke(clientWith(fetch), key)).resolves.toEqual(write.data)

      expect(fetch).toHaveBeenCalledTimes(1)
      const [url, init] = fetch.mock.calls[0]!
      expect(String(url)).toBe(`https://trading.example.test${write.path}`)
      expect(init?.method).toBe(write.method)
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe(authorization)
      expect(headers.get('X-API-Key')).toBe(apiKey)
      expect(headers.get('Idempotency-Key')).toBe(key)
      if (write.body === undefined) {
        expect(init?.body).toBeUndefined()
        expect(headers.has('Content-Type')).toBe(false)
      } else {
        expect(JSON.parse(String(init?.body))).toEqual(write.body)
        expect(headers.get('Content-Type')).toBe('application/json')
      }
    },
  )

  it.each(writes)('retries $name using the same key, encoded URL, and body', async (write) => {
    vi.useFakeTimers()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new TypeError('synthetic disconnect'))
      .mockResolvedValueOnce(response(null, 503, 'service_unavailable'))
      .mockResolvedValueOnce(response(write.data))

    const pending = write.invoke(clientWith(fetch), key)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(fetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(200)
    await expect(pending).resolves.toEqual(write.data)

    expect(fetch).toHaveBeenCalledTimes(3)
    for (const [url, init] of fetch.mock.calls) {
      expect(String(url)).toBe(`https://trading.example.test${write.path}`)
      expect(init?.method).toBe(write.method)
      expect(init?.body).toBe(write.body === undefined ? undefined : JSON.stringify(write.body))
      const headers = new Headers(init?.headers)
      expect(headers.get('Idempotency-Key')).toBe(key)
      expect(headers.get('Authorization')).toBe(authorization)
      expect(headers.get('X-API-Key')).toBe(apiKey)
    }
  })

  it.each(writes)('preserves $name conflict errors without retrying', async (write) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ operation: write.name }, 409, 'idempotency_conflict'))
    const error = await write.invoke(clientWith(fetch), key).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TqxApiError)
    expect(error).toMatchObject({
      status: 409,
      code: 'idempotency_conflict',
      requestId: 'idempotency-test',
      data: { operation: write.name },
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each(optionalKeyWrites)('retains the legacy $name call without a key', async (write) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(response(write.data))

    await expect(write.invoke(clientWith(fetch))).resolves.toEqual(write.data)

    expect(fetch).toHaveBeenCalledTimes(1)
    const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers)
    expect(headers.has('Idempotency-Key')).toBe(false)
    expect(headers.get('Authorization')).toBe(authorization)
    expect(headers.get('X-API-Key')).toBe(apiKey)
  })

  it.each(optionalKeyWrites)('does not retry a disconnected legacy $name call', async (write) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError('disconnect'))

    await expect(write.invoke(clientWith(fetch))).rejects.toBeInstanceOf(TqxNetworkError)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each(optionalKeyWrites)('does not retry a legacy $name after HTTP 503', async (write) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(null, 503, 'service_unavailable'))

    await expect(write.invoke(clientWith(fetch))).rejects.toMatchObject({
      status: 503,
      code: 'service_unavailable',
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each(writes)('rejects invalid $name keys before fetching', async (write) => {
    const invalidKeys: unknown[] = [
      '',
      'short',
      'a'.repeat(129),
      '_leading',
      '-leading',
      'has space',
      'invalid/key',
      'line\r\nbreak',
      '\u4e2d'.repeat(8),
      null,
      123,
      {},
    ]
    const fetch = vi.fn<typeof globalThis.fetch>()
    const client = clientWith(fetch)

    await Promise.all(
      invalidKeys.map(async (invalidKey) => {
        const error = await Promise.resolve()
          .then(() => write.invoke(client, invalidKey as string))
          .catch((caught: unknown) => caught)
        expect(error).toBeInstanceOf(TqxValidationError)
        expect(error).toMatchObject({
          issues: expect.arrayContaining([
            expect.objectContaining({ path: [expect.objectContaining({ key: 'idempotencyKey' })] }),
          ]),
        })
      }),
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(writes)('accepts $name key boundaries and existing punctuation', async (write) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => response(write.data))
    const client = clientWith(fetch)
    const validKeys = ['A._:-000', 'a'.repeat(128)]

    await Promise.all(validKeys.map((validKey) => write.invoke(client, validKey)))

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(
      fetch.mock.calls.map(([, init]) => new Headers(init?.headers).get('Idempotency-Key')),
    ).toEqual(validKeys)
  })

  it('rejects invalid action inputs and cancel options without fetching', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    const client = clientWith(fetch)
    const calls = [
      () => client.trading.modifyOrder({ orderId: '', price: '1', idempotencyKey: key }),
      () => client.trading.modifyOrder({ orderId: 'order', price: '0', idempotencyKey: key }),
      () =>
        client.trading.modifyOrder({
          orderId: 'order',
          price: 1,
          idempotencyKey: key,
        } as unknown as ModifyOrderInput),
      () => client.trading.cancelOrder('', { idempotencyKey: key }),
      () => client.trading.cancelOrder('order', null as unknown as CancelOrderOptions),
      () => client.trading.cancelOrder('order', { unexpected: true } as CancelOrderOptions),
    ]
    await Promise.all(
      calls.map(async (call) => {
        const error = await Promise.resolve()
          .then(call)
          .catch((caught: unknown) => caught)
        expect(error).toBeInstanceOf(TqxValidationError)
      }),
    )
    expect(fetch).not.toHaveBeenCalled()
  })
})
