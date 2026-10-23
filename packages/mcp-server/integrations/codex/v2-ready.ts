import assert from 'node:assert/strict'
import { isAbsolute, resolve, sep } from 'node:path'
import { readFile } from 'node:fs/promises'
import { expectedTools, type ClientTarget, type TradingScope } from './target'

export interface V2Ready {
  schemaVersion: 1
  contract: 'tqx-mcp-v2'
  ready: true
  generation: string
  expiresAt: string
  synthetic: true
  mode: 'PAPER'
  broker: 'fake'
  issuer: string
  mcpResource: string
  apiResource: string
  redis: { host: '127.0.0.1'; port: 16379; db: 0; prefix: 'tqx_v2:' }
  mongo: { database: 'tqx_mcp_full_it' }
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
    'expiresAt',
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
  assert.equal(ready.schemaVersion, 1)
  assert.equal(ready.contract, 'tqx-mcp-v2')
  assert.equal(ready.ready, true)
  assert.equal(ready.synthetic, true)
  assert.equal(ready.mode, 'PAPER')
  assert.equal(ready.broker, 'fake')
  assert(typeof ready.generation === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(ready.generation))
  const expires = Date.parse(ready.expiresAt)
  assert(
    expires > now && expires <= now + 86_400_000,
    'READY is expired or exceeds a 24-hour fixture window',
  )
  assert.equal(ready.issuer, target.issuer)
  assert.equal(ready.mcpResource, target.resource)
  assert.equal(ready.apiResource, target.apiResource)
  assert.deepEqual(ready.redis, { host: '127.0.0.1', port: 16379, db: 0, prefix: 'tqx_v2:' })
  assert.deepEqual(ready.mongo, { database: 'tqx_mcp_full_it' })
  assert.deepEqual([...ready.scopes].sort(), ['order:write', 'trade:read'])
  assert.deepEqual(
    [...ready.tools].sort(),
    expectedTools({ ...target, scopes: ['trade:read', 'order:write'] }),
  )
  assert(typeof ready.controlDir === 'string' && typeof ready.fixtureData === 'string')
  return ready
}
export async function ownerReady(target: ClientTarget, markerPath: string | undefined) {
  assert(
    markerPath,
    'Set TQX_CODEX_READY to the private Owner READY file; no endpoint has been contacted',
  )
  const path = resolve(markerPath)
  const ready = validateV2Ready(JSON.parse(await readFile(path, 'utf8')), target)
  const directory = resolve(path, '..')
  return {
    ready,
    fixtureData: localFixturePath(directory, ready.fixtureData),
    controlDir: localFixturePath(directory, ready.controlDir),
  }
}
