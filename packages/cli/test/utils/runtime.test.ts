import { describe, expect, it } from 'vitest'

import {
  getBunSecrets,
  getRuntimeEngine,
  getRuntimeEnvironment,
  type BunSecretsApi,
  type RuntimeGlobals,
} from '../../src/utils/runtime'

describe('getRuntimeEngine', () => {
  it('detects Bun without reading a Node-specific global', () => {
    expect(getRuntimeEngine({ Bun: {} })).toBe('bun')
    expect(getRuntimeEngine({})).toBe('node')
  })

  it('uses Bun environment variables and secrets when available', () => {
    const environment = { TQX_API_KEY: 'bun-key' }
    const secrets: BunSecretsApi = {
      get: async () => null,
      set: async () => {},
      delete: async () => false,
    }
    const runtime: RuntimeGlobals = { Bun: { env: environment, secrets } }

    expect(getRuntimeEnvironment(runtime)).toBe(environment)
    expect(getBunSecrets(runtime)).toBe(secrets)
    expect(getBunSecrets({})).toBeNull()
  })
})
