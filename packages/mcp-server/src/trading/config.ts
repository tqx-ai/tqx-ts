import { configurationError, parsePublicUrl } from '../utils/config'

export interface TradingConfig {
  readonly baseUrl: string
  readonly resource: string
  readonly tokenEndpoint: string
  readonly clientId: string
  readonly clientSecret: string
}

// All-or-nothing opt-in preserves authentication-only deployments.
export function loadTradingConfig(
  issuer: string,
  environment: Record<string, string | undefined> = process.env,
): TradingConfig | undefined {
  const names = [
    'TQX_MCP_TRADING_BASE_URL',
    'TQX_MCP_TRADING_RESOURCE',
    'TQX_MCP_EXCHANGE_CLIENT_ID',
    'TQX_MCP_EXCHANGE_CLIENT_SECRET',
  ] as const
  if (names.every((name) => environment[name] === undefined)) return undefined
  for (const name of names) {
    if (!environment[name]?.trim()) throw configurationError(name)
  }
  if (!/^[\x21-\x7e]{1,4096}$/.test(environment.TQX_MCP_EXCHANGE_CLIENT_SECRET!))
    throw configurationError(names[3])
  const production = environment.NODE_ENV === 'production'
  const baseUrl = parsePublicUrl(environment.TQX_MCP_TRADING_BASE_URL!.trim(), names[0], production)
  const resource = parsePublicUrl(
    environment.TQX_MCP_TRADING_RESOURCE!.trim(),
    names[1],
    production,
  )
  if (baseUrl.pathname !== '/') throw configurationError(names[0])
  if (!/^[\x21-\x7e]{1,256}$/.test(environment.TQX_MCP_EXCHANGE_CLIENT_ID!))
    throw configurationError(names[2])
  return {
    baseUrl: baseUrl.origin,
    resource: resource.href.replace(/\/$/, ''),
    tokenEndpoint: `${issuer.replace(/\/$/, '')}/oauth/token`,
    clientId: environment.TQX_MCP_EXCHANGE_CLIENT_ID!.trim(),
    clientSecret: environment.TQX_MCP_EXCHANGE_CLIENT_SECRET!,
  }
}
