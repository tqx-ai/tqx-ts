// packages/mcp-server/integrations/codex/callback-login.ts
import assert3 from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// packages/mcp-server/integrations/codex/callback-proxy.ts
import assert from 'node:assert/strict'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
function trustedServiceUrl(value, path) {
  assert(value && !/[\s\\]/.test(value), 'Invalid service URL')
  const url = new URL(value)
  assert.equal(
    value.split('://')[1]?.split('/')[0],
    url.host,
    'Service authority must be canonical',
  )
  assert(
    !url.username && !url.password && !url.search && !url.hash,
    'Service URL must not contain secrets or extra components',
  )
  assert(
    url.protocol === 'https:' ||
      (url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port),
    'Use HTTPS or explicit 127.0.0.1 loopback HTTP',
  )
  if (path !== undefined) assert.equal(url.pathname, path)
  return url
}
function equalSecret(left, right) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}
function validateConsentLocation(raw, webOrigin) {
  const url = new URL(raw)
  assert.equal(url.origin, webOrigin, 'Unexpected consent origin')
  assert.equal(url.pathname, '/oauth/consent', 'Unexpected consent path')
  assert(!url.username && !url.password && !url.hash)
  assert.deepEqual(
    [...url.searchParams.keys()],
    ['tx'],
    'Consent return URL must contain only its transaction',
  )
  assert(
    /^[A-Za-z0-9._-]{1,256}$/.test(url.searchParams.get('tx') ?? ''),
    'Invalid consent transaction',
  )
  return raw
}
function validateAuthorizationUrl(raw, options) {
  const url = new URL(raw)
  assert.equal(url.origin, new URL(options.issuer).origin)
  assert.equal(url.pathname, '/oauth/authorize')
  assert(!url.username && !url.password && !url.hash)
  for (const key of [
    'redirect_uri',
    'resource',
    'scope',
    'state',
    'code_challenge',
    'code_challenge_method',
  ])
    assert.equal(url.searchParams.getAll(key).length, 1, 'Ambiguous authorization parameters')
  assert.deepEqual(
    url.searchParams.getAll('redirect_uri'),
    [options.redirectUri],
    'CLI did not preserve the proxy callback',
  )
  assert.deepEqual(url.searchParams.getAll('resource'), [options.resource])
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert(url.searchParams.get('code_challenge'))
  assert.deepEqual(
    (url.searchParams.get('scope') ?? '').split(' ').sort(),
    [...options.scopes].sort(),
  )
  const state = url.searchParams.get('state')
  assert(state.length > 0 && state.length <= 1024, 'Invalid authorization state')
  return state
}
function validateCallback(request, options) {
  assert.equal(request.method, 'GET')
  assert.equal(request.hostCount, 1)
  assert.equal(request.host, new URL(options.outerOrigin).host)
  assert(request.originCount <= 1)
  if (request.origin !== undefined)
    assert(
      [options.webOrigin, new URL(options.issuer).origin].includes(request.origin),
      'Unexpected callback Origin',
    )
  assert(
    request.target.startsWith('/') &&
      !request.target.startsWith('//') &&
      request.target.length <= 8192,
  )
  const url = new URL(request.target, options.outerOrigin)
  assert.equal(url.origin, options.outerOrigin)
  assert.equal(url.pathname, options.path)
  assert(!url.hash)
  const keys = [...url.searchParams.keys()]
  assert.equal(new Set(keys).size, keys.length, 'Duplicate callback parameters')
  assert(
    keys.every((key) =>
      ['code', 'state', 'iss', 'error', 'error_description', 'error_uri'].includes(key),
    ),
  )
  assert.deepEqual(url.searchParams.getAll('iss'), [options.issuer], 'Issuer mismatch')
  const state = url.searchParams.get('state')
  assert(state !== null && equalSecret(state, options.state), 'State mismatch')
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  assert(
    (Boolean(code) && error === null) || (Boolean(error) && code === null),
    'Callback needs exactly one code or error',
  )
  if (code !== null)
    assert(!url.searchParams.has('error_description') && !url.searchParams.has('error_uri'))
  return { denied: error === 'access_denied', error: error !== null }
}
function headers(response) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Connection', 'close')
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  )
}
function failurePage(response, status) {
  if (response.destroyed || response.writableEnded) return
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
  response.end(
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TQX</title><style>body{background:#0a0a0a;color:#f5f5f5;font:16px system-ui;padding:8vh 8vw}main{max-width:36rem;margin:auto;border:1px solid #303030;border-radius:16px;padding:2rem}h1{color:#f5c542;letter-spacing:.12em}p{color:#b8b8b8;line-height:1.7}</style><main><h1>TQX</h1><p>&#36830;&#25509;&#32467;&#26524;&#26410;&#30830;&#35748;&#12290;</p><p>&#35831;&#36820;&#22238;&#21407; TQX &#39029;&#38754;&#26680;&#23545;&#65292;&#19981;&#35201;&#37325;&#22797;&#21457;&#36215;&#30331;&#24405;&#12290;</p></main></html>',
  )
}
async function createCallbackProxy(options) {
  assert(options.timeoutMs >= 1000 && options.timeoutMs <= 600000)
  trustedServiceUrl(options.issuer, '/')
  assert.equal(trustedServiceUrl(options.webOrigin, '/').origin, options.webOrigin)
  const path = `/tqx/codex/callback/${randomBytes(16).toString('hex')}`
  let outerOrigin = ''
  let state
  let consentUrl
  let forwarded = false
  let outcome
  let activeResponse
  let resolveCompletion
  const completion = new Promise((resolve) => {
    resolveCompletion = resolve
  })
  const lifetime = new AbortController()
  const finish = (status, cliExitCode) => {
    if (outcome) return
    outcome = {
      status,
      cliExitCode,
      forwarded,
    }
    resolveCompletion(outcome)
  }
  const timer = setTimeout(() => {
    lifetime.abort()
    if (activeResponse) failurePage(activeResponse, 504)
    finish(forwarded ? 'unknown' : 'timed_out', null)
  }, options.timeoutMs)
  const handle = async (request, response) => {
    headers(response)
    if (outcome || forwarded) {
      failurePage(response, 409)
      return
    }
    if (!state || !consentUrl) {
      failurePage(response, 503)
      return
    }
    let denied
    let errorCallback
    try {
      const result = validateCallback(
        {
          method: request.method,
          target: request.url ?? '',
          host: request.headers.host,
          hostCount: request.rawHeaders.filter(
            (_, index) => index % 2 === 0 && request.rawHeaders[index]?.toLowerCase() === 'host',
          ).length,
          origin: request.headers.origin,
          originCount: request.rawHeaders.filter(
            (_, index) => index % 2 === 0 && request.rawHeaders[index]?.toLowerCase() === 'origin',
          ).length,
        },
        { outerOrigin, path, state, issuer: options.issuer, webOrigin: options.webOrigin },
      )
      denied = result.denied
      errorCallback = result.error
    } catch {
      failurePage(response, 400)
      return
    }
    forwarded = true
    activeResponse = response
    try {
      await options.deliverCallback(`${outerOrigin}${request.url}`)
      if (errorCallback) {
        const code = await options.waitForCliExit()
        if (outcome) return
        failurePage(response, denied ? 400 : 502)
        finish(denied ? 'denied' : code === null ? 'unknown' : 'failed', code)
        return
      }
      const code = await options.waitForCliExit()
      if (outcome) return
      if (!denied && code === 0) {
        response.writeHead(303, { Location: consentUrl })
        response.end()
        finish('succeeded', code)
      } else {
        failurePage(response, denied ? 400 : 502)
        finish(denied ? 'denied' : code === null ? 'unknown' : 'failed', code)
      }
    } catch {
      failurePage(response, 502)
      finish('unknown', null)
    } finally {
      activeResponse = undefined
    }
  }
  const server = createServer((request, response) => {
    handle(request, response).catch(() => {
      failurePage(response, 502)
      finish('unknown', null)
    })
  })
  server.headersTimeout = 5000
  server.requestTimeout = 1e4
  server.keepAliveTimeout = 1000
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    assert(address && typeof address === 'object')
    outerOrigin = `http://127.0.0.1:${address.port}`
  } catch (error) {
    clearTimeout(timer)
    throw error
  }
  let closed = false
  return {
    redirectUri: `${outerOrigin}${path}`,
    completion,
    bind(expectedState, originalConsentUrl) {
      assert(!state && !outcome && expectedState.length > 0 && expectedState.length <= 1024)
      consentUrl = validateConsentLocation(originalConsentUrl, options.webOrigin)
      state = expectedState
    },
    cliExited(code) {
      if (!forwarded) finish('failed', code)
    },
    cancel() {
      lifetime.abort()
      if (activeResponse) failurePage(activeResponse, 503)
      finish(forwarded ? 'unknown' : 'cancelled', null)
    },
    async close() {
      if (closed) return
      closed = true
      clearTimeout(timer)
      lifetime.abort()
      state = undefined
      consentUrl = undefined
      await new Promise((resolve) => {
        const force = setTimeout(() => {
          server.closeAllConnections()
        }, 1000)
        server.close(() => {
          clearTimeout(force)
          resolve()
        })
        server.closeIdleConnections()
      })
    },
  }
}

// packages/mcp-server/integrations/codex/owned-process.ts
import assert2 from 'node:assert/strict'
function exited(child) {
  return !child.pid || child.exitCode !== null || child.signalCode !== null
}
async function waitForExit(child, milliseconds) {
  const deadline = Date.now() + milliseconds
  while (!exited(child) && Date.now() < deadline) await new Promise((done) => setTimeout(done, 25))
}
async function closeOwnedProcess(child) {
  if (!exited(child)) {
    child.stdin.end()
    await waitForExit(child, 1500)
  }
  if (!exited(child)) {
    child.kill()
    await waitForExit(child, 1500)
  }
  assert2(exited(child), 'Owned client process did not exit; stop acceptance and inspect its PID')
  child.stdin.destroy()
  child.stdout.destroy()
  child.stderr.destroy()
  child.unref()
}

// packages/mcp-server/integrations/codex/callback-login.ts
function boundedExit(exit, milliseconds) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), milliseconds)
    exit.then((code) => {
      clearTimeout(timer)
      resolve(code)
    })
  })
}
async function startCallbackLogin(options) {
  assert3(/^[A-Za-z0-9_-]{1,64}$/.test(options.server), 'Invalid server name')
  trustedServiceUrl(options.resource, '/mcp')
  trustedServiceUrl(options.issuer, '/')
  assert3.equal(trustedServiceUrl(options.webOrigin, '/').origin, options.webOrigin)
  const timeoutMs = options.timeoutMs ?? 300000
  assert3(timeoutMs >= 1e4 && timeoutMs <= 600000, 'Timeout must be 10 to 600 seconds')
  const metadataResponse = await fetch(
    new URL('/.well-known/oauth-authorization-server', options.issuer),
    { redirect: 'manual', signal: AbortSignal.timeout(5000) },
  )
  assert3.equal(metadataResponse.status, 200, 'Authorization metadata unavailable')
  const metadata = await metadataResponse.json()
  assert3.equal(metadata.issuer, options.issuer, 'Metadata issuer mismatch')
  assert3.equal(
    metadata.authorization_response_iss_parameter_supported,
    true,
    'Issuer-bound callbacks are required',
  )
  assert3.equal(metadata.authorization_endpoint, new URL('/oauth/authorize', options.issuer).href)
  let resolveExit
  const exit = new Promise((ok) => {
    resolveExit = ok
  })
  const proxy = await createCallbackProxy({
    issuer: options.issuer,
    webOrigin: options.webOrigin,
    timeoutMs,
    waitForCliExit: () => boundedExit(exit, 15000),
    deliverCallback: (originalCallbackUrl) =>
      new Promise((ok, fail) => {
        child.stdin.write(
          `${originalCallbackUrl}
`,
          (error) => (error ? fail(new Error('CLI callback input failed')) : ok()),
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
      'trade:read,order:write',
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
  const onExit = (code) => {
    if (exited) return
    exited = true
    resolveExit(code)
    proxy.cliExited(code)
  }
  child.once('exit', onExit)
  child.once('error', () => onExit(null))
  child.stdin.on('error', () => onExit(null))
  const collect = (chunk) => {
    output = (output + chunk.toString()).slice(-262144)
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  let cleanupTask
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
    let authorization
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
        } catch {}
      }
      if (authorization) break
      await new Promise((ok) => setTimeout(ok, 25))
    }
    assert3(authorization, 'CLI authorization URL unavailable')
    const state = validateAuthorizationUrl(authorization.href, {
      issuer: options.issuer,
      resource: options.resource,
      redirectUri: proxy.redirectUri,
      scopes: ['trade:read', 'order:write'],
    })
    const begin = await fetch(authorization, {
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    })
    assert3.equal(begin.status, 302, 'Authorization begin did not return consent')
    const location = begin.headers.get('location')
    await begin.body?.cancel()
    assert3(location)
    const consentUrl = validateConsentLocation(location, options.webOrigin)
    assert3(!exited, 'CLI exited before the consent handoff')
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
  const values = new Map()
  const args = process.argv.slice(2)
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    assert3(
      [
        '--server',
        '--mcp-url',
        '--issuer',
        '--web-origin',
        '--timeout-seconds',
        '--codex-bin',
      ].includes(key) &&
        !values.has(key) &&
        args[index + 1],
      'Invalid helper arguments',
    )
    values.set(key, args[index + 1])
  }
  const get = (key) => {
    const value = values.get(key)
    assert3(value, `Missing ${key}`)
    return value
  }
  const timeoutMs = Number(values.get('--timeout-seconds') ?? '300') * 1000
  const login = await startCallbackLogin({
    server: get('--server'),
    resource: get('--mcp-url'),
    issuer: get('--issuer'),
    webOrigin: get('--web-origin'),
    timeoutMs,
    ...(values.has('--codex-bin') ? { codexBinary: values.get('--codex-bin') } : {}),
  })
  const interrupt = () => {
    login.cancel()
  }
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', interrupt)
  try {
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
  main().catch(() => {
    console.error(
      'TQX login helper failed; connection is not confirmed. No automatic retry was started.',
    )
    process.exitCode = 1
  })
}
export { startCallbackLogin }
