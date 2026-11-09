import { describe, expect, it, vi } from 'vitest'

import { createApp } from '../src/app'
import { createOAuthFixture, testConfig } from './helpers/oauth'
import { account, bugReport, envelope, hold, order, signal, tradingConfig } from './helpers/trading'

const oauth = await createOAuthFixture()
const mcpToken = await oauth.sign({ scope: 'trade:read order:write', agent_id: 'agent-1' })
const readToken = await oauth.sign({ scope: 'trade:read', agent_id: 'agent-1' })
const writeToken = await oauth.sign({ scope: 'order:write', agent_id: 'agent-1' })
const rankingToken = await oauth.sign({ scope: 'ranking:read' })
const researchToken = await oauth.sign({ scope: 'research:read' })

function setup() {
  let next: Response | undefined
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
    if (next) {
      const response = next
      next = undefined
      return response
    }
    const pathname = new URL(String(url)).pathname
    if (pathname.endsWith('/account')) return envelope(account)
    if (pathname.endsWith('/hold')) return envelope(hold)
    if (pathname.endsWith('/bug-reports')) return envelope(bugReport, 201)
    if (pathname.endsWith('/orders/order-1')) return envelope(order)
    if (pathname.includes('/signals/')) return envelope(signal)
    if (pathname.endsWith('/orders')) return envelope({ items: [], next_cursor: 'opaque+/=' })
    return envelope({ items: [], next_cursor: null })
  })
  const exchange = vi.fn(async (input: { scopes: readonly string[] }) => ({
    token: 'exchanged-api-token',
    scopes: input.scopes,
    expiresAt: Date.now() + 300_000,
  }))
  const audit = vi.fn()
  const app = createApp({
    config: testConfig,
    fetch: oauth.fetch,
    tradingConfig,
    trading: { fetch, exchange, audit },
    demoPing: false,
  })
  async function call(name: string, request: unknown, token = mcpToken, version = '2026-07-28') {
    const response = await rpc('tools/call', { name, arguments: { request } }, token, version)
    const body = await parse(response)
    return { response, body }
  }
  function rpc(
    method: string,
    params: Record<string, unknown> = {},
    token = mcpToken,
    version = '2026-07-28',
  ) {
    return app.request('http://127.0.0.1/mcp', {
      method: 'POST',
      headers: {
        Host: '127.0.0.1',
        Authorization: `Bearer ${token}`,
        Origin: 'http://localhost:6274',
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': version,
        ...(version === '2026-07-28'
          ? {
              'Mcp-Method': method,
              ...(typeof params.name === 'string' ? { 'Mcp-Name': params.name } : {}),
            }
          : {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params: {
          ...params,
          ...(version === '2026-07-28'
            ? {
                _meta: {
                  'io.modelcontextprotocol/protocolVersion': version,
                  'io.modelcontextprotocol/clientCapabilities': {},
                },
              }
            : {}),
        },
      }),
    })
  }
  return {
    call,
    rpc,
    fetch,
    exchange,
    audit,
    reply: (response: Response) => {
      next = response
    },
  }
}

async function parse(response: Response) {
  const text = await response.text()
  const body = response.headers.get('Content-Type')?.includes('text/event-stream')
    ? text
        .split(/\r?\n/)
        .filter((x) => x.startsWith('data:'))
        .map((x) => x.slice(5).trim())
        .join('\n')
    : text
  return JSON.parse(body)
}

const place = {
  action: 'place',
  symbol: 'AAPL.US',
  side: 'BUY',
  orderType: 'LIMIT',
  quantity: '1',
  price: '100',
  idempotencyKey: 'intent-123',
}

describe('trading MCP tools over authenticated HTTP', () => {
  it('lists six compact business tools with object roots, scoped writes and annotations', async () => {
    const s = setup()
    const response = await s.rpc('tools/list')
    expect(response.status).toBe(200)
    const body = await parse(response)
    expect(body.error).toBeUndefined()
    const tools = body.result.tools
    expect(tools.map((x: { name: string }) => x.name)).toEqual([
      'trading_snapshot',
      'trading_activity',
      'trading_lookup',
      'trading_order',
      'trading_control',
      'submit_bug_report',
    ])
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe('object')
      expect(tool.inputSchema.required).toContain('request')
      expect(tool.annotations.openWorldHint).toBe(true)
    }
    expect(tools[3].annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    })
    expect(tools[4].annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    })
    expect(tools[5].annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    })
    expect(JSON.stringify(tools).length).toBeLessThan(20_000)
    expect(s.exchange).not.toHaveBeenCalled()
  })

  it('lists and renders the bug-report preparation prompt', async () => {
    const s = setup()
    const listed = await s.rpc('prompts/list')
    expect((await parse(listed)).result.prompts).toEqual([
      expect.objectContaining({ name: 'prepare_bug_report' }),
    ])
    const response = await s.rpc('prompts/get', {
      name: 'prepare_bug_report',
    })
    const body = await parse(response)
    expect(body.result.messages[0].content.text).toContain(
      'First investigate the reported problem and determine whether the responsibility belongs to TQX',
    )
    expect(body.result.messages[0].content.text).toContain(
      'After organizing the evidence, call submit_bug_report directly',
    )
    expect(body.result.messages[0].content.text).toContain(
      "Match the user's language and writing system in all user-facing output",
    )
    expect(body.result.messages[0].content.text).toContain(
      'Write description as well-structured Markdown',
    )
    expect(body.result.messages[0].content.text).toContain('prefer an envelope-style card or panel')
    expect(body.result.messages[0].content.text).toContain(
      'Do not fabricate a UI protocol unsupported by the current host',
    )
    expect(s.exchange).not.toHaveBeenCalled()
    expect(s.fetch).not.toHaveBeenCalled()
  })

  it('reads account and positions concurrently with one exchange and no MCP token passthrough', async () => {
    const s = setup()
    const { response, body } = await s.call('trading_snapshot', {})
    expect(response.status).toBe(200)
    expect(body.result.isError).not.toBe(true)
    expect(body.result.structuredContent).toMatchObject({
      kind: 'trading.snapshot',
      data: { account, positions: { items: [], next_cursor: null } },
    })
    expect(s.exchange).toHaveBeenCalledTimes(1)
    expect(s.fetch).toHaveBeenCalledTimes(2)
    for (const [, init] of s.fetch.mock.calls) {
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe('Bearer exchanged-api-token')
      expect(headers.has('X-API-Key')).toBe(false)
    }
    expect(JSON.stringify(body)).not.toContain(mcpToken)
    expect(JSON.stringify(body)).not.toContain('exchanged-api-token')
  })

  it.each([
    [
      'trading_activity',
      { type: 'orders', cursor: 'opaque+/=' },
      '/openapi/v1/trading/orders?limit=20&cursor=opaque%2B%2F%3D',
    ],
    [
      'trading_activity',
      { type: 'trades', market: 'US', orderId: 'id/with?chars' },
      '/openapi/v1/trading/trades?limit=20&market=US&order_id=id%2Fwith%3Fchars',
    ],
    [
      'trading_activity',
      { type: 'cash_flows', startDate: '2026-11-01', endDate: '2026-11-06', currency: 'USD' },
      '/openapi/v1/trading/cash-flows?limit=20&start_date=2026-11-01&end_date=2026-11-06&currency=USD',
    ],
    ['trading_lookup', { type: 'order', id: 'order-1' }, '/openapi/v1/trading/orders/order-1'],
    [
      'trading_lookup',
      { type: 'signal', id: 'signal/123?x' },
      '/openapi/v1/trading/signals/signal%2F123%3Fx',
    ],
    [
      'trading_snapshot',
      { sections: ['positions'], market: 'HK', symbol: '00700.HK', limit: 3 },
      '/openapi/v1/trading/positions?symbol=00700.HK&market=HK&limit=3',
    ],
  ])('maps %s %j to the correct path and query', async (tool, request, path) => {
    const s = setup()
    const { body } = await s.call(tool as string, request)
    expect(body.result.isError).not.toBe(true)
    expect(String(s.fetch.mock.calls[0]![0])).toBe(`https://trade.example.test${path}`)
    expect(s.fetch.mock.calls[0]![1]!.method).toBe('GET')
  })

  it.each([
    ['trading_order', place],
    ['trading_order', { action: 'modify', orderId: 'order-1', price: '101.1' }],
    ['trading_order', { action: 'cancel', orderId: 'order-1' }],
  ])('requires order:write before executing %s %j', async (tool, request) => {
    const s = setup()
    const { response } = await s.call(tool as string, request, readToken)
    expect(response.status).toBe(403)
    expect(response.headers.get('WWW-Authenticate')).toContain('scope="order:write"')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:6274')
    expect(s.exchange).not.toHaveBeenCalled()
    expect(s.fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['trade:read', readToken],
    ['order:write', writeToken],
  ])(
    'uses an existing %s scope for bug reports without an MCP scope challenge',
    async (_scope, token) => {
      const s = setup()
      const { response, body } = await s.call(
        'submit_bug_report',
        { title: 'title', description: 'description' },
        token,
      )
      expect(response.status).toBe(200)
      expect(body.result.isError).not.toBe(true)
      expect(s.exchange).toHaveBeenCalledWith(expect.objectContaining({ scopes: [_scope] }))
      expect(s.fetch).toHaveBeenCalledTimes(1)
    },
  )

  it('challenges bug reports when no usable Trading Resource scope is present', async () => {
    const s = setup()
    const { response } = await s.call(
      'submit_bug_report',
      { title: 'title', description: 'description' },
      researchToken,
    )
    expect(response.status).toBe(403)
    expect(response.headers.get('WWW-Authenticate')).toContain('error="insufficient_scope"')
    expect(response.headers.get('WWW-Authenticate')).toContain('scope="ranking:read"')
    expect(s.exchange).not.toHaveBeenCalled()
    expect(s.fetch).not.toHaveBeenCalled()
  })

  it('submits a bug report through the OpenAPI route with idempotency and a fresh exchange', async () => {
    const s = setup()
    const request = {
      title: 'Broken quote',
      description: 'Steps, environment, response, and request_id=request-1',
      idempotencyKey: 'bug-report-001',
    }
    const first = await s.call('submit_bug_report', request, rankingToken)
    const second = await s.call('submit_bug_report', request, rankingToken)
    expect(first.body.result.structuredContent).toMatchObject({
      kind: 'bug_report.submitted',
      data: bugReport,
    })
    expect(second.body.result.structuredContent.data).toEqual(bugReport)
    expect(s.exchange).toHaveBeenCalledTimes(2)
    expect(s.exchange.mock.calls.map(([input]) => input.scopes)).toEqual([
      ['ranking:read'],
      ['ranking:read'],
    ])
    const [url, init] = s.fetch.mock.calls[0]!
    expect(String(url)).toBe('https://trade.example.test/openapi/v1/bug-reports')
    expect(init!.method).toBe('POST')
    expect(new Headers(init!.headers).get('Authorization')).toBe('Bearer exchanged-api-token')
    expect(new Headers(init!.headers).get('Idempotency-Key')).toBe('bug-report-001')
    expect(JSON.parse(init!.body as string)).toEqual({
      title: 'Broken quote',
      description: 'Steps, environment, response, and request_id=request-1',
    })
    expect(s.audit).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'bug-report', operation: 'bugReport', result: 'success' }),
    )
  })

  it('submits a bug report with ranking:read and no Agent binding', async () => {
    const s = setup()
    const { response, body } = await s.call(
      'submit_bug_report',
      { title: 'title', description: 'description' },
      rankingToken,
    )
    expect(response.status).toBe(200)
    expect(body.result.isError).not.toBe(true)
    expect(s.exchange).toHaveBeenCalledWith(expect.objectContaining({ scopes: ['ranking:read'] }))
    expect(s.fetch).toHaveBeenCalledTimes(1)
  })

  it('returns a bug-report-specific error kind without exposing upstream messages', async () => {
    const s = setup()
    s.reply(
      Response.json(
        {
          code: 'report_processing_unavailable',
          data: null,
          message: 'internal classifier details',
          request_id: 'bug-request-1',
        },
        { status: 503 },
      ),
    )
    const { body } = await s.call(
      'submit_bug_report',
      {
        title: 'Broken quote',
        description: 'Details',
      },
      rankingToken,
    )
    expect(body.result.structuredContent).toMatchObject({
      kind: 'bug_report.error',
      error: {
        kind: 'api',
        code: 'report_processing_unavailable',
        status: 503,
        requestId: 'bug-request-1',
        message: 'Bug report API rejected operation (report_processing_unavailable)',
      },
    })
    expect(JSON.stringify(body)).not.toContain('internal classifier details')
  })

  it.each(['2025-11-25', '2026-07-28'])(
    'enforces operation-specific lookup/hold scopes over %s',
    async (version) => {
      const s = setup()
      const holdResult = await s.call('trading_control', { action: 'hold' }, readToken, version)
      expect(holdResult.response.status).toBe(200)
      expect(holdResult.body.result.isError).not.toBe(true)
      const signalResult = await s.call(
        'trading_lookup',
        { type: 'signal', id: 'signal-123' },
        readToken,
        version,
      )
      expect(signalResult.response.status).toBe(403)
      expect(signalResult.response.headers.get('WWW-Authenticate')).toContain('scope="order:write"')
      expect(s.fetch).toHaveBeenCalledTimes(1)
      const writeSignal = await s.call(
        'trading_lookup',
        { type: 'signal', id: 'signal-123' },
        writeToken,
        version,
      )
      expect(writeSignal.body.result.isError).not.toBe(true)
      const writeHold = await s.call('trading_control', { action: 'hold' }, writeToken, version)
      expect(writeHold.response.status).toBe(403)
      const readOrder = await s.call(
        'trading_lookup',
        { type: 'order', id: 'order-1' },
        readToken,
        version,
      )
      expect(readOrder.body.result.isError).not.toBe(true)
      const writeOrder = await s.call(
        'trading_lookup',
        { type: 'order', id: 'order-1' },
        writeToken,
        version,
      )
      expect(writeOrder.response.status).toBe(403)
      expect(s.exchange.mock.calls.map(([input]) => input.scopes)).toEqual([
        ['trade:read'],
        ['order:write'],
        ['trade:read'],
      ])
    },
  )

  it.each(['2025-11-25', '2026-07-28'])(
    'challenges lookup scopes before validating malformed arguments over %s',
    async (version) => {
      const s = setup()
      await Promise.all(
        (
          [
            [{ type: 'signal', id: 'short' }, readToken, 'order:write'],
            [{ type: 'signal' }, researchToken, 'order:write'],
            [{ type: 'order', id: '' }, researchToken, 'trade:read'],
            [{ type: 'unknown', id: 'order-1' }, researchToken, 'trade:read'],
            [{}, researchToken, 'trade:read'],
            [null, researchToken, 'trade:read'],
            [undefined, researchToken, 'trade:read'],
          ] as const
        ).map(async ([request, token, scope]) => {
          const { response } = await s.call('trading_lookup', request, token, version)
          expect(response.status).toBe(403)
          expect(response.headers.get('WWW-Authenticate')).toContain(`scope="${scope}"`)
        }),
      )
      expect(s.exchange).not.toHaveBeenCalled()
      expect(s.fetch).not.toHaveBeenCalled()
      const { response, body } = await s.call(
        'trading_lookup',
        { type: 'signal', id: 'short' },
        writeToken,
        version,
      )
      expect(response.status).toBe(200)
      expect(body.result.isError).toBe(true)
      expect(s.exchange).not.toHaveBeenCalled()
    },
  )

  it.each([
    [409, 'insufficient_funds', 'REJECTED'],
    [422, 'insufficient_position', 'REJECTED'],
    [504, 'trading_timeout', 'UNKNOWN'],
  ])(
    'returns non-2xx signal diagnostics in the MCP error on HTTP %i',
    async (status, code, state) => {
      const s = setup()
      const diagnostic = {
        ...signal,
        state,
        available_quantity: '2',
        excess_quantity: '8',
        short_selling_allowed: false,
        shortfall: '100',
      }
      s.reply(
        Response.json(
          {
            code,
            data: { ...diagnostic, internal_trace: 'private-trace' },
            message: 'private-trace',
            request_id: 'rejected-request',
          },
          { status },
        ),
      )
      const { response, body } = await s.call('trading_order', place)
      expect(response.status).toBe(200)
      expect(body.result.isError).toBe(true)
      expect(body.result.structuredContent.error).toMatchObject({
        code,
        status,
        signal: diagnostic,
        outcomeUnknown: status === 504,
      })
      expect(JSON.parse(body.result.content[0].text)).toEqual(body.result.structuredContent)
      expect(JSON.stringify(body)).not.toContain('private-trace')
      expect(s.audit).toHaveBeenCalledWith(
        expect.objectContaining({ signalId: signal.signal_id, result: 'error', code }),
      )
      expect(s.fetch).toHaveBeenCalledTimes(1)
    },
  )

  it.each([
    ['  aapl.us  ', 'AAPL.US'],
    [' 00700.hk ', '00700.HK'],
  ])(
    'normalizes order symbol %j before gateway submission and audit',
    async (input, normalized) => {
      const s = setup()
      s.reply(envelope(signal))
      const { body } = await s.call('trading_order', { ...place, symbol: input })
      expect(body.result.isError).not.toBe(true)
      expect(JSON.parse(s.fetch.mock.calls[0]![1]!.body as string).symbol).toBe(normalized)
      expect(s.audit).toHaveBeenCalledWith(expect.objectContaining({ symbol: normalized }))
    },
  )

  it.each([
    ['trading_snapshot', { sections: [] }],
    ['trading_snapshot', { sections: ['account'], market: 'US' }],
    ['trading_activity', { type: 'orders', market: 'US' }],
    ['trading_activity', { type: 'trades', limit: 101 }],
    ['trading_activity', { type: 'cash_flows', startDate: '2026-02-30' }],
    ['trading_activity', { type: 'cash_flows', startDate: '2026-11-06', endDate: '2026-11-01' }],
    ['trading_lookup', { type: 'signal', id: 'short' }],
    ['trading_order', { ...place, quantity: '1.2' }],
    ['trading_order', { ...place, price: '0' }],
    ['trading_order', { ...place, orderType: 'MARKET' }],
    ['trading_order', { ...place, idempotencyKey: '' }],
    ['trading_control', { action: 'hold', yes: true }],
    ['submit_bug_report', { title: '', description: 'details' }],
    ['submit_bug_report', { title: 'title', description: '' }],
    ['submit_bug_report', { title: 'title', description: 'details', idempotencyKey: '\n' }],
  ])('rejects invalid %s arguments before exchange: %j', async (tool, request) => {
    const s = setup()
    const { body } = await s.call(tool as string, request)
    expect(body.result.isError).toBe(true)
    expect(s.exchange).not.toHaveBeenCalled()
    expect(s.fetch).not.toHaveBeenCalled()
  })

  it('submits a limit order with the original stable key and reports a signal envelope', async () => {
    const s = setup()
    s.reply(envelope(signal))
    const { body } = await s.call('trading_order', place)
    expect(body.result.structuredContent.data).toMatchObject({ action: 'place', ...signal })
    const [url, init] = s.fetch.mock.calls[0]!
    expect(String(url)).toBe('https://trade.example.test/openapi/v1/trading/orders')
    expect(init!.method).toBe('POST')
    expect(new Headers(init!.headers).get('Idempotency-Key')).toBe('intent-123')
    expect(JSON.parse(init!.body as string)).toEqual({
      symbol: 'AAPL.US',
      side: 'BUY',
      order_type: 'LIMIT',
      quantity: '1',
      price: '100',
      time_in_force: 'DAY',
    })
    expect(s.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'place',
        result: 'success',
        idempotencyKey: 'intent-123',
        requestId: 'request-1',
      }),
    )
  })

  it.each([
    [
      'modify',
      { action: 'modify', orderId: 'order-1', price: '101.1' },
      'PATCH',
      { price: '101.1' },
    ],
    ['cancel', { action: 'cancel', orderId: 'order-1' }, 'DELETE', undefined],
  ])(
    'maps %s with no unrelated fields and no automatic retry',
    async (_action, request, method, body) => {
      const s = setup()
      s.reply(
        envelope({
          order_id: 'order-1',
          new_order_id: 'order-2',
          accepted: true,
          action_id: 'action-123',
          status: 'SUBMITTED',
          request_id: 'action-request',
          order_status: null,
          error_code: null,
        }),
      )
      const r = await s.call('trading_order', request)
      expect(r.body.result.structuredContent.data.accepted).toBe(true)
      expect(r.body.result.structuredContent.data.new_order_id).toBe('order-2')
      expect(s.fetch.mock.calls[0]![1]!.method).toBe(method)
      expect(s.fetch.mock.calls[0]![1]!.body).toBe(body ? JSON.stringify(body) : undefined)
      expect(s.exchange).toHaveBeenCalledTimes(1)
    },
  )

  it('exchanges again for every hold and never uses a warmed read cache', async () => {
    const s = setup()
    await s.call('trading_snapshot', { sections: ['account'] }, readToken)
    await Promise.all([
      s.call('trading_control', { action: 'hold' }, readToken),
      s.call('trading_control', { action: 'hold' }, readToken),
    ])
    expect(s.exchange).toHaveBeenCalledTimes(3)
    expect(s.fetch.mock.calls[1]![1]!.method).toBe('POST')
  })

  it('preserves partial snapshot success and returns a section error instead of fake empty data', async () => {
    const s = setup()
    s.fetch.mockImplementation(async (url) =>
      new URL(String(url)).pathname.endsWith('/account')
        ? envelope(null, 503, 'trading_service_unavailable')
        : envelope({ items: [], next_cursor: null }),
    )
    const { body } = await s.call('trading_snapshot', {})
    expect(body.result.isError).toBe(true)
    expect(body.result.structuredContent.data.account).toBeNull()
    expect(body.result.structuredContent.data.positions.items).toEqual([])
    expect(body.result.structuredContent.meta.errors[0]).toMatchObject({
      section: 'account',
      code: 'trading_service_unavailable',
    })
  })

  it('reports unsupported cash ledgers as errors and suppresses upstream message text', async () => {
    const s = setup()
    s.reply(
      Response.json(
        {
          code: 'cash_flows_unsupported',
          data: null,
          message: 'exchanged-api-token',
          request_id: 'request-2',
        },
        { status: 501 },
      ),
    )
    const { body } = await s.call('trading_activity', { type: 'cash_flows' })
    expect(body.result.isError).toBe(true)
    expect(body.result.structuredContent.error).toMatchObject({
      code: 'cash_flows_unsupported',
      requestId: 'request-2',
    })
    expect(JSON.stringify(body)).not.toContain('exchanged-api-token')
    expect(s.exchange).toHaveBeenCalledTimes(1)
  })

  it('serves a legacy protocol trading call through the same tools', async () => {
    const s = setup()
    const { body } = await s.call(
      'trading_lookup',
      { type: 'signal', id: 'signal-123' },
      mcpToken,
      '2025-11-25',
    )
    expect(body.result.structuredContent.data.state).toBe('ACCEPTED')
    expect(body.result).not.toHaveProperty('resultType')
  })
})
