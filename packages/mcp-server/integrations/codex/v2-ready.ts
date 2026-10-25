import assert from 'node:assert/strict'
import { isAbsolute, resolve, sep } from 'node:path'
import { readFile, realpath } from 'node:fs/promises'
import { expectedTools, type ClientTarget, type TradingScope } from './target'

export interface V2Ready {
  schemaVersion: 2
  contract: 'tqx-mcp-v2'
  ready: true
  generation: string
  issuedAt: string
  expiresAt: string
  fixtureNamespace: string
  synthetic: true
  mode: 'PAPER'
  broker: 'fake'
  issuer: string
  mcpResource: string
  apiResource: string
  redis: { host: '127.0.0.1'; port: number; db: number; prefix: string }
  mongo: { database: string }
  scopes: TradingScope[]
  tools: string[]
  controlDir: string
  fixtureData: string
}
export function localFixturePath(directory: string, relative: string): string {
  assert(
    relative && !isAbsolute(relative) && !relative.includes(':'),
    'Fixture paths must be local relative paths',
  )
  const path = resolve(directory, relative)
  assert(
    path.startsWith(`${resolve(directory)}${sep}`),
    'Fixture path escapes its private directory',
  )
  return path
}
export function validateV2Ready(raw: unknown, target: ClientTarget, now = Date.now()): V2Ready {
  assert.equal(target.profile, 'v2')
  assert(raw && typeof raw === 'object' && !Array.isArray(raw), 'Missing Owner READY record')
  const ready = raw as V2Ready
  const fields = new Set([
    'schemaVersion',
    'contract',
    'ready',
    'generation',
    'issuedAt',
    'expiresAt',
    'fixtureNamespace',
    'synthetic',
    'mode',
    'broker',
    'issuer',
    'mcpResource',
    'apiResource',
    'redis',
    'mongo',
    'scopes',
    'tools',
    'controlDir',
    'fixtureData',
  ])
  assert(
    Object.keys(ready).every((key) => fields.has(key)),
    'Unknown READY field; secrets are not accepted',
  )
  assert.equal(ready.schemaVersion, 2, 'Old READY schemas cannot enable live execution')
  assert.equal(ready.contract, 'tqx-mcp-v2')
  assert.equal(ready.ready, true)
  assert.equal(ready.synthetic, true)
  assert.equal(ready.mode, 'PAPER')
  assert.equal(ready.broker, 'fake')
  assert(
    typeof ready.generation === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(ready.generation),
  )
  assert(/^tqx_v2_\d{8}_[A-Za-z0-9_-]{6,64}$/.test(ready.fixtureNamespace))
  const issued = Date.parse(ready.issuedAt)
  const expires = Date.parse(ready.expiresAt)
  assert(
    issued <= now + 5000 &&
      issued >= now - 1_800_000 &&
      expires > now &&
      expires <= issued + 7_200_000,
    'READY must be freshly issued within 30 minutes with a maximum two-hour window',
  )
  assert(
    ready.fixtureNamespace.startsWith(`tqx_v2_${ready.issuedAt.slice(0, 10).replaceAll('-', '')}_`),
  )
  assert.equal(ready.issuer, target.issuer)
  assert.equal(ready.mcpResource, target.resource)
  assert.equal(ready.apiResource, target.apiResource)
  for (const resource of [ready.issuer, ready.mcpResource, ready.apiResource])
    assert(new URL(resource).port, 'READY endpoints need explicit fixture ports')
  assert.equal(ready.redis.host, '127.0.0.1')
  assert(Number.isInteger(ready.redis.port) && ready.redis.port > 0 && ready.redis.port <= 65535)
  assert(Number.isInteger(ready.redis.db) && ready.redis.db >= 0 && ready.redis.db <= 15)
  assert.equal(ready.redis.prefix, `${ready.fixtureNamespace}:`)
  assert.deepEqual(Object.keys(ready.redis).sort(), ['db', 'host', 'port', 'prefix'])
  assert.deepEqual(ready.mongo, { database: ready.fixtureNamespace })
  assert.deepEqual([...ready.scopes].sort(), ['order:write', 'trade:read'])
  assert.deepEqual(
    [...ready.tools].sort(),
    expectedTools({ ...target, scopes: ['trade:read', 'order:write'] }),
  )
  assert(typeof ready.controlDir === 'string' && typeof ready.fixtureData === 'string')
  localFixturePath('private', ready.controlDir)
  localFixturePath('private', ready.fixtureData)
  return ready
}
export async function ownerReady(target: ClientTarget, markerPath: string | undefined) {
  assert(
    markerPath,
    'Set TQX_CODEX_READY to the private Owner READY file; no endpoint has been contacted',
  )
  const path = resolve(markerPath)
  assert(
    path.split(/[\\/]/).includes('work'),
    'Owner READY must live in an ignored private work directory',
  )
  const ready = validateV2Ready(JSON.parse(await readFile(path, 'utf8')), target)
  const directory = await realpath(resolve(path, '..'))
  assert.equal(
    (await realpath(path)).toLowerCase(),
    resolve(directory, path.split(/[\\/]/).at(-1)!).toLowerCase(),
  )
  const fixtureData = await realpath(localFixturePath(directory, ready.fixtureData))
  const controlDir = await realpath(localFixturePath(directory, ready.controlDir))
  for (const actual of [fixtureData, controlDir])
    assert(
      actual.toLowerCase().startsWith(`${directory}${sep}`.toLowerCase()),
      'Private fixture symlink escapes READY directory',
    )
  return {
    ready,
    fixtureData,
    controlDir,
  }
}
