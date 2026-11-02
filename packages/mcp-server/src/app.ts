import { createMcpHonoApp } from '@modelcontextprotocol/hono'
import type { McpServerFactory, OAuthTokenVerifier } from '@modelcontextprotocol/server'
import {
  bearerAuthChallengeResponse,
  createMcpHandler,
  OAuthError,
  OAuthErrorCode,
  requireBearerAuth,
} from '@modelcontextprotocol/server'
import type { Context } from 'hono'
import { cors } from 'hono/cors'

import { createResourceMetadata } from './auth/metadata'
import { createTokenVerifier } from './auth/verifier'
import type { VerifierOptions } from './auth/verifier'
import { loadMcpConfig } from './config'
import type { McpConfig } from './config'
import { createServer } from './server'

export interface AppOptions extends VerifierOptions {
  config?: McpConfig
  verifier?: OAuthTokenVerifier
  serverFactory?: McpServerFactory
}

export function createApp(options: AppOptions = {}) {
  const config = options.config ?? loadMcpConfig()
  const app = createMcpHonoApp({
    allowedHosts: [...config.allowedHosts],
    allowedOrigins: config.allowedOrigins.map((origin) => new URL(origin).hostname),
  })
  const handler = createMcpHandler(options.serverFactory ?? createServer)
  const metadata = createResourceMetadata(config)
  const authenticate = requireBearerAuth({
    verifier: options.verifier ?? createTokenVerifier(config, options),
    expectedResource: new URL(config.resourceUrl),
    resourceMetadataUrl: metadata.url.href,
  })

  app.use('*', async (c, next) => {
    const origin = c.req.header('Origin')
    // The SDK validates origin hostnames; also bind scheme and port for browser clients.
    if (origin && !config.allowedOrigins.includes(origin))
      return c.json({ error: 'Forbidden origin' }, 403)
    await next()
  })
  app.use(
    '*',
    cors({
      origin: [...config.allowedOrigins],
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: [
        'Authorization',
        'Content-Type',
        'Accept',
        'MCP-Protocol-Version',
        'Mcp-Session-Id',
        'Mcp-Method',
        'Mcp-Name',
        'Last-Event-ID',
      ],
      exposeHeaders: ['WWW-Authenticate', 'Mcp-Session-Id', 'MCP-Protocol-Version'],
      maxAge: 600,
    }),
  )

  app.get('/healthz', (c) => c.json({ status: 'ok' }))
  app.get(metadata.url.pathname, (c) => c.json(metadata.document))
  if (metadata.url.pathname !== '/.well-known/oauth-protected-resource') {
    app.get('/.well-known/oauth-protected-resource', (c) => c.json(metadata.document))
  }
  app.all('/mcp', async (c: Context) => {
    c.header('Cache-Control', 'no-store')
    const authorization = c.req.header('Authorization')
    if (authorization && !/^Bearer [^\s,]+$/i.test(authorization)) {
      return bearerAuthChallengeResponse(
        new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid Authorization header'),
        { resourceMetadataUrl: metadata.url.href },
      )
    }
    const authInfo = await authenticate(c.req.raw)
    if (authInfo instanceof Response) return authInfo
    return handler.fetch(c.req.raw, { parsedBody: c.get('parsedBody'), authInfo })
  })

  return app
}
