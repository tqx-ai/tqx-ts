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

function unavailable(): Promise<never> {
  return Promise.reject(
    Object.assign(new Error('libsecret not found'), { code: 'ERR_SECRETS_PLATFORM_ERROR' }),
  )
}

function memorySecrets(): BunSecretsApi & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    get: async ({ name }) => values.get(name) ?? null,
    set: async ({ name, value }) => {
      values.set(name, value)
    },
    delete: async ({ name }) => values.delete(name),
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

  it('keeps a key in the keychain only when it can be read back', async () => {
    const fallback = new MemoryStore()
    fallback.values.set(DEFAULT_ACCOUNT_ID, 'stale-key')
    const warnings: string[] = []
    const secrets = memorySecrets()
    const store = new FallbackCredentialStore(
      new BunSecretsCredentialStore(secrets),
      fallback,
      (message) => warnings.push(message),
    )

    await store.set(DEFAULT_ACCOUNT_ID, 'keychain-key')

    expect(secrets.values.get(DEFAULT_ACCOUNT_ID)).toBe('keychain-key')
    expect(fallback.values.has(DEFAULT_ACCOUNT_ID)).toBe(false)
    await expect(store.get(DEFAULT_ACCOUNT_ID)).resolves.toBe('keychain-key')
    expect(warnings).toEqual([])
  })

  it('stores the key in the file and warns when the keychain write cannot be read back', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tqx-credentials-'))
    const fallback = new FileCredentialStore(join(directory, 'credentials.json'))
    const warnings: string[] = []
    const secrets = memorySecrets()
    secrets.get = () =>
      Promise.reject(
        Object.assign(new Error('The user name or passphrase you entered is not correct.'), {
          code: 'ERR_SECRETS_AUTH_FAILED',
        }),
      )
    const store = new FallbackCredentialStore(
      new BunSecretsCredentialStore(secrets),
      fallback,
      (message) => warnings.push(message),
    )

    await store.set(DEFAULT_ACCOUNT_ID, 'unreadable-key')

    expect(secrets.values.has(DEFAULT_ACCOUNT_ID)).toBe(false)
    await expect(fallback.get(DEFAULT_ACCOUNT_ID)).resolves.toBe('unreadable-key')
    await expect(store.get(DEFAULT_ACCOUNT_ID)).resolves.toBe('unreadable-key')
    expect(warnings).toEqual([
      `The system keychain is unavailable (The user name or passphrase you entered is not correct.); the API key was stored in ${fallback.path}.`,
    ])
    expect(warnings.join('\n')).not.toContain('unreadable-key')
  })

  it('stores the key in the file and warns when the keychain returns a different value', async () => {
    const fallback = new MemoryStore()
    const warnings: string[] = []
    const secrets = memorySecrets()
    secrets.get = () => Promise.resolve(null)
    const store = new FallbackCredentialStore(
      new BunSecretsCredentialStore(secrets),
      fallback,
      (message) => warnings.push(message),
    )

    await store.set(DEFAULT_ACCOUNT_ID, 'lost-key')

    expect(fallback.values.get(DEFAULT_ACCOUNT_ID)).toBe('lost-key')
    expect(warnings).toEqual([
      'The system keychain is unavailable (the stored key could not be read back); the API key was stored in a file.',
    ])
  })

  it('warns when the keychain refuses to return a stored key and no file key exists', async () => {
    const warnings: string[] = []
    const secrets = memorySecrets()
    secrets.get = () =>
      Promise.reject(
        Object.assign(new Error('User interaction is not allowed.'), {
          code: 'ERR_SECRETS_INTERACTION_NOT_ALLOWED',
        }),
      )
    const store = new FallbackCredentialStore(
      new BunSecretsCredentialStore(secrets),
      new MemoryStore(),
      (message) => warnings.push(message),
    )

    await expect(store.get(DEFAULT_ACCOUNT_ID)).resolves.toBeNull()
    expect(warnings).toEqual([
      'Unable to read the stored API key from the system keychain (User interaction is not allowed.). Run tqx login again or set TQX_API_KEY.',
    ])
  })

  it('does not warn on reads when no keychain service is available', async () => {
    const warnings: string[] = []
    const store = new FallbackCredentialStore(
      new BunSecretsCredentialStore({ get: unavailable, set: unavailable, delete: unavailable }),
      new MemoryStore(),
      (message) => warnings.push(message),
    )

    await expect(store.get(DEFAULT_ACCOUNT_ID)).resolves.toBeNull()
    expect(warnings).toEqual([])
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
