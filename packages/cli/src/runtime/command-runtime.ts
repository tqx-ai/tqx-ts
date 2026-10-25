import {
  resolveTqxEndpoints,
  TqxClient,
  TqxValidationError,
  type TqxResolvedEndpoints,
} from '@tqx-ai/sdk'

import { resolveApiKey, type CredentialStore } from '../credentials'
import { Output, type WritableOutput } from '../output'
import { CliUsageError } from '../utils/errors'
import { getLocalMacAddress } from '../utils/client-identity'
import { getRuntimeProcess } from '../utils/runtime'

export interface CommandRuntimeDependencies {
  environment: NodeJS.ProcessEnv
  credentialStore: CredentialStore
  fetch?: typeof globalThis.fetch
  stdout: WritableOutput
  stderr: WritableOutput
  output: Output
}

export interface CommandRuntime {
  run<T>(operation: () => Promise<T>, successMessage?: string): Promise<void>
  createClient(apiKey?: string): TqxClient
  getApiKey(): Promise<string | null>
  getEndpoints(): TqxResolvedEndpoints
  trading<T>(operation: (client: TqxClient) => Promise<T>): Promise<void>
  research<T>(operation: (client: TqxClient) => Promise<T>): Promise<void>
  user<T>(operation: (client: TqxClient) => Promise<T>): Promise<void>
}

export function createCommandRuntime(dependencies: CommandRuntimeDependencies): CommandRuntime {
  const fetch = withLoadingIndicator(dependencies.fetch ?? globalThis.fetch, dependencies.output)

  const createClient = (apiKey?: string): TqxClient => {
    const legacy = dependencies.environment.TQX_ENV === undefined
    const baseUrl = legacy ? dependencies.environment.TQX_BASE_URL?.trim() || undefined : undefined
    const defaultBaseUrl = __TQX_BUILD_DEFAULT_BASE_URL__.trim() || undefined
    if (legacy && !baseUrl && !defaultBaseUrl) {
      throw new CliUsageError(
        'TQX_BASE_URL is required because this CLI was built without TQX_BUILD_BASE_URL',
      )
    }
    const endpoints = resolveTqxEndpoints({}, dependencies.environment)
    return new TqxClient({
      ...endpoints,
      runtimeEnvironment: dependencies.environment,
      apiKey,
      clientMac: getLocalMacAddress(),
      clientVersion: __TQX_BUILD_CLI_VERSION__,
      fetch,
    })
  }

  const getApiKey = () => resolveApiKey(dependencies.credentialStore, dependencies.environment)

  const run = async <T>(operation: () => Promise<T>, successMessage?: string): Promise<void> => {
    try {
      dependencies.output.success(await operation())
      if (successMessage) dependencies.output.message(successMessage)
    } catch (error) {
      dependencies.output.error(error)
      getRuntimeProcess().exitCode = exitCodeFor(error)
    }
  }

  return {
    run,
    createClient,
    getApiKey,
    getEndpoints: () => resolveTqxEndpoints({}, dependencies.environment),
    trading: (operation) =>
      run(async () => {
        const apiKey = await getApiKey()
        if (!apiKey) throw new CliUsageError('Not logged in. Run tqx login --api-key=<key> first')
        return operation(createClient(apiKey))
      }),
    research: (operation) =>
      run(async () => {
        const apiKey = await getApiKey()
        if (!apiKey) throw new CliUsageError('Not logged in. Run tqx login --api-key=<key> first')
        return operation(createClient(apiKey))
      }),
    user: (operation) =>
      run(async () => {
        const apiKey = await getApiKey()
        if (!apiKey) throw new CliUsageError('Not logged in. Run tqx login --api-key=<key> first')
        return operation(createClient(apiKey))
      }),
  }
}

function exitCodeFor(error: unknown): number {
  return error instanceof CliUsageError || error instanceof TqxValidationError ? 2 : 1
}

function withLoadingIndicator(
  fetch: typeof globalThis.fetch,
  output: Output,
): typeof globalThis.fetch {
  return async (input, init) => {
    const indicator = output.loading()
    try {
      return await fetch(input, init)
    } finally {
      indicator.stop()
    }
  }
}
