import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

import { account, signal, tradingConfig } from './helpers/trading'

const exec = promisify(execFile)
const appModule = new URL('../src/app.ts', import.meta.url).href
const joseModule = new URL('../node_modules/jose/dist/webapi/index.js', import.meta.url).href

describe('Bun trading runtime', () => {
  it('runs JWT verification, real exchange client, read caching and fresh write exchanges', async () => {
    const { stdout } = await exec('bun', [
      '--no-env-file',
      '-e',
      `
      import { createApp } from ${JSON.stringify(appModule)}
      import { generateKeyPair, exportJWK, SignJWT } from ${JSON.stringify(joseModule)}
      const config = {
        resourceUrl: 'https://mcp.example.test/mcp', issuer: 'https://auth.example.test',
        allowedHosts: ['127.0.0.1'], allowedOrigins: [],
      }
      const keys = await generateKeyPair('RS256')
      const jwk = { ...await exportJWK(keys.publicKey), kid: 'runtime', alg: 'RS256' }
      const now = Math.floor(Date.now() / 1000)
      const token = await new SignJWT({
        iss: config.issuer, aud: config.resourceUrl, sub: 'test-user', client_id: 'test-client',
        sid: 'session', jti: 'test-jti', agent_id: 'agent-1', scope: 'trade:read order:write',
        iat: now, exp: now + 3600,
      }).setProtectedHeader({ alg: 'RS256', kid: 'runtime' }).sign(keys.privateKey)
      let exchanges = 0
      let gatewayCalls = 0
      const fetch = async (url, init) => {
        const value = String(url)
        if (value.endsWith('/.well-known/oauth-authorization-server'))
          return Response.json({ issuer: config.issuer, jwks_uri: config.issuer + '/.well-known/jwks.json' })
        if (value.endsWith('/.well-known/jwks.json')) return Response.json({ keys: [jwk] })
        if (value.endsWith('/oauth/token')) {
          if (!(init.body instanceof URLSearchParams) || init.body.get('subject_token') !== token)
            throw new Error('Invalid exchange form')
          if (new Headers(init.headers).get('Authorization') !== 'Basic ' + btoa('tqx_mcp_server:test-client-secret'))
            throw new Error('Invalid confidential client auth')
          if (init.body.get('resource') !== ${JSON.stringify(tradingConfig.resource)}) throw new Error('Invalid resource')
          exchanges += 1
          return Response.json({ access_token: 'api-token-' + exchanges, token_type: 'Bearer',
            issued_token_type: 'urn:ietf:params:oauth:token-type:access_token', expires_in: 300,
            scope: init.body.get('scope'),
          })
        }
        gatewayCalls += 1
        const authorization = new Headers(init.headers).get('Authorization')
        if (!authorization?.startsWith('Bearer api-token-') || authorization.includes(token))
          throw new Error('MCP token passthrough')
        const data = init.method === 'POST' ? ${JSON.stringify(signal)} : ${JSON.stringify(account)}
        return Response.json({ code: '0', message: 'success', data, request_id: 'runtime-request' })
      }
      const app = createApp({ config, tradingConfig: ${JSON.stringify(tradingConfig)}, fetch,
        trading: { audit: () => undefined }, demoPing: false,
      })
      async function call(name, request) {
        const response = await app.request('http://127.0.0.1/mcp', {
          method: 'POST', headers: {
            Host: '127.0.0.1', Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
            'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': name,
          },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
            name, arguments: { request }, _meta: {
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
              'io.modelcontextprotocol/clientCapabilities': {},
            },
          } }),
        })
        const result = (await response.json()).result
        if (response.status !== 200 || result?.isError) throw new Error('Trading runtime call failed')
        return result.structuredContent
      }
      await call('trading_snapshot', { sections: ['account'] })
      await call('trading_snapshot', { sections: ['account'] })
      if (exchanges !== 1) throw new Error('Read token was not cached')
      const order = { action: 'place', symbol: 'AAPL.US', side: 'BUY', orderType: 'MARKET',
        quantity: '1', idempotencyKey: 'runtime-intent-1' }
      const first = await call('trading_order', order)
      const second = await call('trading_order', order)
      if (first.data.state !== 'ACCEPTED' || second.data.order_status !== null || exchanges !== 3 || gatewayCalls !== 4)
        throw new Error('Incorrect write exchange/state behavior')
      app.dispose()
      console.log('trading-runtime-ok')
    `,
    ])
    expect(stdout.trim()).toBe('trading-runtime-ok')
  })
})
