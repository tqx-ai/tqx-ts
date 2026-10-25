import { describe, expect, it, vi } from 'vitest'

import {
  TqxClient,
  TqxValidationError,
  type OrdersOptions,
  type PaginationOptions,
} from '../src/index'

function response(): Response {
  return Response.json({
    code: '0',
    message: 'ok',
    data: { items: [], next_cursor: null },
    request_id: 'read-filters',
    timestamp: 1,
  })
}

describe('current active-order filters', () => {
  it.each([{ apiKey: 'synthetic-key' }, { bearerToken: 'synthetic-token' }])(
    'maps optional filters with the existing authentication: %j',
    async (credential) => {
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response())
      const client = new TqxClient({
        baseUrl: 'https://api.example.test/pandaApi',
        tradingBaseUrl: 'https://trading.example.test',
        runtimeEnvironment: {},
        ...credential,
        fetch,
      })
      await expect(
        client.trading.listOrders({
          startDate: '2026-10-01',
          endDate: '2026-10-25',
          status: ' submitted ',
          symbol: ' 0700.hk ',
          limit: 2,
          cursor: 'opaque+/=&',
        }),
      ).resolves.toEqual({ items: [], next_cursor: null })
      expect(fetch).toHaveBeenCalledTimes(1)
      const [input, init] = fetch.mock.calls[0]!
      const url = new URL(String(input))
      expect(url.origin + url.pathname).toBe(
        'https://trading.example.test/openapi/v1/trading/orders',
      )
      expect(Object.fromEntries(url.searchParams)).toEqual({
        start_date: '2026-10-01',
        end_date: '2026-10-25',
        status: 'SUBMITTED',
        symbol: ' 0700.hk ',
        limit: '2',
        cursor: 'opaque+/=&',
      })
      expect(init?.method).toBe('GET')
      expect(init?.body).toBeUndefined()
      const headers = new Headers(init?.headers)
      expect(headers.get('X-API-Key')).toBe(credential.apiKey ?? null)
      expect(headers.get('Authorization')).toBe(
        credential.bearerToken ? 'Bearer synthetic-token' : null,
      )
    },
  )

  it('preserves omitted filters and the existing PaginationOptions input', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => response())
    const client = new TqxClient({
      baseUrl: 'https://api.example.test',
      runtimeEnvironment: {},
      apiKey: 'key',
      fetch,
    })
    const legacy: PaginationOptions = { limit: 3, cursor: 'legacy-cursor' }
    await client.trading.listOrders()
    await client.trading.listOrders(legacy)
    expect(new URL(String(fetch.mock.calls[0]?.[0])).search).toBe('')
    expect(Object.fromEntries(new URL(String(fetch.mock.calls[1]?.[0])).searchParams)).toEqual({
      limit: '3',
      cursor: 'legacy-cursor',
    })
  })

  it('passes unknown status strings to the server without an enum prerequisite', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response())
    const client = new TqxClient({
      baseUrl: 'https://api.example.test',
      runtimeEnvironment: {},
      apiKey: 'key',
      fetch,
    })
    await expect(client.trading.listOrders({ status: ' future_status ' })).resolves.toEqual({
      items: [],
      next_cursor: null,
    })
    expect(new URL(String(fetch.mock.calls[0]?.[0])).searchParams.get('status')).toBe(
      'FUTURE_STATUS',
    )
  })

  it.each([{ startDate: '2026/10/01' }, { endDate: '20261025' }, { status: 123 }])(
    'rejects malformed filter input before fetching: %j',
    async (options) => {
      const fetch = vi.fn<typeof globalThis.fetch>()
      const client = new TqxClient({
        baseUrl: 'https://api.example.test',
        runtimeEnvironment: {},
        apiKey: 'key',
        fetch,
      })
      await expect(
        client.trading.listOrders(options as unknown as OrdersOptions),
      ).rejects.toBeInstanceOf(TqxValidationError)
      expect(fetch).not.toHaveBeenCalled()
    },
  )
})
