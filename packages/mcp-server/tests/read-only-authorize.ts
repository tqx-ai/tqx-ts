import { randomBytes, createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { decodeJwt } from 'jose'
import { z } from 'zod'
import { checkReadPermit, type ReadPermit } from './read-only-runner'
import { privateReadPath } from './read-only-private'
import { verifyReadControlSource } from './read-only-client'

// Explicit preparation only: no MCP/Trading request, plugin cache, database or broker operation.
async function main() {
  const { values } = parseArgs({
    options: {
      'prepare-B': { type: 'boolean' },
      generation: { type: 'string' },
      expires: { type: 'string' },
      private: { type: 'string' },
      contract: { type: 'string' },
      fixtures: { type: 'string' },
    },
  })
  const permit: ReadPermit = {
    approved: true,
    phase: 'B',
    subject: '740001',
    generation: values.generation ?? '',
    expiresAt: Date.parse(values.expires ?? ''),
    maxToolObservationsPerMinute: 20,
  }
  if (!values['prepare-B']) throw new Error('Explicit B source preparation required')
  checkReadPermit(permit, permit.generation)
  if (!values.private || !values.contract || !values.fixtures)
    throw new Error('Missing B private input')
  const contract = z
    .object({
      testOnly: z.literal(true),
      generation: z.literal(permit.generation),
      namespace: z.string(),
      issuer: z.literal('http://127.0.0.1:26825'),
      mcpResource: z.literal('http://127.0.0.1:3004/mcp'),
      webOrigin: z.string(),
    })
    .parse(
      JSON.parse(await readFile(await privateReadPath(values.private, values.contract), 'utf8')),
    )
  const document = JSON.parse(
    await readFile(await privateReadPath(values.private, values.fixtures), 'utf8'),
  ) as { synthetic?: boolean; generation?: string; users?: { uid?: unknown }[] }
  if (
    !document.synthetic ||
    document.generation !== permit.generation ||
    !Array.isArray(document.users)
  )
    throw new Error('Wrong B fixture generation')
  const primaryUsers = document.users.filter((user) => user.uid === '740001')
  if (primaryUsers.length !== 1) throw new Error('Missing unique isolated primary')
  const primary = z
    .object({
      uid: z.literal('740001'),
      agentId: z.string().min(1),
      accountId: z.string().min(1),
      brokerUserId: z.string().min(1),
      webAccessToken: z.string().min(1),
    })
    .parse(primaryUsers[0])
  const directory = resolve(values.private, `read-b-${randomUUID()}`)
  await mkdir(directory, { mode: 0o700 })
  const target = {
    schemaVersion: 1,
    testOnly: true,
    phase: 'B',
    generation: permit.generation,
    namespace: contract.namespace,
    subject: '740001',
    issuer: contract.issuer,
    resource: contract.mcpResource,
  }
  const save = (name: string, value: unknown) =>
    writeFile(resolve(directory, name), `${JSON.stringify(value, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    })
  async function request(path: string, init: RequestInit) {
    checkReadPermit(permit, permit.generation)
    const url = new URL(path, contract.issuer)
    if (url.origin !== contract.issuer) throw new Error('B OAuth target escaped issuer')
    const response = await fetch(url, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error('B OAuth request rejected')
    }
    return (await response.json()) as Record<string, unknown>
  }
  async function authorize(role: string, scope: string) {
    const registration = await request('/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: `READ B ${role}`,
        redirect_uris: ['http://127.0.0.1:45789/callback'],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        scope,
      }),
    })
    if (typeof registration.client_id !== 'string') throw new Error('B client registration invalid')
    const clientId = registration.client_id,
      redirectUri = 'http://127.0.0.1:45789/callback'
    const verifier = randomBytes(32).toString('base64url'),
      state = randomBytes(24).toString('base64url')
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      resource: contract.mcpResource,
      state,
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    })
    const authorization = await fetch(`${contract.issuer}/oauth/authorize?${query}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    })
    await authorization.body?.cancel()
    if (authorization.status !== 302) throw new Error('B authorization did not reach consent')
    const consent = new URL(authorization.headers.get('location') ?? '')
    if (consent.origin !== new URL(contract.webOrigin).origin || !consent.searchParams.get('tx'))
      throw new Error('B consent target mismatch')
    const decision = await request(
      `/oauth/tx/${encodeURIComponent(consent.searchParams.get('tx')!)}/decision`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${primary.webAccessToken}`,
        },
        body: JSON.stringify({ approved: true, agent_id: primary.agentId }),
      },
    )
    const callback = new URL(String(decision.redirect_to))
    if (
      callback.origin + callback.pathname !== redirectUri ||
      callback.searchParams.get('iss') !== contract.issuer ||
      callback.searchParams.getAll('code').length !== 1 ||
      callback.searchParams.get('state') !== state ||
      callback.searchParams.has('error')
    )
      throw new Error('B consent callback mismatch')
    const tokens = await request('/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: callback.searchParams.get('code')!,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        resource: contract.mcpResource,
      }),
    })
    if (typeof tokens.access_token !== 'string' || typeof tokens.refresh_token !== 'string')
      throw new Error('B OAuth tokens missing')
    await verifyReadControlSource(target, tokens.access_token, AbortSignal.timeout(5000))
    const claims = decodeJwt(tokens.access_token)
    if (
      claims.sub !== '740001' ||
      claims.agent_id !== primary.agentId ||
      claims.client_id !== clientId ||
      claims.scope !== scope
    )
      throw new Error('B OAuth source binding mismatch')
    for (const key of ['sid', 'grant_id', 'jti'])
      if (typeof claims[key] !== 'string' || !claims[key])
        throw new Error('B OAuth identity missing')
    const receipt = {
      role,
      uid: '740001',
      agentId: primary.agentId,
      sessionId: claims.sid,
      grantId: claims.grant_id,
      sourceJti: claims.jti,
      clientId,
      scope,
      expiresAt: claims.exp,
    }
    await save(`${role}.tokens.private.json`, tokens)
    return { tokens, receipt }
  }
  const read = await authorize('read', 'trade:read')
  // Publish the first receipt early. A later role failure cannot lose an issued grant's ownership record.
  await save('primary-read.receipt.json', {
    ...target,
    synthetic: true,
    mode: 'PAPER',
    broker: 'fake',
    binding: {
      uid: '740001',
      agentId: primary.agentId,
      accountId: primary.accountId,
      brokerUserId: primary.brokerUserId,
      brokerCompanyId: '4',
    },
    allowedOAuth: [read.receipt],
  })
  const writeOnly = await authorize('write-only', 'order:write')
  const revoked = await authorize('revoke-candidate', 'trade:read')
  const old = await authorize('refresh-old', 'trade:read')
  const refreshed = await request('/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: String(old.tokens.refresh_token),
      client_id: old.receipt.clientId,
      resource: contract.mcpResource,
    }),
  })
  if (typeof refreshed.access_token !== 'string') throw new Error('B refresh failed')
  await verifyReadControlSource(target, refreshed.access_token, AbortSignal.timeout(5000))
  const newClaims = decodeJwt(refreshed.access_token)
  if (
    newClaims.sub !== '740001' ||
    newClaims.agent_id !== primary.agentId ||
    newClaims.grant_id !== old.receipt.grantId ||
    newClaims.sid === old.receipt.sessionId ||
    newClaims.jti === old.receipt.sourceJti
  )
    throw new Error('B refresh binding mismatch')
  await save('refresh-current.tokens.private.json', refreshed)
  const refreshedReadReceipt = {
    role: 'read',
    uid: '740001',
    agentId: primary.agentId,
    sessionId: newClaims.sid,
    grantId: newClaims.grant_id,
    sourceJti: newClaims.jti,
    clientId: newClaims.client_id,
    scope: newClaims.scope,
    expiresAt: newClaims.exp,
    refreshed: true,
  }
  await save('target.json', target)
  await save('sources.json', {
    ...target,
    sources: {
      read: refreshed.access_token,
      'write-only': writeOnly.tokens.access_token,
      'refresh-old': old.tokens.access_token,
    },
  })
  const receiptPath = resolve(directory, 'sources.receipt.json')
  await save('sources.receipt.json', {
    ...target,
    synthetic: true,
    mode: 'PAPER',
    broker: 'fake',
    binding: {
      uid: '740001',
      agentId: primary.agentId,
      accountId: primary.accountId,
      brokerUserId: primary.brokerUserId,
      brokerCompanyId: '4',
    },
    allowedOAuth: [
      read.receipt,
      writeOnly.receipt,
      revoked.receipt,
      old.receipt,
      refreshedReadReceipt,
    ],
    revokeCandidatePending: true,
    expiredWrongAudienceNoScope: 'blocked-no-safely-isolated-source',
    identityEvidence: 'normal DCR/PKCE + synthetic primary Java WebJWT consent; no desktop UI',
  })
  console.log(
    JSON.stringify({
      ok: true,
      generation: permit.generation,
      receiptPath,
      privateDirectory: directory,
      secretsPrinted: false,
      tradingCalls: 0,
    }),
  )
}
try {
  await main()
} catch {
  console.error('B source preparation stopped; no credentials or internal errors printed')
  process.exitCode = 1
}
