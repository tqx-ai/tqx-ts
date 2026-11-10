import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

import { testEnvironment } from './helpers/oauth'

const exec = promisify(execFile)
const appModule = new URL('../src/app.ts', import.meta.url).href
const configModule = new URL('../src/config.ts', import.meta.url).href
const entryModule = new URL('../src/index.ts', import.meta.url).href
const joseModule = new URL('../node_modules/jose/dist/webapi/index.js', import.meta.url).href

describe('Bun OAuth runtime', () => {
  it('verifies a real JWT before invoking an MCP tool under Bun', async () => {
    const { stdout } = await exec('bun', [
      '--no-env-file',
      '-e',
      `
      import { createApp } from ${JSON.stringify(appModule)}
      import { loadMcpConfig } from ${JSON.stringify(configModule)}
      import { generateKeyPair, exportJWK, SignJWT } from ${JSON.stringify(joseModule)}
      const config = loadMcpConfig(${JSON.stringify(testEnvironment)})
      const keys = await generateKeyPair('RS256')
      const jwk = { ...await exportJWK(keys.publicKey), kid: 'bun-test', alg: 'RS256' }
      const now = Math.floor(Date.now() / 1000)
      const token = await new SignJWT({
        iss: config.issuer, aud: config.resourceUrl, sub: 'bun-user', client_id: 'bun-client',
        sid: 'session', jti: 'token', scope: 'research:read', iat: now, exp: now + 60,
      }).setProtectedHeader({ alg: 'RS256', kid: 'bun-test' }).sign(keys.privateKey)
      const requests = []
      const app = createApp({ config, fetch: async (url) => {
        requests.push(String(url))
        if (String(url).endsWith('/.well-known/oauth-authorization-server')) {
          return Response.json({ issuer: config.issuer, jwks_uri: config.issuer + '/.well-known/jwks.json' })
        }
        if (String(url).endsWith('/.well-known/jwks.json')) return Response.json({ keys: [jwk] })
        throw new Error('Unexpected OAuth request')
      } })
      const anonymous = await app.request('http://127.0.0.1/mcp', { headers: { Host: '127.0.0.1' } })
      if (anonymous.status !== 401) throw new Error('Expected an authentication challenge')
      const response = await app.request('http://127.0.0.1/mcp', {
        method: 'POST', headers: {
          Host: '127.0.0.1', Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
          'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': 'tqx_ping',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
          name: 'tqx_ping', arguments: { name: 'Bun' }, _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        } }),
      })
      if (response.status !== 200 || (await response.json()).result.content[0].text !== 'pong, Bun') {
        throw new Error('Authenticated MCP request failed')
      }
      if (requests.length !== 2 || requests.some(url => url.includes('/device'))) {
        throw new Error('Unexpected discovery traffic')
      }
      console.log('authenticated')
    `,
    ])
    expect(stdout.trim()).toBe('authenticated')
  })

  it('refuses startup when OAuth configuration is absent', async () => {
    await expect(
      exec('bun', ['--no-env-file', '-e', `await import(${JSON.stringify(entryModule)})`], {
        env: {
          ...process.env,
          TQX_MCP_RESOURCE_URL: '',
          TQX_MCP_OAUTH_ISSUER: '',
          TQX_MCP_ALLOWED_HOSTS: '',
          TQX_MCP_ALLOWED_ORIGINS: '',
        },
      }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('[mcp-config] Invalid or missing TQX_MCP_RESOURCE_URL'),
    })
  })
})
