import { afterEach, describe, expect, it, vi } from 'vitest'
import { runCli } from '../src/command'

class BufferOutput {
  value = ''
  write(chunk: string): void {
    this.value += chunk
  }
}

afterEach(() => {
  process.exitCode = undefined
})

describe('CLI current active-order filters', () => {
  it.each([
    {
      args: [
        '--startDate=2026-10-01',
        '--endDate=2026-10-25',
        '--status= submitted ',
        '--symbol=0700.hk',
        '--limit=2',
        '--cursor=opaque+/=',
      ],
      query: {
        start_date: '2026-10-01',
        end_date: '2026-10-25',
        status: 'SUBMITTED',
        symbol: '0700.hk',
        limit: '2',
        cursor: 'opaque+/=',
      },
    },
    { args: ['--limit=2', '--cursor=old-cursor'], query: { limit: '2', cursor: 'old-cursor' } },
    { args: ['--status=future_status'], query: { status: 'FUTURE_STATUS' } },
  ])('forwards supported flags without changing output: $args', async ({ args, query }) => {
    const stdout = new BufferOutput()
    const stderr = new BufferOutput()
    const get = vi.fn(async () => {
      throw new Error('Process key must take precedence')
    })
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json({
        code: '0',
        message: 'ok',
        data: { items: [], next_cursor: null },
        request_id: 'cli-read',
        timestamp: 1,
      }),
    )
    await runCli(['trading', 'orders', 'list', ...args, '--json'], {
      environment: { TQX_BASE_URL: 'https://api.example.test', TQX_API_KEY: 'synthetic-key' },
      credentialStore: { get, set: async () => undefined, delete: async () => false },
      fetch,
      stdout,
      stderr,
      autoUpdateCheck: false,
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    const [input, init] = fetch.mock.calls[0]!
    const url = new URL(String(input))
    expect(url.pathname).toBe('/openapi/v1/trading/orders')
    expect(Object.fromEntries(url.searchParams)).toEqual(query)
    expect(init?.method).toBe('GET')
    expect(new Headers(init?.headers).get('X-API-Key')).toBe('synthetic-key')
    expect(JSON.parse(stdout.value)).toEqual({ items: [], next_cursor: null })
    expect(stderr.value).toBe('')
    expect(get).not.toHaveBeenCalled()
    expect(process.exitCode ?? 0).toBe(0)
  })

  it('reports malformed dates without a request', async () => {
    const stdout = new BufferOutput()
    const stderr = new BufferOutput()
    const fetch = vi.fn<typeof globalThis.fetch>()
    await runCli(['trading', 'orders', 'list', '--startDate=2026/10/01', '--json'], {
      environment: { TQX_BASE_URL: 'https://api.example.test', TQX_API_KEY: 'synthetic-key' },
      credentialStore: {
        get: async () => null,
        set: async () => undefined,
        delete: async () => false,
      },
      fetch,
      stdout,
      stderr,
      autoUpdateCheck: false,
    })
    expect(fetch).not.toHaveBeenCalled()
    expect(stdout.value).toBe('')
    expect(JSON.parse(stderr.value).error.code).toBe('validation_error')
    expect(process.exitCode).toBe(2)
  })
})
