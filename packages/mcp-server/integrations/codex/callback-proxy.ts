import assert from 'node:assert/strict'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

export type CallbackStatus =
  | 'succeeded'
  | 'denied'
  | 'failed'
  | 'unknown'
  | 'timed_out'
  | 'cancelled'
export interface CallbackOutcome {
  status: CallbackStatus
  cliExitCode: number | null
  forwarded: boolean
}
export function trustedServiceUrl(value: string, path?: string): URL {
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
function equalSecret(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}
export function validateConsentLocation(raw: string, webOrigin: string): string {
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
export function validateAuthorizationUrl(
  raw: string,
  options: {
    issuer: string
    resource: string
    redirectUri: string
    scopes: string[]
  },
): string {
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
  const state = url.searchParams.get('state')!
  assert(state.length > 0 && state.length <= 1024, 'Invalid authorization state')
  return state
}
export function validateCallback(
  request: {
    method?: string
    target: string
    host?: string
    hostCount: number
    origin?: string
    originCount: number
  },
  options: { outerOrigin: string; path: string; state: string; issuer: string; webOrigin: string },
): { denied: boolean; error: boolean } {
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
function headers(response: ServerResponse) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Connection', 'close')
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  )
}
function failurePage(response: ServerResponse, status: number) {
  if (response.destroyed || response.writableEnded) return
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
  response.end(
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TQX</title><style>body{background:#0a0a0a;color:#f5f5f5;font:16px system-ui;padding:8vh 8vw}main{max-width:36rem;margin:auto;border:1px solid #303030;border-radius:16px;padding:2rem}h1{color:#f5c542;letter-spacing:.12em}p{color:#b8b8b8;line-height:1.7}</style><main><h1>TQX</h1><p>&#36830;&#25509;&#32467;&#26524;&#26410;&#30830;&#35748;&#12290;</p><p>&#35831;&#36820;&#22238;&#21407; TQX &#39029;&#38754;&#26680;&#23545;&#65292;&#19981;&#35201;&#37325;&#22797;&#21457;&#36215;&#30331;&#24405;&#12290;</p></main></html>',
  )
}
export async function createCallbackProxy(options: {
  issuer: string
  webOrigin: string
  timeoutMs: number
  waitForCliExit: () => Promise<number | null>
  deliverCallback: (originalCallbackUrl: string) => Promise<void>
}) {
  assert(options.timeoutMs >= 1000 && options.timeoutMs <= 600000)
  trustedServiceUrl(options.issuer, '/')
  assert.equal(trustedServiceUrl(options.webOrigin, '/').origin, options.webOrigin)
  const path = `/tqx/codex/callback/${randomBytes(16).toString('hex')}`
  let outerOrigin = ''
  let state: string | undefined
  let consentUrl: string | undefined
  let forwarded = false
  let outcome: CallbackOutcome | undefined
  let activeResponse: ServerResponse | undefined
  let resolveCompletion!: (result: CallbackOutcome) => void
  const completion = new Promise<CallbackOutcome>((resolve) => {
    resolveCompletion = resolve
  })
  const lifetime = new AbortController()
  const finish = (status: CallbackStatus, cliExitCode: number | null) => {
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
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    headers(response)
    if (outcome || forwarded) {
      failurePage(response, 409)
      return
    }
    if (!state || !consentUrl) {
      failurePage(response, 503)
      return
    }
    let denied: boolean
    let errorCallback: boolean
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
      // Only the original registered URL is delivered to the owned CLI's
      // documented --no-browser stdin interface; no arbitrary HTTP proxy exists.
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
    void handle(request, response).catch(() => {
      failurePage(response, 502)
      finish('unknown', null)
    })
  })
  server.headersTimeout = 5000
  server.requestTimeout = 10000
  server.keepAliveTimeout = 1000
  try {
    await new Promise<void>((resolve, reject) => {
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
    bind(expectedState: string, originalConsentUrl: string) {
      assert(!state && !outcome && expectedState.length > 0 && expectedState.length <= 1024)
      consentUrl = validateConsentLocation(originalConsentUrl, options.webOrigin)
      state = expectedState
    },
    cliExited(code: number | null) {
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
      await new Promise<void>((resolve) => {
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
