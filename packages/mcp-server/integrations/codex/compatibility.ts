import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { CodexClient, type RecordValue } from './client'
import { syntheticFixture } from './synthetic-fixture'

const repo = resolve(import.meta.dirname, '../..')
const privateRoot = resolve(repo, 'work/codex/runs')
await mkdir(privateRoot, { recursive: true })
const run = await mkdtemp(resolve(privateRoot, 'compatibility-'))
const evidence: RecordValue[] = []
const fixture = await syntheticFixture(repo)
try {
  const health = await fetch(`${new URL(fixture.resource).origin}/healthz`)
  assert.equal(health.status, 200)
  const unauthenticated = await fetch(fixture.resource, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  assert.equal(unauthenticated.status, 401)
  const challenge = unauthenticated.headers.get('www-authenticate') ?? ''
  const pointer = challenge.match(/resource_metadata="([^"]+)"/)?.[1]
  assert(pointer)
  const metadata = (await (await fetch(pointer)).json()) as RecordValue
  assert.deepEqual(metadata.authorization_servers, [fixture.issuer])
  evidence.push({ case: 'built-node-health-discovery-401', pass: true })
  for (const scenario of [
    {
      name: 'dcr-issuer-bound',
      cimd: false,
      issuerBound: true,
      callback: 'valid',
      success: true,
    },
    {
      name: 'dcr-callback-specific',
      cimd: false,
      issuerBound: false,
      callback: 'valid',
      success: true,
    },
    {
      name: 'cimd-stable-selection',
      issuerBound: true,
      callback: 'valid',
      success: true,
      cimd: true,
    },
    {
      name: 'cimd-specific-selection',
      issuerBound: false,
      callback: 'valid',
      success: true,
      cimd: true,
    },
    {
      name: 'public-preregistered',
      issuerBound: true,
      callback: 'valid',
      success: true,
      registered: true,
    },
    { name: 'deny', issuerBound: true, callback: 'deny', success: false },
    {
      name: 'duplicate-issuer',
      issuerBound: true,
      callback: 'duplicate-iss',
      success: false,
    },
    {
      name: 'wrong-state',
      issuerBound: true,
      callback: 'wrong-state',
      success: false,
    },
    {
      name: 'wrong-issuer',
      issuerBound: true,
      callback: 'wrong-iss',
      success: false,
    },
    {
      name: 'missing-issuer',
      issuerBound: true,
      callback: 'missing-iss',
      success: false,
    },
  ]) {
    fixture.state.issuerBound = scenario.issuerBound
    fixture.state.cimd = scenario.cimd ?? false
    fixture.state.callback = scenario.callback
    const home = resolve(run, scenario.name)
    await mkdir(home, { recursive: true })
    await writeFile(
      resolve(home, 'config.toml'),
      [
        'mcp_oauth_credentials_store = "file"',
        '[mcp_servers.tqx]',
        `url = ${JSON.stringify(fixture.resource)}`,
        'scopes = ["trade:read"]',
        'enabled_tools = ["getAccount", "listPositions"]',
        ...(scenario.registered
          ? [
              '[mcp_servers.tqx.oauth]',
              'client_id = "synthetic-public-client"',
              'callback_url = "http://127.0.0.1/callback"',
            ]
          : []),
        '',
      ].join('\n'),
    )
    const client = new CodexClient(home, home)
    try {
      const init = await client.initialize()
      const previousTokenRequests = fixture.state.tokenRequests
      const login = await client.request('mcpServer/oauth/login', {
        name: 'tqx',
        scopes: ['trade:read'],
        clientRegistration: 'auto',
        timeoutSecs: 12,
      })
      const authUrl = new URL(String(login.authorizationUrl))
      const callback = new URL(authUrl.searchParams.get('redirect_uri') ?? '')
      assert(callback.port)
      if (scenario.issuerBound) assert.equal(callback.pathname, '/callback')
      else assert.match(callback.pathname, /^\/callback\/[A-Za-z0-9_-]+$/)
      const authorization = await fetch(authUrl, { redirect: 'manual' })
      assert.equal(authorization.status, 302)
      const location = authorization.headers.get('location')
      assert(location)
      // Local synthetic consent only. Never invokes Java, a real user or a browser.
      await fetch(location, { signal: AbortSignal.timeout(3000) })
        .then((r) => r.body?.cancel())
        .catch(() => undefined)
      const completed = await client.loginCompletion(login.loginId)
      if (scenario.name !== 'duplicate-issuer') assert.equal(completed.success, scenario.success)
      assert.equal(fixture.state.tokenRequests - previousTokenRequests, completed.success ? 1 : 0)
      const row: RecordValue = {
        case: scenario.name,
        pass: completed.success === scenario.success,
        expectedCallbackAccepted: scenario.success,
        client: init.userAgent,
        registration: scenario.registered ? 'pre-registered public' : 'DCR',
        ...(scenario.cimd
          ? {
              registration: 'CIMD selection only',
              clientId: authUrl.searchParams.get('client_id'),
            }
          : {}),
        redirectHost: callback.hostname,
        redirectPath: callback.pathname,
        redirectUri: `${callback.origin}${callback.pathname}`,
        ...(!scenario.registered && !scenario.cimd
          ? {
              registrationRequest: fixture.state.registrationRequests.at(-1),
              registrationFieldNames: fixture.state.registrationFieldNames.at(-1),
            }
          : {}),
        dynamicPort: true,
        issuerBound: scenario.issuerBound,
        callbackAccepted: completed.success,
      }
      if (scenario.success) {
        const threadResult = await client.request('thread/start', {
          cwd: home,
          ephemeral: true,
          approvalPolicy: 'never',
        })
        const threadId = (threadResult.thread as RecordValue).id
        const inventory = await client.request('mcpServerStatus/list', {
          serverName: 'tqx',
          threadId,
          detail: 'toolsAndAuthOnly',
        })
        const servers = inventory.data as RecordValue[]
        const server = servers.find((s) => s.name === 'tqx')
        assert(server)
        const names = Object.keys(server.tools as RecordValue).sort()
        assert.deepEqual(names, ['getAccount', 'listPositions'])
        const call = async (tool: string) =>
          client.request('mcpServer/tool/call', {
            threadId,
            server: 'tqx',
            tool,
            arguments: {},
          })
        const account = await call('getAccount')
        assert(!account.isError)
        const content = account.content as { text: string }[]
        const data = JSON.parse(content[0]?.text ?? '{}') as RecordValue
        assert.equal(data.mode, 'PAPER')
        assert.equal(data.is_stale, true)
        assert.equal(data.as_of, '2026-10-23T00:00:00Z')
        assert.equal(data.total_assets, '9007199254740993.123456')
        assert.equal(data.cash, null)
        const positions = await call('listPositions')
        assert(!positions.isError)
        row.tools = names
        row.authStatus = server.authStatus
        row.account = {
          mode: data.mode,
          as_of: data.as_of,
          is_stale: data.is_stale,
          decimalAndNullPreserved: true,
        }
        row.structuredContentPresent = account.structuredContent != null
        if (scenario.name === 'dcr-issuer-bound') {
          const failedCall = async () => {
            try {
              return (await call('getAccount')).isError === true
            } catch {
              return true
            }
          }
          fixture.state.tradingUnavailable = true
          assert.equal((await call('getAccount')).isError, true)
          fixture.state.tradingUnavailable = false
          assert(!(await call('getAccount')).isError)
          fixture.state.asUnavailable = true
          assert(await failedCall())
          fixture.state.asUnavailable = false
          assert(!(await call('getAccount')).isError)
          fixture.state.revoked = true
          assert(await failedCall())
          fixture.state.revoked = false
          row.dependencyRecoveryAndRevocation = true
          fixture.state.holdExchange = true
          const interrupted = call('getAccount').then(
            () => false,
            () => true,
          )
          for (let i = 0; i < 50 && fixture.state.heldExchanges === 0; i++)
            await new Promise((resolve) => setTimeout(resolve, 20))
          assert(fixture.state.heldExchanges > 0)
          await client.close()
          assert(await interrupted)
          for (let i = 0; i < 100 && fixture.state.heldExchanges > 0; i++)
            await new Promise((resolve) => setTimeout(resolve, 20))
          assert.equal(fixture.state.heldExchanges, 0)
          fixture.state.holdExchange = false
          const reconnected = new CodexClient(home, home)
          try {
            await reconnected.initialize()
            const thread = await reconnected.request('thread/start', {
              cwd: home,
              ephemeral: true,
              approvalPolicy: 'never',
            })
            const result = await reconnected.request('mcpServer/tool/call', {
              threadId: (thread.thread as RecordValue).id,
              server: 'tqx',
              tool: 'getAccount',
              arguments: {},
            })
            assert(!result.isError)
            row.disconnectedAndReconnectedUsingOwnCachedOAuth = true
          } finally {
            await reconnected.close()
          }
        }
      }
      evidence.push(row)
      console.log(`${row.pass ? 'PASS' : 'COMPATIBILITY GAP'} ${scenario.name}`)
    } finally {
      await client.close()
    }
  }
  await writeFile(
    resolve(run, 'evidence.json'),
    `${JSON.stringify({ identity: 'synthetic', surface: 'isolated installed Codex app-server; desktop UI untested', evidence }, null, 2)}\n`,
  )
  console.log(`Sanitized evidence: ${resolve(run, 'evidence.json')}`)
  if (evidence.some((row) => row.pass === false)) process.exitCode = 1
} finally {
  await fixture.close()
}
