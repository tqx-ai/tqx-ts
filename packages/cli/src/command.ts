import { defineCommand, runMain } from 'citty'

import { DEFAULT_ACCOUNT_ID, createCredentialStore, type CredentialStore } from './credentials'
import { Output, type OutputMode, type WritableOutput } from './output'
import { createResearchCommand } from './research/command'
import { createCommandRuntime, type CommandRuntimeDependencies } from './runtime/command-runtime'
import { createTradingCommand } from './trading/command'
import { CliUsageError } from './utils/errors'
import { getRuntimeEnvironment, getRuntimeProcess } from './utils/runtime'

export interface CliDependencies {
  environment?: NodeJS.ProcessEnv
  credentialStore?: CredentialStore
  fetch?: typeof globalThis.fetch
  stdout?: WritableOutput
  stderr?: WritableOutput
}

interface ResolvedDependencies extends CommandRuntimeDependencies {}

const LOGIN_WELCOME_MESSAGE =
  '🔥🔥 Welcome to GATC 2026 | Global Intelligent Agent Trading Challenge'

export async function runCli(
  rawArguments = getRuntimeProcess().argv.slice(2),
  dependencies: CliDependencies = {},
): Promise<void> {
  const normalizedArguments = normalizeGlobalArguments(rawArguments)
  const { arguments: commandArguments, mode } = extractGlobalOptions(normalizedArguments)
  const resolved: ResolvedDependencies = {
    environment: dependencies.environment ?? getRuntimeEnvironment(),
    credentialStore: dependencies.credentialStore ?? createCredentialStore(),
    fetch: dependencies.fetch,
    stdout: dependencies.stdout ?? getRuntimeProcess().stdout,
    stderr: dependencies.stderr ?? getRuntimeProcess().stderr,
    output: new Output(mode, dependencies.stdout, dependencies.stderr),
  }

  await runMain(createMainCommand(resolved), { rawArgs: commandArguments })
}

export function extractGlobalOptions(rawArguments: string[]): {
  arguments: string[]
  mode: OutputMode
} {
  let json = false
  let plain = false
  const args: string[] = []
  for (let index = 0; index < rawArguments.length; index += 1) {
    const argument = rawArguments[index]!
    if (argument === '--json') json = true
    else if (argument === '--plain') plain = true
    else if (argument === '-H') args.push('--help')
    else if (argument === '-V') args.push('--version')
    else args.push(argument)
  }
  if (json && plain) throw new CliUsageError('--json and --plain cannot be used together')
  const result: { arguments: string[]; mode: OutputMode } = {
    arguments: args,
    mode: json ? 'json' : plain ? 'plain' : 'color',
  }
  return result
}

function createMainCommand(dependencies: ResolvedDependencies) {
  const runtime = createCommandRuntime(dependencies)
  const apiKeyUrl = __TQX_BUILD_API_KEY_URL__.trim()
  const loginDescription = apiKeyUrl
    ? `Verify and store an API key. Get one at ${apiKeyUrl}`
    : 'Verify and store an API key'
  return defineCommand({
    meta: {
      name: 'tqx',
      version: __TQX_BUILD_CLI_VERSION__,
      description: 'TQX trading and research command-line client',
    },
    args: {
      json: { type: 'boolean', description: 'Output JSON' },
      plain: { type: 'boolean', description: 'Disable color output' },
    },
    subCommands: {
      login: defineCommand({
        meta: { name: 'login', description: loginDescription },
        args: { 'api-key': { type: 'string', description: 'TQX API key (required)' } },
        run: ({ args }) =>
          runtime.run(async () => {
            const apiKey = args['api-key']
            if (!apiKey) {
              const guidance = apiKeyUrl ? ` Get one at ${apiKeyUrl}` : ''
              throw new CliUsageError(`--api-key is required.${guidance}`)
            }
            await runtime.createClient(apiKey).user.verify()
            await dependencies.credentialStore.set(DEFAULT_ACCOUNT_ID, apiKey)
            return { logged_in: true }
          }, LOGIN_WELCOME_MESSAGE),
      }),
      logout: defineCommand({
        meta: { name: 'logout', description: 'Remove the stored API key' },
        run: () =>
          runtime.run(async () => {
            const removed = await dependencies.credentialStore.delete(DEFAULT_ACCOUNT_ID)
            const environmentOverride = Boolean(dependencies.environment.TQX_API_KEY?.trim())
            if (environmentOverride)
              dependencies.output.warning(
                'TQX_API_KEY is still set and will continue to authenticate',
              )
            return { logged_out: true, removed, environment_override: environmentOverride }
          }),
      }),
      status: defineCommand({
        meta: { name: 'status', description: 'Check API and authentication status' },
        run: () =>
          runtime.run(async () => {
            const health = await runtime.createClient().user.getStatus()
            const status = {
              status: health.status,
              service: health.service,
              backend_version: health.version,
            }
            const apiKey = await runtime.getApiKey()
            if (!apiKey) return { ...status, authenticated: false }
            const verification = await runtime.createClient(apiKey).user.verify()
            return { ...status, authenticated: verification.valid }
          }),
      }),
      balance: defineCommand({
        meta: { name: 'balance', description: 'Show the TQX wallet balance' },
        run: () => runtime.user((client) => client.user.getBalance()),
      }),
      research: createResearchCommand(runtime),
      trading: createTradingCommand(runtime),
    },
  })
}

function normalizeGlobalArguments(rawArguments: string[]): string[] {
  const args: string[] = []
  for (let index = 0; index < rawArguments.length; index += 1) {
    const argument = rawArguments[index]!
    if (argument === '-H') {
      args.push('--help')
      continue
    }
    if (argument === '-V') {
      args.push('--version')
      continue
    }
    if (argument === '--formula' && index + 1 < rawArguments.length) {
      const next = rawArguments[index + 1]
      if (next?.startsWith('-') && !next.startsWith('--')) {
        args.push(`--formula=${next}`)
        index += 1
        continue
      }
    }
    if (argument === '--download') {
      const next = rawArguments[index + 1]
      if (!next || next.startsWith('-')) {
        args.push('--download=')
        continue
      }
    }
    args.push(argument)
  }
  return args
}
