import { describe, expect, it, vi } from 'vitest'
import { TqxClient, TqxValidationError } from '../src'

function response(data: unknown) {
  return Response.json({
    code: '0',
    message: 'success',
    data,
    request_id: 'bug-request',
    timestamp: 1,
  })
}

describe('bug reports', () => {
  it('posts only title and description to the trading OpenAPI base', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        response({ bug_id: 'BR-20260920-01Jabc', created_at: '2026-09-20T00:00:00Z' }),
      )
    const client = new TqxClient({
      baseUrl: 'https://research.example.test/pandaApi',
      tradingBaseUrl: 'https://api.example.test',
      apiKey: 'sk-test-1234567890123456',
      clientVersion: '0.5.0',
      fetch,
    })
    await client.bugs.report({
      title: '  Broken  ',
      description: '  Full details  ',
      idempotencyKey: 'cli-bug-1',
    })
    const [url, init] = fetch.mock.calls[0]!
    expect(String(url)).toBe('https://api.example.test/openapi/v1/bug-reports')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ title: 'Broken', description: 'Full details' })
    const headers = new Headers(init?.headers)
    expect(headers.get('X-API-Key')).toBe('sk-test-1234567890123456')
    expect(headers.get('X-TQX-Client-Version')).toBe('0.5.0')
    expect(headers.get('Idempotency-Key')).toBe('cli-bug-1')
  })

  it('rejects empty input before fetch', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    const client = new TqxClient({
      baseUrl: 'https://api.example.test',
      apiKey: 'sk-test-1234567890123456',
      fetch,
    })
    await expect(client.bugs.report({ title: ' ', description: 'details' })).rejects.toBeInstanceOf(
      TqxValidationError,
    )
    expect(fetch).not.toHaveBeenCalled()
  })
})
