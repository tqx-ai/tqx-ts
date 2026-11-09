import * as v from 'valibot'

import { configurationError, parseList, parsePublicUrl } from './utils/config'

export interface McpConfig {
  readonly resourceUrl: string
  readonly issuer: string
  readonly allowedHosts: readonly string[]
  readonly allowedOrigins: readonly string[]
}

const environmentSchema = v.object({
  TQX_MCP_RESOURCE_URL: v.pipe(v.string(), v.trim(), v.nonEmpty()),
  TQX_MCP_OAUTH_ISSUER: v.pipe(v.string(), v.trim(), v.nonEmpty()),
  TQX_MCP_ALLOWED_HOSTS: v.pipe(v.string(), v.trim(), v.nonEmpty()),
  // An explicitly empty list allows native clients only.
  TQX_MCP_ALLOWED_ORIGINS: v.pipe(v.string(), v.trim()),
  NODE_ENV: v.optional(v.string()),
})

export function loadMcpConfig(
  environment: Record<string, string | undefined> = process.env,
): McpConfig {
  const result = v.safeParse(environmentSchema, environment)
  if (!result.success) {
    const name = String(result.issues[0]?.path?.[0]?.key ?? 'OAuth configuration')
    throw configurationError(name)
  }
  const input = result.output
  const production = input.NODE_ENV === 'production'
  const resourceUrl = parsePublicUrl(input.TQX_MCP_RESOURCE_URL, 'TQX_MCP_RESOURCE_URL', production)
  const issuer = parsePublicUrl(input.TQX_MCP_OAUTH_ISSUER, 'TQX_MCP_OAUTH_ISSUER', production)
  const allowedHosts = parseList(input.TQX_MCP_ALLOWED_HOSTS, 'TQX_MCP_ALLOWED_HOSTS').map(
    (entry) => {
      const hostname = entry.toLowerCase()
      try {
        if (
          hostname.length > 253 ||
          !/^(?:[a-z0-9]+(?:[.-][a-z0-9-]+)*|\[[0-9a-f:]+\])$/.test(hostname) ||
          new URL(`https://${hostname}`).hostname !== hostname
        ) {
          throw configurationError('TQX_MCP_ALLOWED_HOSTS')
        }
      } catch {
        throw configurationError('TQX_MCP_ALLOWED_HOSTS')
      }
      return hostname
    },
  )
  const allowedOrigins = parseList(
    input.TQX_MCP_ALLOWED_ORIGINS,
    'TQX_MCP_ALLOWED_ORIGINS',
    true,
  ).map((entry) => {
    const origin = parsePublicUrl(entry, 'TQX_MCP_ALLOWED_ORIGINS', production)
    if (origin.pathname !== '/') throw configurationError('TQX_MCP_ALLOWED_ORIGINS')
    return origin.origin
  })

  return {
    resourceUrl: resourceUrl.href.replace(/\/$/, ''),
    issuer: issuer.href.replace(/\/$/, ''),
    allowedHosts: [...new Set(allowedHosts)],
    allowedOrigins: [...new Set(allowedOrigins)],
  }
}
