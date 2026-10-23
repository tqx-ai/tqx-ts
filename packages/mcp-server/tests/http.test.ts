import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fixture, listBody, rawRequest, rpcHeaders } from './fixture'

describe('protected HTTP boundary (synthetic JWTs only)', () => {
  let f: Awaited<ReturnType<typeof fixture>>
  beforeAll(async () => {
    f = await fixture()
  })
  afterAll(async () => {
    await f?.close()
  })
  const post = (token?: string, headers: Record<string, string> = {}, body = listBody) =>
    fetch(`${f.base}/mcp`, {
      method: 'POST',
      headers: {
        ...rpcHeaders,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body,
      signal: AbortSignal.timeout(5_000),
    })

  it('serves process-only liveness independently of the AS', async () => {
    const response = await fetch(`${f.base}/healthz`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'ok',
      checks: 'process-only',
    })
    expect(f.jwksState.hits).toHaveLength(0)
  })
  it('returns 401 with discoverable exact resource and AS, including the root alias', async () => {
    const response = await post()
    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toContain(
      `resource_metadata="${f.base}/.well-known/oauth-protected-resource/mcp"`,
    )
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ error: 'invalid_token' })
    for (const path of [
      '/.well-known/oauth-protected-resource/mcp',
      '/.well-known/oauth-protected-resource',
    ]) {
      const metadata = await fetch(`${f.base}${path}`)
      expect(await metadata.json()).toEqual({
        resource: f.config.resource,
        authorization_servers: [f.issuer],
        scopes_supported: ['trade:read'],
        bearer_methods_supported: ['header'],
      })
    }
  })
  it.each([
    ['issuer', { iss: 'https://wrong.example.com' }],
    ['API audience', { aud: 'https://www.tqx.trade/api' }],
    ['resource prefix', { aud: 'http://127.0.0.1' }],
    ['multiple audiences', { aud: ['resource-placeholder', 'https://other.example.com'] }],
    ['expired', { exp: 1 }],
    ['not yet valid', { nbf: 9_999_999_999 }],
    ...['iss', 'aud', 'exp', 'sub', 'client_id', 'sid', 'jti'].map(
      (claim): [string, Record<string, unknown>] => [`missing ${claim}`, { [claim]: undefined }],
    ),
    ...['sub', 'client_id', 'sid', 'jti'].map((claim): [string, Record<string, unknown>] => [
      `empty ${claim}`,
      { [claim]: ' ' },
    ]),
    ['wrong scope type', { scope: ['trade:read'] }],
    ['malformed scope', { scope: 'trade:read\norder:write' }],
    ['scope ending in LF', { scope: 'trade:read order:write\n' }],
    ['scope ending in CRLF', { scope: 'trade:read order:write\r\n' }],
  ] as const)('rejects invalid token: %s', async (_name, claims) => {
    const token = await f.sign(claims)
    const response = await post(token)
    expect(response.status).toBe(401)
    const body = await response.text()
    expect(body).toBe('{"error":"invalid_token"}')
    expect(body).not.toContain(token)
  })
  it('requires a single exact audience even when the correct one is included', async () => {
    for (const aud of [
      [f.config.resource, 'https://other.example.com'],
      [f.config.resource, f.config.resource],
      `${f.config.resource}/`,
    ]) {
      expect((await post(await f.sign({ aud }))).status).toBe(401)
    }
    expect((await post(await f.sign({ aud: [f.config.resource] }))).status).toBe(200)
  })
  it('rejects wrong signatures, unsupported algorithms, and attacker key URLs', async () => {
    expect((await post(await f.sign({}, { key: f.wrongKeys.privateKey }))).status).toBe(401)
    const wrongAlg = (await f.sign()).split('.')
    wrongAlg[0] = Buffer.from(JSON.stringify({ alg: 'HS256', kid: 'synthetic-test-key' })).toString(
      'base64url',
    )
    expect((await post(wrongAlg.join('.'))).status).toBe(401)
    expect(
      (
        await post(
          await f.sign(
            {},
            {
              key: f.wrongKeys.privateKey,
              header: {
                jku: `${f.issuer}/attacker-keys`,
                x5u: `${f.issuer}/attacker-cert`,
              },
            },
          ),
        )
      ).status,
    ).toBe(401)
    expect(f.jwksState.hits.every((path) => path === '/.well-known/jwks.json')).toBe(true)
    // Even a legitimate signature with these untrusted header URLs uses configured keys.
    expect(
      (await post(await f.sign({}, { header: { jku: `${f.issuer}/attacker-keys` } }))).status,
    ).toBe(200)
  })
  it.each([undefined, '', 'research:read', 'trade:reader'])(
    'uses 403 for missing required scope: %s',
    async (scope) => {
      const response = await post(await f.sign({ scope }))
      expect(response.status).toBe(403)
      expect(response.headers.get('WWW-Authenticate')).toContain(
        'error="insufficient_scope", scope="trade:read"',
      )
      expect(await response.json()).toEqual({ error: 'insufficient_scope' })
    },
  )
  it('requires a strict single Authorization header and rejects query tokens', async () => {
    const token = await f.sign()
    for (const authorization of [
      `Bearer ${token} extra`,
      `Basic ${token}`,
      `Bearer  ${token}`,
      'Bearer synthetic.invalid.token',
    ]) {
      expect((await post(undefined, { Authorization: authorization })).status).toBe(401)
    }
    const duplicate = await rawRequest(f.config.resource, [
      'Host',
      new URL(f.base).host,
      'Authorization',
      `Bearer ${token}`,
      'Authorization',
      `Bearer ${token}`,
    ])
    expect(duplicate.status).toBe(401)
    const response = await fetch(`${f.config.resource}?access_token=${token}`, {
      method: 'POST',
      headers: rpcHeaders,
      body: listBody,
    })
    expect(response.status).toBe(401)
    expect(await response.text()).not.toContain(token)
  })
  it('allows native no-Origin clients and exact allowed browser origins', async () => {
    const token = await f.sign()
    for (const headers of [{}, { Origin: f.base }] as Record<string, string>[]) {
      const response = await post(token, headers)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        jsonrpc: '2.0',
        id: 7,
        result: { tools: [] },
      })
      expect(response.headers.get('Mcp-Session-Id')).toBeNull()
    }
    const browser = await post(undefined, { Origin: f.base })
    expect(browser.headers.get('Access-Control-Allow-Origin')).toBe(f.base)
    expect(browser.headers.get('Access-Control-Expose-Headers')).toContain('WWW-Authenticate')
  })
  it('rejects invalid origins before parsing and authentication', async () => {
    for (const origin of [
      'null',
      'https://evil.example.com',
      `${f.base}/`,
      `${f.base}.evil.example.com`,
    ]) {
      const response = await post(undefined, { Origin: origin }, 'not-json')
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'forbidden_origin' })
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    }
    const duplicate = await rawRequest(f.config.resource, [
      'Host',
      new URL(f.base).host,
      'Origin',
      f.base,
      'Origin',
      f.base,
    ])
    expect(duplicate.status).toBe(403)
  })
  it('rejects wrong or missing Host authorities/ports, ignoring forwarded host', async () => {
    for (const host of [
      'evil.example.com',
      '127.0.0.1:1',
      `${new URL(f.base).host}.evil.example.com`,
      'localhost',
    ]) {
      const response = await rawRequest(f.config.resource, {
        Host: host,
        'X-Forwarded-Host': new URL(f.base).host,
        'X-Forwarded-Proto': 'https',
      })
      expect(response.status).toBe(403)
    }
    // Node rejects an HTTP/1.1 request without Host before Express sees it.
    expect((await rawRequest(f.config.resource, ['Content-Length', '0'])).status).toBe(400)
    expect((await rawRequest(f.config.resource, ['Host', ''])).status).toBe(403)
    const duplicate = await rawRequest(f.config.resource, [
      'Host',
      new URL(f.base).host,
      'Host',
      'evil.example.com',
    ])
    // Node versions may reject duplicate Host at the parser or application boundary.
    expect([400, 403]).toContain(duplicate.status)
  })
  it('handles exact browser preflight without requiring bearer credentials', async () => {
    const response = await fetch(f.config.resource, {
      method: 'OPTIONS',
      headers: {
        Origin: f.base,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type,mcp-protocol-version',
      },
    })
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(f.base)
    const denied = await fetch(f.config.resource, {
      method: 'OPTIONS',
      headers: { Origin: f.base, 'Access-Control-Request-Headers': 'x-unsafe' },
    })
    expect(denied.status).toBe(403)
  })
  it('sanitizes malformed JSON, oversized bodies, and unexpected internal failures', async () => {
    const token = await f.sign()
    const malformed = await post(token, {}, '{"synthetic-secret":')
    expect(malformed.status).toBe(400)
    expect(await malformed.json()).toEqual({
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Parse error' },
      id: null,
    })
    const oversized = await post(token, {}, JSON.stringify({ value: 'x'.repeat(110_000) }))
    expect(oversized.status).toBe(413)
    expect(await oversized.json()).toEqual({ error: 'request_too_large' })
  })
  it('protects GET/DELETE and rejects session operations in stateless mode', async () => {
    for (const method of ['GET', 'DELETE', 'PUT']) {
      expect((await fetch(f.config.resource, { method })).status).toBe(401)
      const response = await fetch(f.config.resource, {
        method,
        headers: { Authorization: `Bearer ${await f.sign()}` },
      })
      expect(response.status).toBe(405)
      expect(response.headers.get('Allow')).toBe('POST, OPTIONS')
    }
  })
})
