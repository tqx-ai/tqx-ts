import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { vi } from 'vitest'

import { loadMcpConfig } from '../../src/config'

export const testEnvironment = {
  TQX_MCP_RESOURCE_URL: 'https://mcp.example.test/mcp',
  TQX_MCP_OAUTH_ISSUER: 'https://auth.example.test',
  TQX_MCP_ALLOWED_HOSTS: '127.0.0.1,mcp.example.test',
  TQX_MCP_ALLOWED_ORIGINS: 'http://localhost:6274',
}
export const testConfig = loadMcpConfig(testEnvironment)
let keyPair: ReturnType<typeof generateKeyPair> | undefined

export async function createOAuthFixture() {
  const keys = await (keyPair ??= generateKeyPair('RS256', { extractable: true }))
  const jwk = { ...(await exportJWK(keys.publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' }
  const metadata = {
    issuer: testConfig.issuer,
    authorization_endpoint: `${testConfig.issuer}/oauth/authorize`,
    token_endpoint: `${testConfig.issuer}/oauth/token`,
    registration_endpoint: `${testConfig.issuer}/oauth/register`,
    jwks_uri: `${testConfig.issuer}/.well-known/jwks.json`,
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
  }
  const fetch = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input)
    if (url === `${testConfig.issuer}/.well-known/oauth-authorization-server`)
      return Response.json(metadata)
    if (url === metadata.jwks_uri) return Response.json({ keys: [jwk] })
    throw new Error(`Unexpected test request: ${url}`)
  })

  async function sign(
    overrides: Record<string, unknown> = {},
    header: Record<string, unknown> = {},
  ) {
    const now = Math.floor(Date.now() / 1000)
    return new SignJWT({
      iss: testConfig.issuer,
      aud: testConfig.resourceUrl,
      sub: 'user-123',
      client_id: 'external-mcp-client',
      sid: 'session-123',
      jti: 'token-123',
      scope: 'research:read',
      iat: now,
      exp: now + 3600,
      ...overrides,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ: 'JWT', ...header })
      .sign(keys.privateKey)
  }

  return { fetch, sign, keys, jwk, metadata }
}
