import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { PingRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { describe, expect, it, vi } from 'vitest'
import { createProtocolServer } from '../src/protocol'
import { fixture, listBody, rpcHeaders } from './fixture'

describe('official SDK client over stateless HTTP', () => {
  it('initializes and lists an empty tool surface using a synthetic token without agent_id', async () => {
    const f = await fixture()
    const client = new Client({
      name: 'synthetic-integration-client',
      version: '1.0.0',
    })
    const token = await f.sign()
    const seen: { method: string; session: string | null }[] = []
    const transport = new StreamableHTTPClientTransport(new URL(f.config.resource), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
      fetch: async (url, init) => {
        const response = await fetch(url, init)
        if (init?.method === 'POST')
          seen.push({
            method: 'POST',
            session: response.headers.get('Mcp-Session-Id'),
          })
        return response
      },
    })
    try {
      await client.connect(transport)
      expect(client.getServerVersion()).toEqual({
        name: 'tqx-mcp-server',
        version: '0.1.0',
      })
      expect(client.getServerCapabilities()).toEqual({ tools: {} })
      expect(await client.listTools()).toEqual({ tools: [] })
      expect(await client.listTools()).toEqual({ tools: [] })
      expect(transport.sessionId).toBeUndefined()
      expect(seen.length).toBeGreaterThanOrEqual(4)
      expect(seen.every((r) => r.session === null)).toBe(true)
      await vi.waitFor(() => expect(f.service.application.activeRequestCount).toBe(0))
    } finally {
      await client.close()
      await f.close()
    }
  })

  it('isolates simultaneous identities and colliding JSON-RPC ids with fresh server instances', async () => {
    const constructed: { server: McpServer; subject: string }[] = []
    const closed = new Set<McpServer>()
    const f = await fixture({
      serverFactory: (principal) => {
        const server = createProtocolServer()
        constructed.push({ server, subject: principal.subject })
        const close = server.close.bind(server)
        vi.spyOn(server, 'close').mockImplementation(async () => {
          closed.add(server)
          await close()
        })
        // Test-only ping metadata exposes the principal/SDK auth context. No account tool exists.
        server.server.setRequestHandler(PingRequestSchema, async (_request, extra) => {
          await new Promise<void>((resolve) => setTimeout(resolve, 10))
          expect(extra.authInfo?.clientId).toBe(principal.clientId)
          expect(extra.authInfo?.extra?.sub).toBe(principal.subject)
          return {
            _meta: {
              subject: principal.subject,
              clientId: principal.clientId,
              sid: principal.sessionId,
              jti: principal.tokenId,
            },
          }
        })
        return server
      },
    })
    const clients = ['alice', 'bob'].map(
      (name) => new Client({ name: `synthetic-${name}`, version: '1.0.0' }),
    )
    try {
      await Promise.all(
        clients.map(async (client, i) => {
          const subject = `synthetic-${i}`
          const token = await f.sign({
            sub: subject,
            client_id: `client-${i}`,
            sid: `session-${i}`,
            jti: `token-${i}`,
          })
          await client.connect(
            new StreamableHTTPClientTransport(new URL(f.config.resource), {
              requestInit: { headers: { Authorization: `Bearer ${token}` } },
            }),
          )
          for (let n = 0; n < 4; n++) {
            const [ping, tools] = await Promise.all([client.ping(), client.listTools()])
            expect(ping._meta).toEqual({
              subject,
              clientId: `client-${i}`,
              sid: `session-${i}`,
              jti: `token-${i}`,
            })
            expect(tools.tools).toEqual([])
          }
        }),
      )
      expect(constructed.some((item) => item.subject === 'synthetic-0')).toBe(true)
      expect(constructed.some((item) => item.subject === 'synthetic-1')).toBe(true)
      expect(new Set(constructed.map((item) => item.server)).size).toBe(constructed.length)
      await vi.waitFor(() => {
        expect(f.service.application.activeRequestCount).toBe(0)
        expect(closed.size).toBe(constructed.length)
      })
    } finally {
      await Promise.all(clients.map((client) => client.close()))
      await f.close()
    }
  })

  it('cleans resources on a client abort and a forced shutdown of an active request', async () => {
    let started: (() => void) | undefined
    let finished = false
    const f = await fixture({
      serverFactory: () => {
        const server = createProtocolServer()
        server.server.setRequestHandler(PingRequestSchema, async (_request, extra) => {
          started?.()
          await new Promise<void>((resolve) => {
            if (extra.signal.aborted) resolve()
            else
              extra.signal.addEventListener('abort', () => resolve(), {
                once: true,
              })
          })
          finished = true
          return {}
        })
        return server
      },
    })
    f.config.shutdownTimeoutMs = 50
    const token = await f.sign()
    const begin = (signal?: AbortSignal) =>
      fetch(f.config.resource, {
        method: 'POST',
        headers: { ...rpcHeaders, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
        ...(signal ? { signal } : {}),
      })
    try {
      const controller = new AbortController()
      const entered = new Promise<void>((resolve) => {
        started = resolve
      })
      const first = begin(controller.signal).catch(() => undefined)
      await entered
      expect(f.service.application.activeRequestCount).toBe(1)
      controller.abort()
      await first
      await vi.waitFor(() => {
        expect(f.service.application.activeRequestCount).toBe(0)
        expect(finished).toBe(true)
      })
      finished = false
      const enteredAgain = new Promise<void>((resolve) => {
        started = resolve
      })
      const second = begin().catch(() => undefined)
      await enteredAgain
      await f.service.close()
      await second
      await vi.waitFor(() => {
        expect(f.service.application.activeRequestCount).toBe(0)
        expect(finished).toBe(true)
      })
    } finally {
      await f.close()
    }
  })

  it('sanitizes a server construction exception', async () => {
    const f = await fixture({
      serverFactory: () => {
        throw new Error('synthetic private backend exception')
      },
    })
    try {
      const response = await fetch(f.config.resource, {
        method: 'POST',
        headers: { ...rpcHeaders, Authorization: `Bearer ${await f.sign()}` },
        body: listBody,
      })
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: 'internal_server_error' })
    } finally {
      await f.close()
    }
  })
})
