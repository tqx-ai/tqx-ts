import type { AuthInfo } from '@modelcontextprotocol/server'
import { vi } from 'vitest'

import { createResearchRuntime, type ResearchRuntimeOptions } from '../../src/research/runtime'
import type { ResearchConfig } from '../../src/research/config'

export const ID = '0123456789abcdef01234567'
export const RUN = '89abcdef0123456789abcdef'
export const VERSION = 'fedcba987654321001234567'
export const researchConfig: ResearchConfig = {
  baseUrl: 'https://research.example.test/tqxApi/',
  resource: 'https://research.example.test/research',
  tokenEndpoint: 'https://auth.example.test/oauth/token',
  clientId: 'mcp-research',
  clientSecret: 'test-secret',
}
export function researchAuth(
  scopes = ['research:read', 'research:run', 'research:write'],
): AuthInfo {
  return {
    token: 'incoming-research-mcp-token',
    clientId: 'research-client',
    scopes,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    extra: { sub: 'research-user' },
  }
}
export function resource(kind: 'factor' | 'strategy' = 'factor') {
  return {
    id: ID,
    title: 'Research example',
    market: 'us',
    code_type: kind === 'factor' ? 'formula' : 'python',
    source_revision: 3,
    config_revision: 2,
    parameters: {},
    code: kind === 'factor' ? 'close' : 'pass',
    internal_path: '/private/not-public',
    ...(kind === 'strategy' ? { factor_binding: null } : {}),
  }
}
export function run(kind: 'factor' | 'strategy' = 'factor', status = 'succeeded') {
  return {
    id: RUN,
    [`${kind}_id`]: ID,
    status,
    progress: { percent: 100 },
    metrics: { sharpe_ratio: 1.2 },
    source_revision: 3,
    config_revision: 2,
    code: 'private-source',
    storage_path: '/private/not-public',
    factor_data: [{ rank_ic: 0.01 }],
    last_date_top_factor: [],
    group_return_summary: { b: 2, a: 1 },
    return_chart: {},
    ic_charts: null,
  }
}
export function version(kind: 'factor' | 'strategy' = 'factor') {
  return {
    id: VERSION,
    [`${kind}_id`]: ID,
    version: 1,
    name: 'Research example',
    run_id: RUN,
    code: 'close',
  }
}
export const validation = {
  valid: false,
  diagnostics: [{ message: 'Invalid code', line: 1, internal_path: '/private/not-public' }],
  code_sha256: 'hash',
  source_revision: 3,
}
export const resultPage = {
  run_id: RUN,
  field: 'trades',
  rows: [{ symbol: 'AAPL.US', filled_quantity: 2 }],
  total: 1,
  offset: 0,
  limit: 100,
  has_more: false,
}
export const chart = {
  run_id: RUN,
  range: { from: null, to: null },
  extent: { from: null, to: null },
  points: [{ ts: '2026-01-02', equity: 1000, break_before: true }],
  source_count: 50,
  total_count: 100,
  sampled: true,
  trade_days: [
    {
      day: '2026-01-02',
      ts: '2026-01-02',
      equity: 1000,
      buy_count: 1,
      sell_count: 0,
      total: 1,
      counts: { BUY: 1 },
      trades: [{ symbol: 'AAPL.US' }],
    },
  ],
  date_anchors: [{ day: '2026-01-02', from: '2026-01-02', to: '2026-01-02' }],
  complete: false,
}
export function envelope(data: unknown, status = 200, code: number | string = 0) {
  return Response.json(
    { code, data, message: 'private-upstream-message', request_id: 'research-request-1' },
    { status },
  )
}
export function setupResearch(options: ResearchRuntimeOptions = {}) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => envelope(resource()))
  const exchange = vi.fn(async ({ scopes }: { scopes: readonly string[] }) => ({
    token: 'exchanged-research-token',
    scopes,
    expiresAt: Date.now() + 300_000,
  }))
  const runtime = createResearchRuntime('https://auth.example.test', researchConfig, {
    fetch,
    exchange,
    ...options,
  })
  return { ...runtime, fetch, exchange }
}
