import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import * as v from 'valibot'

import {
  getBunSecrets,
  getRuntimeEnvironment,
  getRuntimeProcess,
  type BunSecretsApi,
} from './utils/runtime'

export interface CredentialStore {
  get(accountId: string): Promise<string | null>
  set(accountId: string, secret: string): Promise<void>
  delete(accountId: string): Promise<boolean>
}

export class CredentialStoreUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'CredentialStoreUnavailableError'
  }
}

export const DEFAULT_ACCOUNT_ID = 'default'
const BUN_SECRET_SERVICE = 'trade.tqx.cli'

const credentialsFileSchema = v.strictObject({
  version: v.literal(1),
  credentials: v.record(v.string(), v.string()),
})

type CredentialsFile = v.InferOutput<typeof credentialsFileSchema>

export class BunSecretsCredentialStore implements CredentialStore {
  constructor(private readonly secrets: BunSecretsApi) {}

  async get(accountId: string): Promise<string | null> {
    return this.withUnavailableError(() =>
      this.secrets.get({ service: BUN_SECRET_SERVICE, name: accountId }),
    )
  }

  async set(accountId: string, secret: string): Promise<void> {
    return this.withUnavailableError(() =>
      this.secrets.set({ service: BUN_SECRET_SERVICE, name: accountId, value: secret }),
    )
  }

  async delete(accountId: string): Promise<boolean> {
    return this.withUnavailableError(() =>
      this.secrets.delete({ service: BUN_SECRET_SERVICE, name: accountId }),
    )
  }

  private async withUnavailableError<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      throw new CredentialStoreUnavailableError('Bun secrets is unavailable', { cause: error })
    }
  }
}

export class FileCredentialStore implements CredentialStore {
  constructor(readonly path = defaultCredentialsPath()) {}

  async get(accountId: string): Promise<string | null> {
    const credentials = await this.read()

    return credentials.credentials[accountId] ?? null
  }

  async set(accountId: string, secret: string): Promise<void> {
    const contents = await this.read()
    contents.credentials[accountId] = secret
    await this.write(contents)
  }

  async delete(accountId: string): Promise<boolean> {
    const contents = await this.read()
    if (!(accountId in contents.credentials)) return false
    delete contents.credentials[accountId]
    if (Object.keys(contents.credentials).length === 0) {
      try {
        await unlink(this.path)
      } catch (error) {
        if (!isErrorCode(error, 'ENOENT')) throw error
      }
    } else {
      await this.write(contents)
    }
    return true
  }

  private async read(): Promise<CredentialsFile> {
    let raw: string
    try {
      raw = await readFile(this.path, 'utf8')
    } catch (error) {
      if (isErrorCode(error, 'ENOENT')) return { version: 1, credentials: {} }
      throw error
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      throw new Error(`Credential file is not valid JSON: ${this.path}`, { cause: error })
    }
    const result = v.safeParse(credentialsFileSchema, parsed)
    if (!result.success) throw new Error(`Credential file has an invalid structure: ${this.path}`)
    return result.output
  }

  private async write(contents: CredentialsFile): Promise<void> {
    const directory = dirname(this.path)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const temporaryPath = `${this.path}.${getRuntimeProcess().pid}.${Date.now()}.tmp`
    try {
      await writeFile(temporaryPath, `${JSON.stringify(contents, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      })
      await rename(temporaryPath, this.path)
      if (getRuntimeProcess().platform !== 'win32') await chmod(this.path, 0o600)
    } catch (error) {
      try {
        await unlink(temporaryPath)
      } catch {
        // Ignore cleanup failures and preserve the original write error.
      }
      throw error
    }
  }
}

export class FallbackCredentialStore implements CredentialStore {
  constructor(
    private readonly preferred: CredentialStore | null,
    private readonly fallback: CredentialStore,
  ) {}

  async get(accountId: string): Promise<string | null> {
    if (this.preferred) {
      try {
        const secret = await this.preferred.get(accountId)
        if (secret) return secret
      } catch (error) {
        if (!(error instanceof CredentialStoreUnavailableError)) throw error
      }
    }
    return this.fallback.get(accountId)
  }

  async set(accountId: string, secret: string): Promise<void> {
    if (this.preferred) {
      try {
        await this.preferred.set(accountId, secret)
        try {
          await this.fallback.delete(accountId)
        } catch {
          // The keychain write succeeded, so stale fallback cleanup is best-effort.
        }
        return
      } catch (error) {
        if (!(error instanceof CredentialStoreUnavailableError)) throw error
      }
    }
    await this.fallback.set(accountId, secret)
  }

  async delete(accountId: string): Promise<boolean> {
    let deleted = false
    if (this.preferred) {
      try {
        deleted = await this.preferred.delete(accountId)
      } catch (error) {
        if (!(error instanceof CredentialStoreUnavailableError)) throw error
      }
    }
    return (await this.fallback.delete(accountId)) || deleted
  }
}

export function createCredentialStore(path = defaultCredentialsPath()): CredentialStore {
  return new FallbackCredentialStore(runtimeBunSecretsStore(), new FileCredentialStore(path))
}

export function defaultCredentialsPath(
  environment: NodeJS.ProcessEnv = getRuntimeEnvironment(),
  home = homedir(),
): string {
  const configRoot = environment.XDG_CONFIG_HOME?.trim() || join(home, '.config')
  return join(configRoot, 'tqx', 'credentials.json')
}

export async function resolveApiKey(
  store: CredentialStore,
  environment: NodeJS.ProcessEnv = getRuntimeEnvironment(),
): Promise<string | null> {
  const environmentKey = environment.TQX_API_KEY?.trim()
  if (environmentKey) return environmentKey
  return store.get(DEFAULT_ACCOUNT_ID)
}

function runtimeBunSecretsStore(): CredentialStore | null {
  const secrets = getBunSecrets()
  return secrets ? new BunSecretsCredentialStore(secrets) : null
}

function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}
