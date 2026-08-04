import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  BunSecretsCredentialStore,
  DEFAULT_ACCOUNT_ID,
  FallbackCredentialStore,
  FileCredentialStore,
  resolveApiKey,
  type CredentialStore,
} from '../src/credentials'
import type { BunSecretsApi } from '../src/utils/runtime'

class MemoryStore implements CredentialStore {
  readonly values = new Map<string, string>()

  async get(accountId: string): Promise<string | null> {
    return this.values.get(accountId) ?? null
  }

  async set(accountId: string, secret: string): Promise<void> {
    this.values.set(accountId, secret)
  }

  async delete(accountId: string): Promise<boolean> {
    return this.values.delete(accountId)
  }
}

class FailingStore implements CredentialStore {
  constructor(private readonly error: Error) {}

  get(): Promise<string | null> {
    return Promise.reject(this.error)
  }

  set(): Promise<void> {
    return Promise.reject(this.error)
  }

  delete(): Promise<boolean> {
    return Promise.reject(this.error)
  }
}

describe('credential stores', () => {
  it('writes, reads and deletes the file fallback', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tqx-credentials-'))
    const path = join(directory, 'credentials.json')
    const store = new FileCredentialStore(path)

    await store.set(DEFAULT_ACCOUNT_ID, 'secret-key')
    await expect(store.get(DEFAULT_ACCOUNT_ID)).resolves.toBe('secret-key')
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
      version: 1,
      credentials: { default: 'secret-key' },
    })
    await expect(store.delete(DEFAULT_ACCOUNT_ID)).resolves.toBe(true)
    await expect(store.get(DEFAULT_ACCOUNT_ID)).resolves.toBeNull()
  })

  it('falls back when Bun secrets is unavailable', async () => {
    const fallback = new MemoryStore()
    const secrets: BunSecretsApi = {
      get: () => Promise.reject(new Error('keychain unavailable')),
      set: () => Promise.reject(new Error('keychain unavailable')),
      delete: () => Promise.reject(new Error('keychain unavailable')),
    }
    const store = new FallbackCredentialStore(new BunSecretsCredentialStore(secrets), fallback)

    await store.set(DEFAULT_ACCOUNT_ID, 'fallback-key')
    await expect(store.get(DEFAULT_ACCOUNT_ID)).resolves.toBe('fallback-key')
    await expect(store.delete(DEFAULT_ACCOUNT_ID)).resolves.toBe(true)
  })

  it('propagates unexpected preferred-store errors', async () => {
    const error = new Error('credential store is corrupt')
    const store = new FallbackCredentialStore(new FailingStore(error), new MemoryStore())

    await expect(store.get(DEFAULT_ACCOUNT_ID)).rejects.toBe(error)
    await expect(store.set(DEFAULT_ACCOUNT_ID, 'secret-key')).rejects.toBe(error)
    await expect(store.delete(DEFAULT_ACCOUNT_ID)).rejects.toBe(error)
  })

  it('prefers the environment variable over persistent credentials', async () => {
    const store = new MemoryStore()
    await store.set(DEFAULT_ACCOUNT_ID, 'stored-key')

    await expect(resolveApiKey(store, { TQX_API_KEY: ' environment-key ' })).resolves.toBe(
      'environment-key',
    )
    await expect(resolveApiKey(store, {})).resolves.toBe('stored-key')
  })
})
