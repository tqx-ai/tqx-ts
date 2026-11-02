import {
  CLIENT_CAPABILITIES_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from '@modelcontextprotocol/server'
import { beforeEach, describe, expect, it } from 'vitest'

import { version } from '../package.json'
import { createApp } from '../src/app'

type ProtocolVersion = '2025-11-25' | '2026-07-28'

function request(
  app: ReturnType<typeof createApp>,
  protocolVersion: ProtocolVersion,
  method: string,
  params: Record<string, unknown>,
  id: number | undefined,
) {
  const modern = protocolVersion === '2026-07-28'
  return app.request('http://127.0.0.1/mcp', {
    method: 'POST',
    headers: {
      Host: '127.0.0.1',
      ...(method === 'initialize' ? {} : { 'MCP-Protocol-Version': protocolVersion }),
      ...(modern ? { 'Mcp-Method': method } : {}),
      ...(modern && typeof params.name === 'string' ? { 'Mcp-Name': params.name } : {}),
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params: {
        ...params,
        ...(modern
          ? {
              _meta: {
                [PROTOCOL_VERSION_META_KEY]: protocolVersion,
                [CLIENT_CAPABILITIES_META_KEY]: {},
              },
            }
          : {}),
      },
    }),
  })
}

async function readResponse(response: Response, protocolVersion: ProtocolVersion) {
  expect(response.status).toBe(200)
  const text = await response.text()
  // The stateless legacy transport replies with one JSON-RPC message in an SSE event.
  const data = response.headers.get('Content-Type')?.includes('text/event-stream')
    ? text
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice('data:'.length).trimStart())
        .join('\n')
    : text
  const body = JSON.parse(data)
  expect(body).toMatchObject({ jsonrpc: '2.0', id: 1 })
  if (body.result) {
    if (protocolVersion === '2026-07-28') {
      expect(body.result.resultType).toBe('complete')
    } else {
      expect(body.result).not.toHaveProperty('resultType')
    }
  }
  return body
}

describe('MCP server', () => {
  it('serves a health check', async () => {
    const response = await createApp().request('http://127.0.0.1/healthz', {
      headers: { Host: '127.0.0.1' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })
})

describe.each<ProtocolVersion>(['2025-11-25', '2026-07-28'])('MCP %s', (protocolVersion) => {
  let app: ReturnType<typeof createApp>
  let initialization: Awaited<ReturnType<typeof readResponse>>

  function call(method: string, params: Record<string, unknown> = {}) {
    return request(app, protocolVersion, method, params, 1)
  }

  beforeEach(async () => {
    app = createApp()
    if (protocolVersion === '2025-11-25') {
      initialization = await readResponse(
        await call('initialize', {
          protocolVersion,
          capabilities: {},
          clientInfo: { name: 'tqx-mcp-test', version: '1.0.0' },
        }),
        protocolVersion,
      )
      const notification = await request(
        app,
        protocolVersion,
        'notifications/initialized',
        {},
        undefined,
      )
      expect(notification.status).toBe(202)
      expect(await notification.text()).toBe('')
    }
  })

  it('discovers the server version and tool capability using the protocol lifecycle', async () => {
    const serverInfo = { name: '@tqx-ai/mcp-server', version }
    if (protocolVersion === '2025-11-25') {
      expect(initialization).toMatchObject({
        result: { protocolVersion, capabilities: { tools: {} }, serverInfo },
      })
    } else {
      // Modern clients discover directly without an initialize handshake.
      const body = await readResponse(await call('server/discover'), protocolVersion)
      expect(body).toMatchObject({
        result: {
          supportedVersions: [protocolVersion],
          capabilities: { tools: {} },
          _meta: { 'io.modelcontextprotocol/serverInfo': serverInfo },
        },
      })
    }
  })

  it('advertises ping with a required string name', async () => {
    const response = await call('tools/list')

    expect(await readResponse(response, protocolVersion)).toMatchObject({
      result: {
        tools: [
          {
            name: 'ping',
            inputSchema: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            },
          },
        ],
      },
    })
  })

  it('returns pong for each concurrent caller', async () => {
    const names = ['world', 'Alice', 'Bob', '']
    const responses = await Promise.all(
      names.map(async (name) => {
        const response = await call('tools/call', { name: 'ping', arguments: { name } })
        return readResponse(response, protocolVersion)
      }),
    )

    responses.forEach((response, index) => {
      expect(response).toMatchObject({
        result: { content: [{ type: 'text', text: `pong, ${names[index]}` }] },
      })
    })
  })

  it.each([undefined, {}, { name: 42 }, { name: null }])(
    'rejects invalid ping arguments: %j',
    async (args) => {
      const response = await call('tools/call', { name: 'ping', arguments: args })

      expect(await readResponse(response, protocolVersion)).toMatchObject({
        result: {
          isError: true,
          content: [
            {
              type: 'text',
              text: expect.stringContaining('Invalid arguments for tool ping: name:'),
            },
          ],
        },
      })
    },
  )

  it('rejects unknown tools', async () => {
    const response = await call('tools/call', { name: 'unknown', arguments: {} })

    expect(await readResponse(response, protocolVersion)).toMatchObject({ error: { code: -32602 } })
  })
})
