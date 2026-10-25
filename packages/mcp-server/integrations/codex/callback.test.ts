import { afterEach, describe, expect, it } from 'vitest'
import { createServer, request, type IncomingHttpHeaders } from 'node:http'
import {
  createCallbackProxy,
  trustedServiceUrl,
  validateAuthorizationUrl,
  validateCallback,
  validateConsentLocation,
} from './callback-proxy'

const issuer = 'http://127.0.0.1:26825'
const webOrigin = 'http://127.0.0.1:3000'
const consent = `${webOrigin}/oauth/consent?tx=test-transaction`
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).toReversed()) await cleanup()
})
function get(url: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>(
    (resolve, reject) => {
      const req = request(url, { method: 'GET', headers }, (res) => {
        let body = ''
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body }))
      })
      req.once('error', reject)
      req.end()
    },
  )
}
async function fixture(
  options: { nativeStatus?: number; exit?: () => Promise<number | null>; timeoutMs?: number } = {},
) {
  const attempts: { target: string; headers: IncomingHttpHeaders }[] = []
  const native = createServer((req, res) => {
    attempts.push({ target: req.url!, headers: req.headers })
    res.writeHead(options.nativeStatus ?? 200)
    res.end('native test response')
  })
  await new Promise<void>((ok) => native.listen(0, '127.0.0.1', ok))
  cleanups.push(async () => {
    native.closeAllConnections()
    await new Promise<void>((ok) => native.close(() => ok()))
  })
  const address = native.address()
  if (!address || typeof address === 'string') throw new Error('Missing fixture port')
  const proxy = await createCallbackProxy({
    issuer,
    webOrigin,
    timeoutMs: options.timeoutMs ?? 4000,
    waitForCliExit: options.exit ?? (() => Promise.resolve(0)),
    deliverCallback: async (originalUrl) => {
      const url = new URL(originalUrl)
      const response = await fetch(`http://127.0.0.1:${address.port}${url.pathname}${url.search}`, {
        redirect: 'manual',
      })
      await response.body?.cancel()
      if (response.status >= 500) throw new Error('Synthetic callback delivery failed')
    },
  })
  proxy.bind('expected-state', consent)
  cleanups.push(() => proxy.close())
  const suffix = `?code=opaque%2Bcode&state=expected-state&iss=${encodeURIComponent(issuer)}`
  return { proxy, attempts, url: proxy.redirectUri + suffix, suffix }
}
describe('callback proxy boundaries', () => {
  it('forwards unchanged path/query once, strips ambient credentials and waits for exit 0 before redirect', async () => {
    let resolveExit!: (code: number) => void
    const exit = new Promise<number>((resolve) => {
      resolveExit = resolve
    })
    const { proxy, attempts, url, suffix } = await fixture({ exit: () => exit })
    let finished = false
    const pending = get(url, {
      Origin: webOrigin,
      Cookie: 'synthetic-ambient-cookie',
      Authorization: 'Bearer synthetic-ambient',
    }).then((value) => {
      finished = true
      return value
    })
    for (let i = 0; i < 50 && attempts.length === 0; i++)
      await new Promise((ok) => setTimeout(ok, 5))
    expect(attempts).toHaveLength(1)
    expect(finished).toBe(false)
    expect(attempts[0]!.target).toBe(new URL(proxy.redirectUri).pathname + suffix)
    expect(attempts[0]!.headers.authorization).toBeUndefined()
    expect(attempts[0]!.headers.cookie).toBeUndefined()
    resolveExit(0)
    const response = await pending
    expect(response.status).toBe(303)
    expect(response.headers.location).toBe(consent)
    expect(response.headers['referrer-policy']).toBe('no-referrer')
    expect(await proxy.completion).toMatchObject({
      status: 'succeeded',
      cliExitCode: 0,
      forwarded: true,
    })
    expect((await get(url)).status).toBe(409)
    expect(attempts).toHaveLength(1)
  })
  it.each([
    'wrong-state',
    'wrong-issuer',
    'duplicate-code',
    'duplicate-state',
    'duplicate-issuer',
    'unexpected-key',
    'wrong-nonce',
    'host',
    'origin',
  ])('rejects %s before dispatch without consuming the valid callback', async (kind) => {
    const { proxy, attempts, url } = await fixture()
    const changed = new URL(url)
    const headers: Record<string, string> = {}
    if (kind === 'wrong-state') changed.searchParams.set('state', 'other-state')
    if (kind === 'wrong-issuer') changed.searchParams.set('iss', issuer + '/')
    if (kind.startsWith('duplicate-')) changed.searchParams.append(kind.slice(10), 'duplicate')
    if (kind === 'unexpected-key')
      changed.searchParams.set('return_to', 'https://untrusted.example/')
    if (kind === 'wrong-nonce') changed.pathname += '/'
    if (kind === 'host') headers.Host = 'untrusted.example'
    if (kind === 'origin') headers.Origin = 'https://untrusted.example'
    const response = await get(changed.href, headers)
    expect(response.status).toBe(400)
    expect(response.headers.location).toBeUndefined()
    expect(response.body).not.toContain('expected-state')
    expect(response.body).not.toContain('opaque')
    expect(attempts).toHaveLength(0)
    expect((await get(url)).status).toBe(303)
    expect((await proxy.completion).status).toBe('succeeded')
  })
  it.each([1, null])(
    'never claims success when the native response is 200 but CLI exit is %s',
    async (code) => {
      const { proxy, url } = await fixture({ exit: () => Promise.resolve(code) })
      const response = await get(url)
      expect(response.status).toBe(502)
      expect(response.headers.location).toBeUndefined()
      expect((await proxy.completion).status).toBe(code === null ? 'unknown' : 'failed')
    },
  )
  it.each([200, 400])(
    'keeps denial a denial with native status %s even if a synthetic CLI reports exit 0',
    async (nativeStatus) => {
      const { proxy } = await fixture({ nativeStatus })
      const response = await get(
        `${proxy.redirectUri}?error=access_denied&state=expected-state&iss=${encodeURIComponent(issuer)}`,
      )
      expect(response.status).toBe(400)
      expect(response.headers.location).toBeUndefined()
      expect((await proxy.completion).status).toBe('denied')
    },
  )
  it('never redirects an AS error into a successful-looking consent restore', async () => {
    const { proxy } = await fixture()
    const response = await get(
      `${proxy.redirectUri}?error=temporarily_unavailable&state=expected-state&iss=${encodeURIComponent(issuer)}`,
    )
    expect(response.status).toBe(502)
    expect(response.headers.location).toBeUndefined()
    expect((await proxy.completion).status).toBe('failed')
  })
  it('does not redirect after native failure or when the user never returns', async () => {
    const { proxy, url } = await fixture({ nativeStatus: 503 })
    expect((await get(url)).status).toBe(502)
    expect((await proxy.completion).status).toBe('unknown')
    const waiting = await fixture({ timeoutMs: 1000 })
    expect(await waiting.proxy.completion).toMatchObject({ status: 'timed_out', forwarded: false })
    expect(waiting.attempts).toHaveLength(0)
  })
  it('binds the exact return transaction and exact registration callback', () => {
    expect(validateConsentLocation(consent, webOrigin)).toBe(consent)
    for (const raw of [
      'https://untrusted.example/oauth/consent?tx=test',
      webOrigin + '/oauth/consent?tx=test&return_to=x',
      consent + '#x',
    ])
      expect(() => validateConsentLocation(raw, webOrigin)).toThrow()
    const callback = 'http://127.0.0.1:43210/tqx/codex/callback/' + 'a'.repeat(32)
    const url = new URL('/oauth/authorize', issuer)
    for (const [key, value] of Object.entries({
      state: 'expected-state',
      resource: 'http://127.0.0.1:3004/mcp',
      redirect_uri: callback,
      scope: 'trade:read order:write',
      code_challenge: 'synthetic-challenge',
      code_challenge_method: 'S256',
    }))
      url.searchParams.set(key, value)
    const options = {
      issuer,
      resource: 'http://127.0.0.1:3004/mcp',
      redirectUri: callback,
      scopes: ['trade:read', 'order:write'],
    }
    expect(validateAuthorizationUrl(url.href, options)).toBe('expected-state')
    url.searchParams.set('redirect_uri', callback + '/')
    expect(() => validateAuthorizationUrl(url.href, options)).toThrow()
    expect(() => trustedServiceUrl('http://2130706433:3004/mcp')).toThrow()
    expect(() => trustedServiceUrl('http://localhost:3004/mcp')).toThrow()
    expect(() =>
      validateCallback(
        { method: 'GET', target: '/', host: '127.0.0.1:1', hostCount: 2, originCount: 0 },
        { outerOrigin: 'http://127.0.0.1:1', path: '/', state: 'x', issuer, webOrigin },
      ),
    ).toThrow()
  })
})
