import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadConfig, supportedScopes } from '../src/config'
import { placeOrders } from '../src/trading'
import { fixture, rpcHeaders } from './fixture'
import { syntheticSignal, v2Fixture } from './v2-fixture'

const reads = [
  'getAccount',
  'listPositions',
  'listOrders',
  'getOrder',
  'listTrades',
  'listCashFlows',
  'getSignal',
]
const writes = ['placeOrder', 'modifyOrder', 'cancelOrder', 'placeOrders']
const scopeBoth = 'trade:read order:write'
const order = (key = 'stable-intent-001') => ({
  symbol: ' synthetic.us ',
  side: 'BUY',
  orderType: 'LIMIT',
  quantity: '9007199254740993',
  price: '10.123400',
  idempotencyKey: key,
})
const active: { close(): Promise<void> }[] = []
const setup = async (options: Parameters<typeof v2Fixture>[0] = {}) => {
  const f = await v2Fixture(options)
  active.push(f)
  return f
}
afterEach(async () => {
  await Promise.all(active.splice(0).map((f) => f.close()))
})
const rpc = async (
  f: Awaited<ReturnType<typeof v2Fixture>>,
  method: string,
  params: unknown,
  scope = scopeBoth,
) => {
  const response = await fetch(f.config.resource, {
    method: 'POST',
    headers: { ...rpcHeaders, Authorization: `Bearer ${await f.sign({ scope })}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  return { status: response.status, body: await response.json() }
}
const call = async (
  f: Awaited<ReturnType<typeof v2Fixture>>,
  name: string,
  args: unknown,
  scope = scopeBoth,
) => {
  const { body, status } = await rpc(f, 'tools/call', { name, arguments: args }, scope)
  const result = body.result as { isError?: boolean; content: { text: string }[] } | undefined
  let data: unknown
  try {
    data = result?.content[0] ? JSON.parse(result.content[0].text) : undefined
  } catch {
    data = undefined
  } // SDK-level missing-tool/input errors are intentionally plain text.
  return { status, body, isError: result?.isError, data: data as Record<string, any> }
}

describe('v2 scope and input contracts over synthetic HTTP', () => {
  it('keeps both flags default off, and write-only flag cannot enable tools', async () => {
    expect(loadConfig({})).toMatchObject({
      tradingToolsEnabled: false,
      tradingWriteToolsEnabled: false,
    })
    expect(() => loadConfig({ MCP_TRADING_WRITE_TOOLS_ENABLED: 'yes' })).toThrow()
    const config = loadConfig({ MCP_TRADING_WRITE_TOOLS_ENABLED: 'true' })
    expect(supportedScopes(config)).toEqual(['trade:read'])
    const f = await fixture({}, undefined, { MCP_TRADING_WRITE_TOOLS_ENABLED: 'true' })
    active.push(f)
    const response = await fetch(f.config.resource, {
      method: 'POST',
      headers: {
        ...rpcHeaders,
        Authorization: `Bearer ${await f.sign()}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect((await response.json()).result.tools).toEqual([])
  })
  it('lists 7/4/11 tools by scope and refuses cross-scope calls before Trading dispatch', async () => {
    const f = await setup()
    for (const [scope, names] of [
      ['trade:read', reads],
      ['order:write', writes],
      [scopeBoth, [...reads, ...writes]],
    ] as const) {
      const listed = await rpc(f, 'tools/list', {}, scope)
      expect(listed.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual(names)
      for (const tool of listed.body.result.tools) {
        expect(tool.annotations).toMatchObject({
          readOnlyHint: reads.includes(tool.name),
          destructiveHint: writes.includes(tool.name),
          idempotentHint: true,
          openWorldHint: true,
        })
      }
    }
    const before = f.state.exchange.length
    expect((await call(f, 'placeOrder', order(), 'trade:read')).isError).toBe(true)
    expect((await call(f, 'getAccount', {}, 'order:write')).isError).toBe(true)
    expect(f.v2.requests).toHaveLength(0)
    expect(f.state.exchange.length).toBe(before + 2)
    expect(f.state.exchange.at(-1)?.form.get('scope')).toBe('order:write')
    expect((await rpc(f, 'tools/list', {}, 'unrelated:scope')).status).toBe(403)
    expect(
      (await fetch(`${f.base}/.well-known/oauth-protected-resource/mcp`).then((r) => r.json()))
        .scopes_supported,
    ).toEqual(['trade:read', 'order:write'])
  })
  it('hides/rejects writes when write gate is off and requests only the enabled source scope', async () => {
    const f = await setup({ writesEnabled: false })
    const listed = await rpc(f, 'tools/list', {})
    expect(listed.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual(reads)
    expect(f.state.exchange.at(-1)?.form.get('scope')).toBe('trade:read')
    expect((await call(f, 'placeOrder', order())).isError).toBe(true)
    expect((await rpc(f, 'tools/list', {}, 'order:write')).status).toBe(403)
    expect(f.v2.requests).toHaveLength(0)
    expect(
      (await fetch(`${f.base}/.well-known/oauth-protected-resource/mcp`).then((r) => r.json()))
        .scopes_supported,
    ).toEqual(['trade:read'])
  })
  it('maps all seven reads through SDK paths/queries and preserves SDK data', async () => {
    const f = await setup()
    const inputs = [
      ['getAccount', { currency: 'USD' }],
      ['listPositions', { symbol: 'TEST.US', cursor: '' }],
      ['listOrders', { limit: 2, cursor: 'opaque +/=' }],
      ['getOrder', { orderId: 'order +/=' }],
      ['listTrades', { market: 'US', orderId: 'order +/=', cursor: '' }],
      ['listCashFlows', { startDate: '2026-01-01', endDate: '2026-10-23', currency: 'USD' }],
      ['getSignal', { signalId: 'signal +/=' }],
    ] as const
    const results = []
    for (const [name, args] of inputs) results.push(await call(f, name, args, 'trade:read'))
    expect(results.every((r) => !r.isError)).toBe(true)
    expect(results[0]?.data).toMatchObject({
      mode: 'PAPER',
      total_assets: '9007199254740993.12',
      cash: null,
      is_stale: true,
    })
    expect(results[3]?.data).toMatchObject({
      quantity: '9007199254740993',
      price_currency: null,
      status: 'PENDING',
    })
    expect(results[6]?.data.state).toBe('PENDING')
    expect(f.v2.requests[3]?.path).toBe('/openapi/v1/trading/orders/order%20%2B%2F%3D')
    const tradeUrl = new URL(f.v2.requests[4]!.path, f.tradingBase)
    expect(tradeUrl.searchParams.get('order_id')).toBe('order +/=')
    const cashUrl = new URL(f.v2.requests[5]!.path, f.tradingBase)
    expect(cashUrl.searchParams.get('start_date')).toBe('2026-01-01')
    expect(f.v2.requests[6]?.path).toBe('/openapi/v1/trading/signals/signal%20%2B%2F%3D')
    f.v2.unsupportedCashFlows = true
    const unsupported = await call(f, 'listCashFlows', {})
    expect(unsupported.data).toEqual({ error: 'cash_flows_unsupported' })
    expect(unsupported.isError).toBe(true)
  })
  it('requires stable keys and rejects every malformed batch before any write', async () => {
    const f = await setup()
    const { idempotencyKey: _key, ...withoutKey } = order()
    const cases = [
      ['placeOrder', withoutKey],
      ['modifyOrder', { orderId: 'a', price: '1' }],
      ['cancelOrder', { orderId: 'a' }],
      ['placeOrder', { ...order(), uid: 'other' }],
      ['placeOrder', { ...order(), quantity: 1 }],
      ['placeOrders', { orders: [] }],
      ['placeOrders', { orders: Array.from({ length: 21 }, (_, i) => order(`stable-key-${i}`)) }],
      ['placeOrders', { orders: [order(), order()] }],
      ['placeOrders', { orders: [order(), { ...order('invalid-key-2'), symbol: 'invalid' }] }],
      [
        'placeOrders',
        { orders: [order(), { ...order('invalid-key-2'), reason: 'x'.repeat(513) }] },
      ],
      ['placeOrders', { orders: [order(), { ...order('invalid-key-2'), orderType: 'MARKET' }] }],
      [
        'placeOrders',
        { orders: [order(), { ...order('invalid-key-2'), idempotencyKey: 'has space' }] },
      ],
      ['placeOrders', { orders: [order(), { ...order('invalid-key-2'), quantity: '0' }] }],
    ] as const
    for (const [name, args] of cases) expect((await call(f, name, args)).isError).toBe(true)
    expect(f.v2.requests).toHaveLength(0)
    expect(f.v2.effects).toBe(0)
    // Direct helper also validates SDK inputs without relying on the public Zod schema.
    const local = await placeOrders(
      {
        config: f.config,
        access: { token: 'synthetic', scopes: ['order:write'], expiresAt: Infinity },
        signal: new AbortController().signal,
      },
      new AbortController().signal,
      [order() as never, { ...order('invalid-key-2'), symbol: 'invalid' } as never],
    )
    expect(local.isError).toBe(true)
    expect(f.v2.requests).toHaveLength(0)
  })
})

describe('v2 writes, sequential batches and uncertainty', () => {
  it('maps single writes to SDK headers/body and preserves signal versus operation acceptance', async () => {
    const f = await setup()
    const placed = await call(f, 'placeOrder', order(), 'order:write')
    expect(placed.data).toMatchObject({
      status: 'accepted',
      idempotencyKey: 'stable-intent-001',
      request_id: 'synthetic-http-1',
      data: {
        state: 'ACCEPTED',
        order_id: null,
        parent_request_id: 'synthetic-parent-not-http-id',
      },
    })
    expect(f.v2.requests[0]).toMatchObject({
      method: 'POST',
      key: 'stable-intent-001',
      body: {
        symbol: 'SYNTHETIC.US',
        quantity: '9007199254740993',
        price: '10.123400',
        order_type: 'LIMIT',
        time_in_force: 'DAY',
      },
    })
    expect((f.v2.requests[0]!.body as Record<string, unknown>).idempotencyKey).toBeUndefined()
    const modify = await call(
      f,
      'modifyOrder',
      { orderId: 'order +/=', price: '2.00', idempotencyKey: 'stable-modify-001' },
      'order:write',
    )
    expect(modify.data.status).toBe('accepted')
    expect(f.v2.requests[1]).toMatchObject({
      method: 'PATCH',
      path: '/openapi/v1/trading/orders/order%20%2B%2F%3D',
      body: { price: '2.00' },
      key: 'stable-modify-001',
    })
    expect(
      (
        await call(
          f,
          'cancelOrder',
          { orderId: 'order +/=', idempotencyKey: 'stable-cancel-001' },
          'order:write',
        )
      ).data.status,
    ).toBe('accepted')
    expect(f.v2.requests[2]).toMatchObject({
      method: 'DELETE',
      body: null,
      key: 'stable-cancel-001',
    })
  })
  it.each([
    { accepted: false },
    { accepted: false, status: 'UNKNOWN' },
    { accepted: true, status: 'UNKNOWN' },
  ])('keeps uncertain action acknowledgements unknown: %j', async (data) => {
    const f = await setup()
    f.v2.actionData = { order_id: 'synthetic-order', ...data }
    const result = await call(f, 'cancelOrder', {
      orderId: 'x',
      idempotencyKey: 'stable-cancel-001',
    })
    expect(result.data.status).toBe('unknown')
    expect(result.isError).toBe(true)
  })
  it('prevalidates and submits sequentially, preserves response IDs, and replays identical stable keys', async () => {
    const f = await setup()
    const orders = [order('stable-key-001'), order('stable-key-002'), order('stable-key-003')]
    f.v2.plans.push({ waitMs: 20 }, { waitMs: 20 })
    const result = await call(f, 'placeOrders', { orders })
    expect(result.data.stopped).toBe(false)
    expect(result.data.results.map((r: { status: string }) => r.status)).toEqual([
      'accepted',
      'accepted',
      'accepted',
    ])
    expect(result.data.results.map((r: { request_id: string }) => r.request_id)).toEqual([
      'synthetic-http-1',
      'synthetic-http-2',
      'synthetic-http-3',
    ])
    expect(f.v2.events).toEqual(
      orders.flatMap((o) => [`start:${o.idempotencyKey}`, `end:${o.idempotencyKey}`]),
    )
    expect(f.v2.effects).toBe(3)
    expect((await call(f, 'placeOrders', { orders })).data.stopped).toBe(false)
    expect(f.v2.effects).toBe(3)
    expect(f.v2.requests.every((r) => r.scope === scopeBoth && r.agent === 'synthetic-agent')).toBe(
      true,
    )
    const conflict = await call(f, 'placeOrders', {
      orders: [{ ...orders[0], price: '11.00' }, order('unsubmitted-key-004')],
    })
    expect(conflict.data.results[0]).toMatchObject({
      status: 'failed',
      error: 'idempotency_conflict',
    })
    expect(conflict.data.results[1].status).toBe('not_submitted')
    expect(f.v2.effects).toBe(3)
    expect(JSON.stringify(conflict.data)).not.toContain('synthetic private')
  })
  it.each([
    [401, 'authorization_required'],
    [403, 'permission_denied'],
    [429, 'rate_limit_exceeded'],
    [422, 'trading_request_rejected'],
  ] as const)('stops at item 2 on definite HTTP %i', async (status, error) => {
    const f = await setup()
    f.v2.plans.push({}, { status })
    const result = await call(f, 'placeOrders', {
      orders: [order('stable-key-001'), order('stable-key-002'), order('stable-key-003')],
    })
    expect(result.data.results.map((r: { status: string }) => r.status)).toEqual([
      'accepted',
      'failed',
      'not_submitted',
    ])
    expect(result.data.results[1]).toMatchObject({ error, request_id: 'synthetic-http-2' })
    expect(result.isError).toBe(true)
    expect(f.v2.requests).toHaveLength(2)
    expect(f.v2.effects).toBe(1)
  })
  it.each(['UNKNOWN', 'REJECTED'] as const)(
    'stops on resolved signal state %s rather than assuming success',
    async (state) => {
      const f = await setup()
      f.v2.plans.push({}, { data: syntheticSignal(state) })
      const result = await call(f, 'placeOrders', {
        orders: [order('stable-key-001'), order('stable-key-002'), order('stable-key-003')],
      })
      expect(result.data.results.map((r: { status: string }) => r.status)).toEqual([
        'accepted',
        state === 'UNKNOWN' ? 'unknown' : 'failed',
        'not_submitted',
      ])
      expect(f.v2.requests).toHaveLength(2)
    },
  )
  it('marks lost committed writes followed by SDK retry/401 unknown and never submits the next item', async () => {
    const f = await setup()
    f.v2.plans.push({}, { disconnect: true, revokeAfter: true })
    const result = await call(f, 'placeOrders', {
      orders: [order('stable-key-001'), order('stable-key-002'), order('stable-key-003')],
    })
    expect(result.data.results.map((r: { status: string }) => r.status)).toEqual([
      'accepted',
      'unknown',
      'not_submitted',
    ])
    expect(result.data.results[1].error).toBe('authorization_required')
    expect(f.v2.effects).toBe(2)
    expect(f.v2.requests.map((r) => r.key)).toEqual([
      'stable-key-001',
      'stable-key-002',
      'stable-key-002',
    ])
  })
  it('retains SDK retries with the same key, and adds no MCP retry after terminal 503', async () => {
    const f = await setup()
    f.v2.plans.push(
      ...Array.from({ length: 3 }, () => ({ status: 503, code: 'trading_service_unavailable' })),
    )
    const result = await call(f, 'placeOrders', {
      orders: [order('stable-key-001'), order('stable-key-002')],
    })
    expect(result.data.results.map((r: { status: string }) => r.status)).toEqual([
      'unknown',
      'not_submitted',
    ])
    expect(f.v2.requests.map((r) => r.key)).toEqual([
      'stable-key-001',
      'stable-key-001',
      'stable-key-001',
    ])
    expect(f.v2.effects).toBe(0)
  })
  it.each([{ hold: true }, { invalidJson: true }])(
    'stops with unknown for timeout or malformed response: %j',
    async (plan) => {
      const f = await setup({ tradingTimeoutMs: 75 })
      f.v2.plans.push(plan)
      const result = await call(f, 'placeOrders', {
        orders: [order('stable-key-001'), order('stable-key-002')],
      })
      expect(result.data.results.map((r: { status: string }) => r.status)).toEqual([
        'unknown',
        'not_submitted',
      ])
      expect(f.v2.requests.every((r) => r.key === 'stable-key-001')).toBe(true)
      await vi.waitFor(() => expect(f.state.activeTrading).toBe(0))
    },
  )
  it('checks expiry again for every batch item rather than caching an authorization conclusion', async () => {
    const f = await setup()
    const expiresAt = Math.floor(Date.now() / 1000) + 60
    const access = { token: await f.sign({ scope: scopeBoth }), scopes: ['order:write'], expiresAt }
    const now = vi.spyOn(Date, 'now')
    // Advance the clock when the second SDK transport attempts to send; first item can complete.
    let calls = 0
    const original = globalThis.fetch
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (...args) => {
      const response = await original(...args)
      if (++calls === 1) now.mockReturnValue(expiresAt * 1000)
      return response
    })
    try {
      const result = await placeOrders(
        { config: f.config, access, signal: new AbortController().signal },
        new AbortController().signal,
        [order('stable-key-001'), order('stable-key-002')] as never,
      )
      const data = JSON.parse((result.content[0] as { text: string }).text)
      expect(data.results.map((r: { status: string }) => r.status)).toEqual(['accepted', 'failed'])
      expect(data.results[1].error).toBe('authorization_required')
      expect(f.v2.requests).toHaveLength(1)
    } finally {
      fetchSpy.mockRestore()
      now.mockRestore()
    }
  })
  it.each([
    [409, 'trading_operation_pending'],
    [409, 'trading_outcome_unknown'],
    [503, 'trading_operation_pending'],
    [503, 'trading_outcome_unknown'],
  ] as const)(
    'keeps a fresh HTTP replay of stored uncertainty unknown: %i %s',
    async (status, code) => {
      const f = await setup()
      const data = {
        status: 'UNKNOWN',
        operation: 'PLACE_ORDER',
        signal_id: 'original-signal',
        request_id: 'original-request',
        token: 'private-token',
        message: 'private-message',
      }
      f.v2.plans.push(
        ...Array.from({ length: status === 503 ? 3 : 1 }, () => ({ status, code, data })),
      )
      const result = await call(f, 'placeOrders', {
        orders: [order('stable-key-001'), order('stable-key-002')],
      })
      expect(result.data.results[0]).toMatchObject({
        status: 'unknown',
        error: code,
        data: {
          status: 'UNKNOWN',
          operation: 'PLACE_ORDER',
          signal_id: 'original-signal',
          request_id: 'original-request',
        },
      })
      expect(result.data.results[1].status).toBe('not_submitted')
      expect(f.v2.effects).toBe(0)
      expect(JSON.stringify(result.data)).not.toMatch(/private-token|private-message/)
    },
  )
  it('preserves timeout signal reconciliation fields and rejects arbitrary error objects', async () => {
    const f = await setup()
    const data = {
      state: 'UNKNOWN',
      signal_id: 'original-timeout-signal',
      operation: { toString: 'private-object' },
      action_id: 'bad\nidentifier',
      token: 'private-token',
    }
    f.v2.plans.push(
      ...Array.from({ length: 3 }, () => ({ status: 504, code: 'trading_timeout', data })),
    )
    const result = await call(f, 'placeOrder', order())
    expect(result.data).toMatchObject({
      status: 'unknown',
      error: 'trading_timeout',
      data: { state: 'UNKNOWN', signal_id: 'original-timeout-signal' },
    })
    expect(JSON.stringify(result.data)).not.toMatch(/private-object|bad\\nidentifier|private-token/)
  })
  it.each([
    { accepted: true, status: 'SUBMITTED', expected: 'accepted' },
    { accepted: false, status: 'REJECTED', expected: 'failed' },
    { accepted: true, status: 'FUTURE_UNKNOWN_STATUS', expected: 'unknown' },
  ])('uses explicit action state conservatively: %j', async ({ expected, ...data }) => {
    const f = await setup()
    f.v2.actionData = { order_id: 'synthetic-order', ...data }
    const result = await call(f, 'modifyOrder', {
      orderId: 'x',
      price: '1.00',
      idempotencyKey: 'stable-modify-001',
    })
    expect(result.data.status).toBe(expected)
    expect(result.isError === true).toBe(expected !== 'accepted')
  })
  it('accepts the maximum 20 items without truncating or introducing parallel dispatch', async () => {
    const f = await setup()
    const orders = Array.from({ length: 20 }, (_, index) => order(`stable-key-${index}`))
    const result = await call(f, 'placeOrders', { orders })
    expect(result.isError).not.toBe(true)
    expect(result.data.results).toHaveLength(20)
    expect(result.data.results.at(-1)).toMatchObject({ index: 19, status: 'accepted' })
    expect(f.v2.requests).toHaveLength(20)
    expect(f.v2.effects).toBe(20)
  })
  it('does not reuse a prior attempt response ID after an SDK retry', async () => {
    const f = await setup()
    f.v2.plans.push({ status: 503 }, {})
    const result = await call(f, 'placeOrder', order())
    expect(result.data).toMatchObject({ status: 'accepted', request_id: 'synthetic-http-2' })
    expect(f.v2.requests.map((r) => r.key)).toEqual(['stable-intent-001', 'stable-intent-001'])
  })
  it.each(['bad\ncorrelation', 'x'.repeat(257)])(
    'drops unsafe correlation IDs without changing successful SDK data',
    async (requestId) => {
      const f = await setup()
      f.v2.plans.push({ requestId })
      const result = await call(f, 'placeOrder', order())
      expect(result.data).toMatchObject({
        status: 'accepted',
        request_id: null,
        data: { state: 'ACCEPTED' },
      })
    },
  )
  it('cancels an in-flight batch write as unknown and leaves all later items unsubmitted', async () => {
    const f = await setup({ tradingTimeoutMs: 30_000 })
    f.v2.plans.push({}, { hold: true })
    const caller = new AbortController()
    const pending = placeOrders(
      {
        config: f.config,
        access: {
          token: await f.sign({ scope: 'order:write' }),
          expiresAt: Math.floor(Date.now() / 1000) + 60,
          scopes: ['order:write'],
        },
        signal: new AbortController().signal,
      },
      caller.signal,
      [order('stable-key-001'), order('stable-key-002'), order('stable-key-003')] as never,
    )
    await vi.waitFor(() => expect(f.v2.requests).toHaveLength(2))
    caller.abort()
    const result = await pending
    const data = JSON.parse((result.content[0] as { text: string }).text)
    expect(data.results.map((r: { status: string }) => r.status)).toEqual([
      'accepted',
      'unknown',
      'not_submitted',
    ])
    expect(f.v2.requests).toHaveLength(2)
    await vi.waitFor(() => expect(f.state.activeTrading).toBe(0))
  })
  it('cleans actual HTTP/protocol resources when a batch client disconnects', async () => {
    const f = await setup({ tradingTimeoutMs: 30_000 })
    f.v2.plans.push({ hold: true })
    const disconnected = new AbortController()
    const pending = fetch(f.config.resource, {
      method: 'POST',
      signal: disconnected.signal,
      headers: { ...rpcHeaders, Authorization: `Bearer ${await f.sign({ scope: 'order:write' })}` },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'placeOrders',
          arguments: { orders: [order('stable-key-001'), order('stable-key-002')] },
        },
      }),
    }).catch(() => undefined)
    await vi.waitFor(() => expect(f.state.activeTrading).toBe(1))
    disconnected.abort()
    await pending
    await vi.waitFor(() => {
      expect(f.state.activeTrading).toBe(0)
      expect(f.service.application.activeRequestCount).toBe(0)
    })
    expect(f.v2.requests).toHaveLength(1)
  })
  it('keeps concurrent write identities and request-local exchanged tokens isolated', async () => {
    const f = await setup()
    const intents = ['agent-a', 'agent-b']
    const responses = await Promise.all(
      intents.map(async (agent) => {
        const token = await f.sign({
          scope: 'order:write',
          sub: `user-${agent}`,
          sid: `sid-${agent}`,
          agent_id: agent,
          grant_id: `grant-${agent}`,
        })
        return fetch(f.config.resource, {
          method: 'POST',
          headers: { ...rpcHeaders, Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'placeOrder', arguments: order(`stable-${agent}`) },
          }),
        }).then((r) => r.json())
      }),
    )
    expect(responses.every((r) => !r.result.isError)).toBe(true)
    expect(f.v2.requests.map((r) => r.agent).toSorted()).toEqual(intents)
    expect(new Set(f.state.trading.map((r) => r.token)).size).toBe(2)
    expect(f.v2.requests.every((r) => r.scope === 'order:write')).toBe(true)
  })
})
