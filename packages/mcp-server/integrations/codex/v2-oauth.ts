import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import type { RecordValue } from './client'
import {
  assertClientIsolation,
  assertLiveIntegrationAllowed,
  isolatedClientEnvironment,
  type LivePermit,
} from './local-policy'
import { loopbackUrl, type ClientTarget } from './target'
import type { FixtureUser } from './v2-session'
import { closeOwnedProcess } from './owned-process'

export async function approveFixtureAuthorization(
  raw: string,
  target: ClientTarget,
  user: FixtureUser,
  permit: LivePermit,
): Promise<URL> {
  assertLiveIntegrationAllowed(permit)
  const url = new URL(raw)
  assert.equal(url.origin, new URL(target.issuer).origin)
  assert.equal(url.pathname, '/oauth/authorize')
  assert.equal(url.searchParams.get('resource'), target.resource)
  assert.deepEqual(
    (url.searchParams.get('scope') ?? '').split(' ').sort(),
    [...target.scopes].sort(),
  )
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert(url.searchParams.get('code_challenge'))
  const callback = new URL(loopbackUrl(url.searchParams.get('redirect_uri') ?? ''))
  assert.equal(callback.hostname, '127.0.0.1')
  assert(callback.port && callback.pathname === '/callback')
  const state = url.searchParams.get('state')
  assert(state)
  const authorization = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
  assert.equal(authorization.status, 302)
  const consent = new URL(authorization.headers.get('location') ?? '')
  const tx = consent.searchParams.get('tx')
  assert(tx)
  assertLiveIntegrationAllowed(permit)
  const decision = await fetch(
    new URL(`/oauth/tx/${encodeURIComponent(tx)}/decision`, target.issuer),
    {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${user.webAccessToken}`,
      },
      body: JSON.stringify({ approved: true, agent_id: user.agentId }),
    },
  )
  assert.equal(decision.status, 200)
  const redirect = new URL(String(((await decision.json()) as RecordValue).redirect_to))
  assert.equal(redirect.origin, callback.origin)
  assert.equal(redirect.pathname, callback.pathname)
  assert.deepEqual(redirect.searchParams.getAll('iss'), [target.issuer])
  assert.deepEqual(redirect.searchParams.getAll('state'), [state])
  assert.equal(redirect.searchParams.getAll('code').length, 1)
  assert(!redirect.searchParams.has('error'))
  return redirect
}

export async function loginWithInstalledCli(
  home: string,
  target: ClientTarget,
  user: FixtureUser,
  permit: LivePermit,
) {
  assertClientIsolation(permit, home, home)
  const child = spawn(
    process.env.TQX_CODEX_BIN ?? 'codex',
    [
      'mcp',
      'login',
      'tqx',
      '--scopes',
      target.scopes.join(','),
      '--oauth-client-registration',
      'auto',
      '--no-browser',
    ],
    { cwd: home, env: isolatedClientEnvironment(home), stdio: 'pipe', windowsHide: true },
  )
  let output = ''
  let spawnFailed = false
  child.on('error', () => {
    spawnFailed = true
  })
  const collect = (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-262144)
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  try {
    let authorizationUrl: string | undefined
    for (let index = 0; index < 400; index++) {
      authorizationUrl = output.match(/https?:\/\/[^\s<>"]+/g)?.find((value) => {
        try {
          const url = new URL(value)
          return url.origin === new URL(target.issuer).origin && url.pathname === '/oauth/authorize'
        } catch {
          return false
        }
      })
      if (authorizationUrl) break
      assert(!spawnFailed && child.exitCode === null, 'CLI stopped before authorization')
      await new Promise((done) => setTimeout(done, 50))
    }
    assert(authorizationUrl, 'CLI authorization URL unavailable')
    const redirect = await approveFixtureAuthorization(authorizationUrl, target, user, permit)
    child.stdin.write(`${redirect.href}\n`)
    for (let index = 0; index < 200 && child.exitCode === null; index++) {
      assert(!spawnFailed, 'CLI failed to start')
      await new Promise((done) => setTimeout(done, 50))
    }
    assert(!spawnFailed && child.exitCode === 0, 'CLI login failed or timed out')
  } finally {
    // The captured text can contain credentials; it is never logged or persisted.
    output = ''
    await closeOwnedProcess(child)
  }
}
