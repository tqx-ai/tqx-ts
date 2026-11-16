import { McpServer } from '@modelcontextprotocol/server'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '../src/app'
import { createLogger, formatShanghaiTimestamp, getLogger, logContext } from '../src/utils/logger'
import { createOAuthFixture, testConfig } from './helpers/oauth'
import { envelope, signal, tradingConfig } from './helpers/trading'

const oauth = await createOAuthFixture()
const token = await oauth.sign()
const records: Record<string, unknown>[] = []
const detach = ['http', 'protocol', 'auth', 'token-exchange', 'gateway', 'audit'].map((name) =>
  getLogger(name).attachTransport((record) => {
    records.push(JSON.parse(JSON.stringify(record)))
  }),
)

afterEach(() => {
  records.length = 0
  vi.unstubAllEnvs()
})

function call(
  name: string,
  args: unknown,
  id = 1,
  headers: Record<string, string> = {},
  modern = true,
) {
  const app = createApp({ config: testConfig, fetch: oauth.fetch, tradingConfig: null })
  return app.request('http://127.0.0.1/mcp?secret=never-log-query', {
    method: 'POST',
    headers: {
      Host: '127.0.0.1',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': modern ? '2026-07-28' : '2025-11-25',
      'Mcp-Method': 'tools/call',
      'Mcp-Name': name,
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: {
        name,
        arguments: args,
        ...(modern
          ? {
              _meta: {
                'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                'io.modelcontextprotocol/clientCapabilities': {},
                'io.modelcontextprotocol/clientInfo': { name: 'test-client', version: '1.0' },
              },
            }
          : {}),
      },
    }),
  })
}

function events(event: string) {
  return records.filter((record) => record.event === event)
}

describe('MCP logging', () => {
  it('records concurrent request identities, tool results and safe client metadata', async () => {
    const responses = await Promise.all([
      call('tqx_ping', { name: 'never-log-arguments' }, 11),
      call('tqx_ping', { name: 'second' }, 22),
    ])
    await Promise.all(responses.map((response) => response.text()))
    const completed = events('mcp.request_completed')
    expect(completed).toHaveLength(2)
    expect(completed.map((record) => record.result)).toEqual(['success', 'success'])
    const contexts = completed.map((record) => record['_logMeta'] as Record<string, unknown>)
    expect(contexts.map((context) => context.rpcId).toSorted()).toEqual([11, 22])
    expect(new Set(contexts.map((context) => context.requestId)).size).toBe(2)
    expect(contexts[0]).toMatchObject({
      clientName: 'test-client',
      clientId: 'external-mcp-client',
    })
    for (const response of responses) expect(response.headers.get('X-Request-ID')).toBeTruthy()
    const serialized = JSON.stringify(records)
    for (const secret of [token, 'never-log-query', 'never-log-arguments'])
      expect(serialized).not.toContain(secret)
  })

  it.each([
    ['tqx_ping', {}, 'tool_error'],
    ['unknown', {}, 'protocol_error'],
  ])('records %s failures returned by the SDK', async (name, args, result) => {
    await (await call(name, args)).text()
    expect(events('mcp.request_completed')).toEqual([expect.objectContaining({ result })])
  })

  it('records legacy SSE tool completion without buffering the response', async () => {
    const response = await call('tqx_ping', { name: 'legacy' }, 9, {}, false)
    expect(response.headers.get('Content-Type')).toContain('text/event-stream')
    expect(await response.text()).toContain('pong, legacy')
    expect(events('mcp.request_completed')).toEqual([
      expect.objectContaining({ result: 'success' }),
    ])
  })

  it.each([
    [400, '{'],
    [413, 'x'.repeat(4 * 1024 * 1024 + 1)],
  ])('records body rejection with status %i', async (status, body) => {
    const app = createApp({ config: testConfig, fetch: oauth.fetch, tradingConfig: null })
    const response = await app.request('http://127.0.0.1/mcp', {
      method: 'POST',
      headers: { Host: '127.0.0.1', 'Content-Type': 'application/json' },
      body,
    })
    expect(response.status).toBe(status)
    expect(events('mcp.http_completed')).toEqual([expect.objectContaining({ status })])
  })

  it('records SDK early rejections and excludes health checks', async () => {
    const app = createApp({ config: testConfig, fetch: oauth.fetch, tradingConfig: null })
    const response = await app.request('http://127.0.0.1/mcp', {
      headers: { Host: 'rejected.test' },
    })
    expect(response.status).toBe(403)
    expect(events('mcp.http_completed')[0]).toMatchObject({ status: 403 })
    records.length = 0
    await app.request('http://127.0.0.1/healthz', { headers: { Host: '127.0.0.1' } })
    expect(records).toHaveLength(0)
  })

  it('records origin, authorization header and authentication failures without spurious request logs', async () => {
    const app = createApp({ config: testConfig, fetch: oauth.fetch, tradingConfig: null })

    const originResponse = await app.request(
      'http://127.0.0.1/.well-known/oauth-protected-resource',
      {
        headers: { Host: '127.0.0.1', Origin: 'http://localhost:9999' },
      },
    )
    expect(originResponse.status).toBe(403)
    expect(events('mcp.origin_rejected')).toEqual([
      expect.objectContaining({
        method: 'GET',
        path: '/.well-known/[metadata]',
        origin: 'http://localhost:9999',
      }),
    ])

    records.length = 0
    const badHeaderResponse = await app.request('http://127.0.0.1/mcp', {
      method: 'POST',
      headers: {
        Host: '127.0.0.1',
        Authorization: 'Basic abc',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(badHeaderResponse.status).toBe(401)
    expect(events('mcp.authorization_header_rejected')).toHaveLength(1)
    expect(events('mcp.request_received')).toHaveLength(0)

    records.length = 0
    const unauthResponse = await app.request('http://127.0.0.1/mcp', {
      method: 'POST',
      headers: { Host: '127.0.0.1', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'spoofed' },
      }),
    })
    expect(unauthResponse.status).toBe(401)
    expect(events('mcp.authentication_failed')).toEqual([
      expect.objectContaining({ status: 401, hasAuthorization: false }),
    ])
    expect(events('mcp.request_received')).toHaveLength(0)
    expect(events('mcp.http_completed')[0]!['_logMeta']).not.toHaveProperty('targetName')

    records.length = 0
    const outageApp = createApp({
      config: testConfig,
      fetch: async () => new Response('down', { status: 503 }),
      tradingConfig: null,
    })
    const outageResponse = await outageApp.request('http://127.0.0.1/mcp', {
      headers: { Host: '127.0.0.1', Authorization: `Bearer ${token}` },
    })
    expect(outageResponse.status).toBe(500)
    expect(events('mcp.authentication_failed')).toEqual([
      expect.objectContaining({
        status: 500,
        _logMeta: expect.objectContaining({ logLevelName: 'ERROR' }),
      }),
    ])
    expect(events('mcp.http_completed')).toEqual([
      expect.objectContaining({
        status: 500,
        _logMeta: expect.objectContaining({ logLevelName: 'ERROR' }),
      }),
    ])
  })

  it('records protocol rejections and cancelled requests', async () => {
    const app = createApp({ config: testConfig, fetch: oauth.fetch, tradingConfig: null })
    const badMedia = await app.request('http://127.0.0.1/mcp', {
      method: 'POST',
      headers: {
        Host: '127.0.0.1',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/plain',
      },
      body: 'hello',
    })
    expect(badMedia.status).toBe(415)
    expect(events('mcp.request_received')).toHaveLength(0)
    expect(events('mcp.protocol_rejected')).toHaveLength(1)

    records.length = 0
    const controller = new AbortController()
    let started!: () => void
    const toolStarted = new Promise<void>((resolve) => {
      started = resolve
    })
    const cancelApp = createApp({
      config: testConfig,
      fetch: oauth.fetch,
      tradingConfig: null,
      serverFactory: () => {
        const server = new McpServer({ name: 'cancel-test', version: '1.0.0' })
        server.registerTool('slow', {}, async () => {
          started()
          await new Promise(() => undefined)
          return { content: [{ type: 'text', text: 'done' }] }
        })
        return server
      },
    })
    const pending = cancelApp.request('http://127.0.0.1/mcp', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Host: '127.0.0.1',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': 'tools/call',
        'Mcp-Name': 'slow',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'slow',
          arguments: {},
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      }),
    })
    await toolStarted
    controller.abort()
    await pending
    expect(events('mcp.request_completed')).toEqual([
      expect.objectContaining({ result: 'cancelled' }),
    ])
  })

  it('retains request context on default audit logs and warns on gateway and exchange errors', async () => {
    const tradingToken = await oauth.sign({ scope: 'trade:read order:write', agent_id: 'agent-1' })
    let failExchange = true
    const app = createApp({
      config: testConfig,
      tradingConfig,
      fetch: async (input) => {
        const url = String(input)
        if (url === `${testConfig.issuer}/.well-known/oauth-authorization-server`)
          return Response.json(oauth.metadata)
        if (url === oauth.metadata.jwks_uri) return Response.json({ keys: [oauth.jwk] })
        if (url === tradingConfig.tokenEndpoint) {
          if (failExchange) return new Response('unavailable', { status: 503 })
          return Response.json({
            access_token: 'api-token-1',
            token_type: 'Bearer',
            issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
            expires_in: 300,
            scope: 'order:write',
          })
        }
        if (url.endsWith('/orders')) {
          return new Response('bad gateway', {
            status: 502,
            headers: { 'Content-Type': 'text/html', 'X-Request-ID': 'proxy-502' },
          })
        }
        return envelope(signal)
      },
    })

    const sendOrder = () =>
      app.request('http://127.0.0.1/mcp', {
        method: 'POST',
        headers: {
          Host: '127.0.0.1',
          Authorization: `Bearer ${tradingToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'MCP-Protocol-Version': '2026-07-28',
          'Mcp-Method': 'tools/call',
          'Mcp-Name': 'tqx_trading_order',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 99,
          method: 'tools/call',
          params: {
            name: 'tqx_trading_order',
            arguments: {
              request: {
                action: 'place',
                symbol: 'AAPL.US',
                side: 'BUY',
                orderType: 'MARKET',
                quantity: '1',
                idempotencyKey: 'audit-intent-1',
              },
            },
            _meta: {
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
              'io.modelcontextprotocol/clientCapabilities': {},
            },
          },
        }),
      })

    const first = await sendOrder()
    await first.text()
    expect(events('mcp.token_exchange_completed')).toEqual([
      expect.objectContaining({
        result: 'error',
        _logMeta: expect.objectContaining({
          logLevelName: 'WARN',
          requestId: first.headers.get('X-Request-ID'),
        }),
      }),
    ])

    records.length = 0
    failExchange = false
    const second = await sendOrder()
    await second.text()
    expect(events('mcp.gateway_completed')).toEqual([
      expect.objectContaining({
        operation: 'place',
        status: 502,
        result: 'error',
        errorKind: 'protocol',
        upstreamRequestId: 'proxy-502',
        _logMeta: expect.objectContaining({
          logLevelName: 'WARN',
          requestId: second.headers.get('X-Request-ID'),
        }),
      }),
    ])
    expect(events('trading.write')).toEqual([
      expect.objectContaining({
        operation: 'place',
        result: 'error',
        requestId: 'proxy-502',
        idempotencyKey: 'audit-intent-1',
        _logMeta: expect.objectContaining({
          requestId: second.headers.get('X-Request-ID'),
        }),
      }),
    ])
    app.dispose()
  })

  it('renders readable pretty and JSON timestamps in Asia/Shanghai (+08:00), levels and request IDs', () => {
    const prettyLines: string[] = []
    const jsonLines: string[] = []
    const log = createLogger({
      type: 'hidden',
      attachedTransports: [
        {
          format: 'pretty',
          write: (_record, line) => {
            prettyLines.push(line)
          },
        },
        {
          format: 'json',
          write: (_record, line) => {
            jsonLines.push(line)
          },
        },
      ],
    })
    logContext.run({ requestId: 'pretty-request' }, () => log.info({ event: 'preview' }))
    expect(prettyLines).toHaveLength(1)
    expect(prettyLines[0]).toContain('INFO')
    expect(prettyLines[0]).toContain('[pretty-request]')
    expect(prettyLines[0]).not.toContain('{{')
    expect(prettyLines[0]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} /)
    expect(jsonLines).toHaveLength(1)
    expect(jsonLines[0]).toMatch(/"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+08:00"/)
    expect(formatShanghaiTimestamp(new Date('2026-11-16T06:04:39.801Z'))).toEqual({
      pretty: '2026-11-16 14:04:39.801',
      iso: '2026-11-16T14:04:39.801+08:00',
    })
  })

  it('masks nested secrets and honors level and format configuration', async () => {
    vi.stubEnv('MCP_LOG_LEVEL', 'warn')
    vi.stubEnv('MCP_LOG_FORMAT', 'json')
    const captured: unknown[] = []
    const log = createLogger({
      type: 'hidden',
      attachedTransports: [
        (record) => {
          captured.push(record)
        },
      ],
    })
    expect(createLogger().settings.type).toBe('json')
    vi.stubEnv('MCP_LOG_FORMAT', '')
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('VITEST', '')
    expect(createLogger().settings.type).toBe('pretty')
    vi.stubEnv('MCP_LOG_FORMAT', 'json')
    log.info({ event: 'filtered' })
    await logContext.run({ requestId: 'context-test' }, async () => {
      await Promise.resolve()
      log.warn({ nested: { authorization: 'never-log-bearer', client_secret: 'never-log-secret' } })
    })
    expect(captured).toHaveLength(1)
    expect(JSON.stringify(captured)).not.toContain('never-log')
    expect(captured[0]).toMatchObject({ _logMeta: { requestId: 'context-test' } })
  })
})

// Keep test transports isolated from other suites in this worker.
afterAll(() => detach.forEach((stop) => stop()))
