import { afterEach, describe, expect, it } from 'vitest'

import { actions, callAction } from '../src/research/tools/actions'
import {
  envelope,
  ID,
  researchAuth,
  resource,
  RUN,
  setupResearch,
  VERSION,
} from './helpers/research'

const disposals: Array<() => void> = []
afterEach(() => disposals.splice(0).forEach((dispose) => dispose()))
function setup() {
  const runtime = setupResearch()
  disposals.push(runtime.dispose)
  return runtime
}
const revisions = { requestId: 'tuning-1', expectedSourceRevision: 3, expectedConfigRevision: 2 }
const task = (kind: 'factor' | 'strategy', overrides: Record<string, unknown> = {}) => ({
  id: RUN,
  [`${kind}_id`]: ID,
  status: 'running',
  source_revision: 3,
  config_revision: 2,
  candidates: [
    {
      status: 'pending',
      run_id: null,
      trial_id: 'trial-1',
      candidate_index: 0,
      baseline: true,
      error: null,
      progress: null,
      metrics: {},
      factor_parameters: { lookBack: 10 },
      internal_path: '/private',
      code: 'private source',
    },
  ],
  validation: null,
  apply: null,
  ...overrides,
})
function call(runtime: ReturnType<typeof setup>, name: string, input: unknown) {
  return callAction(runtime.gateway, researchAuth(), actions.get(name)!, input)
}

describe('Research tuning contracts', () => {
  for (const kind of ['factor', 'strategy'] as const) {
    const ids = { [`${kind}Id`]: ID }
    const root = `${kind === 'factor' ? 'factors' : 'strategies'}/${ID}/tunings`
    const submit = {
      ...ids,
      ...revisions,
      ...(kind === 'factor'
        ? {
            candidates: [
              { baseline: true },
              { factorParameters: { lookBack: 10 }, parameters: { stockPool: 'all' } },
            ],
            researchPeriod: { periodStart: '2026-01-01', periodEnd: '2026-02-01' },
            warmupTradingDays: 20,
          }
        : {
            candidates: [{ strategyParameters: { lookBack: 10 } }],
            tradingDates: ['2026-01-02', '2026-01-05'],
            validationEnabled: false,
          }),
    }
    const cases = [
      {
        operation: 'submit',
        input: submit,
        path: root,
        method: 'POST',
        scope: 'research:run',
        body: {
          request_id: 'tuning-1',
          expected_source_revision: 3,
          expected_config_revision: 2,
          ...(kind === 'factor'
            ? {
                candidates: [
                  { baseline: true },
                  {
                    baseline: false,
                    factor_parameters: { lookBack: 10 },
                    parameters: { stock_pool: 'all' },
                  },
                ],
                objective: 'rank_ic_mean',
                holdout_enabled: false,
                research_period: { period_start: '2026-01-01', period_end: '2026-02-01' },
                warmup_trading_days: 20,
              }
            : {
                candidates: [{ strategy_parameters: { lookBack: 10 } }],
                objective: 'total_return',
                validation_enabled: false,
                trading_dates: ['2026-01-02', '2026-01-05'],
              }),
        },
      },
      {
        operation: 'get',
        input: { tuningId: RUN },
        path: `${kind}-tunings/${RUN}`,
        method: 'GET',
        scope: 'research:read',
      },
      {
        operation: 'cancel',
        input: { tuningId: RUN },
        path: `${kind}-tunings/${RUN}/cancel`,
        method: 'POST',
        scope: 'research:run',
      },
      {
        operation: 'rerun',
        input: { tuningId: RUN, requestId: 'retry-1' },
        path: `${kind}-tunings/${RUN}/rerun`,
        method: 'POST',
        scope: 'research:run',
        body: { request_id: 'retry-1' },
      },
      {
        operation: 'apply',
        input: {
          tuningId: RUN,
          ...revisions,
          [kind === 'factor' ? 'trialId' : 'candidateId']: kind === 'factor' ? 'trial-1' : VERSION,
        },
        path: `${kind}-tunings/${RUN}/apply`,
        method: 'POST',
        scope: 'research:write',
        body: {
          request_id: 'tuning-1',
          expected_source_revision: 3,
          expected_config_revision: 2,
          [kind === 'factor' ? 'trial_id' : 'candidate_id']:
            kind === 'factor' ? 'trial-1' : VERSION,
        },
      },
    ]
    for (const entry of cases) {
      it(`${kind}.tuning.${entry.operation} maps path, body, scope and projects safe output`, async () => {
        const runtime = setup()
        const response = task(kind, entry.operation === 'rerun' ? { id: VERSION } : {})
        runtime.fetch.mockResolvedValueOnce(
          envelope(
            entry.operation === 'apply' ? { tuning: response, [kind]: resource(kind) } : response,
          ),
        )
        const output = await call(runtime, `${kind}.tuning.${entry.operation}`, entry.input)
        expect(String(runtime.fetch.mock.calls[0]![0])).toBe(
          `https://research.example.test/tqxApi/qube/api/${entry.path}`,
        )
        const init = runtime.fetch.mock.calls[0]![1]!
        expect(init.method).toBe(entry.method)
        expect(new Headers(init.headers).get('Authorization')).toBe(
          'Bearer exchanged-research-token',
        )
        expect(init.body === undefined ? undefined : JSON.parse(String(init.body))).toEqual(
          entry.body,
        )
        expect(runtime.exchange).toHaveBeenCalledWith(
          expect.objectContaining({ scopes: [entry.scope] }),
        )
        const normalized = entry.operation === 'apply' ? output.tuning : output
        expect(normalized).toMatchObject({
          kind: `${kind}_tuning`,
          resourceId: ID,
          terminal: false,
          candidates: [{ index: 0, factorParameters: { lookBack: 10 }, runId: null }],
        })
        expect(JSON.stringify(output)).not.toContain('private')
        if (entry.operation === 'apply') expect(output[kind]).not.toHaveProperty('code')
      })
    }
    it(`${kind} list exposes capped pagination and summary search uses cursor filters`, async () => {
      const runtime = setup()
      runtime.fetch.mockResolvedValueOnce(
        envelope({
          tunings: Array.from({ length: 200 }, () =>
            task(kind, { candidates: undefined, candidate_count: 2 }),
          ),
        }),
      )
      const page = await call(runtime, `${kind}.tuning.list`, { ...ids, offset: 198, limit: 1 })
      expect(page).toMatchObject({
        hasMore: true,
        nextOffset: 199,
        possiblyTruncated: true,
        items: [{ candidateCount: 2 }],
      })
      expect(String(runtime.fetch.mock.calls[0]![0])).toBe(
        `https://research.example.test/tqxApi/qube/api/${root}`,
      )
      runtime.fetch.mockResolvedValueOnce(
        envelope({
          tunings: [task(kind, { status: 'no_valid_candidates' })],
          next_cursor: 'next+/=',
        }),
      )
      const result = await call(runtime, `${kind}.tuning.search`, {
        ...ids,
        market: 'hk',
        status: 'no_valid_candidates',
        keyword: 'a+b',
        cursor: 'opaque+/=',
        limit: 5,
      })
      const url = new URL(String(runtime.fetch.mock.calls[1]![0]))
      expect(url.pathname).toBe(`/tqxApi/qube/api/${kind}-tunings`)
      expect(Object.fromEntries(url.searchParams)).toEqual({
        view: 'summary',
        limit: '5',
        cursor: 'opaque+/=',
        market: 'hk',
        q: 'a+b',
        status: 'no_valid_candidates',
        [`${kind}_id`]: ID,
      })
      expect(result).toMatchObject({
        hasMore: true,
        nextCursor: 'next+/=',
        items: [{ terminal: true }],
      })
    })
    it(`${kind} writes exchange fresh tokens and reject mismatched or malformed responses`, async () => {
      const runtime = setup()
      runtime.fetch
        .mockResolvedValueOnce(envelope(task(kind)))
        .mockResolvedValueOnce(envelope(task(kind)))
      await call(runtime, `${kind}.tuning.cancel`, { tuningId: RUN })
      await call(runtime, `${kind}.tuning.cancel`, { tuningId: RUN })
      expect(runtime.exchange).toHaveBeenCalledTimes(2)
      runtime.fetch.mockResolvedValueOnce(envelope(task(kind, { id: VERSION })))
      await expect(call(runtime, `${kind}.tuning.get`, { tuningId: RUN })).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      })
      runtime.fetch.mockResolvedValueOnce(envelope(task(kind, { status: 'invented' })))
      await expect(call(runtime, `${kind}.tuning.get`, { tuningId: RUN })).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      })
      runtime.fetch.mockResolvedValueOnce(
        envelope({ tuning: task(kind), [kind]: { ...resource(kind), id: VERSION } }),
      )
      await expect(
        call(runtime, `${kind}.tuning.apply`, {
          tuningId: RUN,
          ...revisions,
          [kind === 'factor' ? 'trialId' : 'candidateId']: kind === 'factor' ? 'trial-1' : VERSION,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    })
    it(`${kind} preserves apply and validation selection while sanitizing errors`, async () => {
      const runtime = setup()
      runtime.fetch.mockResolvedValueOnce(
        envelope(
          task(kind, {
            apply: {
              request_id: 'apply-1',
              candidate_id: VERSION,
              source_revision: 4,
              config_revision: 3,
              status: 'applied',
              factor: { code: 'private source' },
              apply_fingerprint: 'private',
            },
            validation: {
              status: 'failed',
              candidate_id: VERSION,
              error: { code: 'RUN_FAILED', message: 'private traceback' },
            },
          }),
        ),
      )
      const result = await call(runtime, `${kind}.tuning.get`, { tuningId: RUN })
      expect(result).toMatchObject({
        apply: { requestId: 'apply-1', candidateId: VERSION, sourceRevision: 4 },
        validation: { candidateId: VERSION, error: { code: 'RUN_FAILED' } },
      })
      expect(JSON.stringify(result)).not.toContain('private')
    })
    const invalid: Record<string, unknown>[] =
      kind === 'factor'
        ? [
            { candidates: [{ baseline: false }] },
            { candidates: [{ baseline: true, parameters: { stockPool: 'all' } }] },
            { holdoutEnabled: true },
            { warmupTradingDays: -1 },
            { researchPeriod: { periodStart: '2026-02-01', periodEnd: '2026-01-01' } },
            { candidates: [{ baseline: true }, { factorParameters: { lookBack: true } }] },
          ]
        : [
            { tradingDates: ['2026-01-05', '2026-01-02'] },
            { tradingDates: ['2026-01-02', '2026-01-02'] },
            { candidates: [{ strategyParameters: { lookBack: Infinity } }] },
            { candidates: [{ strategyParameters: { _hidden: 10 } }] },
            {
              candidates: Array.from({ length: 32 }, (_, index) => ({
                strategyParameters: { lookBack: index },
              })),
            },
          ]
    it.each(invalid)(
      `${kind} rejects invalid submit overrides %j before exchange`,
      async (override) => {
        const runtime = setup()
        await expect(
          call(runtime, `${kind}.tuning.submit`, { ...submit, ...override }),
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
        expect(runtime.fetch).not.toHaveBeenCalled()
        expect(runtime.exchange).not.toHaveBeenCalled()
      },
    )
  }
})
