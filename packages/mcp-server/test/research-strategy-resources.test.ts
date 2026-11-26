import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OAuthTokenVerifier } from '@modelcontextprotocol/server'

import { createApp } from '../src/app'
import type { ResearchConfig } from '../src/research/config'
import { createOAuthFixture, testConfig } from './helpers/oauth'
import { expectPngIcons } from './helpers/icons'
import {
  envelope,
  ID,
  researchAuth,
  researchConfig,
  resource,
  VERSION,
  version,
} from './helpers/research'

const ID_B = '111111111111111111111111'
const VERSION_2 = '222222222222222222222222'

const oauth = await createOAuthFixture()
const readToken = await oauth.sign({ sub: 'user-a', scope: 'research:read' })
const userBToken = await oauth.sign({ sub: 'user-b', scope: 'research:read' })
const clientBToken = await oauth.sign({
  sub: 'user-a',
  client_id: 'other-mcp-client',
  scope: 'research:read',
})
const unrelatedToken = await oauth.sign({ sub: 'user-a', scope: 'trade:read' })

const disposals: Array<() => void> = []
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose()
})

function parseRpcBody(response: Response, text: string) {
  const json = response.headers.get('Content-Type')?.includes('text/event-stream')
    ? text
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n')
    : text
  return JSON.parse(json)
}

const defaultFetch: typeof globalThis.fetch = async (input) => {
  const url = new URL(typeof input === 'string' ? input : input.toString())
  if (url.pathname === '/tqxApi/qube/api/factors') {
    return envelope({ factors: [resource('factor')], has_more: false, next_cursor: null })
  }
  if (url.pathname === `/tqxApi/qube/api/factors/${ID}/source`) {
    return envelope(resource('factor'))
  }
  if (url.pathname === '/tqxApi/qube/api/strategies') {
    return envelope({
      strategies: [
        {
          ...resource('strategy'),
          id: ID,
          title: 'US Momentum',
          market: 'us',
          updated_at: '2026-11-20T00:00:00Z',
        },
        {
          ...resource('strategy'),
          id: ID_B,
          title: 'HK Mean Reversion',
          market: 'hk',
          updated_at: '2026-11-19T00:00:00Z',
        },
      ],
      has_more: false,
      next_cursor: null,
    })
  }
  if (url.pathname === `/tqxApi/qube/api/strategies/${ID}/source`) {
    return envelope({
      ...resource('strategy'),
      id: ID,
      title: 'US Momentum',
      code: 'def on_bar():\n    return 1\n',
    })
  }
  if (url.pathname === `/tqxApi/qube/api/strategies/${ID}/versions`) {
    return envelope({
      versions: [
        {
          ...version('strategy'),
          id: VERSION_2,
          strategy_id: ID,
          version: 2,
          name: 'Low Turnover',
          created_at: '2026-11-21T00:00:00Z',
        },
        {
          ...version('strategy'),
          id: VERSION,
          strategy_id: ID,
          version: 1,
          name: 'Baseline',
          created_at: '2026-11-20T00:00:00Z',
        },
      ],
    })
  }
  if (url.pathname === `/tqxApi/qube/api/strategy-versions/${VERSION_2}`) {
    return envelope({
      ...version('strategy'),
      id: VERSION_2,
      strategy_id: ID,
      version: 2,
      name: 'Low Turnover',
      code: '# frozen v2\n',
    })
  }
  return envelope({ detail: { code: 'NOT_FOUND' } }, 404, 404)
}

function setup(options?: {
  fetch?: typeof globalThis.fetch
  now?: () => number
  strategyCacheTtlMs?: number
  config?: ResearchConfig
  verifier?: OAuthTokenVerifier
}) {
  let currentNow = Date.now()
  const now = options?.now ?? (() => currentNow)

  const fetch = vi.fn<typeof globalThis.fetch>(options?.fetch ?? defaultFetch)
  const exchange = vi.fn(async ({ scopes }: { scopes: readonly string[] }) => ({
    token: 'research-api-token',
    scopes,
    expiresAt: Date.now() + 300_000,
  }))
  const app = createApp({
    config: testConfig,
    fetch: oauth.fetch,
    tradingConfig: null,
    researchConfig: options?.config ?? researchConfig,
    verifier: options?.verifier,
    research: {
      fetch,
      exchange,
      now,
      strategyCacheTtlMs: options?.strategyCacheTtlMs,
    },
    now,
    demoPing: false,
  })
  disposals.push(app.dispose)

  async function rpc(
    method: string,
    params: Record<string, unknown> = {},
    bearer = readToken,
    protocolVersion: '2025-11-25' | '2026-07-28' = '2026-07-28',
  ) {
    const response = await app.request('http://127.0.0.1/mcp', {
      method: 'POST',
      headers: {
        Host: '127.0.0.1',
        Authorization: `Bearer ${bearer}`,
        Origin: 'http://localhost:6274',
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': protocolVersion,
        ...(protocolVersion === '2026-07-28'
          ? {
              'Mcp-Method': method,
              ...(typeof params.name === 'string'
                ? { 'Mcp-Name': params.name }
                : typeof params.uri === 'string'
                  ? { 'Mcp-Name': params.uri }
                  : {}),
            }
          : {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params: {
          ...params,
          ...(protocolVersion === '2026-07-28'
            ? {
                _meta: {
                  'io.modelcontextprotocol/protocolVersion': protocolVersion,
                  'io.modelcontextprotocol/clientCapabilities': {},
                },
              }
            : {}),
        },
      }),
    })
    const text = await response.text()
    return {
      response,
      body: response.status === 200 ? parseRpcBody(response, text) : undefined,
      text,
    }
  }

  return {
    fetch,
    exchange,
    app,
    rpc,
    advanceTime: (ms: number) => {
      currentNow += ms
    },
  }
}

describe('Qube resources, completions, and dynamic prompt', () => {
  it('advertises inspect_strategy prompt, strategy resource templates, and completions capability', async () => {
    const s = setup()

    const discovered = await s.rpc('server/discover')
    expect(discovered.body.result.capabilities).toMatchObject({
      tools: {},
      prompts: {},
      resources: {},
      completions: {},
    })

    await Promise.all(
      (['2025-11-25', '2026-07-28'] as const).map(async (protocolVersion) => {
        const prompts = await s.rpc('prompts/list', {}, readToken, protocolVersion)
        expect(prompts.response.status).toBe(200)
        expect(prompts.body.result.prompts).toEqual([
          expect.objectContaining({
            name: 'inspect_strategy',
            arguments: [
              expect.objectContaining({ name: 'strategy', required: true }),
              expect.objectContaining({ name: 'version', required: false }),
            ],
          }),
        ])
        expectPngIcons(prompts.body.result.prompts[0].icons)

        const templates = await s.rpc('resources/templates/list', {}, readToken, protocolVersion)
        expect(templates.response.status).toBe(200)
        expect(
          templates.body.result.resourceTemplates.map(
            (t: { uriTemplate: string }) => t.uriTemplate,
          ),
        ).toEqual([
          'tqx://qube/strategies/{strategy}',
          'tqx://qube/strategies/{strategy}/versions/{version}',
          'tqx://qube/factors/{factor}',
          'skill://{+path}',
        ])
        for (const template of templates.body.result.resourceTemplates.filter(
          (t: { uriTemplate: string }) => t.uriTemplate.startsWith('tqx://'),
        )) {
          expectPngIcons(template.icons)
          if (template.name === 'qube_factor') expect(template).not.toHaveProperty('mimeType')
          else expect(template.mimeType).toBe('text/x-python')
        }

        const resources = await s.rpc('resources/list', {}, readToken, protocolVersion)
        expect(resources.response.status).toBe(200)
        expect(resources.body.result.resources.map((row: { uri: string }) => row.uri)).toEqual([
          `tqx://qube/strategies/${ID}`,
          `tqx://qube/strategies/${ID_B}`,
          `tqx://qube/factors/${ID}`,
        ])
        expect(resources.body.result).not.toHaveProperty('nextCursor')
      }),
    )
    expect(s.fetch).toHaveBeenCalledTimes(4)
    expect(s.exchange).toHaveBeenCalledTimes(1)
  })

  it('completes strategy and cascading version arguments using short per-principal cache without Zod', async () => {
    const s = setup({ strategyCacheTtlMs: 20_000 })

    // First keystroke populates the cache from GET qube/api/strategies?limit=100 (without q).
    const first = await s.rpc('completion/complete', {
      ref: { type: 'ref/prompt', name: 'inspect_strategy' },
      argument: { name: 'strategy', value: 'mom' },
    })
    expect(first.body.result.completion.values).toEqual([`US Momentum [${ID}]`])
    expect(s.fetch).toHaveBeenCalledTimes(1)
    const firstUrl = new URL(String(s.fetch.mock.calls[0]![0]))
    expect(firstUrl.pathname).toBe('/tqxApi/qube/api/strategies')
    expect(firstUrl.searchParams.get('limit')).toBe('100')
    expect(firstUrl.searchParams.has('q')).toBe(false)

    // Subsequent keystrokes within TTL hit memory cache.
    const second = await s.rpc('completion/complete', {
      ref: { type: 'ref/prompt', name: 'inspect_strategy' },
      argument: { name: 'strategy', value: ID_B.slice(0, 8) },
    })
    expect(second.body.result.completion.values).toEqual([`HK Mean Reversion [${ID_B}]`])
    expect(s.fetch).toHaveBeenCalledTimes(1)

    // Another user does not share User A's cached strategy list.
    const otherUser = await s.rpc(
      'completion/complete',
      {
        ref: { type: 'ref/prompt', name: 'inspect_strategy' },
        argument: { name: 'strategy', value: '' },
      },
      userBToken,
    )
    expect(otherUser.body.result.completion.values).toHaveLength(2)
    expect(s.fetch).toHaveBeenCalledTimes(2)

    // Advancing beyond TTL refreshes User A's cache.
    s.advanceTime(25_000)
    await s.rpc('completion/complete', {
      ref: { type: 'ref/prompt', name: 'inspect_strategy' },
      argument: { name: 'strategy', value: 'US' },
    })
    expect(s.fetch).toHaveBeenCalledTimes(3)

    // Cascading version completion extracts strategyId from "Title [id]" and caches versions.
    const versions = await s.rpc('completion/complete', {
      ref: { type: 'ref/prompt', name: 'inspect_strategy' },
      argument: { name: 'version', value: 'v2' },
      context: { arguments: { strategy: `US Momentum [${ID}]` } },
    })
    expect(versions.body.result.completion.values).toEqual([`v2 - Low Turnover [${VERSION_2}]`])
    expect(s.fetch).toHaveBeenCalledTimes(4)

    // Second keystroke for same strategy versions hits cache.
    const versionsCached = await s.rpc('completion/complete', {
      ref: { type: 'ref/prompt', name: 'inspect_strategy' },
      argument: { name: 'version', value: 'base' },
      context: { arguments: { strategy: ID } },
    })
    expect(versionsCached.body.result.completion.values).toEqual([`v1 - Baseline [${VERSION}]`])
    expect(s.fetch).toHaveBeenCalledTimes(4)

    // Missing or fuzzy strategy context returns [] without calling upstream.
    const noStrategy = await s.rpc('completion/complete', {
      ref: { type: 'ref/prompt', name: 'inspect_strategy' },
      argument: { name: 'version', value: 'v' },
      context: { arguments: { strategy: 'US Momentum' } },
    })
    expect(noStrategy.body.result.completion.values).toEqual([])
    expect(s.fetch).toHaveBeenCalledTimes(4)
  })

  it('falls back to summary title search only when the first cached strategy page hasMore=true', async () => {
    const s = setup({
      fetch: async (input) => {
        const url = new URL(typeof input === 'string' ? input : input.toString())
        if (url.searchParams.get('view') === 'summary') {
          expect(url.searchParams.get('title')).toBe('Alpha')
          expect(url.searchParams.get('limit')).toBe('10')
          return envelope({
            strategies: [{ ...resource('strategy'), id: ID_B, title: 'Alpha Carry' }],
            has_more: false,
            next_cursor: null,
          })
        }
        return envelope({
          strategies: [{ ...resource('strategy'), id: ID, title: 'US Momentum' }],
          has_more: true,
          next_cursor: 'cursor-2',
        })
      },
    })

    const result = await s.rpc('completion/complete', {
      ref: { type: 'ref/prompt', name: 'inspect_strategy' },
      argument: { name: 'strategy', value: 'Alpha' },
    })
    expect(result.body.result.completion.values).toEqual([`Alpha Carry [${ID_B}]`])
    expect(s.fetch).toHaveBeenCalledTimes(2)
  })

  it('returns empty completions without failing when scope is missing or upstream errors', async () => {
    const s = setup({
      fetch: async () => envelope({ detail: { code: 'BUSY' } }, 503, 503),
    })

    const noScope = await s.rpc(
      'completion/complete',
      {
        ref: { type: 'ref/prompt', name: 'inspect_strategy' },
        argument: { name: 'strategy', value: 'US' },
      },
      unrelatedToken,
    )
    expect(noScope.body.result.completion.values).toEqual([])
    expect(s.fetch).not.toHaveBeenCalled()

    const upstreamError = await s.rpc('completion/complete', {
      ref: { type: 'ref/prompt', name: 'inspect_strategy' },
      argument: { name: 'strategy', value: 'US' },
    })
    expect(upstreamError.body.result.completion.values).toEqual([])
  })

  it('reads latest and frozen strategy resources via tqx://qube/strategies/ templates and enforces scope', async () => {
    const s = setup()

    // ResourceTemplate completion works too.
    const resourceComp = await s.rpc('completion/complete', {
      ref: { type: 'ref/resource', uri: 'tqx://qube/strategies/{strategy}/versions/{version}' },
      argument: { name: 'version', value: '2' },
      context: { arguments: { strategy: ID } },
    })
    expect(resourceComp.body.result.completion.values).toEqual([`v2 - Low Turnover [${VERSION_2}]`])

    // Latest workspace strategy resource
    const latest = await s.rpc('resources/read', {
      uri: `tqx://qube/strategies/${ID}`,
    })
    const latestContent = latest.body.result.contents[0]
    expect(latestContent.uri).toBe(`tqx://qube/strategies/${ID}`)
    expect(latestContent.mimeType).toBe('text/x-python')
    expect(latestContent.text).toBe('def on_bar():\n    return 1\n')

    // Frozen version resource (by versionId and by version number "v2")
    const frozenById = await s.rpc('resources/read', {
      uri: `tqx://qube/strategies/${ID}/versions/${VERSION_2}`,
    })
    expect(frozenById.body.result.contents[0]).toMatchObject({
      mimeType: 'text/x-python',
      text: '# frozen v2\n',
    })

    const frozenByNumber = await s.rpc('resources/read', {
      uri: `tqx://qube/strategies/${ID}/versions/v2`,
    })
    expect(frozenByNumber.body.result.contents[0].text).toBe('# frozen v2\n')

    // Missing scope triggers OAuth 403 insufficient_scope challenge.
    const forbidden = await s.rpc(
      'resources/read',
      { uri: `tqx://qube/strategies/${ID}` },
      unrelatedToken,
    )
    expect(forbidden.response.status).toBe(403)
    expect(forbidden.response.headers.get('WWW-Authenticate')).toContain('research:read')

    // Mismatched strategy_id on a version returns ResourceNotFoundError (-32602 with data.uri).
    const mismatchedUri = `tqx://qube/strategies/${ID_B}/versions/${VERSION_2}`
    const mismatched = await s.rpc('resources/read', { uri: mismatchedUri })
    expect(mismatched.body.error).toMatchObject({
      code: -32602,
      data: { uri: mismatchedUri },
    })
  })

  it.each(['2025-11-25', '2026-07-28'] as const)(
    'paginates strategy and factor summaries without prefetching or exposing source (%s)',
    async (protocolVersion) => {
      const strategies = Array.from({ length: 51 }, (_, i) => ({
        ...resource('strategy'),
        id: i.toString(16).padStart(24, '0'),
        title: `Strategy ${i}`,
        updated_at: '2026-11-20T00:00:00Z',
      }))
      const s = setup({
        fetch: async (input, init) => {
          const url = new URL(String(input))
          expect(init?.method).toBe('GET')
          const headers = new Headers(init?.headers)
          expect(headers.get('Authorization')).toBe('Bearer research-api-token')
          if (url.pathname.endsWith('/strategies')) {
            expect(url.searchParams.get('limit')).toBe('50')
            const cursor = url.searchParams.get('cursor')
            if (cursor === null)
              return envelope({
                strategies: strategies.slice(0, 50),
                next_cursor: 'opaque+/=',
                has_more: true,
              })
            expect(cursor).toBe('opaque+/=')
            return envelope({
              strategies: strategies.slice(50),
              next_cursor: null,
              has_more: false,
            })
          }
          expect(url.pathname).toBe('/tqxApi/qube/api/factors')
          if (!url.searchParams.has('cursor')) {
            expect(url.searchParams.get('limit')).toBe('49')
            return envelope({
              factors: [resource('factor')],
              next_cursor: 'factor-next',
              has_more: true,
            })
          }
          expect(url.searchParams.get('limit')).toBe('50')
          expect(url.searchParams.get('cursor')).toBe('factor-next')
          return envelope({
            factors: [{ ...resource('factor'), id: ID_B, code_type: 'python' }],
            next_cursor: null,
          })
        },
      })
      const first = await s.rpc('resources/list', {}, readToken, protocolVersion)
      expect(first.body.result.resources).toHaveLength(50)
      expect(s.fetch).toHaveBeenCalledTimes(1)
      const cursor = first.body.result.nextCursor
      expect(typeof cursor).toBe('string')
      expect(cursor).not.toBe('opaque+/=')
      const second = await s.rpc('resources/list', { cursor }, readToken, protocolVersion)
      expect(second.body.result.resources).toHaveLength(2)
      expect(s.fetch).toHaveBeenCalledTimes(3)
      expect(second.body.result.resources[1]).toMatchObject({
        uri: `tqx://qube/factors/${ID}`,
        mimeType: 'text/plain',
      })
      const third = await s.rpc(
        'resources/list',
        {
          cursor: second.body.result.nextCursor,
        },
        readToken,
        protocolVersion,
      )
      expect(third.body.result.resources[0]).toMatchObject({
        uri: `tqx://qube/factors/${ID_B}`,
        mimeType: 'text/x-python',
      })
      expect(third.body.result).not.toHaveProperty('nextCursor')
      expect(s.fetch).toHaveBeenCalledTimes(4)
      const summaries = [first, second, third].flatMap((page) => page.body.result.resources)
      expect(new Set(summaries.map((row) => row.uri)).size).toBe(53)
      expect(first.body.result.resources[0]).toMatchObject({
        title: 'Strategy 0',
        name: 'strategy-000000000000000000000000',
        mimeType: 'text/x-python',
        annotations: { lastModified: '2026-11-20T00:00:00Z' },
      })
      for (const row of summaries) {
        expectPngIcons(row.icons)
        expect(row).not.toHaveProperty('code')
        expect(row).not.toHaveProperty('parameters')
        expect(row).not.toHaveProperty('internal_path')
      }
      expect(summaries.every((row) => !row.uri.includes('/versions/'))).toBe(true)
      expect(s.exchange).toHaveBeenCalledWith(
        expect.objectContaining({ scopes: ['research:read'] }),
      )
    },
  )

  it('continues at the factor boundary when a final strategy page fills the limit', async () => {
    const s = setup({
      fetch: async (input) => {
        const url = new URL(String(input))
        if (url.pathname.endsWith('/strategies'))
          return envelope({
            strategies: Array.from({ length: 50 }, (_, i) => ({
              ...resource('strategy'),
              id: i.toString(16).padStart(24, '0'),
            })),
            next_cursor: null,
          })
        expect(url.pathname).toBe('/tqxApi/qube/api/factors')
        expect(url.searchParams.has('cursor')).toBe(false)
        return envelope({ factors: [], next_cursor: null })
      },
    })
    const first = await s.rpc('resources/list')
    expect(first.body.result.resources).toHaveLength(50)
    expect(s.fetch).toHaveBeenCalledTimes(1)
    const last = await s.rpc('resources/list', { cursor: first.body.result.nextCursor })
    expect(last.body.result.resources).toEqual([])
    expect(last.body.result).not.toHaveProperty('nextCursor')
    expect(s.fetch).toHaveBeenCalledTimes(2)
  })

  it('returns an empty catalog for accounts without resources or research scope', async () => {
    const s = setup({
      fetch: async (input) => {
        const key = String(input).includes('/strategies') ? 'strategies' : 'factors'
        return envelope({ [key]: [], next_cursor: null })
      },
    })
    const noScope = await s.rpc('resources/list', {}, unrelatedToken)
    expect(noScope.body.result.resources).toEqual([])
    expect(s.fetch).not.toHaveBeenCalled()
    expect(s.exchange).not.toHaveBeenCalled()
    const empty = await s.rpc('resources/list')
    expect(empty.body.result.resources).toEqual([])
    expect(empty.body.result).not.toHaveProperty('nextCursor')
    expect(s.fetch).toHaveBeenCalledTimes(2)
  })

  it.each([
    { description: undefined, updated_at: undefined },
    { description: null, updated_at: null },
    { description: '', updated_at: null },
  ])('omits empty summary fields for strategies and factors: %j', async (fields) => {
    const s = setup({
      fetch: async (input) => {
        const kind = String(input).includes('/strategies') ? 'strategy' : 'factor'
        return envelope({
          [kind === 'strategy' ? 'strategies' : 'factors']: [{ ...resource(kind), ...fields }],
          next_cursor: null,
        })
      },
    })
    const response = await s.rpc('resources/list')
    expect(response.body.result.resources).toHaveLength(2)
    for (const summary of response.body.result.resources) {
      expect(summary).not.toHaveProperty('description')
      expect(summary).not.toHaveProperty('annotations')
    }
  })

  it('preserves nonempty summary descriptions and timestamps', async () => {
    const s = setup({
      fetch: async (input) => {
        const kind = String(input).includes('/strategies') ? 'strategy' : 'factor'
        return envelope({
          [kind === 'strategy' ? 'strategies' : 'factors']: [
            { ...resource(kind), description: 'Momentum', updated_at: '2026-11-20T00:00:00Z' },
          ],
          next_cursor: null,
        })
      },
    })
    const response = await s.rpc('resources/list')
    expect(response.body.result.resources).toHaveLength(2)
    for (const summary of response.body.result.resources)
      expect(summary).toMatchObject({
        description: 'Momentum',
        annotations: { lastModified: '2026-11-20T00:00:00Z' },
      })
  })

  it('rejects malformed, cross-user, and cross-client cursors before calling the gateway', async () => {
    const s = setup({ fetch: async () => envelope({ strategies: [], next_cursor: 'next' }) })
    await Promise.all(
      ['', '%invalid', Buffer.from('{}').toString('base64url'), 'a'.repeat(8193)].map(
        async (cursor) => {
          const invalid = await s.rpc('resources/list', { cursor })
          expect(invalid.body.error).toMatchObject({ code: -32602 })
        },
      ),
    )
    expect(s.fetch).not.toHaveBeenCalled()
    const first = await s.rpc('resources/list')
    await Promise.all(
      [userBToken, clientBToken].map(async (bearer) => {
        const other = await s.rpc(
          'resources/list',
          { cursor: first.body.result.nextCursor },
          bearer,
        )
        expect(other.body.error).toMatchObject({ code: -32602 })
      }),
    )
    expect(s.fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects tampered payloads and signatures without exposing a principal fingerprint', async () => {
    const s = setup({ fetch: async () => envelope({ strategies: [], next_cursor: 'next' }) })
    const first = await s.rpc('resources/list')
    const [payload, signature] = (first.body.result.nextCursor as string).split('.') as [
      string,
      string,
    ]
    const position = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    expect(position).toEqual({ version: 2, kind: 'strategy', cursor: 'next' })
    const tag = Buffer.from(signature, 'base64url')
    tag[0] = tag[0]! ^ 1
    const tampered = [
      ...[{ kind: 'factor' }, { cursor: 'attacker-probe' }].map(
        (fields) =>
          `${Buffer.from(JSON.stringify({ ...position, ...fields })).toString('base64url')}.${signature}`,
      ),
      `${payload}.${tag.toString('base64url')}`,
      payload,
    ]
    await Promise.all(
      tampered.map(async (cursor) => {
        const response = await s.rpc('resources/list', { cursor })
        expect(response.body.error.code).toBe(-32602)
      }),
    )
    expect(s.fetch).toHaveBeenCalledTimes(1)
  })

  it('accepts cursors on another replica and invalidates them when the shared secret changes', async () => {
    const firstServer = setup({
      fetch: async () => envelope({ strategies: [], next_cursor: 'next' }),
    })
    const first = await firstServer.rpc('resources/list')
    const cursor = first.body.result.nextCursor
    const replica = setup({
      fetch: async (input) => {
        const url = new URL(String(input))
        if (url.pathname.endsWith('/strategies')) {
          expect(url.searchParams.get('cursor')).toBe('next')
          return envelope({ strategies: [], next_cursor: null })
        }
        return envelope({ factors: [], next_cursor: null })
      },
    })
    const resumed = await replica.rpc('resources/list', { cursor })
    expect(resumed.body.result.resources).toEqual([])
    expect(resumed.body.result).not.toHaveProperty('nextCursor')
    expect(replica.fetch).toHaveBeenCalledTimes(2)
    const rotated = setup({ config: { ...researchConfig, clientSecret: 'rotated-test-secret' } })
    const invalid = await rotated.rpc('resources/list', { cursor })
    expect(invalid.body.error.code).toBe(-32602)
    expect(rotated.fetch).not.toHaveBeenCalled()
  })

  it.each([undefined, '', 123])('rejects missing or invalid resource subjects: %j', async (sub) => {
    const s = setup({
      verifier: {
        verifyAccessToken: async () => ({
          ...researchAuth(),
          resource: new URL(testConfig.resourceUrl),
          extra: { sub },
        }),
      },
    })
    const response = await s.rpc('resources/list')
    expect(response.response.status, response.text).toBe(200)
    expect(response.body.error).toMatchObject({
      code: -32600,
      message: 'Research resource subject required',
    })
    expect(s.fetch).not.toHaveBeenCalled()
    expect(s.exchange).not.toHaveBeenCalled()
  })

  it('preserves an empty upstream cursor instead of treating it as the final page', async () => {
    const s = setup({
      fetch: async (input) => {
        const url = new URL(String(input))
        if (!url.searchParams.has('cursor')) return envelope({ strategies: [], next_cursor: '' })
        expect(url.searchParams.get('cursor')).toBe('')
        return Response.json({ detail: { code: 'INVALID_CURSOR' } }, { status: 400 })
      },
    })
    const first = await s.rpc('resources/list')
    expect(typeof first.body.result.nextCursor).toBe('string')
    const invalid = await s.rpc('resources/list', { cursor: first.body.result.nextCursor })
    expect(invalid.body.error).toMatchObject({ code: -32602 })
  })

  it.each([
    { strategies: [], next_cursor: null, has_more: true },
    { strategies: [], next_cursor: 123 },
    { strategies: [{ ...resource('strategy'), id: 'bad-id' }], next_cursor: null },
  ])('rejects malformed catalog pages: %j', async (page) => {
    const s = setup({ fetch: async () => envelope(page) })
    const response = await s.rpc('resources/list')
    expect(response.body.error.code).toBe(-32603)
  })

  it('rejects repeated upstream cursors instead of returning a pagination loop', async () => {
    const s = setup({ fetch: async () => envelope({ strategies: [], next_cursor: 'same' }) })
    const first = await s.rpc('resources/list')
    const repeated = await s.rpc('resources/list', { cursor: first.body.result.nextCursor })
    expect(repeated.body.error.code).toBe(-32603)
    expect(s.fetch).toHaveBeenCalledTimes(2)
  })

  it('rejects unknown factor types while listing and oversized pages', async () => {
    const s = setup({
      fetch: async (input) => {
        if (String(input).includes('/strategies'))
          return envelope({ strategies: [], next_cursor: null })
        return envelope({
          factors: [{ ...resource('factor'), code_type: 'unknown' }],
          next_cursor: null,
        })
      },
    })
    expect((await s.rpc('resources/list')).body.error.code).toBe(-32603)
    const oversized = setup({
      fetch: async () =>
        envelope({
          strategies: Array.from({ length: 51 }, () => resource('strategy')),
          next_cursor: null,
        }),
    })
    expect((await oversized.rpc('resources/list')).body.error.code).toBe(-32603)
  })

  it.each([
    ['formula', 'text/plain', 'Rank(close / Delay(close, 20))'],
    ['python', 'text/x-python', 'def factor(data):\n    return data.close\n'],
  ])('reads %s factor source with matching MIME type', async (codeType, mimeType, code) => {
    const s = setup({
      fetch: async (input) => {
        expect(new URL(String(input)).pathname).toBe(`/tqxApi/qube/api/factors/${ID}/source`)
        return envelope({ ...resource('factor'), code_type: codeType, code })
      },
    })
    const response = await s.rpc('resources/read', { uri: `tqx://qube/factors/${ID}` })
    expect(response.body.result.contents).toEqual([
      { uri: `tqx://qube/factors/${ID}`, mimeType, text: code },
    ])
    const forbidden = await s.rpc(
      'resources/read',
      { uri: `tqx://qube/factors/${ID}` },
      unrelatedToken,
    )
    expect(forbidden.response.status).toBe(403)
    expect(forbidden.response.headers.get('WWW-Authenticate')).toContain('research:read')
    expect(s.fetch).toHaveBeenCalledTimes(1)
  })

  it.each([{ code_type: undefined }, { code_type: 'unknown' }, { code: undefined }, { id: ID_B }])(
    'rejects invalid factor source responses: %j',
    async (fields) => {
      const s = setup({ fetch: async () => envelope({ ...resource('factor'), ...fields }) })
      const response = await s.rpc('resources/read', { uri: `tqx://qube/factors/${ID}` })
      expect(response.body.error.code).toBe(-32603)
      expect(response.text).not.toContain('private-upstream-message')
      expect(response.text).not.toContain('internal_path')
    },
  )

  it.each([403, 404])(
    'returns resource-not-found for invalid or inaccessible factors (%i)',
    async (status) => {
      const s = setup({
        fetch: async () => envelope({ detail: { code: 'FACTOR_NOT_FOUND' } }, status, status),
      })
      const malformed = await s.rpc('resources/read', { uri: 'tqx://qube/factors/bad-id' })
      expect(malformed.body.error.code).toBe(-32602)
      const completionLabel = await s.rpc('resources/read', {
        uri: `tqx://qube/factors/anything%20%5B${ID}%5D`,
      })
      expect(completionLabel.body.error.code).toBe(-32602)
      expect(s.fetch).not.toHaveBeenCalled()
      const missing = await s.rpc('resources/read', { uri: `tqx://qube/factors/${ID}` })
      expect(missing.body.error).toMatchObject({
        code: -32602,
        data: { uri: `tqx://qube/factors/${ID}` },
      })
    },
  )

  it('dynamically embeds the verified MCP resource when inspect_strategy receives a valid exact strategyId', async () => {
    const s = setup()

    // Latest workspace strategy via completion string "Title [id]"
    const latestPrompt = await s.rpc('prompts/get', {
      name: 'inspect_strategy',
      arguments: { strategy: `US Momentum [${ID}]` },
    })
    const latestMessages = latestPrompt.body.result.messages
    expect(latestMessages).toHaveLength(2)
    expect(latestMessages[0]).toMatchObject({
      role: 'user',
      content: {
        type: 'resource',
        resource: {
          uri: `tqx://qube/strategies/${ID}`,
          mimeType: 'text/x-python',
        },
      },
    })
    expect(latestMessages[0].content.resource.text).toBe('def on_bar():\n    return 1\n')
    expect(latestMessages[1].content.text).toContain('"title": "US Momentum"')
    expect(latestMessages[1].content.text).toContain('"sourceRevision": 3')
    expect(latestMessages[1].content.text).toContain('"parameters": {}')
    expect(latestMessages[1].content.text).toContain('"factorBinding": null')
    expect(latestMessages[1].content.text).not.toContain('"code":')
    expect(JSON.stringify(latestMessages)).not.toContain('internal_path')
    expect(latestMessages[1].content.text).toContain(`tqx://qube/strategies/${ID}`)
    expect(latestMessages[1].content.text).toContain(
      'Do not call tqx_research_call with strategy.get',
    )

    // Specific frozen version via completion string "v2 - Low Turnover [versionId]"
    const versionPrompt = await s.rpc(
      'prompts/get',
      {
        name: 'inspect_strategy',
        arguments: {
          strategy: `US Momentum [${ID}]`,
          version: `v2 - Low Turnover [${VERSION_2}]`,
        },
      },
      readToken,
      '2025-11-25',
    )
    const versionMessages = versionPrompt.body.result.messages
    expect(versionMessages).toHaveLength(2)
    expect(versionMessages[0].content).toMatchObject({
      type: 'resource',
      resource: {
        uri: `tqx://qube/strategies/${ID}/versions/${VERSION_2}`,
        mimeType: 'text/x-python',
      },
    })
    expect(versionMessages[1].content.text).toContain(`v2 (${VERSION_2})`)
    expect(versionMessages[1].content.text).toContain('"name": "Low Turnover"')
  })

  it('returns dynamic not-found guidance when an exact strategyId or version is deleted or inaccessible', async () => {
    const s = setup()

    // Non-existent/deleted strategyId
    const missingStrategy = await s.rpc('prompts/get', {
      name: 'inspect_strategy',
      arguments: { strategy: ID_B },
    })
    expect(missingStrategy.body.result.messages).toHaveLength(1)
    expect(missingStrategy.body.result.messages[0].content.type).toBe('text')
    expect(missingStrategy.body.result.messages[0].content.text).toContain(
      'does not exist, has been deleted, or does not belong to the current authenticated account',
    )
    expect(missingStrategy.body.result.messages[0].content.text).toContain('strategy.list')

    // Valid strategyId with missing version number
    const missingVersion = await s.rpc('prompts/get', {
      name: 'inspect_strategy',
      arguments: { strategy: ID, version: 'v99' },
    })
    expect(missingVersion.body.result.messages).toHaveLength(1)
    expect(missingVersion.body.result.messages[0].content.text).toContain('version "v99"')
    expect(missingVersion.body.result.messages[0].content.text).toContain('strategy.version.list')
    expect(missingVersion.body.result.messages[0].content.text).toContain(
      `tqx://qube/strategies/${ID}`,
    )
  })

  it.each([undefined, 'v2'])(
    'includes metadata lookup guidance after a transient failure (version %j)',
    async (requestedVersion) => {
      const s = setup({
        fetch: async () => {
          throw new Error('Unavailable')
        },
      })
      const response = await s.rpc('prompts/get', {
        name: 'inspect_strategy',
        arguments: { strategy: ID, ...(requestedVersion ? { version: requestedVersion } : {}) },
      })
      const text = response.body.result.messages[0].content.text
      expect(text).toContain('temporarily unavailable')
      expect(text).toContain('Resource reads return source code only')
      expect(text).toContain('parameters, factor binding, and source/config revisions')
      expect(text).toContain('action "strategy.get"')
      if (requestedVersion) expect(text).toContain('"strategy.version.get"')
    },
  )

  it('returns fuzzy-lookup prompt without hitting Qube when given a strategy name instead of an ID', async () => {
    const s = setup()

    const fuzzy = await s.rpc('prompts/get', {
      name: 'inspect_strategy',
      arguments: { strategy: 'Momentum' },
    })
    expect(s.fetch).not.toHaveBeenCalled()
    expect(fuzzy.body.result.messages).toHaveLength(1)
    const text = fuzzy.body.result.messages[0].content.text
    expect(text).toContain('action "strategy.list"')
    expect(text).toContain('"keyword":"Momentum"')
    expect(text).toContain('tqx://qube/strategies/<strategyId>')
    expect(text).toContain('If multiple strategies match')
    expect(text).toContain('Resource reads return source code only')
    expect(text).toContain('parameters, factor binding, and source/config revisions')
    expect(text).toContain('action "strategy.get"')

    // Missing scope on prompts/get triggers OAuth 403 challenge.
    const forbidden = await s.rpc(
      'prompts/get',
      { name: 'inspect_strategy', arguments: { strategy: 'Momentum' } },
      unrelatedToken,
    )
    expect(forbidden.response.status).toBe(403)
    expect(forbidden.response.headers.get('WWW-Authenticate')).toContain('research:read')
  })
})
