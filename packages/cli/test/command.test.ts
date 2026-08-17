import { afterEach, describe, expect, it, vi } from 'vitest'

import { extractGlobalOptions, runCli } from '../src/command'
import type { CredentialStore } from '../src/credentials'

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

class TtyBufferOutput extends BufferOutput {
  readonly isTTY = true
}

function apiResponse(data: unknown): Response {
  return Response.json({
    code: '0',
    message: 'success',
    data,
    request_id: 'request-cli',
    timestamp: 1,
  })
}

afterEach(() => {
  process.exitCode = undefined
  vi.restoreAllMocks()
  vi.unstubAllEnvs?.()
})

describe('CLI', () => {
  const apiKeyUrl = 'https://build-api-key.example.test'

  it('extracts output flags from any command position and maps uppercase aliases', () => {
    expect(extractGlobalOptions(['trading', '--json', 'positions', '-H'])).toEqual({
      arguments: ['trading', 'positions', '--help'],
      mode: 'json',
    })
    expect(() => extractGlobalOptions(['--plain', '--json'])).toThrow(
      '--json and --plain cannot be used together',
    )
  })

  it('stores an API key only after successful verification', async () => {
    const store = new MemoryStore()
    const stdout = new BufferOutput()
    const stderr = new BufferOutput()
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(apiResponse({ valid: true }))

    await runCli(['login', '--api-key=sk-secret-value', '--json'], {
      environment: { TQX_BASE_URL: 'https://api.example.test' },
      credentialStore: store,
      fetch,
      stdout,
      stderr,
    })

    expect(store.value).toBe('sk-secret-value')
    expect(stdout.value).toContain('"logged_in": true')
    expect(stdout.value).not.toContain('sk-secret-value')
    expect(stderr.value).toBe('')
  })

  it('prints the GATC welcome message after a successful login', async () => {
    const stdout = new BufferOutput()
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(apiResponse({ valid: true }))

    await runCli(['login', '--api-key=sk-secret-value', '--plain'], {
      environment: { TQX_BASE_URL: 'https://api.example.test' },
      credentialStore: new MemoryStore(),
      fetch,
      stdout,
    })

    expect(stdout.value).toContain(
      '🔥🔥 Welcome to GATC 2026 | Global Intelligent Agent Trading Challenge\n',
    )
  })

  it('shows where to get an API key in login help', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)

    await runCli(['login', '--help'])

    expect(log.mock.calls.flat().join('\n')).toContain(`Get one at ${apiKeyUrl}`)
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('shows where to get an API key when --api-key is missing', async () => {
    const stderr = new BufferOutput()
    const fetch = vi.fn<typeof globalThis.fetch>()

    await runCli(['login', '--json'], {
      environment: { TQX_BASE_URL: 'https://api.example.test' },
      credentialStore: new MemoryStore(),
      fetch,
      stderr,
    })

    expect(JSON.parse(stderr.value).error.message).toBe(
      `--api-key is required. Get one at ${apiKeyUrl}`,
    )
    expect(fetch).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(2)
  })

  it('does not store an API key when verification fails', async () => {
    const store = new MemoryStore()
    const stdout = new BufferOutput()
    const stderr = new BufferOutput()
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json(
        {
          code: 'invalid_api_key',
          message: 'invalid API key',
          data: null,
          request_id: 'request-failed-login',
          timestamp: 1,
        },
        { status: 401 },
      ),
    )

    await runCli(['login', '--api-key=bad-key', '--json'], {
      environment: { TQX_BASE_URL: 'https://api.example.test' },
      credentialStore: store,
      fetch,
      stdout,
      stderr,
    })

    expect(store.value).toBeNull()
    expect(JSON.parse(stderr.value).error).toMatchObject({
      code: 'invalid_api_key',
      status: 401,
      request_id: 'request-failed-login',
    })
    expect(process.exitCode).toBe(1)
  })

  it('uses TQX_API_KEY before the persistent store for trading commands', async () => {
    const store = new MemoryStore()
    store.value = 'stored-key'
    const stdout = new BufferOutput()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(apiResponse({ items: [], next_cursor: null }))

    await runCli(['trading', 'positions', '--plain'], {
      environment: {
        TQX_BASE_URL: 'https://api.example.test',
        TQX_API_KEY: 'environment-key',
      },
      credentialStore: store,
      fetch,
      stdout,
    })

    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('X-API-Key')).toBe('environment-key')
    expect(stdout.value).toContain('items')
  })

  it('reports the field and rule when SDK input validation fails', async () => {
    const store = new MemoryStore()
    store.value = 'stored-key'
    const stderr = new BufferOutput()
    const fetch = vi.fn<typeof globalThis.fetch>()

    await runCli(
      [
        'trading',
        'orders',
        'place',
        '--symbol=00700.HK',
        '--side=BUY',
        '--orderType=MARKET',
        '--quantity=100',
        '--idempotencyKey=aaa',
        '--yes',
        '--plain',
      ],
      {
        environment: { TQX_BASE_URL: 'https://api.example.test' },
        credentialStore: store,
        fetch,
        stderr,
      },
    )

    expect(stderr.value).toMatch(/^Error: Invalid input\n  idempotencyKey: /)
    expect(stderr.value).toMatch(/(?:at least 8|Expected >=8)/)
    expect(fetch).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(2)
  })

  it('reports SDK input validation issues as structured JSON', async () => {
    const store = new MemoryStore()
    store.value = 'stored-key'
    const stderr = new BufferOutput()

    await runCli(
      [
        'trading',
        'orders',
        'place',
        '--symbol=00700.HK',
        '--side=BUY',
        '--orderType=MARKET',
        '--quantity=100',
        '--idempotencyKey=aaa',
        '--yes',
        '--json',
      ],
      {
        environment: { TQX_BASE_URL: 'https://api.example.test' },
        credentialStore: store,
        fetch: vi.fn<typeof globalThis.fetch>(),
        stderr,
      },
    )

    expect(JSON.parse(stderr.value).error).toMatchObject({
      message: 'Invalid input',
      code: 'validation_error',
      issues: [
        {
          path: 'idempotencyKey',
          message: expect.stringMatching(/(?:at least 8|Expected >=8)/),
        },
      ],
    })
  })

  it('places a market order with an automatic idempotency key', async () => {
    const store = new MemoryStore()
    store.value = 'stored-key'
    const stdout = new BufferOutput()
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      apiResponse({
        signal_id: 'signal-001',
        state: 'ACCEPTED',
        order_id: 'order-001',
        order_status: 'SUBMITTED',
        message: null,
        created_at: '2026-07-30T00:00:00Z',
        updated_at: '2026-07-30T00:00:00Z',
        error_code: null,
        broker_error_id: null,
      }),
    )

    await runCli(
      [
        'trading',
        'orders',
        'place',
        '--symbol=AAPL.US',
        '--side=BUY',
        '--quantity=1',
        '--yes',
        '--json',
      ],
      {
        environment: { TQX_BASE_URL: 'https://api.example.test' },
        credentialStore: store,
        fetch,
        stdout,
      },
    )

    const request = fetch.mock.calls[0]?.[1]
    expect(JSON.parse(String(request?.body))).toEqual({
      symbol: 'AAPL.US',
      side: 'BUY',
      order_type: 'MARKET',
      quantity: '1',
    })
    expect(new Headers(request?.headers).get('Idempotency-Key')).toMatch(
      /^cli-order-[0-9a-f-]{36}$/,
    )
    expect(JSON.parse(stdout.value)).toMatchObject({ signal_id: 'signal-001' })
  })

  it('uses an explicit idempotency key', async () => {
    const store = new MemoryStore()
    store.value = 'stored-key'
    const stdout = new BufferOutput()
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      apiResponse({
        signal_id: 'signal-001',
        state: 'ACCEPTED',
        order_id: 'order-001',
        order_status: 'SUBMITTED',
        message: null,
        created_at: '2026-07-30T00:00:00Z',
        updated_at: '2026-07-30T00:00:00Z',
        error_code: null,
        broker_error_id: null,
      }),
    )

    await runCli(
      [
        'trading',
        'orders',
        'place',
        '--symbol=AAPL.US',
        '--side=BUY',
        '--quantity=1',
        '--idempotencyKey=retry-key-001',
        '--yes',
        '--json',
      ],
      {
        environment: { TQX_BASE_URL: 'https://api.example.test' },
        credentialStore: store,
        fetch,
        stdout,
      },
    )

    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Idempotency-Key')).toBe(
      'retry-key-001',
    )
  })

  it('requires confirmation before placing an order', async () => {
    const store = new MemoryStore()
    store.value = 'stored-key'
    const stderr = new BufferOutput()
    const fetch = vi.fn<typeof globalThis.fetch>()

    await runCli(
      ['trading', 'orders', 'place', '--symbol=AAPL.US', '--side=BUY', '--quantity=1', '--json'],
      {
        environment: { TQX_BASE_URL: 'https://api.example.test' },
        credentialStore: store,
        fetch,
        stderr,
      },
    )

    expect(JSON.parse(stderr.value).error.message).toBe('order submission requires --yes')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('shows loading while fetch is pending and clears it after a response', async () => {
    const stdout = new BufferOutput()
    const stderr = new TtyBufferOutput()
    let resolveFetch!: (response: Response) => void
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        }),
    )

    const run = runCli(['status', '--plain'], {
      environment: { TQX_BASE_URL: 'https://api.example.test' },
      credentialStore: new MemoryStore(),
      fetch,
      stdout,
      stderr,
    })

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    expect(stderr.value).toContain('Loading...')

    resolveFetch(apiResponse({ status: 'ok', service: 'tqx', version: '1.0.0' }))
    await run
    expect(stderr.value.endsWith('\r\u001b[2K')).toBe(true)
  })

  it('clears loading before reporting a fetch failure', async () => {
    const stdout = new BufferOutput()
    const stderr = new TtyBufferOutput()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new Error('network unavailable'))

    await runCli(['status', '--plain'], {
      environment: { TQX_BASE_URL: 'https://api.example.test' },
      credentialStore: new MemoryStore(),
      fetch,
      stdout,
      stderr,
    })

    expect(stderr.value).toContain('Loading...')
    expect(stderr.value.indexOf('\r\u001b[2K')).toBeLessThan(stderr.value.indexOf('Error'))
    expect(stderr.value).toContain('Error: Unable to reach the TQX API\n')
    expect(process.exitCode).toBe(1)
  })

  it('checks API status without verification when no API key exists', async () => {
    const stdout = new BufferOutput()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(apiResponse({ status: 'ok', service: 'tqx', version: '1.0.0' }))

    await runCli(['status', '--json'], {
      environment: { TQX_BASE_URL: 'https://api.example.test' },
      credentialStore: new MemoryStore(),
      fetch,
      stdout,
    })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String(fetch.mock.calls[0]?.[0])).toBe('https://api.example.test/openapi/v1/health')
    expect(JSON.parse(stdout.value)).toEqual({
      status: 'ok',
      service: 'tqx',
      backend_version: '1.0.0',
      authenticated: false,
    })
  })

  it('uses the build-time trading default when TQX_BASE_URL is not set', async () => {
    const stdout = new BufferOutput()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(apiResponse({ status: 'ok', service: 'tqx', version: '1.0.0' }))

    await runCli(['status', '--json'], {
      credentialStore: new MemoryStore(),
      fetch,
      stdout,
    })

    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      'https://build-default-trading-api.example.test/openapi/v1/health',
    )
  })

  it('prefers the runtime base URL over the build-time default', async () => {
    const stdout = new BufferOutput()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(apiResponse({ status: 'ok', service: 'tqx', version: '1.0.0' }))

    await runCli(['status', '--json'], {
      environment: { TQX_BASE_URL: 'https://runtime-api.example.test' },
      credentialStore: new MemoryStore(),
      fetch,
      stdout,
    })

    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      'https://runtime-api.example.test/openapi/v1/health',
    )
  })

  it('checks API status before verifying an existing API key', async () => {
    const store = new MemoryStore()
    store.value = 'stored-key'
    const stdout = new BufferOutput()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(apiResponse({ status: 'ok', service: 'tqx', version: '1.0.0' }))
      .mockResolvedValueOnce(apiResponse({ valid: true }))

    await runCli(['status', '--json'], {
      environment: { TQX_BASE_URL: 'https://api.example.test' },
      credentialStore: store,
      fetch,
      stdout,
    })

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.example.test/openapi/v1/health',
      'https://api.example.test/openapi/v1/auth/verify',
    ])
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).has('X-API-Key')).toBe(false)
    expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get('X-API-Key')).toBe('stored-key')
    expect(JSON.parse(stdout.value)).toMatchObject({ authenticated: true })
  })

  it('does not verify an API key when the API health check fails', async () => {
    const store = new MemoryStore()
    store.value = 'stored-key'
    const stderr = new BufferOutput()
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () =>
      Response.json(
        {
          code: 'service_unavailable',
          message: 'service unavailable',
          data: null,
          request_id: 'request-health-failed',
          timestamp: 1,
        },
        { status: 503 },
      ),
    )

    await runCli(['status', '--json'], {
      environment: { TQX_BASE_URL: 'https://api.example.test' },
      credentialStore: store,
      fetch,
      stderr,
    })

    expect(fetch).toHaveBeenCalledTimes(3)
    expect(JSON.parse(stderr.value).error).toMatchObject({
      code: 'service_unavailable',
      status: 503,
    })
    expect(process.exitCode).toBe(1)
  })
})
