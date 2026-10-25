import assert from 'node:assert/strict'
import { readFile, writeFile, realpath } from 'node:fs/promises'
import { resolve, sep, basename } from 'node:path'
import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose'
import { CodexClient, type RecordValue } from './client'
import { authorizeLiveIntegration, assertLiveIntegrationAllowed } from './local-policy'
import { connectV2, type FixtureUser } from './v2-session'
import { clientTarget } from './target'

interface Credential {
  server_name: string
  server_url: string
  issuer: string
  client_id: string
  access_token: string
  refresh_token: string
  expires_at: number
}
const action = process.argv[2]
assert(
  action === '--refresh' || action === '--verify-revoked',
  'Select one read-only refresh/revocation phase',
)
const target = clientTarget()
assert.deepEqual(target.scopes, ['trade:read'], 'Refresh acceptance must remain read-only')
const { ready, fixtureData, permit } = await authorizeLiveIntegration(target)
const fixtures = JSON.parse(await readFile(fixtureData, 'utf8')) as {
  generation: string
  fixtureNamespace: string
  users: FixtureUser[]
}
assert.equal(fixtures.generation, ready.generation)
assert.equal(fixtures.fixtureNamespace, ready.fixtureNamespace)
const user = fixtures.users[0]!
assert(user && user.uid && user.agentId)
const jwks = createRemoteJWKSet(new URL('/.well-known/jwks.json', target.issuer), {
  [customFetch]: (url, init) => fetch(url, { ...init, redirect: 'manual' }),
})
async function claims(token: string) {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: target.issuer,
    audience: target.resource,
    algorithms: ['RS256'],
  })
  assert.equal(payload.sub, user.uid)
  assert.equal(payload.agent_id, user.agentId)
  assert.equal(payload.scope, 'trade:read')
  for (const field of ['sid', 'jti', 'grant_id', 'client_id'])
    assert(typeof payload[field] === 'string' && payload[field])
  return payload
}
async function probe(token: string) {
  assertLiveIntegrationAllowed(permit)
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
      params: { name: 'getAccount', arguments: { currency: 'HKD' } },
    }),
  })
  const body = (await response.json()) as RecordValue
  return { status: response.status, body }
}
async function credential(home: string) {
  const path = resolve(home, '.credentials.json')
  const document = JSON.parse(await readFile(path, 'utf8')) as Record<string, Credential>
  const entries = Object.values(document).filter(
    (item) =>
      item.server_name === 'tqx' &&
      item.server_url === target.resource &&
      item.issuer === target.issuer,
  )
  assert.equal(entries.length, 1)
  return { path, document, value: entries[0]! }
}

if (action === '--refresh') {
  const session = await connectV2(target, user, permit.runs, permit)
  let before: Awaited<ReturnType<typeof credential>>
  try {
    assert.notEqual((await session.call('getAccount', { currency: 'HKD' })).isError, true)
    before = await credential(session.home)
    await claims(before.value.access_token)
  } finally {
    await session.close()
  }
  // Change only the host's local expiry cache, never the signed JWT or AS state.
  before.value.expires_at = 1
  await writeFile(before.path, JSON.stringify(before.document), { mode: 0o600 })
  const client = new CodexClient(session.home, session.home, permit)
  try {
    await client.initialize()
    const thread = await client.request('thread/start', {
      cwd: session.home,
      ephemeral: true,
      approvalPolicy: 'never',
    })
    const result = await client.request('mcpServer/tool/call', {
      threadId: (thread.thread as RecordValue).id,
      server: 'tqx',
      tool: 'getAccount',
      arguments: { currency: 'HKD' },
    })
    assert.notEqual(result.isError, true)
    const after = await credential(session.home)
    assert(
      after.value.access_token !== before.value.access_token,
      'Actual client did not rotate its source token',
    )
    assert(
      after.value.refresh_token !== before.value.refresh_token,
      'Actual client did not rotate its refresh token',
    )
    const oldClaims = await claims(before.value.access_token)
    const newClaims = await claims(after.value.access_token)
    assert.notEqual(newClaims.sid, oldClaims.sid)
    assert.notEqual(newClaims.jti, oldClaims.jti)
    assert.equal(newClaims.grant_id, oldClaims.grant_id)
    assert.equal(newClaims.client_id, oldClaims.client_id)
    const oldRead = await probe(before.value.access_token)
    const newRead = await probe(after.value.access_token)
    assert.equal(oldRead.status, 401)
    assert.equal(newRead.status, 200)
    assert.notEqual((newRead.body.result as RecordValue).isError, true)
    const state = {
      synthetic: true,
      mode: 'PAPER',
      broker: 'fake',
      generation: ready.generation,
      fixtureNamespace: ready.fixtureNamespace,
      issuer: target.issuer,
      resource: target.resource,
      uid: user.uid,
      agentId: user.agentId,
      grantId: newClaims.grant_id,
      clientId: newClaims.client_id,
      oldSource: before.value.access_token,
      newSource: after.value.access_token,
    }
    const statePath = resolve(session.home, 'refresh-state.private.json')
    const sourcePath = resolve(session.home, 'source.private.json')
    await writeFile(statePath, JSON.stringify(state), { flag: 'wx', mode: 0o600 })
    await writeFile(
      sourcePath,
      JSON.stringify({
        access_token: after.value.access_token,
        issuer: target.issuer,
        resource: target.resource,
        uid: user.uid,
        agentId: user.agentId,
        grantId: newClaims.grant_id,
      }),
      { flag: 'wx', mode: 0o600 },
    )
    const report = {
      status: 'passed',
      actualCodex: true,
      clientKind: 'installed-app-server',
      cacheExpiryOnly: true,
      newSourceAndRefreshToken: true,
      sameGrantUidAgentClient: true,
      newSidAndJti: true,
      signedOldSourceStillUnexpired: true,
      oldSourceStatus: oldRead.status,
      newSourceStatus: newRead.status,
      revocation: 'pending-owner-exact-grant-control',
      statePath,
      sourcePath,
    }
    await writeFile(resolve(session.home, 'refresh-report.private.json'), JSON.stringify(report), {
      flag: 'wx',
      mode: 0o600,
    })
    console.log(JSON.stringify(report))
  } finally {
    await client.close()
  }
} else {
  const statePath = await realpath(resolve(process.argv[3] ?? ''))
  const root = await realpath(resolve(import.meta.dirname, 'work/live'))
  assert(
    statePath.toLowerCase().startsWith(`${root}${sep}`.toLowerCase()) &&
      basename(statePath) === 'refresh-state.private.json',
  )
  const state = JSON.parse(await readFile(statePath, 'utf8')) as RecordValue
  assert.equal(state.generation, ready.generation)
  assert.equal(state.fixtureNamespace, ready.fixtureNamespace)
  assert.equal(state.issuer, target.issuer)
  assert.equal(state.resource, target.resource)
  assert.equal(state.uid, user.uid)
  assert.equal(state.agentId, user.agentId)
  assert.equal(state.synthetic, true)
  assert.equal(state.mode, 'PAPER')
  assert.equal(state.broker, 'fake')
  const oldClaims = await claims(String(state.oldSource))
  const newClaims = await claims(String(state.newSource))
  assert.equal(newClaims.grant_id, state.grantId)
  assert.equal(oldClaims.grant_id, state.grantId)
  const oldRead = await probe(String(state.oldSource))
  const newRead = await probe(String(state.newSource))
  assert.equal(oldRead.status, 401)
  assert.equal(newRead.status, 401)
  const report = {
    status: 'passed',
    actualCodexRefresh: true,
    ownerControlledExactGrantRevocation: true,
    bothSignedSourcesStillUnexpired: true,
    oldSourceStatus: oldRead.status,
    newSourceStatusAfterRevocation: newRead.status,
    verificationSurface: 'direct-protected-MCP-getAccount',
    statePath,
  }
  await writeFile(
    resolve(statePath, '..', 'revocation-report.private.json'),
    JSON.stringify(report),
    { flag: 'wx', mode: 0o600 },
  )
  console.log(JSON.stringify(report))
}
