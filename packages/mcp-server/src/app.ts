import { createMcpHonoApp } from '@modelcontextprotocol/hono'
import { createMcpHandler } from '@modelcontextprotocol/server'
import type { Context } from 'hono'

import { createServer } from './server'

export function createApp() {
  const app = createMcpHonoApp()
  const handler = createMcpHandler(createServer)

  app.get('/healthz', (c) => c.json({ status: 'ok' }))
  app.all('/mcp', (c: Context) => handler.fetch(c.req.raw, { parsedBody: c.get('parsedBody') }))

  return app
}
