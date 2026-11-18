import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '../src/app'
import { actions } from '../src/research/actions'
import { createOAuthFixture, testConfig } from './helpers/oauth'
import { envelope, ID, researchConfig, resource, run, RUN, validation } from './helpers/research'

const oauth = await createOAuthFixture()
const token = await oauth.sign({ scope: 'research:read research:run research:write' })
const readToken = await oauth.sign({ scope: 'research:read' })
const runToken = await oauth.sign({ scope: 'research:run' })
const writeToken = await oauth.sign({ scope: 'research:write' })
const unrelatedToken = await oauth.sign({ scope: 'trade:read' })
const disposals: Array<() => void> = []
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose()
})

function setup() {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => envelope(resource()))
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
    research: { fetch, exchange },
    demoPing: false,
  })
  disposals.push(app.dispose)
  function rpc(
    method: string,
    params: Record<string, unknown> = {},
    bearer = token,
    version = '2026-07-28',
  ) {
    return app.request('http://127.0.0.1/mcp', {
      method: 'POST',
      headers: {
        Host: '127.0.0.1',
        Authorization: `Bearer ${bearer}`,
        Origin: 'http://localhost:6274',
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': version,
        ...(version === '2026-07-28'
          ? {
              'Mcp-Method': method,
              ...(typeof params.name === 'string' ? { 'Mcp-Name': params.name } : {}),
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
                  'io.modelcontextprotocol/clientCapabilities': {},
                },
              }
            : {}),
        },
      }),
    })
  }
  async function call(name: string, args: unknown, bearer = token, version = '2026-07-28') {
    const response = await rpc('tools/call', { name, arguments: args }, bearer, version)
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
  return { fetch, exchange, app, rpc, call }
}

describe('Research MCP tools over authenticated HTTP', () => {
  it('exposes two tools with compact object schemas and no aggregated output schema', async () => {
    const s = setup()
    const body = await (await s.rpc('tools/list')).json()
    expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual([
      'tqx_research_explore',
      'tqx_research_call',
    ])
    const [explore, call] = body.result.tools
    expect(explore.inputSchema.type).toBe('object')
    expect(explore.inputSchema.required ?? []).toEqual([])
    expect(call.inputSchema.required).toEqual(['action', 'input'])
    expect(call).not.toHaveProperty('outputSchema')
    expect(call.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    })
    expect(JSON.stringify(body).length).toBeLessThan(5000)
    expect(s.exchange).not.toHaveBeenCalled()
  })

  it('explores the complete catalog and precise action detail without any business scope or exchange', async () => {
    const s = setup()
    const { body } = await s.call('tqx_research_explore', {}, unrelatedToken)
    expect(body.result.isError).not.toBe(true)
    const catalog = body.result.structuredContent.actions
    expect(catalog).toHaveLength(57)
    expect(catalog.map((a: { action: string }) => a.action)).toEqual([...actions.keys()].toSorted())
    expect(catalog[0]).toEqual({ action: 'backtest.chart.get', description: expect.any(String) })
    const detail = await s.call(
      'tqx_research_explore',
      { action: 'strategy.backtest.submit' },
      unrelatedToken,
    )
    const doc = detail.body.result.structuredContent
    expect(detail.body.result.isError).not.toBe(true)
    expect(doc.inputSchema.required).toEqual(
      expect.arrayContaining([
        'strategyId',
        'requestId',
        'expectedSourceRevision',
        'expectedConfigRevision',
      ]),
    )
    expect(doc.outputSchema.required).toContain('id')
    expect(doc.documentation).toContain('strategy.backtest.get')
    expect(doc.documentation).toContain('backtest.result.get')
    expect(JSON.parse(detail.body.result.content[0].text)).toEqual(doc)
    expect(s.fetch).not.toHaveBeenCalled()
    expect(s.exchange).not.toHaveBeenCalled()
  })

  it.each(['constructor', '__proto__', 'factor.tuning.create', 'data.query', 'https://bad.test'])(
    'rejects unknown action %s as a tool error',
    async (action) => {
      const s = setup()
      const call = await s.call('tqx_research_call', { action, input: {} })
      expect(call.body.result.isError).toBe(true)
      expect(call.body.result.structuredContent.error.code).toBe('UNKNOWN_ACTION')
      const explore = await s.call('tqx_research_explore', { action })
      expect(explore.body.result.structuredContent.error.code).toBe('UNKNOWN_ACTION')
      expect(s.exchange).not.toHaveBeenCalled()
    },
  )

  it.each(['2025-11-25', '2026-07-28'])(
    'challenges the specific action scope before action validation using %s',
    async (version) => {
      const s = setup()
      const cases = [
        ['factor.get', { factorId: ID }, runToken, 'research:read'],
        ['factor.validate', { factorId: 'invalid' }, readToken, 'research:run'],
        ['strategy.backtest.submit', {}, writeToken, 'research:run'],
        ['factor.delete', {}, readToken, 'research:write'],
        ['strategy.version.create', {}, readToken, 'research:write'],
        ...(['factor', 'strategy'] as const).flatMap(
          (kind) =>
            [
              [`${kind}.tuning.submit`, {}, readToken, 'research:run'],
              [`${kind}.tuning.cancel`, {}, writeToken, 'research:run'],
              [`${kind}.tuning.rerun`, {}, readToken, 'research:run'],
              [`${kind}.tuning.apply`, {}, runToken, 'research:write'],
              [`${kind}.tuning.get`, {}, runToken, 'research:read'],
              [`${kind}.tuning.list`, {}, writeToken, 'research:read'],
              [`${kind}.tuning.search`, {}, runToken, 'research:read'],
            ] as const,
        ),
      ] as const
      await Promise.all(
        cases.map(async ([action, input, bearer, scope]) => {
          const { response } = await s.call('tqx_research_call', { action, input }, bearer, version)
          expect(response.status).toBe(403)
          expect(response.headers.get('WWW-Authenticate')).toContain(`scope="${scope}"`)
          expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:6274')
        }),
      )
      expect(s.exchange).not.toHaveBeenCalled()
      expect(s.fetch).not.toHaveBeenCalled()
    },
  )

  it('calls actions directly without explore and returns unwrapped business results', async () => {
    const s = setup()
    const { response, body } = await s.call(
      'tqx_research_call',
      { action: 'factor.get', input: { factorId: ID } },
      readToken,
    )
    expect(response.status).toBe(200)
    expect(body.result.isError).not.toBe(true)
    expect(body.result.structuredContent).toMatchObject({
      kind: 'factor',
      id: ID,
      sourceRevision: 3,
      configRevision: 2,
    })
    expect(body.result.structuredContent).not.toHaveProperty('data')
    expect(body.result.structuredContent).not.toHaveProperty('code')
    expect(JSON.parse(body.result.content[0].text)).toEqual(body.result.structuredContent)
    expect(s.exchange).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectToken: readToken,
        scopes: ['research:read'],
        resource: researchConfig.resource,
      }),
    )
    expect(JSON.stringify(body)).not.toContain('research-api-token')
  })

  it('uses run-only authorization without a trading Agent and preserves failure as business state', async () => {
    const s = setup()
    s.fetch.mockImplementation(async () => envelope(validation))
    const validated = await s.call(
      'tqx_research_call',
      { action: 'factor.validate', input: { factorId: ID } },
      runToken,
    )
    expect(validated.body.result.isError).not.toBe(true)
    expect(validated.body.result.structuredContent.valid).toBe(false)
    s.fetch.mockImplementation(async () => envelope(run('factor', 'failed')))
    const failed = await s.call(
      'tqx_research_call',
      { action: 'factor.analysis.get', input: { analysisId: RUN } },
      readToken,
    )
    expect(failed.body.result.isError).not.toBe(true)
    expect(failed.body.result.structuredContent).toMatchObject({ status: 'failed', terminal: true })
  })

  it('normalizes handler errors while preserving SDK errors for invalid outer arguments', async () => {
    const s = setup()
    const invalid = await s.call('tqx_research_call', {
      action: 'factor.get',
      input: { factorId: 'invalid' },
    })
    expect(invalid.body.result).toMatchObject({
      isError: true,
      structuredContent: { error: { code: 'INVALID_INPUT' } },
    })
    const outer = await s.call('tqx_research_call', { action: 'factor.get', input: null })
    expect(outer.body.result.isError).toBe(true)
    expect(outer.body.result.content[0].text).toContain('Input validation error')
    expect(s.exchange).not.toHaveBeenCalled()
  })

  it('returns safe upstream conflict errors with request IDs and does not retry writes', async () => {
    const s = setup()
    s.fetch.mockImplementation(async () =>
      Response.json(
        {
          code: 409,
          detail: { code: 'CONFIG_CONFLICT', message: 'private-upstream-message', token: 'secret' },
          request_id: 'conflict-123',
        },
        { status: 409 },
      ),
    )
    const { body } = await s.call(
      'tqx_research_call',
      { action: 'strategy.update', input: { strategyId: ID, baseConfigRevision: 2, title: 'new' } },
      writeToken,
    )
    expect(body.result).toMatchObject({
      isError: true,
      structuredContent: { error: { code: 'CONFIG_CONFLICT', requestId: 'conflict-123' } },
    })
    expect(JSON.stringify(body)).not.toContain('private-upstream-message')
    expect(JSON.stringify(body)).not.toContain('secret')
    expect(s.fetch).toHaveBeenCalledTimes(1)
  })
})
