import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { CodexClient, type RecordValue } from './client'
import { clientTarget, expectedTools, targetConfig } from './target'
import { ownerReady } from './v2-ready'
import { assertLiveIntegrationAllowed } from './local-policy'

assertLiveIntegrationAllowed()

// Opt-in runner for the already-running Owner environment. Never starts or seeds services.
const target = clientTarget()
const v2 =
  target.profile === 'v2' ? await ownerReady(target, process.env.TQX_CODEX_READY) : undefined
const fixturesPath = v2?.fixtureData ?? process.env.TQX_CODEX_SYNTHETIC_FIXTURES
assert(fixturesPath, 'Set TQX_CODEX_SYNTHETIC_FIXTURES to the Owner private fixture path')
const { resource, issuer, scopes } = target
for (const endpoint of [
  new URL('/healthz', resource).href,
  new URL('/.well-known/oauth-authorization-server', issuer).href,
]) {
  assert(
    (await fetch(endpoint, { redirect: 'manual', signal: AbortSignal.timeout(3000) })).ok,
    'Owner environment not ready',
  )
}
const metadata = (await (
  await fetch(new URL('/.well-known/oauth-authorization-server', issuer), { redirect: 'manual' })
).json()) as RecordValue
assert.equal(metadata.issuer, issuer)
assert.equal(metadata.authorization_response_iss_parameter_supported, true)
const fixture = JSON.parse(await readFile(fixturesPath, 'utf8')) as {
  synthetic: boolean
  users: { uid: string; agentId: string; webAccessToken: string }[]
}
assert.equal(fixture.synthetic, true)
const user = fixture.users[0]
assert(user)
const repo = resolve(import.meta.dirname, '../..')
const runs = resolve(repo, 'work/codex/runs')
await mkdir(runs, { recursive: true })
const home = await mkdtemp(resolve(runs, 'owner-'))
const useProvidedClient = process.argv.includes('--provided-public-client')
let publicClientId: string | undefined
if (useProvidedClient) {
  const registration = await fetch(new URL('/oauth/register', issuer), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Codex public local acceptance',
      redirect_uris: ['http://127.0.0.1/callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      ...(target.profile === 'v2' ? { scope: scopes.join(' ') } : {}),
    }),
  })
  assert.equal(registration.status, 201)
  const registered = (await registration.json()) as RecordValue
  assert.equal(typeof registered.client_id, 'string')
  publicClientId = registered.client_id as string
}
await writeFile(
  resolve(home, 'config.toml'),
  `${targetConfig(target)}${publicClientId ? `[mcp_servers.tqx.oauth]\nclient_id = ${JSON.stringify(publicClientId)}\ncallback_url = "http://127.0.0.1/callback"\n` : ''}`,
)
const client = new CodexClient(home, home)
const evidence: RecordValue[] = []
try {
  await client.initialize()
  for (const approved of [false, true]) {
    const login = await client.request('mcpServer/oauth/login', {
      name: 'tqx',
      scopes,
      clientRegistration: 'auto',
      timeoutSecs: 30,
    })
    const authUrl = new URL(String(login.authorizationUrl))
    assert.deepEqual(
      (authUrl.searchParams.get('scope') ?? '').split(' ').sort(),
      [...scopes].sort(),
    )
    assert.equal(authUrl.searchParams.get('resource'), resource)
    assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256')
    const callback = new URL(authUrl.searchParams.get('redirect_uri') ?? '')
    assert.equal(callback.pathname, '/callback')
    assert(callback.port)
    const authorization = await fetch(authUrl, { redirect: 'manual' })
    assert.equal(authorization.status, 302)
    const consentUrl = new URL(authorization.headers.get('location') ?? '')
    const tx = consentUrl.searchParams.get('tx')
    assert(tx, 'Expected TQX web consent transaction')
    const decision: Response = await fetch(
      new URL(`/oauth/tx/${encodeURIComponent(tx)}/decision`, issuer),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${user.webAccessToken}`,
        },
        body: JSON.stringify({
          approved,
          ...(approved ? { agent_id: user.agentId } : {}),
        }),
      },
    )
    assert.equal(decision.status, 200)
    const result = (await decision.json()) as RecordValue
    const redirect = new URL(String(result.redirect_to))
    assert.equal(redirect.searchParams.getAll('iss').length, 1)
    assert.equal(redirect.searchParams.get('iss'), issuer)
    await fetch(redirect, { signal: AbortSignal.timeout(3000) })
      .then((r) => r.body?.cancel())
      .catch(() => undefined)
    const completion = await client.loginCompletion(login.loginId)
    assert.equal(completion.success, approved)
    evidence.push({
      case: approved ? 'actual-as-codex-approved' : 'actual-as-codex-denied',
      pass: true,
      redirectHost: callback.hostname,
      redirectPath: callback.pathname,
      dynamicPort: true,
      registration: publicClientId
        ? 'pre-registered public; RFC8252 dynamic port'
        : 'auto; AS advertises DCR',
      redirectUri: `${callback.origin}${callback.pathname}`,
      syntheticWebDecision: true,
    })
  }
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
  const server = (inventory.data as RecordValue[])[0]
  assert(server)
  assert.deepEqual(Object.keys(server.tools as RecordValue).sort(), expectedTools(target).sort())
  for (const tool of scopes.includes('trade:read') ? ['getAccount', 'listPositions'] : []) {
    const result = await client.request('mcpServer/tool/call', {
      threadId,
      server: 'tqx',
      tool,
      arguments: {},
    })
    assert(!result.isError)
    evidence.push({
      case: `actual-as-mcp-sdk-trading-${tool}`,
      pass: true,
      syntheticIdentity: true,
    })
  }
  const report = {
    profile: target.profile,
    scopes,
    surface: 'installed Codex app-server; no desktop UI or browser/Java login',
    identity: 'Owner synthetic Web/Agent; real isolated AS and Trading apps; fake broker',
    evidence,
  }
  await writeFile(resolve(home, 'evidence.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(
    `PASS actual Owner environment; sanitized evidence: ${resolve(home, 'evidence.json')}`,
  )
} catch (error) {
  await writeFile(
    resolve(home, 'failure.private.json'),
    JSON.stringify({ failure: client.lastFailure }),
  )
  console.log(`Private diagnostic: ${resolve(home, 'failure.private.json')}`)
  throw error
} finally {
  await client.close()
}
