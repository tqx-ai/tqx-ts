import { type IncomingMessage, request } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../src/config'
import { listBody, rpcHeaders } from './fixture'
import { tradingFixture } from './trading-fixture'

const connect = async (
  f: Awaited<ReturnType<typeof tradingFixture>>,
  claims: Record<string, unknown> = {},
) => {
  const client = new Client({ name: 'synthetic-tool-client', version: '1.0.0' })
  const token = await f.sign(claims)
  await client.connect(
    new StreamableHTTPClientTransport(new URL(f.config.resource), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  )
  return { client, token }
}

describe('synthetic AS -> MCP -> SDK -> Trading', () => {
  it('defaults off and refuses enabled startup without a private secret', () => {
    expect(loadConfig({}).tradingToolsEnabled).toBe(false)
    expect(() => loadConfig({ MCP_TRADING_TOOLS_ENABLED: 'true' })).toThrow(
      'MCP_EXCHANGE_CLIENT_SECRET',
    )
  })
  it('initializes, lists only two readOnly tools, calls SDK methods, and preserves exact data', async () => {
    const f = await tradingFixture()
    const { client, token } = await connect(f)
    try {
      const previous = f.state.exchange.length
      const tools = await client.listTools()
      // The SDK may concurrently probe GET /mcp; it is protected and exchanges too.
      expect(f.state.exchange.length).toBeGreaterThan(previous)
      expect(tools.tools.map((t) => t.name)).toEqual(['getAccount', 'listPositions'])
      expect(
        tools.tools.every(
          (t) => t.annotations?.readOnlyHint === true && t.annotations.destructiveHint === false,
        ),
      ).toBe(true)
      const account = await client.callTool({
        name: 'getAccount',
        arguments: { currency: 'USD' },
      })
      expect(account.isError).not.toBe(true)
      expect(account.content).toEqual([
        {
          type: 'text',
          text: expect.stringContaining('9007199254740993.123456'),
        },
      ])
      expect(JSON.parse((account.content as { text: string }[])[0]?.text ?? '{}')).toMatchObject({
        cash: null,
        is_stale: true,
        mode: 'PAPER',
      })
      const positions = await client.callTool({
        name: 'listPositions',
        arguments: {
          symbol: 'SYNTHETIC.US',
          market: 'US',
          limit: 10,
          cursor: 'opaque +/=',
        },
      })
      expect(positions.isError).not.toBe(true)
      const data = JSON.parse((positions.content as { text: string }[])[0]?.text ?? '{}')
      expect(data.items[0]).toMatchObject({
        quantity: '9007199254740993',
        average_cost: null,
        last_price: '10.1234',
        price_currency: null,
      })
      expect(data.next_cursor).toBe('synthetic-next')
      expect(f.state.trading[0]?.url).toBe('/openapi/v1/trading/account?currency=USD')
      const url = new URL(f.state.trading[1]?.url ?? '', f.tradingBase)
      expect(url.pathname).toBe('/openapi/v1/trading/positions')
      expect(url.searchParams.get('cursor')).toBe('opaque +/=')
      expect(f.state.trading.every((r) => r.token !== token)).toBe(true)
      expect(f.state.trading[0]?.token).not.toBe(f.state.trading[1]?.token)
      for (const exchange of f.state.exchange) {
        const [scheme, value] = exchange.authorization?.split(' ') ?? []
        expect(scheme).toBe('Basic')
        expect(Buffer.from(value ?? '', 'base64').toString()).toBe(
          'tqx_mcp_server:synthetic-secret%3A+%2B%2F%3D',
        )
        expect(exchange.form.get('scope')).toBe('trade:read')
        expect(exchange.form.get('resource')).toBe(f.config.apiResource)
        expect(exchange.form.get('subject_token')).toBe(token)
        expect(exchange.form.has('client_id')).toBe(false)
      }
    } finally {
      await client.close()
      await f.close()
    }
  })
  it('reuses one API token for multiple tools in one HTTP batch, never across requests', async () => {
    const f = await tradingFixture()
    try {
      const token = await f.sign()
      const body = JSON.stringify(
        [1, 2].map((id) => ({
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: { name: 'getAccount', arguments: {} },
        })),
      )
      const response = await fetch(f.config.resource, {
        method: 'POST',
        headers: { ...rpcHeaders, Authorization: `Bearer ${token}` },
        body,
      })
      expect(response.status).toBe(200)
      await response.json()
      expect(f.state.exchange).toHaveLength(1)
      expect(f.state.trading).toHaveLength(2)
      expect(f.state.trading[0]?.token).toBe(f.state.trading[1]?.token)
    } finally {
      await f.close()
    }
  })
  it('isolates concurrent clients, rejects identity overrides and invalid SDK parameters', async () => {
    const f = await tradingFixture()
    const a = await connect(f, {
      sub: 'synthetic-alice',
      sid: 'a',
      agent_id: 'agent-a',
      grant_id: 'grant-a',
    })
    const b = await connect(f, {
      sub: 'synthetic-bob',
      sid: 'b',
      agent_id: 'agent-b',
      grant_id: 'grant-b',
    })
    try {
      const results = await Promise.all(
        [a, b].map(async ({ client }) => client.callTool({ name: 'getAccount', arguments: {} })),
      )
      expect(((results[0]?.content ?? []) as { text: string }[])[0]?.text).toContain(
        'synthetic-alice',
      )
      expect(((results[1]?.content ?? []) as { text: string }[])[0]?.text).toContain(
        'synthetic-bob',
      )
      const count = f.state.trading.length
      for (const args of [{ agent_id: 'agent-b' }, { uid: 'other' }, { currency: 'EUR' }]) {
        const result = await a.client.callTool({
          name: 'getAccount',
          arguments: args,
        })
        expect(result.isError).toBe(true)
      }
      for (const args of [
        { limit: 0 },
        { limit: 101 },
        { cursor: 'x'.repeat(513) },
        { market: 'CN' },
      ]) {
        expect((await a.client.callTool({ name: 'listPositions', arguments: args })).isError).toBe(
          true,
        )
      }
      expect(f.state.trading).toHaveLength(count)
    } finally {
      await a.client.close()
      await b.client.close()
      await f.close()
    }
  })
  it('reports revoked grants before initialize/listTools and does not expose an offline tool list', async () => {
    const f = await tradingFixture()
    try {
      f.state.error = { status: 400, code: 'invalid_grant' }
      const token = await f.sign()
      for (const method of ['tools/list', 'initialize']) {
        const response = await fetch(f.config.resource, {
          method: 'POST',
          headers: { ...rpcHeaders, Authorization: `Bearer ${token}` },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method }),
        })
        expect(response.status).toBe(401)
        expect(response.headers.get('www-authenticate')).toContain('resource_metadata=')
        expect(await response.text()).not.toContain('synthetic private AS detail')
      }
      expect(f.state.trading).toHaveLength(0)
    } finally {
      await f.close()
    }
  })
  it('rejects a JWT without grant/Agent before calling the AS', async () => {
    const f = await tradingFixture()
    try {
      for (const claim of ['agent_id', 'grant_id']) {
        const response = await fetch(f.config.resource, {
          method: 'POST',
          headers: {
            ...rpcHeaders,
            Authorization: `Bearer ${await f.sign({ [claim]: undefined })}`,
          },
          body: listBody,
        })
        expect(response.status).toBe(401)
      }
      expect(f.state.exchange).toHaveLength(0)
    } finally {
      await f.close()
    }
  })
})

describe('synthetic exchange failures', () => {
  let f: Awaited<ReturnType<typeof tradingFixture>>
  beforeAll(async () => {
    f = await tradingFixture()
  })
  afterAll(async () => {
    await f.close()
  })
  const post = async () => {
    const response = await fetch(f.config.resource, {
      method: 'POST',
      headers: { ...rpcHeaders, Authorization: `Bearer ${await f.sign()}` },
      body: listBody,
    })
    await response.text()
    return response
  }
  it.each([
    [400, 'invalid_grant', 401],
    [400, 'invalid_scope', 403],
    [401, 'invalid_client', 503],
    [400, 'invalid_target', 503],
    [400, 'unauthorized_client', 503],
    [429, 'temporarily_unavailable', 503],
    [503, 'temporarily_unavailable', 503],
  ] as const)('maps AS %s/%s to %s', async (status, code, expected) => {
    f.state.error = { status, code }
    try {
      expect((await post()).status).toBe(expected)
    } finally {
      f.state.error = undefined
    }
  })
  it.each([
    { sub: 'other' },
    { sid: 'other' },
    { grant_id: 'other' },
    { agent_id: 'other' },
    { aud: 'http://127.0.0.1:1/api' },
    { aud: ['wrong', 'other'] },
    { iss: 'https://wrong.invalid' },
    { client_id: 'wrong' },
    { source_client_id: 'wrong' },
    { act: { sub: 'wrong' } },
    { act: { sub: 'tqx_mcp_server', act: { sub: 'other' } } },
    { jti: 'synthetic-token' },
    { exp: 1 },
    { scope: 'trade:read order:write' },
    { iat: 1 },
    { agent_id: undefined },
  ])('rejects inconsistent derived claims %j', async (claims) => {
    f.state.claims = claims
    try {
      expect((await post()).status).toBe(502)
    } finally {
      f.state.claims = {}
    }
  })
  it.each([
    { expires_in: 301 },
    { expires_in: 1 },
    { scope: 'order:write' },
    { refresh_token: 'synthetic' },
    { token_type: 'MAC' },
    { issued_token_type: 'wrong' },
    { access_token: 'invalid.jwt.value' },
  ])('rejects inconsistent response envelope %j', async (envelope) => {
    f.state.envelope = envelope
    try {
      expect((await post()).status).toBe(502)
    } finally {
      f.state.envelope = {}
    }
  })
  it('rejects wrong signatures, malformed JSON, and credential-bearing redirects', async () => {
    f.state.wrongKey = true
    expect((await post()).status).toBe(502)
    f.state.wrongKey = false
    f.state.malformed = true
    expect((await post()).status).toBe(502)
    f.state.malformed = false
    f.state.asContentType = 'text/plain'
    expect((await post()).status).toBe(502)
    f.state.asContentType = 'application/json'
    f.state.redirect = true
    try {
      expect((await post()).status).toBe(502)
      expect(f.state.trading).toHaveLength(0)
    } finally {
      f.state.redirect = false
    }
  })
})

describe('synthetic cancellation and downstream failures', () => {
  it('rejects an expired upload before exchange when the feature is enabled', async () => {
    const f = await tradingFixture()
    let incoming: IncomingMessage | undefined
    f.service.server.on('request', (req) => {
      incoming = req
    })
    const exp = Math.floor(Date.now() / 1000) + 60
    const req = request(f.config.resource, {
      method: 'POST',
      headers: {
        ...rpcHeaders,
        Authorization: `Bearer ${await f.sign({ exp })}`,
        'Content-Length': Buffer.byteLength(listBody),
      },
    })
    const result = new Promise<number>((resolve, reject) => {
      req.on('response', (res) => {
        res.resume()
        res.on('end', () => resolve(res.statusCode ?? 0))
      })
      req.on('error', reject)
    })
    let clock: ReturnType<typeof vi.spyOn> | undefined
    try {
      req.write(listBody.slice(0, 1))
      await vi.waitFor(() => expect(incoming?.readableFlowing).toBe(true))
      clock = vi.spyOn(Date, 'now').mockReturnValue(exp * 1000)
      req.end(listBody.slice(1))
      expect(await result).toBe(401)
      expect(f.state.exchange).toHaveLength(0)
    } finally {
      clock?.mockRestore()
      req.destroy()
      await f.close()
    }
  })

  it('cancels a Trading read and protocol resources when the client disconnects', async () => {
    const f = await tradingFixture({ tradingTimeoutMs: 30_000 })
    f.state.holdTrading = true
    const disconnected = new AbortController()
    const pending = fetch(f.config.resource, {
      method: 'POST',
      headers: { ...rpcHeaders, Authorization: `Bearer ${await f.sign()}` },
      signal: disconnected.signal,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'getAccount', arguments: {} },
      }),
    }).catch(() => undefined)
    try {
      await vi.waitFor(() => expect(f.state.activeTrading).toBe(1))
      disconnected.abort()
      await pending
      await vi.waitFor(() => {
        expect(f.state.activeTrading).toBe(0)
        expect(f.service.application.activeRequestCount).toBe(0)
      })
    } finally {
      disconnected.abort()
      await f.close()
    }
  })

  it('does not follow Trading redirects or leak the API bearer to the target', async () => {
    const f = await tradingFixture()
    const { client } = await connect(f)
    f.state.tradingRedirect = true
    try {
      const result = await client.callTool({
        name: 'getAccount',
        arguments: {},
      })
      expect(result.isError).toBe(true)
      expect(result.content).toEqual([
        { type: 'text', text: '{"error":"upstream_protocol_error"}' },
      ])
      // The SDK may retry the same read. None of those attempts follows Location.
      expect(f.state.trading.length).toBeGreaterThan(0)
      expect(f.state.trading.every((r) => r.url === '/openapi/v1/trading/account')).toBe(true)
    } finally {
      await client.close()
      await f.close()
    }
  })
  it('bounds AS timeouts and cancels pending exchange on shutdown', async () => {
    const f = await tradingFixture({ exchangeTimeoutMs: 75 })
    f.state.holdExchange = true
    try {
      const response = await fetch(f.config.resource, {
        method: 'POST',
        headers: { ...rpcHeaders, Authorization: `Bearer ${await f.sign()}` },
        body: listBody,
      })
      expect(response.status).toBe(503)
      await response.text()
      await vi.waitFor(() => expect(f.state.activeExchange).toBe(0))
    } finally {
      await f.close()
    }
    const g = await tradingFixture({ exchangeTimeoutMs: 30_000 })
    g.config.shutdownTimeoutMs = 50
    g.state.holdExchange = true
    const pending = fetch(g.config.resource, {
      method: 'POST',
      headers: { ...rpcHeaders, Authorization: `Bearer ${await g.sign()}` },
      body: listBody,
    }).catch(() => undefined)
    try {
      await vi.waitFor(() => expect(g.state.activeExchange).toBe(1))
      await g.service.close()
      await pending
      await vi.waitFor(() => expect(g.state.activeExchange).toBe(0))
    } finally {
      await g.close()
    }
  })
  it('keeps Trading authorization/protocol errors inside the tool result and suppresses backend text', async () => {
    const f = await tradingFixture()
    const { client } = await connect(f)
    try {
      for (const [status, code] of [
        [401, 'authorization_required'],
        [403, 'permission_denied'],
        [429, 'rate_limit_exceeded'],
      ] as const) {
        f.state.tradingStatus = status
        const result = await client.callTool({
          name: 'getAccount',
          arguments: {},
        })
        expect(result.isError).toBe(true)
        expect(result.content).toEqual([{ type: 'text', text: JSON.stringify({ error: code }) }])
      }
      f.state.tradingStatus = 200
      f.state.invalidTradingData = true
      expect((await client.callTool({ name: 'getAccount', arguments: {} })).content).toEqual([
        { type: 'text', text: '{"error":"upstream_protocol_error"}' },
      ])
    } finally {
      await client.close()
      await f.close()
    }
  })
  it('cancels a stalled Trading read and refuses ambient SDK destination overrides', async () => {
    const f = await tradingFixture({ tradingTimeoutMs: 75 })
    const { client } = await connect(f)
    const old = process.env.TQX_BASE_URL
    try {
      f.state.holdTrading = true
      expect((await client.callTool({ name: 'getAccount', arguments: {} })).isError).toBe(true)
      await vi.waitFor(() => expect(f.state.activeTrading).toBe(0))
      const count = f.state.trading.length
      process.env.TQX_BASE_URL = 'https://wrong.invalid'
      expect((await client.callTool({ name: 'getAccount', arguments: {} })).isError).toBe(true)
      expect(f.state.trading).toHaveLength(count)
    } finally {
      if (old === undefined) delete process.env.TQX_BASE_URL
      else process.env.TQX_BASE_URL = old
      await client.close()
      await f.close()
    }
  })
})
