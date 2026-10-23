import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose'

const ACCESS = 'urn:ietf:params:oauth:token-type:access_token'
const EXCHANGE = 'urn:ietf:params:oauth:grant-type:token-exchange'
async function body(req: IncomingMessage) {
  let result = ''
  for await (const chunk of req) result += String(chunk)
  assert(result.length < 65_536)
  return result
}
function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data))
}
async function listen(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert(address && typeof address !== 'string')
  return `http://127.0.0.1:${address.port}`
}
export async function syntheticFixture(repo: string) {
  const keys = await generateKeyPair('RS256')
  const publicKey = {
    ...(await exportJWK(keys.publicKey)),
    kid: 'codex-synthetic',
    alg: 'RS256',
    use: 'sig',
  }
  const secret = randomUUID()
  const clients = new Map<string, string[]>()
  clients.set('synthetic-public-client', ['http://127.0.0.1/callback'])
  const codes = new Map<string, URLSearchParams>()
  const sourceTokens = new Set<string>()
  const refreshTokens = new Map<string, Record<string, unknown>>()
  const state = {
    issuerBound: true,
    cimd: false,
    callback: 'valid',
    asUnavailable: false,
    tradingUnavailable: false,
    revoked: false,
    holdExchange: false,
    heldExchanges: 0,
    tokenRequests: 0,
    exchanges: 0,
    tradingCalls: 0,
    dcr: [] as string[][],
    registrationRequests: [] as Record<string, unknown>[],
    registrationFieldNames: [] as string[][],
    refreshRequests: [] as Record<string, unknown>[],
  }
  let issuer = ''
  let resource = ''
  let apiResource = ''
  const sign = (payload: Record<string, unknown>) =>
    new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'codex-synthetic' })
      .sign(keys.privateKey)
  const as = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', issuer)
      if (url.pathname === '/.well-known/jwks.json') return json(res, { keys: [publicKey] })
      if (url.pathname === '/.well-known/oauth-authorization-server')
        return json(res, {
          issuer,
          authorization_endpoint: `${issuer}/oauth/authorize`,
          token_endpoint: `${issuer}/oauth/token`,
          registration_endpoint: `${issuer}/oauth/register`,
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          token_endpoint_auth_methods_supported: ['none'],
          code_challenge_methods_supported: ['S256'],
          scopes_supported: ['research:read', 'trade:read', 'order:write'],
          authorization_response_iss_parameter_supported: state.issuerBound,
          client_id_metadata_document_supported: state.cimd,
        })
      if (url.pathname === '/oauth/register') {
        const input = JSON.parse(await body(req)) as {
          redirect_uris: string[]
          [key: string]: unknown
        }
        state.registrationFieldNames.push(Object.keys(input).sort())
        state.registrationRequests.push(
          Object.fromEntries(
            [
              'client_name',
              'application_type',
              'redirect_uris',
              'token_endpoint_auth_method',
              'grant_types',
              'response_types',
              'scope',
            ].map((key) => [key, input[key]]),
          ),
        )
        const id = randomUUID()
        clients.set(id, input.redirect_uris)
        state.dcr.push(input.redirect_uris)
        return json(
          res,
          {
            client_id: id,
            redirect_uris: input.redirect_uris,
            token_endpoint_auth_method: 'none',
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
          },
          201,
        )
      }
      if (url.pathname === '/oauth/authorize') {
        const p = url.searchParams
        assert.equal(p.get('scope'), 'trade:read')
        assert.equal(p.get('resource'), resource)
        assert.equal(p.get('code_challenge_method'), 'S256')
        const callback = new URL(p.get('redirect_uri') ?? '')
        assert.equal(callback.hostname, '127.0.0.1')
        assert(callback.port)
        if (state.cimd && p.get('client_id')?.startsWith('https://chatgpt.com/oauth/codex/')) {
          // Observe Codex selection only; this synthetic AS does not fetch/validate CIMD.
          const expected = state.issuerBound
            ? 'https://chatgpt.com/oauth/codex/client.json'
            : `https://chatgpt.com/oauth/codex/${callback.pathname.split('/').at(-1)}/client.json`
          assert.equal(p.get('client_id'), expected)
          clients.set(expected, [`http://127.0.0.1${callback.pathname}`])
        }
        assert(
          clients.get(p.get('client_id') ?? '')?.some((registered) => {
            const u = new URL(registered)
            return (
              u.origin.replace(/:\d+$/, '') === callback.origin.replace(/:\d+$/, '') &&
              u.pathname === callback.pathname &&
              u.search === callback.search
            )
          }),
        )
        if (state.callback === 'deny') callback.searchParams.set('error', 'access_denied')
        else {
          const code = randomUUID()
          codes.set(code, p)
          callback.searchParams.set('code', code)
        }
        callback.searchParams.set('state', p.get('state') ?? '')
        if (state.callback === 'wrong-state')
          callback.searchParams.set('state', 'synthetic-invalid-state')
        if (state.callback !== 'missing-iss' && state.issuerBound)
          callback.searchParams.set(
            'iss',
            state.callback === 'wrong-iss' ? `${issuer}/wrong` : issuer,
          )
        if (state.callback === 'duplicate-iss') callback.searchParams.append('iss', issuer)
        res.writeHead(302, { location: callback.toString() }).end()
        return
      }
      if (url.pathname === '/oauth/token') {
        const form = new URLSearchParams(await body(req))
        if (form.get('grant_type') === 'refresh_token') {
          state.refreshRequests.push({
            fieldNames: [...form.keys()].sort(),
            fieldTypes: Object.fromEntries([...form.keys()].map((key) => [key, 'string'])),
            scope: form.get('scope'),
            resource: form.get('resource'),
            authenticationScheme: req.headers.authorization?.split(' ')[0] ?? 'none',
          })
          const original = refreshTokens.get(form.get('refresh_token') ?? '')
          if (!original) return json(res, { error: 'invalid_grant' }, 400)
          assert.equal(form.get('client_id'), original.client_id)
          assert.equal(form.get('resource'), resource)
          assert.equal(form.get('scope'), 'trade:read')
          const now = Math.floor(Date.now() / 1000)
          const payload = {
            ...original,
            sid: randomUUID(),
            jti: randomUUID(),
            iat: now,
            exp: now + 300,
          }
          const access_token = await sign(payload)
          const refresh_token = `refresh_${randomUUID()}`
          refreshTokens.delete(form.get('refresh_token') ?? '')
          refreshTokens.set(refresh_token, payload)
          sourceTokens.add(access_token)
          return json(res, {
            access_token,
            refresh_token,
            token_type: 'Bearer',
            expires_in: 300,
            scope: 'trade:read',
          })
        }
        if (form.get('grant_type') === EXCHANGE) {
          state.exchanges++
          if (state.holdExchange) {
            state.heldExchanges++
            res.once('close', () => {
              state.heldExchanges--
            })
            return
          }
          if (state.asUnavailable) return json(res, { error: 'temporarily_unavailable' }, 503)
          if (state.revoked) return json(res, { error: 'invalid_grant' }, 400)
          assert.equal(
            req.headers.authorization,
            `Basic ${Buffer.from(`tqx_mcp_server:${secret}`).toString('base64')}`,
          )
          assert.equal(form.get('resource'), apiResource)
          const token = form.get('subject_token') ?? ''
          assert(sourceTokens.has(token))
          const { payload: source } = await jwtVerify(token, keys.publicKey, {
            issuer,
            audience: resource,
          })
          const now = Math.floor(Date.now() / 1000)
          const exp = Math.min(now + 60, source.exp ?? 0)
          const access_token = await sign({
            ...source,
            aud: apiResource,
            source_client_id: source.client_id,
            client_id: 'tqx_mcp_server',
            act: { sub: 'tqx_mcp_server' },
            jti: randomUUID(),
            iat: now,
            exp,
          })
          return json(res, {
            access_token,
            issued_token_type: ACCESS,
            token_type: 'Bearer',
            expires_in: exp - now,
            scope: 'trade:read',
          })
        }
        state.tokenRequests++
        const p = codes.get(form.get('code') ?? '')
        if (!p) return json(res, { error: 'invalid_grant' }, 400)
        codes.delete(form.get('code') ?? '')
        assert.equal(form.get('client_id'), p.get('client_id'))
        assert.equal(form.get('redirect_uri'), p.get('redirect_uri'))
        assert.equal(form.get('resource'), resource)
        assert.equal(
          createHash('sha256')
            .update(form.get('code_verifier') ?? '')
            .digest('base64url'),
          p.get('code_challenge'),
        )
        const now = Math.floor(Date.now() / 1000)
        const payload = {
          iss: issuer,
          aud: resource,
          sub: '9007199254740993',
          client_id: form.get('client_id'),
          agent_id: 'synthetic-agent',
          grant_id: randomUUID(),
          sid: randomUUID(),
          jti: randomUUID(),
          iat: now,
          exp: now + 300,
          scope: 'trade:read',
        }
        const access_token = await sign(payload)
        const refresh_token = `refresh_${randomUUID()}`
        refreshTokens.set(refresh_token, payload)
        sourceTokens.add(access_token)
        return json(res, {
          access_token,
          refresh_token,
          token_type: 'Bearer',
          expires_in: 300,
          scope: 'trade:read',
        })
      }
      json(res, { error: 'not_found' }, 404)
    })().catch(() => json(res, { error: 'synthetic_fixture_rejected' }, 400))
  })
  issuer = await listen(as)
  const trading = createServer((req, res) => {
    void (async () => {
      state.tradingCalls++
      if (state.tradingUnavailable)
        return json(res, { code: 'unavailable', message: 'synthetic', data: null }, 503)
      const token = req.headers.authorization?.slice(7) ?? ''
      assert(!sourceTokens.has(token))
      await jwtVerify(token, keys.publicKey, { issuer, audience: apiResource })
      const data = req.url?.startsWith('/openapi/v1/trading/account')
        ? {
            account_id: 'synthetic-account',
            mode: 'PAPER',
            base_currency: 'USD',
            total_assets: '9007199254740993.123456',
            cash: null,
            available_cash: '10.00',
            frozen_cash: null,
            buying_power: '10.00',
            market_value: '0',
            unrealized_pnl: null,
            as_of: '2026-10-23T00:00:00Z',
            is_stale: true,
          }
        : { items: [], next_cursor: null }
      json(res, {
        code: '0',
        message: 'ok',
        data,
        request_id: 'synthetic',
        timestamp: 1,
      })
    })().catch(() => json(res, { error: 'invalid_token' }, 401))
  })
  const tradingBase = await listen(trading)
  apiResource = `${tradingBase}/api`
  const reservation = createServer()
  resource = `${await listen(reservation)}/mcp`
  await new Promise<void>((resolve) => reservation.close(() => resolve()))
  const mcp = spawn(process.env.TQX_NODE_BIN ?? 'node', [resolve(repo, 'dist/index.mjs')], {
    cwd: repo,
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      TQX_BASE_URL: tradingBase,
      MCP_HOST: '127.0.0.1',
      MCP_PORT: new URL(resource).port,
      MCP_RESOURCE: resource,
      MCP_ALLOWED_HOSTS: new URL(resource).host,
      MCP_ALLOWED_ORIGINS: new URL(resource).origin,
      MCP_OAUTH_ISSUER: issuer,
      MCP_JWKS_URL: `${issuer}/.well-known/jwks.json`,
      MCP_TRADING_TOOLS_ENABLED: 'true',
      MCP_EXCHANGE_CLIENT_SECRET: secret,
      MCP_API_RESOURCE: apiResource,
      MCP_TRADING_BASE_URL: tradingBase,
    },
  })
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${new URL(resource).origin}/healthz`)).ok) break
    } catch {
      /* bounded startup */
    }
    assert(mcp.exitCode === null, 'MCP exited before health check')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return {
    state,
    issuer,
    resource,
    async close() {
      mcp.kill('SIGTERM')
      await Promise.race([
        new Promise<void>((resolve) => mcp.once('exit', () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 1500)),
      ])
      for (const server of [as, trading]) {
        server.closeAllConnections()
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
    },
  }
}
