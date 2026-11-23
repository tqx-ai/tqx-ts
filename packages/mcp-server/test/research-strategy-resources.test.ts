import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '../src/app'
import { createOAuthFixture, testConfig } from './helpers/oauth'
import { envelope, ID, researchConfig, resource, VERSION, version } from './helpers/research'

const ID_B = '111111111111111111111111'
const VERSION_2 = '222222222222222222222222'

const oauth = await createOAuthFixture()
const readToken = await oauth.sign({ sub: 'user-a', scope: 'research:read' })
const userBToken = await oauth.sign({ sub: 'user-b', scope: 'research:read' })
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
    researchConfig,
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

describe('Qube strategy resources, completions, and dynamic prompt', () => {
  it('advertises inspect_strategy prompt, strategy resource templates, and completions capability', async () => {
    const s = setup()

    const discovered = await s.rpc('server/discover')
    expect(discovered.body.result.capabilities).toMatchObject({
      tools: {},
      prompts: {},
      resources: {},
      completions: {},
    })

    const prompts = await s.rpc('prompts/list')
    expect(prompts.body.result.prompts).toEqual([
      expect.objectContaining({
        name: 'inspect_strategy',
        arguments: [
          expect.objectContaining({ name: 'strategy', required: true }),
          expect.objectContaining({ name: 'version', required: false }),
        ],
      }),
    ])

    const templates = await s.rpc('resources/templates/list')
    expect(
      templates.body.result.resourceTemplates.map((t: { uriTemplate: string }) => t.uriTemplate),
    ).toEqual([
      'tqx://qube/strategies/{strategy}',
      'tqx://qube/strategies/{strategy}/versions/{version}',
    ])
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
    expect(latestContent.mimeType).toBe('application/json')
    const latestData = JSON.parse(latestContent.text)
    expect(latestData).toMatchObject({
      kind: 'strategy',
      id: ID,
      title: 'US Momentum',
      code: 'def on_bar():\n    return 1\n',
    })
    expect(latestData).not.toHaveProperty('internal_path')

    // Frozen version resource (by versionId and by version number "v2")
    const frozenById = await s.rpc('resources/read', {
      uri: `tqx://qube/strategies/${ID}/versions/${VERSION_2}`,
    })
    expect(JSON.parse(frozenById.body.result.contents[0].text)).toMatchObject({
      kind: 'strategy_version',
      id: VERSION_2,
      resourceId: ID,
      version: 2,
      name: 'Low Turnover',
      code: '# frozen v2\n',
    })

    const frozenByNumber = await s.rpc('resources/read', {
      uri: `tqx://qube/strategies/${ID}/versions/v2`,
    })
    expect(JSON.parse(frozenByNumber.body.result.contents[0].text)).toMatchObject({
      id: VERSION_2,
      version: 2,
    })

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
          mimeType: 'application/json',
        },
      },
    })
    expect(JSON.parse(latestMessages[0].content.resource.text)).toMatchObject({
      id: ID,
      title: 'US Momentum',
      code: 'def on_bar():\n    return 1\n',
    })
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
        mimeType: 'application/json',
      },
    })
    expect(versionMessages[1].content.text).toContain(`v2 (${VERSION_2})`)
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
