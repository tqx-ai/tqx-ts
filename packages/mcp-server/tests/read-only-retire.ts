import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { privateReadPath } from './read-only-private'
import { checkReadPermit } from './read-only-runner'

// This entry is only for Root-authorized retirement of this run's four newly issued B grants.
// It calls the EXISTING AS INTERNAL function, never invents a public HTTP endpoint or ad-hoc HSET.
async function main() {
  const { values } = parseArgs({
    options: {
      'retire-B': { type: 'boolean' },
      generation: { type: 'string' },
      expires: { type: 'string' },
      private: { type: 'string' },
      profile: { type: 'string' },
      receipt: { type: 'string' },
      outputs: { type: 'string' },
    },
  })
  if (!values['retire-B']) throw new Error('Explicit B retirement opt-in required')
  checkReadPermit(
    {
      approved: true,
      phase: 'B',
      subject: '740001',
      generation: values.generation ?? '',
      expiresAt: Date.parse(values.expires ?? ''),
      maxToolObservationsPerMinute: 20,
    },
    values.generation ?? '',
  )
  if (!values.private || !values.profile || !values.receipt || !values.outputs)
    throw new Error('Missing private retirement input')
  const load = async (path: string) =>
    JSON.parse(await readFile(await privateReadPath(values.private!, path), 'utf8')) as unknown
  const contract = z
    .object({
      testOnly: z.literal(true),
      generation: z.literal(values.generation),
      namespace: z.string(),
      redisPrefix: z.string(),
      issuer: z.string(),
      mcpResource: z.string(),
    })
    .parse(await load(resolve(values.private, 'run-contract.json')))
  const profile = z
    .object({
      testOnly: z.literal(true),
      generation: z.literal(values.generation),
      oauthRepository: z.string(),
      env: z.record(z.string(), z.string()),
    })
    .parse(await load(values.profile))
  const redisProfile = z
    .object({
      redis: z.object({
        host: z.literal('127.0.0.1'),
        port: z.literal(16380),
        db: z.number().int(),
      }),
    })
    .parse(await load(resolve(values.private, 'redis.json')))
  const entry = z.object({
    uid: z.literal('740001'),
    agentId: z.literal('java-owner-7648d1b4'),
    sessionId: z.string(),
    grantId: z.string(),
    sourceJti: z.string(),
    clientId: z.string(),
    scope: z.string(),
    refreshed: z.boolean().optional(),
  })
  const receipt = z
    .object({
      testOnly: z.literal(true),
      phase: z.literal('B'),
      generation: z.literal(values.generation),
      subject: z.literal('740001'),
      binding: z.object({ uid: z.literal('740001'), agentId: z.literal('java-owner-7648d1b4') }),
      allowedOAuth: z.array(entry),
    })
    .parse(await load(values.receipt))
  const grants = new Map<string, z.infer<typeof entry>>()
  for (const item of receipt.allowedOAuth)
    if (!grants.has(item.grantId) || item.refreshed) grants.set(item.grantId, item)
  assert.equal(grants.size, 4)
  // Only the explicit private AS profile is injected. No dotenv or implicit local/prod selection.
  const system = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      ['SystemRoot', 'WINDIR', 'PATH', 'Path', 'PATHEXT', 'COMSPEC'].includes(key),
    ),
  )
  for (const key of Object.keys(process.env)) delete process.env[key]
  Object.assign(process.env, system, profile.env)
  const settingsModule = await import(
    pathToFileURL(resolve(profile.oauthRepository, 'src/config/settings.ts')).href
  )
  const settings = settingsModule.getSettings() as {
    redisUri: string
    redisDb: number
    redisPrefix: string
    issuer: string
    mcpResource: string
    mode: string
  }
  const uri = new URL(settings.redisUri)
  assert.equal(uri.protocol, 'redis:')
  assert.equal(uri.hostname, '127.0.0.1')
  assert.equal(uri.port, '16380')
  assert.equal(settings.redisDb, redisProfile.redis.db)
  assert.equal(settings.redisPrefix, contract.redisPrefix)
  assert.equal(settings.redisPrefix, contract.namespace + ':')
  assert.equal(settings.issuer, contract.issuer)
  assert.equal(settings.mcpResource, contract.mcpResource)
  assert.equal(settings.mode, 'test')
  const redisModule = await import(
    pathToFileURL(resolve(profile.oauthRepository, 'src/utils/databases/redis.ts')).href
  )
  const sessions = await import(
    pathToFileURL(resolve(profile.oauthRepository, 'src/oauth/sessions.ts')).href
  )
  await redisModule.connectRedis()
  const records: {
    entry: z.infer<typeof entry>
    before: Record<string, string>
    session: Record<string, string>
    after?: Record<string, string>
  }[] = []
  try {
    // Validate the complete finite set before the first mutation. Never discover grants by scanning.
    for (const item of grants.values()) {
      const grant = (await sessions.getGrant(item.grantId)) as Record<string, string> | null
      const session = (await sessions.getSession(item.sessionId)) as Record<string, string> | null
      assert(grant && session)
      for (const record of [grant, session]) {
        assert.equal(record.uid, '740001')
        assert.equal(record.agent_id, receipt.binding.agentId)
        assert.equal(record.client_id, item.clientId)
        assert.equal(record.resource, contract.mcpResource)
        assert.equal(record.scope, item.scope)
      }
      assert.equal(session.grant_id, item.grantId)
      assert.equal(session.jti, item.sourceJti)
      assert.equal(session.status, 'active')
      assert.equal(grant.expires_at, session.expires_at)
      assert(['active', 'revoked'].includes(grant.status!))
      records.push({ entry: item, before: grant, session })
    }
    assert.equal(records.filter((record) => record.before.status === 'active').length, 3)
    assert.equal(records.filter((record) => record.before.status === 'revoked').length, 1)
    for (const record of records) {
      if (record.before.status === 'active') await sessions.revokeGrant(record.entry.grantId)
      const after = (await sessions.getGrant(record.entry.grantId)) as Record<string, string>
      assert.equal(after.status, 'revoked')
      assert.deepEqual({ ...after, status: record.before.status }, record.before)
      record.after = after
    }
    await writeFile(
      resolve(values.private, 'read-b-grant-retirement.private.json'),
      JSON.stringify(
        {
          generation: contract.generation,
          mechanism: 'existing internal AS revokeGrant service function; not HTTP',
          records,
        },
        null,
        2,
      ),
      { flag: 'wx', mode: 0o600 },
    )
    const report = {
      schemaVersion: 1,
      testOnly: true,
      phase: 'B',
      generation: contract.generation,
      mechanism: 'existing internal AS revokeGrant service function',
      publicHttpRevocationAcceptance: false,
      exactNewGrantCount: 4,
      retiredActiveGrants: 3,
      alreadyRevokedNotRepeated: 1,
      identityAndSessionChecksPassed: true,
      connectionProfileVerified: true,
      allFourNowRevoked: true,
      personalOrOtherGrantsTouched: false,
      auditOrBusinessDataDeleted: false,
      tradingCalls: 0,
      credentialsPrinted: false,
    }
    const output = resolve(values.outputs, 'mcp-read-b-grant-retirement-20261025.json')
    await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
    console.log(JSON.stringify({ ok: true, publicReport: output, ...report }))
  } finally {
    await redisModule.closeRedis()
  }
}
try {
  await main()
} catch {
  console.error('B grant retirement stopped; no credential or identity details printed')
  process.exitCode = 1
}
