import { describe, expect, it } from 'vitest'

import { loadTradingConfig } from '../src/trading/config'

const issuer = 'https://auth.example.test'
const env = {
  TQX_MCP_TRADING_BASE_URL: 'https://trade.example.test',
  TQX_MCP_TRADING_RESOURCE: 'https://trade.example.test/openapi',
  TQX_MCP_EXCHANGE_CLIENT_ID: 'tqx_mcp_server',
  TQX_MCP_EXCHANGE_CLIENT_SECRET: 'test-secret',
}

describe('trading configuration', () => {
  it('keeps existing auth-only deployments working until trading is configured', () => {
    expect(loadTradingConfig(issuer, {})).toBeUndefined()
    expect(loadTradingConfig(issuer, env)).toEqual({
      baseUrl: 'https://trade.example.test',
      resource: 'https://trade.example.test/openapi',
      tokenEndpoint: `${issuer}/oauth/token`,
      clientId: 'tqx_mcp_server',
      clientSecret: 'test-secret',
    })
  })

  it('passes the configured confidential client ID through to token exchange', () => {
    const custom = { ...env, TQX_MCP_EXCHANGE_CLIENT_ID: 'tqx_mcp_server_test' }
    expect(loadTradingConfig(issuer, custom)?.clientId).toBe('tqx_mcp_server_test')
  })

  it.each(Object.keys(env))('rejects incomplete configuration %s', (name) => {
    expect(() => loadTradingConfig(issuer, { ...env, [name]: undefined })).toThrow(name)
  })

  it.each([
    'https://user:secret@trade.example.test',
    'https://trade.example.test?secret=x',
    'https://trade.example.test/openapi',
  ])('rejects unsafe base URL %s', (baseUrl) => {
    expect(() => loadTradingConfig(issuer, { ...env, TQX_MCP_TRADING_BASE_URL: baseUrl })).toThrow(
      'TQX_MCP_TRADING_BASE_URL',
    )
  })

  it('allows development HTTP and requires production HTTPS', () => {
    const http = {
      ...env,
      TQX_MCP_TRADING_BASE_URL: 'http://localhost:8000',
      TQX_MCP_TRADING_RESOURCE: 'http://localhost:8000/openapi',
    }
    expect(loadTradingConfig(issuer, http)?.baseUrl).toBe('http://localhost:8000')
    expect(() => loadTradingConfig(issuer, { ...http, NODE_ENV: 'production' })).toThrow(
      'TQX_MCP_TRADING_BASE_URL',
    )
  })
})
