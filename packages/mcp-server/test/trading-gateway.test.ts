import { describe, expect, it, vi } from 'vitest'

import { ApiTokenProvider } from '../src/auth/api-token-provider'
import type { TokenExchange } from '../src/auth/token-exchange'
import { publicError } from '../src/trading/errors'
import { TradingGateway } from '../src/trading/gateway'
import { account, auth, envelope, hold, order, signal, tradingConfig } from './helpers/trading'

function setup(
  options: { maxPerPrincipal?: number; maxConcurrent?: number; timeoutMs?: number } = {},
) {
  let sequence = 0
  const exchange = vi.fn<TokenExchange>(async (input) => ({
    token: `api-${++sequence}`,
    scopes: input.scopes,
    expiresAt: Date.now() + 300_000,
  }))
  const tokens = new ApiTokenProvider('https://auth.example.test', tradingConfig.resource, exchange)
  const fetch = vi.fn<typeof globalThis.fetch>(async () => envelope(account))
  const audit = vi.fn()
  const gateway = new TradingGateway(tradingConfig.baseUrl, tokens, { fetch, audit, ...options })
  return { gateway, fetch, exchange, audit }
}

describe('independent trading gateway', () => {
  it.each([
    [409, 'insufficient_funds', 'REJECTED'],
    [422, 'invalid_lot_size', 'REJECTED'],
    [504, 'trading_timeout', 'UNKNOWN'],
  ])(
    'retains projected signal diagnostics and audit IDs on HTTP %i',
    async (status, code, state) => {
      const s = setup()
      const diagnostic = {
        ...signal,
        state,
        symbol: 'AAPL.US',
        currency: 'USD',
        shortfall: '100',
        available_quantity: '2',
        excess_quantity: '8',
        short_selling_allowed: false,
      }
      s.fetch.mockResolvedValue(
        Response.json(
          {
            code,
            data: { ...diagnostic, private_debug: 'raw-secret' },
            message: 'raw-secret',
            request_id: 'rejected-request',
          },
          { status },
        ),
      )
      const error = await s.gateway
        .call(auth(), 'place', { idempotencyKey: 'intent-123' })
        .catch((e: unknown) => publicError(e))
      expect(error).toEqual({
        kind: 'api',
        message: `Trading API rejected operation (${code})`,
        code,
        status,
        requestId: 'rejected-request',
        outcomeUnknown: status === 504,
        signal: diagnostic,
      })
      expect(JSON.stringify(error)).not.toContain('raw-secret')
      expect(s.fetch).toHaveBeenCalledTimes(1)
      expect(s.exchange).toHaveBeenCalledTimes(1)
      expect(s.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          result: 'error',
          operation: 'place',
          code,
          signalId: signal.signal_id,
          orderId: signal.order_id,
          requestId: 'rejected-request',
          idempotencyKey: 'intent-123',
        }),
      )
      expect(JSON.stringify(s.audit.mock.calls)).not.toContain('raw-secret')
    },
  )

  it.each([
    { ...signal, state: 'INVALID' },
    { ...signal, available_cash: 900 },
    { signal_id: 'signal-123' },
    null,
  ])('omits malformed signal diagnostics without losing the API failure', async (data) => {
    const s = setup()
    s.fetch.mockResolvedValue(envelope(data, 409, 'insufficient_funds'))
    const error = await s.gateway.call(auth(), 'place').catch((e: unknown) => publicError(e))
    expect(error).toMatchObject({ kind: 'api', status: 409, code: 'insufficient_funds' })
    expect(error).not.toHaveProperty('signal')
    expect(s.audit).toHaveBeenCalledWith(
      expect.objectContaining({ signalId: undefined, result: 'error' }),
    )
    expect(s.fetch).toHaveBeenCalledTimes(1)
  })

  it.each(['400', '401', '403', '500'])('preserves numeric public error code %s', async (code) => {
    const s = setup()
    s.fetch.mockImplementation(async () => envelope(null, Number(code), code))
    await expect(s.gateway.call(auth(), 'place')).rejects.toMatchObject({
      details: { status: Number(code), code },
    })
  })

  it.each(['invalid\ncode', 'x'.repeat(82), '<unsafe>'])(
    'filters unsafe error code %j',
    async (code) => {
      const s = setup()
      s.fetch.mockResolvedValue(envelope(null, 422, code))
      await expect(s.gateway.call(auth(), 'place')).rejects.toMatchObject({
        details: { code: 'upstream_error' },
      })
    },
  )

  it('keeps original and replacement order IDs in modify audit', async () => {
    const s = setup()
    s.fetch.mockResolvedValue(
      envelope(
        {
          order_id: 'order-1',
          new_order_id: 'order-2',
          accepted: true,
          action_id: 'action-123',
          status: 'SUBMITTED',
        },
        202,
      ),
    )
    await s.gateway.call(auth(), 'modify', { id: 'order-1', body: { price: '101' } })
    expect(s.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'modify',
        result: 'success',
        orderId: 'order-1',
        newOrderId: 'order-2',
      }),
    )
  })

  it.each([
    ['account', 'GET', 'account', 'trade:read', account],
    ['positions', 'GET', 'positions', 'trade:read', { items: [] }],
    ['orders', 'GET', 'orders', 'trade:read', { items: [] }],
    ['trades', 'GET', 'trades', 'trade:read', { items: [] }],
    ['cashFlows', 'GET', 'cash-flows', 'trade:read', { items: [] }],
    ['order', 'GET', 'orders/order-1', 'trade:read', order],
    ['signal', 'GET', 'signals/signal-123', 'order:write', signal],
    ['place', 'POST', 'orders', 'order:write', signal],
    [
      'modify',
      'PATCH',
      'orders/order-1',
      'order:write',
      {
        order_id: 'order-1',
        new_order_id: 'order-2',
        accepted: true,
        action_id: 'action-123',
        status: 'SUBMITTED',
      },
    ],
    [
      'cancel',
      'DELETE',
      'orders/order-1',
      'order:write',
      {
        order_id: 'order-1',
        accepted: true,
        action_id: 'action-123',
        status: 'SUBMITTED',
      },
    ],
    ['hold', 'POST', 'hold', 'trade:read', hold],
  ] as const)(
    'matches public %s method, path, scope and credential contract',
    async (name, method, path, scope, data) => {
      const s = setup()
      s.fetch.mockImplementation(async () => envelope(data))
      const principal = { ...auth(), scopes: [scope] }
      const request =
        name === 'signal'
          ? { id: 'signal-123' }
          : ['order', 'modify', 'cancel'].includes(name)
            ? { id: 'order-1' }
            : {}
      await s.gateway.call(principal, name, request)
      expect(s.exchange).toHaveBeenCalledWith(
        expect.objectContaining({ scopes: [scope], resource: tradingConfig.resource }),
      )
      const [url, init] = s.fetch.mock.calls[0]!
      expect(String(url)).toBe(`${tradingConfig.baseUrl}/openapi/v1/trading/${path}`)
      expect(init!.method).toBe(method)
      expect(Object.fromEntries(new Headers(init!.headers))).toEqual({
        accept: 'application/json',
        authorization: 'Bearer api-1',
      })
    },
  )

  it('always exchanges signal read tokens without caching order:write capabilities', async () => {
    const s = setup()
    s.fetch.mockImplementation(async () => envelope(signal))
    const principal = { ...auth(), scopes: ['order:write'] }
    await Promise.all([
      s.gateway.call(principal, 'signal', { id: 'signal-123' }),
      s.gateway.call(principal, 'signal', { id: 'signal-123' }),
    ])
    await s.gateway.call(principal, 'signal', { id: 'signal-123' })
    expect(s.exchange).toHaveBeenCalledTimes(3)
  })

  it('accepts a nullable API request ID and retains the header fallback', async () => {
    const s = setup()
    s.fetch.mockResolvedValue(
      Response.json(
        { code: '0', data: account, request_id: null },
        { headers: { 'X-Request-ID': 'header-request' } },
      ),
    )
    expect(await s.gateway.call(auth(), 'account')).toEqual(account)
  })

  it('refreshes a rejected read token once, using only the new derived token', async () => {
    const s = setup()
    s.fetch.mockResolvedValueOnce(envelope(null, 401, 'invalid_token'))
    expect(await s.gateway.call(auth(), 'account')).toEqual(account)
    expect(s.exchange).toHaveBeenCalledTimes(2)
    expect(
      s.fetch.mock.calls.map(([, init]) => new Headers(init!.headers).get('Authorization')),
    ).toEqual(['Bearer api-1', 'Bearer api-2'])
  })

  it('stops after a second 401 and never refreshes for 403', async () => {
    const s = setup()
    s.fetch.mockImplementation(async () => envelope(null, 401, 'invalid_token'))
    await expect(s.gateway.call(auth(), 'account')).rejects.toMatchObject({
      details: { status: 401 },
    })
    expect(s.fetch).toHaveBeenCalledTimes(2)
    s.fetch.mockImplementation(async () => envelope(null, 403, 'insufficient_scope'))
    await expect(s.gateway.call(auth(), 'account')).rejects.toMatchObject({
      details: { status: 403 },
    })
    expect(s.fetch).toHaveBeenCalledTimes(3)
    expect(s.exchange).toHaveBeenCalledTimes(3)
  })

  it.each(['place', 'modify', 'cancel', 'hold'] as const)(
    'never retries or caches %s, including on 401',
    async (name) => {
      const s = setup()
      s.fetch.mockResolvedValue(envelope(null, 401, 'invalid_token'))
      await expect(s.gateway.call(auth(), name, { id: 'order-1' })).rejects.toMatchObject({
        details: { status: 401 },
      })
      expect(s.exchange).toHaveBeenCalledTimes(1)
      expect(s.fetch).toHaveBeenCalledTimes(1)
      expect(s.audit).toHaveBeenCalledWith(
        expect.objectContaining({ operation: name, result: 'error' }),
      )
    },
  )

  it('reports unknown write outcomes after a transport timeout without repeating the write', async () => {
    const s = setup({ timeoutMs: 5 })
    s.fetch.mockImplementation(
      async (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(new Error('credentials')), {
            once: true,
          })
        }),
    )
    await expect(s.gateway.call(auth(), 'cancel', { id: 'order-1' })).rejects.toMatchObject({
      kind: 'network',
      details: { outcomeUnknown: true },
    })
    expect(s.fetch).toHaveBeenCalledTimes(1)
  })

  it.each([
    new Response('html secret', { headers: { 'Content-Type': 'text/html' } }),
    Response.json({ data: account }),
    envelope({ ...account, total_assets: 123 }),
    Response.json({ code: '0', data: {} }, { headers: { 'Content-Length': '2000000' } }),
  ])('rejects invalid payloads without exposing raw data', async (response) => {
    const s = setup()
    s.fetch.mockResolvedValue(response)
    await expect(s.gateway.call(auth(), 'account')).rejects.toMatchObject({ kind: 'protocol' })
  })

  it('bounds per-principal concurrency and releases slots after completion', async () => {
    const s = setup({ maxPerPrincipal: 1 })
    let finish!: (response: Response) => void
    s.fetch.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const pending = s.gateway.call(auth(), 'account')
    await vi.waitFor(() => expect(s.fetch).toHaveBeenCalledTimes(1))
    await expect(s.gateway.call(auth(), 'account')).rejects.toMatchObject({ kind: 'busy' })
    finish(envelope(account))
    await pending
    await s.gateway.call(auth(), 'account')
    expect(s.fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps concurrent principals and their downstream tokens separate', async () => {
    const s = setup()
    const alice = auth()
    const bob = { ...auth(), token: 'bob-mcp', extra: { sub: 'bob', agent_id: 'bob-agent' } }
    await Promise.all([s.gateway.call(alice, 'account'), s.gateway.call(bob, 'account')])
    expect(s.exchange.mock.calls.map(([input]) => input.subjectToken).toSorted()).toEqual([
      'bob-mcp',
      'incoming-mcp-token',
    ])
    expect(
      new Set(s.fetch.mock.calls.map(([, init]) => new Headers(init!.headers).get('Authorization')))
        .size,
    ).toBe(2)
  })

  it.each(['.', '..', ''])(
    'rejects unsafe path identifier %j before requesting a token',
    async (id) => {
      const s = setup()
      await expect(s.gateway.call(auth(), 'order', { id })).rejects.toMatchObject({
        kind: 'validation',
      })
      expect(s.exchange).not.toHaveBeenCalled()
    },
  )
})
