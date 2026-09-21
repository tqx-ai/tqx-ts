import { afterEach, describe, expect, it, vi } from 'vitest'
import { networkInterfaces } from 'node:os'

import { type CredentialStore } from '../../src/credentials'
import { Output } from '../../src/output'
import { createCommandRuntime } from '../../src/runtime/command-runtime'

vi.mock('node:os', () => ({ networkInterfaces: vi.fn() }))

class BufferOutput {
  value = ''

  write(chunk: string): void {
    this.value += chunk
  }
}

class MemoryStore implements CredentialStore {
  constructor(private readonly value: string | null = null) {}

  async get(): Promise<string | null> {
    return this.value
  }

  async set(_accountId: string, _secret: string): Promise<void> {}

  async delete(): Promise<boolean> {
    return false
  }
}

function createRuntime(
  store: CredentialStore,
  environment: NodeJS.ProcessEnv = {},
  fetch?: typeof globalThis.fetch,
) {
  const stdout = new BufferOutput()
  const stderr = new BufferOutput()
  return {
    runtime: createCommandRuntime({
      environment,
      credentialStore: store,
      fetch,
      stdout,
      stderr,
      output: new Output('json', stdout, stderr),
    }),
    stdout,
    stderr,
  }
}

afterEach(() => {
  process.exitCode = undefined
})

describe('CommandRuntime', () => {
  it('passes the default local MAC and CLI version to the SDK client', async () => {
    vi.mocked(networkInterfaces).mockReturnValue({
      Ethernet: [
        {
          address: '192.0.2.1',
          netmask: '255.255.255.0',
          family: 'IPv4',
          mac: 'AA-BB-CC-DD-EE-FF',
          internal: false,
          cidr: '192.0.2.1/24',
        },
      ],
    })
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json({
        code: '0',
        message: 'success',
        data: { status: 'ok', service: 'panda_openapi', version: '1.0.0' },
        request_id: 'request-1',
        timestamp: 1,
      }),
    )
    const { runtime } = createRuntime(
      new MemoryStore('stored-key'),
      { TQX_BASE_URL: 'https://api.example.test' },
      fetch,
    )

    await runtime.user((client) => client.health())

    const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers)
    expect(headers.get('X-TQX-Client-MAC')).toBe('AA:BB:CC:DD:EE:FF')
    expect(headers.get('X-TQX-Client-Version')).toBe('0.4.0')
  })

  it('handles unauthenticated trading errors at the shared boundary', async () => {
    const { runtime, stderr } = createRuntime(new MemoryStore())

    await runtime.trading(async () => ({ unreachable: true }))

    expect(JSON.parse(stderr.value).error.message).toBe(
      'Not logged in. Run tqx login --api-key=<key> first',
    )
    expect(process.exitCode).toBe(2)
  })

  it('provides authenticated trading and research clients', async () => {
    const { runtime, stdout } = createRuntime(new MemoryStore('stored-key'), {
      TQX_BASE_URL: 'https://api.example.test',
      TQX_API_KEY: 'environment-key',
    })

    await runtime.trading(async (client) => ({ has_trading_client: Boolean(client.trading) }))
    await runtime.research(async (client) => ({ has_research_client: Boolean(client.research) }))

    expect(
      stdout.value
        .trim()
        .split(/\n(?=\{)/)
        .map((value) => JSON.parse(value)),
    ).toEqual([{ has_trading_client: true }, { has_research_client: true }])
  })
})
