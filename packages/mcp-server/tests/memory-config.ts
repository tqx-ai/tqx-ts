import { type Config, loadConfig } from '../src/config'

export interface MemoryEndpoints {
  issuer: string
  resource: string
  apiResource: string
  tradingBaseUrl: string
}

// No process.env/default dotenv access and no listener/client/storage construction.
// The test owner supplies in-memory AS/Trading handlers on owned temporary loopback ports.
export function createMemoryConfig(
  endpoints: MemoryEndpoints,
  options: { tools?: boolean; writes?: boolean; exchangeSecret?: string } = {},
): Config {
  for (const value of Object.values(endpoints)) {
    const url = new URL(value)
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      !url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error('Memory endpoints must use explicit temporary loopback URLs')
  }
  const resource = new URL(endpoints.resource)
  return loadConfig({
    MCP_HOST: '127.0.0.1',
    MCP_PORT: resource.port,
    MCP_RESOURCE: endpoints.resource,
    MCP_OAUTH_ISSUER: endpoints.issuer,
    MCP_JWKS_URL: `${endpoints.issuer.replace(/\/$/, '')}/.well-known/jwks.json`,
    MCP_ALLOWED_HOSTS: resource.host,
    MCP_ALLOWED_ORIGINS: resource.origin,
    MCP_TRADING_TOOLS_ENABLED: String(options.tools ?? false),
    MCP_TRADING_WRITE_TOOLS_ENABLED: String(options.writes ?? false),
    MCP_API_RESOURCE: endpoints.apiResource,
    MCP_TRADING_BASE_URL: endpoints.tradingBaseUrl,
    MCP_EXCHANGE_CLIENT_SECRET: options.exchangeSecret ?? 'memory-only-synthetic-secret',
    MCP_TLS_TERMINATED_BY_PROXY: 'false',
  })
}
