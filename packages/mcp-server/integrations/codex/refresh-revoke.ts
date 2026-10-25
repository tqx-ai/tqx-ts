import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from 'jose'
import { CodexClient, type RecordValue } from './client'
import { assertLiveIntegrationAllowed } from './local-policy'

assertLiveIntegrationAllowed()

// Authorized only for a home freshly created by owner-environment.ts and the
// Owner's isolated synthetic grant. No real login or global credential changes.
const repo = resolve(import.meta.dirname, '../..')
const root = resolve(repo, 'work/codex/runs')
const home = resolve(process.argv[2] ?? '')
assert(home.startsWith(`${root}${sep}`), 'Require a run home inside ignored work/codex/runs')
const fixturesPath = process.env.TQX_CODEX_SYNTHETIC_FIXTURES
assert(fixturesPath)
const fixture = JSON.parse(await readFile(fixturesPath, 'utf8')) as {
  synthetic: boolean
  users: { uid: string; agentId: string }[]
}
assert.equal(fixture.synthetic, true)
const user = fixture.users[0]
assert(user)
const resource = 'http://127.0.0.1:3002/mcp'
const issuer = 'http://127.0.0.1:26823'
const credentialsPath = resolve(home, '.credentials.json')
type Credential = {
  server_name: string
  server_url: string
  issuer: string
  client_id: string
  access_token: string
  expires_at: number
  refresh_token: string
}
async function credentials() {
  const document = JSON.parse(await readFile(credentialsPath, 'utf8')) as Record<string, Credential>
  const matches = Object.values(document).filter(
    (item) => item.server_name === 'tqx' && item.server_url === resource && item.issuer === issuer,
  )
  assert.equal(matches.length, 1)
  const credential = matches[0]
  assert(credential)
  return { document, credential }
}
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))
async function claims(token: string, audience: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    audience,
    algorithms: ['RS256'],
  })
  assert.equal(payload.sub, user?.uid)
  assert.equal(payload.agent_id, user?.agentId)
  assert.equal(payload.scope, 'trade:read')
  return payload
}
const initial = await credentials()
const before = await claims(initial.credential.access_token, resource)
assert.equal(before.client_id, initial.credential.client_id)
const derivedFixture = JSON.parse(
  await readFile(resolve(home, 'derived.private.json'), 'utf8'),
) as { synthetic: boolean; access_token: string }
assert.equal(derivedFixture.synthetic, true)
const derived = await claims(derivedFixture.access_token, 'http://127.0.0.1:8100/api')
assert.equal(derived.sid, before.sid)
assert.equal(derived.grant_id, before.grant_id)
assert.equal(derived.source_client_id, before.client_id)
assert.equal(derived.client_id, 'tqx_mcp_server')
// A control read proves the old derived fixture is usable before refresh.
const oldDerivedRead = async () => {
  const response = await fetch('http://127.0.0.1:8100/openapi/v1/trading/account', {
    headers: { Authorization: `Bearer ${derivedFixture.access_token}` },
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
  })
  await response.body?.cancel()
  return response
}
assert.equal((await oldDerivedRead()).status, 200)
initial.credential.expires_at = 1
await writeFile(credentialsPath, JSON.stringify(initial.document))
const evidence: RecordValue[] = [
  {
    case: 'forced-local-cache-expiry',
    pass: true,
    affectsOnlyIsolatedCodexHome: true,
  },
]
const client = new CodexClient(home, home)
try {
  await client.initialize()
  const thread = await client.request('thread/start', {
    cwd: home,
    ephemeral: true,
    approvalPolicy: 'never',
  })
  const threadId = (thread.thread as RecordValue).id
  const call = (tool: string) =>
    client.request('mcpServer/tool/call', {
      threadId,
      server: 'tqx',
      tool,
      arguments: {},
    })
  assert(!(await call('getAccount')).isError)
  assert(!(await call('listPositions')).isError)
  let afterCredential = (await credentials()).credential
  for (
    let i = 0;
    i < 100 && afterCredential.access_token === initial.credential.access_token;
    i++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 20))
    afterCredential = (await credentials()).credential
  }
  assert.notEqual(afterCredential.access_token, initial.credential.access_token)
  const after = await claims(afterCredential.access_token, resource)
  assert.notEqual(after.sid, before.sid)
  assert.notEqual(after.jti, before.jti)
  assert.equal(after.grant_id, before.grant_id)
  assert.equal(after.client_id, before.client_id)
  assert.notEqual(afterCredential.refresh_token, initial.credential.refresh_token)
  const oldSource = await fetch(resource, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${initial.credential.access_token}`,
      'content-type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    signal: AbortSignal.timeout(5000),
  })
  assert.equal(oldSource.status, 401)
  await oldSource.body?.cancel()
  assert.equal((await oldDerivedRead()).status, 401)
  evidence.push({
    case: 'actual-codex-refresh',
    pass: true,
    newSidAndJti: true,
    sameGrantUidAgentClient: true,
    oldSourceStatus: 401,
    oldDerivedStatus: 401,
    bothReadToolsContinue: true,
  })
  const docker = (args: string[]) =>
    new Promise<string>((resolve, reject) =>
      execFile(
        'docker',
        args,
        { windowsHide: true, timeout: 10_000, maxBuffer: 65_536 },
        (error, stdout) => {
          if (error) reject(new Error('Isolated Redis operation failed'))
          else resolve(stdout.trim())
        },
      ),
    )
  const container = 'tqx-mcp-local-integration-redis-1'
  const bindings = JSON.parse(
    await docker(['inspect', '--format', '{{json .NetworkSettings.Ports}}', container]),
  ) as Record<string, { HostIp: string; HostPort: string }[]>
  assert(
    bindings['6379/tcp']?.some(
      (binding) => binding.HostIp === '127.0.0.1' && binding.HostPort === '16379',
    ),
  )
  assert(typeof after.grant_id === 'string' && /^grant_[A-Za-z0-9_-]+$/.test(after.grant_id))
  const revoke = `if redis.call('HGET',KEYS[1],'uid')~=ARGV[1] or redis.call('HGET',KEYS[1],'agent_id')~=ARGV[2] or redis.call('HGET',KEYS[1],'client_id')~=ARGV[3] or redis.call('HGET',KEYS[1],'resource')~=ARGV[4] or redis.call('HGET',KEYS[1],'scope')~='trade:read' or redis.call('HGET',KEYS[1],'status')~='active' then return 0 end return redis.call('HSET',KEYS[1],'status','revoked')+1`
  const revoked = await docker([
    'exec',
    container,
    'redis-cli',
    '-n',
    '0',
    '--raw',
    'EVAL',
    revoke,
    '1',
    `tqx:oauth:grant:${after.grant_id}`,
    user.uid,
    user.agentId,
    String(after.client_id),
    resource,
  ])
  assert.equal(revoked, '1')
  const health = await fetch('http://127.0.0.1:3002/healthz', {
    signal: AbortSignal.timeout(3000),
  })
  assert.equal(health.status, 200)
  await health.body?.cancel()
  const revokedSource = await fetch(resource, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${afterCredential.access_token}`,
      'content-type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    signal: AbortSignal.timeout(5000),
  })
  assert.equal(revokedSource.status, 401)
  await revokedSource.body?.cancel()
  let rejected = false
  let clientFailureSurface = 'unknown'
  try {
    rejected = (await call('getAccount')).isError === true
    clientFailureSurface = 'tool-isError'
  } catch {
    rejected = true
    clientFailureSurface = 'RPC rejection; reason opaque'
  }
  assert(rejected)
  evidence.push({
    case: 'own-synthetic-grant-revocation',
    pass: true,
    singleKeyMutation: true,
    checkedUidAgentClientResourceScope: true,
    actualCodexSubsequentCallRejected: true,
    mcpHealthStatus: 200,
    revokedCurrentSourceStatus: 401,
    clientFailureSurface,
    causeAttribution:
      'Online MCP authorization failure independently confirmed; client reason not classified',
  })
  await writeFile(
    resolve(home, 'refresh-evidence.json'),
    `${JSON.stringify({ surface: 'installed Codex app-server', identity: 'Owner synthetic only', evidence }, null, 2)}\n`,
  )
  console.log(
    `PASS actual Codex refresh and own grant revocation; sanitized evidence: ${resolve(home, 'refresh-evidence.json')}`,
  )
} catch (error) {
  await writeFile(
    resolve(home, 'refresh-failure.private.json'),
    JSON.stringify({ failure: client.lastFailure }),
  )
  throw error
} finally {
  await client.close()
}
