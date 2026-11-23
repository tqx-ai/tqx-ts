import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadResearchConfig } from '../src/research/config'
import { loadTradingConfig } from '../src/trading/config'
import { actions, callAction } from '../src/research/tools/actions'
import { createResearchRuntime } from '../src/research/runtime'
import {
  envelope,
  ID,
  researchAuth,
  researchConfig,
  resource,
  setupResearch,
} from './helpers/research'

const disposals: Array<() => void> = []
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose()
})
function setup(options: Parameters<typeof setupResearch>[0] = {}) {
  const s = setupResearch(options)
  disposals.push(s.dispose)
  return s
}
const get = { path: `qube/api/factors/${ID}` }

describe('Research configuration and gateway boundaries', () => {
  const env = {
    TQX_MCP_RESEARCH_BASE_URL: 'https://research.example.test/tqxApi',
    TQX_MCP_RESEARCH_RESOURCE: researchConfig.resource,
    TQX_MCP_EXCHANGE_CLIENT_ID: researchConfig.clientId,
    TQX_MCP_EXCHANGE_CLIENT_SECRET: researchConfig.clientSecret,
  }
  it('enables Research independently from Trading with shared confidential credentials', () => {
    expect(loadResearchConfig('https://auth.example.test', {})).toBeUndefined()
    expect(loadResearchConfig('https://auth.example.test', env)).toEqual(researchConfig)
    expect(loadTradingConfig('https://auth.example.test', env)).toBeUndefined()
    expect(
      loadResearchConfig('https://auth.example.test', {
        TQX_MCP_EXCHANGE_CLIENT_ID: 'shared',
        TQX_MCP_EXCHANGE_CLIENT_SECRET: 'secret',
      }),
    ).toBeUndefined()
  })
  it.each(Object.keys(env))('rejects incomplete Research config %s', (key) => {
    expect(() =>
      loadResearchConfig('https://auth.example.test', { ...env, [key]: undefined }),
    ).toThrow(key)
  })
  it.each([
    'https://user:secret@research.example.test/tqxApi',
    'https://research.example.test',
    'https://research.example.test/tqxApi?key=x',
    'https://research.example.test/pandaApi',
  ])('rejects unsafe or incompatible Research base %s', (base) => {
    expect(() =>
      loadResearchConfig('https://auth.example.test', { ...env, TQX_MCP_RESEARCH_BASE_URL: base }),
    ).toThrow('TQX_MCP_RESEARCH_BASE_URL')
  })
  it('allows development HTTP but requires production HTTPS', () => {
    const input = { ...env, TQX_MCP_RESEARCH_BASE_URL: 'http://localhost:8000/tqxApi' }
    expect(loadResearchConfig('https://auth.example.test', input)?.baseUrl).toBe(
      'http://localhost:8000/tqxApi/',
    )
    expect(() =>
      loadResearchConfig('https://auth.example.test', { ...input, NODE_ENV: 'production' }),
    ).toThrow('TQX_MCP_RESEARCH_BASE_URL')
  })
  it('uses the real exchange client with the Research audience and no agent binding', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) =>
      String(url).endsWith('/oauth/token')
        ? Response.json({
            access_token: 'research-api-token',
            issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
            token_type: 'Bearer',
            expires_in: 300,
            scope: (init!.body as URLSearchParams).get('scope'),
          })
        : envelope(resource()),
    )
    const runtime = createResearchRuntime('https://auth.example.test', researchConfig, { fetch })
    disposals.push(runtime.dispose)
    await runtime.gateway.request(researchAuth(), 'research:read', get)
    const [endpoint, init] = fetch.mock.calls[0]!
    expect(endpoint).toBe(researchConfig.tokenEndpoint)
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      `Basic ${btoa('mcp-research:test-secret')}`,
    )
    expect(Object.fromEntries(init!.body as URLSearchParams)).toMatchObject({
      subject_token: 'incoming-research-mcp-token',
      resource: researchConfig.resource,
      scope: 'research:read',
    })
    expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer research-api-token',
    )
  })
  it('caches read exchanges but bypasses them for every run/write call', async () => {
    const s = setup()
    const auth = researchAuth()
    await s.gateway.request(auth, 'research:read', get)
    await s.gateway.request(auth, 'research:read', get)
    expect(s.exchange).toHaveBeenCalledTimes(1)
    await s.gateway.request(auth, 'research:run', { ...get, method: 'POST' })
    await s.gateway.request(auth, 'research:run', { ...get, method: 'POST' })
    await s.gateway.request(auth, 'research:write', {
      ...get,
      method: 'PATCH',
      body: { title: 'new' },
    })
    expect(s.exchange).toHaveBeenCalledTimes(4)
  })
  it('refreshes a rejected read token once and invalidates repeated failures', async () => {
    const s = setup()
    s.fetch
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(envelope(resource()))
    expect(await s.gateway.request(researchAuth(), 'research:read', get)).toHaveProperty('id', ID)
    expect(s.exchange).toHaveBeenCalledTimes(2)
    s.fetch.mockImplementation(async () => new Response('', { status: 401 }))
    await expect(s.gateway.request(researchAuth(), 'research:read', get)).rejects.toMatchObject({
      code: 'AUTHORIZATION_REQUIRED',
    })
    expect(s.fetch).toHaveBeenCalledTimes(4)
    expect(s.exchange).toHaveBeenCalledTimes(3)
  })
  it.each([401, 503])('never replays a write on HTTP %i', async (status) => {
    const s = setup()
    s.fetch.mockImplementation(async () => envelope(null, status, 'REJECTED'))
    await expect(
      s.gateway.request(researchAuth(), 'research:run', { ...get, method: 'POST' }),
    ).rejects.toBeInstanceOf(Error)
    expect(s.fetch).toHaveBeenCalledTimes(1)
    expect(s.exchange).toHaveBeenCalledTimes(1)
  })
  it.each(['0', '200', 'COMMON_SUCCESS'])(
    'decodes Research gateway success code %s',
    async (code) => {
      const s = setup()
      s.fetch.mockImplementation(async () => envelope(resource(), 200, code))
      expect(await s.gateway.request(researchAuth(), 'research:read', get)).toHaveProperty(
        'code',
        'close',
      )
    },
  )
  it('accepts direct resources without misreading their Python code as envelope status', async () => {
    const s = setup()
    s.fetch.mockImplementation(async () => Response.json(resource()))
    expect(await s.gateway.request(researchAuth(), 'research:read', get)).toHaveProperty(
      'code',
      'close',
    )
  })
  it('bounds headers, streamed bytes and final business output', async () => {
    const s = setup({ maxResponseBytes: 256 })
    s.fetch.mockImplementation(
      async () =>
        new Response('{}', {
          headers: { 'Content-Type': 'application/json', 'Content-Length': '1000' },
        }),
    )
    await expect(s.gateway.request(researchAuth(), 'research:read', get)).rejects.toMatchObject({
      code: 'RESULT_TOO_LARGE',
    })
    s.fetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ value: 'x'.repeat(500) }), {
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    await expect(s.gateway.request(researchAuth(), 'research:read', get)).rejects.toMatchObject({
      code: 'RESULT_TOO_LARGE',
    })
    const output = setup({ maxOutputBytes: 10 })
    await expect(
      callAction(output.gateway, researchAuth(), actions.get('factor.get')!, { factorId: ID }),
    ).rejects.toMatchObject({ code: 'RESULT_TOO_LARGE' })
  })
  it('enforces gateway and exchange timeouts even for injected transports', async () => {
    const s = setup({ gatewayTimeoutMs: 5 })
    s.fetch.mockImplementation(() => new Promise(() => undefined))
    await expect(s.gateway.request(researchAuth(), 'research:read', get)).rejects.toMatchObject({
      code: 'TIMEOUT',
    })
    const exchange = setup({ exchangeTimeoutMs: 5, exchange: () => new Promise(() => undefined) })
    await expect(
      exchange.gateway.request(researchAuth(), 'research:read', get),
    ).rejects.toMatchObject({ kind: 'network' })
    expect(exchange.fetch).not.toHaveBeenCalled()
  })

  it('times out stalled response bodies and releases their concurrency permits', async () => {
    const s = setup({ gatewayTimeoutMs: 10, maxPerPrincipal: 1 })
    s.fetch.mockImplementationOnce(
      async (_url, init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init!.signal!.addEventListener(
                'abort',
                () => controller.error(init!.signal!.reason),
                { once: true },
              )
            },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    )
    await expect(s.gateway.request(researchAuth(), 'research:read', get)).rejects.toMatchObject({
      code: 'TIMEOUT',
    })
    await expect(s.gateway.request(researchAuth(), 'research:read', get)).resolves.toHaveProperty(
      'id',
      ID,
    )
  })

  it('refuses token reuse after disposal', async () => {
    const s = setup()
    await s.gateway.request(researchAuth(), 'research:read', get)
    s.dispose()
    await expect(s.gateway.request(researchAuth(), 'research:read', get)).rejects.toMatchObject({
      kind: 'busy',
    })
    expect(s.fetch).toHaveBeenCalledTimes(1)
  })
  it('enforces concurrency limits, releases permits after failure and isolates users', async () => {
    const s = setup({ maxConcurrent: 2, maxPerPrincipal: 1 })
    let release!: (response: Response) => void
    s.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const pending = s.gateway.request(researchAuth(), 'research:read', get)
    await vi.waitFor(() => expect(s.fetch).toHaveBeenCalledTimes(1))
    await expect(s.gateway.request(researchAuth(), 'research:read', get)).rejects.toMatchObject({
      code: 'BUSY',
    })
    const other = { ...researchAuth(), token: 'other-token', extra: { sub: 'other-user' } }
    await expect(s.gateway.request(other, 'research:read', get)).resolves.toHaveProperty('id', ID)
    release(envelope(null, 503, 'BUSY'))
    await expect(pending).rejects.toMatchObject({ code: 'BUSY' })
    await expect(s.gateway.request(researchAuth(), 'research:read', get)).resolves.toHaveProperty(
      'id',
      ID,
    )
  })
  it('rejects arbitrary paths before any token exchange', async () => {
    const s = setup()
    await expect(
      s.gateway.request(researchAuth(), 'research:read', { path: 'https://bad.test/' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(s.exchange).not.toHaveBeenCalled()
  })
})
