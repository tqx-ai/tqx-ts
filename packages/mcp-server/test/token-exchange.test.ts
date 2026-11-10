import { describe, expect, it, vi } from 'vitest'

import { createTokenExchange } from '../src/auth/token-exchange'
import { publicError } from '../src/trading/errors'
import { tradingConfig } from './helpers/trading'

const response = {
  access_token: 'downstream-token',
  token_type: 'Bearer',
  expires_in: 300,
  issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
  scope: 'trade:read',
}
const input = {
  subjectToken: 'incoming-token',
  resource: tradingConfig.resource,
  scopes: ['trade:read'],
}

describe('RFC 8693 exchange client', () => {
  it('uses Basic authentication and an explicit downscoped URL-encoded form', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(response))
    const exchange = createTokenExchange(tradingConfig, { fetch, now: () => 1000 })
    expect(await exchange(input)).toEqual({
      token: 'downstream-token',
      expiresAt: 301_000,
      scopes: ['trade:read'],
    })
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe(tradingConfig.tokenEndpoint)
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', credentials: 'omit' })
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      `Basic ${btoa('tqx_mcp_server:test-client-secret')}`,
    )
    expect(Object.fromEntries(init!.body as URLSearchParams)).toEqual({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: 'incoming-token',
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      resource: tradingConfig.resource,
      scope: 'trade:read',
    })
  })

  it('sends an explicit empty scope and accepts a scope-free response', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ ...response, scope: '' }),
    )
    const exchange = createTokenExchange(tradingConfig, { fetch, now: () => 1000 })
    expect(await exchange({ ...input, scopes: [] })).toEqual({
      token: 'downstream-token',
      expiresAt: 301_000,
      scopes: [],
    })
    expect((fetch.mock.calls[0]![1]!.body as URLSearchParams).get('scope')).toBe('')
  })

  it('rejects permissions in response to a scope-free exchange', async () => {
    const exchange = createTokenExchange(tradingConfig, {
      fetch: vi.fn(async () => Response.json(response)),
    })
    await expect(exchange({ ...input, scopes: [] })).rejects.toThrow(
      'Invalid token exchange permissions',
    )
  })

  it.each([
    { ...response, expires_in: 0 },
    { ...response, token_type: 'other' },
    { ...response, scope: 'trade:read order:write' },
    { ...response, scope: 'order:write' },
    { ...response, access_token: 'bad\nheader' },
    { ...response, issued_token_type: 'other' },
  ])('rejects malformed or overprivileged exchange responses', async (data) => {
    const exchange = createTokenExchange(tradingConfig, {
      fetch: vi.fn(async () => Response.json(data)),
    })
    await expect(exchange(input)).rejects.toThrow('Invalid token exchange')
  })

  it('handles revocation without leaking OAuth descriptions or credentials', async () => {
    const exchange = createTokenExchange(tradingConfig, {
      fetch: vi.fn(async () =>
        Response.json(
          { error: 'invalid_grant', error_description: input.subjectToken },
          { status: 400 },
        ),
      ),
    })
    const error = await exchange(input).catch((e: unknown) => publicError(e))
    expect(error).toMatchObject({ kind: 'authorization' })
    expect(JSON.stringify(error)).not.toContain(input.subjectToken)
  })

  it.each([
    [429, { error: 'temporarily_unavailable', error_description: 'private-description' }],
    [429, { unexpected: 'private-description' }],
    [503, { error: 'temporarily_unavailable', error_description: 'private-description' }],
  ])('classifies HTTP %i capacity errors as busy without retrying', async (status, data) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(data, { status }))
    const exchange = createTokenExchange(tradingConfig, { fetch })
    const error = await exchange(input).catch((e: unknown) => publicError(e))
    expect(error).toMatchObject({ kind: 'busy', status })
    expect(JSON.stringify(error)).not.toContain('private-description')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('treats a non-JSON proxy 429 as busy', async () => {
    const exchange = createTokenExchange(tradingConfig, {
      fetch: vi.fn(async () => new Response('proxy-secret', { status: 429 })),
    })
    expect(await exchange(input).catch((e: unknown) => publicError(e))).toMatchObject({
      kind: 'busy',
      status: 429,
    })
  })

  it('times out exchange requests and suppresses raw Fetch errors', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(new Error('secret request body')), {
            once: true,
          })
        }),
    )
    const exchange = createTokenExchange(tradingConfig, { fetch, timeoutMs: 10 })
    await expect(exchange(input)).rejects.toThrow('Token exchange unavailable')
  })
})
