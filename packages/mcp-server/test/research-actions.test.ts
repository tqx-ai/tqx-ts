import { afterEach, describe, expect, it } from 'vitest'
import * as v from 'valibot'

import { actions, callAction } from '../src/research/actions'
import { describeAction } from '../src/research/documentation'
import {
  chart,
  envelope,
  ID,
  researchAuth,
  resource,
  resultPage,
  RUN,
  run,
  setupResearch,
  validation,
  VERSION,
  version,
} from './helpers/research'

const disposals: Array<() => void> = []
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose()
})
function setup() {
  const s = setupResearch()
  disposals.push(s.dispose)
  return s
}
const revisions = {
  requestId: 'run-intent-1',
  expectedSourceRevision: 3,
  expectedConfigRevision: 2,
}
async function call(s: ReturnType<typeof setup>, name: string, input: unknown, confirm?: boolean) {
  return callAction(s.gateway, researchAuth(), actions.get(name)!, input, confirm)
}
const snapshot = {
  id: VERSION,
  factor_id: ID,
  run_id: RUN,
  name: 'Saved analysis',
  results: {
    metrics: { rank_ic: 0.1 },
    group_return_summary: {},
    internal_path: '/private/not-public',
  },
}

describe('Research action contracts and request mapping', () => {
  it('publishes exactly 43 coherent action documents with validated examples', () => {
    expect(actions.size).toBe(43)
    for (const action of actions.values()) {
      expect(v.safeParse(action.input, action.exampleInput).success, action.name).toBe(true)
      expect(v.safeParse(action.output, action.exampleOutput).success, action.name).toBe(true)
      const doc = describeAction(action)
      expect(doc.inputSchema).toHaveProperty('$schema')
      expect(doc.outputSchema.type).toBe('object')
      expect(doc.documentation).toContain('tqx_research_call')
      expect(doc.documentation).toContain('https://github.com/tqx-ai/tqx-ts/')
      expect(doc.documentation).not.toContain('/Users/')
      for (const related of action.related) expect(actions.has(related), related).toBe(true)
    }
  })

  for (const kind of ['factor', 'strategy'] as const) {
    const ids = { [`${kind}Id`]: ID },
      prefix = kind === 'factor' ? 'factors' : 'strategies',
      child = kind === 'factor' ? 'analysis' : 'backtest',
      children = kind === 'factor' ? 'analyses' : 'backtests',
      runPath = kind === 'factor' ? 'factor-analyses' : 'strategy-backtests',
      versionPath = `${kind}-versions`
    const runIds = { [kind === 'factor' ? 'analysisId' : 'runId']: RUN }
    const cases: Array<{
      action: string
      input: Record<string, unknown>
      path: string
      method?: string
      data: unknown
      body?: unknown
      query?: Record<string, string>
    }> = [
      {
        action: `${kind}.list`,
        input: { market: 'us', keyword: 'a+b', cursor: 'opaque+/=' },
        path: prefix,
        data: { [prefix]: [resource(kind)], next_cursor: 'next', counts: { us: 1 } },
        query: { limit: '20', market: 'us', q: 'a+b', cursor: 'opaque+/=' },
      },
      { action: `${kind}.get`, input: ids, path: `${prefix}/${ID}`, data: resource(kind) },
      {
        action: `${kind}.get_source`,
        input: ids,
        path: `${prefix}/${ID}/source`,
        data: resource(kind),
      },
      {
        action: `${kind}.validate`,
        input: { ...ids, expectedSourceRevision: 3 },
        path: `${prefix}/validate`,
        method: 'POST',
        data: validation,
        body: { [`${kind}_id`]: ID, expected_source_revision: 3 },
      },
      {
        action: `${kind}.${child}.submit`,
        input: { ...ids, ...revisions },
        path: `${prefix}/${ID}/${children}`,
        method: 'POST',
        data:
          kind === 'factor'
            ? {
                run_id: RUN,
                factor_id: ID,
                status: 'queued',
                idempotent: false,
                code_sha256: 'hash',
                params: {},
              }
            : run(kind, 'queued'),
        body: {
          request_id: 'run-intent-1',
          expected_source_revision: 3,
          expected_config_revision: 2,
        },
      },
      { action: `${kind}.${child}.get`, input: runIds, path: `${runPath}/${RUN}`, data: run(kind) },
      {
        action: `${kind}.${child}.cancel`,
        input: runIds,
        path: `${runPath}/${RUN}/cancel`,
        method: 'POST',
        data: { ...run(kind, 'running'), cancel_requested: true },
      },
      {
        action: `${kind}.${child}.list`,
        input: ids,
        path: `${prefix}/${ID}/${children}`,
        data: { runs: [run(kind)] },
        query: kind === 'factor' ? {} : { limit: '100' },
      },
      {
        action: `${kind}.${child}.search`,
        input: { status: 'succeeded', from: '2026-01-01', to: '2026-01-01' },
        path: runPath,
        data: { runs: [run(kind)], next_cursor: null },
        query: {
          limit: '10',
          view: 'summary',
          status: 'succeeded',
          from: '2026-01-01',
          to: '2026-01-01',
        },
      },
      {
        action: `${kind}.create`,
        input: {
          requestId: 'create-1',
          title: 'Research',
          code: 'close',
          market: 'us',
          ...(kind === 'factor' ? { codeType: 'formula' } : {}),
        },
        path: prefix,
        method: 'POST',
        data: resource(kind),
        body: {
          request_id: 'create-1',
          title: 'Research',
          code: 'close',
          market: 'us',
          description: '',
          code_type: kind === 'factor' ? 'formula' : 'python',
        },
      },
      {
        action: `${kind}.update`,
        input: { ...ids, baseConfigRevision: 2, title: 'New title' },
        path: `${prefix}/${ID}`,
        method: 'PATCH',
        data: resource(kind),
        body: { base_config_revision: 2, title: 'New title' },
      },
      {
        action: `${kind}.save_source`,
        input: { ...ids, requestId: 'save-1', baseSourceRevision: 3, code: 'close' },
        path: `${prefix}/${ID}/source`,
        method: 'PUT',
        data: resource(kind),
        body: { request_id: 'save-1', base_source_revision: 3, code: 'close' },
      },
      {
        action: `${kind}.delete`,
        input: ids,
        path: `${prefix}/${ID}`,
        method: 'DELETE',
        data: kind === 'factor' ? resource(kind) : { id: ID, deleted: true },
      },
      {
        action: `${kind}.${child}.restore`,
        input: { ...ids, runId: RUN, ...revisions },
        path: `${prefix}/${ID}/${children}/${RUN}/restore`,
        method: 'POST',
        data: { [kind]: resource(kind) },
        body: {
          request_id: 'run-intent-1',
          expected_source_revision: 3,
          expected_config_revision: 2,
        },
      },
      {
        action: `${kind}.version.list`,
        input: ids,
        path: `${prefix}/${ID}/versions`,
        data: { versions: [version(kind)] },
      },
      {
        action: `${kind}.version.search`,
        input: { market: 'us' },
        path: versionPath,
        data: { versions: [version(kind)], next_cursor: null },
        query:
          kind === 'factor'
            ? { limit: '20', market: 'us' }
            : { limit: '10', market: 'us', view: 'summary' },
      },
      {
        action: `${kind}.version.get`,
        input: { versionId: VERSION },
        path: `${versionPath}/${VERSION}`,
        data: version(kind),
      },
      {
        action: `${kind}.version.create`,
        input: { ...ids, requestId: 'version-1', runId: RUN, name: 'saved' },
        path: `${prefix}/${ID}/versions`,
        method: 'POST',
        data: version(kind),
        body: { request_id: 'version-1', run_id: RUN, name: 'saved', description: '' },
      },
      {
        action: `${kind}.version.restore`,
        input: { ...ids, versionId: VERSION, ...revisions },
        path: `${prefix}/${ID}/versions/${VERSION}/restore`,
        method: 'POST',
        data: { [kind]: resource(kind) },
        body: {
          request_id: 'run-intent-1',
          expected_source_revision: 3,
          expected_config_revision: 2,
        },
      },
    ]
    it.each(cases)('maps $action to a fixed gateway contract', async (c) => {
      const s = setup()
      s.fetch.mockImplementation(async () => envelope(c.data))
      const output = await call(s, c.action, c.input, c.action.endsWith('.delete'))
      expect(output).not.toHaveProperty('data')
      expect(JSON.stringify(output)).not.toContain('/private/not-public')
      expect(s.fetch).toHaveBeenCalledTimes(1)
      const [url, init] = s.fetch.mock.calls[0]!
      const parsedUrl = new URL(String(url))
      expect(parsedUrl.pathname).toBe(`/tqxApi/qube/api/${c.path}`)
      expect(Object.fromEntries(parsedUrl.searchParams)).toEqual(c.query ?? {})
      expect(init?.method).toBe(c.method ?? 'GET')
      expect(init?.body === undefined ? undefined : JSON.parse(String(init.body))).toEqual(c.body)
      expect(new Headers(init?.headers).get('Authorization')).toBe(
        'Bearer exchanged-research-token',
      )
      expect(new Headers(init?.headers).has('X-API-Key')).toBe(false)
      expect(init?.redirect).toBe('error')
      expect(init?.credentials).toBe('omit')
      expect(s.exchange.mock.calls[0]![0]).toMatchObject({
        resource: 'https://research.example.test/research',
      })
    })
  }

  it.each([
    ['factor.snapshot.list', { factorId: ID }, { snapshots: [snapshot] }, 'GET'],
    [
      'factor.snapshot.create',
      { factorId: ID, runId: RUN, name: 'Saved analysis' },
      snapshot,
      'POST',
    ],
  ] as const)('maps %s without inventing snapshot GET', async (name, input, data, method) => {
    const s = setup()
    s.fetch.mockImplementation(async () => envelope(data))
    const output = await call(s, name, input)
    expect(s.fetch.mock.calls[0]?.[0].toString()).toBe(
      `https://research.example.test/tqxApi/qube/api/factors/${ID}/analysis-snapshots`,
    )
    expect(s.fetch.mock.calls[0]?.[1]?.method).toBe(method)
    expect(JSON.stringify(output)).not.toContain('internal_path')
  })

  it('maps parameter overrides, bindings, origin and source revisions explicitly', async () => {
    const s = setup()
    s.fetch.mockImplementation(async () => envelope(run('strategy', 'queued')))
    await call(s, 'strategy.backtest.submit', {
      strategyId: ID,
      ...revisions,
      backtest: {
        periodStart: '2026-01-01',
        periodEnd: '2026-06-01',
        frequency: '1d',
        commissionRate: 0.001,
        initBalance: 1000,
      },
      origin: { sessionId: 'session', chatRunId: 'chat' },
    })
    expect(JSON.parse(String(s.fetch.mock.calls[0]?.[1]?.body))).toEqual({
      request_id: 'run-intent-1',
      expected_source_revision: 3,
      expected_config_revision: 2,
      parameters: {
        backtest: {
          period_start: '2026-01-01',
          period_end: '2026-06-01',
          frequency: '1d',
          commission_rate: 0.001,
          init_balance: 1000,
        },
      },
      origin: { session_id: 'session', chat_run_id: 'chat' },
    })
    s.fetch.mockImplementation(async () => envelope(resource('strategy')))
    await call(s, 'strategy.update', {
      strategyId: ID,
      baseConfigRevision: 2,
      factorBinding: { factorId: ID, factorVersionId: VERSION },
    })
    expect(JSON.parse(String(s.fetch.mock.calls[1]?.[1]?.body)).factor_binding).toEqual({
      factor_id: ID,
      factor_version_id: VERSION,
    })
    await call(s, 'strategy.update', { strategyId: ID, baseConfigRevision: 2, factorBinding: null })
    expect(JSON.parse(String(s.fetch.mock.calls[2]?.[1]?.body)).factor_binding).toBeNull()
    s.fetch.mockImplementation(async () =>
      envelope({ run_id: RUN, factor_id: ID, status: 'succeeded', params: {}, idempotent: true }),
    )
    const replay = await call(s, 'factor.analysis.submit', {
      factorId: ID,
      ...revisions,
      parameters: { factorDirection: -1, groupNumber: 5 },
    })
    expect(replay).toMatchObject({ id: RUN, status: 'succeeded', terminal: true, idempotent: true })
    expect(JSON.parse(String(s.fetch.mock.calls[3]?.[1]?.body)).parameters).toEqual({
      factor_direction: -1,
      group_number: 5,
    })
  })

  it('only includes source on explicit source reads', async () => {
    const s = setup()
    expect(await call(s, 'factor.get', { factorId: ID })).not.toHaveProperty('code')
    expect(await call(s, 'factor.get', { factorId: ID, includeSource: true })).toHaveProperty(
      'code',
      'close',
    )
    expect(String(s.fetch.mock.calls[1]?.[0])).toMatch(/\/source$/)
  })

  it('preserves validation failure and failed/cancelling run semantics', async () => {
    const s = setup()
    s.fetch.mockImplementation(async () => envelope(validation))
    expect(
      await call(s, 'factor.validate', { code: 'close', market: 'us', codeType: 'formula' }),
    ).toMatchObject({ valid: false, diagnostics: [{ message: 'Invalid code', line: 1 }] })
    s.fetch.mockImplementation(async () =>
      envelope({
        ...run('factor', 'failed'),
        error: { code: 'ENGINE_ERROR', message: '/private/not-public', stack: 'private-stack' },
      }),
    )
    const failed = await call(s, 'factor.analysis.get', { analysisId: RUN })
    expect(failed).toMatchObject({
      status: 'failed',
      terminal: true,
      error: { code: 'ENGINE_ERROR' },
    })
    expect(JSON.stringify(failed)).not.toContain('/private/')
    s.fetch.mockImplementation(async () =>
      envelope({ ...run('factor', 'running'), cancel_requested: true }),
    )
    expect(await call(s, 'factor.analysis.cancel', { analysisId: RUN })).toMatchObject({
      status: 'running',
      terminal: false,
      cancelRequested: true,
    })
  })

  it('pages factor tables and object entries without changing engine keys', async () => {
    const s = setup()
    s.fetch.mockImplementation(async () => envelope(run()))
    expect(
      await call(s, 'factor.analysis.result.get', { analysisId: RUN, field: 'factor_data' }),
    ).toMatchObject({ rows: [{ rank_ic: 0.01 }], total: 1, hasMore: false })
    expect(
      await call(s, 'factor.analysis.result.get', {
        analysisId: RUN,
        field: 'group_return_summary',
        limit: 1,
      }),
    ).toMatchObject({ rows: [{ key: 'a', value: 1 }], hasMore: true, nextOffset: 1 })
    expect(
      await call(s, 'factor.analysis.result.get', {
        analysisId: RUN,
        field: 'group_return_summary',
        offset: 1,
        limit: 1,
      }),
    ).toMatchObject({ rows: [{ key: 'b', value: 2 }], hasMore: false })
    expect(
      await call(s, 'factor.analysis.result.get', { analysisId: RUN, field: 'ic_charts' }),
    ).toMatchObject({ rows: [], total: 0 })
  })

  it('maps result pagination and chart sampling without treating maxPoints as a trade limit', async () => {
    const s = setup()
    s.fetch.mockImplementation(async (url) =>
      envelope(String(url).includes('/result?') ? resultPage : run('strategy')),
    )
    expect(
      await call(s, 'backtest.result.get', {
        runId: RUN,
        field: 'trades',
        keyword: 'buy',
        symbol: 'AAPL.US',
      }),
    ).toMatchObject({ runId: RUN, rows: resultPage.rows, total: 1, hasMore: false })
    const resultUrl = new URL(String(s.fetch.mock.calls[1]?.[0]))
    expect(Object.fromEntries(resultUrl.searchParams)).toEqual({
      field: 'trades',
      offset: '0',
      limit: '100',
      q: 'buy',
      symbol: 'AAPL.US',
    })
    s.fetch.mockImplementation(async (url) =>
      envelope(String(url).includes('/chart?') ? chart : run('strategy')),
    )
    const output = await call(s, 'backtest.chart.get', { runId: RUN, maxPoints: 2 })
    expect(output).toMatchObject({
      runId: RUN,
      sampled: true,
      sourceCount: 50,
      totalCount: 100,
      complete: false,
      points: [{ ts: '2026-01-02', equity: 1000, breakBefore: true }],
      tradeDays: [{ buyCount: 1, trades: [{ symbol: 'AAPL.US' }] }],
    })
    expect(new URL(String(s.fetch.mock.calls[3]?.[0])).searchParams.get('max_points')).toBe('2')
  })

  it.each(['queued', 'running', 'failed', 'cancelled'])(
    'rejects results for %s runs without fetching a result page',
    async (state) => {
      const s = setup()
      s.fetch.mockImplementation(async () => envelope(run('strategy', state)))
      await expect(
        call(s, 'backtest.result.get', { runId: RUN, field: 'trades' }),
      ).rejects.toMatchObject({ code: 'RUN_NOT_READY', details: { status: state } })
      expect(s.fetch).toHaveBeenCalledTimes(1)
    },
  )

  it('keeps list pagination honest for offset slices and recent backtests', async () => {
    const s = setup()
    s.fetch.mockImplementation(async () => envelope({ runs: [run(), { ...run(), id: VERSION }] }))
    expect(
      await call(s, 'factor.analysis.list', { factorId: ID, offset: 0, limit: 1 }),
    ).toMatchObject({ items: [{ id: RUN }], nextCursor: null, nextOffset: 1, hasMore: true })
    s.fetch.mockImplementation(async () => envelope({ runs: [run('strategy')] }))
    expect(await call(s, 'strategy.backtest.list', { strategyId: ID, limit: 1 })).toMatchObject({
      requestedLimit: 1,
      possiblyTruncated: true,
    })
  })

  it.each([
    ['factor.get', { factorId: '../escape' }],
    ['factor.get', { factorId: ID, url: 'https://bad.test' }],
    ['factor.list', { market: 'stock' }],
    ['factor.list', { limit: 101 }],
    ['factor.analysis.search', { strategyId: ID }],
    ['strategy.version.search', { status: 'succeeded' }],
    ['strategy.version.search', { timeField: 'updated_at' }],
    [
      'strategy.backtest.submit',
      { strategyId: ID, ...revisions, backtest: { periodStart: '2026-02-30' } },
    ],
    [
      'strategy.backtest.submit',
      {
        strategyId: ID,
        ...revisions,
        backtest: { frequency: '1M', periodStart: '2024-01-01', periodEnd: '2026-01-01' },
      },
    ],
    [
      'factor.analysis.submit',
      {
        factorId: ID,
        ...revisions,
        parameters: { periodStart: '2026-01-01', periodEnd: '2026-01-01' },
      },
    ],
    ['factor.validate', { factorId: ID, code: 'close' }],
    ['strategy.update', { strategyId: ID, baseConfigRevision: 2 }],
    ['backtest.result.get', { runId: RUN, field: 'logs', symbol: 'AAPL.US' }],
    ['factor.analysis.search', { from: '2026-11-13T12:00:00', to: '2026-11-14' }],
    ['factor.analysis.search', { status: 'cancelling' }],
    ['factor.version.search', {}],
  ])('rejects invalid %s input before token exchange', async (name, input) => {
    const s = setup()
    await expect(call(s, String(name), input)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(s.exchange).not.toHaveBeenCalled()
    expect(s.fetch).not.toHaveBeenCalled()
  })

  it('requires deletion confirmation before token exchange', async () => {
    const s = setup()
    await expect(call(s, 'factor.delete', { factorId: ID })).rejects.toMatchObject({
      code: 'CONFIRMATION_REQUIRED',
    })
    expect(s.exchange).not.toHaveBeenCalled()
  })

  it('accepts zero-based columns and omits null diagnostic positions', async () => {
    const s = setup()
    s.fetch.mockImplementation(async () =>
      envelope({
        ...validation,
        diagnostics: [
          { message: 'Syntax error', line: null, column: 0 },
          { message: 'Missing handler', line: null, column: null },
        ],
      }),
    )
    expect(
      await call(s, 'strategy.validate', { strategyId: ID, expectedSourceRevision: 3 }),
    ).toMatchObject({
      valid: false,
      diagnostics: [{ message: 'Syntax error', column: 0 }, { message: 'Missing handler' }],
    })
  })

  it('marks capped batches without claiming complete upstream pagination', async () => {
    const s = setup()
    s.fetch.mockImplementation(async () =>
      envelope({ runs: Array.from({ length: 200 }, () => run()) }),
    )
    const page = await call(s, 'factor.analysis.list', { factorId: ID, offset: 199, limit: 1 })
    expect(page).toMatchObject({ hasMore: false, nextCursor: null, possiblyTruncated: true })
    s.fetch.mockImplementation(async () =>
      envelope({ versions: Array.from({ length: 1000 }, () => version('strategy')) }),
    )
    expect(
      await call(s, 'strategy.version.list', { strategyId: ID, offset: 999, limit: 1 }),
    ).toMatchObject({ hasMore: false, possiblyTruncated: true })
    s.fetch.mockImplementation(async () =>
      envelope({ snapshots: Array.from({ length: 200 }, () => snapshot) }),
    )
    expect(
      await call(s, 'factor.snapshot.list', { factorId: ID, offset: 199, limit: 1 }),
    ).toMatchObject({ hasMore: false, possiblyTruncated: true })
  })

  it('supports searching log rows and preserves their contents and pagination', async () => {
    const s = setup()
    s.fetch.mockImplementation(async (url) =>
      envelope(
        String(url).includes('/result?')
          ? {
              ...resultPage,
              field: 'logs',
              rows: ['Strategy initialized', 'Rebalanced'],
              total: 3,
              has_more: true,
              limit: 2,
            }
          : run('strategy'),
      ),
    )
    expect(
      await call(s, 'backtest.result.get', {
        runId: RUN,
        field: 'logs',
        keyword: 'strategy',
        limit: 2,
      }),
    ).toMatchObject({
      rows: ['Strategy initialized', 'Rebalanced'],
      total: 3,
      hasMore: true,
      nextOffset: 2,
    })
  })

  it('rejects malformed result pages and deeply nested engine JSON', async () => {
    const s = setup()
    s.fetch.mockImplementation(async (url) =>
      envelope(String(url).includes('/result?') ? { ...resultPage, offset: 50 } : run('strategy')),
    )
    await expect(
      call(s, 'backtest.result.get', { runId: RUN, field: 'trades' }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    const nested = Array.from({ length: 30 }).reduce<unknown>((child) => ({ child }), 0)
    s.fetch.mockImplementation(async () => envelope({ ...resource(), parameters: { nested } }))
    await expect(call(s, 'factor.get', { factorId: ID })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })

  it.each([
    { ...resource(), source_revision: 0 },
    { ...resource(), id: VERSION },
    { ...resource(), market: 'future' },
    { ...resource(), parameters: null },
  ])('rejects malformed upstream resources', async (data) => {
    const s = setup()
    s.fetch.mockImplementation(async () => envelope(data))
    await expect(call(s, 'factor.get', { factorId: ID })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
})
