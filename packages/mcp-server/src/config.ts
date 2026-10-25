import { isIP } from 'node:net'
import { mcpEnvironment, type McpEnvironment } from './environment'

export const REQUIRED_SCOPE = 'trade:read'
export const WRITE_SCOPE = 'order:write'
export const EXCHANGE_CLIENT_ID = 'tqx_mcp_server'

export interface Config {
  environment: McpEnvironment
  host: string
  port: number
  resource: string
  issuer: string
  jwksUrl: string
  allowedHosts: string[]
  allowedOrigins: string[]
  tlsCertFile: string | undefined
  tlsKeyFile: string | undefined
  tlsTerminatedByProxy: boolean
  jwksTimeoutMs: number
  jwksCacheMaxAgeMs: number
  jwksCooldownMs: number
  shutdownTimeoutMs: number
  requestTimeoutMs: number
  headersTimeoutMs: number
  keepAliveTimeoutMs: number
  tradingToolsEnabled: boolean
  tradingWriteToolsEnabled: boolean
  apiResource: string
  tradingBaseUrl: string
  exchangeClientSecret: string | undefined
  exchangeTimeoutMs: number
  tradingTimeoutMs: number
}

function fail(name: string): never {
  // Never include environment values: they may contain credentials.
  throw new Error(`Invalid configuration: ${name}`)
}

export function isLoopback(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  )
}

function secureUrl(name: string, value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return fail(name)
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    (url.protocol !== 'https:' && !isLoopback(url.hostname)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.hostname.includes('*') ||
    /[\s"\\?#]/.test(value)
  )
    fail(name)
  return url
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const read = (name: string, fallback: string) => env[name]?.trim() || fallback
  const int = (name: string, fallback: number, min = 1, max = 2_147_483_647) => {
    const raw = read(name, String(fallback))
    const value = Number(raw)
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) fail(name)
    return value
  }
  const bool = (name: string) => {
    const value = read(name, 'false')
    if (value !== 'true' && value !== 'false') fail(name)
    return value === 'true'
  }
  const host = read('MCP_HOST', '127.0.0.1')
  if (!isIP(host) && host !== 'localhost') fail('MCP_HOST')
  const port = int('MCP_PORT', 3002, 1, 65535)
  const authority = host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`
  const resource = read('MCP_RESOURCE', `http://${authority}/mcp`)
  const resourceUrl = secureUrl('MCP_RESOURCE', resource)
  if (resourceUrl.pathname !== '/mcp' || resourceUrl.href !== resource) fail('MCP_RESOURCE')
  if (!isLoopback(host) && resourceUrl.protocol !== 'https:') fail('MCP_RESOURCE')
  const issuer = read('MCP_OAUTH_ISSUER', 'http://127.0.0.1:26823')
  secureUrl('MCP_OAUTH_ISSUER', issuer)
  const jwksUrl = read('MCP_JWKS_URL', `${issuer.replace(/\/$/, '')}/.well-known/jwks.json`)
  secureUrl('MCP_JWKS_URL', jwksUrl)
  const allowedHosts = read('MCP_ALLOWED_HOSTS', resourceUrl.host)
    .split(',')
    .map((v) => v.trim())
  for (const value of allowedHosts) {
    let parsed: URL
    try {
      parsed = new URL(`http://${value}`)
    } catch {
      return fail('MCP_ALLOWED_HOSTS')
    }
    // Exact authority matching, including the port; no wildcards or URL parts.
    if (
      !value ||
      /[\s*]/.test(value) ||
      parsed.host !== value ||
      parsed.href !== `http://${value}/`
    )
      fail('MCP_ALLOWED_HOSTS')
  }
  const allowedOrigins = read('MCP_ALLOWED_ORIGINS', resourceUrl.origin)
    .split(',')
    .map((v) => v.trim())
  for (const value of allowedOrigins) {
    if (secureUrl('MCP_ALLOWED_ORIGINS', value).origin !== value) fail('MCP_ALLOWED_ORIGINS')
  }
  const tlsCertFile = env.MCP_TLS_CERT_FILE?.trim() || undefined
  const tlsKeyFile = env.MCP_TLS_KEY_FILE?.trim() || undefined
  const tlsTerminatedByProxy = bool('MCP_TLS_TERMINATED_BY_PROXY')
  if (Boolean(tlsCertFile) !== Boolean(tlsKeyFile)) fail('MCP_TLS_CERT_FILE/MCP_TLS_KEY_FILE')
  if (tlsCertFile && tlsTerminatedByProxy) fail('MCP_TLS_TERMINATED_BY_PROXY')
  if (resourceUrl.protocol === 'https:' && !tlsCertFile && !tlsTerminatedByProxy)
    fail('MCP_TLS_CERT_FILE/MCP_TLS_TERMINATED_BY_PROXY')
  if (resourceUrl.protocol === 'http:' && (tlsCertFile || tlsTerminatedByProxy))
    fail('MCP_RESOURCE')
  const requestTimeoutMs = int('MCP_REQUEST_TIMEOUT_MS', 30_000)
  const headersTimeoutMs = int('MCP_HEADERS_TIMEOUT_MS', 10_000)
  if (headersTimeoutMs > requestTimeoutMs) fail('MCP_HEADERS_TIMEOUT_MS')
  const tradingToolsEnabled = bool('MCP_TRADING_TOOLS_ENABLED')
  const tradingWriteToolsEnabled = bool('MCP_TRADING_WRITE_TOOLS_ENABLED')
  const apiResource = read('MCP_API_RESOURCE', 'http://127.0.0.1:8100/api')
  if (secureUrl('MCP_API_RESOURCE', apiResource).href !== apiResource || apiResource === resource)
    fail('MCP_API_RESOURCE')
  const tradingBaseUrl = read('MCP_TRADING_BASE_URL', 'http://127.0.0.1:8100')
  if (secureUrl('MCP_TRADING_BASE_URL', tradingBaseUrl).origin !== tradingBaseUrl)
    fail('MCP_TRADING_BASE_URL')
  const exchangeClientSecret = env.MCP_EXCHANGE_CLIENT_SECRET || undefined
  if (
    tradingToolsEnabled &&
    (!exchangeClientSecret?.trim() ||
      [...exchangeClientSecret].some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
      ))
  )
    fail('MCP_EXCHANGE_CLIENT_SECRET')
  return {
    environment: mcpEnvironment(env),
    host,
    port,
    resource,
    issuer,
    jwksUrl,
    allowedHosts,
    allowedOrigins,
    tlsCertFile,
    tlsKeyFile,
    tlsTerminatedByProxy,
    jwksTimeoutMs: int('MCP_JWKS_TIMEOUT_MS', 5_000),
    jwksCacheMaxAgeMs: int('MCP_JWKS_CACHE_MAX_AGE_MS', 600_000),
    jwksCooldownMs: int('MCP_JWKS_COOLDOWN_MS', 30_000, 0),
    shutdownTimeoutMs: int('MCP_SHUTDOWN_TIMEOUT_MS', 5_000),
    requestTimeoutMs,
    headersTimeoutMs,
    keepAliveTimeoutMs: int('MCP_KEEP_ALIVE_TIMEOUT_MS', 5_000),
    tradingToolsEnabled,
    tradingWriteToolsEnabled,
    apiResource,
    tradingBaseUrl,
    exchangeClientSecret,
    exchangeTimeoutMs: int('MCP_EXCHANGE_TIMEOUT_MS', 5_000),
    tradingTimeoutMs: int('MCP_TRADING_TIMEOUT_MS', 10_000),
  }
}

export function supportedScopes(config: Config): string[] {
  return config.tradingToolsEnabled && config.tradingWriteToolsEnabled
    ? [REQUIRED_SCOPE, WRITE_SCOPE]
    : [REQUIRED_SCOPE]
}

export function exchangeScopes(config: Config, scopes: string[]): string[] {
  return supportedScopes(config).filter((scope) => scopes.includes(scope))
}

export function resourceMetadataUrl(config: Config): string {
  return new URL('/.well-known/oauth-protected-resource/mcp', config.resource).href
}
