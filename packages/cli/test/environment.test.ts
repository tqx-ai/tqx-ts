import { readFileSync } from 'node:fs'
import { resolveTqxEndpoints } from '@tqx-ai/sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runCli } from '../src/command'

describe('SDK public configuration templates (file-based checks)', () => {
  it.each(['local', 'test', 'prod'] as const)(
    'ships an optional credential-free %s template',
    (environment) => {
      const text = readFileSync(
        new URL(`../../sdk/config/.env.${environment}.example`, import.meta.url),
        'utf8',
      )
      const runtime = Object.fromEntries(
        text
          .split(/\r?\n/)
          .filter((line) => line && !line.startsWith('#'))
          .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
      )
      expect(runtime.TQX_ENV).toBe(environment)
      expect(
        Object.keys(runtime).some((key) => /API_KEY|TOKEN|SECRET|ISSUER|RESOURCE/.test(key)),
      ).toBe(false)
      const endpoints = resolveTqxEndpoints({}, runtime)
      expect(endpoints.environment).toBe(environment)
      expect(endpoints.tradingBaseUrl).toBe(
        environment === 'local'
          ? 'http://127.0.0.1:8102'
          : 'https://build-default-trading-api.example.test',
      )
    },
  )
})

class BufferOutput {
  value = ''
  write(chunk: string): void {
    this.value += chunk
  }
}
function memoryStore(initial: string | null = 'synthetic-existing-profile-key') {
  const values = new Map(initial ? [['default', initial]] : [])
  return {
    values,
    get: vi.fn(async (id: string) => values.get(id) ?? null),
    set: vi.fn(async (id: string, value: string) => {
      values.set(id, value)
    }),
    delete: vi.fn(async (id: string) => values.delete(id)),
  }
}
function response(data: unknown): Response {
  return Response.json({
    code: '0',
    message: 'ok',
    data,
    request_id: 'environment-test',
    timestamp: 1,
  })
}
const urls = {
  TQX_LOCAL_TRADING_BASE_URL: 'http://127.0.0.1:8102',
  TQX_TEST_TRADING_BASE_URL: 'https://test-api.example.test',
  TQX_PROD_TRADING_BASE_URL: 'https://prod-api.example.test',
}
afterEach(() => {
  process.exitCode = undefined
})

describe('CLI optional environment selection (fake stores/network only)', () => {
  it.each(['local', 'test', 'prod'] as const)(
    'reports effective %s configuration without credentials or HTTP',
    async (environment) => {
      const store = memoryStore()
      const fetch = vi.fn<typeof globalThis.fetch>()
      const stdout = new BufferOutput()
      const stderr = new BufferOutput()
      await runCli(['config', '--json'], {
        environment: { ...urls, TQX_ENV: environment },
        credentialStore: store,
        fetch,
        stdout,
        stderr,
      })
      expect(JSON.parse(stdout.value)).toEqual({
        environment,
        requested_environment: environment,
        base_url: 'https://build-default-api.example.test',
        trading_base_url:
          urls[`TQX_${environment.toUpperCase()}_TRADING_BASE_URL` as keyof typeof urls],
      })
      expect(store.get).not.toHaveBeenCalled()
      expect(store.set).not.toHaveBeenCalled()
      expect(store.delete).not.toHaveBeenCalled()
      expect(fetch).not.toHaveBeenCalled()
      expect(stderr.value).toBe('')
    },
  )

  it.each(['dev', 'pro', 'staging'])(
    'reports unknown selector %s with legacy defaults instead of refusing startup',
    async (TQX_ENV) => {
      const stdout = new BufferOutput()
      const fetch = vi.fn<typeof globalThis.fetch>()
      await runCli(['config', '--json'], {
        environment: { ...urls, TQX_ENV },
        credentialStore: memoryStore(),
        fetch,
        stdout,
        stderr: new BufferOutput(),
      })
      expect(JSON.parse(stdout.value)).toEqual({
        environment: 'legacy',
        requested_environment: TQX_ENV,
        base_url: 'https://build-default-api.example.test',
        trading_base_url: 'https://build-default-trading-api.example.test',
      })
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it('keeps TQX_API_KEY precedence and default profile authentication under a selected environment', async () => {
    const store = memoryStore()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({ items: [] }))
    const environment = { ...urls, TQX_ENV: 'test' }
    const outputs = { stdout: new BufferOutput(), stderr: new BufferOutput() }
    await runCli(['trading', 'orders', 'list', '--json'], {
      environment: { ...environment, TQX_API_KEY: 'synthetic-existing-process-key' },
      credentialStore: store,
      fetch,
      ...outputs,
    })
    expect(store.get).not.toHaveBeenCalled()
    await runCli(['trading', 'orders', 'list', '--json'], {
      environment,
      credentialStore: store,
      fetch,
      ...outputs,
    })
    expect(store.get).toHaveBeenCalledWith('default')
    expect(fetch.mock.calls.map(([, init]) => new Headers(init?.headers).get('X-API-Key'))).toEqual(
      ['synthetic-existing-process-key', 'synthetic-existing-profile-key'],
    )
    expect(store.set).not.toHaveBeenCalled()
    expect(store.delete).not.toHaveBeenCalled()
    expect([...store.values.keys()]).toEqual(['default'])
  })

  it('keeps explicit login/logout on the original credential record without migration', async () => {
    const store = memoryStore()
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(response({ valid: true }))
    const environment = { ...urls, TQX_ENV: 'prod' }
    const stdout = new BufferOutput()
    const stderr = new BufferOutput()
    await runCli(['login', '--api-key=synthetic-explicit-key', '--json'], {
      environment,
      credentialStore: store,
      fetch,
      stdout,
      stderr,
    })
    expect(store.set).toHaveBeenCalledExactlyOnceWith('default', 'synthetic-explicit-key')
    expect([...store.values.keys()]).toEqual(['default'])
    const logout = new BufferOutput()
    await runCli(['logout', '--json'], {
      environment,
      credentialStore: store,
      fetch,
      stdout: logout,
      stderr,
    })
    expect(store.delete).toHaveBeenCalledExactlyOnceWith('default')
    expect(JSON.parse(logout.value)).toEqual({
      logged_out: true,
      removed: true,
      environment_override: false,
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('preserves unauthenticated status and build defaults when selected profile fields are missing', async () => {
    const store = memoryStore(null)
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ status: 'ok', service: 'fixture', version: '1' }))
    const stdout = new BufferOutput()
    await runCli(['status', '--json'], {
      environment: { TQX_ENV: 'prod' },
      credentialStore: store,
      fetch,
      stdout,
      stderr: new BufferOutput(),
    })
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      'https://build-default-trading-api.example.test/openapi/v1/health',
    )
    expect(JSON.parse(stdout.value).authenticated).toBe(false)
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).has('X-API-Key')).toBe(false)
    expect(store.get).toHaveBeenCalledWith('default')
  })

  it('ignores NODE_ENV and retains original generic URL override priority', async () => {
    const stdout = new BufferOutput()
    await runCli(['config', '--json'], {
      environment: {
        ...urls,
        NODE_ENV: 'production',
        TQX_BASE_URL: 'https://generic.example.test',
      },
      credentialStore: memoryStore(),
      fetch: vi.fn(),
      stdout,
      stderr: new BufferOutput(),
    })
    expect(JSON.parse(stdout.value)).toEqual({
      environment: 'legacy',
      requested_environment: null,
      base_url: 'https://generic.example.test',
      trading_base_url: 'https://generic.example.test',
    })
  })

  it('redacts URL credentials and sensitive query values when displaying config', async () => {
    const stdout = new BufferOutput()
    const store = memoryStore()
    const fetch = vi.fn<typeof globalThis.fetch>()
    await runCli(['config', '--json'], {
      environment: {
        TQX_ENV: 'test',
        TQX_BASE_URL:
          'https://display-user:display-password@api.example.test/pandaApi?api_key=synthetic-url-key&public=yes',
        TQX_API_KEY: 'synthetic-process-key',
      },
      credentialStore: store,
      fetch,
      stdout,
      stderr: new BufferOutput(),
    })
    expect(stdout.value).not.toContain('display-user')
    expect(stdout.value).not.toContain('display-password')
    expect(stdout.value).not.toContain('synthetic-url-key')
    expect(stdout.value).not.toContain('synthetic-process-key')
    expect(stdout.value).toContain('redacted')
    expect(store.get).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
})
