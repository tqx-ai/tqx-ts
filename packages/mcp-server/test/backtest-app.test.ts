import { execFileSync } from 'node:child_process'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { createApp } from '../src/app'
import { REPORT_META } from '../src/research/backtest-report/contract'
import { REPORT_MIME, REPORT_URI } from '../src/apps/qube/backtest/resource'
import { createOAuthFixture, testConfig } from './helpers/oauth'
import { chart, envelope, ID, RUN, researchConfig, run } from './helpers/research'

const oauth = await createOAuthFixture()
const readToken = await oauth.sign({ scope: 'research:read' })
const runToken = await oauth.sign({ scope: 'research:run' })
const disposals: Array<() => void> = []
beforeAll(() => {
  execFileSync('bun', ['run', '--cwd', 'packages/mcp-server', 'build:ui'], {
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'development' },
  })
})
afterEach(() => {
  disposals.splice(0).forEach((dispose) => dispose())
})

function setup() {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (url) => {
    const path = new URL(String(url)).pathname
    if (path.endsWith('/chart')) return envelope(chart)
    if (path.endsWith(`/${RUN}`))
      return envelope({
        ...run('strategy'),
        title: 'Frozen report',
        market: 'us',
        parameters: { backtest: { init_balance: 1000 } },
      })
    if (path.endsWith('/strategies')) return envelope({ strategies: [], next_cursor: null })
    if (path.endsWith('/factors')) return envelope({ factors: [], next_cursor: null })
    return envelope({
      run_id: RUN,
      field: 'trades',
      offset: 0,
      limit: 5,
      total: 2,
      has_more: false,
      rows: [{ symbol: 'AAPL.US', price: '12.3456789', token: 'private' }],
    })
  })
  const exchange = vi.fn(async ({ scopes }: { scopes: readonly string[] }) => ({
    token: 'exchanged-secret',
    scopes,
    expiresAt: Date.now() + 300_000,
  }))
  const app = createApp({
    config: testConfig,
    fetch: oauth.fetch,
    tradingConfig: null,
    researchConfig,
    research: { fetch, exchange },
    demoPing: false,
  })
  disposals.push(app.dispose)
  async function rpc(
    method: string,
    params: Record<string, unknown> = {},
    bearer = readToken,
    apps = true,
    version = '2026-07-28',
  ) {
    const response = await app.request('http://127.0.0.1/mcp', {
      method: 'POST',
      headers: {
        Host: '127.0.0.1',
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': version,
        ...(version === '2026-07-28'
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
          ...(version === '2026-07-28'
            ? {
                _meta: {
                  'io.modelcontextprotocol/protocolVersion': version,
                  'io.modelcontextprotocol/clientCapabilities': apps
                    ? { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [REPORT_MIME] } } }
                    : {},
                },
              }
            : {}),
        },
      }),
    })
    const text = await response.text()
    const json = response.headers.get('Content-Type')?.includes('text/event-stream')
      ? text
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('\n')
      : text
    return { response, body: JSON.parse(json) }
  }
  const call = (name: string, input: unknown, bearer = readToken, apps = true, version?: string) =>
    rpc('tools/call', { name, arguments: input }, bearer, apps, version)
  return { fetch, exchange, rpc, call }
}

describe('Qube MCP Apps integration', () => {
  it('advertises stable tools, exact URI, scopes and visibility for both host capabilities', async () => {
    const s = setup()
    const apps = (await s.rpc('tools/list')).body.result.tools
    const text = (await s.rpc('tools/list', {}, readToken, false)).body.result.tools
    expect(apps).toEqual(text)
    const view = apps.find((tool: { name: string }) => tool.name === 'tqx_open_backtest_view')
    expect(view['_meta'].ui).toEqual({ resourceUri: REPORT_URI, visibility: ['model', 'app'] })
    expect(view.inputSchema.required).toEqual(['type', 'runId'])
    expect(view.inputSchema.properties.type).toMatchObject({ const: 'qube' })
    expect(view.description).toContain('automatically')
    expect(view.description).toContain('submission response id')
    expect(apps.map((tool: { name: string }) => tool.name)).toEqual([
      'tqx_research_explore',
      'tqx_research_call',
      'tqx_open_backtest_view',
    ])
    expect(
      apps.find((tool: { name: string }) => tool.name === 'tqx_research_call')['_meta'].ui,
    ).toEqual({ visibility: ['model', 'app'] })
    expect(
      apps.find((tool: { name: string }) => tool.name === 'tqx_research_call')['_meta'].ui,
    ).not.toHaveProperty('resourceUri')
    expect(s.exchange).not.toHaveBeenCalled()
  })
  it.each(['2025-11-25', '2026-07-28'])(
    'returns a bounded text summary with private UI data using %s',
    async (version) => {
      const s = setup()
      const { body } = await s.call(
        'tqx_open_backtest_view',
        { type: 'qube', runId: RUN },
        readToken,
        false,
        version,
      )
      expect(body.result.isError).not.toBe(true)
      expect(body.result.structuredContent).toMatchObject({
        type: 'qube',
        runId: RUN,
        title: 'Frozen report',
        metrics: { sharpe: { value: 1.2 } },
      })
      expect(body.result.structuredContent).not.toHaveProperty('chart')
      expect(JSON.parse(body.result.content[0].text)).toEqual(body.result.structuredContent)
      expect(body.result['_meta'][REPORT_META].chart.points).toHaveLength(1)
      expect(JSON.stringify(body)).not.toMatch(/private-source|exchanged-secret|storage_path/)
      expect(s.fetch).toHaveBeenCalledTimes(2)
    },
  )
  it('rejects invalid inputs and scopes before token exchange', async () => {
    const s = setup()
    const invalid = await Promise.all(
      [{ runId: RUN }, { type: 'other', runId: RUN }, { type: 1, runId: RUN }].map((input) =>
        s.call('tqx_open_backtest_view', input),
      ),
    )
    for (const response of invalid) expect(response.body.result.isError).toBe(true)
    const forbidden = await s.call('tqx_open_backtest_view', { type: 'qube', runId: RUN }, runToken)
    expect(forbidden.response.status).toBe(403)
    expect(forbidden.response.headers.get('WWW-Authenticate')).toContain('research:read')
    const query = await s.call('tqx_research_call', {
      action: 'backtest.result.get',
      input: { runId: RUN, field: 'trades', limit: 501 },
    })
    expect(query.body.result.isError).toBe(true)
    expect(s.exchange).not.toHaveBeenCalled()
    expect(s.fetch).not.toHaveBeenCalled()
  })
  it('serves a static self-contained resource without credentials, fixtures or business reads', async () => {
    const s = setup()
    const { body } = await s.rpc('resources/read', { uri: REPORT_URI })
    expect(body.error).toBeUndefined()
    const resource = body.result.contents[0]
    expect(resource).toMatchObject({
      uri: REPORT_URI,
      mimeType: REPORT_MIME,
      _meta: {
        ui: {
          prefersBorder: false,
          csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
        },
      },
    })
    expect(resource.text).toContain('Painted by TQX')
    expect(resource.text).toContain('ui/initialize')
    expect(resource.text).not.toMatch(
      /hk-loss|Synthetic instrument|Local fixture|exchanged-secret|script src=|APP_SCRIPT|__VUE_HMR_RUNTIME__|You are running a development build/,
    )
    expect(Buffer.byteLength(resource.text)).toBeLessThan(1_048_576)
    expect(s.fetch).not.toHaveBeenCalled()
    expect(s.exchange).not.toHaveBeenCalled()
    expect((await s.rpc('resources/read', { uri: REPORT_URI }, runToken)).response.status).toBe(403)
  })
  it('serves UI pagination through the unchanged public Research action', async () => {
    const s = setup()
    const { body } = await s.call('tqx_research_call', {
      action: 'backtest.result.get',
      input: { runId: RUN, field: 'trades', offset: 0, limit: 5 },
    })
    expect(body.result.isError).not.toBe(true)
    expect(body.result.structuredContent).toMatchObject({
      runId: RUN,
      field: 'trades',
      offset: 0,
      limit: 5,
      rows: [{ symbol: 'AAPL.US', price: '12.3456789' }],
    })
    expect(body.result['_meta']).not.toHaveProperty(REPORT_META)
    expect(JSON.parse(body.result.content[0].text)).toEqual(body.result.structuredContent)
    expect(s.fetch).toHaveBeenCalledTimes(1)
    expect(String(s.fetch.mock.calls[0]?.[0])).toContain('field=trades&offset=0&limit=5')
    for (const [, init] of s.fetch.mock.calls) expect(init?.method).toBe('GET')
    const forbidden = await s.call(
      'tqx_research_call',
      {
        action: 'backtest.result.get',
        input: { runId: RUN, field: 'trades' },
      },
      runToken,
    )
    expect(forbidden.response.status).toBe(403)
  })
  it('merges the UI resource exactly once into signed business pagination', async () => {
    const s = setup()
    s.fetch.mockImplementation(async (url) => {
      const target = new URL(String(url)),
        limit = Number(target.searchParams.get('limit'))
      if (target.pathname.endsWith('/factors')) return envelope({ factors: [], next_cursor: null })
      return envelope({
        strategies: target.searchParams.has('cursor')
          ? []
          : Array.from({ length: limit }, (_, i) => ({
              id: i === 0 ? ID : i.toString(16).padStart(24, '0'),
              title: `Strategy ${i}`,
            })),
        next_cursor: target.searchParams.has('cursor') ? null : 'next-page',
      })
    })
    const first = (await s.rpc('resources/list')).body.result
    expect(first.resources).toHaveLength(50)
    expect(first.resources[0].uri).toBe(REPORT_URI)
    expect(new URL(String(s.fetch.mock.calls[0]?.[0])).searchParams.get('limit')).toBe('49')
    const next = (await s.rpc('resources/list', { cursor: first.nextCursor })).body.result
    expect(next.resources).toEqual([])
    expect(next.nextCursor).toBeUndefined()
    const text = (await s.rpc('resources/list', {}, readToken, false)).body.result
    expect(text.resources.some((item: { uri: string }) => item.uri === REPORT_URI)).toBe(false)
  })
  it('documents automatic native reporting after successful same-run polling', async () => {
    const s = setup()
    const { body } = await s.call('tqx_research_explore', { action: 'strategy.backtest.submit' })
    expect(body.result.structuredContent.documentation).toContain(
      'automatically call tqx_open_backtest_view',
    )
    expect(body.result.structuredContent.documentation).toContain('never resubmit')
  })
})
