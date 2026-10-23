import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { CodexClient, type RecordValue } from './client'
import { syntheticFixture } from './synthetic-fixture'

const repo = resolve(import.meta.dirname, '../..')
const runs = resolve(repo, 'work/codex/runs')
await mkdir(runs, { recursive: true })
const home = await mkdtemp(resolve(runs, 'refresh-probe-'))
const fixture = await syntheticFixture(repo)
await writeFile(
  resolve(home, 'config.toml'),
  `mcp_oauth_credentials_store = "file"\n[mcp_servers.tqx]\nurl = ${JSON.stringify(fixture.resource)}\nscopes = ["trade:read"]\n`,
)
let client = new CodexClient(home, home)
try {
  await client.initialize()
  const login = await client.request('mcpServer/oauth/login', {
    name: 'tqx',
    scopes: ['trade:read'],
  })
  const authorization = await fetch(String(login.authorizationUrl), {
    redirect: 'manual',
  })
  assert.equal(authorization.status, 302)
  const callback = authorization.headers.get('location')
  assert(callback)
  await fetch(callback).then((r) => r.body?.cancel())
  assert.equal((await client.loginCompletion(login.loginId)).success, true)
  await client.close()
  const path = resolve(home, '.credentials.json')
  const saved = JSON.parse(await readFile(path, 'utf8')) as Record<string, { expires_at: number }>
  assert.equal(Object.keys(saved).length, 1)
  for (const credential of Object.values(saved)) credential.expires_at = 1
  await writeFile(path, JSON.stringify(saved))
  client = new CodexClient(home, home)
  await client.initialize()
  const thread = await client.request('thread/start', {
    cwd: home,
    ephemeral: true,
    approvalPolicy: 'never',
  })
  const result = await client.request('mcpServer/tool/call', {
    threadId: (thread.thread as RecordValue).id,
    server: 'tqx',
    tool: 'getAccount',
    arguments: {},
  })
  assert(!result.isError)
  assert.equal(fixture.state.refreshRequests.length, 1)
  const evidence = {
    case: 'actual-codex-synthetic-refresh-request',
    pass: true,
    forcedLocalExpiry: true,
    request: fixture.state.refreshRequests[0],
    dcrFieldNames: fixture.state.registrationFieldNames[0],
    dcrMetadata: fixture.state.registrationRequests[0],
    dcrFieldTypes: Object.fromEntries(
      Object.entries(fixture.state.registrationRequests[0] ?? {}).map(([key, value]) => [
        key,
        Array.isArray(value) ? 'array' : typeof value,
      ]),
    ),
    identity: 'synthetic',
  }
  await writeFile(resolve(home, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(JSON.stringify(evidence))
} finally {
  await client.close()
  await fixture.close()
}
