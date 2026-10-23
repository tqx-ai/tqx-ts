import { describe, expect, it } from 'vitest'
import { loadConfig, resourceMetadataUrl } from '../src/config'

describe('runtime configuration', () => {
  it('has explicit local defaults and deterministic RFC9728 metadata URL', () => {
    const config = loadConfig({})
    expect(config).toMatchObject({
      host: '127.0.0.1',
      port: 3002,
      resource: 'http://127.0.0.1:3002/mcp',
      issuer: 'http://127.0.0.1:26823',
      jwksUrl: 'http://127.0.0.1:26823/.well-known/jwks.json',
      allowedHosts: ['127.0.0.1:3002'],
      allowedOrigins: ['http://127.0.0.1:3002'],
    })
    expect(resourceMetadataUrl(config)).toBe(
      'http://127.0.0.1:3002/.well-known/oauth-protected-resource/mcp',
    )
  })
  it.each([
    { MCP_PORT: '0' },
    { MCP_PORT: '65536' },
    { MCP_PORT: 'NaN' },
    { MCP_HOST: 'untrusted.example' },
    { MCP_HOST: '0.0.0.0' },
    { MCP_RESOURCE: 'http://remote.example/mcp' },
    { MCP_RESOURCE: 'http://127.0.0.1:3002/mcp/' },
    { MCP_RESOURCE: 'http://127.0.0.1:3002/mcp?x=1' },
    { MCP_RESOURCE: 'http://127.0.0.1:3002/mcp#fragment' },
    { MCP_RESOURCE: 'http://127.0.0.1:3002/mcp#' },
    { MCP_JWKS_URL: 'http://127.0.0.1:26823/.well-known/jwks.json?' },
    { MCP_RESOURCE: 'http://user:secret@127.0.0.1:3002/mcp' },
    { MCP_OAUTH_ISSUER: 'ftp://127.0.0.1' },
    { MCP_JWKS_URL: 'http://remote.example/keys' },
    { MCP_ALLOWED_HOSTS: '*.example.com' },
    { MCP_ALLOWED_HOSTS: '127.0.0.1:3002/path' },
    { MCP_ALLOWED_HOSTS: 'user@127.0.0.1:3002' },
    { MCP_ALLOWED_HOSTS: '127.0.0.1:3002,' },
    { MCP_ALLOWED_ORIGINS: 'null' },
    { MCP_ALLOWED_ORIGINS: 'https://*.example.com' },
    { MCP_ALLOWED_ORIGINS: 'https://example.com/path' },
    { MCP_ALLOWED_ORIGINS: 'https://example.com/' },
    { MCP_TLS_CERT_FILE: 'cert.pem' },
    { MCP_TLS_TERMINATED_BY_PROXY: 'yes' },
    { MCP_RESOURCE: 'https://mcp.example.com/mcp' },
    { MCP_JWKS_TIMEOUT_MS: '-1' },
    { MCP_SHUTDOWN_TIMEOUT_MS: '0' },
    { MCP_HEADERS_TIMEOUT_MS: '50000' },
    { MCP_TRADING_TOOLS_ENABLED: 'yes' },
    { MCP_TRADING_TOOLS_ENABLED: 'true' },
    { MCP_API_RESOURCE: 'http://remote.invalid/api' },
    { MCP_API_RESOURCE: 'http://127.0.0.1:3002/mcp' },
    { MCP_TRADING_BASE_URL: 'http://127.0.0.1:8100/api' },
    { MCP_EXCHANGE_TIMEOUT_MS: '0' },
  ])('rejects unsafe or malformed configuration: %j', (env) => {
    expect(() => loadConfig(env)).toThrow('Invalid configuration:')
  })
  it('accepts an explicitly configured TLS ingress without trusting forwarded headers', () => {
    expect(
      loadConfig({
        MCP_HOST: '0.0.0.0',
        MCP_PORT: '8080',
        MCP_RESOURCE: 'https://mcp.example.com/mcp',
        MCP_TLS_TERMINATED_BY_PROXY: 'true',
        MCP_OAUTH_ISSUER: 'https://auth.example.com',
        MCP_ALLOWED_HOSTS: 'mcp.example.com,127.0.0.1:8080',
        MCP_ALLOWED_ORIGINS: 'https://client.example.com',
      }),
    ).toMatchObject({ host: '0.0.0.0', port: 8080, tlsTerminatedByProxy: true })
  })
  it('supports IPv6 loopback with a bracketed authority', () => {
    expect(loadConfig({ MCP_HOST: '::1' }).resource).toBe('http://[::1]:3002/mcp')
  })
  it('does not put bad environment values in configuration errors', () => {
    expect(() => loadConfig({ MCP_RESOURCE: 'secret-value' })).toThrow(
      'Invalid configuration: MCP_RESOURCE',
    )
  })
})
