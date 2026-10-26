import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createCallbackProxy,
  trustedServiceUrl,
  validateAuthorizationUrl,
  validateConsentLocation,
} from './callback-proxy'
import { closeOwnedProcess } from './owned-process'

export interface CallbackLoginOptions {
  server: string
  resource: string
  issuer: string
  webOrigin: string
  timeoutMs?: number
  codexBinary?: string
  cwd?: string
  env?: NodeJS.ProcessEnv
  scopes?: readonly string[]
}
function boundedExit(exit: Promise<number | null>, milliseconds: number): Promise<number | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), milliseconds)
    void exit.then((code) => {
      clearTimeout(timer)
      resolve(code)
    })
  })
}
export async function startCallbackLogin(options: CallbackLoginOptions) {
  assert(/^[A-Za-z0-9_-]{1,64}$/.test(options.server), 'Invalid server name')
  const requested = options.scopes === undefined ? ['trade:read', 'order:write'] : options.scopes
  assert(
    Array.isArray(requested) &&
      requested.length > 0 &&
      [...requested].every((scope) => scope === 'trade:read' || scope === 'order:write'),
    'Invalid login scopes',
  )
  const scopes = [...new Set(requested)]
  const env = options.env ?? process.env
  trustedServiceUrl(options.resource, '/mcp', env)
  trustedServiceUrl(options.issuer, '/', env)
  assert.equal(trustedServiceUrl(options.webOrigin, '/', env).origin, options.webOrigin)
  const timeoutMs = options.timeoutMs ?? 300000
  assert(timeoutMs >= 10000 && timeoutMs <= 600000, 'Timeout must be 10 to 600 seconds')
  // Exact issuer support is required; never negotiate away issuer validation.
  const metadataResponse = await fetch(
    new URL('/.well-known/oauth-authorization-server', options.issuer),
    { redirect: 'manual', signal: AbortSignal.timeout(5000) },
  )
  assert.equal(metadataResponse.status, 200, 'Authorization metadata unavailable')
  const metadata = (await metadataResponse.json()) as Record<string, unknown>
  assert.equal(metadata.issuer, options.issuer, 'Metadata issuer mismatch')
  assert.equal(
    metadata.authorization_response_iss_parameter_supported,
    true,
    'Issuer-bound callbacks are required',
  )
  assert.equal(metadata.authorization_endpoint, new URL('/oauth/authorize', options.issuer).href)
  let resolveExit!: (code: number | null) => void
  const exit = new Promise<number | null>((ok) => {
    resolveExit = ok
  })
  const proxy = await createCallbackProxy({
    issuer: options.issuer,
    webOrigin: options.webOrigin,
    env,
    timeoutMs,
    waitForCliExit: () => boundedExit(exit, 15000),
    deliverCallback: (originalCallbackUrl) =>
      new Promise<void>((ok, fail) => {
        child.stdin.write(`${originalCallbackUrl}\n`, (error) =>
          error ? fail(new Error('CLI callback input failed')) : ok(),
        )
      }),
  })
  let output = ''
  let exited = false
  const child = spawn(
    options.codexBinary ?? 'codex',
    [
      '-c',
      `mcp_oauth_callback_url=${JSON.stringify(proxy.redirectUri)}`,
      'mcp',
      'login',
      options.server,
      '--scopes',
      scopes.join(','),
      '--oauth-client-registration',
      'auto',
      '--no-browser',
    ],
    {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      stdio: 'pipe',
      windowsHide: true,
    },
  )
  const onExit = (code: number | null) => {
    if (exited) return
    exited = true
    resolveExit(code)
    proxy.cliExited(code)
  }
  child.once('exit', onExit)
  child.once('error', () => onExit(null))
  child.stdin.on('error', () => onExit(null))
  const collect = (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-262144)
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  let cleanupTask: Promise<void> | undefined
  const cleanup = () => {
    cleanupTask ??= (async () => {
      output = ''
      child.stdout.off('data', collect)
      child.stderr.off('data', collect)
      child.stdout.resume()
      child.stderr.resume()
      try {
        await closeOwnedProcess(child)
      } finally {
        await proxy.close()
      }
    })()
    return cleanupTask
  }
  try {
    let authorization: URL | undefined
    const deadline = Date.now() + Math.min(timeoutMs, 25000)
    while (Date.now() < deadline) {
      if (exited) break
      for (const candidate of output.match(/https?:\/\/[^\s<>"]+/g) ?? []) {
        try {
          const url = new URL(candidate)
          if (
            url.origin === new URL(options.issuer).origin &&
            url.pathname === '/oauth/authorize'
          ) {
            authorization = url
            break
          }
        } catch {
          /* Ignore non-URL CLI prose without logging it. */
        }
      }
      if (authorization) break
      await new Promise((ok) => setTimeout(ok, 25))
    }
    assert(authorization, 'CLI authorization URL unavailable')
    const state = validateAuthorizationUrl(authorization.href, {
      issuer: options.issuer,
      resource: options.resource,
      redirectUri: proxy.redirectUri,
      scopes,
    })
    // The one begin request produces the one consent transaction. Never reopen
    // the original authorize URL after this point or append relay query fields.
    const begin = await fetch(authorization, {
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    })
    assert.equal(begin.status, 302, 'Authorization begin did not return consent')
    const location = begin.headers.get('location')
    await begin.body?.cancel()
    assert(location)
    const consentUrl = validateConsentLocation(location, options.webOrigin)
    assert(!exited, 'CLI exited before the consent handoff')
    proxy.bind(state, consentUrl)
    output = ''
    const completion = (async () => {
      try {
        return await proxy.completion
      } finally {
        await cleanup()
      }
    })()
    return {
      consentUrl,
      maximumWaitSeconds: Math.floor(timeoutMs / 1000),
      completion,
      async cancel() {
        proxy.cancel()
        return completion
      },
    }
  } catch {
    proxy.cancel()
    await cleanup()
    throw new Error(
      'TQX callback login could not start; no credential or callback details are logged',
    )
  }
}

async function main() {
  const values = new Map<string, string>()
  const args = process.argv.slice(2)
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]!
    assert(
      [
        '--server',
        '--mcp-url',
        '--issuer',
        '--web-origin',
        '--timeout-seconds',
        '--codex-bin',
        '--scopes',
      ].includes(key) &&
        !values.has(key) &&
        args[index + 1],
      'Invalid helper arguments',
    )
    values.set(key, args[index + 1]!)
  }
  const get = (key: string) => {
    const value = values.get(key)
    assert(value, `Missing ${key}`)
    return value
  }
  const timeoutMs = Number(values.get('--timeout-seconds') ?? '300') * 1000
  const login = await startCallbackLogin({
    server: get('--server'),
    resource: get('--mcp-url'),
    issuer: get('--issuer'),
    webOrigin: get('--web-origin'),
    timeoutMs,
    ...(values.has('--scopes')
      ? {
          scopes: values
            .get('--scopes')!
            .split(',')
            .map((scope) => scope.trim()),
        }
      : {}),
    ...(values.has('--codex-bin') ? { codexBinary: values.get('--codex-bin')! } : {}),
  })
  const interrupt = () => {
    void login.cancel()
  }
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', interrupt)
  try {
    // This is the private user's consent-page handoff, never the authorize URL
    // containing state/PKCE parameters or a callback URL containing a code.
    console.log(
      JSON.stringify({
        event: 'awaiting_user_consent',
        consentUrl: login.consentUrl,
        maximumWaitSeconds: login.maximumWaitSeconds,
      }),
    )
    const result = await login.completion
    console.log(JSON.stringify({ event: 'login_finished', ...result, pluginReadVerified: false }))
    if (result.status !== 'succeeded') process.exitCode = 1
  } finally {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', interrupt)
  }
}
if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  void main().catch(() => {
    console.error(
      'TQX login helper failed; connection is not confirmed. No automatic retry was started.',
    )
    process.exitCode = 1
  })
}
