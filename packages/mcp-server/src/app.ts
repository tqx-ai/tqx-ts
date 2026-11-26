import { createMcpHonoApp } from '@modelcontextprotocol/hono'
import type { McpServerFactory, OAuthTokenVerifier } from '@modelcontextprotocol/server'
import type { SkillsExtension } from '@modelcontextprotocol/server/ext/skills'
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
import { getDefaultPluginSkills } from './skills'
import { loadTradingConfig } from './trading/config'
import type { TradingConfig } from './trading/config'
import { createTradingRuntime } from './trading/runtime'
import type { TradingRuntimeOptions } from './trading/runtime'
import { loadResearchConfig, type ResearchConfig } from './research/config'
import { createResearchRuntime, type ResearchRuntimeOptions } from './research/runtime'

import { readClientDistribution } from './utils/client-distribution'
import { getLogger, logContext, logLabel } from './utils/logger'
import {
  createLoggedApp,
  logPath,
  observeMcpServer,
  recordMcpRequest,
} from './utils/request-logging'

const authLog = getLogger('auth')
const auditLog = getLogger('audit')

const anonymousMethods = new Set([
  'initialize',
  'notifications/initialized',
  'server/discover',
  'tools/list',
  'ping',
])

function allowsAnonymousDiscovery(method: string, body: unknown): boolean {
  if (method !== 'POST' || typeof body !== 'object' || body === null || Array.isArray(body))
    return false
  const message = body as Record<string, unknown>
  return (
    message.jsonrpc === '2.0' &&
    typeof message.method === 'string' &&
    anonymousMethods.has(message.method)
  )
}

export interface AppOptions extends VerifierOptions {
  config?: McpConfig
  verifier?: OAuthTokenVerifier
  serverFactory?: McpServerFactory
  tradingConfig?: TradingConfig | null
  trading?: TradingRuntimeOptions
  researchConfig?: ResearchConfig | null
  research?: ResearchRuntimeOptions
  skills?: SkillsExtension | Promise<SkillsExtension> | null
  demoPing?: boolean
}

export function createApp(options: AppOptions = {}) {
  const config = options.config ?? loadMcpConfig()
  const app = createLoggedApp()
  const mcpApp = createMcpHonoApp({
    allowedHosts: [...config.allowedHosts],
    allowedOrigins: config.allowedOrigins.map((origin) => new URL(origin).hostname),
  })
  const tradingConfig =
    options.tradingConfig === undefined ? loadTradingConfig(config.issuer) : options.tradingConfig
  const runtime = tradingConfig
    ? createTradingRuntime(config.issuer, tradingConfig, {
        fetch: options.fetch,
        now: options.now,
        audit: (event) => auditLog.info({ event: `${event.domain}.write`, ...event }),
        ...options.trading,
      })
    : undefined
  const researchConfig =
    options.researchConfig === undefined
      ? loadResearchConfig(config.issuer)
      : options.researchConfig
  const researchRuntime = researchConfig
    ? createResearchRuntime(config.issuer, researchConfig, {
        fetch: options.fetch,
        now: options.now,
        ...options.research,
      })
    : undefined
  let resolvedSkills: Promise<SkillsExtension> | undefined =
    options.skills === undefined || options.skills === null
      ? undefined
      : Promise.resolve(options.skills)
  const getSkills = () => {
    if (options.skills === null) return undefined
    resolvedSkills ??= getDefaultPluginSkills()
    return resolvedSkills
  }
  const factory: McpServerFactory =
    options.serverFactory ??
    (async (context) => {
      const hasLocalSkills = context.requestInfo
        ? readClientDistribution(context.requestInfo).hasLocalSkills
        : false
      const pendingSkills = !hasLocalSkills ? getSkills() : undefined
      const skills = pendingSkills ? await pendingSkills : null
      return createServer(context, {
        gateway: runtime?.gateway,
        researchGateway: researchRuntime?.gateway,
        researchStrategyCache: researchRuntime?.strategyCache,
        researchResourceCursorKey: researchRuntime?.resourceCursorKey,
        skills,
        now: options.now,
        demoPing:
          options.demoPing ??
          ((!runtime && !researchRuntime) || process.env.NODE_ENV !== 'production'),
      })
    })
  const handler = createMcpHandler(async (context) => observeMcpServer(await factory(context)), {
    onerror: (error) =>
      getLogger('protocol').warn({
        event: 'mcp.protocol_rejected',
        errorType: logLabel(error.name),
        errorCode: 'code' in error && typeof error.code === 'number' ? error.code : undefined,
      }),
  })
  const metadata = createResourceMetadata(config)
  const authenticate = requireBearerAuth({
    verifier: options.verifier ?? createTokenVerifier(config, options),
    expectedResource: new URL(config.resourceUrl),
    resourceMetadataUrl: metadata.url.href,
  })

  mcpApp.use('*', async (c, next) => {
    const origin = c.req.header('Origin')
    // The SDK validates origin hostnames; also bind scheme and port for browser clients.
    if (origin && !config.allowedOrigins.includes(origin)) {
      authLog.warn({
        event: 'mcp.origin_rejected',
        method: c.req.method,
        path: logPath(c.req.path),
        origin: logLabel(origin),
      })
      return c.json({ error: 'Forbidden origin' }, 403)
    }
    await next()
  })
  mcpApp.use(
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
        'X-TQX-Distribution',
        'X-TQX-Skill-Bundle-Version',
      ],
      exposeHeaders: ['WWW-Authenticate', 'Mcp-Session-Id', 'MCP-Protocol-Version', 'X-Request-ID'],
      maxAge: 600,
    }),
  )

  mcpApp.get('/healthz', (c) => c.json({ status: 'ok' }))
  mcpApp.get(metadata.url.pathname, (c) => c.json(metadata.document))
  if (metadata.url.pathname !== '/.well-known/oauth-protected-resource') {
    mcpApp.get('/.well-known/oauth-protected-resource', (c) => c.json(metadata.document))
  }
  mcpApp.all('/mcp', async (c: Context) => {
    c.header('Cache-Control', 'no-store')
    const authorization = c.req.header('Authorization')
    const parsedBody = c.get('parsedBody')
    // Discovery is public; credentials supplied by a client must still be verified.
    // Inspect the bounded SDK-parsed body, never the client-controlled Mcp-Method hint.
    if (authorization === undefined && allowsAnonymousDiscovery(c.req.method, parsedBody)) {
      recordMcpRequest(parsedBody, c.req.header('MCP-Protocol-Version'))
      return handler.fetch(c.req.raw, { parsedBody })
    }
    if (authorization && !/^Bearer [^\s,]+$/i.test(authorization)) {
      authLog.warn({
        event: 'mcp.authorization_header_rejected',
        method: c.req.method,
        path: logPath(c.req.path),
        origin: logLabel(c.req.header('Origin')),
      })
      return bearerAuthChallengeResponse(
        new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid Authorization header'),
        { resourceMetadataUrl: metadata.url.href },
      )
    }
    const authInfo = await authenticate(c.req.raw)
    if (authInfo instanceof Response) {
      const level = authInfo.status >= 500 ? 'error' : 'info'
      authLog[level]({
        event: 'mcp.authentication_failed',
        method: c.req.method,
        path: logPath(c.req.path),
        origin: logLabel(c.req.header('Origin')),
        status: authInfo.status,
        hasAuthorization: Boolean(authorization),
      })
      return authInfo
    }
    const context = logContext.getStore()
    if (context) context.clientId = authInfo.clientId
    if (parsedBody !== undefined) {
      recordMcpRequest(parsedBody, c.req.header('MCP-Protocol-Version'))
    }
    return handler.fetch(c.req.raw, { parsedBody, authInfo })
  })

  app.route('/', mcpApp)

  return Object.assign(app, {
    dispose: () => {
      runtime?.dispose()
      researchRuntime?.dispose()
    },
  })
}
