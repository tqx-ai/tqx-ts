import type { McpServerFactory } from '@modelcontextprotocol/server'
import { McpServer, requireScopes } from '@modelcontextprotocol/server'
import { toStandardJsonSchema } from '@valibot/to-json-schema'
import * as v from 'valibot'
import { describe, expect, it, vi } from 'vitest'

import { createApp } from '../src/app'
import { createServer } from '../src/server'
import { createOAuthFixture, testConfig } from './helpers/oauth'

const oauth = await createOAuthFixture()
const token = await oauth.sign()

function call(
  app: ReturnType<typeof createApp>,
  authorization?: string,
  tool = 'tqx_ping',
  url = 'http://127.0.0.1/mcp',
) {
  return app.request(url, {
    method: 'POST',
    headers: {
      Host: '127.0.0.1',
      Origin: 'http://localhost:6274',
      ...(authorization ? { Authorization: authorization } : {}),
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': 'tools/call',
      'Mcp-Name': tool,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: tool,
        arguments: { name: 'world' },
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  })
}

describe('authenticated MCP requests', () => {
  it.each([
    undefined,
    'Basic abc',
    'Bearer not-a-jwt',
    `Bearer ${token}, Bearer other`,
    `Bearer ${token} extra`,
  ])('rejects missing or ambiguous credentials before creating a server', async (authorization) => {
    const factory = vi.fn<McpServerFactory>(createServer)
    const app = createApp({ config: testConfig, fetch: oauth.fetch, serverFactory: factory })
    const response = await call(app, authorization)
    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toContain('resource_metadata=')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:6274')
    expect(factory).not.toHaveBeenCalled()
  })

  it('does not accept a query parameter or a session header as credentials', async () => {
    const app = createApp({ config: testConfig, fetch: oauth.fetch })
    const response = await call(
      app,
      undefined,
      'tqx_ping',
      `http://127.0.0.1/mcp?access_token=${token}`,
    )
    expect(response.status).toBe(401)
    expect(await response.text()).not.toContain(token)
    const session = await app.request('http://127.0.0.1/mcp', {
      headers: { Host: '127.0.0.1', 'Mcp-Session-Id': 'session-123' },
    })
    expect(session.status).toBe(401)
  })

  it('passes each verified identity into its own request factory', async () => {
    const factory = vi.fn<McpServerFactory>(createServer)
    const app = createApp({ config: testConfig, fetch: oauth.fetch, serverFactory: factory })
    const users = ['alice', 'bob', 'carol']
    const responses = await Promise.all(
      users.map(async (sub) => {
        const accessToken = await oauth.sign({ sub, client_id: `${sub}-client`, jti: `${sub}-jti` })
        return call(app, `Bearer ${accessToken}`)
      }),
    )
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200])
    const identities = factory.mock.calls.map(([context]) => context!.authInfo!)
    expect(
      identities.map((auth) => `${auth.extra?.sub}:${auth.clientId}:${auth.extra?.jti}`).toSorted(),
    ).toEqual([
      'alice:alice-client:alice-jti',
      'bob:bob-client:bob-jti',
      'carol:carol-client:carol-jti',
    ])
    identities.forEach((auth) =>
      expect(auth.resourceMetadataUrl).toBe(
        'https://mcp.example.test/.well-known/oauth-protected-resource/mcp',
      ),
    )
  })

  it('returns the SDK scope challenge before invoking a protected tool', async () => {
    const execute = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }))
    const app = createApp({
      config: testConfig,
      fetch: oauth.fetch,
      serverFactory: () => {
        const server = new McpServer({ name: 'scope-test', version: '1.0.0' })
        server.registerTool(
          'protected',
          {
            inputSchema: toStandardJsonSchema(v.object({ name: v.string() })),
            scopeChallenge: requireScopes('research:run'),
          },
          execute,
        )
        return server
      },
    })
    const response = await call(app, `Bearer ${token}`, 'protected')
    expect(response.status).toBe(403)
    expect(response.headers.get('WWW-Authenticate')).toContain('error="insufficient_scope"')
    expect(response.headers.get('WWW-Authenticate')).toContain('scope="research:run"')
    expect(response.headers.get('WWW-Authenticate')).toContain('resource_metadata=')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:6274')
    expect(execute).not.toHaveBeenCalled()
    const authorized = await call(
      app,
      `Bearer ${await oauth.sign({ scope: 'research:read research:run' })}`,
      'protected',
    )
    expect(authorized.status).toBe(200)
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
