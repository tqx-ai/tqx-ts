import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

import { researchConfig, resource, ID } from './helpers/research'
import { testConfig } from './helpers/oauth'

const exec = promisify(execFile)
const appModule = new URL('../src/app.ts', import.meta.url).href

describe('Bun Research runtime', () => {
  it('serves explore and direct call results with the real exchange client under Bun', async () => {
    const { stdout } = await exec('bun', [
      '--no-env-file',
      '-e',
      `
      import { createApp } from ${JSON.stringify(appModule)}
      const config = ${JSON.stringify(testConfig)}
      const researchConfig = ${JSON.stringify(researchConfig)}
      let exchanges = 0
      const app = createApp({ config, tradingConfig: null, researchConfig, demoPing: false,
        verifier: { verifyAccessToken: async (token) => ({ token, clientId: 'bun-client',
          expiresAt: Math.floor(Date.now()/1000)+3600, scopes: ['research:read'], resource: new URL(config.resourceUrl),
          extra: { sub: 'bun-research-user' } }) },
        research: { fetch: async (url, init) => {
          if (String(url).endsWith('/oauth/token')) {
            exchanges += 1
            if (init.body.get('resource') !== researchConfig.resource || init.body.get('scope') !== 'research:read')
              throw new Error('Incorrect Research exchange')
            return Response.json({ access_token: 'bun-research-api', token_type: 'Bearer',
              issued_token_type: 'urn:ietf:params:oauth:token-type:access_token', expires_in: 300,
              scope: init.body.get('scope') })
          }
          if (new Headers(init.headers).get('Authorization') !== 'Bearer bun-research-api')
            throw new Error('Incorrect Research credential')
          if (!String(url).includes('/tqxApi/qube/api/factors/')) throw new Error('Incorrect Research path')
          return Response.json(${JSON.stringify(resource())})
        } },
      })
      async function call(name, args) {
        const response = await app.request('http://127.0.0.1/mcp', {
          method: 'POST', headers: { Host: '127.0.0.1', Authorization: 'Bearer bun-mcp-token',
            'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
            'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': name },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
            name, arguments: args, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28',
              'io.modelcontextprotocol/clientCapabilities': {} } } }),
        })
        const body = await response.json()
        if (response.status !== 200 || body.result?.isError) throw new Error('Research MCP call failed')
        return body.result.structuredContent
      }
      const catalog = await call('tqx_research_explore', {})
      const detail = await call('tqx_research_explore', {action:'strategy.backtest.submit'})
      if (catalog.actions.length !== 43 || !detail.inputSchema.required.includes('strategyId') || exchanges)
        throw new Error('Research discovery failed')
      const args = { action: 'factor.get', input: { factorId: ${JSON.stringify(ID)} } }
      const first = await call('tqx_research_call', args)
      const second = await call('tqx_research_call', args)
      if (first.id !== ${JSON.stringify(ID)} || first.data || second.code || exchanges !== 1)
        throw new Error('Research projection/cache failed')
      app.dispose()
      console.log('research-runtime-ok')
    `,
    ])
    expect(stdout.trim()).toBe('research-runtime-ok')
  })
})
