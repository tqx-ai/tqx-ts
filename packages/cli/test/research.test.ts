import { afterEach, describe, expect, it, vi } from 'vitest'

import { runCli } from '../src/command'
import type { CredentialStore } from '../src/credentials'
import { strategyWarnings } from '../src/research/shared'

class MemoryStore implements CredentialStore {
  value: string | null = null

  async get(): Promise<string | null> {
    return this.value
  }

  async set(_accountId: string, secret: string): Promise<void> {
    this.value = secret
  }

  async delete(): Promise<boolean> {
    const existed = this.value !== null
    this.value = null
    return existed
  }
}

class BufferOutput {
  value = ''

  write(chunk: string): void {
    this.value += chunk
  }
}

function gatewayResponse(data: unknown, init: ResponseInit = {}): Response {
  return Response.json({ code: 0, message: 'success', data, request_id: 'qube-cli' }, init)
}

const STOCK_STRATEGY = `
import panda_data as pd
from panda_backtest.api.api import *

def init_market_data(context):
    context.history = pd.get_market_data(
        start_date='2026-01-01',
        end_date='2026-02-01',
    )

def initialize(context):
    init_market_data(context)

def handle_data(context, data):
    pass
`

const US_STRATEGY = `
from tqx_data import get_us_daily as daily
from panda_backtest.api.api import *
from panda_backtest.api.stock_us_api import *

def init_market_data(context):
    context.history = daily(
        symbol='AAPL.US',
        start_date='2026-01-01',
        end_date='2026-02-01',
        market='nb',
    )

def initialize(context):
    init_market_data(context)

def handle_data(context, data):
    context.us_symbol = 'AAPL.NY'
`

afterEach(() => {
  process.exitCode = undefined
  vi.restoreAllMocks()
  vi.unstubAllEnvs?.()
})

describe('research CLI', () => {
  it('shows only Qube resource branches', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)

    await runCli(['research', '--help'])

    const help = log.mock.calls.flat().join('\n')
    expect(help).toContain('tqx research')
    expect(help).toContain('factor')
    expect(help).toContain('strategy')
    expect(help).toContain('backtest')
    expect(help).not.toContain('workflow')
    expect(help).not.toContain('balance')
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('uses the stored API key and creates Qube factors instead of workflows', async () => {
    const store = new MemoryStore()
    store.value = 'stored-key'
    const stdout = new BufferOutput()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(gatewayResponse({ id: 42, name: 'close', market: 'hk', code: 'close' }))

    await runCli(['research', 'factor', 'create', '--market=HK', '--formula=close', '--json'], {
      environment: { TQX_BASE_URL: 'https://research-api.example.test/pandaApi' },
      credentialStore: store,
      fetch,
      stdout,
    })

    expect(JSON.parse(stdout.value)).toMatchObject({
      success: true,
      factor_id: 42,
      factor: { market: 'hk' },
    })
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      'https://research-api.example.test/pandaApi/agent_quant/api/factors',
    )
    const init = fetch.mock.calls[0]?.[1]
    expect(new Headers(init?.headers).get('X-API-Key')).toBe('stored-key')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      code: 'close',
      code_type: 'formula',
      market: 'hk',
    })
  })

  it('deletes each positional factor ID exactly once', async () => {
    const store = new MemoryStore()
    store.value = 'stored-key'
    const stdout = new BufferOutput()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => gatewayResponse(null))

    await runCli(['research', 'factor', 'delete', '1', '2', '--yes', '--json'], {
      environment: { TQX_BASE_URL: 'https://research-api.example.test/pandaApi' },
      credentialStore: store,
      fetch,
      stdout,
    })

    expect(JSON.parse(stdout.value)).toMatchObject({ success: true, deleted: [1, 2] })
    expect(fetch.mock.calls.map(([input]) => String(input))).toEqual([
      'https://research-api.example.test/pandaApi/agent_quant/api/factors/1',
      'https://research-api.example.test/pandaApi/agent_quant/api/factors/2',
    ])
  })

  it('runs strategies with stored backtest parameters and returns the submitted run ID', async () => {
    const store = new MemoryStore()
    store.value = 'stored-key'
    const stdout = new BufferOutput()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        gatewayResponse({
          id: 8,
          market: 'us',
          params: {
            backtest: {
              init_balance: 1000,
              frequency: '1d',
              symbols: null,
              margin_rate: null,
              standard_symbol: null,
            },
          },
        }),
      )
      .mockResolvedValueOnce(gatewayResponse({ id: 91, status: 'pending' }))

    await runCli(
      [
        'research',
        'strategy',
        'run',
        '8',
        '--startDate=20260101',
        '--symbols=AAPL.US,MSFT.US',
        '--noWait',
        '--json',
      ],
      {
        environment: { TQX_BASE_URL: 'https://research-api.example.test/pandaApi' },
        credentialStore: store,
        fetch,
        stdout,
      },
    )

    expect(JSON.parse(stdout.value)).toMatchObject({
      success: true,
      status: 'SUBMITTED',
      strategy_id: 8,
      run_id: 91,
    })
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
      period_start: '2026-01-01',
      init_balance: 1000,
      frequency: '1d',
      symbols: ['AAPL.US', 'MSFT.US'],
    })
  })

  it('does not replay server-only backtest fields when updating a strategy', async () => {
    const store = new MemoryStore()
    store.value = 'stored-key'
    const stdout = new BufferOutput()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        gatewayResponse({
          id: 8,
          market: 'us',
          params: {
            backtest: {
              period_start: '2026-01-01',
              period_end: '2026-03-31',
              init_balance: 1000,
              commission_rate: 1,
              slippage: 0,
              frequency: '1d',
              symbols: null,
              margin_rate: null,
              standard_symbol: null,
            },
          },
        }),
      )
      .mockResolvedValueOnce(gatewayResponse({ id: 8, market: 'us' }))

    await runCli(
      [
        'research',
        'strategy',
        'update',
        '8',
        '--startDate=20260401',
        '--endDate=20260630',
        '--json',
      ],
      {
        environment: { TQX_BASE_URL: 'https://research-api.example.test/pandaApi' },
        credentialStore: store,
        fetch,
        stdout,
      },
    )

    expect(JSON.parse(stdout.value)).toMatchObject({ success: true, strategy_id: 8 })
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
      market: 'us',
      params: {
        backtest: {
          period_start: '2026-04-01',
          period_end: '2026-06-30',
          init_balance: 1000,
          commission_rate: 1,
          slippage: 0,
          frequency: '1d',
        },
      },
    })
  })

  it('updates strategy metadata without rewriting backtest parameters', async () => {
    const store = new MemoryStore()
    store.value = 'stored-key'
    const stdout = new BufferOutput()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(gatewayResponse({ id: 8, market: 'us' }))
      .mockResolvedValueOnce(gatewayResponse({ id: 8, name: 'renamed', market: 'us' }))

    await runCli(['research', 'strategy', 'update', '8', '--name=renamed', '--json'], {
      environment: { TQX_BASE_URL: 'https://research-api.example.test/pandaApi' },
      credentialStore: store,
      fetch,
      stdout,
    })

    expect(JSON.parse(stdout.value)).toMatchObject({ success: true, strategy_id: 8 })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
      name: 'renamed',
      market: 'us',
    })
  })

  it('loads the current strategy market before validating save', async () => {
    const store = new MemoryStore()
    store.value = 'stored-key'
    const stderr = new BufferOutput()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(gatewayResponse({ id: 8, market: 'us' }))

    await runCli(
      [
        'research',
        'strategy',
        'save',
        '8',
        `--code=${US_STRATEGY.replace("market='nb'", "market='sg'")}`,
        '--json',
      ],
      {
        environment: { TQX_BASE_URL: 'https://research-api.example.test/pandaApi' },
        credentialStore: store,
        fetch,
        stderr,
      },
    )

    expect(JSON.parse(stderr.value).error.issues[0]?.message).toContain('market')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String(fetch.mock.calls[0]?.[0])).toContain('/agent_quant/api/strategies/8')
  })

  it('loads the current strategy market before validating update', async () => {
    const store = new MemoryStore()
    store.value = 'stored-key'
    const stderr = new BufferOutput()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(gatewayResponse({ id: 8, market: 'us' }))

    await runCli(
      [
        'research',
        'strategy',
        'update',
        '8',
        `--code=${US_STRATEGY.replace("market='nb'", "market='sg'")}`,
        '--json',
      ],
      {
        environment: { TQX_BASE_URL: 'https://research-api.example.test/pandaApi' },
        credentialStore: store,
        fetch,
        stderr,
      },
    )

    expect(JSON.parse(stderr.value).error.issues[0]?.message).toContain('market')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String(fetch.mock.calls[0]?.[0])).toContain('/agent_quant/api/strategies/8')
  })

  it('lists strategies across all markets by default', async () => {
    const store = new MemoryStore()
    store.value = 'stored-key'
    const stdout = new BufferOutput()
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(
      gatewayResponse({
        items: [
          { id: 1, name: 'stock strategy', market: 'stock', code: 'stock source' },
          { id: 2, name: 'future strategy', market: 'future', code: 'future source' },
          { id: 3, name: 'hk strategy', market: 'hk', code: 'hk source' },
          { id: 4, name: 'us strategy', market: 'us', code: 'us source' },
        ],
        has_more: true,
        next_offset: 100,
      }),
    )

    await runCli(['research', 'strategy', 'list', '--keyword=demo', '--json'], {
      environment: { TQX_BASE_URL: 'https://research-api.example.test/pandaApi' },
      credentialStore: store,
      fetch,
      stdout,
    })

    const requests = fetch.mock.calls.map(([input]) => {
      const url = new URL(String(input))
      return {
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
      }
    })
    expect(requests).toEqual([
      {
        path: '/pandaApi/agent_quant/api/strategies/page',
        query: { offset: '0', limit: '100', keyword: 'demo' },
      },
    ])
    const output = JSON.parse(stdout.value)
    expect(output).toMatchObject({ success: true, count: 4, has_more: true, next_offset: 100 })
    expect(output.strategies.map((strategy: { id: number }) => strategy.id)).toEqual([1, 2, 3, 4])
    expect(
      output.strategies.every((strategy: { code?: string }) => strategy.code === undefined),
    ).toBe(true)
  })

  it('inherits factor analysis parameters when saving code only', async () => {
    const store = new MemoryStore()
    store.value = 'stored-key'
    const stdout = new BufferOutput()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        gatewayResponse({
          id: 42,
          market: 'stock',
          latest_version: {
            id: 7,
            factor_id: 42,
            version_number: 3,
            code: 'old',
            code_type: 'python',
            market: 'stock',
            params: {
              period_start: '2026-01-01',
              period_end: '2026-03-31',
              adjustment_cycle: 10,
              group_number: 10,
              factor_direction: 0,
              stock_pool: 'large-cap',
              market_type: 'main',
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        gatewayResponse({
          id: 42,
          version: {
            id: 8,
            factor_id: 42,
            version_number: 4,
            code: 'factors["close"]',
            code_type: 'python',
            market: 'stock',
          },
          version_created: true,
        }),
      )

    await runCli(['research', 'factor', 'save', '42', '--code=factors["close"]', '--json'], {
      environment: { TQX_BASE_URL: 'https://research-api.example.test/pandaApi' },
      credentialStore: store,
      fetch,
      stdout,
    })

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toMatchObject({
      market: 'stock',
      analysis_params: {
        period_start: '2026-01-01',
        period_end: '2026-03-31',
        adjustment_cycle: 10,
        group_number: 10,
        factor_direction: 0,
        stock_pool: 'large-cap',
        market_type: 'main',
      },
    })
  })

  it('keeps explicit strategy list market queries focused and preserves code with includeContent', async () => {
    const store = new MemoryStore()
    store.value = 'stored-key'
    const stdout = new BufferOutput()
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      gatewayResponse({
        items: [{ id: 7, name: 'hk strategy', market: 'hk', code: 'hk source' }],
        has_more: false,
        next_offset: null,
      }),
    )

    await runCli(
      [
        'research',
        'strategy',
        'list',
        '--market=HK',
        '--offset=5',
        '--limit=10',
        '--keyword=demo',
        '--includeContent',
        '--json',
      ],
      {
        environment: { TQX_BASE_URL: 'https://research-api.example.test/pandaApi' },
        credentialStore: store,
        fetch,
        stdout,
      },
    )

    expect(fetch).toHaveBeenCalledTimes(1)
    const url = new URL(String(fetch.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/pandaApi/agent_quant/api/strategies/page')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      offset: '5',
      limit: '10',
      market: 'hk',
      keyword: 'demo',
    })
    expect(JSON.parse(stdout.value).strategies).toEqual([
      { id: 7, name: 'hk strategy', market: 'hk', code: 'hk source' },
    ])
  })

  it('creates a strategy after local preflight validation', async () => {
    const store = new MemoryStore()
    store.value = 'stored-key'
    const stdout = new BufferOutput()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        gatewayResponse({ id: 8, name: 'TQX Strategy', market: 'us', code: 'saved' }),
      )

    await runCli(
      ['research', 'strategy', 'create', '--market=US', `--code=${US_STRATEGY}`, '--json'],
      {
        environment: { TQX_BASE_URL: 'https://research-api.example.test/pandaApi' },
        credentialStore: store,
        fetch,
        stdout,
      },
    )

    expect(JSON.parse(stdout.value)).toMatchObject({
      success: true,
      strategy_id: 8,
      warnings: [],
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
      name: 'TQX Strategy',
      code: US_STRATEGY.trim(),
      market: 'us',
      params: {
        backtest: {
          init_balance: 10000000,
          commission_rate: 1,
          slippage: 0,
          frequency: '1d',
        },
      },
    })
  })

  it('rejects invalid strategy source before requesting Qube', async () => {
    const store = new MemoryStore()
    store.value = 'stored-key'
    const stderr = new BufferOutput()
    const fetch = vi.fn<typeof globalThis.fetch>()

    await runCli(
      [
        'research',
        'strategy',
        'create',
        '--market=stock',
        `--code=${STOCK_STRATEGY.replace('    pass', '    data.get("close")')}`,
        '--json',
      ],
      {
        environment: { TQX_BASE_URL: 'https://research-api.example.test/pandaApi' },
        credentialStore: store,
        fetch,
        stderr,
      },
    )

    expect(JSON.parse(stderr.value).error.issues[0]?.message).toContain('data.get')
    expect(fetch).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(2)
  })

  it('returns an empty compatibility warning shell', () => {
    expect(strategyWarnings(STOCK_STRATEGY, 'us', true)).toEqual([])
  })

  it('rejects invalid factor Python before requesting Qube', async () => {
    const store = new MemoryStore()
    store.value = 'stored-key'
    const stderr = new BufferOutput()
    const fetch = vi.fn<typeof globalThis.fetch>()

    await runCli(['research', 'factor', 'create', '--market=US', '--code=result', '--json'], {
      environment: { TQX_BASE_URL: 'https://research-api.example.test/pandaApi' },
      credentialStore: store,
      fetch,
      stderr,
    })

    expect(JSON.parse(stderr.value).error.message).toContain('factors["field"]')
    expect(fetch).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(2)
  })

  it('reports a missing source file as a CLI usage error', async () => {
    const store = new MemoryStore()
    store.value = 'stored-key'
    const stderr = new BufferOutput()
    const fetch = vi.fn<typeof globalThis.fetch>()

    await runCli(
      ['research', 'factor', 'create', '--market=US', '--file=missing-factor.py', '--json'],
      {
        environment: { TQX_BASE_URL: 'https://research-api.example.test/pandaApi' },
        credentialStore: store,
        fetch,
        stderr,
      },
    )

    expect(JSON.parse(stderr.value).error.message).toContain(
      'unable to read source file "missing-factor.py"',
    )
    expect(fetch).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(2)
  })
})
