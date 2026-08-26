export type RuntimeEngine = 'bun' | 'node'

export interface BunSecretsApi {
  get(options: { service: string; name: string }): Promise<string | null>
  set(options: { service: string; name: string; value: string }): Promise<void>
  delete(options: { service: string; name: string }): Promise<boolean>
}

export interface RuntimeOutput {
  readonly isTTY?: boolean
  write(chunk: string): unknown
}

export interface RuntimeProcess {
  readonly argv: string[]
  readonly execPath: string
  readonly arch: string
  readonly env: NodeJS.ProcessEnv
  readonly pid: number
  readonly platform: string
  readonly stdout: RuntimeOutput
  readonly stderr: RuntimeOutput
  exitCode?: number
}

export interface RuntimeGlobals {
  readonly Bun?: {
    readonly env?: NodeJS.ProcessEnv
    readonly secrets?: BunSecretsApi
  }
  readonly process?: RuntimeProcess
}

export function getRuntimeEngine(runtime: RuntimeGlobals = runtimeGlobals()): RuntimeEngine {
  return runtime.Bun ? 'bun' : 'node'
}

export function getRuntimeEnvironment(
  runtime: RuntimeGlobals = runtimeGlobals(),
): NodeJS.ProcessEnv {
  return runtime.Bun?.env ?? getRuntimeProcess(runtime).env
}

export function getRuntimeProcess(runtime: RuntimeGlobals = runtimeGlobals()): RuntimeProcess {
  if (!runtime.process) throw new Error('A Node.js-compatible process API is required')
  return runtime.process
}

export function getBunSecrets(runtime: RuntimeGlobals = runtimeGlobals()): BunSecretsApi | null {
  return getRuntimeEngine(runtime) === 'bun' ? (runtime.Bun?.secrets ?? null) : null
}

function runtimeGlobals(): RuntimeGlobals {
  return globalThis as RuntimeGlobals
}
