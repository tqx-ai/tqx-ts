import assert from 'node:assert/strict'

export const READ_TOOLS = [
  'getAccount',
  'listPositions',
  'listOrders',
  'getOrder',
  'listTrades',
  'listCashFlows',
  'getSignal',
] as const
export const WRITE_TOOLS = ['placeOrder', 'modifyOrder', 'cancelOrder', 'placeOrders'] as const
export type TradingScope = 'trade:read' | 'order:write'
export type ClientProfile = 'baseline' | 'v2'
export interface ClientTarget {
  profile: ClientProfile
  issuer: string
  resource: string
  apiResource: string
  scopes: TradingScope[]
}
export function loopbackUrl(value: string, path?: string): string {
  assert(value && !/[\s\\]/.test(value), 'Invalid fixture URL')
  const url = new URL(value)
  assert.equal(url.protocol, 'http:', 'Only local HTTP fixtures are supported')
  assert(
    ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname),
    'Fixture URL must use an explicit loopback host',
  )
  assert(
    !url.username && !url.password && !url.search && !url.hash,
    'Fixture URL cannot contain credentials, query or fragment',
  )
  if (path !== undefined) assert.equal(url.pathname, path, 'Unexpected fixture resource path')
  return value
}
export function parseScopes(value: string): TradingScope[] {
  const scopes = value.split(/[ ,]+/).filter(Boolean)
  assert(scopes.length > 0 && scopes.length <= 2, 'Request one or two supported trading scopes')
  assert.equal(new Set(scopes).size, scopes.length, 'Duplicate requested scope')
  assert(
    scopes.every((scope) => scope === 'trade:read' || scope === 'order:write'),
    'Unsupported client scope',
  )
  return scopes as TradingScope[]
}
export function clientTarget(env: Record<string, string | undefined> = process.env): ClientTarget {
  assert(
    !env.TQX_CODEX_CLIENT_SECRET && !env.TQX_CODEX_EXCHANGE_CLIENT_SECRET,
    'Client configuration must not accept service secrets',
  )
  const profile = env.TQX_CODEX_PROFILE ?? 'baseline'
  assert(profile === 'baseline' || profile === 'v2', 'Unknown client profile')
  const scopes = parseScopes(env.TQX_CODEX_SCOPES ?? 'trade:read')
  if (profile === 'baseline')
    assert.deepEqual(
      scopes,
      ['trade:read'],
      'Baseline is read-only; explicitly choose v2 for write-scope tests',
    )
  return {
    profile,
    issuer: loopbackUrl(
      env.TQX_CODEX_ISSUER ??
        (profile === 'v2' ? 'http://127.0.0.1:26825' : 'http://127.0.0.1:26823'),
      '/',
    ),
    resource: loopbackUrl(
      env.TQX_CODEX_MCP_RESOURCE ??
        (profile === 'v2' ? 'http://127.0.0.1:3004/mcp' : 'http://127.0.0.1:3002/mcp'),
      '/mcp',
    ),
    apiResource: loopbackUrl(
      env.TQX_CODEX_API_RESOURCE ??
        (profile === 'v2' ? 'http://127.0.0.1:8102/api' : 'http://127.0.0.1:8100/api'),
      '/api',
    ),
    scopes,
  }
}
export function expectedTools(target: ClientTarget): string[] {
  if (target.profile === 'baseline') return ['getAccount', 'listPositions']
  return [
    ...(target.scopes.includes('trade:read') ? READ_TOOLS : []),
    ...(target.scopes.includes('order:write') ? WRITE_TOOLS : []),
  ].sort()
}
export function targetConfig(target: ClientTarget): string {
  return `mcp_oauth_credentials_store = "file"\n[mcp_servers.tqx]\nurl = ${JSON.stringify(target.resource)}\nscopes = ${JSON.stringify(target.scopes)}\nenabled_tools = ${JSON.stringify(expectedTools(target))}\n`
}
