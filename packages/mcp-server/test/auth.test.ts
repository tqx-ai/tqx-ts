import { OAuthErrorCode } from '@modelcontextprotocol/server'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '../src/app'
import { createTokenVerifier } from '../src/auth/verifier'
import { createOAuthFixture, testConfig } from './helpers/oauth'

let oauth: Awaited<ReturnType<typeof createOAuthFixture>>
let verifier: ReturnType<typeof createTokenVerifier>

beforeEach(async () => {
  oauth = await createOAuthFixture()
  verifier = createTokenVerifier(testConfig, { fetch: oauth.fetch })
})
afterEach(() => vi.useRealTimers())

describe('TQX access token verification', () => {
  it('accepts a signed token granting all six advertised scopes', async () => {
    const scopes = [
      'research:read',
      'research:write',
      'research:run',
      'trade:read',
      'order:write',
      'ranking:read',
    ]
    const token = await oauth.sign({ scope: scopes.join(' '), agent_id: 'agent-123' })
    expect(await verifier.verifyAccessToken(token)).toMatchObject({
      scopes,
      extra: { agent_id: 'agent-123' },
    })
  })

  it('verifies an RS256 signature and maps only verified identity into AuthInfo', async () => {
    const token = await oauth.sign({
      scope: 'trade:read order:write',
      agent_id: 'agent-123',
      private_claim: 'ignored',
    })
    expect(await verifier.verifyAccessToken(token)).toEqual({
      token,
      clientId: 'external-mcp-client',
      scopes: ['trade:read', 'order:write'],
      expiresAt: expect.any(Number),
      resource: new URL(testConfig.resourceUrl),
      extra: { sub: 'user-123', sid: 'session-123', jti: 'token-123', agent_id: 'agent-123' },
    })
    expect(oauth.fetch.mock.calls.map(([url]) => String(url))).toEqual([
      `${testConfig.issuer}/.well-known/oauth-authorization-server`,
      `${testConfig.issuer}/.well-known/jwks.json`,
    ])
    oauth.fetch.mock.calls.forEach(([, init]) => {
      expect(init).toMatchObject({ method: 'GET', redirect: 'error', credentials: 'omit' })
      expect(new Headers(init?.headers).has('Authorization')).toBe(false)
    })
  })

  it.each([
    { iss: 'https://attacker.example.test' },
    { iss: `${testConfig.issuer}/` },
    { aud: 'https://www.tqx.trade/pandaApi' },
    { aud: 'https://www.tqx.trade/openapi' },
    { aud: [testConfig.resourceUrl, 'https://other.example.test'] },
    { exp: 1 },
    { exp: undefined },
    { exp: 'not-a-number' },
    { iat: undefined },
    { iat: Math.floor(Date.now() / 1000) + 60 },
    { exp: Math.floor(Date.now() / 1000), iat: Math.floor(Date.now() / 1000) + 1 },
    { nbf: Math.floor(Date.now() / 1000) + 60 },
    { sub: null },
    { client_id: 123 },
    { sid: undefined },
    { jti: '' },
    { scope: '' },
    { scope: ['research:read'] },
    { scope: 'research:read admin' },
    { scope: 'research:read research:read' },
    { scope: 'research:read\norder:write' },
    { agent_id: null },
  ])('rejects invalid claims %j after signature verification', async (claims) => {
    await expect(verifier.verifyAccessToken(await oauth.sign(claims))).rejects.toMatchObject({
      code: OAuthErrorCode.InvalidToken,
    })
  })

  it.each(['not-a-jwt', 'a.b.c', 'e30.e30.', 'x'.repeat(16_385)])(
    'rejects malformed or oversized tokens without discovery',
    async (token) => {
      await expect(verifier.verifyAccessToken(token)).rejects.toMatchObject({
        code: OAuthErrorCode.InvalidToken,
      })
      expect(oauth.fetch).not.toHaveBeenCalled()
    },
  )

  it('rejects a payload altered without resigning it', async () => {
    const [header, payload, signature] = (await oauth.sign()).split('.')
    const forged = JSON.parse(Buffer.from(payload!, 'base64url').toString())
    forged.sub = 'victim'
    const token = `${header}.${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${signature}`
    await expect(verifier.verifyAccessToken(token)).rejects.toMatchObject({
      code: OAuthErrorCode.InvalidToken,
    })
  })

  it('rejects an HMAC token and a missing kid without fetching keys', async () => {
    const hmac = await new SignJWT({ sub: 'attacker' })
      .setProtectedHeader({ alg: 'HS256', kid: 'test-key' })
      .sign(new TextEncoder().encode('a-test-secret-with-at-least-32-bytes'))
    await expect(verifier.verifyAccessToken(hmac)).rejects.toMatchObject({
      code: OAuthErrorCode.InvalidToken,
    })
    await expect(
      verifier.verifyAccessToken(await oauth.sign({}, { kid: undefined })),
    ).rejects.toMatchObject({ code: OAuthErrorCode.InvalidToken })
    expect(oauth.fetch).not.toHaveBeenCalled()
  })

  it('ignores token-supplied key discovery URLs', async () => {
    const token = await oauth.sign({}, { jku: 'https://attacker.example.test/keys' })
    await verifier.verifyAccessToken(token)
    expect(oauth.fetch.mock.calls.every(([url]) => String(url).startsWith(testConfig.issuer))).toBe(
      true,
    )
  })

  it('shares discovery and key fetching across concurrent users without sharing their identity', async () => {
    const tokens = await Promise.all(
      ['alice', 'bob', 'carol'].map((sub) =>
        oauth.sign({ sub, client_id: `${sub}-client`, jti: `${sub}-token` }),
      ),
    )
    const results = await Promise.all(tokens.map((token) => verifier.verifyAccessToken(token)))
    expect(
      results.map((result) => [result.extra?.sub, result.clientId, result.extra?.jti]),
    ).toEqual([
      ['alice', 'alice-client', 'alice-token'],
      ['bob', 'bob-client', 'bob-token'],
      ['carol', 'carol-client', 'carol-token'],
    ])
    expect(oauth.fetch).toHaveBeenCalledTimes(2)
    await verifier.verifyAccessToken(tokens[0]!)
    expect(oauth.fetch).toHaveBeenCalledTimes(2)
  })

  it('limits unknown-kid refreshes and retains published old keys during rotation', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const original = await oauth.sign()
    await verifier.verifyAccessToken(original)
    const rotated = await generateKeyPair('RS256')
    const rotatedJwk = { ...(await exportJWK(rotated.publicKey)), kid: 'rotated-key', alg: 'RS256' }
    const payload = JSON.parse(Buffer.from(original.split('.')[1]!, 'base64url').toString())
    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'rotated-key' })
      .sign(rotated.privateKey)
    oauth.fetch.mockImplementation(async (url) =>
      String(url) === oauth.metadata.jwks_uri
        ? Response.json({ keys: [oauth.jwk, rotatedJwk] })
        : Response.json(oauth.metadata),
    )
    await expect(verifier.verifyAccessToken(token)).rejects.toMatchObject({
      code: OAuthErrorCode.InvalidToken,
    })
    expect(oauth.fetch).toHaveBeenCalledTimes(2)
    vi.setSystemTime(Date.now() + 30_001)
    await expect(verifier.verifyAccessToken(token)).resolves.toHaveProperty(
      'clientId',
      'external-mcp-client',
    )
    await expect(verifier.verifyAccessToken(original)).resolves.toHaveProperty(
      'clientId',
      'external-mcp-client',
    )
    expect(oauth.fetch).toHaveBeenCalledTimes(3)
  })

  it('rechecks metadata after its bounded cache lifetime', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const token = await oauth.sign()
    await verifier.verifyAccessToken(token)
    vi.setSystemTime(Date.now() + 600_001)
    await verifier.verifyAccessToken(token)
    expect(oauth.fetch).toHaveBeenCalledTimes(4)
  })

  it('supports an injected verification clock', async () => {
    const token = await oauth.sign()
    const future = createTokenVerifier(testConfig, {
      fetch: oauth.fetch,
      now: () => Date.now() + 3600_001,
    })
    await expect(future.verifyAccessToken(token)).rejects.toMatchObject({
      code: OAuthErrorCode.InvalidToken,
    })
  })
})

describe('OAuth discovery failures', () => {
  it.each([
    { issuer: 'https://attacker.example.test' },
    { jwks_uri: 'https://attacker.example.test/keys' },
    { jwks_uri: 'http://auth.example.test/keys' },
    { jwks_uri: 'https://user:secret@auth.example.test/keys' },
    { jwks_uri: 'https://auth.example.test/keys?secret=value' },
    { jwks_uri: undefined },
  ])('fails closed on invalid AS metadata %j', async (override) => {
    oauth.fetch.mockResolvedValue(Response.json({ ...oauth.metadata, ...override }))
    await expect(verifier.verifyAccessToken(await oauth.sign())).rejects.toMatchObject({
      code: OAuthErrorCode.ServerError,
      message: 'Authorization service unavailable',
    })
    expect(oauth.fetch).toHaveBeenCalledTimes(1)
  })

  it.each([
    () => new Response('upstream-secret', { status: 503 }),
    () =>
      new Response(null, { status: 302, headers: { Location: 'https://attacker.example.test' } }),
    () => new Response('<html>secret</html>', { headers: { 'Content-Type': 'text/html' } }),
    () => new Response('not-json-secret', { headers: { 'Content-Type': 'application/json' } }),
    () => Response.json({ keys: Array.from({ length: 33 }, () => ({})) }),
    () => new Response('x'.repeat(65_537), { headers: { 'Content-Type': 'application/json' } }),
  ])('fails closed on an invalid JWKS response %#', async (response) => {
    oauth.fetch.mockImplementation(async (url) =>
      String(url) === oauth.metadata.jwks_uri ? response() : Response.json(oauth.metadata),
    )
    await expect(verifier.verifyAccessToken(await oauth.sign())).rejects.toMatchObject({
      code: OAuthErrorCode.ServerError,
      message: 'Authorization service unavailable',
    })
  })

  it('limits retries after a network/timeout failure and recovers afterwards', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const normalFetch = oauth.fetch.getMockImplementation()!
    oauth.fetch.mockRejectedValue(new DOMException('upstream-secret', 'TimeoutError'))
    const token = await oauth.sign()
    await expect(verifier.verifyAccessToken(token)).rejects.toHaveProperty(
      'code',
      OAuthErrorCode.ServerError,
    )
    await expect(verifier.verifyAccessToken(token)).rejects.toHaveProperty(
      'code',
      OAuthErrorCode.ServerError,
    )
    expect(oauth.fetch).toHaveBeenCalledTimes(1)
    oauth.fetch.mockImplementation(normalFetch)
    vi.setSystemTime(Date.now() + 30_001)
    await expect(verifier.verifyAccessToken(token)).resolves.toHaveProperty(
      'clientId',
      'external-mcp-client',
    )
  })

  it('limits retries after JWKS failures, independently of successful metadata', async () => {
    const normalFetch = oauth.fetch.getMockImplementation()!
    oauth.fetch.mockImplementation(async (url, init) =>
      String(url) === oauth.metadata.jwks_uri
        ? Promise.reject(new Error('upstream-secret'))
        : normalFetch(url, init),
    )
    const token = await oauth.sign()
    await expect(verifier.verifyAccessToken(token)).rejects.toHaveProperty(
      'code',
      OAuthErrorCode.ServerError,
    )
    await expect(verifier.verifyAccessToken(token)).rejects.toHaveProperty(
      'code',
      OAuthErrorCode.ServerError,
    )
    expect(oauth.fetch).toHaveBeenCalledTimes(2)
  })

  it('returns a safe HTTP service error, with browser CORS, rather than allowing a tool call', async () => {
    oauth.fetch.mockRejectedValue(new Error('upstream-secret'))
    const app = createApp({ config: testConfig, fetch: oauth.fetch })
    const response = await app.request('http://127.0.0.1/mcp', {
      method: 'POST',
      headers: {
        Host: '127.0.0.1',
        Authorization: `Bearer ${await oauth.sign()}`,
        Origin: 'http://localhost:6274',
      },
    })
    expect(response.status).toBe(500)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:6274')
    expect(await response.json()).toEqual({
      error: 'server_error',
      error_description: 'Authorization service unavailable',
    })
  })
})
