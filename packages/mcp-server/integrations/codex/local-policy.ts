import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath } from 'node:fs/promises'
import { realpathSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { ownerReady, type V2Ready } from './v2-ready'
import { targetConfig, type ClientTarget } from './target'

export interface LivePermit {
  readonly ready: V2Ready
  readonly target: ClientTarget
  readonly runs: string
}
const permits = new WeakSet<LivePermit>()

export function assertLiveIntegrationAllowed(permit?: LivePermit): asserts permit is LivePermit {
  assert(
    permit && permits.has(permit),
    'Live integration requires explicit isolated-test opt-in and fresh Owner READY',
  )
  assert(
    Date.parse(permit.ready.expiresAt) > Date.now(),
    'Owner READY expired; stop new operations',
  )
}

// This is the only permit factory. Legacy harnesses remain closed by default.
export async function authorizeLiveIntegration(
  target: ClientTarget,
  env: Record<string, string | undefined> = process.env,
) {
  assert.equal(
    env.TQX_CODEX_LIVE,
    'isolated-test',
    'Explicit isolated-test live opt-in is required',
  )
  assert(
    env.TQX_CODEX_GENERATION && env.TQX_CODEX_NAMESPACE,
    'Bind generation and namespace independently of READY',
  )
  const owner = await ownerReady(target, env.TQX_CODEX_READY)
  assert.equal(owner.ready.generation, env.TQX_CODEX_GENERATION)
  assert.equal(owner.ready.fixtureNamespace, env.TQX_CODEX_NAMESPACE)
  const root = resolve(import.meta.dirname, 'work/live')
  await mkdir(root, { recursive: true, mode: 0o700 })
  assert.equal(
    (await realpath(root)).toLowerCase(),
    root.toLowerCase(),
    'Client private root cannot redirect through a symlink',
  )
  const runs = await mkdtemp(resolve(root, `${owner.ready.generation}-`))
  assert.equal((await realpath(runs)).toLowerCase(), runs.toLowerCase())
  const permit = Object.freeze({
    ready: Object.freeze(owner.ready),
    target: Object.freeze({
      ...target,
      scopes: Object.freeze([...target.scopes]) as unknown as ClientTarget['scopes'],
    }),
    runs,
  })
  permits.add(permit)
  return { ...owner, permit }
}

export function assertClientIsolation(permit: LivePermit | undefined, home: string, cwd: string) {
  assertLiveIntegrationAllowed(permit)
  const actual = realpathSync(home)
  assert.equal(actual.toLowerCase(), resolve(home).toLowerCase())
  assert.equal(resolve(cwd).toLowerCase(), actual.toLowerCase())
  assert(
    actual.toLowerCase().startsWith(`${permit.runs}${sep}`.toLowerCase()),
    'Client HOME escapes permitted private root',
  )
  const config = readFileSync(resolve(actual, 'config.toml'), 'utf8')
  const roles: ClientTarget['scopes'][] = [
    ['trade:read'],
    ['order:write'],
    ['trade:read', 'order:write'],
  ]
  assert(
    roles.some(
      (scopes) =>
        scopes.every((scope) => permit.target.scopes.includes(scope)) &&
        config === targetConfig({ ...permit.target, scopes }),
    ),
    'Client config differs from READY-bound configuration',
  )
}

export function isolatedClientEnvironment(home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const key of ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'COMSPEC'])
    if (process.env[key]) env[key] = process.env[key]
  return {
    ...env,
    CODEX_HOME: home,
    HOME: home,
    USERPROFILE: home,
    APPDATA: resolve(home, 'appdata'),
    LOCALAPPDATA: resolve(home, 'localappdata'),
    TMP: resolve(home, 'tmp'),
    TEMP: resolve(home, 'tmp'),
    NO_PROXY: '127.0.0.1,localhost,::1',
    no_proxy: '127.0.0.1,localhost,::1',
  }
}
