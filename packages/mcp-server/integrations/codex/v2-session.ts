import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose'
import { CodexClient, type RecordValue } from './client'
import { assertLiveIntegrationAllowed, type LivePermit } from './local-policy'
import { expectedTools, loopbackUrl, READ_TOOLS, targetConfig, type ClientTarget } from './target'
import { approveFixtureAuthorization, loginWithInstalledCli } from './v2-oauth'

export interface FixtureUser {
  uid: string
  agentId: string
  webAccessToken: string
}
export interface FixturePrincipal {
  uid: string
  agentId: string
  grantId: string
  sessionId: string
  sourceJti: string
  clientId: string
}
export async function connectV2(
  target: ClientTarget,
  user: FixtureUser,
  runs: string,
  permit?: LivePermit,
  driver: 'app-server' | 'cli' = 'app-server',
) {
  assertLiveIntegrationAllowed(permit)
  assert.equal(target.profile, 'v2')
  assert.equal(runs, permit.runs)
  assert.equal(target.issuer, permit.target.issuer)
  assert.equal(target.resource, permit.target.resource)
  assert.equal(target.apiResource, permit.target.apiResource)
  assert(target.scopes.every((scope) => permit.target.scopes.includes(scope)))
  loopbackUrl(target.issuer, '/')
  loopbackUrl(target.resource, '/mcp')
  loopbackUrl(target.apiResource, '/api')
  await mkdir(runs, { recursive: true })
  const home = await mkdtemp(resolve(runs, 'v2-'))
  for (const directory of ['appdata', 'localappdata', 'tmp'])
    await mkdir(resolve(home, directory), { mode: 0o700 })
  await writeFile(resolve(home, 'config.toml'), targetConfig(target), { flag: 'wx', mode: 0o600 })
  if (driver === 'cli') await loginWithInstalledCli(home, target, user, permit)
  const client = new CodexClient(home, home, permit)
  try {
    await client.initialize()
    if (driver === 'app-server') {
      const login = await client.request('mcpServer/oauth/login', {
        name: 'tqx',
        scopes: target.scopes,
        clientRegistration: 'auto',
        timeoutSecs: 30,
      })
      const redirect = await approveFixtureAuthorization(
        String(login.authorizationUrl),
        target,
        user,
        permit,
      )
      await fetch(redirect, { redirect: 'manual', signal: AbortSignal.timeout(5000) }).then(
        (response) => response.body?.cancel(),
      )
      assert.equal((await client.loginCompletion(login.loginId)).success, true)
    }
    assertLiveIntegrationAllowed(permit)
    const thread = await client.request('thread/start', {
      cwd: home,
      ephemeral: true,
      approvalPolicy: 'never',
    })
    const threadId = (thread.thread as RecordValue).id
    const inventory = await client.request('mcpServerStatus/list', {
      serverName: 'tqx',
      threadId,
      detail: 'toolsAndAuthOnly',
    })
    const server = (inventory.data as RecordValue[]).find((item) => item.name === 'tqx')
    assert(server)
    const tools = server.tools as Record<string, { annotations?: { readOnlyHint?: boolean } }>
    assert.deepEqual(Object.keys(tools).sort(), expectedTools(target))
    for (const [name, tool] of Object.entries(tools))
      assert.equal(
        tool.annotations?.readOnlyHint,
        READ_TOOLS.includes(name as (typeof READ_TOOLS)[number]),
      )
    const jwks = createRemoteJWKSet(new URL('/.well-known/jwks.json', target.issuer), {
      [customFetch]: (url, init) => fetch(url, { ...init, redirect: 'manual' }),
    })
    async function access() {
      const stored = JSON.parse(
        await readFile(resolve(home, '.credentials.json'), 'utf8'),
      ) as Record<
        string,
        { server_name: string; server_url: string; issuer: string; access_token: string }
      >
      const entries = Object.values(stored).filter(
        (item) =>
          item.server_name === 'tqx' &&
          item.server_url === target.resource &&
          item.issuer === target.issuer,
      )
      assert.equal(entries.length, 1)
      const token = entries[0]?.access_token
      assert(token)
      const { payload } = await jwtVerify(token, jwks, {
        issuer: target.issuer,
        audience: target.resource,
        algorithms: ['RS256'],
      })
      assert.equal(payload.sub, user.uid)
      assert.equal(payload.agent_id, user.agentId)
      assert.deepEqual(String(payload.scope).split(' ').sort(), [...target.scopes].sort())
      for (const key of ['sid', 'jti', 'grant_id', 'client_id'])
        assert(typeof payload[key] === 'string' && payload[key])
      const principal: FixturePrincipal = {
        uid: user.uid,
        agentId: user.agentId,
        grantId: String(payload.grant_id),
        sessionId: String(payload.sid),
        sourceJti: String(payload.jti),
        clientId: String(payload.client_id),
      }
      return { token, principal }
    }
    return {
      home,
      tools,
      async principal() {
        return (await access()).principal
      },
      call(tool: string, args: RecordValue) {
        assertLiveIntegrationAllowed(permit)
        return client.request('mcpServer/tool/call', {
          threadId,
          server: 'tqx',
          tool,
          arguments: args,
        })
      },
      async protectedProbe(tool: string, args: RecordValue) {
        assertLiveIntegrationAllowed(permit)
        const { token } = await access()
        const response = await fetch(target.resource, {
          method: 'POST',
          redirect: 'manual',
          signal: AbortSignal.timeout(5000),
          headers: {
            Authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: tool, arguments: args },
          }),
        })
        const body = (await response.json()) as RecordValue
        return { status: response.status, body }
      },
      close: () => client.close(),
    }
  } catch (error) {
    await client.close()
    throw error
  }
}
