import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import express, { type ErrorRequestHandler, type RequestHandler } from 'express'
import { authMiddleware, type Principal } from './auth'
import { type Config, supportedScopes } from './config'
import { createProtocolServer } from './protocol'

export interface ApplicationOptions {
  // Injectable construction seam for isolated protocol tests. Production uses the empty factory.
  serverFactory?: (principal: Principal) => McpServer
}

function boundary(config: Config): RequestHandler {
  const allowedHeaders = new Set([
    'authorization',
    'content-type',
    'mcp-protocol-version',
    'mcp-session-id',
    'last-event-id',
    'accept',
  ])
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.vary('Origin')
    const count = (name: string) =>
      req.rawHeaders.filter((v, i) => i % 2 === 0 && v.toLowerCase() === name).length
    // The SDK validates hostnames too. This check additionally binds the exact authority/port.
    if (
      count('host') !== 1 ||
      !req.headers.host ||
      !config.allowedHosts.includes(req.headers.host)
    ) {
      res.status(403).json({ error: 'forbidden_host' })
      return
    }
    const origin = req.headers.origin
    if (count('origin') > 1 || (origin !== undefined && !config.allowedOrigins.includes(origin))) {
      res.status(403).json({ error: 'forbidden_origin' })
      return
    }
    if (origin !== undefined) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, MCP-Protocol-Version')
    }
    if (req.method === 'OPTIONS') {
      const method = req.headers['access-control-request-method']
      const headers = req.headers['access-control-request-headers']
      if (
        (method !== undefined &&
          (typeof method !== 'string' || !['GET', 'POST', 'DELETE', 'OPTIONS'].includes(method))) ||
        (headers !== undefined &&
          (typeof headers !== 'string' ||
            headers.split(',').some((v) => !allowedHeaders.has(v.trim().toLowerCase()))))
      ) {
        res.status(403).json({ error: 'forbidden_preflight' })
        return
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', [...allowedHeaders].join(', '))
      res.status(204).end()
      return
    }
    // Native clients deliberately omit Origin; bearer authentication still applies.
    next()
  }
}

export function createApplication(config: Config, options: ApplicationOptions = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.enable('strict routing')
  app.enable('case sensitive routing')
  // Never derive issuer/resource/authority from forwarded headers or a request URL.
  app.set('trust proxy', false)
  let draining = false
  const active = new Set<() => Promise<void>>()
  app.use(boundary(config))
  app.use((_req, res, next) => {
    if (draining) {
      res.status(503).json({ error: 'shutting_down' })
      return
    }
    next()
  })
  const authorization = authMiddleware(config)
  app.all('/mcp', authorization)
  // SDK host validation precedes its bounded default JSON parser (100 KiB).
  app.use(
    createMcpExpressApp({
      host: config.host,
      allowedHosts: [...new Set(config.allowedHosts.map((v) => new URL(`http://${v}`).hostname))],
    }),
  )
  app.all('/mcp', authorization.ensureFresh)
  app.get('/healthz', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json({ status: 'ok', checks: 'process-only' })
  })
  app.get(
    ['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-protected-resource'],
    (_req, res) => {
      res.json({
        resource: config.resource,
        authorization_servers: [config.issuer],
        scopes_supported: supportedScopes(config),
        bearer_methods_supported: ['header'],
      })
    },
  )
  app.post('/mcp', async (req, res) => {
    const principal = res.locals.principal as Principal
    const disconnected = new AbortController()
    const server = options.serverFactory
      ? options.serverFactory(principal)
      : createProtocolServer(
          config.tradingToolsEnabled
            ? {
                config,
                access: res.locals.apiAccess,
                signal: disconnected.signal,
              }
            : undefined,
        )
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    let closing: Promise<void> | undefined
    const close = (): Promise<void> => {
      if (!closing) {
        closing = (async () => {
          // Server.close also closes its connected transport. The explicit close covers
          // failure before connect; both operations are safe and settled independently.
          await Promise.allSettled([server.close(), transport.close()])
          active.delete(close)
        })()
      }
      return closing
    }
    active.add(close)
    // Attach before connect/handleRequest so fast notifications and aborts also clean up.
    res.once('close', () => {
      disconnected.abort()
      void close()
    })
    try {
      await server.connect(transport)
      if (res.destroyed) {
        await close()
        return
      }
      await transport.handleRequest(req, res, req.body)
    } catch {
      if (!res.headersSent && !res.destroyed) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        })
      } else if (!res.writableEnded) res.end()
      await close()
    }
  })
  app.all('/mcp', (_req, res) => {
    res.setHeader('Allow', 'POST, OPTIONS')
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed' },
      id: null,
    })
  })
  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' })
  })
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (res.headersSent) {
      res.end()
      return
    }
    const type =
      typeof error === 'object' && error !== null && 'type' in error ? error.type : undefined
    if (type === 'entity.parse.failed') {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32700, message: 'Parse error' },
        id: null,
      })
    } else if (type === 'entity.too.large') {
      res.status(413).json({ error: 'request_too_large' })
    } else if (type === 'charset.unsupported' || type === 'encoding.unsupported') {
      res.status(415).json({ error: 'unsupported_encoding' })
    } else {
      res.status(500).json({ error: 'internal_server_error' })
    }
  }
  app.use(errors)
  return {
    app,
    beginShutdown: () => {
      draining = true
    },
    closeRequests: async () => {
      // Auth/JWKS work can precede construction of a protocol server/transport.
      authorization.close()
      await Promise.allSettled([...active].map((close) => close()))
    },
    get activeRequestCount() {
      return active.size
    },
  }
}
