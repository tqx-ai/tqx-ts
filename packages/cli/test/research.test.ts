/* eslint-disable no-await-in-loop */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { runCli } from '../src/command'
import type { CredentialStore } from '../src/credentials'
import { US_DAILY_MOVING_AVERAGE_FIXTURE } from '../../sdk/test/strategy-fixtures'

const FACTOR_ID = '507f1f77bcf86cd799439011'
const STRATEGY_ID = '507f1f77bcf86cd799439012'
const RUN_ID = '507f1f77bcf86cd799439013'
const SECOND_ID = '507f1f77bcf86cd799439014'
const VERSION_ID = '507f1f77bcf86cd799439015'
const BASE_URL = 'https://research-api.example.test/tqxApi'
const API_URL = `${BASE_URL}/qube/api`
const SHA256 = 'a'.repeat(64)
const temporaryDirectories: string[] = []

class MemoryStore implements CredentialStore {
  value: string | null = 'stored-research-key'

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

function factor(overrides: Record<string, unknown> = {}) {
  return {
    id: FACTOR_ID,
    factor_id: FACTOR_ID,
    title: 'Closing price',
    description: 'Daily closing price factor',
    market: 'hk',
    code_type: 'formula',
    factor_kind: 'code',
    code_sha256: SHA256,
    source_revision: 2,
    config_revision: 3,
    validation: { status: 'valid', source_revision: 2, code_sha256: SHA256, diagnostics: [] },
    parameter_validation: { status: 'valid', config_revision: 3, diagnostics: [] },
    parameters: {
      period_start: '2026-01-01',
      period_end: '2026-06-30',
      adjustment_cycle: 5,
      group_number: 5,
      factor_direction: 1,
    },
    current_version: null,
    deleted_at: null,
    created_at: '2026-07-01T00:00:00+00:00',
    updated_at: '2026-07-02T00:00:00+00:00',
    ...overrides,
  }
}

function strategy(overrides: Record<string, unknown> = {}) {
  return {
    id: STRATEGY_ID,
    strategy_id: STRATEGY_ID,
    title: 'US moving average',
    description: 'Daily moving average strategy',
    market: 'us',
    code_type: 'python',
    code_sha256: SHA256,
    source_revision: 2,
    config_revision: 3,
    validation: { status: 'valid', source_revision: 2, code_sha256: SHA256, diagnostics: [] },
    parameter_validation: { status: 'valid', config_revision: 3, diagnostics: [] },
    parameters: {
      backtest: {
        period_start: '2026-01-01',
        period_end: '2026-06-30',
        frequency: '1d',
        init_balance: 1_000_000,
        commission_rate: 1,
        slippage: 0,
      },
    },
    factor_binding: null,
    current_version: null,
    created_at: '2026-07-01T00:00:00+00:00',
    updated_at: '2026-07-02T00:00:00+00:00',
    ...overrides,
  }
}

function analysis(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    factor_id: FACTOR_ID,
    title: 'Closing price',
    market: 'hk',
    code_type: 'formula',
    status: 'succeeded',
    source_revision: 2,
    config_revision: 3,
    code_sha256: SHA256,
    progress: { stage: 'complete', percent: 100 },
    metrics: { rank_ic_mean: 0.15 },
    cancel_requested: false,
    created_at: '2026-07-03T00:00:00+00:00',
    ...overrides,
  }
}

function backtest(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    run_id: RUN_ID,
    strategy_id: STRATEGY_ID,
    title: 'US moving average',
    market: 'us',
    code_type: 'python',
    status: 'succeeded',
    source_revision: 2,
    config_revision: 3,
    parameters: strategy().parameters,
    factor_binding: null,
    progress: { stage: 'complete', percent: 100 },
    metrics: { total_return: 0.1 },
    cancel_requested: false,
    equity: [{ ts: '2026-06-30', equity: 1_100_000 }],
    trades: [{ symbol: 'AAPL.US', quantity: 100 }],
    logs: ['Backtest complete'],
    created_at: '2026-07-03T00:00:00+00:00',
    ...overrides,
  }
}

function analysisReceipt() {
  return {
    run_id: RUN_ID,
    factor_id: FACTOR_ID,
    status: 'queued',
    idempotent: false,
    code_sha256: SHA256,
    params: factor().parameters,
  }
}

function setup(fetch = vi.fn<typeof globalThis.fetch>(), environment: NodeJS.ProcessEnv = {}) {
  const credentialStore = new MemoryStore()
  const stdout = new BufferOutput()
  const stderr = new BufferOutput()
  const dependencies = {
    environment: { TQX_BASE_URL: BASE_URL, ...environment },
    credentialStore,
    fetch,
    stdout,
    stderr,
    autoUpdateCheck: false,
  }
  return { fetch, stdout, stderr, credentialStore, dependencies }
}

function bodyOf(fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>, index = 0) {
  return JSON.parse(String(fetch.mock.calls[index]?.[1]?.body)) as Record<string, unknown>
}

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'tqx-cli-research-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  process.exitCode = undefined
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

describe('Qube Next research CLI', () => {
  it('shows the resource branches and revision flags in help', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    await runCli(['research', '--help'])
    const researchHelp = log.mock.calls.flat().join('\n')
    expect(researchHelp).toContain('factor')
    expect(researchHelp).toContain('strategy')
    expect(researchHelp).toContain('backtest')
    expect(researchHelp).not.toContain('workflow')
    log.mockClear()
    await runCli(['research', 'factor', 'save', '--help'])
    expect(log.mock.calls.flat().join('\n')).toContain('baseSourceRevision')
    log.mockClear()
    await runCli(['research', 'strategy', 'run', '--help'])
    expect(log.mock.calls.flat().join('\n')).toContain('expectedSourceRevision')
    expect(log.mock.calls.flat().join('\n')).toContain('expectedConfigRevision')
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('uses the environment API key ahead of persisted credentials and preserves the gateway prefix', async () => {
    const ctx = setup(undefined, { TQX_API_KEY: 'environment-research-key' })
    ctx.fetch.mockResolvedValueOnce(
      gatewayResponse({
        strategies: [],
        has_more: false,
        next_cursor: null,
        counts: { all: 0, hk: 0, us: 0 },
      }),
    )
    await runCli(['research', 'strategy', 'list', '--json'], ctx.dependencies)
    expect(String(ctx.fetch.mock.calls[0]?.[0])).toBe(`${API_URL}/strategies?limit=24`)
    const headers = new Headers(ctx.fetch.mock.calls[0]?.[1]?.headers)
    expect(headers.get('X-API-Key')).toBe('environment-research-key')
    expect(headers.get('Accept')).toBe('application/json')
    expect(ctx.stdout.value).not.toContain('environment-research-key')
    expect(ctx.stdout.value).not.toContain('stored-research-key')
    expect(ctx.stderr.value).toBe('')
  })

  it('creates a formula factor using the new title and request_id body', async () => {
    const ctx = setup()
    ctx.fetch.mockResolvedValueOnce(gatewayResponse({ ...factor(), saved: true }, { status: 201 }))
    await runCli(
      [
        'research',
        'factor',
        'create',
        '--market=hk',
        '--formula=close',
        '--title=Closing price',
        '--json',
      ],
      ctx.dependencies,
    )
    expect(JSON.parse(ctx.stdout.value)).toMatchObject({
      success: true,
      factor_id: FACTOR_ID,
      factor: { title: 'Closing price' },
    })
    expect(String(ctx.fetch.mock.calls[0]?.[0])).toBe(`${API_URL}/factors`)
    expect(ctx.fetch.mock.calls[0]?.[1]?.method).toBe('POST')
    expect(new Headers(ctx.fetch.mock.calls[0]?.[1]?.headers).get('X-API-Key')).toBe(
      'stored-research-key',
    )
    expect(bodyOf(ctx.fetch)).toEqual({
      request_id: expect.any(String),
      title: 'Closing price',
      description: '',
      market: 'hk',
      code_type: 'formula',
      code: 'close',
    })
    expect(String(bodyOf(ctx.fetch).request_id)).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)
  })

  it('reads a Python strategy file and maps the backtest configuration on create', async () => {
    const directory = temporaryDirectory()
    const file = join(directory, 'moving_average.py')
    writeFileSync(file, US_DAILY_MOVING_AVERAGE_FIXTURE)
    const ctx = setup()
    ctx.fetch.mockResolvedValueOnce(
      gatewayResponse({ ...strategy(), saved: true }, { status: 201 }),
    )
    await runCli(
      [
        'research',
        'strategy',
        'create',
        '--market=us',
        `--file=${file}`,
        '--title=US moving average',
        '--startDate=20260101',
        '--endDate=20260630',
        '--startCapital=1000000',
        '--commissionRate=1',
        '--slippage=0',
        '--json',
      ],
      ctx.dependencies,
    )
    expect(JSON.parse(ctx.stdout.value)).toMatchObject({ success: true, strategy_id: STRATEGY_ID })
    expect(String(ctx.fetch.mock.calls[0]?.[0])).toBe(`${API_URL}/strategies`)
    expect(bodyOf(ctx.fetch)).toMatchObject({
      request_id: expect.any(String),
      code: US_DAILY_MOVING_AVERAGE_FIXTURE,
      code_type: 'python',
      title: 'US moving average',
      market: 'us',
      parameters: {
        backtest: {
          period_start: '2026-01-01',
          period_end: '2026-06-30',
          init_balance: 1_000_000,
          commission_rate: 1,
          slippage: 0,
        },
      },
    })
    expect(ctx.stderr.value).toBe('')
  })

  it('leaves strategy backtest defaults to the server when no overrides are provided', async () => {
    const directory = temporaryDirectory()
    const file = join(directory, 'strategy.py')
    writeFileSync(file, US_DAILY_MOVING_AVERAGE_FIXTURE)
    const ctx = setup()
    ctx.fetch.mockResolvedValueOnce(
      gatewayResponse({ ...strategy(), saved: true }, { status: 201 }),
    )
    await runCli(
      ['research', 'strategy', 'create', '--market=us', `--file=${file}`, '--json'],
      ctx.dependencies,
    )
    expect(bodyOf(ctx.fetch)).not.toHaveProperty('parameters')
  })

  it.each(['factor', 'strategy'] as const)(
    'saves %s source with base_source_revision',
    async (kind) => {
      const ctx = setup()
      const id = kind === 'factor' ? FACTOR_ID : STRATEGY_ID
      const code = kind === 'factor' ? 'close * 2' : US_DAILY_MOVING_AVERAGE_FIXTURE
      const response =
        kind === 'factor'
          ? factor({ code, source_revision: 3 })
          : strategy({ code, source_revision: 3 })
      ctx.fetch.mockResolvedValueOnce(gatewayResponse({ ...response, saved: true }))
      await runCli(
        ['research', kind, 'save', id, '--baseSourceRevision=2', `--code=${code}`, '--json'],
        ctx.dependencies,
      )
      expect(String(ctx.fetch.mock.calls[0]?.[0])).toBe(
        `${API_URL}/${kind === 'factor' ? 'factors' : 'strategies'}/${id}/source`,
      )
      expect(ctx.fetch.mock.calls[0]?.[1]?.method).toBe('PUT')
      expect(bodyOf(ctx.fetch)).toEqual({
        request_id: expect.any(String),
        base_source_revision: 2,
        code,
      })
      expect(JSON.parse(ctx.stdout.value)).toMatchObject({
        success: true,
        [kind]: { source_revision: 3, code },
      })
    },
  )

  it('updates factor configuration with config revision and the new direction enum', async () => {
    const ctx = setup()
    ctx.fetch.mockResolvedValueOnce(gatewayResponse(factor({ config_revision: 4 })))
    await runCli(
      [
        'research',
        'factor',
        'update',
        FACTOR_ID,
        '--baseConfigRevision=3',
        '--title=Revised factor',
        '--startDate=20260101',
        '--endDate=20260630',
        '--adjustmentCycle=10',
        '--groupNumber=3',
        '--factorDirection=Negative',
        '--json',
      ],
      ctx.dependencies,
    )
    expect(ctx.fetch.mock.calls[0]?.[1]?.method).toBe('PATCH')
    expect(bodyOf(ctx.fetch)).toEqual({
      base_config_revision: 3,
      title: 'Revised factor',
      parameters: {
        period_start: '2026-01-01',
        period_end: '2026-06-30',
        adjustment_cycle: 10,
        group_number: 3,
        factor_direction: -1,
      },
    })
    expect(JSON.parse(ctx.stdout.value).factor.config_revision).toBe(4)
  })

  it('updates strategy metadata without rewriting source or backtest configuration', async () => {
    const ctx = setup()
    ctx.fetch.mockResolvedValueOnce(
      gatewayResponse(strategy({ title: 'Renamed strategy', config_revision: 4 })),
    )
    await runCli(
      [
        'research',
        'strategy',
        'update',
        STRATEGY_ID,
        '--baseConfigRevision=3',
        '--title=Renamed strategy',
        '--json',
      ],
      ctx.dependencies,
    )
    expect(ctx.fetch).toHaveBeenCalledTimes(1)
    expect(bodyOf(ctx.fetch)).toEqual({
      request_id: expect.any(String),
      base_config_revision: 3,
      title: 'Renamed strategy',
    })
    expect(JSON.parse(ctx.stdout.value).strategy.title).toBe('Renamed strategy')
  })

  it('updates strategy backtest overrides through the parameters object', async () => {
    const ctx = setup()
    ctx.fetch.mockResolvedValueOnce(gatewayResponse(strategy({ config_revision: 4 })))
    await runCli(
      [
        'research',
        'strategy',
        'update',
        STRATEGY_ID,
        '--baseConfigRevision=3',
        '--startDate=20260101',
        '--endDate=20260630',
        '--frequency=1M',
        '--commissionRate=0.25',
        '--json',
      ],
      ctx.dependencies,
    )
    expect(bodyOf(ctx.fetch)).toEqual({
      request_id: expect.any(String),
      base_config_revision: 3,
      parameters: {
        backtest: {
          period_start: '2026-01-01',
          period_end: '2026-06-30',
          frequency: '1M',
          commission_rate: 0.25,
        },
      },
    })
  })

  it('submits factor analysis with request identity and source/config revisions', async () => {
    const ctx = setup()
    ctx.fetch.mockResolvedValueOnce(gatewayResponse(analysisReceipt(), { status: 202 }))
    await runCli(
      [
        'research',
        'factor',
        'run',
        FACTOR_ID,
        '--expectedSourceRevision=2',
        '--expectedConfigRevision=3',
        '--startDate=20260101',
        '--endDate=20260630',
        '--factorDirection=-1',
        '--noWait',
        '--json',
      ],
      ctx.dependencies,
    )
    expect(String(ctx.fetch.mock.calls[0]?.[0])).toBe(`${API_URL}/factors/${FACTOR_ID}/analyses`)
    expect(bodyOf(ctx.fetch)).toEqual({
      request_id: expect.any(String),
      expected_source_revision: 2,
      expected_config_revision: 3,
      parameters: {
        period_start: '2026-01-01',
        period_end: '2026-06-30',
        factor_direction: -1,
      },
    })
    expect(JSON.parse(ctx.stdout.value)).toMatchObject({
      success: true,
      status: 'SUBMITTED',
      factor_id: FACTOR_ID,
      analysis_id: RUN_ID,
    })
  })

  it('polls factor analyses until succeeded and keeps JSON stdout parseable', async () => {
    const ctx = setup()
    ctx.fetch
      .mockResolvedValueOnce(gatewayResponse(analysisReceipt(), { status: 202 }))
      .mockResolvedValueOnce(gatewayResponse(analysis()))
    await runCli(
      [
        'research',
        'factor',
        'run',
        FACTOR_ID,
        '--expectedSourceRevision=2',
        '--expectedConfigRevision=3',
        '--startDate=2026-01-01',
        '--endDate=2026-06-30',
        '--json',
      ],
      ctx.dependencies,
    )
    expect(ctx.fetch.mock.calls.map(([url]) => String(url))).toEqual([
      `${API_URL}/factors/${FACTOR_ID}/analyses`,
      `${API_URL}/factor-analyses/${RUN_ID}`,
    ])
    expect(JSON.parse(ctx.stdout.value)).toMatchObject({
      success: true,
      status: 'SUCCESS',
      analysis_id: RUN_ID,
      result: { status: 'succeeded' },
    })
    expect(ctx.stderr.value).toBe('')
  })

  it('submits factor analysis without silently overriding saved parameters', async () => {
    const ctx = setup()
    ctx.fetch.mockResolvedValueOnce(gatewayResponse(analysisReceipt(), { status: 202 }))
    await runCli(
      [
        'research',
        'factor',
        'run',
        FACTOR_ID,
        '--expectedSourceRevision=2',
        '--expectedConfigRevision=3',
        '--noWait',
        '--json',
      ],
      ctx.dependencies,
    )
    expect(bodyOf(ctx.fetch)).toEqual({
      request_id: expect.any(String),
      expected_source_revision: 2,
      expected_config_revision: 3,
    })
  })

  it('submits strategy backtests to the new endpoint without fetching or altering HEAD', async () => {
    const ctx = setup()
    ctx.fetch.mockResolvedValueOnce(
      gatewayResponse(
        backtest({
          status: 'queued',
          progress: { stage: 'queued', percent: 0 },
          idempotent: false,
        }),
        { status: 202 },
      ),
    )
    await runCli(
      [
        'research',
        'strategy',
        'run',
        STRATEGY_ID,
        '--expectedSourceRevision=2',
        '--expectedConfigRevision=3',
        '--startDate=20260101',
        '--endDate=20260630',
        '--noWait',
        '--json',
      ],
      ctx.dependencies,
    )
    expect(ctx.fetch).toHaveBeenCalledTimes(1)
    expect(String(ctx.fetch.mock.calls[0]?.[0])).toBe(
      `${API_URL}/strategies/${STRATEGY_ID}/backtests`,
    )
    expect(bodyOf(ctx.fetch)).toEqual({
      request_id: expect.any(String),
      expected_source_revision: 2,
      expected_config_revision: 3,
      parameters: { backtest: { period_start: '2026-01-01', period_end: '2026-06-30' } },
    })
    expect(JSON.parse(ctx.stdout.value)).toMatchObject({
      success: true,
      status: 'SUBMITTED',
      run_id: RUN_ID,
      strategy_id: STRATEGY_ID,
    })
  })

  it.each(['1d', '1M'])('submits a single-day %s backtest', async (frequency) => {
    const ctx = setup()
    ctx.fetch.mockResolvedValueOnce(gatewayResponse(backtest({ status: 'queued' })))
    await runCli(
      [
        'research',
        'strategy',
        'run',
        STRATEGY_ID,
        '--expectedSourceRevision=2',
        '--expectedConfigRevision=3',
        '--startDate=20260101',
        '--endDate=20260101',
        `--frequency=${frequency}`,
        '--noWait',
        '--json',
      ],
      ctx.dependencies,
    )
    expect(bodyOf(ctx.fetch)).toMatchObject({
      parameters: {
        backtest: {
          period_start: '2026-01-01',
          period_end: '2026-01-01',
          frequency,
        },
      },
    })
    expect(JSON.parse(ctx.stdout.value).success).toBe(true)
    expect(ctx.stderr.value).toBe('')
    expect(process.exitCode).toBeUndefined()
  })

  it.each(['--json', '--plain', ''])(
    'lists strategy backtest history with %s output',
    async (mode) => {
      const ctx = setup()
      ctx.fetch.mockResolvedValueOnce(gatewayResponse({ runs: [backtest()] }))
      await runCli(
        ['research', 'strategy', 'backtests', STRATEGY_ID, '--limit=200', ...(mode ? [mode] : [])],
        ctx.dependencies,
      )
      expect(String(ctx.fetch.mock.calls[0]?.[0])).toBe(
        `${API_URL}/strategies/${STRATEGY_ID}/backtests?limit=200`,
      )
      if (mode === '--json')
        expect(JSON.parse(ctx.stdout.value)).toMatchObject({
          success: true,
          strategy_id: STRATEGY_ID,
          count: 1,
          backtests: [{ id: RUN_ID }],
        })
      else expect(ctx.stdout.value).toContain(RUN_ID)
      expect(ctx.stderr.value).toBe('')
      expect(process.exitCode).toBeUndefined()
    },
  )

  it.each(['0', '201', '1.5'])(
    'rejects invalid strategy history limit %s without a request',
    async (limit) => {
      const ctx = setup()
      await runCli(
        ['research', 'strategy', 'backtests', STRATEGY_ID, `--limit=${limit}`, '--json'],
        ctx.dependencies,
      )
      expect(ctx.fetch).not.toHaveBeenCalled()
      expect(process.exitCode).toBe(2)
      expect(JSON.parse(ctx.stderr.value).error.message).toMatch(/limit|integer/)
    },
  )

  it('submits strategy backtests without a parameters object when no overrides are provided', async () => {
    const ctx = setup()
    ctx.fetch.mockResolvedValueOnce(
      gatewayResponse(backtest({ status: 'queued', progress: { stage: 'queued', percent: 0 } }), {
        status: 202,
      }),
    )
    await runCli(
      [
        'research',
        'strategy',
        'run',
        STRATEGY_ID,
        '--expectedSourceRevision=2',
        '--expectedConfigRevision=3',
        '--noWait',
        '--json',
      ],
      ctx.dependencies,
    )
    expect(bodyOf(ctx.fetch)).not.toHaveProperty('parameters')
  })

  it.each(['succeeded', 'failed', 'cancelled'] as const)(
    'finishes strategy polling for the %s terminal status',
    async (status) => {
      const ctx = setup()
      ctx.fetch
        .mockResolvedValueOnce(gatewayResponse(backtest({ status: 'queued' }), { status: 202 }))
        .mockResolvedValueOnce(gatewayResponse(backtest({ status })))
      await runCli(
        [
          'research',
          'strategy',
          'run',
          STRATEGY_ID,
          '--expectedSourceRevision=2',
          '--expectedConfigRevision=3',
          '--json',
        ],
        ctx.dependencies,
      )
      expect(ctx.fetch).toHaveBeenCalledTimes(2)
      expect(JSON.parse(ctx.stdout.value)).toMatchObject({
        success: status === 'succeeded',
        status: { succeeded: 'SUCCESS', failed: 'FAILED', cancelled: 'CANCELLED' }[status],
        run_id: RUN_ID,
        result: { status },
      })
    },
  )

  it('returns a timeout with a usable stop command', async () => {
    const ctx = setup()
    ctx.fetch
      .mockResolvedValueOnce(gatewayResponse(backtest({ status: 'queued' }), { status: 202 }))
      .mockResolvedValueOnce(gatewayResponse(backtest({ status: 'running' })))
    await runCli(
      [
        'research',
        'strategy',
        'run',
        STRATEGY_ID,
        '--expectedSourceRevision=2',
        '--expectedConfigRevision=3',
        '--timeout=0',
        '--json',
      ],
      ctx.dependencies,
    )
    expect(JSON.parse(ctx.stdout.value)).toMatchObject({
      success: false,
      status: 'TIMEOUT',
      stop_command: `tqx research strategy stop ${RUN_ID}`,
      result: { cli_status: 'TIMEOUT', timeout_seconds: 0 },
    })
  })

  it.each(['factor', 'strategy'] as const)('cancels a %s run using POST', async (kind) => {
    const ctx = setup()
    const result =
      kind === 'factor'
        ? analysis({ status: 'cancelled', cancel_requested: true })
        : backtest({ status: 'cancelled', cancel_requested: true })
    ctx.fetch.mockResolvedValueOnce(gatewayResponse(result))
    await runCli(['research', kind, 'stop', RUN_ID, '--json'], ctx.dependencies)
    expect(String(ctx.fetch.mock.calls[0]?.[0])).toBe(
      `${API_URL}/${kind === 'factor' ? 'factor-analyses' : 'strategy-backtests'}/${RUN_ID}/cancel`,
    )
    expect(ctx.fetch.mock.calls[0]?.[1]?.method).toBe('POST')
    expect(JSON.parse(ctx.stdout.value)).toMatchObject({
      success: true,
      result: { status: 'cancelled', cancel_requested: true },
    })
  })

  it.each(
    (['factor', 'strategy'] as const).flatMap((kind) =>
      [
        { status: 'queued', cancelRequested: true, display: 'CANCELLING', success: true },
        { status: 'preparing', cancelRequested: true, display: 'CANCELLING', success: true },
        { status: 'running', cancelRequested: true, display: 'CANCELLING', success: true },
        { status: 'running', cancelRequested: false, display: 'RUNNING', success: false },
        { status: 'cancelled', cancelRequested: false, display: 'CANCELLED', success: true },
        { status: 'succeeded', cancelRequested: false, display: 'SUCCESS', success: false },
        { status: 'failed', cancelRequested: false, display: 'FAILED', success: false },
        { status: 'succeeded', cancelRequested: true, display: 'SUCCESS', success: false },
        { status: 'failed', cancelRequested: true, display: 'FAILED', success: false },
      ].map((test) => Object.assign({ kind }, test)),
    ),
  )(
    'reports $kind stop for $status with cancel_requested=$cancelRequested as $display ($success)',
    async ({ kind, status, cancelRequested, display, success }) => {
      const ctx = setup()
      const result = (kind === 'factor' ? analysis : backtest)({
        status,
        cancel_requested: cancelRequested,
      })
      ctx.fetch.mockResolvedValueOnce(gatewayResponse(result))
      await runCli(['research', kind, 'stop', RUN_ID, '--json'], ctx.dependencies)
      expect(JSON.parse(ctx.stdout.value)).toMatchObject({
        success,
        status: display,
        [kind === 'factor' ? 'analysis_id' : 'run_id']: RUN_ID,
        result: { status, cancel_requested: cancelRequested },
      })
      expect(ctx.stderr.value).toBe('')
    },
  )

  it('lists a factor analyses history through the factor resource route', async () => {
    const ctx = setup()
    const rows = [analysis()]
    ctx.fetch.mockResolvedValueOnce(gatewayResponse({ runs: rows }))
    await runCli(
      ['research', 'factor', 'analyses', FACTOR_ID, '--status=succeeded', '--json'],
      ctx.dependencies,
    )
    const url = new URL(String(ctx.fetch.mock.calls[0]?.[0]))
    expect(url.pathname).toBe(`/tqxApi/qube/api/factors/${FACTOR_ID}/analyses`)
    expect(Object.fromEntries(url.searchParams)).toEqual({ status: 'succeeded' })
    expect(JSON.parse(ctx.stdout.value)).toEqual({
      success: true,
      factor_id: FACTOR_ID,
      count: 1,
      analyses: rows,
    })
  })

  it('downloads the complete backtest detail while keeping its raw fields', async () => {
    const directory = temporaryDirectory()
    const file = join(directory, 'nested', 'backtest.json')
    const result = backtest()
    const ctx = setup()
    ctx.fetch.mockResolvedValueOnce(gatewayResponse(result))
    await runCli(
      ['research', 'strategy', 'result', RUN_ID, `--download=${file}`, '--json'],
      ctx.dependencies,
    )
    expect(String(ctx.fetch.mock.calls[0]?.[0])).toBe(`${API_URL}/strategy-backtests/${RUN_ID}`)
    expect(JSON.parse(ctx.stdout.value)).toMatchObject({
      success: true,
      run_id: RUN_ID,
      downloaded_file: file,
      result: { logs: ['Backtest complete'], trades: [{ symbol: 'AAPL.US' }] },
    })
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(result)
  })

  it('reports a failed download without discarding a successful API result', async () => {
    const directory = temporaryDirectory()
    const blocker = join(directory, 'file')
    writeFileSync(blocker, 'occupied')
    const ctx = setup()
    ctx.fetch.mockResolvedValueOnce(gatewayResponse(backtest()))
    await runCli(
      [
        'research',
        'strategy',
        'result',
        RUN_ID,
        `--download=${join(blocker, 'result.json')}`,
        '--json',
      ],
      ctx.dependencies,
    )
    expect(JSON.parse(ctx.stdout.value)).toMatchObject({
      success: true,
      download_error: expect.any(String),
      result: { id: RUN_ID },
    })
    expect(ctx.stderr.value).toBe('')
  })

  it('gets frozen factor analysis details', async () => {
    const ctx = setup()
    ctx.fetch.mockResolvedValueOnce(gatewayResponse(analysis({ code: 'close' })))
    await runCli(['research', 'factor', 'result', RUN_ID, '--json'], ctx.dependencies)
    expect(String(ctx.fetch.mock.calls[0]?.[0])).toBe(`${API_URL}/factor-analyses/${RUN_ID}`)
    expect(JSON.parse(ctx.stdout.value)).toMatchObject({
      success: true,
      analysis: { id: RUN_ID, status: 'succeeded', code: 'close' },
    })
  })

  it('gets paginated backtest results with field, offset, limit and symbol filters', async () => {
    const ctx = setup()
    const page = {
      run_id: RUN_ID,
      field: 'trades',
      offset: 10,
      limit: 5,
      total: 16,
      rows: [{ symbol: 'AAPL.US' }],
      has_more: true,
    }
    ctx.fetch.mockResolvedValueOnce(gatewayResponse(page))
    await runCli(
      [
        'research',
        'backtest',
        'result',
        RUN_ID,
        '--field=trades',
        '--offset=10',
        '--limit=5',
        '--keyword=fill',
        '--symbol=AAPL.US',
        '--json',
      ],
      ctx.dependencies,
    )
    const url = new URL(String(ctx.fetch.mock.calls[0]?.[0]))
    expect(url.pathname).toBe(`/tqxApi/qube/api/strategy-backtests/${RUN_ID}/result`)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      field: 'trades',
      offset: '10',
      limit: '5',
      q: 'fill',
      symbol: 'AAPL.US',
    })
    expect(JSON.parse(ctx.stdout.value)).toEqual({ success: true, run_id: RUN_ID, result: page })
  })

  it('validates backtest result offsets and limits before fetching', async () => {
    const ctx = setup()
    await runCli(
      ['research', 'backtest', 'result', RUN_ID, '--field=trades', '--offset=-1', '--json'],
      ctx.dependencies,
    )
    expect(ctx.fetch).not.toHaveBeenCalled()
    expect(JSON.parse(ctx.stderr.value).error.message).toContain('non-negative integer')
    expect(process.exitCode).toBe(2)
  })

  it.each(['factor', 'strategy'] as const)(
    'preserves %s cursor and market counts in list output',
    async (kind) => {
      const ctx = setup()
      const key = kind === 'factor' ? 'factors' : 'strategies'
      const item = kind === 'factor' ? factor() : strategy()
      ctx.fetch.mockResolvedValueOnce(
        gatewayResponse({
          [key]: [item],
          has_more: true,
          next_cursor: 'opaque_next_cursor',
          counts: { all: 12, hk: 5, us: 7 },
        }),
      )
      await runCli(
        [
          'research',
          kind,
          'list',
          '--market=us',
          '--limit=24',
          '--cursor=opaque_previous_cursor',
          '--keyword=quality & value',
          '--json',
        ],
        ctx.dependencies,
      )
      const url = new URL(String(ctx.fetch.mock.calls[0]?.[0]))
      expect(url.pathname).toBe(`/tqxApi/qube/api/${key}`)
      expect(Object.fromEntries(url.searchParams)).toEqual({
        limit: '24',
        market: 'us',
        cursor: 'opaque_previous_cursor',
        q: 'quality & value',
      })
      expect(JSON.parse(ctx.stdout.value)).toMatchObject({
        success: true,
        count: 1,
        [key]: [item],
        has_more: true,
        next_cursor: 'opaque_next_cursor',
        counts: { all: 12, hk: 5, us: 7 },
      })
    },
  )

  it('uses summary pagination for the account-wide backtest list', async () => {
    const ctx = setup()
    const run = {
      id: RUN_ID,
      run_id: RUN_ID,
      strategy_id: STRATEGY_ID,
      title: 'US moving average',
      market: 'us',
      status: 'succeeded',
      purpose: 'backtest',
      source_revision: 2,
      config_revision: 3,
      created_at: '2026-07-03T00:00:00+00:00',
    }
    ctx.fetch.mockResolvedValueOnce(
      gatewayResponse({ runs: [run], has_more: false, next_cursor: null }),
    )
    await runCli(['research', 'backtest', 'list', '--limit=10', '--json'], ctx.dependencies)
    const url = new URL(String(ctx.fetch.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/tqxApi/qube/api/strategy-backtests')
    expect(Object.fromEntries(url.searchParams)).toEqual({ limit: '10', view: 'summary' })
    expect(JSON.parse(ctx.stdout.value)).toEqual({
      success: true,
      count: 1,
      backtests: [run],
      has_more: false,
      next_cursor: null,
    })
  })

  it.each(['factor', 'strategy'] as const)(
    'deletes each positional %s ObjectId only once',
    async (kind) => {
      const ctx = setup()
      const id = kind === 'factor' ? FACTOR_ID : STRATEGY_ID
      ctx.fetch.mockImplementation(async () =>
        gatewayResponse(
          kind === 'factor'
            ? factor({ deleted_at: '2026-07-04T00:00:00+00:00' })
            : { id, deleted: true },
        ),
      )
      await runCli(
        ['research', kind, 'delete', id, SECOND_ID, id, '--yes', '--json'],
        ctx.dependencies,
      )
      expect(ctx.fetch.mock.calls.map(([url]) => String(url))).toEqual([
        `${API_URL}/${kind === 'factor' ? 'factors' : 'strategies'}/${id}`,
        `${API_URL}/${kind === 'factor' ? 'factors' : 'strategies'}/${SECOND_ID}`,
      ])
      expect(ctx.fetch.mock.calls.every(([, init]) => init?.method === 'DELETE')).toBe(true)
      expect(JSON.parse(ctx.stdout.value)).toEqual({ success: true, deleted: [id, SECOND_ID] })
    },
  )

  it('deletes a single positional ID exactly once', async () => {
    const ctx = setup()
    ctx.fetch.mockResolvedValueOnce(
      gatewayResponse(factor({ deleted_at: '2026-07-04T00:00:00+00:00' })),
    )
    await runCli(['research', 'factor', 'delete', FACTOR_ID, '--yes', '--json'], ctx.dependencies)
    expect(ctx.fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(ctx.stdout.value).deleted).toEqual([FACTOR_ID])
  })

  it.each(['factor', 'strategy'] as const)(
    'requires --yes before deleting %s resources',
    async (kind) => {
      const ctx = setup()
      await runCli(
        ['research', kind, 'delete', kind === 'factor' ? FACTOR_ID : STRATEGY_ID, '--json'],
        ctx.dependencies,
      )
      expect(ctx.fetch).not.toHaveBeenCalled()
      expect(JSON.parse(ctx.stderr.value).error.message).toContain('--yes')
      expect(process.exitCode).toBe(2)
    },
  )

  it.each(['factor', 'strategy'] as const)(
    'reads %s named versions using the versions response container',
    async (kind) => {
      const ctx = setup()
      const parent = kind === 'factor' ? FACTOR_ID : STRATEGY_ID
      const version = {
        id: VERSION_ID,
        [`${kind}_id`]: parent,
        version: 1,
        name: 'Baseline',
        description: '',
        run_id: RUN_ID,
        created_at: '2026-07-04T00:00:00+00:00',
      }
      ctx.fetch.mockResolvedValueOnce(gatewayResponse({ versions: [version] }))
      await runCli(['research', kind, 'versions', parent, '--json'], ctx.dependencies)
      expect(String(ctx.fetch.mock.calls[0]?.[0])).toBe(
        `${API_URL}/${kind === 'factor' ? 'factors' : 'strategies'}/${parent}/versions`,
      )
      expect(JSON.parse(ctx.stdout.value)).toMatchObject({ success: true, versions: [version] })
    },
  )

  it.each(['factor', 'strategy'] as const)(
    'gets %s source through its dedicated route',
    async (kind) => {
      const ctx = setup()
      const parent = kind === 'factor' ? FACTOR_ID : STRATEGY_ID
      const response =
        kind === 'factor'
          ? factor({ code: 'close' })
          : strategy({ code: US_DAILY_MOVING_AVERAGE_FIXTURE })
      ctx.fetch.mockResolvedValueOnce(gatewayResponse(response))
      await runCli(['research', kind, 'source', parent, '--json'], ctx.dependencies)
      expect(String(ctx.fetch.mock.calls[0]?.[0])).toBe(
        `${API_URL}/${kind === 'factor' ? 'factors' : 'strategies'}/${parent}/source`,
      )
      expect(JSON.parse(ctx.stdout.value)[kind].code).toBe(
        (response as Record<string, unknown>).code,
      )
    },
  )

  it.each(['factor', 'strategy'] as const)(
    'preserves revision conflicts for %s source updates with exit 1',
    async (kind) => {
      const ctx = setup()
      const conflict = {
        code: 'SOURCE_CONFLICT',
        message: 'Source revision has changed',
        current_source_revision: 3,
      }
      ctx.fetch.mockResolvedValueOnce(
        Response.json(
          { detail: conflict },
          { status: 409, headers: { 'X-Request-ID': 'revision-conflict' } },
        ),
      )
      await runCli(
        [
          'research',
          kind,
          'save',
          kind === 'factor' ? FACTOR_ID : STRATEGY_ID,
          '--baseSourceRevision=2',
          '--code=close',
          '--json',
        ],
        ctx.dependencies,
      )
      expect(ctx.stdout.value).toBe('')
      expect(JSON.parse(ctx.stderr.value).error).toMatchObject({
        message: conflict.message,
        status: 409,
        code: 'SOURCE_CONFLICT',
        request_id: 'revision-conflict',
        data: conflict,
      })
      expect(process.exitCode).toBe(1)
    },
  )

  it('rejects malformed ObjectIds and invalid numeric revisions before fetching', async () => {
    const ctx = setup()
    await runCli(['research', 'factor', 'info', '42', '--json'], ctx.dependencies)
    expect(JSON.parse(ctx.stderr.value).error.message).toContain('24-character lowercase ObjectId')
    expect(process.exitCode).toBe(2)
    expect(ctx.fetch).not.toHaveBeenCalled()
  })

  it('rejects a zero revision before fetching', async () => {
    const ctx = setup()
    await runCli(
      [
        'research',
        'strategy',
        'save',
        STRATEGY_ID,
        '--baseSourceRevision=0',
        '--code=close',
        '--json',
      ],
      ctx.dependencies,
    )
    expect(JSON.parse(ctx.stderr.value).error.message).toContain('positive integer')
    expect(process.exitCode).toBe(2)
    expect(ctx.fetch).not.toHaveBeenCalled()
  })

  it.each(
    (['run', 'update'] as const).flatMap((command) =>
      [
        { flag: 'adjustmentCycle', value: '2', allowed: '1, 3, 5, 10, 20, 30' },
        { flag: 'groupNumber', value: '4', allowed: '3, 5, 10, 20' },
      ].map((test) => Object.assign({ command }, test)),
    ),
  )(
    'rejects factor $command --$flag=$value as CLI input',
    async ({ command, flag, value, allowed }) => {
      const ctx = setup()
      await runCli(
        [
          'research',
          'factor',
          command,
          FACTOR_ID,
          ...(command === 'run'
            ? ['--expectedSourceRevision=2', '--expectedConfigRevision=3', '--noWait']
            : ['--baseConfigRevision=3']),
          `--${flag}=${value}`,
          '--json',
        ],
        ctx.dependencies,
      )
      expect(JSON.parse(ctx.stderr.value).error).toEqual({
        message: `${flag} must be one of ${allowed}`,
      })
      expect(ctx.fetch).not.toHaveBeenCalled()
      expect(process.exitCode).toBe(2)
    },
  )

  it.each(
    (['run', 'update'] as const).flatMap((command) =>
      ['startDate', 'endDate', 'adjustmentCycle', 'groupNumber', 'factorDirection'].map((flag) => ({
        command,
        flag,
      })),
    ),
  )('rejects an explicitly empty factor $command --$flag', async ({ command, flag }) => {
    const ctx = setup()
    await runCli(
      [
        'research',
        'factor',
        command,
        FACTOR_ID,
        ...(command === 'run'
          ? ['--expectedSourceRevision=2', '--expectedConfigRevision=3', '--noWait']
          : ['--baseConfigRevision=3']),
        `--${flag}=`,
        '--json',
      ],
      ctx.dependencies,
    )
    expect(JSON.parse(ctx.stderr.value).error.message).toBeTypeOf('string')
    expect(ctx.fetch).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(2)
  })

  it('rejects invalid calendar dates before submitting', async () => {
    const ctx = setup()
    await runCli(
      [
        'research',
        'strategy',
        'run',
        STRATEGY_ID,
        '--expectedSourceRevision=2',
        '--expectedConfigRevision=3',
        '--startDate=20260230',
        '--noWait',
        '--json',
      ],
      ctx.dependencies,
    )
    expect(JSON.parse(ctx.stderr.value).error.message).toContain('Invalid date')
    expect(ctx.fetch).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(2)
  })

  it('rejects empty configuration updates before fetching', async () => {
    const ctx = setup()
    await runCli(
      ['research', 'factor', 'update', FACTOR_ID, '--baseConfigRevision=3', '--json'],
      ctx.dependencies,
    )
    expect(JSON.parse(ctx.stderr.value).error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'Expected at least one field to update' }),
      ]),
    )
    expect(ctx.fetch).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(2)
  })

  it('rejects ambiguous source selectors and unreadable files before fetching', async () => {
    const ctx = setup()
    await runCli(
      ['research', 'factor', 'create', '--market=hk', '--formula=close', '--code=close', '--json'],
      ctx.dependencies,
    )
    expect(JSON.parse(ctx.stderr.value).error.message).toContain('only one')
    expect(ctx.fetch).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(2)
  })

  it('reports missing source files as usage errors', async () => {
    const ctx = setup()
    const file = join(temporaryDirectory(), 'missing.py')
    await runCli(
      ['research', 'strategy', 'create', '--market=us', `--file=${file}`, '--json'],
      ctx.dependencies,
    )
    expect(JSON.parse(ctx.stderr.value).error.message).toContain('unable to read source file')
    expect(ctx.fetch).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(2)
  })

  it('reports missing authentication before issuing any research request', async () => {
    const ctx = setup()
    ctx.credentialStore.value = null
    await runCli(['research', 'strategy', 'list', '--json'], ctx.dependencies)
    expect(JSON.parse(ctx.stderr.value).error.message).toContain('Not logged in')
    expect(ctx.fetch).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(2)
  })

  it('surfaces malformed responses as protocol errors with exit 1', async () => {
    const ctx = setup()
    ctx.fetch.mockResolvedValueOnce(Response.json({ strategies: [], has_more: false }))
    await runCli(['research', 'strategy', 'list', '--json'], ctx.dependencies)
    expect(JSON.parse(ctx.stderr.value).error.code).toBe('protocol_error')
    expect(process.exitCode).toBe(1)
    expect(ctx.stdout.value).toBe('')
  })

  it.each(['--plain', 'human'] as const)('renders readable output for %s mode', async (mode) => {
    const ctx = setup()
    ctx.fetch.mockResolvedValueOnce(gatewayResponse(strategy()))
    await runCli(
      ['research', 'strategy', 'info', STRATEGY_ID, ...(mode === 'human' ? [] : [mode])],
      ctx.dependencies,
    )
    expect(ctx.stdout.value).toContain('success')
    expect(ctx.stdout.value).toContain('US moving average')
    expect(ctx.stdout.value).toContain(STRATEGY_ID)
    expect(ctx.stderr.value).toBe('')
    if (mode === '--plain') expect(ctx.stdout.value).not.toContain('\u001b[')
  })
})

describe('Qube Next version and tuning CLI', () => {
  it.each(['factor', 'strategy'] as const)(
    'creates and restores a %s named version',
    async (kind) => {
      const ctx = setup()
      const parent = kind === 'factor' ? FACTOR_ID : STRATEGY_ID
      const version = {
        id: VERSION_ID,
        [`${kind}_id`]: parent,
        version: 1,
        name: 'Baseline',
        run_id: RUN_ID,
      }
      ctx.fetch.mockResolvedValueOnce(Response.json(version))
      await runCli(
        [
          'research',
          kind,
          'version-create',
          parent,
          RUN_ID,
          '--name=Baseline',
          '--description=note',
          '--json',
        ],
        ctx.dependencies,
      )
      expect(JSON.parse(ctx.stdout.value)).toEqual({ success: true, version })
      const body = JSON.parse(String(ctx.fetch.mock.calls[0]?.[1]?.body))
      expect(body).toMatchObject({
        run_id: RUN_ID,
        name: 'Baseline',
        description: 'note',
        request_id: expect.any(String),
      })
      expect(String(ctx.fetch.mock.calls[0]?.[0])).toBe(
        `${API_URL}/${kind === 'factor' ? 'factors' : 'strategies'}/${parent}/versions`,
      )
      ctx.stdout.value = ''
      ctx.fetch.mockResolvedValueOnce(
        Response.json({ [kind]: kind === 'factor' ? factor() : strategy() }),
      )
      await runCli(
        [
          'research',
          kind,
          'version-restore',
          parent,
          VERSION_ID,
          '--expectedSourceRevision=2',
          '--expectedConfigRevision=3',
          '--json',
        ],
        ctx.dependencies,
      )
      expect(JSON.parse(ctx.stdout.value)).toMatchObject({ success: true, [kind]: { id: parent } })
      expect(JSON.parse(String(ctx.fetch.mock.calls[1]?.[1]?.body))).toEqual({
        request_id: expect.any(String),
        expected_source_revision: 2,
        expected_config_revision: 3,
      })
    },
  )

  it.each(['factor', 'strategy'] as const)(
    'reads a %s version and restores an execution snapshot',
    async (kind) => {
      const ctx = setup()
      const parent = kind === 'factor' ? FACTOR_ID : STRATEGY_ID
      const version = {
        id: VERSION_ID,
        [`${kind}_id`]: parent,
        version: 1,
        name: 'Baseline',
        run_id: RUN_ID,
      }
      ctx.fetch.mockResolvedValueOnce(Response.json(version))
      await runCli(['research', kind, 'version', VERSION_ID, '--json'], ctx.dependencies)
      expect(JSON.parse(ctx.stdout.value)).toEqual({ success: true, version })
      expect(String(ctx.fetch.mock.calls[0]?.[0])).toBe(`${API_URL}/${kind}-versions/${VERSION_ID}`)
      ctx.stdout.value = ''
      ctx.fetch.mockResolvedValueOnce(
        Response.json({ [kind]: kind === 'factor' ? factor() : strategy() }),
      )
      const command = kind === 'factor' ? 'analysis-restore' : 'backtest-restore'
      await runCli(
        [
          'research',
          kind,
          command,
          parent,
          RUN_ID,
          '--expectedSourceRevision=2',
          '--expectedConfigRevision=3',
          '--json',
        ],
        ctx.dependencies,
      )
      expect(JSON.parse(ctx.stdout.value)).toMatchObject({ success: true, [kind]: { id: parent } })
    },
  )

  it.each(['factor', 'strategy'] as const)(
    'manages %s tuning tasks and applies a selected candidate',
    async (kind) => {
      const ctx = setup()
      const parent = kind === 'factor' ? FACTOR_ID : STRATEGY_ID
      const task = { id: SECOND_ID, [`${kind}_id`]: parent, status: 'succeeded' }
      ctx.fetch.mockResolvedValueOnce(Response.json({ tunings: [task] }))
      await runCli(['research', kind, 'tuning', 'list', parent, '--json'], ctx.dependencies)
      expect(JSON.parse(ctx.stdout.value)).toEqual({ success: true, tunings: [task] })
      for (const command of ['get', 'cancel', 'rerun']) {
        ctx.stdout.value = ''
        ctx.fetch.mockResolvedValueOnce(Response.json(task))
        await runCli(['research', kind, 'tuning', command, SECOND_ID, '--json'], ctx.dependencies)
        expect(JSON.parse(ctx.stdout.value)).toEqual({ success: true, tuning: task })
      }
      expect(JSON.parse(String(ctx.fetch.mock.calls[3]?.[1]?.body))).toEqual({
        request_id: expect.any(String),
      })
      ctx.stdout.value = ''
      ctx.fetch.mockResolvedValueOnce(
        Response.json({ tuning: task, [kind]: kind === 'factor' ? factor() : strategy() }),
      )
      await runCli(
        [
          'research',
          kind,
          'tuning',
          'apply',
          SECOND_ID,
          ...(kind === 'factor' ? ['--trialId=trial-1'] : [RUN_ID]),
          '--expectedSourceRevision=2',
          '--expectedConfigRevision=3',
          '--json',
        ],
        ctx.dependencies,
      )
      expect(JSON.parse(ctx.stdout.value)).toMatchObject({
        success: true,
        tuning: task,
        [kind]: { id: parent },
      })
      expect(JSON.parse(String(ctx.fetch.mock.calls[4]?.[1]?.body))).toEqual({
        request_id: expect.any(String),
        [kind === 'factor' ? 'trial_id' : 'candidate_id']: kind === 'factor' ? 'trial-1' : RUN_ID,
        expected_source_revision: 2,
        expected_config_revision: 3,
      })
    },
  )

  it.each(['factor', 'strategy'] as const)(
    'submits a %s tuning JSON file through SDK validation',
    async (kind) => {
      const ctx = setup()
      const directory = mkdtempSync(join(tmpdir(), 'tqx-tuning-'))
      temporaryDirectories.push(directory)
      const file = join(directory, 'tuning.json')
      const body = {
        requestId: 'tuning-create',
        expectedSourceRevision: 2,
        expectedConfigRevision: 3,
        ...(kind === 'factor'
          ? {
              candidates: [{ baseline: true }],
              researchPeriod: { periodStart: '2026-01-01', periodEnd: '2026-06-30' },
              warmupTradingDays: 20,
            }
          : {
              candidates: [{ strategyParameters: { window: 10 } }],
              tradingDates: ['2026-01-02', '2026-01-05'],
            }),
      }
      writeFileSync(file, JSON.stringify(body))
      const parent = kind === 'factor' ? FACTOR_ID : STRATEGY_ID
      ctx.fetch.mockResolvedValueOnce(
        Response.json({ id: SECOND_ID, [`${kind}_id`]: parent, status: 'queued' }),
      )
      await runCli(
        ['research', kind, 'tuning', 'create', parent, `--file=${file}`, '--json'],
        ctx.dependencies,
      )
      expect(JSON.parse(ctx.stdout.value)).toMatchObject({
        success: true,
        tuning: { id: SECOND_ID },
      })
      expect(JSON.parse(String(ctx.fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
        request_id: 'tuning-create',
        expected_source_revision: 2,
        expected_config_revision: 3,
      })
    },
  )

  it('rejects malformed tuning JSON before issuing a request', async () => {
    const ctx = setup()
    const directory = mkdtempSync(join(tmpdir(), 'tqx-tuning-'))
    temporaryDirectories.push(directory)
    const file = join(directory, 'invalid.json')
    writeFileSync(file, '[]')
    await runCli(
      ['research', 'factor', 'tuning', 'create', FACTOR_ID, `--file=${file}`, '--json'],
      ctx.dependencies,
    )
    expect(process.exitCode).toBe(2)
    expect(ctx.fetch).not.toHaveBeenCalled()
    expect(JSON.parse(ctx.stderr.value).error.message).toContain('expected a JSON object')
  })

  it.each(['factor', 'strategy'] as const)(
    'fetches %s source only when includeContent is requested',
    async (kind) => {
      const ctx = setup()
      const asset = kind === 'factor' ? factor() : strategy()
      const collection = kind === 'factor' ? 'factors' : 'strategies'
      ctx.fetch
        .mockResolvedValueOnce(
          Response.json({ [collection]: [asset], has_more: false, next_cursor: null }),
        )
        .mockResolvedValueOnce(Response.json({ ...asset, code: 'source content' }))
      await runCli(['research', kind, 'list', '--includeContent', '--json'], ctx.dependencies)
      expect(ctx.fetch).toHaveBeenCalledTimes(2)
      expect(String(ctx.fetch.mock.calls[1]?.[0])).toBe(
        `${API_URL}/${collection}/${asset.id}/source`,
      )
      expect(JSON.parse(ctx.stdout.value)[collection][0].code).toBe('source content')
    },
  )
})
