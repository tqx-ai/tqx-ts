import { Client } from '@modelcontextprotocol/client'
import { createMcpHandler, InMemoryTransport } from '@modelcontextprotocol/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { REPORT_MIME, REPORT_URI } from '../src/apps/qube/backtest/resource'
import { createServer } from '../src/server'
import { envelope, researchAuth, setupResearch } from './helpers/research'

const appsCapabilities = {
  extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [REPORT_MIME] } },
}
const disposals: Array<() => void | Promise<void>> = []
afterEach(async () => {
  await Promise.all(disposals.splice(0).map((dispose) => dispose()))
})

function setupServer(era: 'legacy' | 'modern') {
  const runtime = setupResearch()
  disposals.push(runtime.dispose)
  runtime.fetch.mockImplementation(async (url) =>
    envelope(
      new URL(String(url)).pathname.endsWith('/strategies')
        ? { strategies: [], next_cursor: null }
        : { factors: [], next_cursor: null },
    ),
  )
  const server = createServer(
    { era, authInfo: researchAuth() },
    {
      researchGateway: runtime.gateway,
      researchStrategyCache: runtime.strategyCache,
      researchResourceCursorKey: runtime.resourceCursorKey,
      demoPing: false,
    },
  )
  disposals.push(() => server.close())
  return server
}

async function connectLegacy(apps: boolean) {
  const server = setupServer('legacy')
  const client = new Client(
    { name: 'legacy-capabilities-test', version: '1.0.0' },
    {
      capabilities: apps ? appsCapabilities : {},
      versionNegotiation: { mode: 'legacy' },
    },
  )
  disposals.push(() => client.close())
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return client
}

describe('client capabilities compatibility', () => {
  it.each([true, false])(
    'uses initialize capabilities on legacy connections (Apps: %s)',
    async (apps) => {
      const client = await connectLegacy(apps)
      const result = await client.listResources()
      expect(result.resources.map((resource) => resource.uri)).toEqual(apps ? [REPORT_URI] : [])
    },
  )

  it.each([true, false])(
    'uses the modern envelope without consulting legacy capabilities (Apps: %s)',
    async (apps) => {
      const legacyGetter = vi.fn(() => (apps ? {} : appsCapabilities))
      const handler = createMcpHandler((ctx) => {
        const server = setupServer(ctx.era)
        vi.spyOn(server.server, 'getClientCapabilities').mockImplementation(legacyGetter)
        return server
      })
      disposals.push(() => handler.close())
      const response = await handler.fetch(
        new Request('http://127.0.0.1/mcp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            'MCP-Protocol-Version': '2026-07-28',
            'Mcp-Method': 'resources/list',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'resources/list',
            params: {
              _meta: {
                'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                'io.modelcontextprotocol/clientCapabilities': apps ? appsCapabilities : {},
              },
            },
          }),
        }),
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.result.resources.map((resource: { uri: string }) => resource.uri)).toEqual(
        apps ? [REPORT_URI] : [],
      )
      expect(legacyGetter).not.toHaveBeenCalled()
    },
  )
})
