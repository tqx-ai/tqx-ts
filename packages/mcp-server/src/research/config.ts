import type { TradingConfig } from '../trading/config'
import { configurationError, parsePublicUrl } from '../utils/config'

export interface ResearchConfig extends TradingConfig {}

export function loadResearchConfig(
  issuer: string,
  environment: Record<string, string | undefined> = process.env,
): ResearchConfig | undefined {
  const names = [
    'TQX_MCP_RESEARCH_BASE_URL',
    'TQX_MCP_RESEARCH_RESOURCE',
    'TQX_MCP_EXCHANGE_CLIENT_ID',
    'TQX_MCP_EXCHANGE_CLIENT_SECRET',
  ] as const
  // Exchange credentials are shared with Trading; they alone do not enable Research.
  if (names.slice(0, 2).every((name) => environment[name] === undefined)) return undefined
  for (const name of names) if (!environment[name]?.trim()) throw configurationError(name)
  const production = environment.NODE_ENV === 'production'
  const base = parsePublicUrl(environment[names[0]]!.trim(), names[0], production)
  const resource = parsePublicUrl(environment[names[1]]!.trim(), names[1], production)
  if (!/^\/tqxApi\/?$/.test(base.pathname)) throw configurationError(names[0])
  if (!/^[\x21-\x7e]{1,256}$/.test(environment[names[2]]!)) throw configurationError(names[2])
  if (!/^[\x21-\x7e]{1,4096}$/.test(environment[names[3]]!)) throw configurationError(names[3])
  return {
    baseUrl: `${base.origin}/tqxApi/`,
    resource: resource.href.replace(/\/$/, ''),
    tokenEndpoint: `${issuer.replace(/\/$/, '')}/oauth/token`,
    clientId: environment[names[2]]!,
    clientSecret: environment[names[3]]!,
  }
}
