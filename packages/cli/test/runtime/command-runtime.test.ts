import { afterEach, describe, expect, it } from 'vitest'

import { type CredentialStore } from '../../src/credentials'
import { Output } from '../../src/output'
import { createCommandRuntime } from '../../src/runtime/command-runtime'

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

function createRuntime(store: CredentialStore, environment: NodeJS.ProcessEnv = {}) {
  const stdout = new BufferOutput()
  const stderr = new BufferOutput()
  return {
    runtime: createCommandRuntime({
      environment,
      credentialStore: store,
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
